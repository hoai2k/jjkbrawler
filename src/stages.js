// 20 stages carried over from v1 — every layout: 1 main + 2 side + 1 top platform
// (Garden Steps breaks the mold with a terraced staircase). Platform kinds:
// "main" is solid ground with grabbable ledges; others are drop-through.
//
// A stage's gameplay identity (hazards, platform motion — "Active Boards" in
// Settings) lives in src/stage_fx.js, keyed by the stage key. The optional
// `mods` field holds always-on-while-active field modifiers:
//   gravityMul  — scales gravity for the whole match (Domain Core floats)
//   frictionPow — exponent on ground friction; < 1 is slick (Sunken Crossing)

export const STAGES = [
  { key: "trainingBridge", name: "Training Bridge", bgFile: "training_bridge.jpg", tint: "rgba(87, 186, 129, 0.12)", platforms: [
    { x: 248, y: 568, w: 784, h: 42, kind: "main" }, { x: 168, y: 424, w: 250, h: 22, kind: "side" }, { x: 862, y: 424, w: 250, h: 22, kind: "side" }, { x: 512, y: 302, w: 256, h: 20, kind: "top" }
  ] },
  { key: "quietHall", name: "Quiet Hall", bgFile: "quiet_hall.jpg", tint: "rgba(175, 128, 80, 0.12)", platforms: [
    { x: 236, y: 572, w: 808, h: 42, kind: "main" }, { x: 238, y: 440, w: 220, h: 22, kind: "side" }, { x: 820, y: 440, w: 220, h: 22, kind: "side" }, { x: 520, y: 318, w: 240, h: 20, kind: "top" }
  ] },
  { key: "floodedGate", name: "Flooded Gate", bgFile: "flooded_gate.jpg", tint: "rgba(107, 174, 214, 0.13)", platforms: [
    { x: 220, y: 570, w: 840, h: 42, kind: "main" }, { x: 150, y: 430, w: 250, h: 22, kind: "side" }, { x: 880, y: 430, w: 250, h: 22, kind: "side" }, { x: 500, y: 292, w: 280, h: 20, kind: "top" }
  ] },
  { key: "shibuyaNight", name: "Shibuya Night", bgFile: "shibuya_night.webp", tint: "rgba(88, 116, 220, 0.16)", platforms: [
    { x: 250, y: 566, w: 780, h: 42, kind: "main" }, { x: 116, y: 428, w: 240, h: 22, kind: "side" }, { x: 924, y: 428, w: 240, h: 22, kind: "side" }, { x: 475, y: 346, w: 330, h: 20, kind: "top" }
  ] },
  { key: "curseMaw", name: "Curse Maw", bgFile: "curse_maw.jpg", tint: "rgba(60, 215, 218, 0.13)", platforms: [
    { x: 258, y: 576, w: 764, h: 42, kind: "main" }, { x: 208, y: 442, w: 200, h: 22, kind: "side" }, { x: 872, y: 442, w: 200, h: 22, kind: "side" }, { x: 528, y: 324, w: 224, h: 20, kind: "top" }
  ] },
  // Terraced like the garden's stone steps: each platform is one stair higher
  // than the last, climbing left to right.
  { key: "gardenSteps", name: "Garden Steps", bgFile: "garden_steps.jpg", tint: "rgba(111, 219, 147, 0.16)", platforms: [
    { x: 212, y: 584, w: 856, h: 42, kind: "main" }, { x: 150, y: 474, w: 210, h: 22, kind: "side" }, { x: 470, y: 392, w: 210, h: 20, kind: "top" }, { x: 800, y: 318, w: 240, h: 22, kind: "side" }
  ] },
  { key: "lanternCorridor", name: "Lantern Corridor", bgFile: "lantern_corridor.jpg", tint: "rgba(255, 187, 93, 0.11)", platforms: [
    { x: 252, y: 570, w: 776, h: 42, kind: "main" }, { x: 300, y: 426, w: 210, h: 22, kind: "side" }, { x: 770, y: 426, w: 210, h: 22, kind: "side" }, { x: 528, y: 304, w: 224, h: 20, kind: "top" }
  ] },
  { key: "sunkenCrossing", name: "Sunken Crossing", bgFile: "sunken_crossing.jpg", tint: "rgba(87, 196, 255, 0.12)", mods: { frictionPow: 0.35 }, platforms: [
    { x: 190, y: 578, w: 900, h: 42, kind: "main" }, { x: 170, y: 438, w: 260, h: 22, kind: "side" }, { x: 852, y: 438, w: 260, h: 22, kind: "side" }, { x: 520, y: 350, w: 240, h: 20, kind: "top" }
  ] },
  { key: "neonSplit", name: "Neon Split", bgFile: "neon_split.jpg", tint: "rgba(224, 82, 192, 0.12)", platforms: [
    { x: 270, y: 568, w: 740, h: 42, kind: "main" }, { x: 116, y: 448, w: 220, h: 22, kind: "side" }, { x: 482, y: 334, w: 316, h: 20, kind: "top" }, { x: 944, y: 448, w: 220, h: 22, kind: "side" }
  ] },
  { key: "boneSanctum", name: "Bone Sanctum", bgFile: "bone_sanctum.jpg", tint: "rgba(76, 221, 210, 0.1)", platforms: [
    { x: 236, y: 574, w: 808, h: 42, kind: "main" }, { x: 210, y: 438, w: 190, h: 22, kind: "side" }, { x: 506, y: 302, w: 268, h: 20, kind: "top" }, { x: 880, y: 438, w: 190, h: 22, kind: "side" }
  ] },
  { key: "bridgeDuel", name: "Bridge Duel", bgFile: "bridge_duel.jpg", tint: "rgba(49, 168, 134, 0.12)", platforms: [
    { x: 310, y: 582, w: 660, h: 42, kind: "main" }, { x: 116, y: 454, w: 248, h: 22, kind: "side" }, { x: 916, y: 454, w: 248, h: 22, kind: "side" }, { x: 510, y: 334, w: 260, h: 20, kind: "top" }
  ] },
  { key: "academyHall", name: "Academy Hall", bgFile: "academy_hall.jpg", tint: "rgba(140, 112, 80, 0.14)", platforms: [
    { x: 180, y: 568, w: 920, h: 42, kind: "main" }, { x: 268, y: 426, w: 220, h: 22, kind: "side" }, { x: 792, y: 426, w: 220, h: 22, kind: "side" }, { x: 512, y: 294, w: 256, h: 20, kind: "top" }
  ] },
  { key: "mistPier", name: "Mist Pier", bgFile: "mist_pier.jpg", tint: "rgba(178, 226, 255, 0.1)", platforms: [
    { x: 252, y: 580, w: 776, h: 42, kind: "main" }, { x: 126, y: 444, w: 230, h: 22, kind: "side" }, { x: 442, y: 342, w: 180, h: 20, kind: "top" }, { x: 884, y: 444, w: 270, h: 22, kind: "side" }
  ] },
  { key: "crosswalkRush", name: "Crosswalk Rush", bgFile: "crosswalk_rush.jpg", tint: "rgba(76, 171, 255, 0.13)", platforms: [
    { x: 230, y: 570, w: 820, h: 42, kind: "main" }, { x: 190, y: 434, w: 210, h: 22, kind: "side" }, { x: 510, y: 314, w: 260, h: 20, kind: "top" }, { x: 880, y: 434, w: 210, h: 22, kind: "side" }
  ] },
  { key: "cursedTeeth", name: "Cursed Teeth", bgFile: "cursed_teeth.jpg", tint: "rgba(42, 205, 204, 0.14)", platforms: [
    { x: 274, y: 584, w: 732, h: 42, kind: "main" }, { x: 164, y: 452, w: 230, h: 22, kind: "side" }, { x: 468, y: 336, w: 170, h: 20, kind: "top" }, { x: 840, y: 420, w: 270, h: 22, kind: "side" }
  ] },
  { key: "riverGate", name: "River Gate", bgFile: "river_gate.jpg", tint: "rgba(91, 205, 176, 0.13)", platforms: [
    { x: 230, y: 576, w: 820, h: 42, kind: "main" }, { x: 238, y: 436, w: 210, h: 22, kind: "side" }, { x: 528, y: 312, w: 224, h: 20, kind: "top" }, { x: 832, y: 456, w: 210, h: 22, kind: "side" }
  ] },
  { key: "schoolWing", name: "School Wing", bgFile: "school_wing.jpg", tint: "rgba(205, 148, 92, 0.1)", platforms: [
    { x: 260, y: 570, w: 760, h: 42, kind: "main" }, { x: 126, y: 430, w: 250, h: 22, kind: "side" }, { x: 498, y: 344, w: 284, h: 20, kind: "top" }, { x: 904, y: 430, w: 250, h: 22, kind: "side" }
  ] },
  { key: "emptyCity", name: "Empty City", bgFile: "empty_city.jpg", tint: "rgba(159, 189, 214, 0.15)", platforms: [
    { x: 210, y: 574, w: 860, h: 42, kind: "main" }, { x: 154, y: 446, w: 210, h: 22, kind: "side" }, { x: 486, y: 326, w: 308, h: 20, kind: "top" }, { x: 916, y: 446, w: 210, h: 22, kind: "side" }
  ] },
  { key: "billboardRoof", name: "Billboard Roof", bgFile: "billboard_roof.jpg", tint: "rgba(255, 83, 148, 0.1)", platforms: [
    { x: 244, y: 580, w: 792, h: 42, kind: "main" }, { x: 248, y: 444, w: 180, h: 22, kind: "side" }, { x: 526, y: 320, w: 228, h: 20, kind: "top" }, { x: 852, y: 444, w: 180, h: 22, kind: "side" }
  ] },
  { key: "domainCore", name: "Domain Core", bgFile: "domain_core.jpg", tint: "rgba(108, 255, 230, 0.13)", mods: { gravityMul: 0.88 }, platforms: [
    { x: 196, y: 578, w: 888, h: 42, kind: "main" }, { x: 152, y: 438, w: 250, h: 22, kind: "side" }, { x: 515, y: 304, w: 250, h: 20, kind: "top" }, { x: 878, y: 438, w: 250, h: 22, kind: "side" }
  ] }
];

export function getStage(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

export function mainPlatform(platforms) {
  return platforms.find((p) => p.kind === "main") || platforms[0];
}
