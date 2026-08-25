#!/usr/bin/env python3
"""A re-key of the same plate must not move the sprite.

`ox`/`oy` place the trimmed image in the cell and the art is drawn at
((ox - CELL_W/2) + imgX) * renderScale, so a source pixel stays where it was if
and only if `ox` moves by exactly the change in the trim box's left edge. Before
`srcBox` the import could only line the new SILHOUETTE up with the old one —
right for a re-crop of an unchanged drawing, wrong for a re-key, because a re-key
is a change to the silhouette. It cost up to 111 rendered pixels on Gojo's fall.

This asserts the invariant directly: pick a source pixel, work out where it lands
on screen under the old placement and under the new one, and require the two to
agree. No manifest is written; the frames are synthesised so the test says the
same thing on a bare checkout.

  python3 tools/test_rekey_placement.py
"""
import intake_import

import sys

import numpy as np

CELL_W = 512


def screen_x(meta, source_x):
    """Where a pixel of the DELIVERED plate lands, in game pixels."""
    img_x = source_x - meta["srcBox"][0]
    return ((meta["ox"] - CELL_W / 2) + img_x) * meta["renderScale"]


def screen_y(meta, source_y):
    img_y = source_y - meta["srcBox"][1]
    return ((meta["oy"]) + img_y) * meta["renderScale"]


def frame(w, h):
    """A trimmed frame that is opaque everywhere, which is all the old rule reads."""
    out = np.zeros((h, w, 4), np.uint8)
    out[:, :, 3] = 255
    return out


def case(name, old_box, new_box, old_meta, checks):
    """One re-key: same plate, a matte that reaches different bounds."""
    fails = 0
    old_frame = frame(old_box[2] - old_box[0], old_box[3] - old_box[1])
    new_frame = frame(new_box[2] - new_box[0], new_box[3] - new_box[1])
    meta = dict(old_meta)
    meta["srcBox"] = list(new_box)
    out = intake_import.reframe_placement(meta, old_meta, old_frame, new_frame,
                                          boxes=(old_box, new_box))
    out["srcBox"] = list(new_box)
    for sx, sy in checks:
        dx = abs(screen_x(out, sx) - screen_x(old_meta, sx))
        dy = abs(screen_y(out, sy) - screen_y(old_meta, sy))
        ok = dx < 1e-6 and dy < 1e-6
        if not ok:
            fails += 1
        print(f"{'OK  ' if ok else 'FAIL'} {name}: the pixel at ({sx},{sy}) of the plate "
              f"lands in the same place  ({dx:.4f}, {dy:.4f}) px")
    return fails


OLD = {"ox": -300.0, "oy": -820, "renderScale": 0.25, "srcBox": [200, 300, 900, 1400],
       "centroidX": 140.0}

fails = 0
# a matte that reaches further out on every side — a shadow recovered all round
fails += case("grows on all sides", [200, 300, 900, 1400], [180, 260, 940, 1430], OLD,
              [(500, 800), (210, 320), (880, 1380)])
# a matte that cuts a gap out of one side only — the case that moved the sprite
fails += case("cut back on one side", [200, 300, 900, 1400], [340, 300, 900, 1400], OLD,
              [(500, 800), (860, 1350)])
# the feet come back, which moves the bottom and nothing else
fails += case("taller at the feet", [200, 300, 900, 1400], [200, 300, 900, 1480], OLD,
              [(500, 800), (300, 1450)])
# and the case that must keep working: nothing changed at all
fails += case("unchanged bounds", [200, 300, 900, 1400], [200, 300, 900, 1400], OLD,
              [(500, 800)])

# Without the boxes it falls back to the silhouette rule, which is the behaviour
# every earlier import had; assert it still runs rather than what it produces.
out = intake_import.reframe_placement(dict(OLD), OLD, frame(700, 1100), frame(760, 1170))
print(f"{'OK  ' if 'ox' in out else 'FAIL'} the silhouette rule still answers when no "
      f"box is known  ox={out['ox']}")
fails += 0 if "ox" in out else 1

print(f"\n{'all placement checks passed' if not fails else f'{fails} check(s) failed'}")
sys.exit(1 if fails else 0)
