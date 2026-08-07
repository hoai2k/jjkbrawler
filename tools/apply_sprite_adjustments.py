#!/usr/bin/env python3
"""Apply a sprite-adjustment patch exported from the workbench.

The workbench (`workbench/?edit=sprites`) lets you tune per-frame `renderScale`
and `ox` live against the game's real renderer, then exports JSON like:

    { "character": "maki",
      "adjustments": { "ledge_hang": { "renderScale": 0.3518, "ox": 47.8,
                                       "bodyBottom": 300, "faceLeft": false,
                                       "anchors": { "com": [148.7, 512.0],
                                                    "ledge": [161.0, 40.6] } } } }

This writes those values into `assets/sprites/manifest.json`. Multiple payloads
can be applied at once — paste several into one file as a JSON array, or pass
several files.

Usage:
  python3 apply_sprite_adjustments.py patch.json [more.json ...]
  pbpaste | python3 apply_sprite_adjustments.py -        # straight from clipboard
  python3 apply_sprite_adjustments.py patch.json --dry-run
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "..", "assets", "sprites", "manifest.json")

# renderScale = size, ox = horizontal centring, bodyBottom = ground contact
# (where the sprite's feet meet the floor — not necessarily its lowest pixel,
# since perspective can put one foot below the standing plane).
#
# anchors = named points in the SOURCE IMAGE's own pixels, from its top-left
# corner: "com" is the centre of mass every rotation pivots about, and states
# can add their own ("ledge" is the hand that grips the edge). Image-local
# coordinates mean an anchor stays on the same piece of artwork through any
# later renderScale / ox / bodyBottom change. See src/sprites.js.
#
# faceLeft mirrors a frame whose art was drawn facing left. `nativeLeft` in the
# manifest seeded these by guess; a per-frame faceLeft is an explicit decision
# and wins over it, which is why writing `false` matters rather than deleting
# the key — see loadAssets in src/assets.js.
#
# needsReplacement flags a frame whose ART is wrong. Its VALUE says what is
# wrong — "replace", "crop", "alpha", "bleed" (REPLACEMENT_KINDS in
# src/sprites.js) — because a wholesale redraw and a crop fix are very different
# asks. `false` clears the flag; a legacy `true` means "replace".
# tools/list_replacements.py collects them for the asset request list, and
# intake clears the flag when new art lands.
ALLOWED = {"renderScale", "ox", "bodyBottom", "anchors", "faceLeft", "needsReplacement"}
NUMERIC = {"renderScale", "ox", "bodyBottom"}
BOOLEAN = {"faceLeft"}

# Fields whose pre-edit value is worth remembering. `edited` maps each to what
# it held before the FIRST hand edit, which does two jobs: it marks the frame as
# hand-tuned (the workbench's view filter reads it), and it lets intake roll the
# tuning back when the art is replaced — nudges made to compensate for bad art
# must not be inherited by the art that fixes it.
TRACKED = {"renderScale", "ox", "bodyBottom", "faceLeft"}


def load_payloads(sources):
    payloads = []
    for src in sources:
        raw = sys.stdin.read() if src == "-" else open(src).read()
        # tolerate the workbench's "// no changes" placeholder
        raw = raw.strip()
        if not raw or raw.startswith("//"):
            continue
        data = json.loads(raw)
        payloads.extend(data if isinstance(data, list) else [data])
    return payloads


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    applied, skipped = [], []

    for payload in load_payloads(args.sources):
        char = payload.get("character")
        frames = man["characters"].get(char)
        if not frames:
            skipped.append(f"unknown character '{char}'")
            continue
        if "headHeight" in payload:
            heads = man.setdefault("headHeights", {})
            before = heads.get(char)
            heads[char] = payload["headHeight"]
            applied.append(f"{char}.headHeight: {before} -> {payload['headHeight']}")

        for key, changes in (payload.get("adjustments") or {}).items():
            meta = frames.get(key)
            if not meta:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            for field, value in changes.items():
                if field not in ALLOWED:
                    skipped.append(f"{char}/{key}: ignoring unsupported field '{field}'")
                    continue
                if field in TRACKED:
                    # record the pristine value once, before it is overwritten
                    meta.setdefault("edited", {}).setdefault(field, meta.get(field))
                if field == "needsReplacement":
                    before = meta.get(field)
                    if not value:
                        meta.pop("needsReplacement", None)
                        applied.append(f"{char}/{key}.needsReplacement: {before} -> cleared")
                    else:
                        kind = "replace" if value is True else str(value)
                        meta["needsReplacement"] = kind
                        applied.append(f"{char}/{key}.needsReplacement: {before} -> {kind}")
                    continue
                if field in BOOLEAN:
                    before = meta.get(field)
                    meta[field] = bool(value)
                    applied.append(f"{char}/{key}.{field}: {before} -> {bool(value)}")
                    continue
                if field == "anchors":
                    # merge, so exporting one anchor never drops the others
                    anchors = meta.setdefault("anchors", {})
                    for name, point in value.items():
                        before = anchors.get(name)
                        anchors[name] = [round(float(point[0]), 1), round(float(point[1]), 1)]
                        applied.append(f"{char}/{key}.anchors.{name}: {before} -> {anchors[name]}")
                    continue
                before = meta.get(field)
                meta[field] = value
                applied.append(f"{char}/{key}.{field}: {before} -> {value}")

    for line in applied:
        print("  " + line)
    for line in skipped:
        print("  SKIP " + line)

    if not applied:
        print("nothing to apply")
        return
    if args.dry_run:
        print(f"(dry run — {len(applied)} change(s) not written)")
        return
    json.dump(man, open(MANIFEST, "w"), indent=1)
    print(f"manifest updated: {len(applied)} change(s)")


if __name__ == "__main__":
    main()
