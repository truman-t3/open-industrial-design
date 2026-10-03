import { describe, expect, it } from 'vitest';
import type { BaseNode, Edge } from '@open-industrial-design/design-model';
import {
  canvasInteractionPolicy,
  connectionCurve,
  connectionTargetAt,
  findFreeNodePosition,
  layoutGenerationCandidateOutputs,
  verticalConnectionCurve,
} from './interaction';

const source = {
  id: 'source',
  boardId: 'board',
  type: 'reference',
  x: 0,
  y: 0,
  width: 120,
  height: 80,
} as BaseNode;
const generation = {
  id: 'generation',
  boardId: 'board',
  type: 'generation',
  x: 300,
  y: 20,
  width: 290,
  height: 300,
} as BaseNode;
const nodes = [source, generation];

describe('new node placement', () => {
  const rect = { x: 160, y: 180, width: 320, height: 240 };
  it('keeps an unoccupied insertion point', () => {
    expect(findFreeNodePosition([], rect)).toEqual({ x: 160, y: 180 });
  });
  it('skips successive collisions and preserves existing positions', () => {
    const occupied = [rect, { ...rect, y: 450 }];
    const before = structuredClone(occupied);
    expect(findFreeNodePosition(occupied, rect)).toEqual({ x: 160, y: 722 });
    expect(occupied).toEqual(before);
  });
  it('places consecutive sketches and models with spacing, ignoring distant columns', () => {
    const occupied = [{ ...rect, x: 900, height: 2000 }, rect];
    const model = { ...rect, height: 220, ...findFreeNodePosition(occupied, rect) };
    expect(model.y).toBe(452);
    expect(findFreeNodePosition([...occupied, model], rect).y).toBe(704);
  });
});

describe('canvas connection interaction', () => {
  it('separates object selection from canvas panning', () => {
    expect(canvasInteractionPolicy('select')).toEqual({
      stageDraggable: false,
      nodesDraggable: true,
      connectionsEnabled: true,
    });
    expect(canvasInteractionPolicy('pan')).toEqual({
      stageDraggable: true,
      nodesDraggable: false,
      connectionsEnabled: false,
    });
  });

  it('accepts a drop on the card as the first main input', () => {
    expect(connectionTargetAt(nodes, [], source.id, 360, 180, 1)).toEqual({
      nodeId: generation.id,
      role: 'base',
      valid: true,
    });
  });

  it('uses a reference slot after the main image and preserves explicit port choice', () => {
    const edges = [
      {
        type: 'generation_input',
        sourceNodeId: 'other',
        targetNodeId: generation.id,
        inputRole: 'base',
      },
    ] as Edge[];
    expect(connectionTargetAt(nodes, edges, source.id, 360, 180, 1)?.role).toBe('reference');
    expect(connectionTargetAt(nodes, edges, source.id, 305, 106, 1)).toEqual({
      nodeId: generation.id,
      role: 'base',
      valid: false,
    });
  });

  it('does not connect an unrelated canvas drop or a duplicate source', () => {
    expect(connectionTargetAt(nodes, [], source.id, 200, 180, 1)).toBeUndefined();
    const edges = [
      {
        type: 'generation_input',
        sourceNodeId: source.id,
        targetNodeId: generation.id,
        inputRole: 'base',
      },
    ] as Edge[];
    expect(connectionTargetAt(nodes, edges, source.id, 360, 180, 1)?.valid).toBe(false);
  });

  it('uses smooth four-point cubic geometry', () => {
    expect(connectionCurve(100, 50, 300, 150)).toEqual([100, 50, 190, 50, 210, 150, 300, 150]);
    expect(verticalConnectionCurve(100, 50, 200, 250)).toEqual([
      100, 50, 100, 140, 200, 160, 200, 250,
    ]);
  });

  it('lays candidate result previews beside their task without covering existing nodes', () => {
    const existingOutput = {
      ...source,
      id: 'existing-output',
      x: 646,
      y: 20,
      width: 180,
      height: 140,
    } as BaseNode;
    const positions = layoutGenerationCandidateOutputs(
      [generation, existingOutput],
      [
        { id: 'candidate-1', generationNodeId: generation.id },
        { id: 'candidate-2', generationNodeId: generation.id },
      ],
    );
    expect(positions).toHaveLength(2);
    for (const position of positions) {
      const overlapsExistingOutput =
        position.x < existingOutput.x + existingOutput.width + 16 &&
        position.x + position.width + 16 > existingOutput.x &&
        position.y < existingOutput.y + existingOutput.height + 16 &&
        position.y + position.height + 16 > existingOutput.y;
      expect(overlapsExistingOutput).toBe(false);
    }
    expect(positions[0]?.x).toBe(positions[1]?.x);
    expect(positions[0]?.y).not.toBe(positions[1]?.y);
  });
});
