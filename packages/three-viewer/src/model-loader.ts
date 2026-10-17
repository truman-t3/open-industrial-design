import { Box3, LoadingManager, type Material, type Mesh, type Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// GLTFLoader calls preload without observing its promise. Start initialization
// during decode instead, where Three forwards the rejection to the parse task.
class ObservedDRACOLoader extends DRACOLoader {
  preload() {
    return this;
  }
}

export function disposeModel(scene: Object3D) {
  const disposed = new Set<unknown>();
  const dispose = (resource: { dispose(): void }) => {
    if (!disposed.has(resource)) {
      disposed.add(resource);
      resource.dispose();
    }
  };
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    dispose(mesh.geometry);
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (!(value instanceof Texture)) continue;
        const images: unknown[] = Array.isArray(value.image) ? value.image : [value.image];
        for (const image of images) {
          if (
            image &&
            typeof image === 'object' &&
            'close' in image &&
            typeof image.close === 'function' &&
            !disposed.has(image)
          ) {
            disposed.add(image);
            image.close();
          }
        }
        dispose(value);
      }
      dispose(material);
    }
  });
}

export function loadModel(url: string, decoderPath: string, timeoutMs = 30_000) {
  const controller = new AbortController();
  const draco = new ObservedDRACOLoader().setDecoderPath(decoderPath).setWorkerLimit(2);
  const manager = new LoadingManager();
  let resourceFailed = false;
  manager.onError = () => {
    resourceFailed = true;
  };
  const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  let cancelled = false;
  let scene: Object3D | undefined;
  let rejectTask: (error: Error) => void;
  const promise = new Promise<Object3D>((resolve, reject) => {
    rejectTask = reject;
    void (async () => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Model request failed (${response.status}).`);
      const data = await response.arrayBuffer();
      if (cancelled) return;
      const model = await loader.parseAsync(data, url.slice(0, url.lastIndexOf('/') + 1));
      if (cancelled) {
        disposeModel(model.scene);
        return;
      }
      scene = model.scene;
      if (resourceFailed) throw new Error('A model texture or buffer could not be loaded.');
      if (new Box3().setFromObject(scene).isEmpty()) throw new Error('No renderable geometry.');
      resolve(scene);
    })().catch(reject);
  });
  const cancel = (error = new Error('Model loading cancelled.')) => {
    cancelled = true;
    controller.abort();
    draco.dispose();
    if (scene) {
      disposeModel(scene);
      scene = undefined;
    }
    rejectTask(error);
  };
  const timer = setTimeout(() => cancel(new Error('Model loading timed out.')), timeoutMs);
  // This branch consumes its own rejection; callers observe the original task.
  void promise.then(
    () => clearTimeout(timer),
    () => {
      clearTimeout(timer);
      cancel();
    },
  );
  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
      cancel();
    },
  };
}
