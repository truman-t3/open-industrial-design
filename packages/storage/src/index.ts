import Dexie, { type Table } from 'dexie';
import {
  materializeCandidateResults,
  validateGenerationInput,
  type CandidateNode,
} from '@open-industrial-design/design-model';
import type {
  ProviderConfig,
  ProviderConfigRepository,
  ProviderCredentialStore,
  ProviderCredentials,
} from '@open-industrial-design/ai-core';
import type {
  Asset,
  BaseNode,
  Board,
  CMFSet,
  CMFVariant,
  Design,
  DesignRelation,
  Edge,
  Generation,
  GenerationCandidate,
  GenerationNode,
  GraphViewState,
  Model3DNode,
  Project,
  ProjectRepository,
  SketchDocument,
  ViewSet,
} from '@open-industrial-design/design-model';
import type {
  ProjectArchiveData,
  ProjectArchiveSnapshot,
} from '@open-industrial-design/project-file';
import {
  ProjectArchiveError,
  validateProjectArchiveData,
} from '@open-industrial-design/project-file';

export interface AssetBlob {
  id: string;
  blob: Blob;
}
export interface GenerationInputBlob extends AssetBlob {
  projectId: string;
  generationId: string;
}

interface StoredProviderCredentials extends ProviderCredentials {
  id: string;
}

export interface PersistedProjectSnapshot {
  project: Project;
  board: Board;
  nodes: BaseNode[];
  /** Live workflow edges, including edges restored by the canvas undo/redo state. */
  edges?: Edge[];
}

export class OpenIndustrialDesignDatabase extends Dexie {
  projects!: Table<Project, string>;
  boards!: Table<Board, string>;
  nodes!: Table<BaseNode, string>;
  edges!: Table<Edge, string>;
  assets!: Table<Asset, string>;
  assetBlobs!: Table<AssetBlob, string>;
  designs!: Table<Design, string>;
  relations!: Table<DesignRelation, string>;
  viewSets!: Table<ViewSet, string>;
  cmfSets!: Table<CMFSet, string>;
  cmfVariants!: Table<CMFVariant, string>;
  generations!: Table<Generation, string>;
  candidates!: Table<GenerationCandidate, string>;
  candidateBlobs!: Table<AssetBlob, string>;
  generationInputBlobs!: Table<GenerationInputBlob, string>;
  sketchDocuments!: Table<SketchDocument, string>;
  graphViewStates!: Table<GraphViewState, string>;
  providerConfigs!: Table<ProviderConfig, string>;
  providerCredentials!: Table<StoredProviderCredentials, string>;

  constructor(name = 'open-industrial-design') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      boards: 'id, projectId',
      nodes: 'id, boardId',
      assets: 'id, projectId',
      assetBlobs: 'id',
      designs: 'id, projectId',
      relations: 'id, projectId',
      viewSets: 'id, projectId',
      cmfSets: 'id, projectId',
      cmfVariants: 'id, projectId',
      generations: 'id, projectId',
      sketchDocuments: 'id, projectId',
      graphViewStates: 'projectId',
    });
    this.version(2).stores({
      providerConfigs: 'id, type, enabled',
      providerCredentials: 'id',
    });
    this.version(3).stores({
      edges: 'id, boardId',
      candidates: 'id, projectId, boardId, generationNodeId',
      candidateBlobs: 'id',
    });
    this.version(4)
      .stores({})
      .upgrade(async (transaction) => {
        const boards = await transaction.table<Board>('boards').toArray();
        for (const board of boards) {
          let positions: Record<string, { x: number; y: number }> = {};
          try {
            const raw =
              typeof localStorage !== 'undefined' &&
              localStorage.getItem(`oid.canvas.candidate-positions.v1:${board.id}`);
            const parsed: unknown = raw ? JSON.parse(raw) : {};
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
              positions = parsed as typeof positions;
          } catch {
            /* Retain old keys; invalid optional positions do not block migration. */
          }
          const added = materializeCandidateResults(
            await transaction.table<BaseNode>('nodes').where('boardId').equals(board.id).toArray(),
            await transaction.table<Edge>('edges').where('boardId').equals(board.id).toArray(),
            await transaction
              .table<GenerationCandidate>('candidates')
              .where('boardId')
              .equals(board.id)
              .toArray(),
            positions,
          );
          await transaction.table('nodes').bulkPut(added.nodes);
          await transaction.table('edges').bulkPut(added.edges);
          await transaction.table('boards').put({
            ...board,
            nodeIds: [...new Set([...board.nodeIds, ...added.nodes.map((node) => node.id)])],
            edgeIds: [...new Set([...board.edgeIds, ...added.edges.map((edge) => edge.id)])],
          });
        }
        await transaction.table('projects').toCollection().modify({ schemaVersion: 6 });
      });
    this.version(5)
      .stores({ generationInputBlobs: 'id, projectId, generationId' })
      .upgrade(async (transaction) => {
        await transaction.table('projects').toCollection().modify({ schemaVersion: 7 });
      });
  }
}

/** Non-secret Provider settings live separately from project-domain tables. */
export class DexieProviderConfigRepository implements ProviderConfigRepository {
  constructor(private readonly database: OpenIndustrialDesignDatabase) {}
  list() {
    return this.database.providerConfigs.toArray();
  }
  get(id: string) {
    return this.database.providerConfigs.get(id);
  }
  save(config: ProviderConfig) {
    return this.database.providerConfigs.put(config).then(() => undefined);
  }
  delete(id: string) {
    return this.database.providerConfigs.delete(id);
  }
}

/** Remembered web keys are deliberately isolated from config and project data. */
export class DexieProviderCredentialStore implements ProviderCredentialStore {
  constructor(private readonly database: OpenIndustrialDesignDatabase) {}
  async get(configId: string) {
    const stored = await this.database.providerCredentials.get(configId);
    return stored ? { apiKey: stored.apiKey } : undefined;
  }
  set(configId: string, credentials: ProviderCredentials) {
    return this.database.providerCredentials
      .put({ id: configId, apiKey: credentials.apiKey })
      .then(() => undefined);
  }
  clear(configId: string) {
    return this.database.providerCredentials.delete(configId);
  }
}

async function saveGenerationStatus(database: OpenIndustrialDesignDatabase, value: Generation) {
  await database.transaction('rw', database.generations, async () => {
    const existing = await database.generations.get(value.id);
    if (existing && existing.projectId !== value.projectId)
      throw new Error('Generation project ownership is immutable.');
    if (JSON.stringify(existing?.inputSnapshots) !== JSON.stringify(value.inputSnapshots))
      throw new Error('Generation input snapshots are immutable; use atomic input persistence.');
    await database.generations.put(value);
  });
}

export class DexieProjectRepository implements ProjectRepository {
  constructor(private readonly database: OpenIndustrialDesignDatabase) {}
  getProject(id: string) {
    return this.database.projects.get(id);
  }
  saveProject(project: Project) {
    return this.database.projects.put(project).then(() => undefined);
  }
  getBoard(id: string) {
    return this.database.boards.get(id);
  }
  saveBoard(board: Board) {
    return this.database.boards.put(board).then(() => undefined);
  }
  getNode(id: string) {
    return this.database.nodes.get(id);
  }
  saveNode(node: BaseNode) {
    return this.database.nodes.put(node).then(() => undefined);
  }
  deleteNode(id: string) {
    return this.database.nodes.delete(id);
  }
  listEdges(boardId: string) {
    return this.database.edges.where('boardId').equals(boardId).toArray();
  }
  saveEdge(edge: Edge) {
    return this.database.edges.put(edge).then(() => undefined);
  }
  async createGenerationStep(node: GenerationNode, edge: Edge): Promise<Board> {
    return this.database.transaction(
      'rw',
      [this.database.boards, this.database.nodes, this.database.edges],
      async () => {
        const board = await this.database.boards.get(node.boardId);
        if (
          !board ||
          edge.boardId !== board.id ||
          edge.targetNodeId !== node.id ||
          edge.type !== 'generation_input' ||
          edge.inputRole !== 'base'
        )
          throw new Error('Invalid generation step.');
        if ((await this.database.nodes.get(node.id)) || (await this.database.edges.get(edge.id)))
          throw new Error('Generation step identity already exists.');
        const nodes = await this.database.nodes.where('boardId').equals(board.id).toArray();
        const edges = await this.database.edges.where('boardId').equals(board.id).toArray();
        const error = validateGenerationInput(
          [...nodes, node],
          edges,
          edge.sourceNodeId,
          node.id,
          'base',
        );
        if (error) throw new Error(error);
        const updated = {
          ...board,
          nodeIds: [...board.nodeIds, node.id],
          edgeIds: [...board.edgeIds, edge.id],
          updatedAt: node.updatedAt,
        };
        await this.database.nodes.add(node);
        await this.database.edges.add(edge);
        await this.database.boards.put(updated);
        return updated;
      },
    );
  }
  async saveBoardEdge(edge: Edge): Promise<Board> {
    return this.database.transaction(
      'rw',
      [this.database.boards, this.database.edges],
      async () => {
        const board = await this.database.boards.get(edge.boardId);
        if (!board) throw new Error('Board is missing.');
        const updated = {
          ...board,
          edgeIds: [...new Set([...board.edgeIds, edge.id])],
          updatedAt: Date.now(),
        };
        await this.database.edges.put(edge);
        await this.database.boards.put(updated);
        return updated;
      },
    );
  }
  deleteEdge(id: string) {
    return this.database.edges.delete(id);
  }
  async deleteBoardEdge(edge: Edge): Promise<Board> {
    return this.database.transaction(
      'rw',
      [this.database.boards, this.database.edges],
      async () => {
        const board = await this.database.boards.get(edge.boardId);
        if (!board) throw new Error('Board is missing.');
        const updated = {
          ...board,
          edgeIds: board.edgeIds.filter((id) => id !== edge.id),
          updatedAt: Date.now(),
        };
        await this.database.edges.delete(edge.id);
        await this.database.boards.put(updated);
        return updated;
      },
    );
  }
  async deleteCanvasNodes(boardId: string, nodeIds: readonly string[]): Promise<Board> {
    return this.database.transaction(
      'rw',
      [
        this.database.boards,
        this.database.nodes,
        this.database.edges,
        this.database.candidates,
        this.database.candidateBlobs,
      ],
      async () => {
        const board = await this.database.boards.get(boardId);
        if (!board) throw new Error('Board is missing.');
        const removed = new Set(nodeIds);
        const [edges, candidates] = await Promise.all([
          this.database.edges.where('boardId').equals(boardId).toArray(),
          this.database.candidates.where('boardId').equals(boardId).toArray(),
        ]);
        const resultNodes = (
          await this.database.nodes.where('boardId').equals(boardId).toArray()
        ).filter((node) => node.type === 'candidate') as CandidateNode[];
        const removedCandidates = candidates.filter(
          (candidate) =>
            removed.has(candidate.generationNodeId) ||
            resultNodes.some((node) => node.candidateId === candidate.id && removed.has(node.id)),
        );
        resultNodes
          .filter((node) =>
            removedCandidates.some((candidate) => candidate.id === node.candidateId),
          )
          .forEach((node) => removed.add(node.id));
        if (
          edges.some(
            (edge) =>
              edge.type === 'generation_input' &&
              resultNodes.some((node) => node.id === edge.sourceNodeId && removed.has(node.id)) &&
              !removed.has(edge.targetNodeId),
          )
        )
          throw new Error('Disconnect downstream inputs before discarding this candidate.');
        const removedEdges = edges.filter(
          (edge) => removed.has(edge.sourceNodeId) || removed.has(edge.targetNodeId),
        );
        const updated = {
          ...board,
          nodeIds: board.nodeIds.filter((id) => !removed.has(id)),
          edgeIds: board.edgeIds.filter((id) => !removedEdges.some((edge) => edge.id === id)),
          updatedAt: Date.now(),
        };
        await this.database.nodes.bulkDelete([...removed]);
        await this.database.edges.bulkDelete(removedEdges.map((edge) => edge.id));
        await this.database.candidates.bulkDelete(
          removedCandidates.map((candidate) => candidate.id),
        );
        await this.database.candidateBlobs.bulkDelete(
          removedCandidates.map((candidate) => candidate.id),
        );
        await this.database.boards.put(updated);
        return updated;
      },
    );
  }
  getDesign(id: string) {
    return this.database.designs.get(id);
  }
  listDesigns(projectId: string) {
    return this.database.designs.where('projectId').equals(projectId).toArray();
  }
  saveDesign(design: Design) {
    return this.database.designs.put(design).then(() => undefined);
  }
  listDesignRelations(projectId: string) {
    return this.database.relations.where('projectId').equals(projectId).toArray();
  }
  getAsset(id: string) {
    return this.database.assets.get(id);
  }
  saveAsset(asset: Asset) {
    return this.database.assets.put(asset).then(() => undefined);
  }
  saveDesignRelation(value: DesignRelation) {
    return this.database.relations.put(value).then(() => undefined);
  }
  saveViewSet(value: ViewSet) {
    return this.database.viewSets.put(value).then(() => undefined);
  }
  saveCMFSet(value: CMFSet) {
    return this.database.cmfSets.put(value).then(() => undefined);
  }
  saveCMFVariant(value: CMFVariant) {
    return this.database.cmfVariants.put(value).then(() => undefined);
  }
  saveGeneration(value: Generation) {
    return saveGenerationStatus(this.database, value);
  }
  saveSketchDocument(value: SketchDocument) {
    return this.database.sketchDocuments.put(value).then(() => undefined);
  }
  getGraphViewState(projectId: string) {
    return this.database.graphViewStates.get(projectId);
  }
  saveGraphViewState(value: GraphViewState) {
    return this.database.graphViewStates.put(value).then(() => undefined);
  }
  saveAssetBlob(value: AssetBlob) {
    return this.database.assetBlobs.put(value).then(() => undefined);
  }
  getAssetBlob(id: string) {
    return this.database.assetBlobs.get(id);
  }
  async saveSnapshot(snapshot: PersistedProjectSnapshot) {
    await this.database.transaction(
      'rw',
      this.database.projects,
      this.database.boards,
      this.database.nodes,
      this.database.edges,
      async () => {
        const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
        const edges = (
          snapshot.edges ??
          (await this.database.edges.where('boardId').equals(snapshot.board.id).toArray())
        ).filter(
          (edge) =>
            edge.boardId === snapshot.board.id &&
            nodeIds.has(edge.sourceNodeId) &&
            nodeIds.has(edge.targetNodeId),
        );
        await this.database.projects.put(snapshot.project);
        await this.database.boards.put({
          ...snapshot.board,
          nodeIds: snapshot.nodes.map((node) => node.id),
          edgeIds: edges.map((edge) => edge.id),
        });
        await this.database.nodes.where('boardId').equals(snapshot.board.id).delete();
        await this.database.nodes.bulkPut(snapshot.nodes);
        await this.database.edges.where('boardId').equals(snapshot.board.id).delete();
        await this.database.edges.bulkPut(edges);
      },
    );
  }
  async loadSnapshot(projectId: string): Promise<PersistedProjectSnapshot | undefined> {
    const project = await this.database.projects.get(projectId);
    if (!project?.activeBoardId) return undefined;
    const board = await this.database.boards.get(project.activeBoardId);
    if (!board) return undefined;
    return {
      project,
      board,
      nodes: await this.database.nodes.where('boardId').equals(board.id).toArray(),
    };
  }
  async getRecentProjects() {
    return this.database.projects.orderBy('updatedAt').reverse().toArray();
  }

  listBoards(projectId: string) {
    return this.database.boards.where('projectId').equals(projectId).toArray();
  }

  listNodes(boardId: string) {
    return this.database.nodes.where('boardId').equals(boardId).toArray();
  }

  async deleteBoard(boardId: string) {
    await this.database.transaction(
      'rw',
      [
        this.database.boards,
        this.database.nodes,
        this.database.edges,
        this.database.candidates,
        this.database.candidateBlobs,
      ],
      async () => {
        const candidates = await this.database.candidates
          .where('boardId')
          .equals(boardId)
          .toArray();
        if (candidates.length)
          await this.database.candidateBlobs.bulkDelete(candidates.map((item) => item.id));
        await this.database.candidates.where('boardId').equals(boardId).delete();
        await this.database.edges.where('boardId').equals(boardId).delete();
        await this.database.nodes.where('boardId').equals(boardId).delete();
        await this.database.boards.delete(boardId);
      },
    );
  }

  async deleteProject(projectId: string) {
    await this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.boards,
        this.database.nodes,
        this.database.edges,
        this.database.candidates,
        this.database.candidateBlobs,
        this.database.assets,
        this.database.assetBlobs,
        this.database.designs,
        this.database.relations,
        this.database.viewSets,
        this.database.cmfSets,
        this.database.cmfVariants,
        this.database.generations,
        this.database.generationInputBlobs,
        this.database.sketchDocuments,
        this.database.graphViewStates,
      ],
      async () => {
        const boards = await this.database.boards.where('projectId').equals(projectId).toArray();
        const assets = await this.database.assets.where('projectId').equals(projectId).toArray();
        const candidates = await this.database.candidates
          .where('projectId')
          .equals(projectId)
          .toArray();
        const boardIds = boards.map((board) => board.id);
        const blobIds = assets.flatMap((asset) =>
          asset.storage.type === 'indexeddb' ? [asset.storage.blobId] : [],
        );
        if (boardIds.length) await this.database.nodes.where('boardId').anyOf(boardIds).delete();
        if (boardIds.length) await this.database.edges.where('boardId').anyOf(boardIds).delete();
        if (candidates.length)
          await this.database.candidateBlobs.bulkDelete(candidates.map((item) => item.id));
        if (blobIds.length) await this.database.assetBlobs.bulkDelete(blobIds);
        await Promise.all([
          this.database.projects.delete(projectId),
          this.database.generationInputBlobs.where('projectId').equals(projectId).delete(),
          this.database.boards.where('projectId').equals(projectId).delete(),
          this.database.assets.where('projectId').equals(projectId).delete(),
          this.database.candidates.where('projectId').equals(projectId).delete(),
          this.database.designs.where('projectId').equals(projectId).delete(),
          this.database.relations.where('projectId').equals(projectId).delete(),
          this.database.viewSets.where('projectId').equals(projectId).delete(),
          this.database.cmfSets.where('projectId').equals(projectId).delete(),
          this.database.cmfVariants.where('projectId').equals(projectId).delete(),
          this.database.generations.where('projectId').equals(projectId).delete(),
          this.database.sketchDocuments.where('projectId').equals(projectId).delete(),
          this.database.graphViewStates.delete(projectId),
        ]);
      },
    );
  }
}

/**
 * Dexie-only adapter for the portable project-file boundary. ZIP serialization
 * stays in @open-industrial-design/project-file and never reaches this class.
 */
export class DexieProjectArchiveStorage {
  constructor(private readonly database: OpenIndustrialDesignDatabase) {}

  async readProjectArchive(projectId: string): Promise<{
    snapshot: ProjectArchiveSnapshot;
    assetBlobs: AssetBlob[];
    candidateBlobs: AssetBlob[];
    generationInputBlobs: GenerationInputBlob[];
  }> {
    const project = await this.database.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const [
      boards,
      assets,
      designs,
      relations,
      viewSets,
      cmfSets,
      cmfVariants,
      generations,
      candidates,
      sketchDocuments,
      graphViewState,
    ] = await Promise.all([
      this.database.boards.where('projectId').equals(projectId).toArray(),
      this.database.assets.where('projectId').equals(projectId).toArray(),
      this.database.designs.where('projectId').equals(projectId).toArray(),
      this.database.relations.where('projectId').equals(projectId).toArray(),
      this.database.viewSets.where('projectId').equals(projectId).toArray(),
      this.database.cmfSets.where('projectId').equals(projectId).toArray(),
      this.database.cmfVariants.where('projectId').equals(projectId).toArray(),
      this.database.generations.where('projectId').equals(projectId).toArray(),
      this.database.candidates.where('projectId').equals(projectId).toArray(),
      this.database.sketchDocuments.where('projectId').equals(projectId).toArray(),
      this.database.graphViewStates.get(projectId),
    ]);
    const boardIds = boards.map((board) => board.id);
    const nodes = boardIds.length
      ? await this.database.nodes.where('boardId').anyOf(boardIds).toArray()
      : [];
    const edges = boardIds.length
      ? await this.database.edges.where('boardId').anyOf(boardIds).toArray()
      : [];
    const blobIds = assets.flatMap((asset) =>
      asset.storage.type === 'indexeddb' ? [asset.storage.blobId] : [],
    );
    const assetBlobs = blobIds.length
      ? await this.database.assetBlobs.where('id').anyOf(blobIds).toArray()
      : [];
    const candidateBlobs = candidates.length
      ? await this.database.candidateBlobs
          .where('id')
          .anyOf(candidates.map((item) => item.id))
          .toArray()
      : [];
    return {
      snapshot: {
        project,
        boards,
        nodes,
        edges,
        assets,
        designs,
        relations,
        viewSets,
        cmfSets,
        cmfVariants,
        generations,
        candidates,
        sketchDocuments,
        graphViewState,
      },
      assetBlobs,
      candidateBlobs,
      generationInputBlobs: await this.database.generationInputBlobs
        .where('projectId')
        .equals(projectId)
        .toArray(),
    };
  }

  /** Replaces only the matching project after the pure archive layer has validated it. */
  async restoreProjectArchive(archive: ProjectArchiveData) {
    validateProjectArchiveData(archive);
    const projectId = archive.project.id;
    await this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.boards,
        this.database.nodes,
        this.database.edges,
        this.database.candidates,
        this.database.candidateBlobs,
        this.database.assets,
        this.database.assetBlobs,
        this.database.designs,
        this.database.relations,
        this.database.viewSets,
        this.database.cmfSets,
        this.database.cmfVariants,
        this.database.generations,
        this.database.generationInputBlobs,
        this.database.sketchDocuments,
        this.database.graphViewStates,
      ],
      async () => {
        const existingBoards = await this.database.boards
          .where('projectId')
          .equals(projectId)
          .toArray();
        const existingAssets = await this.database.assets
          .where('projectId')
          .equals(projectId)
          .toArray();
        const existingCandidates = await this.database.candidates
          .where('projectId')
          .equals(projectId)
          .toArray();
        const existingBlobIds = existingAssets.flatMap((asset) =>
          asset.storage.type === 'indexeddb' ? [asset.storage.blobId] : [],
        );
        const existingBoardIds = existingBoards.map((board) => board.id);
        // Imported IDs are global primary keys. Check every write/delete boundary
        // in this same transaction, before replacing any part of the project.
        const conflict = () => {
          throw new ProjectArchiveError(
            'project_conflict',
            'Imported IDs belong to another project.',
          );
        };
        const guard = async <T extends { id: string; projectId: string }>(
          table: Table<T, string>,
          rows: { id: string }[],
        ) => {
          const stored = await table.bulkGet(rows.map((row) => row.id));
          if (stored.some((row) => row && row.projectId !== projectId)) conflict();
        };
        await guard(this.database.boards, archive.boards);
        await guard(this.database.assets, archive.assets);
        await guard(this.database.designs, archive.designs);
        await guard(this.database.relations, archive.relations);
        await guard(this.database.viewSets, archive.viewSets);
        await guard(this.database.cmfSets, archive.cmfSets);
        await guard(this.database.cmfVariants, archive.cmfVariants);
        await guard(this.database.generations, archive.generations);
        await guard(this.database.candidates, archive.candidates);
        await guard(this.database.sketchDocuments, archive.sketchDocuments);
        await guard(this.database.generationInputBlobs, archive.generationInputBlobs ?? []);
        const ownBoards = new Set(existingBoardIds);
        for (const [table, rows] of [
          [this.database.nodes, archive.nodes],
          [this.database.edges, archive.edges],
        ] as const) {
          const stored = await table.bulkGet(rows.map((row) => row.id));
          if (stored.some((row) => row && !ownBoards.has(row.boardId))) conflict();
        }
        const guardBlobs = async (
          table: Table<AssetBlob, string>,
          incoming: { id: string }[],
          deleted: string[],
          owners: { id: string; projectId: string }[],
        ) => {
          const touched = new Set([...incoming.map((row) => row.id), ...deleted]);
          if (owners.some((row) => touched.has(row.id) && row.projectId !== projectId)) conflict();
          const owned = new Set(
            owners.filter((row) => row.projectId === projectId).map((row) => row.id),
          );
          // Fail closed for orphan blobs: there is no proof they belong to this project.
          const stored = await table.bulkGet([...touched]);
          if (stored.some((row) => row && !owned.has(row.id))) conflict();
        };
        await guardBlobs(
          this.database.assetBlobs,
          archive.assetBlobs,
          existingBlobIds,
          (await this.database.assets.toArray()).flatMap((asset) =>
            asset.storage.type === 'indexeddb'
              ? [{ id: asset.storage.blobId, projectId: asset.projectId }]
              : [],
          ),
        );
        await guardBlobs(
          this.database.candidateBlobs,
          archive.candidateBlobs,
          existingCandidates.map((row) => row.id),
          await this.database.candidates.toArray(),
        );
        await guardBlobs(
          this.database.generationInputBlobs,
          archive.generationInputBlobs ?? [],
          (
            await this.database.generationInputBlobs.where('projectId').equals(projectId).toArray()
          ).map((row) => row.id),
          (await this.database.generations.toArray()).flatMap((run) =>
            (run.inputSnapshots ?? []).map((input) => ({ id: input.id, projectId: run.projectId })),
          ),
        );
        if (existingBoardIds.length)
          await this.database.nodes.where('boardId').anyOf(existingBoardIds).delete();
        if (existingBoardIds.length)
          await this.database.edges.where('boardId').anyOf(existingBoardIds).delete();
        if (existingBlobIds.length) await this.database.assetBlobs.bulkDelete(existingBlobIds);
        if (existingCandidates.length)
          await this.database.candidateBlobs.bulkDelete(existingCandidates.map((item) => item.id));
        await Promise.all([
          this.database.projects.delete(projectId),
          this.database.generationInputBlobs.where('projectId').equals(projectId).delete(),
          this.database.boards.where('projectId').equals(projectId).delete(),
          this.database.assets.where('projectId').equals(projectId).delete(),
          this.database.designs.where('projectId').equals(projectId).delete(),
          this.database.relations.where('projectId').equals(projectId).delete(),
          this.database.viewSets.where('projectId').equals(projectId).delete(),
          this.database.cmfSets.where('projectId').equals(projectId).delete(),
          this.database.cmfVariants.where('projectId').equals(projectId).delete(),
          this.database.generations.where('projectId').equals(projectId).delete(),
          this.database.candidates.where('projectId').equals(projectId).delete(),
          this.database.sketchDocuments.where('projectId').equals(projectId).delete(),
          this.database.graphViewStates.delete(projectId),
        ]);
        await Promise.all([
          this.database.projects.put(archive.project),
          this.database.boards.bulkPut(archive.boards),
          this.database.nodes.bulkPut(archive.nodes),
          this.database.edges.bulkPut(archive.edges),
          this.database.candidates.bulkPut(archive.candidates),
          this.database.candidateBlobs.bulkPut(archive.candidateBlobs),
          this.database.generationInputBlobs.bulkPut(
            (archive.generationInputBlobs ?? []).map((blob) => ({
              ...blob,
              projectId,
              generationId: archive.generations.find((generation) =>
                generation.inputSnapshots?.some((input) => input.id === blob.id),
              )!.id,
            })),
          ),
          this.database.assets.bulkPut(archive.assets),
          this.database.assetBlobs.bulkPut(archive.assetBlobs),
          this.database.designs.bulkPut(archive.designs),
          this.database.relations.bulkPut(archive.relations),
          this.database.viewSets.bulkPut(archive.viewSets),
          this.database.cmfSets.bulkPut(archive.cmfSets),
          this.database.cmfVariants.bulkPut(archive.cmfVariants),
          this.database.generations.bulkPut(archive.generations),
          this.database.sketchDocuments.bulkPut(archive.sketchDocuments),
          archive.graphViewState
            ? this.database.graphViewStates.put(archive.graphViewState)
            : Promise.resolve(),
        ]);
      },
    );
  }
}

/** Atomic persistence port for an accepted AI candidate; it never calls a Provider. */
export class DexieAIGenerationStorage {
  constructor(private readonly database: OpenIndustrialDesignDatabase) {}

  saveGeneration(generation: Generation) {
    return saveGenerationStatus(this.database, generation);
  }

  async saveAcceptedVariant(input: {
    asset: Asset;
    blob: Blob;
    design: Design;
    node: BaseNode;
    relation: DesignRelation;
    generation: Generation;
  }) {
    await this.database.transaction(
      'rw',
      [
        this.database.assets,
        this.database.assetBlobs,
        this.database.designs,
        this.database.nodes,
        this.database.boards,
        this.database.relations,
        this.database.generations,
      ],
      async () => {
        const board = await this.database.boards.get(input.node.boardId);
        if (!board)
          throw new Error('Cannot save an AI Variant because its Board no longer exists.');
        const blobId =
          input.asset.storage.type === 'indexeddb' ? input.asset.storage.blobId : input.asset.id;
        await Promise.all([
          this.database.assets.put(input.asset),
          this.database.assetBlobs.put({ id: blobId, blob: input.blob }),
          this.database.designs.put(input.design),
          this.database.nodes.put(input.node),
          this.database.relations.put(input.relation),
          this.database.generations.put(input.generation),
          this.database.boards.put({
            ...board,
            nodeIds: [...new Set([...board.nodeIds, input.node.id])],
            updatedAt: Date.now(),
          }),
        ]);
      },
    );
  }
}

/** Persists unreviewed outputs separately from formal Assets and Designs. */
export class DexieCanvasGenerationStorage {
  async saveGenerationInputs(generation: Generation, inputs: GenerationInputBlob[]) {
    await this.database.transaction(
      'rw',
      [this.database.generations, this.database.generationInputBlobs],
      async () => {
        const snapshots = generation.inputSnapshots ?? [];
        if (
          snapshots.length !== inputs.length ||
          new Set(snapshots.map((item) => item.id)).size !== snapshots.length ||
          inputs.some(
            (item) =>
              item.projectId !== generation.projectId ||
              item.generationId !== generation.id ||
              !snapshots.some(
                (snapshot) => snapshot.id === item.id && snapshot.mimeType === item.blob.type,
              ),
          )
        )
          throw new Error('Generation input snapshots are incomplete.');
        if (await this.database.generations.get(generation.id))
          throw new Error('Generation inputs are immutable.');
        await this.database.generationInputBlobs.bulkAdd(inputs);
        await this.database.generations.add(generation);
      },
    );
  }
  constructor(private readonly database: OpenIndustrialDesignDatabase) {}

  listCandidates(boardId: string) {
    return this.database.candidates.where('boardId').equals(boardId).toArray();
  }

  /** Repairs result nodes lost by older canvas-only undo state without changing user positions. */
  async reconcileCandidateResults(projectId: string) {
    return this.database.transaction(
      'rw',
      [
        this.database.boards,
        this.database.nodes,
        this.database.edges,
        this.database.candidates,
        this.database.candidateBlobs,
      ],
      async () => {
        let repaired = 0;
        const boards = await this.database.boards.where('projectId').equals(projectId).toArray();
        for (const board of boards) {
          const candidates = await this.database.candidates
            .where('boardId')
            .equals(board.id)
            .toArray();
          if (!candidates.length) continue;
          for (const candidate of candidates) {
            if (!(await this.database.candidateBlobs.get(candidate.id)))
              throw new Error('Candidate image Blob is missing.');
          }
          let savedPositions: Record<string, { x: number; y: number }> = {};
          try {
            const raw =
              typeof localStorage !== 'undefined' &&
              localStorage.getItem(`oid.canvas.candidate-positions.v1:${board.id}`);
            const parsed: unknown = raw ? JSON.parse(raw) : {};
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
              savedPositions = parsed as typeof savedPositions;
          } catch {
            /* Invalid optional positions must not block candidate recovery. */
          }
          const added = materializeCandidateResults(
            await this.database.nodes.where('boardId').equals(board.id).toArray(),
            await this.database.edges.where('boardId').equals(board.id).toArray(),
            candidates,
            savedPositions,
          );
          if (!added.nodes.length && !added.edges.length) continue;
          await this.database.nodes.bulkPut(added.nodes);
          await this.database.edges.bulkPut(added.edges);
          await this.database.boards.put({
            ...board,
            nodeIds: [...new Set([...board.nodeIds, ...added.nodes.map((node) => node.id)])],
            edgeIds: [...new Set([...board.edgeIds, ...added.edges.map((edge) => edge.id)])],
          });
          repaired += added.nodes.length;
        }
        return repaired;
      },
    );
  }

  getCandidate(id: string) {
    return this.database.candidates.get(id);
  }

  getGeneration(id: string) {
    return this.database.generations.get(id);
  }

  async getCandidateBlob(id: string) {
    return (await this.database.candidateBlobs.get(id))?.blob;
  }

  async stage(candidates: Array<{ metadata: GenerationCandidate; blob: Blob }>) {
    return this.database.transaction(
      'rw',
      [
        this.database.candidates,
        this.database.candidateBlobs,
        this.database.nodes,
        this.database.edges,
        this.database.boards,
      ],
      async () => {
        const added: { nodes: CandidateNode[]; edges: Edge[] } = { nodes: [], edges: [] };
        for (const boardId of new Set(candidates.map((item) => item.metadata.boardId))) {
          const board = await this.database.boards.get(boardId);
          if (!board) throw new Error('Candidate Board is missing.');
          const items = candidates.filter((item) => item.metadata.boardId === boardId);
          if (items.some((item) => item.metadata.projectId !== board.projectId))
            throw new Error('Candidate belongs to another project.');
          const result = materializeCandidateResults(
            await this.database.nodes.where('boardId').equals(boardId).toArray(),
            await this.database.edges.where('boardId').equals(boardId).toArray(),
            items.map((item) => item.metadata),
          );
          await this.database.nodes.bulkPut(result.nodes);
          await this.database.edges.bulkPut(result.edges);
          await this.database.boards.put({
            ...board,
            nodeIds: [...new Set([...board.nodeIds, ...result.nodes.map((node) => node.id)])],
            edgeIds: [...new Set([...board.edgeIds, ...result.edges.map((edge) => edge.id)])],
          });
          added.nodes.push(...result.nodes);
          added.edges.push(...result.edges);
        }
        await this.database.candidates.bulkPut(candidates.map((candidate) => candidate.metadata));
        await this.database.candidateBlobs.bulkPut(
          candidates.map((candidate) => ({ id: candidate.metadata.id, blob: candidate.blob })),
        );
        return added;
      },
    );
  }

  async getResultNode(candidateId: string) {
    const candidate = await this.getCandidate(candidateId);
    if (!candidate) return undefined;
    return (await this.database.nodes.where('boardId').equals(candidate.boardId).toArray()).find(
      (node) => node.type === 'candidate' && (node as CandidateNode).candidateId === candidateId,
    ) as CandidateNode | undefined;
  }

  async getResultEdge(nodeId: string) {
    return (await this.database.edges.toArray()).find(
      (edge) => edge.type === 'generation_output' && edge.targetNodeId === nodeId,
    );
  }

  async discard(id: string) {
    const node = await this.getResultNode(id);
    if (node)
      return new DexieProjectRepository(this.database).deleteCanvasNodes(node.boardId, [node.id]);
    throw new Error('Candidate result node is missing.');
  }

  async accept(input: {
    candidate: GenerationCandidate;
    asset: Asset;
    node: BaseNode;
    outputEdge: Edge;
    design?: Design;
    relation?: DesignRelation;
    generation: Generation;
  }) {
    await this.database.transaction(
      'rw',
      [
        this.database.candidates,
        this.database.candidateBlobs,
        this.database.assets,
        this.database.assetBlobs,
        this.database.nodes,
        this.database.boards,
        this.database.edges,
        this.database.designs,
        this.database.relations,
        this.database.generations,
      ],
      async () => {
        const [blobRecord, board] = await Promise.all([
          this.database.candidateBlobs.get(input.candidate.id),
          this.database.boards.get(input.node.boardId),
        ]);
        if (!blobRecord || !board) throw new Error('Candidate image or Board is missing.');
        const resultNode = await this.getResultNode(input.candidate.id);
        const resultEdge = resultNode && (await this.getResultEdge(resultNode.id));
        if (
          !resultNode ||
          !resultEdge ||
          input.node.id !== resultNode.id ||
          input.outputEdge.id !== resultEdge.id ||
          input.outputEdge.targetNodeId !== resultNode.id ||
          input.node.x !== resultNode.x ||
          input.node.y !== resultNode.y ||
          input.node.width !== resultNode.width ||
          input.node.height !== resultNode.height
        )
          throw new Error('Adoption must preserve the candidate result identity and layout.');
        await this.database.assets.put(input.asset);
        await this.database.assetBlobs.put({ id: input.asset.id, blob: blobRecord.blob });
        await this.database.nodes.put(input.node);
        await this.database.boards.put({
          ...board,
          nodeIds: [...new Set([...board.nodeIds, input.node.id])],
          edgeIds: [...new Set([...board.edgeIds, input.outputEdge.id])],
          updatedAt: Date.now(),
        });
        await this.database.edges.put(input.outputEdge);
        if (input.design) await this.database.designs.put(input.design);
        if (input.relation) await this.database.relations.put(input.relation);
        await this.database.generations.put(input.generation);
        await this.database.candidates.delete(input.candidate.id);
        await this.database.candidateBlobs.delete(input.candidate.id);
      },
    );
  }
}

/**
 * Persistence adapter for 3D review data. It stores serializable node state and
 * Blobs, never Three.js scenes, meshes, cameras, or renderer objects.
 */
export class DexieThreeViewerStorage {
  constructor(private readonly database: OpenIndustrialDesignDatabase) {}

  listModelAssets(projectId: string) {
    return this.database.assets
      .where('projectId')
      .equals(projectId)
      .filter((asset) => asset.type === 'model3d')
      .toArray();
  }

  async getAssetBlob(asset: Asset) {
    if (asset.storage.type !== 'indexeddb') return undefined;
    return (await this.database.assetBlobs.get(asset.storage.blobId))?.blob;
  }

  async getAssetBlobById(assetId: string) {
    const asset = await this.database.assets.get(assetId);
    return asset ? this.getAssetBlob(asset) : undefined;
  }

  async saveImportedModel(input: { asset: Asset; blob: Blob; node: Model3DNode }) {
    const blobId =
      input.asset.storage.type === 'indexeddb' ? input.asset.storage.blobId : undefined;
    if (!blobId) throw new Error('Imported 3D models must use IndexedDB Blob storage.');
    await this.database.transaction(
      'rw',
      [this.database.assets, this.database.assetBlobs, this.database.nodes, this.database.boards],
      async () => {
        const board = await this.database.boards.get(input.node.boardId);
        if (!board) throw new Error('Cannot save a 3D model because its Board no longer exists.');
        await Promise.all([
          this.database.assets.put(input.asset),
          this.database.assetBlobs.put({ id: blobId, blob: input.blob }),
          this.database.nodes.put(input.node),
          this.database.boards.put({
            ...board,
            nodeIds: [...new Set([...board.nodeIds, input.node.id])],
            updatedAt: Date.now(),
          }),
        ]);
      },
    );
  }

  saveViewerState(node: Model3DNode) {
    return this.database.nodes.put(node).then(() => undefined);
  }

  async saveCapture(input: { asset: Asset; blob: Blob; node: Model3DNode }) {
    const blobId =
      input.asset.storage.type === 'indexeddb' ? input.asset.storage.blobId : undefined;
    if (!blobId) throw new Error('3D captures must use IndexedDB Blob storage.');
    await this.database.transaction(
      'rw',
      [this.database.assets, this.database.assetBlobs, this.database.nodes],
      async () => {
        await Promise.all([
          this.database.assets.put(input.asset),
          this.database.assetBlobs.put({ id: blobId, blob: input.blob }),
          this.database.nodes.put(input.node),
        ]);
      },
    );
  }
}

export function createAutosave<T>(save: (value: T) => Promise<void>, delay = 750) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(value: T) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void save(value), delay);
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  };
}
