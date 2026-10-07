// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import policy from './policy.cjs';

test('native release navigation is restricted to the fixed official download page', () => {
  const source = readFileSync(
    new URL('../../apps/desktop/src-tauri/src/main.rs', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /url\.as_str\(\) == "https:\/\/github.com\/truman-t3\/open-industrial-design\/releases"/,
  );
  assert.match(
    source,
    /\.arg\("https:\/\/github.com\/truman-t3\/open-industrial-design\/releases"\)/,
  );
  assert.doesNotMatch(source, /\.arg\(url/);
  assert.match(source, /NewWindowResponse::Deny/);
});

test('desktop icon contains matching high-DPI and small PNG frames', () => {
  const icon = readFileSync(
    new URL('../../apps/desktop/src-tauri/icons/icon.ico', import.meta.url),
  );
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  assert.equal(icon.readUInt16LE(4), sizes.length);
  let expectedOffset = 6 + sizes.length * 16;
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16;
    assert.equal(icon[entry] || 256, size);
    assert.equal(icon[entry + 1] || 256, size);
    assert.equal(icon.readUInt16LE(entry + 6), 32);
    const length = icon.readUInt32LE(entry + 8);
    const offset = icon.readUInt32LE(entry + 12);
    assert.equal(offset, expectedOffset);
    assert.ok(length > 24 && offset + length <= icon.length);
    const png = icon.subarray(offset, offset + length);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    expectedOffset += length;
  }
  assert.equal(expectedOffset, icon.length);
});

test('uninstaller explains retained data and keeps the preservation hook', () => {
  const hooks = readFileSync(
    new URL('../../apps/desktop/src-tauri/installer-hooks.nsh', import.meta.url),
    'utf8',
  );
  assert.match(hooks, /!define MUI_UNCONFIRMPAGE_TEXT_TOP/);
  assert.match(hooks, /工程与设置始终保留/);
  assert.match(hooks, /checkbox below has no effect/);
  assert.match(
    hooks,
    /!macro NSIS_HOOK_PREUNINSTALL\s+StrCpy \$DeleteAppDataCheckboxState 0\s+!macroend/,
  );
});

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
