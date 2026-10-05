import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageFiles = [
  'package.json',
  'apps/web/package.json',
  'packages/actions/package.json',
  'packages/ai-core/package.json',
  'packages/ai-openai-compatible/package.json',
  'packages/canvas/package.json',
  'packages/core/package.json',
  'packages/design-model/package.json',
  'packages/project-file/package.json',
  'packages/storage/package.json',
  'packages/three-viewer/package.json',
  'packages/ui/package.json',
];

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'));
}

const rootPackage = await readJson(packageFiles[0]);
const manifest = await readJson('manifest.json');
const expected = rootPackage.version;
const versions = await Promise.all(
  packageFiles.slice(1).map(async (path) => ({ path, version: (await readJson(path)).version })),
);
const mismatches = versions.filter(({ version }) => version !== expected);
if (manifest.version !== expected)
  mismatches.push({ path: 'manifest.json', version: manifest.version });

if (mismatches.length) {
  throw new Error(
    `Expected ${expected} everywhere, but found ${mismatches
      .map(({ path, version }) => `${path}=${version}`)
      .join(', ')}.`,
  );
}

for (const path of ['apps/desktop/src-tauri/Cargo.toml', 'apps/desktop/src-tauri/Cargo.lock']) {
  const content = await readFile(new URL(path, root), 'utf8');
  const version = content.match(
    /name = "open-industrial-design-desktop"\r?\nversion = "([^"]+)"/,
  )?.[1];
  if (version !== expected) throw new Error(`Desktop version mismatch: ${path}`);
}
const labels = await readFile(new URL('packages/core/src/localization.ts', root), 'utf8');
const editions = [...labels.matchAll(/'home.edition': '([^']+)'/g)];
if (editions.length !== 2 || editions.some((match) => !match[1].includes(expected)))
  throw new Error('Home edition labels must show the current version in both languages');
console.log(`Verified version ${expected} across packages, manifest, desktop and home labels.`);
