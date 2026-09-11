# Loop Engineer — car_tracker backend

Self-paced `/loop` session that iterates on backend work while user is away
from keyboard, checking back in on a self-picked interval instead of a fixed
cron. Draft — confirm/edit scope before running.

## Ownership boundary (do not cross)

User owns backend + QA (agreed 2026-09-10, see memory `car-tracker-project`).
Loop may **propose** diffs and **run/test** code, but must not commit backend
changes or make design calls (model choice, thresholds, endpoint shape)
without flagging them for the user to confirm. Treat this file's task list as
"what to check/build toward," not a blank check to rewrite `main.py` freely.

## Current state (verified 2026-09-11)

- `backend/main.py` (65 lines) — still a standalone CV script (`crop_frame`,
  `test`, `main`). **No FastAPI app yet** — none of the 4 contract endpoints
  exist.
- Frontend is done and expects the API contract below at
  `http://localhost:8000` (override via `VITE_API_BASE`).
- `.venv` has CPU-only torch; CUDA line is commented out. Global python has
  CUDA torch + benchmarked GPU numbers (see gotchas below) — revisit before
  processing full videos.

## Target: API contract

Full spec: `docs/superpowers/specs/2026-09-10-web-frontend-design.md`

| Method | Path | Purpose |
|---|---|---|
| POST | `/upload` | receive video file |
| POST | `/jobs` | start detect/track/count job |
| GET | `/jobs/{id}` | poll job status |
| GET | `/jobs/{id}/result` | fetch counts |

Must enable CORS for `http://localhost:5173`.

## Known gotchas to respect (don't rediscover these)

- COCO vehicle classes: `[1,2,3,5,7]` (bicycle, car, motorcycle, bus, truck) —
  not just `[2]`.
- `yolo11s` + `imgsz=960` chosen as CPU speed/accuracy compromise —
  `yolo11n`/640 loses small motorcycles (~20-40px, conf 0.15-0.28,
  misclassified as car, ByteTrack drops ids).
- CPU-only torch in `.venv` → `model.to("cuda")` raises `AssertionError`.
  Don't silently re-enable CUDA; ask first.

## Loop task list (each iteration picks one)

1. Scaffold FastAPI app around the existing CV logic in `main.py` (only if
   user has confirmed this is wanted this session).
2. Run the current backend against the spec, note contract mismatches.
3. Run against the frontend end-to-end (`npm run dev` in `frontend/` +
   backend) and log what breaks.
4. Watch for the CPU/CUDA decision being revisited; don't decide it alone.

## Stop condition

All 4 endpoints implemented, CORS enabled, one manual end-to-end run
(upload → job → poll → result) succeeds against the real frontend.

## Invoke

```
/loop <pick one task above, be specific>
```
