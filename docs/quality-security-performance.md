# Open Industrial Design Quality, Security & Performance Specification

---

# 1. Testing Pyramid

## Unit

优先测试：

- migrations
- Design lineage
- Node commands
- provider normalization
- project serialization
- import validation

## Component

- Inspector
- Node render states
- Settings forms

## Integration

- create project → save → reload
- import image
- create variant
- export/import

## E2E

发布前核心闭环。

---

# 2. Required Commands

```text
pnpm lint
pnpm test
pnpm build
pnpm typecheck
```

如果 package scripts 合并，也必须有等价能力。

---

# 3. Security

## Secrets

API Key：

- never commit
- never export
- never log
- never include in telemetry

## File Import

防：

- zip slip
- oversized archive
- unsupported mime
- malformed JSON

## HTML

TextNode 默认 plain text。

不要使用 unsanitized HTML。

---

# 4. Privacy

Community 默认：

```text
No analytics required.
```

如果未来加入 telemetry：

- 必须 opt-in 或明确说明
- 不能上传设计文件
- 不能上传 prompt / API key

v0.1 最简单：

```text
不做 telemetry
```

---

# 5. Performance Budget

建议：

## App shell

避免无意义巨型 bundle。

## Canvas

目标：

- 100 nodes usable
- 50 image nodes usable
- pan/zoom stable
- drag stable

## Image

- thumbnail
- lazy decode
- revoke object URLs

## DB

- batch writes
- debounce
- transaction

---

# 6. Memory

必须释放：

- object URLs
- Three.js geometries
- materials
- textures
- event listeners

---

# 7. Error Boundary

至少：

- App-level Error Boundary
- 3D Viewer Error Boundary
- AI Action Error state

---

# 8. Accessibility

至少：

- semantic buttons
- aria-label
- focus visible
- keyboard major actions
- no color-only status

---

# 9. Browser Support

v0.1 建议：

```text
Latest Chrome
Latest Edge
Latest Firefox
Latest Safari
```

但如果某 API 有差异，至少 Chrome / Edge 必须作为主测试环境。

---

# 10. Offline

在无网络下：

必须仍可：

- open app shell（若 PWA/cache 实现）
- open local project
- edit
- save
- import local assets
- export

AI 操作提示：

```text
Network required for this provider.
```

PWA offline shell 可作为 P1，如果首版部署模式不支持，也不能影响 local-first data design。

---

# 11. Release-blocking Bugs

以下属于 blocker：

- project loss
- export cannot reimport
- API key leak
- lineage corruption
- asset deletion corruption
- basic undo destroys state
- 3D import crashes app
- provider failure crashes app
