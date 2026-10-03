// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Fixed public asset directory only: never inspect IndexedDB, archives or credentials. */
export function collectPublicImages(directory) {
  const result = [];
  function visit(current, prefix) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Public asset symlinks require review');
      const file = `${prefix}${entry.name}`;
      if (entry.isDirectory()) visit(join(current, entry.name), `${file}/`);
      else if (/\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(entry.name)) {
        const bytes = readFileSync(join(current, entry.name));
        result.push({ file, sha256: sha256(bytes), size: bytes.length });
      } else if (entry.name !== 'README.md')
        throw new Error('Unexpected public file requires review');
    }
  }
  visit(directory, '');
  return result.sort((a, b) => a.file.localeCompare(b.file, 'en'));
}

/** Hash agreement is provenance tracking, never a redistribution authorization. */
export function reviewPublicImages(observed, registry, { allowAbsentReferences = false } = {}) {
  if (registry.schemaVersion !== 1) throw new Error('Unsupported release asset schema');
  const records = new Map();
  for (const entry of registry.images) {
    if (
      !/^(demo|logo|icon|social)\/[\w.-]+\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(entry.file) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !['demo', 'brand', 'reference-only'].includes(entry.role) ||
      entry.releaseAuthorization !== 'pending'
    )
      throw new Error('Release asset record requires review');
    if (records.has(entry.file)) throw new Error('Duplicate release asset');
    records.set(entry.file, entry);
  }
  if (new Set(observed.map((entry) => entry.file)).size !== observed.length)
    throw new Error('Duplicate observed image');
  const present = new Set(observed.map((entry) => entry.file));
  for (const record of records.values()) {
    if (!present.has(record.file) && !(allowAbsentReferences && record.role === 'reference-only'))
      throw new Error('Public asset set changed');
  }
  return observed.map((image) => {
    const record = records.get(image.file);
    if (!record || record.sha256 !== image.sha256 || record.size !== image.size)
      throw new Error(`Public asset changed or unreviewed: ${image.file}`);
    return { ...record, ...image };
  });
}

export function reviewReleaseAssets(repo) {
  const registry = JSON.parse(readFileSync(join(repo, 'licenses/release-assets.json'), 'utf8'));
  const images = reviewPublicImages(collectPublicImages(join(repo, 'brand')), registry, {
    allowAbsentReferences: true,
  });
  // Reference originals may be omitted from source delivery, never from the registry audit trail.
  const built = ['demo', 'icon', 'logo', 'social'].flatMap((directory) =>
    collectPublicImages(join(repo, 'apps/web/dist', directory)).map((image) => ({
      ...image,
      file: `${directory}/${image.file}`,
    })),
  );
  reviewPublicImages(built, {
    ...registry,
    images: registry.images.filter((image) => image.role !== 'reference-only'),
  });
  const packageRoots = {
    '@excalidraw/excalidraw': 'packages/ui/node_modules/@excalidraw/excalidraw',
    '@open-industrial-design/three-viewer': 'packages/three-viewer',
  };
  for (const runtime of registry.runtimeAssets) {
    if (!runtime.reviewStatus.startsWith('pending-') || !runtime.evidence.length)
      throw new Error('Runtime asset evidence requires review');
    for (const evidence of runtime.evidence) {
      const root = packageRoots[evidence.packageName];
      if (!root || !['dist/dev/chunk-4FTI6OG3.js', 'src/model-loader.ts'].includes(evidence.file))
        throw new Error('Unexpected runtime evidence path');
      const manifest = JSON.parse(readFileSync(join(repo, root, 'package.json'), 'utf8'));
      if (
        `${manifest.name}@${manifest.version}` !== runtime.packageVersion ||
        sha256(readFileSync(join(repo, root, evidence.file))) !== evidence.sha256
      )
        throw new Error(`Runtime asset source changed: ${runtime.id}`);
    }
  }
  return {
    status: 'PENDING_PROVENANCE_AND_AUTHORIZATION',
    images,
    pendingImageAuthorizations: images
      .filter((image) => image.role !== 'reference-only')
      .map((image) => image.file),
    excludedReferenceImages: registry.images
      .filter((image) => image.role === 'reference-only')
      .map((image) => image.file),
    referenceOnlyFilesInBuild: built
      .filter(
        (image) =>
          registry.images.find((entry) => entry.file === image.file)?.role === 'reference-only',
      )
      .map((image) => image.file),
    pendingRuntimeAssets: registry.runtimeAssets,
    boundary:
      'Fixed public images only; remote bytes, user content and provider settings are not collected. Source documentation and matching hashes do not grant distribution rights.',
  };
}
