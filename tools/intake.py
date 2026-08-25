#!/usr/bin/env python3
"""Process delivered art in `assets/intake/` — key, straighten, measure, report.

Nothing here touches `sprites/assets/` or the manifest. Intake exists so a
delivery can be judged BEFORE it reaches the game, because past rounds fixed
one problem while introducing another: a corrected costume at half the
resolution, a corrected pose facing the wrong way, art keyed off green that
left a halo on every hair edge.

Processed copies land in `assets/intake/_processed/`, which
`intake_sheets.py` renders as before/after boards. Import is a separate,
later step, run only on the frames a human approved.

  --report     measure and print, write nothing
  --chars      limit to some characters

Usage:
  python3 intake.py
  python3 intake.py --report
  python3 intake.py --chars panda,sukuna
"""
import sprite_paths

import argparse
import json
import os
import re
import subprocess

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

from process_round5_sprites import border_key
import sprite_facing as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
INTAKE = os.path.join(ROOT, "assets", "intake")
PROCESSED = os.path.join(INTAKE, "_processed")
SPRITES = sprite_paths.CHAR

SHEET_CELL = re.compile(r"^r\d+c\d+$")
# Body size below which the art is softer than what it replaces. The sheet
# frames it competes with sit at 256-296px; round-5 art came in at 674-700.
#
# Measured on the figure's LONGEST axis, not its height. Resolution is a
# property of how big the drawing is, and a pose drawn lying down carries it
# across the frame instead of up it — `prone` arrives about 939x208, which is a
# perfectly sharp figure and was being flagged as low-res on every fighter in
# the round that introduced the pose. For anything standing the long axis is
# the height, so this changes nothing about the case it was written for.
MIN_BODY_H = 520
# Below this, `detect_facing` is not saying anything useful — it measured ~83%
# on known-good data and near zero here — so the call goes to a human instead.
FACING_CONFIDENT = 0.12


def anim_map_all():
    """Resolve every character's animation map through the GAME's own module.

    Parsed with node rather than a regex: the Python version silently reported
    stale frames after a comment was added to characters.js, which is exactly
    the class of error this whole pipeline exists to catch.
    """
    js = """
    import {CHARACTERS, DEFAULT_ANIMS} from './src/characters.js';
    const out = {};
    for (const [k, c] of Object.entries(CHARACTERS)) {
      const a = {...DEFAULT_ANIMS, ...(c.anims || {})};
      out[k] = Object.fromEntries(Object.entries(a).map(([s, v]) => [s, v.frames]));
    }
    process.stdout.write(JSON.stringify(out));
    """
    r = subprocess.run(["node", "--input-type=module", "-e", js],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return json.loads(r.stdout)


def key_to_states(anims, char, key):
    """Which animation states this delivered frame will drive."""
    a = anims.get(char, {})
    if SHEET_CELL.match(key):
        return [s for s, fs in a.items() if key in fs]
    if key in a:                       # a semantic frame the manifest already has
        states = [s for s, fs in a.items() if key in fs]
        return states or [key]
    return [key]                       # brand new (dodge_roll / dodge_air)


def current_frames_for(anims, man, char, key):
    """The frame keys a reviewer should compare the new art against."""
    if SHEET_CELL.match(key) or key in man["characters"].get(char, {}):
        return [key]
    # A new state: show whatever that state plays today.
    a = anims.get(char, {})
    if key in a:
        return a[key]
    if key.startswith("dodge"):
        return a.get("dodge", [])
    return []


# ---------------------------------------------------------------- keying

def key_and_trim(path, ref=None):
    """Key the delivered background out and trim to content.

    Reuses the round-5 routine's border sampling, then decontaminates the
    silhouette edge so no key colour survives on a dark stage.
    """
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    if np.asarray(Image.open(path).convert("RGBA"))[:, :, 3].min() < 250:
        rgba = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
        rgb, alpha = rgba[:, :, :3], rgba[:, :, 3] / 255.0
        key = None
    else:
        key = border_key(rgb)
        r, g, b = np.moveaxis(rgb, 2, 0)
        if key[0] > 180 and key[2] > 180 and key[1] < 100:          # magenta
            cand = (r > 145) & (b > 145) & ((np.minimum(r, b) - g) > 70)
        elif key[1] > 120 and key[1] > key[0] + 25 and key[1] > key[2] + 25:  # green
            cand = (g > key[1] - 60) & (g > r + 25) & (g > b + 25)
        else:                                                        # flat neutral
            cand = np.linalg.norm(rgb - key, axis=2) < 30
        seed = np.zeros(cand.shape, bool)
        seed[[0, -1], :] = cand[[0, -1], :]
        seed[:, [0, -1]] |= cand[:, [0, -1]]
        background = flood_background(cand, seed)
        # Background sealed inside the silhouette — between an arm and the
        # body, inside a robe, through the gap in a curl of hair — never
        # touches the canvas border, so the flood fill above cannot reach it.
        # Only UNMISTAKABLE key colour qualifies here, which leaves Geto's pink
        # curse and Hanami's blossoms alone; anything softer is judged by eye
        # on the intake board instead.
        if key[0] > 180 and key[2] > 180 and key[1] < 100:
            background |= (r > 190) & (b > 190) & (g < 85) & ((np.minimum(r, b) - g) > 115)
        elif key[1] > 120 and key[1] > key[0] + 25 and key[1] > key[2] + 25:
            background |= (g > 170) & (r < 120) & (b < 120) & ((g - np.maximum(r, b)) > 90)
        alpha = (~background).astype(np.float32)
        soft = ndimage.binary_dilation(background, iterations=2) & ~background
        d = np.linalg.norm(rgb - key, axis=2)
        alpha[soft] = np.clip((d[soft] - 6.0) / 24.0, 0.0, 1.0)

    clean = rgb.copy()
    edge = (alpha > 0.0) & (alpha < 1.0)
    if key is not None and edge.any():
        a = alpha[edge, None]
        clean[edge] = np.clip((rgb[edge] - (1.0 - a) * key) / a, 0, 255)
    alpha[alpha >= 48 / 255] = 1.0

    if key is not None and ref not in KEY_IS_A_DRAWN_TONE:
        alpha[flat_key_mask(clean, alpha, key, ref=ref)] = 0.0

    vis = alpha >= 8 / 255
    ys, xs = np.nonzero(vis)
    if not len(xs):
        return None, None, None
    rgba = np.dstack((clean.astype(np.uint8), np.rint(alpha * 255).astype(np.uint8)))
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return rgba[box[1]:box[3], box[0]:box[2]], box, key


# How wide a channel the background flood is allowed to travel down.
#
# THE FLOOD LEAKS INTO THE FIGURE, and it leaks worst on exactly the fighters
# it is hardest to notice on. The candidate mask is "close to the key colour",
# which on a GREY screen also describes the shading on a white robe — so
# wherever a pale costume's shadow reaches the silhouette edge, the fill has a
# continuous path from the background into the middle of the drawing and takes
# it. Kashimo lost 8% of himself that way and Hanami 17%, and the holes sit
# inside the figure where a contact sheet does not show them.
#
# The fix is to say how WIDE the background is, which is the thing that
# actually separates it from the leak: a screen is thousands of pixels across
# and the path into a sleeve is two or three. So the fill runs on an ERODED
# candidate mask, which breaks every hairline bridge, and the result is dilated
# back to recover the pixels the erosion took. Nothing else changes: the fill
# still goes everywhere the background genuinely reaches.
#
# Two iterations, measured over the 250-plate round-25 delivery. It recovers
# 6-21% of the figure on the 14 worst plates, changes 0.0-0.2% on the other
# 216 — the 2px feather and nothing else — and leaves no key colour behind on
# any of them. The cost is that a background filament NARROWER than 4px and
# not otherwise connected would be missed; nothing in 250 plates had one, and a
# gap that thin between two parts of a drawing is a hole the `holes` measure
# reports anyway.
FLOOD_NECK = 2


def flood_background(cand, seed):
    """The background, flooded without squeezing through a hairline gap."""
    core = ndimage.binary_erosion(cand, iterations=FLOOD_NECK, border_value=1)
    wide = ndimage.binary_propagation(seed & core, mask=core)
    return ndimage.binary_dilation(wide, iterations=FLOOD_NECK) & cand


# The generator fills the background with a FLAT colour, so anything still
# sitting on exactly that colour and locally uniform is background the border
# flood fill could not reach — sealed inside the silhouette. Art over the same
# colour carries lineart, shading and texture, which the variance test sees.
def flat_key_mask(rgb, alpha, key, tol=14, max_var=9, min_px=250, ref=None):
    opaque = alpha > 0.5
    dist = np.linalg.norm(rgb - key, axis=2)
    luma = rgb.mean(axis=2)
    local = ndimage.uniform_filter(luma, 5)
    var = ndimage.uniform_filter(luma * luma, 5) - local * local
    cand = opaque & (dist < tol) & (var < max_var)
    lab, n = ndimage.label(cand, structure=np.ones((3, 3), np.int8))
    if not n:
        return np.zeros(opaque.shape, bool)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    keep = np.isin(lab, np.nonzero(counts >= min_px)[0])
    guessed = keep & ~shading_on_pale(keep, lab, luma, opaque)
    return settled(guessed, keep, lab, ref)


# How far out to look for the garment, and how much of it settles the question.
#
# THE KEY COLOUR IS ALSO A SHADING TONE. Round 25's screen is a neutral grey,
# and so is the shadow an artist lays on a WHITE robe — near enough that the
# test above cannot tell them apart by colour, because there is nothing to tell:
# the pixels are 128,128,128 either way, flat, and hundreds wide. It cut 5.7% out
# of Kashimo, 10% out of Hanami and 6.7% out of Gakuganji, always in the middle
# of a pale costume, and every one of those poses came back flagged for alpha.
#
# What separates them is not the region, it is the company it keeps. Sealed
# background is fenced by the drawing — an arm, a wing, a fold of cloth — and
# never by the bright white of the garment it would be sitting in the middle of.
# A shading stroke, by definition, lies ON the thing it shades. So look at the
# ring of art from 3 to 9 pixels out: if a quarter of it is the white of a pale
# costume, the region is a shadow on that costume and stays.
#
# Measured over the whole 250-plate delivery: it declines 250,901px across 35
# plates, led by exactly the poses the workbench sent back, and leaves the
# removals that were doing real work untouched — Toji's 22,064px, Dagon's
# 20,990 and Mei Mei's 15,067 are all still cut, because the art around those
# pockets is skin, wing and hair rather than white cloth.
SHADE_NEAR, SHADE_FAR, SHADE_WHITE, SHADE_SHARE = 3, 9, 195, 0.25

# WHERE THE KEY COLOUR IS A DRAWN TONE ON SOMETHING THAT IS NOT PALE.
#
# The rule above reads the company a region keeps, and the company it reads is
# the white of a pale costume — which is where this collision happens on almost
# every plate. It cannot help on a dark garment: the lit panel down the front of
# Yuji's navy jacket and the body of Gakuganji's guitar are drawn in the screen
# grey too, and the art around them is navy and lacquer rather than white.
#
# Nothing measurable separates those from a real sealed pocket — a pocket under
# Dagon's wing is also a flat field fenced by flat art — so they are named, the
# way GREY_TINT_FIX below is named, and the test is declined for the whole
# plate. Declining is only safe where the plate has no sealed pocket for the
# test to have been catching, so a name goes in only after somebody has looked.
#
# `yuji/throw_back` WAS ON THIS LIST AND SHOULD NOT HAVE BEEN. The region was
# judged from a downscaled overlay and called the lit panel of his jacket; at
# full size it is the gap between his arm and his body, and declining the test
# filled it with screen grey. The workbench sent it straight back. Judge these
# at full size, one region at a time — SEALED_VERDICTS below is the place for
# an answer that only applies to part of a plate.
KEY_IS_A_DRAWN_TONE = {"gakuganji/throw_up"}


# WHERE A HUMAN HAS SETTLED IT, REGION BY REGION.
#
# The rules above are guesses, and on this delivery they have to be: the artist
# shaded in the screen colour, so a shadow on a sleeve and the gap beside it are
# the same pixels — 128,128,128, flat, fenced by the same white cloth. Colour,
# variance, depth, the ink in the fence, elongation, whether an unguarded flood
# would have reached it: none of them separates the two, because the difference
# is not in the image. It is in knowing what a sleeve is.
#
# So a person answers for one region and the answer sticks. A verdict is a point
# in the DELIVERED image's own pixels — stable across re-keys, because the
# delivery is archived and never changes — and it wins over whatever the rules
# would have said:
#
#   "background"  the stage should show through here; cut it
#   "figure"      this is drawn on the fighter; keep it
#   "mixed"       part gap, part shadow. NOT an instruction — one point cannot
#                 answer for two halves of a patch, so the rules are left to
#                 decide and the plate is counted as wanting a hand mask or a
#                 redraw. Recorded so the same patch is not asked about twice.
#
# Anything not named still goes through the rules above.
#
# Round 26's ten flagged plates were judged this way, region by region, at full
# size: 68 of the 76 are drawn on the fighter and 8 are the stage showing
# through. That ratio is the whole story of this delivery — the sealed-pocket
# test was looking for something that is barely there, and no measurement could
# have told which one region in nine it was right about.
# The answers themselves live beside the art rather than in this file, because
# they are DATA a person produced — the verification bench writes them
# (workbench/?edit=verification, "Shadow or gap") and
# `apply_sealed_verdicts.py` files them. Kept here in code, every settled queue
# would be a patch to a Python module.
SEALED_VERDICTS_FILE = os.path.join(os.path.dirname(sprite_paths.MANIFEST),
                                    "sealed_verdicts.json")


def load_verdicts():
    try:
        with open(SEALED_VERDICTS_FILE) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


SEALED_VERDICTS = load_verdicts()


def settled(guessed, regions, lab, ref):
    """`guessed`, overruled wherever a person has answered for a region."""
    verdicts = SEALED_VERDICTS.get(ref or "")
    if not verdicts:
        return guessed
    out = guessed.copy()
    h, w = lab.shape
    for what, points in verdicts.items():
        if what not in ("background", "figure"):
            continue          # "mixed" answers the reviewer, not the keyer
        for x, y in points:
            if not (0 <= int(y) < h and 0 <= int(x) < w):
                continue
            region = lab[int(y), int(x)]
            if not region or not regions[int(y), int(x)]:
                continue
            out[lab == region] = (what == "background")
    return out


def shading_on_pale(mask, lab, luma, opaque):
    """Of the regions in `mask`, the ones sitting inside a pale garment."""
    out = np.zeros(mask.shape, bool)
    for region in np.unique(lab[mask]):
        m = lab == region
        far = (ndimage.binary_dilation(m, iterations=SHADE_FAR)
               & ~ndimage.binary_dilation(m, iterations=SHADE_NEAR) & opaque)
        if far.any() and (luma[far] > SHADE_WHITE).mean() >= SHADE_SHARE:
            out |= m
    return out


# Where a translucent motion trail was drawn OVER a magenta key, the composite
# comes back pink — too blended for the strict test, too vivid to keep. The
# trail cannot be recovered, so the tinted region goes and the sprite is clean.
# NAMED FRAMES ONLY: this would also eat Geto's pink curse and Hanami's
# blossoms, which is why it is not part of the default pass.
def magenta_tint_mask(rgb, alpha, min_px=300):
    opaque = alpha > 0.5
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    cand = opaque & ((np.minimum(r, b) - g) > 40) & (r > 90) & (b > 90)
    lab, n = ndimage.label(cand, structure=np.ones((3, 3), np.int8))
    if not n:
        return np.zeros(opaque.shape, bool)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    return np.isin(lab, np.nonzero(counts >= min_px)[0])


# Frames a reviewer confirmed carry key-coloured motion trails.
TINT_FIX = {
    "gojo/dodge_air", "maki/dodge_air", "toji/dodge_air", "geto/dodge_air",
    # Same trail defect on the remaining nine characters' dodge art. Hanami is
    # deliberately absent: her blossoms are pink, so this test cannot tell her
    # art from the spill, and her trail reads as intentional anyway.
    "inumaki/dodge_air", "inumaki/dodge_roll",
    "jogo/dodge_air", "jogo/dodge_roll",
    "mahito/dodge_roll", "megumi/dodge_roll",
    "nanami/dodge_air", "nanami/dodge_roll",
    "yuta/dodge_air", "yuta/dodge_roll",
}
# The same defect on a GREY key: a translucent trail over mid-grey comes back
# as a neutral smear that no flatness test can catch, because the trail itself
# is shaded. Named frames only — "neutral mid-tone" also describes Toji's
# shirt and half the roster's shading.
# Hakari and Toji's air dodges are the same frame in the same round with the
# same trail behind them, and both came back carrying it: a grey cloud round
# Hakari's back that broke into 399 loose specks, a smaller smear at Toji's
# knee. They were flagged for alpha and left flagged through four rounds of
# work on the sealed-pocket rules, which could never have touched them — a
# trail is not a sealed region and this plate has none.
GREY_TINT_FIX = {"momo/dodge_air", "momo/dodge_roll",
                 "hakari/dodge_air", "toji/dodge_air"}


def grey_tint_mask(rgb, key, alpha, min_px=400):
    opaque = alpha > 0.5
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    luma = rgb.mean(axis=2)
    cand = opaque & ((mx - mn) < 30) & (np.abs(luma - key.mean()) < 55)
    lab, n = ndimage.label(cand, structure=np.ones((3, 3), np.int8))
    if not n:
        return np.zeros(opaque.shape, bool)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    return np.isin(lab, np.nonzero(counts >= min_px)[0])
# Directories the facing rule does not apply to. A fighter is drawn facing RIGHT
# and mirrored by the engine when they turn, so art that arrives facing left is
# flipped on the way in. An **effect** is the opposite case twice over: the
# projectile renderer mirrors a travelling sprite when it flies right, so effects
# are drawn pointing LEFT (see "Directional effects point LEFT" in
# docs/asset-requests.md) — and the ones that are not travelling, like an aura or
# an impact ring, have no facing at all. Running a right-facing detector over
# either turns correct art backwards: round 15 delivered `egg_shot` pointing left
# exactly as asked and the mirror flipped it, which is silent, because a mirrored
# egg still looks like an egg.
NO_MIRROR_DIRS = {"effects", "garnish"}

# Frames the facing detector called wrong, corrected by eye on the intake board.
FACING_OVERRIDE = {
    "panda/r2c0": "right",     # delivered facing right; auto-mirror flipped it
    "toji/dodge_roll": "left",  # delivered facing left, needs the mirror
    # Round 15A: five frames the detector called left with confidence and turned
    # backwards. All five were delivered facing right, and the two light strikes
    # are the reason this list exists — a mirrored punch reads as a perfectly
    # good punch until you notice it lands behind the fighter.
    "dagon/special_side": "right",
    "mechamaru/attack_light_b": "right",
    "mechamaru/attack_up": "right",
    "mechamaru/hurt": "right",
    "yuki/attack_light_b": "right",
    # Round 18: the same frame, the same fighter, the same mistake. Her heavy
    # came back facing right and the detector flipped it, which puts the punch
    # behind her — and a mirrored punch reads as a punch until you notice where
    # it lands. Two of her four strike frames have now needed this entry.
    "yuki/attack_heavy_b": "right",
    # Round 21: Panda for the second time, and for the reason he was here the
    # first time — a bear drawn nearly front-on gives a right-facing detector
    # almost nothing to read. `walk_b` was delivered facing right and came back
    # mirrored, which puts the emblem on the wrong shoulder for one frame out of
    # two, so he flips mid-stride. Corrected at render time today by a
    # `faceLeft` on the frame; this entry is what makes a RE-import land it
    # right, since replacing the art rolls that hand edit back in the same
    # breath.
    "panda/walk_b": "right",
    # Round 22B–22D: three of Yaga's frames, and the pattern is the one every
    # entry above describes — a punch delivered facing RIGHT, called left with
    # confidence, and turned round so it lands behind him. What makes him
    # readable-wrong is the suit: a plain black silhouette with no prop, no
    # hair sweep and no colour asymmetry gives the detector almost nothing but
    # the extended arm, and an extended arm is the one part of a strike that
    # looks the same either way. Kashimo and Naoya, who carry a staff and a
    # hakama respectively, needed no entries at all.
    "yaga/attack_heavy_a": "right",
    "yaga/attack_light_b": "right",
    "yaga/crouch_attack_a": "right",
    # Round 23A–23D: four more, and the same story a third time. Haruta's three
    # strikes and Miwa's jump were all delivered facing RIGHT and all four were
    # called left. Between them they are the two costumes with the least for a
    # right-facing detector to read — Haruta is bare-chested above a plain dark
    # jumpsuit, Miwa is a plain dark suit — and in every one of the four the
    # only strong asymmetry is a sword, which reads the same pointing either
    # way. Kirara and Tengen, who have a cyan bang and a four-eyed head, needed
    # no entries.
    "haruta/attack_air_a": "right",
    "haruta/attack_heavy_a": "right",
    "haruta/attack_heavy_b": "right",
    "miwa/jump_rise": "right",
    # Round 22I/22J: Kirara after all, and on the one frame where her cyan bang
    # cannot help. `attack_down` is a low diving stomp — the head is down at the
    # shoulder line, the hair falls across the face, and both arms are flung out
    # sideways, so the silhouette is nearly symmetrical about a diagonal. She was
    # delivered facing RIGHT, called left, and the mirror put the dive behind
    # her. The lesson the other entries keep teaching, in its usual form: it is
    # the POSE that defeats the detector, not the character, so a fighter who
    # needed no entry for 35 frames can still need one for the 36th.
    "kirara/attack_down": "right",
    # Round 25: three more, and the two `attack_diag_up_b` are the clearest
    # case the list has. A diagonal up-swing puts the weapon overhead and the
    # body under it, so almost the whole silhouette is a vertical column with
    # one arm out of it — and the strongest asymmetry left is whatever hangs
    # down, which points the other way. Mei Mei's braids trail behind her and
    # Nanami's club is above his head; both were delivered facing RIGHT, both
    # were called left with the highest confidence in the round (0.386, 0.229),
    # and both would have landed swinging into the air behind them.
    "meimei/attack_diag_up_b": "right",
    "nanami/attack_diag_up_b": "right",
    # And Momo, for the reason Panda keeps being here: a front-on pose with the
    # arms raised is nearly symmetrical, so the detector reads the one thing
    # that is not — her broom, slung across her back. Her own `idle_a` settles
    # it: hat point sweeping image-left, buckle on the left, bristles at the
    # bottom left. The delivery matches it and the mirror contradicted it.
    "momo/throw_up": "right",
    # Round 25E — NINE in one delivery, and every one of them the same way
    # round. Three families, each defeating the detector for its own reason:
    #
    #   a diagonal up-swing puts the weapon overhead and the body under it, so
    #   what hangs DOWN is the strongest asymmetry left and it points the other
    #   way — Maki's naginata, Kurourushi's scythe, Mahoraga's fused bone sword,
    #   and Yuta's aerial, whose blade drives down-right past a body angled up
    #   and back;
    #
    #   a `throw_up` is a figure square to the camera with both arms overhead,
    #   which is very nearly symmetrical about its own centre line — Gojo,
    #   Hanami and Yuji. Their own idles settle all three: Hanami's shoulder
    #   wrap sits on the image-left arm and stayed there, and Gojo's and Yuji's
    #   heads turn the way their idles turn;
    #
    #   and Jogo's `throw_fwd`, both arms out to screen-right, plus Mahoraga's
    #   `teeter`, which leans the way he faces.
    "maki/attack_diag_up_b": "right",
    "kurourushi/attack_diag_up_b": "right",
    "mahoraga/attack_diag_up_b": "right",
    "mahoraga/teeter": "right",
    "yuta/attack_air_diag_down_b": "right",
    "gojo/throw_up": "right",
    "hanami/throw_up": "right",
    "yuji/throw_up": "right",
    "jogo/throw_fwd": "right",
}


# -------------------------------------------------------------- measuring

def measure(frame, box, src_shape, key=None):
    """Everything worth failing a delivery over."""
    a = frame[:, :, 3]
    rgb = frame[:, :, :3].astype(int)
    opaque = a >= 128
    h, w = a.shape

    holes = ndimage.binary_fill_holes(opaque) & ~opaque
    lab, n = ndimage.label(holes, structure=np.ones((3, 3), np.int8))
    counts = np.bincount(lab.ravel()) if n else np.array([0])
    counts[0] = 0

    # Key colour surviving on the silhouette edge. The check only means anything
    # when the plate was shot on a GREEN screen: on magenta or grey a green rim
    # is just green art, and round 15's mint-green cannon beams tripped it on
    # every pixel of their own outline. `key` is the screen colour that was keyed
    # out, so the test is "is this the screen leaking", not "is this green".
    fringe = 0
    if key is not None and key[1] > 120 and key[1] > key[0] + 25 and key[1] > key[2] + 25:
        inner = ndimage.binary_erosion(opaque, iterations=2)
        rim = opaque & ~inner
        g, r, b = rgb[:, :, 1], rgb[:, :, 0], rgb[:, :, 2]
        fringe = int((rim & (g > r + 18) & (g > b + 18)).sum())

    # clipped only if content reached the DELIVERED canvas edge
    sh, sw = src_shape[:2]
    clipped = [s for s, hit in (("left", box[0] <= 0), ("top", box[1] <= 0),
                                ("right", box[2] >= sw), ("bottom", box[3] >= sh)) if hit]
    return {
        "w": w, "h": h,
        "bodyH": h,
        "lowRes": max(w, h) < MIN_BODY_H,
        "semiTrans": int(((a > 10) & (a < 245)).sum()),
        "holes": int((counts >= 60).sum()),
        "greenFringe": fringe,
        "clipped": clipped,
    }


def coverage(rows, anims):
    """Which fighters a roster-wide pose did NOT arrive for, and who is not one.

    A round asked for "27, one per fighter" twice (20C, 20D) and got 27 files
    both times — with Mahoraga among them and Yuji missing. He is animated out
    of a character sprite set and has a directory here like everybody else, but
    he is a summon and not on `CHARACTER_KEYS`, so the delivery counted right
    and covered the wrong set. Nothing downstream could tell: 27 plates landing
    in 27 named directories is indistinguishable from the right 27 to any tool
    that is not comparing names against the roster. So the names are compared
    here, once, at the front of the pipeline.

    It reports and never fails. A round is allowed to land one fighter at a
    time — that is the stated shape of 20D — so a gap is news, not an error.
    Only a pose delivered for over half the roster is treated as roster-wide;
    below that the delivery is plainly a subset and listing the other 20 names
    would be noise.
    """
    roster = set(anims)
    by_pose = {}
    for r in rows:
        by_pose.setdefault(r["key"], set()).add(r["char"])

    strangers = sorted({r["char"] for r in rows} - roster)
    gaps = []
    for pose, chars in sorted(by_pose.items()):
        if len(chars & roster) * 2 <= len(roster):
            continue
        missing = sorted(roster - chars)
        if missing:
            gaps.append(f"{pose}: {len(chars & roster)}/{len(roster)} fighters, "
                        f"missing {', '.join(missing)}")
    if not strangers and not gaps:
        return
    print("\nROSTER COVERAGE (CHARACTER_KEYS):")
    for line in gaps:
        print("  " + line)
    for name in strangers:
        print(f"  {name}: delivered, but not a fighter — no pose of theirs is "
              f"part of a roster-wide round")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars")
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    anims = anim_map_all()
    man = json.load(open(os.path.join(SPRITES, "manifest.json")))
    chars = ([c.strip() for c in args.chars.split(",")] if args.chars
             else sorted(d for d in os.listdir(INTAKE)
                         if os.path.isdir(os.path.join(INTAKE, d)) and not d.startswith("_")))

    rows, flagged = [], []
    for char in chars:
        d = os.path.join(INTAKE, char)
        for name in sorted(os.listdir(d)):
            if not name.endswith(".png"):
                continue
            key_name = name[:-4]
            src = os.path.join(d, name)
            raw = np.asarray(Image.open(src).convert("RGBA"))
            frame, box, key = key_and_trim(src, f"{char}/{key_name}")
            if frame is None:
                flagged.append(f"{char}/{key_name}: EMPTY after keying")
                continue

            # Facing is decided by eye, not by the detector. It runs at ~83% on
            # known-good data and returned near-zero confidence on two thirds of
            # this delivery; auto-mirroring on a coin flip would hand back art
            # that is wrong in a way the reviewer has to undo. Only clearly
            # confident calls are acted on; everything else ships as delivered
            # and is marked on the board for a human to rule on.
            ref = f"{char}/{key_name}"
            if ref in GREY_TINT_FIX and key is not None:
                a = frame[:, :, 3] / 255.0
                frame[grey_tint_mask(frame[:, :, :3].astype(float), key, a)] = 0
                ys2, xs2 = np.nonzero(frame[:, :, 3] >= 20)
                frame = frame[ys2.min():ys2.max() + 1, xs2.min():xs2.max() + 1]
            if ref in TINT_FIX:
                a = frame[:, :, 3] / 255.0
                frame[magenta_tint_mask(frame[:, :, :3].astype(float), a)] = 0
                ys2, xs2 = np.nonzero(frame[:, :, 3] >= 20)
                frame = frame[ys2.min():ys2.max() + 1, xs2.min():xs2.max() + 1]

            facing, conf = sf.detect_facing(frame)
            if ref in FACING_OVERRIDE:          # ruled on by eye, beats the detector
                facing, conf = FACING_OVERRIDE[ref], 1.0
            mirrored = False
            if char in NO_MIRROR_DIRS:
                facing, conf = "n/a", 1.0
            elif facing == "left" and conf >= FACING_CONFIDENT:
                frame = np.asarray(ImageOps.mirror(Image.fromarray(frame)))
                mirrored = True
            unsure = conf < FACING_CONFIDENT

            m = measure(frame, box, raw.shape, key)
            m.update(char=char, key=key_name, mirrored=mirrored, facingUnsure=bool(unsure),
                     facingGuess=facing, facingConf=round(float(conf), 3),
                     states=key_to_states(anims, char, key_name))
            rows.append(m)

            notes = []
            if m["lowRes"]:
                notes.append(f"LOW-RES body {m['h']}px")
            if m["clipped"]:
                notes.append("CLIPPED " + "+".join(m["clipped"]))
            if m["greenFringe"] > 200:
                notes.append(f"green fringe {m['greenFringe']}px")
            if m["holes"]:
                notes.append(f"{m['holes']} hole(s)")
            if notes:
                flagged.append(f"{char}/{key_name}: " + ", ".join(notes))

            if not args.report:
                out = os.path.join(PROCESSED, char)
                os.makedirs(out, exist_ok=True)
                Image.fromarray(frame).save(os.path.join(out, name))

    mir = sum(1 for r in rows if r["mirrored"])
    print(f"{len(rows)} frame(s) processed, {mir} mirrored to face right")
    coverage(rows, anims)
    if flagged:
        print("\nFLAGGED:")
        for f in flagged:
            print("  " + f)
    else:
        print("no quality flags")
    if not args.report:
        # Merge rather than replace: a `--chars momo` run must not wipe the
        # other 16 characters' rows, which is what made the report claim the
        # whole delivery was six frames.
        path = os.path.join(PROCESSED, "report.json")
        merged = {}
        if os.path.exists(path):
            for r in json.load(open(path)):
                merged[(r["char"], r["key"])] = r
        for r in rows:
            merged[(r["char"], r["key"])] = r
        json.dump(sorted(merged.values(), key=lambda r: (r["char"], r["key"])),
                  open(path, "w"), indent=1)
        print(f"\nprocessed art -> {PROCESSED}")


if __name__ == "__main__":
    main()
