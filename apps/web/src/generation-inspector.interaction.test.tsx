// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '@open-industrial-design/ui';
import { WorkspaceInspector, type WorkspaceInspectorProps } from './workspace-inspector';

type Generation = NonNullable<WorkspaceInspectorProps['generation']>;
describe('generation inspector run controls', () => {
  let root: Root;
  let container: HTMLDivElement;
  const run = vi.fn();
  const settings = vi.fn();
  const update = vi.fn();
  const cancel = vi.fn();
  const generation = (id: string, overrides: Partial<Generation> = {}): Generation =>
    ({
      node: { id, type: 'generation', direction: 'A clear design direction', notes: '', count: 2 },
      candidates: [],
      inputs: [],
      previewUrls: {},
      providers: [],
      inputCount: 0,
      signature: 'same',
      selectedProviderId: '',
      readiness: 'missing',
      busy: false,
      onRun: run,
      onProviderSettings: settings,
      onUpdate: update,
      onCancel: cancel,
      onProviderChange: vi.fn(),
      onDisconnect: vi.fn(),
      onKeep: vi.fn(),
      onDiscard: vi.fn(),
      ...overrides,
    }) as Generation;
  function render(value: Generation) {
    act(() =>
      root.render(
        <LocalizationProvider>
          <WorkspaceInspector workspace="canvas" onOpenAi={vi.fn()} generation={value} />
        </LocalizationProvider>,
      ),
    );
  }
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('navigator', { language: 'en' });
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  it('keeps blocked execution safe while configuration and quantity remain usable', () => {
    render(generation('first'));
    const runButton = container.querySelector<HTMLButtonElement>('.inspector-generation__run')!;
    expect(runButton.disabled).toBe(true);
    expect(container.querySelector('.generation-run')!.textContent).toContain('API key');
    act(() => runButton.click());
    expect(run).not.toHaveBeenCalled();
    act(() =>
      container.querySelector<HTMLButtonElement>('.inspector-generation__settings')!.click(),
    );
    expect(settings).toHaveBeenCalledTimes(1);
    const count = container.querySelector<HTMLSelectElement>('.generation-run__count select')!;
    act(() => {
      count.value = '3';
      count.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledWith({ count: 3 });
  });
  it('resets per-node disclosure while retaining execution and cancellation callbacks', () => {
    render(generation('first'));
    const disclosure = container.querySelector<HTMLDetailsElement>('.inspector__body details')!;
    disclosure.open = true;
    render(generation('second', { readiness: 'ready', inputCount: 1 }));
    expect(container.querySelector<HTMLDetailsElement>('.inspector__body details')!.open).toBe(
      false,
    );
    act(() => container.querySelector<HTMLButtonElement>('.inspector-generation__run')!.click());
    expect(run).toHaveBeenCalledTimes(1);
    render(generation('second', { readiness: 'ready', inputCount: 1, busy: true }));
    expect(container.querySelector<HTMLButtonElement>('.inspector-generation__run')!.disabled).toBe(
      true,
    );
    const cancelButton = [
      ...container.querySelectorAll<HTMLButtonElement>('.generation-run button'),
    ].find((button) => button.textContent === 'Cancel generation')!;
    expect(cancelButton).toBeTruthy();
    act(() => cancelButton.click());
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
