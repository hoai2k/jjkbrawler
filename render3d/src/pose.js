// animKey + animTime -> a posed skeleton, live.
//
// This is where the render3d backend differs from billboards in kind: the
// clip PLAYS — a run cycle runs, a hurt pose recoils — instead of holding a
// quantised pose. Two disciplines keep that affordable and keep it anime:
//
//   * ON-TWOS SAMPLING. Clip time is quantised to 1/SAMPLE_HZ before posing,
//     so motion holds and snaps like limited animation — and so the pose
//     cache in scene.js still works: a fighter re-renders SAMPLE_HZ times a
//     second, not 60. Attack clips are sampled so the CONTACT BEAT is always
//     a sampled frame (never stepped over): the strike shows the instant its
//     hitbox goes live, honouring the timing contract in states.js. If a
//     state's stepping ever reads laggy under 60 Hz knockback, add it to
//     DIALS.onOnesStates — a per-state dial, not a rework.
//
//   * THE LIVE LAYERS. Everything applied on top of the clip at pose time,
//     each quantised so it joins the cache key without exploding it:
//     aim pitch (attacks pitch toward the target — billboards' contract,
//     run live), head look-at (idle/run/charge track the opponent), hurt
//     flinch (hurt states lean away from the attacker), and the turnaround
//     (facing left is the model yawed 180°, not a mirror — asymmetric
//     costumes finally stay correct).
//
// Foot IK: a small CCD pass clamps feet that sink below the ground line for
// grounded states — the engine-side answer to retarget foot-slide across a
// 150–220 cm roster, so the shared clip library lands on every height.
//
// Engine motion (sway, bob, squash, tumble) is NOT here — motion.js owns it
// and blit.js applies it, identically to sprites and billboards. Clips must
// not bake it; the delivery rule carries over verbatim.

import { STATES, clipNameFor, clipTime, aimable } from "../../billboards/src/states.js";
import {
  applyReach, reaches, makeScratch, applyTwoHandGrip,
  characterLateral, rotateBoneAboutWorldAxis, initLayerAxes,
} from "../../billboards/src/ik.js";

/** The engine-side dials, each independently workbench-editable. */
export const DIALS = {
  onTwos: true,
  sampleHz: 13,               // 12–15 per the plan; 13 splits the difference
  onOnesStates: new Set(),    // states that step at full rate (see above)
  aim: true,                  // strikes pitch toward the target
  reach: true,                // ...and the striking limb solves onto it (ik.js)
  lookAt: true,               // head tracks the opponent in LOOK_STATES
  lookShare: 0.6,             // how much of the aim pitch the head takes
  flinch: true,               // hurt states lean away from the last attacker
  flinchDeg: 7,
  turnaround: true,           // yaw the rig for facing, instead of mirroring
  parallax: true,             // per-character camera yaw by stage position
  parallaxMaxDeg: 7,
  parallaxQuantDeg: 2,
  footIK: true,
  breath: true,               // additive shoulder breath on held states
  breathDeg: 1.6,
};

/** States whose head may track the opponent. Never during attacks — the
 *  clip owns the head then. */
export const LOOK_STATES = new Set(["idle", "run", "charge"]);

/** States that flinch away from the hit's direction. */
export const FLINCH_STATES = new Set(["hurt", "dizzy", "prone"]);

/** Grounded states the foot IK may touch. */
const PLANT_STATES = new Set(["idle", "run", "crouch", "shield", "charge", "dizzy", "win", "land"]);

/** Breathing holds: alive without clips baking breath (which would double
 *  motion.js's bob — the delivery rule). */
const BREATH_STATES = new Set(["idle", "crouch", "shield"]);

const DEG = Math.PI / 180;

/** Clip time for a state, stepped on twos. The contact beat is always a
 *  sampled frame. Returns seconds into the clip. */
export function sampleTime(animKey, animTime) {
  const t = clipTime(animKey, animTime);
  const name = clipNameFor(animKey);
  if (!DIALS.onTwos || DIALS.onOnesStates.has(name)) return t;
  const q = 1 / DIALS.sampleHz;
  let s = Math.floor(t / q) * q;
  const beat = STATES[name]?.beat;
  if (beat !== undefined && t >= beat && s < beat) s = beat;
  return s;
}

/** Camera yaw from stage position: a fighter at the left edge is seen
 *  slightly from the right, so both fighters agree with one implied
 *  viewpoint. Clamped small (silhouettes are gameplay) and quantised so it
 *  joins the pose-cache key cheaply. Returns degrees. */
export function parallaxDeg(x, cameraX, worldHalfW) {
  if (!DIALS.parallax) return 0;
  const k = Math.max(-1, Math.min(1, (x - cameraX) / worldHalfW));
  const deg = -k * DIALS.parallaxMaxDeg;
  return Math.round(deg / DIALS.parallaxQuantDeg) * DIALS.parallaxQuantDeg;
}

/** Which side the attacker is on, for the flinch lean: +1 ahead of the
 *  fighter's facing, -1 behind, 0 when no opponent is known. */
export function flinchSide(animKey, x, aim, facing) {
  if (!DIALS.flinch || !aim || !FLINCH_STATES.has(clipNameFor(animKey))) return 0;
  return Math.sign((aim.x - x) * (facing < 0 ? -1 : 1)) || 1;
}

// ------------------------------------------------------------ posing proper

let THREE = null;
let _q1, _q2, _q3, _v1, _v2, _v3, _v4;
let _ik = null, _reachTarget = null, _lateral = null;

export function initPose(three) {
  THREE = three;
  _ik = makeScratch(three);
  initLayerAxes(three);
  _reachTarget = new three.Vector3();
  _lateral = new three.Vector3();
  _q1 = new THREE.Quaternion();
  _q2 = new THREE.Quaternion();
  _q3 = new THREE.Quaternion();
  _v1 = new THREE.Vector3();
  _v2 = new THREE.Vector3();
  _v3 = new THREE.Vector3();
  _v4 = new THREE.Vector3();
}

/** Drive the mixer to the sampled clip time. Same action caching as the
 *  billboard renderer: actions rebind when the workbench changes a state's
 *  resolved clip. */
export function playClip(rig, animKey, sampled, clip) {
  const name = clipNameFor(animKey);
  let action = rig.actions.get(name);
  if (!action || action.getClip() !== clip) {
    rig.mixer.stopAllAction();
    action = rig.mixer.clipAction(clip);
    rig.actions.set(name, action);
  }
  if (!action.isRunning()) {
    rig.mixer.stopAllAction();
    action.reset().play();
  }
  rig.mixer.setTime(sampled);
}

/** NOD `name` by `rad` — a rotation in the vertical plane the character faces
 *  along, positive = chin/chest up.
 *
 *  This was a rotation about the bone's LOCAL X, which is the nodding axis only
 *  if the rig happens to be built that way. On a generated rig whose neck
 *  carries its own roll it is not, and the head yaws and rolls instead of
 *  nodding — the "funny head rotation" on the first delivered fighter. The
 *  honest axis is the CHARACTER's lateral direction, taken from the rig's own
 *  facing and converted into whatever local frame the bone happens to have
 *  (ik.js). For a clean rig that is the same rotation; for a rolled one it is
 *  the one that was meant. */
function rotateBoneNod(root, name, rad) {
  if (!rad) return;
  const bone = root.getObjectByName(name);
  if (!bone) return;
  characterLateral(THREE, root, _lateral);
  rotateBoneAboutWorldAxis(THREE, bone, _lateral, rad, _ik);
}

/** Aim: pitch the strike toward the target, split across the spine so the
 *  whole upper body leans into the shot. Same shares as the billboard
 *  backend — one aim contract, two backends. */
const AIM_BONES = [["Spine1", 0.35], ["Spine2", 0.45], ["Neck", -0.3]];
function applyAim(root, pitchRad) {
  if (!pitchRad) return;
  for (const [name, share] of AIM_BONES) rotateBoneNod(root, name, -pitchRad * share);
}

/** Head look-at: neck and head take a share of the pitch toward the
 *  opponent, in the states that allow it. */
function applyLook(root, pitchRad) {
  if (!pitchRad) return;
  rotateBoneNod(root, "Neck", -pitchRad * DIALS.lookShare * 0.5);
  rotateBoneNod(root, "Head", -pitchRad * DIALS.lookShare * 0.5);
}

/** Hit-direction flinch: lean the spine a few degrees away from the
 *  attacker, so knockback reads in the body, not just the trajectory. */
function applyFlinch(root, side) {
  if (!side) return;
  rotateBoneNod(root, "Spine", -side * DIALS.flinchDeg * DEG);
  rotateBoneNod(root, "Spine1", -side * DIALS.flinchDeg * 0.5 * DEG);
}

/** Additive breath: shoulders only, tied to the SAMPLED clock so the cache
 *  stays honest. */
function applyBreath(root, animKey, sampled) {
  if (!DIALS.breath || !BREATH_STATES.has(clipNameFor(animKey))) return;
  const s = STATES[clipNameFor(animKey)];
  const k = Math.sin((sampled / s.duration) * Math.PI * 2);
  rotateBoneNod(root, "Spine2", -k * DIALS.breathDeg * DEG);
}

/** Foot IK: clamp feet that sink below the ground line back onto it, with a
 *  short CCD pass over knee and hip. Only grounded states, only downward
 *  penetration — a raised foot is the clip's business. */
function plantFeet(root, animKey) {
  if (!DIALS.footIK || !PLANT_STATES.has(clipNameFor(animKey))) return;
  for (const side of ["Left", "Right"]) {
    const up = root.getObjectByName(`${side}UpLeg`);
    const lo = root.getObjectByName(`${side}Leg`);
    const foot = root.getObjectByName(`${side}Foot`);
    if (!up || !lo || !foot) continue;
    root.updateMatrixWorld(true);
    foot.getWorldPosition(_v1);
    if (_v1.y >= -0.005) continue;
    const target = _v2.set(_v1.x, 0, _v1.z);
    for (let iter = 0; iter < 3; iter++) {
      for (const bone of [lo, up]) {
        bone.getWorldPosition(_v3);
        foot.getWorldPosition(_v1);
        const cur = _v1.sub(_v3).normalize();
        const des = _v4.copy(target).sub(_v3).normalize();
        _q1.setFromUnitVectors(cur, des);
        // Half-steps keep the correction subtle; three passes converge close
        // enough for a ground clamp without fighting the clip.
        _q2.identity().slerp(_q1, 0.5);
        // world-space delta -> the bone's local frame
        bone.parent.getWorldQuaternion(_q3);
        const pw = _q3.clone();
        bone.quaternion.premultiply(pw.invert().multiply(_q2).multiply(_q3));
        bone.updateMatrixWorld(true);
      }
    }
  }
}

/**
 * The full pose for one render: clip at the sampled time, then the live
 * layers. `layers` = { aimRad, lookRad, flinch, turnYawRad } — all already
 * quantised by the caller (they are part of the cache key).
 */
export function poseRig(rig, animKey, sampled, clip, layers = {}) {
  // The turnaround goes on FIRST, before anything reads a world matrix.
  // Facing here is a real 180° yaw rather than a mirror, so it changes which
  // way "forward" points in the world — and the reach solve below builds its
  // target in the rig's own frame and converts through that matrix. Setting
  // the yaw last (as this did) would have every left-facing fighter reach in
  // the direction they are NOT facing.
  rig.root.rotation.y = layers.turnYawRad || 0;
  rig.root.updateMatrixWorld(true);

  playClip(rig, animKey, sampled, clip);
  if (DIALS.aim && layers.aimRad && aimable(animKey)) applyAim(rig.root, layers.aimRad);
  applyMachineReach(rig, animKey, sampled, layers);
  // The off hand joins a two-handed weapon AFTER aim and reach have moved
  // the striking hand — the shaft rides it (ik.js applyTwoHandGrip; a no-op
  // without layers.charKey or for one-handed fighters).
  if (layers.charKey) {
    applyTwoHandGrip(THREE, rig.root, layers.charKey, animKey,
      clipTime(animKey, sampled), _ik);
  }
  if (DIALS.lookAt && layers.lookRad) applyLook(rig.root, layers.lookRad);
  applyFlinch(rig.root, layers.flinch || 0);
  applyBreath(rig.root, animKey, sampled);
  plantFeet(rig.root, animKey);
}

/** Solve the striking limb onto the aim point (billboards/src/ik.js).
 *
 *  The offsets arrive in GAME PIXELS along the fighter's facing and up from
 *  their feet — quantised by aimSolve, because they are part of the cache key.
 *  Converting is one ratio: the rig is authored in metres and occupies
 *  `targetPx` pixels on screen. The target is then built in the RIG's own
 *  frame (+Z is forward, the same axis applyAim pitches about) and pushed
 *  through localToWorld, which folds in the turnaround, the world placement
 *  and the instance scale in one step — so this works identically for the flat
 *  blit, where the rig sits at the origin, and for the in-scene camera path,
 *  where it stands at the fighter's position scaled to game size. */
function applyMachineReach(rig, animKey, sampled, layers) {
  const reach = layers.reach;
  if (!DIALS.reach || !reach || !reaches(animKey)) return;
  const targetPx = reach.targetPx || 0;
  if (targetPx <= 0 || !rig.height) return;
  const mPerPx = rig.height / targetPx;
  _reachTarget.set(0, (reach.dy || 0) * mPerPx, (reach.dx || 0) * mPerPx);
  rig.root.localToWorld(_reachTarget);
  applyReach(THREE, rig.root, animKey, clipTime(animKey, sampled), _reachTarget, _ik);
}
