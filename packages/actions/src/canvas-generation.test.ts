import { describe, expect, it, vi } from 'vitest';
import {
  CapabilityRouter,
  InMemoryProviderCredentialStore,
  ProviderRegistry,
  type ProviderConfig,
} from '@open-industrial-design/ai-core';
import type {
  Design,
  Edge,
  EditRegion,
  Generation,
  GenerationCandidate,
  GenerationNode,
  ReferenceNode,
} from '@open-industrial-design/design-model';
import {
  ActionRegistry,
  ActionRunner,
  createCanvasGenerateAction,
  createCanvasBatchGenerateAction,
  createKeepCanvasCandidateAction,
  generationInputSignature,
  LOCAL_EDIT_PROTECTION_ERROR,
} from './index';

const context = {
  projectId: 'project',
  boardId: 'board',
  selectedNodeIds: [],
  selectedDesignIds: [],
};
const node: GenerationNode = {
  id: 'generate',
  boardId: 'board',
  type: 'generation',
  label: 'Generate',
  direction: 'Compact lamp',
  notes: 'matte finish',
  count: 2,
  x: 0,
  y: 0,
  width: 290,
  height: 300,
  rotation: 0,
  zIndex: 1,
  createdAt: 1,
  updatedAt: 1,
};
const source = (id: string, assetId: string): ReferenceNode => ({
  id,
  boardId: 'board',
  type: 'reference',
  assetId,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  zIndex: 1,
  createdAt: 1,
  updatedAt: 1,
});
const edges: Edge[] = [
  {
    id: 'main',
    boardId: 'board',
    sourceNodeId: 'a',
    targetNodeId: node.id,
    type: 'generation_input',
    inputRole: 'base',
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'extra',
    boardId: 'board',
    sourceNodeId: 'b',
    targetNodeId: node.id,
    type: 'generation_input',
    inputRole: 'reference',
    createdAt: 1,
    updatedAt: 1,
  },
];
const provider: ProviderConfig = {
  id: 'provider',
  type: 'test-image',
  name: 'Test image',
  enabled: true,
  rememberKey: false,
};

describe('canvas generation actions', () => {
  it.each(['success', 'failure', 'cancel'] as const)(
    'runs task queues sequentially with %s handling',
    async (mode) => {
      const action = createCanvasBatchGenerateAction();
      const input = {
        tasks: [0, 1, 2].map((index) => ({
          node: { ...node, id: `task-${index}`, textOnly: true, count: 1 },
          edges: [],
          sourceNodes: [],
          sourceDesigns: [],
          provider,
        })),
      };
      expect(action.validate(context, input)).toEqual({ ok: true });
      const controller = new AbortController();
      let active = 0,
        highest = 0,
        calls = 0;
      const execute = vi.fn(async () => {
        active++;
        highest = Math.max(highest, active);
        const current = ++calls;
        await Promise.resolve();
        active--;
        if (mode === 'failure' && current === 2) throw new Error('private secret');
        return { images: [{ mimeType: 'image/png', data: new Uint8Array([1]) }] };
      });
      const stageCandidates = vi.fn(),
        saveGeneration = vi.fn();
      const onProgress = vi.fn((value: { status: string }) => {
        if (mode === 'cancel' && value.status === 'success') controller.abort();
      });
      const runtime = {
        router: { execute },
        credentials: { get: async () => undefined },
        resolveImage: vi.fn(),
        stageCandidates,
        saveGeneration,
        signal: controller.signal,
        onProgress,
      };
      if (mode === 'success')
        expect(await action.run(context, input, runtime as never)).toEqual({
          completedNodeIds: ['task-0', 'task-1', 'task-2'],
        });
      else
        await expect(action.run(context, input, runtime as never)).rejects.toThrow(
          mode === 'cancel' ? 'cancelled' : 'stopped',
        );
      expect(highest).toBe(1);
      expect(execute).toHaveBeenCalledTimes(mode === 'success' ? 3 : mode === 'failure' ? 2 : 1);
      expect(stageCandidates).toHaveBeenCalledTimes(mode === 'success' ? 3 : 1);
      expect(JSON.stringify(saveGeneration.mock.calls)).not.toContain('private secret');
    },
  );
  it.each(['unowned-main', 'design-main', 'candidate-main', 'references-only'] as const)(
    'takes lineage and DNA only from the explicit main image (%s)',
    async (mode) => {
      const action = createCanvasGenerateAction();
      const mainDesign = {
        id: 'main-design',
        dna: { geometryLocked: true, notes: ['MAIN_DNA'] },
      } as Design;
      const referenceDesign = {
        id: 'reference-design',
        dna: { cmfLocked: true, notes: ['REFERENCE_DNA'] },
      } as Design;
      const main =
        mode === 'candidate-main'
          ? { ...source('a', 'asset-a'), type: 'candidate' as const, candidateId: 'candidate' }
          : {
              ...source('a', 'asset-a'),
              designId: mode === 'design-main' ? mainDesign.id : undefined,
            };
      const input = {
        node,
        edges:
          mode === 'references-only'
            ? edges.map((edge) => ({ ...edge, inputRole: 'reference' as const }))
            : [...edges].reverse(),
        sourceNodes: [main, { ...source('b', 'asset-b'), designId: referenceDesign.id }],
        sourceDesigns: [referenceDesign, mainDesign],
        sourceCandidates: [
          {
            id: 'candidate',
            projectId: context.projectId,
            boardId: context.boardId,
            sourceDesignId: mainDesign.id,
          } as GenerationCandidate,
        ],
        provider,
      };
      expect(action.validate(context, input)).toEqual({ ok: true });
      const execute = vi.fn(async () => ({
        images: [{ mimeType: 'image/png', data: new Uint8Array([1]) }],
      }));
      const stageCandidates = vi.fn(),
        saveGeneration = vi.fn();
      await action.run(context, input, {
        router: { execute },
        credentials: { get: async () => undefined },
        resolveImage: async () => ({ mimeType: 'image/png', data: new Uint8Array([1]) }),
        stageCandidates,
        saveGeneration,
        saveGenerationInputs: vi.fn(async () => undefined),
      } as never);
      const inherited = mode === 'design-main' || mode === 'candidate-main';
      const request = execute.mock.calls[0] as unknown as [
        string,
        { prompt: string; images: unknown[] },
      ];
      expect(request[1].images).toHaveLength(2);
      expect(request[1].prompt).not.toContain('REFERENCE_DNA');
      expect(request[1].prompt.includes('MAIN_DNA')).toBe(inherited);
      expect(stageCandidates.mock.calls[0]![0][0].metadata.sourceDesignId).toBe(
        inherited ? mainDesign.id : undefined,
      );
      expect(saveGeneration.mock.calls.at(-1)![0].sourceDesignIds).toEqual(
        inherited ? [mainDesign.id] : [],
      );
    },
  );

  it('tracks main DNA without reacting to reference DNA, metadata or field order', () => {
    const main = {
      id: 'main',
      dna: { geometryLocked: true, notes: ['Keep proportions'] },
    } as Design;
    const reference = { id: 'reference', dna: { cmfLocked: true } } as Design;
    const sources = [
      { ...source('a', 'a'), designId: main.id },
      { ...source('b', 'b'), designId: reference.id },
    ];
    const signature = (designs: Design[], task = node) =>
      generationInputSignature(task, edges, sources, designs);
    const initial = signature([main, reference]);
    expect(signature([{ ...main, name: 'Renamed', updatedAt: 22 }, reference])).toBe(initial);
    expect(signature([main, { ...reference, dna: { ...reference.dna!, cmfLocked: false } }])).toBe(
      initial,
    );
    expect(
      signature([{ ...main, dna: { ...main.dna!, geometryLocked: false } }, reference]),
    ).not.toBe(initial);
    expect(
      signature([{ ...main, dna: { ...main.dna!, notes: ['Different constraints'] } }, reference]),
    ).not.toBe(initial);
    const pattern = {
      ...node,
      patternTask: { kind: 'create' as const, repeat: 'single' as const },
    };
    expect(signature([main, reference], pattern)).toBe(signature([], pattern));
    const candidateSources = [
      { ...sources[0]!, type: 'candidate' as const, candidateId: 'candidate', designId: undefined },
      sources[1]!,
    ];
    const candidates = [{ id: 'candidate', sourceDesignId: main.id } as GenerationCandidate];
    const before = generationInputSignature(
      node,
      edges,
      candidateSources,
      [main, reference],
      candidates,
    );
    expect(
      generationInputSignature(
        node,
        edges,
        candidateSources,
        [{ ...main, dna: { ...main.dna!, geometryLocked: false } }, reference],
        candidates,
      ),
    ).not.toBe(before);
    expect(initial).toBe(
      signature([
        { ...main, dna: { notes: ['Keep proportions'], geometryLocked: true } as Design['dna'] },
        reference,
      ]),
    );
  });

  it('validates all queued tasks before requesting any image', async () => {
    const action = createCanvasBatchGenerateAction();
    const good = {
      node: { ...node, textOnly: true },
      edges: [],
      sourceNodes: [],
      sourceDesigns: [],
      provider,
    };
    const input = { tasks: [good, { ...good, node: { ...good.node, id: 'invalid', count: 8 } }] };
    expect(action.validate(context, input).ok).toBe(false);
    const execute = vi.fn();
    await expect(action.run(context, input, { router: { execute } } as never)).rejects.toThrow(
      'validation failed',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(action.validate(context, { tasks: [good, good] }).ok).toBe(false);
  });
  it.each(['text', 'reference', 'transfer'] as const)(
    'routes %s pattern tasks with explicit inputs and provenance',
    async (mode) => {
      const action = createCanvasGenerateAction();
      const patternTask: NonNullable<GenerationNode['patternTask']> =
        mode === 'transfer'
          ? { kind: 'transfer', placement: 'front panel', scale: 'small' }
          : { kind: 'create', repeat: 'tile' };
      const task = { ...node, textOnly: mode === 'text', patternTask };
      const input = {
        node: task,
        edges: mode === 'text' ? [] : [...edges].reverse(),
        sourceNodes: [{ ...source('a', 'asset-a'), designId: 'design' }, source('b', 'asset-b')],
        sourceDesigns: [{ id: 'design', dna: { geometryLocked: true } } as Design],
        provider,
      };
      expect(action.validate(context, input)).toEqual({ ok: true });
      const execute = vi.fn(async () => ({
        images: [{ mimeType: 'image/png', data: new Uint8Array([1]) }],
      }));
      const resolveImage = vi.fn(async (item: ReferenceNode) => ({
        mimeType: 'image/png',
        data: new Uint8Array([item.id === 'a' ? 1 : 2]),
      }));
      const stageCandidates = vi.fn(),
        saveGeneration = vi.fn();
      await action.run(context, input, {
        router: { execute },
        credentials: { get: async () => undefined },
        resolveImage,
        stageCandidates,
        saveGeneration,
      } as never);
      expect(execute).toHaveBeenCalledTimes(1);
      const [capability, request] = execute.mock.calls[0]! as unknown as [
        string,
        { prompt: string; images?: { data: Uint8Array }[] },
      ];
      expect(capability).toBe(mode === 'text' ? 'image.generate' : 'image.edit');
      if (mode === 'text') {
        expect(resolveImage).not.toHaveBeenCalled();
        expect(request.images).toBeUndefined();
      } else expect(request.images?.map((image) => image.data[0])).toEqual([1, 2]);
      expect(request.prompt).toContain(
        mode === 'transfer' ? 'front panel' : 'matching opposite edges',
      );
      expect(request.prompt.includes('Design DNA')).toBe(mode === 'transfer');
      expect(stageCandidates.mock.calls[0]![0][0].metadata.sourceDesignId).toBe(
        mode === 'transfer' ? 'design' : undefined,
      );
      expect(saveGeneration.mock.calls.at(-1)![0].parameters.patternTask).toEqual(patternTask);
      expect(generationInputSignature(task, edges, input.sourceNodes)).not.toBe(
        generationInputSignature(node, edges, input.sourceNodes),
      );
    },
  );

  it('rejects incomplete and incompatible pattern tasks before calling the provider', () => {
    const action = createCanvasGenerateAction();
    const task: GenerationNode = {
      ...node,
      patternTask: { kind: 'transfer', placement: 'front panel', scale: 'medium' },
    };
    const input = {
      node: task,
      edges,
      sourceNodes: [source('a', 'a'), source('b', 'b')],
      sourceDesigns: [],
      provider,
    };
    for (const patch of [
      { patternTask: { kind: 'transfer', placement: '', scale: 'medium' } },
      { patternTask: { kind: 'transfer', placement: 'x'.repeat(501), scale: 'medium' } },
      { patternTask: { kind: 'transfer', placement: 'front', scale: 'huge' } },
      { patternTask: { kind: 'create', repeat: 'unknown' } },
      { patternTask: { kind: 'create', repeat: 'single', secret: 'not allowed' } },
      { textOnly: true },
      { localEdit: true },
      { removeBackground: true },
      { requestedViews: ['front', 'side'] },
    ])
      expect(
        action.validate(context, { ...input, node: { ...task, ...patch } } as never),
      ).toMatchObject({ ok: false });
    expect(action.validate(context, { ...input, edges: edges.slice(0, 1) })).toMatchObject({
      ok: false,
    });
    expect(action.validate(context, { ...input, edges: [] })).toMatchObject({ ok: false });
  });

  it('runs explicit text generation without resolving images or inventing design lineage', async () => {
    const action = createCanvasGenerateAction();
    const input = {
      node: { ...node, textOnly: true },
      edges: [],
      sourceNodes: [],
      sourceDesigns: [],
      provider,
    };
    expect(action.validate(context, input)).toEqual({ ok: true });
    expect(action.validate(context, { ...input, node })).toMatchObject({ ok: false });
    expect(action.validate(context, { ...input, edges })).toMatchObject({ ok: false });
    for (const patch of [
      { localEdit: true },
      { requestedViews: ['front'] },
      { removeBackground: true },
      { textOnly: 'yes' },
    ])
      expect(
        action.validate(context, { ...input, node: { ...input.node, ...patch } } as never),
      ).toMatchObject({ ok: false });
    const execute = vi.fn(async () => ({
      images: [{ mimeType: 'image/png', data: new Uint8Array([1]) }],
    }));
    const resolveImage = vi.fn(),
      stageCandidates = vi.fn(),
      saveGeneration = vi.fn();
    await action.run(context, input, {
      router: { execute },
      credentials: { get: async () => ({ apiKey: 'private-key' }) },
      resolveImage,
      stageCandidates,
      saveGeneration,
    } as never);
    expect(resolveImage).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      'image.generate',
      { prompt: 'Compact lamp\nmatte finish', count: 2 },
      expect.objectContaining({ config: provider }),
    );
    expect(stageCandidates.mock.calls[0]![0][0].metadata.sourceDesignId).toBeUndefined();
    expect(saveGeneration.mock.calls.at(-1)![0]).toMatchObject({
      status: 'success',
      sourceAssetIds: [],
      sourceDesignIds: [],
      parameters: { textOnly: true },
    });
    expect(JSON.stringify(saveGeneration.mock.calls)).not.toContain('private-key');
    expect(generationInputSignature(input.node, [], [])).not.toBe(
      generationInputSignature(node, [], []),
    );
    execute.mockRejectedValueOnce(new Error('model rejected private-key'));
    stageCandidates.mockClear();
    await expect(
      action.run(context, input, {
        router: { execute },
        credentials: { get: async () => undefined },
        resolveImage,
        stageCandidates,
        saveGeneration,
      } as never),
    ).rejects.toThrow('Image generation failed');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(stageCandidates).not.toHaveBeenCalled();
    expect(JSON.stringify(saveGeneration.mock.calls)).not.toContain('private-key');
  });
  it('composites a pattern locally without credentials or Provider requests', async () => {
    const placement = { x: 0.5, y: 0.5, width: 0.3, height: 0.2, rotation: 25, opacity: 0.8 };
    const input = {
      node: { ...node, count: 1, patternPlacement: placement },
      edges,
      sourceNodes: [source('a', 'one'), source('b', 'two')],
      sourceDesigns: [],
      provider: { ...provider, enabled: false },
    };
    const action = createCanvasGenerateAction();
    expect(action.validate(context, input)).toEqual({ ok: true });
    expect(action.validate(context, { ...input, node: { ...input.node, count: 2 } })).toMatchObject(
      { ok: false },
    );
    const image = { mimeType: 'image/png', data: new Uint8Array([1]) };
    const execute = vi.fn(),
      get = vi.fn(),
      composePattern = vi.fn(async () => image),
      stageCandidates = vi.fn(),
      saveGeneration = vi.fn();
    await action.run(context, input, {
      router: { execute },
      credentials: { get },
      resolveImage: async () => image,
      composePattern,
      stageCandidates,
      saveGeneration,
    } as never);
    expect(composePattern).toHaveBeenCalledWith(image, image, placement);
    expect(execute).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(stageCandidates.mock.calls[0]![0]).toHaveLength(1);
    expect(saveGeneration.mock.calls.at(-1)![0]).toMatchObject({
      providerId: 'local-raster',
      status: 'success',
      parameters: { patternPlacement: placement },
    });
    expect(generationInputSignature(input.node, edges, input.sourceNodes)).not.toBe(
      generationInputSignature(
        { ...input.node, patternPlacement: { ...placement, rotation: 0 } },
        edges,
        input.sourceNodes,
      ),
    );
  });
  it('validates and protects cutout outputs before staging any candidates', async () => {
    const action = createCanvasGenerateAction();
    const input = {
      node: { ...node, removeBackground: true },
      edges: [edges[0]!],
      sourceNodes: [source('a', 'one')],
      sourceDesigns: [],
      provider: { ...provider, supportsTransparency: true },
    };
    expect(action.validate(context, input)).toEqual({ ok: true });
    expect(action.validate(context, { ...input, provider })).toMatchObject({ ok: false });
    expect(action.validate(context, { ...input, edges })).toMatchObject({ ok: false });
    expect(
      action.validate(context, { ...input, node: { ...input.node, localEdit: true } }),
    ).toMatchObject({ ok: false });
    const image = { mimeType: 'image/png', data: new Uint8Array([1]) },
      protectedImage = { ...image, data: new Uint8Array([2]) };
    const execute = vi.fn(async (capability) => {
      expect(capability).toBe('image.cutout');
      return { images: [image] };
    });
    const stageCandidates = vi.fn(),
      saveGeneration = vi.fn();
    const runtime = {
      router: { execute },
      credentials: new InMemoryProviderCredentialStore(),
      resolveImage: async () => image,
      protectCutout: vi.fn(async () => protectedImage),
      stageCandidates,
      saveGeneration,
    };
    await action.run(context, input, runtime as never);
    expect(runtime.protectCutout).toHaveBeenCalledWith(image, image);
    expect(stageCandidates.mock.calls[0]![0][0].image).toBe(protectedImage);
    expect(saveGeneration.mock.calls.at(-1)![0].parameters.removeBackground).toBe(true);
    stageCandidates.mockClear();
    execute.mockClear();
    await expect(
      action.run(context, input, { ...runtime, protectCutout: undefined } as never),
    ).rejects.toThrow(/validation is unavailable/);
    expect(execute).not.toHaveBeenCalled();
    await expect(
      action.run(context, input, {
        ...runtime,
        protectCutout: async () => {
          throw Error('bad alpha');
        },
      } as never),
    ).rejects.toThrow(/Background removal failed validation/);
    expect(execute).toHaveBeenCalledOnce();
    expect(stageCandidates).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'does not stage cancelled requests (already cancelled: %s)',
    async (aborted) => {
      const signal = { aborted };
      const execute = vi.fn(async (_capability, _request, requestContext) => {
        expect(requestContext.signal).toBe(signal);
        signal.aborted = true;
        return { images: [{ mimeType: 'image/png', data: new Uint8Array([88]) }] };
      });
      const stageCandidates = vi.fn();
      const saveGeneration = vi.fn(async () => {});
      await expect(
        createCanvasGenerateAction().run(
          context,
          {
            node,
            edges,
            sourceNodes: [source('a', 'one'), source('b', 'two')],
            sourceDesigns: [],
            provider,
          },
          {
            signal,
            router: { execute },
            credentials: new InMemoryProviderCredentialStore(),
            resolveImage: async () => ({ mimeType: 'image/png', data: new Uint8Array([77]) }),
            saveGeneration,
            stageCandidates,
          } as never,
        ),
      ).rejects.toThrow('Generation cancelled');
      expect(execute).toHaveBeenCalledTimes(aborted ? 0 : 1);
      expect(stageCandidates).not.toHaveBeenCalled();
      expect(saveGeneration).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('Generation cancelled'),
        }),
      );
    },
  );
  it('does not mark inputs stale when only the source layout changes', () => {
    const original = source('image', 'asset');
    const inputEdge: Edge = {
      id: 'input',
      boardId: 'board',
      type: 'generation_input',
      sourceNodeId: original.id,
      targetNodeId: node.id,
      inputRole: 'base',
      createdAt: 1,
      updatedAt: 1,
    };
    const signature = generationInputSignature(node, [inputEdge], [original]);
    expect(
      generationInputSignature(
        node,
        [inputEdge],
        [{ ...original, x: 400, y: 600, width: 200, updatedAt: 2 }],
      ),
    ).toBe(signature);
    expect(generationInputSignature(node, [inputEdge], [source('image', 'replacement')])).not.toBe(
      signature,
    );
    expect(
      generationInputSignature({ ...node, notes: 'changed' }, [inputEdge], [original]),
    ).not.toBe(signature);
  });
  it('explores an unaccepted candidate with its own image and persists inputs before any paid request', async () => {
    const candidate = {
      id: 'candidate',
      projectId: 'project',
      boardId: 'board',
      generationNodeId: 'previous',
      generationId: 'previous-run',
      mimeType: 'image/png',
      inputSignature: 'old',
      createdAt: 1,
      updatedAt: 1,
    };
    const result = {
      ...source('a', 'unused-parent-image'),
      type: 'candidate' as const,
      candidateId: 'candidate',
    };
    const input = {
      node,
      edges: [edges[0]!],
      sourceNodes: [result],
      sourceCandidates: [candidate],
      sourceDesigns: [],
      provider,
    };
    const action = createCanvasGenerateAction();
    expect(action.validate(context, input)).toEqual({ ok: true });
    expect(action.validate(context, { ...input, sourceCandidates: [] })).toMatchObject({
      ok: false,
    });
    const execute = vi.fn(async (_capability, request: { images: Array<{ data: Uint8Array }> }) => {
      expect(request.images[0]!.data).toEqual(new Uint8Array([77]));
      expect(saveInputs).toHaveBeenCalledOnce();
      return { images: [{ mimeType: 'image/png', data: new Uint8Array([88]) }] };
    });
    const saveInputs = vi.fn(
      async (generation: Generation, images: Array<{ data: Uint8Array }>) => {
        expect(generation.inputSnapshots?.[0]).toMatchObject({
          candidateId: 'candidate',
          sourceNodeId: 'a',
          role: 'base',
        });
        expect(images[0]!.data).toEqual(new Uint8Array([77]));
        expect(execute).not.toHaveBeenCalled();
      },
    );
    let staged: GenerationCandidate[] = [];
    const runtime = {
      router: { execute },
      credentials: new InMemoryProviderCredentialStore(),
      resolveImage: async () => ({ mimeType: 'image/png', data: new Uint8Array([77]) }),
      saveGeneration: async () => {},
      saveGenerationInputs: saveInputs,
      stageCandidates: async (items: Array<{ metadata: GenerationCandidate }>) => {
        staged = items.map((item) => item.metadata);
      },
    };
    await action.run(context, input, runtime as never);
    expect(staged[0]?.sourceDesignId).toBeUndefined();
    execute.mockClear();
    await expect(
      action.run(context, input, { ...runtime, saveGenerationInputs: undefined } as never),
    ).rejects.toThrow(/persistent input snapshots/);
    await expect(
      action.run(context, input, {
        ...runtime,
        saveGenerationInputs: async () => {
          throw new Error('snapshot failed');
        },
      } as never),
    ).rejects.toThrow('snapshot failed');
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(['rectangle', 'polygon', 'brush', 'erase', 'local-cmf'] as const)(
    'routes the prepared %s selection and PNG mask through the Action',
    async (mode) => {
      const action = createCanvasGenerateAction();
      const region: EditRegion = {
        sourceNodeId: 'a',
        sourceAssetId: 'asset-a',
        x: 0.2,
        y: 0.1,
        width: 0.3,
        height: 0.4,
        ...(mode === 'polygon'
          ? {
              shape: {
                kind: 'polygon' as const,
                points: [
                  [0, 0],
                  [1, 0],
                  [0, 1],
                ] as [number, number][],
              },
            }
          : mode === 'brush'
            ? {
                shape: {
                  kind: 'brush' as const,
                  strokes: [
                    {
                      radius: 0.05,
                      points: [
                        [0.2, 0.2],
                        [0.6, 0.5],
                      ] as [number, number][],
                    },
                  ],
                },
              }
            : {}),
      };
      const input = {
        node: {
          ...node,
          localEdit: true,
          editRegion: region,
          localEditMode: mode === 'erase' ? ('erase' as const) : undefined,
          localCmf:
            mode === 'local-cmf' ? { color: '深蓝色', material: '铝合金', finish: '' } : undefined,
        },
        edges: [...edges].reverse(),
        sourceNodes: [source('a', 'asset-a'), source('b', 'asset-b')],
        sourceDesigns: [],
        provider: { ...provider, supportsMask: true },
      };
      expect(action.validate?.(context, input)).toEqual({ ok: true });
      if (mode === 'local-cmf') {
        for (const patch of [
          { localCmf: { color: '', material: '', finish: '' } },
          { localCmf: { color: 'x'.repeat(501), material: '', finish: '' } },
          { localCmf: { color: 'blue', material: '', finish: '', extra: 123 } },
          { localEdit: false },
          { localEditMode: 'erase' },
        ])
          expect(
            action.validate(context, { ...input, node: { ...input.node, ...patch } } as never),
          ).toMatchObject({ ok: false });
      }
      expect(action.validate?.(context, { ...input, provider })).toMatchObject({ ok: false });
      expect(
        action.validate?.(context, {
          ...input,
          node: { ...input.node, editRegion: { ...region, sourceAssetId: 'outdated' } },
        }),
      ).toMatchObject({ ok: false });
      let received: unknown;
      const records: Generation[] = [];
      await action.run(context, input, {
        router: {
          execute: async (_capability: unknown, request: unknown) => {
            expect(_capability).toBe(mode === 'erase' ? 'image.erase' : 'image.edit');
            received = request;
            return { images: [{ mimeType: 'image/png', data: new Uint8Array([9]) }] };
          },
        },
        credentials: new InMemoryProviderCredentialStore(),
        resolveImage: async (source: ReferenceNode) => ({
          mimeType: 'image/jpeg',
          data: new Uint8Array([source.id === 'a' ? 1 : 2]),
        }),
        prepareMask: async (image: { data: Uint8Array }, selection: unknown) => {
          expect(image.data[0]).toBe(1);
          expect(selection).toEqual(region);
          return {
            image: { mimeType: 'image/png', data: new Uint8Array([3]) },
            mask: { mimeType: 'image/png', data: new Uint8Array([4]) },
          };
        },
        protectLocalEdit: async (
          base: { data: Uint8Array },
          result: { data: Uint8Array },
          selection: unknown,
        ) => {
          expect(base.data[0]).toBe(3);
          expect(result.data[0]).toBe(9);
          expect(selection).toEqual(region);
          return { mimeType: 'image/png', data: new Uint8Array([8]) };
        },
        saveGeneration: async (value: Generation) => {
          records.push(value);
        },
        saveGenerationInputs: async (value: Generation, images: Array<{ data: Uint8Array }>) => {
          expect(images.map((image) => image.data[0])).toEqual([3, 2, 4]);
          expect(value.inputSnapshots?.map((snapshot) => snapshot.role)).toEqual([
            'base',
            'reference',
            'mask',
          ]);
          expect(value.inputSnapshots?.map((snapshot) => snapshot.sourceNodeId)).toEqual([
            'a',
            'b',
            'a',
          ]);
          records.push(value);
        },
        stageCandidates: async (items: Array<{ image: { data: Uint8Array } }>) => {
          expect(items[0]?.image.data[0]).toBe(8);
        },
      } as never);
      expect(received).toMatchObject({
        mask: { mimeType: 'image/png', data: new Uint8Array([4]) },
      });
      expect(
        (received as { images: Array<{ data: Uint8Array }> }).images.map((item) => item.data[0]),
      ).toEqual([3, 2]);
      expect(records.at(-1)?.parameters?.editRegion).toEqual(region);
      expect(records.at(-1)?.parameters?.localEditMode).toBe(
        mode === 'erase' ? 'erase' : undefined,
      );
      expect(records.at(-1)?.parameters?.localEditProtection).toBe('selection-only-v1');
      if (mode === 'local-cmf') {
        expect(records.at(-1)?.parameters?.localCmf).toEqual(input.node.localCmf);
        const prompt = (received as { prompt: string }).prompt;
        expect(prompt).toContain('Target color: 深蓝色');
        expect(prompt).toContain('Target material: 铝合金');
        expect(prompt).toContain('Target surface finish: Preserve original finish');
        expect(prompt).toContain('Preserve silhouette');
        expect(generationInputSignature(input.node, edges, input.sourceNodes)).not.toBe(
          generationInputSignature(
            { ...input.node, localCmf: { ...input.node.localCmf!, color: 'red' } },
            edges,
            input.sourceNodes,
          ),
        );
      }
      expect(generationInputSignature(input.node, edges, input.sourceNodes)).not.toBe(
        generationInputSignature(node, edges, input.sourceNodes),
      );
    },
  );
  it('requires protection before calling a paid model and never stages partial unprotected results', async () => {
    const action = createCanvasGenerateAction();
    const region = {
      sourceNodeId: 'a',
      sourceAssetId: 'asset-a',
      x: 0.2,
      y: 0.1,
      width: 0.3,
      height: 0.4,
    };
    const input = {
      node: { ...node, localEdit: true, editRegion: region },
      edges,
      sourceNodes: [source('a', 'asset-a'), source('b', 'asset-b')],
      sourceDesigns: [],
      provider: { ...provider, supportsMask: true },
    };
    const image = { mimeType: 'image/png', data: new Uint8Array([1]) };
    const execute = vi.fn().mockResolvedValue({ images: [image, image] });
    const stageCandidates = vi.fn();
    const saveGeneration = vi.fn();
    const runtime = {
      router: { execute },
      credentials: new InMemoryProviderCredentialStore(),
      resolveImage: async () => image,
      prepareMask: async () => ({ image, mask: image }),
      stageCandidates,
      saveGeneration,
    };
    await expect(action.run(context, input, runtime as never)).rejects.toThrow(/Mask preparation/);
    expect(execute).not.toHaveBeenCalled();
    const protectLocalEdit = vi
      .fn()
      .mockResolvedValueOnce(image)
      .mockRejectedValueOnce(new Error('Bearer secret-test-key dimensions'));
    await expect(
      action.run(context, input, { ...runtime, protectLocalEdit } as never),
    ).rejects.toThrow(LOCAL_EDIT_PROTECTION_ERROR);
    expect(execute).toHaveBeenCalledOnce();
    expect(stageCandidates).not.toHaveBeenCalled();
    expect(saveGeneration.mock.calls.at(-1)?.[0]).toMatchObject({
      status: 'failed',
      error: LOCAL_EDIT_PROTECTION_ERROR,
    });
    expect(JSON.stringify(saveGeneration.mock.calls)).not.toContain('secret-test-key');
  });
  it('makes one bounded request per view and stages labeled candidates only after all succeed', async () => {
    const action = createCanvasGenerateAction();
    const task = { ...node, requestedViews: ['front', 'side'] as const };
    const input = {
      node: { ...task, requestedViews: [...task.requestedViews] },
      edges,
      sourceNodes: [source('a', 'asset-a'), source('b', 'asset-b')],
      sourceDesigns: [],
      provider,
    };
    const prompts: string[] = [];
    let staged: GenerationCandidate[] = [];
    const records: Generation[] = [];
    const runtime = {
      router: {
        execute: async (_capability: unknown, request: unknown) => {
          const payload = request as { prompt: string; count: number; images: unknown[] };
          expect(payload.count).toBe(1);
          expect(payload.images).toHaveLength(2);
          prompts.push(payload.prompt);
          expect(staged).toEqual([]);
          return { images: [{ mimeType: 'image/png', data: new Uint8Array([1]) }] };
        },
      },
      credentials: new InMemoryProviderCredentialStore(),
      resolveImage: async () => ({ mimeType: 'image/png', data: new Uint8Array([1]) }),
      saveGeneration: async (record: Generation) => {
        records.push(record);
      },
      stageCandidates: async (items: Array<{ metadata: GenerationCandidate }>) => {
        staged = items.map((item) => item.metadata);
      },
    };
    expect(action.validate?.(context, input)).toEqual({ ok: true });
    await action.run(context, input, runtime as never);
    expect(prompts[0]).toContain('Requested camera view: front');
    expect(prompts[1]).toContain('Requested camera view: side');
    expect(staged.map((item) => item.view)).toEqual(['front', 'side']);
    expect(staged[1]!.createdAt).toBe(staged[0]!.createdAt + 1);
    expect(records.at(-1)?.parameters?.requestedViews).toEqual(['front', 'side']);
    expect(generationInputSignature(input.node, edges, input.sourceNodes)).not.toBe(
      generationInputSignature(node, edges, input.sourceNodes),
    );
    expect(
      action.validate?.(context, {
        ...input,
        node: { ...input.node, requestedViews: ['front', 'front'] },
      }),
    ).toMatchObject({ ok: false });
    staged = [];
    let calls = 0;
    await expect(
      action.run(context, input, {
        ...runtime,
        router: {
          execute: async () => {
            calls += 1;
            if (calls === 2) throw new Error('failure');
            return { images: [{ mimeType: 'image/png', data: new Uint8Array([1]) }] };
          },
        },
      } as never),
    ).rejects.toThrow('Image generation failed');
    expect(staged).toEqual([]);
    expect(calls).toBe(2);
    expect(records.at(-1)?.status).toBe('failed');
  });
  it.each([2, 5])(
    'sends all %s connected images and persists ordered snapshots before requesting',
    async (count) => {
      const sourceNodes = Array.from({ length: count }, (_, index) =>
        source(String.fromCharCode(97 + index), `asset-${index}`),
      );
      const inputEdges: Edge[] = sourceNodes.map((visual, index) => ({
        ...edges[0]!,
        id: `input-${index}`,
        sourceNodeId: visual.id,
        inputRole: index === 0 ? 'base' : 'reference',
      }));
      const savedInputs: number[][] = [];
      const registry = new ActionRegistry();
      registry.register(createCanvasGenerateAction());
      const runner = new ActionRunner(registry);
      const providers = new ProviderRegistry();
      let received: unknown;
      providers.register({
        descriptor: { type: 'test-image', name: 'Test image', capabilities: ['image.edit'] },
        async testConnection() {
          return { ok: true };
        },
        async execute(capability, request) {
          expect(capability).toBe('image.edit');
          expect(savedInputs).toEqual(sourceNodes.map((_, index) => [index + 1, 100 + index]));
          received = request;
          return { images: [{ mimeType: 'image/png', data: new Uint8Array([9]) }] } as never;
        },
      });
      const staged: GenerationCandidate[] = [];
      const generations: Generation[] = [];
      const record = await runner.run({
        actionId: 'ai.canvasGenerate',
        context,
        input: {
          node,
          edges: [...inputEdges].reverse(),
          sourceNodes: [...sourceNodes].reverse(),
          sourceDesigns: [],
          provider,
        },
        runtime: {
          router: new CapabilityRouter(providers),
          credentials: new InMemoryProviderCredentialStore(),
          resolveImage: async (visual: ReferenceNode) => ({
            mimeType: 'image/png',
            data: new Uint8Array([visual.id.charCodeAt(0) - 96, visual.id.charCodeAt(0) + 3]),
          }),
          saveGenerationInputs: async (value: Generation, images: Array<{ data: Uint8Array }>) => {
            expect(
              value.inputSnapshots?.map((snapshot) => [snapshot.sourceNodeId, snapshot.role]),
            ).toEqual(
              sourceNodes.map((visual, index) => [visual.id, index === 0 ? 'base' : 'reference']),
            );
            savedInputs.push(...images.map((image) => [...image.data]));
            generations.push(value);
          },
          saveGeneration: async (value: Generation) => {
            generations.push(value);
          },
          stageCandidates: async (items: Array<{ metadata: GenerationCandidate }>) => {
            staged.push(...items.map((item) => item.metadata));
          },
        },
      });
      expect(record.status).toBe('success');
      expect(
        (received as { images: Array<{ data: Uint8Array }> }).images.map((image) => image.data[0]),
      ).toEqual(sourceNodes.map((_, index) => index + 1));
      expect((received as { prompt: string }).prompt).toContain('Image 1: main product or sketch');
      expect((received as { prompt: string }).prompt).toContain('Image 2: supplementary reference');
      expect((received as { prompt: string }).prompt).toContain(
        `Image ${count}: supplementary reference`,
      );
      expect(staged).toHaveLength(1);
      expect(staged[0]?.inputSignature).toBe(
        generationInputSignature(node, inputEdges, sourceNodes),
      );
      expect(generations.at(-1)?.outputDesignIds ?? []).toEqual([]);
      expect(JSON.stringify(record)).not.toContain('apiKey');
    },
  );

  it('fails safely when image editing is unsupported, without staging candidates', async () => {
    const registry = new ActionRegistry();
    registry.register(createCanvasGenerateAction());
    const runner = new ActionRunner(registry);
    const providers = new ProviderRegistry();
    providers.register({
      descriptor: { type: 'test-image', name: 'Test image', capabilities: ['text.generate'] },
      async testConnection() {
        return { ok: true };
      },
      async execute() {
        throw new Error('should not run');
      },
    });
    const generations: Generation[] = [];
    let staged = false;
    const record = await runner.run({
      actionId: 'ai.canvasGenerate',
      context,
      input: {
        node,
        edges: edges.slice(0, 1),
        sourceNodes: [source('a', 'asset-a')],
        sourceDesigns: [],
        provider,
      },
      runtime: {
        router: new CapabilityRouter(providers),
        credentials: new InMemoryProviderCredentialStore(),
        resolveImage: async () => ({ mimeType: 'image/png', data: new Uint8Array([1]) }),
        saveGeneration: async (value: Generation) => {
          generations.push(value);
        },
        stageCandidates: async () => {
          staged = true;
        },
      },
    });
    expect(record.status).toBe('failed');
    expect(staged).toBe(false);
    expect(generations.at(-1)?.status).toBe('failed');
  });

  it('does not persist or trace a Provider error that echoes a credential', async () => {
    const action = createCanvasGenerateAction();
    const generations: Generation[] = [];
    await expect(
      action.run(
        context,
        {
          node,
          edges: edges.slice(0, 1),
          sourceNodes: [source('a', 'asset-a')],
          sourceDesigns: [],
          provider,
        },
        {
          router: {
            execute: async () => {
              throw new Error('Authorization: Bearer secret-key');
            },
          } as never,
          credentials: new InMemoryProviderCredentialStore(),
          resolveImage: async () => ({ mimeType: 'image/png', data: new Uint8Array([1]) }),
          saveGeneration: async (value) => {
            generations.push(value);
          },
          stageCandidates: async () => {
            throw new Error('unexpected stage');
          },
        },
      ),
    ).rejects.toThrow('Image generation failed');
    expect(JSON.stringify(generations)).not.toContain('secret-key');
  });

  it.each([
    { destination: 'design', hasSource: true },
    { destination: 'design', hasSource: false },
    { destination: 'reference', hasSource: true },
    { destination: 'reference', hasSource: false },
  ] as const)(
    'promotes a candidate in place: $destination, existing Design: $hasSource',
    async ({ destination, hasSource }) => {
      const design: Design = {
        id: 'source-design',
        projectId: 'project',
        name: 'Lamp',
        kind: 'concept',
        status: 'exploring',
        createdAt: 1,
        updatedAt: 1,
      };
      const candidate: GenerationCandidate = {
        id: 'candidate',
        projectId: 'project',
        boardId: 'board',
        generationNodeId: node.id,
        generationId: 'generation',
        sourceDesignId: hasSource ? design.id : undefined,
        mimeType: 'image/png',
        inputSignature: 'signature',
        createdAt: 1,
        updatedAt: 1,
      };
      const generation: Generation = {
        id: 'generation',
        projectId: 'project',
        actionId: 'ai.canvasGenerate',
        providerId: 'provider',
        createdAt: 1,
        updatedAt: 1,
        status: 'success',
        sourceDesignIds: hasSource ? [design.id] : [],
        sourceAssetIds: [],
      };
      const action = createKeepCanvasCandidateAction();
      const stableNode = {
        ...node,
        id: 'stable-result',
        type: 'candidate' as const,
        candidateId: candidate.id,
        x: -45,
        y: 781,
        width: 176,
        height: 140,
      };
      const stableEdge = {
        id: 'stable-output',
        boardId: 'board',
        sourceNodeId: node.id,
        targetNodeId: stableNode.id,
        type: 'generation_output' as const,
        createdAt: 1,
        updatedAt: 1,
      };
      let accepted:
        Parameters<NonNullable<Parameters<typeof action.run>[2]['accept']>>[0] | undefined;
      const result = await action.run(
        context,
        { candidateId: candidate.id, destination },
        {
          getCandidate: async () => candidate,
          getResultNode: async () => stableNode,
          getResultEdge: async () => stableEdge,
          getCandidateSize: async () => 3,
          getGeneration: async () => generation,
          getGenerationNode: async () => node,
          getDesign: async () => design,
          accept: async (value) => {
            accepted = value;
          },
        },
      );
      expect(result.designId).toBe(accepted?.design?.id);
      expect(accepted?.design?.parentDesignId).toBe(
        destination === 'design' && hasSource ? design.id : undefined,
      );
      expect(accepted?.node.type).toBe(
        destination === 'design' ? (hasSource ? 'variant' : 'concept') : 'reference',
      );
      expect(accepted?.design?.kind).toBe(
        destination === 'design' ? (hasSource ? 'variant' : 'concept') : undefined,
      );
      expect(accepted?.relation?.type).toBe(
        destination === 'design' && hasSource ? 'variant_of' : undefined,
      );
      expect(accepted?.node).toMatchObject({
        id: stableNode.id,
        x: -45,
        y: 781,
        width: 176,
        height: 140,
      });
      expect(accepted?.outputEdge.id).toBe(stableEdge.id);
      expect(accepted?.outputEdge).toMatchObject({
        boardId: 'board',
        sourceNodeId: node.id,
        targetNodeId: accepted?.node.id,
        type: 'generation_output',
      });
      expect(result.outputEdge).toEqual(accepted?.outputEdge);
    },
  );
});
