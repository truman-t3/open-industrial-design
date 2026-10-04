import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalizationProvider } from '@open-industrial-design/ui';
import { CandidateReview } from './candidate-review';
import type { WorkspaceInspectorProps } from './workspace-inspector';

describe('candidate comparison', () => {
  beforeEach(() => vi.stubGlobal('navigator', { language: 'en' }));
  afterEach(() => vi.unstubAllGlobals());
  it.each(['en', 'zh-CN'])(
    'explains local edit review in %s without triggering actions',
    (language) => {
      vi.stubGlobal('navigator', { language });
      const onKeep = vi.fn();
      const generation = {
        node: { localEdit: true },
        inputs: [],
        candidates: [{ id: 'candidate', inputSignature: 'same' }],
        previewUrls: {},
        signature: 'same',
        onKeep,
        onDiscard: vi.fn(),
      } as unknown as NonNullable<WorkspaceInspectorProps['generation']>;
      const html = renderToStaticMarkup(
        <LocalizationProvider>
          <CandidateReview generation={generation} initialId="candidate" onClose={vi.fn()} />
        </LocalizationProvider>,
      );
      expect(html).toContain(
        language === 'en' ? 'Request completed does not mean' : '请求完成不代表',
      );
      expect(onKeep).not.toHaveBeenCalled();
    },
  );
  it('renders the main source and candidate without running or adopting anything', () => {
    const onRun = vi.fn();
    const onKeep = vi.fn();
    const onDiscard = vi.fn();
    const generation = {
      inputs: [{ id: 'source', label: 'Source', role: 'base', previewUrl: 'blob:source' }],
      candidates: [{ id: 'candidate', inputSignature: 'old' }],
      previewUrls: { candidate: 'blob:candidate' },
      signature: 'new',
      onRun,
      onKeep,
      onDiscard,
    } as unknown as NonNullable<WorkspaceInspectorProps['generation']>;
    const html = renderToStaticMarkup(
      <LocalizationProvider>
        <CandidateReview generation={generation} initialId="candidate" onClose={vi.fn()} />
      </LocalizationProvider>,
    );
    expect(html).toContain('blob:source');
    expect(html).toContain('blob:candidate');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Comparison mode');
    expect(html).toContain('Compare candidates');
    expect(onRun).not.toHaveBeenCalled();
    expect(onKeep).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });
  it('labels multiple candidates and locks all adoption actions during another adoption', () => {
    const generation = {
      inputs: [],
      candidates: [
        { id: 'a', inputSignature: 'same', view: 'front' },
        { id: 'b', inputSignature: 'same', view: 'side' },
      ],
      previewUrls: { a: 'blob:a', b: 'blob:b' },
      signature: 'same',
      busyCandidateId: 'b',
      onKeep: vi.fn(),
      onDiscard: vi.fn(),
    } as unknown as NonNullable<WorkspaceInspectorProps['generation']>;
    const html = renderToStaticMarkup(
      <LocalizationProvider>
        <CandidateReview generation={generation} initialId="a" onClose={vi.fn()} />
      </LocalizationProvider>,
    );
    expect(html).toContain('Candidate 1');
    expect(html).toContain('Candidate 2');
    expect(html).toContain('Actions apply to:');
    expect(html.split('<footer>')[1]?.match(/disabled=""/g)).toHaveLength(3);
  });
  it('does not silently target a different candidate when the selected one is removed', () => {
    const generation = {
      inputs: [],
      candidates: [{ id: 'remaining', inputSignature: 'same' }],
      previewUrls: { remaining: 'blob:remaining' },
      signature: 'same',
      onKeep: vi.fn(),
      onDiscard: vi.fn(),
    } as unknown as NonNullable<WorkspaceInspectorProps['generation']>;
    const html = renderToStaticMarkup(
      <LocalizationProvider>
        <CandidateReview generation={generation} initialId="removed" onClose={vi.fn()} />
      </LocalizationProvider>,
    );
    expect(html).not.toContain('Actions apply to:');
    expect(html).not.toContain('alt="Candidate 1"');
    expect(html.match(/disabled=""/g)).toHaveLength(4);
  });
});
