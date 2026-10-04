import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@open-industrial-design/canvas';
import { validateProjectArchiveData } from '@open-industrial-design/project-file';
import type {
  Board,
  Design,
  DesignRelation,
  Edge,
  Project,
} from '@open-industrial-design/design-model';
import { createDemoCopy, createDemoCopyArchive, fitDemoCopyViewport } from './demo-copy';

describe('independent demo copies', () => {
  it('opens on a readable primary flow without fitting distant branches into tiny cards', () => {
    const nodes = [
      { id: 'sketch', x: 30, y: 155, width: 180, height: 200 },
      { id: 'reference', x: 30, y: 390, width: 180, height: 200 },
      { id: 'step', x: 260, y: 250, width: 220, height: 240 },
      { id: 'concept', x: 545, y: 210, width: 280, height: 300 },
      { id: 'far-branch', x: 1600, y: 900, width: 220, height: 240 },
    ];

    const wide = fitDemoCopyViewport(nodes, 1280, 720, ['sketch', 'reference', 'step', 'concept']);
    const compact = fitDemoCopyViewport(nodes, 1024, 680, [
      'sketch',
      'reference',
      'step',
      'concept',
    ]);
    const narrow = fitDemoCopyViewport(nodes, 800, 680, ['sketch', 'reference', 'step', 'concept']);

    expect(wide.zoom).toBeGreaterThan(0.85);
    expect(wide.zoom).toBeLessThanOrEqual(0.95);
    expect(compact.zoom).toBeGreaterThan(0.6);
    expect(narrow.zoom).toBeGreaterThan(0.7);
    expect(narrow.zoom).toBeGreaterThan(compact.zoom);
    expect(wide.x + 30 * wide.zoom).toBeGreaterThanOrEqual(32);
    expect(wide.x + 825 * wide.zoom).toBeLessThanOrEqual(808);
    expect(wide.y + 155 * wide.zoom).toBeGreaterThanOrEqual(32);
    expect(wide.y + 590 * wide.zoom).toBeLessThanOrEqual(554);
    expect(narrow.x + 30 * narrow.zoom).toBeGreaterThanOrEqual(32);
    expect(narrow.x + 825 * narrow.zoom).toBeLessThanOrEqual(800 - 32);
  });

  it('remaps all workflow and lineage endpoints without changing the template or previous copy', async () => {
    const template = {
      project: {
        id: 'old-project',
        createdAt: 1,
        updatedAt: 1,
        schemaVersion: 9,
        name: 'Lamp template',
        settings: {},
        boardIds: ['board'],
        activeBoardId: 'board',
      } as Project,
      board: {
        id: 'board',
        createdAt: 1,
        updatedAt: 1,
        projectId: 'old-project',
        name: 'Concept',
        nodeIds: ['source', 'task', 'result'],
        edgeIds: ['input', 'output'],
        viewport: { x: 24, y: 24, zoom: 0.5 },
      } as Board,
      nodes: [
        {
          id: 'source',
          boardId: 'board',
          type: 'concept',
          designId: 'concept',
          previewAssetId: 'image',
          x: 10,
        },
        { id: 'task', boardId: 'board', type: 'generation', direction: '手动生成' },
        {
          id: 'result',
          boardId: 'board',
          type: 'variant',
          designId: 'variant',
          previewAssetId: 'image',
        },
      ] as CanvasNode[],
      edges: [
        {
          id: 'input',
          sourceNodeId: 'source',
          targetNodeId: 'task',
          type: 'generation_input',
          inputRole: 'base',
        },
        { id: 'output', sourceNodeId: 'task', targetNodeId: 'result', type: 'generation_output' },
      ] as Edge[],
      designs: [{ id: 'concept' }, { id: 'variant', parentDesignId: 'concept' }] as Design[],
      relations: [
        { id: 'relation', sourceDesignId: 'variant', targetDesignId: 'concept' },
      ] as DesignRelation[],
      assetIds: ['image'],
    };
    const original = structuredClone(template);
    const first = createDemoCopy(template, 'first', 100);
    const second = createDemoCopy(template, 'second', 200);
    expect(template).toEqual(original);
    expect(second.project).toMatchObject({
      id: 'second',
      boardIds: ['second:board'],
      activeBoardId: 'second:board',
      createdAt: 200,
    });
    expect(second.nodes[0]).toMatchObject({
      id: 'second:source',
      designId: 'second:concept',
      previewAssetId: 'demo-second-image',
      boardId: 'second:board',
      x: 10,
    });
    expect(second.edges.map((edge) => [edge.sourceNodeId, edge.targetNodeId])).toEqual([
      ['second:source', 'second:task'],
      ['second:task', 'second:result'],
    ]);
    expect(second.board.nodeIds).toEqual(second.nodes.map((node) => node.id));
    expect(second.board.edgeIds).toEqual(second.edges.map((edge) => edge.id));
    expect(second.designs[1].parentDesignId).toBe('second:concept');
    expect(second.relations[0]).toMatchObject({
      sourceDesignId: 'second:variant',
      targetDesignId: 'second:concept',
    });
    second.nodes[0].x = 900;
    second.board.viewport.x = 900;
    expect(first.nodes[0].x).toBe(10);
    expect(first.board.viewport.x).toBe(24);
    expect(first.assetIds.image).not.toBe(second.assetIds.image);
    expect('generations' in second).toBe(false);

    const archive = createDemoCopyArchive(
      template,
      'portable-demo',
      300,
      [{ id: 'image', name: 'Lamp render', blob: new Blob(['image'], { type: 'image/png' }) }],
      'Portable lamp demo copy',
    );
    expect(archive).toMatchObject({
      manifest: {
        format: 'open-industrial-design',
        schemaVersion: 9,
        projectId: 'portable-demo',
        projectName: 'Portable lamp demo copy',
      },
      boards: [{ id: 'portable-demo:board', projectId: 'portable-demo' }],
      assets: [{ id: 'demo-portable-demo-image', projectId: 'portable-demo' }],
    });
    expect(archive.assetBlobs.map((entry) => entry.id)).toEqual(['demo-portable-demo-image']);
    expect(archive.assetBlobs[0]?.blob).toMatchObject({ size: 5, type: 'image/png' });
    expect(await archive.assetBlobs[0]?.blob.text()).toBe('image');
    expect(archive.candidates).toEqual([]);
    expect(archive.generations).toEqual([]);
    expect(() => validateProjectArchiveData(archive)).not.toThrow();
  });

  it('refuses to build a demo copy when a referenced image is missing', () => {
    const template = {
      project: { id: 'template', schemaVersion: 9 } as Project,
      board: { id: 'board' } as Board,
      nodes: [
        { id: 'source', boardId: 'board', type: 'reference', assetId: 'missing' },
      ] as CanvasNode[],
      edges: [],
      designs: [],
      relations: [],
      assetIds: ['missing'],
    };

    expect(() => createDemoCopyArchive(template, 'copy', 1, [])).toThrow(
      'A demo image referenced by the Board is missing.',
    );
  });
});
