# Open Industrial Design Information Architecture

---

# 1. 顶层页面

Community v0.1：

```text
Home
Project Workspace
Settings
About
```

不包含：

```text
Login
Billing
Team
Cloud Dashboard
```

---

# 2. Home

内容：

```text
Open Industrial Design logo
New Project
Import Project
Recent Projects
Demo Project
Settings
```

Recent Project Card：

- Name
- Last edited
- Thumbnail
- Duplicate
- Export
- Delete

---

# 3. Project Workspace

结构：

```text
Top Bar
├── Project name
├── Board switcher
├── Undo / Redo
├── Zoom
├── Command Palette
├── Export
└── Settings

Left Toolbar
├── Select
├── Hand
├── Text
├── Image
├── Reference
├── Sketch
├── Concept
├── ViewSet
├── CMF
├── 3D
└── Connector

Canvas
└── Nodes / Edges

Right Inspector
├── Properties
├── Design
├── DNA
├── Relations
├── AI
└── Asset info

Bottom Status
├── Save state
├── Zoom
├── Provider state
└── local mode
```

---

# 4. Settings IA

```text
Settings
├── General
├── AI Providers
├── Storage
├── Shortcuts
└── About
```

---

# 5. Inspector Rule

Inspector 根据 selection 变化。

无 selection：

```text
Board settings
Project info
```

单选 Image：

```text
Transform
Asset
AI
```

单选 Concept：

```text
Transform
Design
Status
Design DNA
Relations
AI
```

多选：

```text
Align
Distribute
Group
Delete
```

---

# 6. Responsive

v0.1 目标：

```text
Desktop-first
>= 1280px optimal
>= 1024px usable
```

移动端不要求编辑。

若移动端打开：

- Read-only / unsupported message
- 不强行做完整 mobile editor

---

# 7. Workspace View Switch

Project Workspace 顶部增加：

```text
Canvas | Graph
```

Canvas：

```text
spatial design workspace
```

Graph：

```text
design lineage / semantic relationship view
```

Sketch Editor 作为 Canvas 内 SketchNode 的子工作区 / editor overlay，不作为第三个全局 Project View。

---

# 8. Candidate Tray

AI 多结果生成时增加临时区域：

```text
Workspace
└── Candidate Tray
```

推荐 Bottom Drawer。

内容：

- generated previews
- keep
- discard
- compare
- regenerate

只有 Keep 后才进入正式 Design lineage。

---

# 9. Desktop First-run

Desktop 首次启动：

```text
Storage Mode
├── This Computer
└── Portable
```

随后进入 Home。
