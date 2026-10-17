// SPDX-License-Identifier: MPL-2.0
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import type { CameraState } from '@open-industrial-design/design-model';
import type { ModelBoundsInfo, ViewerPreset } from './adapter';

export type ReviewCamera = PerspectiveCamera | OrthographicCamera;
export const REVIEW_FOV = 42;

export function fitCamera(
  bounds: ModelBoundsInfo,
  preset: ViewerPreset,
  mode: CameraState['mode'],
  width: number,
  height: number,
): CameraState {
  const directions: Record<ViewerPreset, [number, number, number]> = {
    perspective: [1, 0.65, 1],
    front: [0, 0, 1],
    rear: [0, 0, -1],
    side: [1, 0, 0],
    right: [1, 0, 0],
    left: [-1, 0, 0],
    top: [0, 1, 0.000001],
    bottom: [0, -1, 0.000001],
  };
  const radius = Math.max(bounds.radius, 1e-8);
  const halfFov = (REVIEW_FOV * Math.PI) / 360;
  const limitingAngle = Math.min(halfFov, Math.atan((Math.tan(halfFov) * width) / height));
  const distance = (radius * 1.15) / Math.sin(limitingAngle);
  const direction = new Vector3(...directions[preset]).normalize();
  const position = new Vector3(...bounds.center).addScaledVector(direction, distance);
  return {
    mode,
    position: position.toArray(),
    target: [...bounds.center],
    zoom: mode === 'orthographic' ? Math.min(width, height) / (radius * 2 * 1.15) : 1,
    // New views persist through coordinates; keep the existing portable schema's enum.
    ...(preset === 'right'
      ? { preset: 'side' as const }
      : preset === 'left' || preset === 'bottom'
        ? {}
        : { preset }),
  };
}

export function changeProjection(
  current: ReviewCamera,
  target: Vector3,
  mode: CameraState['mode'],
  width: number,
  height: number,
): ReviewCamera {
  const direction = current.position.clone().sub(target);
  const distance = Math.max(direction.length(), 1e-8);
  const span =
    current instanceof OrthographicCamera
      ? (current.top - current.bottom) / current.zoom
      : (2 * distance * Math.tan((current.fov * Math.PI) / 360)) / current.zoom;
  const next =
    mode === 'orthographic'
      ? new OrthographicCamera(
          -width / 2,
          width / 2,
          height / 2,
          -height / 2,
          current.near,
          current.far,
        )
      : new PerspectiveCamera(REVIEW_FOV, width / height, current.near, current.far);
  next.position.copy(current.position);
  next.up.copy(current.up);
  if (next instanceof OrthographicCamera) next.zoom = height / span;
  else
    next.position
      .copy(target)
      .addScaledVector(direction.normalize(), span / (2 * Math.tan((REVIEW_FOV * Math.PI) / 360)));
  next.lookAt(target);
  next.updateProjectionMatrix();
  return next;
}

export function updateClipping(camera: ReviewCamera, bounds: ModelBoundsInfo) {
  const radius = Math.max(bounds.radius, 1e-8);
  const distance = camera.position.distanceTo(new Vector3(...bounds.center));
  camera.near = Math.max(radius * 0.00001, distance - radius * 3);
  camera.far = Math.max(distance + radius * 6, radius * 10);
  camera.updateProjectionMatrix();
}
