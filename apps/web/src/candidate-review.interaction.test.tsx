// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '@open-industrial-design/ui';
import { CandidateReview } from './candidate-review';
import { WorkspaceInspector, type WorkspaceInspectorProps } from './workspace-inspector';

const candidates = [
  { id: 'candidate-a', inputSignature: 'current' },
  { id: 'candidate-b', inputSignature: 'current', view: 'side' },
];

function makeGeneration(
  selectedCandidateId: string | undefined,
  onKeep: ReturnType<typeof vi.fn>,
  onDiscard: ReturnType<typeof vi.fn>,
  onSelectGeneration = vi.fn(),
) {
  return {
    node: { id: 'generation-step', direction: 'Explore finish' },
    candidates,
    selectedCandidateId,
    previewUrls: {
      'candidate-a': 'blob:candidate-a',
      'candidate-b': 'blob:candidate-b',
    },
    inputs: [{ id: 'input', label: 'Lamp', role: 'base', previewUrl: 'blob:source' }],
    inputCount: 1,
    signature: 'current',
    providers: [],
    selectedProviderId: '',
    readiness: 'ready',
    busy: false,
    onUpdate: vi.fn(),
    onProviderChange: vi.fn(),
    onProviderSettings: vi.fn(),
    onDisconnect: vi.fn(),
    onRun: vi.fn(),
    onKeep,
    onDiscard,
    onSelectGeneration,
  } as unknown as NonNullable<WorkspaceInspectorProps['generation']>;
}

function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    render(next: ReactNode) {
      act(() => root.render(next));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('candidate review interactions', () => {
  let mounted: ReturnType<typeof mount> | undefined;
  const showModalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  beforeEach(() => {
    vi.stubGlobal('navigator', { language: 'en' });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    if (showModalDescriptor) {
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
    } else {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    }
    if (closeDescriptor) {
      Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
    } else {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the inspector image, comparison target, and adoption callback on the chosen candidate', () => {
    const onKeep = vi.fn();
    const onDiscard = vi.fn();
    const onSelectGeneration = vi.fn();
    const renderInspector = (selectedCandidateId: string) => (
      <LocalizationProvider>
        <WorkspaceInspector
          generation={makeGeneration(selectedCandidateId, onKeep, onDiscard, onSelectGeneration)}
          onOpenAi={vi.fn()}
          workspace="canvas"
        />
      </LocalizationProvider>
    );

    mounted = mount(renderInspector('candidate-a'));
    expect(
      mounted.container.querySelector('.inspector-generation__candidate img')?.getAttribute('src'),
    ).toBe('blob:candidate-a');

    mounted.render(renderInspector('candidate-b'));
    expect(
      mounted.container.querySelector('.inspector-generation__candidate img')?.getAttribute('src'),
    ).toBe('blob:candidate-b');
    expect(mounted.container.textContent).toContain('Side');

    act(() => {
      mounted?.container
        .querySelector<HTMLButtonElement>('button[aria-label="View candidate"]')
        ?.click();
    });
    const dialog = mounted.container.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);

    act(() => {
      [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
        .find((button) => button.textContent === 'Compare candidates')
        ?.click();
    });
    expect(dialog?.querySelector('figure:first-of-type img')?.getAttribute('src')).toBe(
      'blob:candidate-a',
    );

    const candidateA = dialog?.querySelector<HTMLButtonElement>('button[aria-label="Candidate 1"]');
    act(() => candidateA?.click());
    expect(dialog?.querySelector('footer strong')?.textContent).toContain('Candidate 1');
    expect(dialog?.querySelector('figure:last-of-type img')?.getAttribute('src')).toBe(
      'blob:candidate-a',
    );
    expect(dialog?.querySelector('figure:first-of-type img')?.getAttribute('src')).toBe(
      'blob:candidate-b',
    );

    act(() => {
      [...(dialog?.querySelectorAll<HTMLButtonElement>('footer button') ?? [])]
        .find((button) => button.textContent === 'Keep as design')
        ?.click();
    });
    expect(onKeep).toHaveBeenCalledWith('candidate-a', 'design');

    act(() => {
      [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
        .find((button) => button.textContent === 'Close')
        ?.click();
    });
    expect(mounted.container.querySelector('dialog')).toBeNull();
    expect(
      mounted.container.querySelector('.inspector-generation__candidate img')?.getAttribute('src'),
    ).toBe('blob:candidate-b');

    act(() => {
      [...(mounted?.container.querySelectorAll<HTMLButtonElement>('button') ?? [])]
        .find((button) => button.textContent === 'View generation step')
        ?.click();
    });
    expect(onSelectGeneration).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('routes discard to the selected candidate and does not retarget after it disappears', () => {
    const onKeep = vi.fn();
    const onDiscard = vi.fn();
    const onClose = vi.fn();
    const generation = makeGeneration('candidate-b', onKeep, onDiscard);
    const renderReview = (current = generation) => (
      <LocalizationProvider>
        <CandidateReview generation={current} initialId="candidate-b" onClose={onClose} />
      </LocalizationProvider>
    );

    mounted = mount(renderReview());
    const dialog = mounted.container.querySelector('dialog');
    act(() => {
      [...(dialog?.querySelectorAll<HTMLButtonElement>('footer button') ?? [])]
        .find((button) => button.textContent === 'Discard')
        ?.click();
    });
    expect(onDiscard).toHaveBeenCalledWith('candidate-b');
    expect(onKeep).not.toHaveBeenCalled();

    mounted.render(
      renderReview({ ...generation, candidates: [candidates[0]] as typeof generation.candidates }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(dialog?.querySelector('footer strong')).toBeNull();
    expect(dialog?.querySelector('footer button[disabled]')).not.toBeNull();
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
