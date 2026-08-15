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
import { HEIGHT_BASE_PX } from "./config_tuning.js";

/** Centre of mass as a fraction of drawn height — the pivot a tumble turns
 *  about, the point the 3D rig rotates about in-scene, the chest line an aim
 *  solves from, and the centre the airborne prone box hangs off. */
export function comFrac(charKey) {
  const v = BODY_POINTS[charKey]?.com;
  return typeof v === "number" && v > 0.2 && v < 0.9 ? v : COM_BODY_FRAC;
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

/** Multipliers on a derived hurtbox for one state, or 1×1. Cases:
 *  stand | crouch | air | hurt | prone | ledge. */
export function hurtboxFit(charKey, caseKey) {
  const f = HURTBOX_FIT[charKey]?.[caseKey];
  return {
    w: Number.isFinite(f?.w) ? f.w : 1,
    h: Number.isFinite(f?.h) ? f.h : 1,
  };
}
