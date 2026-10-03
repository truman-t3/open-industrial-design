import { describe, expect, it } from 'vitest';
import { toGraphEdges, toGraphNodes } from './graph-adapter';

const concept = {
  id: 'concept',
  createdAt: 1,
  updatedAt: 1,
  projectId: 'project',
  name: 'Portable lamp',
  kind: 'concept' as const,
  status: 'exploring' as const,
};
const variant = {
  id: 'variant',
  createdAt: 2,
  updatedAt: 2,
  projectId: 'project',
  name: 'Portable lamp — soft form',
  kind: 'variant' as const,
  status: 'candidate' as const,
  parentDesignId: concept.id,
};

describe('Design graph adapter', () => {
  it('uses parentDesignId as lineage even with no semantic relation', () => {
    const edges = toGraphEdges([concept, variant], []);
    expect(edges).toEqual([
      expect.objectContaining({
        id: 'lineage:concept:variant',
        source: 'concept',
        target: 'variant',
        data: { source: 'lineage' },
      }),
    ]);
  });

  it('adds relations as semantic visual annotations and preserves saved positions', () => {
    const nodes = toGraphNodes([concept, variant], {
      graphViewState: { projectId: 'project', positions: { concept: { x: 120, y: 80 } } },
      selectedDesignId: 'concept',
    });
    const edges = toGraphEdges(
      [concept, variant],
      [
        {
          id: 'relation',
          createdAt: 3,
          updatedAt: 3,
          projectId: 'project',
          sourceDesignId: variant.id,
          targetDesignId: concept.id,
          type: 'references',
        },
      ],
    );

    expect(nodes[0]).toMatchObject({ position: { x: 120, y: 80 }, selected: true });
    expect(edges).toContainEqual(
      expect.objectContaining({
        id: 'relation:relation',
        label: 'references',
        data: { source: 'semantic-relation', relationType: 'references' },
      }),
    );
  });
});
