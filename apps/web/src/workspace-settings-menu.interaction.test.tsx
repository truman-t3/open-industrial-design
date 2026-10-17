// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '@open-industrial-design/ui';
import { WorkspaceSettingsMenu } from './workspace-settings-menu';

describe('workspace settings menu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('changes language in place and restores focus when dismissed with Escape', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <LocalizationProvider>
          <WorkspaceSettingsMenu onProviders={vi.fn()} onAbout={vi.fn()} />
        </LocalizationProvider>,
      ),
    );
    const menu = host.querySelector('details')!;
    menu.open = true;
    const language = host.querySelector('select')!;
    act(() => {
      language.value = 'en';
      language.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('summary')?.getAttribute('aria-label')).toBe('Settings');
    expect(menu.open).toBe(true);
    language.focus();
    act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(host.querySelector('summary'));
    act(() => root.unmount());
    host.remove();
  });
  it('closes before provider navigation, permits reopening and dismisses outside', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onProviders = vi.fn();
    act(() =>
      root.render(
        <LocalizationProvider>
          <WorkspaceSettingsMenu onProviders={onProviders} onAbout={vi.fn()} />
        </LocalizationProvider>,
      ),
    );
    const menu = host.querySelector('details')!;
    menu.open = true;
    act(() => host.querySelector('button')!.click());
    expect(onProviders).toHaveBeenCalledOnce();
    expect(menu.open).toBe(false);
    menu.open = true;
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(menu.open).toBe(false);
    act(() => root.unmount());
    host.remove();
  });
});
