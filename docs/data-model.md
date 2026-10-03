# Open Industrial Design Data Model v0.1

> 本文档定义 Open Industrial Design 的核心领域模型。  
> 目标：让 Canvas、AI、3D、Local Storage、未来 Cloud 和 Plugin 都围绕同一套稳定语义工作。

---

# 1. 设计原则

Open Industrial Design 的数据模型必须满足：

1. **Canvas Node 不等于 Design**
2. **Node 不等于 Asset**
3. **AI Generation 不覆盖原设计**
4. **设计演化必须可追踪**
5. **所有核心对象都必须有稳定 ID**
6. **必须支持 Schema Migration**
7. **Local-first 优先**
8. **未来 Cloud / CRDT 不反向污染 Core Domain**

---

# 2. 核心实体关系

```text
Project
│
├── Board
│   ├── Node
│   └── Edge
│
├── Design
│   ├── DesignDNA
│   ├── ViewSet
│   └── CMFSet
│
├── Asset
│
├── Generation
│
└── Decision
```

更准确地说：

```text
Asset
  ↑
Node ─────→ Design
              │
              ├── Variant
              ├── ViewSet
              ├── CMFSet
              └── Generation lineage
```

---

# 3. ID Strategy

所有 ID 使用：

```text
crypto.randomUUID()
```

首版不需要引入额外 ID 库。

所有实体都包含：

```ts
interface EntityBase {
  id: string;
  createdAt: number;
  updatedAt: number;
}
```

时间统一：

```text
Unix timestamp in milliseconds
```

---

# 4. Project

```ts
interface Project extends EntityBase {
  schemaVersion: number;

  name: string;
  description?: string;

  boardIds: string[];
  activeBoardId?: string;

  settings: ProjectSettings;
}
```

```ts
interface ProjectSettings {
  unit?: 'mm' | 'cm' | 'inch';
  defaultBackground?: string;
  locale?: string;
}
```

---

# 5. Board

一个 Project 可以有多个 Board。

例如：

```text
Research
Concept
CMF
Final Review
```

模型：

```ts
interface Board extends EntityBase {
  projectId: string;

  name: string;

  nodeIds: string[];
  edgeIds: string[];

  viewport: Viewport;
}
```

```ts
interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
```

---

# 6. Node

Node 是 Canvas 上的视觉实例。

```ts
interface BaseNode extends EntityBase {
  boardId: string;

  type: NodeType;

  x: number;
  y: number;

  width: number;
  height: number;

  rotation: number;
  zIndex: number;

  locked?: boolean;
  hidden?: boolean;

  designId?: string;
}
```

NodeType：

```ts
type NodeType =
  | 'text'
  | 'image'
  | 'reference'
  | 'sketch'
  | 'concept'
  | 'variant'
  | 'viewset'
  | 'cmf'
  | 'model3d'
  | 'group';
```

---

# 7. 为什么 Node 与 Design 分离

错误模型：

```text
ConceptNode = Design
```

问题：

同一个 Design 未来会有：

```text
Concept Card
ViewSet
CMF
3D
Render
Review
```

因此：

```text
Design
   ↑
   ├── ConceptNode
   ├── ViewSetNode
   ├── CMFNode
   └── Model3DNode
```

多个 Node 可以关联同一个 Design。

---

# 8. TextNode

```ts
interface TextNode extends BaseNode {
  type: 'text';

  text: string;

  style?: {
    fontSize?: number;
    fontWeight?: number;
    align?: 'left' | 'center' | 'right';
  };
}
```

---

# 9. ImageNode

```ts
interface ImageNode extends BaseNode {
  type: 'image';

  assetId: string;

  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

---

# 10. ReferenceNode

Reference 是工业设计语义节点。

```ts
interface ReferenceNode extends BaseNode {
  type: 'reference';

  assetId: string;

  referenceType?: ReferenceType;

  notes?: string;
}
```

```ts
type ReferenceType =
  'form' | 'cmf' | 'detail' | 'mechanism' | 'brand' | 'user' | 'market' | 'other';
```

---

# 11. SketchNode

```ts
interface SketchNode extends BaseNode {
  type: 'sketch';

  assetId: string;

  sketchType?: 'hand' | 'digital' | 'marker' | 'line';
}
```

首版 SketchNode 可先复用 Image renderer。

语义不同即可。

---

# 12. Design

Design 是 Open Industrial Design 最核心的领域对象。

```ts
interface Design extends EntityBase {
  projectId: string;

  name: string;

  kind: DesignKind;

  status: DesignStatus;

  parentDesignId?: string;

  dna?: DesignDNA;

  tags?: string[];

  notes?: string;
}
```

```ts
type DesignKind = 'concept' | 'variant';
```

```ts
type DesignStatus = 'exploring' | 'candidate' | 'review' | 'approved' | 'rejected' | 'archived';
```

---

# 13. ConceptNode

```ts
interface ConceptNode extends BaseNode {
  type: 'concept';

  designId: string;

  previewAssetId?: string;
}
```

---

# 14. VariantNode

```ts
interface VariantNode extends BaseNode {
  type: 'variant';

  designId: string;

  previewAssetId?: string;
}
```

Design 的 parentDesignId 负责真实 lineage。

Node 只是视觉表示。

---

# 15. Design DNA

v0.1 先做人工约束，不做复杂 CV。

```ts
interface DesignDNA {
  silhouetteLocked: boolean;
  proportionLocked: boolean;
  geometryLocked: boolean;
  detailLocked: boolean;
  cmfLocked: boolean;
  brandLocked: boolean;

  notes?: string[];
}
```

未来扩展字段只能向后兼容。

例如：

```ts
interface DesignDNAFuture {
  referenceAssetIds?: string[];
  embeddings?: number[];
  geometryHash?: string;
}
```

但 v0.1 不实现。

---

# 16. Edge

Edge 用于 Board 视觉关系。

```ts
interface Edge extends EntityBase {
  boardId: string;

  sourceNodeId: string;
  targetNodeId: string;

  type: EdgeType;

  label?: string;
}
```

```ts
type EdgeType =
  | 'derived_from'
  | 'references'
  | 'variant_of'
  | 'same_design'
  | 'uses_cmf'
  | 'generated_from'
  | 'replaces'
  | 'approved_from'
  | 'related_to';
```

注意：

> 业务 lineage 不能只依赖 Edge。

Design.parentDesignId 仍然是 authoritative domain relation。

Edge 更偏视觉化表达。

---

# 17. Asset

```ts
interface Asset extends EntityBase {
  projectId: string;

  type: AssetType;

  name: string;

  mimeType: string;

  size: number;

  width?: number;
  height?: number;

  storage: AssetStorage;

  thumbnailAssetId?: string;

  metadata?: Record<string, unknown>;
}
```

```ts
type AssetType = 'image' | 'video' | 'model3d' | 'document' | 'texture';
```

---

# 18. Asset Storage

```ts
type AssetStorage =
  | {
      type: 'indexeddb';
      blobId: string;
    }
  | {
      type: 'local-file';
      path: string;
    }
  | {
      type: 'remote';
      url: string;
    };
```

未来再加：

```text
cloud
s3
r2
webdav
gdrive
nas
```

禁止 v0.1 提前实现。

---

# 19. ViewSet

```ts
type ViewType = 'front' | 'rear' | 'left' | 'right' | 'top' | 'bottom' | 'perspective';
```

```ts
interface ViewSet extends EntityBase {
  projectId: string;
  designId: string;

  name?: string;

  views: Partial<Record<ViewType, string>>;
}
```

其中 value 为：

```text
assetId
```

---

# 20. ViewSetNode

```ts
interface ViewSetNode extends BaseNode {
  type: 'viewset';

  designId: string;
  viewSetId: string;
}
```

---

# 21. CMF

CMF 不直接挂在 Node 上。

```ts
interface CMFVariant extends EntityBase {
  projectId: string;
  designId: string;

  name?: string;

  color?: {
    name?: string;
    hex?: string;
  };

  material?: string;
  finish?: string;

  textureAssetId?: string;

  notes?: string;
}
```

---

# 22. CMFSet

```ts
interface CMFSet extends EntityBase {
  projectId: string;
  designId: string;

  name?: string;

  variantIds: string[];
}
```

---

# 23. CMFNode

```ts
interface CMFNode extends BaseNode {
  type: 'cmf';

  designId: string;
  cmfSetId: string;
}
```

---

# 24. Model3DNode

```ts
interface Model3DNode extends BaseNode {
  type: 'model3d';

  designId?: string;

  assetId: string;

  camera?: CameraState;

  renderMode?: 'solid' | 'wireframe';
}
```

---

# 25. CameraState

```ts
interface CameraState {
  mode: 'perspective' | 'orthographic';

  position: [number, number, number];

  target: [number, number, number];

  zoom?: number;
}
```

---

# 26. Generation

AI Generation 必须成为独立记录。

```ts
interface Generation extends EntityBase {
  projectId: string;

  actionId: string;

  providerId: string;
  modelId?: string;

  status: 'pending' | 'running' | 'success' | 'failed';

  sourceDesignIds?: string[];
  sourceAssetIds?: string[];

  outputDesignIds?: string[];
  outputAssetIds?: string[];

  prompt?: string;

  parameters?: Record<string, unknown>;

  error?: string;
}
```

---

# 27. AI 生成规则

永远：

```text
Source
↓
Generation
↓
New Variant
```

禁止默认：

```text
Source
↓
Replace Source
```

如果未来支持 Replace：

必须显式操作，并保留历史。

---

# 28. Decision

预留未来 Design Review。

```ts
interface Decision extends EntityBase {
  projectId: string;
  designId: string;

  type: 'approve' | 'reject' | 'request_changes' | 'shortlist';

  note?: string;

  authorId?: string;
}
```

v0.1 可以不做 UI。

但数据结构可提前定义。

---

# 29. Generation 与 Lineage

推荐：

```text
Design A
   ↓
Generation G1
   ↓
Design A1
```

A1：

```ts
parentDesignId = A.id;
```

G1：

```ts
sourceDesignIds = [A.id];
outputDesignIds = [A1.id];
```

两边都保留。

原因：

- Design 方便直接遍历 lineage
- Generation 方便审计 AI 操作

---

# 30. Project Store API

业务代码禁止到处直接写 Dexie。

统一：

```ts
interface ProjectRepository {
  getProject(id: string): Promise<Project | undefined>;

  saveProject(project: Project): Promise<void>;

  getBoard(id: string): Promise<Board | undefined>;

  saveNode(node: BaseNode): Promise<void>;

  deleteNode(id: string): Promise<void>;

  saveDesign(design: Design): Promise<void>;

  saveAsset(asset: Asset): Promise<void>;
}
```

Dexie 是 implementation。

不是 domain API。

---

# 31. Store 分层

推荐：

```text
Domain Store
    ↓
Repository
    ↓
Dexie
```

Zustand：

```text
仅负责活跃 UI / Editor state
```

不要把 IndexedDB 当 Zustand persistence plugin 一把梭。

---

# 32. UI State

```ts
interface EditorState {
  activeBoardId?: string;

  selectedNodeIds: string[];

  hoveredNodeId?: string;

  activeTool: ToolType;

  viewport: Viewport;

  isPanning: boolean;
}
```

这些不必全部进入 Project domain。

---

# 33. ToolType

```ts
type ToolType =
  | 'select'
  | 'hand'
  | 'text'
  | 'image'
  | 'reference'
  | 'sketch'
  | 'concept'
  | 'variant'
  | 'connector';
```

---

# 34. Schema Version

Project：

```ts
schemaVersion: 1;
```

Migration：

```ts
interface Migration {
  from: number;
  to: number;

  migrate(input: unknown): unknown;
}
```

建议：

```text
migrations/
├── v1-to-v2.ts
└── ...
```

---

# 35. Serialization

所有 domain entity 必须：

```text
JSON serializable
```

禁止在 Project JSON 内存储：

- File
- Blob
- DOM Element
- Konva instance
- Three.js object
- React component
- Function

这些必须留在 runtime 层。

---

# 36. .oidproj

建议：

```text
manifest.json
project.json
boards.json
designs.json
edges.json
viewsets.json
cmf.json
generations.json
assets/
```

也可首版简单合并：

```text
project.json
assets/
```

只要 schema 可演进即可。

---

# 37. Node Registry

```ts
interface NodeDefinition<TNode extends BaseNode> {
  type: TNode['type'];

  createDefault(input: { boardId: string; x: number; y: number }): TNode;
}
```

Renderer 单独：

```ts
interface NodeRendererDefinition {
  type: NodeType;
  component: React.ComponentType<any>;
}
```

避免 domain 与 React 强耦合。

---

# 38. Action Context

```ts
interface ActionContext {
  projectId: string;
  boardId: string;

  selectedNodeIds: string[];
  selectedDesignIds: string[];
}
```

---

# 39. AppAction

```ts
interface AppAction {
  id: string;
  label: string;

  canRun(context: ActionContext): boolean;

  run(context: ActionContext): Promise<void>;
}
```

建议所有关键操作走 Action Registry：

```text
design.create
design.createVariant
design.approve
cmf.create
viewset.create
ai.generateVariant
node.delete
node.duplicate
```

---

# 40. 为什么 Action Registry 很重要

同一操作未来可能来自：

```text
Button
Context Menu
Command Palette
Keyboard Shortcut
Plugin
MCP
Agent
```

如果逻辑都写在 Button：

未来一定重构。

---

# 41. 数据一致性规则

删除 Node：

```text
只删除 Canvas representation
```

除非用户明确：

```text
Delete Design
```

删除 Design 时：

必须检查：

```text
associated Nodes
CMF
ViewSet
Generation
children
```

v0.1 建议：

> Design 删除先做软删除 / archived。

---

# 42. Asset 引用计数

未来可做：

```text
Asset Reference Count
```

首版可在删除 Asset 前查询：

```text
是否仍有 Node / ViewSet / CMF 使用。
```

避免误删。

---

# 43. Group

Group 首版：

```ts
interface GroupNode extends BaseNode {
  type: 'group';

  childNodeIds: string[];
}
```

注意：

Group 是 UI organization。

不是 Design hierarchy。

---

# 44. 数据模型禁止事项

禁止：

```text
把 Base64 图片直接放 Node
把 Konva 对象存数据库
把 AI Provider config 写进 Design
用 Edge 代替 Design lineage
把一个 Node 当成完整 Design
让 Provider 返回的数据直接成为 Store schema
```

---

# 45. v0.1 Minimum Domain

真正必须实现：

```text
Project
Board
Node
Asset
Design
Edge
DesignDNA
ViewSet
CMFVariant
Generation
```

Decision 可以只定义类型，不实现 UI。

---

# 46. 数据模型验收标准

以下场景必须能被模型自然表达：

### 场景 A

```text
导入三张参考图
```

= 3 Assets + 3 ReferenceNodes

### 场景 B

```text
创建 Concept A
```

= 1 Design + 1 ConceptNode

### 场景 C

```text
A 生成 4 个 Variant
```

= 4 Design children + 4 VariantNode + Generation records

### 场景 D

```text
A2 添加前侧后视图
```

= 1 ViewSet + Assets + ViewSetNode

### 场景 E

```text
A2 做 6 个 CMF
```

= CMFSet + 6 CMFVariant

### 场景 F

```text
删除 Canvas 上一个 ViewSet 卡片
```

不应自动删除：

```text
ViewSet domain data
Design
Assets
```

除非用户明确执行 domain delete。

---

# 47. 当前数据模型结论

Open Industrial Design 的数据核心不是：

```text
Shape[]
```

而是：

```text
Project
+
Design
+
Asset
+
Canvas Representation
+
Semantic Relations
+
Generation History
```

这是 Open Industrial Design 与普通 Infinite Canvas 的根本区别。

---

# 48. SketchDocument

为了避免 SketchNode 与 Excalidraw 强耦合：

```ts
interface SketchDocument extends EntityBase {
  projectId: string;

  format: 'excalidraw';
  formatVersion: number;

  sourceAssetId: string;
  previewAssetId?: string;
}
```

更新 SketchNode：

```ts
interface SketchNode extends BaseNode {
  type: 'sketch';

  sketchDocumentId: string;
  previewAssetId?: string;

  designId?: string;
}
```

第三方 editor runtime object 不得进入 domain。

---

# 49. GraphViewState

Graph View 的布局属于 view state，不是 Design domain。

```ts
interface GraphViewState {
  projectId: string;

  positions: Record<string, { x: number; y: number }>;

  zoom?: number;
  x?: number;
  y?: number;
}
```

其中 key 推荐使用：

```text
designId
```

React Flow node ID 可映射 Design ID，但 React Flow 数据结构不进入 authoritative domain。

---

# 50. Design Relation 真源

Concept / Variant lineage：

```text
Design.parentDesignId
```

其他语义关系如果未来需要 domain 级持久化，可增加：

```ts
interface DesignRelation extends EntityBase {
  projectId: string;

  sourceDesignId: string;
  targetDesignId: string;

  type: EdgeType;
}
```

Canvas Edge / React Flow Edge 都应由 domain relation 派生或映射。

不要让两个 UI 各自维护不同关系真源。
