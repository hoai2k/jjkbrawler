// Every fighter on the select screen owes the same poses. Say so out loud.
//
//   node tools/check_pose_coverage.mjs
//
// WHY THIS EXISTS
//
// The seven fighters promoted out of `STAGED_CHARACTER_KEYS` arrived on the
// roster without a `teeter`, and nothing anywhere went red. It is easy to see
// why once you look for the check that should have caught it and find there is
// none: the workbench builds a fighter's pose list FROM the manifest, so "every
// entry exists by definition"; `check_pose_reads` compares reads against the
// manifest, so a pose that was never delivered has nothing to be missing from;
// and the renderer is deliberately forgiving — a state whose frames are undrawn
// falls back to ones that are (`fallback` in SEMANTIC_ANIMS, resolvedAnim in
// sprites.js), which is what keeps a staged fighter playable before any art
// exists. Three layers each doing their job correctly, and between them a
// fighter can join the roster missing a pose and look fine.
//
// So this asks the one question none of them asks: for every fighter the game
// will let you pick, is there a pose their own animation states NAME that
// nobody has drawn?
//
// WHAT COUNTS AS OWED
//
// A state's `frames` — the art it is meant to play. Not its `fallback`, which
// is the stand-in it uses while the real drawing is missing and is by
// definition somebody else's pose. That distinction is the whole reason a
// gap can hide: the fallback is why nothing looks broken.
//
// WHY IT DOES NOT SIMPLY FAIL
//
// Missing art is normal — it is what an art round IS. What is not normal is
// missing art nobody has written down, because that is the state the teeter
// was in: undrawn, unrequested, and invisible. So the rule is the same one the
// request docs already keep for workbench flags — a gap with no request is
// work nobody can see — and the check passes when every missing pose is named
// in the open request file.
//
// Which means the fix for a red run is never to edit this file: either draw
// the pose, or write the request that says it is owed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "sprites", "assets", "manifest.json");
const REQUESTS = join(ROOT, "docs", "asset-requests.md");

// Registered on purpose and not owed by anybody. A state can exist because the
// MECHANIC needs somewhere to hang art if it is ever drawn, while the reading
// it falls back to is already correct — round 20C decided exactly that for the
// four throws: each plays the heavy attack swung that way, and a throw IS a
// heave in that direction, so 20C is complete without them
// (asset-requests-history.md, round 20C). Deliver art under one of these keys
// and it is picked up with no code change.
//
// A key belongs here only with a written decision behind it. "Nobody has drawn
// it yet" is the other list, and that one is meant to be loud.
const NOT_OWED = new Set(["throw_fwd", "throw_back", "throw_up", "throw_down"]);

const man = JSON.parse(readFileSync(MANIFEST, "utf8"));
const requests = readFileSync(REQUESTS, "utf8");

/** The poses a fighter's own states name, which is what they are owed. */
function owed(charKey) {
  const out = new Set();
  for (const anim of Object.values(CHARACTERS[charKey]?.anims || {})) {
    for (const frame of anim?.frames || []) if (!NOT_OWED.has(frame)) out.add(frame);
  }
  return [...out].sort();
}

const gaps = [];
for (const charKey of CHARACTER_KEYS) {
  const delivered = man.characters[charKey] || {};
  for (const pose of owed(charKey)) {
    if (!delivered[pose]) gaps.push({ charKey, pose });
  }
}

// Named in the open round, in any of the shapes those tables use — the sprite
// path, the manifest key, or the pose in a table cell beside the fighter.
const requested = ({ charKey, pose }) =>
  requests.includes(`${charKey}/${pose}.png`) || requests.includes(`${charKey}/${pose}\``)
  || requests.includes(`\`${charKey}/${pose}\``);

const unwritten = gaps.filter((g) => !requested(g));

for (const { charKey, pose } of gaps) {
  const mark = unwritten.some((u) => u.charKey === charKey && u.pose === pose) ? "MISSING" : "ok     ";
  console.log(`  ${mark}  ${charKey}/${pose}`
    + (mark === "ok     " ? " — undrawn, and asked for in docs/asset-requests.md" : ""));
}

if (unwritten.length) {
  console.error(`\n${unwritten.length} pose(s) nobody has drawn and nobody has asked for.`);
  console.error("Draw them, or add them to the open round in docs/asset-requests.md —"
    + " a gap with no request is work nobody can see.");
  process.exit(1);
}

console.log(`pose coverage ok — ${CHARACTER_KEYS.length} fighters,`
  + ` ${gaps.length} undrawn pose(s), all of them requested`);
