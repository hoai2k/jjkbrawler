#!/usr/bin/env node
// TAKE THE ARM OFF THE HEM. A skirt is not driven by a hand.
//
//   node tools/prune_hem_weights.mjs <char>           # what it would cut
//   node tools/prune_hem_weights.mjs <char> --apply   # write the .glb
//   node tools/prune_hem_weights.mjs <char> --apply --intake
//
// A generated fighter is skinned by PROXIMITY, and proximity does not know
// what a garment is. Nobara stands with her hands at her sides, so the hem of
// her skirt is a few centimetres from her wrists, and the bind gave the hem to
// her arms — 203 vertices around the bottom edge, on both sides, carrying
// hand and forearm weight. Nothing about that is visible in the bind pose,
// which is why it survives a delivery review. It shows up the first time she
// raises a hand: the hem goes with it, and one panel of the skirt lifts and
// tents like it has been hooked.
//
// The rule, stated so it can be argued with. An influence is cut when
//
//   * the bone is in an ARM CHAIN — Arm / ForeArm / Hand, and anything under
//     the hand (a prop bone, a finger);
//   * and the vertex's own DOMINANT bone is BELOW THE SHOULDER LINE — a hip, a
//     pelvis fan, the lower spine, a thigh, a shin, a foot. The shoulder line
//     is where an arm attaches to a body, so everything under it is on the far
//     side of a joint the arm cannot reach across: no pose exists in which a
//     thigh's skin, or a hip's, travels with a forearm.
//
// WHAT IS LEFT ALONE, however large the influence: the chest and above —
// `Spine2`, the clavicles, `Neck`, `Head`. An arm legitimately shares weight
// with a deltoid, a collar and the top of a chest, and how far a shoulder
// blend should reach is a judgement about a body rather than a defect — the
// same line prune_arm_weights.py draws around the spine, for the same reason.
//
// The line matters more than it looks. Drawn at the HIP JOINT instead, on
// height, it cut Nobara's hem and left the thing that was actually visible:
// 102 vertices at her hip, dominated by `Spine` and carrying hand weight,
// which tented out into a black shard the moment she raised that hand. They
// are half a body away from the bone driving them and they sit above the hip,
// so only the anatomy catches them.
//
// The clavicles are deliberately not in the chain, for the reason
// `prune_arm_weights.py` sets out at length: `LeftShoulder` and
// `RightShoulder` meet at the sternum and honestly share weight there. They
// are also nowhere near a hem, so it costs nothing to keep the two tools
// saying the same thing about what an arm is.
//
// THIS IS THE SAME CLASS OF FIX as prune_arm_weights.py — an influence on a
// bone that cannot move that vertex in any real pose — and the same repair:
// the weight is zeroed and what remains is renormalised, so the geometry stops
// being towed and nothing else about it changes. It is a separate tool because
// it is a separate claim: that one is about an arm driving THE OTHER ARM, this
// one about an arm driving CLOTH, and a rig can have either without the other.

import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readGlb, writeGlb, readAccessor, skeletonOf } from "./glb.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const charKey = args.find((a) => !a.startsWith("--"));

const ARM_ROOTS = ["LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand"];
// The chest and above: what an arm may legitimately share skin with. Anything
// else a skin names — the lower spine, the hips, the pelvis fans, the legs and
// every twist segment under them — is below the shoulder line.
const ABOVE_THE_SHOULDER = ["Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"];

/** Does this joint hang under one of `roots` — walking up, so a twist segment
 *  under a thigh is a leg and a prop bone under a hand is that arm. */
function under(skeleton, joint, roots) {
  const parent = new Map();
  for (let j = 0; j < skeleton.names.length; j++) {
    for (const child of skeleton.children[j]) parent.set(child, j);
  }
  let at = joint, guard = 0;
  while (at !== undefined && guard++ < 64) {
    if (roots.includes(skeleton.names[at])) return true;
    at = parent.get(at);
  }
  return false;
}

async function prune(char) {
  const intake = join(ROOT, "render3d", "intake", char, `${char}.glb`);
  const asset = join(ROOT, "render3d", "assets", char, `${char}.glb`);
  const path = args.includes("--intake") || !existsSync(asset) ? intake : asset;
  const { json: gltf, bin } = readGlb(path);
  const prim = gltf.meshes[0].primitives[0];
  const weightAcc = gltf.accessors[prim.attributes.WEIGHTS_0];
  if (weightAcc.componentType !== 5126) throw new Error(`${char}: WEIGHTS_0 is not float`);

  const skeleton = skeletonOf(gltf);
  const arms = skeleton.names.map((_, j) => under(skeleton, j, ARM_ROOTS));
  const upper = skeleton.names.map((_, j) => under(skeleton, j, ABOVE_THE_SHOULDER));
  const hipJoint = skeleton.index.get("Hips");
  if (hipJoint === undefined) throw new Error(`${char}: no Hips — is this the standard skeleton?`);
  const hipY = skeleton.position[hipJoint][1];

  const position = await readAccessor(gltf, bin, prim.attributes.POSITION);
  const joints = await readAccessor(gltf, bin, prim.attributes.JOINTS_0);
  const weights = await readAccessor(gltf, bin, prim.attributes.WEIGHTS_0);
  const count = position.length / 3;

  const bytes = Buffer.from(bin);
  const view = gltf.bufferViews[weightAcc.bufferView];
  const base = (view.byteOffset || 0) + (weightAcc.byteOffset || 0);
  const stride = view.byteStride || 16;

  let touched = 0, cut = 0, worst = 0;
  for (let v = 0; v < count; v++) {
    const w = [0, 1, 2, 3].map((k) => weights[v * 4 + k]);
    const j = [0, 1, 2, 3].map((k) => joints[v * 4 + k]);
    let best = 0;
    for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
    if (arms[j[best]] || upper[j[best]]) continue;   // the arm's, or the chest's
    let changed = 0;
    for (let k = 0; k < 4; k++) {
      if (k === best || !w[k] || !arms[j[k]]) continue;
      changed += w[k];
      w[k] = 0;
      cut++;
    }
    if (!changed) continue;
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 1e-6) continue;              // cutting it all would unbind it
    worst = Math.max(worst, changed);
    touched++;
    if (!APPLY) continue;
    for (let k = 0; k < 4; k++) bytes.writeFloatLE(w[k] / total, base + v * stride + k * 4);
  }

  if (APPLY && touched) writeGlb(path, gltf, bytes);
  return { path, touched, cut, worst, hipY };
}

if (!charKey) {
  console.log("usage: prune_hem_weights.mjs <char> [--apply] [--intake]");
  process.exit(2);
}
const r = await prune(charKey);
if (!r.touched) {
  console.log(`${charKey}: no arm weight below the shoulder line — nothing to cut`);
} else {
  console.log(`${charKey}: ${r.touched} vertices below the shoulder line re-weighted,`
    + ` ${r.cut} arm influences removed (worst carried ${(r.worst * 100).toFixed(0)}% of a vertex)`);
  console.log(APPLY ? `  wrote ${r.path.replace(ROOT + "/", "")}` : "  dry run — pass --apply to write it");
}
