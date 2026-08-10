// Two-bone IK: make the strike actually reach where it was aimed.
//
// `applyAim` (renderer.js) pitches the spine toward the target, which reads as
// "leaning into it" — but the hand still lands wherever the clip put it, so an
// opponent on a platform above gets swung at, not hit. This closes that gap:
// the striking limb's shoulder and elbow are solved so the HAND arrives at the
// target point. That is the difference between a clip that gestures at an
// angle and a fighter who attacks at any angle.
//
// It is also the answer to the other half of the sprite pipeline's cost. A
// pose that reads wrong on a sprite is an asset request, a redraw and an
// approval pass (rounds 6, 12A, 13, 14 and 17 were largely that). A pose that
// reaches wrong here is a number.
//
// ---------------------------------------------------------------------------
// HOW IT SOLVES
//
// Analytic, not iterative: with two bones and a target the triangle is closed
// form, so there is no convergence to tune and no per-frame cost worth caching
// around. Law of cosines gives the shoulder and elbow angles; the bend PLANE
// comes from where the clip already had the elbow, so the animator's intent
// survives — a hook and a straight jab keep their different elbow carriage
// while both landing on the target.
//
// Reach is clamped to the arm's actual length. A target further away than the
// limb can reach straightens the limb toward it rather than dislocating it,
// which is both correct and what a real strike at maximum range looks like.
//
// WEIGHT. IK ramps in over the second half of the wind-up and holds at full
// through the contact beat, so the clip owns the anticipation and the solver
// owns the arrival. Snapping to the target on frame one would flatten every
// wind-up in the game into the same straight-line poke.

import { STATES, clipNameFor } from "./states.js";

/** Which limb reaches, per state: [root, mid, end] bone names.
 *
 *  Arms for punches, the lead leg for the aerial (the default set kicks with
 *  the left). A state absent here does not solve at all — locomotion must
 *  never chase a target, or a running fighter would grope at their opponent. */
const ARM_R = ["RightArm", "RightForeArm", "RightHand"];
const LEG_L = ["LeftUpLeg", "LeftLeg", "LeftFoot"];

export const REACH = {
  light: ARM_R,
  sideHeavy: ARM_R,
  upHeavy: ARM_R,
  downHeavy: ARM_R,
  crouchAttack: ARM_R,
  specialNeutral: ARM_R,
  specialSide: ARM_R,
  airLight: LEG_L,
};

export function reaches(state) {
  return !!REACH[clipNameFor(state)];
}

/** How much of the solve is blended in at `t` seconds into the clip: nothing
 *  through the first part of the wind-up, smoothly to full by the contact
 *  beat, held after so the follow-through stays on target. */
export function reachWeight(state, t) {
  const spec = STATES[clipNameFor(state)];
  if (!spec?.beat) return 1;
  const start = spec.beat * 0.4;
  if (t <= start) return 0;
  if (t >= spec.beat) return 1;
  const u = (t - start) / (spec.beat - start);
  return u * u * (3 - 2 * u);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Turn `bone` so the child point it currently aims at ends up aiming at
 *  `wantWorld`. Works in world space and converts back through the parent, so
 *  it composes with whatever the clip and the spine aim already did. */
function aimBoneAt(THREE, bone, bonePos, childPos, wantWorld, tmp) {
  const cur = tmp.v1.subVectors(childPos, bonePos);
  const want = tmp.v2.subVectors(wantWorld, bonePos);
  if (cur.lengthSq() < 1e-12 || want.lengthSq() < 1e-12) return;
  cur.normalize();
  want.normalize();
  const delta = tmp.q1.setFromUnitVectors(cur, want);
  const world = bone.getWorldQuaternion(tmp.q2);
  const parentWorld = bone.parent ? bone.parent.getWorldQuaternion(tmp.q3) : tmp.q3.identity();
  // local = parentWorld⁻¹ · (delta · world)
  bone.quaternion.copy(parentWorld.invert().multiply(delta.multiply(world)));
  bone.updateMatrixWorld(true);
}

/**
 * Solve the limb so `end` lands on `targetWorld`.
 *
 * Returns false when the chain is missing or degenerate — the caller keeps the
 * clip's pose, which is always a drawable one.
 */
export function solveTwoBone(THREE, root, mid, end, targetWorld, tmp) {
  root.updateWorldMatrix(true, true);
  const rootPos = tmp.p1.setFromMatrixPosition(root.matrixWorld);
  const midPos = tmp.p2.setFromMatrixPosition(mid.matrixWorld);
  const endPos = tmp.p3.setFromMatrixPosition(end.matrixWorld);

  const l1 = midPos.distanceTo(rootPos);
  const l2 = endPos.distanceTo(midPos);
  if (l1 < 1e-6 || l2 < 1e-6) return false;

  const toTarget = tmp.v3.subVectors(targetWorld, rootPos);
  const rawDist = toTarget.length();
  if (rawDist < 1e-6) return false;
  // Clamped into the range the triangle can actually close: further than the
  // limb reaches straightens it, closer than it can fold stops at the fold.
  const d = clamp(rawDist, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dir = tmp.v4.copy(toTarget).normalize();

  // The bend plane: keep the elbow where the clip put it. Its offset from the
  // root-to-target line is the pole vector, so a solve preserves the pose's
  // own elbow carriage instead of imposing one.
  const pole = tmp.v5.subVectors(midPos, rootPos);
  let axis = tmp.v6.crossVectors(dir, pole);
  if (axis.lengthSq() < 1e-10) {
    axis.crossVectors(dir, tmp.v5.set(0, 0, 1));
    if (axis.lengthSq() < 1e-10) axis.crossVectors(dir, tmp.v5.set(0, 1, 0));
  }
  axis.normalize();

  const rootAngle = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const upperDir = tmp.v7.copy(dir).applyAxisAngle(axis, rootAngle);
  const wantMid = tmp.p4.copy(rootPos).addScaledVector(upperDir, l1);

  aimBoneAt(THREE, root, rootPos, midPos, wantMid, tmp);

  // Second bone: with the elbow placed, point the forearm at the target. The
  // segment length is fixed, and d was clamped to something reachable, so the
  // hand lands on target rather than merely toward it.
  mid.updateWorldMatrix(true, true);
  const midPos2 = tmp.p5.setFromMatrixPosition(mid.matrixWorld);
  const endPos2 = tmp.p6.setFromMatrixPosition(end.matrixWorld);
  aimBoneAt(THREE, mid, midPos2, endPos2, targetWorld, tmp);
  return true;
}

/** Scratch vectors and quaternions, allocated once. This runs inside the pose
 *  step for every attacking fighter, and per-frame allocation there is how a
 *  smooth renderer acquires a stutter. */
export function makeScratch(THREE) {
  return {
    v1: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(),
    v4: new THREE.Vector3(), v5: new THREE.Vector3(), v6: new THREE.Vector3(),
    v7: new THREE.Vector3(),
    p1: new THREE.Vector3(), p2: new THREE.Vector3(), p3: new THREE.Vector3(),
    p4: new THREE.Vector3(), p5: new THREE.Vector3(), p6: new THREE.Vector3(),
    q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), q3: new THREE.Quaternion(),
    // Dedicated: the solver reuses p1-p6 internally, so the effective target
    // needs a slot it cannot clobber mid-solve.
    eff: new THREE.Vector3(),
    saved: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
  };
}

/**
 * Solve the reaching limb for `state` toward `targetWorld`, blended by the
 * state's weight ramp. No-op for states that do not reach, rigs missing the
 * chain, or weight 0.
 */
export function applyReach(THREE, root3d, state, clipT, targetWorld, tmp) {
  const chain = REACH[clipNameFor(state)];
  if (!chain) return false;
  const weight = reachWeight(state, clipT);
  if (weight <= 0) return false;

  const bones = chain.map((n) => root3d.getObjectByName(n));
  if (bones.some((b) => !b)) return false;

  // Re-aim the strike; do not re-LENGTHEN it.
  //
  // At fighting range the opponent is metres away and a limb reaches half a
  // metre, so solving straight at them would straighten every limb to full
  // stretch on every blow — a jab, a hook and a lunge all collapsing into the
  // same rigid poke. What the clip already says is how far this attack
  // extends; the target only says which way. So the effective target sits at
  // the clip's OWN reach distance along the direction to the aim point, and
  // pulls in closer when the opponent is nearer than the strike would extend
  // (nobody punches through a body).
  //
  // Because that distance is always inside the limb's range, the solve is
  // exact rather than clamped: the hand lands on the point, every time.
  bones[0].updateWorldMatrix(true, true);
  const rootP = tmp.p1.setFromMatrixPosition(bones[0].matrixWorld);
  const endP = tmp.p2.setFromMatrixPosition(bones[2].matrixWorld);
  const clipReach = endP.distanceTo(rootP);
  const toAim = tmp.v3.subVectors(targetWorld, rootP);
  const aimDist = toAim.length();
  if (aimDist < 1e-6 || clipReach < 1e-6) return false;
  const effective = tmp.eff
    .copy(rootP)
    .addScaledVector(toAim.multiplyScalar(1 / aimDist), Math.min(aimDist, clipReach));

  // Blend by remembering the clip's pose and easing toward the solved one:
  // solving at full strength from the first frame would erase the wind-up.
  for (let i = 0; i < 3; i++) tmp.saved[i].copy(bones[i].quaternion);
  if (!solveTwoBone(THREE, bones[0], bones[1], bones[2], effective, tmp)) {
    for (let i = 0; i < 3; i++) bones[i].quaternion.copy(tmp.saved[i]);
    return false;
  }
  if (weight < 1) {
    for (let i = 0; i < 3; i++) {
      const solved = tmp.q1.copy(bones[i].quaternion);
      bones[i].quaternion.copy(tmp.saved[i]).slerp(solved, weight);
    }
    bones[0].updateMatrixWorld(true);
  }
  return true;
}
