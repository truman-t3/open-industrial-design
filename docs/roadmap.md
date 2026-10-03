# Open Industrial Design Roadmap v0.1

> 原则：先建立可用的工业设计工作流，再加 AI，再加 3D，再考虑 Cloud。

## 当前执行状态

2026-10-02：当前应用是 `0.1.0-alpha.1`，本轮处于 Milestone 7 Release Polish 的发布资料与质量核验收尾。执行以 [发布状态](./release-status.md) 为准；已核验部分和未完成门槛见 [收尾清单](./release-checklist.md)。路线图不是全产品完成证明，也不授权自动开发 Cloud、桌面版或对外发布。

---

# Milestone 0 — Foundation

目标：

```text
Repo 可运行
架构稳定
```

任务：

- pnpm monorepo
- apps/web
- packages/core
- packages/canvas
- packages/design-model
- packages/storage
- packages/ui
- React
- TypeScript
- Vite
- Vitest
- ESLint
- Prettier

验收：

```text
pnpm install
pnpm dev
pnpm build
pnpm test
```

全部可运行。

---

# Milestone 1 — Canvas Core

目标：

> 一个真正可用的无限画布。

功能：

- Pan
- Zoom
- Select
- Multi-select
- Move
- Resize
- Delete
- Duplicate
- Z-order
- TextNode
- ImageNode
- ReferenceNode
- Undo
- Redo

验收：

设计师可以导入图片并完成简单 Moodboard。

---

# Milestone 2 — Persistence

目标：

> 刷新不丢项目。

功能：

- Project
- Board
- Dexie
- IndexedDB
- Autosave
- Asset Blob
- Thumbnail
- Project list
- Import / Export
- schemaVersion

验收：

关闭浏览器重新打开，项目完整恢复。

---

# Milestone 3 — Industrial Design Domain

目标：

> 产品正式脱离“通用白板”。

功能：

- Design Entity
- Concept
- Variant
- Design Graph
- Semantic Edge
- Design DNA
- ViewSet
- CMF
- Status

验收：

能够表达：

```text
Reference
↓
Concept
├─ Variant A
└─ Variant B
    ↓
ViewSet
    ↓
CMF
```

---

# Milestone 4 — Action System

目标：

> 为 AI / Plugin / MCP 打基础。

功能：

- Action Registry
- Command Palette
- Context Menu
- Node Registry
- Tool Registry

验收：

核心操作不依赖某个特定按钮。

---

# Milestone 5 — AI / BYOK

目标：

> AI 成为工业设计工作流能力，而不是聊天框。

功能：

- Provider Registry
- Custom OpenAI-compatible
- Provider Settings
- API Key storage
- Capability
- AI Action
- Generation record

首批 Action：

- Analyze Design
- Generate Variant
- Render Sketch

验收：

AI 输出自动：

```text
create Asset
create derived Design
create Node
preserve lineage
```

---

# Milestone 6 — 3D

目标：

> 接住工业设计的 3D 资产。

功能：

- Three.js
- R3F
- GLB
- GLTF
- OBJ
- STL
- Orbit
- Perspective
- Orthographic
- Screenshot

验收：

3D 模型可以作为 Canvas Node 被查看和保存状态。

---

# Milestone 7 — Release Polish

目标：

> 发布 GitHub v0.1。

功能：

- Demo project
- Onboarding
- Keyboard shortcuts
- Empty states
- Error handling
- README
- screenshots
- demo GIF
- docs
- issue templates
- contributing guide

验收：

陌生用户不看源码也能开始使用。

---

# v0.1 Feature Freeze

必须有：

```text
Infinite Canvas
Image / Text / Reference
Concept / Variant
Design Graph
Design DNA
ViewSet
CMF
Local-first
Import / Export
BYOK
AI Action
3D Viewer
```

---

# v0.1 明确不做

```text
Auth
Cloud Sync
Payment
Realtime Collaboration
Marketplace
MCP
Enterprise
SSO
STEP editor
CAD
Video
AI credit billing
```

---

# v0.2 候选

- ComfyUI
- fal.ai
- Replicate
- better image editing
- Design comparison
- AI critique
- Export presentation
- desktop prototype
- local proxy
- plugin SDK alpha

---

# v0.3 候选

- Tauri Desktop
- local file links
- WebDAV
- S3-compatible storage
- Rhino connector prototype
- Blender connector prototype
- KeyShot workflow experiments

---

# v0.5 Cloud Beta

只有在本地版有稳定用户后做。

功能候选：

- Auth
- Cloud Sync
- Cloud Storage
- Share Link
- Review
- Comment
- Version History

---

# v1.0

目标：

> 稳定的开源工业设计 Pre-CAD Workspace。

可能包含：

- Web
- Desktop
- Mature BYOK
- 3D
- Design Graph
- Review workflow
- Plugin SDK
- Cloud optional

---

# 商业化顺序

```text
Open-source adoption
↓
Cloud Sync
↓
Studio Workspace
↓
Design Review
↓
Official Connectors
↓
Marketplace
↓
Enterprise
```

---

# 北极星指标

前期不是收入。

更重要：

```text
Weekly Active Projects
Projects with > 1 Design branch
Projects using ViewSet / CMF
Projects reopened after 7 days
Exported .oidproj projects
```

说明用户真的在用它做设计，而不是试玩。

---

# 开发优先级算法

优先做：

```text
Domain value × User frequency × Architectural leverage
```

低优先：

```text
Visual novelty × Demo wow factor
```

---

# 当前第一任务

当前：Community Alpha 发布前核验，补齐许可资料并验证 Web 构建携带。详见 [发布状态](./release-status.md)。

原 Foundation 起步任务已结束，不要据此重新搭建骨架或删除现有设计工程。后续里程碑保留为规划，须单独确定范围。

---

# v0.2 Architecture Update

Community v0.1 技术路线正式增加：

```text
Embedded Sketch Editor → Excalidraw
Design Graph View → React Flow
```

开发顺序调整：

```text
Foundation
Domain
Konva Canvas
Persistence
Industrial Domain
Excalidraw Sketch
React Flow Graph
Action System
Import / Export
AI
3D
UX
Quality
Release
```

这两个模块属于免费版，不属于 Cloud / Pro。

---

# Desktop Roadmap

在 Community Web Core 稳定后：

```text
Desktop Phase A
→ Tauri shell
→ native file dialogs
→ local/portable mode

Desktop Phase B
→ Windows Setup
→ Windows Portable
→ macOS DMG

Desktop Phase C
→ credential storage
→ local integrations
→ updater

Desktop Phase D
→ ComfyUI / Ollama / Rhino / Blender / KeyShot
```

Desktop 不应阻塞 Community Core 的第一次功能验证。
