# Desktop Task A — Tauri Shell

## 实施状态 / Implementation status (2026-10-05)

- 蓝图安装界面已作为独立交互原型定稿，尚未接入安装执行层。
- `scripts/desktop/installer-state.mjs` 新增宿主侧状态契约：按运行 ID 和序号隔离事件，阶段进度未知时保持不确定状态，只有进程成功退出且安装后检查通过才允许启动。取消请求等待宿主确认，不等于已经撤销安装或回滚。
- 七项状态单测加入 `desktop:test` 与完整质量门，覆盖取消竞态、重试、乱序消息、无效进度和错误信息白名单。此模块目前尚无生产调用方，不可据此宣称安装器已接通。
- 现有 Electron 原型保留作回退；Tauri 桌面宿主、原生工程对话框、存储模式选择、实际 Windows 安装／升级／卸载与便携版仍待实现、编译和验收。
- 当前开发机未发现 Rust/Cargo。优先评估 Windows CI 构建，避免未说明的大体积系统盘工具安装。没有上传新的安装包或修改已有 Release。

The blueprint UI is a visual prototype, not a working installer. The new host-side
state contract is unit-tested but not wired into a native process. Native builds,
project dialogs, storage selection, install/upgrade/uninstall and portable-mode
acceptance remain pending. Existing release assets are unchanged.

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
