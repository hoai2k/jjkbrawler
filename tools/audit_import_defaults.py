#!/usr/bin/env python3
"""Re-measure the placement defaults against every correction ever made.

`sprites/docs/sprite-auto-adjust.md` asked one question — *is the derived value
wrong in a predictable way?* — and answered it against 1,605 corrections. The
manifest now holds 3,170, over 35 fighters rather than 23, and the answers have
moved. This is the same question asked again, and it is the tool behind
`sprites/docs/sprite-import-defaults.md`.

It reads only the manifest, the art, and `src/characters.js`, and it writes
nothing. Every table it prints is a claim in that document, so a claim that
stops holding stops being printed the same way.

  python3 tools/audit_import_defaults.py            # all three reports
  python3 tools/audit_import_defaults.py --foot     # just the foot line
  python3 tools/audit_import_defaults.py --size
  python3 tools/audit_import_defaults.py --centre

WHAT EACH REPORT ASKS

  foot    The foot line is stored as one fraction of body height for the whole
          roster (`auto_tune.learn_foot`). Split the same corrections by
          ANIMATION STATE and the single number comes apart: a run contacts at
          0.99 and a prone at 0.63. This scores the two rules against each
          other in the pixels a player sees.

  size    `auto_tune.learn_sizes` calls a state "uniform" when its height ratio
          to idle varies by under 1% across the reviewed roster, and today only
          `idle` passes. This re-runs that measurement, then re-runs it with a
          per-character level factor removed, which is the difference between
          "the states stopped being rules" and "the denominator moved".

  centre  `ox` is derived from the alpha-weighted centroid. The manifest also
          carries `anchors.com`, which is the same measurement where nobody has
          touched it and a person's judgement where somebody has. This scores
          both against the hand-chosen `ox`, split by which of the two the com
          is.

The measurement of the art matches `auto_tune.measure`: the same alpha
threshold, and the same "body bottom is the bottom of the LARGEST connected
component" rule, so a detached energy burst below the feet is not the floor.
"""
import sprite_paths

import argparse
import collections
import json
import os
import statistics
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from audit_frame_sizes import anims_by_frame, DEFAULT_REVIEWED  # noqa: E402
from extract_sprites import ALPHA_THRESHOLD, SHEET_W, COLS  # noqa: E402

SPRITES = sprite_paths.CHAR
MANIFEST = sprite_paths.MANIFEST
CHARACTERS_JS = os.path.join(HERE, "..", "src", "characters.js")
CELL_MID = SHEET_W / COLS / 2

# A state needs this many corrections before its own fraction is worth having.
# Below it the median is one or two fighters speaking for the roster.
MIN_STATE_SAMPLES = 6
# Corrections a character needs before their own level is used.
MIN_CHAR_SAMPLES = 8
# The states `auto_tune.learn_sizes` sized by one ratio when the rule was
# written. Named here only so the report can show what happened to them.
ONCE_UNIFORM = ["hurt", "fall", "jump", "shield", "ledge", "win",
                "upHeavy", "charge", "dizzy", "land"]


def med(v):
    return statistics.median(v) if v else float("nan")


def cv(v):
    m = statistics.mean(v)
    return statistics.pstdev(v) / m if m else float("nan")


def pct(v, p):
    s = sorted(v)
    return s[min(len(s) - 1, int(len(s) * p))] if s else float("nan")


# ------------------------------------------------------------------- measuring
def measure(path):
    """Box, largest-component bottom and alpha centroid — as auto_tune sees them."""
    a = np.asarray(Image.open(path).convert("RGBA"))
    alpha = a[:, :, 3]
    solid = alpha >= ALPHA_THRESHOLD
    if not solid.any():
        return None
    ys, xs = np.nonzero(solid)
    lab, n = ndimage.label(solid, np.ones((3, 3), np.int8))
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        body = lab == int(np.argmax(sizes)) + 1
        rows = np.nonzero(body.any(axis=1))[0]
        body_bottom = int(rows[-1]) + 1
    else:
        body_bottom = int(ys.max()) + 1
    w = alpha[ys, xs].astype(np.float64)
    return {"body_bottom": body_bottom,
            "centroid_x": float((xs * w).sum() / w.sum()),
            "art_h": int(ys.max()) - int(ys.min()) + 1}


def load():
    man = json.load(open(MANIFEST))
    anims = anims_by_frame(open(CHARACTERS_JS).read(), list(man["characters"]))
    return man, anims


def states_of(anims, char, pose):
    return tuple(sorted(s for s, keys in anims.get(char, {}).items() if pose in keys))


def corrections(man, anims, field, need_art=True):
    """Every pose whose `field` a person set, with its art measured.

    `edited[field]` holds the PRE-edit value, so a pose listed here is one where
    somebody looked at the sprite and moved it — which is the only labelled
    answer this repo has.
    """
    out = []
    for char, poses in man["characters"].items():
        for pose, meta in poses.items():
            if not isinstance(meta, dict):
                continue
            if field not in (meta.get("edited") or {}):
                continue
            path = os.path.join(SPRITES, meta.get("file", ""))
            art = None
            if need_art:
                if not meta.get("file") or not os.path.exists(path):
                    continue
                art = measure(path)
                if not art or not art["body_bottom"]:
                    continue
            out.append({"char": char, "pose": pose, "meta": meta, "art": art,
                        "states": states_of(anims, char, pose)})
    return out


# ----------------------------------------------------------------------- foot
def foot_report(man, anims):
    rows = []
    for c in corrections(man, anims, "bodyBottom"):
        meta = c["meta"]
        if meta.get("oy") is None:
            continue
        rows.append({"char": c["char"], "pose": c["pose"], "states": c["states"],
                     "frac": (meta["bodyBottom"] - meta["oy"]) / c["art"]["body_bottom"],
                     "bb": c["art"]["body_bottom"],
                     "rs": meta.get("renderScale") or 0.25})
    print(f"\nFOOT LINE — {len(rows)} hand-set ground contacts\n")
    glob = med([r["frac"] for r in rows])
    print(f"  roster median {glob:.3f}   sd {statistics.pstdev([r['frac'] for r in rows]):.3f}")

    per_state = collections.defaultdict(list)
    for r in rows:
        for s in r["states"] or ("(no state)",):
            per_state[s].append(r["frac"])
    print(f"\n  {'state':16s}{'n':>5}{'median':>8}{'sd':>7}   the single number is 0.946")
    for s, v in sorted(per_state.items(), key=lambda kv: med(kv[1])):
        if len(v) < MIN_STATE_SAMPLES:
            continue
        flag = "  <-- " + ("well above" if med(v) > glob + 0.02 else
                           "well below" if med(v) < glob - 0.02 else "")
        print(f"  {s:16s}{len(v):5d}{med(v):8.3f}{statistics.pstdev(v):7.3f}{flag.rstrip()}")

    # --- score the rules, leaving each character out of what taught them
    chars = sorted({r["char"] for r in rows})

    def state_table(exclude):
        t = collections.defaultdict(list)
        for r in rows:
            if r["char"] == exclude:
                continue
            for s in r["states"]:
                t[s].append(r["frac"])
        return {s: med(v) for s, v in t.items() if len(v) >= MIN_STATE_SAMPLES}

    tables = {c: state_table(c) for c in chars}

    def level(r):
        own = [x["frac"] for x in rows if x["char"] == r["char"] and x["pose"] != r["pose"]]
        return med(own) if len(own) >= MIN_CHAR_SAMPLES else glob

    no_standing = {"prone", "jump", "fall", "ledge", "dodge_air", "airLight"}

    def today(r):
        # auto_tune declines these, which leaves the pipeline's own foot = the
        # lowest drawn pixel standing.
        if r["states"] and all(s in no_standing for s in r["states"]):
            return 1.0
        return level(r)

    def per_state_rule(r):
        t = tables[r["char"]]
        v = [t[s] for s in r["states"] if s in t]
        return (med(v) if v else glob) * (level(r) / glob)

    print(f"\n  {'rule':44s}{'median':>8}{'p90':>8}{'within 2%':>11}")
    for name, fn in [("foot = lowest pixel (the pipeline)", lambda r: 1.0),
                     ("flat 0.946", lambda r: 0.946),
                     ("per character, airborne declined (today)", today),
                     ("per state x character level", per_state_rule)]:
        e = [abs(fn(r) - r["frac"]) * r["bb"] * r["rs"] for r in rows]
        near = sum(1 for r in rows if abs(fn(r) - r["frac"]) <= 0.02) / len(rows)
        print(f"  {name:44s}{med(e):7.1f}px{pct(e, 0.9):7.1f}px{near:11.0%}")
    print("\n  (error is on-screen pixels: image error x renderScale, on ~230px fighters)")


# ----------------------------------------------------------------------- size
def size_report(man, anims):
    """Is a state's height ratio to idle still one number across the roster?"""
    samples = collections.defaultdict(dict)
    for char in DEFAULT_REVIEWED:
        frames = man["characters"].get(char) or {}
        base = next((frames[k]["bodyH"] for k in ("idle_a", "r0c0")
                     if isinstance(frames.get(k), dict) and frames[k].get("bodyH")), None)
        if not base:
            continue
        for pose, meta in frames.items():
            if not isinstance(meta, dict) or not meta.get("bodyH"):
                continue
            for s in states_of(anims, char, pose):
                samples[s].setdefault(char, []).append(meta["bodyH"] / base)

    state_med = {s: med([r for v in by_char.values() for r in v])
                 for s, by_char in samples.items()}
    # A character's level: how their rule-sized poses sit against the roster's
    # own medians. If one fighter's idle moved, every ratio of theirs shifts
    # together and this is that shift.
    level = {}
    for char in DEFAULT_REVIEWED:
        rel = [r / state_med[s] for s in ONCE_UNIFORM
               if char in samples.get(s, {}) for r in samples[s][char]]
        if rel:
            level[char] = med(rel)

    print("\nSIZE — height ratio to idle, over the reviewed roster\n")
    print(f"  {'state':16s}{'n':>5}{'ratio':>8}{'spread':>9}{'spread, level removed':>24}")
    for s in sorted(samples, key=lambda s: -sum(len(v) for v in samples[s].values())):
        vals = [(c, r) for c, rs in samples[s].items() for r in rs]
        if len(vals) < MIN_STATE_SAMPLES:
            continue
        raw = [r for _, r in vals]
        adj = [r / level.get(c, 1.0) for c, r in vals]
        mark = " RULE" if cv(adj) <= 0.01 else ""
        print(f"  {s:16s}{len(raw):5d}{med(raw):8.3f}{cv(raw):9.1%}{cv(adj):24.1%}{mark}")

    print("\n  per-character level (1.000 = sized like the rest of the roster)")
    for c, v in sorted(level.items(), key=lambda kv: kv[1]):
        if abs(v - 1) < 0.005:
            continue
        frames = man["characters"].get(c) or {}
        idle = (frames.get("idle_a") or {}).get("bodyH")
        legacy = (frames.get("r0c0") or {}).get("bodyH")
        note = ""
        if idle and legacy and abs(idle - legacy) > 0.5:
            note = f"   idle_a {idle:.1f} vs the legacy r0c0 cell {legacy:.1f}"
        print(f"    {c:12s}{v:.4f}{note}")


# --------------------------------------------------------------------- centre
def centre_report(man, anims):
    rows = []
    for c in corrections(man, anims, "ox"):
        meta, art = c["meta"], c["art"]
        com = (meta.get("anchors") or {}).get("com")
        if not com:
            continue
        rows.append({"target": CELL_MID - meta["ox"],
                     "centroid": art["centroid_x"],
                     "com": com[0],
                     "rs": meta.get("renderScale") or 0.25,
                     # A com within a pixel of the centroid is the bake; further
                     # off, somebody dragged it.
                     "placed": abs(com[0] - art["centroid_x"]) > 2})
    print(f"\nHORIZONTAL CENTRE — {len(rows)} hand-set `ox`\n")
    print(f"  {'population':34s}{'n':>5}{'centroid':>11}{'com anchor':>13}")
    for name, sub in [("all", rows),
                      ("com is the bake (== centroid)", [r for r in rows if not r["placed"]]),
                      ("com was placed by hand", [r for r in rows if r["placed"]])]:
        if not sub:
            continue
        ec = [abs(r["centroid"] - r["target"]) * r["rs"] for r in sub]
        em = [abs(r["com"] - r["target"]) * r["rs"] for r in sub]
        print(f"  {name:34s}{len(sub):5d}{med(ec):10.1f}px{med(em):12.1f}px")

    # `centroidX` is stored in CELL space, so `centroidX - ox` is the centroid
    # in the image's own pixels and should not move when the drawing slides.
    # Sliding it is exactly what a hand `ox` edit does, and nothing updates the
    # field — so this counts how far the stored value has drifted from the art.
    stale = moved = stale_moved = total = 0
    for char, poses in man["characters"].items():
        for pose, meta in poses.items():
            if not isinstance(meta, dict) or meta.get("file") is None:
                continue
            if meta.get("centroidX") is None or meta.get("ox") is None:
                continue
            path = os.path.join(SPRITES, meta["file"])
            if not os.path.exists(path):
                continue
            art = measure(path)
            if not art:
                continue
            total += 1
            drifted = abs((meta["centroidX"] - meta["ox"]) - art["centroid_x"]) > 2
            was_moved = ("ox" in (meta.get("edited") or {})
                         or "ox" in ((meta.get("autoTuned") or {}).get("fields") or {}))
            stale += drifted
            moved += was_moved
            stale_moved += drifted and was_moved
    print(f"\n  stored `centroidX - ox` more than 2px from the art's own centroid:"
          f" {stale} of {total}")
    print(f"    of the {moved} frames whose `ox` was moved after import: {stale_moved}")
    print(f"    of the {total - moved} frames whose `ox` was never moved:"
          f" {stale - stale_moved}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--foot", action="store_true")
    ap.add_argument("--size", action="store_true")
    ap.add_argument("--centre", action="store_true")
    args = ap.parse_args()
    every = not (args.foot or args.size or args.centre)

    man, anims = load()
    if every or args.foot:
        foot_report(man, anims)
    if every or args.size:
        size_report(man, anims)
    if every or args.centre:
        centre_report(man, anims)


if __name__ == "__main__":
    main()
