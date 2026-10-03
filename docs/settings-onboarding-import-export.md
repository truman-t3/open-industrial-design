# Open Industrial Design Settings, Onboarding, Import & Export

---

# 1. Settings

## General

- Theme
- Language
- Unit
- Canvas background

## AI Providers

- list
- add
- edit
- remove
- test
- select default

## Storage

- approximate local usage
- clear temporary cache
- export current project
- import project

## Shortcuts

- display shortcuts
- v0.1 不要求自定义绑定

## About

- version
- project license
- source repository
- third-party notices

---

# 2. Onboarding

首次进入：

推荐：

```text
Step 1: Local-first
Step 2: Add references
Step 3: Create concept and variants
Step 4: BYOK is optional
Step 5: Export backups
```

必须可以 Skip。

---

# 3. Demo Project

Community v0.1 必须内置 demo。

Demo 最少包含：

- 3 references
- 1 concept
- 2 variants
- 1 ViewSet
- 3 CMF variants
- 1 3D placeholder or model if license-safe

目的：

用户立即理解完整工作流。

---

# 4. Import File

Home：

```text
Import .oidproj
```

Project 内：

```text
Import asset
```

两者不要混淆。

---

# 5. Export

至少：

```text
Export Project (.oidproj)
```

建议：

```text
Export Selected Node as PNG
Export Board Snapshot as PNG
```

PDF 可后置。

---

# 6. Dangerous Actions

需要确认：

- Delete project
- Delete provider config
- Clear local data

不需要确认：

- Delete regular Canvas node，可 Undo

---

# 7. Version

About 显示：

```text
Open Industrial Design Community v0.1.0
```

开发版：

```text
0.1.0-dev
```

---

# 8. Desktop Storage Mode

Desktop Settings 增加：

```text
Storage Mode
This Computer / Portable
```

切换模式不是简单 toggle。

如果未来支持迁移：

必须：

```text
preview migration
confirm
copy
verify
switch
```

v0.2 可以只在首次启动选择，不要求在线切换。

---

# 9. Language

首发：

```text
中文
English
Follow System
```

UI 文案不要散落硬编码。

---

# 10. Backup Reminder

Storage 页面显示：

```text
Last project backup export
```

如果项目长期未导出备份：

只做轻提示，不做阻断。
