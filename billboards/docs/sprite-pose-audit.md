# The sprite-pose audit — defaults matched to the art, flip-safe

An audit of every animation state's DEFAULT pose against what the sprite
roster actually draws, and the fixes it produced. The reference was the art
itself — full 36-pose sheets reviewed for Choso, Yuki and Nanami (an unarmed
male, an unarmed female, a weapon fighter), cross-checked against the standing
brief every sheet was drawn to ([sprites/docs/pose-brief.md](../../sprites/docs/pose-brief.md)).

Two pose tables feed the 3D paths, and the audit fixes landed in both:

| Table | Who plays it | Where |
|---|---|---|
| The runtime default set | mannequins, and any rig/state without a delivered clip (resolution step 4 in loader.js) | `render3d/src/mannequin.js` |
| The Blender authoring vocabulary | baked into every delivered `.glb`'s own clips at intake | `tools/blender_author_clips.py` |

The delivered roster carries baked clips for all 26 states, so the
`blender_author_clips.py` fixes reach players **at the next re-bake**
(`blender --background --python tools/blender_author_clips.py`, per rig,
through the usual intake review). The mannequin.js fixes are live immediately
anywhere the default set draws.

## Verdicts, state by state

States not listed matched their sprite read and were left alone (idle, run,
dash, guard/shield, charge, the strike set — whose reads the tables already
took from the sprites — prone, win, specials, ult).

| State | The sprite read | Verdict | Fix |
|---|---|---|---|
| `ledge` | BOTH hands raised overhead on the grip, body straight below, feet dangling, toes pointed | mannequin.js hung one arm high and one half-raised — read as a wave | both arms overhead, legs dangling (mannequin.js; the Blender table already had both arms up) |
| `dodge_air` | a TWIST out of the line of the blow, knees drawn to one side, limbs pulled in | both tables reused the roll's tucked ball; only the roll spins (motion.js), so the two evades were indistinguishable | its own `air_twist` pose in both tables, hips-drop eased to match |
| `crouch` | a real squat: hips at heel height, thighs closer to horizontal than vertical, head down a quarter of standing height (pose brief §3 — this is measured on sprite deliveries) | both tables held a half-bend that the brief itself calls "a standing fighting stance" | thighs near horizontal, shins near vertical, hip drop 0.16→0.23 (mannequin) / 0.16→0.22 (Blender); the crouch-attack poses inherit it |
| `jump` | stretched upward, legs still extending, arms rising | mannequin.js tucked into a ball at the apex — read as the dodge | asymmetric knee-drive `jump_peak`, body kept stretched. The Blender table keeps its arms-down rise deliberately (its comment: overhead arms made jump and fall the same silhouette) — left as is |
| `fall` | legs gathered under the body, arms out for balance | mannequin.js splayed the legs fore-aft with arms high overhead | knees bent under, arms lowered (mannequin.js; Blender's fall already matched) |
| `land` | a deep asymmetric absorb, ONE HAND dropped toward the floor | both tables absorbed symmetrically — read as a second crouch | one hand toward the floor, the other back for balance, in both tables |
| `dizzy` | a forward SLUMP: guard gone, arms dangling loose, head lolling | both tables swayed upright with arms at rest — an idle with a head-shake | forward slump, dangling arms, bigger head loll, in both tables |
| `hurt` | head snapped back, body compressed, arms THROWN OUT | both tables kept the arms half-guarded | arms flung wide, in both tables |

## Flip resilience — keeping a pose's read when the model changes direction

Facing never edits pose data. The render3d backend faces left by yawing the
whole rig (`pose.js` turnaround — the yaw goes on first, so aim and reach
solve in the turned frame); sprites and billboards mirror at blit time. Either
way, the clip itself stays right-handed and aim-neutral.

What WAS missing is the pose itself changing hands without losing its read —
a model delivered mirrored against the spec, a left-handed identity playing
the shared right-handed library. That is now one shared transform,
`mirrorPose`/`mirrorKeys`/`mirrorClip` in `render3d/src/clips.js`: a
reflection across the character's own sagittal plane — sided bones swap,
sagittal rotation (the part that faces) carries over, yaw and roll negate,
hip heights and timing untouched. A mirrored punch extends exactly as far
forward with the other fist, and mirroring twice is the identity. The run
cycle's second half is now built with the same transform, so the guarantee is
exercised by every fighter on screen.

Both rig registries expose it in the manifest, on top of whatever clip
resolution answered:

```json
"characters": {
  "example": {
    "mirrorClips": true,              // whole-rig flip: every state changes hands
    "clips": { "light": { "mirror": true } }   // per-state; under mirrorClips it EXEMPTS the state
  }
}
```

`tools/smoke_pose_mirror.mjs` (pure Node, no browser) holds the line: every
default clip builds, loops close, contact beats are exact samples, mirroring
is an involution, and — posed on the real mannequin skeleton — a mirrored
clip's hands land at the original's reflected across the sagittal plane with
forward reach preserved to a millimetre. If a refactor ever bakes facing into
pose data, that is the check that goes red.
