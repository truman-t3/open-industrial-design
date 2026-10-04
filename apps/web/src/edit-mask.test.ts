import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isValidEditRegion,
  isValidPatternPlacement,
  defaultPatternPlacement,
} from '@open-industrial-design/design-model';
import type { EditRegion } from '@open-industrial-design/design-model';
import { rasterEditSelection } from './selection-raster';
import {
  adjustEditRegion,
  prepareEditMask,
  rectangleBetween,
  mergeLocalEditPixels,
  protectLocalEdit,
  mergeCutoutPixels,
} from './edit-mask';

afterEach(() => vi.unstubAllGlobals());
const region = {
  sourceNodeId: 'source',
  sourceAssetId: 'asset',
  x: 0.2,
  y: 0.1,
  width: 0.3,
  height: 0.4,
};
describe('local edit selections', () => {
  it('bounds normalized pattern geometry and rejects nonfinite values', () => {
    expect(isValidPatternPlacement(defaultPatternPlacement)).toBe(true);
    for (const patch of [
      { x: -0.1 },
      { y: 2 },
      { width: 0 },
      { height: 3 },
      { rotation: 181 },
      { opacity: 1.1 },
      { width: NaN },
      { rotation: Infinity },
    ])
      expect(isValidPatternPlacement({ ...defaultPatternPlacement, ...patch })).toBe(false);
  });
  it('uses only cutout alpha and refuses opaque or empty results', () => {
    const source = new Uint8ClampedArray([11, 22, 33, 255, 44, 55, 66, 128, 77, 88, 99, 255]);
    const matte = new Uint8ClampedArray([255, 255, 255, 0, 0, 0, 0, 128, 0, 0, 0, 255]);
    expect([...mergeCutoutPixels(source, matte)]).toEqual([
      11, 22, 33, 0, 44, 55, 66, 64, 77, 88, 99, 255,
    ]);
    expect(() => mergeCutoutPixels(source, new Uint8ClampedArray(12).fill(255))).toThrow(
      /transparent background/,
    );
    expect(() => mergeCutoutPixels(source, new Uint8ClampedArray(12))).toThrow(
      /visible foreground/,
    );
    expect(() => mergeCutoutPixels(source, new Uint8ClampedArray(4))).toThrow(/Invalid/);
    expect(source[3]).toBe(255);
  });
  it('rasterizes polygon and brush geometry and protects exactly the complement', () => {
    const selections: EditRegion[] = [
      {
        ...region,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        shape: {
          kind: 'polygon',
          points: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
      },
      {
        ...region,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        shape: {
          kind: 'brush',
          strokes: [
            {
              points: [
                [0.25, 0.5],
                [0.75, 0.5],
              ],
              radius: 0.125,
            },
          ],
        },
      },
    ];
    for (const selection of selections) {
      const mask = rasterEditSelection(selection, 16, 8);
      expect(mask.includes(1)).toBe(true);
      expect(mask.includes(0)).toBe(true);
      const base = new Uint8ClampedArray(16 * 8 * 4).fill(40),
        generated = new Uint8ClampedArray(base.length).fill(255);
      const merged = mergeLocalEditPixels(base, generated, 16, 8, selection);
      for (let i = 0; i < mask.length; i++)
        expect([...merged.slice(i * 4, i * 4 + 4)]).toEqual(new Array(4).fill(mask[i] ? 255 : 40));
      expect(mask.at(-1)).toBe(0);
    }
  });
  it('rejects malformed, out-of-image and excessive selection geometry', () => {
    const shape = {
      kind: 'polygon',
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    } as const;
    for (const invalid of [
      {
        ...shape,
        points: [
          [NaN, 0],
          [1, 0],
          [0, 1],
        ],
      },
      {
        ...shape,
        points: [
          [0, 0],
          [1, 0],
        ],
      },
      { kind: 'brush', strokes: [{ radius: 1, points: [[0, 0]] }] },
      { kind: 'ellipse' },
      { ...shape, points: new Array(257).fill([0, 0]) },
    ]) {
      expect(isValidEditRegion({ ...region, shape: invalid as never })).toBe(false);
      expect(() => rasterEditSelection({ ...region, shape: invalid as never }, 8, 8)).toThrow();
    }
  });
  it('encodes polygon mask alpha from the same raster, never its bounding rectangle', async () => {
    const selection: EditRegion = {
      ...region,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      shape: {
        kind: 'polygon',
        points: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
      },
    };
    const bitmap = { width: 8, height: 8, close: vi.fn() },
      putImageData = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: '',
        getImageData: () => ({ data: new Uint8ClampedArray(8 * 8 * 4).fill(255) }),
        putImageData,
      }),
      toBlob: (callback: (blob: Blob) => void) =>
        callback(new Blob(['mask'], { type: 'image/png' })),
    };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal('document', { createElement: () => canvas });
    await prepareEditMask({ mimeType: 'image/png', data: new Uint8Array([1]) }, selection);
    const pixels = putImageData.mock.calls[0][0].data as Uint8ClampedArray,
      mask = rasterEditSelection(selection, 8, 8);
    for (let i = 0; i < mask.length; i++) expect(pixels[i * 4 + 3]).toBe(mask[i] ? 0 : 255);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it('keeps every pixel outside the mask unchanged even when the model replaces the whole image', () => {
    const original = new Uint8ClampedArray(4 * 4 * 4).fill(40);
    const edited = new Uint8ClampedArray(original.length).fill(255);
    const selection = { ...region, x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const merged = mergeLocalEditPixels(original, edited, 4, 4, selection);
    for (let y = 0; y < 4; y += 1)
      for (let x = 0; x < 4; x += 1) {
        const offset = (y * 4 + x) * 4;
        expect([...merged.slice(offset, offset + 4)]).toEqual(
          new Array(4).fill(x >= 1 && x < 3 && y >= 1 && y < 3 ? 255 : 40),
        );
      }
    expect(original).toEqual(new Uint8ClampedArray(original.length).fill(40));
  });
  it('handles transparent results and uses the same rounded edge pixels as the mask', () => {
    const original = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255]);
    const transparent = new Uint8ClampedArray([255, 255, 255, 0, 255, 255, 255, 255]);
    expect(
      mergeLocalEditPixels(original, transparent, 2, 1, {
        ...region,
        x: 0,
        y: 0,
        width: 0.49,
        height: 1,
      }),
    ).toEqual(original);
    transparent[3] = 255;
    expect([
      ...mergeLocalEditPixels(original, transparent, 2, 1, {
        ...region,
        x: 0,
        y: 0,
        width: 0.49,
        height: 1,
      }),
    ]).toEqual([255, 255, 255, 255, 10, 20, 30, 255]);
    expect(() => mergeLocalEditPixels(original, new Uint8ClampedArray(4), 2, 1, region)).toThrow();
    expect(() => mergeLocalEditPixels(original, original, 2, 1, { ...region, x: NaN })).toThrow();
  });
  it('refuses different dimensions without scaling and closes both bitmaps', async () => {
    const base = { width: 100, height: 100, close: vi.fn() };
    const edited = { width: 200, height: 100, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValueOnce(base).mockResolvedValueOnce(edited),
    );
    const image = { mimeType: 'image/png', data: new Uint8Array([1]) };
    await expect(protectLocalEdit(image, image, region)).rejects.toThrow(/dimensions/);
    expect(base.close).toHaveBeenCalledOnce();
    expect(edited.close).toHaveBeenCalledOnce();
  });
  it('closes the source bitmap when the result cannot be decoded', async () => {
    const base = { width: 100, height: 100, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValueOnce(base).mockRejectedValueOnce(new Error('invalid image')),
    );
    const image = { mimeType: 'image/png', data: new Uint8Array([1]) };
    await expect(protectLocalEdit(image, image, region)).rejects.toThrow('invalid image');
    expect(base.close).toHaveBeenCalledOnce();
  });
  it('keeps precise adjustments within the image and retains source binding', () => {
    expect(adjustEditRegion(region, 'x', 100).x).toBe(0.7);
    expect(adjustEditRegion(region, 'width', 100).width).toBe(0.8);
    expect(adjustEditRegion(region, 'height', 0).height).toBe(0.01);
    expect(adjustEditRegion(region, 'y', -10).y).toBe(0);
    expect(adjustEditRegion(region, 'x', NaN)).toBe(region);
    expect(adjustEditRegion(region, 'width', 25).sourceAssetId).toBe('asset');
  });
  it('normalizes reversed drags and clamps to the image', () => {
    expect(rectangleBetween([0.8, 0.7], [-1, 2])).toEqual({
      x: 0,
      y: 0.7,
      width: 0.8,
      height: 0.30000000000000004,
    });
    expect(isValidEditRegion(region)).toBe(true);
    expect(isValidEditRegion({ ...region, x: NaN })).toBe(false);
    expect(isValidEditRegion({ ...region, width: 0 })).toBe(false);
    expect(isValidEditRegion({ ...region, width: 1 })).toBe(false);
  });
  it('prepares same-size PNG inputs, opaque protection and transparent editable rectangle', async () => {
    const clearRect = vi.fn();
    const fillRect = vi.fn();
    const bitmap = { width: 100, height: 200, close: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn(), clearRect, fillRect, fillStyle: '' }),
      toBlob: (callback: (blob: Blob) => void) =>
        callback(new Blob([new Uint8Array([1])], { type: 'image/png' })),
    };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal('document', { createElement: () => canvas });
    const result = await prepareEditMask(
      { mimeType: 'image/jpeg', data: new Uint8Array([1]) },
      region,
    );
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(200);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 100, 200);
    expect(clearRect).toHaveBeenLastCalledWith(20, 20, 30, 80);
    expect(result.image.mimeType).toBe('image/png');
    expect(result.mask.mimeType).toBe('image/png');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
