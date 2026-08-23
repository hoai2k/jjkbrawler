import { ART_SCALE } from "./config_tuning.js";
import { clamp } from "./utils.js";
// 20 stages. Each is one or two "main" platforms (solid ground, grabbable
// ledges, the lowest surface) plus drop-through platforms in a deliberate
// archetype — arenas, skylines, galleries, towers, staircases, orbit fields
// (see docs/stage-variety-plan.md, "Platform configurations"). Layout rules:
// tier steps stay ≤140px (every fighter's single+air jump covers ~239px
// minimum), and nothing sits above y≈235 so a full jump from the highest
// platform stays on screen. tools/audit_stage_reach.mjs enforces both.
//
// THE FLOOR IS NOT WHERE YOU START.
//
// Every board's lowest ground sits at the BOTTOM of the world (y 686–700,
// beside the walk-offs' 664/668) — not at the height fighters begin at. What
// used to be the main is still there, at the same y and the same width, but as
// a `kind: "spawn"` drop-through: it is where a match opens and it is what the
// crowd spreads across, and you can leave it downward whenever you like.
//
// That buys every board a whole storey of playable space it did not have. The
// old layout put the lowest surface ~570 in a 720-tall world, so a third of
// the board was scenery; now the fight can go under the starting line, and
// getting knocked below it is a position to fight out of rather than a death.
// A ledge hang on the floor sits low in frame on purpose — being able to USE
// the bottom of the board matters more than seeing all of a hanging body.
//
// FOUR BOARDS KEEP A HIGH FLOOR, because a floor underneath would cost them
// the thing they are. Sunken Crossing and Crosswalk Rush are walk-offs whose
// street already IS the bottom of the world. Bridge Duel is a narrow bridge
// over a void — catching yourself on a floor below is exactly what that board
// is meant not to offer, and its gimmick drifts that bridge. Garden Steps is a
// staircase, and a staircase reads from its bottom step. Every other board
// gains the storey; which ones do is a per-board decision, not a rule.
//
// SIX BOARDS SPLIT THAT FLOOR IN TWO, with a ~190px hole down the middle:
// Shibuya Night, Bone Sanctum, Mist Pier, Empty City, Billboard Roof and
// Domain Core. The spawn tier still bridges the gap, so a match opens on solid
// ground and the hole is something you choose to deal with — four grabbable
// ledges instead of two, and a way to lose a stock straight down the middle.
// The six were picked for gimmicks that never measure the main (stage_fx.js):
// a board whose hazard sweeps its floor keeps that floor in one piece.
//
// Proportions follow docs/level-design-review.md: platforms two fighters are
// meant to contest are ≥ ~195px (about three body widths); shorter ones are
// deliberate perches (Crosswalk's signs, Mist Pier's lantern post). Drop-
// throughs are a 15px sliver so attacks read through them; mains stay 42 —
// they are the ground and should read heavy. Main widths deliberately spread
// from 600 (Bridge Duel, the small scary duel board) to 1560 (the two walk-
// offs), widened across the board in the six-player pass (level-design-
// review.md, "Second widening") so a crowd has ground to stand apart on.
//
// WALK-OFF WIDTH — why the two walk-offs are 1560 and start off-world.
//
// What the eye judges is the gap beside the platform ON SCREEN, and that gap
// is the CAMERA's, not the platform's: the frame fits the fighters plus
// FRAME_PAD_X (168 world px) each side, so with a fighter standing at each end
// the margin is ~138 world px × zoom whatever the board is. Widening a board
// only makes the camera zoom out to keep the same padding, and the gap comes
// back the same size. Measured on the shipped camera: Sunken Crossing at 1192
// wide left 120 screen px of background at each end, Training Bridge at 844
// left 158 — the same 138 px, scaled by each board's zoom.
//
// The one thing that closes it is running out of zoom. The camera bottoms out
// at ZOOM_MIN 0.78 (camera.js), which is a frame 1641 world px across, so a
// board whose fighters can stand more than ~1305 apart cannot be padded any
// further and the platform has to reach the edges. 1560 puts the ends at
// x = -140 and 1420: at the floor the frame spans -180..1460, so ~40 world px
// of street shows past each end, and the blast lines (-300/1580) stay 160 px
// out — a real runway, not an instant side-kill.
//
// Both sit at the BOTTOM of the world (y 664/668, slab bottom ~697 against the
// world's 720) so the street reads as ground rather than as a slab floating
// over a pit — and their upper platforms came down with them to keep every hop
// inside the reach budget.
//
// Two boards are WALK-OFFS in the Smash sense — Sunken Crossing and Crosswalk
// Rush run their main past both world edges and sit it at the bottom, so the
// fight happens at ground level and a kill is a shove past the screen edge
// rather than a spike into the pit. Two boards build WALLS ({ kind: "wall" },
// fighter.js pushOutOfWalls): River Gate's torii pillars and Cursed Teeth's
// molars — the one terrain element that blocks sideways movement, walkable on
// top like anything else. Walls keep their authored height through the
// ART_SCALE pass below, because a wall's height is board, not slab art.
//
// A stage's gameplay identity (hazards, platform motion — "Active Boards" in
// Settings) lives in src/stage_fx.js, keyed by the stage key. The optional
// `mods` field holds always-on-while-active field modifiers:
//   gravityMul  — scales gravity for the whole match (Domain Core floats)
//   frictionPow — exponent on ground friction; < 1 is slick (Sunken Crossing)

export const STAGES = [
  { key: "trainingBridge", name: "Training Bridge", bgFile: "training_bridge.jpg", tint: "rgba(87, 186, 129, 0.12)", platforms: [
    { x: 120, y: 688, w: 1040, h: 42, kind: "main" }, { x: 218, y: 568, w: 844, h: 15, kind: "spawn" }, { x: 140, y: 424, w: 250, h: 15, kind: "side" }, { x: 890, y: 424, w: 250, h: 15, kind: "side" }, { x: 512, y: 302, w: 256, h: 15, kind: "top" }
  ] },
  { key: "quietHall", name: "Quiet Hall", bgFile: "quiet_hall.jpg", tint: "rgba(175, 128, 80, 0.12)", platforms: [
    { x: 110, y: 692, w: 1060, h: 42, kind: "main" }, { x: 206, y: 572, w: 868, h: 15, kind: "spawn" }, { x: 230, y: 438, w: 270, h: 15, kind: "side" }, { x: 780, y: 452, w: 270, h: 15, kind: "side" }
  ] },
  { key: "floodedGate", name: "Flooded Gate", bgFile: "flooded_gate.jpg", tint: "rgba(107, 174, 214, 0.13)", platforms: [
    { x: 100, y: 690, w: 1080, h: 42, kind: "main" }, { x: 180, y: 570, w: 920, h: 15, kind: "spawn" }, { x: 150, y: 446, w: 200, h: 15, kind: "side" }, { x: 930, y: 446, w: 200, h: 15, kind: "side" }, { x: 552, y: 336, w: 176, h: 15, kind: "top" }
  ] },
  { key: "shibuyaNight", name: "Shibuya Night", bgFile: "shibuya_night.jpg", tint: "rgba(88, 116, 220, 0.16)", platforms: [
    { x: 110, y: 686, w: 460, h: 42, kind: "main" }, { x: 770, y: 686, w: 460, h: 42, kind: "main" }, { x: 220, y: 566, w: 840, h: 15, kind: "spawn" }, { x: 170, y: 452, w: 220, h: 15, kind: "side" }, { x: 890, y: 452, w: 220, h: 15, kind: "side" }, { x: 350, y: 342, w: 190, h: 15, kind: "side" }, { x: 740, y: 342, w: 190, h: 15, kind: "side" }, { x: 505, y: 240, w: 270, h: 15, kind: "top" }
  ] },
  { key: "curseMaw", name: "Curse Maw", bgFile: "curse_maw.jpg", tint: "rgba(60, 215, 218, 0.13)", platforms: [
    { x: 130, y: 696, w: 1020, h: 42, kind: "main" }, { x: 228, y: 576, w: 824, h: 15, kind: "spawn" }, { x: 240, y: 442, w: 220, h: 15, kind: "side" }, { x: 820, y: 442, w: 220, h: 15, kind: "side" }
  ] },
  { key: "gardenSteps", name: "Garden Steps", bgFile: "garden_steps.jpg", tint: "rgba(111, 219, 147, 0.16)", platforms: [
    { x: 182, y: 584, w: 916, h: 42, kind: "main" }, { x: 140, y: 474, w: 210, h: 15, kind: "side" }, { x: 470, y: 384, w: 210, h: 15, kind: "top" }, { x: 830, y: 294, w: 240, h: 15, kind: "side" }
  ] },
  { key: "lanternCorridor", name: "Lantern Corridor", bgFile: "lantern_corridor.jpg", tint: "rgba(255, 187, 93, 0.11)", platforms: [
    { x: 120, y: 690, w: 1040, h: 42, kind: "main" }, { x: 222, y: 570, w: 836, h: 15, kind: "spawn" }, { x: 210, y: 428, w: 210, h: 15, kind: "side" }, { x: 535, y: 428, w: 210, h: 15, kind: "side" }, { x: 860, y: 428, w: 210, h: 15, kind: "side" }
  ] },
  { key: "sunkenCrossing", name: "Sunken Crossing", bgFile: "sunken_crossing.jpg", tint: "rgba(87, 196, 255, 0.12)", mods: { frictionPow: 0.35 }, platforms: [
    { x: -140, y: 668, w: 1560, h: 42, kind: "main" }, { x: 170, y: 536, w: 320, h: 15, kind: "side" }, { x: 790, y: 536, w: 320, h: 15, kind: "side" }
  ] },
  { key: "neonSplit", name: "Neon Split", bgFile: "neon_split.jpg", tint: "rgba(224, 82, 192, 0.12)", platforms: [
    { x: 140, y: 688, w: 1000, h: 42, kind: "main" }, { x: 240, y: 568, w: 800, h: 15, kind: "spawn" }, { x: 190, y: 452, w: 230, h: 15, kind: "side" }, { x: 860, y: 452, w: 230, h: 15, kind: "side" }, { x: 250, y: 332, w: 200, h: 15, kind: "side" }, { x: 830, y: 332, w: 200, h: 15, kind: "side" }
  ] },
  { key: "boneSanctum", name: "Bone Sanctum", bgFile: "bone_sanctum.jpg", tint: "rgba(76, 221, 210, 0.1)", platforms: [
    { x: 120, y: 694, w: 450, h: 42, kind: "main" }, { x: 760, y: 694, w: 450, h: 42, kind: "main" }, { x: 206, y: 574, w: 868, h: 15, kind: "spawn" }, { x: 160, y: 456, w: 190, h: 15, kind: "side" }, { x: 930, y: 456, w: 190, h: 15, kind: "side" }, { x: 400, y: 346, w: 180, h: 15, kind: "side" }, { x: 700, y: 346, w: 180, h: 15, kind: "side" }, { x: 315, y: 236, w: 200, h: 15, kind: "side" }, { x: 765, y: 236, w: 200, h: 15, kind: "side" }
  ] },
  { key: "bridgeDuel", name: "Bridge Duel", bgFile: "bridge_duel.jpg", tint: "rgba(49, 168, 134, 0.12)", platforms: [
    { x: 340, y: 582, w: 600, h: 42, kind: "main" }, { x: 130, y: 448, w: 230, h: 15, kind: "side" }, { x: 920, y: 448, w: 230, h: 15, kind: "side" }
  ] },
  { key: "academyHall", name: "Academy Hall", bgFile: "academy_hall.jpg", tint: "rgba(140, 112, 80, 0.14)", platforms: [
    { x: 60, y: 688, w: 1160, h: 42, kind: "main" }, { x: 110, y: 568, w: 1060, h: 15, kind: "spawn" }, { x: 230, y: 446, w: 220, h: 15, kind: "side" }, { x: 830, y: 446, w: 220, h: 15, kind: "side" }, { x: 512, y: 320, w: 256, h: 15, kind: "top" }, { x: 560, y: 452, w: 160, h: 15, kind: "side" }
  ] },
  { key: "mistPier", name: "Mist Pier", bgFile: "mist_pier.jpg", tint: "rgba(178, 226, 255, 0.1)", platforms: [
    { x: 120, y: 700, w: 450, h: 42, kind: "main" }, { x: 760, y: 700, w: 450, h: 42, kind: "main" }, { x: 222, y: 580, w: 836, h: 15, kind: "spawn" }, { x: 160, y: 462, w: 240, h: 15, kind: "side" }, { x: 870, y: 440, w: 240, h: 15, kind: "side" }, { x: 540, y: 352, w: 150, h: 15, kind: "top" }
  ] },
  { key: "crosswalkRush", name: "Crosswalk Rush", bgFile: "crosswalk_rush.jpg", tint: "rgba(76, 171, 255, 0.13)", platforms: [
    { x: -140, y: 664, w: 1560, h: 42, kind: "main" }, { x: 340, y: 532, w: 600, h: 15, kind: "side" }, { x: 130, y: 398, w: 170, h: 15, kind: "top" }, { x: 980, y: 398, w: 170, h: 15, kind: "top" }
  ] },
  { key: "cursedTeeth", name: "Cursed Teeth", bgFile: "cursed_teeth.jpg", tint: "rgba(42, 205, 204, 0.14)", platforms: [
    { x: 150, y: 700, w: 980, h: 42, kind: "main" }, { x: 244, y: 584, w: 792, h: 15, kind: "spawn" }, { x: 180, y: 452, w: 220, h: 15, kind: "side" }, { x: 880, y: 452, w: 220, h: 15, kind: "side" }, { x: 542, y: 330, w: 195, h: 15, kind: "top" }, { x: 290, y: 524, w: 34, h: 60, kind: "wall" }, { x: 956, y: 524, w: 34, h: 60, kind: "wall" }
  ] },
  { key: "riverGate", name: "River Gate", bgFile: "river_gate.jpg", tint: "rgba(91, 205, 176, 0.13)", platforms: [
    { x: 110, y: 696, w: 1060, h: 42, kind: "main" }, { x: 200, y: 576, w: 880, h: 15, kind: "spawn" }, { x: 180, y: 448, w: 280, h: 15, kind: "side" }, { x: 820, y: 440, w: 200, h: 15, kind: "side" }, { x: 560, y: 310, w: 150, h: 15, kind: "top" }, { x: 495, y: 446, w: 30, h: 130, kind: "wall" }, { x: 755, y: 446, w: 30, h: 130, kind: "wall" }
  ] },
  { key: "schoolWing", name: "School Wing", bgFile: "school_wing.jpg", tint: "rgba(205, 148, 92, 0.1)", platforms: [
    { x: 86, y: 690, w: 1170, h: 42, kind: "main" }, { x: 230, y: 570, w: 903, h: 15, kind: "spawn" }, { x: 149, y: 446, w: 221, h: 15, kind: "side" }, { x: 844, y: 448, w: 200, h: 15, kind: "side" }, { x: 340, y: 330, w: 130, h: 15, kind: "side" }, { x: 790, y: 330, w: 170, h: 15, kind: "side" }, { x: 1123, y: 228, w: 130, h: 15, kind: "side" }, { x: -53, y: 290, w: 130, h: 15, kind: "side" }, { x: 76, y: 171, w: 130, h: 15, kind: "side" }
  ] },
  { key: "emptyCity", name: "Empty City", bgFile: "empty_city.jpg", tint: "rgba(159, 189, 214, 0.15)", platforms: [
    { x: 98, y: 633, w: 460, h: 42, kind: "main" }, { x: 758, y: 633, w: 460, h: 42, kind: "main" }, { x: 168, y: 513, w: 920, h: 15, kind: "spawn" }, { x: 128, y: 409, w: 210, h: 15, kind: "side" }, { x: 918, y: 385, w: 210, h: 15, kind: "side" }, { x: 50, y: 256, w: 190, h: 15, kind: "top" }, { x: 611, y: 245, w: 389, h: 15, kind: "top" }
  ] },
  { key: "billboardRoof", name: "Billboard Roof", bgFile: "billboard_roof.jpg", tint: "rgba(255, 83, 148, 0.1)", platforms: [
    { x: 120, y: 700, w: 450, h: 42, kind: "main" }, { x: 760, y: 700, w: 450, h: 42, kind: "main" }, { x: 214, y: 580, w: 852, h: 15, kind: "spawn" }, { x: 180, y: 470, w: 150, h: 15, kind: "side" }, { x: 950, y: 470, w: 150, h: 15, kind: "side" }, { x: 470, y: 370, w: 340, h: 15, kind: "side" }, { x: 540, y: 262, w: 200, h: 15, kind: "top" }, { x: -43, y: 323, w: 340, h: 15, kind: "side" }, { x: 1024, y: 323, w: 340, h: 15, kind: "side" }, { x: 980, y: 94, w: 150, h: 15, kind: "side" }
  ] },
  { key: "domainCore", name: "Domain Core", bgFile: "domain_core.jpg", tint: "rgba(108, 255, 230, 0.13)", mods: { gravityMul: 0.88 }, platforms: [
    { x: 100, y: 698, w: 470, h: 42, kind: "main" }, { x: 760, y: 698, w: 470, h: 42, kind: "main" }, { x: 166, y: 578, w: 948, h: 15, kind: "spawn" }, { x: 240, y: 458, w: 180, h: 15, kind: "side" }, { x: 860, y: 458, w: 180, h: 15, kind: "side" }, { x: 430, y: 338, w: 170, h: 15, kind: "side" }, { x: 680, y: 338, w: 170, h: 15, kind: "side" }, { x: 17, y: 341, w: 180, h: 15, kind: "side" }, { x: 1087, y: 335, w: 180, h: 15, kind: "side" }, { x: 1148, y: 196, w: 180, h: 15, kind: "side" }, { x: -101, y: 201, w: 180, h: 15, kind: "side" }
  ] },
];

// THE TABLE AS SOMEBODY TYPED IT, taken before the thickness pass below bends
// it. The arena workbench (/workbench/?edit=arena) edits and exports THESE
// numbers — the authored ones — rather than the runtime thickness: `h` below is
// multiplied by ART_SCALE in place, so a bench that read the live table, let you
// move a platform, and wrote it back would shave every slab by 30% on every
// round trip. Nothing in the game reads this; it exists so a tool can round-trip
// a board without lying about it.
export const AUTHORED_STAGES = STAGES.map((s) => ({
  ...s,
  mods: s.mods ? { ...s.mods } : undefined,
  platforms: s.platforms.map((p) => ({ ...p })),
}));

// THE SLAB THINS WITH THE ROSTER.
//
// A platform's LENGTH is a play decision — it is how much ground there is to
// fight over, and it deliberately did not move when the fighters got smaller.
// Its THICKNESS is a drawing decision: 42px reads as a kerb under a 149px
// fighter and as a wall under a 104px one, and nothing in the game tests the
// underside of a main platform for anything a player would notice.
//
// So thickness follows the bodies, and only thickness. The TOP EDGE — `y`, the
// surface everything stands, lands and grabs on — is untouched, so no spawn,
// no ledge and no tier step moves by a pixel. The authored numbers stay in the
// table above as the numbers somebody chose; this is the one place they are
// bent, so `git blame` still leads to the decision rather than to a rescale.
for (const stage of STAGES) {
  for (const p of stage.platforms) {
    // A WALL is exempt: its height is how tall the obstacle is — collision,
    // not slab art — and thinning it would float its foot off the ground.
    if (p.kind === "wall") continue;
    p.h = Math.max(6, Math.round(p.h * ART_SCALE));
  }
}

export function getStage(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

// Every board ships TWO paintings of the same scene, because the two cameras
// frame a backdrop differently and one plate cannot serve both:
//
//   assets/backgrounds/<bgFile>       the wide plate (3200×1800, round 18E)
//   assets/backgrounds/flat/<bgFile>  the painting the game shipped before it
//
// The 3D camera over-fills its frustum on purpose (×1.5 height, ×1.35 width in
// camera3d/stage_geo.js) so no dolly or yaw can swing past the backdrop's edge,
// and the cost is that only ~49% of the plate's width is ever on screen. The
// wide plates were repainted for exactly that crop. Flat mode has no frustum to
// over-fill — it shows the whole plate — so on the wide plates it sees an outer
// ring that was never composed as picture, and the boards read sparse and dim.
// It draws the older paintings instead, which are the framing it was built for.
//
// Filenames match between the two directories, with one exception: the flat
// Shibuya Night is still the `.webp` it shipped as (18E's replacement is the
// file that became `.jpg`), so it names its own file below.
const FLAT_BG_FILES = { shibuyaNight: "shibuya_night.webp" };

/** The backdrop file for `stage` under the given camera. `flat` true asks for
 *  the flat camera's painting; anything else gets the wide 3D plate. */
export function backgroundFile(stage, flat) {
  if (!flat) return `assets/backgrounds/${stage.bgFile}`;
  return `assets/backgrounds/flat/${FLAT_BG_FILES[stage.key] || stage.bgFile}`;
}

/** The same painting at MENU size — what the arena cards draw.
 *
 *  The cards are about 200 px wide and were being handed the match backdrop to
 *  fill them: 3200x1800 and 2.4 MB apiece, 67 MB across both trees, which is
 *  what made the arena grid fill in one slow card at a time. `tools/
 *  make_thumbnails.py` builds these (480 px wide, 1.6 MB for the lot) and
 *  `--check` fails if one is missing or older than its painting.
 *
 *  Always `.jpg`, whatever the painting is: the thumbnails are re-encoded, so
 *  the flat Shibuya Night's `.webp` has a `.jpg` thumbnail like everything
 *  else. Nothing here can 404 the card — src/ui.js falls the <img> back to the
 *  full painting — so a board dropped in before the tool is run still shows,
 *  just slowly. */
export function thumbFile(stage, flat) {
  const full = backgroundFile(stage, flat);
  const name = full.slice(full.lastIndexOf("/") + 1).replace(/\.[^.]+$/, ".jpg");
  return flat ? `assets/backgrounds/thumbs/flat/${name}` : `assets/backgrounds/thumbs/${name}`;
}

// Where a match of `count` fighters lines up. Two, three and four are placed by
// hand — those are the spacings the stages were laid out around. A crowd (five
// and up — Players vs CPUs, Battle Royal, six-player brawls) is spread evenly
// across THIS BOARD'S main platform when the caller passes it, so a wide board
// actually buys the crowd elbow room: six fighters on Sunken Crossing start
// ~210px apart, not the 128px the old fixed 320–960 span gave every stage.
// The span stays inside the main (70px off each lip) so every crowd spawn
// starts on solid ground even on the narrowest board.
const SPAWN_SETS = {
  2: [430, 850],
  3: [320, 640, 960],
  4: [250, 500, 780, 1030],
};
const CROWD_SPAN = { left: 320, right: 960 };

// How wide the crowd may line up, however wide the board is. A walk-off's main
// runs to x = 1420, and spreading six fighters over all of it would stand the
// outer two within a launch of the blast line before the match has started.
// Past this the line stays centred on the main and the extra ground is space
// to fight OVER rather than space to start on.
const CROWD_SPAN_MAX = 1100;

export function spawnXs(count, main) {
  if (SPAWN_SETS[count]) return SPAWN_SETS[count];
  let left = CROWD_SPAN.left;
  let right = CROWD_SPAN.right;
  if (main) {
    const inset = Math.max(70, (main.w - CROWD_SPAN_MAX) / 2);
    left = main.x + inset;
    right = main.x + main.w - inset;
  }
  const step = (right - left) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(left + step * i));
}

/**
 * WHERE A FIGHTER STANDS AT THE START, for a nominal x.
 *
 * A board with a STARTING TIER opens on it, full stop. The tier is the height
 * every board's ground used to be at, and the storey below it is board a match
 * should not begin in the middle of — so an x past the tier's ends is pulled
 * back ONTO it rather than dropped to the floor. That was the bug: the fixed
 * 2/3/4-player x's are the same on every board, and on the boards whose tier is
 * narrower than those numbers (Neon Split, Cursed Teeth) the outer two slots
 * fell through to the floor a storey down.
 *
 * A board with NO tier keeps the old rule — the lowest surface under that x —
 * which is what puts Bridge Duel's outer slots on its side platforms
 * Battlefield-style, and what makes the walk-offs open on their street. On
 * those boards the lowest ground IS the starting ground, so the two rules agree.
 *
 * Lives here rather than in `resetMatch` because the arena bench has to place a
 * fighter too, and two copies of "where does a match begin" is how the bench
 * came to stand its fighter on the floor while the game stood everyone on the
 * tier.
 */
export function spawnSpot(platforms, x) {
  const tier = spawnPlatform(platforms);
  if (!tier) return { x, y: 568 };
  const onto = () => ({ x: clamp(x, tier.x + 50, tier.x + tier.w - 50), y: tier.y });
  if (tier.kind === "spawn") return onto();
  const under = platforms.filter((p) => x >= p.x + 12 && x <= p.x + p.w - 12);
  if (under.length) return { x, y: Math.max(...under.map((p) => p.y)) };
  return onto();
}

export function mainPlatform(platforms) {
  return platforms.find((p) => p.kind === "main") || platforms[0];
}

/** EVERY piece of lowest ground. One on most boards, two on the split six.
 *
 *  `mainPlatform` above still answers "a" main and is what the hazards and the
 *  camera rig anchor to — they want a reference point, and both halves of a
 *  split floor sit at the same y. This is for the things that must not miss the
 *  other half: the ledges you can grab, and how wide the ground actually is. */
export function mainPlatforms(platforms) {
  const mains = platforms.filter((p) => p.kind === "main");
  return mains.length ? mains : [platforms[0]].filter(Boolean);
}

/** How far the ground reaches, across every main. On a split board this spans
 *  the hole — which is right for "am I about to walk off the STAGE", and wrong
 *  for "is there floor under my next step"; ai.js asks both. */
export function groundSpan(platforms) {
  const mains = mainPlatforms(platforms);
  return {
    left: Math.min(...mains.map((p) => p.x)),
    right: Math.max(...mains.map((p) => p.x + p.w)),
    y: Math.min(...mains.map((p) => p.y)),
  };
}

/** WHERE A MATCH OPENS — the `spawn: true` tier, which is the platform the old
 *  layout used as its ground. Boards with no tier of their own (the walk-offs,
 *  whose floor IS the starting ground) fall back to the main, so every caller
 *  gets an answer without knowing which kind of board it is on.
 *
 *  Asked by the spawn placement, by the crowd spread, and by the camera's
 *  high-play envelope — that last one because "play has gone high" has to mean
 *  high relative to where the fight NORMALLY happens, not relative to the floor
 *  under it. Measured off the floor, standing on the starting tier would read
 *  as permanently half-elevated. */
export function spawnPlatform(platforms) {
  return platforms.find((p) => p.kind === "spawn") || mainPlatform(platforms);
}

/** GROUND LEVEL for anything that draws or lands at "the floor" without asking
 *  which platform — shockwaves, ground slams, where a summon stands.
 *
 *  The STARTING TIER, not the lowest ground. These callers all used
 *  `state.platforms[0].y`, which was the same number until the floor moved down
 *  a storey (see the header); left alone they would have painted every ground
 *  effect 120px under the fight. This keeps them exactly where they have always
 *  been drawn, and gives them one name instead of eight copies of an index. */
export function groundY(platforms) {
  return spawnPlatform(platforms)?.y ?? 568;
}
