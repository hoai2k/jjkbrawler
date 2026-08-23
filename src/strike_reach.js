// HOW FAR A DRAWING REACHES — the sprite game's own answer, off the points a
// person placed on the art.
//
// The sprite backend and the model backends are different games wearing the
// same rules, and this module is the sprite one's half of the split. Reach used
// to come from `src/config_model_reach.js` for everybody, rigged or not: a
// number measured off a posed GLB, deciding the range of a fighter a player was
// looking at as a DRAWING. It was 30-36 px out on Mahito and Nanami and 30 px
// short on Sukuna, and the strike arc — which is drawn at the hitbox's own far
// edge — floated that far off the end of the art it is there to mark.
//
// So the sprite game measures sprites. `src/silhouette.js` picks the source by
// which backend is drawing (`setReachSource`); this is what it calls when the
// answer has to come from the pictures.
//
// ---------------------------------------------------------------------------
// WHY THE VERIFIED STRIKE POINTS AND NOT THE SILHOUETTE
//
// The silhouette scan (`rawReach` in silhouette.js) reads the outer bounds of
// the ink, and the ink includes things that cannot hit anybody: cursed-energy
// clouds, motion smears, the glow around a fist. It has no way to tell those
// from a fist, which is why the rig measurement was preferred over it in the
// first place.
//
// A verified strike point can tell, because a person told it. Every fighter's
// six attacks have been walked in the verification bench
// (`/workbench/?edit=verification`, set "strike-points"), and each point is a
// human saying "on THIS drawing, the blow lands HERE" — past the smear, on the
// knuckle. `x` is already the number this module wants: forward from the
// fighter's centre line, in game px, ridden through the same placement
// arithmetic the renderer draws with. That makes reach something the art
// review OWNS rather than something a scan guesses at, and it is why the
// fallback below is the scan and not the other way round.
//
// The point is where the blow LANDS, not where the ink stops, so it sits a
// little inside the old measurement — a fist's centre rather than its front
// edge. That is what MELEE_GRACE is for (moves.js): the same explicit margin
// for everybody, added to whatever the art says. The roster's median reach is
// unchanged by the switch, so the fighter in the middle plays as they did and
// the spread around them is now the drawings' own.
//
// FAULTS. A point that lands behind the fighter or barely in front of them is
// not a reach — it is a picture somebody should look at again (Hakari's jab
// contact sits 34 px BEHIND his centre line). Those are reported by
// `reachFaults` rather than used, the move falls back to the fighter's own
// scalar, and the verification bench reopens exactly those items as work.

import { STRIKE_POINTS } from "./config_strike_points.js";
import { frameMeta } from "./assets.js";
import { resolvedAnim, frameFootY } from "../sprites/src/sprites.js";
import { headHeightTarget, referenceSpan } from "./heights.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";
import { CELL_W } from "./constants.js";
import { BODY, STRIKE_REACH } from "./config_tuning.js";

/** Attack states that have a strike point at all. A state absent here has no
 *  single point of contact — a quake comes out of the floor everywhere. */
export const STRIKE_STATES = new Set([
  "light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack", "airLight",
  "dashAttack", "dashAttackHeavy",
]);

/** States that borrow another's point, mirroring states.js STATE_ALIASES:
 *  a dash attack is the archetype's own strike thrown out of a run. */
export const ALIAS = { dashAttack: "light", dashAttackHeavy: "sideHeavy" };

/**
 * The states whose contact point is a REACH.
 *
 * An up smash and a quake are struck along the fighter's own centre line — the
 * interesting number about them is how high or how low they get, and their `x`
 * is a few px of shoulder lean. Folding those into a maximum would say nothing;
 * folding them into a per-move range would collapse the box. Both aliases
 * resolve into this list already, so a dash attack adds nothing to it.
 */
export const FORWARD_STATES = ["light", "sideHeavy", "crouchAttack", "airLight"];

/** The draw scale heights.js solves, recomputed here rather than read off the
 *  roster — the same trick silhouette.js uses so this works before the roster
 *  is wired up. */
function scaleOf(charKey) {
  const span = referenceSpan(charKey);
  return span ? (headHeightTarget(charKey) || 0) / span : 0;
}

/**
 * The drawing a state's strike point is a claim about: the frame its contact
 * beat falls on — the strike, not the wind-up.
 *
 * Rounded rather than floored on purpose. `beat` sits exactly on the boundary
 * between the two frames (states.js derives it from the sheet's own fps), and
 * the wrong side of that rounding names the wind-up — which is how the
 * verification bench first opened showing fighters with their fists still up.
 */
export function contactFrame(charKey, state) {
  const name = ALIAS[state] || state;
  const anim = resolvedAnim(charKey, name);
  const frames = anim?.frames?.filter(Boolean) || [];
  if (!frames.length) return null;
  const beat = STATES[clipNameFor(name)]?.beat;
  if (!anim.fps || beat === undefined) return frames[0];
  return frames[Math.min(frames.length - 1, Math.round(beat * anim.fps))];
}

/**
 * A point in a drawing's own pixels -> game px from the fighter's centre line
 * and foot line, by the same arithmetic `drawCharFrame` places the art with
 * (sprites.js): the image is drawn at `(ox - CELL_W/2, oy - footY)` scaled,
 * so a pixel inside it lands at that corner plus its own offset.
 *
 * Returns null when the frame has no metadata — the caller falls through to
 * the measurement, which is the right answer for art that is not there.
 */
export function imageToGame(charKey, frameKey, px, py) {
  const meta = frameMeta(charKey, frameKey);
  if (!meta || !Number.isFinite(meta.w) || !Number.isFinite(meta.h)) return null;
  const scale = scaleOf(charKey) * (meta.renderScale || 1);
  if (!scale) return null;
  // A frame the manifest marks `faceLeft` is drawn mirrored, so its own
  // pixels run the other way across the fighter.
  const mirror = meta.faceLeft ? -1 : 1;
  return {
    x: mirror * ((meta.ox ?? 0) - CELL_W / 2 + px) * scale,
    y: ((meta.oy ?? 0) - frameFootY(meta) + py) * scale,
  };
}

/** The inverse — game px back into the drawing's pixels. The verification
 *  bench places points in game space (that is what a reviewer sees) and files
 *  them in image space (that is what they mean). */
export function gameToImage(charKey, frameKey, gx, gy) {
  const meta = frameMeta(charKey, frameKey);
  if (!meta || !Number.isFinite(meta.w)) return null;
  const scale = scaleOf(charKey) * (meta.renderScale || 1);
  if (!scale) return null;
  const mirror = meta.faceLeft ? -1 : 1;
  return {
    x: (mirror * gx) / scale - ((meta.ox ?? 0) - CELL_W / 2),
    y: gy / scale - ((meta.oy ?? 0) - frameFootY(meta)),
  };
}

/**
 * The human-verified point for one state, in game px — or null when nobody has
 * placed one, or when the drawing it was placed on has since been replaced.
 *
 * The staleness rule is the same one strike_points.js applies and for the same
 * reason: a decision names the file it was made against, and a redraw landing
 * under the same frame name makes it a decision about a picture nobody is
 * looking at any more.
 */
export function verifiedPoint(charKey, state) {
  const name = ALIAS[state] || state;
  if (!STRIKE_STATES.has(name)) return null;
  const frame = contactFrame(charKey, name);
  const held = frame ? STRIKE_POINTS[charKey]?.[frame] : null;
  if (!held || !Number.isFinite(held.x) || !Number.isFinite(held.y)) return null;
  const meta = frameMeta(charKey, frame);
  if (held.file && meta?.file && held.file !== meta.file) return null;
  const g = imageToGame(charKey, frame, held.x, held.y);
  return g ? { x: g.x, y: g.y, frame } : null;
}

/**
 * The states whose contact point is a HEIGHT rather than a reach.
 *
 * The mirror image of FORWARD_STATES above, and the same argument the other way
 * round. A rising attack is struck along the fighter's own centre line, so its
 * `x` is a few px of shoulder lean and says nothing — but its `y` is the whole
 * move: how far above their own head this fighter's fist actually gets.
 *
 * Nothing read that number until it had to. `moves.js` sized every up attack
 * from a literal written for a reference-height fighter — a box whose top edge
 * landed 1.88 body heights up for the entire roster — and the strike arc, which
 * is drawn at the box's far edge, therefore floated about eighty px above the
 * arm on Gojo. The art has known better all along.
 */
export const RISING_STATES = ["upHeavy"];

/**
 * How high a verified point may land and still be read as a rising attack's
 * reach, in game px above the foot line. See STRIKE_REACH.upMin/upMax — it is
 * the vertical twin of `reachGuard` and it is loose for the same reason.
 */
export function heightGuard(charKey) {
  const h = headHeightTarget(charKey) || BODY.fallbackHeight;
  return { lo: h * STRIKE_REACH.upMin, hi: h * STRIKE_REACH.upMax, height: h };
}

/**
 * This state's vertical reach off the art, in game px above the foot line — or
 * null when there is no usable verified point for it, which sends the move back
 * to its authored literal.
 *
 * Same rule as `verifiedReach`: a point outside the guard is refused rather
 * than clamped, because a fist drawn at ankle height on an up smash is a
 * picture to look at again and not a short up smash.
 */
export function verifiedHeight(charKey, state) {
  const p = verifiedPoint(charKey, state);
  if (!p) return null;
  const up = -p.y;                              // canvas y is negative upward
  const { lo, hi } = heightGuard(charKey);
  return up >= lo && up <= hi ? up : null;
}

/**
 * How far a verified point may sit from the centre line and still be read as a
 * reach, in game px. See STRIKE_REACH in config_tuning.js for why this band is
 * so much wider than the one guarding the silhouette scan: it is catching a
 * misclick, not second-guessing a reviewer.
 */
export function reachGuard(charKey) {
  const h = headHeightTarget(charKey) || BODY.fallbackHeight;
  return { lo: h * STRIKE_REACH.min, hi: h * STRIKE_REACH.max, height: h };
}

/**
 * This state's reach off the art, in game px — or null when there is no usable
 * verified point for it.
 *
 * Usable means IN the guard band. A point outside it is not clamped into range
 * and quietly used: a jab that lands behind the fighter is a picture to look at
 * again, not a short jab, and pretending otherwise would bake a bad review into
 * a matchup where nothing could find it. `reachFaults` names them instead.
 */
export function verifiedReach(charKey, state) {
  const p = verifiedPoint(charKey, state);
  if (!p) return null;
  const { lo, hi } = reachGuard(charKey);
  return p.x >= lo && p.x <= hi ? p.x : null;
}

/**
 * The fighter's committed reach off their own drawings: the furthest their
 * verified points get in any of the forward attacks.
 *
 * A maximum for the same reason the rig measurement takes one — "reach" is what
 * a fighter's longest swing threatens, and the per-move numbers carry the rest
 * of the story now. Null when this fighter has no usable point at all, which
 * sends silhouette.js down to the silhouette scan.
 */
export function spriteReach(charKey) {
  let best = null;
  for (const state of FORWARD_STATES) {
    const v = verifiedReach(charKey, state);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}

/**
 * The verified points this fighter has that cannot be read as a reach, with
 * enough about each to act on: `{ state, frame, x, lo, hi, why }`.
 *
 * Two audiences, and they want the same list. `tools/audit_hitboxes.mjs` prints
 * it, so a bad point is loud rather than a range nobody can explain; the
 * verification bench treats those items as UNANSWERED, so the queue puts them
 * back in front of a person with the reason attached.
 *
 * A state with no verified point at all is not a fault — it is unreviewed art,
 * which the bench already asks about on its own terms.
 */
export function reachFaults(charKey) {
  return FORWARD_STATES.map((state) => reachFault(charKey, state)).filter(Boolean);
}

/**
 * The same question about ONE state — null when the point is fine, or when
 * there is no point to judge.
 *
 * The verification bench asks per item, which is how a fault becomes a queued
 * request rather than a line in an audit nobody ran.
 */
export function reachFault(charKey, state) {
  const name = ALIAS[state] || state;
  if (!FORWARD_STATES.includes(name)) return null;
  const p = verifiedPoint(charKey, name);
  if (!p) return null;
  const { lo, hi } = reachGuard(charKey);
  if (p.x >= lo && p.x <= hi) return null;
  return {
    state: name, frame: p.frame, x: Math.round(p.x),
    lo: Math.round(lo), hi: Math.round(hi),
    why: p.x < lo
      ? (p.x < 0
        ? "the contact point is BEHIND the centre line"
        : "the contact point is inside the body")
      : "the contact point is further out than a body can swing",
  };
}
