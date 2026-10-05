// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function screen(host, check) {
  const dom = new JSDOM(
    readFileSync(new URL('../../apps/desktop/installer-dist/index.html', import.meta.url), 'utf8'),
  );
  const saved = new Map();
  dom.window.__TAURI__ = host;
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    matchMedia: () => ({ matches: false }),
    fetch: async () => ({ text: async () => 'MPL fixture' }),
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  try {
    const module = new URL('../../apps/desktop/installer-dist/app.mjs', import.meta.url);
    module.search = `test=${Math.random()}`;
    await import(module.href);
    await check(dom.window.document);
  } finally {
    for (const [key, value] of saved) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
}
function host() {
  const bridge = {
    event: {
      listen: async (_name, callback) => {
        bridge.progress = callback;
      },
    },
    calls: [],
  };
  bridge.core = {
    invoke: async (name, args) => {
      bridge.calls.push([name, args]);
      if (name === 'configuration') return ['G:\\Installation fixture', '0.1.0-alpha.2'];
      if (name === 'install') {
        bridge.runId = args.runId;
        return new Promise((resolve, reject) => {
          bridge.finish = resolve;
          bridge.fail = reject;
        });
      }
      if (name === 'cancel_install') return true;
    },
  };
  return bridge;
}
test('browser preview cannot install or claim a successful installation', async () => {
  await screen(undefined, async (document) => {
    assert.equal(document.getElementById('primary').disabled, true);
    assert.match(document.getElementById('status').textContent, /浏览器预览不会安装/);
    assert.equal(document.body.dataset.phase, 'idle');
  });
});
test('installer UI waits for native success, ignores other runs and does not invent progress', async () => {
  const native = host();
  await screen(native, async (document) => {
    const primary = document.getElementById('primary');
    primary.click();
    await tick();
    assert.equal(primary.disabled, true);
    native.progress({ payload: ['different-run', 1, 'verifying', 0, 0] });
    assert.match(document.getElementById('status').textContent, /检查安装环境/);
    native.progress({ payload: [native.runId, 1, 'extracting', 1, 2] });
    assert.equal(document.getElementById('percent').textContent, '50%');
    native.progress({ payload: [native.runId, 2, 'installing', 0, 0] });
    assert.equal(document.getElementById('progress').hasAttribute('value'), false);
    assert.equal(document.getElementById('cancel').hidden, true);
    assert.ok(!native.calls.some(([name]) => name === 'launch_installed'));
    native.finish();
    await tick();
    assert.equal(primary.textContent, '开始设计');
    assert.equal(document.body.dataset.phase, 'complete');
    primary.click();
    await tick();
    assert.equal(native.calls.filter(([name]) => name === 'launch_installed').length, 1);
  });
});
test('native failure cannot enable launch or expose arbitrary backend text', async () => {
  const native = host();
  await screen(native, async (document) => {
    document.getElementById('primary').click();
    await tick();
    native.fail('private backend diagnostic');
    await tick();
    assert.equal(document.body.dataset.phase, 'failed');
    assert.equal(document.getElementById('primary').textContent, '重试安装');
    assert.ok(!document.body.textContent.includes('private backend diagnostic'));
    assert.ok(!native.calls.some(([name]) => name === 'launch_installed'));
  });
});
