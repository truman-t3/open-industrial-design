// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supplementNativeNotices } from './native-supplements.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Inventory evidence only: declared SPDX strings are not a legal approval. */
export function collectNativeNotices(metadata) {
  const resolved = metadata.resolve && new Set(metadata.resolve.nodes.map((node) => node.id));
  const packages = metadata.packages
    .filter(
      (entry) =>
        !metadata.workspace_members.includes(entry.id) && (!resolved || resolved.has(entry.id)),
    )
    .map((entry) => {
      const root = dirname(entry.manifest_path);
      const candidates = new Set();
      const warnings = [];
      const visit = (directory, depth) => {
        for (const child of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, child.name);
          if (child.isSymbolicLink()) continue;
          if (
            child.isFile() &&
            /^(?:licen[cs]e|copying|copyright|notice)(?:$|[._-])/i.test(child.name)
          )
            candidates.add(path);
          else if (depth === 0 && child.isDirectory() && /^(?:licenses?|legal)$/i.test(child.name))
            visit(path, 1);
        }
      };
      visit(root, 0);
      if (entry.license_file) {
        const path = resolve(root, entry.license_file);
        const rel = relative(root, path);
        if (!rel || rel.startsWith('..') || isAbsolute(rel)) warnings.push('invalid-license-path');
        else candidates.add(path);
      }
      const notices = [];
      for (const path of [...candidates].sort()) {
        const rel = relative(root, path);
        let linked = false;
        for (let current = path; current !== root; current = dirname(current)) {
          if (lstatSync(current).isSymbolicLink()) linked = true;
        }
        const stat = lstatSync(path);
        if (linked || !stat.isFile() || stat.size > 1024 * 1024) {
          warnings.push('unreadable-license-evidence');
          continue;
        }
        const bytes = readFileSync(path);
        notices.push({
          file: rel.replaceAll('\\', '/'),
          sha256: hash(bytes),
          text: bytes.toString('utf8'),
        });
      }
      if (!notices.length) warnings.push('no-notice-text-found');
      if (!entry.license) warnings.push('no-declared-license');
      let vcs = null;
      try {
        const info = JSON.parse(readFileSync(join(root, '.cargo_vcs_info.json'), 'utf8'));
        if (/^[a-f0-9]{40}$/.test(info.git?.sha1))
          vcs = { commit: info.git.sha1, path: info.path_in_vcs ?? '' };
      } catch {
        /* Some published crates intentionally have no VCS metadata. */
      }
      return {
        name: entry.name,
        version: entry.version,
        source: entry.source,
        declaredLicense: entry.license,
        repository: entry.repository,
        vcs,
        notices,
        warnings,
      };
    })
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  return { status: 'INVENTORY_ONLY_NOT_DISTRIBUTION_APPROVAL', packages };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = resolve(process.argv[2]);
  const output = resolve(process.argv[3]);
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--locked',
        '--format-version',
        '1',
        '--filter-platform',
        'x86_64-pc-windows-msvc',
        '--features',
        'tauri/custom-protocol',
        '--manifest-path',
        manifest,
      ],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      },
    ),
  );
  const report = supplementNativeNotices(collectNativeNotices(metadata));
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'native-notices.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(
    join(output, 'NATIVE-NOTICES.txt'),
    [
      'Open Industrial Design — native dependency notices',
      'Source: https://github.com/truman-t3/open-industrial-design ; exact dependency versions: accompanying Cargo.lock.',
      'Upstream crate source: https://crates.io/crates/<name>/<version> (use the name and version below).',
      'WebView2 Runtime is a separately installed Microsoft component, not covered by the SDK loader notice.',
      ...report.packages.map(
        (item) =>
          `\n${item.name} ${item.version}\n${item.repository ?? ''}\nDeclared license: ${item.declaredLicense}\n${item.notices.map((notice) => `${notice.source ?? notice.file}\n${notice.text}`).join('\n')}`,
      ),
    ].join('\n') + '\n',
  );
  if (report.packages.some((item) => item.warnings.length))
    throw new Error('Native notice evidence incomplete; binary packaging blocked');
  console.log(
    `Native inventory: ${report.packages.length} packages; ${report.packages.filter((p) => p.warnings.length).length} require evidence review. Not distribution approval.`,
  );
}
