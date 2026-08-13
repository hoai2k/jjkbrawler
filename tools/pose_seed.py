"""Seed a character's pose reads from a character that has been read by hand.

Reading 1280 frames by eye is not a thing anyone is going to finish, and an
empty editor is a worse starting point than an approximate one: dragging six
joints into place is a minute's work, placing sixteen from nothing is not. So
every character starts from the hand-read reference (Yuji), fitted to its own
art, and the editor is where the fit becomes a read.

The transfer works because the sheets were all drawn to one brief
(sprites/docs/pose-brief.md): `crouch_a` means the same thing on every sheet,
so the reference's joints are already in roughly the right relationship. What
differs is the body — height, limb length, how much of the cell the drawing
fills. So the fit is:

  1. take the reference frame OF THE SAME NAME (falling back to its idle for a
     frame the reference does not have, e.g. the unnamed grid cells);
  2. map the reference's ink bounding box onto this frame's, per axis, which
     absorbs the difference in build and in how the frame was cropped;
  3. pull any joint that landed off the drawing onto the nearest ink.

Step 3 is what makes the seed usable rather than merely plausible: a joint on
the art can be dragged a little, a joint floating beside it has to be found
first. Every pose is stamped with where it came from, and the editor shows
that stamp, because a derived seed is a guess and must never be mistaken for
a read.

    python3 tools/pose_seed.py                 # every frame that has no read yet
    python3 tools/pose_seed.py --chars panda,jogo --force   # start those two again
"""

import argparse
import sys

import pose_reads as pr

REFERENCE = "yuji"
#: A frame the reference has no drawing for falls back to this pose of theirs.
FALLBACK = "idle_a"
#: Pull a joint onto the art when the fit leaves it further than this off, in
#: cell percent. Below it, the fit is already inside the outline's slop.
SNAP_OVER = 1.5


def fit(joints, src_box, dst_box):
    sx0, sy0, sx1, sy1 = src_box
    dx0, dy0, dx1, dy1 = dst_box
    kx = (dx1 - dx0) / (sx1 - sx0) if sx1 > sx0 else 1.0
    ky = (dy1 - dy0) / (sy1 - sy0) if sy1 > sy0 else 1.0
    return {
        name: [round(dx0 + (x - sx0) * kx, 1), round(dy0 + (y - sy0) * ky, 1)]
        for name, (x, y) in joints.items()
    }


def seed_character(man, char, ref, ref_boxes, force=False):
    """Seed the frames this character has no read for, and only those.

    A read is written once and then worked on: every pose the editor has been
    through carries a `source` stamp, and reseeding one throws that away. But a
    round of intake adds FRAMES, not characters — round 20 landed four new
    poses on twenty-seven sheets — and `check_pose_reads.mjs` fails on a frame
    with no pose, so "the file exists, leave it alone" left the only way out as
    `--force`, which reseeds the whole sheet and discards every hand read to
    place four new poses. So the default is additive: existing poses are kept
    verbatim and the new frames are fitted beside them. `--force` still means
    what it said — start this character's read again from the reference.
    """
    kept = {}
    if not force:
        try:
            kept = pr.load(char).get("poses") or {}
        except FileNotFoundError:
            pass

    poses = {}
    for key in pr.frames(man, char):
        if key in kept:
            poses[key] = kept[key]
            continue
        template = ref["poses"].get(key) or ref["poses"][FALLBACK]
        from_key = key if key in ref["poses"] else FALLBACK
        ink = pr.cell_mask(pr.open_frame(man, char, key))
        if not ink:
            continue
        joints = fit(template["j"], ref_boxes[from_key], pr.ink_bbox(ink))
        for name, (x, y) in joints.items():
            nx, ny, d = pr.nearest_ink(x, y, ink)
            if d > SNAP_OVER:
                joints[name] = [nx, ny]
        poses[key] = {
            "seed": f"fitted from {REFERENCE}/{from_key}",
            "j": {j: joints[j] for j in pr.JOINTS},
        }

    added = len(poses) - sum(1 for key in poses if key in kept)
    if kept and not added:
        return None

    pr.dump(char, {
        "character": char,
        "facing": "right",
        "_about": f"Poses marked `seed` were fitted from the hand-read {REFERENCE} sheet, not "
                  f"read from this art: a starting point for the pose editor "
                  f"(render3d/workbench/?edit=pose), not a statement about how {char} is drawn. "
                  f"A pose carrying `source` has been through the editor and is a read.",
        "_joints": pr.JOINTS,
        "_seed": f"tools/pose_seed.py, from {REFERENCE}",
        "poses": poses,
    })
    return added


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chars", help="comma-separated; default every character")
    ap.add_argument("--force", action="store_true", help="overwrite existing read files")
    args = ap.parse_args()

    man = pr.manifest()
    ref = pr.load(REFERENCE)
    ref_boxes = {
        key: pr.ink_bbox(pr.cell_mask(pr.open_frame(man, REFERENCE, key)))
        for key in ref["poses"]
    }

    chars = args.chars.split(",") if args.chars else pr.characters(man)
    total = 0
    for char in chars:
        if char == REFERENCE:
            continue
        n = seed_character(man, char, ref, ref_boxes, force=args.force)
        if n is None:
            print(f"{char}: every frame already read, left alone")
        else:
            total += n
            print(f"{char}: {n} pose(s) seeded")
    print(f"{total} pose(s) written to {pr.READS}")


if __name__ == "__main__":
    sys.exit(main())
