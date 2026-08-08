#!/usr/bin/env python3
"""Import approved intake art into the game.

Copies from `assets/intake/_processed/` into `assets/sprites/`, computes the
placement metadata the renderer needs, and registers it in `manifest.json`.
Only frames named in an approval file move; everything else stays in intake.

Placement follows the same model as the rest of the pipeline: `ox`/`oy` place
the art inside the logical cell, `bodyBottom` is the foot line. New art is
scaled so its body height matches what it replaces, so a swap does not
silently resize the fighter — a replacement is a change of ART, never of size.

How much of the replaced frame's own settings carries over depends on WHY it
was flagged (REPLACEMENT_PLACEMENT in src/sprites.js). A redraw and a crop fix
are not the same event:

  replace        -> discard. A different drawing; nothing about the old
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

  --approve FILE   JSON: {"char": ["frame", ...]} or {"char": {"frame": {...}}}
  --dry-run        report only

Usage:
  python3 intake_import.py --approve approvals.json --dry-run
  python3 intake_import.py --approve approvals.json
"""

import argparse
import json
import os
import shutil

import numpy as np
from PIL import Image

import intake
from extract_sprites import generated_frame_meta, ALPHA_THRESHOLD
from list_replacements import placement_rule

CELL_W = CELL_H = 313.5

# kind -> what survives, parsed from src/sprites.js so there is one source of
# truth for the rule rather than a copy here that can drift.
PLACEMENT = placement_rule()
SPRITES = intake.SPRITES
MANIFEST = os.path.join(SPRITES, "manifest.json")


def body_metrics(frame):
    """Content box and the lowest opaque row — the natural foot line."""
    a = frame[:, :, 3]
    ys, xs = np.nonzero(a >= 128)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def survives(stored):
    """"keep" | "reframe" | "discard" for the frame being replaced."""
    if not stored:
        return "discard"
    flag = stored.get("needsReplacement")
    if not flag:
        return "discard"
    kind = "replace" if flag is True else str(flag)
    return PLACEMENT.get(kind, "discard")


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


def import_meta(stored, old_frame, new_frame, idle_meta=None):
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


def content_box(frame):
    """The opaque bounding box, at the SAME threshold generated_frame_meta uses.

    Measuring it any other way puts this a pixel or two out of step with the
    placement it is supposed to be reasoning about.
    """
    a = frame[:, :, 3]
    ys, xs = np.nonzero(a >= ALPHA_THRESHOLD)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def reframe_placement(meta, old_meta, old_frame, new_frame):
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
    ox0, oy0, ox1, oy1 = content_box(old_frame)
    nx0, ny0, nx1, ny1 = content_box(new_frame)
    old_cx = (ox0 + ox1) / 2
    new_cx = (nx0 + nx1) / 2
    out = dict(meta)
    out["ox"] = round(old_meta.get("ox", 0) + (old_cx - new_cx), 1)
    out["oy"] = round(old_meta.get("oy", 0) + (oy1 - ny1))
    # centroidX is stored in the same cell space, so it moves with ox.
    if "centroidX" in meta:
        out["centroidX"] = round(meta["centroidX"] + (out["ox"] - meta["ox"]), 1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--approve", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    approvals = json.load(open(args.approve))
    man = json.load(open(MANIFEST))
    native_left = man.setdefault("nativeLeft", {})

    done, skipped = [], []
    for char, frames in approvals.items():
        keys = frames if isinstance(frames, list) else list(frames)
        for key in keys:
            src = os.path.join(intake.PROCESSED, char, f"{key}.png")
            if not os.path.exists(src):
                skipped.append(f"{char}/{key}: not in _processed")
                continue
            frame = np.asarray(Image.open(src).convert("RGBA"))
            stored = man["characters"].get(char, {}).get(key)
            keeps = survives(stored)
            # A touch-up keeps the tuning; a redraw rolls it back, because the
            # tuning existed to compensate for the art being replaced.
            old = stored if keeps in ("keep", "reframe") else pristine(stored)
            idle = man["characters"].get(char, {}).get("idle_a")
            meta = place(frame, old, idle, keep_scale=keeps in ("keep", "reframe"))
            meta["file"] = f"{char}/{key}.png"

            carried = []
            if keeps in ("keep", "reframe") and stored:
                # The art being replaced is still on disk until the copy below,
                # which is what lets the new placement be derived from how far
                # the re-crop moved the drawing.
                old_path = os.path.join(SPRITES, stored.get("file", f"{char}/{key}.png"))
                if os.path.exists(old_path):
                    old_frame = np.asarray(Image.open(old_path).convert("RGBA"))
                    meta = reframe_placement(meta, stored, old_frame, frame)
                    carried.append("placement")
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
                        + ("  cleared: " + "; ".join(reset) if reset else ""))

    for line in done:
        print("  " + line)
    for line in skipped:
        print("  SKIP " + line)
    if args.dry_run:
        print(f"(dry run — {len(done)} frame(s) not written)")
        return
    json.dump(man, open(MANIFEST, "w"), indent=1)
    print(f"\nimported {len(done)} frame(s); manifest updated")
    print("run tools/bake_anchors.py to measure anchors and bodyTop for the new art")


if __name__ == "__main__":
    main()
