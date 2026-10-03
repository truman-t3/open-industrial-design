// SPDX-License-Identifier: MPL-2.0
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Adapter only: camera persistence remains owned by CameraDirector. */
export function ViewerOrbitControls() {
  const camera = useThree((state) => state.camera);
  const element = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const get = useThree((state) => state.get);
  const set = useThree((state) => state.set);
  const active = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const previous = get().controls;
    const controls = new OrbitControls(camera, element);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    const onChange = () => invalidate();
    controls.addEventListener('change', onChange);
    active.current = controls;
    set({ controls });
    invalidate();
    return () => {
      controls.removeEventListener('change', onChange);
      controls.dispose();
      if (active.current === controls) active.current = null;
      if (get().controls === controls) set({ controls: previous });
    };
  }, [camera, element, get, invalidate, set]);

  useFrame(() => {
    if (active.current?.enabled) active.current.update();
  }, -1);
  return null;
}
