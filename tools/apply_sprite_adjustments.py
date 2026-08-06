#!/usr/bin/env python3
"""Apply a sprite-adjustment patch exported from the workbench.

The workbench (`workbench/?edit=sprites`) lets you tune per-frame `renderScale`
and `ox` live against the game's real renderer, then exports JSON like:

    { "character": "maki",
      "adjustments": { "ledge_hang": { "renderScale": 0.3518, "ox": 47.8,
                                       "bodyBottom": 300 } } }

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
ALLOWED = {"renderScale", "ox", "bodyBottom"}


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
