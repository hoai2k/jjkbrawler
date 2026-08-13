// DO THE BASELINE POSES READ APART? The silhouette test, as a number.
//
//   node tools/pose_silhouettes.mjs [--out debug] [--limit 0.86]
//
// A fighting game is read at speed and at size, and what a player reads first
// is the OUTLINE — before the colours, before the details, and long before the
// hands. Two moves drawn with one silhouette are two moves the player cannot
// tell apart, and the cost is not aesthetic: an anticipation frame that reads
// like the idle gives the opponent nothing to react to.
//
// That is a property of a pose LIBRARY rather than of any pose in it, so no
// amount of looking at one pose can catch it, and it gets worse exactly as the
// library grows — which is the moment nobody is re-checking the old ones. So
// it is measured here: every baseline intent is posed on a real rig, its
// outline is taken from the canvas, and every pair is compared by intersection
// over union. Pairs above `--limit` fail.
//
// IoU is the right measure because it is the one the eye is doing: how much of
// the two outlines is shared, over how much either covers. 1.0 is identical,
// and anything over about 0.85 is two poses a player will read as one.
//
// A few pairs are ALLOWED to be close, and they are listed rather than
// silently excused — a stance and the held stance of a charge really are the
// same body, and the game distinguishes them with effects rather than pose.
//
// Needs playwright and a running `node server.mjs`, like tools/pose_rig_sheet.mjs.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { INTENTS } from "../render3d/src/baseline_poses.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.WORKBENCH_URL || "http://127.0.0.1:5174";
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const outDir = join(ROOT, flag("out") || "debug/silhouettes");
const LIMIT = Number(flag("limit") || 0.86);
const char = argv.find((a) => !a.startsWith("--")) || "yuji";
mkdirSync(outDir, { recursive: true });

/**
 * ANTICIPATION IS THE STRICT ONE.
 *
 * A wind-up is the only frames an opponent gets to react in, so it has to read
 * differently from the pose it comes out of — not merely differently from
 * everything, which the general limit already asks. A crouch attack whose
 * wind-up looks like the crouch gives the player nothing to see, and the
 * stronger the attack the more true that is. Each pair here is "this
 * anticipation" against "what the fighter was doing a frame earlier", held to
 * a tighter limit than the rest of the library.
 */
const ANTICIPATION = [
  ["strike_wind", "stance", "a punch wound up out of the stance"],
  ["crouch_wind", "crouch", "a crouch attack wound up out of the crouch"],
  ["air_wind", "air_strike", "the airborne wind-up against its own strike"],
  ["gather", "stance", "an ult gathered out of the stance"],
];
const ANTIC_LIMIT = 0.72;

/**
 * Pairs that are meant to look alike, with the reason. An allowance has to name
 * what tells the two apart in play, or it is just a muted alarm.
 */
const ALLOWED = new Map([
  ["poise|stance", "the held stance of a special IS the stance; the aura tells them apart"],
  ["gather|crouch", "both are the body coiled down over loaded knees"],
  ["stride_contact|stride_reach", "two samples of one stride, a few frames apart"],
  ["air_strike|strike_straight", "the same punch, with and without the floor"],
]);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/render3d/workbench/?edit=pose&char=${char}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__workbenchReady, null, { timeout: 60000 });
await page.waitForTimeout(1200);

const shots = new Map();
const grids = new Map();
for (const intent of INTENTS) {
  const ok = await page.evaluate((i) => window.__showIntent(i), intent);
  if (!ok) { console.error(`FAIL ${intent}: the editor could not pose it`); continue; }
  await page.waitForTimeout(220);
  grids.set(intent, await page.evaluate(() => window.__silhouette(48)));
  shots.set(intent, (await page.locator("#rigView").screenshot()).toString("base64"));
  process.stdout.write(`${intent} `);
}
process.stdout.write("\n");
await browser.close();

/** How much of two outlines is shared, over how much either covers. */
function iou(a, b) {
  let both = 0; let either = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] === "1"; const y = b[i] === "1";
    if (x && y) both++;
    if (x || y) either++;
  }
  return either ? both / either : 1;
}

const names = [...grids.keys()];
const pairs = [];
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const key = [names[i], names[j]].sort().join("|");
    pairs.push({ a: names[i], b: names[j], iou: iou(grids.get(names[i]), grids.get(names[j])),
                 allowed: ALLOWED.get(key) });
  }
}
pairs.sort((x, y) => y.iou - x.iou);

const at = (a, b) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
const antic = ANTICIPATION.map(([a, b, why]) => ({ a, b, why, iou: at(a, b)?.iou ?? 1 }));
const anticBad = antic.filter((p) => p.iou > ANTIC_LIMIT);

const bad = pairs.filter((p) => p.iou > LIMIT && !p.allowed);
const excused = pairs.filter((p) => p.iou > LIMIT && p.allowed);

console.log(`\n${names.length} intents, ${pairs.length} pairs, limit ${LIMIT}\n`);
console.log("closest pairs:");
for (const p of pairs.slice(0, 10)) {
  const mark = p.iou > LIMIT ? (p.allowed ? "allowed" : "TOO ALIKE") : "ok";
  console.log(`  ${p.iou.toFixed(3)}  ${p.a} / ${p.b}  ${mark}${p.allowed ? ` — ${p.allowed}` : ""}`);
}

// A pose that is far from EVERYTHING is worth a look too: usually it means the
// rig fell over rather than that the pose is bold.
const loneliest = names
  .map((n) => ({ n, best: Math.max(...pairs.filter((p) => p.a === n || p.b === n).map((p) => p.iou)) }))
  .sort((x, y) => x.best - y.best).slice(0, 3);
console.log("\nmost distinct (nearest neighbour):");
for (const l of loneliest) console.log(`  ${l.best.toFixed(3)}  ${l.n}`);

console.log(`\nanticipation, against what it winds up out of (limit ${ANTIC_LIMIT}):`);
for (const p of antic) {
  console.log(`  ${p.iou.toFixed(3)}  ${p.a} / ${p.b}  `
    + `${p.iou > ANTIC_LIMIT ? "TOO ALIKE" : "ok"} — ${p.why}`);
}

const cell = (n) => `<figure><img src="data:image/png;base64,${shots.get(n)}"><figcaption>${n}</figcaption></figure>`;
const rows = pairs.slice(0, 12).map((p) => `<div class="pair ${p.iou > LIMIT ? (p.allowed ? "warn" : "bad") : ""}">
  <b>${p.iou.toFixed(3)}</b> ${cell(p.a)} ${cell(p.b)}
  <span>${p.allowed || (p.iou > LIMIT ? "too alike — a player reads these as one move" : "")}</span></div>`).join("");
const all = names.map(cell).join("");
const out = join(outDir, `${char}-silhouettes.html`);
writeFileSync(out, `<!doctype html><meta charset=utf-8><title>${char} — baseline silhouettes</title>
<style>body{background:#0c1114;color:#dbe2f0;font:13px system-ui;margin:0;padding:18px}
h2{font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:#8b96b3}
figure{margin:0;width:150px}img{width:100%;display:block;border-radius:3px;background:#10141f}
figcaption{font:11px ui-monospace;color:#8fb8a0;text-align:center;padding-top:3px}
.pair{display:flex;align-items:center;gap:10px;padding:6px;border:1px solid #26314c;border-radius:6px;margin-bottom:6px}
.pair b{font:13px ui-monospace;width:60px;color:#7ddc9a}
.pair.warn{border-color:#5c4a2a}.pair.warn b{color:#d8a657}
.pair.bad{border-color:#6b3a3a}.pair.bad b{color:#e0a3a3}
.pair span{color:#8b96b3;font-size:12px}
.grid{display:flex;flex-wrap:wrap;gap:8px}</style>
<h2>closest pairs — do these read as two moves?</h2>${rows}
<h2>every baseline intent (${names.length})</h2><div class="grid">${all}</div>`);
console.log(`\n${out}`);

if (errors.length) { console.error(`page errors:\n${errors.join("\n")}`); process.exit(1); }
if (bad.length || anticBad.length) {
  for (const p of bad) console.error(`TOO ALIKE  ${p.iou.toFixed(3)}  ${p.a} / ${p.b}`);
  for (const p of anticBad) {
    console.error(`ANTICIPATION READS AS ITS OWN SETUP  ${p.iou.toFixed(3)}  ${p.a} / ${p.b}`);
  }
  process.exit(1);
}
console.log(`\nno two baseline poses read the same${excused.length ? ` (${excused.length} allowed)` : ""}`);
