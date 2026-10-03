# Desktop Task A — Tauri Shell

> 此任务不属于当前 Community Web Core 首轮开发。
> 只有 Core / Storage / Project format 稳定后执行。

Read:

- desktop-distribution.md
- ux-decisions.md
- codex-rules.md
- architecture.md

Implement:

- Tauri 2 shell
- reuse web frontend
- platform service abstraction
- native open/save project dialogs
- Local Mode
- Portable Mode foundation

Do not:

- duplicate domain logic
- move core editor logic into Rust
- implement cloud
- implement Rhino/Blender connectors yet

Acceptance:

- Windows dev build
- macOS dev build where build environment is available
- same project opens in web and desktop
