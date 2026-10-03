import {
  validateGenerationInput,
  type BaseNode,
  type Edge,
  type GenerationNode,
} from '@open-industrial-design/design-model';
import { ActionError, type AppAction, type ActionClock, type ActionIdFactory } from './index';

export interface CreateGenerationStepInput {
  sourceNodeId: string;
  label: string;
  direction: string;
  localEdit?: boolean;
}
export interface CreateGenerationStepRuntime {
  nodes: readonly BaseNode[];
  edges: readonly Edge[];
  saveStep(node: GenerationNode, edge: Edge): Promise<void>;
}

/** Creates only a manual operation and input edge, with no Provider access. */
export function createGenerationStepAction(
  id: ActionIdFactory = () => crypto.randomUUID(),
  clock: ActionClock = () => Date.now(),
): AppAction<
  CreateGenerationStepInput,
  { node: GenerationNode; edge: Edge },
  CreateGenerationStepRuntime
> {
  return {
    descriptor: {
      id: 'workspace.createGenerationStep',
      label: 'Continue exploration',
      description: 'Create a manual operation using the selected image.',
      kind: 'workspace',
    },
    validate(context, input) {
      return {
        ok: Boolean(
          context.boardId && input.sourceNodeId && input.label.trim() && input.direction.trim(),
        ),
      };
    },
    async run(context, input, runtime) {
      const source = runtime.nodes.find((item) => item.id === input.sourceNodeId);
      if (!source || source.boardId !== context.boardId)
        throw new ActionError('validation', 'The source image is no longer on this board.');
      const timestamp = clock();
      const node: GenerationNode = {
        id: id(),
        type: 'generation',
        boardId: context.boardId,
        label: input.label,
        direction: input.direction,
        notes: '',
        count: 2,
        localEdit: input.localEdit || undefined,
        x: source.x + source.width + 64,
        y: source.y,
        width: 290,
        height: 300,
        rotation: 0,
        zIndex: Math.max(0, ...runtime.nodes.map((item) => item.zIndex)) + 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      let found = false;
      for (let column = 0; column < 16 && !found; column++) {
        for (const row of [0, 1, -1, 2, -2]) {
          node.x = source.x + source.width + 64 + column * (node.width + 40);
          node.y = source.y + row * (node.height + 40);
          if (
            !runtime.nodes.some(
              (item) =>
                item.boardId === context.boardId &&
                node.x < item.x + item.width + 20 &&
                node.x + node.width + 20 > item.x &&
                node.y < item.y + item.height + 20 &&
                node.y + node.height + 20 > item.y,
            )
          ) {
            found = true;
            break;
          }
        }
      }
      if (!found)
        throw new ActionError('validation', 'No nearby space is available for this step.');
      const error = validateGenerationInput(
        [...runtime.nodes, node],
        runtime.edges,
        source.id,
        node.id,
        'base',
      );
      if (error) throw new ActionError('validation', error);
      const edge: Edge = {
        id: id(),
        boardId: context.boardId,
        sourceNodeId: source.id,
        targetNodeId: node.id,
        type: 'generation_input',
        inputRole: 'base',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await runtime.saveStep(node, edge);
      return { node, edge };
    },
  };
}
