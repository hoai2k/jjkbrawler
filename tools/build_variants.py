#!/usr/bin/env python3
"""Seed and maintain `manifest["variants"]` — the per-pose list of drawings.

A pose can have more than one drawing to choose between: a redraw that may not
turn out better than what shipped, an alternate costume, a wind-up that reads as
a strike. The workbench picks between them; this script keeps the list itself
honest.

EVERY WORKBENCH JUDGEMENT BELONGS TO THE IMAGE. Each option carries its own
renderScale / ox / bodyBottom / anchors, because two drawings of the same action
are framed differently and one shared set of numbers would be wrong for at least
one of them — and its own review flags, because "fix alpha" is something you say
about a drawing, not about the action it happens to be serving. The SELECTED
option's fields are mirrored into `characters[char][pose]`, which is the only
thing the game reads — so the runtime never learns that variants exist.

What it does, all idempotent:

  * `--from-alternates` folds the legacy `alternates` section (Hanami's round-6
    redesign) into variants, so one mechanism covers every case instead of two.
    The legacy section is left in place: the Settings sprite-set toggle still
    reads it.
  * `--adopt CHAR POSE FILE` adds a drawing as a new option for a pose,
    measuring it if it has no placement of its own yet.
  * with no flags it just validates and reports.

Usage:
  python3 tools/build_variants.py --from-alternates
  python3 tools/build_variants.py --adopt meimei attack_heavy_a meimei/attack_heavy.png
  python3 tools/build_variants.py --dry-run
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")

# Mirrored onto the pose when an option is selected. Kept in step with
# VARIANT_BANKED in src/sprites.js — that list is what the workbench moves, this
# one is what gets written.
PLACEMENT = [
    "w", "h", "ox", "oy", "bodyBottom", "bodyH", "bodyTop",
    "centroidX", "renderScale", "rotationDeg", "anchors", "faceLeft",
]
REVIEW = ["needsReplacement", "wantsImprovement", "edited"]
BANKED = PLACEMENT + REVIEW


def option_from_meta(meta, label):
    """An option is a file plus everything that is true of that file: its own
    placement, and the review flags standing against it. A flag is a statement
    about a DRAWING — "this one has an unkeyed patch of background in it" — so
    it has to be seeded onto the option here, or the first variant switch would
    hand it to art it was never passed on."""
    opt = {"file": meta["file"], "label": label}
    for field in BANKED:
        if field in meta:
            opt[field] = meta[field]
    return opt


def ensure_entry(man, char, pose):
    """The variants entry for a pose, seeded from the pose's current art so the
    delivered drawing is always option zero rather than an implicit default."""
    variants = man.setdefault("variants", {}).setdefault(char, {})
    entry = variants.get(pose)
    if entry:
        return entry
    meta = man["characters"].get(char, {}).get(pose)
    if not meta:
        return None
    entry = {"options": [option_from_meta(meta, "Delivered")]}
    variants[pose] = entry
    return entry


def add_option(man, char, pose, file, label, log):
    entry = ensure_entry(man, char, pose)
    if entry is None:
        log.append(f"SKIP {char}/{pose}: pose not in manifest")
        return
    if any(o["file"] == file for o in entry["options"]):
        return  # already offered; adding it twice would just clutter the menu
    path = os.path.join(SPRITES, file)
    if not os.path.exists(path):
        log.append(f"SKIP {char}/{pose}: {file} not on disk")
        return
    entry["options"].append({"file": file, "label": label})
    log.append(f"{char}/{pose}: + {file} ({label})")


def from_alternates(man, log):
    """Fold the legacy whole-set `alternates` section into per-pose variants."""
    for char, frames in (man.get("alternates") or {}).items():
        for pose, meta in frames.items():
            if pose not in man["characters"].get(char, {}):
                # An alternate for a pose the default set never had. There is no
                # delivered drawing to offer it alongside, so it is not a choice
                # — leave it to the sprite-set toggle.
                log.append(f"SKIP {char}/{pose}: alternate-only pose, no default to pair with")
                continue
            entry = ensure_entry(man, char, pose)
            if any(o["file"] == meta["file"] for o in entry["options"]):
                continue
            entry["options"].append(option_from_meta(meta, "Alternate set"))
            log.append(f"{char}/{pose}: + {meta['file']} (Alternate set)")


def validate(man, log):
    """Every option must point at a file that exists, and the pose's own file
    must be one of its options — otherwise the workbench would show a selection
    that is not selected anywhere."""
    problems = 0
    for char, poses in (man.get("variants") or {}).items():
        for pose, entry in poses.items():
            meta = man["characters"].get(char, {}).get(pose)
            files = [o["file"] for o in entry["options"]]
            if meta and meta["file"] not in files:
                log.append(f"BROKEN {char}/{pose}: selected {meta['file']} is not among {files}")
                problems += 1
            for file in files:
                if not os.path.exists(os.path.join(SPRITES, file)):
                    log.append(f"BROKEN {char}/{pose}: missing file {file}")
                    problems += 1
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-alternates", action="store_true")
    ap.add_argument("--adopt", nargs=3, action="append", metavar=("CHAR", "POSE", "FILE"),
                    help="offer FILE as another drawing for CHAR's POSE")
    ap.add_argument("--label", default="Alternate")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    log = []

    if args.from_alternates:
        from_alternates(man, log)
    for char, pose, file in (args.adopt or []):
        add_option(man, char, pose, file, args.label, log)

    problems = validate(man, log)
    for line in log:
        print("  " + line)

    counts = sum(len(v) for v in (man.get("variants") or {}).values())
    print(f"  {counts} poses with variants")

    if problems:
        print(f"  {problems} problem(s) — nothing written")
        return 1
    if args.dry_run:
        print("  dry run — nothing written")
        return 0
    with open(MANIFEST, "w") as fh:
        json.dump(man, fh, indent=1)
        fh.write("\n")
    print(f"  wrote {MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
