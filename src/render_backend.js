// The seam between "what the game wants drawn" and "how a character is drawn".
//
// Everything in this game that puts a CHARACTER on screen — fighters, their
// afterimages, Mahoraga and the other brawler summons — goes through exactly
// three questions:
//
//   currentFrame   which pose is showing right now
//   cyclePhase     where the playhead sits inside the looped cycle
//   drawCharFrame  draw that pose here, this big, facing this way
//
// Those three are the entire surface. Combat, movement, AI, hitboxes, the HUD,
// stage effects and domains never touch artwork at all: they work in `x`, `y`,
// `animKey` and `animTime`, and a character becomes pixels only at the four
// call sites that reach through here. That is a narrow enough waist to put a
// DIFFERENT ANSWER behind — posed 3D models rendered to a texture and blitted
// into the same 2D world, say — without the rest of the game knowing.
//
// This module is that waist, made explicit. Today there is one backend and it
// is the sprite sheets; the point of naming it is that adding a second one is
// a new entry in BACKENDS rather than a fork of render.js.
//
// ---------------------------------------------------------------------------
// WHAT A BACKEND OWES THE GAME
//
// The three functions above, with the signatures sprites.js already defines,
// and two promises that are easy to break and expensive to debug:
//
//   * `drawCharFrame` returns FALSE when it could not draw. render.js paints a
//     placeholder body on false (drawMissingArt), because a character who is
//     silently absent still fights, still takes damage, and reads as a bug in
//     the game rather than as missing art. A backend that returns undefined
//     turns every failure back into that invisible-fighter bug.
//
//   * `drawCharFrame` leaves the context exactly as it found it. It is called
//     mid-scene, between a shadow and a shield bubble, and inside `lighter`
//     composite blocks the caller set up (see summons.js drawActor). Anything
//     it changes and does not restore lands on the rest of the frame.
//
// `currentFrame` returns an opaque token, not a filename: the game passes
// whatever comes out straight back into `drawCharFrame` and stores it on the
// afterimage trail (fighter.js), and never inspects it. A model backend can
// return a clip name, an object, whatever it likes.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT HERE
//
// `frameFootY` and `resolvedAnim` stay imported from sprites.js by heights.js
// and silhouette.js. Those measure how big a fighter IS — height, width, reach,
// baked once at load out of the manifest's silhouette bounds and fed to
// combat.js — which is a gameplay number that happens to be derived from art,
// not a per-frame drawing decision. It needs its own answer from a model
// backend eventually, but it is a separate seam on a separate clock and
// folding it in here would blur what this one is for.
//
// The workbench also calls sprites.js directly, and should: it is the tool for
// authoring SPRITES, so being bound to that backend is correct rather than a
// leak.

import { drawCharFrame as spriteDraw, currentFrame as spriteFrame, cyclePhase as spriteCycle } from "../sprites/src/sprites.js";
import * as billboard from "../billboards/src/billboard.js";

/** The registered ways to draw a character. Keyed by the name `?render=` takes. */
const BACKENDS = {
  sprite: {
    label: "2D sprite sheets",
    drawCharFrame: spriteDraw,
    currentFrame: spriteFrame,
    cyclePhase: spriteCycle,
  },
  // 2.5D: posed 3D models rendered to a texture and blitted into the same 2D
  // world. A stub today — every character falls through to sprites until a
  // model is loaded for them, per character rather than per build. See
  // billboards/src/billboard.js for what is left to build.
  billboard: {
    label: "2.5D billboarded models (stub)",
    drawCharFrame: billboard.drawCharFrame,
    currentFrame: billboard.currentFrame,
    cyclePhase: billboard.cyclePhase,
  },
};

const DEFAULT_BACKEND = "sprite";

let activeName = DEFAULT_BACKEND;
let active = BACKENDS[DEFAULT_BACKEND];

/** Switch the game to a named backend. Called once at boot from main.js, before
 *  anything draws.
 *
 *  An unknown name falls back to the default rather than throwing: this is
 *  reached from a URL a player typed, and a mistyped `?render=` should start
 *  the game and say so, not leave a blank page. Returns the name actually in
 *  force so the caller can report it. */
export function selectRenderBackend(name) {
  if (name && BACKENDS[name]) {
    activeName = name;
  } else {
    if (name) {
      console.warn(`render backend "${name}" is not registered — using `
        + `"${DEFAULT_BACKEND}". Known backends: ${Object.keys(BACKENDS).join(", ")}.`);
    }
    activeName = DEFAULT_BACKEND;
  }
  active = BACKENDS[activeName];
  return activeName;
}

/** Which backend is drawing, for the boot log and debug overlays. */
export function renderBackendName() {
  return activeName;
}

/** Human-readable name of the backend in force. */
export function renderBackendLabel() {
  return active.label;
}

// The dispatchers. One property lookup per call, which is nothing against the
// drawImage that follows, and it keeps the indirection in one place instead of
// making every call site ask which renderer it is talking to.

/** Which pose `animKey` is showing at `animTime`. The result is opaque — pass
 *  it back to `drawCharFrame`, do not parse it. */
export function currentFrame(charKey, animKey, animTime) {
  return active.currentFrame(charKey, animKey, animTime);
}

/** `{ phase, frames }` — where the playhead sits in the whole looped cycle
 *  (0..1) and how many frames that cycle resolved to. motion.js sways once per
 *  cycle and bobs once per footfall off this. */
export function cyclePhase(charKey, animKey, animTime) {
  return active.cyclePhase(charKey, animKey, animTime);
}

/** Draw `frameKey` with its feet at (x, y). Returns false when nothing could be
 *  drawn — see the contract note above; the caller decides what goes in the
 *  hole. Options are documented on the sprite implementation in sprites.js. */
export function drawCharFrame(ctx, charKey, frameKey, x, y, opts) {
  return active.drawCharFrame(ctx, charKey, frameKey, x, y, opts);
}
