#!/usr/bin/env python3
"""Take the poses that never moved off the workbench's updated list.

"All Recently Updated Poses" is a PLACEMENT worklist: after a round, the poses
whose art changed under somebody's tuning are scattered across the roster, and
this is how they are found. A re-key that carried its placement exactly belongs
nowhere near it — the drawing is the same size in the same spot and the matte is
what changed. `unmoved()` in intake_import.py keeps those off from now on.

This is for the ones already there. It compares each pose carrying a `replaced`
marker against the manifest at a REVISION from before the art changed, and drops
the marker wherever nothing a person places has moved since: the render scale,
the foot line, the offsets and the frame.

`bodyH` is not consulted, for the reason PLACEMENT_FIELDS gives — it is a
measurement of the matte, it moves whenever the matte does, and on 128 of 161
poses it was the ONLY thing that had moved.

Python, not node, because it writes the manifest: node's JSON.stringify
reformats 2,363 lines of it on the way past.

  python3 tools/clear_unmoved_updates.py --since e8fa2f1d [--dry-run]
"""
import argparse
import json
import subprocess
import sys

import sprite_paths

MANIFEST = sprite_paths.MANIFEST
# Where it sits, how big it is drawn, where its feet are, and the frame those
# are expressed against. A pose with all four unchanged is where it was.
PLACED = ("ox", "oy", "renderScale", "bodyBottom", "w", "h")


def manifest_at(rev):
    out = subprocess.run(["git", "show", f"{rev}:sprites/assets/manifest.json"],
                         capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(f"cannot read the manifest at {rev}: {out.stderr.strip()}")
    return json.loads(out.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True,
                    help="a git revision from before the art changed")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    was = manifest_at(args.since)
    man = json.load(open(MANIFEST))
    cleared, kept = [], []
    for char, poses in man["characters"].items():
        for key, meta in poses.items():
            if not meta.get("replaced"):
                continue
            before = (was["characters"].get(char) or {}).get(key)
            ref = f"{char}/{key}"
            if not before:
                kept.append((ref, ["not in the tree then"]))
                continue
            moved = [f for f in PLACED if before.get(f) != meta.get(f)]
            if moved:
                kept.append((ref, moved))
                continue
            meta.pop("replaced", None)
            cleared.append(ref)

    for ref, moved in kept:
        print(f"  stays listed  {ref}  ({', '.join(moved)} moved)")
    print(f"\n{len(cleared)} pose(s) taken off the updated list, {len(kept)} left on it")
    if args.dry_run:
        print("  (dry run — nothing written)")
        return 0
    if cleared:
        json.dump(man, open(MANIFEST, "w"), indent=1)
        print(f"  -> {MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
