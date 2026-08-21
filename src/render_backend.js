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
// not a per-frame drawing decision. That is still a separate seam on a separate
// clock, and the measuring lives there.
//
// What this module owes it is ONE FACT: which art is on screen. A backend
// declares `bodySource` below and `selectRenderBackend` hands it to
// silhouette.js, which decides what to do with it. That is the whole of the
// coupling, and it points one way — silhouette.js does not import this module,
// because render3d's backend imports silhouette and the two would close a
// cycle.
//
// The workbench also calls sprites.js directly, and should: it is the tool for
// authoring SPRITES, so being bound to that backend is correct rather than a
// leak.

import {
  drawCharFrame as spriteDraw, currentFrame as spriteFrame, cyclePhase as spriteCycle,
  anchorOffset as spriteAnchorOffset,
} from "../sprites/src/sprites.js";
import * as billboard from "../billboards/src/billboard.js";
import * as render3d from "../render3d/src/backend.js";
import { setReachSource, refreshSilhouettes } from "./silhouette.js";
import { refreshStrikePoints } from "./strike_points.js";

/** The registered ways to draw a character. Keyed by the name `?render=` takes. */
const BACKENDS = {
  sprite: {
    label: "2D sprite sheets",
    drawCharFrame: spriteDraw,
    currentFrame: spriteFrame,
    cyclePhase: spriteCycle,
    // An OPTIONAL hook (see anchorOffset below). Only a backend whose frames
    // are drawings has per-frame anchors to answer with.
    anchorOffset: spriteAnchorOffset,
    // WHAT A FIGHTER'S BODY IS MEASURED OFF while this backend draws. The
    // sprite game is measured off sprites: the verified strike points on the
    // drawings, which is the only measurement that knows a fist from the
    // cursed energy around it (src/strike_reach.js).
    bodySource: "sprite",
    // ...and it does NOT turn. See `sweepsTurns` below.
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
    // The bodies on screen are the rigs, so the rigs are what they are
    // measured off — a fighter who falls through to their sprite still gets
    // the rig-side answer, which for them is the silhouette scan either way.
    bodySource: "model",
    sweepsTurns: true,
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
    bodySource: "model",
    sweepsTurns: true,
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
  // Measure the fighters off the art this backend draws — see `bodySource`
  // above. Every measurement downstream is cached, so the two refreshes are
  // what make a mid-match switch land on the new numbers instead of leaving one
  // backend's reach on another backend's bodies. Dropped unconditionally
  // rather than only on a change: this runs once at boot and once per press of
  // the Settings toggle, and rebuilding a few dozen measurements costs less
  // than the reasoning about when it is safe to skip.
  setReachSource(active.bodySource || "sprite");
  refreshSilhouettes();
  refreshStrikePoints();
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
 *  Takes effect immediately, mid-match and all. Any loading the new backend
 *  needs starts here and the characters whose rigs have not arrived keep
 *  drawing as sprites meanwhile, which is the per-character fallthrough working
 *  rather than a stall.
 *
 *  It is no longer purely cosmetic, and that is deliberate. A fighter's reach
 *  is measured off the art on screen (`bodySource`), so switching renderer
 *  mid-match re-measures the roster off the other set of bodies and a few
 *  attacks change length. The alternative was the sprite game inheriting
 *  ranges from rigs most players never see, which is the thing this exists to
 *  stop; a toggle in Settings that says "3D" changing what 3D reaches with is
 *  the honest version. */
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

/** Does this backend TURN A BODY, or mirror a drawing?
 *
 *  It decides what a facing flip should look like, and the two answers are not
 *  a matter of taste. A rig has a back: `facingVis` sweeping from +1 to -1
 *  becomes a real yaw (render3d `turnYawRad`), the body rotates through side-on
 *  and that is what turning round looks like. A DRAWING has no side-on. The
 *  sprite backend hands the same number to `ctx.scale(facing, 1)`, so a sweep
 *  squashes the art to nothing and pulls it out the other way — a page turning
 *  rather than a person, with a frame in the middle where the fighter is two
 *  pixels wide (measured; tools/smoke_smooth.mjs records it).
 *
 *  So the sweep follows the backend rather than a global preference, and
 *  fighter.js asks. `flags.js TURN_SWEEP_OVERRIDE` forces it either way for the
 *  character bench, which exists to put the two side by side. */
export function sweepsTurns() {
  return !!active.sweepsTurns;
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
