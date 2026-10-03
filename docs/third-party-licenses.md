# Open Industrial Design Third-party Licenses — Planning Background

> 本文件是开发阶段许可审计背景。  
> 不是法律意见。Community Alpha 0.1 的直接运行时 notices 见根目录 `THIRD_PARTY_NOTICES.md`；正式商业发布前仍建议再次进行完整 License Audit。

## 当前安装版本复核

2026-10-01 已完成生产与开发依赖树盘点，具体证据、原文依据和分发缺口见 [发布许可证复核](./release-license-review.md)。生产树共有 274 个包名／300 个版本；最初 42 个版本未附带独立 notice 文本。2026-10-02 已补齐 38 个版本、4 个 Assistant 字体和 pako zlib 文件头，其中 14 个旧 Radix 版本经发布包源码映射的 29 份源码匹配。Web 构建自动携带带警示的许可草稿；剩余 4 个版本、对应源码获取方式及在线资产等仍待确认。khroma 的 Unknown 已通过包内 MIT 原文核对，但扫描标签保持原样。项目自有源码仍是 MPL-2.0，不把脚本检查等同于发布许可通过。

下文保留原始选型背景；当前实际采用情况以安装版本清单与复核记录为准。

---

# 1. Policy

引入 dependency 前记录：

```text
Package
Version
Repository
License
Usage
Risk
Reviewed At
```

---

# 2. Risk Levels

## LOW

常见：

```text
MIT
BSD
Apache-2.0
```

仍需保留必要 copyright / notice。

## REVIEW

例如：

```text
MPL-2.0
LGPL
Dual License
Directory-specific License
```

需要单独确认分发义务。

## HIGH

例如：

```text
Source Available
Commercial Restriction
Production License Required
Unknown License
```

默认不进入 Core。

---

# 3. Planned Runtime Dependencies

## React

Usage:

```text
Frontend UI
```

Status:

```text
Review exact installed version before release
```

Risk:

```text
LOW expected
```

---

## TypeScript

Usage:

```text
Language / build tooling
```

Risk:

```text
LOW expected
```

---

## Vite

Usage:

```text
Web build tooling
```

Risk:

```text
LOW expected
```

---

## Konva

Repository:

```text
https://github.com/konvajs/konva
```

Usage:

```text
Canvas scene graph / interaction
```

License:

```text
MIT
```

Risk:

```text
LOW
```

---

## react-konva

Usage:

```text
React binding for Konva
```

Risk:

```text
LOW expected
```

需要在 lockfile 确认具体版本 license。

---

## Zustand

Usage:

```text
Editor runtime state
```

Risk:

```text
LOW expected
```

---

## Dexie

Usage:

```text
IndexedDB abstraction
```

Risk:

```text
LOW expected
```

---

## Three.js

Repository:

```text
https://github.com/mrdoob/three.js
```

Usage:

```text
3D viewer
```

License:

```text
MIT
```

Risk:

```text
LOW
```

---

## @react-three/fiber

Usage:

```text
React renderer for Three.js
```

Risk:

```text
Review exact installed package license
```

---

## @react-three/drei

Usage:

```text
3D helpers
```

Risk:

```text
Review exact installed package license
```

---

# 4. Future Dependencies

## React Flow / xyflow

Repository:

```text
https://github.com/xyflow/xyflow
```

Potential Usage:

```text
Design Graph View
Workflow View
```

License:

```text
MIT
```

Risk:

```text
LOW
```

Do not install before corresponding milestone.

---

## Yjs

Repository:

```text
https://github.com/yjs/yjs
```

Potential Usage:

```text
CRDT collaboration
```

License:

```text
MIT
```

Risk:

```text
LOW
```

Not in v0.1.

---

## PixiJS

Repository:

```text
https://github.com/pixijs/pixijs
```

Potential Usage:

```text
Future high-performance renderer
```

License:

```text
MIT
```

Risk:

```text
LOW
```

Do not install without benchmark evidence.

---

# 5. Reference-only Projects

## Excalidraw

Repository:

```text
https://github.com/excalidraw/excalidraw
```

Role:

```text
UX / interaction reference
```

Current project policy:

```text
Do not depend on editor runtime by default.
```

---

## AFFiNE

Repository:

```text
https://github.com/toeverything/AFFiNE
```

Role:

```text
Local-first / workspace / commercial architecture reference
```

Risk:

```text
REVIEW
```

Reason:

```text
Repository contains components/directories with differing licensing conditions.
```

Policy:

```text
No source copying without file-level license review.
```

---

## BlockSuite

Repository:

```text
https://github.com/toeverything/blocksuite
```

Role:

```text
Editor architecture / block model / Yjs reference
```

Risk:

```text
REVIEW
```

Policy:

```text
Architecture reference only unless separately audited.
```

---

## Penpot

Repository:

```text
https://github.com/penpot/penpot
```

Role:

```text
Professional design platform / plugin / team architecture reference
```

License:

```text
MPL-2.0
```

Risk:

```text
REVIEW
```

---

## tldraw

Repository:

```text
https://github.com/tldraw/tldraw
```

Role:

```text
Editor API / Shape / Tool / Binding architecture reference
```

Risk:

```text
HIGH for production dependency under current licensing model
```

Project policy:

```text
REFERENCE ONLY
```

Do not add as production dependency unless licensing decision is explicitly revisited.

---

# 6. Dependency Review Template

每次新增依赖，在 PR / task summary 中填写：

```text
Package:
Version:
Repository:
License:
Reason:
Alternative considered:
Runtime or dev-only:
Bundle impact:
Data model impact:
Commercial-use concern:
Decision:
```

---

# 7. Lockfile Audit

正式发布前：

1. 导出完整 dependency tree
2. 扫描 licenses
3. 检查 UNKNOWN
4. 检查 GPL / AGPL / LGPL / MPL
5. 检查 source-available
6. 检查双重许可
7. 生成 THIRD_PARTY_NOTICES

---

# 8. Project License

Status:

```text
DECIDED
```

Community Core:

```text
MPL-2.0
```

See:

```text
docs/licensing-strategy.md
```

Before public release, the root `LICENSE` file must contain the verbatim official MPL-2.0 text from Mozilla.

Project-authored covered source should use the standard MPL notice or SPDX identifier where appropriate.

---

# 9. v0.2 Planned Runtime Additions

## @excalidraw/excalidraw

Repository:

```text
https://github.com/excalidraw/excalidraw
```

Planned Usage:

```text
Embedded Sketch Workspace
```

Planning License Classification:

```text
MIT / LOW
```

Release Rule:

> 安装具体版本后再次检查 npm package metadata、repo LICENSE 与 notices。

Architecture Boundary:

```text
Adapter only.
Excalidraw scene does not replace Open Industrial Design domain.
```

---

## @xyflow/react

Repository:

```text
https://github.com/xyflow/xyflow
```

Planned Usage:

```text
Design Graph View
```

Planning License Classification:

```text
MIT / LOW
```

Release Rule:

> 安装具体版本后再次检查 package license。

Architecture Boundary:

```text
React Flow node/edge are view models, not authoritative domain data.
```

---

# 10. Test-only Dependencies

## jsdom 30.0.1

Repository:

```text
https://github.com/jsdom/jsdom
```

License:

```text
MIT / LOW
```

Usage:

```text
Test-only DOM environment for React interaction tests in apps/web.
Not imported by the production app and not included in its runtime bundle.
```

Reviewed At:

```text
2026-09-29; upstream package.json declares MIT and its LICENSE.txt is MIT.
```
