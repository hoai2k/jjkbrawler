// ACT ON THE WORKBENCH'S DELETE TAGS — remove the drawings, and every reference.
//
//   node tools/apply_deletions.mjs              # the plan: what goes, what is held
//   node tools/apply_deletions.mjs --apply      # do it
//   node tools/apply_deletions.mjs --apply jogo # one fighter (or several)
//
// A DELETE TAG IS NOT A REQUEST. Every other flag the sprite workbench writes
// asks somebody for a drawing — replace this, improve that, deliver an
// alternate beside it. `delete` asks for the opposite: "we have something
// better, throw this one away" (REPLACEMENT_KINDS, sprites/src/sprites.js).
//
// It had nowhere to go. Tags accumulated in the manifest, list_replacements.py
// collected them, build_image_requests.mjs counted them, and they arrived in
// docs/image-requests.md — the document whose whole job is images to DRAW — as
// outstanding work. Fifty-six drawings nobody wanted, in front of an image
// generator as if they were commissions. Acting on them was a hand procedure
// (sprites/docs/sprite-cleanup.md §1) that nobody had time to run, which is
// exactly why they piled up. This is that procedure, run by a machine.
//
// WHAT IT DOES, per tagged drawing:
//
//   1. deletes the PNG
//   2. drops its option from `manifest.variants[char][pose].options`
//   3. drops every `manifest.characters[char][pose]` entry pointing at it —
//      the pose is not on screen (see the gate below), so the entry is a
//      reference to a file that no longer exists
//   3b. drops that pose's POSE READ (sprites/docs/pose-reads/<char>.json), the
//      reference that is not in the manifest and the one the first run of this
//      forgot: a read of a frame that does not exist fails
//      tools/check_pose_reads.mjs, and 47 of them did
//   4. drops `manifest.variants[char][pose]` once one option is left, because
//      a pose with one drawing is a pose with no choice and should stop
//      showing a chevron
//
// THE GATE, and it is the whole reason this can be a tool rather than an
// afternoon: IS THE GAME DRAWING IT? Asked of `resolvedAnim` — the game's own
// resolution, fallbacks and all — exactly as tools/check_pointing.mjs asks it,
// per character, because a grid cell like `r4c0` is played by a sheet-era
// fighter and is dead weight on a semantic one. A tagged drawing that anything
// draws is HELD, reported, and left tagged: deleting it would take art off the
// screen, and the runbook's rule there is stop and ask which drawing to keep.
// A tool must not guess that.
//
// A verified strike point placed on a doomed drawing is a warning, not a
// refusal. The point is already stale — its pose has moved on — and
// audit_hitboxes reports it; holding a cleanup for a provenance stamp would be
// the tail wagging the dog.
//
// DELETION IS OPT-IN. Everything else in tools/ applies and takes `--dry-run`;
// this prints the plan and wants `--apply`, because a tool that removes artwork
// should be run deliberately, not discovered by somebody seeing what it does.
// Everything it removes is in git.

import { readFile, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const ROOT = new URL("../", import.meta.url);
// The game reads its manifest over the network; the same shim check_pointing
// uses, and for the same reason — without it every lookup misses and a state's
// `fallback` never resolves.
globalThis.fetch = async (url) => {
  const body = await readFile(new URL(String(url).replace(/^\.?\//, ""), ROOT), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};

const { CHARACTER_KEYS, SPRITE_ACTORS } = await import("../src/characters.js");
const { resolvedAnim, animsOf } = await import("../sprites/src/sprites.js");
const { loadCoreAssets } = await import("../src/assets.js");
await loadCoreAssets();

const MANIFEST = new URL("sprites/assets/manifest.json", ROOT);
const CHAR_DIR = new URL("sprites/assets/", ROOT);
const STRIKE_POINTS = new URL("src/config_strike_points.js", ROOT);

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const only = argv.filter((a) => !a.startsWith("--"));

const man = JSON.parse(await readFile(MANIFEST, "utf8"));
const keys = [...CHARACTER_KEYS, ...Object.keys(SPRITE_ACTORS)]
  .filter((k) => !only.length || only.includes(k));

/** Files this character has on screen, and which poses put them there. */
function liveFiles(char) {
  const anims = animsOf(char);
  const states = Object.keys(anims);
  const live = new Map();
  for (const [key, meta] of Object.entries(man.characters?.[char] || {})) {
    if (!meta?.file) continue;
    if (!states.some((s) => resolvedAnim(char, s).frames.includes(key))) continue;
    live.set(meta.file, [...(live.get(meta.file) || []), key]);
  }
  return live;
}

/** Every pose entry naming this file, on screen or not — the references that
 *  have to go with it. A drawing can be several poses' art. */
function entriesFor(char, file) {
  return Object.entries(man.characters?.[char] || {})
    .filter(([, meta]) => meta?.file === file)
    .map(([key]) => key);
}


/** Remove poses from a character's read file WITHOUT reformatting it.
 *
 *  `sprites/docs/pose-reads/<char>.json` is hand-formatted — one stanza per
 *  pose, joints four to a line, because these files are reviewed and edited by
 *  people (tools/pose_reads.py `dump` says so at length). Re-emitting one with
 *  JSON.stringify would turn removing two stanzas into a whole-file diff, so
 *  the stanzas are cut out as text and the result is PARSED BACK and compared
 *  against what the removal should have produced. A cut that does not produce
 *  exactly that is refused rather than written: text surgery on a data file is
 *  fine as long as it has to prove itself.
 */
async function pruneReads(char, keys) {
  const file = new URL(`sprites/docs/pose-reads/${char}.json`, ROOT);
  if (!existsSync(fileURLToPath(file))) return [];
  const text = await readFile(file, "utf8");
  const before = JSON.parse(text);
  const present = keys.filter((k) => before.poses?.[k]);
  if (!present.length) return [];
  const lines = text.split("\n");
  const drop = new Set();
  for (const key of present) {
    const start = lines.findIndex((l) => l.startsWith(`    ${JSON.stringify(key)}: {`));
    if (start < 0) return null;
    let end = start;
    while (end < lines.length && !/^ {4}\}/.test(lines[end])) end++;
    if (end >= lines.length) return null;
    for (let i = start; i <= end; i++) drop.add(i);
  }
  let out = lines.filter((_, i) => !drop.has(i));
  // The stanza before the closing brace must not carry a trailing comma.
  const last = out.findIndex((l) => l === "  }");
  if (last > 0 && out[last - 1].endsWith(",")) out[last - 1] = out[last - 1].slice(0, -1);
  const rebuilt = out.join("\n");
  const expected = { ...before, poses: Object.fromEntries(
    Object.entries(before.poses).filter(([k]) => !present.includes(k))) };
  let parsed;
  try { parsed = JSON.parse(rebuilt); } catch { return null; }
  if (JSON.stringify(parsed) !== JSON.stringify(expected)) return null;
  await writeFile(file, rebuilt);
  return present;
}

const go = [];
const held = [];
for (const char of keys) {
  const live = liveFiles(char);
  for (const [pose, entry] of Object.entries(man.variants?.[char] || {})) {
    for (const opt of entry.options || []) {
      if (opt.needsReplacement !== "delete") continue;
      const drawnBy = live.get(opt.file);
      if (drawnBy) {
        held.push({ char, pose, file: opt.file,
          why: `the game draws it: ${drawnBy.join(", ")} — point the pose at the keeper `
            + `in the workbench, then re-run` });
        continue;
      }
      go.push({ char, pose, file: opt.file, entries: entriesFor(char, opt.file) });
    }
  }
}

const stamped = existsSync(fileURLToPath(STRIKE_POINTS))
  ? new Set([...(await readFile(STRIKE_POINTS, "utf8")).matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]))
  : new Set();

if (!go.length && !held.length) {
  console.log("no delete tags outstanding");
  process.exit(0);
}

if (go.length) {
  console.log(`${go.length} drawing(s) to delete:`);
  for (const row of go) {
    const also = row.entries.length ? `  (and ${row.entries.join(", ")})` : "";
    console.log(`  ${row.char.padEnd(12)} ${row.pose.padEnd(18)} ${row.file}${also}`);
    if (stamped.has(row.file)) {
      console.log(`  ${" ".repeat(12)} ${" ".repeat(18)} WARNING a verified strike point was `
        + "placed on this drawing — already stale, and audit_hitboxes says so");
    }
  }
}
if (held.length) {
  console.log(`\n${held.length} held — the tag stays until somebody decides:`);
  for (const row of held) {
    console.log(`  ${row.char.padEnd(12)} ${row.pose.padEnd(18)} ${row.file}`);
    console.log(`  ${" ".repeat(31)} ${row.why}`);
  }
}

if (!APPLY) {
  console.log("\nplan only — re-run with --apply to delete");
  process.exit(0);
}

console.log("");
for (const row of go) {
  const { char, pose, file } = row;
  const path = new URL(file, CHAR_DIR);
  if (existsSync(fileURLToPath(path))) {
    await unlink(path);
    console.log(`  deleted  ${file}`);
  } else {
    console.log(`  gone already  ${file}`);
  }
  for (const key of row.entries) {
    delete man.characters[char][key];
    console.log(`           ${char}/${key}: pose entry dropped — nothing drew it`);
  }
  if (row.entries.length) {
    const pruned = await pruneReads(char, row.entries);
    if (pruned === null) {
      console.log(`           ${char}: COULD NOT prune the pose read(s) for `
        + `${row.entries.join(", ")} — edit sprites/docs/pose-reads/${char}.json by hand`);
    } else {
      for (const key of pruned) console.log(`           ${char}/${key}: pose read pruned`);
    }
  }
  const entry = man.variants[char][pose];
  entry.options = (entry.options || []).filter((o) => o.file !== file);
  // A pose with one drawing is a pose with no choice: the chevron goes.
  if (entry.options.length <= 1) {
    delete man.variants[char][pose];
    console.log(`           ${char}/${pose}: variants entry dropped `
      + `(${entry.options.length} option left)`);
  }
  if (!Object.keys(man.variants[char] || {}).length) delete man.variants[char];
}

await writeFile(MANIFEST, JSON.stringify(man, null, 1) + "\n");
console.log(`\nmanifest rewritten — ${go.length} drawing(s) gone`);
console.log("re-run: node tools/build_image_requests.mjs   # the count moves with it");
console.log("        node tools/check_pointing.mjs         # nothing lost its art");
