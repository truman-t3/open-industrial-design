<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./brand/logo/open-industrial-design-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./brand/logo/open-industrial-design-logo-primary.png">
    <img alt="Open Industrial Design" src="./brand/logo/open-industrial-design-logo-primary.png" width="620">
  </picture>
</p>

# Open Industrial Design v0.1.0-alpha.1

## 中文介绍

**Open Industrial Design** 是面向工业设计师的本地优先、支持自带 API Key（BYOK）的设计探索工作台。它将参考图、草图、概念方案、变体、CMF、设计血缘和轻量 3D 评审组织在同一个项目中，服务于进入 CAD 之前的探索与决策。

当前应用版本：**`0.1.0-alpha.1`**。计划发布标签：**`v0.1.0-alpha.1`**。目前仍处于发布准备阶段，尚未发布 GitHub Release；仓库目录名中的旧版本后缀不是应用版本。

### 已有能力

- **主画布**：导入图片、组织设计节点、拖动连线、撤销重做；新草图和导入的 3D 模块自动避开已有卡片。
- **AI 设计探索**：手动触发生成，支持一张主图和最多四张参考图；候选可独立选择、比较、继续探索，再由设计师决定是否采纳。
- **设计工作流**：草图渲染、造型融合、风格、CMF、视角、场景及局部编辑任务；这些是操作流程，不代表所有模型都支持或保证生成效果。
- **草图与设计图谱**：保存可编辑草图及预览；查看概念方案与变体的设计血缘。
- **3D 评审**：导入 GLB／GLTF，旋转、平移、缩放、切换标准视角，捕捉预览；不是 CAD 建模器。
- **本地项目与备份**：多画板、自动保存、刷新恢复和 `.oidproj` 导入导出；API Key 不进入项目备份。

### 快速开始

已核验环境：Node.js **24.14.0**、pnpm **11.19.0**。

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

打开终端显示的地址，点击“打开示例项目”体验便携灯具探索流程。Windows PowerShell 若阻止 `pnpm` 脚本，请使用 `pnpm.cmd`。

需要 AI 时，在 Provider 设置中配置可信的兼容服务地址、模型及自己的 API Key。只有手动运行才发起生成请求，费用由服务商收取。连接成功不代表该服务支持多图或蒙版编辑。

### 数据与隐私

项目及图片保存在当前浏览器的 IndexedDB 中；更换浏览器、域名或端口不会自动迁移数据。清理浏览器数据前，请导出 `.oidproj`。记住的密钥保存在本地浏览器中，不是系统加密凭据库；使用 AI 时，所选输入会发送给你配置的服务商。

### 核验与当前边界

本地全量质量检查通过 252 项测试以及格式、lint、类型检查和生产构建。独立 Chromium 已验证示例、节点拖动、草图保存、GLB 导入与截图、工程导出／导入／刷新恢复；软件 WebGL 验证不等于所有真实 GPU、实体键鼠或中文输入法均已验收。GitHub CI 自动运行技术质量与文件预检，不自动发布。

```bash
pnpm run release:check
pnpm run publication:check -- --public
pnpm run notices:check
```

最后一项是独立的分发资料检查，当前仍会因素材使用范围、运行时资产分发记录和公开源码渠道未收口而阻止发布。**测试通过不等于已经获准正式分发。**

当前不支持 CAD 编辑／导出、STEP／IGES、专用超分辨率／抠图、AI 3D 生成、云同步、账号及多人协作。模型效果与大包体积优化另行推进。

源码采用 **MPL-2.0（不是 MIT）**，贡献采用 **DCO 1.1**；品牌和示例图片不自动沿用代码许可证。详见 [发布状态](./docs/release-status.md)、[使用与备份指南](./docs/community-alpha-quickstart.md)、[源码许可](./SOURCE_LICENSE.md) 和 [品牌规则](./TRADEMARKS.md)。

## 参与社区

通过 [Issues](https://github.com/truman-t3/open-industrial-design/issues) 反馈 Bug、提交功能建议或询问使用问题；通过 Pull Request 贡献修复和文档。中文或英文均可，请先阅读 [贡献指南](./CONTRIBUTING.md)。仓库仍为私有时，仅有访问权限的协作者能使用这些入口。

不要上传 API Key、私人工程或未脱敏日志；安全漏洞请先阅读 [安全反馈说明](./SECURITY.md)，不要在公开 Issue 中披露。当前不承诺固定回复时间，不启用自动回复或额外讨论区。

## English overview

**Open Industrial Design** is an open-source, local-first, model-agnostic industrial design workspace for early product exploration.

It helps designers keep references, sketches, concepts, variants, CMF, design lineage, lightweight 3D review, and portable project backups together before CAD work begins. It is not a CAD modeller, a cloud collaboration service, or an AI-provider account platform.

## Alpha capabilities

- Local Projects with recent-project recovery, multiple Boards, autosave, and `Ctrl/Cmd + S` save flush.
- Industrial-design Canvas cards for Reference, Image, Sketch, Concept, Variant, Multi-view, CMF, and 3D review.
- Manual Canvas generation with one main image and up to four references, persisted input connections, independently selectable candidate cards, comparison, and continued exploration before adoption.
- Editable task briefs for sketch rendering, shape blending, style exploration, form changes, CMF, views, scenes, and local editing; these are workflows, not guarantees of model capability or output quality.
- Design lineage in Graph view; `parentDesignId` remains the source of truth.
- Excalidraw-backed Sketch Workspace, saved as editable scene data plus a static Canvas preview.
- GLB and GLTF review: orbit, pan, zoom, standard views, fit, grid/ground controls, and locally stored captures.
- Portable `.oidproj` export/import with schema validation, migration, binary Asset/Blob packaging, and secret-field rejection.
- Bring-your-own-key (BYOK) OpenAI-compatible Provider settings for text, vision, and image capabilities. Provider keys remain outside Projects and `.oidproj` archives.

## Local-first and privacy

Project records and assets live in this browser's IndexedDB. No login or Open Industrial Design cloud service is required. API keys are stored separately from domain records: they may be session-only or remembered locally in the browser, and are never exported in `.oidproj` files.

Review the local-data implications before clearing browser site storage. Export an `.oidproj` backup before moving browsers or clearing data.

Local data is scoped to the browser and origin (protocol, hostname, and port). Changing from `localhost` to `127.0.0.1`, or changing the preview port, does not transfer projects. Remembered keys are local browser storage, not an encrypted system credential vault. Only configure trusted endpoints: generation sends the selected inputs and request to that provider.

## Supported formats

| Area             | Current Alpha support                  |
| ---------------- | -------------------------------------- |
| Reference        | Browser-supported image files          |
| Sketch           | Excalidraw scene data with PNG preview |
| 3D review        | `.glb`, `.gltf`                        |
| Portable project | `.oidproj`                             |

STEP, IGES, BREP, NURBS editing, CAD export, Blender/Rhino/KeyShot integration, cloud sync, accounts, and collaboration are not implemented in this Alpha.

## Start developing

Verified development environment: Node.js 24.14.0 and pnpm 11.19.0. The application version is `0.1.0-alpha.1`; the checkout directory's older version suffix is not the release version.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Open the local URL printed by Vite. Before a release candidate, run:

```bash
pnpm run release:check
```

On Windows PowerShell, use `pnpm.cmd` if script execution blocks `pnpm`. This gate verifies version consistency, the committed minimal GLB fixture, formatting, linting, notice-script regressions, TypeScript, unit tests, and the production build. Web builds include an explicitly incomplete `dist/licenses` draft. The separate `pnpm run notices:check` distribution-text gate currently fails on unresolved notices and source availability; quality success is not release approval. See the Chinese [usage and backup guide](./docs/community-alpha-quickstart.md), [notice preparation](./licenses/README.md) and [release gate](./docs/alpha-0.1-release.md).

## Known Alpha limitations

GitHub runs the same quality gate on `main` pushes, pull requests, and manual requests. The workflow uses read-only repository permissions, fixed Action commits, and no provider keys or deployment steps. It does not run the deliberately pending distribution-approval gate or publish a release. A green workflow is a technical check, not approval to distribute assets.

- AI calls require a user-provided compatible endpoint and API key; no real provider credential is included in this repository.
- Isolated Chromium verification covers Sketch save, GLB review/capture, Canvas movement, and export/import/refresh recovery. Native IME, physical input devices, and real GPU coverage remain separate release requirements.
- Connection success does not prove image editing, multi-image, or mask support. Cancellation does not guarantee that a provider will waive charges. Generated views are not geometrically verified CAD views.
- Pattern placement, dedicated upscaling/background removal, AI 3D generation, and cloud collaboration are not implemented. Core Canvas acceptance is not full product or public-release acceptance.
- Sketch and 3D review are creative/review tools, not CAD authoring systems.
- Large editor dependencies are lazy-loaded, but their dynamic chunks remain a future bundle-optimization target.

## Open source

Project-authored Community source is licensed under [MPL-2.0](./LICENSE); see the [source license notice](./SOURCE_LICENSE.md) for scope and exclusions. Contributions use [DCO 1.1](./DCO.txt); see [CONTRIBUTING.md](./CONTRIBUTING.md). The Open Industrial Design name and brand assets are covered by [TRADEMARKS.md](./TRADEMARKS.md). The [runtime dependency inventory](./THIRD_PARTY_NOTICES.md) and [release license review](./docs/release-license-review.md) distinguish reviewed evidence from notices still required before distribution.
