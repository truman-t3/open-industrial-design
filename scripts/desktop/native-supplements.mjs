// SPDX-License-Identifier: MPL-2.0
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashes = {
  'licenses/native/alloc-stdlib-BSD-3-Clause.txt':
    'c0c56f26d9c051cac4d200c34c84e7ae9aaa853e01a982a1df08b09931e518ae',
  'licenses/native/defmt-MIT.txt':
    '0d17b75c1867fd568bcbb735f329d0d4253846c4b756a65e4d440c1e4bd59187',
  'licenses/native/webview2-rs-MIT.txt':
    '0dcf41516e608bbcb6cdc5229feb7b86fe4a643b85e7df251133c93408fdac73',
  'licenses/native/webview2-sdk-BSD-3-Clause.txt':
    '9995174528dba139ca753d02d8667dbec49f65ab17e65c643a914f2b58cfb4a2',
  LICENSE: '3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04',
};
const webviewCommit = 'edc2caf886175ccaebe86078c9cfe1ae2a187328';
const entries = [
  [
    'alloc-stdlib',
    '0.3.0',
    '0a81fd6928ea3b33c8cd484aa4575d50ffb98012',
    'dropbox/rust-alloc-no-stdlib',
    'LICENSE',
    'licenses/native/alloc-stdlib-BSD-3-Clause.txt',
  ],
  [
    'defmt-parser',
    '1.0.0',
    '4a8cdb44891ed57b8ff5a023b6bec7137c48708f',
    'knurling-rs/defmt',
    'LICENSE-MIT',
    'licenses/native/defmt-MIT.txt',
  ],
  [
    'selectors',
    '0.38.0',
    '572ecba2d1600e7c3d490586692a209faf703baa',
    'servo/stylo',
    'selectors/lib.rs',
    'LICENSE',
  ],
  [
    'webview2-com-macros',
    '0.8.1',
    'dffa41a8a46d3f5565eefbff2de57d38d399f158',
    'wravery/webview2-rs',
    'LICENSE',
    'licenses/native/webview2-rs-MIT.txt',
  ],
  [
    'webview2-com-sys',
    '0.39.1',
    webviewCommit,
    'wravery/webview2-rs',
    'LICENSE',
    'licenses/native/webview2-rs-MIT.txt',
  ],
  [
    'webview2-com',
    '0.39.1',
    webviewCommit,
    'wravery/webview2-rs',
    'LICENSE',
    'licenses/native/webview2-rs-MIT.txt',
  ],
];

/** Exact published version and VCS match; never apply evidence to a new version. */
export function supplementNativeNotices(
  report,
  read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url)),
) {
  const result = structuredClone(report);
  const evidence = (file) => {
    const bytes = read(file);
    if (sha256(bytes) !== hashes[file]) throw new Error(`Changed license evidence: ${file}`);
    return bytes;
  };
  for (const item of result.packages) {
    const match = entries.find(
      ([name, version, commit]) =>
        name === item.name && version === item.version && commit === item.vcs?.commit,
    );
    if (!match) continue;
    const [, , commit, repository, sourcePath, file] = match;
    if (
      item.repository?.replace(/\.git$/, '').replace(/\/$/, '') !==
      `https://github.com/${repository}`
    )
      throw new Error(`Repository mismatch for ${item.name}`);
    const bytes = evidence(file);
    item.notices.push({
      file,
      sha256: sha256(bytes),
      text: bytes.toString('utf8'),
      source: `https://github.com/${repository}/blob/${commit}/${sourcePath}`,
    });
    item.warnings = item.warnings.filter((warning) => warning !== 'no-notice-text-found');
    if (item.name === 'webview2-com-sys') {
      const sdkFile = 'licenses/native/webview2-sdk-BSD-3-Clause.txt';
      const sdk = evidence(sdkFile);
      item.notices.push({
        file: sdkFile,
        sha256: sha256(sdk),
        text: sdk.toString('utf8'),
        source: 'https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3800.47/License',
        component: 'WebView2LoaderStatic.lib x64',
        componentSha256: '89c6b872783b8f6c3cedbff618adb42082d455c615453ae10cfc753f1e8f25d8',
        componentGitBlob: '14f7340f49fcd566656ec32e579d2b637c239750',
      });
    }
  }
  return result;
}
