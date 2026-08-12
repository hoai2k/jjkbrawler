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

`render3d/assets/canon-palette.json` now declares, per fighter, the costume
regions that have a canon colour and where they belong;
`tools/blender_grade_texture.py` moves them there. It REMAPS rather than
repaints — the region's median value lands on target and every other pixel
scales with it through a soft shoulder — so folds, creases and contact shadow
survive and the garment still reads as cloth. Yuji's uniform went 0.09 → 0.28
at hue 226°, saturation 0.45; the black leggings are excluded by the
saturation floor and the red hood by the hue window. The pass is step 7 of
`blender_conform.py`, is a no-op for a fighter with no palette entry, and is
idempotent, so it is safe inside the pipeline.

**The generator fused his hands to his trousers.** Not a weighting fault — a
TOPOLOGY one. The delivery binds in an A-pose with the hands hanging against
the thighs, and the mesh is one continuous surface across the gap: 282 faces
join hand to leg. Raise the arm and the weld comes with it, a 7 cm strip of
geometry drawn out into a **1.15 metre tube**. That is the "long stick where
his arm should be" on every raised-arm pose, and it is also most of "no arm
reaches out" — the arm was reaching, dragging a tube of trouser behind it.

The rule that caught the weights catches this too, applied to faces instead of
influences: real skin does not connect parts of the body eight joints apart.
`unweld_limbs` deletes those faces. Worst edge stretch on `upHeavy` fell from
**115 cm to 6 cm**. It leaves a small opening where the hand met the trouser,
invisible at game size, and it is a symptom of the T-pose the spec asks for and
this delivery did not supply — a T-pose delivery would not fuse at all.

**Re-authoring silently did nothing.** Authoring clips onto an already-authored
.glb leaves BOTH sets in the file — 52 actions for a 26-state contract — and
the importer suffixes the duplicates, so the game resolved the OLD clip and
every edit appeared to have no effect. `blender_author_clips.py` now clears
existing actions first. The most expensive shape a bug can take is the one
that looks like a no-op.

**The strikes were arms moving in front of a statue.** Each attack keyed the
spine and the striking arm — five bones — and nothing else: no legs, no hips,
no weight shift, and the strike arm aimed 29° DOWNWARD, so the fist finished
near his own hip. They now key fourteen bones, drive off the rear leg with the
heel coming up on contact, and run anticipation -> contact -> hold -> recover
instead of freezing on the impact frame. A torso TWIST layer was added because
aiming a bone can say which way it points but never how it is rolled, and a
punch is mostly roll.

**Aim was continuous when the game's aim is discrete.** A fighting game has an
up attack, a side attack and a down attack; choosing between them IS the
aiming. Letting the solver point a limb anywhere on a 100° arc gave a standing
jab angled at the floor because the opponent happened to be lower. `states.js`
now declares the elevations each attack may be thrown at and snaps to the
nearest, so a grounded arm strike is level and down-diagonal belongs to the
moves that are about going low and to anything thrown in the air. With no aim
at all the target is dead ahead at chest height, at the fighter's own
sprite-measured reach (`artReach`) — so the model's fist lands where the
sprite's does, which is where the hitbox already is.

## Still owed

- **Validator checks for the two nonconformances.** Bind pose and facing are
  both machine-checkable and both cost a full review round here.
- **Silhouette match.** Yuji reads slightly slighter than his sprite. Gameplay
  is unaffected — hurtboxes stay sprite-derived on every backend — but the
  workbench ghost is the place to close it.
- **`fall` reads close to arms-up.** Distinct from `jump` now, but not the
  braced shape it wants.
- **A T-pose re-generation would retire two of these findings.** The A-pose is
  what fused the geometry and what confused the binder. The validator should
  reject a non-T-pose delivery outright rather than repair it downstream.
- **Per-state strike heights could come from the sprites.** Reach already
  does (`artReach`). The contact HEIGHT of each attack is equally measurable
  from the sprite's painted extremity and is currently a hand-written
  elevation per state.
- **`sideHeavy` may still be over-cranked.** Softened once from 40° of hip
  rotation to 26° after it read as falling over; worth another look in motion.
- **The clips are stand-ins, not performances.** They are correctly timed,
  correctly aimed and on-model in silhouette; they are not animation. B2's
  shared library is where craft replaces correctness.
