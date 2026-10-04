import {
  validateGenerationInput,
  type BaseNode,
  type Edge,
  type GenerationNode,
  type PatternPlacement,
  isValidPatternPlacement,
  isValidLocalCmf,
  type LocalCmf,
  type PatternTask,
  isValidPatternTask,
  generationViewNames,
} from '@open-industrial-design/design-model';
import { ActionError, type AppAction, type ActionClock, type ActionIdFactory } from './index';

export interface CreateGenerationStepInput {
  sourceNodeId: string;
  label: string;
  direction: string;
  localEdit?: boolean;
  localEditMode?: 'erase';
  localCmf?: LocalCmf;
  removeBackground?: boolean;
  patternPlacement?: PatternPlacement;
  patternTask?: PatternTask;
  requestedViews?: GenerationNode['requestedViews'];
}

function validStepViews(input: CreateGenerationStepInput) {
  const views = input.requestedViews;
  return (
    views === undefined ||
    (Array.isArray(views) &&
      views.length > 0 &&
      views.length <= 4 &&
      new Set(views).size === views.length &&
      views.every((view) => generationViewNames.includes(view)) &&
      !input.localEdit &&
      !input.localEditMode &&
      !input.localCmf &&
      !input.removeBackground &&
      !input.patternPlacement &&
      !input.patternTask)
  );
}
export interface CreateGenerationStepRuntime {
  nodes: readonly BaseNode[];
  edges: readonly Edge[];
  saveStep(node: GenerationNode, edge: Edge): Promise<void>;
}

export interface CreateExplorationBatchInput {
  sourceNodeIds: string[];
  referenceNodeIds?: string[];
  sharedBrief?: string;
  directions: Array<{ label: string; direction: string }>;
  count: number;
}
export type ExplorationBatchStep = { node: GenerationNode; edge: Edge; referenceEdges?: Edge[] };
export interface CreateExplorationBatchRuntime {
  nodes: readonly BaseNode[];
  edges: readonly Edge[];
  saveBatch(steps: ExplorationBatchStep[]): Promise<void>;
}

/** Prepare the source × direction matrix locally; never invokes a model. */
export function createExplorationBatchAction(
  id: ActionIdFactory = () => crypto.randomUUID(),
  clock: ActionClock = () => Date.now(),
): AppAction<
  CreateExplorationBatchInput,
  { steps: ExplorationBatchStep[] },
  CreateExplorationBatchRuntime
> {
  return {
    descriptor: {
      id: 'workspace.createExplorationBatch',
      label: 'Prepare exploration batch',
      description: 'Prepare independent manual tasks for each selected source and direction.',
      kind: 'workspace',
    },
    validate(context, input) {
      return {
        ok: Boolean(
          context.boardId &&
          (input.sharedBrief === undefined ||
            (typeof input.sharedBrief === 'string' && input.sharedBrief.length <= 4000)) &&
          Array.isArray(input.sourceNodeIds) &&
          input.sourceNodeIds.length >= 1 &&
          input.sourceNodeIds.length <= 4 &&
          input.sourceNodeIds.every((value) => typeof value === 'string' && value.trim()) &&
          new Set(input.sourceNodeIds).size === input.sourceNodeIds.length &&
          (input.referenceNodeIds === undefined ||
            (Array.isArray(input.referenceNodeIds) &&
              input.referenceNodeIds.length <= 4 &&
              new Set(input.referenceNodeIds).size === input.referenceNodeIds.length &&
              input.referenceNodeIds.every(
                (value) =>
                  typeof value === 'string' && value.trim() && !input.sourceNodeIds.includes(value),
              ))) &&
          Array.isArray(input.directions) &&
          input.directions.length >= 1 &&
          input.directions.length <= 4 &&
          input.directions.every(
            (item) =>
              item &&
              typeof item.label === 'string' &&
              item.label.trim() &&
              item.label.length <= 80 &&
              typeof item.direction === 'string' &&
              item.direction.trim() &&
              item.direction.length <= 10000 &&
              [input.sharedBrief?.trim(), item.direction.trim()].filter(Boolean).join('\n\n')
                .length <= 10000,
          ) &&
          Number.isInteger(input.count) &&
          input.count >= 1 &&
          input.count <= 4,
        ),
        message:
          'Choose one to four distinct sources, one to four named directions, and one to four results per task.',
      };
    },
    async run(context, input, runtime) {
      if (!this.validate(context, input).ok)
        throw new ActionError('validation', 'Invalid exploration batch.');
      const steps: ExplorationBatchStep[] = [];
      const workingNodes = [...runtime.nodes],
        workingEdges = [...runtime.edges];
      const createStep = createGenerationStepAction(id, clock);
      for (const sourceNodeId of input.sourceNodeIds) {
        for (const direction of input.directions) {
          const step = await createStep.run(
            context,
            {
              sourceNodeId,
              ...direction,
              direction: input.sharedBrief?.trim()
                ? `${input.sharedBrief.trim()}\n\n${direction.direction.trim()}`
                : direction.direction,
            },
            {
              nodes: workingNodes,
              edges: workingEdges,
              saveStep: async () => {
                /* One transaction after the entire plan is valid. */
              },
            },
          );
          step.node.count = input.count;
          steps.push(step);
          workingNodes.push(step.node);
          workingEdges.push(step.edge);
          const referenceEdges: Edge[] = [];
          for (const referenceId of input.referenceNodeIds ?? []) {
            const error = validateGenerationInput(
              workingNodes,
              workingEdges,
              referenceId,
              step.node.id,
              'reference',
            );
            if (error) throw new ActionError('validation', error);
            const edge: Edge = {
              ...step.edge,
              id: id(),
              sourceNodeId: referenceId,
              inputRole: 'reference',
            };
            referenceEdges.push(edge);
            workingEdges.push(edge);
          }
          if (referenceEdges.length) steps[steps.length - 1]!.referenceEdges = referenceEdges;
        }
      }
      await runtime.saveBatch(steps);
      return { steps };
    },
  };
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
      if (!validStepViews(input)) return { ok: false, message: 'Invalid multi-view operation.' };
      if (
        input.patternTask !== undefined &&
        (!isValidPatternTask(input.patternTask) ||
          input.localEdit ||
          input.localEditMode ||
          input.localCmf ||
          input.removeBackground ||
          input.patternPlacement)
      )
        return { ok: false, message: 'Invalid pattern task.' };
      if (
        input.localCmf !== undefined &&
        (!isValidLocalCmf(input.localCmf) || !input.localEdit || input.localEditMode)
      )
        return { ok: false, message: 'Invalid local CMF operation.' };
      if (
        input.patternPlacement &&
        (!isValidPatternPlacement(input.patternPlacement) ||
          input.localEdit ||
          input.removeBackground)
      )
        return { ok: false, message: 'Invalid pattern placement.' };
      if (input.removeBackground && input.localEdit)
        return { ok: false, message: 'Background removal cannot use a local editing mask.' };
      if (
        input.localEditMode !== undefined &&
        (input.localEditMode !== 'erase' || !input.localEdit)
      )
        return { ok: false, message: 'Erasing requires local editing.' };
      return {
        ok: Boolean(
          context.boardId && input.sourceNodeId && input.label.trim() && input.direction.trim(),
        ),
      };
    },
    async run(context, input, runtime) {
      if (!validStepViews(input))
        throw new ActionError('validation', 'Invalid multi-view operation.');
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
        count: input.requestedViews?.length ?? (input.patternPlacement ? 1 : 2),
        requestedViews: input.requestedViews ? [...input.requestedViews] : undefined,
        patternPlacement: input.patternPlacement,
        patternTask: input.patternTask,
        localEdit: input.localEdit || undefined,
        localEditMode: input.localEdit ? input.localEditMode : undefined,
        localCmf: input.localCmf,
        removeBackground: input.removeBackground || undefined,
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
