// HOW FAR THE GUARD'S ELBOWS ARE OPENED, per fighter.
//
// The guard is the one pose on the sheet whose arms are meant to be IN FRONT
// OF THE FACE, and the tables that describe it are written for one body — a
// 1.75m human with a 45cm chest and hands the size of hands. The roster is not
// that body. Panda is a bear, Dagon is a barrel, Mechamaru is a machine with
// pauldrons, and every one of them takes the same two forearm angles. The
// result is the thing this file exists to answer: a shell whose fists are
// inside the chin and whose forearms are drawn through the cheekbones, which
// at game size reads as a fighter with no hands rather than as a fighter
// covering up.
//
// THE SHARED ESTIMATE IS IN THE TABLES, not here. `battle_poses.js` guard and
// `baseline_poses.js` guard were opened by 16° at the elbow (and the inward
// sweep relaxed with it) against a 1.75m reference skeleton, which puts the
// fists about where the orthodox stance already carries them — 30cm ahead of
// the shoulder line, a hand's width clear of the head. That is the roster
// default and it needs no entry anywhere.
//
// THIS IS THE PER-FIGHTER REMAINDER, and it exists because the right number is
// a judgement about a specific body next to a specific drawing, which is what
// the verification bench's "Guard hands" queue is for. Positive opens the
// elbow further — hands further forward, further from the face; negative
// closes it back toward the tight shell. Zero is the estimate as authored, so
// a fighter nobody has looked at carries no entry at all.
//
// WHAT ONE DEGREE MEANS, because the dial is two rotations and says so:
//
//   ForeArm −x is the elbow hinge. Opening it (toward zero) sends the forearm
//   forward and the fist away from the shoulder, which is the whole move.
//   ForeArm ±z is the inward sweep across the chest — the angle that puts a
//   guard hand on the CHEEK rather than out beside the ear (battle_poses.js
//   says so at the top). Opening the hinge without relaxing that sweep drives
//   the fist further across the face instead of ahead of it, so the two travel
//   together at a fixed ratio and the dial stays one number.
//
// It is applied where the pose is baked into a clip (pose_clips.js), so it
// reaches every state whose frame is a guard — the shield clip and anything
// that borrows it — and nothing else. The arms in the idle and the stance are
// a different pose and are deliberately not touched.

import { intentFor } from "./baseline_poses.js";

/** How much of the elbow's opening is spent relaxing the inward sweep.
 *
 *  Measured on the reference skeleton rather than picked: at this ratio the
 *  fist travels almost straight forward out of the shell — the hand leaves the
 *  cheek and the wrist stays inside the shoulder line, which is a guard. Much
 *  below it the hand opens forward while still crossing the face; much above
 *  it the elbows flare and the shell turns into a shrug. */
const SWEEP_SHARE = 0.7;

/** A dial past this is not an opened guard, it is a different pose — and a
 *  pose is what the libraries are for. Enforced by tools/check_battle_poses.mjs
 *  as well as here, so a bad manifest cannot quietly ship one. */
export const GUARD_OPEN_LIMIT = 40;

/** Is this sprite frame a guard? Asked of the frame NAME through the same
 *  resolver the baseline uses, so `guard`, a hypothetical `guard_a` and any
 *  future frame the intent map sends to the shell all answer yes together. */
export const isGuardFrame = (frame) => intentFor(frame) === "guard";

/** Clamp a dial to something a joint can do. */
export const clampGuardOpen = (deg) => {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-GUARD_OPEN_LIMIT, Math.min(GUARD_OPEN_LIMIT, n));
};

/**
 * The pose with its forearms opened by `deg`, or the pose itself when there is
 * nothing to do.
 *
 * Never mutates its input: the library tables are module-level constants and
 * two characters bake from the same object.
 */
export function openGuardElbows(pose, deg) {
  const d = clampGuardOpen(deg);
  if (!d || !pose) return pose;
  const out = { ...pose };
  for (const bone of ["LeftForeArm", "RightForeArm"]) {
    const angles = pose[bone];
    if (!angles) continue;
    const [x, y, z] = angles;
    // The hinge is negative (a bent elbow), so OPENING it means adding. The
    // sweep is signed per side — inward is + on the right and − on the left —
    // so it relaxes toward zero rather than by a fixed sign.
    out[bone] = [x + d, y, z - Math.sign(z) * SWEEP_SHARE * d];
  }
  return out;
}

/**
 * The dial for one frame of one fighter: the fighter's own opening if the
 * frame is a guard, and nothing at all otherwise.
 *
 * Kept as a function rather than inlined at the call site because "which
 * frames does this reach" is exactly the question a reader of pose_clips.js
 * will have, and it should have one answer.
 */
export function guardOpenFor(frame, deg) {
  return isGuardFrame(frame) ? clampGuardOpen(deg) : 0;
}
