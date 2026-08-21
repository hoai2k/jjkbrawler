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
import { STRIKE_REACH } from "./config_tuning.js";
import { STRIKE_POINT_META } from "./config_strike_points.js";
import { comFrac } from "./body_points.js";
// The READING half of this lives in strike_reach.js — which drawing a state
// strikes on, where a point on it lands in the game's own frame, and whether a
// person has verified it. It is a separate module because silhouette.js needs
// exactly that much to measure a sprite fighter's reach and cannot import this
// one: `solve` below falls back to `bodyMetrics`, so the two would recur
// through each other on the first character measured.
import {
  STRIKE_STATES, ALIAS, contactFrame, imageToGame, gameToImage, verifiedPoint,
} from "./strike_reach.js";

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

function solve(charKey, state) {
  const name = ALIAS[state] || state;
  const b = bodyMetrics(charKey);
  if (STRIKE_STATES.has(name)) {
    // A verified point, if one is placed and still describes the drawing on
    // screen — strike_reach.js owns that test, including the staleness rule
    // that drops a decision about a picture since replaced.
    const human = verifiedPoint(charKey, name);
    if (human) {
      return { x: Math.round(human.x), y: Math.round(human.y), source: "human", frame: human.frame };
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
    x: Math.round(b.reach * STRIKE_REACH.derivedFrac),
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

// Re-exported rather than moved out from under the callers: "where does this
// move land on this drawing" is what people come to this module for, and the
// split behind it is a dependency detail.
export {
  STRIKE_STATES, STRIKE_POINT_META, contactFrame, imageToGame, gameToImage,
};
