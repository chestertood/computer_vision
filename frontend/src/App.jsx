import { useState } from 'react'
import UploadStep from './components/UploadStep'
import LineCanvas from './components/LineCanvas'
import ParamsPanel from './components/ParamsPanel'
import RunStatus from './components/RunStatus'
import ResultsView from './components/ResultsView'
import { createJob } from './api'

const DEFAULT_CLASSES = ['car', 'truck', 'bus', 'motorcycle']

export default function App() {
  const [step, setStep] = useState('setup') // 'setup' | 'running' | 'results'
  const [videoData, setVideoData] = useState(null)
  const [params, setParams] = useState({ conf: 0.5, imgsz: 960, classes: DEFAULT_CLASSES, line_y: 0 })
  const [jobId, setJobId] = useState(null)
  const [result, setResult] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [starting, setStarting] = useState(false)

  function handleUploaded(data) {
    setVideoData(data)
    setParams((p) => ({ ...p, line_y: Math.round(data.height / 2) }))
  }

  async function handleRun() {
    setStarting(true)
    setErrorMessage(null)
    try {
      const job = await createJob({ video_id: videoData.video_id, ...params })
      setJobId(job.job_id)
      setStep('running')
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setStarting(false)
    }
  }

  function handleDone(res) {
    setResult(res)
    setStep('results')
  }

  function handleError(message) {
    setErrorMessage(message)
    setStep('setup')
  }

  function handleReset() {
    setStep('setup')
    setResult(null)
    setJobId(null)
  }

  return (
    <div className="app">
      <h1>Car Tracker</h1>
      {errorMessage && <p role="alert">{errorMessage}</p>}

      {step === 'setup' && !videoData && <UploadStep onUploaded={handleUploaded} />}

      {step === 'setup' && videoData && (
        <>
          <LineCanvas
            imageUrl={videoData.preview_frame_url}
            width={videoData.width}
            height={videoData.height}
            lineY={params.line_y}
            onChange={(line_y) => setParams((p) => ({ ...p, line_y }))}
          />
          <ParamsPanel
            conf={params.conf}
            imgsz={params.imgsz}
            classes={params.classes}
            onChange={setParams}
          />
          <button onClick={handleRun} disabled={starting || params.classes.length === 0}>
            {starting ? 'Starting…' : 'Run'}
          </button>
        </>
      )}

      {step === 'running' && (
        <RunStatus jobId={jobId} onDone={handleDone} onError={handleError} />
      )}

      {step === 'results' && result && (
        <ResultsView result={result} onReset={handleReset} />
      )}
    </div>
  )
}
