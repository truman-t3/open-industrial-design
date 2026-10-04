import { describe, expect, it } from 'vitest';
import {
  createCanvasGroup,
  moveCanvasNode,
  reconcileCanvasGroups,
  validateCanvasGroups,
} from './groups';
import type { BaseNode, GroupNode } from './index';

const cards: BaseNode[] = ['a', 'b'].map((id, i) => ({
  id,
  boardId: 'board',
  type: 'image',
  x: i * 200,
  y: 100,
  width: 100,
  height: 100,
  rotation: 0,
  zIndex: i,
  createdAt: 1,
  updatedAt: 1,
}));
const group = () => createCanvasGroup(cards, ['a', 'b'], 'g', 'Group', 2);
describe('Canvas groups', () => {
  it('moves members in world coordinates without changing identity or source data', () => {
    const frame = group();
    const before = [...cards, frame];
    const after = moveCanvasNode(before, frame.id, frame.x + 80, frame.y - 40);
    expect(after.slice(0, 2)).toEqual(
      cards.map((node) => ({ ...node, x: node.x + 80, y: node.y - 40 })),
    );
    expect(before[0].x).toBe(0);
    expect(() => validateCanvasGroups(after)).not.toThrow();
  });
  it('keeps members independently movable and refits frames after deletion', () => {
    const moved = moveCanvasNode([...cards, group()], 'a', -300, 200);
    expect(moved[1]).toEqual(cards[1]);
    const remaining = reconcileCanvasGroups(moved.filter((node) => node.id !== 'b'));
    expect((remaining[1] as GroupNode).childNodeIds).toEqual(['a']);
    expect(remaining[1].x).toBe(-320);
  });
  it('rejects invalid endpoints, nesting, duplicate membership and cross-board membership', () => {
    for (const childNodeIds of [['missing'], ['g'], ['a', 'a']])
      expect(() =>
        validateCanvasGroups([...cards, { ...group(), childNodeIds } as GroupNode]),
      ).toThrow();
    expect(() =>
      validateCanvasGroups([{ ...cards[0], boardId: 'other' }, cards[1], group()]),
    ).toThrow();
    expect(() => validateCanvasGroups([...cards, group(), { ...group(), id: 'g2' }])).toThrow();
    expect(() => createCanvasGroup([...cards, group()], ['a', 'b'], 'g2', '', 2)).toThrow();
  });
  it('does not move locked members through group dragging', () => {
    const before = [{ ...cards[0], locked: true }, cards[1], group()];
    expect(moveCanvasNode(before, 'g', 800, 900)).toBe(before);
  });
});
