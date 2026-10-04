# Open Industrial Design Data Model v0.1

> 本文档定义 Open Industrial Design 的核心领域模型。  
> 目标：让 Canvas、AI、3D、Local Storage、未来 Cloud 和 Plugin 都围绕同一套稳定语义工作。

## 当前选区与分组实现（2026-10-03）

2026-10-04 用户资料库数据层：可选 `Project.researchLibrary` 保存 `ResearchEntry[]` 与 `ResearchCollection[]`。条目包含标题、说明、标签、来源链接、可选图片 Asset 引用及用户填写的品牌／产品／记录日期；没有图片时需有文字或链接，不虚构文件 Asset。收藏板只保存条目 ID，同一条目可属于多个收藏板，收藏组织不等于 Canvas Board 或 Design 血缘。最多 2000 条资料、200 个收藏板；校验字段白名单、长度、真实日期、身份唯一性、成员引用和图片项目归属。此字段加入未发布 schema 9，无新 Dexie 表，旧工程缺省不变；工程导入／导出都校验并保留记录。Repository 比较调用方读取的旧资料后单事务保存，旧版本写入拒绝；常规项目保存及画布快照保留数据库中的最新资料，不负责覆盖该字段。此处只有领域、存储与工程契约，收藏界面及分析文字证据尚待接通。

2026-10-04 手动 CMF 使用已有 CMFSet／CMFVariant／CMFNode，无字段或版本升级。`design.saveCMFSet` 接收有限字段草稿，准备记录交给 Repository 原子保存；纹理仅引用本项目可用图片 Asset。编辑保持集合／子方案身份和创建时间，不改 Design、父关系或生成历史。移除集合成员仅解除 variantIds 关联，保留原记录与 Asset，避免破坏已有共享引用；删除卡片不删正式集合，placeOnBoard 是非持久化的重新放置意图。App 从独立记录派生画布色板与检查器，序列化仍保存原字段。

2026-10-04 ViewSet 的放回画板入口现已接通：Action 通过非持久化的 placeOnBoard 意图请求新卡片，事务显式区分新建与编辑既有记录；既有记录必须存在且归属一致，保留原 createdAt。同一 Design 的多个 ViewSet 独立存储，可从检查器切换，不改文件格式或血缘。下段重新放置待办是历史记录，已完成。

2026-10-04 手动 ViewSet 编辑复用现有实体和节点字段，不增加 schema／Dexie 版本。`design.saveViewSet` 准备可序列化记录，Repository 在同一事务内校验 Design／Board 归属、图片归属与本地 Blob 后保存 ViewSet、Node、Board 和项目时间；更新保留原 createdAt，不改 Design／血缘／Generation。视图关联仅保存 Asset ID，画布缩略图由运行时传入的 ViewSet 与 Blob URL 派生，不向节点塞图片数据。删除视图卡仍只删除表现，保留正式记录；重新放置入口尚待补齐。

2026-10-04 手动视图／CMF 接入前置校验：继续使用已有 ViewSet／CMFSet／CMFVariant 字段及 schema 9／Dexie 7，不增加迁移。工程校验要求 ViewSet.views 为对象，槽位仅 front／rear／left／right／top／bottom／perspective，值必须引用已有 Asset；这里的左右视图区别于 AI 任务的 side。CMF 集合成员不可重复，必须存在且属于同一 Design；卡片的 viewSetId／cmfSetId 必须与自身 designId 一致。已有合法记录保持兼容；结构损坏、缺失引用和错属记录拒绝导入，不猜测或静默改绑。此处是数据完整性，不代表手动编辑界面已接通。

素材视觉分析复用 `Generation.inputSnapshots` 和既有输入 Blob 表：`sourceNodeId` 可选，但仅 `ai.analyzeMaterials` 允许省略，且必须有非空 `sourceAssetId`；其他生成快照仍要求节点来源。分析 Action 在请求前原子保存运行记录与全部输入字节，之后状态更新不能改写快照。该增量属于未发布 schema 9，不增加表；旧节点型快照保持兼容。快照不依赖当前 Asset 字节，源素材变更后工程仍携带当时的分析证据。

`Asset.knowledge` 是可选的本地素材知识记录，包含 `notes`（最多 4000 字符）、`tags`（最多 12 个，每个 1–40 字符，去首尾空格且大小写不重复）、`sourceUrl`（空字符串或最多 2048 字符的 HTTP(S) 地址，不允许用户名密码）。纳入未发布 schema 9，不增加 Dexie 表；旧 Asset 缺省不改变行为，工程导入拒绝未知字段和无效记录。它不是 Provider 指令或 Design 血缘，不自动发送模型或抓取网页。跨工程复制素材时保留知识记录，但仍移除工程专属 metadata／缩略图引用；副本之后独立编辑。

`GenerationNode.patternTask` 区分图案生成 `{ kind: 'create', repeat: 'single' | 'tile' }` 与迁移 `{ kind: 'transfer', placement, scale: 'small' | 'medium' | 'large' }`，纳入未发布 schema 9；旧节点缺省不改变行为，不新增数据库表。生成图案可显式使用 `textOnly` 或已连接图片，不能因缺少图片自动降级；它保留图片来源但不继承参考产品的 Design 血缘。迁移草稿可保存空位置，执行要求非空位置（最多 500 字符）、一张产品主图和一张图案参考，只从主图继承血缘。两类任务不能组合蒙版、抠图、平面定位或多视角；结构化参数进入输入签名、请求与历史，工程校验拒绝未知字段／枚举和混合模式。连续纹样接缝与曲面贴合是模型效果，不是本地几何保证。

`GenerationNode.localCmf` 保存 `color`／`material`／`finish` 三个字符串，每项最多 500 字符；纳入未发布 schema 9。空白草稿可保存，但执行前至少填写一项；必须与 `localEdit` 一起使用，不能与消除、抠图、多视角或纯文本模式混用。字段参与输入签名和运行历史，Action 将指定属性与保留几何／留空属性约束加入真实图像编辑请求，沿用同一蒙版和选区外像素保护。它不保证模型在选区内遵守材质或形状要求。

`GenerationNode.textOnly` 显式表示文生创意，纳入未发布 schema 9；缺省保持必须有图片的旧语义，不依据缺图自动切换。纯文本模式不允许图片输入边，也不能组合蒙版、抠图、图案定位或多视角。Action 只调用 `image.generate`，参数和签名记录模式，输出仍为独立候选，无来源 Design 时采纳为 Concept。画布隐藏图片输入端口，命中检测、连接验证和工程校验同时拒绝向纯文本任务接图。

`GenerationNode.patternPlacement` 保存图案中心、相对主图的宽高、旋转和不透明度。中心 0–1、宽高 0.01–2、角度 ±180°、不透明度 0–1，必须为有限数；本地合成仅生成一个候选，不能组合其他图像模式。真实执行要求一张主图和一张参考图，输入快照与输出边沿用既有候选链路，历史 Provider 标识为 `local-raster`，不读取凭据或请求 Provider。字段纳入未发布 schema 9；它不是曲面贴图或 AI 材质融合。

`GenerationNode.removeBackground` 表示单主图透明抠图，不能与局部选区或多视角组合。该模式纳入 schema 9，影响候选输入签名；透明输出支持是 Provider 非敏感设置，不进入工程。结果透明度验证和原图 RGB 保护在 Action 的运行时图像适配层完成，Provider 不写项目。

`GenerationNode.localEditMode = 'erase'` 显式表示消除，必须同时启用 `localEdit` 且不能组合多视角任务；不设置该字段保持普通局部编辑。该字段纳入尚未发布的 schema 9；旧工程未设置时语义不变。消除使用独立能力路由、同一蒙版和选区外保护，仍输出未采纳候选。

当前工程 schema 9 / Dexie 7。`EditRegion.shape` 可选多边形顶点或画笔笔画，坐标归一化到主图；画笔半径以图片短边为基准。省略 shape 保留原矩形语义。8→9 迁移不改旧矩形；新格式由不支持的旧应用拒绝，防止静默退化成矩形。请求 PNG 蒙版与选区外像素保护共用二值栅格。最多 256 个多边形顶点、128 笔、每笔 1024 点且总共不超过 4096 点；无效几何在导入时拒绝，空选区和超出计算上限在请求前拒绝。

工程 schema 8 / Dexie 6：`GroupNode.childNodeIds` 仅组织同一 Board 内的节点，不创建 Asset、Design 或血缘。成员仍保存世界坐标、稳定 ID，并可独立选择和移动。组标题拖动一次性提交成员位移；成员改变尺寸或位置时重算组框。解组或删除组框不删除内容；删除成员会清理其组引用。

当前不支持嵌套分组、重复成员或跨画板分组；工程导入和快照保存均验证此约束。7→8 迁移保留旧节点；旧版预留的 `group` 卡片初始化为空成员，不能依据空间位置猜测成员关系。旧应用应拒绝 schema 8，不能静默丢失分组。复制组会重新映射节点及成员 ID；含待评审候选时需先采纳，避免复制候选身份。

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
