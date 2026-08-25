#!/usr/bin/env python3
"""A verdict answers the region it lands in, and not its neighbours.

`sealed_regions.py` takes a region off the shadow-or-gap queue when somebody has
answered it. It used to decide that by testing the answer's point against the
region's `crop` — the window the bench DRAWS, which is the patch plus 130px of
margin all round. On a crowded plate that margin covers the neighbours, so one
answer quietly took several regions off the queue; and they were never fixed,
because `intake.settled` carries a verdict out by the region that CONTAINS the
point. The two halves have to agree, or work disappears.

Two patches 60px apart, one answered:

  python3 tools/test_sealed_matching.py
"""
import os
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sealed_regions

KEY = (128, 128, 128)
FIGURE = (200, 60, 60)          # not pale: shading_on_pale must not weigh in


def plate(path):
    """A figure with two sealed patches of key colour in it, 60px apart."""
    a = np.zeros((400, 400, 3), np.uint8)
    a[:, :] = KEY
    a[80:320, 80:320] = FIGURE
    a[150:180, 150:180] = KEY            # patch A, 900px
    a[150:180, 240:270] = KEY            # patch B, 900px, 60px away
    Image.fromarray(a).convert("RGBA").save(path)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "plate.png")
        plate(path)
        rows, at = sealed_regions.regions_of(path)
        if len(rows) != 2:
            print(f"FAIL: expected 2 regions, found {len(rows)}")
            return 1
        a, b = sorted(rows, key=lambda r: r["x"])
        # The premise: B's seed IS inside A's drawn window. That is what made
        # the old test wrong, so if it stops being true this test proves nothing.
        x0, y0, x1, y1 = a["crop"]
        if not (x0 <= b["x"] < x1 and y0 <= b["y"] < y1):
            print("FAIL: the patches are no longer close enough to test anything")
            return 1
        if at((a["x"], a["y"])) != rows.index(a):
            print("FAIL: a region's own seed does not resolve to it")
            return 1
        if at((b["x"], b["y"])) == rows.index(a):
            print("FAIL: B's seed resolves to A — one answer would take both")
            return 1
        if at((5, 5)) is not None:
            print("FAIL: a point in the background resolves to a region")
            return 1
    print("a verdict answers its own region only — 2 patches, 60px apart")
    return 0


if __name__ == "__main__":
    sys.exit(main())
