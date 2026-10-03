import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalizationProvider } from '@open-industrial-design/ui';
import { WorkspaceInspector, type WorkspaceInspectorProps } from './workspace-inspector';

describe('candidate inspector selection', () => {
  beforeEach(() => vi.stubGlobal('navigator', { language: 'en' }));
  afterEach(() => vi.unstubAllGlobals());

  it.each(['en', 'zh-CN'])(
    'matches input order and candidate identities in %s without changing data',
    (language) => {
      vi.stubGlobal('navigator', { language });
      const generation = {
        node: { id: 'task', type: 'generation', direction: 'CMF', count: 2 },
        candidates: [
          { id: 'a', inputSignature: 'same' },
          { id: 'b', inputSignature: 'same' },
        ],
        inputs: [
          { id: 'ref-z', role: 'reference', label: 'Finish Z' },
          { id: 'main', role: 'base', label: 'Main sketch' },
          { id: 'ref-a', role: 'reference', label: 'Finish A' },
        ],
        previewUrls: { a: 'blob:a', b: 'blob:b' },
        providers: [],
        signature: 'same',
        inputCount: 3,
      } as unknown as NonNullable<WorkspaceInspectorProps['generation']>;
      const original = JSON.stringify(generation);
      const html = renderToStaticMarkup(
        <LocalizationProvider>
          <WorkspaceInspector generation={generation} onOpenAi={vi.fn()} workspace="canvas" />
        </LocalizationProvider>,
      );
      expect(html.indexOf('Main sketch')).toBeLessThan(html.indexOf('Finish A'));
      expect(html.indexOf('Finish A')).toBeLessThan(html.indexOf('Finish Z'));
      const prefix = language === 'en' ? 'Candidate' : '候选';
      const preview = language === 'en' ? 'View candidate' : '查看候选大图';
      for (const number of [1, 2]) {
        expect(html).toContain(`aria-label="${prefix} ${number}"`);
        expect(html).toContain(`aria-label="${preview} · ${prefix} ${number}"`);
        expect(html).toContain(`alt="${prefix} ${number}"`);
      }
      expect(JSON.stringify(generation)).toBe(original);
    },
  );

  it.each([true, false])(
    'shows a parent name or a readable fallback, never its internal ID (%s)',
    (available) => {
      const parent = {
        id: 'internal-parent-uuid',
        projectId: 'project',
        createdAt: 1,
        updatedAt: 1,
        name: '便携灯具概念方案',
        kind: 'concept' as const,
        status: 'exploring' as const,
      };
      const html = renderToStaticMarkup(
        <LocalizationProvider>
          <WorkspaceInspector
            onOpenAi={vi.fn()}
            workspace="canvas"
            designs={available ? [parent] : []}
            selectedDesign={{
              ...parent,
              id: 'variant',
              name: '柔和轮廓',
              kind: 'variant',
              parentDesignId: parent.id,
            }}
          />
        </LocalizationProvider>,
      );
      expect(html).not.toContain(parent.id);
      expect(html).toContain(available ? parent.name : 'unavailable source design');
    },
  );

  function render(selectedCandidateId: string) {
    const generation = {
      node: { id: 'task', direction: 'Explore finish' },
      selectedCandidateId,
      candidates: [
        { id: 'a', inputSignature: 'same' },
        { id: 'b', inputSignature: 'same' },
      ],
      previewUrls: { a: 'blob:a', b: 'blob:b' },
      inputs: [],
      providers: [],
      signature: 'same',
      onKeep: vi.fn(),
      onDiscard: vi.fn(),
      onSelectGeneration: vi.fn(),
    } as unknown as NonNullable<WorkspaceInspectorProps['generation']>;
    return renderToStaticMarkup(
      <LocalizationProvider>
        <WorkspaceInspector generation={generation} onOpenAi={vi.fn()} workspace="canvas" />
      </LocalizationProvider>,
    );
  }

  it.each(['a', 'b'])('shows only the selected result %s without generation parameters', (id) => {
    const html = render(id);
    expect(html).toContain(`src="blob:${id}"`);
    expect(html).not.toContain(`src="blob:${id === 'a' ? 'b' : 'a'}"`);
    expect(html).toContain('Candidate result');
    expect(html).toContain('View generation step');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('No selection');
  });
  it('offers manual exploration operations for an eligible selected image', () => {
    const html = renderToStaticMarkup(
      <LocalizationProvider>
        <WorkspaceInspector
          onOpenAi={vi.fn()}
          workspace="canvas"
          exploration={{ busy: false, onChoose: vi.fn() }}
        />
      </LocalizationProvider>,
    );
    expect(html).toContain('Continue exploration');
    expect(html).toContain('Render a sketch');
    expect(html).toContain('Explore CMF');
    expect(html).toContain('generation starts only when you click Generate');
    expect(html).not.toContain('View generation step');
  });
  it.each([
    ['Generated reference', 'Generated reference'],
    ['  ', 'REFERENCE'],
  ])('identifies a reference by its label with a type fallback (%s)', (label, title) => {
    const html = renderToStaticMarkup(
      <LocalizationProvider>
        <WorkspaceInspector
          node={
            {
              type: 'reference',
              label,
              x: 0,
              y: 0,
              width: 176,
              height: 140,
            } as WorkspaceInspectorProps['node']
          }
          onOpenAi={vi.fn()}
          workspace="canvas"
        />
      </LocalizationProvider>,
    );
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).not.toContain('<h1>REFERENCE Type</h1>');
  });
  it.each([true, false])('offers cancellation only for the running task (%s)', (canCancel) => {
    const html = renderToStaticMarkup(
      <LocalizationProvider>
        <WorkspaceInspector
          generation={
            {
              node: { id: 'task', type: 'generation', direction: 'CMF', count: 1 },
              candidates: [],
              inputs: [],
              providers: [],
              busy: true,
              readiness: 'ready',
              inputCount: 1,
              onCancel: canCancel ? vi.fn() : undefined,
            } as unknown as NonNullable<WorkspaceInspectorProps['generation']>
          }
          onOpenAi={vi.fn()}
          workspace="canvas"
        />
      </LocalizationProvider>,
    );
    expect(html.includes('Cancel generation')).toBe(canCancel);
    expect(html).toContain('Generating…');
  });
});
