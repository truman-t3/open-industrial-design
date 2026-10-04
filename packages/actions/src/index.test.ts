import { describe, expect, it, vi } from 'vitest';
import {
  CapabilityRouter,
  InMemoryProviderCredentialStore,
  ProviderRegistry,
  createTestProvider,
  type ProviderConfig,
} from '@open-industrial-design/ai-core';
import type { Design } from '@open-industrial-design/design-model';
import {
  ActionRegistry,
  ActionRunner,
  CandidateTray,
  createSaveDesignDnaAction,
  createAIAnalyzeDesignAction,
  createAIAnalyzeMaterialsAction,
  type AnalyzeMaterialsRuntime,
  createAIGenerateVariantAction,
  createAITextGenerateAction,
  createKeepCandidateAction,
  createVariantAction,
  createWorkspaceActions,
  createSaveTextNodeAction,
  createImportImageAction,
  createResearchCommandAction,
  type ActionContext,
} from './index';

it('organizes user research through actions while preserving shared entries and source records', async () => {
  const context = { projectId: 'p', boardId: 'b', selectedDesignIds: [], selectedNodeIds: [] };
  let library: import('@open-industrial-design/design-model').ResearchLibrary | undefined;
  let sequence = 0;
  const action = createResearchCommandAction(
    () => `research-${++sequence}`,
    () => 10,
  );
  const save = vi.fn(async (_projectId: string, next: NonNullable<typeof library>) => {
    library = structuredClone(next);
  });
  const runtime = {
    loadProject: async () => ({
      id: 'p',
      name: 'Project',
      schemaVersion: 9 as const,
      createdAt: 1,
      updatedAt: 1,
      boardIds: [],
      settings: {},
      researchLibrary: library,
    }),
    loadAssets: vi.fn(async () => []),
    save,
  };
  const entry = {
    title: 'Competitor study',
    notes: 'User observation',
    tags: [],
    sourceUrl: 'https://example.com/lamp',
  };
  const run = (command: import('./index').ResearchCommand) =>
    action.run(context, { command, expected: library }, runtime);
  const created = await run({ kind: 'save-entry', entry });
  const first = await run({ kind: 'save-collection', name: 'Inspiration', entryIds: [created.id] });
  await run({ kind: 'save-collection', name: 'Competitors', entryIds: [created.id] });
  expect(library?.collections).toHaveLength(2);
  const before = structuredClone(library);
  await run({ kind: 'save-entry', id: created.id, entry: { ...entry, title: 'Updated title' } });
  expect(library?.entries[0]?.createdAt).toBe(10);
  expect(before?.entries[0]?.title).toBe('Competitor study');
  const calls = save.mock.calls.length;
  const collision = createResearchCommandAction(
    () => created.id,
    () => 10,
  );
  await expect(
    collision.run(context, { command: { kind: 'save-entry', entry }, expected: library }, runtime),
  ).rejects.toThrow('identity');
  await expect(
    action.run(
      context,
      { command: { kind: 'delete-entry', id: created.id }, expected: before },
      runtime,
    ),
  ).rejects.toThrow('changed');
  await expect(
    run({ kind: 'save-collection', name: 'Bad', entryIds: ['missing'] }),
  ).rejects.toThrow('Invalid');
  await expect(
    run({ kind: 'save-entry', entry: { ...entry, assetId: 'foreign' } }),
  ).rejects.toThrow('Invalid');
  await expect(run({ kind: 'save-entry', id: 'missing', entry })).rejects.toThrow('missing');
  expect(save).toHaveBeenCalledTimes(calls);
  await run({ kind: 'delete-collection', id: first.id });
  expect(library?.entries).toHaveLength(1);
  expect(library?.collections).toHaveLength(1);
  await run({ kind: 'delete-entry', id: created.id });
  expect(library?.entries).toEqual([]);
  expect(library?.collections[0]?.entryIds).toEqual([]);
  const preserved = structuredClone(library);
  save.mockRejectedValueOnce(new Error('disk failed'));
  await expect(run({ kind: 'save-entry', entry })).rejects.toThrow('disk failed');
  expect(library).toEqual(preserved);
});

it('keeps image bytes outside action history and rejects invalid image metadata', async () => {
  const context = { projectId: 'p', boardId: 'b', selectedDesignIds: [], selectedNodeIds: [] };
  const blob = new Blob(['local-image'], { type: 'image/png' });
  const action = createImportImageAction();
  const input = {
    name: 'Lamp.png',
    kind: 'image' as const,
    mimeType: 'image/png',
    size: blob.size,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
  };
  const save = vi.fn().mockResolvedValue(undefined);
  const registry = new ActionRegistry();
  registry.register(action);
  const record = await new ActionRunner(registry).run({
    actionId: action.descriptor.id,
    context,
    input,
    runtime: { blob, save },
  });
  expect(record.status).toBe('success');
  expect(save).toHaveBeenCalledOnce();
  expect(JSON.stringify(record)).not.toContain('local-image');
  for (const invalid of [
    { size: 0 },
    { mimeType: 'image/svg+xml' },
    { width: 0 },
    { height: 400_000 },
    { x: NaN },
    { name: '' },
  ])
    expect(action.validate(context, { ...input, ...invalid }).ok).toBe(false);
  await expect(
    action.run(context, { ...input, size: blob.size + 1 }, { blob, save }),
  ).rejects.toThrow('Invalid');
  expect(save).toHaveBeenCalledOnce();
});

describe('local canvas notes', () => {
  const context = { projectId: 'p', boardId: 'b', selectedDesignIds: [], selectedNodeIds: [] };
  it('creates and edits text without losing geometry or identity', async () => {
    const action = createSaveTextNodeAction(
      () => 'note',
      () => 50,
    );
    const commitText = vi.fn();
    const runtime = { readNode: vi.fn(), commitText };
    const node = await action.run(
      context,
      { text: '灯具观察\n保留提手', fontSize: 20, x: 10, y: 30 },
      runtime,
    );
    expect(node).toMatchObject({
      id: 'note',
      type: 'text',
      boardId: 'b',
      width: 320,
      x: 10,
      text: '灯具观察\n保留提手',
    });
    runtime.readNode.mockReturnValue({ ...node, x: 400, width: 500 });
    const edited = await action.run(
      context,
      { nodeId: 'note', text: '新版备注', fontSize: 24 },
      runtime,
    );
    expect(edited).toMatchObject({
      id: 'note',
      x: 400,
      width: 500,
      text: '新版备注',
      fontSize: 24,
      createdAt: 50,
    });
    expect(commitText).toHaveBeenCalledTimes(2);
    for (const change of [{ locked: true }, { boardId: 'other' }, { type: 'image' }]) {
      runtime.readNode.mockReturnValue({ ...node, ...change });
      await expect(
        action.run(context, { nodeId: 'note', text: 'x', fontSize: 20 }, runtime),
      ).rejects.toThrow('unavailable');
    }
    expect(commitText).toHaveBeenCalledTimes(2);
    for (const invalid of [
      { text: ' ' },
      { text: 'x'.repeat(8001) },
      { fontSize: NaN },
      { fontSize: 73 },
      { x: Infinity },
    ]) {
      expect(action.validate(context, { text: 'x', fontSize: 20, x: 0, y: 0, ...invalid }).ok).toBe(
        false,
      );
    }
  });
});

describe('save design constraints', () => {
  const context = { projectId: 'p', boardId: 'b', selectedDesignIds: [], selectedNodeIds: [] };
  const dna = {
    silhouetteLocked: true,
    proportionLocked: false,
    geometryLocked: true,
    detailLocked: false,
    cmfLocked: false,
    brandLocked: true,
    notes: ['Keep handle'],
  };
  it('updates only the requested design and copies constraints after successful persistence', async () => {
    const source = {
      id: 'd',
      projectId: 'p',
      name: 'Lamp',
      kind: 'variant',
      parentDesignId: 'parent',
      status: 'review',
      createdAt: 1,
      updatedAt: 1,
    } as Design;
    const original = structuredClone(source);
    const saveDesign = vi.fn(async () => undefined);
    const result = await createSaveDesignDnaAction(() => 42).run(
      context,
      { designId: 'd', dna },
      { getDesign: async () => source, saveDesign },
    );
    expect(result).toEqual({ ...source, updatedAt: 42, dna });
    expect(result.dna).not.toBe(dna);
    expect(result.dna!.notes).not.toBe(dna.notes);
    expect(source).toEqual(original);
    expect(saveDesign).toHaveBeenCalledExactlyOnceWith(result);
  });
  it('rejects invalid fields, foreign designs and storage failure without modifying the source', async () => {
    const action = createSaveDesignDnaAction();
    const saveDesign = vi.fn(async () => undefined);
    for (const invalid of [
      { ...dna, geometryLocked: 'yes' },
      { ...dna, notes: ['x'.repeat(4001)] },
      { ...dna, notes: Array(41).fill('x') },
      { ...dna, extra: true },
      {},
    ]) {
      const input = { designId: 'd', dna: invalid as typeof dna };
      expect(action.validate(context, input).ok).toBe(false);
      await expect(
        action.run(context, input, { getDesign: async () => undefined, saveDesign }),
      ).rejects.toThrow('Invalid');
    }
    await expect(
      action.run(
        context,
        { designId: 'd', dna },
        { getDesign: async () => ({ id: 'd', projectId: 'foreign' }) as Design, saveDesign },
      ),
    ).rejects.toThrow('not in this project');
    expect(saveDesign).not.toHaveBeenCalled();
    const source = { id: 'd', projectId: 'p', dna } as Design;
    const snapshot = structuredClone(source);
    await expect(
      action.run(
        context,
        { designId: 'd', dna: { ...dna, geometryLocked: false } },
        {
          getDesign: async () => source,
          saveDesign: async () => {
            throw new Error('disk failure');
          },
        },
      ),
    ).rejects.toThrow('disk failure');
    expect(source).toEqual(snapshot);
  });
});

const context: ActionContext = {
  projectId: 'project-1',
  boardId: 'board-1',
  selectedNodeIds: ['node-1'],
  selectedDesignIds: ['design-1'],
};

const sourceDesign: Design = {
  id: 'design-1',
  createdAt: 1,
  updatedAt: 1,
  projectId: 'project-1',
  name: 'Lamp concept',
  kind: 'concept',
  status: 'exploring',
};

describe('Action system', () => {
  it('analyzes only confirmed research, with text-only routing and immutable text evidence', async () => {
    const entry = {
      id: 'record',
      title: 'User product',
      notes: 'Observation before editing',
      tags: ['lamp'],
      sourceUrl: 'https://example.com/source',
      competitor: { brand: 'User brand', product: 'Lamp', recordedOn: '2026-10-04' },
      createdAt: 1,
      updatedAt: 1,
    };
    const other = { ...entry, id: 'unselected', notes: 'DO NOT SEND UNSELECTED DATA' };
    const execute = vi.fn().mockResolvedValue({ text: 'Record 1: user supplied observation.' });
    const saveInputs = vi.fn(),
      saveGeneration = vi.fn(),
      get = vi.fn();
    const runtime: AnalyzeMaterialsRuntime = {
      router: { execute } as unknown as AnalyzeMaterialsRuntime['router'],
      credentials: { get },
      saveInputs,
      saveGeneration,
      loadMaterial: async (id) => ({
        asset: {
          id,
          projectId: context.projectId,
          type: 'image',
          name: 'Lamp',
          mimeType: 'image/png',
          size: 1,
          storage: { type: 'indexeddb', blobId: id },
          createdAt: 1,
          updatedAt: 1,
        },
        image: { mimeType: 'image/png', data: new Uint8Array([1]) },
      }),
      loadResearchProject: async () => ({
        id: context.projectId,
        schemaVersion: 9,
        name: 'Project',
        createdAt: 1,
        updatedAt: 1,
        settings: {},
        boardIds: [],
        researchLibrary: { entries: [entry, other], collections: [] },
      }),
    };
    const action = createAIAnalyzeMaterialsAction();
    const input = {
      provider: { id: 'test', name: 'Test', type: 'test', rememberKey: false },
      assetIds: [] as string[],
      question: '比较用户资料',
      research: [structuredClone(entry)],
    };
    await action.run(context, input, runtime);
    expect(execute.mock.calls[0]?.[0]).toBe('text.generate');
    expect(execute.mock.calls[0]?.[1].prompt).toContain('Observation before editing');
    expect(execute.mock.calls[0]?.[1].prompt).not.toContain('DO NOT SEND UNSELECTED DATA');
    expect(execute.mock.calls[0]?.[1].prompt).toContain('not independently verified facts');
    expect(saveInputs.mock.calls[0]?.[1]).toEqual([]);
    const saved = saveGeneration.mock.calls[0]![0];
    entry.notes = 'Changed after analysis';
    expect(saved.parameters.researchEvidence[0].notes).toBe('Observation before editing');
    execute.mockClear();
    get.mockClear();
    saveInputs.mockClear();
    await expect(action.run(context, input, runtime)).rejects.toThrow('changed');
    expect(execute).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(saveInputs).not.toHaveBeenCalled();
    await action.run(
      context,
      { ...input, research: [structuredClone(entry)], assetIds: ['image'] },
      runtime,
    );
    expect(execute.mock.calls[0]?.[0]).toBe('vision.analyze');
    expect(action.validate(context, { ...input, research: [] }).ok).toBe(false);
    expect(action.validate(context, { ...input, research: undefined }).ok).toBe(false);
    expect(action.validate(context, { ...input, research: [entry, entry] }).ok).toBe(false);
  });
  it('loads all visual evidence before requesting and records ordered sources without secrets', async () => {
    const action = createAIAnalyzeMaterialsAction();
    const provider = { id: 'visual', type: 'test', name: 'Test', rememberKey: false };
    const input = { provider, assetIds: ['a', 'b'], question: 'Compare form and CMF.' };
    const execute = vi.fn().mockResolvedValue({ text: 'Image 1: round. Image 2: angular.' });
    const saveGeneration = vi.fn();
    const get = vi.fn().mockResolvedValue({ apiKey: 'qa-private-key' });
    const runtime: AnalyzeMaterialsRuntime = {
      saveInputs: async (generation) => {
        saveGeneration(generation);
      },
      router: { execute } as unknown as AnalyzeMaterialsRuntime['router'],
      credentials: { get },
      saveGeneration,
      loadMaterial: async (id) => ({
        asset: {
          id,
          projectId: context.projectId,
          type: 'image',
          name: id,
          mimeType: 'image/png',
          size: 1,
          createdAt: 1,
          updatedAt: 1,
          storage: { type: 'indexeddb', blobId: id },
        },
        image: { mimeType: 'image/png', data: new Uint8Array([id === 'a' ? 1 : 2]) },
      }),
    };
    await action.run(context, input, runtime);
    expect(execute).toHaveBeenCalledWith(
      'vision.analyze',
      expect.objectContaining({
        image: { mimeType: 'image/png', data: new Uint8Array([1]) },
        references: [{ mimeType: 'image/png', data: new Uint8Array([2]) }],
      }),
      expect.anything(),
    );
    const saved = saveGeneration.mock.calls.at(-1)![0];
    expect(
      saved.inputSnapshots.map((item: { sourceAssetId: string }) => item.sourceAssetId),
    ).toEqual(['a', 'b']);
    expect(saved).toMatchObject({ status: 'success', sourceAssetIds: ['a', 'b'] });
    expect(saved.sourceDesignIds).toBeUndefined();
    expect(saved.parameters.evidence.map((item: { assetId: string }) => item.assetId)).toEqual([
      'a',
      'b',
    ]);
    expect(JSON.stringify(saveGeneration.mock.calls)).not.toContain('qa-private-key');
    execute.mockClear();
    get.mockClear();
    saveGeneration.mockClear();
    await expect(
      action.run(context, input, { ...runtime, loadMaterial: async () => undefined }),
    ).rejects.toThrow('unavailable');
    expect(execute).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(saveGeneration).not.toHaveBeenCalled();
    await expect(
      action.run(context, input, {
        ...runtime,
        saveInputs: async () => {
          throw new Error('Snapshot storage unavailable');
        },
      }),
    ).rejects.toThrow('Snapshot storage unavailable');
    expect(execute).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    execute.mockRejectedValue(new Error('server echoed qa-private-key'));
    await expect(action.run(context, input, runtime)).rejects.toThrow('Visual comparison failed');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(saveGeneration.mock.calls.at(-1)![0].status).toBe('failed');
    expect(JSON.stringify(saveGeneration.mock.calls)).not.toContain('qa-private-key');
    expect(action.validate(context, { ...input, assetIds: ['a', 'a'] }).ok).toBe(false);
  });
  it('routes UI workspace intent through an Action and tracks loading plus serializable output', async () => {
    const registry = new ActionRegistry();
    createWorkspaceActions().forEach((action) => registry.register(action));
    const runner = new ActionRunner(
      registry,
      () => 'execution-1',
      () => 10,
    );
    const seenStatuses: string[] = [];
    runner.subscribe(() =>
      seenStatuses.push(runner.getState().executions.at(-1)?.status ?? 'none'),
    );
    let duplicateCalls = 0;

    const record = await runner.run({
      actionId: 'workspace.duplicateSelection',
      context,
      input: {},
      runtime: {
        duplicateSelection: () => {
          duplicateCalls += 1;
        },
        deleteSelection: () => undefined,
      },
    });

    expect(duplicateCalls).toBe(1);
    expect(seenStatuses).toEqual(['running', 'success']);
    expect(record).toMatchObject({ status: 'success', result: { performed: true } });
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it('enforces validation and exposes a normalized Action error boundary', async () => {
    const registry = new ActionRegistry();
    createWorkspaceActions().forEach((action) => registry.register(action));
    const runner = new ActionRunner(
      registry,
      () => 'execution-2',
      () => 20,
    );

    const record = await runner.run({
      actionId: 'workspace.deleteSelection',
      context: { ...context, selectedNodeIds: [] },
      input: {},
      runtime: { duplicateSelection: () => undefined, deleteSelection: () => undefined },
    });

    expect(record).toMatchObject({
      status: 'failed',
      error: { code: 'validation', message: 'Select at least one Canvas node first.' },
    });
  });

  it('executes a domain action through an injected persistence port and preserves lineage', async () => {
    const registry = new ActionRegistry();
    registry.register(createVariantAction());
    const runner = new ActionRunner(
      registry,
      () => 'execution-3',
      () => 30,
    );
    let persisted:
      ReturnType<typeof import('@open-industrial-design/design-model').createVariant> | undefined;

    const record = await runner.run({
      actionId: 'design.createVariant',
      context,
      input: { sourceDesign, name: 'Lamp variant', x: 40, y: 80 },
      runtime: {
        persistVariant: async (
          result: typeof persisted extends undefined ? never : NonNullable<typeof persisted>,
        ) => {
          persisted = result;
        },
      },
    });

    expect(record.status).toBe('success');
    expect(persisted?.design.parentDesignId).toBe(sourceDesign.id);
    expect(persisted?.relation.type).toBe('variant_of');
  });

  it('uses the AI capability router and maps its result without Canvas or domain mutation ports', async () => {
    const registry = new ActionRegistry();
    registry.register(createAITextGenerateAction());
    const runner = new ActionRunner(
      registry,
      () => 'execution-4',
      () => 40,
    );
    const providers = new ProviderRegistry();
    providers.register(createTestProvider());
    const credentials = new InMemoryProviderCredentialStore();
    const provider: ProviderConfig = {
      id: 'provider-1',
      type: 'test',
      name: 'Test provider',
      rememberKey: false,
    };

    const record = await runner.run({
      actionId: 'ai.textGenerate',
      context,
      input: { provider, prompt: 'Describe a portable lamp.' },
      runtime: { router: new CapabilityRouter(providers), credentials },
    });

    expect(record).toMatchObject({
      status: 'success',
      result: { text: 'test:Describe a portable lamp.' },
    });
    expect(JSON.stringify(record)).not.toContain('apiKey');
  });

  it('stages generated images as candidates and creates lineage only after an explicit Keep', async () => {
    const registry = new ActionRegistry();
    registry.register(createAIGenerateVariantAction());
    registry.register(createKeepCandidateAction());
    const runner = new ActionRunner(
      registry,
      (() => {
        let index = 0;
        return () => `id-${++index}`;
      })(),
      () => 50,
    );
    const providers = new ProviderRegistry();
    providers.register({
      descriptor: { type: 'image-test', name: 'Image test', capabilities: ['image.generate'] },
      async testConnection() {
        return { ok: true };
      },
      async execute(capability) {
        if (capability !== 'image.generate') throw new Error('unsupported');
        return {
          images: [
            { mimeType: 'image/png', data: new Uint8Array([1, 2]) },
            { mimeType: 'image/png', data: new Uint8Array([3, 4]) },
          ],
        } as never;
      },
    });
    const tray = new CandidateTray();
    const provider: ProviderConfig = {
      id: 'provider-2',
      type: 'image-test',
      name: 'Image test',
      rememberKey: false,
    };
    const generations: import('@open-industrial-design/design-model').Generation[] = [];

    const generated = await runner.run({
      actionId: 'ai.generateVariant',
      context,
      input: { provider, sourceDesign, prompt: 'Make it slimmer.', count: 2 },
      runtime: {
        router: new CapabilityRouter(providers),
        credentials: new InMemoryProviderCredentialStore(),
        candidateTray: tray,
        saveGeneration: async (
          generation: import('@open-industrial-design/design-model').Generation,
        ) => {
          generations.push(generation);
        },
      },
    });

    expect(generated).toMatchObject({ status: 'success' });
    const candidateIds = (generated.result as { candidateIds?: string[] } | undefined)
      ?.candidateIds;
    expect(candidateIds).toHaveLength(2);
    const stateAfterGeneration = tray.getState();
    expect(tray.getState()).toBe(stateAfterGeneration);
    expect(stateAfterGeneration.items).toHaveLength(2);
    expect(generations.at(-1)?.outputDesignIds ?? []).toEqual([]);

    let accepted:
      | {
          generation: import('@open-industrial-design/design-model').Generation;
          created: ReturnType<typeof import('@open-industrial-design/design-model').createVariant>;
        }
      | undefined;
    const kept = await runner.run({
      actionId: 'ai.keepCandidate',
      context,
      input: { candidateId: candidateIds?.[0] ?? '', name: 'Slim variant' },
      runtime: {
        candidateTray: tray,
        acceptCandidate: async (value: NonNullable<typeof accepted>) => {
          accepted = value;
        },
      },
    });

    expect(kept.status).toBe('success');
    expect(accepted?.created.design.parentDesignId).toBe(sourceDesign.id);
    expect(accepted?.generation.outputDesignIds).toEqual([accepted?.created.design.id]);
    expect(tray.getState()).not.toBe(stateAfterGeneration);
    expect(tray.getState().items).toHaveLength(1);
  });

  it.each(['ai.analyzeDesign', 'ai.generateVariant'])(
    '%s sends saved DNA notes and locks without mutating the source',
    async (actionId) => {
      const registry = new ActionRegistry();
      registry.register(createAIAnalyzeDesignAction());
      registry.register(createAIGenerateVariantAction());
      const design: Design = {
        ...sourceDesign,
        dna: {
          silhouetteLocked: false,
          proportionLocked: false,
          geometryLocked: true,
          detailLocked: false,
          cmfLocked: false,
          brandLocked: false,
          notes: ['  保留提手连接结构  ', '', '旋钮可操作'],
        },
      };
      const original = structuredClone(design);
      const execute = vi.fn(async () => ({
        text: 'Analysis',
        images: [{ mimeType: 'image/png', data: new Uint8Array([1, 2]) }],
      }));
      const providers = new ProviderRegistry();
      providers.register({
        descriptor: {
          type: 'dna-test',
          name: 'DNA test',
          capabilities: ['text.generate', 'image.generate'],
        },
        testConnection: async () => ({ ok: true }),
        execute: execute as never,
      });
      const provider: ProviderConfig = {
        id: 'dna-test',
        type: 'dna-test',
        name: 'DNA test',
        rememberKey: false,
      };
      const saveGeneration = vi.fn(async () => undefined);
      const result = await new ActionRunner(registry).run({
        actionId,
        context,
        input:
          actionId === 'ai.analyzeDesign'
            ? { provider, design }
            : { provider, sourceDesign: design, prompt: 'New direction', count: 1 },
        runtime: {
          router: new CapabilityRouter(providers),
          credentials: new InMemoryProviderCredentialStore(),
          candidateTray: new CandidateTray(),
          saveGeneration,
        },
      });
      expect(result.status).toBe('success');
      expect(execute).toHaveBeenCalledTimes(1);
      const request = JSON.stringify(execute.mock.calls);
      for (const constraint of [
        'Do not alter the primary geometry.',
        '保留提手连接结构',
        '旋钮可操作',
      ]) {
        expect(request).toContain(constraint);
        expect(JSON.stringify(saveGeneration.mock.calls)).toContain(constraint);
      }
      expect(request).not.toContain('  保留提手连接结构  ');
      expect(design).toEqual(original);
    },
  );

  it('records analysis history without modifying the source Design', async () => {
    const registry = new ActionRegistry();
    registry.register(createAIAnalyzeDesignAction());
    const runner = new ActionRunner(
      registry,
      () => 'analysis-id',
      () => 60,
    );
    const providers = new ProviderRegistry();
    providers.register(createTestProvider());
    const generations: import('@open-industrial-design/design-model').Generation[] = [];
    const provider: ProviderConfig = {
      id: 'provider-3',
      type: 'test',
      name: 'Test provider',
      rememberKey: false,
    };

    const record = await runner.run({
      actionId: 'ai.analyzeDesign',
      context,
      input: { provider, design: sourceDesign, notes: 'Focus on ergonomics.' },
      runtime: {
        router: new CapabilityRouter(providers),
        credentials: new InMemoryProviderCredentialStore(),
        saveGeneration: async (
          generation: import('@open-industrial-design/design-model').Generation,
        ) => {
          generations.push(generation);
        },
      },
    });

    expect(record).toMatchObject({ status: 'success' });
    expect((record.result as { generationId?: string } | undefined)?.generationId).toEqual(
      generations.at(-1)?.id,
    );
    expect(generations.at(-1)).toMatchObject({
      status: 'success',
      sourceDesignIds: [sourceDesign.id],
    });
    expect(sourceDesign).toEqual({
      id: 'design-1',
      createdAt: 1,
      updatedAt: 1,
      projectId: 'project-1',
      name: 'Lamp concept',
      kind: 'concept',
      status: 'exploring',
    });
  });
});
