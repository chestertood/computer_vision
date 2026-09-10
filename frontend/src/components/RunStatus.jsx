import { useEffect, useState } from 'react'
import { getJob, getJobResult } from '../api'

const POLL_MS = 1500

export default function RunStatus({ jobId, onDone, onError }) {
  const [status, setStatus] = useState('queued')

  useEffect(() => {
    let cancelled = false
    let done = false
    const interval = setInterval(async () => {
      if (done) return
      try {
        const job = await getJob(jobId)
        if (cancelled) return
        if (done) return
        setStatus(job.status)
        if (job.status === 'done') {
          clearInterval(interval)
          const result = await getJobResult(jobId)
          if (cancelled || done) return
          done = true
          onDone(result)
        } else if (job.status === 'error') {
          done = true
          clearInterval(interval)
          onError(job.error_message || 'Job failed')
        }
      } catch (err) {
        if (cancelled || done) return
        done = true
        clearInterval(interval)
        onError(err.message)
      }
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [jobId, onDone, onError])

  return (
    <div className="run-status" role="status">
      <p>Status: {status}</p>
    </div>
  )
}
