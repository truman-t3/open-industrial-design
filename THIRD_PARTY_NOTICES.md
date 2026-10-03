# Third-Party Notices — Community Alpha 0.1

This notice lists the direct runtime dependencies used by Open Industrial Design Community Alpha 0.1. It is an inventory, not a complete distribution notice bundle or legal advice. Installed package text alone is not evidence that notices reach recipients of a web build. The dependency-tree review and outstanding distribution requirements are recorded in [the release license review](./docs/release-license-review.md).

| Package                | Pinned version | License    | Use                        |
| ---------------------- | -------------: | ---------- | -------------------------- |
| React / React DOM      |         19.3.0 | MIT        | UI runtime                 |
| Konva                  |         10.5.0 | MIT        | Workspace Canvas rendering |
| react-konva            |         19.2.7 | MIT        | React Canvas adapter       |
| Zustand                |         5.0.15 | MIT        | Canvas runtime state       |
| Dexie                  |          4.4.6 | Apache-2.0 | IndexedDB adapter          |
| fflate                 |          0.8.3 | MIT        | `.oidproj` ZIP packaging   |
| @excalidraw/excalidraw |         0.18.1 | MIT        | Sketch Workspace adapter   |
| @xyflow/react          |        12.11.6 | MIT        | Design Graph visualization |
| Three.js               |        0.186.0 | MIT        | 3D review renderer         |
| @react-three/fiber     |          9.4.0 | MIT        | React Three.js renderer    |

Development tooling and transitive dependencies retain their own licenses. The 2026-10-01 installed-tree scan covers 274 production package names / 300 package versions and 425 total package names / 458 package versions. These counts describe dependency trees, not an exact list of modules bundled by Vite. No GPL, AGPL, or LGPL declaration was reported in that scan; this is not a file-level license certification.

Review details that must not be flattened into a generic MIT notice:

- `khroma@2.1.0` has no package.json license field, so pnpm reports Unknown. Its installed `license` file is MIT; preserve that original copyright and text. The review records its SHA256 rather than changing installed metadata.
- `dompurify@3.4.15` declares `(MPL-2.0 OR Apache-2.0)` and includes both license texts plus a source header. Review the distribution path under the selected alternative.
- `pako@2.0.3` declares `(MIT AND Zlib)`; its package root contains MIT text, while zlib-derived source headers require separate preservation review.
- Dexie includes a separate `NOTICE`, which has been collected with its Apache-2.0 text.
- The web build includes four Assistant WOFF2 fonts. Their exact bytes, embedded copyrights and OFL-1.1 declarations were checked on 2026-10-02; the font notice is retained separately from package MIT licenses in [the reviewed supplement registry](./licenses/README.md).

The initial local collector found 42 production package versions without separate notice-text files. On 2026-10-02, 38 were supplemented with original texts at fixed upstream commits; 4 remain unresolved. For 14 historical Radix versions, all 29 embedded source-map files matched fixed upstream source contents, with CRLF-to-LF normalization only; this does not identify the entire checkout as an exact release. Builds recheck the recorded source-map and content hashes offline. This is a notice-preparation gap, not a conclusion that unresolved packages cannot be used. Web builds now automatically include `dist/licenses/LICENSE`, project notices, a third-party draft and machine-readable inventory. They are explicitly not approved for distribution; `pnpm run notices:check` rejects unresolved items and pending corresponding-source availability.

Research evidence stays in the workspace's `artifacts/qa/licenses`; reviewed supplements are in `licenses/`. Do not ship the draft as a completed compliance bundle. Before release, rerun against the exact lockfile, inspect remaining file-level and remote asset terms, and verify corresponding-source information and release authorization. The application itself remains MPL-2.0, not MIT.

The separate [asset review](./docs/release-asset-review.md) records public image provenance and remote runtime boundaries. Builds verify 23 public image fingerprints, without assigning them a code license or approving redistribution. Excalidraw sketch-font CDN assets and the viewer's default remote Draco 1.5.5 decoder are not covered merely by four bundled Assistant font notices or the installed draco3d 1.5.7 supplement. Image authorizations and remote asset review also block `notices:check`.

Update 2026-10-03: Drei was removed. Camera controls now use the already pinned Three.js OrbitControls through a local React lifecycle adapter. Its 30 exclusive dependency snapshots, including maath, stats-gl, MediaPipe and draco3d 1.5.7, were removed from the lockfile. The current production inventory contains 263 package versions and no missing package-level notices. The local byte-verified Draco 1.5.5 runtime remains; its separate notice and asset checks are unchanged. Earlier counts and runtime findings are historical, not the current installed inventory. Asset distribution and corresponding-source availability remain separate release gates.

The [runtime notice review](./docs/runtime-asset-notices.md) matches 234 installed sketch-font files to a fixed Excalidraw commit and supplements seven families (229 files), preserving embedded restrictions and separate font terms. Lilita and Nunito retain historical family OFL texts plus installed copyrights, not an exact Google Fonts release match; Lilita's differing reserved-name wording remains a review item. Xiaolai retains its pinned explicit OFL-1.1 declaration plus the unchanged official body without a substituted copyright. Liberation Sans 1.05 still lacks an exact-version license binding; historical GPL v2, exception agreement and README originals remain a separate candidate with both the source 1.02 and installed 1.05 metadata preserved. Known historical version-number errors do not prove or disprove correspondence; the original conversion source is still missing. These are not OFL or proof of a completed source offer. The complete Draco 1.5.5 source LICENSE is collected with its file-specific appendices, and three actual CDN decoder files match that fixed commit by size and Git blob fingerprint as of 2026-10-02. This snapshot does not guarantee future CDN responses or certify offline operation, corresponding-source availability or distribution approval. Builds check recorded evidence offline and retain texts and fingerprints in the draft; neither text collection nor byte matching changes the application license or approves distribution.

The `packages/three-viewer/src/fixtures/minimal-triangle.glb` fixture is generated in-repository by `packages/three-viewer/scripts/generate-minimal-glb.mjs`. It contains only a single authored triangle and no third-party asset content.
