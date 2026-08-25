// Writes docs/image-requests.md — every 2D image the repo is waiting on, for
// every render mode, in one generation-ready file.
//
// ## Why this file exists
//
// Image requests used to be authored in two places and answered from four
// more, and the result was a list that said "the 2D rounds are closed" while
// round 20 sat open asking for 172 images — the grab poses and the dash attack
// among them, neither of which the roster has ever had. Two lessons came out
// of that, and the design here is both of them:
//
//   1. **Manifest-derived truth can only find art that is WRONG.** Flags and
//      stand-ins describe drawings that exist and are bad. A pose nobody has
//      ever drawn is in no manifest — no flag, standing in for nothing — so it
//      is invisible to every check of that kind. Only a request document knows
//      about art that is ABSENT.
//
//   2. **A request nobody reads is a request nobody fills.** Splitting them by
//      render mode meant each mode's readers saw their own and missed the
//      rest. So there is one destination file now; the modes are sections in
//      it, and every mode's own doc points here.
//
// ## The contract
//
// Requests are AUTHORED in the documents listed in `SOURCES` and nowhere else.
// This tool copies their open rounds through verbatim — prompts, constraints,
// tables and all, because the point of the output is that it can be generated
// from without opening a second file, and a summary of a prompt is not a
// prompt. It then resolves the per-fighter rounds against what is actually on
// disk, which is the part a document cannot do for itself.
//
// `--check` fails if the output is stale OR if a source has an open round this
// tool did not recognise. The second half is the guard: a new round written in
// a shape the parser does not match is exactly how 172 images went missing,
// and it now fails a check instead of going quiet.
//
//   node tools/build_image_requests.mjs           # write the doc
//   node tools/build_image_requests.mjs --check   # fail if stale or unparsed
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
// Which fighters carry a weapon, so DI5 knows who owes a second plate. Read
// from the engine's own table rather than listed again here.
import { CHARACTER_PROPS } from "../render3d/src/props.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/image-requests.md");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// Every document allowed to author an image request, and how its rounds are
// spelled. Adding a render mode means adding a row here — and that mode's own
// doc pointing at the output rather than growing a second list.
const SOURCES = [
  {
    mode: "sprite",
    heading: "The sprite game",
    blurb: [
      "Art for the game as a player sees it: `?render=sprite`, the default, and",
      "the path all 27 fighters actually ship on. Keyed plates, delivered to",
      "`assets/intake/`, trimmed and measured on import.",
    ],
    file: "docs/asset-requests.md",
    // "# Round 20 — open" opens the round; its sections are
    // "## 20A. Title — 44 sprites", and the count lives in the heading.
    open: /^# Round (\S+) — open$/m,
    section: /^## (\d+[A-Z])\. ([^\n]*?) — (\d+) (sprites?|images?)$/gm,
  },
  {
    mode: "render3d",
    heading: "The live-3D anime path",
    blurb: [
      "2D images the `?render=3d` pipeline consumes: inputs that models are",
      "GENERATED from, and textures the anime pass reads at runtime. They serve",
      "`?render=billboard` too, which reads the same rigs. These are NOT keyed",
      "plates — each round states its own delivery.",
    ],
    file: "render3d/docs/image-requests.md",
    // No "open round" marker: a DI round stays open per fighter until that
    // fighter's file exists, which is resolved in PER_FIGHTER below.
    open: null,
    section: /^## Round (DI\d) — ([^\n]*)$/gm,
  },
];

// How many sprites carry a workbench flag. Filled in below, before the document
// is assembled --- modeSection needs it and is defined above the point where the
// manifest is read.
let FLAGGED_COUNT = 0;

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

/** Where a round's text stops when it is the last one matched: at the next
 *  `##`. Without this, a file's trailing "Not requested here, on purpose"
 *  section would be copied in as though it were a request. */
function nextTopLevel(body, from) {
  const rest = body.slice(from + 1);
  const m = rest.match(/\n## /);
  return m ? from + 1 + m.index + 1 : body.length;
}

/** WHICH ROUNDS a source's sections actually came from, said as one phrase.
 *
 *  The open marker names the FIRST open round, and for a long time that was
 *  the same thing as "the open round". It is not: rounds 24 and 25 are open
 *  together, the parser sweeps both, and reporting the first one turned
 *  "222 images across two rounds" into "222 asked for by round 25". Derived
 *  from the section ids so it cannot drift from what was copied through. */
function roundsPhrase(source) {
  const nums = [...new Set(source.sections
    .map((s) => (s.id.match(/^(\d+)/) || [])[1])
    .filter(Boolean))];
  if (!nums.length) return source.round ? `round ${source.round}` : "";
  nums.sort((a, b) => Number(a) - Number(b));
  return nums.length === 1 ? `round ${nums[0]}`
    : `rounds ${nums.slice(0, -1).join(", ")} and ${nums.at(-1)}`;
}

/** One source's open rounds, whole. */
function roundsFrom(source) {
  const text = read(source.file);
  let body = text;
  let round = null;
  if (source.open) {
    const m = text.match(source.open);
    if (!m) return { ...source, round: null, sections: [] };
    round = m[1];
    body = text.slice(m.index + m[0].length);
  }
  const hits = [...body.matchAll(source.section)];
  const sections = hits.map((hit, i) => ({
    id: hit[1],
    title: hit[2].replace(/\s*\*\(.*?\)\*\s*$/, "").trim(),
    count: hit[3] ? Number(hit[3]) : null,
    unit: hit[4] || "images",
    text: body.slice(hit.index, i + 1 < hits.length ? hits[i + 1].index : nextTopLevel(body, hit.index)).trim(),
  }));
  return { ...source, round, sections };
}

/** Fighters whose rig has already been delivered. */
function riggedFighters() {
  const file = "render3d/assets/manifest.json";
  if (!exists(file)) return new Map();
  return new Map(Object.entries(JSON.parse(read(file)).characters || {}));
}

/** Sprite poses outstanding by MANIFEST rather than by request: a workbench
 *  flag, or a pose drawing a file that is not its own. Both halves, because
 *  the second raises no flag — which is how seven stayed invisible until 18G.
 *  Neither half can see a pose that was never drawn; that is what the request
 *  documents are for. */
function spriteWork() {
  let flagged;
  try {
    flagged = JSON.parse(execFileSync("python3",
      [path.join(ROOT, "tools/list_replacements.py"), "--json"], { encoding: "utf8", cwd: ROOT }));
  } catch {
    return null; // say we did not check, rather than report a clean sheet
  }
  const man = JSON.parse(read("sprites/assets/manifest.json"));
  const standIns = [];
  for (const [char, poses] of Object.entries(man.characters || {})) {
    for (const [key, meta] of Object.entries(poses)) {
      if (!meta || typeof meta !== "object" || !meta.file) continue;
      // THE FILE DECIDES, `borrowedFrom` ONLY NAMES.
      //
      // Which pose a drawing belongs to is a question about the drawing, and
      // the drawing's name is the answer. `borrowedFrom` records where a
      // borrowed one came from, which is better prose — but it is written when
      // a pose is pointed AT another pose's art and was not cleared when it was
      // pointed back, so nineteen poses claim a source while drawing their own
      // file. It is now banked with the rest of a drawing's fields, and until
      // every one of those has been through a switch it stays the label rather
      // than the test.
      //
      // The delivery suffix comes off first: `incoming/idle_a-2.png` is
      // idle_a's own second delivery, not somebody else's drawing.
      const own = path.basename(meta.file, path.extname(meta.file)).replace(/-\d+$/, "");
      if (own !== key && !meta.awaitingApproval) {
        standIns.push({ char, key, drawing: meta.borrowedFrom || own, file: meta.file });
      }
    }
  }
  return { ...flagged, standIns };
}

// ------------------------------------------------------- per-fighter resolving
//
// What a document cannot say for itself: WHO still owes each per-fighter image.
// A round with no entry here is copied through and counted from its heading.

const blocks = characterBlocks();
const roster = rosterTable();
const rigs = riggedFighters();
const KEYS = [...roster.keys()];
const has = (p) => exists(p);

const PER_FIGHTER = {
  DI1: {
    note: "A fighter whose rig has already been delivered is NOT listed: a turnaround board's only job is to be the thing a model is generated from, and theirs exists.",
    pending: () => KEYS.filter((k) => !rigs.has(k) && !has(`render3d/docs/reference/${k}_turnaround.png`)),
  },
  DI2: {
    note: "Listed for delivered rigs too — this is what the face-first review gate reads AGAINST, so it is wanted whether or not the model exists.",
    pending: () => KEYS.filter((k) => !has(`render3d/docs/reference/${k}_face.png`)),
  },
  DI3: {
    note: "Listed for delivered rigs too: these numbers land in the rig's material extras at intake, and not one delivered rig carries a `toon` block today — all of them are running on engine defaults.",
    pending: () => KEYS.filter((k) => !has(`render3d/docs/reference/${k}_shade.png`)),
  },
  DI4: {
    note: "The shared eye-highlight texture is delivered; these are the optional per-fighter mouth sheets. Nothing ships blocked on one.",
    pending: () => KEYS.filter((k) => !has(`render3d/assets/textures/${k}_mouth_sheet.png`)),
  },
  DI5: {
    note: "Named by MEASUREMENT, not by eye: tools/audit_model_health.py weighs the mesh bound to each limb against the roster's median and reports what cannot be true of a body. A fighter leaves this list when a replacement board lands — not when their model is regenerated, since regenerating from the same board is what produced the fault.",
    // The one round whose list is not "who is missing a file" but "whose
    // delivered model is broken". Read from the audit's own output so the
    // request and the evidence cannot drift apart; the fallback is the
    // hand-listed five, so the doc still builds on a machine without Blender.
    pending: () => {
      const named = health().length ? health() : ["momo", "meimei", "maki", "gakuganji", "uro"];
      // Owed the board, and — for a fighter who carries one — the weapon plate
      // beside it. Uro has no weapon, so she owes one file and not two.
      return named.filter((k) => !has(`render3d/docs/reference/${k}_turnaround.png`)
        || ((CHARACTER_PROPS[k] || []).length && !has(`render3d/docs/reference/${k}_prop.png`)));
    },
  },
};

/** Fighters the model-health audit flags as unrepairable, newest run.
 *  Empty when the audit has never been run — the caller falls back. */
function health() {
  const p = "render3d/docs/reference/model-health.json";
  if (!exists(p)) return [];
  try {
    const rows = JSON.parse(read(p)).rows || [];
    return rows
      .filter((r) => (r.findings || []).some((f) => /NOT RECONSTRUCTED|FUSED INTO|ABOVE the head/.test(f)))
      .map((r) => r.char);
  } catch { return []; }
}

// ------------------------------------------------------------------- rendering

// EVERY REFERENCE OUT OF THIS FILE IS A FULL URL, because the file's reader is
// not standing in the repository. It is handed to an image generator that has
// the document and nothing else --- no working copy, no directory structure --
// so `../assets/reference/canon/yuji_idle.png` is not a reference to anything
// it can reach, and `see pose-brief.md` is a dead end.
//
// The one exception is where a file GOES. An output path is an instruction to
// the person landing the delivery, who does have the repo, and a URL there
// would be wrong in a different way: you cannot write to raw.githubusercontent.
const RAW = "https://raw.githubusercontent.com/hoai2k/jjkbrawler/main";

const TREE = "https://github.com/hoai2k/jjkbrawler/tree/main";

/** A repo-relative path as something a reader can actually fetch.
 *
 *  A DIRECTORY takes the tree URL instead, because raw.githubusercontent does
 *  not list directories --- it 404s. `assets/reference/canon/` linked into raw
 *  is a dead link, which is worse than the relative path it replaced: relative
 *  at least tells you what to go and look for. */
const rawUrl = (repoPath) => {
  const clean = repoPath.replace(/^\.?\//, "");
  return clean.endsWith("/") ? `${TREE}/${clean.replace(/\/+$/, "")}` : `${RAW}/${clean}`;
};

const linkTo = (file) => rawUrl(file);

/** Rewrite the relative links inside text this tool copies through.
 *
 *  Round text is reproduced VERBATIM --- that is the point of it, a summary of
 *  a prompt is not a prompt --- and it was authored in a document that sits
 *  beside the things it links to. Copied here it keeps those relative targets
 *  and they all break, so they are resolved against the SOURCE file's directory
 *  and turned into URLs on the way through. Editing a round with an ordinary
 *  relative link therefore still produces a usable one in the output, which is
 *  the right place for this rule to live: the author should not have to
 *  remember it, and the reader cannot do without it.
 *
 *  Left alone: anything already absolute, and a bare `#anchor`, which points
 *  inside the output and still resolves there.
 */
function absolutise(text, sourceFile) {
  const dir = path.dirname(sourceFile);
  return text.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (whole, target, title) => {
    if (/^(https?:|mailto:|#)/.test(target)) return whole;
    const [file, hash = ""] = target.split(/(?=#)/);
    // A link to the generated file itself becomes the anchor alone: the reader
    // is already holding it, and sending them to a raw URL of the page they are
    // reading is worse than a jump.
    // normalize() drops a trailing slash and the slash is what says "directory",
    // so it is put back before rawUrl decides which host to use.
    // normalize() keeps a trailing slash where there was one, and the slash is
    // what says "directory" — but only where it survived, so the marker is
    // re-derived from the ORIGINAL target rather than appended blind.
    const resolved = path.posix.normalize(path.posix.join(dir, file))
      .replace(/\/*$/, file.endsWith("/") ? "/" : "");
    if (resolved === "docs/image-requests.md") return hash ? `](${hash})` : "](#)";
    return `](${rawUrl(resolved)}${hash})${title ? "" : ""}`;
  });
}

const fighterRow = (k) => {
  const r = roster.get(k) || {};
  const canon = ["_idle", "_anime", "_canon"]
    .map((s) => `assets/reference/canon/${k}${s}.png`).find(has) || "—";
  return { name: r.name || k, height: r.height || "—",
           archetype: r.archetype || "—", notes: r.notes || "", canon };
};

/** A copied section, with its links repointed at the file that owns it. Bare
 *  `#anchors` name headings that live THERE, not here, and a source outside
 *  docs/ has relative links rooted at its own directory. A link that silently
 *  goes nowhere is the failure check_doc_links.py exists to catch. */
function sectionText(section, source) {
  const owner = linkTo(source.file);
  // A bare `#anchor` inside a copied round points into the document that
  // AUTHORED it, not into this one, so it has to name that document before
  // absolutise() sees it — otherwise it would be left alone as a same-page jump
  // and land nowhere.
  const text = section.text.replace(/\]\(#/g, `](${owner}#`);
  return absolutise(text, source.file);
}

function renderSection(section, source) {
  const out = [sectionText(section, source), ""];
  const per = PER_FIGHTER[section.id];
  if (!per) return out.join("\n");
  const pending = per.pending();
  out.push(`### ${section.id}: who is still owed one — ${pending.length} of ${KEYS.length}`, "", per.note, "");
  if (!pending.length) {
    out.push("**Nothing outstanding.** Every fighter has one.", "");
    return out.join("\n");
  }
  out.push("| Fighter | Key | Model at | Archetype | Canon reference | Notes |",
           "|---|---|---|---|---|---|");
  for (const k of pending) {
    const f = fighterRow(k);
    // The canon reference is the SUBJECT of the drawing, so it is the one link
    // in the table that has to be fetchable rather than merely named.
    out.push(`| ${f.name} | \`${k}\` | ${f.height} | ${f.archetype} | `
      + `${f.canon === "—" ? "—" : `[${path.basename(f.canon)}](${rawUrl(f.canon)})`} | ${f.notes || "—"} |`);
  }
  out.push("");
  return out.join("\n");
}

const countOf = (s) => s.count ?? (PER_FIGHTER[s.id] ? PER_FIGHTER[s.id].pending().length : 0);
const totalOf = (source) => source.sections.reduce((n, s) => n + countOf(s), 0);

function modeSection(source) {
  const out = [`# ${source.heading}`, "", ...source.blurb, ""];
  if (!source.sections.length) {
    // "No open round" is not "nothing to draw", and for the sprite mode it can
    // be flatly wrong: the flagged sprites are images for this same game and
    // this line sat directly under a headline counting them. Say which of the
    // two is true.
    const flags = source.mode === "sprite" && FLAGGED_COUNT;
    out.push(`**No open round** in [${path.basename(source.file)}](${linkTo(source.file)}).`
      + (flags
          ? ` ${flags} image${flags === 1 ? " is" : "s are"} still outstanding for this mode —`
            + " they are flagged in the workbench rather than asked for by a round, and they are"
            + " in [Outstanding by manifest, not by request](#outstanding-by-manifest-not-by-request)."
          : " Nothing outstanding here."), "");
    return out.join("\n");
  }
  const total = totalOf(source);
  const flags = source.mode === "sprite" ? FLAGGED_COUNT : 0;
  out.push(`**${total + flags} image${total + flags === 1 ? "" : "s"} outstanding for this mode.**`
    + ` ${total}${source.round ? ` asked for by ${roundsPhrase(source)}` : ""}, authored in`,
    `[${source.file}](${linkTo(source.file)}) and reproduced whole below`
    + (flags
        ? `, and ${flags} flagged in the workbench and listed in`
          + " [Outstanding by manifest, not by request](#outstanding-by-manifest-not-by-request)."
        : "."), "");
  for (const s of source.sections) out.push(`- **${s.id}** — ${s.title} (${countOf(s)} ${s.unit})`);
  out.push("");
  for (const s of source.sections) out.push(renderSection(s, source));
  return out.join("\n");
}

function blocksSection(keys) {
  const out = ["# The character blocks", "",
    "Used **verbatim** as `[CHARACTER BLOCK]` in every prompt above — this is how",
    "a fighter stays the same character across their sprites, their card and",
    "their turnaround. Reproduced from",
    `[asset-requests.md](${rawUrl("docs/asset-requests.md")}#character-blocks), which owns them.`,
    "",
    "**Where the block and the canon reference disagree, the reference wins.**",
    "Every fighter now has a `<char>_idle.png`, regenerated from their approved",
    "idle, and it carries the figure scale, palette and shading the delivered set",
    "actually has — which block text cannot. The wiki's (Anime) render answers",
    "design questions the reference leaves open, and is where the blocks came",
    "from: three were rewritten in round 9E because they described characters who",
    "looked nothing like their anime designs, and Uro's again in round 18 after an",
    "ambiguous sentence was drawn the wrong way twice.",
    "", "| Key | Block |", "|---|---|"];
  for (const k of keys) {
    // The block's key-screen marker is dropped here: whether a plate is keyed
    // depends on which round is drawing it, and both answers appear in this file.
    const b = blocks.get(k);
    if (b?.block) out.push(`| \`${k}\` | ${b.block} |`);
  }
  out.push("");
  return out.join("\n");
}

/** A fighter's name as a reader knows them, falling back to their key. Both
 *  halves of the manifest table print a fighter, and one of them used to print
 *  the raw key while the other printed the name, which reads as two different
 *  fighters in one table. */
function nameOf(charKey) {
  return roster.get(charKey)?.name || charKey;
}

/** The fighter's approved idle, as something the reader can fetch. Every table
 *  that asks for a drawing carries one: the rule at the top of the file says
 *  the canon reference is the subject, and a rule you cannot act on is a
 *  sentence. `—` where no canon plate has been built yet. */
function canonLink(charKey) {
  const canon = ["_idle", "_anime", "_canon"]
    .map((suffix) => `assets/reference/canon/${charKey}${suffix}.png`).find(exists);
  return canon ? `[${path.basename(canon)}](${rawUrl(canon)})` : "—";
}

function manifestSection(work) {
  const out = ["# Outstanding by manifest, not by request", "",
    "The other half of the question, and a narrower one: poses whose art EXISTS",
    "and is wrong. A workbench flag says so directly; a pose drawing a file that",
    "is not its own says so silently, which is how seven of them stayed invisible",
    "until round 18G. Neither can see a pose that was never drawn — that is what",
    "the rounds above are for.", ""];
  if (!work) {
    out.push("**Not checked**: `tools/list_replacements.py` would not run, and this",
      "section is worth nothing unless it actually read the manifest.", "");
    return out.join("\n");
  }
  // A DELETE IS NOT A REQUEST. Every other flag in here is somebody asking for
  // a drawing; `delete` is the one kind that asks for the opposite — "we have
  // something better, throw this one away" (REPLACEMENT_KINDS in
  // sprites/src/sprites.js). Counted with the rest it made this document ask
  // for twelve images when three were owed, and a generator handed the file
  // rightly refused to draw the other nine. They keep their own table below,
  // where the ask is legible as the cleanup it is.
  const flagged = work.replacements;
  if (!flagged.length && !work.standIns.length) {
    out.push("**Nothing outstanding.** No pose carries a replacement flag, and no pose is",
      "drawing a file that is not its own.");
  } else {
    // A POSE IS ONE ROW, AND THE ROW IS ABOUT THE POSE.
    //
    // A flag is raised on the pose being edited — `attack_light_a` — and says
    // nothing about the FILE that pose happens to be drawing, which may belong
    // to another pose entirely. Both facts used to be in this table as two
    // separate rows thirty lines apart: a flagged row showing
    // `attack_heavy_a.png` as "the drawing now" with nothing to say it was a
    // stand-in, and a stand-in row that said so but did not carry the flag's
    // note. Read on its own — which is how a table gets read — the first row
    // shows an artist a heavy attack and asks them to fix a light one.
    const borrowed = new Map(work.standIns.map((s) => [`${s.char}/${s.key}`, s]));
    const seen = new Set();
    out.push(`**${flagged.length} flagged, ${work.standIns.length} drawing somebody else's art**`
      + `${[...borrowed.keys()].filter((k) => flagged.some((r) => `${r.char || r.character}/${r.key || r.frame}` === k)).length
          ? ` (they overlap: a flagged pose can also be one)` : ""}.`, "",
      // The drawing that is wrong, and the fighter it has to look like. Naming
      // a pose is enough for somebody standing in the repo and no use at all to
      // the reader this file is written for, who cannot open
      // `gakuganji/attack_light_b.png` and has no idea what is wrong with it
      // until they can see it.
      "| Fighter | Pose | Why | What is wrong | The drawing now | Canon reference |",
      "|---|---|---|---|---|---|");
    for (const r of flagged) {
      const char = r.char || r.character;
      const key = r.key || r.frame;
      seen.add(`${char}/${key}`);
      const stand = borrowed.get(`${char}/${key}`);
      // The drawing shown is another pose's, so say whose. Without this the
      // column reads as "here is the art for this pose", which is the one
      // thing it is not.
      const shown = r.file
        ? `[${path.basename(r.file)}](${rawUrl(`sprites/assets/${r.file}`)})`
          + (stand ? ` — \`${stand.drawing}\`'s drawing, not \`${key}\`'s` : "")
        : "—";
      out.push(`| ${r.name || nameOf(char)} | \`${key}\` | ${r.kind || r.reason || "flagged"} `
        + `| ${r.note || "—"} | ${shown} | ${canonLink(char)} |`);
    }
    for (const s of work.standIns) {
      if (seen.has(`${s.char}/${s.key}`)) continue;
      out.push(`| ${nameOf(s.char)} | \`${s.key}\` | drawing another pose's file | it is \`${s.drawing}\`, not \`${s.key}\` `
        + `| [${path.basename(s.file || `${s.drawing}.png`)}](${rawUrl(`sprites/assets/${s.file || `${s.char}/${s.drawing}.png`}`)}) | ${canonLink(s.char)} |`);
    }
  }
  out.push("");
  if (work.deletions.length) {
    // COUNTED, ATTRIBUTED, AND NOT SPELLED OUT. There are dozens of these and
    // they are all the same instruction — a fifty-row table of files to throw
    // away, in a document about files to draw, buries the three drawings
    // somebody is actually owed. The per-fighter tally says whether the
    // cleanup is one fighter's mess or the roster's, and the tool that owns
    // the list prints it in full.
    const byChar = new Map();
    for (const r of work.deletions) {
      const name = r.name || nameOf(r.character);
      byChar.set(name, (byChar.get(name) || 0) + 1);
    }
    const tally = [...byChar.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, n]) => `${name} ${n}`).join(", ");
    // Deliberately NOT reporting how many are the "selected" drawing of their
    // pose. It sounds like the safety question and is not it: a pose entry can
    // name a file that no state plays, and 47 of the first 56 were exactly
    // that — dead sheet cells. The question that matters is whether the GAME
    // draws it, which apply_deletions.mjs asks of resolvedAnim per character
    // and answers in its plan. A second, wronger answer here would just get
    // believed.
    out.push(`Separately, **${work.deletions.length} variant drawing${work.deletions.length === 1 ? " is" : "s are"} tagged for deletion** —`,
      "discarded at the next cleanup. **Not an image request and not counted above**:",
      "the ask is to throw a drawing away, not to draw one, and the pose keeps",
      "whichever drawing is selected.", "",
      `By fighter: ${tally}.`, "",
      "`node tools/apply_deletions.mjs` carries them out — it deletes each drawing",
      "and every reference to it, and holds anything the game is still drawing.",
      "`python3 tools/list_replacements.py` prints them file by file, and the sprite",
      "workbench is where the tags are set and cleared.", "");
  }
  if (work.improvements.length) {
    out.push(`Separately, **${work.improvements.length} improvement request${work.improvements.length === 1 ? "" : "s"}** — the art works and is just`,
      "not as good as it should be. Nothing is blocked by one, and the standing",
      "ones are alpha fixes to delivered files, which is repo work rather than a",
      "request.", "");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------- output

const sources = SOURCES.map(roundsFrom);
const total = sources.reduce((n, s) => n + totalOf(s), 0);

// THE HEADLINE STATES THE TOTAL, AND A ZERO NEVER LEADS IT.
//
// If you are rewriting this line, that is the rule, and it has now been broken
// twice in opposite directions:
//
//   1. It counted only images a ROUND asks for, so it read "0 images
//      outstanding" above a section listing 28 flagged sprites. Somebody who
//      had spent an afternoon flagging them came away thinking the flags had
//      gone nowhere.
//   2. Fixing that by printing both numbers --- "0 images requested by a round,
//      and 29 sprites flagged in the workbench" --- STILL OPENED WITH A ZERO,
//      and an image generator reading the first bold line took the zero and
//      stopped. Accurate, and no better.
//
// So: one number, and it is everything outstanding. The breakdown goes
// underneath, where it explains the total rather than competing with it. The
// two kinds of work are still worth telling apart --- a round knows about art
// that is ABSENT, the manifest knows about art that EXISTS AND IS WRONG, and
// they are answered differently --- but that is a detail of HOW, and the
// headline answers WHETHER.
//
// A zero here has to mean nothing is outstanding, and nothing else, or the line
// cannot be trusted the one time it says so.
const work = spriteWork();
// Replacements ONLY. A `delete` tag is the one flag that is not an ask to draw
// — see the note in manifestSection — and it spent its time in this number
// making the headline promise nine images that nobody wanted drawn.
const flaggedN = work ? work.replacements.length : null;
const deleteN = work ? work.deletions.length : null;
const standInN = work ? work.standIns.length : null;
// Stand-ins are NOT counted as outstanding. A pose drawing another pose's file
// is usually a deliberate substitution somebody picked in the workbench --- the
// borrow that fixed an inverted attack pair is one --- so counting them as
// images to draw would inflate the total with decisions that have already been
// made. They are reported in their own section, where the number can be read
// as what it is.
const outstanding = total + (flaggedN || 0);
FLAGGED_COUNT = flaggedN || 0;

const doc = [
  "# Image Requests — every image still to draw",
  "",
  "**This is the one image-request document.** Every render mode's requests are",
  "here, in their own section, whatever pipeline they feed. If you are drawing",
  "or generating anything 2D for this project, this file is the list, and the",
  "per-mode documents point here rather than keeping their own.",
  "",
  "**It is generated** by `node tools/build_image_requests.mjs` from the",
  "documents that author each round, plus the manifests and the files on disk.",
  "Do not edit it; edit the source round and re-run. `--check` fails when it is",
  "stale, and also when a source has an open round the tool did not recognise —",
  "that second one is the guard, because a round written in an unexpected shape",
  "is exactly how 172 images once went missing from this list.",
  "",
  outstanding
    ? `**${outstanding} image${outstanding === 1 ? "" : "s"} outstanding.** Every one of them is`
      + " listed below, with a full URL for anything you need to look at."
    : flaggedN === null
      ? "**Nothing outstanding in the rounds** — and the manifest was not checked,"
        + " so this is not a clean sheet, only half an answer."
      : "**Nothing to draw.** No open round asks for an image, and no pose"
        + " carries a replacement flag."
        + (deleteN
            ? ` ${deleteN} variant drawing${deleteN === 1 ? " is" : "s are"} tagged for deletion,`
              + " which is a cleanup rather than a request."
            : ""),
  "",
  ...(outstanding
    ? [
      ...sources.map((s) => {
        const n = totalOf(s);
        // The sprite mode owns the flagged sprites too — they are images for
        // the same game, and splitting them into a third bullet made the mode's
        // own line read 0 while 29 of its images were outstanding.
        const own = s.mode === "sprite" ? n + (flaggedN || 0) : n;
        const parts = [];
        if (n) parts.push(`${n} asked for by ${roundsPhrase(s)}`);
        if (s.mode === "sprite" && flaggedN) {
          parts.push(`[${flaggedN} flagged in the workbench](#outstanding-by-manifest-not-by-request)`
            + " as art that exists and is wrong");
        }
        return `- **${s.heading}** — ${own} image${own === 1 ? "" : "s"}`
          + (parts.length ? `: ${parts.join(", plus ")}` : "");
      }),
      ...(standInN
        ? [`- Separately, ${standInN} pose${standInN === 1 ? " is" : "s are"} drawing another pose's`
           + " file. Not counted above: those are substitutions somebody chose, not images anybody is owed."]
        : []),
      ...(deleteN
        ? [`- Separately, ${deleteN} variant drawing${deleteN === 1 ? " is" : "s are"} tagged for`
           + " [deletion](#outstanding-by-manifest-not-by-request). Not counted above: that is a"
           + " cleanup in the repository, not an image anybody is owed."]
        : []),
    ]
    : []),
  "",
  "## Rules that hold everywhere here",
  "",
  "- **The canon reference is the subject.** A fighter's own `<char>_idle.png`",
  "  at `" + RAW + "/assets/reference/canon/<char>_idle.png`",
  "  carries their costume, proportions, palette,",
  "  line weight and shading. The drawing is that character, not an",
  "  interpretation of them.",
  "- **The character block goes in the prompt verbatim.** All of them are at the",
  "  bottom of this file.",
  "- **Any subset is useful.** Everything here lands per fighter or per file, and",
  "  anything undelivered keeps whatever the engine does today. Nothing in this",
  "  file blocks play.",
  "- **Every reference here is a full URL, and every OUTPUT path is relative.**",
  "  That is the whole convention, and the two are never mixed. Anything you have",
  "  to look at — a canon reference, the drawing being replaced, a brief, another",
  "  document — is an `https://raw.githubusercontent.com/…` link you can fetch",
  "  without a copy of the repository. Anything you have to NAME, like",
  "  `kashimo/teeter.png`, is where the delivered file goes once somebody lands",
  "  it in `assets/intake/`, and stays relative because you cannot write to a",
  "  raw URL.",
  "",
  "**The modes want opposite deliveries, and it is the one thing worth not",
  "getting wrong.** Sprite rounds are keyed plates — flat magenta `#FF00FF` or",
  "grey `#808080` screen, one subject, margin on all four sides, trimmed at",
  "intake. The 3D inputs are the reverse: a turnaround wants clean white or",
  "transparency, a swatch sheet wants labels, and nothing about them is keyed or",
  "trimmed. Applying either mode's rules to the other produces a file its",
  "pipeline cannot use. Each section states its own.",
  "",
  "---",
  "",
  ...sources.map(modeSection).flatMap((s) => [s, "---", ""]),
  blocksSection(KEYS.filter((k) => blocks.has(k))),
  "---",
  "",
  manifestSection(work),
].join("\n").replace(/\n{3,}/g, "\n\n");

// The guard: a source that has an open round we recognised nothing in.
const unparsed = sources.filter((s) => {
  if (s.sections.length) return false;
  if (s.open && !read(s.file).match(s.open)) return false; // no open round at all, fine
  return true;
});

if (process.argv.includes("--check")) {
  let failed = 0;
  for (const s of unparsed) {
    console.log(`FAIL ${s.file} has an open round this tool parsed nothing out of`);
    failed++;
  }
  if ((exists("docs/image-requests.md") ? read("docs/image-requests.md") : "") !== doc) {
    console.log("FAIL docs/image-requests.md is stale — run: node tools/build_image_requests.mjs");
    failed++;
  }
  if (!failed) console.log(`ok   docs/image-requests.md is up to date — ${outstanding} image(s) outstanding`);
  process.exit(failed ? 1 : 0);
}

for (const s of unparsed) {
  console.log(`WARNING ${s.file} has an open round but nothing was parsed out of it`);
}
fs.writeFileSync(OUT, doc);
console.log(`wrote docs/image-requests.md — ${outstanding} image(s) outstanding`
  + (FLAGGED_COUNT ? ` (${total} by round, ${FLAGGED_COUNT} flagged)` : ""));
for (const s of sources) {
  for (const sec of s.sections) {
    console.log(`  ${s.mode.padEnd(9)} ${sec.id.padEnd(4)} ${String(countOf(sec)).padStart(3)}  ${sec.title}`);
  }
}
