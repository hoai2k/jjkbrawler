// WHERE THE BLOW IS — the fist, the foot, or the blade, per character per move.
//
// A hitbox says what a swing threatens; it does not say where the swing IS.
// The box is deliberately generous — a jab's runs from chest to floor so it
// catches a crouching opponent — so its centre is nobody's fist, and anything
// that wants the actual point of contact (impact sparks, a radial tipper, the
// debug overlay) had to guess. This module is the answer to "where is it".
//
// THREE SOURCES, in order:
//
//   1. a HUMAN-VERIFIED point (src/config_strike_points.js), written by the
//      verification bench — `/workbench/?edit=verification`. A person looked
//      at this fighter's own drawing and said where the blow lands, which
//      beats any measurement.
//
//      Keyed by the SPRITE FRAME, not by the state. A verified point is a
//      claim about one picture: "on THIS drawing, the fist is here". Two
//      states that show the same drawing therefore share one answer for free
//      (a sheet where `attack_heavy` stands in for both heavies, or `hurt`
//      covers `prone`), and re-pointing a state at different art correctly
//      drops back to the measurement instead of carrying a decision about a
//      picture that is no longer on screen. Keying by state would have got
//      both of those wrong in the same silent way.
//
//      Stored in the DRAWING'S OWN PIXELS, the same space the manifest's
//      `anchors` use, because that is what "a point on this artwork" means.
//      The sprite workbench moves and resizes art constantly — `ox` slides
//      it, `bodyBottom` re-specifies the foot line, `renderScale` resizes it
//      — and a point stored relative to the FIGHTER would silently come off
//      the fist every time somebody nudged a pose. In image space it rides
//      along, because it is converted through the same placement arithmetic
//      the renderer draws with.
//   2. the MODEL measurement (src/config_model_reach.js), baked from the rig
//      posed at the move's contact beat with the aim solved — the striking
//      limb ik.js names for that state, or the weapon's far end when one
//      leads. Good enough to review, not always good enough to ship: a rig
//      with a mis-gripped prop reports the prop.
//   3. a FALLBACK derived from the fighter's own measured body — out along
//      the facing at most of their reach, at centre-of-mass height. Never
//      absent, so a consumer can call this for anybody.
//
// COORDINATES are the ones the rest of the sim uses: `x` forward along the
// fighter's facing from their centre line, `y` in canvas convention from the
// foot line, so up is NEGATIVE — the same frame `moves.js` writes `oy: -92`
// in. Callers mirror x by facing exactly as they do for a hitbox.

import { bodyMetrics } from "./silhouette.js";
import { MODEL_REACH } from "./config_model_reach.js";
import { STRIKE_POINTS, STRIKE_POINT_META } from "./config_strike_points.js";
import { comFrac } from "./body_points.js";
import { resolvedAnim, frameFootY } from "../sprites/src/sprites.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";
import { frameMeta } from "./assets.js";
import { headHeightTarget, referenceSpan } from "./heights.js";
import { CELL_W } from "./constants.js";

/** Attack states that have a strike point at all. A state absent here has no
 *  single point of contact — a quake comes out of the floor everywhere. */
const STRIKE_STATES = new Set([
  "light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack", "airLight",
  "dashAttack", "dashAttackHeavy",
]);

/** States that borrow another's point, mirroring states.js STATE_ALIASES:
 *  a dash attack is the archetype's own strike thrown out of a run. */
const ALIAS = { dashAttack: "light", dashAttackHeavy: "sideHeavy" };

const cache = new Map();

/** Drop memoised points — the verification bench calls this after an edit so
 *  the change shows without a reload. The game never needs it. */
export function refreshStrikePoints() {
  cache.clear();
}

/**
 * Where `charKey`'s `state` lands, as { x, y, source }.
 *
 * `source` says which of the three answers this is ("human", "model",
 * "derived"), because a consumer that wants to be conservative — a damage
 * rule, say — can decline to act on a point nobody has looked at, while the
 * FX and the debug overlay happily draw whatever is best available.
 */
export function strikePoint(charKey, state) {
  const key = `${charKey}/${state}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const point = solve(charKey, state);
  cache.set(key, point);
  return point;
}

/** True when a person has checked this one. */
export function strikePointVerified(charKey, state) {
  return strikePoint(charKey, state).source === "human";
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

/** The draw scale heights.js solves, recomputed here rather than read off the
 *  roster — the same trick silhouette.js uses so this works before the roster
 *  is wired up. */
function scaleOf(charKey) {
  const span = referenceSpan(charKey);
  return span ? (headHeightTarget(charKey) || 0) / span : 0;
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

function solve(charKey, state) {
  const name = ALIAS[state] || state;
  const b = bodyMetrics(charKey);
  if (STRIKE_STATES.has(name)) {
    const frame = contactFrame(charKey, name);
    const human = frame ? STRIKE_POINTS[charKey]?.[frame] : null;
    if (human && Number.isFinite(human.x) && Number.isFinite(human.y)) {
      // A decision names the file it was made against. When the art has since
      // been replaced the point is about a picture nobody is looking at any
      // more, so it is dropped rather than trusted — the measurement is a
      // better guess than a stale hand-placement.
      const meta = frameMeta(charKey, frame);
      if (!human.file || !meta?.file || human.file === meta.file) {
        const g = imageToGame(charKey, frame, human.x, human.y);
        if (g) return { x: Math.round(g.x), y: Math.round(g.y), source: "human", frame };
      }
    }
    const model = MODEL_REACH[charKey]?.states?.[name];
    if (model && Number.isFinite(model.sx) && Number.isFinite(model.sy)) {
      // Baked `sy` is metres-up turned to px-up; canvas y grows downward.
      return { x: model.sx, y: -model.sy, source: "model" };
    }
  }
  // Nobody has measured this one: out along the facing at most of the
  // fighter's own reach, at the height their mass sits — which is where an
  // arm strike from a body that size would land.
  return {
    x: Math.round(b.reach * 0.75),
    y: -Math.round(b.height * comFrac(charKey)),
    source: "derived",
  };
}

/** Coverage, for the audit and the verification bench's progress line. */
export function strikePointCoverage(charKeys) {
  const out = { human: 0, model: 0, derived: 0, total: 0 };
  for (const charKey of charKeys) {
    for (const state of STRIKE_STATES) {
      if (ALIAS[state]) continue;
      out[strikePoint(charKey, state).source]++;
      out.total++;
    }
  }
  return out;
}

export { STRIKE_STATES, STRIKE_POINT_META };
