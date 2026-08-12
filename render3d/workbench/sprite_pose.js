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
//   DEPTH IS NOT IN THE DATA. A read is the sagittal plane and nothing else.
//   The 3D preview therefore poses each bone by turning it IN that plane and
//   leaves the third axis at rest — which is honest about what a read knows,
//   and is why the preview is a check on the read rather than a finished clip.
//
// The output is a JSON file per character in exactly the on-disk format, so a
// finished character is a file copy into sprites/docs/pose-reads/.

import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import * as rigs from "../src/loader.js";
import { initPose } from "../src/pose.js";
import { CHARACTER_KEYS, CHARACTERS } from "../../src/characters.js";

const READS_URL = "../../sprites/docs/pose-reads/";
const SPRITES_URL = "../../sprites/assets/";
const MANIFEST_URL = `${SPRITES_URL}manifest.json`;
/** Where in-progress edits live between reloads. */
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

const ui = {
  char: new URLSearchParams(location.search).get("char") || "yuji",
  pose: new URLSearchParams(location.search).get("pose") || null,
  sel: null,
  ghost: 0.4,
  showSprite: true,
};

/** char -> the read file as loaded, with edits already folded in. */
const reads = new Map();
let manifest = null;
/** Per-pose undo stacks, keyed `char/pose`. */
const undo = new Map();

// ------------------------------------------------------------------ storage

function loadEdits() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function saveEdit(char, pose, joints) {
  const all = loadEdits();
  ((all[char] ||= {})[pose] ||= {}).j = joints;
  all[char][pose].source = "pose editor";
  localStorage.setItem(STORE, JSON.stringify(all));
}
function saveNote(char, pose, text) {
  const all = loadEdits();
  ((all[char] ||= {})[pose] ||= {}).read = text;
  localStorage.setItem(STORE, JSON.stringify(all));
}
function dropEdit(char, pose) {
  const all = loadEdits();
  if (all[char]) { delete all[char][pose]; localStorage.setItem(STORE, JSON.stringify(all)); }
}
const editedPoses = (char) => Object.keys(loadEdits()[char] || {});

// --------------------------------------------------------------------- data

async function loadRead(char) {
  if (reads.has(char)) return reads.get(char);
  const res = await fetch(`${READS_URL}${char}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`no pose read for ${char} (${res.status})`);
  const data = await res.json();
  const edits = loadEdits()[char] || {};
  for (const [key, edit] of Object.entries(edits)) {
    const pose = data.poses[key];
    if (!pose) continue;
    if (edit.j) { pose.j = edit.j; pose.source = edit.source; delete pose.seed; }
    if (edit.read !== undefined) pose.read = edit.read;
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
    return [(j.shoulderL[0] + j.shoulderR[0]) / 2, (j.shoulderL[1] + j.shoulderR[1]) / 2];
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
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    if (!dx && !dy) continue;
    _dir.set(0, -dy, dx).normalize();

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
  const dist = span / (2 * Math.tan((three.camera.fov * Math.PI) / 360));
  three.camera.position.set(mid.x - dist, mid.y, mid.z);
  three.camera.lookAt(mid);
  three.camera.updateProjectionMatrix();
  three.renderer.render(three.scene, three.camera);
}

// --------------------------------------------------------------------- view

function mannequinSVG(j, { handles = false } = {}) {
  const p = (n) => `${j[n][0]} ${j[n][1]}`;
  const line = (a, b) =>
    `<line class="bone ${SIDE(a) === "far" || SIDE(b) === "far" ? "far" : "near"}" `
    + `x1="${j[a][0]}" y1="${j[a][1]}" x2="${j[b][0]}" y2="${j[b][1]}"/>`;
  const parts = [
    `<polygon class="torso" points="${p("shoulderL")} ${p("shoulderR")} ${p("hipR")} ${p("hipL")}"/>`,
    ...Object.entries(PARENT).map(([child, parent]) => line(parent, child)),
    line("shoulderL", "shoulderR"), line("hipL", "hipR"),
  ];
  const r = Math.max(2.6, Math.hypot(j.head[0] - j.neck[0], j.head[1] - j.neck[1]) * 0.8);
  parts.push(`<circle class="skull" cx="${j.head[0]}" cy="${j.head[1]}" r="${r.toFixed(1)}"/>`);
  if (handles) {
    for (const name of JOINTS) {
      parts.push(
        `<circle class="handle ${SIDE(name)}" data-joint="${name}" `
        + `cx="${j[name][0]}" cy="${j[name][1]}" r="2.1"><title>${name}</title></circle>`);
    }
  } else {
    for (const name of ["handL", "handR", "footL", "footR"]) {
      parts.push(`<circle class="tip ${SIDE(name)}" cx="${j[name][0]}" cy="${j[name][1]}" r="1.6"/>`);
    }
  }
  return parts.join("");
}

function plateHTML(char, key, j, { handles = false } = {}) {
  const flip = faceLeft(char, key) ? ' class="flip"' : "";
  return `<img${flip} src="${spriteSrc(char, key)}" alt="${key}" loading="lazy">`
    + `<svg class="rigline" viewBox="0 0 100 100" preserveAspectRatio="none">`
    + `${mannequinSVG(j, { handles })}</svg>`;
}

function renderPicker() {
  const data = reads.get(ui.char);
  const edited = new Set(editedPoses(ui.char));
  const list = $("#poseList");
  list.innerHTML = Object.entries(data.poses).map(([key, pose]) => `
    <button class="thumb ${key === ui.pose ? "on" : ""} ${edited.has(key) ? "edited" : ""}"
            data-pose="${key}" title="${key}">
      <span class="plate mini">${plateHTML(ui.char, key, pose.j)}</span>
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
  const stamp = pose.source ? `edited here` : pose.seed ? pose.seed : "read by eye";
  $("#poseStamp").textContent = stamp;
  $("#poseStamp").className = `stamp ${pose.source ? "on" : pose.seed ? "seed" : "read"}`;
  $("#poseNote").value = pose.read || "";
  $("#faceNote").hidden = !faceLeft(ui.char, ui.pose);
  $("#jointList").innerHTML = JOINTS.map((n) => `
    <li class="${n === ui.sel ? "on" : ""}" data-joint="${n}">
      <span>${n}</span><b>${pose.j[n][0].toFixed(1)}, ${pose.j[n][1].toFixed(1)}</b></li>`).join("");
  poseFromJoints(pose.j);
  drawThree();
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
  saveEdit(ui.char, ui.pose, pose.j);
  renderEditor();
  renderPicker();
}

function moveJoint(name, dx, dy, { chain = true } = {}) {
  const pose = reads.get(ui.char).poses[ui.pose];
  const names = chain ? [name, ...descendants(name)] : [name];
  for (const n of names) {
    pose.j[n][0] = round1(clamp(pose.j[n][0] + dx, 0, 100));
    pose.j[n][1] = round1(clamp(pose.j[n][1] + dy, 0, 100));
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
    const [x, y] = at(e);
    drag = { name, ox: pose.j[name][0] - x, oy: pose.j[name][1] - y, chain: !e.shiftKey, moved: false };
    plate.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  plate.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const pose = reads.get(ui.char).poses[ui.pose];
    const [x, y] = at(e);
    const wantX = clamp(x + drag.ox, 0, 100);
    const wantY = clamp(y + drag.oy, 0, 100);
    moveJoint(drag.name, wantX - pose.j[drag.name][0], wantY - pose.j[drag.name][1],
      { chain: drag.chain });
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
    out.j = Object.fromEntries(JOINTS.map((n) => [n, pose.j[n]]));
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
  hint.textContent = "Sixteen joints a frame, read off the art as the engine draws it. "
    + "Edits stay in your browser until you download them.";
  $(".bar strong").after(hint);
  const link = $('.bar a[href="./?edit=pose"]');
  if (link) { link.href = "./"; link.textContent = "← 3D Workbench"; }
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
            <p class="hint warn" id="faceNote" hidden>This frame is delivered facing
              LEFT and mirrored by the engine. It is shown here mirrored, the way the
              game draws it — pose it as you see it.</p>
          </div>
          <div class="pane">
            <canvas id="rigView"></canvas>
            <p class="hint">The fighter's own rig: spine, neck, both clavicles,
              arms, legs and feet, each turned in the drawing's plane to match the
              joints. Depth is not in a read, so the third axis stays at rest — this
              is a check on the read, not a finished clip. For a bone the read
              cannot reach, or a rotation out of plane, use the keyframe bench at
              <a href="./?edit=animation">?edit=animation</a>.</p>
            <label class="note-label" for="poseNote">What this frame is doing</label>
            <textarea id="poseNote" rows="3" placeholder="e.g. three-point stance, far hand planted, rear leg stretched back"></textarea>
            <ul class="joints" id="jointList"></ul>
          </div>
        </div>
      </section>
    </main>`;
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
    saveNote(ui.char, ui.pose, e.target.value);
  });
  $("#btnReset").addEventListener("click", async () => {
    dropEdit(ui.char, ui.pose);
    reads.delete(ui.char);
    await loadRead(ui.char);
    renderPicker();
    renderEditor();
  });
  $("#btnSnap").addEventListener("click", () => { snapToArt(); });
  $("#btnSwap").addEventListener("click", () => {
    const pose = reads.get(ui.char).poses[ui.pose];
    pushUndo();
    const swapped = { ...pose.j };
    for (const part of SIDED) {
      swapped[`${part}L`] = pose.j[`${part}R`];
      swapped[`${part}R`] = pose.j[`${part}L`];
    }
    pose.j = swapped;
    commit();
  });
  $("#btnExport").addEventListener("click", () => download(`${ui.char}.json`, exportChar(ui.char)));
  $("#btnExportAll").addEventListener("click", async () => {
    const all = {};
    for (const char of Object.keys(loadEdits())) {
      await loadRead(char);
      all[char] = exportChar(char);
    }
    download("pose-reads-edited.json", all);
  });
  addEventListener("resize", drawThree);
  bindPlate();
  bindKeys();
  await selectChar(ui.char);
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
  for (const name of JOINTS) {
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
