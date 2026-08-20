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
import { updateFighter } from "./fighter.js";
import { updateHitboxes, updateProjectiles, stepHitCredit } from "./combat.js";
import { blankInput, playerInput } from "./input.js";

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
