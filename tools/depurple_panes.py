#!/usr/bin/env python3
"""Turn key-coloured translucent panes back into the glass they were drawn as.

WHY THIS IS NOT dekey_fringe.py

That tool cleans the two-pixel halo a chroma key leaves along a CUT edge, and
its whole premise is that contamination hugs the alpha boundary. Tengen's
barriers break that premise: the artist painted them as translucent sheets, the
magenta screen shone straight through the sheet rather than only past its edge,
and the keyer — which only ever decides how much background to REMOVE — kept the
pixels because there was subject there. What it kept is the subject blended with
the screen, over the pane's whole area. `ult_a` is 44% such pixels; there is
nothing edge-like about them, so the edge test never looked at one.

WHAT IT DOES

Per pixel, how far the key's channels lead the one it suppresses — the same
`lean` dekey_fringe measures — ramped from LO to HI so the pane's own soft
gradients come out whole instead of stepping at a threshold:

  colour   pulled toward the pixel's own brightest channel, which is where a
           white sheet under a magenta screen started. That keeps the streaks,
           the star patterns and the rim highlights the drawing has, and takes
           only the hue. Its ramp is the SHORTER of the two and finishes early
           (COL_LO..COL_HI), because a partly-neutralised pixel is still a pink
           pixel: the pale panes of `summons/pure_barrier.png` are a pastel
           blend that never reaches the screen's own saturation, and a ramp
           scaled to the saturated case left them pink.
  alpha    scaled down over the longer ramp (LO..HI), because how transparent a
           pane should be does follow how much of it was screen. A
           fully-magenta pixel keeps a little over half its alpha.

WHAT IT WILL NOT DO IS MOVE THE ALPHA BOUNDING BOX. Every renderScale,
bodyBottom, ox and anchor in the manifest is measured from that box, so a
visible pixel is never taken below alpha 9 and an opaque one never below 128 —
which leaves the box identical under any threshold a measuring tool might use.
Run it after a workbench pass without re-measuring anything.

WHERE IT DOES NOT APPLY: art that is MEANT to be purple. This does not
distinguish "the screen bled through" from "the artist chose violet" and cannot
— on Uro's hair or `effects/aura_violet.png` it would launder the design. So it
takes explicit paths and has no roster-wide mode: naming the art is the check.

Usage:
  python3 tools/depurple_panes.py sprites/assets/tengen
  python3 tools/depurple_panes.py assets/sprites/effects/star_tomb.png --achromatic
  python3 tools/depurple_panes.py sprites/assets/tengen --dry-run
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

# How much of the key is in a pixel. Identical to dekey_fringe's magenta lean:
# what survives a blend is the RELATION between channels, not an absolute value.
def lean_of(r, g, b):
    return np.minimum(r, b) - g


# The ramp. Below LO is ordinary cool shading in a grey robe and is left alone;
# at HI and above the pixel is as magenta as the screen itself. Tengen's clean
# frames sit at a median lean of 0 with a 99th percentile of 7, and his panes
# run 100-140, so there is a wide gap to put these in.
LO = 25
HI = 90

# The colour ramp: below COL_LO is shading a grey robe genuinely has, and by
# COL_HI the hue is gone entirely. Tengen's clean frames run to a 99th
# percentile lean of 7, so COL_LO clears them with room to spare.
COL_LO = 10
COL_HI = 45

# What a fully-magenta pixel keeps. Chosen so an OPAQUE pane pixel lands on 132
# rather than under 128: see the bounding-box note in the docstring.
KEEP = 0.52

#: Never take a visible pixel out of the silhouette.
FLOOR = 9


def depurple(path, dry_run=False, achromatic=False):
    """Returns (touched, area) — pixels changed, and the visible area."""
    img = np.array(Image.open(path).convert("RGBA"))
    rgb = img[:, :, :3].astype(np.float64)
    a = img[:, :, 3].astype(np.float64)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    visible = a > 8
    lean = lean_of(r, g, b)
    t = np.clip((lean - LO) / (HI - LO), 0.0, 1.0) * visible
    # `achromatic` drops the colour ramp's floor to nothing, for art that is
    # meant to carry no hue at all. A pale pane is a blend the screen never
    # saturated — `summons/pure_barrier.png` sits at a lean of 25 where the
    # character sheets' panes sit at 120 — and a floor set to clear a grey
    # robe's shading leaves the whole sheet reading pink. There is no robe on
    # these drawings to protect, so nothing is traded away.
    lo = 0.0 if achromatic else COL_LO
    tc = np.clip((lean - lo) / (COL_HI - lo), 0.0, 1.0) * visible
    hit = tc > 0
    touched = int(hit.sum())
    if not touched or dry_run:
        return touched, int(visible.sum())

    # The brightest channel is where a white sheet under a magenta screen
    # started: the screen adds to red and blue and leaves green behind, so green
    # is the contaminated reading and the maximum is the honest one.
    neutral = rgb.max(axis=2)[:, :, None]
    out = rgb + (neutral - rgb) * tc[:, :, None]

    faded = a * (1.0 - (1.0 - KEEP) * t)
    faded = np.where(visible, np.maximum(faded, FLOOR), faded)
    faded = np.where(a >= 128, np.maximum(faded, 128), faded)

    img[:, :, :3] = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    img[:, :, 3] = np.clip(np.rint(faded), 0, 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(path)
    return touched, int(visible.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", help="PNG files, or directories of them")
    ap.add_argument("--dry-run", action="store_true", help="measure only")
    ap.add_argument("--achromatic", action="store_true",
                    help="take the hue out entirely — for art that should carry none")
    args = ap.parse_args()

    files = []
    for p in args.paths:
        if os.path.isdir(p):
            files += [os.path.join(p, f) for f in sorted(os.listdir(p)) if f.endswith(".png")]
        elif p.endswith(".png"):
            files.append(p)
        else:
            sys.exit(f"not a png or a directory: {p}")

    total = 0
    for f in files:
        touched, area = depurple(f, args.dry_run, args.achromatic)
        total += touched
        if touched:
            print(f"  {f:<52} {touched:8d} px  ({touched / max(area, 1) * 100:5.1f}% of the drawing)")
    tail = " (dry run — nothing written)" if args.dry_run else ""
    print(f"{'would neutralise' if args.dry_run else 'neutralised'} {total} pixel(s) "
          f"across {len(files)} sprite(s){tail}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
