#!/usr/bin/env python3
"""Apply a sprite-adjustment patch exported from the workbench.

The workbench (`workbench/?edit=sprites`) lets you tune per-frame `renderScale`
and `ox` live against the game's real renderer, then exports JSON like:

    { "character": "maki",
      "adjustments": { "ledge_hang": { "renderScale": 0.3518, "ox": 47.8,
                                       "bodyBottom": 300, "faceLeft": false,
                                       "anchors": { "com": [148.7, 512.0],
                                                    "ledge": [161.0, 40.6] } } } }

This writes those values into `sprites/assets/manifest.json`. Multiple payloads
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

Shared drawings (`character: "__other"`) reach that list by a third route — the
game draws them and nobody has ever set a number against them — and leave it by
the same `clearUpdated`, written into `otherSprites` beside the placement
fields. Their entry is created if it does not exist, because "has no entry" is
precisely what put them on the list.

Usage:
  python3 apply_sprite_adjustments.py patch.json [more.json ...]
  pbpaste | python3 apply_sprite_adjustments.py -        # straight from clipboard
  python3 apply_sprite_adjustments.py patch.json --dry-run
"""
import shared_art_stamp
import sprite_paths

import argparse
import datetime as dt
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = sprite_paths.MANIFEST

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
# later renderScale / ox / bodyBottom change. See sprites/src/sprites.js.
#
# faceLeft mirrors a frame whose art was drawn facing left. `nativeLeft` in the
# manifest seeded these by guess; a per-frame faceLeft is an explicit decision
# and wins over it, which is why writing `false` matters rather than deleting
# the key — see loadAssets in src/assets.js.
#
# needsReplacement flags a frame whose ART is wrong. Its VALUE says what is
# wrong — "replace", "crop", "alpha", "bleed" (REPLACEMENT_KINDS in
# sprites/src/sprites.js) — because a wholesale redraw and a crop fix are very different
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
# (IMPROVEMENT_KINDS in sprites/src/sprites.js). Collected at a lower priority, since
# nothing is blocked by one.
#
# replacementNote / improvementNote are the free text written beside either
# flag: what is actually wrong with THIS drawing, in the words of whoever spotted
# it. The kind says which of six shapes the fault has, and a request written from
# the kind alone has to guess the rest. Optional; "" clears one. They ride with
# the drawing (VARIANT_REVIEW), not the pose, and the workbench drops a note when
# the flag it explains is cleared.
ALLOWED = {"renderScale", "ox", "bodyBottom", "rotationDeg", "anchors", "faceLeft",
           # Shared drawings only: WHICH IMAGE this tuning was measured against.
           # Not an adjustment — it is how the numbers beside it can later be
           # told to be stale. See `stamp_source`.
           "file",
           # Shared drawings (`otherSprites`) only: a nudge in GAME pixels from
           # the point the spawn site paints them on. They have no cell to be
           # placed in, so `ox`/`bodyBottom` mean nothing there.
           "dx", "dy",
           # Shared CREATURES only: the box a summon hits with, as four
           # fractions of its own drawing (x, y, w, h — see sharedAttack in
           # src/shared_sprites.js). Its hurt box is the whole drawing and is
           # measured, so there is nothing to store for that one.
           "attackBox",
           # Seconds of fade as a projectile leaves — 0 or absent is the hard
           # cut every shot has always had (sharedFadeIn in
           # src/shared_sprites.js). Energy art gathers rather than appearing.
           "fadeIn",
           # Shared PROJECTILES: where the collision circle sits relative to the
           # shot's own position, and how big — { dx, dy, scale }, sharedHit in
           # src/shared_sprites.js. A shot used to have exactly one point, which
           # is right until the drawing is not a ball: Dagon's tide is a wall of
           # water, and the part that should hit is the face of the wave rather
           # than the middle of a mostly-empty plate. `null` clears it.
           "hit",
           "needsReplacement", "wantsImprovement",
           "replacementNote", "improvementNote"}
# Free text. "" is meaningful — it clears the note rather than leaving the old
# one attached to a flag that has since changed.
TEXT = {"replacementNote", "improvementNote"}
# Flags whose VALUE is a kind string. `false` clears; a legacy `true` means the
# first kind in the list.
KIND_FIELDS = {"needsReplacement": "replace", "wantsImprovement": "quality"}
NUMERIC = {"renderScale", "ox", "bodyBottom", "rotationDeg", "dx", "dy", "fadeIn"}
# Fields whose value is an object, taken whole rather than compared as a number.
OBJECT = {"attackBox", "anchors", "hit"}
BOOLEAN = {"faceLeft"}

# Fields whose pre-edit value is worth remembering. `edited` maps each to what
# it held before the FIRST hand edit, which does two jobs: it marks the frame as
# hand-tuned (the workbench's view filter reads it), and it lets intake roll the
# tuning back when the art is replaced — nudges made to compensate for bad art
# must not be inherited by the art that fixes it.
TRACKED = {"renderScale", "ox", "bodyBottom", "rotationDeg", "faceLeft", "dx", "dy"}

# The fields that mean somebody PLACED this pose, as opposed to judging the
# drawing on it. Only these take a pose off the recently-updated list — see the
# note at the point of use.
PLACEMENT_WORK = TRACKED | {"anchors"}

# Cleared off a pose before the chosen drawing's own values are written in, so a
# variant that does not set a field cannot inherit the previous drawing's. That
# covers the review flags as well as the numbers: "fix alpha" is a verdict on a
# DRAWING, and a pose that keeps it across a switch pins it to whichever art
# happens to be selected. Mirrors VARIANT_BANKED in sprites/src/sprites.js and BANKED in
# build_variants.py.
VARIANT_PLACEMENT = [
    "w", "h", "ox", "oy", "bodyBottom", "bodyH", "bodyTop",
    "centroidX", "renderScale", "rotationDeg", "anchors", "faceLeft",
    # where the trimmed art sat in the delivered plate; see sprites.js
    "srcBox",
]
VARIANT_REVIEW = ["needsReplacement", "wantsImprovement",
                  "replacementNote", "improvementNote",
                  "edited", "surfacedReviewed"]
# Where the drawing came from, if it came from another pose. Banked for the
# same reason as the rest: it describes the IMAGE, so a pose that switches back
# to its own art must not keep claiming to have borrowed one.
VARIANT_ORIGIN = ["borrowedFrom"]
# What a tool changed, and from what — see VARIANT_PROVENANCE in sprites.js.
VARIANT_PROVENANCE = ["smoothed"]
VARIANT_BANKED = VARIANT_PLACEMENT + VARIANT_REVIEW + VARIANT_ORIGIN + VARIANT_PROVENANCE

# Measured off the image rather than decided by a person: bake_anchors.py owns
# these, and they describe THE FILE. They are not banked on a variant option
# (a person did not choose them), so switching a pose's drawing has to clear
# them or they go on describing the drawing that left. `bodyTop` is not here —
# it IS banked, so a switch already replaces it.
MEASURED_FIELDS = ["bodyLeft", "bodyRight", "coreLeft", "coreRight"]

# Kinds that only mean something about an option, never about the pose.
# Mirrors VARIANT_ONLY_KINDS in sprites/src/sprites.js.
VARIANT_ONLY_KINDS = {"delete"}


def now_stamp():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def bank_superseded(man, char, key, note, meta):
    """Keep the drawing an approval just displaced, as an option on the pose.

    Approving is not the end of the comparison, it is a step in it. The question
    the workbench's **Alternate sprite** view answers is "what was here before",
    and if the displaced drawing were dropped that view would silently start
    showing something else — or nothing — the moment you said yes. Banked with
    the moment it was superseded, so the newest predecessor is the one offered.

    The file is left on disk. It is small, it is the only copy of a drawing that
    shipped for a while, and reverting is otherwise a trip through git.
    """
    live = dict(note.get("live") or {})
    if not live.get("file"):
        return
    entry = man.setdefault("variants", {}).setdefault(char, {}).setdefault(
        key, {"options": []})
    entry["options"] = [o for o in entry["options"] if o["file"] != live["file"]]
    live["label"] = "Superseded"
    live["supersededAt"] = note.get("at") or now_stamp()
    entry["options"].append(live)
    # The drawing now in play belongs in the list too, or approving twice would
    # leave the pose's current art missing from its own options.
    if not any(o["file"] == meta.get("file") for o in entry["options"]):
        current = {f: meta[f] for f in VARIANT_BANKED if f in meta}
        current["file"] = meta.get("file")
        current["label"] = "In game"
        entry["options"].insert(0, current)


def bank_rejected(man, char, key, note, delivered):
    """Keep the drawing an approval just turned down, as an option on the pose.

    The mirror of bank_superseded, and for the same reason: saying no is a step
    in the comparison, not the end of it. The replacement stays on the pose as
    an alternate carrying its own placement, so the answer can be changed later
    — in the workbench, by the pose's own variant chevron — without the drawing
    having to be delivered again.
    """
    if not delivered.get("file"):
        return
    entry = man.setdefault("variants", {}).setdefault(char, {}).setdefault(
        key, {"options": []})
    rejected = dict(delivered)
    rejected["label"] = "Not approved"
    rejected["supersededAt"] = note.get("at") or now_stamp()
    entry["options"] = [o for o in entry["options"] if o["file"] != rejected["file"]]
    entry["options"].append(rejected)
    # The drawing that stays in play belongs in the list too, or the pose's own
    # art would be missing from its own options.
    live = dict(note.get("live") or {})
    if live.get("file") and not any(o["file"] == live["file"] for o in entry["options"]):
        live["label"] = "In game"
        entry["options"].insert(0, live)


def clear_fresh(man, char, key):
    """Drop the "new, not looked at" mark from this pose's variant options.

    The mark exists so an alternate — which changes nothing on screen — is
    visible at all. Once the pose has been adjusted or reviewed, it has been
    looked at, so the dot has done its job. Same lifecycle as the `replaced`
    marker beside it, and cleared in the same two places.
    """
    entry = ((man.get("variants") or {}).get(char) or {}).get(key)
    if not entry:
        return False
    hit = False
    for opt in entry.get("options", []):
        if opt.pop("fresh", None):
            hit = True
    return hit


def load_payloads(sources):
    payloads = []
    for src in sources:
        raw = sys.stdin.read() if src == "-" else open(src).read()
        # tolerate the workbench's "// no changes" placeholder
        raw = raw.strip()
        if not raw or raw.startswith("//"):
            # SAY SO. This used to `continue` in silence, and a real export that
            # happened to open with a comment line was therefore read as "no
            # changes" and applied as nothing --- the run printed its usual
            # "nothing to apply" and looked like a file with no work in it. A
            # skip that cannot be told from an empty file is a skip that hides
            # a bug, so it is announced.
            print(f"  SKIP {src}: starts with a comment, read as the "
                  f"'no changes' placeholder --- nothing in it was applied")
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
    # Characters whose measured spans were dropped because a pose changed
    # drawing. Said at the end rather than buried in the change list: the
    # manifest is CORRECT without them (every consumer falls back), but it is
    # not complete until bake_anchors has read the new pixels.
    remeasure = set()
    # Characters that gained a delete tag this run. See the note printed at the
    # end: this tool writes the tag, check_pointing.mjs is what can tell whether
    # the drawing it names is still on screen.
    tagged_delete = set()

    for payload in load_payloads(args.sources):
        char = payload.get("character")
        if char == OTHER_KEY:
            # The workbench's "Other Sprites" entry: shared effect/summon art.
            # It has no pose to place — the code that spawns it decides where it
            # goes — so most of the placement fields do not apply. Two do, and
            # both are properties of the DRAWING rather than of a pose:
            # `faceLeft` for art delivered pointing the wrong way, and
            # `renderScale` for art delivered at the wrong size next to the
            # fighter who throws it. Stored in their own manifest section keyed
            # by sprite key ("effect:blue", "summon:nue"), and read back by
            # src/shared_sprites.js.
            frames = man.setdefault("otherSprites", {})
            for key in (payload.get("adjustments") or {}):
                frames.setdefault(key, {})
            # A shared drawing nobody has ever tuned has no entry here at all —
            # that is the promise `rawMeta` keeps, an untouched sprite adds
            # nothing to the file — and those are exactly the ones the to-do
            # list is made of. Reviewing one has to be able to CREATE its entry,
            # or the only drawings that could be marked reviewed were the ones
            # already carrying numbers, and `stagefx:stage_flower` would be
            # reported as "not in manifest" and left on the list forever.
            for key in (payload.get("clearUpdated") or []):
                frames.setdefault(key, {})
        else:
            frames = man["characters"].get(char)
        if frames is None:
            skipped.append(f"unknown character '{char}'")
            continue
        # The delivered drawing's own numbers, before this export's adjustments
        # touch them. A "keep" verdict banks the drawing it turns down, and by
        # the time the verdicts are read the pose's fields have already been
        # rewritten with the ones the workbench put back — so what the option
        # deserves is captured here, while it is still the delivered art's.
        delivered_before = {
            key: {f: meta[f] for f in ["file"] + VARIANT_BANKED if f in meta}
            for key, meta in frames.items()
            if isinstance(meta, dict) and meta.get("awaitingApproval")
            and not meta["awaitingApproval"].get("declined")
        }
        # Which sprite each action draws. The workbench's secondary-action
        # editor writes these when a state is pointed at a different cell; the
        # game reads them in animsOf() (sprites/src/sprites.js), so characters.js does
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
            # Created rather than demanded: a pose earns a variants entry the
            # moment the workbench points it at another of the character's
            # sprites, and that is exactly the export that has to be able to
            # arrive at a pose which never had options before.
            entry = man.setdefault("variants", {}).setdefault(char, {}).setdefault(
                pose, {"options": []})
            by_file = {o["file"]: o for o in entry["options"]}
            for opt in options:
                target = by_file.get(opt["file"])
                if target is None:
                    # A drawing borrowed from another pose. It carries its own
                    # copy of the placement — the whole point of borrowing is
                    # that this pose sits it differently — so it is added, not
                    # skipped as an unknown file.
                    target = {"file": opt["file"]}
                    if opt.get("label"):
                        target["label"] = opt["label"]
                    if opt.get("borrowedFrom"):
                        target["borrowedFrom"] = opt["borrowedFrom"]
                    entry["options"].append(target)
                    by_file[opt["file"]] = target
                    applied.append(f"{char}/{pose}: {opt['file']} added as an option")
                for field, value in opt.items():
                    if field == "file":
                        continue
                    if field == "pending":
                        # Approving or keeping is the absence of this flag, so
                        # a false has to erase it rather than be skipped.
                        if value:
                            target["pending"] = True
                        else:
                            target.pop("pending", None)
                        continue
                    if field == "needsReplacement":
                        # A delete tag on a DRAWING: "we have something better,
                        # discard this one at the next cleanup". False clears it,
                        # so untagging exports as clearly as tagging.
                        before = target.get(field)
                        if value:
                            target[field] = value
                            if value == "delete":
                                tagged_delete.add(char)
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
            # AND THE MEASUREMENTS, which are not banked because they are not
            # decisions — they are read off the pixels (tools/bake_anchors.py).
            # A pose that switches to a different drawing keeps whatever was
            # measured from the old one, and those numbers are then simply
            # wrong: jogo/attack_up pointed at a 262px-wide drawing while still
            # claiming bodyRight 873, which is silhouette.js's idea of how wide
            # the fighter is and com_review's idea of where the body's core is.
            # Dropped rather than guessed at — every consumer falls back for a
            # frame that has none, and `bake_anchors.py` puts them back for real.
            if before != file:
                for field in MEASURED_FIELDS:
                    meta.pop(field, None)
                remeasure.add(char)
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

        # Verdicts first, then the numbers. A "keep" puts the whole of the old
        # drawing back, so an adjustment made AFTER that decision has to land on
        # top of the restored fields rather than under them — which is the order
        # the workbench does it in too: decide, then tune.
        # Verdicts on replacements the intake held back. "approve" lets the
        # new drawing into the game — the pose already carries its placement,
        # so all that is left is to drop the marker that was diverting the game
        # to the old one. "keep" is the other answer: the whole of the old
        # drawing goes back, and the export's adjustments land on top of it.
        for key, verdict in (payload.get("approvals") or {}).items():
            meta = frames.get(key)
            if meta is None:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            note = meta.pop("awaitingApproval", None)
            if note is None:
                skipped.append(f"{char}/{key}: no replacement was waiting")
                continue
            if verdict == "keep" and not note.get("live"):
                # A FIRST delivery turned down. There is no drawing of this
                # pose to restore — the game has been playing the animation's
                # fallback all along — so the hold is what keeps this one out
                # and it stays, carrying the answer. Popping it, which is what
                # the branch below does, would put the drawing into the game by
                # exactly the door the answer closed.
                bank_rejected(man, char, key, note, delivered_before.get(key, {}))
                note["declined"] = now_stamp()
                meta["awaitingApproval"] = note
            elif verdict == "keep":
                # The whole drawing goes back, not a field-by-field merge over
                # the one being turned down: every field that belongs to an
                # image is cleared first, or the rejected drawing's numbers
                # (and anchors, and mirror) would be left wearing the old art.
                bank_rejected(man, char, key, note, delivered_before.get(key, {}))
                for field in VARIANT_BANKED:
                    meta.pop(field, None)
                for field, value in (note.get("live") or {}).items():
                    meta[field] = value
            else:
                bank_superseded(man, char, key, note, meta)
                # The pose stays on the updated list, saying something true.
                #
                # Intake stamps `replaced` as `how: "await"`, which the workbench
                # reads as "new art is in the repo and the game is still drawing
                # the old drawing — approve or keep". Approving makes that
                # sentence false, and nothing was rewriting it: an approve-only
                # export left the pose on the list still asking a question that
                # had been answered.
                #
                # It should not leave the list either. The numbers this drawing
                # carries were derived from it, not chosen — auto_tune measures
                # the foot line and the size off the matte — so an approval is
                # the moment a machine's placement goes on screen. That is the
                # same claim `how: "placed"` describes, and it wants the same
                # answer: agree with it, adjust it, or send the art back.
                marker = meta.get("replaced")
                if marker and marker.get("how") == "await":
                    marker["how"] = "approved"
                    marker["kept"] = "keep"
                    marker["approvedAt"] = now_stamp()
            # A first delivery and a replacement are different events and the
            # line says which: "replacement approved" on a pose that never had
            # art reads as though something was overwritten, and after a round
            # of 89 held poses that line is the only record of which were which.
            what = "replacement" if note.get("live") else "first delivery"
            applied.append(
                (f"{char}/{key}: first delivery kept out, states go on playing "
                 "their fallback")
                if verdict == "keep" and not note.get("live")
                else f"{char}/{key}: replacement kept out, old art restored"
                if verdict == "keep"
                else f"{char}/{key}: {what} approved -> {meta.get('file')}")

        for key, changes in (payload.get("adjustments") or {}).items():
            meta = frames.get(key)
            if meta is None:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            for field, value in changes.items():
                if field not in ALLOWED:
                    skipped.append(f"{char}/{key}: ignoring unsupported field '{field}'")
                    continue
                if field == "file":
                    # Not a number to store: the drawing these numbers were
                    # measured against. Stamped with a hash of its bytes so a
                    # redelivery can be told from a touch-up later — the thing
                    # a shared key, being one fixed filename forever, cannot
                    # say for itself. Only meaningful on shared art.
                    if char == OTHER_KEY and not shared_art_stamp.stamp(meta, value):
                        skipped.append(f"{char}/{key}: cannot stamp, no file at '{value}'")
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
                if field in TEXT:
                    before = meta.get(field)
                    text = str(value or "").strip()
                    if text:
                        meta[field] = text
                    else:
                        meta.pop(field, None)
                    applied.append(f"{char}/{key}.{field}: "
                                   + ("cleared" if not text else f"{len(text)} chars"))
                    continue
                if field == "attackBox":
                    # Four fractions of the drawing, taken whole: they only mean
                    # anything together, and a partial one would place a box
                    # nobody chose. Clamped to the same bounds the workbench
                    # drags within, so a hand-edited export cannot put a
                    # creature's bite off its own body.
                    if not isinstance(value, dict):
                        skipped.append(f"{char}/{key}.attackBox: not an object")
                        continue
                    bounds = {"x": (-1, 1), "y": (0, 1.5), "w": (0.05, 2), "h": (0.05, 2)}
                    before = meta.get("attackBox")
                    box = {}
                    for name, (lo, hi) in bounds.items():
                        if name not in value:
                            skipped.append(f"{char}/{key}.attackBox: missing '{name}'")
                            box = None
                            break
                        box[name] = round(min(hi, max(lo, float(value[name]))), 3)
                    if box is None:
                        continue
                    meta["attackBox"] = box
                    applied.append(f"{char}/{key}.attackBox: {before} -> {box}")
                    continue
                if field == "anchors":
                    # merge, so exporting one anchor never drops the others
                    anchors = meta.setdefault("anchors", {})
                    # An anchor is BAKED for every frame that owes one, so the
                    # value being present says nothing about whether a person
                    # ever looked at it. Without this record the verification
                    # queue read its own bake back as 34 confirmed answers —
                    # and this round moved 26 teeter feet by hundreds of pixels
                    # off exactly those bakes. So remember which ones a hand
                    # placed, under `edited` like every other tracked field,
                    # holding what the measurement said before.
                    was = meta.setdefault("edited", {}).setdefault("anchors", {})
                    for name, point in value.items():
                        before = anchors.get(name)
                        anchors[name] = [round(float(point[0]), 1), round(float(point[1]), 1)]
                        if anchors[name] != before:
                            was.setdefault(name, before)
                        applied.append(f"{char}/{key}.anchors.{name}: {before} -> {anchors[name]}")
                    if not was:
                        meta["edited"].pop("anchors")
                        if not meta["edited"]:
                            meta.pop("edited")
                    continue
                before = meta.get(field)
                meta[field] = value
                applied.append(f"{char}/{key}.{field}: {before} -> {value}")
                # `bodyH` is a RENDERED height — the drawing's own height times
                # renderScale — so resizing a frame and leaving it alone makes
                # the manifest say the pose is a size it is not. It went unseen
                # while the edits were nudges; round 21 moved Maki's walk by a
                # third and left `bodyH` claiming she stands 1.6x her idle.
                #
                # Nothing on screen reads it (heights.js prefers the measured
                # `bodyTop` span, which is live), but auto_tune.py compares
                # every pose's bodyH against the idle's to find scale outliers —
                # so a stale one is a future pass "correcting" a size somebody
                # chose by eye. Scaling it by the same ratio is exact.
                if field == "renderScale" and meta.get("bodyH") and before:
                    was = meta["bodyH"]
                    meta["bodyH"] = round(was * (float(value) / float(before)), 1)
                    applied.append(f"{char}/{key}.bodyH: {was} -> {meta['bodyH']}"
                                   " (follows renderScale)")
            # Retuning a pose whose art was just replaced is exactly what the
            # updated list asks for, so the marker comes off with the work. A
            # surfaced pose leaves by the same door: `edited` now records it as
            # tuned, which is what put it on the list for lacking.
            #
            # Flagging is NOT that work. Saying "this drawing has to be redrawn"
            # answers a different question from "this drawing is placed", and a
            # flag-only export used to take the pose off the list while nobody
            # had sized or grounded anything — the art still needs placing, and
            # a request can sit open for rounds. So the marker comes off only
            # when a placement field moved; `clearUpdated` remains the way to
            # say "looked at, nothing to do".
            placed = any(f in PLACEMENT_WORK for f in changes)
            if placed and (meta.pop("replaced", None) or meta.pop("surfacedReviewed", None)):
                applied.append(f"{char}/{key}: off the updated list (adjusted)")
            if clear_fresh(man, char, key):
                applied.append(f"{char}/{key}: alternate no longer marked new")

        # Poses reviewed as they stand: the new art needed nothing, so the only
        # thing to record is that someone looked. An intake marker is removed; a
        # surfaced pose has none to remove, so the looking is what gets written.
        for key in (payload.get("clearUpdated") or []):
            meta = frames.get(key)
            if meta is None:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            if clear_fresh(man, char, key):
                applied.append(f"{char}/{key}: alternate no longer marked new")
            if meta.pop("replaced", None):
                applied.append(f"{char}/{key}: off the updated list (reviewed)")
            elif not meta.get("surfacedReviewed"):
                meta["surfacedReviewed"] = True
                applied.append(f"{char}/{key}: off the updated list (reviewed as drawn)")
            else:
                skipped.append(f"{char}/{key}: already off the updated list")

    for line in applied:
        print("  " + line)
    if tagged_delete:
        # A DELETE TAG IS AN INSTRUCTION, NOT A NOTE. It used to be written here
        # and left: the tag sat in the manifest, list_replacements collected it,
        # and it surfaced in docs/image-requests.md as an image somebody was
        # owed — which is the opposite of what it says. Fifty-six of them had
        # accumulated that way. The tool that carries it out is one line, and
        # it is the line that goes out with the tag.
        #
        # Not run automatically from here: this tool is fed by hand-edited
        # exports as readily as by the workbench, and a paste that deletes
        # artwork as a side effect is not a paste anybody can review. It also
        # refuses to touch anything the game is still drawing, so running it is
        # safe — but running it is a decision.
        chars = " ".join(sorted(tagged_delete))
        print(f"  delete tag(s) written — carry them out: node ../tools/apply_deletions.mjs "
              f"{chars}   (add --apply once the plan reads right)")
    if remeasure:
        print("  measured spans dropped where a pose changed drawing — "
              f"run: python3 bake_anchors.py --only {' '.join(sorted(remeasure))}")
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
