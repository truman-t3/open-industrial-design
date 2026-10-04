import { describe, expect, it } from 'vitest';
import { translate } from '@open-industrial-design/core';
import type { BaseNode, Edge } from '@open-industrial-design/design-model';
import {
  findGenerationTool,
  generationInputLabel,
  queueInputSummaries,
  generationTools,
  continuationToolGroups,
  generationViews,
  viewDirection,
} from './generation-tools';

describe('design task briefs', () => {
  it('exposes every image tool once for continuation, keeping text-only creation separate', () => {
    const ids = continuationToolGroups.flat().map((tool) => tool.id);
    expect(new Set(ids).size).toBe(15);
    expect(ids).not.toContain('text');
    expect(ids.slice().sort()).toEqual(
      generationTools
        .filter((tool) => tool.id !== 'text')
        .map((tool) => tool.id)
        .sort(),
    );
    expect(continuationToolGroups[1].map((tool) => tool.id).sort()).toEqual([
      'blend',
      'cutout',
      'erase',
      'pattern',
      'style',
    ]);
  });
  it('distinguishes same-name tasks by real inputs without changing board edges', () => {
    const nodes = [
      { id: 'a', type: 'generation', label: 'CMF' },
      { id: 'b', type: 'generation', label: 'CMF' },
      { id: 'text', type: 'generation', textOnly: true },
      { id: 'empty', type: 'generation' },
      { id: 'image', type: 'image', label: 'Lamp' },
      { id: 'result', type: 'candidate', candidateId: 'candidate' },
    ] as BaseNode[];
    const edges = [
      {
        id: 'z',
        type: 'generation_input',
        sourceNodeId: 'missing',
        targetNodeId: 'a',
        inputRole: 'reference',
      },
      {
        id: 'y',
        type: 'generation_input',
        sourceNodeId: 'image',
        targetNodeId: 'a',
        inputRole: 'base',
      },
      {
        id: 'x',
        type: 'generation_input',
        sourceNodeId: 'result',
        targetNodeId: 'b',
        inputRole: 'base',
      },
      { id: 'output', type: 'generation_output', sourceNodeId: 'a', targetNodeId: 'b' },
    ] as Edge[];
    const original = structuredClone(edges);
    const summaries = queueInputSummaries(
      nodes,
      edges,
      [{ id: 'candidate', generationNodeId: 'a' }],
      'zh-CN',
    );
    expect(summaries).toEqual({
      a: '主图：Lamp · 参考图：来源不可用',
      b: '主图：候选 1',
      text: '纯文字任务',
      empty: '尚未连接图片',
    });
    expect(edges).toEqual(original);
    expect(queueInputSummaries(nodes, [], [], 'en').text).toBe('Text-only task');
  });
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
    expect(new Set(generationTools.map((tool) => tool.id)).size).toBe(16);
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
