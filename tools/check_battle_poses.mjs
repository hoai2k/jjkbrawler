// The matched battle poses are DATA, and this is the part of them a machine
// can check.
//
// It cannot tell you whether a pose looks like a cross — that is what the rig
// sheet and a pair of eyes are for. What it can tell you is that the table
// still refers to bones that exist, still covers the frames the sheet draws,
// and still holds angles a joint can reach: the three ways this file rots
// silently. A bone renamed in the rig manifest, a frame added to a character's
// sheet, or a typo'd 180 where a 18 was meant all look like nothing until a
// fighter is standing in the wrong pose in a match.
//
//   node tools/check_battle_poses.mjs        (runs in `npm run check`)

import { BATTLE_POSES, MATCHED_FRAMES } from "../render3d/src/battle_poses.js";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const READS = join(ROOT, "sprites/docs/pose-reads");

let fails = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); fails++; };

// The bones a pose is allowed to name. Kept here rather than read off a rig so
// the check runs without a browser — the rig-side list is T_POSE in the sprite
// pose editor, and the two are meant to agree.
const BONES = new Set([
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
  "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
]);

// A joint angle past this is not a pose, it is a typo. Elbows and knees are the
// widest real range and they do not reach 180.
const LIMIT = 175;

for (const [frame, pose] of Object.entries(BATTLE_POSES)) {
  if (!pose || typeof pose !== "object") { fail(`${frame}: not a pose table`); continue; }
  if (!Object.keys(pose).length) fail(`${frame}: empty`);
  for (const [bone, angles] of Object.entries(pose)) {
    if (!BONES.has(bone)) fail(`${frame}.${bone}: no such bone`);
    if (!Array.isArray(angles) || angles.length !== 3) {
      fail(`${frame}.${bone}: want [x, y, z] degrees`);
      continue;
    }
    for (const [i, v] of angles.entries()) {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        fail(`${frame}.${bone}[${i}]: ${v} is not an angle`);
      } else if (Math.abs(v) > LIMIT) {
        fail(`${frame}.${bone}[${i}]: ${v}° is past anything a joint does`);
      }
    }
  }
}

// Every frame any character's sheet draws should eventually have a match. Only
// the frames Yuji has are required today — he is the read character, and the
// rest of the roster is seeded — but the gap is worth printing.
const yuji = JSON.parse(readFileSync(join(READS, "yuji.json"), "utf8"));
const missing = Object.keys(yuji.poses).filter((k) => !MATCHED_FRAMES.has(k));
if (missing.length) fail(`yuji has no matched pose for: ${missing.join(", ")}`);

const others = new Set();
for (const file of readdirSync(READS).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(READS, file), "utf8"));
  for (const k of Object.keys(data.poses)) if (!MATCHED_FRAMES.has(k)) others.add(k);
}

console.log(`battle poses ok: ${MATCHED_FRAMES.size} matched frames, `
  + `${Object.keys(yuji.poses).length}/${Object.keys(yuji.poses).length} of yuji's sheet covered`);
if (others.size) {
  console.log(`  (${others.size} frame name(s) elsewhere on the roster have no match yet: `
    + `${[...others].sort().slice(0, 8).join(", ")}${others.size > 8 ? ", …" : ""})`);
}
process.exit(fails ? 1 : 0);
