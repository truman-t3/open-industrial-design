# Third-party notice supplements

## Current notice decision — 2026-10-03

Web assets are now emitted from the reviewed runtime-only image list: 21 images, with both reference-only boards excluded. The 23-image workspace registry still preserves their original fingerprints. Originals and internal source snapshots are retained, not approved for public redistribution. Historical 23-image pending counts below refer to the earlier whole-directory copy.

There are now **39 supplemented package versions and 3 unresolved package notices**: MediaPipe tasks-vision 0.10.17, maath 0.10.8 and stats-gl 2.4.2. This supersedes the earlier 38/4 inventory below.

The missing package notice for react-remove-scroll-bar 2.3.8 is resolved using the original MIT LICENSE at commit `7301c160fda44cb8cf2b9fdfde61efad35736196`, the installed manifest's MIT declaration and the recorded source comparison. All 12 runtime files match compiled upstream sources exactly; 9 declarations match exactly and 3 differ only by the legacy `declare` keyword. The upstream manifest says 2.3.7, so this decision does not claim an exact release tag or original compiler reconstruction. Builds check all 27 installed file fingerprints and bind the supplement to the reviewed commit, manifest and original license hash. The earlier research snapshot remains unchanged for auditability. Existing MIT terms are used; no additional author permission was requested or is needed to collect this notice.

This closes only that package's missing-notice item. It does not approve overall distribution. Local font/Draco hosting and offline checks have since passed; font provenance, image rights and corresponding-source obligations remain separate review items.

Open Industrial Design Community source remains **MPL-2.0**. This directory preserves separately licensed dependency/font notices; it does not relicense the application or grant brand/image rights.

`supplemental-notices.json` binds 38 installed package versions to original texts at immutable upstream commits, their installed package.json hashes, and public version references. Fourteen historical Radix versions lack resolvable release references: all 29 embedded source files in their published source maps were compared with fixed upstream commits before publication, normalizing CRLF to LF only. This is an exact source-content match, not a claim that the entire upstream checkout is the release. Builds recheck source-map bytes, complete embedded-source coverage and each reviewed source hash offline; changed or missing evidence fails rather than silently falling back to a moving branch. Texts are stored under SHA256 filenames in `texts/` and must not be reformatted. Four Assistant 3.000 WOFF2 files are bound by their byte hashes; their name tables declare OFL-1.1 and the retained copyrights. The font notice combines those exact copyrights with the unchanged [official OFL body](https://openfontlicense.org/documents/OFL.txt), excluding its example copyright header.

Normal builds are offline. After Vite builds, `scripts/build-license-notices.mjs` collects installed production-tree notices, adds reviewed supplements, preserves pako zlib source headers and Dexie's NOTICE, and writes `apps/web/dist/licenses/`. It uses an explicit first-party file allowlist, never workspace projects, credentials, or QA logs. Package-level licenses do not override asset licenses.

The three maath 0.10.8 easing build files also retain the original Max Kaufmann Quaternion Damp MIT comment. The build checks its exact text hash and preserves each file's comment with `scope: file-level-only`. These component notices do not resolve maath's package-level notice gap; partial notices must not silently mark the entire package complete.

`release-assets.json` separately fingerprints 23 public PNG images (eight demos, thirteen brand files and two reference-only brand boards) and records two known remote runtime asset paths. Each build verifies source and output image bytes and the reviewed dependency loader sources. Matching hashes and repository origin statements do not grant image/brand redistribution rights; all 23 image authorizations and both remote-asset reviews remain pending. See [the asset review](../docs/release-asset-review.md). Unexpected public files or changed images require renewed review, not silently accepting a new hash.

The generated bundle is explicitly **DRAFT_NOT_APPROVED_FOR_DISTRIBUTION**. It covers a conservative installed dependency tree, not an exact bundle or all remotely loaded assets. Four package-version notices remain unresolved: MediaPipe tasks-vision 0.10.17, maath 0.10.8, react-remove-scroll-bar 2.3.8 and stats-gl 2.4.2. Corresponding-source availability, example/brand provenance and release authorization remain separate requirements. See [the dated review](../docs/release-license-review.md).

Commands from the repository root:

```powershell
pnpm.cmd run notices:test
pnpm.cmd run build
pnpm.cmd run notices:check
```

The last command must currently fail; it cannot silently accept unresolved notices/fonts, absent runtime font evidence or pending full font texts, missing corresponding-source information, absent asset review, pending image authorization or remote-asset review. Updating a dependency or a bound text requires renewed provenance review, not replacing a hash to make a check pass. Automatic tests verify integrity and guard behavior, not legal compliance.

## Runtime notice evidence

`runtime-notice-evidence.json` records 234 installed Excalidraw font fingerprints matched to a fixed upstream Git tree, seven additional font-family notices and the complete pinned Draco 1.5.5 source LICENSE. Lilita and Nunito retain historical Google Fonts OFL texts alongside installed name-table metadata, without claiming exact release-byte equivalence. Lilita's differing reserved names are preserved separately and require applicability review. Xiaolai retains its pinned explicit OFL-1.1 declaration plus the unchanged official body already reviewed for Assistant, without Assistant's copyright or a claim to an author-original full license file. The build verifies this evidence offline and includes collected texts in its draft. Liberation Sans 1.05 still lacks an exact-version binding: `legacyFontResearch` separately preserves a historical GPL-v2-with-exceptions agreement, COPYING and README, whose accompanying SFD says 1.02. The original font conversion source remains missing; historical internal-version errors mean those numbers alone cannot resolve provenance. Candidate texts remain explicitly unbound, not approved notices or a completed source offer. Three actual Draco CDN decoder files were matched to the fixed 1.5.5 Git tree on 2026-10-02; `cdnByteVerification` preserves their sizes, SHA256 and Git blob fingerprints. Builds verify this reviewed snapshot offline, not future CDN responses. Offline operation, local hosting and distribution review remain pending. See [runtime asset notice review](../docs/runtime-asset-notices.md). Byte matching is not release approval and does not change MPL-2.0.
