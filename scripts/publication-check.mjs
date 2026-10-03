// SPDX-License-Identifier: MPL-2.0
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFile } from './source-bundle.mjs';

const textFile =
  /\.(?:[cm]?[jt]sx?|json|ya?ml|md|txt|html|css|py)$|(?:^|\/)(LICENSE|DCO|\.gitignore)$/i;
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  [
    'credential-like',
    /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16})\b/,
  ],
  ['personal-path', /[A-Z]:[\\/](?:Users|Open Industrial Design)[\\/]/i],
];

/** Read only explicitly selected regular files, never traverse user data. */
export function inspectPublication(root, paths, referencePaths = []) {
  if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length)
    throw new Error('Invalid publication file list');
  const issues = [];
  const references = new Set(referencePaths);
  for (const path of paths) {
    let bytes;
    try {
      bytes = readFileSync(regularFile(root, path));
    } catch {
      issues.push({ path, code: 'unsafe-or-missing-file' });
      continue;
    }
    if (references.has(path)) issues.push({ path, code: 'reference-only-material' });
    if (
      path === 'docs/current-task.md' ||
      path === 'docs/tasks/canvas-exploration-ux-improvement.md'
    )
      issues.push({ path, code: 'internal-work-record' });
    if (!textFile.test(path)) continue;
    for (const [index, line] of bytes.toString('utf8').split(/\r?\n/).entries()) {
      for (const [code, pattern] of patterns) {
        if (pattern.test(line)) issues.push({ path, line: index + 1, code });
      }
    }
  }
  return {
    status: issues.length ? 'BLOCKED' : 'FILE_SCREEN_PASSED_NOT_RELEASE_APPROVAL',
    filesChecked: paths.length,
    issues,
  };
}

/** Also inspect the staged blobs: working files can differ from what Git will upload. */
export function inspectStagedPublication(root, approvedPaths) {
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')
    .split('\0')
    .filter(Boolean);
  const approved = new Set(approvedPaths);
  const issues = [];
  for (const path of staged) {
    if (!approved.has(path)) {
      issues.push({ path, code: 'not-in-approved-list' });
      continue;
    }
    const workingFile = regularFile(root, path);
    // Compare raw bytes; newline conversion is a difference requiring review too.
    const indexBytes = execFileSync('git', ['-C', root, 'show', `:${path}`], {
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!indexBytes.equals(readFileSync(workingFile)))
      issues.push({ path, code: 'staged-bytes-differ' });
    const mode = git('ls-files', '--stage', '--', path).split(' ')[0];
    if (!['100644', '100755'].includes(mode))
      issues.push({ path, code: 'non-regular-index-entry' });
  }
  return { stagedFiles: staged.length, issues };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const paths = JSON.parse(
    readFileSync(
      new URL(
        process.argv.includes('--public') ? './public-files.json' : './source-files.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const registry = JSON.parse(
    readFileSync(new URL('../licenses/release-assets.json', import.meta.url), 'utf8'),
  );
  const result = inspectPublication(
    root,
    paths,
    registry.images
      .filter((image) => image.role === 'reference-only')
      .map((image) => `brand/${image.file}`),
  );
  // Current internal list is deliberately not relabeled as a public approval list.
  if (process.argv.includes('--staged')) {
    try {
      const staged = inspectStagedPublication(root, paths);
      result.stagedFiles = staged.stagedFiles;
      result.issues.push(...staged.issues);
      if (!staged.stagedFiles) result.issues.push({ code: 'empty-staging-area' });
    } catch {
      result.issues.push({ code: 'staged-verification-unavailable' });
    }
  }
  if (result.issues.length) result.status = 'BLOCKED';
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.issues.length ? 1 : 0;
}
