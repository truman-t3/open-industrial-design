// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { LocalizationProvider } from '@open-industrial-design/ui';
import type { GenerationNode } from '@open-industrial-design/design-model';
import { ExplorationQueue } from './exploration-batch';

it('shows actual selection order, reorders without running, then locks the confirmed queue', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const onRun = vi.fn(async () => {});
  const tasks = ['A', 'B'].map(
    (id) => ({ id, label: id, count: 1, direction: 'Explore' }) as GenerationNode,
  );
  try {
    await act(async () =>
      root.render(
        <LocalizationProvider>
          <ExplorationQueue
            tasks={tasks}
            inputSummaries={{ A: 'Main image: Lamp', B: 'Main image: Sketch' }}
            initialIds={['B', 'A']}
            providers={[]}
            providerId="test"
            ready
            busy={false}
            report=""
            onProviderChange={() => {}}
            onRun={onRun}
            onCancel={() => {}}
            onClose={() => {}}
          />
        </LocalizationProvider>,
      ),
    );
    const order = () =>
      [...element.querySelectorAll('ol li > span')].map((item) => item.textContent);
    expect(order()).toEqual(['B', 'A']);
    expect(
      [...element.querySelectorAll('ol .exploration-queue__source')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Main image: Sketch', 'Main image: Lamp']);
    const up = element.querySelector<HTMLButtonElement>('[aria-label="Move A up"]')!;
    await act(async () => up.click());
    expect(order()).toEqual(['A', 'B']);
    expect(
      [...element.querySelectorAll('ol .exploration-queue__source')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Main image: Lamp', 'Main image: Sketch']);
    expect(onRun).not.toHaveBeenCalled();
    expect(element.querySelector<HTMLButtonElement>('[aria-label="Move A up"]')!.disabled).toBe(
      true,
    );
    expect(element.querySelector<HTMLButtonElement>('[aria-label="Move B down"]')!.disabled).toBe(
      true,
    );
    const run = [...element.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Confirm and run'),
    )!;
    expect(run).toBeDefined();
    await act(async () => run.click());
    expect(onRun).toHaveBeenCalledWith(tasks);
    expect(
      [...element.querySelectorAll<HTMLButtonElement>('ol button')].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    expect(run.disabled).toBe(true);
  } finally {
    act(() => root.unmount());
    element.remove();
    vi.restoreAllMocks();
    for (const [key, original] of [
      ['showModal', originalShow],
      ['close', originalClose],
    ] as const) {
      if (original) Object.defineProperty(HTMLDialogElement.prototype, key, original);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
    }
    vi.unstubAllGlobals();
  }
});
