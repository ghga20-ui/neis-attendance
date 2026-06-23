"""One-off generator for the 체크온 (CheckOn) brand icons.

Draws a rounded-square + bold white checkmark with Pillow (supersampled for
clean anti-aliasing), then emits the PNG/ICO set for the PWA and desktop apps.
No SVG renderer needed — the geometry is drawn directly. SVG files are authored
separately by hand.

Run: py -m subject_teacher.scripts.gen_brand_icons
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

BLUE = (10, 132, 255, 255)   # #0A84FF  brand primary
WHITE = (255, 255, 255, 255)

# Checkmark polyline in normalized (0..1) coords of the square, plus stroke width.
CHECK = [(0.27, 0.52), (0.43, 0.67), (0.73, 0.34)]
STROKE = 0.11
CORNER = 0.22  # rounded-square radius for the "any" icon

SS = 4  # supersample factor


def draw_icon(size: int, full_bleed: bool) -> Image.Image:
    w = size * SS
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if full_bleed:
        d.rectangle([0, 0, w, w], fill=BLUE)            # maskable / apple-touch
    else:
        d.rounded_rectangle([0, 0, w - 1, w - 1], radius=int(CORNER * w), fill=BLUE)
    pts = [(x * w, y * w) for x, y in CHECK]
    lw = int(STROKE * w)
    d.line(pts, fill=WHITE, width=lw, joint="curve")
    r = lw / 2
    for (x, y) in pts:                                   # rounded caps/joins
        d.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, "..", ".."))
    pwa = os.path.join(root, "subject_teacher_pwa", "public")
    desk = os.path.join(root, "subject_teacher", "neis_attendance", "public")
    os.makedirs(desk, exist_ok=True)

    # PWA assets
    draw_icon(192, full_bleed=False).save(os.path.join(pwa, "icon-192.png"))
    draw_icon(512, full_bleed=False).save(os.path.join(pwa, "icon-512.png"))
    draw_icon(512, full_bleed=True).save(os.path.join(pwa, "icon-maskable-512.png"))
    draw_icon(180, full_bleed=True).save(os.path.join(pwa, "apple-touch-icon.png"))

    # favicon.ico (multi-size) for both apps
    ico_base = draw_icon(256, full_bleed=False)
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    ico_base.save(os.path.join(pwa, "favicon.ico"), sizes=ico_sizes)
    ico_base.save(os.path.join(desk, "favicon.ico"), sizes=ico_sizes)

    # Desktop also gets an apple-touch + 192 for completeness
    draw_icon(180, full_bleed=True).save(os.path.join(desk, "apple-touch-icon.png"))
    draw_icon(192, full_bleed=False).save(os.path.join(desk, "icon-192.png"))

    print("PWA  ->", pwa)
    print("DESK ->", desk)
    for p in (pwa, desk):
        for f in sorted(os.listdir(p)):
            if f.endswith((".png", ".ico")):
                print("  ", f, os.path.getsize(os.path.join(p, f)), "bytes")


if __name__ == "__main__":
    main()
