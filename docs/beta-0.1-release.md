# Open Industrial Design v0.1.0-beta.1 公测版

Windows x64 Beta 公测版，不是稳定正式版。发布状态和下载文件以 GitHub Releases 为准。

## 下载与使用

- `blueprint-setup.exe`：带蓝图视觉的安装向导，需要 Microsoft WebView2。
- `standard-setup.exe`：标准安装向导，可下载 WebView2；该步骤需要网络。
- `portable-x64.zip`：解压到可写独立文件夹，运行其中的 EXE；保留旁边的 `Open Industrial Design Data` 数据目录。便携版仍需要 WebView2。
- `SHA256SUMS.txt`：核对两个安装器、便携 ZIP 和随包许可资料。哈希不是代码签名；不要绕过系统安全拦截。

程序、安装器和系统应用列表使用版本 `0.1.0-beta.1`；工作台首页显示版本。安装版数据保存在用户应用数据目录，不会因把程序安装到其他磁盘而自动搬迁。卸载始终保留工程与设置；卸载页的删除数据选项不生效。

## 功能和升级

包含节点式设计探索、独立候选评审、输入输出连线、用户维护的资料库、批量任务、草图、CMF、多视角及 GLB 评审。AI 手动触发，使用用户自己的服务商和 API Key，费用由服务商收取。

升级前请从旧版导出并单独保留 `.oidproj`。当前工程格式为 schema 9；支持已实现的旧格式迁移，旧版应用可能无法读取新导出的工程。浏览器、便携版和安装版的本地数据互不自动迁移，请通过工程文件转移。

## 核验边界

安装器前一候选已完成本机蓝图安装、文件校验、启动和示例画布检查，Windows CI 覆盖安装、同版本重装及卸载后合成数据保留。最终 Beta 必须通过对应提交的构建和分发资料检查后才上传。生成回归主要使用模拟请求，不保证所有真实 Provider 的兼容性或图像品质。

当前包未签名；缺少 WebView2 的干净机器、跨版本安装迁移及全部 GPU 环境未完成实测。尚无原生工程对话框、系统凭据库、自动更新、云协作、AI 3D 生成或本地 AI 超分辨率。重要项目须自行备份。

源码 MPL-2.0，贡献采用 DCO 1.1。灯具示例来自 Open Industrial Design / truman-t3，AI 辅助制作，按 CC BY 4.0 署名使用；品牌素材使用单独品牌规则。随包包含原生依赖声明和对应源码链接。

## English

Windows x64 public Beta, not a stable release. Download status and assets are authoritative on GitHub Releases.

- Use `blueprint-setup.exe` for the blueprint installer; WebView2 is required.
- Use `standard-setup.exe` for standard installation and online WebView2 setup.
- Extract `portable-x64.zip` into a dedicated writable folder and run the EXE. Keep the adjacent `Open Industrial Design Data` folder when updating. WebView2 is still required.
- Check `SHA256SUMS.txt`. Checksums are not a code signature; do not bypass OS security blocks.

Version `0.1.0-beta.1` is shown on the home screen, installer and Windows app listing. Installed data stays in the user application-data directory, independently of the program's installation drive. Uninstall retains projects and settings; its delete-data checkbox has no effect.

Includes node-based exploration, independent candidate review, provenance connections, user-curated research, batch tasks, sketches, CMF, multi-view and GLB review. AI requests are manual and use your provider/key; provider charges apply.

Export a separate `.oidproj` backup before upgrading. Schema 9 supports implemented older-format migrations, but old apps may reject new exports. Browser, portable and installed profiles do not migrate automatically; transfer projects using exports.

The preceding installer candidate passed local blueprint installation, file verification, launch and demo checks. Windows CI covers installation, same-version reinstall and synthetic-data preservation after uninstall. Final Beta assets require matching-commit build and distribution checks before upload. Mocked generation regressions do not certify every real provider or model.

Unsigned build. Missing-WebView2 clean machines, cross-version installation migration and all GPU configurations are not fully tested. Native project dialogs, OS credential storage, automatic updates, collaboration, AI 3D generation and local AI super-resolution are not included. Keep backups.

Source: MPL-2.0; contributions: DCO 1.1. Lamp examples: Open Industrial Design / truman-t3, AI-assisted, CC BY 4.0. Separate brand terms apply. Native notices and corresponding-source links are included.
