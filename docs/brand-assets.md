# Open Industrial Design Brand Asset Specification v0.7

## Canonical brand

**Open Industrial Design**

Descriptor:

`Open-source Industrial Design Workspace`

Chinese descriptor:

`开源工业设计工作台`

Optional brand line:

`Open tools. Evolving forms.`

## Logo system

The identity uses an abstract open folded 3D-form symbol plus the Open Industrial Design wordmark.

### Light backgrounds

Use:

`brand/logo/open-industrial-design-logo-primary.png`

### Dark backgrounds

Use:

`brand/logo/open-industrial-design-logo-dark.png`

### Monochrome

Use:

- `brand/logo/open-industrial-design-logo-black.png`
- `brand/logo/open-industrial-design-logo-white.png`

## App icon

Raster master:

`brand/icon/open-industrial-design-icon-1024.png`

Provided sizes:

`1024 / 512 / 256 / 128 / 64 / 48 / 32 / 16 px`

The supplied icon uses a transparent square canvas and safe-area padding.

## GitHub README usage

```html
<p align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="./brand/logo/open-industrial-design-logo-dark.png"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="./brand/logo/open-industrial-design-logo-primary.png"
    />
    <img
      alt="Open Industrial Design"
      src="./brand/logo/open-industrial-design-logo-primary.png"
      width="700"
    />
  </picture>
</p>
```

Repository avatar:

`brand/social/open-industrial-design-github-avatar.png`

## Software usage

- Home / About: theme-aware horizontal logo
- Native app icon: standalone symbol only
- Favicon: 32 px or 16 px symbol
- Splash screen: standalone symbol or horizontal lockup
- Do not use the full wordmark as the OS app icon

## Clear space

Keep the supplied padding around raster assets. Do not crop the standalone icon tightly at runtime.

## Minimum practical size

- Horizontal lockup: approximately 180 px wide minimum
- Standalone icon: 16 px minimum

Below the readable wordmark threshold, use the standalone symbol.

## Do not

Do not:

- distort the aspect ratio;
- rotate the mark;
- arbitrarily recolor the symbol;
- add shadows, bevels, or 3D effects to the canonical logo;
- place the light-background wordmark on a dark background;
- use the brand boards as runtime assets.

## File-format status

Current production-development assets are transparent PNGs and are suitable for:

- GitHub README;
- prototype website;
- development builds;
- UI mockups;
- social/repository profiles.

Before formal public release, create a manually reconstructed and reviewed SVG master.

## Brand rights

Source code is licensed under MPL-2.0.

Official Open Industrial Design brand assets are governed separately by `TRADEMARKS.md`.

On 2026-10-03, the project owner confirmed: “品牌图片是我原创 我利用GPT image2.5制作的”. Creation provenance for the 13 runtime brand images is therefore recorded as owner-confirmed, self-created AI imagery in the [asset registry](../licenses/release-assets.json). The tool name is retained as reported, not independently verified; the confirmation date is not a creation date. The owner-source clarification is complete and should not be requested again without conflicting evidence.

This records provenance, not a legal determination of copyright or trademark rights, nor a request to publish. No new asset license is assigned. The [release asset review](./release-asset-review.md) retains distribution review separately. Both reference-only boards are now excluded from the Web build; their originals remain in the workspace and internal source snapshot. This statement does not extend the owner confirmation to demo images or those two boards.
