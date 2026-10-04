// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import policy from './policy.cjs';

test('desktop serves only its fixed origin and existing local assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-desktop-test-'));
  try {
    const web = join(root, 'web');
    mkdirSync(web);
    writeFileSync(join(web, 'index.html'), 'app');
    writeFileSync(join(root, 'private.txt'), 'private');
    assert.equal(policy.assetPath(web, 'oid://workspace/'), join(web, 'index.html'));
    for (const url of [
      'https://workspace/',
      'oid://other/',
      'oid://workspace/%2e%2e%2fprivate.txt',
      'oid://workspace/%5cprivate.txt',
      'oid://workspace/missing',
    ])
      assert.throws(() => policy.assetPath(web, url));
    assert.throws(() => policy.assetPath(web, 'oid://workspace/', 'POST'));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('desktop data ownership protects unrelated folders and survives restart', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-desktop-test-'));
  try {
    const data = join(root, 'data');
    policy.prepareDataDirectory(data);
    writeFileSync(join(data, 'profile', 'project-sentinel'), 'retained');
    assert.equal(policy.prepareDataDirectory(data), data);
    assert.equal(readFileSync(join(data, 'profile', 'project-sentinel'), 'utf8'), 'retained');
    writeFileSync(join(root, 'unrelated'), 'keep');
    assert.throws(() => policy.prepareDataDirectory(root), /empty/);
    assert.throws(() => policy.prepareDataDirectory(parse(root).root), /disk root/);
    assert.throws(() => policy.prepareDataDirectory('relative'), /absolute/);
  } finally {
    rmSync(root, { recursive: true });
  }
});
