# v0.1.0-beta.2 — 工作台体验更新 / Workspace experience update

## 中文

- 首页适配较矮窗口，压缩过大的标题与留白，不隐藏项目内容。
- 示例入口复用已有示例；首页保留一个主入口，旧副本折叠保留，避免丢失用户修改。
- 画布支持鼠标中键与空格加拖动，新增专注画布模式、图片续作快捷入口与折叠工具栏。
- 顶部统一品牌入口，移除侧栏重复 Logo；图片卡、收藏资料与候选对比更突出内容。
- 候选按生成批次收纳，最新批次默认展开；对比窗口可单独下载图片，项目菜单仍负责完整 `.oidproj` 备份。
- 首页及项目菜单提供“关于与更新”，显示当前版本，并在用户点击后查询 GitHub 公开发行信息。不会自动下载、安装或上传工程/API 配置。
- 修复 Windows 桌面图标内容占比偏小；README 明确 API Key 由用户自己提供。

本版不改变工程格式或模型能力。不含协同、AI 3D 或暂缓的超分辨率。安装包仍未代码签名；升级前请导出重要工程，便携版保留原数据文件夹。

## English

- Compact home layout fits shorter windows without hiding project content.
- Opening the demo reuses an existing project. Previous copies remain available in a collapsed section to preserve edits.
- Middle-button and Space-drag panning, canvas focus mode, image continuation shortcuts and a compact toolbar.
- One workspace brand anchor, image-first cards and refined reference/candidate presentation.
- Candidate batches are grouped with the latest expanded. Download individual images from comparison; use the project menu for complete `.oidproj` backups.
- About & updates shows the current version and checks public GitHub release metadata only on request. No automatic download/install or project/API-setting upload.
- Improved Windows icon fill; README explicitly states users must provide their own API keys.

No project-format or model-capability changes. Collaboration, AI 3D and deferred super-resolution are outside this release. Windows packages remain unsigned. Back up important projects before upgrading and preserve the portable data folder.

## Verification status

Release candidate: final quality checks, Windows build and native acceptance must pass before publication. This document alone is not release approval.
