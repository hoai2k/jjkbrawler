// DOES THE SAME MOVE READ THE SAME WAY ON EVERY FIGHTER?
//
//     node tools/check_strike_arcs.mjs
//
// The strike arc is the only thing on screen that says where an attack
// threatens (src/render.js drawStrikeArcs). It is drawn from the hitbox, which
// is right — but WHICH WAY a swing comes out is not something a rectangle
// knows, and for a long time this was guessed from the box's aspect ratio.
//
// That guess made the picture a fact about ARM LENGTH. An up attack's box is
// as wide as the fighter's reach, so a long-armed fighter's box came out wider
// than it was tall, failed the "taller than wide, so it must be vertical"
// test, and fell through to the sideways branch — drawing two crescents at
// their sides, for the same move that drew one over a short-armed fighter's
// head. Reported from play, and confirmed: Maki, Uro, Yuta, Miwa and Toji drew
// their up attack sideways while everyone else drew it overhead.
//
// It was never stable either. Nineteen of thirty-four fighters sat within
// 20 px of that line and five within 5 — Toji was ONE PIXEL from reading as a
// different attack, so a nudge in the sprite workbench could have flipped him.
//
// So `straddle()` labels each move with the way it sweeps and `strikeArcs`
// reads the label. This checks the property that follows: a move's arc is a
// fact about the MOVE, identical on all thirty-four fighters. The aspect-ratio
// guess survives as the fallback for boxes nobody labels — projectiles,
// specials, summon strikes — and the last case here holds it to that job.
//
// Run by `npm run check`.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const href = typeof url === "string" ? url : url.href;
  if (!href.startsWith("file:")) return realFetch(url);
  const text = await readFile(fileURLToPath(href), "utf8");
  return { ok: true, json: async () => JSON.parse(text), text: async () => text };
};

const { loadCoreAssets } = await import("../src/assets.js");
await loadCoreAssets();
const { CHARACTERS, CHARACTER_KEYS } = await import("../src/characters.js");
const { lightMove, heavyMove, strikeArcs } = await import("../src/moves.js");
const { bodyMetrics } = await import("../src/silhouette.js");

let bad = 0;
const fail = (msg) => { console.log("FAIL " + msg); bad += 1; };
const ok = (msg) => console.log("ok   " + msg);
const DEG = 180 / Math.PI;

/** Every melee move, and the picture it is supposed to make. */
const MOVES = [
  { kind: "light", variant: "jab", want: "forward", says: "the jab reaches out in front" },
  { kind: "light", variant: "side", want: "forward", says: "so does the side tilt" },
  { kind: "light", variant: "down", want: "forward", says: "and the crouch poke, low but still forward" },
  { kind: "light", variant: "air", want: "forward", says: "and the aerial" },
  { kind: "light", variant: "up", want: "up", says: "the up tilt rises" },
  { kind: "light", variant: "upAir", want: "up", says: "so does the up air" },
  { kind: "light", variant: "downAir", want: "down", says: "the meteor falls" },
  { kind: "heavy", variant: "side", want: "forward", says: "the side smash reaches out" },
  { kind: "heavy", variant: "air", want: "forward", says: "and the heavy aerial" },
  { kind: "heavy", variant: "up", want: "up", says: "the up smash rises" },
  { kind: "heavy", variant: "down", want: "sides", says: "the quake comes out both ways along the floor" },
];

/** What a list of arcs LOOKS like, as one word plus the angles. */
function shapeOf(arcs) {
  if (!arcs.length) return { shape: "none", aims: [] };
  const aims = arcs.map((a) => Math.round(a.aim * DEG));
  if (arcs.length === 1) {
    if (aims[0] === -90) return { shape: "up", aims };
    if (aims[0] === 90) return { shape: "down", aims };
    return { shape: "forward", aims };
  }
  const sideways = aims.length === 2 && aims.includes(180);
  return { shape: sideways ? "sides" : `${arcs.length} arcs`, aims };
}

console.log("move             shape      arcs   fighters");
for (const spec of MOVES) {
  const byShape = new Map();
  for (const key of CHARACTER_KEYS) {
    const char = CHARACTERS[key];
    const m = spec.kind === "light"
      ? lightMove(char, spec.variant)
      : heavyMove(char, spec.variant);
    const { shape, aims } = shapeOf(strikeArcs(m, bodyMetrics(key).height));
    const tag = `${shape} [${aims.join(",")}]`;
    if (!byShape.has(tag)) byShape.set(tag, []);
    byShape.get(tag).push(key);
  }
  const tags = [...byShape.keys()];
  const label = `${spec.kind}.${spec.variant}`;
  console.log(`${label.padEnd(16)} ${tags[0].padEnd(18)} ${byShape.get(tags[0]).length}/${CHARACTER_KEYS.length}`
    + (tags.length > 1 ? `   SPLIT: ${tags.slice(1).map((t) => `${t} ${byShape.get(t).join(" ")}`).join(" · ")}` : ""));

  if (tags.length > 1) {
    fail(`${label} does not read the same on every fighter — `
      + tags.map((t) => `${byShape.get(t).length} draw ${t}`).join(", ")
      + `. An attack's picture has to be a fact about the attack, not about how long `
      + `the fighter's arms are`);
    continue;
  }
  const got = tags[0].split(" ")[0];
  if (got !== spec.want) {
    fail(`${label} draws ${tags[0]} on the whole roster, but ${spec.says} — expected ${spec.want}`);
  }
}

console.log("");
if (!bad) ok(`all ${MOVES.length} melee moves draw the same picture on all ${CHARACTER_KEYS.length} fighters`);

// ------------------------------------------------------- the unlabelled ones
//
// Projectiles and special boxes are spawned by character kits and carry no
// `sweep`. They still need a crescent, so the aspect-ratio guess has to still
// be there — and has to still be reached.
const tall = strikeArcs({ ox: -30, w: 60, oy: -200, h: 140 }, 175);
const flat = strikeArcs({ ox: 20, w: 90, oy: -90, h: 60 }, 175);
if (shapeOf(tall).shape !== "up") {
  fail(`an unlabelled tall straddling box drew ${shapeOf(tall).shape} — the fallback guess `
    + `is gone, and every projectile that relied on it has lost its arc`);
} else if (shapeOf(flat).shape !== "forward") {
  fail(`an unlabelled forward box drew ${shapeOf(flat).shape}`);
} else {
  ok("an unlabelled box (a projectile, a special) still gets the geometry guess");
}

console.log(bad ? `\n${bad} check(s) failed` : "\nevery attack's arc is a fact about the attack");
process.exit(bad ? 1 : 0);
