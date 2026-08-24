#!/usr/bin/env node
// CONFORM A RAW GENERATOR EXPORT INTO A DELIVERY.
//
// The intake validator holds a .glb against the delivery spec and refuses what
// does not match (tools/billboard_intake.mjs). That is the right gate, and it
// says nothing about what to do when a delivery arrives from a generator that
// has never read the spec — which is what the D7 rebuild of Yuji, Nobara,
// Mahito and Jogo was: a Blender/Rigify export run through `gltfpack`, four
// facts wrong at once.
//
//   1. MESHOPT-COMPRESSED (EXT_meshopt_compression + KHR_mesh_quantization).
//      Not core glTF. The game's GLTFLoader would need a WASM decoder shipped
//      to every player, and every tool in here that reads a .glb by hand —
//      the validator, fill_model_holes.py, bake_glb_bind.py — reads raw
//      accessors and would see noise.
//   2. RIGIFY BONE NAMES (`DEF-upper_arm.L`). Every layer in the engine
//      addresses the standard skeleton by name (`LeftArm`), so a rig named
//      this way is not posed at all — it is drawn in its bind pose forever.
//   3. A FLAT SKELETON. gltfpack drops the joint hierarchy when a file has no
//      animations, because skinning only needs each joint's world matrix. The
//      arms come out as SIBLINGS of the spine, so turning the chest leaves
//      them behind, and no clip can fix a rig whose bones are not connected.
//   4. NORMALISED TO A UNIT CUBE, centred on the origin, at 120k–300k
//      triangles. Deliveries are real-world metres with the origin on the
//      floor between the feet, and the budget is 30k.
//
// All four are arithmetic on the container, so this is one pass over the file
// rather than a Blender round trip — same argument as tools/bake_yaw.mjs makes
// for baking a yaw: a re-export risks everything a re-encode can cost
// (materials, extras, texture re-compression) to change numbers the file can
// simply be rewritten to hold. The mesh is untouched except by the decimator,
// and the texture bytes are copied through verbatim.
//
//   node tools/conform_delivery.mjs <char>              # report, write nothing
//   node tools/conform_delivery.mjs <char> --apply      # write the delivery
//   node tools/conform_delivery.mjs <char> --apply --tris 60000
//
// The raw upload is kept beside the conformed one as `_raw.glb` (the same
// convention the D6 rebuilds used), so the delivery in `<char>.glb` is always
// reproducible from what was actually delivered:
//
//   render3d/intake/<char>/_raw.glb     what the generator handed over
//   render3d/intake/<char>/<char>.glb   what this wrote — validate/import THIS
//
// THE ONE CLIP IT DOES WRITE. The engine builds 37 of a fighter's 39 states
// out of their own sprite poses (`render3d/src/pose_clips.js`), so a delivery
// with no animations is not a fighter who cannot move. The exception is the
// STAND — `idle`, and `teeter` which aliases to it — which is deliberately not
// built: an idle is a portrait, the engine layers its own stance, arms and
// head carriage over whatever the delivery stands in, and every rig on this
// roster carries an `idle` clip for it to layer over. A rig with none falls
// through to the MANNEQUIN's idle instead, which is authored in mannequin
// space and writes an absolute hip height (`clips.js` "Hips.position") onto a
// bone whose bind is the floor: the first conformed Yuji stood 0.94 m in the
// air with his head folded into his chest. So one clip is written here, and it
// holds the delivered BIND POSE — which is exactly what "the delivery's own
// stand" means, and what the idle layers expect to find under them.
//
// WHAT IT DOES NOT DO. It does not author animation (the stand above is a
// held pose, not a performance), it does not fill holes (`tools/fill_model_holes.py`
// is a separate step and still worth running), and it does not review
// anything: the yaw, the size and the stance are dials somebody turns in the
// workbench while looking at the fighter.

import { readFileSync, existsSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { MeshoptDecoder } from "./vendor/meshoptimizer/decoder.mjs";
import { MeshoptSimplifier } from "./vendor/meshoptimizer/simplifier.mjs";
import {
  readGlb, writeGlb, viewBytes, readAccessor, denormalise,
  identity, mul, fromTRS, invertRigid, quatOf,
} from "./glb.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INTAKE = join(ROOT, "render3d", "intake");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const numArg = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const TRI_BUDGET = numArg("--tris", 30000);
const char = args.find((a) => !a.startsWith("--") && a !== String(TRI_BUDGET));

/** The delivered pelvis's name on this roster. The colon is what every other
 *  rig here carries; three.js sanitises it to `mixamorigHips`, which is the
 *  spelling the engine's fallbacks look for. */
const PELVIS = "mixamorig:Hips";

// --------------------------------------------------------------- the mapping
//
// Rigify's DEF- deformation bones onto the standard skeleton
// (tools/billboard_intake.mjs STANDARD_BONES). Only the bones a layer
// addresses are renamed; the twist segments in between (`…_arm.L.001`) keep
// their delivered names and stay in the chain, exactly as an extra bone in a
// delivered rig always has — the engine walks by name and inherits through
// whatever it does not recognise.
//
// THE HIPS ARE TWO BONES on this roster, and a delivery that makes them one is
// a fighter who floats. Every rig in render3d/assets/ carries a bone named
// exactly `Hips` parked at the FLOOR between the feet with the real pelvis
// (`mixamorig:Hips`) inside it — an exporter artifact originally, but the
// engine is built on it now: `standOnGround` moves the bone it finds under
// that name, and the pose libraries write hip height into its position track.
// Hand those layers a pelvis instead and they raise the body by the height of
// the hips — measured on the first conformed Yuji, his feet posed 0.94 m in
// the air and the workbench cropped his head off. So the floor bone is
// SYNTHESISED here (nothing is weighted to it, exactly as on the roster) and
// the delivered pelvis goes underneath it.
//
// The spine is the one judgement call, because Rigify delivers SEVEN torso
// bones for the standard skeleton's six names. It is not resolved by counting:
// `DEF-spine.004` is the bone the shoulders sit at, so that is `Spine2` by the
// only definition that matters to the engine (the arm root's parent), and
// `DEF-spine.003` becomes the unnamed intermediate. `Head` is settled by the
// skin rather than the name — the head bone is whichever one owns the
// vertices above the neck, and the tool checks that below.
const RENAME = {
  "DEF-spine": PELVIS,
  "DEF-spine.001": "Spine",
  "DEF-spine.002": "Spine1",
  "DEF-spine.004": "Spine2",
  "DEF-spine.005": "Neck",
  "DEF-spine.006": "Head",
  "DEF-shoulder.L": "LeftShoulder",
  "DEF-upper_arm.L": "LeftArm",
  "DEF-forearm.L": "LeftForeArm",
  "DEF-hand.L": "LeftHand",
  "DEF-shoulder.R": "RightShoulder",
  "DEF-upper_arm.R": "RightArm",
  "DEF-forearm.R": "RightForeArm",
  "DEF-hand.R": "RightHand",
  "DEF-thigh.L": "LeftUpLeg",
  "DEF-shin.L": "LeftLeg",
  "DEF-foot.L": "LeftFoot",
  "DEF-toe.L": "LeftToeBase",
  "DEF-thigh.R": "RightUpLeg",
  "DEF-shin.R": "RightLeg",
  "DEF-foot.R": "RightFoot",
  "DEF-toe.R": "RightToeBase",
};

// THE HIERARCHY THE ENGINE POSES, written out rather than inferred. Each entry
// is `bone: parent`; anything not named here hangs off the bone it followed in
// the delivered chain (the twist segments), and anything with no answer at all
// hangs off the Hips.
const PARENT = {
  Hips: null,
  [PELVIS]: "Hips",
  Spine: PELVIS,
  Spine1: "Spine",
  "DEF-spine.003": "Spine1",
  Spine2: "DEF-spine.003",
  Neck: "Spine2",
  Head: "Neck",
  LeftShoulder: "Spine2",
  LeftArm: "LeftShoulder",
  "DEF-upper_arm.L.001": "LeftArm",
  LeftForeArm: "DEF-upper_arm.L.001",
  "DEF-forearm.L.001": "LeftForeArm",
  LeftHand: "DEF-forearm.L.001",
  RightShoulder: "Spine2",
  RightArm: "RightShoulder",
  "DEF-upper_arm.R.001": "RightArm",
  RightForeArm: "DEF-upper_arm.R.001",
  "DEF-forearm.R.001": "RightForeArm",
  RightHand: "DEF-forearm.R.001",
  "DEF-pelvis.L": PELVIS,
  "DEF-pelvis.R": PELVIS,
  LeftUpLeg: PELVIS,
  "DEF-thigh.L.001": "LeftUpLeg",
  LeftLeg: "DEF-thigh.L.001",
  "DEF-shin.L.001": "LeftLeg",
  LeftFoot: "DEF-shin.L.001",
  LeftToeBase: "LeftFoot",
  RightUpLeg: PELVIS,
  "DEF-thigh.R.001": "RightUpLeg",
  RightLeg: "DEF-thigh.R.001",
  "DEF-shin.R.001": "RightLeg",
  RightFoot: "DEF-shin.R.001",
  RightToeBase: "RightFoot",
};

// A buffer view over `bytes`, padded to 4 and appended to `parts`. The rest of
// the container arithmetic — chunk framing, accessors, matrices — is
// tools/glb.mjs.
function pushView(views, parts, state, bytes, target) {
  const pad = (4 - (state.length % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); state.length += pad; }
  const view = { buffer: 0, byteOffset: state.length, byteLength: bytes.length };
  if (target) view.target = target;
  views.push(view);
  parts.push(bytes);
  state.length += bytes.length;
  return views.length - 1;
}

// ------------------------------------------------------------------- the pass

async function conform(charKey) {
  const dir = join(INTAKE, charKey);
  const rawPath = join(dir, "_raw.glb");
  const outPath = join(dir, `${charKey}.glb`);
  const source = existsSync(rawPath) ? rawPath : outPath;
  if (!existsSync(source)) throw new Error(`no delivery at ${source}`);

  const { json: gltf, bin } = readGlb(source);
  const nodes = gltf.nodes || [];
  const skin = gltf.skins?.[0];
  if (!skin) throw new Error("no skin — a fighter is a skinned rig");
  if (gltf.meshes?.length !== 1 || gltf.meshes[0].primitives.length !== 1) {
    throw new Error("expected one mesh of one primitive (the body); this is a different shape of file");
  }

  // --- the delivered scene, as world matrices
  const world = new Map();
  const walk = (index, parent) => {
    const node = nodes[index];
    if (node.matrix) throw new Error(`node ${node.name}: a baked matrix, not TRS — unhandled`);
    // A joint may carry a scale of 1 to within float noise (Rigify exports
    // 1.0000049 where Blender divided a bone length by itself). It is snapped
    // rather than tolerated: everything downstream inverts these matrices as
    // rigid ones, so "nearly 1" has to become 1 somewhere, and here is where
    // the difference is still measurable enough to refuse if it is real.
    const scaled = node.scale && node.scale.some((s) => Math.abs(s - 1) > 1e-4);
    if (scaled && node.mesh === undefined) {
      throw new Error(`joint ${node.name} carries scale ${node.scale} — unhandled`);
    }
    const m = mul(parent, fromTRS(node.translation, node.rotation,
      node.mesh === undefined ? [1, 1, 1] : node.scale));
    world.set(index, m);
    for (const child of node.children || []) walk(child, m);
  };
  for (const root of gltf.scenes[gltf.scene || 0].nodes) walk(root, identity());

  // --- the mesh, dequantised
  //
  // gltfpack leaves the dequantisation on the MESH NODE and folds it into the
  // inverse bind matrices, because a skinned mesh's node transform is ignored
  // by the spec. Both are thrown away here: the positions become plain metres
  // and the bind matrices are rebuilt from the skeleton below.
  const prim = gltf.meshes[0].primitives[0];
  const meshNodeIndex = nodes.findIndex((n) => n.mesh !== undefined);
  const meshNode = nodes[meshNodeIndex];
  const qScale = meshNode.scale || [1, 1, 1];
  const qOffset = meshNode.translation || [0, 0, 0];

  const posAcc = gltf.accessors[prim.attributes.POSITION];
  const rawPos = await readAccessor(gltf, bin, prim.attributes.POSITION, MeshoptDecoder);
  const vertexCount = posAcc.count;
  const position = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    for (let k = 0; k < 3; k++) position[i * 3 + k] = rawPos[i * 3 + k] * qScale[k] + qOffset[k];
  }
  const normal = denormalise(
    await readAccessor(gltf, bin, prim.attributes.NORMAL, MeshoptDecoder),
    gltf.accessors[prim.attributes.NORMAL].componentType);
  const uvAcc = gltf.accessors[prim.attributes.TEXCOORD_0];
  const uv = denormalise(await readAccessor(gltf, bin, prim.attributes.TEXCOORD_0, MeshoptDecoder), uvAcc.componentType);
  const joints = Uint8Array.from(await readAccessor(gltf, bin, prim.attributes.JOINTS_0, MeshoptDecoder));
  const weights = denormalise(
    await readAccessor(gltf, bin, prim.attributes.WEIGHTS_0, MeshoptDecoder),
    gltf.accessors[prim.attributes.WEIGHTS_0].componentType);
  let indices = Uint32Array.from(await readAccessor(gltf, bin, prim.indices, MeshoptDecoder));

  // KHR_texture_transform is how gltfpack packs UVs into the quantised range.
  // Folding it into the coordinates is what lets the extension — and the need
  // for a loader that understands it — go away.
  const baseTex = prim.material !== undefined
    ? gltf.materials[prim.material].pbrMetallicRoughness?.baseColorTexture : null;
  const xform = baseTex?.extensions?.KHR_texture_transform;
  if (xform) {
    const [sx, sy] = xform.scale || [1, 1];
    const [ox, oy] = xform.offset || [0, 0];
    for (let i = 0; i < vertexCount; i++) {
      uv[i * 2] = uv[i * 2] * sx + ox;
      uv[i * 2 + 1] = uv[i * 2 + 1] * sy + oy;
    }
  }

  // --- where the head is, checked rather than assumed
  const owner = new Map();
  for (let v = 0; v < vertexCount; v++) {
    for (let k = 0; k < 4; k++) {
      if (weights[v * 4 + k] < 0.5) continue;
      const j = joints[v * 4 + k];
      const at = owner.get(j) || { n: 0, top: -Infinity };
      at.n++;
      at.top = Math.max(at.top, position[v * 3 + 1]);
      owner.set(j, at);
    }
  }
  const headJoint = skin.joints.findIndex((n) => nodes[n].name === "DEF-spine.006");
  const topJoint = [...owner.entries()].sort((a, b) => b[1].top - a[1].top)[0][0];
  if (headJoint !== Number(topJoint)) {
    throw new Error(`the topmost skinned bone is ${nodes[skin.joints[topJoint]].name}, not DEF-spine.006 —`
      + " the spine mapping in this tool does not describe this rig");
  }

  // --- metres, and an origin on the floor between the feet
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    minY = Math.min(minY, position[i * 3 + 1]);
    maxY = Math.max(maxY, position[i * 3 + 1]);
  }
  const heightM = HEIGHTS[charKey];
  if (!heightM) throw new Error(`no canon height for ${charKey} (src/characters.js heightCm)`);
  const scale = heightM / (maxY - minY);
  const footOf = (name) => world.get(skin.joints[skin.joints.findIndex((n) => nodes[n].name === name)]);
  const feet = [footOf("DEF-foot.L"), footOf("DEF-foot.R")];
  const origin = [
    (feet[0][12] + feet[1][12]) / 2,
    minY,
    (feet[0][14] + feet[1][14]) / 2,
  ];
  // The whole delivery through one similarity transform: uniform scale about
  // the new origin. It is applied to the VERTICES and to the JOINTS' world
  // translations, and to nothing else — no node is left carrying a scale, so
  // every local transform below stays rigid and the engine meets a rig whose
  // bones are plain rotations the way a hand-built one would be.
  const place = (p) => [(p[0] - origin[0]) * scale, (p[1] - origin[1]) * scale, (p[2] - origin[2]) * scale];
  for (let i = 0; i < vertexCount; i++) {
    const p = place([position[i * 3], position[i * 3 + 1], position[i * 3 + 2]]);
    position.set(p, i * 3);
  }

  // --- the decimation
  const trisBefore = indices.length / 3;
  let error = 0;
  if (trisBefore > TRI_BUDGET) {
    await MeshoptSimplifier.ready;
    const [simplified, err] = MeshoptSimplifier.simplify(
      indices, position, 3, TRI_BUDGET * 3, 1e-2, ["LockBorder"]);
    indices = simplified;
    error = err;
  }
  // Vertices no triangle names any more go with them, which is most of them
  // after a 4x decimation and is where the file size comes back.
  const remap = new Int32Array(vertexCount).fill(-1);
  let kept = 0;
  for (const i of indices) if (remap[i] < 0) remap[i] = kept++;
  const packedPos = new Float32Array(kept * 3);
  const packedNrm = new Float32Array(kept * 3);
  const packedUv = new Float32Array(kept * 2);
  const packedJnt = new Uint8Array(kept * 4);
  const packedWgt = new Float32Array(kept * 4);
  for (let v = 0; v < vertexCount; v++) {
    const at = remap[v];
    if (at < 0) continue;
    packedPos.set(position.subarray(v * 3, v * 3 + 3), at * 3);
    packedNrm.set(normal.subarray(v * 3, v * 3 + 3), at * 3);
    packedUv.set(uv.subarray(v * 2, v * 2 + 2), at * 2);
    packedJnt.set(joints.subarray(v * 4, v * 4 + 4), at * 4);
    // Weights must sum to 1 and a u8 quantisation does not, quite; the loader
    // renormalises but the bind check below wants the arithmetic exact.
    const w = Array.from(weights.subarray(v * 4, v * 4 + 4));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    packedWgt.set(w.map((x) => x / sum), at * 4);
  }
  const packedIdx = kept > 65535 ? new Uint32Array(indices.length) : new Uint16Array(indices.length);
  for (let i = 0; i < indices.length; i++) packedIdx[i] = remap[indices[i]];

  // --- the skeleton: renamed, re-parented, and put back where it was
  //
  // Every joint keeps the WORLD transform it was delivered with (its rotation
  // untouched, its position through the same similarity as the vertices), and
  // only its parent changes. The local transform is then whatever composes to
  // that world matrix under the new parent, so the bind pose is bit-for-bit
  // the shape the generator exported — re-parenting moves nothing, it only
  // decides what follows what when a clip turns a bone.
  const nameOf = (jointIndex) => {
    const raw = nodes[skin.joints[jointIndex]].name;
    return RENAME[raw] || raw;
  };
  const jointNames = skin.joints.map((_, j) => nameOf(j));
  const byName = new Map(jointNames.map((n, j) => [n, j]));
  for (const bone of Object.keys(PARENT)) {
    if (bone !== "Hips" && !byName.has(bone)) {
      throw new Error(`the rig has no bone for "${bone}" — mapping does not fit`);
    }
  }
  const worldNew = jointNames.map((_, j) => {
    const m = world.get(skin.joints[j]).slice();
    const t = place([m[12], m[13], m[14]]);
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
    return m;
  });
  // The floor bone, appended rather than inserted so every JOINTS_0 index in
  // the mesh still names the joint it named before. It sits at the origin,
  // which after `place` IS the floor between the feet, and carries no skin.
  jointNames.push("Hips");
  byName.set("Hips", jointNames.length - 1);
  worldNew.push(identity());

  const out = {
    asset: { version: "2.0", generator: "jjkbrawler tools/conform_delivery.mjs" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [] }],
    nodes: [],
    meshes: [], skins: [], materials: [], textures: [], images: [], samplers: [],
    animations: [],
    accessors: [], bufferViews: [], buffers: [],
  };
  // Bone nodes first, in the skin's own order, so JOINTS_0 needs no remapping.
  const boneNode = jointNames.map((name) => {
    out.nodes.push({ name });
    return out.nodes.length - 1;
  });
  jointNames.forEach((name, j) => {
    // `PARENT[name]` is null for the Hips, which is the root and has no
    // parent — distinct from a bone the table does not mention, which hangs
    // off the Hips. A `??` cannot tell those apart and made the Hips its own
    // child, which is a cycle rather than a hierarchy.
    const parentName = name in PARENT ? PARENT[name] : "Hips";
    const parent = parentName === null ? null : byName.get(parentName);
    const local = parent === null || parent === undefined
      ? worldNew[j]
      : mul(invertRigid(worldNew[parent]), worldNew[j]);
    const node = out.nodes[boneNode[j]];
    node.translation = [local[12], local[13], local[14]];
    node.rotation = quatOf(local);
    if (parent !== null && parent !== undefined) {
      const p = out.nodes[boneNode[parent]];
      (p.children ||= []).push(boneNode[j]);
    }
  });

  // --- the container around it
  const parts = [];
  const state = { length: 0 };
  // `target` is the GL buffer binding, and it is named per call rather than
  // guessed from the component type: only vertex attributes and indices have
  // one. A bind matrix or an animation's keyframes are read by the loader, not
  // bound by the GPU, and the spec says to leave the hint off those.
  const ARRAY = 34962, ELEMENT = 34963;
  const acc = (bytes, componentType, type, count, extras = {}, target = null) => {
    const view = pushView(out.bufferViews, parts, state, bytes, target);
    out.accessors.push({ bufferView: view, componentType, count, type, ...extras });
    return out.accessors.length - 1;
  };
  const buf = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < kept; i++) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], packedPos[i * 3 + k]);
      max[k] = Math.max(max[k], packedPos[i * 3 + k]);
    }
  }
  const aPos = acc(buf(packedPos), 5126, "VEC3", kept, { min, max }, ARRAY);
  const aNrm = acc(buf(packedNrm), 5126, "VEC3", kept, {}, ARRAY);
  const aUv = acc(buf(packedUv), 5126, "VEC2", kept, {}, ARRAY);
  const aJnt = acc(buf(packedJnt), 5121, "VEC4", kept, {}, ARRAY);
  const aWgt = acc(buf(packedWgt), 5126, "VEC4", kept, {}, ARRAY);
  const aIdx = acc(buf(packedIdx), packedIdx.BYTES_PER_ELEMENT === 4 ? 5125 : 5123,
    "SCALAR", packedIdx.length, {}, ELEMENT);

  // The inverse bind matrices ARE the bind pose, so they are the inverse of
  // the world matrices above — no other reading of them survives a re-parent.
  const ibm = new Float32Array(jointNames.length * 16);
  jointNames.forEach((_, j) => ibm.set(invertRigid(worldNew[j]), j * 16));
  const aIbm = acc(buf(ibm), 5126, "MAT4", jointNames.length);

  // The texture travels as the bytes it arrived as. Re-encoding a base colour
  // map is a quality loss for nothing, and the metallic-roughness map the
  // generator ships is dropped: the anime pass replaces every delivered
  // material with a toon one (render3d/src/toon.js), so it is a megabyte
  // nothing reads.
  const texIndex = baseTex?.index;
  if (texIndex !== undefined) {
    const image = gltf.images[gltf.textures[texIndex].source];
    const bytes = await viewBytes(gltf, bin, image.bufferView, MeshoptDecoder);
    const view = pushView(out.bufferViews, parts, state, Buffer.from(bytes));
    out.bufferViews[view].name = "baseColor";
    out.images.push({ name: image.name || `${charKey}_color`, mimeType: image.mimeType, bufferView: view });
    out.samplers.push({ magFilter: 9729, minFilter: 9987 });
    out.textures.push({ sampler: 0, source: 0 });
  }
  out.materials.push({
    name: `${charKey}_material`,
    pbrMetallicRoughness: {
      ...(texIndex !== undefined ? { baseColorTexture: { index: 0 } } : {}),
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
  });

  out.meshes.push({
    name: `${charKey}_mesh`,
    primitives: [{
      attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv, JOINTS_0: aJnt, WEIGHTS_0: aWgt },
      indices: aIdx,
      material: 0,
    }],
  });
  // The stand, held: two keys a second apart on every joint's bind rotation.
  // A clip that changes nothing is the point — `poseRig` restores the bind and
  // then plays this, so the fighter stands exactly as delivered and the idle
  // layers (stance, arms, head carriage) compose over it.
  const times = Float32Array.from([0, 1]);
  const aTimes = acc(buf(times), 5126, "SCALAR", 2, { min: [0], max: [1] });
  const samplers = [];
  const channels = [];
  jointNames.forEach((name, j) => {
    const q = out.nodes[boneNode[j]].rotation;
    const held = Float32Array.from([...q, ...q]);
    const output = acc(buf(held), 5126, "VEC4", 2);
    samplers.push({ input: aTimes, interpolation: "LINEAR", output });
    channels.push({ sampler: samplers.length - 1, target: { node: boneNode[j], path: "rotation" } });
  });
  out.animations = [{ name: "idle", samplers, channels }];

  out.skins.push({ name: "Armature", inverseBindMatrices: aIbm, joints: boneNode, skeleton: boneNode[byName.get("Hips")] });
  out.nodes.push({ name: `${charKey}_body`, mesh: 0, skin: 0 });
  const bodyNode = out.nodes.length - 1;
  out.nodes.push({ name: "Armature", children: [bodyNode, boneNode[byName.get("Hips")]] });
  out.scenes[0].nodes = [out.nodes.length - 1];
  out.buffers.push({ byteLength: parts.reduce((n, p) => n + p.length, 0) });

  // Buffer length has to count the padding pushView will add, so it is
  // recomputed from what the writer actually concatenates.
  const report = {
    source, outPath,
    heightM, scale,
    trisBefore, trisAfter: packedIdx.length / 3, error,
    vertsBefore: vertexCount, vertsAfter: kept,
    bones: jointNames.length, clips: 1,
  };
  if (!APPLY) return report;

  if (source !== rawPath) renameSync(source, rawPath);
  const bytes = Buffer.concat(parts);
  out.buffers[0].byteLength = bytes.length;
  report.bytes = writeGlb(outPath, out, bytes);
  return report;
}

// The canon heights, read from the roster rather than typed in — a delivery is
// scaled to what the CHARACTER is, not to what the generator's bounding box
// happened to be (it normalises every model to a unit cube).
const HEIGHTS = await (async () => {
  const src = readFileSync(join(ROOT, "src", "characters.js"), "utf8");
  const out = {};
  const re = /^\s{2}(\w+):\s*\{([\s\S]*?)^\s{2}\},/gm;
  for (const m of src.matchAll(re)) {
    const cm = /heightCm:\s*([\d.]+)/.exec(m[2]);
    if (cm) out[m[1]] = Number(cm[1]) / 100;
  }
  return out;
})();

if (!char) {
  console.log("usage: conform_delivery.mjs <char> [--apply] [--tris 30000]");
  process.exit(2);
}
const r = await conform(char);
console.log(`${char}: ${r.vertsBefore} verts / ${Math.round(r.trisBefore)} tris`
  + ` -> ${r.vertsAfter} verts / ${Math.round(r.trisAfter)} tris`
  + (r.error ? ` (decimation error ${(r.error * 100).toFixed(2)}%)` : " (under budget, left alone)"));
console.log(`  scaled ${r.scale.toFixed(4)}x to ${r.heightM.toFixed(2)}m, origin on the floor between the feet`);
console.log(`  ${r.bones} bones renamed onto the standard skeleton and re-parented`);
console.log(APPLY
  ? `  wrote ${r.outPath.replace(ROOT + "/", "")} (${(r.bytes / 1048576).toFixed(1)} MB); raw kept as _raw.glb`
  : "  dry run — pass --apply to write it");
