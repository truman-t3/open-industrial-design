# Open Industrial Design Reuse-First Architecture v0.2

> 核心原则：**不重复制造通用基础设施。**
>
> Open Industrial Design 的价值应该集中在工业设计领域模型、工作流和语义，而不是重新实现成熟的 Pan / Zoom / Resize / Sketch / Graph / 3D 基础能力。

---

# 1. Reuse First 原则

默认判断顺序：

```text
需求出现
↓
是否属于 Open Industrial Design 核心产品 IP？
├─ 是 → 自己设计 / 自己实现
└─ 否
   ↓
是否有成熟、许可友好的现成库？
├─ 是 → 优先集成
└─ 否 → 最小实现
```

---

# 2. 哪些必须自己掌控

以下属于 Open Industrial Design Core：

```text
Design Entity
Design Graph semantics
Design DNA
Variant lineage
ViewSet domain model
CMF domain model
Generation lineage
Industrial Design Actions
.oidproj project format
Provider abstraction
Industrial Design workflow
```

这些不能被第三方 Canvas / Editor 数据模型取代。

---

# 3. 哪些优先复用

## Workspace Canvas

```text
Konva / react-konva
```

负责：

- Stage / Layer
- pointer event
- drag
- Transformer
- image / text render
- base shape interaction

Open Industrial Design 自己负责：

- Node Registry
- selection state
- domain binding
- history command
- persistence commit
- industrial nodes

---

## Sketch Editor

```text
@excalidraw/excalidraw
```

角色：

> 嵌入式 Sketch Workspace，而不是主 Canvas。

负责：

- free draw
- line
- arrow
- shape
- text
- zoom / pan
- undo / redo
- vector scene editing

Open Industrial Design 保存：

```text
Excalidraw source scene
+
preview image
+
SketchNode domain relationship
```

不要把 Open Industrial Design 主项目模型替换成 Excalidraw scene。

---

## Design Graph View

```text
@xyflow/react
```

角色：

> Design lineage / workflow 的专用 Graph View。

负责：

- graph layout interaction
- node / edge rendering
- graph pan / zoom
- graph selection
- minimap / controls（按需）

Open Industrial Design 提供：

```text
Design[]
+
semantic relations
↓
Graph Adapter
↓
React Flow nodes / edges
```

React Flow 不是 authoritative domain store。

---

## 3D Viewer

```text
three
@react-three/fiber
@react-three/drei
```

负责：

- rendering
- camera
- orbit
- scene
- loaders

Open Industrial Design 负责：

- Model3DNode
- asset binding
- camera persistence
- screenshot action
- design binding

---

## Local Persistence

```text
Dexie
```

负责 IndexedDB abstraction。

Open Industrial Design 仍通过 Repository 使用 Dexie。

---

## Future Collaboration

```text
Yjs
```

仅在未来多人协作阶段加入。

---

# 4. 主架构

```text
                         Open Industrial Design Core
                              │
                       Industrial Domain
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
 Workspace Canvas        Sketch Editor         Graph View
        │                     │                     │
      Konva              Excalidraw             React Flow
        │
 Industrial Nodes
        │
 ┌──────┼──────┬──────┬──────┐
 │      │      │      │      │
Ref  Concept Variant ViewSet CMF
                             │
                         Model3DNode
                             │
                          Three.js
```

---

# 5. 三种集成等级

## Level A — Runtime Dependency

当前推荐直接依赖：

```text
Konva
react-konva
Excalidraw package
React Flow / @xyflow/react
Three.js
React Three Fiber
Drei
Dexie
Zustand
```

所有具体版本在安装时再次核查 License。

---

## Level B — Architecture Reference

研究但不直接作为核心运行时：

```text
AFFiNE
BlockSuite
Penpot
```

---

## Level C — Conceptual Reference Only

```text
tldraw
```

除非未来重新审查生产许可，否则不进入 Community runtime。

---

# 6. Sketch Editor Integration Contract

Open Industrial Design 不直接把 Excalidraw scene 塞进 SketchNode。

推荐：

```ts
interface SketchDocument {
  id: string;
  projectId: string;

  format: 'excalidraw';
  formatVersion: number;

  sourceAssetId: string;
  previewAssetId?: string;

  updatedAt: number;
}
```

SketchNode：

```ts
interface SketchNode extends BaseNode {
  type: 'sketch';

  sketchDocumentId: string;
  previewAssetId?: string;

  designId?: string;
}
```

这样未来即使更换 Sketch Engine：

```text
SketchNode
↓
SketchDocument Adapter
↓
Excalidraw / future engine
```

而不是让领域模型被某一库绑死。

---

# 7. Excalidraw Source Storage

Source 可保存为：

```text
application/json
```

包含 Excalidraw scene data。

Preview：

```text
PNG or SVG
```

Canvas 普通状态使用 preview。

用户双击：

```text
Open Sketch Editor
```

编辑完成：

```text
Save Scene
↓
Update source asset
↓
Regenerate preview
↓
Update SketchNode
```

---

# 8. Graph Adapter Contract

禁止直接把 React Flow node 当成 domain Design。

推荐：

```ts
interface GraphAdapter {
  toGraphNodes(designs: Design[], context: GraphContext): GraphViewNode[];

  toGraphEdges(designs: Design[], relations: DomainRelation[]): GraphViewEdge[];
}
```

Graph View 的位置布局可作为：

```text
view state
```

与 authoritative lineage 分开。

---

# 9. Graph View 能做什么

Community v0.1：

- 查看 Design lineage
- 选择 Design
- 聚焦 Concept / Variant
- 查看状态
- 查看 parent → child
- 查看语义关系
- 从 Graph View 打开对应 Canvas node

建议支持：

- Fit view
- Minimap
- Search
- Highlight ancestors / descendants

v0.1 不要求：

- 自动复杂 DAG layout
- graph analytics
- AI pipeline editor

---

# 10. 主 Canvas 与 Graph View 的关系

顶部 / Workspace 切换：

```text
Canvas | Graph
```

两者读取同一个 domain。

```text
Canvas
   ↘
    Design Domain
   ↗
Graph
```

禁止：

```text
Canvas state ↔ Graph state 双向互相拷贝成为两套真源
```

---

# 11. Sketch 与 Design 的关系

Sketch 可以：

```text
独立存在
```

也可以：

```text
绑定某个 Design
```

AI Render Sketch：

```text
Sketch
↓
AI Action
↓
new Design Variant
```

不覆盖 Sketch source。

---

# 12. 不重复制造的基础组件

除核心编辑逻辑外，优先采用成熟库或稳定 Web API：

```text
Dialog
Popover
Tooltip
Context Menu
Resizable Panels
Command Palette
Hotkeys
Drag & Drop
ZIP
Color Picker
Toast
File Picker
Virtualization
```

是否采用具体 UI library，在实现阶段按 bundle、license、可维护性评估。

不要为了“纯自研”重写通用组件。

---

# 13. 依赖引入准则

新增 dependency 前回答：

```text
1. 解决什么问题？
2. 这是产品核心还是基础设施？
3. 现有 dependency 能否解决？
4. License 是什么？
5. Bundle impact？
6. 是否污染 domain model？
7. 如果未来替换，Adapter 边界在哪里？
```

---

# 14. 禁止事项

禁止：

```text
Fork Excalidraw 作为 Open Industrial Design 主产品
用 React Flow 数据替代 Design domain
让 Konva node 成为持久化 domain object
让 Three.js Object3D 进入 project JSON
直接 copy tldraw runtime
为了减少几行代码引入巨型依赖
```

---

# 15. 最终原则

Open Industrial Design 应该：

```text
Reuse infrastructure.
Own the domain.
Own the workflow.
Own the project format.
```

这比“全部自己写”更适合开源维护，也更节省 Codex Token。
