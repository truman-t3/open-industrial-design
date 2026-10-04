/** Pure, portable Open Industrial Design domain contracts. */

export const PROJECT_SCHEMA_VERSION = 9;

export {
  createCanvasGroup,
  moveCanvasNode,
  reconcileCanvasGroups,
  validateCanvasGroups,
} from './groups';

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
  researchLibrary?: ResearchLibrary;
}

/** User-curated research, independent of Canvas boards and Design lineage. */
export interface ResearchEntry extends EntityBase {
  title: string;
  assetId?: string;
  notes: string;
  tags: string[];
  sourceUrl: string;
  competitor?: {
    brand: string;
    product: string;
    /** User's observation date, never an inferred product release date. */
    recordedOn: string;
  };
}

export interface ResearchCollection extends EntityBase {
  name: string;
  entryIds: string[];
}

export interface ResearchLibrary {
  entries: ResearchEntry[];
  collections: ResearchCollection[];
}

/** Validate portable records and project-local image references before any write. */
export function isValidResearchLibrary(
  value: unknown,
  assets: readonly Asset[],
  projectId: string,
): value is ResearchLibrary {
  const record = (item: unknown): item is Record<string, unknown> =>
    Boolean(item) && typeof item === 'object' && !Array.isArray(item);
  const keys = (item: Record<string, unknown>, allowed: string[]) =>
    Object.keys(item).every((key) => allowed.includes(key));
  const text = (item: unknown, max: number) =>
    typeof item === 'string' && item.length <= max && Boolean(item.trim());
  const entity = (item: Record<string, unknown>) =>
    text(item.id, 128) &&
    typeof item.createdAt === 'number' &&
    Number.isFinite(item.createdAt) &&
    item.createdAt >= 0 &&
    typeof item.updatedAt === 'number' &&
    Number.isFinite(item.updatedAt) &&
    item.updatedAt >= item.createdAt;
  if (
    !record(value) ||
    !keys(value, ['entries', 'collections']) ||
    !Array.isArray(value.entries) ||
    value.entries.length > 2000 ||
    !Array.isArray(value.collections) ||
    value.collections.length > 200
  )
    return false;
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const ids = new Set<string>();
  for (const item of value.entries) {
    if (
      !record(item) ||
      !keys(item, [
        'id',
        'createdAt',
        'updatedAt',
        'title',
        'assetId',
        'notes',
        'tags',
        'sourceUrl',
        'competitor',
      ]) ||
      !entity(item) ||
      !text(item.title, 200) ||
      !isValidMaterialKnowledge({
        notes: item.notes,
        tags: item.tags,
        sourceUrl: item.sourceUrl,
      }) ||
      ids.has(item.id as string)
    )
      return false;
    ids.add(item.id as string);
    if (item.assetId !== undefined) {
      if (typeof item.assetId !== 'string') return false;
      const asset = assetMap.get(item.assetId);
      if (!asset || asset.projectId !== projectId || asset.type !== 'image') return false;
    } else if (!(item.notes as string).trim() && !item.sourceUrl) return false;
    if (item.competitor !== undefined) {
      const competitor = item.competitor;
      if (
        !record(competitor) ||
        !keys(competitor, ['brand', 'product', 'recordedOn']) ||
        typeof competitor.brand !== 'string' ||
        competitor.brand.length > 200 ||
        typeof competitor.product !== 'string' ||
        competitor.product.length > 200 ||
        typeof competitor.recordedOn !== 'string'
      )
        return false;
      const date = competitor.recordedOn;
      if (
        date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date)
      )
        return false;
    }
  }
  const collectionIds = new Set<string>();
  for (const item of value.collections) {
    if (
      !record(item) ||
      !keys(item, ['id', 'createdAt', 'updatedAt', 'name', 'entryIds']) ||
      !entity(item) ||
      !text(item.name, 100) ||
      collectionIds.has(item.id as string) ||
      !Array.isArray(item.entryIds) ||
      item.entryIds.length > 2000 ||
      new Set(item.entryIds).size !== item.entryIds.length ||
      item.entryIds.some((id) => typeof id !== 'string' || !ids.has(id))
    )
      return false;
    collectionIds.add(item.id as string);
  }
  return true;
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

/** Board organization only. Members retain world coordinates and independent identities. */
export interface GroupNode extends BaseNode {
  type: 'group';
  label: string;
  childNodeIds: string[];
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
export type PatternPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};
export const defaultPatternPlacement: PatternPlacement = {
  x: 0.5,
  y: 0.5,
  width: 0.3,
  height: 0.3,
  rotation: 0,
  opacity: 1,
};
export function isValidPatternPlacement(value: unknown): value is PatternPlacement {
  if (!value || typeof value !== 'object') return false;
  const p = value as PatternPlacement;
  return (
    [p.x, p.y, p.width, p.height, p.rotation, p.opacity].every(Number.isFinite) &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1 &&
    p.width >= 0.01 &&
    p.width <= 2 &&
    p.height >= 0.01 &&
    p.height <= 2 &&
    Math.abs(p.rotation) <= 180 &&
    p.opacity >= 0 &&
    p.opacity <= 1
  );
}

export interface GenerationNode extends BaseNode {
  type: 'generation';
  label: string;
  direction: string;
  notes: string;
  count: number;
  /** Explicit text-only generation; never inferred from missing image inputs. */
  textOnly?: boolean;
  /** One image per selected view; count is the total number of requests. */
  requestedViews?: GenerationView[];
  localEdit?: boolean;
  localEditMode?: 'erase';
  localCmf?: LocalCmf;
  removeBackground?: boolean;
  patternPlacement?: PatternPlacement;
  patternTask?: PatternTask;
  editRegion?: EditRegion;
}

/** AI artwork creation or product transfer; distinct from deterministic flat placement. */
export type PatternTask =
  | { kind: 'create'; repeat: 'single' | 'tile' }
  | { kind: 'transfer'; placement: string; scale: 'small' | 'medium' | 'large' };

export function isValidPatternTask(value: PatternTask): boolean {
  if (!value || typeof value !== 'object') return false;
  if (value.kind === 'create')
    return (
      Object.keys(value).every((key) => ['kind', 'repeat'].includes(key)) &&
      ['single', 'tile'].includes(value.repeat)
    );
  return (
    value.kind === 'transfer' &&
    Object.keys(value).every((key) => ['kind', 'placement', 'scale'].includes(key)) &&
    typeof value.placement === 'string' &&
    value.placement.length <= 500 &&
    ['small', 'medium', 'large'].includes(value.scale)
  );
}

export type LocalCmf = { color: string; material: string; finish: string };
export function isValidLocalCmf(value: LocalCmf): boolean {
  return Boolean(
    value &&
    Object.keys(value).every((key) => ['color', 'material', 'finish'].includes(key)) &&
    ['color', 'material', 'finish'].every(
      (key) =>
        typeof value[key as keyof LocalCmf] === 'string' &&
        value[key as keyof LocalCmf].length <= 500,
    ),
  );
}

export type MaskPoint = [number, number];
export type MaskStroke = { points: MaskPoint[]; radius: number };
/** Normalized selection bound to an immutable source Asset, never editor runtime state. */
export interface EditRegion {
  sourceNodeId: string;
  sourceAssetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: { kind: 'polygon'; points: MaskPoint[] } | { kind: 'brush'; strokes: MaskStroke[] };
}

export function isValidEditRegion(region: EditRegion): boolean {
  const pointsValid = (points: MaskPoint[], min: number, max: number) =>
    Array.isArray(points) &&
    points.length >= min &&
    points.length <= max &&
    points.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
    );
  const shape = region?.shape;
  const shapeValid =
    shape === undefined ||
    (shape?.kind === 'polygon'
      ? pointsValid(shape.points, 3, 256)
      : shape?.kind === 'brush' &&
        Array.isArray(shape.strokes) &&
        shape.strokes.length >= 1 &&
        shape.strokes.length <= 128 &&
        shape.strokes.every(
          (stroke) =>
            stroke &&
            Number.isFinite(stroke.radius) &&
            stroke.radius >= 0.001 &&
            stroke.radius <= 0.25 &&
            pointsValid(stroke.points, 1, 1024),
        ) &&
        shape.strokes.reduce((count, stroke) => count + stroke.points.length, 0) <= 4096);
  return Boolean(
    region &&
    shapeValid &&
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

export interface MaterialKnowledge {
  notes: string;
  tags: string[];
  sourceUrl: string;
}
export function isValidMaterialKnowledge(value: unknown): value is MaterialKnowledge {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).some((key) => !['notes', 'tags', 'sourceUrl'].includes(key)) ||
    typeof item.notes !== 'string' ||
    item.notes.length > 4000 ||
    typeof item.sourceUrl !== 'string' ||
    item.sourceUrl.length > 2048 ||
    !Array.isArray(item.tags) ||
    item.tags.length > 12 ||
    item.tags.some(
      (tag) => typeof tag !== 'string' || !tag.trim() || tag !== tag.trim() || tag.length > 40,
    ) ||
    new Set(item.tags.map((tag) => (tag as string).toLowerCase())).size !== item.tags.length
  )
    return false;
  if (item.sourceUrl) {
    try {
      const url = new URL(item.sourceUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
    } catch {
      return false;
    }
  }
  return true;
}
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
  knowledge?: MaterialKnowledge;
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
export const designViewTypes: readonly ViewType[] = [
  'front',
  'rear',
  'left',
  'right',
  'top',
  'bottom',
  'perspective',
];
export function isValidDesignViews(value: unknown): value is ViewSet['views'] {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, id]) =>
        designViewTypes.includes(key as ViewType) && typeof id === 'string' && id.trim(),
    ),
  );
}

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

/** Editable local CMF values, separate from record identity and AI parameters. */
export type CMFVariantDraft = Pick<
  CMFVariant,
  'name' | 'color' | 'material' | 'finish' | 'textureAssetId' | 'notes'
> & { id?: string };

export function isValidCMFVariantDraft(value: unknown): value is CMFVariantDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  const limits: Record<string, number> = {
    id: 200,
    name: 200,
    material: 500,
    finish: 500,
    textureAssetId: 200,
    notes: 4000,
  };
  return Object.entries(draft).every(([key, field]) => {
    if (field === undefined) return key === 'color' || Object.hasOwn(limits, key);
    if (key === 'color') {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return false;
      return Object.entries(field).every(([part, text]) =>
        part === 'name'
          ? typeof text === 'string' && text.length <= 200
          : part === 'hex' && typeof text === 'string' && /^#[0-9a-f]{6}$/i.test(text),
      );
    }
    return (
      Object.hasOwn(limits, key) &&
      typeof field === 'string' &&
      field.length <= limits[key]! &&
      (!['id', 'textureAssetId'].includes(key) || Boolean(field.trim()))
    );
  });
}

export type GenerationStatus = 'pending' | 'running' | 'success' | 'failed';

/** Generation records source/output lineage and must not overwrite a source Design. */
export interface Generation extends EntityBase {
  /** Immutable bytes are owned by this run, not by the live source card. */
  inputSnapshots?: Array<{
    id: string;
    sourceNodeId?: string;
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
  if ((target as GenerationNode).textOnly)
    return 'Text-only generation cannot accept image connections. Choose an image task first.';
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
export const designStatuses: readonly DesignStatus[] = [
  'exploring',
  'candidate',
  'review',
  'approved',
  'rejected',
  'archived',
];
export function nextDesignStatuses(status: DesignStatus): readonly DesignStatus[] {
  return [...transitions[status]];
}
export function transitionDesignStatus(
  design: Design,
  status: DesignStatus,
  clock: Clock = now,
): Design {
  if (design.status !== status && !transitions[design.status].includes(status))
    throw new Error(`Invalid design status transition: ${design.status} -> ${status}`);
  return { ...design, status, updatedAt: clock() };
}
