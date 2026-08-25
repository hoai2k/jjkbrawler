// THE SHADOW-OR-GAP QUEUE, built from the art the game actually draws.
//
// A sealed region of screen colour inside a silhouette is either the stage
// showing through or a shadow drawn in that same colour, and on this delivery
// nothing measurable tells them apart — sprites/docs/sprite-cleanup.md lists
// the seven measurements that failed. Only a person can answer, so the answers
// are collected in the verification bench and stored as `SEALED_VERDICTS`.
//
// This writes the queue that bench reads.
//
// ONLY SPRITES THE GAME RENDERS. Asking about a drawing nobody sees is asking a
// question with no consequence, and there are 1,618 unanswered regions across
// the whole tree — most of them on sheet cells and banked alternates that no
// state resolves to. The game's own resolver decides what is in, exactly as it
// does for `delete_tagged_sprites.mjs`: a pose is in the queue when some state
// of its character resolves to it.
//
// Two programs, for the reason the deletion pair is: this half needs the game
// (JavaScript), and the pixel half needs scipy (Python). This one lists the
// active poses and their delivered originals; `sealed_regions.py` finds the
// regions and writes `sprites/assets/sealed_queue.json`.
//
//   node tools/build_sealed_queue.mjs
//   node tools/build_sealed_queue.mjs --check     # is the queue current?
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = new URL("../", import.meta.url);
globalThis.fetch = async (url) => {
  const body = await readFile(new URL(String(url).replace(/^\.?\//, ""), ROOT), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};

const { CHARACTER_KEYS, SPRITE_ACTORS } = await import("../src/characters.js");
const assets = await import("../src/assets.js");
await assets.loadCoreAssets();
const { resolvedAnim, animsOf } = await import("../sprites/src/sprites.js");

const man = JSON.parse(await readFile(new URL("sprites/assets/manifest.json", ROOT), "utf8"));
const chars = [...new Set([...CHARACTER_KEYS, ...Object.keys(SPRITE_ACTORS || {})])].sort();

// The delivered original a pose was keyed from. The keyed sprite in the tree has
// already had the decision applied to it, so the question can only be asked of
// what arrived — and those are archived per round and never change, which is
// also what makes a verdict stable.
const rounds = (await readdir(new URL("assets/reference/", ROOT), { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name.startsWith("round"))
  .map((d) => d.name).sort();

function deliveredFor(char, pose) {
  for (const round of [...rounds].reverse()) {
    const rel = `assets/reference/${round}/${char}/${pose}.png`;
    if (existsSync(new URL(rel, ROOT))) return rel;
  }
  return null;
}

const active = [];
for (const char of chars) {
  const anims = animsOf(char) || {};
  for (const pose of Object.keys(man.characters?.[char] || {})) {
    if (!Object.keys(anims).some((s) => resolvedAnim(char, s).frames.includes(pose))) continue;
    const src = deliveredFor(char, pose);
    if (src) active.push({ char, pose, src });
  }
}

console.log(`${active.length} pose(s) the game draws have an archived original`);
const py = spawnSync("python3",
  [fileURLToPath(new URL("sealed_regions.py", import.meta.url)),
   ...(process.argv.includes("--check") ? ["--check"] : [])],
  { input: JSON.stringify({ active }), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
process.stdout.write(py.stdout || "");
process.stderr.write(py.stderr || "");
process.exit(py.status ?? 1);
