import type { Viewport } from '@open-industrial-design/design-model';

/** Render-only culling; selection, edges, layout and persistence still use all nodes. */
export function isCanvasNodeInView(
  node: { x: number; y: number; width: number; height: number; rotation?: number },
  viewport: Viewport,
  size: { width: number; height: number },
  margin = 192,
): boolean {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) return true;
  const rotated = Boolean(node.rotation);
  const radius = rotated ? Math.hypot(node.width, node.height) : 0;
  const left = (node.x - radius) * viewport.zoom + viewport.x;
  const top = (node.y - radius) * viewport.zoom + viewport.y;
  const right = (node.x + (rotated ? radius : node.width)) * viewport.zoom + viewport.x;
  const bottom = (node.y + (rotated ? radius : node.height)) * viewport.zoom + viewport.y;
  return (
    right >= -margin &&
    bottom >= -margin &&
    left <= size.width + margin &&
    top <= size.height + margin
  );
}

/** Bring a newly created card into view, including cards placed above or left of the viewport. */
export function revealCanvasNode(
  viewport: Viewport,
  node: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
): Viewport {
  const shift = (start: number, length: number, available: number, margin = 24) => {
    if (start < margin || length > available - margin * 2) return margin - start;
    return -Math.max(0, start + length - available + margin);
  };
  return {
    ...viewport,
    x:
      viewport.x +
      shift(node.x * viewport.zoom + viewport.x, node.width * viewport.zoom, size.width),
    y:
      viewport.y +
      shift(node.y * viewport.zoom + viewport.y, node.height * viewport.zoom, size.height, 64),
  };
}

export function zoomViewport(
  viewport: Viewport,
  zoom: number,
  anchor: { x: number; y: number },
): Viewport {
  const nextZoom = Math.min(4, Math.max(0.1, zoom));
  return {
    x: anchor.x - ((anchor.x - viewport.x) / viewport.zoom) * nextZoom,
    y: anchor.y - ((anchor.y - viewport.y) / viewport.zoom) * nextZoom,
    zoom: nextZoom,
  };
}

/** View-only framing: never changes node layout or selection. */
export function fitCanvasViewport(
  nodes: readonly {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    hidden?: boolean;
  }[],
  size: { width: number; height: number },
): Viewport | undefined {
  const visible = nodes.filter(
    (node) =>
      !node.hidden &&
      [node.x, node.y, node.width, node.height].every(Number.isFinite) &&
      node.width > 0 &&
      node.height > 0,
  );
  if (!visible.length || size.width <= 0 || size.height <= 0) return undefined;
  const corners = visible.flatMap((node) => {
    const angle = ((node.rotation ?? 0) * Math.PI) / 180;
    return [
      [0, 0],
      [node.width, 0],
      [0, node.height],
      [node.width, node.height],
    ].map(([x, y]) => ({
      x: node.x + x! * Math.cos(angle) - y! * Math.sin(angle),
      y: node.y + x! * Math.sin(angle) + y! * Math.cos(angle),
    }));
  });
  const left = Math.min(...corners.map((point) => point.x));
  const right = Math.max(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const bottom = Math.max(...corners.map((point) => point.y));
  const zoom = Math.min(
    1,
    Math.max(
      0.1,
      Math.min(
        Math.max(1, size.width - 64) / (right - left),
        Math.max(1, size.height - 112) / (bottom - top),
      ),
    ),
  );
  return {
    x: size.width / 2 - ((left + right) / 2) * zoom,
    y: size.height / 2 - ((top + bottom) / 2) * zoom,
    zoom,
  };
}
