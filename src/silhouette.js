// How big a fighter actually is, measured from their own artwork.
//
// Hitboxes and hurtboxes used to be hand-typed numbers with no relation to the
// sprites: one 64x108 hurtbox for a roster drawn 153-192 px tall, and melee
// boxes reaching about 2.1x as far as the art with the size of that lie varying
// 1.55x-2.89x per character (docs/hitbox-audit.md). This module is the fix. It
// turns the silhouette bounds `tools/bake_anchors.py` bakes into the manifest
// into three numbers per character:
//
//   height   how tall they are drawn, foot line to top of head
//   width    how wide their body is in a neutral pose
//   reach    how far in front of them their committed swing lands
//
// Everything in combat.js and moves.js sizes off those, so redrawing a pose
// retunes the move and neither can drift from the other.
//
// REACH HAS TWO SOURCES, one per kind of backend, and the switch is `source`
// below. The sprite game is measured off the drawings — the strike points a
// person verified on them, `src/strike_reach.js` — and the model backends off
// the rigs. A secondary renderer has no business setting the primary one's
// hitboxes, which is what a single rig-derived number was quietly doing.
//
// Reach is also per-MOVE now, not just per fighter (`moveReach`): each attack
// has its own verified contact point, so each attack has its own range, and the
// scalar here is what is left for the moves that have no forward reach to
// measure and for everything that asks how long a fighter's arms are in
// general.
//
// And the measurement is TEMPERED before it ships (`temper`): the ends of the
// roster come in a few px toward the median, and a hand nudge can move an
// individual. The drawings decide the order; the knobs decide how far apart the
// order spreads. Neither may change the order, and the audit checks.
//
// ---------------------------------------------------------------------------
// Resilience: the art is in flux, and gameplay must not be.
//
// A measurement that tracked the art exactly would mean every re-export, every
// nudge in the workbench and every replacement frame silently changed a
// matchup. So nothing here reads a single frame:
//
//   * every figure is an aggregate over the character's whole COLLECTION of
//     relevant poses, not one pose;
//   * a verified strike point outside a guard band is reported as a fault and
//     NOT used (strike_reach.js reachFaults), so one bad review cannot set a
//     character's range either — the bench asks about it again instead;
//   * the silhouette scan behind it discards the single furthest frame before
//     taking a maximum, so one over-extended or glow-heavy drawing cannot set a
//     character's range;
//   * width takes a median, which a couple of odd frames cannot move at all;
//   * results are BANDED (rounded to a step) so a few pixels of drift does not
//     register as a change at all — art has to move meaningfully before the
//     game notices;
//   * everything is clamped to a guard range expressed as a fraction of the
//     character's own height, so a broken export cannot produce a fighter who
//     reaches across the stage;
//   * a character with no baked bounds at all falls back to the roster median,
//     so a fighter whose art has not landed yet still plays correctly.
//
// The cost of banding is that the numbers are approximate on purpose. That is
// the point: they are estimates from a body of artwork, not a readout of one
// PNG.

import { spriteManifest, frameMeta } from "./assets.js";
import { MODEL_REACH } from "./config_model_reach.js";
import {
  spriteReach, verifiedReach, reachGuard, contactFrame,
} from "./strike_reach.js";
import { resolvedAnim, frameFootY } from "../sprites/src/sprites.js";
import { headHeightTarget, referenceSpan } from "./heights.js";
import { CELL_W, HURTBOX } from "./constants.js";
import { BODY, REACH_NUDGE, STRIKE_REACH } from "./config_tuning.js";
import { clamp } from "./utils.js";

// The animation states whose frames show a committed swing. Named by state
// rather than by frame key so a character who re-points `light` at different
// art is measured from whatever they now actually draw.
// `dashAttack` is listed for when its pose lands (round 20D): until then it
// resolves to the light strike frame already in the list, and measuring the
// same frame twice changes nothing.
const SWING_STATES = ["light", "dashAttack", "dashAttackHeavy", "sideHeavy", "upHeavy", "downHeavy", "airLight", "crouchAttack"];

// And the states that show the body at rest, which is what "how wide is this
// fighter" means. Deliberately excludes anything mid-swing — an outstretched
// arm is reach, not width — and also running and jumping, which are wider
// still: a full stride measures 2-3x an idle (Momo's run is 171 px against a
// 67 px idle), and a fighter is not a bigger target for having legs apart.
const NEUTRAL_STATES = ["idle", "walk"];

// And the ducked states, for how low a crouch actually gets. Measured rather
// than assumed because most of the roster's crouch art does not currently duck
// at all — placed crouch poses run from 0.56 of standing height (Yuji, a real
// crouch) to 1.01 (Jogo, who is simply standing). A fixed fraction would have
// fifteen fighters ducking under attacks on screen while standing upright.
const CROUCH_STATES = ["crouch", "crouchAttack"];

// And the airborne states, for how much of standing height a jump or fall
// pose actually occupies — tucked legs and a lowered head make an airborne
// fighter a shorter target, and the box should know by measurement, not by
// assumption, for the same reason the crouch is measured.
const AIR_STATES = ["jump", "fall"];

const cache = new Map();
const moveCache = new Map();
const paintedCache = new Map();
let rosterCache = null;
let rosterSpanCache = null;

// ---------------------------------------------------------------- source
//
// WHICH ART A FIGHTER IS MEASURED OFF, and it is the art the player is looking
// at — set from render_backend.js when a backend is chosen.
//
// The sprite game and the model games are different games wearing the same
// rules. Reach used to come off the rigs for everybody: a number measured from
// a posed GLB deciding the range of a fighter drawn as a SPRITE, 30-36 px long
// on Mahito and Nanami and 30 px short on Sukuna, with the strike arc — which
// is drawn at the hitbox's own far edge — floating that far off the end of the
// drawing it exists to mark. The sprite backend is the game; the rig is a
// second way to draw it, and a secondary renderer should not be reaching into
// the primary one's hitboxes.
//
// So each backend names the evidence it is drawn from and gets measured off
// that. The cost is honest and accepted: the same fighter has slightly
// different range under `?render=3d`, because under `?render=3d` they are a
// different set of shapes. Every measurement here is cached, so switching
// backends mid-match drops the caches and re-measures rather than leaving one
// backend's numbers on another backend's bodies.
const SOURCES = new Set(["sprite", "model"]);
let reachSource = "sprite";

/** Measure fighters off drawings ("sprite") or off rigs ("model"). Returns the
 *  source in force, which is unchanged if the name is not one. */
export function setReachSource(name) {
  if (!SOURCES.has(name) || name === reachSource) return reachSource;
  reachSource = name;
  refreshSilhouettes();
  return reachSource;
}

/** Which art the measurements are currently coming off. */
export function reachSourceName() {
  return reachSource;
}

/** Drop the cached measurements for a character, or for everyone. The sprite
 *  workbench calls this after an edit; the game never needs to. */
export function refreshSilhouettes(charKey = null) {
  if (charKey) cache.delete(charKey);
  else cache.clear();
  // Per-move reach is keyed by character AND state, so a single-character
  // refresh cannot just delete one entry — and there are a few hundred of
  // them at most, so rebuilding the lot costs nothing worth a smarter index.
  moveCache.clear();
  paintedCache.clear();
  rosterCache = null;
  rosterSpanCache = null;
}

/**
 * Every measurement for one character, in world pixels.
 *
 * Cached, because `hurtbox()` runs against every fighter on every hitbox on
 * every frame. The cache key includes the head-height target, so a workbench
 * edit that resizes a character re-measures them without anyone remembering to
 * ask.
 */
export function bodyMetrics(charKey) {
  const height = headHeightTarget(charKey) || BODY.fallbackHeight;
  const hit = cache.get(charKey);
  if (hit && hit.height === height && hit.source === reachSource) return hit;
  const m = measure(charKey, height);
  cache.set(charKey, m);
  return m;
}

/** How far in front of themselves a character's swing is painted, world px. */
export function artReach(charKey) {
  return bodyMetrics(charKey).reach;
}

/** How wide their body is at rest, world px. */
export function bodyWidth(charKey) {
  return bodyMetrics(charKey).width;
}

/**
 * How far the DRAWING for one attack reaches, world px — the outer edge of the
 * ink on the frame that move strikes on, or null when there is no measurable
 * art for it.
 *
 * The other half of "how far does this attack reach", and the half that decides
 * whether a swing that LOOKS like it connected did. `moveReach` is where the
 * blow lands, a fist's centre placed by a person; this is where the picture
 * stops, sleeve and claw and weapon and smear included. It is the cruder
 * measurement — it cannot tell a fist from the cursed energy around it, which
 * is exactly why it does not set range — but for the question "was anything of
 * this fighter drawn over that opponent" the ink is the honest answer, and
 * moves.js floors every forward hitbox a little way past it.
 *
 * Held inside STRIKE_REACH.max of the fighter's own height, so one glow-heavy
 * frame cannot hand somebody the stage through the floor.
 */
export function paintedReach(charKey, state) {
  if (!state) return null;
  const key = `${charKey}/${state}`;
  const hit = paintedCache.get(key);
  if (hit !== undefined) return hit;
  const frame = contactFrame(charKey, state);
  const raw = frame ? frameReach(charKey, frame, scaleOf(charKey)) : null;
  const height = headHeightTarget(charKey) || BODY.fallbackHeight;
  const out = raw == null ? null : Math.min(raw, height * STRIKE_REACH.max);
  paintedCache.set(key, out);
  return out;
}

/**
 * The shortest and longest reach on the roster, for interpolating anything that
 * treats the two ends differently (ADDED_RANGE). Cached beside the median,
 * and off the same raw measurements, so all three move together.
 */
export function rosterReachSpan() {
  if (rosterSpanCache) return rosterSpanCache;
  const found = [];
  for (const key of Object.keys(spriteManifest?.characters || {})) {
    const { raw } = reachOf(key);
    if (raw != null) found.push(raw);
  }
  rosterSpanCache = found.length
    ? { min: Math.min(...found), max: Math.max(...found) }
    : { min: BODY.fallbackReach, max: BODY.fallbackReach };
  return rosterSpanCache;
}

/**
 * How far ONE attack reaches, world px — the number moves.js builds that move's
 * hitbox from.
 *
 * A fighter's reach is not one number, and pretending it was is why a jab and a
 * spear thrust used to end in the same place. Under the sprite source every
 * attack has its own verified contact point, so every attack gets its own
 * range: Toji's side smash is drawn 132 px out and his crouch poke 42, and the
 * two now say so.
 *
 * Falls back to the fighter's scalar reach — the furthest they get in anything
 * — whenever this particular move has no usable answer: no verified point, a
 * point on art since redrawn, a point outside the guard band
 * (strike_reach.js reachFaults), or a state struck along the centre line rather
 * than out in front (an up smash, a quake), whose `x` is not a reach at all.
 * The model source has no per-move evidence of this kind and always lands here.
 */
export function moveReach(charKey, state) {
  const b = bodyMetrics(charKey);
  if (reachSource !== "sprite" || !state) return b.reach;
  const key = `${charKey}/${state}`;
  const hit = moveCache.get(key);
  if (hit !== undefined) return hit;
  const measured = verifiedReach(charKey, state);
  // The fighter's own tempering, applied to this move as well: their moves keep
  // the proportions the drawings gave them, and only their standing against the
  // rest of the roster moves. See temper().
  const raw = measured == null ? null : measured * b.reachScale;
  const g = reachGuard(charKey);
  // Banded, so a nudge in the bench below the step is invisible to the game —
  // and held to the verified band rather than the scan's, since that is the
  // evidence in hand. `verifiedReach` has already rejected anything outside it,
  // so the clamp is a backstop and not a decision.
  const out = raw == null ? b.reach : band(raw, BODY.reachBand, g.lo, g.hi);
  moveCache.set(key, out);
  return out;
}

/**
 * The roster's median art reach — the yardstick a move's startup and recovery
 * are priced against (moves.js), and the fallback for a fighter whose art has
 * not been measured. Median rather than mean so an outlier at either end does
 * not drag the reference everyone else is judged by.
 */
export function rosterReach() {
  if (rosterCache !== null) return rosterCache;
  const keys = Object.keys(spriteManifest?.characters || {});
  const found = [];
  for (const key of keys) {
    // Same preference as measure(), so the yardstick everyone is priced
    // against moves with the same evidence the individual measurements do —
    // including which backend's art that evidence comes from.
    const { raw } = reachOf(key);
    if (raw != null) found.push(raw);
  }
  rosterCache = found.length ? median(found) : BODY.fallbackReach;
  return rosterCache;
}

// ------------------------------------------------------------- measurement

/** The draw scale heights.js solves, recomputed here rather than read off the
 *  character so this module works before the roster is wired up. */
function scaleOf(charKey) {
  const span = referenceSpan(charKey);
  if (!span) return 0;
  return (headHeightTarget(charKey) || BODY.fallbackHeight) / span;
}

function measure(charKey, height) {
  const scale = scaleOf(charKey);
  const { raw: reachRaw, from: reachFrom } = reachOf(charKey);
  const widthRaw = rawWidth(charKey, scale);

  // Missing art falls back to the roster, scaled to this character's height, so
  // an unmeasured fighter is a normal fighter their own size rather than a
  // fighter shaped like the reference.
  const relative = height / BODY.fallbackHeight;
  const [reachLo, reachHi] = reachBounds(charKey, reachFrom, height);
  const measuredReach = reachRaw ?? rosterReach() * relative;
  const tempered = temper(charKey, measuredReach);
  const reach = band(tempered.value, BODY.reachBand, reachLo, reachHi);
  // Width is compressed toward a typical body before it is banded — see
  // BODY.widthTrust for why the measurement is evidence rather than truth.
  const typical = height * BODY.widthTypical;
  const measuredW = widthRaw ?? BODY.fallbackWidth * relative;
  const width = band(
    typical + (measuredW - typical) * BODY.widthTrust,
    BODY.widthBand, height * BODY.widthMin, height * BODY.widthMax
  );
  // How low this fighter's crouch actually gets, as a fraction of their drawn
  // height. A crouch that ducks is rewarded with a box that ducks; one that
  // does not, is not. It fixes itself as the art lands, which is the point.
  const crouchRaw = poseHeight(charKey, CROUCH_STATES, scaleOf(charKey));
  const crouch = clamp(
    crouchRaw ? crouchRaw / height : HURTBOX.crouchH,
    HURTBOX.crouchMin, HURTBOX.crouchMax
  );
  // ...and how much of standing height an airborne pose occupies, same deal.
  const airRaw = poseHeight(charKey, AIR_STATES, scaleOf(charKey));
  const air = clamp(
    airRaw ? airRaw / height : HURTBOX.airH,
    HURTBOX.airMin, HURTBOX.airMax
  );

  return {
    charKey, height, width, reach, crouch, air,
    measured: reachRaw != null,
    // Which art this fighter was measured off, and which kind of evidence
    // inside it answered — both for the audit, which should be able to say
    // where a range came from without re-deriving it.
    source: reachSource,
    reachFrom,
    // What the art actually said, before the roster-wide compression and any
    // hand nudge (BODY.reachTrust, REACH_NUDGE) — so the audit can print the
    // two side by side and check that tempering has not reordered anybody.
    reachMeasured: measuredReach,
    reachScale: tempered.scale,
    // False means this character's numbers came from art nobody has sized or
    // positioned yet, so they will move once somebody does.
    placed: allPlaced(charKey, SWING_STATES),
  };
}

// The manifest fields that move or resize a drawing. `edited` records the
// PRE-edit value of every field somebody changed by hand in the sprite
// workbench (tools/apply_sprite_adjustments.py writes it), so a frame carrying
// one of these has been through the placement pass.
const PLACEMENT_FIELDS = ["renderScale", "ox", "bodyBottom"];

/**
 * Has this frame been sized and positioned by hand yet?
 *
 * It matters because a freshly delivered sprite lands at numbers the intake
 * pipeline derived, and those are routinely wrong — `renderScale` in
 * particular, which is measured to be corrected on most poses
 * (sprites/docs/sprite-auto-adjust.md). Measuring reach off an unplaced frame reads the
 * pipeline's guess at the art's size, not the art, and would hand a character a
 * range that changes the moment somebody opens the workbench.
 *
 * So an unplaced frame is not evidence. It is skipped while the character has
 * any placed art to go on.
 */
function isPlaced(meta) {
  const edited = meta?.edited;
  return !!edited && PLACEMENT_FIELDS.some((f) => f in edited);
}

/**
 * Frame keys a character draws in any of the given animation states —
 * hand-placed ones only, unless they have none at all.
 *
 * The fallback matters: a fighter whose art has just arrived and been through
 * nothing still has to play. They are measured off their raw delivery and
 * flagged `placed: false`, so the audit tool can say out loud that their range
 * is provisional rather than quietly presenting a guess as a measurement.
 */
function framesFor(charKey, states) {
  const all = new Set();
  for (const state of states) {
    for (const frame of resolvedAnim(charKey, state)?.frames || []) all.add(frame);
  }
  const keys = [...all];
  const placed = keys.filter((k) => isPlaced(frameMeta(charKey, k)));
  return placed.length ? placed : keys;
}

/** True when every measurement for this character came from placed art. */
function allPlaced(charKey, states) {
  const keys = [];
  for (const state of states) {
    for (const frame of resolvedAnim(charKey, state)?.frames || []) keys.push(frame);
  }
  return keys.some((k) => isPlaced(frameMeta(charKey, k)));
}

/**
 * How far past their own centre line a frame's art extends, world px.
 *
 * `bodyLeft` / `bodyRight` are image pixels, so `ox` brings them into cell
 * space where the centre line is CELL_W/2, and a frame the manifest marks
 * `faceLeft` is drawn mirrored — its forward side is the cell's LEFT.
 */
function frameReach(charKey, frameKey, scale) {
  const m = frameMeta(charKey, frameKey);
  if (!m || !Number.isFinite(m.bodyLeft) || !Number.isFinite(m.bodyRight)) return null;
  const ox = m.ox ?? 0;
  const forward = m.faceLeft
    ? CELL_W / 2 - (ox + m.bodyLeft)
    : (ox + m.bodyRight) - CELL_W / 2;
  return forward * scale * (m.renderScale || 1);
}

/**
 * How wide the BODY is in a frame, world px.
 *
 * Off `coreLeft`/`coreRight` — the columns holding the middle of the drawing's
 * ink — rather than its outer bounds, because Maki's naginata, Gakuganji's
 * guitar and Momo's broom are all held across the body in an idle, and a
 * fighter should not be a wider target for carrying something that cannot be
 * hit. Falls back to the outer bounds for art the core measurement has not
 * reached.
 */
function frameWidth(charKey, frameKey, scale) {
  const m = frameMeta(charKey, frameKey);
  if (!m) return null;
  const lo = Number.isFinite(m.coreLeft) ? m.coreLeft : m.bodyLeft;
  const hi = Number.isFinite(m.coreRight) ? m.coreRight : m.bodyRight;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return (hi - lo) * scale * (m.renderScale || 1);
}

/**
 * Reach before banding, off whichever art is being drawn.
 *
 * SPRITE: the verified strike points first (strike_reach.js) — a person said
 * where each blow lands on each drawing, which is the only measurement that can
 * tell a fist from the cursed energy around it. The silhouette scan below is
 * the fallback for a fighter nobody has walked through the bench yet, and it
 * reads the outer edge of the ink, smears and all.
 *
 * MODEL: the rig (config_model_reach.js, regenerated by
 * tools/derive_attack_envelopes.mjs), where bones and prop shafts are exactly
 * the things that can hit. Same fallback, for a character with no rig.
 *
 * Either way the answer passes through the same banding and height-fraction
 * guards in measure(), so a bad bake or a bad review cannot hand a fighter the
 * stage.
 */
function reachOf(charKey) {
  if (reachSource === "model") {
    const rig = MODEL_REACH[charKey]?.reach;
    if (rig != null) return { raw: rig, from: "rig" };
  } else {
    const verified = spriteReach(charKey);
    if (verified != null) return { raw: verified, from: "verified" };
  }
  const scan = rawReach(charKey, scaleOf(charKey));
  return scan != null ? { raw: scan, from: "art" } : { raw: null, from: "roster" };
}

/**
 * The measurement, tempered into a range.
 *
 * Two steps, both of them deliberate distortions of what the art says, and both
 * documented where their knobs live (BODY.reachTrust, REACH_NUDGE):
 *
 *   1. the fighter's distance from the roster median is compressed, so the ends
 *      of the roster come in a few px toward the middle;
 *   2. a hand-typed nudge is added for the individuals somebody has played and
 *      found wrong anyway.
 *
 * Step 1 is a straight line through the median, so it cannot reorder the
 * roster and a median fighter does not move. Step 2 can, which is why the audit
 * checks that it has not.
 *
 * Returns a RATIO as well as the value, because a fighter's per-move reaches
 * have to move with their scalar: the tempering is a statement about how long
 * this fighter's arms are against everybody else's, not about how their own jab
 * compares to their own spear. Scaling all their moves by the same factor keeps
 * that second thing exactly as drawn.
 */
function temper(charKey, raw) {
  if (raw == null || !(raw > 0)) return { value: raw, scale: 1 };
  const ref = rosterReach() || raw;
  const value = ref + (raw - ref) * BODY.reachTrust + (REACH_NUDGE[charKey] || 0);
  return { value, scale: value / raw };
}

/**
 * Which height-fraction band a piece of evidence is held to.
 *
 * A verified point gets the wide one, because it is a person's decision about a
 * drawing and the guard is only there to catch a misclick (STRIKE_REACH). A
 * scan or a bake gets the narrow one, because neither knows what it is looking
 * at and a broken export should not be able to hand a fighter the stage.
 * Getting this backwards is what clamped Maki — the longest weapon on the
 * roster — down to below the median.
 */
function reachBounds(charKey, from, height) {
  if (from === "verified") {
    const g = reachGuard(charKey);
    return [g.lo, g.hi];
  }
  return [height * BODY.reachMin, height * BODY.reachMax];
}

/**
 * Reach before banding: the furthest the art gets in a swing, having thrown
 * away the single furthest frame.
 *
 * Dropping the top one is what makes this survive the art changing. The frame
 * that reaches furthest is exactly the frame most likely to be an outlier — a
 * pose delivered at the wrong zoom, a weapon drawn past the edge of its cell,
 * an effect baked into the sheet — and taking a plain maximum would hand a
 * character's whole range to it. The second-furthest still describes a
 * committed swing, and it takes two bad frames rather than one to move it.
 */
function rawReach(charKey, scale) {
  if (!scale) return null;
  const values = framesFor(charKey, SWING_STATES)
    .map((k) => frameReach(charKey, k, scale))
    .filter((v) => v != null)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  return values.length >= BODY.reachDropTopFrom
    ? values[values.length - 2]
    : values[values.length - 1];
}

/** The tallest the art gets in any of these states, world px above the foot
 *  line. Tallest rather than median because a two-frame crouch is a dip and a
 *  hold, and the box has to cover the fighter through both. */
function poseHeight(charKey, states, scale) {
  if (!scale) return 0;
  let best = 0;
  for (const key of framesFor(charKey, states)) {
    const m = frameMeta(charKey, key);
    if (!m || !Number.isFinite(m.bodyTop)) continue;
    best = Math.max(best, (frameFootY(m) - (m.oy ?? 0) - m.bodyTop) * scale * (m.renderScale || 1));
  }
  return best;
}

/** Width before banding: the median of the resting poses. */
function rawWidth(charKey, scale) {
  if (!scale) return null;
  const values = framesFor(charKey, NEUTRAL_STATES)
    .map((k) => frameWidth(charKey, k, scale))
    .filter((v) => v != null);
  return values.length ? median(values) : null;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Round to a step, then hold inside a guard range. The rounding is the whole
 *  resilience story in one line: below the step size, art changes are invisible
 *  to the simulation. */
function band(value, step, lo, hi) {
  return clamp(Math.round(value / step) * step, lo, hi);
}
