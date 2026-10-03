import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { loadModel } from './model-loader';

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  dispose: vi.fn(),
  path: vi.fn(),
  preload: vi.fn(),
}));
vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    setDecoderPath(path: string) {
      mocks.path(path);
      return this;
    }
    setWorkerLimit() {
      return this;
    }
    preload() {
      mocks.preload();
      return this;
    }
    dispose() {
      mocks.dispose();
    }
  },
}));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setDRACOLoader(decoder: { preload(): void }) {
      decoder.preload();
      return this;
    }
    setMeshoptDecoder() {
      return this;
    }
    parseAsync(...args: unknown[]) {
      return mocks.parse(...args);
    }
  },
}));
const scene = () => {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  return root;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(new ArrayBuffer(4))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('owned model loading', () => {
  it('uses the explicit local decoder without unobserved eager initialization', async () => {
    const root = scene();
    mocks.parse.mockResolvedValue({ scene: root });
    const task = loadModel('http://local/model.glb', '/runtime/draco/1.5.5/');
    expect(await task.promise).toBe(root);
    expect(mocks.path).toHaveBeenCalledWith('/runtime/draco/1.5.5/');
    expect(mocks.preload).not.toHaveBeenCalled();
    task.cancel();
  });
  it('reports HTTP failure without attempting to parse', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }));
    await expect(loadModel('model', '/local/').promise).rejects.toThrow('404');
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it('allows a fresh attempt after decoder rejection', async () => {
    mocks.parse
      .mockRejectedValueOnce(new Error('decoder unavailable'))
      .mockResolvedValueOnce({ scene: scene() });
    await expect(loadModel('same', '/local/').promise).rejects.toThrow('decoder unavailable');
    const retry = loadModel('same', '/local/');
    await expect(retry.promise).resolves.toBeInstanceOf(Group);
    retry.cancel();
  });
  it('times out a stalled model and aborts its fetch', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const task = loadModel('slow', '/local/', 100);
    const rejected = expect(task.promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('disposes late results when the user has left the viewer', async () => {
    let finish!: (value: { scene: Group }) => void;
    mocks.parse.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const root = scene();
    const dispose = vi.spyOn((root.children[0] as Mesh).geometry, 'dispose');
    const task = loadModel('model', '/local/');
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalled());
    const rejected = expect(task.promise).rejects.toThrow('cancelled');
    task.cancel();
    finish({ scene: root });
    await rejected;
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  });
  it('rejects empty geometry and releases resources', async () => {
    mocks.parse.mockResolvedValue({ scene: new Group() });
    await expect(loadModel('empty', '/local/').promise).rejects.toThrow('No renderable geometry');
    expect(mocks.dispose).toHaveBeenCalled();
  });
});
