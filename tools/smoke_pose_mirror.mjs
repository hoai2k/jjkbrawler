// Smoke-test the default pose set and its left-right flip resilience.
//
// Pure Node, no browser: the vendored three module, the mannequin and the
// clip layer are all importable headless, so this runs anywhere the repo
// does:   node tools/smoke_pose_mirror.mjs
//
// WHAT IT PROVES, per default clip state:
//
//   * the clip builds, and a looping clip's first and last sampled poses
//     match (no wrap jump-cut);
//   * a beat state has an exact sample at its beat (the hitbox contract);
//   * mirroring is an involution — mirrorKeys twice gives back the table —
//     so a flipped model can always be flipped back losslessly;
//   * THE FACING GUARANTEE: posed on the real mannequin skeleton, the
//     mirrored clip's hands land at the original's hands reflected across
//     the sagittal plane — forward (+Z) and height (Y) preserved, lateral
//     (X) negated. A mirrored punch extends exactly as far forward with the
//     other fist, which is what lets a model flip direction and keep every
//     pose's read.
//
// The mirror-vs-turnaround split this guards: FACING is the engine's (a 180°
// yaw in render3d, a blit-time mirror in sprites/billboards) and never edits
// the clip; the pose-level mirror (clips.js) is for the pose itself changing
// hands. If a refactor ever bakes facing into the pose data, the reflection
// checks here are what goes red.

import * as THREE from "../vendor/three/three.module.js";
import { STATES, CLIP_STATES } from "../render3d/src/states.js";
import { buildDefaultClips, buildMannequin } from "../render3d/src/mannequin.js";
import { clipToKeys, mirrorKeys, mirrorClip, mirrorBoneName } from "../render3d/src/clips.js";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  if (!ok || process.argv.includes("-v")) {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
  }
};

const clips = buildDefaultClips(THREE);
check(CLIP_STATES.every((s) => clips.get(s)), "every clip state builds a default clip");

// ---------------------------------------------------------- table invariants
for (const state of CLIP_STATES) {
  const clip = clips.get(state);
  const keys = clipToKeys(THREE, clip);

  if (STATES[state].loop) {
    const first = keys[0], last = keys[keys.length - 1];
    const same = JSON.stringify(first.pose) === JSON.stringify(last.pose)
      && (first.hipsY ?? null) === (last.hipsY ?? null);
    check(same, `${state}: looping clip's last key equals its first`);
  }

  const beat = STATES[state].beat;
  if (beat !== undefined) {
    const sampled = clip.tracks.every((t) =>
      Array.from(t.times).some((x) => Math.abs(x - beat) < 1e-5));
    check(sampled, `${state}: contact beat ${beat}s is an exact sample`);
  }

  // Mirroring twice is the identity, hip heights and timing included.
  const twice = mirrorKeys(mirrorKeys(keys));
  check(JSON.stringify(twice) === JSON.stringify(keys), `${state}: mirror is an involution`);

  // Every bone a mirrored pose names must exist on the standard skeleton —
  // a typo'd side prefix would silently animate nothing.
  const rig = buildMannequin(THREE, null);
  const names = new Set();
  rig.root.traverse((o) => { if (o.isBone) names.add(o.name); });
  const bad = mirrorKeys(keys).flatMap((k) => Object.keys(k.pose)).filter((b) => !names.has(b));
  check(bad.length === 0, `${state}: mirrored pose bones all exist`, bad.join(","));
}

// ------------------------------------------------------- the facing guarantee
//
// Pose the mannequin with a clip and with its mirror, at the same instant,
// and compare end-effector world positions: mirrored Left* must land where
// original Right* did with x negated, y and z (forward) unchanged.

function worldPositions(clip, t) {
  const m = buildMannequin(THREE, null);
  const mixer = new THREE.AnimationMixer(m.root);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  m.root.updateMatrixWorld(true);
  const out = {};
  for (const name of ["LeftHand", "RightHand", "LeftFoot", "RightFoot", "Head"]) {
    out[name] = m.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  }
  return out;
}

const EPS = 1e-3;
for (const state of ["light", "sideHeavy", "upHeavy", "crouchAttack", "run", "ledge"]) {
  const clip = clips.get(state);
  const t = STATES[state].beat ?? STATES[state].duration / 2;
  const orig = worldPositions(clip, t);
  const flip = worldPositions(mirrorClip(THREE, clip), t);
  let worst = 0, where = "";
  for (const name of Object.keys(orig)) {
    const a = orig[name], b = flip[mirrorBoneName(name)];
    for (const [d, err] of [["x", Math.abs(a.x + b.x)], ["y", Math.abs(a.y - b.y)], ["z", Math.abs(a.z - b.z)]]) {
      if (err > worst) { worst = err; where = `${name}.${d}`; }
    }
  }
  check(worst < EPS, `${state}: mirrored pose is the exact sagittal reflection`,
    `worst ${worst.toFixed(5)} at ${where}`);
  // And the strike still FACES: full extension reaches as far forward.
  if (STATES[state].beat !== undefined) {
    const reach = Math.max(orig.LeftHand.z, orig.RightHand.z);
    const reachM = Math.max(flip.LeftHand.z, flip.RightHand.z);
    check(Math.abs(reach - reachM) < EPS, `${state}: forward reach survives the flip`,
      `${reach.toFixed(3)}m vs ${reachM.toFixed(3)}m`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : "\nall pose-mirror checks passed");
process.exit(failures ? 1 : 0);
