import type { Asset, SketchDocument, SketchNode } from '@open-industrial-design/design-model';
import { ActionError, type AppAction } from './index';

export interface SketchSnapshotInput {
  document: SketchDocument;
  node: SketchNode;
  source: Asset;
  preview: Asset;
}

export function createSaveSketchAction(): AppAction<
  SketchSnapshotInput,
  void,
  {
    sourceBlob: Blob;
    previewBlob: Blob;
    save(input: SketchSnapshotInput & { sourceBlob: Blob; previewBlob: Blob }): Promise<void>;
  }
> {
  return {
    mapResult: () => null,
    descriptor: {
      id: 'workspace.saveSketch',
      label: 'Save sketch',
      description: 'Atomically save editable source and preview.',
      kind: 'workspace',
    },
    validate(context, input) {
      return {
        ok: Boolean(
          context.projectId &&
          context.boardId &&
          input?.document.projectId === context.projectId &&
          input.node.boardId === context.boardId &&
          input.source.projectId === context.projectId &&
          input.preview.projectId === context.projectId,
        ),
      };
    },
    async run(context, input, runtime) {
      if (!this.validate(context, input).ok)
        throw new ActionError('validation', 'Invalid sketch context.');
      await runtime.save({
        ...input,
        sourceBlob: runtime.sourceBlob,
        previewBlob: runtime.previewBlob,
      });
    },
  };
}
