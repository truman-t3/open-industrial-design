import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRelease, isNewerRelease } from './release-check';

afterEach(() => vi.unstubAllGlobals());
describe('release check', () => {
  it('compares numeric versions and release stages', () => {
    expect(isNewerRelease('v0.1.0-beta.10', '0.1.0-beta.2')).toBe(true);
    expect(isNewerRelease('v0.1.0', '0.1.0-rc.1')).toBe(true);
    expect(isNewerRelease('v0.1.0-beta.1', '0.1.0-beta.1')).toBe(false);
    expect(isNewerRelease('v0.1.0-alpha.2', '0.1.0-beta.1')).toBe(false);
    expect(isNewerRelease('v0.2.0-beta.1', '0.1.0')).toBe(true);
    expect(() => isNewerRelease('latest', '0.1.0')).toThrow();
  });
  it('only requests public release metadata without credentials', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v0.1.0-beta.2', draft: false })));
    vi.stubGlobal('fetch', request);
    expect(await checkRelease('0.1.0-beta.1', new AbortController().signal)).toEqual({
      version: 'v0.1.0-beta.2',
      newer: true,
    });
    expect(request.mock.calls[0]?.[1].credentials).toBe('omit');
  });
  it('reports network and malformed metadata failures instead of claiming up to date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    await expect(checkRelease('0.1.0', new AbortController().signal)).rejects.toThrow();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v0.2.0', draft: true }))),
    );
    await expect(checkRelease('0.1.0', new AbortController().signal)).rejects.toThrow();
  });
});
