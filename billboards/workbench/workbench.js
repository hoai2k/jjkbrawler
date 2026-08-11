// The billboard workbench: the posed model over the sprite it replaces, and
// the editor for CLIP INHERITANCE — which character's clip answers each state.
//
// Rendering goes through the game's own pipeline (rig.js -> renderer.js ->
// blit.js), so what this shows is exactly what `?render=billboard` draws —
// the same rule the sprite workbench lives by. The sprite ghost behind the
// model is the fighter's real sprite for the same state at the same animTime,
// drawn through sprites.js at matched scale: the sprite set is the storyboard
// (docs/asset-requests.md), and the comparison is how "matches the sprite"
// gets checked rather than asserted — ghosted underneath, or stood BESIDE the
// model, which is the fairer read for silhouette and proportion.
//
// The panel sits on the right and scrolls independently of the viewer (the
// sprite workbench's shell), and the viewer zooms and pans, so a long panel
// can never push the canvas off screen and a 384 px render can be looked at
// closely.
//
// Every character is loaded with a MANNEQUIN standing in wherever no rig is
// delivered, so the tool is usable from day zero: pick any fighter, see the
// default pose set on the proof body, and wire up inheritance before a single
// .glb exists. The default pose set appears as source "default" — the same
// resolution chain the game runs (see resolveClip in ../src/rig.js).
//
// EDITS ARE IN-MEMORY. The panel edits the loaded manifest object; Export
// writes a payload file for `node tools/billboard_intake.mjs apply`, which is
// the only thing that touches billboards/assets/manifest.json — the same
// arms-length flow the sprite workbench uses for its adjustments.

import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import { STATES, CLIP_STATES, clipNameFor, clipTime, aimable, aimSolve, AIM_MAX_DEG } from "../src/states.js";
import { reaches, reachWeight } from "../src/ik.js";
import { propsOf, chainsOf, CHARACTER_PROPS, CHARACTER_CHAINS } from "../src/props.js";
import * as rig from "../src/rig.js";
import * as renderer from "../src/renderer.js";
import { blitPose } from "../src/blit.js";
import { CHARACTER_KEYS, CHARACTERS, getActor } from "../../src/characters.js";
import { loadCoreAssets, loadFrame } from "../../src/assets.js";
import { drawCharFrame, currentFrame } from "../../sprites/src/sprites.js";
import { headHeightTarget } from "../../src/heights.js";
import { makeViewport } from "./viewport.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");

const GROUND_Y = 560;
const CX = canvas.width / 2;
/** Where the comparison sprite stands when it is drawn BESIDE the model
 *  rather than under it — far enough left that the two silhouettes never
 *  touch at the roster's widest, close enough to read as one picture. */
const COMPARE_DX = 300;

const state = {
  char: new URLSearchParams(location.search).get("char") || CHARACTER_KEYS[0],
  state: new URLSearchParams(location.search).get("state") || "idle",
  t: 0,
  playing: true,
  // How the sprite this state replaces is shown: "overlay" (ghosted under the
  // model, the original), "left" (drawn beside it, unghosted — the honest
  // side-by-side) or "off".
  compare: "overlay",
  snapBeat: true,
  // The aim target: where strikes point. Draggable on the canvas; aimable
  // states pitch toward it exactly as they would toward an opponent in-game.
  aimOn: true,
  ik: true,
  target: { x: CX + 300, y: GROUND_Y - 220 },
  dragging: false,
  dirty: new Set(), // charKeys whose manifest entries were edited
};

// Zoom/pan lives in one transform around the fighter's feet; everything below
// keeps drawing in game pixels (see viewport.js).
const view = makeViewport(canvas, { x: CX, y: GROUND_Y },
  { range: "zoom", out: "zoomOut", in: "zoomIn", reset: "zoomReset", value: "zoomVal" });

// ------------------------------------------------------------------- boot

await loadCoreAssets();
renderer.initRenderer(THREE);
// Mannequins for everyone: delivered rigs win, the rest get the proof body.
await rig.initRigs(THREE, GLTFLoader, ["all"], CHARACTER_KEYS);

const charSel = $("charSelect");
for (const key of CHARACTER_KEYS) {
  const o = document.createElement("option");
  o.value = key;
  o.textContent = CHARACTERS[key]?.name || key;
  charSel.append(o);
}
charSel.value = state.char;

const stateSel = $("stateSelect");
for (const s of CLIP_STATES) {
  const o = document.createElement("option");
  o.value = s;
  o.textContent = s;
  stateSel.append(o);
}
stateSel.value = clipNameFor(state.state);

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

// ------------------------------------------------------------- manifest edit

function entryFor(charKey) {
  const man = rig.rigManifest();
  man.characters = man.characters || {};
  man.characters[charKey] = man.characters[charKey] || {};
  return man.characters[charKey];
}

function syncPanel() {
  const entry = rig.rigManifest().characters?.[state.char] || {};
  const resolved = rig.resolveClip(state.char, state.state);
  $("sourceLine").textContent = resolved
    ? `resolves: ${resolved.source}` : "resolves: NOTHING — state would fall to sprites";
  const r = rig.getRig(state.char);
  $("rigLine").textContent = entry.model
    ? `rig: ${entry.model}${entry.approved ? " (approved)" : " (NOT approved)"}`
    : `rig: none delivered — mannequin standing in (${r ? r.clips.size : 0} own clips)`;
  // What the rig carries beyond the body — and what the roster table says it
  // SHOULD carry, so a delivery missing its weapon is visible here.
  const expectedProps = (CHARACTER_PROPS[state.char] || []).map((pr) => `${pr.bone} (${pr.kind})`);
  const expectedChains = (CHARACTER_CHAINS[state.char] || []).map((c) => `${c.name}×${c.segments}`);
  const actualProps = r ? propsOf(r.root) : [];
  const actualChains = r ? [...chainsOf(r.root).entries()].map(([n, c]) => `${n}×${c}`) : [];
  $("propsLine").textContent =
    `props: ${actualProps.join(", ") || "none"}${expectedProps.length ? `  (expected: ${expectedProps.join(", ")})` : ""}\n` +
    `chains: ${actualChains.join(", ") || "none"}${expectedChains.length ? `  (expected: ${expectedChains.join(", ")})` : ""}`;
  fromSel.value = entry.clips?.[clipNameFor(state.state)]?.from || "";
  inheritSel.value = entry.inheritClips || "default";
  $("approveToggle").checked = !!entry.approved;

  const table = $("stateTable");
  table.innerHTML = "";
  for (const s of CLIP_STATES) {
    const res = rig.resolveClip(state.char, s);
    const name = document.createElement("div");
    name.textContent = s;
    if (s === clipNameFor(state.state)) name.className = "sel";
    const src = document.createElement("div");
    src.textContent = res?.source || "—";
    src.className = res?.source === "own" ? "own" : res?.source === "default" ? "def" : "inh";
    name.onclick = src.onclick = () => { stateSel.value = s; stateSel.onchange(); };
    table.append(name, src);
  }
}

fromSel.onchange = () => {
  const entry = entryFor(state.char);
  const clip = clipNameFor(state.state);
  entry.clips = entry.clips || {};
  if (fromSel.value) entry.clips[clip] = { from: fromSel.value };
  else delete entry.clips[clip];
  state.dirty.add(state.char);
  syncPanel();
};
inheritSel.onchange = () => {
  entryFor(state.char).inheritClips = inheritSel.value;
  state.dirty.add(state.char);
  syncPanel();
};
$("approveToggle").onchange = () => {
  entryFor(state.char).approved = $("approveToggle").checked;
  state.dirty.add(state.char);
  syncPanel();
};

$("exportBtn").onclick = () => {
  const man = rig.rigManifest();
  const payload = {
    kind: "billboard-workbench",
    exported: new Date().toISOString(),
    characters: Object.fromEntries([...state.dirty].map((k) => [k, man.characters[k]])),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "billboard-payload.json";
  a.click();
  $("status").textContent = state.dirty.size
    ? `exported ${state.dirty.size} character(s) — apply with tools/billboard_intake.mjs`
    : "exported an empty payload — nothing has been edited";
};

// ------------------------------------------------------------------ drawing

async function ensureGhostFrame() {
  const frame = currentFrame(state.char, state.state, state.t);
  await loadFrame(state.char, frame).catch(() => {});
  return frame;
}

let lastTick = performance.now();
async function draw() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  const dur = STATES[clipNameFor(state.state)].duration;
  if (state.playing) {
    state.t = (state.t + dt) % (STATES[clipNameFor(state.state)].loop ? dur : dur + 0.4);
    $("scrub").value = String((state.t % dur) / dur);
  }
  $("timeLabel").textContent = `${clipTime(state.state, state.t).toFixed(2)}s`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  view.begin(ctx);
  // Floor line, so foot planting is judged against something.
  ctx.strokeStyle = "#2c3654";
  ctx.beginPath();
  // Wide enough that panning never runs off the end of the floor.
  ctx.moveTo(-2000, GROUND_Y);
  ctx.lineTo(canvas.width + 2000, GROUND_Y);
  ctx.stroke();

  if (state.compare !== "off") {
    const frame = await ensureGhostFrame();
    const beside = state.compare === "left";
    drawCharFrame(ctx, state.char, frame, beside ? CX - COMPARE_DX : CX, GROUND_Y, {
      scale: getActor(state.char)?.scale, alpha: beside ? 1 : 0.35,
    });
    if (beside) {
      ctx.fillStyle = "#8b96b3";
      ctx.fillText("sprite", CX - COMPARE_DX - 20, GROUND_Y + 18);
      ctx.fillText("model", CX - 20, GROUND_Y + 18);
    }
  }

  const target = headHeightTarget(state.char);
  const chestY = GROUND_Y - target * 0.55;
  const aim = state.aimOn && aimable(state.state)
    ? aimSolve(CX, GROUND_Y, chestY, state.target, 1) : null;
  const entry = renderer.renderPose(
    state.char, state.state, state.t, rig.resolveClip, aim, state.ik ? target : 0);
  if (entry) {
    blitPose(ctx, entry, state.char, CX, GROUND_Y, { scale: getActor(state.char)?.scale, alpha: 0.9 });
  } else {
    ctx.fillStyle = "#d38f8f";
    ctx.fillText("no pose resolved — this state would draw as sprites in-game", CX - 160, GROUND_Y - 100);
  }

  // Size reference: the height the game draws this fighter at.
  ctx.strokeStyle = "rgba(159, 211, 159, 0.35)";
  ctx.strokeRect(CX - 130, GROUND_Y - target, 4, target);

  // The aim target: a crosshair strikes pitch toward. Green when this state
  // aims, grey when it does not (locomotion never re-aims).
  if (state.aimOn) {
    const canAim = aimable(state.state);
    ctx.save();
    ctx.strokeStyle = canAim ? "rgba(159, 211, 159, 0.9)" : "rgba(120, 130, 155, 0.5)";
    ctx.lineWidth = 1.5;
    const { x: tx, y: ty } = state.target;
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
      const w = reaches(state.state) ? reachWeight(state.state, clipTime(state.state, state.t)) : 0;
      const lines = [
        `aim ${(aim.pitch * 180 / Math.PI).toFixed(0)}° (max ±${AIM_MAX_DEG}°)`,
        reaches(state.state)
          ? (state.ik ? `IK reach ${(w * 100).toFixed(0)}%` : "IK off — spine lean only")
          : "this state does not reach",
      ];
      lines.forEach((line, i) => ctx.fillText(line, tx + 24, ty + 4 + i * 15));
    }
    ctx.restore();
  }

  view.end(ctx);

  // Screen-fixed HUD, drawn outside the zoom transform: the beat marker is a
  // readout, not part of the scene, and it should not grow with the figure.
  const st = STATES[clipNameFor(state.state)];
  if (st.beat !== undefined) {
    ctx.fillStyle = clipTime(state.state, state.t) >= st.beat ? "#9fd39f" : "#5a6486";
    ctx.fillText(`beat ${st.beat}s`, 16, 24);
  }

  requestAnimationFrame(draw);
}

// ------------------------------------------------------------------- wiring

charSel.onchange = () => {
  state.char = charSel.value;
  const url = new URL(location);
  url.searchParams.set("char", state.char);
  history.replaceState(null, "", url);
  syncPanel();
};
stateSel.onchange = () => {
  state.state = stateSel.value;
  state.t = STATES[state.state]?.beat && state.snapBeat ? STATES[state.state].beat : 0;
  const url = new URL(location);
  url.searchParams.set("state", state.state);
  history.replaceState(null, "", url);
  syncPanel();
};
$("playBtn").onclick = () => {
  state.playing = !state.playing;
  $("playBtn").textContent = state.playing ? "⏸ Pause" : "▶ Play";
};
$("scrub").oninput = () => {
  state.playing = false;
  $("playBtn").textContent = "▶ Play";
  state.t = parseFloat($("scrub").value) * STATES[clipNameFor(state.state)].duration;
};
$("compareMode").onchange = () => {
  state.compare = $("compareMode").value;
  // Zoom grows around what is being looked at: the model alone, or the middle
  // of the pair when the sprite stands beside it.
  view.pivot.x = state.compare === "left" ? CX - COMPARE_DX / 2 : CX;
};
$("aimToggle").onchange = () => { state.aimOn = $("aimToggle").checked; };
$("ikToggle").onchange = () => { state.ik = $("ikToggle").checked; };
canvas.addEventListener("pointerdown", (ev) => {
  const pt = view.pointer(ev);
  canvas.setPointerCapture(ev.pointerId);
  // The crosshair first; the background pans only when nothing claimed it.
  if (Math.hypot(pt.x - state.target.x, pt.y - state.target.y) < 40 / view.z) {
    state.dragging = true;
  } else {
    view.startPan(ev);
  }
});
canvas.addEventListener("pointermove", (ev) => {
  if (state.dragging) state.target = view.pointer(ev);
  else view.movePan(ev);
});
canvas.addEventListener("pointerup", () => { state.dragging = false; view.endPan(); });
canvas.addEventListener("pointercancel", () => { state.dragging = false; view.endPan(); });
$("beatToggle").onchange = () => { state.snapBeat = $("beatToggle").checked; };

syncPanel();
$("playBtn").textContent = "⏸ Pause";
draw();
