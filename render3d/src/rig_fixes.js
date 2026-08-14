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
  kneeDeg: {
    where: "manifest",
    means: "the shins splay out of the knees — a bandy leg built into the model",
    bake: "swing each shin (and its skin) about the body's forward axis until it hangs under its knee",
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
  symmetry: {
    where: "SYMMETRISE, below",
    means: "the skeleton was built lopsided — paired joints at different heights",
    bake: "mirror the bind pose about its centre line and re-skin",
  },
};

/** The manifest keys that are MODEL corrections rather than pose choices.
 *
 *  `armDeg` and `stanceDeg` are deliberately NOT here. They say how a fighter
 *  carries their arms and plants their feet AT REST, which is a pose and only
 *  means anything in the idle — baking them would freeze a fighter mid-idle in
 *  every other state. Everything listed here is true of the body no matter
 *  what it is doing, which is exactly the test for belonging on this list. */
export const MODEL_FIX_KEYS = ["yawOffsetDeg", "headTiltDeg", "shoulderOutCm", "kneeDeg", "renderScale"];

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
  if (SYMMETRISE[charKey] === true) out.symmetry = "mirrored about the centre line";
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
  // ------------------------------------------------------------------ geto
  //
  // HAND-DIALLED IN THE MODEL BENCH (?edit=models), not solved: somebody stood
  // him in a T-pose and turned joints until he looked like one. That is a
  // different instrument from the calibrate loop above and it reaches things
  // the loop cannot — the loop only knows how to level shoulders, and most of
  // what is wrong with this rig is somewhere else.
  //
  // The measurements behind it, taken off the posed rig:
  //   * FEET SPLAYED, AND UNEQUALLY. Toes 26° out on the left, 46° on the
  //     right — 19° apart from each other. The foot yaws below square both
  //     forward, and yaw is the one thing applyIdleStand deliberately never
  //     touches (a fighter who stands with their feet turned out is a pose,
  //     not an error), so a bone fix is the only thing that can.
  //   * ARMS 12° APART in the T-pose, left 5.7° above horizontal and right
  //     6.2° below, off arm roots 3.9cm apart in HEIGHT. That last one is a
  //     position, not a rotation, and is why SYMMETRISE carries him too.
  //   * ELBOWS at 25°, which is exactly MAX_IDLE_ELBOW — both arms are as
  //     straight as the idle layer will allow and still read bent.
  //
  // TWO ENTRIES TO WATCH, kept because the point of this round is to find out
  // whether hand-dialling a rig works at all, and dropping the ones that look
  // odd would answer a different question:
  //   * LeftLeg / RightLeg. Both knees measure exactly straight in this pose
  //     (the rig check straightens them), so these ADD a bend of 12° and 15°
  //     rather than removing one, in opposite directions.
  //   * LeftHand. A 33° wrist correction rides under the weapon-grip solver in
  //     every state.
  geto: {
    LeftUpLeg: [0, 0, -2.47],
    RightUpLeg: [0, 0, 10.5],
    LeftLeg: [11.63, 0, 0],
    RightLeg: [-15.12, 0, 0],
    LeftFoot: [0, 16.19, 0],
    RightFoot: [-1.48, -47.28, 0],
    LeftToeBase: [-9.2, 11.57, 0],
    RightToeBase: [-5.91, -4.99, 0],
    LeftArm: [1.32, 0, 0],
    RightArm: [1.03, 0, 0],
    LeftForeArm: [19.1, 0, 0],
    RightForeArm: [-13.43, 0, 0],
    LeftHand: [33.47, -24.96, 15.59],
    RightHand: [0, 29.64, 0],
  },
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
  //   * Every knee — but not because the knees are fine. The frontal KINK is
  //     real in the bind (Geto's shins jut 18° and 34° out of their thighs)
  //     and does not survive into a posed state, so a bend correction applied
  //     there only ADDS one: Geto gained 2.9° and 5.4° and visibly widened.
  //     A shin that splays out of its knee has its own dial, `kneeDeg`, in
  //     the manifest beside the other model corrections — it is measured and
  //     applied about the BODY's forward axis rather than the bone's own, so
  //     it does not belong in this bone-local table. Measured, no fighter
  //     needs it: on the posed idle every knee reads a bow of 0.0.
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

// ------------------------------------------------------ SKELETON SYMMETRY
//
// A rotation fix says "this joint was built turned". This says something the
// rotations cannot: "this joint was built in the wrong PLACE".
//
// Generated skeletons come out lopsided in position as well as in angle —
// Geto's arm roots sit 3.9cm apart in height, one knee is higher than the
// other, and no amount of rotating a bone moves it, because a bone's position
// is set by its parent. The tell is that the defect survives every pose: the
// engine straightens legs and levels soles in the idle and the fighter still
// stands with one shoulder dropped.
//
// A body is symmetric. That is not a style choice about these characters, it
// is what the drawings show and what every pose library assumes when it says
// one thing about "the arm". So the fix is to MIRROR the skeleton about its
// own sagittal plane: for each Left/Right pair, both bones move to the average
// of where the two of them were, and the bones on the centre line move onto
// it.
//
// WHAT IT DOES NOT DO is touch rotations, lengths along the limb, or anything
// asymmetric on purpose (a prop bone, a hair chain). Only the paired skeleton,
// and only its placement.

/** Characters whose skeleton is mirrored about its own centre line before
 *  anything is posed on it. Per character rather than roster-wide: it is a
 *  claim about a delivery, and a fighter whose rig is already square should
 *  not be paying for the measurement. */
export const SYMMETRISE = {
  // Geto: arm roots 3.9cm apart in height, knees likewise, feet splayed 26°
  // and 46°. The rotations below square the feet; this squares the frame they
  // hang off, which is the half a rotation cannot reach.
  geto: true,
};

/** The bones a mirror applies to: everything the standard skeleton names in
 *  pairs, plus the centre line it mirrors about. Prop and hair bones are
 *  deliberately absent — they are asymmetric because somebody meant them to
 *  be. */
const PAIRED = ["Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase"];
const CENTRED = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"];

export function symmetrises(charKey) {
  return SYMMETRISE[charKey] === true;
}

/**
 * Mirror a rig's bone POSITIONS about its own sagittal plane.
 *
 * Measured in the rig's own frame rather than the world's, and the frame comes
 * from the SKELETON — the lateral axis is hip joint to hip joint — so a model
 * built facing anywhere is judged on its own body. That is the same trick the
 * idle stand and the shoulder width use, and for the same reason: asking the
 * manifest which way somebody faces is how a correction ends up rotated by
 * their `yawOffsetDeg`.
 *
 * Parents before children, because a bone's local position is read against a
 * parent this function is also moving. Doing it in any other order mirrors a
 * child about where its parent USED to be.
 */
export function applySkeletonSymmetry(THREE, root, charKey) {
  if (!symmetrises(charKey)) return false;
  const get = (n) => root.getObjectByName(n);
  const hipL = get("LeftUpLeg"), hipR = get("RightUpLeg");
  if (!hipL || !hipR) return false;
  root.updateMatrixWorld(true);

  // The rig's own frame, in ROOT-LOCAL space: everything below is measured and
  // written there, so the root's yaw and the turnaround never enter into it.
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = (bone) => new THREE.Vector3()
    .setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv);

  const pL = local(hipL), pR = local(hipR);
  const lat = new THREE.Vector3(pR.x - pL.x, 0, pR.z - pL.z);
  if (lat.lengthSq() < 1e-8) return false;
  lat.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3().crossVectors(up, lat).normalize();
  // The centre line: the midpoint of the hips is the one point on it every
  // humanoid skeleton has, whatever else the generator did.
  const mid = pL.clone().add(pR).multiplyScalar(0.5);

  const coords = (p) => {
    const d = p.clone().sub(mid);
    return { l: d.dot(lat), u: d.dot(up), f: d.dot(fwd) };
  };
  const point = (c) => mid.clone()
    .addScaledVector(lat, c.l).addScaledVector(up, c.u).addScaledVector(fwd, c.f);

  /** Write a bone's ROOT-LOCAL position back as a local one, through whatever
   *  its parent is now. */
  const place = (bone, target) => {
    bone.parent.updateWorldMatrix(true, false);
    const world = target.clone().applyMatrix4(root.matrixWorld);
    bone.position.copy(bone.parent.worldToLocal(world));
    bone.updateMatrixWorld(true);
  };

  let moved = 0;
  // Down the body, parents first. PAIRED is already in that order and the
  // centre line is done first so the pairs mirror about a straightened spine.
  for (const name of CENTRED) {
    const bone = get(name);
    if (!bone || !bone.parent) continue;
    const c = coords(local(bone));
    if (Math.abs(c.l) < 1e-5) continue;
    place(bone, point({ l: 0, u: c.u, f: c.f }));
    moved++;
  }
  for (const base of PAIRED) {
    const bl = get(`Left${base}`), br = get(`Right${base}`);
    if (!bl || !br || !bl.parent || !br.parent) continue;
    const cl = coords(local(bl)), cr = coords(local(br));
    // Sideways: the same distance out on each side, which is the average of
    // the two magnitudes rather than of the two signed numbers — those nearly
    // cancel, and a limb pair is not meant to average to the middle.
    const out = (Math.abs(cl.l) + Math.abs(cr.l)) / 2;
    const u = (cl.u + cr.u) / 2;
    const f = (cl.f + cr.f) / 2;
    place(bl, point({ l: Math.sign(cl.l || -1) * out, u, f }));
    place(br, point({ l: Math.sign(cr.l || 1) * out, u, f }));
    moved += 2;
  }
  if (moved) root.updateMatrixWorld(true);
  return moved > 0;
}
