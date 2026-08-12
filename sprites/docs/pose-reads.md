# Pose reads — what each sprite frame says the body is doing

A **pose read** is sixteen joints written down for one drawing: head, neck,
chest, pelvis, and a shoulder/elbow/hand and hip/knee/foot for each side. One
file per character in [`pose-reads/`](pose-reads/), keyed by frame name.

It exists because the 3D fighters need to know what their own art does, and
because *describing* a pose does not work. A description can be vague and
still sound right; a stick figure with the elbow in the wrong place is visibly
wrong. So a read is coordinates, it is drawn back over the drawing it came
from, and the overlay is the test.

```
sprites/docs/pose-reads/<char>.json     the reads
render3d/workbench/?edit=pose           the editor — drag joints, watch the rig
tools/pose_seed.py                      seeds a character from the read reference
tools/pose_apply.py                     puts an editor export back in the tree
tools/pose_contact_sheet.py <char>      the sheet, and --check
tools/check_pose_reads.mjs              runs in `npm run check`
```

## The three things a read has to get right

**Orientation.** A read describes the frame as the **engine draws it**, not as
the PNG is stored. Frames the sprite manifest marks `faceLeft` (or lists under
`nativeLeft`) were delivered facing left and are mirrored at blit time; every
tool here mirrors them first. Yuji's `hurt` is one of them, and reading the raw
file recorded him snapping his head back in the direction he was facing.

**Sides.** Joints are the **character's own** left and right, never the
screen's. Facing right, the camera sits off the fighter's right shoulder, so
the RIGHT limb is the near one and the LEFT limb is the far one drawn behind
the body. Sided names survive a mirror; "near" and "far" do not, and a rig
posed from near/far data throws a left-handed punch on half the roster.

**The cell.** Coordinates are percentages of the frame's own square cell — the
frame scaled so its long side fills a square, centred, x rightwards, y
downwards, 0–100 both ways. Frames differ wildly in aspect (a prone drawing is
939×208, an idle 423×1497); the cell is what makes one read comparable with
another, and what the editor and the contact sheet both lay out in.

## The editor

`node server.mjs`, then
[`/render3d/workbench/?edit=pose`](../../render3d/workbench/).

Pick a character, pick a frame from the grid, drag the joints onto the drawing.
Dragging a joint carries everything below it in the chain (shift-drag moves the
one joint); arrow keys nudge; **Snap to art** pulls stray joints onto the
nearest ink; ⌘Z undoes. Beside the plate the character's **own 3D rig** takes
the pose, each bone swung in the drawing's plane to match — which is where a
read that looked fine flat turns out to bend a knee backwards.

Edits live in the browser until you press **Download this character** (or
**All edited**, for a session that touched several). Send the file on and
`python3 tools/pose_apply.py <file>` puts it back in the tree in canonical
format, checking joint completeness, frame names and ranges on the way in.

Two limits worth knowing while you work:

  * **Depth is not in a read.** The sagittal plane is all a side-on drawing
    gives. The preview therefore leaves the third axis at rest, so it is a
    check on the read, not a finished clip.
  * **The hips do not move.** The preview swings bones; it does not translate
    the root or plant the feet, so a deep lunge reads shallower in 3D than in
    the art.

## What is read, and what is only seeded

| | |
|---|---|
| **Read by eye** | `yuji` — all 40 frames, each checked against the art |
| **Fitted seeds** | every other character, 1237 frames, from `tools/pose_seed.py` |

A seed is Yuji's read of the same-named frame, fitted to this character's own
ink bounding box and pulled onto the drawing. It works as a starting point
because every sheet was drawn to one brief ([`pose-brief.md`](pose-brief.md)),
so `crouch_a` means the same thing everywhere; it is only a starting point
because the bodies do not match — Panda, Jogo and Mahoraga are not built like a
teenage boy, and their seeds show it. Every seeded pose carries a `seed` stamp
that the editor displays and that disappears the moment a human moves a joint.

## Is a read accurate enough to author from?

On the character that has been read properly: in the drawing plane, yes.
`python3 tools/pose_contact_sheet.py yuji --check` measures every joint to the
nearest opaque pixel and all 640 land on the art; at overlay the figure tracks
hip height, knee bend, stance width and reach closely enough to build a clip
from. Out of plane, no — which limb is nearer, and how far a fist travels
toward camera, is inference from overlap and shading, and needs a human.

The failure mode is not a wrong limb but a *plausible* one: a fist placed on
the sleeve instead of the fist, an elbow slid along a forearm. Those survive
prose and die under the overlay, which is why the sheet draws rather than
describes.

## What Yuji's read found

Six of his frames carry no pose another frame does not already carry:
`special_down` is the idle with a wisp of aura, `ult_a` and `ult_b` are
skeletally the heavy's contact frame, `idle_b` and `attack_light_b` repeat
their partners. `attack_heavy_a` is the only true anticipation drawing on the
sheet — everything else labelled `_a`/`_b` is two contacts, not wind-up and
strike. All six run frames lead with the same leg, so the sheet is one
half-cycle and the other half must be mirrored, which is already how it is
built (`mirrorClips` in [`clips.js`](../../billboards/src/clips.js)).

### Where Yuji disagrees with the pose audit

[`sprite-pose-audit.md`](../../billboards/docs/sprite-pose-audit.md) set the
default poses from full sheets for Choso, Yuki and Nanami. Five of its verdicts
do not describe what Yuji is drawn doing:

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
before it stands in for that fighter's clip. The reads are that check, and the
editor is how the rest of the roster gets one.

## Nothing here changes what the game draws — yet

The reads are upstream data. No clip table, rig manifest or default pose reads
them, so a wrong seed cannot make a fighter pose wrongly in a match. Wiring
them into the clip tables is the step after a character's reads are finished
and reviewed.
