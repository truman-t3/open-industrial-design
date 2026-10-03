import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GenerationNode } from '@open-industrial-design/design-model';
import { GenerationCardEditor } from '../../../packages/canvas/src/generation-card-editor';

const node: GenerationNode = {
  id: 'task',
  boardId: 'board',
  type: 'generation',
  label: 'CMF',
  direction: '探索米白色磨砂外壳',
  notes: '',
  count: 2,
  x: 40,
  y: 60,
  width: 290,
  height: 300,
  rotation: 0,
  zIndex: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe('inline generation card controls', () => {
  it('renders an accessible Chinese draft and model configuration without running', () => {
    const onRun = vi.fn();
    const html = renderToStaticMarkup(
      <GenerationCardEditor
        node={node}
        viewport={{ x: 10, y: 20, zoom: 1 }}
        locale="zh-CN"
        busy={false}
        ready={false}
        onCommit={vi.fn()}
        onRun={onRun}
      />,
    );
    expect(html).toContain('aria-label="设计方向"');
    expect(html).toContain('探索米白色磨砂外壳');
    expect(html).toContain('配置模型');
    expect(html).toContain('尚未配置模型');
    expect(html).toContain('left:50px');
    expect(html).toContain('top:80px');
    expect(html).toContain('scale(1)');
    expect(onRun).not.toHaveBeenCalled();
  });
  it('shows manual run quantity and provider and disables busy controls', () => {
    const html = renderToStaticMarkup(
      <GenerationCardEditor
        node={node}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        locale="zh-CN"
        busy={false}
        ready={true}
        providerName="Local test"
        onCommit={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    expect(html).toContain('生成 · 2');
    expect(html).toContain('模型：Local test · 2 张');
    const withStatus = renderToStaticMarkup(
      <GenerationCardEditor
        node={node}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        locale="zh-CN"
        busy={false}
        ready={true}
        providerName="Local test"
        status="候选方案已保存"
        onCommit={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    expect(withStatus).toContain('role="status"');
    expect(withStatus).toContain('候选方案已保存');
    const busy = renderToStaticMarkup(
      <GenerationCardEditor
        node={node}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        locale="zh-CN"
        busy={true}
        ready={true}
        onCommit={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    expect(busy.match(/disabled=""/g)).toHaveLength(2);
    expect(busy).toContain('正在生成');
  });

  it('lets a pan gesture pass through the generation card overlay', () => {
    const html = renderToStaticMarkup(
      <GenerationCardEditor
        node={node}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        locale="zh-CN"
        busy={false}
        ready={false}
        interactive={false}
        onCommit={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    expect(html).toContain('pointer-events:none');
  });

  it('uses the Inspector instead of shrinking card controls below readable zoom', () => {
    const html = renderToStaticMarkup(
      <GenerationCardEditor
        node={node}
        viewport={{ x: 10, y: 20, zoom: 0.79 }}
        locale="zh-CN"
        busy={false}
        ready={true}
        providerName="Local test"
        onCommit={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    expect(html).toBe('');
  });
});
