# Web frontend for car tracker pipeline

Date: 2026-09-10

## Goal

Let the user (via browser) upload a clip, set detection/tracking/counting
parameters, run the existing detect→track→count→classify pipeline, and view
the annotated output video plus per-class counts — instead of editing
constants in `backend/main.py` and running it as a script.

## Current state (as of this spec)

`backend/main.py` does full-frame YOLO detect + `model.track()` (Ultralytics
built-in tracker) + a hardcoded two-line-band counter (`line_y`/`line_y2`) +
saves a crop image per newly-seen track ID. No speed calc, no CSV, no API,
no frontend. `frontend/` exists but is empty. `backend/src/` holds two sample
clips. Two model weights present: `yolo11n.pt`, `yolo11s.pt`.

"Classify" in this spec means vehicle-type classification only (the YOLO/COCO
class the detector already assigns — car/truck/bus/motorcycle/bicycle),
surfaced as per-class counts. Not make/model/color classification.

## Architecture

```
React (Vite) frontend  <--REST/JSON-->  FastAPI backend
  - Upload page                           - POST /upload
  - Params panel + line-drag canvas        - POST /jobs
  - Run/status polling                     - GET  /jobs/{id}
  - Results view (video + stats)           - GET  /jobs/{id}/result
                                            - background task runs pipeline
```

Single-user, local only, no auth, no database. Job state lives in-memory
(dict) in the FastAPI process; inputs/outputs live on disk under
`backend/src/` and `backend/outputs/`. Restarting the backend loses
in-flight/finished job state (acceptable for local dev use — no persistence
requirement given).

Pipeline logic is extracted out of the current `main.py` script into a plain
callable function, e.g. `run_pipeline(video_path, conf, imgsz, classes,
line_y, output_path) -> dict`, so the API layer calls it with request params
instead of the script's hardcoded constants. `main.py` as a standalone script
can stay or get deleted once the function is extracted — not decided here,
call it during implementation.

## API contract / data flow

1. `POST /upload` (multipart file) — saves clip to
   `backend/src/{video_id}.mp4`, extracts frame 0 as an image. Returns
   `{video_id, width, height, preview_frame_url}`.
2. Frontend renders frame 0 on a `<canvas>`; user drags a single horizontal
   counting line, sets confidence + imgsz, checks which vehicle classes to
   detect (car/truck/bus/motorcycle/bicycle).
3. `POST /jobs` body `{video_id, conf, imgsz, classes[], line_y}` — validates
   input, spawns a background task, returns `{job_id, status: "queued"}`.
4. Frontend polls `GET /jobs/{job_id}` every 1-2s →
   `{status: queued|running|done|error, error_message?}`.
5. On `done`, `GET /jobs/{job_id}/result` →
   `{output_video_url, counts: {car: N, truck: N, ...}, total: N}`.
   Frontend plays `output_video_url` (served via FastAPI `StaticFiles`) and
   renders the counts.

Counting logic: single line + `seen_ids` set (a track ID counts once, on
first crossing) — same idea as the current two-line-band code, simplified to
one line since the band's only real purpose was avoiding double-counts,
which `seen_ids` already does on its own.

## Error handling

- `/upload`: reject non-video-extension or oversized files → 400.
- `/jobs`: validate `line_y` within frame height, `classes` non-empty,
  `conf` in (0, 1), `video_id` exists → 400.
- Pipeline exceptions (bad codec, model load failure, etc.) caught in the
  background task → job status becomes `error` with `error_message` instead
  of hanging at `running` forever.
- Frontend disables the Run button while a job is in flight and shows an
  error banner on any 4xx/5xx or `status: error`.

## Testing

- Backend: one pytest against `run_pipeline()` directly with a short test
  clip (few frames), asserting it returns the expected stats shape and
  writes a non-empty output file. Not a YOLO-accuracy test — just confirms
  the pipeline wiring doesn't crash.
- API: pytest + FastAPI `TestClient` covering the happy path
  (upload → create job → poll → result) and one validation-error case.
- Frontend: manual verification for this MVP, no test framework setup.

## Known risks / out of scope

- **CPU/CUDA**: project venv currently has CPU-only torch; `model.to("cuda")`
  is commented out in `main.py`. Processing will be slow on CPU. Fixing the
  venv (installing a CUDA-enabled torch wheel) is a separate, already-known
  task — not part of this spec, but worth doing before running this on full
  videos, especially since async-job-with-polling was chosen specifically
  because processing can take a while.
- No speed detection in this spec (was the original project goal per prior
  session notes, deliberately deferred — params only cover detect/track/
  count/classify, per user's request this session).
- No multi-file batch processing — one job = one video.
- No git repo exists yet in this project directory, so this spec is not
  committed to git as the skill default suggests; written to disk only.
