#!/usr/bin/env python3
"""Blur AI watermark regions in assets (run after updating source PNGs)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def blur_box(
    im: Image.Image,
    left: float,
    top: float,
    right: float,
    bottom: float,
    radius: int,
) -> None:
    w, h = im.size
    box = (int(left * w), int(top * h), int(right * w), int(bottom * h))
    if box[2] <= box[0] or box[3] <= box[1]:
        return
    region = im.crop(box)
    region = region.filter(ImageFilter.GaussianBlur(radius=radius))
    im.paste(region, (box[0], box[1]))


def process_img1(path: Path) -> None:
    im = Image.open(path).convert("RGB")
    # 右下角「即梦 AI」类水印
    blur_box(im, 0.74, 0.84, 1.0, 1.0, radius=48)
    im.save(path, optimize=True)


def process_img4(path: Path) -> None:
    im = Image.open(path).convert("RGB")
    # 中央影片分级 / Dreamina 文案块
    blur_box(im, 0.2, 0.34, 0.8, 0.64, radius=55)
    # 右下角水印
    blur_box(im, 0.76, 0.87, 1.0, 1.0, radius=50)
    im.save(path, optimize=True)


def main() -> int:
    p1 = ASSETS / "主页图片1.png"
    p4 = ASSETS / "主页图片4.png"
    if not p1.is_file() or not p4.is_file():
        print("Missing 主页图片1.png or 主页图片4.png in assets/", file=sys.stderr)
        return 1
    process_img1(p1)
    process_img4(p4)
    print("Updated:", p1.name, p4.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
