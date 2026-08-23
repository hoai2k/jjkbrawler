#!/usr/bin/env python3
"""Apply the placement corrections that are mechanical, so the hand pass is not.

An intake round lands art at numbers `intake_import.place()` derives, and then
somebody opens the workbench and moves them. `sprites/docs/sprite-auto-adjust.md` is the
measurement of which of those moves are mechanical: it reads the `edited` map
(which stores each hand-tuned field's PRE-edit value) and asks, for every
correction ever made, whether the derived value was wrong in a predictable way.

Four of them are, and this applies those four. It is deliberately narrow — the
test for including a rule is not "usually right" but **"wrong in a way that has
a direction"**, because a correction that guesses can land further from the
answer than doing nothing, and it does so silently.

  foot    the derived foot line is the bottom of the alpha box, which it can
          only ever be: generated_frame_meta sets `oy = bodyBottom - by1`. A
          foot drawn in perspective has its sole running away from the camera,
          so the lowest pixel is the toe and the figure stands higher.

          That fraction is measured PER ANIMATION STATE, because it is not one
          number: a body standing still contacts at 0.94, a running one at
          0.990 (n=128, sd 0.014) because the planted foot is extended and
          there is no hidden sole, and a prone one at 0.626 because it is lying
          on its side. sprites/docs/sprite-import-defaults.md is the
          measurement; one fraction for the roster cost ~2px of on-screen error
          everywhere and 8px on every run frame of every fighter, which is why
          all 128 of them were auto-tuned to 0.946 and then lifted by hand,
          round after round.

  area    how big a drawing of a person is cannot be read off its bounding box:
          a crouch is short, a lunge is long, and neither is a smaller or a
          larger fighter. What does not change with the pose is HOW MUCH
          CHARACTER IS DRAWN, and area goes as the square of linear size, so
          the idle's scale times sqrt(the idle's area / this frame's) puts a
          frame at the size that character is drawn at. 15.3% -> 4.2% median
          error against the hand-set sizes, where the import default it
          replaces — the predecessor's rendered height — is 15.3%. The residual
          is a fact about the pose (a roll hides itself, an ult is drawn inside
          its own cursed energy) and is measured per state on top.

  size    a set of animation states carry ONE height ratio across the whole
          size-reviewed roster; a leave-one-character-out test recovers them
          exactly. The rest were judged per character and predict no better
          than 8-13%, which is the size of the corrections themselves. The
          split is measured here rather than listed, so a state that stops
          being uniform stops being tuned.

          The ratio is measured against each character's own LEVEL — how their
          set as a whole sits against the roster — because the thing every
          ratio is divided by is that character's idle, and an idle that moves
          moves all of them together. Six fighters had theirs re-placed 2.3-3%
          larger than the cell it replaced, which pushed nine uniform states to
          a 1.3% spread apiece and switched the whole rule off. Removing the
          level puts them back at 0.0-0.1%.

  centre  the derived `ox` centres the CONTENT BOX, which includes Maki's
          naginata and Gakuganji's guitar neck. The corrections track the
          alpha-weighted centroid — mass, not extent. Better by ~73%.

          And where the frame's `com` anchor has been DRAGGED off the centroid
          the bake put it at, that is a person's answer to the same question and
          beats the measurement: 49px -> 22px in image pixels on the 250
          hand-centred frames that carry one.

Two rules it does NOT apply, and will not: rotation (118 corrections, all
setting a value where none existed — a judgement about how a pose reads in
motion, with nothing in the file predicting it) and facing (detection scores
near-zero confidence on two thirds of plates; guessing silently mirrors a
character, which looks deliberate).

WHAT THIS IS NOT
----------------
It does not replace the tuning pass and must not be described as doing so. It
moves the starting point from "knowingly wrong" to "defensible", so the pass
becomes checking rather than correcting. Accordingly a tuned pose stays
**unedited** everywhere the UI asks: the workbench's "No saved edits (to do)"
list reads `meta.edited`, and nothing here writes to it. Provenance goes to
`autoTuned`, which is a record, not a claim that the pose has been dealt with.

It also never overwrites a human. A field that appears in `edited` was decided
by somebody looking at the sprite, and no measurement here outranks that.

  python3 tools/auto_tune.py --report          # what the rules learned, no writes
  python3 tools/auto_tune.py --dry-run         # what it would do to the last round
  python3 tools/auto_tune.py                   # do it
  python3 tools/auto_tune.py --all             # every pose, not just the last round
  python3 tools/auto_tune.py --char maki uro
  python3 tools/auto_tune.py --backtest        # score the rules against hand values
"""
import sprite_paths

import argparse
import collections
import datetime
import json
import math
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
MANIFEST = os.path.join(SPRITES, "manifest.json")
CHARACTERS_JS = os.path.join(HERE, "..", "src", "characters.js")

# Where a cell's horizontal centre is, in the same units `ox` is stored in.
# generated_frame_meta derives `ox = CELL_MID - <box centre>`; the only change
# here is which feature gets put on that line.
CELL_MID = SHEET_W / COLS / 2

# --- what makes a rule safe enough to apply ------------------------------------
#
# These are the thresholds that decide whether a measurement is a rule or a
# guess. They are deliberately strict: the cost of skipping a pose is that a
# human tunes it, which is what happens today anyway.

# A state's height ratio counts as uniform when its spread across the reviewed
# roster is under this, ONCE each character's own level is divided out. The two
# populations are still as far apart as they ever were — nine states sit at
# 0.0-0.1% and the nearest judged one (`land`) at 10.4% — but only after the
# level, because the ratio's denominator is per character and six of those
# denominators moved. Measured raw, all nine read 1.3% and none of them passes.
#
# The threshold is deliberately NOT loosened to swallow that: the failure mode
# of declining is that a human tunes the pose, which is the status quo, and the
# failure mode of accepting is a wrong size written into the manifest by a
# script. The level is not a looser gate, it is the same gate asked a question
# that is not contaminated by its own reference frame.
UNIFORM_CV = 0.01
# Which states are allowed to speak for a character's level. A level estimated
# from every state would absorb the judgement in the judged ones — a fighter
# who draws their attacks big would come out "large" and have their genuinely
# rule-sized poses shrunk to compensate. So the level is estimated from states
# that are NEARLY uniform already, and the final split is then measured with it
# removed. Five times UNIFORM_CV is wide enough to catch a rule state knocked
# out of true by its denominator and far short of the 10%+ the judged ones run.
BOOTSTRAP_CV = 0.05
# Reviewed characters a state needs before its ratio is trusted at all.
MIN_STATE_SAMPLES = 6
# Poses from the near-uniform states a character needs before their level is
# used. Below this it is one or two frames speaking for the whole set.
MIN_LEVEL_SAMPLES = 6
# Hand-tuned poses a state needs before it gets its own foot fraction, and the
# number of characters those have to come from. The second is the one that
# matters: eight corrections on one fighter is that fighter's habit, not a
# fact about the state.
MIN_STATE_FOOT_SAMPLES = 6
MIN_STATE_FOOT_CHARS = 3
# ...and its own fraction has to be distinguishable from the roster's, measured
# in its own spread, or there is nothing to be gained by preferring it.
#
# Deliberately a weak filter. What it drops are the states whose median sits
# within a few thousandths of the roster's — `win` 0.950, `ult` 0.947, `light`
# 0.946, `upHeavy` 0.952 — where using their own number cannot matter in either
# direction and using the roster's keeps them on more samples. What it keeps is
# every state with a real offset: `run` at 0.990 (0.040 out, sd 0.014), `prone`
# at 0.626, the dash family at 0.980-0.985, `crouch` at 0.918, `downHeavy` at
# 0.908.
#
# Measured, leave-one-character-out, over the 1,010 corrections: 0.3 lands at
# 5.45px median / 8.25px mean, against 5.59 / 8.60 at one standard deviation
# (which drops `dash` and costs it 9.4px against 1.9px) and 5.60 / 8.21 with no
# filter at all. The differences are small because the filter only ever acts
# where the two answers agree — which is the argument for it being weak rather
# than for it being absent.
STATE_FOOT_MARGIN = 0.3
# A state named in NO_STANDING_FOOT has to clear a much higher bar, because for
# those the claim is not "this contact sits a little differently" but "this pose
# has a contact at all". `prone` makes it easily — 0.626 against the roster's
# 0.950 is 2.8 of its own standard deviations, and 35 fighters agree that a body
# on its side stands a third of its height above its lowest pixel. `airLight`
# does not: its median is 0.024 from the roster and its corrections scatter by
# 0.102, so what it has is noise with a state name on it. At 0.3 it slipped
# through on one round's worth of new samples and proposed a foot line BELOW the
# drawing, which is the failure the list was written to prevent.
NO_STANDING_FOOT_MARGIN = 1.5
# Hand-tuned poses a character needs before their own foot level is used
# instead of the roster's. Below this the median is noise.
MIN_CHAR_FOOT_SAMPLES = 8
# --- the size rule, measured from ink area ---------------------------------
#
# How big a drawing of a person is cannot be read off its bounding box: a crouch
# is short, a lunge is long, and neither is a smaller or a larger fighter. What
# does not change with the pose is HOW MUCH CHARACTER IS DRAWN — the opaque area
# of the figure — because a body has the same amount of body in it whatever it
# is doing. Area goes as the square of linear size, so
#
#     renderScale = idle renderScale x sqrt(idle area / this frame's area)
#
# puts a frame at the size the character's own idle is drawn at. Scored against
# the 1,403 hand-set `renderScale` values it lands at 5.1% median relative error,
# against 14.9% for the import default it replaces and 12.2% for the idle's own
# scale — see sprites/docs/sprite-import-defaults.md.
#
# It is not exact, and the residual has a shape: a pose that folds up hides some
# of itself (a roll reads small), and a pose carrying an effect welded to the
# body reads large (an ult). That residual is measured per state exactly the way
# the foot fraction is, and it takes the median error to 4.0%.
MIN_STATE_AREA_SAMPLES = 6
MIN_STATE_AREA_CHARS = 3
# Where a state has NO measured ratio the rule is running on area alone, and a
# frame whose area is not the character's silhouette — a plate with an effect
# twice the fighter's size welded to it — would be sized off that. So a raw-area
# proposal may not resize a pose by more than this; a state with its own ratio
# has already accounted for what its area does, and is trusted with any move,
# the same standing MAX_FOOT_SHIFT gives a measured foot fraction.
MAX_AREA_SHIFT = 0.35

# How far a frame's `com` anchor has to sit from the art's own centroid before
# it counts as a judgement rather than the bake. `bake_anchors.py` writes the
# anchor AT the alpha centroid (lifting only its y), and measures it on a
# downsampled mask, so a baked anchor lands within a pixel or two of what
# `measure` reads here and a dragged one is nowhere near: the gap is under 2px
# on 144 of the hand-set frames and a median 22px on the other 250. There is
# nothing in between to get wrong.
COM_PLACED_PX = 2.0

# Refuse to move a foot line further than this fraction of body height in one
# go — but only where the rule is FALLING BACK on the roster fraction, because
# there a big move means the frame is not what the rule thinks it is (a
# detached effect owning the largest component, say). Where the state has its
# own measured fraction the size of the move is the finding rather than a
# warning: a prone pose really does stand 37% of its body height above its
# lowest pixel, and this guard is what used to refuse it.
MAX_FOOT_SHIFT = 0.20
# ...and either way, the frame's existing foot line has to be somewhere a rule
# can reason about. Outside this band it is not a placement the rule can
# improve on, it is a number that means something else.
SANE_FOOT_BAND = (0.30, 1.70)

# States whose ground contact is NOT the sole of a standing foot, so the ROSTER
# fraction does not describe them.
#
# This is now a fallback guard rather than a refusal. A state with enough
# corrections of its own speaks for itself — `prone` is measured at 0.626 over
# 35 poses, which is a rule as strong as any here, and it is listed below only
# because the roster's 0.946 is catastrophic for it. A state listed here that
# the roster cannot describe AND that has too few corrections to describe
# itself is declined, because a guess is worse than the hand pass it would be
# pretending to save.
#
# The fraction exists because a foot drawn in perspective hides its sole, and
# that is true of any pose the character stands in — measured across the hand
# tuning it holds at 0.946 whether the pose is drawn taller than wide (n=470)
# or wider than tall (n=39, same median), so how sprawling the drawing is says
# nothing. What breaks it is the character not being on their feet: `prone`
# lies flat and touches the floor along its whole side, so its contact really
# is the lowest pixel and lifting it 5% hovers the body above the ground.
#
# This is a list rather than a measurement because it is a fact about what the
# pose MEANS, and there is nothing in the alpha channel that knows it. The
# magnitude guard above catches the extreme cases either way — it is what
# stopped momo/prone, whose art is flat enough that 0.946 wanted to move the
# contact 37% of its height — but a pose that is quietly 5% wrong would sail
# through, so the states are named.
#
# The airborne states are here for a different reason: a fighter in the air is
# not making contact with anything, so there is no foot line to solve. What the
# rule produced instead was every jump, fall, air dodge and aerial pinned by its
# lowest drawn pixel to the floor — a trailing toe, a tucked heel, a hanging
# hand — which is a placement nobody chose and which was then locked in, because
# the workbench's vertical control refused to move an airborne pose. The pose
# that matters to them is the HURTBOX, and only an eye can say where a tucked
# body should sit inside it, so the rule declines rather than guessing. They
# have 2-3 corrections apiece between them, far short of what a state needs to
# answer for itself, so declining is still what happens to all of them.
NO_STANDING_FOOT = {"prone", "jump", "fall", "ledge", "dodge_air", "airLight"}


def now_stamp():
    return datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds")


# ------------------------------------------------------------------- measuring
_MEASURED = {}


def measure(path):
    """The four things the rules need from a drawing.

    `body_bottom` is the bottom of the LARGEST connected component, which is
    what sprites/docs/asset-pipeline.md means by the foot line — a detached energy burst
    below the feet is not the floor. `centroid_x` is alpha-weighted, so it is
    the middle of the character's mass rather than of its bounding box.
    `area` is how many pixels that largest component covers — how much CHARACTER
    is drawn, which is what the size rule scales against (see `learn_area`).

    Memoised by path. Three learners and the tuning pass all measure the same
    ~1,800 drawings, and reading each of them once rather than four times is the
    difference between a tool somebody runs and one they avoid.
    """
    hit = _MEASURED.get(path)
    if hit is not None:
        return hit
    _MEASURED[path] = out = _measure(path)
    return out


def _measure(path):
    a = np.asarray(Image.open(path).convert("RGBA"))
    alpha = a[:, :, 3]
    solid = alpha >= ALPHA_THRESHOLD
    if not solid.any():
        return None
    ys, xs = np.nonzero(solid)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    lab, n = ndimage.label(solid, np.ones((3, 3), np.int8))
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        body = lab == int(np.argmax(sizes)) + 1
        rows = np.nonzero(body.any(axis=1))[0]
        body_bottom = int(rows[-1]) + 1
        area = int(body.sum())
    else:
        body_bottom = box[3]
        area = int(solid.sum())
    w = alpha[ys, xs].astype(np.float64)
    return {
        "box": box,
        "body_bottom": body_bottom,
        "area": area,
        "centroid_x": float((xs * w).sum() / w.sum()),
        "art_h": box[3] - box[1],
    }


# --------------------------------------------------------------------- learning
def spread(vals):
    """Coefficient of variation — the spread a uniformity gate is measured in."""
    mean = statistics.mean(vals)
    return statistics.pstdev(vals) / mean if mean else 1.0


def states_for(anims, char, key):
    return tuple(sorted(s for s, keys in anims.get(char, {}).items() if key in keys))


def learn_foot(man, anims):
    """The foot line as a fraction of body height: per state, and per character.

    Learned from poses whose `bodyBottom` a human edited, because those are the
    ones where somebody decided where the figure stands.

    Two levels, because the corrections carry two signals. The STATE says what
    the pose is doing — standing still, running, lying down — and it is the
    larger of the two by a long way. The CHARACTER is a small residual on top,
    how one fighter's art is drawn against the roster's, and it is a multiplier
    rather than a value of its own so that it survives the state it is applied
    to. A state or a character with too few corrections falls back to the level
    above rather than to a shaky one of its own.
    """
    samples = []
    for char, poses in man["characters"].items():
        for key, meta in poses.items():
            if not isinstance(meta, dict):
                continue
            if "bodyBottom" not in (meta.get("edited") or {}):
                continue
            path = os.path.join(SPRITES, meta.get("file", ""))
            if not meta.get("file") or not os.path.exists(path):
                continue
            m = measure(path)
            if not m or not m["body_bottom"]:
                continue
            samples.append((char, states_for(anims, char, key),
                            (meta["bodyBottom"] - meta["oy"]) / m["body_bottom"]))

    everyone = [f for _, _, f in samples]
    glob = statistics.median(everyone) if everyone else None

    by_state = collections.defaultdict(list)
    for char, states, frac in samples:
        for s in states:
            by_state[s].append((char, frac))
    per_state, near_roster = {}, {}
    for state, vals in by_state.items():
        chars = {c for c, _ in vals}
        if len(vals) < MIN_STATE_FOOT_SAMPLES or len(chars) < MIN_STATE_FOOT_CHARS:
            continue
        fracs = [f for _, f in vals]
        entry = {"frac": statistics.median(fracs), "n": len(fracs),
                 "chars": len(chars), "sd": statistics.pstdev(fracs)}
        margin = (NO_STANDING_FOOT_MARGIN if state in NO_STANDING_FOOT
                  else STATE_FOOT_MARGIN)
        if glob and abs(entry["frac"] - glob) < margin * entry["sd"]:
            near_roster[state] = entry
        else:
            per_state[state] = entry

    # The character's level is measured against whatever the state level already
    # explains, so a fighter who happens to have been corrected mostly on run
    # frames does not come out as standing high.
    by_char = collections.defaultdict(list)
    for char, states, frac in samples:
        base = _state_frac(per_state, states) or glob
        if base:
            by_char[char].append(frac / base)
    return {
        "global": glob,
        "per_state": per_state,
        "near_roster": near_roster,
        "per_char": {c: statistics.median(v) for c, v in by_char.items()
                     if len(v) >= MIN_CHAR_FOOT_SAMPLES},
        "n": len(everyone),
    }


def _state_frac(per_state, states):
    """The fraction the states a pose serves agree on, or None if none is known."""
    known = [per_state[s]["frac"] for s in states if s in per_state]
    return statistics.median(known) if known else None


def foot_fraction(foot, char, states):
    """Where this pose's figure stands, as (fraction, why) or (None, why not)."""
    level = foot["per_char"].get(char, 1.0)
    measured = _state_frac(foot["per_state"], states)
    if measured is not None:
        named = "/".join(s for s in states if s in foot["per_state"])
        return measured * level, f"foot={measured * level:.3f} ({named})", True
    if states and all(s in NO_STANDING_FOOT for s in states):
        return None, f"{'/'.join(states)} has no measured foot fraction — left alone", False
    if not foot["global"]:
        return None, "nothing learned to place a foot line from", False
    src = "character" if char in foot["per_char"] else "roster"
    return foot["global"] * level, f"foot={foot['global'] * level:.3f} ({src})", False


IDLE_KEYS = ("idle_a", "r0c0")


def area_reference(man, char):
    """The drawing this character's sizes are measured against: their idle's
    `renderScale` and the ink area it is drawn with.

    The idle is already the reference frame for everything else about a
    character's size — `src/heights.js` solves their on-screen scale from its
    span, and `learn_sizes` divides every ratio by its `bodyH` — so a size rule
    that answered to anything else would put a fighter's poses at odds with the
    one drawing their whole scale is pinned to.
    """
    frames = man["characters"].get(char) or {}
    for key in IDLE_KEYS:
        meta = frames.get(key)
        if not isinstance(meta, dict) or not meta.get("renderScale"):
            continue
        path = os.path.join(SPRITES, meta.get("file", ""))
        if not meta.get("file") or not os.path.exists(path):
            continue
        m = measure(path)
        if m and m["area"]:
            return {"scale": meta["renderScale"], "area": m["area"], "key": key}
    return None


def area_scale(ref, m):
    """The scale that draws `m` at the same size as the reference idle."""
    if not ref or not m or not m["area"]:
        return None
    return ref["scale"] * math.sqrt(ref["area"] / m["area"])


def learn_area(man, anims):
    """What each state's ink area says about it, over the hand-set sizes.

    The raw area rule assumes a pose shows as much of the character as the idle
    does. Mostly it does. Where it does not, the departure is a fact about the
    POSE and not about the fighter — a roll is curled up and hides its own
    limbs, an ult is drawn inside its own cursed energy — so it is measured per
    state, over the corrections humans have already made, and applied as a
    multiplier on top.

    A state without enough corrections of its own gets no ratio and is placed on
    area alone, under MAX_AREA_SHIFT. That is the same shape as the foot rule:
    the fallback is the general measurement, not a refusal, because an imported
    pose is given a size whether anybody has an opinion about it or not.
    """
    refs, samples = {}, []
    for char, poses in man["characters"].items():
        ref = area_reference(man, char)
        if not ref:
            continue
        refs[char] = ref
        for key, meta in poses.items():
            if not isinstance(meta, dict):
                continue
            if "renderScale" not in (meta.get("edited") or {}):
                continue
            if not meta.get("renderScale"):
                continue
            path = os.path.join(SPRITES, meta.get("file", ""))
            if not meta.get("file") or not os.path.exists(path):
                continue
            want = area_scale(ref, measure(path))
            if not want:
                continue
            samples.append((char, states_for(anims, char, key),
                            meta["renderScale"] / want))

    by_state = collections.defaultdict(list)
    for char, states, ratio in samples:
        for state in states:
            by_state[state].append((char, ratio))
    per_state = {}
    for state, vals in by_state.items():
        chars = {c for c, _ in vals}
        if len(vals) < MIN_STATE_AREA_SAMPLES or len(chars) < MIN_STATE_AREA_CHARS:
            continue
        ratios = [r for _, r in vals]
        per_state[state] = {"ratio": statistics.median(ratios), "n": len(ratios),
                            "chars": len(chars), "sd": statistics.pstdev(ratios)}
    return {"refs": refs, "per_state": per_state, "n": len(samples)}


def area_ratio(area, states):
    """The pose correction on top of raw area, and whether one was measured."""
    known = [area["per_state"][s]["ratio"] for s in states if s in area["per_state"]]
    if not known:
        return 1.0, False
    return statistics.median(known), True


def learn_sizes(man, reviewed, anims):
    """Per state: the height-to-idle ratio, how much it varies, and per
    character: the level their whole set sits at.

    The variation is the whole point. A state every reviewed character sizes
    identically is a rule someone applied; one that ranges 13% is a judgement
    they made per fighter, and there is no value to restore it to.

    But every ratio here is divided by one number — that character's idle — so
    a fighter whose idle was re-placed at a different size has every one of
    their ratios move together, and a rule state looks like a judged one. That
    is not a hypothetical: six fighters carry a 2.3-3.0% step between their
    idle and the sheet cell it replaced, which is exactly enough to push nine
    rule states over the gate. So the level is estimated and divided out, and
    the uniformity question is asked of what is left.
    """
    samples = collections.defaultdict(list)
    for char in reviewed:
        frames = man["characters"].get(char) or {}
        base = next((frames[k]["bodyH"] for k in ("idle_a", "r0c0")
                     if isinstance(frames.get(k), dict) and frames[k].get("bodyH")), None)
        if not base:
            continue
        for key, meta in frames.items():
            if not isinstance(meta, dict) or not meta.get("bodyH"):
                continue
            for state in states_for(anims, char, key):
                samples[state].append((char, meta["bodyH"] / base))

    # Bootstrap: the states near enough to uniform that a character's departure
    # from them is about the character rather than about the state.
    raw = {s: [r for _, r in v] for s, v in samples.items() if len(v) >= MIN_STATE_SAMPLES}
    near = {s: statistics.median(v) for s, v in raw.items() if spread(v) <= BOOTSTRAP_CV}
    by_char = collections.defaultdict(list)
    for state, med in near.items():
        for char, ratio in samples[state]:
            if med:
                by_char[char].append(ratio / med)
    levels = {c: statistics.median(v) for c, v in by_char.items()
              if len(v) >= MIN_LEVEL_SAMPLES}

    out = {}
    for state, vals in samples.items():
        if len(vals) < MIN_STATE_SAMPLES:
            continue
        adj = [r / levels.get(c, 1.0) for c, r in vals]
        cv = spread(adj)
        out[state] = {"ratio": statistics.median(adj), "cv": cv, "n": len(vals),
                      "raw_cv": spread([r for _, r in vals]), "uniform": cv <= UNIFORM_CV}
    return out, levels


# --------------------------------------------------------------------- applying
def tune_frame(char, key, meta, states, foot, sizes, levels, idle_bodyh, want,
               area=None):
    """The proposed changes for one frame, as {field: (old, new, why)}.

    Returns only fields that would actually move, and never one the pose's
    `edited` map claims — a value somebody chose while looking at the sprite
    outranks every measurement here.
    """
    edited = meta.get("edited") or {}
    path = os.path.join(SPRITES, meta.get("file", ""))
    if not meta.get("file") or not os.path.exists(path):
        return {}, "no art on disk"
    m = measure(path)
    if not m:
        return {}, "no visible pixels"

    out, notes = {}, []

    # ---- foot line
    if "foot" in want and "bodyBottom" not in edited and meta.get("oy") is not None:
        frac, why_foot, measured = foot_fraction(foot, char, states)
        old_bb = meta.get("bodyBottom")
        # A declined foot line is not a reason to skip the frame — the centring
        # rule still has something to say about it — so this falls through
        # rather than returning.
        if frac and m["body_bottom"] and old_bb is not None:
            # The placement the rule is being asked to improve on has to be one
            # it can read at all. A foot line nowhere near the drawing is not a
            # bad placement, it is a number that means something else.
            here = (old_bb - meta["oy"]) / m["body_bottom"]
            if not SANE_FOOT_BAND[0] <= here <= SANE_FOOT_BAND[1]:
                return out, (f"foot line sits at {here:.2f} of body height — "
                             "not a placement this rule can read")
            new_bb = round(meta["oy"] + frac * m["body_bottom"], 1)
            shift = abs(new_bb - old_bb) / m["body_bottom"]
            # A big move is a warning only where the rule is guessing from the
            # roster. Where the STATE was measured, the size of the move is the
            # measurement: a prone pose stands a third of its height above its
            # lowest pixel and that is the whole point of knowing it is prone.
            if shift > MAX_FOOT_SHIFT and not measured:
                return out, f"foot line would move {shift:.0%} of body height — left alone"
            if abs(new_bb - old_bb) >= 0.5:
                out["bodyBottom"] = (old_bb, new_bb, why_foot)

    # ---- size, uniform states only
    if "size" in want and "renderScale" not in edited and idle_bodyh and states:
        known = [sizes[s] for s in states if s in sizes]
        # Every state this pose serves has to be uniform. A pose that is both a
        # `jump` (uniform) and a `crouchAttack` (not) has no single right answer
        # and is exactly the case to leave to a person.
        if known and len(known) == len(states) and all(s["uniform"] for s in known):
            ratio = statistics.median([s["ratio"] for s in known])
            # ...times where this character's own set sits. The ratio is the
            # roster's, measured with every character's level divided out, so
            # putting theirs back is what makes the result agree with the rest
            # of THEIR poses rather than with the roster's average fighter.
            new_h = round(ratio * levels.get(char, 1.0) * idle_bodyh, 1)
            if m["art_h"]:
                new_scale = round(new_h / m["art_h"], 3)
                if abs(new_scale - (meta.get("renderScale") or 0)) >= 0.001:
                    out["bodyH"] = (meta.get("bodyH"), new_h, f"ratio={ratio:.3f} x idle")
                    out["renderScale"] = (meta.get("renderScale"), new_scale,
                                          f"{'/'.join(sorted(states))} is uniform")

    # ---- size, from ink area, for everything the uniform rule cannot speak for
    #
    # Second rather than first: where a state IS uniform its height ratio
    # reproduces the hand values to a hundredth of a percent, and nothing
    # measured from a drawing competes with that. This is what the other 31
    # states get, which today is the predecessor's rendered height — the number
    # the size corrections are made against.
    if ("size" in want and "renderScale" not in edited and area
            and "renderScale" not in out):
        ref = area["refs"].get(char)
        want_scale = area_scale(ref, m)
        if want_scale and ref["key"] != key:
            pose_ratio, measured = area_ratio(area, states)
            new_scale = round(want_scale * pose_ratio, 4)
            old_scale = meta.get("renderScale")
            shift = abs(new_scale / old_scale - 1) if old_scale else 0
            named = "/".join(st for st in states if st in area["per_state"])
            why = (f"area x {pose_ratio:.3f} ({named})" if measured
                   else "area, no pose ratio")
            # Declining the size is not a reason to skip the pose — the foot and
            # centring rules still have something to say about it — so this
            # leaves the size alone rather than returning.
            refused = not measured and old_scale and shift > MAX_AREA_SHIFT
            if refused:
                notes.append(f"area wants to resize by {shift:.0%} and "
                             f"{'/'.join(states) or 'this pose'} has no measured "
                             "ratio — size left alone")
            elif m["art_h"] and abs(new_scale - (old_scale or 0)) >= 0.001:
                out["bodyH"] = (meta.get("bodyH"), round(m["art_h"] * new_scale, 1), why)
                out["renderScale"] = (old_scale, new_scale, why)

    # ---- horizontal centre
    #
    # The centroid is the derivation, and where the frame carries a com anchor
    # SOMEBODY MOVED, that is a better answer than the measurement it replaced.
    # The anchor is baked at the centroid, so an anchor that no longer sits
    # there is one a person dragged in the workbench — a judgement about where
    # the body is, made against a naginata, a guitar neck, an effect blooming
    # off one shoulder. Scored against the 394 hand-set `ox` values, the split
    # is the finding: on the 250 frames carrying a moved com the centroid is
    # 49px out in image pixels (~12 on screen) and the anchor 22 (~5), and on
    # the 144 where the anchor IS the bake the two are the same number. The
    # correction was already made, in a field written for another purpose.
    if "centre" in want and "ox" not in edited:
        com = (meta.get("anchors") or {}).get("com")
        placed = (isinstance(com, list) and len(com) == 2
                  and abs(com[0] - m["centroid_x"]) > COM_PLACED_PX)
        centre_x = com[0] if placed else m["centroid_x"]
        new_ox = round(CELL_MID - centre_x, 1)
        old_ox = meta.get("ox")
        if old_ox is None or abs(new_ox - old_ox) >= 0.5:
            out["ox"] = (old_ox, new_ox, "on the placed centre of mass" if placed
                         else "centre of mass, not of the box")

    return out, ("; ".join(notes) if notes and not out else None)


def newest_round(man):
    """The stamp of the most recent import, from the `replaced` markers."""
    stamps = [meta["replaced"]["at"]
              for poses in man["characters"].values() for meta in poses.values()
              if isinstance(meta, dict) and (meta.get("replaced") or {}).get("at")]
    return max(stamps) if stamps else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true",
                    help="print what the rules learned and stop")
    ap.add_argument("--backtest", action="store_true",
                    help="score the rules against the hand values, and stop")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true",
                    help="every pose, not just the ones the last round touched")
    ap.add_argument("--round", dest="round_prefix",
                    help="tune poses whose import stamp starts with this, e.g. "
                         "2026-08-09 for a round that arrived in several batches")
    ap.add_argument("--char", nargs="*", help="limit to these characters")
    ap.add_argument("--rules", nargs="*", default=["foot", "size", "centre"],
                    choices=["foot", "size", "centre"])
    ap.add_argument("--reviewed", nargs="*", default=DEFAULT_REVIEWED)
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    anims = anims_by_frame(open(CHARACTERS_JS).read(), list(man["characters"]))
    foot = learn_foot(man, anims)
    sizes, levels = learn_sizes(man, args.reviewed, anims)
    area = learn_area(man, anims)

    if args.report:
        print(f"foot line: learned from {foot['n']} hand-tuned poses")
        print(f"  roster median  {foot['global']:.4f}  — the fallback, for a state "
              f"with too few corrections of its own")
        print(f"  {len(foot['per_state'])} state(s) measured their own "
              f"(>= {MIN_STATE_FOOT_SAMPLES} poses over >= {MIN_STATE_FOOT_CHARS} characters)")
        for state, s in sorted(foot["per_state"].items(), key=lambda x: x[1]["frac"]):
            print(f"     {state:16} {s['frac']:.3f}  sd {s['sd']:.3f}  "
                  f"n={s['n']} over {s['chars']} characters")
        near = sorted(foot.get("near_roster") or {})
        if near:
            print(f"     using the roster's: {', '.join(near)} — measured, but"
                  f" within {STATE_FOOT_MARGIN:g} sd of it")
        declined = sorted(s for s in NO_STANDING_FOOT if s not in foot["per_state"])
        if declined:
            print(f"     declined: {', '.join(declined)} — no measured fraction and "
                  f"the roster's does not describe them")
        print(f"  per-character level  {len(foot['per_char'])} of {len(man['characters'])} "
              f"have >= {MIN_CHAR_FOOT_SAMPLES} samples")
        for c, v in sorted(foot["per_char"].items(), key=lambda x: x[1]):
            if abs(v - 1) >= 0.01:
                print(f"     {c:12} x{v:.3f}")

        print(f"\nsize: {sum(1 for s in sizes.values() if s['uniform'])} uniform state(s), "
              f"{sum(1 for s in sizes.values() if not s['uniform'])} judged per character")
        for state, s in sorted(sizes.items(), key=lambda x: x[1]["cv"]):
            mark = "RULE  " if s["uniform"] else "judged"
            print(f"  {mark} {state:16} ratio {s['ratio']:.3f}  spread {s['cv']:6.1%}"
                  f"  (raw {s['raw_cv']:5.1%})  n={s['n']}")
        print(f"\nsize from ink area: learned from {area['n']} hand-set scales, "
              f"{len(area['refs'])} reference idles")
        print(f"  {len(area['per_state'])} state(s) measured a pose ratio "
              f"(>= {MIN_STATE_AREA_SAMPLES} poses over >= {MIN_STATE_AREA_CHARS} "
              f"characters); the rest run on area alone under "
              f"{MAX_AREA_SHIFT:.0%}")
        for state, a in sorted(area["per_state"].items(), key=lambda x: x[1]["ratio"]):
            print(f"     {state:16} x{a['ratio']:.3f}  sd {a['sd']:.3f}  "
                  f"n={a['n']} over {a['chars']} characters")

        odd = {c: v for c, v in levels.items() if abs(v - 1) >= 0.005}
        if odd:
            print("\n  characters whose set sits away from the roster's level — their"
                  "\n  idle and their other poses disagree, and are worth re-measuring:")
            for c, v in sorted(odd.items(), key=lambda x: x[1]):
                frames = man["characters"].get(c) or {}
                idle = (frames.get("idle_a") or {}).get("bodyH")
                cell = (frames.get("r0c0") or {}).get("bodyH")
                gap = (f"   idle_a {idle:g} vs r0c0 {cell:g}"
                       if idle and cell and abs(idle - cell) > 0.5 else "")
                print(f"     {c:12} x{v:.3f}{gap}")
        return 0

    if args.backtest:
        return backtest(man, foot, sizes, levels, area, anims, args)

    stamp = None if (args.all or args.round_prefix) else newest_round(man)
    if not args.all and not args.round_prefix and not stamp:
        print("no import markers found — nothing to tune (use --all to sweep everything)")
        return 0

    def in_scope(meta):
        if args.all:
            return True
        at = (meta.get("replaced") or {}).get("at")
        if not at:
            return False
        return at.startswith(args.round_prefix) if args.round_prefix else at == stamp

    changed, skipped, notes = 0, 0, []
    fields_touched = collections.Counter()
    at = now_stamp()
    for char, poses in sorted(man["characters"].items()):
        if args.char and char not in args.char:
            continue
        frames = anims.get(char, {})
        idle = poses.get("idle_a") or poses.get("r0c0")
        idle_bodyh = idle.get("bodyH") if isinstance(idle, dict) else None
        for key, meta in sorted(poses.items()):
            if not isinstance(meta, dict):
                continue
            if not in_scope(meta):
                continue
            states = tuple(sorted(s for s, keys in frames.items() if key in keys))
            out, why = tune_frame(char, key, meta, states, foot, sizes, levels,
                                  idle_bodyh, args.rules, area)
            if why:
                skipped += 1
                notes.append(f"  {char}/{key}: {why}")
                continue
            if not out:
                continue
            changed += 1
            bits = []
            for field, (old, new, reason) in out.items():
                fields_touched[field] += 1
                if not args.dry_run:
                    meta[field] = new
                fmt = (lambda v: "—" if v is None else
                       (f"{v:g}" if isinstance(v, (int, float)) else str(v)))
                bits.append(f"{field} {fmt(old)}->{fmt(new)}")
            if not args.dry_run:
                # Provenance, NOT an edit. The workbench's "no saved edits" list
                # reads `edited`; a pose the tuner touched still needs a human to
                # look at it, so it has to stay on that list.
                meta["autoTuned"] = {
                    "at": at,
                    "fields": {f: out[f][2] for f in out},
                }
            print(f"  {char}/{key}: " + "; ".join(bits))

    for line in notes:
        print(line)
    scope = ("every pose" if args.all else
             f"the round of {args.round_prefix}" if args.round_prefix else
             f"the round of {stamp}")
    print(f"\n{changed} frame(s) tuned across {scope}"
          + (f", {skipped} left alone" if skipped else ""))
    for f, n in fields_touched.most_common():
        print(f"   {f:12} {n}")
    if args.dry_run:
        print("dry run — nothing written")
        return 0
    if changed:
        with open(MANIFEST, "w") as fh:
            json.dump(man, fh, indent=1)
            fh.write("\n")
        print(f"wrote {MANIFEST}")
    return 0


def backtest(man, foot, sizes, levels, area, anims, args):
    """Score each rule against the values humans actually chose.

    The rules are learned from the same hand tuning they are scored against, so
    the foot fraction is reported leave-one-character-out: a character's own
    median is recomputed without them before it is used on them. Otherwise this
    would be marking its own homework.
    """
    rows = []
    for char, poses in man["characters"].items():
        for key, meta in poses.items():
            if not isinstance(meta, dict) or "bodyBottom" not in (meta.get("edited") or {}):
                continue
            path = os.path.join(SPRITES, meta.get("file", ""))
            if not meta.get("file") or not os.path.exists(path):
                continue
            m = measure(path)
            if not m or not m["body_bottom"]:
                continue
            rows.append((char, key, meta, m,
                         (meta["bodyBottom"] - meta["oy"]) / m["body_bottom"],
                         states_for(anims, char, key)))

    # Leave-one-character-out: re-learn without the fighter being scored, so no
    # rule is marking its own homework. That is 35 re-learns over the whole
    # manifest, so the samples are gathered once and the medians recomputed.
    samples = [(char, states, frac) for char, key, meta, m, frac, states in rows]
    everyone = [f for _, _, f in samples]
    g = statistics.median(everyone)

    def relearn(without):
        keep = [s for s in samples if s[0] != without]
        by_state = collections.defaultdict(list)
        for char, states, frac in keep:
            for s in states:
                by_state[s].append((char, frac))
        g_keep = statistics.median([f for _, _, f in keep])
        per_state = {}
        for state, vals in by_state.items():
            if (len(vals) < MIN_STATE_FOOT_SAMPLES
                    or len({c for c, _ in vals}) < MIN_STATE_FOOT_CHARS):
                continue
            fracs = [f for _, f in vals]
            frac, sd = statistics.median(fracs), statistics.pstdev(fracs)
            margin = (NO_STANDING_FOOT_MARGIN if state in NO_STANDING_FOOT
                      else STATE_FOOT_MARGIN)
            if abs(frac - g_keep) >= margin * sd:
                per_state[state] = {"frac": frac}
        # The character being scored keeps their own level — it is measured from
        # their other poses, not from them, and dropping it would score a rule
        # nobody proposes.
        by_char = collections.defaultdict(list)
        for char, states, frac in keep:
            base = _state_frac(per_state, states) or statistics.median(
                [f for _, _, f in keep])
            if base:
                by_char[char].append(frac / base)
        return {"global": statistics.median([f for _, _, f in keep]),
                "per_state": per_state,
                "per_char": {c: statistics.median(v) for c, v in by_char.items()
                             if len(v) >= MIN_CHAR_FOOT_SAMPLES}}

    learned = {c: relearn(c) for c in {r[0] for r in rows}}
    derived, flat, tuned = [], [], []
    for char, key, meta, m, frac, states in rows:
        scale = meta.get("renderScale") or 0.25
        bb = m["body_bottom"]
        # what the pipeline derived is the bottom of the art, by construction
        derived.append(abs(bb - frac * bb) * scale)
        # the roster fraction on its own, which is the rule this replaced
        f0 = learned[char]
        level = f0["per_char"].get(char, 1.0)
        flat.append(abs(f0["global"] * level * bb - frac * bb) * scale)
        use, _, _ = foot_fraction(f0, char, states)
        # a declined state keeps the pipeline's value, which is what declining
        # actually leaves on the pose
        tuned.append(abs((use if use else 1.0) * bb - frac * bb) * scale)
    derived.sort(); flat.sort(); tuned.sort()

    def pct(v, p):
        return v[int(p * (len(v) - 1))]
    print(f"foot line, scored against {len(rows)} hand-tuned poses "
          f"(leave-one-character-out), in ON-SCREEN pixels:")
    print(f"  pipeline today   median {statistics.median(derived):5.1f}  p90 {pct(derived, .9):5.1f}")
    print(f"  one fraction     median {statistics.median(flat):5.1f}  p90 {pct(flat, .9):5.1f}")
    print(f"  per state        median {statistics.median(tuned):5.1f}  p90 {pct(tuned, .9):5.1f}")

    # size: a uniform state's ratio should reproduce the hand value exactly
    errs, n_uniform = [], 0
    for char in args.reviewed:
        poses = man["characters"].get(char) or {}
        idle = poses.get("idle_a") or poses.get("r0c0")
        base = idle.get("bodyH") if isinstance(idle, dict) else None
        if not base:
            continue
        for key, meta in poses.items():
            if not isinstance(meta, dict) or not meta.get("bodyH"):
                continue
            states = tuple(sorted(s for s, keys in anims.get(char, {}).items() if key in keys))
            known = [sizes[s] for s in states if s in sizes]
            if not known or len(known) != len(states) or not all(s["uniform"] for s in known):
                continue
            n_uniform += 1
            ratio = statistics.median([s["ratio"] for s in known])
            want_h = ratio * levels.get(char, 1.0) * base
            errs.append(abs(want_h - meta["bodyH"]) / meta["bodyH"])
    if errs:
        errs.sort()
        print(f"\nsize, on the {n_uniform} poses whose states are all uniform:")
        print(f"  median relative error {statistics.median(errs):.2%}  "
              f"p90 {pct(errs, .9):.2%}  worst {max(errs):.2%}")

    backtest_area(man, area, anims, pct)
    return 0


def backtest_area(man, area, anims, pct):
    """Score the area rule against the sizes humans chose, on the poses the
    uniform rule cannot speak for — which is the population it is FOR.

    Leave-one-character-out on the pose ratios, for the same reason the foot
    rule is: they are learned from the corrections they are scored against.
    """
    rows = []
    for char, poses in man["characters"].items():
        ref = area["refs"].get(char)
        if not ref:
            continue
        for key, meta in poses.items():
            if not isinstance(meta, dict) or key == ref["key"]:
                continue
            if "renderScale" not in (meta.get("edited") or {}):
                continue
            was = (meta.get("edited") or {})["renderScale"]
            path = os.path.join(SPRITES, meta.get("file", ""))
            if not meta.get("renderScale") or not was or not meta.get("file"):
                continue
            if not os.path.exists(path):
                continue
            m = measure(path)
            if not m:
                continue
            rows.append((char, states_for(anims, char, key), meta["renderScale"],
                         was, ref, m))
    if not rows:
        return

    def ratios_without(char, states):
        vals = []
        for c, st, hand, _, r, m in rows:
            if c == char or not set(st) & set(states):
                continue
            want = area_scale(r, m)
            if want:
                vals.append(hand / want)
        return vals

    imported, idle_only, raw, tuned = [], [], [], []
    for char, states, hand, was, ref, m in rows:
        want = area_scale(ref, m)
        if not want:
            continue
        imported.append(abs(was / hand - 1))
        idle_only.append(abs(ref["scale"] / hand - 1))
        raw.append(abs(want / hand - 1))
        vals = ratios_without(char, states) if states else []
        r = statistics.median(vals) if len(vals) >= MIN_STATE_AREA_SAMPLES else 1.0
        tuned.append(abs(want * r / hand - 1))
    for v in (imported, idle_only, raw, tuned):
        v.sort()
    print(f"\nsize, scored against {len(raw)} hand-set scales "
          f"(leave-one-character-out), as relative error in rendered size:")
    print(f"  import default   median {statistics.median(imported):6.2%}  "
          f"p90 {pct(imported, .9):6.2%}")
    print(f"  the idle's scale median {statistics.median(idle_only):6.2%}  "
          f"p90 {pct(idle_only, .9):6.2%}")
    print(f"  ink area         median {statistics.median(raw):6.2%}  "
          f"p90 {pct(raw, .9):6.2%}")
    print(f"  area x pose      median {statistics.median(tuned):6.2%}  "
          f"p90 {pct(tuned, .9):6.2%}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
