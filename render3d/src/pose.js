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

import { STATES, clipNameFor, clipTime, aimable } from "./states.js";
import { applyRigFixes, modelFixesEnabled } from "./rig_fixes.js";
import { groundOffset } from "./pose_library.js";
import {
  applyReach, reaches, makeScratch, applyTwoHandGrip, applyMorphs, applyIdleStand, applyIdleArms, applyShoulderWidth, clearIdleStand,
  characterLateral, rotateBoneAboutWorldAxis, initLayerAxes,
  reachChain, gripBones,
} from "./ik.js";

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

/** How far a relaxed arm hangs from straight down, in degrees, for a fighter
 *  whose manifest does not say. It is what "relaxed" looks like rather than a
 *  fact about any one model — but a heavy coat or a wide body wants more, so
 *  `armDeg` overrides it per character, the way `stanceDeg` does for the legs.
 *  Small on purpose: past about fifteen it stops reading as rest. */
export const IDLE_ARM_DEG = 9;

// ------------------------------------------------------------ posing proper

let THREE = null;
let _q1, _q2, _q3, _v1, _v2, _v3, _v4, _v5, _e1;
let _ik = null, _reachTarget = null, _lateral = null;

export function initPose(three) {
  THREE = three;
  _ik = makeScratch(three);
  initLayerAxes(three);
  _reachTarget = new three.Vector3();
  _lateral = new three.Vector3();
  _e1 = new three.Euler();
  _q1 = new THREE.Quaternion();
  _q2 = new THREE.Quaternion();
  _q3 = new THREE.Quaternion();
  _v1 = new THREE.Vector3();
  _v2 = new THREE.Vector3();
  _v3 = new THREE.Vector3();
  _v4 = new THREE.Vector3();
  _v5 = new THREE.Vector3();
}

/**
 * THE CLEAN POSE — what makes a pose a function of its inputs.
 *
 * Every live layer below (aim, reach, flinch, breath, foot IK, workbench pose
 * edits) MULTIPLIES onto a bone's current rotation. Nothing put those bones
 * back afterwards, and the mixer cannot be relied on to: it writes a bone only
 * when the clip's value for it CHANGED, so a held frame — or any bone the clip
 * has no track for — kept the last pass's correction and took the next one on
 * top. Pose the same frame twice and it drifted. That weakened the cache's
 * promise (same token -> same pixels, which the afterimage trail replays), and
 * in the workbench, where the pose editor previews every frame rather than
 * SAMPLE_HZ times a second, it visibly walked a rig away from itself: a joint
 * dragged 20° swung 200°.
 *
 * So each rig carries a CLEAN POSE — the skeleton as the clip alone leaves it,
 * re-snapshotted every pose right after the mixer runs and restored before the
 * next one. Bones start each pose exactly where the mixer believes it left
 * them, so its skip-if-unchanged stays correct, and the layers compose once.
 * The buffer is allocated at registration (loader.js), holding the bind pose
 * for the first pose to build on.
 */
const CLEAN_POSE = new WeakMap();

/** Start `root`'s clean-pose buffer at its bind pose. `fromRoot`, when given,
 *  is the rig this one was cloned from: an instance is cloned from a base that
 *  may already be posed, so it inherits the BASE's remembered bind values by
 *  bone name rather than whatever pose it was cloned mid-way through. */
export function captureCleanPose(root, fromRoot = null) {
  const source = fromRoot ? CLEAN_POSE.get(fromRoot) : null;
  const byName = source ? new Map(source.map(([b, q, p]) => [b.name, [q, p]])) : null;
  const clean = [];
  root.traverse((o) => {
    if (!o.isBone) return;
    const held = byName?.get(o.name);
    clean.push([o, held ? held[0].clone() : o.quaternion.clone(),
                   held ? held[1].clone() : o.position.clone()]);
  });
  CLEAN_POSE.set(root, clean);
}

/** Put the skeleton back where the CLIP left it last time, undoing the layers
 *  that were applied on top. It cannot be the bind pose instead: the mixer
 *  skips writing a property whose value it believes it already wrote, so a
 *  bone reset behind its back would stay at bind — which is exactly how the
 *  second render of an unchanged frame came out T-posed. */
function restoreClean(root) {
  const held = CLEAN_POSE.get(root);
  if (!held) return; // never registered (a hand-built probe rig) — nothing to restore
  for (const [bone, q, p] of held) { bone.quaternion.copy(q); bone.position.copy(p); }
}

/** Remember where the clip left the skeleton, before any layer touches it. */
function keepClean(root) {
  const held = CLEAN_POSE.get(root);
  if (!held) return;
  for (const entry of held) {
    entry[1].copy(entry[0].quaternion);
    entry[2].copy(entry[0].position);
  }
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

/**
 * WORKBENCH POSE EDITS: hand-authored rotation offsets laid on top of the clip.
 *
 * `edits` is [[boneName, rx, ry, rz], ...] in radians, each a rotation in the
 * bone's PARENT frame — which is the frame the clip's own keyframes live in, so
 * an offset composes with the animation instead of fighting it, and the same
 * numbers can be typed straight into a pose table (mannequin.js POSES) once
 * they read right.
 *
 * They go on immediately after the clip and before every live layer, so aim,
 * reach, look-at, flinch and foot IK all solve against the EDITED body: drop a
 * shoulder here and the strike still lands on the target.
 *
 * `postEdits` is the same shape and runs at the very END instead — after every
 * solver. That distinction is not a detail, it is which QUESTION the edit is
 * answering, and the workbench decides it per bone:
 *
 *   A bone the clip owns (a hip, the off arm in a punch) is edited in CLIP
 *   SPACE. The number means "this pose is wrong", it belongs in the keyframe,
 *   and every solver downstream is entitled to move it afterwards.
 *
 *   A bone a solver OWNS in this state — the striking limb, which ik.js aims
 *   at the target; the spine, which pitches toward it; the feet, which the
 *   ground clamps — cannot be edited in clip space at all: the solve would
 *   overwrite it, and the tool would silently do nothing. Its edit has to land
 *   after the solve, which also makes it mean something different and truer:
 *   an offset RELATIVE TO THE TARGET the solver aimed at. "Twenty degrees more
 *   elbow than the solve gives" survives every angle the strike is thrown at,
 *   where a clip-space number would only have been right for one of them.
 *
 * The game never passes either — this is the workbench's authoring surface, and
 * it reaches the render only because `layers.editKey` joins the pose-cache
 * token (scene.js).
 */
function applyPoseEdits(root, edits) {
  if (!edits || !edits.length) return;
  for (const [name, rx, ry, rz] of edits) {
    if (!rx && !ry && !rz) continue;
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    _e1.set(rx, ry, rz, "XYZ");
    _q1.setFromEuler(_e1);
    bone.quaternion.premultiply(_q1);
  }
  root.updateMatrixWorld(true);
}

/**
 * The states whose fighter is standing on something. Everything else is in the
 * air and stays where the clip puts it — a jump that touches the floor is a
 * worse lie than one that hovers.
 */
const GROUNDED = new Set([
  "idle", "run", "crouch", "shield", "charge", "dizzy", "win", "land",
  "light", "heavy", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack",
  "grab", "grabbed", "hurt", "prone", "dash", "special",
]);

/** Each rig's armature node and where it sits in the bind, so the ground drop
 *  is applied fresh every frame instead of accumulating. */
const _armature = new WeakMap();

/**
 * DROP THE BODY UNTIL ITS FEET ARE ON THE FLOOR.
 *
 * A pose folds the legs; it does not lower the hips, because a pose is bone
 * rotations and hip height is a translation. So a crouch built from the pose
 * libraries came out standing at full height with its knees bent — hovering
 * 29cm up — and foot IK did not catch it: `plantFeet` only pushes feet that
 * have sunk BELOW the line back up to it, and these are above it.
 *
 * It moves the ARMATURE, not the rig root. The root is where the fighter is
 * standing in the world and belongs to the backend; the armature node inside
 * it is the body, and moving that leaves placement alone.
 */
function standOnGround(rig, animKey) {
  const root = rig?.root;
  if (!root) return;
  let node = _armature.get(root);
  if (node === undefined) {
    const hips = root.getObjectByName("Hips") || root.getObjectByName("mixamorigHips");
    node = hips?.parent === root ? hips : (hips || null);
    _armature.set(root, node ? Object.assign(node, { _bindY: node.position.y }) : null);
    node = _armature.get(root);
  }
  if (!node) return;
  node.position.y = node._bindY;
  if (!GROUNDED.has(clipNameFor(animKey))) { root.updateMatrixWorld(true); return; }
  root.updateMatrixWorld(true);
  const bones = new Map();
  for (const name of ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) {
    const b = root.getObjectByName(name);
    if (b) bones.set(name, b);
  }
  // Measured in the ROOT's frame: `node.position.y` is local to the root, and
  // so is the floor the fighter stands on. See groundOffset.
  const drop = groundOffset(THREE, bones, { root });
  // A hard clamp, because this is a correction and not a lift: a pose that
  // wants the body a metre lower than its bind is a broken pose, and hoisting
  // a fighter UP to meet a stray foot would be worse than leaving them be.
  node.position.y = node._bindY + Math.min(0, Math.max(-0.6, drop));
  root.updateMatrixWorld(true);
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
    // The ground line is y = 0 of the FIGHTER'S frame, not of the world — the
    // two coincide only while the rig stands at the origin (the offscreen
    // blit). In `?camera=3d` the root is at the platform's height, and reading
    // world y there planted every fighter on the main stage's floor plane.
    root.worldToLocal(_v5.copy(_v1));
    if (_v5.y >= -0.005) continue;
    _v5.y = 0;
    const target = _v2.copy(root.localToWorld(_v5));
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
  // The delivery's own facing joins the turnaround: a rig built facing -Z
  // (loader.js yawOffsetDeg) is turned once, here, and every layer below sees
  // a fighter whose forward is where the spec says it is.
  rig.root.rotation.y = (layers.turnYawRad || 0) + (rig.yawOffset || 0);
  rig.root.updateMatrixWorld(true);

  restoreClean(rig.root);
  playClip(rig, animKey, sampled, clip);
  keepClean(rig.root);
  // How the fighter STANDS, before anything reaches: straightening the legs
  // and squaring the feet moves the hips, and therefore every joint above
  // them, so a solve run first would be solving from a body about to move.
  //
  // Idle only, and unconditional there — the straight legs and level soles are
  // not an opt-in setting but what standing looks like, so a fighter whose
  // stance dial reads 0 still gets them. A splay held through a run cycle
  // reads as a limp, which is why it stops at the idle.
  if (clipNameFor(animKey) === "idle") {
    applyIdleStand(THREE, rig.root, layers.stanceDeg || 0, _ik);
    // The arms get the same treatment one axis up — unless this fighter's
    // delivered idle is a pose somebody chose, which the manifest says.
    if (rig.idleArms !== false) {
      applyIdleArms(THREE, rig.root, rig.armDeg ?? IDLE_ARM_DEG, _ik);
    }
  } else {
    clearIdleStand(rig.root);
  }
  // ------------------------------------------------------------------------
  // THE GLB CORRECTION LAYER — begin. Everything between these two markers is
  // a fix to the delivered MODEL, not to any pose: things the file got wrong
  // that no clip can fix, because every state inherits them. They are dialled
  // by eye in the idle review (which is the one pose with an obvious right
  // answer) but they are NOT part of the idle, so they are applied here, for
  // every state, unconditionally.
  //
  // It is one block on purpose. The bake list lives in rig_fixes.js
  // (MODEL_FIXES / MODEL_FIX_KEYS) and `tools/model_fixes.mjs` prints what is
  // still outstanding per fighter; when a fighter's corrections go into their
  // .glb, `setModelFixesEnabled(false)` must leave them looking IDENTICAL —
  // that is the test of a complete bake, and it only works if nothing in this
  // class is applied outside these markers.
  //
  // Order within the block matters only in that it runs before the live
  // layers below: look-at nods FROM the corrected carriage rather than
  // fighting it, and reach solves from a body whose shoulders are already
  // where the model should have put them.
  if (modelFixesEnabled()) {
    // Generated heads arrive modelled looking slightly down — the tilt is in
    // the MESH, not the skeleton, so no amount of measuring the rig finds it
    // (the joints come out level to within a degree across the whole roster).
    // Positive lifts the chin.
    if (rig.headTiltDeg) rotateBoneNod(rig.root, "Head", -rig.headTiltDeg * DEG);
    // Arm roots built too far into the body. This used to live inside the
    // idle-arms call, which meant a fighter's shoulders snapped inward the
    // instant they threw a punch — Uro measured 37.6cm standing and 24.9cm
    // mid-strike, exactly twice her 6.5cm correction. A fact about the model
    // cannot come and go with the state.
    if (rig.shoulderOutCm) {
      applyShoulderWidth(THREE, rig.root, rig.shoulderOutCm / 100, _ik);
    }
    // Per-bone bind corrections: a rolled clavicle, a cocked wrist.
    const fixKey = layers.charKey || rig.charKey;
    if (fixKey) applyRigFixes(THREE, rig.root, fixKey);
  }
  // THE GLB CORRECTION LAYER — end.
  // ------------------------------------------------------------------------
  // STAND ON THE FLOOR. A pose that folds the legs without lowering the hips
  // leaves the fighter hovering — a library crouch floated 29cm — and foot IK
  // does not catch it, because that only pushes feet that have sunk BELOW the
  // line back up to it. This is the other direction, and it is a translation
  // rather than a bend: the body drops until its lowest foot is on the ground.
  standOnGround(rig, animKey);
  // Body morphs (Mahito's transfiguration arms) precede aim/reach so every
  // solve sees the morphed limb.
  if (layers.charKey) applyMorphs(rig.root, layers.charKey, animKey, clipTime(animKey, sampled));
  applyPoseEdits(rig.root, layers.edits);
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
  // Target-space edits, last: an offset on top of whatever the solvers made
  // of this bone (see applyPoseEdits).
  applyPoseEdits(rig.root, layers.postEdits);
}

/** Which layer OWNS each bone in `animKey` — what the workbench has to know to
 *  put an edit in the right space, and to say so in its UI.
 *
 *  Returns a Map of boneName -> "target" | "ground" | "prop", listing only the
 *  bones something other than the clip drives. Everything absent is the clip's,
 *  which is the common case and the editable one. */
export function boneOwners(animKey, charKey = null) {
  const name = clipNameFor(animKey);
  const owners = new Map();
  if (DIALS.aim && aimable(animKey)) {
    for (const [bone] of AIM_BONES) owners.set(bone, "target");
  }
  if (DIALS.lookAt && LOOK_STATES.has(name)) {
    owners.set("Neck", "target");
    owners.set("Head", "target");
  }
  if (DIALS.reach) {
    for (const bone of reachChain(name) || []) owners.set(bone, "target");
  }
  if (DIALS.flinch && FLINCH_STATES.has(name)) {
    owners.set("Spine", "target");
    owners.set("Spine1", "target");
  }
  if (DIALS.footIK && PLANT_STATES.has(name)) {
    for (const side of ["Left", "Right"]) {
      for (const b of [`${side}UpLeg`, `${side}Leg`, `${side}Foot`]) owners.set(b, "ground");
    }
  }
  if (charKey) {
    for (const bone of gripBones(charKey, animKey)) owners.set(bone, "prop");
  }
  return owners;
}

/** Solve the striking limb onto the aim point (render3d/src/ik.js).
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
  // A caller that knows better hands over the world point itself. That is not
  // a convenience: WHERE a strike should land depends on how the fighter is
  // presented, and it is one of the few places the two model backends really
  // do differ. Live geometry reaches along the fighter's OWN forward, because
  // that is where they are pointing in the world. A billboard card is always
  // seen from one fixed ¾ camera, so its `dx` is a distance ACROSS THE SCREEN
  // — the card has to reach where the sprite it replaces reached, and that is
  // a camera-relative direction. Building the card's target the rig-relative
  // way put the striking hand 30° off.
  if (DIALS.reach && layers.reachTarget && reaches(animKey)) {
    applyReach(THREE, rig.root, animKey, clipTime(animKey, sampled), layers.reachTarget, _ik);
    return;
  }
  const reach = layers.reach;
  if (!DIALS.reach || !reach || !reaches(animKey)) return;
  const targetPx = reach.targetPx || 0;
  if (targetPx <= 0 || !rig.height) return;
  const mPerPx = rig.height / targetPx;
  _reachTarget.set(0, (reach.dy || 0) * mPerPx, (reach.dx || 0) * mPerPx);
  rig.root.localToWorld(_reachTarget);
  applyReach(THREE, rig.root, animKey, clipTime(animKey, sampled), _reachTarget, _ik);
}
