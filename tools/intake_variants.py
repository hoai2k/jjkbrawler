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

## The flags decide, not the operator

`--plan` reads the flag already on each pose and says what the incoming art
should do about it. Someone sat in the workbench and recorded what was wrong with
the old drawing; the import acts on that rather than asking again. See
DISPOSITIONS below for the four outcomes.

## Finding what has not been used

    python3 tools/intake_variants.py --survey

lists every plate under `assets/intake/` and says, for each, whether the pose it
names is already registered, already has this drawing, or is new. Run it first —
a delivery folder usually contains a mix.

Usage:
  python3 tools/intake_variants.py --survey
  python3 tools/intake_variants.py --plan
  python3 tools/intake_variants.py --auto --label "Round 9 upload" --dry-run
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

# ------------------------------------------------------------------ disposition
#
# What happens to an incoming plate depends on what the pose it names was already
# flagged as, because the flag IS the instruction. Someone sat in the workbench
# and said what was wrong with the old art; the import should act on that rather
# than ask again.
#
#   new       nothing registered under this name -> import it as the pose itself
#   replace   the old art was condemned ("redraw from scratch", or the drawing
#             was tagged for deletion) -> the new art REPLACES it outright. There
#             is no reason to keep a drawing we already decided to throw away,
#             and keeping it would leave the chevron offering it forever.
#   promote   the old art was flagged as fixable or improvable (crop / alpha /
#             bleed / any wantsImprovement) -> import as a variant AND select it.
#             The complaint was about degree, not existence, so the old drawing
#             stays available in case the new one is worse.
#   offer     no flag at all -> import as a variant and change nothing. Nobody
#             asked for this pose to change, so the choice is made by eye later.
DISPOSITIONS = {
    "new": "registered as the pose itself",
    "replace": "replaces the condemned art outright",
    "promote": "added as a variant AND selected",
    "offer": "added as a variant, selection unchanged",
}

# needsReplacement kinds that condemn the old art rather than ask for it to be
# patched up. Kept in step with REPLACEMENT_KINDS in src/sprites.js.
CONDEMNING = {"replace", "delete"}


def disposition(man, char, pose):
    """What should happen to an incoming plate for this pose, and why."""
    meta = man["characters"].get(char, {}).get(pose)
    if not meta:
        return "new", "no art registered under this name"

    kind = meta.get("needsReplacement")
    if kind is True:
        kind = "replace"          # legacy flag, predates carrying a reason
    if kind in CONDEMNING:
        return "replace", f"old art flagged '{kind}'"

    # A delete tag lives on the variant option, not the pose, so the pose's own
    # flag cannot see it.
    entry = (man.get("variants") or {}).get(char, {}).get(pose)
    if entry and any(o.get("needsReplacement") == "delete" and o["file"] == meta["file"]
                     for o in entry.get("options", [])):
        return "replace", "the selected drawing is tagged for deletion"

    if kind:
        return "promote", f"old art flagged '{kind}' — fixable, so it is kept"
    want = meta.get("wantsImprovement")
    if want:
        return "promote", f"old art flagged for improvement ('{want}')"
    return "offer", "old art carries no complaint"


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


def select(man, char, pose, file, log):
    """Point a pose at one of its options, carrying that image's own placement."""
    entry = (man.get("variants") or {}).get(char, {}).get(pose)
    meta = man["characters"].get(char, {}).get(pose)
    chosen = next((o for o in (entry or {}).get("options", []) if o["file"] == file), None)
    if not chosen or not meta:
        log.append(f"SKIP {char}/{pose}: cannot select {file}")
        return
    before = meta.get("file")
    for field in build_variants.PLACEMENT:
        meta.pop(field, None)
    for field, value in chosen.items():
        if field != "label":
            meta[field] = value
    log.append(f"{char}/{pose}: selected {before} -> {file}")


def plan(man):
    """Every keyed plate with the disposition its flags imply."""
    rows = []
    for char, pose, _ in processed_plates():
        how, why = disposition(man, char, pose)
        rows.append((char, pose, how, why))
    return rows


def run_plan(man, rows, label, dry_run, log):
    """Act on a plan. Replacements and new poses are handed to intake_import.py,
    which owns the placement rules and the flag clearing; variants are handled
    here."""
    approvals = {}
    changed = 0
    for char, pose, how, _ in rows:
        if how in ("new", "replace"):
            approvals.setdefault(char, []).append(pose)
            continue
        if not import_one(man, char, pose, label, dry_run, log):
            continue
        changed += 1
        if how == "promote" and not dry_run:
            select(man, char, pose, f"{char}/{ALT_DIR}/{pose}.png", log)
    return approvals, changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--survey", action="store_true",
                    help="report what is waiting in intake and what would happen to it")
    ap.add_argument("--plan", action="store_true",
                    help="show the disposition each keyed plate gets from the flags on its pose")
    ap.add_argument("--auto", action="store_true",
                    help="act on that plan: variants here, replacements via intake_import.py")
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

    if args.plan or args.auto:
        rows = plan(man)
        if not rows:
            print("  nothing keyed — run tools/intake.py first")
            return 0
        by = {}
        for char, pose, how, why in rows:
            by.setdefault(how, []).append((char, pose, why))
        for how in ("new", "replace", "promote", "offer"):
            group = by.get(how) or []
            if not group:
                continue
            print(f"\n{how.upper()} — {DISPOSITIONS[how]} ({len(group)})")
            for char, pose, why in group:
                print(f"  {char}/{pose:22} {why}")
        print()
        if args.plan:
            return 0

        log = []
        approvals, changed = run_plan(man, rows, args.label, args.dry_run, log)
        for line in log:
            print("  " + line)
        if not args.dry_run and changed:
            with open(MANIFEST, "w") as fh:
                json.dump(man, fh, indent=1)
                fh.write("\n")
            print(f"  wrote {MANIFEST} ({changed} variant(s))")
        if approvals:
            path = os.path.join(HERE, "..", "assets", "intake", "_processed", "approvals.json")
            with open(path, "w") as fh:
                json.dump(approvals, fh, indent=1)
            total = sum(len(v) for v in approvals.values())
            print(f"\n  {total} plate(s) are new poses or replacements. Written to")
            print(f"  {path} — apply with:")
            print(f"    python3 tools/intake_import.py --approve {path}"
                  + (" --dry-run" if args.dry_run else ""))
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
