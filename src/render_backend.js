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
// This module is that waist, made explicit. There are three backends today —
// the sprite sheets, the 2.5D cards and the live-3D path — and each of them is
// a new entry in BACKENDS rather than a fork of render.js, which is the whole
// point of naming the seam.
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

import {
  drawCharFrame as spriteDraw, currentFrame as spriteFrame, cyclePhase as spriteCycle,
  frameStep as spriteStep, anchorOffset as spriteAnchorOffset,
} from "../sprites/src/sprites.js";
import * as billboard from "../billboards/src/billboard.js";
import * as render3d from "../render3d/src/backend.js";

/** The registered ways to draw a character. Keyed by the name `?render=` takes. */
const BACKENDS = {
  sprite: {
    label: "2D sprite sheets",
    drawCharFrame: spriteDraw,
    currentFrame: spriteFrame,
    cyclePhase: spriteCycle,
    // The two OPTIONAL hooks (see frameStep/anchorOffset below). Only a
    // backend whose frames are drawings has answers here: a backend that
    // poses a rig per draw inbetweens on the bone and has no "previous
    // drawing" to fade out of.
    frameStep: spriteStep,
    anchorOffset: spriteAnchorOffset,
  },
  // 2.5D: posed 3D models rendered to a texture and blitted into the same 2D
  // world. Characters with a rig draw as models; everyone else falls through
  // to sprites, per character rather than per build. `init` loads the 3D
  // engine and the rigs lazily — only a selection pays that cost.
  billboard: {
    label: "2.5D billboarded models",
    drawCharFrame: billboard.drawCharFrame,
    currentFrame: billboard.currentFrame,
    cyclePhase: billboard.cyclePhase,
    init: billboard.init,
    scene3d: billboard.scene3d,
  },
  // Live 3D: rigged models animated at full frame rate, rendered in a
  // hand-drawn anime style (toon ramp, ink outlines, on-twos stepping) and
  // blitted into the same 2D world. The billboard backend's heir — same clip
  // contract, same per-character fallthrough to sprites. Code lives under
  // /render3d (named for the leading-digit rule; the URL stays `?render=3d`).
  "3d": {
    label: "3D anime-rendered models",
    drawCharFrame: render3d.drawCharFrame,
    currentFrame: render3d.currentFrame,
    cyclePhase: render3d.cyclePhase,
    init: render3d.init,
    scene3d: render3d.scene3d,
    preload: render3d.preload,
  },
};

// Spellings people will actually type. Both nouns read naturally as plurals
// (`?render=sprites`, `?render=billboards`), so both resolve — a URL that is
// obviously naming a backend should never cost a fallback warning.
const ALIASES = {
  sprites: "sprite",
  billboards: "billboard",
  "2d": "sprite",
  "2.5d": "billboard",
  render3d: "3d",
  model: "3d",
  models: "3d",
  anime: "3d",
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
  const resolved = ALIASES[name?.toLowerCase?.()] || name;
  if (resolved && BACKENDS[resolved]) {
    activeName = resolved;
  } else {
    if (name) {
      console.warn(`render backend "${name}" is not registered — using `
        + `"${DEFAULT_BACKEND}". Known backends: ${Object.keys(BACKENDS).join(", ")}.`);
    }
    activeName = DEFAULT_BACKEND;
  }
  active = BACKENDS[activeName];
  // A backend with startup work (the billboard path loads its engine and rigs)
  // starts it now, async; drawing before it resolves falls through to sprites,
  // which is the fallthrough behaving as designed rather than a race.
  active.init?.();
  return activeName;
}

// What the Settings screen offers, in the order it cycles through them. The
// registry keys above are what `?render=` takes; these short names are what a
// player reads, and the order puts the default first so one press off it and
// one press back is the round trip.
//
// Deliberately a separate list rather than `Object.keys(BACKENDS)`: a backend
// can exist and be reachable by URL without being something to offer in a menu,
// and the labels here are menu-length rather than descriptive.
export const RENDER_OPTIONS = [
  { name: "sprite", label: "Sprites" },
  { name: "3d", label: "3D" },
  { name: "billboard", label: "Billboards" },
];

/** The menu name of the backend in force — "Sprites" unless someone changed it. */
export function renderBackendMenuLabel() {
  return RENDER_OPTIONS.find((o) => o.name === activeName)?.label || activeName;
}

/** Advance to the next backend and switch to it, returning its menu label.
 *
 *  Takes effect immediately, mid-match and all: unlike the stock count or the
 *  clock, this changes nothing about the fight, only how the fighters in it are
 *  drawn. Any loading the new backend needs starts here and the characters
 *  whose rigs have not arrived keep drawing as sprites meanwhile, which is the
 *  per-character fallthrough working rather than a stall. */
export function cycleRenderBackend() {
  const i = RENDER_OPTIONS.findIndex((o) => o.name === activeName);
  selectRenderBackend(RENDER_OPTIONS[(i + 1) % RENDER_OPTIONS.length].name);
  return renderBackendMenuLabel();
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

/** OPTIONAL — where the playhead sits relative to the last frame step, for a
 *  backend whose animation is a list of DRAWINGS: what is showing, what it cut
 *  from, and how long ago. Null from a backend that inbetweens a rig instead,
 *  which has no cut to soften and is already doing the smoothing this would be
 *  standing in for. See sprites.js for the shape. */
export function frameStep(charKey, animKey, animTime) {
  return active.frameStep?.(charKey, animKey, animTime) || null;
}

/** OPTIONAL — a named anchor as a world offset from the point a frame would be
 *  drawn at, under the given draw options. Null from a backend that does not
 *  carry per-frame anchors. Lets a caller drawing two frames at once know
 *  where each puts its body; see the COM-aligned cross-fade in render.js. */
export function anchorOffset(charKey, frameKey, name, opts) {
  return active.anchorOffset?.(charKey, frameKey, name, opts) || null;
}

/** Warm this backend's heavy per-character assets for `charKey` — called from
 *  the select screen when a player hovers or commits to a fighter, so menu
 *  time pays the load instead of match time. The sprite loader already runs
 *  its own preview/claim queue (assets.js); this is the same idea for a
 *  backend with per-character weight of its own (the 3D rigs, when they load
 *  lazily). A backend with nothing extra to warm simply has no hook. */
export function preloadChar(charKey, commit = false) {
  active.preload?.(charKey, commit);
}

/** How this backend wants to appear inside a real 3D scene — `?camera=3d`.
 *
 *  The three questions above are about a 2D CONTEXT, which is the only thing
 *  the flat renderer has. The 2.5D camera has a scene instead, and asking it
 *  to accept a flat drawing would throw away exactly what each backend is for.
 *  So a backend may ALSO declare how it presents as geometry:
 *
 *    kind: "object"    hand over the rig; the camera adds it to its scene and
 *                      its own perspective camera renders it (render3d)
 *    kind: "texture"   hand over a posed texture for a camera-facing card,
 *                      which is what a billboard natively is (billboards)
 *    null              no opinion — the camera draws that fighter's sprites,
 *                      which is the honest answer for the sprite backend
 *
 *  Optional by design: a backend that never answers still works everywhere,
 *  and the camera falls back to sprites per character exactly as the flat
 *  path falls back per character. */
export function sceneAdapter() {
  return active.scene3d || null;
}
