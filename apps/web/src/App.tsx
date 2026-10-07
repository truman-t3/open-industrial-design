import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { dracoDecoderPath } from './runtime-assets';
import { prepareEditMask, protectLocalEdit, protectCutout, composePattern } from './edit-mask';
import { defaultPatternPlacement } from '@open-industrial-design/design-model';
import { downloadOidProject, type ProjectDownload } from './project-download';
import { createDemoCopyArchive, fitDemoCopyViewport } from './demo-copy';
import { partitionDemoProjects } from './demo-projects';
import { AboutDialog } from './about-dialog';
import { findGenerationTool, generationInputLabel, queueInputSummaries } from './generation-tools';
import { ExplorationBatch, ExplorationQueue } from './exploration-batch';
import { MaterialLibrary } from './material-library';
import { ResearchLibraryDialog } from './research-library';
import type { ResearchLibrary } from '@open-industrial-design/design-model';
import type { ResearchCommand } from '@open-industrial-design/actions';
import { updateWorkspaceStatus } from './workspace-status';
import { createWorkspaceSaveQueue, preventUnsavedWorkspaceUnload } from './workspace-save';
import { archiveErrorMessage } from './archive-error';
import { refreshSketchPreview } from './sketch-history';
import {
  ActionRegistry,
  ActionRunner,
  CandidateTray,
  createCanvasGenerateAction,
  createCanvasBatchGenerateAction,
  type CanvasBatchProgress,
  createGenerationStepAction,
  createExplorationBatchAction,
  createPlaceMaterialAction,
  createSaveMaterialKnowledgeAction,
  createResearchCommandAction,
  createImportResearchImageAction,
  createSaveDesignDnaAction,
  createSaveViewSetAction,
  createSaveCMFSetAction,
  createVariantAction,
  createConceptFromImageAction,
  createBlankConceptAction,
  createTransitionDesignStatusAction,
  type PlaceMaterialResult,
  type CreateExplorationBatchInput,
  type ExplorationBatchStep,
  createKeepCanvasCandidateAction,
  generationInputSignature,
  LOCAL_EDIT_PROTECTION_ERROR,
  createAIAnalyzeDesignAction,
  createAIAnalyzeMaterialsAction,
  createAIGenerateVariantAction,
  createAITestConnectionAction,
  createKeepCandidateAction,
  createWorkspaceActions,
  createSaveTextNodeAction,
  createImportImageAction,
  createSaveSketchAction,
  type ActionContext,
} from '@open-industrial-design/actions';
import {
  CapabilityRouter,
  InMemoryProviderCredentialStore,
  LayeredProviderCredentialStore,
  ProviderRegistry,
  type ProviderConfig,
  type ProviderImageInput,
} from '@open-industrial-design/ai-core';
import {
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
  OPENAI_COMPATIBLE_DEFAULT_MODEL,
  OPENAI_COMPATIBLE_PROVIDER_TYPE,
  createOpenAICompatibleProvider,
} from '@open-industrial-design/ai-openai-compatible';
import {
  CanvasWorkspace,
  revealCanvasNode,
  findDesignCanvasNode,
  findFreeNodePosition,
  type CanvasNode,
  type CanvasInteractionMode,
  useCanvasRuntimeStore,
} from '@open-industrial-design/canvas';
import {
  appMetadata,
  translateDemoLabel,
  translateGenerationConnectionError,
} from '@open-industrial-design/core';
import {
  createOidProjectArchive,
  importOidProjectArchive,
  validateProjectArchiveData,
  type ProjectArchiveData,
} from '@open-industrial-design/project-file';
import {
  createModelMetadata,
  validateModelFile,
} from '@open-industrial-design/three-viewer/adapter';
import type {
  Board,
  BaseNode,
  CameraState,
  Design,
  DesignStatus,
  ViewSet,
  ViewSetNode,
  CMFSet,
  CMFVariant,
  CMFVariantDraft,
  CMFNode,
  DesignRelation,
  Edge,
  GenerationCandidate,
  GenerationNode,
  GenerationInputRole,
  Generation,
  GraphViewState,
  Project,
  Asset,
  SketchNode,
  SketchDocument,
  ReferenceNode,
  MaterialKnowledge,
  Model3DNode,
} from '@open-industrial-design/design-model';
import {
  PROJECT_SCHEMA_VERSION,
  createCanvasGroup,
  reconcileCanvasGroups,
  createModel3DNode,
  validateGenerationInput,
} from '@open-industrial-design/design-model';
import {
  DexieProjectArchiveStorage,
  DexieProjectRepository,
  type CanvasDeletionSnapshot,
  DexieAIGenerationStorage,
  DexieCanvasGenerationStorage,
  DexieProviderConfigRepository,
  DexieProviderCredentialStore,
  DexieThreeViewerStorage,
  OpenIndustrialDesignDatabase,
  type LocalMaterialEntry,
} from '@open-industrial-design/storage';
import {
  ActionCommandPalette,
  ActionContextMenu,
  CandidateTrayPanel,
  LanguageSelector,
  ProviderSettings,
  useLocalization,
  type ProviderSettingsDraft,
} from '@open-industrial-design/ui';
import { BrandLogo } from './brand';
import { restoreDemoPreviewIds } from './demo-preview';
import { ProjectHome } from './project-home';
import { loadProjectCover } from './project-cover';
import { WorkspaceInspector } from './workspace-inspector';
import { WorkspaceSidebar } from './workspace-sidebar';
import { UiIcon } from './ui-icons';

const database = new OpenIndustrialDesignDatabase();
const repository = new DexieProjectRepository(database);
const searchLocalMaterials = (query: string, projectId?: string) =>
  repository.searchLocalMaterials(query, projectId);
const loadMaterialBlob = async (id: string) => (await repository.getAssetBlob(id))?.blob;
const archiveStorage = new DexieProjectArchiveStorage(database);
const generationStorage = new DexieAIGenerationStorage(database);
const loadAnalysisBlob = (projectId: string, generationId: string, snapshotId: string) =>
  generationStorage.getMaterialAnalysisBlob(projectId, generationId, snapshotId);
const canvasGenerationStorage = new DexieCanvasGenerationStorage(database);
const threeViewerStorage = new DexieThreeViewerStorage(database);
const providerConfigsRepository = new DexieProviderConfigRepository(database);
const rememberedCredentials = new DexieProviderCredentialStore(database);
const sessionCredentials = new InMemoryProviderCredentialStore();
const credentials = new LayeredProviderCredentialStore(sessionCredentials, rememberedCredentials);
const hasProviderCredentials = async (configId: string) =>
  Boolean((await credentials.get(configId))?.apiKey.trim());
const providerRegistry = new ProviderRegistry();
providerRegistry.register(createOpenAICompatibleProvider());
const capabilityRouter = new CapabilityRouter(providerRegistry);
const actionRegistry = new ActionRegistry();
createWorkspaceActions().forEach((action) => actionRegistry.register(action));
actionRegistry.register(createAITestConnectionAction());
actionRegistry.register(createSaveSketchAction());
actionRegistry.register(createAIAnalyzeDesignAction());
actionRegistry.register(createAIAnalyzeMaterialsAction());
actionRegistry.register(createAIGenerateVariantAction());
actionRegistry.register(createKeepCandidateAction());
actionRegistry.register(createCanvasGenerateAction());
actionRegistry.register(createGenerationStepAction());
actionRegistry.register(createCanvasBatchGenerateAction());
actionRegistry.register(createExplorationBatchAction());
actionRegistry.register(createPlaceMaterialAction());
actionRegistry.register(createSaveMaterialKnowledgeAction());
actionRegistry.register(createResearchCommandAction());
actionRegistry.register(createImportResearchImageAction());
actionRegistry.register(createSaveDesignDnaAction());
actionRegistry.register(createSaveViewSetAction());
actionRegistry.register(createSaveCMFSetAction());
actionRegistry.register(createVariantAction());
actionRegistry.register(createConceptFromImageAction());
actionRegistry.register(createBlankConceptAction());
actionRegistry.register(createTransitionDesignStatusAction());
actionRegistry.register(createSaveTextNodeAction());
actionRegistry.register(createImportImageAction());
actionRegistry.register(createKeepCanvasCandidateAction());
const actionRunner = new ActionRunner(actionRegistry);
const candidateTray = new CandidateTray();
const ModelViewerWorkspace = lazy(async () => {
  const module = await import('@open-industrial-design/three-viewer');
  return { default: module.ModelViewerWorkspace };
});
const DesignGraphWorkspace = lazy(async () => {
  const module = await import('@open-industrial-design/ui/design-graph');
  return { default: module.DesignGraphWorkspace };
});
const SketchWorkspace = lazy(async () => {
  const module = await import('@open-industrial-design/ui/sketch');
  return { default: module.SketchWorkspace };
});

const seedNodes: CanvasNode[] = [
  {
    id: 'image-1',
    createdAt: 1,
    updatedAt: 1,
    boardId: 'local-board',
    type: 'concept',
    label: '主方案 · 便携灯具（示例素材）',
    designId: 'concept-1',
    previewAssetId: 'demo-lamp-concept',
    x: 545,
    y: 360,
    width: 280,
    height: 300,
    rotation: 0,
    zIndex: 2,
  },
  {
    id: 'image-variant-1',
    createdAt: 1,
    updatedAt: 1,
    boardId: 'local-board',
    type: 'variant',
    label: '暖白 CMF · 示例素材',
    designId: 'variant-1',
    previewAssetId: 'demo-lamp-variant',
    x: 1150,
    y: 90,
    width: 200,
    height: 220,
    rotation: 0,
    zIndex: 2,
  },
  {
    id: 'reference-1',
    createdAt: 1,
    updatedAt: 1,
    boardId: 'local-board',
    type: 'reference',
    label: '参考图 · 户外情境',
    assetId: 'demo-lamp-reference',
    x: 30,
    y: 525,
    width: 180,
    height: 200,
    rotation: 0,
    zIndex: 1,
  },
  {
    id: 'sketch-1',
    createdAt: 1,
    updatedAt: 1,
    boardId: 'local-board',
    type: 'sketch',
    label: '草图 · 形态探索',
    previewAssetId: 'demo-lamp-sketch',
    x: 30,
    y: 290,
    width: 180,
    height: 200,
    rotation: 0,
    zIndex: 1,
  },
  {
    id: 'review-render-1',
    createdAt: 1,
    updatedAt: 1,
    boardId: 'local-board',
    type: 'image',
    label: '户外场景表达 · 示例素材',
    assetId: 'demo-lamp-scene',
    x: 1150,
    y: 810,
    width: 430,
    height: 270,
    rotation: 0,
    zIndex: 1,
  },
  {
    id: 'image-cmf-blue',
    createdAt: 1,
    updatedAt: 1,
    boardId: 'local-board',
    type: 'image',
    label: '矿物蓝灰 CMF · 示例素材',
    assetId: 'demo-lamp-cmf-blue',
    x: 1380,
    y: 90,
    width: 200,
    height: 220,
    rotation: 0,
    zIndex: 1,
  },
  {
    id: 'image-detail-knob',
    createdAt: 1,
    updatedAt: 1,
    boardId: 'local-board',
    type: 'image',
    label: '旋钮局部方案 · 示例素材',
    assetId: 'demo-lamp-detail-knob',
    x: 1150,
    y: 450,
    width: 200,
    height: 220,
    rotation: 0,
    zIndex: 1,
  },
  {
    id: 'image-detail-handle',
    createdAt: 1,
    updatedAt: 1,
    boardId: 'local-board',
    type: 'image',
    label: '提手转轴局部 · 示例素材',
    assetId: 'demo-lamp-detail-handle',
    x: 1380,
    y: 450,
    width: 200,
    height: 220,
    rotation: 0,
    zIndex: 1,
  },
];

const demoGenerationNodes: GenerationNode[] = [
  {
    id: 'demo-render',
    label: '草图渲染 · 待运行',
    direction: '将主图草图转化为工业设计效果图，保留轮廓、比例与功能结构；参考图仅用于材质与光线。',
    x: 260,
    y: 390,
  },
  {
    id: 'demo-cmf',
    label: 'CMF 探索 · 待运行',
    direction: '保留主图产品轮廓与结构，探索暖白外壳、细腻哑光表面与深灰五金的协调 CMF 方案。',
    x: 895,
    y: 90,
  },
  {
    id: 'demo-scene',
    label: '场景表达 · 待运行',
    direction:
      '保留灯具设计特征与比例，放入黄昏户外露营场景，表达真实尺度、温暖照明与自然使用方式。',
    x: 895,
    y: 810,
  },
  {
    id: 'demo-detail',
    label: '局部细节探索 · 待运行',
    direction: '保持灯具整体造型不变，只微调正面旋钮纹理与提手转轴细节。',
    x: 895,
    y: 450,
  },
].map((brief) => ({
  ...brief,
  boardId: 'local-board',
  type: 'generation',
  notes:
    '示例步骤用于展示设计探索路径；相连图片是预置示例素材，不是本次 AI 生成结果，也没有伪造运行记录。配置支持多图编辑的模型后，可选中本步骤并手动生成。',
  count: 2,
  createdAt: 1,
  updatedAt: 1,
  width: 220,
  height: 240,
  rotation: 0,
  zIndex: 3,
}));
seedNodes.push(...demoGenerationNodes);

const seedEdges: Edge[] = (
  [
    {
      id: 'demo-sketch-input',
      type: 'generation_input',
      sourceNodeId: 'sketch-1',
      targetNodeId: 'demo-render',
      inputRole: 'base',
    },
    {
      id: 'demo-render-reference',
      type: 'generation_input',
      sourceNodeId: 'reference-1',
      targetNodeId: 'demo-render',
      inputRole: 'reference',
    },
    {
      id: 'demo-render-output',
      type: 'generation_output',
      sourceNodeId: 'demo-render',
      targetNodeId: 'image-1',
    },
    {
      id: 'demo-cmf-input',
      type: 'generation_input',
      sourceNodeId: 'image-1',
      targetNodeId: 'demo-cmf',
      inputRole: 'base',
    },
    {
      id: 'demo-cmf-warm-output',
      type: 'generation_output',
      sourceNodeId: 'demo-cmf',
      targetNodeId: 'image-variant-1',
    },
    {
      id: 'demo-cmf-blue-output',
      type: 'generation_output',
      sourceNodeId: 'demo-cmf',
      targetNodeId: 'image-cmf-blue',
    },
    {
      id: 'demo-detail-input',
      type: 'generation_input',
      sourceNodeId: 'image-1',
      targetNodeId: 'demo-detail',
      inputRole: 'base',
    },
    {
      id: 'demo-detail-knob-output',
      type: 'generation_output',
      sourceNodeId: 'demo-detail',
      targetNodeId: 'image-detail-knob',
    },
    {
      id: 'demo-detail-handle-output',
      type: 'generation_output',
      sourceNodeId: 'demo-detail',
      targetNodeId: 'image-detail-handle',
    },
    {
      id: 'demo-scene-input',
      type: 'generation_input',
      sourceNodeId: 'image-1',
      targetNodeId: 'demo-scene',
      inputRole: 'base',
    },
    {
      id: 'demo-scene-reference',
      type: 'generation_input',
      sourceNodeId: 'reference-1',
      targetNodeId: 'demo-scene',
      inputRole: 'reference',
    },
    {
      id: 'demo-scene-output',
      type: 'generation_output',
      sourceNodeId: 'demo-scene',
      targetNodeId: 'review-render-1',
    },
  ] as const
).map((edge) => ({
  ...edge,
  boardId: 'local-board',
  createdAt: 1,
  updatedAt: 1,
}));

const demoImages = [
  {
    id: 'demo-lamp-reference',
    file: 'portable-lamp-reference.png',
    name: '户外情境参考',
  },
  { id: 'demo-lamp-sketch', file: 'portable-lamp-sketch.png', name: '便携灯具形态草图' },
  { id: 'demo-lamp-concept', file: 'portable-lamp-concept.png', name: '便携灯具概念方案' },
  { id: 'demo-lamp-variant', file: 'portable-lamp-variant.png', name: '暖白 CMF 变体' },
  { id: 'demo-lamp-scene', file: 'portable-lamp-scene.png', name: '便携灯具户外场景示例' },
  { id: 'demo-lamp-cmf-blue', file: 'portable-lamp-cmf-blue.png', name: '矿物蓝灰 CMF 示例' },
  {
    id: 'demo-lamp-detail-knob',
    file: 'portable-lamp-detail-knob.png',
    name: '灯具旋钮局部细节示例',
  },
  {
    id: 'demo-lamp-detail-handle',
    file: 'portable-lamp-detail-handle.png',
    name: '灯具提手转轴细节示例',
  },
] as const;

const seedDesigns: Design[] = [
  {
    id: 'concept-1',
    createdAt: 1,
    updatedAt: 1,
    projectId: 'local-project',
    name: '便携灯具概念方案',
    kind: 'concept',
    status: 'exploring',
  },
  {
    id: 'variant-1',
    createdAt: 1,
    updatedAt: 1,
    projectId: 'local-project',
    name: '柔和轮廓',
    kind: 'variant',
    status: 'candidate',
    parentDesignId: 'concept-1',
  },
];

const seedRelations: DesignRelation[] = [
  {
    id: 'relation-1',
    createdAt: 1,
    updatedAt: 1,
    projectId: 'local-project',
    sourceDesignId: 'variant-1',
    targetDesignId: 'concept-1',
    type: 'references',
  },
];

const seedProject: Project = {
  id: 'local-project',
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: PROJECT_SCHEMA_VERSION,
  name: 'Portable Lamp Demo',
  boardIds: ['local-board'],
  activeBoardId: 'local-board',
  settings: {},
};

const seedBoard: Board = {
  id: 'local-board',
  createdAt: 1,
  updatedAt: 1,
  projectId: seedProject.id,
  name: 'Concept',
  nodeIds: seedNodes.map((node) => node.id),
  edgeIds: seedEdges.map((edge) => edge.id),
  viewport: { x: 24, y: 24, zoom: 0.5 },
};

async function loadDemoImageBlob({ file }: { file: string }) {
  const response = await fetch(`/demo/${file}`);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/'))
    throw new Error(`Demo image unavailable: ${file}`);
  return response.blob();
}

async function installDemoImage(
  { file, id, name }: { file: string; id: string; name: string },
  projectId = seedProject.id,
) {
  const blob = await loadDemoImageBlob({ file });
  const asset: Asset = {
    id,
    createdAt: 1,
    updatedAt: 1,
    projectId,
    type: 'image',
    name,
    mimeType: 'image/png',
    size: blob.size,
    storage: { type: 'indexeddb', blobId: id },
  };
  await repository.saveAsset(asset);
  await repository.saveAssetBlob({ id, blob });
  return blob;
}

const activeProjectStorageKey = 'open-industrial-design.active-project-id';

type NamingIntent =
  | { kind: 'new-board'; value: string }
  | { kind: 'new-concept'; value: string }
  | { kind: 'new-project'; value: string }
  | { kind: 'rename-board'; target: Board; value: string }
  | { kind: 'rename-project'; target: Project; value: string };

function getInitialProjectId() {
  return window.localStorage.getItem(activeProjectStorageKey) ?? seedProject.id;
}

function sameCameraState(left: CameraState | undefined, right: CameraState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function orderGenerationCandidates(items: GenerationCandidate[]) {
  return [...items].sort(
    (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}

export function App() {
  const { locale, t } = useLocalization();
  const [nodes, setNodes] = useState(seedNodes);
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [generationCandidates, setGenerationCandidates] = useState<GenerationCandidate[]>([]);
  const [candidatePreviewUrls, setCandidatePreviewUrls] = useState<Record<string, string>>({});
  const [generationStatuses, setGenerationStatuses] = useState<Record<string, string>>({});
  const [generationBusy, setGenerationBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [canvasToolsExpanded, setCanvasToolsExpanded] = useState(false);
  useEffect(() => {
    if (!canvasToolsExpanded) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.workspace-toolbar-actions')) {
        setCanvasToolsExpanded(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        setCanvasToolsExpanded(false);
        document.querySelector<HTMLButtonElement>('.workspace-toolbar-toggle')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [canvasToolsExpanded]);
  const [researchOpen, setResearchOpen] = useState(false);
  const [queueInitialIds, setQueueInitialIds] = useState<string[]>([]);
  const [queueProgress, setQueueProgress] = useState<CanvasBatchProgress>();
  const [queueReport, setQueueReport] = useState('');
  const generationRequestRef = useRef<{ nodeId: string; controller: AbortController } | undefined>(
    undefined,
  );
  const [project, setProject] = useState<Project>(seedProject);
  const [board, setBoard] = useState<Board>(seedBoard);
  const [boards, setBoards] = useState<Board[]>([seedBoard]);
  const [activeProjectId, setActiveProjectId] = useState(getInitialProjectId);
  const [appView, setAppView] = useState<'home' | 'workspace'>('home');
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [projectCoverUrls, setProjectCoverUrls] = useState<Record<string, string>>({});
  const [homeLoading, setHomeLoading] = useState(true);
  const [demoOpening, setDemoOpening] = useState(false);
  const demoOpeningRef = useRef(false);
  const [namingIntent, setNamingIntent] = useState<NamingIntent>();
  const namingPendingRef = useRef(false);
  const [namingBusy, setNamingBusy] = useState(false);
  const [namingFailed, setNamingFailed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [editingSketch, setEditingSketch] = useState(false);
  const [sketchDraft, setSketchDraft] = useState<{
    node: SketchNode & { label: string };
    document: SketchDocument;
    source: string;
  }>();
  const [history, setHistory] = useState<CanvasNode[][]>([seedNodes]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [canvasMutationBusy, setCanvasMutationBusy] = useState(false);
  const deletionUndoRef = useRef(new WeakMap<CanvasNode[], CanvasDeletionSnapshot>());
  const [workspaceMode, setWorkspaceMode] = useState<'canvas' | 'graph' | 'viewer'>('canvas');
  const [canvasInteractionMode, setCanvasInteractionMode] =
    useState<CanvasInteractionMode>('select');
  const [designs, setDesigns] = useState<Design[]>(seedDesigns);
  const [relations, setRelations] = useState<DesignRelation[]>(seedRelations);
  const [graphViewState, setGraphViewState] = useState<GraphViewState>();
  const [selectedDesignId, setSelectedDesignId] = useState<string>();
  const [designNodeToReveal, setDesignNodeToReveal] = useState<string>();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>();
  const [archiveStatus, setArchiveStatus] = useState<string>();
  const [archiveFailed, setArchiveFailed] = useState(false);
  const [projectDownload, setProjectDownload] = useState<ProjectDownload>();
  useEffect(() => {
    return () => {
      if (projectDownload) URL.revokeObjectURL(projectDownload.url);
    };
  }, [projectDownload]);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'failed' | 'saved' | 'saving'>('saved');
  const [saveError, setSaveError] = useState<string>();
  const saveQueue = useRef(createWorkspaceSaveQueue());
  const saveAttempt = useRef(0);
  const [storageError, setStorageError] = useState<string>();
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>();
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerStatus, setProviderStatus] = useState<string>();
  const [aiWorkbenchOpen, setAiWorkbenchOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(() => t('ai.defaultPrompt'));
  const [aiStatus, setAiStatus] = useState<string>();
  const [latestAnalysis, setLatestAnalysis] = useState<string>();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOperation, setAiOperation] = useState<'analyzing' | 'generating'>();
  const [providerReadiness, setProviderReadiness] = useState<
    'checking' | 'missing-key' | 'ready' | 'unconfigured'
  >('unconfigured');
  const [busyCandidateId, setBusyCandidateId] = useState<string>();
  const [modelAssets, setModelAssets] = useState<Asset[]>([]);
  const [viewSets, setViewSets] = useState<ViewSet[]>([]);
  const [cmfSets, setCMFSets] = useState<CMFSet[]>([]);
  const [cmfVariants, setCMFVariants] = useState<CMFVariant[]>([]);
  const [activeModelAssetId, setActiveModelAssetId] = useState<string>();
  const [activeModelUrl, setActiveModelUrl] = useState<string>();
  const [viewerStatus, setViewerStatus] = useState<string>();
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const importInputRef = useRef<HTMLInputElement>(null);
  const referenceImportInputRef = useRef<HTMLInputElement>(null);
  const imageImportKindRef = useRef<'image' | 'reference'>('reference');
  const imageImportPendingRef = useRef(false);
  const modelImportInputRef = useRef<HTMLInputElement>(null);
  const activeModelUrlRef = useRef<string | undefined>(undefined);
  const previewUrlsRef = useRef<Record<string, string>>({});
  const candidatePreviewUrlsRef = useRef<Record<string, string>>({});
  const viewportBoardIdRef = useRef<string | undefined>(undefined);
  const selectedIds = useCanvasRuntimeStore((state) => state.selectedIds);
  const selectedCandidateId = useCanvasRuntimeStore((state) => state.selectedCandidateId);
  const canvasViewport = useCanvasRuntimeStore((state) => state.viewport);
  const saveInputs = useRef({ board, project, edges, canvasViewport });
  saveInputs.current = { board, project, edges, canvasViewport };
  const clearSelection = useCanvasRuntimeStore((state) => state.clearSelection);
  const clearCandidateSelection = useCanvasRuntimeStore((state) => state.clearCandidateSelection);
  const selectCanvasNode = useCanvasRuntimeStore((state) => state.select);
  const setCanvasViewport = useCanvasRuntimeStore((state) => state.setViewport);
  const selectedDesign = designs.find((design) => design.id === selectedDesignId);
  const selectedProvider = providerConfigs.find((config) => config.id === selectedProviderId);
  const selectedCanvasCandidate = generationCandidates.find(
    (candidate) => candidate.id === selectedCandidateId,
  );
  const selectedNode = nodes.find((node) => selectedIds.includes(node.id));
  const selectionContextKey = `${board.id}:${selectedCanvasCandidate?.generationNodeId ?? selectedNode?.id ?? ''}`;
  const generationStatus = generationStatuses[selectionContextKey];
  const setGenerationStatus = useCallback(
    (status?: string, contextId = selectionContextKey) => {
      setGenerationStatuses((current) => updateWorkspaceStatus(current, contextId, status));
    },
    [selectionContextKey],
  );
  const explorationSource = selectedCanvasCandidate
    ? nodes.find(
        (node) => node.type === 'candidate' && node.candidateId === selectedCanvasCandidate.id,
      )
    : selectedNode;
  const candidateGenerationNode = nodes.find(
    (node) => node.id === selectedCanvasCandidate?.generationNodeId,
  );
  const selectedGenerationNode =
    selectedNode?.type === 'generation'
      ? selectedNode
      : candidateGenerationNode?.type === 'generation'
        ? candidateGenerationNode
        : undefined;
  useEffect(() => {
    if (selectedCandidateId && !selectedCanvasCandidate)
      clearCandidateSelection(selectedCandidateId);
  }, [selectedCandidateId, selectedCanvasCandidate, clearCandidateSelection]);
  const activeModelAsset = modelAssets.find((asset) => asset.id === activeModelAssetId);
  const activeModelNode = nodes.find(
    (node): node is CanvasNode & Model3DNode =>
      node.type === 'model3d' && 'assetId' in node && node.assetId === activeModelAssetId,
  );
  const selectedModelAsset =
    selectedNode?.type === 'model3d' && 'assetId' in selectedNode
      ? modelAssets.find((asset) => asset.id === selectedNode.assetId)
      : undefined;
  const saveLabel =
    saveStatus === 'saving'
      ? t('save.saving')
      : saveStatus === 'failed'
        ? t('save.failed')
        : t('save.saved');
  const actionContext: ActionContext = {
    projectId: project.id,
    boardId: board.id,
    selectedNodeIds: selectedIds,
    selectedDesignIds: selectedDesignId ? [selectedDesignId] : [],
  };
  const commit = (next: CanvasNode[], completingDeletion = false) => {
    if (deletionPendingRef.current && !completingDeletion) return nodesRef.current;
    next = reconcileCanvasGroups(next);
    next = next.map((node) => {
      if (node.type !== 'generation') return node;
      const task = node as GenerationNode;
      const region = task.editRegion;
      if (!region) return node;
      const source = next.find((item) => item.id === region.sourceNodeId) as
        | (BaseNode & { assetId?: string; previewAssetId?: string; candidateId?: string })
        | undefined;
      return source &&
        (source.assetId ?? source.previewAssetId ?? source.candidateId) === region.sourceAssetId
        ? node
        : { ...node, editRegion: undefined };
    });
    nodesRef.current = next;
    setNodes(next);
    setHistory((old) => [...old.slice(0, historyIndex + 1), next]);
    setHistoryIndex((old) => old + 1);
    return next;
  };
  const replaceNodesAndResetHistory = (next: CanvasNode[]) => {
    nodesRef.current = next;
    setNodes(next);
    setHistory([next]);
    setHistoryIndex(0);
  };
  const deletionPendingRef = useRef(false);
  const remove = async () => {
    if (!selectedIds.length || generationBusy || deletionPendingRef.current) return;
    const removed = [...selectedIds];
    deletionPendingRef.current = true;
    setCanvasMutationBusy(true);
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) return;
      const deletion = await repository.deleteCanvasNodesWithUndo(board.id, removed);
      const updatedBoard = deletion.board;
      setBoard(updatedBoard);
      setEdges((current) => current.filter((edge) => updatedBoard.edgeIds.includes(edge.id)));
      setGenerationCandidates(await canvasGenerationStorage.listCandidates(board.id));
      const frame = commit(
        nodesRef.current.filter((node) => updatedBoard.nodeIds.includes(node.id)),
        true,
      );
      deletionUndoRef.current.set(frame, deletion.undo);
      clearSelection();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      deletionPendingRef.current = false;
      setCanvasMutationBusy(false);
      setGenerationBusy(false);
    }
  };
  const duplicate = () => {
    const copyIds = new Set(selectedIds);
    nodes.forEach((node) => {
      if (node.type === 'group' && copyIds.has(node.id))
        node.childNodeIds.forEach((id) => copyIds.add(id));
    });
    const originals = nodes.filter((node) => copyIds.has(node.id));
    if (originals.some((node) => node.type === 'candidate')) {
      setSaveError(t('workspace.copyCandidateHint'));
      return;
    }
    const ids = new Map(originals.map((node) => [node.id, crypto.randomUUID()]));
    const copies = originals.map((node): CanvasNode => ({
      ...node,
      id: ids.get(node.id)!,
      x: node.x + 16,
      y: node.y + 16,
      ...(node.type === 'group'
        ? { childNodeIds: node.childNodeIds.map((id) => ids.get(id)!) }
        : {}),
    }));
    if (copies.length) commit([...nodes, ...copies]);
  };
  const moveHistory = async (direction: -1 | 1) => {
    const target = historyIndex + direction;
    if (target < 0 || target >= history.length || generationBusy || deletionPendingRef.current)
      return;
    const frame = direction === -1 ? history[historyIndex] : history[target];
    const deletion = deletionUndoRef.current.get(frame);
    deletionPendingRef.current = true;
    setCanvasMutationBusy(true);
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) return;
      if (deletion) {
        if (direction === -1) {
          setBoard(await repository.restoreCanvasDeletion(deletion));
        } else {
          const removed = deletion.before.nodes
            .filter((node) => !deletion.after.nodes.some((other) => other.id === node.id))
            .map((node) => node.id);
          const redone = await repository.deleteCanvasNodesWithUndo(board.id, removed);
          deletionUndoRef.current.set(frame, redone.undo);
          setBoard(redone.board);
        }
        setEdges(await repository.listEdges(board.id));
        setGenerationCandidates(await canvasGenerationStorage.listCandidates(board.id));
      }
      setHistoryIndex(target);
      nodesRef.current = history[target];
      setNodes(history[target]);
      clearSelection();
    } catch {
      setSaveError(t('workspace.historyFailed'));
    } finally {
      deletionPendingRef.current = false;
      setCanvasMutationBusy(false);
      setGenerationBusy(false);
    }
  };
  const undo = () => {
    void moveHistory(-1);
  };
  const redo = () => {
    void moveHistory(1);
  };
  const workspaceActionRuntime = {
    duplicateSelection: duplicate,
    deleteSelection: remove,
    groupSelection: () => {
      try {
        const group = createCanvasGroup(
          nodes,
          selectedIds,
          crypto.randomUUID(),
          t('node.group'),
          Date.now(),
        );
        commit([...nodes, group]);
        selectCanvasNode(group.id, false);
      } catch {
        setSaveError(t('workspace.groupHint'));
      }
    },
    ungroupSelection: () => {
      const groups = nodes.filter((node) => node.type === 'group' && selectedIds.includes(node.id));
      if (groups.length) {
        commit(nodes.filter((node) => !groups.includes(node)));
        clearSelection();
      }
    },
  };
  const registerPreviewUrl = useCallback((assetId: string, blob: Blob) => {
    const nextUrl = URL.createObjectURL(blob);
    const previousUrl = previewUrlsRef.current[assetId];
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    previewUrlsRef.current = { ...previewUrlsRef.current, [assetId]: nextUrl };
    setPreviewUrls(previewUrlsRef.current);
  }, []);
  useEffect(
    () => () => {
      const urls = previewUrlsRef.current;
      previewUrlsRef.current = {};
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
      Object.values(candidatePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      if (activeModelUrlRef.current) URL.revokeObjectURL(activeModelUrlRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!hydrated || appView !== 'workspace') return;
    const previewAssetIds = nodes
      .flatMap((node) => {
        const previewId =
          'previewAssetId' in node && typeof node.previewAssetId === 'string'
            ? node.previewAssetId
            : undefined;
        const assetId =
          'assetId' in node && typeof node.assetId === 'string' ? node.assetId : undefined;
        return [previewId, assetId].filter((value): value is string => Boolean(value));
      })
      .concat(viewSets.flatMap((set) => Object.values(set.views)));
    void Promise.all(
      previewAssetIds
        .filter((assetId) => !previewUrlsRef.current[assetId])
        .map(async (assetId) => {
          const blob = await threeViewerStorage.getAssetBlobById(assetId);
          const demoImage =
            activeProjectId === seedProject.id
              ? demoImages.find((image) => image.id === assetId)
              : undefined;
          if (blob && (!demoImage || (blob.size && blob.type.startsWith('image/')))) {
            registerPreviewUrl(assetId, blob);
            return;
          }
          if (!demoImage) return;
          try {
            registerPreviewUrl(assetId, await installDemoImage(demoImage));
          } catch {
            setStorageError(t('feedback.demoUnavailable'));
          }
        }),
    );
  }, [activeProjectId, appView, hydrated, nodes, viewSets, registerPreviewUrl, t]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      generationCandidates.map(async (candidate) => {
        const blob = await canvasGenerationStorage.getCandidateBlob(candidate.id);
        return blob ? ([candidate.id, URL.createObjectURL(blob)] as const) : undefined;
      }),
    ).then((entries) => {
      const next = Object.fromEntries(
        entries.filter((entry): entry is readonly [string, string] => Boolean(entry)),
      );
      if (cancelled) {
        Object.values(next).forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      Object.values(candidatePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      candidatePreviewUrlsRef.current = next;
      setCandidatePreviewUrls(next);
    });
    return () => {
      cancelled = true;
    };
  }, [generationCandidates]);
  const runWorkspaceAction = (
    actionId:
      | 'workspace.duplicateSelection'
      | 'workspace.deleteSelection'
      | 'workspace.groupSelection'
      | 'workspace.ungroupSelection',
  ) => {
    if (deletionPendingRef.current) return;
    void actionRunner.run({
      actionId,
      context: actionContext,
      input: {},
      runtime: workspaceActionRuntime,
    });
  };
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      setHydrated(false);
      try {
        await canvasGenerationStorage.reconcileCandidateResults(activeProjectId);
        const [
          snapshot,
          storedDesigns,
          storedRelations,
          storedGraphViewState,
          storedModelAssets,
          storedBoards,
          storedViewSets,
          storedCMFSets,
          storedCMFVariants,
        ] = await Promise.all([
          repository.loadSnapshot(activeProjectId),
          repository.listDesigns(activeProjectId),
          repository.listDesignRelations(activeProjectId),
          repository.getGraphViewState(activeProjectId),
          threeViewerStorage.listModelAssets(activeProjectId),
          repository.listBoards(activeProjectId),
          repository.listViewSets(activeProjectId),
          repository.listCMFSets(activeProjectId),
          repository.listCMFVariants(activeProjectId),
        ]);
        if (cancelled) return;
        const activeBoardId =
          snapshot?.board.id ?? (activeProjectId === seedProject.id ? seedBoard.id : '');
        const [storedEdges, storedCandidates] = await Promise.all([
          repository.listEdges(activeBoardId),
          canvasGenerationStorage.listCandidates(activeBoardId),
        ]);
        if (cancelled) return;
        if (snapshot) {
          const restoredNodes =
            activeProjectId === seedProject.id
              ? restoreDemoPreviewIds(snapshot.nodes as CanvasNode[])
              : (snapshot.nodes as CanvasNode[]);
          setProject({ ...snapshot.project, schemaVersion: PROJECT_SCHEMA_VERSION });
          setBoard(snapshot.board);
          setNodes(restoredNodes);
          setHistory([restoredNodes]);
          setHistoryIndex(0);
        } else if (activeProjectId === seedProject.id) {
          await repository.saveSnapshot({
            project: seedProject,
            board: seedBoard,
            nodes: seedNodes,
          });
          for (const edge of seedEdges) await repository.saveBoardEdge(edge);
          setProject(seedProject);
          setBoard(seedBoard);
          setNodes(seedNodes);
          setHistory([seedNodes]);
          setHistoryIndex(0);
        }
        setBoards(
          storedBoards.length
            ? storedBoards
            : activeProjectId === seedProject.id
              ? [seedBoard]
              : [],
        );
        if (storedDesigns.length) setDesigns(storedDesigns);
        else if (activeProjectId === seedProject.id)
          await Promise.all(seedDesigns.map((design) => repository.saveDesign(design)));
        else setDesigns(activeProjectId === seedProject.id ? seedDesigns : []);
        if (storedRelations.length) setRelations(storedRelations);
        else if (activeProjectId === seedProject.id)
          await Promise.all(
            seedRelations.map((relation) => repository.saveDesignRelation(relation)),
          );
        else setRelations(activeProjectId === seedProject.id ? seedRelations : []);
        setGraphViewState(storedGraphViewState);
        setEdges(!snapshot && activeProjectId === seedProject.id ? [...seedEdges] : storedEdges);
        setGenerationCandidates(orderGenerationCandidates(storedCandidates));
        setModelAssets(storedModelAssets);
        setViewSets(storedViewSets);
        setCMFSets(storedCMFSets);
        setCMFVariants(storedCMFVariants);
        setStorageError(undefined);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : t('feedback.unknownStorage');
        setStorageError(t('feedback.storageUnavailable', { error: message }));
        setSaveStatus('failed');
        setSaveError(message);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);
  useEffect(() => {
    if (hydrated && viewportBoardIdRef.current !== board.id) {
      viewportBoardIdRef.current = board.id;
      setCanvasViewport(board.viewport);
    }
  }, [board.id, board.viewport, hydrated, setCanvasViewport]);
  const refreshRecentProjects = useCallback(async () => {
    setHomeLoading(true);
    try {
      setRecentProjects(await repository.getRecentProjects());
      setStorageError(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('feedback.unknownStorage');
      setStorageError(t('feedback.storageProjectsUnavailable', { error: message }));
    } finally {
      setHomeLoading(false);
    }
  }, []);
  useEffect(() => {
    if (appView === 'home') void refreshRecentProjects();
  }, [appView, refreshRecentProjects]);
  useEffect(() => {
    if (appView !== 'home') return;
    let cancelled = false;
    const urls: string[] = [];
    void Promise.all(
      recentProjects.map(async (item) => {
        try {
          const blob = await loadProjectCover(item, {
            listBoards: repository.listBoards.bind(repository),
            listNodes: repository.listNodes.bind(repository),
            getBlob: threeViewerStorage.getAssetBlobById.bind(threeViewerStorage),
          });
          if (!blob || cancelled) return undefined;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return [item.id, url] as const;
        } catch {
          return undefined;
        }
      }),
    ).then((entries) => {
      if (!cancelled)
        setProjectCoverUrls(Object.fromEntries(entries.filter((entry) => entry !== undefined)));
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [appView, recentProjects]);
  useEffect(() => {
    void providerConfigsRepository.list().then((configs) => {
      setProviderConfigs(configs);
      setSelectedProviderId((selected) => selected ?? configs[0]?.id);
    });
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!selectedProvider) {
      setProviderReadiness('unconfigured');
      return () => {
        cancelled = true;
      };
    }
    setProviderReadiness('checking');
    void credentials.get(selectedProvider.id).then((value) => {
      if (!cancelled) setProviderReadiness(value?.apiKey ? 'ready' : 'missing-key');
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProvider]);
  useEffect(() => {
    const designId = nodes.find((node) => selectedIds.includes(node.id) && node.designId)?.designId;
    if (designId) setSelectedDesignId(designId);
  }, [nodes, selectedIds]);
  const flushPendingSave = useCallback(async () => {
    if (!hydrated) return false;
    const attempt = ++saveAttempt.current;
    const currentNodes = nodesRef.current;
    const inputs = saveInputs.current;
    setSaveStatus('saving');
    setSaveError(undefined);
    const result = await saveQueue.current(async () => {
      const now = Date.now();
      await repository.saveSnapshot({
        project: { ...inputs.project, updatedAt: now },
        board: {
          ...inputs.board,
          updatedAt: now,
          nodeIds: currentNodes.map((node) => node.id),
          viewport: inputs.canvasViewport,
        },
        nodes: currentNodes,
        edges: inputs.edges,
      });
    });
    // An older completion must not hide a newer pending write or permit navigation.
    if (attempt !== saveAttempt.current) return false;
    const latest = saveInputs.current;
    if (
      result.ok &&
      (currentNodes !== nodesRef.current ||
        inputs.board !== latest.board ||
        inputs.project !== latest.project ||
        inputs.edges !== latest.edges ||
        inputs.canvasViewport !== latest.canvasViewport)
    )
      return false;
    if (result.ok) {
      setSaveStatus('saved');
      return true;
    } else {
      setSaveStatus('failed');
      setSaveError(result.error instanceof Error ? result.error.message : t('feedback.unknown'));
      return false;
    }
  }, [board, canvasViewport, edges, hydrated, nodes, project, t]);
  const goHome = async () => {
    if (await flushPendingSave()) setAppView('home');
  };
  useEffect(() => {
    if (!hydrated || appView === 'home' || saveStatus === 'saved') return;
    window.addEventListener('beforeunload', preventUnsavedWorkspaceUnload);
    return () => window.removeEventListener('beforeunload', preventUnsavedWorkspaceUnload);
  }, [appView, hydrated, saveStatus]);
  useEffect(() => {
    // Domain actions persist nodes atomically before publishing them to React.
    // Do not let a deferred UI snapshot erase those nodes during that interval.
    if (!hydrated || generationBusy) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      void flushPendingSave();
    }, 750);
    return () => window.clearTimeout(timer);
  }, [flushPendingSave, hydrated, generationBusy]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.key === 'Process'
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 's') {
        event.preventDefault();
        if (!generationBusy) void flushPendingSave();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
        setContextMenuPosition(undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushPendingSave, generationBusy]);
  const designNavigationPending = useRef(false);
  const reopenSketch = async () => {
    if (generationBusy || selectedNode?.type !== 'sketch' || selectedNode.locked) return;
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Pending save failed.');
      if (
        !('sketchDocumentId' in selectedNode) ||
        typeof selectedNode.sketchDocumentId !== 'string'
      )
        throw new Error('Missing sketch document.');
      const node: SketchNode & { label: string } = {
        ...selectedNode,
        type: 'sketch',
        sketchDocumentId: selectedNode.sketchDocumentId,
      };
      const document = await repository.getSketchDocument(node.sketchDocumentId);
      if (!document || document.projectId !== project.id) throw new Error('Missing sketch source.');
      const asset = await repository.getAsset(document.sourceAssetId);
      if (!asset || asset.projectId !== project.id || asset.storage.type !== 'indexeddb')
        throw new Error('Missing sketch asset.');
      const stored = await repository.getAssetBlob(asset.storage.blobId);
      if (!stored || stored.blob.size > 50 * 1024 * 1024) throw new Error('Missing sketch file.');
      const source = await stored.blob.text();
      (await import('@open-industrial-design/ui/sketch')).parseSketchScene(source);
      setSketchDraft({ node, document, source });
      setEditingSketch(true);
    } catch {
      setArchiveStatus(t('sketch.loadFailed'));
      setArchiveFailed(true);
    } finally {
      setGenerationBusy(false);
    }
  };
  const openDesign = async (designId: string) => {
    if (generationBusy || designNavigationPending.current) return;
    designNavigationPending.current = true;
    try {
      const associatedNode = findDesignCanvasNode(nodesRef.current, designId);
      if (!associatedNode) {
        const otherBoards = boards.filter(
          (item) => item.id !== board.id && item.projectId === project.id,
        );
        const matches = await Promise.all(
          otherBoards.map(async (item) => ({
            board: item,
            node: findDesignCanvasNode(await repository.listNodes(item.id), designId),
          })),
        );
        const match = matches.find((item) => item.node);
        if (match?.node) {
          await selectBoard(match.board, match.node.id);
          return;
        }
      }
      setSelectedDesignId(designId);
      if (associatedNode) selectCanvasNode(associatedNode.id, false);
      else clearSelection();
      setDesignNodeToReveal(associatedNode?.id);
      setWorkspaceMode('canvas');
    } catch {
      setSaveError(t('common.error'));
    } finally {
      designNavigationPending.current = false;
    }
  };
  useEffect(() => {
    if (workspaceMode !== 'canvas' || !designNodeToReveal) return;
    const node = nodes.find((item) => item.id === designNodeToReveal);
    const canvas = document.querySelector('.konva-canvas');
    if (node && canvas) {
      setCanvasViewport(
        revealCanvasNode(useCanvasRuntimeStore.getState().viewport, node, {
          width: canvas.clientWidth,
          height: canvas.clientHeight,
        }),
      );
    }
    setDesignNodeToReveal(undefined);
  }, [workspaceMode, designNodeToReveal, nodes, setCanvasViewport]);
  const openProject = (nextProject: Project) => {
    setArchiveStatus(undefined);
    setProjectDownload(undefined);
    setArchiveFailed(false);
    setActiveProjectId(nextProject.id);
    window.localStorage.setItem(activeProjectStorageKey, nextProject.id);
    setWorkspaceMode('canvas');
    setAppView('workspace');
  };
  const openDemoProject = async () => {
    if (demoOpeningRef.current) return;
    demoOpeningRef.current = true;
    setDemoOpening(true);
    setStorageError(undefined);
    const createdAt = Date.now();
    const projectName = locale === 'zh-CN' ? '便携灯具探索示例' : 'Portable Lamp Exploration';
    try {
      const { primary } = partitionDemoProjects(await repository.getRecentProjects());
      if (primary) {
        openProject(primary);
        return;
      }
      const images = await Promise.all(
        demoImages.map(async (image) => ({
          ...image,
          blob: await loadDemoImageBlob(image),
        })),
      );
      const copy = createDemoCopyArchive(
        {
          project: seedProject,
          board: {
            ...seedBoard,
            viewport: fitDemoCopyViewport(seedNodes, window.innerWidth, window.innerHeight, [
              'sketch-1',
              'reference-1',
              'demo-render',
              'image-1',
            ]),
          },
          nodes: seedNodes,
          edges: seedEdges,
          designs: seedDesigns,
          relations: seedRelations,
          assetIds: demoImages.map((image) => image.id),
        },
        crypto.randomUUID(),
        createdAt,
        images,
        projectName,
      );
      validateProjectArchiveData(copy);
      await archiveStorage.restoreProjectArchive(copy);
      const copiedBoard = copy.boards[0]!;
      const copiedNodes = copy.nodes as CanvasNode[];
      Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = {};
      setPreviewUrls({});
      setProject(copy.project);
      setBoard(copiedBoard);
      setBoards(copy.boards);
      setNodes(copiedNodes);
      setEdges(copy.edges);
      setGenerationCandidates([]);
      setViewSets(copy.viewSets);
      setCMFSets(copy.cmfSets);
      setCMFVariants(copy.cmfVariants);
      setHistory([copiedNodes]);
      setHistoryIndex(0);
      setDesigns(copy.designs);
      setRelations(copy.relations);
      clearSelection();
      setCanvasViewport(copiedBoard.viewport);
      openProject(copy.project);
    } catch {
      setStorageError(t('feedback.demoUnavailable'));
    } finally {
      demoOpeningRef.current = false;
      setDemoOpening(false);
    }
  };
  const createProject = async (inputName: string) => {
    const name = inputName.trim();
    if (!name) return;
    const timestamp = Date.now();
    const id = crypto.randomUUID();
    const initialBoard: Board = {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId: id,
      name: 'Concept',
      nodeIds: [],
      edgeIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const nextProject: Project = {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name,
      boardIds: [initialBoard.id],
      activeBoardId: initialBoard.id,
      settings: {},
    };
    await repository.saveSnapshot({ project: nextProject, board: initialBoard, nodes: [] });
    openProject(nextProject);
  };
  const renameProject = async (target: Project, inputName: string) => {
    const name = inputName.trim();
    if (!name || name === target.name) return;
    const updated = { ...target, name, updatedAt: Date.now() };
    await repository.saveProject(updated);
    if (target.id === project.id) setProject(updated);
    await refreshRecentProjects();
  };
  const deleteProject = async (target: Project) => {
    if (
      !window.confirm(
        t('feedback.deleteProjectConfirm', { name: translateDemoLabel(locale, target.name) }),
      )
    )
      return;
    await repository.deleteProject(target.id);
    if (target.id === activeProjectId) {
      window.localStorage.removeItem(activeProjectStorageKey);
      setAppView('home');
    }
    await refreshRecentProjects();
  };
  const selectBoard = async (nextBoard: Board, focusNodeId?: string) => {
    if (nextBoard.id === board.id) return;
    if (!(await flushPendingSave())) return;
    // Sidebar entries are labels, not the latest persisted viewport or node index.
    const savedBoard = await repository.getBoard(nextBoard.id);
    if (!savedBoard || savedBoard.projectId !== project.id) {
      setSaveError(t('common.error'));
      return;
    }
    const updatedProject = { ...project, activeBoardId: nextBoard.id, updatedAt: Date.now() };
    const nextNodes = (await repository.listNodes(nextBoard.id)) as CanvasNode[];
    const [nextEdges, nextCandidates] = await Promise.all([
      repository.listEdges(nextBoard.id),
      canvasGenerationStorage.listCandidates(nextBoard.id),
    ]);
    await repository.saveProject(updatedProject);
    setProject(updatedProject);
    setBoard(savedBoard);
    setBoards((current) => current.map((item) => (item.id === savedBoard.id ? savedBoard : item)));
    setNodes(nextNodes);
    setEdges(nextEdges);
    setGenerationCandidates(orderGenerationCandidates(nextCandidates));
    setHistory([nextNodes]);
    setHistoryIndex(0);
    clearSelection();
    const focusNode = nextNodes.find((item) => item.id === focusNodeId && !item.hidden);
    if (focusNode) {
      selectCanvasNode(focusNode.id, false);
      setSelectedDesignId(focusNode.designId);
      setDesignNodeToReveal(focusNode.id);
    }
    setWorkspaceMode('canvas');
  };
  const createBoard = async (inputName: string) => {
    const name = inputName.trim();
    if (!name) return;
    if (!(await flushPendingSave())) return;
    const timestamp = Date.now();
    const nextBoard: Board = {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId: project.id,
      name,
      nodeIds: [],
      edgeIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const updatedProject = {
      ...project,
      activeBoardId: nextBoard.id,
      boardIds: [...project.boardIds, nextBoard.id],
      updatedAt: timestamp,
    };
    await Promise.all([repository.saveBoard(nextBoard), repository.saveProject(updatedProject)]);
    setProject(updatedProject);
    setBoard(nextBoard);
    setBoards((current) => [...current, nextBoard]);
    setNodes([]);
    setEdges([]);
    setGenerationCandidates([]);
    setHistory([[]]);
    setHistoryIndex(0);
    clearSelection();
    setWorkspaceMode('canvas');
  };
  const renameBoard = async (target: Board, inputName: string) => {
    const name = inputName.trim();
    if (!name || name === target.name) return;
    const updated = { ...target, name, updatedAt: Date.now() };
    await repository.saveBoard(updated);
    setBoards((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    if (board.id === updated.id) setBoard(updated);
  };
  const submitNamingIntent = async () => {
    if (!namingIntent?.value.trim() || namingPendingRef.current) return;
    const intent = namingIntent;
    namingPendingRef.current = true;
    setNamingBusy(true);
    setNamingFailed(false);
    try {
      if (intent.kind === 'new-project') await createProject(intent.value);
      if (intent.kind === 'rename-project') await renameProject(intent.target, intent.value);
      if (intent.kind === 'new-board') await createBoard(intent.value);
      if (intent.kind === 'new-concept') await createConceptCard(intent.value);
      if (intent.kind === 'rename-board') await renameBoard(intent.target, intent.value);
      setNamingIntent(undefined);
    } catch {
      setNamingFailed(true);
    } finally {
      namingPendingRef.current = false;
      setNamingBusy(false);
    }
  };
  const deleteBoard = async (target: Board) => {
    if (boards.length <= 1) {
      setSaveStatus('failed');
      setSaveError(t('feedback.boardRequired'));
      return;
    }
    if (
      !window.confirm(
        t('feedback.deleteBoardConfirm', { name: translateDemoLabel(locale, target.name) }),
      )
    )
      return;
    const remaining = boards.filter((item) => item.id !== target.id);
    const nextActiveBoard = target.id === board.id ? remaining[0] : board;
    const updatedProject = {
      ...project,
      boardIds: remaining.map((item) => item.id),
      activeBoardId: nextActiveBoard.id,
      updatedAt: Date.now(),
    };
    await repository.deleteBoard(target.id);
    await repository.saveProject(updatedProject);
    setBoards(remaining);
    setProject(updatedProject);
    if (target.id === board.id) {
      const nextNodes = (await repository.listNodes(nextActiveBoard.id)) as CanvasNode[];
      const [nextEdges, nextCandidates] = await Promise.all([
        repository.listEdges(nextActiveBoard.id),
        canvasGenerationStorage.listCandidates(nextActiveBoard.id),
      ]);
      setBoard(nextActiveBoard);
      setNodes(nextNodes);
      setEdges(nextEdges);
      setGenerationCandidates(orderGenerationCandidates(nextCandidates));
      setHistory([nextNodes]);
      setHistoryIndex(0);
      clearSelection();
      setWorkspaceMode('canvas');
    }
  };
  const importReference = async (file: File) => {
    if (generationBusy || imageImportPendingRef.current || !hydrated) return;
    const kind = imageImportKindRef.current;
    imageImportPendingRef.current = true;
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Save failed.');
      if (
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(file.type) ||
        !file.size ||
        file.size > 25 * 1024 * 1024
      )
        throw new Error('Unsupported image.');
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width,
        height = bitmap.height;
      bitmap.close();
      const viewport = useCanvasRuntimeStore.getState().viewport;
      const position = findFreeNodePosition(nodesRef.current, {
        x: (80 - viewport.x) / viewport.zoom,
        y: (100 - viewport.y) / viewport.zoom,
        width: 280,
        height: Math.max(180, Math.min(400, (256 * height) / width + 68)),
      });
      const record = await actionRunner.run({
        actionId: 'workspace.importImage',
        context: actionContext,
        input: {
          name: file.name,
          kind,
          mimeType: file.type,
          size: file.size,
          width,
          height,
          ...position,
        },
        runtime: { blob: file, save: repository.importLocalImage.bind(repository) },
      });
      if (record.status !== 'success') throw new Error('Import failed.');
      const result = record.result as unknown as { asset: Asset; node: CanvasNode };
      registerPreviewUrl(result.asset.id, file);
      commit([...nodesRef.current, result.node]);
      selectCanvasNode(result.node.id, false);
      const canvas = document.querySelector('.konva-canvas');
      setCanvasViewport(
        revealCanvasNode(viewport, result.node, {
          width: canvas?.clientWidth ?? 740,
          height: canvas?.clientHeight ?? 500,
        }),
      );
      setArchiveStatus(undefined);
      setArchiveFailed(false);
    } catch {
      setArchiveStatus(t('image.importFailed'));
      setArchiveFailed(true);
      setProjectDownload(undefined);
    } finally {
      imageImportPendingRef.current = false;
      setGenerationBusy(false);
    }
  };
  const createConceptCard = async (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    if (generationBusy) throw new Error('Workspace is busy.');
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Save failed.');
      const position = findFreeNodePosition(nodesRef.current, {
        x: 220,
        y: 180,
        width: 320,
        height: 360,
      });
      const record = await actionRunner.run({
        actionId: 'design.createBlankConcept',
        context: actionContext,
        input: { name: normalizedName, ...position },
        runtime: { create: repository.createBlankConcept.bind(repository) },
      });
      if (record.status !== 'success') throw new Error('Concept creation failed.');
      const created = record.result as unknown as { design: Design; node: CanvasNode };
      setDesigns((current) => [...current, created.design]);
      commit([...nodesRef.current, created.node]);
      setSelectedDesignId(created.design.id);
      selectCanvasNode(created.node.id, false);
      setDesignNodeToReveal(created.node.id);
      setWorkspaceMode('canvas');
    } finally {
      setGenerationBusy(false);
    }
  };
  const continueExploration = async (toolId: string) => {
    const tool = findGenerationTool(toolId);
    if (!tool || !explorationSource || generationBusy) return;
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) return;
      const record = await actionRunner.run({
        actionId: 'workspace.createGenerationStep',
        context: actionContext,
        input: {
          sourceNodeId: explorationSource.id,
          label: t(tool.label),
          direction: t(tool.prompt),
          requestedViews: tool.id === 'view' ? ['perspective'] : undefined,
          localEdit: ['local', 'erase', 'local-cmf'].includes(tool.id),
          localCmf: tool.id === 'local-cmf' ? { color: '', material: '', finish: '' } : undefined,
          localEditMode: tool.id === 'erase' ? 'erase' : undefined,
          removeBackground: tool.id === 'cutout' ? true : undefined,
          patternPlacement: tool.id === 'pattern' ? { ...defaultPatternPlacement } : undefined,
          patternTask:
            tool.id === 'pattern-create'
              ? { kind: 'create', repeat: 'single' }
              : tool.id === 'pattern-transfer'
                ? { kind: 'transfer', placement: '', scale: 'medium' }
                : undefined,
        },
        runtime: {
          nodes,
          edges,
          saveStep: async (node: GenerationNode, edge: Edge) => {
            const updatedBoard = await repository.createGenerationStep(node, edge);
            setBoard(updatedBoard);
          },
        },
      });
      if (record.status !== 'success') throw new Error(record.error?.message ?? t('common.error'));
      const result = record.result as unknown as { node: GenerationNode; edge: Edge };
      commit([...nodes, result.node]);
      setEdges((current) => [...current, result.edge]);
      selectCanvasNode(result.node.id, false);
      const viewport = useCanvasRuntimeStore.getState().viewport;
      const canvas = document.querySelector('.konva-canvas');
      const width = canvas?.clientWidth ?? 740;
      const height = canvas?.clientHeight ?? 500;
      setCanvasViewport(revealCanvasNode(viewport, result.node, { width, height }));
      setGenerationStatus(undefined);
    } catch (error) {
      setGenerationStatus(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setGenerationBusy(false);
    }
  };
  const saveTextNote = async (nodeId: string | undefined, text: string, fontSize: number) => {
    if (generationBusy) throw new Error('Workspace is busy.');
    const viewport = useCanvasRuntimeStore.getState().viewport;
    const position = findFreeNodePosition(nodesRef.current, {
      x: (80 - viewport.x) / viewport.zoom,
      y: (100 - viewport.y) / viewport.zoom,
      width: 320,
      height: 180,
    });
    const record = await actionRunner.run({
      actionId: 'workspace.saveText',
      context: actionContext,
      input: { nodeId, text, fontSize, ...position },
      runtime: {
        readNode: (id: string) => nodesRef.current.find((node) => node.id === id),
        commitText: (node: CanvasNode) => {
          const current = nodesRef.current;
          commit(
            nodeId ? current.map((item) => (item.id === nodeId ? node : item)) : [...current, node],
          );
          selectCanvasNode(node.id, false);
          const canvas = document.querySelector('.konva-canvas');
          setCanvasViewport(
            revealCanvasNode(viewport, node, {
              width: canvas?.clientWidth ?? 740,
              height: canvas?.clientHeight ?? 500,
            }),
          );
        },
      },
    });
    if (record.status !== 'success') throw new Error(t('text.failed'));
  };
  const createGenerationCard = () => {
    const timestamp = Date.now();
    const rightmost = nodes.reduce(
      (right, existing) => Math.max(right, existing.x + existing.width),
      0,
    );
    const x = nodes.length ? rightmost + 40 : 80;
    const y = nodes.find((existing) => selectedIds.includes(existing.id))?.y ?? 164;
    const node: GenerationNode = {
      id: crypto.randomUUID(),
      boardId: board.id,
      type: 'generation',
      label: t('node.generation'),
      direction: '',
      notes: '',
      count: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
      x,
      y,
      width: 290,
      height: 300,
      rotation: 0,
      zIndex: nodes.length + 1,
    };
    commit([...nodes, node]);
    selectCanvasNode(node.id, false);
    if (nodes.length) {
      const zoom = Math.min(useCanvasRuntimeStore.getState().viewport.zoom, 0.65);
      const canvasWidth = document.querySelector('.konva-canvas')?.clientWidth ?? 740;
      setCanvasViewport({
        x: Math.min(24, canvasWidth - (x + node.width) * zoom - 24),
        y: 24,
        zoom,
      });
    }
  };
  const connectGenerationInput = async (
    sourceNodeId: string,
    targetNodeId: string,
    role: GenerationInputRole,
  ) => {
    const error = validateGenerationInput(nodes, edges, sourceNodeId, targetNodeId, role);
    if (error) {
      setGenerationStatus(translateGenerationConnectionError(locale, error));
      return;
    }
    const timestamp = Date.now();
    const edge: Edge = {
      id: crypto.randomUUID(),
      boardId: board.id,
      sourceNodeId,
      targetNodeId,
      type: 'generation_input',
      inputRole: role,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    try {
      const updatedBoard = await repository.saveBoardEdge(edge);
      setBoard(updatedBoard);
      setEdges((current) => [...current, edge]);
      setGenerationStatus(undefined);
      selectCanvasNode(targetNodeId, false);
    } catch (error) {
      setGenerationStatus(error instanceof Error ? error.message : t('common.error'));
    }
  };
  const disconnectGenerationInput = async (edgeId: string) => {
    const edge = edges.find((item) => item.id === edgeId);
    if (!edge) return;
    try {
      const updatedBoard = await repository.deleteBoardEdge(edge);
      setBoard(updatedBoard);
      setEdges((current) => current.filter((item) => item.id !== edgeId));
    } catch (error) {
      setGenerationStatus(error instanceof Error ? error.message : t('common.error'));
    }
  };
  const prepareExplorationBatch = async (input: CreateExplorationBatchInput) => {
    if (generationBusy || generationRequestRef.current) throw new Error('Generation is busy.');
    if (!(await flushPendingSave())) throw new Error('Save failed.');
    const record = await actionRunner.run({
      actionId: 'workspace.createExplorationBatch',
      context: actionContext,
      input,
      runtime: {
        nodes: nodesRef.current,
        edges,
        saveBatch: async (steps: ExplorationBatchStep[]) => {
          setBoard(await repository.createGenerationBatch(steps));
        },
      },
    });
    if (record.status !== 'success')
      throw new Error(record.error?.message ?? 'Batch preparation failed.');
    const { steps } = record.result as unknown as { steps: ExplorationBatchStep[] };
    replaceNodesAndResetHistory([...nodesRef.current, ...steps.map((step) => step.node)]);
    setEdges((current) => [
      ...current,
      ...steps.flatMap((step) => [step.edge, ...(step.referenceEdges ?? [])]),
    ]);
    selectCanvasNode(steps[0]!.node.id, false);
    setQueueInitialIds(steps.map((step) => step.node.id));
  };
  const placeMaterial = async (entry: LocalMaterialEntry) => {
    if (generationBusy || generationRequestRef.current || !(await flushPendingSave()))
      throw new Error('Workspace is not ready.');
    const position = findFreeNodePosition(nodesRef.current, {
      x: 160,
      y: 180,
      width: 280,
      height: 220,
    });
    const record = await actionRunner.run({
      actionId: 'workspace.placeMaterial',
      context: actionContext,
      input: { assetId: entry.asset.id, name: entry.asset.name.slice(0, 500), ...position },
      runtime: {
        place: (projectId: string, assetId: string, node: ReferenceNode) =>
          repository.placeLocalMaterial(projectId, assetId, node),
      },
    });
    if (record.status !== 'success') throw new Error('Material placement failed.');
    const result = record.result as unknown as PlaceMaterialResult;
    replaceNodesAndResetHistory([
      ...nodesRef.current,
      { ...result.node, label: result.asset.name },
    ]);
    setBoard((current) => ({ ...current, nodeIds: [...current.nodeIds, result.node.id] }));
    selectCanvasNode(result.node.id, false);
  };
  const loadResearch = useCallback(async () => {
    const [saved, materials] = await Promise.all([
      repository.getProject(project.id),
      repository.searchLocalMaterials('', project.id),
    ]);
    if (!saved) throw new Error('Project unavailable.');
    return { library: saved.researchLibrary, materials };
  }, [project.id]);
  const importResearchImage = async (
    file: File,
    collectionId: string | undefined,
    expected: ResearchLibrary | undefined,
  ) => {
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(file.type) ||
      !file.size ||
      file.size > 25 * 1024 * 1024
    )
      throw new Error('Unsupported image.');
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width,
      height = bitmap.height;
    bitmap.close();
    const record = await actionRunner.run({
      actionId: 'workspace.importResearchImage',
      context: actionContext,
      input: {
        name: file.name,
        mimeType: file.type,
        size: file.size,
        width,
        height,
        collectionId,
        expected,
      },
      runtime: { blob: file, save: repository.importResearchImage.bind(repository) },
    });
    if (record.status !== 'success') throw new Error('Research import failed.');
  };
  const saveResearch = async (command: ResearchCommand, expected: ResearchLibrary | undefined) => {
    const record = await actionRunner.run({
      actionId: 'workspace.editResearch',
      context: actionContext,
      input: { command, expected },
      runtime: {
        loadProject: (id: string) => repository.getProject(id),
        loadAssets: async (id: string) =>
          (await repository.searchLocalMaterials('', id)).map((item) => item.asset),
        save: (id: string, library: ResearchLibrary, previous: ResearchLibrary | undefined) =>
          repository.saveResearchLibrary(id, library, previous),
      },
    });
    if (record.status !== 'success') throw new Error('Research save failed.');
    const saved = await repository.getProject(project.id);
    if (!saved?.researchLibrary) throw new Error('Research unavailable.');
    return saved.researchLibrary;
  };
  const saveMaterialKnowledge = async (entry: LocalMaterialEntry, knowledge: MaterialKnowledge) => {
    if (entry.asset.projectId !== project.id || generationBusy || !(await flushPendingSave()))
      throw new Error('Workspace is not ready.');
    const record = await actionRunner.run({
      actionId: 'workspace.saveMaterialKnowledge',
      context: actionContext,
      input: { assetId: entry.asset.id, knowledge },
      runtime: {
        save: (projectId: string, assetId: string, value: MaterialKnowledge) =>
          repository.saveMaterialKnowledge(projectId, assetId, value),
      },
    });
    if (record.status !== 'success') throw new Error('Material save failed.');
  };
  const analyzeMaterials = async (
    assetIds: string[],
    question: string,
    providerId: string,
    research?: NonNullable<Project['researchLibrary']>['entries'],
  ) => {
    const provider = providerConfigs.find((item) => item.id === providerId);
    if (!provider || generationBusy || !(await flushPendingSave())) throw new Error('Not ready.');
    const record = await actionRunner.run({
      actionId: 'ai.analyzeMaterials',
      context: actionContext,
      input: { assetIds, question, provider, ...(research ? { research } : {}) },
      runtime: {
        router: capabilityRouter,
        credentials,
        loadResearchProject: repository.getProject.bind(repository),
        saveInputs: (generation: Generation, images: ProviderImageInput[]) =>
          canvasGenerationStorage.saveGenerationInputs(
            generation,
            images.map((image, index) => ({
              id: generation.inputSnapshots![index]!.id,
              generationId: generation.id,
              projectId: generation.projectId,
              blob: new Blob([new Uint8Array(image.data)], { type: image.mimeType }),
            })),
          ),
        saveGeneration: generationStorage.saveGeneration.bind(generationStorage),
        loadMaterial: async (assetId: string) => {
          const asset = await repository.getAsset(assetId);
          if (!asset || asset.projectId !== project.id || asset.storage.type !== 'indexeddb')
            return;
          const stored = await repository.getAssetBlob(asset.storage.blobId);
          if (!stored?.blob.size) return;
          return {
            asset,
            image: {
              mimeType: asset.mimeType,
              data: new Uint8Array(await stored.blob.arrayBuffer()),
            },
          };
        },
      },
    });
    if (record.status !== 'success') throw new Error('Comparison failed.');
    return (record.result as { analysis: string }).analysis;
  };
  const saveDesignDna = async (designId: string, dna: NonNullable<Design['dna']>) => {
    if (generationBusy) throw new Error('Workspace is busy.');
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Save failed.');
      const record = await actionRunner.run({
        actionId: 'design.saveDna',
        context: actionContext,
        input: { designId, dna },
        runtime: {
          getDesign: repository.getDesign.bind(repository),
          saveDesign: repository.saveDesign.bind(repository),
        },
      });
      if (record.status !== 'success') throw new Error('Design constraints could not be saved.');
      const updated = record.result as unknown as Design;
      setDesigns((current) =>
        current.map((design) => (design.id === updated.id ? updated : design)),
      );
    } finally {
      setGenerationBusy(false);
    }
  };
  const saveManualViews = async (
    designId: string,
    viewSetId: string | undefined,
    name: string,
    views: ViewSet['views'],
    placeOnBoard = false,
  ) => {
    if (generationBusy) throw new Error('Workspace is busy.');
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Save failed.');
      const source = nodes.find((node) => node.designId === designId);
      const position = findFreeNodePosition(nodes, {
        x: (source?.x ?? 0) + 400,
        y: source?.y ?? 0,
        width: 320,
        height: 260,
      });
      const record = await actionRunner.run({
        actionId: 'design.saveViewSet',
        context: actionContext,
        input: { designId, viewSetId, name, views, placeOnBoard, ...position },
        runtime: { saveViewSetWithNode: repository.saveViewSetWithNode.bind(repository) },
      });
      if (record.status !== 'success') throw new Error('View set could not be saved.');
      const result = record.result as unknown as { viewSet: ViewSet; node?: ViewSetNode };
      setViewSets((current) => [
        ...current.filter((set) => set.id !== result.viewSet.id),
        result.viewSet,
      ]);
      if (result.node) {
        replaceNodesAndResetHistory([
          ...nodesRef.current,
          { ...result.node, label: result.viewSet.name ?? t('views.title') },
        ]);
        selectCanvasNode(result.node.id, false);
        const canvas = document.querySelector('.konva-canvas');
        setCanvasViewport(
          revealCanvasNode(useCanvasRuntimeStore.getState().viewport, result.node, {
            width: canvas?.clientWidth ?? 740,
            height: canvas?.clientHeight ?? 500,
          }),
        );
      }
    } finally {
      setGenerationBusy(false);
    }
  };
  const saveDesignDecision = async (
    designId: string,
    expectedStatus: DesignStatus,
    status: DesignStatus,
  ) => {
    if (generationBusy) throw new Error('Workspace is busy.');
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Save failed.');
      const record = await actionRunner.run({
        actionId: 'design.transitionStatus',
        context: actionContext,
        input: { designId, expectedStatus, status },
        runtime: { transition: repository.transitionDesignDecision.bind(repository) },
      });
      if (record.status !== 'success') throw new Error('Decision could not be saved.');
      const updated = record.result as unknown as Design;
      setDesigns((current) =>
        current.map((design) => (design.id === updated.id ? updated : design)),
      );
    } finally {
      setGenerationBusy(false);
    }
  };
  const createManualConcept = async (sourceNodeId: string, name: string) => {
    if (generationBusy) throw new Error('Workspace is busy.');
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Save failed.');
      const source = nodesRef.current.find((node) => node.id === sourceNodeId);
      if (!source) throw new Error('Source unavailable.');
      const position = findFreeNodePosition(nodesRef.current, {
        x: source.x + source.width + 80,
        y: source.y,
        width: 320,
        height: 360,
      });
      const record = await actionRunner.run({
        actionId: 'design.createFromImage',
        context: actionContext,
        input: { sourceNodeId, name, ...position },
        runtime: { create: repository.createConceptFromImage.bind(repository) },
      });
      if (record.status !== 'success') throw new Error('Concept creation failed.');
      const result = record.result as unknown as { designId: string; nodeId: string };
      const snapshot = await repository.loadSnapshot(project.id);
      const createdNode = snapshot?.nodes.find((node) => node.id === result.nodeId);
      if (!createdNode) throw new Error('Concept card unavailable.');
      setDesigns(await repository.listDesigns(project.id));
      setEdges(await repository.listEdges(board.id));
      replaceNodesAndResetHistory([
        ...nodesRef.current,
        { ...createdNode, label: name.trim() } as CanvasNode,
      ]);
      setSelectedDesignId(result.designId);
      selectCanvasNode(result.nodeId, false);
      const canvas = document.querySelector('.konva-canvas');
      setCanvasViewport(
        revealCanvasNode(useCanvasRuntimeStore.getState().viewport, createdNode, {
          width: canvas?.clientWidth ?? 740,
          height: canvas?.clientHeight ?? 500,
        }),
      );
    } finally {
      setGenerationBusy(false);
    }
  };
  const createManualVariant = async (designId: string, name: string) => {
    if (generationBusy) throw new Error('Workspace is busy.');
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Save failed.');
      const sourceDesign = await repository.getDesign(designId);
      const source = nodes.find(
        (node) =>
          node.designId === designId && (node.type === 'concept' || node.type === 'variant'),
      );
      if (!sourceDesign) throw new Error('Source design unavailable.');
      const position = findFreeNodePosition(nodes, {
        x: (source?.x ?? 0) + 400,
        y: source?.y ?? 0,
        width: 320,
        height: 360,
      });
      const record = await actionRunner.run({
        actionId: 'design.createVariant',
        context: actionContext,
        input: {
          sourceDesign,
          name,
          ...position,
          previewAssetId: source && 'previewAssetId' in source ? source.previewAssetId : undefined,
        },
        runtime: {
          persistVariant: (value: Parameters<typeof repository.saveManualVariant>[1]) =>
            repository.saveManualVariant(project.id, value),
        },
      });
      if (record.status !== 'success') throw new Error('Variant creation failed.');
      const result = record.result as unknown as { designId: string; nodeId: string };
      const [storedDesigns, storedRelations, snapshot] = await Promise.all([
        repository.listDesigns(project.id),
        repository.listDesignRelations(project.id),
        repository.loadSnapshot(project.id),
      ]);
      const createdNode = snapshot?.nodes.find((node) => node.id === result.nodeId);
      if (!createdNode) throw new Error('Variant card unavailable.');
      setDesigns(storedDesigns);
      setRelations(storedRelations);
      replaceNodesAndResetHistory([
        ...nodesRef.current,
        { ...createdNode, label: name.trim() } as CanvasNode,
      ]);
      setSelectedDesignId(result.designId);
      selectCanvasNode(result.nodeId, false);
      const canvas = document.querySelector('.konva-canvas');
      setCanvasViewport(
        revealCanvasNode(useCanvasRuntimeStore.getState().viewport, createdNode, {
          width: canvas?.clientWidth ?? 740,
          height: canvas?.clientHeight ?? 500,
        }),
      );
    } finally {
      setGenerationBusy(false);
    }
  };
  const saveManualCMF = async (
    designId: string,
    cmfSetId: string | undefined,
    name: string,
    variants: CMFVariantDraft[],
    placeOnBoard = false,
  ) => {
    if (generationBusy) throw new Error('Workspace is busy.');
    setGenerationBusy(true);
    try {
      if (!(await flushPendingSave())) throw new Error('Save failed.');
      const source = nodes.find((node) => node.designId === designId);
      const position = findFreeNodePosition(nodes, {
        x: (source?.x ?? 0) + 400,
        y: source?.y ?? 0,
        width: 320,
        height: 260,
      });
      const record = await actionRunner.run({
        actionId: 'design.saveCMFSet',
        context: actionContext,
        input: { designId, cmfSetId, name, variants, placeOnBoard, ...position },
        runtime: { saveCMFSetWithNode: repository.saveCMFSetWithNode.bind(repository) },
      });
      if (record.status !== 'success') throw new Error('CMF could not be saved.');
      const result = record.result as unknown as {
        cmfSet: CMFSet;
        variants: CMFVariant[];
        node?: CMFNode;
      };
      setCMFSets((current) => [
        ...current.filter((set) => set.id !== result.cmfSet.id),
        result.cmfSet,
      ]);
      setCMFVariants((current) => [
        ...current.filter((item) => !result.variants.some((v) => v.id === item.id)),
        ...result.variants,
      ]);
      if (result.node) {
        replaceNodesAndResetHistory([
          ...nodesRef.current,
          { ...result.node, label: result.cmfSet.name ?? 'CMF' },
        ]);
        selectCanvasNode(result.node.id, false);
        const canvas = document.querySelector('.konva-canvas');
        setCanvasViewport(
          revealCanvasNode(useCanvasRuntimeStore.getState().viewport, result.node, {
            width: canvas?.clientWidth ?? 740,
            height: canvas?.clientHeight ?? 500,
          }),
        );
      }
    } finally {
      setGenerationBusy(false);
    }
  };
  const updateGenerationNode = (patch: Partial<GenerationNode>) => {
    if (!selectedGenerationNode) return;
    commit(
      nodes.map((node) =>
        node.id === selectedGenerationNode.id
          ? { ...selectedGenerationNode, ...patch, updatedAt: Date.now() }
          : node,
      ),
    );
  };
  const runCanvasGeneration = async (direction?: string, queuedTasks?: GenerationNode[]) => {
    if (
      (!selectedGenerationNode && !queuedTasks?.length) ||
      generationBusy ||
      generationRequestRef.current
    )
      return;
    const task =
      queuedTasks?.[0] ??
      (direction === undefined
        ? selectedGenerationNode!
        : { ...selectedGenerationNode!, direction });
    const tasks = queuedTasks ?? [task];
    if (
      tasks.some((item) => !item.patternPlacement) &&
      (!selectedProvider || providerReadiness !== 'ready')
    ) {
      setGenerationStatus(t('generation.providerRequired'));
      return;
    }
    const inputs = tasks.map((item) => {
      const connectedEdges = edges.filter(
        (edge) => edge.targetNodeId === item.id && edge.type === 'generation_input',
      );
      return {
        node: item,
        edges: connectedEdges,
        sourceNodes: nodes.filter((node) =>
          connectedEdges.some((edge) => edge.sourceNodeId === node.id),
        ),
        sourceDesigns: designs,
        sourceCandidates: generationCandidates,
        provider: item.patternPlacement
          ? {
              id: 'local-raster',
              type: 'local-raster',
              name: 'Local compositor',
              rememberKey: false,
            }
          : selectedProvider!,
      };
    });
    const controller = new AbortController();
    generationRequestRef.current = { nodeId: task.id, controller };
    setGenerationBusy(true);
    setGenerationStatus(undefined);
    if (queuedTasks) {
      setQueueProgress(undefined);
      setQueueReport('');
    }
    try {
      // Materializing results requires the task to exist durably, even when the user
      // runs immediately after creating it or changing its mode. Failed saves never bill.
      if (!(await flushPendingSave())) {
        setGenerationStatus(t('feedback.unknownStorage'));
        if (queuedTasks) setQueueReport(t('feedback.unknownStorage'));
        return;
      }
      const record = await actionRunner.run({
        actionId: queuedTasks ? 'ai.canvasBatchGenerate' : 'ai.canvasGenerate',
        context: actionContext,
        input: queuedTasks ? { tasks: inputs } : inputs[0]!,
        runtime: {
          onProgress: (progress: CanvasBatchProgress) => {
            generationRequestRef.current = { nodeId: progress.nodeId, controller };
            setQueueProgress(progress);
          },
          router: capabilityRouter,
          signal: controller.signal,
          prepareMask: prepareEditMask,
          protectLocalEdit,
          protectCutout,
          composePattern,
          credentials,
          resolveImage: async (source: BaseNode) => {
            if (source.type === 'candidate' && 'candidateId' in source) {
              const blob = await canvasGenerationStorage.getCandidateBlob(
                source.candidateId as string,
              );
              return blob
                ? { mimeType: blob.type, data: new Uint8Array(await blob.arrayBuffer()) }
                : undefined;
            }
            const value = source as BaseNode & { assetId?: string; previewAssetId?: string };
            const assetId = value.assetId ?? value.previewAssetId;
            if (!assetId) return undefined;
            const blob = await threeViewerStorage.getAssetBlobById(assetId);
            return blob
              ? { mimeType: blob.type, data: new Uint8Array(await blob.arrayBuffer()) }
              : undefined;
          },
          saveGeneration: generationStorage.saveGeneration.bind(generationStorage),
          saveGenerationInputs: async (generation: Generation, images: ProviderImageInput[]) => {
            await canvasGenerationStorage.saveGenerationInputs(
              generation,
              images.map((image, index) => ({
                id: generation.inputSnapshots![index]!.id,
                projectId: generation.projectId,
                generationId: generation.id,
                blob: new Blob([new Uint8Array(image.data)], { type: image.mimeType }),
              })),
            );
          },
          stageCandidates: async (
            items: Array<{ metadata: GenerationCandidate; image: ProviderImageInput }>,
          ) => {
            const added = await canvasGenerationStorage.stage(
              items.map(({ metadata, image }) => {
                const bytes = new Uint8Array(image.data.byteLength);
                bytes.set(image.data);
                return { metadata, blob: new Blob([bytes], { type: image.mimeType }) };
              }),
            );
            replaceNodesAndResetHistory([...nodesRef.current, ...(added.nodes as CanvasNode[])]);
            setEdges((current) => [...current, ...added.edges]);
            setGenerationCandidates((current) =>
              orderGenerationCandidates([...current, ...items.map((item) => item.metadata)]),
            );
          },
        },
      });
      if (queuedTasks)
        setQueueReport(
          record.status === 'success'
            ? t('generation.queue.complete')
            : controller.signal.aborted
              ? t('generation.cancelled')
              : t('generation.queue.failed'),
        );
      setGenerationStatus(
        record.status === 'success'
          ? t('generation.candidates')
          : controller.signal.aborted
            ? t('generation.cancelled')
            : record.error?.message === LOCAL_EDIT_PROTECTION_ERROR
              ? t('generation.mask.protectionFailed')
              : (record.error?.message ?? t('generation.failed')),
      );
    } catch (error) {
      if (queuedTasks)
        setQueueReport(
          controller.signal.aborted ? t('generation.cancelled') : t('generation.queue.failed'),
        );
      setGenerationStatus(
        controller.signal.aborted
          ? t('generation.cancelled')
          : error instanceof Error
            ? error.message
            : t('generation.failed'),
      );
    } finally {
      generationRequestRef.current = undefined;
      setGenerationBusy(false);
    }
  };
  const keepCanvasCandidate = async (candidateId: string, destination: 'design' | 'reference') => {
    setBusyCandidateId(candidateId);
    try {
      const sourceDesignId = generationCandidates.find(
        (item) => item.id === candidateId,
      )?.sourceDesignId;
      const sourceName = designs.find((item) => item.id === sourceDesignId)?.name;
      const record = await actionRunner.run({
        actionId: 'ai.keepCanvasCandidate',
        context: actionContext,
        input: {
          candidateId,
          destination,
          name:
            destination === 'reference'
              ? t('generation.generatedReferenceName')
              : sourceName
                ? t('generation.generatedVariantName', { name: sourceName })
                : t('generation.generatedConceptName'),
        },
        runtime: {
          getCandidate: canvasGenerationStorage.getCandidate.bind(canvasGenerationStorage),
          getResultNode: canvasGenerationStorage.getResultNode.bind(canvasGenerationStorage),
          getResultEdge: canvasGenerationStorage.getResultEdge.bind(canvasGenerationStorage),
          getCandidateSize: async (id: string) =>
            (await canvasGenerationStorage.getCandidateBlob(id))?.size ?? 0,
          getGeneration: canvasGenerationStorage.getGeneration.bind(canvasGenerationStorage),
          getGenerationNode: async (id: string) =>
            (await repository.getNode(id)) as GenerationNode | undefined,
          getDesign: repository.getDesign.bind(repository),
          accept: canvasGenerationStorage.accept.bind(canvasGenerationStorage),
        },
      });
      if (record.status !== 'success') {
        setGenerationStatus(record.error?.message ?? t('common.error'));
        return;
      }
      const result = record.result as unknown as {
        nodeId: string;
        designId?: string;
        outputEdge: Edge;
      };
      setEdges((current) => [
        ...current.filter((edge) => edge.id !== result.outputEdge.id),
        result.outputEdge,
      ]);
      const storedNode = await repository.getNode(result.nodeId);
      if (storedNode) {
        const nextNode = storedNode as CanvasNode;
        replaceNodesAndResetHistory([
          ...nodesRef.current.filter((node) => node.id !== nextNode.id),
          nextNode,
        ]);
        selectCanvasNode(nextNode.id, false);
        const value = storedNode as BaseNode & { assetId?: string; previewAssetId?: string };
        const assetId = value.assetId ?? value.previewAssetId;
        if (assetId) {
          const blob = await threeViewerStorage.getAssetBlobById(assetId);
          if (blob) registerPreviewUrl(assetId, blob);
        }
      }
      if (result.designId) {
        const design = await repository.getDesign(result.designId);
        if (design) setDesigns((current) => [...current, design]);
        setRelations(await repository.listDesignRelations(project.id));
      }
      setGenerationCandidates((current) => current.filter((item) => item.id !== candidateId));
      setGenerationStatus(undefined);
    } finally {
      setBusyCandidateId(undefined);
    }
  };
  const discardCanvasCandidate = async (candidateId: string) => {
    if (busyCandidateId) return;
    setBusyCandidateId(candidateId);
    setGenerationStatus(undefined);
    try {
      await canvasGenerationStorage.discard(candidateId);
      const removed = nodesRef.current.filter(
        (node) => node.type === 'candidate' && node.candidateId === candidateId,
      );
      replaceNodesAndResetHistory(
        nodesRef.current.filter((node) => !removed.some((item) => item.id === node.id)),
      );
      setEdges((current) =>
        current.filter(
          (edge) =>
            !removed.some((node) => edge.targetNodeId === node.id || edge.sourceNodeId === node.id),
        ),
      );
      setGenerationCandidates((current) => current.filter((item) => item.id !== candidateId));
    } catch (error) {
      setGenerationStatus(
        error instanceof Error && error.message.includes('Disconnect downstream')
          ? t('generation.discardReferenced')
          : t('common.error'),
      );
    } finally {
      setBusyCandidateId(undefined);
    }
  };
  const saveGraphViewState = (state: GraphViewState) => {
    const nextState = { ...state, projectId: project.id };
    setGraphViewState(nextState);
    void repository.saveGraphViewState(nextState);
  };
  const applyImportedProject = (archive: ProjectArchiveData) => {
    const activeBoard = archive.boards.find((value) => value.id === archive.project.activeBoardId);
    if (!activeBoard) throw new Error('Imported project does not contain its active board.');
    setProject(archive.project);
    setBoard(activeBoard);
    setCanvasViewport(activeBoard.viewport);
    setBoards(archive.boards);
    setNodes(archive.nodes.filter((node) => node.boardId === activeBoard.id) as CanvasNode[]);
    setEdges(archive.edges.filter((edge) => edge.boardId === activeBoard.id));
    setGenerationCandidates(
      orderGenerationCandidates(
        archive.candidates.filter((candidate) => candidate.boardId === activeBoard.id),
      ),
    );
    setHistory([archive.nodes.filter((node) => node.boardId === activeBoard.id) as CanvasNode[]]);
    setHistoryIndex(0);
    setDesigns(archive.designs);
    setRelations(archive.relations);
    setGraphViewState(archive.graphViewState);
    setModelAssets(archive.assets.filter((asset) => asset.type === 'model3d'));
    setViewSets(archive.viewSets);
    setCMFSets(archive.cmfSets);
    setCMFVariants(archive.cmfVariants);
    setActiveModelAssetId(undefined);
    setActiveModelUrl(undefined);
    setViewerStatus(undefined);
    setSelectedDesignId(undefined);
    clearSelection();
    setActiveProjectId(archive.project.id);
    window.localStorage.setItem(activeProjectStorageKey, archive.project.id);
    setWorkspaceMode('canvas');
    setAppView('workspace');
  };
  const exportProject = async () => {
    setArchiveBusy(true);
    setArchiveStatus(undefined);
    setArchiveFailed(false);
    setProjectDownload(undefined);
    try {
      const now = Date.now();
      await repository.saveSnapshot({
        project: { ...project, updatedAt: now },
        board: {
          ...board,
          updatedAt: now,
          nodeIds: nodes.map((node) => node.id),
          viewport: canvasViewport,
        },
        nodes,
        edges,
      });
      setSaveStatus('saved');
      const { snapshot, assetBlobs, candidateBlobs, generationInputBlobs } =
        await archiveStorage.readProjectArchive(project.id);
      const archive = await createOidProjectArchive({
        ...snapshot,
        assetBlobs,
        candidateBlobs,
        generationInputBlobs,
      });
      setProjectDownload(downloadOidProject(archive, snapshot.project.name));
      setArchiveStatus(t('feedback.exported'));
    } catch (error) {
      setArchiveFailed(true);
      setArchiveStatus(t('feedback.exportFailed', { error: archiveErrorMessage(error, locale) }));
    } finally {
      setArchiveBusy(false);
    }
  };
  const importProject = async (file: File) => {
    setArchiveBusy(true);
    setArchiveStatus(undefined);
    setArchiveFailed(false);
    setProjectDownload(undefined);
    try {
      const archive = await importOidProjectArchive(file);
      await archiveStorage.restoreProjectArchive(archive);
      applyImportedProject(archive);
      setArchiveStatus(t('feedback.imported'));
    } catch (error) {
      setArchiveFailed(true);
      setArchiveStatus(t('feedback.importFailed', { error: archiveErrorMessage(error, locale) }));
    } finally {
      setArchiveBusy(false);
    }
  };
  const refreshProviderConfigs = async () => {
    const configs = await providerConfigsRepository.list();
    setProviderConfigs(configs);
    setSelectedProviderId((selected) => selected ?? configs[0]?.id);
    return configs;
  };
  const persistProviderDraft = async (draft: ProviderSettingsDraft) => {
    const config: ProviderConfig = {
      id: draft.id ?? crypto.randomUUID(),
      type: OPENAI_COMPATIBLE_PROVIDER_TYPE,
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim() || OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
      model: draft.model.trim() || OPENAI_COMPATIBLE_DEFAULT_MODEL,
      rememberKey: draft.rememberKey,
      supportsMask: draft.supportsMask ?? false,
      supportsTransparency: draft.supportsTransparency ?? false,
      enabled: true,
    };
    await providerConfigsRepository.save(config);
    if (draft.apiKey.trim()) {
      if (draft.rememberKey) {
        await rememberedCredentials.set(config.id, { apiKey: draft.apiKey.trim() });
        await sessionCredentials.clear(config.id);
      } else {
        await sessionCredentials.set(config.id, { apiKey: draft.apiKey.trim() });
        await rememberedCredentials.clear(config.id);
      }
    }
    await refreshProviderConfigs();
    setSelectedProviderId(config.id);
    return config;
  };
  const saveProvider = async (draft: ProviderSettingsDraft) => {
    setProviderBusy(true);
    setProviderStatus(undefined);
    try {
      await persistProviderDraft(draft);
      setProviderStatus(t('feedback.providerSaved'));
    } catch (error) {
      setProviderStatus(
        t('feedback.providerSaveFailed', {
          error: error instanceof Error ? error.message : t('feedback.unknown'),
        }),
      );
    } finally {
      setProviderBusy(false);
    }
  };
  const testProvider = async (draft: ProviderSettingsDraft) => {
    setProviderBusy(true);
    setProviderStatus(t('feedback.connecting'));
    try {
      const config = await persistProviderDraft(draft);
      const record = await actionRunner.run({
        actionId: 'ai.testConnection',
        context: actionContext,
        input: { provider: config },
        runtime: { router: capabilityRouter, credentials },
      });
      setProviderStatus(
        record.status === 'success'
          ? t('feedback.connectionVerified')
          : (record.error?.message ?? t('feedback.connectionFailed', { error: '' })),
      );
    } catch (error) {
      setProviderStatus(
        t('feedback.connectionFailed', {
          error: error instanceof Error ? error.message : t('feedback.unknown'),
        }),
      );
    } finally {
      setProviderBusy(false);
    }
  };
  const deleteProvider = async (config: ProviderConfig) => {
    if (!window.confirm(t('feedback.deleteProviderConfirm', { name: config.name }))) return;
    setProviderBusy(true);
    try {
      await Promise.all([
        providerConfigsRepository.delete(config.id),
        sessionCredentials.clear(config.id),
        rememberedCredentials.clear(config.id),
      ]);
      const configs = await refreshProviderConfigs();
      setSelectedProviderId(configs[0]?.id);
      setProviderStatus(t('feedback.providerDeleted'));
    } finally {
      setProviderBusy(false);
    }
  };
  const runAnalyzeDesign = async () => {
    if (!selectedDesign || !selectedProvider) {
      setAiStatus(t('feedback.designProviderRequired'));
      return;
    }
    setAiBusy(true);
    setAiOperation('analyzing');
    setAiStatus(undefined);
    try {
      const record = await actionRunner.run({
        actionId: 'ai.analyzeDesign',
        context: actionContext,
        input: { provider: selectedProvider, design: selectedDesign, notes: aiPrompt },
        runtime: {
          router: capabilityRouter,
          credentials,
          saveGeneration: generationStorage.saveGeneration.bind(generationStorage),
        },
      });
      if (record.status === 'success') {
        const result = record.result as { analysis: string };
        setLatestAnalysis(result.analysis);
        setAiStatus(t('feedback.analysisCompleted'));
      } else setAiStatus(record.error?.message ?? t('feedback.analysisFailed'));
    } finally {
      setAiBusy(false);
      setAiOperation(undefined);
    }
  };
  const runGenerateVariant = async () => {
    if (!selectedDesign || !selectedProvider) {
      setAiStatus(t('feedback.designProviderRequired'));
      return;
    }
    setAiBusy(true);
    setAiOperation('generating');
    setAiStatus(undefined);
    try {
      const record = await actionRunner.run({
        actionId: 'ai.generateVariant',
        context: actionContext,
        input: {
          provider: selectedProvider,
          sourceDesign: selectedDesign,
          prompt: aiPrompt,
          count: 3,
        },
        runtime: {
          router: capabilityRouter,
          credentials,
          candidateTray,
          saveGeneration: generationStorage.saveGeneration.bind(generationStorage),
        },
      });
      setAiStatus(
        record.status === 'success'
          ? t('feedback.candidateGenerated')
          : (record.error?.message ?? t('feedback.variantFailed')),
      );
    } finally {
      setAiBusy(false);
      setAiOperation(undefined);
    }
  };
  const keepCandidate = async (candidateId: string) => {
    setBusyCandidateId(candidateId);
    setAiStatus(undefined);
    try {
      const record = await actionRunner.run({
        actionId: 'ai.keepCandidate',
        context: actionContext,
        input: { candidateId },
        runtime: {
          candidateTray,
          acceptCandidate: async ({
            asset,
            image,
            created,
            generation,
          }: {
            asset: Asset;
            image: ProviderImageInput;
            created: { design: Design; node: BaseNode; relation: DesignRelation };
            generation: Generation;
          }) => {
            const bytes = new Uint8Array(image.data.byteLength);
            bytes.set(image.data);
            const canvasNode: CanvasNode = {
              ...created.node,
              type: 'variant',
              label: `Variant — ${created.design.name}`,
            };
            await generationStorage.saveAcceptedVariant({
              asset,
              blob: new Blob([bytes], { type: image.mimeType }),
              design: created.design,
              node: canvasNode,
              relation: created.relation,
              generation,
            });
            setDesigns((current) => [...current, created.design]);
            setRelations((current) => [...current, created.relation]);
            commit([...nodes, canvasNode]);
          },
        },
      });
      setAiStatus(
        record.status === 'success'
          ? t('feedback.variantCreated')
          : (record.error?.message ?? t('feedback.candidateKeepFailed')),
      );
    } finally {
      setBusyCandidateId(undefined);
    }
  };
  const openModelAsset = useCallback(async (asset: Asset) => {
    setViewerStatus(undefined);
    try {
      const blob = await threeViewerStorage.getAssetBlob(asset);
      if (!blob) throw new Error(t('feedback.modelMissing'));
      const nextUrl = URL.createObjectURL(blob);
      if (activeModelUrlRef.current) URL.revokeObjectURL(activeModelUrlRef.current);
      activeModelUrlRef.current = nextUrl;
      setActiveModelUrl(nextUrl);
      setActiveModelAssetId(asset.id);
      setWorkspaceMode('viewer');
    } catch (error) {
      setViewerStatus(
        t('feedback.modelOpenFailed', {
          error: error instanceof Error ? error.message : t('feedback.unknown'),
        }),
      );
    }
  }, []);
  const openSelectedModel = () => {
    const selectedModelNode = nodes.find(
      (node): node is CanvasNode & Model3DNode =>
        node.type === 'model3d' && 'assetId' in node && selectedIds.includes(node.id),
    );
    const asset = selectedModelNode
      ? modelAssets.find((candidate) => candidate.id === selectedModelNode.assetId)
      : undefined;
    if (!asset) {
      setWorkspaceMode('viewer');
      setViewerStatus(t('threeD.empty'));
      return;
    }
    void openModelAsset(asset);
  };
  const importModel = async (file: File) => {
    setViewerStatus(undefined);
    try {
      const validation = validateModelFile(file);
      const timestamp = Date.now();
      const assetId = crypto.randomUUID();
      const asset: Asset = {
        id: assetId,
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: project.id,
        type: 'model3d',
        name: file.name,
        mimeType: validation.mimeType,
        size: file.size,
        storage: { type: 'indexeddb', blobId: assetId },
        metadata: createModelMetadata(validation.format, file.name),
      };
      const modelNode = createModel3DNode({
        boardId: board.id,
        assetId,
        ...findFreeNodePosition(nodes, { x: 160, y: 180, width: 320, height: 220 }),
        width: 320,
        height: 220,
        rotation: 0,
        zIndex: nodes.length + 1,
      });
      const canvasModelNode = {
        ...modelNode,
        label: `3D — ${file.name}`,
      } as CanvasNode & Model3DNode;
      await threeViewerStorage.saveImportedModel({
        asset,
        blob: file,
        node: canvasModelNode,
      });
      setModelAssets((current) => [...current, asset]);
      commit([...nodes, canvasModelNode]);
      await openModelAsset(asset);
    } catch (error) {
      setViewerStatus(
        t('feedback.modelImportFailed', {
          error: error instanceof Error ? error.message : t('feedback.unknown'),
        }),
      );
    }
  };
  const persistViewerCamera = useCallback(
    (camera: CameraState) => {
      if (!activeModelNode) return;
      if (sameCameraState(activeModelNode.camera, camera)) return;
      const updatedNode = { ...activeModelNode, camera };
      setNodes((current) =>
        current.map((node) => (node.id === updatedNode.id ? updatedNode : node)),
      );
      void threeViewerStorage.saveViewerState(updatedNode).catch((error: unknown) => {
        setViewerStatus(
          t('feedback.viewerSaveFailed', {
            error: error instanceof Error ? error.message : t('feedback.unknown'),
          }),
        );
      });
    },
    [activeModelNode],
  );
  const captureViewer = useCallback(
    async (blob: Blob, camera: CameraState) => {
      if (!activeModelAsset || !activeModelNode) return;
      const timestamp = Date.now();
      const captureId = crypto.randomUUID();
      const asset: Asset = {
        id: captureId,
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: project.id,
        type: 'image',
        name: `${activeModelAsset.name} preview.png`,
        mimeType: 'image/png',
        size: blob.size,
        storage: { type: 'indexeddb', blobId: captureId },
        metadata: {
          sourceModelAssetId: activeModelAsset.id,
          viewPreset: camera.preset ?? 'custom',
        },
      };
      const updatedNode = { ...activeModelNode, camera, previewAssetId: captureId };
      try {
        await threeViewerStorage.saveCapture({ asset, blob, node: updatedNode });
        setNodes((current) =>
          current.map((node) => (node.id === updatedNode.id ? updatedNode : node)),
        );
        registerPreviewUrl(captureId, blob);
        setViewerStatus(t('feedback.captureSaved'));
      } catch (error) {
        setViewerStatus(
          t('feedback.captureFailed', {
            error: error instanceof Error ? error.message : t('feedback.unknown'),
          }),
        );
      }
    },
    [activeModelAsset, activeModelNode, project.id, registerPreviewUrl],
  );
  const handleViewerError = useCallback((message: string) => setViewerStatus(message), []);
  const namingDialog = namingIntent ? (
    <div className="naming-dialog__backdrop" role="presentation">
      <form
        aria-label={
          namingIntent.kind.includes('project')
            ? t('dialog.projectName')
            : namingIntent.kind.includes('concept')
              ? t('dialog.conceptName')
              : t('dialog.boardName')
        }
        className="naming-dialog"
        role="dialog"
        aria-modal="true"
        onSubmit={(event) => {
          event.preventDefault();
          void submitNamingIntent();
        }}
      >
        <h2>
          {namingIntent.kind.startsWith('new')
            ? t('dialog.nameNew', {
                item: namingIntent.kind.includes('project')
                  ? t('dialog.project')
                  : namingIntent.kind.includes('concept')
                    ? t('dialog.concept')
                    : t('dialog.board'),
              })
            : t('dialog.rename', {
                item: namingIntent.kind.includes('project')
                  ? t('dialog.project')
                  : namingIntent.kind.includes('concept')
                    ? t('dialog.concept')
                    : t('dialog.board'),
              })}
        </h2>
        <p>
          {namingIntent.kind.includes('project')
            ? t('dialog.projectDescription')
            : namingIntent.kind.includes('concept')
              ? t('dialog.conceptDescription')
              : t('dialog.boardDescription')}
        </p>
        <label>
          {t('provider.name')}
          <input
            autoFocus
            disabled={namingBusy}
            maxLength={namingIntent.kind === 'new-concept' ? 200 : undefined}
            onChange={(event) => setNamingIntent({ ...namingIntent, value: event.target.value })}
            value={namingIntent.value}
          />
        </label>
        {namingFailed ? <p role="alert">{t('dialog.saveFailed')}</p> : null}
        <div>
          <button
            disabled={namingBusy}
            onClick={() => {
              setNamingIntent(undefined);
              setNamingFailed(false);
            }}
            type="button"
          >
            {t('common.cancel')}
          </button>
          <button
            className="button--primary"
            type="submit"
            disabled={namingBusy || !namingIntent.value.trim()}
          >
            {namingIntent.kind.startsWith('new') ? t('common.create') : t('dialog.saveName')}
          </button>
        </div>
      </form>
    </div>
  ) : null;
  return appView === 'home' ? (
    <>
      <ProjectHome
        onAbout={() => setAboutOpen(true)}
        importBusy={archiveBusy}
        onImportProject={() => importInputRef.current?.click()}
        demoOpening={demoOpening}
        coverUrls={projectCoverUrls}
        loading={homeLoading}
        onCreateProject={() => setNamingIntent({ kind: 'new-project', value: t('dialog.project') })}
        onDeleteProject={(target) => void deleteProject(target)}
        onOpenDemo={() => void openDemoProject()}
        onOpenProject={openProject}
        onRenameProject={(target) =>
          setNamingIntent({ kind: 'rename-project', target, value: target.name })
        }
        projects={recentProjects}
      />
      <input
        accept=".oidproj,application/zip"
        aria-label={t('workspace.import')}
        className="archive-file-input"
        disabled={archiveBusy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void importProject(file);
        }}
        ref={importInputRef}
        type="file"
      />
      {archiveStatus ? (
        <p className={`archive-status${archiveFailed ? ' is-error' : ''}`} role="status">
          {archiveStatus}
        </p>
      ) : null}
      {storageError ? (
        <p className="storage-error" role="status">
          {storageError}
        </p>
      ) : null}
      {namingDialog}
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </>
  ) : (
    <>
      <main
        className="app-shell"
        aria-label={appMetadata.displayName}
        inert={canvasMutationBusy}
        aria-busy={canvasMutationBusy}
      >
        <header className="top-bar">
          <button
            type="button"
            className="workspace-brand"
            onClick={() => void goHome()}
            aria-label={t('workspace.home')}
            title={t('workspace.home')}
          >
            <BrandLogo className="brand-logo brand-logo--workspace" variant="icon" />
          </button>
          <div className="project-title">
            <strong>{translateDemoLabel(locale, project.name)}</strong>
            <span aria-hidden="true" className="project-title__separator">
              /
            </span>
            <span className="project-title__board">{translateDemoLabel(locale, board.name)}</span>
            <span
              className={
                saveStatus === 'failed' ? 'save-indicator save-indicator--failed' : 'save-indicator'
              }
            >
              <i aria-hidden="true" />
              {saveLabel}
            </span>
          </div>
          <div className="workspace-actions">
            <button
              className={
                workspaceMode === 'canvas' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'
              }
              onClick={() => setWorkspaceMode('canvas')}
              type="button"
            >
              {t('workspace.canvas')}
            </button>
            <button
              className={
                workspaceMode === 'graph' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'
              }
              onClick={() => setWorkspaceMode('graph')}
              type="button"
            >
              {t('workspace.graph')}
            </button>
            <button
              className={
                workspaceMode === 'viewer' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'
              }
              onClick={openSelectedModel}
              type="button"
            >
              3D
            </button>
            <button
              onClick={() => {
                setSketchDraft(undefined);
                setEditingSketch(true);
              }}
              type="button"
            >
              {t('workspace.sketch')}
            </button>
            <button onClick={() => setAiWorkbenchOpen((open) => !open)} type="button">
              {t('workspace.ai')}
            </button>
            <LanguageSelector compact />
            <details className="workspace-menu">
              <summary>{t('workspace.project')}</summary>
              <div>
                <nav aria-label={t('workspace.boards')} className="workspace-menu__navigation">
                  <button onClick={() => void goHome()} type="button">
                    {t('workspace.home')}
                  </button>
                  {boards.map((item) => (
                    <button
                      aria-current={item.id === board.id ? 'page' : undefined}
                      key={item.id}
                      onClick={() => void selectBoard(item)}
                      type="button"
                    >
                      {translateDemoLabel(locale, item.name)}
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      setNamingIntent({
                        kind: 'new-board',
                        value: `${t('dialog.board')} ${boards.length + 1}`,
                      })
                    }
                    type="button"
                  >
                    {t('workspace.newBoard')}
                  </button>
                </nav>
                <button disabled={archiveBusy} onClick={() => void exportProject()} type="button">
                  {t('workspace.export')}
                </button>
                <button
                  disabled={archiveBusy}
                  onClick={() => importInputRef.current?.click()}
                  type="button"
                >
                  {t('workspace.import')}
                </button>
                <button onClick={() => setProviderSettingsOpen(true)} type="button">
                  {t('workspace.providerSettings')}
                </button>
                <button onClick={() => setAboutOpen(true)} type="button">
                  {locale === 'zh-CN' ? '关于与更新' : 'About & updates'}
                </button>
                <button onClick={() => setCommandPaletteOpen(true)} type="button">
                  {t('workspace.commands')}
                </button>
              </div>
            </details>
          </div>
        </header>
        {storageError || (saveStatus === 'failed' && saveError) ? (
          <div className="storage-error" role="status">
            <span>{storageError ?? t('save.failedPreserved', { error: saveError ?? '' })}</span>
            {saveStatus === 'failed' ? (
              <button
                type="button"
                disabled={generationBusy}
                onClick={() => void flushPendingSave()}
              >
                {t('save.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
        {workspaceMode === 'viewer' ? (
          <section aria-label={t('threeD.workspace')} className="viewer-workspace">
            <div className="viewer-workspace__toolbar">
              <button onClick={() => modelImportInputRef.current?.click()} type="button">
                {t('threeD.import')}
              </button>
              <label>
                {t('threeD.model')}
                <select
                  onChange={(event) => {
                    const asset = modelAssets.find(
                      (candidate) => candidate.id === event.target.value,
                    );
                    if (asset) void openModelAsset(asset);
                  }}
                  value={activeModelAssetId ?? ''}
                >
                  <option value="">{t('threeD.chooseModel')}</option>
                  {modelAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => setWorkspaceMode('canvas')} type="button">
                {t('threeD.return')}
              </button>
            </div>
            {activeModelAsset && activeModelNode && activeModelUrl ? (
              <Suspense
                fallback={
                  <p className="viewer-workspace__loading">{t('workspace.loadingViewer')}</p>
                }
              >
                <ModelViewerWorkspace
                  decoderPath={dracoDecoderPath}
                  asset={activeModelAsset}
                  initialCamera={activeModelNode.camera}
                  key={activeModelAsset.id}
                  modelUrl={activeModelUrl}
                  onCameraChange={persistViewerCamera}
                  onCapture={(blob, camera) => void captureViewer(blob, camera)}
                  onError={handleViewerError}
                  locale={locale}
                />
              </Suspense>
            ) : (
              <div className="viewer-workspace__empty">
                <h1>{t('threeD.title')}</h1>
                <p>{t('threeD.empty')}</p>
              </div>
            )}
            {viewerStatus ? (
              <p className="viewer-workspace__status" role="status">
                {viewerStatus}
              </p>
            ) : null}
          </section>
        ) : (
          <div
            className={`workspace${canvasFocused && workspaceMode === 'canvas' ? ' workspace--focused' : ''}`}
          >
            <WorkspaceSidebar
              boards={boards}
              onCreateBoard={() =>
                setNamingIntent({
                  kind: 'new-board',
                  value: `${t('dialog.board')} ${boards.length + 1}`,
                })
              }
              onDeleteBoard={(target) => void deleteBoard(target)}
              onGoHome={() => void goHome()}
              onRenameBoard={(target) =>
                setNamingIntent({ kind: 'rename-board', target, value: target.name })
              }
              onSelectBoard={(target) => void selectBoard(target)}
              project={project}
            />
            <div className="workspace-surface">
              <div className="workspace-surface__toolbar">
                <div className="workspace-surface__heading">
                  {workspaceMode === 'canvas' ? (
                    <button
                      type="button"
                      aria-pressed={canvasFocused}
                      onClick={() => setCanvasFocused((value) => !value)}
                    >
                      {t(canvasFocused ? 'workspace.exitFocus' : 'workspace.focusCanvas')}
                    </button>
                  ) : null}
                  <span>
                    {workspaceMode === 'canvas' ? t('workspace.canvas') : t('workspace.graph')}
                  </span>
                  <strong>{translateDemoLabel(locale, board.name)}</strong>
                </div>
                {workspaceMode === 'canvas' ? (
                  <div
                    className={`workspace-toolbar-actions${canvasToolsExpanded ? ' workspace-toolbar-actions--expanded' : ''}`}
                  >
                    <button
                      className="workspace-toolbar-import"
                      disabled={generationBusy || !hydrated}
                      onClick={() => {
                        imageImportKindRef.current = 'reference';
                        referenceImportInputRef.current?.click();
                      }}
                      type="button"
                    >
                      <UiIcon name="image" size={14} />
                      {t('workspace.importReference')}
                    </button>
                    <button
                      type="button"
                      className="workspace-toolbar-toggle"
                      aria-expanded={canvasToolsExpanded}
                      aria-controls="workspace-more-tools"
                      onClick={() => setCanvasToolsExpanded((value) => !value)}
                    >
                      <UiIcon name="more" size={14} />
                      {t(canvasToolsExpanded ? 'workspace.lessTools' : 'workspace.moreTools')}
                    </button>
                    <div
                      id="workspace-more-tools"
                      className="workspace-more-tools"
                      hidden={!canvasToolsExpanded}
                    >
                      <button
                        type="button"
                        disabled={generationBusy}
                        onClick={() => setMaterialsOpen(true)}
                      >
                        {t('materials.title')}
                      </button>
                      <button
                        type="button"
                        disabled={generationBusy}
                        onClick={() => setResearchOpen(true)}
                      >
                        {t('research.title')}
                      </button>
                      {researchOpen ? (
                        <ResearchLibraryDialog
                          providers={providerConfigs}
                          onAnalyze={analyzeMaterials}
                          loadAnalyses={() => generationStorage.listMaterialAnalyses(project.id)}
                          loadAnalysisBlob={loadAnalysisBlob}
                          onImport={importResearchImage}
                          load={loadResearch}
                          save={saveResearch}
                          loadBlob={loadMaterialBlob}
                          onPlace={placeMaterial}
                          onClose={() => setResearchOpen(false)}
                        />
                      ) : null}
                      {materialsOpen ? (
                        <MaterialLibrary
                          providers={providerConfigs}
                          onAnalyze={analyzeMaterials}
                          loadAnalyses={() => generationStorage.listMaterialAnalyses(project.id)}
                          loadAnalysisBlob={loadAnalysisBlob}
                          onSave={saveMaterialKnowledge}
                          projectId={project.id}
                          search={searchLocalMaterials}
                          load={loadMaterialBlob}
                          onPlace={placeMaterial}
                          onClose={() => setMaterialsOpen(false)}
                        />
                      ) : null}
                      <button
                        onClick={() =>
                          setNamingIntent({ kind: 'new-concept', value: t('workspace.newConcept') })
                        }
                        type="button"
                      >
                        <UiIcon name="plus" size={14} />
                        {t('workspace.newConcept')}
                      </button>
                      <button onClick={createGenerationCard} type="button">
                        <UiIcon name="plus" size={14} />
                        {t('workspace.newGeneration')}
                      </button>
                      <button
                        type="button"
                        disabled={generationBusy}
                        onClick={() => setBatchOpen(true)}
                      >
                        {t('generation.batch.title')}
                      </button>
                      {batchOpen ? (
                        <ExplorationBatch
                          sources={nodes
                            .filter((node) =>
                              [
                                'reference',
                                'image',
                                'sketch',
                                'concept',
                                'variant',
                                'candidate',
                              ].includes(node.type),
                            )
                            .map((node) => ({
                              id: node.id,
                              label: generationInputLabel(node, generationCandidates, locale),
                            }))}
                          selectedIds={selectedIds}
                          onPrepare={prepareExplorationBatch}
                          onClose={() => setBatchOpen(false)}
                        />
                      ) : null}
                      <button
                        type="button"
                        disabled={generationBusy}
                        onClick={() => {
                          setQueueProgress(undefined);
                          setQueueReport('');
                          setQueueOpen(true);
                        }}
                      >
                        {t('generation.queue.title')}
                      </button>
                      {queueOpen ? (
                        <ExplorationQueue
                          inputSummaries={queueInputSummaries(
                            nodes,
                            edges,
                            generationCandidates,
                            locale,
                          )}
                          tasks={nodes.filter(
                            (node): node is GenerationNode => node.type === 'generation',
                          )}
                          initialIds={queueInitialIds}
                          providers={providerConfigs}
                          providerId={selectedProviderId ?? ''}
                          ready={providerReadiness === 'ready'}
                          onProviderChange={setSelectedProviderId}
                          busy={generationBusy}
                          progress={queueProgress}
                          report={queueReport}
                          onRun={(tasks) => runCanvasGeneration(undefined, tasks)}
                          onCancel={() => generationRequestRef.current?.controller.abort()}
                          onClose={() => setQueueOpen(false)}
                        />
                      ) : null}
                    </div>
                    <button
                      aria-label={t('workspace.undo')}
                      className="workspace-surface__icon-button"
                      onClick={undo}
                      title={t('workspace.undo')}
                      type="button"
                    >
                      <UiIcon name="undo" size={14} />
                    </button>
                    <button
                      aria-label={t('workspace.redo')}
                      className="workspace-surface__icon-button"
                      onClick={redo}
                      title={t('workspace.redo')}
                      type="button"
                    >
                      <UiIcon name="redo" size={14} />
                    </button>
                  </div>
                ) : (
                  <span>{t('workspace.lineageDerived')}</span>
                )}
              </div>
              {workspaceMode === 'canvas' ? (
                <div
                  className="canvas-action-surface"
                  onContextMenu={(event) => {
                    if (!selectedIds.length) return;
                    event.preventDefault();
                    setContextMenuPosition({ x: event.clientX, y: event.clientY });
                  }}
                >
                  {selectedIds.length === 1 &&
                  explorationSource &&
                  ['reference', 'image', 'sketch', 'concept', 'variant', 'candidate'].includes(
                    explorationSource.type,
                  ) &&
                  Boolean(
                    ('assetId' in explorationSource && explorationSource.assetId) ||
                    ('previewAssetId' in explorationSource && explorationSource.previewAssetId) ||
                    ('candidateId' in explorationSource && explorationSource.candidateId),
                  ) ? (
                    <nav
                      className="canvas-quick-actions"
                      aria-label={t('generation.continueExploration')}
                    >
                      {['form', 'cmf', 'local', 'scene'].map((id) => {
                        const tool = findGenerationTool(id)!;
                        return (
                          <button
                            type="button"
                            key={id}
                            disabled={generationBusy || !hydrated}
                            onClick={() => {
                              setCanvasFocused(false);
                              void continueExploration(id);
                            }}
                          >
                            {t(tool.label)}
                          </button>
                        );
                      })}
                    </nav>
                  ) : null}
                  <nav className="canvas-floating-tools" aria-label={t('workspace.canvas')}>
                    {(
                      [
                        'workspace.select',
                        'workspace.hand',
                        'workspace.text',
                        'workspace.image',
                      ] as const
                    ).map((item, index) => (
                      <button
                        aria-label={t(item)}
                        aria-pressed={
                          index < 2
                            ? (index === 0 && canvasInteractionMode === 'select') ||
                              (index === 1 && canvasInteractionMode === 'pan')
                            : undefined
                        }
                        className={
                          (index === 0 && canvasInteractionMode === 'select') ||
                          (index === 1 && canvasInteractionMode === 'pan')
                            ? 'tool-button tool-button--active'
                            : 'tool-button'
                        }
                        disabled={generationBusy || !hydrated}
                        key={item}
                        onClick={
                          index === 0
                            ? () => setCanvasInteractionMode('select')
                            : index === 1
                              ? () => setCanvasInteractionMode('pan')
                              : index === 2
                                ? () =>
                                    void saveTextNote(undefined, t('text.default'), 20).catch(() =>
                                      setSaveError(t('text.failed')),
                                    )
                                : () => {
                                    imageImportKindRef.current = 'image';
                                    referenceImportInputRef.current?.click();
                                  }
                        }
                        title={index === 1 ? t('workspace.panShortcut') : t(item)}
                        type="button"
                      >
                        <UiIcon
                          name={
                            index === 0
                              ? 'select'
                              : index === 1
                                ? 'hand'
                                : index === 2
                                  ? 'text'
                                  : 'image'
                          }
                          size={17}
                        />
                      </button>
                    ))}
                    <span aria-hidden="true" className="canvas-floating-tools__divider" />
                    <button
                      type="button"
                      className="tool-button"
                      disabled={selectedIds.length < 2}
                      title={t('workspace.groupHint')}
                      onClick={() => runWorkspaceAction('workspace.groupSelection')}
                    >
                      {t('workspace.group')}
                    </button>
                    <button
                      type="button"
                      className="tool-button"
                      disabled={
                        !nodes.some(
                          (node) => node.type === 'group' && selectedIds.includes(node.id),
                        )
                      }
                      onClick={() => runWorkspaceAction('workspace.ungroupSelection')}
                    >
                      {t('workspace.ungroup')}
                    </button>
                    <button
                      aria-label={t('workspace.duplicate')}
                      className="tool-button"
                      disabled={!selectedIds.length}
                      onClick={() => runWorkspaceAction('workspace.duplicateSelection')}
                      title={t('workspace.duplicate')}
                      type="button"
                    >
                      <UiIcon name="copy" size={17} />
                    </button>
                    <button
                      aria-label={t('common.delete')}
                      className="tool-button tool-button--danger"
                      disabled={!selectedIds.length}
                      onClick={() => runWorkspaceAction('workspace.deleteSelection')}
                      title={t('common.delete')}
                      type="button"
                    >
                      <UiIcon name="trash" size={17} />
                    </button>
                  </nav>
                  <CanvasWorkspace
                    boardId={board.id}
                    onImportReference={
                      hydrated && !generationBusy
                        ? () => {
                            imageImportKindRef.current = 'reference';
                            referenceImportInputRef.current?.click();
                          }
                        : undefined
                    }
                    onCreateConcept={() =>
                      setNamingIntent({ kind: 'new-concept', value: t('workspace.newConcept') })
                    }
                    interactionMode={canvasInteractionMode}
                    designs={designs}
                    edges={edges}
                    generationCandidates={generationCandidates.map((item) => ({
                      id: item.id,
                      generationNodeId: item.generationNodeId,
                      previewUrl: candidatePreviewUrls[item.id],
                      view: item.view,
                    }))}
                    nodes={nodes}
                    onConnectInput={(source, target, role) =>
                      void connectGenerationInput(source, target, role)
                    }
                    onNodesChange={commit}
                    onDelete={() => runWorkspaceAction('workspace.deleteSelection')}
                    onDuplicate={() => runWorkspaceAction('workspace.duplicateSelection')}
                    onRedo={redo}
                    onUndo={undo}
                    previewUrls={previewUrls}
                    viewSets={viewSets}
                    cmfSets={cmfSets}
                    cmfVariants={cmfVariants}
                    generationRun={{
                      busy: generationBusy,
                      ready: Boolean(selectedProvider && providerReadiness === 'ready'),
                      providerName: selectedProvider?.name,
                      status: generationStatus,
                      onRun: (nodeId, direction) => {
                        if (selectedGenerationNode?.id !== nodeId) return;
                        if (
                          !selectedGenerationNode?.patternPlacement &&
                          (!selectedProvider || providerReadiness !== 'ready')
                        ) {
                          setProviderSettingsOpen(true);
                          return;
                        }
                        void runCanvasGeneration(direction);
                      },
                    }}
                    locale={locale}
                  />
                </div>
              ) : (
                <Suspense
                  fallback={<p className="workspace-loading">{t('workspace.loadingGraph')}</p>}
                >
                  <DesignGraphWorkspace
                    designs={designs}
                    graphViewState={graphViewState}
                    onGraphViewStateChange={saveGraphViewState}
                    onSelectDesign={openDesign}
                    projectId={project.id}
                    relations={relations}
                    selectedDesignId={selectedDesignId}
                  />
                </Suspense>
              )}
            </div>
            <WorkspaceInspector
              onEditSketch={() => void reopenSketch()}
              onSaveText={(id, text, fontSize) => saveTextNote(id, text, fontSize)}
              onRenameGroup={(id, label) =>
                commit(
                  nodes.map((node) =>
                    node.id === id && node.type === 'group'
                      ? { ...node, label, updatedAt: Date.now() }
                      : node,
                  ),
                )
              }
              exploration={
                workspaceMode === 'canvas' &&
                explorationSource &&
                ['reference', 'image', 'sketch', 'concept', 'variant', 'candidate'].includes(
                  explorationSource.type,
                ) &&
                Boolean(
                  ('assetId' in explorationSource && explorationSource.assetId) ||
                  ('previewAssetId' in explorationSource && explorationSource.previewAssetId) ||
                  ('candidateId' in explorationSource && explorationSource.candidateId),
                )
                  ? {
                      busy: generationBusy,
                      status: generationStatus,
                      onChoose: (id) => void continueExploration(id),
                    }
                  : undefined
              }
              activeModelAsset={selectedModelAsset}
              generation={
                workspaceMode === 'canvas' && selectedGenerationNode
                  ? {
                      node: selectedGenerationNode,
                      candidates: generationCandidates.filter(
                        (item) => item.generationNodeId === selectedGenerationNode.id,
                      ),
                      selectedCandidateId:
                        selectedCanvasCandidate?.generationNodeId === selectedGenerationNode.id
                          ? selectedCandidateId
                          : undefined,
                      previewUrls: candidatePreviewUrls,
                      inputCount: edges.filter(
                        (edge) =>
                          edge.type === 'generation_input' &&
                          edge.targetNodeId === selectedGenerationNode.id,
                      ).length,
                      inputs: edges
                        .filter(
                          (edge) =>
                            edge.type === 'generation_input' &&
                            edge.targetNodeId === selectedGenerationNode.id,
                        )
                        .map((edge) => {
                          const source = nodes.find((node) => node.id === edge.sourceNodeId);
                          return {
                            id: edge.id,
                            sourceNodeId: source?.id ?? '',
                            sourceAssetId:
                              source && 'assetId' in source && typeof source.assetId === 'string'
                                ? source.assetId
                                : source &&
                                    'previewAssetId' in source &&
                                    typeof source.previewAssetId === 'string'
                                  ? source.previewAssetId
                                  : source?.type === 'candidate'
                                    ? source.candidateId
                                    : '',
                            previewUrl:
                              source?.type === 'candidate'
                                ? candidatePreviewUrls[source.candidateId]
                                : source
                                  ? previewUrls[
                                      'previewAssetId' in source &&
                                      typeof source.previewAssetId === 'string'
                                        ? source.previewAssetId
                                        : 'assetId' in source && typeof source.assetId === 'string'
                                          ? source.assetId
                                          : ''
                                    ]
                                  : undefined,
                            label: generationInputLabel(source, generationCandidates, locale),
                            role:
                              edge.inputRole === 'base'
                                ? ('base' as const)
                                : ('reference' as const),
                          };
                        }),
                      signature: generationInputSignature(
                        selectedGenerationNode,
                        edges,
                        nodes,
                        designs,
                        generationCandidates,
                      ),
                      providers: providerConfigs,
                      selectedProviderId: selectedProviderId ?? '',
                      readiness: providerReadiness,
                      busy: generationBusy,
                      busyCandidateId,
                      status: generationStatus,
                      onUpdate: updateGenerationNode,
                      onProviderChange: setSelectedProviderId,
                      onRun: () => void runCanvasGeneration(),
                      onCancel:
                        generationRequestRef.current?.nodeId === selectedGenerationNode.id
                          ? () => generationRequestRef.current?.controller.abort()
                          : undefined,
                      onDisconnect: (id) => void disconnectGenerationInput(id),
                      onKeep: (id, destination) => void keepCanvasCandidate(id, destination),
                      onDiscard: (id) => void discardCanvasCandidate(id),
                      onProviderSettings: () => setProviderSettingsOpen(true),
                      onSelectGeneration: () => selectCanvasNode(selectedGenerationNode.id, false),
                    }
                  : undefined
              }
              node={workspaceMode === 'canvas' ? selectedNode : undefined}
              designs={designs}
              onSaveDna={saveDesignDna}
              onCreateVariant={createManualVariant}
              onCreateConcept={createManualConcept}
              onSaveDecision={saveDesignDecision}
              manualViews={{
                placedIds: nodes.flatMap((node) =>
                  node.type === 'viewset' && 'viewSetId' in node ? [node.viewSetId as string] : [],
                ),
                sets: viewSets,
                previewUrls,
                images: nodes.flatMap((node) => {
                  const assetId =
                    'previewAssetId' in node
                      ? node.previewAssetId
                      : 'assetId' in node
                        ? node.assetId
                        : undefined;
                  return typeof assetId === 'string' && previewUrls[assetId]
                    ? [
                        {
                          id: assetId,
                          name:
                            'label' in node && typeof node.label === 'string'
                              ? node.label
                              : assetId,
                        },
                      ]
                    : [];
                }),
                onSave: saveManualViews,
              }}
              manualCMF={{
                sets: cmfSets,
                variants: cmfVariants,
                onSave: saveManualCMF,
                placedIds: nodes.flatMap((node) =>
                  node.type === 'cmf' && 'cmfSetId' in node ? [node.cmfSetId as string] : [],
                ),
                images: nodes.flatMap((node) => {
                  const id =
                    'assetId' in node
                      ? node.assetId
                      : 'previewAssetId' in node
                        ? node.previewAssetId
                        : undefined;
                  return typeof id === 'string' && previewUrls[id]
                    ? [{ id, name: 'label' in node ? String(node.label) : id }]
                    : [];
                }),
              }}
              dnaBusy={generationBusy}
              onOpenAi={() => setAiWorkbenchOpen(true)}
              selectedDesign={
                workspaceMode === 'canvas'
                  ? designs.find(
                      (design) =>
                        selectedNode &&
                        'designId' in selectedNode &&
                        selectedNode.designId === design.id,
                    )
                  : selectedDesign
              }
              workspace={workspaceMode}
            />
          </div>
        )}
        <footer className="status-bar">
          <span className="status-bar__secondary">{t('workspace.localFirst')}</span>
          <span>
            {workspaceMode === 'graph'
              ? t('workspace.designCount', { count: designs.length })
              : t('workspace.nodeCount', { count: nodes.length })}
          </span>
          <span className="status-bar__secondary">
            {workspaceMode === 'graph'
              ? t('workspace.graphRuntime')
              : workspaceMode === 'viewer'
                ? t('workspace.viewerRuntime')
                : t('workspace.canvasRuntime')}
          </span>
          <span className="status-bar__save" title={saveError ?? t('workspace.flush')}>
            {saveLabel}
            <span className="status-bar__shortcut"> · {t('workspace.flush')}</span>
          </span>
        </footer>
        <input
          accept=".oidproj,application/zip"
          aria-label={t('workspace.import')}
          className="archive-file-input"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importProject(file);
          }}
          ref={importInputRef}
          type="file"
        />
        <input
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          aria-label={t('workspace.importReference')}
          className="archive-file-input"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importReference(file);
          }}
          ref={referenceImportInputRef}
          type="file"
        />
        <input
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          aria-label={t('threeD.import')}
          className="archive-file-input"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importModel(file);
          }}
          ref={modelImportInputRef}
          type="file"
        />
        {archiveStatus ? (
          <p className={`archive-status${archiveFailed ? ' is-error' : ''}`} role="status">
            {archiveStatus}
            {projectDownload ? (
              <a href={projectDownload.url} download={projectDownload.filename}>
                {' '}
                {t('feedback.downloadBackup')}
              </a>
            ) : null}
          </p>
        ) : null}
        {aiWorkbenchOpen ? (
          <section aria-label={t('ai.title')} className="ai-workbench">
            <header>
              <div>
                <h2>{t('ai.title')}</h2>
                <p>{t('ai.description')}</p>
              </div>
              <button
                aria-label={t('common.close')}
                className="ai-workbench__close"
                onClick={() => setAiWorkbenchOpen(false)}
                title={t('common.close')}
                type="button"
              >
                <UiIcon name="close" size={16} />
              </button>
            </header>
            <div className="ai-workbench__body">
              <section className="ai-workbench__section ai-workbench__context">
                <h3>{t('ai.sourceDesign')}</h3>
                <p
                  className={
                    selectedDesign
                      ? 'ai-workbench__selection is-selected'
                      : 'ai-workbench__selection'
                  }
                >
                  {selectedDesign
                    ? t('ai.selectedDesign', {
                        name: translateDemoLabel(locale, selectedDesign.name),
                      })
                    : t('ai.selectDesign')}
                </p>
              </section>
              <section className="ai-workbench__section">
                <div className="ai-workbench__section-heading">
                  <h3>{t('ai.provider')}</h3>
                  <button
                    className="ai-workbench__settings-link"
                    onClick={() => setProviderSettingsOpen(true)}
                    type="button"
                  >
                    {t('ai.manageProvider')}
                  </button>
                </div>
                <select
                  aria-label={t('ai.provider')}
                  onChange={(event) => setSelectedProviderId(event.target.value || undefined)}
                  value={selectedProviderId ?? ''}
                >
                  <option value="">{t('ai.chooseProvider')}</option>
                  {providerConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name} · {config.model}
                    </option>
                  ))}
                </select>
                {!providerConfigs.length ? (
                  <p className="ai-workbench__notice">{t('ai.notConfigured')}</p>
                ) : null}
                {providerReadiness === 'checking' ? (
                  <p className="ai-workbench__notice">{t('ai.checking')}</p>
                ) : null}
                {providerReadiness === 'missing-key' ? (
                  <p className="ai-workbench__notice">{t('ai.missingKey')}</p>
                ) : null}
              </section>
              <section className="ai-workbench__section">
                <label className="ai-workbench__prompt">
                  <span>{t('ai.prompt')}</span>
                  <textarea
                    onChange={(event) => setAiPrompt(event.target.value)}
                    value={aiPrompt}
                  />
                </label>
                <div className="ai-workbench__actions">
                  <button
                    disabled={
                      aiBusy ||
                      !selectedProvider ||
                      !selectedDesign ||
                      providerReadiness !== 'ready'
                    }
                    onClick={() => void runAnalyzeDesign()}
                    type="button"
                  >
                    {aiOperation === 'analyzing' ? t('ai.analyzing') : t('ai.analyze')}
                  </button>
                  <button
                    className="button--primary"
                    disabled={
                      aiBusy ||
                      !selectedProvider ||
                      !selectedDesign ||
                      providerReadiness !== 'ready'
                    }
                    onClick={() => void runGenerateVariant()}
                    type="button"
                  >
                    {aiOperation === 'generating' ? t('ai.generating') : t('ai.generate')}
                  </button>
                </div>
                <p className="ai-workbench__capability">{t('ai.renderUnavailable')}</p>
              </section>
              {aiStatus ? (
                <p className="ai-workbench__status" role="status">
                  {aiStatus}
                </p>
              ) : null}
              {latestAnalysis ? (
                <section className="ai-workbench__analysis">
                  <h3>{t('ai.latestAnalysis')}</h3>
                  <p>{latestAnalysis}</p>
                </section>
              ) : null}
              <CandidateTrayPanel
                busyCandidateId={busyCandidateId}
                loading={aiOperation === 'generating'}
                onDiscard={(candidateId) => candidateTray.discard(candidateId)}
                onKeep={(candidateId) => void keepCandidate(candidateId)}
                tray={candidateTray}
              />
            </div>
          </section>
        ) : null}
        <ProviderSettings
          hasCredentials={hasProviderCredentials}
          busy={providerBusy}
          configs={providerConfigs}
          onClose={() => setProviderSettingsOpen(false)}
          onDelete={deleteProvider}
          onSave={saveProvider}
          onTest={testProvider}
          open={providerSettingsOpen}
          status={providerStatus}
        />
        {contextMenuPosition && workspaceMode === 'canvas' ? (
          <ActionContextMenu
            context={actionContext}
            onClose={() => setContextMenuPosition(undefined)}
            position={contextMenuPosition}
            registry={actionRegistry}
            runner={actionRunner}
            runtime={workspaceActionRuntime}
          />
        ) : null}
        <ActionCommandPalette
          context={actionContext}
          onClose={() => setCommandPaletteOpen(false)}
          open={commandPaletteOpen}
          registry={actionRegistry}
          runner={actionRunner}
          runtime={workspaceActionRuntime}
        />
        {editingSketch ? (
          <div className="sketch-overlay">
            <Suspense
              fallback={<p className="workspace-loading">{t('workspace.loadingSketch')}</p>}
            >
              <SketchWorkspace
                initialSource={sketchDraft?.source}
                onCancel={() => setEditingSketch(false)}
                onSave={async ({ preview, source }) => {
                  setGenerationBusy(true);
                  try {
                    if (!(await flushPendingSave())) throw new Error('Pending save failed.');
                    const sourceAssetId = crypto.randomUUID();
                    const previewAssetId = crypto.randomUUID();
                    const sketchDocumentId = sketchDraft?.document.id ?? crypto.randomUUID();
                    const timestamp = Date.now();
                    const sketchNode = sketchDraft
                      ? {
                          ...sketchDraft.node,
                          previewAssetId,
                          updatedAt: timestamp,
                        }
                      : ({
                          id: crypto.randomUUID(),
                          createdAt: timestamp,
                          updatedAt: timestamp,
                          boardId: board.id,
                          type: 'sketch',
                          sketchDocumentId,
                          previewAssetId,
                          label: 'Sketch — working study',
                          ...findFreeNodePosition(nodes, {
                            x: 160,
                            y: 180,
                            width: 320,
                            height: 240,
                          }),
                          width: 320,
                          height: 240,
                          rotation: 0,
                          zIndex: nodes.length + 1,
                        } as CanvasNode);
                    const record = await actionRunner.run({
                      actionId: 'workspace.saveSketch',
                      context: actionContext,
                      input: {
                        node: sketchNode,
                        document: {
                          id: sketchDocumentId,
                          createdAt: sketchDraft?.document.createdAt ?? timestamp,
                          updatedAt: timestamp,
                          projectId: project.id,
                          format: 'excalidraw',
                          formatVersion: 2,
                          sourceAssetId,
                          previewAssetId,
                        },
                        source: {
                          id: sourceAssetId,
                          createdAt: timestamp,
                          updatedAt: timestamp,
                          projectId: project.id,
                          type: 'document',
                          name: 'Sketch scene',
                          mimeType: 'application/json',
                          size: source.size,
                          storage: { type: 'indexeddb', blobId: sourceAssetId },
                        },
                        preview: {
                          id: previewAssetId,
                          createdAt: timestamp,
                          updatedAt: timestamp,
                          projectId: project.id,
                          type: 'image',
                          name: 'Sketch preview.png',
                          mimeType: 'image/png',
                          size: preview.size,
                          storage: { type: 'indexeddb', blobId: previewAssetId },
                        },
                      },
                      runtime: {
                        sourceBlob: source,
                        previewBlob: preview,
                        save: repository.saveSketchSnapshot.bind(repository),
                      },
                    });
                    if (record.status !== 'success') throw new Error('Sketch save failed.');
                    registerPreviewUrl(previewAssetId, preview);
                    if (sketchDraft) {
                      const refresh = (frame: CanvasNode[]) =>
                        refreshSketchPreview(frame, sketchDocumentId, previewAssetId, timestamp);
                      const next = refresh(nodesRef.current);
                      nodesRef.current = next;
                      setNodes(next);
                      setHistory((frames) =>
                        frames.map((frame) => {
                          const updated = refresh(frame);
                          const deletion = deletionUndoRef.current.get(frame);
                          if (deletion)
                            deletionUndoRef.current.set(updated, {
                              ...deletion,
                              before: {
                                ...deletion.before,
                                nodes: refresh(deletion.before.nodes as CanvasNode[]),
                              },
                              after: {
                                ...deletion.after,
                                nodes: refresh(deletion.after.nodes as CanvasNode[]),
                              },
                            });
                          return updated;
                        }),
                      );
                    } else {
                      commit([...nodesRef.current, sketchNode]);
                    }
                    selectCanvasNode(sketchNode.id, false);
                    setDesignNodeToReveal(sketchNode.id);
                    setWorkspaceMode('canvas');
                    setEditingSketch(false);
                  } finally {
                    setGenerationBusy(false);
                  }
                }}
              />
            </Suspense>
          </div>
        ) : null}
      </main>
      {namingDialog}
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </>
  );
}
