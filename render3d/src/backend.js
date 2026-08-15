// The render3d backend — anime-style 3D models, animated LIVE at full frame
// rate, rendered toon-ramped and ink-outlined, and composited into the
// unchanged 2D game.
//
// Selected with `?render=3d` (aliases: `render3d`, `model`, `models`,
// `anime` — see src/render_backend.js). This is the sibling and heir of the
// billboard backend: same offscreen-render-to-blit pipe, same 26-state clip
// contract (imported from render3d/src/states.js, never copied), same
// per-character fallthrough — a fighter with no approved 3D set draws
// sprites, mid-roster, loudly on failure. What changes: clips PLAY instead
// of holding quantised poses, and the render is an anime pass (toon.js /
// outline.js) instead of a lit figure.
//
// Everything heavy — the shared vendored three.js, the rigs, the offscreen
// scene — loads through dynamic import() from init(): a player on the sprite
// path never downloads a 3D engine.
//
// TOKENS. currentFrame returns `r3d:<animKey>@<animTime>` for rigged
// characters. The game treats tokens as opaque (afterimage trail, ghosts), so
// the token carries everything needed to re-pose — a trail ghost drawn a
// dozen sim-ticks later re-renders (or cache-hits) the exact pose. A token
// that is not ours falls through to the sprite renderer.
//
// GAMEPLAY is untouched by design: hurtboxes, reach and height stay
// sprite-derived on every backend, so a matchup plays identically however it
// is drawn.

import {
  drawCharFrame as spriteDraw,
  currentFrame as spriteFrame,
  cyclePhase as spriteCycle,
} from "../../sprites/src/sprites.js";
import { STATES, cycleInfo, aimPitch, aimSolve, aimable, clipNameFor, clipTime } from "./states.js";
import { headHeightTarget } from "../../src/heights.js";
import { comFrac } from "../../src/body_points.js";
import { artReach } from "../../src/silhouette.js";
import { state } from "../../src/state.js";
import { WORLD } from "../../src/constants.js";

let ready = false;
let initFailed = false;
let rigs = null;    // ./loader.js
let scene = null;   // ./scene.js
let pose = null;    // ./pose.js
let blit = null;    // ./blit.js
let outline = null; // ./outline.js — only the 2.5D-camera adapter needs it
let lazyRigs = false;   // load rigs on first ask instead of all at init
let GLTFLoaderRef = null; // kept for ensureRig when lazy

const TOKEN = /^r3d:([^@]+)@(-?[\d.]+)$/;
const warned = new Set();
function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

/** Called by render_backend when `?render=3d` is chosen. Loads the engine,
 *  the manifest and the approved rigs; failure downgrades every character to
 *  sprites (loudly) rather than blanking the game. */
export async function init() {
  if (ready || initFailed) return;
  try {
    const [three, loaderMod, rigMod, poseMod, sceneMod, blitMod, outlineMod] = await Promise.all([
      import("../../vendor/three/three.module.js"),
      import("../../vendor/three/loaders/GLTFLoader.js"),
      import("./loader.js"),
      import("./pose.js"),
      import("./scene.js"),
      import("./blit.js"),
      import("./outline.js"),
    ]);
    rigs = rigMod;
    pose = poseMod;
    scene = sceneMod;
    blit = blitMod;
    outline = outlineMod;
    pose.initPose(three);
    scene.initScene(three);

    const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    // Default OFF now that a real rig is delivered. The mannequin default was
    // right while nothing existed — choosing this backend was a request to see
    // it work, and a silent sprite fallthrough just showed the sprite renderer.
    // With Yuji shipped (round B1) that reverses: the honest picture is the
    // delivered fighter as a model beside the rest as their real sprites, not
    // beside 26 grey dummies. `?mannequin=all` (or a named list) brings the
    // proof body back for pipeline work.
    const raw = (params.get("mannequin") ?? "none").trim();
    const mannequin = ["none", "off", "0", ""].includes(raw.toLowerCase())
      ? [] : raw.split(",").map((s) => s.trim()).filter(Boolean);
    const { CHARACTER_KEYS } = await import("../../src/characters.js");
    // Eager on desktop, lazy on touch devices: loading all ~25 rigs (~50 MB
    // of glTF plus texture decodes) at init is exactly the pattern that OOM'd
    // iOS Safari in the workbench (loader.js ensureRig tells the story), and
    // a match only ever needs the fighters in it. Lazy means hasModel() kicks
    // a background ensureRig on first ask and the fighter draws sprites until
    // their rig lands — the same per-character fallthrough a mid-match
    // backend switch already uses. `?rigs=eager|lazy` overrides either way.
    GLTFLoaderRef = loaderMod.GLTFLoader;
    const rigsParam = (params.get("rigs") || "").toLowerCase();
    const touch = typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 0
      && /Mobi|iP(hone|ad|od)|Android/i.test(navigator.userAgent || "");
    lazyRigs = rigsParam === "lazy" || (touch && rigsParam !== "eager");
    await rigs.initRigs(three, GLTFLoaderRef, mannequin, CHARACTER_KEYS,
      lazyRigs ? [] : null);

    ready = true;
    if (typeof window !== "undefined") {
      window.__render3d = window.__render3d || {};
      window.__render3d.ready = true;
      window.__render3d.rigged = rigs.rigCount();
      window.__render3d.dials = pose.DIALS;
    }
    console.log(`render3d: ready — ${rigs.rigCount()} rigged character(s), the rest draw sprites.`);
  } catch (err) {
    initFailed = true;
    console.warn(`render3d: init failed (${err.message}) — every character will draw sprites.`);
  }
}

export function hasModel(charKey) {
  if (!ready) return false;
  if (rigs.hasRig(charKey)) return true;
  // Lazy mode: the first ask starts the load (ensureRig de-dupes concurrent
  // asks); this fighter draws sprites until it lands. inGame is checked here
  // because ensureRig is a workbench door and does not filter held-back
  // bodies the way the eager init does.
  if (lazyRigs && GLTFLoaderRef && rigs.inGame(charKey)) {
    rigs.ensureRig(charKey, GLTFLoaderRef);
  }
  return false;
}

export function modelCount() {
  return ready ? rigs.rigCount() : 0;
}

/** Select-screen warm-up (render_backend.preloadChar): in lazy mode, start
 *  this character's rig now so menu time pays for the load and the match
 *  never shows the sprite-fallthrough frames. Eager mode already has
 *  everyone; before init resolves there is nothing to queue on yet — the
 *  hasModel path retries on first draw, so nothing is lost.
 *
 *  `commit` mirrors the sprite loader's claim/preview split: a committed pick
 *  loads immediately and unconditionally, while a hover is a HINT — hints
 *  serialise, latest-wins, so sweeping the roster costs one in-flight rig at
 *  a time instead of fanning out a download per cursor step. */
let hintNext = null;
let hintBusy = false;
export function preload(charKey, commit = false) {
  if (!ready || !lazyRigs || !GLTFLoaderRef || !rigs.inGame(charKey)) return;
  if (commit) { rigs.ensureRig(charKey, GLTFLoaderRef); return; }
  hintNext = charKey;
  if (hintBusy) return;
  hintBusy = true;
  (async () => {
    try {
      while (hintNext) {
        const k = hintNext;
        hintNext = null;
        await rigs.ensureRig(k, GLTFLoaderRef);
      }
    } finally {
      hintBusy = false;
    }
  })();
}

export function currentFrame(charKey, animKey, animTime) {
  if (hasModel(charKey)) return `r3d:${animKey}@${animTime.toFixed(4)}`;
  return spriteFrame(charKey, animKey, animTime);
}

export function cyclePhase(charKey, animKey, animTime) {
  if (hasModel(charKey)) return cycleInfo(animKey, animTime);
  return spriteCycle(charKey, animKey, animTime);
}

/** The move-synced contact beat for this draw, or undefined. `opts.beat` is
 *  the attack's own hitbox delay (render.js passes f.action.move.delay); it
 *  replaces the state table's beat so the clip's full extension shows the
 *  instant the hitbox goes live — the table's number is per STATE while the
 *  delay is per MOVE and speed-scaled per character (an up-tilt and an
 *  up-smash share the upHeavy clip at very different startups). Only states
 *  that have a beat take one — a loop state has no contact to sync. Quantised
 *  to the ms (it joins the pose-cache key) and clamped inside the clip: some
 *  actions outlast the one-shot that plays them. */
function beatOverride(animKey, opts) {
  const spec = STATES[clipNameFor(animKey)];
  const b = opts.beat;
  if (!spec?.beat || typeof b !== "number" || !(b > 0)) return undefined;
  return Math.min(Math.round(b * 1000) / 1000, spec.duration - 0.02);
}

/** The cross-fade layer for this draw, or null. `opts.prevAnim` says where
 *  the current state was cut from (fighter.js setAnim); inside the fade
 *  window the outgoing pose is solved at its frozen playhead and the new
 *  pose blended toward it (pose.poseRig). The fraction is quantised to
 *  quarters of the window so at most four extra tokens exist per transition;
 *  impact states are exempt — there the cut IS the read. */
function blendLayer(charKey, animKey, animTime, opts) {
  const D = pose.DIALS;
  const prev = opts.prevAnim;
  if (!D.blend || !prev?.key) return null;
  if (pose.NO_BLEND_IN.has(clipNameFor(animKey))) return null;
  if (!(animTime >= 0 && animTime < D.blendTime)) return null;
  const resolved = rigs.resolveClip(charKey, prev.key);
  if (!resolved) return null;
  const prevSampled = pose.sampleTime(prev.key, prev.t);
  // The same clip at the same playhead is not a cut (an alias handover).
  if (clipNameFor(prev.key) === clipNameFor(animKey)
      && Math.abs(prevSampled - pose.sampleTime(animKey, animTime)) < 1e-3) return null;
  const k = Math.min(0.75, Math.round((animTime / D.blendTime) * 4) / 4);
  return { key: prev.key, sampled: prevSampled, clip: resolved.clip, k };
}

/** The live layers for this draw, every one quantised so it joins the pose
 *  cache key without exploding it (pose.js documents each dial). */
function liveLayers(charKey, animKey, x, y, opts) {
  const D = pose.DIALS;
  const facing = opts.facing ?? 1;
  const aim = opts.aim || null;
  const targetPx = headHeightTarget(charKey);
  const chestY = y - targetPx * comFrac(charKey);
  const pitch = aim ? aimPitch(x, chestY, aim, facing) : 0;
  // The reach half of the aim solution: where the strike has to land, in game
  // pixels from the fighter's own origin. Quantised by aimSolve so it can join
  // the cache key (poseToken) without making every frame of an approach a
  // unique pose.
  const solved = aimSolve(x, y, chestY, aim, facing, animKey, artReach(charKey));
  // The turn is a SWEEP, not a switch: fighter.js slides facingVis through
  // zero over TURN_TIME exactly so a turn reads as a motion, and this used
  // to collapse it to its sign — the model snapped its full turnaround on
  // the frame the sweep crossed the midline. Quantised to quarter steps
  // (about one per frame of the 70 ms sweep) so it joins the pose-cache key
  // without exploding it; at rest facingVis sits at ±1 and the steps vanish.
  const fq = Math.max(-1, Math.min(1, Math.round(facing * 2) / 2));
  return {
    beat: beatOverride(animKey, opts),
    aimRad: D.aim && aimable(animKey) ? pitch : 0,
    reach: solved ? { dx: solved.dx, dy: solved.dy, targetPx } : null,
    lookRad: D.lookAt && pose.LOOK_STATES.has(clipNameFor(animKey)) ? pitch : 0,
    flinch: pose.flinchSide(animKey, x, aim, facing),
    // Derived from the camera, not 180° — see scene.turnaroundYaw. A flat
    // half-turn under a ¾ camera shows the fighter's back. Scaled by the
    // facing sweep: full at fq=-1, zero at fq=1, partway through the turn
    // in between.
    turnYawRad: D.turnaround ? scene.turnaroundYaw() * (1 - fq) / 2 : 0,
    // The presentation mirror is this path's (pose.facingYaw), and it needs
    // the facing stated: it used to read "left" off turnYawRad being non-zero,
    // which is true here and true of both directions in the scene.
    presentMirror: D.turnaround,
    facing,
    // The quantised sweep, for the locomotion mirror (pose.facingYaw): those
    // states re-aim the body rather than taking turnYawRad, so they need the
    // sweep stated separately or they still snap.
    facingK: fq,
    parallaxDeg: pose.parallaxDeg(x, state.camera?.x ?? WORLD.w / 2, WORLD.w / 2),
  };
}

// ------------------------------------------------- the 2.5D camera adapter
//
// `?camera=3d` runs the whole game inside a real perspective camera. For THIS
// backend the native answer there is not a texture: the fighter already IS a
// rigged model in a three.js scene, so it goes into the camera's scene as
// geometry and gets rendered by the game's own camera — real perspective,
// real depth against the extruded platforms, real foreshortening on a strike
// toward the lens, and occlusion that comes out of the depth buffer instead
// of a painter's-algorithm sort.
//
// That also RETIRES two compensations this backend needs when it is blitting
// flat: the per-character camera (the real one frames everyone) and the
// micro-parallax yaw, which exists only to fake what a moving camera does for
// free. `poseInstance` therefore drops the parallax layer and keeps the ones
// that are art direction rather than compensation — on-twos sampling, aim,
// look-at, flinch, the turnaround, foot IK, breath.
export const scene3d = {
  kind: "object",
  ready: () => ready,
  /** A private posable copy of this character's rig for one fighter. */
  instance(charKey, instanceId) {
    return ready && rigs.hasRig(charKey) ? rigs.acquireInstance(charKey, instanceId) : null;
  },
  releaseExcept(live) {
    if (ready) rigs.releaseInstancesExcept(live);
  },
  /** Pose an instance for this frame. `opts` carries facing and the aim
   *  point, exactly as drawCharFrame receives them. */
  poseInstance(inst, charKey, animKey, animTime, opts = {}) {
    const D = pose.DIALS;
    const facing = opts.facing ?? 1;
    const aim = opts.aim || null;
    const chestY = (opts.chestY ?? 0);
    const targetPx = headHeightTarget(charKey);
    // The camera hands over the chest line; the reach offsets are measured
    // from the FOOT line, so derive it when it is not passed.
    const footY = opts.y ?? chestY + targetPx * comFrac(charKey);
    const x = opts.x ?? 0;
    const pitch = aim ? aimPitch(x, chestY, aim, facing) : 0;
    const solved = aimSolve(x, footY, chestY, aim, facing, animKey, artReach(charKey));
    const resolved = rigs.resolveClip(charKey, animKey);
    if (!resolved) return false;
    const beat = beatOverride(animKey, opts);
    pose.poseRig(inst, animKey, pose.sampleTime(animKey, animTime, beat), resolved.clip, {
      charKey,
      beat,
      blend: blendLayer(charKey, animKey, animTime, opts),
      aimRad: D.aim && aimable(animKey) ? pitch : 0,
      reach: solved ? { dx: solved.dx, dy: solved.dy, targetPx } : null,
      lookRad: D.lookAt && pose.LOOK_STATES.has(clipNameFor(animKey)) ? pitch : 0,
      flinch: pose.flinchSide(animKey, opts.x ?? 0, aim, facing),
      // In a real 3D scene facing is ALWAYS a yaw — there is no mirror to fall
      // back on, and a negative scale would invert the winding. But it is a
      // yaw to ±¾, not 0 and 180°: this camera is head-on, so the fighter has
      // to carry the three-quarter the flat path gets from its lens position,
      // and carry it mirrored. See scene.sceneFacingYaw for why the pair that
      // used to be here pointed one facing at the lens and the other away.
      turnYawRad: scene.sceneFacingYaw(facing,
        pose.presentDegFor(animKey, clipTime(animKey, animTime), beat)),
      facing,
      // No `presentMirror`: ±¾ IS the mirror here, exactly and by
      // construction. See pose.facingYaw.
    });
    return true;
  },
  /** The stage-derived key/rim colours, so the camera's own light rig agrees
   *  with the one the flat path renders under. */
  lightTint: () => scene.stageLightTint(),
  /** Outline width is authored in blitted pixels; in-scene it has to become a
   *  LOCAL displacement, since the instance is uniformly scaled to game size.
   *  local = px * heightM / onScreenHeightPx, applied by outline.js. */
  setOutlineScale(root, heightM, onScreenPx) {
    outline.setWorldWidth(root, onScreenPx > 0 ? heightM / onScreenPx : 0);
  },
};

export function drawCharFrame(ctx, charKey, frameKey, x, y, opts = {}) {
  const m = typeof frameKey === "string" ? TOKEN.exec(frameKey) : null;
  if (!m || !hasModel(charKey)) {
    // Not our token (sprite fighter, or a trail ghost recorded before the
    // rig existed) — the sprite renderer owns it.
    return spriteDraw(ctx, charKey, frameKey, x, y, opts);
  }
  const [, animKey, t] = m;
  const animTime = parseFloat(t);
  try {
    const layers = liveLayers(charKey, animKey, x, y, opts);
    layers.blend = blendLayer(charKey, animKey, animTime, opts);
    const rig = rigs.getRig(charKey);
    const resolved = rigs.resolveClip(charKey, animKey);
    const entry = scene.renderPose(charKey, animKey, animTime, rig, resolved, layers);
    if (entry) return blit.blitPose(ctx, entry, charKey, x, y, opts);
  } catch (err) {
    warnOnce(`render:${charKey}`, `render3d: rendering ${charKey}/${animKey} failed (${err.message}) — drawing their sprites instead.`);
  }
  // Model path came up empty: re-derive the sprite frame from the token and
  // draw that; only if the sprite also fails does render.js paint the
  // missing-art placeholder.
  return spriteDraw(ctx, charKey, spriteFrame(charKey, animKey, animTime), x, y, opts);
}
