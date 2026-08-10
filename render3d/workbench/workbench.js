// The 3D workbench: live clips through the game's own anime pipeline
// (loader -> pose -> scene -> blit), over the sprite each state replaces —
// plus the LOOK-DEV PANEL this backend needs and billboards did not:
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
import { STATES, CLIP_STATES, clipNameFor, clipTime, aimable, aimPitch, AIM_MAX_DEG } from "../../billboards/src/states.js";
import * as rig from "../src/loader.js";
import * as scene from "../src/scene.js";
import { DIALS, initPose, LOOK_STATES, flinchSide } from "../src/pose.js";
import { TOON, setToonDefaults } from "../src/toon.js";
import { OUTLINE, setOutline } from "../src/outline.js";
import { blitPose } from "../src/blit.js";
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

const wb = {
  char: new URLSearchParams(location.search).get("char") || CHARACTER_KEYS[0],
  state: new URLSearchParams(location.search).get("state") || "idle",
  t: 0,
  playing: true,
  ghost: true,
  snapBeat: true,
  aimOn: true,
  faceLeft: false,
  sweep: false,
  sweepT: 0,
  parallax: 0,
  target: { x: CX + 300, y: GROUND_Y - 220 },
  dragging: false,
  dirty: new Set(),
};

// ------------------------------------------------------------------- boot

await loadCoreAssets();
initPose(THREE);
scene.initScene(THREE);
await rig.initRigs(THREE, GLTFLoader, ["all"], CHARACTER_KEYS);

const charSel = $("charSelect");
for (const key of CHARACTER_KEYS) {
  const o = document.createElement("option");
  o.value = key;
  o.textContent = CHARACTERS[key]?.name || key;
  charSel.append(o);
}
charSel.value = wb.char;

const stateSel = $("stateSelect");
for (const s of CLIP_STATES) {
  const o = document.createElement("option");
  o.value = s;
  o.textContent = s;
  stateSel.append(o);
}
stateSel.value = clipNameFor(wb.state);

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
const dials = [
  ["thr", "thrVal", () => TOON.shadeThreshold, (v) => setToonDefaults({ shadeThreshold: v })],
  ["tint", "tintVal", () => 0, (v) => setToonDefaults({ shadeTint: coolWarm(v) })],
  ["rim", "rimVal", () => TOON.rimStrength, (v) => setToonDefaults({ rimStrength: v })],
  ["outline", "outVal", () => OUTLINE.px, (v) => setOutline({ px: v })],
  ["hz", "hzVal", () => DIALS.sampleHz, (v) => { DIALS.sampleHz = v; }],
  ["par", "parVal", () => wb.parallax, (v) => { wb.parallax = v; }],
];
for (const [id, valId, get, set] of dials) {
  $(id).value = String(get());
  $(valId).textContent = String(get());
  $(id).oninput = () => {
    const v = parseFloat($(id).value);
    $(valId).textContent = String(v);
    set(v);
    scene.clearCache(); // dials change pixels without changing tokens
  };
}
$("sweepToggle").onchange = () => { wb.sweep = $("sweepToggle").checked; if (!wb.sweep) { scene.setKeyLightAngle(0.55); scene.clearCache(); } };
$("ikToggle").onchange = () => { DIALS.footIK = $("ikToggle").checked; scene.clearCache(); };
$("twosToggle").onchange = () => { DIALS.onTwos = $("twosToggle").checked; scene.clearCache(); };
$("turnToggle").onchange = () => { wb.faceLeft = $("turnToggle").checked; };
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
    // The current look-dev dials ride along as a note; applying them to
    // TOON's defaults is a hand edit of render3d/src/toon.js, on purpose —
    // the global look is a code decision, per-character looks go in `toon`
    // blocks on the entries below.
    toonDials: { shadeThreshold: TOON.shadeThreshold, shadeTint: TOON.shadeTint,
      rimStrength: TOON.rimStrength, outlinePx: OUTLINE.px, sampleHz: DIALS.sampleHz },
    characters: Object.fromEntries([...wb.dirty].map((k) => [k, man.characters[k]])),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "render3d-payload.json";
  a.click();
  $("status").textContent = wb.dirty.size
    ? `exported ${wb.dirty.size} character(s) — apply with tools/billboard_intake.mjs --backend 3d`
    : "exported an empty payload — nothing has been edited";
};

// ------------------------------------------------------------------ drawing

async function ensureGhostFrame() {
  const frame = currentFrame(wb.char, wb.state, wb.t);
  await loadFrame(wb.char, frame).catch(() => {});
  return frame;
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

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#2c3654";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();

  const st = STATES[clipNameFor(wb.state)];
  if (st.beat !== undefined) {
    ctx.fillStyle = clipTime(wb.state, wb.t) >= st.beat ? "#9fd39f" : "#5a6486";
    ctx.fillText(`beat ${st.beat}s`, 16, 24);
  }

  if (wb.ghost) {
    const frame = await ensureGhostFrame();
    drawCharFrame(ctx, wb.char, frame, CX, GROUND_Y, {
      scale: getActor(wb.char)?.scale, alpha: 0.35, facing: wb.faceLeft ? -1 : 1,
    });
  }

  const facing = wb.faceLeft ? -1 : 1;
  const target = headHeightTarget(wb.char);
  const chestY = GROUND_Y - target * 0.55;
  const pitch = wb.aimOn ? aimPitch(CX, chestY, wb.target, facing) : 0;
  const layers = {
    aimRad: DIALS.aim && aimable(wb.state) ? pitch : 0,
    lookRad: DIALS.lookAt && LOOK_STATES.has(clipNameFor(wb.state)) && wb.aimOn ? pitch : 0,
    flinch: wb.aimOn ? flinchSide(wb.state, CX, wb.target, facing) : 0,
    turnYawRad: DIALS.turnaround && facing < 0 ? Math.PI : 0,
    parallaxDeg: wb.parallax,
  };
  const r = rig.getRig(wb.char);
  const resolved = rig.resolveClip(wb.char, wb.state);
  const entry = scene.renderPose(wb.char, wb.state, wb.t, r, resolved, layers);
  if (entry) {
    blitPose(ctx, entry, wb.char, CX, GROUND_Y, { scale: getActor(wb.char)?.scale, facing, alpha: 0.95 });
  } else {
    ctx.fillStyle = "#d38f8f";
    ctx.fillText("no pose resolved — this state would draw as sprites in-game", CX - 160, GROUND_Y - 100);
  }

  // Size reference: the height the game draws this fighter at.
  ctx.strokeStyle = "rgba(159, 211, 159, 0.35)";
  ctx.strokeRect(CX - 130, GROUND_Y - target, 4, target);

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

  const s = scene.stats;
  $("status").textContent =
    `renders ${s.renders} · cache ${s.hits}/${s.hits + s.misses} hits · ${DIALS.onTwos ? `${DIALS.sampleHz} Hz on twos` : "on ones"}`;

  requestAnimationFrame(draw);
}

// ------------------------------------------------------------------- wiring

charSel.onchange = () => {
  wb.char = charSel.value;
  const url = new URL(location);
  url.searchParams.set("char", wb.char);
  history.replaceState(null, "", url);
  syncPanel();
};
stateSel.onchange = () => {
  wb.state = stateSel.value;
  wb.t = STATES[wb.state]?.beat && wb.snapBeat ? STATES[wb.state].beat : 0;
  const url = new URL(location);
  url.searchParams.set("state", wb.state);
  history.replaceState(null, "", url);
  syncPanel();
};
$("playBtn").onclick = () => {
  wb.playing = !wb.playing;
  $("playBtn").textContent = wb.playing ? "⏸ Pause" : "▶ Play";
};
$("scrub").oninput = () => {
  wb.playing = false;
  $("playBtn").textContent = "▶ Play";
  wb.t = parseFloat($("scrub").value) * STATES[clipNameFor(wb.state)].duration;
};
$("ghostToggle").onchange = () => { wb.ghost = $("ghostToggle").checked; };
$("aimToggle").onchange = () => { wb.aimOn = $("aimToggle").checked; };
$("beatToggle").onchange = () => { wb.snapBeat = $("beatToggle").checked; };
function canvasPoint(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * canvas.width,
           y: ((ev.clientY - r.top) / r.height) * canvas.height };
}
canvas.addEventListener("pointerdown", (ev) => {
  const pt = canvasPoint(ev);
  if (Math.hypot(pt.x - wb.target.x, pt.y - wb.target.y) < 40) {
    wb.dragging = true;
    canvas.setPointerCapture(ev.pointerId);
  }
});
canvas.addEventListener("pointermove", (ev) => {
  if (wb.dragging) wb.target = canvasPoint(ev);
});
canvas.addEventListener("pointerup", () => { wb.dragging = false; });

scene.setKeyLightAngle(0.55);
syncPanel();
$("playBtn").textContent = "⏸ Pause";
draw();
