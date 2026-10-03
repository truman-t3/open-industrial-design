import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../src/fixtures/minimal-triangle.glb', import.meta.url));
const encoder = new TextEncoder();

function padToFour(bytes, padding) {
  const paddedLength = Math.ceil(bytes.length / 4) * 4;
  const output = new Uint8Array(paddedLength);
  output.set(bytes);
  output.fill(padding, bytes.length);
  return output;
}

function createFixture() {
  const json = {
    asset: { version: '2.0', generator: 'Open Industrial Design test fixture' },
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        max: [1, 1, 0],
        min: [0, 0, 0],
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const jsonChunk = padToFour(encoder.encode(JSON.stringify(json)), 0x20);
  const binaryChunk = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const bytes = new Uint8Array(12 + 8 + jsonChunk.length + 8 + binaryChunk.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonChunk, 20);
  const binaryOffset = 20 + jsonChunk.length;
  view.setUint32(binaryOffset, binaryChunk.length, true);
  view.setUint32(binaryOffset + 4, 0x004e4942, true);
  bytes.set(binaryChunk, binaryOffset + 8);
  return bytes;
}

function validateFixture(bytes) {
  if (bytes.length < 20) throw new Error('GLB fixture is too small.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67)
    throw new Error('GLB fixture has an invalid magic header.');
  if (view.getUint32(4, true) !== 2) throw new Error('GLB fixture must use glTF 2.0.');
  if (view.getUint32(8, true) !== bytes.length)
    throw new Error('GLB fixture length header is invalid.');
  if (view.getUint32(16, true) !== 0x4e4f534a)
    throw new Error('GLB fixture is missing a JSON chunk.');
}

if (process.argv.includes('--check')) {
  validateFixture(new Uint8Array(await readFile(target)));
  console.log(`Validated ${target}`);
} else {
  const fixture = createFixture();
  validateFixture(fixture);
  await writeFile(target, fixture);
  console.log(`Wrote ${target}`);
}
