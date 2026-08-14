// THE MODEL BENCH (`?edit=models`): fixing the RIG, not the animation.
//
// Every other bench on this page asks a question about a POSE — does the model
// match this drawing, does this clip read as one move. This one asks the
// question underneath all of them: is the skeleton in the .glb built
// correctly? A clavicle rolled fifteen degrees, an arm root buried in the
// chest, a thigh screwed outward — those are wrong in every pose the fighter
// will ever hold, and no amount of animating fixes them. They are also nearly
// invisible in an animation, because anything odd reads as something the clip
// did.
//
// So the subject here is a T-POSE or an A-POSE and nothing else. Every joint
// at a right angle to the next, a silhouette everybody already knows, and the
// defect has nowhere to hide.
//
// WHAT YOU DO WITH IT. Pick a bone — from the list, or by clicking its dot on
// the body — and drag one of the three rings around it until the pose looks
// like an actual T. The rings are the standard three: red turns about X, green
// about Y, blue about Z.
//
// What you are editing is NOT this pose. It is the fighter's entry in the GLB
// correction layer (`render3d/src/rig_fixes.js` RIG_FIXES), which the engine
// applies under EVERY state — so a shoulder straightened here is straightened
// in the idle, the run and the punch, and the T-pose is only the place where
// you can see what you are doing. That is also why the rings are aligned to
// the bone's PARENT, not to the world: a correction composes in the parent's
// frame, which is the one frame that means the same thing whatever the arm is
// doing.
//
// The bench writes into that live table, so the figure in front of you is
// exactly what the engine will draw. **Download corrections** hands the table
// back as JSON, ready to paste into `RIG_FIXES` — and from there it is on
// `tools/model_fixes.mjs`'s bake list until somebody puts it into the .glb, at
// which point the entry is deleted and nothing changes.
//
// WHY ITS OWN RENDERER. The other benches draw through the game's pipeline:
// pose the rig, render it into a 512px texture, blit that. Right for judging
// what a player sees, wrong for surgery — you cannot orbit a texture, you
// cannot pick a joint in one, and every handle would have to exist twice, once
// in 3D and once in blitted pixels. This page puts the rig in a live scene
// with a live camera instead.

import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import * as rig from "../src/loader.js";
import { initPose, poseRig, RIG_CHECK_POSES } from "../src/pose.js";
import { RIG_FIXES, MODEL_FIXES, pendingFixes, setModelFixesEnabled } from "../src/rig_fixes.js";
import { setWorldWidth } from "../src/outline.js";
import { CHARACTER_KEYS, CHARACTERS } from "../../src/characters.js";

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ the page
//
// Same move sprite_pose.js and anim_viewer.js make: keep the header bar,
// replace the layout. The pose bench's cockpit belongs to a different tool,
// and loading this one into it would mean a screen of dead controls.

document.title = "3D Model Bench — JJK Brawler II";
document.body.classList.add("mode-models");
$("wbTitle").textContent = "3D Model Bench";
document.querySelectorAll(".bar .pose-only, .bar .anim-only, #facingReviewTop")
  .forEach((el) => el.remove());
{
  const bar = document.querySelector(".bar");
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "The skeleton in a T-pose, and the bones you can turn to "
    + "straighten it. Edits land in the GLB correction layer, under every state.";
  bar.insertBefore(hint, bar.children[1] || null);
  // A link to the page you are already on is furniture that looks like a way
  // out, so this bench's own entry comes out of the bar rather than being
  // greyed; the way BACK goes in, which the bar has no reason to carry.
  bar.querySelector('a[href="?edit=models"]')?.remove();
  const back = document.createElement("a");
  back.className = "ghost sm";
  back.href = "?";
  back.textContent = "← Poses";
  bar.insertBefore(back, hint.nextSibling);
}
$("facingOverlay")?.remove();
$("mobileBar")?.remove();

document.querySelector("main.layout").outerHTML = `
  <main class="layout models">
    <section class="stage-col">
      <div id="viewWrap"><canvas id="view"></canvas></div>
      <p class="hint">Drag the background to orbit · wheel to zoom · click a
        dot to pick that bone · drag a ring to turn it</p>
      <div id="status" class="mono"></div>
    </section>
    <aside class="pane">
      <label>Character
        <select id="charSelect"></select>
      </label>
      <label>Pose
        <select id="poseSelect">
          <option value="T">T-pose — arms level</option>
          <option value="A">A-pose — arms at 45°</option>
        </select>
      </label>
      <label class="check"><input id="showBones" type="checkbox" checked> Bone dots</label>
      <label class="check"><input id="showFixes" type="checkbox" checked> Corrections on</label>
      <p class="hint">Turn corrections off to see the .glb as delivered. The
        difference between the two IS the bake list.</p>

      <h3>Bone</h3>
      <select id="boneSelect"></select>
      <div id="axisRows"></div>
      <div class="row">
        <button id="boneReset" class="ghost sm">Reset bone</button>
        <button id="allReset" class="ghost sm">Reset all</button>
      </div>

      <h3>Corrections</h3>
      <div id="fixList" class="mono"></div>

      <div class="row">
        <button id="download" class="primary">⤓ Download corrections</button>
      </div>
      <p class="hint">One file for the whole session — every fighter you
        touched, in the shape <code>RIG_FIXES</code> takes.</p>
    </aside>
  </main>`;

// ------------------------------------------------------------- the rig loader

initPose(THREE);
// Held-back bodies included: fixing them is exactly this bench's job, and a
// fighter kept out of the game for a bad rig is the first one you want here.
await rig.initRigs(THREE, GLTFLoader, ["all"], CHARACTER_KEYS,
  [params.get("char") || CHARACTER_KEYS[0]], { includeDisabled: true });

/** Characters with a real delivered model. A mannequin is built to spec and
 *  has nothing wrong with it, so there is nothing here to fix. */
const DELIVERED = CHARACTER_KEYS.filter((k) => rig.rigManifest().characters?.[k]?.model);

const state = {
  char: DELIVERED.includes(params.get("char")) ? params.get("char") : DELIVERED[0],
  pose: RIG_CHECK_POSES[params.get("rigcheck")] ? params.get("rigcheck") : "T",
  bone: null,
  showBones: true,
  showFixes: true,
};

// ------------------------------------------------------------------ the scene

const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101522);
// The light rig scene.js uses, so a shoulder judged here is lit the way it is
// lit in the game. A hard key from one side is how a rolled clavicle becomes
// visible at all, and a softer one would hide exactly what this page is for.
scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x3a4152, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
keyLight.position.set(1.5, 2.5, 2.0);
scene.add(keyLight);
// A floor, because "is this foot flat" is unanswerable without one.
scene.add(new THREE.GridHelper(6, 24, 0x3a4670, 0x232c44));

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
/** Yaw and pitch are the orbit, `dist` the wheel, `target` what it looks at —
 *  set to the fighter's own mid-height so a 1.5m model and a 2.2m one are
 *  both framed rather than one of them being framed and the other cropped. */
const view = { yaw: 0, pitch: 6, dist: 4.2, target: new THREE.Vector3(0, 0.85, 0) };

/** Handles and dots: drawn over the model rather than into it, so a joint
 *  inside the body is still clickable. */
const overlay = new THREE.Group();
scene.add(overlay);

function placeCamera() {
  const y = view.yaw * DEG, p = view.pitch * DEG;
  camera.position.set(
    view.target.x + view.dist * Math.cos(p) * Math.sin(y),
    view.target.y + view.dist * Math.sin(p),
    view.target.z + view.dist * Math.cos(p) * Math.cos(y));
  camera.lookAt(view.target);
}

function resize() {
  const wrap = $("viewWrap");
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// -------------------------------------------------------------- the fix table
//
// One quaternion per bone, in the bone's PARENT frame, which is the frame
// `applyRigFixes` composes in (it premultiplies). Kept as quaternions while
// being edited and written out as XYZ Euler degrees, because a sequence of
// drags about three different axes is not a sum of three angles — adding them
// up as they arrive would quietly drift away from what is on screen.

/** charKey -> Map(boneName -> Quaternion). The session's work. */
const edits = new Map();

function editsFor(charKey) {
  let m = edits.get(charKey);
  if (!m) { m = new Map(); edits.set(charKey, m); }
  return m;
}

/** Push this character's edits into the live RIG_FIXES table, so the figure on
 *  screen is drawn by exactly the code that will draw it in the game. Bones
 *  the table already carried from the file are the STARTING POINT, loaded in
 *  once per character, so an edit here refines a shipped correction rather
 *  than silently replacing it. */
function publish(charKey) {
  const m = editsFor(charKey);
  const out = {};
  for (const [bone, q] of m) {
    const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
    const d = [e.x / DEG, e.y / DEG, e.z / DEG].map((v) => +v.toFixed(2));
    if (d.some((v) => Math.abs(v) > 0.005)) out[bone] = d;
  }
  if (Object.keys(out).length) RIG_FIXES[charKey] = out;
  else delete RIG_FIXES[charKey];
}

/** Seed the session from whatever the file already says about this fighter, so
 *  the bench opens on the corrections that are actually in force. */
const seeded = new Set();
function seed(charKey) {
  if (seeded.has(charKey)) return;
  seeded.add(charKey);
  const have = RIG_FIXES[charKey];
  if (!have) return;
  const m = editsFor(charKey);
  for (const [bone, [x = 0, y = 0, z = 0]] of Object.entries(have)) {
    m.set(bone, new THREE.Quaternion().setFromEuler(
      new THREE.Euler(x * DEG, y * DEG, z * DEG, "XYZ")));
  }
}

/** Turn the selected bone about one of its parent's axes. `axis` is 0/1/2. */
function nudge(boneName, axis, rad) {
  if (!rad) return;
  const m = editsFor(state.char);
  const q = m.get(boneName) || new THREE.Quaternion();
  const v = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
  // PREMULTIPLY, matching applyRigFixes: the correction is read in the
  // parent's frame, so a second drag composes on the left of the first.
  m.set(boneName, new THREE.Quaternion().setFromAxisAngle(v, rad).multiply(q));
  publish(state.char);
  syncBonePanel();
  syncFixList();
}

function setAxis(boneName, axis, deg) {
  const m = editsFor(state.char);
  const q = m.get(boneName) || new THREE.Quaternion();
  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  const parts = [e.x, e.y, e.z];
  parts[axis] = deg * DEG;
  m.set(boneName, new THREE.Quaternion().setFromEuler(
    new THREE.Euler(parts[0], parts[1], parts[2], "XYZ")));
  publish(state.char);
  syncBonePanel();
  syncFixList();
}

// ------------------------------------------------------------------ the pose
//
// One call, the engine's own: poseRig with `rigCheck` set throws the clip away
// and stands the model up at bind with its arms out, then applies the GLB
// correction layer — which reads the table this page is editing.

function currentRig() { return rig.getRig(state.char); }

function poseNow() {
  const r = currentRig();
  if (!r) return null;
  const resolved = rig.resolveClip(state.char, "idle");
  if (!resolved) return null;
  poseRig(r, "idle", 0, resolved.clip, { charKey: state.char, rigCheck: state.pose });
  // The ink outline is sized in world units per screen pixel; without this it
  // is whatever the last page set and reads as a fighter dipped in tar.
  setWorldWidth(r.root, (r.height || 1.8) / 700);
  r.root.updateMatrixWorld(true);
  return r;
}

let shown = null;
function showChar(charKey) {
  state.char = charKey;
  seed(charKey);
  publish(charKey);
  const r = rig.getRig(charKey);
  if (!r) return;
  if (shown && shown !== r.root) scene.remove(shown);
  if (shown !== r.root) { scene.add(r.root); shown = r.root; }
  view.target.set(0, (r.height || 1.8) * 0.5, 0);
  view.dist = (r.height || 1.8) * 2.3;
  fillBoneSelect();
  syncFixList();
  const url = new URL(location);
  url.searchParams.set("char", charKey);
  history.replaceState(null, "", url);
}

// ------------------------------------------------------------- bones and dots

/** Every bone the skeleton has, in skeleton order — which is parents before
 *  children, so the list reads down the body rather than alphabetically. */
function boneList() {
  const r = currentRig();
  if (!r) return [];
  let out = [];
  r.root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton || out.length) return;
    out = o.skeleton.bones.map((b) => b.name);
  });
  if (!out.length) r.root.traverse((o) => { if (o.isBone) out.push(o.name); });
  return out;
}

function fillBoneSelect() {
  const sel = $("boneSelect");
  const names = boneList();
  sel.innerHTML = "";
  for (const n of names) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    sel.append(o);
  }
  // OPEN ON A SHOULDER. The first bone in skeleton order is the root, which on
  // a conformed rig is a wrapper sitting on the floor with nothing hanging off
  // it that anyone would want to turn — a gizmo around the fighter's ankles is
  // a confusing thing to be handed. The clavicles are where the roster's
  // defects actually are, so that is where the tool opens.
  if (!names.includes(state.bone)) {
    state.bone = ["LeftShoulder", "RightShoulder", "LeftArm", "Spine"]
      .find((n) => names.includes(n)) || names[0] || null;
  }
  if (state.bone) sel.value = state.bone;
  syncBonePanel();
}

const AXES = [
  { i: 0, name: "X", colour: "#ff6b6b", hex: 0xff6b6b },
  { i: 1, name: "Y", colour: "#7bd88f", hex: 0x7bd88f },
  { i: 2, name: "Z", colour: "#6bb6ff", hex: 0x6bb6ff },
];

function syncBonePanel() {
  const rows = $("axisRows");
  const q = editsFor(state.char).get(state.bone);
  const e = q ? new THREE.Euler().setFromQuaternion(q, "XYZ") : null;
  rows.innerHTML = "";
  for (const ax of AXES) {
    const deg = e ? +([e.x, e.y, e.z][ax.i] / DEG).toFixed(2) : 0;
    const row = document.createElement("div");
    row.className = "axis";
    const tag = document.createElement("b");
    tag.textContent = ax.name;
    tag.style.color = ax.colour;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "-90"; slider.max = "90"; slider.step = "0.5";
    slider.value = String(deg);
    const num = document.createElement("input");
    num.type = "number";
    num.step = "0.5";
    num.value = String(deg);
    slider.oninput = () => { num.value = slider.value; setAxis(state.bone, ax.i, +slider.value); };
    num.onchange = () => setAxis(state.bone, ax.i, +num.value || 0);
    row.append(tag, slider, num);
    rows.append(row);
  }
}

/** The corrections in force for this fighter — the bones from this page, and
 *  the manifest-level numbers the rig also carries, because the body on screen
 *  is the sum of all of them and a list that showed only half would be read as
 *  the whole. */
function syncFixList() {
  const box = $("fixList");
  box.innerHTML = "";
  const m = editsFor(state.char);
  const entry = rig.rigManifest().characters?.[state.char] || {};
  const manifest = pendingFixes(state.char, entry);
  const line = (label, detail, cls = "") => {
    const d = document.createElement("div");
    d.className = `fixrow ${cls}`;
    const b = document.createElement("b");
    b.textContent = label;
    const s = document.createElement("span");
    s.textContent = detail;
    d.append(b, s);
    box.append(d);
  };
  let n = 0;
  for (const [bone, q] of m) {
    const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
    const d = [e.x / DEG, e.y / DEG, e.z / DEG].map((v) => +v.toFixed(2));
    if (!d.some((v) => Math.abs(v) > 0.005)) continue;
    n++;
    line(`${bone}  [${d.join(", ")}]`, MODEL_FIXES.bones.bake, "bone");
  }
  if (!n) line("no bone corrections", "the skeleton is taken as delivered", "none");
  for (const [k, v] of Object.entries(manifest)) {
    if (k === "bones") continue;
    line(`${k} ${v}`, MODEL_FIXES[k]?.bake || "", "man");
  }
}

// ---------------------------------------------------------------- the handles
//
// Three rings around the selected bone, aligned to its PARENT's world frame —
// the frame the correction is written in, so what you drag is what gets
// recorded. Drawn without depth testing so a joint inside the body can still
// be grabbed, and rebuilt every frame at a constant on-screen size, because a
// gizmo that shrinks as you dolly out is a gizmo you cannot use on a foot.

const RING_SEGMENTS = 64;
const dotGeom = new THREE.SphereGeometry(1, 10, 8);
const dotMat = new THREE.MeshBasicMaterial({ color: 0x8b96b3, depthTest: false });
const dotSel = new THREE.MeshBasicMaterial({ color: 0xffcf8a, depthTest: false });
const dots = new THREE.Group();
const rings = new THREE.Group();
dots.renderOrder = 20;
rings.renderOrder = 21;
overlay.add(dots, rings);

function ringGeometry(axis) {
  const pts = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pts.push(axis === 0 ? new THREE.Vector3(0, c, s)
      : axis === 1 ? new THREE.Vector3(c, 0, s)
        : new THREE.Vector3(c, s, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}
const ringGeoms = AXES.map((a) => ringGeometry(a.i));

/** On-screen size in world units at the gizmo's distance, so the rings stay
 *  the same size on the canvas however far the camera is. */
function gizmoScale(at) {
  return camera.position.distanceTo(at) * Math.tan((camera.fov / 2) * DEG) * 0.16;
}

let ringMeshes = [];
function rebuildHandles() {
  dots.clear();
  rings.clear();
  ringMeshes = [];
  const r = currentRig();
  if (!r) return;

  if (state.showBones) {
    for (const name of boneList()) {
      const bone = r.root.getObjectByName(name);
      if (!bone) continue;
      const at = bone.getWorldPosition(new THREE.Vector3());
      const d = new THREE.Mesh(dotGeom, name === state.bone ? dotSel : dotMat);
      d.position.copy(at);
      d.scale.setScalar(gizmoScale(at) * 0.055);
      d.userData.bone = name;
      d.renderOrder = 20;
      dots.add(d);
    }
  }

  const bone = state.bone && r.root.getObjectByName(state.bone);
  if (!bone) return;
  const at = bone.getWorldPosition(new THREE.Vector3());
  const parentQ = bone.parent
    ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  const s = gizmoScale(at);
  const toCam = new THREE.Vector3().subVectors(camera.position, at).normalize();
  for (const ax of AXES) {
    // FADE A RING SEEN EDGE-ON. From the default camera the blue ring on a
    // clavicle projects thirteen pixels wide against the others' hundred and
    // twelve, and dragging round a thirteen-pixel ellipse is not turning a
    // bone, it is fighting the pointer — a 36° sweep came out as 6°. Nothing
    // is broken there and nothing can fix it but a different camera angle, so
    // the ring says so by going dim: bright means you can turn this one, faint
    // means orbit first.
    const normal = new THREE.Vector3(ax.i === 0 ? 1 : 0, ax.i === 1 ? 1 : 0,
      ax.i === 2 ? 1 : 0).applyQuaternion(parentQ);
    const faceOn = Math.abs(normal.dot(toCam));
    const mat = new THREE.LineBasicMaterial({ color: ax.hex, depthTest: false,
      transparent: true, opacity: 0.22 + 0.73 * faceOn });
    const line = new THREE.LineLoop(ringGeoms[ax.i], mat);
    line.position.copy(at);
    line.quaternion.copy(parentQ);
    line.scale.setScalar(s);
    line.renderOrder = 21;
    line.userData.axis = ax.i;
    rings.add(line);
    ringMeshes.push({ axis: ax.i, at, parentQ, radius: s });
  }
}

// ------------------------------------------------------------------- pointing

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function toNdc(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}

/** How near the pointer has to be to a ring, in canvas pixels, to grab it. */
const GRAB_PX = 12;

/**
 * Which ring the pointer is over, IN SCREEN SPACE.
 *
 * Three rings that share a centre cross each other twice per pair, and at
 * every crossing more than one of them is under the cursor. Deciding by depth
 * — the nearest plane the ray meets — picks by which ring happens to lean
 * toward the camera, which is not what the eye picked: grabbing a point
 * visibly ON the blue ring handed back the green one, and the drag that
 * followed measured almost nothing, because the pointer was travelling across
 * the green ring's plane rather than around it.
 *
 * So it is decided the way it is seen: each ring's curve is projected to the
 * canvas and the closest one to the pointer wins. Ties at a genuine crossing
 * go to whichever is nearer the camera, which is also what it looks like.
 */
function pickRing(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const px = clientX - box.left, py = clientY - box.top;
  const v = new THREE.Vector3();
  let best = null;
  for (const rm of ringMeshes) {
    const normal = new THREE.Vector3(rm.axis === 0 ? 1 : 0, rm.axis === 1 ? 1 : 0,
      rm.axis === 2 ? 1 : 0).applyQuaternion(rm.parentQ);
    let near = Infinity, depth = 0;
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      v.set(rm.axis === 0 ? 0 : c, rm.axis === 0 ? c : rm.axis === 1 ? 0 : s,
        rm.axis === 2 ? 0 : s);
      v.multiplyScalar(rm.radius).applyQuaternion(rm.parentQ).add(rm.at);
      const d = v.distanceTo(camera.position);
      v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * box.width, sy = (0.5 - v.y * 0.5) * box.height;
      const dist = Math.hypot(sx - px, sy - py);
      if (dist < near) { near = dist; depth = d; }
    }
    if (near > GRAB_PX) continue;
    if (!best || near < best.near - 1 || (Math.abs(near - best.near) <= 1 && depth < best.depth)) {
      best = { rm, normal, near, depth };
    }
  }
  if (!best) return null;
  // Where on that ring's plane the pointer actually is, which is what the drag
  // measures its angle from.
  const denom = best.normal.dot(ray.ray.direction);
  if (Math.abs(denom) < 1e-5) return null;
  const t = best.normal.dot(new THREE.Vector3().subVectors(best.rm.at, ray.ray.origin)) / denom;
  if (t <= 0) return null;
  best.point = ray.ray.at(t, new THREE.Vector3());
  return best;
}

function pickDot() {
  const hits = ray.intersectObjects(dots.children, false);
  return hits.length ? hits[0].object.userData.bone : null;
}

let drag = null;   // { kind: "orbit" | "ring", ... }

canvas.addEventListener("pointerdown", (ev) => {
  toNdc(ev);
  const ring = pickRing(ev.clientX, ev.clientY);
  if (ring) {
    // The angle the pointer is at NOW, measured in the ring's own plane. Every
    // move is compared against it, so the bone follows the pointer rather than
    // turning by however many pixels it moved — a drag that circles the ring
    // twice turns the bone twice, which is what a ring handle should do.
    const from = new THREE.Vector3().subVectors(ring.point, ring.rm.at);
    drag = { kind: "ring", rm: ring.rm, normal: ring.normal, from, last: 0 };
    canvas.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    return;
  }
  const bone = pickDot();
  if (bone) {
    state.bone = bone;
    $("boneSelect").value = bone;
    syncBonePanel();
    return;
  }
  drag = { kind: "orbit", x: ev.clientX, y: ev.clientY };
  canvas.setPointerCapture(ev.pointerId);
});

canvas.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  if (drag.kind === "orbit") {
    view.yaw -= (ev.clientX - drag.x) * 0.4;
    view.pitch = Math.max(-80, Math.min(80, view.pitch + (ev.clientY - drag.y) * 0.3));
    drag.x = ev.clientX; drag.y = ev.clientY;
    return;
  }
  toNdc(ev);
  const denom = drag.normal.dot(ray.ray.direction);
  if (Math.abs(denom) < 1e-5) return;
  const t = drag.normal.dot(new THREE.Vector3().subVectors(drag.rm.at, ray.ray.origin)) / denom;
  if (t <= 0) return;
  const now = new THREE.Vector3().subVectors(ray.ray.at(t, new THREE.Vector3()), drag.rm.at);
  // Signed angle from where the drag started, about the ring's own normal.
  const angle = Math.atan2(
    new THREE.Vector3().crossVectors(drag.from, now).dot(drag.normal),
    drag.from.dot(now));
  nudge(state.bone, drag.rm.axis, angle - drag.last);
  drag.last = angle;
});

const endDrag = () => { drag = null; };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  view.dist = Math.max(0.4, Math.min(20, view.dist * (ev.deltaY < 0 ? 1 / 1.1 : 1.1)));
}, { passive: false });

// -------------------------------------------------------------- the controls

const charSel = $("charSelect");
for (const k of DELIVERED) {
  const o = document.createElement("option");
  o.value = k;
  const entry = rig.rigManifest().characters?.[k] || {};
  o.textContent = `${entry.inGame === false ? "⊘ " : ""}${CHARACTERS[k]?.name || k}`;
  charSel.append(o);
}
charSel.value = state.char;
charSel.onchange = async () => {
  const k = charSel.value;
  $("status").textContent = `loading ${k}…`;
  await rig.ensureRig(k, GLTFLoader).catch(() => {});
  showChar(k);
};

const poseSel = $("poseSelect");
poseSel.value = state.pose;
poseSel.onchange = () => {
  state.pose = poseSel.value;
  const url = new URL(location);
  url.searchParams.set("rigcheck", state.pose);
  history.replaceState(null, "", url);
};

$("boneSelect").onchange = () => { state.bone = $("boneSelect").value; syncBonePanel(); };
$("showBones").onchange = () => { state.showBones = $("showBones").checked; };
$("showFixes").onchange = () => {
  state.showFixes = $("showFixes").checked;
  // The whole layer, not just this page's bones — "corrections off" has to
  // mean the .glb as delivered or it is not the comparison it claims to be.
  setModelFixesEnabled(state.showFixes);
};

$("boneReset").onclick = () => {
  editsFor(state.char).delete(state.bone);
  publish(state.char);
  syncBonePanel();
  syncFixList();
};
$("allReset").onclick = () => {
  editsFor(state.char).clear();
  publish(state.char);
  syncBonePanel();
  syncFixList();
};

/** The session's work, in the shape RIG_FIXES takes — paste-ready, plus enough
 *  provenance to know which build of which model it was measured against. */
$("download").onclick = () => {
  const fixes = {};
  for (const [charKey] of edits) {
    const m = editsFor(charKey);
    const out = {};
    for (const [bone, q] of m) {
      const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
      const d = [e.x / DEG, e.y / DEG, e.z / DEG].map((v) => +v.toFixed(2));
      if (d.some((v) => Math.abs(v) > 0.005)) out[bone] = d;
    }
    if (Object.keys(out).length) {
      fixes[charKey] = { model: rig.rigManifest().characters?.[charKey]?.model || null,
                         bones: out };
    }
  }
  const payload = {
    kind: "render3d-model-bench",
    exported: new Date().toISOString(),
    note: "Bone corrections in the bone's PARENT frame, XYZ Euler degrees — "
      + "the shape RIG_FIXES in render3d/src/rig_fixes.js takes. Each one is a "
      + "modelling job on the .glb; baking it and deleting the entry must leave "
      + "the fighter looking identical.",
    fixes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "model-corrections.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  $("status").textContent = `downloaded ${Object.keys(fixes).length} fighter(s)`;
};

// ------------------------------------------------------------------ the loop

let frames = 0;
function tick() {
  requestAnimationFrame(tick);
  resize();
  placeCamera();
  poseNow();
  rebuildHandles();
  renderer.render(scene, camera);
  if (++frames % 30 === 0) {
    const r = currentRig();
    $("status").textContent = r
      ? `${state.char} · ${state.pose}-pose · ${boneList().length} bones · `
        + `${(r.height || 0).toFixed(2)}m`
      : `${state.char} · no rig`;
  }
}

showChar(state.char);
resize();
tick();

/** Where a point on one of the rings lands on the page, in client pixels.
 *
 *  Exposed because the alternative for a test is to guess where a handle is,
 *  and a handle test that guesses is a test of the guess. `turn` is a fraction
 *  around the ring: 0 and 0.25 are a quarter-circle apart, which is a drag. */
function ringScreenPoint(axis, turn = 0) {
  const rm = ringMeshes.find((m) => m.axis === axis);
  if (!rm) return null;
  const a = turn * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  const local = axis === 0 ? new THREE.Vector3(0, c, s)
    : axis === 1 ? new THREE.Vector3(c, 0, s)
      : new THREE.Vector3(c, s, 0);
  const world = local.multiplyScalar(rm.radius).applyQuaternion(rm.parentQ).add(rm.at);
  const p = world.project(camera);
  const box = canvas.getBoundingClientRect();
  return { x: box.left + (p.x * 0.5 + 0.5) * box.width,
           y: box.top + (0.5 - p.y * 0.5) * box.height };
}

window.__modelBench = { state, edits, publish, nudge, setAxis, boneList,
                        ringScreenPoint, view, camera, canvas, RIG_FIXES };
window.__workbenchReady = true;
