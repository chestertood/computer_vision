import { useState } from 'react'
import { ADJUST_DEFAULTS } from '../adjust'
import {
  IconBrightness,
  IconContrast,
  IconExposure,
  IconFade,
  IconFilters,
  IconSaturation,
  IconTint,
  IconVignette,
  IconWarmth,
} from './AdjustIcons'

// Only the controls a CSS filter can honestly do. Sliders run -100..100, or
// 0..100 where the effect has no opposite.
const CONTROLS = [
  { key: 'exposure', label: 'Exposure', Icon: IconExposure },
  { key: 'contrast', label: 'Contrast', Icon: IconContrast },
  { key: 'saturation', label: 'Saturation', Icon: IconSaturation },
  { key: 'brightness', label: 'Brightness', Icon: IconBrightness },
  { key: 'warmth', label: 'Warmth', Icon: IconWarmth },
  { key: 'tint', label: 'Tint', Icon: IconTint },
  { key: 'fade', label: 'Fade', Icon: IconFade, min: 0 },
  { key: 'bw', label: 'B/W', Icon: IconFilters, min: 0 },
  { key: 'vignette', label: 'Vignette', Icon: IconVignette, min: 0 },
]

export default function AdjustPanel({ values, onChange }) {
  const [selected, setSelected] = useState('exposure')
  const control = CONTROLS.find((c) => c.key === selected)
  const value = values[selected] ?? 0
  const touched = CONTROLS.some((c) => values[c.key])

  return (
    <div className="adjust-panel">
      <div className="adjust-panel__grid" role="group" aria-label="Image adjustments">
        {CONTROLS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={selected === key}
            title={label}
            className={`${selected === key ? 'active' : ''}${values[key] ? ' set' : ''}`}
            onClick={() => setSelected(key)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <label className="adjust-panel__slider">
        <span>
          {control.label}
          <b className="num">{value}</b>
        </span>
        <input
          type="range"
          min={control.min ?? -100}
          max="100"
          value={value}
          onChange={(e) => onChange({ ...values, [selected]: Number(e.target.value) })}
        />
      </label>
      <button
        type="button"
        className="adjust-panel__reset"
        disabled={!touched}
        onClick={() => onChange(ADJUST_DEFAULTS)}
      >
        Reset all
      </button>
    </div>
  )
}
