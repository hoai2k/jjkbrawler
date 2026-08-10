// The billboard backend — 2.5D characters, STUBBED.
//
// Nothing here draws a model yet. This is the shape the real one will have,
// wired far enough into the game that `?render=billboard` is a thing you can
// load and watch fail honestly, rather than a plan in a document.
//
// ---------------------------------------------------------------------------
// THE IDEA
//
// Render each fighter's posed 3D model to an offscreen canvas, then blit that
// canvas into the 2D world exactly where the sprite would have gone. The game
// stays 2D. Everything that makes the scene work — the camera, the y-sorted
// draw order, shadows, strike arcs, stage effects, domain overlays, hitboxes —
// is untouched, because from render.js's point of view a character is still a
// rectangle of pixels drawn at (x, y) with a facing and a scale.
//
// The alternative, moving the whole scene into a 3D engine, throws away
// stage_fx.js, domains.js, ultimates.js and every hand-tuned layering decision
// in draw(). That is not 2.5D, it is a rewrite. This backend exists so it never
// has to be one.
//
// A consequence worth stating: the choice is PER CHARACTER, not per build. A
// fighter with no model can fall through to the sprite backend and stand in the
// same match as one with a model. See `hasModel` below — that fallthrough is
// why this file imports the sprite backend rather than replacing it.
//
// ---------------------------------------------------------------------------
// WHAT IS LEFT TO BUILD
//
//   1. Model loading. `billboards/assets/<char>/` — glTF plus a clip per
//      animation state. The state names are not ours to choose: they are the
//      keys of DEFAULT_ANIMS in src/characters.js (idle, run, dash, jump, fall,
//      land, hurt, crouch, crouchAttack, shield, ledge, dodge_roll, dodge_air,
//      light, airLight, sideHeavy, upHeavy, downHeavy, charge, specialNeutral,
//      specialSide, specialDown, ult, dizzy — about 25). A model that does not
//      answer all of them is a model with holes in its move set.
//
//   2. A pose cache. `currentFrame` is called every frame for every fighter and
//      must stay cheap. Sampling a clip at a time and rendering it is not; the
//      token this returns should identify a POSE, so identical poses across
//      frames and across fighters hit the same rendered texture.
//
//   3. The WebGL context and the blit. One offscreen renderer shared by every
//      fighter, drawn into the 2D context by the same transform arithmetic
//      sprites.js already does — foot line at (x, y), mirrored by facing,
//      rotated about the centre of mass.
//
//   4. Answers for `bodyWidth` (src/silhouette.js) and `headHeightTarget`
//      (src/heights.js). Those are gameplay numbers measured off the artwork,
//      and today they are measured off sprite silhouettes baked into the
//      manifest. A model has to answer them from its own bounds or every
//      hitbox on a 2.5D fighter is quietly wrong. This is the seam the render
//      backend deliberately does NOT cover — see the note in
//      src/render_backend.js.
//
// Until 1-3 exist, every character reports no model and draws as a sprite, so
// `?render=billboard` plays exactly like `?render=sprite`. That is the intended
// stub behaviour: a backend that is registered and honest, not one that paints
// an empty screen.

import {
  drawCharFrame as spriteDraw,
  currentFrame as spriteFrame,
  cyclePhase as spriteCycle,
} from "../../sprites/src/sprites.js";

/** Characters with a usable 3D model. Empty while the pipeline is a stub, and
 *  consulted per draw — which is what lets one rigged fighter share a match
 *  with a roster of sprites instead of waiting for all 28. */
const MODELS = new Map();

/** True once `charKey` has a model loaded and posable. */
export function hasModel(charKey) {
  return MODELS.has(charKey);
}

/** How many characters this backend can actually draw. Reported at boot so
 *  "billboard mode looks identical" is explained rather than mysterious. */
export function modelCount() {
  return MODELS.size;
}

// Every entry point below falls through to the sprite backend for a character
// with no model. That fallthrough is not temporary scaffolding to be deleted
// when the models land — it is how a partially-modelled roster works, and it is
// the reason the stub is playable at all.

export function currentFrame(charKey, animKey, animTime) {
  // A model backend would return a pose token here — a clip name plus a
  // quantised time, say. The game treats this as opaque and hands it straight
  // back to drawCharFrame, so the two only have to agree with each other.
  return spriteFrame(charKey, animKey, animTime);
}

export function cyclePhase(charKey, animKey, animTime) {
  // Run sway and footfall bob are driven off this (src/motion.js). A model's
  // own run clip carries that motion, so this is likely to report the clip's
  // phase rather than a frame count once the models are real.
  return spriteCycle(charKey, animKey, animTime);
}

export function drawCharFrame(ctx, charKey, frameKey, x, y, opts) {
  if (!hasModel(charKey)) return spriteDraw(ctx, charKey, frameKey, x, y, opts);
  // Unreachable while MODELS is empty. When it is not: pose the model, render
  // it to the offscreen target, and blit here — returning false if that fails,
  // so render.js draws its missing-art placeholder instead of leaving an
  // invisible fighter on the stage.
  return spriteDraw(ctx, charKey, frameKey, x, y, opts);
}
