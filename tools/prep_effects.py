#!/usr/bin/env python3
"""Prepare delivered effect/summon art for the game.

Generated art arrives with transparent padding around the subject (often 25-46%
of the canvas). That padding is not cosmetic: the renderer sizes a sprite by its
image height (`spriteH`), so padding makes the effect draw undersized, and it
shifts the art off the projectile's collision center / off the ground line.

This tool:
  1. trims each PNG to its alpha bounding box,
  2. drops stray specks that survive the chroma key,
  3. downscales to a game-relevant resolution,
  4. reports before/after so regressions are visible.

Idempotent — safe to re-run after every art delivery.

Usage:  python3 prep_effects.py [--dirs effects,summons] [--max 700] [--dry-run]
"""

import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "sprites")

ALPHA_FLOOR = 8       # below this is treated as fully transparent
MIN_SPECK_PX = 40     # isolated blobs smaller than this are keying noise


def prep(path, max_dim, dry_run=False):
    img = np.array(Image.open(path).convert("RGBA"))
    h0, w0 = img.shape[:2]
    a = img[:, :, 3]

    solid = a >= 40
    if solid.any():
        labels, n = ndimage.label(solid, structure=np.ones((3, 3), np.int8))
        counts = np.bincount(labels.ravel())
        counts[0] = 0
        keep_ids = np.nonzero(counts >= MIN_SPECK_PX)[0]
        if len(keep_ids):
            # keep only pixels near a surviving component (preserves soft glow)
            keep_mask = np.isin(labels, keep_ids)
            near = ndimage.binary_dilation(keep_mask, iterations=6)
            img[~near & (a > 0), 3] = 0
            a = img[:, :, 3]

    ys, xs = np.nonzero(a > ALPHA_FLOOR)
    if len(ys) == 0:
        return f"{os.path.basename(path):24s} EMPTY — skipped"

    img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    out = Image.fromarray(img)
    if max(out.size) > max_dim:
        out.thumbnail((max_dim, max_dim), Image.LANCZOS)

    before = os.path.getsize(path)
    if not dry_run:
        out.save(path, optimize=True)
    after = os.path.getsize(path)
    return (f"{os.path.basename(path):24s} {w0}x{h0} -> {out.size[0]}x{out.size[1]}  "
            f"{before/1024:6.0f}KB -> {after/1024:6.0f}KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dirs", default="effects,summons")
    ap.add_argument("--max", type=int, default=700)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for sub in args.dirs.split(","):
        folder = os.path.join(ROOT, sub.strip())
        if not os.path.isdir(folder):
            print(f"(no {sub} directory)")
            continue
        print(f"--- {sub}")
        for fn in sorted(os.listdir(folder)):
            if fn.lower().endswith(".png"):
                print("   ", prep(os.path.join(folder, fn), args.max, args.dry_run))


if __name__ == "__main__":
    main()
