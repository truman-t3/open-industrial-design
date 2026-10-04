// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { inspectPublication, inspectStagedPublication } from './publication-check.mjs';

test('public candidate excludes internal records, passes screening and resolves document file links', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const paths = JSON.parse(readFileSync(join(root, 'scripts/public-files.json'), 'utf8'));
  const registry = JSON.parse(readFileSync(join(root, 'licenses/release-assets.json'), 'utf8'));
  const references = registry.images
    .filter((item) => item.role === 'reference-only')
    .map((item) => `brand/${item.file}`);
  assert.deepEqual(inspectPublication(root, paths, references).issues, []);
  assert.ok(paths.includes('LICENSE') && paths.includes('pnpm-lock.yaml'));
  assert.ok(!paths.includes('docs/current-task.md'));
  const missing = [];
  for (const path of paths.filter((item) => item.endsWith('.md'))) {
    const body = readFileSync(join(root, path), 'utf8');
    for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(target)));
      if (!paths.includes(resolved)) missing.push(`${path} -> ${resolved}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('publication and source lists include every application and package source file', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const roots = [
    'apps/web/src',
    ...readdirSync(join(root, 'packages')).map((name) => `packages/${name}/src`),
  ];
  const files = roots.flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:[cm]?[jt]sx?|css)$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name).slice(root.length).replaceAll('\\', '/')),
  );
  for (const list of ['public-files.json', 'source-files.json']) {
    const allowed = JSON.parse(readFileSync(join(root, 'scripts', list), 'utf8'));
    assert.deepEqual(
      files.filter((file) => !allowed.includes(file)),
      [],
      `${list} omits source files`,
    );
  }
});

test('publication screening reports locations, never matched secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-publication-'));
  try {
    const fakeKey = 'ghp_' + 'x'.repeat(30);
    writeFileSync(
      join(root, 'a.ts'),
      `const token = '${fakeKey}';\n// ${'C:' + '/Users/example/test'}\n`,
    );
    const report = inspectPublication(root, ['a.ts', '.env']);
    assert.equal(report.status, 'BLOCKED');
    assert.deepEqual(
      report.issues.map((item) => item.code),
      ['credential-like', 'personal-path', 'unsafe-or-missing-file'],
    );
    assert.ok(!JSON.stringify(report).includes(fakeKey));
    writeFileSync(join(root, 'a.ts'), 'export const value = 1;');
    assert.equal(inspectPublication(root, ['a.ts']).issues.length, 0);
    assert.throws(() => inspectPublication(root, ['a.ts', 'a.ts']));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reference assets, internal records and linked parents block publication', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-publication-'));
  try {
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs/current-task.md'), 'internal');
    writeFileSync(join(root, 'board.png'), 'fixture');
    symlinkSync(join(root, 'docs'), join(root, 'linked'), 'junction');
    const report = inspectPublication(
      root,
      ['board.png', 'docs/current-task.md', 'linked/current-task.md'],
      ['board.png'],
    );
    assert.deepEqual(
      report.issues.map((item) => item.code),
      ['reference-only-material', 'internal-work-record', 'unsafe-or-missing-file'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('staged review catches stale index bytes and unapproved files without committing', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-staging-'));
  const git = (...args) =>
    execFileSync('git', ['-C', root, '-c', 'core.autocrlf=false', ...args], {
      stdio: 'pipe',
      windowsHide: true,
    });
  try {
    git('init', '--quiet');
    writeFileSync(join(root, 'a.ts'), 'old');
    writeFileSync(join(root, 'private.txt'), 'fixture');
    git('add', '--', 'a.ts', 'private.txt');
    writeFileSync(join(root, 'a.ts'), 'new');
    assert.deepEqual(
      inspectStagedPublication(root, ['a.ts']).issues.map((item) => item.code),
      ['staged-bytes-differ', 'not-in-approved-list'],
    );
    git('reset', '--quiet', '--', 'private.txt');
    git('add', '--', 'a.ts');
    assert.deepEqual(inspectStagedPublication(root, ['a.ts']).issues, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
