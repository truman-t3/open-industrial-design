# Open Industrial Design v0.1.0-alpha.1 — Release Checklist

## 最新核验 2026年10月3日

- [x] 独立 GitHub 源码安装／构建、首次 Linux CI、本地 252 项测试通过。
- [x] README 首页中文说明、明确版本号、示例命名和新增节点避让修复。
- [x] 隔离 Chromium 中草图、GLB／截图、节点移动、备份导入及刷新恢复核验。
- [ ] 21 张运行时图片使用／再分发范围、2 类运行时资产分发记录收口。
- [ ] 提供公众或分发接收者可访问的对应源码；当前 GitHub 仓库仍为私有。
- [ ] 真实 GPU、原生中文输入法及实体设备覆盖。
- [ ] 独立分发资料门槛通过后，发布 `v0.1.0-alpha.1` 预发布版本。

以下为分阶段历史核验和原始产品清单。当前包级声明缺口为 0；旧“4 个包待补”“23 张分发图片”等数量已被 [发布状态](./release-status.md) 替代，不作为当前待办。

## Canvas AI 本轮收尾状态 2026年10月1日

本节只记录用户要求的 Canvas AI 设计探索收尾，不代表下方全部产品、开源发布或桌面版清单通过。

- [x] 已有凭据可直接测试连接，缺少凭据时有解释；真实连接成功提示已汉化。
- [x] 当前工程真实导出、正式导入、刷新恢复；同一项目保持 2 画板、35 节点、5 个正式方案。
- [x] 真实备份再导出再导入，所有元数据（新导出时间除外）及图片 Blob 字节一致。
- [x] 修复撤销步骤导致输入边悬空的备份失败，回归覆盖重做、事务回滚和其他画板不受影响。
- [x] 一次真实局部编辑完成；选区外变化像素为 0，透明蒙版方向检查通过。
- [x] 首页只有一个最近项目，并使用工程灯具图片作为封面。
- [ ] 局部编辑的模型造型效果：本次旋钮被移除，未满足橙色旋钮要求；不自动重试，不把软件保护等同于模型效果。

实际文件、截图和像素核验位于工作区 `artifacts/qa`，详见其中 `真实API验收报告.md`。此处未勾选的原发布清单需要单独评估，不自动扩大本轮范围。

---

## 对外发布尚需收尾

- [x] 当前 Canvas 闭环有本地自动测试与浏览器核验记录，范围见上节。
- [x] README、使用备份指南和开发入口明确当前版本、数据边界及未实现能力。
- [x] 隔离 Playwright Chromium 151.0.7922.34 走通新增草图、GLB 评审／截图、导出下载、正式导入与刷新恢复；记录位于工作区 `artifacts/qa/发布前浏览器核验.md`。
- [x] 浏览器真实键盘事件按住空格加鼠标拖动，视图变化、节点数据不变；不是组件合成事件检查。
- [x] 修复 3D 未选择模型时的英文残留，实际中文／英文分支通过；全量 release:check 通过（186 项测试）。
- [ ] 目标实际设备／浏览器及真实 GPU 完整验收，不把无头 Chromium 当作所有环境通过。
- [ ] 原生中文输入法合成和实体键鼠核验。
- [ ] 发布内容的 LICENSE、SPDX、第三方依赖及品牌使用复核。
- [x] 安装依赖树盘点、根 MPL 官方原文比对、DCO 贡献规则及目录级源码 notice；详见 [许可证复核](./release-license-review.md)。
- [x] Web 构建自动携带项目 MPL 原文、已收集第三方原文草稿和完整性清单；补齐 38 个包版本、4 个 Assistant 字体依据及 pako zlib 文件头；14 个旧 Radix 版本的源码匹配纳入离线构建校验。
- [ ] 最初 42 个版本仍有 4 个待补齐；在线字体／解码器等资产与其他文件级来源继续复核。自动携带草稿不等于完整分发声明通过。
- [x] 固定公开目录 23 张图按来源说明和用途登记；源码与成品图像哈希一致性进入构建，见 [发布资产复核](./release-asset-review.md)。
- [x] Draco 1.5.5 三份 CDN 解码器实际字节已匹配固定官方提交，并保留原文与快照；不等于获准分发或离线可用。
- [x] 隔离断网诊断完成：草图可保存、未压缩 GLB 可评审，导出／导入／刷新恢复记录和四个 Blob 字节一致，见 断网报告（内部记录，未随源码交付：`断网技术核验.md`）。
- [x] 草图字体与固定 Draco 1.5.5 本地托管；隔离浏览器禁止外网时中英文草图及压缩模型可用，故意拒绝解码器后显示错误、停止加载并可手动重试，正式备份往返与刷新字节一致。见 修复核验（内部记录，未随源码交付：`断网修复核验.md`）；不等于所有字体／GPU／设备或正式分发通过。
- [ ] 23 张图片的正式分发授权、草图旧版字体来源与远程资产正式复核；两张参考展示板的正式分发处理仍待完成。
- [ ] 最终分发携带完整许可声明和对应源码获取方式；不能以仓库内 dependency 表格代替。
- [x] 内部源码快照脚本、显式文件清单、哈希及 ZIP 往返校验已提供，见 [操作说明](./source-snapshot.md)；不自动关闭上一项公开获取与分发审核。
- [ ] 明确分发形式：Web 还是桌面；桌面打包不是当前自动新增任务。
- [ ] 用户授权正式发布后再发布，不把本地构建成功当作已上线。

模型效果和大画布性能／包体积优化暂缓。以下保留的是原始产品路线清单；未勾选不等于所有功能未实现，也不构成本轮全部执行授权。具体完成状态以上方核验记录为准。

# Product

- [ ] Project creation
- [ ] Multiple boards
- [ ] Infinite canvas
- [ ] Image / Text / Reference / Sketch
- [ ] Concept / Variant
- [ ] Design Graph
- [ ] Design DNA
- [ ] ViewSet
- [ ] CMF
- [ ] Model3D
- [ ] Command Palette
- [ ] Context Menu
- [ ] Undo / Redo

# Local-first

- [ ] Autosave
- [ ] Refresh recovery
- [ ] Recent projects
- [ ] Local assets
- [ ] No login required

# Import / Export

- [ ] `.oidproj` export
- [ ] `.oidproj` import
- [ ] Migration path
- [ ] No secrets in archive
- [ ] Corrupt archive handled

# AI / BYOK

- [ ] Add Provider
- [ ] Test Connection
- [ ] Session key
- [ ] Remember key locally
- [ ] Analyze Design
- [ ] Generate Variant
- [ ] Generation history
- [ ] Failure recovery
- [ ] Design DNA constraints used

# 3D

- [ ] GLB
- [ ] GLTF
- [ ] Orbit
- [ ] Perspective
- [ ] Orthographic
- [ ] Camera presets
- [ ] Screenshot

# UX

- [ ] Home
- [ ] Settings
- [ ] Demo project
- [ ] Empty states
- [ ] Tooltips
- [ ] Shortcuts
- [ ] Save state visible
- [ ] Missing asset state

# Quality

- [ ] Typecheck
- [ ] Lint
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E critical path
- [ ] 100-node basic performance
- [ ] API key leak audit
- [ ] object URL cleanup
- [ ] Three.js resource cleanup

# Open Source

- [ ] README
- [ ] LICENSE
- [ ] CONTRIBUTING
- [ ] CODE_OF_CONDUCT optional
- [ ] THIRD_PARTY_NOTICES
- [ ] dependency license audit
- [ ] issue templates
- [ ] architecture docs committed

# Final E2E Scenario

- [ ] New project
- [ ] Import 3 references
- [ ] Create concept
- [ ] Create 2 variants
- [ ] Lock DNA
- [ ] Create ViewSet
- [ ] Create CMF
- [ ] Configure provider
- [ ] Generate AI variant
- [ ] Import 3D
- [ ] Screenshot 3D
- [ ] Export project
- [ ] Delete local project
- [ ] Import archive
- [ ] Verify all relationships

---

# Reuse-first v0.2 Additions

## Sketch

- [ ] Create SketchNode
- [ ] Open embedded Excalidraw
- [ ] Save editable source scene
- [ ] Generate preview
- [ ] Reopen and continue editing
- [ ] Export/import preserves sketch source

## Graph View

- [ ] Canvas / Graph switch
- [ ] Design domain maps to React Flow
- [ ] lineage visible
- [ ] semantic relations visible
- [ ] selection maps through designId
- [ ] graph state does not mutate domain accidentally
- [ ] export/import preserves graph view state

## Dependency Audit

- [ ] exact Excalidraw package version reviewed
- [ ] exact @xyflow/react version reviewed
- [ ] notices included if required

---

# UX v0.3 Additions

- [ ] Home first-launch works
- [ ] Demo Project available
- [ ] Variant creates lineage automatically
- [ ] Canvas / Graph understandable
- [ ] Sketch editor opens and returns cleanly
- [ ] AI Candidate Tray works for multi-output generations
- [ ] Autosave status visible
- [ ] Backup reminder non-intrusive
- [ ] Chinese / English switching works
- [ ] Approved state provides Ready for CAD hint

# Desktop future-release checklist

- [ ] Tauri shell reuses same Core
- [ ] Windows setup build
- [ ] Windows portable build
- [ ] Portable data stays beside app
- [ ] Local mode uses app data
- [ ] macOS DMG
- [ ] API key storage follows platform mode rules

---

# Licensing / Brand v0.4

- [x] Root LICENSE contains verbatim MPL-2.0 official text
- [ ] Project-authored covered source uses appropriate MPL/SPDX notices
- [x] CONTRIBUTING documents DCO sign-off
- [ ] DCO check enabled for public contributions if practical
- [ ] THIRD_PARTY_NOTICES generated / reviewed
- [x] Public brand frozen as Open Industrial Design after preliminary collision screening
- [x] Former rejected names are not used as public product branding
- [x] Open Industrial Design is the canonical public brand
- [ ] TRADEMARKS.md finalized after public name selection
- [x] project-file extension finalized as `.oidproj`
