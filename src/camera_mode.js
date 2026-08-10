// The seam between the flat renderer and the 2.5D camera (docs/2.5d-camera-plan.md).
//
// `?camera=3d` puts the scene — backdrop, platforms, fighters, projectiles —
// on a WebGL canvas under the game canvas, with a perspective camera doing the
// framing. Everything else about the game is untouched: the simulation, the
// blast zones, `updateCamera()` and the flat renderer all keep running exactly
// as they do today, and flat mode never loads a byte of the 3D module.
//
// This file is the only thing both sides import. It is deliberately tiny and
// three.js-free: render.js asks it which mode is on and which module to hand
// the frame to, main.js flips it after the lazy import succeeds, and stage
// gimmicks poke `cameraCue` without knowing whether anyone is listening.

/** "flat" | "3d". Flat is the default and the fallback — a missing WebGL
 *  context or a failed import must leave the game exactly as it ships. */
export let cameraMode = "flat";

/** The loaded src/render3d/index.js module, once `enable3dCamera` has run. */
export let render3d = null;

/** Called by main.js after the lazy import of the 3D module succeeds AND the
 *  module got a WebGL context. From the next frame on, render.js routes the
 *  scene through `render3d` instead of drawing it itself. */
export function enable3dCamera(module) {
  render3d = module;
  cameraMode = "3d";
}

// ---------------------------------------------------------------- camera cues
//
// Stage gimmicks (stage_fx.js) can nudge the camera when their hazard fires —
// Curse Maw's fang snap, Billboard Roof's lightning. They call `cameraCue`
// unconditionally; in flat mode (or before the rig exists) nobody is
// listening and the call is a no-op, which is the feature detection the plan
// asks for: stage_fx.js needs no knowledge of which mode is running.

let cueHandler = null;

/** The rig registers itself here. */
export function setCameraCueHandler(fn) {
  cueHandler = fn;
}

/** Nudge the 3D camera, if there is one. `name` is a treatment the rig knows
 *  (see CUES in config_camera.js); `strength` scales it, default 1. */
export function cameraCue(name, strength = 1) {
  if (cueHandler) cueHandler(name, strength);
}
