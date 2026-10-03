# Open Industrial Design UX Decisions v0.3

> 本文档将产品体验层的关键决策固化为 Community v0.1 / Desktop v0.2 的默认规范。
> 这些决策优先于实现者的个人偏好。

---

# 1. First Launch

第一次打开不直接进入空白画布。

默认进入 Home：

```text
New Project
Open / Import Project
Recent Projects
Demo Project
Settings
```

首次使用应明显提供：

```text
Open Demo Project
```

不强制长教程。

---

# 2. New Project

新建项目默认：

```text
Blank Project
```

并可选轻量模板：

```text
Free Exploration
Product Concept
CMF Exploration
Design Review
```

模板只提供 Board / Node 初始结构，不限制行业。

---

# 3. Project Organization

默认：

```text
1 Project
→ multiple Boards
```

新项目先有 1 个 Board。

用户需要时再增加：

```text
Research
Concept
CMF
Final
```

不强制用户一开始理解复杂结构。

---

# 4. Visual Direction

总体：

```text
Figma-like clarity
+
professional creative-tool density
+
subtle Nothing-like restraint
```

避免：

- 大面积渐变
- AI SaaS 紫色风格
- 过度玻璃拟态
- 花哨营销式卡片

---

# 5. Imported Images

拖入图片后默认：

```text
普通 ImageNode
```

选中后提供快速转换：

```text
Convert to Reference
Convert to Sketch
Attach to Design
```

不要每次导入都弹出分类窗口。

---

# 6. Concept Representation

Concept 使用：

```text
structured design card
```

至少包含：

- preview
- name
- status
- optional tags
- optional lineage hint

Concept 是 Design 的视觉表示，不是 Design 本身。

---

# 7. Variant UX

创建 Variant 的主交互：

```text
Select Design
→ Create Variant
→ new variant appears near source
→ lineage created automatically
```

不要要求用户复制图片后再手动建立 lineage。

AI Variant 与手动 Variant 都遵守相同 lineage 规则。

---

# 8. Canvas / Graph

Graph 默认不是常驻侧栏。

使用：

```text
Canvas | Graph
```

两个工作视图切换。

Canvas：

```text
spatial exploration
```

Graph：

```text
design lineage
```

---

# 9. Sketch Editing

Sketch 编辑默认：

```text
Double Click / Edit Sketch
→ dedicated near-fullscreen Sketch Workspace
→ Done
→ return to Canvas
```

不把完整 Excalidraw toolbar 永久塞进主 Canvas。

---

# 10. AI Entry Points

AI 采用：

```text
Inspector actions
+
Context menu
+
Command Palette
```

聊天框只作为未来辅助能力。

AI 功能必须优先呈现为：

```text
Render Sketch
Generate Variant
Analyze Design
Explore CMF
```

而不是：

```text
Ask AI anything
```

---

# 11. AI Controls

默认控制层级：

```text
Prompt / request
+
Design DNA locks
+
small number of task-specific controls
```

高级 Provider / Model 参数折叠。

默认不向普通用户暴露大量采样参数。

---

# 12. Design DNA UX

v0.1 使用清晰开关：

```text
Preserve silhouette
Preserve proportions
Preserve main geometry
Preserve details
Preserve CMF
Preserve brand elements
```

用户可添加 Notes。

---

# 13. AI Candidate Tray

AI 一次生成多个结果时，默认进入：

```text
Candidate Tray
```

流程：

```text
Generate
↓
Candidate Tray
↓
Preview / Compare
↓
Keep
↓
正式创建 Variant + lineage
```

单结果任务可直接创建 Pending Variant。

目的：

避免画布被低质量候选塞满。

---

# 14. Candidate Tray

位置建议：

```text
bottom drawer
or
right-side temporary panel
```

支持：

- preview
- keep
- discard
- regenerate
- compare

Discard 的结果允许删除本地 Asset。

---

# 15. CMF UX

v0.1：

```text
Explore CMF
→ CMF cards
```

每张：

- color
- material
- finish
- preview

高级 Matrix：

```text
Color × Material × Finish
```

放到后续增强，但数据模型现在兼容。

---

# 16. Multi-view UX

默认提供标准视图：

```text
Front
Side
Rear
Top
Perspective
```

并允许：

```text
Add View
Remove View
Rename Custom View
```

底层仍保留标准 ViewType + future custom view。

---

# 17. 3D UX

Model3DNode：

```text
normal → thumbnail / static preview
selected / activated → interactive 3D
```

避免大量 live 3D 同时渲染。

双击可打开较大的 3D Viewer。

---

# 18. Saving

默认：

```text
Autosave
```

UI 显示：

```text
Saving...
Saved
Save failed
```

同时支持：

```text
Ctrl / Cmd + S
```

行为：

> 立即 flush 当前 pending save。

不弹传统“是否保存”对话框。

---

# 19. Backup Reminder

因为 Community 没有 Cloud：

仅在以下情况轻提示：

```text
long time since last export backup
+
project has meaningful changes
```

提示：

```text
Consider exporting a project backup.
```

不频繁打扰。

---

# 20. Project File Mental Model

默认：

```text
.oidproj = portable project package
```

用户应理解成：

> 一个项目文件。

内部可包含 Assets。

未来高级用户可选择 External Asset workflow，但不是 v0.1 默认。

---

# 21. Desktop Storage Mode

Desktop 第一次启动可选择：

## Local Mode

```text
App data stored in system app-data directory.
```

适合普通用户。

## Portable Mode

```text
App data stored beside the application.
```

适合：

- U盘
- 公司电脑
- 免安装使用

选择后可在 Settings 查看当前模式。

---

# 22. API Key in Desktop

普通桌面安装版：

优先使用：

```text
OS credential storage / keychain
```

Portable Mode：

默认：

```text
Session-only key
```

如允许本地持久化，必须明确提示：

> Portable storage may be accessible to anyone who can access this folder.

---

# 23. Language

首发：

```text
Chinese
English
```

默认：

```text
Follow system language
```

用户可切换。

---

# 24. Open-source Branding

Home 底部轻量显示：

```text
Open Source
GitHub
Version
```

主要入口放在 About。

不要让编辑器看起来像 GitHub 项目展示页。

---

# 25. Onboarding

不使用强制 8 步蒙层。

采用：

```text
Demo Project
+
contextual hints
```

提示应可关闭。

---

# 26. Approved Design

v0.1：

```text
status → Approved
+
visual highlight
+
"Ready for CAD" hint
```

v0.2 候选：

```text
Create Final Board
```

自动汇总：

- selected views
- CMF
- 3D
- notes
- approved design

---

# 27. Product Feeling

用户使用 10 分钟后的目标感受：

> **“这是一个按工业设计思路组织方案的工具。”**

优先级高于：

- “AI 很炫”
- “白板很好用”
- “免费替代某 SaaS”

---

# 28. UX North Star

遇到交互争议时问：

```text
Does this reduce cognitive load
while preserving industrial-design intent?
```

如果只是技术方便而让用户理解成本上升：

> 不采用。
