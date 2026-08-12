# Reading Yuji's poses off the art — and checking the read

Can a pose be read out of a sprite accurately enough to author animation from?
This is that question answered on one fighter, with the working shown.

Every frame in `sprites/assets/yuji/` — 40 of them — was read by eye into
sixteen joints, and each read was drawn back as a mannequin **over the drawing
it came from**. A prose pose description can be vague and still sound right; a
stick figure with the elbow in the wrong place is visibly wrong. The overlay is
the check.

| | |
|---|---|
| The read | [`yuji-pose-read.json`](yuji-pose-read.json) — 16 joints and a written read per pose, plus flags |
| The sheet | [`yuji-pose-contact-sheet.html`](yuji-pose-contact-sheet.html) — open it in a browser; overlay / mannequin / sprite |
| The renderer | [`tools/pose_contact_sheet.py`](../../tools/pose_contact_sheet.py) — `python3 tools/pose_contact_sheet.py yuji` |
| The check | `python3 tools/pose_contact_sheet.py yuji --check` |

Coordinates are percentages of the frame's own square cell: the frame scaled so
its long side fills the square, centred. `f` is the far limb, `n` the near one.
Yuji faces right in every frame.

## Is it accurate enough?

**In the drawing plane, yes.** All 640 joints land on the art (`--check`
measures the distance from each joint to the nearest opaque pixel and reports
anything over 2% of the cell; it reports nothing). At overlay the figure tracks
the drawing closely enough to take hip height, knee bend, stance width and
reach from — the quantities a clip is actually built out of.

**Out of plane, no.** Depth is guessed. Which arm is nearer, and how far a fist
travels toward camera, comes from overlap and shading, not measurement. A read
like this can set a 3D clip's sagittal pose; the third axis still needs a human.

The honest failure mode is not a wrong limb but a *plausible* one — a fist
placed on the sleeve instead of the fist, an elbow slid along a forearm. Those
survive prose and die under the overlay, which is the whole reason the sheet
draws rather than describes.

## What the read found

Six frames carry no pose that another frame does not already carry:
`special_down` is the idle with a wisp of aura, `ult_a` and `ult_b` are
skeletally the heavy's contact frame, `idle_b` and `attack_light_b` repeat
their partners. `attack_heavy_a` is the only true anticipation drawing in the
sheet — everything else labelled `_a`/`_b` is two contacts, not wind-up and
strike.

All six run frames lead with the same leg, so the sheet is one half-cycle and
the other half must be mirrored. That is already how it is built
(`mirrorClips` in [`billboards/src/clips.js`](../../billboards/src/clips.js)).

## Where Yuji disagrees with the pose audit

[`billboards/docs/sprite-pose-audit.md`](../../billboards/docs/sprite-pose-audit.md)
set the default poses from full sheets for Choso, Yuki and Nanami. Five of its
verdicts do not describe what Yuji is drawn doing:

| State | The audit's default | What Yuji's sheet draws |
|---|---|---|
| `crouch` | a deep squat, thighs near horizontal | a sprinter's **three-point stance** — a hand planted on the floor, rear leg stretched back. `crouch_attack_a`/`_b` lunge out of it |
| `ledge` | both arms overhead on the grip | hangs from **one** arm, the other at his side |
| `land` | one hand dropped toward the floor | **both** hands reach forward and down |
| `dizzy` | a forward slump, head lolling | tips **backward**, chin up, arms dead at the sides |
| `jump` | stretched upward, legs still extending | knees **already tucked** at the rise |

`hurt` is a near miss rather than a contradiction: the audit flung the arms
wide, and Yuji's arms hang loose — the reaction lives in the arched spine.

None of this makes the audit wrong. It sampled three fighters and applied the
result to all of them, and Yuji is drawn differently. The conclusion is about
scope: a default pose set derived from a sample needs a per-fighter check
before it stands in for that fighter's clip, and this sheet is what that check
looks like. It runs on any fighter with a pose read — the tool takes the
character name.
