// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageChecksums(directory, version, check = false) {
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))
    throw new Error('Invalid package version');
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())
    throw new Error('Expected a real package directory');
  const prefix = `Open-Industrial-Design-${version}`;
  const files = [
    `${prefix}-blueprint-setup.exe`,
    `${prefix}-standard-setup.exe`,
    `${prefix}-portable-x64.zip`,
    'LICENSE.txt',
    'NATIVE-NOTICES.txt',
    'Cargo.lock',
    'READ-ME.txt',
  ];
  const manifest = files
    .map((name) => {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0)
        throw new Error(`Invalid package file: ${name}`);
      return `${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${name}\n`;
    })
    .join('');
  const output = join(directory, 'SHA256SUMS.txt');
  if (check) {
    const stat = lstatSync(output);
    if (!stat.isFile() || stat.isSymbolicLink() || readFileSync(output, 'utf8') !== manifest)
      throw new Error('Package checksum verification failed');
  } else {
    // Exclusive creation prevents overwriting an unrelated or linked manifest.
    writeFileSync(output, manifest, { flag: 'wx' });
  }
  return files.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const count = packageChecksums(
    process.argv[2] ?? join(root, 'apps/desktop/windows-package'),
    version,
    process.argv.includes('--check'),
  );
  console.log(`Verified package inputs: ${count}; includes portable ZIP and distribution notices.`);
}
