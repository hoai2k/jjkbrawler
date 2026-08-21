// Experimental feature flags, read once from the URL at module load.
//
// A flag here is a mechanic that ships dark: the code is on main, the game
// ignores it until the URL opts in, and when it graduates the flag comes out
// rather than becoming a setting. A flag that has been turned ON by default is
// half way through that graduation — the mechanic is the game now, and the
// switch survives only so it can be turned off to compare.
//
// Node-side tools (which import the control map, and have no `location`) get an
// empty parameter set, so every flag resolves to its DEFAULT there. That is what
// keeps the generated controls tables describing the game as it actually ships.

const params = typeof location !== "undefined"
  ? new URLSearchParams(location.search)
  : new URLSearchParams();

/** Smash-style grabbing and throwing on RT — **on by default**; `?throw=false`
 *  turns it off. While it is on, RT stops being the second jump button and
 *  becomes grab; everything else about the mechanic lives in src/grab.js. */
export const THROW_ENABLED = params.get("throw") !== "false";

/** `?debug=hitbox` starts the game with the hitbox overlay already on, so a
 *  capture (a smoke run, a bug report, someone watching a single trade in slow
 *  motion) does not depend on somebody remembering to hit backquote first. The
 *  parameter takes a comma-separated list — `?debug=hitbox,foo` — so future
 *  overlays can share it, and the backquote toggle still owns the switch from
 *  there on: this only decides where it starts. */
const DEBUG_MODES = new Set(
  (params.get("debug") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);
export const DEBUG_HITBOXES = DEBUG_MODES.has("hitbox") || DEBUG_MODES.has("hitboxes");

/** CONTACT QUALITY (src/contact.js) — **on by default**; `?contact=false`
 *  turns it off.
 *
 *  It reads the verified strike point to place the impact and to judge how
 *  centred it was, then scales the FX, the sound, the shake and the hitstun by
 *  that. A fighter whose strike point nobody has verified is not judged at all,
 *  so the switch matters most for the ones who ARE: it is how you put a trade
 *  side by side with the same trade under the old flat presentation, which is
 *  the only way to tell whether the tier reads as feel or as noise.
 *
 *  `let`, for the same reason the smoothing flags are: a tool that wants to
 *  measure the game with it off can move it without a reload. */
export let CONTACT_TIER = params.get("contact") !== "false";

/** Turn the contact tier on or off at runtime. Returns the resulting state. */
export function setContactTier(on) {
  CONTACT_TIER = !!on;
  return CONTACT_TIER;
}

/** THE ROSTER'S SIZE, as a multiplier on `HEIGHT_BASE_PX` (config_tuning.js).
 *
 *  1 is the game. Anything else is somebody asking the question the level
 *  design keeps running into: our fighters are about twice the size Smash's
 *  are relative to their board, so a main platform is 5.7 body heights where
 *  Battlefield is 11-14, and a full hop clears 1.03 of a body where Mario's
 *  clears 2.6. Every one of those ratios moves together when this one number
 *  does, which is what makes it worth a knob rather than an argument.
 *
 *  DELIBERATELY NOT A URL FLAG. It is not a mechanic that could ship dark — it
 *  is a measuring instrument for a decision about art, and the only place it
 *  can be judged is the character bench with a fighter under your thumb.
 *  `setRosterScale` (heights.js) is the way to move it, because moving it means
 *  re-deriving every cached measurement of every body. */
export let FIGHTER_SCALE = 1;

/** Set by heights.js setRosterScale — call that, not this. */
export function setFighterScaleRaw(s) {
  FIGHTER_SCALE = Math.max(0.05, Number(s) || 1);
  return FIGHTER_SCALE;
}

/** THE COM-ALIGNED CROSS-FADE — ON, because it is the game now.
 *
 *  It shipped dark while it was being judged, which is what a dark flag is
 *  for: the same fight, twice, one URL apart. It has been judged. `?smooth=`
 *  still reads, so `?smooth=` on its own turns it off for a comparison, but
 *  the default is on and the character bench is where it gets switched.
 *
 *  It had a companion, `?smooth=holds`, which extended the fade to frame steps
 *  inside the slow held loops. That is gone rather than defaulted off: on two
 *  drawings of one stance a fade buys a dissolve nobody wanted and costs an
 *  opacity dip that reads as a flicker, and the honest answer for a 2.2fps
 *  idle is another drawing, not more fading.
 *
 *  Everything this reaches is the fade block in src/render.js, and it cannot
 *  touch the simulation: no hitbox, hurtbox, position or timer is read or
 *  written by any of it. */
const SMOOTH_MODES = new Set(
  (params.get("smooth") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

// `let`, not `const`, and the only reason is the character bench.
//
// An ES module export is a LIVE BINDING: `render.js` imports the name, not the
// value, so re-assigning it here changes what the renderer sees on the very
// next frame with no other file knowing. That is what lets
// `/workbench/?edit=character` put these on switches and have a fighter change
// under you while you hold the stick — which is the only way to judge a
// smoothing experiment, because the thing you are judging is a 70ms difference
// and nobody can hold one in their head across a page reload.
//
// The URL still decides where they START, so every other entry point behaves
// exactly as before, and `setSmoothing` is the only way to move them.
export let SMOOTH_COM_FADE = params.has("smooth")
  ? (SMOOTH_MODES.has("com") || SMOOTH_MODES.has("all"))
  : true;

/** The cross-fade a state change ships with (`SPRITE_XFADE` in render.js). ON,
 *  because it is the game — it is a switch so the bench can turn it OFF and
 *  show the bare cut the alignment is an improvement on. */
export let SPRITE_XFADE_ON = true;


/** Move any of the three. Absent keys are left alone, so a caller can flip one
 *  switch without stating the others. Returns the resulting state, which is
 *  what an indicator light wants to render. */
export function setSmoothing({ com, xfade } = {}) {
  if (com !== undefined) SMOOTH_COM_FADE = !!com;
  if (xfade !== undefined) SPRITE_XFADE_ON = !!xfade;
  return smoothingState();
}

/** What is on right now. */
export function smoothingState() {
  return { com: SMOOTH_COM_FADE, xfade: SPRITE_XFADE_ON };
}
