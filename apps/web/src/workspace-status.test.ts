import { describe, expect, it } from 'vitest';
import { updateWorkspaceStatus } from './workspace-status';

describe('workspace transient status ownership', () => {
  it('keeps statuses scoped to their task when requests finish out of order', () => {
    const first = updateWorkspaceStatus({}, 'board:task-a', '正在生成');
    const second = updateWorkspaceStatus(first, 'board:task-b', '配置模型后可生成');

    expect(second).toEqual({
      'board:task-a': '正在生成',
      'board:task-b': '配置模型后可生成',
    });
    expect(second['board:task-b']).toBe('配置模型后可生成');
  });

  it('clears only the status for the requested context', () => {
    const statuses = {
      'board:task-a': '请求失败',
      'board:task-b': '已保存',
    };

    expect(updateWorkspaceStatus(statuses, 'board:task-a', undefined)).toEqual({
      'board:task-b': '已保存',
    });
    expect(updateWorkspaceStatus(statuses, 'board:task-c', undefined)).toBe(statuses);
  });
});
