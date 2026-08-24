// MERGE A VERIFICATION EXPORT INTO THE CONFIG IT BELONGS IN.
//
// The bench downloads one `verification-decisions.json` carrying every set's
// work. This reads that file and writes each set's decisions into the file
// that owns the answer — MERGING them, one key at a time, over whatever is
// there now.
//
// WHY MERGING RATHER THAN PASTING, WHICH IS WHAT THIS REPLACES.
//
// Three sets used to export the WHOLE config: everything already committed,
// plus the sitting on top, as a block you pasted over the file. The reasoning
// was sound as far as it went — a block carrying only the sitting, pasted over
// the file, would truncate every answer given before it.
//
// But it makes the export a snapshot of the tree AS THE BENCH LOADED IT, and a
// bench is open for as long as somebody is working. Two sittings from one page
// load, or a page load that predates a commit, and the second export carries
// stale values for rows the first one changed — and pasting it reverts them
// with nothing to say it did. That is not hypothetical: export 20 of the
// strike points was taken from a bench that had never seen export 19, and its
// text would have rolled back five points and dropped a sixth.
//
// A merge cannot do that. It only ever touches the keys a person actually
// decided on in that sitting, so a stale row is not a revert, it is simply
// absent. So the exports now carry the CHANGES, and this is what applies them.
//
// The two anchor-backed sets are not here: they already exported this way,
// into the sprite-adjustments shape, and tools/apply_sprite_adjustments.py
// already merges them. Pass their payload to that instead — this says so if it
// finds one.
//
// Usage:
//   node tools/apply_verification.mjs verification-decisions.json [--dry-run]
import { readFile, writeFile } from "node:fs/promises";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const path = argv.find((a) => !a.startsWith("--"));
if (!path) {
  console.error("usage: node tools/apply_verification.mjs <decisions.json> [--dry-run]");
  process.exit(2);
}

const ROOT = new URL("../", import.meta.url);
globalThis.fetch = async (url) => {
  const body = await readFile(new URL(String(url).replace(/^\.?\//, ""), ROOT), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};

const { loadCoreAssets, frameMeta } = await import("../src/assets.js");
await loadCoreAssets();
const { gameToImage } = await import("../src/strike_points.js");
const { bodyMetrics } = await import("../src/silhouette.js");

const doc = JSON.parse(await readFile(path, "utf8"));
const sets = doc?.sets || {};
const applied = [];
const notes = [];

/** Rewrite one `export const NAME = { … };` block in a config file, leaving
 *  every other line — the doc comments especially — exactly where it was. */
async function rewrite(file, blocks) {
  const url = new URL(file, ROOT);
  let lines = (await readFile(url, "utf8")).split("\n");
  for (const [name, body] of blocks) {
    const a = lines.findIndex((l) => l.startsWith(`export const ${name} `));
    if (a < 0) throw new Error(`${file}: no 'export const ${name}'`);
    const b = lines.indexOf("};", a);
    if (b < 0) throw new Error(`${file}: 'export const ${name}' never closes`);
    lines = [...lines.slice(0, a), ...body.split("\n"), ...lines.slice(b + 1)];
  }
  if (!DRY) await writeFile(url, lines.join("\n"));
}

/** One entry per LINE, nested under its character — the shape these configs
 *  are already written in. Worth preserving deliberately: a merge tool that
 *  reflows the file buries three changed numbers in a four-hundred-line diff,
 *  and the point of merging rather than pasting was that a reviewer can see
 *  exactly what moved. */
// KEY ORDER IS THE FILE'S, NOT THE ALPHABET'S.
//
// Every writer here rebuilds a whole block from a clone of the config, so what
// it emits for the rows nobody touched has to be byte-identical to what was
// there — otherwise a one-line decision arrives as a 34-line diff and the one
// line that matters is invisible in it. Sorting the INNER keys did exactly
// that to HURTBOX_FIT, whose cases are written in the order a body goes
// through them (stand, crouch, air, hurt, prone, tumble, ledge) rather than in
// the order of the alphabet. A clone preserves insertion order, so keeping it
// preserves the file; a genuinely new key lands at the end, where it is easy
// to see. Characters stay sorted — that IS the file's order for the outer
// level, and a new fighter belongs in their alphabetical place.
const keysOf = (o) => Object.keys(o);

const nested = (obj, fmt) => Object.keys(obj).sort().map((c) =>
  `  ${JSON.stringify(c)}: {\n`
  + keysOf(obj[c]).map((k) => `    ${k}: ${fmt(obj[c][k])},`).join("\n")
  + `\n  },`).join("\n");

const live = (d) => d.status !== "skipped" && d.status !== "rejected";
const day = (d) => (d.at || "").slice(0, 10);

// ------------------------------------------------------- per-character keys
//
// Both are FRACTIONS OF DRAWN HEIGHT, per fighter, living in BODY_POINTS
// beside each other — `com` always was, and `muzzle` is since the roster went
// to 70% and every muzzle placed in pixels stayed where the old bodies had put
// it. The bench drags in game px either way; the division is here, once, so a
// decision is stored in units of the body it was made about.

async function bodyPoints() {
  const com = sets["center-of-mass"]?.decisions?.filter(live) || [];
  const muzzle = sets["muzzle-points"]?.decisions?.filter(live) || [];
  if (!com.length && !muzzle.length) return;

  const { BODY_POINTS, BODY_POINT_META } = await import("../src/config_body_points.js");
  const points = structuredClone(BODY_POINTS);
  const meta = structuredClone(BODY_POINT_META);

  for (const d of com) {
    const h = bodyMetrics(d.char).height;
    const was = points[d.char]?.com;
    const now = +(-d.value.y / h).toFixed(3);
    (points[d.char] ??= {}).com = now;
    ((meta[d.char] ??= {})).com = { at: day(d), ...(d.note ? { note: d.note } : {}) };
    applied.push(`  com      ${d.char.padEnd(12)} ${was ?? "—"} -> ${now}`);
  }
  for (const d of muzzle) {
    const h = bodyMetrics(d.char).height;
    const was = points[d.char]?.muzzle;
    const now = { x: +(d.value.x / h).toFixed(4), y: +(d.value.y / h).toFixed(4) };
    (points[d.char] ??= {}).muzzle = now;
    ((meta[d.char] ??= {})).muzzle = { at: day(d), ...(d.note ? { note: d.note } : {}) };
    applied.push(`  muzzle   ${d.char.padEnd(12)} ${was ? `${was.x},${was.y}` : "—"} -> ${now.x},${now.y}`);
  }

  const render = (obj, fmt) => Object.keys(obj).sort().map((c) => {
    const inner = keysOf(obj[c]).map((k) => `${k}: ${fmt(obj[c][k])}`).join(", ");
    return `  ${JSON.stringify(c)}: { ${inner} },`;
  }).join("\n");

  await rewrite("src/config_body_points.js", [
    ["BODY_POINTS", `export const BODY_POINTS = {\n`
      + render(points, (v) => (typeof v === "number" ? String(v) : `{ x: ${v.x}, y: ${v.y} }`))
      + `\n};`],
    ["BODY_POINT_META", `export const BODY_POINT_META = {\n`
      + render(meta, (v) => `{ at: ${JSON.stringify(v.at)}`
          + (v.note ? `, note: ${JSON.stringify(v.note)}` : "") + ` }`)
      + `\n};`],
  ]);
}

// ------------------------------------------------------------ strike points
//
// Keyed by the DRAWING rather than the state, and stored in the drawing's own
// pixels, so a point survives the sprite being nudged or resized.

async function strikePoints() {
  const decisions = sets["strike-points"]?.decisions?.filter(live) || [];
  if (!decisions.length) return;

  const { STRIKE_POINTS, STRIKE_POINT_META } = await import("../src/config_strike_points.js");
  const points = structuredClone(STRIKE_POINTS);
  const meta = structuredClone(STRIKE_POINT_META);

  for (const d of decisions) {
    if (!d.frame) { notes.push(`  ! ${d.id}: no frame recorded, skipped`); continue; }
    const img = gameToImage(d.char, d.frame, d.value.x, d.value.y);
    if (!img) { notes.push(`  ! ${d.id}: frame does not resolve, skipped`); continue; }
    const was = points[d.char]?.[d.frame];
    const now = {
      x: Math.round(img.x * 10) / 10, y: Math.round(img.y * 10) / 10,
      // The file the point was placed against. `committed` compares it, so a
      // redraw reopens the question instead of inheriting an answer about a
      // picture that is gone.
      file: frameMeta(d.char, d.frame)?.file || was?.file || null,
    };
    (points[d.char] ??= {})[d.frame] = now;
    const held = meta[d.char]?.[d.frame];
    (meta[d.char] ??= {})[d.frame] = {
      at: day(d),
      states: [...new Set([...(held?.states || []), d.state].filter(Boolean))],
      ...(d.note ? { note: d.note } : {}),
    };
    applied.push(`  strike   ${d.char.padEnd(12)} ${d.frame.padEnd(18)}`
      + `${was ? `${was.x},${was.y}` : "—"} -> ${now.x},${now.y}`);
  }

  await rewrite("src/config_strike_points.js", [
    ["STRIKE_POINTS", `export const STRIKE_POINTS = {\n`
      + nested(points, (v) => `{ x: ${v.x}, y: ${v.y}, file: ${JSON.stringify(v.file)} }`)
      + `\n};`],
    ["STRIKE_POINT_META", `export const STRIKE_POINT_META = {\n`
      + nested(meta, (v) => `{ at: ${JSON.stringify(v.at)}, states: ${JSON.stringify(v.states)}`
          + (v.note ? `, note: ${JSON.stringify(v.note)}` : "") + ` }`)
      + `\n};`],
  ]);
}

// -------------------------------------------------------------- hurtbox fit
//
// Multipliers and shifts RELATIVE to the box combat.js derives, per fighter
// and per case, with the art token they were judged against beside them.

async function hurtboxFit() {
  const decisions = sets["hurtbox-fit"]?.decisions?.filter(live) || [];
  if (!decisions.length) return;

  const { HURTBOX_FIT, HURTBOX_FIT_ART } = await import("../src/config_body_points.js");
  const fits = structuredClone(HURTBOX_FIT);
  const art = structuredClone(HURTBOX_FIT_ART || {});

  for (const d of decisions) {
    const key = d.case || d.kind;
    if (!key) { notes.push(`  ! ${d.id}: no case recorded, skipped`); continue; }
    (fits[d.char] ??= {})[key] = d.value;
    if (d.art) (art[d.char] ??= {})[key] = d.art;
    applied.push(`  hurtbox  ${d.char.padEnd(12)} ${key}`);
  }

  const render = (obj, fmt) => Object.keys(obj).sort().map((c) =>
    `  ${JSON.stringify(c)}: { ` + keysOf(obj[c])
      .map((k) => `${k}: ${fmt(obj[c][k])}`).join(", ") + ` },`).join("\n");
  const num = (v) => (Math.round(v * 1000) / 1000);

  await rewrite("src/config_body_points.js", [
    ["HURTBOX_FIT", `export const HURTBOX_FIT = {\n`
      + render(fits, (v) => `{ `
          + Object.entries(v).map(([k, n]) => `${k}: ${num(n)}`).join(", ") + ` }`)
      + `\n};`],
    ["HURTBOX_FIT_ART", `export const HURTBOX_FIT_ART = {\n`
      + render(art, (v) => JSON.stringify(v))
      + `\n};`],
  ]);
}

await bodyPoints();
await strikePoints();
await hurtboxFit();

for (const id of Object.keys(sets)) {
  const spriteShaped = /^(frame-com|grab-hand|grab-chest|teeter-foot|ledge-grip)$/.test(id);
  if (spriteShaped && sets[id].decisions?.some(live)) {
    notes.push(`  ! "${id}" writes the sprite manifest — save its \`apply\` block and run:`);
    notes.push("      python3 tools/apply_sprite_adjustments.py <that file>");
  }
}

if (applied.length) {
  console.log(`${applied.length} change(s)${DRY ? " (dry run — nothing written)" : ""}:\n`);
  console.log(applied.join("\n"));
} else {
  console.log("nothing to apply from this file.");
}
if (notes.length) console.log(`\n${notes.join("\n")}`);
