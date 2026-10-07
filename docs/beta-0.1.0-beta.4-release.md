# v0.1.0-beta.4 — Windows 图标适配 / Windows icon refinement

## 中文

- 保留原 Logo 的造型、颜色和比例，减少 Windows 图标内部留白。
- 32px 图标主体由 25×27 增至 28×30 像素；48px 由 38×41 增至 43×46 像素。16px 保留安全边缘，不裁切图形。
- 补齐 20、40、96px 尺寸，共提供 10 档图标尺寸，改善不同系统缩放下的图标选择。
- 增加可复现的图标构建及边缘、占比检查，并纳入 Windows 构建流程。

本版不改变工程格式、API 配置或工作台功能。Windows 任务栏最终显示大小仍受系统设置影响；升级后已固定的图标可能需要重新固定才能刷新缓存。安装包仍未代码签名。升级前建议备份重要工程，便携版保留数据文件夹。

## English

- Reduced transparent padding in Windows icons while preserving the original logo's shape, colors and proportions.
- Visible artwork grows from 25×27 to 28×30 pixels in the 32px icon, and from 38×41 to 43×46 in the 48px icon. The 16px icon retains safe edges without cropping.
- Added 20, 40 and 96px frames, for 10 sizes covering more Windows scaling choices.
- Added reproducible icon generation plus framing and edge checks to Windows CI.

No project-format, API-setting or workspace-functionality changes. Final taskbar size still depends on Windows settings; an existing pinned shortcut may need re-pinning to refresh its cache. Windows packages remain unsigned. Back up important projects before upgrading and preserve the portable data folder.

## Verification / 核验

Publication requires passing the complete quality suite, Windows build, packaged-icon checks and native upgrade/data-preservation acceptance. This source note describes the release scope, not an independent security audit.

完整质量检查、Windows 构建、安装包图标及原生升级／数据保留验收通过后才发布。本说明描述发行范围，不代表完整安全审计。
