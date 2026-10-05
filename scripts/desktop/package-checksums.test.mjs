// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageChecksums } from './package-checksums.mjs';

test('download checksums include ZIP and notices and reject mutation or missing input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'oid-package-checksums-'));
  const files = [
    'Open-Industrial-Design-1.2.3-alpha.1-blueprint-setup.exe',
    'Open-Industrial-Design-1.2.3-alpha.1-standard-setup.exe',
    'Open-Industrial-Design-1.2.3-alpha.1-portable-x64.zip',
    'LICENSE.txt',
    'NATIVE-NOTICES.txt',
    'Cargo.lock',
    'READ-ME.txt',
  ];
  const manifest = join(directory, 'SHA256SUMS.txt');
  try {
    files.forEach((name) => writeFileSync(join(directory, name), `fixture:${name}`));
    assert.equal(packageChecksums(directory, '1.2.3-alpha.1'), 7);
    assert.equal(packageChecksums(directory, '1.2.3-alpha.1', true), 7);
    const original = readFileSync(manifest, 'utf8');
    assert.match(original, /portable-x64\.zip/);
    assert.throws(() => packageChecksums(directory, '1.2.3-alpha.1'));
    assert.throws(() => packageChecksums(directory, '../escape'));
    for (const name of files) {
      writeFileSync(join(directory, name), 'tampered');
      assert.throws(() => packageChecksums(directory, '1.2.3-alpha.1', true));
      writeFileSync(join(directory, name), `fixture:${name}`);
    }
    unlinkSync(join(directory, files[2]));
    assert.throws(() => packageChecksums(directory, '1.2.3-alpha.1', true));
    writeFileSync(join(directory, files[2]), '');
    assert.throws(() => packageChecksums(directory, '1.2.3-alpha.1', true));
    assert.equal(readFileSync(manifest, 'utf8'), original);
  } finally {
    files.forEach((name) => unlinkSync(join(directory, name)));
    unlinkSync(manifest);
    rmdirSync(directory);
  }
});
