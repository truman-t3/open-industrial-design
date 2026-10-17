import { describe, expect, it, vi, afterEach } from 'vitest';
import { bundleModelFiles, prepareModelImport } from './model-import';

const fixture = {
  asset: { version: '2.0', generator: 'Open Industrial Design test fixture' },
  buffers: [
    {
      uri: 'data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAA',
      byteLength: 36,
    },
  ],
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
afterEach(() => vi.unstubAllGlobals());

describe('self-contained model import', () => {
  it('embeds companion buffers and textures so reopening needs no original paths', async () => {
    const model = JSON.parse(JSON.stringify(fixture));
    model.buffers[0].uri = 'buffers/triangle%20data.bin';
    model.images = [{ uri: 'textures/color.png' }];
    const prepared = await bundleModelFiles([
      new File([JSON.stringify(model)], 'triangle.gltf'),
      new File([new Uint8Array([1, 2, 3])], 'triangle data.bin'),
      new File([new Uint8Array([4, 5, 6])], 'color.png'),
    ]);
    const saved = JSON.parse(await prepared.blob.text());
    expect(saved.buffers[0].uri).toBe('data:application/octet-stream;base64,AQID');
    expect(saved.images[0].uri).toBe('data:image/png;base64,BAUG');
  });
  it('reports the missing resource and refuses ambiguity without any network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const model = (uri: string) =>
      new File([JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri }] })], 'model.gltf');
    await expect(bundleModelFiles([model('part.bin')], 'zh-CN')).rejects.toThrow('缺少资源');
    await expect(
      bundleModelFiles([
        model('part.bin'),
        new File(['a'], 'part.bin'),
        new File(['b'], 'part.bin'),
      ]),
    ).rejects.toThrow('ambiguous');
    await expect(bundleModelFiles([model('https://example.com/model.bin')])).rejects.toThrow(
      'Remote resource',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed GLB headers and missing geometry before persistence', async () => {
    await expect(bundleModelFiles([new File(['not a model'], 'bad.glb')])).rejects.toThrow(
      'damaged',
    );
    const empty = new File(
      [JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 })],
      'empty.gltf',
    );
    await expect(
      prepareModelImport([empty], '/local/', new AbortController().signal),
    ).rejects.toThrow('project was not changed');
  });
  it('accepts a binary GLB triangle after parsing and respects cancellation', async () => {
    const document = { ...fixture, buffers: [{ byteLength: 36 }] };
    const json = new TextEncoder().encode(JSON.stringify(document));
    const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(32);
    padded.set(json);
    const data = new ArrayBuffer(12 + 8 + padded.length + 8 + 36);
    const view = new DataView(data);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, data.byteLength, true);
    view.setUint32(12, padded.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(data, 20, padded.length).set(padded);
    view.setUint32(20 + padded.length, 36, true);
    view.setUint32(24 + padded.length, 0x004e4942, true);
    new Float32Array(data, 28 + padded.length, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const file = new File([data], 'triangle.glb');
    const result = await prepareModelImport([file], '/local/', new AbortController().signal);
    expect(result.format).toBe('glb');
    expect(result.blob.size).toBeGreaterThan(20);
    const controller = new AbortController();
    controller.abort();
    await expect(prepareModelImport([file], '/local/', controller.signal)).rejects.toThrow();
  });
});
