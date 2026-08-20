// WHICH DRAWING EACH HURTBOX CASE WAS REVIEWED AGAINST.
//
// A hurtbox fit (src/config_body_points.js, HURTBOX_FIT) is a judgement about
// a PICTURE: somebody looked at a fighter's crouch and said the box should be
// this much narrower and sit this much higher. The judgement is stored as
// multipliers so it survives a re-measure — but it cannot survive a REDRAW.
// Swap the crouch art for a pose that ducks properly, or nudge the frame's
// placement in the sprite workbench, and the fit is now a decision about a
// drawing nobody can see any more. Nothing in the numbers would say so.
//
// So each fit records a token for the art it was reviewed against, and this
// module is what computes it. When the token moves:
//
//   · the verification bench stops counting the case as settled, so it
//     reappears at the top of the "To do" queue on its own;
//   · tools/audit_hitboxes.mjs names it, so it is visible without opening
//     a browser.
//
// THE FIT KEEPS APPLYING MEANWHILE, deliberately. A stale fit is a decision
// about a slightly different picture, which is very nearly always closer to
// right than no decision at all — and silently reverting to the derived box
// would change matchups on an art commit, with nothing in the diff to say why.
// Stale means "ask again", not "throw away".
//
// The token covers everything that can move or resize what is drawn: which
// frames the state resolves to, which file each one is, its pixel size, its
// placement (ox/oy/bodyBottom) and its render scale. A change to any of those
// changes where the body sits inside the box.

import { resolvedAnim } from "../sprites/src/sprites.js";
import { frameMeta } from "./assets.js";
import { bodyMetrics } from "./silhouette.js";
import { HURTBOX, LEDGE_HANG_X, LEDGE_HANG_Y } from "./constants.js";
import { comFrac } from "./body_points.js";
import { HURTBOX_FIT, HURTBOX_FIT_ART } from "./config_body_points.js";

/**
 * THE CASES, in one place.
 *
 * The bench builds its queue from this, combat.js's branches are keyed by
 * `key`, and the audit walks it. They used to agree by hand, which is how
 * `tumble` spent a while sharing `prone`'s key.
 *
 *   key       what HURTBOX_FIT and combat.js call it
 *   state     the animation whose drawing shows the body in that box
 *   label     for a human
 *   spin      radians the bench draws the body turned through, because the
 *             game draws it turned (motion.js) — tumble only
 *   grounded  the fighter is standing on the floor in this case, so combat.js
 *             extends the box back down to it whatever the fit says
 */
export const HURTBOX_CASES = [
  { key: "stand", state: "idle", label: "standing", grounded: true },
  { key: "crouch", state: "crouch", label: "ducking", grounded: true },
  { key: "air", state: "fall", label: "airborne" },
  { key: "hurt", state: "hurt", label: "reeling", grounded: true },
  { key: "prone", state: "prone", label: "flat out", grounded: true },
  { key: "tumble", state: "hurt", label: "tumbling", spin: Math.PI / 2 },
  { key: "ledge", state: "ledge", label: "hanging" },
];

export const caseByKey = (key) => HURTBOX_CASES.find((c) => c.key === key) || null;

/**
 * THE HANG BOX AS DERIVED, in one place, because three things have to agree
 * about it: combat.js builds it around a real platform corner, the
 * verification bench draws it around the corner it hangs the drawing on, and
 * the audit measures it against the drawing's own pixels.
 *
 * Quoted RELATIVE TO THE CORNER — `cx` forward along the facing from it, the
 * box's top edge on the lip — because that is the point the picture is placed
 * by (render.js `anchorTo`) and therefore the only point a box and a body can
 * be compared at. See the HURTBOX note in constants.js for the measurements
 * the fractions come from.
 */
export function ledgeBox(charKey) {
  const b = bodyMetrics(charKey);
  return {
    cx: b.width * HURTBOX.ledgeX,
    w: b.width * HURTBOX.ledgeW,
    h: b.height * HURTBOX.ledgeH,
  };
}

/**
 * THE BOX THE GAME DERIVES FOR ONE CASE, before any fit is applied, quoted
 * RELATIVE TO THE FIGHTER: `w` and `h` in game px, `top` how far the box's top
 * edge rises above the fighter's own y, `cx` how far its centre sits forward
 * of the centre line.
 *
 * combat.js builds these same seven boxes around a live fighter, which a bench
 * does not have — so this is the shape without the fighter, and the two must
 * not be allowed to drift. Both benches that draw a hurtbox read it from here
 * (the verification queue and the sprite workbench), which is what stopped the
 * sprite workbench drawing a standing box on an airborne pose.
 *
 * A HANG IS QUOTED FROM THE LIP. Every other case stands on the foot line; the
 * hang is hung from the platform corner, LEDGE_HANG_Y above the fighter's own
 * y and LEDGE_HANG_X forward of it, because that is the point render.js hangs
 * the DRAWING from. It is the only point a box and a body can be compared at.
 */
export function derivedBox(charKey, caseKey) {
  const b = bodyMetrics(charKey);
  const H = b.height, W = b.width;
  switch (caseKey) {
    case "crouch": return { w: W * HURTBOX.crouchW, h: H * b.crouch, top: H * b.crouch, cx: 0 };
    case "air": {
      const h = H * (b.air ?? HURTBOX.airH);
      return { w: W, h, top: h, cx: 0 };
    }
    case "hurt":
      return { w: W * HURTBOX.hurtW, h: H * HURTBOX.hurtH, top: H * HURTBOX.hurtH, cx: 0 };
    case "prone":
      return { w: H * HURTBOX.proneW, h: H * HURTBOX.proneH, top: H * HURTBOX.proneH, cx: 0 };
    case "tumble": {
      // The same long low shape as prone, but hung about the centre of mass
      // rather than resting on the floor — that is the point the spin pivots on.
      const h = H * HURTBOX.proneH;
      return { w: H * HURTBOX.proneW, h, top: H * comFrac(charKey) + h / 2, cx: 0 };
    }
    case "ledge": {
      const g = ledgeBox(charKey);
      return { w: g.w, h: g.h, top: LEDGE_HANG_Y, cx: LEDGE_HANG_X + g.cx };
    }
    default: return { w: W, h: H * HURTBOX.standH, top: H * HURTBOX.standH, cx: 0 };
  }
}

/**
 * The fit applied to a derived box, as combat.js applies it: resized about the
 * bottom edge, then shifted by fractions of the DERIVED size — `dx` forward,
 * `dy` up. Quoted the same way `derivedBox` is, so a caller that has one has
 * the other in the same frame of reference.
 *
 * The floor and lip clamps combat.js also applies are NOT here: both need a
 * live fighter (are they standing on something, is their hand on a corner),
 * and a bench drawing the clamped box would show a bottom edge the reviewer
 * cannot move. What is drawn is the decision; the clamp is the game being
 * kind about it afterwards.
 */
export function fittedBox(charKey, caseKey, fit) {
  const base = derivedBox(charKey, caseKey);
  const m = { w: 1, h: 1, dx: 0, dy: 0, ...(fit || {}) };
  const w = base.w * m.w, h = base.h * m.h;
  return {
    w, h,
    cx: base.cx + m.dx * base.w,
    top: base.top - (base.h - h) + m.dy * base.h,
  };
}

/** The fields of a frame that decide where and how big the body is drawn.
 *  Anything else in the manifest (review notes, anchors for other purposes)
 *  can move without invalidating a judgement about the silhouette. */
const PLACEMENT = ["file", "w", "h", "ox", "oy", "bodyBottom", "renderScale"];

/** A short, stable digest. Not cryptography — this only has to change when the
 *  input does, and fit in a config file without dominating it. */
function digest(text) {
  let a = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    a ^= text.charCodeAt(i);
    a = Math.imul(a, 0x01000193) >>> 0;
  }
  return a.toString(36);
}

/**
 * The token for one fighter's one case, or null when there is no art for it
 * (a fighter with no crouch drawing has no crouch to review).
 *
 * Built from the frames the state actually RESOLVES to, not the ones it
 * declares — a state falling back to another pose is reviewed on the drawing
 * the game really shows, and starts wanting a fresh look the moment its own
 * art arrives.
 */
export function hurtboxArtToken(charKey, caseKey) {
  const c = caseByKey(caseKey);
  if (!c) return null;
  const frames = resolvedAnim(charKey, c.state)?.frames || [];
  if (!frames.length) return null;
  const parts = frames.map((key) => {
    const m = frameMeta(charKey, key) || {};
    return `${key}:${PLACEMENT.map((f) => m[f] ?? "").join(",")}`;
  });
  return digest(parts.join("|"));
}

/** What a fit says about itself: has one, and was it reviewed against the art
 *  that is there now? `art` is null for a fit committed before tokens existed
 *  — treated as stale, because that is exactly what it is: unknown. */
export function fitState(charKey, caseKey) {
  const fit = HURTBOX_FIT[charKey]?.[caseKey];
  if (!fit) return { has: false, stale: false, token: hurtboxArtToken(charKey, caseKey) };
  const token = hurtboxArtToken(charKey, caseKey);
  const stored = HURTBOX_FIT_ART[charKey]?.[caseKey] ?? null;
  return { has: true, stale: stored !== token, token, stored };
}

/** Everything a person still owes an answer for: cases with art and either no
 *  fit or a fit reviewed against a drawing that has since changed. */
export function outstandingFits(charKeys) {
  const missing = [];
  const stale = [];
  for (const charKey of charKeys) {
    for (const c of HURTBOX_CASES) {
      const s = fitState(charKey, c.key);
      if (!s.token) continue;                       // nothing drawn for it
      if (!s.has) missing.push(`${charKey}.${c.key}`);
      else if (s.stale) stale.push(`${charKey}.${c.key}`);
    }
  }
  return { missing, stale };
}
