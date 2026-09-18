# Object Tracker

Web app for counting/tracking vehicles in a video: draw a region of interest (ROI) and a counting line, run YOLO detection + tracking over the clip, and get back an annotated result video plus per-vehicle crops. FastAPI backend, React (Vite) frontend, packaged as a local desktop app via a PowerShell launcher.

## How it works

1. Upload a video clip.
2. Draw the ROI and counting line on the first frame.
3. Pick a YOLO model (built-in `yolo11n/s/m/l/x`, or upload a custom `.pt`) and tune detection/adjustment params.
4. Run the job — backend streams live progress (SSE) while it processes frame by frame.
5. Review the result: annotated video, counts, and a gallery of cropped vehicle images.

Params can be saved/loaded as named presets (`backend/presets/`).

## Stack

- **Backend**: FastAPI + Ultralytics YOLO (detection/tracking) + OpenCV (video I/O, cropping, drawing). Job state is in-memory; uploads/results are kept on disk with the newest 5 auto-pruned.
- **Frontend**: React 19 + Vite. Canvas-based ROI/line drawing, live job status, results gallery.
- **Desktop packaging**: `ObjectTracker.ps1` starts the backend (serving the built frontend) and opens it in an app-mode Chrome window; `run_hidden.vbs` launches that without a console flash.

## Project layout

```
backend/
  main.py            FastAPI app: upload, jobs, models, presets endpoints
  bin/                openh264 DLL (H.264 encoding for OpenCV's VideoWriter)
  presets/            saved parameter presets (JSON)
  test_pipeline.py    pipeline smoke test
frontend/
  src/App.jsx         main flow (upload -> ROI -> run -> results)
  src/components/     ROI/line canvas, params panel, adjust panel, results view
  src/api.js          backend API client
tools/make_icon.py    generates assets/object-tracker.ico
ObjectTracker.ps1     desktop launcher (backend + app-mode Chrome window)
```

## Running locally

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install fastapi uvicorn python-multipart ultralytics opencv-python numpy pydantic
uvicorn main:app --reload --port 8010
```

YOLO checkpoints (`yolo11n.pt`, `yolo11s.pt`, ...) auto-download on first use of a given model id.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Desktop app (Windows)

Build the frontend (`npm run build` in `frontend/`), then run `ObjectTracker.ps1` — it starts uvicorn on port 8010 and opens the UI in a dedicated Chrome window.

## API

- `POST /upload` — upload a video, returns upload id + first-frame preview
- `GET /models`, `POST /models` — list/register YOLO models
- `GET /models/{model_id}/classes` — class names for a model
- `POST /jobs` — start a tracking job (ROI, line, model, params)
- `GET /jobs/{job_id}/stream` — live progress (SSE)
- `GET /jobs/{job_id}/result` — final result (video path, counts, crops)
- `POST /jobs/{job_id}/stop` — cancel a running job
- `GET/POST /presets` — saved parameter presets
