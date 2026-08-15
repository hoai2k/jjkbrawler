// HUMAN-VERIFIED STRIKE POINTS — where each move actually lands, as checked
// by a person against that fighter's own drawing.
//
// Written by the verification bench: `/workbench/?edit=verification`, task
// set "strike-points". The bench exports a JSON payload; paste its
// `STRIKE_POINTS` block in here and commit it. This file is the ONE place a
// human decision about a strike point lives, which is why it is hand-editable
// where src/config_model_reach.js (a measurement) is generated.
//
// KEYED BY SPRITE FRAME, not by animation state. A verified point is a claim
// about one PICTURE — "on this drawing, the fist is here" — so it is filed
// under the drawing's own name. Two states that show the same frame share the
// answer for free, and a state re-pointed at different art falls back to the
// measurement rather than carrying a decision about a picture nobody is
// looking at any more. The frame a state uses is its CONTACT frame
// (strike_points.js contactFrame): the strike, not the wind-up.
//
// STORED IN THE DRAWING'S OWN PIXELS — the same space the sprite manifest's
// `anchors` use — because that is what "a point on this artwork" means. The
// sprite workbench moves and resizes art constantly: `ox` slides it,
// `bodyBottom` re-specifies the foot line, `renderScale` resizes it. A point
// stored relative to the FIGHTER would silently come off the fist every time
// somebody nudged a pose; in image space it rides along, because
// strike_points.js converts it through the same placement arithmetic the
// renderer draws with.
//
// `file` is the drawing the decision was made against. When the art is
// REPLACED — a redraw landing under the same frame name — the point is about
// a picture that no longer exists, so it is dropped and the measurement takes
// over. That is the one thing image space cannot ride out, and it is the one
// thing that should invalidate a decision rather than survive it.

export const STRIKE_POINTS = {
  "inumaki": {
    attack_air_b: { x: 869.7, y: 391.9, file: "inumaki/attack_air_b.png" },
    attack_down: { x: 271.3, y: 852.7, file: "inumaki/attack_down.png" },
    attack_heavy_b: { x: 912.3, y: 285.2, file: "inumaki/attack_heavy_b.png" },
    attack_light_b: { x: 49.2, y: 239.9, file: "inumaki/attack_light_b.png" },
    attack_up: { x: 471.2, y: 91.2, file: "inumaki/attack_up.png" },
    crouch_attack_b: { x: 829.6, y: 346.2, file: "inumaki/crouch_attack_b.png" },
  },
  "maki": {
    attack_air_b: { x: 851.3, y: 421.1, file: "maki/attack_air_b.png" },
    attack_down: { x: 622.5, y: 1230.4, file: "maki/attack_down.png" },
    attack_heavy_b: { x: 1274.7, y: 383.2, file: "maki/attack_heavy_b.png" },
    attack_light_b: { x: 840.6, y: 327.5, file: "maki/attack_light_b.png" },
    attack_up: { x: 541.9, y: 83.7, file: "maki/attack_up.png" },
    crouch_attack_b: { x: 789, y: 812.3, file: "maki/crouch_attack_b.png" },
  },
  "mechamaru": {
    attack_air_b: { x: 817.8, y: 221.3, file: "mechamaru/attack_air_b.png" },
    attack_down: { x: 642.7, y: 931.8, file: "mechamaru/attack_down.png" },
    attack_heavy_b: { x: 737.2, y: 276.3, file: "mechamaru/incoming/attack_heavy_b.png" },
    attack_light_b: { x: 1069.8, y: 195.2, file: "mechamaru/attack_light_b.png" },
    attack_up: { x: 494.1, y: 136.8, file: "mechamaru/attack_up.png" },
    crouch_attack_b: { x: 834.4, y: 343.2, file: "mechamaru/incoming/crouch_attack_b.png" },
  },
  "megumi": {
    attack_air_b: { x: 899.9, y: 440.2, file: "megumi/attack_air_b.png" },
    attack_down: { x: 584.2, y: 907.2, file: "megumi/attack_down.png" },
    attack_heavy_b: { x: 914.6, y: 319.1, file: "megumi/attack_heavy_b.png" },
    attack_light_b: { x: 919.1, y: 306.9, file: "megumi/attack_light_b.png" },
    attack_up: { x: 248.5, y: 47.8, file: "megumi/attack_up.png" },
    crouch_attack_b: { x: 854.1, y: 303.1, file: "megumi/crouch_attack_b.png" },
  },
  "momo": {
    attack_air_b: { x: 918.3, y: 309.5, file: "momo/attack_air_b.png" },
    attack_down: { x: 577.1, y: 1046.2, file: "momo/attack_down.png" },
    attack_heavy_b: { x: 897.4, y: 610.3, file: "momo/attack_heavy_b.png" },
    attack_light_b: { x: 899.3, y: 343.5, file: "momo/attack_light_b.png" },
    attack_up: { x: 492.5, y: 88.7, file: "momo/attack_up.png" },
    crouch_attack_b: { x: 823.6, y: 671.3, file: "momo/crouch_attack_b.png" },
  },
  "nobara": {
    attack_air_b: { x: 862.1, y: 752.4, file: "nobara/attack_air_b.png" },
    attack_down: { x: 722.1, y: 897.1, file: "nobara/attack_down.png" },
    attack_heavy_b: { x: 799.7, y: 668.3, file: "nobara/crouch_attack_b.png" },
    attack_light_b: { x: 236.1, y: 113.2, file: "nobara/specialNeutral.png" },
    attack_up: { x: 506, y: 28.4, file: "nobara/attack_up.png" },
    crouch_attack_b: { x: 1182.9, y: 132.6, file: "nobara/attack_dash.png" },
  },
  "panda": {
    attack_air_b: { x: 855.2, y: 376.2, file: "panda/attack_air_b.png" },
    attack_down: { x: 612.7, y: 1044.5, file: "panda/attack_down.png" },
    attack_heavy_b: { x: 865, y: 701.6, file: "panda/attack_heavy_b.png" },
    attack_light_b: { x: 875.7, y: 327.8, file: "panda/attack_light_b.png" },
    attack_up: { x: 505.4, y: 80.7, file: "panda/attack_up.png" },
    crouch_attack_b: { x: 858.1, y: 820.6, file: "panda/crouch_attack_b.png" },
  },
  "todo": {
    attack_air_b: { x: 897.2, y: 193.9, file: "todo/attack_air_b.png" },
    attack_down: { x: 673.9, y: 922.6, file: "todo/attack_down.png" },
    attack_heavy_b: { x: 838.7, y: 658, file: "todo/attack_heavy_b.png" },
    attack_light_b: { x: 861.2, y: 316.5, file: "todo/attack_light_b.png" },
    attack_up: { x: 380.9, y: 50.8, file: "todo/attack_up.png" },
    crouch_attack_b: { x: 929.9, y: 664.4, file: "todo/crouch_attack_b.png" },
  },
  "yuji": {
    attack_air_b: { x: 830.1, y: 423.7, file: "yuji/attack_air_b.png" },
    attack_down: { x: 830.1, y: 628.6, file: "yuji/attack_down.png" },
    attack_heavy_b: { x: 876.2, y: 230.7, file: "yuji/attack_heavy_b.png" },
    attack_light_b: { x: 922.4, y: 291.6, file: "yuji/attack_light_b.png" },
    attack_up: { x: 616.4, y: 31.3, file: "yuji/attack_up.png" },
    crouch_attack_b: { x: 1404, y: 562.5, file: "yuji/crouch_attack_b.png" },
  },
  "yuta": {
    attack_air_b: { x: 856.2, y: 231.6, file: "yuta/attack_air_b.png" },
    attack_down: { x: 793.2, y: 1004.6, file: "yuta/attack_down.png" },
    attack_heavy_b: { x: 938.1, y: 222.9, file: "yuta/attack_dash.png" },
    attack_light_b: { x: 815.1, y: 231.6, file: "yuta/attack_air_b.png" },
    attack_up: { x: 531.9, y: 95.1, file: "yuta/attack_up.png" },
    crouch_attack_b: { x: 1236.3, y: 238.3, file: "yuta/crouch_attack_b.png" },
  },
};

/** Who checked what, and when — so the audit can report coverage and a
 *  reviewer can see which decisions predate a redraw. Keyed the same way;
 *  `at` is an ISO date, `states` records which state(s) the frame was
 *  reviewed under, `note` is free text. */
export const STRIKE_POINT_META = {
  "inumaki": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "maki": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "mechamaru": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "megumi": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "momo": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "nobara": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "panda": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "todo": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "yuji": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
  "yuta": { attack_air_b: { at: "2026-08-15", states: ["airLight"] }, attack_down: { at: "2026-08-15", states: ["downHeavy"] }, attack_heavy_b: { at: "2026-08-15", states: ["sideHeavy"] }, attack_light_b: { at: "2026-08-15", states: ["light"] }, attack_up: { at: "2026-08-15", states: ["upHeavy"] }, crouch_attack_b: { at: "2026-08-15", states: ["crouchAttack"] } },
};
