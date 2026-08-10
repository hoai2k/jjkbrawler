#!/usr/bin/env node
// Intake for billboard rigs — the .glb pipeline, deliberately SEPARATE from
// the sprite intake (tools/intake.py). Different formats, different checks,
// different failure modes: a sprite intake cuts alpha off a key screen; this
// one reads a glTF container and holds it against the delivery spec in
// billboards/docs/asset-requests.md.
//
// The flow mirrors the sprite one in shape only:
//
//   billboards/intake/<char>/<char>.glb        where deliveries land
//     -> validate     hold it against the spec (pure read, run it freely)
//     -> import       copy into billboards/assets/<char>/, register in the
//                     manifest with approved: false
//     -> (billboard workbench: review each clip, export a payload)
//     -> apply        merge the workbench payload (inheritance, approvals)
//     -> approve      shortcut: flip a character's approved flag directly
//
//   node tools/billboard_intake.mjs validate <char>
//   node tools/billboard_intake.mjs import <char>
//   node tools/billboard_intake.mjs approve <char> | revoke <char>
//   node tools/billboard_intake.mjs apply <payload.json>
//   node tools/billboard_intake.mjs list
//   node tools/billboard_intake.mjs check     # manifest sanity, for npm run check
//
// No three.js here: a .glb's JSON chunk carries everything validation needs
// (node names, animation names and durations, accessor bounds for height),
// and reading it directly keeps the tool dependency-free like the rest of
// tools/.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INTAKE = join(ROOT, "billboards", "intake");
const ASSETS = join(ROOT, "billboards", "assets");
const MANIFEST = join(ASSETS, "manifest.json");
const STATES_JS = join(ROOT, "billboards", "src", "states.js");
const PROPS_JS = join(ROOT, "billboards", "src", "props.js");

// ------------------------------------------------------------- shared bits

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}
function writeManifest(man) {
  writeFileSync(MANIFEST, JSON.stringify(man, null, 2) + "\n");
}

/** The clip states, read out of states.js rather than duplicated here —
 *  states.js is the single source of the list and says so. */
function clipStates() {
  const src = readFileSync(STATES_JS, "utf8");
  const body = /export const STATES = \{([\s\S]*?)\n\};/.exec(src)?.[1] || "";
  const names = [...body.matchAll(/^  ([A-Za-z_]\w*):/gm)].map((m) => m[1]);
  if (!names.length) throw new Error("could not parse STATES out of billboards/src/states.js");
  return names.filter((n) => n !== "dodge");
}

/** Prop/chain expectations per character, read out of props.js the same way. */
function expectations() {
  const src = readFileSync(PROPS_JS, "utf8");
  const grab = (name) => {
    const m = new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(src)?.[1] || "";
    const out = {};
    for (const row of m.matchAll(/^  (\w+):\s*\[([\s\S]*?)\],?$/gm)) {
      out[row[1]] = row[2];
    }
    return out;
  };
  return { props: grab("CHARACTER_PROPS"), chains: grab("CHARACTER_CHAINS") };
}

const STANDARD_BONES = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
];

/** Parse a .glb container far enough to validate: the embedded glTF JSON. */
function readGlbJson(path) {
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error("not a .glb (bad magic) — deliveries must be glTF 2.0 BINARY");
  }
  if (buf.readUInt32LE(4) !== 2) throw new Error(`glTF container version ${buf.readUInt32LE(4)}, need 2`);
  const chunkLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  return JSON.parse(buf.subarray(20, 20 + chunkLen).toString("utf8"));
}

function intakePath(char) {
  return join(INTAKE, char, `${char}.glb`);
}

/** Validation proper. Returns { errors, warnings, info } — errors block
 *  import, warnings are review notes for the workbench pass. */
function validate(char) {
  const path = intakePath(char);
  const errors = [];
  const warnings = [];
  if (!existsSync(path)) {
    return { errors: [`no delivery at billboards/intake/${char}/${char}.glb`], warnings: [], info: {} };
  }
  let gltf;
  try {
    gltf = readGlbJson(path);
  } catch (err) {
    return { errors: [err.message], warnings: [], info: {} };
  }

  const nodeNames = new Set((gltf.nodes || []).map((n) => n.name).filter(Boolean));
  const missingBones = STANDARD_BONES.filter((b) => !nodeNames.has(b));
  if (missingBones.length) {
    errors.push(`missing standard bones: ${missingBones.join(", ")} — shared clips cannot retarget onto this rig`);
  }

  const clips = (gltf.animations || []).map((a) => a.name).filter(Boolean);
  const states = clipStates();
  const unknown = clips.filter((c) => !states.includes(c));
  const covered = states.filter((s) => clips.includes(s));
  const missing = states.filter((s) => !clips.includes(s));
  if (unknown.length) {
    warnings.push(`clips with names that are not states (will never play): ${unknown.join(", ")}`);
  }
  if (missing.length) {
    warnings.push(`states with no own clip (will inherit / use the default pose set): ${missing.join(", ")}`);
  }

  // Height from the position accessors' declared bounds — min/max are
  // mandatory for POSITION accessors, so no geometry decoding is needed —
  // but read THROUGH the node hierarchy. A mesh is authored at whatever size
  // suited the generator and placed by its node's scale, so raw accessor
  // bounds measure the artist's working size, not the delivered figure. A rig
  // exported with scale left on the node measured 2.72 m for a 1.73 m fighter
  // that way: an error the tool reported against a file that was correct.
  //
  // Vertical extent only (scale.y, translate.y), which is all the check needs
  // and keeps this to a tree walk rather than a matrix library.
  let heightM = 0;
  const visit = (nodeIndex, scaleY, offsetY) => {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) return;
    let s = scaleY;
    let o = offsetY;
    if (node.matrix) {
      // Column-major 4x4: [5] is the y scale, [13] the y translation.
      s *= node.matrix[5];
      o += node.matrix[13] * scaleY;
    } else {
      if (node.scale) s *= node.scale[1];
      if (node.translation) o += node.translation[1] * scaleY;
    }
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes?.[node.mesh]?.primitives || []) {
        const acc = gltf.accessors?.[prim.attributes?.POSITION];
        if (!acc?.min || !acc?.max) continue;
        const top = acc.max[1] * s + o;
        const bottom = acc.min[1] * s + o;
        heightM = Math.max(heightM, top - Math.min(bottom, 0));
      }
    }
    for (const child of node.children || []) visit(child, s, o);
  };
  for (const scene of gltf.scenes || []) {
    for (const n of scene.nodes || []) visit(n, 1, 0);
  }
  if (heightM < 0.5 || heightM > 4) {
    errors.push(`mesh spans ${heightM.toFixed(2)}m of height — deliveries are real-world metres (a ${heightM < 0.5 ? "centimetre" : "scene"}-scaled file is the usual cause)`);
  }

  // Prop / chain expectations from the roster table.
  const exp = expectations();
  if (exp.props[char] && ![...nodeNames].some((n) => /^Prop_/.test(n))) {
    warnings.push(`the roster table expects prop bone(s) for ${char} and the rig has none — the weapon is part of the rig, not a separate file`);
  }
  if (exp.chains[char] && ![...nodeNames].some((n) => /^Chain_/.test(n))) {
    warnings.push(`the roster table expects physics chain bones (Chain_<name>_<i>) for ${char} and the rig has none`);
  }

  const tris = (gltf.meshes || []).flatMap((m) => m.primitives || [])
    .reduce((n, p) => n + (p.indices !== undefined ? (gltf.accessors?.[p.indices]?.count || 0) / 3 : 0), 0);
  if (tris > 60000) warnings.push(`${Math.round(tris)} triangles — the budget is 30k standard / 60k bulk`);

  return {
    errors, warnings,
    info: { heightM: Math.round(heightM * 100) / 100, clips: covered.length, states: states.length, tris: Math.round(tris) },
  };
}

// ------------------------------------------------------------- subcommands

function cmdValidate(char) {
  const { errors, warnings, info } = validate(char);
  for (const e of errors) console.log(`ERROR  ${e}`);
  for (const w of warnings) console.log(`warn   ${w}`);
  if (!errors.length) {
    console.log(`ok     ${char}: ${info.heightM}m, ${info.clips}/${info.states} states covered, ${info.tris} tris`);
  }
  return errors.length ? 1 : 0;
}

function cmdImport(char) {
  const { errors, info } = validate(char);
  if (errors.length) {
    for (const e of errors) console.log(`ERROR  ${e}`);
    console.log("import refused — fix the delivery (or the spec disagreement) first.");
    return 1;
  }
  mkdirSync(join(ASSETS, char), { recursive: true });
  copyFileSync(intakePath(char), join(ASSETS, char, `${char}.glb`));
  const man = readManifest();
  man.characters = man.characters || {};
  man.characters[char] = {
    ...man.characters[char],
    model: `${char}/${char}.glb`,
    heightM: info.heightM,
    // Never approved by import: approval is a review decision made in the
    // billboard workbench, pose by pose, and applied from its payload.
    approved: man.characters[char]?.approved || false,
  };
  writeManifest(man);
  console.log(`imported ${char} (${info.heightM}m, ${info.clips}/${info.states} states) — NOT approved yet.`);
  console.log(`review in /billboards/workbench/?char=${char}, export the payload, then: apply <payload.json>`);
  return 0;
}

function setApproved(char, value) {
  const man = readManifest();
  if (!man.characters?.[char]?.model) {
    console.log(`ERROR  ${char} has no imported model to ${value ? "approve" : "revoke"}.`);
    return 1;
  }
  man.characters[char].approved = value;
  writeManifest(man);
  console.log(`${char} ${value ? "approved — registers in-game on next load" : "revoked — falls back to sprites"}.`);
  return 0;
}

function cmdApply(payloadPath) {
  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  if (payload.kind !== "billboard-workbench") {
    console.log("ERROR  not a billboard workbench payload (kind mismatch).");
    return 1;
  }
  const man = readManifest();
  man.characters = man.characters || {};
  const keys = Object.keys(payload.characters || {});
  for (const [char, entry] of Object.entries(payload.characters || {})) {
    // The payload carries whole entries for the characters that were edited;
    // merging per-character keeps unrelated manifest edits intact.
    man.characters[char] = { ...man.characters[char], ...entry };
  }
  writeManifest(man);
  console.log(`applied ${keys.length} character(s): ${keys.join(", ") || "none"}`);
  return 0;
}

function cmdList() {
  const man = readManifest();
  const chars = Object.keys(man.characters || {});
  const delivered = existsSync(INTAKE)
    ? readdirSync(INTAKE, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  for (const char of new Set([...chars, ...delivered])) {
    const entry = man.characters?.[char];
    const inIntake = existsSync(intakePath(char));
    const status = entry?.approved ? "APPROVED" : entry?.model ? "imported, awaiting approval" : inIntake ? "in intake, not imported" : "manifest-only entry";
    console.log(`${char.padEnd(14)} ${status}${entry?.inheritClips ? `  (set falls back to ${entry.inheritClips})` : ""}`);
  }
  if (!chars.length && !delivered.length) console.log("nothing delivered, nothing registered — the roster draws sprites.");
  return 0;
}

/** Manifest sanity for `npm run check`: every registered model exists, every
 *  clip override names a real state, inheritance points at real characters. */
function cmdCheck() {
  const problems = [];
  const man = readManifest();
  const states = clipStates();
  for (const [char, entry] of Object.entries(man.characters || {})) {
    if (entry.model && !existsSync(join(ASSETS, entry.model))) {
      problems.push(`${char}: manifest names ${entry.model} but the file is missing`);
    }
    if (entry.approved && !entry.model) {
      problems.push(`${char}: approved but has no model — approval means nothing without one`);
    }
    for (const state of Object.keys(entry.clips || {})) {
      if (!states.includes(state)) problems.push(`${char}: clip override for unknown state "${state}"`);
    }
    const inherit = entry.inheritClips;
    if (inherit && inherit !== "default" && !man.characters[inherit]) {
      problems.push(`${char}: inherits clips from "${inherit}", which is not in the manifest`);
    }
  }
  // The state list itself must cover the sprite side's animation keys — a
  // state added to SEMANTIC_ANIMS but not states.js would silently draw the
  // default pose forever.
  const chars = readFileSync(join(ROOT, "src", "characters.js"), "utf8");
  const sem = /export const SEMANTIC_ANIMS = \{([\s\S]*?)\n\};/.exec(chars)?.[1] || "";
  const animKeys = [...sem.matchAll(/^  (\w+):/gm)].map((m) => m[1]);
  for (const k of animKeys) {
    if (!states.includes(k) && k !== "dodge") problems.push(`SEMANTIC_ANIMS has "${k}" but billboards/src/states.js does not`);
  }
  for (const p of problems) console.log(`ERROR  ${p}`);
  if (!problems.length) console.log(`billboard manifest ok: ${Object.keys(man.characters || {}).length} character(s), ${states.length} states cover the game's animation keys`);
  return problems.length ? 1 : 0;
}

// -------------------------------------------------------------------- main

const [cmd, arg] = process.argv.slice(2);
const run = {
  validate: () => cmdValidate(arg),
  import: () => cmdImport(arg),
  approve: () => setApproved(arg, true),
  revoke: () => setApproved(arg, false),
  apply: () => cmdApply(arg),
  list: cmdList,
  check: cmdCheck,
}[cmd];
if (!run || ((cmd !== "list" && cmd !== "check") && !arg)) {
  console.log("usage: billboard_intake.mjs validate|import|approve|revoke <char> | apply <payload.json> | list | check");
  process.exit(2);
}
process.exit(run());
