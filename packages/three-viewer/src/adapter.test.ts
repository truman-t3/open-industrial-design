import { describe, expect, it } from 'vitest';
import {
  MAX_MODEL_FILE_SIZE,
  createModelMetadata,
  defaultCameraState,
  validateModelFile,
} from './adapter';

describe('3D viewer adapter', () => {
  it('accepts GLB and GLTF files without retaining File objects', () => {
    expect(validateModelFile({ name: 'lamp.glb', size: 12 })).toEqual({
      format: 'glb',
      mimeType: 'model/gltf-binary',
    });
    expect(validateModelFile({ name: 'lamp.gltf', size: 12 })).toEqual({
      format: 'gltf',
      mimeType: 'model/gltf+json',
    });
    expect(createModelMetadata('glb', 'lamp.glb')).toEqual({
      format: 'glb',
      sourceFileName: 'lamp.glb',
    });
  });

  it('rejects unsupported, empty, and oversized files before persistence', () => {
    expect(() => validateModelFile({ name: 'lamp.step', size: 12 })).toThrow('Only .glb and .gltf');
    expect(() => validateModelFile({ name: 'empty.glb', size: 0 })).toThrow('empty');
    expect(() => validateModelFile({ name: 'large.glb', size: MAX_MODEL_FILE_SIZE + 1 })).toThrow(
      'local limit',
    );
  });

  it('uses a serializable default camera state', () => {
    expect(JSON.parse(JSON.stringify(defaultCameraState()))).toEqual(defaultCameraState());
  });
});
