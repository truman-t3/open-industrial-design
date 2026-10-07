# 三分钟上手与备份 / Three-minute start and backup

适用于 Community Beta；当前公开安装包为 `0.1.0-beta.4`。文件名因旧链接兼容保留，不代表仍为 Alpha。下载与版本以 [官方 Releases](https://github.com/truman-t3/open-industrial-design/releases/latest) 为准。

## 三分钟体验：先不用 API Key

安装与下载耗时不计入三分钟；不要使用重要工程做首次测试。

1. **准备**：Windows x64 用户下载 `blueprint-setup.exe` 安装版，或完整解压 `portable-x64.zip` 再运行其中的 EXE，不能只复制 EXE。软件尚未代码签名；遇到系统警告先核对官方来源和 SHA256SUMS，不关闭系统安全防护。
2. **0:00–1:00，看懂流程**：点击“打开示例项目”，沿参考／草图 → 任务 → 概念方案 → CMF、细节、场景分支查看。示例图片是预置 AI 辅助素材，不是刚刚生成。
3. **1:00–2:00，动手整理**：单击一张图片并拖动；按住空格拖动画布，或用中键平移。用“查看全部”回到全景。无需配置 AI 即可完成这些操作。
4. **2:00–3:00，保留成果**：按 `Ctrl+S`，确认“已保存”；从项目菜单导出 `.oidproj`，确认文件落盘。退出并重新打开软件，检查最近项目仍在。下载单张图片不能代替工程备份。

需要 AI 时再配置可信服务商、支持相应能力的模型和自己的 API Key。软件不附送 Key 或共享额度，调用可能收费；不要为体验示例盲目配置或反复生成。

反馈时请提供应用版本、Windows 版本、显示缩放比例、复现步骤、预期与实际结果，以及脱敏截图。使用 [Issues](https://github.com/truman-t3/open-industrial-design/issues) 的现有模板；不上传密钥或私人工程，漏洞走 [安全反馈](../SECURITY.md)。

## Three-minute start: no API key required

Download and installation time are excluded. Do not use important projects for your first test.

1. **Prepare:** download the Windows x64 `blueprint-setup.exe`, or fully extract `portable-x64.zip` and run its EXE. Do not copy the EXE alone. Packages are unsigned: verify the official source and SHA256SUMS if Windows warns; do not disable security protections.
2. **0:00–1:00, understand the flow:** choose “Open demo project” and follow references/sketches → tasks → concept → CMF, detail and scene branches. Images are preloaded AI-assisted examples, not a live generation.
3. **1:00–2:00, organize:** select and drag an image. Hold Space and drag, or use the middle mouse button, to pan. Use the fit-all control to restore the overview. None of this requires AI setup.
4. **2:00–3:00, preserve:** press `Ctrl+S`, check the saved state, export `.oidproj` from the project menu and confirm the file exists. Restart and reopen the recent project. An individual image download is not a project backup.

Configure a trusted provider, capable model and your own key only when you need AI. No keys or credits are included; providers may charge for requests. Keep portable data with the app, and export important projects before moving or upgrading it. Browser and desktop data do not automatically migrate between environments.

Report app/Windows versions, display scaling, reproduction steps, expected/actual behavior and redacted screenshots using [Issues](https://github.com/truman-t3/open-industrial-design/issues). Never post keys or private projects; see [Security](../SECURITY.md) for vulnerabilities. The detailed Chinese reference below covers browser development, AI and backup behavior.

## 源码浏览器版：启动与打开

打开下载或克隆后的仓库根目录（包含 `package.json`）。目录名不代表当前应用版本。已核验环境为 Node.js 24.14.0、pnpm 11.19.0。

首次安装与开发启动，在仓库目录执行：

```powershell
pnpm.cmd install --frozen-lockfile --ignore-scripts
pnpm.cmd dev
```

打开终端打印的地址。当前预览使用 `http://127.0.0.1:5174/`；已有服务运行时不要重复启动。终端服务退出或电脑休眠可能导致预览不可访问，不等于工程被删除。

工程保存在当前浏览器、当前网站地址的 IndexedDB 中。换浏览器、端口，或把 `127.0.0.1` 换成 `localhost`，不会自动迁移工程。恢复时先确认打开的是原地址。

## 从素材到设计探索

1. 打开现有工程，或在首页创建工程和画板。示例是本地演示素材，不代表刚刚进行了真实模型调用。
2. 导入参考图片，或在草图工作区绘制并保存；画布使用草图的静态预览参与生成。
3. 从图片或候选选择继续探索，选择任务；确认生成节点的主图和补充参考连线。一次最多一张主图、四张补充参考图。
4. 编辑设计方向、说明、数量和模型连接。改变输入只使已有结果成为旧输入结果，不会自动付费生成。
5. 检查所选服务和数量后手动点击生成。错误时检查服务配置，不要连续盲目重试。
6. 候选可以单独选中、移动、比较和继续探索。候选暂存并不等于已经采纳为正式设计。
7. 保留需要的结果：采纳为概念方案、设计变体或参考图。有来源设计时变体保留 `parentDesignId`；流程连线不替代设计血缘。

不要为整理版面随意删除来源步骤或候选；先导出备份，再确认丢弃操作的范围。生成输入和结果关联用于追溯，不应该限制图片的独立摆放。

## 画布操作

选择工具用于选中和移动内容；按住空格可以临时平移画布。编辑文字或参数时，不应触发画布快捷键。缩放、恢复 100% 和适应全部只调整视图，不应重排节点。缩略总览中文字太小时，应放大到可读比例再操作。

自动保存仍依赖浏览器本地存储；`Ctrl/Cmd + S` 可请求立即保存。出现保存错误时先保留页面，按界面提示恢复，不要立即清空站点数据。

## 配置模型连接

在「AI 模型连接设置」填写服务名称、基础 URL、模型名称和 API Key。基础 URL 是服务 API 根地址，例如 `https://api.openai.com/v1`，不是完整的图像编辑端点。只使用自己信任的服务地址。

测试连接主要检查配置和访问是否可用，不证明该模型支持图像编辑、多图或蒙版。文字模型不能仅凭连接成功用于图片工作流。只有确认服务和模型支持时才开启图像编辑蒙版支持；不支持的能力应报错，而不是偷偷转成纯文字生图。

Key 可以只用于当前会话或记在本地浏览器。记住 Key 不等于系统级加密保管；Key 不进入节点、工程或 `.oidproj`。导入工程后仍需单独配置自己的凭据，不要在截图或日志中展示 Key。

生成会把选定图片、说明和请求发送给服务商；费用由服务商收取，不显示固定估价。多视角可能逐张请求，后续失败不代表前面请求免费。取消也不保证服务商停止计费。

## 备份与恢复

浏览器存储不是磁盘工程目录。清理站点数据、隐私模式、容量限制或更换浏览器都可能影响恢复；重要工作请主动导出 `.oidproj`。

导出后确认文件实际下载完成。「备份准备完成」不等于文件已落盘。核验资料与私人备份应保存在自己的本地目录，不要把含个人工程的备份上传到公开问题单。

导入同一项目 ID 的备份会替换对应项目数据，操作前先导出当前版本。导入后检查画板、图片、候选、连线和设计血缘，再刷新确认恢复；不要为了核验删除唯一工程。

工程格式版本不是应用版本；不要手动修改版本字段。支持的旧格式通过迁移读取，不受支持的新版或损坏文件应拒绝导入而不是覆盖现有工程。以应用实际校验提示为准。

## 常见问题与边界

| 现象                   | 先检查什么                                   |
| ---------------------- | -------------------------------------------- |
| 预览打不开             | 开发服务是否运行、终端实际地址和端口是否一致 |
| 首页没有原工程         | 是否换了浏览器、主机名或端口；再考虑导入备份 |
| 连接成功但不能生成图片 | 模型与服务是否支持图像编辑、多图及所需蒙版   |
| 局部修改效果不对       | 保留原图，区分模型效果与选区保护；不自动重跑 |
| 导入失败               | 文件完整性、格式版本、大小限制和缺失资源提示 |

草图用于设计探索，3D 用于 GLB/GLTF 评审，不是 CAD 或 AI 3D 建模。多视角图片不保证几何一致。已有本地图案平面贴放及依赖兼容 Provider 的透明抠图候选检查，不等于 3D 曲面贴图或本地分割模型。专用本地 AI 超分辨率、AI 3D 和云协作不包含在当前 Beta 中。

当前公开包说明见 [Beta 4](./beta-0.1.0-beta.4-release.md)；后续执行范围见 [发布状态](./release-status.md)。
