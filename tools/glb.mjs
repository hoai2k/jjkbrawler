// Reading and writing a .glb by hand, for the tools that edit deliveries.
//
// ONE READER. The Python side already works this way — `audit_arm_drag.py`
// owns the reader and `prune_arm_weights.py` imports it, so a fix to how a
// buffer is addressed lands once — and this is that module for the Node side.
// Before it there was one parser inside the intake validator, a second in
// `bake_yaw.mjs`, and a third being written for the D7 conform; the third is
// what turned "each tool reads a bit of the container" into "the container is
// read here".
//
// It is deliberately NOT a glTF library. It knows the things this repo's
// deliveries actually are — one buffer, one mesh, a skinned body, TRS nodes —
// and it throws on the rest rather than pretending. Nothing here loads
// three.js: a tool that needs a real scene graph drives a browser
// (`bake_model_fixes.mjs`), and a tool that needs to change sixteen numbers in
// a JSON chunk should not have to.
//
// The matrix helpers are here for the same reason. glTF is column-major and so
// is three.js, so a matrix read out of a file, one built here and one printed
// by the engine are the same sixteen numbers in the same order — which is what
// makes a bake verifiable against the thing it baked.

import { readFileSync, writeFileSync } from "fs";

const MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const COMPONENTS_PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Split a .glb into its glTF JSON and its binary chunk. */
export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.readUInt32LE(0) !== MAGIC) {
    throw new Error(`${path}: not a .glb (bad magic) — deliveries are glTF 2.0 BINARY`);
  }
  let at = 12, json = null, bin = null;
  while (at + 8 <= buf.length) {
    const length = buf.readUInt32LE(at);
    const type = buf.readUInt32LE(at + 4);
    const chunk = buf.subarray(at + 8, at + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(chunk.toString("utf8"));
    else if (type === CHUNK_BIN) bin = chunk;
    at += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error(`${path}: no JSON chunk`);
  return { json, bin };
}

/** Assemble a .glb from a glTF JSON and one binary blob. */
export function writeGlb(path, json, bin) {
  const text = Buffer.from(JSON.stringify(json), "utf8");
  const textPad = (4 - (text.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + text.length + textPad + 8 + bin.length + binPad;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let at = 12;
  out.writeUInt32LE(text.length + textPad, at);
  out.writeUInt32LE(CHUNK_JSON, at + 4);
  text.copy(out, at + 8);
  out.fill(0x20, at + 8 + text.length, at + 8 + text.length + textPad);
  at += 8 + text.length + textPad;
  out.writeUInt32LE(bin.length + binPad, at);
  out.writeUInt32LE(CHUNK_BIN, at + 4);
  bin.copy(out, at + 8);
  writeFileSync(path, out);
  return out.length;
}

/**
 * A buffer view's bytes.
 *
 * `decoder` is meshoptimizer's, passed in rather than imported: a delivery run
 * through gltfpack stores its views compressed, and the ONE tool that meets
 * such a file (conform_delivery.mjs) is the one that should pay for loading a
 * WASM decoder. Everything else reads plain containers and gets a clear error
 * instead of a silent buffer of noise.
 */
export async function viewBytes(gltf, bin, index, decoder = null) {
  const view = gltf.bufferViews[index];
  const packed = view.extensions?.EXT_meshopt_compression;
  if (!packed) {
    return Buffer.from(bin.buffer, bin.byteOffset + (view.byteOffset || 0), view.byteLength);
  }
  if (!decoder) {
    throw new Error("buffer view is EXT_meshopt_compression and no decoder was given"
      + " — run tools/conform_delivery.mjs on this file first");
  }
  await decoder.ready;
  const src = new Uint8Array(bin.buffer, bin.byteOffset + (packed.byteOffset || 0), packed.byteLength);
  const out = new Uint8Array(packed.count * packed.byteStride);
  decoder.decodeGltfBuffer(out, packed.count, packed.byteStride, src,
    packed.mode, packed.filter || "NONE");
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

/** An accessor as a typed array, de-interleaved, in its own component type. */
export async function readAccessor(gltf, bin, index, decoder = null) {
  const acc = gltf.accessors[index];
  const n = COMPONENTS_PER[acc.type];
  const TypedArray = COMPONENT[acc.componentType];
  if (!TypedArray) throw new Error(`accessor ${index}: component type ${acc.componentType}`);
  const bytes = await viewBytes(gltf, bin, acc.bufferView, decoder);
  const view = gltf.bufferViews[acc.bufferView];
  const stride = view.byteStride || n * TypedArray.BYTES_PER_ELEMENT;
  const out = new TypedArray(acc.count * n);
  for (let i = 0; i < acc.count; i++) {
    const at = (acc.byteOffset || 0) + i * stride;
    out.set(new TypedArray(bytes.buffer, bytes.byteOffset + at, n), i * n);
  }
  return out;
}

/** Normalised integers to floats, per the glTF component rules. */
export function denormalise(array, componentType) {
  if (componentType === 5126) return Float32Array.from(array);
  const max = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[componentType];
  const signed = componentType === 5120 || componentType === 5122;
  const out = new Float32Array(array.length);
  for (let i = 0; i < array.length; i++) {
    out[i] = signed ? Math.max(array[i] / max, -1) : array[i] / max;
  }
  return out;
}

// ------------------------------------------------------------------ mat4, 4x4

export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
        + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function fromTRS(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

/** Inverse of a RIGID matrix — rotation and translation, no scale. Every
 *  matrix these tools build is one, because a delivery's scale is baked into
 *  its vertices rather than left on a node. */
export function invertRigid(m) {
  const out = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  const t = [m[12], m[13], m[14]];
  out[12] = -(out[0] * t[0] + out[4] * t[1] + out[8] * t[2]);
  out[13] = -(out[1] * t[0] + out[5] * t[1] + out[9] * t[2]);
  out[14] = -(out[2] * t[0] + out[6] * t[1] + out[10] * t[2]);
  return out;
}

/** The rotation half of a rigid matrix, as a quaternion. */
export function quatOf(m) {
  const [m00, m10, m20] = [m[0], m[1], m[2]];
  const [m01, m11, m21] = [m[4], m[5], m[6]];
  const [m02, m12, m22] = [m[8], m[9], m[10]];
  const trace = m00 + m11 + m22;
  let s, q;
  if (trace > 0) {
    s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const n = Math.hypot(...q);
  return q.map((v) => v / n);
}

/** A point through a matrix. */
export const applyMat = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];

/**
 * Every node's world matrix, by node index.
 *
 * `onNode` sees each node before it is composed, which is where a tool refuses
 * what it cannot handle (a baked `matrix`, a scaled joint) with a name in the
 * message rather than a wrong answer twenty lines later.
 */
export function worldMatrices(gltf, onNode = null) {
  const world = new Map();
  const walk = (index, parent) => {
    const node = gltf.nodes[index];
    if (onNode) onNode(node, index);
    const m = mul(parent, fromTRS(node.translation, node.rotation, node.scale));
    world.set(index, m);
    for (const child of node.children || []) walk(child, m);
  };
  for (const root of gltf.scenes[gltf.scene || 0].nodes) walk(root, identity());
  return world;
}

/** Where each of a skin's joints sits in the world, and what hangs off it —
 *  the two facts every "how far is this vertex from its bone" question needs. */
export function skeletonOf(gltf, world = worldMatrices(gltf)) {
  const skin = gltf.skins[0];
  const names = skin.joints.map((n) => gltf.nodes[n].name || "");
  const position = skin.joints.map((n) => {
    const m = world.get(n);
    return [m[12], m[13], m[14]];
  });
  const index = new Map(names.map((n, j) => [n, j]));
  const children = names.map(() => []);
  skin.joints.forEach((node, j) => {
    for (const child of gltf.nodes[node].children || []) {
      const k = skin.joints.indexOf(child);
      if (k >= 0) children[j].push(k);
    }
  });
  return { skin, names, position, children, index, world };
}

/** How far a point sits from a bone — the bone being the segment from its own
 *  head to its children's, which is what a bone actually is; a leaf bone is
 *  just its head. Skin lies along that segment, and a prop bound by proximity
 *  does not, which is the whole of what the callers are asking. */
export function distanceToBone(skeleton, point, joint) {
  const a = skeleton.position[joint];
  const kids = skeleton.children[joint];
  if (!kids.length) return Math.hypot(point[0] - a[0], point[1] - a[1], point[2] - a[2]);
  let best = Infinity;
  for (const k of kids) {
    const b = skeleton.position[k];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];
    const len = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    let t = len ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t));
  }
  return best;
}
