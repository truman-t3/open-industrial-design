import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceSaveQueue,
  preventUnsavedWorkspaceUnload,
  saveWorkspaceBeforeLeaving,
} from './workspace-save';

describe('save before leaving the current workspace', () => {
  it('requests native unload confirmation without starting an async write', () => {
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    preventUnsavedWorkspaceUnload(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe('');
  });
  it('serializes writes and continues after a failed earlier write', async () => {
    const enqueue = createWorkspaceSaveQueue();
    let reject!: (error: Error) => void;
    const writes: string[] = [];
    const first = enqueue(() => {
      writes.push('first');
      return new Promise((_, fail) => {
        reject = fail;
      });
    });
    const second = enqueue(async () => {
      writes.push('second');
    });
    await Promise.resolve();
    expect(writes).toEqual(['first']);
    reject(new Error('disk failed'));
    expect((await first).ok).toBe(false);
    expect(await second).toEqual({ ok: true });
    expect(writes).toEqual(['first', 'second']);
  });
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
