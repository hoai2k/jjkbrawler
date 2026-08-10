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
looks much the same from any angle. Now −135°, which puts forward across the
screen in three-quarter, and it fixed the mannequin too.

## What made the clips work

Poses are authored as **world-space bone directions**, not Euler angles
(`tools/blender_author_clips.py`). Angles are relative to a rest pose and do not
survive a rig that rests differently — which is the whole A-pose failure above.
A direction ("upper arm forward and a little down, forearm straight forward" is
a punch) lands correctly on a T-pose rig, an A-pose rig and the mannequin
alike, and it is what let one pose vocabulary serve all 26 states.

## Still owed

- **Validator checks for the two nonconformances.** Bind pose and facing are
  both machine-checkable and both cost a full review round here.
- **Silhouette match.** Yuji reads slightly slighter than his sprite. Gameplay
  is unaffected — hurtboxes stay sprite-derived on every backend — but the
  workbench ghost is the place to close it.
- **`fall` reads close to arms-up.** Distinct from `jump` now, but not the
  braced shape it wants.
- **The clips are stand-ins, not performances.** They are correctly timed,
  correctly aimed and on-model in silhouette; they are not animation. B2's
  shared library is where craft replaces correctness.
