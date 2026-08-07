// Feel dials — the numbers you change by hand to change how the game FEELS.
//
// Everything here is safe to edit without reading the code that consumes it.
// Nothing in this file is load-bearing for correctness: no value changes what
// a hit connects with, what an animation resolves to, or how the simulation
// steps. The worst a bad number here does is look or feel wrong.
//
// The division of labour across the three files you would edit by hand:
//
//   config_menus.js     content — roster grouping and every player-facing string.
//                 Affects no mechanics at all.
//   config_tuning.js     feel — motion amplitudes, tumble, defence knobs. Affects
//                 how the game reads and plays, never what it contains.
//   constants.js  physics, geometry and match rules — gravity, jump height,
//                 shield economy, blast zones, sprite cell size. Also
//                 tweakable, but these change what the game IS, and code
//                 depends on their relationships.
//
// Background for the motion values is in docs/sprite-motion.md; for the
// defence values, docs/combat-feel.md.

// ------------------------------------------------------------ character size
//
// Fighters are sized from their canon height. `heightCm` in characters.js holds
// the real figure (null where none was ever published); everything below turns
// that into the rendered head-height target the sprites are scaled to, which is
// the single global height control per character.

// Whose height counts as 1.0. Every other fighter is measured against this one.
export const HEIGHT_REFERENCE = "gojo";

// How much of the real height difference to keep. 1 would render the roster at
// true relative scale, which is too wide a spread: hurtboxes are one size for
// everyone (combat.js), so a fighter drawn much larger or smaller than their
// hurtbox reads as hitting or being hit through thin air. 0 makes everyone
// identical. In between keeps the ordering — the tallest is still visibly the
// tallest — while holding the extremes close enough to stay fair.
export const HEIGHT_COMPRESSION = 0.6;

// Hard limits after compression, as a guard against a future outlier rather
// than something the current roster reaches.
export const HEIGHT_MIN_RATIO = 0.84;
export const HEIGHT_MAX_RATIO = 1.14;

// Rendered head height in game pixels for a fighter at ratio 1.0. Chosen so the
// roster's average drawn height is unchanged from before heights were canon —
// the fighters redistribute around it, the game does not globally resize.
export const HEIGHT_BASE_PX = 175.3;

// A fighter with no published height and nothing to infer from. 1.0 means "as
// tall as the reference", which is a neutral default rather than a claim.
export const HEIGHT_UNKNOWN_RATIO = 1.0;

// FALLBACK ONLY. Characters whose idle carries a measured `bodyTop` are scaled
// so the top of the art lands exactly on the target (see idleSpan in
// heights.js); this approximates it from the detected body box for frames
// tools/bake_anchors.py has not reached. Verified constant across the original
// 17 fighters, which is why it works at all.
export const HEAD_ABOVE_BODY = 1.014;

// ---------------------------------------------------------------- anchors

// Fraction of a frame's height above the foot line where the centre of mass
// sits when a sprite carries no measured `anchors.com` — roughly navel height,
// which is where a human body actually pivots. Only a fallback: real values
// are measured offline by tools/bake_anchors.py.
export const COM_BODY_FRAC = 0.55;

// Where an unplaced `ledge` grip starts, as a fraction down the artwork. On a
// hang pose the topmost thing in the frame is the raised hand.
export const LEDGE_GRIP_Y_FRAC = 0.04;

// ----------------------------------------------------------------- tumble

// Above this knockback a launched fighter spins instead of sliding rigidly.
export const TUMBLE_KB_MIN = 620;
// Spin rate per unit of knockback beyond that, and its ceiling. Raise the
// first for more dramatic launches; lower the second if hits get illegible.
export const TUMBLE_SPIN_PER_KB = 0.0055;   // rad/s per unit of knockback
export const TUMBLE_SPIN_MAX = 13.5;        // rad/s

// ------------------------------------------------------- squash & stretch

// Master dial. 0 disables squash & stretch outright, 1 is the tuned amount,
// 0.5 halves it. Deliberately subtle — the values below peak near 4%.
export const SQUASH = 1;

// Depth of each effect, as a fraction off 1. `land: 0.045` compresses the
// sprite 4.5% at the deepest instant of a landing.
export const SQUASH_DEPTH = {
  land: 0.045,
  takeoff: 0.042,
  fall: 0.03,
  hit: 0.03,
};

// How long the landing squash and takeoff stretch take to recover, in seconds.
export const LAND_SQUASH_TIME = 0.17;
export const TAKEOFF_STRETCH_TIME = 0.13;

// ------------------------------------------------------- rotation & sway
//
// Rotations are radians, offsets are pixels. Everything is applied about the
// frame's centre-of-mass anchor except squash, which is anchored at the feet.

export const MOTION = {
  airLean: 0.10,          // rad at full horizontal air speed
  dashLean: 0.085,
  turnLean: 0.07,         // leaning against an abandoned direction mid-pivot
  runSway: 0.022,
  runBob: 1.6,            // px
  idleSway: 0.011,
  idleBob: 1.4,           // px
  breathRate: 4.4,        // rad/s — how fast the idle breathes
  shieldShake: 0.028,     // rad at a fully spent shield
  chargeShake: 0.03,
  chargeShift: 2.2,       // px
  swingBack: 0.065,       // attack anticipation, through startup
  swingThrough: 0.11,     // attack follow-through, through the active window
  hurtLean: 0.10,         // flinch on a hit too small to tumble
  dizzyWobble: 0.075,
  airDodgeTilt: 0.4,
  ledgeLean: 0.12,
  summonSway: 0.045,      // hovering summons
  summonLunge: 0.12,      // and their lean into an attack
};

// ------------------------------------------------------------- afterimages

export const TRAIL_LEN = 5;         // number of ghosts behind a fast fighter
export const TRAIL_STEP = 2;        // sim steps between samples — a longer tail
export const TRAIL_ALPHA = 0.34;    // opacity of the ghost nearest the fighter

// Which states earn a trail, and how strongly. 0 means none.
export const TRAIL_STRENGTH = {
  tumble: 1,
  dodge: 0.85,
  dash: 0.6,
};

// ------------------------------------------------------------------ turns

// Seconds a facing flip takes to sweep the sprite through side-on, rather than
// snapping the mirror in one frame.
export const TURN_TIME = 0.07;

// ---------------------------------------------------------------- defence
//
// The knobs docs/combat-feel.md calls out as the ones to reach for if DI or
// move staling feels wrong. They lived inline in combat.js.

// How far the victim's stick can bend a launch, in radians. ~17 degrees,
// matching the influence a Smash player gets: enough to change where you land,
// never enough to ignore the hit.
export const DI_MAX_TURN = 0.30;
// And how much holding along the launch vector scales its speed, either way.
export const DI_SPEED = 0.08;

// Move staling: how many recent landed moves are remembered, and how much each
// repeat in that queue costs. Floors live alongside their use in combat.js.
export const STALE_QUEUE = 9;
export const STALE_DMG_STEP = 0.09;   // ~0.28x damage at 8 repeats
export const STALE_KB_STEP = 0.06;
