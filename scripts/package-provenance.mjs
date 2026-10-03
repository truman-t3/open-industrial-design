// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Pins reviewed research, not a declaration of distribution approval.
const evidenceHash = 'f96f558e6382eb484f401eabad3c22dcc4f13ed0000ad9fbefcc2e5ca10a2e7d';

export function verifyScrollBarEvidence(evidence, readPackageFile, supplement) {
  if (hash(JSON.stringify(evidence)) !== evidenceHash)
    throw new Error('Scroll-bar research evidence changed; review required');
  const id = 'react-remove-scroll-bar@2.3.8';
  if (
    supplement &&
    (supplement.id !== id ||
      supplement.license !== 'MIT' ||
      supplement.manifestSha256 !== evidence.manifestSha256 ||
      supplement.commit !== evidence.upstreamCommit ||
      supplement.notices.length !== 1 ||
      supplement.notices[0].sha256 !== evidence.licenseSha256 ||
      supplement.notices[0].source !== evidence.licenseUrl)
  )
    throw new Error('Scroll-bar notice does not match reviewed source evidence');
  const files = [
    ...evidence.records.map((record) => ({
      file: record.installedPath,
      hash: record.installedSha256,
    })),
    ...evidence.ancillary.map((record) => ({ file: record.file, hash: record.installedSha256 })),
  ];
  for (const record of files) {
    if (hash(readPackageFile(id, record.file)) !== record.hash)
      throw new Error(`Scroll-bar installed file changed: ${record.file}`);
  }
  return {
    id,
    packageNoticeResolved: Boolean(supplement),
    status: 'SOURCE_COMPARISON_VERIFIED_DISTRIBUTION_REVIEW_PENDING',
    evidenceSha256: evidenceHash,
    upstreamCommit: evidence.upstreamCommit,
    upstreamVersion: evidence.upstreamVersion,
    compilerVersion: evidence.compilerVersion,
    checkedInstalledFiles: files.length,
    runtimeByteMatches: evidence.summary.byteIdenticalRuntimeFiles,
    declarationByteMatches: evidence.summary.byteIdenticalDeclarationFiles,
    legacyDeclarationDifferences: evidence.summary.declarationsWithOnlyLegacyDeclareDifference,
    manifestChangedFields: evidence.ancillary.find((record) => record.file === 'package.json')
      .changedFields,
    boundary:
      'Offline fingerprint check of prior compilation research, not a rebuild or original release-toolchain proof. When a matching supplement is supplied, existing upstream MIT terms resolve the missing package notice, not overall distribution approval.',
  };
}

export const dracoNoticeHeading = (version) =>
  `===== DRACO ${version} UPSTREAM LICENSE — FIXED BYTE SNAPSHOT; DISTRIBUTION REVIEW PENDING =====`;
