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

// `combat.js` reaches audio, which reaches the DOM. Same stub the stick-angle
// check uses, for the same reason: this is a headless read of the geometry.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

const { loadCoreAssets } = await import("../src/assets.js");
await loadCoreAssets();
const { CHARACTERS, CHARACTER_KEYS } = await import("../src/characters.js");
const { lightMove, heavyMove, strikeArcs, swingMove } = await import("../src/moves.js");
const { bodyMetrics } = await import("../src/silhouette.js");
const { spawnMelee } = await import("../src/combat.js");
const { state } = await import("../src/state.js");

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

// -------------------------------------------- and the box that gets DRAWN
//
// Everything above asks the MOVE what it draws. The renderer does not have the
// move — `drawStrikeArcs` is handed the spawned HITBOX (render.js), which is a
// copy `spawnMelee` makes field by field (combat.js). So a field the move sets
// and that copy forgets is invisible to every check on this page, and to the
// smoke that drives a real pad through a real match: both called `strikeArcs`
// on the move and both passed while the game drew something else.
//
// `aimTilt` was exactly that, for as long as aiming has existed. Every angled
// attack in the game drew its crescent dead level, at every angle, because
// nothing that could see the difference ever looked at the box that reaches
// the screen. This is the check that would have.
{
  const key = CHARACTER_KEYS[0];
  const char = CHARACTERS[key];
  const bodyH = bodyMetrics(key).height;
  const spawn = (move) => {
    state.hitboxes.length = 0;
    spawnMelee({ facing: 1 }, { ...move, base: move.baseKb });
    return state.hitboxes[0];
  };
  const same = (a, b) => a.length === b.length && a.every((x, i) =>
    Math.abs(x.aim - b[i].aim) < 1e-6 && Math.abs(x.radius - b[i].radius) < 1e-6
    && Math.abs(x.pivotY - b[i].pivotY) < 1e-6);

  const cases = [
    ["the up smash", heavyMove(char, "up")],
    ["the quake", heavyMove(char, "down")],
    ["the meteor", lightMove(char, "downAir")],
    ["the crouch poke", lightMove(char, "down")],
    ["a side tilt aimed 45° up", swingMove(lightMove(char, "side"), -Math.PI / 4)],
    ["a side smash aimed 30° down", swingMove(heavyMove(char, "side"), Math.PI / 6)],
  ];
  const lost = [];
  for (const [label, move] of cases) {
    const want = strikeArcs(move, bodyH);
    const got = strikeArcs(spawn(move), bodyH);
    if (!same(want, got)) {
      lost.push(`${label}: move draws ${JSON.stringify(shapeOf(want))}, `
        + `spawned box draws ${JSON.stringify(shapeOf(got))}`);
    }
  }
  if (lost.length) {
    fail("the hitbox that reaches the renderer does not draw what the move does — "
      + `spawnMelee is dropping a field the arc needs. ${lost.join(" · ")}`);
  } else {
    ok("the spawned hitbox draws the same arc the move does");
  }
}

console.log(bad ? `\n${bad} check(s) failed` : "\nevery attack's arc is a fact about the attack");
process.exit(bad ? 1 : 0);
