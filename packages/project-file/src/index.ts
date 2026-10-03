import { strFromU8, strToU8, Inflate, unzipSync, zipSync, type UnzipFileInfo } from 'fflate';
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
  Project,
  SketchDocument,
  ViewSet,
} from '@open-industrial-design/design-model';
import {
  PROJECT_SCHEMA_VERSION,
  validateGenerationInput,
  validateGenerationOutput,
  generationViewNames,
  isValidEditRegion,
  materializeCandidateResults,
  type CandidateNode,
} from '@open-industrial-design/design-model';

export const OID_PROJECT_FORMAT = 'open-industrial-design';
export const OID_PROJECT_SCHEMA_VERSION = PROJECT_SCHEMA_VERSION;
export const OID_PROJECT_MIME_TYPE = 'application/vnd.open-industrial-design.project+zip';

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 250 * 1024 * 1024;
const secretKeyPattern = /(?:api[_-]?key|authorization|credential|password|secret|token)/i;
const safeBlobIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export type ProjectArchiveErrorCode =
  | 'archive_too_large'
  | 'project_conflict'
  | 'corrupt_archive'
  | 'invalid_archive_path'
  | 'invalid_manifest'
  | 'unsupported_schema_version'
  | 'invalid_project_data'
  | 'missing_asset_blob'
  | 'unsupported_asset_storage'
  | 'secrets_not_allowed';

export class ProjectArchiveError extends Error {
  constructor(
    readonly code: ProjectArchiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectArchiveError';
  }
}

export interface OidProjectManifest {
  format: typeof OID_PROJECT_FORMAT;
  schemaVersion: number;
  projectId: string;
  projectName: string;
  createdAt: number;
  exportedAt: number;
}

/** JSON-only project data. Binary asset payloads live in separate ZIP entries. */
export interface ProjectArchiveSnapshot {
  project: Project;
  boards: Board[];
  nodes: BaseNode[];
  edges: Edge[];
  assets: Asset[];
  designs: Design[];
  relations: DesignRelation[];
  viewSets: ViewSet[];
  cmfSets: CMFSet[];
  cmfVariants: CMFVariant[];
  generations: Generation[];
  candidates: GenerationCandidate[];
  sketchDocuments: SketchDocument[];
  graphViewState?: GraphViewState;
}

export interface ProjectArchiveAssetBlob {
  id: string;
  blob: Blob;
}

export interface ProjectArchiveData extends ProjectArchiveSnapshot {
  generationInputBlobs?: ProjectArchiveAssetBlob[];
  assetBlobs: ProjectArchiveAssetBlob[];
  candidateBlobs: ProjectArchiveAssetBlob[];
  manifest: OidProjectManifest;
}

export interface CreateProjectArchiveInput extends ProjectArchiveSnapshot {
  generationInputBlobs?: ProjectArchiveAssetBlob[];
  assetBlobs: ProjectArchiveAssetBlob[];
  candidateBlobs: ProjectArchiveAssetBlob[];
  exportedAt?: number;
}

type JsonRecord = Record<string, unknown>;
type RawArchiveData = Omit<ProjectArchiveSnapshot, 'project'> & { project: unknown };

function fail(code: ProjectArchiveErrorCode, message: string): never {
  throw new ProjectArchiveError(code, message);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeArchivePath(path: string) {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  );
}

function assertSafeArchivePath(path: string) {
  if (!isSafeArchivePath(path)) fail('invalid_archive_path', `Unsafe archive path: ${path}`);
}

function assertNoSecretFields(value: unknown, path = 'archive') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretFields(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (secretKeyPattern.test(key))
      fail('secrets_not_allowed', `Secret-like field is not allowed: ${path}.${key}`);
    assertNoSecretFields(nested, `${path}.${key}`);
  }
}

function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !secretKeyPattern.test(key))
      .map(([key, nested]) => [key, redactSecrets(nested)]),
  ) as T;
}

function jsonEntry(value: unknown) {
  return strToU8(JSON.stringify(redactSecrets(value)));
}

function parseJsonEntry(entries: Record<string, Uint8Array>, path: string): unknown {
  const value = entries[path];
  if (!value) fail('invalid_project_data', `Missing required archive entry: ${path}`);
  try {
    return JSON.parse(strFromU8(value));
  } catch {
    return fail('invalid_project_data', `Invalid JSON in archive entry: ${path}`);
  }
}

function parseArrayEntry(entries: Record<string, Uint8Array>, path: string): unknown[] {
  const value = parseJsonEntry(entries, path);
  if (!Array.isArray(value))
    fail('invalid_project_data', `Expected an array in archive entry: ${path}`);
  return value;
}

function assertEntityArray(value: unknown[], label: string, projectId: string) {
  value.forEach((entity, index) => {
    if (!isRecord(entity) || typeof entity.id !== 'string' || typeof entity.projectId !== 'string')
      fail('invalid_project_data', `${label}[${index}] is not a valid entity.`);
    if (entity.projectId !== projectId)
      fail('invalid_project_data', `${label}[${index}] belongs to another project.`);
  });
}

function assertSnapshotIntegrity(snapshot: ProjectArchiveSnapshot, assetBlobIds: Set<string>) {
  const { project } = snapshot;
  if (
    !project ||
    typeof project.id !== 'string' ||
    project.schemaVersion !== OID_PROJECT_SCHEMA_VERSION
  )
    fail('invalid_project_data', 'Project data is missing or has an unsupported schema version.');
  if (!Array.isArray(project.boardIds) || !isRecord(project.settings))
    fail('invalid_project_data', 'Project data is incomplete.');

  const boardIds = new Set(snapshot.boards.map((board) => board.id));
  if (!project.activeBoardId || !boardIds.has(project.activeBoardId))
    fail('invalid_project_data', 'Project active board is missing from the archive.');
  if (project.boardIds.some((id) => !boardIds.has(id)))
    fail('invalid_project_data', 'Project board references are incomplete.');
  snapshot.boards.forEach((board) => {
    if (board.projectId !== project.id)
      fail('invalid_project_data', 'Board belongs to another project.');
  });

  const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
  snapshot.nodes.forEach((node) => {
    if (!boardIds.has(node.boardId))
      fail('invalid_project_data', 'Node references a missing board.');
    if (node.type === 'generation') {
      const task = node as GenerationNode;
      if (task.localEdit !== undefined && typeof task.localEdit !== 'boolean')
        fail('invalid_project_data', 'Local edit mode is invalid.');
      if (task.localEdit && task.requestedViews)
        fail('invalid_project_data', 'Local edits cannot generate multiple views.');
      if (task.editRegion !== undefined) {
        const source = snapshot.nodes.find((item) => item.id === task.editRegion?.sourceNodeId) as
          | (BaseNode & { assetId?: string; previewAssetId?: string; candidateId?: string })
          | undefined;
        if (
          !task.localEdit ||
          !isValidEditRegion(task.editRegion) ||
          !source ||
          source.boardId !== node.boardId ||
          (source.assetId ?? source.previewAssetId ?? source.candidateId) !==
            task.editRegion.sourceAssetId
        )
          fail(
            'invalid_project_data',
            'Local edit region is invalid or references a missing source.',
          );
      }
      if (
        task.requestedViews !== undefined &&
        (!Array.isArray(task.requestedViews) ||
          !task.requestedViews.length ||
          task.requestedViews.length > 4 ||
          new Set(task.requestedViews).size !== task.requestedViews.length ||
          task.requestedViews.some((view) => !generationViewNames.includes(view)) ||
          task.count !== task.requestedViews.length)
      )
        fail('invalid_project_data', 'Generation view selection is invalid.');
    }
  });
  snapshot.boards.forEach((board) => {
    if (board.nodeIds.some((id) => !nodeIds.has(id)))
      fail('invalid_project_data', 'Board references a missing node.');
    if (board.edgeIds.some((id) => !snapshot.edges.some((edge) => edge.id === id)))
      fail('invalid_project_data', 'Board references a missing edge.');
  });
  const checkedEdges: Edge[] = [];
  snapshot.edges.forEach((edge) => {
    const source = snapshot.nodes.find((node) => node.id === edge.sourceNodeId);
    const target = snapshot.nodes.find((node) => node.id === edge.targetNodeId);
    if (!source || !target || source.boardId !== edge.boardId || target.boardId !== edge.boardId)
      fail('invalid_project_data', 'Edge references missing or cross-board nodes.');
    if (edge.type === 'generation_input') {
      if (
        !['base', 'reference'].includes(edge.inputRole ?? '') ||
        validateGenerationInput(
          snapshot.nodes,
          checkedEdges,
          edge.sourceNodeId,
          edge.targetNodeId,
          edge.inputRole!,
        )
      )
        fail('invalid_project_data', 'Generation input edge is invalid.');
    }
    if (
      edge.type === 'generation_output' &&
      validateGenerationOutput(snapshot.nodes, checkedEdges, edge.sourceNodeId, edge.targetNodeId)
    )
      fail('invalid_project_data', 'Generation output edge is invalid.');
    checkedEdges.push(edge);
  });

  const assetIds = new Set(snapshot.assets.map((asset) => asset.id));
  snapshot.assets.forEach((asset) => {
    if (asset.projectId !== project.id)
      fail('invalid_project_data', 'Asset belongs to another project.');
    if (asset.storage.type === 'local-file')
      fail(
        'unsupported_asset_storage',
        'Local-file assets cannot be imported from a portable project archive.',
      );
    if (asset.storage.type === 'indexeddb' && !assetBlobIds.has(asset.storage.blobId))
      fail('missing_asset_blob', `Asset blob is missing: ${asset.storage.blobId}`);
    if (asset.thumbnailAssetId && !assetIds.has(asset.thumbnailAssetId))
      fail('invalid_project_data', 'Asset references a missing thumbnail.');
  });
  snapshot.nodes.forEach((node) => {
    const nodeWithAsset = node as BaseNode & { assetId?: string; previewAssetId?: string };
    if (nodeWithAsset.assetId && !assetIds.has(nodeWithAsset.assetId))
      fail('missing_asset_blob', 'Node references a missing asset.');
    if (nodeWithAsset.previewAssetId && !assetIds.has(nodeWithAsset.previewAssetId))
      fail('missing_asset_blob', 'Node references a missing preview asset.');
  });

  const designIds = new Set(snapshot.designs.map((design) => design.id));
  assertEntityArray(snapshot.designs, 'designs', project.id);
  snapshot.designs.forEach((design) => {
    if (design.parentDesignId && !designIds.has(design.parentDesignId))
      fail('invalid_project_data', 'Design lineage references a missing parent design.');
  });
  assertEntityArray(snapshot.relations, 'relations', project.id);
  snapshot.relations.forEach((relation) => {
    if (!designIds.has(relation.sourceDesignId) || !designIds.has(relation.targetDesignId))
      fail('invalid_project_data', 'Design relation references a missing design.');
  });
  assertEntityArray(snapshot.viewSets, 'viewSets', project.id);
  snapshot.viewSets.forEach((viewSet) => {
    if (!designIds.has(viewSet.designId))
      fail('invalid_project_data', 'ViewSet references a missing design.');
    Object.values(viewSet.views).forEach((assetId) => {
      if (assetId && !assetIds.has(assetId))
        fail('missing_asset_blob', 'ViewSet references a missing asset.');
    });
  });
  assertEntityArray(snapshot.cmfSets, 'cmfSets', project.id);
  assertEntityArray(snapshot.cmfVariants, 'cmfVariants', project.id);
  snapshot.cmfSets.forEach((set) => {
    if (!designIds.has(set.designId))
      fail('invalid_project_data', 'CMF set references a missing design.');
  });
  snapshot.cmfVariants.forEach((variant) => {
    if (!designIds.has(variant.designId))
      fail('invalid_project_data', 'CMF variant references a missing design.');
    if (variant.textureAssetId && !assetIds.has(variant.textureAssetId))
      fail('missing_asset_blob', 'CMF variant references a missing asset.');
  });
  assertEntityArray(snapshot.generations, 'generations', project.id);
  const snapshotIds = new Set<string>();
  snapshot.generations.forEach((generation) => {
    if (generation.inputSnapshots !== undefined && !Array.isArray(generation.inputSnapshots))
      fail('invalid_project_data', 'Generation input snapshots must be an array.');
    (generation.inputSnapshots ?? []).forEach((input) => {
      if (
        !input ||
        typeof input.id !== 'string' ||
        !safeBlobIdPattern.test(input.id) ||
        typeof input.sourceNodeId !== 'string' ||
        !input.sourceNodeId ||
        !['base', 'reference', 'mask'].includes(input.role) ||
        typeof input.mimeType !== 'string' ||
        !input.mimeType.startsWith('image/') ||
        snapshotIds.has(input.id) ||
        snapshot.assets.some(
          (asset) => asset.storage.type === 'indexeddb' && asset.storage.blobId === input.id,
        ) ||
        snapshot.candidates.some((candidate) => candidate.id === input.id)
      )
        fail('invalid_project_data', 'Generation input snapshot is invalid or duplicated.');
      snapshotIds.add(input.id);
      if (!assetBlobIds.has(input.id))
        fail('missing_asset_blob', 'Generation input snapshot bytes are missing.');
    });
  });
  assertEntityArray(snapshot.candidates, 'candidates', project.id);
  snapshot.candidates.forEach((candidate) => {
    if (candidate.view !== undefined && !generationViewNames.includes(candidate.view))
      fail('invalid_project_data', 'Candidate view is invalid.');
    const node = snapshot.nodes.find((item) => item.id === candidate.generationNodeId);
    if (!node || node.type !== 'generation' || node.boardId !== candidate.boardId)
      fail('invalid_project_data', 'Candidate references a missing generation node.');
    if (!snapshot.generations.some((item) => item.id === candidate.generationId))
      fail('invalid_project_data', 'Candidate references a missing generation record.');
    if (candidate.sourceDesignId && !designIds.has(candidate.sourceDesignId))
      fail('invalid_project_data', 'Candidate references a missing source design.');
    if (!assetBlobIds.has(candidate.id))
      fail('missing_asset_blob', 'Candidate image blob is missing.');
    const results = snapshot.nodes.filter(
      (item) => item.type === 'candidate' && (item as CandidateNode).candidateId === candidate.id,
    );
    if (results.length !== 1 || results[0]?.boardId !== candidate.boardId)
      fail('invalid_project_data', 'Candidate must have exactly one result node on its Board.');
    const outputs = snapshot.edges.filter(
      (edge) => edge.type === 'generation_output' && edge.targetNodeId === results[0]?.id,
    );
    if (outputs.length !== 1 || outputs[0]?.sourceNodeId !== candidate.generationNodeId)
      fail('invalid_project_data', 'Candidate result must have exactly one source output edge.');
  });
  snapshot.nodes
    .filter((node) => node.type === 'candidate')
    .forEach((node) => {
      if (
        !snapshot.candidates.some(
          (candidate) => candidate.id === (node as CandidateNode).candidateId,
        )
      )
        fail('invalid_project_data', 'Candidate result references missing metadata.');
    });
  assertEntityArray(snapshot.sketchDocuments, 'sketchDocuments', project.id);
  snapshot.sketchDocuments.forEach((document) => {
    if (!assetIds.has(document.sourceAssetId))
      fail('missing_asset_blob', 'Sketch document references a missing source asset.');
    if (document.previewAssetId && !assetIds.has(document.previewAssetId))
      fail('missing_asset_blob', 'Sketch document references a missing preview asset.');
  });
  if (snapshot.graphViewState && snapshot.graphViewState.projectId !== project.id)
    fail('invalid_project_data', 'Graph view state belongs to another project.');
}

function migrateV0ToV1(raw: RawArchiveData): RawArchiveData {
  const project = isRecord(raw.project)
    ? {
        ...raw.project,
        schemaVersion: 1,
        settings: isRecord(raw.project.settings) ? raw.project.settings : {},
      }
    : raw.project;
  return { ...raw, project };
}

function migrateV1ToV2(raw: RawArchiveData): RawArchiveData {
  const project = isRecord(raw.project) ? { ...raw.project, schemaVersion: 2 } : raw.project;
  return { ...raw, project, candidates: raw.candidates ?? [] };
}

function migrateV2ToV3(raw: RawArchiveData): RawArchiveData {
  const project = isRecord(raw.project) ? { ...raw.project, schemaVersion: 3 } : raw.project;
  return { ...raw, project };
}

function migrateV3ToV4(raw: RawArchiveData): RawArchiveData {
  const project = isRecord(raw.project) ? { ...raw.project, schemaVersion: 4 } : raw.project;
  return { ...raw, project };
}

function migrateV4ToV5(raw: RawArchiveData): RawArchiveData {
  const project = isRecord(raw.project) ? { ...raw.project, schemaVersion: 5 } : raw.project;
  return { ...raw, project };
}

function migrateV5ToV6(raw: RawArchiveData): RawArchiveData {
  let added: ReturnType<typeof materializeCandidateResults>;
  try {
    added = materializeCandidateResults(raw.nodes, raw.edges, raw.candidates);
  } catch (error) {
    fail(
      'invalid_project_data',
      error instanceof Error ? error.message : 'Candidate migration failed.',
    );
  }
  return {
    ...raw,
    project: isRecord(raw.project) ? { ...raw.project, schemaVersion: 6 } : raw.project,
    nodes: [...raw.nodes, ...added.nodes],
    edges: [...raw.edges, ...added.edges],
    boards: raw.boards.map((board) => ({
      ...board,
      nodeIds: [
        ...new Set([
          ...board.nodeIds,
          ...added.nodes.filter((node) => node.boardId === board.id).map((node) => node.id),
        ]),
      ],
      edgeIds: [
        ...new Set([
          ...board.edgeIds,
          ...added.edges.filter((edge) => edge.boardId === board.id).map((edge) => edge.id),
        ]),
      ],
    })),
  };
}

function migrateRawArchive(raw: RawArchiveData, manifest: OidProjectManifest): RawArchiveData {
  let data = raw;
  let version = manifest.schemaVersion;
  if (version < 0 || !Number.isInteger(version))
    fail('unsupported_schema_version', 'Archive schema version is invalid.');
  if (version > OID_PROJECT_SCHEMA_VERSION)
    fail(
      'unsupported_schema_version',
      `Archive schema version ${version} is newer than this app supports.`,
    );
  while (version < OID_PROJECT_SCHEMA_VERSION) {
    if (version === 0) data = migrateV0ToV1(data);
    else if (version === 1) data = migrateV1ToV2(data);
    else if (version === 2) data = migrateV2ToV3(data);
    else if (version === 3) data = migrateV3ToV4(data);
    else if (version === 4) data = migrateV4ToV5(data);
    else if (version === 5) data = migrateV5ToV6(data);
    else if (version === 6)
      data = {
        ...data,
        project: isRecord(data.project) ? { ...data.project, schemaVersion: 7 } : data.project,
      };
    else
      fail(
        'unsupported_schema_version',
        `No migration is available from schema version ${version}.`,
      );
    version += 1;
  }
  return data;
}

function parseManifest(value: unknown): OidProjectManifest {
  if (
    !isRecord(value) ||
    value.format !== OID_PROJECT_FORMAT ||
    typeof value.schemaVersion !== 'number' ||
    typeof value.projectId !== 'string' ||
    typeof value.projectName !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.exportedAt !== 'number'
  ) {
    fail('invalid_manifest', 'Archive manifest is missing or invalid.');
  }
  return value as unknown as OidProjectManifest;
}

function makeRawArchive(entries: Record<string, Uint8Array>): RawArchiveData {
  return {
    project: parseJsonEntry(entries, 'project.json'),
    boards: parseArrayEntry(entries, 'data/boards.json') as Board[],
    nodes: parseArrayEntry(entries, 'data/nodes.json') as BaseNode[],
    edges: parseArrayEntry(entries, 'data/edges.json') as Edge[],
    assets: parseArrayEntry(entries, 'data/assets.json') as Asset[],
    designs: parseArrayEntry(entries, 'data/designs.json') as Design[],
    relations: parseArrayEntry(entries, 'data/relations.json') as DesignRelation[],
    viewSets: parseArrayEntry(entries, 'data/viewsets.json') as ViewSet[],
    cmfSets: parseArrayEntry(entries, 'data/cmf-sets.json') as CMFSet[],
    cmfVariants: parseArrayEntry(entries, 'data/cmf-variants.json') as CMFVariant[],
    generations: parseArrayEntry(entries, 'data/generations.json') as Generation[],
    candidates: entries['data/candidates.json']
      ? (parseArrayEntry(entries, 'data/candidates.json') as GenerationCandidate[])
      : [],
    sketchDocuments: parseArrayEntry(entries, 'data/sketch-documents.json') as SketchDocument[],
    graphViewState: entries['data/graph-view-state.json']
      ? (parseJsonEntry(entries, 'data/graph-view-state.json') as GraphViewState)
      : undefined,
  };
}

function collectArchiveBlobIds(snapshot: ProjectArchiveSnapshot) {
  return new Set(
    snapshot.assets.flatMap((asset) =>
      asset.storage.type === 'indexeddb' ? [asset.storage.blobId] : [],
    ),
  );
}

/** Validates an already materialized archive before a persistence adapter receives it. */
export function validateProjectArchiveData(value: ProjectArchiveData): void {
  if (!isRecord(value)) fail('invalid_project_data', 'Project archive data is invalid.');
  const snapshot: ProjectArchiveSnapshot = {
    project: value.project,
    boards: value.boards,
    nodes: value.nodes,
    edges: value.edges,
    assets: value.assets,
    designs: value.designs,
    relations: value.relations,
    viewSets: value.viewSets,
    cmfSets: value.cmfSets,
    cmfVariants: value.cmfVariants,
    generations: value.generations,
    candidates: value.candidates,
    sketchDocuments: value.sketchDocuments,
    graphViewState: value.graphViewState,
  };
  const collections = [
    snapshot.boards,
    snapshot.nodes,
    snapshot.edges,
    snapshot.assets,
    snapshot.designs,
    snapshot.relations,
    snapshot.viewSets,
    snapshot.cmfSets,
    snapshot.cmfVariants,
    snapshot.generations,
    snapshot.candidates,
    snapshot.sketchDocuments,
  ];
  if (collections.some((collection) => !Array.isArray(collection)))
    fail('invalid_project_data', 'Project archive collections must be arrays.');

  const manifest = parseManifest(value.manifest);
  if (
    !isRecord(snapshot.project) ||
    manifest.projectId !== snapshot.project.id ||
    manifest.projectName !== snapshot.project.name ||
    manifest.schemaVersion !== snapshot.project.schemaVersion
  )
    fail('invalid_project_data', 'Manifest does not match project data.');
  assertNoSecretFields({ ...snapshot, manifest });

  const blobGroups = [value.assetBlobs, value.candidateBlobs, value.generationInputBlobs ?? []];
  if (blobGroups.some((group) => !Array.isArray(group)))
    fail('invalid_project_data', 'Project archive blob collections must be arrays.');
  const suppliedBlobIds = new Set<string>();
  blobGroups.flat().forEach((entry) => {
    const blob = isRecord(entry) ? (entry.blob as Blob | undefined) : undefined;
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      !safeBlobIdPattern.test(entry.id) ||
      !blob ||
      typeof blob.size !== 'number' ||
      typeof blob.type !== 'string'
    )
      fail('invalid_project_data', 'Project archive contains an invalid blob.');
    if (suppliedBlobIds.has(entry.id))
      fail('invalid_project_data', `Project archive contains a duplicate blob: ${entry.id}`);
    suppliedBlobIds.add(entry.id);
  });

  const requiredBlobIds = collectArchiveBlobIds(snapshot);
  snapshot.candidates.forEach((candidate) => requiredBlobIds.add(candidate.id));
  snapshot.generations.forEach((generation) => {
    if (generation.inputSnapshots !== undefined && !Array.isArray(generation.inputSnapshots))
      fail('invalid_project_data', 'Generation input snapshots must be an array.');
    (generation.inputSnapshots ?? []).forEach((input) => requiredBlobIds.add(input.id));
  });
  requiredBlobIds.forEach((id) => {
    if (!safeBlobIdPattern.test(id))
      fail('invalid_archive_path', `Unsafe asset blob identifier: ${id}`);
    if (!suppliedBlobIds.has(id)) fail('missing_asset_blob', `Asset blob is missing: ${id}`);
  });
  suppliedBlobIds.forEach((id) => {
    if (!requiredBlobIds.has(id))
      fail('invalid_project_data', `Project archive contains an unreferenced blob: ${id}`);
  });
  assertSnapshotIntegrity(snapshot, suppliedBlobIds);
}

/** Creates a portable .oidproj Blob. Blobs are ZIP entries, never Base64 JSON. */
export async function createOidProjectArchive(input: CreateProjectArchiveInput): Promise<Blob> {
  const snapshot: ProjectArchiveSnapshot = redactSecrets({
    project: input.project,
    boards: input.boards,
    nodes: input.nodes,
    edges: input.edges,
    assets: input.assets,
    designs: input.designs,
    relations: input.relations,
    viewSets: input.viewSets,
    cmfSets: input.cmfSets,
    cmfVariants: input.cmfVariants,
    generations: input.generations,
    candidates: input.candidates,
    sketchDocuments: input.sketchDocuments,
    graphViewState: input.graphViewState,
  });
  if (snapshot.assets.some((asset) => asset.storage.type === 'local-file'))
    fail(
      'unsupported_asset_storage',
      'Export cannot include local absolute file paths. Import the file into local storage first.',
    );

  const requiredBlobIds = collectArchiveBlobIds(snapshot);
  snapshot.candidates.forEach((candidate) => requiredBlobIds.add(candidate.id));
  const inputSnapshotIds = new Set(
    snapshot.generations.flatMap((generation) =>
      (generation.inputSnapshots ?? []).map((item) => item.id),
    ),
  );
  inputSnapshotIds.forEach((id) => requiredBlobIds.add(id));
  const suppliedBlobs = new Map(input.assetBlobs.map((assetBlob) => [assetBlob.id, assetBlob]));
  input.candidateBlobs.forEach((candidateBlob) =>
    suppliedBlobs.set(candidateBlob.id, candidateBlob),
  );
  (input.generationInputBlobs ?? []).forEach((blob) => suppliedBlobs.set(blob.id, blob));
  requiredBlobIds.forEach((id) => {
    if (!safeBlobIdPattern.test(id))
      fail('invalid_archive_path', `Unsafe asset blob identifier: ${id}`);
    if (!suppliedBlobs.has(id)) fail('missing_asset_blob', `Asset blob is missing: ${id}`);
  });
  assertSnapshotIntegrity(snapshot, requiredBlobIds);

  const exportedAt = input.exportedAt ?? Date.now();
  const manifest: OidProjectManifest = {
    format: OID_PROJECT_FORMAT,
    schemaVersion: OID_PROJECT_SCHEMA_VERSION,
    projectId: snapshot.project.id,
    projectName: snapshot.project.name,
    createdAt: snapshot.project.createdAt,
    exportedAt,
  };
  const entries: Record<string, Uint8Array> = {
    'manifest.json': jsonEntry(manifest),
    'project.json': jsonEntry(snapshot.project),
    'data/boards.json': jsonEntry(snapshot.boards),
    'data/nodes.json': jsonEntry(snapshot.nodes),
    'data/edges.json': jsonEntry(snapshot.edges),
    'data/assets.json': jsonEntry(snapshot.assets),
    'data/designs.json': jsonEntry(snapshot.designs),
    'data/relations.json': jsonEntry(snapshot.relations),
    'data/viewsets.json': jsonEntry(snapshot.viewSets),
    'data/cmf-sets.json': jsonEntry(snapshot.cmfSets),
    'data/cmf-variants.json': jsonEntry(snapshot.cmfVariants),
    'data/generations.json': jsonEntry(snapshot.generations),
    'data/candidates.json': jsonEntry(snapshot.candidates),
    'data/sketch-documents.json': jsonEntry(snapshot.sketchDocuments),
  };
  if (snapshot.graphViewState)
    entries['data/graph-view-state.json'] = jsonEntry(snapshot.graphViewState);
  for (const blobId of requiredBlobIds) {
    const assetBlob = suppliedBlobs.get(blobId);
    if (!assetBlob) fail('missing_asset_blob', `Asset blob is missing: ${blobId}`);
    entries[
      `${inputSnapshotIds.has(blobId) ? 'generation-inputs' : snapshot.candidates.some((candidate) => candidate.id === blobId) ? 'candidates' : 'assets'}/${blobId}`
    ] = new Uint8Array(await assetBlob.blob.arrayBuffer());
  }
  return new Blob([zipSync(entries, { level: 6 })], { type: OID_PROJECT_MIME_TYPE });
}

async function toArchiveBytes(source: Blob | ArrayBuffer | Uint8Array) {
  const size = source instanceof Blob ? source.size : source.byteLength;
  if (size > MAX_ARCHIVE_BYTES)
    fail('archive_too_large', 'Archive exceeds the maximum supported size.');
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(await source.arrayBuffer());
}

/** Metadata is untrusted: preflight it, then independently count actual streamed output. */
async function readBoundedZip(bytes: Uint8Array, signal?: AbortSignal) {
  const declared = new Map<string, UnzipFileInfo>();
  let declaredTotal = 0;
  // A false filter inspects the central directory without inflating or allocating output buffers.
  unzipSync(bytes, {
    filter: (entry) => {
      assertSafeArchivePath(entry.name);
      if (entry.compression !== 0 && entry.compression !== 8)
        fail('corrupt_archive', 'Unsupported ZIP compression.');
      if (declared.has(entry.name)) fail('corrupt_archive', 'Duplicate archive entry.');
      if (declared.size >= 10000 || entry.originalSize > MAX_ENTRY_BYTES)
        fail('archive_too_large', 'Archive entry exceeds the supported limit.');
      declaredTotal += entry.originalSize;
      if (declaredTotal > MAX_EXPANDED_BYTES)
        fail('archive_too_large', 'Archive expands beyond the supported limit.');
      declared.set(entry.name, entry);
      return false;
    },
  });
  const entries: Record<string, Uint8Array> = Object.create(null);
  // Use central-directory offsets, never scan binary payloads for descriptor
  // signatures. Stored files may legitimately contain those exact bytes.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  const u64 = (offset: number) => {
    const value = u32(offset) + u32(offset + 4) * 0x100000000;
    if (!Number.isSafeInteger(value) || value > bytes.length)
      fail('corrupt_archive', 'ZIP offset is outside the archive.');
    return value;
  };
  let end = bytes.length - 22;
  while (end >= 0 && bytes.length - end <= 65558 && u32(end) !== 0x06054b50) end--;
  if (end < 0 || u32(end) !== 0x06054b50) fail('corrupt_archive', 'ZIP directory is missing.');
  let directory = u32(end + 16);
  if (end >= 20 && u32(end - 20) === 0x07064b50) {
    const zip64 = u64(end - 12);
    if (u32(zip64) !== 0x06064b50) fail('corrupt_archive', 'Invalid ZIP64 directory.');
    directory = u64(zip64 + 48);
  }
  const directoryStart = directory;
  let expandedSize = 0;
  let blocks = 0;
  for (const entry of declared.values()) {
    signal?.throwIfAborted();
    if (u32(directory) !== 0x02014b50) fail('corrupt_archive', 'Invalid ZIP directory entry.');
    const extraStart = directory + 46 + u16(directory + 28);
    const extraEnd = extraStart + u16(directory + 30);
    let local = u32(directory + 42);
    if (local === 0xffffffff) {
      for (let extra = extraStart; extra + 4 <= extraEnd;) {
        const length = u16(extra + 2);
        if (extra + 4 + length > extraEnd) fail('corrupt_archive', 'Invalid ZIP extra field.');
        if (u16(extra) === 1) {
          const offset =
            extra +
            4 +
            (u32(directory + 24) === 0xffffffff ? 8 : 0) +
            (u32(directory + 20) === 0xffffffff ? 8 : 0);
          if (offset + 8 > extra + 4 + length) fail('corrupt_archive', 'Missing ZIP64 offset.');
          local = u64(offset);
          break;
        }
        extra += 4 + length;
      }
    }
    if (u32(local) !== 0x04034b50 || u16(local + 6) & 1 || u16(local + 8) !== entry.compression)
      fail('corrupt_archive', 'Invalid local ZIP entry.');
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    const stop = start + entry.size;
    if (stop > directoryStart || start < local || stop < start)
      fail('corrupt_archive', 'ZIP entry is outside the data area.');
    directory = extraEnd + u16(directory + 32);
    const expected = entry.originalSize;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const consume = (data: Uint8Array) => {
      size += data.byteLength;
      expandedSize += data.byteLength;
      if (size > MAX_ENTRY_BYTES || expandedSize > MAX_EXPANDED_BYTES)
        fail('archive_too_large', 'Archive expands beyond the supported limit.');
      if (size > expected)
        fail('corrupt_archive', 'Archive entry size does not match its directory.');
      chunks.push(data);
    };
    const inflate = entry.compression === 8 ? new Inflate(consume) : undefined;
    for (let offset = start; offset < stop; offset += 1024) {
      signal?.throwIfAborted();
      const chunk = bytes.subarray(offset, Math.min(offset + 1024, stop));
      if (inflate) inflate.push(chunk, offset + 1024 >= stop);
      else consume(chunk);
      if (blocks++ % 16 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (inflate && start === stop) inflate.push(new Uint8Array(), true);
    if (size !== expected) fail('corrupt_archive', 'Incomplete archive entry.');
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    entries[entry.name] = output;
  }
  signal?.throwIfAborted();
  return entries;
}

/** Parses and validates an archive before any persistence adapter receives it. */
export async function importOidProjectArchive(
  source: Blob | ArrayBuffer | Uint8Array,
  signal?: AbortSignal,
): Promise<ProjectArchiveData> {
  signal?.throwIfAborted();
  const bytes = await toArchiveBytes(source);
  if (bytes.byteLength > MAX_ARCHIVE_BYTES)
    fail('archive_too_large', 'Archive exceeds the maximum supported size.');
  let entries: Record<string, Uint8Array>;
  try {
    entries = await readBoundedZip(bytes, signal);
  } catch (error) {
    if (error instanceof ProjectArchiveError || signal?.aborted) throw error;
    return fail('corrupt_archive', 'Archive cannot be read as a valid ZIP file.');
  }
  let expandedSize = 0;
  for (const [path, value] of Object.entries(entries)) {
    assertSafeArchivePath(path);
    if (value.byteLength > MAX_ENTRY_BYTES)
      fail('archive_too_large', `Archive entry exceeds the maximum supported size: ${path}`);
    expandedSize += value.byteLength;
    if (expandedSize > MAX_EXPANDED_BYTES)
      fail('archive_too_large', 'Archive expands beyond the maximum supported size.');
  }

  const manifest = parseManifest(parseJsonEntry(entries, 'manifest.json'));
  if (manifest.schemaVersion >= 2 && !entries['data/candidates.json'])
    fail('invalid_project_data', 'Candidate metadata is missing from this project archive.');
  const raw = makeRawArchive(entries);
  assertNoSecretFields(raw);
  const migrated = migrateRawArchive(raw, manifest);
  if (!isRecord(migrated.project)) fail('invalid_project_data', 'Project entry is invalid.');
  const snapshot: ProjectArchiveSnapshot = {
    ...migrated,
    project: migrated.project as unknown as Project,
  };
  if (snapshot.project.id !== manifest.projectId)
    fail('invalid_project_data', 'Manifest project ID does not match project data.');
  const assetBlobIds = new Set<string>();
  const assetBlobs: ProjectArchiveAssetBlob[] = [];
  for (const asset of snapshot.assets) {
    if (asset.storage.type !== 'indexeddb') continue;
    const blobId = asset.storage.blobId;
    if (!safeBlobIdPattern.test(blobId))
      fail('invalid_archive_path', `Unsafe asset blob identifier: ${blobId}`);
    const entry = entries[`assets/${blobId}`];
    if (!entry) fail('missing_asset_blob', `Asset blob is missing: ${blobId}`);
    if (!assetBlobIds.has(blobId)) {
      assetBlobIds.add(blobId);
      const copiedBytes = new Uint8Array(entry.byteLength);
      copiedBytes.set(entry);
      assetBlobs.push({ id: blobId, blob: new Blob([copiedBytes], { type: asset.mimeType }) });
    }
  }
  const candidateBlobs: ProjectArchiveAssetBlob[] = [];
  for (const candidate of snapshot.candidates) {
    if (!safeBlobIdPattern.test(candidate.id))
      fail('invalid_archive_path', 'Unsafe candidate blob identifier.');
    const entry = entries[`candidates/${candidate.id}`];
    if (!entry) fail('missing_asset_blob', `Candidate blob is missing: ${candidate.id}`);
    assetBlobIds.add(candidate.id);
    const copiedBytes = new Uint8Array(entry.byteLength);
    copiedBytes.set(entry);
    candidateBlobs.push({
      id: candidate.id,
      blob: new Blob([copiedBytes], { type: candidate.mimeType }),
    });
  }
  const generationInputBlobs: ProjectArchiveAssetBlob[] = [];
  for (const generation of snapshot.generations) {
    if (generation.inputSnapshots !== undefined && !Array.isArray(generation.inputSnapshots))
      fail('invalid_project_data', 'Generation input snapshots must be an array.');
    for (const input of generation.inputSnapshots ?? []) {
      if (!input || typeof input.id !== 'string' || !safeBlobIdPattern.test(input.id))
        fail('invalid_archive_path', 'Unsafe generation input identifier.');
      const entry = entries[`generation-inputs/${input.id}`];
      if (!entry) fail('missing_asset_blob', 'Generation input snapshot bytes are missing.');
      assetBlobIds.add(input.id);
      generationInputBlobs.push({
        id: input.id,
        blob: new Blob([new Uint8Array(entry)], { type: input.mimeType }),
      });
    }
  }
  assertSnapshotIntegrity(snapshot, assetBlobIds);
  return {
    ...snapshot,
    assetBlobs,
    candidateBlobs,
    generationInputBlobs,
    manifest: { ...manifest, schemaVersion: OID_PROJECT_SCHEMA_VERSION },
  };
}
