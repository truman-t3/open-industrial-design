# 草图字体和解码器原文核验

## 已执行替换（2026-10-03）

按所有者要求，网页不再分发许可版本绑定未确认的旧 Liberation Sans 1.05。现使用 **Liberation Sans 2.1.5 / SIL OFL 1.1**；来源为 [Debian 官方字体包 2.1.5-3](https://deb.debian.org/debian/pool/main/f/fonts-liberation/fonts-liberation_2.1.5-3_all.deb)。包内同目录体系的完整版权文件和字体内版本／许可字段相符。OFL 允许随商业软件捆绑使用和分发，但需保留版权与许可，不单独销售字体；应用自有代码仍为 MPL-2.0。

- [原始字体及依据](../vendor/fonts/liberation-2.1.5/provenance.json) 包含包、TTF、WOFF2 和版权文件的 SHA256。原始 TTF 和完整版权文件一并保存。
- [可复现转换脚本](../vendor/fonts/liberation-2.1.5/convert.py) 使用 fonttools 4.60.1 / Brotli 1.1.0，仅在独立 QA 工具环境安装，正常构建不新增 Python／npm 依赖。禁用 glyph transforms，无裁字、无改名；逐表验证除 WOFF2 必须的 head 校验值及压缩标记外字节一致，保留字形、度量和元数据。依据 [OFL FAQ 的无损格式转换说明](https://openfontlicense.org/ofl-faq/) 保留原名称。
- 草图字体 ID 9 和旧 Helvetica ID 2 的领域数据不变。运行时仍提供相同族名，路径改为 `runtime/excalidraw-ofl-v1/`，防止旧 `force-cache` 字体继续命中。234 个字体中仅此一个替换，附带一份新版权文件；旧安装字体不随网页分发。
- 字符覆盖从 662 增至 2,327，但旧 U+2011 及私用区 U+F001、U+F002、U+F005 不在新字体中。这些字符依赖浏览器回退，不能承诺全部旧稿逐像素相同。中文继续使用原有中文字体／系统回退，不把新版 Liberation 当作中文字库。
- 发布清单区分有效运行时字体与 `historicalPendingFontFamilies`；旧候选仍未被批准，不再作为当前网页中此字体的发布阻碍。其他依赖、素材及发布安全门槛没有被一并放行。

以下为替换前的历史取证记录；涉及“未替换”“Liberation 仍待确认”的描述只适用于旧安装文件。

核验日期：2026-10-02。范围是当前安装的 Excalidraw 0.18.1 字体和查看器默认引用的 Draco 1.5.5。已收集的原文随构建许可草稿提供；Draco 三份 CDN 文件已有当日字节快照匹配，但这不代表全部远程文件、离线运行验收或正式发布授权通过。应用许可证仍为 MPL-2.0。

## 字体来源和声明

[证据清单](../licenses/runtime-notice-evidence.json) 记录 234 个本地 WOFF2 文件的 SHA256、大小和 Git blob 指纹。与 [Excalidraw 0.18.1 的固定提交](https://github.com/excalidraw/excalidraw/tree/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/fonts) 的目录对象逐一匹配。没有下载 CDN 字体，也没有改动或替换字体文件。Git blob 匹配说明安装文件与该提交对应，不证明 CDN 当前返回相同内容。

| 字体系列        | 文件数 | 本轮原文依据                                                              | 状态                                             |
| --------------- | -----: | ------------------------------------------------------------------------- | ------------------------------------------------ |
| Assistant       |      4 | 已有按字体哈希绑定的版权与 OFL 原文                                       | 沿用已有清单，不重复计入新增声明                 |
| Cascadia        |      1 | 字体 name 表版权及完整许可字段，保留微软前置限制文字和后续基于 OFL 的条件 | 原文已收集，不把混合文字简化成无条件授权         |
| ComicShanns     |      4 | 四个文件内一致的完整 MIT 版权／许可字段                                   | 原文已收集，保留全部作者                         |
| Excalifont      |      7 | 固定提交字体登记源码中的完整原始注释，包括版权、设计者及 OFL              | 原文已收集，不用包级 MIT 替代字体 OFL            |
| Virgil          |      1 | 字体 name 表版权和完整 OFL 字段                                           | 原文已收集，保留原有版权措辞                     |
| Liberation Sans |      1 | 字体内标明 Version 1.05；另收集历史旧协议和 GPL 原文作为未绑定候选        | 版本对应仍待核验，不能套用新版 OFL               |
| Lilita          |      2 | 历史 Google Fonts OFL 原文，另保留安装字体的版权及保留名称字段            | 原文已收集，保留名称差异仍需审阅                 |
| Nunito          |      5 | 历史 Google Fonts OFL 原文及安装字体 name 表，其版权头一致                | 原文已收集，不宣称 Google Fonts 发布字节完全相同 |
| Xiaolai         |    209 | 固定登记注释明确声明 OFL 1.1，附已收集并校验的官方完整正文                | 声明和正文已收集，不冒充作者原始许可文件         |

累计补充声明覆盖七个系列、229 个文件；另有已核验的四个 Assistant 文件。Liberation Sans 1.05 仍缺少可与当前文件绑定的旧版许可依据，历史候选原文不计为已完成。209 个 Xiaolai 文件是字体子集，不代表 209 种字体或每次都会发起 209 次请求。没有根据字体名称或包级 MIT 声明自行编写许可条款。

本轮新增依据如下：

- [Lilita 历史 OFL 原文](https://raw.githubusercontent.com/google/fonts/90abd17b4f97671435798b6147b698aa9087612f/ofl/lilitaone/OFL.txt) 与安装字体同属 Juan Montoreano 的字体系列，但原文写 `Reserved Font Name Lilita`，安装字体写 `Reserved Font Names "Lilita One"`。草稿分别保留两份原始文字，不合并保留名称，也不把历史字体系列文本当成精确发布字节匹配或授权结论。
- [Nunito 历史 OFL 原文](https://raw.githubusercontent.com/google/fonts/a5bd0ea86b2576f86672aab557a6024d272187a5/ofl/nunito/OFL.txt) 的版权头与五个安装字体一致；仍仅声明字体系列文本依据，不假定 Google Fonts TTF 与 Excalidraw WOFF2 是同一发布文件。
- [Xiaolai 固定版本登记源码](https://raw.githubusercontent.com/excalidraw/excalidraw/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/fonts/Xiaolai/index.ts) 的原始注释明确声明采用 OFL 1.1，包含 `Copyright © 2020 LXGW` 和 Version 3.11。保留整段原注释，并复用已有 Assistant 核验中收集的 [官方 OFL 正文](https://openfontlicense.org/documents/OFL.txt)，按哈希核对正文不变，不复用 Assistant 版权头或官方模板示例版权头。登记注释的哈希和官方正文的来源／哈希分别记录，不能称为已找到作者原始完整许可文件。

Liberation 的旧版协议缺口没有因新版字体采用 OFL 而关闭。以上三个系列的文本收集完成，不等于全部许可适用性、CDN 文件或分发授权已通过。

构建中的 `runtimeNoticeEvidence` 保存绑定信息、提取文本哈希、来源 URL 和待办系列；许可草稿提供完整原文。Excalifont 采用上游原始注释，不重新排写其版权和 OFL 内容。复核脚本仅读取已安装字体和仓库证据，构建无需访问 GitHub。

## Liberation 旧协议候选与版本差异

在 Liberation Fonts 上游固定提交 `cf3040c146097d6b7361e2823d5c6b5c309a456a` 收集了 [License.txt](https://github.com/liberationfonts/liberation-fonts/blob/cf3040c146097d6b7361e2823d5c6b5c309a456a/master/License.txt)、[COPYING](https://github.com/liberationfonts/liberation-fonts/blob/cf3040c146097d6b7361e2823d5c6b5c309a456a/master/COPYING) 和 README 原文。这是 GPL v2 加文档嵌入等例外的历史协议，不是 OFL；[Fedora 的旧协议记录](https://fedoraproject.org/wiki/Licensing/LiberationFontLicense) 也保留了这些条款。不能据此把应用源码改成 GPL，也不能把文档嵌入例外当作软件分发义务已全部解决。

上游 Git 树包含 `master/liberation-fonts-1.05.2.20091019` 目录，但对应 [LiberationSans-Regular.sfd](https://github.com/liberationfonts/liberation-fonts/blob/cf3040c146097d6b7361e2823d5c6b5c309a456a/master/src/LiberationSans-Regular.sfd) 的版本字段实际为 **1.02**；安装 WOFF2 的 name 表为 **1.05**。目录名不能替代文件版本证据。本轮读取这份源文件以核对元数据，并校验四份文本的 Git blob 指纹，没有执行上游源码、下载字体二进制或改变字体。

候选文本采集记录（内部记录，未随源码交付：`liberation-legacy-collected-texts.json`） 保存原文、来源、SHA256、Git blob 指纹和源字体版本字段。仓库 `legacyFontResearch` 单独保存这些候选，生产草稿完整携带旧协议、GPL 正文、README 和字体内版权，并标明“安装版本绑定未核验”。它不进入七套已补充字体声明的计数；`pendingFontFamilies` 仍有 Liberation，严格门槛继续拦截。

后续追踪确认同一 Git blob `86ed395a2eea183902454f8f99936dfe688965a2` 自 [字体选择器首次导入提交](https://github.com/excalidraw/excalidraw/commit/62228e0bbb780d1070a8cf206caa32132d22f19e) 经 [CJK 目录调整](https://github.com/excalidraw/excalidraw/commit/b479f3bd6553be5730e3b60beb8eee5bd9905b37) 和 [字体结构调整](https://github.com/excalidraw/excalidraw/commit/61623bbeba08fd802d23df46ceb8861c6a9a6180) 保持不变；证据见 导入记录（内部记录，未随源码交付：`liberation-font-picker-history.json`） 和 路径调整记录（内部记录，未随源码交付：`liberation-conversion-history.json`）。这解决了 Excalidraw 内部导入后的文件连续性，但未找到最初 WOFF2 转换所用的 TTF／SFD 发布来源。

[Red Hat 历史问题 503430](https://bugzilla.redhat.com/show_bug.cgi?id=503430) 的评论 9 报告 1.05.1 发布包内部仍显示错误的 1.02，评论 14 由维护者确认该问题。因此内部版本号差异不能单独证明源字体不同，也不能反向证明当前 WOFF2 就来自那份历史 SFD；保留两个原始版本字段，继续以文件和转换依据判定。旧协议候选不因这条线索自动转为已绑定许可。

下一步需要追踪现有 1.05 WOFF2 的原始发布文件、转换过程及对应源码，才能确定历史协议适用性和分发义务。若无法完成，再单独评估更换回退字体；本轮不擅自替换、不升级依赖，也不宣称已满足 GPL 的源码提供要求。

## Draco 版本对应

[Draco 1.5.5 固定提交 LICENSE](https://github.com/google/draco/blob/a5b31570c3204326e80c0d0d9d4434f0a10dc71b/LICENSE) 已完整收集，包括 Apache 2.0 主文和文件级附录；没有删去附录中的 ASCIIMathML 和 Unlicense 原文。2026-10-02 又核对了默认 CDN 返回的三份实际文件，大小和 Git blob 指纹全部匹配该固定提交的 `javascript/` 文件：

| 文件                  | 字节数 | 对应上游路径                     |
| --------------------- | -----: | -------------------------------- |
| draco_decoder.js      | 709590 | javascript/draco_decoder.js      |
| draco_wasm_wrapper.js |  58916 | javascript/draco_wasm_wrapper.js |
| draco_decoder.wasm    | 283091 | javascript/draco_decoder.wasm    |

实际字节核验记录（内部记录，未随源码交付：`draco-cdn-byte-verification.json`） 保存 URL、HTTP 状态、SHA256、Git 指纹和全部匹配路径；采集脚本（内部记录，未随源码交付：`verify-draco-cdn-bytes.mjs`） 只在内存中计算公开文件指纹，没有执行代码、保存二进制、替换加载器或使用 1.5.7 代替 1.5.5。这是当天的完整字节快照匹配，不保证未来 CDN 响应不变，也不等于已经本地托管、断网验收或获准分发。

构建携带三份快照记录和完整 LICENSE，离线检查已审阅证据的完整性；不在每次构建联网重新请求 CDN。默认远程路径未改。隔离断网诊断（内部记录，未随源码交付：`断网技术核验.md`） 已复现压缩 GLTF 对 1.5.5 wrapper／WASM 的请求失败：网格与包围盒仍停在“加载中”，存在未处理的 `Failed to fetch`。未压缩 GLB 和保存恢复正常；诊断完成不等于验收通过。加载失败反馈、本地托管、源码提供与分发审核仍待完成，`pendingRuntimeAssets` 仍有两类资产。

## 回归和发布边界

[离线证据复核](../scripts/runtime-notice-evidence.mjs) 已接入构建。十项运行时测试覆盖真实字体清单、字节／大小／Git 指纹变化、缺失／重复文件、声明文本／来源／绑定变化、遗漏待办以及错误解码器版本和虚构完整审批状态；另防止丢弃保留名称、重新计算篡改文本哈希绕过来源校验、混淆字体版权，以及把 Liberation 历史候选改成已批准或隐藏 1.02／1.05 差异。新增快照测试拒绝删除／重复解码器文件、变更哈希／大小／出处／日期或把快照状态改为断网与分发已通过。没有改变项目数据模型、`.oidproj`、UI、用户数据或依赖版本。

完整分发检查仍应拒绝通过：旧有四个包声明、对应源码获取方式、图片分发授权及两类远程资产验收待办没有被字节匹配自动解除。后续补齐 Liberation Sans 1.05 的准确旧版许可，审阅 Lilita 保留名称差异，再完成本地托管路径和隔离断网验收。不需要重置或删除唯一预览工程。

本次冷启动断网诊断也实际触发 Excalifont／Xiaolai CDN 请求；中英文文字回退显示，草图源场景及 PNG 可以保存。隔离工程 `.oidproj` 导出、导入新 context 和刷新恢复后，节点、SketchDocument、场景及四个 Blob 的 ID／大小／SHA256 一致。没有据此认定字体显示效果或全部离线能力通过，见上述报告及 机器记录（内部记录，未随源码交付：`offline-browser-verification.json`）。

## 本轮核验结果

### 后续运行时修复

上述默认 CDN 和故障状态为修复前的历史证据。当前应用在草图初始化前设置 `EXCALIDRAW_ASSET_PATH`，开发服务器和生产目录提供 `runtime/excalidraw/fonts/` 的 234 份固定文件；没有换字体或升级 Excalidraw。`vendor/draco/1.5.5/` 保存与上述快照完全一致的三份解码器及完整 LICENSE，Vite 本地插件每次按 SHA256 验证后发布到 `runtime/draco/1.5.5/`。构建不联网下载。

查看器采用已安装 Three 的 GLTFLoader／DRACOLoader，保留 Meshopt 解码，避开无人观察的提前初始化 Promise。加载失败／超时显示中英文提示，禁用空视图截图并提供重新加载；切换模型或退出时取消任务、终止解码 Worker 并释放已加载模型资源。新请求不复用失败缓存。

隔离修复验收（内部记录，未随源码交付：`断网修复核验.md`） 已确认本地中英文字体、Draco 1.5.5 实际解码、故障注入后重试和归档冷启动恢复。字体文件按清单逐一校验，不表示逐一进行了所有文字视觉审核。远程请求来源仍保留在资产清单作为历史出处，当前本地路径单列；两类资产的正式审核仍未放行，尤其 Liberation 精确版本绑定、源码提供与分发授权不因本地托管自动完成。

第一批声明核验的 `release:check` 通过 211 项测试，记录保留在 此前日志（内部记录，未随源码交付：`runtime-notice-release-check.log`）。随后 三套字体补充日志（内部记录，未随源码交付：`remaining-font-notice-release-check.log`） 记录 213 项测试（186 项应用测试及 27 项声明／资产测试）、格式、lint、类型检查和生产构建通过；仍保留原有大于 500 kB 的分块警告。

三套字体补充成品复核（内部记录，未随源码交付：`remaining-font-notice-bundle-verification.json`） 确认三套新增依据、字体内版权、23 张图片和 262 份原包声明均保留，八份输出可重复生成，根 MPL 和锁文件未变。完整分发门槛按预期失败，并新增独立拦截待补齐运行时字体依据，防止其他待办完成后漏掉旧版 Liberation。远程二进制和浏览器断网验收不计为通过。此前成品复核（内部记录，未随源码交付：`runtime-notice-bundle-verification.json`） 仍保留第一批四个系列的结果。

本轮 旧协议候选核验日志（内部记录，未随源码交付：`liberation-legacy-release-check.log`） 记录 214 项测试（186 项应用测试及 28 项声明／资产测试）和全量质量检查通过。成品复核（内部记录，未随源码交付：`liberation-legacy-bundle-verification.json`） 确认三份历史原文完整进入警示草稿，所有已核验文本、图片和根 MPL／锁文件均保留，八份声明输出可重复生成。严格门槛仍报告一个运行时字体声明绑定待办，不把候选收集误称为确切版本许可通过。

后续 CDN 字节核验日志（内部记录，未随源码交付：`draco-byte-notice-release-check.log`） 记录 215 项测试通过；对应成品核验（内部记录，未随源码交付：`draco-byte-notice-bundle-verification.json`） 确认三份实际解码器文件的快照与完整 LICENSE 已进入成品。最终 运行时与源码声明核验日志（内部记录，未随源码交付：`runtime-source-notice-release-check.log`） 记录 217 项测试（186 项应用测试及 31 项声明／资产测试）、格式、lint、类型和生产构建通过；最终成品复核（内部记录，未随源码交付：`runtime-source-notice-bundle-verification.json`） 另确认三条 maath 文件级版权注释完整保留但不放行包级缺口，八份输出可重复生成，根 MPL／锁文件不变。大于 500 kB 的分块警告保留，严格分发门槛继续按预期失败。
