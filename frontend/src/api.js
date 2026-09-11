const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

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

export async function createJob({ video_id, conf, imgsz, classes, line_y, roi }) {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id, conf, imgsz, classes, line_y, roi }),
  })
  return parseOrThrow(res)
}

export async function getJobResult(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/result`)
  return parseOrThrow(res)
}

export async function stopJob(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/stop`, { method: 'POST' })
  return parseOrThrow(res)
}
