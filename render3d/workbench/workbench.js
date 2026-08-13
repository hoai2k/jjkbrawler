// The 3D workbench. TWO BENCHES, ONE PAGE:
//
//   POSE (the default). One drawing at a time. Pick a fighter, pick one of
//   their sprite poses, and the sprite stands beside the model in that exact
//   pose — then make the model match it, in shape, colour, size and stance.
//   The animation is not authored here at all; it is the INTERPOLATION between
//   these poses (render3d/src/sprite_poses.js), so the poses are the whole
//   job and the playhead is somebody else's problem.
//
//   ANIMATION (?edit=animation). The playhead, the beat snap, on twos, the
//   keyframe strip and the ease curves — everything that only means something
//   while a clip is running. Same module, same viewer, same rig; a body class
//   decides which set of controls is on screen, because a second page is a
//   second page to keep in step.
//
// Both share the pipeline the game draws with (loader -> pose -> scene ->
// blit) and the LOOK-DEV PANEL this backend needs and billboards did not:
//
//   * ramp / rim / outline dials, editing the same TOON/OUTLINE defaults the
//     game renders with (render3d/src/toon.js, outline.js);
//   * the sweeping-light check — the review gate for edited normals: the key
//     light orbits the figure and the terminator must cross the face as one
//     clean arc, not triangle noise;
//   * stage light presets (every stage's tint, exactly as scene.js derives
//     them in a match), the on-twos toggle, sample-rate dial, foot IK toggle,
//     turnaround preview and a parallax yaw scrub.
//
// THE POSE EDITOR (pose_edit.js) is this workbench's other half: handles on
// every joint, dragged to say what a clip should have done, exported as
// degrees for the clip tables. It is why the panel moved to the right and
// scrolls on its own, why the viewer zooms and pans, and why the comparison
// sprite can stand BESIDE the model — you cannot pose against a reference you
// have to squint through, or reach a hand drawn 6 px wide.
//
// CLIP INHERITANCE editing and per-fighter approval work exactly like the
// billboard workbench: edits are in-memory, Export writes a payload for
// `node tools/billboard_intake.mjs apply <payload.json> --backend 3d`, which
// is the only thing that touches render3d/assets/manifest.json.
//
// Every character loads with a mannequin standing in wherever no rig is
// delivered, run through the same toon+outline pass as a delivery — so the
// anime look is art-directable from day zero, before any character exists.

import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import { STATES, CLIP_STATES, clipNameFor, clipTime, aimable, aimPitch, aimSolve, AIM_MAX_DEG } from "../src/states.js";
import { artReach } from "../../src/silhouette.js";
import * as rig from "../src/loader.js";
import * as scene from "../src/scene.js";
import { DIALS, initPose, LOOK_STATES, flinchSide, boneOwners } from "../src/pose.js";
import { TOON, setToonFor, clearToonFor, PER_CHARACTER_SHADE } from "../src/toon.js";
import { OUTLINE, setOutlineFor } from "../src/outline.js";
import { blitPose } from "../src/blit.js";
import { makeViewport } from "../../billboards/workbench/viewport.js";
import { makePoseEditor } from "./pose_edit.js";
import { makeOrbit } from "./orbit.js";
import { initMobile } from "./mobile.js";
import { poseSchedule, poseCatalogue } from "../src/sprite_poses.js";
import { CHARACTER_KEYS, CHARACTERS, getActor } from "../../src/characters.js";
import { STAGES } from "../../src/stages.js";
import { state as gameState } from "../../src/state.js";
import { loadCoreAssets, loadFrame } from "../../src/assets.js";
import { drawCharFrame, currentFrame } from "../../sprites/src/sprites.js";
import { headHeightTarget } from "../../src/heights.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");

const GROUND_Y = 560;
const CX = canvas.width / 2;
/** Where the comparison sprite stands when drawn BESIDE the model. */
const COMPARE_DX = 300;

const params = new URLSearchParams(location.search);
/** Which bench: "pose" (a drawing at a time) or "anim" (?edit=animation). */
const MODE = params.get("edit") === "animation" ? "anim" : "pose";
document.body.classList.add(`mode-${MODE}`);

const wb = {
  char: params.get("char") || CHARACTER_KEYS[0],
  state: params.get("state") || "idle",
  /** The sprite pose being matched, in pose mode — a frame key. */
  pose: params.get("pose") || null,
  t: 0,
  // Pose mode holds still by definition: the thing being matched is a single
  // drawing, and a body that keeps moving cannot be compared to one.
  playing: MODE === "anim",
  // "overlay" (ghosted under the model), "left" (beside it, unghosted) or
  // "off" — the same three the billboard workbench offers. BESIDE by default:
  // this bench is a comparison, and a reference you squint through is not one.
  compare: "left",
  /** The line-up: five fighters across the floor, references overhead. */
  five: false,
  /** Draw the proof body instead of the model (loader.js proofRig). */
  mannequin: false,
  /** Free look: the viewer becomes a model viewer (scene.js setOrbit). */
  view3d: false,
  snapBeat: true,
  // The drawing is not aimed at anything. Leaving the solver on would pull the
  // striking arm onto the crosshair and then invite a comparison between that
  // and a sprite thrown level — you would spend the session posing out an
  // offset the game applies on top anyway.
  aimOn: MODE === "anim",
  faceLeft: false,
  sweep: false,
  sweepT: 0,
  parallax: 0,
  target: { x: CX + 300, y: GROUND_Y - 220 },
  dragging: false,
  orbiting: null,
  dirty: new Set(),
  notice: "",
  noticeUntil: 0,
};

/** Say something on the status line for long enough to read it. */
function notify(text) {
  wb.notice = text;
  wb.noticeUntil = performance.now() + 9000;
}

const view = makeViewport(canvas, { x: CX, y: GROUND_Y },
  { range: "zoom", out: "zoomOut", in: "zoomIn", reset: "zoomReset", value: "zoomVal" });

// ------------------------------------------------------------------- boot

await loadCoreAssets();
initPose(THREE);
scene.initScene(THREE);
// ONE rig now, the rest on demand (loader.js ensureRig).
//
// This used to fetch every approved delivery before wiring a single button:
// 56 MB of glTF and twenty-seven textures to decode. A desktop shrugs; iOS
// Safari runs out of memory partway through, so the top-level await above
// never settles, nothing below it ever runs, and the page renders perfectly
// with every control dead. That is the worst failure shape there is — it
// looks like a broken button, not like a browser giving up.
await rig.initRigs(THREE, GLTFLoader, ["all"], CHARACTER_KEYS, [wb.char]);

/** Bring a character's real rig in before showing them. */
async function ensureChar(charKey) {
  await rig.ensureRig(charKey, GLTFLoader).catch(() => {});
  scene.clearCache();
}


/**
 * The character list, ordered so the work is where the hand goes first:
 * everyone with a delivered rig, alphabetically, then a divider, then the rest
 * (who are standing in on the mannequin). The roster is 27 fighters and only a
 * handful have models — hunting for them in roster order was the tax on every
 * single visit.
 */
function fillCharSelect(sel, hasModel) {
  const label = (k) => CHARACTERS[k]?.name || k;
  const byName = (a, b) => label(a).localeCompare(label(b));
  const delivered = CHARACTER_KEYS.filter(hasModel).sort(byName);
  const rest = CHARACTER_KEYS.filter((k) => !hasModel(k)).sort(byName);
  sel.innerHTML = "";
  const add = (key) => {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = label(key);
    sel.append(o);
  };
  for (const key of delivered) add(key);
  if (delivered.length && rest.length) {
    const div = document.createElement("option");
    div.disabled = true;
    div.textContent = "──────── no model yet (mannequin) ────────";
    sel.append(div);
  }
  for (const key of rest) add(key);
}

const charSel = $("charSelect");
fillCharSelect(charSel, (k) => {
  const e = rig.rigManifest().characters?.[k];
  return !!(e?.model && e?.approved);
});
charSel.value = wb.char;

/** Step to the next/previous fighter in the list the dropdown shows — which is
 *  delivered-first, so ▶ walks the models before the mannequins. Flipping
 *  between fighters is most of what both benches are for, and doing it through
 *  a dropdown costs two gestures every time. */
function charStep(step) {
  const keys = [...charSel.options].filter((o) => !o.disabled).map((o) => o.value);
  const i = keys.indexOf(wb.char);
  charSel.value = keys[(Math.max(0, i) + step + keys.length) % keys.length];
  charSel.onchange();
}
$("charPrev").onclick = () => charStep(-1);
$("charNext").onclick = () => charStep(1);

// FREE LOOK. The match camera is one fixed ¾ angle for the whole roster, which
// is right for comparing fighters and useless for inspecting one: whether the
// back of a coat is modelled, whether the hair passes through a shoulder,
// whether that hand is a hand. So the viewer becomes a model viewer — drag to
// turn, wheel to move in — as an OFFSET on the match camera rather than a
// second camera, so switching it off is a return to exactly what the game
// draws rather than to another approximation.
// The dial itself — sensitivity, clamps and rest angle — is orbit.js, shared
// with the reads bench so one gesture does not mean two things on one page.
// No cache clear on a turn: the angle is part of the pose token
// (scene.orbitKey), so every new angle is its own entry and dragging back over
// an angle already seen is a hit rather than a re-render.
const look = makeOrbit(({ yaw, pitch, dolly }) =>
  scene.setOrbit({ yawDeg: yaw, pitchDeg: pitch, dolly }));

function setView3d(on) {
  look.setOn(on && !wb.five);
  wb.view3d = look.on;
  $("view3d").checked = wb.view3d;
  $("view3dBox").classList.toggle("on", wb.view3d);
  // While free-look owns the drag and the wheel, the 2D pan/zoom stands down —
  // and comes back untouched, because it was never dismantled.
  view.locked = wb.view3d;
  scene.clearCache();
  if (wb.view3d && editor.on) editor.setEditMode(false);
}
$("view3d").onchange = () => setView3d($("view3d").checked);

/** Turn the model by a drag, in canvas pixels. */
const orbitBy = (dx, dy) => look.dragBy(dx, dy);
const dollyBy = (factor) => look.dollyBy(factor);
canvas.addEventListener("wheel", (ev) => {
  if (!wb.view3d) return;
  ev.preventDefault();
  dollyBy(ev.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

// THE PROOF BODY. Same fighter, same clip, same facing and stance, on the
// standard skeleton instead of their model — the only way to ask whether a
// pose that reads wrong is a bad pose or a bad binding without opening the
// .glb somewhere else. Works alone or five across.
$("mqToggle").onchange = () => {
  wb.mannequin = $("mqToggle").checked;
  document.body.classList.toggle("mq", wb.mannequin);
  syncBoneProxy();
  scene.clearCache();
};

/** Put every rig back to its skin.
 *
 *  The skeleton is no longer a MODE the rigs sit in — it is a second render of
 *  the same body, taken with the proxy on for the length of one renderPose and
 *  turned off again (see the draw path). All this has to do now is guarantee
 *  nobody is left showing bones: walking the roster with the toggle on used to
 *  leave a trail of skeletons behind it. */
function syncBoneProxy() {
  const shown = new Set(wb.five ? castOf(wb.char) : [wb.char]);
  for (const char of shown) rig.setBoneProxy(char, false);
  for (const char of proxied) rig.setBoneProxy(char, false);
  proxied.clear();
}
const proxied = new Set();

/** What to draw for `char` — always their own rig; the skeleton toggle
 *  changes what that rig SHOWS, not which rig it is. */
function bodyFor(char) {
  return rig.getRig(char);
}

// The line-up. Pulls in four more models on demand — the boot still loads one,
// and this is the deliberate exception, asked for by a click.
const beforeFive = { z: 1, panX: 0, panY: 0, pivotX: CX };
$("fiveToggle").onchange = async () => {
  wb.five = $("fiveToggle").checked;
  document.body.classList.toggle("five", wb.five);
  // Five models turned five different ways is not a comparison, so free look
  // is greyed out rather than left pointing at whichever one is selected.
  if (wb.five) setView3d(false);
  $("view3dBox").classList.toggle("disabled", wb.five);
  $("view3d").disabled = wb.five;
  if (wb.five) {
    if (editor.on) editor.setEditMode(false);
    beforeFive.z = view.z;
    beforeFive.panX = view.panX;
    beforeFive.panY = view.panY;
    beforeFive.pivotX = view.pivot.x;
    view.pivot.x = CX;
    view.panX = 0;
    view.panY = 0;
    // Far enough out for five bodies and five references stacked over them.
    view.setZoom(0.75);
    notify("loading the line-up…");
    await ensureCast();
    if (wb.mannequin) syncBoneProxy();
    notify(`line-up: ${castOf(wb.char).map((k) => CHARACTERS[k]?.name || k).join(", ")}`);
    scene.clearCache();
  } else {
    if (wb.mannequin) syncBoneProxy();
    view.pivot.x = beforeFive.pivotX;
    view.panX = beforeFive.panX;
    view.panY = beforeFive.panY;
    view.setZoom(beforeFive.z);
  }
};

const stateSel = $("stateSelect");
for (const s of CLIP_STATES) {
  const o = document.createElement("option");
  o.value = s;
  o.textContent = s;
  stateSel.append(o);
}
stateSel.value = clipNameFor(wb.state);

// ------------------------------------------------------------- sprite poses
//
// The pose bench's subject. Every drawing the game can put this fighter in,
// once each, grouped under the state that draws it (sprite_poses.js) — so the
// list IS the job: work down it, and when the last one matches, the fighter is
// done. A drawing several states share is one entry, because it is one pose.

const poseSel = $("poseSelect");
let poseList = [];

function fillPoseSelect() {
  poseList = poseCatalogue(wb.char);
  poseSel.innerHTML = "";
  let group = null;
  for (const p of poseList) {
    if (!group || group.label !== p.state) {
      group = document.createElement("optgroup");
      group.label = p.state;
      poseSel.append(group);
    }
    const o = document.createElement("option");
    o.value = p.frame;
    // The count of OTHER states that draw this same pose: a warning that an
    // edit here shows up in more places than the one being looked at.
    o.textContent = p.alsoIn.length ? `${p.frame}  (+${p.alsoIn.length} more)` : p.frame;
    group.append(o);
  }
  if (!poseList.some((p) => p.frame === wb.pose)) wb.pose = poseList[0]?.frame || null;
  if (wb.pose) poseSel.value = wb.pose;
  refreshPoseMarks();
}

/** Put one drawing on screen: its state, its instant, and the editor key that
 *  IS it, so a drag lands on the pose being looked at. */
function showPose(frame) {
  const p = poseList.find((x) => x.frame === frame);
  if (!p) return;
  wb.pose = p.frame;
  wb.state = p.state;
  wb.t = p.t;
  wb.playing = false;
  poseSel.value = p.frame;
  stateSel.value = clipNameFor(p.state);
  const ki = editor?.indexOfFrame(p.frame, wb.char, clipNameFor(p.state)) ?? -1;
  if (ki >= 0) editor.selectKey(ki);
  const shared = p.alsoIn.length ? `, also drawn by ${p.alsoIn.join(", ")}` : "";
  $("poseWhere").textContent =
    `${p.state} frame ${p.i + 1} of ${poseSchedule(wb.char, p.state).length}`
    + ` · ${p.t.toFixed(2)}s at ${p.fps} fps${shared}`;
  const url = new URL(location);
  url.searchParams.set("pose", p.frame);
  url.searchParams.set("state", clipNameFor(p.state));
  history.replaceState(null, "", url);
  syncModeLinks();
  editor?.syncPanel();
  syncPanel();
}

/** Keep the other bench's link pointing at what is on screen here. Landing on
 *  somebody else's model because the link was a bare href is a small thing
 *  that happens every single time. */
function syncModeLinks() {
  for (const [id, edit] of [["toPose", null], ["toAnim", "animation"]]) {
    const url = new URL(location);
    if (edit) url.searchParams.set("edit", edit);
    else url.searchParams.delete("edit");
    const el = $(id);
    if (el) el.href = `${url.pathname}${url.search}`;
  }
}

/** Tick the poses that have been posed by hand. A 36-item list you walk once
 *  per fighter needs to say where you got to. */
function refreshPoseMarks() {
  for (const o of poseSel.options) {
    const p = poseList.find((x) => x.frame === o.value);
    if (!p) continue;
    const also = p.alsoIn.length ? `  (+${p.alsoIn.length} more)` : "";
    o.textContent = `${editor?.poseEdited(wb.char, p.frame) ? "\u25cf " : ""}${p.frame}${also}`;
  }
}

function poseStep(step) {
  const i = poseList.findIndex((p) => p.frame === wb.pose);
  const next = poseList[(Math.max(0, i) + step + poseList.length) % poseList.length];
  if (next) showPose(next.frame);
}
poseSel.onchange = () => showPose(poseSel.value);
$("posePrev").onclick = () => poseStep(-1);
$("poseNext").onclick = () => poseStep(1);

// Keys for the two things this bench does most: change fighter, change pose.
addEventListener("keydown", (e) => {
  if (!facingUI.overlay.hidden) return;             // the review owns the keys
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || "")) return;
  if (e.key === ",") charStep(-1);
  else if (e.key === ".") charStep(1);
  else if (e.key === "[" && MODE === "pose") poseStep(-1);
  else if (e.key === "]" && MODE === "pose") poseStep(1);
  else return;
  e.preventDefault();
});

const stageSel = $("stageSelect");
for (const s of STAGES) {
  const o = document.createElement("option");
  o.value = s.key;
  o.textContent = s.name;
  stageSel.append(o);
}
gameState.stageKey = STAGES[0].key;
stageSel.value = gameState.stageKey;

const fromSel = $("poseFrom");
const inheritSel = $("inheritSelect");
function fillSourceSelect(sel, extra) {
  sel.innerHTML = "";
  for (const [v, label] of extra) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = label;
    sel.append(o);
  }
  for (const key of CHARACTER_KEYS) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = `${CHARACTERS[key]?.name || key} (${key})`;
    sel.append(o);
  }
}
fillSourceSelect(fromSel, [["", "— resolve normally (own → set → default)"], ["default", "the default pose set"]]);
fillSourceSelect(inheritSel, [["default", "the default pose set"]]);

// -------------------------------------------------------------- look-dev

function coolWarm(k) {
  // one dial from the default cool shade (k=0) to a warm dusk shade (k=1)
  return [0.52 + k * 0.32, 0.56 + k * 0.12, 0.74 - k * 0.3];
}
/** The inverse, so a character whose manifest pins a tint shows the right
 *  slider position rather than snapping to zero the moment it is touched. */
function coolWarmK(tint) {
  return tint ? Math.max(0, Math.min(1, (tint[0] - 0.52) / 0.32)) : 0;
}

// ---------------------------------------------------------------- look-dev
//
// These dials are PER CHARACTER. The global TOON/OUTLINE defaults are the
// roster's look and stay a code decision (toon.js), but what one delivery needs
// — a model that arrives dark, a costume that eats its own outline — is a fact
// about that model, so the dials write the manifest entry's `toon` block, apply
// to that character's materials only, and leave in the payload.
//
// Each carries a dot when this character overrides it and a × to drop back,
// because a dial that silently edits either the roster or one fighter depending
// on a rule you cannot see is a dial nobody can trust.

/** key -> [inputId, valueId, how to read the global default, how to show it,
 *          how to push a value at one character's rig] */
const LOOK = {
  brightness: {
    id: "bright", val: "brightVal",
    base: () => TOON.brightness,
    show: (v) => `${(+v).toFixed(2)}×`,
    push: (root, v) => setToonFor(root, { brightness: v }),
  },
  shadeThreshold: {
    id: "thr", val: "thrVal",
    base: () => TOON.shadeThreshold,
    show: (v) => (+v).toFixed(2),
    push: (root, v) => setToonFor(root, { shadeThreshold: v }),
  },
  shadeTint: {
    id: "tint", val: "tintVal",
    // Stored as an rgb triple, dialled as one cool->warm number.
    base: () => coolWarmK(TOON.shadeTint),
    toStore: (k) => coolWarm(k),
    fromStore: (rgb) => coolWarmK(rgb),
    show: (v) => (+v).toFixed(2),
    push: (root, k) => setToonFor(root, { shadeTint: coolWarm(k) }),
    // Applying a STORED tint must not go through the dial. `push` takes the
    // slider's scalar and expands it back onto the cool->warm line, so putting a
    // measured triple in and reading the slider out replaced it with its
    // projection: Yuki's [0.84, 0.84, 0.83] came out of the workbench as
    // [0.84, 0.68, 0.44] — the tint the LINE has at that slider position, and a
    // different colour. The manifest's own value is applied verbatim.
    pushRaw: (root, rgb) => setToonFor(root, { shadeTint: rgb }),
    // A tint MEASURED off a DI3 sheet (tools/derive_toon_from_shade.py) is a
    // free rgb triple, and most of them do not sit on this dial's single
    // cool->warm line — Yuki's [0.84, 0.84, 0.83] projects to k=1, whose line
    // colour is [0.84, 0.68, 0.44], a different colour entirely. The slider can
    // only ever show the nearest point on its line, so where the stored value
    // is off it, SAY SO: a dial reading "1.00" beside a colour that is not what
    // 1.00 means is worse than no reading, and touching it would silently
    // replace a measurement with a guess.
    offLine: (rgb) => {
      if (!Array.isArray(rgb)) return false;
      const on = coolWarm(coolWarmK(rgb));
      return rgb.some((c, i) => Math.abs(c - on[i]) > 0.04);
    },
  },
  rimStrength: {
    id: "rim", val: "rimVal",
    base: () => TOON.rimStrength,
    show: (v) => (+v).toFixed(2),
    push: (root, v) => setToonFor(root, { rimStrength: v }),
  },
  outlinePx: {
    id: "outline", val: "outVal",
    base: () => OUTLINE.px,
    show: (v) => `${(+v).toFixed(1)} px`,
    push: (root, v) => setOutlineFor(root, v),
  },
};

/** What this character overrides, live, from the manifest entry. */
function lookOverride(key) {
  const stored = rig.rigManifest().characters?.[wb.char]?.toon?.[key];
  if (stored === undefined) return undefined;
  // `?shade=roster` is the A/B for the shade tints measured off the DI3 sheets
  // (tools/derive_toon_from_shade.py), and it has to reach the workbench or the
  // one place built for looking closely at a model is the one place that cannot
  // show the comparison. Only the measured tint is suppressed; every dial
  // somebody set by hand still applies.
  if (key === "shadeTint" && !PER_CHARACTER_SHADE) return undefined;
  const spec = LOOK[key];
  return spec.fromStore ? spec.fromStore(stored) : stored;
}

function syncLookPanel() {
  $("lookdevWho").textContent = CHARACTERS[wb.char]?.name || wb.char;
  for (const [key, spec] of Object.entries(LOOK)) {
    const over = lookOverride(key);
    const value = over ?? spec.base();
    $(spec.id).value = String(value);
    const raw = rig.rigManifest().characters?.[wb.char]?.toon?.[key];
    $(spec.val).textContent = (over !== undefined && spec.offLine?.(raw))
      ? `measured ${raw.map((n) => n.toFixed(2)).join(", ")}`
      : spec.show(value);
    document.querySelector(`label.dial[data-key="${key}"]`)
      ?.classList.toggle("overridden", over !== undefined);
  }
}

/** Apply this character's look to their rig — on load, on a character change,
 *  and after every dial move. */
function applyLook() {
  const r = rig.getRig(wb.char);
  if (!r) return;
  for (const [key, spec] of Object.entries(LOOK)) {
    const over = lookOverride(key);
    if (over === undefined) continue;
    const raw = rig.rigManifest().characters?.[wb.char]?.toon?.[key];
    if (spec.pushRaw && raw !== undefined) spec.pushRaw(r.root, raw);
    else spec.push(r.root, over);
  }
  scene.clearCache();
}

for (const [key, spec] of Object.entries(LOOK)) {
  $(spec.id).oninput = () => {
    const v = parseFloat($(spec.id).value);
    const entry = entryFor(wb.char);
    entry.toon = entry.toon || {};
    entry.toon[key] = spec.toStore ? spec.toStore(v) : v;
    wb.dirty.add(wb.char);
    const r = rig.getRig(wb.char);
    if (r) spec.push(r.root, v);
    scene.clearCache(); // dials change pixels without changing tokens
    syncLookPanel();
    syncPanel();
  };
}
for (const btn of document.querySelectorAll("label.dial .clear")) {
  btn.onclick = (ev) => {
    ev.preventDefault();
    const key = btn.dataset.key;
    const entry = entryFor(wb.char);
    if (entry.toon) delete entry.toon[key];
    if (entry.toon && !Object.keys(entry.toon).length) delete entry.toon;
    wb.dirty.add(wb.char);
    const r = rig.getRig(wb.char);
    if (r) {
      if (key === "outlinePx") setOutlineFor(r.root, null);
      else clearToonFor(r.root, [key]);
    }
    scene.clearCache();
    syncLookPanel();
    syncPanel();
  };
}

// The two that stay global: an engine sample rate and a camera trim, neither
// of which is a fact about a model.
for (const [id, valId, get, set] of [
  ["hz", "hzVal", () => DIALS.sampleHz, (v) => { DIALS.sampleHz = v; }],
  ["par", "parVal", () => wb.parallax, (v) => { wb.parallax = v; }],
]) {
  $(id).value = String(get());
  $(valId).textContent = String(get());
  $(id).oninput = () => {
    const v = parseFloat($(id).value);
    $(valId).textContent = String(v);
    set(v);
    scene.clearCache();
  };
}
$("sweepToggle").onchange = () => { wb.sweep = $("sweepToggle").checked; if (!wb.sweep) { // THE POSE BENCH RENDERS AT EXACT TIMES. Same reason as editing (below): a
// drawing is matched at the instant it is on screen, and the on-twos sampler
// would quietly answer with the nearest 13 Hz tick instead — a different pose
// from the one named in the dropdown, in exactly the states that move fastest.
if (MODE === "pose") DIALS.onTwos = false;
scene.setKeyLightAngle(0.55); scene.clearCache(); } };
$("ikToggle").onchange = () => { DIALS.footIK = $("ikToggle").checked; scene.clearCache(); };
$("twosToggle").onchange = () => { DIALS.onTwos = $("twosToggle").checked && !editor.on; scene.clearCache(); };
$("turnToggle").onchange = () => { wb.faceLeft = $("turnToggle").checked; };
$("interpToggle").onchange = () => {
  editor.setInterpolate($("interpToggle").checked);
  notify($("interpToggle").checked
    ? "playing the interpolation between this state's sprite poses"
    : "playing the delivered clip");
};
stageSel.onchange = () => { gameState.stageKey = stageSel.value; scene.clearCache(); };

// ------------------------------------------------------------- manifest edit

function entryFor(charKey) {
  const man = rig.rigManifest();
  man.characters = man.characters || {};
  man.characters[charKey] = man.characters[charKey] || {};
  return man.characters[charKey];
}

function syncPanel() {
  const entry = rig.rigManifest().characters?.[wb.char] || {};
  const resolved = rig.resolveClip(wb.char, wb.state);
  $("sourceLine").textContent = resolved
    ? `resolves: ${resolved.source}` : "resolves: NOTHING — state would fall to sprites";
  const r = rig.getRig(wb.char);
  $("rigLine").textContent = entry.model
    ? `rig: ${entry.model}${entry.approved ? " (approved)" : " (NOT approved)"}`
    : `rig: none delivered — mannequin standing in (${r ? r.clips.size : 0} own clips)`;
  fromSel.value = entry.clips?.[clipNameFor(wb.state)]?.from || "";
  inheritSel.value = entry.inheritClips || "default";
  $("approveToggle").checked = !!entry.approved;

  const table = $("stateTable");
  table.innerHTML = "";
  for (const s of CLIP_STATES) {
    const res = rig.resolveClip(wb.char, s);
    const name = document.createElement("div");
    name.textContent = s;
    if (s === clipNameFor(wb.state)) name.className = "sel";
    const src = document.createElement("div");
    src.textContent = res?.source || "—";
    src.className = res?.source === "own" ? "own" : res?.source === "default" ? "def" : "inh";
    name.onclick = src.onclick = () => { stateSel.value = s; stateSel.onchange(); };
    table.append(name, src);
  }
}

fromSel.onchange = () => {
  const entry = entryFor(wb.char);
  const clip = clipNameFor(wb.state);
  entry.clips = entry.clips || {};
  if (fromSel.value) entry.clips[clip] = { from: fromSel.value };
  else delete entry.clips[clip];
  wb.dirty.add(wb.char);
  syncPanel();
};
inheritSel.onchange = () => {
  entryFor(wb.char).inheritClips = inheritSel.value;
  wb.dirty.add(wb.char);
  syncPanel();
};
$("approveToggle").onchange = () => {
  entryFor(wb.char).approved = $("approveToggle").checked;
  wb.dirty.add(wb.char);
  syncPanel();
};

$("exportBtn").onclick = () => {
  const man = rig.rigManifest();
  const payload = {
    kind: "render3d-workbench",
    exported: new Date().toISOString(),
    // The roster's look, for reference only: the look-dev dials edit the
    // per-character `toon` blocks on the entries below, and changing the
    // global default is still a hand edit of render3d/src/toon.js.
    rosterLook: { shadeThreshold: TOON.shadeThreshold, shadeTint: TOON.shadeTint,
      rimStrength: TOON.rimStrength, brightness: TOON.brightness,
      outlinePx: OUTLINE.px, sampleHz: DIALS.sampleHz },
    characters: Object.fromEntries([...wb.dirty].map((k) => [k, man.characters[k]])),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "render3d-payload.json";
  a.click();
  notify(wb.dirty.size
    ? `exported ${wb.dirty.size} character(s) — apply with tools/billboard_intake.mjs --backend 3d`
    : "exported an empty payload — nothing has been edited");
};

// -------------------------------------------------------------- idle review
//
// The whole delivered roster's IDLE, one fighter at a time, each beside their
// own idle sprite, full screen and thumb-driven.
//
// It began as a FACING pass, became a SIZING one, and is now all three
// judgements at once — size, stance, facing — because they were never
// separable. A fighter who stands too wide reads short. A fighter turned too
// far square reads wide. Each of those gets "corrected" with the wrong dial
// when it is the only dial on screen, and the roster carries two passes of
// that already.
//
// It needs the SPRITE IN FRAME: "which way is this fighter pointing?" can be
// answered from a single figure, but "is this model as big as the drawing?"
// cannot be answered from memory at all. So this viewer is a comparison, and
// it gives up figure size to fit both.
//
// The legs arrive straight and the soles level (ik.js applyIdleStand), so the
// three dials are the only things left that differ — which is what makes them
// judgeable in a few seconds each.
//
// No Approve: this pass produces a set of adjustments to hand back, not a
// sign-off, so every fighter it touches goes into the payload.
const facing = {
  list: [],
  i: 0,
  /** Fighters whose numbers were touched this session — what Download
   *  carries. */
  touched: new Set(),
  home: null,      // the canvas's real parent, to put it back
  wasPlaying: true,
  wasZoom: 1,
  wasPan: { x: 0, y: 0 },
  wasAim: true,
  wasCompare: "left",
  wasPose: null,
};

const facingUI = {
  overlay: $("facingOverlay"),
  name: $("facingName"),
  progress: $("facingProgress"),
  scale: $("facingScale"),
  scaleVal: $("facingScaleVal"),
  stance: $("facingStance"),
  stanceVal: $("facingStanceVal"),
  yaw: $("facingYaw"),
  yawVal: $("facingYawVal"),
  head: $("facingHead"),
  headVal: $("facingHeadVal"),
  stage: $("facingStage"),
};

/** How far in to push the viewer.
 *
 *  Bounded at both ends. The PAIR — sprite, gap, model — spans roughly
 *  COMPARE_DX plus two bodies, about 400 canvas px, so much past 2.4x and
 *  the sprite walks off the side, which is exactly the bug that made the
 *  facing pass give up on the reference. Much under 2x and both figures sit
 *  marooned in the middle of a 1040x660 stage that has to be shown whole. */
const FACING_ZOOM = 2.0;

/** Every fighter with a delivered rig, in roster order. */
function facingRoster() {
  const man = rig.rigManifest();
  return CHARACTER_KEYS.filter((k) => man.characters?.[k]?.model);
}

function facingOpen() {
  facing.list = facingRoster();
  if (!facing.list.length) { notify("no delivered rigs to review"); return; }
  facing.i = Math.max(0, facing.list.indexOf(wb.char));
  facing.home = $("stageWrap").parentNode;
  facingUI.stage.append($("stageWrap"));
  facingUI.overlay.hidden = false;
  facing.wasPlaying = wb.playing;
  facing.wasZoom = view.z;
  facing.wasPan = { x: view.panX, y: view.panY };
  facing.wasAim = wb.aimOn;
  facing.wasCompare = wb.compare;
  facing.wasPose = wb.pose;
  // Hold the idle still: a looping breath changes a figure's height by a few
  // pixels, which is enough to argue with while sizing.
  wb.playing = false;
  wb.aimOn = false;
  // THE REFERENCE, beside the model — the whole point of this pass.
  wb.compare = "left";
  $("compareMode").value = "left";
  view.pivot.x = CX - COMPARE_DX / 2;
  view.setZoom(FACING_ZOOM);
  view.panY = canvas.height * 0.07;
  document.documentElement.requestFullscreen?.().catch(() => {});
  facingShow();
}

function facingClose() {
  if (facing.home) facing.home.insertBefore($("stageWrap"), facing.home.firstChild);
  facingUI.overlay.hidden = true;
  wb.playing = facing.wasPlaying;
  wb.aimOn = facing.wasAim;
  wb.compare = facing.wasCompare;
  wb.pose = facing.wasPose;
  $("compareMode").value = facing.wasCompare;
  fillPoseSelect();
  if (MODE === "pose" && wb.pose) showPose(wb.pose);
  view.pivot.x = facing.wasCompare === "left" ? CX - COMPARE_DX / 2 : CX;
  view.setZoom(facing.wasZoom);
  view.panX = facing.wasPan.x;
  view.panY = facing.wasPan.y;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  syncSizePanel();
  syncPanel();
}

/** Put the current fighter on screen and sync the dials to their numbers. */
function facingShow() {
  const char = facing.list[facing.i];
  // Fetch this one if it has not been seen yet — the review is the one place
  // that walks all twenty-seven, and it does it one at a time. Re-shown once
  // the real model lands, and ONLY then: re-showing unconditionally would
  // call straight back into here and never stop.
  const held = rig.getRig(char);
  if (!held || held.isMannequin) {
    ensureChar(char).then(() => {
      if (facing.list[facing.i] === char && !rig.getRig(char)?.isMannequin) facingShow();
    });
  }
  wb.char = char;
  wb.state = "idle";
  wb.t = 0;
  // The reference is pinned to the pose being matched (ensureGhostFrame), and
  // the review's pose is the idle — otherwise it would keep showing whichever
  // drawing the bench was left on and size the fighter against a punch.
  wb.pose = poseSchedule(char, "idle")[0]?.frame || null;
  charSel.value = char;
  stateSel.value = "idle";
  editor.fillJoints();
  syncLookPanel();
  applyLook();
  syncSizePanel();
  syncPanel();
  // The sprite has to be in memory or the reference half of the frame is
  // blank — and a blank reference looks exactly like a model that is right.
  loadFrame(char, "idle_a").catch(() => {});

  const r = rig.getRig(char);
  const scale = r?.renderScale ?? 1;
  const stance = r?.stanceDeg ?? 0;
  const yaw = ((r?.yawOffsetDeg ?? 0) + 180) % 360 - 180; // shown in [-180, 180)
  facingUI.scale.value = String(scale);
  facingUI.scaleVal.textContent = `${scale.toFixed(2)}×`;
  facingUI.stance.value = String(stance);
  facingUI.stanceVal.textContent = `${stance}°`;
  facingUI.yaw.value = String(yaw);
  facingUI.yawVal.textContent = `${yaw}°`;
  const head = r?.headTiltDeg ?? 0;
  facingUI.head.value = String(head);
  facingUI.headVal.textContent = `${head}°`;
  facingUI.name.textContent = CHARACTERS[char]?.name || char;
  facingSyncProgress();
  facingUI.overlay.classList.toggle("decided", facing.touched.has(char));
}

function facingSetScale(v) {
  const clamped = Math.max(0.4, Math.min(2.5, v));
  setScale(clamped);
  facing.touched.add(facing.list[facing.i]);
  facingUI.scale.value = String(clamped);
  facingUI.scaleVal.textContent = `${clamped.toFixed(2)}×`;
  facingUI.overlay.classList.add("decided");
  facingSyncProgress();
}

/** How this fighter carries their head, in degrees of nod: positive lifts the
 *  chin. It corrects the MODEL — generated heads arrive looking slightly down,
 *  and the tilt lives in the mesh rather than the skeleton, so it is judged
 *  against the drawing here rather than measured off the rig. */
function facingSetHead(deg) {
  const clamped = Math.max(-20, Math.min(20, Math.round(deg * 2) / 2));
  const char = facing.list[facing.i];
  rig.setRigSettings(char, { headTiltDeg: clamped });
  if (clamped) entryFor(char).headTiltDeg = clamped;
  else delete entryFor(char).headTiltDeg;
  wb.dirty.add(char);
  facing.touched.add(char);
  scene.clearCache();
  facingUI.head.value = String(clamped);
  facingUI.headVal.textContent = `${clamped}°`;
  facingUI.overlay.classList.add("decided");
  facingSyncProgress();
}

function facingSetStance(deg) {
  const clamped = Math.max(-10, Math.min(25, Math.round(deg)));
  const char = facing.list[facing.i];
  rig.setRigSettings(char, { stanceDeg: clamped });
  entryFor(char).stanceDeg = clamped;
  wb.dirty.add(char);
  facing.touched.add(char);
  scene.clearCache();
  facingUI.stance.value = String(clamped);
  facingUI.stanceVal.textContent = `${clamped}°`;
  facingUI.overlay.classList.add("decided");
  facingSyncProgress();
}

function facingSetYaw(deg) {
  // Wrapped, not clamped: turning past the end of the dial is how a rig that
  // arrived backwards gets turned round, and a stop at 180 makes that a
  // journey the long way instead.
  const wrapped = ((Math.round(deg / 5) * 5) % 360 + 360) % 360;
  const char = facing.list[facing.i];
  setYaw(wrapped);
  facing.touched.add(char);
  const shown = (wrapped + 180) % 360 - 180;
  facingUI.yaw.value = String(shown);
  facingUI.yawVal.textContent = `${shown}°`;
  facingUI.overlay.classList.add("decided");
  facingSyncProgress();
}

/** The header counts changes, so it has to be refreshed when one happens
 *  and not only when the fighter changes. */
function facingSyncProgress() {
  facingUI.progress.textContent =
    `${facing.i + 1} / ${facing.list.length}  ·  ${facing.touched.size} changed`;
}

function facingGo(step) {
  facing.i = (facing.i + step + facing.list.length) % facing.list.length;
  facingShow();
}

$("facingReviewBtn").onclick = facingOpen;
$("facingReviewTop").onclick = facingOpen;
$("facingClose").onclick = facingClose;
$("facingScale").oninput = () => facingSetScale(parseFloat(facingUI.scale.value) || 1);
$("facingStance").oninput = () => facingSetStance(parseFloat(facingUI.stance.value) || 0);
$("facingYaw").oninput = () => facingSetYaw(parseFloat(facingUI.yaw.value) || 0);
$("facingHead").oninput = () => facingSetHead(parseFloat(facingUI.head.value) || 0);
for (const b of document.querySelectorAll("[data-scale]")) {
  b.onclick = () => facingSetScale((parseFloat(facingUI.scale.value) || 1)
    + parseFloat(b.dataset.scale));
}
for (const b of document.querySelectorAll("[data-stance]")) {
  b.onclick = () => facingSetStance((parseFloat(facingUI.stance.value) || 0)
    + parseFloat(b.dataset.stance));
}
for (const b of document.querySelectorAll("[data-yaw]")) {
  b.onclick = () => facingSetYaw((parseFloat(facingUI.yaw.value) || 0)
    + parseFloat(b.dataset.yaw));
}
for (const b of document.querySelectorAll("[data-headtilt]")) {
  b.onclick = () => facingSetHead((parseFloat(facingUI.head.value) || 0)
    + parseFloat(b.dataset.headtilt));
}
$("facingFit").onclick = () => {
  // The measured answer, as a starting point rather than a verdict: it makes
  // the model stand its declared height, which is right when the sprite is
  // drawn to the same proportions and wrong whenever the art says otherwise.
  const s = rig.suggestedScale(wb.char, editor?.editedClip?.(wb.char, "idle") || null);
  if (s) facingSetScale(s.scale);
  else notify("no measurement for this fighter — size by eye");
};
$("facingNext").onclick = () => facingGo(1);
$("facingPrev").onclick = () => facingGo(-1);
$("facingSave").onclick = () => {
  const man = rig.rigManifest();
  // The SAME payload shape the desk's Export writes, so a phone download goes
  // straight through `billboard_intake.mjs apply … --backend 3d`. `sizes` is
  // a readable summary beside it; apply reads `characters` and ignores the
  // rest.
  const chars = [...facing.touched];
  const payload = {
    kind: "render3d-workbench",
    exported: new Date().toISOString(),
    sizes: Object.fromEntries(chars.map((k) => [k, {
      renderScale: man.characters[k]?.renderScale ?? 1,
      stanceDeg: man.characters[k]?.stanceDeg ?? 0,
      yawOffsetDeg: man.characters[k]?.yawOffsetDeg ?? 0,
    }])),
    characters: Object.fromEntries(chars.map((k) => [k, man.characters[k]])),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "idle-adjustments.json";
  a.click();
  notify(chars.length
    ? `saved ${chars.length} adjustment(s) — apply with tools/billboard_intake.mjs apply idle-adjustments.json --backend 3d`
    : "nothing changed yet — the file would be empty");
};
addEventListener("keydown", (e) => {
  if (facingUI.overlay.hidden) return;
  if (e.key === "Escape") facingClose();
  else if (e.key === "ArrowLeft") facingSetScale((parseFloat(facingUI.scale.value) || 1) - 0.01);
  else if (e.key === "ArrowRight") facingSetScale((parseFloat(facingUI.scale.value) || 1) + 0.01);
  else if (e.key === "Enter") facingGo(1);
  else return;
  e.preventDefault();
});

// -------------------------------------------------------------- pose editing
//
// The editor needs to put a handle exactly where a joint is DRAWN, which means
// walking the same path the pixels took: project the bone through the render
// camera into the cached texture (scene.js), then place that texture pixel with
// blit.js's arithmetic. Both halves are two constants and a ratio, and both are
// stated once here so a handle can never drift from the body it belongs to.

let lastEntry = null;   // the pose texture on screen, for the handle mapping
let lastLayers = {};    // the live layers it was rendered with

/** Texture pixel -> game-pixel canvas coordinates, matching blitPose. */
function texToCanvas(u, v) {
  if (!lastEntry) return null;
  const targetPx = headHeightTarget(wb.char);
  const s = targetPx / (lastEntry.rowsPerMetre * lastEntry.heightM);
  const footRow = scene.TEX_SIZE * (1 - scene.FOOT_FRAC);
  return { x: CX + mirrorSign() * (u - scene.TEX_SIZE / 2) * s,
           y: GROUND_Y + (v - footRow) * s };
}

/** +1 normally; -1 when facing is a blit-time mirror rather than a rig yaw. */
function mirrorSign() {
  if (!lastEntry || lastEntry.yawed) return 1;
  return wb.faceLeft ? -1 : 1;
}

const _pj = {};
function project(worldVec) {
  const p = scene.projectToTexture(worldVec, _pj);
  if (!p) return null;
  const c = texToCanvas(p.u, p.v);
  return c ? { ...c, behind: p.z > 1 } : null;
}

/** The clip this state plays, with the pose editor's keyframe edits folded in.
 *  Everything that draws or measures goes through here, so the viewer shows
 *  the edited animation and never the one on disk. */
function resolvedClip(char = wb.char, st = wb.state) {
  const base = rig.resolveClip(char, st);
  const edited = editor?.editedClip?.(char, clipNameFor(st));
  return edited ? { clip: edited, source: `${base?.source || "?"} (edited)` } : base;
}

/** Pose the rig for the frame on screen without rendering — the handles read
 *  world matrices, and a cache hit never poses. */
function posePreviewNow() {
  return scene.posePreview(wb.char, wb.state, wb.t, rig.getRig(wb.char), resolvedClip(), lastLayers);
}

/** The size dial, the facing, and the measurement offered beside them. */
let suggested = null;
function syncSizePanel() {
  const r = rig.getRig(wb.char);
  if (!r) return;
  $("scaleRange").value = String(r.renderScale);
  $("scaleNum").value = String(r.renderScale);
  $("scaleVal").textContent = `${r.renderScale.toFixed(2)}×`;
  const yaw = ((r.yawOffsetDeg + 180) % 360 + 360) % 360 - 180; // [-180, 180)
  $("yawRange").value = String(yaw);
  $("yawNum").value = String(yaw);
  $("yawVal").textContent = `${yaw}°`;
  suggested = rig.suggestedScale(wb.char, editor?.editedClip?.(wb.char, "idle") || null);
  const target = headHeightTarget(wb.char);
  $("scaleLine").textContent = suggested
    ? `idle measures ${suggested.measured.toFixed(3)} m against ${suggested.declared.toFixed(3)} m declared`
      + ` → ${suggested.scale.toFixed(3)}× would stand exactly ${target.toFixed(0)} px`
    : `declared ${r.declaredHeight.toFixed(3)} m → drawn ${target.toFixed(0)} px at 1.00×`;
  $("scaleSuggest").disabled = !suggested;
}

function setScale(v) {
  const clamped = Math.max(0.4, Math.min(2.5, v));
  rig.setRigSettings(wb.char, { renderScale: clamped });
  entryFor(wb.char).renderScale = +clamped.toFixed(4);
  wb.dirty.add(wb.char);
  scene.clearCache();
  syncSizePanel();
}
$("scaleRange").oninput = () => setScale(parseFloat($("scaleRange").value));
$("scaleNum").onchange = () => setScale(parseFloat($("scaleNum").value) || 1);
$("scaleReset").onclick = () => setScale(1);
$("scaleSuggest").onclick = () => { if (suggested) setScale(suggested.scale); };
function setYaw(deg) {
  rig.setRigSettings(wb.char, { yawOffsetDeg: deg });
  entryFor(wb.char).yawOffsetDeg = deg;
  wb.dirty.add(wb.char);
  scene.clearCache();
  syncSizePanel();
}
$("yawRange").oninput = () => setYaw(parseFloat($("yawRange").value) || 0);
$("yawNum").onchange = () => setYaw(parseFloat($("yawNum").value) || 0);
$("yawReset").onclick = () => setYaw(0);
$("yawFlip").onclick = () => {
  const cur = rig.getRig(wb.char)?.yawOffsetDeg || 0;
  setYaw(((cur + 180 + 180) % 360 + 360) % 360 - 180);
};

// Declared first: resolvedClip() below is called during the editor's own
// construction, and a const in its temporal dead zone throws even behind `?.`.
let editor = null;
editor = makePoseEditor({
  THREE, canvas,
  camera: () => scene.__cam(),
  getRig: () => rig.getRig(wb.char),
  charKey: () => wb.char,
  stateKey: () => clipNameFor(wb.state),
  stateSpec: (st) => STATES[clipNameFor(st)],
  resolveClip: (char, st) => rig.resolveClip(char, st),
  // The keys ARE the sprite poses: the clip is read at the instants this
  // fighter's drawings are on screen, so an edit is an edit to a drawing.
  poseSchedule,
  boneOwners,
  clipTime: () => clipTime(wb.state, wb.t),
  setTime: (t) => {
    // Selecting a keyframe parks the playhead on it: an edit made between
    // extremes is an edit you cannot see land.
    wb.playing = false;
    $("playBtn").textContent = "▶ Play";
    wb.t = t;
    $("scrub").value = String(t / STATES[clipNameFor(wb.state)].duration);
  },
  project, mirror: mirrorSign,
  posePreview: posePreviewNow,
  onChange: () => { scene.clearCache(); refreshPoseMarks(); },
  onHeightChange: () => {
    // Editing the idle changes what the model MEASURES, which changes what
    // scale would make it stand its target — a reading, not an action: the
    // dial stays the artist's (see syncSizePanel).
    syncSizePanel();
  },
  onEditModeChange: (on) => {
    // Editing a moving target is not editing. Turning the mode on stops the
    // clock; turning it off leaves it stopped, so the scrub stays where the
    // pose was judged.
    if (on && wb.playing) {
      wb.playing = false;
      $("playBtn").textContent = "▶ Play";
    }
    // ...and stops SAMPLING on twos, which is the other way the body on screen
    // stops being the pose you think you are editing. On twos the render is
    // taken at the nearest 13 Hz tick, so parking the playhead on a keyframe
    // at 0.077 s draws the clip at 0.0769 s instead — near enough to look
    // right and far enough, in a run cycle, to put a dragged forearm 75° from
    // where it was dropped, because the drag composes into a pose the body was
    // never actually in. Exact times while editing; the toggle is honoured
    // again the moment it is off.
    DIALS.onTwos = on ? false : $("twosToggle").checked;
    scene.clearCache();
  },
  status: notify,
});

// ------------------------------------------------------------------ drawing

async function ensureGhostFrame() {
  // In pose mode the reference is PINNED to the drawing being matched, not
  // read off the playhead: they agree while the playhead sits on the pose, and
  // the moment anything nudges it (a scrub, a rounding, a state whose art
  // outruns its duration) the comparison would quietly become a comparison
  // with a different drawing.
  const frame = MODE === "pose" && wb.pose ? wb.pose : currentFrame(wb.char, wb.state, wb.t);
  await loadFrame(wb.char, frame).catch(() => {});
  return frame;
}

// ------------------------------------------------------------------ five up
//
// A LINE-UP, not five workbenches. One fighter at a time answers "is this pose
// right?", and answers it well — but it cannot answer "does this roster read
// as one set of characters?", which is the question that decides whether the
// 3D fighters look like a game or like twenty-seven separate deliveries. Five
// abreast, each under their own drawing, is the smallest arrangement that
// does: differences in size, in colour temperature, in how heavily they are
// outlined, in how wide they stand, are all invisible one at a time and
// obvious in a row.
//
// So it is a VIEWING mode, and the panel says so by putting every per-fighter
// control away — a dial that silently edits whichever of the five happens to
// be selected is a dial that damages four of them by accident.

const CAST = 5;
/** How far apart they stand, in game pixels — wide enough that a spear or a
 *  swung axe does not cross into the neighbour's half. */
const CAST_DX = 250;

/** Five fighters starting at the selected one, wrapping — in the order the
 *  dropdown shows, so ▶ walks the line-up along by one. */
function castOf(char) {
  const keys = [...charSel.options].filter((o) => !o.disabled).map((o) => o.value);
  const at = Math.max(0, keys.indexOf(char));
  return Array.from({ length: Math.min(CAST, keys.length) },
    (_, i) => keys[(at + i) % keys.length]);
}

/** Pull in the models the line-up needs, one at a time so a slow fetch shows
 *  four fighters rather than none. */
async function ensureCast() {
  for (const char of castOf(wb.char)) {
    const held = rig.getRig(char);
    if (!held || held.isMannequin) await ensureChar(char);
  }
}

async function drawLineUp() {
  const cast = castOf(wb.char);
  const facing = wb.faceLeft ? -1 : 1;
  // ONE baseline for the whole reference row, cleared by the tallest fighter
  // in it. Hanging each sprite its own distance above its own model would make
  // the row a staircase, and a staircase is the one thing that stops five
  // drawings from being comparable to each other.
  const shelf = GROUND_Y - Math.max(...cast.map(headHeightTarget)) - 44;
  for (const [i, char] of cast.entries()) {
    const x = CX + (i - (cast.length - 1) / 2) * CAST_DX;
    const target = headHeightTarget(char);
    const r = bodyFor(char);
    const resolved = resolvedClip(char, wb.state);
    // No aim, no reach, no hand edits: this is the pose as authored, which is
    // the only version of it that means the same thing for all five.
    const base = { parallaxDeg: wb.parallax,
      turnYawRad: DIALS.turnaround && facing < 0 ? scene.turnaroundYaw() : 0 };
    rig.setBoneProxy(char, false);
    const entry = scene.renderPose(char, wb.state, wb.t, r, resolved, base);
    if (entry) blitPose(ctx, entry, char, x, GROUND_Y, { scale: getActor(char)?.scale, facing, alpha: 0.95 });

    // The rig goes on the SHELF, in the slot the drawing would have taken.
    // Five pairs have no room for a third column each, and the models are the
    // thing being lined up — so here the skeleton displaces the reference
    // rather than the body, which is the same trade the single view makes in
    // the other direction.
    if (wb.mannequin) {
      rig.setBoneProxy(char, true);
      const mqEntry = scene.renderPose(char, wb.state, wb.t, r, resolved,
        { ...base, mannequin: true });
      rig.setBoneProxy(char, false);
      proxied.add(char);
      if (mqEntry) {
        blitPose(ctx, mqEntry, char, x, shelf, { scale: getActor(char)?.scale, facing, alpha: 0.95 });
      }
    } else if (wb.compare !== "off") {
      // ABOVE, not beside: five pairs side by side have no room for a second
      // column each, and stacking keeps every fighter's reference over the
      // fighter it belongs to rather than next to their neighbour.
      const frame = MODE === "pose" && wb.pose && frameDrawn(char, wb.pose)
        ? wb.pose : currentFrame(char, wb.state, wb.t);
      await loadFrame(char, frame).catch(() => {});
      drawCharFrame(ctx, char, frame, x, shelf,
        { scale: getActor(char)?.scale, alpha: 1, facing });
    }
    ctx.fillStyle = char === wb.char ? "#9fd39f" : "#8b96b3";
    ctx.fillText(CHARACTERS[char]?.name || char, x - 24, GROUND_Y + 18);
  }
}

/** Does this fighter's art actually have that drawing? Two fighters' pose sets
 *  are not the same set — half the roster still reaches a state through a
 *  fallback — so the line-up shows each of them the pose they really draw. */
function frameDrawn(char, frame) {
  return poseCatalogue(char).some((p) => p.frame === frame);
}

let lastTick = performance.now();
async function draw() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  const dur = STATES[clipNameFor(wb.state)].duration;
  if (wb.playing) {
    wb.t = (wb.t + dt) % (STATES[clipNameFor(wb.state)].loop ? dur : dur + 0.4);
    $("scrub").value = String((wb.t % dur) / dur);
  }
  $("timeLabel").textContent = `${clipTime(wb.state, wb.t).toFixed(2)}s`;

  if (wb.sweep) {
    // the normals review gate: orbit the key light, clear the cache so every
    // frame re-lights (the workbench pays for what the game never does)
    wb.sweepT += dt;
    scene.setKeyLightAngle(wb.sweepT * 0.9, 0.5 + Math.sin(wb.sweepT * 0.35) * 0.5);
    scene.clearCache();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  view.begin(ctx);
  ctx.strokeStyle = "#2c3654";
  ctx.beginPath();
  ctx.moveTo(-2000, GROUND_Y);
  ctx.lineTo(canvas.width + 2000, GROUND_Y);
  ctx.stroke();

  // FIVE UP: the line-up. Everything below draws one fighter at CX; this draws
  // the same thing five times across the floor, and puts each reference over
  // its own model instead of beside it — a row of pairs, which is the only
  // arrangement in which five comparisons fit on one screen at once.
  if (wb.five) {
    await drawLineUp();
    view.end(ctx);
    hud(now);
    requestAnimationFrame(draw);
    return;
  }

  // WHERE EACH BODY STANDS. The skeleton used to REPLACE the model in its slot,
  // which is the one arrangement in which it cannot do its job: the question it
  // answers is "does the rig agree with the model", and you cannot ask that of
  // two things never on screen together. So it takes the COMPARISON slot, and
  // the drawing yields it — the model stays a model.
  //
  // Yields rather than shuffles left: the pose bench opens at 1.8x, where the
  // pair already fills the canvas, and a third body at that zoom is drawn
  // off the edge where it looks like nothing was drawn at all. The sprite is
  // one click away on the compare dial, and `Overlay` keeps all three at once
  // — drawing, rig and model — for the moment you want them.
  const beside = wb.compare === "left";
  const mqX = wb.mannequin ? CX - COMPARE_DX : null;
  const spriteX = beside ? CX - COMPARE_DX : CX;
  const spriteYields = wb.mannequin && beside;

  if (wb.compare !== "off" && !spriteYields) {
    const frame = await ensureGhostFrame();
    drawCharFrame(ctx, wb.char, frame, spriteX, GROUND_Y, {
      scale: getActor(wb.char)?.scale, alpha: beside ? 1 : 0.35,
      facing: wb.faceLeft ? -1 : 1,
    });
    if (beside) {
      ctx.fillStyle = "#8b96b3";
      ctx.fillText("sprite", spriteX - 20, GROUND_Y + 18);
      ctx.fillText("3D", CX - 8, GROUND_Y + 18);
    }
  }

  const facing = wb.faceLeft ? -1 : 1;
  const target = headHeightTarget(wb.char);
  const chestY = GROUND_Y - target * 0.55;
  const pitch = wb.aimOn ? aimPitch(CX, chestY, wb.target, facing) : 0;
  // The reach half of the aim solution — the same call the game makes
  // (backend.js liveLayers). Without it the workbench leaned an attack toward
  // the crosshair but never solved the limb ONTO it, so a state that reaches
  // in play looked in the tool like a body bending at nothing.
  const solved = wb.aimOn ? aimSolve(CX, GROUND_Y, chestY, wb.target, facing, wb.state, artReach(wb.char)) : null;
  const layers = {
    aimRad: DIALS.aim && aimable(wb.state) ? pitch : 0,
    reach: solved ? { dx: solved.dx, dy: solved.dy, targetPx: target } : null,
    lookRad: DIALS.lookAt && LOOK_STATES.has(clipNameFor(wb.state)) && wb.aimOn ? pitch : 0,
    flinch: wb.aimOn ? flinchSide(wb.state, CX, wb.target, facing) : 0,
    // Derived from the camera, not a flat 180° — a half-turn under the ¾
    // camera shows the fighter's back, which is not what the game draws
    // (scene.turnaroundYaw, and backend.js does the same).
    turnYawRad: DIALS.turnaround && facing < 0 ? scene.turnaroundYaw() : 0,
    parallaxDeg: wb.parallax,
    // The hand-authored offsets, and the key that keeps the cache honest
    // about them (pose.js / scene.js).
    // Keyframe edits ride in the clip itself; these are the ones a solver
    // would have overwritten, applied after it (pose.js).
    postEdits: editor.postEdits(clipTime(wb.state, wb.t)),
    editKey: editor.editKey(),
  };
  lastLayers = layers;
  const r = bodyFor(wb.char);
  const resolved = resolvedClip();
  // The model, always as the model: the proxy is off for this render even when
  // the rig view is on, because the mannequin now stands beside it.
  if (wb.mannequin) rig.setBoneProxy(wb.char, false);
  const entry = scene.renderPose(wb.char, wb.state, wb.t, r, resolved, layers);
  lastEntry = entry;
  if (entry) {
    blitPose(ctx, entry, wb.char, CX, GROUND_Y, { scale: getActor(wb.char)?.scale, facing, alpha: 0.95 });
  } else {
    ctx.fillStyle = "#d38f8f";
    ctx.fillText("no pose resolved — this state would draw as sprites in-game", CX - 160, GROUND_Y - 100);
  }

  // ...and the rig beside it, drawn from the SAME pose: same clip, same time,
  // same live layers, so anything that disagrees between the two is the
  // skinning rather than the pose. The proxy is toggled around this one render
  // and put back, and `layers.mannequin` keeps the two apart in the pose cache
  // (scene.js) so neither is ever served the other's pixels.
  if (wb.mannequin && mqX !== null) {
    rig.setBoneProxy(wb.char, true);
    const mqEntry = scene.renderPose(wb.char, wb.state, wb.t, r, resolved,
      { ...layers, mannequin: true });
    rig.setBoneProxy(wb.char, false);
    proxied.add(wb.char);
    if (mqEntry) {
      blitPose(ctx, mqEntry, wb.char, mqX, GROUND_Y,
        { scale: getActor(wb.char)?.scale, facing, alpha: 0.95 });
      ctx.fillStyle = "#8b96b3";
      ctx.fillText("rig", mqX - 10, GROUND_Y + 18);
    }
  }

  // Size reference: the height the game draws this fighter at. LABELLED,
  // because an unlabelled bar standing in the scene reads as a mystery post —
  // it was reported as exactly that.
  ctx.strokeStyle = "rgba(159, 211, 159, 0.35)";
  ctx.strokeRect(CX - 130, GROUND_Y - target, 4, target);
  ctx.fillStyle = "rgba(159, 211, 159, 0.55)";
  ctx.fillText("game height", CX - 158, GROUND_Y - target - 6);

  if (wb.aimOn) {
    const canAim = aimable(wb.state) || LOOK_STATES.has(clipNameFor(wb.state));
    ctx.save();
    ctx.strokeStyle = canAim ? "rgba(159, 211, 159, 0.9)" : "rgba(120, 130, 155, 0.5)";
    ctx.lineWidth = 1.5;
    const { x: tx, y: ty } = wb.target;
    ctx.beginPath();
    ctx.arc(tx, ty, 12, 0, Math.PI * 2);
    ctx.moveTo(tx - 20, ty); ctx.lineTo(tx - 6, ty);
    ctx.moveTo(tx + 6, ty); ctx.lineTo(tx + 20, ty);
    ctx.moveTo(tx, ty - 20); ctx.lineTo(tx, ty - 6);
    ctx.moveTo(tx, ty + 6); ctx.lineTo(tx, ty + 20);
    ctx.stroke();
    if (canAim) {
      ctx.setLineDash([4, 6]);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(CX, chestY);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#9fd39f";
      ctx.fillText(`aim ${(pitch * 180 / Math.PI).toFixed(0)}° (max ±${AIM_MAX_DEG}°)`, tx + 24, ty + 4);
    }
    ctx.restore();
  }

  // The skeleton handles go on last, over the figure, and only in edit mode.
  // Posing again here is the price of the pose cache: the render that put the
  // body on screen may have been a cache hit, which never touched the rig.
  if (editor.on && posePreviewNow()) editor.draw(ctx, view.z);

  view.end(ctx);

  hud(now);
  requestAnimationFrame(draw);
}

/** Screen-fixed readouts, outside the zoom transform. */
function hud(now) {
  const st = STATES[clipNameFor(wb.state)];
  if (st.beat !== undefined && !wb.five) {
    ctx.fillStyle = clipTime(wb.state, wb.t) >= st.beat ? "#9fd39f" : "#5a6486";
    ctx.fillText(`beat ${st.beat}s`, 16, 24);
  }
  // The status line is a live readout, so a one-off message (an export) has to
  // be held for long enough to read or the next frame eats it.
  const s = scene.stats;
  $("status").textContent = now < wb.noticeUntil ? wb.notice
    : `renders ${s.renders} · cache ${s.hits}/${s.hits + s.misses} hits · ${DIALS.onTwos ? `${DIALS.sampleHz} Hz on twos` : "on ones"}`;
}

// ------------------------------------------------------------------- wiring

charSel.onchange = async () => {
  wb.char = charSel.value;
  await ensureChar(wb.char);
  const url = new URL(location);
  url.searchParams.set("char", wb.char);
  history.replaceState(null, "", url);
  syncModeLinks();
  if (wb.five) ensureCast();
  // A different fighter is a different pose set — a different SIZE of pose
  // set, even, since half the roster still draws a state through a fallback.
  // Hold the pose being worked on if the new fighter has it, so walking the
  // roster to compare one drawing stays on that drawing.
  if (wb.mannequin) syncBoneProxy();
  fillPoseSelect();
  if (MODE === "pose" && wb.pose) showPose(wb.pose);
  // A different rig is a different skeleton: the joint list is rebuilt from
  // whatever bones this body actually has.
  editor.fillJoints();
  syncSizePanel();
  syncLookPanel();
  applyLook();
  syncPanel();
};
stateSel.onchange = () => {
  wb.state = stateSel.value;
  wb.t = STATES[wb.state]?.beat && wb.snapBeat ? STATES[wb.state].beat : 0;
  const url = new URL(location);
  url.searchParams.set("state", wb.state);
  history.replaceState(null, "", url);
  editor.syncPanel(); // edits are per state — show this one's
  syncPanel();
};
$("playBtn").onclick = () => {
  wb.playing = !wb.playing;
  $("playBtn").textContent = wb.playing ? "⏸ Pause" : "▶ Play";
  mobile?.syncPlay?.();
};
$("scrub").oninput = () => {
  wb.playing = false;
  $("playBtn").textContent = "▶ Play";
  wb.t = parseFloat($("scrub").value) * STATES[clipNameFor(wb.state)].duration;
};
$("compareMode").onchange = () => {
  wb.compare = $("compareMode").value;
  // Zoom grows around what is being looked at: the model alone, or the middle
  // of the pair when the sprite stands beside it.
  view.pivot.x = wb.compare === "left" ? CX - COMPARE_DX / 2 : CX;
};
$("aimToggle").onchange = () => { wb.aimOn = $("aimToggle").checked; };
$("beatToggle").onchange = () => { wb.snapBeat = $("beatToggle").checked; };
// Press order: a bone handle (when editing), then the aim crosshair, then the
// background — so a joint drag never moves the target and never pans the view.
canvas.addEventListener("pointerdown", (ev) => {
  if (view.pinching) { editor.pointerUp(); wb.dragging = false; return; }
  const pt = view.pointer(ev);
  canvas.setPointerCapture(ev.pointerId);
  // Free look owns the drag outright: no handle, no crosshair, no pan. A
  // model viewer in which a stray press edits the pose is not a viewer.
  if (wb.view3d) { wb.orbiting = { x: ev.clientX, y: ev.clientY }; return; }
  // Coarse pointers get a fatter hit ring — a fingertip is not a cursor.
  const slop = ev.pointerType === "touch" ? 2 : 1;
  if (editor.on && posePreviewNow() && editor.pointerDown(pt, view.z / slop)) return;
  if (Math.hypot(pt.x - wb.target.x, pt.y - wb.target.y) < (40 * slop) / view.z) wb.dragging = true;
  else view.startPan(ev);
});
canvas.addEventListener("pointermove", (ev) => {
  if (wb.orbiting) {
    orbitBy(ev.clientX - wb.orbiting.x, ev.clientY - wb.orbiting.y);
    wb.orbiting = { x: ev.clientX, y: ev.clientY };
    return;
  }
  if (view.pinching) { editor.pointerUp(); wb.dragging = false; view.endPan(); return; }
  const pt = view.pointer(ev);
  if (editor.pointerMove(pt)) return;
  if (wb.dragging) wb.target = pt;
  else view.movePan(ev);
});
canvas.addEventListener("pointerup", () => {
  wb.orbiting = null;
  editor.pointerUp();
  wb.dragging = false;
  view.endPan();
});
canvas.addEventListener("pointercancel", () => {
  wb.orbiting = null;
  editor.pointerUp();
  wb.dragging = false;
  view.endPan();
});

// THE POSE BENCH RENDERS AT EXACT TIMES. Same reason as editing (below): a
// drawing is matched at the instant it is on screen, and the on-twos sampler
// would quietly answer with the nearest 13 Hz tick instead — a different pose
// from the one named in the dropdown, in exactly the states that move fastest.
if (MODE === "pose") DIALS.onTwos = false;
scene.setKeyLightAngle(0.55);
// The comparison stands BESIDE by default now, so the zoom has to grow around
// the pair rather than around the model — otherwise the reference walks off
// the side the first time anybody zooms in, which is exactly how the sizing
// pass lost its sprite.
view.pivot.x = wb.compare === "left" ? CX - COMPARE_DX / 2 : CX;
// Close enough to judge a hand. Matching a pose is a comparison of details —
// where the elbow sits, which way the palm faces — and both figures drawn a
// third of the frame tall is a comparison nobody can make. The pair spans
// COMPARE_DX plus two bodies, so this is as far in as it goes before the
// reference starts leaving the frame.
if (MODE === "pose") view.setZoom(1.8);
$("aimToggle").checked = wb.aimOn;
syncModeLinks();
fillPoseSelect();
if (MODE === "pose" && wb.pose) showPose(wb.pose);
syncSizePanel();
syncLookPanel();
applyLook();
syncPanel();

// The phone chrome (mobile.js): a toolbar and a sheet over the same panel.
const mobile = initMobile({
  onOpenPose: () => { if (!editor.on) editor.setEditMode(true); },
  isPlaying: () => wb.playing,
  togglePlay: () => $("playBtn").onclick(),
});
$("playBtn").textContent = "⏸ Pause";
draw();

// Boot finished and everything above is wired. index.html's boot watch reads
// this: if it is still unset well after load, the module died or stalled and
// the page says so instead of presenting dead controls.
window.__workbenchReady = true;
