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
  Generation,
  GenerationCandidate,
  GenerationNode,
  ReferenceNode,
} from '@open-industrial-design/design-model';
import {
  ActionRegistry,
  ActionRunner,
  createCanvasGenerateAction,
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
  it('requires a current main-image selection and routes the prepared PNG mask through the Action', async () => {
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
      edges: [...edges].reverse(),
      sourceNodes: [source('a', 'asset-a'), source('b', 'asset-b')],
      sourceDesigns: [],
      provider: { ...provider, supportsMask: true },
    };
    expect(action.validate?.(context, input)).toEqual({ ok: true });
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
    expect(received).toMatchObject({ mask: { mimeType: 'image/png', data: new Uint8Array([4]) } });
    expect(
      (received as { images: Array<{ data: Uint8Array }> }).images.map((item) => item.data[0]),
    ).toEqual([3, 2]);
    expect(records.at(-1)?.parameters?.editRegion).toEqual(region);
    expect(records.at(-1)?.parameters?.localEditProtection).toBe('selection-only-v1');
    expect(generationInputSignature(input.node, edges, input.sourceNodes)).not.toBe(
      generationInputSignature(node, edges, input.sourceNodes),
    );
  });
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
