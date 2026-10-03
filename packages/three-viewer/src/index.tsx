import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ViewerOrbitControls } from './orbit-controls';
import { loadModel } from './model-loader';
import { Canvas, useThree } from '@react-three/fiber';
import { Box3, type Camera, type Material, type Mesh, Object3D, Vector3 } from 'three';
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
  addEventListener(type: 'end', listener: () => void): void;
  removeEventListener(type: 'end', listener: () => void): void;
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
  onCapture(blob: Blob, camera: CameraState): void;
  onError(message: string): void;
  locale?: AppLocale;
}

function asTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function cameraForPreset(
  preset: ViewerPreset,
  bounds: ModelBoundsInfo,
  mode: CameraState['mode'],
): CameraState {
  const center = new Vector3(...bounds.center);
  const distance = Math.max(bounds.radius * 2.8, 1);
  const positions: Record<ViewerPreset, Vector3> = {
    perspective: center.clone().add(new Vector3(distance, distance * 0.65, distance)),
    front: center.clone().add(new Vector3(0, 0, distance)),
    side: center.clone().add(new Vector3(distance, 0, 0)),
    rear: center.clone().add(new Vector3(0, 0, -distance)),
    top: center.clone().add(new Vector3(0, distance, 0.001)),
  };
  return {
    mode,
    position: asTuple(positions[preset]),
    target: bounds.center,
    zoom: mode === 'orthographic' ? 2 / Math.max(...bounds.size, 0.25) : undefined,
    preset,
  };
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
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls as unknown as OrbitControlRuntime | undefined,
  );
  const invalidate = useThree((state) => state.invalidate);
  // Saving a view changes the parent's callback identity; it is not a new camera command.
  const cameraChange = useRef(onCameraChange);
  useEffect(() => {
    cameraChange.current = onCameraChange;
  }, [onCameraChange]);

  useEffect(() => {
    const next =
      command.type === 'restore'
        ? command.camera
        : bounds
          ? command.type === 'fit'
            ? cameraForPreset('perspective', bounds, mode)
            : cameraForPreset(command.preset, bounds, mode)
          : undefined;
    if (!next) return;
    // Fiber's orthographic frustum is measured in viewport pixels, not world units.
    if (
      mode === 'orthographic' &&
      command.type !== 'restore' &&
      bounds &&
      'top' in camera &&
      'bottom' in camera &&
      'left' in camera &&
      'right' in camera
    ) {
      const width = Number(camera.right) - Number(camera.left);
      const height = Number(camera.top) - Number(camera.bottom);
      next.zoom = Math.min(width, height) / (Math.max(...bounds.size, 0.25) * 1.6);
    }
    camera.position.set(...next.position);
    if ('zoom' in camera && typeof camera.zoom === 'number' && next.zoom) camera.zoom = next.zoom;
    camera.updateProjectionMatrix();
    controls?.target.set(...next.target);
    controls?.update();
    invalidate();
    cameraChange.current({ ...next, mode });
  }, [bounds, camera, command, controls, invalidate, mode]);

  useEffect(() => {
    if (!controls) return;
    const onEnd = () => cameraChange.current(readCamera(camera, controls, mode));
    controls.addEventListener('end', onEnd);
    return () => controls.removeEventListener('end', onEnd);
  }, [camera, controls, mode]);

  return null;
}

function CaptureBridge({
  request,
  mode,
  onCapture,
  onError,
}: {
  request: number;
  mode: CameraState['mode'];
  onCapture(blob: Blob, camera: CameraState): void;
  onError(message: string): void;
}) {
  const handledRequest = useRef(0);
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls as unknown as OrbitControlRuntime | undefined,
  );
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if (!request || handledRequest.current === request) return;
    handledRequest.current = request;
    gl.render(scene, camera);
    requestAnimationFrame(() => {
      gl.domElement.toBlob((blob) => {
        if (!blob) {
          onError('Could not capture the current 3D view.');
          return;
        }
        onCapture(blob, readCamera(camera, controls, mode));
      }, 'image/png');
    });
  }, [camera, controls, gl, mode, onCapture, onError, request, scene]);

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
  useEffect(() => {
    const box = new Box3().setFromObject(scene);
    if (box.isEmpty()) throw new Error('The model does not contain renderable geometry.');
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    let meshCount = 0;
    scene.traverse((object) => {
      if ((object as Mesh).isMesh) meshCount += 1;
    });
    onInspection({
      meshCount,
      bounds: {
        min: asTuple(box.min),
        max: asTuple(box.max),
        size: asTuple(size),
        center: asTuple(center),
        radius: Math.max(size.length() / 2, 0.05),
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
  }, [scene, wireframe]);

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
  const fail = useCallback(() => {
    setFailed(true);
    setInspection(undefined);
    onError(translate(locale, 'threeD.loadFailed'));
  }, [locale, onError]);
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
  const [captureRequest, setCaptureRequest] = useState(0);
  const [command, setCommand] = useState<ViewerCommand>({
    version: 0,
    type: 'restore',
    camera: initialCamera ?? defaultCameraState(),
  });

  const issueCommand = useCallback((next: ViewerCommandInput) => {
    setCommand((previous) => ({ ...next, version: previous.version + 1 }));
  }, []);
  const updateInspection = useCallback((value: ModelInspection) => setInspection(value), []);
  const changeCameraMode = (mode: CameraState['mode']) => {
    setCameraMode(mode);
    issueCommand({ type: 'fit' });
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
              {(['perspective', 'front', 'side', 'rear', 'top'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => issueCommand({ type: 'preset', preset })}
                  type="button"
                >
                  {translate(locale, `threeD.${preset}` as const)}
                </button>
              ))}
            </div>
          </div>
          <div className="model-viewer__button-grid">
            <button onClick={() => issueCommand({ type: 'fit' })} type="button">
              {translate(locale, 'threeD.fit')}
            </button>
            <button
              onClick={() =>
                issueCommand({
                  type: 'restore',
                  camera: initialCamera ?? defaultCameraState(),
                })
              }
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
          <button
            className="model-viewer__capture"
            disabled={!inspection || failed}
            onClick={() => setCaptureRequest((value) => value + 1)}
            type="button"
          >
            {translate(locale, 'threeD.capture')}
          </button>
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
                camera={{
                  fov: 42,
                  position: initialCamera?.position ?? defaultCameraState().position,
                }}
                gl={{ antialias: true, preserveDrawingBuffer: true }}
                key={cameraMode}
                orthographic={cameraMode === 'orthographic'}
              >
                <color args={['#171b18']} attach="background" />
                <ambientLight intensity={1.3} />
                <directionalLight castShadow intensity={2.3} position={[4, 7, 5]} />
                <directionalLight intensity={0.65} position={[-4, 2, -3]} />
                {gridVisible ? <gridHelper args={[10, 20, '#4d5a50', '#303a33']} /> : null}
                {groundVisible ? (
                  <mesh receiveShadow rotation-x={-Math.PI / 2}>
                    <planeGeometry args={[100, 100]} />
                    <meshStandardMaterial color="#1c211e" roughness={1} />
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
                  mode={cameraMode}
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
              <dt>{translate(locale, 'threeD.bounds')}</dt>
              <dd>
                {inspection
                  ? inspection.bounds.size.map((value) => value.toFixed(2)).join(' × ')
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
