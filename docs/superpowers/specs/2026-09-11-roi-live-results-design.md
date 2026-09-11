# ROI crop, live results, and Stop for car tracker UI

Date: 2026-09-11

**Extends** `docs/superpowers/specs/2026-09-10-web-frontend-design.md` — that
spec's architecture, upload flow, and error-handling rules still apply. This
spec only adds the deltas below; where the two conflict, this one wins.

## Goal

Speed-camera-style UX: user draws a counting line (existing) **and** a
separate rectangular ROI to restrict where detection runs, hits Run, watches
vehicle cards (crop image + type) appear live in the right panel as each one
crosses the line, and can hit Stop mid-run to end early while keeping
whatever was counted so far.

## Current state (as of this spec)

Frontend (`frontend/src/`) is complete per the 2026-09-10 spec: upload, a
single draggable counting line (`LineCanvas`), params, Run + polling
(`RunStatus`), and a final counts table (`ResultsView`). No ROI drawing, no
Stop, no per-vehicle images, no partial/live results — this spec adds all
four. Backend (`backend/main.py`) is still the pre-API script described in
the prior spec; none of the 4 original endpoints exist yet, so this spec's
backend surface is additive to that plan, not a retrofit of running code.

## Architecture

```
React (Vite) frontend  <--REST/JSON-->  FastAPI backend
  - LineCanvas (counting line, existing)   - POST /upload        (existing)
  - RoiCanvas  (crop box, NEW)             - POST /jobs           (+roi field)
  - RunStatus: polls /result on an         - GET  /jobs/{id}      (existing)
    interval the whole time job is         - GET  /jobs/{id}/result
    running, not just at the end             (now returns partial data
  - RunStatus: Stop button (NEW)             while status=running)
  - ResultsView: renders whatever          - POST /jobs/{id}/stop (NEW)
    shape /result returns, live or final
```

Job state stays in-memory (per prior spec) but its shape grows: a `vehicles`
list that the background pipeline appends to as it runs, not just a final
summary written once at the end.

## API contract additions

- `POST /jobs` request body gains `roi: {x1, y1, x2, y2}` (frame-pixel
  coords, same space as the existing `line_y`). Optional — omitted/empty ROI
  means "use the full frame," not an error.
- `GET /jobs/{id}/result` — previously only meaningful once `status: done`.
  Now returns the current snapshot **regardless of status**
  (`queued|running|stopped|done|error`):
  ```json
  {
    "status": "running",
    "counts": {"car": 3, "truck": 1},
    "total": 4,
    "vehicles": [
      {"type": "car", "image_b64": "<jpg base64, capped ~160px longest side>", "ts": 12.4}
    ]
  }
  ```
  `vehicles` only grows, never shrinks or reorders, while a job is
  `running`/`stopped`/`done`. Frontend can render it identically at any
  status; only the status label changes.
- `POST /jobs/{id}/stop` (new) — sets a cancel flag on the job; body/response
  `{status: "stopped"}`. No-op (still returns current state, no error) if the
  job is already `done`/`error`/`stopped`.

## Frontend component changes

- **`RoiCanvas`** (new component, sibling to `LineCanvas`): draggable/
  resizable rectangle overlay on the same frame-0 `<img>`/`<canvas>` that
  `LineCanvas` draws its line on. Independent of the line — both render at
  once, on separate absolutely-positioned canvases over the same preview
  image, each owning only its own shape's drag math. Emits `{x1,y1,x2,y2}`
  in frame-pixel coordinates, same convention `LineCanvas` already uses for
  its line.
- **`ParamsPanel`**: holds `roi` state alongside the existing `line` state;
  passes both into the `POST /jobs` payload.
- **`RunStatus`**: currently polls until `done`/`error` then fires a single
  callback. Changes:
  - Poll fires an `onProgress(result)` callback every tick while
    `status === "running"`, not only at the end — pushes the growing
    `vehicles`/`counts`/`total` up to the parent immediately.
  - Owns and renders the **Stop button** (it already owns `jobId` and the
    polling loop, so it's the natural place). On click: call `stopJob(id)`,
    let one more poll tick run to pick up the final partial snapshot, then
    stop polling.
- **`ResultsView`**: same component for live and final display — both are
  just `{counts, total, vehicles, status}`. Renders the existing counts
  table plus a new vehicle-card gallery (thumbnail + type) below it, and a
  status line ("Running…" / "Stopped" / "Done"). No separate
  live-vs-final component.
- **`api.js`**: add `stopJob(id)` → `POST /jobs/{id}/stop`.
- **`App.jsx`**: holds `roi` state; wires `RunStatus`'s `onProgress` straight
  into the `ResultsView` props it's already passing for `onDone`.

## Data flow during processing (backend — for the user to implement)

1. Existing per-frame loop (detect + track) gains an ROI filter: a
   detection only counts toward line-crossing if its box center falls
   inside the ROI rectangle. No ROI set → filter is a no-op (full frame).
2. On a line-crossing event (existing logic, per-track "first crossing only"
   rule from the prior spec): crop that frame to the vehicle's bbox, resize
   to a capped longest-side (~160px) to keep response payloads small under
   frequent polling, base64-encode as jpg, append `{type, image_b64, ts}` to
   the job's `vehicles` list, bump `counts[type]` and `total`.
3. `/jobs/{id}/result` always reads the job's current in-memory state and
   returns it as-is — no special-casing by status. This is what makes
   "live" results free: the endpoint doesn't change, only when it's called.
4. Stop: background loop checks a `cancel_requested` flag every frame (or
   every few frames, if per-frame is measurably slow) and breaks cleanly,
   setting `status = "stopped"` without touching `vehicles` already
   collected.
5. Concurrency: the pipeline runs in a background thread/task (already
   implied by the prior spec's async-job design) while `/result` reads the
   same job object from the request-handling thread. Python list `.append`
   is atomic enough for this single-writer/multi-reader case — no lock
   needed for `vehicles`; the `cancel_requested` flag is a plain bool for
   the same reason.

## Visual design requirements

New UI must read as a real product dashboard, not a default/generic AI-built
page — reuse the existing token system in `App.css` (`--accent`, `--border`,
`--text-h`, `--code-bg`, the `.panel`/`.panel__body` shell), don't introduce
new colors, gradients, or icon fonts for this feature:

- **Stop button**: visually distinct from Run (danger tone, not just the
  same `.run-button` blue) so it's not mistaken for a second Run — but same
  size/radius/font as `.run-button` so the pair reads as one button group,
  not two unrelated widgets.
- **RoiCanvas**: rectangle overlay must be visually distinguishable from the
  counting line at a glance (different stroke style, e.g. dashed vs solid)
  since both sit on the same preview image at once.
- **Vehicle card gallery**: grid of small cards (image + type label), not a
  flat list — reuse `.panel__body`'s border/radius/background so it looks
  like it belongs in the existing result panel, not a bolted-on widget.
  Cards append as they arrive without the existing table jumping/reflowing
  above them.
- Implementation should invoke the `frontend-design` skill for these three
  new pieces specifically, since they're new visual surfaces (the existing
  dashboard shell/tokens are already established and don't need
  re-deriving).

## Error handling

- `POST /jobs` with a malformed `roi` (missing key, non-numeric, out of
  frame bounds) → 400, same validation tier as the existing `line_y` check.
- `POST /jobs/{id}/stop` on an unknown `job_id` → 404 (matches existing
  `/jobs/{id}` behavior). On a job that's already finished → 200, no-op.
- If the pipeline throws mid-run, existing error handling from the prior
  spec applies (`status: error`); `vehicles` collected up to that point are
  left in place rather than discarded, same as the `stopped` case.

## Testing

- Backend: extend the prior spec's `run_pipeline()` pytest with a case that
  passes an ROI smaller than the frame and asserts detections outside it
  aren't counted; a second case that calls the cancel flag mid-loop (short
  test clip) and asserts it returns early with partial `vehicles` intact.
- API: extend the prior spec's `TestClient` happy-path test to poll
  `/result` mid-run (not just after `done`) and assert the shape is valid at
  every status; one test hitting `/jobs/{id}/stop` and confirming status
  flips and `vehicles` isn't cleared.
- Frontend: manual verification only, per prior spec (no framework change
  here).

## Known risks / out of scope

- Base64-inline images mean `/result` payload size grows with vehicle count
  over a long clip. Acceptable for this project's scale (short clips,
  learning project); revisit (e.g. serve crops as static files by ID
  instead) only if a real clip makes polling noticeably slow.
- CPU/CUDA speed issue from the prior spec is unchanged and still open —
  live per-vehicle updates make slow CPU processing more *visible* (cards
  trickle in slowly) but don't fix or worsen the underlying throughput.
- ROI is a single static rectangle for the whole clip (no per-frame/moving
  ROI, no multiple ROIs) — matches the "one counting line" simplicity
  precedent from the prior spec.
