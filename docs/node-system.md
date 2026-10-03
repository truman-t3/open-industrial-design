# Open Industrial Design Node System Specification

---

# 1. 统一规则

所有 Node 都有：

- selection
- transform
- lock
- z-index
- context menu
- inspector
- stable ID

Renderer 与 Domain 分离。

---

# 2. TextNode

显示：

- plain text
- multiline
- font size
- weight
- alignment

不做：

- rich text editor
- tables
- markdown blocks

---

# 3. ImageNode

显示：

- preview
- aspect fit/fill option（可后置）
- file name optional

Inspector：

- dimensions
- asset info
- replace asset
- AI actions

---

# 4. ReferenceNode

视觉上应与普通 Image 有轻微语义区别。

显示：

- preview
- reference type badge
- optional note

referenceType：

```text
Form
CMF
Detail
Mechanism
Brand
User
Market
Other
```

---

# 5. SketchNode

本质使用 image asset。

显示：

- Sketch badge
- sketch type
- AI Render Sketch action

---

# 6. ConceptNode

Card 内容：

- Preview
- Design name
- Status
- tags optional
- parent indicator optional

Inspector：

- name
- status
- notes
- DNA
- relations
- create variant
- viewset
- CMF
- AI

---

# 7. VariantNode

与 Concept 类似，但必须能看出：

```text
Variant of X
```

---

# 8. ViewSetNode

布局固定：

```text
Front | Side
Rear  | Top
Perspective
```

支持：

- empty slot
- drag asset into slot
- replace
- open larger preview

不要把所有原图一次 full-res decode。

---

# 9. CMFNode

首版两种视图任选一种：

### Cards

每个 CMF variant 一张卡。

### Matrix

如果有规则组合，可显示 grid。

每个 variant：

- color swatch
- material
- finish
- preview if available

---

# 10. Model3DNode

Canvas 卡片内容：

- live 3D viewport 或 thumbnail + activate viewer

如果 live 3D 导致性能差：

优先：

```text
thumbnail in normal canvas
double click / activate → live 3D
```

这是允许的。

---

# 11. GroupNode

视觉：

- bounding container
- optional label

不是 Design。

---

# 12. Edge Visual

按 EdgeType：

可以使用：

- solid
- dashed
- label

但不要设计过多颜色编码。

优先 readability。

---

# 13. Node Registry

所有 Node 通过 registry：

```ts
registerNode({
  type,
  createDefault,
  renderer,
  inspector,
});
```

Domain package 不依赖 React。

---

# 14. Node Size Defaults

建议：

```text
Text      240x100
Image     320x240
Reference 320x260
Sketch    320x260
Concept   320x360
Variant   320x360
ViewSet   480x420
CMF       480x320
Model3D   420x320
```

可以后续调，但不要每个页面硬编码。

---

# 15. Node Error State

Asset missing：

显示：

```text
Missing asset
asset id
Relink / Remove node
```

3D failed：

显示：

```text
Unable to load model
```

AI pending：

显示独立 Generation placeholder，不替换源 Node。

---

# 16. Sketch Editor Integration

SketchNode 在 Workspace 中默认渲染：

```text
preview image
+
Sketch badge
+
Edit action
```

双击或 Edit：

```text
open embedded Excalidraw editor
```

保存后更新：

```text
SketchDocument.sourceAssetId
SketchDocument.previewAssetId
SketchNode.previewAssetId
```

Canvas 不直接渲染完整 Excalidraw runtime。

---

# 17. Graph View Representation

ConceptNode / VariantNode 仍存在于主 Canvas。

Graph View 不复用这些 Canvas Node component。

Graph View 建立自己的轻量 GraphCard：

```text
Design name
kind
status
optional preview
```

两边通过：

```text
designId
```

关联。
