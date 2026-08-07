#!/usr/bin/env python3
"""Import approved intake art into the game.

Copies from `assets/intake/_processed/` into `assets/sprites/`, computes the
placement metadata the renderer needs, and registers it in `manifest.json`.
Only frames named in an approval file move; everything else stays in intake.

Placement follows the same model as the rest of the pipeline: `ox`/`oy` place
the art inside the logical cell, `bodyBottom` is the foot line. New art is
scaled so its body height matches what it replaces, so a swap does not
silently resize the fighter — a replacement is a change of ART, never of size.

The replaced frame's own settings do NOT carry over. Its entry is rebuilt from
scratch, so anchors and measured values go; and the size/foot line it inherits
are the values the pipeline generated, not any later hand tuning, since that
tuning existed to compensate for the very art being replaced. A
`needsReplacement` flag is cleared by the same act — flagging a sprite and
importing its successor are the two ends of one pipeline.

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
from extract_sprites import generated_frame_meta

CELL_W = CELL_H = 313.5
SPRITES = intake.SPRITES
MANIFEST = os.path.join(SPRITES, "manifest.json")


def body_metrics(frame):
    """Content box and the lowest opaque row — the natural foot line."""
    a = frame[:, :, 3]
    ys, xs = np.nonzero(a >= 128)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


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


def place(frame, old_meta, idle_meta):
    """Metadata for `frame` standing where `old_meta` stood.

    Replacing a frame keeps the old one's rendered HEIGHT and foot line, so a
    swap changes the ART and never the fighter's size — the thing the workbench
    tuning depends on.

    A frame with no predecessor (dodge_roll, dodge_air) instead borrows the
    character's IDLE scale factor. Matching heights would be wrong there: a
    roll is a wide, low pose, and forcing it to a standing frame's height would
    inflate it across the screen. All the delivered art is drawn at comparable
    resolution, so one scale factor keeps proportions honest across poses.
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
    return generated_frame_meta(frame, {"bodyBottom": round(float(body_bottom), 1),
                                        "bodyH": round(h * render_scale, 1)})


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
            old = pristine(stored)
            idle = man["characters"].get(char, {}).get("idle_a")
            meta = place(frame, old, idle)
            meta["file"] = f"{char}/{key}.png"

            if not args.dry_run:
                os.makedirs(os.path.join(SPRITES, char), exist_ok=True)
                shutil.copy2(src, os.path.join(SPRITES, char, f"{key}.png"))
                man["characters"].setdefault(char, {})[key] = meta
                # Delivered art faces right and intake already mirrored what
                # didn't, so any inherited left-facing flag is now a lie.
                man["characters"][char][key].pop("faceLeft", None)
                if key in native_left.get(char, []):
                    native_left[char] = [k for k in native_left[char] if k != key]

            reset = []
            if stored:
                if stored.get("edited"):
                    reset.append("hand tuning (" + ", ".join(sorted(stored["edited"])) + ")")
                if stored.get("needsReplacement"):
                    reset.append("needsReplacement")
                if stored.get("anchors"):
                    reset.append("anchors")
            done.append(f"{char}/{key}: {meta['w']}x{meta['h']} "
                        f"renderScale={meta['renderScale']} bodyBottom={meta['bodyBottom']}"
                        + ("" if stored else "  (NEW frame)")
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
