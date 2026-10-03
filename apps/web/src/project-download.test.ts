// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadOidProject } from './project-download';

describe('project backup download', () => {
  afterEach(() => vi.restoreAllMocks());
  it('retains a retry URL instead of immediately revoking the file', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = document.querySelector('a') ?? undefined;
      expect(document.body.contains(this)).toBe(true);
    });
    const blob = new Blob(['backup']);
    expect(downloadOidProject(blob, '便携灯具 / 探索')).toEqual({
      url: 'blob:backup',
      filename: '便携灯具 - 探索.oidproj',
    });
    expect(create).toHaveBeenCalledWith(blob);
    expect(clicked?.download).toBe('便携灯具 - 探索.oidproj');
    expect(clicked?.isConnected).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
  });
});
