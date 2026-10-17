// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '@open-industrial-design/ui';
import { AboutDialog } from './about-dialog';
import { RELEASE_PAGE } from './release-check';

function releaseLink() {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <LocalizationProvider>
      <AboutDialog onClose={vi.fn()} />
    </LocalizationProvider>,
  );
  return container.querySelector<HTMLAnchorElement>(`a[href="${RELEASE_PAGE}"]`)!;
}

describe('official release navigation', () => {
  beforeEach(() => vi.stubGlobal('navigator', { language: 'en' }));
  afterEach(() => vi.unstubAllGlobals());

  it('opens downloads separately in the browser so the workspace stays open', () => {
    const link = releaseLink();
    expect(link.target).toBe('_blank');
    expect(link.relList.contains('noreferrer')).toBe(true);
    expect(link.relList.contains('noopener')).toBe(true);
  });

  it('keeps desktop navigation in the native handler instead of a blocked new window', () => {
    // Tauri injects this marker even with withGlobalTauri disabled.
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    expect(releaseLink().target).toBe('_self');
  });
});
