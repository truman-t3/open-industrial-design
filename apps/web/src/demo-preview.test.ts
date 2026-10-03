import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@open-industrial-design/canvas';
import { restoreDemoPreviewIds } from './demo-preview';

const node = (id: string, type: CanvasNode['type'] = 'reference') =>
  ({ id, type, label: id }) as CanvasNode;

describe('demo preview recovery', () => {
  it('adds missing image pointers without changing existing content or other projects', () => {
    const oldDemo = [
      node('reference-1'),
      node('sketch-1', 'sketch'),
      node('image-1', 'concept'),
      node('image-variant-1', 'variant'),
      node('unrelated-node'),
    ];
    const restored = restoreDemoPreviewIds(oldDemo);
    expect(restored.map((item) => ('assetId' in item ? item.assetId : undefined))).toEqual([
      'demo-lamp-reference',
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(restored[1]).toMatchObject({ previewAssetId: 'demo-lamp-sketch' });
    expect(restored[2]).toMatchObject({ previewAssetId: 'demo-lamp-concept' });
    expect(restored[3]).toMatchObject({ previewAssetId: 'demo-lamp-variant' });
    expect(restored[4]).toBe(oldDemo[4]);
  });

  it('does not replace an existing preview', () => {
    const nodes = [{ ...node('sketch-1', 'sketch'), previewAssetId: 'user-preview' }];
    expect(restoreDemoPreviewIds(nodes)).toBe(nodes);
  });
});
