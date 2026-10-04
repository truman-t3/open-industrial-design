import {
  translate,
  translateDemoLabel,
  type AppLocale,
  type MessageKey,
} from '@open-industrial-design/core';
import type { BaseNode, Edge, GenerationNode } from '@open-industrial-design/design-model';

/** Read-only summaries derived from the same board edges used by generation. */
export function queueInputSummaries(
  nodes: readonly BaseNode[],
  edges: readonly Edge[],
  candidates: Array<{ id: string; generationNodeId: string }>,
  locale: AppLocale,
): Record<string, string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return Object.fromEntries(
    nodes
      .filter((node) => node.type === 'generation')
      .map((node) => {
        const inputs = edges
          .filter((edge) => edge.type === 'generation_input' && edge.targetNodeId === node.id)
          .sort(
            (a, b) =>
              Number(b.inputRole === 'base') - Number(a.inputRole === 'base') ||
              a.id.localeCompare(b.id),
          );
        const summary = inputs
          .map((edge) => {
            const source = byId.get(edge.sourceNodeId);
            const label = source
              ? generationInputLabel(source, candidates, locale)
              : translate(locale, 'generation.queue.missingInput');
            return `${translate(locale, edge.inputRole === 'base' ? 'generation.base' : 'generation.reference')}：${label}`;
          })
          .join(' · ');
        return [
          node.id,
          summary ||
            translate(
              locale,
              (node as GenerationNode).textOnly
                ? 'generation.queue.textInput'
                : 'generation.queue.noInputs',
            ),
        ];
      }),
  );
}

/** Match the input summary to the independent candidate shown on the Canvas. */
export function generationInputLabel(
  source: { type: string; label?: string; candidateId?: string } | undefined,
  candidates: Array<{ id: string; generationNodeId: string }>,
  locale: AppLocale,
): string {
  if (source?.type === 'candidate') {
    const candidate = candidates.find((item) => item.id === source.candidateId);
    if (!candidate) return translate(locale, 'generation.resultSelection');
    const siblings = candidates.filter(
      (item) => item.generationNodeId === candidate.generationNodeId,
    );
    return translate(locale, 'generation.candidateNumber', {
      number: siblings.findIndex((item) => item.id === candidate.id) + 1,
    });
  }
  return source?.label ? translateDemoLabel(locale, source.label) : translate(locale, 'node.image');
}

// Editable briefs; local/erase additionally select explicit masked workflows in the Action.
export const generationTools = [
  {
    id: 'lineart',
    label: 'generation.tool.lineart',
    hint: 'generation.tool.lineartHint',
    prompt: 'generation.prompt.lineart',
  },
  {
    id: 'pattern-create',
    label: 'generation.tool.patternCreate',
    hint: 'generation.tool.patternCreateHint',
    prompt: 'generation.prompt.patternCreate',
  },
  {
    id: 'pattern-transfer',
    label: 'generation.tool.patternTransfer',
    hint: 'generation.tool.patternTransferHint',
    prompt: 'generation.prompt.patternTransfer',
  },
  {
    id: 'local-cmf',
    label: 'generation.tool.localCmf',
    hint: 'generation.tool.localCmfHint',
    prompt: 'generation.prompt.localCmf',
  },
  {
    id: 'text',
    label: 'generation.tool.text',
    hint: 'generation.tool.textHint',
    prompt: 'generation.prompt.text',
  },
  {
    id: 'pattern',
    label: 'generation.tool.pattern',
    hint: 'generation.tool.patternHint',
    prompt: 'generation.prompt.pattern',
  },
  {
    id: 'cutout',
    label: 'generation.tool.cutout',
    hint: 'generation.tool.cutoutHint',
    prompt: 'generation.prompt.cutout',
  },
  {
    id: 'sketch',
    label: 'generation.tool.sketch',
    hint: 'generation.tool.sketchHint',
    prompt: 'generation.prompt.sketch',
  },
  {
    id: 'blend',
    label: 'generation.tool.blend',
    hint: 'generation.tool.blendHint',
    prompt: 'generation.prompt.blend',
  },
  {
    id: 'style',
    label: 'generation.tool.style',
    hint: 'generation.tool.styleHint',
    prompt: 'generation.prompt.style',
  },
  {
    id: 'form',
    label: 'generation.preset.form',
    hint: 'generation.tool.formHint',
    prompt: 'generation.prompt.form',
  },
  {
    id: 'cmf',
    label: 'generation.preset.cmf',
    hint: 'generation.tool.cmfHint',
    prompt: 'generation.prompt.cmf',
  },
  {
    id: 'view',
    label: 'generation.tool.view',
    hint: 'generation.tool.viewHint',
    prompt: 'generation.prompt.view',
  },
  {
    id: 'scene',
    label: 'generation.preset.scene',
    hint: 'generation.tool.sceneHint',
    prompt: 'generation.prompt.scene',
  },
  {
    id: 'local',
    label: 'generation.tool.local',
    hint: 'generation.tool.localHint',
    prompt: 'generation.prompt.local',
  },
  {
    id: 'erase',
    label: 'generation.tool.erase',
    hint: 'generation.tool.eraseHint',
    prompt: 'generation.prompt.erase',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: MessageKey;
  hint: MessageKey;
  prompt: MessageKey;
}>;

export function findGenerationTool(id: string) {
  return generationTools.find((tool) => tool.id === id);
}

// Image continuations preserve the selected source; text-only creation is separate.
const secondaryContinuationIds = new Set(['blend', 'style', 'pattern', 'cutout', 'erase']);
export const continuationToolGroups = [
  generationTools.filter((tool) => tool.id !== 'text' && !secondaryContinuationIds.has(tool.id)),
  generationTools.filter((tool) => secondaryContinuationIds.has(tool.id)),
] as const;

export const generationViews = ['front', 'side', 'rear', 'top', 'perspective'] as const;

export function viewDirection(
  brief: string,
  view: (typeof generationViews)[number],
  locale: AppLocale = 'en',
) {
  return `${brief}\n${translate(locale, 'generation.view.request', { view: locale === 'en' ? view : translate(locale, `generation.view.${view}`) })}`;
}
