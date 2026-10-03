// SPDX-License-Identifier: MPL-2.0
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  collectPublicImages,
  reviewPublicImages,
  verifyDistributionReview,
} from './release-assets.mjs';
import { sha256 } from './build-license-notices.mjs';
const image = { file: 'demo/lamp.png', size: 3, sha256: sha256('png') };
const registry = () => ({
  schemaVersion: 1,
  images: [{ ...image, role: 'demo', origin: 'documented-AI', releaseAuthorization: 'pending' }],
});

test('distribution decisions require complete unchanged evidence, not a status flip', () => {
  const root = new URL('../', import.meta.url);
  const r = JSON.parse(readFileSync(new URL('licenses/release-assets.json', root)));
  const read = (file) => readFileSync(new URL(file, root));
  assert.ok(verifyDistributionReview(r, read));
  assert.throws(() => verifyDistributionReview(r, () => Buffer.from('modified')), /changed/);
  for (const mutate of [
    (x) => {
      delete x.distributionReview;
    },
    (x) => {
      x.distributionReview.files.pop();
    },
    (x) => {
      x.distributionReview.files[0].file = '../secret';
    },
    (x) => {
      x.distributionReview.files[0] = x.distributionReview.files[1];
    },
  ]) {
    const altered = structuredClone(r);
    mutate(altered);
    assert.throws(() => verifyDistributionReview(altered, read), /evidence/);
  }
});

test('unchanged image fingerprint tracks provenance without granting MPL or authorization', () => {
  const reviewed = reviewPublicImages([image], registry());
  assert.equal(reviewed[0].releaseAuthorization, 'pending');
  assert.equal(reviewed[0].license, undefined);
});

test('owner demo permission is limited to matching demo files and does not authorize brands', () => {
  const r = registry();
  r.demoAuthorization = {
    license: 'CC-BY-4.0',
    confirmedAt: '2026-10-03',
    document: 'DEMO_ASSETS_LICENSE.md',
    files: [{ file: image.file, sha256: image.sha256 }],
  };
  r.images[0].releaseAuthorization = 'owner-cc-by-4.0';
  assert.equal(reviewPublicImages([image], r)[0].releaseAuthorization, 'owner-cc-by-4.0');
  for (const change of [
    (x) => {
      x.images[0].role = 'brand';
    },
    (x) => {
      x.demoAuthorization.files[0].sha256 = 'f'.repeat(64);
    },
    (x) => {
      x.demoAuthorization.license = 'MIT';
    },
    (x) => {
      delete x.demoAuthorization;
    },
  ]) {
    const altered = structuredClone(r);
    change(altered);
    assert.throws(() => reviewPublicImages([image], altered), /requires review/);
  }
});
test('new, missing or modified public images require renewed review', () => {
  for (const observed of [
    [],
    [image, { ...image, file: 'demo/new.png' }],
    [{ ...image, sha256: 'a'.repeat(64) }],
    [{ ...image, size: 4 }],
  ])
    assert.throws(() => reviewPublicImages(observed, registry()), /changed|unreviewed/);
});
test('duplicates, unsafe records and invented distribution approval fail', () => {
  const duplicate = registry();
  duplicate.images.push({ ...duplicate.images[0] });
  assert.throws(() => reviewPublicImages([image], duplicate), /Duplicate/);
  assert.throws(() => reviewPublicImages([image, image], registry()), /Duplicate/);
  for (const patch of [
    { file: '../private.png' },
    { releaseAuthorization: 'approved' },
    { role: 'unknown' },
  ]) {
    const r = registry();
    Object.assign(r.images[0], patch);
    assert.throws(() => reviewPublicImages([image], r), /requires review/);
  }
});
test('collector reads fixed image files and rejects unexpected public archives without reading them', () => {
  const root = mkdtempSync(join(tmpdir(), 'oid-public-assets-'));
  try {
    mkdirSync(join(root, 'demo'));
    writeFileSync(join(root, 'demo/lamp.png'), 'png');
    writeFileSync(join(root, 'README.md'), 'documentation');
    assert.deepEqual(collectPublicImages(root), [image]);
    writeFileSync(join(root, 'private.oidproj'), 'do not read');
    assert.throws(() => collectPublicImages(root), /Unexpected public file/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('source image set requires runtime images but permits omitted reference boards', () => {
  const r = JSON.parse(readFileSync(new URL('../licenses/release-assets.json', import.meta.url)));
  const reviewed = reviewPublicImages(
    collectPublicImages(fileURLToPath(new URL('../brand/', import.meta.url))),
    r,
    { allowAbsentReferences: true },
  );
  assert.equal(reviewed.filter((image) => image.role !== 'reference-only').length, 21);
  assert.equal(reviewed.filter((image) => image.role === 'demo').length, 8);
  assert.equal(r.images.filter((image) => image.role === 'reference-only').length, 2);
  assert.equal(r.runtimeAssets.length, 2);
  assert.equal(r.runtimeAssets[1].remoteVersion, '1.5.5');
  assert.equal(r.runtimeAssets[1].historicalSeparatelyInstalledPackage, 'draco3d@1.5.7');
  assert.equal(
    r.runtimeAssets[1].packageVersion,
    '@open-industrial-design/three-viewer@0.1.0-alpha.1',
  );
});

test('source delivery can omit only references, while present references remain fingerprinted', () => {
  const r = registry();
  const reference = { ...image, file: 'social/reference.png', role: 'reference-only' };
  r.images.push({ ...reference, releaseAuthorization: 'pending' });
  const options = { allowAbsentReferences: true };
  assert.equal(reviewPublicImages([image], r, options).length, 1);
  assert.equal(reviewPublicImages([image, reference], r, options).length, 2);
  assert.throws(() => reviewPublicImages([image], r), /changed/);
  assert.throws(() => reviewPublicImages([reference], r, options), /changed/);
  assert.throws(
    () => reviewPublicImages([image, { ...reference, sha256: 'b'.repeat(64) }], r, options),
    /changed|unreviewed/,
  );
  assert.throws(
    () => reviewPublicImages([image, { ...reference, file: 'social/unknown.png' }], r, options),
    /changed|unreviewed/,
  );
});
