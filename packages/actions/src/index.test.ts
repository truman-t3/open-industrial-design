import { describe, expect, it } from 'vitest';
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
  createAIAnalyzeDesignAction,
  createAIGenerateVariantAction,
  createAITextGenerateAction,
  createKeepCandidateAction,
  createVariantAction,
  createWorkspaceActions,
  type ActionContext,
} from './index';

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
