// Preview-only look controls. Every value turns into a CSS filter, so nothing
// here touches the frames the model sees or the exported video.
export const ADJUST_DEFAULTS = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  brightness: 0,
  fade: 0,
  warmth: 0,
  tint: 0,
  bw: 0,
  vignette: 0,
}

const r = (n) => Number(n.toFixed(3))

export function adjustFilter(a = ADJUST_DEFAULTS) {
  const parts = []
  if (a.exposure) parts.push(`brightness(${r(1 + a.exposure / 100)})`)
  if (a.brightness) parts.push(`brightness(${r(1 + a.brightness / 200)})`)
  if (a.contrast) parts.push(`contrast(${r(1 + a.contrast / 100)})`)
  if (a.saturation) parts.push(`saturate(${r(1 + a.saturation / 100)})`)
  if (a.fade > 0) parts.push(`contrast(${r(1 - a.fade / 250)})`, `sepia(${r(a.fade / 400)})`)
  // ponytail: warmth and tint are hue nudges, not white balance. A real one
  // needs a per-frame canvas pass — swap in if the eyeball version falls short.
  if (a.warmth) {
    parts.push(`hue-rotate(${r(-a.warmth * 0.12)}deg)`)
    if (a.warmth > 0) parts.push(`sepia(${r(a.warmth / 250)})`)
  }
  if (a.tint) parts.push(`hue-rotate(${r(a.tint * 0.12)}deg)`)
  if (a.bw > 0) parts.push(`grayscale(${r(a.bw / 100)})`)
  return parts.join(' ') || 'none'
}

// Vignette has no CSS filter, so it rides on an overlay instead.
export function vignetteStyle(a = ADJUST_DEFAULTS) {
  if (!a.vignette) return null
  return {
    background: `radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, ${r(a.vignette / 100)}) 100%)`,
  }
}
