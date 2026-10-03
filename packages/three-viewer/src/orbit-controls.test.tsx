// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { OrthographicCamera, PerspectiveCamera } from 'three';
import { ViewerOrbitControls } from './orbit-controls';
import { CameraDirector } from './index';

const runtime = vi.hoisted(() => ({ state: {} as Record<string, unknown>, frame: () => {} }));
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof runtime.state) => unknown) => selector(runtime.state),
  useFrame: (callback: () => void) => {
    runtime.frame = callback;
  },
}));

it('saving a camera does not replay the last command when the callback changes', async () => {
  const camera = new PerspectiveCamera();
  runtime.state = { camera, controls: undefined, invalidate: vi.fn() };
  const root = createRoot(document.createElement('div'));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const command = {
    version: 0,
    type: 'restore' as const,
    camera: {
      mode: 'perspective' as const,
      position: [3, 2, 3] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
    },
  };
  const first = vi.fn();
  const next = vi.fn();
  try {
    await act(async () =>
      root.render(<CameraDirector command={command} mode="perspective" onCameraChange={first} />),
    );
    expect(first).toHaveBeenCalledTimes(1);
    camera.position.set(1, 4, 2);
    await act(async () =>
      root.render(<CameraDirector command={command} mode="perspective" onCameraChange={next} />),
    );
    expect(camera.position.toArray()).toEqual([1, 4, 2]);
    expect(next).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        <CameraDirector
          command={{ ...command, version: 1 }}
          mode="perspective"
          onCameraChange={next}
        />,
      ),
    );
    expect(camera.position.toArray()).toEqual([3, 2, 3]);
    expect(next).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
  }
});

it('fits orthographic models using the viewport frustum rather than a tiny fixed zoom', async () => {
  const camera = new OrthographicCamera(-500, 500, 400, -400);
  runtime.state = { camera, controls: undefined, invalidate: vi.fn() };
  const root = createRoot(document.createElement('div'));
  const saved = vi.fn();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    await act(async () =>
      root.render(
        <CameraDirector
          command={{ type: 'fit', version: 1 }}
          mode="orthographic"
          bounds={{ center: [0, 0, 0], size: [1, 1, 0], min: [0, 0, 0], max: [1, 1, 0], radius: 1 }}
          onCameraChange={saved}
        />,
      ),
    );
    expect(camera.zoom).toBe(500);
    expect(saved.mock.calls[0][0].zoom).toBe(500);
  } finally {
    await act(async () => root.unmount());
  }
});

it('official controls reconnect cleanly in StrictMode and restore the previous controller', async () => {
  const element = document.createElement('canvas');
  document.body.append(element);
  const previous = { previous: true };
  runtime.state = {
    camera: new PerspectiveCamera(),
    gl: { domElement: element },
    controls: previous,
    invalidate: vi.fn(),
    get: () => runtime.state,
    set: (patch: Record<string, unknown>) => Object.assign(runtime.state, patch),
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <ViewerOrbitControls />
        </StrictMode>,
      ),
    );
    const controls = runtime.state
      .controls as import('three/addons/controls/OrbitControls.js').OrbitControls;
    expect(controls.object).toBe(runtime.state.camera);
    expect(controls.domElement).toBe(element);
    expect(controls.enablePan && controls.enableRotate && controls.enableZoom).toBe(true);
    controls.target.set(1, 2, 3);
    runtime.frame();
    expect(controls.target.toArray()).toEqual([1, 2, 3]);
    const invalidate = runtime.state.invalidate as ReturnType<typeof vi.fn>;
    invalidate.mockClear();
    controls.dispatchEvent({ type: 'change' });
    expect(invalidate).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(runtime.state.controls).toBe(previous);
    invalidate.mockClear();
    controls.dispatchEvent({ type: 'change' });
    runtime.frame();
    expect(invalidate).not.toHaveBeenCalled();
  } finally {
    element.remove();
  }
});
