import type {
  CapabilityRouter,
  ProviderConfig,
  ProviderCredentialStore,
  ProviderImageInput,
  AIRequestSignal,
} from '@open-industrial-design/ai-core';
import { AIProviderError } from '@open-industrial-design/ai-core';
import {
  createConcept,
  createReferenceNode,
  createVariant,
  type Asset,
  type BaseNode,
  type CandidateNode,
  type Design,
  type DesignRelation,
  type Edge,
  type Generation,
  type GenerationCandidate,
  type GenerationNode,
  validateGenerationOutput,
  generationViewNames,
  isValidEditRegion,
  type EditRegion,
  type PatternPlacement,
  isValidPatternPlacement,
  isValidLocalCmf,
  isValidPatternTask,
} from '@open-industrial-design/design-model';
import type { AppAction, ActionClock, ActionIdFactory } from './index';

const newId = () => crypto.randomUUID();
const now = () => Date.now();

export const LOCAL_EDIT_PROTECTION_ERROR =
  'Local edit protection failed. The returned image could not be decoded or its dimensions differ from the source. No candidate was saved and no retry was sent.';
export const CUTOUT_PROTECTION_ERROR =
  'Background removal failed validation: expected a same-size image with transparent background and visible product. No candidate was saved and no retry was sent.';

function safeProviderMessage(error: unknown): string {
  if (error instanceof Error && error.message === CUTOUT_PROTECTION_ERROR)
    return CUTOUT_PROTECTION_ERROR;
  if (error instanceof Error && error.message === LOCAL_EDIT_PROTECTION_ERROR)
    return LOCAL_EDIT_PROTECTION_ERROR;
  if (!(error instanceof AIProviderError))
    return 'Image generation failed. Check the Provider and try again.';
  const messages = {
    unauthorized: 'The API key was rejected. Check Provider settings.',
    rate_limit: 'The Provider rate limit was reached. Try again later.',
    timeout: 'The Provider request timed out. Try again.',
    unsupported: 'This Provider or model does not support the requested image editing capability.',
    network: 'The Provider could not be reached. Check its base URL and network.',
    invalid_response:
      'The Provider rejected the image edit request or returned an invalid response.',
    unknown: 'Image generation failed. Check the Provider and try again.',
  };
  return messages[error.code];
}

/** One source rule for constraints, lineage and stale-result detection. */
function generationSourceDesign(
  node: GenerationNode,
  edges: readonly Edge[],
  sources: readonly BaseNode[],
  designs: readonly Design[],
  candidates: readonly GenerationCandidate[],
) {
  if (node.textOnly || node.patternTask?.kind === 'create') return undefined;
  const main = edges.find(
    (edge) =>
      edge.type === 'generation_input' &&
      edge.targetNodeId === node.id &&
      edge.inputRole === 'base',
  );
  const source = sources.find((item) => item.id === main?.sourceNodeId);
  const designId =
    source?.type === 'candidate'
      ? candidates.find((candidate) => candidate.id === (source as CandidateNode).candidateId)
          ?.sourceDesignId
      : source?.designId;
  return designs.find((design) => design.id === designId);
}

export function generationInputSignature(
  node: GenerationNode,
  edges: readonly Edge[],
  sources: readonly BaseNode[],
  designs: readonly Design[] = [],
  candidates: readonly GenerationCandidate[] = [],
) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const design = generationSourceDesign(node, edges, sources, designs, candidates);
  return JSON.stringify({
    sourceDesign: design
      ? {
          id: design.id,
          dna: design.dna
            ? {
                silhouetteLocked: design.dna.silhouetteLocked,
                proportionLocked: design.dna.proportionLocked,
                geometryLocked: design.dna.geometryLocked,
                detailLocked: design.dna.detailLocked,
                cmfLocked: design.dna.cmfLocked,
                brandLocked: design.dna.brandLocked,
                notes: design.dna.notes ?? [],
              }
            : undefined,
        }
      : undefined,
    direction: node.direction,
    notes: node.notes,
    count: node.count,
    textOnly: node.textOnly,
    requestedViews: node.requestedViews,
    localEdit: node.localEdit,
    localEditMode: node.localEditMode,
    localCmf: node.localCmf,
    removeBackground: node.removeBackground,
    patternPlacement: node.patternPlacement,
    patternTask: node.patternTask,
    editRegion: node.editRegion,
    inputs: edges
      .filter((edge) => edge.type === 'generation_input' && edge.targetNodeId === node.id)
      .sort((a, b) =>
        a.inputRole === 'base' ? -1 : b.inputRole === 'base' ? 1 : a.id.localeCompare(b.id),
      )
      .map((edge) => {
        const source = byId.get(edge.sourceNodeId);
        return [
          edge.sourceNodeId,
          edge.inputRole,
          source && 'assetId' in source ? source.assetId : undefined,
          source && 'previewAssetId' in source ? source.previewAssetId : undefined,
          source && 'candidateId' in source ? source.candidateId : undefined,
        ];
      }),
  });
}

export interface CanvasGenerateInput {
  node: GenerationNode;
  edges: Edge[];
  sourceNodes: BaseNode[];
  sourceDesigns: Design[];
  sourceCandidates?: GenerationCandidate[];
  provider: ProviderConfig;
}

export interface CanvasGenerateRuntime {
  composePattern?(
    source: ProviderImageInput,
    pattern: ProviderImageInput,
    placement: PatternPlacement,
  ): Promise<ProviderImageInput>;
  signal?: AIRequestSignal;
  router: Pick<CapabilityRouter, 'execute'>;
  credentials: Pick<ProviderCredentialStore, 'get'>;
  resolveImage(node: BaseNode): Promise<ProviderImageInput | undefined>;
  prepareMask?(
    image: ProviderImageInput,
    region: EditRegion,
  ): Promise<{ image: ProviderImageInput; mask: ProviderImageInput }>;
  protectLocalEdit?(
    source: ProviderImageInput,
    result: ProviderImageInput,
    region: EditRegion,
  ): Promise<ProviderImageInput>;
  protectCutout?(
    source: ProviderImageInput,
    result: ProviderImageInput,
  ): Promise<ProviderImageInput>;
  saveGeneration(generation: Generation): Promise<void>;
  saveGenerationInputs?(generation: Generation, images: ProviderImageInput[]): Promise<void>;
  stageCandidates(
    candidates: Array<{ metadata: GenerationCandidate; image: ProviderImageInput }>,
  ): Promise<void>;
  idFactory?: ActionIdFactory;
  clock?: ActionClock;
}

export interface CanvasBatchInput {
  tasks: CanvasGenerateInput[];
}
export interface CanvasBatchProgress {
  nodeId: string;
  index: number;
  total: number;
  status: 'running' | 'success' | 'failed' | 'cancelled';
}
export function createCanvasBatchGenerateAction(): AppAction<
  CanvasBatchInput,
  { completedNodeIds: string[] },
  CanvasGenerateRuntime & { onProgress?(progress: CanvasBatchProgress): void }
> {
  const single = createCanvasGenerateAction();
  return {
    descriptor: {
      id: 'ai.canvasBatchGenerate',
      label: 'Run canvas task queue',
      description: 'Run manually confirmed tasks in order; stop on failure or cancellation.',
      kind: 'ai',
    },
    validate(context, input) {
      if (
        !Array.isArray(input.tasks) ||
        !input.tasks.length ||
        input.tasks.length > 16 ||
        new Set(input.tasks.map((task) => task.node.id)).size !== input.tasks.length
      )
        return { ok: false, message: 'Choose one to sixteen distinct tasks.' };
      for (const task of input.tasks) {
        const result = single.validate(context, task);
        if (!result.ok) return result;
      }
      return { ok: true };
    },
    async run(context, input, runtime) {
      // Validate every task before the first request, including direct callers outside ActionRunner.
      if (
        !input.tasks.length ||
        input.tasks.length > 16 ||
        new Set(input.tasks.map((task) => task.node.id)).size !== input.tasks.length
      )
        throw new Error('Invalid task queue.');
      for (const task of input.tasks)
        if (!single.validate(context, task).ok)
          throw new Error('Task queue validation failed. No requests were sent.');
      const completedNodeIds: string[] = [];
      for (const [index, task] of input.tasks.entries()) {
        if (runtime.signal?.aborted)
          throw new Error('Task queue cancelled. Completed results were retained.');
        const progress = { nodeId: task.node.id, index: index + 1, total: input.tasks.length };
        runtime.onProgress?.({ ...progress, status: 'running' });
        try {
          await single.run(context, task, runtime);
          completedNodeIds.push(task.node.id);
          runtime.onProgress?.({ ...progress, status: 'success' });
        } catch {
          runtime.onProgress?.({
            ...progress,
            status: runtime.signal?.aborted ? 'cancelled' : 'failed',
          });
          throw new Error(
            runtime.signal?.aborted
              ? 'Task queue cancelled. Completed results were retained; the Provider may charge for work already started.'
              : 'Task queue stopped after a failed task. Completed results were retained; no automatic retry was sent.',
          );
        }
      }
      return { completedNodeIds };
    },
  };
}

export function createCanvasGenerateAction(): AppAction<
  CanvasGenerateInput,
  { generationId: string; candidateIds: string[] },
  CanvasGenerateRuntime
> {
  return {
    descriptor: {
      id: 'ai.canvasGenerate',
      label: 'Generate from canvas',
      description: 'Generate candidate images from connected visual sources.',
      kind: 'ai',
    },
    validate(context, input) {
      if (input.node.boardId !== context.boardId)
        return { ok: false, message: 'Generation node belongs to another board.' };
      if (!input.node.direction.trim())
        return { ok: false, message: 'A design direction is required.' };
      if (!Number.isInteger(input.node.count) || input.node.count < 1 || input.node.count > 4)
        return { ok: false, message: 'Choose one to four results.' };
      const views = input.node.requestedViews;
      if (
        input.node.localCmf !== undefined &&
        (!isValidLocalCmf(input.node.localCmf) ||
          !input.node.localEdit ||
          input.node.localEditMode ||
          !Object.values(input.node.localCmf).some((value) => value.trim()))
      )
        return {
          ok: false,
          message:
            'Local CMF requires a selection and at least one color, material or finish instruction; it cannot erase objects.',
        };
      if (
        input.node.localEditMode !== undefined &&
        (input.node.localEditMode !== 'erase' || !input.node.localEdit || views)
      )
        return {
          ok: false,
          message: 'Erasing requires local selection editing without view generation.',
        };
      if (
        views &&
        (!Array.isArray(views) ||
          !views.length ||
          views.length > 4 ||
          new Set(views).size !== views.length ||
          views.some((view) => !generationViewNames.includes(view)) ||
          views.length !== input.node.count)
      )
        return {
          ok: false,
          message: 'Choose one to four unique views; count must match selected views.',
        };
      if (!input.node.patternPlacement && input.provider.enabled === false)
        return { ok: false, message: 'Selected Provider is disabled.' };
      const edges = input.edges.filter(
        (edge) => edge.type === 'generation_input' && edge.targetNodeId === input.node.id,
      );
      const pattern = input.node.patternTask;
      if (
        pattern !== undefined &&
        (!isValidPatternTask(pattern) ||
          input.node.localEdit ||
          input.node.localEditMode ||
          input.node.localCmf ||
          input.node.editRegion ||
          input.node.removeBackground ||
          input.node.patternPlacement ||
          views ||
          (pattern.kind === 'transfer' &&
            (input.node.textOnly ||
              !pattern.placement.trim() ||
              edges.length !== 2 ||
              !edges.some((edge) => edge.inputRole === 'base') ||
              !edges.some((edge) => edge.inputRole === 'reference'))))
      )
        return {
          ok: false,
          message:
            'Pattern transfer requires one product main image, one pattern reference and a placement instruction; pattern tasks cannot combine other image operations.',
        };
      if (input.node.textOnly !== undefined && typeof input.node.textOnly !== 'boolean')
        return { ok: false, message: 'Invalid text-only generation mode.' };
      if (
        input.node.textOnly &&
        (edges.length ||
          input.node.localEdit ||
          input.node.localEditMode ||
          input.node.editRegion ||
          input.node.removeBackground ||
          input.node.patternPlacement ||
          views)
      )
        return {
          ok: false,
          message: 'Text-only generation requires no image connections or image operations.',
        };
      if ((!input.node.textOnly && !edges.length) || edges.length > 5)
        return { ok: false, message: 'Connect one to five visual sources.' };
      if (
        edges.filter((edge) => edge.inputRole === 'base').length > 1 ||
        edges.filter((edge) => edge.inputRole === 'reference').length > 4
      )
        return { ok: false, message: 'Too many generation inputs.' };
      const sourceIds = new Set<string>();
      if (
        input.node.patternPlacement &&
        (!isValidPatternPlacement(input.node.patternPlacement) ||
          input.node.count !== 1 ||
          input.node.localEdit ||
          input.node.removeBackground ||
          views ||
          edges.length !== 2 ||
          !edges.some((e) => e.inputRole === 'base') ||
          !edges.some((e) => e.inputRole === 'reference'))
      )
        return {
          ok: false,
          message:
            'Pattern placement requires one main image, one pattern reference and one local result.',
        };
      if (
        input.node.removeBackground &&
        (input.node.localEdit ||
          views ||
          input.provider.supportsTransparency !== true ||
          edges.length !== 1 ||
          edges[0]?.inputRole !== 'base')
      )
        return {
          ok: false,
          message:
            'Background removal requires one main image and confirmed transparency support; it cannot combine masks or views.',
        };
      if (input.node.localEdit) {
        if (input.node.requestedViews || input.provider.supportsMask !== true)
          return {
            ok: false,
            message:
              'Local editing requires confirmed mask support and cannot be combined with view generation.',
          };
        const region = input.node.editRegion;
        const base = edges.find((edge) => edge.inputRole === 'base');
        const source = input.sourceNodes.find((item) => item.id === base?.sourceNodeId) as
          | (BaseNode & { assetId?: string; previewAssetId?: string; candidateId?: string })
          | undefined;
        if (
          !region ||
          !isValidEditRegion(region) ||
          source?.id !== region.sourceNodeId ||
          (source?.assetId ?? source?.previewAssetId ?? source?.candidateId) !==
            region.sourceAssetId
        )
          return {
            ok: false,
            message: 'Select an edit region on the current main image before generating.',
          };
      } else if (input.node.editRegion)
        return { ok: false, message: 'Edit regions are only valid for local editing.' };
      for (const edge of edges) {
        const source = input.sourceNodes.find((node) => node.id === edge.sourceNodeId);
        if (
          !source ||
          source.boardId !== context.boardId ||
          !['image', 'reference', 'sketch', 'concept', 'variant', 'candidate'].includes(
            source.type,
          ) ||
          sourceIds.has(source.id) ||
          !['base', 'reference'].includes(edge.inputRole ?? '')
        )
          return { ok: false, message: 'Generation inputs are invalid.' };
        sourceIds.add(source.id);
        if (
          source.type === 'candidate' &&
          !input.sourceCandidates?.some(
            (candidate) =>
              candidate.id === (source as CandidateNode).candidateId &&
              candidate.boardId === context.boardId &&
              candidate.projectId === context.projectId,
          )
        )
          return { ok: false, message: 'The candidate input is no longer available.' };
      }
      return { ok: true };
    },
    async run(context, input, runtime) {
      if (
        input.sourceNodes.some((source) => source.type === 'candidate') &&
        !runtime.saveGenerationInputs
      )
        throw new Error('Candidate exploration requires persistent input snapshots.');
      const id = runtime.idFactory ?? newId;
      const clock = runtime.clock ?? now;
      const edges = input.edges
        .filter((edge) => edge.type === 'generation_input' && edge.targetNodeId === input.node.id)
        .sort((a, b) =>
          a.inputRole === 'base' ? -1 : b.inputRole === 'base' ? 1 : a.id.localeCompare(b.id),
        );
      const sources = edges.map((edge) =>
        input.sourceNodes.find((node) => node.id === edge.sourceNodeId)!,
      );
      const images = await Promise.all(sources.map((source) => runtime.resolveImage(source)));
      if (images.some((image) => !image))
        throw new Error('A connected image is missing. Restore its Asset before generating.');
      let mask: ProviderImageInput | undefined;
      if (input.node.patternPlacement && !runtime.composePattern)
        throw new Error('Local pattern compositing is unavailable.');
      if (input.node.removeBackground && !runtime.protectCutout)
        throw new Error('Cutout validation is unavailable.');
      if (input.node.localEdit) {
        if (!runtime.prepareMask || !runtime.protectLocalEdit || !input.node.editRegion)
          throw new Error('Mask preparation is unavailable.');
        const prepared = await runtime.prepareMask(images[0]!, input.node.editRegion);
        images[0] = prepared.image;
        mask = prepared.mask;
      }
      const sourceDesign = generationSourceDesign(
        input.node,
        edges,
        sources,
        input.sourceDesigns,
        input.sourceCandidates ?? [],
      );
      const prompt = [
        input.node.textOnly ? '' : 'Input images are supplied in the following order:',
        ...edges.map((edge, index) =>
          input.node.patternTask?.kind === 'create'
            ? `Image ${index + 1}: artwork style reference. Extract the requested motifs and visual language, not the product shape. Produce flat artwork, not a product mockup.`
            : input.node.patternTask?.kind === 'transfer'
              ? `Image ${index + 1}: ${edge.inputRole === 'base' ? 'target product; preserve its identity, geometry and functional structure' : 'pattern artwork to transfer onto the target product, not a replacement product'}.`
              : edge.inputRole === 'base'
                ? `Image ${index + 1}: main product or sketch. Preserve its identity and functional structure unless the design direction explicitly requests a change.`
                : `Image ${index + 1}: supplementary reference. Use only for the requested design attributes, not as a replacement for the main product.`,
        ),
        input.node.direction.trim(),
        input.node.notes.trim(),
        ...(input.node.patternTask?.kind === 'create'
          ? [
              'Generate standalone flat pattern artwork, not a product rendering.',
              input.node.patternTask.repeat === 'tile'
                ? 'Aim for a repeatable tile with matching opposite edges.'
                : 'Create one standalone motif composition.',
            ]
          : input.node.patternTask?.kind === 'transfer'
            ? [
                `Apply the reference pattern only to: ${input.node.patternTask.placement.trim()}`,
                `Relative motif scale: ${input.node.patternTask.scale}. Preserve the rest of the product and scene.`,
              ]
            : []),
        ...(input.node.localCmf
          ? [
              'Change only the selected region CMF. Preserve silhouette, proportions, geometry, part boundaries and functional details. Do not replace or remove the part.',
              `Target color: ${input.node.localCmf.color.trim() || 'Preserve original color'}`,
              `Target material: ${input.node.localCmf.material.trim() || 'Preserve original material'}`,
              `Target surface finish: ${input.node.localCmf.finish.trim() || 'Preserve original finish'}`,
            ]
          : []),
        mask
          ? 'Edit only the transparent mask region on image 1. Preserve the product and background outside that region.'
          : '',
        sourceDesign?.dna ? `Design DNA: ${JSON.stringify(sourceDesign.dna)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const timestamp = clock();
      const generation: Generation = {
        id: id(),
        projectId: context.projectId,
        actionId: 'ai.canvasGenerate',
        providerId: input.node.patternPlacement ? 'local-raster' : input.provider.id,
        modelId: input.node.patternPlacement ? undefined : input.provider.model,
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'pending',
        prompt,
        sourceDesignIds: sourceDesign ? [sourceDesign.id] : [],
        sourceAssetIds: sources.flatMap((source) => {
          const value = source as BaseNode & { assetId?: string; previewAssetId?: string };
          return value.assetId || value.previewAssetId
            ? [value.assetId ?? value.previewAssetId!]
            : [];
        }),
        parameters: {
          count: input.node.count,
          ...(input.node.textOnly ? { textOnly: true } : {}),
          generationNodeId: input.node.id,
          ...(input.node.requestedViews ? { requestedViews: input.node.requestedViews } : {}),
          ...(input.node.localEditMode ? { localEditMode: input.node.localEditMode } : {}),
          ...(input.node.localCmf ? { localCmf: { ...input.node.localCmf } } : {}),
          ...(input.node.patternTask ? { patternTask: { ...input.node.patternTask } } : {}),
          ...(input.node.removeBackground ? { removeBackground: true } : {}),
          ...(input.node.patternPlacement
            ? { patternPlacement: { ...input.node.patternPlacement } }
            : {}),
          ...(input.node.editRegion ? { editRegion: { ...input.node.editRegion } } : {}),
          ...(mask ? { localEditProtection: 'selection-only-v1' } : {}),
        },
      };
      if (runtime.saveGenerationInputs) {
        generation.inputSnapshots = edges.map((edge, index) => ({
          id: `${generation.id}-input-${index}`,
          sourceNodeId: edge.sourceNodeId,
          role: edge.inputRole!,
          mimeType: images[index]!.mimeType,
          ...(sources[index] && 'candidateId' in sources[index]!
            ? { candidateId: (sources[index] as CandidateNode).candidateId }
            : {}),
        }));
        if (mask)
          generation.inputSnapshots.push({
            id: `${generation.id}-mask`,
            sourceNodeId: sources[0]!.id,
            role: 'mask',
            mimeType: mask.mimeType,
          });
        await runtime.saveGenerationInputs(generation, [
          ...(images as ProviderImageInput[]),
          ...(mask ? [mask] : []),
        ]);
      } else await runtime.saveGeneration(generation);
      try {
        const checkCancellation = () => {
          if (runtime.signal?.aborted) throw new Error('Generation cancelled.');
        };
        checkCancellation();
        const credentials = input.node.patternPlacement
          ? undefined
          : await runtime.credentials.get(input.provider.id);
        const generated: Array<{
          image: ProviderImageInput;
          view?: NonNullable<GenerationNode['requestedViews']>[number];
        }> = [];
        // Sequential, bounded requests. Stage only after every view succeeds; no automatic retry.
        if (input.node.textOnly) {
          const result = await runtime.router.execute(
            'image.generate',
            { prompt, count: input.node.count },
            { config: input.provider, credentials, signal: runtime.signal },
          );
          generated.push(...result.images.slice(0, input.node.count).map((image) => ({ image })));
        } else if (input.node.patternPlacement) {
          generated.push({
            image: await runtime.composePattern!(
              images[0]!,
              images[1]!,
              input.node.patternPlacement,
            ),
          });
        } else if (input.node.removeBackground) {
          const result = await runtime.router.execute(
            'image.cutout',
            { image: images[0]!, count: input.node.count, prompt },
            { config: input.provider, credentials, signal: runtime.signal },
          );
          generated.push(...result.images.slice(0, input.node.count).map((image) => ({ image })));
        } else if (input.node.requestedViews) {
          for (const view of input.node.requestedViews) {
            checkCancellation();
            const result = await runtime.router.execute(
              'image.edit',
              {
                prompt: `${prompt}\nRequested camera view: ${view}. Show exactly one view of the same product, not a collage. Preserve geometry, details and CMF.`,
                images: images as ProviderImageInput[],
                count: 1,
              },
              { config: input.provider, credentials, signal: runtime.signal },
            );
            if (!result.images[0])
              throw new Error('The Provider returned no image for a requested view.');
            generated.push({ image: result.images[0], view });
          }
        } else {
          checkCancellation();
          const request = {
            prompt,
            images: images as ProviderImageInput[],
            count: input.node.count,
            ...(mask ? { mask } : {}),
          };
          const providerContext = { config: input.provider, credentials, signal: runtime.signal };
          const result =
            input.node.localEditMode === 'erase'
              ? await runtime.router.execute(
                  'image.erase',
                  { ...request, mask: mask! },
                  providerContext,
                )
              : await runtime.router.execute('image.edit', request, providerContext);
          generated.push(...result.images.slice(0, input.node.count).map((image) => ({ image })));
        }
        checkCancellation();
        const signature = generationInputSignature(
          input.node,
          edges,
          sources,
          input.sourceDesigns,
          input.sourceCandidates,
        );
        if (!generated.length)
          throw new Error('The Provider returned no images. No candidate was saved.');
        if (mask) {
          try {
            for (const result of generated) {
              checkCancellation();
              result.image = await runtime.protectLocalEdit!(
                images[0]!,
                result.image,
                input.node.editRegion!,
              );
            }
          } catch {
            throw new Error(LOCAL_EDIT_PROTECTION_ERROR);
          }
          checkCancellation();
        }
        if (input.node.removeBackground) {
          try {
            for (const result of generated) {
              checkCancellation();
              result.image = await runtime.protectCutout!(images[0]!, result.image);
            }
          } catch {
            throw new Error(CUTOUT_PROTECTION_ERROR);
          }
          checkCancellation();
        }
        const candidateTime = clock();
        const candidates = generated.map(({ image, view }, index) => ({
          metadata: {
            id: id(),
            projectId: context.projectId,
            boardId: context.boardId,
            generationNodeId: input.node.id,
            generationId: generation.id,
            sourceDesignId: sourceDesign?.id,
            mimeType: image.mimeType,
            inputSignature: signature,
            ...(view ? { view } : {}),
            createdAt: candidateTime + index,
            updatedAt: candidateTime + index,
          },
          image,
        }));
        await runtime.stageCandidates(candidates);
        await runtime.saveGeneration({ ...generation, status: 'success', updatedAt: clock() });
        return {
          generationId: generation.id,
          candidateIds: candidates.map((item) => item.metadata.id),
        };
      } catch (error) {
        const safeMessage = runtime.signal?.aborted
          ? 'Generation cancelled. The Provider may still charge for work already started.'
          : safeProviderMessage(error);
        await runtime.saveGeneration({
          ...generation,
          status: 'failed',
          updatedAt: clock(),
          error: safeMessage,
        });
        throw new Error(safeMessage, { cause: error });
      }
    },
  };
}

export interface KeepCanvasCandidateInput {
  candidateId: string;
  destination: 'design' | 'reference';
  name?: string;
}
export interface KeepCanvasCandidateRuntime {
  getResultNode?(candidateId: string): Promise<CandidateNode | undefined>;
  getResultEdge?(nodeId: string): Promise<Edge | undefined>;
  getCandidate(id: string): Promise<GenerationCandidate | undefined>;
  getCandidateSize(id: string): Promise<number>;
  getGeneration(id: string): Promise<Generation | undefined>;
  getGenerationNode(id: string): Promise<GenerationNode | undefined>;
  getDesign(id: string): Promise<Design | undefined>;
  accept(input: {
    candidate: GenerationCandidate;
    asset: Asset;
    node: BaseNode;
    outputEdge: Edge;
    design?: Design;
    relation?: DesignRelation;
    generation: Generation;
  }): Promise<void>;
  idFactory?: ActionIdFactory;
  clock?: ActionClock;
}

export function createKeepCanvasCandidateAction(): AppAction<
  KeepCanvasCandidateInput,
  { nodeId: string; designId?: string; outputEdge: Edge },
  KeepCanvasCandidateRuntime
> {
  return {
    descriptor: {
      id: 'ai.keepCanvasCandidate',
      label: 'Keep canvas candidate',
      description: 'Promote a reviewed candidate without modifying its source.',
      kind: 'ai',
    },
    validate(context, input) {
      return context.boardId && input.candidateId
        ? { ok: true }
        : { ok: false, message: 'Select a candidate on a Board.' };
    },
    async run(context, input, runtime) {
      const id = runtime.idFactory ?? newId;
      const clock = runtime.clock ?? now;
      const candidate = await runtime.getCandidate(input.candidateId);
      if (
        !candidate ||
        candidate.projectId !== context.projectId ||
        candidate.boardId !== context.boardId
      )
        throw new Error('Candidate is no longer available on this Board.');
      const [generation, generationNode, sourceDesign] = await Promise.all([
        runtime.getGeneration(candidate.generationId),
        runtime.getGenerationNode(candidate.generationNodeId),
        candidate.sourceDesignId
          ? runtime.getDesign(candidate.sourceDesignId)
          : Promise.resolve(undefined),
      ]);
      if (!generation || !generationNode || (candidate.sourceDesignId && !sourceDesign))
        throw new Error('Candidate source or generation record is missing.');
      const resultNode = await runtime.getResultNode?.(candidate.id);
      const resultEdge = resultNode && (await runtime.getResultEdge?.(resultNode.id));
      if (runtime.getResultNode && (!resultNode || !resultEdge))
        throw new Error('Candidate result node or output edge is missing.');
      const assetId = id();
      const timestamp = clock();
      const asset: Asset = {
        id: assetId,
        projectId: context.projectId,
        type: 'image',
        name: input.name?.trim() || 'Generated design',
        mimeType: candidate.mimeType,
        size: await runtime.getCandidateSize(candidate.id),
        storage: { type: 'indexeddb', blobId: assetId },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      let design: Design | undefined;
      let relation: DesignRelation | undefined;
      let node: BaseNode & { label?: string };
      const x = resultNode?.x ?? generationNode.x + generationNode.width + 80;
      const y = resultNode?.y ?? generationNode.y;
      if (input.destination === 'reference') {
        node = {
          ...createReferenceNode(
            {
              boardId: context.boardId,
              assetId,
              x,
              y,
              width: 260,
              height: 260,
              rotation: 0,
              zIndex: 1,
            },
            id,
            clock,
          ),
          label: asset.name,
        };
      } else if (sourceDesign) {
        const created = createVariant(
          sourceDesign,
          {
            boardId: context.boardId,
            name: input.name?.trim() || `${sourceDesign.name} Variant`,
            x,
            y,
            previewAssetId: assetId,
          },
          id,
          clock,
        );
        design = created.design;
        relation = created.relation;
        node = { ...created.node, label: created.design.name };
      } else {
        const created = createConcept(
          {
            projectId: context.projectId,
            boardId: context.boardId,
            name: input.name?.trim() || 'Generated Concept',
            x,
            y,
            previewAssetId: assetId,
          },
          id,
          clock,
        );
        design = created.design;
        node = { ...created.node, label: created.design.name };
      }
      if (resultNode)
        node = {
          ...node,
          id: resultNode.id,
          x: resultNode.x,
          y: resultNode.y,
          width: resultNode.width,
          height: resultNode.height,
          rotation: resultNode.rotation,
          zIndex: resultNode.zIndex,
          createdAt: resultNode.createdAt,
        };
      const outputEdge: Edge = {
        id: resultEdge?.id ?? id(),
        boardId: context.boardId,
        sourceNodeId: generationNode.id,
        targetNodeId: node.id,
        type: 'generation_output',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const edgeError = validateGenerationOutput(
        [generationNode, node],
        [],
        generationNode.id,
        node.id,
      );
      if (edgeError) throw new Error(edgeError);
      await runtime.accept({
        candidate,
        asset,
        node,
        outputEdge,
        design,
        relation,
        generation: {
          ...generation,
          updatedAt: clock(),
          outputAssetIds: [...(generation.outputAssetIds ?? []), assetId],
          outputDesignIds: design
            ? [...(generation.outputDesignIds ?? []), design.id]
            : generation.outputDesignIds,
        },
      });
      return { nodeId: node.id, designId: design?.id, outputEdge };
    },
  };
}
