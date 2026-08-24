#!/usr/bin/env node
// A WEAPON IS NOT SKIN. Put the one in the fighter's hand on its own bone.
//
//   node tools/rigidify_prop.mjs <char>            # what it would take
//   node tools/rigidify_prop.mjs <char> --apply    # write the .glb
//   node tools/rigidify_prop.mjs <char> --apply --radius 0.05 --intake
//
// A generated fighter arrives holding their weapon as PART OF THE BODY MESH,
// skinned the way an arm is: Nobara's hammer came back weighted across her
// hand, her forearm and the twist bone between them, in the same graded
// falloff the generator gives a wrist. Skin is supposed to do that. A hammer
// is not — a claw hammer is one rigid object, and skinning it to three bones
// with a blend between them means the head lags the shaft through a swing and
// the whole thing BENDS on the follow-through. It reads as rubber, and no clip
// can fix it, because the clip is turning the bones correctly.
//
// So this finds the weapon and binds it, whole, to a single bone:
//
//   * `Prop_Main` (the name render3d/src/props.js and the intake validator
//     both look for), parented to the hand the roster table says holds it, and
//     placed exactly at that hand — so the weapon does not move by a
//     micrometre, it just stops being able to deform;
//   * every vertex of the weapon at weight 1.0 on that bone, which is what
//     "rigid" means in a skin: one bone, full weight, no blend to argue with.
//
// It also lets the engine's prop layers see the weapon at all. `applyCarry`
// (ik.js) swings a carried weapon down and back through a run, and
// `fitPropShaft` measures which way it points FROM THE SKIN BOUND TO THE PROP
// BONE — with the hammer bound to the hand there is nothing on the bone to
// measure, so the layer silently did nothing on every fighter whose weapon
// arrived fused.
//
// HOW THE WEAPON IS FOUND, since it is one connected surface with the body and
// no amount of topology will separate them:
//
//   1. SEED. Skin sits close to the bone that owns it — a sleeve is a few
//      centimetres off its forearm. A weapon bound by proximity does not: the
//      hammer's head is 0.28 m from the hand it was given to, on a 1.6 m
//      fighter, where skin tops out around a tenth of stature. That threshold
//      (`--off-bone`, 0.11 of height, the same one blender_conform.py's
//      `rescue: "offBone"` uses) run over the hand chain alone finds the head
//      of the weapon and the fingertips, and nothing else.
//   2. AXIS. The seeded vertex furthest from the hand is the weapon's far end,
//      and the line from the hand to it is the weapon's axis. On Nobara that
//      line measures 0.28 m against the 0.28 m `props.js` declares for the
//      grip-to-head of her hammer (0.80 of 0.35 m), which is the check that
//      the right thing was found.
//   3. A SHAFT AND A HEAD, not one capsule. A hammer is thin for most of its
//      length and then abruptly is not, so a single radius either slices the
//      claw off or swallows the fist. The seeds say where the head starts (how
//      far along the axis the off-bone vertices begin) and how wide it is (how
//      far off the axis they reach); everything inside that profile — `--radius`
//      around the shaft, the measured head radius past the head line — is the
//      weapon. The fingers that close around the shaft are the one legitimate
//      catch, and they are already rigid with the hand in any pose worth
//      drawing.
//
// It is per-character and it is opt-in — `props.js` says which fighters carry
// what, and nothing here guesses. A fighter whose weapon is a separate mesh on
// a prop bone already (the ones that went through blender_attach_prop.py) is
// reported as needing nothing.

import { existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  readGlb, writeGlb, readAccessor, skeletonOf, worldMatrices,
  distanceToBone, invertRigid, quatOf, mul,
} from "./glb.mjs";
import { CHARACTER_PROPS } from "../render3d/src/props.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const RADIUS = flag("--radius", 0.045);
const OFF_BONE = flag("--off-bone", 0.11);
const charKey = args.find((a) => !a.startsWith("--") && Number.isNaN(Number(a)));

/** Every joint in a hand's chain: the hand and anything hanging off it. */
function handChain(skeleton, handName) {
  const start = skeleton.index.get(handName);
  if (start === undefined) return null;
  const out = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const child of skeleton.children[stack.pop()]) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

async function rigidify(char) {
  const spec = (CHARACTER_PROPS[char] || []).find((p) => p.hand);
  if (!spec) throw new Error(`${char} carries no held prop in props.js`);

  const intake = join(ROOT, "render3d", "intake", char, `${char}.glb`);
  const asset = join(ROOT, "render3d", "assets", char, `${char}.glb`);
  const path = args.includes("--intake") || !existsSync(asset) ? intake : asset;
  const { json: gltf, bin } = readGlb(path);
  const prim = gltf.meshes[0].primitives[0];

  const world = worldMatrices(gltf);
  const skeleton = skeletonOf(gltf, world);
  if (skeleton.index.has(spec.bone)) {
    return { path, already: true, bone: spec.bone };
  }
  const chain = handChain(skeleton, spec.hand);
  if (!chain) throw new Error(`${char}: no ${spec.hand} to hang ${spec.bone} from`);

  const position = await readAccessor(gltf, bin, prim.attributes.POSITION);
  const joints = await readAccessor(gltf, bin, prim.attributes.JOINTS_0);
  const weights = await readAccessor(gltf, bin, prim.attributes.WEIGHTS_0);
  if (gltf.accessors[prim.attributes.WEIGHTS_0].componentType !== 5126) {
    throw new Error(`${char}: WEIGHTS_0 is not float — conform the delivery first`);
  }
  const count = position.length / 3;
  let height = 0;
  for (let v = 0; v < count; v++) height = Math.max(height, position[v * 3 + 1]);

  const hand = skeleton.position[skeleton.index.get(spec.hand)];
  const at = (v) => [position[v * 3], position[v * 3 + 1], position[v * 3 + 2]];
  const dominant = (v) => {
    let best = -1, top = 0;
    for (let k = 0; k < 4; k++) {
      if (weights[v * 4 + k] > top) { top = weights[v * 4 + k]; best = joints[v * 4 + k]; }
    }
    return best;
  };

  // 1 + 2: the far end of whatever the hand is holding.
  let tip = null, tipAt = 0;
  const seeds = [];
  for (let v = 0; v < count; v++) {
    const j = dominant(v);
    if (!chain.has(j)) continue;
    const p = at(v);
    if (distanceToBone(skeleton, p, j) < OFF_BONE * height) continue;
    seeds.push(v);
    const reach = Math.hypot(p[0] - hand[0], p[1] - hand[1], p[2] - hand[2]);
    if (reach > tipAt) { tipAt = reach; tip = p; }
  }
  if (!tip) {
    return { path, nothing: true, bone: spec.bone, seeds: seeds.length };
  }

  // 3: the weapon's own profile — a thin shaft out of the hand, then whatever
  // the head turns out to be, both measured off the seeds rather than assumed.
  const axis = [tip[0] - hand[0], tip[1] - hand[1], tip[2] - hand[2]];
  const axisLen = Math.hypot(...axis) || 1;
  const unit = axis.map((c) => c / axisLen);
  const cyl = (p) => {
    const rel = [p[0] - hand[0], p[1] - hand[1], p[2] - hand[2]];
    const along = rel[0] * unit[0] + rel[1] * unit[1] + rel[2] * unit[2];
    const off = Math.hypot(rel[0] - unit[0] * along, rel[1] - unit[1] * along,
      rel[2] - unit[2] * along);
    return { along, off };
  };
  let headFrom = axisLen, headRadius = RADIUS;
  for (const v of seeds) {
    const { along, off } = cyl(at(v));
    headFrom = Math.min(headFrom, along);
    headRadius = Math.max(headRadius, off);
  }
  const taken = [];
  for (let v = 0; v < count; v++) {
    const { along, off } = cyl(at(v));
    if (along < 0 || along > axisLen + headRadius) continue;
    if (off > (along >= headFrom ? headRadius : RADIUS)) continue;
    taken.push(v);
  }

  // `--dump` writes the selection out as vertex indices, which is how it gets
  // LOOKED AT: the workbench and any three.js page can draw them as points
  // over the model, and "the capsule took the hammer and four fingertips" is a
  // claim somebody should be able to check rather than take on trust.
  const dumpAt = args.indexOf("--dump");
  if (dumpAt >= 0) writeFileSync(args[dumpAt + 1], JSON.stringify(taken));

  const report = {
    path, bone: spec.bone, hand: spec.hand, kind: spec.kind,
    seeds: seeds.length, taken: taken.length,
    lengthM: axisLen, declaredM: spec.lengthM, radius: RADIUS,
    headFrom, headRadius,
  };
  if (!APPLY) return report;

  // --- the bone, at the hand, carrying no transform of its own
  const handNode = skeleton.skin.joints[skeleton.index.get(spec.hand)];
  const propNode = gltf.nodes.length;
  gltf.nodes.push({ name: spec.bone, translation: [0, 0, 0], rotation: [0, 0, 0, 1] });
  (gltf.nodes[handNode].children ||= []).push(propNode);
  const propJoint = skeleton.skin.joints.length;
  skeleton.skin.joints.push(propNode);

  // --- the buffer: weights and joints rewritten in place, one accessor grown
  const bytes = Buffer.from(bin);
  const jointView = gltf.bufferViews[gltf.accessors[prim.attributes.JOINTS_0].bufferView];
  const weightView = gltf.bufferViews[gltf.accessors[prim.attributes.WEIGHTS_0].bufferView];
  const jointBase = (jointView.byteOffset || 0) + (gltf.accessors[prim.attributes.JOINTS_0].byteOffset || 0);
  const weightBase = (weightView.byteOffset || 0) + (gltf.accessors[prim.attributes.WEIGHTS_0].byteOffset || 0);
  if (gltf.accessors[prim.attributes.JOINTS_0].componentType !== 5121) {
    throw new Error(`${char}: JOINTS_0 is not unsigned byte — unhandled`);
  }
  if (propJoint > 255) throw new Error(`${char}: more than 255 joints — JOINTS_0 cannot name them`);
  for (const v of taken) {
    bytes.writeUInt8(propJoint, jointBase + v * 4);
    for (let k = 1; k < 4; k++) bytes.writeUInt8(0, jointBase + v * 4 + k);
    bytes.writeFloatLE(1, weightBase + v * 16);
    for (let k = 1; k < 4; k++) bytes.writeFloatLE(0, weightBase + v * 16 + k * 4);
  }

  // The inverse bind matrix for the new joint, appended to the matrices that
  // are already there — its bind pose is the hand's, because that is where the
  // bone sits.
  const ibmIndex = skeleton.skin.inverseBindMatrices;
  const old = await readAccessor(gltf, bin, ibmIndex);
  const grown = new Float32Array(old.length + 16);
  grown.set(old);
  grown.set(invertRigid(world.get(handNode)), old.length);
  const ibmBytes = Buffer.from(grown.buffer, grown.byteOffset, grown.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  const blob = Buffer.concat([bytes, Buffer.alloc(pad), ibmBytes]);
  gltf.bufferViews.push({ buffer: 0, byteOffset: bytes.length + pad, byteLength: ibmBytes.length });
  gltf.accessors.push({
    bufferView: gltf.bufferViews.length - 1, componentType: 5126,
    count: grown.length / 16, type: "MAT4",
  });
  skeleton.skin.inverseBindMatrices = gltf.accessors.length - 1;
  gltf.buffers[0].byteLength = blob.length;

  report.bytes = writeGlb(path, gltf, blob);
  return report;
}

if (!charKey) {
  console.log("usage: rigidify_prop.mjs <char> [--apply] [--radius 0.045] [--intake] [--dump sel.json]");
  process.exit(2);
}
const r = await rigidify(charKey);
const where = r.path.replace(ROOT + "/", "");
if (r.already) {
  console.log(`${charKey}: ${where} already carries ${r.bone} — nothing to do`);
} else if (r.nothing) {
  console.log(`${charKey}: nothing in the ${r.bone ? "hand" : "hand"} sits further from its bone than skin does`
    + " — no fused weapon found (is it already a separate mesh?)");
} else {
  console.log(`${charKey}: ${r.taken} vertices bound rigid to ${r.bone} under ${r.hand}`
    + ` (${r.kind}, ${r.lengthM.toFixed(2)} m tip to grip against ${r.declaredM} m declared)`);
  console.log(`  seeded from ${r.seeds} vertices further than skin ever sits from their own bone;`
    + ` shaft ${r.radius} m across the hand end, head ${r.headRadius.toFixed(3)} m`
    + ` from ${r.headFrom.toFixed(3)} m out`);
  console.log(APPLY ? `  wrote ${where}` : "  dry run — pass --apply to write it");
}
