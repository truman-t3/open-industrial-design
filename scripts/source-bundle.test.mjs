// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import {
  assertSourcePath,
  createSourceBundle,
  verifySourceBundle,
  verifyPublishedArchive,
  verifyPublishedSource,
} from './source-bundle.mjs';
const { unzipSync, zipSync } = createRequire(
  new URL('../packages/project-file/package.json', import.meta.url),
)('fflate');

test('published source must match every local file at an immutable commit', () => {
  const commit = 'a'.repeat(40);
  const prefix = `open-industrial-design-${commit}/`;
  const data = Buffer.from('source');
  const zip = zipSync({ [prefix + 'LICENSE']: data });
  const result = verifyPublishedArchive(zip, commit, ['LICENSE'], () => data);
  assert.equal(result.status, 'ANONYMOUS_SOURCE_BYTES_VERIFIED');
  assert.equal(result.files, 1);
  assert.throws(() => verifyPublishedArchive(zip, 'main', ['LICENSE'], () => data), /immutable/);
  assert.throws(
    () => verifyPublishedArchive(zip, commit, ['LICENSE'], () => Buffer.from('changed')),
    /differs/,
  );
  assert.throws(
    () => verifyPublishedArchive(zip, commit, ['LICENSE', 'README.md'], () => data),
    /Missing/,
  );
  assert.throws(() => verifyPublishedArchive(zip, commit, ['README.md'], () => data), /Unexpected/);
});

test('published archive rejects traversal, wrong roots and excessive input', () => {
  const commit = 'b'.repeat(40),
    prefix = `open-industrial-design-${commit}/`;
  for (const name of ['wrong/LICENSE', prefix + '../LICENSE', prefix + '.env']) {
    assert.throws(() =>
      verifyPublishedArchive(zipSync({ [name]: Buffer.from('x') }), commit, ['LICENSE'], () =>
        Buffer.from('x'),
      ),
    );
  }
  assert.throws(
    () =>
      verifyPublishedArchive(new Uint8Array(64 * 1024 * 1024 + 1), commit, ['LICENSE'], () =>
        Buffer.from('x'),
      ),
    /too large/,
  );
});

test('anonymous source lookup rejects HTTP failure and mutable refs without auth', async () => {
  let calls = 0;
  const request = async (url, options) => {
    calls++;
    assert.match(
      url,
      /^https:\/\/codeload.github.com\/truman-t3\/open-industrial-design\/zip\/[a-f0-9]{40}$/,
    );
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return new Response('not found', { status: 404 });
  };
  await assert.rejects(verifyPublishedSource('.', 'main', request), /immutable/);
  assert.equal(calls, 0);
  await assert.rejects(verifyPublishedSource('.', 'c'.repeat(40), request), /download failed/);
  assert.equal(calls, 1);
});

test('source path policy rejects data, credentials and traversal', () => {
  for (const path of [
    '../LICENSE',
    '/LICENSE',
    'C:/data',
    'apps\\web',
    'a//b',
    'a/./b',
    'a/.. /b',
    '.env',
    'apps/.env.local',
    'apps/.npmrc',
    'src/credentials.json',
    'backup.oidproj',
    'debug.log',
    'x/private.pem',
    'artifacts/a.ts',
    'x/node_modules/a.ts',
    '.aws/a',
  ])
    assert.throws(() => assertSourcePath(path));
  for (const path of ['LICENSE', 'pnpm-lock.yaml', 'packages/ui/src/index.tsx'])
    assert.doesNotThrow(() => assertSourcePath(path));
});

test('exact allowlist, deterministic bytes, missing file, duplicate file and tamper checks', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-source-test-'));
  try {
    writeFileSync(join(root, 'LICENSE'), 'fixture license');
    writeFileSync(join(root, '.env'), 'excluded sentinel');
    const paths = ['LICENSE'];
    const first = createSourceBundle(root, paths);
    assert.equal(first.sha256, createSourceBundle(root, paths).sha256);
    const files = unzipSync(first.bytes);
    assert.deepEqual(Object.keys(files).sort(), ['LICENSE', 'SOURCE_BUNDLE_MANIFEST.json']);
    assert.equal(verifySourceBundle(first.bytes, paths).files.length, 1);
    assert.throws(() => createSourceBundle(root, ['LICENSE', 'LICENSE']));
    assert.throws(() => createSourceBundle(root, ['missing.ts']));
    files.LICENSE[0] ^= 1;
    assert.throws(() => verifySourceBundle(zipSync(files), paths), /integrity/);
    files['extra.txt'] = new Uint8Array([1]);
    assert.throws(() => verifySourceBundle(zipSync(files), paths), /file set/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('linked source parents are refused, not followed', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-source-link-test-'));
  try {
    mkdirSync(join(root, 'real'));
    writeFileSync(join(root, 'real/a.ts'), 'fixture');
    symlinkSync(join(root, 'real'), join(root, 'link'), 'junction');
    assert.throws(() => createSourceBundle(root, ['link/a.ts']), /linked parents/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('repository allowlist preserves all workspace manifests and core build inputs', () => {
  const paths = JSON.parse(readFileSync(new URL('./source-files.json', import.meta.url), 'utf8'));
  for (const file of paths) assertSourcePath(file);
  assert.equal(new Set(paths).size, paths.length);
  for (const file of [
    'LICENSE',
    'manifest.json',
    'DCO.txt',
    'SOURCE_LICENSE.md',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'apps/web/runtime-assets.mjs',
    'vendor/draco/1.5.5/LICENSE.txt',
    'scripts/source-files.json',
    'packages/three-viewer/src/fixtures/minimal-triangle.glb',
  ])
    assert(paths.includes(file), file);
  for (const name of [
    'actions',
    'ai-core',
    'ai-openai-compatible',
    'canvas',
    'core',
    'design-model',
    'project-file',
    'storage',
    'three-viewer',
    'ui',
  ])
    assert(paths.includes(`packages/${name}/package.json`));
});
