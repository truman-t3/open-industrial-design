import { describe, expect, it } from 'vitest';
import { readPromptLibrary, savePromptPreset, deletePromptPreset } from './prompt-library-store';
const fixture = { id: 'one', name: 'Finish', direction: 'Keep shape', notes: 'Matte' };
function memory() {
  let raw: string | null = null;
  return {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
}
describe('personal prompt library', () => {
  it('persists exact prompt text, updates by ID, and deletes without storing provider fields', () => {
    const store = memory();
    savePromptPreset(store, {
      ...fixture,
      apiKey: 'must-not-persist',
      providerId: 'private',
    } as typeof fixture);
    expect(readPromptLibrary(store)).toEqual([fixture]);
    expect(store.getItem()).not.toContain('must-not-persist');
    savePromptPreset(store, { ...fixture, name: 'Updated' });
    expect(readPromptLibrary(store)).toEqual([{ ...fixture, name: 'Updated' }]);
    expect(deletePromptPreset(store, 'one')).toEqual([]);
  });
  it('rejects corrupted or future data and preserves it rather than resetting', () => {
    for (const raw of ['bad', 'null', '{"version":2,"items":[]}', '{"version":1,"items":[{}]}']) {
      const store = memory();
      store.setItem('', raw);
      expect(() => savePromptPreset(store, fixture)).toThrow();
      expect(() => deletePromptPreset(store, 'one')).toThrow();
      expect(store.getItem()).toBe(raw);
    }
  });
  it('rejects invalid input and capacity overflow before changing storage', () => {
    const store = memory();
    for (let i = 0; i < 100; i++) savePromptPreset(store, { ...fixture, id: String(i) });
    const before = store.getItem();
    expect(() => savePromptPreset(store, fixture)).toThrow();
    expect(() => savePromptPreset(store, { ...fixture, direction: ' ' })).toThrow();
    expect(() => savePromptPreset(store, { ...fixture, notes: 'a'.repeat(10001) })).toThrow();
    expect(store.getItem()).toBe(before);
    expect(savePromptPreset(store, { ...fixture, id: '0' })).toHaveLength(100);
  });
  it('surfaces storage failure without reporting successful persistence', () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw Error('quota');
      },
    };
    expect(() => savePromptPreset(store, fixture)).toThrow('quota');
  });
});
