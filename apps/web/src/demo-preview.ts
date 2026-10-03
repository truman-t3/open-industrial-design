import type { CanvasNode } from '@open-industrial-design/canvas';

const demoPreviewIds = {
  'reference-1': { field: 'assetId', id: 'demo-lamp-reference' },
  'sketch-1': { field: 'previewAssetId', id: 'demo-lamp-sketch' },
  'image-1': { field: 'previewAssetId', id: 'demo-lamp-concept' },
  'image-variant-1': { field: 'previewAssetId', id: 'demo-lamp-variant' },
  'review-render-1': { field: 'assetId', id: 'demo-lamp-concept' },
} as const;

/** Restore only missing media pointers in older copies of the bundled demo. */
export function restoreDemoPreviewIds(nodes: CanvasNode[]): CanvasNode[] {
  let changed = false;
  const restored = nodes.map((node) => {
    if (node.type === 'text' || node.type === 'generation' || node.type === 'candidate')
      return node;
    const preview = demoPreviewIds[node.id as keyof typeof demoPreviewIds];
    if (!preview || node[preview.field]) return node;
    changed = true;
    return { ...node, [preview.field]: preview.id };
  });
  return changed ? restored : nodes;
}
