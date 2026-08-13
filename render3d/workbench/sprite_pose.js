// The SPRITE POSE EDITOR (`render3d/workbench/?edit=pose`): drag eighteen
// joints onto a drawing until the mannequin IS the pose, and watch the 3D
// fighter take that pose beside it.
//
// WHY THIS EXISTS. The 3D fighters play a default pose set matched to three
// sheets by eye (billboards/docs/sprite-pose-audit.md). Yuji's sheet then
// disagreed with five of those defaults — his crouch is a sprinter's
// three-point stance, he hangs off a ledge one-handed, he lands on both hands.
// The lesson was not "fix five poses", it was that a pose set derived from a
// sample needs checking against each fighter's OWN art, and that checking a
// pose by describing it does not work: a description can be vague and still
// sound right, while a figure with the elbow in the wrong place is visibly
// wrong. So this tool makes the drawing the reference, the mannequin the
// claim, and the overlay of one on the other the test.
//
// WHAT IT EDITS. Not clips — pose_edit.js does that, in keyframes and degrees,
// against a state. This edits READS: eighteen 2D joints per FRAME, stored per
// character in sprites/docs/pose-reads/. A read is upstream of everything; it
// is what the art says, and it stays true whatever the clip tables do next.
// The joints drive spine, neck, both clavicles, arms, legs and feet; a bone
// they cannot reach, or any rotation out of the drawing's plane, belongs to
// the keyframe bench at ?edit=animation.
//
// THREE THINGS IT IS CAREFUL ABOUT, ALL OF WHICH SILENTLY PRODUCE PLAUSIBLE
// AND WRONG DATA IF GOT WRONG (tools/pose_reads.py says the same in Python,
// because both ends have to agree):
//
//   ORIENTATION. Frames the sprite manifest marks `faceLeft` are delivered
//   facing left and MIRRORED by the engine. The editor mirrors them too, so
//   every frame here is posed as it is actually drawn on screen. Editing the
//   raw PNG would record a backwards pose for a fighter nobody ever sees
//   facing that way.
//
//   SIDES. Joints are the CHARACTER's own left and right, never the screen's.
//   Facing right, the camera sits off the fighter's right shoulder: the RIGHT
//   limb is the near one. Sided names survive a mirror; near/far do not — and
//   which drawn limb is near is a judgement whose obvious answer is usually
//   wrong, because the extended arm of a punch is drawn BEHIND the collar
//   while the near arm crosses the chest. Hence ⇄ Swap L/R.
//
//   DEPTH IS NOT ASSUMED. A drawing is one view, so a read starts flat: every
//   joint is [x, y] and the preview turns each bone in the drawing's plane.
//   But some poses are not in that plane — an arm angled inward across the
//   chest reads flat as a short arm, and no amount of dragging in two
//   dimensions fixes it. So VIEW 3D turns both panes off the drawing's angle
//   together, a drag then lands in the plane you are looking at, and the joint
//   gains a third number. Depth is written only where someone put it, and the
//   sprite fades as the view turns away from the angle it was drawn at,
//   because from there it is no longer the thing to match.
//
// The output is a JSON file per character in exactly the on-disk format, so a
// finished character is a file copy into sprites/docs/pose-reads/.

import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import * as rigs from "../src/loader.js";
import { initPose } from "../src/pose.js";
import { CHARACTER_KEYS, CHARACTERS } from "../../src/characters.js";
import { makeOrbit } from "./orbit.js";

const READS_URL = "../../sprites/docs/pose-reads/";
const SPRITES_URL = "../../sprites/assets/";
const MANIFEST_URL = `${SPRITES_URL}manifest.json`;
/** The old localStorage key. Only read now, to throw its contents away. */
const STORE = "jjk.poseEdits.v1";

const JOINTS = [
  "head", "neck", "chest", "pelvis",
  "shoulderL", "elbowL", "handL",
  "shoulderR", "elbowR", "handR",
  "hipL", "kneeL", "footL", "toeL",
  "hipR", "kneeR", "footR", "toeR",
];

/** Each joint's parent. Dragging a joint carries its descendants, because a
 *  shoulder that moves while the arm stays put is never what was meant. */
const PARENT = {
  chest: "pelvis", neck: "chest", head: "neck",
  shoulderL: "chest", elbowL: "shoulderL", handL: "elbowL",
  shoulderR: "chest", elbowR: "shoulderR", handR: "elbowR",
  hipL: "pelvis", kneeL: "hipL", footL: "kneeL", toeL: "footL",
  hipR: "pelvis", kneeR: "hipR", footR: "kneeR", toeR: "footR",
};
const KIDS = {};
for (const [child, parent] of Object.entries(PARENT)) (KIDS[parent] ||= []).push(child);
const descendants = (joint) =>
  (KIDS[joint] || []).flatMap((k) => [k, ...descendants(k)]);

/** Which side of the body a joint belongs to — the near (right) limbs draw
 *  solid, the far (left) ones washed back, so an overlap still reads as two. */
const SIDE = (j) => (j.endsWith("L") ? "far" : j.endsWith("R") ? "near" : "mid");

/** The sided pairs, for the commonest correction of all: a drawing whose near
 *  arm was read as the far one. Which limb a sprite shows nearer the camera is
 *  a judgement — the extended arm of a punch is usually the FAR one, drawn
 *  behind the collar, while the near arm is the one crossing the chest — and
 *  when the judgement goes wrong the whole pose is right-handed instead of
 *  left. One button beats dragging six handles. */
const SIDED = ["shoulder", "elbow", "hand", "hip", "knee", "foot", "toe"];

/** [parent joint, child joint, bone] — the segment each bone's direction is.
 *  Parent-first, because every bone is aimed in the frame its ancestors left.
 *
 *  The clavicles are in here too, aimed chest -> shoulder, which is what lets
 *  a shoulder be RAISED into a punch. They used to need a special case that
 *  kept their reach across the body, because a flat read put both shoulders at
 *  zero depth and aiming at that collapsed them onto the spine. The facing
 *  model gives the shoulders their real depth, so the plain aim is now the
 *  right one. */
const SEGMENT_BONE = [
  ["pelvis", "chest", "Spine"],
  ["chest", "neck", "Spine2"],
  // The neck aims from the SHOULDER LINE, not from the read's `neck` joint.
  // The rig's Neck bone starts between the shoulders; the read's neck joint is
  // drawn where a neck looks like it is, halfway up. Measuring the head's
  // direction from the higher point over-states the bend by the same few
  // degrees every time — every upright frame in Yuji's sheet came out craning
  // forward by 8.1°, the same number three times over, which is the signature
  // of a convention error rather than a reading. From the shoulders it is 5°
  // in the idle and 0° in the jab, which is what the drawings show.
  ["shoulderMid", "head", "Neck"],
  ["chest", "shoulderL", "LeftShoulder"],
  ["shoulderL", "elbowL", "LeftArm"],
  ["elbowL", "handL", "LeftForeArm"],
  ["chest", "shoulderR", "RightShoulder"],
  ["shoulderR", "elbowR", "RightArm"],
  ["elbowR", "handR", "RightForeArm"],
  ["hipL", "kneeL", "LeftUpLeg"],
  ["kneeL", "footL", "LeftLeg"],
  ["footL", "toeL", "LeftFoot"],
  ["hipR", "kneeR", "RightUpLeg"],
  ["kneeR", "footR", "RightLeg"],
  ["footR", "toeR", "RightFoot"],
];
/** The child each driven bone points AT in the bind pose. Its offset gives the
 *  bone's own forward direction without hardcoding one rig's axis convention. */
const BONE_TIP = {
  Spine: "Spine1", Spine2: "Neck", Neck: "Head",
  LeftShoulder: "LeftArm", RightShoulder: "RightArm",
  LeftArm: "LeftForeArm", LeftForeArm: "LeftHand",
  RightArm: "RightForeArm", RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot", LeftFoot: "LeftToeBase",
  RightUpLeg: "RightLeg", RightLeg: "RightFoot", RightFoot: "RightToeBase",
};

/** The inverse of BONE_TIP: which driven bone each one hangs off. Used to spot
 *  the bones that must be aimed AFTER a chain above them is solved. */
const BONE_PARENT = Object.fromEntries(
  Object.entries(BONE_TIP).map(([bone, tip]) => [tip, bone]));

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v) => Math.round(v * 10) / 10;
const DEG = Math.PI / 180;

// ------------------------------------------------------------------- depth
//
// A joint is [x, y] or [x, y, z]. The third number is DEPTH — toward the
// camera, in the same cell percent as the other two — and it is absent until
// somebody sets it, which is the honest default: a side-on drawing does not
// say how far a fist travels toward the lens.
//
// It exists for the poses the drawing plane cannot hold. An arm angled inward
// across the chest is a real pose that reads flat as a short arm, and no
// amount of dragging in two dimensions fixes it. Turn the view (View 3D), drag
// the hand, and the drag lands in the plane you are looking at — which is how
// the depth gets in.
const depth = (pt) => (pt.length > 2 ? pt[2] : 0);
const hasDepth = (j) => JOINTS.some((n) => j[n] && depth(j[n]) !== 0);

// -------------------------------------------------------------- FACING
//
// The shoulder line and the hip line are RIGID BARS of known length. So how
// far apart the drawing puts them is not decoration — it is the angle the
// body is turned at, and it is the one piece of depth a flat read has always
// carried without anyone reading it.
//
//   shoulders one on top of the other  ->  pure side view
//   shoulders their full width apart   ->  square to the camera
//   left shoulder drawn to the RIGHT   ->  turned toward the lens
//   left shoulder drawn to the LEFT    ->  turned away, showing their back
//
// (Facing right with their chest open to us, a fighter's LEFT shoulder is the
// far one and lands on the screen RIGHT — the same flip you see looking at
// someone across a table.)
//
// From that angle everything else follows: the shoulders and hips get their
// depth, the chest and pelvis get their twist, and the legs — hanging off a
// pelvis that has turned — carry the feet round with them, which is how a
// foot ends up pointing at the camera.
//
// Widths come from the fighter's OWN rig where there is one, as a fraction of
// their torso, because a read is in cell percent and a cell is a different
// size in every frame. These are the fallbacks for a character with no rig.
const SHOULDER_SPAN = 0.67;   // shoulder width / torso length
const HIP_SPAN = 0.37;

/**
 * How big this fighter is IN THIS CELL, as a torso length.
 *
 * The obvious answer — measure the torso — is wrong in exactly the frames that
 * matter. A body pitched forward or curled in the air draws a torso two thirds
 * its real length, the shoulder width derived from it comes out too small, and
 * a perfectly ordinary shoulder line then reads as square to the camera. Yuji's
 * airborne frames all came out at 89°.
 *
 * So take the limbs instead: every segment foreshortens, but a pose rarely
 * foreshortens all of them at once, and the rig says what each one is worth in
 * torsos.
 *
 * WHICH estimate to take depends on what is asking, and the two callers want
 * opposite things:
 *
 *   * `torsoScale` — the LARGEST, for the facing. Under-estimate the body and
 *     the shoulder width derived from it comes out too small, so an ordinary
 *     shoulder line divides out to sin(yaw) ≈ 1 and the fighter snaps square
 *     to the camera. Erring large costs a few degrees; erring small costs 89.
 *   * `torsoTypical` — the MEDIAN, for judging whether a limb is drawn short.
 *     Here the largest estimate is poison: it is by construction the length of
 *     the single most generously drawn limb, so measuring the other seven
 *     against it declares all seven foreshortened. That is precisely what it
 *     did — 39 of Yuji's 40 frames came out with a limb driven more than 15
 *     cells deep, one of them 170 cells deep in a 100-cell frame, on drawings
 *     that are nearly all flat and side-on.
 */
function torsoEstimates(j, spans) {
  const seg = (a, b) => (j[a] && j[b] ? Math.hypot(j[a][0] - j[b][0], j[a][1] - j[b][1]) : 0);
  const limbs = spans.limbs || {};
  const from = (length, ratio) => (length && ratio ? length / ratio : 0);
  return [
    from(seg("hipL", "kneeL"), limbs.thigh), from(seg("hipR", "kneeR"), limbs.thigh),
    from(seg("kneeL", "footL"), limbs.shin), from(seg("kneeR", "footR"), limbs.shin),
    from(seg("shoulderL", "elbowL"), limbs.upperArm),
    from(seg("shoulderR", "elbowR"), limbs.upperArm),
    from(seg("elbowL", "handL"), limbs.foreArm),
    from(seg("elbowR", "handR"), limbs.foreArm),
  ].filter(Boolean).sort((a, b) => a - b);
}

function spineLength(j) {
  const mid = j.shoulderL && j.shoulderR
    ? [(j.shoulderL[0] + j.shoulderR[0]) / 2, (j.shoulderL[1] + j.shoulderR[1]) / 2] : null;
  return mid && j.pelvis ? Math.hypot(mid[0] - j.pelvis[0], mid[1] - j.pelvis[1]) : 0;
}

function torsoScale(j, spans) {
  return Math.max(spineLength(j), ...torsoEstimates(j, spans), 0);
}

/** The same measurement, taken as the median rather than the maximum. */
function torsoTypical(j, spans) {
  const all = torsoEstimates(j, spans);
  if (!all.length) return spineLength(j);
  const mid = all.length >> 1;
  return all.length % 2 ? all[mid] : (all[mid - 1] + all[mid]) / 2;
}

/**
 * WHERE THIS SHEET'S "SIDE ON" ACTUALLY SITS.
 *
 * A fighting-game sheet is drawn facing right, and the poses on it are angled
 * only slightly toward or away from the lens. But the drawings do not put the
 * two shoulder markers on top of each other, because an artist drawing a
 * side view still shows both shoulders — Yuji's sit 0.286 torsos apart in the
 * median frame and 38 of his 40 frames are on the same side of zero.
 *
 * Taken literally that says the entire sheet is turned a quarter of the way
 * toward the camera, which is not what any of those drawings show; it is the
 * house style, applied evenly, and reading it as a rotation turns every
 * fighter on every frame. So the ZERO is the sheet's own median rather than
 * zero separation, and what turns a fighter is how far a frame departs from
 * how that fighter is usually drawn. Below the median he is angled away, above
 * it he is angled toward — which is what "slightly angled either way" means,
 * measured rather than assumed.
 *
 * It calibrates per character, which matters: the roster is not drawn to one
 * shoulder convention, and a baseline borrowed from Yuji would turn Panda.
 */
const facingBase = new Map();

function baselineFor(char) {
  if (facingBase.has(char)) return facingBase.get(char);
  const data = reads.get(char);
  const base = { shoulder: 0, hip: 0 };
  if (data) {
    for (const [key, pair] of [["shoulder", ["shoulderL", "shoulderR"]],
                               ["hip", ["hipL", "hipR"]]]) {
      const vs = [];
      for (const pose of Object.values(data.poses)) {
        const j = pose.j;
        const t = spineLength(j);
        if (!t || !j[pair[0]] || !j[pair[1]]) continue;
        vs.push((j[pair[0]][0] - j[pair[1]][0]) / t);
      }
      if (!vs.length) continue;
      vs.sort((a, b) => a - b);
      const mid = vs.length >> 1;
      base[key] = vs.length % 2 ? vs[mid] : (vs[mid - 1] + vs[mid]) / 2;
    }
  }
  facingBase.set(char, base);
  return base;
}

/** How far a fighter is allowed to be turned by the markers alone. The sheet
 *  is side-on art; a marker line is a few hand-placed dots, and past a
 *  three-quarter view it is saying more than a few dots can support. */
const TURN_MAX = 35 * (Math.PI / 180);

/**
 * How far the shoulder line and the hip line are turned, in radians, and the
 * half-widths they are turned by. Positive is turned toward the camera.
 */
function facingOf(j, spans, base = { shoulder: 0, hip: 0 }) {
  const torso = torsoScale(j, spans);
  const bar = (a, b, span, zero) => {
    if (!j[a] || !j[b] || !torso) return { yaw: 0, half: 0 };
    const width = span * torso;
    // Measured from where THIS SHEET draws a side view, not from zero
    // separation — see baselineFor. `zero` is in torsos, the same units the
    // baseline was taken in, so it scales with the frame like everything else.
    const across = j[a][0] - j[b][0] - zero * spineLength(j);
    // A drawing can put them further apart than the body allows — a read is a
    // hand placing dots, not a measurement. Square to the camera is the most
    // it can mean.
    // Short of square-on: a drawing that puts the markers a shade wider than
    // the body allows should read as "very turned", not as a body that has
    // rotated past its own shoulders.
    const sin = clamp(across / (width || 1), -0.985, 0.985);
    // HOW FAR the bar is turned comes from how wide the drawing puts it, and
    // only from that. Authored depth gets a vote on WHICH WAY and no vote on
    // how far.
    //
    // Reading the angle straight off the depths — atan2(across, -dz) — is
    // right in geometry and disastrous in practice, because it takes both
    // numbers as measurements of the same rigid bar and nobody authors them
    // that way. Yuji's `attack_air_a` had 0.1 on one shoulder and nothing on
    // the other and came out at +89°, dead square to the camera off a tenth of
    // a cell; `attack_air_b` had 0.6 and 0.2 on the hips, both deliberate, and
    // came out at +92°. A bar six cells across in a drawing is a bar six cells
    // across whatever depths hang off its ends; a fraction of a cell between
    // them is not the twenty-five cells of depth that a genuinely square-on
    // shoulder line would carry, and treating it as if it were turns every
    // annotated frame to face the lens.
    //
    // What the depths DO settle is the front/back ambiguity, when they are
    // large enough to mean it: a bar leaning at least a tenth of its own width
    // out of the page says which end is nearer, and the magnitude still comes
    // from the width.
    const dz = depth(j[a]) - depth(j[b]);
    let yaw = Math.asin(sin);
    if (Math.abs(dz) > 0.1 * width && Math.sign(-dz) !== Math.sign(yaw || -dz)) yaw = -yaw;
    yaw = clamp(yaw, -TURN_MAX, TURN_MAX);
    // The half-width still describes the body, not the reading: it is how far
    // apart the shoulders are, and that does not shrink because the baseline
    // moved.
    return { yaw, half: width / 2 };
  };
  return { chest: bar("shoulderL", "shoulderR", spans.shoulder, base.shoulder),
           pelvis: bar("hipL", "hipR", spans.hip, base.hip) };
}

/**
 * Every joint's depth, explicit where the read has one and derived where it
 * does not.
 *
 *   shoulders and hips  from the facing angle — the bar's own half width,
 *                       swung round by however far the drawing turned it
 *   limbs               inherit their parent, so an arm drawn flat stays in
 *                       the plane it was drawn in, hanging off a shoulder
 *                       that is in the right place
 *   toes                swing with the PELVIS, so a turned hip turns the foot
 *                       — the difference between a foot pointing along the
 *                       drawing and a foot pointing at the camera
 */
function resolveDepth(j, spans) {
  const face = facingOf(j, spans, baselineFor(ui.char));
  const z = {};
  const set = (name, value) => {
    if (!j[name]) return;
    z[name] = j[name].length > 2 ? depth(j[name]) : value;
  };
  for (const name of ["pelvis", "chest", "neck", "head"]) set(name, 0);
  set("shoulderL", -face.chest.half * Math.cos(face.chest.yaw));
  set("shoulderR", face.chest.half * Math.cos(face.chest.yaw));
  set("hipL", -face.pelvis.half * Math.cos(face.pelvis.yaw));
  set("hipR", face.pelvis.half * Math.cos(face.pelvis.yaw));
  // Down the chains IN ORDER, and only into joints nothing has answered for
  // yet — a pass that re-derives everything would overwrite the shoulders and
  // hips the facing just placed, which flattens the body and hands every
  // fighter a shoulder line square to the camera.
  const inherit = (name) => {
    for (const child of KIDS[name] || []) {
      if (z[child] === undefined) set(child, z[name] ?? 0);
      inherit(child);
    }
  };
  inherit("pelvis");
  for (const side of ["L", "R"]) {
    const toe = `toe${side}`;
    const foot = `foot${side}`;
    if (!j[toe] || j[toe].length > 2) continue;
    const along = Math.hypot(j[toe][0] - j[foot][0], j[toe][1] - j[foot][1]);
    z[toe] = (z[foot] ?? 0) + along * Math.sin(face.pelvis.yaw);
  }

  // FORESHORTENING IS DEPTH — but only when there is really a lot of it.
  //
  // A limb drawn short can be a limb pointing at the camera, and the drawing
  // says so by how much of its length is missing. A chambered fist reads five
  // cells where the punching one reads twenty-two, and the other seventeen
  // plausibly went into the third dimension.
  //
  // The trap is that sqrt(want² − flat²) is savagely sensitive at the top of
  // its range: a limb drawn at 90% of its expected length — well inside what
  // a hand-placed dot, a stylised proportion or a rounded torso estimate can
  // account for — comes out 44% of a limb deep. Applied to eight segments on
  // every frame it turned a sheet of flat, side-on drawings into a crowd of
  // fighters lunging at the lens.
  //
  // So a shortfall has to clear a THRESHOLD before any of it is believed, and
  // only the part beyond the threshold counts. Rescaling the flat length by
  // KEEP does both at once and stays continuous: at KEEP of the expected
  // length the depth is exactly zero, and it grows from there. A limb has to
  // be drawn at under three quarters of its length before the drawing is taken
  // to be saying anything about depth at all — which is roughly the point
  // where a human looking at the frame would say "that arm is coming at me".
  //
  // Which WAY it went is the one thing the drawing cannot say, so the limb
  // follows its own side: a right arm foreshortens toward the lens, a left arm
  // away from it, which is where those limbs already are.
  // The limb is also measured against ITS OWN OPPOSITE NUMBER, and the shorter
  // reference wins. This is what keeps a stylised proportion from reading as a
  // pose: Yuji's shins are drawn at 0.89 of what the rig says a shin is worth,
  // consistently, on all forty frames — that is how the artist draws a leg
  // ending in a trainer, not forty drawings of a shin angled at the lens. Two
  // shins both drawn at 0.89 are two normal shins and get nothing. One shin at
  // 0.45 beside a partner at 1.0 is a leg coming toward the camera, and gets
  // it. Asymmetry is the signal; shortness on its own is not, and it
  // self-calibrates to whatever body the character is drawn with.
  const KEEP = 0.75;
  const torso = torsoTypical(j, spans);
  const flatLen = (a, b) =>
    (j[a] && j[b] ? Math.hypot(j[b][0] - j[a][0], j[b][1] - j[a][1]) : 0);
  const bones = [
    ["shoulderL", "elbowL", "upperArm", -1, ["shoulderR", "elbowR"]],
    ["elbowL", "handL", "foreArm", -1, ["elbowR", "handR"]],
    ["shoulderR", "elbowR", "upperArm", 1, ["shoulderL", "elbowL"]],
    ["elbowR", "handR", "foreArm", 1, ["elbowL", "handL"]],
    ["hipL", "kneeL", "thigh", -1, ["hipR", "kneeR"]],
    ["kneeL", "footL", "shin", -1, ["kneeR", "footR"]],
    ["hipR", "kneeR", "thigh", 1, ["hipL", "kneeL"]],
    ["kneeR", "footR", "shin", 1, ["kneeL", "footL"]],
  ];
  // A limb somebody has AUTHORED is theirs. If any joint down an arm or a leg
  // carries an explicit depth, the whole limb is left alone — the authored
  // values stand and the joints between them inherit, rather than having a
  // guess wedged in among them. Yuji's `attack_air_a` is the case: a hand set
  // by hand at 7.6 with an inferred elbow at −13 behind it, which is not the
  // arm anybody drew or authored, and is the reading of it that comes out
  // worst of all forty frames.
  const LIMB_JOINTS = {
    L_arm: ["shoulderL", "elbowL", "handL"], R_arm: ["shoulderR", "elbowR", "handR"],
    L_leg: ["hipL", "kneeL", "footL", "toeL"], R_leg: ["hipR", "kneeR", "footR", "toeR"],
  };
  const authored = {};
  for (const [limb, names] of Object.entries(LIMB_JOINTS))
    authored[limb] = names.some((n) => j[n]?.length > 2);

  for (const [a, b, kind, side, opposite] of bones) {
    if (!j[a] || !j[b] || j[b].length > 2) continue;
    const limb = `${b.endsWith("L") ? "L" : "R"}_${/hand|elbow/.test(b) ? "arm" : "leg"}`;
    if (authored[limb]) continue;
    const rig = (spans.limbs?.[kind] || 0) * torso;
    if (!rig) continue;
    const mirror = flatLen(opposite[0], opposite[1]);
    const want = mirror ? Math.min(rig, mirror) : rig;
    const flat = flatLen(a, b);
    const credited = Math.min(want, flat / KEEP);
    if (credited >= want) continue;                   // nothing worth believing
    // And a ceiling on the whole business. Past about 30° out of plane the
    // inference stops being a reading and starts being an extrapolation from
    // one short measurement, and the sheet is nearly all side-on drawings: it
    // is better to under-state a limb that really is coming at the camera than
    // to swing a quarter of the frame's worth of leg on the strength of a knee
    // marker placed a few cells high.
    const CAP = 0.5;
    const out = Math.min(Math.sqrt(want * want - credited * credited), want * CAP);
    z[b] = (z[a] ?? 0) + side * out;
  }
  return { z, face };
}

/** A joint as a 3D point, with derived depth folded in. */
const point3 = (j, name, z) => [j[name][0], j[name][1], z[name] ?? depth(j[name])];

/** Project a joint through the current view. Returns [screenX, screenY, near],
 *  all in cell percent; `near` is the depth after turning, for sorting. */
function project(pt, view) {
  const { yaw, pitch, dolly, cx, cy } = view;
  const X = pt[0] - cx;
  const Y = -(pt[1] - cy);
  const Z = depth(pt);
  const cy_ = Math.cos(yaw * DEG);
  const sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG);
  const sp = Math.sin(pitch * DEG);
  const Xr = X * cy_ + Z * sy;
  const Zr = -X * sy + Z * cy_;
  const Yr = Y * cp - Zr * sp;
  const Zr2 = Y * sp + Zr * cp;
  return [cx + Xr * dolly, cy - Yr * dolly, Zr2];
}

/** The camera's right and up axes, in cell space — the inverse of `project`
 *  for a drag, so a hand dragged across a turned view moves across the view
 *  and not across the drawing. */
function screenAxes({ yaw, pitch, dolly }) {
  const cy_ = Math.cos(yaw * DEG);
  const sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG);
  const sp = Math.sin(pitch * DEG);
  // In (X, Y, Z) with Y up; cell y counts down, hence the negation on return.
  const right = [cy_, 0, sy];
  const up = [sy * sp, cp, -cy_ * sp];
  return { right, up, dolly };
}

/** Where the view turns about: the middle of the joints it is turning. */
function pivotOf(j) {
  const pts = JOINTS.map((n) => j[n]).filter(Boolean);
  if (!pts.length) return { cx: 50, cy: 50 };
  return {
    cx: pts.reduce((a, p) => a + p[0], 0) / pts.length,
    cy: pts.reduce((a, p) => a + p[1], 0) / pts.length,
  };
}

const viewOf = (j) => ({ ...orbit.state, ...pivotOf(j) });
const spans = () => three.spans || { shoulder: SHOULDER_SPAN, hip: HIP_SPAN };

const ui = {
  char: new URLSearchParams(location.search).get("char") || "yuji",
  pose: new URLSearchParams(location.search).get("pose") || null,
  sel: null,
  ghost: 0.4,
  showSprite: true,
};

/** Free look, shared with the clip bench (orbit.js). Turning it drives both
 *  panes off one angle: the rig's camera and the joint overlay on the plate.
 *  Two views of one pose that disagree about where you are standing is worse
 *  than one view. */
const orbit = makeOrbit(() => {
  if (!ui.pose || !reads.has(ui.char)) return;
  applyTurn();
  refreshDrag();
});

/** char -> the read file as loaded, with edits already folded in. */
const reads = new Map();
let manifest = null;
/** Per-pose undo stacks, keyed `char/pose`. */
const undo = new Map();

// ------------------------------------------------------------------ session
//
// Edits live for as long as the tab does, and no longer. They used to be kept
// in localStorage, which sounded like a kindness and was not: the way this
// tool is used is edit-a-few-frames-then-download, so a reload is how you say
// "start again from what is on disk" — and a stored edit silently outranked
// the file, so corrections that HAD been applied to the tree kept coming back
// as the old pose. Worse, a stored pose is a snapshot of the joint set as it
// was: when feet grew toes, every held edit became a pose with no toe in it,
// and the editor drew a handle for a joint that was not there. Anything left
// over from that era is cleared on the way in.

const SESSION = new Map();                    // `char/pose` -> { j, read }
const editKey = (char, pose) => `${char}/${pose}`;

function clearStaleStorage() {
  try { localStorage.removeItem(STORE); } catch { /* private mode, fine */ }
}
function noteEdit(char, pose, patch) {
  const held = SESSION.get(editKey(char, pose)) || {};
  SESSION.set(editKey(char, pose), { ...held, ...patch });
}
const editedPoses = (char) =>
  [...SESSION.keys()].filter((k) => k.startsWith(`${char}/`)).map((k) => k.split("/")[1]);
const editedChars = () => [...new Set([...SESSION.keys()].map((k) => k.split("/")[0]))];

// --------------------------------------------------------------------- data

/** A pose from a file written before a joint existed still has to draw. Every
 *  joint the editor knows about gets a value, derived the same way
 *  tools/pose_reads.py derives it, so old data opens instead of throwing. */
function fillJoints(j) {
  for (const side of ["L", "R"]) {
    if (j[`toe${side}`]) continue;
    const foot = j[`foot${side}`];
    const knee = j[`knee${side}`];
    if (!foot || !knee) continue;
    const dx = foot[0] - knee[0];
    const dy = foot[1] - knee[1];
    const len = Math.hypot(dx, dy) || 1;
    let px = -dy / len;
    let py = dx / len;
    if (px < 0) { px = -px; py = -py; }
    j[`toe${side}`] = [round1(clamp(foot[0] + px * 4, 0, 100)),
                       round1(clamp(foot[1] + py * 4, 0, 100))];
  }
  return j;
}

async function loadRead(char) {
  if (reads.has(char)) return reads.get(char);
  // Cache-bust: this file changes every time a correction lands in the tree,
  // and a stale copy looks exactly like "my edit did not save".
  const res = await fetch(`${READS_URL}${char}.json?t=${Date.now()}`, { cache: "reload" });
  if (!res.ok) throw new Error(`no pose read for ${char} (${res.status})`);
  const data = await res.json();
  for (const [key, pose] of Object.entries(data.poses)) {
    fillJoints(pose.j);
    const edit = SESSION.get(editKey(char, key));
    if (edit?.j) { pose.j = edit.j; pose.source = "pose editor"; delete pose.seed; }
    if (edit?.read !== undefined) pose.read = edit.read;
  }
  reads.set(char, data);
  return data;
}

const frameMeta = (char, key) => manifest.characters[char]?.[key];
const faceLeft = (char, key) =>
  !!frameMeta(char, key)?.faceLeft || !!manifest.nativeLeft?.[char]?.includes(key);
const spriteSrc = (char, key) => `${SPRITES_URL}${frameMeta(char, key).file}`;

// -------------------------------------------------------------------- 3D

const three = {
  renderer: null, scene: null, camera: null, root: null, bind: null, char: null,
};

function initThree(canvas) {
  three.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  three.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  three.scene = new THREE.Scene();
  // A side-on camera, because a read IS a side-on document: the fighter faces
  // +Z, so standing the camera on -X puts their facing to screen-right and
  // their near (right) limbs toward the lens — the sprite's own viewpoint.
  three.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-3, 4, 2.5);
  three.scene.add(key, new THREE.HemisphereLight(0xc9d8ff, 0x2a2f3d, 1.5));
}

/** Remember the rig's rest rotations so every pose starts from the same place
 *  rather than accumulating onto the last one. */
function bindRig(root) {
  const bind = [];
  root.traverse((o) => { if (o.isBone) bind.push([o, o.quaternion.clone()]); });
  return bind;
}

/** Bones by name, tolerating a delivered rig's prefix (`mixamorig:Hips`). */
function boneIndex(root) {
  const map = new Map();
  root.traverse((o) => {
    if (!o.isBone) return;
    const bare = o.name.includes(":") ? o.name.split(":").pop() : o.name;
    if (!map.has(bare)) map.set(bare, o);
  });
  return map;
}

async function showRig(char) {
  if (three.char === char) return;
  if (three.root) three.scene.remove(three.root);
  await rigs.ensureRig(char, GLTFLoader);
  const entry = rigs.getRig(char);
  three.char = char;
  three.root = entry?.root || null;
  if (!three.root) return;
  three.root.rotation.set(0, entry.yawOffset || 0, 0);
  three.scene.add(three.root);
  three.bind = bindRig(three.root);
  three.bones = boneIndex(three.root);
  three.height = entry.height || 1.75;
  three.spans = spansOf(three.bones);
}

/** A joint as a resolved 3D point, or one of the midpoints a bone hangs off. */
function jointAt(j, name, z) {
  if (name === "shoulderMid") {
    if (!j.shoulderL || !j.shoulderR) return null;
    const l = point3(j, "shoulderL", z);
    const r = point3(j, "shoulderR", z);
    return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
  }
  return j[name] ? point3(j, name, z) : null;
}

/** Swing a bone so its tip points along a WORLD direction, keeping its twist. */
function aimBone(bone, tip, worldDir) {
  bone.getWorldQuaternion(_boneQ);
  _tip.copy(tip.position).applyQuaternion(_boneQ).normalize();
  _swing.setFromUnitVectors(_tip, worldDir.clone().normalize());
  bone.parent.getWorldQuaternion(_parentQ);
  _inv.copy(_parentQ).invert();
  bone.quaternion.premultiply(_parentQ).premultiply(_swing).premultiply(_inv);
  bone.updateMatrixWorld(true);
}

/** The four two-bone chains, each named by its joints and its bones. */
const IK_CHAINS = [
  { joints: ["shoulderL", "elbowL", "handL"], bones: ["LeftArm", "LeftForeArm"] },
  { joints: ["shoulderR", "elbowR", "handR"], bones: ["RightArm", "RightForeArm"] },
  { joints: ["hipL", "kneeL", "footL"], bones: ["LeftUpLeg", "LeftLeg"] },
  { joints: ["hipR", "kneeR", "footR"], bones: ["RightUpLeg", "RightLeg"] },
];

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _u = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _knee = new THREE.Vector3();

/** A cell-space delta as a world-space one: cell x is the facing (+Z), cell y
 *  counts down, and cell depth points at the camera on -X. */
const cellVec = (out, a, b, scale = 1) =>
  out.set(-(b[2] - a[2]) * scale, -(b[1] - a[1]) * scale, (b[0] - a[0]) * scale);

/**
 * Two-bone IK: fold the chain so its end lands where the drawing puts it, with
 * the bend going the way the drawing bends it.
 *
 * The elbow or knee in the read is not used as a POSITION — a read is a
 * drawing and its limb lengths are whatever the artist drew, foreshortened and
 * all — but as the direction the joint bends in, which is the part a drawing
 * really does know.
 *
 * Nor is the read's DISTANCE used, and that is the important one. Converting
 * cell percent into rig metres needs a scale, every way of picking one is a
 * guess, and the guess is wrong in exactly the poses that matter: this art
 * draws a punching arm longer than the model's arm, so any honest scale turns
 * a straight punch into a folded one. What a drawing does say without a scale
 * is how STRAIGHT the limb is — the distance from shoulder to fist over the
 * arm's own drawn length. That fraction is a property of the pose rather than
 * of anybody's proportions, and it survives foreshortening once depth is in,
 * so the rig extends by the same fraction of ITS reach along the direction the
 * drawing points. An arm drawn dead straight comes out dead straight, on any
 * character, at any size.
 */
function solveChain(chain, j, z) {
  const [aName, bName, cName] = chain.joints;
  const A = three.bones.get(chain.bones[0]);
  const B = three.bones.get(chain.bones[1]);
  if (!A || !B || !j[aName] || !j[bName] || !j[cName]) return;
  const tipA = three.bones.get(BONE_TIP[chain.bones[0]]);
  const tipB = three.bones.get(BONE_TIP[chain.bones[1]]);
  if (!tipA || !tipB) return;

  A.updateMatrixWorld(true);
  _from.setFromMatrixPosition(A.matrixWorld);
  const l1 = _mid.setFromMatrixPosition(B.matrixWorld).distanceTo(_from);
  const l2 = _to.setFromMatrixPosition(tipB.matrixWorld)
    .distanceTo(_mid.setFromMatrixPosition(B.matrixWorld));
  if (!l1 || !l2) return;

  const pa = point3(j, aName, z);
  const pb = point3(j, bName, z);
  const pc = point3(j, cName, z);
  cellVec(_u, pa, pc);                                    // which way the end lies
  cellVec(_bend, pa, pb);                                 // which way it bends

  // How straight the drawing has the limb: end-to-end over the drawn length.
  const drawn = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2])
    + Math.hypot(pc[0] - pb[0], pc[1] - pb[1], pc[2] - pb[2]);
  const span = _u.length();
  if (!span || !drawn) return;
  _u.divideScalar(span);
  const reach = l1 + l2;
  const d = clamp((span / drawn) * reach,
    Math.abs(l1 - l2) + 1e-4, reach - 1e-4);
  _to.copy(_from).addScaledVector(_u, d);                 // where the end goes

  // The bend direction, square to the line from root to end.
  _bend.addScaledVector(_u, -_bend.dot(_u));
  if (_bend.lengthSq() < 1e-8) _bend.set(0, 1, 0).addScaledVector(_u, -_u.y);
  _bend.normalize();

  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _knee.copy(_from).addScaledVector(_u, l1 * cosA).addScaledVector(_bend, l1 * sinA);

  aimBone(A, tipA, _knee.clone().sub(_from));
  B.updateMatrixWorld(true);
  _mid.setFromMatrixPosition(B.matrixWorld);
  aimBone(B, tipB, _to.clone().sub(_mid));
}

const _axis = new THREE.Vector3(0, 1, 0);
const _yawQ = new THREE.Quaternion();

/** Turn one bone about the WORLD vertical — the body's own turn, applied where
 *  it belongs on the skeleton so everything below comes with it. */
function yawBone(bone, radians) {
  if (!bone || !radians || !bone.parent) return;
  _yawQ.setFromAxisAngle(_axis, radians);
  bone.parent.getWorldQuaternion(_parentQ);
  _inv.copy(_parentQ).invert();
  bone.quaternion.premultiply(_parentQ).premultiply(_yawQ).premultiply(_inv);
  bone.updateMatrixWorld(true);
}

/** Shoulder and hip width as a fraction of torso length, off the rig itself —
 *  a read is in cell percent and a cell is a different size in every frame, so
 *  the only scale that travels is the fighter's own proportions. Panda is not
 *  built like Yuji and their shoulder lines should not be read as if he were. */
function spansOf(bones) {
  const at = (n) => (bones.get(n)
    ? new THREE.Vector3().setFromMatrixPosition(bones.get(n).matrixWorld) : null);
  const la = at("LeftArm"); const ra = at("RightArm");
  const lu = at("LeftUpLeg"); const ru = at("RightUpLeg");
  const neck = at("Neck");
  // Torso is neck to the LEG ROOTS, not neck to "Hips". A delivered rig can
  // carry an outer node also called Hips sitting on the floor at the origin,
  // and measuring to that made every torso three times too long — which made
  // every shoulder line look three times wider than the body, which turned
  // every fighter square to the camera. The leg roots are unambiguous.
  const hipY = lu && ru ? (lu.y + ru.y) / 2 : null;
  const torso = neck && hipY !== null ? Math.abs(neck.y - hipY) : 0;
  if (!torso) return { shoulder: SHOULDER_SPAN, hip: HIP_SPAN };
  // Every segment as a fraction of the torso, so a foreshortened frame can be
  // scaled off whichever limb is still showing its true length.
  const len = (a, b) => (at(a) && at(b) ? at(a).distanceTo(at(b)) / torso : 0);
  return {
    shoulder: la && ra ? la.distanceTo(ra) / torso : SHOULDER_SPAN,
    hip: lu && ru ? lu.distanceTo(ru) / torso : HIP_SPAN,
    limbs: {
      thigh: len("LeftUpLeg", "LeftLeg") || 0.55,
      shin: len("LeftLeg", "LeftFoot") || 0.53,
      upperArm: len("LeftArm", "LeftForeArm") || 0.37,
      foreArm: len("LeftForeArm", "LeftHand") || 0.33,
    },
  };
}

const _dir = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _boneQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();

/** Turn the read into rig rotations: every driven bone is swung, in the
 *  sagittal plane only, until it points the way the drawing does. */
function poseFromJoints(j) {
  if (!three.root || !three.bind) return;
  for (const [bone, q] of three.bind) bone.quaternion.copy(q);
  three.root.updateMatrixWorld(true);

  // 1. WHICH WAY THE BODY IS TURNED, from the shoulder and hip lines.
  const { z, face } = resolveDepth(j, spans());
  // The pelvis turn goes on the hips, so everything hanging off them — both
  // legs, and the feet on the end of them — comes round with it. The chest
  // turn goes on the spine as the DIFFERENCE, because a body counter-rotates
  // and the shoulders are allowed to face somewhere the hips do not.
  // Negated: the rig faces +Z and the camera stands on -X, so turning a body
  // TOWARD the lens is a negative rotation about the world vertical, while a
  // positive facing angle means turned toward it.
  // The PELVIS is the Spine's parent, not whatever is called "Hips" — some
  // rigs hang the whole armature off a node of that name, and turning it turns
  // the fighter's world rather than their hips.
  yawBone(three.bones?.get("Spine")?.parent, -face.pelvis.yaw);
  yawBone(three.bones?.get("Spine1"), -(face.chest.yaw - face.pelvis.yaw));
  three.root.updateMatrixWorld(true);

  // 2. AIM EVERY DRIVEN BONE. The aim is a minimal swing, so it points the
  //    bone without undoing the turn above.
  //
  //    Bones hanging BELOW a solved chain wait: the solve turns the thigh and
  //    the shin, and a foot aimed before that gets carried wherever its
  //    parents go. Aiming it first looked harmless and was the single biggest
  //    error in the rig — every one of Yuji's forty frames had a foot between
  //    50° and 170° off the drawing, which is a foot pointing at the ceiling.
  const belowChain = (name) =>
    IK_CHAINS.some((c) => c.bones.includes(BONE_PARENT[name]));
  const aimSegments = (segments) => {
  for (const [a, b, boneName] of segments) {
    if (IK_CHAINS.some((c) => c.bones.includes(boneName))) continue;   // solved below
    const bone = three.bones.get(boneName);
    // The tip is the child the bone points at in the bind pose; any rig that
    // names its bones differently still has a first child in the right place.
    const tip = three.bones.get(BONE_TIP[boneName]) || bone?.children.find((c) => c.isBone);
    if (!bone || !tip || !bone.parent) continue;
    // Screen x is world +Z (the facing), screen y counts DOWN, world y counts up.
    const from = jointAt(j, a, z);
    const to = jointAt(j, b, z);
    if (!from || !to) continue;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    // Cell x is world +Z (the facing), cell y counts down, and cell depth
    // points at the camera, which stands on -X.
    const dz = to[2] - from[2];
    if (!dx && !dy && !dz) continue;
    _dir.set(-dz, -dy, dx).normalize();

    // Swing the bone from where it rests to where the drawing wants it, in the
    // PARENT's frame: the smallest rotation that takes the bone's current tip
    // direction onto the target, pre-multiplied so it composes with the bind
    // rather than replacing it. Replacing looked simpler and was wrong — it
    // discards whatever twist the rig's rest pose carries, which on a
    // delivered model is what keeps the chest square to the camera.
    // The bone's tip, as a world direction. Bone offsets are bone-LOCAL (this
    // rig runs every one of them along its own +Y), so the only frame in which
    // "up", "across" and "forward" mean anything is the world's.
    bone.getWorldQuaternion(_boneQ);
    _tip.copy(tip.position).applyQuaternion(_boneQ).normalize();

    aimBone(bone, tip, _dir);
  }
  };
  aimSegments(SEGMENT_BONE.filter(([, , n]) => !belowChain(n)));

  // 3. REACH. Arms and legs are SOLVED to land where the drawing puts the hand
  //    and the foot, rather than aimed and left at full stretch. Aiming alone
  //    was why every low pose stood up: a rig leg is one length, so a knee
  //    aimed down and a foot aimed down put the foot a whole leg away and the
  //    fighter back on his feet, whatever the drawing said. Reaching for the
  //    foot instead folds the knee, and a crouch becomes a crouch.
  for (const chain of IK_CHAINS) solveChain(chain, j, z);
  three.root.updateMatrixWorld(true);

  // 4. AND NOW THE FEET, on the legs the solve has finished moving.
  aimSegments(SEGMENT_BONE.filter(([, , n]) => belowChain(n)));
  three.root.updateMatrixWorld(true);
  // A hook for the smoke test and for anyone asking "why is he facing that
  // way": the angles the read implied, and where the rig actually put the bar.
  // A second hook, for the sheet-checking tools: how far each bone ended up
  // from the direction the drawing asked for, measured in the drawing's own
  // plane and in degrees. Zero everywhere means the rig is saying what the
  // read says; a big number on one segment is either a bone the solver had to
  // compromise (an arm reaching further than the rig's arm goes) or a read the
  // rig cannot honour. Either way it is a number, which beats squinting.
  window.__poseAngles = () => {
    const err = {};
    for (const [a, b, boneName] of SEGMENT_BONE) {
      const bone = three.bones.get(boneName);
      const tip = three.bones.get(BONE_TIP[boneName]) || bone?.children.find((c) => c.isBone);
      if (!bone || !tip) continue;
      const from = jointAt(j, a, z);
      const to = jointAt(j, b, z);
      if (!from || !to) continue;
      const want = Math.atan2(to[1] - from[1], to[0] - from[0]);
      const p0 = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
      const p1 = new THREE.Vector3().setFromMatrixPosition(tip.matrixWorld);
      // Cell x is world +Z, cell y counts down while world y counts up.
      const got = Math.atan2(-(p1.y - p0.y), p1.z - p0.z);
      let d = ((want - got) * 180) / Math.PI;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      err[boneName] = Math.abs(d);
    }
    return err;
  };
  // Each limb's drawn length over the length the rig expects. A kind whose
  // median sits well under 1 across a whole sheet is not a sheet full of
  // foreshortening — it is a ratio that does not describe this artist's
  // figure, and believing it puts depth on every frame.
  window.__poseRatios = () => {
    const torso = torsoTypical(j, spans());
    const out = {};
    for (const [a, b, kind] of [
      ["shoulderL", "elbowL", "upperArm"], ["shoulderR", "elbowR", "upperArm"],
      ["elbowL", "handL", "foreArm"], ["elbowR", "handR", "foreArm"],
      ["hipL", "kneeL", "thigh"], ["hipR", "kneeR", "thigh"],
      ["kneeL", "footL", "shin"], ["kneeR", "footR", "shin"]]) {
      const want = (spans().limbs?.[kind] || 0) * torso;
      if (!want || !j[a] || !j[b]) continue;
      (out[kind] ||= []).push(Math.hypot(j[b][0] - j[a][0], j[b][1] - j[a][1]) / want);
    }
    return out;
  };
  window.__poseFacing = () => {
    const at = (n) => (three.bones.get(n)
      ? new THREE.Vector3().setFromMatrixPosition(three.bones.get(n).matrixWorld) : null);
    const l = at("LeftArm"); const r = at("RightArm");
    const lz = l && r ? l.clone().sub(r) : null;
    return {
      depth: z,
      chestDeg: (face.chest.yaw * 180) / Math.PI,
      pelvisDeg: (face.pelvis.yaw * 180) / Math.PI,
      spans: spans(),
      shoulderZ: lz ? lz.z : null,
      shoulderWidth: lz ? lz.length() : null,
      rigChestDeg: lz ? (Math.asin(clamp(lz.z / (lz.length() || 1), -1, 1)) * 180) / Math.PI : null,
    };
  };
}


function drawThree() {
  const canvas = three.renderer?.domElement;
  if (!canvas || !three.root) return;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 320;
  three.renderer.setSize(w, h, false);
  three.camera.aspect = w / h;

  const box = new THREE.Box3().setFromObject(three.root);
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.y, size.z, 0.4) * 1.25;
  const dist = span / (2 * Math.tan((three.camera.fov * Math.PI) / 360)) / orbit.state.dolly;
  // The rest camera is side-on off the fighter's right (-X, facing +Z), which
  // is the sprite's own viewpoint. Free look is an offset on that, turned the
  // same way and by the same amount as the overlay on the plate.
  const yaw = orbit.state.yaw * DEG;
  const pitch = orbit.state.pitch * DEG;
  three.camera.position.set(
    mid.x - dist * Math.cos(pitch) * Math.cos(yaw),
    mid.y + dist * Math.sin(pitch),
    mid.z - dist * Math.cos(pitch) * Math.sin(yaw),
  );
  three.camera.lookAt(mid);
  three.camera.updateProjectionMatrix();
  three.renderer.render(three.scene, three.camera);
}

// --------------------------------------------------------------------- view

/** Draw whatever joints are present, and draw nothing for the ones that are
 *  not. A pose from an older file — or from a stale copy of this page — can be
 *  short a joint the current build knows about, and when that happened the
 *  figure did not lose a limb, it threw: one undefined joint took out the
 *  whole picker, which reads as "the editor is broken" rather than "this pose
 *  is missing a toe". Missing joints are worth SAYING, once, and worth
 *  surviving. */
function mannequinSVG(j, { handles = false, label = "", flat = false } = {}) {
  const missing = JOINTS.filter((n) => !Array.isArray(j[n]));
  if (missing.length) {
    console.warn(`pose editor: ${label || "a pose"} has no ${missing.join(", ")} — `
      + "drawing the joints it does have. Reload to pick up the current read.");
  }
  const has = (n) => Array.isArray(j[n]);
  // Every joint goes through the view, so the overlay and the rig are looking
  // from the same place. At rest the projection is the identity and this is
  // the flat drawing it always was.
  // The picker draws flat whatever the view is doing: a thumbnail is for
  // finding a frame, and forty foreshortened stick figures is not a contact
  // sheet, it is noise.
  const view = flat ? { yaw: 0, pitch: 0, dolly: 1, ...pivotOf(j) } : viewOf(j);
  // Through the FACING model, so a turned view shows the body the shoulder and
  // hip lines describe rather than a flat cut-out of it.
  const { z } = resolveDepth(j, spans());
  const at = {};
  for (const n of JOINTS) if (has(n)) at[n] = project(point3(j, n, z), view);
  const p = (n) => `${at[n][0].toFixed(2)} ${at[n][1].toFixed(2)}`;
  const line = (a, b) => (has(a) && has(b)
    ? `<line class="bone ${SIDE(a) === "far" || SIDE(b) === "far" ? "far" : "near"}" `
      + `x1="${at[a][0].toFixed(2)}" y1="${at[a][1].toFixed(2)}" `
      + `x2="${at[b][0].toFixed(2)}" y2="${at[b][1].toFixed(2)}"/>`
    : "");
  const parts = [
    ["shoulderL", "shoulderR", "hipR", "hipL"].every(has)
      ? `<polygon class="torso" points="${p("shoulderL")} ${p("shoulderR")} ${p("hipR")} ${p("hipL")}"/>`
      : "",
    ...Object.entries(PARENT).map(([child, parent]) => line(parent, child)),
    line("shoulderL", "shoulderR"), line("hipL", "hipR"),
  ];
  if (has("head") && has("neck")) {
    const r = Math.max(2.6, Math.hypot(at.head[0] - at.neck[0], at.head[1] - at.neck[1]) * 0.8);
    parts.push(`<circle class="skull" cx="${at.head[0].toFixed(2)}" cy="${at.head[1].toFixed(2)}" `
      + `r="${r.toFixed(1)}"/>`);
  }
  if (handles) {
    for (const name of JOINTS.filter(has)) {
      parts.push(
        `<circle class="handle ${SIDE(name)}${depth(j[name]) ? " deep" : ""}" data-joint="${name}" `
        + `cx="${at[name][0].toFixed(2)}" cy="${at[name][1].toFixed(2)}" r="2.1">`
        + `<title>${name}${depth(j[name]) ? ` (depth ${depth(j[name]).toFixed(1)})` : ""}</title>`
        + `</circle>`);
    }
  } else {
    for (const name of ["handL", "handR", "toeL", "toeR"].filter(has)) {
      parts.push(`<circle class="tip ${SIDE(name)}" cx="${at[name][0].toFixed(2)}" `
        + `cy="${at[name][1].toFixed(2)}" r="1.6"/>`);
    }
  }
  return parts.join("");
}

function plateHTML(char, key, j, { handles = false, flat = false } = {}) {
  const flip = faceLeft(char, key) ? ' class="flip"' : "";
  return `<img${flip} src="${spriteSrc(char, key)}" alt="${key}" loading="lazy">`
    + `<svg class="rigline" viewBox="0 0 100 100" preserveAspectRatio="none">`
    + `${mannequinSVG(j, { handles, flat, label: `${char}/${key}` })}</svg>`;
}

function renderPicker() {
  const data = reads.get(ui.char);
  const edited = new Set(editedPoses(ui.char));
  const list = $("#poseList");
  list.innerHTML = Object.entries(data.poses).map(([key, pose]) => `
    <button class="thumb ${key === ui.pose ? "on" : ""} ${edited.has(key) ? "edited" : ""}"
            data-pose="${key}" title="${key}">
      <span class="plate mini">${plateHTML(ui.char, key, pose.j, { flat: true })}</span>
      <span class="thumb-name">${key}</span>
    </button>`).join("");
  $("#poseCount").textContent =
    `${Object.keys(data.poses).length} frames · ${edited.size} edited`;
}

function renderEditor() {
  const data = reads.get(ui.char);
  const pose = data.poses[ui.pose];
  if (!pose) return;
  $("#plate").innerHTML = plateHTML(ui.char, ui.pose, pose.j, { handles: true });
  $("#poseName").textContent = ui.pose;
  // Three different things, and conflating them cost a round trip: what YOU
  // changed since the page loaded, what a human placed at some point and is
  // already in the tree, and what is still a fitted guess.
  const mine = SESSION.has(editKey(ui.char, ui.pose));
  const stamp = mine ? "edited here" : pose.source ? "hand-placed on disk"
    : pose.seed ? pose.seed : "read by eye";
  $("#poseStamp").textContent = stamp;
  $("#poseStamp").className = `stamp ${mine ? "on" : pose.source ? "read" : pose.seed ? "seed" : "read"}`;
  $("#poseNote").value = pose.read || "";
  $("#depthNote").hidden = !hasDepth(pose.j);
  showFacing(pose.j);
  $("#faceNote").hidden = !faceLeft(ui.char, ui.pose);
  $("#jointList").innerHTML = JOINTS.map((n) => `
    <li class="${n === ui.sel ? "on" : ""}" data-joint="${n}">
      <span>${n}</span><b>${pose.j[n]
        ? `${pose.j[n][0].toFixed(1)}, ${pose.j[n][1].toFixed(1)}`
          + (depth(pose.j[n]) ? `, ${depth(pose.j[n]).toFixed(1)}` : "") : "—"}</b></li>`).join("");
  poseFromJoints(pose.j);
  drawThree();
}

/** The facing the shoulder and hip lines add up to, in the head, in degrees.
 *  Positive is turned toward the camera. It is a readout of the joints rather
 *  than a control: widen the shoulder markers and the number follows. */
function showFacing(j) {
  const el = $("#facingRead");
  if (!el) return;
  const { face } = resolveDepth(j, spans());
  const deg = (r) => Math.round((r * 180) / Math.PI);
  const chest = deg(face.chest.yaw);
  const hips = deg(face.pelvis.yaw);
  el.textContent = `chest ${chest >= 0 ? "+" : ""}${chest}° · hips ${hips >= 0 ? "+" : ""}${hips}°`;
  el.classList.toggle("away", chest < 0);
  el.title = `${chest >= 0 ? "Chest turned toward the camera" : "Chest turned AWAY — his back is to us"}`
    + `, ${Math.abs(chest)}°; hips ${Math.abs(hips)}° `
    + `${hips >= 0 ? "toward" : "away"}. Read off the shoulder and hip lines: how far apart the `
    + `drawing puts them is how far the body is turned, and crossed over means turned away.`;
}

/**
 * What the rest of the page does when the view turns.
 *
 * The sprite behind the joints is a DRAWING, made from one angle. Turn away
 * from that angle and it stops being a reference and starts being a picture
 * the figure no longer matches — so it fades as the view turns, far enough to
 * stop reading it as truth, not so far that you lose where the body is. The
 * angle is shown as a number because "roughly back to flat" is not a place you
 * can find by dragging, and Reset is one click.
 */
function applyTurn() {
  const box = $("#poseView3dBox");
  const plate = $("#plate");
  if (!box || !plate) return;
  box.classList.toggle("on", orbit.on);
  $("#poseView3d").checked = orbit.on;
  plate.classList.toggle("turned", !orbit.atRest);
  // 0.55 flat-on, easing to 0.22 by a quarter turn: dim enough to stop reading
  // it as the thing to match, present enough to still see where the body is.
  plate.style.setProperty("--sprite-dim", (0.55 - 0.33 * orbit.turned).toFixed(3));
  const angle = $("#viewAngle");
  if (angle) {
    angle.hidden = orbit.atRest;
    angle.textContent = `${Math.round(orbit.state.yaw)}° / ${Math.round(orbit.state.pitch)}°`
      + (orbit.state.dolly !== 1 ? ` · ${orbit.state.dolly.toFixed(2)}×` : "");
  }
}

/** Redraw only what a drag moves, so dragging stays at frame rate. */
function refreshDrag() {
  const pose = reads.get(ui.char).poses[ui.pose];
  $("#plate .rigline").innerHTML = mannequinSVG(pose.j, { handles: true });
  showFacing(pose.j);
  poseFromJoints(pose.j);
  drawThree();
}

// ------------------------------------------------------------------ editing

function pushUndo() {
  const key = `${ui.char}/${ui.pose}`;
  const pose = reads.get(ui.char).poses[ui.pose];
  const stack = undo.get(key) || [];
  stack.push(JSON.parse(JSON.stringify(pose.j)));
  if (stack.length > 40) stack.shift();
  undo.set(key, stack);
}

function commit() {
  const pose = reads.get(ui.char).poses[ui.pose];
  pose.source = "pose editor";
  delete pose.seed;
  noteEdit(ui.char, ui.pose, { j: pose.j });
  renderEditor();
  renderPicker();
}

/**
 * Move a joint by a drag measured ON SCREEN, and its chain with it.
 *
 * At rest that is what it has always been: cell x and cell y, one to one. With
 * the view turned it is the same gesture in the plane you are actually looking
 * at, which is the whole point of turning it — the movement decomposes into
 * cell x, y AND depth, so an arm can be angled inward by looking from above
 * and pulling the hand across.
 */
function moveJoint(name, dsx, dsy, { chain = true } = {}) {
  const pose = reads.get(ui.char).poses[ui.pose];
  const { right, up, dolly } = screenAxes(orbit.state);
  const a = dsx / dolly;
  const b = -dsy / dolly;
  const dx = right[0] * a + up[0] * b;
  const dyUp = right[1] * a + up[1] * b;
  const dz = right[2] * a + up[2] * b;
  const names = (chain ? [name, ...descendants(name)] : [name]).filter((n) => pose.j[n]);
  for (const n of names) {
    const pt = pose.j[n];
    pt[0] = round1(clamp(pt[0] + dx, 0, 100));
    pt[1] = round1(clamp(pt[1] - dyUp, 0, 100));
    const z = round1(clamp(depth(pt) + dz, -60, 60));
    // Depth is only written once there is some: a pose edited flat-on stays a
    // two-number pose, and the file stays a file about a drawing.
    if (z || pt.length > 2) pt[2] = z;
  }
}

function bindPlate() {
  const plate = $("#plate");
  let drag = null;

  const at = (e) => {
    const r = plate.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  };

  plate.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-joint]");
    if (!handle) return;
    const name = handle.dataset.joint;
    ui.sel = name;
    pushUndo();
    const pose = reads.get(ui.char).poses[ui.pose];
    // Track the pointer in SCREEN cell units and hand moveJoint the delta: with
    // the view turned there is no longer one cell coordinate under the cursor.
    const [x, y] = at(e);
    const shown = project(pose.j[name], viewOf(pose.j));
    drag = { name, ox: shown[0] - x, oy: shown[1] - y, sx: shown[0], sy: shown[1],
             chain: !e.shiftKey, moved: false };
    plate.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  plate.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [x, y] = at(e);
    const wantX = clamp(x + drag.ox, 0, 100);
    const wantY = clamp(y + drag.oy, 0, 100);
    moveJoint(drag.name, wantX - drag.sx, wantY - drag.sy, { chain: drag.chain });
    drag.sx = wantX;
    drag.sy = wantY;
    drag.moved = true;
    refreshDrag();
  });

  const end = () => {
    if (!drag) return;
    if (drag.moved) commit(); else renderEditor();
    drag = null;
  };
  plate.addEventListener("pointerup", end);
  plate.addEventListener("pointercancel", end);

  // WHO OWNS A PRESS. On the plate a handle always edits — this is an editor,
  // and refusing to move a joint because the view is turned would take away
  // the only way to author depth. Empty space turns the view instead, and only
  // while free look is on. On the rig canvas there is nothing to edit, so
  // every drag turns.
  orbit.bind(plate, (ev) => orbit.on && !ev.target.closest("[data-joint]"));
  orbit.bind($("#rigView"), () => orbit.on);
}

function bindKeys() {
  addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
      const stack = undo.get(`${ui.char}/${ui.pose}`);
      if (stack?.length) {
        reads.get(ui.char).poses[ui.pose].j = stack.pop();
        commit();
      }
      e.preventDefault();
      return;
    }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step || !ui.sel) return;
    const k = e.shiftKey ? 2 : 0.5;
    pushUndo();
    moveJoint(ui.sel, step[0] * k, step[1] * k, { chain: !e.altKey });
    commit();
    e.preventDefault();
  });
}

// ------------------------------------------------------------------- export

/** The character's whole read, in the exact shape of the on-disk file, so a
 *  finished character is a copy into sprites/docs/pose-reads/ and nothing else. */
function exportChar(char) {
  const data = reads.get(char);
  const poses = {};
  for (const [key, pose] of Object.entries(data.poses)) {
    const out = {};
    if (pose.read) out.read = pose.read;
    if (pose.source) out.source = pose.source;
    else if (pose.seed) out.seed = pose.seed;
    if (pose.flags) out.flags = pose.flags;
    // Export every joint the format has; a pose short of one is exported short
    // of it too, and tools/pose_apply.py is where that gets caught and named.
    out.j = Object.fromEntries(JOINTS.filter((n) => pose.j[n]).map((n) => [n, pose.j[n]]));
    poses[key] = out;
  }
  return {
    character: char,
    facing: "right",
    _about: data._about,
    _joints: JOINTS,
    poses,
  };
}

function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --------------------------------------------------------------------- boot

function shell() {
  const chars = CHARACTER_KEYS.filter((c) => c !== "effects");
  document.body.dataset.mode = "pose";
  // The page's own header belongs to the other two benches — its hints and
  // its mode links are theirs, and their show/hide rules key off a body class
  // this bench does not wear. Strip them, say which bench is running, and turn
  // this one's entry point into the way back out.
  $(".bar strong").textContent = "Sprite Joint Reads";
  document.querySelectorAll(".bar .pose-only, .bar .anim-only").forEach((el) => el.remove());
  $("#facingReviewTop")?.remove();
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "Eighteen joints a frame, read off the art as the engine draws it. "
    + "Edits last until you reload — download before you go.";
  $(".bar strong").after(hint);
  const link = $('.bar a[href="./?edit=pose"]');
  if (link) { link.href = "./"; link.textContent = "← 3D Workbench"; }
  showBuild();
  $("main.layout").outerHTML = `
    <main class="poseedit">
      <aside class="picker">
        <div class="picker-head">
          <select id="charPick">${chars.map((c) =>
            `<option value="${c}" ${c === ui.char ? "selected" : ""}>${CHARACTERS[c]?.name || c}</option>`).join("")}</select>
          <span class="hint" id="poseCount"></span>
        </div>
        <div class="thumbs" id="poseList"></div>
      </aside>

      <section class="editor">
        <div class="edit-head">
          <b class="mono" id="poseName">—</b>
          <span id="poseStamp" class="stamp"></span>
          <span id="facingRead" class="facing"
                title="How far the shoulder line and the hip line say the body is turned. Drag a shoulder or hip marker wider to turn toward the camera, cross them over to turn away."></span>
          <button id="viewAngle" class="angle" hidden
                  title="The view is turned away from the drawing's angle — click to go back"></button>
          <span class="grow"></span>
          <button id="btnSwap" class="ghost sm" title="This drawing's near limbs are the other side's — exchange left and right">⇄ Swap L/R</button>
          <button id="btnSnap" class="ghost sm" title="Pull every joint onto the drawing">Snap to art</button>
          <button id="btnReset" class="ghost sm" title="Throw away this frame's edits">Reset frame</button>
          <button id="btnExport" class="primary sm">⤓ Download this character</button>
          <button id="btnExportAll" class="ghost sm">⤓ All edited</button>
        </div>

        <div class="panes">
          <div class="pane">
            <div class="plate big" id="plate"></div>
            <p class="hint">Drag a joint to move it and everything below it in the
              chain. <kbd>Shift</kbd>-drag moves the one joint. Arrow keys nudge the
              selected joint, <kbd>Shift</kbd> for a bigger step, <kbd>Alt</kbd> for
              that joint alone. <kbd>⌘Z</kbd> undoes.</p>
            <p class="hint">The <b>shoulder</b> and <b>hip</b> markers say which way the
              body is TURNED, not just where the joints are: they sit on rigid bars, so
              how far apart the drawing puts them is the angle. Wide apart with the left
              marker on the right — where a fighter facing right keeps their far
              shoulder — is square to the camera; crossed over is turned away; on top of
              each other is a pure side view. The hips carry the legs and the feet round
              with them, which is how a foot ends up pointing at the lens.</p>
            <p class="hint">Red handles are the fighter's RIGHT side — the one nearer
              the camera when they face right. In a punch that is usually the
              chambered arm, not the extended one: the extended arm is normally
              drawn passing behind the collar, which puts it on the far side. If a
              whole pose is the wrong way round, <b>Swap L/R</b>. The two
              <b>toe</b> handles set which way each foot points.</p>
            <p class="hint" id="depthNote" hidden>This pose carries DEPTH — one or
              more joints sit off the drawing's plane. Turn the view on to see it.</p>
            <p class="hint warn" id="faceNote" hidden>This frame is delivered facing
              LEFT and mirrored by the engine. It is shown here mirrored, the way the
              game draws it — pose it as you see it.</p>
          </div>
          <div class="pane">
            <div class="rigwrap">
              <canvas id="rigView"></canvas>
              <label class="check view3d" id="poseView3dBox"
                     title="Drag to turn, scroll to move in. Both panes turn together; off returns to the drawing's own angle.">
                <input id="poseView3d" type="checkbox"> View 3D
              </label>
            </div>
            <p class="hint">The fighter's own rig: spine, neck, both clavicles,
              arms, legs and feet, each turned to match the joints. <b>View 3D</b>
              turns this pane and the plate together — drag either, scroll to move
              in — and a joint dragged while turned gains DEPTH, which is how a pose
              the drawing cannot hold (an arm angled inward, a foot rolled out) gets
              said. Off returns both to the drawing's own angle. For a bone the read
              has no joint for, use the keyframe bench at
              <a href="./?edit=animation">?edit=animation</a>.</p>
            <label class="note-label" for="poseNote">What this frame is doing</label>
            <textarea id="poseNote" rows="3" placeholder="e.g. three-point stance, far hand planted, rear leg stretched back"></textarea>
            <ul class="joints" id="jointList"></ul>
          </div>
        </div>
      </section>
    </main>`;
}

/** When this file was last written, in the bar. The editor is served with
 *  no-store, so a page that is behind is a checkout that is behind — and the
 *  only way to tell by looking used to be to notice that a fix was missing. */
async function showBuild() {
  try {
    const res = await fetch(import.meta.url, { method: "HEAD", cache: "reload" });
    const when = res.headers.get("last-modified");
    if (!when) return;
    const stamp = document.createElement("span");
    stamp.className = "hint build";
    stamp.textContent = `build ${new Date(when).toISOString().slice(0, 16).replace("T", " ")}`;
    stamp.title = "When this build of the editor was written. If it is older than a "
      + "change you are looking for, the checkout is behind — git pull, then reload.";
    $(".bar").append(stamp);
  } catch { /* a HEAD that fails is not worth a broken page */ }
}

async function selectChar(char) {
  ui.char = char;
  const data = await loadRead(char);
  const keys = Object.keys(data.poses);
  if (!ui.pose || !data.poses[ui.pose]) ui.pose = keys.includes("idle_a") ? "idle_a" : keys[0];
  const url = new URL(location.href);
  url.searchParams.set("edit", "pose");
  url.searchParams.set("char", char);
  history.replaceState(null, "", url);
  await showRig(char);
  renderPicker();
  renderEditor();
}

async function boot() {
  shell();
  clearStaleStorage();
  manifest = await (await fetch(MANIFEST_URL, { cache: "no-cache" })).json();
  initThree($("#rigView"));
  initPose(THREE);
  // Mannequins for everyone and no GLB fetched up front: a tool that looks at
  // one fighter at a time pays for one fighter at a time (loader.js initRigs).
  await rigs.initRigs(THREE, GLTFLoader, ["all"], CHARACTER_KEYS, []);

  $("#charPick").addEventListener("change", (e) => { ui.pose = null; selectChar(e.target.value); });
  $("#poseList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pose]");
    if (!btn) return;
    ui.pose = btn.dataset.pose;
    ui.sel = null;
    renderPicker();
    renderEditor();
  });
  $("#jointList").addEventListener("click", (e) => {
    const li = e.target.closest("[data-joint]");
    if (li) { ui.sel = li.dataset.joint; renderEditor(); }
  });
  $("#poseNote").addEventListener("input", (e) => {
    reads.get(ui.char).poses[ui.pose].read = e.target.value;
    noteEdit(ui.char, ui.pose, { read: e.target.value });
  });
  $("#btnReset").addEventListener("click", async () => {
    SESSION.delete(editKey(ui.char, ui.pose));
    reads.delete(ui.char);
    await loadRead(ui.char);
    renderPicker();
    renderEditor();
  });
  $("#poseView3d").addEventListener("change", (e) => orbit.setOn(e.target.checked));
  $("#viewAngle").addEventListener("click", () => orbit.reset());
  $("#btnSnap").addEventListener("click", () => { snapToArt(); });
  $("#btnSwap").addEventListener("click", () => {
    const pose = reads.get(ui.char).poses[ui.pose];
    pushUndo();
    const swapped = { ...pose.j };
    for (const part of SIDED) {
      if (!pose.j[`${part}L`] || !pose.j[`${part}R`]) continue;
      swapped[`${part}L`] = pose.j[`${part}R`];
      swapped[`${part}R`] = pose.j[`${part}L`];
    }
    pose.j = swapped;
    commit();
  });
  $("#btnExport").addEventListener("click", () => download(`${ui.char}.json`, exportChar(ui.char)));
  $("#btnExportAll").addEventListener("click", async () => {
    const all = {};
    for (const char of editedChars()) {
      await loadRead(char);
      all[char] = exportChar(char);
    }
    download("pose-reads-edited.json", all);
  });
  addEventListener("resize", drawThree);
  bindPlate();
  bindKeys();
  await selectChar(ui.char);
  applyTurn();
  window.__workbenchReady = true;
}

// ------------------------------------------------------- snap to the drawing
//
// The same rule tools/pose_reads.py applies, run in the browser off the
// frame's own alpha: a joint belongs ON the body. It is a tidy-up for a seed
// that landed beside a limb, not a substitute for placing the joint — nearest
// ink is happy to put an elbow on the nearest thigh.

let snapCanvas = null;
function snapToArt() {
  // Nearest-ink is a statement about the DRAWING, so it only means anything
  // from the drawing's own angle.
  if (!orbit.atRest) { orbit.reset(); }
  const pose = reads.get(ui.char).poses[ui.pose];
  const img = $("#plate img");
  if (!img?.complete) return;
  const N = 160;
  snapCanvas ||= document.createElement("canvas");
  snapCanvas.width = snapCanvas.height = N;
  const ctx = snapCanvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, N, N);
  const s = N / Math.max(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.save();
  if (faceLeft(ui.char, ui.pose)) { ctx.translate(N, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, (N - w) / 2, (N - h) / 2, w, h);
  ctx.restore();
  const alpha = ctx.getImageData(0, 0, N, N).data;
  const ink = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) if (alpha[(y * N + x) * 4 + 3] > 60) ink.push([x, y]);
  }
  if (!ink.length) return;

  pushUndo();
  for (const name of JOINTS.filter((n) => pose.j[n])) {
    const cx = (pose.j[name][0] * N) / 100;
    const cy = (pose.j[name][1] * N) / 100;
    let best = null;
    let bestD = Infinity;
    for (const [x, y] of ink) {
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) { bestD = d; best = [x, y]; }
    }
    if (Math.sqrt(bestD) * (100 / N) <= 1.5) continue;
    pose.j[name] = [
      round1(clamp((best[0] + (best[0] - cx) * 0.4) * (100 / N), 0, 100)),
      round1(clamp((best[1] + (best[1] - cy) * 0.4) * (100 / N), 0, 100)),
    ];
  }
  commit();
}

boot().catch((err) => {
  const el = document.getElementById("bootError");
  if (el) { el.textContent = `The pose editor failed to start: ${err.message}`; el.hidden = false; }
  throw err;
});
