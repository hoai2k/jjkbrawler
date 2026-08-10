// The 26 animation states, as data — the billboard side of the contract that
// SEMANTIC_ANIMS (src/characters.js) states in sprite terms.
//
// One entry per state a clip can be asked to play. `duration` and `beat` are
// the timing contract from billboards/docs/asset-requests.md: combat is tuned
// so a strike shows the instant its hitbox goes live, and these numbers are
// derived from the sprite animations' fps so a clip and a sprite hit the same
// instants. The engine drives clips by the game's own animTime — nothing here
// stretches a clip to fit.
//
// This file is deliberately dependency-free and DOM-free: the pose player,
// the mannequin's default clip set, the billboard workbench and the intake
// validator (a Node script) all read it, and it is the single place the state
// list lives on this side of the fence. If SEMANTIC_ANIMS gains a state, it is
// added here too — tools/billboard_intake.mjs `check` compares the two.
//
//   loop      the clip repeats; first and last frame must match
//   duration  seconds of clip the engine will play (loop cycle length, or the
//             one-shot's length); "hold" states have a duration too — it is
//             how long the settle takes before the pose freezes
//   beat      seconds in, full extension must be reached (attacks only)
//   tier      who authors it — see the sharing tiers in asset-requests.md:
//             'library'    shared locomotion/defense, retargeted roster-wide
//             'archetype'  the normals, per weapon archetype
//             'identity'   bespoke per fighter

export const STATES = {
  idle:           { loop: true,  duration: 0.909, tier: "library" },
  run:            { loop: true,  duration: 0.308, tier: "library" },
  dash:           { loop: true,  duration: 0.4,   tier: "library" },
  jump:           { loop: true,  duration: 0.4,   tier: "library" },
  fall:           { loop: true,  duration: 0.4,   tier: "library" },
  land:           { loop: false, duration: 0.15,  tier: "library" },
  hurt:           { loop: true,  duration: 0.5,   tier: "library" },
  crouch:         { loop: true,  duration: 0.667, tier: "library" },
  crouchAttack:   { loop: false, duration: 0.18,  beat: 0.09,  aim: true,  tier: "archetype" },
  shield:         { loop: true,  duration: 0.6,   tier: "library" },
  ledge:          { loop: true,  duration: 0.8,   tier: "library" },
  dodge:          { loop: true,  duration: 0.4,   tier: "library" },
  dodge_roll:     { loop: true,  duration: 0.4,   tier: "library" },
  dodge_air:      { loop: true,  duration: 0.4,   tier: "library" },
  light:          { loop: false, duration: 0.167, beat: 0.083, aim: true,  tier: "archetype" },
  airLight:       { loop: false, duration: 0.25,  beat: 0.125, aim: true,  tier: "archetype" },
  sideHeavy:      { loop: false, duration: 0.333, beat: 0.167, aim: true,  tier: "archetype" },
  upHeavy:        { loop: false, duration: 0.4,   beat: 0.167, aim: true,  tier: "archetype" },
  downHeavy:      { loop: false, duration: 0.4,   beat: 0.167, aim: true,  tier: "archetype" },
  charge:         { loop: true,  duration: 0.5,   tier: "identity" },
  specialNeutral: { loop: false, duration: 0.5,   beat: 0.125, aim: true,  tier: "identity" },
  specialSide:    { loop: false, duration: 0.5,   beat: 0.125, aim: true,  tier: "identity" },
  specialDown:    { loop: false, duration: 0.5,   beat: 0.125, tier: "identity" },
  ult:            { loop: true,  duration: 0.286, tier: "identity" },
  dizzy:          { loop: true,  duration: 1.0,   tier: "library" },
  prone:          { loop: true,  duration: 1.0,   tier: "library" },
  win:            { loop: true,  duration: 1.2,   tier: "identity" },
};

// `dodge` is the legacy alias the engine still plays for fighters whose sprite
// set predates dodge_roll/dodge_air (see DEFAULT_ANIMS); a rig never delivers
// it — resolution maps it to dodge_roll. Listed in STATES so an animKey the
// game actually uses is never an unknown state, excluded here so nobody is
// asked to author it.
export const CLIP_STATES = Object.keys(STATES).filter((s) => s !== "dodge");

/** The clip a state plays. Only `dodge` remaps today. */
export function clipNameFor(state) {
  return state === "dodge" ? "dodge_roll" : state;
}

/** Where the clip playhead sits for a state at animTime, honouring the game
 *  clock: loops wrap, one-shots clamp just short of the end so the final pose
 *  holds instead of snapping back to frame zero. */
export function clipTime(state, animTime) {
  const s = STATES[clipNameFor(state)] || STATES.idle;
  if (s.loop) return ((animTime % s.duration) + s.duration) % s.duration;
  return Math.min(Math.max(animTime, 0), s.duration - 1e-4);
}

/** Run-style states report a 4-beat cycle to motion.js (a full stride), which
 *  halves the procedural bob the same way the 4-frame sprite run does. */
export function cycleInfo(state, animTime) {
  const s = STATES[clipNameFor(state)] || STATES.idle;
  const t = animTime / s.duration;
  return { phase: t - Math.floor(t), frames: state === "run" ? 4 : 2 };
}

// ------------------------------------------------------------------- aiming
//
// Attack states flagged `aim: true` accept a TARGET: the strike pitches up or
// down toward a world point — an opponent above on a platform, a crouching
// one below. The game supplies the point (render.js passes `opts.aim`), from
// the controller when the fighter carries an explicit `aimPoint`, otherwise
// automatically at the nearest opponent; the workbench draws it as a
// draggable crosshair. Clips are authored AIM-NEUTRAL — a straight, level
// strike — and the engine adds the pitch at pose time, which is why a clip
// that bakes its own up-or-down angle fights the system.
//
// Pitch is clamped and QUANTISED: it joins the pose-cache key, and a 6° step
// keeps the cache dense while reading as continuous aim at game size.

export const AIM_MAX_DEG = 50;
export const AIM_STEP_DEG = 6;

export function aimable(state) {
  return !!STATES[clipNameFor(state)]?.aim;
}

/** World target -> quantised pitch in radians, from the fighter's chest at
 *  (x, chestY) toward (aim.x, aim.y). Screen y grows downward, so a target
 *  above gives a positive (upward) pitch. `facing` keeps the pitch meaningful
 *  when the target is behind: distance is measured along the facing. */
export function aimPitch(x, chestY, aim, facing = 1) {
  if (!aim) return 0;
  const dx = Math.max(40, (aim.x - x) * (facing < 0 ? -1 : 1));
  const up = chestY - aim.y;
  const deg = (Math.atan2(up, dx) * 180) / Math.PI;
  const clamped = Math.max(-AIM_MAX_DEG, Math.min(AIM_MAX_DEG, deg));
  return (Math.round(clamped / AIM_STEP_DEG) * AIM_STEP_DEG * Math.PI) / 180;
}
