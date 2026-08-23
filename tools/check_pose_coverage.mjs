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

import { CHARACTERS, CHARACTER_KEYS, SPRITE_ACTORS } from "../src/characters.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "sprites", "assets", "manifest.json");
const REQUESTS = join(ROOT, "docs", "asset-requests.md");

// Registered on purpose and not owed by anybody. A state can exist because the
// MECHANIC needs somewhere to hang art if it is ever drawn, while the reading
// it falls back to is already correct.
//
// A key belongs here only with a written decision behind it. "Nobody has drawn
// it yet" is the other list, and that one is meant to be loud.
//
// EMPTY, as of round 24. It held the four throws on 20C's reasoning — each
// plays the heavy attack swung that way, and a throw IS a heave in that
// direction — which was true and is still true, and was nonetheless the one
// thing this check exists to prevent: a pose the game names, nobody has drawn,
// and nobody has written down. Round 24 asks for them, so they are owed like
// anything else and the list has nothing left in it.
const NOT_OWED = new Set();

// States a fighter only reaches if they have the MECHANIC behind them.
//
// `domain` is the hand seal held while a Domain Expansion is declared
// (src/domains.js), and a fighter with no `domains` entry has nothing to
// declare — the state sits in the shared table because every fighter's table IS
// the shared table, not because every fighter can play it. Round 25B asks for
// the drawing from the nine sorcerers who have a domain and says in as many
// words that nobody else is owed one: "a fighter without an Expansion has
// nothing to open with it, and the pose would never be drawn."
//
// This is not NOT_OWED above, which is a pose nobody owes at all. These are
// owed — by exactly the fighters who can reach the state, and this check still
// holds those nine to it.
const GATED_STATES = {
  domain: (charKey) => !!CHARACTERS[charKey]?.domains?.length,
};

const man = JSON.parse(readFileSync(MANIFEST, "utf8"));
const requests = readFileSync(REQUESTS, "utf8");

// ACTORS ARE ASKED THE SAME QUESTION. Mahoraga owns a full sprite set, is drawn
// by the same renderer, and is simply not a fighter — which is exactly how he
// ended up without a walk or a teeter: the two roster-wide rounds that drew
// everybody one walked `CHARACTER_KEYS`, and so did this check. The gap this
// file exists to make loud was hiding in the one set nobody was asking about.
const SETS = [...CHARACTER_KEYS, ...Object.keys(SPRITE_ACTORS)];

/** The poses a fighter's own states name, which is what they are owed. */
function owed(charKey) {
  const out = new Set();
  const anims = CHARACTERS[charKey]?.anims || SPRITE_ACTORS[charKey]?.anims || {};
  for (const [state, anim] of Object.entries(anims)) {
    const gate = GATED_STATES[state];
    if (gate && !gate(charKey)) continue;
    for (const frame of anim?.frames || []) if (!NOT_OWED.has(frame)) out.add(frame);
  }
  return [...out].sort();
}

const gaps = [];
for (const charKey of SETS) {
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

console.log(`pose coverage ok — ${CHARACTER_KEYS.length} fighters`
  + ` and ${SETS.length - CHARACTER_KEYS.length} actor(s),`
  + ` ${gaps.length} undrawn pose(s), all of them requested`);
