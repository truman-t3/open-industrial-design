import Dexie, { type Table } from 'dexie';
import {
  materializeCandidateResults,
  createVariant,
  createConcept,
  transitionDesignStatus,
  designStatuses,
  reconcileCanvasGroups,
  validateCanvasGroups,
  validateGenerationInput,
  isValidMaterialKnowledge,
  isValidResearchLibrary,
  type ResearchLibrary,
  type ResearchEntry,
  isValidDesignViews,
  isValidCMFVariantDraft,
  type MaterialKnowledge,
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
  CMFNode,
  CMFVariant,
  Design,
  DesignStatus,
  DesignRelation,
  Edge,
  Generation,
  GenerationCandidate,
  GenerationNode,
  GraphViewState,
  Model3DNode,
  Project,
  ProjectRepository,
  ReferenceNode,
  ImageNode,
  SketchDocument,
  SketchNode,
  ViewSet,
  ViewSetNode,
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
export interface LocalMaterialEntry {
  asset: Asset;
  projectName: string;
  notes: string[];
  referenceTypes: string[];
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

/** Session-only undo data. Blobs never enter serialized Action history or canvas state. */
export interface CanvasDeletionSnapshot {
  projectId: string;
  boardId: string;
  before: { nodes: BaseNode[]; edges: Edge[]; candidates: GenerationCandidate[] };
  after: { nodes: BaseNode[]; edges: Edge[]; candidates: GenerationCandidate[] };
  removedBlobs: AssetBlob[];
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
    this.version(6)
      .stores({})
      .upgrade(async (transaction) => {
        await transaction
          .table('nodes')
          .toCollection()
          .modify((node) => {
            if (node.type === 'group') {
              node.childNodeIds = [];
              node.rotation = 0;
              node.label ??= '';
            }
          });
        await transaction.table('projects').toCollection().modify({ schemaVersion: 8 });
      });
    this.version(7)
      .stores({})
      .upgrade(async (transaction) => {
        await transaction.table('projects').toCollection().modify({ schemaVersion: 9 });
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
    if (
      existing?.actionId === 'ai.analyzeMaterials' &&
      (value.actionId !== existing.actionId ||
        value.prompt !== existing.prompt ||
        JSON.stringify(value.parameters?.researchEvidence) !==
          JSON.stringify(existing.parameters?.researchEvidence) ||
        JSON.stringify(value.parameters?.evidence) !==
          JSON.stringify(existing.parameters?.evidence))
    )
      throw new Error('Analysis evidence is immutable.');
    await database.generations.put(value);
  });
}

export class DexieProjectRepository implements ProjectRepository {
  constructor(private readonly database: OpenIndustrialDesignDatabase) {}
  getProject(id: string) {
    return this.database.projects.get(id);
  }
  async saveProject(project: Project) {
    await this.database.transaction('rw', this.database.projects, async () => {
      const current = await this.database.projects.get(project.id);
      await this.database.projects.put({
        ...project,
        ...(current ? { researchLibrary: current.researchLibrary } : {}),
      });
    });
  }
  /** Compare-and-save user research; Canvas autosave never owns these records. */
  async saveResearchLibrary(
    projectId: string,
    library: ResearchLibrary,
    expected: ResearchLibrary | undefined,
  ) {
    await this.database.transaction(
      'rw',
      [this.database.projects, this.database.assets],
      async () => {
        const project = await this.database.projects.get(projectId);
        if (!project) throw new Error('Research project is missing.');
        if (JSON.stringify(project.researchLibrary) !== JSON.stringify(expected))
          throw new Error('Research library changed. Reload before saving.');
        const assets = await this.database.assets.where('projectId').equals(projectId).toArray();
        if (!isValidResearchLibrary(library, assets, projectId))
          throw new Error('Invalid research library.');
        await this.database.projects.update(projectId, {
          researchLibrary: structuredClone(library),
          updatedAt: Date.now(),
        });
      },
    );
  }
  async importResearchImage(
    asset: Asset,
    blob: Blob,
    entry: ResearchEntry,
    collectionId: string | undefined,
    expected: ResearchLibrary | undefined,
  ) {
    await this.database.transaction(
      'rw',
      [this.database.projects, this.database.assets, this.database.assetBlobs],
      async () => {
        if (
          asset.type !== 'image' ||
          asset.storage.type !== 'indexeddb' ||
          entry.assetId !== asset.id ||
          !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(
            asset.mimeType,
          ) ||
          asset.mimeType !== blob.type ||
          asset.size !== blob.size ||
          !blob.size ||
          blob.size > 25 * 1024 * 1024 ||
          !Number.isInteger(asset.width) ||
          !Number.isInteger(asset.height) ||
          asset.width! <= 0 ||
          asset.height! <= 0 ||
          asset.width! * asset.height! > 32_000_000 ||
          (await this.database.assets.get(asset.id)) ||
          (await this.database.assetBlobs.get(asset.storage.blobId))
        )
          throw new Error('Invalid research image or identity conflict.');
        const library = structuredClone(expected ?? { entries: [], collections: [] });
        library.entries.push(entry);
        if (collectionId !== undefined) {
          const collection = library.collections.find((item) => item.id === collectionId);
          if (!collection) throw new Error('Research collection is missing.');
          collection.entryIds.push(entry.id);
          collection.updatedAt = Date.now();
        }
        await this.database.assets.add(asset);
        await this.database.assetBlobs.add({ id: asset.storage.blobId, blob });
        await this.saveResearchLibrary(asset.projectId, library, expected);
      },
    );
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
  async createGenerationBatch(
    steps: Array<{ node: GenerationNode; edge: Edge; referenceEdges?: Edge[] }>,
  ): Promise<Board> {
    if (
      !steps.length ||
      steps.length > 16 ||
      steps.some((step) => step.node.boardId !== steps[0]!.node.boardId)
    )
      throw new Error('A batch must contain one to sixteen steps on one board.');
    // Nested step transactions join this transaction; any failed step rolls back the batch.
    return this.database.transaction(
      'rw',
      [this.database.boards, this.database.nodes, this.database.edges],
      async () => {
        let board: Board | undefined;
        for (const step of steps) {
          board = await this.createGenerationStep(step.node, step.edge);
          for (const edge of step.referenceEdges ?? []) {
            if (
              edge.type !== 'generation_input' ||
              edge.inputRole !== 'reference' ||
              edge.boardId !== board.id ||
              edge.targetNodeId !== step.node.id
            )
              throw new Error('Invalid shared reference.');
            const nodes = await this.database.nodes.where('boardId').equals(board.id).toArray();
            const edges = await this.database.edges.where('boardId').equals(board.id).toArray();
            const error = validateGenerationInput(
              nodes,
              edges,
              edge.sourceNodeId,
              step.node.id,
              'reference',
            );
            if (error) throw new Error(error);
            await this.database.edges.add(edge);
            board = { ...board, edgeIds: [...board.edgeIds, edge.id] };
            await this.database.boards.put(board);
          }
        }
        return board!;
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
  async deleteCanvasNodesWithUndo(boardId: string, nodeIds: readonly string[]) {
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
        const read = async () => ({
          nodes: await this.database.nodes.where('boardId').equals(boardId).toArray(),
          edges: await this.database.edges.where('boardId').equals(boardId).toArray(),
          candidates: await this.database.candidates.where('boardId').equals(boardId).toArray(),
        });
        const before = await read();
        const blobs = await this.database.candidateBlobs.bulkGet(
          before.candidates.map((item) => item.id),
        );
        const updatedBoard = await this.deleteCanvasNodes(boardId, nodeIds);
        const after = await read();
        const removedCandidates = before.candidates.filter(
          (item) => !after.candidates.some((current) => current.id === item.id),
        );
        const removedBlobs = removedCandidates.map((item) =>
          blobs.find((blob) => blob?.id === item.id),
        );
        if (removedBlobs.some((blob) => !blob?.blob.size))
          throw new Error('Candidate image missing; reversible deletion refused.');
        const undo: CanvasDeletionSnapshot = {
          projectId: board.projectId,
          boardId,
          before,
          after,
          removedBlobs: removedBlobs as AssetBlob[],
        };
        return { board: updatedBoard, undo };
      },
    );
  }
  async restoreCanvasDeletion(snapshot: CanvasDeletionSnapshot): Promise<Board> {
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
        const board = await this.database.boards.get(snapshot.boardId);
        if (!board || board.projectId !== snapshot.projectId)
          throw new Error('Deletion board unavailable.');
        const current = {
          nodes: await this.database.nodes.where('boardId').equals(board.id).toArray(),
          edges: await this.database.edges.where('boardId').equals(board.id).toArray(),
          candidates: await this.database.candidates.where('boardId').equals(board.id).toArray(),
        };
        // Do not overwrite edits from another tab, adopted results, or newly reused IDs.
        if (JSON.stringify(current) !== JSON.stringify(snapshot.after))
          throw new Error('Board changed since deletion.');
        for (const [table, before, after] of [
          [this.database.nodes, snapshot.before.nodes, snapshot.after.nodes],
          [this.database.edges, snapshot.before.edges, snapshot.after.edges],
          [this.database.candidates, snapshot.before.candidates, snapshot.after.candidates],
        ] as const) {
          for (const item of before) {
            if (item.boardId !== board.id) throw new Error('Deletion snapshot ownership mismatch.');
            if (!after.some((entry) => entry.id === item.id) && (await table.get(item.id)))
              throw new Error('Deletion restore ID conflict.');
          }
        }
        await this.database.candidateBlobs.bulkAdd(snapshot.removedBlobs);
        await this.database.candidates.bulkPut(snapshot.before.candidates);
        await this.database.nodes.bulkPut(snapshot.before.nodes);
        await this.database.edges.bulkPut(snapshot.before.edges);
        const restored = {
          ...board,
          nodeIds: snapshot.before.nodes.map((node) => node.id),
          edgeIds: snapshot.before.edges.map((edge) => edge.id),
          updatedAt: Date.now(),
        };
        await this.database.boards.put(restored);
        return restored;
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
        const boardNodes = await this.database.nodes.where('boardId').equals(boardId).toArray();
        if (
          [...removed].some(
            (id) =>
              !board.nodeIds.includes(id) ||
              !boardNodes.some((node) => node.id === id && !node.locked),
          )
        )
          throw new Error('Deletion contains unavailable or locked nodes.');
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
        if (boardNodes.some((node) => removed.has(node.id) && node.locked))
          throw new Error('Deletion contains locked result nodes.');
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
        const remaining = await this.database.nodes.where('boardId').equals(boardId).toArray();
        await this.database.nodes.bulkPut(
          reconcileCanvasGroups(remaining).filter((node) => node.type === 'group'),
        );
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
  async transitionDesignDecision(
    projectId: string,
    designId: string,
    expectedStatus: DesignStatus,
    status: DesignStatus,
  ) {
    return this.database.transaction(
      'rw',
      [this.database.projects, this.database.designs],
      async () => {
        const design = await this.database.designs.get(designId);
        if (
          !design ||
          design.projectId !== projectId ||
          !(await this.database.projects.get(projectId)) ||
          design.status !== expectedStatus ||
          !designStatuses.includes(status)
        )
          throw new Error('Design status is unavailable or has changed.');
        const updated = transitionDesignStatus(design, status);
        await this.database.designs.put(updated);
        await this.database.projects.update(projectId, { updatedAt: updated.updatedAt });
        return updated;
      },
    );
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
  async saveMaterialKnowledge(projectId: string, assetId: string, knowledge: MaterialKnowledge) {
    if (!isValidMaterialKnowledge(knowledge)) throw new Error('Invalid material knowledge.');
    await this.database.transaction(
      'rw',
      [this.database.assets, this.database.projects],
      async () => {
        const asset = await this.database.assets.get(assetId);
        if (
          !asset ||
          asset.projectId !== projectId ||
          asset.type !== 'image' ||
          !(await this.database.projects.get(projectId))
        )
          throw new Error('Material is missing.');
        const updatedAt = Date.now();
        await this.database.assets.put({
          ...asset,
          knowledge: { ...knowledge, tags: [...knowledge.tags] },
          updatedAt,
        });
        await this.database.projects.update(projectId, { updatedAt });
      },
    );
  }
  /** Local metadata only. Never fetch remote assets or read Provider credentials. */
  async searchLocalMaterials(query = '', projectId?: string): Promise<LocalMaterialEntry[]> {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const [assets, projects, nodes] = await Promise.all([
      projectId
        ? this.database.assets.where('projectId').equals(projectId).toArray()
        : this.database.assets.toArray(),
      this.database.projects.toArray(),
      this.database.nodes.toArray(),
    ]);
    const projectNames = new Map(projects.map((project) => [project.id, project.name]));
    const references = new Map<string, ReferenceNode[]>();
    for (const node of nodes) {
      if (node.type !== 'reference') continue;
      const reference = node as ReferenceNode;
      const group = references.get(reference.assetId) ?? [];
      group.push(reference);
      references.set(reference.assetId, group);
    }
    return assets
      .filter(
        (asset) =>
          asset.type === 'image' &&
          asset.storage.type === 'indexeddb' &&
          projectNames.has(asset.projectId) &&
          asset.mimeType.startsWith('image/'),
      )
      .map((asset) => {
        const sourceReferences = references.get(asset.id) ?? [];
        return {
          asset,
          projectName: projectNames.get(asset.projectId)!,
          notes: [
            ...new Set(
              sourceReferences
                .map((node) => node.notes?.trim())
                .filter((note): note is string => Boolean(note)),
            ),
          ],
          referenceTypes: [
            ...new Set(
              sourceReferences
                .map((node) => node.referenceType)
                .filter((type): type is NonNullable<ReferenceNode['referenceType']> =>
                  Boolean(type),
                ),
            ),
          ],
        };
      })
      .filter((entry) => {
        const searchable = [
          entry.asset.name,
          entry.projectName,
          ...entry.notes,
          ...entry.referenceTypes,
          entry.asset.knowledge?.notes ?? '',
          ...(entry.asset.knowledge?.tags ?? []),
        ]
          .join(' ')
          .toLocaleLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      .sort(
        (a, b) => b.asset.updatedAt - a.asset.updatedAt || a.asset.id.localeCompare(b.asset.id),
      );
  }
  /** All-or-nothing import; decoding belongs to the browser adapter before this transaction. */
  async importLocalImage(asset: Asset, node: ImageNode | ReferenceNode, blob: Blob) {
    await this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.boards,
        this.database.nodes,
        this.database.assets,
        this.database.assetBlobs,
      ],
      async () => {
        const board = await this.database.boards.get(node.boardId);
        const project = await this.database.projects.get(asset.projectId);
        if (
          !board ||
          !project ||
          board.projectId !== project.id ||
          !project.boardIds.includes(board.id) ||
          !asset.id ||
          !node.id ||
          asset.type !== 'image' ||
          asset.storage.type !== 'indexeddb' ||
          asset.storage.blobId !== asset.id ||
          node.assetId !== asset.id ||
          !['image', 'reference'].includes(node.type) ||
          node.designId ||
          !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(
            asset.mimeType,
          ) ||
          blob.type !== asset.mimeType ||
          blob.size !== asset.size ||
          !blob.size ||
          blob.size > 25 * 1024 * 1024 ||
          !Number.isInteger(asset.width) ||
          !Number.isInteger(asset.height) ||
          !asset.width ||
          !asset.height ||
          asset.width <= 0 ||
          asset.height <= 0 ||
          asset.width * asset.height > 32_000_000 ||
          ![node.x, node.y, node.width, node.height, node.rotation, node.zIndex].every(
            Number.isFinite,
          ) ||
          node.width <= 0 ||
          node.height <= 0
        )
          throw new Error('Invalid image import.');
        await this.database.assets.add(asset);
        await this.database.assetBlobs.add({ id: asset.id, blob });
        await this.database.nodes.add(node);
        await this.database.boards.put({
          ...board,
          nodeIds: [...board.nodeIds, node.id],
          updatedAt: node.updatedAt,
        });
        await this.database.projects.update(project.id, { updatedAt: node.updatedAt });
      },
    );
  }
  /** Copy across projects so deleting the source cannot break the target project. */
  async placeLocalMaterial(projectId: string, sourceAssetId: string, node: ReferenceNode) {
    return this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.boards,
        this.database.nodes,
        this.database.assets,
        this.database.assetBlobs,
      ],
      async () => {
        const board = await this.database.boards.get(node.boardId);
        const source = await this.database.assets.get(sourceAssetId);
        if (
          !board ||
          board.projectId !== projectId ||
          !(await this.database.projects.get(projectId)) ||
          !source ||
          !(await this.database.projects.get(source.projectId)) ||
          source.type !== 'image' ||
          source.storage.type !== 'indexeddb' ||
          !source.mimeType.startsWith('image/') ||
          node.type !== 'reference' ||
          !node.id ||
          node.assetId !== sourceAssetId ||
          ![node.x, node.y, node.width, node.height, node.rotation, node.zIndex].every(
            Number.isFinite,
          ) ||
          node.width <= 0 ||
          node.height <= 0
        )
          throw new Error('Invalid material placement.');
        const stored = await this.database.assetBlobs.get(source.storage.blobId);
        if (!stored?.blob.size) throw new Error('Material file is missing.');
        let asset = source;
        if (source.projectId !== projectId) {
          const id = crypto.randomUUID();
          asset = {
            ...source,
            id,
            projectId,
            storage: { type: 'indexeddb', blobId: id },
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
          };
          // Source-specific links and metadata are not portable design lineage.
          delete asset.thumbnailAssetId;
          delete asset.metadata;
          await this.database.assets.add(asset);
          await this.database.assetBlobs.add({ id, blob: stored.blob });
        }
        const placed: ReferenceNode = { ...node, assetId: asset.id };
        await this.database.nodes.add(placed);
        await this.database.boards.put({
          ...board,
          nodeIds: [...board.nodeIds, placed.id],
          updatedAt: node.updatedAt,
        });
        await this.database.projects.update(projectId, { updatedAt: node.updatedAt });
        return { node: placed, asset };
      },
    );
  }
  saveDesignRelation(value: DesignRelation) {
    return this.database.relations.put(value).then(() => undefined);
  }
  async createBlankConcept(
    projectId: string,
    boardId: string,
    input: { name: string; x: number; y: number },
  ) {
    if (
      typeof input?.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 200 ||
      ![input.x, input.y].every(Number.isFinite)
    )
      throw new Error('Invalid concept input.');
    return this.database.transaction(
      'rw',
      [this.database.projects, this.database.boards, this.database.nodes, this.database.designs],
      async () => {
        const project = await this.database.projects.get(projectId);
        const board = await this.database.boards.get(boardId);
        if (
          !project ||
          !board ||
          board.projectId !== projectId ||
          !project.boardIds.includes(boardId)
        )
          throw new Error('Concept board unavailable.');
        const created = createConcept({ projectId, boardId, ...input, name: input.name.trim() });
        const node = { ...created.node, label: created.design.name };
        await this.database.designs.add(created.design);
        await this.database.nodes.add(node);
        await this.database.boards.put({
          ...board,
          nodeIds: [...board.nodeIds, node.id],
          updatedAt: created.design.updatedAt,
        });
        await this.database.projects.update(projectId, { updatedAt: created.design.updatedAt });
        return { design: created.design, node };
      },
    );
  }
  async createConceptFromImage(
    projectId: string,
    boardId: string,
    input: {
      sourceNodeId: string;
      name: string;
      x: number;
      y: number;
    },
  ) {
    return this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.boards,
        this.database.nodes,
        this.database.designs,
        this.database.edges,
        this.database.assets,
        this.database.assetBlobs,
      ],
      async () => {
        const source = await this.database.nodes.get(input.sourceNodeId);
        const board = await this.database.boards.get(boardId);
        if (
          !source ||
          source.boardId !== boardId ||
          !board ||
          board.projectId !== projectId ||
          !board.nodeIds.includes(source.id) ||
          !(await this.database.projects.get(projectId)) ||
          !['image', 'reference', 'sketch'].includes(source.type) ||
          typeof input.name !== 'string' ||
          !input.name.trim() ||
          input.name.length > 200 ||
          ![input.x, input.y].every(Number.isFinite)
        )
          throw new Error('Invalid concept source.');
        const assetId =
          'assetId' in source
            ? source.assetId
            : 'previewAssetId' in source
              ? source.previewAssetId
              : undefined;
        const asset =
          typeof assetId === 'string' ? await this.database.assets.get(assetId) : undefined;
        if (
          !asset ||
          asset.projectId !== projectId ||
          !asset.mimeType.startsWith('image/') ||
          asset.storage.type !== 'indexeddb' ||
          !(await this.database.assetBlobs.get(asset.storage.blobId))?.blob.size
        )
          throw new Error('Concept preview is unavailable.');
        const created = createConcept({
          projectId,
          boardId,
          name: input.name.trim(),
          x: input.x,
          y: input.y,
          previewAssetId: asset.id,
        });
        const edge: Edge = {
          id: crypto.randomUUID(),
          boardId,
          sourceNodeId: source.id,
          targetNodeId: created.node.id,
          type: 'references',
          createdAt: created.design.createdAt,
          updatedAt: created.design.updatedAt,
        };
        await this.database.designs.add(created.design);
        await this.database.nodes.add({ ...created.node, label: created.design.name } as BaseNode);
        await this.database.edges.add(edge);
        await this.database.boards.put({
          ...board,
          nodeIds: [...board.nodeIds, created.node.id],
          edgeIds: [...board.edgeIds, edge.id],
          updatedAt: created.design.updatedAt,
        });
        await this.database.projects.update(projectId, { updatedAt: created.design.updatedAt });
        return { designId: created.design.id, nodeId: created.node.id };
      },
    );
  }
  async saveManualVariant(projectId: string, value: ReturnType<typeof createVariant>) {
    const { design, node, relation } = value;
    return this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.boards,
        this.database.nodes,
        this.database.designs,
        this.database.relations,
        this.database.assets,
        this.database.assetBlobs,
      ],
      async () => {
        const parent = design.parentDesignId
          ? await this.database.designs.get(design.parentDesignId)
          : undefined;
        const board = await this.database.boards.get(node.boardId);
        if (
          !parent ||
          parent.projectId !== projectId ||
          !board ||
          board.projectId !== projectId ||
          !(await this.database.projects.get(projectId)) ||
          design.projectId !== projectId ||
          design.kind !== 'variant' ||
          !design.name.trim() ||
          design.name.length > 200 ||
          node.type !== 'variant' ||
          node.designId !== design.id ||
          ![node.x, node.y, node.width, node.height].every(Number.isFinite) ||
          node.width <= 0 ||
          node.height <= 0 ||
          relation.projectId !== projectId ||
          relation.type !== 'variant_of' ||
          relation.sourceDesignId !== parent.id ||
          relation.targetDesignId !== design.id
        )
          throw new Error('Invalid manual variant ownership.');
        if (node.previewAssetId) {
          const asset = await this.database.assets.get(node.previewAssetId);
          if (
            !asset ||
            asset.projectId !== projectId ||
            !asset.mimeType.startsWith('image/') ||
            asset.storage.type !== 'indexeddb' ||
            !(await this.database.assetBlobs.get(asset.storage.blobId))?.blob.size
          )
            throw new Error('Variant preview is unavailable.');
        }
        // The current persisted parent is authoritative; a stale UI snapshot must not supply DNA.
        const current = createVariant(parent, {
          boardId: board.id,
          name: design.name,
          x: node.x,
          y: node.y,
          previewAssetId: node.previewAssetId,
        });
        await this.database.designs.add({ ...design, dna: current.design.dna });
        await this.database.nodes.add(node);
        await this.database.relations.add(relation);
        await this.database.boards.put({
          ...board,
          nodeIds: [...board.nodeIds, node.id],
          updatedAt: design.updatedAt,
        });
        await this.database.projects.update(projectId, { updatedAt: design.updatedAt });
      },
    );
  }
  saveViewSet(value: ViewSet) {
    return this.database.viewSets.put(value).then(() => undefined);
  }
  listViewSets(projectId: string) {
    return this.database.viewSets.where('projectId').equals(projectId).toArray();
  }
  async saveViewSetWithNode(value: ViewSet, node?: ViewSetNode, expectedExisting = false) {
    return this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.designs,
        this.database.viewSets,
        this.database.nodes,
        this.database.boards,
        this.database.assets,
        this.database.assetBlobs,
      ],
      async () => {
        const design = await this.database.designs.get(value.designId);
        const existing = await this.database.viewSets.get(value.id);
        if (
          !design ||
          design.projectId !== value.projectId ||
          !isValidDesignViews(value.views) ||
          typeof value.name !== 'string' ||
          !value.name.trim() ||
          value.name.length > 200 ||
          !(await this.database.projects.get(value.projectId)) ||
          (existing &&
            (existing.projectId !== value.projectId || existing.designId !== value.designId)) ||
          (expectedExisting ? !existing : Boolean(existing)) ||
          (!node && !expectedExisting)
        )
          throw new Error('Invalid view set ownership.');
        for (const assetId of Object.values(value.views)) {
          const asset = await this.database.assets.get(assetId);
          if (
            !asset ||
            asset.projectId !== value.projectId ||
            !asset.mimeType.startsWith('image/') ||
            asset.storage.type !== 'indexeddb' ||
            !(await this.database.assetBlobs.get(asset.storage.blobId))?.blob.size
          )
            throw new Error('View image is unavailable in this project.');
        }
        const viewSet = {
          ...value,
          views: { ...value.views },
          createdAt: existing?.createdAt ?? value.createdAt,
        };
        if (node) {
          const board = await this.database.boards.get(node.boardId);
          if (
            !board ||
            board.projectId !== value.projectId ||
            node.type !== 'viewset' ||
            node.designId !== value.designId ||
            node.viewSetId !== value.id ||
            ![node.x, node.y, node.width, node.height].every(Number.isFinite) ||
            node.width <= 0 ||
            node.height <= 0
          )
            throw new Error('Invalid view set node.');
          await this.database.nodes.add(node);
          await this.database.boards.put({
            ...board,
            nodeIds: [...board.nodeIds, node.id],
            updatedAt: value.updatedAt,
          });
        }
        await this.database.viewSets.put(viewSet);
        await this.database.projects.update(value.projectId, { updatedAt: value.updatedAt });
        return { viewSet, ...(node ? { node } : {}) };
      },
    );
  }
  saveCMFSet(value: CMFSet) {
    return this.database.cmfSets.put(value).then(() => undefined);
  }
  listCMFSets(projectId: string) {
    return this.database.cmfSets.where('projectId').equals(projectId).toArray();
  }
  listCMFVariants(projectId: string) {
    return this.database.cmfVariants.where('projectId').equals(projectId).toArray();
  }
  async saveCMFSetWithNode(
    value: CMFSet,
    values: CMFVariant[],
    node?: CMFNode,
    expectedExisting = false,
  ) {
    return this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.designs,
        this.database.cmfSets,
        this.database.cmfVariants,
        this.database.nodes,
        this.database.boards,
        this.database.assets,
        this.database.assetBlobs,
      ],
      async () => {
        const design = await this.database.designs.get(value.designId);
        const existing = await this.database.cmfSets.get(value.id);
        if (
          !design ||
          design.projectId !== value.projectId ||
          !(await this.database.projects.get(value.projectId)) ||
          typeof value.name !== 'string' ||
          !value.name.trim() ||
          value.name.length > 200 ||
          (expectedExisting ? !existing : Boolean(existing)) ||
          (!node && !expectedExisting) ||
          (existing &&
            (existing.designId !== value.designId || existing.projectId !== value.projectId)) ||
          !Array.isArray(values) ||
          values.length < 1 ||
          values.length > 24 ||
          !Array.isArray(value.variantIds) ||
          value.variantIds.length !== values.length ||
          new Set(value.variantIds).size !== values.length ||
          values.some((variant, index) => variant.id !== value.variantIds[index])
        )
          throw new Error('Invalid CMF set ownership.');
        const variants: CMFVariant[] = [];
        for (const variant of values) {
          const { projectId, designId, createdAt, updatedAt, ...draft } = variant;
          const previous = await this.database.cmfVariants.get(variant.id);
          if (
            projectId !== value.projectId ||
            designId !== value.designId ||
            !Number.isFinite(createdAt) ||
            !Number.isFinite(updatedAt) ||
            !isValidCMFVariantDraft(draft) ||
            (previous &&
              (!existing?.variantIds.includes(variant.id) ||
                previous.projectId !== projectId ||
                previous.designId !== designId))
          )
            throw new Error('Invalid CMF variant ownership.');
          if (variant.textureAssetId) {
            const asset = await this.database.assets.get(variant.textureAssetId);
            if (
              !asset ||
              asset.projectId !== value.projectId ||
              !asset.mimeType.startsWith('image/') ||
              asset.storage.type !== 'indexeddb' ||
              !(await this.database.assetBlobs.get(asset.storage.blobId))?.blob.size
            )
              throw new Error('CMF texture is unavailable in this project.');
          }
          variants.push({
            ...variant,
            ...(variant.color ? { color: { ...variant.color } } : {}),
            createdAt: previous?.createdAt ?? createdAt,
          });
        }
        if (node) {
          const board = await this.database.boards.get(node.boardId);
          if (
            !board ||
            board.projectId !== value.projectId ||
            node.type !== 'cmf' ||
            node.designId !== value.designId ||
            node.cmfSetId !== value.id ||
            ![node.x, node.y, node.width, node.height].every(Number.isFinite) ||
            node.width <= 0 ||
            node.height <= 0
          )
            throw new Error('Invalid CMF node.');
          await this.database.nodes.add(node);
          await this.database.boards.put({
            ...board,
            nodeIds: [...board.nodeIds, node.id],
            updatedAt: value.updatedAt,
          });
        }
        const cmfSet = {
          ...value,
          variantIds: [...value.variantIds],
          createdAt: existing?.createdAt ?? value.createdAt,
        };
        await this.database.cmfVariants.bulkPut(variants);
        await this.database.cmfSets.put(cmfSet);
        await this.database.projects.update(value.projectId, { updatedAt: value.updatedAt });
        return { cmfSet, variants, ...(node ? { node } : {}) };
      },
    );
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
  getSketchDocument(id: string) {
    return this.database.sketchDocuments.get(id);
  }

  async saveSketchSnapshot(input: {
    document: SketchDocument;
    node: SketchNode;
    source: Asset;
    preview: Asset;
    sourceBlob: Blob;
    previewBlob: Blob;
  }): Promise<void> {
    const { document, node, source, preview, sourceBlob, previewBlob } = input;
    // Decode before opening the transaction: Blob reads must not let Dexie go idle.
    const scene = JSON.parse(await sourceBlob.text()) as Record<string, unknown>;
    if (
      scene.type !== 'excalidraw' ||
      scene.version !== 2 ||
      !Array.isArray(scene.elements) ||
      sourceBlob.type !== 'application/json' ||
      previewBlob.type !== 'image/png' ||
      !sourceBlob.size ||
      !previewBlob.size ||
      sourceBlob.size > 50 * 1024 * 1024 ||
      previewBlob.size > 25 * 1024 * 1024 ||
      document.format !== 'excalidraw' ||
      document.formatVersion !== 2 ||
      node.type !== 'sketch' ||
      node.sketchDocumentId !== document.id ||
      node.previewAssetId !== preview.id ||
      document.sourceAssetId !== source.id ||
      document.previewAssetId !== preview.id ||
      source.id === preview.id ||
      source.type !== 'document' ||
      preview.type !== 'image' ||
      source.mimeType !== sourceBlob.type ||
      preview.mimeType !== previewBlob.type ||
      source.size !== sourceBlob.size ||
      preview.size !== previewBlob.size ||
      [source, preview].some(
        (asset) =>
          asset.projectId !== document.projectId ||
          asset.storage.type !== 'indexeddb' ||
          asset.storage.blobId !== asset.id,
      ) ||
      ![node.x, node.y, node.width, node.height, node.rotation, node.zIndex].every(
        Number.isFinite,
      ) ||
      node.width <= 0 ||
      node.height <= 0
    )
      throw new Error('Invalid sketch snapshot.');
    await this.database.transaction(
      'rw',
      [
        this.database.projects,
        this.database.boards,
        this.database.nodes,
        this.database.sketchDocuments,
        this.database.assets,
        this.database.assetBlobs,
      ],
      async () => {
        const project = await this.database.projects.get(document.projectId);
        const board = await this.database.boards.get(node.boardId);
        const previous = (await this.database.nodes.get(node.id)) as SketchNode | undefined;
        const oldDocument = await this.database.sketchDocuments.get(document.id);
        if (
          !project ||
          !board ||
          board.projectId !== project.id ||
          !project.boardIds.includes(board.id) ||
          (previous &&
            (previous.type !== 'sketch' ||
              previous.boardId !== board.id ||
              previous.locked ||
              previous.sketchDocumentId !== document.id ||
              previous.createdAt !== node.createdAt)) ||
          (oldDocument &&
            (oldDocument.projectId !== project.id ||
              !previous ||
              oldDocument.createdAt !== document.createdAt)) ||
          (previous && !oldDocument) ||
          (!previous && board.nodeIds.includes(node.id))
        )
          throw new Error('Invalid sketch ownership.');
        // Each save owns fresh immutable assets. Existing generations may still reference old previews.
        await this.database.assets.add(source);
        await this.database.assets.add(preview);
        await this.database.assetBlobs.add({ id: source.id, blob: sourceBlob });
        await this.database.assetBlobs.add({ id: preview.id, blob: previewBlob });
        await this.database.sketchDocuments.put(document);
        await this.database.nodes.put(node);
        const representations = (await this.database.nodes.toArray()).filter(
          (item) =>
            item.id !== node.id &&
            item.type === 'sketch' &&
            (item as SketchNode).sketchDocumentId === document.id,
        );
        for (const representation of representations) {
          const ownerBoard = await this.database.boards.get(representation.boardId);
          if (
            !ownerBoard ||
            ownerBoard.projectId !== project.id ||
            !project.boardIds.includes(ownerBoard.id)
          )
            throw new Error('Invalid shared sketch ownership.');
          await this.database.nodes.put({
            ...representation,
            previewAssetId: preview.id,
            updatedAt: document.updatedAt,
          } as SketchNode);
          if (ownerBoard.id !== board.id)
            await this.database.boards.put({ ...ownerBoard, updatedAt: document.updatedAt });
        }
        await this.database.boards.put({
          ...board,
          nodeIds: previous ? board.nodeIds : [...board.nodeIds, node.id],
          updatedAt: document.updatedAt,
        });
        await this.database.projects.update(project.id, { updatedAt: document.updatedAt });
      },
    );
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
    validateCanvasGroups(snapshot.nodes);
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
        const currentProject = await this.database.projects.get(snapshot.project.id);
        await this.database.projects.put({
          ...snapshot.project,
          ...(currentProject ? { researchLibrary: currentProject.researchLibrary } : {}),
        });
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

  async listMaterialAnalyses(projectId: string) {
    return (await this.database.generations.where('projectId').equals(projectId).toArray())
      .filter((run) => run.actionId === 'ai.analyzeMaterials')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getMaterialAnalysisBlob(projectId: string, generationId: string, snapshotId: string) {
    const run = await this.database.generations.get(generationId);
    if (
      run?.projectId !== projectId ||
      run.actionId !== 'ai.analyzeMaterials' ||
      !run.inputSnapshots?.some((input) => input.id === snapshotId)
    )
      return undefined;
    const stored = await this.database.generationInputBlobs.get(snapshotId);
    return stored?.projectId === projectId && stored.generationId === generationId
      ? stored.blob
      : undefined;
  }

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
