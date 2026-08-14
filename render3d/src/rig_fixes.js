// THE LAYER BETWEEN THE MODEL AND THE POSE — corrections that belong to the
// .glb, applied under everything, until somebody bakes them into the .glb.
//
// A generated model arrives with things wrong that are not anybody's pose: a
// head modelled looking slightly down, a shoulder built a few degrees high, a
// clavicle rolled. They are facts about the FILE, so no clip can fix them —
// every state inherits the same stoop — and no amount of measuring the
// skeleton finds them, because the joints come out level to within a degree
// across the whole roster while the mesh does not.
//
// The idle review is where they get found, because the idle is the one pose
// with an obvious right answer: a fighter standing next to their own idle
// sprite either matches it or does not. So the review dials a correction until
// the idle reads right — and the correction it lands on is NOT part of the
// idle. It is part of the model, and it belongs under the crouch and the punch
// and the run just as much.
//
// That is what this file holds and why it is separate from both pose
// libraries. A pose says what the fighter is doing; a fix says what their
// model got wrong. Mixing them means re-deriving the same shoulder correction
// in forty poses and getting it slightly different in each.
//
// IT IS MEANT TO GO AWAY. Every entry here is a note for the modelling pass
// that bakes it into the rig's bind, after which the entry is deleted and
// nothing else changes — which is the test of whether a correction really
// belonged here rather than in a pose.

/** Degrees → radians. */
const DEG = Math.PI / 180;

/**
 * THE COMPLETE BAKE LIST — every correction the engine applies on top of a
 * delivered .glb, in one place, so that "what has to go into the model" is a
 * question with an answer rather than a search.
 *
 * Each entry says where the number lives, what it means, and what baking it
 * would actually be. `tools/model_fixes.mjs` prints the roster against this.
 */
export const MODEL_FIXES = {
  yawOffsetDeg: {
    where: "manifest",
    means: "the model was built facing somewhere other than +Z",
    bake: "rotate the whole rig about Y by -yawOffsetDeg and re-export",
  },
  headTiltDeg: {
    where: "manifest",
    means: "the head was modelled looking down; the tilt is in the MESH, not the joints",
    bake: "rotate the head mesh about the Head joint's lateral axis by -headTiltDeg",
  },
  shoulderOutCm: {
    where: "manifest",
    means: "the arm roots were built too far into the body",
    bake: "move the Left/RightArm joints (and their skin) out along the shoulder line",
  },
  renderScale: {
    where: "manifest",
    means: "the model measures a different height than the fighter is drawn at",
    bake: "scale the rig uniformly by renderScale and re-measure heightM",
  },
  bones: {
    where: "RIG_FIXES, below",
    means: "a joint was built rotated — a rolled clavicle, a cocked wrist",
    bake: "rotate the joint in the bind pose and re-skin",
  },
};

/** The manifest keys that are MODEL corrections rather than pose choices.
 *
 *  `armDeg` and `stanceDeg` are deliberately NOT here. They say how a fighter
 *  carries their arms and plants their feet AT REST, which is a pose and only
 *  means anything in the idle — baking them would freeze a fighter mid-idle in
 *  every other state. Everything listed here is true of the body no matter
 *  what it is doing, which is exactly the test for belonging on this list. */
export const MODEL_FIX_KEYS = ["yawOffsetDeg", "headTiltDeg", "shoulderOutCm", "renderScale"];

/**
 * The whole layer, on or off.
 *
 * OFF IS THE POINT OF BAKING. Once a fighter's corrections are in their .glb,
 * turning this off must change nothing about how they look — and if it does,
 * the bake was wrong or incomplete. So it is a switch rather than a set of
 * deletions: you flip it, compare, and only then delete the numbers.
 */
let ENABLED = true;
export function setModelFixesEnabled(on) { ENABLED = on !== false; }
export function modelFixesEnabled() { return ENABLED; }

/** What is pending for one fighter, given their manifest entry: the bake list,
 *  narrowed to the corrections they actually carry. */
export function pendingFixes(charKey, entry = null) {
  const out = {};
  for (const key of MODEL_FIX_KEYS) {
    const v = entry?.[key];
    if (v === undefined || v === null) continue;
    if (key === "renderScale" && Math.abs(v - 1) < 1e-6) continue;
    if (key !== "renderScale" && !v) continue;
    out[key] = v;
  }
  const bones = RIG_FIXES[charKey];
  if (bones && Object.keys(bones).length) out.bones = bones;
  return out;
}

/**
 * Per character, per bone, a rotation in the BONE'S OWN frame, in degrees.
 *
 * Bone-local rather than the fighter's frame — which is the opposite of the
 * pose libraries and is deliberate. A fix is a correction to how one bone was
 * built, so it is authored by looking at that bone; a pose is a human movement
 * described once for a whole roster, so it is authored in anatomy. Using the
 * anatomical frame here would mean a shoulder fix that changes meaning as the
 * arm swings, which is exactly what a bind-pose correction must not do.
 *
 * `headTiltDeg` in the rig manifest is the same idea and predates this file;
 * it stays where it is, applied alongside these, because the idle review
 * already writes it and a second place to say the same thing is worse than an
 * inconsistent one.
 */
export const RIG_FIXES = {
  // ------------------------------------------------------------- shoulders
  //
  // Measured and then SOLVED, not eyeballed: `tools/rig_calibrate.mjs` reads
  // the shoulder height difference off each rig as a fraction of the shoulder
  // width, and `--solve` finds the correction by applying a trial roll to the
  // POSED rig, measuring what actually moved, and scaling. Only the fighters
  // whose tilt the loop drives to zero are here. Deriving the angle from the
  // tilt directly — the obvious way — under-corrected Yuji by four fifths,
  // because a fix composes in the bone's parent frame while the tilt is
  // measured in the world's, and those stop agreeing the moment the clavicle
  // has any rest rotation.
  //
  // Each RAISES THE LOWER SHOULDER rather than dropping the higher one: the
  // higher one is where the costume and the silhouette were built, and
  // dropping it moves the collar.
  yuji: { LeftShoulder: [0, 0, 19.2] },    // -0.057 -> 0.000
  megumi: { LeftShoulder: [0, 0, 3.6] },   // -0.011 -> 0.000
  jogo: { LeftShoulder: [0, 0, 16.7] },    // -0.131 -> 0.000

  // WHAT IS DELIBERATELY NOT HERE, because the same loop said so:
  //
  //   * Nanami, Hanami, Dagon and Mahito are tilted the OTHER way and the
  //     solve makes them worse, not better — Nanami's 0.087 becomes 0.174. A
  //     right-shoulder correction is not a mirrored left-shoulder one on these
  //     rigs and the axis it wants has not been found yet. Better tilted than
  //     tilted twice as far.
  //   * Uro, Hakari, Meimei, Kurourushi and Choso measure ZERO tilt once
  //     posed: the idle clip sets their clavicles and levels the skeleton, so
  //     a bone correction has nothing to correct. Their unevenness is in the
  //     MESH (Uro -0.069, Kurourushi -0.234) and a rotation that levels skin
  //     while the bones are already level is a different fix, sized off a
  //     different measurement.
  //   * Every knee. The kink is real in the BIND — Geto's shins jut 18° and
  //     34° out of their thighs — but it does not survive into a posed state,
  //     because the poses rotate legs in the sagittal plane and overwrite it.
  //     Measured on the posed idle every fighter reads a kink of 0, and a
  //     correction applied there only ADDS one: Geto gained 2.9° and 5.4° and
  //     visibly widened. What the eye is catching on Geto is more likely his
  //     `stanceDeg`, which this round's idle review raised to 15 — among the
  //     widest on the roster.
};


/** The fixes for a character, or null. Never throws on an unknown key. */
export function fixesFor(charKey) {
  const fix = RIG_FIXES[charKey];
  return fix && Object.keys(fix).length ? fix : null;
}

/**
 * Apply a character's fixes to a posed rig.
 *
 * PREMULTIPLIED, so the angle is read in the bone's PARENT frame and composes
 * with whatever the pose already did rather than replacing it — the same
 * convention as `applyPoseEdits` in pose.js, which is the layer this one sits
 * beside.
 *
 * Called for EVERY state, which is the whole point. A fix that only shows up
 * in the idle is a fix that has been mistaken for a pose.
 */
export function applyRigFixes(THREE, root, charKey) {
  const fix = fixesFor(charKey);
  if (!fix || !root) return false;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let hit = 0;
  for (const [name, [rx = 0, ry = 0, rz = 0]] of Object.entries(fix)) {
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    e.set(rx * DEG, ry * DEG, rz * DEG, "XYZ");
    bone.quaternion.premultiply(q.setFromEuler(e));
    hit++;
  }
  if (hit) root.updateMatrixWorld(true);
  return hit > 0;
}
