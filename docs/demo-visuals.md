# Portable lamp demo visuals

The files in `brand/demo/` are AI-generated example imagery for the local
Portable Lamp Demo. They are illustrative design studies, not photographs of a
manufactured product or captures of a real 3D model.

Created with the built-in image generation tool on 2026-09-23. The prompt set
specified a compact rechargeable camping lamp with a charcoal carry handle,
sage-gray body, and warm diffuser:

- `portable-lamp-reference.png`: a realistic outdoor context photograph at a
  lakeside campsite, without text or branding.
- `portable-lamp-sketch.png`: a monochrome industrial-design study sheet of the
  same lamp with proportion and construction marks.
- `portable-lamp-concept.png`: a clean studio product visualization of the
  sage-gray concept.
- `portable-lamp-variant.png`: an edit of the concept render that preserves the
  silhouette and camera view while changing the opaque body to warm off-white.

Three additional images were created on 2026-09-29 because the example needed
distinct, legible outputs for its CMF and local-detail branches. They reuse the
same lamp concept and remain preloaded example material; they are not model
results or run history from this application:

- `portable-lamp-cmf-blue.png`: a mineral blue-gray CMF direction with the same
  compact lamp silhouette and warm diffuser.
- `portable-lamp-detail-knob.png`: a close-up study of the front control knob
  texture and surrounding surface.
- `portable-lamp-detail-handle.png`: a close-up study of the handle pivot and
  its attachment to the lamp body.

`portable-lamp-scene.png` was created on 2026-09-27 as an outdoor lifestyle
image showing the concept in a dusk campsite context.

Opening the demo copies these files into its local Asset/Blob repository. They
are never embedded as Base64 in project JSON. The visible Concept → Variant
connector is derived from `parentDesignId`; the reference and sketch images do
not claim a persisted design lineage relationship. Canvas task-to-example
arrows illustrate the intended design workflow only; no `Generation` record,
provider response, or successful run is fabricated for these preset images.

The [release asset review](./release-asset-review.md) binds these eight files to
their current SHA256 fingerprints and this documented origin statement. It
does not replace individual generation receipts, applicable service terms or
the project owner's distribution authorization, which remain pending. The
images are not automatically covered by the application's MPL-2.0 code license.
