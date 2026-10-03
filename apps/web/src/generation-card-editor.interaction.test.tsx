// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationNode } from '@open-industrial-design/design-model';
import { GenerationCardEditor } from '../../../packages/canvas/src/generation-card-editor';

const node: GenerationNode = {
  id: 'step',
  boardId: 'board',
  type: 'generation',
  label: 'CMF',
  direction: '探索材质',
  notes: '',
  count: 2,
  x: 100,
  y: 80,
  width: 240,
  height: 260,
  rotation: 0,
  zIndex: 0,
  createdAt: 1,
  updatedAt: 1,
};

describe('generation card editing', () => {
  let root: Root;
  let container: HTMLDivElement;
  const commit = vi.fn();
  const run = vi.fn();
  function render(zoom = 1, busy = false) {
    act(() =>
      root.render(
        <GenerationCardEditor
          node={node}
          viewport={{ x: 20, y: 30, zoom }}
          locale="zh-CN"
          busy={busy}
          ready
          providerName="Local fixture"
          onCommit={commit}
          onRun={run}
        />,
      ),
    );
  }
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    commit.mockClear();
    run.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  it('preserves Chinese composition and commits only on blur without running', () => {
    render();
    const input = container.querySelector('textarea')!;
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '暖灰色磨砂质感',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: '暖灰色磨砂质感' }),
      );
    });
    expect(input.value).toBe('暖灰色磨砂质感');
    expect(commit).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(commit).toHaveBeenCalledWith('暖灰色磨砂质感');
    expect(run).not.toHaveBeenCalled();
    act(() => container.querySelector('button')!.click());
    expect(run).toHaveBeenCalledWith('暖灰色磨砂质感');
  });
  it('does not bubble pointer, wheel or keyboard gestures into canvas', () => {
    render();
    const bubbled = vi.fn();
    for (const type of ['pointerdown', 'wheel', 'keydown']) {
      document.addEventListener(type, bubbled);
      act(() =>
        container.querySelector('textarea')!.dispatchEvent(new Event(type, { bubbles: true })),
      );
      document.removeEventListener(type, bubbled);
    }
    expect(bubbled).not.toHaveBeenCalled();
  });
  it('tracks viewport, hides small-scale editing and disables controls while running', () => {
    render(1, true);
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.style.left).toBe('120px');
    expect(overlay.style.top).toBe('110px');
    expect(container.querySelector('textarea')!.disabled).toBe(true);
    expect(container.querySelector('button')!.disabled).toBe(true);
    render(0.79);
    expect(container.childElementCount).toBe(0);
  });
});
