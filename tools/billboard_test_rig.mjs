#!/usr/bin/env node
// Build a tiny but VALID .glb delivery and drop it in billboards/intake/ —
// the fixture that lets the whole delivery pipeline (validate -> import ->
// approve -> load -> draw) be exercised with no art commissioned. The smoke
// test uses it; run it by hand to try the intake flow end to end.
//
//   node tools/billboard_test_rig.mjs <char> [outPath]
//
// The rig is the standard skeleton (correct bone names and heights, so
// validation and retargeting are honestly tested), one box of a body hung on
// the Hips, and three named clips — idle, light, run — so the imported
// character exercises every clip-resolution branch: own clip (idle/light/run),
// and default-set fallback (everything else).
//
// It is NOT a mannequin replacement: it exists to prove plumbing, and looks
// like the box it is.

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const char = process.argv[2];
if (!char) {
  console.log("usage: billboard_test_rig.mjs <char> [outPath]");
  process.exit(2);
}
const out = process.argv[3] || join(ROOT, "billboards", "intake", char, `${char}.glb`);

const H = 1.75;
// Same proportions as the mannequin's skeleton (billboards/src/mannequin.js).
const BONES = [
  ["Hips", null, [0, 0.530 * H, 0]],
  ["Spine", "Hips", [0, 0.050 * H, 0]],
  ["Spine1", "Spine", [0, 0.070 * H, 0]],
  ["Spine2", "Spine1", [0, 0.070 * H, 0]],
  ["Neck", "Spine2", [0, 0.110 * H, 0]],
  ["Head", "Neck", [0, 0.030 * H, 0]],
  ["LeftShoulder", "Spine2", [0.060 * H, 0.080 * H, 0]],
  ["LeftArm", "LeftShoulder", [0.040 * H, 0, 0]],
  ["LeftForeArm", "LeftArm", [0.160 * H, 0, 0]],
  ["LeftHand", "LeftForeArm", [0.140 * H, 0, 0]],
  ["RightShoulder", "Spine2", [-0.060 * H, 0.080 * H, 0]],
  ["RightArm", "RightShoulder", [-0.040 * H, 0, 0]],
  ["RightForeArm", "RightArm", [-0.160 * H, 0, 0]],
  ["RightHand", "RightForeArm", [-0.140 * H, 0, 0]],
  ["LeftUpLeg", "Hips", [0.055 * H, -0.010 * H, 0]],
  ["LeftLeg", "LeftUpLeg", [0, -0.240 * H, 0]],
  ["LeftFoot", "LeftLeg", [0, -0.230 * H, 0]],
  ["RightUpLeg", "Hips", [-0.055 * H, -0.010 * H, 0]],
  ["RightLeg", "RightUpLeg", [0, -0.240 * H, 0]],
  ["RightFoot", "RightLeg", [0, -0.230 * H, 0]],
];

// ------------------------------------------------------------ binary buffer
// A 0.4 x 1.0 x 0.25 box, origin at its base, hung on the Hips (so it rides
// the idle sway), plus keyframe data for the three clips.
const w = 0.2, d = 0.125, h0 = -0.55, h1 = 0.45;
const positions = [];
for (const y of [h0, h1]) for (const z of [-d, d]) for (const x of [-w, w]) positions.push(x, y, z);
const indices = [0,1,2, 1,3,2, 4,6,5, 5,6,7, 0,4,1, 1,4,5, 2,3,6, 3,7,6, 0,2,4, 2,6,4, 1,5,3, 3,7,5];

const times = [0, 0.9];
const quats = [0, 0, 0, 1, 0.06, 0, 0, 0.998];

const posBytes = new Float32Array(positions);
const idxBytes = new Uint16Array(indices);
const timeBytes = new Float32Array(times);
const quatBytes = new Float32Array(quats);

const pad4 = (n) => (n + 3) & ~3;
const parts = [posBytes, idxBytes, timeBytes, quatBytes].map((a) => Buffer.from(a.buffer));
const offsets = [];
let off = 0;
for (const p of parts) {
  offsets.push(off);
  off = pad4(off + p.length);
}
const bin = Buffer.alloc(off);
parts.forEach((p, i) => p.copy(bin, offsets[i]));

// ------------------------------------------------------------------- gltf
const spine2 = BONES.findIndex(([n]) => n === "Spine2");
const nodes = BONES.map(([name, , pos]) => ({ name, translation: pos }));
nodes.push({ name: `${char}_body`, mesh: 0 });
BONES.forEach(([, parent], i) => {
  if (!parent) return;
  const pi = BONES.findIndex(([n]) => n === parent);
  nodes[pi].children = nodes[pi].children || [];
  nodes[pi].children.push(i);
});
nodes[0].children = nodes[0].children || [];
nodes[0].children.push(nodes.length - 1); // body on the Hips

const minY = Math.min(...positions.filter((_, i) => i % 3 === 1));
const maxY = Math.max(...positions.filter((_, i) => i % 3 === 1));

const animation = (name) => ({
  name,
  samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }],
  channels: [{ sampler: 0, target: { node: spine2, path: "rotation" } }],
});

const gltf = {
  asset: { version: "2.0", generator: "billboard_test_rig.mjs" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes,
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3",
      // LOCAL bounds, as glTF requires — the box's own space. The validator
      // walks the node hierarchy and adds the Hips translation itself, so
      // pre-baking that offset here would count it twice.
      min: [-w, minY, -d], max: [w, maxY, d] },
    { bufferView: 1, componentType: 5123, count: indices.length, type: "SCALAR" },
    { bufferView: 2, componentType: 5126, count: times.length, type: "SCALAR", min: [0], max: [0.9] },
    { bufferView: 3, componentType: 5126, count: quats.length / 4, type: "VEC4" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: offsets[0], byteLength: parts[0].length },
    { buffer: 0, byteOffset: offsets[1], byteLength: parts[1].length },
    { buffer: 0, byteOffset: offsets[2], byteLength: parts[2].length },
    { buffer: 0, byteOffset: offsets[3], byteLength: parts[3].length },
  ],
  buffers: [{ byteLength: bin.length }],
  animations: [animation("idle"), animation("light"), animation("run")],
};

// ------------------------------------------------------------------- glb
let json = Buffer.from(JSON.stringify(gltf));
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jsonHdr = Buffer.alloc(8);
jsonHdr.writeUInt32LE(json.length, 0);
jsonHdr.writeUInt32LE(0x4e4f534a, 4);
const binHdr = Buffer.alloc(8);
binHdr.writeUInt32LE(bin.length, 0);
binHdr.writeUInt32LE(0x004e4942, 4);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, jsonHdr, json, binHdr, bin]));
console.log(`wrote ${out} (${12 + 8 + json.length + 8 + bin.length} bytes) — validate/import with tools/billboard_intake.mjs`);
