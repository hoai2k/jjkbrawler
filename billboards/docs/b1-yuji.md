# Round B1 — what the pilot found

Yuji plays as a model on `?render=billboard` and `?render=3d`, in a real match,
beside twenty-six sprite fighters. That was the point of doing one fighter
before commissioning twenty-eight: everything below is a *pipeline* fault, and
every one of them would have been paid for twenty-eight times.

## The delivery did not match the spec, in two ways nobody could see

**Bind pose.** The spec says T-pose. The generated rig arrived in an A-pose,
arms hanging down. Nothing rejected it, and the failure was invisible until it
was animated — the default pose set's neutral exists to bring T-pose arms
*down*, so on an already-down rig it doubled and swung them through the body.

**Facing.** The spec says +Z forward in glTF. The rig faced −Z, so every render
showed his back. This survived a full round of review because the workbench and
the game agreed with each other: both drew him backwards.

Both are now corrected on import (`--face-fix`), and both are checks the
validator should grow — see *Still owed* below.

## Two bugs of our own

**The default pose set was not portable.** Its clips animated `Hips.position`
with absolute mannequin-space values. Replayed on a rig whose hips sit
elsewhere, that teleports the pelvis: crouch, roll and prone came apart. Hip
drop is now a *fraction of rig height* applied relative to rest, which means
the same thing on any body.

**The camera was yawed the wrong way.** At +30° the rig's +Z — the forward the
spec demands — pointed into the lens, so fighters faced the viewer: strides and
punches went into the screen and foreshortened to nothing. It had never been
noticed because the only body available was a featureless grey mannequin, which
looks much the same from any angle.

It then got fixed wrong: −135° put forward across the screen but turned his
BACK to the camera, which is what "he walks backwards and faces away" was. Two
conditions have to hold at once, and eyeballing a 384-pixel figure got one of
them wrong every time, so they are now stated as dot products —
`forward·cameraRight > 0` (faces screen-right) and `forward·(−cameraFwd) > 0`
(front to the lens) — which are `−sin(yaw)` and `cos(yaw)` for a +Z-forward rig,
both positive only between −90° and 0°. **−60°** measures 0.70 across and 0.72
toward: the three-quarter the sprite art is drawn at. `tools/smoke_facing.mjs`
asserts it now, on both backends.

## What made the clips work

Poses are authored as **world-space bone directions**, not Euler angles
(`tools/blender_author_clips.py`). Angles are relative to a rest pose and do not
survive a rig that rests differently — which is the whole A-pose failure above.
A direction ("upper arm forward and a little down, forearm straight forward" is
a punch) lands correctly on a T-pose rig, an A-pose rig and the mannequin
alike, and it is what let one pose vocabulary serve all 26 states.

**The live layers twisted instead of nodding.** Aim pitch, head look-at, flinch
and breath all rotated their bone about its LOCAL X, which is the nodding axis
only if the rig happens to be built that way. Yuji's neck is not: a 0.4 rad
look-at produced 14.8° of pure ROLL and 0.0° of pitch — the head lolling
sideways, which is what "his head rotates in a funny way" was. They now rotate
about the CHARACTER's lateral axis, derived from the rig's own facing and
converted into whatever local frame each bone has
(`characterLateral` / `rotateBoneAboutWorldAxis` in `billboards/src/ik.js`).
Same input now measures 14.8° of pitch, 0° yaw, 0° roll.

**The auto-rigger bound trousers to the hand.** Rotating `RightArm` alone moved
230 vertices whose own dominant bone is `RightUpLeg` — the thigh — by up to
29 cm: "when he lifts his arms he brings part of his pants with him". Worst
single influence was a trouser vertex 50% weighted to `RightHand`.

Proximity cannot catch this, which is presumably why the binder did it: the
delivery binds in an A-pose, so the hands hang beside the hips and the hand
bone is *closer* to those trouser vertices than the spine legitimately is. The
skeleton can. `tools/blender_clean_weights.py` counts joints between a vertex's
dominant bone and each of its other influences and drops anything past four —
hand to thigh is eight, through the whole arm, the whole spine and the pelvis.
It removed 3376 influences on 2604 vertices; the worst arm-driven displacement
below the hips fell from **29 cm to 9.5 cm**, and what remains is chest and
shoulder skin, which is meant to move. The pass is now step 6 of
`tools/blender_conform.py`, so no future delivery carries it, and
`tools/blender_probe_bleed.py` is the measurement.

**The uniform read as black.** It is navy. The cause was not the light rig or
the toon ramp: the baked texture is hue 226° — correct navy — at **9%
brightness**, which is near-black under any lighting. A generator matches a
reference image's hue well and its value badly, because it infers albedo from
pictures that already have shading in them, and navy cloth in shadow
photographs as almost black.

`billboards/assets/canon-palette.json` now declares, per fighter, the costume
regions that have a canon colour and where they belong;
`tools/blender_grade_texture.py` moves them there. It REMAPS rather than
repaints — the region's median value lands on target and every other pixel
scales with it through a soft shoulder — so folds, creases and contact shadow
survive and the garment still reads as cloth. Yuji's uniform went 0.09 → 0.28
at hue 226°, saturation 0.45; the black leggings are excluded by the
saturation floor and the red hood by the hue window. The pass is step 7 of
`blender_conform.py`, is a no-op for a fighter with no palette entry, and is
idempotent, so it is safe inside the pipeline.

## Still owed

- **Validator checks for the two nonconformances.** Bind pose and facing are
  both machine-checkable and both cost a full review round here.
- **Silhouette match.** Yuji reads slightly slighter than his sprite. Gameplay
  is unaffected — hurtboxes stay sprite-derived on every backend — but the
  workbench ghost is the place to close it.
- **`fall` reads close to arms-up.** Distinct from `jump` now, but not the
  braced shape it wants.
- **His shoes are white; canon is red.** The reference sheet has red hi-tops
  and the delivery baked cream ones. It is one more palette region and no new
  code, but it is a bigger move than a value lift (white has no hue to keep)
  and worth eyeballing before committing to it.
- **Every strike is the rear hand.** At the ¾ camera the viewer sees the
  fighter's left flank, so the right arm is the far one and every punch reads
  as a cross. Correct for the heavies; `light` wants to be the lead (left)
  hand, which is a clip change and a `REACH` entry, not a bug.
- **The clips are stand-ins, not performances.** They are correctly timed,
  correctly aimed and on-model in silhouette; they are not animation. B2's
  shared library is where craft replaces correctness.
