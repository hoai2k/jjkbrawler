// Experimental feature flags, read once from the URL at module load.
//
// A flag here is a mechanic that ships dark: the code is on main, the game
// ignores it until the URL opts in, and when it graduates the flag comes out
// rather than becoming a setting. Guarded so the Node-side tools (which import
// the control map, and have no `location`) resolve every flag to OFF — which
// is also why the generated controls tables always describe the default game.

const params = typeof location !== "undefined"
  ? new URLSearchParams(location.search)
  : new URLSearchParams();

/** Smash-style grabbing and throwing on RT — `?throw=true`.
 *  While it is on, RT stops being the second jump button and becomes grab;
 *  everything else about the mechanic lives in src/grab.js. */
export const THROW_ENABLED = params.get("throw") === "true";
