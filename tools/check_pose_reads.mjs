// Check every pose read file against the sprite manifest.
//
//   node tools/check_pose_reads.mjs
//
// A read (sprites/docs/pose-reads/<char>.json) is sixteen joints per frame,
// and the whole point of it is to be trusted downstream — by the contact
// sheet, the pose editor, and eventually by whatever authors a clip from it.
// So the things that would make it quietly untrustworthy are checked here,
// where a broken file is a red run rather than a rig that poses oddly:
//
//   * every character with sprites has a read, and every read names a
//     character the manifest knows;
//   * every frame in the manifest has a pose, and no pose names a frame that
//     does not exist (a renamed sprite leaves both behind);
//   * every pose carries all sixteen joints, sided L/R, inside the cell;
//   * the file says which way it is facing, because a read of art the engine
//     mirrors is only meaningful once someone has said which orientation it
//     describes.
//
// It deliberately does NOT check that a read is a GOOD read — that a joint is
// on the drawing is `pose_contact_sheet.py --check`, and that it is the RIGHT
// joint is a human with the overlay in front of them.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const READS = join(ROOT, "sprites", "docs", "pose-reads");
const MANIFEST = join(ROOT, "sprites", "assets", "manifest.json");

const JOINTS = [
  "head", "neck", "chest", "pelvis",
  "shoulderL", "elbowL", "handL",
  "shoulderR", "elbowR", "handR",
  "hipL", "kneeL", "footL", "toeL",
  "hipR", "kneeR", "footR", "toeR",
];
/** Sprite sets that are not a fighter's body — nothing to read a pose off. */
const SKIP = new Set(["effects"]);

const man = JSON.parse(readFileSync(MANIFEST, "utf8"));
const problems = [];
let poses = 0;
let hand = 0;

for (const char of Object.keys(man.characters)) {
  if (SKIP.has(char)) continue;
  const path = join(READS, `${char}.json`);
  if (!existsSync(path)) {
    problems.push(`${char}: no pose read (run python3 tools/pose_seed.py)`);
    continue;
  }
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (data.character !== char) problems.push(`${char}: file says character "${data.character}"`);
  if (data.facing !== "right") problems.push(`${char}: facing is "${data.facing}", expected "right"`);

  const frames = new Set(Object.keys(man.characters[char]).filter(
    (k) => man.characters[char][k] && typeof man.characters[char][k] === "object"));
  for (const key of Object.keys(data.poses)) {
    if (!frames.has(key)) problems.push(`${char}/${key}: no such frame in the sprite manifest`);
  }
  for (const key of frames) {
    const pose = data.poses[key];
    if (!pose) { problems.push(`${char}/${key}: frame has no pose`); continue; }
    poses += 1;
    if (pose.source) hand += 1;
    for (const joint of JOINTS) {
      const xy = pose.j?.[joint];
      if (!Array.isArray(xy) || xy.length !== 2) {
        problems.push(`${char}/${key}: missing joint ${joint}`);
      } else if (!xy.every((v) => typeof v === "number" && v >= 0 && v <= 100)) {
        problems.push(`${char}/${key}.${joint}: ${xy.join(", ")} is outside the cell`);
      }
    }
    for (const joint of Object.keys(pose.j || {})) {
      if (!JOINTS.includes(joint)) problems.push(`${char}/${key}: unknown joint ${joint}`);
    }
  }
}

for (const file of readdirSync(READS)) {
  const char = file.replace(/\.json$/, "");
  if (!man.characters[char]) problems.push(`${file}: no such character in the sprite manifest`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s) in the pose reads.`);
  process.exit(1);
}
console.log(`pose reads OK — ${poses} poses across `
  + `${readdirSync(READS).length} characters, ${hand} hand-placed in the editor.`);
