# Desktop Task A — Tauri Shell

## 实施状态 / Implementation status (2026-10-05)

- 蓝图安装界面已接入独立 Tauri 安装宿主：嵌入固定 NSIS 包、真实文件准备进度、安装阶段不确定进度、进程退出检查及已安装 EXE SHA-256 校验。只有校验成功才允许启动，没有模拟计时器。
- `scripts/desktop/installer-state.mjs` 新增宿主侧状态契约：按运行 ID 和序号隔离事件，阶段进度未知时保持不确定状态，只有进程成功退出且安装后检查通过才允许启动。取消请求等待宿主确认，不等于已经撤销安装或回滚。
- 七项状态单测及三项安装 UI 桥接测试加入 `desktop:test` 与完整质量门，覆盖取消竞态、重试、乱序消息、无效进度、非宿主禁用、禁止提前启动和错误信息白名单。桥接测试使用 mock，不替代真实安装验收。
- 现有 Electron 原型保留作回退。Tauri 2.12.1 宿主与 Windows CI 已添加到独立验证分支：复用 Web 构建、限制主窗口导航／新窗口、校验独立数据目录归属、拒绝链接目录并使用操作系统文件锁阻止同目录并发实例。Windows CI 运行 37274161717 首次成功：两个原生存储测试通过，release 编译与 NSIS 安装包生成完成。锁文件已取回固定；实际桌面交互、安装和卸载仍未验收。
- Windows 干净检出会转换文本换行，导致已有许可与源码哈希校验失败；`.gitattributes` 现保留所有已提交字节，格式由 Prettier 管理。未放宽哈希校验，新增原生文件扫描与检出属性回归测试。
- 安装模板默认提供删除应用数据选项，新增卸载钩子强制保留数据。正式安装界面仍需移除或解释此不适用选项，并核验实际升级／卸载；不能仅凭钩子源码宣称验收完成。
- Windows 平台解析清单包含 246 个依赖包，六个缺少随包许可文本的版本已按版本、VCS 提交和仓库补齐，许可文本锁定 SHA-256。另核对 Microsoft.Web.WebView2 1.0.3800.47 官方 NuGet 中的 x64 静态加载器，与 webview2-rs 对应 Git blob 完全一致，并保留 SDK BSD 声明。依赖更新不得套用旧证据；缺失声明会阻止打包。这不是完整法律意见或安全审计。
- 已加入标准安装器、蓝图安装器与便携 ZIP 的候选打包流程，随附许可、锁文件、源码提交链接及 EXE 哈希；CI 候选包不是 Release。便携目录不包含项目、浏览器配置或真实 Key。
- Windows 隔离生命周期脚本已加入：实际静默安装、同版本重装、安装文件哈希与许可检查、卸载后模拟项目数据保留。待 CI 结果核验；不将同版本重装等同跨版本数据迁移。
- 安装界面隔离浏览器检查通过：1200×780、900×650、390×844，中文／英文、减少动效、浏览器不可安装和零页面错误。截图发现小窗口底部说明不可见后已调整；详情区可滚动。不代表原生 WebView2 实机交互通过。
- 原生工程对话框、真实蓝图安装／启动、便携模式实机恢复、跨版本升级及卸载界面仍待验收。当前开发机未安装 Rust/MSVC，使用 Windows CI 编译，避免新增大体积系统盘工具。已有 Release 未修改。

The blueprint UI now calls a native installer host, verifies the embedded payload
and installed executable, and gates launch on successful verification. Native
compilation passed; UI bridge tests use mocks. Windows lifecycle and portable
acceptance remain separate gates. Candidate packaging includes native notices,
dependency lock, exact source link and hashes. Existing release assets are unchanged.

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
