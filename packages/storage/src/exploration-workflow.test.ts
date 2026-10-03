import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  CapabilityRouter,
  InMemoryProviderCredentialStore,
  ProviderRegistry,
  type ImageEditRequest,
  type ProviderConfig,
} from '@open-industrial-design/ai-core';
import {
  PROJECT_SCHEMA_VERSION,
  type BaseNode,
  type GenerationNode,
  type ReferenceNode,
} from '@open-industrial-design/design-model';
import {
  createOidProjectArchive,
  importOidProjectArchive,
} from '@open-industrial-design/project-file';
// Test-only cross-layer integration: production storage never imports Actions.
import {
  ActionRegistry,
  ActionRunner,
  createCanvasGenerateAction,
  createGenerationStepAction,
  createKeepCanvasCandidateAction,
} from '../../actions/src/index';
import type {
  CanvasGenerateRuntime,
  KeepCanvasCandidateRuntime,
} from '../../actions/src/canvas-generation';
import {
  DexieCanvasGenerationStorage,
  DexieProjectArchiveStorage,
  DexieProjectRepository,
  OpenIndustrialDesignDatabase,
} from './index';

describe('continuous Canvas exploration across the actual persistence boundaries', () => {
  it('uses candidate A for B, adopts A in place, reruns from its unchanged image and restores all three destinations', async () => {
    const database = new OpenIndustrialDesignDatabase(`workflow-${crypto.randomUUID()}`);
    const restored = new OpenIndustrialDesignDatabase(`workflow-${crypto.randomUUID()}`);
    try {
      const repository = new DexieProjectRepository(database);
      const candidates = new DexieCanvasGenerationStorage(database);
      const archives = new DexieProjectArchiveStorage(database);
      const context = {
        projectId: 'project',
        boardId: 'board',
        selectedNodeIds: [],
        selectedDesignIds: [],
      };
      const source: ReferenceNode = {
        id: 'reference',
        boardId: 'board',
        type: 'reference',
        assetId: 'source-image',
        x: 20,
        y: 40,
        width: 160,
        height: 180,
        rotation: 0,
        zIndex: 1,
        createdAt: 1,
        updatedAt: 1,
      };
      await repository.saveSnapshot({
        project: {
          id: 'project',
          name: 'Workflow fixture',
          schemaVersion: PROJECT_SCHEMA_VERSION,
          boardIds: ['board'],
          activeBoardId: 'board',
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
        board: {
          id: 'board',
          projectId: 'project',
          name: 'Explore',
          nodeIds: [source.id],
          edgeIds: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
        nodes: [source],
      });
      await database.assets.put({
        id: 'source-image',
        projectId: 'project',
        type: 'image',
        name: 'Input fixture',
        mimeType: 'image/png',
        size: 2,
        storage: { type: 'indexeddb', blobId: 'source-image' },
        createdAt: 1,
        updatedAt: 1,
      });
      await database.assetBlobs.put({
        id: 'source-image',
        blob: new Blob([new Uint8Array([1, 2])], { type: 'image/png' }),
      });

      const registry = new ActionRegistry();
      registry.register(createGenerationStepAction());
      registry.register(createCanvasGenerateAction());
      registry.register(createKeepCanvasCandidateAction());
      const runner = new ActionRunner(registry);
      const credentials = new InMemoryProviderCredentialStore();
      await credentials.set('mock', { apiKey: 'workflow-secret-must-not-escape' });
      const provider: ProviderConfig = {
        id: 'mock',
        type: 'workflow-fixture',
        name: 'No-network fixture',
        enabled: true,
        rememberKey: false,
      };
      const inputs: number[][] = [];
      const providers = new ProviderRegistry();
      providers.register({
        descriptor: { type: provider.type, name: provider.name, capabilities: ['image.edit'] },
        async testConnection() {
          return { ok: true };
        },
        async execute(_capability, request) {
          const image = (request as ImageEditRequest).images[0]!;
          inputs.push([...image.data]);
          // The Action must persist the actual input before this external boundary.
          expect(await database.generationInputBlobs.count()).toBe(inputs.length);
          return {
            images: [{ mimeType: 'image/png', data: new Uint8Array([10 + inputs.length, 20]) }],
          } as never;
        },
      });
      const runtime: CanvasGenerateRuntime = {
        router: new CapabilityRouter(providers),
        credentials,
        async resolveImage(visual) {
          const value = visual as BaseNode & {
            candidateId?: string;
            assetId?: string;
            previewAssetId?: string;
          };
          const blob =
            value.type === 'candidate'
              ? await candidates.getCandidateBlob(value.candidateId!)
              : (await repository.getAssetBlob(value.assetId ?? value.previewAssetId ?? ''))?.blob;
          return blob
            ? { mimeType: blob.type, data: new Uint8Array(await blob.arrayBuffer()) }
            : undefined;
        },
        saveGeneration: (value) => repository.saveGeneration(value),
        saveGenerationInputs: (value, images) =>
          candidates.saveGenerationInputs(
            value,
            images.map((image, index) => ({
              id: value.inputSnapshots![index]!.id,
              projectId: value.projectId,
              generationId: value.id,
              blob: new Blob([new Uint8Array(image.data)], { type: image.mimeType }),
            })),
          ),
        async stageCandidates(items) {
          await candidates.stage(
            items.map(({ metadata, image }) => ({
              metadata,
              blob: new Blob([new Uint8Array(image.data)], { type: image.mimeType }),
            })),
          );
        },
      };
      async function step(sourceNodeId: string, label: string) {
        const before = inputs.length;
        const execution = await runner.run({
          actionId: 'workspace.createGenerationStep',
          context,
          input: { sourceNodeId, label, direction: label },
          runtime: {
            nodes: await repository.listNodes('board'),
            edges: await repository.listEdges('board'),
            saveStep: (
              node: GenerationNode,
              edge: Parameters<typeof repository.createGenerationStep>[1],
            ) => repository.createGenerationStep(node, edge),
          },
        });
        expect(execution.status).toBe('success');
        expect(inputs).toHaveLength(before); // Creating/editing operations never runs a model.
        const result = execution.result as unknown as { node: GenerationNode };
        const node = { ...result.node, count: 1 };
        await database.nodes.put(node);
        return node;
      }
      async function generate(node: GenerationNode) {
        const record = await runner.run({
          actionId: 'ai.canvasGenerate',
          context,
          input: {
            node,
            edges: await repository.listEdges('board'),
            sourceNodes: await repository.listNodes('board'),
            sourceCandidates: await candidates.listCandidates('board'),
            sourceDesigns: await repository.listDesigns('project'),
            provider,
          },
          runtime,
        });
        expect(record.status).toBe('success');
        return (record.result as unknown as { candidateIds: string[] }).candidateIds[0]!;
      }
      const keepRuntime: KeepCanvasCandidateRuntime = {
        getCandidate: (id) => candidates.getCandidate(id),
        getCandidateSize: async (id) => (await candidates.getCandidateBlob(id))!.size,
        getGeneration: (id) => candidates.getGeneration(id),
        getGenerationNode: async (id) =>
          (await repository.getNode(id)) as GenerationNode | undefined,
        getDesign: (id) => repository.getDesign(id),
        getResultNode: (id) => candidates.getResultNode(id),
        getResultEdge: (id) => candidates.getResultEdge(id),
        accept: (value) => candidates.accept(value),
      };
      async function keep(id: string, destination: 'design' | 'reference', name: string) {
        const before = (await candidates.getResultNode(id))!;
        const execution = await runner.run({
          actionId: 'ai.keepCanvasCandidate',
          context,
          input: { candidateId: id, destination, name },
          runtime: keepRuntime,
        });
        expect(execution.status).toBe('success');
        expect(await repository.getNode(before.id)).toMatchObject({
          id: before.id,
          x: before.x,
          y: before.y,
          width: before.width,
          height: before.height,
        });
        expect(await candidates.getCandidateBlob(id)).toBeUndefined();
        return (await repository.getNode(before.id))!;
      }

      const initialStep = await step(source.id, 'Render sketch');
      const a = await generate(initialStep);
      const aNode = (await candidates.getResultNode(a))!;
      expect(await repository.listDesigns('project')).toHaveLength(0);
      const downstream = await step(aNode.id, 'Explore CMF');
      const b = await generate(downstream);
      expect(inputs).toEqual([
        [1, 2],
        [11, 20],
      ]);
      expect((await candidates.getCandidate(b))?.sourceDesignId).toBeUndefined();
      await expect(candidates.discard(a)).rejects.toThrow();
      expect(await candidates.getCandidateBlob(a)).toBeDefined();

      const adoptedA = await keep(a, 'design', 'Chosen concept');
      expect(adoptedA.type).toBe('concept');
      expect(await repository.listEdges('board')).toContainEqual(
        expect.objectContaining({
          sourceNodeId: aNode.id,
          targetNodeId: downstream.id,
          type: 'generation_input',
        }),
      );
      const c = await generate(downstream);
      expect(inputs).toEqual([
        [1, 2],
        [11, 20],
        [11, 20],
      ]); // Same image after promotion, not the original reference.
      expect((await candidates.getCandidate(c))?.sourceDesignId).toBe(adoptedA.designId);
      const adoptedC = await keep(c, 'design', 'Chosen variation');
      expect(adoptedC.type).toBe('variant');
      expect(await repository.getDesign(adoptedC.designId!)).toMatchObject({
        parentDesignId: adoptedA.designId,
      });
      const adoptedB = await keep(b, 'reference', 'CMF reference');
      expect(adoptedB.type).toBe('reference');
      expect(await database.relations.count()).toBe(1);
      expect(await repository.listDesigns('project')).toHaveLength(2);

      const data = await archives.readProjectArchive('project');
      const file = await createOidProjectArchive({
        ...data.snapshot,
        assetBlobs: data.assetBlobs,
        candidateBlobs: data.candidateBlobs,
        generationInputBlobs: data.generationInputBlobs,
        exportedAt: 100,
      });
      const imported = await importOidProjectArchive(file);
      expect(JSON.stringify(imported)).not.toContain('workflow-secret-must-not-escape');
      expect(JSON.stringify(runner.getState())).not.toContain('workflow-secret-must-not-escape');
      await new DexieProjectArchiveStorage(restored).restoreProjectArchive(imported);
      const reopened = new DexieProjectRepository(restored);
      expect(await reopened.listNodes('board')).toEqual(await repository.listNodes('board'));
      expect(await reopened.listEdges('board')).toEqual(await repository.listEdges('board'));
      expect(await reopened.listDesigns('project')).toEqual(
        await repository.listDesigns('project'),
      );
      expect(await restored.candidates.count()).toBe(0);
      expect(await restored.candidateBlobs.count()).toBe(0);
      expect(await restored.relations.toArray()).toEqual(await database.relations.toArray());
      const snapshots = await restored.generationInputBlobs.toArray();
      expect(
        await Promise.all(
          snapshots.map(async (value) => [...new Uint8Array(await value.blob.arrayBuffer())]),
        ),
      ).toEqual(
        expect.arrayContaining([
          [1, 2],
          [11, 20],
          [11, 20],
        ]),
      );
      expect(snapshots).toHaveLength(3);
      for (const asset of imported.assets) {
        expect(await (await reopened.getAssetBlob(asset.id))?.blob.arrayBuffer()).toEqual(
          await (await repository.getAssetBlob(asset.id))?.blob.arrayBuffer(),
        );
      }
    } finally {
      await database.delete();
      await restored.delete();
    }
  });
});
