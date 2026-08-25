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
# Two of these are instructions the keyer can carry out and two are the reviewer
# saying the question is the wrong one:
#
#   background / figure   cut it, or keep it
#   mixed                 part gap and part shadow. One point cannot answer for
#                         two halves, so the keyer is left alone and the plate
#                         wants a hand mask or a redraw.
#   other                 not a keying fault at all — a ghost image, a trail,
#                         something that wants removing rather than a better
#                         key. Hakari's special_side carries four of them.
#
# The last two are stored so the patch keeps its mark and comes back to be
# judged again once the art has been fixed, rather than being asked cold twice.
KINDS = ("background", "figure", "mixed", "other")

# A SPLIT IS THE ANSWER TO "BOTH", drawn rather than named: the reviewer lassos
# the parts of the patch that are the fighter and the keyer cuts the rest. It is
# a different shape from the others — a point AND the loops — so it lives in its
# own list rather than pretending to be a point:
#
#   "split": [{"at": [x, y], "shadow": [[[x, y], ...], ...]}]
#
# Merged by the point it names, so redrawing a split replaces that split and
# leaves the others alone.
SPLIT = "split"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    store = {}
    if os.path.exists(STORE):
        store = json.load(open(STORE))

    added, moved, same, touched = 0, [], 0, set()
    added_lines = []
    for src in args.sources:
        incoming = json.load(open(sys.stdin if src == "-" else src)) if src != "-" \
            else json.load(sys.stdin)
        for ref, kinds in incoming.items():
            for entry in kinds.pop(SPLIT, []):
                at = [int(entry["at"][0]), int(entry["at"][1])]
                shadow = [[[int(x), int(y)] for x, y in loop] for loop in entry["shadow"]]
                store.setdefault(ref, {})
                # A split answers the same patch a point would, so any older
                # answer for that patch goes — including an older split.
                for kind in KINDS:
                    if at in store[ref].get(kind, []):
                        store[ref][kind].remove(at)
                        if not store[ref][kind]:
                            del store[ref][kind]
                kept = [e for e in store[ref].get(SPLIT, []) if list(e["at"]) != at]
                was = len(kept) != len(store[ref].get(SPLIT, []))
                store[ref][SPLIT] = kept + [{"at": at, "shadow": shadow}]
                loops = sum(len(l) for l in shadow)
                (moved if was else added_lines).append(
                    f"{ref} @{at[0]},{at[1]}: split into {len(shadow)} loop(s), {loops} points")
                touched.add(ref)
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

    for line in added_lines:
        print(f"  split    {line}")
    for line in moved:
        print(f"  changed  {line}")
    print(f"\n{added + len(added_lines)} new verdict(s), {len(moved)} changed, "
          f"{same} already agreed")
    if not args.dry_run and (added or moved or added_lines):
        json.dump(store, open(STORE, "w"), indent=1)
        open(STORE, "a").write("\n")
        print(f"  -> {os.path.relpath(STORE, os.path.dirname(os.path.dirname(STORE)))}")
    elif args.dry_run:
        print("  (dry run — nothing written)")
    drawn = sorted(ref for ref, e in store.items() if e.get(SPLIT))
    if drawn:
        print("\nsplit by hand — the keyer cuts everything in the patch except what the "
              "loops cover:")
        for ref in drawn:
            print(f"  {ref}  ({len(store[ref][SPLIT])} patch(es))")
    for kind, why in (("mixed", "part gap, part shadow and nobody has drawn the line yet — "
                                "these want a split, a hand mask or a redraw"),
                      ("other", "not a keying fault — ghosts, trails and the like, which "
                                "want removing rather than a better key")):
        marked = sorted(ref for ref, e in store.items() if e.get(kind))
        if not marked:
            continue
        print(f"\n{why}:")
        for ref in marked:
            print(f"  {ref}  ({len(store[ref][kind])} patch(es))")
    if touched:
        print("\nworth re-keying, now that these are settled:")
        for ref in sorted(touched):
            print(f"  {ref}")
        print("\n  stage the delivered plates, then: python3 tools/intake.py --chars <chars>"
              "\n  python3 tools/intake_import.py --approve <approvals.json>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
