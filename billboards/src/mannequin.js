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
  idle_a: p({ Spine2: [2, 0, 0] }),
  idle_b: p({ Spine2: [4, 0, 0], Head: [-2, 0, 0] }),
  run_reach: p({
    Spine: [14, 0, 0],
    LeftUpLeg: [-38, 0, 0], LeftLeg: [12, 0, 0],
    RightUpLeg: [30, 0, 0], RightLeg: [55, 0, 0],
    LeftArm: [30, 0, -60], RightArm: [-35, 0, 60],
  }),
  run_pass: p({
    Spine: [14, 0, 0],
    LeftUpLeg: [8, 0, 0], LeftLeg: [35, 0, 0],
    RightUpLeg: [-5, 0, 0], RightLeg: [20, 0, 0],
    LeftArm: [0, 0, -62], RightArm: [0, 0, 62],
  }),
  run_reach2: p({
    Spine: [14, 0, 0],
    RightUpLeg: [-38, 0, 0], RightLeg: [12, 0, 0],
    LeftUpLeg: [30, 0, 0], LeftLeg: [55, 0, 0],
    RightArm: [30, 0, 60], LeftArm: [-35, 0, -60],
  }),
  dash: p({ Spine: [24, 0, 0], LeftArm: [40, 0, -55], RightArm: [40, 0, 55], Head: [-10, 0, 0] }),
  jump: p({ LeftUpLeg: [-45, 0, 0], LeftLeg: [55, 0, 0], RightUpLeg: [-15, 0, 0],
            LeftArm: [0, 0, -25], RightArm: [0, 0, 25] }),
  fall: p({ LeftArm: [0, 0, -20], RightArm: [0, 0, 20], LeftUpLeg: [12, 0, 0],
            RightUpLeg: [-8, 0, 0], Spine: [-8, 0, 0] }),
  land: p({ LeftArm: [0, 0, -45], RightArm: [0, 0, 45], Spine: [10, 0, 0] }),
  hurt: p({ Spine: [-18, 0, 0], Head: [-15, 0, 0], LeftArm: [-30, 0, -50], RightArm: [-30, 0, 50] }),
  crouch: p({
    Hips: [0, 0, 0], Spine: [28, 0, 0],
    LeftUpLeg: [-70, 0, 0], LeftLeg: [85, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-70, 0, 0], RightLeg: [85, 0, 0], RightFoot: [-20, 0, 0],
  }),
  crouch_punch: null, // filled below off `crouch`
  shield: p({ LeftArm: [55, 30, -30], LeftForeArm: [0, 0, -95],
              RightArm: [55, -30, 30], RightForeArm: [0, 0, 95], Spine: [6, 0, 0] }),
  ledge: { LeftArm: [0, 0, 80], LeftForeArm: [0, 0, 5],
           RightArm: [0, 0, -50], RightForeArm: [0, 0, 20],
           Spine: [-6, 0, 0], LeftUpLeg: [10, 0, 0], RightUpLeg: [16, 0, 0] },
  tuck: p({
    Spine: [40, 0, 0], Head: [20, 0, 0],
    LeftUpLeg: [-95, 0, 0], LeftLeg: [110, 0, 0],
    RightUpLeg: [-95, 0, 0], RightLeg: [110, 0, 0],
    LeftArm: [50, 0, -30], LeftForeArm: [0, 0, -100],
    RightArm: [50, 0, 30], RightForeArm: [0, 0, 100],
  }),
  windup: p({ Spine: [0, -18, 0], RightArm: [-40, 0, 55], RightForeArm: [0, 0, 70] }),
  punch: p({ Spine: [0, 22, 0], RightArm: [0, -78, 8], RightForeArm: [0, 0, 4],
             LeftArm: [0, 0, -55] }),
  kick: p({ LeftUpLeg: [-75, 0, 0], LeftLeg: [15, 0, 0], Spine: [-10, 0, 0],
            LeftArm: [0, 0, -35], RightArm: [0, 0, 45] }),
  swing_up: p({ Spine: [-10, -25, 0], LeftArm: [-140, 0, -20], RightArm: [-140, 0, 20],
                LeftForeArm: [0, 0, -15], RightForeArm: [0, 0, 15] }),
  swing_down: p({ Spine: [32, 15, 0], LeftArm: [45, 0, -30], RightArm: [45, 0, 30] }),
  reach_up: p({ RightArm: [0, 0, 165], RightForeArm: [0, 0, 5], Spine: [-6, 0, 0], Head: [-12, 0, 0] }),
  charge_a: p({ Spine: [12, 0, 0], LeftArm: [20, 0, -50], LeftForeArm: [0, 0, -85],
                RightArm: [20, 0, 50], RightForeArm: [0, 0, 85],
                LeftUpLeg: [-18, 0, 0], LeftLeg: [22, 0, 0], RightUpLeg: [-18, 0, 0], RightLeg: [22, 0, 0] }),
  palm: p({ Spine: [0, 18, 0], RightArm: [0, -70, 0], RightForeArm: [0, -10, 0] }),
  sweep: p({ Spine: [8, 40, 0], RightArm: [0, -55, 30], LeftArm: [10, 0, -40] }),
  ground_touch: p({ Spine: [42, 0, 0], RightArm: [55, 0, 30], RightForeArm: [0, 0, 20], Head: [15, 0, 0] }),
  arms_wide: p({ LeftArm: [0, 0, 12], RightArm: [0, 0, -12], Spine: [-10, 0, 0], Head: [-8, 0, 0] }),
  dizzy_a: p({ Spine: [-6, 0, 8], Head: [0, 0, 18] }),
  dizzy_b: p({ Spine: [-6, 0, -8], Head: [0, 0, -18] }),
  prone: { Hips: [-88, 0, 0], LeftArm: [0, 0, -35], RightArm: [0, 0, 35],
           LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0] },
  win: p({ RightArm: [0, 0, 160], RightForeArm: [0, 0, 10], Head: [-8, 0, 0] }),
};
POSES.crouch_punch = { ...POSES.crouch, Spine: [22, 20, 0],
  RightArm: [0, -75, 10], RightForeArm: [0, 0, 5] };

// Which timed poses each state plays. `[time, poseName]` pairs; times beyond
// the state's duration are clamped by the clip builder. Attack states put
// full extension exactly at their `beat` and hold it, honouring the contract.
function stateKeys(name) {
  const d = STATES[name].duration;
  const beat = STATES[name].beat;
  switch (name) {
    case "idle":   return [[0, "idle_a"], [d / 2, "idle_b"], [d, "idle_a"]];
    case "run":    return [[0, "run_reach"], [d / 4, "run_pass"], [d / 2, "run_reach2"], [(3 * d) / 4, "run_pass"], [d, "run_reach"]];
    case "dash":   return [[0, "dash"], [d, "dash"]];
    case "jump":   return [[0, "jump"], [d, "jump"]];
    case "fall":   return [[0, "fall"], [d, "fall"]];
    case "land":   return [[0, "land"], [d, "land"]];
    case "hurt":   return [[0, "hurt"], [d, "hurt"]];
    case "crouch": return [[0, "crouch"], [d, "crouch"]];
    case "crouchAttack": return [[0, "crouch"], [beat, "crouch_punch"], [d, "crouch_punch"]];
    case "shield": return [[0, "shield"], [d, "shield"]];
    case "ledge":  return [[0, "ledge"], [d, "ledge"]];
    case "dodge_roll": case "dodge_air": return [[0, "tuck"], [d, "tuck"]];
    case "light":     return [[0, "windup"], [beat, "punch"], [d, "punch"]];
    case "airLight":  return [[0, "idle_a"], [beat, "kick"], [d, "kick"]];
    case "sideHeavy": return [[0, "swing_up"], [beat, "punch"], [d, "punch"]];
    case "upHeavy":   return [[0, "windup"], [beat, "reach_up"], [d, "reach_up"]];
    case "downHeavy": return [[0, "swing_up"], [beat, "swing_down"], [d, "swing_down"]];
    case "charge":    return [[0, "charge_a"], [d / 2, "crouch"], [d, "charge_a"]];
    case "specialNeutral": return [[0, "windup"], [beat, "palm"], [d, "palm"]];
    case "specialSide":    return [[0, "windup"], [beat, "sweep"], [d, "sweep"]];
    case "specialDown":    return [[0, "idle_a"], [beat, "ground_touch"], [d, "ground_touch"]];
    case "ult":    return [[0, "arms_wide"], [d / 2, "charge_a"], [d, "arms_wide"]];
    case "dizzy":  return [[0, "dizzy_a"], [d / 2, "dizzy_b"], [d, "dizzy_a"]];
    case "prone":  return [[0, "prone"], [d, "prone"]];
    case "win":    return [[0, "win"], [d, "win"]];
    default:       return [[0, "idle_a"], [d, "idle_a"]];
  }
}

// ------------------------------------------------------------------ builders

function buildClip(THREE, name) {
  const keys = stateKeys(name);
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  // Every bone any key touches gets a full track, with identity where a key
  // says nothing — a track that skips keyframes would interpolate against
  // whatever pose came before it.
  const bones = [...new Set(keys.flatMap(([, pose]) => Object.keys(POSES[pose])))];
  const tracks = [];
  for (const bone of bones) {
    const times = keys.map(([t]) => t);
    const values = [];
    for (const [, poseName] of keys) {
      const [rx, ry, rz] = POSES[poseName][bone] || [0, 0, 0];
      euler.set(rx * DEG, ry * DEG, rz * DEG);
      quat.setFromEuler(euler);
      values.push(quat.x, quat.y, quat.z, quat.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  // Poses that move the whole body down (crouch, tuck, prone) do it by
  // dropping the hips, not by scaling — squash belongs to the engine.
  const hipDrop = { crouch: 0.16 * H, crouchAttack: 0.16 * H, charge: 0.06 * H,
                    dodge_roll: 0.22 * H, dodge_air: 0.22 * H, prone: 0.40 * H };
  if (hipDrop[name]) {
    const base = BONES.Hips.pos[1];
    const times = keys.map(([t]) => t);
    const values = keys.flatMap(() => [0, base - hipDrop[name], 0]);
    tracks.push(new THREE.VectorKeyframeTrack("Hips.position", times, values));
  }
  return new THREE.AnimationClip(name, STATES[name].duration, tracks);
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
