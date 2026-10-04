# Open Industrial Design v0.1.0-alpha.2

Community Alpha 源码预发布说明。是否已发布请以 GitHub Releases 为准；本文不代表正式版、桌面便携包或编译成品分发已通过验收。

## 本版更新

- 候选图片独立选择、拖动、继续探索和采纳；保留输入与输出连线，设计血缘仍以父设计为准。
- 改善右侧拖线、节点缩放、撤销、分组、小地图、中文搜索、边缘菜单、空画布引导和首页封面。
- 加入用户自行维护的资料库、集合、竞品笔记及手动分析；只使用用户选中的证据，保存不可变分析快照。
- 补充批量探索队列、提示词收藏、蒙版编辑、图案平面贴放、透明背景候选检查和多视角工作流。
- 完善草图历史、本地持久化、工程迁移及导入导出；不把 API Key 写入工程包。

## 升级前备份

先用旧版导出 `.oidproj` 并保留一份未覆盖的备份。当前工程格式为 schema 9，新版支持已实现的旧格式迁移，但旧版应用可能拒绝新版工程。浏览器项目依赖当前浏览器与访问地址，更换端口或浏览器不会自动迁移。

## 核验与限制

本轮本地功能已通过自动测试及隔离浏览器验收；发布前仍须核验最终版本提交和 CI。浏览器生成回归使用模拟请求，不代表所有真实 BYOK 服务商均支持多图、蒙版或透明背景，也不保证造型一致性和制造可行性。详见[工作流验收](./reference-workflow-adaptation.md)。

不包含云协作、AI 3D 生成、专用本地 AI 超分辨率或正式 Windows 便携包。桌面代码仍为原型；运行时许可、签名策略、干净系统和桌面导入导出回归须独立完成。构建大分块警告、真实 GPU 和原生输入设备覆盖仍待优化。

源码 MPL-2.0，贡献采用 DCO 1.1；便携灯具示例来自 Open Industrial Design / truman-t3，AI 辅助制作，按 CC BY 4.0 署名使用。品牌素材适用单独品牌规则。编译成品仍须通过对应源码与声明绑定检查，不能以源码预发布替代该门槛。

## English summary

Source-only Community Alpha update: independent candidates and provenance, improved canvas gestures and menus, user-curated research collections with immutable analysis evidence, manual exploration queues, masking, flat pattern placement and project migrations. Back up projects before upgrading; schema 9 exports may not open in older versions. Mock-provider checks do not certify external model quality. No production desktop bundle, collaboration, AI 3D generation or local AI super-resolution is included. Source MPL-2.0; demo images CC BY 4.0; brand terms are separate.
