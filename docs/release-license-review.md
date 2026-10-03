# Community Alpha 发布许可证复核

当前结论（2026-10-03，替代下文历史数量）：用户批准移除 Drei，现用已锁定 Three.js 的官方 OrbitControls。锁文件移除 30 个独占间接依赖快照，包括 maath、stats-gl、MediaPipe 和 draco3d 1.5.7；当前生产清单 263 个包版本，缺少包级声明为 0。旧调查和未使用正文保留为历史证据，不为已移除组件继续索取授权。本地 Draco 1.5.5 运行时及其声明保留，图片／运行时分发审核、对应源码公开渠道仍需独立完成。MPL-2.0 与 DCO 不变。

复核日期：2026-10-01。应用版本：`0.1.0-alpha.1`。

最新补充（2026-10-03）：包级许可正文缺口现为 maath 0.10.8 和 stats-gl 2.4.2 两项。MediaPipe tasks-vision 0.10.17 的安装清单及 [npm 精确版本元数据](https://registry.npmjs.org/@mediapipe%2Ftasks-vision/0.10.17) 声明 Apache-2.0，安装声明文件保留作者版权和 Apache 链接；已保留该头部并补入 [官方标准正文](https://www.apache.org/licenses/LICENSE-2.0.txt)。源码中的 `licenses/texts/apache-2.0.txt` 与安装清单、声明文件一起固定哈希，构建离线复核。此处关闭的是缺少包级许可正文，不冒充同版源码提交证明或完整 WASM 第三方归属审核；整体发布门槛不变。下方历史数量和查询失败保留为过程记录，以本段及当前构建清单为准。

本轮完成了已安装依赖树、项目许可证和现有生产构建的资料盘点，并修正了根许可证原文、贡献说明与源码许可声明。结论是：项目继续采用 MPL-2.0 和 DCO 1.1，不需要因为扫描器的 Unknown 标签直接替换依赖；但第三方原文、字体及最终分发声明尚未齐备，不能据此批准对外发布。本记录不是法律意见或安全漏洞扫描。

## 复核范围与证据

使用 `pnpm licenses list --prod --json` 与 `pnpm licenses list --json` 检查当前已安装的 Windows 依赖树，读取各版本 package.json，递归收集包内命名为 LICENSE、COPYING、NOTICE、OFL、COPYRIGHT 等的文本及 SHA256。跳过依赖目录和符号链接；不读取用户工程、API Key 或凭据文件。没有升级或安装依赖。

| 范围                 | 包名数 | 包版本数 |
| -------------------- | -----: | -------: |
| 生产依赖树           |    274 |      300 |
| 全部依赖树含开发工具 |    425 |      458 |

包名数按 pnpm 的分组记录计算，版本数按 `name@version` 去重。生产依赖树是保守盘点，不代表全部包都进入最终 JS；未安装的平台可选依赖、文件头中的不同许可、在线加载的字体或解码器不由这次元数据扫描完整覆盖。

锁文件 SHA256：`a521fef847b113fc409f850fa2057d94c564d2b5de935d5ef06e91e2a3dd9b58`。

可复现命令，在仓库根目录执行：

```powershell
node ../artifacts/qa/license-release-audit.mjs
```

本地证据保留在工作区内：

- 依赖与原文哈希清单（内部记录，未随源码交付：`dependency-license-inventory.json`）
- 已收集原文草稿（内部记录，未随源码交付：`collected-runtime-notices-DRAFT.txt`）
- 采集脚本（内部记录，未随源码交付：`license-release-audit.mjs`）

草稿明确标记不完整，不可当作最终合规声明发布。脚本不访问外部模型，也不自动修改依赖、许可证或分发包。

## 项目自身许可

[LICENSE](../LICENSE) 已与 [Mozilla 官方纯文本](https://www.mozilla.org/media/MPL/2.0/index.txt) 按统一 LF 换行进行完整比对。仅修正一处行末空格和原文中的 HTTP 链接为当前官方 HTTPS 链接；许可证条款不变。修正后 SHA256 为 `3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04`，与本次获取的官方文件一致。

[SOURCE_LICENSE.md](../SOURCE_LICENSE.md) 添加目录级 MPL 标准 notice 和 SPDX 标识，说明项目自有源码的范围，不覆盖第三方源码、品牌、用户项目或示例图片。不能因为添加该声明就认为所有文件来源都已审计；引入或修改第三方文件仍须保留其原有 notice。

[DCO.txt](../DCO.txt) 保留官方 1.1 原文，参考链接留在 [CONTRIBUTING.md](../CONTRIBUTING.md)。贡献说明已去除品牌尚未确定的过时表述，不新增 CLA。[TRADEMARKS.md](../TRADEMARKS.md) 继续保留 Draft 状态，不宣称完成商标注册或品牌权利审查。

## 需要单独处理的依赖

| 对象                                     | 本次实际证据                                                                                                                                     | 后续处理                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| khroma 2.1.0                             | manifest 缺少 license 字段，扫描器报 Unknown；安装包 `license` 为 MIT，SHA256 `66b333b0f66759a0b710459e03f7029abe17f4358114a128d2c972e642961b49` | 按已核对的包内原文保留版权与声明，不修改 node_modules 来掩盖 Unknown |
| DOMPurify 3.4.15                         | `(MPL-2.0 OR Apache-2.0)`，包含两份许可和源码 header                                                                                             | 明确采用的许可路径并保留所需声明，不概括为 MIT                       |
| pako 2.0.3                               | `(MIT AND Zlib)`，根 LICENSE 为 MIT                                                                                                              | 另核对 zlib 源码文件头；当前草稿尚不能覆盖它们                       |
| Dexie 4.4.6                              | Apache-2.0，独立 NOTICE 已收集                                                                                                                   | 最终分发同时保留 LICENSE 和 NOTICE                                   |
| lightningcss 及 Windows native 包 1.33.0 | MPL-2.0，仅出现在开发依赖树                                                                                                                      | Web 成品与携带工具链的源码／桌面分发分别判断，不误列为 UI 运行时依赖 |

当前生产树报告 MIT、Apache-2.0、ISC、BSD-3-Clause、DOMPurify 的双许可、CC0-1.0、Unknown、MIT AND Zlib、Unlicense、0BSD；没有报告 GPL、AGPL 或 LGPL 元数据声明。这不证明第三方每个文件或资产均不存在额外条款。

## 正式分发尚未完成的工作

1. 42 个生产包版本没有独立 notice 文本文件。主要涉及 Excalidraw、Radix、React Three Fiber，以及 maath、stats-gl、react-remove-scroll-bar、MediaPipe、Draco。完整名单在 JSON 证据中。应从与具体版本对应的上游来源补齐原文和出处，不能把当前主分支许可直接视为历史版本证据。
2. `apps/web/dist/assets` 实际包含四个 Assistant WOFF2 文件，清单记录了每个文件哈希。还需核对这些字体的上游许可、版权和再分发原文；包的 MIT 元数据不能替代字体许可。其他运行时在线加载资产也需根据实际网络路径单独检查。
3. `apps/web/dist` 尚未附带独立 LICENSE、源码许可说明或完整第三方声明。最终构建应自动携带已审阅原文，且检查构建后文件实际存在，不能只在仓库里放一个表格。
4. 分发可执行代码时，应按 [MPL 第 3 节](https://www.mozilla.org/MPL/2.0/) 告知接收者如何取得对应源码。公开仓库／源码包和正式分发形式尚未确定，本轮不编造下载地址或自动发布。
5. 示例图片和品牌素材的来源、适用条款及发布授权仍需整理；未把 AI 生成图片自动标记成 MPL 或认定无版权风险。用户工程、BYOK 凭据和私人 `.oidproj` 备份不得进入发布包。

这些缺口是发布资料与授权的待办，不影响当前本地预览继续使用。下一步优先补齐确切版本的第三方文本和字体依据，再做 Web 构建声明自动携带；桌面打包、新 Provider、付费模型重跑、性能重构均不属于本轮。

## 本轮核验结果

- 根 MPL 与官方纯文本统一 LF 后完全一致；DCO 与 [官方 1.1 原文](https://developercertificate.org/) 统一 LF 并忽略结尾空白后一致。
- 采集脚本重复运行，两份输出哈希不变；清单数量、锁文件哈希、khroma 原文哈希、Dexie NOTICE 和草稿警示均通过断言。
- 修改文档的本地链接检查通过；两个工作区核验脚本通过 Node 语法检查，使用现有 Prettier 格式化，不安装新工具。
- `pnpm.cmd run release:check` 通过版本、fixture、格式、lint、类型检查、186 项测试和生产构建，退出码 0。本轮完整日志（内部记录，未随源码交付：`license-review-release-check.log`） 保留在工作区；已有超过 500 kB 的构建 chunk 警告仍未消除。
- 未更改运行时业务、领域模型、依赖版本、示例图片、唯一预览工程或 API 凭据；没有付费生成或对外发布。

## 2026年10月2日补充复核

本节是后续进展，上方 2026-10-01 的盘点保留为历史记录。工作对齐实施计划 Phase 12／13 和路线图 Milestone 7，未改变项目 MPL-2.0 或 DCO 1.1，也未升级依赖。

### 已补齐的原文

最初缺少文本的 42 个版本中，24 个已补齐：Excalidraw 0.18.1、21 个较新 Radix 包版本、React Three Fiber 9.4.0、Draco 1.5.7。[补充清单](../licenses/supplemental-notices.json) 保存 package.json 哈希、固定上游 commit、原文哈希和版本出处。构建发现版本或原文变化会报错，不拿最新主分支代替历史版本。

四个实际 Assistant WOFF2 的 name 表都显示 Version 3.000、同一版权和 OFL-1.1 声明；内嵌字体证据（内部记录，未随源码交付：`assistant-font-metadata.json`） 记录原文及字节哈希。补充字体 notice 保留原始版权和 Reserved Font Name，附 [SIL 官方 OFL 正文](https://openfontlicense.org/documents/OFL.txt)，仅替换官方模板的示例版权头，不改条款。字体不按 Excalidraw 的 MIT 元数据处理。

pako 2.0.3 的 11 个 zlib 源文件头已原样收集，与根 MIT LICENSE 一并携带；Dexie 的 LICENSE／NOTICE 和 DOMPurify 的两份许可原文继续保留。khroma 仅在原文哈希匹配已复核 MIT 文本时不列为 unresolved，扫描器 Unknown 标签仍保留。

### 构建携带与未完成门槛

每次 `vite build` 后执行离线 [采集脚本](../scripts/build-license-notices.mjs)，输出 `apps/web/dist/licenses`：根 MPL、项目源码 notice、DCO、品牌 Draft、第三方说明、原文草稿、无本机路径的 JSON 清单和待配置源码获取说明。只复制显式允许的项目声明与包内许可文本，不复制凭据、用户工程或 QA 备份。构建不会访问网络或调用模型。

剩余 18 个版本：14 个旧 Radix 版本，以及 MediaPipe tasks-vision 0.10.17、maath 0.10.8、react-remove-scroll-bar 2.3.8、stats-gl 2.4.2。部分缺少发布 gitHead／匹配标签，部分提供的提交没有许可文本；不能因此断言它们不能用，但本轮不把出处不明的替代文本算作完成。完整名单由每次构建的 `notice-inventory.json` 输出。

`pnpm.cmd run notices:check` 会因这些缺口和未配置对应源码获取方式失败，这是预期的发布拦截。`release:check` 包含许可脚本回归测试，但不把这个未完成门槛伪装为通过。成品许可包明确标记 `DRAFT_NOT_APPROVED_FOR_DISTRIBUTION`；在线加载资产、示例与品牌来源、正式分发形式和发布授权仍待独立确认。

### 补充核验结果

- `pnpm.cmd run release:check` 退出码 0：版本、fixture、格式、lint、类型、原有 186 项测试、新增 9 项许可回归测试及生产构建均通过。完整日志（内部记录，未随源码交付：`notice-bundle-release-check.log`） 留在工作区；大 chunk 警告仍保留。
- 成品核验（内部记录，未随源码交付：`notice-bundle-verification.json`） 确认 300 个包版本、24 个补充版本、18 个待办、4 个字体；262 份安装包原文均完整出现在草稿中。根 MPL／锁文件哈希不变，五份项目声明与构建副本逐字节一致。
- 重新离线收集后，八个输出文件的哈希全部不变。45 个修改文档的本地链接可读取；JSON 不含本机安装路径或凭据字段。明确文件清单未带入用户工程、凭据或 QA 日志。
- 独立 `notices:check` 退出码 1，错误明确为 18 个包声明、0 个字体和源码获取说明待完成。此项是预期拦截，不是通过，也不是对外发布已获批准。
- 计划入口已对齐当前阶段，历史盘点与本轮证据分别记录；不改变产品范围、MPL-2.0、DCO 或运行时业务，没有付费请求或重新生图。

### 历史源码映射复核与当前缺口

2026-10-02 的后续复核又补齐了 14 个旧 Radix 版本，使最初 42 个缺文本版本中的 38 个已有补充，剩余 4 个。上方 24／18 的结果保留为同日较早记录，不是当前状态。

这些旧版缺少可解析的发布引用，但安装包的 `dist/index.module.js.map` 内嵌了源文件内容。依据 npm 版本发布时间，读取此前固定上游提交，逐份比对全部 29 份内嵌源码；仅统一 CRLF 为 LF，内容全部一致。逐版本匹配证据（内部记录，未随源码交付：`historical-radix-source-review.json`） 保存发布时间、不可变源码 URL、源码映射及各源码哈希。三个固定提交中的原始 LICENSE 均与已收集的 ©2022 WorkOS MIT 文本逐字节一致，直接复用已有原文文件。

这是发布包**源码内容匹配**，不是声称整个上游 checkout 就是该版本的发布提交，也不覆盖源码映射之外的未知文件。构建继续绑定已安装 package.json，同时校验完整源码映射字节、全部内嵌源码和各份已审阅源码哈希；缺少读取器、映射变化、缺源码、重复或不完整证明、浮动主分支出处均不能跳过校验。不增加构建网络请求，不更改应用 MPL-2.0 或依赖版本。

剩余四项的 公开来源检查记录（内部记录，未随源码交付：`remaining-notice-provenance-review.json`） 如下。这些是本次查询结果，不证明所有历史来源均不存在，也不代表依赖被禁止使用。

| 版本                           | 本次尚未补齐的原因                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| MediaPipe tasks-vision 0.10.17 | 发布元数据缺 gitHead／repository，检查的 v0.10.17 标签返回 404；不能用其他版本标签代替 |
| maath 0.10.8                   | 对应标签提交可读取，但完整树没有命名许可文本；MIT 元数据不等于原始版权声明             |
| react-remove-scroll-bar 2.3.8  | 声明仓库中的发布 gitHead 和检查的 v2.3.8 引用均返回 422；未采纳主分支替代文本          |
| stats-gl 2.4.2                 | 发布 gitHead 树可读取，但无命名许可文本；README 的 MIT 声明缺完整原文与版权信息        |

最新 构建成品核验（内部记录，未随源码交付：`historical-notice-bundle-verification.json`） 检查 300 个生产包版本、38 个补充版本、14 份源码映射绑定／29 份源码、4 个字体及 262 份安装包原文。五份项目声明副本逐字节一致，八个输出文件重复收集的哈希不变；根 MPL 和锁文件未改变。对应源码获取方式仍未配置，`notices:check` 仍应以 4 个包声明、0 个字体和源码说明待补齐而失败。草稿不自动转为正式分发声明。

后续 公开历史查询（内部记录，未随源码交付：`notice-history-research.json`）、提交详情（内部记录，未随源码交付：`notice-history-details.json`） 和 补查记录（内部记录，未随源码交付：`notice-followup-research.json`） 发现两个新线索，但不计为完成：react-remove-scroll-bar 于固定提交 `7301c160fda44cb8cf2b9fdfde61efad35736196` 添加 MIT LICENSE，当时 package.json 仍是 2.3.7；maath 的 LICENSE 在 2026 年重建提交 `a03a7a41941ca4423d504bb1898e2f2a3593b1b4` 中新增，不属于已检查的 0.10.8 标签树。两者不能仅因当前存在 LICENSE 就直接套给安装版本。stats-gl 对 LICENSE.md 路径的历史查询也未返回条目；这仍是查询范围内的观察，不是证明所有历史文本都不存在。四个待办版本和锁文件均未改变。

安装的 maath 0.10.8 在三个 easing 构建文件中保留 Quaternion Damp 的完整 MIT 注释和 `Copyright 2016 Max Kaufmann`。构建现已逐字保留这些注释，并检查三个路径、唯一注释和原文哈希；声明标记 `scope: file-level-only`。它们只覆盖这段算法，不能替代整个 maath 包的许可。缺口判定因此明确区分包级和文件级声明：虽然 maath 草稿已有三条注释，四个包级待办仍完整保留。测试覆盖版权或条款变化、重复注释、错误路径，以及部分声明不能放行整个包。

本轮 `pnpm.cmd run release:check` 退出码 0：版本、fixture、格式、lint、类型、186 项业务测试、14 项许可测试（共 200 项）和生产构建全部通过。新增 5 项许可测试覆盖完整源码匹配、缺失读取器、映射字节改变、更新映射哈希仍无法掩盖源码改变、不完整／重复证明及非固定提交出处。50 个本地文档链接可读取，四份核验辅助脚本通过 Node 语法检查。既有超过 500 kB 的 chunk 警告保留，未自动做性能重构。

软件质量日志另存为 历史声明补齐核验日志（内部记录，未随源码交付：`historical-notice-release-check.log`），不覆盖上一次核验日志。计划仍是 Phase 12／13、Milestone 7 的发布收尾；剩余版本原文、远程运行时资产、示例与品牌来源、源码获取方式以及正式发布授权继续保留为待办。唯一预览工程、业务模型、图片和 API 凭据没有改动。
