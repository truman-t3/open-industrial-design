import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { changeProjection, fitCamera, REVIEW_FOV, updateClipping } from './camera';
import type { ModelBoundsInfo, ViewerPreset } from './adapter';

const presets: ViewerPreset[] = ['perspective', 'front', 'rear', 'left', 'right', 'top', 'bottom'];
function bounds(scale: number): ModelBoundsInfo {
  const min: [number, number, number] = [90 * scale, -30 * scale, 15 * scale];
  const max: [number, number, number] = [94 * scale, -28 * scale, 16 * scale];
  return {
    min,
    max,
    center: [92 * scale, -29 * scale, 15.5 * scale],
    size: [4 * scale, 2 * scale, scale],
    radius: (Math.sqrt(21) / 2) * scale,
  };
}

describe('scale-aware review cameras', () => {
  for (const scale of [0.00001, 1, 10000])
    for (const [width, height] of [
      [300, 900],
      [1600, 600],
    ]) {
      it(`fits all corners in both projections at scale ${scale}, ${width}x${height}`, () => {
        const model = bounds(scale!);
        for (const mode of ['perspective', 'orthographic'] as const)
          for (const preset of presets) {
            const pose = fitCamera(model, preset, mode, width!, height!);
            const camera =
              mode === 'perspective'
                ? new PerspectiveCamera(REVIEW_FOV, width! / height!)
                : new OrthographicCamera(-width! / 2, width! / 2, height! / 2, -height! / 2);
            camera.position.set(...pose.position);
            camera.zoom = pose.zoom ?? 1;
            camera.lookAt(new Vector3(...pose.target));
            updateClipping(camera, model);
            camera.updateMatrixWorld();
            for (const x of [model.min[0], model.max[0]])
              for (const y of [model.min[1], model.max[1]])
                for (const z of [model.min[2], model.max[2]]) {
                  const point = new Vector3(x, y, z).project(camera);
                  expect(Math.abs(point.x)).toBeLessThan(1);
                  expect(Math.abs(point.y)).toBeLessThan(1);
                  expect(Math.abs(point.z)).toBeLessThan(1);
                }
          }
      });
    }
  it('preserves direction, target and apparent scale when changing projection and back', () => {
    const camera = new PerspectiveCamera(REVIEW_FOV, 2);
    const target = new Vector3(120, -50, 30);
    camera.position.copy(target).add(new Vector3(3, 5, 7));
    camera.lookAt(target);
    const original = camera.position.clone();
    const ortho = changeProjection(camera, target, 'orthographic', 1200, 600);
    expect(ortho.position.toArray()).toEqual(original.toArray());
    const restored = changeProjection(ortho, target, 'perspective', 1200, 600);
    expect(restored.position.distanceTo(original)).toBeLessThan(1e-10);
    expect(camera.position.toArray()).toEqual(original.toArray());
  });
});
