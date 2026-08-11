// The mannequin: a code-built figure on the standard skeleton, plus a
// programmatic clip for every animation state.
//
// It exists twice over:
//
//   * It is phase B0's proof body — the fighter that lets the whole pipeline
//     (pose, render, cache, blit, smoke tests) be built and verified before a
//     single model is commissioned. `?render=billboard&mannequin=all` puts it
//     on every fighter.
//
//   * Its clip set is THE DEFAULT POSE SET. Clip resolution (rig.js) falls
//     back to these clips for any state a character's rig does not cover and
//     no inheritance answers — so a delivered model with only its identity
//     clips is playable on day one, wearing the default poses everywhere else.
//     The clips animate standard bone names and nothing else, which is what
//     makes them land on any rig that honours the delivery spec.
//
// The figure is rigid-limbed on purpose: plain boxes parented to bones, no
// skinning. A wooden mannequin reads as a placeholder at a glance — nobody
// mistakes it for a delivered fighter — and it needs no weights to author.
// Delivered rigs are skinned meshes; the renderer draws either without caring.
//
// THREE is passed in rather than imported so this module stays inert until the
// billboard backend actually loads the vendored engine (see VENDOR.md: the 3D
// engine must never load for players who never pick the backend).

import { STATES, CLIP_STATES } from "./states.js";
import { attachPlaceholders } from "./props.js";
import { buildClipFromKeys } from "./clips.js";

/** The mannequin's real-world height. Matches HEIGHT_UNKNOWN_RATIO's working
 *  height in spirit: an unremarkable figure the height chain treats neutrally. */
export const MANNEQUIN_HEIGHT_M = 1.75;

/** Painted one flat colour so smoke tests can find it in a frame by hue. */
export const MANNEQUIN_COLOR = 0x8fa0bd;

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- skeleton
//
// Standard naming (the delivery spec's Mixamo-style list), positions in
// metres for a 1.75 m figure, bind pose = T-pose, facing +Z. Legs point down,
// arms point out along ±X; every offset below is relative to the parent bone.

const H = MANNEQUIN_HEIGHT_M;
const BONES = {
  Hips:          { parent: null,            pos: [0, 0.530 * H, 0] },
  Spine:         { parent: "Hips",          pos: [0, 0.050 * H, 0] },
  Spine1:        { parent: "Spine",         pos: [0, 0.070 * H, 0] },
  Spine2:        { parent: "Spine1",        pos: [0, 0.070 * H, 0] },
  Neck:          { parent: "Spine2",        pos: [0, 0.110 * H, 0] },
  Head:          { parent: "Neck",          pos: [0, 0.030 * H, 0] },
  LeftShoulder:  { parent: "Spine2",        pos: [0.060 * H, 0.080 * H, 0] },
  LeftArm:       { parent: "LeftShoulder",  pos: [0.040 * H, 0, 0] },
  LeftForeArm:   { parent: "LeftArm",       pos: [0.160 * H, 0, 0] },
  LeftHand:      { parent: "LeftForeArm",   pos: [0.140 * H, 0, 0] },
  RightShoulder: { parent: "Spine2",        pos: [-0.060 * H, 0.080 * H, 0] },
  RightArm:      { parent: "RightShoulder", pos: [-0.040 * H, 0, 0] },
  RightForeArm:  { parent: "RightArm",      pos: [-0.160 * H, 0, 0] },
  RightHand:     { parent: "RightForeArm",  pos: [-0.140 * H, 0, 0] },
  LeftUpLeg:     { parent: "Hips",          pos: [0.055 * H, -0.010 * H, 0] },
  LeftLeg:       { parent: "LeftUpLeg",     pos: [0, -0.240 * H, 0] },
  LeftFoot:      { parent: "LeftLeg",       pos: [0, -0.230 * H, 0] },
  RightUpLeg:    { parent: "Hips",          pos: [-0.055 * H, -0.010 * H, 0] },
  RightLeg:      { parent: "RightUpLeg",    pos: [0, -0.240 * H, 0] },
  RightFoot:     { parent: "RightLeg",      pos: [0, -0.230 * H, 0] },
};

// Limb boxes hung on the bones: [bone, w, h, d, offset] in metres, offset
// being the box centre relative to the bone origin.
const LIMBS = [
  ["Hips",          0.26 * H, 0.10 * H, 0.13 * H, [0, 0.02 * H, 0]],
  ["Spine1",        0.24 * H, 0.16 * H, 0.12 * H, [0, 0.05 * H, 0]],
  ["Head",          0.13 * H, 0.15 * H, 0.14 * H, [0, 0.075 * H, 0]],
  ["LeftArm",       0.16 * H, 0.055 * H, 0.055 * H, [0.08 * H, 0, 0]],
  ["LeftForeArm",   0.15 * H, 0.05 * H, 0.05 * H, [0.07 * H, 0, 0]],
  ["RightArm",      0.16 * H, 0.055 * H, 0.055 * H, [-0.08 * H, 0, 0]],
  ["RightForeArm",  0.15 * H, 0.05 * H, 0.05 * H, [-0.07 * H, 0, 0]],
  ["LeftUpLeg",     0.075 * H, 0.24 * H, 0.075 * H, [0, -0.12 * H, 0]],
  ["LeftLeg",       0.065 * H, 0.23 * H, 0.065 * H, [0, -0.115 * H, 0]],
  ["LeftFoot",      0.07 * H, 0.05 * H, 0.16 * H, [0, -0.025 * H, 0.04 * H]],
  ["RightUpLeg",    0.075 * H, 0.24 * H, 0.075 * H, [0, -0.12 * H, 0]],
  ["RightLeg",      0.065 * H, 0.23 * H, 0.065 * H, [0, -0.115 * H, 0]],
  ["RightFoot",     0.07 * H, 0.05 * H, 0.16 * H, [0, -0.025 * H, 0.04 * H]],
];

// ------------------------------------------------------------ default poses
//
// A pose is {BoneName: [rx, ry, rz] degrees}; a clip is timed keyframes of
// poses. Rotations are relative to the T-pose bind, so REST is what brings
// the arms down to a neutral stand — every pose below builds on it.
//
// These are stand-ins, not choreography: each aims for the same READ as its
// reference sprite (see the clip table in docs/asset-requests.md) so a
// default-posed fighter's states are tellable apart at game size. What they
// must still honour is the engine contract — no baked bob, squash or spin,
// full extension at the beat.

const REST = {
  LeftArm: [0, 0, -65], RightArm: [0, 0, 65],
  LeftForeArm: [0, 0, -12], RightForeArm: [0, 0, 12],
};
const p = (extra) => ({ ...REST, ...extra });

// Punch/reach poses point an arm along +Z (the facing): shoulder swung
// forward about Y, on top of the REST drop being removed.
const POSES = {
  // ------------------------------------------------------------- idle
  // Three extremes rather than two: a body at rest shifts its weight, and a
  // two-key sway reads as a metronome. The engine adds breath on top of this
  // (pose.js applyBreath), so the clip only owns the weight.
  idle_a: p({ Spine: [1, 0, 0], Spine2: [2, 0, 0], Head: [1, 0, 0],
              LeftUpLeg: [0, 0, 1], RightUpLeg: [0, 0, -1] }),
  idle_b: p({ Spine: [2, 0, 2], Spine2: [4, 0, -1], Head: [-2, 0, -1],
              LeftArm: [0, 0, -63], RightArm: [0, 0, 67] }),
  idle_c: p({ Spine: [1, 0, -2], Spine2: [3, 0, 1], Head: [0, 0, 1],
              LeftArm: [0, 0, -67], RightArm: [0, 0, 63] }),

  // ------------------------------------------------------------- run
  // A real run cycle in four positions per stride — contact, down, passing,
  // up — instead of the two the old table had. The difference is not detail
  // for its own sake: CONTACT is where the foot lands and the body is lowest
  // and widest, UP is where it is highest and narrowest, and a cycle without
  // them has no weight in it at all. Vertical travel stays out of the clip
  // (motion.js owns the bob, and doubling it is the delivery rule everyone
  // breaks once); the read comes from the legs and the counter-swinging arms.
  run_contact_l: p({
    Spine: [15, -6, 0], Head: [-6, 6, 0],
    LeftUpLeg: [-32, 0, 0], LeftLeg: [10, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [26, 0, 0], RightLeg: [48, 0, 0], RightFoot: [12, 0, 0],
    LeftArm: [26, 0, -58], LeftForeArm: [0, 0, -72],
    RightArm: [-34, 0, 58], RightForeArm: [0, 0, 62],
  }),
  run_down_l: p({
    Spine: [17, -4, 0], Head: [-7, 4, 0],
    LeftUpLeg: [-16, 0, 0], LeftLeg: [26, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [22, 0, 0], RightLeg: [66, 0, 0], RightFoot: [6, 0, 0],
    LeftArm: [14, 0, -60], LeftForeArm: [0, 0, -74],
    RightArm: [-20, 0, 60], RightForeArm: [0, 0, 66],
  }),
  run_pass_l: p({
    Spine: [15, 0, 0], Head: [-6, 0, 0],
    LeftUpLeg: [4, 0, 0], LeftLeg: [30, 0, 0], LeftFoot: [0, 0, 0],
    RightUpLeg: [-4, 0, 0], RightLeg: [88, 0, 0], RightFoot: [-16, 0, 0],
    LeftArm: [0, 0, -62], LeftForeArm: [0, 0, -76],
    RightArm: [0, 0, 62], RightForeArm: [0, 0, 70],
  }),
  run_up_l: p({
    Spine: [14, 3, 0], Head: [-5, -3, 0],
    LeftUpLeg: [22, 0, 0], LeftLeg: [22, 0, 0], LeftFoot: [8, 0, 0],
    RightUpLeg: [-26, 0, 0], RightLeg: [74, 0, 0], RightFoot: [-20, 0, 0],
    LeftArm: [-18, 0, -60], LeftForeArm: [0, 0, -74],
    RightArm: [16, 0, 60], RightForeArm: [0, 0, 68],
  }),

  // ------------------------------------------------------------- dash
  // Held states still need two extremes, or they are a still image. The dash
  // is a lean with the body drifting forward against the wind.
  dash_a: p({ Spine: [22, -4, 0], Head: [-12, 0, 0],
              LeftArm: [38, 0, -52], LeftForeArm: [0, 0, -60],
              RightArm: [44, 0, 52], RightForeArm: [0, 0, 56],
              LeftUpLeg: [-14, 0, 0], LeftLeg: [16, 0, 0],
              RightUpLeg: [10, 0, 0], RightLeg: [22, 0, 0] }),
  dash_b: p({ Spine: [26, 4, 0], Head: [-14, 0, 0],
              LeftArm: [46, 0, -54], LeftForeArm: [0, 0, -64],
              RightArm: [36, 0, 54], RightForeArm: [0, 0, 52],
              LeftUpLeg: [8, 0, 0], LeftLeg: [24, 0, 0],
              RightUpLeg: [-12, 0, 0], RightLeg: [18, 0, 0] }),

  // ------------------------------------------------------- jump / fall / land
  // The jump's own arc: the launch leaves the legs trailing and the arms up
  // from the swing, then the knees come up under the body. Falling reaches
  // for the ground; landing absorbs and stands.
  jump_launch: p({ Spine: [-6, 0, 0], Head: [-8, 0, 0],
                   LeftUpLeg: [-18, 0, 0], LeftLeg: [26, 0, 0], LeftFoot: [16, 0, 0],
                   RightUpLeg: [-8, 0, 0], RightLeg: [14, 0, 0], RightFoot: [14, 0, 0],
                   LeftArm: [-30, 0, -34], RightArm: [-30, 0, 34] }),
  jump_tuck: p({ Spine: [4, 0, 0], Head: [-4, 0, 0],
                 LeftUpLeg: [-52, 0, 0], LeftLeg: [62, 0, 0], LeftFoot: [-8, 0, 0],
                 RightUpLeg: [-30, 0, 0], RightLeg: [40, 0, 0], RightFoot: [-4, 0, 0],
                 LeftArm: [-10, 0, -30], LeftForeArm: [0, 0, -40],
                 RightArm: [-10, 0, 30], RightForeArm: [0, 0, 40] }),
  fall_a: p({ Spine: [-10, 0, 0], Head: [-6, 0, 0],
              LeftArm: [-46, 0, -26], LeftForeArm: [0, 0, -30],
              RightArm: [-46, 0, 26], RightForeArm: [0, 0, 30],
              LeftUpLeg: [16, 0, 0], LeftLeg: [18, 0, 0],
              RightUpLeg: [-14, 0, 0], RightLeg: [26, 0, 0] }),
  fall_b: p({ Spine: [-7, 0, 0], Head: [-4, 0, 0],
              LeftArm: [-38, 0, -30], LeftForeArm: [0, 0, -26],
              RightArm: [-52, 0, 22], RightForeArm: [0, 0, 34],
              LeftUpLeg: [10, 0, 0], LeftLeg: [24, 0, 0],
              RightUpLeg: [-8, 0, 0], RightLeg: [20, 0, 0] }),
  land_deep: p({ Spine: [26, 0, 0], Head: [10, 0, 0],
                 LeftUpLeg: [-58, 0, 0], LeftLeg: [72, 0, 0], LeftFoot: [-16, 0, 0],
                 RightUpLeg: [-58, 0, 0], RightLeg: [72, 0, 0], RightFoot: [-16, 0, 0],
                 LeftArm: [30, 0, -40], LeftForeArm: [0, 0, -50],
                 RightArm: [30, 0, 40], RightForeArm: [0, 0, 50] }),
  land_rise: p({ Spine: [8, 0, 0], Head: [0, 0, 0],
                 LeftUpLeg: [-16, 0, 0], LeftLeg: [22, 0, 0],
                 RightUpLeg: [-16, 0, 0], RightLeg: [22, 0, 0],
                 LeftArm: [8, 0, -52], RightArm: [8, 0, 52] }),

  // ------------------------------------------------------------- reactions
  hurt_impact: p({ Spine: [-24, 0, 0], Head: [-20, 0, 0],
                   LeftArm: [-38, 0, -46], LeftForeArm: [0, 0, -40],
                   RightArm: [-38, 0, 46], RightForeArm: [0, 0, 40],
                   LeftUpLeg: [14, 0, 0], RightUpLeg: [6, 0, 0] }),
  hurt_settle: p({ Spine: [-12, 0, 0], Head: [-10, 0, 0],
                   LeftArm: [-18, 0, -52], LeftForeArm: [0, 0, -30],
                   RightArm: [-18, 0, 52], RightForeArm: [0, 0, 30],
                   LeftUpLeg: [8, 0, 0], RightUpLeg: [2, 0, 0] }),

  // ------------------------------------------------------------- crouch
  crouch: p({
    Spine: [28, 0, 0], Head: [-10, 0, 0],
    LeftUpLeg: [-70, 0, 0], LeftLeg: [85, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-70, 0, 0], RightLeg: [85, 0, 0], RightFoot: [-20, 0, 0],
    LeftArm: [20, 0, -48], LeftForeArm: [0, 0, -60],
    RightArm: [20, 0, 48], RightForeArm: [0, 0, 60],
  }),
  crouch_b: p({
    Spine: [31, 0, 0], Head: [-12, 0, 0],
    LeftUpLeg: [-73, 0, 0], LeftLeg: [88, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-73, 0, 0], RightLeg: [88, 0, 0], RightFoot: [-20, 0, 0],
    LeftArm: [22, 0, -46], LeftForeArm: [0, 0, -62],
    RightArm: [22, 0, 46], RightForeArm: [0, 0, 62],
  }),
  crouch_punch: null, // filled below off `crouch`

  shield: p({ LeftArm: [55, 30, -30], LeftForeArm: [0, 0, -95],
              RightArm: [55, -30, 30], RightForeArm: [0, 0, 95], Spine: [6, 0, 0] }),
  shield_b: p({ LeftArm: [58, 30, -28], LeftForeArm: [0, 0, -98],
                RightArm: [58, -30, 28], RightForeArm: [0, 0, 98], Spine: [8, 0, 0],
                Head: [4, 0, 0] }),
  ledge: { LeftArm: [0, 0, 80], LeftForeArm: [0, 0, 5],
           RightArm: [0, 0, -50], RightForeArm: [0, 0, 20],
           Spine: [-6, 0, 0], LeftUpLeg: [10, 0, 0], RightUpLeg: [16, 0, 0] },
  ledge_b: { LeftArm: [0, 0, 78], LeftForeArm: [0, 0, 8],
             RightArm: [0, 0, -46], RightForeArm: [0, 0, 24],
             Spine: [-4, 0, 0], LeftUpLeg: [16, 0, 0], RightUpLeg: [10, 0, 0] },
  tuck: p({
    Spine: [40, 0, 0], Head: [20, 0, 0],
    LeftUpLeg: [-95, 0, 0], LeftLeg: [110, 0, 0],
    RightUpLeg: [-95, 0, 0], RightLeg: [110, 0, 0],
    LeftArm: [50, 0, -30], LeftForeArm: [0, 0, -100],
    RightArm: [50, 0, 30], RightForeArm: [0, 0, 100],
  }),
  tuck_tight: p({
    Spine: [48, 0, 0], Head: [26, 0, 0],
    LeftUpLeg: [-108, 0, 0], LeftLeg: [124, 0, 0],
    RightUpLeg: [-108, 0, 0], RightLeg: [124, 0, 0],
    LeftArm: [58, 0, -24], LeftForeArm: [0, 0, -112],
    RightArm: [58, 0, 24], RightForeArm: [0, 0, 112],
  }),

  // ------------------------------------------------------------- strikes
  //
  // Every attack is now four extremes, not two: ANTICIPATION (a small move
  // AGAINST the strike, which is what makes the strike itself read fast),
  // WIND-UP, CONTACT at the beat, and a SETTLE that recovers toward guard.
  // The beat pose is unchanged in kind — full extension, aim-neutral, level —
  // because the hitbox goes live on it.
  guard: p({ Spine: [4, -6, 0], LeftArm: [16, 0, -50], LeftForeArm: [0, 0, -66],
             RightArm: [14, 0, 50], RightForeArm: [0, 0, 62] }),
  anticip_r: p({ Spine: [2, -14, 0], Head: [0, -6, 0],
                 RightArm: [-16, 8, 58], RightForeArm: [0, 0, 46],
                 LeftArm: [12, 0, -52], LeftForeArm: [0, 0, -60] }),
  windup: p({ Spine: [0, -20, 0], Head: [0, -8, 0],
              RightArm: [-40, 0, 55], RightForeArm: [0, 0, 70],
              LeftArm: [16, 0, -50], LeftForeArm: [0, 0, -64] }),
  punch: p({ Spine: [0, 22, 0], Head: [0, 8, 0],
             RightArm: [0, -78, 8], RightForeArm: [0, 0, 4],
             LeftArm: [0, 10, -55], LeftForeArm: [0, 0, -70] }),
  punch_settle: p({ Spine: [2, 12, 0], Head: [0, 4, 0],
                    RightArm: [0, -58, 20], RightForeArm: [0, 0, 26],
                    LeftArm: [8, 4, -52], LeftForeArm: [0, 0, -66] }),

  kick_antic: p({ LeftUpLeg: [12, 0, 0], LeftLeg: [30, 0, 0], Spine: [6, 0, 0],
                  LeftArm: [0, 0, -40], RightArm: [0, 0, 50] }),
  kick: p({ LeftUpLeg: [-75, 0, 0], LeftLeg: [15, 0, 0], LeftFoot: [-14, 0, 0],
            Spine: [-10, 0, 0], Head: [6, 0, 0],
            LeftArm: [0, 0, -35], RightArm: [-10, 0, 45] }),
  kick_settle: p({ LeftUpLeg: [-42, 0, 0], LeftLeg: [40, 0, 0],
                   Spine: [-4, 0, 0], LeftArm: [0, 0, -42], RightArm: [0, 0, 48] }),

  swing_antic: p({ Spine: [4, -12, 0], LeftArm: [-40, 0, -34], RightArm: [-40, 0, 34],
                   LeftForeArm: [0, 0, -30], RightForeArm: [0, 0, 30] }),
  swing_up: p({ Spine: [-10, -25, 0], Head: [-10, -6, 0],
                LeftArm: [-140, 0, -20], RightArm: [-140, 0, 20],
                LeftForeArm: [0, 0, -15], RightForeArm: [0, 0, 15] }),
  swing_down: p({ Spine: [32, 15, 0], Head: [14, 4, 0],
                  LeftArm: [45, 0, -30], RightArm: [45, 0, 30] }),
  swing_settle: p({ Spine: [18, 8, 0], LeftArm: [30, 0, -38], RightArm: [30, 0, 38],
                    LeftForeArm: [0, 0, -22], RightForeArm: [0, 0, 22] }),

  reach_antic: p({ RightArm: [-20, 0, 40], RightForeArm: [0, 0, 60], Spine: [8, 0, 0] }),
  reach_up: p({ RightArm: [0, 0, 165], RightForeArm: [0, 0, 5], Spine: [-6, 0, 0],
                Head: [-12, 0, 0], LeftArm: [0, 0, -30] }),
  reach_settle: p({ RightArm: [0, 0, 130], RightForeArm: [0, 0, 22], Spine: [-2, 0, 0],
                    Head: [-6, 0, 0], LeftArm: [0, 0, -40] }),

  charge_a: p({ Spine: [12, 0, 0], LeftArm: [20, 0, -50], LeftForeArm: [0, 0, -85],
                RightArm: [20, 0, 50], RightForeArm: [0, 0, 85],
                LeftUpLeg: [-18, 0, 0], LeftLeg: [22, 0, 0], RightUpLeg: [-18, 0, 0], RightLeg: [22, 0, 0] }),
  charge_b: p({ Spine: [18, 0, 0], Head: [6, 0, 0],
                LeftArm: [26, 0, -44], LeftForeArm: [0, 0, -95],
                RightArm: [26, 0, 44], RightForeArm: [0, 0, 95],
                LeftUpLeg: [-28, 0, 0], LeftLeg: [34, 0, 0], RightUpLeg: [-28, 0, 0], RightLeg: [34, 0, 0] }),
  palm: p({ Spine: [0, 18, 0], Head: [0, 8, 0],
            RightArm: [0, -70, 0], RightForeArm: [0, -10, 0],
            LeftArm: [10, 0, -46], LeftForeArm: [0, 0, -70] }),
  palm_settle: p({ Spine: [0, 10, 0], RightArm: [0, -52, 14], RightForeArm: [0, -6, 12],
                   LeftArm: [10, 0, -48], LeftForeArm: [0, 0, -68] }),
  sweep: p({ Spine: [8, 40, 0], Head: [4, 12, 0],
             RightArm: [0, -55, 30], RightForeArm: [0, 0, 16],
             LeftArm: [10, 0, -40],
             LeftUpLeg: [-30, 0, 0], LeftLeg: [40, 0, 0],
             RightUpLeg: [-40, 0, 0], RightLeg: [50, 0, 0] }),
  sweep_settle: p({ Spine: [10, 24, 0], RightArm: [0, -38, 34], LeftArm: [8, 0, -44],
                    LeftUpLeg: [-18, 0, 0], LeftLeg: [26, 0, 0],
                    RightUpLeg: [-24, 0, 0], RightLeg: [32, 0, 0] }),
  ground_touch: p({ Spine: [42, 0, 0], Head: [15, 0, 0],
                    RightArm: [55, 0, 30], RightForeArm: [0, 0, 20],
                    LeftArm: [40, 0, -34], LeftForeArm: [0, 0, -28],
                    LeftUpLeg: [-46, 0, 0], LeftLeg: [58, 0, 0],
                    RightUpLeg: [-46, 0, 0], RightLeg: [58, 0, 0] }),
  arms_wide: p({ LeftArm: [0, 0, 12], RightArm: [0, -0, -12], Spine: [-10, 0, 0],
                 Head: [-8, 0, 0], LeftForeArm: [0, 0, -6], RightForeArm: [0, 0, 6] }),
  dizzy_a: p({ Spine: [-6, 0, 8], Head: [0, 0, 18],
               LeftArm: [10, 0, -54], RightArm: [6, 0, 62] }),
  dizzy_b: p({ Spine: [-6, 0, -8], Head: [0, 0, -18],
               LeftArm: [6, 0, -62], RightArm: [10, 0, 54] }),
  prone: { Hips: [-88, 0, 0], LeftArm: [0, 0, -35], RightArm: [0, 0, 35],
           LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0] },
  prone_b: { Hips: [-88, 0, 0], LeftArm: [-4, 0, -30], RightArm: [-4, 0, 30],
             LeftLeg: [12, 0, 0], RightLeg: [5, 0, 0], Head: [4, 0, 0] },
  win: p({ RightArm: [0, 0, 160], RightForeArm: [0, 0, 10], Head: [-8, 0, 0],
           LeftArm: [0, 0, -40] }),
  win_b: p({ RightArm: [-8, 0, 168], RightForeArm: [0, 0, 4], Head: [-12, 0, 0],
             LeftArm: [0, 0, -34], Spine: [-4, 0, 0] }),
};
POSES.crouch_punch = { ...POSES.crouch, Spine: [22, 20, 0],
  RightArm: [0, -75, 10], RightForeArm: [0, 0, 5] };
POSES.crouch_antic = { ...POSES.crouch, Spine: [26, -12, 0],
  RightArm: [-20, 0, 52], RightForeArm: [0, 0, 46] };
POSES.crouch_settle = { ...POSES.crouch, Spine: [24, 10, 0],
  RightArm: [0, -52, 22], RightForeArm: [0, 0, 20] };

// How far the hips drop, per state, in metres off the bind height. Poses that
// take the whole body down do it here rather than by scaling — squash belongs
// to the engine.
const HIP_BASE = BONES.Hips.pos[1];
const HIP_DROP = { crouch: 0.16 * H, crouchAttack: 0.16 * H, charge: 0.06 * H,
                   dodge_roll: 0.22 * H, dodge_air: 0.22 * H, prone: 0.40 * H,
                   land: 0.20 * H };

/**
 * Which timed extremes each state plays, and HOW it travels between them.
 *
 * `[time, poseName, ease]`; the ease governs the segment leaving that key and
 * is baked by clips.js. Times beyond the state's duration are clamped by the
 * builder. Attack states put full extension exactly at their `beat` and the
 * hitbox goes live there, which is why the strike segments run `in` (wind up
 * against the blow) then `snap` (most of the travel in the first frames) and
 * only then settle.
 *
 * A looping state's last key repeats its first, or the wrap is a jump cut.
 */
function stateKeys(name) {
  const d = STATES[name].duration;
  const beat = STATES[name].beat;
  const q = d / 4, h = d / 2;
  switch (name) {
    case "idle":
      return [[0, "idle_a", "ease"], [d / 3, "idle_b", "ease"], [(2 * d) / 3, "idle_c", "ease"], [d, "idle_a", "ease"]];
    case "run":
      // Contact -> down -> passing -> up, twice, one leg leading each time.
      // `out` off contact (the landing absorbs), `in` into the next contact
      // (the leg drives down): that asymmetry is what a run feels like.
      return [
        [0, "run_contact_l", "out"], [d / 8, "run_down_l", "ease"],
        [d / 4, "run_pass_l", "ease"], [(3 * d) / 8, "run_up_l", "in"],
        [h, "run_contact_r", "out"], [(5 * d) / 8, "run_down_r", "ease"],
        [(3 * d) / 4, "run_pass_r", "ease"], [(7 * d) / 8, "run_up_r", "in"],
        [d, "run_contact_l", "out"],
      ];
    case "dash":   return [[0, "dash_a", "ease"], [h, "dash_b", "ease"], [d, "dash_a", "ease"]];
    case "jump":   return [[0, "jump_launch", "out"], [h, "jump_tuck", "ease"], [d, "jump_launch", "ease"]];
    case "fall":   return [[0, "fall_a", "ease"], [h, "fall_b", "ease"], [d, "fall_a", "ease"]];
    case "land":   return [[0, "land_deep", "out"], [d, "land_rise", "out"]];
    case "hurt":   return [[0, "hurt_impact", "out"], [h, "hurt_settle", "ease"], [d, "hurt_impact", "ease"]];
    case "crouch": return [[0, "crouch", "ease"], [h, "crouch_b", "ease"], [d, "crouch", "ease"]];
    case "crouchAttack":
      return [[0, "crouch_antic", "in"], [beat, "crouch_punch", "out"], [d, "crouch_settle", "out"]];
    case "shield": return [[0, "shield", "ease"], [h, "shield_b", "ease"], [d, "shield", "ease"]];
    case "ledge":  return [[0, "ledge", "ease"], [h, "ledge_b", "ease"], [d, "ledge", "ease"]];
    case "dodge_roll": case "dodge_air":
      return [[0, "tuck", "ease"], [h, "tuck_tight", "ease"], [d, "tuck", "ease"]];
    case "light":
      return [[0, "anticip_r", "in"], [beat * 0.45, "windup", "snap"],
              [beat, "punch", "out"], [d, "punch_settle", "out"]];
    case "airLight":
      return [[0, "kick_antic", "in"], [beat, "kick", "out"], [d, "kick_settle", "out"]];
    case "sideHeavy":
      return [[0, "swing_antic", "in"], [beat * 0.5, "swing_up", "snap"],
              [beat, "punch", "back"], [d, "punch_settle", "out"]];
    case "upHeavy":
      return [[0, "reach_antic", "in"], [beat * 0.5, "windup", "snap"],
              [beat, "reach_up", "back"], [d, "reach_settle", "out"]];
    case "downHeavy":
      return [[0, "swing_antic", "in"], [beat * 0.5, "swing_up", "snap"],
              [beat, "swing_down", "back"], [d, "swing_settle", "out"]];
    case "charge":
      return [[0, "charge_a", "ease"], [h, "charge_b", "ease"], [d, "charge_a", "ease"]];
    case "specialNeutral":
      return [[0, "anticip_r", "in"], [beat * 0.5, "windup", "snap"],
              [beat, "palm", "out"], [d, "palm_settle", "out"]];
    case "specialSide":
      return [[0, "anticip_r", "in"], [beat * 0.5, "windup", "snap"],
              [beat, "sweep", "out"], [d, "sweep_settle", "out"]];
    case "specialDown":
      return [[0, "guard", "in"], [beat * 0.5, "arms_wide", "snap"],
              [beat, "ground_touch", "out"], [d, "ground_touch", "linear"]];
    case "ult":
      return [[0, "arms_wide", "ease"], [h, "charge_b", "ease"], [d, "arms_wide", "ease"]];
    case "dizzy":
      return [[0, "dizzy_a", "ease"], [h, "dizzy_b", "ease"], [d, "dizzy_a", "ease"]];
    case "prone":
      return [[0, "prone", "ease"], [h, "prone_b", "ease"], [d, "prone", "ease"]];
    case "win":
      return [[0, "win", "ease"], [h, "win_b", "ease"], [d, "win", "ease"]];
    default:
      return [[0, "idle_a", "ease"], [q, "idle_b", "ease"], [d, "idle_a", "ease"]];
  }
}

// The run's right-leading half is the left-leading one with the legs and arms
// swapped — written once, mirrored here, so tuning a contact pose tunes both
// halves instead of drifting out of step with itself.
const SWAP = { Left: "Right", Right: "Left" };
function mirrorLegsArms(pose) {
  const out = {};
  for (const [bone, deg] of Object.entries(pose)) {
    const side = bone.startsWith("Left") ? "Left" : bone.startsWith("Right") ? "Right" : null;
    // Mirrored across the body: the sagittal rotation (nod/swing) carries
    // over unchanged, the yaw and roll flip. A sided bone also changes sides;
    // the spine and head keep their name and just twist the other way.
    out[side ? SWAP[side] + bone.slice(side.length) : bone] = [deg[0], -deg[1], -deg[2]];
  }
  return out;
}
for (const k of ["contact", "down", "pass", "up"]) {
  POSES[`run_${k}_r`] = mirrorLegsArms(POSES[`run_${k}_l`]);
}

// ------------------------------------------------------------------ builders

function buildClip(THREE, name) {
  const d = STATES[name].duration;
  const drop = HIP_DROP[name];
  const keys = stateKeys(name)
    .filter(([t]) => t <= d + 1e-6)
    .map(([t, poseName, ease]) => ({
      t: Math.min(t, d),
      pose: POSES[poseName],
      ease: ease || "linear",
      ...(drop !== undefined ? { hipsY: HIP_BASE - drop } : {}),
    }));
  // The landing rises out of its crouch, which is the one hip move that is
  // not a constant: it is the whole point of the pose.
  if (name === "land") {
    keys[0].hipsY = HIP_BASE - HIP_DROP.land;
    keys[keys.length - 1].hipsY = HIP_BASE;
  }
  return buildClipFromKeys(THREE, name, keys, {
    duration: d, beat: STATES[name].beat, loop: !!STATES[name].loop,
  });
}

/** The default pose set: one clip per state, on standard bone names.
 *  rig.js falls back to these for any state nothing else answers. */
export function buildDefaultClips(THREE) {
  const clips = new Map();
  for (const s of CLIP_STATES) clips.set(s, buildClip(THREE, s));
  return clips;
}

/** The mannequin figure itself: a rigid grey stand-in on the standard
 *  skeleton, ready to play the default clips (or anyone else's).
 *
 *  `charKey` decides the extras: a fighter the roster table gives a weapon or
 *  a physics chain gets the placeholder version (props.js), because a clip
 *  authored against empty hands proves nothing about a two-handed spear. */
export function buildMannequin(THREE, charKey = null) {
  const root = new THREE.Group();
  root.name = charKey ? `mannequin:${charKey}` : "mannequin";
  const bones = {};
  for (const [name, def] of Object.entries(BONES)) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(...def.pos);
    bones[name] = bone;
    (def.parent ? bones[def.parent] : root).add(bone);
  }
  const mat = new THREE.MeshLambertMaterial({ color: MANNEQUIN_COLOR });
  for (const [boneName, w, h, dpt, off] of LIMBS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), mat);
    mesh.position.set(...off);
    bones[boneName].add(mesh);
  }
  if (charKey) {
    const propMat = new THREE.MeshLambertMaterial({ color: 0x6f7d99 });
    attachPlaceholders(THREE, root, charKey, MANNEQUIN_HEIGHT_M, propMat);
  }
  return { root, height: MANNEQUIN_HEIGHT_M, clips: buildDefaultClips(THREE) };
}
