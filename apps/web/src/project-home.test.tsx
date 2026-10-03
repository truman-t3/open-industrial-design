import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalizationProvider } from '@open-industrial-design/ui';
import { ProjectHome } from './project-home';

describe('project home demo opening', () => {
  beforeEach(() => vi.stubGlobal('navigator', { language: 'en' }));
  afterEach(() => vi.unstubAllGlobals());
  it('disables the demo entry and describes progress while a copy is opening', () => {
    const html = renderToStaticMarkup(
      <LocalizationProvider>
        <ProjectHome
          demoOpening
          loading={false}
          onCreateProject={vi.fn()}
          onDeleteProject={vi.fn()}
          onOpenDemo={vi.fn()}
          onOpenProject={vi.fn()}
          onRenameProject={vi.fn()}
          projects={[]}
        />
      </LocalizationProvider>,
    );

    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html.match(/Opening demo…/g)).toHaveLength(2);
  });
});
