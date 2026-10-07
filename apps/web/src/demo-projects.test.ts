import { describe, expect, it } from 'vitest';
import type { Project } from '@open-industrial-design/design-model';
import { partitionDemoProjects } from './demo-projects';

const project = (id: string, boardIds: string[], updatedAt: number): Project => ({
  id,
  boardIds,
  updatedAt,
  createdAt: 1,
  schemaVersion: 9,
  name: 'Portable Lamp Demo',
  settings: {},
});

describe('single demo entry', () => {
  it('keeps the newest demo and all ordinary projects visible, preserving old copies', () => {
    const seed = project('local-project', ['local-board'], 1);
    const old = project('old', ['old:local-board'], 2);
    const newest = project('new', ['new:local-board'], 3);
    const user = project('user', ['my-board'], 4);
    const input = [user, newest, old, seed];
    const result = partitionDemoProjects(input);
    expect(result.primary).toBe(newest);
    expect(result.visible).toEqual([user, newest]);
    expect(result.previous).toEqual([old, seed]);
    expect(input).toHaveLength(4);
  });
  it('does not classify a same-named user project as a demo', () => {
    expect(partitionDemoProjects([project('user', ['board'], 1)]).primary).toBeUndefined();
  });
  it('reuses the seed when it is the only existing demo', () => {
    const seed = project('local-project', ['local-board'], 1);
    expect(partitionDemoProjects([seed]).primary).toBe(seed);
    expect(partitionDemoProjects([]).visible).toEqual([]);
  });
});
