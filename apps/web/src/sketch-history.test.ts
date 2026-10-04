import { expect, it } from 'vitest';
import type { CanvasNode } from '@open-industrial-design/canvas';
import type { SketchNode } from '@open-industrial-design/design-model';
import { refreshSketchPreview } from './sketch-history';

it('refreshes shared previews across undo and redo frames without rewriting placement or old inputs', () => {
  const sketch: SketchNode & { label: string } = {
    boardId: 'b',
    label: 'Sketch',
    y: 0,
    width: 320,
    height: 240,
    rotation: 0,
    zIndex: 1,
    createdAt: 1,
    id: 's',
    type: 'sketch',
    sketchDocumentId: 'doc',
    previewAssetId: 'old',
    x: 10,
    updatedAt: 1,
  };
  const unrelated = { ...sketch, id: 'other', sketchDocumentId: 'other-doc' };
  const generation = {
    id: 'g',
    type: 'generation',
    editRegion: { sourceNodeId: 's', sourceAssetId: 'old' },
    inputSignature: 'historical',
  } as unknown as CanvasNode;
  const frames = [
    [],
    [sketch, unrelated, generation],
    [{ ...sketch, x: 200 }, { ...sketch, id: 'copy', x: 300 }, unrelated, generation],
  ];
  const refreshed = frames.map((frame) => refreshSketchPreview(frame, 'doc', 'new', 5));
  expect(refreshed[0]).toEqual([]);
  expect(refreshed[1][0]).toMatchObject({ x: 10, previewAssetId: 'new', updatedAt: 5 });
  expect(refreshed[2][0]).toMatchObject({ x: 200, previewAssetId: 'new' });
  expect(refreshed[2][1]).toMatchObject({ id: 'copy', x: 300, previewAssetId: 'new' });
  expect(refreshed[1][1]).toBe(unrelated);
  expect(refreshed[1][2]).toMatchObject({ editRegion: undefined, inputSignature: 'historical' });
  expect(sketch).toMatchObject({ previewAssetId: 'old', updatedAt: 1 });
  expect(generation).toHaveProperty('editRegion.sourceAssetId', 'old');
});
