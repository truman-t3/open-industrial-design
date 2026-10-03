import { describe, expect, it } from 'vitest';
import { fitCanvasViewport, zoomViewport } from './viewport';

describe('Canvas view-only navigation', () => {
  it('keeps the same world point under the zoom anchor and clamps to wheel limits', () => {
    const before = { x: -70, y: 80, zoom: 0.5 };
    const anchor = { x: 400, y: 300 };
    for (const requested of [0.01, 1, 20]) {
      const after = zoomViewport(before, requested, anchor);
      expect((anchor.x - after.x) / after.zoom).toBeCloseTo((anchor.x - before.x) / before.zoom);
      expect((anchor.y - after.y) / after.zoom).toBeCloseTo((anchor.y - before.y) / before.zoom);
      expect(after.zoom).toBeGreaterThanOrEqual(0.1);
      expect(after.zoom).toBeLessThanOrEqual(4);
    }
  });
  it('frames negative coordinates and remote results without mutating cards', () => {
    const nodes = [
      { x: -200, y: -80, width: 180, height: 160 },
      { x: 1600, y: 900, width: 220, height: 200 },
    ];
    const original = JSON.stringify(nodes);
    const view = fitCanvasViewport(nodes, { width: 840, height: 590 })!;
    for (const node of nodes) {
      expect(node.x * view.zoom + view.x).toBeGreaterThanOrEqual(32);
      expect(node.y * view.zoom + view.y).toBeGreaterThanOrEqual(56);
      expect((node.x + node.width) * view.zoom + view.x).toBeLessThanOrEqual(808);
      expect((node.y + node.height) * view.zoom + view.y).toBeLessThanOrEqual(534);
    }
    expect(JSON.stringify(nodes)).toBe(original);
  });
  it('ignores hidden cards, handles rotated cards and leaves empty boards unchanged', () => {
    const node = { x: 100, y: 100, width: 200, height: 100, rotation: 90 };
    expect(
      fitCanvasViewport([node, { ...node, x: 99999, hidden: true }], { width: 840, height: 590 }),
    ).toEqual(fitCanvasViewport([node], { width: 840, height: 590 }));
    expect(fitCanvasViewport([], { width: 840, height: 590 })).toBeUndefined();
    expect(fitCanvasViewport([node], { width: 0, height: 0 })).toBeUndefined();
  });
});
