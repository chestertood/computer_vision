"""Assert-based self-check for pipeline helpers. Run: python test_pipeline.py"""
import os
import tempfile
import time
from pathlib import Path

import numpy as np

import main
from main import (
    RoiModel, apply_adjust, crop_window, line_crossed, next_name, prune_media, roi_contains,
    vignette_mask,
)


def test_line_crossed():
    assert line_crossed(None, 100, 190) is False, "no prior position -> never a crossing"
    assert line_crossed(180, 200, 190) is True, "downward crossing"
    assert line_crossed(200, 180, 190) is True, "upward crossing"
    assert line_crossed(180, 185, 190) is False, "stayed on one side"


def test_roi_contains():
    assert roi_contains(None, 999, 999) is True, "no roi -> everything counts"
    roi = RoiModel(x1=0, y1=900, x2=720, y2=1280)
    assert roi_contains(roi, 360, 1000) is True
    assert roi_contains(roi, 360, 500) is False, "outside roi y-range"


def test_crop_window():
    roi = RoiModel(x1=100, y1=200, x2=400, y2=500)
    assert crop_window(None, None, roi, 1920, 1080) == (100, 200, 400, 500), "roi is the crop"
    assert crop_window(None, None, None, 1920, 1080) == (0, 0, 1920, 1080), "nothing picked -> whole frame"
    assert crop_window(500, 700, None, 1920, 1080) == (0, 500, 1920, 700), "band is the crop, no margin"
    assert crop_window(700, 500, None, 1920, 1080) == (0, 500, 1920, 700), "order does not matter"
    assert crop_window(500, None, None, 1920, 1080) == (0, 0, 1920, 1080), "one line -> whole frame"


def test_apply_adjust():
    frame = np.full((4, 4, 3), 100, dtype=np.uint8)
    frame[..., 2] = 200  # red channel, BGR order
    assert apply_adjust(frame, {}) is frame, "no adjustments -> same frame, no copy"
    assert apply_adjust(frame, {"exposure": 0}) is frame, "all-zero values -> same frame"

    brighter = apply_adjust(frame, {"exposure": 50})
    assert brighter[0, 0, 0] > frame[0, 0, 0], "exposure lifts"
    assert brighter.dtype == np.uint8 and brighter.max() <= 255, "stays 8-bit and clipped"

    mono = apply_adjust(frame, {"bw": 100})
    assert len(set(mono[0, 0].tolist())) == 1, "B/W -> channels equal"

    warm = apply_adjust(frame, {"warmth": 100})
    assert warm[0, 0, 2] > frame[0, 0, 2] and warm[0, 0, 0] < frame[0, 0, 0], "warm: red up, blue down"

    flat = apply_adjust(np.full((2, 2, 3), 200, dtype=np.uint8), {"saturation": -100})
    assert flat[0, 0, 0] == flat[0, 0, 2], "saturation -100 -> gray"


def test_vignette_mask():
    mask = vignette_mask(9, 9, 100)
    assert mask.shape == (9, 9, 1), "broadcastable over channels"
    assert mask[4, 4, 0] == 1.0, "centre untouched"
    assert mask[0, 0, 0] == 0.0, "corner fully dark at strength 100"
    assert vignette_mask(9, 9, 50)[0, 0, 0] == 0.5, "strength scales the corner"


def test_next_name():
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        assert next_name(d, "clip") == "clip_01", "empty dir starts at 01"
        (d / "clip_01.mp4").write_bytes(b"x")
        (d / "clip_02.mp4").write_bytes(b"x")
        assert next_name(d, "clip") == "clip_03"
        # Counting from the highest, not the count: pruning clip_01 must not
        # hand clip_02's successor a name that is already taken.
        (d / "clip_01.mp4").unlink()
        assert next_name(d, "clip") == "clip_03"
        (d / "clip_10.mp4").write_bytes(b"x")
        assert next_name(d, "clip") == "clip_11", "two digits keep counting"
        (d / "clip_notanumber.mp4").write_bytes(b"x")
        (d / "result_99.mp4").write_bytes(b"x")
        assert next_name(d, "clip") == "clip_11", "other names ignored"
        assert next_name(d, "result") == "result_100", "own prefix, own sequence"


def test_prune_media():
    with tempfile.TemporaryDirectory() as tmp:
        media, results = Path(tmp) / "media", Path(tmp) / "results"
        media.mkdir()
        results.mkdir()
        originals = main.MEDIA_DIR, main.RESULTS_DIR
        main.MEDIA_DIR, main.RESULTS_DIR = media, results
        try:
            for i in range(4):
                (media / f"vid{i}.mp4").write_bytes(b"x")
                (media / f"vid{i}_frame0.jpg").write_bytes(b"x")
                (results / f"job{i}_out.mp4").write_bytes(b"x")
                main.videos[f"vid{i}"] = {"path": str(media / f"vid{i}.mp4")}
                # Distinct mtimes, oldest first -- vid0 is the one to go.
                stamp = time.time() - (10 - i)
                os.utime(media / f"vid{i}.mp4", (stamp, stamp))
                os.utime(media / f"vid{i}_frame0.jpg", (stamp, stamp))
                os.utime(results / f"job{i}_out.mp4", (stamp, stamp))

            removed = prune_media(keep=2)
            kept = {p.name for p in media.iterdir()} | {p.name for p in results.iterdir()}
            assert "vid0.mp4" not in kept and "vid1.mp4" not in kept, "oldest uploads deleted"
            assert "vid0_frame0.jpg" not in kept, "preview frame goes with its video"
            assert "vid2.mp4" in kept and "vid3.mp4" in kept, "newest uploads kept"
            assert "job0_out.mp4" not in kept and "job3_out.mp4" in kept, "results pruned too"
            assert "vid0" not in main.videos, "dropped from the registry as well"
            assert len(removed) == 6, removed
            assert prune_media(keep=2) == [], "nothing left to prune -> no-op"
        finally:
            main.MEDIA_DIR, main.RESULTS_DIR = originals
            for i in range(4):
                main.videos.pop(f"vid{i}", None)


if __name__ == "__main__":
    test_line_crossed()
    test_roi_contains()
    test_crop_window()
    test_apply_adjust()
    test_vignette_mask()
    test_next_name()
    test_prune_media()
    print("ok")
