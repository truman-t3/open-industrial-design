import { expect, it, vi } from 'vitest';
import { ActionRegistry, ActionRunner } from './index';
import { createSaveSketchAction, type SketchSnapshotInput } from './save-sketch';

it('reports successful void persistence and refuses another project before writing', async () => {
  const registry = new ActionRegistry();
  registry.register(createSaveSketchAction());
  const runner = new ActionRunner(registry);
  const input = {
    document: { projectId: 'p' },
    node: { boardId: 'b' },
    source: { projectId: 'p' },
    preview: { projectId: 'p' },
  } as SketchSnapshotInput;
  const save = vi.fn().mockResolvedValue(undefined);
  const request = {
    actionId: 'workspace.saveSketch',
    context: { projectId: 'p', boardId: 'b', selectedNodeIds: [], selectedDesignIds: [] },
    input,
    runtime: { save, sourceBlob: new Blob(['private scene']), previewBlob: new Blob(['preview']) },
  };
  const result = await runner.run(request);
  expect(result.status).toBe('success');
  expect(result.result).toBeNull();
  expect(JSON.stringify(result)).not.toContain('private scene');
  expect(
    (await runner.run({ ...request, context: { ...request.context, projectId: 'other' } })).status,
  ).toBe('failed');
  expect(save).toHaveBeenCalledTimes(1);
});
