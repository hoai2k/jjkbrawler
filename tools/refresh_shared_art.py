#!/usr/bin/env python3
"""Roll back a shared drawing's tuning when its art has been redelivered.

WHY THIS EXISTS

A character pose knows when it has been redrawn: the replacement lands under a
new filename, `intake_import.py` sees the change and applies `pristine()`, and
the hand tuning that existed to compensate for the old drawing does not follow
the drawing that fixes it.

Shared art has no such moment. `effect:blood_orb` is `effects/blood_orb.png`
today and forever; a delivery overwrites those bytes in place — by hand, per
assets/intake/README.md — and the dx of -57.1 sitting beside it, measured
against a picture that no longer exists, is silently applied to the new one.
Nothing in the pipeline had an opinion about that, because nothing in the
pipeline could tell it had happened.

So the identity is the content: `apply_sprite_adjustments.py` stamps the file
and a hash of its bytes onto every shared entry it tunes, and this compares the
two. See tools/shared_art_stamp.py for the stamp's shape and the reasoning.

WHAT IT DOES NOT DO

An entry with no stamp is left alone. Nobody has tuned it since stamping
existed, so there is no claim about which drawing it describes, and inventing
one by hashing now would freeze whatever is on disk as "what this was measured
against" — which is exactly the false confidence the stamp is meant to replace.
Those entries earn a stamp the next time somebody tunes them.

An entry naming a MISSING file is reported and left alone. That is much more
likely a retired drawing or a bad path than a redelivery, and rolling numbers
back over it would destroy work to fix a problem it does not have.

Usage:
  python3 tools/refresh_shared_art.py            # reset what is stale
  python3 tools/refresh_shared_art.py --check    # report only; non-zero if stale
"""
import shared_art_stamp
import sprite_paths

import argparse
import json
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="report without writing; exit non-zero if anything is stale")
    args = ap.parse_args()

    with open(sprite_paths.MANIFEST) as fh:
        man = json.load(fh)
    entries = man.get("otherSprites") or {}

    stale, gone, stamped = [], [], 0
    for key, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        if shared_art_stamp.missing(entry):
            gone.append(key)
            continue
        verdict = shared_art_stamp.stale(entry)
        if verdict is None:
            continue
        stamped += 1
        if verdict:
            stale.append(key)

    for key in gone:
        print(f"  ?    {key}: stamped against "
              f"{entries[key]['src']['file']}, which is not on disk — left alone")

    if not stale:
        print(f"shared art is current — {stamped} stamped entry(s), "
              f"{len(entries) - stamped} not yet stamped")
        return 0

    for key in stale:
        entry = entries[key]
        # What is actually being given up, named rather than counted: the point
        # of the message is that somebody's hand tuning is going away.
        lost = ", ".join(sorted(entry.get("edited") or {})) or "review flags"
        print(f"  {'stale' if args.check else 'reset'}  {key}: "
              f"{entry['src']['file']} has changed since it was tuned — {lost}")
        if not args.check:
            entries[key] = shared_art_stamp.pristine(entry)
            if not entries[key]:
                del entries[key]

    if args.check:
        print(f"\n{len(stale)} shared drawing(s) tuned against art that has since "
              f"changed.\nRun `python3 tools/refresh_shared_art.py` to roll that "
              f"tuning back, then place them again.")
        return 1

    with open(sprite_paths.MANIFEST, "w") as fh:
        json.dump(man, fh, indent=2)
        fh.write("\n")
    print(f"\n{len(stale)} drawing(s) reset to pipeline defaults.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
