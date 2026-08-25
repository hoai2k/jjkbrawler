#!/usr/bin/env python3
"""Merge verdicts from the verification bench into the sealed-verdict store.

A verdict says what one sealed patch of screen colour actually is — the stage
showing through, or a shadow on the fighter — and it is keyed by a point in the
DELIVERED plate's own pixels. The delivery is archived and never changes, so an
answer given once holds for every re-key of that drawing afterwards.

Merged rather than replaced: the queue is meant to be worked one fighter at a
time, and an export covering Kashimo should not throw away the answers given for
Hanami last week. A point already stored is left where it is unless the new
answer disagrees, which is reported.

    python3 tools/apply_sealed_verdicts.py sealed-verdicts.json
    python3 tools/apply_sealed_verdicts.py sealed-verdicts.json --dry-run

It prints the plates whose answers changed, because those are the ones worth
re-keying: `python3 tools/intake.py` on the delivered art, then
`intake_import.py`, and the pose lands held for approval like any other.
"""
import sprite_paths

import argparse
import json
import os
import sys

STORE = os.path.join(os.path.dirname(sprite_paths.MANIFEST), "sealed_verdicts.json")
KINDS = ("background", "figure")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    store = {}
    if os.path.exists(STORE):
        store = json.load(open(STORE))

    added, moved, same, touched = 0, [], 0, set()
    for src in args.sources:
        incoming = json.load(open(sys.stdin if src == "-" else src)) if src != "-" \
            else json.load(sys.stdin)
        for ref, kinds in incoming.items():
            for kind, points in kinds.items():
                if kind not in KINDS:
                    print(f"  ignored: {ref} has an unknown verdict '{kind}'")
                    continue
                for point in points:
                    point = [int(point[0]), int(point[1])]
                    entry = store.setdefault(ref, {})
                    was = next((k for k in KINDS if point in entry.get(k, [])), None)
                    if was == kind:
                        same += 1
                        continue
                    if was:
                        entry[was].remove(point)
                        if not entry[was]:
                            del entry[was]
                        moved.append(f"{ref} @{point[0]},{point[1]}: {was} -> {kind}")
                    else:
                        added += 1
                    entry.setdefault(kind, []).append(point)
                    touched.add(ref)

    for line in moved:
        print(f"  changed  {line}")
    print(f"\n{added} new verdict(s), {len(moved)} changed, {same} already agreed")
    if not args.dry_run and (added or moved):
        json.dump(store, open(STORE, "w"), indent=1)
        open(STORE, "a").write("\n")
        print(f"  -> {os.path.relpath(STORE, os.path.dirname(os.path.dirname(STORE)))}")
    elif args.dry_run:
        print("  (dry run — nothing written)")
    if touched:
        print("\nworth re-keying, now that these are settled:")
        for ref in sorted(touched):
            print(f"  {ref}")
        print("\n  stage the delivered plates, then: python3 tools/intake.py --chars <chars>"
              "\n  python3 tools/intake_import.py --approve <approvals.json>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
