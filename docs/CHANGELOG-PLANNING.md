# Planning Changelog

## v0.2

### Changed

- Added `Reuse-first Architecture`.
- Promoted Excalidraw from reference-only UX inspiration to a planned runtime dependency for the embedded Sketch Workspace.
- Promoted React Flow from future candidate to planned Community v0.1 dependency for Design Graph View.
- Kept Konva as the main Workspace Canvas.
- Kept Three.js as 3D infrastructure.
- Added `SketchDocument` to isolate Excalidraw scene data from Open Industrial Design domain.
- Added `GraphViewState` and explicit Domain → Graph Adapter.
- Rebuilt Codex phase tasks around the new reuse strategy.
- Added exact dependency re-audit requirement before release.

### Unchanged

Open Industrial Design still owns:

- Design Entity
- Design Graph semantics
- Design DNA
- ViewSet
- CMF
- Generation lineage
- Provider abstraction
- `.oidproj`
- Industrial design workflow

### Explicit Non-goal

Open Industrial Design is not becoming an Excalidraw fork or a React Flow app with industrial-design labels.

## v0.3

### UX decisions frozen

- Home-first entry.
- Simple project structure with optional Boards.
- Imported images stay neutral until converted.
- Variant creation automatically creates lineage.
- Canvas / Graph are separate workspace views.
- Sketch editing uses dedicated embedded editor.
- AI is task-oriented rather than chat-first.
- Multiple AI outputs use Candidate Tray.
- Autosave is default with visible save status.
- `.oidproj` is the primary portable project mental model.
- Chinese + English planned for first public release.
- Approved design exposes "Ready for CAD" status.

### Desktop target frozen

- Tauri 2 planned as desktop shell.
- Windows Setup + Portable.
- macOS DMG.
- Local Mode + Portable Mode.
- Desktop becomes the long-term primary professional distribution.

## v0.4

### Licensing frozen

- Community Core license changed from candidate status to **MPL-2.0**.
- Added `docs/licensing-strategy.md`.
- Added DCO 1.1 contribution policy.
- Added root `CONTRIBUTING.md`.
- Added root `DCO.txt`.
- Added draft `TRADEMARKS.md`.
- Apache-2.0 is no longer the planned project license.

### Brand reset

- `MorphSet` rejected after public-name collision screening.
- Existing GitHub/research/technical uses make the name insufficiently distinctive.
- `Open Industrial Design` remains development codename only.
- Final public brand will be selected in a separate naming round.
- Brand strings and project-file extension must remain replaceable until then.

## v0.5 — Open Industrial Design Brand Freeze

### Public brand

- Final development brand frozen as **Open Industrial Design**.
- Recommended descriptor: **Open Industrial Design — Open-source Industrial Design Workspace**.
- Chinese descriptor: **Open Industrial Design｜开源工业设计工作台**.
- Former `FormGraph` references migrated to Open Industrial Design.
- `MorphSet` and `OpenProto` remain rejected historical candidates only and are not public brands.

### Project identity

- canonical repository/package identifier: `open-industrial-design`;
- canonical portable project extension: `.oidproj`;
- product-family pattern established for Community / Desktop / Cloud / Studio / SDK / Enterprise.

### Licensing

- Community Core remains **MPL-2.0**.
- Contribution policy remains **DCO 1.1**.
- Added root `LICENSE` containing the standard MPL-2.0 text.
- Brand rights remain separate from the source-code license.

### Engineering rule

- Brand name remains centralized in application metadata / i18n.
- `.oidproj` schema remains versioned and migration-aware.

## v0.6 — Brand Assets

- Added canonical transparent PNG logo assets.
- Added theme-aware GitHub README logo usage.
- Added app/repository icon size set from 1024 px to 16 px.
- Added monochrome black and white lockups.
- Added `brand/README.md` and `docs/brand-assets.md`.
- Kept the identity concept board as reference-only.
- Deferred manually reconstructed SVG master until pre-release brand polish.

## v0.7 — Open Industrial Design Rebrand

- Replaced the previous logo system with the new Open Industrial Design brand assets.
- Migrated README and brand documentation to the direct project name `Open Industrial Design`.
- Added new horizontal transparent logos (primary / dark / black / white).
- Added new standalone icon size set from 1024 px to 16 px.
- Added GitHub avatar and kept the two brand boards as reference-only assets.
- Updated manifest and brand asset specifications.
