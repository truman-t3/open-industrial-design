# v0.1.0-beta.3 — 界面精修 / Workspace visual refinement

## 中文

- 统一中文字体后备、字号、圆角、面板间距与浅色画布层级。
- “更多工具”改为浮层，支持 Esc 和点击外部关闭，不再横向挤占画布。
- 项目卡片操作独立排列，改善较矮窗口适配。
- 工作流连线使用低饱和蓝色，设计血缘保持虚线区分。
- 复用既有品牌及示例图片，不修改工程格式、模型能力或 API 配置。

升级前建议导出重要工程；便携版请保留原数据文件夹。本版沿用未签名 Windows x64 蓝图安装器、标准安装器与便携 ZIP。无自动安装更新、协同、AI 3D 或超分辨率新增功能。

## English

- Consistent Chinese font fallbacks, typography, corner radii, panel spacing and light canvas hierarchy.
- More tools opens in a popover with Escape and outside-click dismissal, without stretching the toolbar.
- Separate project-card actions and improved short-window layout.
- Soft blue workflow connections remain distinct from dashed design-lineage links.
- Existing brand and demo images are reused. No project-format, model-capability or API-setting changes.

Back up important projects before upgrading; preserve the portable data folder. This release retains unsigned Windows x64 blueprint/standard installers and the portable ZIP. It does not add automatic update installation, collaboration, AI 3D or super-resolution.

## Verification / 核验

The web quality suite and isolated browser checks passed for layout, tool dismissal, panning, synthetic generation, image download, reference saving and project export. Native build and upgrade acceptance are release gates; publication is conditional on passing them. No paid model requests were used for these regression checks.

Web 完整质量检查与隔离浏览器回归通过，覆盖布局、浮层关闭、平移、模拟生成、图片下载、资料保存和工程导出。原生构建与升级验收作为发布门槛，通过后才发布。本轮回归未调用付费模型。
