// The SPRITE POSE EDITOR (`render3d/workbench/?edit=pose`): drag eighteen
// joints onto a drawing until the mannequin IS the pose, and watch the 3D
// fighter take that pose beside it.
//
// WHY THIS EXISTS. The 3D fighters play a default pose set matched to three
// sheets by eye (billboards/docs/sprite-pose-audit.md). Yuji's sheet then
// disagreed with five of those defaults — his crouch is a sprinter's
// three-point stance, he hangs off a ledge one-handed, he lands on both hands.
// The lesson was not "fix five poses", it was that a pose set derived from a
// sample needs checking against each fighter's OWN art, and that checking a
// pose by describing it does not work: a description can be vague and still
// sound right, while a figure with the elbow in the wrong place is visibly
// wrong. So this tool makes the drawing the reference, the mannequin the
// claim, and the overlay of one on the other the test.
//
// WHAT IT EDITS. Not clips — pose_edit.js does that, in keyframes and degrees,
// against a state. This edits READS: eighteen 2D joints per FRAME, stored per
// character in sprites/docs/pose-reads/. A read is upstream of everything; it
// is what the art says, and it stays true whatever the clip tables do next.
// The joints drive spine, neck, both clavicles, arms, legs and feet; a bone
// they cannot reach, or any rotation out of the drawing's plane, belongs to
// the keyframe bench at ?edit=animation.
//
// THREE THINGS IT IS CAREFUL ABOUT, ALL OF WHICH SILENTLY PRODUCE PLAUSIBLE
// AND WRONG DATA IF GOT WRONG (tools/pose_reads.py says the same in Python,
// because both ends have to agree):
//
//   ORIENTATION. Frames the sprite manifest marks `faceLeft` are delivered
//   facing left and MIRRORED by the engine. The editor mirrors them too, so
//   every frame here is posed as it is actually drawn on screen. Editing the
//   raw PNG would record a backwards pose for a fighter nobody ever sees
//   facing that way.
//
//   SIDES. Joints are the CHARACTER's own left and right, never the screen's.
//   Facing right, the camera sits off the fighter's right shoulder: the RIGHT
//   limb is the near one. Sided names survive a mirror; near/far do not — and
//   which drawn limb is near is a judgement whose obvious answer is usually
//   wrong, because the extended arm of a punch is drawn BEHIND the collar
//   while the near arm crosses the chest. Hence ⇄ Swap L/R.
//
//   DEPTH IS NOT ASSUMED. A drawing is one view, so a read starts flat: every
//   joint is [x, y] and the preview turns each bone in the drawing's plane.
//   But some poses are not in that plane — an arm angled inward across the
//   chest reads flat as a short arm, and no amount of dragging in two
//   dimensions fixes it. So VIEW 3D turns both panes off the drawing's angle
//   together, a drag then lands in the plane you are looking at, and the joint
//   gains a third number. Depth is written only where someone put it, and the
//   sprite fades as the view turns away from the angle it was drawn at,
//   because from there it is no longer the thing to match.
//
// The output is a JSON file per character in exactly the on-disk format, so a
// finished character is a file copy into sprites/docs/pose-reads/.

import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import * as rigs from "../src/loader.js";
import { initPose } from "../src/pose.js";
import { CHARACTER_KEYS, CHARACTERS } from "../../src/characters.js";
import { makeOrbit } from "./orbit.js";

const READS_URL = "../../sprites/docs/pose-reads/";
const SPRITES_URL = "../../sprites/assets/";
const MANIFEST_URL = `${SPRITES_URL}manifest.json`;
/** The old localStorage key. Only read now, to throw its contents away. */
const STORE = "jjk.poseEdits.v1";

const JOINTS = [
  "head", "neck", "chest", "pelvis",
  "shoulderL", "elbowL", "handL",
  "shoulderR", "elbowR", "handR",
  "hipL", "kneeL", "footL", "toeL",
  "hipR", "kneeR", "footR", "toeR",
];

/** Each joint's parent. Dragging a joint carries its descendants, because a
 *  shoulder that moves while the arm stays put is never what was meant. */
const PARENT = {
  chest: "pelvis", neck: "chest", head: "neck",
  shoulderL: "chest", elbowL: "shoulderL", handL: "elbowL",
  shoulderR: "chest", elbowR: "shoulderR", handR: "elbowR",
  hipL: "pelvis", kneeL: "hipL", footL: "kneeL", toeL: "footL",
  hipR: "pelvis", kneeR: "hipR", footR: "kneeR", toeR: "footR",
};
const KIDS = {};
for (const [child, parent] of Object.entries(PARENT)) (KIDS[parent] ||= []).push(child);
const descendants = (joint) =>
  (KIDS[joint] || []).flatMap((k) => [k, ...descendants(k)]);

/** Which side of the body a joint belongs to — the near (right) limbs draw
 *  solid, the far (left) ones washed back, so an overlap still reads as two. */
const SIDE = (j) => (j.endsWith("L") ? "far" : j.endsWith("R") ? "near" : "mid");

/** The sided pairs, for the commonest correction of all: a drawing whose near
 *  arm was read as the far one. Which limb a sprite shows nearer the camera is
 *  a judgement — the extended arm of a punch is usually the FAR one, drawn
 *  behind the collar, while the near arm is the one crossing the chest — and
 *  when the judgement goes wrong the whole pose is right-handed instead of
 *  left. One button beats dragging six handles. */
const SIDED = ["shoulder", "elbow", "hand", "hip", "knee", "foot", "toe"];

/** [parent joint, child joint, bone] — the segment each bone's direction is.
 *  Parent-first, because every bone is aimed in the frame its ancestors left.
 *
 *  `plane: false` marks a bone whose bind direction is mostly ACROSS the body
 *  rather than in the drawing's plane. The two clavicles are the case: they
 *  hold the shoulders apart, so aiming one flat into the sagittal plane —
 *  which is what every other bone here wants — would collapse both shoulders
 *  onto the spine. They keep their lateral reach and swing only up/down and
 *  fore/aft, which is exactly the movement "raise the shoulder for the punch"
 *  is asking for. */
const SEGMENT_BONE = [
  ["pelvis", "chest", "Spine", true],
  ["chest", "neck", "Spine2", true],
  // The neck aims from the SHOULDER LINE, not from the read's `neck` joint.
  // The rig's Neck bone starts between the shoulders; the read's neck joint is
  // drawn where a neck looks like it is, halfway up. Measuring the head's
  // direction from the higher point over-states the bend by the same few
  // degrees every time — every upright frame in Yuji's sheet came out craning
  // forward by 8.1°, the same number three times over, which is the signature
  // of a convention error rather than a reading. From the shoulders it is 5°
  // in the idle and 0° in the jab, which is what the drawings show.
  ["shoulderMid", "head", "Neck", true],
  ["chest", "shoulderL", "LeftShoulder", false],
  ["shoulderL", "elbowL", "LeftArm", true],
  ["elbowL", "handL", "LeftForeArm", true],
  ["chest", "shoulderR", "RightShoulder", false],
  ["shoulderR", "elbowR", "RightArm", true],
  ["elbowR", "handR", "RightForeArm", true],
  ["hipL", "kneeL", "LeftUpLeg", true],
  ["kneeL", "footL", "LeftLeg", true],
  ["footL", "toeL", "LeftFoot", true],
  ["hipR", "kneeR", "RightUpLeg", true],
  ["kneeR", "footR", "RightLeg", true],
  ["footR", "toeR", "RightFoot", true],
];
/** The child each driven bone points AT in the bind pose. Its offset gives the
 *  bone's own forward direction without hardcoding one rig's axis convention. */
const BONE_TIP = {
  Spine: "Spine1", Spine2: "Neck", Neck: "Head",
  LeftShoulder: "LeftArm", RightShoulder: "RightArm",
  LeftArm: "LeftForeArm", LeftForeArm: "LeftHand",
  RightArm: "RightForeArm", RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot", LeftFoot: "LeftToeBase",
  RightUpLeg: "RightLeg", RightLeg: "RightFoot", RightFoot: "RightToeBase",
};

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v) => Math.round(v * 10) / 10;
const DEG = Math.PI / 180;

// ------------------------------------------------------------------- depth
//
// A joint is [x, y] or [x, y, z]. The third number is DEPTH — toward the
// camera, in the same cell percent as the other two — and it is absent until
// somebody sets it, which is the honest default: a side-on drawing does not
// say how far a fist travels toward the lens.
//
// It exists for the poses the drawing plane cannot hold. An arm angled inward
// across the chest is a real pose that reads flat as a short arm, and no
// amount of dragging in two dimensions fixes it. Turn the view (View 3D), drag
// the hand, and the drag lands in the plane you are looking at — which is how
// the depth gets in.
const depth = (pt) => (pt.length > 2 ? pt[2] : 0);
const hasDepth = (j) => JOINTS.some((n) => j[n] && depth(j[n]) !== 0);

/** Project a joint through the current view. Returns [screenX, screenY, near],
 *  all in cell percent; `near` is the depth after turning, for sorting. */
function project(pt, view) {
  const { yaw, pitch, dolly, cx, cy } = view;
  const X = pt[0] - cx;
  const Y = -(pt[1] - cy);
  const Z = depth(pt);
  const cy_ = Math.cos(yaw * DEG);
  const sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG);
  const sp = Math.sin(pitch * DEG);
  const Xr = X * cy_ + Z * sy;
  const Zr = -X * sy + Z * cy_;
  const Yr = Y * cp - Zr * sp;
  const Zr2 = Y * sp + Zr * cp;
  return [cx + Xr * dolly, cy - Yr * dolly, Zr2];
}

/** The camera's right and up axes, in cell space — the inverse of `project`
 *  for a drag, so a hand dragged across a turned view moves across the view
 *  and not across the drawing. */
function screenAxes({ yaw, pitch, dolly }) {
  const cy_ = Math.cos(yaw * DEG);
  const sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG);
  const sp = Math.sin(pitch * DEG);
  // In (X, Y, Z) with Y up; cell y counts down, hence the negation on return.
  const right = [cy_, 0, sy];
  const up = [sy * sp, cp, -cy_ * sp];
  return { right, up, dolly };
}

/** Where the view turns about: the middle of the joints it is turning. */
function pivotOf(j) {
  const pts = JOINTS.map((n) => j[n]).filter(Boolean);
  if (!pts.length) return { cx: 50, cy: 50 };
  return {
    cx: pts.reduce((a, p) => a + p[0], 0) / pts.length,
    cy: pts.reduce((a, p) => a + p[1], 0) / pts.length,
  };
}

const viewOf = (j) => ({ ...orbit.state, ...pivotOf(j) });

const ui = {
  char: new URLSearchParams(location.search).get("char") || "yuji",
  pose: new URLSearchParams(location.search).get("pose") || null,
  sel: null,
  ghost: 0.4,
  showSprite: true,
};

/** Free look, shared with the clip bench (orbit.js). Turning it drives both
 *  panes off one angle: the rig's camera and the joint overlay on the plate.
 *  Two views of one pose that disagree about where you are standing is worse
 *  than one view. */
const orbit = makeOrbit(() => {
  if (!ui.pose || !reads.has(ui.char)) return;
  applyTurn();
  refreshDrag();
});

/** char -> the read file as loaded, with edits already folded in. */
const reads = new Map();
let manifest = null;
/** Per-pose undo stacks, keyed `char/pose`. */
const undo = new Map();

// ------------------------------------------------------------------ session
//
// Edits live for as long as the tab does, and no longer. They used to be kept
// in localStorage, which sounded like a kindness and was not: the way this
// tool is used is edit-a-few-frames-then-download, so a reload is how you say
// "start again from what is on disk" — and a stored edit silently outranked
// the file, so corrections that HAD been applied to the tree kept coming back
// as the old pose. Worse, a stored pose is a snapshot of the joint set as it
// was: when feet grew toes, every held edit became a pose with no toe in it,
// and the editor drew a handle for a joint that was not there. Anything left
// over from that era is cleared on the way in.

const SESSION = new Map();                    // `char/pose` -> { j, read }
const editKey = (char, pose) => `${char}/${pose}`;

function clearStaleStorage() {
  try { localStorage.removeItem(STORE); } catch { /* private mode, fine */ }
}
function noteEdit(char, pose, patch) {
  const held = SESSION.get(editKey(char, pose)) || {};
  SESSION.set(editKey(char, pose), { ...held, ...patch });
}
const editedPoses = (char) =>
  [...SESSION.keys()].filter((k) => k.startsWith(`${char}/`)).map((k) => k.split("/")[1]);
const editedChars = () => [...new Set([...SESSION.keys()].map((k) => k.split("/")[0]))];

// --------------------------------------------------------------------- data

/** A pose from a file written before a joint existed still has to draw. Every
 *  joint the editor knows about gets a value, derived the same way
 *  tools/pose_reads.py derives it, so old data opens instead of throwing. */
function fillJoints(j) {
  for (const side of ["L", "R"]) {
    if (j[`toe${side}`]) continue;
    const foot = j[`foot${side}`];
    const knee = j[`knee${side}`];
    if (!foot || !knee) continue;
    const dx = foot[0] - knee[0];
    const dy = foot[1] - knee[1];
    const len = Math.hypot(dx, dy) || 1;
    let px = -dy / len;
    let py = dx / len;
    if (px < 0) { px = -px; py = -py; }
    j[`toe${side}`] = [round1(clamp(foot[0] + px * 4, 0, 100)),
                       round1(clamp(foot[1] + py * 4, 0, 100))];
  }
  return j;
}

async function loadRead(char) {
  if (reads.has(char)) return reads.get(char);
  // Cache-bust: this file changes every time a correction lands in the tree,
  // and a stale copy looks exactly like "my edit did not save".
  const res = await fetch(`${READS_URL}${char}.json?t=${Date.now()}`, { cache: "reload" });
  if (!res.ok) throw new Error(`no pose read for ${char} (${res.status})`);
  const data = await res.json();
  for (const [key, pose] of Object.entries(data.poses)) {
    fillJoints(pose.j);
    const edit = SESSION.get(editKey(char, key));
    if (edit?.j) { pose.j = edit.j; pose.source = "pose editor"; delete pose.seed; }
    if (edit?.read !== undefined) pose.read = edit.read;
  }
  reads.set(char, data);
  return data;
}

const frameMeta = (char, key) => manifest.characters[char]?.[key];
const faceLeft = (char, key) =>
  !!frameMeta(char, key)?.faceLeft || !!manifest.nativeLeft?.[char]?.includes(key);
const spriteSrc = (char, key) => `${SPRITES_URL}${frameMeta(char, key).file}`;

// -------------------------------------------------------------------- 3D

const three = {
  renderer: null, scene: null, camera: null, root: null, bind: null, char: null,
};

function initThree(canvas) {
  three.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  three.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  three.scene = new THREE.Scene();
  // A side-on camera, because a read IS a side-on document: the fighter faces
  // +Z, so standing the camera on -X puts their facing to screen-right and
  // their near (right) limbs toward the lens — the sprite's own viewpoint.
  three.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-3, 4, 2.5);
  three.scene.add(key, new THREE.HemisphereLight(0xc9d8ff, 0x2a2f3d, 1.5));
}

/** Remember the rig's rest rotations so every pose starts from the same place
 *  rather than accumulating onto the last one. */
function bindRig(root) {
  const bind = [];
  root.traverse((o) => { if (o.isBone) bind.push([o, o.quaternion.clone()]); });
  return bind;
}

/** Bones by name, tolerating a delivered rig's prefix (`mixamorig:Hips`). */
function boneIndex(root) {
  const map = new Map();
  root.traverse((o) => {
    if (!o.isBone) return;
    const bare = o.name.includes(":") ? o.name.split(":").pop() : o.name;
    if (!map.has(bare)) map.set(bare, o);
  });
  return map;
}

async function showRig(char) {
  if (three.char === char) return;
  if (three.root) three.scene.remove(three.root);
  await rigs.ensureRig(char, GLTFLoader);
  const entry = rigs.getRig(char);
  three.char = char;
  three.root = entry?.root || null;
  if (!three.root) return;
  three.root.rotation.set(0, entry.yawOffset || 0, 0);
  three.scene.add(three.root);
  three.bind = bindRig(three.root);
  three.bones = boneIndex(three.root);
  three.height = entry.height || 1.75;
}

/** A joint, or one of the midpoints a bone actually hangs off. */
function jointAt(j, name) {
  if (name === "shoulderMid") {
    if (!j.shoulderL || !j.shoulderR) return null;
    return [(j.shoulderL[0] + j.shoulderR[0]) / 2,
            (j.shoulderL[1] + j.shoulderR[1]) / 2,
            (depth(j.shoulderL) + depth(j.shoulderR)) / 2];
  }
  return j[name];
}

const _dir = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _boneQ = new THREE.Quaternion();
const _want = new THREE.Vector3();
const _parentQ = new THREE.Quaternion();

/** Turn the read into rig rotations: every driven bone is swung, in the
 *  sagittal plane only, until it points the way the drawing does. */
function poseFromJoints(j) {
  if (!three.root || !three.bind) return;
  for (const [bone, q] of three.bind) bone.quaternion.copy(q);
  three.root.updateMatrixWorld(true);

  for (const [a, b, boneName, inPlane] of SEGMENT_BONE) {
    const bone = three.bones.get(boneName);
    // The tip is the child the bone points at in the bind pose; any rig that
    // names its bones differently still has a first child in the right place.
    const tip = three.bones.get(BONE_TIP[boneName]) || bone?.children.find((c) => c.isBone);
    if (!bone || !tip || !bone.parent) continue;
    // Screen x is world +Z (the facing), screen y counts DOWN, world y counts up.
    const from = jointAt(j, a);
    const to = jointAt(j, b);
    if (!from || !to) continue;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    // Depth, when the read carries any. Cell x is world +Z (the facing), cell
    // y counts down, and cell depth points at the camera, which stands on -X.
    const dz = depth(to) - depth(from);
    if (!dx && !dy && !dz) continue;
    _dir.set(-dz, -dy, dx).normalize();

    // Swing the bone from where it rests to where the drawing wants it, in the
    // PARENT's frame: the smallest rotation that takes the bone's current tip
    // direction onto the target, pre-multiplied so it composes with the bind
    // rather than replacing it. Replacing looked simpler and was wrong — it
    // discards whatever twist the rig's rest pose carries, which on a
    // delivered model is what keeps the chest square to the camera.
    // The bone's tip, as a world direction. Bone offsets are bone-LOCAL (this
    // rig runs every one of them along its own +Y), so the only frame in which
    // "up", "across" and "forward" mean anything is the world's.
    bone.getWorldQuaternion(_boneQ);
    _tip.copy(tip.position).applyQuaternion(_boneQ).normalize();

    _want.copy(_dir);
    if (!inPlane) {
      // Keep the bone's reach ACROSS the body and turn only the part of it the
      // drawing can see. Without this a clavicle aimed at a flat sagittal
      // target swings the shoulder into the midline and drags the collar with
      // it — which is what "raise his shoulder" must not do.
      const across = _tip.x;
      const rest = Math.sqrt(Math.max(0, 1 - across * across));
      const planar = Math.hypot(_dir.y, _dir.z) || 1;
      _want.set(across, (_dir.y / planar) * rest, (_dir.z / planar) * rest);
    }
    _swing.setFromUnitVectors(_tip, _want);

    // Apply a world rotation to a local one: undo the parent, turn, redo it.
    bone.parent.getWorldQuaternion(_parentQ);
    _inv.copy(_parentQ).invert();
    bone.quaternion.premultiply(_parentQ).premultiply(_swing).premultiply(_inv);
    bone.updateMatrixWorld(true);
  }
  three.root.updateMatrixWorld(true);
}


function drawThree() {
  const canvas = three.renderer?.domElement;
  if (!canvas || !three.root) return;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 320;
  three.renderer.setSize(w, h, false);
  three.camera.aspect = w / h;

  const box = new THREE.Box3().setFromObject(three.root);
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.y, size.z, 0.4) * 1.25;
  const dist = span / (2 * Math.tan((three.camera.fov * Math.PI) / 360)) / orbit.state.dolly;
  // The rest camera is side-on off the fighter's right (-X, facing +Z), which
  // is the sprite's own viewpoint. Free look is an offset on that, turned the
  // same way and by the same amount as the overlay on the plate.
  const yaw = orbit.state.yaw * DEG;
  const pitch = orbit.state.pitch * DEG;
  three.camera.position.set(
    mid.x - dist * Math.cos(pitch) * Math.cos(yaw),
    mid.y + dist * Math.sin(pitch),
    mid.z - dist * Math.cos(pitch) * Math.sin(yaw),
  );
  three.camera.lookAt(mid);
  three.camera.updateProjectionMatrix();
  three.renderer.render(three.scene, three.camera);
}

// --------------------------------------------------------------------- view

/** Draw whatever joints are present, and draw nothing for the ones that are
 *  not. A pose from an older file — or from a stale copy of this page — can be
 *  short a joint the current build knows about, and when that happened the
 *  figure did not lose a limb, it threw: one undefined joint took out the
 *  whole picker, which reads as "the editor is broken" rather than "this pose
 *  is missing a toe". Missing joints are worth SAYING, once, and worth
 *  surviving. */
function mannequinSVG(j, { handles = false, label = "", flat = false } = {}) {
  const missing = JOINTS.filter((n) => !Array.isArray(j[n]));
  if (missing.length) {
    console.warn(`pose editor: ${label || "a pose"} has no ${missing.join(", ")} — `
      + "drawing the joints it does have. Reload to pick up the current read.");
  }
  const has = (n) => Array.isArray(j[n]);
  // Every joint goes through the view, so the overlay and the rig are looking
  // from the same place. At rest the projection is the identity and this is
  // the flat drawing it always was.
  // The picker draws flat whatever the view is doing: a thumbnail is for
  // finding a frame, and forty foreshortened stick figures is not a contact
  // sheet, it is noise.
  const view = flat ? { yaw: 0, pitch: 0, dolly: 1, ...pivotOf(j) } : viewOf(j);
  const at = {};
  for (const n of JOINTS) if (has(n)) at[n] = project(j[n], view);
  const p = (n) => `${at[n][0].toFixed(2)} ${at[n][1].toFixed(2)}`;
  const line = (a, b) => (has(a) && has(b)
    ? `<line class="bone ${SIDE(a) === "far" || SIDE(b) === "far" ? "far" : "near"}" `
      + `x1="${at[a][0].toFixed(2)}" y1="${at[a][1].toFixed(2)}" `
      + `x2="${at[b][0].toFixed(2)}" y2="${at[b][1].toFixed(2)}"/>`
    : "");
  const parts = [
    ["shoulderL", "shoulderR", "hipR", "hipL"].every(has)
      ? `<polygon class="torso" points="${p("shoulderL")} ${p("shoulderR")} ${p("hipR")} ${p("hipL")}"/>`
      : "",
    ...Object.entries(PARENT).map(([child, parent]) => line(parent, child)),
    line("shoulderL", "shoulderR"), line("hipL", "hipR"),
  ];
  if (has("head") && has("neck")) {
    const r = Math.max(2.6, Math.hypot(at.head[0] - at.neck[0], at.head[1] - at.neck[1]) * 0.8);
    parts.push(`<circle class="skull" cx="${at.head[0].toFixed(2)}" cy="${at.head[1].toFixed(2)}" `
      + `r="${r.toFixed(1)}"/>`);
  }
  if (handles) {
    for (const name of JOINTS.filter(has)) {
      parts.push(
        `<circle class="handle ${SIDE(name)}${depth(j[name]) ? " deep" : ""}" data-joint="${name}" `
        + `cx="${at[name][0].toFixed(2)}" cy="${at[name][1].toFixed(2)}" r="2.1">`
        + `<title>${name}${depth(j[name]) ? ` (depth ${depth(j[name]).toFixed(1)})` : ""}</title>`
        + `</circle>`);
    }
  } else {
    for (const name of ["handL", "handR", "toeL", "toeR"].filter(has)) {
      parts.push(`<circle class="tip ${SIDE(name)}" cx="${at[name][0].toFixed(2)}" `
        + `cy="${at[name][1].toFixed(2)}" r="1.6"/>`);
    }
  }
  return parts.join("");
}

function plateHTML(char, key, j, { handles = false, flat = false } = {}) {
  const flip = faceLeft(char, key) ? ' class="flip"' : "";
  return `<img${flip} src="${spriteSrc(char, key)}" alt="${key}" loading="lazy">`
    + `<svg class="rigline" viewBox="0 0 100 100" preserveAspectRatio="none">`
    + `${mannequinSVG(j, { handles, flat, label: `${char}/${key}` })}</svg>`;
}

function renderPicker() {
  const data = reads.get(ui.char);
  const edited = new Set(editedPoses(ui.char));
  const list = $("#poseList");
  list.innerHTML = Object.entries(data.poses).map(([key, pose]) => `
    <button class="thumb ${key === ui.pose ? "on" : ""} ${edited.has(key) ? "edited" : ""}"
            data-pose="${key}" title="${key}">
      <span class="plate mini">${plateHTML(ui.char, key, pose.j, { flat: true })}</span>
      <span class="thumb-name">${key}</span>
    </button>`).join("");
  $("#poseCount").textContent =
    `${Object.keys(data.poses).length} frames · ${edited.size} edited`;
}

function renderEditor() {
  const data = reads.get(ui.char);
  const pose = data.poses[ui.pose];
  if (!pose) return;
  $("#plate").innerHTML = plateHTML(ui.char, ui.pose, pose.j, { handles: true });
  $("#poseName").textContent = ui.pose;
  // Three different things, and conflating them cost a round trip: what YOU
  // changed since the page loaded, what a human placed at some point and is
  // already in the tree, and what is still a fitted guess.
  const mine = SESSION.has(editKey(ui.char, ui.pose));
  const stamp = mine ? "edited here" : pose.source ? "hand-placed on disk"
    : pose.seed ? pose.seed : "read by eye";
  $("#poseStamp").textContent = stamp;
  $("#poseStamp").className = `stamp ${mine ? "on" : pose.source ? "read" : pose.seed ? "seed" : "read"}`;
  $("#poseNote").value = pose.read || "";
  $("#depthNote").hidden = !hasDepth(pose.j);
  $("#faceNote").hidden = !faceLeft(ui.char, ui.pose);
  $("#jointList").innerHTML = JOINTS.map((n) => `
    <li class="${n === ui.sel ? "on" : ""}" data-joint="${n}">
      <span>${n}</span><b>${pose.j[n]
        ? `${pose.j[n][0].toFixed(1)}, ${pose.j[n][1].toFixed(1)}`
          + (depth(pose.j[n]) ? `, ${depth(pose.j[n]).toFixed(1)}` : "") : "—"}</b></li>`).join("");
  poseFromJoints(pose.j);
  drawThree();
}

/**
 * What the rest of the page does when the view turns.
 *
 * The sprite behind the joints is a DRAWING, made from one angle. Turn away
 * from that angle and it stops being a reference and starts being a picture
 * the figure no longer matches — so it fades as the view turns, far enough to
 * stop reading it as truth, not so far that you lose where the body is. The
 * angle is shown as a number because "roughly back to flat" is not a place you
 * can find by dragging, and Reset is one click.
 */
function applyTurn() {
  const box = $("#poseView3dBox");
  const plate = $("#plate");
  if (!box || !plate) return;
  box.classList.toggle("on", orbit.on);
  $("#poseView3d").checked = orbit.on;
  plate.classList.toggle("turned", !orbit.atRest);
  // 0.55 flat-on, easing to 0.22 by a quarter turn: dim enough to stop reading
  // it as the thing to match, present enough to still see where the body is.
  plate.style.setProperty("--sprite-dim", (0.55 - 0.33 * orbit.turned).toFixed(3));
  const angle = $("#viewAngle");
  if (angle) {
    angle.hidden = orbit.atRest;
    angle.textContent = `${Math.round(orbit.state.yaw)}° / ${Math.round(orbit.state.pitch)}°`
      + (orbit.state.dolly !== 1 ? ` · ${orbit.state.dolly.toFixed(2)}×` : "");
  }
}

/** Redraw only what a drag moves, so dragging stays at frame rate. */
function refreshDrag() {
  const pose = reads.get(ui.char).poses[ui.pose];
  $("#plate .rigline").innerHTML = mannequinSVG(pose.j, { handles: true });
  poseFromJoints(pose.j);
  drawThree();
}

// ------------------------------------------------------------------ editing

function pushUndo() {
  const key = `${ui.char}/${ui.pose}`;
  const pose = reads.get(ui.char).poses[ui.pose];
  const stack = undo.get(key) || [];
  stack.push(JSON.parse(JSON.stringify(pose.j)));
  if (stack.length > 40) stack.shift();
  undo.set(key, stack);
}

function commit() {
  const pose = reads.get(ui.char).poses[ui.pose];
  pose.source = "pose editor";
  delete pose.seed;
  noteEdit(ui.char, ui.pose, { j: pose.j });
  renderEditor();
  renderPicker();
}

/**
 * Move a joint by a drag measured ON SCREEN, and its chain with it.
 *
 * At rest that is what it has always been: cell x and cell y, one to one. With
 * the view turned it is the same gesture in the plane you are actually looking
 * at, which is the whole point of turning it — the movement decomposes into
 * cell x, y AND depth, so an arm can be angled inward by looking from above
 * and pulling the hand across.
 */
function moveJoint(name, dsx, dsy, { chain = true } = {}) {
  const pose = reads.get(ui.char).poses[ui.pose];
  const { right, up, dolly } = screenAxes(orbit.state);
  const a = dsx / dolly;
  const b = -dsy / dolly;
  const dx = right[0] * a + up[0] * b;
  const dyUp = right[1] * a + up[1] * b;
  const dz = right[2] * a + up[2] * b;
  const names = (chain ? [name, ...descendants(name)] : [name]).filter((n) => pose.j[n]);
  for (const n of names) {
    const pt = pose.j[n];
    pt[0] = round1(clamp(pt[0] + dx, 0, 100));
    pt[1] = round1(clamp(pt[1] - dyUp, 0, 100));
    const z = round1(clamp(depth(pt) + dz, -60, 60));
    // Depth is only written once there is some: a pose edited flat-on stays a
    // two-number pose, and the file stays a file about a drawing.
    if (z || pt.length > 2) pt[2] = z;
  }
}

function bindPlate() {
  const plate = $("#plate");
  let drag = null;

  const at = (e) => {
    const r = plate.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  };

  plate.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-joint]");
    if (!handle) return;
    const name = handle.dataset.joint;
    ui.sel = name;
    pushUndo();
    const pose = reads.get(ui.char).poses[ui.pose];
    // Track the pointer in SCREEN cell units and hand moveJoint the delta: with
    // the view turned there is no longer one cell coordinate under the cursor.
    const [x, y] = at(e);
    const shown = project(pose.j[name], viewOf(pose.j));
    drag = { name, ox: shown[0] - x, oy: shown[1] - y, sx: shown[0], sy: shown[1],
             chain: !e.shiftKey, moved: false };
    plate.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  plate.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [x, y] = at(e);
    const wantX = clamp(x + drag.ox, 0, 100);
    const wantY = clamp(y + drag.oy, 0, 100);
    moveJoint(drag.name, wantX - drag.sx, wantY - drag.sy, { chain: drag.chain });
    drag.sx = wantX;
    drag.sy = wantY;
    drag.moved = true;
    refreshDrag();
  });

  const end = () => {
    if (!drag) return;
    if (drag.moved) commit(); else renderEditor();
    drag = null;
  };
  plate.addEventListener("pointerup", end);
  plate.addEventListener("pointercancel", end);

  // WHO OWNS A PRESS. On the plate a handle always edits — this is an editor,
  // and refusing to move a joint because the view is turned would take away
  // the only way to author depth. Empty space turns the view instead, and only
  // while free look is on. On the rig canvas there is nothing to edit, so
  // every drag turns.
  orbit.bind(plate, (ev) => orbit.on && !ev.target.closest("[data-joint]"));
  orbit.bind($("#rigView"), () => orbit.on);
}

function bindKeys() {
  addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
      const stack = undo.get(`${ui.char}/${ui.pose}`);
      if (stack?.length) {
        reads.get(ui.char).poses[ui.pose].j = stack.pop();
        commit();
      }
      e.preventDefault();
      return;
    }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step || !ui.sel) return;
    const k = e.shiftKey ? 2 : 0.5;
    pushUndo();
    moveJoint(ui.sel, step[0] * k, step[1] * k, { chain: !e.altKey });
    commit();
    e.preventDefault();
  });
}

// ------------------------------------------------------------------- export

/** The character's whole read, in the exact shape of the on-disk file, so a
 *  finished character is a copy into sprites/docs/pose-reads/ and nothing else. */
function exportChar(char) {
  const data = reads.get(char);
  const poses = {};
  for (const [key, pose] of Object.entries(data.poses)) {
    const out = {};
    if (pose.read) out.read = pose.read;
    if (pose.source) out.source = pose.source;
    else if (pose.seed) out.seed = pose.seed;
    if (pose.flags) out.flags = pose.flags;
    // Export every joint the format has; a pose short of one is exported short
    // of it too, and tools/pose_apply.py is where that gets caught and named.
    out.j = Object.fromEntries(JOINTS.filter((n) => pose.j[n]).map((n) => [n, pose.j[n]]));
    poses[key] = out;
  }
  return {
    character: char,
    facing: "right",
    _about: data._about,
    _joints: JOINTS,
    poses,
  };
}

function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --------------------------------------------------------------------- boot

function shell() {
  const chars = CHARACTER_KEYS.filter((c) => c !== "effects");
  document.body.dataset.mode = "pose";
  // The page's own header belongs to the other two benches — its hints and
  // its mode links are theirs, and their show/hide rules key off a body class
  // this bench does not wear. Strip them, say which bench is running, and turn
  // this one's entry point into the way back out.
  $(".bar strong").textContent = "Sprite Joint Reads";
  document.querySelectorAll(".bar .pose-only, .bar .anim-only").forEach((el) => el.remove());
  $("#facingReviewTop")?.remove();
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "Eighteen joints a frame, read off the art as the engine draws it. "
    + "Edits last until you reload — download before you go.";
  $(".bar strong").after(hint);
  const link = $('.bar a[href="./?edit=pose"]');
  if (link) { link.href = "./"; link.textContent = "← 3D Workbench"; }
  showBuild();
  $("main.layout").outerHTML = `
    <main class="poseedit">
      <aside class="picker">
        <div class="picker-head">
          <select id="charPick">${chars.map((c) =>
            `<option value="${c}" ${c === ui.char ? "selected" : ""}>${CHARACTERS[c]?.name || c}</option>`).join("")}</select>
          <span class="hint" id="poseCount"></span>
        </div>
        <div class="thumbs" id="poseList"></div>
      </aside>

      <section class="editor">
        <div class="edit-head">
          <b class="mono" id="poseName">—</b>
          <span id="poseStamp" class="stamp"></span>
          <button id="viewAngle" class="angle" hidden
                  title="The view is turned away from the drawing's angle — click to go back"></button>
          <span class="grow"></span>
          <button id="btnSwap" class="ghost sm" title="This drawing's near limbs are the other side's — exchange left and right">⇄ Swap L/R</button>
          <button id="btnSnap" class="ghost sm" title="Pull every joint onto the drawing">Snap to art</button>
          <button id="btnReset" class="ghost sm" title="Throw away this frame's edits">Reset frame</button>
          <button id="btnExport" class="primary sm">⤓ Download this character</button>
          <button id="btnExportAll" class="ghost sm">⤓ All edited</button>
        </div>

        <div class="panes">
          <div class="pane">
            <div class="plate big" id="plate"></div>
            <p class="hint">Drag a joint to move it and everything below it in the
              chain. <kbd>Shift</kbd>-drag moves the one joint. Arrow keys nudge the
              selected joint, <kbd>Shift</kbd> for a bigger step, <kbd>Alt</kbd> for
              that joint alone. <kbd>⌘Z</kbd> undoes.</p>
            <p class="hint">Red handles are the fighter's RIGHT side — the one nearer
              the camera when they face right. In a punch that is usually the
              chambered arm, not the extended one: the extended arm is normally
              drawn passing behind the collar, which puts it on the far side. If a
              whole pose is the wrong way round, <b>Swap L/R</b>. The two
              <b>toe</b> handles set which way each foot points.</p>
            <p class="hint" id="depthNote" hidden>This pose carries DEPTH — one or
              more joints sit off the drawing's plane. Turn the view on to see it.</p>
            <p class="hint warn" id="faceNote" hidden>This frame is delivered facing
              LEFT and mirrored by the engine. It is shown here mirrored, the way the
              game draws it — pose it as you see it.</p>
          </div>
          <div class="pane">
            <div class="rigwrap">
              <canvas id="rigView"></canvas>
              <label class="check view3d" id="poseView3dBox"
                     title="Drag to turn, scroll to move in. Both panes turn together; off returns to the drawing's own angle.">
                <input id="poseView3d" type="checkbox"> View 3D
              </label>
            </div>
            <p class="hint">The fighter's own rig: spine, neck, both clavicles,
              arms, legs and feet, each turned to match the joints. <b>View 3D</b>
              turns this pane and the plate together — drag either, scroll to move
              in — and a joint dragged while turned gains DEPTH, which is how a pose
              the drawing cannot hold (an arm angled inward, a foot rolled out) gets
              said. Off returns both to the drawing's own angle. For a bone the read
              has no joint for, use the keyframe bench at
              <a href="./?edit=animation">?edit=animation</a>.</p>
            <label class="note-label" for="poseNote">What this frame is doing</label>
            <textarea id="poseNote" rows="3" placeholder="e.g. three-point stance, far hand planted, rear leg stretched back"></textarea>
            <ul class="joints" id="jointList"></ul>
          </div>
        </div>
      </section>
    </main>`;
}

/** When this file was last written, in the bar. The editor is served with
 *  no-store, so a page that is behind is a checkout that is behind — and the
 *  only way to tell by looking used to be to notice that a fix was missing. */
async function showBuild() {
  try {
    const res = await fetch(import.meta.url, { method: "HEAD", cache: "reload" });
    const when = res.headers.get("last-modified");
    if (!when) return;
    const stamp = document.createElement("span");
    stamp.className = "hint build";
    stamp.textContent = `build ${new Date(when).toISOString().slice(0, 16).replace("T", " ")}`;
    stamp.title = "When this build of the editor was written. If it is older than a "
      + "change you are looking for, the checkout is behind — git pull, then reload.";
    $(".bar").append(stamp);
  } catch { /* a HEAD that fails is not worth a broken page */ }
}

async function selectChar(char) {
  ui.char = char;
  const data = await loadRead(char);
  const keys = Object.keys(data.poses);
  if (!ui.pose || !data.poses[ui.pose]) ui.pose = keys.includes("idle_a") ? "idle_a" : keys[0];
  const url = new URL(location.href);
  url.searchParams.set("edit", "pose");
  url.searchParams.set("char", char);
  history.replaceState(null, "", url);
  await showRig(char);
  renderPicker();
  renderEditor();
}

async function boot() {
  shell();
  clearStaleStorage();
  manifest = await (await fetch(MANIFEST_URL, { cache: "no-cache" })).json();
  initThree($("#rigView"));
  initPose(THREE);
  // Mannequins for everyone and no GLB fetched up front: a tool that looks at
  // one fighter at a time pays for one fighter at a time (loader.js initRigs).
  await rigs.initRigs(THREE, GLTFLoader, ["all"], CHARACTER_KEYS, []);

  $("#charPick").addEventListener("change", (e) => { ui.pose = null; selectChar(e.target.value); });
  $("#poseList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pose]");
    if (!btn) return;
    ui.pose = btn.dataset.pose;
    ui.sel = null;
    renderPicker();
    renderEditor();
  });
  $("#jointList").addEventListener("click", (e) => {
    const li = e.target.closest("[data-joint]");
    if (li) { ui.sel = li.dataset.joint; renderEditor(); }
  });
  $("#poseNote").addEventListener("input", (e) => {
    reads.get(ui.char).poses[ui.pose].read = e.target.value;
    noteEdit(ui.char, ui.pose, { read: e.target.value });
  });
  $("#btnReset").addEventListener("click", async () => {
    SESSION.delete(editKey(ui.char, ui.pose));
    reads.delete(ui.char);
    await loadRead(ui.char);
    renderPicker();
    renderEditor();
  });
  $("#poseView3d").addEventListener("change", (e) => orbit.setOn(e.target.checked));
  $("#viewAngle").addEventListener("click", () => orbit.reset());
  $("#btnSnap").addEventListener("click", () => { snapToArt(); });
  $("#btnSwap").addEventListener("click", () => {
    const pose = reads.get(ui.char).poses[ui.pose];
    pushUndo();
    const swapped = { ...pose.j };
    for (const part of SIDED) {
      if (!pose.j[`${part}L`] || !pose.j[`${part}R`]) continue;
      swapped[`${part}L`] = pose.j[`${part}R`];
      swapped[`${part}R`] = pose.j[`${part}L`];
    }
    pose.j = swapped;
    commit();
  });
  $("#btnExport").addEventListener("click", () => download(`${ui.char}.json`, exportChar(ui.char)));
  $("#btnExportAll").addEventListener("click", async () => {
    const all = {};
    for (const char of editedChars()) {
      await loadRead(char);
      all[char] = exportChar(char);
    }
    download("pose-reads-edited.json", all);
  });
  addEventListener("resize", drawThree);
  bindPlate();
  bindKeys();
  await selectChar(ui.char);
  applyTurn();
  window.__workbenchReady = true;
}

// ------------------------------------------------------- snap to the drawing
//
// The same rule tools/pose_reads.py applies, run in the browser off the
// frame's own alpha: a joint belongs ON the body. It is a tidy-up for a seed
// that landed beside a limb, not a substitute for placing the joint — nearest
// ink is happy to put an elbow on the nearest thigh.

let snapCanvas = null;
function snapToArt() {
  // Nearest-ink is a statement about the DRAWING, so it only means anything
  // from the drawing's own angle.
  if (!orbit.atRest) { orbit.reset(); }
  const pose = reads.get(ui.char).poses[ui.pose];
  const img = $("#plate img");
  if (!img?.complete) return;
  const N = 160;
  snapCanvas ||= document.createElement("canvas");
  snapCanvas.width = snapCanvas.height = N;
  const ctx = snapCanvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, N, N);
  const s = N / Math.max(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.save();
  if (faceLeft(ui.char, ui.pose)) { ctx.translate(N, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, (N - w) / 2, (N - h) / 2, w, h);
  ctx.restore();
  const alpha = ctx.getImageData(0, 0, N, N).data;
  const ink = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) if (alpha[(y * N + x) * 4 + 3] > 60) ink.push([x, y]);
  }
  if (!ink.length) return;

  pushUndo();
  for (const name of JOINTS.filter((n) => pose.j[n])) {
    const cx = (pose.j[name][0] * N) / 100;
    const cy = (pose.j[name][1] * N) / 100;
    let best = null;
    let bestD = Infinity;
    for (const [x, y] of ink) {
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) { bestD = d; best = [x, y]; }
    }
    if (Math.sqrt(bestD) * (100 / N) <= 1.5) continue;
    pose.j[name] = [
      round1(clamp((best[0] + (best[0] - cx) * 0.4) * (100 / N), 0, 100)),
      round1(clamp((best[1] + (best[1] - cy) * 0.4) * (100 / N), 0, 100)),
    ];
  }
  commit();
}

boot().catch((err) => {
  const el = document.getElementById("bootError");
  if (el) { el.textContent = `The pose editor failed to start: ${err.message}`; el.hidden = false; }
  throw err;
});
