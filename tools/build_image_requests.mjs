// Writes docs/open-image-requests.md — every 2D image the repo is still
// waiting on, in one generation-ready file.
//
// Why generated rather than written. "What images are outstanding?" is a
// question with FOUR different sources of truth today: the sprite manifest's
// flags, the sprite manifest's stand-ins, the render3d rig manifest (which
// fighters already have a model, and so no longer need a turnaround to build
// one from), and the files actually on disk under render3d/. A hand-written
// answer is stale the moment any one of them moves, and this repo has already
// paid for that once — round 18C existed entirely because flags outlived the
// request sections that named them.
//
// So this reads all four and emits the union. Every round it is re-run; if it
// prints nothing, nothing is outstanding.
//
//   node tools/build_image_requests.mjs           # write the doc
//   node tools/build_image_requests.mjs --check   # fail if the doc is stale
//
// The prompts it emits carry the character block verbatim from
// docs/asset-requests.md, which is the one place a fighter's design is written
// down. Copying the design into a second file by hand is how a character ends
// up drawn two ways.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/open-image-requests.md");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// ---------------------------------------------------------------- the sources

/** Character blocks: the design text, verbatim, from the 2D request doc. */
function characterBlocks() {
  const text = read("docs/asset-requests.md");
  const start = text.indexOf("## Character blocks");
  const out = new Map();
  for (const line of text.slice(start).split("\n")) {
    const m = line.match(/^\|\s*(\w+)\s*\|\s*(".*?")\s*(\*\(([^)]*)\)\*)?\s*\|$/);
    if (m) out.set(m[1], { block: m[2], note: m[4] || "" });
  }
  return out;
}

/** The roster table — height, archetype, per-fighter notes — from the
 *  billboard request doc, which owns it for both 3D backends. */
function rosterTable() {
  const text = read("billboards/docs/asset-requests.md");
  const start = text.indexOf("## The roster");
  const out = new Map();
  for (const line of text.slice(start).split("\n")) {
    const m = line.match(/^\|\s*`(\w+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/);
    if (m) out.set(m[1], { name: m[2], height: m[3], rig: m[4], archetype: m[5], notes: m[6] });
  }
  return out;
}

/** Fighters whose rig has already been delivered. A delivered rig does not
 *  need a turnaround board — that board's whole job is to be the thing a model
 *  is generated FROM — but it still needs the face sheet the review gate reads
 *  against and the shade palette its materials are graded from. */
function riggedFighters() {
  const file = "render3d/assets/manifest.json";
  if (!exists(file)) return new Map();
  const man = JSON.parse(read(file));
  return new Map(Object.entries(man.characters || {}));
}

/** Sprite poses still outstanding: a workbench flag, or a pose drawing a file
 *  that is not its own. Both halves, because the second raises no flag — which
 *  is exactly how seven of them stayed invisible until round 18G. */
function spriteWork() {
  let flagged = { replacements: [], improvements: [], deletions: [] };
  try {
    const raw = execFileSync("python3", [path.join(ROOT, "tools/list_replacements.py"), "--json"],
      { encoding: "utf8", cwd: ROOT });
    flagged = JSON.parse(raw);
  } catch {
    // The lister is the authority; if it cannot run, say so rather than
    // reporting a clean sheet we did not actually check.
    return null;
  }
  const man = JSON.parse(read("sprites/assets/manifest.json"));
  const standIns = [];
  for (const [char, poses] of Object.entries(man.characters || {})) {
    for (const [key, meta] of Object.entries(poses)) {
      if (!meta || typeof meta !== "object" || !meta.file) continue;
      const own = path.basename(meta.file, path.extname(meta.file));
      if (own !== key && !meta.awaitingApproval) standIns.push({ char, key, drawing: own });
    }
  }
  return { ...flagged, standIns };
}

// ------------------------------------------------------------------ the rounds
//
// One entry per kind of image that can be outstanding. `pending` returns the
// list of fighters still owing that image; an empty list means the round is
// closed and it is reported as such rather than dropped, so the doc always
// accounts for every round.

const blocks = characterBlocks();
const roster = rosterTable();
const rigs = riggedFighters();

const KEYS = [...roster.keys()];
const has = (p) => exists(p);

const ROUNDS = [
  {
    id: "DI1",
    title: "Turnaround boards — the model-generation inputs",
    owner: "render3d/docs/image-requests.md#round-di1--model-generation-turnaround-boards-the-tripo-inputs",
    deliverTo: "assets/intake/render3d/<char>_turnaround.png",
    spec: [
      "One PNG per fighter, **2048×1024 or larger, clean white or transparent background**.",
      "The fighter in a neutral standing pose seen **front, ¾-front, side and back**, at one consistent scale and eye-line.",
      "Flat colours from the canon palette. **No dramatic lighting, no perspective, no overlapping limbs** — arms held slightly away from the body (near-A-pose reconstructs best).",
      "The face on-model in the front view. The back view has to answer everything the sprites never showed: hair from behind, the back of the uniform, where any prop is stowed.",
    ],
    why: "A sprite set only ever shows one ¾ view and mirrors the rest, which is precisely what a 3D model cannot be built from.",
    pending: () => KEYS.filter((k) => !rigs.has(k) && !has(`render3d/docs/reference/${k}_turnaround.png`)),
    landsAt: (k) => `render3d/docs/reference/${k}_turnaround.png`,
  },
  {
    id: "DI2",
    title: "Face sheets — what the face-first review gate reads against",
    owner: "render3d/docs/image-requests.md#round-di2--face-sheets-the-face-first-gates-reference",
    deliverTo: "assets/intake/render3d/<char>_face.png",
    spec: [
      "One sheet per fighter: **front, ¾ and profile of the head only**, at least 512 px per view.",
      "Canon palette, neutral expression.",
      "The drawn truth of the jawline, the eye shapes, and — this one matters to the modeller — **the hair clumping and which side it parts**, because the normals are combed along it.",
    ],
    why: "AI-generated meshes fail at faces first, and the workbench's sweeping-light check needs something to judge AGAINST. Needed for a fighter whose rig has already arrived just as much as for one whose has not.",
    pending: () => KEYS.filter((k) => !has(`render3d/docs/reference/${k}_face.png`)),
    landsAt: (k) => `render3d/docs/reference/${k}_face.png`,
  },
  {
    id: "DI3",
    title: "Shade palette swatches — the two-band ramp's colours",
    owner: "render3d/docs/image-requests.md#round-di3--shade-palette-swatches",
    deliverTo: "assets/intake/render3d/<char>_shade.png",
    spec: [
      "One labelled swatch sheet per fighter. Format is free; a PNG grid is fine.",
      "Each major material region — skin, hair, uniform top, uniform bottom, props — paired with **its lit fill and its painted shadow colour**.",
      "Taken from, or consistent with, that fighter's own sprite shading.",
    ],
    why: "The toon pass paints shadows from a palette rather than from darkness, and those numbers land in the rig's material extras (or the manifest's `toon` block) at intake. Not one delivered rig carries a `toon` block today, so every one of them is running on the engine defaults.",
    pending: () => KEYS.filter((k) => !has(`render3d/docs/reference/${k}_shade.png`)),
    landsAt: (k) => `render3d/docs/reference/${k}_shade.png`,
  },
  {
    id: "DI4",
    title: "Mouth sheets — optional, per fighter",
    owner: "render3d/docs/image-requests.md#round-di4--shared-face-textures-one-time-roster-wide",
    deliverTo: "assets/intake/render3d/<char>_mouth_sheet.png",
    spec: [
      "A **4-cell strip — idle / hurt / ult-shout / win-grin** — matching that fighter's face-sheet style, 256×256 per cell.",
      "For the mouth texture-swap regions the D-spec lists in a rig's extras.",
    ],
    why: "Nothing ships blocked on this: the neutral modelled mouth is the default, and a fighter with no sheet simply keeps it. The shared eye-highlight half of DI4 is delivered.",
    optional: true,
    pending: () => KEYS.filter((k) => !has(`render3d/assets/textures/${k}_mouth_sheet.png`)),
    landsAt: (k) => `render3d/assets/textures/${k}_mouth_sheet.png`,
  },
];

// ------------------------------------------------------------------- rendering

const fighterRow = (k) => {
  const r = roster.get(k) || {};
  const b = blocks.get(k) || {};
  const canon = ["_idle", "_anime", "_canon"]
    .map((s) => `assets/reference/canon/${k}${s}.png`).find(has) || "—";
  return { key: k, name: r.name || k, height: r.height || "—",
           archetype: r.archetype || "—", notes: r.notes || "", canon,
           block: b.block || "", keyNote: b.note || "" };
};

function roundSection(round) {
  const pending = round.pending();
  const out = [];
  out.push(`## ${round.id} — ${round.title}`);
  out.push("");
  if (!pending.length) {
    out.push(`**Nothing outstanding.** Every fighter this round covers has ${round.id === "DI4" ? "a sheet, or does not need one" : "delivered"}.`);
    out.push("");
    return out.join("\n");
  }
  out.push(`**${pending.length} image${pending.length === 1 ? "" : "s"}${round.optional ? ", optional" : ""}.** ${round.why}`);
  out.push("");
  out.push("What each one is:");
  out.push("");
  for (const line of round.spec) out.push(`- ${line}`);
  out.push("");
  out.push("Deliver to:");
  out.push("");
  out.push("```");
  out.push(round.deliverTo);
  out.push("```");
  out.push("");
  out.push(`Full round text: [${round.id}](../${round.owner}).`);
  out.push("");
  out.push("| Fighter | Key | Model at | Archetype | Canon reference | Notes |");
  out.push("|---|---|---|---|---|---|");
  for (const k of pending) {
    const f = fighterRow(k);
    out.push(`| ${f.name} | \`${f.key}\` | ${f.height} | ${f.archetype} | \`${f.canon}\` | ${f.notes || "—"} |`);
  }
  out.push("");
  return out.join("\n");
}

function blocksSection(keys) {
  const out = ["## The character blocks", "",
    "Used **verbatim** as `[CHARACTER BLOCK]` in the prompts above, exactly as the",
    "2D rounds use them — this is how a fighter stays the same character across",
    "their sprites, their card and their turnaround. Reproduced here from",
    "[docs/asset-requests.md](asset-requests.md#character-blocks), which owns them.",
    "",
    "**Where the block and the canon reference disagree, the reference wins.**",
    "Every fighter now has a `<char>_idle.png` — regenerated from their approved",
    "idle — and it carries the figure scale, palette and shading the delivered set",
    "actually has, which the block text cannot. The wiki's (Anime) render answers",
    "design questions the reference leaves open (what does Gakuganji's guitar look",
    "like), and is where the blocks came from: three were rewritten in round 9E",
    "because they described characters who looked nothing like their anime designs,",
    "and Uro's again in round 18 after an ambiguous sentence was drawn the wrong",
    "way twice. See [`assets/reference/canon/`](../assets/reference/canon/).",
    "", "| Key | Block |", "|---|---|"];
  for (const k of keys) {
    const f = fighterRow(k);
    if (!f.block) continue;
    // `f.keyNote` is the block's key-screen marker (magenta or grey). It is
    // deliberately dropped: nothing in this file is a keyed sprite plate, and
    // carrying the note through would contradict the rules above it.
    out.push(`| \`${k}\` | ${f.block} |`);
  }
  out.push("");
  return out.join("\n");
}

function spriteSection() {
  const work = spriteWork();
  const out = ["## 2D sprites — the other half of the question", ""];
  if (!work) {
    out.push("**Not checked**: `tools/list_replacements.py` would not run, and this");
    out.push("section is only worth anything if it actually read the manifest.");
    out.push("");
    return out.join("\n");
  }
  const flagged = [...work.replacements, ...work.deletions];
  if (!flagged.length && !work.standIns.length) {
    out.push("**Nothing outstanding.** No pose carries a replacement flag, and no pose is");
    out.push("drawing a file that is not its own — the two halves that between them");
    out.push("define an outstanding sprite. Improvement requests are listed below and are");
    out.push("repo work rather than art anybody owes us.");
  } else {
    out.push(`**${flagged.length} flagged, ${work.standIns.length} drawing somebody else's art.**`);
    out.push("");
    out.push("| Fighter | Pose | Why |");
    out.push("|---|---|---|");
    for (const r of flagged) out.push(`| ${r.char || r.character} | \`${r.key || r.frame}\` | ${r.kind || r.reason || "flagged"} |`);
    for (const s of work.standIns) out.push(`| ${s.char} | \`${s.key}\` | drawing \`${s.drawing}\` |`);
  }
  out.push("");
  if (work.improvements.length) {
    out.push(`Separately, **${work.improvements.length} improvement request${work.improvements.length === 1 ? "" : "s"}** — the art works and is`);
    out.push("just not as good as it should be. Nothing is blocked by one, and the two");
    out.push("standing ones (`hakari/dodge_air`, `toji/dodge_air`) are alpha fixes to");
    out.push("delivered files, which is repo work and not a request.");
    out.push("");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------- output

const pendingByRound = ROUNDS.map((r) => [r, r.pending()]);
const total = pendingByRound.reduce((n, [, p]) => n + p.length, 0);
const needBlocks = [...new Set(pendingByRound.flatMap(([, p]) => p))]
  .sort((a, b) => KEYS.indexOf(a) - KEYS.indexOf(b));

const doc = [
  "# Open Image Requests — everything still to draw",
  "",
  "**This file is generated** by `node tools/build_image_requests.mjs`. Re-run it",
  "after every delivery; it reads the sprite manifest's flags, the sprite",
  "manifest's stand-ins, the render3d rig manifest and the files actually on",
  "disk, so it cannot drift from them the way a hand-kept list does. Do not edit",
  "it — fix the source and re-run.",
  "",
  `**${total} image${total === 1 ? "" : "s"} outstanding**, all of them 2D inputs to the 3D track. The 2D`,
  "sprite rounds are closed (see below), so nothing here changes what the sprite",
  "game looks like — these are what the `?render=3d` and `?render=billboard`",
  "paths are built from.",
  "",
  "Sibling documents, each of which owns its own rounds: the sprite rounds in",
  "[asset-requests.md](asset-requests.md), the model rounds in",
  "[render3d](../render3d/docs/asset-requests.md) and",
  "[billboards](../billboards/docs/asset-requests.md), the full DI round text in",
  "[render3d/docs/image-requests.md](../render3d/docs/image-requests.md), and the",
  "one-screen index of all of it in [all-requests.md](all-requests.md).",
  "",
  "---",
  "",
  "## Rules that hold for every image here",
  "",
  "- **The canon reference is the subject.** Each row names the fighter's own",
  "  reference under `assets/reference/canon/`; the drawing is that character,",
  "  not an interpretation of them.",
  "- **The character block goes in the prompt verbatim.** They are reproduced at",
  "  the bottom of this file.",
  "- **These are not sprites.** No magenta or grey key screen, no trimming — a",
  "  turnaround wants clean white or transparency, a swatch sheet wants labels.",
  "  The keyed-plate rules in the 2D delivery spec do not apply to anything here.",
  "- **Any subset is useful.** Every round below lands per fighter, and a fighter",
  "  with nothing delivered keeps whatever the engine does today.",
  "",
  "---",
  "",
  ...ROUNDS.map(roundSection),
  "---",
  "",
  blocksSection(needBlocks),
  "---",
  "",
  spriteSection(),
].join("\n").replace(/\n{3,}/g, "\n\n") + "";

if (process.argv.includes("--check")) {
  const current = exists("docs/open-image-requests.md") ? read("docs/open-image-requests.md") : "";
  if (current !== doc) {
    console.log("FAIL docs/open-image-requests.md is stale — run: node tools/build_image_requests.mjs");
    process.exit(1);
  }
  console.log("ok   docs/open-image-requests.md is up to date");
  process.exit(0);
}

fs.writeFileSync(OUT, doc);
console.log(`wrote docs/open-image-requests.md — ${total} image(s) outstanding`);
for (const [round, pending] of pendingByRound) {
  console.log(`  ${round.id.padEnd(4)} ${String(pending.length).padStart(3)}  ${round.title}`);
}
