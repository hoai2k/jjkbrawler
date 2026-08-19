// PUTTING A SHARED DRAWING ON A CANVAS — the one transform, for all of them.
//
// A shared drawing is painted in three places: the game, the sprite workbench's
// still viewer, and the workbench's action player. Each was rebuilding the same
// five-line transform by hand — translate to the point, mirror if it travels or
// if the caster faces right, apply the drawing's standing tilt, then draw it
// with its nudge, offset by the anchor — and each got a different part of it
// wrong at some point:
//
//   the player   painted every drawing OVER the fighter, where the game paints
//                every one of them behind.
//   the viewer   did not mirror a drawing whose move type it had not been told
//                about, so a staff pointed one way there and the other way in
//                the player.
//   four sites   dropped the tilt entirely: `rotationDeg` was stored, shown in
//                the workbench, and never drawn.
//
// None of those is a hard bug to fix once seen. The point of this file is that
// they were all the same bug, repeated because the transform was written down
// thirty-one times.
//
// THE ORDER IS render.js's ORDER, and it is not arbitrary:
//
//   1. translate to the spawn point
//   2. rotate by the ACTION's own angle — a shot turning into its flight path
//   3. mirror — after the flight angle, so the two compose the way a thrown
//      thing really looks, and BEFORE the drawing is placed, so a nudge follows
//      the picture instead of reversing when it travels the other way
//   4. rotate by the DRAWING's standing tilt (`rotationDeg`), which is a
//      correction to the art rather than anything the action does
//   5. draw, offset by the anchor and the nudge
//
// Anything a caller needs that is not in that list — an additive glow, a
// per-frame pulse, a second pass for a flash — is still the caller's, and the
// options below are the ones that turned out to be shared by more than one.

import { sharedAdjust } from "./shared_sprites.js";

/** For a caller that has already translated the context to the spawn point —
 *  a creature's sway, a hazard's wobble — and wants the rest of the transform. */
export const ORIGIN = { x: 0, y: 0 };

/** Where the drawing sits relative to the point, as a multiple of its height:
 *  painted around it, standing on it, or hung from it. */
const TOP_FOR = { centre: -0.5, feet: -1, top: 0 };

/**
 * The numbers the transform is made of, for a painter that cannot use the
 * canvas one: the 2.5D scene builds the same chain out of matrices, and the
 * workbench needs the rectangle without the picture. Everything below is
 * derived here so there is still only one place that knows the order.
 *
 * @returns { w, h, rot, mirrored, ox, oy } — `ox`/`oy` are where the drawing's
 *   own top-left corner goes AFTER the rotation and the mirror have been
 *   applied, so a caller composes: translate(at) · rotate(rot) · mirror ·
 *   translate(ox, oy) · draw at w × h.
 */
export function sharedPlacement(key, img, height, opts = {}) {
  const adj = opts.adjust || sharedAdjust(key);
  const w = img.width * height / img.height;
  const nudge = opts.nudgeScale ?? 1;
  return {
    w, h: height, rot: adj.rot || 0, mirrored: !!opts.mirrored,
    ox: -w / 2 + adj.dx * nudge,
    oy: (TOP_FOR[opts.anchor] ?? TOP_FOR.centre) * height + adj.dy * nudge,
  };
}

/**
 * @param ctx      the 2D context, in whatever space the caller is working in
 * @param key      the shared sprite key, for its stored nudge and tilt
 * @param img      the loaded image (callers check for it; this returns quietly)
 * @param at       { x, y } the point the game spawns it on
 * @param height   how tall to paint it — already through `paintedHeight`
 * @param opts
 *   anchor     "centre" (default) | "feet" | "top"
 *   mirrored   flip horizontally: travelling right, or a right-facing caster
 *   rotation   the ACTION's own angle in radians (a shot's flight path)
 *   alpha      multiplied into whatever the caller has set
 *   shadow     { color, blur } for the glow most effects carry
 *   composite  a globalCompositeOperation for the additive ones
 *   spin       an angle applied WITH the drawing's own tilt, after the mirror —
 *              a cloud swirling in place, as against `rotation`, which is the
 *              path the whole thing is travelling along
 *   nudgeScale multiply the drawing's dx/dy — for art drawn at a perspective
 *              size, where a correction measured at full size would throw it
 *              off its own path
 *   adjust     an adjustment to use INSTEAD of the stored one, for the
 *              workbench's unsaved edits
 */
export function paintShared(ctx, key, img, at, height, opts = {}) {
  if (!img || !(height > 0)) return;
  const { w, h, rot, mirrored, ox, oy } = sharedPlacement(key, img, height, opts);
  ctx.save();
  if (opts.composite) ctx.globalCompositeOperation = opts.composite;
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (opts.shadow) {
    ctx.shadowColor = opts.shadow.color;
    ctx.shadowBlur = opts.shadow.blur ?? 12;
  }
  ctx.translate(at.x, at.y);
  if (opts.rotation) ctx.rotate(opts.rotation);
  if (mirrored) ctx.scale(-1, 1);
  // The drawing's own tilt and whatever the action spins it by turn about the
  // same point, so they add: a spiral that turns and leans does both at once.
  if (rot || opts.spin) ctx.rotate(rot + (opts.spin || 0));
  ctx.drawImage(img, ox, oy, w, h);
  ctx.restore();
}

/** The same placement, without drawing: where the drawing's own top-left corner
 *  lands, for a caller that needs the rectangle rather than the picture (the
 *  workbench's boxes and handles). Untilted and unmirrored, which is what a
 *  hit box and a drag handle want. */
export function sharedRect(key, img, at, height, opts = {}) {
  if (!img || !(height > 0)) return null;
  const { w, h, ox, oy } = sharedPlacement(key, img, height, opts);
  return { x: at.x + ox, y: at.y + oy, w, h };
}
