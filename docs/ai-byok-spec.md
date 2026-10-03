# Open Industrial Design AI / BYOK Specification

---

# 1. 目标

让用户可以自由选择 AI Provider，而 Open Industrial Design Core 不绑定任何模型。

---

# 2. Architecture

```text
UI
↓
App Action
↓
AI Action
↓
Capability Router
↓
Provider Registry
↓
Provider Adapter
↓
Remote / Local API
```

---

# 3. Capability

v0.1：

```ts
type AICapability =
  'text.generate' | 'vision.analyze' | 'image.generate' | 'image.edit' | 'image.variation';
```

Provider 声明支持哪些能力。

UI 根据 capability 决定按钮是否可用。

---

# 4. Provider Config

```ts
interface ProviderConfig {
  id: string;
  type: string;
  name: string;

  baseUrl?: string;
  apiKey?: string;
  model?: string;

  rememberKey: boolean;
}
```

实际 secrets storage 与 serializable config 可分开。

---

# 5. Custom OpenAI-compatible

必须：

字段：

- Name
- Base URL
- API Key
- Model ID

必须提供：

- Save
- Test Connection
- Delete

注意：

不同“OpenAI-compatible”服务对 image API 兼容程度不同。

因此 v0.1 可先让 Custom Provider 覆盖：

```text
text / vision
```

图像能力通过 capability detection / manual config 扩展。

---

# 6. Official Adapter

至少实现一个经过验证的 Provider Adapter。

具体 Provider 不应写死到 Canvas。

---

# 7. API Key

不得：

- commit
- export in .oidproj
- log
- send to Open Industrial Design server

支持：

### Session-only

内存存储。

### Remember locally

本地持久化。

Web 端无法保证与 OS keychain 同等级别安全，因此 UI 必须明确说明。

---

# 8. Test Connection

必须：

- timeout
- invalid key message
- unsupported model message
- generic network error

不要只显示：

```text
Error 400
```

---

# 9. AI Action: Analyze Design

输入：

- selected Asset or Design
- optional notes

输出：

- analysis text
- optional structured sections

不自动修改 Design。

可以存：

```text
annotation / generation record
```

---

# 10. AI Action: Generate Variant

输入：

- source Design
- source assets
- prompt
- DNA
- provider
- model
- parameters

输出流程：

```text
create Generation(pending)
↓
call provider
↓
create output Asset
↓
create new Design(kind=variant)
↓
parentDesignId = source
↓
create VariantNode
↓
create Edge
↓
Generation(success)
```

失败：

```text
Generation(failed)
```

源数据不变。

---

# 11. AI Action: Render Sketch

类似 Generate Variant。

默认输出新 Variant，而不是修改 Sketch。

---

# 12. Design DNA → Prompt Constraints

v0.1 可以采用规则化 prompt augmentation：

```text
silhouetteLocked
→ Preserve the overall silhouette.

proportionLocked
→ Preserve the product proportions.

geometryLocked
→ Do not alter the primary geometry.

cmfLocked
→ Preserve existing CMF.
```

必须让用户看到最终 constraint summary。

不要求显示内部完整 system prompt。

---

# 13. Provider Errors

标准化：

```ts
type ProviderErrorCode =
  | 'unauthorized'
  | 'rate_limit'
  | 'timeout'
  | 'unsupported'
  | 'network'
  | 'invalid_response'
  | 'unknown';
```

UI 不直接处理每个 SDK 的错误对象。

---

# 14. CORS

Web 端可能受 CORS 限制。

v0.1：

- 支持可直接浏览器调用的 Provider
- 对不支持的 Provider 给清晰错误
- 架构预留 Local Proxy
- Local Proxy 不作为 v0.1 release blocker

---

# 15. Privacy Disclosure

执行 AI Action 前应能明确：

```text
This action sends the selected content to [Provider].
```

不上传整个 Project。

---

# 16. Cancellation

如果 Provider 支持 AbortController：

支持 cancel。

不支持时：

UI 可以停止等待，但不能承诺 remote job 已取消。

---

# 17. Cost Safety

BYOK 模式：

Open Industrial Design 不估计真实账单。

可以显示：

- provider
- model
- requested size
- number of outputs

不要显示不可靠的“预计费用”。

---

# 18. v0.1 Acceptance

- add provider
- test provider
- session-only key works
- local remembered key works
- key not exported
- analyze works
- variant generation preserves lineage
- failed generation is recoverable

---

# 19. Candidate Tray

当 AI Action 返回多个候选：

默认先创建：

```text
Generation outputs
```

但不立即全部写入正式 Design lineage。

UI：

```text
Candidate Tray
```

用户选择：

```text
Keep
```

后才：

```text
create Asset
create Design Variant
create VariantNode
create lineage
```

Discard：

可删除未引用 Asset。

---

# 20. Single-result AI

如果 Action 天然只有一个输出：

允许直接创建 Pending Variant / Result。

但必须保留：

```text
source
generation
output
```
