import { useEffect, useState } from 'react'
import { getModelClasses, listModels, uploadModel } from '../api'

export const IMGSZ_OPTIONS = [640, 960, 1280]

export default function ParamsPanel({ conf, imgsz, classes, modelId, onChange }) {
  const [models, setModels] = useState({ presets: [], custom: [] })
  const [classOptions, setClassOptions] = useState([])
  const [filter, setFilter] = useState('')
  const [uploading, setUploading] = useState(false)
  const [modelError, setModelError] = useState(null)

  function refreshModels() {
    listModels()
      .then(setModels)
      .catch(() => {})
  }

  useEffect(() => {
    refreshModels()
  }, [])

  useEffect(() => {
    let cancelled = false
    getModelClasses(modelId)
      .then((res) => {
        if (cancelled) return
        setClassOptions(res.classes)
        // drop any previously selected class the new model doesn't know
        const kept = classes.filter((c) => res.classes.includes(c))
        if (kept.length !== classes.length) {
          onChange({ conf, imgsz, classes: kept, model_id: modelId })
        }
      })
      .catch((err) => !cancelled && setModelError(err.message))
    return () => {
      cancelled = true
    }
  }, [modelId])

  function update(patch) {
    onChange({ conf, imgsz, classes, model_id: modelId, ...patch })
  }

  function toggleClass(name) {
    const next = classes.includes(name)
      ? classes.filter((c) => c !== name)
      : [...classes, name]
    update({ classes: next })
  }

  async function handleModelUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setModelError(null)
    try {
      const res = await uploadModel(file)
      refreshModels()
      update({ model_id: res.model_id })
    } catch (err) {
      setModelError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const visibleOptions = classOptions.filter((name) =>
    name.includes(filter.trim().toLowerCase())
  )

  return (
    <fieldset className="params-panel">
      <legend>Detection parameters</legend>
      <label>
        <span className="field__head">Model</span>
        <select value={modelId} onChange={(e) => update({ model_id: e.target.value })}>
          <optgroup label="Presets">
            {models.presets.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </optgroup>
          {models.custom.length > 0 && (
            <optgroup label="Custom">
              {models.custom.map((m) => (
                <option key={m.model_id} value={m.model_id}>{m.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label className="model-upload">
        <span className="field__head">
          {uploading ? 'Uploading model…' : 'Or upload your own (.pt)'}
        </span>
        <input type="file" accept=".pt" onChange={handleModelUpload} disabled={uploading} />
      </label>
      {modelError && <p role="alert">{modelError}</p>}
      <label>
        <span className="field__head">
          Confidence
          <span className="num">{conf.toFixed(2)}</span>
        </span>
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
        <span className="field__head">Image size</span>
        <select
          value={imgsz}
          onChange={(e) => update({ imgsz: parseInt(e.target.value, 10) })}
        >
          {IMGSZ_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="field__head">
          Objects to track
          <span className="num">{classes.length}</span>
        </span>
        <input
          type="text"
          className="class-filter"
          placeholder="Search objects…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <div className="class-checkboxes">
        {visibleOptions.map((name) => (
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
