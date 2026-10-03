// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasWorkspace, useCanvasRuntimeStore, type CanvasNode } from './index';

// Replace drawing only: CanvasWorkspace's state, effects, and global listeners remain real.
vi.mock('react-konva', async () => {
  const React = await import('react');
  type Props = Record<string, unknown> & { children?: import('react').ReactNode };
  const stage = { draggable: vi.fn(), findOne: () => undefined };
  const shape = (name: string) => (props: Props) =>
    React.createElement(
      'div',
      {
        'data-shape': name,
        'data-node': props.id,
        'data-draggable': String(props.draggable),
        'data-output': props.onMouseDown ? 'true' : undefined,
        onMouseDown: props.onMouseDown
          ? (event: import('react').MouseEvent) => {
              event.stopPropagation();
              (props.onMouseDown as (event: unknown) => void)({ cancelBubble: false });
            }
          : undefined,
      },
      props.children,
    );
  return {
    Stage: React.forwardRef((props: Props, ref) => {
      React.useImperativeHandle(ref, () => stage, []);
      return React.createElement(
        'div',
        { 'data-stage': 'true', 'data-draggable': String(props.draggable) },
        props.children,
      );
    }),
    Transformer: React.forwardRef((_props: Props, ref) => {
      React.useImperativeHandle(ref, () => ({ nodes: vi.fn(), getLayer: () => undefined }), []);
      return null;
    }),
    Group: shape('Group'),
    Layer: shape('Layer'),
    Arrow: shape('Arrow'),
    Circle: shape('Circle'),
    Rect: shape('Rect'),
    Text: shape('Text'),
    Image: shape('Image'),
  };
});

describe('Canvas connection lifecycle', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onConnectInput = vi.fn();
  const onDelete = vi.fn();
  const onUndo = vi.fn();
  const onNodesChange = vi.fn();
  const node = {
    id: 'source',
    boardId: 'board',
    type: 'reference',
    label: 'Lamp',
    x: 0,
    y: 0,
    width: 120,
    height: 80,
  } as CanvasNode;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(720);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    useCanvasRuntimeStore.getState().clearSelection();
    useCanvasRuntimeStore.getState().setViewport({ x: 0, y: 0, zoom: 1 });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <CanvasWorkspace
          boardId="board"
          nodes={[node]}
          onNodesChange={onNodesChange}
          onConnectInput={onConnectInput}
          onDelete={onDelete}
          onDuplicate={vi.fn()}
          onUndo={onUndo}
          onRedo={vi.fn()}
        />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function startConnection() {
    act(() =>
      container
        .querySelector('[data-output="true"]')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
    );
    expect(container.querySelectorAll('[data-shape="Arrow"]')).toHaveLength(1);
    expect(container.querySelector('[data-node="source"]')?.getAttribute('data-draggable')).toBe(
      'false',
    );
  }

  it('zoom and framing change only the viewport, preserving selection and node layout', () => {
    act(() => useCanvasRuntimeStore.getState().select('source', false));
    const selection = useCanvasRuntimeStore.getState().selectedIds;
    const click = (label: string) =>
      act(() =>
        container
          .querySelector(`button[aria-label="${label}"]`)!
          .dispatchEvent(new MouseEvent('click', { bubbles: true })),
      );
    click('Zoom out');
    expect(useCanvasRuntimeStore.getState().viewport.zoom).toBeCloseTo(1 / 1.2);
    click('Zoom in');
    expect(useCanvasRuntimeStore.getState().viewport.zoom).toBeCloseTo(1);
    click('Fit all');
    expect(useCanvasRuntimeStore.getState().viewport).toEqual({ x: 420, y: 320, zoom: 1 });
    expect(useCanvasRuntimeStore.getState().selectedIds).toEqual(selection);
    expect(onNodesChange).not.toHaveBeenCalled();
    expect(onConnectInput).not.toHaveBeenCalled();
  });

  it('disables navigation during a draft connection and restores it on cancellation', () => {
    startConnection();
    const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('nav button'));
    expect(buttons()).toHaveLength(4);
    expect(buttons().every((button) => button.disabled)).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(buttons().every((button) => !button.disabled)).toBe(true);
  });

  it('holds Space to pan and releases back to selection without changing the toolbar mode', () => {
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true })));
    expect(container.querySelector('[data-stage]')?.getAttribute('data-draggable')).toBe('true');
    expect(container.querySelector('[data-node="source"]')?.getAttribute('data-draggable')).toBe(
      'false',
    );
    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' })));
    expect(container.querySelector('[data-stage]')?.getAttribute('data-draggable')).toBe('false');
    expect(container.querySelector('[data-node="source"]')?.getAttribute('data-draggable')).toBe(
      'true',
    );
  });

  it('releases temporary panning when the window loses focus', () => {
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true })));
    act(() => window.dispatchEvent(new Event('blur')));
    expect(container.querySelector('[data-stage]')?.getAttribute('data-draggable')).toBe('false');
  });

  it('does not start panning from an input, button, or while connecting', () => {
    for (const tag of ['input', 'button']) {
      const target = document.createElement(tag);
      container.append(target);
      act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
      expect(container.querySelector('[data-stage]')?.getAttribute('data-draggable')).toBe('false');
      target.remove();
    }
    startConnection();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true })));
    expect(container.querySelectorAll('[data-shape="Arrow"]')).toHaveLength(1);
    expect(container.querySelector('[data-stage]')?.getAttribute('data-draggable')).toBe('false');
  });

  it('Escape removes the draft, restores node dragging, and resumes normal shortcuts', () => {
    act(() => useCanvasRuntimeStore.getState().select('source', false));
    startConnection();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    });
    expect(onDelete).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
    act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })),
    );
    expect(container.querySelectorAll('[data-shape="Arrow"]')).toHaveLength(0);
    expect(container.querySelector('[data-node="source"]')?.getAttribute('data-draggable')).toBe(
      'true',
    );
    expect(onConnectInput).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('window blur cancels without connecting and permits starting another connection', () => {
    startConnection();
    act(() => window.dispatchEvent(new Event('blur')));
    expect(container.querySelectorAll('[data-shape="Arrow"]')).toHaveLength(0);
    expect(container.querySelector('[data-node="source"]')?.getAttribute('data-draggable')).toBe(
      'true',
    );
    expect(onConnectInput).not.toHaveBeenCalled();
    startConnection();
  });

  it('removes global shortcut listeners when the workspace unmounts', () => {
    act(() => useCanvasRuntimeStore.getState().select('source', false));
    act(() => root.render(null));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
