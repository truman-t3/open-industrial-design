// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { verifyScrollBarEvidence, dracoNoticeHeading } from './package-provenance.mjs';

const evidence = JSON.parse(
  readFileSync(new URL('../licenses/scroll-bar-source-comparison.json', import.meta.url)),
);
const store = new URL('../node_modules/.pnpm/', import.meta.url);
const supplement = JSON.parse(
  readFileSync(new URL('../licenses/supplemental-notices.json', import.meta.url)),
).packages.find((entry) => entry.id === 'react-remove-scroll-bar@2.3.8');

test('MIT notice closure requires the reviewed manifest, source commit and original notice', () => {
  assert.equal(verifyScrollBarEvidence(evidence, read, supplement).packageNoticeResolved, true);
  assert.equal(verifyScrollBarEvidence(evidence, read).packageNoticeResolved, false);
  for (const field of ['id', 'license', 'manifestSha256', 'commit']) {
    assert.throws(
      () => verifyScrollBarEvidence(evidence, read, { ...supplement, [field]: 'changed' }),
      /notice does not match/,
    );
  }
  for (const field of ['sha256', 'source']) {
    const changed = structuredClone(supplement);
    changed.notices[0][field] = 'changed';
    assert.throws(() => verifyScrollBarEvidence(evidence, read, changed), /notice does not match/);
  }
  assert.throws(
    () => verifyScrollBarEvidence(evidence, read, { ...supplement, notices: [] }),
    /notice does not match/,
  );
});
const copies = readdirSync(store).filter((name) => name.startsWith('react-remove-scroll-bar@'));
const read = (id, file) => {
  assert.equal(id, 'react-remove-scroll-bar@2.3.8');
  assert.ok(copies.length > 0);
  const buffers = copies.map((name) =>
    readFileSync(new URL(`${name}/node_modules/react-remove-scroll-bar/${file}`, store)),
  );
  for (const buffer of buffers) assert.deepEqual(buffer, buffers[0]);
  return buffers[0];
};

test('offline research checks all 27 recorded installed files without approving distribution', () => {
  const result = verifyScrollBarEvidence(evidence, read);
  assert.equal(result.checkedInstalledFiles, 27);
  assert.equal(result.runtimeByteMatches, 12);
  assert.equal(result.declarationByteMatches, 9);
  assert.equal(result.legacyDeclarationDifferences, 3);
  assert.deepEqual(result.manifestChangedFields, ['version', 'dependencies']);
  assert.match(result.status, /REVIEW_PENDING/);
});

test('changed or missing installed files fail closed', () => {
  for (const file of [
    'dist/es2015/component.js',
    'dist/es5/utils.d.ts',
    'README.md',
    'package.json',
  ]) {
    assert.throws(
      () =>
        verifyScrollBarEvidence(evidence, (id, name) =>
          name === file ? Buffer.from('changed') : read(id, name),
        ),
      /installed file changed/,
    );
  }
  assert.throws(
    () =>
      verifyScrollBarEvidence(evidence, () => {
        throw new Error('missing');
      }),
    /missing/,
  );
});

test('altered research claims or omitted records cannot pass by matching installed bytes', () => {
  const modified = structuredClone(evidence);
  modified.records.pop();
  assert.throws(() => verifyScrollBarEvidence(modified, read), /evidence changed/);
  const approved = { ...evidence, status: 'APPROVED' };
  assert.throws(() => verifyScrollBarEvidence(approved, read), /evidence changed/);
});

test('Draco notice keeps distribution pending without an obsolete offline claim', () => {
  const heading = dracoNoticeHeading('1.5.5');
  assert.match(heading, /1\.5\.5.*DISTRIBUTION REVIEW PENDING/);
  assert.doesNotMatch(heading, /OFFLINE|APPROVED/);
});
