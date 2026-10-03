import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type NodeProps,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { Design, DesignRelation, GraphViewState } from '@open-industrial-design/design-model';
import {
  translateDemoLabel,
  translateDesignKind,
  translateDesignStatus,
  translateGraphRelation,
} from '@open-industrial-design/core';
import {
  toGraphEdges,
  toGraphNodes,
  type GraphDesignEdge,
  type GraphDesignNode,
  type GraphDesignNodeData,
} from './graph-adapter';
import { useLocalization } from './localization';

export interface DesignGraphWorkspaceProps {
  projectId: string;
  designs: Design[];
  relations: DesignRelation[];
  graphViewState?: GraphViewState;
  selectedDesignId?: string;
  onSelectDesign: (designId: string) => void;
  onGraphViewStateChange: (state: GraphViewState) => void;
}

const DesignGraphActionContext = createContext<(designId: string) => void>(() => undefined);

function DesignGraphCard({ data, selected }: NodeProps<GraphDesignNode>) {
  const { locale } = useLocalization();
  const graphData = data as GraphDesignNodeData;
  const openDesign = useContext(DesignGraphActionContext);
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <button
        className={
          selected
            ? 'design-graph-card design-graph-card--selected nodrag'
            : 'design-graph-card nodrag'
        }
        onClick={() => openDesign(graphData.designId)}
        onPointerDown={(event) => {
          event.stopPropagation();
          openDesign(graphData.designId);
        }}
        type="button"
      >
        <span className="design-graph-card__kind">
          {translateDesignKind(locale, graphData.kind)}
        </span>
        <strong>{translateDemoLabel(locale, graphData.name)}</strong>
        <span className="design-graph-card__status">
          {translateDesignStatus(locale, graphData.status)}
        </span>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ opacity: 0 }}
      />
    </>
  );
}

const nodeTypes: NodeTypes = { design: DesignGraphCard };

export function DesignGraphWorkspace({
  projectId,
  designs,
  relations,
  graphViewState,
  selectedDesignId,
  onSelectDesign,
  onGraphViewStateChange,
}: DesignGraphWorkspaceProps) {
  const { locale, t } = useLocalization();
  const graphNodes = useMemo(
    () => toGraphNodes(designs, { graphViewState, selectedDesignId }),
    [designs, graphViewState, selectedDesignId],
  );
  const graphEdges = useMemo(
    () =>
      toGraphEdges(designs, relations).map((edge) => ({
        ...edge,
        label:
          edge.data?.source === 'lineage'
            ? t('graph.lineage')
            : translateGraphRelation(locale, edge.data?.relationType ?? 'related_to'),
      })),
    [designs, relations, locale, t],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphDesignNode>(graphNodes);
  const viewport = useRef<Viewport>({
    x: graphViewState?.x ?? 0,
    y: graphViewState?.y ?? 0,
    zoom: graphViewState?.zoom ?? 1,
  });

  useEffect(() => setNodes(graphNodes), [graphNodes, setNodes]);

  const persist = useCallback(
    (nextNodes: GraphDesignNode[], nextViewport = viewport.current) => {
      onGraphViewStateChange({
        projectId,
        positions: Object.fromEntries(
          nextNodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
        ),
        x: nextViewport.x,
        y: nextViewport.y,
        zoom: nextViewport.zoom,
      });
    },
    [onGraphViewStateChange, projectId],
  );

  return (
    <DesignGraphActionContext.Provider value={onSelectDesign}>
      <section className="design-graph" aria-label={t('inspector.lineage')}>
        <ReactFlow<GraphDesignNode, GraphDesignEdge>
          defaultViewport={viewport.current}
          edges={graphEdges}
          fitView={!graphViewState?.zoom}
          fitViewOptions={{ padding: 0.25 }}
          nodes={nodes}
          nodeTypes={nodeTypes}
          onMoveEnd={(_, nextViewport) => {
            viewport.current = nextViewport;
            persist(nodes, nextViewport);
          }}
          onNodeDragStop={(_, __, nextNodes) => persist(nextNodes)}
          onNodesChange={onNodesChange}
        >
          <Background color="#343a36" gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </section>
    </DesignGraphActionContext.Provider>
  );
}
