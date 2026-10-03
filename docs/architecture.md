# ID Canvas / Open Industrial Design — 前期产品与技术架构总纲

> 面向工业设计 / 产品设计的开源、Local-first、BYOK、Model-agnostic 设计画布  
> 文档用途：作为 Codex / Claude Code / Cursor 等 AI 编程工具的长期项目上下文与开发约束  
> 当前阶段：Pre-MVP / Architecture Planning

---

# 0. 项目一句话定位

**一个面向工业设计 / 产品设计的开源 Pre-CAD Design Workspace。**

它不是通用白板，也不是 AI 生图网站，更不是 CAD 软件。

核心目标是把工业设计前期流程：

> Reference → Moodboard → Sketch → Concept → Variant → Multi-view → CMF → 3D → Review → Decision

放入一个可追踪、可分支、可比较、可调用 AI 的无限画布中。

---

# 1. 项目原则

整个项目在后续开发中必须坚持以下五条原则：

1. **Open Source**
   - 核心编辑能力开源。
   - 核心工业设计能力不应被强制锁在付费版本。
   - 商业化主要围绕 Cloud、协作、托管、团队和企业能力。

2. **Local First**
   - 用户不注册账号也能完整使用核心功能。
   - 项目默认保存本地。
   - 云服务未来作为可选层，而不是运行前提。

3. **BYOK — Bring Your Own Key**
   - 用户可以自行接入模型 API。
   - 核心功能不能依赖官方 Token。
   - 官方未来可以提供 Managed AI，但必须与 BYOK 并存。

4. **Model Agnostic**
   - 不把产品绑定在 OpenAI、Gemini、Flux 或任何单一模型上。
   - 模型属于 Provider Layer。
   - 上层功能只调用统一 Capability。

5. **Industrial Design Native**
   - 产品差异化不是 Infinite Canvas。
   - 产品差异化必须来自工业设计工作流。

---

# 2. 产品边界

## 2.1 我们要做什么

ID Canvas 主要覆盖：

- 设计研究
- 参考图收集
- Moodboard
- 草图整理
- AI 方案探索
- Concept 分支
- 方案版本追踪
- Design DNA
- 多视图管理
- CMF 方案探索
- 3D 文件查看
- 设计评审
- 设计决策记录
- 后续进入 CAD 前的方案沉淀

---

## 2.2 我们暂时不做什么

前期必须明确避免：

- 不做 CAD 内核
- 不做 NURBS 建模
- 不做参数化建模
- 不做 SolidWorks 替代品
- 不做 Rhino 替代品
- 不做完整 Blender 替代品
- 不做视频剪辑器
- 不做全功能 Figma
- 不做通用在线白板
- 不做复杂项目管理系统
- 不做企业级权限系统
- 不做重型云后端
- 不做自有 GPU 推理平台

产品边界：

```text
Research
   ↓
Ideation
   ↓
Concept
   ↓
Refinement
   ↓
Design Decision
   ↓
----------------
   ↓
CAD / Engineering
```

---

# 3. 产品核心差异化

整个产品优先围绕以下四个概念建设：

## 3.1 Design Graph

每个设计节点都拥有语义关系。

不是：

```text
Image A
Image B
Image C
```

而是：

```text
Reference
   ↓
Concept A
   ├── Variant A1
   ├── Variant A2
   └── Variant A3
           ↓
       Multi-view
           ↓
          CMF
           ↓
      Approved
```

每个 Edge 都应该有语义。

建议首批 EdgeType：

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

---

## 3.2 Design DNA

Design DNA 用于描述某个产品方案需要被保留的核心设计属性。

首版 DesignDNA 可以包含：

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

未来扩展：

- silhouette embedding
- shape similarity
- reference image binding
- brand signature
- geometry consistency score
- AI constraint prompt

首版不必做复杂视觉模型。

先做：

> 用户可以手动定义哪些属性需要锁定，并把这些约束传给 AI Action。

---

## 3.3 Multi-view Set

工业设计中不同角度必须属于同一个产品。

定义一个 ViewSet：

```ts
type ViewType = 'front' | 'rear' | 'left' | 'right' | 'top' | 'bottom' | 'perspective';

interface ViewSet {
  id: string;
  designId: string;
  views: Partial<Record<ViewType, AssetRef>>;
}
```

UI 形式：

```text
┌─────────┬─────────┐
│ Front   │ Side    │
├─────────┼─────────┤
│ Rear    │ Top     │
├─────────┴─────────┤
│ Perspective       │
└───────────────────┘
```

首版重点：

- 可以创建 ViewSet
- 可以往不同角度槽位添加图片
- ViewSet 与 Design 绑定
- ViewSet 可作为一个 Canvas Node

暂时不做：

- AI 自动一致性检测
- 自动 3D Reconstruction

---

## 3.4 CMF Matrix

CMF = Color / Material / Finish。

建议模型：

```ts
interface CMFVariant {
  id: string;

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

未来可扩展：

- roughness
- metallic
- transmission
- IOR
- normal map
- KeyShot export
- Blender export

首版重点：

> 一个 Concept 可以拥有多个 CMF Variant。

---

# 4. 总体技术架构

推荐第一阶段：

```text
React
TypeScript
Vite

↓

Canvas Engine
Konva / react-konva

↓

Application State
Zustand

↓

Local Persistence
IndexedDB
Dexie

↓

3D
Three.js
React Three Fiber

↓

AI Provider Layer

↓

OpenAI / Gemini / Replicate / fal / ComfyUI / Custom
```

---

# 5. 为什么前期采用 Konva

推荐：

```text
react-konva
+
Konva
```

原因：

- MIT
- Canvas / scene graph 成熟
- 支持 selection
- drag
- resize
- transform
- image
- text
- custom nodes
- export
- pointer events

相比直接 Fork Excalidraw：

- 自定义 Node 自由度更高
- 更适合后续加入工业设计专用组件
- 不被既有白板数据结构强绑定

---

# 6. 前端总体模块划分

建议：

```text
src/
│
├── app/
├── canvas/
├── design/
├── assets/
├── ai/
├── providers/
├── three/
├── storage/
├── plugins/
├── export/
├── ui/
├── hooks/
├── store/
├── types/
└── utils/
```

---

# 7. 推荐 Repo 结构

第一阶段建议先 Monorepo。

使用：

```text
pnpm workspace
```

Repo：

```text
open-industrial-design/
│
├── apps/
│   ├── web/
│   └── desktop/        # 后期 Tauri
│
├── packages/
│   ├── core/
│   ├── canvas/
│   ├── design-model/
│   ├── ai-core/
│   ├── provider-openai/
│   ├── provider-gemini/
│   ├── provider-custom/
│   ├── provider-comfyui/
│   ├── three-viewer/
│   ├── storage/
│   ├── plugin-sdk/
│   └── ui/
│
├── examples/
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── plugin-system.md
│   ├── providers.md
│   └── roadmap.md
│
├── .github/
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

# 8. 核心数据模型

必须先设计数据结构，再堆 UI。

## 8.1 Project

```ts
interface Project {
  id: string;
  name: string;

  schemaVersion: number;

  createdAt: number;
  updatedAt: number;

  boardIds: string[];

  settings: ProjectSettings;
}
```

---

## 8.2 Board

```ts
interface Board {
  id: string;
  projectId: string;

  name: string;

  nodeIds: string[];
  edgeIds: string[];

  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}
```

---

## 8.3 Node

统一 BaseNode：

```ts
interface BaseNode {
  id: string;

  type: NodeType;

  x: number;
  y: number;

  width: number;
  height: number;

  rotation?: number;

  zIndex: number;

  createdAt: number;
  updatedAt: number;
}
```

首批 NodeType：

```ts
type NodeType =
  | 'image'
  | 'text'
  | 'sketch'
  | 'reference'
  | 'concept'
  | 'variant'
  | 'viewset'
  | 'cmf'
  | 'model3d'
  | 'group';
```

---

# 9. Node 与 Asset 分离

非常重要：

> Canvas Node 不能直接等于文件。

Node：

```text
负责：
位置
尺寸
语义
关系
UI
```

Asset：

```text
负责：
文件
媒体
blob
路径
metadata
```

---

## Asset

```ts
interface Asset {
  id: string;

  type: 'image' | 'video' | 'model3d' | 'document' | 'texture';

  name: string;

  mimeType: string;

  size: number;

  storage: AssetStorage;

  createdAt: number;
}
```

Local storage：

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

未来加入：

```text
S3
R2
WebDAV
NAS
Google Drive
Cloud
```

---

# 10. Canvas 状态

Zustand 不应该存整个大文件。

建议：

```ts
interface CanvasState {
  selectedNodeIds: string[];

  hoveredNodeId?: string;

  activeTool: ToolType;

  viewport: Viewport;

  selectNode(): void;
  moveNode(): void;
  resizeNode(): void;
  deleteNode(): void;
}
```

Project 数据和 UI 状态要区分。

---

# 11. Local-first 数据层

第一版：

```text
IndexedDB
+
Dexie
```

数据库：

```text
projects
boards
nodes
edges
assets
settings
providers
history
```

---

# 12. Autosave

首版必须支持。

逻辑：

```text
User Operation
    ↓
Zustand
    ↓
Debounce
    ↓
IndexedDB
```

建议：

```text
500ms - 1500ms debounce
```

不要每次 pointermove 都直接写数据库。

---

# 13. Undo / Redo

第一阶段建议 Command Pattern。

```ts
interface Command {
  execute(): void;
  undo(): void;
}
```

操作例如：

```text
MoveNodeCommand
ResizeNodeCommand
CreateNodeCommand
DeleteNodeCommand
CreateEdgeCommand
UpdateNodeCommand
```

以后 Design History 也可以复用。

---

# 14. Project 文件格式

建议定义自己的开放格式：

```text
.oidproj
```

本质：

```text
ZIP
```

结构：

```text
project.oidproj

├── manifest.json
├── project.json
├── boards/
├── assets/
│   ├── images/
│   ├── models/
│   └── textures/
└── thumbnails/
```

目标：

- 可导入
- 可导出
- 可迁移
- 不锁用户数据

---

# 15. Schema Version

一定从第一天加入：

```json
{
  "schemaVersion": 1
}
```

以后：

```ts
migrateV1ToV2();
```

否则后续数据结构调整会很痛苦。

---

# 16. AI 架构

不要让任何 UI 直接调用 OpenAI SDK。

必须：

```text
UI
 ↓
AI Action
 ↓
Capability
 ↓
Provider Adapter
 ↓
Model
```

---

# 17. AI Capability

定义能力，而不是模型。

```ts
type AICapability =
  'text.generate' | 'vision.analyze' | 'image.generate' | 'image.edit' | 'image.variation';
```

未来：

```text
3d.generate
3d.analyze
video.generate
embedding
```

---

# 18. Provider Interface

示例：

```ts
interface AIProvider {
  id: string;
  name: string;

  capabilities: AICapability[];

  testConnection(): Promise<boolean>;
}
```

图像模型：

```ts
interface ImageGenerationProvider extends AIProvider {
  generateImage(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}
```

---

# 19. 第一批 Provider

优先级：

## P0

```text
Custom OpenAI-compatible
```

必须最先做。

字段：

```text
Name
Base URL
API Key
Model ID
```

这是最重要的通用接口。

---

## P1

```text
OpenAI
Gemini
```

---

## P2

```text
Replicate
fal.ai
```

---

## P3

```text
ComfyUI
Ollama
Local models
```

---

# 20. API Key 保存策略

设置：

```text
Settings
→ Providers
```

支持：

```text
Remember Key
```

两种模式：

### Session

```text
memory only
```

页面关闭后消失。

### Local

```text
IndexedDB
```

存本地。

必须告诉用户：

> API keys are stored locally and are not uploaded to Open Industrial Design servers.

未来如果 Desktop：

可以接系统 Keychain。

---

# 21. CORS 问题

部分 API 不能直接从浏览器请求。

因此架构必须允许：

```text
Browser
↓
Local Proxy
↓
Provider
```

未来提供：

```bash
npx open-industrial-design-proxy
```

首版可暂时先支持浏览器可直接调用的 API。

不要前期被 Proxy 拖慢。

---

# 22. AI Action

产品层不应该让用户只看到模型。

应该看到：

```text
Render Sketch
Generate Variant
Analyze Design
Explore CMF
Create Multi-view
```

例如：

```ts
interface AIAction {
  id: string;
  name: string;

  requiredCapabilities: AICapability[];

  execute(context: ActionContext): Promise<ActionResult>;
}
```

然后用户可以指定：

```text
Render Sketch
→ Provider A

Analyze Design
→ Provider B
```

---

# 23. Model Profile

未来支持：

```yaml
name: Industrial Render

provider: custom
model: flux-kontext

defaults:
  aspectRatio: '4:3'
  preserveGeometry: true
  referenceStrength: 0.8
```

首版先不要实现 YAML Import。

先把数据结构预留。

---

# 24. 3D 模块

第一阶段：

```text
Three.js
+
React Three Fiber
+
drei
```

支持：

```text
GLB
GLTF
OBJ
STL
```

暂时不支持：

```text
STEP
IGES
BREP
```

STEP/IGES 可在第二阶段接 OpenCascade WASM。

---

# 25. Model3D Node

```ts
interface Model3DNode extends BaseNode {
  type: 'model3d';

  assetId: string;

  camera?: CameraPreset;

  renderMode?: 'solid' | 'wireframe';
}
```

功能：

- Orbit
- Zoom
- Reset
- Perspective
- Orthographic
- Screenshot

首版不做：

- 建模
- mesh edit
- material editor

---

# 26. UI 信息架构

建议布局：

```text
┌────────────────────────────────────────────┐
│ Top Bar                                    │
├──────┬──────────────────────────┬──────────┤
│ Tool │                          │ Inspector│
│ Bar  │         Canvas           │ Panel    │
│      │                          │          │
├──────┴──────────────────────────┴──────────┤
│ Bottom / Status                            │
└────────────────────────────────────────────┘
```

---

# 27. 左侧 Toolbar

第一版：

```text
Select
Hand
Text
Image
Sketch
Reference
Concept
Variant
ViewSet
CMF
3D
Connector
```

---

# 28. 右侧 Inspector

根据选中 Node 动态变化。

例如 Concept：

```text
Name
Status
Tags

Design DNA

Relations

AI Actions
```

CMF：

```text
Color
Material
Finish
Notes
```

---

# 29. Command Palette

尽早加入：

```text
Ctrl / Cmd + K
```

用于：

```text
Add Image
Create Concept
Run AI Action
Create CMF
Create ViewSet
Export
Settings
```

后续 Agent 也能共用 Action Registry。

---

# 30. Action Registry

这是未来插件系统、Command Palette、Agent 的基础。

```ts
interface AppAction {
  id: string;
  label: string;

  canRun(context: ActionContext): boolean;

  run(context: ActionContext): Promise<void>;
}
```

例如：

```text
node.duplicate
node.delete
concept.createVariant
cmf.create
viewset.create
ai.renderSketch
```

---

# 31. Plugin 系统

第一版不要真正开放第三方 Plugin。

但架构必须留接口。

未来：

```ts
interface Open Industrial DesignPlugin {
  id: string;
  name: string;

  activate(api: PluginAPI): void;
}
```

Plugin API 可能包含：

```text
registerNodeType
registerAction
registerProvider
registerPanel
registerImporter
registerExporter
```

---

# 32. MCP

MCP 不属于 v0.1。

但未来 Agent 控制画布时，可以将 Action Registry 暴露为 MCP Tools：

```text
create_node
move_node
create_variant
create_cmf
create_viewset
run_ai_action
get_selection
get_project_context
```

因此现在的 Action API 要尽量稳定。

---

# 33. Cloud 边界

v0.1 不做 Cloud。

但本地架构不要阻碍未来同步。

未来 Cloud：

```text
Cloud
├── Auth
├── Project Sync
├── Asset Storage
├── Sharing
├── Review
├── Comments
└── Collaboration
```

---

# 34. Cloud 不应该承载什么

核心 AI 不强制经过服务器。

BYOK：

```text
User
↓
Provider
```

而不是：

```text
User
↓
Open Industrial Design Server
↓
Provider
```

避免：

- 高推理成本
- Token 风险
- 隐私风险

---

# 35. 未来商业版本

开源：

```text
Canvas
Design Graph
Design DNA
Multi-view
CMF
3D Viewer
BYOK
Plugin SDK
Project Import / Export
```

收费：

```text
Cloud Sync
Cloud Storage
Team Workspace
Review Link
Comments
Realtime Collaboration
History
Enterprise Admin
SSO
Audit
Managed AI
```

---

# 36. Desktop 路线

第一阶段：

```text
Web
```

后期：

```text
Tauri
```

不优先 Electron。

Desktop 的价值：

- 访问本地文件
- 更安全保存 Key
- 本地模型
- ComfyUI
- Rhino / Blender / KeyShot Connector
- 大文件 Asset

---

# 37. 开发阶段

---

## Phase 0 — Foundation

目标：

> 项目能启动，架构可长期扩展。

任务：

```text
Monorepo
React
TypeScript
Vite
pnpm
ESLint
Prettier
Vitest
Zustand
Dexie
```

完成：

- Repo
- 包结构
- 基础 Layout
- 基础数据类型
- IndexedDB

---

## Phase 1 — Canvas Core

目标：

> 得到真正可用的 Infinite Canvas。

功能：

```text
Pan
Zoom
Select
Multi-select
Move
Resize
Delete
Duplicate
Z-index
Undo
Redo
```

Node：

```text
Text
Image
Reference
```

不要加入 AI。

---

## Phase 2 — Industrial Design Model

目标：

> 从白板升级成工业设计工具。

加入：

```text
Concept
Variant
Design Graph
Semantic Edge
Design DNA
ViewSet
CMF
```

此阶段是产品最重要阶段。

---

## Phase 3 — Local Project

加入：

```text
Autosave
Project Manager
Import
Export
.oidproj
Asset Manager
```

达到：

> 可以日常使用，不怕刷新丢数据。

---

## Phase 4 — AI / BYOK

加入：

```text
Provider Settings
Custom Provider
OpenAI
Gemini
AI Action Registry
Render Sketch
Generate Variant
Analyze Design
```

重点：

> AI 必须建立在 Design Model 上，而不是反过来。

---

## Phase 5 — 3D

加入：

```text
GLB
GLTF
OBJ
STL
3D Node
Perspective
Orthographic
Screenshot
```

---

## Phase 6 — Polish / Release

加入：

```text
Onboarding
Templates
Demo Project
Keyboard Shortcuts
Error Handling
Performance
README
Screenshots
Demo GIF
Docs
```

发布：

```text
v0.1.0
```

---

# 38. v0.1 Feature Freeze

正式 v0.1 只允许以下核心能力：

## Canvas

- Infinite Canvas
- Pan
- Zoom
- Select
- Multi-select
- Move
- Resize
- Text
- Image
- Connector

## Industrial Design

- Reference
- Concept
- Variant
- Semantic Relations
- Design DNA
- Multi-view Set
- CMF

## AI

- BYOK
- Custom Provider
- 最少一个官方 Provider
- Generate Variant
- Analyze
- Image Generation / Edit 中至少一种

## 3D

- GLB / GLTF
- OBJ / STL 可选
- Viewer

## Data

- Local-first
- Autosave
- Import / Export
- Schema Version

---

# 39. 明确禁止 v0.1 添加的功能

Codex 在开发过程中不得自行扩展：

```text
账号系统
支付
团队协作
实时协作
云同步
Marketplace
MCP
STEP Editor
CAD Modeling
Video Editor
复杂动画
企业权限
SSO
大型 Dashboard
AI Credit System
```

除非人工明确改变 scope。

---

# 40. Codex 开发规则

每次让 Codex 开发时，应遵循：

## Rule 1

不要一次实现多个大型模块。

错误：

```text
帮我把整个画布、AI、3D、云端全部开发出来
```

正确：

```text
实现 ImageNode 的 selection / resize。
```

---

## Rule 2

每次修改前先读：

```text
docs/architecture.md
docs/data-model.md
```

---

## Rule 3

任何重要数据结构修改都必须先解释影响。

---

## Rule 4

不要为了完成当前任务破坏模块边界。

---

## Rule 5

Provider 不能侵入 Canvas。

---

## Rule 6

Cloud 逻辑不能侵入 Core。

---

## Rule 7

所有 Node 必须走统一 Node Registry。

---

## Rule 8

所有可执行功能尽可能注册成 Action。

---

# 41. Node Registry

未来：

```ts
interface NodeDefinition {
  type: NodeType;

  component: React.ComponentType<any>;

  createDefault(): BaseNode;
}
```

这样插件以后可以扩展 Node。

---

# 42. Import / Export Registry

```ts
interface Importer {
  id: string;
  extensions: string[];

  import(file: File): Promise<ImportResult>;
}
```

```ts
interface Exporter {
  id: string;

  export(context: ExportContext): Promise<Blob>;
}
```

未来：

```text
PNG
PDF
JSON
.oidproj
GLB
Presentation
```

---

# 43. 性能原则

工业设计项目图片多。

因此：

- 大图生成 thumbnail
- Canvas 使用 preview
- 原图按需加载
- 不要把 Base64 存 Redux / Zustand
- Blob 存 IndexedDB
- 大对象不要频繁 clone
- pointermove 不触发数据库写入
- image decode 尽可能异步

未来大量 Node：

- viewport culling
- lazy rendering

---

# 44. 图片 Asset Pipeline

导入：

```text
Original Image
↓
Store Blob
↓
Generate Thumbnail
↓
Create Asset
↓
Create Node
```

Canvas：

```text
Thumbnail / Medium Preview
```

Export：

```text
Original
```

---

# 45. 隐私原则

Local-first 是产品卖点。

必须明确：

```text
Design files remain local by default.
```

如果用户 BYOK：

```text
Only selected data is sent to the configured provider.
```

不能偷偷上传项目。

---

# 46. Error Handling

AI 操作不能导致画布状态损坏。

逻辑：

```text
Action Start
↓
Create Pending Generation
↓
Provider Call
↓
Success
    → create asset
    → create node
Failure
    → error status
```

不要先覆盖原始 Node。

---

# 47. AI 生成永不覆盖原方案

必须：

```text
Original
↓
Generated Variant
```

而不是：

```text
Original → Replace
```

默认保存 lineage。

这属于产品原则。

---

# 48. Design Status

Concept：

```ts
type DesignStatus = 'exploring' | 'candidate' | 'review' | 'approved' | 'rejected' | 'archived';
```

这样未来 Review / Cloud 不需要重新改模型。

---

# 49. Design Entity

建议把 Canvas Node 与 Design Entity 分开。

原因：

同一个 Design 可以有：

```text
Concept Card
ViewSet
CMF
3D
Render
```

所以：

```ts
interface Design {
  id: string;

  name: string;

  status: DesignStatus;

  parentDesignId?: string;

  dna?: DesignDNA;

  tagIds: string[];
}
```

Node：

```ts
designId?: string;
```

这是重要架构决策。

---

# 50. 总体关系

最终逻辑：

```text
Project
│
├── Board
│    │
│    ├── Nodes
│    └── Edges
│
├── Designs
│    │
│    ├── Concept A
│    │     ├── Variant A1
│    │     └── Variant A2
│    │
│    └── Concept B
│
├── Assets
│
├── CMF
│
├── ViewSets
│
└── Generations
```

---

# 51. Future：Design Review

后续商业化重点预留：

```text
Share Review Link
↓
Viewer
↓
Comment
↓
Select CMF
↓
Approve
↓
Design Status = approved
```

现在只需要提前保留：

```text
status
decision
comment
```

数据能力。

---

# 52. Future：Connector

后期：

```text
Rhino
Blender
KeyShot
SolidWorks
Fusion
```

连接形式：

```text
Desktop Plugin
↓
Local Bridge
↓
Open Industrial Design
```

第一阶段不要实现。

---

# 53. Future：Cloud Storage

未来：

```text
PostgreSQL
+
Object Storage
```

Node Metadata：

```text
DB
```

文件：

```text
Object Storage
```

不要把大文件放数据库。

---

# 54. 开源 License

初期建议候选：

```text
Apache-2.0
```

原因：

- permissive
- 商业友好
- patent clause

最终发布前再确认第三方依赖 License。

---

# 55. README 定位

建议：

```text
Open Industrial Design

Open-source AI workspace for industrial designers.

Sketch.
Branch.
Compare.
Lock design DNA.
Explore CMF.
Maintain multi-view consistency.
Move into CAD with confidence.
```

卖点：

```text
Open Source
Local First
BYOK
Model Agnostic
Industrial Design Native
```

---

# 56. 首页 Demo 应展示什么

不要只展示白板。

应该演示：

```text
Reference
↓
Sketch
↓
AI Render
↓
Variant × 4
↓
Design DNA
↓
CMF
↓
ViewSet
↓
3D
```

用户 10 秒内必须理解：

> 这不是普通白板。

---

# 57. Token 节省策略

因为 Codex Token 成本高：

## 方案一：稳定文档

将以下文件长期维护：

```text
docs/
├── architecture.md
├── data-model.md
├── conventions.md
├── roadmap.md
└── current-task.md
```

每次只让 Codex：

```text
Read architecture.md
Read data-model.md
Read current-task.md
```

不要重复解释整个项目。

---

## 方案二：任务原子化

一次 Prompt 只做一个模块。

例如：

```text
Task:
Implement ImageNode resize behavior.

Constraints:
- use NodeRegistry
- no provider changes
- no data model changes
```

---

## 方案三：禁止无意义 Refactor

Prompt 明确：

```text
Do not refactor unrelated code.
Do not rename unrelated files.
Do not upgrade dependencies unless necessary.
```

---

## 方案四：要求差异输出

让 Codex 每次结束提供：

```text
Changed files
Why
Tests
Known issues
```

便于下一次不用重新扫描整个 Repo。

---

# 58. 推荐的 Codex 初始 Prompt

可直接使用：

```text
You are helping build Open Industrial Design, an open-source, local-first,
BYOK design workspace for industrial/product designers.

Before making changes:

1. Read:
   - docs/architecture.md
   - docs/data-model.md
   - docs/current-task.md

2. Follow these architectural boundaries:
   - Core canvas must not depend on any AI provider.
   - Cloud features must not be required for local usage.
   - Assets and nodes must remain separate concepts.
   - AI generation must create derived nodes and preserve lineage.
   - Important actions should use the Action Registry.
   - Node types should use the Node Registry.
   - Do not implement features outside the current task.

3. Do not:
   - refactor unrelated code
   - upgrade unrelated dependencies
   - introduce cloud-only dependencies into core
   - add account/payment/collaboration features unless explicitly requested

4. At the end, report:
   - changed files
   - architectural decisions
   - tests run
   - known limitations
```

---

# 59. 推荐第一次实际开发任务

不要让 Codex 一次搭完整产品。

第一任务：

```text
Create the pnpm monorepo foundation.

Apps:
- apps/web

Packages:
- packages/core
- packages/canvas
- packages/design-model
- packages/storage
- packages/ui

Set up:
- React
- TypeScript
- Vite
- Zustand
- Dexie
- Vitest
- ESLint
- Prettier

Create only:
- blank application shell
- basic layout
- shared package imports

Do not implement canvas features yet.
```

第二任务：

```text
Implement basic infinite canvas:
- pan
- zoom
- selection
```

第三任务：

```text
Implement NodeRegistry and ImageNode.
```

第四任务：

```text
Implement node transform:
- move
- resize
- multi-select
```

第五任务：

```text
Implement IndexedDB project persistence.
```

然后才开始：

```text
Concept
Variant
Design Graph
```

---

# 60. 最重要的开发顺序

必须遵循：

```text
Foundation
↓
Canvas
↓
Data Model
↓
Industrial Design Features
↓
Persistence
↓
AI
↓
3D
↓
Cloud
```

绝对不要：

```text
AI
↓
再补数据结构
↓
再补 Canvas
```

否则项目非常容易变成：

> 又一个 AI 图片生成壳。

---

# 61. MVP 成功标准

v0.1 不看收入。

验证：

### 设计师是否能完成：

```text
导入参考图
↓
整理灵感
↓
创建 Concept
↓
生成 Variant
↓
记录方案关系
↓
创建 CMF
↓
建立 ViewSet
↓
打开 3D
↓
保存项目
```

如果这一条跑通：

> 产品成立。

---

# 62. 当前最终架构结论

第一版：

```text
React + TypeScript + Vite

Canvas:
Konva

State:
Zustand

Storage:
Dexie + IndexedDB

3D:
Three.js + React Three Fiber

AI:
Provider Adapter + BYOK

Architecture:
Action Registry
Node Registry
Asset / Node separation
Design Entity
Design Graph

Project:
Local-first
.oidproj export

Cloud:
Not in v0.1
```

产品核心：

```text
Design Graph
+
Design DNA
+
Multi-view
+
CMF
```

而不是：

```text
Infinite Canvas
+
AI Chat
```

---

# 63. 项目北极星

在任何功能决策中，都问：

> 这个功能是否帮助工业设计师更清楚地探索、比较、保持一致性、做出设计决策，并顺利进入 CAD？

如果答案是否定的：

> 不应进入核心路线。

---

**End of architecture document.**

---

# 64. 开源项目参考基线（Open-source Reference Baseline）

> 本节用于告诉开发者和 Codex：Open Industrial Design 应该参考哪些成熟项目、具体参考什么，以及哪些项目只能作为架构研究对象。
>
> **原则：Open Industrial Design 不直接 Fork 某一个大型白板项目。**
>
> 推荐路线是：
>
> ```text
> 独立数据模型
> +
> 独立工业设计语义层
> +
> 组合成熟的 permissive 基础库
> +
> 借鉴成熟开源产品的交互与架构思想
> ```

---

# 65. 参考项目矩阵

| 项目                | Open Industrial Design 参考内容                                  | 使用方式                      | 当前许可判断                                               | 优先级            |
| ------------------- | ---------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- | ----------------- |
| Konva / react-konva | Canvas scene graph、拖拽、Transform、selection、图片、文本、导出 | **直接依赖候选**              | MIT                                                        | P0                |
| Excalidraw          | 无限画布 UX、选择逻辑、快捷键、导入导出、白板交互细节            | 产品/交互参考；必要时研究实现 | MIT                                                        | P0                |
| React Flow / xyflow | Node/Edge、Graph View、工作流可视化、Custom Node                 | **后期直接依赖候选**          | MIT                                                        | P1                |
| PixiJS              | 大规模 2D 渲染、WebGL/WebGPU 性能优化                            | 性能升级候选，不进入 v0.1     | MIT                                                        | P2                |
| AFFiNE              | Local-first、文档与白板组合、Open Core、Workspace 思路           | 架构/商业模式参考             | 主体大量 MIT，但部分目录存在单独商业许可；必须逐目录核查   | P1                |
| BlockSuite          | Block model、Edgeless Editor、Yjs、时间旅行、编辑器分层          | 架构参考；不作为 v0.1 底座    | Repo 为 MPL-2.0，部分 package 许可可能不同，集成前单独审计 | P2                |
| Penpot              | 大型设计工具架构、插件、设计系统、团队协作、MCP/自动化方向       | 架构/产品参考                 | MPL-2.0                                                    | P1                |
| tldraw              | Shape / Tool / Binding / Store 思路、SDK 设计质量                | **仅参考设计思想**            | 当前生产环境 SDK 需要有效 license key                      | P0 Reference Only |
| Yjs                 | CRDT、Local-first、多人实时协作                                  | 后期直接依赖候选              | MIT                                                        | P2                |
| Three.js            | 浏览器 3D Viewer、GLTF/GLB、Camera、Renderer                     | **直接依赖候选**              | MIT                                                        | P1                |

---

# 66. 第一优先参考：Konva

GitHub：

```text
https://github.com/konvajs/konva
```

Open Industrial Design 主要借鉴 / 使用：

```text
Scene Graph
Events
Drag & Drop
Transformer
Image
Text
Layer
Stage
Export
```

推荐角色：

```text
Open Industrial Design Canvas Engine
        ↓
react-konva
        ↓
Konva
```

Open Industrial Design **不应该复制 Konva 的上层产品结构**。

Konva 只是：

> Rendering / Interaction Infrastructure

工业设计数据模型必须由 Open Industrial Design 自己定义。

---

# 67. Excalidraw 参考范围

GitHub：

```text
https://github.com/excalidraw/excalidraw
```

Excalidraw 不建议直接作为 Open Industrial Design 的长期核心底座。

主要学习：

### Interaction

```text
Pan
Zoom
Selection
Multi-selection
Keyboard shortcuts
Clipboard
Drag & Drop
Context Menu
Element grouping
```

### Product UX

```text
低学习成本
快速启动
弱 UI 干扰
Canvas first
快捷键体系
```

### File / Export

参考其：

```text
JSON scene
asset handling
export workflow
```

但 Open Industrial Design 的文件结构必须围绕：

```text
Design
Asset
Node
Edge
ViewSet
CMF
Generation
```

重新定义。

---

# 68. React Flow / xyflow 参考范围

GitHub：

```text
https://github.com/xyflow/xyflow
```

不要让 React Flow 管 Open Industrial Design 主画布。

建议未来提供：

```text
Canvas View
      ↕
Graph View
```

Graph View 示例：

```text
Reference
    ↓
Concept A
 ┌──┴───┐
 A1     A2
         ↓
       CMF
         ↓
     Approved
```

React Flow 负责：

```text
Design Lineage Visualization
Workflow Visualization
AI Pipeline View
```

而不是：

```text
Image Editing Canvas
```

---

# 69. PixiJS 参考范围

GitHub：

```text
https://github.com/pixijs/pixijs
```

v0.1 不使用 PixiJS。

只有当 Konva 出现以下问题时再评估：

```text
Node 数量过大
大量高分辨率图片
持续掉帧
复杂 Shader
需要 WebGL / WebGPU 优化
```

可能路线：

```text
Konva
↓
性能瓶颈验证
↓
局部 PixiJS
或
Renderer abstraction
```

禁止：

> 在没有真实 benchmark 前提前重写 Canvas Engine。

---

# 70. AFFiNE 参考范围

GitHub：

```text
https://github.com/toeverything/AFFiNE
```

重点研究：

```text
Local-first
Workspace
Block + Canvas
Offline data
Sync abstraction
Open Core
Cloud commercialization
```

尤其参考它的产品边界：

```text
Community / Local
+
Cloud
+
Enterprise
```

与 Open Industrial Design 商业化方向高度相关。

但是：

> 不要直接复制 AFFiNE backend / native 目录代码。

AFFiNE 当前不同目录存在不同许可规则，真正引入任何代码之前必须逐目录确认 LICENSE。

Open Industrial Design 前期主要借：

> Architecture Idea

不直接依赖 AFFiNE。

---

# 71. BlockSuite 参考范围

GitHub：

```text
https://github.com/toeverything/blocksuite
```

值得研究：

```text
Block abstraction
Document model
Edgeless editor
Selection system
Yjs integration
Time travel
Collaboration-ready architecture
```

尤其可以启发 Open Industrial Design：

```text
Node Registry
Action Registry
Document State
Canvas State
```

但 Open Industrial Design 不是：

> BlockSuite Fork

原因：

- Open Industrial Design 数据核心是 Industrial Design Entity
- Open Industrial Design 不需要完整 rich-text document editor
- v0.1 不需要 CRDT-first
- 避免引入不必要复杂度

---

# 72. Penpot 参考范围

GitHub：

```text
https://github.com/penpot/penpot
```

重点研究：

### 大型 Design Tool

```text
Workspace architecture
Design system
Asset organization
Plugin architecture
Team workflow
```

### 后期方向

```text
Automation
Plugin
MCP
Design ↔ Code / Agent
```

Open Industrial Design 可借鉴：

> 一个专业设计工具如何从单纯 Canvas 演化成 Platform。

但 Penpot 的 MPL-2.0 代码不应被无审计地复制进入未来可能采用 Apache-2.0 的 Open Industrial Design Core。

---

# 73. tldraw 参考范围

官网：

```text
https://tldraw.dev/
```

GitHub：

```text
https://github.com/tldraw/tldraw
```

这是一个 **高价值架构参考，但不作为 Open Industrial Design 核心依赖** 的项目。

重点学习：

```text
Shape
Tool
Binding
Store
Editor API
Custom Shape
Custom Tool
Command-oriented editor architecture
```

Open Industrial Design 可以受到以下结构启发：

```text
Node Registry
Tool Registry
Action Registry
Binding / Relation
```

但必须注意：

> 当前 tldraw SDK 的默认许可并不是“生产环境无限制 MIT 使用”。

其官方目前要求生产部署具有相应 trial / commercial / hobby license key。

因此项目规则：

```text
DO NOT:
- add tldraw SDK as a production dependency
- base Open Industrial Design runtime on tldraw
- assume tldraw is MIT
```

可以：

```text
DO:
- study public architecture
- study interaction design
- independently implement similar generic software patterns
```

---

# 74. Yjs 参考范围

GitHub：

```text
https://github.com/yjs/yjs
```

Yjs 不进入 v0.1。

未来进入：

```text
Phase 7 — Collaboration
```

用途：

```text
Realtime collaboration
Offline merge
CRDT
Presence
Shared canvas state
```

大致路线：

```text
Local Open Industrial Design Document
        ↓
Sync Adapter
        ↓
Yjs
        ↓
WebSocket / Cloud
```

重要原则：

> Core data model 不应该从第一天就强绑定 Yjs 数据结构。

先定义 domain model，再增加 synchronization adapter。

---

# 75. Three.js 参考范围

GitHub：

```text
https://github.com/mrdoob/three.js
```

用于：

```text
Model3DNode
GLB / GLTF
OBJ
STL
Perspective camera
Orthographic camera
Screenshot
Orbit controls
```

推荐：

```text
three
@react-three/fiber
@react-three/drei
```

Three.js 属于：

> Open Industrial Design 3D Viewer Infrastructure

而不是：

> CAD Kernel

---

# 76. Open Industrial Design 最终“借鉴关系图”

```text
                            Open Industrial Design
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
      Canvas                Design Graph             3D
        │                      │                      │
      Konva                React Flow              Three.js
        │
        ├── UX reference → Excalidraw
        │
        ├── architecture reference → tldraw
        │
        └── performance future → PixiJS


                    Application Architecture
                              │
                ┌─────────────┼─────────────┐
                │             │             │
             AFFiNE       BlockSuite      Penpot
                │             │             │
           Local-first    block/state     platform
           open-core      Yjs pattern     plugin/MCP


                     Future Collaboration
                              │
                             Yjs
```

---

# 77. “借鉴”分为三种等级

后续所有 docs 和 Codex prompt 必须区分：

## Level A — Direct Dependency

可以直接通过 npm 等包管理器使用：

```text
Konva
React Flow
Three.js
Yjs
```

前提：

> 对实际安装版本再次进行 License Audit。

---

## Level B — Architecture Reference

阅读源码 / 文档，学习架构思想：

```text
Excalidraw
AFFiNE
BlockSuite
Penpot
```

默认：

> 不复制大段源码。

需要具体引入代码时单独审计。

---

## Level C — Conceptual Reference Only

```text
tldraw
```

只研究：

```text
API shape
Editor architecture
UX patterns
```

不作为生产依赖。

---

# 78. 禁止“拼装式 Fork”

Open Industrial Design 不采用：

```text
Fork Excalidraw
+
Copy tldraw
+
Copy AFFiNE
+
Add AI
```

这种路线。

原因：

```text
License complexity
Architecture conflict
Upgrade difficulty
Technical debt
缺少自己的 domain model
```

正确路线：

```text
成熟基础库
+
自己的 Core
+
自己的 Design Model
+
自己的 Industrial Design UX
```

---

# 79. Open Industrial Design Own Core

以下内容原则上必须自己设计：

```text
Design Entity
Design Graph semantics
Design DNA
ViewSet
CMF Model
Generation lineage
.oidproj format
AI Action abstraction
Provider abstraction
Industrial Design workflow
```

这些属于：

> Open Industrial Design 的产品 IP / 核心竞争力。

不能变成：

> 某个开源项目数据模型的小改版。

---

# 80. 第三方 License 审计规则

任何新 dependency 合入 Core 前：

Codex / Developer 必须检查：

```text
1. Repository license
2. Package license
3. 当前安装版本 license
4. 是否存在 dual license
5. 是否限制 production
6. 是否限制 commercial use
7. 是否要求 attribution
8. 是否有 copyleft obligations
```

建议维护：

```text
docs/third-party-licenses.md
```

格式：

```text
Package:
Version:
License:
Repository:
Usage:
Risk:
Reviewed At:
```

---

# 81. License 风险等级

定义：

### LOW

```text
MIT
BSD
Apache-2.0
```

通常允许：

```text
商业使用
修改
分发
```

仍需保留相应 copyright / notice。

---

### REVIEW

```text
MPL-2.0
LGPL
复杂 dual license
目录级不同 license
```

必须单独判断：

```text
修改文件
链接方式
分发方式
```

---

### HIGH

```text
Production license required
Commercial restriction
Source-available license
未知 license
```

默认：

> 不进入 Core dependency。

---

# 82. 当前 Reference Decision

v0.1 推荐实际依赖保持尽量少：

```text
react
typescript
vite

konva
react-konva

zustand

dexie

three
@react-three/fiber
@react-three/drei
```

AI SDK 也尽可能按 provider package 分离：

```text
provider-openai
provider-gemini
provider-custom
```

不应该为了“参考开源项目”而直接安装：

```text
excalidraw
tldraw
AFFiNE
BlockSuite
Penpot
PixiJS
React Flow
Yjs
```

其中 React Flow / Yjs 等到真正对应 Phase 再加入。

---

# 83. 给 Codex 的 Reference Rule

追加到 Codex Project Rules：

```text
OPEN-SOURCE REFERENCE RULES

Open Industrial Design is inspired by several open-source and source-available projects,
but it is not a fork of any of them.

Reference projects include:
- Konva
- Excalidraw
- React Flow / xyflow
- PixiJS
- AFFiNE
- BlockSuite
- Penpot
- tldraw
- Yjs
- Three.js

Rules:

1. Do not copy source code from a reference project unless explicitly instructed.
2. Do not introduce a reference project's runtime dependency merely because its architecture is mentioned.
3. Prefer independently implementing Open Industrial Design domain logic.
4. Treat tldraw as conceptual/reference-only unless licensing is explicitly reconsidered.
5. Treat MPL / dual-licensed projects as architecture references unless dependency use has been reviewed.
6. Before adding any dependency, report:
   - package
   - reason
   - license
   - architectural impact
7. Never replace Open Industrial Design's domain model with a third-party canvas model.
```

---

# 84. 开源参考的核心结论

Open Industrial Design 应该：

```text
像 Excalidraw 一样容易开始
+
像 tldraw 一样有清晰 Editor 架构
+
像 AFFiNE 一样 Local-first
+
像 Penpot 一样能发展成专业设计平台
+
像 React Flow 一样表达设计关系
+
用 Konva 控制自己的 Canvas
+
用 Three.js 接住工业设计 3D
```

但它最终必须拥有自己独立的：

```text
Design Graph
Design DNA
Multi-view
CMF
AI Action
Industrial Design Workflow
```

这才是项目真正值得开源和长期商业化的部分。

---

# 85. Reference URLs

```text
Konva
https://github.com/konvajs/konva

Excalidraw
https://github.com/excalidraw/excalidraw

React Flow / xyflow
https://github.com/xyflow/xyflow

PixiJS
https://github.com/pixijs/pixijs

AFFiNE
https://github.com/toeverything/AFFiNE

BlockSuite
https://github.com/toeverything/blocksuite

Penpot
https://github.com/penpot/penpot

tldraw
https://github.com/tldraw/tldraw
https://tldraw.dev/community/license

Yjs
https://github.com/yjs/yjs

Three.js
https://github.com/mrdoob/three.js
```

---

**End of open-source reference baseline.**

---

# 86. Reuse-First Architecture v0.2

从 v0.2 起，Open Industrial Design 明确采用：

```text
Reuse infrastructure
+
Own domain
```

Community v0.1 的 UI / editor 技术路线调整为：

```text
Main Workspace Canvas
→ Konva / react-konva

Embedded Sketch Workspace
→ @excalidraw/excalidraw

Design Graph View
→ @xyflow/react

3D Viewer
→ Three.js / React Three Fiber / Drei

Local Database
→ Dexie
```

详细规则见：

```text
docs/reuse-first-architecture.md
```

---

# 87. 主 Canvas 不替换

Excalidraw 不替换主 Canvas。

React Flow 不替换主 Canvas。

原因：

Open Industrial Design 主 Canvas 需要原生支持：

```text
ConceptNode
VariantNode
ViewSetNode
CMFNode
Model3DNode
Generation state
```

因此主 Workspace 仍由 Konva 驱动。

---

# 88. Sketch Editor 正式进入 Community v0.1

双击 SketchNode：

```text
Open Sketch Editor
↓
Embedded Excalidraw
↓
Save source scene
↓
Generate preview
↓
Return to Workspace
```

Open Industrial Design 保存 SketchDocument Adapter，不直接让 SketchNode 持有第三方 runtime instance。

---

# 89. Graph View 正式进入 Community v0.1

Workspace 增加：

```text
Canvas | Graph
```

Graph View 使用 React Flow 显示：

```text
Design lineage
semantic relations
status
ancestor / descendant
```

Domain 仍为唯一真源。

---

# 90. 复用优先决策

以后 Codex 遇到通用基础设施需求时：

```text
先检查现有 permissive dependency
↓
再考虑新增成熟 dependency
↓
最后才自己实现
```

但任何第三方库都必须通过 Adapter 与 Domain 隔离。
