# Open Industrial Design 3D Viewer Specification

---

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
@react-three/drei
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
