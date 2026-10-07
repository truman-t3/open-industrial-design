import { describe, expect, it } from 'vitest';
import { connectionAppearance, connectionIsActive } from './connection-appearance';

describe('connection visual hierarchy', () => {
  it('emphasizes only incident connections, including candidate selection', () => {
    expect(connectionIsActive('a', 'b', ['a'])).toBe(true);
    expect(connectionIsActive('a', 'b', ['b'])).toBe(true);
    expect(connectionIsActive('a', 'b', ['c'])).toBe(false);
    expect(connectionIsActive('a', 'b', [], 'result', 'result')).toBe(true);
    expect(connectionIsActive('a', 'b', [], 'result', 'other')).toBe(false);
    expect(connectionIsActive('a', 'b', [])).toBe(false);
  });
  it('separates pale workflow paths from dashed lineage and saturated selection', () => {
    expect(connectionAppearance('workflow', false)).toMatchObject({
      stroke: '#8aaaf0',
      opacity: 0.75,
    });
    expect(connectionAppearance('workflow', true)).toMatchObject({ stroke: '#2563ff', opacity: 1 });
    expect(connectionAppearance('workflow', false)).not.toHaveProperty('dash');
    expect(connectionAppearance('lineage', false)).toMatchObject({ dash: [5, 5], opacity: 0.55 });
    expect(connectionAppearance('lineage', true)).toMatchObject({ dash: [5, 5], opacity: 1 });
  });
});
