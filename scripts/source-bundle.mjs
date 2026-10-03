// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reuse the project's installed ZIP library; no new package or download.
const { zipSync, unzipSync } = createRequire(
  new URL('../packages/project-file/package.json', import.meta.url),
)('fflate');
const repo = fileURLToPath(new URL('../', import.meta.url));
const manifestName = 'SOURCE_BUNDLE_MANIFEST.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function assertSourcePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.includes('\\') ||
    path.includes(':') ||
    path.startsWith('/') ||
    path.split('/').some((part) => !part || part === '..' || part === '.' || /[. ]$/.test(part)) ||
    /(^|\/)(node_modules|dist|artifacts|coverage|\.git|\.codex|\.agents|\.aws|test-results|playwright-report)(\/|$)/i.test(
      path,
    ) ||
    /(^|\/)(\.env[^/]*|\.npmrc|credentials[^/]*|secrets?[^/]*|.*\.(oidproj|log|pem|key|pfx|sqlite|db))$/i.test(
      path,
    )
  ) {
    throw new Error('Disallowed source path');
  }
}

export function regularFile(root, path) {
  assertSourcePath(path);
  let target = root;
  const segments = path.split('/');
  for (const [index, segment] of segments.entries()) {
    target = join(target, segment);
    const stat = lstatSync(target);
    if (
      stat.isSymbolicLink() ||
      (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())
    ) {
      throw new Error(`Source must be a regular file with no linked parents: ${path}`);
    }
  }
  return target;
}

export function createSourceBundle(root, paths) {
  if (
    !Array.isArray(paths) ||
    !paths.length ||
    new Set(paths).size !== paths.length ||
    paths.includes(manifestName)
  ) {
    throw new Error('Invalid source allowlist');
  }
  const files = Object.create(null);
  const records = [];
  // Locale-independent order and fixed ZIP timestamps make unchanged input reproducible.
  for (const path of [...paths].sort()) {
    const bytes = readFileSync(regularFile(root, path));
    records.push({ path, size: bytes.length, sha256: sha256(bytes) });
    files[path] = [bytes, { mtime: new Date(1980, 0, 1), level: 6 }];
  }
  const manifest = {
    schemaVersion: 1,
    status: 'INTERNAL_SOURCE_SNAPSHOT_NOT_RELEASE_APPROVED',
    files: records,
  };
  files[manifestName] = [
    Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
    { mtime: new Date(1980, 0, 1), level: 6 },
  ];
  const bytes = zipSync(files);
  verifySourceBundle(bytes, paths);
  return { bytes, manifest, sha256: sha256(bytes) };
}

export function verifySourceBundle(bytes, paths) {
  const files = unzipSync(bytes);
  const manifest = JSON.parse(Buffer.from(files[manifestName] ?? []).toString('utf8'));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.status !== 'INTERNAL_SOURCE_SNAPSHOT_NOT_RELEASE_APPROVED' ||
    !Array.isArray(manifest.files)
  )
    throw new Error('Invalid source manifest');
  const expected = [...paths, manifestName].sort();
  if (
    JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(expected) ||
    manifest.files.length !== paths.length ||
    new Set(manifest.files.map((file) => file.path)).size !== paths.length
  )
    throw new Error('Source bundle file set mismatch');
  for (const file of manifest.files) {
    assertSourcePath(file.path);
    if (
      !paths.includes(file.path) ||
      !files[file.path] ||
      files[file.path].length !== file.size ||
      sha256(files[file.path]) !== file.sha256
    )
      throw new Error('Source bundle integrity mismatch');
  }
  return manifest;
}

/** Public source checks are opt-in; ordinary development builds remain offline. */
export function verifyPublishedArchive(bytes, commit, paths, readLocal) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full immutable commit is required');
  if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length)
    throw new Error('Invalid public source allowlist');
  paths.forEach(assertSourcePath);
  if (bytes.length > 64 * 1024 * 1024) throw new Error('Source archive too large');
  const prefix = `open-industrial-design-${commit}/`;
  const seen = new Set();
  let total = 0;
  const files = unzipSync(bytes, {
    filter(entry) {
      if (seen.has(entry.name)) throw new Error('Duplicate source entry');
      seen.add(entry.name);
      total += entry.originalSize;
      if (seen.size > 10000 || total > 256 * 1024 * 1024)
        throw new Error('Expanded source archive too large');
      if (!entry.name.startsWith(prefix)) throw new Error('Unexpected source archive root');
      if (entry.name.endsWith('/')) return false;
      const local = entry.name.slice(prefix.length);
      assertSourcePath(local);
      if (!paths.includes(local)) throw new Error('Unexpected public source file');
      return true;
    },
  });
  if (Object.keys(files).length !== paths.length) throw new Error('Missing public source files');
  for (const path of paths) {
    if (sha256(files[prefix + path]) !== sha256(readLocal(path)))
      throw new Error(`Published source differs: ${path}`);
  }
  return {
    commit,
    url: `https://github.com/truman-t3/open-industrial-design/tree/${commit}`,
    archiveUrl: `https://codeload.github.com/truman-t3/open-industrial-design/zip/${commit}`,
    archiveSha256: sha256(bytes),
    files: paths.length,
    status: 'ANONYMOUS_SOURCE_BYTES_VERIFIED',
  };
}

export async function verifyPublishedSource(root, commit, fetchPublic = fetch) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full immutable commit is required');
  const url = `https://codeload.github.com/truman-t3/open-industrial-design/zip/${commit}`;
  // No credentials, configurable host or authentication headers are accepted.
  const response = await fetchPublic(url, {
    signal: AbortSignal.timeout(60000),
    redirect: 'error',
    credentials: 'omit',
  });
  if (!response.ok || !response.body) throw new Error('Anonymous source download failed');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 64 * 1024 * 1024) throw new Error('Source archive too large');
    chunks.push(chunk);
  }
  const paths = JSON.parse(readFileSync(regularFile(root, 'scripts/public-files.json'), 'utf8'));
  return verifyPublishedArchive(Buffer.concat(chunks), commit, paths, (path) =>
    readFileSync(regularFile(root, path)),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = JSON.parse(readFileSync(join(repo, 'scripts/source-files.json'), 'utf8'));
  const result = createSourceBundle(repo, paths);
  const output = join(repo, 'artifacts/source/open-industrial-design-source.zip');
  // Fixed internal destination; reject directory junctions rather than following them.
  for (const part of ['artifacts', 'artifacts/source']) {
    const target = join(repo, part);
    mkdirSync(target, { recursive: true });
    if (lstatSync(target).isSymbolicLink()) throw new Error('Linked output directory');
  }
  try {
    if (!lstatSync(output).isFile() || lstatSync(output).isSymbolicLink())
      throw new Error('Invalid output file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  writeFileSync(output, result.bytes);
  verifySourceBundle(readFileSync(output), paths);
  console.log(
    JSON.stringify({
      output,
      files: result.manifest.files.length,
      bytes: result.bytes.length,
      sha256: result.sha256,
      status: result.manifest.status,
    }),
  );
}
