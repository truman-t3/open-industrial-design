import type {
  CapabilityRouter,
  ProviderImageInput,
  ProviderConfig,
  ProviderCredentialStore,
} from '@open-industrial-design/ai-core';
import {
  createVariant,
  type Asset,
  type Design,
  type Generation,
  type JsonValue,
} from '@open-industrial-design/design-model';

export {
  createCanvasGenerateAction,
  createKeepCanvasCandidateAction,
  generationInputSignature,
  LOCAL_EDIT_PROTECTION_ERROR,
} from './canvas-generation';
export { createGenerationStepAction } from './create-generation-step';

/** Serializable UI intent. It never contains a Provider credential or UI runtime object. */
export interface ActionContext {
  projectId: string;
  boardId: string;
  selectedNodeIds: string[];
  selectedDesignIds: string[];
}

export type ActionKind = 'workspace' | 'domain' | 'ai';
export type ActionExecutionStatus = 'running' | 'success' | 'failed';
export type ActionErrorCode = 'not_found' | 'validation' | 'serialization' | 'execution';

export interface ActionErrorData {
  code: ActionErrorCode;
  message: string;
}

export class ActionError extends Error {
  constructor(
    public readonly code: ActionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

export interface ActionValidation {
  ok: boolean;
  message?: string;
}

/** Descriptor metadata is safe to render, trace, and persist. */
export interface ActionDescriptor {
  id: string;
  label: string;
  description: string;
  kind: ActionKind;
  /** Palette and menu actions require a serializable input that can be supplied without a form. */
  defaultInput?: JsonValue;
}

/** Runtime is injected by the caller and intentionally cannot be serialized. */
export interface AppAction<Input = unknown, Output = unknown, Runtime = unknown> {
  descriptor: ActionDescriptor;
  validate(context: ActionContext, input: Input): ActionValidation;
  run(context: ActionContext, input: Input, runtime: Runtime): Promise<Output>;
  mapResult?(result: Output, context: ActionContext, input: Input): JsonValue;
}

type StoredAction = AppAction<unknown, unknown, unknown>;

export interface ActionExecutionRecord {
  id: string;
  actionId: string;
  context: ActionContext;
  input: JsonValue;
  status: ActionExecutionStatus;
  startedAt: number;
  finishedAt?: number;
  result?: JsonValue;
  error?: ActionErrorData;
}

export interface ActionExecutionState {
  executions: readonly ActionExecutionRecord[];
}

export interface ActionRunRequest<Input = unknown, Runtime = unknown> {
  actionId: string;
  context: ActionContext;
  input: Input;
  runtime: Runtime;
}

export type ActionIdFactory = () => string;
export type ActionClock = () => number;

const defaultIdFactory: ActionIdFactory = () => crypto.randomUUID();
const defaultClock: ActionClock = () => Date.now();

function toJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new ActionError('serialization', 'Action input or result must be JSON serializable.');
  }
  return JSON.parse(serialized) as JsonValue;
}

function normalizeError(error: unknown): ActionErrorData {
  if (error instanceof ActionError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: 'execution', message: error.message };
  return { code: 'execution', message: 'The action failed with an unknown error.' };
}

export class ActionRegistry {
  private readonly actions = new Map<string, StoredAction>();

  register<Input, Output, Runtime>(action: AppAction<Input, Output, Runtime>) {
    if (this.actions.has(action.descriptor.id)) {
      throw new ActionError('validation', `Action is already registered: ${action.descriptor.id}`);
    }
    this.actions.set(action.descriptor.id, action as StoredAction);
  }

  unregister(actionId: string) {
    this.actions.delete(actionId);
  }

  get(actionId: string) {
    return this.actions.get(actionId);
  }

  list() {
    return [...this.actions.values()].map((action) => action.descriptor);
  }

  listRunnable(context: ActionContext) {
    return this.list().filter((descriptor) => {
      if (descriptor.defaultInput === undefined) return false;
      const action = this.actions.get(descriptor.id);
      return action?.validate(context, descriptor.defaultInput).ok;
    });
  }
}

/**
 * Tracks loading and errors in one place while keeping runtime services out of
 * the serializable execution record.
 */
export class ActionRunner {
  private state: ActionExecutionState = { executions: [] };
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly registry: ActionRegistry,
    private readonly idFactory: ActionIdFactory = defaultIdFactory,
    private readonly clock: ActionClock = defaultClock,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  async run<Input, Output, Runtime>(
    request: ActionRunRequest<Input, Runtime>,
  ): Promise<ActionExecutionRecord> {
    const startedAt = this.clock();
    let input: JsonValue;
    try {
      input = toJsonValue(request.input);
    } catch (error) {
      return this.publish({
        id: this.idFactory(),
        actionId: request.actionId,
        context: request.context,
        input: null,
        status: 'failed',
        startedAt,
        finishedAt: this.clock(),
        error: normalizeError(error),
      });
    }

    const record: ActionExecutionRecord = {
      id: this.idFactory(),
      actionId: request.actionId,
      context: request.context,
      input,
      status: 'running',
      startedAt,
    };
    this.publish(record);

    const action = this.registry.get(request.actionId) as
      AppAction<Input, Output, Runtime> | undefined;
    if (!action)
      return this.fail(record, new ActionError('not_found', `Unknown action: ${request.actionId}`));

    const validation = action.validate(request.context, request.input);
    if (!validation.ok) {
      return this.fail(
        record,
        new ActionError('validation', validation.message ?? 'Action is unavailable.'),
      );
    }

    try {
      const output = await action.run(request.context, request.input, request.runtime);
      const result = toJsonValue(
        action.mapResult ? action.mapResult(output, request.context, request.input) : output,
      );
      return this.publish({ ...record, status: 'success', finishedAt: this.clock(), result });
    } catch (error) {
      return this.fail(record, error);
    }
  }

  private fail(record: ActionExecutionRecord, error: unknown) {
    return this.publish({
      ...record,
      status: 'failed',
      finishedAt: this.clock(),
      error: normalizeError(error),
    });
  }

  private publish(record: ActionExecutionRecord) {
    const executions = [
      ...this.state.executions.filter((item) => item.id !== record.id),
      record,
    ].slice(-50);
    this.state = { executions };
    this.listeners.forEach((listener) => listener());
    return record;
  }
}

export interface WorkspaceCommandRuntime {
  duplicateSelection(): void | Promise<void>;
  deleteSelection(): void | Promise<void>;
}

type EmptyActionInput = Record<string, never>;
type WorkspaceActionResult = { performed: boolean };

function createWorkspaceAction(
  id: 'workspace.duplicateSelection' | 'workspace.deleteSelection',
  label: string,
  description: string,
  operation: keyof WorkspaceCommandRuntime,
): AppAction<EmptyActionInput, WorkspaceActionResult, WorkspaceCommandRuntime> {
  return {
    descriptor: { id, label, description, kind: 'workspace', defaultInput: {} },
    validate(context) {
      return context.selectedNodeIds.length
        ? { ok: true }
        : { ok: false, message: 'Select at least one Canvas node first.' };
    },
    async run(_context, _input, runtime) {
      await runtime[operation]();
      return { performed: true };
    },
  };
}

export function createWorkspaceActions() {
  return [
    createWorkspaceAction(
      'workspace.duplicateSelection',
      'Duplicate selection',
      'Create offset copies of the selected Canvas nodes.',
      'duplicateSelection',
    ),
    createWorkspaceAction(
      'workspace.deleteSelection',
      'Delete selection',
      'Remove the selected Canvas nodes.',
      'deleteSelection',
    ),
  ];
}

export interface CreateVariantInput {
  sourceDesign: Design;
  name: string;
  x: number;
  y: number;
  previewAssetId?: string;
}

export interface CreateVariantRuntime {
  persistVariant(result: ReturnType<typeof createVariant>): Promise<void>;
}

export interface CreateVariantResult {
  designId: string;
  nodeId: string;
  relationId: string;
}

/** Domain action: creates lineage through Design.parentDesignId, never through Canvas edges. */
export function createVariantAction(): AppAction<
  CreateVariantInput,
  CreateVariantResult,
  CreateVariantRuntime
> {
  return {
    descriptor: {
      id: 'design.createVariant',
      label: 'Create Variant',
      description: 'Create a child Design and its board representation from a selected Design.',
      kind: 'domain',
    },
    validate(context, input) {
      if (!context.boardId) return { ok: false, message: 'An active board is required.' };
      if (!input.name.trim()) return { ok: false, message: 'A variant name is required.' };
      if (input.sourceDesign.projectId !== context.projectId) {
        return { ok: false, message: 'The source Design belongs to another project.' };
      }
      return { ok: true };
    },
    async run(context, input, runtime) {
      const created = createVariant(input.sourceDesign, {
        boardId: context.boardId,
        name: input.name,
        x: input.x,
        y: input.y,
        previewAssetId: input.previewAssetId,
      });
      await runtime.persistVariant(created);
      return {
        designId: created.design.id,
        nodeId: created.node.id,
        relationId: created.relation.id,
      };
    },
  };
}

export interface AITextGenerateInput {
  provider: ProviderConfig;
  prompt: string;
  system?: string;
  temperature?: number;
}

export interface AITextGenerateRuntime {
  router: Pick<CapabilityRouter, 'execute'>;
  credentials: Pick<ProviderCredentialStore, 'get'>;
}

export interface AITextGenerateResult {
  text: string;
}

/**
 * AI actions map capability results into serializable data only. They have no
 * Canvas, Zustand, repository, or domain mutation capability.
 */
export function createAITextGenerateAction(): AppAction<
  AITextGenerateInput,
  AITextGenerateResult,
  AITextGenerateRuntime
> {
  return {
    descriptor: {
      id: 'ai.textGenerate',
      label: 'Generate text',
      description: 'Generate text through the configured model-neutral capability router.',
      kind: 'ai',
    },
    validate(_context, input) {
      if (!input.prompt.trim()) return { ok: false, message: 'A prompt is required.' };
      if (!input.provider.enabled && input.provider.enabled !== undefined) {
        return { ok: false, message: 'The selected Provider is disabled.' };
      }
      return { ok: true };
    },
    async run(_context, input, runtime) {
      const credentials = await runtime.credentials.get(input.provider.id);
      const result = await runtime.router.execute(
        'text.generate',
        { prompt: input.prompt, system: input.system, temperature: input.temperature },
        { config: input.provider, credentials },
      );
      return { text: result.text };
    },
  };
}

export interface AIGenerationRuntime {
  saveGeneration(generation: Generation): Promise<void>;
}

export interface AITestConnectionInput {
  provider: ProviderConfig;
}

export interface AITestConnectionRuntime {
  router: Pick<CapabilityRouter, 'testConnection'>;
  credentials: Pick<ProviderCredentialStore, 'get'>;
}

/** Tests a configured BYOK endpoint through the same router used by AI Actions. */
export function createAITestConnectionAction(): AppAction<
  AITestConnectionInput,
  { message: string },
  AITestConnectionRuntime
> {
  return {
    descriptor: {
      id: 'ai.testConnection',
      label: 'Test Provider connection',
      description: 'Verify the configured Provider and API key without changing project data.',
      kind: 'ai',
    },
    validate(_context, input) {
      return input.provider.enabled === false
        ? { ok: false, message: 'The selected Provider is disabled.' }
        : { ok: true };
    },
    async run(_context, input, runtime) {
      const credentials = await runtime.credentials.get(input.provider.id);
      const result = await runtime.router.testConnection(input.provider, credentials);
      if (!result.ok)
        throw new ActionError('execution', result.message ?? 'Provider connection failed.');
      return { message: result.message ?? 'Connection verified.' };
    },
  };
}

export interface AnalyzeDesignInput {
  provider: ProviderConfig;
  design: Design;
  notes?: string;
}

export interface AnalyzeDesignRuntime extends AIGenerationRuntime {
  router: Pick<CapabilityRouter, 'execute'>;
  credentials: Pick<ProviderCredentialStore, 'get'>;
  idFactory?: ActionIdFactory;
  clock?: ActionClock;
}

function createGeneration(
  input: {
    projectId: string;
    actionId: string;
    provider: ProviderConfig;
    prompt?: string;
    sourceDesignIds?: string[];
    parameters?: Record<string, JsonValue>;
  },
  idFactory: ActionIdFactory,
  clock: ActionClock,
): Generation {
  const timestamp = clock();
  return {
    id: idFactory(),
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: input.projectId,
    actionId: input.actionId,
    providerId: input.provider.id,
    modelId: input.provider.model,
    status: 'pending',
    sourceDesignIds: input.sourceDesignIds,
    prompt: input.prompt,
    parameters: input.parameters,
  };
}

function designConstraintSummary(design: Design) {
  const dna = design.dna;
  if (!dna) return [];
  return [
    dna.silhouetteLocked ? 'Preserve the overall silhouette.' : undefined,
    dna.proportionLocked ? 'Preserve the product proportions.' : undefined,
    dna.geometryLocked ? 'Do not alter the primary geometry.' : undefined,
    dna.detailLocked ? 'Preserve characteristic details.' : undefined,
    dna.cmfLocked ? 'Preserve existing CMF.' : undefined,
    dna.brandLocked ? 'Preserve brand-defining cues.' : undefined,
  ].filter((value): value is string => Boolean(value));
}

/** Analyze is read-only for the source Design; its text is recorded as Generation history. */
export function createAIAnalyzeDesignAction(): AppAction<
  AnalyzeDesignInput,
  { generationId: string; analysis: string },
  AnalyzeDesignRuntime
> {
  return {
    descriptor: {
      id: 'ai.analyzeDesign',
      label: 'Analyze Design',
      description: 'Ask the configured AI to analyze a selected Design without modifying it.',
      kind: 'ai',
    },
    validate(context, input) {
      if (input.design.projectId !== context.projectId)
        return { ok: false, message: 'The selected Design belongs to another project.' };
      if (input.provider.enabled === false)
        return { ok: false, message: 'The selected Provider is disabled.' };
      return { ok: true };
    },
    async run(context, input, runtime) {
      const idFactory = runtime.idFactory ?? defaultIdFactory;
      const clock = runtime.clock ?? defaultClock;
      const constraints = designConstraintSummary(input.design);
      const prompt = [
        `Analyze this industrial design: ${input.design.name}.`,
        `Status: ${input.design.status}.`,
        input.notes?.trim() ? `Designer notes: ${input.notes.trim()}` : undefined,
        constraints.length ? `Constraints: ${constraints.join(' ')}` : undefined,
        'Return concise observations about form, usability, CMF, and next exploration directions.',
      ]
        .filter(Boolean)
        .join('\n');
      const pending = createGeneration(
        {
          projectId: context.projectId,
          actionId: 'ai.analyzeDesign',
          provider: input.provider,
          prompt,
          sourceDesignIds: [input.design.id],
          parameters: { kind: 'analysis' },
        },
        idFactory,
        clock,
      );
      await runtime.saveGeneration(pending);
      try {
        const credentials = await runtime.credentials.get(input.provider.id);
        const result = await runtime.router.execute(
          'text.generate',
          { prompt },
          { config: input.provider, credentials },
        );
        await runtime.saveGeneration({
          ...pending,
          status: 'success',
          updatedAt: clock(),
          parameters: { kind: 'analysis', analysis: result.text },
        });
        return { generationId: pending.id, analysis: result.text };
      } catch (error) {
        await runtime.saveGeneration({
          ...pending,
          status: 'failed',
          updatedAt: clock(),
          error: error instanceof Error ? error.message : 'Analysis failed.',
        });
        throw error;
      }
    },
  };
}

interface StoredCandidate {
  id: string;
  generation: Generation;
  sourceDesign: Design;
  prompt: string;
  constraintSummary: string[];
  image: ProviderImageInput;
  createdAt: number;
}

export interface CandidateTrayItem {
  id: string;
  generationId: string;
  sourceDesignId: string;
  sourceDesignName: string;
  prompt: string;
  constraintSummary: string[];
  mimeType: string;
  createdAt: number;
}

export interface CandidateTrayState {
  items: readonly CandidateTrayItem[];
}

/** Runtime-only AI outputs awaiting an explicit Keep action; they are not Canvas nodes. */
export class CandidateTray {
  private readonly candidates = new Map<string, StoredCandidate>();
  private readonly listeners = new Set<() => void>();
  private state: CandidateTrayState = { items: [] };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): CandidateTrayState => this.state;

  stage(input: Omit<StoredCandidate, 'id'>, idFactory: ActionIdFactory = defaultIdFactory) {
    const candidate = { ...input, id: idFactory() };
    this.candidates.set(candidate.id, candidate);
    this.refreshState();
    this.emit();
    return candidate.id;
  }

  get(candidateId: string) {
    return this.candidates.get(candidateId);
  }

  /** Runtime-only image bytes for candidate preview UI; never persisted as domain data. */
  getPreview(candidateId: string): ProviderImageInput | undefined {
    return this.candidates.get(candidateId)?.image;
  }

  discard(candidateId: string) {
    if (this.candidates.delete(candidateId)) {
      this.refreshState();
      this.emit();
    }
  }

  private refreshState() {
    this.state = {
      items: [...this.candidates.values()].map((candidate) => ({
        id: candidate.id,
        generationId: candidate.generation.id,
        sourceDesignId: candidate.sourceDesign.id,
        sourceDesignName: candidate.sourceDesign.name,
        prompt: candidate.prompt,
        constraintSummary: candidate.constraintSummary,
        mimeType: candidate.image.mimeType,
        createdAt: candidate.createdAt,
      })),
    };
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

export interface GenerateVariantInput {
  provider: ProviderConfig;
  sourceDesign: Design;
  prompt: string;
  count?: number;
}

export interface GenerateVariantRuntime extends AIGenerationRuntime {
  router: Pick<CapabilityRouter, 'execute'>;
  credentials: Pick<ProviderCredentialStore, 'get'>;
  candidateTray: CandidateTray;
  idFactory?: ActionIdFactory;
  clock?: ActionClock;
}

export function createAIGenerateVariantAction(): AppAction<
  GenerateVariantInput,
  { generationId: string; candidateIds: string[]; constraintSummary: string[] },
  GenerateVariantRuntime
> {
  return {
    descriptor: {
      id: 'ai.generateVariant',
      label: 'Generate Variant',
      description: 'Generate candidates for a new Variant without changing the source Design.',
      kind: 'ai',
    },
    validate(context, input) {
      if (!input.prompt.trim()) return { ok: false, message: 'A variant prompt is required.' };
      if (input.sourceDesign.projectId !== context.projectId)
        return { ok: false, message: 'The source Design belongs to another project.' };
      if (input.provider.enabled === false)
        return { ok: false, message: 'The selected Provider is disabled.' };
      return { ok: true };
    },
    async run(context, input, runtime) {
      const idFactory = runtime.idFactory ?? defaultIdFactory;
      const clock = runtime.clock ?? defaultClock;
      const constraintSummary = designConstraintSummary(input.sourceDesign);
      const prompt = [
        `Create an industrial design variant of: ${input.sourceDesign.name}.`,
        input.prompt.trim(),
        constraintSummary.length ? `Constraints: ${constraintSummary.join(' ')}` : undefined,
      ]
        .filter(Boolean)
        .join('\n');
      const pending = createGeneration(
        {
          projectId: context.projectId,
          actionId: 'ai.generateVariant',
          provider: input.provider,
          prompt,
          sourceDesignIds: [input.sourceDesign.id],
          parameters: { count: Math.max(1, Math.min(input.count ?? 1, 4)) },
        },
        idFactory,
        clock,
      );
      await runtime.saveGeneration(pending);
      try {
        const credentials = await runtime.credentials.get(input.provider.id);
        const result = await runtime.router.execute(
          'image.generate',
          { prompt, count: input.count },
          { config: input.provider, credentials },
        );
        const candidateIds = result.images.map((image) =>
          runtime.candidateTray.stage(
            {
              generation: pending,
              sourceDesign: input.sourceDesign,
              prompt,
              constraintSummary,
              image,
              createdAt: clock(),
            },
            idFactory,
          ),
        );
        await runtime.saveGeneration({ ...pending, status: 'success', updatedAt: clock() });
        return { generationId: pending.id, candidateIds, constraintSummary };
      } catch (error) {
        await runtime.saveGeneration({
          ...pending,
          status: 'failed',
          updatedAt: clock(),
          error: error instanceof Error ? error.message : 'Variant generation failed.',
        });
        throw error;
      }
    },
  };
}

export interface KeepCandidateInput {
  candidateId: string;
  name?: string;
}

export interface KeepCandidateRuntime {
  candidateTray: CandidateTray;
  acceptCandidate(input: {
    asset: Asset;
    image: ProviderImageInput;
    created: ReturnType<typeof createVariant>;
    generation: Generation;
  }): Promise<void>;
  idFactory?: ActionIdFactory;
  clock?: ActionClock;
}

/** Converts one deliberate Candidate Tray choice into a persisted child Variant. */
export function createKeepCandidateAction(): AppAction<
  KeepCandidateInput,
  CreateVariantResult,
  KeepCandidateRuntime
> {
  return {
    descriptor: {
      id: 'ai.keepCandidate',
      label: 'Keep generated candidate',
      description: 'Create a new Variant from a selected AI candidate.',
      kind: 'ai',
    },
    validate(context, input) {
      if (!input.candidateId) return { ok: false, message: 'A generated candidate is required.' };
      if (!context.boardId) return { ok: false, message: 'An active board is required.' };
      return { ok: true };
    },
    async run(context, input, runtime) {
      const candidate = runtime.candidateTray.get(input.candidateId);
      if (!candidate)
        throw new ActionError('validation', 'This generated candidate is no longer available.');
      if (candidate.sourceDesign.projectId !== context.projectId)
        throw new ActionError('validation', 'Candidate belongs to another project.');
      const idFactory = runtime.idFactory ?? defaultIdFactory;
      const clock = runtime.clock ?? defaultClock;
      const timestamp = clock();
      const assetId = idFactory();
      const asset: Asset = {
        id: assetId,
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: context.projectId,
        type: 'image',
        name: `${candidate.sourceDesign.name} AI candidate`,
        mimeType: candidate.image.mimeType,
        size: candidate.image.data.byteLength,
        storage: { type: 'indexeddb', blobId: assetId },
      };
      const created = createVariant(
        candidate.sourceDesign,
        {
          boardId: context.boardId,
          name: input.name?.trim() || `${candidate.sourceDesign.name} variant`,
          x: 80,
          y: 80,
          previewAssetId: asset.id,
        },
        idFactory,
        clock,
      );
      const generation: Generation = {
        ...candidate.generation,
        status: 'success',
        updatedAt: clock(),
        outputAssetIds: [...(candidate.generation.outputAssetIds ?? []), asset.id],
        outputDesignIds: [...(candidate.generation.outputDesignIds ?? []), created.design.id],
      };
      await runtime.acceptCandidate({ asset, image: candidate.image, created, generation });
      runtime.candidateTray.discard(candidate.id);
      return {
        designId: created.design.id,
        nodeId: created.node.id,
        relationId: created.relation.id,
      };
    },
  };
}
