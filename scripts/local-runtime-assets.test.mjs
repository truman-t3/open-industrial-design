import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntimeAssets } from '../apps/web/runtime-assets.mjs';
import {
  readLiberationReplacement,
  replacedFont,
  sketchFontDirectory,
} from './liberation-font.mjs';
import { fileURLToPath } from 'node:url';

test('production emits reviewed fonts with the OFL replacement and no legacy font bytes', () => {
  const emitted = new Map();
  localRuntimeAssets().generateBundle.call({
    emitFile: ({ fileName, source }) => emitted.set(fileName, source),
  });
  const registry = JSON.parse(
    readFileSync(new URL('../licenses/runtime-notice-evidence.json', import.meta.url), 'utf8'),
  );
  assert.equal(emitted.size, 260);
  const replacement = readLiberationReplacement(fileURLToPath(new URL('../', import.meta.url)));
  assert.ok(
    readFileSync(new URL('../apps/web/src/runtime-assets.ts', import.meta.url), 'utf8').includes(
      'excalidraw-ofl-v1/',
    ),
  );
  const imageRegistry = JSON.parse(
    readFileSync(new URL('../licenses/release-assets.json', import.meta.url)),
  );
  for (const image of imageRegistry.images) {
    if (image.role === 'reference-only') assert.equal(emitted.has(image.file), false);
    else
      assert.equal(
        createHash('sha256').update(emitted.get(image.file)).digest('hex'),
        image.sha256,
      );
  }
  for (const font of registry.files) {
    const bytes = emitted.get(`${sketchFontDirectory}/fonts/${font.file}`);
    const expected = font.file === replacedFont ? replacement : font;
    assert.equal(bytes.length, expected.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
    assert.equal(emitted.has(`runtime/excalidraw/fonts/${font.file}`), false);
    if (font.file === replacedFont)
      assert.ok(
        [...emitted.values()].every(
          (value) => createHash('sha256').update(value).digest('hex') !== font.sha256,
        ),
      );
  }
  assert.match(
    emitted.get(`${sketchFontDirectory}/fonts/Liberation/LICENSE.txt`).toString(),
    /SIL OPEN FONT LICENSE Version 1\.1/,
  );
  assert.equal(emitted.get('runtime/draco/1.5.5/LICENSE.txt').toString(), registry.draco.text);
  assert.equal(emitted.get('runtime/draco/1.5.5/draco_decoder.wasm').length, 283091);
});

test('changed replacement font or license bytes fail closed before bundling', () => {
  const repo = fileURLToPath(new URL('../', import.meta.url));
  for (const name of ['.ttf', '.woff2', 'COPYRIGHT.txt'])
    assert.throws(
      () =>
        readLiberationReplacement(repo, (path) =>
          path.endsWith(name) ? Buffer.from('tampered') : readFileSync(path),
        ),
      /integrity failed/,
    );
});

test('development serves binary assets under the configured base and passes unrelated routes through', () => {
  let handler;
  localRuntimeAssets().configureServer({
    config: { base: '/design/' },
    middlewares: {
      use: (value) => {
        handler = value;
      },
    },
  });
  const headers = {};
  let body;
  let passed = 0;
  const response = {
    setHeader: (name, value) => {
      headers[name] = value;
    },
    end: (value) => {
      body = value;
    },
  };
  handler({ url: '/design/runtime/draco/1.5.5/draco_decoder.wasm?test' }, response, () => passed++);
  assert.equal(headers['Content-Type'], 'application/wasm');
  assert.equal(body.length, 283091);
  handler({ url: '/design/runtime/../../LICENSE' }, response, () => passed++);
  handler({ url: '/runtime/draco/1.5.5/draco_decoder.wasm' }, response, () => passed++);
  assert.equal(passed, 2);
  handler(
    { url: '/design/logo/open-industrial-design-logo-primary.png' },
    response,
    () => passed++,
  );
  assert.equal(headers['Content-Type'], 'image/png');
  assert.ok(body.length > 0);
  handler(
    { url: '/design/social/open-industrial-design-brand-kit-board.png' },
    response,
    () => passed++,
  );
  handler(
    { url: '/design/social/open-industrial-design-brand-guide-board.png' },
    response,
    () => passed++,
  );
  assert.equal(passed, 4);
});
