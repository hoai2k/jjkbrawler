// The render3d backend — anime-style 3D models, animated LIVE at full frame
// rate, rendered toon-ramped and ink-outlined, and composited into the
// unchanged 2D game.
//
// Selected with `?render=3d` (aliases: `render3d`, `model`, `models`,
// `anime` — see src/render_backend.js). This is the sibling and heir of the
// billboard backend: same offscreen-render-to-blit pipe, same 26-state clip
// contract (imported from billboards/src/states.js, never copied), same
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
import { cycleInfo, aimPitch, aimSolve, aimable, clipNameFor } from "../../billboards/src/states.js";
import { headHeightTarget } from "../../src/heights.js";
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
    await rigs.initRigs(three, loaderMod.GLTFLoader, mannequin, CHARACTER_KEYS);

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
  return ready && rigs.hasRig(charKey);
}

export function modelCount() {
  return ready ? rigs.rigCount() : 0;
}

export function currentFrame(charKey, animKey, animTime) {
  if (hasModel(charKey)) return `r3d:${animKey}@${animTime.toFixed(4)}`;
  return spriteFrame(charKey, animKey, animTime);
}

export function cyclePhase(charKey, animKey, animTime) {
  if (hasModel(charKey)) return cycleInfo(animKey, animTime);
  return spriteCycle(charKey, animKey, animTime);
}

/** The live layers for this draw, every one quantised so it joins the pose
 *  cache key without exploding it (pose.js documents each dial). */
function liveLayers(charKey, animKey, x, y, opts) {
  const D = pose.DIALS;
  const facing = opts.facing ?? 1;
  const aim = opts.aim || null;
  const targetPx = headHeightTarget(charKey);
  const chestY = y - targetPx * 0.55;
  const pitch = aim ? aimPitch(x, chestY, aim, facing) : 0;
  // The reach half of the aim solution: where the strike has to land, in game
  // pixels from the fighter's own origin. Quantised by aimSolve so it can join
  // the cache key (poseToken) without making every frame of an approach a
  // unique pose.
  const solved = aimSolve(x, y, chestY, aim, facing, animKey, artReach(charKey));
  return {
    aimRad: D.aim && aimable(animKey) ? pitch : 0,
    reach: solved ? { dx: solved.dx, dy: solved.dy, targetPx } : null,
    lookRad: D.lookAt && pose.LOOK_STATES.has(clipNameFor(animKey)) ? pitch : 0,
    flinch: pose.flinchSide(animKey, x, aim, facing),
    // Derived from the camera, not 180° — see scene.turnaroundYaw. A flat
    // half-turn under a ¾ camera shows the fighter's back.
    turnYawRad: D.turnaround && facing < 0 ? scene.turnaroundYaw() : 0,
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
    const footY = opts.y ?? chestY + targetPx * 0.55;
    const x = opts.x ?? 0;
    const pitch = aim ? aimPitch(x, chestY, aim, facing) : 0;
    const solved = aimSolve(x, footY, chestY, aim, facing, animKey, artReach(charKey));
    const resolved = rigs.resolveClip(charKey, animKey);
    if (!resolved) return false;
    pose.poseRig(inst, animKey, pose.sampleTime(animKey, animTime), resolved.clip, {
      charKey,
      aimRad: D.aim && aimable(animKey) ? pitch : 0,
      reach: solved ? { dx: solved.dx, dy: solved.dy, targetPx } : null,
      lookRad: D.lookAt && pose.LOOK_STATES.has(clipNameFor(animKey)) ? pitch : 0,
      flinch: pose.flinchSide(animKey, opts.x ?? 0, aim, facing),
      // In a real 3D scene facing is ALWAYS the turnaround — there is no
      // mirror to fall back on, and a negative scale would invert the winding.
      // Here 180° IS right: the game's own camera looks down the stage
      // head-on, so a half-turn keeps the fighter's front to the lens. It is
      // the FLAT path's fixed ¾ camera that needs scene.turnaroundYaw().
      turnYawRad: facing < 0 ? Math.PI : 0,
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
