import { isValidEditRegion, type EditRegion } from '@open-industrial-design/design-model';
import type { ProviderImageInput } from '@open-industrial-design/ai-core';

function selectionBounds(region: EditRegion, width: number, height: number) {
  return {
    x: Math.floor(region.x * width),
    y: Math.floor(region.y * height),
    right: Math.min(width, Math.ceil((region.x + region.width) * width)),
    bottom: Math.min(height, Math.ceil((region.y + region.height) * height)),
  };
}

/** Preserve decoded source pixels exactly outside the same rectangle used by the mask. */
export function mergeLocalEditPixels(
  source: Uint8ClampedArray,
  result: Uint8ClampedArray,
  width: number,
  height: number,
  region: EditRegion,
) {
  if (
    !isValidEditRegion(region) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 16_777_216 ||
    source.length !== width * height * 4 ||
    result.length !== source.length
  )
    throw new Error('Invalid local edit pixels.');
  const output = new Uint8ClampedArray(source);
  const bounds = selectionBounds(region, width, height);
  for (let y = bounds.y; y < bounds.bottom; y += 1) {
    for (let x = bounds.x; x < bounds.right; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = result[offset + 3]! / 255;
      const baseAlpha = source[offset + 3]! / 255;
      const combinedAlpha = alpha + baseAlpha * (1 - alpha);
      if (!alpha) continue;
      for (let channel = 0; channel < 3; channel += 1)
        output[offset + channel] =
          (result[offset + channel]! * alpha +
            source[offset + channel]! * baseAlpha * (1 - alpha)) /
          combinedAlpha;
      output[offset + 3] = combinedAlpha * 255;
    }
  }
  return output;
}

export async function protectLocalEdit(
  source: ProviderImageInput,
  result: ProviderImageInput,
  region: EditRegion,
): Promise<ProviderImageInput> {
  const bitmaps: ImageBitmap[] = [];
  try {
    // Decode sequentially so a rejected decode cannot leak a sibling bitmap.
    for (const image of [source, result])
      bitmaps.push(
        await createImageBitmap(new Blob([new Uint8Array(image.data)], { type: image.mimeType })),
      );
    const [base, edited] = bitmaps as [ImageBitmap, ImageBitmap];
    if (
      !base.width ||
      !base.height ||
      base.width * base.height > 16_777_216 ||
      base.width !== edited.width ||
      base.height !== edited.height
    )
      throw new Error('Local edit dimensions differ.');
    const canvas = document.createElement('canvas');
    canvas.width = base.width;
    canvas.height = base.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Local edit compositing is unavailable.');
    context.drawImage(base, 0, 0);
    const original = context.getImageData(0, 0, base.width, base.height);
    context.clearRect(0, 0, base.width, base.height);
    context.drawImage(edited, 0, 0);
    const generated = context.getImageData(0, 0, base.width, base.height);
    original.data.set(
      mergeLocalEditPixels(original.data, generated.data, base.width, base.height, region),
    );
    context.putImageData(original, 0, 0);
    return await png(canvas);
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}

export function adjustEditRegion(
  region: EditRegion,
  field: 'x' | 'y' | 'width' | 'height',
  percent: number,
): EditRegion {
  if (!Number.isFinite(percent)) return region;
  const next = { ...region };
  const value = Math.max(0, Math.min(1, percent / 100));
  if (field === 'x') next.x = Math.min(value, 1 - next.width);
  if (field === 'y') next.y = Math.min(value, 1 - next.height);
  if (field === 'width') next.width = Math.max(0.01, Math.min(value, 1 - next.x));
  if (field === 'height') next.height = Math.max(0.01, Math.min(value, 1 - next.y));
  return next;
}

export function rectangleBetween(start: [number, number], end: [number, number]) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const [a, b] = start.map(clamp);
  const [c, d] = end.map(clamp);
  return {
    x: Math.min(a!, c!),
    y: Math.min(b!, d!),
    width: Math.abs(a! - c!),
    height: Math.abs(b! - d!),
  };
}

async function png(canvas: HTMLCanvasElement): Promise<ProviderImageInput> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
      'image/png',
    ),
  );
  if (blob.size >= 50 * 1024 * 1024) throw new Error('Image exceeds the mask editing size limit.');
  return { mimeType: 'image/png', data: new Uint8Array(await blob.arrayBuffer()) };
}

/** Runtime-only PNG preparation. The selection is transparent, the protected area opaque. */
export async function prepareEditMask(image: ProviderImageInput, region: EditRegion) {
  if (!isValidEditRegion(region)) throw new Error('Invalid edit selection.');
  const bitmap = await createImageBitmap(
    new Blob([new Uint8Array(image.data)], { type: image.mimeType }),
  );
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16_777_216)
      throw new Error('Image is too large for local mask preparation.');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas mask preparation is unavailable.');
    context.drawImage(bitmap, 0, 0);
    const input = await png(canvas);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const { x, y, right, bottom } = selectionBounds(region, canvas.width, canvas.height);
    context.clearRect(x, y, right - x, bottom - y);
    return { image: input, mask: await png(canvas) };
  } finally {
    bitmap.close();
  }
}
