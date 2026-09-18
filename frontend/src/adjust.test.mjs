// Assert-based self-check for the filter builder. Run: node src/adjust.test.mjs
import assert from 'node:assert/strict'
import { ADJUST_DEFAULTS, adjustFilter, vignetteStyle } from './adjust.js'

assert.ok(adjustFilter(ADJUST_DEFAULTS) === 'none', 'neutral values -> no filter')
assert.ok(adjustFilter({ ...ADJUST_DEFAULTS, exposure: 50 }) === 'brightness(1.5)', 'exposure')
assert.ok(adjustFilter({ ...ADJUST_DEFAULTS, saturation: -100 }) === 'saturate(0)', 'saturation floor')
assert.ok(adjustFilter({ ...ADJUST_DEFAULTS, bw: 100 }) === 'grayscale(1)', 'B/W')
assert.ok(
  adjustFilter({ ...ADJUST_DEFAULTS, warmth: -50 }) === 'hue-rotate(6deg)',
  'cool side skips the sepia',
)
assert.ok(
  adjustFilter({ ...ADJUST_DEFAULTS, exposure: 20, contrast: 10 }) ===
    'brightness(1.2) contrast(1.1)',
  'parts join in order',
)
assert.ok(vignetteStyle(ADJUST_DEFAULTS) === null, 'no vignette at 0')
assert.ok(vignetteStyle({ ...ADJUST_DEFAULTS, vignette: 50 }).background.includes('0.5'), 'vignette alpha')
console.log('ok')
