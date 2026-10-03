# Open Industrial Design Community Edition v0.1 — Product Requirements

> 本文档定义免费开源版的完整产品范围。  
> 它是 v0.1 的产品真源（Product Source of Truth）。

---

# 1. 产品目标

帮助工业设计师在进入 CAD 之前完成：

- 灵感收集
- 草图整理
- 概念方案探索
- 方案分支
- 设计约束沉淀
- 多视图管理
- CMF 探索
- 3D 资产查看
- AI 辅助探索
- 方案关系追踪
- 本地项目保存与迁移

---

# 2. 目标用户

## 核心用户

- 工业设计师
- 产品设计师
- 学生设计师
- 自由设计师
- 小型设计团队中的个人成员

## 次级用户

- CMF 设计师
- 产品经理
- 设计研究人员
- 3D / Visualization 设计师

---

# 3. 关键问题

Open Industrial Design 重点解决：

1. 参考图、草图、渲染图散落。
2. AI 生成了很多图，但不知道方案怎么演化。
3. 修改一个局部后产品整体一致性丢失。
4. Front / Side / Rear 不是同一个产品。
5. CMF 探索缺乏结构化记录。
6. 设计决策过程丢失。
7. 进入 CAD 前没有统一的设计状态。
8. 用户不希望把未发布设计强制上传到第三方云端。
9. 用户希望自由选择 AI Provider。

---

# 4. Community Edition 功能模块

## 4.1 Project

必须：

- 创建项目
- 重命名项目
- 删除项目
- 复制项目
- 最近项目列表
- 项目更新时间
- 自动保存
- 项目导入
- 项目导出

项目默认：

```text
Local
```

---

## 4.2 Board

必须：

- 一个 Project 支持多个 Board
- 新建 Board
- 重命名 Board
- 删除 Board
- 切换 Board
- 保存每个 Board 的 viewport

推荐模板：

```text
Research
Concept
CMF
Final
```

但不强制。

---

## 4.3 Infinite Canvas

必须：

- Pan
- Zoom
- Zoom to selection
- Fit content
- Select
- Multi-select
- Marquee select
- Move
- Resize
- Rotate（可选；若实现必须稳定）
- Duplicate
- Delete
- Copy / Paste
- Bring Forward
- Send Backward
- Group
- Ungroup
- Lock
- Unlock

---

## 4.4 基础 Node

必须：

- Text
- Image
- Reference
- Sketch
- Concept
- Variant
- ViewSet
- CMF
- Model3D
- Group

---

## 4.5 Asset

必须支持：

### Image

- PNG
- JPG / JPEG
- WEBP

### 3D

至少：

- GLB
- GLTF

建议：

- OBJ
- STL

### Import

- Drag & Drop
- File Picker
- Paste Image from clipboard

---

# 5. Industrial Design Domain

## 5.1 Design

用户可以：

- 创建 Concept
- 从 Concept 创建 Variant
- 从 Variant 继续创建子 Variant
- 修改名称
- 修改状态
- 添加标签
- 添加备注

状态：

```text
Exploring
Candidate
Review
Approved
Rejected
Archived
```

---

## 5.2 Design Graph

必须：

- 记录 parentDesignId
- 在 Canvas 上显示语义 Edge
- 支持 derived_from
- variant_of
- references
- uses_cmf
- generated_from
- related_to

Domain lineage 不能只依赖 Edge。

---

## 5.3 Design DNA

免费版完整支持人工 Design DNA。

必须包含：

- Lock silhouette
- Lock proportion
- Lock geometry
- Lock detail
- Lock CMF
- Lock brand
- Notes

AI Action 可以读取这些 constraint。

v0.1 不要求自动 CV 识别。

---

## 5.4 ViewSet

必须：

- 绑定 Design
- 支持 Front
- Rear
- Left
- Right
- Top
- Bottom
- Perspective
- 每个槽位绑定 Asset
- 缺失视图显示 empty slot
- 可替换某个视图
- 不因删除 Canvas 卡片删除 domain ViewSet

---

## 5.5 CMF

必须：

- 创建 CMF Set
- 一个 Set 包含多个 Variant
- Color
- Material
- Finish
- Optional texture
- Notes
- 与 Design 绑定
- Canvas 上显示 CMF 卡片/矩阵

---

# 6. AI / BYOK

## 6.1 原则

免费版 BYOK 不限于官方模型。

必须：

- Provider Registry
- Provider Settings
- Test Connection
- Custom OpenAI-compatible provider
- 至少一个官方 Provider Adapter
- 用户可以选择默认 Provider / Model

---

## 6.2 首批 AI Capability

必须至少支持：

```text
vision.analyze
image.generate OR image.edit
```

推荐：

```text
text.generate
vision.analyze
image.generate
image.edit
image.variation
```

---

## 6.3 首批 AI Action

至少：

### Analyze Design

输入：

- selected Design / Image
  输出：
- 文本分析

### Generate Variant

输入：

- source Design
- prompt
- Design DNA constraints
  输出：
- new Asset
- new Design
- new VariantNode
- lineage

### Render Sketch

如当前 Provider 支持 image generation/edit，则提供。

---

## 6.4 Generation History

每次 AI 任务必须记录：

- action
- provider
- model
- source
- output
- prompt
- parameters
- status
- error

失败不得破坏原设计。

---

# 7. 3D Viewer

免费版必须：

- 导入 GLB / GLTF
- 在 Canvas 生成 Model3DNode
- Orbit
- Zoom
- Reset Camera
- Perspective
- Orthographic
- Front preset
- Side preset
- Top preset
- Screenshot to Asset

建议：

- OBJ
- STL
- Wireframe mode

不做：

- mesh editing
- CAD editing
- STEP editing

---

# 8. Local-first

必须：

- 无账号使用
- IndexedDB 持久化
- 自动保存
- 恢复最近项目
- 本地 Asset
- 本地 Provider Config
- 无 Open Industrial Design server 时核心功能可用

---

# 9. Project Export / Import

必须支持：

```text
.oidproj
```

要求：

- 包含 domain data
- 包含 boards
- 包含 assets
- 包含 thumbnails
- 包含 schemaVersion
- API Key 不得进入导出包

导入：

- 校验 manifest
- 校验 schemaVersion
- 校验缺失 Asset
- 错误提示
- 不覆盖现有项目，默认作为新项目导入

---

# 10. Settings

免费版必须包含：

## General

- Language
- Theme
- Canvas background
- Default unit

## AI Providers

- Add Provider
- Edit Provider
- Delete Provider
- Test Connection
- Session-only key
- Remember locally

## Storage

- Local usage overview
- Clear thumbnails/cache
- Export project
- Import project

## About

- Version
- License
- GitHub
- Third-party notices

---

# 11. Onboarding

首次使用：

必须让用户快速理解：

```text
Reference
→ Concept
→ Variant
→ ViewSet
→ CMF
```

形式可以是：

- 3–5 步 onboarding
- 或 Demo Project

至少必须有 Demo Project。

---

# 12. Empty States

必须设计：

- No project
- Empty board
- No provider configured
- No 3D model
- Empty ViewSet
- Empty CMF Set
- AI request failed
- Import failed

不得只有空白屏幕。

---

# 13. Keyboard Shortcuts

最低要求：

```text
V / Esc      Select
Space        Hand / temporary pan
Delete       Delete selected
Ctrl/Cmd+C   Copy
Ctrl/Cmd+V   Paste
Ctrl/Cmd+D   Duplicate
Ctrl/Cmd+Z   Undo
Ctrl/Cmd+Shift+Z Redo
Ctrl/Cmd+K   Command palette
Ctrl/Cmd+0   Fit content
```

平台差异应处理。

---

# 14. Command Palette

必须支持搜索并执行：

- Create Concept
- Create Variant
- Add Image
- Add Reference
- Create ViewSet
- Create CMF
- Run Analyze Design
- Run Generate Variant
- Export Project
- Settings

---

# 15. Context Menu

Node 右键至少：

- Duplicate
- Delete
- Lock
- Bring forward
- Send backward
- Create Variant（若绑定 Design）
- Create ViewSet（若绑定 Design）
- Create CMF（若绑定 Design）
- AI Actions（若 provider 可用）

---

# 16. Privacy

UI 必须明确：

> Files stay on this device by default.

当调用 Provider 时：

> Only selected content required for this AI action is sent to the configured provider.

---

# 17. Accessibility

最低要求：

- Keyboard navigation for major panels
- Focus visible
- Tooltip
- contrast 合理
- icon buttons 有 accessible label
- 不依赖颜色单独表达 Approved / Rejected

---

# 18. Error Recovery

必须处理：

- corrupt project
- missing asset
- invalid image
- unsupported model format
- IndexedDB quota
- provider timeout
- provider invalid key
- provider rate limit
- generation failure

失败不应导致整个 App 崩溃。

---

# 19. 性能目标

建议初期验收：

- 100 个普通 Node 交互流畅
- 50 张图片可正常操作
- 大图使用 preview
- 拖拽期间不写 DB
- Autosave 不阻塞 pointer interaction
- Canvas 打开时不一次 decode 所有原图

---

# 20. Release Criteria

v0.1 发布前必须通过：

1. Fresh install
2. Create project
3. Import assets
4. Complete design lineage
5. Create ViewSet
6. Create CMF
7. Configure provider
8. Run AI action
9. Import 3D
10. Autosave
11. Export `.oidproj`
12. Clear app data
13. Import project
14. Verify restoration
15. Build passes
16. Tests pass
17. No secret in bundle
18. License notices available

---

# 21. Free vs Future Paid Boundary

Community 永久应保留：

```text
Canvas
Local Project
Design Graph
Design DNA
ViewSet
CMF
3D Viewer
BYOK
Import / Export
Plugin-capable Core
```

未来收费主要：

```text
Cloud Sync
Cloud Storage
Team Workspace
Review Link
Comments
Realtime Collaboration
Managed AI
SSO
Audit
Enterprise
```

核心设计能力不能为了商业化被后期抽走。

---

# 22. Embedded Sketch Workspace

Community v0.1 正式包含：

```text
SketchNode
↓
Double click / Edit
↓
Embedded Excalidraw editor
```

用户至少可以：

- free draw
- line
- arrow
- basic shape
- text
- undo / redo
- pan / zoom
- reopen and continue editing

Open Industrial Design 保存：

- editable source scene
- preview Asset
- SketchDocument metadata

Sketch Editor 不取代 Workspace Canvas。

---

# 23. Design Graph View

Community v0.1 正式包含：

```text
Canvas View
|
Graph View
```

Graph View 使用 React Flow / xyflow。

必须：

- 根据 Design domain 生成 graph
- 展示 Concept → Variant lineage
- 展示 status
- 展示 semantic relation
- 点击 graph node 可以定位 / 打开相关 Design
- Fit View
- selection sync at Design ID level

Graph View 不能成为 domain 真源。

---

# 24. Reuse-first Product Rule

如果能力属于：

```text
generic editor infrastructure
```

优先复用成熟、许可友好的开源库。

如果能力属于：

```text
industrial design semantics / workflow
```

由 Open Industrial Design Core 自己实现。

免费版的“完整”不意味着所有底层代码都必须自研。

---

# 25. UX Defaults

Community v0.1 的体验决策以：

```text
docs/ux-decisions.md
```

为准。

关键默认：

- Home first
- Blank + optional templates
- Multiple Boards, but simple by default
- Image import 不强制分类
- Variant 自动建立 lineage
- Canvas / Graph 切换
- Sketch 使用专用 editor
- AI 使用 task-based actions
- AI 多结果进入 Candidate Tray
- Autosave + visible save status
- `.oidproj` 作为主要项目文件心智

---

# 26. Desktop Target

Open Industrial Design 的长期主发行形态为：

```text
Tauri Desktop
```

免费版最终需要支持：

```text
Windows Setup
Windows Portable
macOS DMG
```

Desktop 细节见：

```text
docs/desktop-distribution.md
```

Desktop 不改变 Community 核心功能的免费属性。
