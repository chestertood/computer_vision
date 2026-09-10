export const CLASS_OPTIONS = ['bicycle', 'car', 'motorcycle', 'bus', 'truck']
export const IMGSZ_OPTIONS = [640, 960, 1280]

export default function ParamsPanel({ conf, imgsz, classes, onChange }) {
  function update(patch) {
    onChange({ conf, imgsz, classes, ...patch })
  }

  function toggleClass(name) {
    const next = classes.includes(name)
      ? classes.filter((c) => c !== name)
      : [...classes, name]
    update({ classes: next })
  }

  return (
    <fieldset className="params-panel">
      <legend>Detection parameters</legend>
      <label>
        Confidence: {conf.toFixed(2)}
        <input
          type="range"
          min="0.05"
          max="0.95"
          step="0.05"
          value={conf}
          onChange={(e) => update({ conf: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Image size:
        <select
          value={imgsz}
          onChange={(e) => update({ imgsz: parseInt(e.target.value, 10) })}
        >
          {IMGSZ_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
      <div className="class-checkboxes">
        {CLASS_OPTIONS.map((name) => (
          <label key={name}>
            <input
              type="checkbox"
              checked={classes.includes(name)}
              onChange={() => toggleClass(name)}
            />
            {name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
