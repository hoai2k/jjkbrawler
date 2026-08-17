// "Play it" — the shared effect art, in the action that spawns it.
//
// The Other Sprites panel can say a great deal about a drawing (what draws it,
// how tall, which point it is painted around) and still leave the only question
// that matters unanswered: does it LOOK right when the move goes off. A lance
// of blood is a picture until you see it leave the finger.
//
// So this plays the move. The fighter runs their real sprite animation for the
// state the special uses, the projectile spawns where the game would spawn it,
// flies at the speed the kit declares, and is painted through the same
// arithmetic render.js paints it with — the workbench's own unsaved nudge, size
// and rotation included. What you are looking at is the change you just made.
//
// TWO POINTS, AND THE WHOLE REASON THIS EXISTS
//
//   the SPAWN POINT   where the game creates the projectile: the fighter's
//                     position plus the move's `ox`/`oy`. It is what the shot
//                     collides from, and it belongs to the KIT.
//   the DRAWING       painted around that point, moved by `dx`/`dy`, which is
//                     what the workbench edits.
//
// Aligning art to a point is one job; putting the point on the character's
// finger is a different one, and until now only the first was reachable. Both
// are draggable here, they are drawn in different colours, and they export
// separately — `dx`/`dy` as the drawing's adjustment, `spawnOx`/`spawnOy` as a
// note against the move, because the kit is where that number has to land.

import { CHARACTERS, CHARACTER_KEYS } from "../../src/characters.js";
import { STATES, clipTime } from "../../render3d/src/states.js";
import { drawCharFrame, currentFrame } from "../src/sprites.js";
import { loadFrame, getImage, loadSharedImage } from "../../src/assets.js";
import { bodyMetrics } from "../../src/silhouette.js";
import { spawnOffset, REFERENCE_MUZZLE } from "../../src/muzzle.js";
import { meteorAt, METEOR_FALL, sharedAdjust, sharedAttack,
         AURA_H, AURA_PULSE, AURA_FOOT_DY } from "../../src/shared_sprites.js";
import { SUMMON_ANIMS, SUMMON_POSES } from "../../src/config_summons.js";
import { HEIGHT_BASE_PX } from "../../src/config_tuning.js";

/** The animation state each special slot plays (src/specials.js). */
const SLOT_STATE = { neutral: "specialNeutral", side: "specialSide", down: "specialDown" };
/** spawnProjectile's defaults, for a move that names no muzzle of its own. */
const DEFAULT_OX = 70;
const DEFAULT_OY = -86;

/**
 * Who fires this drawing, and with what. Walks the kits the way the shared
 * registry does, but keeps what a PLAYBACK needs and the registry throws away:
 * the character key, the animation state, and the projectile config itself.
 *
 * Returns null for art no kit fires — a stage hazard, a domain backdrop, a
 * creature — which is the honest answer: there is no "action" to play.
 */
/**
 * The ULTIMATES that throw a real projectile, and the config they throw it with.
 *
 * A special declares its shot in the kit, so `p` is the whole answer. A
 * director does not: Gojo's Hollow Purple charges for 0.55s and then calls
 * spawnProjectile with numbers written into src/ultimates.js — `speed: 860`,
 * `ox: 90`, `oy: -96`, a radius of half the move's declared width. The kit says
 * `width` and `duration`; the handler says everything else.
 *
 * So the handler's half is recorded here, the same way the shared registry
 * records each spawn site's launch point, and for the same reason: a drawing
 * the game throws should be previewable, and Hollow Purple was showing a spawn
 * crosshair and a travel arrow with no way to see the shot they describe.
 */
const ULT_SHOTS = {
  beam: (p) => [{ sprite: p.sprite,
    p: { ...p, speed: 860, ox: 79, oy: -78, r: p.width / 2, dur: p.duration } }],
  // Mode: Absolute throws TWO drawings from one director — a volley of homing
  // orbs, then the cannon — so a director's entry is a list. Reading only the
  // first left effect:pigeon_orb with no action at all, and it is the one of
  // the two whose size is hardest to guess.
  // Bird Strike is the same shape: the flock as one shot, then four crows
  // behind it, both through spawnProjectile from inside the handler.
  birdstrike: (p) => [
    { sprite: p.sprite,
      p: { ...p, speed: p.speed, ox: 80, oy: -100, r: p.r, dur: 1.6 } },
    { sprite: "effect:crow",
      p: { ...p, speed: p.speed * 0.55, ox: 40, oy: -80, r: 26, dur: 1.8,
           homing: 120, spriteH: 84 } },
  ],
  // Megumi's DEATH SWARM: eight volleys of homing fish, the last one bigger.
  deathSwarm: (p) => [
    { sprite: p.sprite,
      p: { ...p, speed: 620, ox: 70, oy: -86, r: 30, dur: 1.4, homing: p.homing ?? 260,
           spriteH: (p.spriteH || 90) * 1.8 } },
  ],
  cannonade: (p) => [
    { sprite: p.sprite,
      p: { ...p, speed: 940, ox: 71, oy: -83, r: (p.width || 170) / 2,
           dur: p.duration || 1.2 } },
    { sprite: p.orbSprite,
      p: { ...p, speed: 460, ox: 54, oy: -150, r: p.orbR ?? 22, dur: 1.9,
           homing: 190, spriteH: p.orbSpriteH || 64 } },
  ],
};

/**
 * The ULTIMATES that drop something onto a target instead of throwing it.
 *
 * Jogo's Maximum: Meteor never calls spawnProjectile — its director pushes an
 * entity that paints the drawing falling from `y: -160` to the floor over
 * `fallTime`, above the OPPONENT's x (src/ultimates.js, `meteor`). There is no
 * muzzle and no `ox`/`oy`, so the shot machinery had nothing to offer it and
 * the drawing had no Play button at all — leaving the two questions it most
 * needs answered, how big and at what angle, answerable only in a real match.
 *
 * `delay` is the beat before it appears and `to` its offset above the floor at
 * impact; the approach itself — where it enters, and how its apparent size
 * grows on the way in — is `meteorAt`, which the director calls too, so the
 * playback cannot drift from the fall the game draws.
 */
const ULT_DROPS = {
  meteor: (p) => ({ ...p, delay: 0.5, to: -40, fall: p.fallTime ?? 1.1 }),
};

/**
 * The SPECIALS that flash a drawing beside the fighter instead of throwing one.
 *
 * Mahito's Idle Transfiguration reaches out and touches a soul: no projectile
 * leaves him, so `firingUse` found nothing and the drawing had no action to
 * play. What the game actually does is `spawnSummonFlash` (src/specials.js) —
 * paint the art standing on the floor a set distance in front of him, fade it
 * up and back down over half a second — and, separately, swing an unblockable
 * MELEE box. Four moves work this way and none of them could be previewed.
 *
 * The box matters as much as the drawing: it is the reach, the art is the
 * picture of the reach, and the only question worth asking of the picture is
 * whether it covers the box. So it is recorded here and drawn as an outline.
 *
 * `forward` is how far in front the drawing stands, `h` its height, `life` the
 * fade; `box` is the hit the move really lands, in the same fighter-relative
 * units spawnMelee takes. All read off the handlers, so a change there is one
 * grep from being a change here.
 */
const FLASH_MOVES = {
  burst: (p) => ({
    life: 0.52, height: p.spriteH || 220, forward: p.spriteForward || 105,
    box: { ox: p.ox ?? 70, oy: p.oy ?? -96, w: p.w || 170, h: p.h || 104 },
  }),
  commandGrab: (p) => ({
    life: 0.5, height: p.spriteH || 150, forward: p.spriteForward || 78,
    box: { ox: 24, oy: -104, w: p.range || 120, h: 110 },
  }),
  swap: (p) => ({ life: 0.42, height: p.spriteH || 190, forward: 0, box: null }),
  echoStrike: (p) => ({
    life: 0.3, height: p.spriteH || 140, forward: 80,
    box: { ox: p.ox ?? 70, oy: p.oy ?? -96, w: (p.w || 170) * 1.15, h: (p.h || 104) * 1.15 },
  }),
};

/**
 * The SPECIALS that put something on the stage and leave it there.
 *
 * A trap is planted a set distance in front (or on the opponent), takes
 * `armTime` to come up, and hits anything inside `w`×`h` for `lifetime`
 * seconds. A cloud field is the same shape with a different clock: it is up
 * immediately and ticks for `duration`. Both stand on the floor, both are
 * exactly as big as their box says, and neither had an action to play — so
 * eight drawings whose whole job is to fill a rectangle could only be judged
 * against a rectangle nobody could see.
 *
 * `armed` is when it becomes dangerous, `life` when it goes away, and `box`
 * the rectangle it fills — drawn beside it for the same reason the flash's
 * reach is: the art is a picture of that rectangle.
 */
const PLANTED_MOVES = {
  trap: (p) => ({
    dist: p.atOpponent ? null : (p.dist || 220), height: p.spriteH || p.h,
    armed: p.armTime ?? 0.5, life: (p.armTime ?? 0.5) + (p.lifetime ?? 3),
    box: { w: p.w, h: p.h }, what: "a trap — comes up, then hits anything inside it",
  }),
  cloudField: (p) => ({
    dist: p.dist || 210, height: p.spriteH || p.h,
    armed: 0, life: p.duration ?? 2.4,
    box: { w: p.w, h: p.h },
    what: `a field — ticks ${p.tickDmg ?? 0}% every ${p.tickRate ?? 0.5}s while you stand in it`,
  }),
};

/**
 * The SPECIALS that drop an object out of the sky onto the opponent.
 *
 * Reggie's Big-Ticket Item picks one of `drops` at random and falls it onto
 * the enemy's head; his cardrop does the same with a car. Each drop names its
 * own art and its own `w`/`h`, so the entry is per DRAWING rather than per
 * move — which is why this one is resolved differently from the rest: the
 * playback needs the drop, not just the special.
 */
const DROP_MOVES = new Set(["randomDrop", "cardrop"]);

/**
 * A DOMAIN's backdrop: the whole screen, behind everybody.
 *
 * Nine drawings that are not placed at all — they are cover-fitted over the
 * stage while the domain runs, so there is no spawn point and no size to set.
 * That made them look like art with no question to ask, and they were left with
 * no action; but the question they DO have is whether two fighters read against
 * them, and that is only answerable with two fighters standing on one.
 */
const BACKDROPS = new Set([
  "domain:unlimited_void", "domain:malevolent_shrine", "domain:shadow_garden",
  "domain:self_embodiment", "domain:iron_mountain", "domain:mutual_love",
  "domain:captivating_skandha", "domain:idle_death_gamble", "effect:domain_gamble",
]);

/**
 * The STAGE's own art: hazards a stage spawns, with nobody casting them.
 *
 * Four drawings that belong to no kit at all — the fang that rises out of the
 * floor, the bloom, the hung lantern, the curse that wanders. `firingUse`
 * walked the kits and so could never reach them. The heights and anchors are
 * the registry's own (STAGE_FX in shared_sprites.js), which is where stage_fx.js
 * reads them, so the size shown is the size drawn.
 */
const HAZARDS = {
  "stagefx:stage_fang": { h: 72, anchor: "centre", life: 1.6,
    rise: true, what: "rises out of the floor and dives back" },
  "stagefx:stage_flower": { h: 46, anchor: "feet", life: 2.0,
    what: "a bloom, open on the platform" },
  "stagefx:stage_lantern": { h: 44, anchor: "top", life: 2.0,
    sway: true, what: "hangs from its cord and swings" },
  "stagefx:stage_weak_curse": { h: 60, anchor: "feet", life: 2.4,
    wander: true, what: "wanders the stage" },
};

/**
 * The drawings a fighter WEARS rather than throws.
 *
 * An install aura is painted around the body every frame while the install
 * runs, breathing between 0.82 and 0.94 of its nominal height and skirting the
 * floor (AURA_PULSE / AURA_FOOT_DY). Panda's rampage is the same shape with a
 * different picture: `applyInstall` with a `sprite`, drawn as a BODY over him.
 *
 * Neither throws anything, so `firingUse` found nothing and eleven auras plus
 * the triceratops had no action — on the one class of drawing whose whole
 * question is how it sits on a body, which is unanswerable from a plate.
 */
const WORN = {
  aura: () => ({ pulse: true, foot: AURA_FOOT_DY, height: AURA_H, glow: true }),
  rampage: (p) => ({ pulse: false, foot: 0, height: p.spriteH || 210, glow: false }),
};

/**
 * The ULTIMATES that paint their own drawing, at a point they work out.
 *
 * Nine directors call `getImage` and `drawImage` straight, with no projectile
 * and no creature in between — so nothing in the shot, drop, flash or planted
 * machinery could reach them. Each entry is that handler's arithmetic: where
 * the art goes over the action's life, how tall, and which way round.
 *
 *   `at(u, S)`    position; `u` runs 0..1 across `life`, and `S` is the stage
 *                 geometry (FIGHTER_X, ENEMY_X, GROUND) — these recipes are
 *                 module-level and the stage is not, so it is handed in
 *   `h(u, p)`     height at that moment — several of these grow as they land
 *   `anchor`      "centre" or "feet", matching the handler's own drawImage
 *   `flip`        mirrored to the caster's facing, as the handler does it
 *
 * Read off src/ultimates.js and src/specials.js; a change there is one grep
 * from being a change here.
 */
const DIRECTORS = {
  // Gakuganji's chord, centred on him and beating.
  concert: (p) => ({
    life: 1.6, anchor: "centre", flip: false,
    at: (u, S) => ({ x: S.FIGHTER_X, y: S.GROUND - 110 }),
    h: (u) => (p.spriteH || 300) * (0.9 + 0.1 * Math.sin(u * 22)),
    what: "beats around the caster",
  }),
  // Toji's nail storm sweeps the whole stage at a fixed height.
  nailstorm: (p) => ({
    life: 1.4, anchor: "centre", flip: true,
    at: (u, S) => ({ x: -100 + u * 1100, y: S.GROUND - 258 }),
    h: () => p.spriteH || 290,
    what: "sweeps across the stage",
  }),
  // Geto's uzumaki travels forward at its own speed.
  vortex: (p) => ({
    life: 1.6, anchor: "centre", flip: false,
    at: (u, S) => ({ x: S.FIGHTER_X + u * (p.speed || 300) * 1.6, y: S.GROUND - 150 }),
    h: () => p.spriteH || 250,
    what: "travels forward, grinding",
  }),
  // Hanami's tempest stands in the middle of the stage and rises out of it.
  tempest: (p) => ({
    life: 2.2, anchor: "feet", flip: false,
    at: (u, S) => ({ x: 450 + Math.sin(u * 7) * 12, y: S.GROUND }),
    h: () => p.spriteH || 650,
    what: "stands on the floor and rises out of it",
  }),
  // Mei Mei's sky palm opens where it lands, growing as it arrives.
  warpStrike: (p) => ({
    life: 0.9, anchor: "centre", flip: false,
    at: (u, S) => ({ x: S.ENEMY_X, y: S.GROUND - 110 }),
    h: (u) => (p.spriteH || 150) * (0.6 + u * 0.5),
    what: "opens on the target",
  }),
  // Inverted Sky: a shard over the opponent's head, swelling.
  skyInvert: (p) => ({
    life: 1.4, anchor: "centre", flip: false,
    at: (u, S) => ({ x: S.ENEMY_X, y: S.GROUND - 140 }),
    h: (u) => (p.spriteH || 260) * (0.7 + Math.min(1, u * 1.4) * 0.5),
    what: "hangs over the target and swells",
  }),
  // Inumaki's shout leaves the mouth and widens.
  shout: (p) => ({
    life: 1.1, anchor: "centre", flip: true,
    at: (u, S) => ({ x: S.FIGHTER_X + 120, y: S.GROUND - 105 }),
    h: (u) => (p.spriteH || 330) * (0.65 + u * 1.0),
    what: "leaves the mouth and widens",
  }),
  // Reggie's sedan falls onto the target and then slides through.
  cardrop: (p) => ({
    life: 2.0, anchor: "feet", flip: false,
    at: (u, S) => (u < 0.45
      ? { x: S.ENEMY_X, y: S.GROUND - 200 + (u / 0.45) * 200 }
      : { x: S.ENEMY_X + (u - 0.45) * (p.slideSpeed || 760) * 1.2, y: S.GROUND }),
    h: () => p.spriteH || 170,
    what: "falls onto the target, then keeps going",
  }),
};

/**
 * THE CREATURES, and the fighter whose kit keeps each one.
 *
 * A creature was the largest class of drawing with no action to play, and the
 * most expensive one to be blind about: what a summon DOES is its behaviour,
 * and behaviour is where the surprises are. A bomber walks into you and
 * detonates, so its contact is its whole body on purpose; a support hovers at
 * its summoner's shoulder and shoots and never touches anybody at all. Neither
 * fact is visible in a still, and both change what its art has to show — the
 * Spitter had a bite box placed on it that nothing would ever read, and one
 * look at it hovering and spitting would have said so.
 *
 * Walks the pools the way the registry does, keeping the fighter, the pool
 * entry, and the special that summons it.
 */
/** An install's aura, or a rampage's body: art painted ON the fighter. */
function wornUse(charKey, slot, spec, spriteKey) {
  const p = spec?.p;
  if (!p) return null;
  const kind = p.aura === spriteKey ? "aura"
    : (DIRECTORS[spec.type] ? null : (spec.type === "rampage" && p.sprite === spriteKey ? "rampage" : null));
  if (!kind) return null;
  return {
    charKey, slot, spec, mode: "worn",
    state: slot === "ult" ? "ult" : (SLOT_STATE[slot] || "specialNeutral"),
    name: spec.name || p.label || spriteKey,
    p: { ...p, ...WORN[kind](p), kind },
  };
}

function summonUse(spriteKey, preferChar) {
  const order = preferChar && CHARACTERS[preferChar]
    ? [preferChar, ...CHARACTER_KEYS.filter((k) => k !== preferChar)]
    : CHARACTER_KEYS;
  for (const charKey of order) {
    const c = CHARACTERS[charKey];
    // An ULTIMATE can put a creature down too, and the two biggest things in
    // the game arrive that way: Mahoraga, and Kurourushi's brood.
    const slots = Object.entries(c?.specials || {});
    if (c?.ultimate) slots.push(["ult", c.ultimate]);
    for (const [slot, spec] of slots) {
      // A summon comes two ways: a POOL the move rolls from (Geto's jar,
      // Megumi's shikigami), or ONE creature the move always puts down —
      // Maki's Garuda, Mahoraga, the roach swarm. Reading only pools left five
      // creatures with no action, including the two biggest things in the game.
      // A creature comes three ways: a POOL the move rolls from, ONE creature a
      // move always puts down, and OFFSPRING an install breeds while it runs —
      // Kurourushi's brood, which is a creature nested a level deeper than the
      // other two and so had no action at all.
      const pool = spec?.p?.pool
        || (spec?.type === "summon" && spec.p ? [spec.p] : [])
        || [];
      if (spec?.p?.offspring) pool.push(spec.p.offspring);
      for (const entry of pool) {
        // The creature is its OWN art, at the head of the stack. A stand-in
        // behind it is a fallback the creature's poses supersede, and playing
        // the creature's behaviour under a stand-in's name would be showing
        // art the game does not draw there (see supersededStandIn).
        for (const cfg of [entry, ...(entry.units || entry.members || [])]) {
          if (cfg.sprites?.[0] !== spriteKey && entry.sprites?.[0] !== spriteKey) continue;
          return {
            charKey, slot, spec, cfg: { ...entry, ...cfg }, mode: "summon",
            state: slot === "ult" ? "ult" : (SLOT_STATE[slot] || "specialDown"),
            name: entry.name || spec.name || spriteKey,
            p: { ...entry, ...cfg },
          };
        }
      }
    }
  }
  return null;
}

/**
 * @param spriteKey  the drawing to find an action for.
 * @param preferChar the fighter whose effects list this was opened from. A
 *   drawing more than one kit fires has no single answer to "who fires it", and
 *   the walk's first hit is the wrong one whenever you are standing in somebody
 *   else's list — the same reason `sharedOwner` prefers the context character.
 *   Aligning art to a body is worthless against the wrong body.
 */
export function firingUse(spriteKey, preferChar) {
  // A backdrop is cover-fitted behind everything; nobody casts it into a place.
  if (BACKDROPS.has(spriteKey)) {
    return { charKey: "yuji", slot: null, spec: null, mode: "backdrop", state: "idle",
             name: spriteKey.split(":")[1].replace(/_/g, " "), p: {} };
  }
  // Stage art has no caster to walk the kits for.
  const hazard = HAZARDS[spriteKey];
  if (hazard) {
    return { charKey: "yuji", slot: null, spec: null, mode: "hazard", state: "idle",
             name: spriteKey.replace("stagefx:", "").replace(/_/g, " "),
             p: { ...hazard } };
  }
  const order = preferChar && CHARACTERS[preferChar]
    ? [preferChar, ...CHARACTER_KEYS.filter((k) => k !== preferChar)]
    : CHARACTER_KEYS;
  for (const charKey of order) {
    const c = CHARACTERS[charKey];
    const ult = c?.ultimate;
    const drop = ULT_DROPS[ult?.type];
    if (drop && ult?.p?.sprite === spriteKey) {
      return {
        charKey, slot: "ult", spec: ult, p: drop(ult.p), state: "ult", mode: "drop",
        name: ult.name || spriteKey,
        muzzleScale: bodyMetrics(charKey).height / HEIGHT_BASE_PX,
      };
    }
    // Art the fighter WEARS, and art the director paints itself. Checked before
    // the shot table because several of these hang off a kit that also names a
    // projectile, and the drawing decides which is being asked about.
    const worn = wornUse(charKey, "ult", ult, spriteKey);
    if (worn) return worn;
    const director = DIRECTORS[ult?.type];
    if (director && ult?.p?.sprite === spriteKey) {
      return {
        charKey, slot: "ult", spec: ult, mode: "director", state: "ult",
        name: ult.name || spriteKey,
        p: { ...ult.p, ...director(ult.p) },
      };
    }
    const shots = ULT_SHOTS[ult?.type] ? ULT_SHOTS[ult.type](ult.p) : [];
    const shot = shots.find((x) => x.sprite === spriteKey);
    if (shot) {
      const p = shot.p;
      const solved = spawnOffset(charKey, "ult", p.ox, p.oy);
      return {
        charKey, slot: "ult", spec: ult, p, state: "ult",
        name: ult.name || spriteKey,
        ox: p.ox, oy: p.oy, solved,
        muzzleScale: bodyMetrics(charKey).height / HEIGHT_BASE_PX,
      };
    }
    for (const [slot, spec] of Object.entries(c?.specials || {})) {
      const p = spec?.p;
      // `sprite` names the one drawing a move throws; `spritePool` names four
      // it picks between, one per shot — Geto's volley throws a random cursed
      // spirit. Both are thrown by the same handler from the same muzzle, so
      // both have an action to play, and only the first was being offered one:
      // all four curses had the Play button greyed out with no way to see how
      // they are used. `sprites` stays out — that is a creature's stand-in
      // stack, and a creature is not fired.
      // A DROP names its art per object rather than on the move: three
      // different things fall out of one special, each with its own size.
      if (DROP_MOVES.has(spec.type)) {
        const d = (p?.drops || []).find((x) => x.key === spriteKey)
          ?? (p?.sprite === spriteKey ? { key: spriteKey, name: p.label, h: p.spriteH, w: p.r * 2 } : null);
        if (d) {
          return {
            charKey, slot, spec, mode: "planted", state: SLOT_STATE[slot] || "specialDown",
            name: d.name || spec.name || spriteKey,
            p: { dist: null, height: d.h, armed: p.armTime ?? p.fallTime ?? 0.55,
                 life: (p.armTime ?? p.fallTime ?? 0.55) + 0.6,
                 falls: true, box: { w: d.w, h: d.h },
                 what: "falls onto the opponent, hits where it lands, and is gone" },
          };
        }
      }
      const wornHere = wornUse(charKey, slot, spec, spriteKey);
      if (wornHere) return wornHere;
      // A director is not only an ultimate: Mei Mei's Sky Palm is a SPECIAL
      // that paints its own ripple where it lands, and checking ults alone left
      // it out.
      const dir = DIRECTORS[spec?.type];
      if (dir && p?.sprite === spriteKey) {
        return {
          charKey, slot, spec, mode: "director",
          state: SLOT_STATE[slot] || "specialNeutral",
          name: spec.name || p.label || spriteKey,
          p: { ...p, ...dir(p) },
        };
      }
      const inPool = Array.isArray(p?.spritePool) && p.spritePool.includes(spriteKey);
      if (!p || (p.sprite !== spriteKey && !inPool)) continue;
      const planted = PLANTED_MOVES[spec.type];
      if (planted) {
        return {
          charKey, slot, spec, mode: "planted", state: SLOT_STATE[slot] || "specialDown",
          name: spec.name || p.label || spriteKey, p: { ...p, ...planted(p) },
        };
      }
      const flash = FLASH_MOVES[spec.type];
      if (flash) {
        return {
          charKey, slot, spec, p: { ...p, ...flash(p) }, mode: "flash",
          state: SLOT_STATE[slot] || "specialNeutral",
          name: spec.name || p.label || spriteKey,
          muzzleScale: bodyMetrics(charKey).height / HEIGHT_BASE_PX,
        };
      }
      // `wave` is spawnProjectileScaled with `wave: true` — a shot that rides
      // the floor rather than flying free. Same launch, same flight, so the
      // shot playback is right for it and excluding it left Dagon's tides with
      // no way to be seen moving.
      if (spec.type && spec.type !== "projectile" && spec.type !== "wave") continue;
      // The point the game will really spawn from: this fighter's hand in the
      // pose this move plays, plus whatever the move asks for beyond the
      // reference (src/muzzle.js). `source` says whether anybody has looked at
      // that hand, which the caption repeats — a muzzle nobody has placed is a
      // roster-wide guess and worth knowing about before art is aligned to it.
      const state = SLOT_STATE[slot] || "specialNeutral";
      const solved = spawnOffset(charKey, state, p.ox, p.oy);
      return {
        charKey, slot, spec, p, state,
        name: spec.name || p.label || spriteKey,
        ox: Number.isFinite(p.ox) ? p.ox : DEFAULT_OX,
        oy: Number.isFinite(p.oy) ? p.oy : DEFAULT_OY,
        solved,
        muzzleScale: bodyMetrics(charKey).height / HEIGHT_BASE_PX,
      };
    }
  }
  return summonUse(spriteKey, preferChar);
}

/**
 * The preview itself: a fighter, a floor, and the shot leaving them on a loop.
 *
 * `read` is asked for the drawing's live adjustment every frame rather than
 * once, so dragging a marker or turning a dial shows up in the next frame of
 * the same playthrough — the point of previewing here rather than in the game.
 */
export function makeEffectPreview({ canvas, read, write, onClose }) {
  const ctx = canvas.getContext("2d");
  const GROUND = canvas.height - 70;
  const FIGHTER_X = 190;
  // Somebody to aim at. A shot with `homing` bends toward whoever it is chasing
  // and a meteor falls on their head, so an empty stage was showing neither:
  // the ember arc looked like a plain lob because there was nothing for it to
  // lean toward, and the meteor had no x to fall at. Far enough away that the
  // bend is visible over the shot's own flight time.
  const ENEMY_X = 640;
  /** Who stands there: anybody but the fighter casting. */
  const enemyFor = (charKey) => (charKey === "yuji" ? "megumi" : "yuji");
  /** What the shot chases, in the shape combat.js's homing reads. */
  const targetPoint = () => ({ x: ENEMY_X, y: GROUND });

  let use = null;

  /** The spawn point in GAME px from the fighter's feet, for kit offsets `ox`
   *  and `oy` — the fighter's own hand plus the move's displacement from the
   *  reference. Exactly what combat.js resolves, so the shot is drawn where the
   *  game will make it. */
  const solve = (ox, oy) => spawnOffset(use.charKey, use.state, ox, oy);

  /** A dragged canvas point back into the KIT units the kit has to hold: undo
   *  the hand and the body scale that `solve` applied. Without this a muzzle
   *  tuned until it looked right landed wrong by the fighter's own scale, and
   *  once a hand is verified the raw canvas number stops meaning anything at
   *  all — the kit's job is to say how far from the hand, not where. */
  function toKit(pt) {
    const home = solve(REFERENCE_MUZZLE.x, REFERENCE_MUZZLE.y);   // the hand itself
    const k = use.muzzleScale || 1;
    return {
      spawnOx: Math.round((pt.x - FIGHTER_X - home.x) / k + REFERENCE_MUZZLE.x),
      spawnOy: Math.round((pt.y - GROUND - home.y) / k + REFERENCE_MUZZLE.y),
    };
  }
  let raf = 0;
  let t = 0;
  let running = false;
  let drag = null;
  let grabbed = false;
  let lastTick = 0;

  /** Where the shot is, in canvas pixels, `age` seconds after it left.
   *
   *  The muzzle is resolved rather than read off the kit: the fighter's own
   *  hand — verified, measured off their rig, or the reference scaled onto
   *  their height — with the move's offset on top. Drawing the raw kit number
   *  put the shot a few pixels off the hand it leaves, and meant the number
   *  being dragged here was not the number the kit wants. */
  function shotAt(age, adj) {
    const dir = 1; // the preview always fires to the right
    const m = solve(adj.spawnOx ?? use.ox, adj.spawnOy ?? use.oy);
    const x0 = FIGHTER_X + dir * m.x;
    const y0 = GROUND + m.y;
    const g = use.p.gravity || 0;
    const home = { x0, y0, source: m.source };
    // A shot that chases nobody has a closed form; a shot with `homing` does
    // not — combat.js bends it a little every frame toward the target, so the
    // only honest way to draw the path is to walk it the way the game walks it
    // (src/combat.js, the homing block). Fixed step so the same `age` always
    // lands in the same place however the browser paces its frames.
    let x = x0, y = y0, vx = dir * (use.p.speed || 500), vy = use.p.vy || 0;
    if (!use.p.homing) {
      return { ...home, x: x0 + vx * age, y: y0 + vy * age + 0.5 * g * age * age,
               vx, vy: vy + g * age };
    }
    const target = targetPoint();
    const STEP = 1 / 120;
    for (let t = 0; t < age; t += STEP) {
      const dt = Math.min(STEP, age - t);
      vx += Math.sign(target.x - x) * use.p.homing * dt * 8;
      vy += Math.max(-220, Math.min(220, (target.y - 60) - y)) * dt * 3;
      vy += g * dt;
      x += vx * dt;
      y += vy * dt;
    }
    return { ...home, x, y, vx, vy };
  }

  /** Where a DROPPED drawing is, `age` seconds in: straight down onto the
   *  target's head, at the speed src/ultimates.js falls it. */
  function dropAt(age) {
    const p = use.p;
    const impactY = GROUND + p.to;
    // The game's own approach curve, not a re-derivation of it: a straight-line
    // entry seen through a lens, so the rock reads as far away and arriving
    // fast rather than descending at one size (src/shared_sprites.js, meteorAt).
    const f = meteorAt(p, (age - p.delay) / p.fall, ENEMY_X, impactY);
    return {
      x0: ENEMY_X, y0: impactY,     // where the drawing's nudge is measured
      x: f.x, y: f.y, persp: f.scale,
      vx: 0, vy: 0, visible: age >= p.delay,
    };
  }

  /** Where a FLASHED drawing stands: a fixed distance in front of the fighter,
   *  on the floor, fading up and back down. spawnSummonFlash anchors it at the
   *  feet rather than at its middle — the one placement rule that differs from
   *  every other site here, and the reason aligning it by eye never worked. */
  function flashAt(age) {
    const p = use.p;
    return {
      x0: FIGHTER_X + p.forward, y0: GROUND + 12,
      x: FIGHTER_X + p.forward, y: GROUND + 12,
      vx: 0, vy: 0, foot: true,
      alpha: Math.sin(Math.min(1, age / p.life) * Math.PI) * 0.9,
      visible: age <= p.life,
    };
  }

  // ------------------------------------------------------------- a creature
  //
  // What a summon does, run forward from the moment it lands. Not the game's
  // own entity — that wants a match around it — but the same numbers driving
  // the same three behaviours, so the thing the canvas shows is the thing the
  // creature is: a chaser closing and biting on its cooldown, a bomber walking
  // in and detonating, a support hovering at the shoulder and spitting.

  const APPEAR = 0.35;          // the arrival fade (summons.js, APPEAR_TIME)

  /** How long one full showing of this creature takes. */
  function summonCycle() {
    const c = use.cfg;
    const travel = Math.abs(reach()) / Math.max(60, c.speed || 300);
    // A bomber spends itself the moment it arrives, so the tail after it is a
    // tail with nothing in it: give it just long enough to read the blast and
    // then start again. A long one meant the crawler was OFF SCREEN for half
    // of every loop, which looks exactly like a preview that is not working.
    if (c.behavior === "bomber") return APPEAR + travel + 0.75;
    return APPEAR + travel + (c.behavior === "support" ? 2.4 : 1.6);
  }

  /** How far the creature has to cover to reach its quarry — from where it is
   *  put down to where it wants to stand. */
  function reach() {
    const c = use.cfg;
    const from = FIGHTER_X - (c.backOff ?? 60);
    return ENEMY_X - (c.standOff ?? 0) - from;
  }

  /** Where the creature is, and what it is doing, `age` seconds in. */
  function summonAt(age) {
    const c = use.cfg;
    const t = Math.max(0, age - APPEAR);
    const appear = Math.min(1, age / APPEAR);
    if (c.behavior === "support") {
      // It never travels: it holds station behind and above its summoner and
      // shoots from there. `hover` is the whole of its movement.
      const cd = c.attack?.cd ?? 1.0;
      return {
        x: FIGHTER_X - (c.hover?.back ?? 70), y: GROUND - (c.hover?.up ?? 150),
        dir: 1, appear, anim: "idle", flying: true,
        shot: t > 0.5 ? ((t - 0.5) % cd) / cd : null,
      };
    }
    const from = FIGHTER_X - (c.backOff ?? 60);
    const span = reach();
    const speed = c.speed || 300;
    const arriveAt = Math.abs(span) / speed;
    const walking = t < arriveAt;
    const x = from + Math.sign(span) * Math.min(Math.abs(span), speed * t);
    if (walking) return { x, y: GROUND, dir: 1, appear, anim: "move" };
    // Arrived. A bomber spends itself on contact; a chaser bites on a cooldown.
    const since = t - arriveAt;
    if (c.behavior === "bomber") {
      return { x, y: GROUND, dir: 1, appear, anim: "attack",
               blast: since < 0.55 ? since / 0.55 : 1, gone: since > 0.06 };
    }
    const cd = c.attack?.cd ?? 0.8;
    const phase = since % cd;
    return { x, y: GROUND, dir: 1, appear, anim: phase < 0.26 ? "attack" : "idle",
             biting: phase < 0.26 };
  }

  /** The creature's own drawing for the pose it is holding — the same
   *  resolution summons.js does, so a creature with pose plates animates and
   *  one without holds its single still. */
  function summonImage(anim) {
    const base = use.spriteKey;
    const frames = SUMMON_ANIMS[anim]?.frames || ["idle_a"];
    const drawn = frames.map((pose) => getImage(`${base}:${pose}`)).filter(Boolean);
    if (!drawn.length) return getImage(base);
    const fps = SUMMON_ANIMS[anim]?.fps || 2.4;
    return drawn[Math.floor(t * fps) % drawn.length];
  }

  function drawSummon(adj) {
    const c = use.cfg;
    const s = summonAt(t);
    const img = summonImage(s.anim);
    const h = (c.h ?? 110) * (adj.scale || 1);

    // The ring the game tightens under an arriving summon.
    if (s.appear < 1) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.4 * s.appear;
      ctx.strokeStyle = c.color || "#8fd3ff";
      ctx.lineWidth = 2 + 3 * s.appear;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, h * 0.5 * (1.6 - 0.9 * s.appear), h * 0.13, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // A bomber that has gone off is GONE — that is the point of a bomber, and
    // a preview that kept drawing it standing there would be hiding the one
    // fact about it that matters most.
    if (!s.gone && img) {
      const w = img.width * h / img.height;
      ctx.save();
      ctx.globalAlpha = s.appear;
      ctx.translate(s.x, s.y);
      // Same rule summons.js follows: the art faces right and is mirrored to
      // face left. The preview always walks right, so it is never mirrored —
      // and while this still carried the OLD rule it drew every creature
      // backwards, which is the fault it was built to catch.
      ctx.scale(s.dir > 0 ? 1 : -1, 1);
      ctx.shadowColor = c.color || "#8fd3ff";
      ctx.shadowBlur = 14;
      if (adj.rot) ctx.rotate(adj.rot);
      ctx.drawImage(img, -w / 2 + (adj.dx || 0), -h + (adj.dy || 0), w, h);
      ctx.restore();
    }

    // WHAT IT HITS WITH, which is the whole question its art has to answer.
    // A bomber's is its own body and it spends it once; a chaser's is a box on
    // the front of it, on a cooldown; a support never touches anybody, so it
    // gets a shot instead of a box and the absence is the answer.
    if (s.blast != null) {
      const r = (c.attack?.r || 90) * (0.3 + 0.7 * s.blast);
      ctx.save();
      ctx.globalAlpha = 1 - s.blast;
      ctx.strokeStyle = "#ffd35a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y - h * 0.45, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffd35a";
      ctx.font = "11px ui-monospace, monospace";
      const label = `detonates — ${Math.round(c.attack?.r || 90)}px blast`;
      ctx.fillText(label, Math.min(s.x - r, canvas.width - ctx.measureText(label).width - 8),
        s.y - h * 0.45 - r - 6);
      ctx.restore();
    } else if (!s.flying && img) {
      const box = sharedAttack(use.spriteKey)
        ?? (c.behavior === "bomber" ? { x: 0, y: 0.5, w: 1, h: 1 }
                                    : { x: 0.28, y: 0.52, w: 0.44, h: 0.76 });
      const w = img.width * h / img.height;
      ctx.save();
      ctx.strokeStyle = s.biting ? "#ff8f6f" : "#6fb0e8";
      ctx.setLineDash(s.biting ? [] : [5, 4]);
      ctx.globalAlpha = s.appear * (s.biting ? 1 : 0.5);
      ctx.strokeRect(s.x + box.x * w - (box.w * w) / 2, s.y - box.y * h - (box.h * h) / 2,
        box.w * w, box.h * h);
      ctx.restore();
    }
    if (s.shot != null) {
      // Its projectile, on the arc it really fires: out of the hover, aimed at
      // whoever it is watching.
      const p = c.attack?.projectile || {};
      const flight = s.shot * (c.attack?.cd ?? 1.0);
      ctx.save();
      ctx.fillStyle = p.color || c.color || "#8fd3ff";
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(s.x + (p.speed || 560) * flight, s.y + flight * 90, p.r || 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return s;
  }

  /** Where a PLANTED drawing sits: on the floor at its own distance, or on the
   *  opponent's head when the move says so. A drop falls onto that point over
   *  its arm time; a trap or a field is simply there. */
  function plantedAt(age) {
    const p = use.p;
    const x = p.dist == null ? ENEMY_X : FIGHTER_X + p.dist;
    if (!p.falls) {
      return { x0: x, y0: GROUND, x, y: GROUND, vx: 0, vy: 0, foot: true,
               armed: age >= p.armed, visible: age <= p.life,
               alpha: Math.min(1, age * 3) * Math.min(1, (p.life - age) * 2) };
    }
    const prog = Math.min(1, age / p.armed);
    return { x0: x, y0: GROUND, x, y: -140 + prog * (GROUND + 140),
             vx: 0, vy: 0, foot: true, landed: prog >= 1, armed: prog >= 1,
             visible: age <= p.life,
             alpha: prog < 1 ? 1 : Math.max(0, 1 - (age - p.armed) / 0.6) };
  }

  /** Art the fighter wears: around the body, breathing, skirting the floor. */
  function wornAt() {
    return { x0: FIGHTER_X, y0: GROUND + (use.p.foot || 0),
             x: FIGHTER_X, y: GROUND + (use.p.foot || 0),
             vx: 0, vy: 0, foot: true };
  }

  /** A stage hazard, on the floor doing whatever it does. */
  function hazardAt(age) {
    const p = use.p;
    const u = (age % p.life) / p.life;
    const x = ENEMY_X - 160 + (p.wander ? Math.sin(u * Math.PI * 2) * 120 : 0);
    const rise = p.rise ? Math.sin(u * Math.PI) : 1;
    return {
      // The marker belongs on the point the drawing is measured from, which for
      // a hung lantern is the cord above it rather than the floor below.
      x0: x, y0: GROUND - (p.anchor === "top" ? 210 : 0),
      x, y: GROUND - (p.anchor === "top" ? 210 : 0),
      vx: 0, vy: 0,
      foot: p.anchor === "feet", top: p.anchor === "top",
      sway: p.sway ? Math.sin(u * Math.PI * 2) * 0.12 : 0,
      h: p.h * (p.rise ? Math.max(0.15, rise) : 1),
    };
  }

  /** Where a director's own drawing is, `u` of the way through its action. */
  function directorAt(age) {
    const p = use.p;
    const u = Math.max(0, Math.min(1, age / p.life));
    const at = p.at(u, { FIGHTER_X, ENEMY_X, GROUND });
    return { x0: at.x, y0: at.y, x: at.x, y: at.y, vx: 0, vy: 0,
             foot: p.anchor === "feet", h: p.h(u, p), visible: age <= p.life };
  }

  /** The point the drawing is measured from, whichever way this action puts it
   *  on the stage: a shot's muzzle, or the top of a drop's fall. */
  const originAt = (adj) => (use.mode === "drop" ? dropAt(use.p.delay + use.p.fall)
    : use.mode === "flash" ? flashAt(0)
    : use.mode === "summon" ? { x0: FIGHTER_X - (use.cfg.backOff ?? 60), y0: GROUND }
    : use.mode === "planted" ? plantedAt(use.p.armed)
    : use.mode === "worn" ? wornAt()
    : use.mode === "director" ? directorAt(0)
    : use.mode === "hazard" ? hazardAt(0)
    : use.mode === "backdrop" ? { x0: FIGHTER_X, y0: GROUND }
    : shotAt(0, adj));

  /** The projectile, painted exactly as render.js paints it. */
  function drawShot(sprite, pos, adj, age) {
    // `persp` is the drop's apparent size — the rock is a speck when it enters
    // and full size when it lands. The nudge shrinks with it for the same
    // reason it does in the director: dx/dy correct the drawing, and a
    // correction measured at arrival would throw the speck off its own path.
    const persp = pos.persp ?? 1;
    // Several actions decide the height themselves, and two of them change it
    // over the action's life — a sky shard swells as it lands, an aura breathes.
    const own = (use.mode === "director" || use.mode === "hazard") ? pos.h
      : use.mode === "worn" ? use.p.height * (use.p.pulse
          ? AURA_PULSE.base + AURA_PULSE.amp * Math.sin(age * AURA_PULSE.rate) : 1)
      : (use.mode === "flash" || use.mode === "planted") ? use.p.height
      : null;
    const h = (own ?? (use.p.spriteH || use.p.r * 3)) * (adj.scale || 1) * persp;
    const w = sprite.width * h / sprite.height;
    ctx.save();
    // The same ramp drawProjectiles applies (sharedFadeIn), read live so the
    // slider under the canvas shows up on the next loop of the same playthrough
    // — which is the only way to judge it, since a few frames of fade is a
    // thing you see in motion or not at all.
    if (adj.fadeIn) ctx.globalAlpha = Math.min(1, age / adj.fadeIn);
    // A flash has a fade of its own, written into the handler rather than into
    // the drawing — showing it at full opacity would be showing something the
    // game never draws.
    if (pos.alpha != null) ctx.globalAlpha *= pos.alpha;
    ctx.translate(pos.x, pos.y);
    // A dropped drawing is painted upright — its director never mirrors it and
    // never turns it into its fall, so the only tilt it has is the standing
    // one, and previewing it under the projectile's flight rotate would show a
    // meteor lying on its side that the game draws nose-down.
    if (use.mode === "flash" || (use.mode === "director" && use.p.flip)
        || (use.mode === "worn" && use.p.kind === "rampage")) {
      ctx.scale(-1, 1);   // mirrored to the caster's facing, as the handler does
    } else if (use.mode !== "drop" && use.mode !== "planted"
               && use.mode !== "worn" && use.mode !== "director") {
      const flip = pos.vx > 0 ? -1 : 1;
      if (use.p.vy || use.p.gravity || use.p.homing) ctx.rotate(Math.atan2(-flip * pos.vy, -flip * pos.vx));
      ctx.scale(flip, 1);
    }
    if (adj.rot) ctx.rotate(adj.rot);
    ctx.shadowColor = use.p.color || "#8fd3ff";
    ctx.shadowBlur = 12;
    // A flash stands on the floor; everything else is painted around its
    // middle. Same drawing, two anchors, and the handler's is the one to match.
    // Three anchors, because the game has three: standing on the point, hung
    // from it, or painted around it (ANCHOR_WORDS in the sprite bench).
    const top = pos.foot ? -h : pos.top ? 0 : -h / 2;
    if (pos.sway) ctx.rotate(pos.sway);
    ctx.drawImage(sprite, -w / 2 + (adj.dx || 0) * persp, top + (adj.dy || 0) * persp, w, h);
    ctx.restore();
  }

  function marker(x, y, colour, label, filled) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    filled ? ctx.fill() : ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 13, y); ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y); ctx.lineTo(x + 13, y);
    ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 13);
    ctx.stroke();
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(label, x + 16, y - 8);
    ctx.restore();
  }

  async function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastTick) / 1000 || 0);
    lastTick = now;
    const dur = use.mode === "drop" ? use.p.delay + use.p.fall + 0.3
      : use.mode === "flash" ? use.p.life
      : use.mode === "summon" ? summonCycle()
      : use.mode === "planted" ? use.p.life
      : use.mode === "worn" ? 1.6
      : use.mode === "director" ? use.p.life + 0.25
      : use.mode === "hazard" ? use.p.life
      : use.mode === "backdrop" ? 2.0
      : (use.p.dur || 0.9);
    const cycle = Math.max(STATES[use.state]?.duration || 0.5, dur) + 0.35;
    t = (t + dt) % cycle;

    const adj = read();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f1424";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // A DOMAIN GOES DOWN FIRST, cover-fitted over the whole stage, because
    // that is what it is: everything else in the scene is painted on top of it.
    if (use.mode === "backdrop") {
      const img = getImage(use.spriteKey);
      if (img) {
        const cover = Math.max(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * cover, h = img.height * cover;
        ctx.drawImage(img, (canvas.width - w) / 2 + (adj.dx || 0),
          (canvas.height - h) / 2 + (adj.dy || 0), w, h);
      }
    }
    ctx.strokeStyle = "#2c3654";
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(canvas.width, GROUND);
    ctx.stroke();

    // The fighter, on their own animation for the state this move plays.
    const animT = Math.min(t, STATES[use.state]?.duration ?? t);
    const cf = currentFrame(use.charKey, use.state, animT);
    await loadFrame(use.charKey, cf).catch(() => {});
    drawCharFrame(ctx, use.charKey, cf, FIGHTER_X, GROUND,
      { scale: CHARACTERS[use.charKey]?.scale, facing: 1 });

    // The target, standing where the shot is aimed. Drawn for every action so
    // the flight has a scale to be judged against, and REQUIRED by the two that
    // are about a target: a homing shot bends toward this body and a meteor
    // falls on it. Dimmed, because it is scenery for this question.
    ctx.save();
    ctx.globalAlpha = 0.75;
    const ek = enemyFor(use.charKey);
    const ef = currentFrame(ek, "idle", t);
    await loadFrame(ek, ef).catch(() => {});
    drawCharFrame(ctx, ek, ef, ENEMY_X, GROUND,
      { scale: CHARACTERS[ek]?.scale, facing: -1 });
    ctx.restore();

    // Kept out here because the shot's caption names where its muzzle came
    // from, and that is a fact the playback works out rather than one the panel
    // already knows.
    let pos = null;
    if (use.mode === "backdrop" || use.mode === "summon") {
      if (use.mode === "summon") drawSummon(adj);
    } else {
      pos = use.mode === "drop" ? dropAt(t)
        : use.mode === "flash" ? flashAt(t)
        : use.mode === "planted" ? plantedAt(t)
        : use.mode === "worn" ? wornAt()
        : use.mode === "director" ? directorAt(t)
        : use.mode === "hazard" ? hazardAt(t)
        : shotAt(t, adj);
      const sprite = getImage(use.spriteKey);
      if (sprite && t <= dur && pos.visible !== false) drawShot(sprite, pos, adj, t);
    }

    // The two points, always visible: the one the game spawns from and the one
    // the drawing is centred on after the nudge. A drop has no muzzle to place
    // — the director picks the target's x, and nothing about that is the
    // drawing's to move — so only the drawing marker is offered.
    const origin = originAt(adj);
    // The reach this move really lands, where the move has one: the drawing is
    // a picture of it, and whether the picture covers it is the whole question.
    if (use.mode === "flash" && use.p.box) {
      const b = use.p.box;
      ctx.save();
      ctx.strokeStyle = "#6fb0e8";
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(FIGHTER_X + b.ox - b.w / 2, GROUND + b.oy - b.h / 2, b.w, b.h);
      ctx.fillStyle = "#6fb0e8";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText("reach", FIGHTER_X + b.ox - b.w / 2 + 3, GROUND + b.oy - b.h / 2 - 4);
      ctx.restore();
    }
    // A creature has no second point: it is put down at its own feet and its
    // nudge is measured from there, so the two markers would sit on top of one
    // another and only one of them would be draggable.
    if (!["summon", "drop", "flash", "planted", "worn", "director", "hazard", "backdrop"]
        .includes(use.mode)) {
      marker(origin.x0, origin.y0, "#9fd39f", "spawn", false);
    }
    // What it fills, for a thing whose whole job is to fill it.
    if (use.mode === "planted" && use.p.box?.w) {
      const b = use.p.box;
      const live = plantedAt(t).armed;
      ctx.save();
      ctx.strokeStyle = live ? "#ff8f6f" : "#6fb0e8";
      ctx.setLineDash(live ? [] : [5, 4]);
      ctx.globalAlpha = live ? 1 : 0.55;
      ctx.strokeRect(origin.x0 - b.w / 2, GROUND - b.h, b.w, b.h);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(live ? "live" : "arming", origin.x0 - b.w / 2 + 3, GROUND - b.h - 4);
      ctx.restore();
    }
    if (use.mode !== "backdrop") {
      marker(origin.x0 + (adj.dx || 0), origin.y0 + (adj.dy || 0), "#f0b45a", "drawing", true);
    }

    ctx.fillStyle = "#8b96b3";
    ctx.font = "12px ui-monospace, monospace";
    const nudge = `drawing dx ${(adj.dx || 0).toFixed(1)}, dy ${(adj.dy || 0).toFixed(1)}`;
    if (use.mode === "backdrop") {
      ctx.fillText(`${use.name} — a domain backdrop, cover-fitted over the whole stage`, 14, 22);
      ctx.fillText("no spawn point and no size: it fills the screen behind everybody. "
        + "The question is whether the fighters read against it.", 14, 40);
    } else if (use.mode === "hazard") {
      ctx.fillText(`${use.name} — the stage's own, no caster · ${use.p.h}px`, 14, 22);
      ctx.fillText(`${use.p.what}   ·   ${nudge}`, 14, 40);
    } else if (use.mode === "worn") {
      ctx.fillText(`${use.name} — ${use.charKey} · ${use.p.kind === "aura" ? "install aura" : "worn body"}`
        + ` · ${use.p.height}px${use.p.pulse ? ", breathing" : ""}`, 14, 22);
      ctx.fillText(`painted ON the fighter for as long as the install runs`
        + (use.p.foot ? `, ${use.p.foot}px below their feet` : "") + `   ·   ${nudge}`, 14, 40);
    } else if (use.mode === "director") {
      ctx.fillText(`${use.name} — ${use.charKey} · painted by its own director`
        + ` · ${use.p.life}s`, 14, 22);
      ctx.fillText(`${use.p.what}   ·   ${nudge}`, 14, 40);
    } else if (use.mode === "planted") {
      const p = use.p;
      ctx.fillText(`${use.name} — ${use.charKey} · ${p.box?.w ?? "?"}x${p.box?.h ?? "?"} on the floor`
        + (p.dist == null ? ", on the opponent" : `, ${p.dist}px in front`)
        + ` · ${p.life.toFixed(2)}s`, 14, 22);
      ctx.fillText(`${p.what}   ·   ${nudge}`, 14, 40);
    } else if (use.mode === "summon") {
      const c = use.cfg;
      const WHAT = {
        chaser: "closes and bites on its cooldown — the box is what it hits with",
        bomber: "walks in and DETONATES — its whole body is the contact, so there is no bite to place",
        support: "hovers at the shoulder and shoots — it never touches anybody, so it has no bite at all",
        brawler: "fights: it picks its moves, telegraphs them, and commits",
      };
      ctx.fillText(`${use.name} — ${use.charKey} · ${c.behavior || "chaser"} · `
        + `${c.h ?? 110}px tall, ${c.speed || 0}px/s, ${c.duration ?? "?"}s on stage`, 14, 22);
      ctx.fillText(`${WHAT[c.behavior] || WHAT.chaser}   ·   ${nudge}`, 14, 40);
    } else if (use.mode === "flash") {
      ctx.fillText(`${use.name} — ${use.charKey} · ${use.state} · flashes for ${use.p.life}s, ${use.p.forward}px in front`, 14, 22);
      ctx.fillText(`stands on the floor — no spawn point to place`
        + (use.p.box ? `, the reach is the dashed box` : "") + `   ·   ${nudge}`, 14, 40);
    } else if (use.mode === "drop") {
      ctx.fillText(`${use.name} — ${use.charKey} · ${use.state} · falls onto the target in ${use.p.fall}s, from ${Math.round(1 / (use.p.far ?? METEOR_FALL.far))}x out`, 14, 22);
      ctx.fillText(`no muzzle — the drop picks the target's x   ·   ${nudge}`, 14, 40);
    } else {
      ctx.fillText(`${use.name} — ${use.charKey} · ${use.state} · ${use.p.speed || 0}px/s for ${dur}s`
        + (use.p.homing ? ` · homes at ${use.p.homing}` : ""), 14, 22);
      // Kit units, which is what these numbers have to be to be worth writing
      // down — the scale that turns them into the pixels above is noted beside.
      const kitOx = Math.round(adj.spawnOx ?? use.ox);
      const kitOy = Math.round(adj.spawnOy ?? use.oy);
      const SOURCE = {
        human: "hand-placed muzzle",
        model: "muzzle measured off the rig",
        derived: "muzzle unplaced — reference scaled",
      };
      ctx.fillText(`spawn ox ${kitOx}, oy ${kitOy} (kit)`
        + `   ·   ${SOURCE[pos?.source] || pos?.source || "muzzle"}   ·   ${nudge}`, 14, 40);
    }

    raf = requestAnimationFrame(frame);
  }

  function pointFor(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * canvas.width,
             y: ((ev.clientY - r.top) / r.height) * canvas.height };
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (!use) return;
    const pt = pointFor(ev);
    const adj = read();
    const o = originAt(adj);
    const dPt = { x: o.x0 + (adj.dx || 0), y: o.y0 + (adj.dy || 0) };
    // The drawing marker wins a tie: it is the one that moves most often, and
    // it sits on top of the spawn point whenever the nudge is zero.
    if (Math.hypot(pt.x - dPt.x, pt.y - dPt.y) < 18) drag = "drawing";
    else if (!["drop", "flash", "summon", "planted", "worn", "director", "hazard"].includes(use.mode)
             && Math.hypot(pt.x - o.x0, pt.y - o.y0) < 18) drag = "spawn";
    else return;
    grabbed = false;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag || !use) return;
    const pt = pointFor(ev);
    const adj = read();
    const first = !grabbed;
    grabbed = true;
    if (drag === "spawn") {
      write(toKit(pt), first);   // kit units, because the kit is where it lands
    } else {
      const o = originAt(adj);
      write({ dx: +(pt.x - o.x0).toFixed(1), dy: +(pt.y - o.y0).toFixed(1) }, first);
    }
  });
  const stopDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  return {
    /** Start playing `spriteKey`; returns false when no move fires it. */
    open(spriteKey, preferChar) {
      const found = firingUse(spriteKey, preferChar);
      if (!found) return false;
      use = { ...found, spriteKey };
      // A CREATURE ANIMATES, and `getImage` only answers for art that has
      // already been fetched. Selecting a creature in the panel fetches its
      // resting plate and nothing else, so every walk and bite frame came back
      // null and the playback drew an empty stage — a preview that looked
      // broken rather than one that was missing its art. Kicked off here and
      // not awaited: the loop picks each plate up on the frame it lands.
      if (found.mode === "summon") {
        for (const pose of SUMMON_POSES) loadSharedImage(`${spriteKey}:${pose}`);
        loadSharedImage(spriteKey);
      }
      t = 0;
      lastTick = performance.now();
      running = true;
      raf = requestAnimationFrame(frame);
      return true;
    },
    close() {
      running = false;
      cancelAnimationFrame(raf);
      onClose?.();
    },
    get use() { return use; },
  };
}
