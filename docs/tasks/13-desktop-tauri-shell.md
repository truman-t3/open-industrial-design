# Desktop Task A — Tauri Shell

## 实施状态 / Implementation status (2026-10-05)

- 蓝图安装界面已作为独立交互原型定稿，尚未接入安装执行层。
- `scripts/desktop/installer-state.mjs` 新增宿主侧状态契约：按运行 ID 和序号隔离事件，阶段进度未知时保持不确定状态，只有进程成功退出且安装后检查通过才允许启动。取消请求等待宿主确认，不等于已经撤销安装或回滚。
- 七项状态单测加入 `desktop:test` 与完整质量门，覆盖取消竞态、重试、乱序消息、无效进度和错误信息白名单。此模块目前尚无生产调用方，不可据此宣称安装器已接通。
- 现有 Electron 原型保留作回退。Tauri 2.12.1 宿主与 Windows CI 已添加到独立验证分支：复用 Web 构建、限制主窗口导航／新窗口、校验独立数据目录归属、拒绝链接目录并使用操作系统文件锁阻止同目录并发实例。Windows CI 运行 37274161717 首次成功：两个原生存储测试通过，release 编译与 NSIS 安装包生成完成。锁文件已取回固定；实际桌面交互、安装和卸载仍未验收。
- Windows 干净检出会转换文本换行，导致已有许可与源码哈希校验失败；`.gitattributes` 现保留所有已提交字节，格式由 Prettier 管理。未放宽哈希校验，新增原生文件扫描与检出属性回归测试。
- 安装模板默认提供删除应用数据选项，新增卸载钩子强制保留数据。正式安装界面仍需移除或解释此不适用选项，并核验实际升级／卸载；不能仅凭钩子源码宣称验收完成。
- 原生依赖清单脚本收集 Cargo 解析得到的版本、声明许可及许可原文哈希，不输出本地依赖路径。它只是待审证据，不等于合规批准；CI 只上传锁文件与清单，不分发未审安装包。
- 原生工程对话框、存储模式选择、便携版打包、安装动效接线及真实安装／升级／卸载仍未交付。当前开发机未发现 Rust/Cargo，使用 Windows CI 编译，避免在系统盘新增大体积工具。没有修改已有 Release。

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
