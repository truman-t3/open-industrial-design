import type { BaseNode, GroupNode } from './index';

/** Flat groups deliberately disallow nesting, shared members and cross-board membership. */
export function validateCanvasGroups(nodes: readonly BaseNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const assigned = new Set<string>();
  for (const node of nodes) {
    if (node.type !== 'group') continue;
    const group = node as GroupNode;
    if (
      !Array.isArray(group.childNodeIds) ||
      group.rotation !== 0 ||
      typeof group.label !== 'string'
    )
      throw new Error('Invalid Canvas group.');
    for (const id of group.childNodeIds) {
      const member = byId.get(id);
      if (
        !member ||
        member.type === 'group' ||
        member.boardId !== group.boardId ||
        assigned.has(id)
      )
        throw new Error('Group members must be unique, non-group nodes on the same board.');
      assigned.add(id);
    }
  }
}

function bounds(nodes: readonly BaseNode[]) {
  const points = nodes.flatMap((node) => {
    const angle = (node.rotation * Math.PI) / 180;
    return [
      [0, 0],
      [node.width, 0],
      [0, node.height],
      [node.width, node.height],
    ].map(([x, y]) => ({
      x: node.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: node.y + x * Math.sin(angle) + y * Math.cos(angle),
    }));
  });
  const x = Math.min(...points.map((p) => p.x)) - 20;
  const y = Math.min(...points.map((p) => p.y)) - 44;
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) + 20 - x,
    height: Math.max(...points.map((p) => p.y)) + 20 - y,
  };
}

/** Refit frames after independent member edits/deletion, without changing membership by proximity. */
export function reconcileCanvasGroups<T extends BaseNode>(nodes: T[]): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    if (node.type !== 'group') return node;
    const group = node as unknown as GroupNode;
    const childNodeIds = group.childNodeIds.filter((id) => byId.has(id));
    const members = childNodeIds.map((id) => byId.get(id)!);
    return { ...node, childNodeIds, ...(members.length ? bounds(members) : {}) };
  });
}

export function createCanvasGroup(
  nodes: readonly BaseNode[],
  ids: readonly string[],
  id: string,
  label: string,
  now: number,
): GroupNode {
  validateCanvasGroups(nodes);
  const selected = new Set(ids);
  const members = nodes.filter((node) => selected.has(node.id));
  const occupied = new Set(
    nodes
      .filter((node) => node.type === 'group')
      .flatMap((node) => (node as GroupNode).childNodeIds),
  );
  if (
    members.length < 2 ||
    members.length !== selected.size ||
    nodes.some((node) => node.id === id) ||
    members.some(
      (node) =>
        node.type === 'group' ||
        node.locked ||
        occupied.has(node.id) ||
        node.boardId !== members[0].boardId,
    )
  )
    throw new Error('Select at least two unlocked, ungrouped nodes on one board.');
  return {
    id,
    type: 'group',
    boardId: members[0].boardId,
    label,
    childNodeIds: members.map((node) => node.id),
    ...bounds(members),
    rotation: 0,
    zIndex: Math.min(...members.map((node) => node.zIndex)) - 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** One move transaction; preview callers do not persist until pointer release. */
export function moveCanvasNode<T extends BaseNode>(
  nodes: T[],
  id: string,
  x: number,
  y: number,
): T[] {
  const source = nodes.find((node) => node.id === id);
  if (!source || source.locked || !Number.isFinite(x) || !Number.isFinite(y)) return nodes;
  const members = source.type === 'group' ? (source as unknown as GroupNode).childNodeIds : [];
  if (nodes.some((node) => members.includes(node.id) && node.locked)) return nodes;
  const moving = new Set([id, ...members]);
  return reconcileCanvasGroups(
    nodes.map((node) =>
      moving.has(node.id) ? { ...node, x: node.x + x - source.x, y: node.y + y - source.y } : node,
    ),
  );
}
