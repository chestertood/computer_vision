import { useEffect, useState } from 'react'
import { getJobResult, stopJob } from '../api'

const POLL_MS = 1500
const TERMINAL = ['done', 'stopped', 'error']

export default function RunStatus({ jobId, onProgress, onDone, onError }) {
  const [status, setStatus] = useState('queued')
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    let cancelled = false
    let finished = false
    const interval = setInterval(async () => {
      if (finished) return
      try {
        const result = await getJobResult(jobId)
        if (cancelled || finished) return
        setStatus(result.status)
        onProgress(result)
        if (result.status === 'error') {
          finished = true
          onError(result.error_message || 'Job failed')
        } else if (TERMINAL.includes(result.status)) {
          finished = true
          onDone(result)
        }
      } catch (err) {
        if (cancelled || finished) return
        finished = true
        onError(err.message)
      }
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [jobId, onProgress, onDone, onError])

  async function handleStop() {
    setStopping(true)
    try {
      await stopJob(jobId)
    } catch (err) {
      onError(err.message)
    } finally {
      setStopping(false)
    }
  }

  const canStop = status === 'queued' || status === 'running'

  return (
    <div className="run-status" role="status">
      <p>Status: {status}</p>
      <button className="stop-button" onClick={handleStop} disabled={!canStop || stopping}>
        {stopping ? 'Stopping…' : 'Stop'}
      </button>
    </div>
  )
}
