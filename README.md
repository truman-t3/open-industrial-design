<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./brand/logo/open-industrial-design-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./brand/logo/open-industrial-design-logo-primary.png">
    <img alt="Open Industrial Design" src="./brand/logo/open-industrial-design-logo-primary.png" width="620">
  </picture>
</p>

# Open Industrial Design v0.1.0-alpha.2

<p align="center">
  <a href="https://github.com/truman-t3/open-industrial-design/releases"><img src="https://img.shields.io/badge/version-0.1.0--alpha.2-2563eb" alt="Version 0.1.0-alpha.2"></a>
  <a href="https://github.com/truman-t3/open-industrial-design/actions/workflows/quality.yml"><img src="https://github.com/truman-t3/open-industrial-design/actions/workflows/quality.yml/badge.svg" alt="CI status"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MPL--2.0-blue" alt="Source license MPL-2.0"></a>
  <a href="./docs/release-status.md"><img src="https://img.shields.io/badge/status-Community_Alpha-orange" alt="Community Alpha"></a>
</p>

<p align="center">从设计意图开始，探索、比较并保留你的产品方案。<br>Explore, compare, and preserve product ideas before CAD.</p>

<p align="center">
  <a href="#中文介绍">简体中文</a> · <a href="#english-overview">English</a> · <a href="#快速开始">快速开始</a> · <a href="#示例流程">示例流程</a> · <a href="./docs/community-alpha-quickstart.md">使用指南</a> · <a href="https://github.com/truman-t3/open-industrial-design/releases">Releases</a>
</p>

> **Community Alpha**：适合体验和反馈，重要项目请先导出备份。AI 使用自己的 API Key，费用由所选服务商收取；本项目不是 CAD，也不保证模型生成质量。

## 中文介绍

**Open Industrial Design** 是面向工业设计师的本地优先、支持自带 API Key（BYOK）的设计探索工作台。它将参考图、草图、概念方案、变体、CMF、设计血缘和轻量 3D 评审组织在同一个项目中，服务于进入 CAD 之前的探索与决策。

当前源码版本：**`0.1.0-alpha.2`**。已发布版本以 [Releases](https://github.com/truman-t3/open-industrial-design/releases) 为准；本轮变更见 [版本说明](./docs/alpha-0.1.0-alpha.2-release.md)。不提供托管服务或正式桌面安装包；仓库目录名中的旧版本后缀不是应用版本。

### 已有能力

- **个人资料库与竞品研究**：用户自行添加图片、链接、笔记和集合；选择资料后手动调用 AI 辅助分析，保留当次证据快照。不自动抓取网站或冒充实时趋势数据库。
- **批量与图像编辑**：本地探索队列、个人提示词、选区蒙版、图案平面贴放和透明背景候选检查；生成质量及服务商能力仍需自行验证。
- **主画布**：导入图片、组织设计节点、拖动连线、撤销重做；新草图和导入的 3D 模块自动避开已有卡片。
- **AI 设计探索**：手动触发生成，支持一张主图和最多四张参考图；候选可独立选择、比较、继续探索，再由设计师决定是否采纳。
- **设计工作流**：草图渲染、造型融合、风格、CMF、视角、场景及局部编辑任务；这些是操作流程，不代表所有模型都支持或保证生成效果。
- **草图与设计图谱**：保存可编辑草图及预览；查看概念方案与变体的设计血缘。
- **3D 评审**：导入 GLB／GLTF，旋转、平移、缩放、切换标准视角，捕捉预览；不是 CAD 建模器。
- **本地项目与备份**：多画板、自动保存、刷新恢复和 `.oidproj` 导入导出；API Key 不进入项目备份。

### 示例流程

以同一款便携灯具为例，从草图探索产品方向，再比较方案与使用场景。以下是内置示例素材，不是本次实时生成结果，也不是工作台界面截图。

| 草图输入                                               | 概念方案                                                    | 使用场景                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------- |
| ![便携灯具草图](./brand/demo/portable-lamp-sketch.png) | ![便携灯具概念方案](./brand/demo/portable-lamp-concept.png) | ![便携灯具场景示例](./brand/demo/portable-lamp-scene.png) |

示例来源：Open Industrial Design / truman-t3，AI 辅助制作；按 [CC BY 4.0 及署名说明](./DEMO_ASSETS_LICENSE.md) 使用。示例效果不构成对任意模型的能力保证。

1. **表达意图**：导入参考图或完成草图，连接生成任务的主图／参考图端口。
2. **探索方向**：选择草图渲染、CMF 或场景等任务，填写要求，确认服务商后手动生成。
3. **比较结果**：独立选择、移动候选，比较差异；可继续探索，不必立即采纳。
4. **保留决策**：采纳为方案、变体或参考图，查看设计血缘，并导出 `.oidproj` 备份。

### 快速开始

已核验环境：Node.js **24.14.0**、pnpm **11.19.0**。

```bash
git clone https://github.com/truman-t3/open-industrial-design.git
cd open-industrial-design
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

打开终端显示的地址，点击“打开示例项目”体验便携灯具探索流程。Windows PowerShell 若阻止 `pnpm` 脚本，请使用 `pnpm.cmd`。

需要 AI 时，在 Provider 设置中配置可信的兼容服务地址、模型及自己的 API Key。只有手动运行才发起生成请求，费用由服务商收取。连接成功不代表该服务支持多图或蒙版编辑。

### 数据与隐私

项目及图片保存在当前浏览器的 IndexedDB 中；更换浏览器、域名或端口不会自动迁移数据。清理浏览器数据前，请导出 `.oidproj`。记住的密钥保存在本地浏览器中，不是系统加密凭据库；使用 AI 时，所选输入会发送给你配置的服务商。

### 核验与当前边界

当前 main 分支本地全量质量检查通过 257 项测试以及格式、lint、类型检查和生产构建（已发布 Alpha 标签为 254 项）。独立 Chromium 已验证示例、节点拖动、草图保存、GLB 导入与截图、工程导出／导入／刷新恢复；软件 WebGL 验证不等于所有真实 GPU、实体键鼠或中文输入法均已验收。GitHub CI 自动运行技术质量与文件预检，不自动发布。

```bash
pnpm run release:check
pnpm run publication:check -- --public
pnpm run notices:check
```

最后一项是独立的成品分发资料检查。普通离线构建默认输出 `dist/licenses` 草稿；发布者可指定已公开的完整提交 SHA，匿名下载并逐文件核验对应源码后生成分发声明，步骤见 [发布状态](./docs/release-status.md)。当前 Release 仅提供源码，不附加编译成品。**源码发布不等于网页成品或安装包已通过分发验收。**

当前不支持 CAD 编辑／导出、STEP／IGES、专用本地 AI 超分辨率、AI 3D 生成、云同步、账号及多人协作。抠图使用兼容服务商生成候选并检查透明通道，不附带本地分割模型。模型效果与大包体积优化另行推进。

源码采用 **MPL-2.0（不是 MIT）**，贡献采用 **DCO 1.1**；品牌和示例图片不自动沿用代码许可证。详见 [发布状态](./docs/release-status.md)、[使用与备份指南](./docs/community-alpha-quickstart.md)、[源码许可](./SOURCE_LICENSE.md) 和 [品牌规则](./TRADEMARKS.md)。

## 参与社区

内置 8 张便携灯具示例图现采用 **CC BY 4.0**，允许注明来源后修改、再分发和商用，详见 [示例图片许可及署名格式](./DEMO_ASSETS_LICENSE.md)。品牌素材不适用此许可，仍遵守原品牌规则。

通过 [Issues](https://github.com/truman-t3/open-industrial-design/issues) 反馈 Bug、提交功能建议或询问使用问题；通过 Pull Request 贡献修复和文档。中文或英文均可，请先阅读 [贡献指南](./CONTRIBUTING.md)。

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

Verified development environment: Node.js 24.14.0 and pnpm 11.19.0. The source version is `0.1.0-alpha.2`; see Releases for published versions. The checkout directory's older version suffix is not the release version.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Open the local URL printed by Vite. Before a release candidate, run:

```bash
pnpm run release:check
```

On Windows PowerShell, use `pnpm.cmd` if script execution blocks `pnpm`. This gate verifies version consistency, the committed minimal GLB fixture, formatting, linting, notice-script regressions, TypeScript, unit tests, and the production build. This prerelease is source-only, with no compiled downloads or hosted deployment. Ordinary offline builds produce a `dist/licenses` draft. Publishers must opt into the exact-commit anonymous source verification described in [release status](./docs/release-status.md) before producing distribution notices. See also the Chinese [usage and backup guide](./docs/community-alpha-quickstart.md) and [release gate](./docs/alpha-0.1-release.md).

## Known Alpha limitations

GitHub runs the same quality gate on `main` pushes, pull requests, and manual requests. The workflow uses read-only repository permissions, fixed Action commits, and no provider keys or deployment steps. It does not run the deliberately pending distribution-approval gate or publish a release. A green workflow is a technical check, not approval to distribute assets.

- AI calls require a user-provided compatible endpoint and API key; no real provider credential is included in this repository.
- Isolated Chromium verification covers Sketch save, GLB review/capture, Canvas movement, and export/import/refresh recovery. Native IME, physical input devices, and real GPU coverage remain separate release requirements.
- Connection success does not prove image editing, multi-image, or mask support. Cancellation does not guarantee that a provider will waive charges. Generated views are not geometrically verified CAD views.
- Local flat pattern placement and provider-backed cutout candidate checks are available; no local AI segmentation or super-resolution model is bundled. AI 3D generation and cloud collaboration are not implemented. Core Canvas acceptance is not full product or public-release acceptance.
- The research library is user-curated: add images, links and notes, then explicitly select evidence for manual AI analysis. It is not an automatic crawler or a live market-trends database.
- Sketch and 3D review are creative/review tools, not CAD authoring systems.
- Large editor dependencies are lazy-loaded, but their dynamic chunks remain a future bundle-optimization target.

## Open source

Project-authored Community source is licensed under [MPL-2.0](./LICENSE); see the [source license notice](./SOURCE_LICENSE.md) for scope and exclusions. Contributions use [DCO 1.1](./DCO.txt); see [CONTRIBUTING.md](./CONTRIBUTING.md). The Open Industrial Design name and brand assets are covered by [TRADEMARKS.md](./TRADEMARKS.md). The [runtime dependency inventory](./THIRD_PARTY_NOTICES.md) and [release license review](./docs/release-license-review.md) distinguish reviewed evidence from notices still required before distribution.
