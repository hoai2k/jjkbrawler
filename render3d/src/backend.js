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
import { cycleInfo, aimPitch, aimable, clipNameFor } from "../../billboards/src/states.js";
import { headHeightTarget } from "../../src/heights.js";
import { state } from "../../src/state.js";
import { WORLD } from "../../src/constants.js";

let ready = false;
let initFailed = false;
let rigs = null;   // ./loader.js
let scene = null;  // ./scene.js
let pose = null;   // ./pose.js
let blit = null;   // ./blit.js

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
    const [three, loaderMod, rigMod, poseMod, sceneMod, blitMod] = await Promise.all([
      import("../../vendor/three/three.module.js"),
      import("../../vendor/three/loaders/GLTFLoader.js"),
      import("./loader.js"),
      import("./pose.js"),
      import("./scene.js"),
      import("./blit.js"),
    ]);
    rigs = rigMod;
    pose = poseMod;
    scene = sceneMod;
    blit = blitMod;
    pose.initPose(three);
    scene.initScene(three);

    // MANNEQUIN BY DEFAULT. Picking `?render=3d` is a request to see this
    // backend work; falling every un-delivered fighter through to sprites
    // would show the sprite renderer, which `?render=sprite` already shows
    // better. So with no rigs delivered the whole roster stands in as the
    // proof body — live-animated, toon-shaded, outlined — and a delivered rig
    // simply displaces its mannequin when it lands.
    //
    //   ?render=3d                   mannequins everywhere a rig is missing
    //   ?render=3d&mannequin=gojo    only Gojo stands in; everyone else sprites
    //   ?render=3d&mannequin=none    no stand-ins — the old sprite fallthrough
    //
    // Sprite fallthrough remains the FAILURE path (a rig that will not load, a
    // pose that throws), which is a different thing from an empty roster.
    const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    const raw = (params.get("mannequin") ?? "all").trim();
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
  const chestY = y - headHeightTarget(charKey) * 0.55;
  const pitch = aim ? aimPitch(x, chestY, aim, facing) : 0;
  return {
    aimRad: D.aim && aimable(animKey) ? pitch : 0,
    lookRad: D.lookAt && pose.LOOK_STATES.has(clipNameFor(animKey)) ? pitch : 0,
    flinch: pose.flinchSide(animKey, x, aim, facing),
    turnYawRad: D.turnaround && facing < 0 ? Math.PI : 0,
    parallaxDeg: pose.parallaxDeg(x, state.camera?.x ?? WORLD.w / 2, WORLD.w / 2),
  };
}

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
