import type { CanvasNode } from '@open-industrial-design/canvas';

/** Canvas undo owns placement, not revisions of the shared sketch document. */
export function refreshSketchPreview(
  nodes: CanvasNode[],
  documentId: string,
  previewAssetId: string,
  updatedAt: number,
): CanvasNode[] {
  const sketches = new Set(
    nodes
      .filter(
        (node) =>
          node.type === 'sketch' &&
          'sketchDocumentId' in node &&
          node.sketchDocumentId === documentId,
      )
      .map((node) => node.id),
  );
  return nodes.map((node) => {
    if (sketches.has(node.id)) return { ...node, previewAssetId, updatedAt };
    if (
      node.type === 'generation' &&
      node.editRegion &&
      sketches.has(node.editRegion.sourceNodeId) &&
      node.editRegion.sourceAssetId !== previewAssetId
    )
      return { ...node, editRegion: undefined };
    return node;
  });
}
