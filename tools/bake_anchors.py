#!/usr/bin/env python3
"""Measure each sprite's centre of mass and bake it into the manifest.

Rotation needs a pivot. Without one the renderer falls back to a heuristic —
the detected horizontal centroid at a fixed fraction of body height (see
`defaultCom` in src/sprites.js) — which is close enough on an upright idle and
poor on anything sprawled, crouched or mid-swing, exactly the poses that rotate
most. The honest answer is the opaque pixels' own centroid, which for uniform
density IS the centre of mass.

That is per-pixel work, so it happens here rather than at runtime: the renderer
does no pixel work by design (docs/audit-guide.md). This writes

    "anchors": { "com": [x, y] }

into every frame of assets/sprites/manifest.json, in the SOURCE IMAGE's own
pixels measured from its top-left corner — the same space the workbench edits,
so a baked value can be dragged afterwards and a hand-placed one is never
silently overwritten.

Usage:
  python3 bake_anchors.py                 # every character, skip hand-edited
  python3 bake_anchors.py --only gojo maki
  python3 bake_anchors.py --force         # re-measure even hand-placed anchors
  python3 bake_anchors.py --dry-run
"""

import argparse
import json
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")

# Ignore near-transparent pixels: soft glow and antialiased edges extend well
# past the body and would drag the centroid toward whichever side the effect
# happens to bloom on.
ALPHA_FLOOR = 40


# Sprite art is ~1000 px square and there are hundreds of frames, so the
# centroid is measured on a downsampled copy. Thresholding happens FIRST, at
# full resolution, and the box filter then turns that mask into an area weight
# per cell — so the result is the true mask centroid, not an approximation of
# it, and it lands well inside a tenth of a source pixel.
WORK_SIZE = 160


def centroid(path):
    """Centroid of the opaque body, in the image's own pixels. None if empty."""
    with Image.open(path) as im:
        alpha = im.convert("RGBA").getchannel("A")
        full_w, full_h = alpha.size
        mask = alpha.point(lambda a: 255 if a >= ALPHA_FLOOR else 0)
        scale = max(full_w, full_h) / WORK_SIZE
        if scale > 1:
            small = mask.resize((max(1, round(full_w / scale)),
                                 max(1, round(full_h / scale))), Image.BOX)
        else:
            small = mask
            scale = 1.0

    w, h = small.size
    data = small.getdata()
    total = 0.0
    sx = 0.0
    sy = 0.0
    for i, weight in enumerate(data):
        if weight:
            total += weight
            sx += (i % w) * weight
            sy += (i // w) * weight
    if total == 0:
        return None
    # +0.5 moves from cell index to cell centre before scaling back up
    return (round((sx / total + 0.5) * scale, 1),
            round((sy / total + 0.5) * scale, 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="limit to these character keys")
    ap.add_argument("--force", action="store_true",
                    help="overwrite anchors that were placed by hand")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    chars = man["characters"]
    targets = args.only or sorted(chars)

    wrote, kept, missing = 0, 0, []
    for char in targets:
        frames = chars.get(char)
        if frames is None:
            missing.append(f"unknown character '{char}'")
            continue
        for key, meta in sorted(frames.items()):
            anchors = meta.get("anchors") or {}
            if "com" in anchors and not args.force:
                kept += 1
                continue
            path = os.path.join(SPRITES, meta["file"])
            if not os.path.exists(path):
                missing.append(f"{char}/{key}: {meta['file']} not on disk")
                continue
            point = centroid(path)
            if point is None:
                missing.append(f"{char}/{key}: fully transparent")
                continue
            before = anchors.get("com")
            meta.setdefault("anchors", {})["com"] = list(point)
            wrote += 1
            print(f"  {char}/{key}: {before} -> {list(point)}")

    for line in missing:
        print("  SKIP " + line)
    print(f"{wrote} measured, {kept} kept (already placed), {len(missing)} skipped")

    if args.dry_run:
        print("(dry run — manifest not written)")
        return
    if wrote:
        json.dump(man, open(MANIFEST, "w"), indent=1)
        print("manifest updated")


if __name__ == "__main__":
    main()
