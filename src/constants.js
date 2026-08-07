export const WORLD = { w: 1280, h: 720 };

export const FIXED_DT = 1 / 60;
export const MAX_FIXED_STEPS = 5;

export const GRAVITY = 2350;
export const MAX_FALL = 1340;
export const FASTFALL_MULT = 1.62;

export const BLAST = { left: -300, right: 1580, top: -420, bottom: 1000 };

// jumping
export const JUMP_BUFFER = 0.15;
// Attack/heavy/special presses are held this long when the fighter can't act
// yet, then fire the moment control returns (see fighter.js).
export const ACTION_BUFFER = 0.12;
export const COYOTE_TIME = 0.1;
export const SHORT_HOP_WINDOW = 0.09;
export const SHORT_HOP_CUT = 0.52;
export const AIR_JUMP_MULT = 0.92;

// dashing
export const DASH_TAP_WINDOW = 0.24;
export const DASH_TIME = 0.22;
export const DASH_MULT = 1.45;

// shield
export const SHIELD_MAX = 100;
export const SHIELD_DRAIN = 22;
export const SHIELD_REGEN = 14;
export const SHIELD_DAMAGE_MULT = 1.5;
export const SHIELD_BREAK_STUN = 2.2;
export const PARRY_WINDOW = 0.12;

// aerial landing lag: landing mid-aerial costs a fraction of that move's
// recovery, so aerials are commitments rather than free pokes
export const AERIAL_LAND_LAG_MULT = 0.6;
export const AERIAL_LAND_LAG_MIN = 0.08;

// dodges
export const ROLL_TIME = 0.42;
export const ROLL_DIST = 210;
export const SPOT_DODGE_TIME = 0.45;
export const AIR_DODGE_TIME = 0.34;
export const DODGE_STALE_WINDOW = 1.4;

// ledges
export const LEDGE_GRAB_X = 44;
export const LEDGE_GRAB_Y_ABOVE = 112;
export const LEDGE_GRAB_Y_BELOW = 60;
export const LEDGE_HANG_X = 28;
export const LEDGE_HANG_Y = 58;

// meter / ultimate
export const METER_MAX = 100;
export const METER_PASSIVE = 1.1;
export const METER_ON_DEAL = 0.5;
export const METER_ON_TAKE = 0.85;

export const RESPAWN_X = { 1: 250, 2: 500, 3: 780, 4: 1030 };
export const DEFAULT_STOCKS = 3;

export const CELL_W = 313.5;
export const CELL_H = 313.6;

// where the feet sit inside a sprite cell when no body-bottom data applies
export const CELL_FOOT_Y = 0.92;
