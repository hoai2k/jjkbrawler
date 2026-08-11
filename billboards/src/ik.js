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
import { twoHandGrip, CHARACTER_MORPHS, morphBones } from "./props.js";

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
    // The two-hand solve moves BOTH arms — a second effective target and a
    // second set of saved quaternions so the main arm blends independently.
    eff2: new THREE.Vector3(),
    saved2: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
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

// ------------------------------------------------------------ two-hand grip
//
// A two-handed weapon (props.js TWO_HANDED_KINDS) keeps the OFF hand on the
// shaft. This cannot be authored: the aim pitch and the reach solve move the
// striking arm — and the weapon with it — at pose time, so any clip-space
// left hand placement detaches the moment a strike aims anywhere. It has to
// be one more solve, run AFTER aim and reach, against wherever the shaft
// actually ended up.
//
// The shaft itself is measured, not assumed. A delivered rig carries the
// weapon as geometry skinned to the prop bone (the conform pass's prop rescue
// guarantees exactly that), so the verts the prop bone dominates are the
// weapon, and their principal axis in the bone's own frame IS the shaft —
// pose-independent, computed once per rig and cached on the bone. Which way
// along it is "toward the butt" comes from the bind pose: a generated polearm
// arrives standing upright, so at bind the butt end points down.

/** States in which the off hand grips the shaft. The strike family plus the
 *  holds that read as "braced": locomotion stays one-handed (the canon carry),
 *  and states that need the off hand elsewhere — ledge, dodges, hurt — are
 *  simply absent. */
const TWO_HAND_STATES = new Set([
  "light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack",
  "specialNeutral", "specialSide", "specialDown", "charge", "ult",
]);

/** Fit the weapon's shaft in the prop bone's local frame.
 *
 *  Returns { dir, extent } — `dir` a unit Vector3 in bone-local space
 *  pointing from the grip toward the BUTT, `extent` how many metres of shaft
 *  lie that way — or null when the rig carries no measurable prop geometry.
 *
 *  Works from bind-space data only (geometry positions, bindMatrix, the
 *  skeleton's boneInverses), so it does not matter what pose the rig is in
 *  when first asked. Verts rigid to a bone have constant bone-local
 *  coordinates: local = boneInverse × bindMatrix × v. */
export function fitPropShaft(THREE, root3d, propBoneName) {
  const locals = [];
  let restWorldRot = null;
  root3d.traverse((obj) => {
    if (!obj.isSkinnedMesh || !obj.skeleton) return;
    const joint = obj.skeleton.bones.findIndex((b) => b.name === propBoneName);
    if (joint < 0) return;
    const toLocal = new THREE.Matrix4()
      .multiplyMatrices(obj.skeleton.boneInverses[joint], obj.bindMatrix);
    restWorldRot = new THREE.Matrix4()
      .copy(obj.skeleton.boneInverses[joint]).invert();
    const pos = obj.geometry.attributes.position;
    const idx = obj.geometry.attributes.skinIndex;
    const wgt = obj.geometry.attributes.skinWeight;
    if (!pos || !idx || !wgt) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      let best = 0, bestW = 0;
      for (let k = 0; k < 4; k++) {
        const w = wgt.getComponent(i, k);
        if (w > bestW) { bestW = w; best = idx.getComponent(i, k); }
      }
      if (best !== joint || bestW < 0.5) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
      locals.push(v.clone());
    }
  });
  if (locals.length < 16) return null;

  // Principal axis by power iteration on the covariance — the shaft dominates
  // every other dimension of a polearm, so this converges in a few steps.
  const mean = locals.reduce((a, b) => a.add(b), new THREE.Vector3())
    .multiplyScalar(1 / locals.length);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of locals) {
    const dx = p.x - mean.x, dy = p.y - mean.y, dz = p.z - mean.z;
    xx += dx * dx; xy += dx * dy; xz += dx * dz;
    yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  const dir = new THREE.Vector3(1, 1, 1).normalize();
  for (let it = 0; it < 24; it++) {
    dir.set(
      xx * dir.x + xy * dir.y + xz * dir.z,
      xy * dir.x + yy * dir.y + yz * dir.z,
      xz * dir.x + yz * dir.y + zz * dir.z,
    );
    if (dir.lengthSq() < 1e-20) return null;
    dir.normalize();
  }

  // Butt-ward: at bind the polearm stands upright, so the end of the shaft
  // that points DOWN in bind-world is the butt.
  const worldDir = dir.clone().transformDirection(restWorldRot);
  if (worldDir.y > 0) dir.negate();
  let extent = 0;
  for (const p of locals) extent = Math.max(extent, p.dot(dir));
  return { dir, extent };
}

/**
 * Put the off hand on the shaft, for fighters whose prop is two-handed and
 * states where a two-handed grip reads. Call AFTER applyAim/applyReach — the
 * shaft rides the striking hand, so this must see its final position.
 */
export function applyTwoHandGrip(THREE, root3d, charKey, state, clipT, tmp) {
  const grip = twoHandGrip(charKey);
  if (!grip || !TWO_HAND_STATES.has(clipNameFor(state))) return false;
  const bone = root3d.getObjectByName(grip.bone);
  if (!bone) return false;

  if (bone.userData.__shaft === undefined) {
    bone.userData.__shaft = fitPropShaft(THREE, root3d, grip.bone);
  }
  const shaft = bone.userData.__shaft;
  if (!shaft) return false;

  // Which hand already grips: the prop bone hangs off it (conform reparents
  // the hook onto whichever hand the weights name). The OTHER arm reaches.
  let gripHand = null;
  for (let p = bone.parent; p; p = p.parent) {
    if (p.name === "LeftHand" || p.name === "RightHand") { gripHand = p.name; break; }
  }
  if (!gripHand) return false;
  const off = gripHand === "RightHand" ? "Left" : "Right";
  const chain = [`${off}Arm`, `${off}ForeArm`, `${off}Hand`]
    .map((n) => root3d.getObjectByName(n));
  if (chain.some((b) => !b)) return false;

  const mainChain = [`${gripHand === "RightHand" ? "Right" : "Left"}Arm`,
    `${gripHand === "RightHand" ? "Right" : "Left"}ForeArm`, gripHand]
    .map((n) => root3d.getObjectByName(n));

  const weight = reachWeight(state, clipT);
  if (weight <= 0) return false;

  // The grasp point: the spot on the shaft a real off hand would take — the
  // point NEAREST its own shoulder, clamped down-shaft of the main grip so
  // the hands never stack (`spacing` is the minimum separation). Nearest-
  // point gripping is just what hands do — under the main hand on a vertical
  // hold, mid-shaft on a horizontal one. Recomputed from the live matrices on
  // every call because the pull-in loop below moves the shaft between solves.
  const graspTarget = () => {
    bone.updateWorldMatrix(true, false);
    const gripPos = tmp.p1.setFromMatrixPosition(bone.matrixWorld);
    const buttPos = tmp.p2.copy(shaft.dir).multiplyScalar(shaft.extent)
      .applyMatrix4(bone.matrixWorld);
    const shaftDir = tmp.v1.subVectors(buttPos, gripPos);
    const shaftLen = shaftDir.length();
    if (shaftLen < 1e-6) return null;
    shaftDir.multiplyScalar(1 / shaftLen);
    chain[0].updateWorldMatrix(true, false);
    const shoulder = tmp.p3.setFromMatrixPosition(chain[0].matrixWorld);
    const s = clamp(
      tmp.v2.subVectors(shoulder, gripPos).dot(shaftDir),
      Math.min(grip.spacing * 0.6, shaftLen * 0.5),
      shaftLen * 0.95,
    );
    tmp.eff.copy(gripPos).addScaledVector(shaftDir, s);
    return shoulder; // tmp.p3 — target itself is in tmp.eff
  };

  // THE COUPLED HALF. The authored strikes are one-handed: they fling the
  // weapon a full stride from the body, physically outside the off arm's
  // reach — measured, not hypothetical: Maki's sideHeavy puts the nearest
  // shaft point 0.72 m from a 0.43 m arm. No amount of off-hand IK closes
  // that. What closes it is what a real two-handed strike does: the MAIN
  // hand stays near the body and the weapon's tip does the extending. So
  // when the grasp point is out of reach, pull the main hand toward the off
  // shoulder until it isn't. The shaft rides the main hand, so each pull
  // translates the grasp point almost 1:1 — two or three rounds converge.
  const a = tmp.p4.setFromMatrixPosition(chain[0].matrixWorld);
  const b = tmp.p5.setFromMatrixPosition(chain[1].matrixWorld);
  const c = tmp.p6.setFromMatrixPosition(chain[2].matrixWorld);
  const offLen = a.distanceTo(b) + b.distanceTo(c);
  const canPull = mainChain.every((bn) => !!bn);
  if (canPull) for (let i = 0; i < 3; i++) tmp.saved2[i].copy(mainChain[i].quaternion);
  if (canPull) {
    for (let iter = 0; iter < 3; iter++) {
      const shoulder = graspTarget();
      if (!shoulder) break;
      const dist = shoulder.distanceTo(tmp.eff);
      if (dist <= offLen * 0.95) break;
      // Move the main hand by the overshoot, aimed at the off shoulder, with
      // a little slack so the off elbow keeps a bend instead of locking out.
      const pull = tmp.v3.subVectors(shoulder, tmp.eff)
        .multiplyScalar((dist - offLen * 0.85) / dist);
      mainChain[2].updateWorldMatrix(true, false);
      tmp.eff2.setFromMatrixPosition(mainChain[2].matrixWorld).add(pull);
      if (!solveTwoBone(THREE, mainChain[0], mainChain[1], mainChain[2], tmp.eff2, tmp)) break;
    }
    if (weight < 1) {
      for (let i = 0; i < 3; i++) {
        const solved = tmp.q1.copy(mainChain[i].quaternion);
        mainChain[i].quaternion.copy(tmp.saved2[i]).slerp(solved, weight);
      }
      mainChain[0].updateMatrixWorld(true);
    }
  }

  // With the shaft wherever the (blended) main arm finally holds it, land the
  // off hand on it.
  if (!graspTarget()) return false;
  for (let i = 0; i < 3; i++) tmp.saved[i].copy(chain[i].quaternion);
  if (!solveTwoBone(THREE, chain[0], chain[1], chain[2], tmp.eff, tmp)) {
    for (let i = 0; i < 3; i++) chain[i].quaternion.copy(tmp.saved[i]);
    return false;
  }
  if (weight < 1) {
    for (let i = 0; i < 3; i++) {
      const solved = tmp.q1.copy(chain[i].quaternion);
      chain[i].quaternion.copy(tmp.saved[i]).slerp(solved, weight);
    }
    chain[0].updateMatrixWorld(true);
  }
  return true;
}

// ------------------------------------------------------------- body morphs
//
// Per-state bone scaling (props.js CHARACTER_MORPHS) — Mahito's
// transfiguration arms. Runs right after the mixer poses the rig and BEFORE
// aim/reach/two-hand, so every solve sees the morphed limb. The morph ramps
// in on the state's reach curve: the arm swells through the wind-up and is
// fully transformed by the contact beat, which reads as transfiguration
// rather than a costume swap.
//
// Bones the char's morphs ever touch are reset to scale 1 on every call —
// the mixer does not write scale tracks, so a stale swell would otherwise
// survive into the next state.

/** Apply `charKey`'s per-state morphs for `state` at `clipT` seconds in.
 *  No-op (false) for fighters that declare none. */
export function applyMorphs(root3d, charKey, state, clipT) {
  const bones = morphBones(charKey);
  if (!bones) return false;
  const spec = CHARACTER_MORPHS[charKey][clipNameFor(state)] || null;
  const w = spec ? reachWeight(state, clipT) : 0;
  for (const name of bones) {
    const bone = root3d.getObjectByName(name);
    if (!bone) continue;
    const m = spec?.find((s) => s.bone === name);
    if (m && w > 0) {
      const [sx, sy, sz] = Array.isArray(m.scale) ? m.scale : [m.scale, m.scale, m.scale];
      bone.scale.set(1 + (sx - 1) * w, 1 + (sy - 1) * w, 1 + (sz - 1) * w);
    } else {
      bone.scale.set(1, 1, 1);
    }
  }
  return !!spec && w > 0;
}

// ---------------------------------------------------------------- layer axes
//
// The live layers (aim pitch, head look-at, flinch) all need to NOD a bone —
// rotate it in the vertical plane the character faces along. They were written
// as a rotation about the bone's LOCAL X, which is only the nodding axis if the
// rig happens to be built that way. On a generated rig whose neck carries its
// own roll it is not, and the head yaws and rolls instead of nodding: the
// "funny head rotation" on the first delivered fighter.
//
// The honest axis is the character's own LATERAL direction — perpendicular to
// both world up and the way they face — computed from the rig and converted
// into whatever local frame the bone happens to have.

/** The character's lateral (right-hand-side) axis in world space, from the
 *  rig's forward (+Z by the delivery spec) and world up. */
export function characterLateral(THREE, root, out) {
  const fwd = out.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_lq));
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-8) return out.set(1, 0, 0);
  fwd.normalize();
  // right = forward x up
  return out.set(fwd.z, 0, -fwd.x);
}
let _lq = null;

/** Turn `bone` by `rad` about a WORLD axis, composing with whatever the clip
 *  and earlier layers already did. */
export function rotateBoneAboutWorldAxis(THREE, bone, axisWorld, rad, tmp) {
  if (!bone || !rad) return;
  const parentWorld = bone.parent ? bone.parent.getWorldQuaternion(tmp.q2) : tmp.q2.identity();
  const localAxis = tmp.v1.copy(axisWorld).applyQuaternion(parentWorld.invert()).normalize();
  bone.quaternion.premultiply(tmp.q1.setFromAxisAngle(localAxis, rad));
}

export function initLayerAxes(THREE) {
  _lq = new THREE.Quaternion();
}
