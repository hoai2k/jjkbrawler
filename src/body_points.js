// FACTS ABOUT A FIGHTER'S BODY, resolved — the reader for
// src/config_body_points.js.
//
// Each of these is a number the simulation used to assume for the whole
// roster. A person can now say otherwise per fighter (the verification bench
// writes the config), and everything here answers with their decision when
// there is one and the old assumption when there is not — so an empty config
// is exactly today's behaviour, and filling one in is the only thing that
// changes anything.
//
// Deliberately NOT merged into silhouette.js: that module MEASURES, from art,
// and re-measures when the art moves. These are decisions, they outrank
// measurement, and keeping the two apart is what stops a re-bake from quietly
// undoing somebody's judgement.

import { BODY_POINTS, HURTBOX_FIT } from "./config_body_points.js";
import { COM_BODY_FRAC } from "./config_tuning.js";
import { HEIGHT_BASE_PX, ART_SCALE } from "./config_tuning.js";

// ---------------------------------------------------- heights on the body
//
// A LENGTH UP A FIGHTER, in world px. `bodyY(f, 90)` is the point 90px up the
// REFERENCE body — chest height — placed on the roster as it is actually
// drawn.
//
// It exists because the raw form was wrong in six files at once. Every "chest
// height" and "over the head" in the game was written as `f.y - 90` against a
// 149px reference body; ART_SCALE took the roster to 104px, four files were
// swept to `f.y - 90 * ART_SCALE` and six were not, and every offset in those
// six has been landing a third of a body too high ever since — particles above
// heads, a homing shot aiming over its target, a hit test centred off the
// chest. The multiplication is trivial. Knowing it is owed is not, which is
// why it now has a name to be missing, and tools/check_body_scale.mjs fails on
// a bare `f.y - 90` in game code.
//
// NOT for board lengths — a platform, a blast zone, a spawn spacing, a run
// speed. Those deliberately did not follow the roster down (config_tuning.js
// ART_SCALE), and the whole point of the roster shrinking was that the gap
// between body-sized and board-sized opens up.
export const bodyY = (f, up) => f.y - up * ART_SCALE;

/** Centre of mass as a fraction of drawn height — the pivot a tumble turns
 *  about, the point the 3D rig rotates about in-scene, the chest line an aim
 *  solves from, and the centre the airborne prone box hangs off. */
export function comFrac(charKey) {
  const v = BODY_POINTS[charKey]?.com;
  return typeof v === "number" && v > 0.2 && v < 0.9 ? v : COM_BODY_FRAC;
}

/** Did a PERSON place that number, or is it the roster default standing in?
 *
 *  `comFrac` deliberately does not say — every consumer that just needs a
 *  pivot or a chest line is right not to care, and giving them a null to
 *  handle would be noise. But a consumer that JUDGES another measurement
 *  against this one has to know: comparing a frame's baked anchor to 0.55 and
 *  reporting the gap as a disagreement with "this fighter's verified value"
 *  claims a verification that never happened. Seven of the roster are still on
 *  the default (the bench's "centre-of-mass" set is where that is answered),
 *  and their frames were being described exactly that way.
 *
 *  Same distinction `anchorOffset` carries as `measured`, for the same reason
 *  and at the other end of the same comparison. */
export function comVerified(charKey) {
  const v = BODY_POINTS[charKey]?.com;
  return typeof v === "number" && v > 0.2 && v < 0.9;
}

// The muzzle used to be resolved here, as one verified point per character
// beating a height-scaled default. It now has three sources rather than two —
// the rig's measured hand sits between them — and a per-pose entry above the
// per-character one, which is more than a two-line reader should be carrying.
// It lives in src/muzzle.js, next to strike_points.js, which answers the same
// shape of question about the same bodies. This file still OWNS the config it
// reads from; muzzle.js reads `BODY_POINTS[char].muzzle` out of it directly,
// exactly as strike_points.js reads STRIKE_POINTS.

// No ledgeGrip reader: that fact lives in the sprite manifest as a per-frame
// `ledge` anchor (sprites.js ANCHORED_STATES), which is where a point on a
// drawing belongs. See the note in config_body_points.js.

/**
 * How a derived hurtbox was corrected for one state: `w`/`h` scale it, `dx`/`dy`
 * shift it. Cases: stand | crouch | air | hurt | prone | ledge.
 *
 * The identity is 1×1 with no shift, which is what an unreviewed fighter gets —
 * so this reader is a no-op until somebody's decision lands. `dx` is a fraction
 * of the derived WIDTH and points forward along the facing; `dy` is a fraction
 * of the derived HEIGHT and points up. Fractions rather than pixels so a
 * redrawn fighter keeps the correction (config_body_points.js says why).
 */
export function hurtboxFit(charKey, caseKey) {
  const f = HURTBOX_FIT[charKey]?.[caseKey];
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  return {
    w: num(f?.w, 1), h: num(f?.h, 1),
    dx: num(f?.dx, 0), dy: num(f?.dy, 0),
  };
}
