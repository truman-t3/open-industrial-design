import { describe, expect, it } from 'vitest';
import {
  resolveAppLocale,
  translate,
  translateDemoLabel,
  translateDesignStatus,
  translateGraphRelation,
  translateNodeType,
} from './localization';

describe('localization', () => {
  it('defaults Chinese browser tags to simplified Chinese', () => {
    expect(resolveAppLocale('zh-CN')).toBe('zh-CN');
    expect(resolveAppLocale('zh')).toBe('zh-CN');
    expect(resolveAppLocale('zh-TW')).toBe('zh-CN');
  });

  it('uses English for non-Chinese and absent browser tags', () => {
    expect(resolveAppLocale('en-GB')).toBe('en');
    expect(resolveAppLocale('ja-JP')).toBe('en');
    expect(resolveAppLocale()).toBe('en');
  });

  it('formats localized variables without storing them in project data', () => {
    expect(translate('zh-CN', 'workspace.nodeCount', { count: 3 })).toBe('3 个节点');
    expect(translate('en', 'workspace.nodeCount', { count: 3 })).toBe('3 Nodes');
  });

  it('localizes canvas presentation values without changing persisted values', () => {
    expect(translateDemoLabel('zh-CN', undefined)).toBe('');
    expect(translateDemoLabel('en', undefined)).toBe('');
    expect(translateNodeType('zh-CN', 'concept')).toBe('概念方案');
    expect(translateDesignStatus('zh-CN', 'exploring')).toBe('探索中');
    expect(translateDemoLabel('zh-CN', 'Portable Lamp Demo')).toBe('便携灯具示例');
    expect(translateDemoLabel('en', 'Portable Lamp Demo')).toBe('Portable Lamp Demo');
  });

  it('localizes graph labels and built-in demo names, preserving custom names', () => {
    expect(translateGraphRelation('zh-CN', 'references')).toBe('参考关系');
    expect(translateGraphRelation('zh-CN', 'unknown')).toBe('关联关系');
    expect(translateDemoLabel('zh-CN', 'Portable lamp concept')).toBe('便携灯具概念方案');
    expect(translateDemoLabel('zh-CN', 'My custom design')).toBe('My custom design');
    expect(translate('zh-CN', 'workspace.newConcept')).toBe('新建概念方案');
  });
});
