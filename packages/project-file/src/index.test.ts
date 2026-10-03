import { strFromU8, strToU8, unzipSync, zipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { materializeCandidateResults } from '@open-industrial-design/design-model';
import {
  OID_PROJECT_FORMAT,
  ProjectArchiveError,
  createOidProjectArchive,
  importOidProjectArchive,
  validateProjectArchiveData,
} from './index';

const snapshot = {
  project: {
    id: 'project-1',
    createdAt: 1,
    updatedAt: 2,
    schemaVersion: 7 as const,
    name: 'Portable lamp',
    boardIds: ['board-1'],
    activeBoardId: 'board-1',
    settings: {},
  },
  boards: [
    {
      id: 'board-1',
      createdAt: 1,
      updatedAt: 2,
      projectId: 'project-1',
      name: 'Concept',
      nodeIds: ['node-1'],
      edgeIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  ],
  nodes: [
    {
      id: 'node-1',
      createdAt: 1,
      updatedAt: 2,
      boardId: 'board-1',
      type: 'image' as const,
      assetId: 'asset-1',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
    },
  ],
  edges: [],
  assets: [
    {
      id: 'asset-1',
      createdAt: 1,
      updatedAt: 2,
      projectId: 'project-1',
      type: 'document' as const,
      name: 'Sketch source',
      mimeType: 'application/json',
      size: 17,
      storage: { type: 'indexeddb' as const, blobId: 'blob-1' },
      metadata: { apiKey: 'must-not-escape', retained: 'yes' },
    },
  ],
  designs: [
    {
      id: 'design-1',
      createdAt: 1,
      updatedAt: 2,
      projectId: 'project-1',
      name: 'Lamp concept',
      kind: 'concept' as const,
      status: 'exploring' as const,
    },
  ],
  relations: [],
  viewSets: [],
  cmfSets: [],
  cmfVariants: [],
  generations: [],
  candidates: [],
  sketchDocuments: [
    {
      id: 'sketch-1',
      createdAt: 1,
      updatedAt: 2,
      projectId: 'project-1',
      format: 'excalidraw' as const,
      formatVersion: 2,
      sourceAssetId: 'asset-1',
    },
  ],
  graphViewState: { projectId: 'project-1', positions: { 'design-1': { x: 20, y: 30 } } },
  assetBlobs: [{ id: 'blob-1', blob: new Blob(['{ "scene": true }']) }],
  candidateBlobs: [],
};

describe('OID project archive', () => {
  it('rejects oversized Blobs before reading their bytes', async () => {
    const source = new Blob(['small']);
    Object.defineProperty(source, 'size', { value: 101 * 1024 * 1024 });
    const read = vi.spyOn(source, 'arrayBuffer');
    await expect(importOidProjectArchive(source)).rejects.toMatchObject({
      code: 'archive_too_large',
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('preflights declared expansion, including aggregate size, without inflating', async () => {
    for (const [count, size] of [
      [1, 51 * 1024 * 1024],
      [6, 50 * 1024 * 1024],
    ]) {
      const bytes = zipSync(
        Object.fromEntries(
          Array.from({ length: count }, (_, i) => [`entry-${i}`, new Uint8Array([1])]),
        ),
      );
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < bytes.length - 46; i++) {
        if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, size, true);
      }
      await expect(importOidProjectArchive(bytes)).rejects.toMatchObject({
        code: 'archive_too_large',
      });
    }
  });

  it('rejects actual expansion exceeding forged small declared sizes', async () => {
    // Safe 2 MiB fixture exercises actual-output counting rather than allocating a bomb.
    const bytes = zipSync({ 'payload.bin': new Uint8Array(2 * 1024 * 1024) });
    const view = new DataView(bytes.buffer);
    view.setUint32(22, 1, true);
    for (let i = 0; i < bytes.length - 46; i++) {
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 1, true);
    }
    await expect(importOidProjectArchive(bytes)).rejects.toMatchObject({ code: 'corrupt_archive' });
  });

  it.each([
    ['deflate', ZipDeflate],
    ['stored', ZipPassThrough],
  ] as const)(
    'reads %s data-descriptor ZIPs containing signature bytes and supports cancellation',
    async (_name, ZipEntry) => {
      const payload = new Uint8Array(100);
      payload.set([0x50, 0x4b, 0x07, 0x08], 20);
      const exported = new Uint8Array(
        await (
          await createOidProjectArchive({
            ...snapshot,
            assetBlobs: [{ id: 'blob-1', blob: new Blob([payload]) }],
          })
        ).arrayBuffer(),
      );
      const entries = unzipSync(exported);
      const chunks: Uint8Array[] = [];
      const zip = new Zip((error, data) => {
        if (error) throw error;
        chunks.push(data);
      });
      for (const [name, data] of Object.entries(entries)) {
        const file =
          ZipEntry === ZipDeflate ? new ZipDeflate(name, { level: 0 }) : new ZipPassThrough(name);
        zip.add(file);
        file.push(data, true);
      }
      zip.end();
      const streamed = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        streamed.set(chunk, offset);
        offset += chunk.length;
      }
      const restored = await importOidProjectArchive(streamed);
      expect(restored.project.id).toBe(snapshot.project.id);
      expect(new Uint8Array(await restored.assetBlobs[0].blob.arrayBuffer())).toEqual(payload);
      const controller = new AbortController();
      const pending = importOidProjectArchive(streamed, controller.signal);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    },
  );

  it('rejects duplicate ZIP entry names before decoding', async () => {
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, data) => {
      if (error) throw error;
      chunks.push(data);
    });
    for (let i = 0; i < 2; i++) {
      const file = new ZipPassThrough('same');
      zip.add(file);
      file.push(new Uint8Array([i]), true);
    }
    zip.end();
    await expect(
      importOidProjectArchive(new Blob(chunks.map((chunk) => new Uint8Array(chunk)))),
    ).rejects.toMatchObject({
      code: 'corrupt_archive',
    });
  });

  it('rejects truncated ZIPs and unsupported compression', async () => {
    const bytes = zipSync({ 'payload.bin': new Uint8Array([1, 2, 3]) });
    await expect(importOidProjectArchive(bytes.slice(0, 40))).rejects.toMatchObject({
      code: 'corrupt_archive',
    });
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length - 46; i++) {
      if (view.getUint32(i, true) === 0x02014b50) view.setUint16(i + 10, 99, true);
    }
    await expect(importOidProjectArchive(bytes)).rejects.toMatchObject({ code: 'corrupt_archive' });
  });
  it('validates in-memory archives before they can replace persisted project data', () => {
    const archive = {
      ...snapshot,
      assets: [{ ...snapshot.assets[0]!, metadata: { retained: 'yes' } }],
      manifest: {
        format: OID_PROJECT_FORMAT as typeof OID_PROJECT_FORMAT,
        schemaVersion: 7,
        projectId: 'project-1',
        projectName: 'Portable lamp',
        createdAt: 1,
        exportedAt: 3,
      },
      candidateBlobs: [],
      generationInputBlobs: [],
    };

    expect(() => validateProjectArchiveData(archive)).not.toThrow();
    expect(() =>
      validateProjectArchiveData({
        ...archive,
        edges: [
          {
            id: 'broken-edge',
            boardId: 'board-1',
            sourceNodeId: 'node-1',
            targetNodeId: 'missing-node',
            type: 'design_lineage',
            createdAt: 3,
          },
        ] as typeof archive.edges,
      }),
    ).toThrowError(ProjectArchiveError);
    expect(() =>
      validateProjectArchiveData({
        ...archive,
        assetBlobs: [
          ...archive.assetBlobs,
          {
            id: 'orphan-blob',
            blob: new Blob(['unused']),
          },
        ],
      }),
    ).toThrow('unreferenced blob');
    expect(() =>
      validateProjectArchiveData({
        ...archive,
        assets: [{ ...archive.assets[0]!, metadata: { apiKey: 'must-not-persist' } }],
      }),
    ).toThrowError(ProjectArchiveError);
  });

  it('restores immutable generation inputs even after their candidate source was discarded', async () => {
    const generation = {
      id: 'run',
      projectId: 'project-1',
      createdAt: 1,
      updatedAt: 1,
      actionId: 'ai.canvasGenerate',
      providerId: 'test',
      status: 'success' as const,
      sourceDesignIds: [],
      inputSnapshots: [
        {
          id: 'run-input-0',
          sourceNodeId: 'deleted-result',
          candidateId: 'deleted-candidate',
          role: 'base' as const,
          mimeType: 'image/png',
        },
      ],
    };
    const data = {
      ...snapshot,
      generations: [generation],
      generationInputBlobs: [
        { id: 'run-input-0', blob: new Blob([new Uint8Array([7, 8, 9])], { type: 'image/png' }) },
      ],
    };
    const blob = await createOidProjectArchive(data);
    const restored = await importOidProjectArchive(blob);
    expect(restored.generations).toEqual([generation]);
    expect(restored.assets).toHaveLength(snapshot.assets.length);
    expect(new Uint8Array(await restored.generationInputBlobs![0]!.blob.arrayBuffer())).toEqual(
      new Uint8Array([7, 8, 9]),
    );
    await expect(
      createOidProjectArchive({ ...data, generationInputBlobs: [] }),
    ).rejects.toMatchObject({ code: 'missing_asset_blob' });
    await expect(
      createOidProjectArchive({
        ...data,
        generations: [
          {
            ...generation,
            inputSnapshots: [generation.inputSnapshots[0]!, generation.inputSnapshots[0]!],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'invalid_project_data' });
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    delete entries['generation-inputs/run-input-0'];
    await expect(importOidProjectArchive(zipSync(entries))).rejects.toMatchObject({
      code: 'missing_asset_blob',
    });
  });
  it('round-trips project data and binary blobs without serializing credentials', async () => {
    const archive = await createOidProjectArchive({ ...snapshot, exportedAt: 50 });
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const entries = unzipSync(bytes);
    const archiveText = Object.entries(entries)
      .filter(([path]) => path !== 'assets/blob-1')
      .map(([, value]) => strFromU8(value))
      .join('');
    const restored = await importOidProjectArchive(archive);

    expect(entries['assets/blob-1']).toBeInstanceOf(Uint8Array);
    expect(strFromU8(entries['data/assets.json']!)).not.toContain('{ "scene": true }');
    expect(archiveText).not.toContain('must-not-escape');
    expect(restored.project).toEqual(snapshot.project);
    expect(restored.nodes).toEqual(snapshot.nodes);
    expect(restored.assets[0]?.metadata).toEqual({ retained: 'yes' });
    expect(await restored.assetBlobs[0]?.blob.text()).toBe('{ "scene": true }');
    expect(restored.sketchDocuments).toEqual(snapshot.sketchDocuments);
    expect(restored.graphViewState).toEqual(snapshot.graphViewState);
  });

  it('preserves serializable 3D node state in the v3 archive schema', async () => {
    const modelNode = {
      ...snapshot.nodes[0],
      type: 'model3d' as const,
      previewAssetId: 'asset-1',
      camera: {
        mode: 'perspective' as const,
        position: [4, 3, 6] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        preset: 'perspective' as const,
      },
      renderMode: 'solid' as const,
    };
    const archive = await createOidProjectArchive({
      ...snapshot,
      nodes: [modelNode],
      exportedAt: 50,
    });
    const restored = await importOidProjectArchive(archive);

    expect(restored.manifest.schemaVersion).toBe(7);
    expect(restored.nodes).toEqual([modelNode]);
  });

  it('keeps unrecognized future node types when importing a v3 archive', async () => {
    const archive = await createOidProjectArchive({ ...snapshot, exportedAt: 50 });
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const futureNode = {
      ...snapshot.nodes[0],
      type: 'future-node',
      futureState: { preserved: true },
    };
    entries['data/nodes.json'] = strToU8(JSON.stringify([futureNode]));

    const restored = await importOidProjectArchive(zipSync(entries));

    expect(restored.nodes).toEqual([futureNode]);
  });

  it('rejects missing resources and malformed or unsafe archives before persistence', async () => {
    await expect(
      createOidProjectArchive({ ...snapshot, assetBlobs: [], exportedAt: 50 }),
    ).rejects.toMatchObject({ code: 'missing_asset_blob' });
    await expect(importOidProjectArchive(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: 'corrupt_archive',
    } satisfies Partial<ProjectArchiveError>);
    const unsafe = zipSync({
      '../manifest.json': strToU8(JSON.stringify({ format: OID_PROJECT_FORMAT, schemaVersion: 1 })),
    });
    await expect(importOidProjectArchive(unsafe)).rejects.toMatchObject({
      code: 'invalid_archive_path',
    });
    const currentArchive = await createOidProjectArchive({ ...snapshot, exportedAt: 50 });
    const newerSchema = unzipSync(new Uint8Array(await currentArchive.arrayBuffer()));
    const newerManifest = JSON.parse(strFromU8(newerSchema['manifest.json']!)) as {
      schemaVersion: number;
    };
    newerManifest.schemaVersion = 8;
    newerSchema['manifest.json'] = strToU8(JSON.stringify(newerManifest));
    await expect(importOidProjectArchive(zipSync(newerSchema))).rejects.toMatchObject({
      code: 'unsupported_schema_version',
    });
  });

  it('migrates the baseline schema to the current schema before validation', async () => {
    const archive = await createOidProjectArchive({ ...snapshot, exportedAt: 50 });
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as { schemaVersion: number };
    manifest.schemaVersion = 0;
    const project = JSON.parse(strFromU8(entries['project.json']!)) as Record<string, unknown>;
    delete project.settings;
    delete project.schemaVersion;
    entries['manifest.json'] = strToU8(JSON.stringify(manifest));
    entries['project.json'] = strToU8(JSON.stringify(project));

    const restored = await importOidProjectArchive(zipSync(entries));
    expect(restored.project.schemaVersion).toBe(7);
    expect(restored.project.settings).toEqual({});
  });

  it('migrates a schema 1 package without candidate entries to schema 5', async () => {
    const archive = await createOidProjectArchive({ ...snapshot, exportedAt: 50 });
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as { schemaVersion: number };
    const project = JSON.parse(strFromU8(entries['project.json']!)) as { schemaVersion: number };
    manifest.schemaVersion = 1;
    project.schemaVersion = 1;
    entries['manifest.json'] = strToU8(JSON.stringify(manifest));
    entries['project.json'] = strToU8(JSON.stringify(project));
    delete entries['data/candidates.json'];
    const restored = await importOidProjectArchive(zipSync(entries));
    expect(restored.project.schemaVersion).toBe(7);
    expect(restored.candidates).toEqual([]);
  });

  it.each([2, 3, 4])(
    'migrates schema %i archives to schema 5 before output-edge validation',
    async (version) => {
      const archive = await createOidProjectArchive({ ...snapshot, exportedAt: 50 });
      const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
      const manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as {
        schemaVersion: number;
      };
      const project = JSON.parse(strFromU8(entries['project.json']!)) as { schemaVersion: number };
      manifest.schemaVersion = version;
      project.schemaVersion = version;
      entries['manifest.json'] = strToU8(JSON.stringify(manifest));
      entries['project.json'] = strToU8(JSON.stringify(project));

      const restored = await importOidProjectArchive(zipSync(entries));

      expect(restored.manifest.schemaVersion).toBe(7);
      expect(restored.project.schemaVersion).toBe(7);
    },
  );

  it('round-trips unaccepted candidate Blobs but rejects missing candidate data or bytes', async () => {
    const generationNode = {
      id: 'generate',
      boardId: 'board-1',
      type: 'generation' as const,
      label: 'Generate',
      direction: 'Lamp',
      notes: '',
      count: 1,
      requestedViews: ['front' as const],
      x: 100,
      y: 100,
      width: 250,
      height: 250,
      rotation: 0,
      zIndex: 2,
      createdAt: 1,
      updatedAt: 1,
    };
    const candidate = {
      id: 'candidate-1',
      projectId: 'project-1',
      boardId: 'board-1',
      generationNodeId: generationNode.id,
      generationId: 'generation-1',
      mimeType: 'image/png',
      inputSignature: 'signature',
      view: 'front' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    const generation = {
      id: 'generation-1',
      projectId: 'project-1',
      actionId: 'ai.canvasGenerate',
      providerId: 'provider',
      createdAt: 1,
      updatedAt: 1,
      status: 'success' as const,
      sourceDesignIds: [],
      sourceAssetIds: [],
    };
    const inputEdge = {
      id: 'input-1',
      boardId: 'board-1',
      sourceNodeId: 'node-1',
      targetNodeId: generationNode.id,
      type: 'generation_input' as const,
      inputRole: 'base' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    const outputNode = { ...snapshot.nodes[0]!, id: 'adopted-output' };
    const outputEdge = {
      id: 'output-1',
      boardId: 'board-1',
      sourceNodeId: generationNode.id,
      targetNodeId: outputNode.id,
      type: 'generation_output' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    const results = materializeCandidateResults(
      [...snapshot.nodes, generationNode],
      [inputEdge, outputEdge],
      [candidate],
    );
    const data = {
      ...snapshot,
      boards: [
        {
          ...snapshot.boards[0]!,
          nodeIds: [
            'node-1',
            outputNode.id,
            generationNode.id,
            ...results.nodes.map((node) => node.id),
          ],
          edgeIds: [inputEdge.id, outputEdge.id, ...results.edges.map((edge) => edge.id)],
        },
      ],
      nodes: [...snapshot.nodes, outputNode, generationNode, ...results.nodes],
      edges: [inputEdge, outputEdge, ...results.edges],
      candidates: [candidate],
      generations: [generation],
      candidateBlobs: [
        { id: candidate.id, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) },
      ],
      exportedAt: 50,
    };
    const archive = await createOidProjectArchive(data);
    await expect(
      createOidProjectArchive({
        ...data,
        edges: data.edges.map((item) =>
          item.id === outputEdge.id ? { ...item, targetNodeId: inputEdge.sourceNodeId } : item,
        ),
      }),
    ).rejects.toMatchObject({ code: 'invalid_project_data' });
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(entries[`candidates/${candidate.id}`]).toEqual(new Uint8Array([1, 2, 3]));
    expect(strFromU8(entries['data/candidates.json']!)).not.toContain('AQID');
    const restored = await importOidProjectArchive(archive);
    expect(restored.candidates).toEqual([candidate]);
    expect(restored.nodes.find((node) => node.id === generationNode.id)).toMatchObject({
      requestedViews: ['front'],
    });
    const invalidTask = { ...generationNode, count: 2, requestedViews: ['front', 'front'] };
    const localTask = {
      ...generationNode,
      requestedViews: undefined,
      localEdit: true,
      editRegion: {
        sourceNodeId: 'node-1',
        sourceAssetId: 'asset-1',
        x: 0.2,
        y: 0.1,
        width: 0.3,
        height: 0.4,
      },
    };
    const localArchive = await createOidProjectArchive({
      ...data,
      nodes: [...snapshot.nodes, outputNode, localTask, ...results.nodes],
    });
    const localRestored = await importOidProjectArchive(localArchive);
    expect(localRestored.nodes.find((item) => item.id === localTask.id)).toMatchObject({
      localEdit: true,
      editRegion: localTask.editRegion,
    });
    const invalidLocalTask = {
      ...localTask,
      editRegion: { ...localTask.editRegion, sourceAssetId: 'missing' },
    };
    await expect(
      createOidProjectArchive({ ...data, nodes: [...snapshot.nodes, invalidLocalTask] }),
    ).rejects.toMatchObject({ code: 'invalid_project_data' });
    await expect(
      createOidProjectArchive({
        ...data,
        nodes: [...snapshot.nodes, invalidTask],
      }),
    ).rejects.toMatchObject({ code: 'invalid_project_data' });
    await expect(
      createOidProjectArchive({
        ...data,
        candidates: [{ ...candidate, view: 'diagonal' as never }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_project_data' });
    expect(restored.edges).toEqual([inputEdge, outputEdge, ...results.edges]);
    const legacyEntries = { ...entries };
    const legacyManifest = JSON.parse(strFromU8(legacyEntries['manifest.json']!));
    legacyManifest.schemaVersion = 5;
    legacyEntries['manifest.json'] = strToU8(JSON.stringify(legacyManifest));
    legacyEntries['project.json'] = strToU8(JSON.stringify({ ...data.project, schemaVersion: 5 }));
    legacyEntries['data/nodes.json'] = strToU8(
      JSON.stringify([...snapshot.nodes, outputNode, generationNode]),
    );
    legacyEntries['data/edges.json'] = strToU8(JSON.stringify([inputEdge, outputEdge]));
    legacyEntries['data/boards.json'] = strToU8(
      JSON.stringify([
        {
          ...data.boards[0],
          nodeIds: ['node-1', outputNode.id, generationNode.id],
          edgeIds: [inputEdge.id, outputEdge.id],
        },
      ]),
    );
    const migrated = await importOidProjectArchive(zipSync(legacyEntries));
    expect(migrated.nodes.filter((node) => node.type === 'candidate')).toEqual(results.nodes);
    expect(migrated.edges).toEqual(data.edges);
    expect(new Uint8Array(await restored.candidateBlobs[0]!.blob.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    delete entries[`candidates/${candidate.id}`];
    await expect(importOidProjectArchive(zipSync(entries))).rejects.toMatchObject({
      code: 'missing_asset_blob',
    });
    const noMetadata = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    delete noMetadata['data/candidates.json'];
    await expect(importOidProjectArchive(zipSync(noMetadata))).rejects.toMatchObject({
      code: 'invalid_project_data',
    });
    await expect(
      createOidProjectArchive({
        ...data,
        edges: [inputEdge, { ...inputEdge, id: 'duplicate-main' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_project_data' });
  });
});
