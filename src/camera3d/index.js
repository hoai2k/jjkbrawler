// Scene setup and per-frame entry for the 2.5D camera (`?camera=3d`).
//
// Loaded lazily by main.js — flat mode never imports this file, so it pays
// zero bytes and zero startup cost, and the no-dependency property of the
// default game stays literally true (three.js is only fetched here).
//
// Draw flow in 3d mode (render.js drives it):
//   rig.update(state)      consumes the same cam.x/y/zoom/shake/kick
//   render3d.draw(state)   WebGL: backdrop, platforms, fighter quads, projectiles
//   ...then render.js draws everything else on the transparent top canvas,
//   positioned by the rig's overlay projection.

import { Scene, WebGLRenderer, SRGBColorSpace } from "../../vendor/three/three.module.js";
import {
  camera, updateRig, overlayTransform, worldToScreen,
  resetRig as resetRigState,
} from "./rig.js";
import { makeSimGroup, updatePlatforms, makeBackdrop, updateBackdrop } from "./stage_geo.js";
import { makeBillboards } from "./billboards.js";
import { makeGarnish } from "./garnish.js";
import { WORLD } from "../constants.js";

export { worldToScreen, overlayTransform };

/** What the last frame actually drew, for tools/smoke_camera3d.mjs. A scene
 *  that renders nothing throws no errors, so "no page errors" alone is not
 *  evidence the mode works — these counts are. */
export function debugStats() {
  return {
    quads: billboards ? billboards.count() : 0,
    garnish: garnish ? garnish.count() : 0,
    camera: camera.position.toArray(),
    fov: camera.fov,
  };
}

let renderer = null;
let scene = null;
let simGroup = null;
let backdrop = null;
let billboards = null;
let garnish = null;

/** Between matches: the rig's smoothed framing and every garnish card go back
 *  to nothing, so a new board does not inherit the last one's sky. */
export function resetRig() {
  resetRigState();
  garnish?.reset();
}

/** Create the WebGL context and the scene skeleton. Returns false when WebGL
 *  is unavailable — the caller runs flat, never a broken screen. */
export function initRender3d() {
  const canvas = document.getElementById("glCanvas");
  if (!canvas) return false;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true });
  } catch {
    return false;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x05070f, 1);

  scene = new Scene();
  backdrop = makeBackdrop();
  scene.add(backdrop);
  simGroup = makeSimGroup();
  scene.add(simGroup);
  billboards = makeBillboards();
  simGroup.add(billboards.group);
  // In the sim group with the billboards: cards position in sim pixels like
  // everything else, and the group's z scale is 1, so a card's depth is
  // written in world units directly.
  garnish = makeGarnish();
  simGroup.add(garnish.group);

  resize();
  window.addEventListener("resize", resize);
  return true;
}

/** Mirror of main.js resizeCanvas for the GL canvas: backing store at DPR,
 *  aspect fixed by the CSS letterbox exactly as the 2D canvas is. */
export function resize() {
  if (!renderer) return;
  const canvas = renderer.domElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  renderer.setPixelRatio(dpr);
  renderer.setSize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), false);
  camera.aspect = WORLD.w / WORLD.h;
  camera.updateProjectionMatrix();
}

let lastDrawAt = 0;

/** One frame: pose the rig from state.camera, refresh the scene from state,
 *  render. Called from render.js before the overlay draws. Keeps its own
 *  clock so the render.js call site stays signature-identical to flat mode. */
export function draw(st) {
  const now = performance.now();
  const dt = Math.min(Math.max((now - lastDrawAt) / 1000, 0), 1 / 30);
  lastDrawAt = now;
  updateRig(st, dt);
  updatePlatforms(scene, st.platforms);
  updateBackdrop(backdrop, st, camera.position.z, camera.fov);
  billboards.update(st);
  garnish.update(st, dt);
  renderer.render(scene, camera);
}
