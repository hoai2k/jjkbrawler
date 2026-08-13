#!/usr/bin/env python3
"""Every summon plate has to be ONE creature.

A sprite sheet of six variations is a normal thing for a generator to return
and a useless thing for the game to draw: `summons.js` paints the whole file at
the creature's height, so a six-across strip puts six shikigami on the stage
standing in a row, at a sixth of the size each, and the hit box derived from
that plate is six creatures wide.

It is not visible in a thumbnail — a strip of six dogs at 200px looks like a
dog — which is how a whole delivery round of it reached the game. So it is
checked here instead of by eye.

    python3 tools/check_summon_plates.py [--json]

The test is connected components of the alpha mask: one creature is one blob
(plus stray wisps), a sheet is three or more blobs of comparable size laid out
in a row or a grid. Detached art — a floating wheel, a thrown chain — reads as
one big blob and some small ones, so it passes.

Exit code 1 if any plate is a sheet, so it can gate a delivery.
"""
import glob
import json
import os
import sys
from collections import deque

from PIL import Image

SUMMON_DIR = "assets/sprites/summons"

# The mask is measured at this width. Small enough to be quick over a hundred
# plates, large enough that a rabbit's ear is still connected to the rabbit.
SAMPLE_W = 180
ALPHA_ON = 24

# A blob smaller than this share of the drawing's ink is a wisp, a spark or a
# shadow — not one of the figures the plate is laid out from.
FIGURE_SHARE = 0.06

# Three of them is a sheet. Two is ambiguous on purpose: a creature and its
# detached prop (Mahoraga's wheel, a thrown chain) is a real single subject and
# is much more common than a two-up sheet.
SHEET_FIGURES = 3


def figures(path):
    """The comparable-size blobs in a plate's alpha, largest first."""
    im = Image.open(path).convert("RGBA")
    h = max(1, round(SAMPLE_W * im.height / im.width))
    mask = im.split()[3].resize((SAMPLE_W, h))
    px = mask.load()
    seen = [[False] * h for _ in range(SAMPLE_W)]
    blobs = []
    for x in range(SAMPLE_W):
        for y in range(h):
            if px[x, y] < ALPHA_ON or seen[x][y]:
                continue
            queue, area = deque([(x, y)]), 0
            seen[x][y] = True
            while queue:
                cx, cy = queue.popleft()
                area += 1
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if (0 <= nx < SAMPLE_W and 0 <= ny < h
                                and not seen[nx][ny] and px[nx, ny] >= ALPHA_ON):
                            seen[nx][ny] = True
                            queue.append((nx, ny))
            blobs.append(area)
    blobs.sort(reverse=True)
    ink = sum(blobs) or 1
    return [b for b in blobs if b >= FIGURE_SHARE * ink], im.size


def main():
    rows = []
    for path in sorted(glob.glob(f"{SUMMON_DIR}/*.png")):
        big, size = figures(path)
        rows.append({
            "file": os.path.relpath(path),
            "name": os.path.basename(path),
            "size": list(size),
            "figures": len(big),
            "sheet": len(big) >= SHEET_FIGURES,
        })

    sheets = [r for r in rows if r["sheet"]]
    if "--json" in sys.argv:
        print(json.dumps({"checked": len(rows), "sheets": sheets}, indent=1))
    else:
        print(f"checked {len(rows)} summon plate(s)")
        if not sheets:
            print("ok   every plate is one creature")
        else:
            print(f"FAIL {len(sheets)} plate(s) hold more than one figure — "
                  "the game draws the whole file as one summon\n")
            by_creature = {}
            for r in sheets:
                stem = r["name"].rsplit(".", 1)[0]
                for suffix in ("_idle_a", "_idle_b", "_move_a", "_move_b", "_attack", "_hurt"):
                    if stem.endswith(suffix):
                        stem = stem[: -len(suffix)]
                        break
                by_creature.setdefault(stem, []).append(r)
            for creature, items in sorted(by_creature.items()):
                poses = ", ".join(i["name"].rsplit(".", 1)[0].replace(f"{creature}_", "") or "still"
                                  for i in items)
                print(f"  {creature:24} {len(items)} plate(s): {poses}")
    return 1 if sheets else 0


if __name__ == "__main__":
    sys.exit(main())
