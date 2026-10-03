// SPDX-License-Identifier: MPL-2.0
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertComplete,
  bindFonts,
  containedFile,
  readNotices,
  sha256,
  supplementPackages,
  verifySourceMapBinding,
} from './build-license-notices.mjs';

const text = Buffer.from('Copyright original author\r\nMIT license original text\r\n');
const commit = 'a'.repeat(40);
const installed = [{ id: 'example@1.0.0', manifestSha256: 'b'.repeat(64), notices: [] }];
const record = {
  id: 'example@1.0.0',
  manifestSha256: 'b'.repeat(64),
  commit,
  notices: [
    {
      file: 'texts/example.txt',
      sha256: sha256(text),
      source: `https://raw.githubusercontent.com/example/repo/${commit}/LICENSE`,
    },
  ],
};
const registry = () => ({ schemaVersion: 1, packages: [structuredClone(record)], fonts: [] });
const sourceFixture = () => {
  const file = 'packages/react/example/src/index.ts';
  const content = 'export const value = 1;\r\n';
  const map = { sources: [file], sourcesContent: [content] };
  const bytes = Buffer.from(JSON.stringify(map));
  const entry = {
    ...structuredClone(record),
    id: '@radix-ui/example@1.0.0',
    binding: {
      method: 'published-sourcemap-source-match',
      sourceMapFile: 'dist/index.module.js.map',
      sourceMapSha256: sha256(bytes),
      files: [
        {
          file,
          equal: true,
          source: `https://raw.githubusercontent.com/radix-ui/primitives/${commit}/${file}`,
          sourceSha256: sha256(content.replaceAll('\r\n', '\n')),
        },
      ],
    },
  };
  return { map, bytes, entry };
};

test('historical source-map proof checks all embedded sources with CRLF normalization only', () => {
  const { entry, bytes } = sourceFixture();
  assert.doesNotThrow(() => verifySourceMapBinding(entry, bytes));
  const result = supplementPackages(
    [{ ...installed[0], id: entry.id }],
    { ...registry(), packages: [entry] },
    () => text,
    (id, file) => {
      assert.equal(id, entry.id);
      assert.equal(file, 'dist/index.module.js.map');
      return bytes;
    },
  );
  assert.equal(result[0].sourceBinding.sourceCount, 1);
});
test('missing reader or changed installed source-map bytes cannot skip provenance validation', () => {
  const { entry, bytes } = sourceFixture();
  assert.throws(
    () =>
      supplementPackages(
        [{ ...installed[0], id: entry.id }],
        { ...registry(), packages: [entry] },
        () => text,
      ),
    /reader required/,
  );
  assert.throws(
    () => verifySourceMapBinding(entry, Buffer.concat([bytes, Buffer.from(' ')])),
    /Invalid source-map/,
  );
});
test('re-hashing a modified source map does not bypass original source-content proof', () => {
  for (const content of ['export const value = 2;\r\n', null]) {
    const { entry, map } = sourceFixture();
    map.sourcesContent[0] = content;
    const bytes = Buffer.from(JSON.stringify(map));
    entry.binding.sourceMapSha256 = sha256(bytes);
    assert.throws(() => verifySourceMapBinding(entry, bytes), /proof changed/);
  }
});
test('partial, empty or duplicate source proofs are rejected', () => {
  for (const kind of ['partial', 'empty', 'duplicate']) {
    const { entry, map } = sourceFixture();
    if (kind === 'partial') entry.binding.files = [];
    if (kind === 'empty') map.sources = map.sourcesContent = entry.binding.files = [];
    if (kind === 'duplicate') {
      map.sources.push(map.sources[0]);
      map.sourcesContent.push(map.sourcesContent[0]);
      entry.binding.files.push(structuredClone(entry.binding.files[0]));
    }
    const bytes = Buffer.from(JSON.stringify(map));
    entry.binding.sourceMapSha256 = sha256(bytes);
    assert.throws(() => verifySourceMapBinding(entry, bytes), /Incomplete/);
  }
});
test('proofs require the reviewed method and same immutable upstream source commit', () => {
  for (const change of ['method', 'source', 'file', 'equal']) {
    const { entry, bytes } = sourceFixture();
    if (change === 'method') entry.binding.method = 'unverified';
    else if (change === 'source')
      entry.binding.files[0].source = entry.binding.files[0].source.replace(commit, 'main');
    else if (change === 'file') entry.binding.files[0].file = '../private.txt';
    else entry.binding.files[0].equal = false;
    assert.throws(() => verifySourceMapBinding(entry, bytes), /source-map binding|proof changed/);
  }
});

test('supplements preserve original copyright and CRLF without changing project license', () => {
  const result = supplementPackages(installed, registry(), () => text);
  assert.equal(result[0].notices[0].text, text.toString('utf8'));
  assert.equal(installed[0].notices.length, 0);
});
test('changed text is rejected', () => {
  assert.throws(
    () => supplementPackages(installed, registry(), () => Buffer.from('changed')),
    /text changed/,
  );
});
test('different installed version or manifest cannot inherit old supplement', () => {
  assert.throws(() => supplementPackages([], registry(), () => text), /version\/manifest changed/);
  assert.throws(
    () =>
      supplementPackages(
        [{ ...installed[0], manifestSha256: 'c'.repeat(64) }],
        registry(),
        () => text,
      ),
    /version\/manifest changed/,
  );
});
test('duplicate and unsupported supplement records fail', () => {
  const r = registry();
  r.packages.push(structuredClone(record));
  assert.throws(() => supplementPackages(installed, r, () => text), /Duplicate/);
  assert.throws(
    () => supplementPackages(installed, { ...registry(), schemaVersion: 2 }, () => text),
    /schema/,
  );
});
test('moving upstream branch is not accepted as pinned provenance', () => {
  const r = registry();
  r.packages[0].notices[0].source = 'https://raw.githubusercontent.com/example/repo/main/LICENSE';
  assert.throws(() => supplementPackages(installed, r, () => text), /not pinned/);
});
test('font binding uses bytes rather than hashed build filename', () => {
  const r = registry();
  r.fonts.push({
    sha256: 'd'.repeat(64),
    notice: { file: 'texts/font.txt', sha256: sha256(text) },
  });
  const fonts = bindFonts(
    [
      { file: 'renamed.woff2', sha256: 'd'.repeat(64) },
      { file: 'new.woff2', sha256: 'e'.repeat(64) },
    ],
    r,
    () => text,
  );
  assert.equal(fonts[0].file, 'renamed.woff2');
  assert.equal(fonts[0].text, text.toString('utf8'));
  assert.equal(fonts[1].unresolved, true);
  assert.throws(() => bindFonts([], r, () => Buffer.from('changed')), /Font notice text changed/);
});
test('incomplete notices and absent source offer prevent distribution check passing', () => {
  const report = {
    unresolvedPackages: [],
    unresolvedFonts: [],
    pendingSourceAvailability: false,
    runtimeNoticeEvidence: { pendingFontFamilies: [] },
    assetReview: { pendingImageAuthorizations: [], pendingRuntimeAssets: [] },
  };
  assert.doesNotThrow(() => assertComplete(report));
  for (const pending of [
    { unresolvedPackages: ['example@1'] },
    { unresolvedFonts: ['new.woff2'] },
    { pendingSourceAvailability: true },
    { runtimeNoticeEvidence: undefined },
    { runtimeNoticeEvidence: { pendingFontFamilies: ['Liberation'] } },
    { assetReview: undefined },
    { assetReview: { pendingImageAuthorizations: ['demo.png'], pendingRuntimeAssets: [] } },
    { assetReview: { pendingImageAuthorizations: [], pendingRuntimeAssets: [{ id: 'cdn' }] } },
  ])
    assert.throws(() => assertComplete({ ...report, ...pending }), /not ready/);
});
test('supplement paths cannot escape licenses or read unrelated workspace files', () => {
  const root = fileURLToPath(new URL('../licenses/', import.meta.url));
  assert.throws(() => containedFile(root, '../package.json'), /escapes/);
  assert.throws(() => containedFile(root, 'C:\\private\\key.txt'), /Invalid/);
  const data = JSON.parse(
    readFileSync(new URL('../licenses/supplemental-notices.json', import.meta.url)),
  );
  for (const entry of data.packages
    .flatMap((p) => p.notices)
    .concat(data.fonts.map((f) => f.notice)))
    assert.equal(sha256(readFileSync(containedFile(root, entry.file))), entry.sha256);
});
test('actual checked-in text set contains OFL and original upstream copyrights', () => {
  const notices = readNotices(fileURLToPath(new URL('../licenses/', import.meta.url)));
  assert.equal(
    notices.length,
    0,
    'Hash-named supplements must only be loaded through the reviewed registry',
  );
  const data = JSON.parse(
    readFileSync(new URL('../licenses/supplemental-notices.json', import.meta.url)),
  );
  assert.equal(data.fonts.length, 4);
  assert.equal(data.packages.length, 38);
  assert.equal(data.historicalRemovedPackages[0].id, 'draco3d@1.5.7');
  const sourceMatched = data.packages.filter((p) => p.binding);
  assert.equal(sourceMatched.length, 14);
  assert.equal(
    sourceMatched.reduce((total, p) => total + p.binding.files.length, 0),
    29,
  );
  const fontText = readFileSync(
    new URL(`../licenses/${data.fonts[0].notice.file}`, import.meta.url),
    'utf8',
  );
  assert.match(fontText, /Copyright 2020 The Assistant Project Authors/);
  assert.match(fontText, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(
    readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'),
    /^Mozilla Public License Version 2\.0/,
  );
});
