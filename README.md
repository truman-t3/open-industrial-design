<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./brand/logo/open-industrial-design-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./brand/logo/open-industrial-design-logo-primary.png">
    <img alt="Open Industrial Design" src="./brand/logo/open-industrial-design-logo-primary.png" width="620">
  </picture>
</p>

# Open Industrial Design Community Alpha 0.1

**Open Industrial Design** is an open-source, local-first, model-agnostic industrial design workspace for early product exploration.

It helps designers keep references, sketches, concepts, variants, CMF, design lineage, lightweight 3D review, and portable project backups together before CAD work begins. It is not a CAD modeller, a cloud collaboration service, or an AI-provider account platform.

## Alpha capabilities

- Local Projects with recent-project recovery, multiple Boards, autosave, and `Ctrl/Cmd + S` save flush.
- Industrial-design Canvas cards for Reference, Image, Sketch, Concept, Variant, Multi-view, CMF, and 3D review.
- Manual Canvas generation with one main image and up to four references, persisted input connections, independently selectable candidate cards, comparison, and continued exploration before adoption.
- Editable task briefs for sketch rendering, shape blending, style exploration, form changes, CMF, views, scenes, and local editing; these are workflows, not guarantees of model capability or output quality.
- Design lineage in Graph view; `parentDesignId` remains the source of truth.
- Excalidraw-backed Sketch Workspace, saved as editable scene data plus a static Canvas preview.
- GLB and GLTF review: orbit, pan, zoom, standard views, fit, grid/ground controls, and locally stored captures.
- Portable `.oidproj` export/import with schema validation, migration, binary Asset/Blob packaging, and secret-field rejection.
- Bring-your-own-key (BYOK) OpenAI-compatible Provider settings for text, vision, and image capabilities. Provider keys remain outside Projects and `.oidproj` archives.

## Local-first and privacy

Project records and assets live in this browser's IndexedDB. No login or Open Industrial Design cloud service is required. API keys are stored separately from domain records: they may be session-only or remembered locally in the browser, and are never exported in `.oidproj` files.

Review the local-data implications before clearing browser site storage. Export an `.oidproj` backup before moving browsers or clearing data.

Local data is scoped to the browser and origin (protocol, hostname, and port). Changing from `localhost` to `127.0.0.1`, or changing the preview port, does not transfer projects. Remembered keys are local browser storage, not an encrypted system credential vault. Only configure trusted endpoints: generation sends the selected inputs and request to that provider.

## Supported formats

| Area             | Current Alpha support                  |
| ---------------- | -------------------------------------- |
| Reference        | Browser-supported image files          |
| Sketch           | Excalidraw scene data with PNG preview |
| 3D review        | `.glb`, `.gltf`                        |
| Portable project | `.oidproj`                             |

STEP, IGES, BREP, NURBS editing, CAD export, Blender/Rhino/KeyShot integration, cloud sync, accounts, and collaboration are not implemented in this Alpha.

## Start developing

Verified development environment: Node.js 24.14.0 and pnpm 11.19.0. The application version is `0.1.0-alpha.1`; the checkout directory's older version suffix is not the release version.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. Before a release candidate, run:

```bash
pnpm run release:check
```

On Windows PowerShell, use `pnpm.cmd` if script execution blocks `pnpm`. This gate verifies version consistency, the committed minimal GLB fixture, formatting, linting, notice-script regressions, TypeScript, unit tests, and the production build. Web builds include an explicitly incomplete `dist/licenses` draft. The separate `pnpm run notices:check` distribution-text gate currently fails on unresolved notices and source availability; quality success is not release approval. See the Chinese [usage and backup guide](./docs/community-alpha-quickstart.md), [notice preparation](./licenses/README.md) and [release gate](./docs/alpha-0.1-release.md).

## Known Alpha limitations

- AI calls require a user-provided compatible endpoint and API key; no real provider credential is included in this repository.
- The current project's browser export/import/refresh loop has been verified locally. A complete target-browser release smoke test, including Sketch and 3D interaction, remains a separate release requirement.
- Connection success does not prove image editing, multi-image, or mask support. Cancellation does not guarantee that a provider will waive charges. Generated views are not geometrically verified CAD views.
- Pattern placement, dedicated upscaling/background removal, AI 3D generation, and cloud collaboration are not implemented. Core Canvas acceptance is not full product or public-release acceptance.
- Sketch and 3D review are creative/review tools, not CAD authoring systems.
- Large editor dependencies are lazy-loaded, but their dynamic chunks remain a future bundle-optimization target.

## Open source

Project-authored Community source is licensed under [MPL-2.0](./LICENSE); see the [source license notice](./SOURCE_LICENSE.md) for scope and exclusions. Contributions use [DCO 1.1](./DCO.txt); see [CONTRIBUTING.md](./CONTRIBUTING.md). The Open Industrial Design name and brand assets are covered by [TRADEMARKS.md](./TRADEMARKS.md). The [runtime dependency inventory](./THIRD_PARTY_NOTICES.md) and [release license review](./docs/release-license-review.md) distinguish reviewed evidence from notices still required before distribution.
