import { describe, expect, it } from 'vitest';
import { serializeSketchScene, parseSketchScene } from './sketch-scene';

describe('editable sketch source', () => {
  it('loads legacy scenes, strips runtime state and rejects other formats', () => {
    expect(
      parseSketchScene(JSON.stringify({ type: 'excalidraw', version: 2, elements: [] })),
    ).toEqual({ elements: [], files: {}, appState: { viewBackgroundColor: '#ffffff' } });
    expect(
      parseSketchScene(
        JSON.stringify({
          type: 'excalidraw',
          version: 2,
          elements: [],
          appState: { viewBackgroundColor: '#123456', collaborators: { private: true } },
        }),
      ).appState,
    ).toEqual({ viewBackgroundColor: '#123456' });
    expect(() => parseSketchScene('{}')).toThrow();
    expect(() => parseSketchScene('{')).toThrow();
  });
  it('retains embedded images and background with their element references', () => {
    const elements = [{ id: 'image', type: 'image', fileId: 'file-1' }];
    const files = {
      'file-1': {
        id: 'file-1',
        mimeType: 'image/png',
        dataURL: 'data:image/png;base64,YQ==',
        created: 1,
      },
    };
    const scene = JSON.parse(serializeSketchScene(elements, files, '#123456'));
    expect(scene).toEqual({
      type: 'excalidraw',
      version: 2,
      elements,
      files,
      appState: { viewBackgroundColor: '#123456' },
    });
    expect(Object.keys(scene.appState)).toEqual(['viewBackgroundColor']);
  });

  it('serializes an image-free scene without null files', () => {
    expect(JSON.parse(serializeSketchScene([], null, '#ffffff')).files).toEqual({});
  });
});
