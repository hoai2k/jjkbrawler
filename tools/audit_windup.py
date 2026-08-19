#!/usr/bin/env python3
"""DOES EACH ATTACK PAIR WIND UP BEFORE IT STRIKES?

    python3 tools/audit_windup.py [--warn 0.05]

An attack is two frames: `_a` is the coil, `_b` is the blow. The brief has said
so in words since round 13 and the fault kept coming back anyway — Mei Mei's
pair delivered inverted (13B), Mahoraga's neither frame extending (14A),
Dagon's `_a` reading as a second strike (17A), Yaga's and Naoya's whole attack
sets (22B-22D), Kashimo's aerial pair delivered the wrong way round.

pose-brief.md §3 already knows why: "whatever is written as a measurement gets
met; whatever is written as a sentence gets interpreted." This is the sentence
turned into a measurement.

WHAT IS MEASURED. For each frame, how far the art reaches FORWARD of its own
mass centre, in units of that fighter's standing height:

    reach = (rightmost opaque pixel - mean opaque x) * renderScale / idle bodyH

Every pose of a fighter is drawn at one zoom, so the two halves of a pair are
directly comparable with no placement involved. Sprites face right, so forward
is +x. The mass centre rather than the canvas centre because the canvas is
whatever the generator framed; the body is the thing the reach is relative to.

THE RULE IS THE GAP, NOT THE ABSOLUTE. An earlier version of this rule asked
that `_a` reach no further than the fighter's own `idle_a`, which sounded right
and is false: 135 of 140 shipped pairs break it, because an idle is square-on
with the arms in and any fighting stance out-reaches it. Measured across the
roster the honest signal is the DIFFERENCE between the two frames — a healthy
pair opens up by about a tenth of standing height, and the pairs people have
flagged by hand sit near zero or below.

    gap < 0        the wind-up out-reaches the strike. Either the pair is
                   INVERTED — both drawings fine, filenames swapped, which the
                   workbench fixes by pointing each pose at the other file — or
                   the `_a` is a second strike.
    0 <= gap < warn  the wind-up is barely a coil: `_a` is drawn about as
                   extended as `_b`, so the move has no tell.
    gap >= warn    the pair reads.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

import sprite_paths

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "sprites", "assets", "manifest.json")
ART = os.path.join(ROOT, "sprites", "assets")

PAIRS = [
    ("attack_light_a", "attack_light_b"),
    ("attack_heavy_a", "attack_heavy_b"),
    ("attack_air_a", "attack_air_b"),
    ("crouch_attack_a", "crouch_attack_b"),
]

ALPHA_FLOOR = 8


def reach(chars, char, frame):
    """Forward extent past the drawing's own mass centre, in standing heights."""
    meta = chars.get(char, {}).get(frame)
    if not isinstance(meta, dict):
        return None
    path = os.path.join(ART, meta.get("file") or f"{char}/{frame}.png")
    if not os.path.exists(path):
        return None
    alpha = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
    ys, xs = np.nonzero(alpha > ALPHA_FLOOR)
    if not len(xs):
        return None
    idle_h = (chars[char].get("idle_a") or {}).get("bodyH")
    if not idle_h:
        return None
    return ((xs.max() - xs.mean()) * meta.get("renderScale", 1)) / idle_h


DEFAULT_BASE = "http://localhost:5174"


def links(base, inverted, thin):
    """A deep link per offending pair, grouped by fighter.

    The workbench takes `?char=&frame=`, so a pair is two addresses: the `_a`
    that reaches too far and the `_b` it is supposed to open into. Both are
    printed because the fault is the RELATIONSHIP between them --- opening the
    `_a` alone tells you it looks extended, not that it out-reaches its own
    strike, and the fix is usually to point one of the two at a different
    drawing rather than to nudge either.
    """
    base = base.rstrip("/")
    groups = {}
    for kind, rows in (("inverted", inverted), ("thin", thin)):
        for gap, name, ra, rb in rows:
            char, a = name.split("/", 1)
            groups.setdefault(char, []).append((gap, a, ra, rb, kind))
    total = sum(len(v) for v in groups.values())
    print(f"{total} pair(s) to fix across {len(groups)} fighter(s)\n")
    # Worst fighter first, and worst pair first within a fighter, so working
    # top-down is working in order of how badly the move reads.
    for char in sorted(groups, key=lambda c: min(g for g, *_ in groups[c])):
        print(char)
        for gap, a, ra, rb, kind in sorted(groups[char]):
            b = a.rsplit("_a", 1)[0] + "_b"
            tag = "INVERTED" if kind == "inverted" else "thin"
            print(f"  {tag:8} {gap:+.3f}   _a {ra:.3f} -> _b {rb:.3f}")
            print(f"    {base}/sprites/workbench/?char={char}&frame={a}")
            print(f"    {base}/sprites/workbench/?char={char}&frame={b}")
        print()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--warn", type=float, default=0.05,
                    help="a pair opening by less than this reads as no wind-up")
    ap.add_argument("--links", metavar="BASE", nargs="?", const=DEFAULT_BASE,
                    help="print a sprite-workbench deep link per offending pair "
                         "instead of the report, grouped by fighter. BASE "
                         f"defaults to {DEFAULT_BASE}")
    ap.add_argument("--inverted-only", action="store_true",
                    help="with --links, skip the thin pairs")
    args = ap.parse_args()

    chars = json.load(open(MANIFEST))["characters"]
    inverted, thin, ok = [], [], []
    for char in sorted(chars):
        for a, b in PAIRS:
            ra, rb = reach(chars, char, a), reach(chars, char, b)
            if ra is None or rb is None:
                continue
            row = (rb - ra, f"{char}/{a}", ra, rb)
            (inverted if rb < ra else thin if rb - ra < args.warn else ok).append(row)

    if args.links:
        links(args.links, inverted, [] if args.inverted_only else thin)
        return 0

    for label, rows in (("INVERTED — the wind-up reaches further than the strike", inverted),
                        (f"THIN — the pair opens by less than {args.warn:.2f}", thin)):
        if not rows:
            continue
        print(f"\n{label}   {len(rows)}")
        for gap, name, ra, rb in sorted(rows):
            print(f"  {gap:+.3f}  {name:34} _a {ra:.3f}  _b {rb:.3f}")

    total = len(inverted) + len(thin) + len(ok)
    gaps = sorted(g for g, *_ in inverted + thin + ok)
    median = gaps[len(gaps) // 2] if gaps else 0
    print(f"\n{total} pair(s) measured · median gap {median:+.3f} of standing height")
    print(f"ok {len(ok)} · thin {len(thin)} · inverted {len(inverted)}")
    # Reported, not failed. A thin pair can be a deliberately short jab, and this
    # is a tool for finding the ones worth looking at rather than a gate — the
    # judgement is still somebody opening the two frames side by side.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
