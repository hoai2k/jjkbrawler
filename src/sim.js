// The world step, and the input latch that feeds it.
//
// Everything here used to live inside `main.js`, which is where a MATCH lives:
// the countdown, the clock, KO credit, the round-over banner. Those are the
// rules of a fight. What is below is not — it is the fighters, their hitboxes,
// their projectiles and their summons being moved forward by one fixed step,
// which is the same work whether a match is being played or a single character
// is being looked at on a bench.
//
// It is split out because the character bench (`/workbench/?edit=character`)
// needs exactly this and none of the rest, and a bench that re-implemented the
// step would be a bench that slowly stopped agreeing with the game. The whole
// value of looking at a fighter here is that what you are looking at is what a
// player gets, so there is one implementation and both callers use it.
//
// WHAT IS NOT HERE, ON PURPOSE: anything that decides the outcome of a fight.
// No clock, no stocks, no KO, no intro. `main.js` keeps all of that, and this
// returns nothing — the callers read `state` like everything else does.
import { state } from "./state.js";
import { stepScreenShatter } from "./screen_shatter.js";
import { updateFighter } from "./fighter.js";
import { updateHitboxes, updateProjectiles, stepHitCredit } from "./combat.js";
import { blankInput, playerInput } from "./input.js";
import { updateParticles } from "./particles.js";
import { updateCamera } from "./camera.js";
import { FIXED_DT, MAX_FIXED_STEPS } from "./constants.js";

/** One fixed step of the world: fighters, then everything they spawned.
 *
 *  `inputFor(fighter)` returns the input that fighter is acting on this step.
 *  The caller owns where it comes from — a latched pad in a match, the AI, or a
 *  bench driving one seat — because that is the only difference between the
 *  two callers and it is not this function's business.
 *
 *  ORDER MATTERS and is the order the game has always used:
 *
 *    fighters      each acts on its input; `lastInput` is left on the fighter
 *                  because a summon steers off its owner's stick and reads it
 *                  there rather than having it threaded through every update.
 *    hit credit    stepped OUTSIDE updateFighter, which returns early during
 *                  hitlag — a combo window that froze with its owner would stay
 *                  open through every freeze frame the combo itself caused.
 *    hitboxes,     …then projectiles, then owned entities. An entity whose
 *    entities      owner is in hitlag is skipped, so the freeze frames a
 *                  summon's hit buys are not frames it keeps moving through.
 *                  Stage gimmicks have no owner and never stop.
 */
export function stepWorld(dt, inputFor) {
  // THE WORLD CLOCK, and why it lives here rather than in the match.
  //
  // `state.matchTime` is not a match rule — it is the simulation's own clock,
  // and everything that reads it is at this level: a dash's double-tap window,
  // the shield's parry window, animation phase, and every stage gimmick's
  // schedule (stage_fx.js). It was incremented in main.js's step because that
  // used to be the only step there was, which left the benches running a world
  // frozen at t = 0 — and a board whose hazard is "every 20 seconds" never
  // reached its first second. One step, one tick, whoever is driving.
  state.matchTime += dt;

  for (const f of state.fighters) {
    f.lastInput = inputFor(f) || blankInput();
    updateFighter(f, dt, f.lastInput);
  }
  for (const f of state.fighters) stepHitCredit(f, dt);

  updateHitboxes(dt);
  updateProjectiles(dt);

  for (let i = state.entities.length - 1; i >= 0; i--) {
    const e = state.entities[i];
    if (e.owner && e.owner.hitPause > 0) continue;
    e.update(dt);
    if (e.dead) state.entities.splice(i, 1);
  }

  stepScreenEffects(dt);
}

/** The full-screen effects that outlive the frame that started them. */
export function stepScreenEffects(dt) {
  for (const key of ["screenFlash", "vignette", "domainOverlay"]) {
    const fx = state[key];
    if (!fx) continue;
    fx.life -= dt;
    if (fx.life <= 0) state[key] = null;
  }
}

// ------------------------------------------------------------- the input latch
//
// Edge presses are latched until a simulation step consumes them, so an input
// is never dropped on a stepless frame (a high-refresh display draws more often
// than the sim steps) nor consumed twice when one frame runs several steps.
// A press is sticky until read; a hold and the stick are whatever they are now.

export const PLAYER_IDS = [1, 2, 3, 4];

export function makeLatch(ids = PLAYER_IDS) {
  return Object.fromEntries(ids.map((id) => [id, blankInput()]));
}

/** Fold this frame's reads into the latch. `read(id)` defaults to the real
 *  pads and keyboard; the bench passes its own so a seat can be driven. */
export function latchInputs(latch, read = playerInput) {
  for (const id of Object.keys(latch)) {
    const now = read(Number(id));
    const l = latch[id];
    for (const k of Object.keys(now)) {
      l[k] = k.endsWith("P") ? l[k] || now[k] : now[k];
    }
    l.dirX = now.dirX;
  }
}

/** Called after a step has consumed them: the presses are spent, the holds are
 *  not. */
export function clearLatchedEdges(latch) {
  for (const id of Object.keys(latch)) {
    const l = latch[id];
    for (const k of Object.keys(l)) if (k.endsWith("P")) l[k] = false;
  }
}

// ------------------------------------------------------------------ one frame
//
// THE WHOLE LIVE-WORLD FRAME, so a caller cannot assemble a partial one.
//
// This exists because a caller DID. The character bench started life driving
// `stepWorld` out of its own loop, which is the same simulation the game runs
// — and it still came out wrong, because a frame is not only the simulation.
// It forgot `updateParticles`, so nothing the fight threw off ever expired:
// every spark from every hit and every "KO!" banner stayed exactly where it was
// drawn, and the screen filled with frozen white dots and stuck text. The
// simulation was perfect and the picture was garbage.
//
// The lesson is not "remember the other call". It is that "advance a live world
// by one frame" is a THING, with an order and a clock, and a second caller
// should be given it rather than trusted to rebuild it. So this owns the lot:
// the latch, the fixed-step accumulator, the slow-motion scale, the
// presentation, and the camera. What a caller supplies is the step itself —
// which is the only part that legitimately differs.

// The accumulator is module state because it is a CLOCK: it carries the
// leftover time between frames, and a caller keeping its own would drift from
// the fixed rate the simulation is written against.
let accumulator = 0;

// How far time is slowed for a KO's beat. The presentation layer lives in the
// same time as the fight it presents — during that beat the sparks, the damage
// numbers and the camera slow with the bodies. Feeding them the raw frame dt
// played the game's most dramatic moment at two speeds at once, half on the
// fighters and full on everything around them.
const SLOW_MO_SCALE = 0.45;

/** Advance the live world one frame and return the dt it actually used.
 *
 *    dt      the frame's own delta, in seconds, already clamped by the caller
 *    latch   the input latch this world reads (`makeLatch`)
 *    read    where a seat's input comes from; defaults to the real pads
 *    step    one FIXED step of the world. `main.js` passes the match — which is
 *            `stepWorld` plus the countdown, the clock and the KO — and the
 *            bench passes `stepWorld` and its own respawn.
 *
 *  Drawing is NOT here, and that is deliberate: the two callers draw to
 *  different canvases at different times, and a frame that drew itself would
 *  take that choice away. Everything before the draw is here precisely because
 *  none of it is a choice.
 */
export function advanceWorld(dt, { latch, read, step, scale = 1 }) {
  latchInputs(latch, read);
  // `scale` is a caller's own slow motion — the character bench's speed
  // slider, and nothing in a match. It multiplies the DRAMATIC slow-mo rather
  // than replacing it, so a KO still reads as a KO while the bench is dialled
  // down, and it scales simulated TIME rather than the step: a smaller step
  // would change what the game computes, and a bench showing a different game
  // at 0.1x would be worse than no bench.
  //
  // `state.slowMo` still drains on real time, so a hit-stop lasts as long as
  // it should on the clock rather than being stretched by the slider too.
  let simDt = (state.slowMo > 0 ? dt * SLOW_MO_SCALE : dt) * scale;
  state.slowMo = Math.max(0, state.slowMo - dt);
  // THE HARD HOLD, distinct from slow motion: while it drains (on real time,
  // like slowMo) the sim step is ZERO — fighters, entities, particles and the
  // camera all stand still. Uro's sky-shatter arms it for the crack beat, and
  // the shatter's own clock is stepped below on the raw dt so the cracks keep
  // spreading across the stopped world. That contrast IS the effect; a hold
  // that merely slowed everything would read as lag.
  if (state.simHold > 0) {
    state.simHold = Math.max(0, state.simHold - dt);
    simDt = 0;
  }
  stepScreenShatter(dt);

  accumulator = Math.min(accumulator + simDt, FIXED_DT * MAX_FIXED_STEPS);
  while (accumulator >= FIXED_DT) {
    step(FIXED_DT);
    clearLatchedEdges(latch);
    accumulator -= FIXED_DT;
  }

  updateParticles(simDt);
  updateCamera(simDt);
  return simDt;
}

/** Throw away the leftover time. For a gap that is not elapsed play — a tab
 *  coming back from hidden, a match starting — where the accumulated dt would
 *  otherwise arrive as one enormous catch-up. */
export function resetFrameClock() {
  accumulator = 0;
}
