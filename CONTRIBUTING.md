# Contributing

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
