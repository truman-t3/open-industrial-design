# Contributing

## 中文贡献指南

欢迎反馈问题、改进文档和提交代码，中文或英文均可。

1. 提交前搜索已有 Issue。软件故障使用 Bug 模板，改进需求使用功能建议模板，安装或使用问题使用 Question 模板。
2. 大功能先讨论设计场景与范围，再提交代码；需求不会因提交 Issue 自动进入排期。维护者不承诺固定回复时间。
3. 每个 PR 聚焦一项改动，说明原因、测试和未覆盖范围。遵守本文件下方的架构约束及 DCO 1.1；只有拥有提交权利时才能执行 `git commit -s`。
4. 不上传 API Key、完整请求头、客户设计、浏览器数据或未脱敏日志。漏洞细节不要发布在 Issue／PR 中；当前尚未确认可用的外部私密漏洞报告入口，请先通过已建立的私下联系渠道联系维护者。没有私下渠道时，仅询问渠道，不附漏洞细节。

开发环境和启动命令见 [README](./README.md)。提交前在仓库根目录执行：

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run release:check
pnpm run publication:check -- --public
```

Windows 可使用 `pnpm.cmd`。AI 测试默认使用模拟请求，不要求贡献者提供付费密钥；必须进行真实调用时先说明原因和费用。分发资料检查与技术测试独立，不能删除检查来让 CI 变绿。

维护者按情况使用 `bug`、`enhancement`、`question`、`needs-info`、`good first issue` 标签；信息不足时请补充复现步骤。沟通围绕问题，尊重参与者，不进行人身攻击。暂不开设 Discussions、聊天群或自动回复机器人。

## English contribution guide

Thank you for considering a contribution.

> This project is currently in pre-release development.  
> The public development brand is Open Industrial Design.

---

## License

Contributions to project-authored Community source code are intended to be accepted under:

```text
Mozilla Public License 2.0 (MPL-2.0)
```

By contributing, you agree that your contribution may be distributed under the repository's applicable open-source license.

---

## DCO Sign-off

This project uses the **Developer Certificate of Origin 1.1 (DCO)**.

Official text:

```text
https://developercertificate.org/
```

Sign every commit using:

```bash
git commit -s
```

Your commit should include:

```text
Signed-off-by: Your Name <your-email@example.com>
```

Do not sign off a contribution unless you have the right to submit it.

---

## Before Coding

Read:

```text
docs/00-START-HERE.md
docs/codex-rules.md
docs/reuse-first-architecture.md
docs/data-model.md
```

For UX changes also read:

```text
docs/ux-decisions.md
```

---

## Architectural Expectations

Contributions should respect:

```text
Reuse infrastructure.
Own the domain.
Own the workflow.
```

Do not:

- replace the Open Industrial Design domain model with a third-party editor model;
- introduce Cloud dependencies into Community Core;
- add an external dependency without license review;
- scatter hard-coded product branding instead of using centralized app metadata and translations;
- refactor unrelated code in feature PRs.

---

## Pull Requests

Keep PRs focused.

A PR description should include:

```text
What changed
Why
Architecture impact
Dependencies added
Tests run
Known limitations
```

---

## Third-party Code

Do not copy code from other repositories merely because they are open source.

Any copied or vendored source requires:

- compatible licensing;
- attribution where required;
- clear provenance;
- project maintainer review.
