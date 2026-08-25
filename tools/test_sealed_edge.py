#!/usr/bin/env python3
"""A cut from inside the figure leaves no screen colour at its edge.

Removing a sealed region used to be one line — set its alpha to zero — and that
left the boundary behind. The ring between the patch and the arm beside it is a
BLEND of the screen and the drawing, and it fails `flat_key_mask`'s variance
test precisely because it is a gradient, so it survived at full opacity in the
screen's own colour: a grey outline around every gap keyed out from inside a
figure. On Choso's four air attacks every rim pixel sat within 30 of the screen
colour.

The outer silhouette never had it, because it gets two steps the inner cut did
not — alpha ramped by nearness to the key, then the key unmixed out of whatever
stays partly opaque. `carry_the_edge` applies the same two.

  python3 tools/test_sealed_edge.py
"""
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import intake

KEY = (128, 128, 128)
SKIN = (206, 150, 120)
INK = (20, 16, 18)


def plate(path):
    """A figure with a sealed patch of screen in it, blurred so the boundary is
    a real gradient — which is what survived the old cut."""
    a = np.zeros((520, 520, 3), np.uint8)
    a[:, :] = KEY
    a[110:410, 110:410] = SKIN
    a[110:118, 110:410] = INK                  # the style outlines everything
    a[402:410, 110:410] = INK
    a[190:290, 190:290] = KEY                  # the gap under the arm
    img = Image.fromarray(a).filter(ImageFilter.GaussianBlur(1.4))
    img.convert("RGBA").save(path)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "plate.png")
        plate(path)
        frame, box, key = intake.key_and_trim(path, ref="test/sealed_edge")
        if frame is None:
            print("FAIL: the plate keyed to nothing")
            return 1
        opaque = frame[:, :, 3] > 0
        holes = ~opaque
        if not holes.any():
            print("FAIL: the sealed patch was not cut, so there is no edge to test")
            return 1
        from scipy import ndimage
        rim = ndimage.binary_dilation(holes, iterations=2) & opaque
        if not rim.any():
            print("FAIL: no rim around the cut")
            return 1
        d = np.linalg.norm(frame[:, :, :3].astype(np.float32) - key, axis=2)
        on_screen = float((d[rim] < 30).mean())
        if on_screen > 0.05:
            print(f"FAIL: {on_screen:.0%} of the cut's rim is still the screen colour "
                  f"(median distance {np.median(d[rim]):.0f})")
            return 1
        # And the figure is still there: a rim carried too far eats the arm.
        if opaque.sum() < 0.9 * (frame[:, :, 3] >= 0).sum() * 0.5:
            print("FAIL: the cut took too much of the figure with it")
            return 1
    print(f"a cut leaves no screen colour at its edge — {on_screen:.0%} of the rim, "
          f"median distance {np.median(d[rim]):.0f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
