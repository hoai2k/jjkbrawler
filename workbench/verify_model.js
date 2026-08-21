// THE TWO SETS THAT NEED THE MODEL — facing, and pose reads.
//
// Both put a rendered 3D model beside the drawing it is supposed to be, and
// ask a question no script can answer.
//
// WHAT FACING ASKS, precisely, because it is easy to answer a different
// question by accident: is the MODEL's body turned the way it should be for
// the game to draw it? Nothing else. Not whether the pose matches, not where
// the character is looking.
//
// `yawOffsetDeg` is a PURELY RENDERING dial. It sets the rig's root rotation
// when the model is posed (pose.js facingYaw) and tells every layer that nods
// — aim, look-at, flinch — which way this fighter's forward points
// (ik.js characterLateral). It says "this .glb was built facing the wrong way
// by this much; turn it back". Nothing reads it to understand a sprite, and
// nothing correlates it with one.
//
// WHICH MEANS THE DRAWING IS A REFERENCE, NOT AN AUTHORITY. It is beside the
// model because it is usually the quickest way to see that a body is turned
// wrong. When the drawing itself is wrong — Momo's sprite has her body facing
// one way and her face the other — matching it would rotate her MODEL wrong
// in game to reproduce a mistake. So the model is judged on its own terms
// there, and "the drawing is wrong" is recorded as a note for the sprite
// bench rather than paid for in yaw. That is what the third button does.
//
// FACING is the sharper of the two, and the project has scars to prove it.
// `tools/check_model_facing.mjs` says so at length: an outline CANNOT tell
// front from back — turn a standing figure through 180° and the silhouette
// scores within 0.118 on average, within 0.012 for Nobara, and for four
// fighters the model facing AWAY scores HIGHER than the model facing the
// camera. An automated sweep that trusted its own margin duly turned Nobara,
// Yuta, Todo, Yuki and Dagon backwards, every one of them by 112°–164°. That
// tool's own conclusion is that front-versus-back is a job for a human beside
// the drawing. This is that job, as a queue.
//
// POSE READS asks the softer version: the model plays a clip built from these
// drawings, so does the pose that comes out read as the pose that went in? A
// wrong answer here is not a bug in the engine but a note for the pose
// library, which is why this set exports a work list rather than a config.
//
// LOADING. The 3D backend is imported DIRECTLY rather than through
// render_backend.js's waist: the waist has one active backend for the whole
// page, and switching it would change what every other task set draws.

import {
  resolvedAnim, currentFrame as spriteFrame, drawCharFrame as spriteDraw,
} from "../sprites/src/sprites.js";
import { CHARACTER_KEYS, byCharacterName } from "../src/characters.js";
import { rigManifest, setRigSettings } from "../render3d/src/loader.js";
import { clearCache, setOrbit } from "../render3d/src/scene.js";
import * as render3d from "../render3d/src/backend.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";
import {
  CROUCH_ORIENT, CROUCH_GROUPS, CROUCH_ORIENT_EDIT, CROUCH_ORIENT_LIMIT,
  crouchGroupOf, clampCrouchOrient,
} from "../render3d/src/crouch_orient.js";
import { GUARD_OPEN_LIMIT } from "../render3d/src/guard_open.js";
import {
  ZOOM, GROUND_Y, artScaleFor, ensureTaskArt, ensureFrames, caption, slider,
  frameStepper, frameIndex,
} from "./verify_common.js";

/** The 3D engine, started once and shared by both sets. Resolves false when
 *  it cannot run at all (no WebGL in this browser), which the sets report
 *  rather than failing — every other set still works. */
let started = null;
function startEngine() {
  if (!started) started = render3d.init().then(() => render3d.modelCount() > 0).catch(() => false);
  return started;
}

const MODEL_X = 300;   // the model's centre line — right half of the canvas
const SPRITE_X = 110;  // the drawing's, left half

async function rigged() {
  await startEngine();
  return CHARACTER_KEYS.filter((k) => render3d.hasModel(k)).sort(byCharacterName);
}

/** A manifest-derived fingerprint: these sets are about the DELIVERED bodies,
 *  so a re-import or a dial change is what should reset their queues. */
function fingerprint() {
  const m = rigManifest?.() || {};
  const chars = m.characters || {};
  const parts = Object.keys(chars).sort()
    .map((k) => `${k}:${chars[k].model}:${chars[k].yawOffsetDeg ?? 0}:${chars[k].renderScale ?? 1}`);
  let n = 0;
  for (const s of parts.join("|")) n = (n * 31 + s.charCodeAt(0)) >>> 0;
  return `model-${n.toString(36)}`;
}

/** Draw the sprite on the left and the model on the right, both facing right,
 *  both at game size × the bench zoom. Whether those two agree IS the
 *  question, so nothing here corrects one toward the other. */
function drawPair(task, { ctx, canvas, redraw, yawDeg = 0, state }) {
  const { charKey } = task;
  ctx.fillStyle = "#0d1018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(130, 150, 205, 0.28)";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y);
  ctx.moveTo(canvas.width / 2, 24); ctx.lineTo(canvas.width / 2, canvas.height - 24);
  ctx.stroke();
  ctx.fillStyle = "#9aa4c0";
  ctx.font = "11px system-ui";
  ctx.fillText("the drawing", SPRITE_X - 32, 34);
  ctx.fillText("the model", MODEL_X - 26, 34);
  const turned = orbitCaption();
  if (turned) {
    ctx.fillStyle = "rgba(255, 190, 90, 0.95)";
    ctx.fillText(turned, 10, canvas.height - 10);
    ctx.fillStyle = "#9aa4c0";
  }

  const scale = artScaleFor(charKey);
  const anim = resolvedAnim(charKey, state);
  const idx = frameIndex(task);
  const t = anim?.fps ? (idx + 0.5) / anim.fps : 0;
  const drew = spriteDraw(ctx, charKey, spriteFrame(charKey, state, t), SPRITE_X, GROUND_Y,
    { scale, facing: 1 });
  if (!drew) {
    ctx.fillStyle = "#9aa4c0";
    ctx.fillText("loading art…", SPRITE_X - 34, GROUND_Y - 60);
  }

  // The model, posed through the backend's own token path so what is on
  // screen is what a match would draw.
  //
  // A proposed facing is applied to the RIG (the same dial the manifest
  // carries) rather than passed as a draw option, because facing is baked
  // into the pose long before the blit — pose.facingYaw reads it. The pose
  // cache does not key on it, so a change has to drop the cache or the old
  // angle keeps being served.
  try {
    applyYaw(charKey, yawDeg);
    const token = render3d.currentFrame(charKey, state, t);
    render3d.drawCharFrame(ctx, charKey, token, MODEL_X, GROUND_Y, { scale, facing: 1 });
  } catch (err) {
    ctx.fillStyle = "#d98a8a";
    ctx.fillText(`model: ${err.message}`, MODEL_X - 60, GROUND_Y - 80);
  }
}

// ------------------------------------------------------------------ orbit
//
// TURN THE SCENE TO SEE WHAT IS WRONG WITH IT.
//
// Every model set here shows the game's own three-quarter, which is the view
// the answer is about — but it is a bad view for diagnosing a body. An arm
// that reads as "long and bent strangely" from the front is a mis-weighted
// shoulder seen edge-on; a weapon that looks upside down could be rolled or
// simply pointing away. Neither is decidable without walking round it.
//
// The camera already knew how (scene.setOrbit, built for the rig bench); this
// wires it to the drag the reviewer's hand is already making, and to a way
// back. RESET IS THE POINT — an orbit is for looking, and every judgement
// these sets record is about the game's view, so the bench must always be one
// click from it.

const orbit = { yawDeg: 0, pitchDeg: 0, dolly: 1 };
const orbited = () => orbit.yawDeg !== 0 || orbit.pitchDeg !== 0 || orbit.dolly !== 1;

function pushOrbit() {
  setOrbit(orbit);
  clearCache();
}

export function resetOrbit() {
  if (!orbited()) return false;
  orbit.yawDeg = 0; orbit.pitchDeg = 0; orbit.dolly = 1;
  pushOrbit();
  return true;
}

/** Drag to turn, wheel to dolly. Returns true when the view moved, so the
 *  caller repaints. Deliberately NOT a decision: the engine's onCanvasDrag
 *  records values, and where the camera is standing is not one. */
let dragFrom = null;
export function orbitDrag(pt, phase) {
  if (phase === "start") { dragFrom = { ...pt, yaw: orbit.yawDeg, pitch: orbit.pitchDeg }; return false; }
  if (!dragFrom) return false;
  orbit.yawDeg = dragFrom.yaw + (pt.x - dragFrom.x) * 0.5;
  orbit.pitchDeg = Math.max(-80, Math.min(80, dragFrom.pitch - (pt.y - dragFrom.y) * 0.4));
  if (phase === "end") dragFrom = null;
  pushOrbit();
  return true;
}

export function orbitZoom(delta) {
  orbit.dolly = Math.max(0.3, Math.min(4, orbit.dolly * (delta < 0 ? 1.1 : 1 / 1.1)));
  pushOrbit();
  return true;
}

/** A line for the canvas, so a turned view can never be mistaken for the
 *  game's. Empty at rest. */
export const orbitCaption = () => (orbited()
  ? `orbited ${Math.round(orbit.yawDeg)}° / ${Math.round(orbit.pitchDeg)}°`
    + `${orbit.dolly !== 1 ? ` · ${orbit.dolly.toFixed(2)}×` : ""} — not the game's view`
  : "");

/** The yaw currently applied to each rig, so the cache is only dropped when
 *  the number actually moves — a clear on every repaint would re-render the
 *  whole queue's worth of poses for nothing. */
const appliedYaw = new Map();

function applyYaw(charKey, deg) {
  const want = Math.round(deg || 0);
  if (appliedYaw.get(charKey) === want) return;
  appliedYaw.set(charKey, want);
  const stored = rigManifest?.()?.characters?.[charKey]?.yawOffsetDeg ?? 0;
  setRigSettings(charKey, { yawOffsetDeg: stored + want });
  clearCache();
}

// ------------------------------------------------------------------ facing

export async function facingProvider() {
  const ok = await startEngine();
  const keys = ok ? await rigged() : [];
  const manifest = rigManifest?.()?.characters || {};
  const tasks = keys.map((charKey) => ({
    id: `facing/${charKey}`,
    title: charKey,
    subtitle: `yawOffsetDeg ${manifest[charKey]?.yawOffsetDeg ?? 0}`,
    charKey,
    state: "idle",
    exportKeys: { char: charKey, kind: "yawOffsetDeg" },
  }));
  return {
    tasks,
    fingerprint: fingerprint(),
    ready: ok,
    ensureReady: ensureTaskArt,
    // Dragging the stage TURNS THE CAMERA here rather than placing anything —
    // these sets have no point to drag, and a body is the one thing you cannot
    // judge from a single angle. Returns undefined so the engine records no
    // decision (verification.js applyValue ignores it) and just repaints.
    onCanvasDrag: (task, pt, { phase }) => { orbitDrag(pt, phase); return undefined; },
    resetOrbit,
    onCanvasWheel: (delta) => orbitZoom(delta),
    // Reviewed facings are recorded in the manifest as `facingCheckedAt`,
    // because an approved-as-stored yaw looks EXACTLY like an unreviewed one
    // — there is no value to diff. Without a record of the review itself the
    // queue would ask for the whole roster again every session.
    committed: (task) => !!manifest[task.charKey]?.facingCheckedAt,
    initialValue: (task) => ({ yaw: manifest[task.charKey]?.yawOffsetDeg ?? 0 }),
    describe: (task, value) =>
      `stored <b>${manifest[task.charKey]?.yawOffsetDeg ?? 0}°</b>`
      + (value.yaw !== (manifest[task.charKey]?.yawOffsetDeg ?? 0)
        ? ` → proposed <b>${value.yaw}°</b>` : "")
      + (value.artWrong ? ` — <b>drawing flagged</b>, model kept as stored` : "")
      + ` — is the model's body turned the way the game should draw it?`,
    renderEditor(task, { container, value, onChange, bindSync }) {
      container.replaceChildren();
      // The editor is not rebuilt between changes, so the buttons below cannot
      // read `value` — it is the value as of the last rebuild. `live` is kept
      // current by the engine's sync, and is what they read instead.
      let live = value;
      const yawSlider = slider(container, {
        label: "yawOffsetDeg", hint: "the manifest's own facing correction",
        min: 0, max: 359, step: 5, value: value.yaw, unit: "°",
      }, (yaw) => onChange({ yaw }));
      bindSync((v) => { live = v; yawSlider.set(v.yaw); });
      const wrap = document.createElement("div");
      wrap.className = "v-nav v-nav--wrap";
      const stored = manifest[task.charKey]?.yawOffsetDeg ?? 0;
      wrap.innerHTML = `<button class="ghost sm" data-turn="180" type="button">Turn 180°</button>`
        + `<button class="ghost sm" data-turn="0" type="button">Back to stored</button>`
        + `<button class="ghost sm" data-art="1" type="button" title="The model is fine; `
        + `the sprite's body is turned wrong. Records a note for the sprite bench and `
        + `leaves yawOffsetDeg alone.">Drawing is wrong</button>`;
      wrap.querySelector('[data-turn="180"]').addEventListener("click",
        () => onChange({ yaw: (live.yaw + 180) % 360 }));
      wrap.querySelector('[data-turn="0"]').addEventListener("click",
        () => onChange({ yaw: stored }));
      // Never emulate a bad drawing: this keeps the model's own yaw and sends
      // the disagreement where it can actually be fixed.
      wrap.querySelector('[data-art="1"]').addEventListener("click",
        () => onChange({ yaw: stored, artWrong: !live.artWrong }));
      container.appendChild(wrap);
    },
    draw(task, ctx) {
      drawPair(task, { ...ctx, state: "idle", yawDeg: ctx.value.yaw - (manifest[task.charKey]?.yawOffsetDeg ?? 0) });
      caption(ctx.ctx, ctx.canvas,
        "judge the BODY, not the face or the pose — is the model turned the same way?");
    },
    exportBlock(decisions) {
      const rows = [];
      const flagged = [];
      const artNotes = [];
      const checked = [];
      for (const d of decisions) {
        if (d.status === "skipped") continue;
        if (d.status === "rejected") {
          flagged.push(`//   ${d.char}: ${d.note || "flagged, no note"}`);
          continue;
        }
        checked.push(`  ${JSON.stringify(d.char)}: ${JSON.stringify((d.at || "").slice(0, 10))},`);
        if (d.value.artWrong) {
          // The model was right and the reference was not. Nothing to change
          // here; the job is in the sprite.
          artNotes.push(`- ${d.char}: sprite body faces the wrong way`
            + (d.note ? ` — ${d.note}` : ""));
          continue;
        }
        if (d.value.yaw === d.measured.yaw) continue;   // confirmed as stored
        rows.push(`  ${JSON.stringify(d.char)}: ${d.value.yaw},`
          + (d.note ? `  // ${d.note}` : ""));
      }
      return {
        file: "render3d/assets/manifest.json",
        note: "set each character's yawOffsetDeg to these, and `facingCheckedAt` "
          + "on every fighter listed under REVIEWED — an approved-as-stored yaw has "
          + "no value to diff, so the review itself is what gets recorded.",
        text: (rows.length ? `// yawOffsetDeg\n${rows.join("\n")}\n` : "// no facing changes\n")
          + (artNotes.length
            ? `\n// Sprite work — the MODEL is right and the drawing is not.\n`
              + `// Nothing to change in the manifest for these:\n`
              + artNotes.map((l) => `//   ${l}`).join("\n") + "\n" : "")
          + (checked.length ? `\n// REVIEWED — facingCheckedAt\n${checked.join("\n")}\n` : "")
          + (flagged.length ? `\n// Flagged:\n${flagged.join("\n")}\n` : ""),
      };
    },
  };
}

// ------------------------------------------------------------- guard hands
//
// THE ONE POSE WHOSE ARMS ARE MEANT TO BE IN FRONT OF THE FACE, and the one
// place a shared table cannot be right for everybody: the guard is authored
// for a 1.75m human, and the same two forearm angles that make a shell on him
// put the fists inside the chin on a bear, a barrel and a machine with
// pauldrons. The libraries carry a roster-wide estimate (guard_open.js); this
// queue is the per-fighter remainder, judged the only way it can be — with the
// fighter on screen.

/** The guard opening currently applied to each rig, so the clip rebuild that
 *  a change costs happens once per change and not once per repaint. */
const appliedGuard = new Map();

function applyGuardOpen(charKey, deg) {
  const want = Math.round(deg || 0);
  if (appliedGuard.get(charKey) === want) return;
  appliedGuard.set(charKey, want);
  setRigSettings(charKey, { guardOpenDeg: want });
  clearCache();
}

export async function guardProvider() {
  const ok = await startEngine();
  const keys = ok ? await rigged() : [];
  const manifest = rigManifest?.()?.characters || {};
  const stored = (charKey) => manifest[charKey]?.guardOpenDeg ?? 0;
  const tasks = keys.map((charKey) => ({
    id: `guard/${charKey}`,
    title: charKey,
    subtitle: `guardOpenDeg ${stored(charKey)}`,
    charKey,
    state: "shield",
    exportKeys: { char: charKey, kind: "guardOpenDeg" },
  }));
  return {
    tasks,
    fingerprint: fingerprint(),
    ready: ok,
    ensureReady: ensureTaskArt,
    // Dragging the stage TURNS THE CAMERA here rather than placing anything —
    // these sets have no point to drag, and a body is the one thing you cannot
    // judge from a single angle. Returns undefined so the engine records no
    // decision (verification.js applyValue ignores it) and just repaints.
    onCanvasDrag: (task, pt, { phase }) => { orbitDrag(pt, phase); return undefined; },
    resetOrbit,
    onCanvasWheel: (delta) => orbitZoom(delta),
    // Same problem the facing set has: a fighter approved at the shared
    // estimate carries no number to diff, so the REVIEW is what gets recorded.
    committed: (task) => !!manifest[task.charKey]?.guardCheckedAt,
    initialValue: (task) => ({ open: stored(task.charKey) }),
    describe: (task, value) =>
      `elbow opening <b>${value.open > 0 ? "+" : ""}${value.open}°</b> on top of the `
      + `roster estimate${value.open !== stored(task.charKey)
        ? ` (stored ${stored(task.charKey)})` : ""} — are the hands IN FRONT of `
      + `the chest and head, rather than through them?`,
    renderEditor(task, { container, value, onChange, bindSync }) {
      container.replaceChildren();
      const s = slider(container, {
        label: "guardOpenDeg", hint: "+ opens the elbows, hands forward; − tightens the shell",
        min: -GUARD_OPEN_LIMIT, max: GUARD_OPEN_LIMIT, step: 2, value: value.open, unit: "°",
      }, (open) => onChange({ open }));
      bindSync((v) => s.set(v.open));
      frameStepper(container, task, () => {});
      const wrap = document.createElement("div");
      wrap.className = "v-nav v-nav--wrap";
      wrap.innerHTML = `<button class="ghost sm" data-open="0" type="button">Back to the estimate</button>`
        + `<button class="ghost sm" data-open="8" type="button">+8° more room</button>`;
      for (const btn of wrap.querySelectorAll("[data-open]")) {
        btn.addEventListener("click", () => onChange({ open: Number(btn.dataset.open) }));
      }
      container.appendChild(wrap);
      const p = document.createElement("p");
      p.className = "legend";
      p.textContent = "Judge the HANDS, not the stance: the fists should sit ahead of the "
        + "chest with daylight between them and the face. The legs, the lean and the "
        + "shoulders are the guard pose's own business and this dial does not touch them.";
      container.appendChild(p);
    },
    draw(task, ctx) {
      applyGuardOpen(task.charKey, ctx.value.open);
      drawPair(task, { ...ctx, state: task.state });
      caption(ctx.ctx, ctx.canvas,
        `${task.charKey}'s guard — hands in front of the chest, or through it?`);
    },
    exportBlock(decisions) {
      const rows = [];
      const checked = [];
      const flagged = [];
      for (const d of decisions) {
        if (d.status === "skipped") continue;
        if (d.status === "rejected") {
          flagged.push(`//   ${d.char}: ${d.note || "flagged, no note"}`);
          continue;
        }
        checked.push(`  ${JSON.stringify(d.char)}: ${JSON.stringify((d.at || "").slice(0, 10))},`);
        if (d.value.open === d.measured.open) continue;   // approved as stored
        rows.push(`  ${JSON.stringify(d.char)}: ${d.value.open},`
          + (d.note ? `  // ${d.note}` : ""));
      }
      return {
        file: "render3d/assets/manifest.json",
        note: "set each character's guardOpenDeg to these (0 means the shared estimate "
          + "and wants no key at all), and `guardCheckedAt` on everyone under REVIEWED.",
        text: (rows.length ? `// guardOpenDeg\n${rows.join("\n")}\n` : "// no guard changes\n")
          + (checked.length ? `\n// REVIEWED — guardCheckedAt\n${checked.join("\n")}\n` : "")
          + (flagged.length ? `\n// Flagged:\n${flagged.join("\n")}\n` : ""),
      };
    },
  };
}

// ------------------------------------------------------- crouch orientation
//
// THE ONE ITEM PER GROUP SET. Every other queue here asks about a fighter;
// this one asks about a ROTATION that a whole group of fighters shares, which
// is the shape of the fault: `pose.js levelFeet` tilts the crouch until the
// trailing foot comes down, the tilt it lands on is nobody's choice, and it is
// the same wrong tilt on everyone because it is one solve against one pose.
// Twenty-seven identical decisions would be twenty-seven chances to answer it
// differently.
//
// So a task is a group, and the check that it really is one group is BUILT
// INTO THE ITEM: the member stepper walks every fighter the decision would
// apply to, with the proposed orientation live on each. Approving is then a
// claim about all of them rather than about whichever one happened to be on
// screen.

/** Which member of a group is on screen, per task. A VIEW, like the frame
 *  stepper's index: never part of a value, never exported. */
const MEMBER_VIEW = new Map();

const membersOf = (group, keys) => keys.filter((k) => crouchGroupOf(k) === group);

function memberIndex(task) {
  return MEMBER_VIEW.get(task.id) || 0;
}

function memberOf(task) {
  return task.members[memberIndex(task) % task.members.length];
}

/** Put a group's proposed orientation on the engine. The pose cache does not
 *  key on it, so the cache goes with it. */
function applyOrient(group, value) {
  const groups = { ...(CROUCH_ORIENT_EDIT.groups || {}) };
  groups[group] = value;
  CROUCH_ORIENT_EDIT.groups = groups;
  clearCache();
}

// THE HANDLE. A trackball, drawn over the fighter's hips and dragged: across
// turns the body about the vertical, up and down tips it over its toes, and
// the rim rolls it. Three axes on one control because the three are one
// question — which way is this body pointing — and a reviewer answering it
// with three sliders is reading numbers instead of looking at a fighter.
const HANDLE = { x: 300, y: 250, r: 74 };
const RIM = 0.72;   // inside this fraction of the radius is turn/tip; outside rolls

/** Where the pointer went, as an orientation. */
function dragToOrient(pt, value, grab) {
  const dx = pt.x - grab.x;
  const dy = pt.y - grab.y;
  if (grab.roll) {
    // Roll follows the ANGLE about the handle's centre, so the knob stays
    // under the pointer all the way round rather than sliding off it.
    const a0 = Math.atan2(grab.y - HANDLE.y, grab.x - HANDLE.x);
    const a1 = Math.atan2(pt.y - HANDLE.y, pt.x - HANDLE.x);
    let d = ((a1 - a0) * 180) / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return { rollDeg: clampOrient(grab.rollDeg + d) };
  }
  // A degree per pixel-and-a-bit, which puts the whole useful range inside the
  // handle: a drag across it is ±60°, and that is the limit anyway.
  return {
    yawDeg: clampOrient(grab.yawDeg + dx * 0.8),
    pitchDeg: clampOrient(grab.pitchDeg - dy * 0.8),
  };
}

const clampOrient = (v) => Math.round(Math.max(-CROUCH_ORIENT_LIMIT,
  Math.min(CROUCH_ORIENT_LIMIT, v)));

let orientGrab = null;

function onOrientDrag(task, pt, { value, phase }) {
  if (phase === "start") {
    const d = Math.hypot(pt.x - HANDLE.x, pt.y - HANDLE.y);
    orientGrab = d > HANDLE.r * 1.25 ? null
      : { ...pt, ...value, roll: d > HANDLE.r * RIM };
    return undefined;
  }
  if (!orientGrab) return undefined;
  const next = dragToOrient(pt, value, orientGrab);
  if (phase === "end") orientGrab = null;
  return next;
}

/** The trackball itself, and what it is currently saying. */
function drawHandle(ctx, value) {
  const { x, y, r } = HANDLE;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 240, 255, 0.55)";
  ctx.fillStyle = "rgba(120, 240, 255, 0.06)";
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // The roll rim.
  ctx.strokeStyle = "rgba(120, 240, 255, 0.28)";
  ctx.beginPath(); ctx.arc(x, y, r * RIM, 0, Math.PI * 2); ctx.stroke();
  // The two in-ball axes, drawn where the current value has pushed them, so
  // the handle reads as a body attitude rather than as a dial.
  const kx = x + (value.yawDeg / CROUCH_ORIENT_LIMIT) * r * RIM;
  const ky = y - (value.pitchDeg / CROUCH_ORIENT_LIMIT) * r * RIM;
  ctx.strokeStyle = "rgba(120, 240, 255, 0.35)";
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(x - r * RIM, y); ctx.lineTo(x + r * RIM, y);
  ctx.moveTo(x, y - r * RIM); ctx.lineTo(x, y + r * RIM);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(120, 240, 255, 0.95)";
  ctx.beginPath(); ctx.arc(kx, ky, 6, 0, Math.PI * 2); ctx.fill();
  // The roll knob, out on the rim.
  const ra = (value.rollDeg * Math.PI) / 180 - Math.PI / 2;
  ctx.beginPath();
  ctx.arc(x + Math.cos(ra) * r, y + Math.sin(ra) * r, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9aa4c0";
  ctx.font = "11px system-ui";
  ctx.fillText("drag: across turns · up/down tips · the rim rolls", x - r, y + r + 18);
  ctx.restore();
}

export async function crouchProvider() {
  const ok = await startEngine();
  const keys = ok ? await rigged() : [];
  const groups = Object.keys(CROUCH_GROUPS)
    .map((group) => ({ group, members: membersOf(group, keys) }))
    .filter((g) => g.members.length);
  const tasks = groups.map(({ group, members }) => ({
    id: `crouch/${group}`,
    title: CROUCH_GROUPS[group].label,
    subtitle: `${members.length} fighter(s) — ${CROUCH_GROUPS[group].why}`,
    group,
    members,
    // `charKey` is what the framework preloads art for; it follows the member
    // on screen, which is why renderEditor re-reads it on every step.
    get charKey() { return memberOf(this); },
    state: "crouch",
    exportKeys: { group, members },
  }));
  return {
    tasks,
    fingerprint: fingerprint(),
    ready: ok,
    ensureReady: (task) => ensureFrames(memberOf(task)),
    // THE TABLE, never the live edit. This is what "reset" goes back to and
    // what the export diffs against, so a value the bench itself is currently
    // driving would make both of them mean nothing.
    initialValue: (task) => clampCrouchOrient(CROUCH_ORIENT[task.group]),
    describe: (task, value) =>
      `<b>${CROUCH_GROUPS[task.group].label}</b> — pitch <b>${value.pitchDeg}°</b>, `
      + `roll <b>${value.rollDeg}°</b>, yaw <b>${value.yawDeg}°</b> on top of what the `
      + `foot-levelling solve leaves. Showing <b>${memberOf(task)}</b> `
      + `(${memberIndex(task) % task.members.length + 1} of ${task.members.length})`,
    renderEditor(task, { container, value, onChange, redraw, bindSync }) {
      container.replaceChildren();
      const members = document.createElement("div");
      members.className = "group";
      const i = memberIndex(task) % task.members.length;
      members.innerHTML = `
        <label>Who this applies to <span class="sub">${i + 1} of ${task.members.length}
          — ${memberOf(task)}</span></label>
        <div class="v-nav v-nav--wrap">
          <button class="ghost sm" data-member="-1" type="button">‹ prev fighter</button>
          <button class="ghost sm" data-member="1" type="button">next fighter ›</button>
          <button class="ghost sm" data-member="0" type="button">first</button>
        </div>
        <p class="legend">${task.members.join(", ")}</p>`;
      for (const btn of members.querySelectorAll("[data-member]")) {
        btn.addEventListener("click", () => {
          const step = Number(btn.dataset.member);
          const n = task.members.length;
          MEMBER_VIEW.set(task.id, step === 0 ? 0 : (memberIndex(task) + step + n) % n);
          // A different body, so a different sprite to load and a rebuilt
          // editor — the same door the frame stepper uses.
          ensureFrames(memberOf(task)).then(() => redraw());
          redraw();
        });
      }
      container.appendChild(members);
      const pitch = slider(container, {
        label: "Pitch", hint: "+ tips the body forward over its toes",
        min: -CROUCH_ORIENT_LIMIT, max: CROUCH_ORIENT_LIMIT, step: 1,
        value: value.pitchDeg, unit: "°",
      }, (pitchDeg) => onChange({ pitchDeg }));
      const roll = slider(container, {
        label: "Roll", hint: "+ tips it toward the fighter's own right",
        min: -CROUCH_ORIENT_LIMIT, max: CROUCH_ORIENT_LIMIT, step: 1,
        value: value.rollDeg, unit: "°",
      }, (rollDeg) => onChange({ rollDeg }));
      const yaw = slider(container, {
        label: "Yaw", hint: "+ turns the body toward its own left",
        min: -CROUCH_ORIENT_LIMIT, max: CROUCH_ORIENT_LIMIT, step: 1,
        value: value.yawDeg, unit: "°",
      }, (yawDeg) => onChange({ yawDeg }));
      bindSync((v) => { pitch.set(v.pitchDeg); roll.set(v.rollDeg); yaw.set(v.yawDeg); });
      const p = document.createElement("p");
      p.className = "legend";
      p.innerHTML = "<b>Step through every fighter before approving.</b> One decision here "
        + "moves all of them, so the question is not whether this attitude suits the one on "
        + "screen — it is whether it suits the whole list above. A body that only works for "
        + "one of them is a fighter who needs their own group, which is a note rather than "
        + "a nudge: flag it and say who.";
      container.appendChild(p);
    },
    onCanvasDrag: onOrientDrag,
    draw(task, ctx) {
      applyOrient(task.group, ctx.value);
      const member = memberOf(task);
      drawPair({ ...task, charKey: member }, { ...ctx, state: "crouch" });
      drawHandle(ctx.ctx, ctx.value);
      caption(ctx.ctx, ctx.canvas,
        `${member} · crouch — ${CROUCH_GROUPS[task.group].label}`);
    },
    exportBlock(decisions) {
      const rows = [];
      const flagged = [];
      for (const d of decisions) {
        if (d.status === "skipped") continue;
        if (d.status === "rejected") {
          flagged.push(`//   ${d.group}: ${d.note || "flagged, no note"}`);
          continue;
        }
        const v = d.value;
        rows.push(`  ${JSON.stringify(d.group)}: `
          + `{ pitchDeg: ${v.pitchDeg}, rollDeg: ${v.rollDeg}, yawDeg: ${v.yawDeg} },`
          + (d.note ? `  // ${d.note}` : ""));
      }
      return {
        file: "render3d/src/crouch_orient.js",
        note: "CROUCH_ORIENT — one attitude per crouch group, applied after the "
          + "foot-levelling solve. A group whose members disagreed wants splitting, "
          + "which is a code change here rather than a number.",
        text: (rows.length ? `export const CROUCH_ORIENT = {\n${rows.join("\n")}\n};\n`
          : "// no crouch changes\n")
          + (flagged.length ? `\n// Flagged:\n${flagged.join("\n")}\n` : ""),
      };
    },
  };
}

// -------------------------------------------------------------- pose reads

/** The states worth reading: the ones a player looks at longest, and the ones
 *  built from a sheet rather than hand-authored. */
const READ_STATES = ["idle", "walk", "run", "crouch", "shield", "light", "sideHeavy", "hurt", "win"];

export async function poseProvider() {
  const ok = await startEngine();
  const keys = ok ? await rigged() : [];
  const tasks = [];
  for (const charKey of keys) {
    for (const state of READ_STATES) {
      if (!resolvedAnim(charKey, state)?.frames?.length) continue;
      tasks.push({
        id: `read/${charKey}/${state}`,
        title: `${charKey} · ${state}`,
        subtitle: "does the model read as the drawing?",
        charKey,
        state,
        exportKeys: { char: charKey, state },
      });
    }
  }
  return {
    tasks,
    fingerprint: fingerprint(),
    ready: ok,
    ensureReady: ensureTaskArt,
    // Dragging the stage TURNS THE CAMERA here rather than placing anything —
    // these sets have no point to drag, and a body is the one thing you cannot
    // judge from a single angle. Returns undefined so the engine records no
    // decision (verification.js applyValue ignores it) and just repaints.
    onCanvasDrag: (task, pt, { phase }) => { orbitDrag(pt, phase); return undefined; },
    resetOrbit,
    onCanvasWheel: (delta) => orbitZoom(delta),
    // Nothing to edit: this set's answer is a verdict, and its value carries
    // the reviewer's reading of WHY rather than a number to apply.
    initialValue: () => ({ reads: true }),
    describe: (task) =>
      `${task.charKey}'s <b>${task.state}</b> — approve if the model reads as the drawing, `
      + `flag it if it does not and say what is off`,
    renderEditor(task, { container, redraw }) {
      container.replaceChildren();
      frameStepper(container, task, redraw);
      const p = document.createElement("p");
      p.className = "legend";
      p.textContent = "Nothing to drag here. Approve when the two bodies say the same "
        + "thing, flag when they do not — the note becomes the pose library's work list.";
      container.appendChild(p);
    },
    draw(task, ctx) {
      drawPair(task, { ...ctx, state: task.state });
      const beat = STATES[clipNameFor(task.state)]?.beat;
      caption(ctx.ctx, ctx.canvas, beat !== undefined
        ? `${task.state} at its contact beat` : `${task.state}`);
    },
    exportBlock(decisions) {
      const lines = decisions
        .filter((d) => d.status === "rejected")
        .map((d) => `- ${d.char} · ${d.state}: ${d.note || "flagged, no note"}`);
      const okd = decisions.filter((d) => d.status === "approved" || d.status === "edited").length;
      return {
        file: "(a work list — no config)",
        note: "poses whose model does not read as its drawing; these want pose-library work",
        text: lines.length
          ? `# Pose reads that need work\n\n${lines.join("\n")}\n\n(${okd} read correctly)\n`
          : `# Pose reads\n\nAll ${okd} reviewed poses read correctly.\n`,
      };
    },
  };
}
