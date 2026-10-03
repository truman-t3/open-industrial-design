import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import {
  createOidProjectArchive,
  importOidProjectArchive,
  type ProjectArchiveData,
} from '@open-industrial-design/project-file';
import type { ProviderConfig } from '@open-industrial-design/ai-core';
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
  it('atomically saves node and edge endpoints through undo/redo without touching other Boards', async () => {
    const database = new OpenIndustrialDesignDatabase(`snapshot-edges-${crypto.randomUUID()}`);
    const repository = new DexieProjectRepository(database);
    const snapshot = {
      project: {
        id: 'p',
        name: 'Test',
        schemaVersion: 7 as const,
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
      expect(await database.projects.get('project')).toMatchObject({ schemaVersion: 7 });
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
        schemaVersion: 7,
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
    await repository.deleteCanvasNodes('board', [generationNode.id]);
    expect(await repository.listEdges('board')).toEqual([downstreamEdge]);
    expect(await storage.getCandidateBlob('orphan-on-delete')).toBeUndefined();
    expect((await repository.getBoard('board'))?.edgeIds).toEqual([downstreamEdge.id]);
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
        schemaVersion: 7,
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
      schemaVersion: 7 as const,
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
        schemaVersion: 7,
        projectId: 'project',
        projectName: 'Restored',
        createdAt: 1,
        exportedAt: 2,
      },
      project: {
        id: 'project',
        createdAt: 1,
        updatedAt: 2,
        schemaVersion: 7,
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
        schemaVersion: 7,
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
