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

  it('keeps DNA draft after save failure and allows explicit retry without running AI', async () => {
    const design = {
      id: 'dna-design',
      name: 'Lamp',
      kind: 'concept',
      status: 'exploring',
    } as NonNullable<WorkspaceInspectorProps['selectedDesign']>;
    const onSaveDna = vi
      .fn()
      .mockRejectedValueOnce(new Error('failure'))
      .mockResolvedValueOnce(undefined);
    const onOpenAi = vi.fn();
    mounted = mount(
      <LocalizationProvider>
        <WorkspaceInspector
          selectedDesign={design}
          onSaveDna={onSaveDna}
          onOpenAi={onOpenAi}
          workspace="canvas"
        />
      </LocalizationProvider>,
    );
    const form = mounted.container.querySelector<HTMLFormElement>('.inspector-dna-editor')!;
    const checkbox = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    act(() => checkbox.click());
    expect(onSaveDna).not.toHaveBeenCalled();
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('Your draft is kept');
    expect(checkbox.checked).toBe(true);
    expect(form.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSaveDna).toHaveBeenCalledTimes(2);
    expect(onSaveDna).toHaveBeenLastCalledWith(
      'dna-design',
      expect.objectContaining({ silhouetteLocked: true }),
    );
    expect(form.querySelector('[role="status"]')?.textContent).toContain('Constraints saved');
    expect(onOpenAi).not.toHaveBeenCalled();
  });

  it.each([undefined, 'candidate-a'])(
    'offers additional image continuations without running models (%s)',
    (selectedId) => {
      const generation = selectedId ? makeGeneration(selectedId, vi.fn(), vi.fn()) : undefined;
      const exploration = { busy: false, onChoose: vi.fn() };
      const render = () => (
        <LocalizationProvider>
          <WorkspaceInspector
            generation={generation}
            exploration={exploration}
            onOpenAi={vi.fn()}
            workspace="canvas"
          />
        </LocalizationProvider>
      );
      mounted = mount(render());
      const more = Array.from(mounted.container.querySelectorAll('summary')).find(
        (element) => element.textContent === 'More image tools',
      )!.parentElement as HTMLDetailsElement;
      expect(more.open).toBe(false);
      const buttons = Array.from(more.querySelectorAll('button'));
      expect(buttons).toHaveLength(5);
      act(() => buttons.find((button) => button.textContent === 'Remove background')!.click());
      expect(exploration.onChoose).toHaveBeenCalledExactlyOnceWith('cutout');
      if (generation) expect(generation.onRun).not.toHaveBeenCalled();
      exploration.busy = true;
      mounted.render(render());
      expect(Array.from(more.querySelectorAll('button')).every((button) => button.disabled)).toBe(
        true,
      );
    },
  );

  it('keeps task choices collapsed, changes only the draft and closes after choosing', () => {
    const generation = makeGeneration(undefined, vi.fn(), vi.fn());
    const render = () => (
      <LocalizationProvider>
        <WorkspaceInspector generation={generation} onOpenAi={vi.fn()} workspace="canvas" />
      </LocalizationProvider>
    );
    mounted = mount(render());
    const picker = () =>
      mounted!.container.querySelector<HTMLButtonElement>('button[aria-label="Change task"]')!;
    expect(picker().getAttribute('aria-expanded')).toBe('false');
    expect(mounted.container.querySelector('#generation-tool-picker')).toBeNull();
    act(() => picker().click());
    expect(picker().getAttribute('aria-expanded')).toBe('true');
    const tools = Array.from(
      mounted.container.querySelectorAll<HTMLButtonElement>('#generation-tool-picker button'),
    );
    expect(tools).toHaveLength(16);
    expect(tools.find((button) => button.textContent === 'Text to concept')?.disabled).toBe(true);
    act(() => tools.find((button) => button.textContent === 'Pattern transfer')!.click());
    expect(generation.onUpdate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        patternTask: { kind: 'transfer', placement: '', scale: 'medium' },
      }),
    );
    expect(generation.onRun).not.toHaveBeenCalled();
    expect(generation.onDisconnect).not.toHaveBeenCalled();
    expect(picker().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(picker());
    act(() => picker().click());
    act(() =>
      Array.from(
        mounted!.container.querySelectorAll<HTMLButtonElement>('#generation-tool-picker button'),
      )
        .find((button) => button.textContent === 'Extract product linework')!
        .click(),
    );
    expect(generation.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        direction: expect.stringContaining('raster'),
        textOnly: undefined,
        patternTask: undefined,
        localEditMode: undefined,
        removeBackground: undefined,
        requestedViews: undefined,
      }),
    );
    expect(generation.onRun).not.toHaveBeenCalled();
    expect(generation.onDisconnect).not.toHaveBeenCalled();
    act(() => picker().click());
    act(() =>
      mounted!.container
        .querySelector('#generation-tool-picker')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(picker().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(picker());
    act(() => picker().click());
    generation.node = { ...generation.node, id: 'another-task' };
    mounted.render(render());
    expect(picker().getAttribute('aria-expanded')).toBe('false');
    generation.busy = true;
    mounted.render(render());
    expect(picker().disabled).toBe(true);
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

  it('compares the full result grid and keeps selection and actions on the explicitly chosen result', () => {
    const onKeep = vi.fn(),
      onDiscard = vi.fn(),
      onClose = vi.fn();
    const base = makeGeneration('candidate-a', onKeep, onDiscard);
    const generation = {
      ...base,
      candidates: [
        ...base.candidates,
        { ...base.candidates[0]!, id: 'candidate-c', inputSignature: 'old' },
        { ...base.candidates[0]!, id: 'candidate-d' },
      ],
    };
    const render = (current = generation) => (
      <LocalizationProvider>
        <CandidateReview generation={current} initialId="candidate-a" onClose={onClose} />
      </LocalizationProvider>
    );
    mounted = mount(render());
    act(() =>
      [...mounted!.container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === 'Compare all results')!
        .click(),
    );
    const grid = mounted.container.querySelector('.candidate-review__grid')!;
    expect(grid.querySelectorAll('button')).toHaveLength(4);
    expect(mounted.container.querySelector('.candidate-review__thumbnails')).toBeNull();
    const third = grid.querySelectorAll<HTMLButtonElement>('button')[2]!;
    expect(third.textContent).toContain('Candidate 3');
    expect(third.querySelectorAll('span')).toHaveLength(2);
    act(() => third.click());
    expect(third.getAttribute('aria-pressed')).toBe('true');
    act(() => mounted!.container.querySelector<HTMLButtonElement>('footer button')!.click());
    expect(onKeep).toHaveBeenCalledWith('candidate-c', 'design');
    expect(base.onRun).not.toHaveBeenCalled();
    mounted.render(render({ ...generation, busyCandidateId: 'candidate-c' }));
    expect(grid.querySelectorAll('button:disabled')).toHaveLength(4);
    act(() => grid.querySelector<HTMLButtonElement>('button')!.click());
    expect(third.getAttribute('aria-pressed')).toBe('true');
    mounted.render(
      render({
        ...generation,
        candidates: generation.candidates.filter((item) => item.id !== 'candidate-c'),
      }),
    );
    expect(onClose).toHaveBeenCalled();
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
