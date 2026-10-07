import { expect, it } from 'vitest';
import type { GenerationCandidate } from '@open-industrial-design/design-model';
import { candidateBatches } from './candidate-batches';
it('groups runs newest first without changing candidate numbering or input order', () => {
  const input = [
    { id: 'a', generationId: 'old', createdAt: 1 },
    { id: 'b', generationId: 'new', createdAt: 3 },
    { id: 'c', generationId: 'old', createdAt: 2 },
  ] as GenerationCandidate[];
  const batches = candidateBatches(input);
  expect(batches.map((b) => b.id)).toEqual(['new', 'old']);
  expect(batches[1]?.items.map((item) => item.index)).toEqual([0, 2]);
  expect(input.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  expect(candidateBatches([])).toEqual([]);
});
