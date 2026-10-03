import type {
  Asset,
  CameraState,
  JsonObject,
  Model3DNode,
} from '@open-industrial-design/design-model';

export const MAX_MODEL_FILE_SIZE = 150 * 1024 * 1024;

export type ModelFormat = 'glb' | 'gltf';
export type ViewerPreset = 'perspective' | 'front' | 'side' | 'rear' | 'top';

export interface ModelFileLike {
  name: string;
  size: number;
  type?: string;
}

export interface ValidatedModelFile {
  format: ModelFormat;
  mimeType: 'model/gltf-binary' | 'model/gltf+json';
}

export interface ModelBoundsInfo {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
  radius: number;
}

export interface ModelInspection {
  bounds: ModelBoundsInfo;
  meshCount: number;
}

export function validateModelFile(file: ModelFileLike): ValidatedModelFile {
  if (!file.name.trim()) throw new Error('A 3D model file name is required.');
  if (file.size <= 0) throw new Error('The 3D model file is empty.');
  if (file.size > MAX_MODEL_FILE_SIZE)
    throw new Error(
      `The 3D model exceeds the ${MAX_MODEL_FILE_SIZE / 1024 / 1024} MB local limit.`,
    );
  const extension = file.name.toLowerCase().split('.').at(-1);
  if (extension === 'glb') return { format: 'glb', mimeType: 'model/gltf-binary' };
  if (extension === 'gltf') return { format: 'gltf', mimeType: 'model/gltf+json' };
  throw new Error('Only .glb and .gltf models are supported in this viewer.');
}

export function createModelMetadata(format: ModelFormat, fileName: string): JsonObject {
  return { format, sourceFileName: fileName };
}

export function getModelFormat(asset: Asset): ModelFormat | undefined {
  const format = asset.metadata?.format;
  return format === 'glb' || format === 'gltf' ? format : undefined;
}

export function defaultCameraState(): CameraState {
  return {
    mode: 'perspective',
    position: [3, 2.2, 3],
    target: [0, 0, 0],
    preset: 'perspective',
  };
}

export function isModel3DNode(node: Model3DNode | { type: string }): node is Model3DNode {
  return node.type === 'model3d';
}
