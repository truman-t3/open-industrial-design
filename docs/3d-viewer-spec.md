# Open Industrial Design 3D Viewer Specification

---

## 当前实现（2026-10-13）

- **导入**：文件选择和三维工作区拖放接受一个 GLB／GLTF 及配套 BIN、图片；按相对路径优先、唯一文件名后备匹配。缺失／同名冲突会指出资源名，远程 URI 不自动下载。资源打包为自包含模型，在本地解析成功后才原子写入 Asset、Blob、Node 和画板索引。所选文件总量和打包结果均限制为 150 MB，损坏模型或贴图失败不产生工程记录。
- **取景**：首次打开无相机记录的模型，根据包围球、视口宽高和 FOV 自动取景；近远裁剪面随模型尺度和观察距离调整。网格、地面和灯光随模型位置及尺寸定位。已有相机记录优先恢复。
- **视角**：透视／正交切换保留观察方向、目标和画面尺度，不重建 WebGL renderer。提供前、后、左、右、顶、底及透视预设。新预设通过已有坐标字段保存，旧 `side` 枚举兼容右视，不升级 schema。
- **渲染**：使用 Fiber demand 帧循环，操作／阻尼／显示选项变化触发绘制；静止不持续绘制。显示线框、网格、地面、浅／深背景以及网格数、三角面数和模型单位尺寸。
- **截图**：长边选择 1024 或 2048 px，保持视口比例并遵守 GPU 最大纹理尺寸；独立 render target 输出 PNG，常规画布不启用 `preserveDrawingBuffer`。捕捉开始时固定相机快照，切换投影或父组件重绘不会重放请求，退出模型后不提交迟到结果。
- **设计工作流**：模型可关联本工程已有 Design。截图同时保存模型预览和独立 ImageNode，图片卡继承该 Design 关联，保留来源模型和拍摄相机元数据。没有新建 Design 或推断设计血缘。预览、图片、Blob 与画板索引处于同一存储事务；迟到的相机保存仅更新相机字段。
- **兼容性**：沿用工程 schema 9／现有 Dexie 表，不新增依赖。没有模型单位到毫米的隐式转换，也不提供 CAD 编辑。GLTFLoader 尚不支持的扩展或压缩纹理仍需转为兼容格式后导入。

# 1. Scope

3D 是：

```text
View / Review / Capture
```

不是：

```text
Modeling / CAD
```

---

# 2. Stack

```text
three
@react-three/fiber
Three.js official OrbitControls
```

---

# 3. Formats

P0：

```text
GLB
GLTF
```

P1：

```text
OBJ
STL
```

不在 v0.1：

```text
STEP
IGES
BREP
```

---

# 4. Import

Drag/drop 或 file picker。

流程：

```text
file
↓
validate format
↓
Asset
↓
Model3DNode
↓
thumbnail generation if possible
```

---

# 5. Viewer Controls

必须：

- Orbit
- Zoom
- Reset
- Perspective
- Orthographic
- Front
- Side
- Top

建议：

- Wireframe toggle
- Grid toggle

---

# 6. Camera State

保存：

```text
mode
position
target
zoom
```

重新打开项目恢复。

---

# 7. Canvas Performance

不要默认让大量 3D Node 同时 live render。

推荐：

```text
Inactive → thumbnail
Active / selected → live viewer
```

如实现简单 live view 也必须 benchmark。

---

# 8. Screenshot

Action：

```text
Capture View
```

生成：

- image Asset
- optional ImageNode
- 可以关联同一 Design

---

# 9. Background

Viewer：

- neutral light
- neutral dark

不需要环境编辑器。

---

# 10. Failure

处理：

- corrupt model
- unsupported extension
- missing buffer
- texture failure
- oversized model

App 不崩溃。

---

# 11. Acceptance

- GLB import
- orbit
- presets
- save camera
- reopen restore
- capture screenshot
- delete Node does not necessarily delete Asset
