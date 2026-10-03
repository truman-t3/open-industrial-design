export type WorkspaceStatusMap = Readonly<Record<string, string>>;

/** Update one canvas object's transient status without overwriting another object's result. */
export function updateWorkspaceStatus(
  statuses: WorkspaceStatusMap,
  contextId: string,
  status: string | undefined,
): Record<string, string> {
  if (status === undefined) {
    if (!(contextId in statuses)) return statuses;
    const next = { ...statuses };
    delete next[contextId];
    return next;
  }
  if (statuses[contextId] === status) return statuses;
  return { ...statuses, [contextId]: status };
}
