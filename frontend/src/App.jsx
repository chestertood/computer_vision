import { useState } from 'react'
import UploadStep from './components/UploadStep'
import LineCanvas from './components/LineCanvas'
import RoiCanvas from './components/RoiCanvas'
import ParamsPanel from './components/ParamsPanel'
import RunStatus from './components/RunStatus'
import ResultsView from './components/ResultsView'
import { createJob } from './api'
import './App.css'

const DEFAULT_CLASSES = ['car', 'truck', 'bus', 'motorcycle']

export default function App() {
  const [step, setStep] = useState('setup') // 'setup' | 'running' | 'results'
  const [videoData, setVideoData] = useState(null)
  const [params, setParams] = useState({ conf: 0.5, imgsz: 960, classes: DEFAULT_CLASSES, line_y: 0 })
  const [roi, setRoi] = useState(null)
  const [drawMode, setDrawMode] = useState('line') // 'line' | 'roi'
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
      const job = await createJob({ video_id: videoData.video_id, ...params, roi })
      setJobId(job.job_id)
      setResult(null)
      setStep('running')
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setStarting(false)
    }
  }

  function handleProgress(res) {
    setResult(res)
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

  const running = step === 'running'
  const canRun = Boolean(videoData) && params.classes.length > 0 && !starting && !running

  return (
    <div className="app">
      <section className="panel panel--params">
        <h2 className="panel__label">Parameter</h2>
        <div className="panel__body">
          <ParamsPanel
            conf={params.conf}
            imgsz={params.imgsz}
            classes={params.classes}
            onChange={setParams}
          />
          <button className="run-button" onClick={handleRun} disabled={!canRun}>
            {starting ? 'Starting…' : 'Run'}
          </button>
        </div>
      </section>

      <section className="panel panel--main">
        <h1 className="panel__label">Car Tracker</h1>
        <div className="panel__body panel__body--main">
          {!videoData && <UploadStep onUploaded={handleUploaded} />}

          {videoData && step !== 'results' && (
            <div className="setup-area">
              <div className={`preview-stack ${running ? 'preview-stack--locked' : ''}`}>
                <LineCanvas
                  imageUrl={videoData.preview_frame_url}
                  width={videoData.width}
                  height={videoData.height}
                  lineY={params.line_y}
                  onChange={(line_y) => setParams((p) => ({ ...p, line_y }))}
                />
                <RoiCanvas
                  width={videoData.width}
                  height={videoData.height}
                  roi={roi}
                  onChange={setRoi}
                  style={{ pointerEvents: drawMode === 'roi' && !running ? 'auto' : 'none' }}
                />
              </div>
              {!running && (
                <div className="draw-mode-toggle" role="radiogroup" aria-label="Draw mode">
                  <button
                    type="button"
                    aria-pressed={drawMode === 'line'}
                    className={drawMode === 'line' ? 'active' : ''}
                    onClick={() => setDrawMode('line')}
                  >
                    Line
                  </button>
                  <button
                    type="button"
                    aria-pressed={drawMode === 'roi'}
                    className={drawMode === 'roi' ? 'active' : ''}
                    onClick={() => setDrawMode('roi')}
                  >
                    ROI
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'results' && result?.output_video_url && (
            <video
              className="result-video"
              src={result.output_video_url}
              controls
              data-testid="result-video"
            />
          )}
        </div>
      </section>

      <section className="panel panel--result">
        <h2 className="panel__label">Result</h2>
        <div className="panel__body">
          {result ? (
            <ResultsView result={result} onReset={handleReset} />
          ) : (
            <p className="empty">No results yet.</p>
          )}
        </div>
      </section>

      <footer className="panel panel--footer">
        <div className="panel__body panel__body--footer">
          {errorMessage && <p role="alert">{errorMessage}</p>}
          {running && (
            <RunStatus jobId={jobId} onProgress={handleProgress} onDone={handleDone} onError={handleError} />
          )}
          {!errorMessage && !running && (
            <p className="empty">
              {videoData
                ? 'Drag the line on the preview, set parameters, then Run.'
                : 'Upload a clip to begin.'}
            </p>
          )}
        </div>
      </footer>
    </div>
  )
}
