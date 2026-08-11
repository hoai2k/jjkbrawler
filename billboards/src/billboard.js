// The billboard backend — 2.5D characters: posed 3D models rendered to a
// texture and blitted into the same 2D world the sprites draw in.
//
// Selected with `?render=billboard` (or `billboards` — see the aliases in
// src/render_backend.js). Everything heavy — the vendored three.js, the rigs,
// the offscreen renderer — loads through dynamic import() from init(), which
// render_backend calls only when this backend is chosen: a player on the
// sprite path never downloads a 3D engine.
//
// PER-CHARACTER FALLTHROUGH. A character with no rig draws their sprites,
// inside the same match as one with a rig. That is the rollout model, not a
// stopgap: models land one fighter at a time (billboards/docs/asset-requests.md)
// and every unanswered character keeps playing exactly as before. It is also
// the failure model — a rig that fails to load, or a pose that fails to
// render, warns once and falls through, because a fighter drawn as their
// sprite is strictly better than a fighter drawn as nothing.
//
// THE MANNEQUIN. `?render=billboard&mannequin=all` (or `&mannequin=gojo,yuji`)
// registers the grey proof figure for those characters — the B0 harness that
// exercises the whole pipeline with no delivered art. It never displaces a
// delivered rig.
//
// TOKENS. currentFrame returns `bb:<animKey>@<animTime>` for rigged
// characters. The game treats frame tokens as opaque (it stores them on the
// afterimage trail and hands them back), so the token carries everything
// drawCharFrame needs to re-pose the model — including for trail ghosts drawn
// a dozen sim-ticks after the fighter moved on. A token that is NOT ours
// (recorded before a rig registered, or belonging to a sprite fighter) falls
// through to the sprite renderer, which knows what to do with it.
//
// GAMEPLAY is untouched here by design: hurtboxes, reach and height stay
// sprite-derived on every backend (decided in ../docs/plan.md), so a matchup
// plays identically however it is drawn.

import {
  drawCharFrame as spriteDraw,
  currentFrame as spriteFrame,
  cyclePhase as spriteCycle,
} from "../../sprites/src/sprites.js";
import { cycleInfo, aimSolve } from "./states.js";
import { headHeightTarget } from "../../src/heights.js";
import { artReach } from "../../src/silhouette.js";

let ready = false;
let initFailed = false;
let rigs = null;      // ./rig.js module
let renderer = null;  // ./renderer.js module
let blit = null;      // ./blit.js module

const TOKEN = /^bb:([^@]+)@(-?[\d.]+)$/;
const warned = new Set();
function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

/** Called by render_backend when this backend is selected. Loads the engine,
 *  the manifest and the approved rigs; failure downgrades every character to
 *  sprites (loudly) rather than blanking the game. */
export async function init() {
  if (ready || initFailed) return;
  try {
    const [three, loaderMod, rigMod, rendererMod, blitMod] = await Promise.all([
      import("../../vendor/three/three.module.js"),
      import("../../vendor/three/loaders/GLTFLoader.js"),
      import("./rig.js"),
      import("./renderer.js"),
      import("./blit.js"),
    ]);
    rigs = rigMod;
    renderer = rendererMod;
    blit = blitMod;
    renderer.initRenderer(three);

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
      window.__billboards = window.__billboards || {};
      window.__billboards.ready = true;
      window.__billboards.rigged = rigs.rigCount();
    }
    console.log(`billboards: ready — ${rigs.rigCount()} rigged character(s), the rest draw sprites.`);
  } catch (err) {
    initFailed = true;
    console.warn(`billboards: init failed (${err.message}) — every character will draw sprites.`);
  }
}

export function hasModel(charKey) {
  return ready && rigs.hasRig(charKey);
}

export function modelCount() {
  return ready ? rigs.rigCount() : 0;
}

export function currentFrame(charKey, animKey, animTime) {
  if (hasModel(charKey)) return `bb:${animKey}@${animTime.toFixed(4)}`;
  return spriteFrame(charKey, animKey, animTime);
}

export function cyclePhase(charKey, animKey, animTime) {
  if (hasModel(charKey)) return cycleInfo(animKey, animTime);
  return spriteCycle(charKey, animKey, animTime);
}

// ------------------------------------------------- the 2.5D camera adapter
//
// Under `?camera=3d` this backend's native form is exactly what its name says:
// a CARD. Its whole identity is "pose a rig, render it once, cache the
// texture, draw it flat" — the quantised pose cache is the economics, and the
// fixed ¾ camera is the look. So in the camera's scene it stays a textured
// quad; it just gets the POSED-MODEL texture instead of a sprite sheet frame.
//
// (The render3d backend answers this question differently — it hands over the
// rig itself, because there the model really is live geometry. Same seam, two
// honest answers.)
export const scene3d = {
  kind: "texture",
  ready: () => ready,
  /** { canvas, heightM, rowsPerMetre } for the pose, or null to fall back. */
  poseTexture(charKey, animKey, animTime, opts = {}) {
    if (!hasModel(charKey)) return null;
    try {
      // Same aim solution the flat blit uses, so a strike reaches its target
      // identically whether the scene is drawn flat or through the 2.5D
      // camera. The camera hands us the chest line; the foot line is what the
      // reach offsets are measured from, so derive it when not given.
      const targetPx = headHeightTarget(charKey);
      const x = opts.x ?? 0;
      const chestY = opts.chestY ?? 0;
      const footY = opts.y ?? chestY + targetPx * 0.55;
      // No aim is not "no solve" any more: an unaimed strike still has to go
      // somewhere, and that somewhere is straight ahead at chest height.
      const aim = aimSolve(x, footY, chestY, opts.aim || null, opts.facing ?? 1,
        animKey, artReach(charKey));
      return renderer.renderPose(charKey, animKey, animTime, rigs.resolveClip, aim, targetPx);
    } catch (err) {
      warnOnce(`scene:${charKey}`, `billboards: posing ${charKey}/${animKey} for the 2.5D camera failed (${err.message}) — drawing their sprites instead.`);
      return null;
    }
  },
};

export function drawCharFrame(ctx, charKey, frameKey, x, y, opts = {}) {
  const m = typeof frameKey === "string" ? TOKEN.exec(frameKey) : null;
  if (!m || !hasModel(charKey)) {
    // Not our token (sprite fighter, or a trail ghost recorded before the rig
    // existed) — the sprite renderer owns it.
    return spriteDraw(ctx, charKey, frameKey, x, y, opts);
  }
  const [, animKey, t] = m;
  const animTime = parseFloat(t);
  try {
    // Strike aiming: render.js passes `opts.aim` — the controller's explicit
    // point when the fighter has one, else the nearest opponent. The solution
    // carries both halves: the spine pitch that leans the body into the blow,
    // and the offsets the IK uses to put the hand ON the target (ik.js). Only
    // aimable states react, and (x, y) is the foot line, which is what the
    // offsets are measured from.
    const targetPx = headHeightTarget(charKey);
    const chestY = y - targetPx * 0.55;
    const aim = aimSolve(x, y, chestY, opts.aim || null, opts.facing ?? 1,
      animKey, artReach(charKey));
    const entry = renderer.renderPose(charKey, animKey, animTime, rigs.resolveClip, aim, targetPx);
    if (entry) return blit.blitPose(ctx, entry, charKey, x, y, opts);
  } catch (err) {
    warnOnce(`render:${charKey}`, `billboards: rendering ${charKey}/${animKey} failed (${err.message}) — drawing their sprites instead.`);
  }
  // Model path came up empty: re-derive the sprite frame from the token and
  // draw that. Only if the SPRITE also fails does this report false and let
  // render.js paint the missing-art placeholder.
  return spriteDraw(ctx, charKey, spriteFrame(charKey, animKey, animTime), x, y, opts);
}
