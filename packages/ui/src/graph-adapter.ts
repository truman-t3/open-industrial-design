import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';
import type {
  Design,
  DesignRelation,
  EdgeType,
  GraphViewState,
} from '@open-industrial-design/design-model';

export interface DesignGraphAdapterContext {
  graphViewState?: GraphViewState;
  selectedDesignId?: string;
}

export interface GraphDesignNodeData extends Record<string, unknown> {
  designId: string;
  name: string;
  kind: Design['kind'];
  status: Design['status'];
}

export interface GraphDesignEdgeData extends Record<string, unknown> {
  source: 'lineage' | 'semantic-relation';
  relationType?: EdgeType;
}

export type GraphDesignNode = FlowNode<GraphDesignNodeData, 'design'>;
export type GraphDesignEdge = FlowEdge<GraphDesignEdgeData>;

/**
 * Converts the authoritative Design domain to a disposable React Flow view model.
 * React Flow nodes and edges must never be written back as Design data.
 */
export interface GraphAdapter {
  toGraphNodes(designs: Design[], context: DesignGraphAdapterContext): GraphDesignNode[];
  toGraphEdges(designs: Design[], relations: DesignRelation[]): GraphDesignEdge[];
}

const semanticLabel = (type: EdgeType) => type.replaceAll('_', ' ');

export function toGraphNodes(
  designs: Design[],
  { graphViewState, selectedDesignId }: DesignGraphAdapterContext,
): GraphDesignNode[] {
  const positions = graphViewState?.positions ?? {};
  return designs.map((design, index) => ({
    id: design.id,
    type: 'design',
    position:
      positions[design.id] ??
      (design.parentDesignId ? { x: 360, y: index * 180 } : { x: 40, y: index * 180 }),
    selected: design.id === selectedDesignId,
    data: {
      designId: design.id,
      name: design.name,
      kind: design.kind,
      status: design.status,
    },
  }));
}

export function toGraphEdges(designs: Design[], relations: DesignRelation[]): GraphDesignEdge[] {
  const designIds = new Set(designs.map((design) => design.id));
  const lineageEdges = designs.flatMap((design) => {
    if (!design.parentDesignId || !designIds.has(design.parentDesignId)) return [];
    return [
      {
        id: `lineage:${design.parentDesignId}:${design.id}`,
        source: design.parentDesignId,
        target: design.id,
        type: 'smoothstep',
        label: 'variant lineage',
        data: { source: 'lineage' as const },
      },
    ];
  });
  const semanticEdges = relations.flatMap((relation) => {
    if (!designIds.has(relation.sourceDesignId) || !designIds.has(relation.targetDesignId))
      return [];
    return [
      {
        id: `relation:${relation.id}`,
        source: relation.sourceDesignId,
        target: relation.targetDesignId,
        type: 'smoothstep',
        label: semanticLabel(relation.type),
        data: { source: 'semantic-relation' as const, relationType: relation.type },
        style: { strokeDasharray: '5 4' },
      },
    ];
  });
  return [...lineageEdges, ...semanticEdges];
}

export const designGraphAdapter: GraphAdapter = { toGraphNodes, toGraphEdges };
