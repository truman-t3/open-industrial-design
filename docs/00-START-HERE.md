# Open Industrial Design — Codex Start Here

> 这是 Open Industrial Design Community Edition v0.1 的开发入口文件。  
> 若使用 Codex / Claude Code / Cursor 等 Coding Agent，请先阅读本文件，再按顺序读取指定文档。

---

## 当前入口与历史规划

当前应用版本为 `0.1.0-alpha.1`。工程骨架阶段已经结束，Canvas AI 探索本轮闭环已核验；不代表全部产品路线或对外发布通过。下面的架构和阶段内容属于规划背景，执行时以 [发布状态](./release-status.md) 为准，不要重新把现有功能当作待搭建骨架。

使用、启动与备份见 [Community Alpha 指南](./community-alpha-quickstart.md)。发布核验见 [Alpha 发布门槛](./alpha-0.1-release.md)和 [收尾清单](./release-checklist.md)。不得用发布核验为由删除用户唯一工程、创建重复最近项目或自动发起付费请求。

## 1. 项目定位

内部源码归档与还原见 [源码快照说明](./source-snapshot.md)。这是本地发布准备工具，不会上传源码或把未完成的分发审核自动标记为通过。

Open Industrial Design 是一个：

> **面向工业设计 / 产品设计的开源、Local-first、BYOK、Model-agnostic Pre-CAD Design Workspace。**

核心不是“无限画布”本身。v0.2 起采用 **Reuse-first**：通用编辑基础设施优先复用成熟开源组件，Open Industrial Design 自己掌握领域模型与工作流。

核心是：

```text
Design Graph
+
Design DNA
+
Multi-view
+
CMF
+
AI lineage
+
3D asset review
```

目标工作流：

```text
Reference
↓
Moodboard
↓
Sketch
↓
Concept
↓
Variant
↓
ViewSet
↓
CMF
↓
3D
↓
Review / Decision
↓
CAD
```

---

## 2. Community Edition v0.1 的原则

免费版必须满足：

- 不登录也能使用
- 不连接 Open Industrial Design 服务器也能使用
- 核心编辑能力完整
- 核心工业设计能力完整
- BYOK 可用
- 项目默认保存在本机
- 项目可以完整导出和再次导入
- 用户数据不被锁死
- 不依赖收费 Cloud 才能打开自己的项目

---

## 3. Codex 必读顺序

每个开发阶段都先读：

1. `docs/codex-rules.md`
2. `docs/product-requirements-free.md`
3. `docs/data-model.md`
4. `docs/release-status.md`

所有涉及编辑器 / dependency 决策的任务还应读取：

- `reuse-first-architecture.md`
- `ux-decisions.md`

按任务需要再读：

- Canvas：`canvas-interactions.md`
- UI：`ui-ux-spec.md`
- Node：`node-system.md`
- AI：`ai-byok-spec.md`
- Storage：`local-storage-project-format.md`
- 3D：`3d-viewer-spec.md`
- Quality：`quality-security-performance.md`

---

## 4. 不要一次读完整仓库

Agent 不应每个任务都全盘扫描。

推荐：

```text
START-HERE
+
codex-rules
+
release-status
+
与当前任务相关的 1–2 份专题文档
```

---

## 5. v0.1 完成定义

Community Edition v0.1 只有当以下闭环完整时才算完成：

```text
创建项目
↓
导入参考图
↓
创建 Concept
↓
创建 Variant
↓
建立 Design Graph 关系
↓
定义 Design DNA
↓
创建 ViewSet
↓
创建 CMF
↓
配置 BYOK
↓
执行至少一种 AI 生成/分析能力
↓
生成结果作为 derived design 保存
↓
导入并查看 3D 模型
↓
自动保存
↓
导出 .oidproj
↓
清空本地状态
↓
重新导入 .oidproj
↓
项目完整恢复
```

---

## 6. v0.1 明确不包含

```text
账号
云同步
在线支付
团队空间
多人实时协作
Marketplace
MCP
企业 SSO
AI Credit Billing
CAD 建模
STEP 编辑
视频编辑
```

这些都不能成为 Community v0.1 的阻塞项。

---

## 7. 开发优先级

必须按：

```text
Foundation
↓
Canvas
↓
Persistence
↓
Industrial Design Domain
↓
Action System
↓
AI / BYOK
↓
3D
↓
Polish / Release
```

不要提前跳到 AI。

---

## 8. 最终目标

用户第一次打开 Open Industrial Design 时，不应该觉得：

> “这是一个套了 AI 的白板。”

而应该在 10 秒内理解：

> “这是一个专门用来探索、分支、比较和沉淀产品设计方案的工作空间。”

---

## 9. Community v0.1 Editor Stack

```text
Workspace Canvas  → Konva
Sketch Editor     → Excalidraw
Design Graph View → React Flow
3D Viewer         → Three.js
Local DB          → Dexie
```

这些都是实现手段，不是 Open Industrial Design domain model。

---

## 10. Desktop target

长期主发行：

```text
Tauri Desktop
```

目标：

```text
Windows Setup.exe
Windows Portable.zip
macOS DMG
```

详细见：

```text
desktop-distribution.md
```

不要在当前 Foundation Task 提前加入 Tauri。

---

## 11. Brand status

Public brand:

```text
Open Industrial Design
```

Public descriptor:

```text
Open Industrial Design — Open-source Industrial Design Workspace
```

Portable project extension:

```text
.oidproj
```

Read:

```text
docs/brand-naming-status.md
```

Keep the product name centralized in app metadata / i18n even though the brand is frozen.
---

## 12. License

Community Core:

```text
MPL-2.0
```

Contribution policy:

```text
DCO 1.1
```

Read:

```text
docs/licensing-strategy.md
CONTRIBUTING.md
```
