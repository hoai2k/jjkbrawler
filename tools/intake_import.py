#!/usr/bin/env python3
"""Import approved intake art into the game.

Copies from `assets/intake/_processed/` into `sprites/assets/`, computes the
placement metadata the renderer needs, and registers it in `manifest.json`.
Only frames named in an approval file move; everything else stays in intake.

Nothing an import lands is in the game until somebody approves it, and that
holds whether the delivery replaces a pose or adds one. A pose the manifest has
never carried is still being DRAWN — by its animation's `fallback` — so adding
it changes what a player sees exactly as overwriting one does. See
hold_for_approval().

Placement follows the same model as the rest of the pipeline: `ox`/`oy` place
the art inside the logical cell, `bodyBottom` is the foot line. New art is
scaled so its body height matches what it replaces, so a swap does not
silently resize the fighter — a replacement is a change of ART, never of size.

How much of the replaced frame's own settings carries over depends on WHY it
was flagged (KIND_PLACEMENT in sprites/src/sprites.js). A redraw and a crop fix
are not the same event:

  quality, pose,
  character      -> discard. A different drawing; nothing about the old
                    placement means anything, and the hand tuning existed to
                    compensate for the very art being replaced. Rebuilt from
                    scratch.
  crop, bleed    -> reframe. The same drawing with different bounds. The body
                    keeps its tuned rendered size and foot line, and the anchors
                    are carried across by the change in framing — an anchor is
                    stored in image-local pixels, and this maps it through the
                    frame's cell-space placement, which the content's own bbox
                    defines, so a point on the navel stays on the navel.
  alpha          -> keep. The same drawing at the same bounds, so every
                    measurement and anchor is still valid and survives intact.

An unflagged frame is treated as a wholesale replacement, which is the safe
reading: nothing said the art was merely being touched up.

The flags themselves are cleared either way — flagging a sprite and importing
its successor are the two ends of one pipeline.

Every import that lands on top of EXISTING art also leaves a `replaced` marker
on the pose, recording when the art changed and what hand work did not survive.
That marker is what the workbench's "All Recently Updated Poses" list is built
from: after a round, the poses whose art moved under previous work are scattered
across the roster, and finding them by hand means opening every character.

With ONE exception, which is unmoved(): a re-key that carried its placement
exactly and changed no scale or foot line has not moved the sprite, so there is
nothing on that list to do about it. The list is for placing and scaling. Whether
the new matte is an improvement is a different question and the verification
bench is where it is asked.

  --approve FILE   JSON: {"char": ["frame", ...]} or {"char": {"frame": {...}}},
                   where a frame's block may carry {"as": "alpha"} to say why
                   the art is being replaced when no flag on the pose does
  --dry-run        report only

Usage:
  python3 intake_import.py --approve approvals.json --dry-run
  python3 intake_import.py --approve approvals.json
"""

import argparse
import datetime as dt
import json
import os
import subprocess
import shutil

import numpy as np
from PIL import Image

import intake
from extract_sprites import generated_frame_meta, ALPHA_THRESHOLD
from list_replacements import placement_rule, variant_banked

CELL_W = CELL_H = 313.5

# kind -> what survives, parsed from sprites/src/sprites.js so there is one source of
# truth for the rule rather than a copy here that can drift.
PLACEMENT = placement_rule()
# What a variant option carries, parsed from sprites/src/sprites.js so a held-back
# replacement banks exactly what a chosen one does.
VARIANT_BANKED = variant_banked()
SPRITES = intake.SPRITES
MANIFEST = os.path.join(SPRITES, "manifest.json")


def body_metrics(frame):
    """Content box and the lowest opaque row — the natural foot line."""
    a = frame[:, :, 3]
    ys, xs = np.nonzero(a >= 128)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def survives(stored):
    """"keep" | "reframe" | "discard" for the frame being written over.

    Reads BOTH flags. The improvement kinds — alpha, crop, bleed — are the ones
    that say the drawing is fine and only the file is wrong, so they are exactly
    the cases where the placement should be carried across; reading only
    `needsReplacement` would have re-measured a re-keyed sprite from scratch and
    thrown away tuning that was still correct.
    """
    if not stored:
        return "discard"
    flag = stored.get("needsReplacement") or stored.get("wantsImprovement")
    if not flag:
        return "discard"
    # The bare `true` and the retired "replace" kind both mean "redraw it".
    kind = "quality" if flag is True or flag == "replace" else str(flag)
    return PLACEMENT.get(kind, "discard")


def now_stamp():
    """One timestamp per import run, so a round sorts as a round."""
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def lost_work(stored, keeps):
    """The hand work this import does NOT carry over, as field names.

    `edited` is the record of hand tuning — apply_sprite_adjustments.py writes
    each hand-set field's pre-edit value there — so its keys are exactly the
    numbers someone chose by eye. A touch-up keeps all of it; a redraw rolls it
    back, along with the anchors, because both were placed against art that is
    now gone.
    """
    if not stored or keeps in ("keep", "reframe"):
        return []
    lost = sorted(stored.get("edited") or {})
    if stored.get("anchors"):
        lost.append("anchors")
    return lost


def replaced_note(stored, keeps, at, how="import"):
    """The marker saying new art landed on top of an existing pose.

    The workbench builds "All Recently Updated Poses" from these, across every
    character at once: the poses a round overwrote are the ones whose tuning has
    to be looked at again, and they are scattered through the roster by
    definition. `lost` is what has to be redone, so the list can lead with them;
    an empty `lost` is a touch-up that came back with its tuning intact.

    A brand-new pose gets one too, as `how: "new"`. Nothing was overwritten, so
    `lost` is empty and it sorts below the poses with tuning to redo — but it
    still has to be PLACED, and a round that adds fifteen poses to one fighter
    and seventeen to another scatters that work exactly the way an overwrite
    does. Leaving it off meant the only way to find a round's new poses was to
    know which characters it touched and open each one, which is the thing this
    list exists to abolish. It also keeps the flag lifecycle uniform: every
    pose an intake round touched shows up in one place.

    Like the replacement flags, this clears itself rather than accumulating:
    apply_sprite_adjustments.py drops it when the pose is adjusted again, or
    when the workbench marks it reviewed as it stands.
    """
    if not stored:
        return {"at": at, "kept": "new", "how": "new", "lost": []}
    return {"at": at, "kept": keeps, "how": how, "lost": lost_work(stored, keeps)}


# What placing a sprite means, as field names: where it sits, how big it is
# drawn, and where its feet are. A re-key that changes none of them has not
# moved the sprite, whatever it did to the matte.
PLACEMENT_FIELDS = ("renderScale", "bodyBottom", "bodyH")


def unmoved(stored, meta, exact):
    """True when this import changes the matte and nothing a person would place.

    The placement carry has to have been EXACT — by the trim box, on both sides —
    because the fallback rule lines the new silhouette's centre and bottom up
    with the old one's, and a re-key changes the silhouette, so "the numbers came
    out the same" means nothing there. With an exact carry the drawing is at the
    same size in the same spot by construction, and `ox`/`oy` differing is how
    that was achieved rather than evidence against it.
    """
    if not stored or not exact:
        return False
    return all(stored.get(f) == meta.get(f) for f in PLACEMENT_FIELDS)


def carry_anchors(stored, old_meta, new_meta):
    """The old anchors expressed in the NEW frame's pixels.

    An anchor is stored image-local, from the frame's top-left corner, so it
    moves when the framing does. What does NOT move is where the point sits in
    CELL space: `generated_frame_meta` centres every frame's content box at
    CELL_W/2 and puts its bottom on the foot line, so two crops of the same
    drawing place that drawing identically. Going out to cell space and back
    therefore shifts each anchor by exactly the change in framing.
    """
    anchors = stored.get("anchors") or {}
    if not anchors:
        return None, []
    dx = old_meta.get("ox", 0) - new_meta.get("ox", 0)
    dy = old_meta.get("oy", 0) - new_meta.get("oy", 0)
    out, moved = {}, []
    for name, point in anchors.items():
        if not (isinstance(point, list) and len(point) == 2):
            continue
        out[name] = [round(point[0] + dx, 1), round(point[1] + dy, 1)]
        moved.append(f"{name} by ({dx:+.1f}, {dy:+.1f})")
    return (out or None), moved


def import_meta(stored, old_frame, new_frame, idle_meta=None, at=None):
    """The manifest entry for `new_frame` replacing `stored`.

    One function so the rule has one implementation: main() imports through it
    and tools/test_intake_placement.py checks it, rather than each assembling
    the steps in its own order.

    Returns `(meta, keeps, carried)` — the entry, which of keep/reframe/discard
    applied, and a human list of what was carried over.
    """
    keeps = survives(stored)
    touch_up = keeps in ("keep", "reframe")
    # A touch-up keeps the tuning; a redraw rolls it back, because the tuning
    # existed to compensate for the art being replaced.
    old = stored if touch_up else pristine(stored)
    meta = place(new_frame, old, idle_meta, keep_scale=touch_up)

    carried = []
    if touch_up and stored:
        if old_frame is not None:
            meta = reframe_placement(meta, stored, old_frame, new_frame)
            carried.append("placement")
        anchors, moved = carry_anchors(stored, stored, meta)
        if anchors:
            meta["anchors"] = anchors
            carried.append("anchors" + (" (" + "; ".join(moved) + ")" if keeps == "reframe" else ""))
        if stored.get("edited"):
            meta["edited"] = stored["edited"]
            carried.append("hand tuning")
        if stored.get("faceLeft") is not None:
            meta["faceLeft"] = stored["faceLeft"]
            carried.append("mirror")
    note = replaced_note(stored, keeps, at or now_stamp())
    if note:
        meta["replaced"] = note
    return meta, keeps, carried


def pristine(old):
    """`old` with hand edits rolled back to the values the pipeline generated.

    `edited` (written by apply_sprite_adjustments.py) maps each hand-tuned field
    to what it held beforehand. A nudge made because a sprite sat too far left
    should not be inherited by the sprite that fixes it.
    """
    if not old:
        return old
    base = dict(old)
    for field, value in (old.get("edited") or {}).items():
        if value is None:
            base.pop(field, None)
        else:
            base[field] = value
    return base


def place(frame, old_meta, idle_meta, keep_scale=False):
    """Metadata for `frame` standing where `old_meta` stood.

    Replacing a frame keeps the old one's rendered HEIGHT and foot line, so a
    swap changes the ART and never the fighter's size — the thing the workbench
    tuning depends on.

    A frame with no predecessor (dodge_roll, dodge_air) instead borrows the
    character's IDLE scale factor. Matching heights would be wrong there: a
    roll is a wide, low pose, and forcing it to a standing frame's height would
    inflate it across the screen. All the delivered art is drawn at comparable
    resolution, so one scale factor keeps proportions honest across poses.

    `keep_scale` is for a touch-up rather than a redraw, where the drawing is
    the same and only its bounds moved. There, matching rendered HEIGHTS would
    be wrong: trimming a colour bleed makes the content box smaller, and
    stretching the result back to the old height would quietly enlarge the
    fighter. Holding `renderScale` instead keeps every pixel of the drawing at
    the size it already had, which is what "same art, reframed" means — and it
    is what makes the carried anchors land on the same piece of artwork.
    """
    h, w = frame.shape[:2]
    if old_meta:
        old_h = old_meta["h"] * (old_meta.get("renderScale") or 1)
        render_scale = old_h / h
        body_bottom = old_meta.get("bodyBottom", CELL_H * 0.66)
    else:
        render_scale = (idle_meta.get("renderScale") or 1) if idle_meta else 0.25
        body_bottom = CELL_H * 0.99

    # Delegate the actual placement maths to the pipeline's own routine. Hand-
    # rolling it here produced `ox`/`oy` scaled by renderScale, which the
    # renderer does NOT expect — the frames came out anchored far below the
    # floor. One implementation, one convention.
    meta = generated_frame_meta(frame, {"bodyBottom": round(float(body_bottom), 1),
                                        "bodyH": round(h * render_scale, 1)})
    if keep_scale and old_meta and old_meta.get("renderScale"):
        # ox/oy come from the content box alone, so overriding the scale after
        # the fact cannot invalidate the placement.
        rs = old_meta["renderScale"]
        _, by0, _, by1 = content_box(frame)
        meta["renderScale"] = rs
        meta["bodyH"] = round((by1 - by0) * rs, 1)
    return meta


SAME_DRAWING = 0.5
# How far the vote step reduces both frames before it looks for the offset.
COARSE = 4


def same_drawing(old_frame, new_frame):
    """How much of two frames is the same PIXELS, at their best alignment.

    A re-key changes alpha and a re-crop changes bounds; neither repaints the
    figure, so the two frames carry identical colour wherever both are solid.
    A different delivery of the same pose does not — the artist drew it again.

    Aligned by voting rather than by the bounding box: the bounds are exactly
    what a re-key moves. Sample pixels of the smaller frame each vote for every
    offset that would explain them, and the winner is checked in full.

    The vote runs on both frames reduced by COARSE, which is what makes this
    affordable: at full size it is dozens of passes over a megapixel per pose,
    and a 255-pose batch spent the better part of an hour in here. The offset is
    then refined at full size over the coarse cell it landed in, so the answer
    is the same one.
    """
    a, b = old_frame, new_frame
    big, small = (a, b) if a.shape[0] * a.shape[1] > b.shape[0] * b.shape[1] else (b, a)
    H, W = big.shape[:2]
    h, w = small.shape[:2]
    if h > H or w > W:
        return 0.0
    rgb = small[:, :, :3].astype(np.int16)
    solid = small[:, :, 3] == 255
    ys, xs = np.nonzero(solid)
    if len(ys) < 200:
        return 0.0

    cs, cb = small[::COARSE, ::COARSE], big[::COARSE, ::COARSE]
    ch, cw = cs.shape[:2]
    cH, cW = cb.shape[:2]
    crgb = cs[:, :, :3].astype(np.int16)
    cys, cxs = np.nonzero(cs[:, :, 3] == 255)
    if not len(cys):
        return 0.0
    take = np.linspace(0, len(cys) - 1, 32).astype(int)
    sy, sx = cys[take], cxs[take]
    ny, nx = cH - ch + 1, cW - cw + 1
    votes = np.zeros((ny, nx), np.int32)
    cfield = cb[:, :, :3].astype(np.int16)
    for k in range(len(take)):
        hit = np.abs(cfield - crgb[sy[k], sx[k]]).max(axis=2) <= 2
        votes += hit[sy[k]:sy[k] + ny, sx[k]:sx[k] + nx]
    gy, gx = np.unravel_index(int(np.argmax(votes)), votes.shape)

    probe_y, probe_x = ys[::37], xs[::37]
    want = rgb[probe_y, probe_x]
    best = (-1.0, 0, 0)
    for dy in range(max(0, gy * COARSE - COARSE), min(H - h, gy * COARSE + COARSE) + 1):
        for dx in range(max(0, gx * COARSE - COARSE), min(W - w, gx * COARSE + COARSE) + 1):
            got = big[dy + probe_y, dx + probe_x, :3].astype(np.int16)
            score = float((np.abs(got - want).max(axis=1) <= 2).mean())
            if score > best[0]:
                best = (score, dy, dx)
    _, dy, dx = best
    field = big[:, :, :3].astype(np.int16)
    both = solid & (big[dy:dy + h, dx:dx + w, 3] == 255)
    if both.sum() < 1000:
        return 0.0
    d = np.abs(field[dy:dy + h, dx:dx + w] - rgb).max(axis=2)
    return float((d[both] <= 2).mean())


def content_box(frame):
    """The opaque bounding box, at the SAME threshold generated_frame_meta uses.

    Measuring it any other way puts this a pixel or two out of step with the
    placement it is supposed to be reasoning about.
    """
    a = frame[:, :, 3]
    ys, xs = np.nonzero(a >= ALPHA_THRESHOLD)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def boxes_from_report():
    """Each processed frame's trim box in its delivered plate, and its facing.

    `intake.py` writes both because only that half ever sees the source; this
    half only ever sees the trimmed PNG, and the box is what makes a re-key
    free. The facing comes with it because a mirrored frame's image x runs the
    other way down the plate and carries by the other edge.

    Cached: the report is one file for the whole round.
    """
    if boxes_from_report.cache is None:
        out = {}
        path = os.path.join(intake.PROCESSED, "report.json")
        if os.path.exists(path):
            for row in json.load(open(path)):
                if row.get("box"):
                    out[(row["char"], row["key"])] = ([int(v) for v in row["box"]],
                                                      bool(row.get("mirrored")))
        boxes_from_report.cache = out
    return boxes_from_report.cache


boxes_from_report.cache = None


def reframe_placement(meta, old_meta, old_frame, new_frame, boxes=None, flips=None):
    """Re-point `meta`'s ox/oy so the DRAWING lands exactly where it did.

    `generated_frame_meta` places a frame from scratch: content box centred in
    the cell, lowest pixel on the foot line. That is right for new art and wrong
    for a touch-up, because it silently discards two things the old frame was
    carrying — a hand-tuned ground contact (which deliberately puts the lowest
    pixel off the standing plane, for a pose drawn in perspective) and a
    hand-tuned horizontal offset.

    So for a touch-up the placement is derived from the ART instead: whatever
    the re-crop moved the content box by, `ox`/`oy` move back by. The drawing
    keeps its exact position, tuning and all, and the anchors carried alongside
    stay on it.
    """
    out = dict(meta)
    # BY THE TRIM BOX, WHEN BOTH SIDES KNOW IT — which is exact.
    #
    # `ox`/`oy` place the trimmed image in the cell, and the art is drawn at
    # ((ox - CELL_W/2) + imgX) * renderScale, so a source pixel lands where it
    # did if and only if `ox` moves by the change in the trim box's left edge.
    # The rule below cannot know that: it lines the new silhouette's CENTRE and
    # BOTTOM up with the old one's, which is right for a re-crop of an unchanged
    # drawing and wrong for a re-key, because a re-key changes the silhouette.
    # Cut a gap out of one side and the centre moves; recover a shadow at the
    # feet and the bottom moves. That is the manual re-placement a re-key used
    # to cost — up to 111px on Gojo's fall.
    #
    # Both boxes are in the delivered plate's own pixels, so this holds however
    # much the matte changed, and it holds for a re-crop too.
    # A MIRRORED FRAME CARRIES BY THE OTHER EDGE. The saved image is the plate
    # flipped, so its pixel i is the plate's box[2]-1-i, and holding that pixel
    # still means ox moves by MINUS the change in the box's right edge. If the
    # two deliveries disagree about which way the frame faces there is no shift
    # that holds the drawing still at all, so the rule stands aside and the
    # silhouette rule below does what it can.
    was_flipped, now_flipped = flips or (False, False)
    if boxes and boxes[0] and boxes[1] and bool(was_flipped) == bool(now_flipped):
        dx = (boxes[0][2] - boxes[1][2]) if now_flipped else (boxes[1][0] - boxes[0][0])
        out["ox"] = round(old_meta.get("ox", 0) + dx, 1)
        out["oy"] = round(old_meta.get("oy", 0) + (boxes[1][1] - boxes[0][1]))
        if "centroidX" in meta:
            out["centroidX"] = round(meta["centroidX"] + (out["ox"] - meta["ox"]), 1)
        return out

    ox0, oy0, ox1, oy1 = content_box(old_frame)
    nx0, ny0, nx1, ny1 = content_box(new_frame)
    old_cx = (ox0 + ox1) / 2
    new_cx = (nx0 + nx1) / 2
    out["ox"] = round(old_meta.get("ox", 0) + (old_cx - new_cx), 1)
    out["oy"] = round(old_meta.get("oy", 0) + (oy1 - ny1))
    # centroidX is stored in the same cell space, so it moves with ox.
    if "centroidX" in meta:
        out["centroidX"] = round(meta["centroidX"] + (out["ox"] - meta["ox"]), 1)
    return out


PENDING_DIR = "incoming"

# Fields of the pose that describe the DRAWING in play, banked so the game can
# go on reading them while a replacement waits. Same list the variant options
# use, since it answers the same question: what belongs to an image.
LIVE_FIELDS = VARIANT_BANKED + ["file", "oy"]


def pose_files(man, char, key):
    """Every file this pose already points at: its own, the drawing the game is
    showing if one is held back, and every drawing banked on its variants."""
    used = set()
    meta = man.get("characters", {}).get(char, {}).get(key) or {}
    if meta.get("file"):
        used.add(meta["file"])
    live = (meta.get("awaitingApproval") or {}).get("live") or {}
    if live.get("file"):
        used.add(live["file"])
    entry = man.get("variants", {}).get(char, {}).get(key) or {}
    for opt in entry.get("options", []):
        if opt.get("file"):
            used.add(opt["file"])
    return used


def free_pending_path(man, char, key):
    """A pending path for this pose that collides with nothing it already has.

    `incoming/<key>.png` was a fixed name, on the assumption that a pose has at
    most one replacement waiting. It does — but the file OUTLIVES the wait: an
    approved drawing keeps living at the path it was delivered to, because
    approving is a change of pointer, not a move. So the second delivery for a
    pose whose first was approved copied straight over the drawing that was in
    the game, leaving `awaitingApproval.live` naming a path that no longer held
    the live art, and both sides of the comparison showing the same picture.
    Rejecting would then have "restored" the new drawing.

    So the name is chosen against what the pose actually references, not against
    what is on disk: an orphaned file left by an earlier round is fine to reuse,
    a file some option still names is not.
    """
    used = pose_files(man, char, key)
    for n in range(1, 100):
        rel = f"{char}/{PENDING_DIR}/{key}.png" if n == 1 \
            else f"{char}/{PENDING_DIR}/{key}-{n}.png"
        if rel not in used:
            return rel
    raise RuntimeError(f"{char}/{key}: 99 pending drawings, something is wrong")


def hold_for_approval(man, char, key, src, meta, stored, at, keeps="discard"):
    """Land a replacement without letting it into the game yet.

    Two pointers on one pose, and they mean different things:

      the pose's own fields   the NEW drawing. This is what the sprite workbench
                              edits, because placing it is the work the approval
                              is waiting on.
      `awaitingApproval.live` the drawing the GAME goes on showing until someone
                              approves, with the whole placement it had.

    Before this, an intake round changed what every player saw the moment it
    ran, and the only way to find out whether a redraw was better was to ship it
    and look. The roster is finished now, so the default has to be the other way
    round: a delivery is a proposal until it has been stood beside the thing it
    replaces. Approving is one button in the workbench, and it exports and
    applies like every other change.

    A brand-new pose comes through here too, and `live` is None for it. There
    IS something to compare it against and something to break: an animation
    whose art has not landed plays its `fallback` (sprites.js presentFrames),
    so what a player sees for a pose nobody has drawn is another drawing — the
    walk cycle is the run replayed slowly, the teeter is the idle. Landing the
    new pose changes that the instant the manifest names it, which is the one
    thing the confirm step exists to prevent. "New" describes the manifest, not
    the screen.

    `live: None` is how that is said: the game draws NOTHING for this pose key
    while the hold stands, so its states go on resolving to the fallback they
    resolve to today. `frameMeta` in src/assets.js is where that is enforced,
    and it is the same one line for both cases — a hold with a live drawing
    shows it, a hold without one is invisible.
    """
    # The drawing the GAME is showing, which is not always the pose's own
    # fields. On a pose that is ALREADY awaiting approval those fields describe
    # the drawing still waiting, and the game is drawing whatever
    # `awaitingApproval.live` names. Reading `stored` flat would have promoted
    # an unapproved drawing into the game the moment a second delivery landed
    # on the same pose — the one thing the approval step exists to prevent.
    waiting = (stored or {}).get("awaitingApproval") or {}
    if waiting.get("live"):
        live = dict(waiting["live"])
    elif stored:
        live = {f: stored[f] for f in LIVE_FIELDS if f in stored}
    else:
        # Nothing of this pose's own is in the game, because the pose is not in
        # the game: its states are drawing their fallback. There is no block to
        # bank, and None is what tells the renderer to leave it that way.
        live = None
    rel = free_pending_path(man, char, key)
    os.makedirs(os.path.join(SPRITES, char, PENDING_DIR), exist_ok=True)
    shutil.copy2(src, os.path.join(SPRITES, rel))

    meta = dict(meta)
    meta["file"] = rel
    # Carried rather than re-derived: an approval that has already happened once
    # must not be undone by a second delivery landing on the same pose.
    meta["awaitingApproval"] = {"at": at, "live": live}
    # `keeps`, not a flat "discard". The pipeline decides per delivery whether
    # the hand tuning carries — an alpha re-cut keeps it, a redraw rolls it back
    # (KIND_PLACEMENT) — and the meta being held already reflects that decision.
    # Stamping every hold as though nothing carried made the workbench count
    # thirty-two re-keys as "to re-tune" when their tuning was sitting on them
    # untouched, and put them at the head of a list ordered by how much work
    # each one needs.
    meta["replaced"] = {"at": at, "kept": "await", "how": "await",
                        "lost": lost_work(stored, keeps)}
    man["characters"].setdefault(char, {})[key] = meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--approve", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--replace-now", action="store_true",
                    help="skip the approval step and overwrite the art in the "
                         "game immediately, the way imports worked before it")
    args = ap.parse_args()

    approvals = json.load(open(args.approve))
    man = json.load(open(MANIFEST))
    native_left = man.setdefault("nativeLeft", {})
    # One stamp for the whole run: everything imported together is one round,
    # and the workbench's updated list sorts by it.
    at = now_stamp()

    done, skipped = [], []
    for char, frames in approvals.items():
        keys = frames if isinstance(frames, list) else list(frames)
        # WHY THE ART IS BEING REPLACED, when the manifest cannot say.
        #
        # `survives()` reads the pose's own flag, which is the record of somebody
        # asking for a fix — and that covers a delivery answering a request. It
        # does not cover a re-run WE started: re-keying a plate because its
        # shadow-or-gap verdicts are now settled touches art nobody flagged, and
        # an unflagged pose reads as a wholesale replacement, so the placement
        # would be rebuilt from scratch and every one of them would need placing
        # by hand again. The approval file can say it instead:
        #
        #   {"gojo": {"fall": {"as": "alpha"}}}
        #
        # Same vocabulary as the flags (KIND_PLACEMENT), same meaning, and it
        # only ever applies to a pose the manifest is silent about — a real flag
        # is what somebody asked for and wins.
        stated = frames if isinstance(frames, dict) else {}
        for key in keys:
            src = os.path.join(intake.PROCESSED, char, f"{key}.png")
            if not os.path.exists(src):
                skipped.append(f"{char}/{key}: not in _processed")
                continue
            frame = np.asarray(Image.open(src).convert("RGBA"))
            new_box, new_flip = boxes_from_report().get((char, key), (None, False))
            stored = man["characters"].get(char, {}).get(key)
            keeps = survives(stored)
            asked = (stated.get(key) or {}).get("as") if isinstance(stated.get(key), dict) else None
            if asked and stored and not (stored.get("needsReplacement")
                                         or stored.get("wantsImprovement")):
                if asked not in PLACEMENT:
                    skipped.append(f"{char}/{key}: unknown kind {asked!r}")
                    continue
                keeps = PLACEMENT[asked]
            # A touch-up keeps the tuning; a redraw rolls it back, because the
            # tuning existed to compensate for the art being replaced.
            old = stored if keeps in ("keep", "reframe") else pristine(stored)
            idle = man["characters"].get(char, {}).get("idle_a")
            meta = place(frame, old, idle, keep_scale=keeps in ("keep", "reframe"))
            meta["file"] = f"{char}/{key}.png"
            if new_box:
                meta["srcBox"] = list(new_box)
                meta["srcFlip"] = new_flip

            # A TOUCH-UP THAT IS NOT THE SAME DRAWING IS NOT A TOUCH-UP.
            #
            # The plate a pose was keyed from is not recorded anywhere, so a
            # batch re-key has to feed each pose its NEWEST archived plate —
            # and for eleven of 255 that was a different delivery of the same
            # pose, not the one the art in the game came from. `gojo/fall` came
            # back 886x1467 where the art in the game is 644x1016: a redraw,
            # landing as an alpha fix, with the placement carried across from a
            # drawing it has nothing to do with.
            #
            # So the claim is checked rather than believed. A keep or a reframe
            # says the DRAWING is unchanged and only its alpha or its framing
            # moved, and that is a statement about pixels: the two frames must
            # agree where both are opaque. They do, decisively — a real re-key
            # scores 100%, and the eleven scored 3-7%.
            if keeps in ("keep", "reframe") and stored:
                old_path = os.path.join(SPRITES, stored.get("file", f"{char}/{key}.png"))
                if os.path.exists(old_path):
                    agree = same_drawing(np.asarray(Image.open(old_path).convert("RGBA")),
                                         frame)
                    if agree < SAME_DRAWING:
                        skipped.append(
                            f"{char}/{key}: agrees with the art in the game on "
                            f"{agree * 100:.0f}% of its pixels — this plate is a "
                            "different drawing, not a touch-up of what is in the game")
                        continue

            carried = []
            exact = False
            if keeps in ("keep", "reframe") and stored:
                # The art being replaced is still on disk until the copy below,
                # which is what lets the new placement be derived from how far
                # the re-crop moved the drawing.
                old_path = os.path.join(SPRITES, stored.get("file", f"{char}/{key}.png"))
                if os.path.exists(old_path):
                    old_frame = np.asarray(Image.open(old_path).convert("RGBA"))
                    exact = bool(stored.get("srcBox")) and bool(new_box) \
                        and bool(stored.get("srcFlip")) == new_flip
                    meta = reframe_placement(
                        meta, stored, old_frame, frame,
                        boxes=(stored.get("srcBox"), new_box),
                        flips=(bool(stored.get("srcFlip")), new_flip))
                    carried.append("placement" + (" (exact)" if exact else ""))
                else:
                    skipped.append(f"{char}/{key}: previous art missing, cannot reframe")
                anchors, moved = carry_anchors(stored, old, meta)
                if anchors:
                    meta["anchors"] = anchors
                    carried.append("anchors" + (" (" + "; ".join(moved) + ")" if keeps == "reframe" else ""))
                if stored.get("edited"):
                    meta["edited"] = stored["edited"]
                    carried.append("hand tuning")
                if stored.get("faceLeft") is not None:
                    meta["faceLeft"] = stored["faceLeft"]
                    carried.append("mirror")

            note = replaced_note(stored, keeps, at)
            # AN ALPHA FIX THAT MOVES NOTHING IS NOT PLACEMENT WORK.
            #
            # The updated list exists so a round's placing and scaling can be
            # found in one place, and a re-key that lands the drawing at the
            # same size in the same spot asks for none of it: `srcBox` carried
            # the placement to the pixel, the scale and the foot line are the
            # numbers that were already there, and what changed is the matte.
            # Putting those on the list buried the poses that DID need placing
            # under a few hundred that did not. Approving the alpha is a
            # different question, and the verification bench is where it is
            # asked.
            if note and unmoved(stored, meta, exact):
                note = None
                carried.append("unmoved, so not on the updated list")
            if note:
                meta["replaced"] = note

            # Every delivery lands BESIDE what the game is drawing and waits to
            # be approved — a replacement beside the drawing it replaces, a
            # brand-new pose beside the fallback its states are playing. See
            # hold_for_approval() for why the second is not the exception it
            # looks like.
            holding = not args.replace_now
            if holding:
                if not args.dry_run:
                    hold_for_approval(man, char, key, src, meta, stored, at, keeps)
                done.append(f"{char}/{key}: {meta['w']}x{meta['h']} "
                            f"renderScale={meta['renderScale']}  [awaiting approval]"
                            + ("  -> updated list, game still draws the old art"
                               if stored else
                               "  -> updated list, NEW pose, game still draws "
                               "the fallback"))
                continue

            if not args.dry_run:
                os.makedirs(os.path.join(SPRITES, char), exist_ok=True)
                shutil.copy2(src, os.path.join(SPRITES, char, f"{key}.png"))
                man["characters"].setdefault(char, {})[key] = meta
                if keeps == "discard":
                    # Delivered art faces right and intake already mirrored what
                    # didn't, so any inherited left-facing flag is now a lie. A
                    # touch-up comes back the way it went out, so its flag holds.
                    man["characters"][char][key].pop("faceLeft", None)
                    if key in native_left.get(char, []):
                        native_left[char] = [k for k in native_left[char] if k != key]

            reset = []
            if stored:
                if keeps == "discard":
                    if stored.get("edited"):
                        reset.append("hand tuning (" + ", ".join(sorted(stored["edited"])) + ")")
                    if stored.get("anchors"):
                        reset.append("anchors")
                for flag in ("needsReplacement", "wantsImprovement"):
                    if stored.get(flag):
                        reset.append(flag)
            done.append(f"{char}/{key}: {meta['w']}x{meta['h']} "
                        f"renderScale={meta['renderScale']} bodyBottom={meta['bodyBottom']}"
                        + ("" if stored else "  (NEW frame)")
                        + (f"  [{keeps}]" if stored else "")
                        + ("  kept: " + "; ".join(carried) if carried else "")
                        + ("  cleared: " + "; ".join(reset) if reset else "")
                        + ("  -> updated list" if note else ""))

    for line in done:
        print("  " + line)
    for line in skipped:
        print("  SKIP " + line)
    if args.dry_run:
        print(f"(dry run — {len(done)} frame(s) not written)")
        return
    json.dump(man, open(MANIFEST, "w"), indent=1)
    print(f"\nimported {len(done)} frame(s); manifest updated")
    print("next:")
    print("  python3 tools/bake_anchors.py    # anchors and bodyTop for the new art")
    print("  python3 tools/auto_tune.py       # the placement corrections that are mechanical")

    # Registering art is not the same as DRAWING it. A sheet-era fighter's anim
    # table names grid cells, so importing their semantic poses changes nothing
    # on screen until src/characters.js is edited — and that failure is silent,
    # which is how a delivered round can sit unused. Ask before anyone has to
    # think to. Advisory: the import already succeeded, so a non-zero exit here
    # is a to-do list, not a failure.
    check = os.path.join(intake.HERE, "check_pointing.mjs")
    if os.path.exists(check):
        touched = sorted({c for c, _ in (k.split("/", 1) for k in
                                         (d.split(":")[0] for d in done))})
        r = subprocess.run(["node", check, *touched], cwd=intake.ROOT,
                           capture_output=True, text=True)
        out = (r.stdout or "").strip()
        if r.returncode and out:
            print("\nSTILL TO DO — imported, but not yet drawn:")
            print(out)


if __name__ == "__main__":
    main()
