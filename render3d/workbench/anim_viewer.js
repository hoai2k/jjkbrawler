// THE 3D ANIMATION VIEWER (`?edit=animation`): the roster performing, eight
// at a time.
//
// The pose bench answers "does this model match that drawing?" and the
// keyframe bench (`?edit=keys`) answers "is this clip right?" — both one
// fighter at a time. This page answers the question neither can: "does this
// animation read as ONE move across the roster?" A run that bobs on Gojo and
// floats on Dagon, a light that snaps on Maki and mushes on Panda — those are
// invisible one at a time and obvious when eight bodies throw the same move
// on the same beat.
//
// So: a GRID of fighters (1, 2, 4 or 8 per screen, ◀ ▶ pages through the
// rest), every one of them playing the SAME state at the SAME clock, drawn
// through the game's own pipeline (loader -> resolveClip -> pose -> scene ->
// blit) with the engine's own dials — what you see is what `?render=3d`
// draws. Only fighters the game actually shows are listed: a body held back
// by `inGame: false` (loader.js) is not part of "does the roster read as one
// set", so it is not in the line-up.
//
// ...AND THE OTHER TWO BACKENDS. The Render dropdown draws the same grid,
// the same clock and the same state through any of the game's three
// renderers (src/render_backend.js registers exactly these):
//
//   3D          render3d — clips play live, toon-ramped and ink-outlined
//   Billboards  the 2.5D card: one quantised pose rendered and blitted flat
//   Sprites     the hand-drawn sheets the other two are matched against
//
// Each is driven through the module the game's own backend calls, not a
// reimplementation of it: render3d's scene+blit, billboards' renderer+blit,
// sprites' drawCharFrame. They all share ONE rig registry (loader.js), so
// switching costs nothing already paid for, and a fighter still streams in
// once rather than once per backend. That is what makes the dropdown worth
// having: "does the 3D run read like the sprite run?" is the question the
// whole 3D effort turns on, and it can only be answered by flipping between
// them on one screen with one clock.
//
// TRIGGERING. Three ways in, deliberately game-shaped:
//   * the ANIMATION GRID under the viewer — every state the engine can play,
//     clicked with the mouse. Loops pin until replaced; one-shots play and
//     fall back to whatever was held.
//   * an XBOX CONTROLLER, read through the game's own control map
//     (src/config_controls.js), so the button that jabs in a match jabs
//     here: stick walks and runs (flick = dash), A jumps (jump → fall →
//     land), X lights, Y heavies (hold = charge, stick aims the heavy),
//     B specials, RB ult, LT shields (+stick = dodge roll), RT grabs,
//     d-pad throws, right stick tilts. Moving left plays the real
//     turnaround — the rig yawed, never mirrored.
//   * VIEW 3D — the same free look the other benches have: drag to orbit,
//     wheel to dolly, off snaps back to the exact camera the game renders.
//
// The PARAMETER panel is the engine dials (pose.js DIALS) plus viewer-side
// playback dials — sample rate, on-twos, speed, motion blur — all in-memory
// and roster-wide: this page is for trying animation FEEL, not for editing
// any one fighter, so nothing here writes the manifest and there is no
// export.

import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import { STATES, clipNameFor, clipTime, aimSolve } from "../src/states.js";
import * as rig from "../src/loader.js";
import * as scene from "../src/scene.js";
import { DIALS, initPose } from "../src/pose.js";
import { blitPose } from "../src/blit.js";
import * as bbRenderer from "../../billboards/src/renderer.js";
import { blitPose as bbBlitPose } from "../../billboards/src/blit.js";
import { drawCharFrame as spriteDraw, currentFrame as spriteFrame }
  from "../../sprites/src/sprites.js";
import { makeOrbit } from "./orbit.js";
import { CHARACTER_KEYS, CHARACTERS, getActor } from "../../src/characters.js";
import { STAGES } from "../../src/stages.js";
import { state as gameState } from "../../src/state.js";
import { loadCoreAssets, loadFrame } from "../../src/assets.js";
import { headHeightTarget } from "../../src/heights.js";
import { artReach } from "../../src/silhouette.js";
import { lightMove, heavyMove, strikeArcs } from "../../src/moves.js";
import { PAD_BUTTONS, PAD_AXES, padLabelsFor } from "../../src/config_controls.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- the page
//
// Same move sprite_pose.js makes: keep the header bar, replace the layout.
// The pose/keyframe markup in index.html is a different tool's cockpit, and
// loading a grid viewer into it would mean a page of dead controls.

document.title = "3D Animation Viewer — JJK Brawler II";
document.body.classList.add("mode-viewer");
$("wbTitle").textContent = "3D Animation Viewer";
// The bar's pose/keyframe-only chrome goes; this page's own links go in.
document.querySelectorAll(".bar .pose-only, .bar .anim-only, #facingReviewTop")
  .forEach((el) => el.remove());
{
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "The roster performing, eight at a time — every fighter "
    + "the game shows, playing the same clip on the same beat, through any of "
    + "the game's three renderers.";
  const back = document.createElement("a");
  back.className = "ghost sm";
  back.href = "?";
  back.textContent = "← Poses";
  const keys = document.createElement("a");
  keys.className = "ghost sm";
  keys.href = "?edit=keys";
  keys.textContent = "Keyframes →";
  const bar = document.querySelector(".bar");
  bar.insertBefore(hint, bar.children[1] || null);
  bar.insertBefore(back, hint.nextSibling);
  bar.insertBefore(keys, back.nextSibling);
}
// The other benches' furniture that lives OUTSIDE main.layout.
$("facingOverlay")?.remove();
$("mobileBar")?.remove();

/** How each action is written in the legend: the game's own button names. */
const pad1 = (id) => padLabelsFor(id)[0] || "?";

document.querySelector("main.layout").outerHTML = `
  <main class="layout viewer">
    <section class="stage-col">
      <div id="stageWrap">
        <canvas id="stage" width="1280" height="800"></canvas>
        <label class="check stage-toggle" id="view3dBox"
               title="Drag to turn the models, scroll to move in — off returns to the game's own camera">
          <input id="view3d" type="checkbox"> View 3D
        </label>
      </div>
      <div class="row vnav">
        <button id="pagePrev" class="ghost" title="Previous page (←)">◀</button>
        <span id="pageLabel" class="mono"></span>
        <button id="pageNext" class="ghost" title="Next page (→)">▶</button>
        <label class="inline">Per screen
          <select id="perScreen">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="4">4</option>
            <option value="8" selected>8</option>
          </select>
        </label>
        <span id="nowPlaying" class="mono"></span>
        <span id="padStatus" class="hint"></span>
      </div>
      <div id="status" class="mono"></div>
      <h3 class="gridhead">Animations — click one to trigger it on everyone</h3>
      <div id="animGrid"></div>
      <p class="hint">${pad1("jump")} jump · ${pad1("light")} light (crouching
      = crouch poke, airborne = air light, running = dash attack) ·
      ${pad1("heavy")} heavy — hold to charge, stick up/down for the up/down
      heavy · ${pad1("special")} special (stick picks neutral/side/down) ·
      ${pad1("ult")} ultimate · ${pad1("shield")} shield, +stick = dodge roll
      · ${pad1("grab")} grab · D-pad throws · right stick tilts · left stick
      walks, runs, crouches — flick it to dash, move left for the real
      turnaround · ${pad1("pause")} pause. Domain Expansion has no animation
      state, so ${pad1("domain")} does nothing here.</p>
    </section>

    <aside class="panel">
      <h3>Render</h3>
      <label>Backend
        <select id="renderSelect">
          <option value="3d" selected>3D — anime-rendered models</option>
          <option value="billboard">Billboards — 2.5D cards</option>
          <option value="sprite">Sprites — the drawn sheets</option>
        </select>
      </label>
      <p class="hint">The game's own three renderers (<code>?render=</code>),
      on one grid and one clock. A fighter with no model draws their sprites
      on either model backend, exactly as they would in a match.</p>

      <h3>Playback</h3>
      <label>Speed <span class="mono" id="speedVal">1.00×</span>
        <input id="speed" type="range" min="0.1" max="2" step="0.05" value="1">
      </label>
      <div class="row">
        <button id="playBtn" class="ghost sm">⏸ Pause</button>
        <button id="restartBtn" class="ghost sm" title="Play the current animation again from its first frame">↺ Restart</button>
        <label class="check"><input id="faceToggle" type="checkbox"> Face left</label>
      </div>

      <h3>Engine — the game's own dials</h3>
      <label>Sample rate (Hz) <span class="mono" id="hzVal"></span>
        <input id="hz" type="range" min="6" max="30" step="1">
      </label>
      <div class="row">
        <label class="check"><input id="twosToggle" type="checkbox" checked> On twos</label>
        <label class="check"><input id="ikToggle" type="checkbox" checked> Foot IK</label>
      </div>
      <div class="row">
        <label class="check"><input id="breathToggle" type="checkbox" checked> Breathing</label>
        <label class="check"><input id="turnToggle" type="checkbox" checked> Turnaround yaw</label>
      </div>
      <p class="hint">On twos + the sample rate are the limited-animation
      look: motion holds and snaps at the game's own 13 Hz instead of
      gliding at 60. Turnaround off falls back to a picture mirror, the way
      sprites face.</p>

      <h3>Attack range</h3>
      <label class="check"><input id="arcToggle" type="checkbox" checked> Show the hitbox and strike arc</label>
      <p class="hint">The move's REAL hitbox, from the same
      <code>src/moves.js</code> the simulation hits with — drawn at the
      fighter's own origin, so the animation and the range it actually covers
      can be read against each other. The arc is the sweep the game paints
      (<code>strikeArcs</code>); the dashed ring is the tip sweetspot where
      one exists.</p>

      <h3>Viewer effects</h3>
      <label>Motion blur <span class="mono" id="blurVal">off</span>
        <input id="blur" type="range" min="0" max="0.9" step="0.05" value="0">
      </label>
      <p class="hint">A frame-persistence trail, viewer-side only — the game
      does not blur. Useful for judging how much a move travels per sampled
      frame.</p>
      <label>Stage light preset
        <select id="stageSelect"></select>
      </label>
      <p class="hint">Every dial on this page is in-memory and roster-wide:
      nothing writes to disk, nothing exports. Per-fighter corrections live
      in the pose bench.</p>
    </aside>
  </main>`;

const canvas = $("stage");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// ------------------------------------------------------------------- boot

await loadCoreAssets();
initPose(THREE);
scene.initScene(THREE);
// Manifest + mannequin stand-ins only; real rigs stream in per page, for the
// same reason the other benches stopped front-loading 56 MB of glTF.
await rig.initRigs(THREE, GLTFLoader, ["all"], CHARACTER_KEYS, []);

/**
 * THE ROSTER THIS PAGE SHOWS: fighters that render as 3D in a match — a
 * delivered, approved model that nobody has held back with `inGame: false`.
 * That last flag is exactly Mei Mei and Kurourushi today; the pose bench
 * still shows them (fixing them is its job), this page does not (judging the
 * shipping roster is this one's).
 */
const ROSTER = CHARACTER_KEYS.filter((k) => {
  const e = rig.rigManifest().characters?.[k];
  return !!(e?.model && e?.approved) && rig.inGame(k);
});

const params = new URLSearchParams(location.search);

const RENDERERS = ["3d", "billboard", "sprite"];

const ui = {
  per: [1, 2, 4, 8].includes(+params.get("per")) ? +params.get("per") : 8,
  page: Math.max(0, +params.get("page") || 0),
  /** Which of the game's renderers draws the grid. */
  render: RENDERERS.includes(params.get("render")) ? params.get("render") : "3d",
  playing: true,
  speed: 1,
  /** Viewer clock, in animation seconds — advances by dt × speed. */
  clock: 0,
  /** Overlay each attack's real hitbox and strike arc. */
  arcs: params.get("arcs") !== "0",
  /** 0 = clean frames; toward 1 = longer frame-persistence trail. */
  blur: 0,
  faceLeft: false,
  view3d: false,
};

const pageCount = () => Math.max(1, Math.ceil(ROSTER.length / ui.per));

function visibleChars() {
  return ROSTER.slice(ui.page * ui.per, ui.page * ui.per + ui.per);
}

// ------------------------------------------------------- what is playing
//
// One clock, one state, everybody: the whole point is eight bodies on the
// same beat, so the players below drive a SINGLE (state, startedAt) pair and
// every fighter renders from it.
//
// Three layers, strongest first:
//   trigger  a one-shot (or a queued run of them — the jump arc), playing out
//   held     a loop held down on the pad (shield, ult, charge, grab hold)
//   pinned   a loop clicked in the animation grid, until replaced
//   base     what the left stick says (walk/run/crouch/dash), else idle

const play = {
  queue: [],        // [{ state, dur }] — a triggered one-shot run
  held: null,       // pad-held loop
  pinned: "idle",   // grid-pinned loop
  current: "idle",  // what rendered last frame
  startedAt: 0,     // ui.clock when `current` last changed
};

/** How long a one-shot occupies the screen: its clip, plus a beat of hold on
 *  the final pose — the game holds it too (clipTime clamps short of the end). */
const shotDur = (state) => (STATES[clipNameFor(state)]?.duration ?? 0.4) + 0.12;

/** Play a run of one-shots, first one now. Clearing `current` makes the draw
 *  loop treat it as a fresh state even when the same move is mashed twice in
 *  a row — a second jab restarts the jab. */
function triggerSeq(states) {
  play.queue = states.map((s) => ({ state: s, dur: shotDur(s) }));
  play.queue[0].until = ui.clock + play.queue[0].dur;
  play.current = "";
}

function trigger(state) {
  if (STATES[state]?.loop) {
    play.pinned = state;
    play.queue = [];
  } else {
    triggerSeq([state]);
  }
  syncAnimGrid();
}

/** Advance the queue past finished one-shots, then say what plays now. The
 *  stick outranks the pinned loop: holding a direction is an INPUT, and an
 *  input that lost to a leftover grid click would read as a dead pad. */
function resolveState() {
  while (play.queue.length && ui.clock >= play.queue[0].until) {
    play.queue.shift();
    if (play.queue.length) play.queue[0].until = ui.clock + play.queue[0].dur;
  }
  return play.queue[0]?.state || play.held || baseState() || play.pinned || "idle";
}

// ------------------------------------------------------------ the gamepad
//
// Read straight off navigator.getGamepads() with the game's own map
// (config_controls.js PAD_BUTTONS / PAD_AXES) — the one place a binding is
// written down, so the button that jabs in a match jabs here.

const DEADZONE = 0.22;
const pad = {
  index: null,
  prev: new Map(),   // action id -> was it down last frame
  stickX: 0,         // last frame's x, for the dash flick
  heavyAt: null,     // ui.clock when heavy went down (hold = charge)
  tilted: false,     // right stick past threshold last frame (edge detect)
};

addEventListener("gamepadconnected", (e) => {
  pad.index = e.gamepad.index;
  notify(`pad connected: ${e.gamepad.id}`);
});
addEventListener("gamepaddisconnected", (e) => {
  if (e.gamepad.index === pad.index) pad.index = null;
});

function firstPad() {
  const pads = navigator.getGamepads?.() || [];
  if (pad.index !== null && pads[pad.index]) return pads[pad.index];
  for (const p of pads) if (p && p.buttons.length) { pad.index = p.index; return p; }
  return null;
}

/** Is any of an action's buttons down? PAD_BUTTONS values are an index or a
 *  list of them; triggers report analog values, so `pressed` OR value. */
function actionDown(gp, id) {
  const spec = PAD_BUTTONS[id];
  const list = Array.isArray(spec) ? spec : spec == null ? [] : [spec];
  return list.some((i) => gp.buttons[i]?.pressed || (gp.buttons[i]?.value ?? 0) > 0.4);
}

/** Down this frame, up last frame. */
function edge(gp, id) {
  const now = actionDown(gp, id);
  const before = pad.prev.get(id) || false;
  pad.prev.set(id, now);
  return now && !before;
}

const airborne = () => ["jump", "fall"].includes(play.queue[0]?.state);

/** The left stick's standing answer — what plays when nothing is triggered
 *  or held. Null means idle. */
let stick = { x: 0, y: 0 };
function baseState() {
  if (stick.y > 0.5) return "crouch";
  const ax = Math.abs(stick.x);
  if (ax > 0.75) return "run";
  if (ax > DEADZONE) return "walk";
  return null;
}

function readPad() {
  const gp = firstPad();
  $("padStatus").textContent = gp
    ? `🎮 ${gp.id.replace(/\(.*\)/, "").trim()}`
    : "no controller — click an animation below, or plug in an Xbox pad";
  if (!gp) return;

  const x = gp.axes[PAD_AXES.moveX] ?? 0;
  const y = gp.axes[PAD_AXES.moveY] ?? 0;
  stick = { x: Math.abs(x) > DEADZONE ? x : 0, y: Math.abs(y) > DEADZONE ? y : 0 };
  if (stick.x) setFaceLeft(stick.x < 0);

  // Dash is the shove, exactly as input.js reads it: from centred to hard
  // over inside a frame or two.
  if (Math.abs(x) > 0.8 && Math.abs(pad.stickX) < 0.3) triggerSeq(["dash"]);
  pad.stickX = x;

  if (edge(gp, "pause")) setPlaying(!ui.playing);
  if (edge(gp, "jump")) triggerSeq(["jump", "fall", "land"]);

  if (edge(gp, "light")) {
    trigger(airborne() ? "airLight"
      : stick.y > 0.5 ? "crouchAttack"
      : Math.abs(stick.x) > 0.75 ? "dashAttack"
      : "light");
  }

  // Heavy: press starts the clock; held past a beat is the charge loop; the
  // release throws the heavy the stick is asking for.
  const heavyDown = actionDown(gp, "heavy");
  if (heavyDown && pad.heavyAt === null) pad.heavyAt = ui.clock;
  if (heavyDown && pad.heavyAt !== null && ui.clock - pad.heavyAt > 0.25) play.held = "charge";
  if (!heavyDown && pad.heavyAt !== null) {
    if (play.held === "charge") play.held = null;
    trigger(stick.y < -0.5 ? "upHeavy" : stick.y > 0.5 ? "downHeavy" : "sideHeavy");
    pad.heavyAt = null;
  }

  if (edge(gp, "special")) {
    trigger(stick.y > 0.5 ? "specialDown"
      : Math.abs(stick.x) > 0.35 ? "specialSide"
      : "specialNeutral");
  }

  if (edge(gp, "grab")) trigger("grabReach");
  if (edge(gp, "dpadUp")) trigger("throwUp");
  if (edge(gp, "dpadDown")) trigger("throwDown");
  if (edge(gp, "dpadLeft")) trigger("throwBack");
  if (edge(gp, "dpadRight")) trigger("throwFwd");

  // Right stick: the tilt attacks, on the crossing edge so holding it does
  // not machine-gun the move.
  const tx = gp.axes[PAD_AXES.tiltX] ?? 0;
  const ty = gp.axes[PAD_AXES.tiltY] ?? 0;
  const tilted = Math.hypot(tx, ty) > 0.6;
  if (tilted && !pad.tilted) {
    trigger(ty < -0.5 ? "upHeavy" : ty > 0.5 ? "downHeavy" : "sideHeavy");
    if (Math.abs(tx) > 0.3) setFaceLeft(tx < 0);
  }
  pad.tilted = tilted;

  // The held loops: ult and shield own the screen while their button is
  // down; shield plus a stick is the dodge roll. Charge is handled above.
  if (actionDown(gp, "ult")) play.held = "ult";
  else if (play.held === "ult") play.held = null;
  if (actionDown(gp, "shield")) {
    play.held = Math.abs(stick.x) > 0.5 ? "dodge_roll" : "shield";
  } else if (play.held === "shield" || play.held === "dodge_roll") {
    play.held = null;
  }
}

// ---------------------------------------------------------- the controls

function notify(text) {
  status.notice = text;
  status.until = performance.now() + 6000;
}
const status = { notice: "", until: 0 };

function setPlaying(on) {
  ui.playing = on;
  $("playBtn").textContent = on ? "⏸ Pause" : "▶ Play";
}
$("playBtn").onclick = () => setPlaying(!ui.playing);
$("restartBtn").onclick = () => {
  // Re-arm whatever is on screen from frame zero — a one-shot replays, a
  // loop snaps to its first frame.
  if (play.queue.length) triggerSeq(play.queue.map((q) => q.state));
  play.startedAt = ui.clock;
  setPlaying(true);
};

$("speed").oninput = () => {
  ui.speed = parseFloat($("speed").value);
  $("speedVal").textContent = `${ui.speed.toFixed(2)}×`;
};

$("blur").oninput = () => {
  ui.blur = parseFloat($("blur").value);
  $("blurVal").textContent = ui.blur ? ui.blur.toFixed(2) : "off";
};

/** Whether the billboard renderer's three.js scene has been built. Declared
 *  here rather than beside its draw function because clearRenderCaches reads
 *  it, and a `let` further down the module would be in its dead zone. */
let bbReady = false;

/** Drop BOTH model backends' caches.
 *
 *  The engine dials below are shared — billboards poses through the same
 *  pose.js DIALS that render3d does — but each backend keeps its own cache,
 *  and neither token mentions the dials. Clearing only the one on screen left
 *  a dial that worked until you switched backends and then showed the pose it
 *  had cached under the old setting. */
function clearRenderCaches() {
  scene.clearCache();
  if (bbReady) bbRenderer.clearCache();
}

$("hz").value = String(DIALS.sampleHz);
$("hzVal").textContent = String(DIALS.sampleHz);
$("hz").oninput = () => {
  DIALS.sampleHz = parseFloat($("hz").value);
  $("hzVal").textContent = String(DIALS.sampleHz);
  clearRenderCaches();
};
$("twosToggle").checked = DIALS.onTwos;
$("twosToggle").onchange = () => { DIALS.onTwos = $("twosToggle").checked; clearRenderCaches(); };
$("ikToggle").checked = DIALS.footIK;
$("ikToggle").onchange = () => { DIALS.footIK = $("ikToggle").checked; clearRenderCaches(); };
$("breathToggle").checked = DIALS.breath;
$("breathToggle").onchange = () => { DIALS.breath = $("breathToggle").checked; clearRenderCaches(); };
$("turnToggle").checked = DIALS.turnaround;
$("turnToggle").onchange = () => { DIALS.turnaround = $("turnToggle").checked; clearRenderCaches(); };

$("arcToggle").checked = ui.arcs;
$("arcToggle").onchange = () => { ui.arcs = $("arcToggle").checked; };

$("renderSelect").value = ui.render;
$("renderSelect").onchange = () => {
  ui.render = $("renderSelect").value;
  // View 3D is a render3d idea: the orbit is an offset on THAT backend's
  // camera (scene.setOrbit). A card is rendered through its own fixed ortho
  // camera and a sprite is a drawing, so on those two the control would be a
  // dial connected to nothing — it says "not here" rather than lying.
  const canOrbit = ui.render === "3d";
  $("view3d").disabled = !canOrbit;
  $("view3dBox").classList.toggle("disabled", !canOrbit);
  if (!canOrbit && ui.view3d) {
    $("view3d").checked = false;
    $("view3d").onchange();
  }
  // The sprite path needs no rigs; the two model paths do, and the fighters
  // on screen may never have been fetched if the page opened on sprites.
  if (ui.render !== "sprite") ensureVisible();
  syncPageControls();
  notify(`drawing through the ${$("renderSelect").selectedOptions[0].textContent} backend`);
};

function setFaceLeft(left) {
  if (ui.faceLeft === left) return;
  ui.faceLeft = left;
  $("faceToggle").checked = left;
}
$("faceToggle").onchange = () => { ui.faceLeft = $("faceToggle").checked; };

const stageSel = $("stageSelect");
for (const s of STAGES) {
  const o = document.createElement("option");
  o.value = s.key;
  o.textContent = s.name;
  stageSel.append(o);
}
gameState.stageKey = STAGES[0].key;
stageSel.value = gameState.stageKey;
stageSel.onchange = () => { gameState.stageKey = stageSel.value; clearRenderCaches(); };

// FREE LOOK — the shared orbit dial, driving the shared scene camera. One
// camera renders every cell, so the whole grid turns together: that is a
// feature, not a compromise — eight bodies compared from one new angle.
const look = makeOrbit(({ yaw, pitch, dolly }) =>
  scene.setOrbit({ yawDeg: yaw, pitchDeg: pitch, dolly }));
look.bind(canvas, () => ui.view3d);
$("view3d").onchange = () => {
  ui.view3d = $("view3d").checked;
  look.setOn(ui.view3d);
  $("view3dBox").classList.toggle("on", ui.view3d);
  scene.clearCache();
};

// -------------------------------------------------------------- the pages

function syncPageControls() {
  $("pageLabel").textContent = ROSTER.length
    ? `${ui.page * ui.per + 1}–${Math.min(ROSTER.length, (ui.page + 1) * ui.per)} of ${ROSTER.length}`
    : "no fighters in game";
  $("perScreen").value = String(ui.per);
  const url = new URL(location);
  url.searchParams.set("page", String(ui.page));
  url.searchParams.set("per", String(ui.per));
  url.searchParams.set("render", ui.render);
  history.replaceState(null, "", url);
}

/** Stream in the rigs the current page shows, one at a time so a slow fetch
 *  shows seven fighters rather than none. A page turn mid-load abandons the
 *  old page's loop. */
let loadSeq = 0;
async function ensureVisible() {
  const seq = ++loadSeq;
  // Sprites need no rigs, and fetching a 2 MB .glb for a backend that will
  // not look at it is the one cost a page turn should never pay.
  if (ui.render === "sprite") return;
  for (const char of visibleChars()) {
    const held = rig.getRig(char);
    if (held && !held.isMannequin) continue;
    await rig.ensureRig(char, GLTFLoader).catch(() => {});
    if (seq !== loadSeq) return;
    scene.clearCache();
  }
}

function setPage(p) {
  ui.page = ((p % pageCount()) + pageCount()) % pageCount();
  syncPageControls();
  ensureVisible();
}
$("pagePrev").onclick = () => setPage(ui.page - 1);
$("pageNext").onclick = () => setPage(ui.page + 1);
$("perScreen").onchange = () => {
  // Hold position in the roster: the first fighter on screen stays on screen.
  const first = ui.page * ui.per;
  ui.per = +$("perScreen").value;
  setPage(Math.floor(first / ui.per));
};

addEventListener("keydown", (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || "")) return;
  if (e.key === "ArrowLeft") setPage(ui.page - 1);
  else if (e.key === "ArrowRight") setPage(ui.page + 1);
  else if (e.key === " ") setPlaying(!ui.playing);
  else return;
  e.preventDefault();
});

// -------------------------------------------------------- the animation grid
//
// Every state the engine can play, one card each — including the aliases
// (dash attacks, grabs, throws), which say whose clip they borrow. Click a
// loop and it pins; click a one-shot and it plays once over whatever is
// pinned, exactly the layering a match produces.

const animGrid = $("animGrid");
for (const [name, spec] of Object.entries(STATES)) {
  const btn = document.createElement("button");
  btn.className = "abtn";
  btn.dataset.state = name;
  const alias = clipNameFor(name) !== name ? ` · plays ${clipNameFor(name)}` : "";
  btn.innerHTML = `<b>${name}</b><span>${spec.loop ? "loop" : "one-shot"}`
    + ` · ${spec.duration}s${alias}</span>`;
  btn.onclick = () => trigger(name);
  animGrid.append(btn);
}

function syncAnimGrid() {
  for (const btn of animGrid.children) {
    btn.classList.toggle("pinned", btn.dataset.state === play.pinned);
    btn.classList.toggle("active", btn.dataset.state === play.current);
  }
}

// --------------------------------------------------------------- the draw

/** Grid shape per density: eight is the 4×2 the page is named for. */
const SHAPES = { 1: [1, 1], 2: [2, 1], 4: [2, 2], 8: [4, 2] };

// ------------------------------------------------------------- the renderers
//
// One fighter, one state, one instant, drawn by whichever of the game's three
// backends is selected — each through the module the game's own backend calls,
// so this is the real renderer rather than a lookalike.

/** Does this fighter have a model loaded and ready to pose? Both model
 *  backends ask exactly this before drawing, and both fall through to the
 *  fighter's sprites when the answer is no — mid-roster, per character. */
function modelReady(char) {
  const r = rig.getRig(char);
  return !!r && !r.isMannequin;
}

/** The aim solution the game hands both model backends. There is no opponent
 *  on this page, so the point is null — which is NOT "no solve": a strike
 *  still goes somewhere, and for the states with a fixed elevation
 *  (states.js AIM_ELEVATIONS) that somewhere is what makes an up-heavy go up.
 *  Leaving it out drew every attack un-solved, which is a different animation
 *  from the one the game plays. */
function aimFor(char, state, footY, facing) {
  const targetPx = headHeightTarget(char);
  return aimSolve(0, footY, footY - targetPx * 0.55, null, facing, state, artReach(char));
}

/** render3d: pose the live rig, render it toon-shaded, blit the texture —
 *  the same three calls as render3d/src/backend.js drawCharFrame. */
function draw3d(char, state, t, facing) {
  const solved = aimFor(char, state, 0, facing);
  const layers = {
    reach: solved ? { dx: solved.dx, dy: solved.dy, targetPx: headHeightTarget(char) } : null,
    turnYawRad: DIALS.turnaround && facing < 0 ? scene.turnaroundYaw() : 0,
  };
  const entry = scene.renderPose(char, state, t, rig.getRig(char),
    rig.resolveClip(char, state), layers);
  if (!entry) return false;
  blitPose(ctx, entry, char, 0, 0, { scale: getActor(char)?.scale, facing, alpha: 1 });
  return true;
}

/** Billboards: the 2.5D card — one quantised pose rendered through the fixed
 *  ¾ ortho camera and blitted flat, mirrored for facing (the card's whole
 *  economy). billboards/src/billboard.js does exactly this pair of calls. */
function drawBillboard(char, state, t, facing) {
  if (!bbReady) {
    bbRenderer.initRenderer(THREE);
    bbReady = true;
  }
  const targetPx = headHeightTarget(char);
  const entry = bbRenderer.renderPose(char, state, t, rig.resolveClip,
    aimFor(char, state, 0, facing), targetPx);
  if (!entry) return false;
  bbBlitPose(ctx, entry, char, 0, 0, { scale: getActor(char)?.scale, facing, alpha: 1 });
  return true;
}

/** Sprites: the drawn sheets, through the sprite backend's own two calls.
 *  The frame is fetched lazily — a sheet not in memory yet simply does not
 *  draw this frame, and does on the next one. */
function drawSprite(char, state, t, facing) {
  const frame = spriteFrame(char, state, t);
  loadFrame(char, frame).catch(() => {});
  return spriteDraw(ctx, char, frame, 0, 0,
    { scale: getActor(char)?.scale, facing, alpha: 1 });
}

// ------------------------------------------------------- the attack's range
//
// WHAT THE MOVE ACTUALLY HITS, drawn where it actually hits it.
//
// The animation and the hitbox are authored in different places and neither
// one is evidence about the other: a swing that reads enormous can carry a
// stubby box, and a flick of the wrist can reach half the stage. This overlay
// puts them in the same picture — the fighter's own origin, their own scale,
// their own facing — so "does this animation look like its range?" becomes a
// question you can answer by looking rather than by remembering two numbers.
//
// It is the REAL hitbox: built by src/moves.js, the same call the simulation
// makes, so nothing here can drift from what the game hits with. `ox/w/oy/h`
// are game pixels from the fighter's origin (feet, at their facing), which is
// exactly the frame this viewer already draws bodies in.

/** Which move builder and variant each attack state plays. Mirrors the
 *  dispatch in the controller — a state absent here has no hitbox to draw
 *  (a special or an ult, whose boxes are the character's own script). */
const MOVE_OF = {
  light:           [lightMove, "jab"],
  sideHeavy:       [heavyMove, "side"],
  upHeavy:         [heavyMove, "up"],
  downHeavy:       [heavyMove, "down"],
  airLight:        [lightMove, "air"],
  crouchAttack:    [lightMove, "down"],
  dashAttack:      [lightMove, "dash"],
  dashAttackHeavy: [heavyMove, "dash"],
};

/** The move this state throws, or null. Failures are swallowed: a variant a
 *  builder does not know is a missing overlay, never a dead viewer. */
function moveFor(char, state) {
  const spec = MOVE_OF[clipNameFor(state)];
  if (!spec) return null;
  const [build, variant] = spec;
  try {
    return build(CHARACTERS[char], variant, 0) || null;
  } catch {
    return null;
  }
}

/** Draw the hitbox, the strike arc and the tip ring at the current origin.
 *  Everything is in game pixels from the fighter's feet, so it rides the same
 *  transform the body was drawn under and needs no scaling of its own. */
function drawRange(char, state, facing) {
  const m = moveFor(char, state);
  if (!m) return false;
  const bodyH = headHeightTarget(char);
  ctx.save();
  // The box is authored forward-positive; facing left mirrors it, exactly as
  // the simulation mirrors it about the fighter's own x.
  ctx.scale(facing, 1);

  // THE BOX: what connects. Filled faintly so it reads under the figure
  // rather than over it.
  ctx.fillStyle = "rgba(211, 143, 143, 0.16)";
  ctx.strokeStyle = "rgba(211, 143, 143, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.fillRect(m.ox, m.oy, m.w, m.h);
  ctx.strokeRect(m.ox, m.oy, m.w, m.h);

  // THE ARC: the sweep the game paints for this box (moves.js strikeArcs), so
  // the overlay agrees with what a player sees mid-match.
  ctx.strokeStyle = "rgba(159, 211, 159, 0.8)";
  ctx.lineWidth = 2;
  for (const a of strikeArcs(m, bodyH) || []) {
    ctx.beginPath();
    ctx.arc(0, a.pivotY, a.radius, a.aim - a.span / 2, a.aim + a.span / 2);
    ctx.stroke();
  }

  // THE TIP BAND, where the move has one: the ring that hits hardest.
  if (m.critBand?.ring) {
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(203, 160, 210, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -bodyH * 0.5, m.critBand.ring, -0.9, 0.9);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  return true;
}

/** Draw `char` at the origin of the current transform. Returns what actually
 *  drew, so the caption can say when a model backend fell through to sprites
 *  — in a match that fallthrough is invisible by design, and on a bench that
 *  compares backends it is the single most important thing to see. */
function drawFighter(char, state, t, facing) {
  if (ui.render === "sprite") return drawSprite(char, state, t, facing) ? "sprite" : "";
  if (!modelReady(char)) return drawSprite(char, state, t, facing) ? "fallback" : "";
  const drew = ui.render === "3d"
    ? draw3d(char, state, t, facing)
    : drawBillboard(char, state, t, facing);
  if (drew) return ui.render;
  return drawSprite(char, state, t, facing) ? "fallback" : "";
}

function draw(now) {
  const dt = Math.min(0.1, (now - (draw.last || now)) / 1000);
  draw.last = now;
  if (ui.playing) ui.clock += dt * ui.speed;

  readPad();

  const state = resolveState();
  if (state !== play.current) {
    play.current = state;
    play.startedAt = play.queue[0] ? play.queue[0].until - play.queue[0].dur : ui.clock;
    syncAnimGrid();
  }
  const t = ui.clock - play.startedAt;

  // MOTION BLUR as frame persistence: instead of clearing, the last frame is
  // washed toward the background and the new one drawn over it. At 0 the wash
  // is opaque — an ordinary clear.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(16, 21, 34, ${(1 - ui.blur).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);

  const chars = visibleChars();
  const [cols, rows] = SHAPES[ui.per];
  const cellW = W / cols;
  const cellH = H / rows;
  // One scale for the whole page, set by its tallest fighter: sized bodies
  // stay comparable, which is the point of standing them side by side.
  const tallest = Math.max(1, ...chars.map(headHeightTarget));
  const fit = Math.min(2.2, (cellH - 120) / (tallest * 1.35), (cellW - 40) / (tallest * 1.1));
  const facing = ui.faceLeft ? -1 : 1;

  ctx.font = "13px system-ui, sans-serif";
  for (const [i, char] of chars.entries()) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = (col + 0.5) * cellW;
    const ground = row * cellH + cellH - 52;

    ctx.strokeStyle = "#2c3654";
    ctx.beginPath();
    ctx.moveTo(col * cellW + 14, ground);
    ctx.lineTo((col + 1) * cellW - 14, ground);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, ground);
    ctx.scale(fit, fit);
    // Range first, so the figure is drawn over its own hitbox rather than
    // hidden behind it.
    if (ui.arcs) drawRange(char, state, facing);
    const drew = drawFighter(char, state, t, facing);
    ctx.restore();

    // The caption says which renderer actually drew, when it is not the one
    // selected: on a model backend a fighter still streaming in draws their
    // sprites, and an unlabelled sprite in a row of models is a fighter you
    // would swear had a bad model.
    const waiting = ui.render !== "sprite" && !modelReady(char);
    ctx.fillStyle = drew === "fallback" ? "#d3c69f" : drew ? "#dbe2f0" : "#d38f8f";
    const note = drew === "fallback" ? (waiting ? " — loading, sprites" : " — sprites")
      : drew ? "" : " — nothing to draw";
    const label = (CHARACTERS[char]?.name || char) + note;
    ctx.fillText(label, cx - ctx.measureText(label).width / 2, ground + 22);
  }

  // The shared readouts, crisp over any trail.
  const ct = clipTime(state, t);
  $("nowPlaying").textContent =
    `${state}${clipNameFor(state) !== state ? ` → ${clipNameFor(state)}` : ""} · ${ct.toFixed(2)}s`;
  // Each model backend keeps its own cache and its own counters, so the
  // readout has to name the one that is actually drawing.
  const s = ui.render === "billboard" ? bbRenderer.stats : scene.stats;
  $("status").textContent = performance.now() < status.until ? status.notice
    : ui.render === "sprite"
      ? `sprite sheets · page ${ui.page + 1}/${pageCount()}`
      : `${ui.render} · renders ${s.renders} · cache ${s.hits}/${s.hits + s.misses} hits · `
        + `${DIALS.onTwos ? `${DIALS.sampleHz} Hz on twos` : "on ones"} · page ${ui.page + 1}/${pageCount()}`;

  requestAnimationFrame(draw);
}

// ------------------------------------------------------------------ start

scene.setKeyLightAngle(0.55);
// Through the dropdown's own handler, so `?render=sprite` opens with the same
// state a click would produce — View 3D greyed, no rigs fetched — rather than
// with the 3D default's chrome over a sprite grid.
$("renderSelect").onchange();
setPage(Math.min(ui.page, pageCount() - 1));
syncAnimGrid();
requestAnimationFrame(draw);

// For the smokes, same pattern as window.__render3d: the viewer's live state,
// readable from a test without reaching into module scope.
window.__animViewer = { ui, play, ROSTER, visibleChars, trigger };

// index.html's boot watch: the module settled and everything is wired.
window.__workbenchReady = true;
