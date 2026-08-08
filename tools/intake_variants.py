#!/usr/bin/env python3
"""Import intake art as an ALTERNATE drawing for a pose, not as a replacement.

`intake_import.py` answers "this art is better, swap it in". This answers the
other question: "this art is *different*, keep both and let the workbench
choose". That is the right import for a redraw that may or may not beat what
shipped, a second costume, or a wind-up that turned out to read as a strike.

The imported file lands beside the existing one rather than on top of it:

    assets/sprites/<char>/<pose>.png            unchanged, still selected
    assets/sprites/<char>/alt/<pose>.png        the new drawing
    manifest["variants"][char][pose].options    both, each with its own placement

Placement is measured for the new drawing from scratch, because it IS a
different drawing — inheriting the incumbent's size and foot line is exactly the
mistake variants exist to avoid.

Nothing about what the game draws changes: the pose keeps pointing at whatever
it pointed at before. Selecting the new option is a decision made by eye in the
sprite workbench, then exported and applied like any other adjustment.

## Finding what has not been used

    python3 tools/intake_variants.py --survey

lists every plate under `assets/intake/` and says, for each, whether the pose it
names is already registered, already has this drawing, or is new. Run it first —
a delivery folder usually contains a mix.

Usage:
  python3 tools/intake_variants.py --survey
  python3 tools/intake_variants.py --import-all --label "Round 7 unused" --dry-run
  python3 tools/intake_variants.py --import meimei attack_heavy --label "Raised axe"
"""

import argparse
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

import intake
import intake_import
import build_variants

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
INTAKE = os.path.join(HERE, "..", "assets", "intake")
MANIFEST = os.path.join(SPRITES, "manifest.json")

# Where an alternate drawing lives, so the delivered art keeps the plain name and
# a directory listing reads as "the set, plus the alternates".
ALT_DIR = "alt"


def processed_plates():
    """Every keyed plate waiting in _processed, as (char, pose, path)."""
    out = []
    root = intake.PROCESSED
    if not os.path.isdir(root):
        return out
    for char in sorted(os.listdir(root)):
        cdir = os.path.join(root, char)
        if not os.path.isdir(cdir):
            continue
        for name in sorted(os.listdir(cdir)):
            if name.lower().endswith(".png"):
                out.append((char, os.path.splitext(name)[0], os.path.join(cdir, name)))
    return out


def raw_plates():
    """Every unprocessed upload, so --survey can report art that has not even
    been keyed yet rather than silently ignoring it."""
    out = []
    for char in sorted(os.listdir(INTAKE)):
        cdir = os.path.join(INTAKE, char)
        if not os.path.isdir(cdir) or char.startswith("_"):
            continue
        for name in sorted(os.listdir(cdir)):
            if name.lower().endswith((".png", ".jpg", ".jpeg")):
                out.append((char, os.path.splitext(name)[0], os.path.join(cdir, name)))
    return out


def survey(man):
    processed = {(c, p) for c, p, _ in processed_plates()}
    rows = []
    for char, pose, path in raw_plates():
        registered = man["characters"].get(char, {}).get(pose)
        entry = (man.get("variants") or {}).get(char, {}).get(pose)
        alt_file = f"{char}/{ALT_DIR}/{pose}.png"
        if entry and any(o["file"] == alt_file for o in entry["options"]):
            status = "already imported as a variant"
        elif not registered:
            status = "NEW POSE — nothing registered under this name"
        else:
            status = "would become a variant of the delivered art"
        keyed = "keyed" if (char, pose) in processed else "NOT KEYED — run intake.py"
        rows.append((char, pose, keyed, status))
    return rows


def import_one(man, char, pose, label, dry_run, log):
    src = os.path.join(intake.PROCESSED, char, f"{pose}.png")
    if not os.path.exists(src):
        log.append(f"SKIP {char}/{pose}: not in _processed — run tools/intake.py first")
        return False
    if pose not in man["characters"].get(char, {}):
        log.append(f"SKIP {char}/{pose}: no delivered art to be an alternate OF. "
                   f"Use intake_import.py to register it as the pose itself.")
        return False

    rel = f"{char}/{ALT_DIR}/{pose}.png"
    entry = build_variants.ensure_entry(man, char, pose)
    if any(o["file"] == rel for o in entry["options"]):
        log.append(f"SKIP {char}/{pose}: {rel} is already an option")
        return False

    # Measured fresh. A different drawing gets its own numbers — that is the
    # whole point of placement travelling with the image.
    frame = np.asarray(Image.open(src).convert("RGBA"))
    idle = man["characters"].get(char, {}).get("idle_a")
    meta = intake_import.place(frame, None, idle, keep_scale=False)
    meta["file"] = rel

    option = {"file": rel, "label": label}
    for field in build_variants.PLACEMENT:
        if field in meta:
            option[field] = meta[field]

    if not dry_run:
        os.makedirs(os.path.join(SPRITES, char, ALT_DIR), exist_ok=True)
        shutil.copy2(src, os.path.join(SPRITES, rel))
        entry["options"].append(option)
    log.append(f"{char}/{pose}: + {rel} ({label}) "
               f"{meta['w']}x{meta['h']} renderScale={meta['renderScale']}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--survey", action="store_true",
                    help="report what is waiting in intake and what would happen to it")
    ap.add_argument("--import", dest="one", nargs=2, metavar=("CHAR", "POSE"), action="append")
    ap.add_argument("--import-all", action="store_true",
                    help="import every keyed plate that has delivered art to sit beside")
    ap.add_argument("--label", default="Alternate")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))

    if args.survey:
        rows = survey(man)
        if not rows:
            print("  nothing in assets/intake/")
        for char, pose, keyed, status in rows:
            print(f"  {char}/{pose:22} {keyed:26} {status}")
        return 0

    log, changed = [], 0
    targets = list(args.one or [])
    if args.import_all:
        targets = [(c, p) for c, p, _ in processed_plates()]
    if not targets:
        ap.error("nothing to do — pass --survey, --import CHAR POSE, or --import-all")

    for char, pose in targets:
        if import_one(man, char, pose, args.label, args.dry_run, log):
            changed += 1

    for line in log:
        print("  " + line)
    if args.dry_run:
        print(f"  dry run — {changed} change(s) not written")
        return 0
    if changed:
        with open(MANIFEST, "w") as fh:
            json.dump(man, fh, indent=1)
            fh.write("\n")
        print(f"  wrote {MANIFEST} ({changed} variant(s) added)")
    else:
        print("  nothing to write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
