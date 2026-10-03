// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { assertSourcePath, createSourceBundle, verifySourceBundle } from './source-bundle.mjs';
const { unzipSync, zipSync } = createRequire(
  new URL('../packages/project-file/package.json', import.meta.url),
)('fflate');

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
