import { useEffect, useRef, useState } from 'react'
import { getJobResult, stopJob } from '../api'

const POLL_MS = 1500
const DONE_STATUSES = ['done', 'stopped']

export default function RunStatus({ jobId, onProgress, onDone, onError }) {
  const [status, setStatus] = useState('queued')
  const [stopping, setStopping] = useState(false)

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
    try {
      await stopJob(jobId)
    } catch (err) {
      if (!finishedRef.current) {
        finishedRef.current = true
        onError(err.message)
      }
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
