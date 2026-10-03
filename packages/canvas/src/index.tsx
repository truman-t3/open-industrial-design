import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Arrow,
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import type Konva from 'konva';
import { create } from 'zustand';
import { GenerationCardEditor } from './generation-card-editor';
import { connectionAppearance, connectionIsActive } from './connection-appearance';
import { fitCanvasViewport, zoomViewport } from './viewport';
import {
  translate,
  translateDemoLabel,
  translateDesignKind,
  translateDesignStatus,
  type AppLocale,
  type MessageKey,
} from '@open-industrial-design/core';
import type {
  BaseNode,
  CandidateNode,
  Design,
  Edge,
  GenerationNode,
  GenerationInputRole,
  NodeType,
  TextNode,
  Viewport,
} from '@open-industrial-design/design-model';
import {
  canvasInteractionPolicy,
  connectionCurve,
  connectionTargetAt,
  layoutGenerationCandidateOutputs,
  resolveCanvasShortcut,
  verticalConnectionCurve,
  type CanvasInteractionMode,
  type ConnectionTarget,
} from './interaction';

export type { CanvasInteractionMode } from './interaction';
export { findFreeNodePosition } from './interaction';

export type CanvasNode =
  | TextNode
  | GenerationNode
  | CandidateNode
  | (Omit<BaseNode, 'type'> & {
      type: Exclude<NodeType, 'text' | 'generation' | 'candidate'>;
      label: string;
      assetId?: string;
      previewAssetId?: string;
    });

function StaticPreview({
  height,
  url,
  width,
  x = 0,
  y = 0,
}: {
  height: number;
  url?: string;
  width: number;
  x?: number;
  y?: number;
}) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    if (!url) {
      setImage(undefined);
      return;
    }
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = url;
    return () => {
      next.onload = null;
    };
  }, [url]);
  if (!image) return null;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const frameRatio = width / height;
  const cropWidth =
    sourceRatio > frameRatio ? image.naturalHeight * frameRatio : image.naturalWidth;
  const cropHeight =
    sourceRatio > frameRatio ? image.naturalHeight : image.naturalWidth / frameRatio;
  return (
    <KonvaImage
      crop={{
        x: (image.naturalWidth - cropWidth) / 2,
        y: (image.naturalHeight - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
      }}
      height={height}
      image={image}
      width={width}
      x={x}
      y={y}
    />
  );
}

const nodeAppearance: Record<
  CanvasNode['type'],
  { accent: string; labelKey: MessageKey; surface: string }
> = {
  text: { accent: '#6b7280', labelKey: 'node.text', surface: '#ffffff' },
  image: { accent: '#0891b2', labelKey: 'node.image', surface: '#ffffff' },
  reference: { accent: '#2563ff', labelKey: 'node.reference', surface: '#ffffff' },
  sketch: { accent: '#7c3aed', labelKey: 'node.sketch', surface: '#ffffff' },
  concept: { accent: '#2563ff', labelKey: 'node.concept', surface: '#ffffff' },
  variant: { accent: '#7c3aed', labelKey: 'node.variant', surface: '#ffffff' },
  viewset: { accent: '#059669', labelKey: 'node.viewset', surface: '#ffffff' },
  cmf: { accent: '#d97706', labelKey: 'node.cmf', surface: '#ffffff' },
  model3d: { accent: '#2563ff', labelKey: 'node.model3d', surface: '#ffffff' },
  group: { accent: '#6b7280', labelKey: 'node.group', surface: '#ffffff' },
  generation: { accent: '#2563ff', labelKey: 'node.generation', surface: '#ffffff' },
  candidate: { accent: '#2563ff', labelKey: 'generation.resultSelection', surface: '#ffffff' },
};

function previewAssetId(node: CanvasNode) {
  if ('previewAssetId' in node && typeof node.previewAssetId === 'string')
    return node.previewAssetId;
  if ('assetId' in node && typeof node.assetId === 'string') return node.assetId;
  return undefined;
}

type RuntimeState = {
  viewport: Viewport;
  selectedIds: string[];
  selectedCandidateId?: string;
  candidatePositionsByBoard: Record<string, Record<string, { x: number; y: number }>>;
  setViewport: (viewport: Viewport) => void;
  select: (id: string, additive: boolean) => void;
  selectCandidate: (id: string) => void;
  clearCandidateSelection: (id: string) => void;
  setCandidatePositions: (
    boardId: string,
    positions: Record<string, { x: number; y: number }>,
  ) => void;
  commitCandidatePosition: (
    boardId: string,
    id: string,
    position: { x: number; y: number },
  ) => void;
  clearSelection: () => void;
};

const candidatePositionStorageKey = (boardId: string) =>
  `oid.canvas.candidate-positions.v1:${boardId}`;
const EMPTY_CANDIDATE_POSITIONS: Record<string, { x: number; y: number }> = {};

export const useCanvasRuntimeStore = create<RuntimeState>((set, get) => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedIds: [],
  selectedCandidateId: undefined,
  candidatePositionsByBoard: {},
  setViewport: (viewport) => set({ viewport }),
  select: (id, additive) =>
    set((state) => ({
      selectedCandidateId: undefined,
      selectedIds: additive
        ? state.selectedIds.includes(id)
          ? state.selectedIds.filter((selectedId) => selectedId !== id)
          : [...state.selectedIds, id]
        : [id],
    })),
  selectCandidate: (id) => set({ selectedIds: [], selectedCandidateId: id }),
  clearCandidateSelection: (id) =>
    set((state) =>
      state.selectedCandidateId === id
        ? { selectedIds: [], selectedCandidateId: undefined }
        : state,
    ),
  setCandidatePositions: (boardId, positions) =>
    set((state) => ({
      candidatePositionsByBoard: { ...state.candidatePositionsByBoard, [boardId]: positions },
    })),
  commitCandidatePosition: (boardId, id, position) => {
    const positions = {
      ...(get().candidatePositionsByBoard[boardId] ?? {}),
      [id]: position,
    };
    set((state) => ({
      candidatePositionsByBoard: { ...state.candidatePositionsByBoard, [boardId]: positions },
    }));
    try {
      localStorage.setItem(candidatePositionStorageKey(boardId), JSON.stringify(positions));
    } catch {
      // Position persistence is a convenience; dragging still works for this session.
    }
  },
  clearSelection: () => set({ selectedIds: [], selectedCandidateId: undefined }),
}));

export type CanvasWorkspaceProps = {
  boardId: string;
  interactionMode?: CanvasInteractionMode;
  nodes: CanvasNode[];
  onNodesChange: (nodes: CanvasNode[]) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  previewUrls?: Record<string, string>;
  designs?: readonly Design[];
  edges?: readonly Edge[];
  generationCandidates?: readonly {
    id: string;
    generationNodeId: string;
    previewUrl?: string;
    view?: 'front' | 'side' | 'rear' | 'top' | 'perspective';
  }[];
  onConnectInput?: (sourceNodeId: string, targetNodeId: string, role: GenerationInputRole) => void;
  generationRun?: {
    busy: boolean;
    ready: boolean;
    providerName?: string;
    status?: string;
    onRun(nodeId: string, direction: string): void;
  };
  locale?: AppLocale;
};

type ConnectionDraft = {
  sourceNodeId: string;
  x: number;
  y: number;
  target?: ConnectionTarget;
};

export function CanvasWorkspace({
  boardId,
  interactionMode = 'select',
  nodes,
  onNodesChange,
  onDelete,
  onDuplicate,
  onUndo,
  onRedo,
  previewUrls = {},
  designs = [],
  edges = [],
  generationCandidates = [],
  onConnectInput,
  generationRun,
  locale = 'en',
}: CanvasWorkspaceProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const [stageDragOffset, setStageDragOffset] = useState<{ x: number; y: number } | null>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ height: 720, width: 960 });
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [spacePanning, setSpacePanning] = useState(false);
  const effectiveInteractionMode = spacePanning ? 'pan' : interactionMode;
  const [dragPosition, setDragPosition] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [hoveredOutputId, setHoveredOutputId] = useState<string | null>(null);
  const [dragCandidatePosition, setDragCandidatePosition] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const viewport = useCanvasRuntimeStore((state) => state.viewport);
  const selectedIds = useCanvasRuntimeStore((state) => state.selectedIds);
  const selectedCandidateId = useCanvasRuntimeStore((state) => state.selectedCandidateId);
  const candidatePositions = useCanvasRuntimeStore(
    (state) => state.candidatePositionsByBoard[boardId] ?? EMPTY_CANDIDATE_POSITIONS,
  );
  const setViewport = useCanvasRuntimeStore((state) => state.setViewport);
  const select = useCanvasRuntimeStore((state) => state.select);
  const selectCandidate = useCanvasRuntimeStore((state) => state.selectCandidate);
  const setCandidatePositions = useCanvasRuntimeStore((state) => state.setCandidatePositions);
  const commitCandidatePosition = useCanvasRuntimeStore((state) => state.commitCandidatePosition);
  const clearSelection = useCanvasRuntimeStore((state) => state.clearSelection);
  const designsById = useMemo(
    () => new Map(designs.map((design) => [design.id, design])),
    [designs],
  );
  const positionedNodes = useMemo(
    () =>
      nodes.map((node) => {
        if (node.id === dragPosition?.id) return { ...node, x: dragPosition.x, y: dragPosition.y };
        if (node.type === 'candidate' && node.candidateId === dragCandidatePosition?.id)
          return { ...node, x: dragCandidatePosition.x, y: dragCandidatePosition.y };
        return node;
      }),
    [dragPosition, dragCandidatePosition, nodes],
  );
  const visibleCandidatePositions = useMemo(
    () =>
      dragCandidatePosition
        ? {
            ...candidatePositions,
            [dragCandidatePosition.id]: {
              x: dragCandidatePosition.x,
              y: dragCandidatePosition.y,
            },
          }
        : candidatePositions,
    [candidatePositions, dragCandidatePosition],
  );
  const lineageArrows = useMemo(() => {
    const nodesByDesignId = new Map(
      positionedNodes.filter((node) => node.designId).map((node) => [node.designId, node]),
    );
    return designs.flatMap((design) => {
      const source = design.parentDesignId && nodesByDesignId.get(design.parentDesignId);
      const target = nodesByDesignId.get(design.id);
      if (!source || !target) return [];
      const downward = target.y >= source.y + source.height;
      const points = downward
        ? verticalConnectionCurve(
            source.x + source.width / 2,
            source.y + source.height + 2,
            target.x + target.width / 2,
            target.y - 5,
          )
        : [
            source.x + source.width / 2,
            source.y - 4,
            source.x + source.width / 2,
            Math.min(source.y, target.y) - 70,
            target.x + target.width / 2,
            Math.min(source.y, target.y) - 70,
            target.x + target.width / 2,
            target.y - 4,
          ];
      return [{ id: design.id, sourceId: source.id, targetId: target.id, points }];
    });
  }, [designs, positionedNodes]);
  const inputArrows = useMemo(() => {
    const byId = new Map(positionedNodes.map((node) => [node.id, node]));
    return edges.flatMap((edge) => {
      if (edge.type !== 'generation_input') return [];
      const source = byId.get(edge.sourceNodeId);
      const target = byId.get(edge.targetNodeId);
      if (!source || !target) return [];
      const startX = source.x + source.width - 4;
      const endX = target.x - 4;
      const startY = source.y + source.height / 2;
      const endY = target.y + (edge.inputRole === 'base' ? 86 : 116);
      return [
        {
          id: edge.id,
          sourceId: source.id,
          targetId: target.id,
          candidateId: source.type === 'candidate' ? source.candidateId : undefined,
          points: connectionCurve(startX, startY, endX, endY),
          role: edge.inputRole,
        },
      ];
    });
  }, [edges, positionedNodes]);
  const outputArrows = useMemo(() => {
    const byId = new Map(positionedNodes.map((node) => [node.id, node]));
    return edges.flatMap((edge) => {
      if (edge.type !== 'generation_output') return [];
      const source = byId.get(edge.sourceNodeId);
      const target = byId.get(edge.targetNodeId);
      if (!source || !target || source.type !== 'generation') return [];
      if (target.type === 'candidate') return [];
      const sourceIsLeft = target.x + target.width / 2 >= source.x + source.width / 2;
      const points = sourceIsLeft
        ? connectionCurve(
            source.x + source.width + 4,
            source.y + source.height / 2,
            target.x - 4,
            target.y + target.height / 2,
          )
        : connectionCurve(
            target.x + target.width + 4,
            target.y + target.height / 2,
            source.x - 4,
            source.y + source.height / 2,
          ).reduce<number[]>((reversed, value, index, values) => {
            if (index % 2 === 0) reversed.unshift(values[index + 1]!, value);
            return reversed;
          }, []);
      return [{ id: edge.id, sourceId: source.id, targetId: target.id, points }];
    });
  }, [edges, positionedNodes]);
  const candidateOutputCards = useMemo(
    () =>
      layoutGenerationCandidateOutputs(
        positionedNodes,
        generationCandidates,
        visibleCandidatePositions,
      ).map((card) =>
        card.candidateId === dragCandidatePosition?.id
          ? { ...card, x: dragCandidatePosition.x, y: dragCandidatePosition.y }
          : card,
      ),
    [generationCandidates, positionedNodes, visibleCandidatePositions, dragCandidatePosition],
  );
  const candidateOutputArrows = useMemo(() => {
    const byId = new Map(positionedNodes.map((node) => [node.id, node]));
    return candidateOutputCards.flatMap((card) => {
      const source = byId.get(card.generationNodeId);
      if (!source) return [];
      return [
        {
          id: card.candidateId,
          sourceId: source.id,
          targetId:
            positionedNodes.find(
              (node) => node.type === 'candidate' && node.candidateId === card.candidateId,
            )?.id ?? '',
          points: connectionCurve(
            source.x + source.width + 4,
            source.y + source.height / 2,
            card.x - 4,
            card.y + card.height / 2,
          ),
        },
      ];
    });
  }, [candidateOutputCards, positionedNodes]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(candidatePositionStorageKey(boardId));
      if (!raw) {
        setCandidatePositions(boardId, {});
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
      const positions = Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, { x: number; y: number }] =>
            typeof entry[1] === 'object' &&
            entry[1] !== null &&
            'x' in entry[1] &&
            'y' in entry[1] &&
            typeof entry[1].x === 'number' &&
            Number.isFinite(entry[1].x) &&
            typeof entry[1].y === 'number' &&
            Number.isFinite(entry[1].y),
        ),
      );
      setCandidatePositions(boardId, positions);
    } catch {
      setCandidatePositions(boardId, {});
    }
  }, [boardId, setCandidatePositions]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    transformer.nodes(
      selectedIds.map((id) => stage.findOne(`#${id}`)).filter(Boolean) as Konva.Node[],
    );
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, nodes]);

  const isConnecting = connectionDraft !== null;
  const isDraggingNode = dragPosition !== null || dragCandidatePosition !== null;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = resolveCanvasShortcut(event, selectedIds.length, isConnecting);
      if (shortcut.preventDefault) event.preventDefault();
      switch (shortcut.action) {
        case 'start-pan':
          if (!isDraggingNode) setSpacePanning(true);
          break;
        case 'cancel-connection':
          stageRef.current?.draggable(interactionMode === 'pan');
          setConnectionDraft(null);
          break;
        case 'delete':
          onDelete();
          break;
        case 'duplicate':
          onDuplicate();
          break;
        case 'redo':
          onRedo();
          break;
        case 'undo':
          onUndo();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onDelete,
    onDuplicate,
    onRedo,
    onUndo,
    selectedIds,
    isConnecting,
    isDraggingNode,
    interactionMode,
  ]);

  useEffect(() => {
    const releaseSpace = (event: KeyboardEvent) => {
      if (event.key === ' ') setSpacePanning(false);
    };
    const cancelConnection = () => {
      stageRef.current?.draggable(interactionMode === 'pan');
      setConnectionDraft(null);
      setSpacePanning(false);
    };
    window.addEventListener('keyup', releaseSpace);
    window.addEventListener('blur', cancelConnection);
    return () => {
      window.removeEventListener('keyup', releaseSpace);
      window.removeEventListener('blur', cancelConnection);
    };
  }, [interactionMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () =>
      setStageSize({
        height: Math.max(1, container.clientHeight),
        width: Math.max(1, container.clientWidth),
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (containerRef.current)
      containerRef.current.style.cursor = effectiveInteractionMode === 'pan' ? 'grab' : 'default';
  }, [effectiveInteractionMode]);

  const updateNode = (id: string, patch: Partial<CanvasNode>) =>
    onNodesChange(
      nodes.map((node) => (node.id === id ? ({ ...node, ...patch } as CanvasNode) : node)),
    );
  const connectionSource = connectionDraft
    ? positionedNodes.find((node) => node.id === connectionDraft.sourceNodeId)
    : undefined;
  const interactionPolicy = canvasInteractionPolicy(effectiveInteractionMode);

  const canvasPointer = (stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return undefined;
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  };

  const finishConnection = () => {
    if (!connectionDraft) return;
    const stage = stageRef.current;
    stage?.draggable(interactionPolicy.stageDraggable);
    if (!stage) {
      setConnectionDraft(null);
      return;
    }
    const pointer = canvasPointer(stage);
    const target =
      pointer &&
      connectionTargetAt(
        nodes,
        edges,
        connectionDraft.sourceNodeId,
        pointer.x,
        pointer.y,
        viewport.zoom,
      );
    if (target) onConnectInput?.(connectionDraft.sourceNodeId, target.nodeId, target.role);
    setConnectionDraft(null);
  };

  return (
    <div
      className={`konva-canvas${effectiveInteractionMode === 'pan' ? ' konva-canvas--pan' : ''}`}
      aria-label={translate(locale, 'canvas.workspace')}
      ref={containerRef}
    >
      <Stage
        draggable={interactionPolicy.stageDraggable && !connectionDraft && !dragPosition}
        height={stageSize.height}
        onClick={(event) => {
          if (effectiveInteractionMode === 'select' && event.target === event.target.getStage())
            clearSelection();
        }}
        onDragStart={(event) => {
          if (event.target === stageRef.current && containerRef.current)
            containerRef.current.style.cursor = 'grabbing';
        }}
        onDragEnd={(event) => {
          if (event.target !== stageRef.current) return;
          setViewport({ ...viewport, x: event.target.x(), y: event.target.y() });
          setStageDragOffset(null);
          if (containerRef.current)
            containerRef.current.style.cursor =
              effectiveInteractionMode === 'pan' ? 'grab' : 'default';
        }}
        onDragMove={(event) => {
          if (event.target === stageRef.current)
            setStageDragOffset({ x: event.target.x(), y: event.target.y() });
        }}
        onMouseLeave={() => {
          if (!connectionDraft) return;
          stageRef.current?.draggable(interactionPolicy.stageDraggable);
          setConnectionDraft(null);
        }}
        onMouseMove={(event) => {
          if (!connectionDraft) return;
          const stage = event.target.getStage();
          const pointer = stage && canvasPointer(stage);
          if (!pointer) return;
          const target = connectionTargetAt(
            nodes,
            edges,
            connectionDraft.sourceNodeId,
            pointer.x,
            pointer.y,
            viewport.zoom,
          );
          const targetNode = target && nodes.find((node) => node.id === target.nodeId);
          setConnectionDraft({
            ...connectionDraft,
            x: targetNode && target.valid ? targetNode.x + 5 : pointer.x,
            y:
              targetNode && target.valid
                ? targetNode.y + (target.role === 'base' ? 86 : 116)
                : pointer.y,
            target,
          });
        }}
        onMouseUp={finishConnection}
        onWheel={(event) => {
          event.evt.preventDefault();
          const stage = event.target.getStage();
          if (!stage) return;
          const pointer = stage.getPointerPosition();
          if (!pointer) return;
          setViewport(
            zoomViewport(viewport, viewport.zoom * (event.evt.deltaY > 0 ? 0.92 : 1.08), pointer),
          );
        }}
        ref={stageRef}
        scaleX={viewport.zoom}
        scaleY={viewport.zoom}
        width={stageSize.width}
        x={viewport.x}
        y={viewport.y}
      >
        <Layer>
          {lineageArrows.map((arrow) => (
            <Arrow
              bezier
              key={arrow.id}
              listening={false}
              points={arrow.points}
              pointerLength={5}
              pointerWidth={5}
              {...connectionAppearance(
                'lineage',
                connectionIsActive(arrow.sourceId, arrow.targetId, selectedIds),
              )}
              lineCap="round"
              lineJoin="round"
            />
          ))}
          {inputArrows.map((arrow) => (
            <Arrow
              bezier
              key={arrow.id}
              listening={false}
              points={arrow.points}
              pointerLength={5}
              pointerWidth={5}
              {...connectionAppearance(
                'workflow',
                connectionIsActive(
                  arrow.sourceId,
                  arrow.targetId,
                  selectedIds,
                  arrow.candidateId,
                  selectedCandidateId,
                ),
              )}
            />
          ))}
          {outputArrows.map((arrow) => (
            <Arrow
              bezier
              key={arrow.id}
              listening={false}
              points={arrow.points}
              pointerLength={6}
              pointerWidth={6}
              {...connectionAppearance(
                'workflow',
                connectionIsActive(arrow.sourceId, arrow.targetId, selectedIds),
              )}
              lineCap="round"
              lineJoin="round"
            />
          ))}
          {candidateOutputArrows.map((arrow) => (
            <Arrow
              bezier
              key={`candidate-output-${arrow.id}`}
              listening={false}
              points={arrow.points}
              pointerLength={6}
              pointerWidth={6}
              {...connectionAppearance(
                'workflow',
                connectionIsActive(
                  arrow.sourceId,
                  arrow.targetId,
                  selectedIds,
                  arrow.id,
                  selectedCandidateId,
                ),
              )}
              lineCap="round"
              lineJoin="round"
            />
          ))}
          {connectionDraft ? (
            <Arrow
              bezier
              listening={false}
              points={connectionCurve(
                connectionSource
                  ? connectionSource.x + connectionSource.width - 4
                  : connectionDraft.x,
                connectionSource
                  ? connectionSource.y + connectionSource.height / 2
                  : connectionDraft.y,
                connectionDraft.x,
                connectionDraft.y,
              )}
              pointerLength={6}
              pointerWidth={6}
              stroke={
                connectionDraft.target && !connectionDraft.target.valid ? '#d97706' : '#2563ff'
              }
              fill={connectionDraft.target && !connectionDraft.target.valid ? '#d97706' : '#2563ff'}
              strokeWidth={1.5}
              dash={[6, 4]}
            />
          ) : null}
          {nodes.map((node) => {
            if (node.type === 'candidate') return null;
            const appearance = nodeAppearance[node.type];
            const design = node.designId ? designsById.get(node.designId) : undefined;
            const sourceName = design?.parentDesignId
              ? designsById.get(design.parentDesignId)?.name
              : undefined;
            const title =
              node.type === 'text'
                ? translateDemoLabel(locale, node.text)
                : translateDemoLabel(locale, design?.name ?? node.label) ||
                  translate(locale, appearance.labelKey);
            const lineage =
              node.type === 'variant'
                ? sourceName
                  ? translate(locale, 'canvas.derivedFrom', {
                      name: translateDemoLabel(locale, sourceName),
                    })
                  : translate(locale, 'canvas.derived')
                : design
                  ? `${translateDesignKind(locale, design.kind)} · ${translateDesignStatus(locale, design.status)}`
                  : undefined;
            const previewUrl = previewUrls[previewAssetId(node) ?? ''];
            const nodeCandidates =
              node.type === 'generation'
                ? generationCandidates.filter((item) => item.generationNodeId === node.id).slice(-4)
                : [];
            const taskInputs =
              node.type === 'generation'
                ? edges
                    .filter(
                      (edge) => edge.type === 'generation_input' && edge.targetNodeId === node.id,
                    )
                    .sort((a, b) => Number(b.inputRole === 'base') - Number(a.inputRole === 'base'))
                    .map((edge) => nodes.find((source) => source.id === edge.sourceNodeId))
                    .filter((source): source is CanvasNode => Boolean(source))
                    .slice(0, 2)
                : [];
            // Adopted results keep their compact candidate-card dimensions. Preserve the
            // image-first presentation instead of squeezing the preview below a full header.
            const compactDesignPreview =
              Boolean(previewUrl) &&
              (node.type === 'concept' || node.type === 'variant') &&
              node.height <= 170;
            const headerHeight = node.type === 'text' || compactDesignPreview ? 0 : 38;
            return (
              <Group
                draggable={interactionPolicy.nodesDraggable && !node.locked && !connectionDraft}
                id={node.id}
                key={node.id}
                listening={interactionPolicy.connectionsEnabled}
                onClick={(event) => {
                  event.cancelBubble = true;
                  if (!interactionPolicy.connectionsEnabled) return;
                  select(node.id, event.evt.shiftKey);
                }}
                onDragStart={(event) => {
                  stageRef.current?.draggable(false);
                  setDragPosition({ id: node.id, x: event.target.x(), y: event.target.y() });
                }}
                onDragMove={(event) =>
                  setDragPosition({ id: node.id, x: event.target.x(), y: event.target.y() })
                }
                onDragEnd={(event) => {
                  updateNode(node.id, { x: event.target.x(), y: event.target.y() });
                  setDragPosition(null);
                  stageRef.current?.draggable(interactionPolicy.stageDraggable);
                }}
                onTransformEnd={(event) => {
                  const target = event.target;
                  updateNode(node.id, {
                    x: target.x(),
                    y: target.y(),
                    width: Math.max(80, target.width() * target.scaleX()),
                    height: Math.max(48, target.height() * target.scaleY()),
                    rotation: target.rotation(),
                  });
                  target.scaleX(1);
                  target.scaleY(1);
                }}
                x={node.x}
                y={node.y}
                rotation={node.rotation}
              >
                <Rect
                  width={node.width}
                  height={node.height}
                  fill={appearance.surface}
                  stroke={
                    selectedIds.includes(node.id) ||
                    (connectionDraft?.target?.nodeId === node.id && connectionDraft.target.valid)
                      ? '#2563ff'
                      : '#dfe3e8'
                  }
                  strokeWidth={
                    selectedIds.includes(node.id) ||
                    (connectionDraft?.target?.nodeId === node.id && connectionDraft.target.valid)
                      ? 2
                      : 1
                  }
                  cornerRadius={7}
                  shadowBlur={8}
                  shadowColor="#111827"
                  shadowOffset={{ x: 0, y: 2 }}
                  shadowOpacity={selectedIds.includes(node.id) ? 0.1 : 0.035}
                />
                {headerHeight ? (
                  <Rect
                    cornerRadius={2}
                    fill={appearance.accent}
                    height={10}
                    width={10}
                    x={12}
                    y={14}
                  />
                ) : null}
                {node.type === 'generation' ? (
                  <>
                    <Text
                      text={node.direction || translate(locale, 'generation.ready')}
                      x={12}
                      y={48}
                      width={node.width - 24}
                      height={30}
                      fontSize={12}
                      fill="#526071"
                      visible={!generationRun || !selectedIds.includes(node.id)}
                    />
                    <Text
                      text={translate(locale, 'generation.base')}
                      x={16}
                      y={82}
                      fontSize={11}
                      fill="#526071"
                    />
                    <Circle
                      x={5}
                      y={86}
                      radius={7}
                      fill={
                        connectionDraft?.target?.valid &&
                        connectionDraft.target.nodeId === node.id &&
                        connectionDraft.target.role === 'base'
                          ? '#dbeafe'
                          : '#ffffff'
                      }
                      stroke="#2563ff"
                      strokeWidth={2}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        const sourceId = selectedIds[0];
                        if (sourceId) onConnectInput?.(sourceId, node.id, 'base');
                      }}
                    />
                    <Text
                      text={translate(locale, 'generation.reference')}
                      x={16}
                      y={112}
                      fontSize={11}
                      fill="#526071"
                    />
                    <Circle
                      x={5}
                      y={116}
                      radius={7}
                      fill={
                        connectionDraft?.target?.valid &&
                        connectionDraft.target.nodeId === node.id &&
                        connectionDraft.target.role === 'reference'
                          ? '#dbeafe'
                          : '#ffffff'
                      }
                      stroke="#95a4b8"
                      strokeWidth={2}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        const sourceId = selectedIds[0];
                        if (sourceId) onConnectInput?.(sourceId, node.id, 'reference');
                      }}
                    />
                    {taskInputs.map((source, index) => (
                      <Group
                        key={source.id}
                        x={12 + index * ((node.width - 30) / 2)}
                        y={142}
                        listening={false}
                      >
                        <Rect
                          width={(node.width - 38) / 2}
                          height={70}
                          fill="#f1f3f5"
                          cornerRadius={4}
                        />
                        <StaticPreview
                          url={
                            source.type === 'candidate' && 'candidateId' in source
                              ? generationCandidates.find(
                                  (candidate) => candidate.id === source.candidateId,
                                )?.previewUrl
                              : previewUrls[previewAssetId(source) ?? '']
                          }
                          width={(node.width - 38) / 2}
                          height={70}
                        />
                      </Group>
                    ))}
                    {!nodeCandidates.length ? (
                      <Group
                        y={node.height - 36}
                        x={12}
                        onClick={(event) => {
                          event.cancelBubble = true;
                          select(node.id, false);
                        }}
                      >
                        <Rect width={node.width - 24} height={26} cornerRadius={4} fill="#eaf1ff" />
                        <Text
                          text={translate(locale, 'generation.setup')}
                          align="center"
                          width={node.width - 24}
                          y={7}
                          fontSize={12}
                          fill="#2563ff"
                        />
                      </Group>
                    ) : null}
                  </>
                ) : previewUrl ? (
                  <StaticPreview
                    height={
                      compactDesignPreview ? node.height - 49 : node.height - headerHeight - 44
                    }
                    url={previewUrl}
                    width={node.width - (compactDesignPreview ? 16 : 20)}
                    x={compactDesignPreview ? 8 : 10}
                    y={compactDesignPreview ? 8 : headerHeight}
                  />
                ) : null}
                {headerHeight ? (
                  <Text
                    fill="#374151"
                    fontSize={10}
                    fontStyle="bold"
                    letterSpacing={0.2}
                    text={
                      node.type === 'generation' ? title : translate(locale, appearance.labelKey)
                    }
                    width={node.width - 42}
                    x={30}
                    y={13}
                  />
                ) : null}
                {node.type !== 'generation' ? (
                  <Text
                    text={title}
                    width={node.width - 24}
                    height={previewUrl ? 18 : node.height - headerHeight - 38}
                    x={12}
                    y={
                      previewUrl
                        ? node.height - (compactDesignPreview ? 39 : lineage ? 42 : 31)
                        : headerHeight + 15
                    }
                    fontSize={
                      node.type === 'text' ? (node.fontSize ?? 20) : compactDesignPreview ? 11 : 13
                    }
                    fontStyle={
                      node.type === 'concept' || node.type === 'variant' ? 'bold' : 'normal'
                    }
                    fill="#18212b"
                    verticalAlign="middle"
                  />
                ) : null}
                {lineage ? (
                  <Text
                    fill="#6b7280"
                    fontSize={10}
                    text={lineage}
                    width={node.width - 24}
                    x={12}
                    y={node.height - 21}
                  />
                ) : null}
              </Group>
            );
          })}
          {candidateOutputCards.map((card) => {
            const candidate = generationCandidates.find((item) => item.id === card.candidateId);
            if (!candidate) return null;
            const selected = selectedCandidateId === candidate.id;
            return (
              <Group
                key={`candidate-output-card-${card.candidateId}`}
                draggable={interactionPolicy.nodesDraggable && !connectionDraft}
                listening={interactionPolicy.connectionsEnabled}
                x={card.x}
                y={card.y}
                onClick={(event) => {
                  event.cancelBubble = true;
                  selectCandidate(candidate.id);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  selectCandidate(candidate.id);
                }}
                onDragStart={(event) => {
                  stageRef.current?.draggable(false);
                  selectCandidate(candidate.id);
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = 'grabbing';
                }}
                onDragMove={(event) =>
                  setDragCandidatePosition({
                    id: candidate.id,
                    x: event.target.x(),
                    y: event.target.y(),
                  })
                }
                onDragEnd={(event) => {
                  const resultNode = nodes.find(
                    (node) =>
                      node.type === 'candidate' &&
                      (node as CanvasNode & { candidateId: string }).candidateId === candidate.id,
                  );
                  if (resultNode)
                    updateNode(resultNode.id, {
                      x: event.target.x(),
                      y: event.target.y(),
                    });
                  commitCandidatePosition(boardId, candidate.id, {
                    x: event.target.x(),
                    y: event.target.y(),
                  });
                  setDragCandidatePosition(null);
                  stageRef.current?.draggable(interactionPolicy.stageDraggable);
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = 'default';
                }}
                onMouseEnter={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = 'grab';
                }}
                onMouseLeave={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = 'default';
                }}
              >
                <Rect
                  width={card.width}
                  height={card.height}
                  fill="#ffffff"
                  stroke={selected ? '#2563ff' : '#cfd8e3'}
                  strokeWidth={selected ? 2 : 1}
                  cornerRadius={7}
                  shadowBlur={7}
                  shadowColor="#111827"
                  shadowOffset={{ x: 0, y: 2 }}
                  shadowOpacity={0.06}
                />
                <Rect
                  x={8}
                  y={8}
                  width={card.width - 16}
                  height={card.height - 36}
                  fill="#f1f3f5"
                  cornerRadius={4}
                  listening={false}
                />
                <StaticPreview
                  url={candidate.previewUrl}
                  width={card.width - 16}
                  height={card.height - 36}
                  x={8}
                  y={8}
                />
                <Text
                  text={
                    candidate.view
                      ? translate(locale, `generation.view.${candidate.view}`)
                      : translate(locale, 'generation.candidateNumber', {
                          number: card.index + 1,
                        })
                  }
                  x={10}
                  y={card.height - 21}
                  width={card.width - 20}
                  fontSize={11}
                  fill="#374151"
                />
              </Group>
            );
          })}
          {positionedNodes
            .filter((node) =>
              ['reference', 'image', 'sketch', 'concept', 'variant', 'candidate'].includes(
                node.type,
              ),
            )
            .map((node) => (
              <Group
                key={`output-${node.id}`}
                listening={interactionPolicy.connectionsEnabled}
                x={node.x + node.width - 4}
                y={node.y + node.height / 2}
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  stageRef.current?.draggable(false);
                  setConnectionDraft({
                    sourceNodeId: node.id,
                    x: node.x + node.width - 4,
                    y: node.y + node.height / 2,
                  });
                }}
                onClick={(event) => {
                  event.cancelBubble = true;
                  if (node.type === 'candidate') selectCandidate(node.candidateId);
                  else select(node.id, false);
                }}
                onMouseEnter={(event) => {
                  setHoveredOutputId(node.id);
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = 'crosshair';
                }}
                onMouseLeave={(event) => {
                  setHoveredOutputId(null);
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = 'default';
                }}
              >
                <Circle radius={17} fill="#ffffff" opacity={0.001} />
                <Circle
                  radius={hoveredOutputId === node.id || selectedIds.includes(node.id) ? 7 : 5}
                  fill={connectionDraft?.sourceNodeId === node.id ? '#2563ff' : '#ffffff'}
                  stroke="#2563ff"
                  strokeWidth={1.5}
                  listening={false}
                />
              </Group>
            ))}
          {interactionPolicy.nodesDraggable ? (
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 80 || newBox.height < 48 ? oldBox : newBox
              }
            />
          ) : null}
        </Layer>
      </Stage>
      <nav className="canvas-viewport-controls" aria-label={translate(locale, 'canvas.navigation')}>
        <button
          type="button"
          aria-label={translate(locale, 'canvas.zoomOut')}
          disabled={
            Boolean(connectionDraft || dragPosition || dragCandidatePosition) ||
            viewport.zoom <= 0.1
          }
          onClick={() =>
            setViewport(
              zoomViewport(viewport, viewport.zoom / 1.2, {
                x: stageSize.width / 2,
                y: stageSize.height / 2,
              }),
            )
          }
        >
          −
        </button>
        <button
          type="button"
          aria-label={translate(locale, 'canvas.resetZoom')}
          title={translate(locale, 'canvas.resetZoom')}
          disabled={Boolean(connectionDraft || dragPosition || dragCandidatePosition)}
          onClick={() =>
            setViewport(
              zoomViewport(viewport, 1, { x: stageSize.width / 2, y: stageSize.height / 2 }),
            )
          }
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label={translate(locale, 'canvas.zoomIn')}
          disabled={
            Boolean(connectionDraft || dragPosition || dragCandidatePosition) || viewport.zoom >= 4
          }
          onClick={() =>
            setViewport(
              zoomViewport(viewport, viewport.zoom * 1.2, {
                x: stageSize.width / 2,
                y: stageSize.height / 2,
              }),
            )
          }
        >
          +
        </button>
        <button
          type="button"
          aria-label={translate(locale, 'canvas.fitAll')}
          disabled={
            Boolean(connectionDraft || dragPosition || dragCandidatePosition) ||
            !nodes.some((node) => !node.hidden)
          }
          onClick={() => {
            const fitted = fitCanvasViewport([...nodes, ...candidateOutputCards], stageSize);
            if (fitted) setViewport(fitted);
          }}
        >
          {translate(locale, 'canvas.fitAll')}
        </button>
      </nav>
      {generationRun && !connectionDraft
        ? positionedNodes
            .filter(
              (node): node is GenerationNode =>
                node.type === 'generation' &&
                selectedIds.length === 1 &&
                selectedIds[0] === node.id,
            )
            .map((node) => (
              <GenerationCardEditor
                key={node.id}
                node={node}
                viewport={{ ...viewport, ...(stageDragOffset ?? {}) }}
                locale={locale}
                busy={generationRun.busy}
                ready={generationRun.ready}
                providerName={generationRun.providerName}
                status={generationRun.status}
                onCommit={(direction) => updateNode(node.id, { direction })}
                onRun={(direction) => generationRun.onRun(node.id, direction)}
                interactive={effectiveInteractionMode === 'select'}
              />
            ))
        : null}
    </div>
  );
}
