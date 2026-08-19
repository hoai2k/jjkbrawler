// EDITING A SHARED DRAWING — the viewer for an effect, a summon or a stage
// hazard, and everything hung off it.
//
// A pose is placed inside its own cell and the bench moves it there. A shared
// drawing has no cell: the code that SPAWNS it decides where it goes, how big
// it is and which way it faces, so what this panel edits is a correction to
// that — a nudge off the spawn point, a standing tilt, a size relative to the
// fighter beside it — plus the two regions a move collides on.
//
// Everything on this canvas is placed through src/shared_paint.js, the same
// function the game and the action player paint through. That is the whole
// point of the module: when the viewer built the transform itself, it drifted
// from the game, and the drift was invisible until somebody noticed a staff
// pointing the wrong way.
//
// Layer: above bench_state.js and bench_model.js, below workbench.js. It draws
// on the bench's canvas and reads the bench's state, and the two things it
// cannot do for itself — rebuild the panel after an edit, repaint the whole
// canvas — arrive at boot as hooks, so nothing here imports a panel.

import { getImage } from "../../src/assets.js";
import { drawCharFrame } from "../src/sprites.js";
import { sharedSpriteInfo, sharedHit, paintedHeight } from "../../src/shared_sprites.js";
import { paintShared, sharedPlacement, sharedRect } from "../../src/shared_paint.js";
import { bodyMetrics } from "../../src/silhouette.js";
import { spawnOffset } from "../../src/muzzle.js";
import { HEIGHT_BASE_PX } from "../../src/config_tuning.js";
import { frameLoaded } from "./lazy_sprites.js";
import {
  $, canvas, ctx, canvasCentreX, GROUND_Y, HANDLE_R, OTHER_KEY, round1, state,
} from "./bench_state.js";
import {
  actorOf, sharedOwner, sharedUsage, installColorOf, rawMeta, remember, drawableSharedKey,
  pushHistory, sharedControls, attackBoxKey,
} from "./bench_model.js";

/** Rebuilding the panel and repainting the canvas belong to workbench.js; this
 *  module asks for them by name rather than importing them, which is what keeps
 *  the dependency pointing one way. Set once, at boot. */
let hooks = { afterEdit: () => {}, repaint: () => {} };
export function initSharedArt(next = {}) {
  hooks = { ...hooks, ...next };
}

/** A shared effect/summon sprite, drawn at the height the game draws it where
 *  that is known, and at its own pixel height where it is not. Nothing here is
 *  adjustable — the point is to see the art as it appears in a match. */
export const sharedTried = new Set();

export function drawSharedSprite(cx) {
  const img = getImage(drawableSharedKey(state.frame));
  if (!img) {
    const done = sharedTried.has(state.frame);
    ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(done ? "not delivered yet" : `loading ${state.frame}…`, cx, GROUND_Y - 150);
    if (done) {
      ctx.font = "500 11px Inter, sans-serif";
      ctx.fillText(state.frame, cx, GROUND_Y - 130);
    }
    ctx.textAlign = "left";
    return;
  }
  const v = sharedView();
  if (!v) return;
  const { h, px, py } = v;

  // THE SAME FUNCTION THE GAME PAINTS THROUGH (src/shared_paint.js), given the
  // adjustment being edited rather than the stored one: to the point, mirror if
  // it travels, then the drawing's own tilt, then the picture with its nudge.
  // This canvas used to rebuild that chain by hand, which is how it came to
  // disagree with the action player about which way a staff points.
  //
  // An aura is an additive glow with the install's colour bleeding off its
  // edge, and it was once shown here as a flat opaque plate. Two different
  // pictures: the plate reads as a hard-edged shape you would align by its
  // bounding box, and the thing the player sees has no edge at all.
  const place = sharedPlace(v);
  paintShared(ctx, state.frame, img, { x: px, y: py }, h, v.can?.kind === "aura"
    ? { ...place, composite: "lighter", alpha: 0.72,
        shadow: { color: installColorOf(state.frame), blur: 18 * v.z } }
    : place);
  // The box is an annotation rather than part of the drawing — painted after,
  // so it never picks up the aura's blend and stops being readable on exactly
  // the art that needs it, and off the same numbers, so it cannot come to
  // describe a rectangle the picture is not in.
  if ($("showBox").checked) {
    const box = sharedPlacement(state.frame, img, h, place);
    ctx.save();
    ctx.translate(px, py);
    if (box.mirrored) ctx.scale(-1, 1);
    if (box.rot) ctx.rotate(box.rot);
    ctx.strokeStyle = "rgba(255, 120, 160, 0.8)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(box.ox, box.oy, box.w, box.h);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // The drawing is too big for the viewer and everything on the canvas has been
  // shrunk to hold it. Said out loud because the alternative is a slider that
  // appears to do nothing: once the fit is active, Size is spent entirely on
  // making the view smaller, and the picture sits at the same height however
  // far it is pushed. The Zoom control is the way out, so it is named here.
  if (v.fitted || v.overflows) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 210, 140, 0.85)";
    ctx.font = "500 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(v.fitted
      ? `nothing declares this one's size — fitted to ${Math.round(v.z / state.zoom * 100)}% of Zoom, `
        + "reference included. Size is relative here."
      : "taller than the viewer — drawn full size against the reference. Lower Zoom to see all of it.",
      canvasCentreX(), GROUND_Y + 34);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- attack box
//
// A creature's HURT box is the whole drawing and is measured, so there is
// nothing to place. What it hits WITH is a different shape and always was: a
// dog bites with its head, and a tail that deals 6.5% is a bug you can only see
// by playing. Fighters have had the two separate from the start; this is where
// a creature's gets placed.
//
// Stored as fractions of the drawing (`attackBox` in `otherSprites`, read by
// sharedAttack in src/shared_sprites.js) so it travels with the art: rescale
// the creature here or redraw it bigger and the bite stays on the mouth.

/** The default the game uses when nobody has placed one — kept in step with
 *  DEFAULT_ATTACK in src/summons.js. Shown as a starting point rather than as
 *  an empty canvas, so placing one is an edit rather than an invention. */
export const DEFAULT_ATTACK_BOX = { x: 0.28, y: 0.52, w: 0.44, h: 0.76 };

/** Whether this drawing is a creature whose attack box can be placed: a
 *  creature stands on its feet and has a measured hurt box. A projectile's
 *  collision is its move's `r` and is not a shape anybody draws here. */
export function canPlaceAttack(key) {
  const can = sharedControls(key);
  // `bites` is the difference between a box the game reads and a box nothing
  // reads: a support creature hovers and shoots and never runs the contact
  // test, so offering it a bite to place would be offering an edit that cannot
  // reach the screen — the exact fault this panel keeps being fixed for.
  return !!(can?.used && can.measuredBox && can.anchor === "feet" && can.bites !== false);
}

/** The stored box, or the default, for the drawing on screen. */
export function attackBoxOf(key) {
  const stored = rawMeta(OTHER_KEY, attackBoxKey(key))?.attackBox;
  return { ...DEFAULT_ATTACK_BOX, ...(stored || {}) };
}

/** The drawn rectangle on the CANVAS, which the fractions are measured against:
 *  the same rectangle the game paints, at the workbench's zoom. */
export function drawnRectOnCanvas(key) {
  // The rectangle the art is ACTUALLY drawn in — size, nudge and view fit
  // included — rather than a second guess at it. A creature sized to 60% used
  // to keep its attack box on the 100% rectangle, which put the bite off the
  // head by the same amount the drawing had shrunk.
  const v = sharedView(key);
  if (!v || !Number.isFinite(v.h) || v.h <= 0) return null;
  // sharedRect, so it is the placement the paint uses rather than a second
  // reading of the same four numbers.
  return sharedRect(key, v.img, { x: v.px, y: v.py }, v.h, sharedPlace(v));
}

/** The attack box on the canvas, from the fractions. The art is drawn facing
 *  right here, which is the direction `x` is positive in. */
export function attackBoxOnCanvas(key) {
  const rect = drawnRectOnCanvas(key);
  if (!rect) return null;
  const box = attackBoxOf(key);
  // Measured from the DRAWING — forward from its middle, up from its feet —
  // which is where sharedAttack measures from, and no longer from the canvas
  // centre line and the ground: a creature painted off the ground line or
  // nudged aside took its box with it in game and left it behind here.
  const cx = rect.x + rect.w / 2 + box.x * rect.w;
  const cy = rect.y + rect.h - box.y * rect.h;
  return { x: cx - (box.w * rect.w) / 2, y: cy - (box.h * rect.h) / 2,
           w: box.w * rect.w, h: box.h * rect.h, rect };
}

export function drawAttackBox(key) {
  const b = attackBoxOnCanvas(key);
  if (!b) return;
  const held = state.dragAttack;
  ctx.save();
  ctx.fillStyle = held ? "rgba(255, 120, 120, 0.22)" : "rgba(255, 90, 90, 0.14)";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = held ? "rgba(255, 170, 170, 0.95)" : "rgba(255, 110, 110, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.setLineDash([]);
  // The corner that resizes it, bottom-right in canvas terms — the forward,
  // lower corner of the box, which is the one you reach for on a head.
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(b.x + b.w - HANDLE_R, b.y + b.h - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
  ctx.globalAlpha = 0.95;
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("attack box — drag to place, corner to size", b.x + b.w / 2, Math.max(12, b.y - 6));
  ctx.restore();
}

/** Write a changed attack box back onto the drawing's manifest entry. */
/** Move or resize a drawing's hit region. Same shape as setAttackBox below and
 *  for the same reasons — baseline first, undo point on the first change of a
 *  drag, and the pose list repainted because its dirty dot is feedback.
 *
 *  A correction that comes to nothing is REMOVED rather than stored as zeroes:
 *  an entry saying "moved by 0, scaled by 1" claims a decision nobody made, and
 *  the stamp/reset machinery would then carry it forward as one. */
export function setSharedHit(key, hit, start) {
  remember(OTHER_KEY, key);
  if (start) pushHistory(OTHER_KEY, key);
  const meta = rawMeta(OTHER_KEY, key);
  if (!meta) return;
  // ZERO IS A DECISION NOW, not an absence. No entry means "the circle sits on
  // the shot's own position"; `{0, 0, 1}` means "the circle sits on the
  // picture" — and those are different places the moment the picture has been
  // nudged anywhere. Dropping the entry at zero would have snapped the circle
  // off the art and back onto the spawn point. It is only really empty when the
  // drawing has no offset either, so the two readings coincide.
  const nudged = (meta.dx ?? 0) || (meta.dy ?? 0);
  const empty = !hit.dx && !hit.dy && !nudged
    && (hit.scale === 1 || hit.scale === undefined);
  if (empty) delete meta.hit;
  else meta.hit = { dx: hit.dx || 0, dy: hit.dy || 0, scale: hit.scale ?? 1 };
  hooks.afterEdit();
}

export function setAttackBox(rawKey, box, start) {
  const key = attackBoxKey(rawKey);
  // Take the baseline before the first change of a drag, the same as every
  // other edit does. Without it the box was compared against nothing, so it
  // could not be dirty, could not show its dot, and — because the export walks
  // the dirty list — could not be exported unless something else on the same
  // drawing happened to be edited too.
  remember(OTHER_KEY, key);
  if (start) pushHistory(OTHER_KEY, key);
  const meta = rawMeta(OTHER_KEY, key);
  if (!meta) return;
  const r3 = (v) => Number(v.toFixed(3));
  meta.attackBox = { x: r3(box.x), y: r3(box.y), w: r3(box.w), h: r3(box.h) };
  hooks.afterEdit();       // the dot in the list is part of the feedback
}

/** The move's own collision shape, drawn about the spawn point.
 *
 *  A bolt drawn twice the width of its `r` looks like it should clip somebody
 *  it passes straight through; a creature drawn half its `hitW` looks like it
 *  should be walked past. Neither is visible in the picture, and both are
 *  numbers the kit already declares — so the workbench can show them and the
 *  art can be matched to them instead of guessed at. Nothing here changes play:
 *  this is the game's shape, drawn, not a shape the workbench sets.
 *
 *  **It does not follow the spawn nudge, and — with one exception — it does not
 *  follow Size**, which is the useful part: the shape is a kit number, so
 *  moving the slider moves the picture against a fixed target and you can see
 *  when they agree. Marked `fixed` on the label, because a shape that held
 *  still could otherwise be mistaken for one that had not been re-drawn yet.
 *  The exception is a random drop, whose `h` is both the height it is painted
 *  at and the height of the box it lands in, so there the box does follow Size
 *  and says so. Contrast a FIGHTER's hurtbox, which is measured off the art and
 *  therefore always follows it.
 */
export function drawSharedHit(v) {
  const { px, py, z, hit, anchor, scale } = v;
  // A melee move's box is measured from the FIGHTER, not from the drawing —
  // `hitboxRect` in combat.js — so it is drawn there, beside the pose, and says
  // whose it is. Only possible at all now that the fighter is standing at the
  // distance the move puts them; before this the rectangle had nowhere honest
  // to go and was drawn around the picture, which claimed a shape the game
  // never tests there.
  if (hit.melee && v.launch) {
    const fx = px - v.launch.forward * z;
    const x = fx + hit.melee.forward * z, y = GROUND_Y + hit.melee.y * z;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 210, 90, 0.9)";
    ctx.fillStyle = "rgba(255, 210, 90, 0.10)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.fillRect(x, y, hit.melee.w * z, hit.melee.h * z);
    ctx.strokeRect(x, y, hit.melee.w * z, hit.melee.h * z);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 226, 150, 0.95)";
    ctx.font = "600 11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`the swing's box ${Math.round(hit.melee.w)}×${Math.round(hit.melee.h)}px — on the fighter`,
                 x, Math.max(12, y - 6));
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.strokeStyle = "rgba(255, 210, 90, 0.9)";
  ctx.fillStyle = "rgba(255, 210, 90, 0.10)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  // "follows Size" was only ever half true, and the missing half is the one
  // that confuses: a drop's HEIGHT is the art's own height, so those two can
  // never disagree, while its WIDTH is a plain kit number that does not move at
  // all. Size a vending machine up and it grows wider than the box it lands in
  // while staying exactly as tall — which reads as the box shrinking.
  const follows = !!hit.followsSize;
  const note = follows ? "height follows Size · width fixed" : "fixed";
  let label = "", topOf;
  if (hit.shape === "circle") {
    // A circle is the one shape the drawing can move and resize for itself —
    // it is what a projectile collides on, and a shot whose art is a wall of
    // water has no business colliding from the middle of its plate. The kit
    // still owns the radius; this is a multiplier and an offset on top.
    const c = hitCentreOnCanvas(v);
    const r = hit.r * v.hitAdj.scale * z;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    const sized = v.hitAdj.scale !== 1;
    label = `hit radius ${Math.round(hit.r * v.hitAdj.scale)}px`
      + (sized ? ` (${hit.r} × ${v.hitAdj.scale.toFixed(2)})` : "")
      + (!v.hitAdj.placed ? " · on the spawn point"
         : (v.hitAdj.ownDx || v.hitAdj.ownDy)
           ? ` · ${round1(v.hitAdj.ownDx)}, ${round1(v.hitAdj.ownDy)} from the drawing`
           : " · on the drawing");
    topOf = c.y - r;
    // Both handles on the RIM — see hitHandles for why not the centre. The
    // shape's interior is draggable too, but a big circle makes that obvious
    // and a small one has no room for it, so the handles are what is drawn.
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const hh = hitHandles(c, r);
    for (const [pt, mode] of [[hh.move, "move"], [hh.size, "size"]]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, HANDLE_R * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = state.dragHit?.mode === mode
        ? "rgba(255, 240, 190, 0.95)" : "rgba(255, 210, 90, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 226, 150, 0.95)";
      ctx.stroke();
    }
    // A short tick from the circle's centre to WHAT IT IS MEASURED FROM — the
    // picture once it has been placed, the spawn point until then — so "how far
    // has this been moved, and from what" is readable without doing arithmetic
    // on the numbers in the panel.
    const from = v.hitAdj.placed ? drawingHome(v) : { x: px, y: py };
    if (Math.hypot(c.x - from.x, c.y - from.y) > 2) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y); ctx.lineTo(from.x, from.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(255, 210, 90, 0.9)";
  } else {
    const hh = hit.h * (follows ? scale : 1);
    const w = hit.w * z, h = hh * z;
    const top = anchor === "feet" ? py - h : py - h / 2;
    ctx.fillRect(px - w / 2, top, w, h);
    ctx.strokeRect(px - w / 2, top, w, h);
    label = `${hit.from === "hitW/hitH" ? "hitbox" : "hit box"} `
      + `${Math.round(hit.w)}×${Math.round(hh)}px · ${note}`;
    topOf = top;
  }
  ctx.setLineDash([]);
  // Above the shape, and above the spawn-point caption, so the two readouts do
  // not sit on top of each other.
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgba(255, 226, 150, 0.95)";
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, px, Math.max(12, topOf - 6));
  ctx.restore();
}

/** Where the reference fighter stands beside a shared drawing.
 *
 *  Three answers, and the drawing decides which:
 *
 *    at the LAUNCH distance   the move declares where it leaves them, so they
 *                             stand that far from the drawing and the art can
 *                             be lined up against the hand that throws it.
 *    at the DRAWING'S CENTRE  the move paints ON the caster — an aura worn, a
 *                             concert wave centred on the chest, a transformed
 *                             body replacing them. Standing them aside answers
 *                             only "how big" and leaves every question the art
 *                             actually raises unanswerable off-stage.
 *    at the BENCHMARK INSET   nothing relates the two: a stage hazard, a domain
 *                             backdrop, a shot centred on the OPPONENT. Null,
 *                             and drawComparison falls back on its own.
 */
export function referenceX(v) {
  const launch = v.launch;
  if (!launch || launch.atOpponent) return v.can?.kind === "aura" ? v.px : null;
  // `forwardOfWidth` is an offset expressed as a fraction of the ART's width —
  // Gakuganji's shout sits at `f.facing * w * 0.3` — so it can only be resolved
  // once the drawing's width is known.
  const forward = launch.forward + (launch.forwardOfWidth || 0) * (v.w / v.z);
  return forward ? canvasCentreX() - forward * v.z : v.px;
}

/** Which way a travelling drawing flies, and which way its plate has to point.
 *
 *  This is the one thing about a projectile the viewer could not show and the
 *  art most needs to get right. drawProjectiles mirrors the drawing to the way
 *  it is travelling — `flip = vx > 0 ? -1 : 1` — so what a player sees flying
 *  RIGHT is the mirror of the plate, and the plate itself is the leftward
 *  version. A cone drawn opening to the right therefore fires apex-first, and
 *  nothing on this canvas said so: the workbench shows the plate, the game
 *  shows it flipped, and the two look like different drawings.
 *
 *  The nudge is honest in this frame either way — render.js applies `dx` INSIDE
 *  the mirrored transform, so pushing the picture right here pushes it toward
 *  the same end of the drawing in flight, whichever way the shot goes. */
export function drawTravelDirection(v) {
  const y = v.py;
  const x0 = v.px + v.w / 2 + 14;
  ctx.save();
  ctx.strokeStyle = "rgba(150, 230, 255, 0.75)";
  ctx.fillStyle = "rgba(150, 230, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();                       // an arrow the way this shot is flying
  ctx.moveTo(x0, y); ctx.lineTo(x0 + 34, y);
  ctx.moveTo(x0 + 26, y - 5); ctx.lineTo(x0 + 34, y); ctx.lineTo(x0 + 26, y + 5);
  ctx.stroke();
  ctx.font = "500 10.5px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("flying", x0 + 40, y + 4);
  ctx.textAlign = "center";
  ctx.fillText("shown as fired — mirrored, the way a player sees it. The plate faces the other way.",
               canvasCentreX(), GROUND_Y + 50);
  ctx.restore();
}

/** The zoom EVERYTHING in the Other Sprites view is drawn at — the drawing, its
 *  hit shape, its spawn point, and the fighter standing beside it as a size
 *  reference. The Zoom slider unless the drawing is too tall for the canvas, in
 *  which case the whole scene comes down together rather than the drawing alone.
 *
 *  Sizing an effect is a question about a ratio — "how big is this next to the
 *  man who throws it" — so the one thing the viewer must never do is scale the
 *  two by different numbers. */
export function sceneZoom(key = state.frame) {
  return sharedView(key)?.z ?? state.zoom;
}

/** Everything about a shared drawing's place on the canvas, in one place.
 *
 *  The art, the move's hit shape, the spawn crosshair and the drag that moves
 *  it were each doing this arithmetic themselves, and the copies disagreed the
 *  moment a drawing was too big for the viewer: the picture was clamped to the
 *  canvas and the hit shape was not, so past about 120% they grew apart and the
 *  art could never be made to meet its box. The clamp is now a VIEW zoom that
 *  everything here is drawn at — shrink the view, not the drawing — so the two
 *  hold their real proportions at any size.
 *
 *  `z` is that view zoom: game pixels to canvas pixels, and the divisor the
 *  drag uses to turn a gesture back into `dx`/`dy` game pixels.
 */
export function sharedView(key = state.frame) {
  const img = getImage(drawableSharedKey(key));
  if (!img) return null;
  const can = sharedControls(key);
  const meta = rawMeta(OTHER_KEY, key);
  const scale = Number.isFinite(meta?.renderScale) && meta.renderScale > 0 ? meta.renderScale : 1;
  const gameH = can?.info?.h ?? gameHeightOf(key);
  // Art whose spawn site sizes it per instance — a domain backdrop, an aura —
  // has no height in game pixels to work in, so its own plate stands in for
  // one. The scale still moves it, which keeps the control honest about being
  // relative rather than absolute.
  // `paintedHeight` rather than a multiply of its own: the viewer, the action
  // player and the game all ask the same function how tall a drawing is, so
  // there is one answer and no way for two of the three to agree while the
  // third quietly does something else.
  const artH = Number.isFinite(gameH) ? paintedHeight(key, gameH) : img.height * scale;
  const hit = can?.info?.hit || null;
  // A drop's box IS the height the art is painted at (`h` serves both in
  // randomDrop), so it grows with Size; every other shape is a fixed kit
  // number. Both have to be inside the view or a fit lies about one of them.
  const hitH = !hit ? 0
    : hit.shape === "circle" ? hit.r * 2
    : hit.h * (hit.followsSize ? scale : 1);
  // A drawing the kit gives a height to is drawn at the Zoom slider's value and
  // nothing else, however tall that makes it. Fitting it to the canvas was the
  // wrong instinct: this is the case where the size is a RATIO to the fighter
  // standing beside it, and a fit spends every further turn of the slider on
  // shrinking the view instead of growing the picture — the machine looked
  // frozen while its number climbed. Overflowing the top of the viewer is the
  // honest outcome, and Zoom is right there to pull it back in.
  //
  // The fit survives for the other case only: art nobody declares a height for,
  // which is standing in with its own plate — 1400px of domain backdrop that
  // would otherwise fill the canvas fifteen times over and mean nothing when it
  // did, there being no ratio in it to preserve.
  const z = Number.isFinite(gameH) ? state.zoom
    : Math.min(state.zoom, (GROUND_Y - 20) / Math.max(artH, hitH, 1));
  const h = artH * z;
  const anchor = can?.anchor || "feet";
  // Where the move puts it on the fighter, when the handler's arithmetic is
  // known: `y` game pixels from their feet, which is the height the crosshair
  // and everything hung off it belong at. Without a launch it falls back to the
  // viewer's own resting heights.
  // The point the move really launches from, kit numbers corrected — see
  // launchPoint. Everything hung off the crosshair moves with it.
  const launch = launchPoint(key);
  // An aura does not stand on the floor: render.js paints it from `f.y + 10`,
  // ten pixels UNDER the fighter's feet, so the glow skirts the platform rather
  // than being sheared off by it. Drawing it on the ground line here was a
  // silent ten-pixel lie in the one view somebody sets `dy` from — small, and
  // exactly the size of the nudges this panel exists to make.
  const footDy = Number.isFinite(can?.info?.footDy) ? can.info.footDy : 0;
  const py = launch ? GROUND_Y + launch.y * z : anchorScreenY(anchor, h) + footDy * z;
  return {
    img, can, meta, scale, hit, z, h, anchor, launch, footDy,
    // The drawing's own correction on the hit region — where it sits relative
    // to the point the game spawns on, and how big. Resolved here so the
    // drawing, the drag and the readout cannot disagree about it.
    hitAdj: sharedHit(key),
    // Two different things worth saying out loud, and only one of them is a
    // compromise: `fitted` means the view was shrunk because the drawing has no
    // declared size to hold it to, `overflows` means it is drawn at full size
    // and runs off the top, which is only ever a reason to reach for Zoom.
    fitted: z < state.zoom - 1e-6,
    overflows: artH * z > GROUND_Y - 4,
    // Travelling art is shown AS FIRED, to the right — mirrored, exactly as
    // drawProjectiles paints it (`flip = vx > 0 ? -1 : 1`). The plate and the
    // thing a player sees are mirror images of each other, and showing the
    // plate while the game shows the flip is how a drawing already pointing
    // the right way gets "corrected" with the Mirror box into flying backwards.
    // Fired right rather than left because the reference fighter faces right.
    mirror: !!can?.mirrored,
    w: img.width * h / img.height,
    px: canvasCentreX(),
    py,
  };
}

/** The placement options paintShared needs, out of a view: the anchor, the
 *  mirror, and the UNSAVED adjustment this panel is editing — the nudge and the
 *  tilt as they are on the sliders right now, at the viewer's zoom, since a
 *  `dx` of 6 game pixels is 6 × z on a canvas that has been scaled. */
export function sharedPlace(v) {
  return {
    anchor: v.anchor, mirrored: v.mirror, nudgeScale: v.z,
    adjust: {
      dx: v.meta?.dx ?? 0, dy: v.meta?.dy ?? 0,
      rot: (v.meta?.rotationDeg ?? 0) * Math.PI / 180,
      scale: v.scale,
    },
  };
}

/** Where the drawing leaves the fighter, in GAME pixels from their feet — the
 *  point the game will really spawn it from, which is not what the kit says.
 *
 *  Two corrections on the kit's own `ox`/`oy`, and both were missing:
 *
 *    the FIGHTER'S HAND  a shot leaves the muzzle src/muzzle.js resolves for
 *                        this fighter in this pose — a verified point, the
 *                        rig's measured hand, or the reference offsets scaled
 *                        onto their height. The kit's numbers are a
 *                        displacement from the reference on top of that, not
 *                        the whole answer. The crosshair used to sit at the raw
 *                        kit number, which is where nothing leaves from.
 *    the PENDING EDIT    `spawnOx`/`spawnOy` — the muzzle dragged on the action
 *                        preview and not yet carried into the kit. Only that
 *                        canvas was reading them, so the two views of one
 *                        drawing disagreed about where it comes from, and the
 *                        main viewer was the one ignoring the change you had
 *                        just made.
 *
 *  `edited` says the second correction is in play, and `source` names which of
 *  the three answers the hand came from, so the readout can say whether anybody
 *  has actually looked at this fighter. Both are for the readout to explain
 *  rather than for anything to draw. */
export function launchPoint(key) {
  const base = sharedControls(key)?.launch;
  if (!base) return null;
  const meta = rawMeta(OTHER_KEY, key) || {};
  const edited = Number.isFinite(meta.spawnOx) || Number.isFinite(meta.spawnOy);
  const ox = Number.isFinite(meta.spawnOx) ? meta.spawnOx : base.forward;
  const oy = Number.isFinite(meta.spawnOy) ? meta.spawnOy : base.y;
  const owner = sharedOwner(key);
  if (!base.scaled || !owner) {
    return { ...base, forward: ox, y: oy, edited, source: null };
  }
  const m = spawnOffset(owner, base.anim, ox, oy);
  return { ...base, forward: m.x, y: m.y, edited, source: m.source };
}

/** The kit-space multiplier the game applies to a move's own offset — what a
 *  number dragged on a canvas has to be divided by to become the number that
 *  belongs in the kit. 1 when nothing scales it. */
export function launchScale(key) {
  const base = sharedControls(key)?.launch;
  const owner = sharedOwner(key);
  if (!base?.scaled || !owner) return 1;
  return bodyMetrics(owner).height / HEIGHT_BASE_PX;
}

/**
 * EVERY HANDLE AND LABEL FOR A SHARED DRAWING, drawn after the reference
 * fighter rather than with the art.
 *
 * The art goes UNDER the fighter, because that is the game's paint order. The
 * handles are not art — they are the tool — and putting them under the fighter
 * too hid them: on Dagon's tide the caster stands 2.7px from the drawing, so
 * the spawn crosshair was completely behind his body. It was still draggable,
 * and dragging it still worked, which is the worst version of a bug like this:
 * the thing you cannot see is the thing you are told to grab.
 */
export function drawSharedOverlay() {
  const v = sharedView();
  if (!v) return;
  if ($("showHurtbox")?.checked && v.hit) drawSharedHit(v);
  // A creature has no fixed hit region to draw — its hurt box is the drawing —
  // so the same toggle shows the one shape that IS placed by hand.
  if ($("showHurtbox")?.checked && canPlaceAttack(state.frame)) drawAttackBox(state.frame);
  if (v.can?.used && v.can.anchor) drawSpawnPoint(v.px, v.py, v.anchor, v.can.offset);
  if (v.can?.offset) drawDrawingPoint(v);
  if (v.can?.travels) drawTravelDirection(v);
}

/** Where the DRAWING's own anchor sits on the canvas: the spawn point plus its
 *  nudge. Mirrored the way the picture is, because `dx` is applied inside the
 *  as-fired flip (render.js) — the same frame hitCentreOnCanvas works in. */
export function drawingHome(v) {
  const sx = v.mirror ? -1 : 1;
  return { x: v.px + sx * (v.meta?.dx ?? 0) * v.z, y: v.py + (v.meta?.dy ?? 0) * v.z };
}

/**
 * The handle that moves the PICTURE — the second of the two points the action
 * preview has always shown and the main viewer never did.
 *
 * The viewer had one marker, the spawn crosshair, and dragging it moved the art
 * beneath a handle that stayed put. That is defensible — the point belongs to
 * the game and not to us — and it is also why moving a drawing looked like
 * nothing happening: the thing under the pointer did not move, and on art as
 * large as a tide wave the picture sliding a few pixels behind a fighter is
 * easy to miss entirely.
 *
 * So the picture gets a handle of its own, at the picture's anchor, and it
 * moves with the picture. The crosshair beside it stays exactly where the game
 * spawns the effect, which is what makes the gap between them readable: that
 * gap IS `dx`/`dy`.
 */
export function drawDrawingPoint(v) {
  const d = drawingHome(v);
  const held = !!state.dragSpawn;
  const moved = (v.meta?.dx ?? 0) || (v.meta?.dy ?? 0);
  ctx.save();
  // The line back to the spawn point, so the offset is a thing you can see
  // rather than two numbers to subtract.
  if (moved) {
    ctx.strokeStyle = "rgba(240, 180, 90, 0.5)";
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(v.px, v.py); ctx.lineTo(d.x, d.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = held ? "rgba(255, 226, 170, 0.98)" : "rgba(240, 180, 90, 0.95)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(d.x, d.y, HANDLE_R, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(d.x, d.y, HANDLE_R * 2.1, 0, Math.PI * 2); ctx.stroke();
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "left";
  const label = moved
    ? `drawing · ${round1(v.meta.dx ?? 0)}, ${round1(v.meta.dy ?? 0)} from the spawn point`
    : "drawing · drag to move the picture";
  const wLab = ctx.measureText(label).width;
  const flip = d.x + 18 + wLab + 12 > canvas.width - 8;
  const bx = flip ? d.x - 18 - wLab - 12 : d.x + 18;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "rgba(8, 12, 20, 0.86)";
  ctx.fillRect(bx, d.y + 4, wLab + 12, 18);
  ctx.globalAlpha = 1;
  ctx.fillStyle = held ? "rgba(255, 226, 170, 0.98)" : "rgba(245, 200, 130, 0.95)";
  ctx.fillText(label, bx + 6, d.y + 17);
  ctx.restore();
}

/** The circle's two grab points, both ON THE RIM. Deliberately not at the
 *  centre: that is where the spawn crosshair is until the circle is moved, and
 *  a handle there would compete with it for the same pixels on every drawing
 *  nobody has touched yet — which is exactly how the crosshair became
 *  ungrabbable. Top moves, right resizes. */
export function hitHandles(c, r) {
  return { move: { x: c.x, y: c.y - r }, size: { x: c.x + r, y: c.y } };
}

/** Where the hit circle's centre lands on the canvas — the spawn point plus the
 *  drawing's own correction. One definition, so the shape, its two handles and
 *  the drag that moves them cannot disagree.
 *
 *  `dx` is FORWARD, and the viewer shows travelling art as fired (mirrored), so
 *  it runs the same way the picture does on this canvas. */
export function hitCentreOnCanvas(v) {
  const sx = v.mirror ? -1 : 1;
  // `hitAdj.dx/dy` is already resolved back to the spawn point by sharedHit —
  // the picture's offset folded in — so this stays anchored on the crosshair
  // and the circle nevertheless rides with the art. One arithmetic, in one
  // place, and the workbench cannot disagree with the game about it.
  return { x: v.px + sx * v.hitAdj.dx * v.z, y: v.py + v.hitAdj.dy * v.z };
}

/** The spawn point's place on the canvas — one definition, used by the marker
 *  and by the hit test, so they cannot drift apart. */
export function spawnHome() {
  const v = sharedView();
  return v ? { x: v.px, y: v.py } : { x: canvasCentreX(), y: GROUND_Y };
}

export function anchorScreenY(anchor, h) {
  if (anchor === "centre") return GROUND_Y - Math.max(h, 120) / 2 - 40;
  if (anchor === "top") return GROUND_Y - 300;
  return GROUND_Y;
}

/** The point the game paints this drawing on — the thing the nudge is measured
 *  from. Draggable: moving it moves the DRAWING under it, which is the edit
 *  somebody actually wants to make, and it is one gesture instead of two
 *  sliders and a guess about which way is positive.
 *
 *  Not everywhere, though. A trap and a dropped vending machine are painted
 *  straight from the image by their spawn sites, which never read the nudge, so
 *  there the crosshair is a reference and says so: it is still where the art
 *  meets the ground, and that is worth seeing even when nothing can move it. */
export function drawSpawnPoint(px, py, anchor, draggable = true) {
  const held = state.dragSpawn;
  ctx.save();
  ctx.strokeStyle = held ? "rgba(120, 255, 200, 0.95)" : "rgba(120, 220, 255, 0.9)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px - 14, py); ctx.lineTo(px + 14, py);
  ctx.moveTo(px, py - 14); ctx.lineTo(px, py + 14);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.stroke();
  // On a backing plate: the label sits over whatever the drawing happens to be,
  // and a caption that cannot be read is not a caption.
  const label = draggable ? "spawn point" : "spawn point · not nudgeable";
  const sub = ANCHOR_WORDS[anchor] || "";
  ctx.font = "500 10px Inter, sans-serif";
  const wSub = ctx.measureText(sub).width;
  ctx.font = "600 11px Inter, sans-serif";
  const wLab = ctx.measureText(label).width;
  const boxW = Math.max(wLab, wSub) + 12;
  const flip = px + 18 + boxW > canvas.width - 8;   // hug the other side at the edge
  const bx = flip ? px - 18 - boxW : px + 18;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "rgba(8, 12, 20, 0.86)";
  ctx.fillRect(bx, py - 17, boxW, 30);
  ctx.globalAlpha = 1;
  ctx.fillStyle = held ? "rgba(150, 255, 220, 0.95)" : "rgba(150, 230, 255, 0.95)";
  ctx.textAlign = "left";
  ctx.fillText(label, bx + 6, py - 5);
  ctx.globalAlpha = 0.72;
  ctx.font = "500 10px Inter, sans-serif";
  ctx.fillText(sub, bx + 6, py + 8);
  ctx.restore();
}

/** An actor pose nobody has delivered yet. Says so plainly rather than showing
 *  a spinner that will never finish. */
export function drawPendingNotice(cx) {
  ctx.save();
  ctx.strokeStyle = "rgba(154, 164, 192, 0.4)";
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(cx - 90, GROUND_Y - 260, 180, 260);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
  ctx.font = "600 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("not delivered yet", cx, GROUND_Y - 140);
  ctx.font = "500 11px Inter, sans-serif";
  ctx.fillText(state.frame, cx, GROUND_Y - 120);
  ctx.restore();
}

/** The height the game draws a shared sprite at, from the kit that spawns it. */
export function gameHeightOf(key) {
  const uses = sharedUsage().get(key) || [];
  // A kit's own declared height first; failing that the registry's, which is
  // where a CREATURE's height lives — a summon is sized by `h` in
  // config_summons.js rather than by a `spriteH` on the move, so reading only
  // the kits called every shikigami "sized by the code that spawns it" while
  // its Size control was live and working.
  return uses.find((u) => Number.isFinite(u.h))?.h ?? sharedSpriteInfo(key)?.h ?? null;
}

/** Drawn where the sprite will be, so the wait reads as "this pose is coming"
 *  rather than "this pose is blank". Animated from the clock rather than a
 *  timer: `render()` is already called on every arrival and every edit, and a
 *  rAF loop just to spin an arc would keep the page busy for no reason. */
export function drawCanvasSpinner(cx) {
  const t = performance.now() / 1000;
  const cy = GROUND_Y - 150;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 170, 255, 0.28)";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(120, 170, 255, 0.95)";
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, 26, t * 4, t * 4 + 1.5); ctx.stroke();
  ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
  ctx.font = "600 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`loading ${state.char}/${state.frame}…`, cx, cy + 52);
  ctx.restore();
  // One frame of animation per render, and renders stop once the art lands.
  requestAnimationFrame(() => { if (!frameLoaded(state.char, state.frame)) hooks.repaint(); });
}

/** Spin the pose about its centre of mass, so a badly-placed anchor is obvious
 *  — an off-centre pivot makes the body orbit instead of turn. */
export function drawSpinPreview(cx) {
  const t = performance.now() / 1000;
  drawCharFrame(ctx, state.char, state.frame, cx, GROUND_Y, {
    scale: actorOf(state.char).scale * state.zoom,
    facing: 1,
    rotation: t * 1.6,
  });
}

/** Where on the drawing the game's spawn point lands, in words. */
export const ANCHOR_WORDS = {
  centre: "painted AROUND the point — the middle of the drawing lands on it",
  feet: "painted STANDING ON the point — the bottom centre of the drawing lands on it",
  top: "hung FROM the point — the top centre of the drawing lands on it",
};
