// The seam between the flat renderer and the 2.5D camera (docs/2.5d-camera-plan.md).
//
// THE 2.5D CAMERA IS THE GAME. main.js loads it unless `?camera=flat` says
// otherwise: it puts the scene — backdrop, platforms, fighters, projectiles —
// on a WebGL canvas under the game canvas, with a perspective camera doing the
// framing. Everything else is untouched: the simulation, the blast zones and
// `updateCamera()` all run exactly as they do flat, and flat mode never loads a
// byte of the 3D module.
//
// THE FLAT RENDERER IS NOT THE OLD DEFAULT, and reading it as one is how a
// feature ships invisible. It survives for two jobs and neither is "what a
// player sees":
//
//   THE WORKBENCHES. The arena and character benches want a still, honest,
//   readable frame with no perspective in it — you cannot drag a platform onto
//   a mark that moves. They draw flat on purpose.
//
//   THE FALLBACK. No WebGL, or a failed import, lands here with a console note
//   rather than on a black screen.
//
// So a change to how the game LOOKS has to be made in, or at least verified
// through, the 2.5D path. Clothing FX was written and tested entirely against
// the flat one — every check passed, the arena bench showed it working, and no
// player ever saw it (src/char_frame.js has the full story).
//
// This file is the only thing both sides import. It is deliberately tiny and
// three.js-free: render.js asks it which mode is on and which module to hand
// the frame to, main.js flips it after the lazy import succeeds, and stage
// gimmicks poke `cameraCue` without knowing whether anyone is listening.

/** "flat" | "3d". Flat is the STARTING value and the fallback, not the shipped
 *  mode: main.js switches to "3d" as soon as the lazy import succeeds, and a
 *  missing WebGL context or a failed import leaves it here rather than on a
 *  broken screen. `?camera=flat` opts into it deliberately. */
export let cameraMode = "flat";

/** The loaded src/camera3d/index.js module, once `enable3dCamera` has run. */
export let camera3d = null;

/** Called by main.js after the lazy import of the 3D module succeeds AND the
 *  module got a WebGL context. From the next frame on, render.js routes the
 *  scene through `camera3d` instead of drawing it itself. */
export function enable3dCamera(module) {
  camera3d = module;
  cameraMode = "3d";
}

// ---------------------------------------------------------------- camera cues
//
// Stage gimmicks (stage_fx.js) announce their big moments here — Curse Maw's
// fang snap, Billboard Roof's lightning, Crosswalk Rush's traffic. They call
// `cameraCue` unconditionally; in flat mode (or before the 3D scene exists)
// nobody is listening and the call is a no-op, which is the feature detection
// the plan asks for: stage_fx.js needs no knowledge of which mode is running.
//
// A LIST of listeners rather than one handler, because a cue is an event about
// the STAGE, not a message to the camera: the rig moves the lens on it, and
// the garnish layer spawns cards on it. Both want the same "the traffic is
// running now, going left" and neither should have to learn about the other.

const cueListeners = [];

/** Subscribe to stage cues. Both the rig and the garnish layer register here
 *  when the 3D scene is built. */
export function addCameraCueListener(fn) {
  cueListeners.push(fn);
}

/** Announce a stage moment, if anything is listening. `name` is a treatment
 *  the listeners know (see CUES in config_camera.js); `strength` scales it and
 *  carries a sign where direction matters (which way the wave is sweeping).
 *  Default 1. */
export function cameraCue(name, strength = 1) {
  for (const fn of cueListeners) fn(name, strength);
}
