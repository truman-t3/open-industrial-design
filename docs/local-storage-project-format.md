# Open Industrial Design Local Storage & Project Format Specification

---

# 1. 原则

Community Edition 数据默认完全本地。

---

# 2. IndexedDB Tables

建议：

```text
projects
boards
nodes
edges
designs
assets
assetBlobs
viewSets
cmfSets
cmfVariants
generations
decisions
settings
providerConfigs
```

实际可根据 Dexie schema 合并，但 domain 语义不要丢失。

---

# 3. Asset Blob

Blob 与 Asset metadata 分离。

```text
assets
→ metadata

assetBlobs
→ Blob
```

---

# 4. Autosave

建议：

```text
user action
↓
domain update
↓
dirty flag
↓
debounce
↓
repository transaction
```

显示状态：

```text
Saved
Saving...
Save failed
```

---

# 5. Quota

处理：

- IndexedDB quota exceeded
- large file rejection
- browser storage eviction risk

UI 应建议：

```text
Export project backup.
```

---

# 6. Thumbnail

Image import：

```text
Original Blob
↓
metadata
↓
generate preview
↓
thumbnail Asset
```

避免 Canvas 直接加载 8K 原图。

---

# 7. .oidproj Container

本质：

```text
ZIP
```

建议：

```text
manifest.json
project.json
data/
  boards.json
  nodes.json
  edges.json
  designs.json
  viewsets.json
  cmf.json
  generations.json
assets/
  originals/
  thumbnails/
```

v0.1 也可以数据合并，只要 manifest 稳定。

---

# 8. manifest.json

```json
{
  "format": "open-industrial-design",
  "formatVersion": 1,
  "projectId": "...",
  "projectName": "...",
  "createdAt": 0,
  "exportedAt": 0
}
```

---

# 9. 不得导出

```text
API keys
session secrets
local absolute paths
browser internal handles
temporary cache
```

---

# 10. Import Validation

必须检查：

- zip valid
- manifest exists
- format correct
- supported version
- JSON parse
- asset references
- malicious path traversal
- unexpected file size

---

# 11. Import Strategy

默认：

```text
Import as new local project
```

生成新的 local project ID 是否必要：

推荐保留原 projectId + conflict remap。

若冲突：

```text
Create copy with new IDs
```

必须保持内部 references 一致。

---

# 12. Backup

v0.1 没有 Cloud。

因此首页和 Settings 应明显提供：

```text
Export Backup
```

---

# 13. Delete Project

需要 confirmation。

删除：

- domain
- nodes
- asset blobs
- thumbnails

必须在 transaction 或安全步骤中完成。

---

# 14. Migration

打开 Project：

```text
read schemaVersion
↓
migrate sequentially
↓
save upgraded version
```

导入旧 `.oidproj` 同理。

---

# 15. Acceptance

- autosave
- refresh restores
- export
- delete local copy
- import
- identical design relationships restored
- no API key inside zip
