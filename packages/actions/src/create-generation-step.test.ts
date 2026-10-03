import { expect, it, vi } from 'vitest';
import { createGenerationStepAction } from './index';
import type { BaseNode } from '@open-industrial-design/design-model';

const source: BaseNode = {
  id: 'source',
  type: 'image',
  boardId: 'board',
  x: 10,
  y: 20,
  width: 176,
  height: 140,
  rotation: 0,
  zIndex: 1,
  createdAt: 1,
  updatedAt: 1,
};
const context = {
  projectId: 'project',
  boardId: 'board',
  selectedNodeIds: ['source'],
  selectedDesignIds: [],
};
const input = { sourceNodeId: 'source', label: 'CMF', direction: 'Explore finishes' };

it('creates a manual step and main-image connection without modifying the source', async () => {
  let sequence = 0;
  const saveStep = vi.fn().mockResolvedValue(undefined);
  const action = createGenerationStepAction(
    () => `id-${++sequence}`,
    () => 20,
  );
  const result = await action.run(context, input, { nodes: [source], edges: [], saveStep });
  expect(result.node).toMatchObject({ x: 250, y: 20, direction: input.direction, count: 2 });
  expect(result.edge).toMatchObject({
    sourceNodeId: 'source',
    targetNodeId: result.node.id,
    inputRole: 'base',
  });
  expect(saveStep).toHaveBeenCalledExactlyOnceWith(result.node, result.edge);
  expect(source.x).toBe(10);
});

it('avoids occupied positions and rejects unsupported or stale sources before saving', async () => {
  const saveStep = vi.fn();
  const action = createGenerationStepAction();
  const occupied = { ...source, id: 'occupied', x: 250, width: 290, height: 300 };
  const result = await action.run(context, input, {
    nodes: [source, occupied],
    edges: [],
    saveStep,
  });
  expect(result.node.y).toBe(360);
  saveStep.mockClear();
  await expect(
    action.run(context, input, { nodes: [{ ...source, type: 'text' }], edges: [], saveStep }),
  ).rejects.toThrow(/visual source/);
  await expect(action.run(context, input, { nodes: [], edges: [], saveStep })).rejects.toThrow(
    /no longer/,
  );
  expect(saveStep).not.toHaveBeenCalled();
});

it('propagates persistence failure without reporting a created step', async () => {
  await expect(
    createGenerationStepAction().run(context, input, {
      nodes: [source],
      edges: [],
      saveStep: async () => {
        throw new Error('transaction failed');
      },
    }),
  ).rejects.toThrow('transaction failed');
});
