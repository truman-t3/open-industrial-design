// SPDX-License-Identifier: MPL-2.0
import { WebGLRenderTarget, type Scene, type WebGLRenderer } from 'three';
import type { ReviewCamera } from './camera';

/** Render to an owned target so normal frames do not need preserveDrawingBuffer. */
export async function captureModelView(
  gl: WebGLRenderer,
  scene: Scene,
  camera: ReviewCamera,
  width: number,
  height: number,
  longEdge: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (width <= 0 || height <= 0 || ![1024, 2048].includes(longEdge))
    throw new Error('Invalid capture size.');
  const scale = Math.min(longEdge, gl.capabilities.maxTextureSize) / Math.max(width, height);
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const target = new WebGLRenderTarget(outputWidth, outputHeight, { samples: 4 });
  target.texture.colorSpace = gl.outputColorSpace;
  const previous = gl.getRenderTarget();
  const pixels = new Uint8Array(outputWidth * outputHeight * 4);
  try {
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.readRenderTargetPixels(target, 0, 0, outputWidth, outputHeight, pixels);
  } finally {
    gl.setRenderTarget(previous);
    target.dispose();
  }
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Capture canvas is unavailable.');
  const output = context.createImageData(outputWidth, outputHeight);
  const stride = outputWidth * 4;
  for (let row = 0; row < outputHeight; row++) {
    output.data.set(
      pixels.subarray(row * stride, (row + 1) * stride),
      (outputHeight - row - 1) * stride,
    );
  }
  context.putImageData(output, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error('Could not encode the current 3D view.')),
      'image/png',
    ),
  );
  return { blob, width: outputWidth, height: outputHeight };
}
