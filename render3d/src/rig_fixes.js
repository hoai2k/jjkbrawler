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

/** Degrees → radians, the only maths this file needs. */
const DEG = Math.PI / 180;

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
  // (empty — the roster's corrections still live in the manifest's
  // `headTiltDeg` while the idle review is the only thing that writes them.
  // Shoulder and clavicle fixes land here as the review starts producing them,
  // one entry per bone with a note saying what looked wrong.)
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
