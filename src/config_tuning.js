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

// ----------------------------------------------------------- strike arcs
//
// The crescent of energy a swing throws out, drawn at the exact distance the
// hitbox reaches (strikeArcs in moves.js decides where; drawStrikeArcs in
// render.js draws it). Nothing here changes what a move hits — the arc reads
// the hitbox, never the other way round — so these are pure look.

export const STRIKE_ARC = {
  // Height of the arc's centre of curvature, as a fraction of the character's
  // rendered height. Sideways swings pivot at the shoulder, so the crescent
  // hangs at the level of an outstretched arm or weapon; rising and falling
  // ones pivot at the hips, which is where the body folds around them.
  armHeight: 0.78,
  hipHeight: 0.50,

  // A forward box whose top edge sits this far below the shoulder is a low
  // strike — a crouch poke, a ground quake — and draws from its own height
  // rather than being dragged up to the arm.
  lowStrike: 0.28,

  // Angular half-width limits, radians. The arc takes its width from the
  // hitbox (`spanOfBox` of the box's cross-measure) and is held between these
  // so a shallow box still curves enough to read as a crescent rather than a
  // stripe, and a huge one does not wrap around the fighter.
  spanOfBox: 0.9,
  spanMin: 0.46,
  spanMax: 1.05,

  // A radius under this is not worth drawing — the arc would be inside the
  // fighter's own art.
  minRadius: 46,

  // Thickness of the band, as a fraction of its radius, and its hard limits.
  // The soft glow around it is drawn at `glowWidth` times this.
  thickness: 0.10,
  thicknessMin: 6,
  thicknessMax: 18,
  glowWidth: 1.7,

  // The swing extends to full reach over this fraction of the active window,
  // starting from this fraction of it — the crescent travels outward rather
  // than switching on at full size.
  reachIn: 0.35,
  reachFrom: 0.74,

  // Faint copies of the arc drawn inside the leading one, each a step closer to
  // the fighter and fainter than the last. They are the swing's own trail: the
  // gap between the end of the art and the far edge of the hitbox is real (see
  // VISIBLE_ART_REACH), and these carry the eye across it instead of leaving
  // the crescent hanging in space.
  echoes: 3,
  echoStep: 0.17,     // fraction of the radius each copy falls back
  echoFade: 0.34,     // and how much of the previous copy's opacity it keeps
  echoNarrow: 0.13,   // and how much of its half-span it gives up, so the
                      // trail closes to a point behind the leading edge
  echoLag: 0.20,      // how far behind the bright head trails, in span units

  // Peak opacity of the glow, the band, and the bright head that runs along
  // the band as the swing travels.
  glowAlpha: 0.22,
  alpha: 0.38,
  headAlpha: 0.55,
  // Width of that head, as a fraction of the arc's half-span.
  headWidth: 0.45,
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
