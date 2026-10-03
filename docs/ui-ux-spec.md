# Open Industrial Design UI / UX Specification

---

# 1. 设计目标

UI 应：

- 工具感强
- 信息密度适中
- 不抢 Canvas 注意力
- 比工程 Demo 精致
- 不做过度拟物
- 不做复杂装饰动画

关键词：

```text
Professional
Neutral
Precise
Quiet
Industrial
```

---

# 2. Layout

推荐 desktop：

```text
Top Bar: 48–56px
Left Toolbar: 48–56px
Right Inspector: 300–360px
Bottom Status: 24–30px
Canvas: remaining space
```

不要求像素完全固定，但必须保持一致。

---

# 3. Visual Tokens

建议定义 CSS variables：

```text
--bg-app
--bg-panel
--bg-canvas
--bg-elevated

--text-primary
--text-secondary
--text-muted

--border-default
--border-strong

--accent
--danger
--warning
--success

--radius-sm
--radius-md
--shadow-panel
```

禁止在大量组件中散落 hard-coded color。

---

# 4. Theme

免费版支持：

- Light
- Dark
- System

Canvas 背景可独立：

- white
- light gray
- dark
- custom neutral

---

# 5. Toolbar

Icon button：

- 32–40px hit area
- active state 清晰
- tooltip
- shortcut 显示
- 分组分隔

不要使用大量文字常驻。

---

# 6. Inspector

采用 section：

```text
Transform
Design
DNA
CMF
Relations
AI
```

Section 可折叠。

不要使用超长表单一次铺满。

---

# 7. Node Selection

单选：

- 统一 selection outline
- resize handles
- optional rotation handle

多选：

- bounding box
- batch actions

Design status 不用改变 selection 颜色。

---

# 8. Toast

用于：

- Save failed
- Export completed
- Provider connected
- Import failed
- Asset missing

不要用 Toast 承载需要用户长期阅读的信息。

---

# 9. Modal

只用于：

- destructive confirmation
- provider config
- import conflict
- project export options

普通属性编辑应放 Inspector。

---

# 10. Design Status UI

推荐：

```text
Exploring
Candidate
Review
Approved
Rejected
Archived
```

使用：

- label
- icon
- subtle color

不只靠颜色。

---

# 11. Loading

AI Generation：

Canvas 上生成 Pending Card：

```text
Generating...
Provider
Model
Cancel (if supported)
```

3D：

显示 loader + format。

Project open：

尽量 progressive。

---

# 12. Microinteraction

可用：

- hover
- selection transition
- panel expand/collapse
- small toast animation

不要优先做：

- cinematic transition
- decorative particle
- large motion effects

---

# 13. Empty Canvas

显示极弱提示：

```text
Drop images here
or press I to import
```

不要遮挡 Canvas。

---

# 14. Professional Visual Direction

避免：

- AI SaaS 常见紫色渐变滥用
- 过度玻璃拟态
- 大圆角卡片堆叠
- 巨大营销按钮进入编辑器

编辑器应该更接近：

```text
Figma / Blender / professional creative software
```

而不是 landing page。

---

# 15. Canvas / Graph View Switch

Workspace 顶栏使用轻量 segmented control：

```text
Canvas | Graph
```

切换时保留：

- current Design selection
- Project context

不要求保留相同 viewport。

---

# 16. Sketch Editor UX

打开 Sketch：

- 使用 modal-like fullscreen editor 或 dedicated editor layer
- 明确 Done / Cancel
- 显示当前 Sketch 名称
- Save source + preview

不要在主 Canvas 里塞入 Excalidraw 的完整 toolbar。

---

# 17. Third-party UI Consistency

第三方 editor 的默认 UI 可以保留其成熟交互，但外围：

- title bar
- Done/Cancel
- status
- Open Industrial Design navigation

应保持 Open Industrial Design 风格一致。

不必为了视觉统一大改第三方内部实现。
