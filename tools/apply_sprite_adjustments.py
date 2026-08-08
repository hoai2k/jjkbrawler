#!/usr/bin/env python3
"""Apply a sprite-adjustment patch exported from the workbench.

The workbench (`workbench/?edit=sprites`) lets you tune per-frame `renderScale`
and `ox` live against the game's real renderer, then exports JSON like:

    { "character": "maki",
      "adjustments": { "ledge_hang": { "renderScale": 0.3518, "ox": 47.8,
                                       "bodyBottom": 300, "faceLeft": false,
                                       "anchors": { "com": [148.7, 512.0],
                                                    "ledge": [161.0, 40.6] } } } }

This writes those values into `assets/sprites/manifest.json`. Multiple payloads
can be applied at once — paste several into one file as a JSON array, or pass
several files.

`clearUpdated` is the other half of the workbench's "All Recently Updated Poses"
list: the poses reviewed as they stand, whose `replaced` marker (written by
intake) should come off without an adjustment. A pose that IS adjusted comes off
the list by that alone — having been retuned is the whole point of the list.

The same list also carries poses the game has always drawn through a state's
`fallback`, which the workbench used to report as drawn by nothing and so never
offered up to be sized. Those have no intake marker to remove, so reviewing one
as it stands writes `surfacedReviewed` instead; adjusting one clears it, the
same way an adjustment clears `replaced`.

Usage:
  python3 apply_sprite_adjustments.py patch.json [more.json ...]
  pbpaste | python3 apply_sprite_adjustments.py -        # straight from clipboard
  python3 apply_sprite_adjustments.py patch.json --dry-run
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "..", "assets", "sprites", "manifest.json")

# The workbench's pseudo-character for shared effect/summon art. Its edits go to
# manifest["otherSprites"], not under any character.
OTHER_KEY = "__other"

# renderScale = size, ox = horizontal centring, bodyBottom = ground contact
# (where the sprite's feet meet the floor — not necessarily its lowest pixel,
# since perspective can put one foot below the standing plane).
#
# anchors = named points in the SOURCE IMAGE's own pixels, from its top-left
# corner: "com" is the centre of mass every rotation pivots about, and states
# can add their own ("ledge" is the hand that grips the edge). Image-local
# coordinates mean an anchor stays on the same piece of artwork through any
# later renderScale / ox / bodyBottom change. See src/sprites.js.
#
# faceLeft mirrors a frame whose art was drawn facing left. `nativeLeft` in the
# manifest seeded these by guess; a per-frame faceLeft is an explicit decision
# and wins over it, which is why writing `false` matters rather than deleting
# the key — see loadAssets in src/assets.js.
#
# needsReplacement flags a frame whose ART is wrong. Its VALUE says what is
# wrong — "replace", "crop", "alpha", "bleed" (REPLACEMENT_KINDS in
# src/sprites.js) — because a wholesale redraw and a crop fix are very different
# asks. `false` clears the flag; a legacy `true` means "replace".
# tools/list_replacements.py collects them for the asset request list, and
# intake clears the flag when new art lands.
#
# rotationDeg tilts the pose about its centre of mass, in degrees, clockwise
# positive. It corrects art drawn off square; the game adds its own procedural
# rotation on top. Absolute rather than a delta — a drawing has no inherent tilt
# to be relative to, so 0 is square and the key is dropped at 0.
#
# wantsImprovement is the softer ask: the art works, it is just not as good as
# it should be. Its value is "quality", "pose" or "character"
# (IMPROVEMENT_KINDS in src/sprites.js). Collected at a lower priority, since
# nothing is blocked by one.
ALLOWED = {"renderScale", "ox", "bodyBottom", "rotationDeg", "anchors", "faceLeft",
           "needsReplacement", "wantsImprovement"}
# Flags whose VALUE is a kind string. `false` clears; a legacy `true` means the
# first kind in the list.
KIND_FIELDS = {"needsReplacement": "replace", "wantsImprovement": "quality"}
NUMERIC = {"renderScale", "ox", "bodyBottom", "rotationDeg"}
BOOLEAN = {"faceLeft"}

# Fields whose pre-edit value is worth remembering. `edited` maps each to what
# it held before the FIRST hand edit, which does two jobs: it marks the frame as
# hand-tuned (the workbench's view filter reads it), and it lets intake roll the
# tuning back when the art is replaced — nudges made to compensate for bad art
# must not be inherited by the art that fixes it.
TRACKED = {"renderScale", "ox", "bodyBottom", "rotationDeg", "faceLeft"}

# Cleared off a pose before the chosen drawing's own values are written in, so a
# variant that does not set a field cannot inherit the previous drawing's. That
# covers the review flags as well as the numbers: "fix alpha" is a verdict on a
# DRAWING, and a pose that keeps it across a switch pins it to whichever art
# happens to be selected. Mirrors VARIANT_BANKED in src/sprites.js and BANKED in
# build_variants.py.
VARIANT_PLACEMENT = [
    "w", "h", "ox", "oy", "bodyBottom", "bodyH", "bodyTop",
    "centroidX", "renderScale", "rotationDeg", "anchors", "faceLeft",
]
VARIANT_REVIEW = ["needsReplacement", "wantsImprovement", "edited", "surfacedReviewed"]
VARIANT_BANKED = VARIANT_PLACEMENT + VARIANT_REVIEW

# Kinds that only mean something about an option, never about the pose.
# Mirrors VARIANT_ONLY_KINDS in src/sprites.js.
VARIANT_ONLY_KINDS = {"delete"}


def load_payloads(sources):
    payloads = []
    for src in sources:
        raw = sys.stdin.read() if src == "-" else open(src).read()
        # tolerate the workbench's "// no changes" placeholder
        raw = raw.strip()
        if not raw or raw.startswith("//"):
            continue
        data = json.loads(raw)
        payloads.extend(data if isinstance(data, list) else [data])
    return payloads


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    applied, skipped = [], []

    for payload in load_payloads(args.sources):
        char = payload.get("character")
        if char == OTHER_KEY:
            # The workbench's "Other Sprites" entry: shared effect/summon art,
            # which has no per-frame placement data. Only the review flags apply,
            # and they live in their own manifest section keyed by sprite key
            # ("effect:blue", "summon:nue") rather than under a character.
            frames = man.setdefault("otherSprites", {})
            for key in (payload.get("adjustments") or {}):
                frames.setdefault(key, {})
        else:
            frames = man["characters"].get(char)
        if frames is None:
            skipped.append(f"unknown character '{char}'")
            continue
        # Which sprite each action draws. The workbench's secondary-action
        # editor writes these when a state is pointed at a different cell; the
        # game reads them in animsOf() (src/sprites.js), so characters.js does
        # not change. An empty list clears an override.
        if "animOverrides" in payload:
            table = man.setdefault("animOverrides", {}).setdefault(char, {})
            for stateName, frames in payload["animOverrides"].items():
                before = table.get(stateName)
                if not frames:
                    table.pop(stateName, None)
                    applied.append(f"{char}.{stateName}: {before} -> cleared")
                else:
                    table[stateName] = list(frames)
                    applied.append(f"{char}.{stateName}: {before} -> {list(frames)}")
            if not table:
                man["animOverrides"].pop(char, None)
            if not man.get("animOverrides"):
                man.pop("animOverrides", None)

        # Which drawing a pose uses, when it has more than one to choose from
        # (tools/build_variants.py). Two halves, and both matter:
        #   variantPlacement  banks every option's own size/centring/anchors and
        #                     review flags, so tuning or flagging one drawing is
        #                     not lost by looking at another — both belong to
        #                     the IMAGE.
        #   variantChoice     mirrors the chosen option onto the pose, which is
        #                     the only thing the game reads.
        for pose, options in (payload.get("variantPlacement") or {}).items():
            entry = man.setdefault("variants", {}).setdefault(char, {}).get(pose)
            if entry is None:
                skipped.append(f"{char}/{pose}: no variants entry to update")
                continue
            by_file = {o["file"]: o for o in entry["options"]}
            for opt in options:
                target = by_file.get(opt["file"])
                if target is None:
                    skipped.append(f"{char}/{pose}: {opt['file']} is not an option")
                    continue
                for field, value in opt.items():
                    if field == "file":
                        continue
                    if field == "needsReplacement":
                        # A delete tag on a DRAWING: "we have something better,
                        # discard this one at the next cleanup". False clears it,
                        # so untagging exports as clearly as tagging.
                        before = target.get(field)
                        if value:
                            target[field] = value
                            applied.append(f"{char}/{pose} [{opt['file']}]: tagged {value}")
                        elif before:
                            target.pop(field, None)
                            applied.append(f"{char}/{pose} [{opt['file']}]: {before} -> cleared")
                        continue
                    target[field] = value

        for pose, file in (payload.get("variantChoice") or {}).items():
            meta = frames.get(pose)
            entry = (man.get("variants") or {}).get(char, {}).get(pose)
            if meta is None or entry is None:
                skipped.append(f"{char}/{pose}: cannot select {file}")
                continue
            chosen = next((o for o in entry["options"] if o["file"] == file), None)
            if chosen is None:
                skipped.append(f"{char}/{pose}: {file} is not an option")
                continue
            before = meta.get("file")
            for field in VARIANT_BANKED:
                meta.pop(field, None)
            for field, value in chosen.items():
                if field == "label":
                    continue
                # "Delete variant" says discard this one OF SEVERAL — a sentence
                # only an option can carry. Mirroring it onto the pose would put
                # it in front of list_replacements.py twice, once as a pose
                # needing work and once as the deletion it already collects from
                # the variants list.
                if field == "needsReplacement" and value in VARIANT_ONLY_KINDS:
                    continue
                meta[field] = value
            applied.append(f"{char}/{pose}.file: {before} -> {file}")

        # The scale reference the character's size is solved against. Written
        # when the idle itself is adjusted: from then on the idle is a pose like
        # any other, and the character's size belongs to the height target.
        if "heightSpan" in payload:
            spans = man.setdefault("heightSpans", {})
            before = spans.get(char)
            spans[char] = payload["heightSpan"]
            applied.append(f"{char}.heightSpan: {before} -> {payload['heightSpan']}")

        if "headHeight" in payload:
            heads = man.setdefault("headHeights", {})
            before = heads.get(char)
            heads[char] = payload["headHeight"]
            applied.append(f"{char}.headHeight: {before} -> {payload['headHeight']}")

        for key, changes in (payload.get("adjustments") or {}).items():
            meta = frames.get(key)
            if meta is None:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            for field, value in changes.items():
                if field not in ALLOWED:
                    skipped.append(f"{char}/{key}: ignoring unsupported field '{field}'")
                    continue
                if field in TRACKED:
                    # record the pristine value once, before it is overwritten
                    meta.setdefault("edited", {}).setdefault(field, meta.get(field))
                if field in KIND_FIELDS:
                    before = meta.get(field)
                    if not value:
                        meta.pop(field, None)
                        applied.append(f"{char}/{key}.{field}: {before} -> cleared")
                    else:
                        kind = KIND_FIELDS[field] if value is True else str(value)
                        meta[field] = kind
                        applied.append(f"{char}/{key}.{field}: {before} -> {kind}")
                    continue
                if field in BOOLEAN:
                    before = meta.get(field)
                    meta[field] = bool(value)
                    applied.append(f"{char}/{key}.{field}: {before} -> {bool(value)}")
                    continue
                if field == "anchors":
                    # merge, so exporting one anchor never drops the others
                    anchors = meta.setdefault("anchors", {})
                    for name, point in value.items():
                        before = anchors.get(name)
                        anchors[name] = [round(float(point[0]), 1), round(float(point[1]), 1)]
                        applied.append(f"{char}/{key}.anchors.{name}: {before} -> {anchors[name]}")
                    continue
                before = meta.get(field)
                meta[field] = value
                applied.append(f"{char}/{key}.{field}: {before} -> {value}")
            # Retuning a pose whose art was just replaced is exactly what the
            # updated list asks for, so the marker comes off with the work. A
            # surfaced pose leaves by the same door: `edited` now records it as
            # tuned, which is what put it on the list for lacking.
            if meta.pop("replaced", None) or meta.pop("surfacedReviewed", None):
                applied.append(f"{char}/{key}: off the updated list (adjusted)")

        # Poses reviewed as they stand: the new art needed nothing, so the only
        # thing to record is that someone looked. An intake marker is removed; a
        # surfaced pose has none to remove, so the looking is what gets written.
        for key in (payload.get("clearUpdated") or []):
            meta = frames.get(key)
            if meta is None:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            if meta.pop("replaced", None):
                applied.append(f"{char}/{key}: off the updated list (reviewed)")
            elif not meta.get("surfacedReviewed"):
                meta["surfacedReviewed"] = True
                applied.append(f"{char}/{key}: off the updated list (reviewed as drawn)")
            else:
                skipped.append(f"{char}/{key}: already off the updated list")

    for line in applied:
        print("  " + line)
    for line in skipped:
        print("  SKIP " + line)

    if not applied:
        print("nothing to apply")
        return
    if args.dry_run:
        print(f"(dry run — {len(applied)} change(s) not written)")
        return
    json.dump(man, open(MANIFEST, "w"), indent=1)
    print(f"manifest updated: {len(applied)} change(s)")


if __name__ == "__main__":
    main()
