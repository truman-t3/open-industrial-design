import { expect, it, vi } from 'vitest';
import {
  createGenerationStepAction,
  createExplorationBatchAction,
  createPlaceMaterialAction,
  createSaveMaterialKnowledgeAction,
  ActionRegistry,
  ActionRunner,
} from './index';
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
it('continues a selected image as a manual multi-view step with matching count and main edge', async () => {
  const action = createGenerationStepAction();
  const saveStep = vi.fn(async () => {});
  const views: NonNullable<
    import('./create-generation-step').CreateGenerationStepInput['requestedViews']
  > = ['front', 'side'];
  const operation = { ...input, requestedViews: views };
  expect(action.validate(context, operation).ok).toBe(true);
  const result = await action.run(context, operation, { nodes: [source], edges: [], saveStep });
  expect(result.node.requestedViews).toEqual(views);
  expect(result.node.requestedViews).not.toBe(views);
  expect(result.node.count).toBe(2);
  expect(result.edge).toMatchObject({
    sourceNodeId: source.id,
    targetNodeId: result.node.id,
    inputRole: 'base',
  });
  expect(saveStep).toHaveBeenCalledOnce();
  for (const invalid of [
    { ...operation, requestedViews: [] },
    { ...operation, requestedViews: ['front', 'front'] },
    { ...operation, localEdit: true },
    { ...operation, removeBackground: true },
  ]) {
    const typed = invalid as typeof operation;
    expect(action.validate(context, typed).ok).toBe(false);
    await expect(
      action.run(context, typed, { nodes: [source], edges: [], saveStep }),
    ).rejects.toThrow('Invalid multi-view');
  }
  expect(saveStep).toHaveBeenCalledOnce();
});
it('copies the shared series brief into each independent task and rejects oversized plans', async () => {
  const action = createExplorationBatchAction();
  const batch = {
    sourceNodeIds: ['source'],
    sharedBrief: '  Preserve rounded edges and ceramic finish.  ',
    directions: [
      { label: 'Desk lamp', direction: 'Add a stable desk base.' },
      { label: 'Wall lamp', direction: 'Use a wall mount without a desk base.' },
    ],
    count: 1,
  };
  const saveBatch = vi.fn();
  const result = await action.run(context, batch, { nodes: [source], edges: [], saveBatch });
  expect(result.steps.map((step) => step.node.direction)).toEqual(
    batch.directions.map((item) => `${batch.sharedBrief.trim()}\n\n${item.direction}`),
  );
  expect(new Set(result.steps.map((step) => step.node.id)).size).toBe(2);
  expect(saveBatch).toHaveBeenCalledTimes(1);
  for (const patch of [
    { sharedBrief: 42 },
    { sharedBrief: 'x'.repeat(4001) },
    { sharedBrief: 'x'.repeat(4000), directions: [{ label: 'Long', direction: 'y'.repeat(6000) }] },
  ]) {
    const invalid = { ...batch, ...patch } as unknown as typeof batch;
    expect(action.validate(context, invalid).ok).toBe(false);
    await expect(
      action.run(context, invalid, { nodes: [source], edges: [], saveBatch }),
    ).rejects.toThrow();
  }
  expect(saveBatch).toHaveBeenCalledTimes(1);
});

it('reports a serializable success after knowledge persistence and preserves failure status', async () => {
  const registry = new ActionRegistry();
  registry.register(createSaveMaterialKnowledgeAction());
  const runner = new ActionRunner(registry);
  const knowledge = { notes: 'Grip', tags: ['CMF'], sourceUrl: '' };
  const save = vi.fn(async () => undefined);
  const request = {
    actionId: 'workspace.saveMaterialKnowledge',
    context,
    input: { assetId: 'asset', knowledge },
    runtime: { save },
  };
  expect(await runner.run(request)).toMatchObject({ status: 'success', result: { saved: true } });
  expect(save).toHaveBeenCalledExactlyOnceWith('project', 'asset', knowledge);
  save.mockRejectedValueOnce(new Error('Storage failed'));
  expect(await runner.run(request)).toMatchObject({ status: 'failed' });
});
it('places a material through its repository runtime without generating or creating a Design', async () => {
  const action = createPlaceMaterialAction(
    () => 'placed',
    () => 10,
  );
  const place = vi.fn(async (_project, _asset, node) => ({ node, asset: { id: 'asset' } }));
  const material = { assetId: 'asset', name: ' Lamp ', x: 20, y: 30 };
  const result = await action.run(context, material, { place } as never);
  expect(place).toHaveBeenCalledExactlyOnceWith(
    'project',
    'asset',
    expect.objectContaining({
      id: 'placed',
      type: 'reference',
      boardId: 'board',
      label: 'Lamp',
      x: 20,
      y: 30,
    }),
  );
  expect(result.node).not.toHaveProperty('designId');
  for (const invalid of [
    { ...material, x: NaN },
    { ...material, name: '' },
  ]) {
    expect(action.validate(context, invalid).ok).toBe(false);
    await expect(action.run(context, invalid, { place } as never)).rejects.toThrow();
  }
  expect(place).toHaveBeenCalledTimes(1);
});

it('prepares the source-direction matrix once without changing sources or running a model', async () => {
  const action = createExplorationBatchAction();
  const sources = [source, { ...source, id: 'second', y: 300 }];
  const batch = {
    sourceNodeIds: sources.map((item) => item.id),
    directions: [
      { label: 'Warm', direction: 'Warm metal' },
      { label: 'Cool', direction: 'Cool ceramic' },
    ],
    count: 3,
  };
  expect(action.validate(context, batch).ok).toBe(true);
  const saveBatch = vi.fn();
  const { steps } = await action.run(context, batch, { nodes: sources, edges: [], saveBatch });
  expect(
    steps.map((step) => [step.edge.sourceNodeId, step.node.direction, step.node.count]),
  ).toEqual([
    ['source', 'Warm metal', 3],
    ['source', 'Cool ceramic', 3],
    ['second', 'Warm metal', 3],
    ['second', 'Cool ceramic', 3],
  ]);
  expect(saveBatch).toHaveBeenCalledExactlyOnceWith(steps);
  expect(new Set(steps.map((step) => step.node.id)).size).toBe(4);
  for (const [index, step] of steps.entries())
    for (const other of steps.slice(index + 1))
      expect(
        step.node.x < other.node.x + other.node.width &&
          step.node.x + step.node.width > other.node.x &&
          step.node.y < other.node.y + other.node.height &&
          step.node.y + step.node.height > other.node.y,
      ).toBe(false);
  expect(sources[0]).toEqual(source);
  for (const patch of [
    { sourceNodeIds: [] },
    { sourceNodeIds: ['source', 'source'] },
    { count: 5 },
    { directions: [] },
    { directions: [{ label: '', direction: 'x' }] },
  ])
    expect(action.validate(context, { ...batch, ...patch }).ok).toBe(false);
  saveBatch.mockClear();
  await expect(
    action.run(
      context,
      { ...batch, sourceNodeIds: ['source', 'missing'] },
      { nodes: sources, edges: [], saveBatch },
    ),
  ).rejects.toThrow('no longer');
  expect(saveBatch).not.toHaveBeenCalled();
});

it('creates a manual pattern transfer draft and rejects mixed operations', async () => {
  const action = createGenerationStepAction();
  const patternTask = { kind: 'transfer', placement: '', scale: 'medium' } as const;
  const task = { ...input, patternTask };
  expect(action.validate(context, task)).toMatchObject({ ok: true });
  expect(action.validate(context, { ...task, localEdit: true })).toMatchObject({ ok: false });
  const saveStep = vi.fn();
  const result = await action.run(context, task, { nodes: [source], edges: [], saveStep });
  expect(result.node.patternTask).toEqual(patternTask);
  expect(result.node.textOnly).toBeUndefined();
  expect(result.edge.inputRole).toBe('base');
  expect(saveStep).toHaveBeenCalledExactlyOnceWith(result.node, result.edge);
});

it('connects every shared reference to each batch task and rejects invalid plans before saving', async () => {
  const action = createExplorationBatchAction();
  const references = ['r1', 'r2', 'r3', 'r4'].map((id) => ({ ...source, id }));
  const batch = {
    sourceNodeIds: ['source'],
    referenceNodeIds: references.map((node) => node.id),
    directions: [
      { label: 'CMF', direction: 'Apply material references' },
      { label: 'Form', direction: 'Explore form' },
    ],
    count: 1,
  };
  const saveBatch = vi.fn();
  const runtime = { nodes: [source, ...references], edges: [], saveBatch };
  const { steps } = await action.run(context, batch, runtime);
  for (const step of steps) {
    expect(step.referenceEdges?.map((edge) => edge.sourceNodeId)).toEqual(batch.referenceNodeIds);
    expect(
      step.referenceEdges?.every(
        (edge) => edge.inputRole === 'reference' && edge.targetNodeId === step.node.id,
      ),
    ).toBe(true);
  }
  expect(
    new Set(steps.flatMap((step) => [step.edge, ...step.referenceEdges!]).map((edge) => edge.id))
      .size,
  ).toBe(10);
  for (const ids of [['source'], ['r1', 'r1'], ['r1', 'r2', 'r3', 'r4', 'r5']])
    expect(action.validate(context, { ...batch, referenceNodeIds: ids }).ok).toBe(false);
  saveBatch.mockClear();
  await expect(
    action.run(context, { ...batch, referenceNodeIds: ['missing'] }, runtime),
  ).rejects.toThrow();
  expect(saveBatch).not.toHaveBeenCalled();
});

it('creates an editable local CMF step without executing a model', async () => {
  const action = createGenerationStepAction();
  const cmf = { ...input, localEdit: true, localCmf: { color: '', material: '', finish: '' } };
  expect(action.validate(context, cmf)).toMatchObject({ ok: true });
  expect(action.validate(context, { ...cmf, localEdit: false })).toMatchObject({ ok: false });
  expect(action.validate(context, { ...cmf, localEditMode: 'erase' })).toMatchObject({ ok: false });
  const result = await action.run(context, cmf, { nodes: [source], edges: [], saveStep: vi.fn() });
  expect(result.node.localCmf).toEqual(cmf.localCmf);
  expect(result.node.localEdit).toBe(true);
});

it('creates a persisted eraser operation only with local editing enabled', async () => {
  const action = createGenerationStepAction();
  const erase = { ...input, localEdit: true, localEditMode: 'erase' as const };
  expect(action.validate(context, erase)).toMatchObject({ ok: true });
  expect(action.validate(context, { ...erase, localEdit: false })).toMatchObject({ ok: false });
  const result = await action.run(context, erase, {
    nodes: [source],
    edges: [],
    saveStep: vi.fn(),
  });
  expect(result.node).toMatchObject({ localEdit: true, localEditMode: 'erase' });
});

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
