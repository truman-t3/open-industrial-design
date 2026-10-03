import type { BaseNode, CandidateNode, Edge, GenerationCandidate } from './index';

/** Create missing result objects once; existing objects and edges are never repositioned. */
export function materializeCandidateResults(
  nodes: readonly BaseNode[],
  edges: readonly Edge[],
  candidates: readonly GenerationCandidate[],
  savedPositions: Readonly<Record<string, { x: number; y: number }>> = {},
): { nodes: CandidateNode[]; edges: Edge[] } {
  const addedNodes: CandidateNode[] = [];
  const addedEdges: Edge[] = [];
  const occupied = [...nodes];
  const width = 176;
  const height = 140;
  for (const candidate of candidates) {
    const source = nodes.find(
      (node) => node.id === candidate.generationNodeId && node.type === 'generation',
    );
    if (!source || source.boardId !== candidate.boardId)
      throw new Error('Candidate generation node is missing or on another Board.');
    const existing = occupied.filter(
      (node) => node.type === 'candidate' && (node as CandidateNode).candidateId === candidate.id,
    );
    if (existing.length > 1) throw new Error('Candidate has duplicate result nodes.');
    let result = existing[0];
    if (result && result.boardId !== candidate.boardId)
      throw new Error('Candidate result is on another Board.');
    if (!result) {
      const nodeId = `candidate-result-${candidate.id}`;
      if (occupied.some((node) => node.id === nodeId))
        throw new Error('Candidate result identifier is already used.');
      let position: { x: number; y: number } | undefined = savedPositions[candidate.id];
      if (position && (!Number.isFinite(position.x) || !Number.isFinite(position.y)))
        position = undefined;
      for (let column = 0; column < 8 && !position; column += 1) {
        for (let row = 0; row < 32 && !position; row += 1) {
          const x = source.x + source.width + 56 + column * (width + 20);
          const y = source.y + row * (height + 20);
          if (
            !occupied.some(
              (rect) =>
                rect.boardId === candidate.boardId &&
                x < rect.x + rect.width + 16 &&
                x + width + 16 > rect.x &&
                y < rect.y + rect.height + 16 &&
                y + height + 16 > rect.y,
            )
          )
            position = { x, y };
        }
      }
      position ??= { x: source.x + source.width + 56, y: source.y + 32 * (height + 20) };
      const node: CandidateNode = {
        id: nodeId,
        type: 'candidate',
        candidateId: candidate.id,
        boardId: candidate.boardId,
        ...position,
        width,
        height,
        rotation: 0,
        zIndex: 1,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      };
      result = node;
      addedNodes.push(node);
      occupied.push(node);
    }
    const outputs = [...edges, ...addedEdges].filter(
      (edge) => edge.type === 'generation_output' && edge.targetNodeId === result.id,
    );
    if (outputs.length > 1 || outputs.some((edge) => edge.sourceNodeId !== source.id))
      throw new Error('Candidate result has inconsistent output edges.');
    if (!outputs.length) {
      const edgeId = `candidate-output-${candidate.id}`;
      if ([...edges, ...addedEdges].some((edge) => edge.id === edgeId))
        throw new Error('Candidate output identifier is already used.');
      addedEdges.push({
        id: edgeId,
        boardId: candidate.boardId,
        type: 'generation_output',
        sourceNodeId: source.id,
        targetNodeId: result.id,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      });
    }
  }
  return { nodes: addedNodes, edges: addedEdges };
}
