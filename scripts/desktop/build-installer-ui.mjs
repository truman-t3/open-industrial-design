// SPDX-License-Identifier: MPL-2.0
import { copyFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'apps/desktop/installer-dist');
if (existsSync(output) && lstatSync(output).isSymbolicLink())
  throw new Error('Linked output rejected');
mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'style.css', 'app.mjs'])
  copyFileSync(join(root, 'apps/desktop/installer', file), join(output, file));
for (const [source, name] of [
  ['scripts/desktop/installer-state.mjs', 'installer-state.mjs'],
  ['brand/logo/open-industrial-design-logo-dark.png', 'logo.png'],
  ['brand/demo/portable-lamp-concept.png', 'lamp.png'],
  ['LICENSE', 'LICENSE.txt'],
])
  copyFileSync(join(root, source), join(output, name));
console.log(
  'Installer UI assembled from existing approved assets; no generation or network requests.',
);
