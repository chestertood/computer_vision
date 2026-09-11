import { useEffect, useRef, useState } from 'react'
import { getJobResult, stopJob } from '../api'

const POLL_MS = 1500
const DONE_STATUSES = ['done', 'stopped']

export default function RunStatus({ jobId, onProgress, onDone, onError }) {
  const [status, setStatus] = useState('queued')
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState(null)

  const finishedRef = useRef(false)
  const onProgressRef = useRef(onProgress)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)

  useEffect(() => { onProgressRef.current = onProgress }, [onProgress])
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    let cancelled = false
    finishedRef.current = false
    const interval = setInterval(async () => {
      if (finishedRef.current) return
      try {
        const result = await getJobResult(jobId)
        if (cancelled || finishedRef.current) return
        setStatus(result.status)
        setStopError(null)
        onProgressRef.current(result)
        if (result.status === 'error') {
          finishedRef.current = true
          clearInterval(interval)
          onErrorRef.current(result.error_message || 'Job failed')
        } else if (DONE_STATUSES.includes(result.status)) {
          finishedRef.current = true
          clearInterval(interval)
          onDoneRef.current(result)
        }
      } catch (err) {
        if (cancelled || finishedRef.current) return
        finishedRef.current = true
        clearInterval(interval)
        onErrorRef.current(err.message)
      }
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [jobId])

  async function handleStop() {
    setStopping(true)
    setStopError(null)
    try {
      await stopJob(jobId)
    } catch (err) {
      // The cancel request failed, but the job itself is very likely still
      // running on the backend — don't treat this as terminal. Keep polling
      // so the job can still reach a real terminal state or the user can retry.
      setStopError(err.message)
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
      {stopError && <p className="stop-error" role="alert">Stop failed: {stopError}</p>}
    </div>
  )
}
