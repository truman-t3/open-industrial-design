// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { CaptureBridge } from './index';

const mock = vi.hoisted(() => ({ capture: vi.fn(), get: vi.fn() }));
vi.mock('./capture', () => ({ captureModelView: mock.capture }));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: { get: typeof mock.get }) => unknown) => select({ get: mock.get }),
}));
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mock.capture.mockReset();
  mock.get.mockReturnValue({
    camera: new PerspectiveCamera(),
    controls: { target: new Vector3() },
    size: { width: 800, height: 600 },
    gl: {},
    scene: {},
  });
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe('explicit capture lifecycle', () => {
  it('saves once in StrictMode and does not replay when the camera or callbacks change', async () => {
    mock.capture.mockResolvedValue({ blob: new Blob(['image']), width: 1024, height: 768 });
    const capture = vi.fn(),
      done = vi.fn();
    const request = { id: 1, longEdge: 1024 };
    await act(async () =>
      root.render(
        <StrictMode>
          <CaptureBridge request={request} onCapture={capture} onDone={done} onError={vi.fn()} />
        </StrictMode>,
      ),
    );
    expect(capture).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    const next = vi.fn();
    mock.get.mockReturnValue({ ...mock.get(), camera: new PerspectiveCamera() });
    await act(async () =>
      root.render(
        <StrictMode>
          <CaptureBridge request={request} onCapture={next} onDone={done} onError={vi.fn()} />
        </StrictMode>,
      ),
    );
    expect(next).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
  });
  it('keeps the capture-time owner and camera snapshot while encoding is pending', async () => {
    let resolve!: (value: unknown) => void;
    mock.capture.mockImplementation(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    const original = vi.fn(),
      changed = vi.fn(),
      request = { id: 1, longEdge: 1024 };
    mock.get().camera.position.set(3, 4, 5);
    await act(async () =>
      root.render(
        <CaptureBridge request={request} onCapture={original} onDone={vi.fn()} onError={vi.fn()} />,
      ),
    );
    mock.get().camera.position.set(8, 9, 10);
    await act(async () =>
      root.render(
        <CaptureBridge request={request} onCapture={changed} onDone={vi.fn()} onError={vi.fn()} />,
      ),
    );
    await act(async () => resolve({ blob: new Blob(['image']), width: 1024, height: 768 }));
    expect(original).toHaveBeenCalledOnce();
    expect(original.mock.calls[0][1].position).toEqual([3, 4, 5]);
    expect(changed).not.toHaveBeenCalled();
  });
  it('does not save a late screenshot after leaving the model', async () => {
    let resolve!: (value: unknown) => void;
    mock.capture.mockImplementation(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    const capture = vi.fn();
    await act(async () =>
      root.render(
        <CaptureBridge
          request={{ id: 1, longEdge: 2048 }}
          onCapture={capture}
          onDone={vi.fn()}
          onError={vi.fn()}
        />,
      ),
    );
    await act(async () => root.render(null));
    await act(async () => resolve({ blob: new Blob(), width: 2048, height: 1536 }));
    expect(capture).not.toHaveBeenCalled();
  });
  it('releases the busy state and reports failure when encoding fails', async () => {
    mock.capture.mockRejectedValue(new Error('encoding failed'));
    const error = vi.fn(),
      done = vi.fn(),
      capture = vi.fn();
    await act(async () =>
      root.render(
        <CaptureBridge
          request={{ id: 1, longEdge: 2048 }}
          onCapture={capture}
          onDone={done}
          onError={error}
        />,
      ),
    );
    expect(error).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
  });
});
