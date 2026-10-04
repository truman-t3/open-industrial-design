import { describe, it, expect } from 'vitest';
import { minimapBounds, centerMinimapNode } from './minimap';

describe('overview map', () => {
  it('centers rotated cards on their actual center without changing zoom', () => {
    const result = centerMinimapNode(
      { id: 'r', x: 200, y: 100, width: 100, height: 200, rotation: 90 },
      { x: 10, y: 20, zoom: 2 },
      { width: 800, height: 600 },
    );
    expect(result.x).toBeCloseTo(200);
    expect(result.y).toBeCloseTo(0);
    expect(result.zoom).toBe(2);
  });
  it('includes the viewport and remote rotated nodes without hidden nodes or mutations', () => {
    const nodes = [
      { id: 'a', x: -500, y: -300, width: 200, height: 100, rotation: 90 },
      { id: 'hidden', x: 90000, y: 90000, width: 100, height: 100, hidden: true },
    ];
    const before = JSON.stringify(nodes);
    const map = minimapBounds(nodes, { x: -200, y: 100, zoom: 0.5 }, { width: 800, height: 600 });
    expect(map.visible).toHaveLength(1);
    expect(map.x).toBeLessThanOrEqual(-600);
    expect(map.x + map.width).toBeGreaterThanOrEqual(2000);
    expect(map.width).toBeLessThan(3000);
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it('handles empty boards with a finite positive overview', () => {
    const map = minimapBounds([], { x: 0, y: 0, zoom: 1 }, { width: 0, height: 0 });
    expect(map.width).toBeGreaterThan(0);
    expect(map.height).toBeGreaterThan(0);
  });
});
