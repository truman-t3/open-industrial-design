import { describe, expect, it } from 'vitest';
import {
  validateGenerationInput,
  validateGenerationOutput,
  type BaseNode,
  type Edge,
} from './index';

const node = (id: string, type: BaseNode['type']): BaseNode => ({
  id,
  type,
  boardId: 'board',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  zIndex: 0,
  createdAt: 1,
  updatedAt: 1,
});
const edge = (sourceNodeId: string, targetNodeId: string, type: Edge['type']): Edge => ({
  id: `${sourceNodeId}-${targetNodeId}`,
  boardId: 'board',
  sourceNodeId,
  targetNodeId,
  type,
  inputRole: type === 'generation_input' ? 'base' : undefined,
  createdAt: 1,
  updatedAt: 1,
});
const nodes = [
  node('a', 'generation'),
  node('b', 'generation'),
  node('x', 'image'),
  node('y', 'image'),
];

describe('generation workflow cycles', () => {
  it('rejects direct and multi-step feedback as main or reference input', () => {
    const edges = [
      edge('a', 'x', 'generation_output'),
      edge('x', 'b', 'generation_input'),
      edge('b', 'y', 'generation_output'),
    ];
    expect(validateGenerationInput(nodes, edges, 'x', 'a', 'base')).toMatch(/cycle/);
    expect(validateGenerationInput(nodes, edges, 'y', 'a', 'reference')).toMatch(/cycle/);
    expect(validateGenerationOutput(nodes, [edge('x', 'a', 'generation_input')], 'a', 'x')).toMatch(
      /cycle/,
    );
  });

  it('allows forward branches and ignores decorative or other-board relations', () => {
    expect(
      validateGenerationInput(nodes, [edge('a', 'x', 'generation_output')], 'x', 'b', 'base'),
    ).toBeUndefined();
    expect(
      validateGenerationInput(nodes, [edge('a', 'x', 'references')], 'x', 'a', 'base'),
    ).toBeUndefined();
    expect(
      validateGenerationInput(
        nodes,
        [{ ...edge('a', 'x', 'generation_output'), boardId: 'other' }],
        'x',
        'a',
        'base',
      ),
    ).toBeUndefined();
  });

  it('terminates when legacy data already contains an unrelated cycle', () => {
    const edges = [edge('a', 'x', 'generation_output'), edge('x', 'a', 'generation_input')];
    expect(validateGenerationInput(nodes, edges, 'y', 'a', 'base')).toMatch(/main/);
  });
});
