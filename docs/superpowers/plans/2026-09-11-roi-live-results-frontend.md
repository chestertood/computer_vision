# ROI Crop, Live Results, and Stop (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a draggable ROI crop box, a Stop button, and live per-vehicle
result cards to the existing car-tracker frontend, per
`docs/superpowers/specs/2026-09-11-roi-live-results-design.md`.

**Architecture:** Two independent draggable overlays (existing `LineCanvas`
+ new `RoiCanvas`) stacked on the same preview image with a mode toggle
deciding which one receives pointer events. `RunStatus` polls the single
`/jobs/{id}/result` endpoint (now valid at any job status) and pushes every
tick up via `onProgress`, so `ResultsView` renders the same growing
`{counts, total, vehicles}` shape whether the job is running, stopped, or
done — no separate "live" component.

**Tech Stack:** React 19 + Vite (existing), no new dependencies.

## Global Constraints

- **Backend is NOT part of this plan.** Per the project's ownership split
  (user builds backend, Claude builds frontend — see spec's "Current state"
  section), the `roi` field on `POST /jobs`, the status-agnostic
  `/jobs/{id}/result`, and the new `POST /jobs/{id}/stop` endpoint are the
  user's implementation work. This plan only builds the frontend pieces that
  call those endpoints per the contract in the spec.
- **No automated frontend tests** — project convention (prior spec: "manual
  verification for this MVP, no test framework setup"; memory confirms this
  is a deliberate scope choice). Each task's test step is a manual
  `npm run dev` browser check, not an automated test file. The mechanical
  gate on every task is `npm run build` and `npm run lint` (oxlint) passing
  clean, matching the existing project convention.
- **No new dependencies, no router, no state library** (existing project
  constraint, unchanged by this spec).
- Reuse `App.css`'s existing tokens (`--accent`, `--border`, `--text-h`,
  `--code-bg`) for all new styles — no new colors/gradients (spec's "Visual
  design requirements").
- Work happens directly on `frontend/` — no worktree needed, single small
  feature, matches how the existing frontend was built.

---

## File Structure

| File | Change |
|---|---|
| `frontend/src/api.js` | Modify: `createJob` sends `roi`; add `stopJob(jobId)` |
| `frontend/src/components/RoiCanvas.jsx` | **New**: draggable rectangle overlay, mirrors `LineCanvas`'s drag pattern |
| `frontend/src/components/RunStatus.jsx` | Modify: poll `/result` only, add `onProgress`, add Stop button |
| `frontend/src/components/ResultsView.jsx` | Modify: render live/final status + vehicle-card gallery |
| `frontend/src/App.jsx` | Modify: `roi` + `drawMode` state, stack the two canvases, wire `onProgress`, lock overlays while running |
| `frontend/src/App.css` | Modify: `.preview-stack`, `.draw-mode-toggle`, `.stop-button`, `.vehicle-gallery`/`.vehicle-card` |

---

## Task 1: `api.js` — `roi` in `createJob`, new `stopJob`

**Files:**
- Modify: `frontend/src/api.js:24-31`

**Interfaces:**
- Produces: `createJob({ video_id, conf, imgsz, classes, line_y, roi })` (roi
  may be `null`) — unchanged return shape `{job_id, status}`.
- Produces: `stopJob(jobId)` → `Promise<{status: string}>`.

- [ ] **Step 1: Update `createJob` to accept and send `roi`**

Replace the existing function:

```javascript
export async function createJob({ video_id, conf, imgsz, classes, line_y, roi }) {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id, conf, imgsz, classes, line_y, roi }),
  })
  return parseOrThrow(res)
}
```

- [ ] **Step 2: Add `stopJob`**

Add below `getJobResult`:

```javascript
export async function stopJob(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/stop`, { method: 'POST' })
  return parseOrThrow(res)
}
```

- [ ] **Step 3: Manual check**

Run: `npm run build` (from `frontend/`)
Expected: builds clean, no type/lint errors. (No backend exists yet to hit
these endpoints against — that's exercised in Task 5's manual check once
the full flow is wired.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add roi to createJob, add stopJob"
```

---

## Task 2: `RoiCanvas` component

**Files:**
- Create: `frontend/src/components/RoiCanvas.jsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `export function normalizeRoi(x1, y1, x2, y2) -> {x1, y1, x2, y2}`
  (always returns top-left/bottom-right ordered, mirrors `LineCanvas`'s
  exported `clampLineY` helper pattern).
- Produces: `export default function RoiCanvas({ width, height, roi, onChange, style })`
  — `roi` is `{x1,y1,x2,y2}` or `null`; `onChange(roi)` fires on every drag
  step, same calling convention as `LineCanvas`'s `onChange(lineY)`. `style`
  is merged onto the canvas's own inline style (used by Task 5 to toggle
  `pointerEvents` based on draw mode — the only mechanism for that, so
  `App.jsx` must pass it).

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useRef } from 'react'

export function normalizeRoi(x1, y1, x2, y2) {
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  }
}

function clampPoint(x, y, width, height) {
  return {
    x: Math.round(Math.min(Math.max(x, 0), width)),
    y: Math.round(Math.min(Math.max(y, 0), height)),
  }
}

export default function RoiCanvas({ width, height, roi, onChange, style }) {
  const canvasRef = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    if (!roi) return
    ctx.strokeStyle = '#2ecc71'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 6])
    ctx.strokeRect(roi.x1, roi.y1, roi.x2 - roi.x1, roi.y2 - roi.y1)
  }, [roi, width, height])

  function pointFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = height / rect.height
    return clampPoint((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY, width, height)
  }

  function handlePointerDown(e) {
    const p = pointFromEvent(e)
    startRef.current = p
    onChange(normalizeRoi(p.x, p.y, p.x, p.y))
  }
  function handlePointerMove(e) {
    if (!startRef.current) return
    const p = pointFromEvent(e)
    onChange(normalizeRoi(startRef.current.x, startRef.current.y, p.x, p.y))
  }
  function handlePointerUp() {
    startRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="roi-canvas"
      width={width}
      height={height}
      className="roi-canvas"
      style={{ cursor: 'crosshair', touchAction: 'none', ...style }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  )
}
```

Note: a fresh drag anywhere redefines the whole box (no corner-handle
resize) — same interaction simplicity as the existing single-line drag, per
spec's "one static rectangle" scope.

- [ ] **Step 2: Manual check**

Run: `npm run build`
Expected: builds clean. Component isn't wired into `App.jsx` yet (Task 4),
so no visual check until then.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RoiCanvas.jsx
git commit -m "feat: add RoiCanvas draggable ROI overlay"
```

---

## Task 3: `RunStatus` — poll `/result` only, add `onProgress` + Stop

**Files:**
- Modify: `frontend/src/components/RunStatus.jsx` (full rewrite)

**Interfaces:**
- Consumes: `stopJob(jobId)`, `getJobResult(jobId)` from `api.js` (Task 1).
- Produces: `<RunStatus jobId onProgress(result) onDone(result) onError(message) />`
  — `onProgress` fires every poll tick regardless of status; `onDone` fires
  once when `status` is `done` or `stopped`; `onError` fires once when
  `status` is `error` or the request throws. This replaces the previous
  `getJob` + `getJobResult` two-call pattern — the new `/result` contract
  (spec) returns `status` itself, so one call per tick is enough.

- [ ] **Step 1: Rewrite the component**

```jsx
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
```

The `finished` flag is set right before each terminal callback fires
(matches the existing double-callback-race guard from the prior
`RunStatus`, per git history — don't regress that fix).

- [ ] **Step 2: Manual check**

Run: `npm run build`
Expected: builds clean. `App.jsx` still passes the old prop names until
Task 4 — full behavior check happens there.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RunStatus.jsx
git commit -m "feat: RunStatus polls /result only, adds onProgress and Stop"
```

---

## Task 4: `ResultsView` — live/final status + vehicle gallery

**Files:**
- Modify: `frontend/src/components/ResultsView.jsx` (full rewrite)

**Interfaces:**
- Consumes: `result = {status, counts, total, vehicles}` (from spec's
  `/result` response shape; `vehicles` is `[{type, image_b64, ts}]`).
- Produces: `<ResultsView result onReset />` — same prop names as before,
  `onReset` only rendered once `status` is `done`/`stopped`/`error`.

- [ ] **Step 1: Rewrite the component**

```jsx
const STATUS_LABEL = {
  queued: 'Queued…',
  running: 'Running…',
  stopped: 'Stopped',
  done: 'Done',
  error: 'Error',
}

export default function ResultsView({ result, onReset }) {
  const { status, counts, total, vehicles = [] } = result
  const finished = status === 'done' || status === 'stopped' || status === 'error'

  return (
    <div className="results-view">
      <p className="results-view__status">{STATUS_LABEL[status] || status}</p>
      <table>
        <tbody>
          {Object.entries(counts).map(([name, count]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{count}</td>
            </tr>
          ))}
          <tr>
            <td><strong>Total</strong></td>
            <td><strong>{total}</strong></td>
          </tr>
        </tbody>
      </table>
      {vehicles.length > 0 && (
        <ul className="vehicle-gallery">
          {vehicles.map((v) => (
            <li key={v.ts} className="vehicle-card">
              <img src={`data:image/jpeg;base64,${v.image_b64}`} alt={v.type} />
              <span>{v.type}</span>
            </li>
          ))}
        </ul>
      )}
      {finished && <button onClick={onReset}>Run another</button>}
    </div>
  )
}
```

`vehicles` only grows per the spec's contract, so keying by `v.ts` is stable
across re-renders (two vehicles crossing at the exact same timestamp is not
a real scenario — frame-rate-limited).

- [ ] **Step 2: Manual check**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ResultsView.jsx
git commit -m "feat: ResultsView shows live status and vehicle gallery"
```

---

## Task 5: `App.jsx` wiring — ROI state, draw-mode toggle, progress plumbing

**Files:**
- Modify: `frontend/src/App.jsx` (full rewrite)

**Interfaces:**
- Consumes: `RoiCanvas` (Task 2), `RunStatus`'s new props (Task 3),
  `ResultsView` (Task 4, unchanged prop names), `createJob` with `roi`
  (Task 1).

- [ ] **Step 1: Rewrite `App.jsx`**

```jsx
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
                  style={{ pointerEvents: drawMode === 'roi' ? 'auto' : 'none' }}
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
```

Design notes for the reviewer:
- `RoiCanvas` sits on top of `LineCanvas` via CSS (Task 6) with
  `pointer-events` toggled by `drawMode`, so only one canvas drags at a
  time even though both are visible together.
- `.preview-stack--locked` (Task 6) disables pointer events on both
  canvases while `running`, so a job's fixed params can't be edited
  mid-run — the drag-mode toggle itself is hidden in that state too (the
  `{!running && ...}` guard above).
- `step === 'results' && result?.output_video_url` (was
  `step === 'results' && result`) — guards against rendering a `<video>`
  with an empty `src` in case a `stopped` job's final snapshot has no
  output video yet; harmless either way but more correct.

- [ ] **Step 2: Manual check — full flow**

Run: `npm run dev` (from `frontend/`), open the printed localhost URL.
1. Upload a clip → preview image appears.
2. With "Line" mode active (default), drag on the preview → red line moves.
3. Click "ROI" → drag a rectangle → dashed green box appears; dragging on
   the same area no longer moves the line.
4. Click back to "Line" → confirm the line drags again and the ROI box
   stays put.

Expected: both shapes independently settable, no console errors. (No
backend yet, so Run itself will fail against `http://localhost:8000` with a
network error in the footer — that's expected until the user's backend
exists; this step only verifies the drawing/mode-toggle UI.)

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: wire ROI state, draw-mode toggle, and live progress into App"
```

---

## Task 6: Styles — `.preview-stack`, mode toggle, Stop button, vehicle gallery

**Files:**
- Modify: `frontend/src/App.css` (append)

**Interfaces:**
- Consumes: class names referenced in Tasks 2-5
  (`.preview-stack`, `.preview-stack--locked`, `.roi-canvas`,
  `.draw-mode-toggle`, `.stop-button`, `.vehicle-gallery`, `.vehicle-card`,
  `.results-view__status`).

- [ ] **Step 1: Apply the `frontend-design` skill to these four new visual
  pieces** (draw-mode toggle, ROI overlay stroke, Stop button, vehicle
  gallery cards) before writing final CSS — per the spec's "Visual design
  requirements": reuse existing tokens, no new colors/gradients, Stop must
  read as danger-but-same-button-family as Run, ROI stroke must be visually
  distinct from the line's solid red stroke (already dashed green in Task
  2's canvas code — confirm this reads clearly against typical road-camera
  footage, adjust the stroke color in `RoiCanvas.jsx` if the design pass
  says otherwise), gallery cards must look native to `.panel__body`, not
  bolted on.

- [ ] **Step 2: Add the CSS**

Append to `App.css`:

```css
/* Preview stack (line + ROI overlays) */

.setup-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.preview-stack {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.preview-stack canvas {
  display: block;
  max-width: 100%;
  max-height: 60svh;
  border-radius: 8px;
}

.preview-stack .roi-canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.preview-stack--locked canvas {
  pointer-events: none;
}

.draw-mode-toggle {
  display: flex;
  gap: 8px;
}

.draw-mode-toggle button {
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  color: var(--text-h);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
}

.draw-mode-toggle button.active {
  background: var(--accent);
  border-color: var(--accent-border);
  color: #fff;
}

/* Stop button */

.stop-button {
  padding: 8px 16px;
  font: inherit;
  font-size: 14px;
  color: #fff;
  background: #b4232c;
  border: 1px solid #8f1c23;
  border-radius: 8px;
  cursor: pointer;
}

.stop-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Results: status + vehicle gallery */

.results-view__status {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
  margin: 0 0 8px;
}

.vehicle-gallery {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
}

.vehicle-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--code-bg);
  font-size: 11px;
  text-transform: capitalize;
}

.vehicle-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 4px;
}
```

Pointer-events toggling is done inline via the `style` prop `RoiCanvas`
already accepts (Task 2) and `App.jsx` already passes (Task 5) —
`pointerEvents: drawMode === 'roi' ? 'auto' : 'none'`. No CSS selector
needed for it; the CSS above only positions the overlay.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, repeat Task 5's manual flow, then also:
1. Start a run, confirm the Stop button is red/distinct from Run and the
   line/ROI overlays stop responding to drags while running.
2. Once a job produces at least one `vehicles` entry (needs the user's
   backend running — otherwise skip this specific check and note it as
   pending backend), confirm cards render as a grid inside the result
   panel without pushing the counts table around awkwardly.

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.css frontend/src/App.jsx frontend/src/components/RoiCanvas.jsx
git commit -m "style: preview stack, draw-mode toggle, stop button, vehicle gallery"
```

---

## Not in this plan (user's backend work, per spec)

Tracked here so it isn't lost, not executed by this plan:

- `POST /jobs` accepting `roi: {x1,y1,x2,y2}` and filtering detections by it.
- `GET /jobs/{id}/result` returning `{status, counts, total, vehicles}` at
  any status, not just `done`.
- `POST /jobs/{id}/stop` setting a cancel flag the pipeline loop checks.
- Per-crossing vehicle crop → resize (~160px) → base64 → append to job's
  `vehicles` list.

Full detail in `docs/superpowers/specs/2026-09-11-roi-live-results-design.md`.

## Self-Review Notes

- **Spec coverage:** ROI drawing (Task 2, 5), Stop button + semantics
  (Task 3, 6), live polling of `/result` (Task 3), vehicle gallery (Task 4,
  6), visual design constraints (Task 6 Step 1). Backend items explicitly
  excluded and listed above. Covered.
- **Type consistency:** `RoiCanvas`'s `onChange(roi)` matches `LineCanvas`'s
  `onChange(lineY)` convention; `RunStatus`'s `onProgress`/`onDone`/
  `onError` names match what `App.jsx` (Task 5) passes; `ResultsView`'s
  `result` shape (`status, counts, total, vehicles`) matches what
  `RunStatus` receives from `getJobResult` and forwards unchanged.
- **Placeholder scan:** none found — every step has runnable code or an
  explicit manual-check script.
