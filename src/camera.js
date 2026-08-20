import { state } from "./state.js";
import { clamp, lerp } from "./utils.js";
import { WORLD } from "./constants.js";

// Smash-style framing: fit the alive fighters' bounding box, padded, and zoom
// to whatever makes that box fill the frame — tight duels are shot tight, a
// full-stage scramble pulls back.
// The pads are sized for the fighters plus the space a fight needs around
// them: heads and jumps above (fighter y is the foot line), attack reach and
// a beat of lookahead to the sides, a strip of ground below.
const FRAME_PAD_X = 240;
const FRAME_PAD_TOP = 280;
const FRAME_PAD_BOTTOM = 120;
// 1.32 restores the on-screen size fighters had before the roster shrank 15%
// (docs/level-design-review.md G1a): close fights read as large as ever, and
// the zoom-out is what buys the bigger boards their room.
const ZOOM_MAX = 1.32;
const ZOOM_SOLO = 1.12;
// Below 1 the view reaches past the painted world, into the strip of blast
// zone where recoveries actually happen: at 0.78 the shot is 1641 × 923, wide
// enough to hold two fighters hanging off opposite ledges at once. Everything
// painted world-wide bleeds out to match (VIEW_BLEED, render.js). Lower than
// this and the fighters stop reading.
const ZOOM_MIN = 0.78;
// How far off the world the view centre may push the frame, so a fighter
// scrapping for a ledge from off-stage stays on screen. Generous on purpose:
// it is the containment pass below, not this clamp, that decides where the
// camera goes — this only stops it chasing a body into the blast zone.
const OVERSCAN_X = 280;
const OVERSCAN_Y = 260;

// The frame leads each fighter's velocity by this many seconds (capped), so a
// launch is anticipated instead of chased. Without it the framing target is
// always one reaction behind the fighter that just got hit.
const LOOKAHEAD_T = 0.16;
const LOOKAHEAD_MAX = 260;

// The hard floor under all the smoothing: whatever the eased target is doing,
// every alive fighter's body stays inside the frame with this much room. Top
// pad clears the tallest fighter (200 px) with slack to spare; the rest is
// body width (~76 px at the widest) and a strip of ground. These only ever
// bind in the moments the eased framing would have lost somebody — in normal
// play the frame is wider than they ask for.
const KEEP_PAD_X = 110;
const KEEP_PAD_TOP = 250;
const KEEP_PAD_BOTTOM = 70;

const PAN_DAMP = 0.0009;
// Settling into a tighter shot is slow and unnoticeable; opening up to keep
// somebody in frame is near-instant. A single symmetric rate cannot do both,
// and it was the slow one that let a launched fighter leave the frame.
const ZOOM_IN_DAMP = 0.0015;
const ZOOM_OUT_DAMP = 0.00002;

/** Clamp a view centre so the frame stays over the world, allowing `overscan`
 *  px of gutter past each edge. A view wider than world+gutter just centres. */
function clampView(c, half, size, overscan) {
  const lo = half - overscan;
  const hi = size - half + overscan;
  return lo > hi ? size / 2 : clamp(c, lo, hi);
}

/** Slide a view centre the smallest distance that puts [lo, hi] inside a frame
 *  of half-extent `half`. Wider than the frame: centre on it and lose the least. */
function contain(c, half, lo, hi) {
  if (hi - lo > half * 2) return (lo + hi) / 2;
  return clamp(c, hi - half, lo + half);
}

export function updateCamera(dt) {
  const cam = state.camera;
  const alive = state.fighters.filter((f) => !f.dead && f.respawnTimer <= 0);

  let cx = WORLD.w / 2;
  let cy = WORLD.h / 2;
  let zoomTarget = 1;

  if (alive.length >= 2) {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const f of alive) {
      const lx = clamp((f.vx || 0) * LOOKAHEAD_T, -LOOKAHEAD_MAX, LOOKAHEAD_MAX);
      const ly = clamp((f.vy || 0) * LOOKAHEAD_T, -LOOKAHEAD_MAX, LOOKAHEAD_MAX);
      left = Math.min(left, f.x, f.x + lx);
      right = Math.max(right, f.x, f.x + lx);
      top = Math.min(top, f.y, f.y + ly);
      bottom = Math.max(bottom, f.y, f.y + ly);
    }
    left -= FRAME_PAD_X;
    right += FRAME_PAD_X;
    top -= FRAME_PAD_TOP;
    bottom += FRAME_PAD_BOTTOM;
    zoomTarget = clamp(
      Math.min(WORLD.w / (right - left), WORLD.h / (bottom - top)),
      ZOOM_MIN, ZOOM_MAX,
    );
    cx = (left + right) / 2;
    cy = (top + bottom) / 2;
  } else if (alive.length === 1) {
    const f = alive[0];
    cx = f.x + clamp((f.vx || 0) * LOOKAHEAD_T, -LOOKAHEAD_MAX, LOOKAHEAD_MAX) / 2;
    cy = f.y - 90 + clamp((f.vy || 0) * LOOKAHEAD_T, -LOOKAHEAD_MAX, LOOKAHEAD_MAX) / 2;
    zoomTarget = ZOOM_SOLO;
  }

  if (cam.kick > 0) {
    cam.kick = Math.max(0, cam.kick - dt);
    zoomTarget += 0.05;
  }

  const zoomDamp = zoomTarget < cam.zoom ? ZOOM_OUT_DAMP : ZOOM_IN_DAMP;
  cam.zoom = lerp(cam.zoom, zoomTarget, 1 - Math.pow(zoomDamp, dt));

  const panHalfW = WORLD.w / 2 / cam.zoom;
  const panHalfH = WORLD.h / 2 / cam.zoom;
  const panT = 1 - Math.pow(PAN_DAMP, dt);
  cam.x = lerp(cam.x, clampView(cx, panHalfW, WORLD.w, OVERSCAN_X), panT);
  cam.y = lerp(cam.y, clampView(cy, panHalfH, WORLD.h, OVERSCAN_Y), panT);

  // Containment. The eased pan above is what the shot WANTS; this is what it
  // owes. Anyone the easing (or a zoom that has not finished opening) would
  // have left behind pulls the frame the minimum distance that keeps them in
  // it — including the shake amplitude, which is applied after this.
  let halfW = WORLD.w / 2 / cam.zoom;
  let halfH = WORLD.h / 2 / cam.zoom;
  if (alive.length) {
    const m = cam.shake * 0.5;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const f of alive) {
      left = Math.min(left, f.x - KEEP_PAD_X - m);
      right = Math.max(right, f.x + KEEP_PAD_X + m);
      top = Math.min(top, f.y - KEEP_PAD_TOP - m);
      bottom = Math.max(bottom, f.y + KEEP_PAD_BOTTOM + m);
    }
    // Zoom out NOW if the eased zoom has not opened far enough — the shot may
    // lag on the way in, never on the way out. A 2000 px/s launch outruns any
    // easing, and a frame of snap reads far better than a lost fighter.
    const fit = Math.min(WORLD.w / (right - left), WORLD.h / (bottom - top));
    if (fit < cam.zoom) cam.zoom = Math.max(ZOOM_MIN, fit);
    halfW = WORLD.w / 2 / cam.zoom;
    halfH = WORLD.h / 2 / cam.zoom;
    cam.x = contain(cam.x, halfW, left, right);
    cam.y = contain(cam.y, halfH, top, bottom);
  }

  // Whatever the containment asked for, the frame still stops at the gutter:
  // a body flung to the blast line is gone, and chasing it would show the
  // unpainted void rather than the fight.
  cam.x = clampView(cam.x, halfW, WORLD.w, OVERSCAN_X);
  cam.y = clampView(cam.y, halfH, WORLD.h, OVERSCAN_Y);

  cam.shake = Math.max(0, cam.shake - dt * 44);
}

export function applyCamera(ctx) {
  const cam = state.camera;
  const sx = (Math.random() - 0.5) * cam.shake;
  const sy = (Math.random() - 0.5) * cam.shake;
  ctx.save();
  ctx.translate(WORLD.w / 2 + sx, WORLD.h / 2 + sy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

export function releaseCamera(ctx) {
  ctx.restore();
}
