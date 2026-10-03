# Open Industrial Design Community Edition — Implementation Plan v0.2

> v0.2 采用 Reuse-first：Konva 主画布、Excalidraw Sketch Editor、React Flow Graph View、Three.js 3D。

## 当前执行位置

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
Three.js / R3F / Drei
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
