// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectNativeNotices } from './native-notices.mjs';

test('native evidence preserves text and hashes but never local registry paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-native-notices-'));
  try {
    writeFileSync(join(root, 'LICENSE-MIT'), 'Fixture license\n');
    const item = {
      id: 'fixture',
      name: 'fixture',
      version: '1.0.0',
      source: 'registry',
      license: 'MIT',
      manifest_path: join(root, 'Cargo.toml'),
    };
    const report = collectNativeNotices({ packages: [item], workspace_members: [] });
    assert.equal(report.packages[0].notices[0].text, 'Fixture license\n');
    assert.match(report.packages[0].notices[0].sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(report.packages[0].warnings, []);
    assert.ok(!JSON.stringify(report).includes(root));
    assert.equal(
      collectNativeNotices({ packages: [item], workspace_members: ['fixture'] }).packages.length,
      0,
    );
    const empty = join(root, 'empty');
    mkdirSync(empty);
    const invalid = {
      ...item,
      manifest_path: join(empty, 'Cargo.toml'),
      license: null,
      license_file: '../LICENSE-MIT',
    };
    const result = collectNativeNotices({ packages: [invalid], workspace_members: [] });
    assert.deepEqual(result.packages[0].warnings, [
      'invalid-license-path',
      'no-notice-text-found',
      'no-declared-license',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
