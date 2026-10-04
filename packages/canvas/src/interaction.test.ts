import { describe, expect, it } from 'vitest';
import type { BaseNode, Edge } from '@open-industrial-design/design-model';
import {
  canvasInteractionPolicy,
  designLineageNodes,
  findDesignCanvasNode,
  connectionCurve,
  connectionTargetAt,
  findFreeNodePosition,
  generationInputRoute,
  forwardOutputRoute,
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

it('keeps lineage on design cards when supporting CMF and view cards follow them', () => {
  const concept = { ...source, id: 'concept', type: 'concept', designId: 'd' } as BaseNode;
  const variant = { ...source, id: 'variant', type: 'variant', designId: 'v' } as BaseNode;
  const cmf = { ...concept, id: 'cmf', type: 'cmf' } as BaseNode;
  const views = { ...variant, id: 'views', type: 'viewset' } as BaseNode;
  const endpoints = designLineageNodes([concept, variant, cmf, views]);
  expect(endpoints.get('d')?.id).toBe('concept');
  expect(endpoints.get('v')?.id).toBe('variant');
  expect(designLineageNodes([cmf, views]).size).toBe(0);
});
it('opens visible design cards before supporting cards and never targets hidden nodes', () => {
  const concept = { ...source, id: 'concept', type: 'concept', designId: 'd' } as BaseNode;
  const cmf = { ...concept, id: 'cmf', type: 'cmf' } as BaseNode;
  const views = { ...concept, id: 'views', type: 'viewset' } as BaseNode;
  expect(findDesignCanvasNode([cmf, views, concept], 'd')).toBe(concept);
  expect(findDesignCanvasNode([cmf, { ...concept, hidden: true }], 'd')).toBe(cmf);
  expect(findDesignCanvasNode([cmf, views], 'd')).toBe(cmf);
  expect(findDesignCanvasNode([{ ...concept, hidden: true }], 'd')).toBeUndefined();
  expect(findDesignCanvasNode([concept], 'other')).toBeUndefined();
});
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

it('keeps short forward curves monotonic instead of looping past their endpoints', () => {
  expect(connectionCurve(224, 120, 256, 110)).toEqual([224, 120, 240, 120, 240, 110, 256, 110]);
});

it('keeps x and y paired when an output is dragged to the left of its step', () => {
  const step = { ...generation, x: 800, y: 300 };
  const result = { ...source, x: 200, y: 500 };
  const route = forwardOutputRoute(step, result, [step, result]);
  expect(route.points.slice(0, 2)).toEqual([796, 450]);
  expect(route.points.slice(-2)).toEqual([324, 540]);
  expect(route.points[2]).toBeLessThan(796);
  expect(route.points[4]).toBeGreaterThan(324);
});

it('routes distant outputs around a sibling card and recomputes after moving it', () => {
  const step = { ...generation, x: 0, y: 0, width: 220, height: 240 };
  const first = { ...source, id: 'first', x: 260, y: 0, width: 200, height: 220 };
  const last = { ...first, id: 'last', x: 490 };
  const route = forwardOutputRoute(step, last, [step, first, last]);
  expect(route.bezier).toBe(false);
  expect(route.points).toEqual([224, 120, 248, 120, 248, -24, 472, -24, 472, 110, 486, 110]);
  expect(forwardOutputRoute(step, last, [step, { ...first, y: 400 }, last]).bezier).toBe(true);
  expect(forwardOutputRoute(step, last, [step, { ...first, hidden: true }, last]).bezier).toBe(
    true,
  );
  expect(forwardOutputRoute(step, first, [step, first, last]).bezier).toBe(true);
  expect(
    forwardOutputRoute(step, last, [step, first, last, { ...first, id: 'other-row', y: -500 }]),
  ).toEqual(route);
});

describe('generation input routing', () => {
  const main = { x: 545, y: 210, width: 280, height: 300 };
  const scene = { x: 260, y: 720, width: 220, height: 240 };
  it('preserves the forward curve and input role ports', () => {
    expect(generationInputRoute(source, generation, 'reference')).toEqual({
      bezier: true,
      points: connectionCurve(116, 40, 296, 136),
    });
  });
  it('routes the demo reverse branch through the free vertical gap', () => {
    expect(generationInputRoute(main, scene, 'base')).toEqual({
      bezier: false,
      points: [821, 360, 857, 360, 857, 615, 228, 615, 228, 806, 256, 806],
    });
  });
  it('updates the corridor when dragging above the source or alongside it', () => {
    const above = generationInputRoute(main, { ...scene, y: -200 }, 'reference');
    expect(above.points[5]).toBe(125);
    expect(above.points.slice(-2)).toEqual([256, -84]);
    const alongside = generationInputRoute(main, { ...scene, y: 220 }, 'base');
    expect(alongside.points[5]).toBe(178);
    expect(alongside.points.slice(-2)).toEqual([256, 306]);
  });
});

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

  it('does not expose image drop targets on text-only tasks', () => {
    const textTask = { ...generation, textOnly: true };
    expect(connectionTargetAt([source, textTask], [], source.id, 360, 180, 1)).toBeUndefined();
    expect(connectionTargetAt([source, textTask], [], source.id, 305, 106, 1)).toBeUndefined();
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
