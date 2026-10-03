// SPDX-License-Identifier: MPL-2.0
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  readRuntimeNoticeEvidence,
  verifyRuntimeNoticeEvidence,
} from './runtime-notice-evidence.mjs';
const repo = fileURLToPath(new URL('../', import.meta.url));
const evidence = JSON.parse(
  readFileSync(new URL('../licenses/runtime-notice-evidence.json', import.meta.url)),
);
const copy = () => structuredClone(evidence);
const observed = () =>
  evidence.files.map(({ file, sha256, size, gitBlobSha1 }) => ({
    file,
    sha256,
    size,
    gitBlobSha1,
  }));

test('fixed installed fonts and collected original texts verify without claiming remote or offline completion', () => {
  const r = readRuntimeNoticeEvidence(repo);
  assert.equal(r.files.length, 234);
  assert.equal(r.notices.length, 7);
  assert.equal(
    r.notices.reduce((sum, n) => sum + n.files.length, 0),
    229,
  );
  assert.deepEqual(r.pendingFontFamilies, ['Liberation']);
  assert.equal(r.draco.version, '1.5.5');
  assert.match(r.draco.bindingStatus, /verified-offline-pending/);
  assert.equal(r.draco.cdnByteVerification.files.length, 3);
  assert.match(r.draco.text, /ASCIIMathML\.js/);
  assert.match(r.draco.text, /unlicense\.org/);
});
test('historical family OFL retains installed metadata and does not claim release-byte equivalence', () => {
  const lilita = evidence.notices.find((n) => n.family === 'Lilita');
  assert.match(lilita.text, /Reserved Font Name Lilita/);
  assert.match(
    lilita.fontMetadata.names.find((n) => n.id === 0).text,
    /Reserved Font Names "Lilita One"/,
  );
  for (const family of ['Lilita', 'Nunito']) {
    for (const mutate of [
      (n) => {
        n.sourceCommit = 'main';
      },
      (n) => {
        n.source = n.source.replace(n.sourceCommit, 'main');
      },
      (n) => {
        n.fontMetadata.names[0].text = 'omitted copyright';
      },
      (n) => {
        n.fontMetadata.sha256 = 'a'.repeat(64);
      },
      (n) => {
        n.bindingScope = 'exact-release';
      },
      (n) => {
        n.text += 'changed';
        n.textSha256 = createHash('sha256').update(n.text).digest('hex');
        n.sourceSha256 = n.textSha256;
      },
    ]) {
      const r = copy();
      mutate(r.notices.find((n) => n.family === family));
      assert.throws(
        () => verifyRuntimeNoticeEvidence(r, observed()),
        /font notice evidence changed/,
      );
    }
  }
});
test('Xiaolai pinned declaration preserves copyright and independently sourced unchanged OFL body', () => {
  const notice = evidence.notices.find((n) => n.family === 'Xiaolai');
  assert.match(notice.text, /Copyright © 2020 LXGW/);
  assert.match(
    notice.text,
    /license: This Font Software is licensed under the SIL Open Font License, Version 1\.1/,
  );
  assert.match(notice.text, /SIL OPEN FONT LICENSE Version 1\.1 - 26 February 2007/);
  assert.doesNotMatch(notice.text, /Assistant Project Authors/);
  for (const mutate of [
    (n) => {
      n.sourceSha256 = 'a'.repeat(64);
    },
    (n) => {
      n.declarationSha256 = 'a'.repeat(64);
    },
    (n) => {
      n.licenseBody.source = 'https://example.com/OFL';
    },
    (n) => {
      n.licenseBody.sourceSha256 = 'a'.repeat(64);
    },
    (n) => {
      n.licenseBody.textSha256 = 'a'.repeat(64);
    },
    (n) => {
      n.licenseBody.reusedFrom = 'unknown';
    },
    (n) => {
      n.bindingScope = 'author-original-full-license-file';
    },
    (n) => {
      n.text = n.text.replace('Copyright © 2020 LXGW', 'Copyright removed');
      n.textSha256 = createHash('sha256').update(n.text).digest('hex');
    },
  ]) {
    const r = copy();
    mutate(r.notices.find((n) => n.family === 'Xiaolai'));
    assert.throws(
      () => verifyRuntimeNoticeEvidence(r, observed()),
      /Declared font OFL evidence changed/,
    );
  }
});
test('changed runtime font bytes, size, Git blob or unsafe path require renewed review', () => {
  for (const patch of [
    { sha256: 'a'.repeat(64) },
    { size: 1 },
    { gitBlobSha1: 'a'.repeat(40) },
    { file: '../private.woff2' },
  ]) {
    const current = observed();
    Object.assign(current[0], patch);
    assert.throws(() => verifyRuntimeNoticeEvidence(copy(), current), /provenance changed/);
  }
});
test('missing and duplicated fonts are rejected in recorded and installed inventories', () => {
  assert.throws(() => verifyRuntimeNoticeEvidence(copy(), observed().slice(1)), /set changed/);
  const duplicate = observed();
  duplicate.push(duplicate[0]);
  assert.throws(() => verifyRuntimeNoticeEvidence(copy(), duplicate), /Duplicate/);
  const r = copy();
  r.files.push(r.files[0]);
  assert.throws(() => verifyRuntimeNoticeEvidence(r, observed()), /Duplicate/);
});
test('changed text, unpinned source, duplicate notices and partial family binding fail', () => {
  for (const mutate of [
    (r) => {
      r.notices[0].text += 'changed';
    },
    (r) => {
      r.notices[0].source = r.notices[0].source.replace(r.commit, 'master');
    },
    (r) => {
      r.notices.push(r.notices[0]);
    },
    (r) => {
      r.notices[0].files = [];
    },
  ]) {
    const r = copy();
    mutate(r);
    assert.throws(() => verifyRuntimeNoticeEvidence(r, observed()), /notice|source/i);
  }
});
test('pending font families cannot be silently removed or double classified', () => {
  const removed = copy();
  removed.pendingFontFamilies = [];
  assert.throws(() => verifyRuntimeNoticeEvidence(removed, observed()), /review incomplete/);
  const duplicate = copy();
  duplicate.pendingFontFamilies.push('Virgil');
  assert.throws(() => verifyRuntimeNoticeEvidence(duplicate, observed()), /Invalid pending/);
});
test('decoder original text remains bound to reviewed 1.5.5 and cannot imply full approval', () => {
  for (const patch of [
    { version: '1.5.7' },
    { source: 'https://example.com/LICENSE' },
    { text: 'Apache License' },
    { sha256: 'a'.repeat(64) },
    { bindingStatus: 'verified' },
    { commit: 'a'.repeat(40) },
  ]) {
    const r = copy();
    Object.assign(r.draco, patch);
    assert.throws(() => verifyRuntimeNoticeEvidence(r, observed()), /decoder notice changed/);
  }
});
test('CDN byte snapshot rejects missing, partial, changed or falsely approved proofs', () => {
  const proof = evidence.draco.cdnByteVerification;
  assert.equal(proof.checkedAt, '2026-10-02');
  assert.equal(proof.commit, evidence.draco.commit);
  assert.match(proof.status, /offline-and-distribution-review-pending/);
  assert.deepEqual(
    proof.files.map((file) => file.file),
    ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm'],
  );
  for (const mutate of [
    (r) => {
      delete r.draco.cdnByteVerification;
    },
    (r) => {
      r.draco.cdnByteVerification.files.pop();
    },
    (r) => {
      r.draco.cdnByteVerification.files.push(proof.files[0]);
    },
    (r) => {
      r.draco.cdnByteVerification.files[0].sha256 = 'a'.repeat(64);
    },
    (r) => {
      r.draco.cdnByteVerification.files[0].gitBlobSha1 = 'a'.repeat(40);
    },
    (r) => {
      r.draco.cdnByteVerification.files[0].size++;
    },
    (r) => {
      r.draco.cdnByteVerification.files[0].url = 'https://example.com/decoder.js';
    },
    (r) => {
      r.draco.cdnByteVerification.files[0].upstreamPath = 'javascript/draco_decoder_gltf.js';
    },
    (r) => {
      r.draco.cdnByteVerification.status = 'offline-and-distribution-approved';
    },
    (r) => {
      r.draco.cdnByteVerification.commit = 'main';
    },
    (r) => {
      r.draco.cdnByteVerification.checkedAt = '2026-10-03';
    },
  ]) {
    const r = copy();
    mutate(r);
    assert.throws(() => verifyRuntimeNoticeEvidence(r, observed()), /decoder byte evidence/);
  }
});
test('Liberation historical GPL and exception originals cannot approve installed 1.05 or hide source-version mismatch', () => {
  const legacy = evidence.legacyFontResearch;
  assert.equal(legacy.status, 'historical-original-collected-version-binding-pending');
  assert.ok(legacy.sourceFont.metadata.includes('Version: 1.02'));
  assert.equal(legacy.installedMetadata.find((n) => n.id === 5).text, 'Version 1.05 ');
  assert.match(
    legacy.sourceTexts.find((s) => s.path.endsWith('License.txt')).text,
    /GNU General Public License v\.2/,
  );
  assert.match(
    legacy.sourceTexts.find((s) => s.path.endsWith('License.txt')).text,
    /special exception/,
  );
  assert.match(
    legacy.sourceTexts.find((s) => s.path.endsWith('COPYING')).text,
    /Version 2, June 1991/,
  );
  for (const mutate of [
    (r) => {
      delete r.legacyFontResearch;
    },
    (r) => {
      r.legacyFontResearch.status = 'approved';
    },
    (r) => {
      r.legacyFontResearch.sourceFont.metadata[4] = 'Version: 1.05';
    },
    (r) => {
      r.legacyFontResearch.installedMetadata[0].text = 'copyright omitted';
    },
    (r) => {
      r.legacyFontResearch.sourceTexts[0].url = r.legacyFontResearch.sourceTexts[0].url.replace(
        r.legacyFontResearch.sourceCommit,
        'main',
      );
    },
    (r) => {
      r.legacyFontResearch.sourceTexts.pop();
    },
    (r) => {
      const s = r.legacyFontResearch.sourceTexts[0];
      s.text = 'OFL';
      s.sha256 = createHash('sha256').update(s.text).digest('hex');
    },
  ]) {
    const r = copy();
    mutate(r);
    assert.throws(() => verifyRuntimeNoticeEvidence(r, observed()), /Legacy font candidate/);
  }
});
