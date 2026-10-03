/** Pure, portable Open Industrial Design domain contracts. */

export const PROJECT_SCHEMA_VERSION = 7;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface EntityBase {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ProjectSettings {
  unit?: 'mm' | 'cm' | 'inch';
  defaultBackground?: string;
  locale?: string;
}

export interface Project extends EntityBase {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  name: string;
  description?: string;
  boardIds: string[];
  activeBoardId?: string;
  settings: ProjectSettings;
}

export interface Board extends EntityBase {
  projectId: string;
  name: string;
  nodeIds: string[];
  edgeIds: string[];
  viewport: Viewport;
}

export type NodeType =
  | 'text'
  | 'image'
  | 'reference'
  | 'sketch'
  | 'concept'
  | 'variant'
  | 'viewset'
  | 'cmf'
  | 'model3d'
  | 'generation'
  | 'candidate'
  | 'group';

/** A node is a board representation, never the authoritative Design entity. */
export interface BaseNode extends EntityBase {
  boardId: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  hidden?: boolean;
  designId?: string;
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: string;
  fontSize?: number;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  assetId: string;
}

/** An unreviewed result has a Board identity, but is not an Asset or Design yet. */
export interface CandidateNode extends BaseNode {
  type: 'candidate';
  candidateId: string;
}

export type ReferenceType =
  'form' | 'cmf' | 'detail' | 'mechanism' | 'brand' | 'user' | 'market' | 'other';

export interface ReferenceNode extends BaseNode {
  type: 'reference';
  assetId: string;
  referenceType?: ReferenceType;
  notes?: string;
}

export interface ConceptNode extends BaseNode {
  type: 'concept';
  designId: string;
  previewAssetId?: string;
}

export interface VariantNode extends BaseNode {
  type: 'variant';
  designId: string;
  previewAssetId?: string;
}

export interface ViewSetNode extends BaseNode {
  type: 'viewset';
  designId: string;
  viewSetId: string;
}

export interface CMFNode extends BaseNode {
  type: 'cmf';
  designId: string;
  cmfSetId: string;
}

export interface SketchNode extends BaseNode {
  type: 'sketch';
  sketchDocumentId: string;
  previewAssetId?: string;
}

/** Board-level AI workflow parameters; credentials and results never live in this node. */
export interface GenerationNode extends BaseNode {
  type: 'generation';
  label: string;
  direction: string;
  notes: string;
  count: number;
  /** One image per selected view; count is the total number of requests. */
  requestedViews?: GenerationView[];
  localEdit?: boolean;
  editRegion?: EditRegion;
}

/** Normalized rectangle bound to an immutable source Asset, never editor runtime state. */
export interface EditRegion {
  sourceNodeId: string;
  sourceAssetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isValidEditRegion(region: EditRegion): boolean {
  return Boolean(
    region &&
    typeof region.sourceNodeId === 'string' &&
    region.sourceNodeId &&
    typeof region.sourceAssetId === 'string' &&
    region.sourceAssetId &&
    [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= 1.000001 &&
    region.y + region.height <= 1.000001,
  );
}

export const generationViewNames = ['front', 'side', 'rear', 'top', 'perspective'] as const;
export type GenerationView = (typeof generationViewNames)[number];

/** Serializable camera state for a 3D review view; never contains Three.js objects. */
export interface CameraState {
  mode: 'perspective' | 'orthographic';
  position: [number, number, number];
  target: [number, number, number];
  zoom?: number;
  preset?: 'perspective' | 'front' | 'side' | 'rear' | 'top';
}

/** A board card pointing to a separate model Asset. The live scene belongs to the 3D adapter. */
export interface Model3DNode extends BaseNode {
  type: 'model3d';
  assetId: string;
  previewAssetId?: string;
  camera?: CameraState;
  renderMode?: 'solid' | 'wireframe';
}

export type EdgeType =
  | 'derived_from'
  | 'references'
  | 'variant_of'
  | 'same_design'
  | 'uses_cmf'
  | 'generated_from'
  | 'replaces'
  | 'approved_from'
  | 'generation_input'
  | 'generation_output'
  | 'related_to';

export type GenerationInputRole = 'base' | 'reference';

/** A board-level visual relationship. It does not own Design lineage. */
export interface Edge extends EntityBase {
  boardId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: EdgeType;
  label?: string;
  inputRole?: GenerationInputRole;
}

export type AssetType = 'image' | 'video' | 'model3d' | 'document' | 'texture';

export type AssetStorage =
  | { type: 'indexeddb'; blobId: string }
  | { type: 'local-file'; path: string }
  | { type: 'remote'; url: string };

export interface Asset extends EntityBase {
  projectId: string;
  type: AssetType;
  name: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  storage: AssetStorage;
  thumbnailAssetId?: string;
  metadata?: JsonObject;
}

export interface DesignDNA {
  silhouetteLocked: boolean;
  proportionLocked: boolean;
  geometryLocked: boolean;
  detailLocked: boolean;
  cmfLocked: boolean;
  brandLocked: boolean;
  notes?: string[];
}

export type DesignKind = 'concept' | 'variant';
export type DesignStatus =
  'exploring' | 'candidate' | 'review' | 'approved' | 'rejected' | 'archived';

/** parentDesignId is the authoritative Concept/Variant lineage relation. */
export interface Design extends EntityBase {
  projectId: string;
  name: string;
  kind: DesignKind;
  status: DesignStatus;
  parentDesignId?: string;
  dna?: DesignDNA;
  tags?: string[];
  notes?: string;
}

/** A persisted semantic Design relation beyond the parent-child lineage field. */
export interface DesignRelation extends EntityBase {
  projectId: string;
  sourceDesignId: string;
  targetDesignId: string;
  type: EdgeType;
}

export type ViewType = 'front' | 'rear' | 'left' | 'right' | 'top' | 'bottom' | 'perspective';

export interface ViewSet extends EntityBase {
  projectId: string;
  designId: string;
  name?: string;
  views: Partial<Record<ViewType, string>>;
}

export interface CMFVariant extends EntityBase {
  projectId: string;
  designId: string;
  name?: string;
  color?: { name?: string; hex?: string };
  material?: string;
  finish?: string;
  textureAssetId?: string;
  notes?: string;
}

export interface CMFSet extends EntityBase {
  projectId: string;
  designId: string;
  name?: string;
  variantIds: string[];
}

export type GenerationStatus = 'pending' | 'running' | 'success' | 'failed';

/** Generation records source/output lineage and must not overwrite a source Design. */
export interface Generation extends EntityBase {
  /** Immutable bytes are owned by this run, not by the live source card. */
  inputSnapshots?: Array<{
    id: string;
    sourceNodeId: string;
    role: GenerationInputRole | 'mask';
    mimeType: string;
    candidateId?: string;
    sourceAssetId?: string;
  }>;
  projectId: string;
  actionId: string;
  providerId: string;
  modelId?: string;
  status: GenerationStatus;
  sourceDesignIds?: string[];
  sourceAssetIds?: string[];
  outputDesignIds?: string[];
  outputAssetIds?: string[];
  prompt?: string;
  parameters?: JsonObject;
  error?: string;
}

/** Unreviewed image metadata; bytes live in a separate Blob and no Design exists yet. */
export interface GenerationCandidate extends EntityBase {
  projectId: string;
  boardId: string;
  generationNodeId: string;
  generationId: string;
  sourceDesignId?: string;
  mimeType: string;
  inputSignature: string;
  view?: GenerationView;
}

/** Workflow cycles are distinct from Design lineage and decorative relations. */
function wouldCreateGenerationCycle(
  edges: readonly Edge[],
  boardId: string,
  sourceNodeId: string,
  targetNodeId: string,
): boolean {
  const pending = [targetNodeId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === sourceNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges) {
      if (
        edge.boardId === boardId &&
        (edge.type === 'generation_input' || edge.type === 'generation_output') &&
        edge.sourceNodeId === current
      )
        pending.push(edge.targetNodeId);
    }
  }
  return false;
}

export function validateGenerationInput(
  nodes: readonly BaseNode[],
  edges: readonly Edge[],
  sourceNodeId: string,
  targetNodeId: string,
  inputRole: GenerationInputRole,
): string | undefined {
  const source = nodes.find((node) => node.id === sourceNodeId);
  const target = nodes.find((node) => node.id === targetNodeId);
  if (!source || !target || target.type !== 'generation' || source.boardId !== target.boardId)
    return 'Source and generation nodes must exist on the same board.';
  if (!['reference', 'image', 'sketch', 'concept', 'variant', 'candidate'].includes(source.type))
    return 'Only visual source nodes can be connected to generation.';
  if (wouldCreateGenerationCycle(edges, source.boardId, sourceNodeId, targetNodeId))
    return 'Generation connections cannot create a cycle.';
  const inputs = edges.filter(
    (edge) => edge.type === 'generation_input' && edge.targetNodeId === targetNodeId,
  );
  if (inputs.some((edge) => edge.sourceNodeId === sourceNodeId))
    return 'This source is already connected.';
  if (inputRole === 'base' && inputs.some((edge) => edge.inputRole === 'base'))
    return 'Only one main image can be connected.';
  if (
    inputRole === 'reference' &&
    inputs.filter((edge) => edge.inputRole === 'reference').length >= 4
  )
    return 'At most four additional references can be connected.';
  return undefined;
}

/** A generation output links a task to a visual result on the same Board. */
export function validateGenerationOutput(
  nodes: readonly BaseNode[],
  edges: readonly Edge[],
  generationNodeId: string,
  outputNodeId: string,
): string | undefined {
  const source = nodes.find((node) => node.id === generationNodeId);
  const target = nodes.find((node) => node.id === outputNodeId);
  if (!source || source.type !== 'generation' || !target || source.boardId !== target.boardId)
    return 'Generation and output nodes must exist on the same board.';
  if (!['image', 'reference', 'concept', 'variant', 'candidate'].includes(target.type))
    return 'Generation outputs must be an image, reference, design or candidate node.';
  if (wouldCreateGenerationCycle(edges, source.boardId, generationNodeId, outputNodeId))
    return 'Generation connections cannot create a cycle.';
  if (
    edges.some(
      (edge) =>
        edge.type === 'generation_output' &&
        edge.sourceNodeId === generationNodeId &&
        edge.targetNodeId === outputNodeId,
    )
  )
    return 'This generation output is already connected.';
  return undefined;
}

export { materializeCandidateResults } from './candidate-results';

/** Adapter-owned source scene metadata; no editor runtime object is persisted. */
export interface SketchDocument extends EntityBase {
  projectId: string;
  format: 'excalidraw';
  formatVersion: number;
  sourceAssetId: string;
  previewAssetId?: string;
}

/** Graph layout is view state keyed by Design ID, not a React Flow model. */
export interface GraphViewState {
  projectId: string;
  positions: Record<string, { x: number; y: number }>;
  zoom?: number;
  x?: number;
  y?: number;
}

/** Runtime-only migration contract. Migrations are never serialized into a project. */
export interface Migration {
  from: number;
  to: number;
  migrate(input: JsonValue): JsonValue;
}

/** Storage-library independent persistence boundary for the domain. */
export interface ProjectRepository {
  getProject(id: string): Promise<Project | undefined>;
  saveProject(project: Project): Promise<void>;
  getBoard(id: string): Promise<Board | undefined>;
  saveBoard(board: Board): Promise<void>;
  getNode(id: string): Promise<BaseNode | undefined>;
  saveNode(node: BaseNode): Promise<void>;
  deleteNode(id: string): Promise<void>;
  getDesign(id: string): Promise<Design | undefined>;
  listDesigns(projectId: string): Promise<Design[]>;
  saveDesign(design: Design): Promise<void>;
  listDesignRelations(projectId: string): Promise<DesignRelation[]>;
  getAsset(id: string): Promise<Asset | undefined>;
  saveAsset(asset: Asset): Promise<void>;
  saveDesignRelation(relation: DesignRelation): Promise<void>;
  saveViewSet(viewSet: ViewSet): Promise<void>;
  saveCMFSet(cmfSet: CMFSet): Promise<void>;
  saveCMFVariant(variant: CMFVariant): Promise<void>;
  saveGeneration(generation: Generation): Promise<void>;
  saveSketchDocument(document: SketchDocument): Promise<void>;
  getGraphViewState(projectId: string): Promise<GraphViewState | undefined>;
  saveGraphViewState(state: GraphViewState): Promise<void>;
}

export type IdFactory = () => string;
export type Clock = () => number;

const newId: IdFactory = () => crypto.randomUUID();
const now: Clock = () => Date.now();
const defaultDNA = (): DesignDNA => ({
  silhouetteLocked: false,
  proportionLocked: false,
  geometryLocked: false,
  detailLocked: false,
  cmfLocked: false,
  brandLocked: false,
});
const base = (idFactory = newId, clock = now): EntityBase => ({
  id: idFactory(),
  createdAt: clock(),
  updatedAt: clock(),
});

export function createReferenceNode(
  input: Omit<ReferenceNode, keyof EntityBase | 'type'>,
  idFactory?: IdFactory,
  clock?: Clock,
): ReferenceNode {
  return { ...base(idFactory, clock), ...input, type: 'reference' };
}

export function createConcept(
  input: {
    projectId: string;
    boardId: string;
    name: string;
    x: number;
    y: number;
    previewAssetId?: string;
    dna?: DesignDNA;
  },
  idFactory?: IdFactory,
  clock?: Clock,
) {
  const design = {
    ...base(idFactory, clock),
    projectId: input.projectId,
    name: input.name,
    kind: 'concept' as const,
    status: 'exploring' as const,
    dna: input.dna ?? defaultDNA(),
  };
  const node: ConceptNode = {
    ...base(idFactory, clock),
    boardId: input.boardId,
    type: 'concept',
    designId: design.id,
    previewAssetId: input.previewAssetId,
    x: input.x,
    y: input.y,
    width: 320,
    height: 360,
    rotation: 0,
    zIndex: 1,
  };
  return { design, node };
}

export function createModel3DNode(
  input: Omit<Model3DNode, keyof EntityBase | 'type'>,
  idFactory?: IdFactory,
  clock?: Clock,
): Model3DNode {
  return { ...base(idFactory, clock), ...input, type: 'model3d' };
}

export function createVariant(
  source: Design,
  input: { boardId: string; name: string; x: number; y: number; previewAssetId?: string },
  idFactory?: IdFactory,
  clock?: Clock,
) {
  const design: Design = {
    ...base(idFactory, clock),
    projectId: source.projectId,
    name: input.name,
    kind: 'variant',
    status: 'exploring',
    parentDesignId: source.id,
    dna: source.dna ? { ...source.dna, notes: [...(source.dna.notes ?? [])] } : defaultDNA(),
  };
  const node: VariantNode = {
    ...base(idFactory, clock),
    boardId: input.boardId,
    type: 'variant',
    designId: design.id,
    previewAssetId: input.previewAssetId,
    x: input.x,
    y: input.y,
    width: 320,
    height: 360,
    rotation: 0,
    zIndex: 1,
  };
  const relation: DesignRelation = {
    ...base(idFactory, clock),
    projectId: source.projectId,
    sourceDesignId: source.id,
    targetDesignId: design.id,
    type: 'variant_of',
  };
  return { design, node, relation };
}

export function createViewSet(
  projectId: string,
  designId: string,
  idFactory?: IdFactory,
  clock?: Clock,
): ViewSet {
  return { ...base(idFactory, clock), projectId, designId, views: {} };
}

export function createCMFSet(
  projectId: string,
  designId: string,
  idFactory?: IdFactory,
  clock?: Clock,
): CMFSet {
  return { ...base(idFactory, clock), projectId, designId, variantIds: [] };
}

export function addCMFVariant(
  set: CMFSet,
  input: Omit<CMFVariant, keyof EntityBase | 'projectId' | 'designId'>,
  idFactory?: IdFactory,
  clock?: Clock,
) {
  const variant: CMFVariant = {
    ...base(idFactory, clock),
    projectId: set.projectId,
    designId: set.designId,
    ...input,
  };
  return {
    variant,
    set: { ...set, variantIds: [...set.variantIds, variant.id], updatedAt: (clock ?? now)() },
  };
}

const transitions: Record<DesignStatus, DesignStatus[]> = {
  exploring: ['candidate', 'archived'],
  candidate: ['review', 'rejected', 'archived'],
  review: ['approved', 'rejected', 'candidate'],
  approved: ['archived'],
  rejected: ['archived', 'exploring'],
  archived: [],
};
export function transitionDesignStatus(
  design: Design,
  status: DesignStatus,
  clock: Clock = now,
): Design {
  if (design.status !== status && !transitions[design.status].includes(status))
    throw new Error(`Invalid design status transition: ${design.status} -> ${status}`);
  return { ...design, status, updatedAt: clock() };
}
