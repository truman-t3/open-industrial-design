// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, ProviderSettings } from '@open-industrial-design/ui';
import type { ProviderConfig } from '@open-industrial-design/ai-core';

const config: ProviderConfig = {
  id: 'first',
  type: 'openai-compatible',
  name: 'First',
  rememberKey: false,
};

describe('provider connection test availability', () => {
  let root: Root;
  let container: HTMLDivElement;
  const save = vi.fn(async () => {});
  const test = vi.fn(async () => {});
  const hasCredentials = vi.fn<(id: string) => Promise<boolean>>();
  async function render(configs = [config], busy = false) {
    await act(async () =>
      root.render(
        <LocalizationProvider>
          <ProviderSettings
            configs={configs}
            open
            busy={busy}
            hasCredentials={hasCredentials}
            onClose={() => {}}
            onDelete={async () => {}}
            onSave={save}
            onTest={test}
          />
        </LocalizationProvider>,
      ),
    );
  }
  function button(text: string) {
    return Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === text,
    )!;
  }
  function enterKey(value: string) {
    const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('open-industrial-design.locale', 'en');
    vi.clearAllMocks();
    hasCredentials.mockResolvedValue(false);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });
  it('uses stored credentials without exposing or requiring the key again', async () => {
    hasCredentials.mockResolvedValue(true);
    await render();
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('');
    expect(button('Test Connection').disabled).toBe(false);
    await act(async () => button('Test Connection').click());
    expect(test).toHaveBeenCalledWith(expect.objectContaining({ id: 'first', apiKey: '' }));
  });
  it('explains missing credentials and rejects whitespace-only draft keys', async () => {
    await render();
    expect(button('Test Connection').disabled).toBe(true);
    expect(container.textContent).toContain('No local key is currently available');
    enterKey('   ');
    expect(button('Test Connection').disabled).toBe(true);
    enterKey('test-only-key');
    expect(button('Test Connection').disabled).toBe(false);
    expect(test).not.toHaveBeenCalled();
  });
  it('rechecks availability after save even when configuration identity stays unchanged', async () => {
    await render();
    enterKey('test-only-key');
    save.mockImplementationOnce(async () => {
      hasCredentials.mockResolvedValue(true);
    });
    await act(async () =>
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('');
    expect(button('Test Connection').disabled).toBe(false);
  });
  it('does not apply a late credential lookup to another selected connection', async () => {
    let resolveFirst!: (value: boolean) => void;
    hasCredentials.mockImplementation((id) =>
      id === 'first'
        ? new Promise<boolean>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(false),
    );
    await render([config, { ...config, id: 'second', name: 'Second' }]);
    expect(button('Test Connection').disabled).toBe(true);
    await act(async () => button('Second').click());
    await act(async () => resolveFirst(true));
    expect(button('Test Connection').disabled).toBe(true);
  });
  it('keeps testing disabled while busy even when credentials exist', async () => {
    hasCredentials.mockResolvedValue(true);
    await render([config], true);
    expect(button('Test Connection').disabled).toBe(true);
  });
  it('handles a credential lookup failure without displaying internal error details', async () => {
    hasCredentials.mockRejectedValue(new Error('private storage detail'));
    await render();
    expect(button('Test Connection').disabled).toBe(true);
    expect(container.textContent).not.toContain('private storage detail');
  });
  it('allows a new connection to test only after a key is entered', async () => {
    await render([]);
    expect(button('Test Connection').disabled).toBe(true);
    enterKey('test-only-key');
    expect(button('Test Connection').disabled).toBe(false);
  });
});
