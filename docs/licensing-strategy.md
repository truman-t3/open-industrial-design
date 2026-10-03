# Open-source Licensing Strategy v0.4

> Status: **DECIDED**
>
> Community Core license: **Mozilla Public License 2.0 (MPL-2.0)**

---

# 1. Why MPL-2.0

The Community Core is intended to remain genuinely open while still allowing:

- commercial use;
- proprietary services around the open core;
- plugins and integrations;
- enterprise deployments;
- future paid Cloud / Studio / Enterprise products.

MPL-2.0 uses file-level copyleft.

Practical project intent:

```text
Modify Open Industrial Design Community covered source files
and distribute those modifications
→ keep those covered modifications available under MPL-2.0.

Build separate proprietary files/services around the Core
→ those separate files may use other terms, subject to the license.
```

This balance is preferable for this project to:

```text
MIT / Apache-2.0
→ too permissive for the main application Core

GPL / AGPL
→ stronger copyleft than currently desired for integrations and adoption
```

---

# 2. Community / Commercial Boundary

Community Core under MPL-2.0:

```text
Canvas
Design domain
Design Graph semantics
Design DNA
Sketch integration
ViewSet
CMF
3D Viewer
BYOK
Provider abstraction
Local-first storage
Project import/export
Plugin-capable Core
Desktop Community client
```

Future commercial code/services may include:

```text
Cloud Sync
Managed Cloud Storage
Hosted Review Links
Team Workspace
Realtime hosted collaboration infrastructure
Managed AI credits
Organization administration
SSO
Audit
Enterprise support
Commercial hosting infrastructure
```

Commercial features must not be required merely to open or continue editing a local Community project.

---

# 3. LICENSE File

Before the first public repository release:

```text
LICENSE
```

must contain the **verbatim official Mozilla Public License Version 2.0 text**.

Canonical source:

```text
https://www.mozilla.org/MPL/2.0/
```

Do not paraphrase or modify the license text.

---

# 4. Source File Notice

For project-authored source files, use the standard MPL notice or SPDX identifier.

Preferred concise form where appropriate:

```text
SPDX-License-Identifier: MPL-2.0
```

Or Mozilla's standard notice:

```text
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
```

Do not add the notice automatically to vendored third-party source files.

---

# 5. Trademark Is Separate From Code License

MPL-2.0 licenses code rights.

It does not grant rights to impersonate the official product brand.

The Open Industrial Design name, logo and official visual identity should be governed separately by:

```text
TRADEMARKS.md
```

---

# 6. Contributions

Initial contribution policy:

```text
MPL-2.0
+
DCO 1.1
```

No CLA is required at initial launch.

Contributors sign off commits:

```text
git commit -s
```

which adds:

```text
Signed-off-by: Name <email>
```

The project should document the official Developer Certificate of Origin 1.1.

Canonical source:

```text
https://developercertificate.org/
```

---

# 7. Why DCO Instead of CLA Initially

Goals:

- low contribution friction;
- contributor provenance;
- avoid unnecessary copyright assignment;
- suitable for an early open-source community.

If a future dual-licensing business model requires relicensing community contributions, legal strategy must be revisited before introducing a CLA.

Do not assume existing DCO contributions can automatically be relicensed under arbitrary proprietary terms.

---

# 8. Third-party Dependencies

MPL-2.0 applies to project-authored covered source.

Third-party packages retain their own licenses.

Maintain:

```text
THIRD_PARTY_NOTICES
docs/third-party-licenses.md
```

Before public release:

- inspect exact lockfile versions;
- detect non-permissive or unknown licenses;
- preserve required notices;
- review any copied or vendored source separately.

---

# 9. SaaS Limitation

MPL-2.0 is not chosen to force disclosure of every hosted modification.

A pure hosted service scenario may have different disclosure consequences than distributing executable/source copies.

This is an accepted trade-off in the current strategy.

The project prioritizes:

```text
ecosystem adoption
+
file-level contribution reciprocity
+
commercial service flexibility
```

over AGPL-style network copyleft.

---

# 10. Legal Review

This document is a project policy, not legal advice.

Before substantial commercial deployment, fundraising, enterprise licensing, or trademark registration:

> obtain qualified legal review of the actual repository, dependencies and business structure.
