import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import {
  createOidProjectArchive,
  importOidProjectArchive,
  type ProjectArchiveData,
} from '@open-industrial-design/project-file';
import type { ProviderConfig } from '@open-industrial-design/ai-core';
import { createCanvasGroup, type BaseNode } from '@open-industrial-design/design-model';
import {
  createSaveViewSetAction,
  createSaveCMFSetAction,
  createVariantAction,
  createConceptFromImageAction,
  createBlankConceptAction,
  ActionRegistry,
  ActionRunner,
  createTransitionDesignStatusAction,
  createImportImageAction,
  createImportResearchImageAction,
} from '../../actions/src/index';
import {
  DexieProviderConfigRepository,
  DexieProviderCredentialStore,
  DexieProjectArchiveStorage,
  DexieProjectRepository,
  DexieCanvasGenerationStorage,
  DexieAIGenerationStorage,
  DexieThreeViewerStorage,
  OpenIndustrialDesignDatabase,
} from './index';

describe('DexieProjectRepository', () => {
  it('preserves research text and prompt evidence across generation status updates', async () => {
    const db = new OpenIndustrialDesignDatabase(`research-evidence-${crypto.randomUUID()}`);
    try {
      const inputs = new DexieCanvasGenerationStorage(db),
        runs = new DexieAIGenerationStorage(db);
      const pending = {
        id: 'run',
        projectId: 'p',
        createdAt: 1,
        updatedAt: 1,
        actionId: 'ai.analyzeMaterials',
        providerId: 'provider',
        status: 'pending' as const,
        prompt: 'Original confirmed request',
        inputSnapshots: [],
        parameters: { evidence: [], researchEvidence: [{ id: 'record', notes: 'Original claim' }] },
      };
      await inputs.saveGenerationInputs(pending, []);
      const success = {
        ...pending,
        status: 'success' as const,
        parameters: { ...pending.parameters, analysis: 'Report' },
      };
      await runs.saveGeneration(success);
      for (const changed of [
        { ...success, prompt: 'Rewritten' },
        { ...success, actionId: 'other' },
        { ...success, parameters: { ...success.parameters, researchEvidence: [] } },
      ])
        await expect(runs.saveGeneration(changed)).rejects.toThrow('immutable');
      expect(await db.generations.get('run')).toEqual(success);
    } finally {
      await db.delete();
    }
  });
  it('imports research images with collection membership atomically and no canvas side effects', async () => {
    const db = new OpenIndustrialDesignDatabase(`research-image-${crypto.randomUUID()}`);
    const repo = new DexieProjectRepository(db);
    try {
      const empty = {
        entries: [],
        collections: [
          { id: 'collection', name: 'Images', entryIds: [], createdAt: 1, updatedAt: 1 },
        ],
      };
      await db.projects.add({
        id: 'p',
        name: 'Project',
        schemaVersion: 9,
        createdAt: 1,
        updatedAt: 1,
        boardIds: [],
        settings: {},
        researchLibrary: empty,
      });
      const blob = new Blob(['image bytes'], { type: 'image/png' });
      const action = createImportResearchImageAction();
      const context = { projectId: 'p', boardId: 'b', selectedDesignIds: [], selectedNodeIds: [] };
      const input = {
        name: 'lamp.png',
        mimeType: 'image/png',
        size: blob.size,
        width: 10,
        height: 10,
        collectionId: 'collection',
        expected: empty,
      };
      const runtime = { blob, save: repo.importResearchImage.bind(repo) };
      const failedWrite = vi
        .spyOn(db.projects, 'update')
        .mockRejectedValueOnce(new Error('disk failed'));
      await expect(action.run(context, input, runtime)).rejects.toThrow('disk failed');
      failedWrite.mockRestore();
      expect(await db.assets.count()).toBe(0);
      expect(await db.assetBlobs.count()).toBe(0);
      expect((await repo.getProject('p'))?.researchLibrary).toEqual(empty);
      const result = await action.run(context, input, runtime);
      const saved = (await repo.getProject('p'))!.researchLibrary!;
      expect(saved.entries[0]?.assetId).toBe(result.assetId);
      expect(saved.collections[0]?.entryIds).toEqual([result.entryId]);
      expect(await db.nodes.count()).toBe(0);
      expect(await db.designs.count()).toBe(0);
      expect(await (await db.assetBlobs.get(result.assetId))?.blob.text()).toBe('image bytes');
      await expect(action.run(context, input, runtime)).rejects.toThrow('changed');
      await expect(
        action.run(context, { ...input, expected: saved, collectionId: 'missing' }, runtime),
      ).rejects.toThrow('missing');
      await expect(
        action.run(context, { ...input, mimeType: 'image/svg+xml' }, runtime),
      ).rejects.toThrow('Invalid');
      expect(await db.assets.count()).toBe(1);
      expect(await db.assetBlobs.count()).toBe(1);
      await repo.saveResearchLibrary('p', { entries: [], collections: [] }, saved);
      expect(await db.assets.count()).toBe(1);
      expect(await db.assetBlobs.count()).toBe(1);
    } finally {
      await db.delete();
    }
  });
  it('saves research independently of stale Canvas snapshots and rejects concurrent edits', async () => {
    const db = new OpenIndustrialDesignDatabase(`research-${crypto.randomUUID()}`);
    const repo = new DexieProjectRepository(db);
    try {
      const project = {
        id: 'p',
        name: 'Project',
        schemaVersion: 9 as const,
        createdAt: 1,
        updatedAt: 1,
        boardIds: ['b'],
        activeBoardId: 'b',
        settings: {},
      };
      const board = {
        id: 'b',
        projectId: 'p',
        name: 'Board',
        createdAt: 1,
        updatedAt: 1,
        nodeIds: [],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      };
      await repo.saveProject(project);
      await repo.saveBoard(board);
      const library = {
        entries: [
          {
            id: 'note',
            title: 'Product notes',
            notes: 'Comfortable grip',
            tags: [],
            sourceUrl: '',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        collections: [
          { id: 'board', name: 'Research', entryIds: ['note'], createdAt: 1, updatedAt: 1 },
        ],
      };
      await repo.saveResearchLibrary('p', library, undefined);
      await repo.saveSnapshot({ project, board, nodes: [] });
      await repo.saveProject({ ...project, name: 'Renamed' });
      expect((await repo.getProject('p'))?.researchLibrary).toEqual(library);
      await expect(
        repo.saveResearchLibrary('p', { entries: [], collections: [] }, undefined),
      ).rejects.toThrow('changed');
      await expect(
        repo.saveResearchLibrary('p', { ...library, entries: [] }, library),
      ).rejects.toThrow('Invalid');
      expect((await repo.getProject('p'))?.researchLibrary).toEqual(library);
      await repo.saveResearchLibrary('p', { ...library, collections: [] }, library);
      expect((await repo.getProject('p'))?.researchLibrary?.entries).toEqual(library.entries);
      expect(await db.nodes.count()).toBe(0);
      expect(await db.designs.count()).toBe(0);
      await expect(repo.saveResearchLibrary('missing', library, undefined)).rejects.toThrow(
        'missing',
      );
    } finally {
      await db.delete();
    }
  });
  it('creates blank concepts through an action and rolls back all writes on failure', async () => {
    const db = new OpenIndustrialDesignDatabase(`blank-concept-${crypto.randomUUID()}`);
    const repo = new DexieProjectRepository(db);
    try {
      await db.projects.add({
        id: 'p',
        name: 'Project',
        schemaVersion: 9,
        createdAt: 1,
        updatedAt: 1,
        boardIds: ['b'],
        activeBoardId: 'b',
        settings: {},
      });
      await db.boards.add({
        id: 'b',
        projectId: 'p',
        name: 'Board',
        nodeIds: [],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      const registry = new ActionRegistry();
      registry.register(createBlankConceptAction());
      const runner = new ActionRunner(registry);
      const request = {
        actionId: 'design.createBlankConcept',
        context: { projectId: 'p', boardId: 'b', selectedNodeIds: [], selectedDesignIds: [] },
        input: { name: '  Independent concept  ', x: 10, y: 20 },
        runtime: { create: repo.createBlankConcept.bind(repo) },
      };
      const failure = vi.spyOn(db.boards, 'put').mockRejectedValueOnce(new Error('Disk full'));
      expect((await runner.run(request)).status).toBe('failed');
      failure.mockRestore();
      expect(await db.designs.count()).toBe(0);
      expect(await db.nodes.count()).toBe(0);
      expect((await db.projects.get('p'))?.updatedAt).toBe(1);
      expect((await db.boards.get('b'))?.nodeIds).toEqual([]);
      expect((await runner.run(request)).status).toBe('success');
      const design = (await db.designs.toArray())[0];
      const node = (await db.nodes.toArray())[0];
      expect(design.name).toBe('Independent concept');
      expect(design.parentDesignId).toBeUndefined();
      expect(node).toMatchObject({ type: 'concept', designId: design.id, x: 10, y: 20 });
      expect((await db.boards.get('b'))?.nodeIds).toEqual([node.id]);
      expect(await db.assets.count()).toBe(0);
      expect(await db.relations.count()).toBe(0);
      for (const input of [
        { name: '', x: 0, y: 0 },
        { name: 'x'.repeat(201), x: 0, y: 0 },
        { name: 'Bad', x: NaN, y: 0 },
      ]) {
        expect((await runner.run({ ...request, input })).status).toBe('failed');
        await expect(repo.createBlankConcept('p', 'b', input)).rejects.toThrow();
      }
      await expect(repo.createBlankConcept('other', 'b', request.input)).rejects.toThrow();
      await db.projects.update('p', { boardIds: [] });
      await expect(repo.createBlankConcept('p', 'b', request.input)).rejects.toThrow();
      expect(await db.designs.count()).toBe(1);
      expect(await db.nodes.count()).toBe(1);
    } finally {
      await db.delete();
    }
  });
  it('imports image and reference cards atomically and rejects collisions or wrong ownership', async () => {
    const db = new OpenIndustrialDesignDatabase(`image-import-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(db);
    try {
      await db.projects.add({
        id: 'p',
        name: 'Images',
        schemaVersion: 9,
        createdAt: 1,
        updatedAt: 1,
        boardIds: ['b'],
        activeBoardId: 'b',
        settings: {},
      });
      await db.boards.add({
        id: 'b',
        projectId: 'p',
        name: 'Board',
        nodeIds: [],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      const blob = new Blob(['image bytes'], { type: 'image/png' });
      let counter = 0;
      const action = createImportImageAction(
        () => `image-${++counter}`,
        () => 42,
      );
      const context = { projectId: 'p', boardId: 'b', selectedNodeIds: [], selectedDesignIds: [] };
      const input = {
        name: '产品参考.png',
        kind: 'image' as const,
        mimeType: 'image/png',
        size: blob.size,
        width: 10,
        height: 20,
        x: 20,
        y: 30,
      };
      const runtime = { blob, save: repository.importLocalImage.bind(repository) };
      const result = await action.run(context, input, runtime);
      expect(await db.nodes.get(result.node.id)).toMatchObject({
        type: 'image',
        assetId: result.asset.id,
      });
      expect((await db.boards.get('b'))?.nodeIds).toEqual([result.node.id]);
      const fail = vi.spyOn(db.boards, 'put').mockRejectedValueOnce(new Error('disk full'));
      await expect(action.run(context, { ...input, kind: 'reference' }, runtime)).rejects.toThrow(
        'disk full',
      );
      fail.mockRestore();
      expect(await db.nodes.count()).toBe(1);
      expect(await db.assets.count()).toBe(1);
      expect(await db.assetBlobs.count()).toBe(1);
      const reference = await action.run(context, { ...input, kind: 'reference' }, runtime);
      expect(reference.node.type).toBe('reference');
      await expect(repository.importLocalImage(result.asset, result.node, blob)).rejects.toThrow();
      await expect(
        repository.importLocalImage({ ...result.asset, projectId: 'wrong' }, result.node, blob),
      ).rejects.toThrow('Invalid');
      await expect(
        repository.importLocalImage({ ...result.asset, size: 99 }, result.node, blob),
      ).rejects.toThrow('Invalid');
      expect(await db.assets.count()).toBe(2);
      expect(await db.nodes.count()).toBe(2);
      expect(await db.generations.count()).toBe(0);
      expect(await db.designs.count()).toBe(0);
      const portable = await new DexieProjectArchiveStorage(db).readProjectArchive('p');
      const archive = await createOidProjectArchive({
        ...portable.snapshot,
        assetBlobs: portable.assetBlobs,
        candidateBlobs: portable.candidateBlobs,
        generationInputBlobs: portable.generationInputBlobs,
      });
      const restored = await importOidProjectArchive(archive);
      expect(restored.nodes).toHaveLength(2);
    } finally {
      await db.delete();
    }
  });
  it('saves manual CMF alternatives atomically without AI or lineage changes', async () => {
    const db = new OpenIndustrialDesignDatabase(`cmf-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(db);
    try {
      await db.projects.add({
        id: 'p',
        name: 'CMF',
        schemaVersion: 9,
        createdAt: 1,
        updatedAt: 1,
        boardIds: ['b'],
        activeBoardId: 'b',
        settings: {},
      });
      await db.boards.add({
        id: 'b',
        projectId: 'p',
        name: 'Board',
        nodeIds: [],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await db.designs.add({
        id: 'd',
        projectId: 'p',
        name: 'Lamp',
        kind: 'concept',
        status: 'exploring',
        createdAt: 1,
        updatedAt: 1,
      });
      await db.assets.add({
        id: 'a',
        projectId: 'p',
        name: 'Texture',
        type: 'texture',
        mimeType: 'image/png',
        size: 1,
        storage: { type: 'indexeddb', blobId: 'blob' },
        createdAt: 1,
        updatedAt: 1,
      });
      await db.assetBlobs.add({ id: 'blob', blob: new Blob(['x']) });
      let counter = 0;
      let time = 42;
      const action = createSaveCMFSetAction(
        () => `cmf-${++counter}`,
        () => time,
      );
      const context = { projectId: 'p', boardId: 'b', selectedNodeIds: [], selectedDesignIds: [] };
      const input = {
        designId: 'd',
        name: 'Warm and cool',
        x: 20,
        y: 30,
        variants: [
          {
            name: 'Warm',
            color: { name: 'Ivory', hex: '#EFEADD' },
            material: 'ABS',
            finish: 'Matte',
            notes: 'Shell',
            textureAssetId: 'a',
          },
          { name: 'Cool', material: 'Aluminum' },
        ],
      };
      const runtime = { saveCMFSetWithNode: repository.saveCMFSetWithNode.bind(repository) };
      const saved = await action.run(context, input, runtime);
      expect(saved.cmfSet.variantIds).toEqual(saved.variants.map((v) => v.id));
      expect((await db.boards.get('b'))?.nodeIds).toEqual([saved.node!.id]);
      input.variants[0]!.color!.hex = '#000000';
      expect(saved.variants[0]?.color?.hex).toBe('#EFEADD');
      time = 80;
      const edited = await action.run(
        context,
        {
          ...input,
          cmfSetId: saved.cmfSet.id,
          variants: [{ id: saved.variants[0]!.id, name: 'Updated', finish: 'Satin' }],
        },
        runtime,
      );
      expect(edited.cmfSet.createdAt).toBe(42);
      expect(edited.variants[0]).toMatchObject({ createdAt: 42, updatedAt: 80, finish: 'Satin' });
      expect(edited.variants[0]?.color).toBeUndefined();
      expect(await db.nodes.count()).toBe(1);
      // Removing a membership never deletes another set's potentially shared variant or its asset.
      expect(await db.cmfVariants.get(saved.variants[1]!.id)).toBeDefined();
      expect(await db.assetBlobs.count()).toBe(1);
      expect(await db.generations.count()).toBe(0);
      expect((await db.designs.get('d'))?.updatedAt).toBe(1);
      const portable = await new DexieProjectArchiveStorage(db).readProjectArchive('p');
      const restored = await importOidProjectArchive(
        await createOidProjectArchive({
          ...portable.snapshot,
          assetBlobs: portable.assetBlobs,
          candidateBlobs: portable.candidateBlobs,
          generationInputBlobs: portable.generationInputBlobs,
        }),
      );
      expect(restored.cmfSets[0]).toEqual(edited.cmfSet);
      expect(restored.nodes[0]).toMatchObject({ cmfSetId: saved.cmfSet.id });
      for (const invalid of [
        [],
        [{ color: { hex: 'red' } }],
        [{ name: 'x', apiKey: 'not-allowed' }],
        [{ id: 'duplicate' }, { id: 'duplicate' }],
        [{ notes: 'x'.repeat(4001) }],
      ]) {
        expect(action.validate(context, { ...input, variants: invalid } as never).ok).toBe(false);
      }
      await db.assets.update('a', { projectId: 'other' });
      await expect(action.run(context, input, runtime)).rejects.toThrow('unavailable');
      expect(await db.cmfSets.count()).toBe(1);
      await db.assets.update('a', { projectId: 'p' });
      await expect(
        action.run(context, { ...input, variants: [{ id: saved.variants[0]!.id }] }, runtime),
      ).rejects.toThrow('ownership');
      const collision = createSaveCMFSetAction(
        () => saved.node!.id,
        () => 99,
      );
      await expect(
        collision.run(context, { ...input, variants: [{ name: 'Only' }] }, runtime),
      ).rejects.toThrow();
      expect(await db.cmfSets.count()).toBe(1);
      expect(await db.cmfVariants.count()).toBe(2);
      expect((await db.boards.get('b'))?.nodeIds).toEqual([saved.node!.id]);
      const writeFailure = vi
        .spyOn(db.cmfSets, 'put')
        .mockRejectedValueOnce(new Error('disk-full'));
      await expect(action.run(context, input, runtime)).rejects.toThrow('disk-full');
      writeFailure.mockRestore();
      expect(await db.nodes.count()).toBe(1);
      expect(await db.cmfVariants.count()).toBe(2);
      expect((await db.boards.get('b'))?.nodeIds).toEqual([saved.node!.id]);
      await db.nodes.delete(saved.node!.id);
      await db.boards.update('b', { nodeIds: [] });
      const placed = await action.run(
        context,
        {
          ...input,
          cmfSetId: saved.cmfSet.id,
          placeOnBoard: true,
          variants: [{ id: saved.variants[0]!.id, name: 'Retained' }],
        },
        runtime,
      );
      expect(placed.node?.id).not.toBe(saved.node!.id);
      expect(placed.cmfSet.id).toBe(saved.cmfSet.id);
      expect(await repository.listCMFSets('p')).toHaveLength(1);
      expect(await repository.listCMFVariants('p')).toHaveLength(2);
      const variantAction = createVariantAction();
      const parent = (await repository.getDesign('d'))!;
      const variantInput = {
        sourceDesign: parent,
        name: '  Manual branch  ',
        x: 400,
        y: 40,
        previewAssetId: 'a',
      };
      const variantRuntime = {
        persistVariant: (value: Parameters<typeof repository.saveManualVariant>[1]) =>
          repository.saveManualVariant('p', value),
      };
      await db.designs.update('d', {
        dna: {
          silhouetteLocked: true,
          proportionLocked: false,
          geometryLocked: true,
          detailLocked: false,
          cmfLocked: false,
          brandLocked: false,
          notes: ['Current persisted constraint'],
        },
      });
      const local = await variantAction.run(context, variantInput, variantRuntime);
      expect(await db.designs.get(local.designId)).toMatchObject({
        parentDesignId: 'd',
        kind: 'variant',
        name: 'Manual branch',
        dna: { geometryLocked: true, notes: ['Current persisted constraint'] },
      });
      expect(await db.nodes.get(local.nodeId)).toMatchObject({
        designId: local.designId,
        previewAssetId: 'a',
      });
      expect(await db.relations.get(local.relationId)).toMatchObject({
        sourceDesignId: 'd',
        targetDesignId: local.designId,
        type: 'variant_of',
      });
      expect(await db.generations.count()).toBe(0);
      expect(await db.assetBlobs.count()).toBe(1);
      const relationFailure = vi
        .spyOn(db.relations, 'add')
        .mockRejectedValueOnce(new Error('disk-full'));
      await expect(variantAction.run(context, variantInput, variantRuntime)).rejects.toThrow(
        'disk-full',
      );
      relationFailure.mockRestore();
      expect(await db.designs.count()).toBe(2);
      expect(await db.nodes.count()).toBe(2);
      expect(await db.relations.count()).toBe(1);
      await db.assets.update('a', { projectId: 'other' });
      await expect(variantAction.run(context, variantInput, variantRuntime)).rejects.toThrow(
        'unavailable',
      );
      expect(variantAction.validate(context, { ...variantInput, x: Infinity }).ok).toBe(false);
      await db.assets.update('a', { projectId: 'p' });
      const branchArchive = await new DexieProjectArchiveStorage(db).readProjectArchive('p');
      const branchRestored = await importOidProjectArchive(
        await createOidProjectArchive({
          ...branchArchive.snapshot,
          assetBlobs: branchArchive.assetBlobs,
          candidateBlobs: branchArchive.candidateBlobs,
          generationInputBlobs: branchArchive.generationInputBlobs,
        }),
      );
      expect(branchRestored.designs.find((d) => d.id === local.designId)?.parentDesignId).toBe('d');
      const reference = {
        id: 'reference',
        boardId: 'b',
        type: 'reference',
        assetId: 'a',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        rotation: 0,
        zIndex: 1,
        createdAt: 1,
        updatedAt: 1,
      };
      await db.nodes.add(reference as BaseNode);
      const boardBefore = (await db.boards.get('b'))!;
      await db.boards.update('b', { nodeIds: [...boardBefore.nodeIds, reference.id] });
      const conceptAction = createConceptFromImageAction();
      const conceptRuntime = { create: repository.createConceptFromImage.bind(repository) };
      const conceptInput = { sourceNodeId: reference.id, name: 'From reference', x: 600, y: 0 };
      const concept = await conceptAction.run(context, conceptInput, conceptRuntime);
      expect(await db.nodes.get(reference.id)).toEqual(reference);
      expect(await db.designs.get(concept.designId)).toMatchObject({
        kind: 'concept',
        name: 'From reference',
      });
      expect((await db.designs.get(concept.designId))?.parentDesignId).toBeUndefined();
      expect(await db.nodes.get(concept.nodeId)).toMatchObject({ previewAssetId: 'a' });
      expect((await repository.listEdges('b'))[0]).toMatchObject({
        sourceNodeId: reference.id,
        targetNodeId: concept.nodeId,
        type: 'references',
      });
      expect(await db.relations.count()).toBe(1);
      expect(await db.assetBlobs.count()).toBe(1);
      expect(await db.generations.count()).toBe(0);
      const conceptFailure = vi
        .spyOn(db.edges, 'add')
        .mockRejectedValueOnce(new Error('disk-full'));
      await expect(conceptAction.run(context, conceptInput, conceptRuntime)).rejects.toThrow(
        'disk-full',
      );
      conceptFailure.mockRestore();
      expect(await db.designs.count()).toBe(3);
      expect(await db.nodes.count()).toBe(4);
      expect(await db.edges.count()).toBe(1);
      await expect(
        conceptAction.run(context, { ...conceptInput, sourceNodeId: local.nodeId }, conceptRuntime),
      ).rejects.toThrow('source');
      await db.assets.update('a', { projectId: 'other' });
      await expect(conceptAction.run(context, conceptInput, conceptRuntime)).rejects.toThrow(
        'unavailable',
      );
      await db.assets.update('a', { projectId: 'p' });
      const conceptArchive = await new DexieProjectArchiveStorage(db).readProjectArchive('p');
      const restoredConcept = await importOidProjectArchive(
        await createOidProjectArchive({
          ...conceptArchive.snapshot,
          assetBlobs: conceptArchive.assetBlobs,
          candidateBlobs: conceptArchive.candidateBlobs,
          generationInputBlobs: conceptArchive.generationInputBlobs,
        }),
      );
      expect(restoredConcept.edges[0]?.targetNodeId).toBe(concept.nodeId);
      const decisionAction = createTransitionDesignStatusAction();
      const decisionRuntime = { transition: repository.transitionDesignDecision.bind(repository) };
      const beforeDecision = (await db.designs.get(concept.designId))!;
      await expect(
        decisionAction.run(
          context,
          { designId: concept.designId, expectedStatus: 'exploring', status: 'approved' },
          decisionRuntime,
        ),
      ).rejects.toThrow('transition');
      const candidate = await decisionAction.run(
        context,
        { designId: concept.designId, expectedStatus: 'exploring', status: 'candidate' },
        decisionRuntime,
      );
      expect(candidate.status).toBe('candidate');
      expect({
        ...candidate,
        status: beforeDecision.status,
        updatedAt: beforeDecision.updatedAt,
      }).toEqual(beforeDecision);
      await expect(
        decisionAction.run(
          context,
          { designId: concept.designId, expectedStatus: 'exploring', status: 'candidate' },
          decisionRuntime,
        ),
      ).rejects.toThrow('changed');
      await expect(
        decisionAction.run(
          { ...context, projectId: 'other' },
          { designId: concept.designId, expectedStatus: 'candidate', status: 'review' },
          decisionRuntime,
        ),
      ).rejects.toThrow('changed');
      const projectWriteFailure = vi
        .spyOn(db.projects, 'update')
        .mockRejectedValueOnce(new Error('disk-full'));
      await expect(
        decisionAction.run(
          context,
          { designId: concept.designId, expectedStatus: 'candidate', status: 'review' },
          decisionRuntime,
        ),
      ).rejects.toThrow('disk-full');
      projectWriteFailure.mockRestore();
      expect((await db.designs.get(concept.designId))?.status).toBe('candidate');
      await decisionAction.run(
        context,
        { designId: concept.designId, expectedStatus: 'candidate', status: 'review' },
        decisionRuntime,
      );
      await decisionAction.run(
        context,
        { designId: concept.designId, expectedStatus: 'review', status: 'approved' },
        decisionRuntime,
      );
      expect(
        decisionAction.validate(context, {
          designId: concept.designId,
          expectedStatus: 'approved',
          status: 'anything',
        } as never).ok,
      ).toBe(false);
      const decisionsArchive = await new DexieProjectArchiveStorage(db).readProjectArchive('p');
      const restoredDecisions = await importOidProjectArchive(
        await createOidProjectArchive({
          ...decisionsArchive.snapshot,
          assetBlobs: decisionsArchive.assetBlobs,
          candidateBlobs: decisionsArchive.candidateBlobs,
          generationInputBlobs: decisionsArchive.generationInputBlobs,
        }),
      );
      expect(restoredDecisions.designs.find((d) => d.id === concept.designId)?.status).toBe(
        'approved',
      );
      await decisionAction.run(
        context,
        { designId: concept.designId, expectedStatus: 'approved', status: 'archived' },
        decisionRuntime,
      );
      await expect(
        decisionAction.run(
          context,
          { designId: concept.designId, expectedStatus: 'archived', status: 'exploring' },
          decisionRuntime,
        ),
      ).rejects.toThrow('transition');
      expect(await db.nodes.count()).toBe(4);
      expect(await db.generations.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
  it('creates manual view records and cards atomically, edits in place, and rejects unrelated assets', async () => {
    const database = new OpenIndustrialDesignDatabase(`views-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    try {
      await database.projects.add({
        id: 'p',
        name: 'Views',
        schemaVersion: 9,
        createdAt: 1,
        updatedAt: 1,
        boardIds: ['b'],
        activeBoardId: 'b',
        settings: {},
      });
      await database.boards.add({
        id: 'b',
        projectId: 'p',
        name: 'Board',
        nodeIds: [],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await database.designs.add({
        id: 'd',
        projectId: 'p',
        name: 'Lamp',
        kind: 'concept',
        status: 'exploring',
        createdAt: 1,
        updatedAt: 1,
      });
      await database.assets.add({
        id: 'a',
        projectId: 'p',
        name: 'Front',
        type: 'image',
        mimeType: 'image/png',
        size: 1,
        storage: { type: 'indexeddb', blobId: 'blob' },
        createdAt: 1,
        updatedAt: 1,
      });
      await database.assetBlobs.add({ id: 'blob', blob: new Blob(['x']) });
      let counter = 0;
      const action = createSaveViewSetAction(
        () => `id-${++counter}`,
        () => 42,
      );
      const context = { projectId: 'p', boardId: 'b', selectedNodeIds: [], selectedDesignIds: [] };
      const input = { designId: 'd', name: 'Views', views: { front: 'a' }, x: 20, y: 40 };
      const runtime = { saveViewSetWithNode: repository.saveViewSetWithNode.bind(repository) };
      const result = await action.run(context, input, runtime);
      expect(await database.nodes.get(result.node!.id)).toMatchObject({
        viewSetId: result.viewSet.id,
        designId: 'd',
      });
      expect((await database.boards.get('b'))?.nodeIds).toEqual([result.node!.id]);
      await action.run(
        context,
        { ...input, viewSetId: result.viewSet.id, views: { left: 'a', right: 'a' } },
        runtime,
      );
      expect((await repository.listViewSets('p'))[0]?.views).toEqual({ left: 'a', right: 'a' });
      expect(await database.nodes.count()).toBe(1);
      expect(await database.generations.count()).toBe(0);
      const portable = await new DexieProjectArchiveStorage(database).readProjectArchive('p');
      const restored = await importOidProjectArchive(
        await createOidProjectArchive({
          ...portable.snapshot,
          assetBlobs: portable.assetBlobs,
          candidateBlobs: portable.candidateBlobs,
          generationInputBlobs: portable.generationInputBlobs,
        }),
      );
      expect(restored.viewSets[0]?.views).toEqual({ left: 'a', right: 'a' });
      expect(restored.nodes[0]).toMatchObject({ viewSetId: result.viewSet.id, designId: 'd' });
      expect((await database.designs.get('d'))?.updatedAt).toBe(1);
      await database.assets.update('a', { projectId: 'other' });
      await expect(action.run(context, input, runtime)).rejects.toThrow('unavailable');
      expect(await database.viewSets.count()).toBe(1);
      await database.assets.update('a', { projectId: 'p' });
      const duplicateNodeAction = createSaveViewSetAction(
        () => result.node!.id,
        () => 50,
      );
      await expect(duplicateNodeAction.run(context, input, runtime)).rejects.toThrow();
      expect(await database.viewSets.count()).toBe(1);
      expect((await database.boards.get('b'))?.nodeIds).toEqual([result.node!.id]);
      expect(action.validate(context, { ...input, views: { side: 'a' } } as never).ok).toBe(false);
      await database.nodes.delete(result.node!.id);
      await database.boards.update('b', { nodeIds: [] });
      const placed = await action.run(
        context,
        { ...input, viewSetId: result.viewSet.id, placeOnBoard: true },
        runtime,
      );
      expect(placed.node?.id).not.toBe(result.node!.id);
      expect(placed.viewSet.id).toBe(result.viewSet.id);
      expect(placed.viewSet.createdAt).toBe(42);
      expect(await database.viewSets.count()).toBe(1);
      await expect(
        action.run(context, { ...input, viewSetId: 'missing', placeOnBoard: true }, runtime),
      ).rejects.toThrow('ownership');
      expect(await database.nodes.count()).toBe(1);
      expect(action.validate(context, { ...input, x: Infinity }).ok).toBe(false);
    } finally {
      await database.delete();
    }
  });
  it('searches local material metadata and copies cross-project files atomically without lineage', async () => {
    const database = new OpenIndustrialDesignDatabase(`materials-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    try {
      for (const id of ['source', 'target']) {
        await database.projects.add({
          id,
          name: id,
          schemaVersion: 9,
          createdAt: 1,
          updatedAt: 1,
          boardIds: [id],
          activeBoardId: id,
          settings: {},
        });
        await database.boards.add({
          id,
          projectId: id,
          name: id,
          nodeIds: [],
          edgeIds: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: 1,
          updatedAt: 1,
        });
      }
      await database.assets.add({
        id: 'lamp',
        projectId: 'source',
        name: 'Warm Lamp',
        type: 'image',
        mimeType: 'image/png',
        size: 4,
        storage: { type: 'indexeddb', blobId: 'lamp-blob' },
        metadata: { designId: 'source-design' },
        thumbnailAssetId: 'source-thumb',
        createdAt: 1,
        updatedAt: 1,
      });
      await database.assetBlobs.add({
        id: 'lamp-blob',
        blob: new Blob(['lamp'], { type: 'image/png' }),
      });
      const reference = {
        id: 'reference',
        type: 'reference' as const,
        boardId: 'source',
        assetId: 'lamp',
        notes: '磨砂陶瓷',
        referenceType: 'cmf' as const,
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        rotation: 0,
        zIndex: 1,
        createdAt: 1,
        updatedAt: 1,
      };
      await database.nodes.add(reference);
      expect(
        (await repository.searchLocalMaterials('LAMP 陶瓷')).map((entry) => entry.asset.id),
      ).toEqual(['lamp']);
      expect(await repository.searchLocalMaterials('lamp', 'target')).toEqual([]);
      expect(await repository.searchLocalMaterials('absent')).toEqual([]);
      const knowledge = {
        notes: 'Keep the grip comfortable',
        tags: ['ergonomics', 'handheld'],
        sourceUrl: 'https://example.com/design',
      };
      await repository.saveMaterialKnowledge('source', 'lamp', knowledge);
      expect(
        (await repository.searchLocalMaterials('ergonomics comfortable')).map(
          (item) => item.asset.id,
        ),
      ).toEqual(['lamp']);
      await expect(repository.saveMaterialKnowledge('target', 'lamp', knowledge)).rejects.toThrow();
      await expect(
        repository.saveMaterialKnowledge('source', 'lamp', {
          ...knowledge,
          sourceUrl: 'javascript:alert(1)',
        }),
      ).rejects.toThrow();
      expect((await repository.getAsset('lamp'))?.knowledge).toEqual(knowledge);
      const same = await repository.placeLocalMaterial('source', 'lamp', {
        ...reference,
        id: 'same',
      });
      expect(same.asset.id).toBe('lamp');
      expect(await database.assets.count()).toBe(1);
      const copied = await repository.placeLocalMaterial('target', 'lamp', {
        ...reference,
        id: 'copy',
        boardId: 'target',
      });
      expect(copied.asset.id).not.toBe('lamp');
      expect(copied.asset.projectId).toBe('target');
      expect(copied.asset.metadata).toBeUndefined();
      expect(copied.asset.knowledge).toEqual(knowledge);
      expect(copied.asset.thumbnailAssetId).toBeUndefined();
      expect(copied.node.assetId).toBe(copied.asset.id);
      expect((await database.boards.get('target'))?.nodeIds).toEqual(['copy']);
      const before = [await database.assets.count(), await database.assetBlobs.count()];
      await expect(
        repository.placeLocalMaterial('target', 'lamp', {
          ...reference,
          id: 'copy',
          boardId: 'target',
        }),
      ).rejects.toThrow();
      expect([await database.assets.count(), await database.assetBlobs.count()]).toEqual(before);
      await expect(
        repository.placeLocalMaterial('target', 'lamp', { ...reference, id: 'wrong' }),
      ).rejects.toThrow();
      await database.assetBlobs.delete('lamp-blob');
      await expect(
        repository.placeLocalMaterial('source', 'lamp', { ...reference, id: 'missing' }),
      ).rejects.toThrow('missing');
      const copyBlob = await repository.getAssetBlob(copied.asset.id);
      expect(copyBlob?.blob.size).toBe(4);
      expect(await database.designs.count()).toBe(0);
    } finally {
      await database.delete();
    }
  });
  it('atomically saves node and edge endpoints through undo/redo without touching other Boards', async () => {
    const database = new OpenIndustrialDesignDatabase(`snapshot-edges-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    const snapshot = {
      project: {
        id: 'p',
        name: 'Test',
        schemaVersion: 9 as const,
        createdAt: 1,
        updatedAt: 1,
        boardIds: ['b', 'other'],
        activeBoardId: 'b',
        settings: {},
      },
      board: {
        id: 'b',
        name: 'Board',
        projectId: 'p',
        createdAt: 1,
        updatedAt: 1,
        nodeIds: ['source', 'task'],
        edgeIds: ['input'],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      nodes: ['source', 'task'].map((id) => ({
        id,
        boardId: 'b',
        type: 'text' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: 0,
        createdAt: 1,
        updatedAt: 1,
      })),
      edges: [
        {
          id: 'input',
          boardId: 'b',
          sourceNodeId: 'source',
          targetNodeId: 'task',
          type: 'generation_input' as const,
          inputRole: 'base' as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const otherEdge = { ...snapshot.edges[0], id: 'other-edge', boardId: 'other' };
    await repository.saveEdge(otherEdge);
    await repository.saveSnapshot(snapshot);
    expect(await repository.listEdges('b')).toEqual(snapshot.edges);
    // Undo step creation: dangling input must not remain in persistence or Board indexes.
    await repository.saveSnapshot({ ...snapshot, nodes: snapshot.nodes.slice(0, 1) });
    expect(await repository.listEdges('b')).toEqual([]);
    expect((await repository.getBoard('b'))?.edgeIds).toEqual([]);
    // Redo uses the retained UI edge snapshot, not an already-deleted database edge.
    await repository.saveSnapshot(snapshot);
    expect(await repository.listEdges('b')).toEqual(snapshot.edges);
    expect((await repository.getBoard('b'))?.edgeIds).toEqual(['input']);
    expect(await repository.listEdges('other')).toEqual([otherEdge]);
    const failedWrite = vi
      .spyOn(database.edges, 'bulkPut')
      .mockRejectedValueOnce(new Error('write failed'));
    await expect(
      repository.saveSnapshot({ ...snapshot, nodes: snapshot.nodes.slice(0, 1) }),
    ).rejects.toThrow('write failed');
    failedWrite.mockRestore();
    expect((await repository.loadSnapshot('p'))?.nodes).toEqual(snapshot.nodes);
    expect(await repository.listEdges('b')).toEqual(snapshot.edges);
    expect((await repository.getBoard('b'))?.edgeIds).toEqual(['input']);
    const group = createCanvasGroup(snapshot.nodes, ['source', 'task'], 'group', 'Group', 3);
    await repository.saveSnapshot({ ...snapshot, nodes: [...snapshot.nodes, group] });
    await repository.deleteCanvasNodes('b', ['source']);
    expect(await repository.listNodes('b')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'group', childNodeIds: ['task'] })]),
    );
    const invalid: BaseNode[] = [
      ...snapshot.nodes,
      { ...group, childNodeIds: ['missing'] } as typeof group,
    ];
    await expect(repository.saveSnapshot({ ...snapshot, nodes: invalid })).rejects.toThrow();
    expect((await repository.listNodes('b')).some((node) => node.id === 'source')).toBe(false);
    await repository.deleteCanvasNodes('b', ['group']);
    expect((await repository.listNodes('b')).map((node) => node.id)).toEqual(['task']);
    await database.delete();
  });
  it('protects a candidate with downstream inputs at the repository boundary', async () => {
    const db = new OpenIndustrialDesignDatabase(`references-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(db);
    const result = {
      id: 'result',
      type: 'candidate' as const,
      candidateId: 'candidate',
      boardId: 'board',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    const downstream = { ...result, id: 'task', type: 'generation' as const };
    const edge = {
      id: 'input',
      boardId: 'board',
      sourceNodeId: 'result',
      targetNodeId: 'task',
      type: 'generation_input' as const,
      inputRole: 'base' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    try {
      await db.boards.put({
        id: 'board',
        projectId: 'project',
        name: 'Test',
        nodeIds: ['result', 'task'],
        edgeIds: ['input'],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await db.nodes.bulkPut([result, downstream]);
      await db.edges.put(edge);
      await db.nodes.put({ ...result, id: 'foreign', boardId: 'another-board' });
      await expect(repository.deleteCanvasNodes('board', ['result', 'foreign'])).rejects.toThrow(
        /unavailable/,
      );
      await expect(repository.deleteCanvasNodes('board', ['missing'])).rejects.toThrow(
        /unavailable/,
      );
      expect(await db.nodes.get('foreign')).toBeDefined();
      expect(await db.nodes.get('result')).toBeDefined();
      await db.nodes.update('result', { locked: true });
      await expect(repository.deleteCanvasNodes('board', ['result'])).rejects.toThrow(/locked/);
      await db.nodes.update('result', { locked: false });
      await expect(repository.deleteCanvasNodes('board', ['result'])).rejects.toThrow(
        /Disconnect downstream/,
      );
      expect(await db.nodes.get('result')).toBeDefined();
      expect(await db.edges.get('input')).toBeDefined();
      await repository.deleteBoardEdge(edge);
      await repository.deleteCanvasNodes('board', ['result']);
      expect(await db.nodes.get('result')).toBeUndefined();
      expect(await db.nodes.get('task')).toBeDefined();
    } finally {
      await db.delete();
    }
  });
  it('owns input snapshots by generation and rolls back incomplete or repeated writes', async () => {
    const db = new OpenIndustrialDesignDatabase(`inputs-${crypto.randomUUID()}`);
    const storage = new DexieCanvasGenerationStorage(db);
    const generation = {
      id: 'run',
      projectId: 'project',
      createdAt: 1,
      updatedAt: 1,
      actionId: 'ai.canvasGenerate',
      providerId: 'test',
      status: 'pending' as const,
      sourceDesignIds: [],
      inputSnapshots: [
        {
          id: 'input',
          sourceNodeId: 'candidate-node',
          candidateId: 'candidate',
          role: 'base' as const,
          mimeType: 'image/png',
        },
      ],
    };
    const inputs = [
      {
        id: 'input',
        projectId: 'project',
        generationId: 'run',
        blob: new Blob([new Uint8Array([8])], { type: 'image/png' }),
      },
    ];
    try {
      await expect(storage.saveGenerationInputs(generation, [])).rejects.toThrow(/incomplete/);
      expect(await db.generations.count()).toBe(0);
      expect(await db.generationInputBlobs.count()).toBe(0);
      await storage.saveGenerationInputs(generation, inputs);
      const statusStorage = new DexieAIGenerationStorage(db);
      await statusStorage.saveGeneration({ ...generation, status: 'success', updatedAt: 2 });
      expect((await db.generations.get('run'))?.status).toBe('success');
      await expect(
        statusStorage.saveGeneration({ ...generation, inputSnapshots: undefined }),
      ).rejects.toThrow(/immutable/);
      await expect(
        new DexieProjectRepository(db).saveGeneration({
          ...generation,
          inputSnapshots: [{ ...generation.inputSnapshots[0]!, candidateId: 'other' }],
        }),
      ).rejects.toThrow(/immutable/);
      await expect(
        statusStorage.saveGeneration({ ...generation, projectId: 'other' }),
      ).rejects.toThrow(/ownership/);
      expect((await db.generations.get('run'))?.status).toBe('success');
      expect((await db.generations.get('run'))?.inputSnapshots).toEqual(generation.inputSnapshots);
      await expect(storage.saveGenerationInputs(generation, inputs)).rejects.toThrow(/immutable/);
      expect(
        new Uint8Array(await (await db.generationInputBlobs.get('input'))!.blob.arrayBuffer()),
      ).toEqual(new Uint8Array([8]));
      await new DexieProjectRepository(db).deleteProject('project');
      expect(await db.generationInputBlobs.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
  it('atomically creates a generation step and rejects missing inputs without partial records', async () => {
    const db = new OpenIndustrialDesignDatabase(`step-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(db);
    const source = {
      id: 'source',
      type: 'image' as const,
      boardId: 'board',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    const node = {
      ...source,
      id: 'step',
      type: 'generation' as const,
      label: 'CMF',
      direction: 'Finishes',
      notes: '',
      count: 2,
    };
    const edge = {
      id: 'input',
      boardId: 'board',
      sourceNodeId: 'source',
      targetNodeId: 'step',
      type: 'generation_input' as const,
      inputRole: 'base' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    try {
      await db.boards.put({
        id: 'board',
        projectId: 'project',
        name: 'Test',
        nodeIds: ['source'],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await db.nodes.put(source);
      await expect(
        repository.createGenerationStep(node, { ...edge, sourceNodeId: 'missing' }),
      ).rejects.toThrow();
      expect(await db.nodes.get(node.id)).toBeUndefined();
      expect(await db.edges.get(edge.id)).toBeUndefined();
      expect((await db.boards.get('board'))?.nodeIds).toEqual(['source']);
      const second = {
        node: { ...node, id: 'step-two' },
        edge: { ...edge, id: 'input-two', targetNodeId: 'step-two' },
      };
      await expect(
        repository.createGenerationBatch([
          { node, edge },
          { ...second, edge: { ...second.edge, sourceNodeId: 'missing' } },
        ]),
      ).rejects.toThrow();
      expect(await db.nodes.count()).toBe(1);
      expect(await db.edges.count()).toBe(0);
      expect((await db.boards.get('board'))?.nodeIds).toEqual(['source']);
      await expect(
        repository.createGenerationBatch([
          { node, edge },
          { node, edge },
        ]),
      ).rejects.toThrow(/already exists/);
      expect(await db.nodes.count()).toBe(1);
      await expect(
        repository.createGenerationBatch([
          {
            node,
            edge,
            referenceEdges: [
              { ...edge, id: 'missing-reference', inputRole: 'reference', sourceNodeId: 'missing' },
            ],
          },
        ]),
      ).rejects.toThrow();
      expect(await db.nodes.count()).toBe(1);
      expect(await db.edges.count()).toBe(0);
      const addedBoard = await repository.createGenerationBatch([{ node, edge }, second]);
      expect(addedBoard.nodeIds).toEqual(['source', 'step', 'step-two']);
      expect(addedBoard.edgeIds).toEqual(['input', 'input-two']);
      await db.nodes.bulkDelete(['step', 'step-two']);
      await db.edges.bulkDelete(['input', 'input-two']);
      await db.boards.update('board', { nodeIds: ['source'], edgeIds: [] });
      await repository.createGenerationStep(node, edge);
      expect((await db.boards.get('board'))?.nodeIds).toEqual(['source', 'step']);
      expect((await db.boards.get('board'))?.edgeIds).toEqual(['input']);
      await expect(repository.createGenerationStep(node, edge)).rejects.toThrow(/already exists/);
      expect(await db.nodes.count()).toBe(2);
    } finally {
      await db.delete();
    }
  });
  it('migrates a v3 database once, preserves local positions and leaves legacy keys intact', async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(3).stores({
      projects: 'id, updatedAt',
      boards: 'id, projectId',
      nodes: 'id, boardId',
      edges: 'id, boardId',
      assets: 'id, projectId',
      assetBlobs: 'id',
      designs: 'id, projectId',
      relations: 'id, projectId',
      viewSets: 'id, projectId',
      cmfSets: 'id, projectId',
      cmfVariants: 'id, projectId',
      generations: 'id, projectId',
      candidates: 'id, projectId, boardId, generationNodeId',
      candidateBlobs: 'id',
      sketchDocuments: 'id, projectId',
      graphViewStates: 'projectId',
      providerConfigs: 'id, type, enabled',
      providerCredentials: 'id',
    });
    const key = 'oid.canvas.candidate-positions.v1:board';
    const getItem = vi.fn((requested: string) =>
      requested === key ? '{"candidate":{"x":-33,"y":404}}' : null,
    );
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem, removeItem });
    const database = new OpenIndustrialDesignDatabase(name);
    try {
      await legacy.table('projects').put({ id: 'project', schemaVersion: 5 });
      await legacy
        .table('boards')
        .put({ id: 'board', projectId: 'project', nodeIds: ['task'], edgeIds: [] });
      await legacy.table('nodes').put({
        id: 'task',
        boardId: 'board',
        type: 'generation',
        x: 0,
        y: 0,
        width: 240,
        height: 260,
      });
      await legacy.table('candidates').put({
        id: 'candidate',
        projectId: 'project',
        boardId: 'board',
        generationNodeId: 'task',
        generationId: 'run',
        mimeType: 'image/png',
        inputSignature: 'input',
        createdAt: 2,
        updatedAt: 2,
      });
      await legacy.table('candidateBlobs').put({ id: 'candidate', blob: new Blob(['image']) });
      legacy.close();
      await database.open();
      expect(await database.nodes.get('candidate-result-candidate')).toMatchObject({
        x: -33,
        y: 404,
      });
      expect(await database.projects.get('project')).toMatchObject({ schemaVersion: 9 });
      expect((await database.boards.get('board'))?.nodeIds).toEqual([
        'task',
        'candidate-result-candidate',
      ]);
      expect((await database.boards.get('board'))?.edgeIds).toEqual(['candidate-output-candidate']);
      expect(removeItem).not.toHaveBeenCalled();
      database.close();
      await database.open();
      expect(await database.nodes.count()).toBe(2);
      expect(await database.edges.count()).toBe(1);
      expect(await (await database.candidateBlobs.get('candidate'))?.blob.text()).toBe('image');
    } finally {
      legacy.close();
      await database.delete();
      vi.unstubAllGlobals();
    }
  });
  it('restores pending candidates and atomically promotes or deletes their Blobs', async () => {
    const database = new OpenIndustrialDesignDatabase(`test-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    const storage = new DexieCanvasGenerationStorage(database);
    const generationNode = {
      id: 'generate',
      boardId: 'board',
      type: 'generation' as const,
      label: 'Generate',
      direction: 'Lamp',
      notes: '',
      count: 1,
      x: 0,
      y: 0,
      width: 280,
      height: 280,
      rotation: 0,
      zIndex: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    await repository.saveSnapshot({
      project: {
        id: 'project',
        name: 'Test',
        schemaVersion: 9,
        boardIds: ['board'],
        activeBoardId: 'board',
        settings: {},
        createdAt: 1,
        updatedAt: 1,
      },
      board: {
        id: 'board',
        projectId: 'project',
        name: 'Board',
        nodeIds: [generationNode.id],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: 1,
        updatedAt: 1,
      },
      nodes: [generationNode],
    });
    const generation = {
      id: 'generation',
      projectId: 'project',
      actionId: 'ai.canvasGenerate',
      providerId: 'provider',
      status: 'success' as const,
      sourceDesignIds: [],
      sourceAssetIds: [],
      createdAt: 1,
      updatedAt: 1,
    };
    await repository.saveGeneration(generation);
    const candidate = {
      id: 'candidate',
      projectId: 'project',
      boardId: 'board',
      generationNodeId: generationNode.id,
      generationId: generation.id,
      mimeType: 'image/png',
      inputSignature: 'signature',
      createdAt: 1,
      updatedAt: 1,
    };
    await storage.stage([
      { metadata: candidate, blob: new Blob(['image'], { type: 'image/png' }) },
    ]);
    expect((await storage.listCandidates('board')).map((item) => item.id)).toEqual([candidate.id]);
    expect(await (await storage.getCandidateBlob(candidate.id))?.text()).toBe('image');
    const resultNode = (await storage.getResultNode(candidate.id))!;
    const resultEdge = (await storage.getResultEdge(resultNode.id))!;
    const pendingSource = await new DexieProjectArchiveStorage(database).readProjectArchive(
      'project',
    );
    const pendingArchive = await importOidProjectArchive(
      await createOidProjectArchive({
        ...pendingSource.snapshot,
        assetBlobs: pendingSource.assetBlobs,
        candidateBlobs: pendingSource.candidateBlobs,
        generationInputBlobs: pendingSource.generationInputBlobs,
      }),
    );
    const collisionDatabase = new OpenIndustrialDesignDatabase(`collision-${crypto.randomUUID()}`);
    try {
      const restore = new DexieProjectArchiveStorage(collisionDatabase);
      for (const [table, row] of [
        [collisionDatabase.candidates, { ...candidate, projectId: 'other' }],
        [collisionDatabase.candidateBlobs, { id: candidate.id, blob: new Blob(['untouched']) }],
        [collisionDatabase.edges, { ...resultEdge, boardId: 'orphan' }],
      ] as const) {
        await table.put(row as never);
        await expect(restore.restoreProjectArchive(pendingArchive)).rejects.toMatchObject({
          code: 'project_conflict',
        });
        expect(await table.get(row.id)).toEqual(row);
        expect(await collisionDatabase.projects.count()).toBe(0);
        await table.delete(row.id);
      }
      await restore.restoreProjectArchive(pendingArchive);
      await restore.restoreProjectArchive(pendingArchive);
      expect(await (await collisionDatabase.candidateBlobs.get(candidate.id))?.blob.text()).toBe(
        'image',
      );
    } finally {
      await collisionDatabase.delete();
    }
    expect((await repository.getBoard('board'))?.nodeIds).toContain(resultNode.id);
    expect((await repository.getBoard('board'))?.edgeIds).toContain(resultEdge.id);
    const downstreamNode = {
      ...generationNode,
      id: 'downstream-generate',
      label: 'Explore CMF',
      x: 420,
      y: 0,
    };
    const downstreamEdge = {
      id: 'candidate-to-downstream',
      boardId: 'board',
      sourceNodeId: resultNode.id,
      targetNodeId: downstreamNode.id,
      type: 'generation_input' as const,
      inputRole: 'base' as const,
      createdAt: 2,
      updatedAt: 2,
    };
    await repository.createGenerationStep(downstreamNode, downstreamEdge);
    // Older UI undo could remove a persisted result node while leaving its
    // candidate metadata and downstream edge. Loading must repair that state.
    await database.nodes.delete(resultNode.id);
    expect(await storage.reconcileCandidateResults('project')).toBe(1);
    expect(await storage.reconcileCandidateResults('project')).toBe(0);
    const repairedResultNode = (await storage.getResultNode(candidate.id))!;
    expect(await database.nodes.get(resultNode.id)).toMatchObject({
      id: resultNode.id,
      candidateId: candidate.id,
      type: 'candidate',
    });
    expect(await database.edges.get(downstreamEdge.id)).toEqual(downstreamEdge);
    expect(
      (await database.edges.where('boardId').equals('board').toArray()).filter(
        (edge) => edge.type === 'generation_output' && edge.targetNodeId === resultNode.id,
      ),
    ).toHaveLength(1);
    const downstreamRun = {
      ...generation,
      id: 'downstream-run',
      inputSnapshots: [
        {
          id: 'downstream-input',
          sourceNodeId: resultNode.id,
          candidateId: candidate.id,
          role: 'base' as const,
          mimeType: 'image/png',
        },
      ],
    };
    await storage.saveGenerationInputs(downstreamRun, [
      {
        id: 'downstream-input',
        projectId: 'project',
        generationId: downstreamRun.id,
        blob: (await storage.getCandidateBlob(candidate.id))!,
      },
    ]);
    await storage.stage([
      { metadata: candidate, blob: new Blob(['image'], { type: 'image/png' }) },
    ]);
    expect(
      (await database.nodes.where('boardId').equals('board').toArray()).filter(
        (item) => item.type === 'candidate',
      ),
    ).toHaveLength(1);
    await expect(
      storage.stage([
        { metadata: { ...candidate, id: 'rollback' }, blob: new Blob(['rollback']) },
        {
          metadata: { ...candidate, id: 'missing-board', boardId: 'missing' },
          blob: new Blob(['missing']),
        },
      ]),
    ).rejects.toThrow('Board is missing');
    expect(await storage.getCandidate('rollback')).toBeUndefined();
    expect(await database.nodes.get('candidate-result-rollback')).toBeUndefined();
    expect(await database.edges.get('candidate-output-rollback')).toBeUndefined();
    const asset = {
      id: 'asset',
      projectId: 'project',
      name: 'Kept',
      type: 'image' as const,
      mimeType: 'image/png',
      size: 5,
      storage: { type: 'indexeddb' as const, blobId: 'asset' },
      createdAt: 1,
      updatedAt: 1,
    };
    const node = {
      id: resultNode.id,
      boardId: 'board',
      type: 'reference' as const,
      assetId: asset.id,
      x: repairedResultNode.x,
      y: repairedResultNode.y,
      width: repairedResultNode.width,
      height: repairedResultNode.height,
      rotation: 0,
      zIndex: 2,
      createdAt: 1,
      updatedAt: 1,
    };
    const outputEdge = {
      id: resultEdge.id,
      boardId: 'board',
      sourceNodeId: generationNode.id,
      targetNodeId: node.id,
      type: 'generation_output' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    await expect(
      storage.accept({
        candidate,
        asset,
        node: { ...node, boardId: 'missing-board' },
        outputEdge,
        generation,
      }),
    ).rejects.toThrow('Board is missing');
    expect(await storage.getCandidate(candidate.id)).toEqual(candidate);
    expect(await storage.getCandidateBlob(candidate.id)).toBeDefined();
    await expect(
      storage.accept({
        candidate,
        asset,
        node: { ...node, x: node.x + 10 },
        outputEdge,
        generation,
      }),
    ).rejects.toThrow('preserve');
    expect(await repository.getAsset(asset.id)).toBeUndefined();
    await storage.accept({ candidate, asset, node, outputEdge, generation });
    expect(await storage.getCandidate(candidate.id)).toBeUndefined();
    expect(await storage.getCandidateBlob(candidate.id)).toBeUndefined();
    expect(await (await repository.getAssetBlob(asset.id))?.blob.text()).toBe('image');
    expect((await repository.getBoard('board'))?.nodeIds).toContain(node.id);
    expect((await repository.getBoard('board'))?.edgeIds).toContain(outputEdge.id);
    expect(await repository.listEdges('board')).toContainEqual(outputEdge);
    expect(await repository.getNode(resultNode.id)).toMatchObject({
      id: resultNode.id,
      type: 'reference',
    });
    expect(await repository.listEdges('board')).toContainEqual(downstreamEdge);
    expect((await repository.getBoard('board'))?.edgeIds).toContain(downstreamEdge.id);
    const archiveStorage = new DexieProjectArchiveStorage(database);
    const savedArchive = await archiveStorage.readProjectArchive('project');
    const portableFile = await createOidProjectArchive({
      ...savedArchive.snapshot,
      assetBlobs: savedArchive.assetBlobs,
      candidateBlobs: savedArchive.candidateBlobs,
      generationInputBlobs: savedArchive.generationInputBlobs,
      exportedAt: 3,
    });
    const importedArchive = await importOidProjectArchive(portableFile);
    const importedDatabase = new OpenIndustrialDesignDatabase(`test-${crypto.randomUUID()}`);
    try {
      await new DexieProjectArchiveStorage(importedDatabase).restoreProjectArchive(importedArchive);
      const importedRepository = new DexieProjectRepository(importedDatabase);
      expect(await importedRepository.getNode(resultNode.id)).toMatchObject({
        id: resultNode.id,
        type: 'reference',
      });
      expect(await importedRepository.listEdges('board')).toContainEqual(downstreamEdge);
      expect(await importedRepository.listEdges('board')).toContainEqual(outputEdge);
      expect(importedArchive.candidates).toHaveLength(0);
      const restoredInput = (await importedDatabase.generations.get(downstreamRun.id))
        ?.inputSnapshots?.[0];
      expect(restoredInput).toMatchObject({
        id: 'downstream-input',
        sourceNodeId: resultNode.id,
        candidateId: candidate.id,
      });
      expect(
        await (await importedDatabase.generationInputBlobs.get('downstream-input'))?.blob.text(),
      ).toBe('image');
    } finally {
      await importedDatabase.delete();
    }
    await storage.stage([
      { metadata: { ...candidate, id: 'to-discard' }, blob: new Blob(['discard']) },
    ]);
    await storage.discard('to-discard');
    expect(await storage.getCandidateBlob('to-discard')).toBeUndefined();
    expect(await storage.getResultNode('to-discard')).toBeUndefined();
    const edge = {
      id: 'edge',
      boardId: 'board',
      sourceNodeId: node.id,
      targetNodeId: generationNode.id,
      type: 'generation_input' as const,
      inputRole: 'base' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    await repository.saveBoardEdge(edge);
    await storage.stage([
      { metadata: { ...candidate, id: 'orphan-on-delete' }, blob: new Blob(['temporary']) },
    ]);
    const deleted = await repository.deleteCanvasNodesWithUndo('board', [generationNode.id]);
    expect(await repository.listEdges('board')).toEqual([downstreamEdge]);
    expect(await storage.getCandidateBlob('orphan-on-delete')).toBeUndefined();
    expect((await repository.getBoard('board'))?.edgeIds).toEqual([downstreamEdge.id]);
    const failedRestore = vi
      .spyOn(database.boards, 'put')
      .mockRejectedValueOnce(new Error('disk-full'));
    await expect(repository.restoreCanvasDeletion(deleted.undo)).rejects.toThrow('disk-full');
    failedRestore.mockRestore();
    expect(await storage.getCandidateBlob('orphan-on-delete')).toBeUndefined();
    expect(await database.nodes.get(generationNode.id)).toBeUndefined();
    await database.nodes.add({ ...generationNode, boardId: 'foreign-board' });
    await expect(repository.restoreCanvasDeletion(deleted.undo)).rejects.toThrow('ID conflict');
    expect((await database.nodes.get(generationNode.id))?.boardId).toBe('foreign-board');
    await database.nodes.delete(generationNode.id);
    await repository.restoreCanvasDeletion(deleted.undo);
    expect(await database.nodes.get(generationNode.id)).toEqual(generationNode);
    expect(await (await storage.getCandidateBlob('orphan-on-delete'))?.text()).toBe('temporary');
    expect(await repository.listEdges('board')).toEqual(deleted.undo.before.edges);
    await expect(repository.restoreCanvasDeletion(deleted.undo)).rejects.toThrow('changed');
    const redone = await repository.deleteCanvasNodesWithUndo('board', [generationNode.id]);
    await database.nodes.update(node.id, { x: 999 });
    await expect(repository.restoreCanvasDeletion(redone.undo)).rejects.toThrow('changed');
    expect((await database.nodes.get(node.id))?.x).toBe(999);
    expect(await storage.getCandidateBlob('orphan-on-delete')).toBeUndefined();
    await database.delete();
  });
  it('restores a saved project snapshot with its nodes', async () => {
    const database = new OpenIndustrialDesignDatabase(`test-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    await repository.saveSnapshot({
      project: {
        id: 'project',
        createdAt: 1,
        updatedAt: 1,
        schemaVersion: 9,
        name: 'Test',
        boardIds: ['board'],
        activeBoardId: 'board',
        settings: {},
      },
      board: {
        id: 'board',
        createdAt: 1,
        updatedAt: 1,
        projectId: 'project',
        name: 'Board',
        nodeIds: ['node'],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      nodes: [
        {
          id: 'node',
          createdAt: 1,
          updatedAt: 1,
          boardId: 'board',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          rotation: 0,
          zIndex: 1,
        },
      ],
    });
    expect((await repository.loadSnapshot('project'))?.nodes).toHaveLength(1);
    await database.delete();
  });

  it('lists Boards and removes Board or Project records through the repository boundary', async () => {
    const database = new OpenIndustrialDesignDatabase(`test-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    const project = {
      id: 'project',
      createdAt: 1,
      updatedAt: 1,
      schemaVersion: 9 as const,
      name: 'Board workspace',
      boardIds: ['board-a', 'board-b'],
      activeBoardId: 'board-a',
      settings: {},
    };
    const boardA = {
      id: 'board-a',
      createdAt: 1,
      updatedAt: 1,
      projectId: project.id,
      name: 'Concept',
      nodeIds: [],
      edgeIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const boardB = { ...boardA, id: 'board-b', name: 'CMF', nodeIds: ['node-b'] };
    await repository.saveSnapshot({ project, board: boardA, nodes: [] });
    await repository.saveBoard(boardB);
    await repository.saveNode({
      id: 'node-b',
      createdAt: 1,
      updatedAt: 1,
      boardId: boardB.id,
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 0,
      zIndex: 1,
    });
    await repository.saveAsset({
      id: 'asset',
      createdAt: 1,
      updatedAt: 1,
      projectId: project.id,
      type: 'image',
      name: 'reference.png',
      mimeType: 'image/png',
      size: 3,
      storage: { type: 'indexeddb', blobId: 'asset' },
    });
    await repository.saveAssetBlob({ id: 'asset', blob: new Blob(['ref']) });

    expect(await repository.listBoards(project.id)).toHaveLength(2);
    expect(await repository.listNodes(boardB.id)).toHaveLength(1);
    await repository.deleteBoard(boardB.id);
    expect(await repository.listNodes(boardB.id)).toEqual([]);
    await repository.deleteProject(project.id);
    expect(await repository.getProject(project.id)).toBeUndefined();
    expect(await repository.getAssetBlob('asset')).toBeUndefined();
    await database.delete();
  });

  it('keeps graph layout state separate from persisted Design data', async () => {
    const database = new OpenIndustrialDesignDatabase(`test-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    const design = {
      id: 'concept',
      createdAt: 1,
      updatedAt: 1,
      projectId: 'project',
      name: 'Lamp concept',
      kind: 'concept' as const,
      status: 'exploring' as const,
    };
    await repository.saveDesign(design);
    await repository.saveDesignRelation({
      id: 'relation',
      createdAt: 1,
      updatedAt: 1,
      projectId: 'project',
      sourceDesignId: 'concept',
      targetDesignId: 'concept',
      type: 'related_to',
    });
    await repository.saveGraphViewState({
      projectId: 'project',
      positions: { concept: { x: 120, y: 80 } },
      x: 10,
      y: 20,
      zoom: 1.25,
    });

    expect(await repository.listDesigns('project')).toEqual([design]);
    expect(await repository.listDesignRelations('project')).toHaveLength(1);
    expect(await repository.getGraphViewState('project')).toMatchObject({
      positions: { concept: { x: 120, y: 80 } },
      zoom: 1.25,
    });
    await database.delete();
  });

  it('restores a validated archive atomically with its asset blob and view state', async () => {
    const database = new OpenIndustrialDesignDatabase(`test-${crypto.randomUUID()}`);
    const archiveStorage = new DexieProjectArchiveStorage(database);
    const archive: ProjectArchiveData = {
      manifest: {
        format: 'open-industrial-design',
        schemaVersion: 9,
        projectId: 'project',
        projectName: 'Restored',
        createdAt: 1,
        exportedAt: 2,
      },
      project: {
        id: 'project',
        createdAt: 1,
        updatedAt: 2,
        schemaVersion: 9,
        name: 'Restored',
        boardIds: ['board'],
        activeBoardId: 'board',
        settings: {},
      },
      boards: [
        {
          id: 'board',
          createdAt: 1,
          updatedAt: 2,
          projectId: 'project',
          name: 'Board',
          nodeIds: ['node'],
          edgeIds: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      nodes: [
        {
          id: 'node',
          createdAt: 1,
          updatedAt: 2,
          boardId: 'board',
          type: 'text',
          x: 0,
          y: 0,
          width: 20,
          height: 20,
          rotation: 0,
          zIndex: 1,
        },
      ],
      edges: [],
      assets: [
        {
          id: 'asset',
          createdAt: 1,
          updatedAt: 2,
          projectId: 'project',
          type: 'image',
          name: 'Reference',
          mimeType: 'text/plain',
          size: 4,
          storage: { type: 'indexeddb', blobId: 'blob' },
        },
      ],
      assetBlobs: [{ id: 'blob', blob: new Blob(['data']) }],
      candidateBlobs: [],
      designs: [],
      relations: [],
      viewSets: [],
      cmfSets: [],
      cmfVariants: [],
      generations: [
        {
          id: 'run',
          projectId: 'project',
          createdAt: 1,
          updatedAt: 2,
          actionId: 'ai.canvasGenerate',
          providerId: 'test',
          status: 'success',
          sourceDesignIds: [],
          inputSnapshots: [
            {
              id: 'run-input',
              sourceNodeId: 'source-no-longer-on-canvas',
              role: 'base',
              mimeType: 'image/png',
            },
          ],
        },
      ],
      candidates: [],
      generationInputBlobs: [
        {
          id: 'run-input',
          blob: new Blob(['immutable input'], { type: 'image/png' }),
        },
      ],
      sketchDocuments: [],
      graphViewState: { projectId: 'project', positions: {} },
    };

    const entity = { projectId: 'project', createdAt: 1, updatedAt: 2 };
    archive.designs = [
      { ...entity, id: 'design', name: 'Design', kind: 'concept', status: 'exploring' },
    ];
    archive.relations = [
      {
        ...entity,
        id: 'relation',
        sourceDesignId: 'design',
        targetDesignId: 'design',
        type: 'related_to',
      },
    ];
    archive.viewSets = [{ ...entity, id: 'views', designId: 'design', views: {} }];
    archive.cmfSets = [{ ...entity, id: 'cmf', designId: 'design', variantIds: ['cmf-variant'] }];
    archive.cmfVariants = [{ ...entity, id: 'cmf-variant', designId: 'design' }];
    archive.sketchDocuments = [
      { ...entity, id: 'sketch', format: 'excalidraw', formatVersion: 2, sourceAssetId: 'asset' },
    ];
    const portableFile = await createOidProjectArchive(archive);
    const parsedArchive = await importOidProjectArchive(portableFile);
    const credential = { id: 'private-provider', apiKey: 'fixture-key-not-real' };
    await database.providerCredentials.put(credential);
    // Each collision must fail before writing even the project row. Include
    // indirect owners and orphan blobs, not merely project-scoped entities.
    const collisions = [
      [database.boards, { ...archive.boards[0], projectId: 'other' }],
      [database.nodes, { ...archive.nodes[0], boardId: 'orphan-board' }],
      [database.assets, { ...archive.assets[0], projectId: 'other' }],
      [database.designs, { ...archive.designs[0], projectId: 'other' }],
      [database.relations, { ...archive.relations[0], projectId: 'other' }],
      [database.viewSets, { ...archive.viewSets[0], projectId: 'other' }],
      [database.cmfSets, { ...archive.cmfSets[0], projectId: 'other' }],
      [database.cmfVariants, { ...archive.cmfVariants[0], projectId: 'other' }],
      [database.sketchDocuments, { ...archive.sketchDocuments[0], projectId: 'other' }],
      [database.assetBlobs, { id: 'blob', blob: new Blob(['other bytes']) }],
      [database.generations, { ...archive.generations[0], projectId: 'other' }],
      [
        database.generationInputBlobs,
        {
          id: 'run-input',
          projectId: 'other',
          generationId: 'other-run',
          blob: new Blob(['other input']),
        },
      ],
    ] as const;
    for (const [table, row] of collisions) {
      await table.put(row as never);
      await expect(archiveStorage.restoreProjectArchive(parsedArchive)).rejects.toMatchObject({
        code: 'project_conflict',
      });
      expect(await database.projects.count()).toBe(0);
      expect(await table.get(row.id)).toEqual(row);
      await table.delete(row.id);
    }
    // A different asset ID referencing the incoming blob still protects it,
    // even when the blob itself is missing (no ownership guessed from absence).
    await database.assets.put({ ...archive.assets[0], id: 'other-asset', projectId: 'other' });
    await expect(archiveStorage.restoreProjectArchive(parsedArchive)).rejects.toMatchObject({
      code: 'project_conflict',
    });
    await database.assets.delete('other-asset');
    await archiveStorage.restoreProjectArchive(parsedArchive);
    await archiveStorage.restoreProjectArchive(parsedArchive); // legitimate same-project restore
    expect(await database.providerCredentials.get(credential.id)).toEqual(credential);
    // Replacement deletes must not remove a blob referenced by another project.
    await database.assets.put({ ...archive.assets[0], id: 'other-asset', projectId: 'other' });
    await expect(archiveStorage.restoreProjectArchive(parsedArchive)).rejects.toMatchObject({
      code: 'project_conflict',
    });
    expect(await (await database.assetBlobs.get('blob'))?.blob.text()).toBe('data');
    await database.assets.delete('other-asset');
    const restored = await archiveStorage.readProjectArchive('project');
    expect(restored.snapshot.project.name).toBe('Restored');
    expect(restored.snapshot.nodes).toHaveLength(1);
    expect(await restored.assetBlobs[0]?.blob.text()).toBe('data');
    expect(restored.snapshot.generations[0]?.inputSnapshots?.[0]?.id).toBe('run-input');
    expect(restored.generationInputBlobs[0]).toMatchObject({
      projectId: 'project',
      generationId: 'run',
    });
    expect(await restored.generationInputBlobs[0]?.blob.text()).toBe('immutable input');
    expect(restored.snapshot.graphViewState).toEqual({ projectId: 'project', positions: {} });

    await expect(
      archiveStorage.restoreProjectArchive({
        ...parsedArchive,
        project: { ...parsedArchive.project, name: 'Broken replacement' },
        assetBlobs: [{ blob: new Blob(['broken replacement']) } as never],
      }),
    ).rejects.toThrow();

    const afterFailedReplacement = await archiveStorage.readProjectArchive('project');
    expect(afterFailedReplacement.snapshot.project.name).toBe('Restored');
    expect(afterFailedReplacement.snapshot.nodes).toHaveLength(1);
    expect(await afterFailedReplacement.assetBlobs[0]?.blob.text()).toBe('data');
    expect(await afterFailedReplacement.generationInputBlobs[0]?.blob.text()).toBe(
      'immutable input',
    );
    await database.delete();
  });

  it('keeps remembered Provider keys outside serializable Provider settings', async () => {
    const database = new OpenIndustrialDesignDatabase(`test-${crypto.randomUUID()}`);
    const configs = new DexieProviderConfigRepository(database);
    const credentials = new DexieProviderCredentialStore(database);
    const config: ProviderConfig = {
      id: 'provider',
      type: 'openai-compatible',
      name: 'Local provider',
      baseUrl: 'https://example.test/v1',
      model: 'test',
      rememberKey: true,
    };
    await configs.save(config);
    await credentials.set(config.id, { apiKey: 'not-in-config' });

    expect(await configs.get(config.id)).toEqual(config);
    expect(JSON.stringify(await configs.list())).not.toContain('not-in-config');
    expect(await credentials.get(config.id)).toEqual({ apiKey: 'not-in-config' });
    await database.delete();
  });

  it('persists imported 3D models and captured previews as Assets plus Blobs', async () => {
    const database = new OpenIndustrialDesignDatabase(`test-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    const storage = new DexieThreeViewerStorage(database);
    await repository.saveSnapshot({
      project: {
        id: 'project',
        createdAt: 1,
        updatedAt: 1,
        schemaVersion: 9,
        name: '3D test',
        boardIds: ['board'],
        activeBoardId: 'board',
        settings: {},
      },
      board: {
        id: 'board',
        createdAt: 1,
        updatedAt: 1,
        projectId: 'project',
        name: 'Board',
        nodeIds: [],
        edgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      nodes: [],
    });
    const modelAsset = {
      id: 'model',
      createdAt: 1,
      updatedAt: 1,
      projectId: 'project',
      type: 'model3d' as const,
      name: 'lamp.glb',
      mimeType: 'model/gltf-binary',
      size: 5,
      storage: { type: 'indexeddb' as const, blobId: 'model' },
      metadata: { format: 'glb' },
    };
    const node = {
      id: 'model-node',
      createdAt: 1,
      updatedAt: 1,
      boardId: 'board',
      type: 'model3d' as const,
      assetId: modelAsset.id,
      x: 0,
      y: 0,
      width: 320,
      height: 220,
      rotation: 0,
      zIndex: 1,
      camera: {
        mode: 'perspective' as const,
        position: [3, 2, 3] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
      },
    };
    await storage.saveImportedModel({ asset: modelAsset, blob: new Blob(['model']), node });
    expect(await storage.listModelAssets('project')).toEqual([modelAsset]);
    expect(await (await storage.getAssetBlob(modelAsset))?.text()).toBe('model');

    const previewAsset = {
      ...modelAsset,
      id: 'preview',
      type: 'image' as const,
      name: 'lamp preview.png',
      mimeType: 'image/png',
      storage: { type: 'indexeddb' as const, blobId: 'preview' },
    };
    await storage.saveCapture({
      asset: previewAsset,
      blob: new Blob(['preview']),
      node: { ...node, previewAssetId: previewAsset.id },
    });
    expect(await (await storage.getAssetBlobById(previewAsset.id))?.text()).toBe('preview');
    await database.delete();
  });
});
