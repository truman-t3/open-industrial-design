import {
  translate,
  translateDemoLabel,
  type AppLocale,
  type MessageKey,
} from '@open-industrial-design/core';

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

// These are editable task briefs, not separate provider capabilities.
export const generationTools = [
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
] as const satisfies ReadonlyArray<{
  id: string;
  label: MessageKey;
  hint: MessageKey;
  prompt: MessageKey;
}>;

export function findGenerationTool(id: string) {
  return generationTools.find((tool) => tool.id === id);
}

export const generationViews = ['front', 'side', 'rear', 'top', 'perspective'] as const;

export function viewDirection(
  brief: string,
  view: (typeof generationViews)[number],
  locale: AppLocale = 'en',
) {
  return `${brief}\n${translate(locale, 'generation.view.request', { view: locale === 'en' ? view : translate(locale, `generation.view.${view}`) })}`;
}
