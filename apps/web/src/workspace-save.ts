export type WorkspaceSaveResult = { ok: true } | { ok: false; error: unknown };

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
