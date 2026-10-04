# Open Industrial Design Community Edition — Implementation Plan v0.2

> v0.2 采用 Reuse-first：Konva 主画布、Excalidraw Sketch Editor、React Flow Graph View、Three.js 3D。

## 当前执行位置

2026-10-05 本轮补齐收尾：约定的本地设计探索、用户收藏资料及手动分析、图像工具与 UIUX 已完成核验。最终交付范围、证据及模型能力／暂缓项目边界见 [参考工作流适配](./reference-workflow-adaptation.md) 顶部；以下“下一步”保留为实施历史，不再代表未完成工作。该结论不批准正式版发行、GitHub 推送或新服务接入。

2026-10-05：草图撤销边界、独立候选操作与工程往返、用户收藏资料及所选资料分析、图像工具／批量队列、输入端口实际拖线均已有后续验收记录。首页封面、空画布起步引导及模型设置无 Key 状态已补测；修复状态文字覆盖缩略图、连线提示英文残留和占位封面拉伸。当前下一步是汇总完整范围的证据与剩余边界，以下 10 月 4 日段落的“接下来”属于此前执行位置，不应重复作为待办。详细证据以 [参考工作流适配](./reference-workflow-adaptation.md) 和 [发布状态](./release-status.md) 为准；未宣告整体完成或批准新发行。

2026-10-04：用户追加对标功能与 UIUX 后，执行范围已回到 Phase 4／9／11 的缺项补齐及 Phase 12 验证，不再仅是发行收尾。逐项现状见 [参考工作流适配](./reference-workflow-adaptation.md)。手动参考图建立 Concept、创建 Variant、ViewSet、CMF 和设计决策状态已接通并验证本地流程；跨画板图谱返回方案卡的选择与定位已通过浏览器核验。底部文字／图片入口已接通，图片与参考图共用原子导入链路，实际浏览器通过撤销重做、刷新和损坏文件拒绝。窄屏状态栏已调整并检查五种宽度；草图保存／原稿重开、插图、共享副本预览、首页工程导入与往返已验证。空白概念创建已改为单事务并验证失败重试。接下来核对草图编辑与画布撤销的边界及整体对标清单，不以模型生成入口代替本地域验收。超分辨率按用户决定暂缓，不增加相关依赖；不新增付费服务、协同或 AI 3D，不自动发布。

以下为此前发行阶段的历史位置：

2026-10-02：当前执行的是 Phase 12 Quality／Phase 13 Release 的 Alpha 收尾，具体授权范围和证据以 [发布状态](./release-status.md)、[发布门槛](./alpha-0.1-release.md) 和 [收尾清单](./release-checklist.md) 为准。下方阶段是实施顺序，不是全部阶段已验收的声明；不重新搭建工程骨架，不自动新增后续功能或发布。

本轮补齐第三方声明和构建携带检查。项目自有源码保持 MPL-2.0，第三方组件保留各自许可证，贡献规则保持 DCO 1.1。

---

# Phase 0 — Foundation

- monorepo
- packages
- web shell
- lint/test/build
- basic layout

---

# Phase 1 — Domain Foundation

- Entity types
- Project
- Board
- Asset
- Node
- Design
- DesignRelation
- DesignDNA
- ViewSet
- CMF
- Generation
- SketchDocument
- GraphViewState
- schemaVersion
- Repository interfaces

---

# Phase 2 — Workspace Canvas Core

技术：

```text
Konva / react-konva
```

实现：

- Stage
- pan
- zoom
- selection
- marquee
- Transformer
- Node Registry
- TextNode
- ImageNode
- move / resize
- undo / redo

不要自己重写 Transformer。

---

# Phase 3 — Local Persistence

- Dexie
- Repository
- Autosave
- Asset Blob
- Thumbnail
- Recent Projects
- restore after refresh

---

# Phase 4 — Industrial Design Domain

- ReferenceNode
- ConceptNode
- VariantNode
- semantic relations
- Design DNA
- ViewSet
- CMF
- status

先确保不用 AI 也能完成完整设计结构。

---

# Phase 5 — Embedded Sketch Workspace

技术：

```text
@excalidraw/excalidraw
```

实现：

- SketchDocument
- create SketchNode
- open embedded Sketch Editor
- load source scene
- save source scene
- generate preview
- reopen editing
- Render Sketch action placeholder

不要 Fork Excalidraw。

---

# Phase 6 — Design Graph View

技术：

```text
@xyflow/react
```

实现：

- Domain → Graph Adapter
- Concept / Variant graph cards
- semantic edge
- fit view
- selection by designId
- open / locate related Canvas Design
- graph layout state persistence

React Flow 不能成为 domain store。

---

# Phase 7 — Action System

- AppAction
- ActionRegistry
- Command Palette
- Context Menu
- reusable actions

---

# Phase 8 — Project Import / Export

- `.oidproj`
- manifest
- SketchDocument serialization
- GraphViewState serialization
- assets
- migrations
- secure import validation

---

# Phase 9 — BYOK / AI

- ProviderRegistry
- Custom OpenAI-compatible
- official adapter
- capability router
- Generation
- Analyze Design
- Generate Variant
- Render Sketch if provider supports it

---

# Phase 10 — 3D

技术：

```text
Three.js / R3F / OrbitControls
```

- GLB / GLTF
- Model3DNode
- camera
- presets
- screenshot

---

# Phase 11 — Product UX

- Home
- Settings
- onboarding
- Demo Project
- Canvas / Graph switch
- empty states
- errors
- shortcut help

---

# Phase 12 — Quality

- Unit
- Integration
- E2E
- Performance
- dependency audit
- secret audit

---

# Phase 13 — Release

- README
- CONTRIBUTING
- LICENSE decision
- THIRD_PARTY_NOTICES
- screenshots
- GIF/video
- GitHub Release

---

# Development Rule

每个 Phase：

```text
Plan
↓
Integrate mature dependency where appropriate
↓
Implement Open Industrial Design adapter/domain
↓
Test
↓
Document
↓
Freeze contract
```

不要把“自研”当成目标。
