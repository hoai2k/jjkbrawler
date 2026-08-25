// THE MODEL VIEWER (`?edit=3d`): the .glb itself, in a viewer, with nothing
// on top of it.
//
// Every other bench on this page shows a fighter THROUGH something — the anime
// pass, a clip, a pose library, a sprite ghost to match. That is right for
// judging what a player sees and wrong for judging what was delivered: a toon
// ramp flattens the shading a modeller worked on, an ink outline hides the
// silhouette it is drawn from, and a pose can make a fault look like a choice.
// When the question is "what did we actually get, and what needs fixing", the
// answer has to be the file.
//
// So: the delivered materials, the delivered textures, the delivered rest
// pose, in a plain lit scene you can turn, and a panel of the facts that are
// in the container rather than in anybody's opinion of it.
//
// THREE THINGS IT ADDS, and they are the reason it is a bench and not a
// gltf-viewer bookmark.
//
//   * VERSIONS. A fighter can have more than one body on file — the D6 and D7
//     rebuilds each kept the model they replaced as `<char>_alt.glb`, so the
//     two generations can be judged against each other rather than from
//     memory. The picker switches between them in place, at the same camera,
//     which is the comparison that is otherwise impossible to make.
//   * THE CORRECTION LAYER, ON OR OFF. Some of what the engine draws is not in
//     the .glb: a head tilted back, arm roots pushed out, a bandy shin
//     straightened, a lopsided skeleton mirrored, the whole rig turned to face
//     the way the spec says (`render3d/src/rig_fixes.js`, applied by
//     `pose.js`). Those are notes for a modelling pass that has not happened
//     yet, and the difference between the switch's two positions IS the
//     outstanding work. It is the engine's own switch — the one
//     `setModelFixesEnabled(false)` flips, which a complete bake must make a
//     no-op — rather than a second implementation of the same idea.
//   * WIREFRAME. Topology is half of "what needs fixing" and is invisible
//     under a texture: a generated blob and a retopologised body look the same
//     shaded and nothing alike in wireframe.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not pose (`?edit=keys`), it does
// not put handles on bones (`?edit=rigs`), and it does not compare against the
// sprite (`?` — the pose bench). A viewer that also edits is a viewer you
// cannot trust to be showing you the file.

import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import { initPose, bakedBind, captureCleanPose } from "../src/pose.js";
import { applyBindPose } from "../src/ik.js";
import { setModelFixesEnabled, pendingFixes, MODEL_FIXES } from "../src/rig_fixes.js";
import { CHARACTERS, byCharacterName } from "../../src/characters.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ the page
//
// Same move rig_bench.js makes: keep the header bar, replace the layout. The
// pose bench's cockpit belongs to a different tool and loading this one into it
// would mean a screen of dead controls.

document.title = "3D Model Viewer — JJK Brawler II";
document.body.classList.add("mode-model");
$("wbTitle").textContent = "3D Model Viewer";
document.querySelectorAll(".bar .pose-only, .bar .anim-only, #facingReviewTop")
  .forEach((el) => el.remove());
{
  const bar = document.querySelector(".bar");
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "The delivered .glb, with nothing on top of it — no toon "
    + "pass, no outline, no clip. Drag to turn, wheel to zoom, right-drag to pan.";
  bar.insertBefore(hint, bar.children[1] || null);
  // A link to the page you are already on is furniture that looks like a way
  // out, so this bench's own entry comes out of the bar and the way BACK goes
  // in — the same trade the rig bench makes next door.
  bar.querySelector('a[href="?edit=3d"]')?.remove();
  const back = document.createElement("a");
  back.className = "ghost sm";
  back.href = "?";
  back.textContent = "← Poses";
  bar.insertBefore(back, hint.nextSibling);
}
$("facingOverlay")?.remove();
$("mobileBar")?.remove();

document.querySelector("main.layout").outerHTML = `
  <main class="layout model viewport3d">
    <section class="stage-col">
      <div id="viewWrap"><canvas id="view"></canvas></div>
      <p class="hint">Drag to orbit · wheel or pinch to zoom · right-drag,
        middle-drag or shift-drag to pan · double-click to re-frame</p>
      <div id="status" class="mono"></div>
    </section>
    <aside class="panel">
      <label>Character
        <select id="charSelect"></select>
      </label>
      <label>Version
        <select id="verSelect"></select>
      </label>
      <p class="hint" id="verNote"></p>
      <p class="hint held" id="heldNote" hidden></p>
      <div class="row">
        <button id="viewReset" class="ghost sm">Reset view</button>
        <button id="viewFront" class="ghost sm">Front</button>
        <button id="viewSide" class="ghost sm">Side</button>
      </div>
      <label class="check"><input id="showFixes" type="checkbox"> Correction layer on</label>
      <p class="hint">What the engine applies on top of this file and the file
        does not carry yet — the head carriage, the arm roots, the knees, a
        mirrored skeleton, and the yaw that turns the rig to face the way the
        spec says. Off is the .glb exactly as delivered; the difference between
        the two positions is the modelling work still owed.</p>
      <label class="check"><input id="wireframe" type="checkbox"> Wireframe</label>
      <label class="check"><input id="showGrid" type="checkbox" checked> Floor grid <span class="dim">(0.5 m)</span></label>

      <h3>Outstanding corrections</h3>
      <div id="fixList" class="mono"></div>

      <h3>What is in the file</h3>
      <div id="facts" class="mono"></div>
    </aside>
  </main>`;

// --------------------------------------------------------------- the roster
//
// From the MANIFEST rather than from the loader's registry, and fetched here
// rather than through `initRigs`: this bench shows files, including the ones
// the game never loads (an `alt` is fetched on demand, a held-back fighter not
// at all), and going through the registry would mean loading each of them the
// way the game does — toon materials, ink outlines and all — which is the one
// thing this page exists not to do.

const BASE = new URL("../assets/", import.meta.url);
const manifest = await fetch(new URL("manifest.json", BASE)).then((r) => r.json());

/** Every fighter with a model on file, in roster-name order. Held-back bodies
 *  included: a fighter kept out of the game for a bad model is the first one
 *  somebody opens this page to look at. */
const DELIVERED = Object.keys(manifest.characters || {})
  .filter((k) => manifest.characters[k]?.model && CHARACTERS[k])
  .sort(byCharacterName);

/** The bodies on file for one fighter. The current model first, then whatever
 *  earlier generation was kept beside it. */
function versionsOf(charKey) {
  const entry = manifest.characters[charKey] || {};
  const out = [{ key: "current", label: "current", model: entry.model, entry }];
  if (entry.alt?.model) {
    out.push({ key: "alt", label: entry.alt.label || "alternate",
               model: entry.alt.model, entry: entry.alt });
  }
  return out;
}

const state = {
  char: DELIVERED.includes(params.get("char")) ? params.get("char") : DELIVERED[0],
  version: params.get("ver") === "alt" ? "alt" : "current",
  fixes: params.get("fixes") === "1",
  wireframe: false,
  grid: true,
};

// ------------------------------------------------------------------ the scene

const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14192a);

// NEUTRAL LIGHT, not the game's. The stage rig in scene.js is a look — a warm
// key, a cool bounce, a rim to lift the silhouette off the background — and a
// look is exactly what must not be in the way here: a model judged under
// dramatic lighting is a model whose flat-shaded faults have been lit out of
// existence. A soft dome plus a weak key from over the viewer's shoulder shows
// the form and hides nothing.
scene.add(new THREE.HemisphereLight(0xffffff, 0x505a70, 2.4));
const key = new THREE.DirectionalLight(0xffffff, 1.25);
key.position.set(1.2, 2.2, 2.4);
scene.add(key);
const fill = new THREE.DirectionalLight(0xdce6ff, 0.5);
fill.position.set(-2.0, 1.0, -1.6);
scene.add(fill);

const grid = new THREE.GridHelper(6, 12, 0x40507e, 0x263054);
scene.add(grid);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);

// ------------------------------------------------------------- the controls
//
// A STANDARD VIEWER'S GESTURES, written here rather than taken from orbit.js.
// That module is the shared dial for the two benches that turn a fixed camera
// AWAY from the angle the art was drawn for — it has a rest position, an "off"
// that snaps back to it, and no pan, because panning a comparison against a
// sprite would slide the two apart. This camera has no privileged angle to
// return to and panning is half of looking at a hand or a foot, so it is a
// different thing wearing the same word.

const view = {
  yaw: 25, pitch: 8, dist: 4,
  target: new THREE.Vector3(0, 0.9, 0),
};
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function placeCamera() {
  const y = view.yaw * DEG;
  // Short of the poles: at 90° the camera looks straight down its own up
  // vector, `lookAt` has no answer, and the model appears to flip.
  const p = clamp(view.pitch, -88, 88) * DEG;
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

/** Slide the camera and its target across the screen plane, so a pan moves the
 *  model rather than turning it — in world units scaled by distance, which is
 *  what makes one pixel of drag mean the same amount of model at every zoom. */
function panBy(dx, dy) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
  const perPx = (view.dist * Math.tan((camera.fov / 2) * DEG) * 2) / ($("viewWrap").clientHeight || 1);
  view.target.addScaledVector(right, -dx * perPx);
  view.target.addScaledVector(up, dy * perPx);
}

{
  let from = null, mode = null;
  const pointers = new Map();
  let pinch = 0;

  const panning = (ev) => ev.button === 1 || ev.button === 2 || ev.shiftKey;

  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
  canvas.addEventListener("pointerdown", (ev) => {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    canvas.setPointerCapture(ev.pointerId);
    from = { x: ev.clientX, y: ev.clientY };
    // TWO FINGERS PAN AND PINCH, one finger turns — the gesture every map and
    // every model viewer on a phone already uses, so nobody has to be told.
    mode = pointers.size > 1 ? "pan" : panning(ev) ? "pan" : "orbit";
    pinch = 0;
    ev.preventDefault();
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size > 1) {
      const [a, b] = [...pointers.values()];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) view.dist = clamp(view.dist * (pinch / gap), 0.15, 40);
      pinch = gap;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (from) panBy(mid.x - from.x, mid.y - from.y);
      from = mid;
      return;
    }
    if (!from) return;
    const dx = ev.clientX - from.x, dy = ev.clientY - from.y;
    if (mode === "pan") panBy(dx, dy);
    else {
      view.yaw -= dx * 0.4;
      view.pitch = clamp(view.pitch + dy * 0.3, -88, 88);
    }
    from = { x: ev.clientX, y: ev.clientY };
  });
  const drop = (ev) => {
    pointers.delete(ev.pointerId);
    if (!pointers.size) { from = null; mode = null; pinch = 0; }
  };
  canvas.addEventListener("pointerup", drop);
  canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    view.dist = clamp(view.dist * (ev.deltaY < 0 ? 1 / 1.12 : 1.12), 0.15, 40);
  }, { passive: false });
  canvas.addEventListener("dblclick", () => frame());
}

// -------------------------------------------------------------- the model
//
// Loaded here rather than through `render3d/src/loader.js`, which is the whole
// point of the bench: that path converts every delivered material into a toon
// material and grows an ink shell on every mesh on the way in, so a rig it has
// touched can no longer answer "what does this file look like".

let shown = null;          // { root, gltf, bytes, url, charKey, version }
const loadCache = new Map();

async function loadModel(url) {
  if (loadCache.has(url)) return loadCache.get(url);
  const p = (async () => {
    // Fetched whole first so the panel can report the download a player would
    // pay for. It is the number the tri budget exists to protect, and it is
    // not visible anywhere else in the workbench.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const buf = await res.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(buf, url.replace(/[^/]*$/, ""));
    return { gltf, bytes: buf.byteLength };
  })();
  loadCache.set(url, p);
  return p;
}

/** The delivered rest, plus the correction layer when the switch is on.
 *
 *  BOTH POSITIONS OF THE SWITCH START FROM THE BIND, deliberately. The clip a
 *  delivery ships can leave the file's nodes anywhere, and a toggle that also
 *  changed the pose would be showing two differences while claiming to show
 *  one. From the bind, the ONLY thing that moves is the layer, which is what
 *  makes the comparison worth anything. */
function applyPose(model) {
  const rigLike = model.rigLike;
  setModelFixesEnabled(state.fixes);
  if (state.fixes) {
    bakedBind(rigLike, model.charKey);
    // THE YAW IS PART OF THE LAYER, and it is applied here rather than inside
    // `bakedBind` because that function is the BAKE — the rest pose a modeller
    // would put in the file — and the yaw is not a rest pose, it is the whole
    // rig turned. `pose.js` composes it exactly this way on the root
    // (`rotation.y = turnYaw + rig.yawOffset`), so this is the engine's own
    // number in the engine's own place. It is also what makes two generations
    // of a fighter comparable: they were built facing different ways, and with
    // the layer on they both face the way the spec says.
    rigLike.root.rotation.y = ((model.entry.yawOffsetDeg || 0) * Math.PI) / 180;
  } else {
    rigLike.root.rotation.y = 0;
    applyBindPose(THREE, rigLike.root);
  }
  rigLike.root.updateMatrixWorld(true);
}

function applyLook(model) {
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      m.wireframe = state.wireframe;
    }
  });
}

/** Frame the whole model, head to foot, from wherever the camera is now — so
 *  re-framing after a version switch does not also throw away the angle you
 *  were looking from. */
function frame(keepAngle = true) {
  if (!shown) return;
  const box = new THREE.Box3().setFromObject(shown.root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  box.getCenter(view.target);
  view.dist = Math.max(size.y, size.x, 0.4) * 2.1;
  if (!keepAngle) { view.yaw = 25; view.pitch = 8; }
}

async function show() {
  const versions = versionsOf(state.char);
  const pick = versions.find((v) => v.key === state.version) || versions[0];
  state.version = pick.key;
  const url = new URL(pick.model, BASE).href;
  $("status").textContent = `loading ${pick.model}…`;

  let loaded;
  try {
    loaded = await loadModel(url);
  } catch (err) {
    $("status").textContent = `could not load ${pick.model} — ${err.message}`;
    return;
  }
  if (shown) scene.remove(shown.root);

  // One scene per (character, version): the loader hands back the same object
  // every time, and a second `add` of a root already in the graph is a no-op
  // that quietly shares a posed skeleton between two views of it.
  const root = loaded.gltf.scene;
  const model = {
    root,
    gltf: loaded.gltf,
    bytes: loaded.bytes,
    model: pick.model,
    charKey: state.char,
    version: pick.key,
    entry: pick.entry,
    // What `bakedBind` reads. The dials come from the entry BEING SHOWN, which
    // for an alternate is its own block: the manifest keeps the two
    // generations' numbers apart because dressing an old model in the new
    // one's corrections answers a question nobody asked.
    rigLike: {
      root,
      charKey: state.char,
      height: pick.entry.heightM || 1.8,
      headTiltDeg: pick.entry.headTiltDeg || 0,
      shoulderOutCm: pick.entry.shoulderOutCm || 0,
      kneeDeg: pick.entry.kneeDeg || 0,
    },
  };
  if (!root.userData.__cleanCaptured) {
    captureCleanPose(root);
    root.userData.__cleanCaptured = true;
  }
  scene.add(root);
  const first = !shown || shown.charKey !== state.char;
  shown = model;
  applyPose(model);
  applyLook(model);
  if (first) frame(false);
  else frame(true);
  syncFacts();
  syncFixList();
  syncUrl();
  $("status").textContent = "";
}

// ------------------------------------------------------------------- panels

/** Measurements taken off the file rather than off the manifest, because the
 *  two disagreeing is itself a finding — an intake reads the height once and
 *  the number rides in the manifest forever. */
function measure(model) {
  const json = model.gltf.parser.json;
  let tris = 0, verts = 0;
  const materials = new Set();
  const textures = new Set();
  let bones = 0, colour = false;
  model.root.traverse((o) => {
    if (o.isBone) bones++;
    if (!o.isMesh) return;
    const g = o.geometry;
    const idx = g.index ? g.index.count : g.attributes.position.count;
    tris += idx / 3;
    verts += g.attributes.position.count;
    if (g.attributes.color) colour = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      materials.add(m);
      for (const slot of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"]) {
        if (m[slot]?.image) textures.add(m[slot]);
      }
    }
  });
  const box = new THREE.Box3().setFromObject(model.root);
  const size = box.getSize(new THREE.Vector3());
  const propBones = [];
  model.root.traverse((o) => { if (o.isBone && /^(Prop_|Chain_)/.test(o.name)) propBones.push(o.name); });
  return {
    tris: Math.round(tris), verts, bones, colour,
    materials: materials.size,
    textures: [...textures].map((t) => `${t.image.width}×${t.image.height}`),
    heightM: size.y, floorGap: box.min.y,
    clips: (json.animations || []).map((a) => a.name),
    generator: json.asset?.generator || "unknown",
    extensions: json.extensionsUsed || [],
    shadeBias: (json.materials || []).some((m) => m.extras?.shadeBias),
    props: propBones,
  };
}

const row = (label, value, warn = false) =>
  `<div class="factrow${warn ? " warn" : ""}"><b>${label}</b><span>${value}</span></div>`;

function syncFacts() {
  if (!shown) return;
  // WHY THIS ONE IS NOT IN THE GAME, on the page where somebody is looking at
  // it to find out. `inGame: false` is the flag for a body that passed intake
  // and is not fit to be seen by a player yet, and the manifest note beside it
  // says what is wrong — which is the first question this viewer gets asked
  // about such a fighter and the one thing it would otherwise not answer.
  const entry = manifest.characters[shown.charKey] || {};
  const held = entry.inGame === false;
  $("heldNote").hidden = !held;
  if (held) {
    $("heldNote").textContent = `Held out of the game (inGame: false)`
      + (entry.note ? ` — ${entry.note}` : ". No reason recorded in the manifest.");
  }
  const m = measure(shown);
  const declared = shown.entry.heightM;
  const mb = (shown.bytes / 1048576).toFixed(2);
  // The budget is the delivery spec's (render3d/docs/asset-requests.md): 30k
  // for a standard body, 60k for a bulk one. Flagged rather than judged — a
  // heavy is allowed to be heavy, and the number is what the reviewer wants.
  const overBudget = m.tris > 60000;
  const html = [
    row("file", `${shown.model} · ${mb} MB`),
    row("made by", m.generator),
    row("triangles", `${m.tris.toLocaleString()}${overBudget ? "  ⚠ over the 60k bulk budget" : ""}`, overBudget),
    row("vertices", m.verts.toLocaleString()),
    row("measures", `${m.heightM.toFixed(3)} m tall`
      + (declared ? ` · manifest says ${declared} m` : "")
      + (Math.abs(m.heightM - (declared || m.heightM)) > 0.03 ? "  ⚠" : ""),
      declared && Math.abs(m.heightM - declared) > 0.03),
    row("stands", Math.abs(m.floorGap) < 0.02
      ? "on the floor, as the spec asks"
      : `${(m.floorGap * 100).toFixed(1)} cm ${m.floorGap > 0 ? "above" : "below"} the floor  ⚠`,
      Math.abs(m.floorGap) >= 0.02),
    row("bones", `${m.bones}${m.props.length ? ` · ${m.props.join(", ")}` : " · no prop or chain bones"}`),
    row("materials", `${m.materials} · ${m.textures.length ? m.textures.join(", ") : "no textures"}`),
    row("own clips", m.clips.length ? `${m.clips.length} — ${m.clips.join(", ")}` : "none (the engine builds them)"),
    row("D-spec", [m.colour ? "COLOR_0 ✓" : "no COLOR_0",
                   m.shadeBias ? "shade bias ✓" : "no shade bias"].join(" · ")),
    m.extensions.length ? row("extensions", m.extensions.join(", ")) : "",
  ].join("");
  $("facts").innerHTML = html;
}

/** What the engine is still adding on top of this file, per
 *  `rig_fixes.js pendingFixes` — the same list `tools/model_fixes.mjs` prints
 *  and the rig bench shows, so three places do not disagree about what is
 *  outstanding. */
function syncFixList() {
  if (!shown) return;
  const pending = pendingFixes(shown.charKey, shown.entry);
  const keys = Object.keys(pending);
  if (!keys.length) {
    $("fixList").innerHTML =
      `<div class="factrow none"><b>nothing outstanding</b><span>this body is drawn
       exactly as the file has it — the switch changes nothing, which is what a
       finished bake looks like</span></div>`;
    return;
  }
  // `renderScale` is on the bake list but is not SHAPE: it says how big the
  // fighter is DRAWN against a head-height target, and this viewer frames on
  // the model's own height, so there is nothing here for it to change. Listed
  // and marked rather than silently missing. (`yawOffsetDeg` is applied — see
  // applyPose: it turns the rig, which is a fact about the file you can see.)
  const PRESENTATION = new Set(["renderScale"]);
  $("fixList").innerHTML = keys.map((k) => {
    const value = k === "bones"
      ? `${Object.keys(pending.bones).length} bone(s): ${Object.keys(pending.bones).join(", ")}`
      : String(pending[k]);
    const means = MODEL_FIXES[k]?.means || "";
    const note = PRESENTATION.has(k) ? " — display only, nothing for this viewer to apply" : "";
    return `<div class="factrow${PRESENTATION.has(k) ? " dimrow" : ""}">
      <b>${k} = ${value}</b><span>${means}${note}</span></div>`;
  }).join("");
}

function syncUrl() {
  const url = new URL(location);
  url.searchParams.set("edit", "3d");
  url.searchParams.set("char", state.char);
  if (state.version === "alt") url.searchParams.set("ver", "alt");
  else url.searchParams.delete("ver");
  if (state.fixes) url.searchParams.set("fixes", "1");
  else url.searchParams.delete("fixes");
  history.replaceState(null, "", url);
}

function fillCharSelect() {
  $("charSelect").innerHTML = DELIVERED
    .map((k) => `<option value="${k}"${k === state.char ? " selected" : ""}>${CHARACTERS[k].name}</option>`)
    .join("");
}

function fillVersionSelect() {
  const versions = versionsOf(state.char);
  const sel = $("verSelect");
  sel.innerHTML = versions
    .map((v) => `<option value="${v.key}"${v.key === state.version ? " selected" : ""}>${v.label}</option>`)
    .join("");
  sel.disabled = versions.length < 2;
  $("verNote").textContent = versions.length < 2
    ? "One body on file for this fighter."
    : "Switching keeps the camera where it is, so the two land in the same "
      + "pixels — which is the only way a difference of a few centimetres is "
      + "visible at all.";
}

// ------------------------------------------------------------------- wiring

fillCharSelect();
fillVersionSelect();
$("showFixes").checked = state.fixes;
$("wireframe").checked = state.wireframe;
$("showGrid").checked = state.grid;

$("charSelect").onchange = async (ev) => {
  state.char = ev.target.value;
  state.version = "current";
  fillVersionSelect();
  await show();
};
$("verSelect").onchange = async (ev) => {
  state.version = ev.target.value;
  await show();
};
$("showFixes").onchange = (ev) => {
  state.fixes = ev.target.checked;
  if (shown) applyPose(shown);
  syncUrl();
};
$("wireframe").onchange = (ev) => {
  state.wireframe = ev.target.checked;
  if (shown) applyLook(shown);
};
$("showGrid").onchange = (ev) => {
  state.grid = ev.target.checked;
  grid.visible = state.grid;
};
$("viewReset").onclick = () => frame(false);
$("viewFront").onclick = () => { view.yaw = 0; view.pitch = 0; };
$("viewSide").onclick = () => { view.yaw = 90; view.pitch = 0; };

initPose(THREE);
await show();
resize();

function tick() {
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// The page's own boot watch (index.html) waits for this; without it the header
// says the workbench never finished loading, 45 seconds after it did.
window.__workbenchReady = true;

/** For the smoke: what is on screen, without scraping the DOM for it. */
window.__modelView = {
  state,
  view,
  versions: () => versionsOf(state.char).map((v) => v.key),
  measure: () => (shown ? measure(shown) : null),
  /** One bone, in the rig's own space: where it sits and which way it is
   *  turned. Both halves are needed to see the correction layer bite — a head
   *  tilt turns a bone without moving its origin, and a shoulder widening
   *  moves an origin without turning it. */
  bone: (name) => {
    const b = shown?.root.getObjectByName(name);
    if (!b) return null;
    shown.root.updateMatrixWorld(true);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    b.matrixWorld.decompose(p, q, s);
    return { pos: p.toArray().map((v) => +v.toFixed(4)), quat: q.toArray().map((v) => +v.toFixed(4)) };
  },
};
