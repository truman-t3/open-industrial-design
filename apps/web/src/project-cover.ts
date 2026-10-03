import type { BaseNode, Board, Project } from '@open-industrial-design/design-model';

interface CoverReader {
  listBoards(projectId: string): Promise<Board[]>;
  listNodes(boardId: string): Promise<BaseNode[]>;
  getBlob(assetId: string): Promise<Blob | undefined>;
}

/** A disposable Home preview, derived from existing project media without changing the project. */
export async function loadProjectCover(project: Project, reader: CoverReader) {
  const boards = await reader.listBoards(project.id);
  const nodes = (await Promise.all(boards.map((board) => reader.listNodes(board.id)))).flat();
  const priority = ['concept', 'variant', 'model3d', 'reference', 'image', 'sketch'];
  const candidates = nodes
    .filter((node) => priority.includes(node.type))
    .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
  const visited = new Set<string>();
  for (const node of candidates) {
    for (const field of ['previewAssetId', 'assetId'] as const) {
      const id = (node as unknown as Record<string, unknown>)[field];
      if (typeof id !== 'string' || visited.has(id)) continue;
      visited.add(id);
      try {
        const blob = await reader.getBlob(id);
        if (blob?.size && blob.type.startsWith('image/')) return blob;
      } catch {
        // One missing or unreadable resource must not hide another usable image.
      }
    }
  }
  return undefined;
}
