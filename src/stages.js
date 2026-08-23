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
// FIVE BOARDS KEEP A HIGH FLOOR, because a floor underneath would cost them
// the thing they are. Sunken Crossing and Crosswalk Rush are walk-offs whose
// street already IS the bottom of the world. Bridge Duel is a narrow bridge
// over a void — catching yourself on a floor below is exactly what that board
// is meant not to offer, and its gimmick drifts that bridge. Garden Steps is a
// staircase, and a staircase reads from its bottom step. Training Bridge is the
// board everybody meets first, and it teaches the shape best without a storey
// under it. Every other board gains the storey; which ones do is a per-board
// decision, not a rule.
//
// THREE BOARDS SPLIT THAT FLOOR, with holes down the middle: Neon Split,
// Cursed Teeth, and Curse Maw — whose floor comes in THREE pieces, a row of
// teeth with a gap between each. The spawn tier bridges the gaps, so a match
// opens on solid ground and the hole is something you choose to deal with:
// more grabbable ledges, and a way to lose a stock straight down the middle.
// The three run gimmicks that measure the floor by its whole SPAN rather than
// by one slab (stage_fx.js floorRect), so a hazard still crosses the board.
//
// WHERE A MATCH OPENS IS ITS OWN DECISION, separate from what the ground is.
// On eight boards it is the `kind: "spawn"` drop-through a storey above the
// floor; on seven it is the ground itself, marked `spawn: true` (see
// spawnPlatform below) — those are boards whose fight wanted one clean surface
// rather than two storeys, and the flag is what lets them say so without
// giving up the floor's other properties. The arena bench exposes it as a tick
// box, one per board.
//
// AND A PLATFORM MAY HANG BELOW THE FLOOR. Bridge Duel keeps two catch
// platforms under its bridge: nothing grabs their ledges (only a main has
// those) but a fighter knocked off has something to land on. The audit says so
// rather than refusing it.
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
    { x: 219, y: 497, w: 844, h: 42, kind: "main" }, { x: 141, y: 353, w: 250, h: 15, kind: "side" }, { x: 891, y: 353, w: 250, h: 15, kind: "side" }, { x: 513, y: 231, w: 256, h: 15, kind: "top" }
  ] },
  { key: "quietHall", name: "Quiet Hall", bgFile: "quiet_hall.jpg", tint: "rgba(175, 128, 80, 0.12)", platforms: [
    { x: -149, y: 692, w: 1581, h: 42, kind: "main" }, { x: 206, y: 572, w: 868, h: 15, kind: "spawn" }, { x: 230, y: 438, w: 270, h: 15, kind: "side" }, { x: 780, y: 452, w: 270, h: 15, kind: "side" }
  ] },
  { key: "floodedGate", name: "Flooded Gate", bgFile: "flooded_gate.jpg", tint: "rgba(107, 174, 214, 0.13)", platforms: [
    { x: 77, y: 590, w: 1151, h: 42, kind: "main", spawn: true }, { x: 150, y: 446, w: 200, h: 15, kind: "side" }, { x: 930, y: 446, w: 200, h: 15, kind: "side" }, { x: 464, y: 300, w: 352, h: 15, kind: "top" }
  ] },
  { key: "shibuyaNight", name: "Shibuya Night", bgFile: "shibuya_night.jpg", tint: "rgba(88, 116, 220, 0.16)", platforms: [
    { x: 110, y: 686, w: 1029, h: 42, kind: "main" }, { x: 330, y: 566, w: 600, h: 15, kind: "spawn" }, { x: 170, y: 452, w: 220, h: 15, kind: "side" }, { x: 857, y: 452, w: 220, h: 15, kind: "side" }, { x: 350, y: 342, w: 190, h: 15, kind: "side" }, { x: 740, y: 342, w: 190, h: 15, kind: "side" }, { x: 505, y: 240, w: 270, h: 15, kind: "top" }
  ] },
  { key: "curseMaw", name: "Curse Maw", bgFile: "curse_maw.jpg", tint: "rgba(60, 215, 218, 0.13)", platforms: [
    { x: 116, y: 699, w: 184, h: 42, kind: "main" }, { x: 228, y: 576, w: 824, h: 15, kind: "spawn" }, { x: 240, y: 442, w: 220, h: 15, kind: "side" }, { x: 820, y: 442, w: 220, h: 15, kind: "side" }, { x: 493, y: 697, w: 275, h: 42, kind: "main" }, { x: 921, y: 695, w: 184, h: 42, kind: "main" }, { x: 312, y: 68, w: 31, h: 259, kind: "wall" }, { x: 972, y: 63, w: 31, h: 259, kind: "wall" }
  ] },
  { key: "gardenSteps", name: "Garden Steps", bgFile: "garden_steps.jpg", tint: "rgba(111, 219, 147, 0.16)", platforms: [
    { x: 17, y: 630, w: 1219, h: 42, kind: "main" }, { x: 134, y: 495, w: 210, h: 15, kind: "side" }, { x: 419, y: 398, w: 210, h: 15, kind: "top" }, { x: 719, y: 311, w: 240, h: 15, kind: "side" }, { x: 1026, y: 197, w: 240, h: 15, kind: "side" }
  ] },
  { key: "lanternCorridor", name: "Lantern Corridor", bgFile: "lantern_corridor.jpg", tint: "rgba(255, 187, 93, 0.11)", platforms: [
    { x: 35, y: 690, w: 1217, h: 42, kind: "main" }, { x: 165, y: 570, w: 982, h: 15, kind: "spawn" }, { x: 210, y: 428, w: 210, h: 15, kind: "side" }, { x: 535, y: 428, w: 210, h: 15, kind: "side" }, { x: 860, y: 428, w: 210, h: 15, kind: "side" }, { x: 539, y: 298, w: 210, h: 15, kind: "side" }, { x: 543, y: 159, w: 210, h: 15, kind: "side" }
  ] },
  { key: "sunkenCrossing", name: "Sunken Crossing", bgFile: "sunken_crossing.jpg", tint: "rgba(87, 196, 255, 0.12)", mods: { frictionPow: 0.35 }, platforms: [
    { x: -140, y: 668, w: 1560, h: 42, kind: "main" }, { x: 170, y: 536, w: 320, h: 15, kind: "side" }, { x: 790, y: 536, w: 320, h: 15, kind: "side" }
  ] },
  { key: "neonSplit", name: "Neon Split", bgFile: "neon_split.jpg", tint: "rgba(224, 82, 192, 0.12)", platforms: [
    { x: -104, y: 696, w: 641, h: 42, kind: "main" }, { x: 240, y: 568, w: 800, h: 15, kind: "spawn" }, { x: 42, y: 452, w: 378, h: 15, kind: "side" }, { x: 860, y: 452, w: 401, h: 15, kind: "side" }, { x: 134, y: 337, w: 315, h: 15, kind: "side" }, { x: 830, y: 332, w: 318, h: 15, kind: "side" }, { x: 787, y: 693, w: 573, h: 42, kind: "main" }, { x: 230, y: 193, w: 325, h: 15, kind: "side" }, { x: 767, y: 191, w: 304, h: 15, kind: "side" }
  ] },
  { key: "boneSanctum", name: "Bone Sanctum", bgFile: "bone_sanctum.jpg", tint: "rgba(76, 221, 210, 0.1)", platforms: [
    { x: 223, y: 586, w: 853, h: 42, kind: "main", spawn: true }, { x: 160, y: 456, w: 190, h: 15, kind: "side" }, { x: 930, y: 456, w: 190, h: 15, kind: "side" }, { x: 400, y: 346, w: 180, h: 15, kind: "side" }, { x: 700, y: 346, w: 180, h: 15, kind: "side" }, { x: 315, y: 236, w: 200, h: 15, kind: "side" }, { x: 765, y: 236, w: 200, h: 15, kind: "side" }
  ] },
  { key: "bridgeDuel", name: "Bridge Duel", bgFile: "bridge_duel.jpg", tint: "rgba(49, 168, 134, 0.12)", platforms: [
    { x: 179, y: 475, w: 907, h: 42, kind: "main" }, { x: -6, y: 661, w: 263, h: 15, kind: "side" }, { x: 878, y: 672, w: 265, h: 15, kind: "side" }
  ] },
  { key: "academyHall", name: "Academy Hall", bgFile: "academy_hall.jpg", tint: "rgba(140, 112, 80, 0.14)", platforms: [
    { x: 56, y: 585, w: 1160, h: 42, kind: "main", spawn: true }, { x: 230, y: 446, w: 220, h: 15, kind: "side" }, { x: 830, y: 446, w: 220, h: 15, kind: "side" }, { x: 512, y: 320, w: 256, h: 15, kind: "top" }, { x: 560, y: 452, w: 160, h: 15, kind: "side" }, { x: 560, y: 191, w: 160, h: 15, kind: "side" }
  ] },
  { key: "mistPier", name: "Mist Pier", bgFile: "mist_pier.jpg", tint: "rgba(178, 226, 255, 0.1)", platforms: [
    { x: 129, y: 703, w: 1052, h: 42, kind: "main" }, { x: 333, y: 580, w: 640, h: 15, kind: "spawn" }, { x: 498, y: 416, w: 339, h: 15, kind: "side" }, { x: 602, y: 294, w: 150, h: 15, kind: "top" }
  ] },
  { key: "crosswalkRush", name: "Crosswalk Rush", bgFile: "crosswalk_rush.jpg", tint: "rgba(76, 171, 255, 0.13)", platforms: [
    { x: -140, y: 664, w: 1560, h: 42, kind: "main" }, { x: 340, y: 532, w: 600, h: 15, kind: "side" }, { x: 130, y: 398, w: 170, h: 15, kind: "top" }, { x: 980, y: 398, w: 170, h: 15, kind: "top" }
  ] },
  { key: "cursedTeeth", name: "Cursed Teeth", bgFile: "cursed_teeth.jpg", tint: "rgba(42, 205, 204, 0.14)", platforms: [
    { x: 110, y: 699, w: 388, h: 42, kind: "main" }, { x: 98, y: 584, w: 1114, h: 15, kind: "spawn" }, { x: 167, y: 329, w: 292, h: 15, kind: "side" }, { x: 838, y: 331, w: 300, h: 15, kind: "side" }, { x: 554, y: 170, w: 195, h: 15, kind: "top" }, { x: -28, y: 191, w: 34, h: 310, kind: "wall" }, { x: 1297, y: 173, w: 34, h: 332, kind: "wall" }, { x: 755, y: 697, w: 425, h: 42, kind: "main" }
  ] },
  { key: "riverGate", name: "River Gate", bgFile: "river_gate.jpg", tint: "rgba(91, 205, 176, 0.13)", platforms: [
    { x: 110, y: 696, w: 1060, h: 42, kind: "main" }, { x: 244, y: 573, w: 538, h: 15, kind: "spawn" }, { x: -42, y: 488, w: 243, h: 15, kind: "side" }, { x: 189, y: 209, w: 200, h: 15, kind: "side" }, { x: 408, y: 350, w: 325, h: 15, kind: "top" }, { x: 60, y: 11, w: 26, h: 480, kind: "wall" }, { x: 1144, y: 77, w: 34, h: 430, kind: "wall" }, { x: -116, y: 617, w: 116, h: 15, kind: "side" }, { x: 896, y: 141, w: 244, h: 15, kind: "side" }, { x: 857, y: 87, w: 34, h: 430, kind: "wall" }, { x: 889, y: 501, w: 257, h: 15, kind: "side" }
  ] },
  { key: "schoolWing", name: "School Wing", bgFile: "school_wing.jpg", tint: "rgba(205, 148, 92, 0.1)", platforms: [
    { x: 79, y: 591, w: 1170, h: 42, kind: "main", spawn: true }, { x: 149, y: 446, w: 221, h: 15, kind: "side" }, { x: 844, y: 448, w: 200, h: 15, kind: "side" }, { x: 340, y: 330, w: 130, h: 15, kind: "side" }, { x: 790, y: 330, w: 170, h: 15, kind: "side" }, { x: 1123, y: 228, w: 130, h: 15, kind: "side" }, { x: -53, y: 290, w: 130, h: 15, kind: "side" }, { x: 76, y: 171, w: 130, h: 15, kind: "side" }
  ] },
  { key: "emptyCity", name: "Empty City", bgFile: "empty_city.jpg", tint: "rgba(159, 189, 214, 0.15)", platforms: [
    { x: 72, y: 597, w: 1118, h: 42, kind: "main", spawn: true }, { x: 130, y: 375, w: 210, h: 15, kind: "side" }, { x: 918, y: 385, w: 210, h: 15, kind: "side" }, { x: 50, y: 256, w: 190, h: 15, kind: "top" }, { x: 611, y: 245, w: 389, h: 15, kind: "top" }, { x: 240, y: 480, w: 210, h: 15, kind: "side" }, { x: 761, y: 480, w: 203, h: 15, kind: "side" }
  ] },
  { key: "billboardRoof", name: "Billboard Roof", bgFile: "billboard_roof.jpg", tint: "rgba(255, 83, 148, 0.1)", platforms: [
    { x: 253, y: 589, w: 815, h: 42, kind: "main", spawn: true }, { x: 180, y: 470, w: 150, h: 15, kind: "side" }, { x: 950, y: 470, w: 150, h: 15, kind: "side" }, { x: 470, y: 370, w: 340, h: 15, kind: "side" }, { x: 540, y: 262, w: 200, h: 15, kind: "top" }, { x: -43, y: 323, w: 340, h: 15, kind: "side" }, { x: 1024, y: 323, w: 340, h: 15, kind: "side" }, { x: 980, y: 94, w: 150, h: 15, kind: "side" }
  ] },
  { key: "domainCore", name: "Domain Core", bgFile: "domain_core.jpg", tint: "rgba(108, 255, 230, 0.13)", mods: { gravityMul: 0.88 }, platforms: [
    { x: 306, y: 585, w: 681, h: 42, kind: "main", spawn: true }, { x: 240, y: 458, w: 180, h: 15, kind: "side" }, { x: 860, y: 458, w: 180, h: 15, kind: "side" }, { x: 430, y: 338, w: 170, h: 15, kind: "side" }, { x: 680, y: 338, w: 170, h: 15, kind: "side" }, { x: 17, y: 341, w: 180, h: 15, kind: "side" }, { x: 1087, y: 335, w: 180, h: 15, kind: "side" }, { x: 1148, y: 196, w: 180, h: 15, kind: "side" }, { x: -101, y: 201, w: 180, h: 15, kind: "side" }
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
  // A tier somebody CHOSE — a drop-through `kind: "spawn"`, or a main marked
  // `spawn: true` — is where the crowd lines up, full stop. Only the implicit
  // fallback below (no tier declared anywhere, so the ground is the ground)
  // keeps the old lowest-surface-under-x rule.
  if (tier.kind === "spawn" || tier.spawn) return onto();
  // THE FALLBACK: no tier declared, so the ground is the ground. Standing ON
  // the ground wins wherever it is underfoot — Bridge Duel hangs two catch
  // platforms UNDER its bridge, and "the lowest surface under this x" alone
  // would have opened the outer slots below the board they are meant to duel
  // on. Only where the ground is NOT under that x does the lowest surface
  // decide, which is what still opens a slot on a side platform Battlefield-
  // style rather than in mid-air.
  if (x >= tier.x + 12 && x <= tier.x + tier.w - 12) return { x, y: tier.y };
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

/** WHERE A MATCH OPENS — the `kind: "spawn"` tier, which is the platform the
 *  old layout used as its ground. Boards with no tier of their own (the walk-
 *  offs and the classic boards, whose ground IS the starting ground) fall back
 *  to the main, so every caller gets an answer without knowing which kind of
 *  board it is on.
 *
 *  A GROUND CAN BE THE TIER ON PURPOSE, too: `spawn: true` on any platform
 *  names it the tier and wins over everything else. That is for the board that
 *  wants a floor under the fight AND wants the match to open on a piece of
 *  solid ground rather than on a drop-through — the two used to be the same
 *  decision because the tier was a kind, and a kind a main could not also be.
 *
 *  Asked by the spawn placement, by the crowd spread, and by the camera's
 *  high-play envelope — that last one because "play has gone high" has to mean
 *  high relative to where the fight NORMALLY happens, not relative to the floor
 *  under it. Measured off the floor, standing on the starting tier would read
 *  as permanently half-elevated. */
export function spawnPlatform(platforms) {
  return platforms.find((p) => p.spawn)
    || platforms.find((p) => p.kind === "spawn")
    || mainPlatform(platforms);
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
