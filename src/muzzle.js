// WHERE THE SHOT LEAVES — per fighter, per pose.
//
// A projectile's spawn point used to be one number on the MOVE: `ox`/`oy` in
// the kit, defaulting to 70, -86. That put "where Choso's hand is" in four
// places at once — once per move he throws something with — and made it a fact
// about the picture of the shot rather than about the body throwing it. Redraw
// the fighter and all four are quietly wrong, with nothing to say so.
//
// It is a fact about a BODY IN A POSE, so it is resolved the way every other
// such fact in this codebase is resolved. This module is deliberately the same
// shape as strike_points.js, which answers "where does the blow land":
//
// THREE SOURCES, in order:
//
//   1. a HUMAN-VERIFIED point (src/config_body_points.js), written by the
//      verification bench — `/workbench/?edit=verification`, the "muzzle-points"
//      set. A person looked at this fighter's own drawing and said where the
//      shot leaves, which beats any measurement. Per POSE where somebody has
//      gone that far, per character otherwise: an overhead throw and a hip-level
//      one leave from different places on the same body, and the per-character
//      entry is the answer for every pose nobody has separated out.
//   2. the MODEL measurement (src/config_model_reach.js), baked from the rig
//      posed at the move's own beat — the hand that throws, or the weapon's far
//      end when one leads. This is the "more model-specific location": a
//      fighter with a delivered rig has a measured hand, and it beats a
//      reference offset scaled onto them.
//   3. a FALLBACK: the reference body's 70, -86 scaled onto this fighter's
//      measured height. Never absent, so a caller can ask about anybody. This
//      is exactly what combat.js did for the whole roster before any of it.
//
// COORDINATES are the sim's: `x` forward along the facing from the centre line,
// `y` from the foot line with up NEGATIVE — the frame the kits write `oy: -86`
// in. Callers mirror x by facing, exactly as they do for a hitbox.
//
// THE MOVE STILL GETS A SAY. A muzzle is where the fighter's hand is; it is not
// where every move spawns. Geto's wave fans its shots with `ox: 60 + i * 54`,
// and a body point that swallowed that would collapse the fan onto one point.
// So a kit offset is read as a DISPLACEMENT from the reference muzzle rather
// than as an absolute — see `spawnOffset` — and a move that names none spawns
// exactly at the hand.

import { bodyMetrics } from "./silhouette.js";
import { MODEL_REACH } from "./config_model_reach.js";
import { BODY_POINTS } from "./config_body_points.js";
import { HEIGHT_BASE_PX } from "./config_tuning.js";

/** The reference body's offsets — the numbers the whole roster was assumed to
 *  have before anybody measured, and still the origin a kit's `ox`/`oy` are a
 *  displacement from. Changing these re-bases every kit offset in the game. */
export const REFERENCE_MUZZLE = { x: 70, y: -86 };

/** The animation states a muzzle can be asked about separately. A fighter
 *  throws from a different place in each, so each may carry its own verified
 *  point; anything not here falls back to the character's own entry. Matches
 *  the states specials.js plays (slotAnim) and the one an ultimate plays. */
const MUZZLE_STATES = new Set(["specialNeutral", "specialSide", "specialDown", "ult"]);

const cache = new Map();

/** Drop memoised points — the verification bench calls this after an edit so a
 *  change shows without a reload. The game never needs it. */
export function refreshMuzzles() {
  cache.clear();
}

/**
 * Where `charKey` throws from in `state`, as { x, y, source }.
 *
 * `source` names which of the three answers this is ("human", "model",
 * "derived"), so a consumer that wants to be conservative can decline to act on
 * a point nobody has looked at, while the workbench happily draws the best
 * available and says which it is.
 *
 * `state` is optional: with none, or with one nobody separates, the answer is
 * the character's own muzzle.
 */
export function muzzleOf(charKey, state = null) {
  const key = `${charKey}/${state || "-"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const point = solve(charKey, state);
  cache.set(key, point);
  return point;
}

/** True when a person has checked this one. */
export function muzzleVerified(charKey, state = null) {
  return muzzleOf(charKey, state).source === "human";
}

function solve(charKey, state) {
  const held = BODY_POINTS[charKey]?.muzzle;
  // A per-pose entry outranks the character's own: it is the more specific
  // thing the same person said. `{ x, y }` is the character-wide shape and
  // `{ states: { specialSide: { x, y } } }` the per-pose one; both may be
  // present, and a character with only the second still answers for any pose.
  if (state && MUZZLE_STATES.has(state)) {
    const perPose = held?.states?.[state];
    if (finite(perPose)) return { x: perPose.x, y: perPose.y, source: "human" };
  }
  if (finite(held)) return { x: held.x, y: held.y, source: "human" };

  // The rig, posed at this move's own beat. Baked `sy` is metres-up turned to
  // px-up; canvas y grows downward, so it flips — same convention as
  // strike_points.js reads the same table with.
  if (state) {
    const model = MODEL_REACH[charKey]?.states?.[state];
    if (model && Number.isFinite(model.sx) && Number.isFinite(model.sy)) {
      return { x: model.sx, y: -model.sy, source: "model" };
    }
  }

  const k = bodyMetrics(charKey).height / HEIGHT_BASE_PX;
  return {
    x: Math.round(REFERENCE_MUZZLE.x * k),
    y: Math.round(REFERENCE_MUZZLE.y * k),
    source: "derived",
  };
}

const finite = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/**
 * The point a move actually spawns from: the fighter's hand, displaced by
 * whatever the move asks for beyond the reference.
 *
 * A kit's `ox`/`oy` are read RELATIVE to `REFERENCE_MUZZLE`, not as absolutes.
 * The two readings agree exactly for a move that names nothing — 70 - 70 is
 * zero, so it spawns at the hand — and they part company only where a move
 * deliberately spawns somewhere else: Geto's wave at `ox: 60 + i * 54` keeps
 * its 54px fan around the hand instead of every wave landing on it.
 *
 * The displacement is scaled onto the body for the same reason the fallback
 * muzzle is: a move that reaches 54px past the reference fighter's hand should
 * reach proportionally past a bigger one's.
 */
export function spawnOffset(charKey, state, ox, oy) {
  const m = muzzleOf(charKey, state);
  const k = bodyMetrics(charKey).height / HEIGHT_BASE_PX;
  const dx = (Number.isFinite(ox) ? ox : REFERENCE_MUZZLE.x) - REFERENCE_MUZZLE.x;
  const dy = (Number.isFinite(oy) ? oy : REFERENCE_MUZZLE.y) - REFERENCE_MUZZLE.y;
  return { x: m.x + dx * k, y: m.y + dy * k, source: m.source };
}

/** Coverage, for the audit and the verification bench's progress line. */
export function muzzleCoverage(charKeys) {
  const out = { human: 0, model: 0, derived: 0, total: 0 };
  for (const charKey of charKeys) {
    out[muzzleOf(charKey).source]++;
    out.total++;
  }
  return out;
}

export { MUZZLE_STATES };
