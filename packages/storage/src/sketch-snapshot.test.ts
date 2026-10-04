import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import {
  DexieProjectRepository,
  DexieProjectArchiveStorage,
  OpenIndustrialDesignDatabase,
} from './index';
import {
  createOidProjectArchive,
  importOidProjectArchive,
} from '@open-industrial-design/project-file';

it('saves and revises sketches atomically while retaining historical previews', async () => {
  const db = new OpenIndustrialDesignDatabase(`sketch-${crypto.randomUUID()}`);
  const repo = new DexieProjectRepository(db);
  try {
    await db.projects.add({
      id: 'p',
      name: 'Sketch',
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
    const make = (revision: number): Parameters<typeof repo.saveSketchSnapshot>[0] => {
      const sourceBlob = new Blob(
        [JSON.stringify({ type: 'excalidraw', version: 2, elements: [] })],
        { type: 'application/json' },
      );
      const previewBlob = new Blob(['preview'], { type: 'image/png' });
      return {
        document: {
          id: 'doc',
          projectId: 'p',
          format: 'excalidraw',
          formatVersion: 2,
          sourceAssetId: `source-${revision}`,
          previewAssetId: `preview-${revision}`,
          createdAt: 1,
          updatedAt: revision,
        },
        node: {
          id: 'node',
          boardId: 'b',
          type: 'sketch',
          sketchDocumentId: 'doc',
          previewAssetId: `preview-${revision}`,
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          rotation: 0,
          zIndex: 1,
          createdAt: 1,
          updatedAt: revision,
        },
        source: {
          id: `source-${revision}`,
          projectId: 'p',
          type: 'document',
          name: 'source',
          mimeType: sourceBlob.type,
          size: sourceBlob.size,
          storage: { type: 'indexeddb', blobId: `source-${revision}` },
          createdAt: revision,
          updatedAt: revision,
        },
        preview: {
          id: `preview-${revision}`,
          projectId: 'p',
          type: 'image',
          name: 'preview',
          mimeType: previewBlob.type,
          size: previewBlob.size,
          storage: { type: 'indexeddb', blobId: `preview-${revision}` },
          createdAt: revision,
          updatedAt: revision,
        },
        sourceBlob,
        previewBlob,
      };
    };
    await repo.saveSketchSnapshot(make(1));
    const fail = vi.spyOn(db.boards, 'put').mockRejectedValueOnce(new Error('Disk full'));
    await expect(repo.saveSketchSnapshot(make(2))).rejects.toThrow('Disk full');
    fail.mockRestore();
    expect((await db.sketchDocuments.get('doc'))?.previewAssetId).toBe('preview-1');
    expect((await db.nodes.get('node'))?.updatedAt).toBe(1);
    expect(await db.assets.count()).toBe(2);
    expect(await db.assetBlobs.count()).toBe(2);
    await db.nodes.add({ ...make(1).node, id: 'copy', x: 640 });
    await db.boards.update('b', { nodeIds: ['node', 'copy'] });
    await repo.saveSketchSnapshot(make(2));
    expect((await db.boards.get('b'))?.nodeIds).toEqual(['node', 'copy']);
    expect(await db.nodes.get('copy')).toMatchObject({ x: 640, previewAssetId: 'preview-2' });
    expect(await db.assetBlobs.count()).toBe(4);
    expect(await db.assetBlobs.get('preview-1')).toBeDefined();
    await expect(repo.saveSketchSnapshot(make(2))).rejects.toThrow();
    const invalid = make(3);
    invalid.document.projectId = 'other';
    await expect(repo.saveSketchSnapshot(invalid)).rejects.toThrow();
    await db.nodes.update('node', { locked: true });
    await expect(repo.saveSketchSnapshot(make(3))).rejects.toThrow();
    expect(await db.assets.count()).toBe(4);
    const portable = await new DexieProjectArchiveStorage(db).readProjectArchive('p');
    const parsed = await importOidProjectArchive(
      await createOidProjectArchive({
        ...portable.snapshot,
        assetBlobs: portable.assetBlobs,
        candidateBlobs: portable.candidateBlobs,
        generationInputBlobs: portable.generationInputBlobs,
      }),
    );
    const restored = new OpenIndustrialDesignDatabase(`sketch-restored-${crypto.randomUUID()}`);
    try {
      await new DexieProjectArchiveStorage(restored).restoreProjectArchive(parsed);
      const restoredRepo = new DexieProjectRepository(restored);
      expect(await restoredRepo.getSketchDocument('doc')).toEqual(
        await repo.getSketchDocument('doc'),
      );
      expect(await (await restoredRepo.getAssetBlob('source-2'))?.blob.text()).toBe(
        await make(2).sourceBlob.text(),
      );
      expect(await restoredRepo.getAssetBlob('preview-1')).toBeDefined();
      await restored.nodes.update('node', { locked: false });
      await restoredRepo.saveSketchSnapshot(make(3));
      expect((await restoredRepo.getSketchDocument('doc'))?.sourceAssetId).toBe('source-3');
      expect(await restored.nodes.count()).toBe(2);
      expect(await restored.nodes.get('copy')).toMatchObject({
        x: 640,
        previewAssetId: 'preview-3',
      });
      expect(await restored.sketchDocuments.count()).toBe(1);
    } finally {
      await restored.delete();
    }
  } finally {
    await db.delete();
  }
});
