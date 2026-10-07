import type { GenerationCandidate } from '@open-industrial-design/design-model';

export function candidateBatches(candidates: readonly GenerationCandidate[]) {
  const batches = new Map<
    string,
    {
      id: string;
      createdAt: number;
      items: Array<{ candidate: GenerationCandidate; index: number }>;
    }
  >();
  candidates.forEach((candidate, index) => {
    const batch = batches.get(candidate.generationId) ?? {
      id: candidate.generationId,
      createdAt: candidate.createdAt,
      items: [],
    };
    batch.createdAt = Math.max(batch.createdAt, candidate.createdAt);
    batch.items.push({ candidate, index });
    batches.set(batch.id, batch);
  });
  return [...batches.values()].sort((a, b) => b.createdAt - a.createdAt);
}
