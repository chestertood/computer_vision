"""FastAPI backend for the car tracker pipeline: upload -> job -> live/final result.

Contract implemented per docs/superpowers/specs/2026-09-10-web-frontend-design.md
and 2026-09-11-roi-live-results-design.md, matched against frontend/src/api.js.
"""
import base64
import hashlib
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

BACKEND_DIR = Path(__file__).parent
# OpenCV's FFmpeg backend loads H.264 encoding via this Cisco-provided DLL at
# runtime (not bundled, due to H.264 licensing) - must be on PATH before cv2
# opens a VideoWriter with an H.264 fourcc, or it fails silently (produces an
# empty file). os.add_dll_directory() does NOT work here - FFmpeg's internal
# LoadLibrary call doesn't honor AddDllDirectory-registered directories.
_OPENH264_DIR = BACKEND_DIR / "bin"
if _OPENH264_DIR.is_dir():
    os.environ["PATH"] = str(_OPENH264_DIR) + os.pathsep + os.environ["PATH"]

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from ultralytics import YOLO

# media/ holds what was uploaded (source clip + its first frame); results/ holds
# what a run produced (the cropped, adjusted, annotated video).
MEDIA_DIR = BACKEND_DIR / "media"
MEDIA_DIR.mkdir(exist_ok=True)
RESULTS_DIR = BACKEND_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)
PRESETS_DIR = BACKEND_DIR / "presets"
PRESETS_DIR.mkdir(exist_ok=True)
MODELS_DIR = BACKEND_DIR / "models"
MODELS_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES = 500 * 1024 * 1024
# How many uploads and how many rendered runs to keep on disk. Older ones are
# deleted on the next upload, so a long testing session can't fill the drive.
KEEP_MEDIA = 5
VIDEO_EXTENSIONS = (".mp4", ".mov", ".avi", ".mkv")

# Built-in Ultralytics checkpoints, smallest/fastest to largest/most accurate.
# ultralytics.YOLO(name) auto-downloads a preset by name the first time it's
# used, so these don't need to exist on disk up front.
PRESET_MODELS = ["yolo11n", "yolo11s", "yolo11m", "yolo11l", "yolo11x"]
DEFAULT_MODEL_ID = "yolo11s"

# model_id -> loaded YOLO instance. ponytail: one shared instance per model id,
# fine for this single-user local app; add a per-job model / lock if
# concurrent jobs on the same model ever need to run at once.
MODEL_CACHE: dict[str, YOLO] = {}
custom_models: dict[str, dict] = {}  # model_id -> {"path": str, "name": str}


def resolve_model_path(model_id: str) -> str:
    if model_id in PRESET_MODELS:
        return str(BACKEND_DIR / f"{model_id}.pt")
    if model_id in custom_models:
        return custom_models[model_id]["path"]
    raise HTTPException(400, "unknown model_id")


def get_model(model_id: str) -> YOLO:
    if model_id not in MODEL_CACHE:
        MODEL_CACHE[model_id] = YOLO(resolve_model_path(model_id))
    return MODEL_CACHE[model_id]


def get_model_classes(model_id: str) -> list[str]:
    names = get_model(model_id).names  # {id: name}, not necessarily contiguous
    return [names[i] for i in sorted(names)]


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")
app.mount("/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")

videos: dict[str, dict] = {}
jobs: dict[str, dict] = {}


class RoiModel(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class JobCreate(BaseModel):
    video_id: str
    model_id: str = DEFAULT_MODEL_ID
    conf: float
    imgsz: int
    classes: list[str]
    line_y: Optional[float] = None
    line_y2: Optional[float] = None
    roi: Optional[RoiModel] = None
    line_color_a: str = "#2ecc71"
    line_color_b: str = "#ff3b30"
    roi_color: str = "#2ecc71"
    line_thickness: int = 2
    # Same keys and -100..100 ranges as frontend/src/adjust.js.
    adjust: dict[str, float] = {}


def line_crossed(prev_cy: Optional[float], cy: float, line_y: float) -> bool:
    if prev_cy is None:
        return False
    return (prev_cy < line_y <= cy) or (prev_cy > line_y >= cy)


def hex_to_bgr(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return (b, g, r)


def roi_contains(roi: Optional[RoiModel], cx: float, cy: float) -> bool:
    if roi is None:
        return True
    return roi.x1 <= cx <= roi.x2 and roi.y1 <= cy <= roi.y2


def apply_adjust(frame, adjust: dict):
    """Bake the preview's look into the pixels, in the order adjust.js applies
    its CSS filters. Runs before detection, so the model sees what you see."""
    if not adjust or not any(adjust.values()):
        return frame
    a = lambda k: float(adjust.get(k, 0) or 0)  # noqa: E731
    img = frame.astype(np.float32) / 255.0
    gain = (1 + a("exposure") / 100) * (1 + a("brightness") / 200)
    if gain != 1:
        img *= gain
    contrast = 1 + a("contrast") / 100
    fade = a("fade")
    if fade > 0:
        contrast *= 1 - fade / 250
    if contrast != 1:
        img = (img - 0.5) * contrast + 0.5
    # BGR order, so channel 0 is blue and channel 2 is red.
    gray = img @ np.array([0.114, 0.587, 0.299], dtype=np.float32)
    sat = 1 + a("saturation") / 100
    if sat != 1:
        img = gray[..., None] + (img - gray[..., None]) * sat
    warmth, tint, bw = a("warmth"), a("tint"), a("bw")
    if warmth:
        img[..., 2] *= 1 + warmth / 500
        img[..., 0] *= 1 - warmth / 500
    if tint:
        img[..., 1] *= 1 - tint / 500
    if bw > 0:
        gray = img @ np.array([0.114, 0.587, 0.299], dtype=np.float32)
        img += (gray[..., None] - img) * (bw / 100)
    return np.clip(img * 255, 0, 255).astype(np.uint8)


def vignette_mask(width: int, height: int, strength: float):
    """Darkening factor per pixel, matching the preview's radial overlay:
    clear to 45% of the radius, then falling off to `strength` at the corner."""
    ys = np.linspace(-1, 1, height, dtype=np.float32)[:, None]
    xs = np.linspace(-1, 1, width, dtype=np.float32)[None, :]
    radius = np.sqrt(xs ** 2 + ys ** 2) / np.sqrt(2)
    falloff = np.clip((radius - 0.45) / 0.55, 0, 1)
    return (1 - falloff * (strength / 100))[..., None]


def next_name(directory: Path, prefix: str) -> str:
    """Next free `prefix_NN` in a directory, counting from the highest in use."""
    used = [
        int(m.group(1))
        for p in directory.glob(f"{prefix}_*.mp4")
        if (m := re.fullmatch(rf"{prefix}_(\d+)", p.stem))
    ]
    return f"{prefix}_{max(used, default=0) + 1:02d}"


def find_same_clip(digest: str) -> Optional[Path]:
    """The stored clip with this content, if it is still on disk.

    Re-hashing the kept clips beats keeping an index file: prune_media caps how
    many there are, so this reads a handful of files at most.
    """
    for p in MEDIA_DIR.glob("clip_*.mp4"):
        if hashlib.sha256(p.read_bytes()).hexdigest() == digest:
            return p
    return None


def prune_media(keep: int = KEEP_MEDIA) -> list[str]:
    """Delete all but the `keep` newest uploads and the `keep` newest renders.

    Newest-first means whatever a running job is using is always in the keep
    set, so nothing gets pulled out from under it.
    """
    by_age = lambda d: sorted(d.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)  # noqa: E731
    sources = by_age(MEDIA_DIR)
    outputs = by_age(RESULTS_DIR)
    removed = []
    for old in sources[keep:]:
        # The frame0.jpg preview goes with its video.
        for f in MEDIA_DIR.glob(f"{old.stem}*"):
            f.unlink(missing_ok=True)
            removed.append(f.name)
        videos.pop(old.stem, None)
    for old in outputs[keep:]:
        old.unlink(missing_ok=True)
        removed.append(old.name)
    return removed


def crop_window(line_y, line_y2, roi, width: int, height: int) -> tuple[int, int, int, int]:
    """Region the run is cut down to: exactly the ROI box, or the A-B band."""
    if roi is not None:
        return int(roi.x1), int(roi.y1), int(roi.x2), int(roi.y2)
    if line_y is None or line_y2 is None:
        return 0, 0, width, height
    top, bottom = sorted((int(line_y), int(line_y2)))
    return 0, top, width, bottom


def crop_bbox(frame, cx: float, cy: float, w: float, h: float):
    x1 = max(int(cx - w / 2), 0)
    y1 = max(int(cy - h / 2), 0)
    x2 = min(int(cx + w / 2), frame.shape[1])
    y2 = min(int(cy + h / 2), frame.shape[0])
    return frame[y1:y2, x1:x2]


def resize_capped(img, max_side: int = 160):
    h, w = img.shape[:2]
    if max(h, w) <= max_side:
        return img
    scale = max_side / max(h, w)
    return cv2.resize(img, (max(int(w * scale), 1), max(int(h * scale), 1)))


def run_pipeline(
    job_id, video_path, model_id, conf, imgsz, classes, line_y, line_y2, roi, width, height, fps, base_url,
    line_color_a="#2ecc71", line_color_b="#ff3b30", roi_color="#2ecc71", line_thickness=2,
    adjust=None,
):
    job = jobs[job_id]
    job["status"] = "running"
    bgr_a = hex_to_bgr(line_color_a)
    bgr_b = hex_to_bgr(line_color_b)
    bgr_roi = hex_to_bgr(roi_color)
    model = get_model(model_id)
    name_to_id = {name: i for i, name in model.names.items()}
    id_to_name = model.names
    class_ids = [name_to_id[c] for c in classes]
    prev_cy: dict[int, float] = {}
    seen_ids: set[int] = set()
    x0, y0, x1, y1 = crop_window(line_y, line_y2, roi, width, height)
    crop_w, crop_h = x1 - x0, y1 - y0
    # Lines move into crop coordinates; everything below counts in that space.
    local_a = None if line_y is None else line_y - y0
    local_b = None if line_y2 is None else line_y2 - y0
    adjust = adjust or {}
    vignette = (
        vignette_mask(crop_w, crop_h, adjust["vignette"]) if adjust.get("vignette") else None
    )
    result_name = next_name(RESULTS_DIR, "result")
    output_path = RESULTS_DIR / f"{result_name}.mp4"
    writer = cv2.VideoWriter(str(output_path), cv2.VideoWriter_fourcc(*"avc1"), fps, (crop_w, crop_h))
    cap = cv2.VideoCapture(str(video_path))
    try:
        stopped = False
        frame_idx = -1
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_idx += 1
            if job["cancel_requested"]:
                stopped = True
                break
            cropped = apply_adjust(frame[y0:y1, x0:x1], adjust)
            if vignette is not None:
                cropped = np.clip(cropped * vignette, 0, 255).astype(np.uint8)
            # The model only ever sees the crop, so detection cost and false
            # positives both drop to the picked area.
            r = model.track(
                cropped,
                imgsz=imgsz,
                conf=conf,
                classes=class_ids,
                iou=0.5,
                persist=True,
                tracker="botsort.yaml",
                agnostic_nms=True,
                verbose=False,
            )[0]
            plotted = r.plot()
            if local_a is not None:
                cv2.line(plotted, (0, int(local_a)), (crop_w, int(local_a)), bgr_a, line_thickness)
            if local_b is not None:
                cv2.line(plotted, (0, int(local_b)), (crop_w, int(local_b)), bgr_b, line_thickness)
            if roi is not None:
                cv2.rectangle(plotted, (0, 0), (crop_w - 1, crop_h - 1), bgr_roi, line_thickness)
            writer.write(plotted)
            ok, buf = cv2.imencode(".jpg", plotted)
            if ok:
                job["latest_frame"] = buf.tobytes()
            if r.boxes.id is None:
                continue
            for box, tid, cls_id in zip(
                r.boxes.xywh, r.boxes.id.int().tolist(), r.boxes.cls.int().tolist()
            ):
                cx, cy, w, h = (v.item() for v in box)
                prev = prev_cy.get(tid)
                prev_cy[tid] = cy

                if local_a is None:
                    # ROI-only run: no line to cross, so each new track that
                    # shows up inside the crop is counted once, without direction.
                    triggered = True
                    direction = None
                elif local_b is None:
                    triggered = line_crossed(prev, cy, local_a)
                    direction = None
                else:
                    # A and B are the crop edges now, so a track entering the
                    # band is already "past" A: count it at the middle instead,
                    # heading down = in, heading up = out.
                    triggered = line_crossed(prev, cy, crop_h / 2)
                    direction = None if prev is None else "in" if cy > prev else "out"

                if triggered and tid not in seen_ids:
                    seen_ids.add(tid)
                    vtype = id_to_name.get(cls_id, "unknown")
                    thumb = resize_capped(crop_bbox(r.orig_img, cx, cy, w, h))
                    ok, buf = cv2.imencode(".jpg", thumb)
                    if ok:
                        job["vehicles"].append({
                            "type": vtype,
                            "image_b64": base64.b64encode(buf).decode(),
                            "ts": round(frame_idx / fps, 2),
                            "direction": direction,
                        })
                        job["counts"][vtype] = job["counts"].get(vtype, 0) + 1
                        job["total"] += 1
                        if direction:
                            job["directions"][direction] = job["directions"].get(direction, 0) + 1
        job["status"] = "stopped" if stopped else "done"
    except Exception as exc:
        job["status"] = "error"
        job["error_message"] = str(exc)
    finally:
        cap.release()
        writer.release()
        if job["status"] == "done":
            job["output_video_url"] = f"{base_url}results/{result_name}.mp4"


@app.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(VIDEO_EXTENSIONS):
        raise HTTPException(400, "unsupported file type")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "file too large")

    # Files are named clip_01, clip_02, ... and the content hash only decides
    # whether this upload is one of them already.
    existing = find_same_clip(hashlib.sha256(data).hexdigest())
    if existing is None:
        video_id = next_name(MEDIA_DIR, "clip")
        video_path = MEDIA_DIR / f"{video_id}.mp4"
        video_path.write_bytes(data)
    else:
        video_id, video_path = existing.stem, existing
    prune_media()

    cap = cv2.VideoCapture(str(video_path))
    ok, frame = cap.read()
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    cap.release()
    if not ok:
        raise HTTPException(400, "could not read video")
    # Measured on the decoded frame, never CAP_PROP_FRAME_*: a rotated phone
    # clip reports the container's unrotated size, which offsets every crop.
    height, width = frame.shape[:2]

    frame_path = MEDIA_DIR / f"{video_id}_frame0.jpg"
    if not frame_path.exists():
        cv2.imwrite(str(frame_path), frame)

    videos[video_id] = {"path": str(video_path), "width": width, "height": height, "fps": fps}
    base_url = str(request.base_url)
    return {
        "video_id": video_id,
        "width": width,
        "height": height,
        "preview_frame_url": f"{base_url}media/{video_id}_frame0.jpg",
    }


@app.get("/models")
def list_models():
    return {
        "presets": PRESET_MODELS,
        "custom": [
            {"model_id": model_id, "name": info["name"]}
            for model_id, info in custom_models.items()
        ],
    }


@app.post("/models")
async def upload_model(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pt"):
        raise HTTPException(400, "model file must be a .pt checkpoint")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "file too large")

    model_id = f"custom-{uuid.uuid4().hex}"
    model_path = MODELS_DIR / f"{model_id}.pt"
    model_path.write_bytes(data)
    try:
        MODEL_CACHE[model_id] = YOLO(str(model_path))  # validate it loads as a YOLO model
    except Exception as exc:
        model_path.unlink(missing_ok=True)
        raise HTTPException(400, f"could not load model: {exc}") from exc

    custom_models[model_id] = {"path": str(model_path), "name": file.filename}
    return {"model_id": model_id, "name": file.filename}


@app.get("/models/{model_id}/classes")
def model_classes(model_id: str):
    if model_id not in PRESET_MODELS and model_id not in custom_models:
        raise HTTPException(404, "unknown model_id")
    try:
        return {"classes": get_model_classes(model_id)}
    except Exception as exc:
        raise HTTPException(400, f"could not load model: {exc}") from exc


@app.post("/jobs")
def create_job(body: JobCreate, request: Request):
    video = videos.get(body.video_id)
    if video is None:
        raise HTTPException(400, "unknown video_id")
    if not 0 < body.conf < 1:
        raise HTTPException(400, "conf must be between 0 and 1")
    if body.model_id not in PRESET_MODELS and body.model_id not in custom_models:
        raise HTTPException(400, "unknown model_id")
    model_classes = set(get_model_classes(body.model_id))
    if not body.classes or any(c not in model_classes for c in body.classes):
        raise HTTPException(400, "classes must be a non-empty list of classes known to the selected model")
    if (body.line_y is None) == (body.roi is None):
        raise HTTPException(400, "pass either lines or an roi, not both")
    if body.line_y is not None and not 0 <= body.line_y <= video["height"]:
        raise HTTPException(400, "line_y outside frame bounds")
    if body.line_y2 is not None:
        if not 0 <= body.line_y2 <= video["height"]:
            raise HTTPException(400, "line_y2 outside frame bounds")
        if body.line_y2 == body.line_y:
            raise HTTPException(400, "line_y2 must differ from line_y")
    if body.roi is not None:
        r = body.roi
        if r.x1 >= r.x2 or r.y1 >= r.y2 or r.x1 < 0 or r.y1 < 0 or r.x2 > video["width"] or r.y2 > video["height"]:
            raise HTTPException(400, "roi outside frame bounds")

    job_id = uuid.uuid4().hex
    jobs[job_id] = {
        "status": "queued",
        "counts": {},
        "directions": {},
        "total": 0,
        "vehicles": [],
        "output_video_url": None,
        "error_message": None,
        "cancel_requested": False,
        "latest_frame": None,
    }
    thread = threading.Thread(
        target=run_pipeline,
        args=(
            job_id, video["path"], body.model_id, body.conf, body.imgsz, body.classes, body.line_y,
            body.line_y2, body.roi, video["width"], video["height"], video["fps"], str(request.base_url),
        ),
        kwargs=dict(
            line_color_a=body.line_color_a, line_color_b=body.line_color_b,
            roi_color=body.roi_color, line_thickness=body.line_thickness, adjust=body.adjust,
        ),
        daemon=True,
    )
    thread.start()
    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}/result")
def get_result(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "unknown job_id")
    resp = {
        "status": job["status"],
        "counts": job["counts"],
        "directions": job["directions"],
        "total": job["total"],
        "vehicles": job["vehicles"],
    }
    if job["output_video_url"]:
        resp["output_video_url"] = job["output_video_url"]
    if job["error_message"]:
        resp["error_message"] = job["error_message"]
    return resp


@app.get("/jobs/{job_id}/stream")
def stream_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "unknown job_id")

    def gen():
        # ponytail: fixed-rate poll of the shared job dict, not a proper pub/sub -
        # fine for one local viewer; a queue per job would be the real fix.
        last_frame = None
        while True:
            job = jobs.get(job_id)
            if job is None or job["status"] not in ("queued", "running"):
                break
            frame = job.get("latest_frame")
            if frame is not None and frame is not last_frame:
                last_frame = frame
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
                )
            time.sleep(0.1)

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.post("/jobs/{job_id}/stop")
def stop_job(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "unknown job_id")
    if job["status"] in ("queued", "running"):
        job["cancel_requested"] = True
    return {"status": job["status"]}


class PresetCreate(BaseModel):
    name: str
    config: dict[str, Any]


def _preset_path(name: str) -> Path:
    safe_name = re.sub(r"[^A-Za-z0-9_-]", "_", name).strip("_")[:60] or "preset"
    return PRESETS_DIR / f"{safe_name}.json"


@app.post("/presets")
def save_preset(body: PresetCreate):
    path = _preset_path(body.name)
    path.write_text(json.dumps(body.config), encoding="utf-8")
    return {"name": path.stem}


@app.get("/presets")
def list_presets():
    return {"names": sorted(p.stem for p in PRESETS_DIR.glob("*.json"))}


@app.get("/presets/{name}")
def get_preset(name: str):
    path = _preset_path(name)
    if not path.is_file():
        raise HTTPException(404, "preset not found")
    return json.loads(path.read_text(encoding="utf-8"))


# Mounted last so it never shadows an API route: with the built frontend in
# place the whole app is one process on one port, which is what the desktop
# launcher starts. Without a build, the API still runs on its own.
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="ui")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8010)
