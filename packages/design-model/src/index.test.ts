import { describe, expect, it } from 'vitest';
import {
  PROJECT_SCHEMA_VERSION,
  addCMFVariant,
  createCMFSet,
  createConcept,
  createModel3DNode,
  createVariant,
  createViewSet,
  transitionDesignStatus,
  validateGenerationInput,
  validateGenerationOutput,
  type Asset,
  type Board,
  type CMFSet,
  type CMFVariant,
  type Design,
  type DesignRelation,
  type Edge,
  type Generation,
  type GraphViewState,
  type Model3DNode,
  type Project,
  type SketchDocument,
  type ViewSet,
} from './index';

const timestamps = { createdAt: 1, updatedAt: 2 };

describe('domain model contracts', () => {
  it('rejects duplicate main images, excess references, invalid sources and cross-board inputs', () => {
    const visual = (id: string, boardId = 'board') => ({
      id,
      boardId,
      type: 'reference' as const,
      assetId: id,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const target = {
      id: 'generate',
      boardId: 'board',
      type: 'generation' as const,
      label: 'Generate',
      direction: 'Lamp',
      notes: '',
      count: 2,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: 2,
      createdAt: 1,
      updatedAt: 1,
    };
    const nodes = [
      visual('a'),
      visual('b'),
      visual('c'),
      visual('d'),
      visual('e'),
      visual('f'),
      visual('other', 'other-board'),
      target,
    ];
    const edge = (id: string, sourceNodeId: string, inputRole: 'base' | 'reference'): Edge => ({
      id,
      boardId: 'board',
      sourceNodeId,
      targetNodeId: target.id,
      type: 'generation_input',
      inputRole,
      createdAt: 1,
      updatedAt: 1,
    });
    const edges = [
      edge('base', 'a', 'base'),
      edge('r1', 'b', 'reference'),
      edge('r2', 'c', 'reference'),
      edge('r3', 'd', 'reference'),
      edge('r4', 'e', 'reference'),
    ];
    expect(validateGenerationInput(nodes, [], 'a', target.id, 'base')).toBeUndefined();
    expect(validateGenerationInput(nodes, edges, 'a', target.id, 'reference')).toMatch(/already/);
    expect(validateGenerationInput(nodes, edges, 'f', target.id, 'base')).toMatch(/main/);
    expect(validateGenerationInput(nodes, edges, 'f', target.id, 'reference')).toMatch(/four/);
    expect(validateGenerationInput(nodes, [], 'other', target.id, 'base')).toMatch(/same board/);
    expect(validateGenerationInput(nodes, [], target.id, target.id, 'base')).toMatch(
      /visual source/,
    );
    expect(validateGenerationOutput(nodes, [], target.id, 'a')).toBeUndefined();
    expect(validateGenerationOutput(nodes, [], 'a', target.id)).toMatch(/Generation and output/);
    expect(
      validateGenerationOutput(
        nodes,
        [
          {
            id: 'output',
            boardId: 'board',
            sourceNodeId: target.id,
            targetNodeId: 'a',
            type: 'generation_output',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        target.id,
        'a',
      ),
    ).toMatch(/already connected/);
  });
  it('builds a Reference to Concept to Variant to ViewSet and CMF workflow without AI', () => {
    let sequence = 0;
    const id = () => `id-${++sequence}`;
    const concept = createConcept(
      { projectId: 'project', boardId: 'board', name: 'Lamp', x: 0, y: 0 },
      id,
      () => 10,
    );
    const variant = createVariant(
      concept.design,
      { boardId: 'board', name: 'Lamp A', x: 40, y: 40 },
      id,
      () => 20,
    );
    const viewSet = createViewSet('project', variant.design.id, id, () => 30);
    const cmfSet = createCMFSet('project', variant.design.id, id, () => 40);
    const cmf = addCMFVariant(
      cmfSet,
      { color: { hex: '#FFFFFF' }, material: 'ABS', finish: 'matte' },
      id,
      () => 50,
    );
    expect(variant.design.parentDesignId).toBe(concept.design.id);
    expect(variant.relation.type).toBe('variant_of');
    expect(viewSet.designId).toBe(variant.design.id);
    expect(cmf.set.variantIds).toEqual([cmf.variant.id]);
    expect(transitionDesignStatus(variant.design, 'candidate', () => 60).status).toBe('candidate');
  });

  it('expresses a complete project scenario as JSON-safe data', () => {
    const project: Project = {
      ...timestamps,
      id: 'project-1',
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: 'Portable lamp',
      boardIds: ['board-1'],
      settings: { unit: 'mm' },
    };
    const board: Board = {
      ...timestamps,
      id: 'board-1',
      projectId: project.id,
      name: 'Concept',
      nodeIds: ['node-1'],
      edgeIds: ['edge-1'],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const asset: Asset = {
      ...timestamps,
      id: 'asset-1',
      projectId: project.id,
      type: 'image',
      name: 'lamp-reference.png',
      mimeType: 'image/png',
      size: 128,
      storage: { type: 'indexeddb', blobId: 'blob-1' },
      metadata: { source: 'local import' },
    };
    const design: Design = {
      ...timestamps,
      id: 'design-1',
      projectId: project.id,
      name: 'Concept A',
      kind: 'concept',
      status: 'exploring',
      dna: {
        silhouetteLocked: true,
        proportionLocked: true,
        geometryLocked: false,
        detailLocked: false,
        cmfLocked: false,
        brandLocked: false,
      },
    };
    const edge: Edge = {
      ...timestamps,
      id: 'edge-1',
      boardId: board.id,
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      type: 'references',
    };
    const relation: DesignRelation = {
      ...timestamps,
      id: 'relation-1',
      projectId: project.id,
      sourceDesignId: design.id,
      targetDesignId: 'design-2',
      type: 'related_to',
    };
    const viewSet: ViewSet = {
      ...timestamps,
      id: 'viewset-1',
      projectId: project.id,
      designId: design.id,
      views: { front: asset.id },
    };
    const cmfVariant: CMFVariant = {
      ...timestamps,
      id: 'cmf-variant-1',
      projectId: project.id,
      designId: design.id,
      color: { hex: '#FFFFFF' },
    };
    const cmfSet: CMFSet = {
      ...timestamps,
      id: 'cmf-set-1',
      projectId: project.id,
      designId: design.id,
      variantIds: [cmfVariant.id],
    };
    const generation: Generation = {
      ...timestamps,
      id: 'generation-1',
      projectId: project.id,
      actionId: 'design.createVariant',
      providerId: 'future-provider',
      status: 'success',
      sourceDesignIds: [design.id],
      outputDesignIds: ['design-2'],
      parameters: { count: 1, preserveSilhouette: true },
    };
    const sketchDocument: SketchDocument = {
      ...timestamps,
      id: 'sketch-1',
      projectId: project.id,
      format: 'excalidraw',
      formatVersion: 1,
      sourceAssetId: asset.id,
    };
    const graphView: GraphViewState = {
      projectId: project.id,
      positions: { [design.id]: { x: 20, y: 40 } },
    };

    const portableData = {
      project,
      board,
      asset,
      design,
      edge,
      relation,
      viewSet,
      cmfVariant,
      cmfSet,
      generation,
      sketchDocument,
      graphView,
    };

    expect(JSON.parse(JSON.stringify(portableData))).toEqual(portableData);
    expect(design.parentDesignId).toBeUndefined();
    expect(generation.outputDesignIds).toEqual(['design-2']);
  });

  it('keeps a 3D review node and its camera parameters JSON-serializable', () => {
    const node: Model3DNode = createModel3DNode(
      {
        boardId: 'board-1',
        assetId: 'asset-model-1',
        previewAssetId: 'asset-preview-1',
        x: 10,
        y: 20,
        width: 320,
        height: 220,
        rotation: 0,
        zIndex: 2,
        camera: {
          mode: 'perspective',
          position: [2, 1.5, 3],
          target: [0, 0, 0],
          preset: 'perspective',
        },
      },
      () => 'model-node-1',
      () => 70,
    );

    expect(JSON.parse(JSON.stringify(node))).toEqual(node);
    expect(node.type).toBe('model3d');
  });
});
