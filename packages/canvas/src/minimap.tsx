// SPDX-License-Identifier: MPL-2.0
import { useState } from 'react';
import type { Viewport } from '@open-industrial-design/design-model';
import { translate, type AppLocale } from '@open-industrial-design/core';

type MapNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden?: boolean;
  rotation?: number;
};

export function centerMinimapNode(
  node: MapNode,
  viewport: Viewport,
  size: { width: number; height: number },
): Viewport {
  const angle = ((node.rotation ?? 0) * Math.PI) / 180;
  const x = node.x + (node.width / 2) * Math.cos(angle) - (node.height / 2) * Math.sin(angle);
  const y = node.y + (node.width / 2) * Math.sin(angle) + (node.height / 2) * Math.cos(angle);
  return {
    ...viewport,
    x: size.width / 2 - x * viewport.zoom,
    y: size.height / 2 - y * viewport.zoom,
  };
}

export function minimapBounds(
  nodes: readonly MapNode[],
  viewport: Viewport,
  size: { width: number; height: number },
) {
  const view = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: size.width / viewport.zoom,
    height: size.height / viewport.zoom,
  };
  let left = view.x,
    top = view.y,
    right = view.x + view.width,
    bottom = view.y + view.height;
  const visible = nodes.filter(
    (node) =>
      !node.hidden &&
      [node.x, node.y, node.width, node.height, node.rotation ?? 0].every(Number.isFinite) &&
      node.width > 0 &&
      node.height > 0,
  );
  for (const node of visible) {
    const angle = ((node.rotation ?? 0) * Math.PI) / 180;
    for (const [x, y] of [
      [0, 0],
      [node.width, 0],
      [0, node.height],
      [node.width, node.height],
    ]) {
      const px = node.x + x! * Math.cos(angle) - y! * Math.sin(angle);
      const py = node.y + x! * Math.sin(angle) + y! * Math.cos(angle);
      left = Math.min(left, px);
      top = Math.min(top, py);
      right = Math.max(right, px);
      bottom = Math.max(bottom, py);
    }
  }
  return {
    visible,
    view,
    x: left - 32,
    y: top - 32,
    width: Math.max(1, right - left + 64),
    height: Math.max(1, bottom - top + 64),
  };
}

/** Navigation only: never selects, moves or persists a design node. */
export function CanvasMinimap({
  nodes,
  viewport,
  size,
  onNavigate,
  disabled,
  locale,
}: {
  nodes: readonly MapNode[];
  viewport: Viewport;
  size: { width: number; height: number };
  onNavigate: (viewport: Viewport) => void;
  disabled: boolean;
  locale: AppLocale;
}) {
  const [expanded, setExpanded] = useState(false);
  const map = expanded ? minimapBounds(nodes, viewport, size) : undefined;
  return (
    <aside className="canvas-minimap">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {translate(locale, 'canvas.minimap')}
      </button>
      {map ? (
        <svg
          viewBox={`${map.x} ${map.y} ${map.width} ${map.height}`}
          role="group"
          aria-label={translate(locale, 'canvas.minimap')}
        >
          {map.visible.map((node, index) => (
            <rect
              key={node.id}
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              transform={`rotate(${node.rotation ?? 0} ${node.x} ${node.y})`}
              fill="#94a3b8"
              stroke="#fff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled}
              aria-label={`${translate(locale, 'canvas.locateNode')} ${index + 1}`}
              onClick={() => {
                if (!disabled) onNavigate(centerMinimapNode(node, viewport, size));
              }}
              onKeyDown={(event) => {
                if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  event.currentTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
              }}
            />
          ))}
          <rect
            {...map.view}
            fill="#2563ff"
            fillOpacity={0.07}
            stroke="#2563ff"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </svg>
      ) : null}
    </aside>
  );
}
