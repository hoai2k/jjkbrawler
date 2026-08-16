// HOW THE CROUCH SITS ON THE FLOOR — one re-orientation, shared.
//
// THE PROBLEM, precisely. The crouch is the one state the engine does not take
// as authored. `pose.js levelFeet` PITCHES the whole body about the fighter's
// lateral axis until the trailing foot comes down, because the pose it is
// given — a sprinter's three-point set — is drawn with that foot in the air
// and a fighter hanging one leg reads as floating. The tilt is solved per rig
// and it does what it says. What it does not do is stop at a body attitude
// anybody chose: the solve swings the trunk from about 25° forward of vertical
// to about 25° BEHIND it, and a crouch leaning backwards with its legs out in
// front reads as a fighter sitting down in mid-air. That is the same wrong
// rotation on every fighter, because it is one solve run against one pose.
//
// So this is the correction on top: a body attitude for the crouch, authored
// rather than solved, applied after the settle and re-grounded.
//
// WHY IT IS PER GROUP RATHER THAN PER FIGHTER. The tilt is not a fact about
// any one delivery — it is the same pose through the same solver, so one
// number fixes the whole roster. But the crouch path is not literally the same
// for everybody, and the places it forks are the places a shared number stops
// applying:
//
//   `roster`   the baseline `crouch` intent (the pose brief's deep squat),
//              shown at the crouch's own presentation angle. Everybody not
//              named below.
//   `yuji`     the only fighter with a MATCHED crouch: his sheet draws a
//              sprinter's three-point set and battle_poses.js follows it
//              (`crouch_a`/`crouch_b`), which is a different body from the
//              squat everyone else stands in. Different pose, different tilt.
//
// SUKUNA USED TO BE A THIRD, and the reason he no longer is says what a group
// is FOR. He carries the roster's one per-character presentation pin
// (`PRESENT_DEG.sukuna`, pose.js), and while that pin overruled a state's own
// angle he really was seen from somewhere else — 68° against the crouch's 80°
// — so an attitude dialled by eye on everybody else did not transfer to him,
// and his entry had picked up 22° of roll and 9° of yaw compensating for it.
// The pin is a floor rather than an override now: the crouch has an angle of
// its own, so it wins, and Sukuna's crouch is shown at exactly the same angle
// as everyone else's. Same pose, same solve, same view — so the same number,
// and a group of one that says nothing is worse than no group at all.
//
// A group is a FORK IN THE PATH, not a fighter somebody wants to nudge. The
// check next door (tools/check_battle_poses.mjs) holds the line: a fighter who
// grows a matched crouch fails the build until they are given a group here,
// and so does anyone who takes the crouch's own presentation angle away, which
// is what would let the pins start diverting it again.
//
// THE ANGLES are degrees in the fighter's own frame, the same convention the
// pose libraries use and in the same order:
//
//   pitch  +  tips the body FORWARD over its toes (− sits it back)
//   roll   +  tips it toward the fighter's own right
//   yaw    +  turns the body toward its own left, about the world's up
//
// and they are applied to the HIPS — the whole body, every authored joint
// angle untouched — after `levelFeet` has settled it and before the fighter is
// re-planted on the floor. Rotating the body is exactly what the solver did;
// this says where it should have stopped.

/** The one fighter with a matched (drawn) crouch rather than the baseline. */
const MATCHED_CROUCH = "yuji";

/**
 * The correction each group carries.
 *
 * `roster` is the estimate: the solve leaves the trunk about 25° behind
 * vertical, and standing it back up over the feet is most of what a crouch
 * needs to read as one. `yuji` starts from the same number because the same
 * solver is under it — it is a separate ENTRY rather than a separate value so
 * that the review has somewhere to put a different answer for a crouch that is
 * a different pose, which is what the bench's "Crouch orientation" queue is
 * for.
 */
export const CROUCH_ORIENT = {
  "roster": { pitchDeg: 15, rollDeg: 0, yawDeg: 0 },
  "yuji": { pitchDeg: 15, rollDeg: 0, yawDeg: 0 },
};

/** A correction past this is not an attitude, it is a different pose. */
export const CROUCH_ORIENT_LIMIT = 60;

/** The states this reaches. `crouch` is the clip name (states.js clipNameFor),
 *  so the crouch attack — which is its own clip — is deliberately not in it:
 *  it is a lunge out of the set, not a held crouch, and it does not go through
 *  levelFeet either. */
export const CROUCH_ORIENT_STATES = new Set(["crouch"]);

/** Which group a fighter's crouch belongs to. Total: everyone lands somewhere. */
export function crouchGroupOf(charKey) {
  if (charKey === MATCHED_CROUCH) return MATCHED_CROUCH;
  return "roster";
}

/** Every group, with what makes it its own path — the bench prints these so a
 *  reviewer knows what they are approving for whom. */
export const CROUCH_GROUPS = {
  roster: {
    label: "Everyone else",
    why: "the baseline crouch (the brief's squat) at the crouch's own presentation angle",
  },
  [MATCHED_CROUCH]: {
    label: "Yuji",
    why: "the only MATCHED crouch — his sheet draws a sprinter's three-point set, "
      + "so the body being tilted is a different body",
  },
};

/** Clamp one angle to something a body attitude can be. */
const clampAngle = (deg) => {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-CROUCH_ORIENT_LIMIT, Math.min(CROUCH_ORIENT_LIMIT, n));
};

/** A whole orientation, clamped, with every field present. */
export function clampCrouchOrient(o) {
  return {
    pitchDeg: clampAngle(o?.pitchDeg),
    rollDeg: clampAngle(o?.rollDeg),
    yawDeg: clampAngle(o?.yawDeg),
  };
}

/**
 * A LIVE OVERRIDE, for the bench and nothing else: `{ group: orientation }`.
 *
 * The same door `POSE_LIBRARY_CLIPS` in loader.js opens — a dial the review
 * turns while looking at a fighter, which the game itself never sets. Nothing
 * here is persisted: a decision reaches the game by being exported from the
 * bench, applied to CROUCH_ORIENT above and committed, exactly like every
 * other answer that queue produces.
 *
 * The pose cache does not key on it, so a caller that moves it has to drop the
 * cache (scene.clearCache) or keep being served the old attitude.
 */
export const CROUCH_ORIENT_EDIT = { groups: null };

/** The correction for one fighter, never null. `overrides` lets a caller pass
 *  a value in directly; failing that the live edit wins, then the table. */
export function crouchOrientFor(charKey, overrides = null) {
  const group = crouchGroupOf(charKey);
  const live = CROUCH_ORIENT_EDIT.groups?.[group];
  return clampCrouchOrient(overrides?.[group] || live || CROUCH_ORIENT[group]);
}

/** Does this orientation ask for anything? */
export const isIdentityOrient = (o) => !o || (!o.pitchDeg && !o.rollDeg && !o.yawDeg);
