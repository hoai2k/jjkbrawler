// FX dials — every hand-tweakable number for the effects system that
// docs/effects-plan.md builds: element hit recipes, dash streaks, projectile
// trails, the Black Flash treatment, controller rumble.
//
// Same contract as config_tuning.js: nothing here is load-bearing. No value
// changes what a hit connects with or how the simulation steps — the worst a
// bad number does is look or feel wrong. Edit freely.

// Master scale on every recipe's particle counts. 0.5 halves everything on
// screen, 0 turns element particles off entirely (hits still popup and shake).
export const FX_DENSITY = 1;

// ------------------------------------------------------------- element hits
//
// What lands when a hit connects, per element. A move's `fxElement` wins over
// the character's `fxElement` (characters.js); no element at all means
// "energy", which is exactly the pre-FX look: a theme-colour burst and a white
// spark line. Counts are the base at 0%; damage scales them on top.
//
// The rule these recipes exist to enforce: Maki, Toji and Panda have NO cursed
// energy, so "steel" draws white glints, sparks and dust — never a coloured
// glow.

export const HIT_RECIPES = {
  energy: { burst: 14, sparks: 8 },
  fire:   { flames: 9, embers: 7, smoke: 3 },
  blood:  { droplets: 12, mist: 6 },
  steel:  { glints: 9, sparks: 5, dust: 6 },
  wind:   { streaks: 12, dust: 5 },
  sound:  { rings: 2, streaks: 7 },
  shadow: { smoke: 7, burst: 10 },
  soul:   { ripple: 1, smoke: 6 },
};

// Colour ramps per element. A particle with a ramp walks it over its life —
// fire cools white → orange → deep red, smoke darkens, blood dries.
export const ELEMENT_PALETTES = {
  fire:   ["#fff1b8", "#ffb14a", "#ff6a00", "#8a1b00"],
  ember:  ["#ffd24a", "#ff7a2f", "#b23a10"],
  blood:  ["#c8102e", "#8f0f20", "#4a0308"],
  steel:  ["#ffffff", "#dfe6f2", "#9aa6b8"],
  wind:   ["#f4fbf7", "#dff5e8", "#b8dcc8"],
  sound:  ["#f5e7c4", "#e8d5a8"],
  shadow: ["#3a3f68", "#20244a", "#101228"],
  soul:   ["#d9d2f2", "#a99ede", "#7f74b8"],
  smoke:  ["rgba(120,126,140,0.55)", "rgba(84,88,100,0.45)", "rgba(50,52,62,0.3)"],
};

// --------------------------------------------------------------- dash strike
//
// The twelve side-specials that share `dashStrike` used to spawn ten dust
// motes and nothing else. Now: a fan of velocity-aligned streaks at launch,
// and a boosted afterimage trail for the lunge.
export const DASH_FX = {
  streaks: 9,          // launch streak count (before FX_DENSITY)
  trailTime: 0.3,      // seconds of boosted afterimages after launch
  trailStrength: 0.65, // afterimage strength during it (a plain dash is 0.6)
};
