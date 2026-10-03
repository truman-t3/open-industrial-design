# Open Industrial Design Desktop Distribution Specification v0.3

> Desktop 是 Open Industrial Design 面向工业设计师的主要长期发行形态。
> Web 是 Core 的运行环境之一，不是唯一终态。

---

# 1. Desktop Strategy

采用：

```text
Web Core
+
Tauri 2 Desktop Shell
```

共享：

- React UI
- Design Domain
- Canvas
- Graph
- Sketch
- AI Provider Layer
- 3D Viewer

桌面层只增加：

- native file access
- native dialogs
- credential storage
- portable mode
- local integrations
- updater（后期）

---

# 2. Target Platforms

## Windows

正式目标：

```text
Open Industrial Design Setup.exe
Open Industrial Design Portable.zip
```

后期：

```text
MSI
```

## macOS

正式目标：

```text
Open Industrial Design.dmg
Open Industrial Design.app
```

优先：

```text
Universal Binary
```

覆盖 Apple Silicon + Intel（若构建链允许）。

## Linux

非 Community v0.1 阻塞项。

未来可评估：

```text
AppImage
.deb
```

---

# 3. Portable Mode

Windows Portable：

```text
Open Industrial Design-Portable/
├── Open Industrial Design.exe
└── Open Industrial DesignData/
    ├── Projects/
    ├── Assets/
    ├── Cache/
    └── Settings/
```

要求：

- 不依赖安装
- 可从可写目录运行
- 数据可跟随整个文件夹迁移
- 不依赖注册表保存核心数据
- 删除整个目录即可移除应用数据

---

# 4. Local Mode

普通安装模式：

数据保存在：

```text
system application data directory
```

用户不需要理解具体路径。

---

# 5. Storage Mode Selection

首次 Desktop 启动：

```text
Choose storage mode

○ This Computer
  Recommended

○ Portable
  Keep app data with Open Industrial Design
```

可以提供：

```text
Don't ask again
```

已选择后不要每次启动询问。

---

# 6. Web Edition

Web 版仍保留：

- browser IndexedDB
- `.oidproj`
- BYOK
- core editor

但 Desktop 可以提供更完整：

- local file system
- large asset workflow
- native credential storage
- local integration

---

# 7. Desktop File Workflow

桌面端未来支持：

```text
Open .oidproj
Save .oidproj
Import asset
Reveal in Folder
Open containing folder
```

v0.1 Web Core 不依赖这些 native API。

---

# 8. Native Bridge Rule

Core 禁止直接调用 Tauri API。

必须：

```text
Core
↓
Platform Service Interface
↓
Web Adapter / Tauri Adapter
```

例如：

```ts
interface PlatformFileService {
  openProjectFile(): Promise<...>;
  saveProjectFile(...): Promise<...>;
}
```

这样 Web / Desktop 共用上层逻辑。

---

# 9. Credential Storage

Desktop Local Mode：

优先：

```text
OS credential store
```

Web：

```text
Session
or
local browser storage with warning
```

Portable：

默认：

```text
Session-only
```

---

# 10. Local Integrations

Desktop 后期价值：

```text
ComfyUI
Ollama
local model
Rhino
Blender
KeyShot
filesystem watch
```

这些属于 Desktop Enhancement，不进入 Community Web Core 的前置依赖。

---

# 11. Tauri Timing

不要在 Foundation 阶段立即引入 Tauri。

推荐：

```text
Community Web Core stable
↓
Desktop Shell Phase
```

最低前提：

- Canvas stable
- Local project format stable
- Storage abstraction stable
- Provider abstraction stable

---

# 12. Distribution Security

Windows 后期：

- code signing
- installer reputation

macOS 正式公开发行：

- signing
- notarization

发布前文档必须有：

```text
unsigned development build
vs
signed public build
```

的区分。

---

# 13. Desktop Release Acceptance

Windows：

- setup build
- portable build
- local mode
- portable mode
- project import/export
- BYOK
- 3D
- restart recovery

macOS：

- DMG
- app launches
- project import/export
- BYOK
- 3D
- restart recovery

---

# 14. Product Position

长期：

```text
Web → easiest trial / access
Desktop → primary professional workflow
```

这更符合工业设计师的大文件、本地工具和隐私需求。
