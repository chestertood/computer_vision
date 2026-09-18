"""Draw the Object Tracker app icon. Run: python tools/make_icon.py

Tracking brackets around a centred dot -- the same mark the app header uses,
with the strokes thick enough to still read at 16x16 in the taskbar.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "object-tracker.ico"
VIOLET = (110, 59, 255, 255)
WHITE = (255, 255, 255, 255)
SIZES = [16, 24, 32, 48, 64, 128, 256]


def draw(size: int) -> Image.Image:
    # Drawn 4x and downsampled: Pillow has no antialiased shape drawing.
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=VIOLET)

    pad, arm, w = s * 0.22, s * 0.16, max(int(s * 0.055), 2)
    lo, hi = pad, s - pad
    for x, y, dx, dy in ((lo, lo, 1, 1), (hi, lo, -1, 1), (lo, hi, 1, -1), (hi, hi, -1, -1)):
        d.line([x, y, x + arm * dx, y], fill=WHITE, width=w)
        d.line([x, y, x, y + arm * dy], fill=WHITE, width=w)

    r = s * 0.12
    d.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.parent.mkdir(exist_ok=True)
    frames = [draw(n) for n in SIZES]
    frames[-1].save(OUT, format="ICO", sizes=[(n, n) for n in SIZES])
    assert OUT.stat().st_size > 0, "icon file is empty"
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
