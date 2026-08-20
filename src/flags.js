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

/** SPRITE SMOOTHING EXPERIMENTS — `?smooth=com,holds`, or `?smooth=all`.
 *
 *  Both ship dark, which is the point of them being here: the game draws
 *  exactly as it did until the URL asks otherwise, so judging either one is
 *  loading the same fight twice rather than reading a diff. A comma list
 *  because they are meant to be compared apart AND together — the second is
 *  the first's hardest case, since a hold that flicks over between two
 *  drawings of the same stance is where an unaligned fade shows worst.
 *
 *    com     cross-fades line the two drawings up by their CENTRE OF MASS and
 *            slide it between them, instead of fading one body out where it
 *            stood and another in where it stands
 *    holds   the slow held loops (idle, charge, a held grab) cross-fade their
 *            own frame steps, which today are a cut like every other
 *
 *  Everything either flag reaches is in the fade block in src/render.js, and
 *  neither can touch the simulation: no hitbox, hurtbox, position or timer is
 *  read or written by any of it. If they graduate the flags come out; if they
 *  do not, the block goes with them. */
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
export let SMOOTH_COM_FADE = SMOOTH_MODES.has("com") || SMOOTH_MODES.has("all");
export let SMOOTH_HOLD_FADE = SMOOTH_MODES.has("holds") || SMOOTH_MODES.has("all");

/** The cross-fade a state change already ships with (`SPRITE_XFADE` in
 *  render.js). ON, because it is the game — it is a switch so the bench can
 *  turn it OFF and show what the other two are being compared against. */
export let SPRITE_XFADE_ON = true;

/** Move any of the three. Absent keys are left alone, so a caller can flip one
 *  switch without stating the others. Returns the resulting state, which is
 *  what an indicator light wants to render. */
export function setSmoothing({ com, holds, xfade } = {}) {
  if (com !== undefined) SMOOTH_COM_FADE = !!com;
  if (holds !== undefined) SMOOTH_HOLD_FADE = !!holds;
  if (xfade !== undefined) SPRITE_XFADE_ON = !!xfade;
  return smoothingState();
}

/** What is on right now. */
export function smoothingState() {
  return { com: SMOOTH_COM_FADE, holds: SMOOTH_HOLD_FADE, xfade: SPRITE_XFADE_ON };
}
