// WHAT EACH KIND OF MOVE DOES WITH ITS DRAWING — one entry per `type`, and one
// table for everybody who needs to know.
//
// WHY THIS FILE EXISTS
//
// A shared drawing is placed three times over: the game paints it, the sprite
// workbench's viewer draws it still with a crosshair on its spawn point, and
// the workbench's action player replays the move around it. Those are three
// pieces of arithmetic over one picture, and until this file they were written
// down three times — the handler in src/specials.js or src/ultimates.js (the
// only one that is true), `DRAW_SITES`/`LAUNCH` inside src/shared_sprites.js
// (the viewer's), and seven per-shape tables inside the player.
//
// Two of the three had to be edited by hand whenever a move type was added, and
// nothing noticed when they were not:
//
//   massDrive   in the registry, not in the player: Miwa's whole ultimate had
//               no Play button.
//   boomerang   in the player, not in the registry: the same staff pointed one
//               way in the viewer and the other in the player, the fighter
//               beside it stood in his idle instead of the pose that throws it,
//               and there was no spawn crosshair at all.
//   nailstorm,  the registry said they were not mirrored while their handlers
//   shout,      mirrored them — three drawings shown as the plate rather than
//   massDrive   as the picture a player sees.
//
// Every one of those is the same bug, and it cannot be written again from here:
// there is one entry per type, both consumers read it, and
// `node tools/check_spawn_shapes.mjs` fails when a type a kit uses has no entry
// or names a playback the player does not implement.
//
// WHAT AN ENTRY SAYS
//
//   site       which code paints it, named for the readout. The handler is the
//              authority for everything else here, so this is where to go and
//              check.
//   anchor     which part of the drawing lands on the point: `centre` (painted
//              around it) or `feet` (standing on it).
//   travels    it flies, and is mirrored to the way it is going.
//   mirrored   it is mirrored to the CASTER's facing. `travels` implies this —
//              both end in the same `scale(-1, 1)` for a right-facing throw —
//              and the two are kept apart because they are different reasons.
//   spriteH    a height the RENDERER fixes, where the kit has no say. With
//              `sizable: false`, because a slider that multiplies a number
//              nothing reads is a lie.
//   launch     where the drawing leaves the fighter, in KIT space: `forward`
//              px ahead and `y` px up from their feet, `scaled: true` when the
//              offsets ride the muzzle solve (src/muzzle.js) rather than being
//              raw. `atOpponent` for the two that paint on the victim.
//   melee      the move's own hit box, for the flashes whose `w`/`h` describe
//              the SWING rather than the drawing.
//   play       which playback the workbench's action player uses. The animation
//              itself lives there (sprites/workbench/preview_playback.js) —
//              it is workbench-only detail — but which shape a type gets is
//              decided here, once, beside the facts the game holds.
//
// Every spawn site reads `sharedAdjust`, so the nudge and the tilt are always
// live; that used to be a per-entry fact and is now a rule.

/** Where a shot leaves the hand: spawnProjectile's own defaults, on the 149px
 *  reference body every fighter scales onto their own height. */
const MUZZLE = (n) => ({ forward: n.ox ?? 70, y: n.oy ?? -86, scaled: true });

/** A flash beside a melee swing: the box belongs to the FIGHTER, not to the
 *  picture, so it is described separately from where the drawing goes. */
const SWING = (n) => ({ forward: n.ox ?? 40, y: n.oy ?? -96, w: n.w ?? 160, h: n.h ?? 100 });

export const SPAWN_SHAPES = {
  // ---- drawn by render.js / summons.js, on something that moves ------------
  summon: {
    site: "spawnSummon (src/summons.js)", anchor: "feet", play: "summon",
  },
  // A projectile is drawn centred on its own position, which IS the circle it
  // collides on, and mirrored to the way it is travelling.
  projectile: {
    site: "drawProjectiles (src/render.js)", anchor: "centre", travels: true,
    launch: MUZZLE, play: "shot",
  },
  // A wave is spawnProjectile with `wave: true`: same launch, same flight, and
  // then combat.js plants it on the floor (`p.y = groundY - p.r * 0.7`) and
  // render.js paints it `r * 0.68` lower again. It rides the ground rather than
  // flying, which is a fact about the PLAYBACK and lives with the player.
  wave: {
    site: "drawProjectiles (src/render.js)", anchor: "centre", travels: true,
    launch: (n) => ({ forward: 60, y: n.oy ?? -86, scaled: true }), play: "shot",
  },
  // Out and back: the outbound leg is an ordinary shot from the move's own
  // muzzle, and the return is a second projectile sent from the far point.
  boomerang: {
    site: "drawProjectiles (src/render.js)", anchor: "centre", travels: true,
    launch: MUZZLE, play: "shot",
  },
  beam: {
    site: "beam (src/ultimates.js)", anchor: "centre", travels: true,
    // The director charges, then throws a real projectile with offsets of its
    // OWN, written into the handler rather than into the kit.
    launch: () => ({ forward: 90, y: -96, scaled: true }), play: "ultShot",
  },
  // Ino's Ryu, the same shape as `beam` and for the same reason: the director
  // charges in his hands and then hands a real projectile to the projectile
  // system, with launch offsets written into the handler rather than the kit.
  // It weaves and re-arms after that, but neither of those moves the point it
  // leaves from, which is all this table is describing.
  serpent: {
    site: "serpent (src/ultimates.js)", anchor: "centre", travels: true,
    launch: () => ({ forward: 84, y: -96, scaled: true }), play: "ultShot",
  },
  cannonade: {
    site: "cannonade (src/ultimates.js)", anchor: "centre", travels: true, play: "ultShot",
  },
  birdstrike: {
    site: "birdstrike (src/ultimates.js)", anchor: "centre", travels: true, play: "ultShot",
  },
  deathSwarm: {
    site: "deathSwarm (src/ultimates.js)", anchor: "centre", travels: true, play: "ultShot",
  },
  parthenogenesis: {
    site: "parthenogenesis (src/ultimates.js)", anchor: "feet", play: "summon",
  },

  // ---- painted by their own handler, straight from getImage ---------------
  // Standing on the ground: `-h` under the point, or at a ground line the
  // handler works out for itself.
  trap: {
    site: "makeTrap (src/specials.js)", anchor: "feet", play: "planted",
    launch: (n) => (n.atOpponent ? null : { forward: n.dist ?? 220, y: 0 }),
  },
  randomDrop: {
    site: "randomDrop (src/specials.js)", anchor: "feet", play: "drop",
  },
  cloudField: {
    site: "cloudField (src/specials.js)", anchor: "feet", play: "planted",
    launch: (n) => ({ forward: n.dist ?? 210, y: 0 }),
  },
  // A tornado stands on the floor and rises out of it — `translate(640, 595)`
  // then `-h` — so it is a ground drawing, not one centred on a point in the
  // air, however much a centred crosshair suggested otherwise.
  tempest: { site: "tempest (src/ultimates.js)", anchor: "feet", play: "director" },
  eruption: { site: "eruption (src/ultimates.js)", anchor: "feet" },
  cardrop: { site: "cardrop (src/ultimates.js)", anchor: "feet", play: "director" },
  // Centred on the point the handler puts them on: a falling meteor, a ring of
  // blood orbs, a shout in front of the mouth.
  meteor: { site: "meteor (src/ultimates.js)", anchor: "centre", play: "ultDrop" },
  vortex: {
    site: "vortex (src/ultimates.js)", anchor: "centre", play: "director",
    // The one director whose cast point the KIT owns, which is what makes it
    // draggable in the player: the same number decides where the spiral is
    // drawn and where it collides.
    launch: (n) => ({ forward: n.ox ?? 130, y: n.oy ?? -110 }), kitLaunch: true,
  },
  // These three mirror with the caster — `scale(f.facing > 0 ? -1 : 1)` in
  // their own draw, the same rule a shot follows.
  nailstorm: { site: "nailstorm (src/ultimates.js)", anchor: "centre", mirrored: true,
               play: "director" },
  shout: {
    site: "shout (src/ultimates.js)", anchor: "centre", mirrored: true, play: "director",
    // Its offset is a fraction of the ART's own width rather than a fixed
    // distance: `f.x + f.facing * w * 0.3`, resolved against the drawing.
    launch: () => ({ forward: 0, forwardOfWidth: 0.3, y: -105 }),
  },
  massDrive: {
    site: "massDrive (src/ultimates.js)", anchor: "centre", mirrored: true, play: "director",
    launch: () => ({ forward: 150, y: -100 }),
  },
  // The two that paint on the OPPONENT. A distance the preview canvas has no
  // second fighter to show, which is worth saying rather than standing the
  // caster where the victim goes.
  skyInvert: {
    site: "skyInvert (src/ultimates.js)", anchor: "centre", play: "director",
    launch: () => ({ atOpponent: true, y: -140 }),
  },
  supernova: {
    site: "supernova (src/ultimates.js)", anchor: "centre",
    launch: (n) => ({ atOpponent: true, y: 0, ringRadius: n.radius ?? 240 }),
  },
  concert: {
    site: "concert (src/ultimates.js)", anchor: "centre", play: "director",
    launch: () => ({ forward: 0, y: -110 }),
  },
  warpStrike: { site: "warpStrike (src/specials.js)", anchor: "centre", play: "director" },

  // ---- a one-shot flash of art beside the fighter -------------------------
  // Todo's clap, Yuji's divergent impact, Rika's fist, Todo's drum.
  // spawnSummonFlash stands it on the ground at the fighter's feet and mirrors
  // it with their facing, at the move's own `spriteH`.
  swap: {
    site: "spawnSummonFlash (src/specials.js)", anchor: "feet", mirrored: true,
    launch: () => ({ forward: 0, y: 12 }), play: "flash",
  },
  echoStrike: {
    site: "spawnSummonFlash (src/specials.js)", anchor: "feet", mirrored: true,
    launch: () => ({ forward: 80, y: 12 }), melee: SWING, play: "flash",
  },
  burst: {
    site: "spawnSummonFlash (src/specials.js)", anchor: "feet", mirrored: true,
    launch: (n) => ({ forward: n.spriteForward ?? 105, y: 12 }), melee: SWING, play: "flash",
  },
  commandGrab: {
    site: "spawnSummonFlash (src/specials.js)", anchor: "feet", mirrored: true,
    launch: (n) => ({ forward: n.spriteForward ?? 78, y: 12 }),
    // This one's numbers are in the handler, not the kit: `ox: 24, oy: -104`.
    melee: (n) => ({ forward: 24, y: -104, w: n.range ?? 120, h: 110 }),
    play: "flash",
  },

  // ---- a second body for the fighter, at a height the RENDERER fixes ------
  // Yuta's Rika stands behind him at 238px; Panda's triceratops replaces his
  // body at 210px. Neither reads the kit's height, so the Size slider has
  // nothing to multiply.
  install: {
    site: "install (src/ultimates.js)", anchor: "feet", mirrored: true,
    spriteH: 238, sizable: false, launch: () => ({ forward: -58, y: 18 }), play: "worn",
  },
  rampage: {
    site: "the transformed-body branch of drawFighters (src/render.js)",
    anchor: "feet", mirrored: true, spriteH: 210, sizable: false,
    launch: () => ({ forward: 0, y: 10 }), play: "worn",
  },
};

/** The playback shapes the workbench's action player implements. A `play` that
 *  is not one of these is a typo, and the check says so. */
export const PLAYBACKS = ["shot", "ultShot", "flash", "planted", "drop", "ultDrop",
                          "director", "worn", "summon"];

/** What the game does with a move of this type, or null for a type that names
 *  no shared drawing (a counter, a dash strike, a domain). */
export function spawnShape(type) {
  return SPAWN_SHAPES[type] || null;
}
