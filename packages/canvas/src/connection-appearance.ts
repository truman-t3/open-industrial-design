/** Styling only: selection never changes workflow or design lineage. */
export function connectionAppearance(kind: 'workflow' | 'lineage', active: boolean) {
  const color = active ? '#2563ff' : kind === 'workflow' ? '#8aaaf0' : '#a8b3c2';
  return {
    stroke: color,
    fill: color,
    strokeWidth: active ? 1.8 : 1.2,
    opacity: active ? 1 : kind === 'lineage' ? 0.55 : 0.75,
    ...(kind === 'lineage' ? { dash: [5, 5] } : {}),
  };
}

export function connectionIsActive(
  sourceId: string,
  targetId: string,
  selectedIds: readonly string[],
  candidateId?: string,
  selectedCandidateId?: string,
) {
  return (
    selectedIds.includes(sourceId) ||
    selectedIds.includes(targetId) ||
    Boolean(candidateId && candidateId === selectedCandidateId)
  );
}
