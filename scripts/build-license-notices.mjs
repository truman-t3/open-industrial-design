// SPDX-License-Identifier: MPL-2.0
// Offline distribution preparation, not a legal-compliance certification.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewReleaseAssets } from './release-assets.mjs';
import { readRuntimeNoticeEvidence } from './runtime-notice-evidence.mjs';
import { readLiberationReplacement, replacedFont } from './liberation-font.mjs';
import { verifyScrollBarEvidence, dracoNoticeHeading } from './package-provenance.mjs';
import { verifyPublishedSource } from './source-bundle.mjs';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const portable = (path) => path.replaceAll('\\', '/');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const withoutText = (entry) =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'text'));

export function containedFile(root, file) {
  if (typeof file !== 'string' || isAbsolute(file) || file.includes('\\'))
    throw new Error('Invalid notice path');
  const full = realpathSync(resolve(root, file));
  const local = relative(realpathSync(root), full);
  if (
    !local ||
    local === '..' ||
    local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(local)
  )
    throw new Error('Notice escapes its directory');
  return full;
}

export function readNotices(directory) {
  const found = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git'].includes(entry.name)) visit(full);
      } else if (
        entry.isFile() &&
        /^(licen[cs]e|copying|notice|ofl|copyright)([._-]|$)/i.test(entry.name)
      ) {
        const bytes = readFileSync(full);
        if (!bytes.includes(0))
          found.push({
            file: portable(relative(directory, full)),
            sha256: sha256(bytes),
            text: bytes.toString('utf8'),
          });
      }
    }
  }
  visit(directory);
  return found.sort((a, b) => a.file.localeCompare(b.file, 'en'));
}

export const hasPackageLevelNotice = (notices) =>
  notices.some((notice) => notice.scope !== 'file-level-only');

export function verifySourceMapBinding(entry, bytes) {
  const binding = entry.binding;
  if (
    binding.method !== 'published-sourcemap-source-match' ||
    !entry.id.startsWith('@radix-ui/') ||
    binding.sourceMapFile !== 'dist/index.module.js.map' ||
    sha256(bytes) !== binding.sourceMapSha256
  )
    throw new Error(`Invalid source-map binding: ${entry.id}`);
  const map = JSON.parse(bytes.toString('utf8'));
  if (
    !Array.isArray(map.sources) ||
    !Array.isArray(map.sourcesContent) ||
    !Array.isArray(binding.files) ||
    !map.sources.length ||
    map.sources.length !== map.sourcesContent.length ||
    map.sources.length !== binding.files.length ||
    new Set(map.sources).size !== map.sources.length
  )
    throw new Error(`Incomplete source-map proof: ${entry.id}`);
  for (const [index, file] of map.sources.entries()) {
    const proof = binding.files[index];
    const content = map.sourcesContent[index];
    if (
      typeof file !== 'string' ||
      !/^packages\/[\w./-]+$/.test(file) ||
      file.split('/').includes('..') ||
      typeof content !== 'string' ||
      proof.file !== file ||
      proof.equal !== true ||
      proof.source !==
        `https://raw.githubusercontent.com/radix-ui/primitives/${entry.commit}/${file}` ||
      sha256(content.replaceAll('\r\n', '\n')) !== proof.sourceSha256
    )
      throw new Error(`Source-map proof changed: ${entry.id}`);
  }
}

export function supplementPackages(packages, registry, readSupplement, readPackageFile) {
  if (registry.schemaVersion !== 1) throw new Error('Unsupported supplemental notice schema');
  const entries = new Map();
  for (const entry of registry.packages) {
    if (entries.has(entry.id)) throw new Error(`Duplicate supplement: ${entry.id}`);
    const installed = packages.find((p) => p.id === entry.id);
    if (!installed || installed.manifestSha256 !== entry.manifestSha256)
      throw new Error(`Supplement version/manifest changed: ${entry.id}`);
    if (!/^[a-f0-9]{40}$/.test(entry.commit) || !entry.notices.length)
      throw new Error(`Supplement lacks pinned provenance: ${entry.id}`);
    if (entry.binding) {
      if (!readPackageFile) throw new Error(`Source-map reader required: ${entry.id}`);
      verifySourceMapBinding(entry, readPackageFile(entry.id, entry.binding.sourceMapFile));
    }
    const notices = entry.notices.map((notice) => {
      const bytes = readSupplement(notice.file);
      if (sha256(bytes) !== notice.sha256) throw new Error(`Supplement text changed: ${entry.id}`);
      if (!notice.source.startsWith('https://') || !notice.source.includes(entry.commit))
        throw new Error(`Supplement source is not pinned: ${entry.id}`);
      return { ...notice, text: bytes.toString('utf8') };
    });
    entries.set(entry.id, {
      notices,
      ...(entry.binding
        ? {
            sourceBinding: {
              method: entry.binding.method,
              sourceMapSha256: entry.binding.sourceMapSha256,
              sourceCount: entry.binding.files.length,
              commit: entry.commit,
            },
          }
        : {}),
    });
  }
  return packages.map((p) => ({
    ...p,
    ...(entries.get(p.id) ?? {}),
    notices: [...p.notices, ...(entries.get(p.id)?.notices ?? [])],
  }));
}

export function bindFonts(assets, registry, readSupplement) {
  const seen = new Set();
  for (const entry of registry.fonts) {
    if (seen.has(entry.sha256)) throw new Error('Duplicate font binding');
    seen.add(entry.sha256);
    if (sha256(readSupplement(entry.notice.file)) !== entry.notice.sha256)
      throw new Error('Font notice text changed');
  }
  return assets.map((asset) => {
    const binding = registry.fonts.find((font) => font.sha256 === asset.sha256);
    return binding
      ? { ...binding, file: asset.file, text: readSupplement(binding.notice.file).toString('utf8') }
      : { ...asset, unresolved: true };
  });
}

export function assertComplete(report) {
  if (
    report.unresolvedPackages.length ||
    report.unresolvedFonts.length ||
    !report.runtimeNoticeEvidence ||
    report.runtimeNoticeEvidence.pendingFontFamilies.length ||
    report.pendingSourceAvailability ||
    !report.assetReview ||
    report.assetReview.pendingImageAuthorizations.length ||
    report.assetReview.pendingRuntimeAssets.length
  )
    throw new Error(
      `Distribution not ready: ${report.unresolvedPackages.length} package notices, ${report.unresolvedFonts.length} fonts; corresponding-source availability ${report.pendingSourceAvailability ? 'pending' : 'configured'}; image authorizations ${report.assetReview?.pendingImageAuthorizations.length ?? 'not reviewed'}, runtime asset reviews ${report.assetReview?.pendingRuntimeAssets.length ?? 'not reviewed'}; runtime font notice bindings pending ${report.runtimeNoticeEvidence?.pendingFontFamilies.length ?? 'not reviewed'}`,
    );
}

function installedPackages(repo, directories) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'pnpm.cmd licenses list --prod --json']
      : ['licenses', 'list', '--prod', '--json'];
  const scan = JSON.parse(
    execFileSync(command, args, {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    }),
  );
  const records = new Map();
  for (const entry of Object.values(scan).flat()) {
    for (const directory of entry.paths) {
      const bytes = readFileSync(join(directory, 'package.json'));
      const manifest = JSON.parse(bytes);
      const id = `${manifest.name}@${manifest.version}`;
      if (!directories.has(id)) directories.set(id, new Set());
      directories.get(id).add(directory);
      const notices = readNotices(directory);
      if (!records.has(id))
        records.set(id, {
          id,
          manifestSha256: sha256(bytes),
          declaredLicense: manifest.license ?? null,
          scannerLicense: entry.license,
          notices: [],
        });
      const record = records.get(id);
      if (record.manifestSha256 !== sha256(bytes))
        throw new Error(`Conflicting installed manifests: ${id}`);
      // Pako's zlib notices are in source headers, not named LICENSE files.
      if (id === 'pako@2.0.3') {
        for (const file of readdirSync(join(directory, 'lib/zlib'))
          .filter((f) => f.endsWith('.js'))
          .sort()) {
          const source = readFileSync(join(directory, 'lib/zlib', file), 'utf8');
          const header = source.match(
            /(?:^|\n)(\/\/ \(C\)[\s\S]*?\/\/ 3\. This notice may not be removed or altered from any source distribution\.)/,
          );
          if (header)
            notices.push({
              file: `lib/zlib/${file} (original header)`,
              sha256: sha256(header[1]),
              text: header[1],
            });
        }
        if (!notices.some((n) => n.file.includes('original header')))
          throw new Error('Pako Zlib notices not found');
      }
      for (const notice of notices)
        if (!record.notices.some((n) => n.file === notice.file && n.sha256 === notice.sha256))
          record.notices.push(notice);
    }
  }
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

export function buildNotices(repo, { check = false, source = null } = {}) {
  const licenses = join(repo, 'licenses');
  const registry = readJson(join(licenses, 'supplemental-notices.json'));
  const readSupplement = (file) => readFileSync(containedFile(licenses, file));
  const directories = new Map();
  const readPackageFile = (id, file) => {
    const copies = [...directories.get(id)].map((dir) => readFileSync(containedFile(dir, file)));
    if (copies.some((bytes) => sha256(bytes) !== sha256(copies[0])))
      throw new Error(`Conflicting installed source maps: ${id}`);
    return copies[0];
  };
  const packages = supplementPackages(
    installedPackages(repo, directories),
    registry,
    readSupplement,
    readPackageFile,
  );
  const assetDir = join(repo, 'apps/web/dist/assets');
  const packageProvenance = verifyScrollBarEvidence(
    readJson(join(licenses, 'scroll-bar-source-comparison.json')),
    readPackageFile,
    registry.packages.find((entry) => entry.id === 'react-remove-scroll-bar@2.3.8'),
  );
  const assets = readdirSync(assetDir)
    .filter((file) => /\.(woff2?|ttf|otf)$/i.test(file))
    .sort()
    .map((file) => ({ file, sha256: sha256(readFileSync(join(assetDir, file))) }));
  const fonts = bindFonts(assets, registry, readSupplement);
  const runtimeEvidence = readRuntimeNoticeEvidence(repo);
  const { bytes: replacementBytes, ...replacement } = readLiberationReplacement(repo);
  // The historical inventory remains unapproved; only the verified shipped replacement closes this item.
  if (replacementBytes.length !== replacement.size) throw new Error('Invalid replacement font');
  const khroma = packages.find((p) => p.id === 'khroma@2.1.0');
  const khromaVerified = khroma?.notices.some(
    (n) => n.sha256 === '66b333b0f66759a0b710459e03f7029abe17f4358114a128d2c972e642961b49',
  );
  const report = {
    schemaVersion: 1,
    projectLicense: 'MPL-2.0',
    applicationVersion: readJson(join(repo, 'package.json')).version,
    lockfileSha256: sha256(readFileSync(join(repo, 'pnpm-lock.yaml'))),
    status: 'DRAFT_NOT_APPROVED_FOR_DISTRIBUTION',
    pendingSourceAvailability: !source,
    correspondingSource: source,
    packageProvenance,
    unresolvedPackages: packages
      .filter(
        (p) =>
          !hasPackageLevelNotice(p.notices) ||
          (/unknown/i.test(p.scannerLicense) && !(p.id === 'khroma@2.1.0' && khromaVerified)),
      )
      .map((p) => p.id),
    unresolvedFonts: fonts.filter((font) => font.unresolved).map((font) => font.file),
    assetReview: reviewReleaseAssets(repo),
    runtimeNoticeEvidence: {
      packageVersion: runtimeEvidence.packageVersion,
      commit: runtimeEvidence.commit,
      proofMethod: runtimeEvidence.proofMethod,
      files: runtimeEvidence.files.map((file) =>
        file.file === replacedFont
          ? {
              file: file.file,
              size: replacement.size,
              sha256: replacement.sha256,
              source: replacement.source,
            }
          : file,
      ),
      replacement: withoutText(replacement),
      notices: runtimeEvidence.notices.map(withoutText),
      pendingFontFamilies: runtimeEvidence.pendingFontFamilies.filter(
        (family) => family !== replacement.family,
      ),
      historicalPendingFontFamilies: runtimeEvidence.pendingFontFamilies,
      legacyFontResearch: {
        ...runtimeEvidence.legacyFontResearch,
        sourceTexts: runtimeEvidence.legacyFontResearch.sourceTexts.map(withoutText),
      },
      draco: withoutText(runtimeEvidence.draco),
      boundary: runtimeEvidence.boundary,
    },
    boundaries: [
      'Conservative installed production tree, not an exact bundled-module inventory or legal certification.',
      'Source availability, remote runtime assets, demo-image provenance and brand rights still require release review.',
      'Original upstream licenses do not change the application MPL-2.0 license.',
    ],
    packages: packages.map(({ notices, ...p }) => ({ ...p, notices: notices.map(withoutText) })),
    fonts: fonts.map(withoutText),
  };
  if (source) {
    assertComplete(report);
    report.status = 'DISTRIBUTION_MATERIALS_VERIFIED_NOT_LEGAL_CERTIFICATION';
  }
  if (check) {
    assertComplete(report);
    return report;
  }
  const draft = [
    source
      ? 'DISTRIBUTION MATERIALS VERIFIED — NOT LEGAL CERTIFICATION'
      : 'DRAFT — NOT APPROVED FOR DISTRIBUTION',
    'Open Industrial Design Community source license: MPL-2.0.',
    'Third-party licenses below apply only to their respective components.',
    `Unresolved package notices: ${report.unresolvedPackages.join(', ')}`,
    source
      ? `Corresponding source: ${source.url}`
      : 'Corresponding-source availability remains pending.',
    `Public image authorizations pending: ${report.assetReview.pendingImageAuthorizations.length}; remote runtime asset reviews pending: ${report.assetReview.pendingRuntimeAssets.length}.`,
    '',
  ];
  for (const p of packages) {
    draft.push(`===== ${p.id} (${p.declaredLicense ?? p.scannerLicense}) =====`);
    if (!hasPackageLevelNotice(p.notices))
      draft.push('MISSING PACKAGE-LEVEL NOTICE TEXT — REVIEW REQUIRED');
    for (const n of p.notices)
      draft.push(
        `--- ${n.file} / SHA256 ${n.sha256} ---`,
        ...(n.source ? [`Source: ${n.source}`] : []),
        ...(n.scope ? [`Scope: ${n.scope} — does not resolve the package-level notice gap.`] : []),
        n.text,
        '',
      );
  }
  for (const font of fonts)
    draft.push(
      `===== FONT ${font.file} / SHA256 ${font.sha256} =====`,
      font.text ?? 'MISSING FONT LICENSE — REVIEW REQUIRED',
      '',
    );
  for (const notice of runtimeEvidence.notices)
    draft.push(
      `===== SKETCH FONT ORIGINAL NOTICE ${notice.family} =====`,
      `Source: ${notice.source}`,
      `Source SHA256: ${notice.sourceSha256}; extracted text SHA256: ${notice.textSha256}`,
      ...(notice.bindingScope ? [`Evidence scope: ${notice.bindingScope}`] : []),
      ...(notice.fontMetadata
        ? [
            'Original installed font name-table fields (not substituted by family license header):',
            JSON.stringify(notice.fontMetadata.names, null, 2),
          ]
        : []),
      ...(notice.licenseBody
        ? [
            `Official license body: ${notice.licenseBody.source}; source SHA256: ${notice.licenseBody.sourceSha256}; body SHA256: ${notice.licenseBody.textSha256}`,
          ]
        : []),
      notice.text,
      '',
    );
  draft.push(
    '===== SHIPPED LIBERATION SANS 2.1.5 — OFL-1.1 REPLACEMENT =====',
    `Source: ${replacement.source}; WOFF2 SHA256: ${replacement.sha256}`,
    replacement.text,
    '===== LIBERATION HISTORICAL LICENSE CANDIDATE — OLD FONT NOT SHIPPED =====',
    'Installed WOFF2 name table: Version 1.05; historical source SFD: Version 1.02.',
    'These originals do not establish installed-release correspondence or distribution approval.',
    JSON.stringify(runtimeEvidence.legacyFontResearch.installedMetadata, null, 2),
  );
  for (const source of runtimeEvidence.legacyFontResearch.sourceTexts)
    draft.push(`Candidate source: ${source.url}`, `SHA256: ${source.sha256}`, source.text, '');
  draft.push(
    dracoNoticeHeading(runtimeEvidence.draco.version),
    `Source: ${runtimeEvidence.draco.source}`,
    'Point-in-time CDN byte fingerprints, not a guarantee of future responses or a completed source offer:',
    JSON.stringify(runtimeEvidence.draco.cdnByteVerification, null, 2),
    runtimeEvidence.draco.text,
    '',
  );
  const destination = join(repo, 'apps/web/dist/licenses');
  mkdirSync(destination, { recursive: true });
  // Explicit allowlist: never copy workspace archives, credential files or QA logs.
  for (const file of [
    'LICENSE',
    'SOURCE_LICENSE.md',
    'DEMO_ASSETS_LICENSE.md',
    'DCO.txt',
    'TRADEMARKS.md',
    'THIRD_PARTY_NOTICES.md',
  ])
    writeFileSync(join(destination, file), readFileSync(join(repo, file)));
  writeFileSync(
    join(destination, 'PREPUBLICATION_REVIEW.md'),
    readFileSync(join(repo, 'docs/prepublication-review.md')),
  );
  writeFileSync(join(destination, 'notice-inventory.json'), JSON.stringify(report, null, 2) + '\n');
  if (source) {
    writeFileSync(join(destination, 'THIRD_PARTY_NOTICES.txt'), draft.join('\n'));
    writeFileSync(
      join(destination, 'SOURCE_AVAILABILITY.txt'),
      `Corresponding source (MPL-2.0): ${source.url}\nDownload: ${source.archiveUrl}\nArchive SHA256: ${source.archiveSha256}\nVerified anonymously against ${source.files} local public source files. Third-party components retain their own licenses.\n`,
    );
    rmSync(join(destination, 'THIRD_PARTY_NOTICES-DRAFT.txt'), { force: true });
    rmSync(join(destination, 'SOURCE_AVAILABILITY-PENDING.txt'), { force: true });
  } else {
    writeFileSync(join(destination, 'THIRD_PARTY_NOTICES-DRAFT.txt'), draft.join('\n'));
    writeFileSync(
      join(destination, 'SOURCE_AVAILABILITY-PENDING.txt'),
      'Local build without public-source verification. Before distribution, run the opt-in --source-commit check against the exact published source. This file is not a fulfilled source offer.\n',
    );
    rmSync(join(destination, 'THIRD_PARTY_NOTICES.txt'), { force: true });
    rmSync(join(destination, 'SOURCE_AVAILABILITY.txt'), { force: true });
  }
  console.log(
    `Notices included: ${packages.length} package versions, ${fonts.length} fonts; ${report.unresolvedPackages.length} package notices unresolved. Image authorizations ${report.assetReview.pendingImageAuthorizations.length}, runtime asset reviews ${report.assetReview.pendingRuntimeAssets.length} pending. Source availability ${source ? 'verified' : 'pending'}. Not release approval.`,
  );
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const commit = process.argv.find((arg) => arg.startsWith('--source-commit='))?.slice(16);
  const source = commit === undefined ? null : await verifyPublishedSource(root, commit);
  const report = buildNotices(root, { check: process.argv.includes('--check'), source });
  if (source) console.log(JSON.stringify({ status: report.status, correspondingSource: source }));
}
