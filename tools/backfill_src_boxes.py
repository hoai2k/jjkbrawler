#!/usr/bin/env python3
"""Record where each pose's art sat in the plate it was trimmed from.

`srcBox` is what makes a re-key free: `ox`/`oy` place the trimmed image in the
cell, so a source pixel only stays where it was if `ox` moves by exactly the
change in the trim box's left edge. Intake writes it from now on. This works out
the boxes for the art already in the tree, which was imported before it did.

HOW IT KNOWS. The file has been canonicalised to `<char>/<pose>.png` and carries
no note of the round it came from, so the round is found by KEYING each archived
candidate and seeing which one comes back as the art on disk — same bounds, same
alpha. That is a real test rather than a guess: if today's keyer cannot reproduce
what shipped, the box it computes is not the box that was used, and the pose is
reported and left alone rather than given a number that would move it.

Verdicts are suppressed while matching, because a verdict is a change the art on
disk does not have yet — that is the whole reason a re-key is pending.

  python3 tools/backfill_src_boxes.py --dry-run
  python3 tools/backfill_src_boxes.py
  python3 tools/backfill_src_boxes.py --chars gojo hakari
"""
import intake
import sprite_paths

import argparse
import contextlib
import glob
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
MANIFEST = sprite_paths.MANIFEST
SPRITES = sprite_paths.CHAR
# How much of the alpha has to agree before the match is believed. Not 100%:
# a plate keyed before a guard or a rule landed differs from today's output at
# the edges, and an edge is where every one of those changes shows up.
AGREE = 0.90


@contextlib.contextmanager
def without_verdicts():
    """Key as the art on disk was keyed: before anybody answered for it."""
    was = intake.SEALED_VERDICTS
    intake.SEALED_VERDICTS = {}
    try:
        yield
    finally:
        intake.SEALED_VERDICTS = was


def stem(path):
    return os.path.basename(path).split(".")[0].split("-")[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars", nargs="*")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    found, missed, skipped = [], [], 0
    for char, poses in sorted(man.get("characters", {}).items()):
        if args.chars and char not in args.chars:
            continue
        for pose, meta in sorted(poses.items()):
            if not isinstance(meta, dict) or meta.get("srcBox"):
                continue
            rel = meta.get("file")
            # A pose drawing another pose's file is placed against THAT drawing;
            # the box belongs to the drawing, and it will be written when the
            # pose that owns it is done.
            if not rel or stem(rel) != pose:
                skipped += 1
                continue
            path = os.path.join(SPRITES, rel)
            cands = sorted(glob.glob(os.path.join(ROOT, "assets", "reference",
                                                  "round*", char, f"{pose}.png")))
            if not os.path.exists(path) or not cands:
                skipped += 1
                continue
            now = np.asarray(Image.open(path).convert("RGBA"))
            hit = None
            with without_verdicts():
                for src in reversed(cands):          # newest round first
                    try:
                        frame, box, key = intake.key_and_trim(src, f"{char}/{pose}")
                    except Exception:
                        continue
                    if frame is None or frame.shape[:2] != now.shape[:2]:
                        continue
                    agree = float((np.abs(frame[:, :, 3].astype(int)
                                          - now[:, :, 3].astype(int)) <= 2).mean())
                    if agree >= AGREE:
                        hit = (box, agree, src)
                        break
            if hit is None:
                missed.append(f"{char}/{pose}")
                continue
            found.append((char, pose, [int(v) for v in hit[0]], hit[1],
                          os.path.relpath(hit[2], ROOT)))
            if not args.dry_run:
                meta["srcBox"] = [int(v) for v in hit[0]]

    for char, pose, box, agree, src in found[:12]:
        print(f"  {char}/{pose:26} {str(box):24} {agree*100:5.1f}%  {src.split('/')[2]}")
    if len(found) > 12:
        print(f"  ... {len(found) - 12} more")
    if missed:
        print(f"\n{len(missed)} pose(s) no archived plate reproduces — left alone, and a "
              "re-key of one still has to be placed by hand:")
        for ref in missed:
            print(f"    {ref}")
    print(f"\n{len(found)} box(es) {'would be ' if args.dry_run else ''}recorded, "
          f"{len(missed)} unmatched, {skipped} skipped (borrowed art or no plate)")
    if found and not args.dry_run:
        json.dump(man, open(MANIFEST, "w"), indent=1)
        open(MANIFEST, "a").write("\n")
        print("manifest updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
