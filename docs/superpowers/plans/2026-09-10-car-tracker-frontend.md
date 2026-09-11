# Car Tracker Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React (Vite) frontend described in `docs/superpowers/specs/2026-09-10-web-frontend-design.md` — upload a clip, set detect/track/count/classify params on a draggable-line preview, run a job, poll status, show the result video + counts. Backend is out of scope here (owned separately by the user) — this plan builds the frontend against the API contract the spec already fixed.

**Architecture:** Single-page app, no router, local component state only (no Redux/context needed — one linear flow: setup → running → results). Plain `fetch` in a small `api.js` client module, no axios.

**Tech Stack:** React 18 + Vite, plain CSS, native `fetch`, native `<canvas>` for the line-drag UI. No test framework (see constraint below), no UI component library, no state-management library.

## Global Constraints

Copied verbatim from the approved spec (`docs/superpowers/specs/2026-09-10-web-frontend-design.md`) — every task implicitly follows these:

- API contract (frontend must match exactly):
  - `POST /upload` (multipart, field `file`) → `{video_id, width, height, preview_frame_url}`
  - `POST /jobs` body `{video_id, conf, imgsz, classes[], line_y}` → `{job_id, status: "queued"}`
  - `GET /jobs/{job_id}` → `{status: queued|running|done|error, error_message?}`
  - `GET /jobs/{job_id}/result` → `{output_video_url, counts: {car: N, truck: N, ...}, total: N}`
- Vehicle classes the UI must expose: `bicycle`, `car`, `motorcycle`, `bus`, `truck`.
- Counting line is a single horizontal line (not the old two-line band), user-draggable on the frame-0 preview.
- "Frontend: manual verification for this MVP, no test framework setup." — **this plan deliberately has no automated frontend tests.** Each task's verification step is `npm run build` (catches syntax/import/JSX errors deterministically) plus a manual browser check description.
- Frontend disables the Run button while a job is in flight, and shows an error banner on any 4xx/5xx response or `status: error`.
- No persistence requirement, no auth, local-only use.
- API base URL must be configurable (`VITE_API_BASE` env var), defaulting to `http://localhost:8000`, since the backend is being built separately.

---

### Task 1: Project scaffold + base App shell

**Files:**
- Create: `frontend/` (Vite React scaffold — `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/App.css`, `src/index.css`)
- Create: `.gitignore` (project root)

**Interfaces:**
- Produces: `App` default export (React component) rendered at `#root`, currently just a heading — later tasks build on top of this.

- [ ] **Step 1: Scaffold the Vite project**

Run from the project root (`car_tracker/`):

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
```

- [ ] **Step 2: Init git at the project root (none exists yet) and add a .gitignore**

```bash
cd ..
git init
```

Create `.gitignore` at `car_tracker/.gitignore`:

```
node_modules/
frontend/dist/
.venv/
backend/.venv/
__pycache__/
*.pyc
backend/outputs/
*.mp4
*.pt
backend/car_*.jpg
```

- [ ] **Step 3: Clean up the default Vite template and set the title**

Edit `frontend/index.html` — change:
```html
<title>Vite + React</title>
```
to:
```html
<title>Car Tracker</title>
```

Replace `frontend/src/App.jsx` with:

```jsx
export default function App() {
  return (
    <div className="app">
      <h1>Car Tracker</h1>
    </div>
  )
}
```

Replace `frontend/src/App.css` with an empty file (delete the default logo/animation CSS — not needed).

Delete `frontend/src/assets/react.svg` and the `public/vite.svg` reference is fine to leave (default favicon).

- [ ] **Step 4: Verify it builds**

Run: `npm run build` (from `frontend/`)
Expected: exits 0, prints `✓ built in ...`, no errors.

- [ ] **Step 5: Manual check**

Run `npm run dev`, open the printed local URL in a browser, confirm the page shows "Car Tracker" and nothing else. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add .gitignore frontend
git commit -m "chore: scaffold Vite React frontend"
```

---

### Task 2: API client module

**Files:**
- Create: `frontend/src/api.js`

**Interfaces:**
- Consumes: nothing (talks directly to `fetch`)
- Produces (used by every later task):
  - `uploadVideo(file: File) => Promise<{video_id, width, height, preview_frame_url}>`
  - `createJob({video_id, conf, imgsz, classes, line_y}) => Promise<{job_id, status}>`
  - `getJob(jobId: string) => Promise<{status, error_message?}>`
  - `getJobResult(jobId: string) => Promise<{output_video_url, counts, total}>`
  - All four reject with `Error(message)` on a non-OK response, where `message` is the backend's `detail` field if present, else `"Request failed (<status>)"`.

- [ ] **Step 1: Write the module**

```js
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

export async function createJob({ video_id, conf, imgsz, classes, line_y }) {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id, conf, imgsz, classes, line_y }),
  })
  return parseOrThrow(res)
}

export async function getJob(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`)
  return parseOrThrow(res)
}

export async function getJobResult(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/result`)
  return parseOrThrow(res)
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add API client module"
```

---

### Task 3: UploadStep component

**Files:**
- Create: `frontend/src/components/UploadStep.jsx`

**Interfaces:**
- Consumes: `uploadVideo` from `../api` (Task 2)
- Produces: `UploadStep` default export, props `{ onUploaded: (videoData) => void }` where `videoData` is the `{video_id, width, height, preview_frame_url}` shape from `uploadVideo`.

- [ ] **Step 1: Write the component**

```jsx
import { useState } from 'react'
import { uploadVideo } from '../api'

export default function UploadStep({ onUploaded }) {
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)

  async function handleChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const data = await uploadVideo(file)
      onUploaded(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="upload-step">
      <label htmlFor="clip-input">Upload a clip</label>
      <input
        id="clip-input"
        type="file"
        accept="video/*"
        onChange={handleChange}
        disabled={uploading}
      />
      {uploading && <p role="status">Uploading…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual check**

Temporarily render `<UploadStep onUploaded={(d) => console.log(d)} />` in `App.jsx`, run `npm run dev`. Without a backend running, picking a file will show the error banner (fetch failure) — confirm the alert text appears and the input re-enables. This is expected at this stage; full wiring happens in Task 8 once a backend exists. Revert the temporary `App.jsx` change (Task 1's version) before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/UploadStep.jsx
git commit -m "feat: add UploadStep component"
```

---

### Task 4: LineCanvas component

**Files:**
- Create: `frontend/src/components/LineCanvas.jsx`

**Interfaces:**
- Consumes: nothing external
- Produces:
  - Named export `clampLineY(y: number, height: number) => number` — clamps/rounds a raw Y coordinate to `[0, height]`.
  - Default export `LineCanvas`, props `{ imageUrl: string, width: number, height: number, lineY: number, onChange: (newLineY: number) => void }`. Draws `imageUrl` scaled to `width`x`height` on a canvas with a horizontal red line at `lineY`; dragging (pointerdown+move) calls `onChange` with the new clamped Y.

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useRef } from 'react'

export function clampLineY(y, height) {
  if (y < 0) return 0
  if (y > height) return height
  return Math.round(y)
}

export default function LineCanvas({ imageUrl, width, height, lineY, onChange }) {
  const canvasRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      drawLine(ctx, width, lineY)
    }
    img.src = imageUrl
  }, [imageUrl, width, height, lineY])

  function drawLine(ctx, w, y) {
    ctx.strokeStyle = 'red'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  function yFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const scale = height / rect.height
    return clampLineY((e.clientY - rect.top) * scale, height)
  }

  function handlePointerDown(e) {
    draggingRef.current = true
    onChange(yFromEvent(e))
  }
  function handlePointerMove(e) {
    if (!draggingRef.current) return
    onChange(yFromEvent(e))
  }
  function handlePointerUp() {
    draggingRef.current = false
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="line-canvas"
      width={width}
      height={height}
      style={{ maxWidth: '100%', cursor: 'ns-resize', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual check**

Temporarily render in `App.jsx`:
```jsx
<LineCanvas imageUrl="/vite.svg" width={300} height={200} lineY={100}
  onChange={(y) => console.log('line_y', y)} />
```
Run `npm run dev`, confirm the image draws with a red horizontal line, and dragging up/down logs changing `line_y` values in the console clamped to `[0, 200]`. Revert the temporary `App.jsx` change before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/LineCanvas.jsx
git commit -m "feat: add LineCanvas draggable counting-line component"
```

---

### Task 5: ParamsPanel component

**Files:**
- Create: `frontend/src/components/ParamsPanel.jsx`

**Interfaces:**
- Consumes: nothing external
- Produces:
  - Named exports `CLASS_OPTIONS = ['bicycle', 'car', 'motorcycle', 'bus', 'truck']` and `IMGSZ_OPTIONS = [640, 960, 1280]`.
  - Default export `ParamsPanel`, props `{ conf: number, imgsz: number, classes: string[], onChange: (newParams: {conf, imgsz, classes}) => void }`. Every control change calls `onChange` with the full merged `{conf, imgsz, classes}` object (not a partial patch).

- [ ] **Step 1: Write the component**

```jsx
export const CLASS_OPTIONS = ['bicycle', 'car', 'motorcycle', 'bus', 'truck']
export const IMGSZ_OPTIONS = [640, 960, 1280]

export default function ParamsPanel({ conf, imgsz, classes, onChange }) {
  function update(patch) {
    onChange({ conf, imgsz, classes, ...patch })
  }

  function toggleClass(name) {
    const next = classes.includes(name)
      ? classes.filter((c) => c !== name)
      : [...classes, name]
    update({ classes: next })
  }

  return (
    <fieldset className="params-panel">
      <legend>Detection parameters</legend>
      <label>
        Confidence: {conf.toFixed(2)}
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
        Image size:
        <select
          value={imgsz}
          onChange={(e) => update({ imgsz: parseInt(e.target.value, 10) })}
        >
          {IMGSZ_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
      <div className="class-checkboxes">
        {CLASS_OPTIONS.map((name) => (
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
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual check**

Temporarily render in `App.jsx`:
```jsx
<ParamsPanel conf={0.5} imgsz={960} classes={['car']}
  onChange={(p) => console.log(p)} />
```
Run `npm run dev`, move the slider, change the select, toggle checkboxes — confirm the console logs a full `{conf, imgsz, classes}` object each time with correct values. Revert the temporary `App.jsx` change before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ParamsPanel.jsx
git commit -m "feat: add ParamsPanel component"
```

---

### Task 6: RunStatus component

**Files:**
- Create: `frontend/src/components/RunStatus.jsx`

**Interfaces:**
- Consumes: `getJob`, `getJobResult` from `../api` (Task 2)
- Produces: `RunStatus` default export, props `{ jobId: string, onDone: (result) => void, onError: (message: string) => void }`. Polls `getJob(jobId)` every 1500ms; on `status: "done"` fetches `getJobResult(jobId)` and calls `onDone(result)`; on `status: "error"` calls `onError(job.error_message || 'Job failed')`; on any fetch rejection calls `onError(err.message)`. Stops polling once it calls `onDone`/`onError`, and on unmount.

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useState } from 'react'
import { getJob, getJobResult } from '../api'

const POLL_MS = 1500

export default function RunStatus({ jobId, onDone, onError }) {
  const [status, setStatus] = useState('queued')

  useEffect(() => {
    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const job = await getJob(jobId)
        if (cancelled) return
        setStatus(job.status)
        if (job.status === 'done') {
          clearInterval(interval)
          const result = await getJobResult(jobId)
          if (!cancelled) onDone(result)
        } else if (job.status === 'error') {
          clearInterval(interval)
          onError(job.error_message || 'Job failed')
        }
      } catch (err) {
        if (cancelled) return
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
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual check**

This component needs a real or stub backend to poll — defer full manual verification to Task 8's end-to-end check once the whole app is wired and a backend (built separately) is available. For now, confirm only that it renders `Status: queued` with no console errors when given a fake `jobId` and no-op callbacks.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RunStatus.jsx
git commit -m "feat: add RunStatus polling component"
```

---

### Task 7: ResultsView component

**Files:**
- Create: `frontend/src/components/ResultsView.jsx`

**Interfaces:**
- Consumes: nothing external
- Produces: `ResultsView` default export, props `{ result: {output_video_url, counts, total}, onReset: () => void }`.

- [ ] **Step 1: Write the component**

```jsx
export default function ResultsView({ result, onReset }) {
  const { output_video_url, counts, total } = result
  return (
    <div className="results-view">
      <video src={output_video_url} controls width="480" data-testid="result-video" />
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
      <button onClick={onReset}>Run another</button>
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual check**

Temporarily render in `App.jsx`:
```jsx
<ResultsView
  result={{ output_video_url: '/vite.svg', counts: { car: 3, truck: 1 }, total: 4 }}
  onReset={() => console.log('reset')}
/>
```
Run `npm run dev`, confirm the counts table and total render correctly and clicking "Run another" logs `reset`. Revert the temporary `App.jsx` change before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ResultsView.jsx
git commit -m "feat: add ResultsView component"
```

---

### Task 8: Wire the full App flow + README

**Files:**
- Modify: `frontend/src/App.jsx`
- Create: `frontend/README.md`

**Interfaces:**
- Consumes: `UploadStep` (Task 3), `LineCanvas` (Task 4), `ParamsPanel` (Task 5), `RunStatus` (Task 6), `ResultsView` (Task 7), `createJob` (Task 2)
- Produces: the complete `App` — no further consumers, this is the top of the tree.

- [ ] **Step 1: Write the full App**

```jsx
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
```

- [ ] **Step 2: Write the README**

Create `frontend/README.md`:

```markdown
# Car Tracker Frontend

React (Vite) UI for the car tracker pipeline. Talks to a FastAPI backend
implementing the contract in `../docs/superpowers/specs/2026-09-10-web-frontend-design.md`.

## Run

    npm install
    npm run dev

Defaults to a backend at `http://localhost:8000`. Override with:

    VITE_API_BASE=http://localhost:9000 npm run dev

## Backend requirements

- Must implement `POST /upload`, `POST /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/result` exactly as specced.
- Must enable CORS for the Vite dev origin (`http://localhost:5173` by default) — e.g. FastAPI's `CORSMiddleware`.
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: End-to-end manual check (requires a running backend)**

Once a backend implementing the spec's contract is available: run it, then run `npm run dev` in `frontend/`, open the browser, and walk the full flow — upload a clip, drag the line, adjust params, click Run, watch status poll to `done`, confirm the output video plays and counts display. If the backend isn't ready yet, this step is deferred — the app is still complete and buildable per Step 3.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/README.md
git commit -m "feat: wire full upload -> run -> results flow"
```
