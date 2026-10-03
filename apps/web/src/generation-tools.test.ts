import { describe, expect, it } from 'vitest';
import { translate } from '@open-industrial-design/core';
import {
  findGenerationTool,
  generationInputLabel,
  generationTools,
  generationViews,
  viewDirection,
} from './generation-tools';

describe('design task briefs', () => {
  it('names candidate inputs by their own batch without falling back to a generic image', () => {
    const candidates = [
      { id: 'other', generationNodeId: 'other-step' },
      { id: 'first', generationNodeId: 'step' },
      { id: 'second', generationNodeId: 'step' },
    ];
    const source = { type: 'candidate', candidateId: 'second' };
    expect(generationInputLabel(source, candidates, 'zh-CN')).toBe('候选 2');
    expect(generationInputLabel(source, candidates, 'en')).toBe('Candidate 2');
    expect(generationInputLabel(source, [], 'zh-CN')).toBe('候选结果');
    expect(generationInputLabel(undefined, [], 'zh-CN')).toBe('图片');
    expect(generationInputLabel({ type: 'image', label: 'My sketch' }, [], 'en')).toBe('My sketch');
  });
  it('provides unique, fully localized tasks with actionable instructions', () => {
    expect(new Set(generationTools.map((tool) => tool.id)).size).toBe(8);
    for (const tool of generationTools) {
      for (const locale of ['zh-CN', 'en'] as const) {
        for (const key of [tool.label, tool.hint, tool.prompt]) {
          expect(translate(locale, key)).not.toBe(key);
          expect(translate(locale, key).length).toBeGreaterThan(3);
        }
      }
      expect(findGenerationTool(tool.id)).toBe(tool);
    }
  });
  it('requests an explicit single view without pretending to guarantee multi-view consistency', () => {
    expect(viewDirection('保留灯具', 'front', 'zh-CN')).toContain('目标视角：正面');
    expect(viewDirection('保留灯具', 'front', 'zh-CN')).not.toContain('Requested camera');
    for (const view of generationViews) {
      expect(viewDirection('Preserve the lamp', view)).toContain(`Requested camera view: ${view}`);
      expect(viewDirection('Preserve the lamp', view)).toContain('not a contact sheet');
    }
  });
  it('does not invent unsupported precision or 3D capabilities', () => {
    expect(findGenerationTool('3d')).toBeUndefined();
    expect(findGenerationTool('mask')).toBeUndefined();
    expect(findGenerationTool('unknown')).toBeUndefined();
  });
});
