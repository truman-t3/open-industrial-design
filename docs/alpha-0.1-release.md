# Community Alpha 0.1 Release Gate

Version: `0.1.0-alpha.1`

## Prepared prerelease summary (not published)

Title and tag: **Open Industrial Design v0.1.0-alpha.1** / **`v0.1.0-alpha.1`**.

- Local-first design exploration with Canvas, Sketch, Graph, BYOK generation and GLB/GLTF review.
- Portable `.oidproj` backups; credentials excluded from project archives.
- Stable demo names and collision-free placement for new sketches and imported models.
- Chinese README introduction, Issue/PR templates and contributor/security guidance.
- Eight demo images under CC BY 4.0; preserve attribution and modification notices. Brand policy and MPL-2.0 source licensing remain separate.

Known limits: Alpha, not CAD; provider capabilities and generated results vary; native IME, physical input devices and real GPU coverage are incomplete; editor chunks remain large. Back up browser data before clearing site storage or changing origin. No new paid model calls were used for this publication-preparation pass.

Publish only after verifying anonymous source retrieval at the exact release commit and enabling/testing private vulnerability reporting. Do not attach workspace QA data, private projects, credentials or reference-only boards. No Release or tag is created by this document.

Latest verification (2026-10-03): 252 automated tests and the production build passed locally. A fresh GitHub source install and the first read-only Linux CI run passed. The isolated Chromium Sketch/3D/backup flow is verified; see [current status](./release-status.md) for evidence scope and remaining distribution blockers. Earlier test counts below are historical. The planned prerelease tag is `v0.1.0-alpha.1`, with title `Open Industrial Design v0.1.0-alpha.1`; no Release has been published. Keep repository visibility unchanged until the distribution gate is satisfied.

Status as of 2026-10-01: the local Canvas exploration milestone has passed its scoped verification, including the current project's export/import/refresh loop. The latest recorded automated gate passed 186 tests and the production build. This is not public-release approval. The full target-browser Sketch/3D smoke path, native IME and physical input devices, distribution choice, and completed distribution notices remain separate requirements. Model-quality and bundle-size improvements are deferred.

Subsequent isolated Playwright Chromium 151.0.7922.34 verification passed actual Sketch drawing/save, minimal GLB interaction/capture, held-Space mouse pan with unchanged node data, browser download, official import, and refresh recovery. Node/edge/sketch records and all three Blob store hashes compared identically. Software WebGL and third-party deprecation warnings remain; native IME, physical input devices, real GPU, and the full intended embedded-browser path are not certified by this run. Evidence is retained in the workspace's `artifacts/qa/发布前浏览器核验.md`. The missing-model 3D guidance now uses the existing localized entry; its Chinese and English browser branches passed, and the subsequent full automated gate passed 186 tests and build with exit code 0.

This is a release-readiness gate, not a statement that every future roadmap capability is complete. Do not call an Alpha build release-ready when a required automated check fails.

## Required automated gate

Run from the repository root:

```bash
pnpm run release:check
```

The command verifies, in order:

1. Application and workspace version consistency.
2. The committed minimal GLB fixture has a valid glTF 2.0 header.
3. Formatting, linting, and TypeScript checks.
4. All workspace unit tests.
5. The production web build.

The gate is pass/fail. Vite bundle-size warnings are recorded separately and do not turn a successful build into a pass for a broken runtime.

## Required manual smoke path

Use a clean browser profile when possible. Do not enter a production API key in shared screenshots, recordings, or issue reports.

Preserve the user's existing project. Use an isolated test profile for clean-state checks rather than deleting the only project or filling its recent list with test projects. Paid provider requests require explicit authorization; existing fixtures are not proof of a live request.

1. Home → create a Project → create and switch a Board.
2. Import an image Reference → create a Concept → open and save a Sketch.
3. Open Graph and verify the selected Concept is shown.
4. Import `packages/three-viewer/src/fixtures/minimal-triangle.glb` → orbit/zoom → choose a preset → Fit → Capture → return to Canvas.
5. Refresh → reopen the Project → verify Boards, Reference, Sketch preview, 3D capture, and Design lineage remain.
6. Export `.oidproj` → import it through the browser file chooser → verify Project, Boards, Nodes, Assets, Sketch data/preview, 3D preview, and lineage restore.
7. Open Provider Settings. With an intentionally invalid configuration, verify a clear error without displaying the API key. With a real BYOK credential only in an authorized local environment: Test Connection → Analyze Design → Generate Variant → Candidate Tray → Keep.

Also verify the Canvas path: connect main/reference images → edit a task brief → manually generate → independently select and drag candidates → compare → continue exploration → adopt Concept/Variant/Reference → inspect Graph → export/import → refresh. Check native Chinese IME composition and actual held-Space mouse panning without moving nodes. Component event tests alone do not certify these browser interactions.

Before public distribution, choose web versus desktop scope and review LICENSE, DCO, trademark terms, SPDX/dependency notices, and dependencies included in the release. This gate does not authorize publishing, signing, uploading user backups, or adding desktop packaging.

The [license review](./release-license-review.md) records installed-tree inventory and canonical MPL text verification. The 2026-10-02 follow-ups supplemented 38 of the initial 42 missing package notices, checked four Assistant fonts and pako zlib headers, and added offline notice collection to every Web build. Fourteen historical Radix versions use complete embedded-source matches (29 files) against fixed upstream commits, checked again during builds. The generated `dist/licenses` bundle remains explicitly a draft: 4 package versions and corresponding-source availability are unresolved. `pnpm run notices:check` is a separate distribution-text gate and currently fails as expected; `release:check` checks software quality, not release authorization. Complete remaining provenance, remote assets and source retrieval before distribution.

## Automated coverage and manual boundary

The [asset review](./release-asset-review.md) adds build-time source/output fingerprint checks for 23 public images and records two known remote font/decoder paths. Image rights, exact remote assets and source availability remain distribution blockers even after package notices are complete; static loader inspection is not an offline browser test.

| Area            | Automated coverage                                                                                   | Manual external verification                                   |
| --------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Project archive | schema migration, corrupt ZIP, unsafe path, missing Blob, secret rejection, 3D serializable state    | Browser download → chooser import loop                         |
| Storage         | snapshot restore, Board/Project deletion, archive restore transaction, candidate/3D Blob persistence | Browser IndexedDB quota and browser-specific privacy settings  |
| AI / BYOK       | capability routing, HTTP error normalization, credential isolation, candidate persistence            | Real provider endpoint, API key, quota, and model availability |
| 3D              | file format validation, serializable viewer state, committed GLB header check                        | GPU/browser GLB parsing, orbit/zoom/capture interaction        |
| Sketch          | scene and PNG-preview persistence boundary                                                           | Browser-specific Excalidraw loading and editing                |

## Failure expectations

- Corrupt, unsafe, newer-schema, or missing-Blob `.oidproj` archives must fail before repository restore.
- Provider errors must state an actionable category (configuration, unauthorized, timeout, unsupported capability, or request failure) without including keys, tokens, or Authorization headers.
- Invalid 3D files must fail at import or load with a visible message; no domain object should be created after validation fails.
- IndexedDB read/write errors must show the local-storage recovery message and leave already-persisted data untouched.

## Release evidence

Record the exact command output status, browser version, smoke result, and any provider test boundary in the release issue or tag notes. Never attach `.oidproj` archives containing user work or API credentials to public tickets.
