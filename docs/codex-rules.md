# Open Industrial Design Codex Rules v0.1

> 本文件用于约束 Codex / Claude Code / Cursor 等 Coding Agent。  
> 每次正式开发任务开始前都应读取本文件。

---

# 1. 项目定位

Open Industrial Design 是：

> 面向工业设计 / 产品设计的开源、Local-first、BYOK、Model-agnostic Pre-CAD Design Workspace。

它不是：

- 通用白板
- AI 生图壳
- CAD
- 项目管理软件

---

# 2. 核心产品能力

任何架构决策都优先保护：

```text
Design Graph
Design DNA
Multi-view
CMF
```

---

# 3. 必读文件

修改代码前读取：

```text
docs/architecture.md
docs/data-model.md
docs/codex-rules.md
docs/release-status.md
```

如果任务涉及 dependency：

还要读取：

```text
docs/third-party-licenses.md
```

---

# 4. 当前任务优先

只实现：

```text
docs/release-status.md
```

明确要求的内容。

不要顺手加入额外 Feature。

---

# 5. 禁止 Scope Creep

没有明确要求时禁止实现：

```text
Cloud
Auth
Payment
Realtime Collaboration
Marketplace
MCP
Enterprise
SSO
AI Credits
CAD
Video Editor
STEP Editing
```

---

# 6. 架构边界

必须遵守：

```text
Canvas
≠
AI Provider

Core
≠
Cloud

Node
≠
Asset

Node
≠
Design

Design Lineage
≠
Canvas Edge only
```

---

# 7. Canvas 规则

Canvas Engine 当前默认：

```text
Konva / react-konva
```

禁止无明确理由替换 Canvas Engine。

禁止引入：

```text
tldraw
Excalidraw editor runtime
AFFiNE runtime
Penpot runtime
```

仅因这些项目被列为参考。

---

# 8. 数据模型规则

任何 domain 修改前：

必须说明：

```text
What changes
Why
Migration impact
Serialization impact
Backward compatibility
```

禁止让 UI 临时需求直接污染 domain schema。

---

# 9. Node / Asset 分离

图片：

```text
Asset = 文件
Node = 画布表现
```

禁止：

```text
Node.src = giant base64
```

---

# 10. Design / Node 分离

一个 Design 可以被多个 Node 表现。

禁止：

```text
Design state only exists inside ConceptNode
```

---

# 11. AI Rules

UI 不得直接调用 Provider SDK。

必须：

```text
UI
↓
Action
↓
Capability
↓
Provider Adapter
```

---

# 12. AI 生成规则

AI 默认创建：

```text
Derived Design / Asset / Node
```

禁止默认覆盖源设计。

必须保留：

```text
source
generation
output
```

---

# 13. Provider Rules

Provider package 只能实现 provider adapter。

禁止 Provider 直接：

```text
修改 Canvas
修改 Zustand
创建 React Component
修改 Project Schema
```

---

# 14. BYOK

核心 AI 功能必须支持：

```text
User API Key
```

不得让官方 Cloud 成为 AI 使用前提。

---

# 15. Local-first

核心编辑器必须：

```text
离线可打开
离线可编辑
离线可保存
```

除非某个 AI provider 本身需要网络。

---

# 16. Storage

首版：

```text
Dexie
IndexedDB
```

业务逻辑通过 Repository 访问。

不要让组件到处写：

```text
db.nodes.put(...)
```

---

# 17. Zustand

Zustand 主要用于：

```text
Editor runtime state
selection
viewport
active tool
temporary state
```

禁止把所有大型 Asset Blob 放 Zustand。

---

# 18. Action Registry

关键行为优先注册为 Action：

```text
node.delete
node.duplicate
design.createVariant
cmf.create
viewset.create
ai.generateVariant
```

原因：

未来同一 Action 会被：

```text
UI
Shortcut
Command Palette
Plugin
MCP
Agent
```

复用。

---

# 19. Node Registry

所有 Node 类型必须通过 Registry。

禁止大量：

```ts
if (node.type === ...)
```

散落在全项目。

---

# 20. Third-party Dependency

新增依赖前报告：

```text
Package
Version
Purpose
License
Why existing stack cannot solve it
Bundle / architecture impact
```

未经允许不要升级无关 dependency。

---

# 21. Open-source Reference Rules

参考项目：

```text
Konva
Excalidraw
React Flow
PixiJS
AFFiNE
BlockSuite
Penpot
tldraw
Yjs
Three.js
```

规则：

1. 参考不等于依赖。
2. 不得未经明确要求复制源码。
3. tldraw 默认只作为 conceptual reference。
4. MPL / dual-license 项目集成前必须单独审计。
5. Open Industrial Design domain model 必须保持独立。

---

# 22. Refactor Rule

禁止：

```text
为了实现一个按钮
重构整个 repo
```

只有满足以下条件才允许大 Refactor：

- 当前任务明确要求
- 有现存 blocker
- 先解释影响

---

# 23. Rename Rule

不要无意义重命名：

```text
files
folders
types
interfaces
actions
```

名称稳定有利于后续降低 Agent context cost。

---

# 24. Dependency Upgrade Rule

不要自动：

```text
upgrade React
upgrade Vite
upgrade all packages
```

只有：

- 当前版本安全问题
- 功能确实需要
- 用户明确要求

才升级。

---

# 25. Test Rule

每个任务至少：

```text
typecheck
unit tests where applicable
build
```

如果无法执行：

必须说明。

---

# 26. Error Handling

任何 AI / file / import 操作失败：

不能破坏已有 Project state。

---

# 27. Performance

禁止：

- pointermove 写 IndexedDB
- 大 Blob 放 React state
- 每次拖拽 clone 整个 project
- Canvas 每次 render decode 原始超大图

---

# 28. Asset Pipeline

优先：

```text
Original Blob
↓
Thumbnail / Preview
↓
Canvas
```

---

# 29. Serialization

Domain 必须 JSON serializable。

禁止持久化：

```text
DOM
Function
React Element
Konva Instance
Three Object3D
File Handle without adapter
```

---

# 30. Schema Version

任何 schema change：

必须考虑：

```text
schemaVersion
migration
```

---

# 31. Commit-sized Tasks

每次任务尽量控制在：

> 一个清晰能力。

例如：

正确：

```text
实现 ImageNode resize
```

错误：

```text
实现整个画布和 AI
```

---

# 32. 输出格式

每次完成任务后输出：

```text
## Changed Files

## What Changed

## Architectural Decisions

## Tests Run

## Known Limitations

## Suggested Next Task
```

---

# 33. 不要重复扫描 Repo

如果已有：

```text
docs/release-status.md
```

只读取与任务相关文件。

不要每个任务从头全盘分析整个项目。

---

# 34. Bug Fix Rule

修 Bug 时：

1. 找最小 root cause
2. 添加/更新测试
3. 最小修改
4. 不顺手重构无关模块

---

# 35. UI Rule

v0.1 UI 优先：

```text
clear
fast
functional
```

而不是：

```text
过度动画
复杂视觉包装
```

---

# 36. Product Rule

遇到功能决策时问：

> Does this help an industrial designer explore, compare, preserve consistency, make a decision, or move toward CAD?

如果不是：

默认不进入 Core。

---

# 37. Security Rule

API Key：

- 不写进 repo
- 不写进 log
- 不写进 exported project
- 不上传服务器
- 不 hardcode

---

# 38. Secrets

环境变量：

```text
.env
```

必须在：

```text
.gitignore
```

---

# 39. Generated Code

不要生成：

- 无用 abstraction
- 过度泛型
- 无调用代码
- speculative architecture

只为已知需求建立 extension point。

---

# 40. Final Principle

Open Industrial Design 应该：

```text
small core
clear domain
stable contracts
optional integrations
```

而不是：

```text
everything framework
```

---

# 41. Reuse-first Rule

不要默认重新实现成熟的通用基础设施。

当前明确允许 / 计划：

```text
Konva → Workspace Canvas
Excalidraw → Sketch Editor
React Flow → Design Graph View
Three.js → 3D Viewer
Dexie → Local DB
```

遇到新通用需求时：

1. 先检查现有依赖。
2. 再评估成熟 permissive dependency。
3. 最后才自己实现。

---

# 42. Adapter Boundary Rule

第三方 UI / Editor library 必须通过 Adapter 与 Open Industrial Design Domain 隔离。

禁止：

```text
Excalidraw scene = Project domain
React Flow node = Design domain
Konva Node = persisted Node object
Three Object3D = serialized model
```

---

# 43. Excalidraw Rule

可以：

```text
embed @excalidraw/excalidraw as Sketch Workspace
```

不可以：

```text
replace Open Industrial Design Workspace Canvas with Excalidraw
```

保存：

```text
SketchDocument
source scene asset
preview asset
```

---

# 44. React Flow Rule

React Flow 只负责：

```text
Graph presentation / interaction
```

Design / DesignRelation 才是 authoritative data。

Graph View 的 layout state 可以单独持久化。

---

# 45. Dependency Decision Report

新增 dependency 时必须报告：

```text
Package
Version
License
Purpose
Why existing stack is insufficient
Adapter boundary
Bundle impact
```

---

# 46. License Rule

Community Core license is fixed:

```text
MPL-2.0
```

Do not replace it with MIT, Apache-2.0, GPL or AGPL unless explicitly instructed by the project owner.

Before public release:

- root LICENSE must contain verbatim MPL-2.0;
- project source should use appropriate MPL/SPDX notices;
- third-party files retain their own notices.

---

# 47. Contribution Rule

Contribution policy:

```text
DCO 1.1
```

Do not introduce a CLA without explicit project-owner approval.

---

# 48. Brand Rule

The public project brand is frozen for development:

```text
Open Industrial Design
```

Canonical technical identifier:

```text
open-industrial-design
```

Canonical portable project extension:

```text
.oidproj
```

Rules:

- use `Open Industrial Design` in user-facing product copy;
- use centralized app metadata / i18n instead of scattering hard-coded brand strings;
- use `.oidproj` for the portable project package;
- do not reintroduce former candidate names;
- do not change the brand or extension without explicit project-owner instruction.
