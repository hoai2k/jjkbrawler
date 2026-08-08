#!/usr/bin/env python3
"""Remove key-colour fringe left along a keyed sprite's silhouette.

Chroma keying decides, per pixel, how much of the background to remove. It gets
the interior right and the EDGE wrong: an antialiased outline pixel is part
subject and part background, and a keyer that only adjusts alpha leaves the
background's colour sitting in the leftover. On a magenta key that reads as a
pink halo tracing every edge — subtle on one sprite, and unmistakable once the
same sprite is drawn against a dark stage.

The tell is where the key-coloured pixels are. Art that is genuinely pink or
purple has them THROUGHOUT; fringe has them only on the rim. So this does not
ask "is this pixel magenta" — Reggie's receipts have magenta print on them and
Uro's whole head is violet — it asks "is this pixel within a couple of pixels of
the silhouette edge AND close to the key colour". Both, or it is left alone.

What happens to a fringe pixel depends on how much of it is subject:

  mostly background (alpha < 128)   dropped. There was never enough of the
                                    subject there to be worth keeping, and the
                                    silhouette does not visibly change.
  mostly subject (alpha >= 128)     recoloured from its nearest non-fringe
                                    opaque neighbour, keeping its alpha. This is
                                    the pixel the eye reads as the outline, so
                                    deleting it would chew a notch out of the
                                    edge; it needs the right colour, not removal.

The alpha bounding box therefore does not move, which is what makes this safe to
run AFTER a workbench pass: every renderScale / bodyBottom / ox / anchor the
manifest holds is measured from that box and stays valid.

Usage:
  python3 dekey_fringe.py assets/sprites/reggie            # a directory
  python3 dekey_fringe.py assets/sprites/effects/stage_flower.png
  python3 dekey_fringe.py assets/sprites/reggie --key grey # grey-keyed art
  python3 dekey_fringe.py <path> --dry-run                 # measure only
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

try:
    from scipy import ndimage
except ImportError:
    sys.exit("scipy is required: pip install scipy")

# How close to the key a pixel has to be before it counts as contamination. Set
# from the deliveries: real fringe sits at 200+/200+ on the key's two channels
# with the third crushed, while art that merely leans pink keeps far more of it.
KEYS = {
    "magenta": lambda r, g, b: (r > 200) & (b > 200) & (g < 90),
    "grey": lambda r, g, b: (abs(r - 128) < 26) & (abs(g - 128) < 26) & (abs(b - 128) < 26),
    "green": lambda r, g, b: (g > 200) & (r < 90) & (b < 90),
}

# How far in from the silhouette edge fringe can reach. Keyers blur over about
# two pixels; three gives margin without reaching into the art.
RIM_DEPTH = 3


def defringe(path, key="magenta", dry_run=False):
    """Returns (dropped, recoloured) — the counts, whether or not it wrote."""
    img = np.array(Image.open(path).convert("RGBA"))
    rgb = img[:, :, :3].astype(int)
    a = img[:, :, 3]
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    opaque = a >= 128
    if not opaque.any():
        return 0, 0
    inner = ndimage.binary_erosion(opaque, iterations=RIM_DEPTH)
    # The rim includes the partly-transparent skirt outside the opaque core,
    # which is where most of the contamination actually lives.
    rim = ~inner & (a > 8)

    contaminated = rim & KEYS[key](r, g, b)
    if not contaminated.any():
        return 0, 0

    drop = contaminated & (a < 128)
    fix = contaminated & (a >= 128)

    if dry_run:
        return int(drop.sum()), int(fix.sum())

    out = img.copy()
    out[drop, 3] = 0

    if fix.any():
        # Nearest clean opaque pixel, by distance transform: for every pixel it
        # reports the index of the closest source, so one pass recolours the
        # whole set from whatever each one is actually next to rather than from
        # a global average that would smear one edge's colour onto another.
        clean = opaque & ~contaminated
        if clean.any():
            _, (iy, ix) = ndimage.distance_transform_edt(~clean, return_indices=True)
            out[fix, :3] = img[iy[fix], ix[fix], :3]
        else:
            out[fix, 3] = 0

    Image.fromarray(out).save(path)
    return int(drop.sum()), int(fix.sum())


def targets(path):
    if os.path.isfile(path):
        return [path]
    return sorted(os.path.join(path, f) for f in os.listdir(path) if f.endswith(".png"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", help="PNG files or directories of them")
    ap.add_argument("--key", default="magenta", choices=sorted(KEYS),
                    help="the colour the art was keyed on (default magenta)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    total_drop = total_fix = touched = 0
    for root in args.paths:
        for path in targets(root):
            drop, fix = defringe(path, args.key, args.dry_run)
            if drop or fix:
                touched += 1
                total_drop += drop
                total_fix += fix
                print(f"  {os.path.relpath(path):48} dropped {drop:6}  recoloured {fix:6}")
    verb = "would clean" if args.dry_run else "cleaned"
    print(f"{verb} {total_drop + total_fix} fringe pixel(s) across {touched} sprite(s)"
          + (" (dry run — nothing written)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
