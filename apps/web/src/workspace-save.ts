export type WorkspaceSaveResult = { ok: true } | { ok: false; error: unknown };

/** Browsers own the confirmation text; never attempt async persistence during unload. */
export function preventUnsavedWorkspaceUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = '';
}

/** Serialize snapshots so a delayed older write cannot overwrite a newer one. */
export function createWorkspaceSaveQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return (save: () => Promise<unknown>): Promise<WorkspaceSaveResult> => {
    const next = tail.then(() => saveWorkspaceBeforeLeaving(save));
    tail = next;
    return next;
  };
}

/** Keep persistence failures explicit so navigation cannot mistake them for a completed save. */
export async function saveWorkspaceBeforeLeaving(
  save: () => Promise<unknown>,
): Promise<WorkspaceSaveResult> {
  try {
    await save();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
