import type { CanvasNode } from '@open-industrial-design/canvas';
import type {
  Board,
  Design,
  DesignRelation,
  Edge,
  Project,
} from '@open-industrial-design/design-model';
import type { ProjectArchiveData } from '@open-industrial-design/project-file';
import type { Viewport } from '@open-industrial-design/design-model';

type DemoTemplate = {
  project: Project;
  board: Board;
  nodes: CanvasNode[];
  edges: Edge[];
  designs: Design[];
  relations: DesignRelation[];
  assetIds: string[];
};

/** Fit the opening view to the story's primary nodes, not every distant branch. */
export function fitDemoCopyViewport(
  nodes: Array<Pick<CanvasNode, 'id' | 'x' | 'y' | 'width' | 'height'>>,
  viewportWidth: number,
  viewportHeight: number,
  focusNodeIds: string[],
): Viewport {
  const focus = nodes.filter((node) => focusNodeIds.includes(node.id));
  if (!focus.length) return { x: 24, y: 24, zoom: 1 };

  const left =
    viewportWidth <= 860 ? 0 : viewportWidth <= 1180 ? 184 : viewportWidth <= 1440 ? 200 : 240;
  // The demo opens with an empty Inspector; the responsive workspace hides it at this breakpoint.
  const right =
    viewportWidth <= 860 ? 0 : viewportWidth <= 1180 ? 260 : viewportWidth <= 1440 ? 240 : 300;
  const canvasWidth = Math.max(280, viewportWidth - left - right);
  const canvasHeight = Math.max(280, viewportHeight - 134);
  const padding = 32;
  const minX = Math.min(...focus.map((node) => node.x));
  const minY = Math.min(...focus.map((node) => node.y));
  const maxX = Math.max(...focus.map((node) => node.x + node.width));
  const maxY = Math.max(...focus.map((node) => node.y + node.height));
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const zoom = Math.min(
    0.95,
    (canvasWidth - padding * 2) / boundsWidth,
    (canvasHeight - padding * 2) / boundsHeight,
  );

  return {
    zoom,
    x: (canvasWidth - boundsWidth * zoom) / 2 - minX * zoom,
    y: (canvasHeight - boundsHeight * zoom) / 2 - minY * zoom,
  };
}

/** A demo is a template, never a reset of the user's existing project. */
export function createDemoCopy(
  template: DemoTemplate,
  projectId: string,
  timestamp: number,
  projectName = '便携灯具探索 · 示例副本',
) {
  const id = (source: string) => `${projectId}:${source}`;
  const safeBlobPart = (value: string) =>
    [...value]
      .map((character) =>
        /^[A-Za-z0-9-]$/.test(character)
          ? character
          : `_u${character.codePointAt(0)?.toString(16) ?? '0'}_`,
      )
      .join('');
  const assetIds = Object.fromEntries(
    template.assetIds.map((source) => [
      source,
      `demo-${safeBlobPart(projectId)}-${safeBlobPart(source)}`,
    ]),
  );
  const nodes = template.nodes.map((source): CanvasNode => {
    const node = {
      ...structuredClone(source),
      id: id(source.id),
      boardId: id(template.board.id),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (node.designId) node.designId = id(node.designId);
    if ('assetId' in node && typeof node.assetId === 'string')
      node.assetId = assetIds[node.assetId] ?? node.assetId;
    if ('previewAssetId' in node && typeof node.previewAssetId === 'string')
      node.previewAssetId = assetIds[node.previewAssetId] ?? node.previewAssetId;
    if ('sketchDocumentId' in node && typeof node.sketchDocumentId === 'string')
      node.sketchDocumentId = id(node.sketchDocumentId);
    return node;
  });
  const edges = template.edges.map((edge) => ({
    ...edge,
    id: id(edge.id),
    boardId: id(template.board.id),
    sourceNodeId: id(edge.sourceNodeId),
    targetNodeId: id(edge.targetNodeId),
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  return {
    assetIds,
    project: {
      ...structuredClone(template.project),
      id: projectId,
      name: projectName,
      createdAt: timestamp,
      updatedAt: timestamp,
      boardIds: [id(template.board.id)],
      activeBoardId: id(template.board.id),
    },
    board: {
      ...structuredClone(template.board),
      id: id(template.board.id),
      projectId,
      name: '灯具设计探索',
      createdAt: timestamp,
      updatedAt: timestamp,
      nodeIds: nodes.map((node) => node.id),
      edgeIds: edges.map((edge) => edge.id),
    },
    nodes,
    edges,
    designs: template.designs.map((design) => ({
      ...design,
      id: id(design.id),
      projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(design.parentDesignId ? { parentDesignId: id(design.parentDesignId) } : {}),
    })),
    relations: template.relations.map((relation) => ({
      ...relation,
      id: id(relation.id),
      projectId,
      sourceDesignId: id(relation.sourceDesignId),
      targetDesignId: id(relation.targetDesignId),
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  };
}

/** Builds the full remapped demo as one archive-shaped atomic persistence unit. */
export function createDemoCopyArchive(
  template: DemoTemplate,
  projectId: string,
  timestamp: number,
  images: Array<{ id: string; name: string; blob: Blob }>,
  projectName = '便携灯具探索 · 示例副本',
): ProjectArchiveData {
  const copy = createDemoCopy(template, projectId, timestamp, projectName);
  const assets = images.map((image) => {
    const id = copy.assetIds[image.id];
    if (!id) throw new Error(`Unknown demo image: ${image.id}`);
    return {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId,
      type: 'image' as const,
      name: image.name,
      mimeType: image.blob.type || 'image/png',
      size: image.blob.size,
      storage: { type: 'indexeddb' as const, blobId: id },
    };
  });
  if (new Set(images.map((image) => image.id)).size !== images.length)
    throw new Error('Demo image identities must be unique.');
  const referencedImageIds = new Set(
    copy.nodes.flatMap((node) => [
      ...('assetId' in node && typeof node.assetId === 'string' ? [node.assetId] : []),
      ...('previewAssetId' in node && typeof node.previewAssetId === 'string'
        ? [node.previewAssetId]
        : []),
    ]),
  );
  if ([...referencedImageIds].some((id) => !assets.some((asset) => asset.id === id)))
    throw new Error('A demo image referenced by the Board is missing.');
  return {
    manifest: {
      format: 'open-industrial-design',
      schemaVersion: copy.project.schemaVersion,
      projectId,
      projectName: copy.project.name,
      createdAt: timestamp,
      exportedAt: timestamp,
    },
    project: copy.project,
    boards: [copy.board],
    nodes: copy.nodes,
    edges: copy.edges,
    assets,
    designs: copy.designs,
    relations: copy.relations,
    viewSets: [],
    cmfSets: [],
    cmfVariants: [],
    generations: [],
    candidates: [],
    sketchDocuments: [],
    assetBlobs: images.map((image) => ({
      id: copy.assetIds[image.id]!,
      blob: image.blob,
    })),
    candidateBlobs: [],
    generationInputBlobs: [],
  };
}
