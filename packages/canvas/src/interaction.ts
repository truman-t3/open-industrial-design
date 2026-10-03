import {
  validateGenerationInput,
  type BaseNode,
  type Edge,
  type GenerationInputRole,
} from '@open-industrial-design/design-model';

export type ConnectionTarget = {
  nodeId: string;
  role: GenerationInputRole;
  valid: boolean;
};

export type CanvasInteractionMode = 'select' | 'pan';

export type CanvasShortcutAction =
  'delete' | 'duplicate' | 'undo' | 'redo' | 'cancel-connection' | 'start-pan';

export interface CanvasShortcutResolution {
  action?: CanvasShortcutAction;
  preventDefault: boolean;
}

/** Keeps editor shortcuts from hijacking text editing or acting on non-node selections. */
export function resolveCanvasShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'isComposing' | 'target'
  > &
    Partial<Pick<KeyboardEvent, 'defaultPrevented' | 'keyCode'>>,
  selectedNodeCount: number,
  connecting = false,
): CanvasShortcutResolution {
  const target = event.target;
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.key === 'Process' ||
    (typeof document !== 'undefined' &&
      document.querySelector(
        'dialog[open], [role="dialog"]:not([hidden]):not([aria-hidden="true"])',
      )) ||
    (typeof HTMLElement !== 'undefined' &&
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest(
          'input, textarea, select, [role="textbox"], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
        )))
  ) {
    return { preventDefault: false };
  }

  if (connecting) {
    return event.key === 'Escape'
      ? { action: 'cancel-connection', preventDefault: true }
      : { preventDefault: false };
  }

  if (event.key === ' ' && !event.ctrlKey && !event.metaKey) {
    if (
      typeof HTMLElement !== 'undefined' &&
      target instanceof HTMLElement &&
      target.closest('button, [role="button"], a[href]')
    )
      return { preventDefault: false };
    return { action: 'start-pan', preventDefault: true };
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    return {
      action: selectedNodeCount > 0 ? 'delete' : undefined,
      preventDefault: false,
    };
  }

  const hasModifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (hasModifier && key === 'd') {
    return {
      action: selectedNodeCount > 0 ? 'duplicate' : undefined,
      preventDefault: true,
    };
  }
  if (hasModifier && key === 'z') {
    return { action: event.shiftKey ? 'redo' : 'undo', preventDefault: true };
  }

  return { preventDefault: false };
}

export function canvasInteractionPolicy(mode: CanvasInteractionMode) {
  return {
    stageDraggable: mode === 'pan',
    nodesDraggable: mode === 'select',
    connectionsEnabled: mode === 'select',
  };
}

export interface GenerationCandidateOutputPosition {
  candidateId: string;
  generationNodeId: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CandidatePosition = { x: number; y: number };

/** Places persisted, unreviewed candidates as read-only Canvas previews near their task. */
export function layoutGenerationCandidateOutputs(
  nodes: readonly BaseNode[],
  candidates: readonly { id: string; generationNodeId: string }[],
  savedPositions: Readonly<Record<string, CandidatePosition>> = {},
): GenerationCandidateOutputPosition[] {
  const width = 176;
  const height = 140;
  const gap = 20;
  const occupied = nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));
  const countByGeneration = new Map<string, number>();
  const positions: GenerationCandidateOutputPosition[] = [];

  for (const candidate of candidates) {
    const source = nodes.find(
      (node) => node.id === candidate.generationNodeId && node.type === 'generation',
    );
    if (!source) continue;
    const index = countByGeneration.get(source.id) ?? 0;
    countByGeneration.set(source.id, index + 1);
    const persisted = nodes.find(
      (node) =>
        node.type === 'candidate' &&
        (node as BaseNode & { candidateId: string }).candidateId === candidate.id,
    );
    if (persisted) {
      positions.push({
        candidateId: candidate.id,
        generationNodeId: source.id,
        index,
        x: persisted.x,
        y: persisted.y,
        width: persisted.width,
        height: persisted.height,
      });
      continue;
    }
    let position: { x: number; y: number } | undefined = savedPositions[candidate.id];
    for (let column = 0; column < 8 && !position; column += 1) {
      for (let row = 0; row < 32 && !position; row += 1) {
        const x = source.x + source.width + 56 + column * (width + gap);
        const y = source.y + row * (height + gap);
        const intersects = occupied.some(
          (rect) =>
            x < rect.x + rect.width + 16 &&
            x + width + 16 > rect.x &&
            y < rect.y + rect.height + 16 &&
            y + height + 16 > rect.y,
        );
        if (!intersects) position = { x, y };
      }
    }
    position ??= {
      x: source.x + source.width + 56,
      y: source.y + 32 * (height + gap),
    };
    occupied.push({ ...position, id: candidate.id, width, height });
    positions.push({
      candidateId: candidate.id,
      generationNodeId: source.id,
      index,
      ...position,
      width,
      height,
    });
  }
  return positions;
}

/** Hit testing stays in board coordinates; visual ports are easier to reach than their drawn size. */
export function connectionTargetAt(
  nodes: readonly BaseNode[],
  edges: readonly Edge[],
  sourceNodeId: string,
  x: number,
  y: number,
  zoom: number,
): ConnectionTarget | undefined {
  const reach = 20 / zoom;
  for (const node of [...nodes].reverse()) {
    if (node.type !== 'generation') continue;
    const ports = [
      { role: 'base', y: 86 },
      { role: 'reference', y: 116 },
    ] as const;
    const nearPort = ports.find(
      (port) => Math.hypot(x - (node.x + 5), y - (node.y + port.y)) <= reach,
    );
    const insideCard =
      x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height;
    if (!nearPort && !insideCard) continue;
    const role =
      nearPort?.role ??
      (validateGenerationInput(nodes, edges, sourceNodeId, node.id, 'base') ? 'reference' : 'base');
    return {
      nodeId: node.id,
      role,
      valid: !validateGenerationInput(nodes, edges, sourceNodeId, node.id, role),
    };
  }
  return undefined;
}

export function connectionCurve(startX: number, startY: number, endX: number, endY: number) {
  const bend = Math.max(44, Math.abs(endX - startX) * 0.45);
  return [startX, startY, startX + bend, startY, endX - bend, endY, endX, endY];
}

export function verticalConnectionCurve(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const bend = Math.max(36, Math.abs(endY - startY) * 0.45);
  return [startX, startY, startX, startY + bend, endX, endY - bend, endX, endY];
}
