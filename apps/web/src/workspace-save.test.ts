import { describe, expect, it, vi } from 'vitest';
import { saveWorkspaceBeforeLeaving } from './workspace-save';

describe('save before leaving the current workspace', () => {
  it('does not report success while persistence is still pending', async () => {
    let finish!: () => void;
    const write = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const next = vi.fn();
    const pending = saveWorkspaceBeforeLeaving(() => write).then((result) => {
      if (result.ok) next();
    });
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps the current workspace on failure and allows an explicit retry', async () => {
    const error = new Error('Quota exceeded');
    const save = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const next = vi.fn();
    const failed = await saveWorkspaceBeforeLeaving(save);
    if (failed.ok) next();
    expect(failed).toEqual({ ok: false, error });
    expect(next).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
    const retried = await saveWorkspaceBeforeLeaving(save);
    if (retried.ok) next();
    expect(next).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
