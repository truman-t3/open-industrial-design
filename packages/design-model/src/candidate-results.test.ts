import { describe, expect, it } from 'vitest';
import { materializeCandidateResults, type BaseNode, type GenerationCandidate } from './index';

const source = {
  id: 'task',
  boardId: 'board',
  type: 'generation',
  x: 0,
  y: 0,
  width: 240,
  height: 260,
  rotation: 0,
  zIndex: 0,
  createdAt: 1,
  updatedAt: 1,
} as BaseNode;
const candidate = {
  id: 'a',
  projectId: 'project',
  boardId: 'board',
  generationNodeId: 'task',
  generationId: 'run',
  mimeType: 'image/png',
  inputSignature: 'input',
  createdAt: 2,
  updatedAt: 2,
} satisfies GenerationCandidate;

describe('persistent candidate result materialization', () => {
  it('creates independent nodes and one output edge per result without formal assets', () => {
    const results = materializeCandidateResults(
      [source],
      [],
      [candidate, { ...candidate, id: 'b' }],
    );
    expect(results.nodes).toHaveLength(2);
    expect(results.edges).toHaveLength(2);
    expect(results.nodes[0]?.x).toBe(results.nodes[1]?.x);
    expect(results.nodes[0]?.y).not.toBe(results.nodes[1]?.y);
    expect(results.nodes[0]).not.toHaveProperty('designId');
    expect(results.nodes[0]).not.toHaveProperty('assetId');
  });

  it('is idempotent even after moving the source task', () => {
    const results = materializeCandidateResults([source], [], [candidate]);
    const repeated = materializeCandidateResults(
      [{ ...source, x: 900, y: 800 }, ...results.nodes],
      results.edges,
      [candidate],
    );
    expect(repeated).toEqual({ nodes: [], edges: [] });
  });

  it('prioritizes an existing local position and repairs only a missing edge', () => {
    const results = materializeCandidateResults([source], [], [candidate], {
      a: { x: -50, y: 99 },
    });
    expect(results.nodes[0]).toMatchObject({ x: -50, y: 99 });
    const repaired = materializeCandidateResults([source, ...results.nodes], [], [candidate]);
    expect(repaired.nodes).toEqual([]);
    expect(repaired.edges).toEqual(results.edges);
  });

  it('rejects duplicate identities, wrong-board parents and conflicting outputs', () => {
    const results = materializeCandidateResults([source], [], [candidate]);
    expect(() =>
      materializeCandidateResults(
        [source, ...results.nodes, { ...results.nodes[0]!, id: 'duplicate' }],
        [],
        [candidate],
      ),
    ).toThrow('duplicate');
    expect(() =>
      materializeCandidateResults([{ ...source, boardId: 'other' }], [], [candidate]),
    ).toThrow('another Board');
    expect(() =>
      materializeCandidateResults(
        [source, ...results.nodes],
        [{ ...results.edges[0]!, sourceNodeId: 'other' }],
        [candidate],
      ),
    ).toThrow('inconsistent');
  });
});
