// SPDX-License-Identifier: MPL-2.0
export interface PromptPreset {
  id: string;
  name: string;
  direction: string;
  notes: string;
}
const key = 'oid.prompt-library.v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function normalize(item: PromptPreset): PromptPreset {
  if (
    !item ||
    typeof item.id !== 'string' ||
    !item.id ||
    typeof item.name !== 'string' ||
    !item.name.trim() ||
    item.name.length > 80 ||
    typeof item.direction !== 'string' ||
    !item.direction.trim() ||
    item.direction.length > 10000 ||
    typeof item.notes !== 'string' ||
    item.notes.length > 10000
  )
    throw new Error('Invalid prompt preset');
  // Explicit allowlist: provider configuration and unknown fields never persist.
  return { id: item.id, name: item.name.trim(), direction: item.direction, notes: item.notes };
}
export function readPromptLibrary(store: Store): PromptPreset[] {
  const raw = store.getItem(key);
  if (!raw) return [];
  if (raw.length > 2200000) throw new Error('Prompt library too large');
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1 || !Array.isArray(parsed.items) || parsed.items.length > 100)
    throw new Error('Unsupported prompt library');
  const items = parsed.items.map(normalize) as PromptPreset[];
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error('Duplicate prompt IDs');
  return items;
}
export function savePromptPreset(store: Store, preset: PromptPreset): PromptPreset[] {
  const next = normalize(preset);
  const items = readPromptLibrary(store);
  const existing = items.findIndex((item) => item.id === next.id);
  if (existing >= 0) items[existing] = next;
  else {
    if (items.length >= 100) throw new Error('Prompt library limit');
    items.unshift(next);
  }
  const serialized = JSON.stringify({ version: 1, items });
  if (serialized.length > 2200000) throw new Error('Prompt library too large');
  store.setItem(key, serialized);
  return items;
}
export function deletePromptPreset(store: Store, id: string): PromptPreset[] {
  const items = readPromptLibrary(store).filter((item) => item.id !== id);
  store.setItem(key, JSON.stringify({ version: 1, items }));
  return items;
}
