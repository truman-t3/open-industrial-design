// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Version the public directory to avoid reusing the old force-cache font response.
export const sketchFontDirectory = 'runtime/excalidraw-ofl-v1';
export const replacedFont = 'Liberation/LiberationSans-Regular.woff2';
const hashes = {
  'LiberationSans-Regular.ttf': 'bade59d822652f76e6941aa87b40a87c13d1cc70db98ededb5011127efafd1d3',
  'LiberationSans-Regular.woff2':
    'e94ff0707a83eb23de656105c5dd0f1cb1fb65e025b7cc08ca7a8854cd0f6041',
  'DEBIAN-COPYRIGHT.txt': 'f32df582a2aab128c07b2f7e36e7b928dc5f6bd82657b905c04f91459f9e5cf9',
};

export function readLiberationReplacement(repo, read = readFileSync) {
  const directory = join(repo, 'vendor/fonts/liberation-2.1.5');
  const files = {};
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = read(join(directory, file));
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error(`Liberation replacement integrity failed: ${file}`);
    files[file] = bytes;
  }
  return {
    family: 'Liberation',
    version: '2.1.5',
    license: 'OFL-1.1',
    source:
      'https://deb.debian.org/debian/pool/main/f/fonts-liberation/fonts-liberation_2.1.5-3_all.deb',
    file: replacedFont,
    sha256: hashes['LiberationSans-Regular.woff2'],
    size: files['LiberationSans-Regular.woff2'].length,
    bytes: files['LiberationSans-Regular.woff2'],
    text: files['DEBIAN-COPYRIGHT.txt'].toString('utf8'),
    textSha256: hashes['DEBIAN-COPYRIGHT.txt'],
  };
}
