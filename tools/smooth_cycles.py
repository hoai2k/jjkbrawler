#!/usr/bin/env python3
"""Take the limp out of a run cycle.

    python3 tools/smooth_cycles.py --dry-run
    python3 tools/smooth_cycles.py
    python3 tools/smooth_cycles.py --char mechamaru hanami

WHAT A LIMP IS
--------------
A four-frame run is two identical strides on opposite legs: `run_reach_a` and
`run_reach_b` are the same instant of the same motion, and so are the two
passes. The cycle drops the body onto the reaching foot and lifts it over the
passing one — that bob is real, it is drawn into the art, and
`node tools/audit_frame_jitter.mjs` finds it phased correctly on 32 of 34
fighters.

What is not real is the two halves disagreeing about how far the body drops.
Measured across the roster the reach slots differ by a median 5% of body height
and up to 25% (hanami), so the fighter drops harder on one foot than the other,
6.5 times a second. That is a limp, and a limp at 6.5Hz is what "flickery" feels
like from the outside.

WHY THIS IS SAFE TO DO BY ARITHMETIC AND THE REST IS NOT
--------------------------------------------------------
Every other step this could flatten might be something the animation is trying
to say. A crouch pair is allowed to breathe. An attack is allowed to change
shape between its wind-up and its blow — that is the whole point of the pair.
Guessing there would trade a placement problem for an animation one.

A limp cannot be any of that, because **the animation says the same thing
twice**. Whatever `run_reach_a` means, `run_reach_b` means it too, so a
difference between them carries no intent to preserve. That is the entire
licence this tool operates under, and it is why it touches nothing but
symmetric slots of a looping cycle.

WHICH NUMBER MOVES
------------------
`renderScale`. The renderer draws a frame scaled about its own foot anchor
(`drawCharFrame`: the blit is offset by `(oy - anchorY) * scale`), so scaling a
frame moves its head and leaves its feet on the contact line — which is exactly
the correction a limp wants and the reason this is not done with `bodyBottom`.
`bodyH` moves with it, because it is defined as `renderScale x art height` and
`tools/audit_frame_sizes.py` reads it while the renderer reads the scale.

The two are brought to their MEAN rather than one being matched to the other:
there is no way to tell which of two equally-hand-placed frames is the right
one, and the mean is the only choice that does not pick a winner.

IT DOES OVERWRITE HAND VALUES, ON PURPOSE
-----------------------------------------
Unlike `auto_tune.py`, which refuses any field a person has touched, this edits
`renderScale` on frames that were placed by hand — because the fault is not
visible from where that placement was made. The workbench shows one drawing at
a time, and a limp is a property of a PAIR: both frames can look perfectly
placed on their own and still disagree. Nobody declined to fix this; nobody was
in a position to see it.

The pre-edit value already banked in `edited` is left alone — it records what
the pipeline derived before a human moved it, which is still true. What this
run did goes in `smoothed`, the same shape as `autoTuned`, so the change is
attributable and reversible.
"""
import sprite_paths

import argparse
import datetime
import json
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from audit_frame_sizes import anims_by_frame  # noqa: E402

MANIFEST = sprite_paths.MANIFEST
CHARACTERS_JS = os.path.join(HERE, "..", "src", "characters.js")

# Cycles whose slots repeat the same motion, and how many slots apart the
# repeat is. Only a looping cycle of an even length can hold one: a two-frame
# cycle IS its two halves, and a one-shot has no partner for anything.
#
# `run` is the only one today. `walk` is two contacts, which are opposite legs
# and therefore also a repeat — but its frames already agree to 0.4% of body
# height across the roster, so there is nothing to take out of it.
SYMMETRIC_STATES = {"run"}

# Refuse a pair that disagrees by more than this fraction of its own height,
# and say so instead.
#
# The threshold is where the roster splits, not a round number. Sorted, the
# limps run smoothly from 0.6% of body height up to 11.1% and then jump to
# 20.1%, 22.3% and 25.2% — hanami, kurourushi and mechamaru. Those three are a
# different problem: a gap that big is not two halves disagreeing about a
# stride, it is one frame that is simply the wrong size, and AVERAGING THEM
# WOULD BREAK THE GOOD ONE — mechamaru's reach pair would take both frames 13%
# from where they are, when one of them is probably already right.
#
# Splitting the difference is only defensible while there is no way to tell
# which half is wrong. Once there obviously is, that is an eye's job, and the
# tool prints them for one.
MAX_LIMP = 0.15

# Below this there is nothing to fix, and rewriting the manifest for it would
# churn the file for no visible gain. A fighter is ~149px, so this is a third
# of a pixel.
MIN_CORRECTION = 0.002


def now_stamp():
    return datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds")


def head_height(meta):
    """How far the top of the drawing sits above its foot line, in cell units.

    The same span `src/heights.js` solves a character's scale against, and the
    thing a player reads as how tall the fighter is standing right now.
    """
    if meta.get("bodyTop") is None or meta.get("renderScale") is None:
        return None
    return (meta["bodyBottom"] - (meta.get("oy") or 0) - meta["bodyTop"]) * meta["renderScale"]


def art_height(meta):
    """The frame's own drawn height, in image pixels: bodyH / renderScale."""
    if not meta.get("bodyH") or not meta.get("renderScale"):
        return None
    return meta["bodyH"] / meta["renderScale"]


def plan_cycle(char, frames, keys):
    """What each slot of one cycle should be scaled to, or [] if nothing is.

    Pairs slot i with slot i + n/2 — the same instant on the other leg — and
    aims both at the head height halfway between them.
    """
    metas = [frames.get(k) for k in keys]
    if any(not isinstance(m, dict) for m in metas):
        return [], "a frame of the cycle is not in the manifest"
    heads = [head_height(m) for m in metas]
    if any(h is None for h in heads):
        return [], "a frame has no measured bodyTop to place a head with"

    half = len(keys) // 2
    out = []
    for i in range(half):
        j = i + half
        want = (heads[i] + heads[j]) / 2
        gap = abs(heads[i] - heads[j]) / want if want else 0
        if gap > MAX_LIMP:
            return [], (f"{keys[i]} and {keys[j]} are {gap:.0%} of body height apart — "
                        "one of them is the wrong size, which is not something to average")
        for slot in (i, j):
            meta, head = metas[slot], heads[slot]
            if not head:
                continue
            factor = want / head
            if abs(factor - 1) < MIN_CORRECTION:
                continue
            art_h = art_height(meta)
            if not art_h:
                return [], f"{keys[slot]} has no bodyH to move with its scale"
            new_scale = round(meta["renderScale"] * factor, 4)
            out.append({
                "key": keys[slot], "partner": keys[j if slot == i else i],
                "renderScale": (meta["renderScale"], new_scale),
                "bodyH": (meta.get("bodyH"), round(new_scale * art_h, 1)),
                "head": (head, want),
            })
    return out, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--char", nargs="*", help="limit to these characters")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    anims = anims_by_frame(open(CHARACTERS_JS).read(), list(man["characters"]))

    at = now_stamp()
    changed = touched = 0
    skipped = []
    for char, frames in sorted(man["characters"].items()):
        if args.char and char not in args.char:
            continue
        for state in sorted(SYMMETRIC_STATES):
            keys = sorted(anims.get(char, {}).get(state) or [])
            # anims_by_frame gives the frames a state plays as a set; the cycle
            # order is what matters for pairing, so it is read back off the
            # animation rather than sorted alphabetically.
            keys = [k for k in (anims.get(char, {}).get(state) or [])]
            if len(keys) < 4 or len(keys) % 2:
                continue
            plan, why = plan_cycle(char, frames, keys)
            if why:
                skipped.append(f"  {char}/{state}: {why}")
                continue
            if not plan:
                continue
            changed += 1
            for item in plan:
                touched += 1
                meta = frames[item["key"]]
                old_s, new_s = item["renderScale"]
                print(f"  {char}/{item['key']:14s} renderScale {old_s:.4f} -> {new_s:.4f}"
                      f"   head {item['head'][0]:.1f} -> {item['head'][1]:.1f}"
                      f"   (to match {item['partner']})")
                if args.dry_run:
                    continue
                meta["renderScale"] = new_s
                meta["bodyH"] = item["bodyH"][1]
                meta.setdefault("smoothed", {})
                meta["smoothed"] = {
                    "at": at,
                    "why": f"stride symmetry with {item['partner']}",
                    "was": {"renderScale": old_s, "bodyH": item["bodyH"][0]},
                }

    for line in skipped:
        print(line)
    print(f"\n{touched} frame(s) across {changed} cycle(s)")
    if args.dry_run:
        print("dry run — nothing written")
        return 0
    if touched:
        with open(MANIFEST, "w") as fh:
            json.dump(man, fh, indent=1)
            fh.write("\n")
        print(f"wrote {MANIFEST}")
        print("check it with: node tools/audit_frame_jitter.mjs --state run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
