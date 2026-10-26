#!/usr/bin/env python3
"""Siyah-altın uygulama simgelerini üretir (icons/). Gerekli: pip install pillow"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLD = (212, 175, 55)
GOLD2 = (241, 215, 122)


def icon(size):
    s = size
    im = Image.new("RGB", (s, s), (11, 11, 11))
    d = ImageDraw.Draw(im)
    m = s * 0.08
    d.rounded_rectangle([m, m, s - m, s - m], radius=s * 0.16, outline=GOLD, width=max(2, int(s * 0.03)))
    # defter çizgileri
    for i in range(4):
        y = s * (0.30 + i * 0.13)
        d.line([s * 0.22, y, s * 0.78, y], fill=(60, 52, 30), width=max(1, int(s * 0.012)))
    # nota: iki baş + sap + kiriş
    r = s * 0.085
    x1, y1 = s * 0.36, s * 0.68
    x2, y2 = s * 0.64, s * 0.62
    for (x, y) in ((x1, y1), (x2, y2)):
        d.ellipse([x - r * 1.2, y - r, x + r * 1.2, y + r], fill=GOLD2)
    w = max(2, int(s * 0.035))
    d.rectangle([x1 + r * 1.2 - w, s * 0.30, x1 + r * 1.2, y1], fill=GOLD2)
    d.rectangle([x2 + r * 1.2 - w, s * 0.24, x2 + r * 1.2, y2], fill=GOLD2)
    d.polygon([(x1 + r * 1.2 - w, s * 0.30), (x2 + r * 1.2, s * 0.24), (x2 + r * 1.2, s * 0.32), (x1 + r * 1.2 - w, s * 0.38)], fill=GOLD2)
    return im


os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
    icon(size).save(os.path.join(ROOT, "icons", name))
print("icons/ hazır")
