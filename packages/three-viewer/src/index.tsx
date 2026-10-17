import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ViewerOrbitControls } from './orbit-controls';
import { loadModel } from './model-loader';
import { Canvas, useThree } from '@react-three/fiber';
import { Box3, type Camera, type Material, type Mesh, Object3D, Vector3 } from 'three';
import { changeProjection, fitCamera, updateClipping, type ReviewCamera } from './camera';
import { captureModelView } from './capture';
export { prepareModelImport } from './model-import';
import { translate, type AppLocale } from '@open-industrial-design/core';
import type { Asset, CameraState } from '@open-industrial-design/design-model';
import {
  defaultCameraState,
  getModelFormat,
  type ModelBoundsInfo,
  type ModelInspection,
  type ViewerPreset,
} from './adapter';

type OrbitControlRuntime = {
  target: Vector3;
  update(): void;
  object?: Camera;
  addEventListener(type: 'end' | 'change', listener: () => void): void;
  removeEventListener(type: 'end' | 'change', listener: () => void): void;
};

type ViewerCommand =
  | { version: number; type: 'restore'; camera: CameraState }
  | { version: number; type: 'fit' }
  | { version: number; type: 'preset'; preset: ViewerPreset };

type ViewerCommandInput =
  | { type: 'restore'; camera: CameraState }
  | { type: 'fit' }
  | { type: 'preset'; preset: ViewerPreset };

export interface ModelViewerWorkspaceProps {
  asset: Asset;
  initialCamera?: CameraState;
  modelUrl: string;
  decoderPath: string;
  onCameraChange(camera: CameraState): void;
  onCapture(
    blob: Blob,
    camera: CameraState,
    size: { width: number; height: number },
  ): void | Promise<void>;
  onError(message: string): void;
  locale?: AppLocale;
}

function asTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function readCamera(
  camera: Camera,
  controls: OrbitControlRuntime | undefined,
  mode: CameraState['mode'],
) {
  const target = controls?.target ?? new Vector3();
  return {
    mode,
    position: asTuple(camera.position),
    target: asTuple(target),
    zoom: 'zoom' in camera && typeof camera.zoom === 'number' ? camera.zoom : undefined,
  } satisfies CameraState;
}

/** Swap only the camera, keeping the renderer, model and capture lifecycle alive. */
function CameraProjection({ mode }: { mode: CameraState['mode'] }) {
  const get = useThree((state) => state.get);
  const set = useThree((state) => state.set);
  useLayoutEffect(() => {
    const state = get();
    const camera = state.camera as ReviewCamera;
    if ('isOrthographicCamera' in camera === (mode === 'orthographic')) return;
    const controls = state.controls as unknown as OrbitControlRuntime | undefined;
    const next = changeProjection(
      camera,
      controls?.target ?? new Vector3(),
      mode,
      state.size.width,
      state.size.height,
    );
    set({ camera: next });
    state.invalidate();
  }, [get, mode, set]);
  return null;
}

export function CameraDirector({
  bounds,
  command,
  mode,
  onCameraChange,
}: {
  bounds?: ModelBoundsInfo;
  command: ViewerCommand;
  mode: CameraState['mode'];
  onCameraChange(camera: CameraState): void;
}) {
  const camera = useThree((state) => state.camera) as ReviewCamera;
  const controls = useThree(
    (state) => state.controls as unknown as OrbitControlRuntime | undefined,
  );
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const cameraChange = useRef(onCameraChange);
  const applied = useRef<ViewerCommand | undefined>(undefined);
  useEffect(() => {
    cameraChange.current = onCameraChange;
  }, [onCameraChange]);

  useEffect(() => {
    if (
      !bounds ||
      !controls ||
      (controls.object && controls.object !== camera) ||
      'isOrthographicCamera' in camera !== (mode === 'orthographic') ||
      applied.current === command
    )
      return;
    const next =
      command.type === 'restore'
        ? command.camera
        : fitCamera(
            bounds,
            command.type === 'fit' ? 'perspective' : command.preset,
            mode,
            size.width,
            size.height,
          );
    camera.position.set(...next.position);
    camera.zoom = next.zoom ?? 1;
    camera.lookAt(new Vector3(...next.target));
    controls.target.set(...next.target);
    controls.update();
    updateClipping(camera, bounds);
    applied.current = command;
    invalidate();
    cameraChange.current({ ...next, mode });
  }, [bounds, camera, command, controls, invalidate, mode, size]);

  useEffect(() => {
    if (
      !bounds ||
      !controls ||
      (controls.object && controls.object !== camera) ||
      'isOrthographicCamera' in camera !== (mode === 'orthographic')
    )
      return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      updateClipping(camera, bounds);
      clearTimeout(timer);
      // Damping continues after pointer-up. Persist only the settled view.
      timer = setTimeout(() => cameraChange.current(readCamera(camera, controls, mode)), 180);
    };
    controls.addEventListener('change', changed);
    controls.addEventListener('end', changed);
    changed();
    return () => {
      clearTimeout(timer);
      controls.removeEventListener('change', changed);
      controls.removeEventListener('end', changed);
    };
  }, [bounds, camera, controls, mode]);
  return null;
}

export function CaptureBridge({
  request,
  onCapture,
  onError,
  onDone,
}: {
  request?: { id: number; longEdge: number };
  onCapture: ModelViewerWorkspaceProps['onCapture'];
  onError(message: string): void;
  onDone(): void;
}) {
  const get = useThree((state) => state.get);
  const callbacks = useRef({ onCapture, onError, onDone });
  callbacks.current = { onCapture, onError, onDone };
  useEffect(() => {
    if (!request) return;
    let active = true;
    const handlers = callbacks.current;
    const state = get();
    const camera = state.camera as ReviewCamera;
    const snapshot = readCamera(
      camera,
      state.controls as unknown as OrbitControlRuntime,
      'isOrthographicCamera' in camera ? 'orthographic' : 'perspective',
    );
    void captureModelView(
      state.gl,
      state.scene,
      camera,
      state.size.width,
      state.size.height,
      request.longEdge,
    )
      .then(async ({ blob, width, height }) => {
        if (active) await handlers.onCapture(blob, snapshot, { width, height });
      })
      .catch(() => {
        if (active) callbacks.current.onError('Could not capture the current 3D view.');
      })
      .finally(() => {
        if (active) callbacks.current.onDone();
      });
    return () => {
      active = false;
    };
  }, [get, request]);
  return null;
}

function LoadedModel({
  scene,
  onInspection,
  wireframe,
}: {
  scene: Object3D;
  onInspection(value: ModelInspection): void;
  wireframe: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const box = new Box3().setFromObject(scene);
    if (box.isEmpty()) throw new Error('The model does not contain renderable geometry.');
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    let meshCount = 0;
    let triangleCount = 0;
    scene.traverse((object) => {
      if ((object as Mesh).isMesh) {
        meshCount += 1;
        const mesh = object as Mesh;
        triangleCount +=
          ((mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3) *
          ('count' in mesh ? Number(mesh.count) : 1);
      }
    });
    onInspection({
      meshCount,
      triangleCount: Math.floor(triangleCount),
      bounds: {
        min: asTuple(box.min),
        max: asTuple(box.max),
        size: asTuple(size),
        center: asTuple(center),
        radius: Math.max(size.length() / 2, 1e-8),
      },
    });
  }, [onInspection, scene]);

  useEffect(() => {
    scene.traverse((object) => {
      if (!(object as Mesh).isMesh) return;
      const rawMaterial = (object as Mesh).material as Material | Material[];
      const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial];
      materials.forEach((material: Material) => {
        if ('wireframe' in material) material.wireframe = wireframe;
      });
    });
    invalidate();
  }, [scene, wireframe, invalidate]);

  return <primitive object={scene} />;
}

class ViewerErrorBoundary extends Component<
  { children: ReactNode; fallback: string; onError(message: string): void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(
      error instanceof Error ? error.message : 'The 3D model could not be loaded.',
    );
  }

  render() {
    return this.state.failed ? (
      <div className="model-viewer__error">{this.props.fallback}</div>
    ) : (
      this.props.children
    );
  }
}

function ReviewLighting({ bounds }: { bounds?: ModelBoundsInfo }) {
  const target = useMemo(() => {
    const object = new Object3D();
    object.position.set(...(bounds?.center ?? [0, 0, 0]));
    return object;
  }, [bounds]);
  const radius = bounds?.radius ?? 1;
  const position = (x: number, y: number, z: number): [number, number, number] => [
    target.position.x + radius * x,
    target.position.y + radius * y,
    target.position.z + radius * z,
  ];
  return (
    <>
      <primitive object={target} />
      <ambientLight intensity={1.3} />
      <directionalLight target={target} intensity={2.3} position={position(4, 7, 5)} />
      <directionalLight target={target} intensity={0.65} position={position(-4, 2, -3)} />
    </>
  );
}

export function ModelViewerWorkspace({
  asset,
  initialCamera,
  modelUrl,
  decoderPath,
  onCameraChange,
  onCapture,
  onError,
  locale = 'en',
}: ModelViewerWorkspaceProps) {
  const [canvasCamera] = useState(() => ({
    fov: 42,
    position: initialCamera?.position ?? defaultCameraState().position,
  }));
  const [cameraMode, setCameraMode] = useState<CameraState['mode']>(
    initialCamera?.mode ?? 'perspective',
  );
  const [gridVisible, setGridVisible] = useState(true);
  const [groundVisible, setGroundVisible] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [inspection, setInspection] = useState<ModelInspection>();
  const [attempt, setAttempt] = useState(0);
  const [model, setModel] = useState<Object3D>();
  const [failed, setFailed] = useState(false);
  const errorCallback = useRef({ locale, onError });
  errorCallback.current = { locale, onError };
  const fail = useCallback(() => {
    setFailed(true);
    setInspection(undefined);
    errorCallback.current.onError(translate(errorCallback.current.locale, 'threeD.loadFailed'));
  }, []);
  useEffect(() => {
    let active = true;
    setModel(undefined);
    setInspection(undefined);
    setFailed(false);
    onError('');
    const task = loadModel(modelUrl, decoderPath);
    void task.promise.then(
      (scene) => {
        if (active) setModel(scene);
      },
      () => {
        if (active) fail();
      },
    );
    return () => {
      active = false;
      task.cancel();
    };
  }, [modelUrl, decoderPath, attempt, fail, onError]);
  const [captureRequest, setCaptureRequest] = useState<{ id: number; longEdge: number }>();
  const captureSequence = useRef(0);
  const [captureSize, setCaptureSize] = useState(2048);
  const [background, setBackground] = useState<'light' | 'dark'>('dark');
  const originalCamera = useRef(initialCamera);
  const [command, setCommand] = useState<ViewerCommand>({
    version: 0,
    ...(initialCamera
      ? { type: 'restore' as const, camera: initialCamera }
      : { type: 'fit' as const }),
  });

  const issueCommand = useCallback((next: ViewerCommandInput) => {
    setCommand((previous) => ({ ...next, version: previous.version + 1 }));
  }, []);
  const updateInspection = useCallback((value: ModelInspection) => setInspection(value), []);
  const changeCameraMode = (mode: CameraState['mode']) => {
    setCameraMode(mode);
  };
  const format = getModelFormat(asset) ?? asset.name.split('.').at(-1)?.toUpperCase() ?? 'Unknown';

  return (
    <section aria-label={translate(locale, 'threeD.workspace')} className="model-viewer">
      <header className="model-viewer__header">
        <div>
          <h2>{translate(locale, 'threeD.title')}</h2>
          <p>{asset.name}</p>
        </div>
        <span>{format.toUpperCase()}</span>
      </header>
      <div className="model-viewer__body">
        <aside
          className="model-viewer__controls"
          aria-label={translate(locale, 'threeD.workspace')}
        >
          <div>
            <strong>{translate(locale, 'threeD.camera')}</strong>
            <div className="model-viewer__button-grid">
              <button
                className={cameraMode === 'perspective' ? 'is-active' : undefined}
                onClick={() => changeCameraMode('perspective')}
                type="button"
              >
                {translate(locale, 'threeD.perspective')}
              </button>
              <button
                className={cameraMode === 'orthographic' ? 'is-active' : undefined}
                onClick={() => changeCameraMode('orthographic')}
                type="button"
              >
                {translate(locale, 'threeD.orthographic')}
              </button>
            </div>
          </div>
          <div>
            <strong>{translate(locale, 'threeD.presets')}</strong>
            <div className="model-viewer__button-grid">
              {(['perspective', 'front', 'rear', 'left', 'right', 'top', 'bottom'] as const).map(
                (preset) => (
                  <button
                    key={preset}
                    onClick={() => issueCommand({ type: 'preset', preset })}
                    type="button"
                  >
                    {translate(locale, `threeD.${preset}` as const)}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="model-viewer__button-grid">
            <button onClick={() => issueCommand({ type: 'fit' })} type="button">
              {translate(locale, 'threeD.fit')}
            </button>
            <button
              onClick={() => {
                if (originalCamera.current) setCameraMode(originalCamera.current.mode);
                issueCommand(
                  originalCamera.current
                    ? { type: 'restore', camera: originalCamera.current }
                    : { type: 'fit' },
                );
              }}
              type="button"
            >
              {translate(locale, 'threeD.reset')}
            </button>
          </div>
          <label>
            <input
              checked={gridVisible}
              onChange={(event) => setGridVisible(event.target.checked)}
              type="checkbox"
            />
            {translate(locale, 'threeD.grid')}
          </label>
          <label>
            <input
              checked={groundVisible}
              onChange={(event) => setGroundVisible(event.target.checked)}
              type="checkbox"
            />
            {translate(locale, 'threeD.ground')}
          </label>
          <label>
            <input
              checked={wireframe}
              onChange={(event) => setWireframe(event.target.checked)}
              type="checkbox"
            />
            {translate(locale, 'threeD.wireframe')}
          </label>
          <label className="model-viewer__select">
            {translate(locale, 'threeD.background')}
            <select
              aria-label={translate(locale, 'threeD.background')}
              value={background}
              onChange={(event) => setBackground(event.target.value as 'light' | 'dark')}
            >
              <option value="dark">{translate(locale, 'threeD.dark')}</option>
              <option value="light">{translate(locale, 'threeD.light')}</option>
            </select>
          </label>
          <label className="model-viewer__select">
            {translate(locale, 'threeD.captureSize')}
            <select
              aria-label={translate(locale, 'threeD.captureSize')}
              value={captureSize}
              disabled={Boolean(captureRequest)}
              onChange={(event) => setCaptureSize(Number(event.target.value))}
            >
              <option value={1024}>1024 px</option>
              <option value={2048}>2048 px</option>
            </select>
          </label>
          <button
            className="model-viewer__capture"
            disabled={!inspection || failed || Boolean(captureRequest)}
            onClick={() =>
              setCaptureRequest({ id: ++captureSequence.current, longEdge: captureSize })
            }
            type="button"
          >
            {translate(locale, captureRequest ? 'threeD.capturing' : 'threeD.capture')}
          </button>
          <p>{translate(locale, 'threeD.captureHint')}</p>
          <p>{translate(locale, 'threeD.controls')}</p>
        </aside>
        <div className="model-viewer__canvas">
          {failed ? (
            <div className="model-viewer__error" role="alert">
              <p>{translate(locale, 'threeD.loadFailed')}</p>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                {translate(locale, 'threeD.retry')}
              </button>
            </div>
          ) : !model ? (
            <div className="model-viewer__error" role="status">
              {translate(locale, 'common.loading')}
            </div>
          ) : (
            <ViewerErrorBoundary
              fallback={translate(locale, 'threeD.previewUnavailable')}
              key={`${modelUrl}:${attempt}`}
              onError={fail}
            >
              <Canvas
                camera={canvasCamera}
                gl={{ antialias: true }}
                frameloop="demand"
                dpr={[1, 2]}
              >
                <color args={[background === 'dark' ? '#171b18' : '#edf0f3']} attach="background" />
                <CameraProjection mode={cameraMode} />
                <ReviewLighting bounds={inspection?.bounds} />
                {gridVisible && inspection ? (
                  <gridHelper
                    position={[
                      inspection.bounds.center[0],
                      inspection.bounds.min[1] - inspection.bounds.radius * 0.005,
                      inspection.bounds.center[2],
                    ]}
                    args={[
                      inspection.bounds.radius * 4,
                      20,
                      background === 'dark' ? '#65756a' : '#9ca7b0',
                      background === 'dark' ? '#38463c' : '#c6ced4',
                    ]}
                  />
                ) : null}
                {groundVisible && inspection ? (
                  <mesh
                    position={[
                      inspection.bounds.center[0],
                      inspection.bounds.min[1] - inspection.bounds.radius * 0.01,
                      inspection.bounds.center[2],
                    ]}
                    rotation-x={-Math.PI / 2}
                  >
                    <planeGeometry
                      args={[inspection.bounds.radius * 8, inspection.bounds.radius * 8]}
                    />
                    <meshStandardMaterial
                      color={background === 'dark' ? '#1c211e' : '#dfe4e8'}
                      roughness={1}
                    />
                  </mesh>
                ) : null}
                <LoadedModel scene={model} onInspection={updateInspection} wireframe={wireframe} />
                <ViewerOrbitControls />
                <CameraDirector
                  bounds={inspection?.bounds}
                  command={command}
                  mode={cameraMode}
                  onCameraChange={onCameraChange}
                />
                <CaptureBridge
                  onDone={() => setCaptureRequest(undefined)}
                  onCapture={onCapture}
                  onError={onError}
                  request={captureRequest}
                />
              </Canvas>
            </ViewerErrorBoundary>
          )}
        </div>
        <aside className="model-viewer__info" aria-label={translate(locale, 'threeD.info')}>
          <h3>{translate(locale, 'threeD.info')}</h3>
          <dl>
            <div>
              <dt>{translate(locale, 'threeD.file')}</dt>
              <dd>{asset.name}</dd>
            </div>
            <div>
              <dt>{translate(locale, 'threeD.format')}</dt>
              <dd>{format.toUpperCase()}</dd>
            </div>
            <div>
              <dt>{translate(locale, 'inspector.size')}</dt>
              <dd>{Math.ceil(asset.size / 1024)} KB</dd>
            </div>
            <div>
              <dt>{translate(locale, 'threeD.meshes')}</dt>
              <dd>
                {inspection?.meshCount ?? (failed ? '—' : translate(locale, 'common.loading'))}
              </dd>
            </div>
            <div>
              <dt>{translate(locale, 'threeD.triangles')}</dt>
              <dd>{inspection?.triangleCount.toLocaleString() ?? '—'}</dd>
            </div>
            <div>
              <dt>{translate(locale, 'threeD.bounds')}</dt>
              <dd>
                {inspection
                  ? inspection.bounds.size
                      .map((value) =>
                        value !== 0 && Math.abs(value) < 0.01
                          ? value.toExponential(2)
                          : value.toLocaleString(locale, { maximumFractionDigits: 2 }),
                      )
                      .join(' × ')
                  : failed
                    ? '—'
                    : translate(locale, 'common.loading')}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
