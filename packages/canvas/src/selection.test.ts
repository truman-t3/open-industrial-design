import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasRuntimeStore } from './index';

describe('candidate and node selection boundaries', () => {
  beforeEach(() => useCanvasRuntimeStore.getState().clearSelection());

  it('selects a candidate without its parent or previously selected node', () => {
    const runtime = useCanvasRuntimeStore.getState();
    runtime.select('task', false);
    runtime.selectCandidate('result-a');
    expect(useCanvasRuntimeStore.getState().selectedIds).toEqual([]);
    expect(useCanvasRuntimeStore.getState().selectedCandidateId).toBe('result-a');
    runtime.selectCandidate('result-b');
    expect(useCanvasRuntimeStore.getState().selectedCandidateId).toBe('result-b');
  });

  it('explicitly switches to the task and clears candidate selection', () => {
    const runtime = useCanvasRuntimeStore.getState();
    runtime.selectCandidate('result-a');
    runtime.select('task', false);
    expect(useCanvasRuntimeStore.getState().selectedIds).toEqual(['task']);
    expect(useCanvasRuntimeStore.getState().selectedCandidateId).toBeUndefined();
  });

  it('clears both selection kinds without selecting a neighbouring result', () => {
    const runtime = useCanvasRuntimeStore.getState();
    runtime.selectCandidate('result-a');
    runtime.clearSelection();
    expect(useCanvasRuntimeStore.getState().selectedIds).toEqual([]);
    expect(useCanvasRuntimeStore.getState().selectedCandidateId).toBeUndefined();
  });

  it('clears only the removed candidate and preserves a newer selection', () => {
    const runtime = useCanvasRuntimeStore.getState();
    runtime.selectCandidate('result-a');
    runtime.selectCandidate('result-b');
    runtime.clearCandidateSelection('result-a');
    expect(useCanvasRuntimeStore.getState().selectedIds).toEqual([]);
    expect(useCanvasRuntimeStore.getState().selectedCandidateId).toBe('result-b');
    useCanvasRuntimeStore.getState().clearCandidateSelection('result-b');
    expect(useCanvasRuntimeStore.getState().selectedCandidateId).toBeUndefined();
  });
});
