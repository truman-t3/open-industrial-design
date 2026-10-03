import { describe, expect, it } from 'vitest';
import type { BaseNode, Board, Project } from '@open-industrial-design/design-model';
import { loadProjectCover } from './project-cover';

const project = { id: 'project' } as Project;
const reader = (nodes: object[], blobs: Record<string, Blob>) => ({
  listBoards: async () => [{ id: 'board' }] as Board[],
  listNodes: async () => nodes as BaseNode[],
  getBlob: async (id: string) => blobs[id],
});

describe('Home project cover', () => {
  it('prefers a design preview over a reference without changing nodes', async () => {
    const nodes = [
      { type: 'reference', assetId: 'ref' },
      { type: 'concept', previewAssetId: 'design' },
    ];
    const design = new Blob(['design'], { type: 'image/png' });
    expect(
      await loadProjectCover(
        project,
        reader(nodes, { design, ref: new Blob(['ref'], { type: 'image/jpeg' }) }),
      ),
    ).toBe(design);
    expect(nodes[1]).toEqual({ type: 'concept', previewAssetId: 'design' });
  });
  it('skips missing and non-image blobs and falls back to an existing image', async () => {
    const image = new Blob(['ref'], { type: 'image/jpeg' });
    expect(
      await loadProjectCover(
        project,
        reader(
          [
            { type: 'concept', previewAssetId: 'missing' },
            { type: 'model3d', assetId: 'model' },
            { type: 'reference', assetId: 'ref' },
          ],
          { model: new Blob(['model'], { type: 'model/gltf-binary' }), ref: image },
        ),
      ),
    ).toBe(image);
    expect(await loadProjectCover(project, reader([], {}))).toBeUndefined();
  });
});
