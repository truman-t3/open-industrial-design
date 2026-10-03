import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { dracoDecoderPath } from './runtime-assets';
import { prepareEditMask, protectLocalEdit } from './edit-mask';
import { downloadOidProject, type ProjectDownload } from './project-download';
import { createDemoCopyArchive, fitDemoCopyViewport } from './demo-copy';
import { findGenerationTool, generationInputLabel } from './generation-tools';
import { updateWorkspaceStatus } from './workspace-status';
import { saveWorkspaceBeforeLeaving } from './workspace-save';
import { archiveErrorMessage } from './archive-error';
import {
  ActionRegistry,
  ActionRunner,
  CandidateTray,
  createCanvasGenerateAction,
  createGenerationStepAction,
  createKeepCanvasCandidateAction,
  generationInputSignature,
  LOCAL_EDIT_PROTECTION_ERROR,
  createAIAnalyzeDesignAction,
  createAIGenerateVariantAction,
  createAITestConnectionAction,
  createKeepCandidateAction,
  createWorkspaceActions,
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
  type CanvasNode,
  type CanvasInteractionMode,
  useCanvasRuntimeStore,
} from '@open-industrial-design/canvas';
import { appMetadata, translateDemoLabel } from '@open-industrial-design/core';
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
  DesignRelation,
  Edge,
  GenerationCandidate,
  GenerationNode,
  GenerationInputRole,
  Generation,
  GraphViewState,
  Project,
  Asset,
  Model3DNode,
} from '@open-industrial-design/design-model';
import {
  PROJECT_SCHEMA_VERSION,
  createConcept,
  createModel3DNode,
  createReferenceNode,
  validateGenerationInput,
} from '@open-industrial-design/design-model';
import {
  DexieProjectArchiveStorage,
  DexieProjectRepository,
  DexieAIGenerationStorage,
  DexieCanvasGenerationStorage,
  DexieProviderConfigRepository,
  DexieProviderCredentialStore,
  DexieThreeViewerStorage,
  OpenIndustrialDesignDatabase,
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
const archiveStorage = new DexieProjectArchiveStorage(database);
const generationStorage = new DexieAIGenerationStorage(database);
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
actionRegistry.register(createAIAnalyzeDesignAction());
actionRegistry.register(createAIGenerateVariantAction());
actionRegistry.register(createKeepCandidateAction());
actionRegistry.register(createCanvasGenerateAction());
actionRegistry.register(createGenerationStepAction());
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
    y: 210,
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
    y: 390,
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
    y: 155,
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
    y: 850,
    width: 210,
    height: 220,
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
    x: 1150,
    y: 340,
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
    y: 600,
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
    y: 600,
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
    y: 250,
  },
  {
    id: 'demo-cmf',
    label: 'CMF 探索 · 待运行',
    direction: '保留主图产品轮廓与结构，探索暖白外壳、细腻哑光表面与深灰五金的协调 CMF 方案。',
    x: 895,
    y: 210,
  },
  {
    id: 'demo-scene',
    label: '场景表达 · 待运行',
    direction:
      '保留灯具设计特征与比例，放入黄昏户外露营场景，表达真实尺度、温暖照明与自然使用方式。',
    x: 895,
    y: 850,
  },
  {
    id: 'demo-detail',
    label: '局部细节探索 · 待运行',
    direction: '保持灯具整体造型不变，只微调正面旋钮纹理与提手转轴细节。',
    x: 895,
    y: 555,
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
  const [hydrated, setHydrated] = useState(false);
  const [editingSketch, setEditingSketch] = useState(false);
  const [history, setHistory] = useState<CanvasNode[][]>([seedNodes]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [workspaceMode, setWorkspaceMode] = useState<'canvas' | 'graph' | 'viewer'>('canvas');
  const [canvasInteractionMode, setCanvasInteractionMode] =
    useState<CanvasInteractionMode>('select');
  const [designs, setDesigns] = useState<Design[]>(seedDesigns);
  const [relations, setRelations] = useState<DesignRelation[]>(seedRelations);
  const [graphViewState, setGraphViewState] = useState<GraphViewState>();
  const [selectedDesignId, setSelectedDesignId] = useState<string>();
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
  const [activeModelAssetId, setActiveModelAssetId] = useState<string>();
  const [activeModelUrl, setActiveModelUrl] = useState<string>();
  const [viewerStatus, setViewerStatus] = useState<string>();
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const importInputRef = useRef<HTMLInputElement>(null);
  const referenceImportInputRef = useRef<HTMLInputElement>(null);
  const modelImportInputRef = useRef<HTMLInputElement>(null);
  const activeModelUrlRef = useRef<string | undefined>(undefined);
  const previewUrlsRef = useRef<Record<string, string>>({});
  const candidatePreviewUrlsRef = useRef<Record<string, string>>({});
  const viewportBoardIdRef = useRef<string | undefined>(undefined);
  const selectedIds = useCanvasRuntimeStore((state) => state.selectedIds);
  const selectedCandidateId = useCanvasRuntimeStore((state) => state.selectedCandidateId);
  const canvasViewport = useCanvasRuntimeStore((state) => state.viewport);
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
  const commit = (next: CanvasNode[]) => {
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
  };
  const replaceNodesAndResetHistory = (next: CanvasNode[]) => {
    nodesRef.current = next;
    setNodes(next);
    setHistory([next]);
    setHistoryIndex(0);
  };
  const remove = () => {
    if (!selectedIds.length) return;
    const removed = [...selectedIds];
    void repository
      .deleteCanvasNodes(board.id, removed)
      .then((updatedBoard) => {
        setBoard(updatedBoard);
        setEdges((current) =>
          current.filter(
            (edge) => !removed.includes(edge.sourceNodeId) && !removed.includes(edge.targetNodeId),
          ),
        );
        setGenerationCandidates((current) =>
          current.filter((candidate) => !removed.includes(candidate.generationNodeId)),
        );
        commit(nodes.filter((node) => !removed.includes(node.id)));
        clearSelection();
      })
      .catch((error: unknown) =>
        setSaveError(error instanceof Error ? error.message : t('common.error')),
      );
  };
  const duplicate = () => {
    const copies = nodes
      .filter((node) => selectedIds.includes(node.id))
      .map((node) => ({ ...node, id: crypto.randomUUID(), x: node.x + 16, y: node.y + 16 }));
    if (copies.length) commit([...nodes, ...copies]);
  };
  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      nodesRef.current = history[historyIndex - 1];
      setNodes(history[historyIndex - 1]);
      clearSelection();
    }
  };
  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      nodesRef.current = history[historyIndex + 1];
      setNodes(history[historyIndex + 1]);
      clearSelection();
    }
  };
  const workspaceActionRuntime = {
    duplicateSelection: duplicate,
    deleteSelection: remove,
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
    const previewAssetIds = nodes.flatMap((node) => {
      const previewId =
        'previewAssetId' in node && typeof node.previewAssetId === 'string'
          ? node.previewAssetId
          : undefined;
      const assetId =
        'assetId' in node && typeof node.assetId === 'string' ? node.assetId : undefined;
      return [previewId, assetId].filter((value): value is string => Boolean(value));
    });
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
  }, [activeProjectId, appView, hydrated, nodes, registerPreviewUrl, t]);
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
    actionId: 'workspace.duplicateSelection' | 'workspace.deleteSelection',
  ) => {
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
        ] = await Promise.all([
          repository.loadSnapshot(activeProjectId),
          repository.listDesigns(activeProjectId),
          repository.listDesignRelations(activeProjectId),
          repository.getGraphViewState(activeProjectId),
          threeViewerStorage.listModelAssets(activeProjectId),
          repository.listBoards(activeProjectId),
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
    setSaveStatus('saving');
    setSaveError(undefined);
    const result = await saveWorkspaceBeforeLeaving(async () => {
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
    });
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
    if (!hydrated) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      void flushPendingSave();
    }, 750);
    return () => window.clearTimeout(timer);
  }, [flushPendingSave, hydrated]);
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
        void flushPendingSave();
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
  }, [flushPendingSave]);
  const openDesign = (designId: string) => {
    setSelectedDesignId(designId);
    const associatedNode = nodes.find((node) => node.designId === designId);
    if (associatedNode) selectCanvasNode(associatedNode.id, false);
    setWorkspaceMode('canvas');
  };
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
    const projectName = `便携灯具探索示例 · ${new Date(createdAt).toLocaleTimeString(
      locale === 'zh-CN' ? 'zh-CN' : 'en-US',
      { hour12: false },
    )}`;
    try {
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
  const selectBoard = async (nextBoard: Board) => {
    if (nextBoard.id === board.id) return;
    if (!(await flushPendingSave())) return;
    // Sidebar entries are labels, not the latest persisted viewport or node index.
    const savedBoard = await repository.getBoard(nextBoard.id);
    if (!savedBoard || savedBoard.projectId !== project.id) {
      setSaveError(t('common.error'));
      return;
    }
    const updatedProject = { ...project, activeBoardId: nextBoard.id, updatedAt: Date.now() };
    await repository.saveProject(updatedProject);
    const nextNodes = (await repository.listNodes(nextBoard.id)) as CanvasNode[];
    const [nextEdges, nextCandidates] = await Promise.all([
      repository.listEdges(nextBoard.id),
      canvasGenerationStorage.listCandidates(nextBoard.id),
    ]);
    setProject(updatedProject);
    setBoard(savedBoard);
    setBoards((current) => current.map((item) => (item.id === savedBoard.id ? savedBoard : item)));
    setNodes(nextNodes);
    setEdges(nextEdges);
    setGenerationCandidates(orderGenerationCandidates(nextCandidates));
    setHistory([nextNodes]);
    setHistoryIndex(0);
    clearSelection();
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
    if (!namingIntent?.value.trim()) return;
    const intent = namingIntent;
    if (intent.kind === 'new-project') await createProject(intent.value);
    if (intent.kind === 'rename-project') await renameProject(intent.target, intent.value);
    if (intent.kind === 'new-board') await createBoard(intent.value);
    if (intent.kind === 'new-concept') await createConceptCard(intent.value);
    if (intent.kind === 'rename-board') await renameBoard(intent.target, intent.value);
    setNamingIntent(undefined);
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
    const timestamp = Date.now();
    const assetId = crypto.randomUUID();
    const asset: Asset = {
      id: assetId,
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId: project.id,
      type: 'image',
      name: file.name,
      mimeType: file.type || 'image/png',
      size: file.size,
      storage: { type: 'indexeddb', blobId: assetId },
    };
    const referenceNode = {
      ...createReferenceNode({
        assetId,
        boardId: board.id,
        height: 220,
        referenceType: 'form',
        rotation: 0,
        width: 280,
        x: 100 + (nodes.length % 3) * 52,
        y: 160 + (nodes.length % 3) * 52,
        zIndex: nodes.length + 1,
      }),
      label: `Reference — ${file.name}`,
    } as CanvasNode;
    try {
      await Promise.all([
        repository.saveAsset(asset),
        repository.saveAssetBlob({ id: assetId, blob: file }),
        repository.saveNode(referenceNode),
        repository.saveBoard({ ...board, nodeIds: [...board.nodeIds, referenceNode.id] }),
      ]);
      registerPreviewUrl(assetId, file);
      commit([...nodes, referenceNode]);
    } catch (error) {
      setSaveStatus('failed');
      setSaveError(error instanceof Error ? error.message : t('feedback.referenceImportFailed'));
    }
  };
  const createConceptCard = async (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    const created = createConcept({
      boardId: board.id,
      name: normalizedName,
      projectId: project.id,
      x: 220 + (nodes.length % 3) * 60,
      y: 180 + (nodes.length % 3) * 48,
    });
    const conceptNode = { ...created.node, label: `Concept — ${normalizedName}` } as CanvasNode;
    await Promise.all([
      repository.saveDesign(created.design),
      repository.saveNode(conceptNode),
      repository.saveBoard({ ...board, nodeIds: [...board.nodeIds, conceptNode.id] }),
    ]);
    setDesigns((current) => [...current, created.design]);
    commit([...nodes, conceptNode]);
    setSelectedDesignId(created.design.id);
    selectCanvasNode(conceptNode.id, false);
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
          localEdit: tool.id === 'local',
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
      const right = (result.node.x + result.node.width) * viewport.zoom + viewport.x;
      const bottom = (result.node.y + result.node.height) * viewport.zoom + viewport.y;
      setCanvasViewport({
        ...viewport,
        x: viewport.x - Math.max(0, right - width + 24),
        y: viewport.y - Math.max(0, bottom - height + 24),
      });
      setGenerationStatus(undefined);
    } catch (error) {
      setGenerationStatus(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setGenerationBusy(false);
    }
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
      setGenerationStatus(error);
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
  const runCanvasGeneration = async (direction?: string) => {
    if (!selectedGenerationNode || generationBusy || generationRequestRef.current) return;
    const task =
      direction === undefined ? selectedGenerationNode : { ...selectedGenerationNode, direction };
    if (!selectedProvider || providerReadiness !== 'ready') {
      setGenerationStatus(t('generation.providerRequired'));
      return;
    }
    const connectedEdges = edges.filter(
      (edge) => edge.targetNodeId === selectedGenerationNode.id && edge.type === 'generation_input',
    );
    const sourceNodes = nodes.filter((node) =>
      connectedEdges.some((edge) => edge.sourceNodeId === node.id),
    );
    const controller = new AbortController();
    generationRequestRef.current = { nodeId: task.id, controller };
    setGenerationBusy(true);
    setGenerationStatus(undefined);
    try {
      const record = await actionRunner.run({
        actionId: 'ai.canvasGenerate',
        context: actionContext,
        input: {
          node: task,
          edges: connectedEdges,
          sourceNodes,
          sourceDesigns: designs,
          sourceCandidates: generationCandidates,
          provider: selectedProvider,
        },
        runtime: {
          router: capabilityRouter,
          signal: controller.signal,
          prepareMask: prepareEditMask,
          protectLocalEdit,
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
                ? `${sourceName} Variant`
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
    setActiveModelAssetId(undefined);
    setActiveModelUrl(undefined);
    setViewerStatus(undefined);
    setSelectedDesignId(undefined);
    clearSelection();
    setActiveProjectId(archive.project.id);
    window.localStorage.setItem(activeProjectStorageKey, archive.project.id);
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
        x: 160 + (nodes.length % 3) * 48,
        y: 180 + (nodes.length % 3) * 48,
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
            onChange={(event) => setNamingIntent({ ...namingIntent, value: event.target.value })}
            value={namingIntent.value}
          />
        </label>
        <div>
          <button onClick={() => setNamingIntent(undefined)} type="button">
            {t('common.cancel')}
          </button>
          <button className="button--primary" type="submit">
            {namingIntent.kind.startsWith('new') ? t('common.create') : t('dialog.saveName')}
          </button>
        </div>
      </form>
    </div>
  ) : null;
  return appView === 'home' ? (
    <>
      <ProjectHome
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
      {storageError ? (
        <p className="storage-error" role="status">
          {storageError}
        </p>
      ) : null}
      {namingDialog}
    </>
  ) : (
    <>
      <main className="app-shell" aria-label={appMetadata.displayName}>
        <header className="top-bar">
          <BrandLogo className="brand-logo brand-logo--workspace" variant="icon" />
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
            <button onClick={() => setEditingSketch(true)} type="button">
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
              <button type="button" onClick={() => void flushPendingSave()}>
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
          <div className="workspace">
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
                  <span>
                    {workspaceMode === 'canvas' ? t('workspace.canvas') : t('workspace.graph')}
                  </span>
                  <strong>{translateDemoLabel(locale, board.name)}</strong>
                </div>
                {workspaceMode === 'canvas' ? (
                  <div>
                    <button onClick={() => referenceImportInputRef.current?.click()} type="button">
                      <UiIcon name="image" size={14} />
                      {t('workspace.importReference')}
                    </button>
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
                        aria-label={
                          index > 1 ? `${t(item)} · ${t('workspace.toolUnavailable')}` : t(item)
                        }
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
                        disabled={index > 1}
                        key={item}
                        onClick={
                          index === 0
                            ? () => setCanvasInteractionMode('select')
                            : index === 1
                              ? () => setCanvasInteractionMode('pan')
                              : undefined
                        }
                        title={
                          index === 1
                            ? t('workspace.panShortcut')
                            : index > 1
                              ? `${t(item)} · ${t('workspace.toolUnavailable')}`
                              : t(item)
                        }
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
                    generationRun={{
                      busy: generationBusy,
                      ready: Boolean(selectedProvider && providerReadiness === 'ready'),
                      providerName: selectedProvider?.name,
                      status: generationStatus,
                      onRun: (nodeId, direction) => {
                        if (selectedGenerationNode?.id !== nodeId) return;
                        if (!selectedProvider || providerReadiness !== 'ready') {
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
                      signature: generationInputSignature(selectedGenerationNode, edges, nodes),
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
          <span>{t('workspace.localFirst')}</span>
          <span>
            {workspaceMode === 'graph'
              ? t('workspace.designCount', { count: designs.length })
              : t('workspace.nodeCount', { count: nodes.length })}
          </span>
          <span>
            {workspaceMode === 'graph'
              ? t('workspace.graphRuntime')
              : workspaceMode === 'viewer'
                ? t('workspace.viewerRuntime')
                : t('workspace.canvasRuntime')}
          </span>
          <span title={saveError}>
            {saveLabel} · {t('workspace.flush')}
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
          accept="image/*"
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
                onCancel={() => setEditingSketch(false)}
                onSave={async ({ preview, source }) => {
                  const sourceAssetId = crypto.randomUUID();
                  const previewAssetId = crypto.randomUUID();
                  const sketchDocumentId = crypto.randomUUID();
                  const timestamp = Date.now();
                  const sketchNode = {
                    id: crypto.randomUUID(),
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    boardId: board.id,
                    type: 'sketch',
                    sketchDocumentId,
                    previewAssetId,
                    label: 'Sketch — working study',
                    x: 160 + (nodes.length % 3) * 52,
                    y: 180 + (nodes.length % 3) * 48,
                    width: 320,
                    height: 240,
                    rotation: 0,
                    zIndex: nodes.length + 1,
                  } as CanvasNode;
                  await Promise.all([
                    repository.saveAsset({
                      id: sourceAssetId,
                      createdAt: timestamp,
                      updatedAt: timestamp,
                      projectId: project.id,
                      type: 'document',
                      name: 'Sketch scene',
                      mimeType: 'application/json',
                      size: source.size,
                      storage: { type: 'indexeddb', blobId: sourceAssetId },
                    }),
                    repository.saveAsset({
                      id: previewAssetId,
                      createdAt: timestamp,
                      updatedAt: timestamp,
                      projectId: project.id,
                      type: 'image',
                      name: 'Sketch preview.png',
                      mimeType: 'image/png',
                      size: preview.size,
                      storage: { type: 'indexeddb', blobId: previewAssetId },
                    }),
                    repository.saveAssetBlob({ id: sourceAssetId, blob: source }),
                    repository.saveAssetBlob({ id: previewAssetId, blob: preview }),
                    repository.saveSketchDocument({
                      id: sketchDocumentId,
                      createdAt: timestamp,
                      updatedAt: timestamp,
                      projectId: project.id,
                      format: 'excalidraw',
                      formatVersion: 2,
                      sourceAssetId,
                      previewAssetId,
                    }),
                    repository.saveNode(sketchNode),
                    repository.saveBoard({ ...board, nodeIds: [...board.nodeIds, sketchNode.id] }),
                  ]);
                  registerPreviewUrl(previewAssetId, preview);
                  commit([...nodes, sketchNode]);
                  setEditingSketch(false);
                }}
              />
            </Suspense>
          </div>
        ) : null}
      </main>
      {namingDialog}
    </>
  );
}
