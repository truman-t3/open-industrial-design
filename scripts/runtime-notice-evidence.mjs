// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const families = [
  'Assistant',
  'Cascadia',
  'ComicShanns',
  'Excalifont',
  'Liberation',
  'Lilita',
  'Nunito',
  'Virgil',
  'Xiaolai',
];
const safeFile = (file) =>
  typeof file === 'string' &&
  /^(Assistant|Cascadia|ComicShanns|Excalifont|Liberation|Lilita|Nunito|Virgil|Xiaolai)\/[\w.-]+\.woff2$/.test(
    file,
  );

// Reviewed historical family texts are not evidence of an exact Google Fonts release match.
const familyOfL = {
  Lilita: {
    path: 'lilitaone',
    commit: '90abd17b4f97671435798b6147b698aa9087612f',
    text: '255d5debbb80eb2ea762644311f266a279e8778f00156655a516e2b7781a63e1',
    metadata: '608f63553feb378b8af7ee5d54dfb881306cb8e1d28ef2508fa62ae2ede4b5b1',
  },
  Nunito: {
    path: 'nunito',
    commit: 'a5bd0ea86b2576f86672aab557a6024d272187a5',
    text: '580df76c95a1ec5ab878ceb25bb3d85c6a076804e9c970c8c6972aea775fdf65',
    metadata: 'bba0bd5ad5dd4d1c8969cb6f377bdae3968f4b0f41904377d7f1bdc54893258d',
  },
};

/** Verify recorded provenance locally. This does not certify remote bytes or distribution rights. */
export function verifyRuntimeNoticeEvidence(registry, observed) {
  if (
    registry.schemaVersion !== 1 ||
    registry.packageVersion !== '@excalidraw/excalidraw@0.18.1' ||
    !/^[a-f0-9]{40}$/.test(registry.commit)
  )
    throw new Error('Runtime notice version requires review');
  if (
    new Set(registry.files.map((f) => f.file)).size !== registry.files.length ||
    new Set(observed.map((f) => f.file)).size !== observed.length
  )
    throw new Error('Duplicate runtime font');
  if (observed.length !== registry.files.length) throw new Error('Runtime font set changed');
  for (const font of registry.files) {
    const current = observed.find((f) => f.file === font.file);
    if (
      !safeFile(font.file) ||
      font.upstreamPath !== `packages/excalidraw/fonts/${font.file}` ||
      !current ||
      current.sha256 !== font.sha256 ||
      current.size !== font.size ||
      current.gitBlobSha1 !== font.gitBlobSha1
    )
      throw new Error('Runtime font provenance changed');
  }
  const declared = new Set(['Assistant']);
  for (const notice of registry.notices) {
    if (
      !families.includes(notice.family) ||
      declared.has(notice.family) ||
      hash('sha256', notice.text) !== notice.textSha256 ||
      !/^[a-f0-9]{64}$/.test(notice.sourceSha256)
    )
      throw new Error('Runtime font notice changed');
    declared.add(notice.family);
    const members = registry.files.filter((f) => f.file.startsWith(`${notice.family}/`));
    if (
      !members.length ||
      notice.files.length !== members.length ||
      new Set(notice.files).size !== members.length ||
      members.some((f) => !notice.files.includes(f.file))
    )
      throw new Error('Incomplete runtime font notice binding');
    const base = `https://raw.githubusercontent.com/excalidraw/excalidraw/${registry.commit}/packages/excalidraw/fonts/`;
    if (notice.method === 'embedded-name-table') {
      if (notice.source !== base + members[0].file || notice.sourceSha256 !== members[0].sha256)
        throw new Error('Embedded font source changed');
    } else if (notice.method === 'pinned-family-ofl-with-font-metadata') {
      const proof = familyOfL[notice.family];
      if (
        !proof ||
        notice.sourceCommit !== proof.commit ||
        notice.source !==
          `https://raw.githubusercontent.com/google/fonts/${proof.commit}/ofl/${proof.path}/OFL.txt` ||
        notice.sourceSha256 !== proof.text ||
        notice.textSha256 !== proof.text ||
        notice.fontMetadata?.sha256 !== proof.metadata ||
        hash('sha256', JSON.stringify(notice.fontMetadata?.names)) !== proof.metadata ||
        notice.bindingScope !== 'family-license-text-not-release-byte-match'
      )
        throw new Error('Historical family font notice evidence changed');
    } else if (notice.method === 'pinned-declaration-with-official-ofl-body') {
      if (
        notice.family !== 'Xiaolai' ||
        notice.source !== `${base}Xiaolai/index.ts` ||
        notice.sourceSha256 !==
          'c2cbbbfa669404795527e06cf596ab4b1b851f9bb993c608c8ab9c3c2aabe9d3' ||
        notice.textSha256 !== '9d39f22fb4f8ae6837355e2378597a936dc1360688aa71fd7dfc1b30033df452' ||
        notice.declarationSha256 !==
          '63d432365e01385b4e290369e31ff33e1ac1fc00205d74f688808c444ddd2b3f' ||
        notice.licenseBody?.source !== 'https://openfontlicense.org/documents/OFL.txt' ||
        notice.licenseBody.sourceSha256 !==
          '1d361a8f8e8ce6e68457dcd93fb56e162e6baa3bbb7e7573a290d44399f6b57e' ||
        notice.licenseBody.textSha256 !==
          'ebc109078c06f79af74cf2b27454c262830d12a65749f0e2bf25d1ac1db7a02a' ||
        notice.licenseBody.reusedFrom !==
          'reviewed-Assistant-official-body-without-example-copyright' ||
        notice.bindingScope !== 'pinned-font-declaration-plus-unchanged-official-license-body'
      )
        throw new Error('Declared font OFL evidence changed');
    } else if (
      notice.method !== 'pinned-font-registration-original-comment' ||
      notice.source !== `${base}${notice.family}/index.ts`
    )
      throw new Error('Font notice source is not pinned');
  }
  for (const family of registry.pendingFontFamilies) {
    if (!families.includes(family) || declared.has(family))
      throw new Error('Invalid pending font family');
    declared.add(family);
  }
  if (
    declared.size !== families.length ||
    families.some((family) => !registry.files.some((f) => f.file.startsWith(`${family}/`)))
  )
    throw new Error('Runtime font review incomplete');
  // The historical SFD says 1.02 and installed WOFF2 says 1.05; numbers alone cannot
  // resolve provenance, because upstream reported incorrect internal version numbers.
  // Keep them separately; their presence must never close the pending Liberation review.
  const legacy = registry.legacyFontResearch;
  if (
    !legacy ||
    hash('sha256', JSON.stringify(legacy)) !==
      '4a425243e77c7556a6a9609d39f18ea2bec82756395a06b3153dc1940be10a24' ||
    !registry.pendingFontFamilies.includes('Liberation') ||
    registry.notices.some((notice) => notice.family === 'Liberation') ||
    registry.files.find((font) => font.file === legacy.file)?.sha256 !== legacy.fontSha256
  )
    throw new Error('Legacy font candidate evidence changed or incorrectly approved');
  const decoder = registry.draco;
  if (
    decoder.version !== '1.5.5' ||
    decoder.commit !== 'a5b31570c3204326e80c0d0d9d4434f0a10dc71b' ||
    decoder.source !== `https://raw.githubusercontent.com/google/draco/${decoder.commit}/LICENSE` ||
    hash('sha256', decoder.text) !== decoder.sha256 ||
    decoder.bindingStatus !== 'upstream-original-and-cdn-bytes-verified-offline-pending'
  )
    throw new Error('Remote decoder notice changed');
  // Reviewed snapshot only: no network access during builds and no claim that future
  // CDN responses, offline loading or distribution authorization have been verified.
  const remote = decoder.cdnByteVerification;
  if (
    !remote ||
    hash('sha256', JSON.stringify(remote)) !==
      '9b3f46b08bfb4af67e56b0175e0aeb71bbff6ee4bec2df4f1afae724425d3c04'
  )
    throw new Error('Remote decoder byte evidence changed or incorrectly approved');
  return registry;
}

export function readRuntimeNoticeEvidence(repo) {
  const registry = JSON.parse(
    readFileSync(join(repo, 'licenses/runtime-notice-evidence.json'), 'utf8'),
  );
  const root = join(repo, 'packages/ui/node_modules/@excalidraw/excalidraw/dist/prod/fonts');
  const observed = [];
  for (const family of readdirSync(root, { withFileTypes: true })) {
    if (!family.isDirectory() || !families.includes(family.name))
      throw new Error('Unexpected font directory');
    for (const file of readdirSync(join(root, family.name), { withFileTypes: true })) {
      if (!file.isFile() || !safeFile(`${family.name}/${file.name}`))
        throw new Error('Unexpected runtime font file');
      const bytes = readFileSync(join(root, family.name, file.name));
      observed.push({
        file: `${family.name}/${file.name}`,
        size: bytes.length,
        sha256: hash('sha256', bytes),
        gitBlobSha1: createHash('sha1')
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest('hex'),
      });
    }
  }
  return verifyRuntimeNoticeEvidence(registry, observed);
}
