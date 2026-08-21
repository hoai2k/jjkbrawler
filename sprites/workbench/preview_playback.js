// HOW THE ACTION PLAYER MOVES EACH KIND OF DRAWING.
//
// The workbench's "Play it in action" canvas replays a move around its drawing,
// and this is the animation half of that: where the picture is at `u` of the
// way through, how tall it is at that moment, how long the pass lasts, and what
// to say about it underneath.
//
// WHAT IS *NOT* HERE, deliberately: which shape a move type gets. That is in
// `src/config_spawn_shapes.js` beside the facts the game holds about the same
// type — the anchor, the mirroring, the launch point — because a type entered
// in one place and not the other is the fault this whole split exists to
// prevent. Each entry's `play` names one of the tables below; every table is
// keyed by the same move `type` as the kit; and `node tools/check_spawn_shapes.mjs`
// fails when a type names a playback that is not implemented here, or is
// implemented here and named nowhere.
//
// The numbers in every entry are read off the handler named in that type's
// `site`. When one of them changes, this file is the second edit.

import { METEOR_FALL, AURA_H, AURA_PULSE, AURA_FOOT_DY } from "../../src/shared_sprites.js";


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
export const ULT_SHOT = {
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
  // Ino's RYU: one shot, but the handler owns everything about it — the kit
  // says speed/dur/r and the director adds the offsets, the pierce and the
  // homing. The weave and the hit-set re-arm are not reproduced here; neither
  // moves the drawing, and this table exists to show the drawing.
  serpent: (p) => [
    { sprite: p.sprite,
      p: { ...p, speed: p.speed ?? 660, ox: 84, oy: -96, r: p.r ?? 52,
           dur: p.dur ?? 2.3, homing: p.homing ?? 360 } },
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
export const ULT_DROP = {
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
export const FLASH = {
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
export const PLANTED = {
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
 * The STAGE's own art: hazards a stage spawns, with nobody casting them.
 *
 * Four drawings that belong to no kit at all — the fang that rises out of the
 * floor, the bloom, the hung lantern, the curse that wanders. `firingUse`
 * walked the kits and so could never reach them. The heights and anchors are
 * the registry's own (STAGE_FX in shared_sprites.js), which is where stage_fx.js
 * reads them, so the size shown is the size drawn.
 */
export const HAZARDS = {
  // Bottom pinned to the platform line, exactly as stage_fx.js draws it: this
  // one GROWS out of the ground rather than swelling about its middle.
  "stagefx:stage_fang": { h: 72, anchor: "feet", life: 1.6,
    rise: true, what: "grows out of the floor and sinks back" },
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
export const WORN = {
  aura: () => ({ pulse: true, foot: AURA_FOOT_DY, height: AURA_H, glow: true }),
  // `behind` is the kit's own word for it (src/characters.js): a rampage body
  // either REPLACES the fighter — Panda is the triceratops — or runs behind
  // them, which is Naoya and his vengeful spirit. The preview has to paint them
  // in the same order the game does, or the one question this drawing asks
  // ("does it read behind him?") is answered wrong here.
  rampage: (p) => ({ pulse: false, foot: 0, height: p.spriteH || 210, glow: false,
                     behind: !!p.behind, replaces: !p.behind }),
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
export const DIRECTOR = {
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
  // Mahito's Uzumaki. Cast at the kit's own `ox`/`oy` and carried forward at
  // its speed, spinning at the rate the handler spins it — a spiral previewed
  // without its rotation is a still picture, which is what "shouldn't it be
  // spinning?" was about. The handler's own numbers, read off src/ultimates.js.
  vortex: (p) => ({
    life: p.dur || 2.6, anchor: "centre", flip: false,
    // `cast` is the move's point with any unsaved drag folded in — the third
    // argument every `at` may take and only the draggable ones need.
    at: (u, S, cast = p) => ({
      x: S.FIGHTER_X + (cast.ox ?? 130) + u * (p.dur || 2.6) * (p.speed || 300),
      y: S.GROUND + (cast.oy ?? -110) }),
    h: () => p.spriteH || 250,
    spin: (u) => u * (p.dur || 2.6) * (p.spin ?? 2.2),
    // Whether its cast point can be DRAGGED is not this table's business — it
    // is a fact about the move (`kitLaunch` in config_spawn_shapes.js, true
    // where the kit owns `ox`/`oy` rather than the handler) and the player
    // carries it across.
    what: "cast ahead of the caster and driven forward, spinning",
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
  // Todo's Maximum Mass and Miwa's Last Draw: the blow lands out at arm's
  // reach and the drawing swells as it fades (`massDrive`, src/ultimates.js).
  // The director paints it itself, so there is no shot to follow — and without
  // an entry here `effect:batto_flash`, the whole of Miwa's ultimate, had no
  // action at all.
  massDrive: (p) => ({
    life: 0.5, anchor: "centre", flip: true,
    at: (u, S) => ({ x: S.FIGHTER_X + 150, y: S.GROUND - 100 }),
    h: (u) => (p.spriteH || 280) * (1 + u * 0.5),
    what: "lands at arm's reach and swells as it fades",
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
 * The SPECIALS that drop an object out of the sky onto the opponent.
 *
 * Reggie's Big-Ticket Item picks one of `drops` at random and falls it onto
 * the enemy's head; his cardrop does the same with a car. Each drop names its
 * own art and its own `w`/`h`, so the entry is per DRAWING rather than per
 * move — which is why this one is resolved differently from the rest: the
 * playback needs the drop, not just the special.
 */
// `randomDrop` is a SPECIAL, and this set is read in the specials walk only —
// which is why `cardrop` was in it for nothing: Reggie's sedan is an ultimate,
// so it has always played through its DIRECTOR entry and never through this.
// One type, one playback, and the shape table names which.
export const DROP_MOVES = new Set(["randomDrop"]);
