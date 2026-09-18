# Task: Image-adjust panel (photo editor style)

## Goal
Add an iPhone-Photos-style adjustment panel to the frontend: sliders/toggles for
Exposure, Contrast, Saturation, Brightness, Fade, Highlights, Shadows, Vignette,
Warmth, Tint, Sharpen, plus Filters/Crop/Tilt/Vertical/Horizontal transform controls.

## Status
- Icons: DONE. `frontend/src/components/AdjustIcons.jsx` exports 16 stroke-style
  components (`IconFilters`, `IconExposure`, `IconContrast`, `IconCrop`,
  `IconSharpen`, `IconTint`, `IconSaturation`, `IconBrightness`, `IconFade`,
  `IconTilt`, `IconVertical`, `IconHorizontal`, `IconHighlights`, `IconShadows`,
  `IconVignette`, `IconWarmth`). All take `{size, className, ...props}`, use
  `stroke="currentColor"` so they inherit theme color — no props needed to recolor.
- Panel UI: NOT started.
- Backend: NO endpoint exists yet for pixel adjustments (checked `backend/main.py` —
  nothing named adjust/exposure/contrast/etc). This is frontend-only for now unless
  the backend owner (see project memory) adds one.

## What to build
1. New component `frontend/src/components/AdjustPanel.jsx`, controlled the same way
   as `ParamsPanel.jsx` (frontend/src/components/ParamsPanel.jsx:6) — receives
   current values + `onChange`, parent (`App.jsx`) owns state, no internal source
   of truth for values that must persist.
2. Decide storage shape first (plain object e.g.
   `{ exposure: 0, contrast: 0, saturation: 0, brightness: 0, warmth: 0, ... }`,
   ranges -100..100 or 0..2 — pick one, be consistent) before wiring sliders.
3. Apply adjustments client-side via CSS `filter` (brightness/contrast/saturate/
   sepia-for-warmth) on the preview `<img>`/`<canvas>` if this is preview-only.
   Do NOT build a server round-trip or a custom pixel-manipulation pipeline unless
   the user explicitly asks for the adjustment to be baked into the exported/
   processed video — that's a much bigger job (backend work) and out of scope
   until confirmed.
4. Follow design direction (see project memory `design-direction.md`): dark stage +
   light panels, violet accent (`--violet: #6e3bff` in `index.css`), controls live
   inside the Preview area — no new settings sidebar.
5. Reuse icons from `AdjustIcons.jsx` as button/tab glyphs (one row of icon+label
   buttons, matches the reference screenshot layout: icon on top, label below).

## Explicitly out of scope (ask user before doing)
- Any backend/API changes.
- Actually baking adjustments into the exported tracked video.
- Crop/Tilt/Vertical/Horizontal as anything beyond UI stubs, unless asked — these
  need real image-transform logic, bigger scope than color sliders.

## Reference
Layout/icon reference screenshot: iPhone Photos edit tray (4x4 grid: Filters,
Exposure, Contrast, Crop / Sharpen, Tint, Saturation, Brightness / Fade, Tilt,
Vertical, Horizontal / Highlights, Shadows, Vignette, Warmth).
