// Served by the backend itself (the desktop app) -> same origin, no host to
// guess. Under `vite dev` the API lives on its own port; 127.0.0.1 rather than
// "localhost", which resolves to ::1 first here and then hangs.
const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (location.port === '5173' ? 'http://127.0.0.1:8010' : '')

async function parseOrThrow(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) message = body.detail
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new Error(message)
  }
  return res.json()
}

export async function uploadVideo(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
  return parseOrThrow(res)
}

export async function createJob({
  video_id, model_id, conf, imgsz, classes, line_y, line_y2, roi,
  line_color_a, line_color_b, roi_color, line_thickness, adjust,
}) {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_id, model_id, conf, imgsz, classes, line_y, line_y2, roi,
      line_color_a, line_color_b, roi_color, line_thickness, adjust,
    }),
  })
  return parseOrThrow(res)
}

export async function listModels() {
  const res = await fetch(`${API_BASE}/models`)
  return parseOrThrow(res)
}

export async function uploadModel(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/models`, { method: 'POST', body: formData })
  return parseOrThrow(res)
}

export async function getModelClasses(modelId) {
  const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelId)}/classes`)
  return parseOrThrow(res)
}

export async function getJobResult(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/result`)
  return parseOrThrow(res)
}

export function jobStreamUrl(jobId) {
  return `${API_BASE}/jobs/${jobId}/stream`
}

export async function stopJob(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/stop`, { method: 'POST' })
  return parseOrThrow(res)
}

export async function savePreset(name, config) {
  const res = await fetch(`${API_BASE}/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, config }),
  })
  return parseOrThrow(res)
}

export async function listPresets() {
  const res = await fetch(`${API_BASE}/presets`)
  return parseOrThrow(res)
}

export async function getPreset(name) {
  const res = await fetch(`${API_BASE}/presets/${encodeURIComponent(name)}`)
  return parseOrThrow(res)
}
