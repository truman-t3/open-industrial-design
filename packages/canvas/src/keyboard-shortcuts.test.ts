// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCanvasRuntimeStore } from './index';
import { resolveCanvasShortcut } from './interaction';

function shortcut(
  key: string,
  selectedNodeCount: number,
  options: Partial<KeyboardEventInit> = {},
  target: EventTarget | null = null,
) {
  const event = new KeyboardEvent('keydown', { key, ...options });
  Object.defineProperty(event, 'target', { value: target });
  return resolveCanvasShortcut(event, selectedNodeCount);
}

describe('canvas keyboard shortcuts', () => {
  beforeEach(() => useCanvasRuntimeStore.getState().clearSelection());
  afterEach(() => document.body.replaceChildren());

  it('cancels a connection with Escape without invoking a node action', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(resolveCanvasShortcut(event, 1, true)).toEqual({
      action: 'cancel-connection',
      preventDefault: true,
    });
    expect(resolveCanvasShortcut(event, 1, false)).toEqual({ preventDefault: false });
  });

  it('does not mutate nodes or history while drawing a connection', () => {
    for (const key of ['Delete', 'Backspace', 'd', 'z']) {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: true });
      expect(resolveCanvasShortcut(event, 1, true)).toEqual({ preventDefault: false });
    }
  });

  it.each(['native', 'custom'])(
    'isolates background shortcuts while a %s dialog is open',
    (kind) => {
      const dialog = document.createElement(kind === 'native' ? 'dialog' : 'section');
      if (kind === 'native') dialog.setAttribute('open', '');
      else dialog.setAttribute('role', 'dialog');
      const button = document.createElement('button');
      dialog.append(button);
      document.body.append(dialog);
      for (const target of [button, document.body]) {
        for (const key of ['Delete', 'Backspace', 'd', 'z']) {
          expect(shortcut(key, 1, { ctrlKey: true }, target)).toEqual({ preventDefault: false });
        }
      }
    },
  );

  it('keeps shortcuts available when native dialogs are closed or custom dialogs are hidden', () => {
    const dialog = document.createElement('dialog');
    const hidden = document.createElement('section');
    hidden.setAttribute('role', 'dialog');
    hidden.hidden = true;
    document.body.append(dialog, hidden);
    expect(shortcut('Delete', 1).action).toBe('delete');
  });

  it('respects keys already consumed by another control', () => {
    const event = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true });
    event.preventDefault();
    expect(resolveCanvasShortcut(event, 1)).toEqual({ preventDefault: false });
  });

  it('ignores legacy IME composition markers', () => {
    const event = new KeyboardEvent('keydown', { key: 'Delete' });
    Object.defineProperty(event, 'keyCode', { value: 229 });
    expect(resolveCanvasShortcut(event, 1)).toEqual({ preventDefault: false });
    expect(shortcut('Process', 1, { ctrlKey: true })).toEqual({ preventDefault: false });
  });

  it('protects plaintext-only editing and its descendants', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'plaintext-only');
    const child = document.createElement('span');
    editor.append(child);
    expect(shortcut('Delete', 1, {}, child)).toEqual({ preventDefault: false });
  });

  it('does not delete or duplicate the parent task when only a candidate is selected', () => {
    const runtime = useCanvasRuntimeStore.getState();
    runtime.select('task', false);
    runtime.selectCandidate('result-a');
    const selectedNodeCount = useCanvasRuntimeStore.getState().selectedIds.length;

    expect(shortcut('Delete', selectedNodeCount)).toEqual({
      action: undefined,
      preventDefault: false,
    });
    expect(shortcut('Backspace', selectedNodeCount)).toEqual({
      action: undefined,
      preventDefault: false,
    });
    expect(shortcut('d', selectedNodeCount, { ctrlKey: true })).toEqual({
      action: undefined,
      preventDefault: true,
    });
  });

  it('applies delete and duplicate only to selected canvas nodes', () => {
    useCanvasRuntimeStore.getState().select('node-a', false);
    const selectedNodeCount = useCanvasRuntimeStore.getState().selectedIds.length;

    expect(shortcut('Delete', selectedNodeCount).action).toBe('delete');
    expect(shortcut('Backspace', selectedNodeCount).action).toBe('delete');
    expect(shortcut('d', selectedNodeCount, { metaKey: true }).action).toBe('duplicate');
  });

  it('does not hijack typing, rich text editing, or IME composition', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const textbox = document.createElement('div');
    textbox.setAttribute('role', 'textbox');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const editableChild = document.createElement('span');
    editable.append(editableChild);

    for (const target of [input, textarea, select, textbox, editable, editableChild]) {
      expect(shortcut('d', 1, { ctrlKey: true }, target)).toEqual({
        preventDefault: false,
      });
    }
    expect(shortcut('Delete', 1, { isComposing: true })).toEqual({
      preventDefault: false,
    });
  });

  it('keeps undo and redo shortcuts available and consumes browser defaults', () => {
    expect(shortcut('z', 0, { ctrlKey: true })).toEqual({
      action: 'undo',
      preventDefault: true,
    });
    expect(shortcut('z', 0, { metaKey: true, shiftKey: true })).toEqual({
      action: 'redo',
      preventDefault: true,
    });
  });
});
