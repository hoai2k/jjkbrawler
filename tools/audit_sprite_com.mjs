// Which frames' centre of mass is worth a human look?
//
// The per-frame `anchors.com` in the sprite manifest used to matter only as a
// pivot — a tumble turned about it, a squash widened about it — where being a
// few pixels out is a subtlety. It now also decides WHERE AN AIRBORNE DRAWING
// IS PLACED (src/render.js holdComY), so a badly-baked anchor moves the whole
// fighter rather than tilting them slightly, and it is worth knowing which ones
// they are.
//
// The test is agreement with the fighter's own verified per-character value
// (src/config_body_points.js `com`, placed by hand in the verification bench):
// a frame whose mass sits far from where a person said this fighter's mass sits
// is either a genuinely different pose or a bad bake, and only a person can say
// which. Crouches, prone sprawls and ledge hangs are genuinely different and
// are listed separately rather than flagged.
//
// Fix one by dragging its `com` anchor in the SPRITE workbench
// (`/sprites/workbench/`), which is where per-frame anchors are edited; the
// per-CHARACTER value is the verification bench's "centre-of-mass" set.
//
// Usage: node tools/audit_sprite_com.mjs [--all] [--char <key>]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const only = args.includes("--char") ? args[args.indexOf("--char") + 1] : null;
const showAll = args.includes("--all");

const m = JSON.parse(readFileSync("sprites/assets/manifest.json", "utf8"));
const body = readFileSync("src/config_body_points.js", "utf8");

/** The verified per-character COM fractions, read out of the config source. */
const VERIFIED = {};
for (const line of body.split("\n")) {
  const hit = line.match(/^\s*"([a-z_]+)":\s*\{[^}]*\bcom:\s*([0-9.]+)/);
  if (hit) VERIFIED[hit[1]] = parseFloat(hit[2]);
}

const CELL_H = 384, CELL_FOOT_Y = 0.94;
const DEFAULT_COM = 0.55;

// Poses whose body is genuinely not upright, so a COM far from the standing
// fraction is the drawing being right rather than the bake being wrong.
const OFF_AXIS = /^(prone|tumble|crouch|ledge|dodge_roll|sit|down)/i;

// How far off the fighter's own verified fraction is worth reporting. Set from
// the roster's own spread: upright frames sit within about ±0.06 of it, so
// beyond this a frame is saying something different about the same body.
const FLAG = 0.09;

const flagged = [];
const offAxis = [];
let scanned = 0;
let noAnchor = 0;

for (const [charKey, frames] of Object.entries(m.characters)) {
  if (only && charKey !== only) continue;
  const want = VERIFIED[charKey];
  for (const [frameKey, meta] of Object.entries(frames)) {
    if (!meta || typeof meta !== "object") continue;
    const foot = (meta.bodyBottom ?? CELL_H * CELL_FOOT_Y) - (meta.oy ?? 0);
    if (!(foot > 0)) continue;
    const com = meta.anchors?.com;
    if (!com) { noAnchor++; continue; }
    scanned++;
    const frac = (foot - com[1]) / foot;
    const ref = want ?? DEFAULT_COM;
    const off = frac - ref;
    const row = { charKey, frameKey, frac: +frac.toFixed(3), ref, off: +off.toFixed(3),
                  verified: want !== undefined };
    if (OFF_AXIS.test(frameKey)) { if (Math.abs(off) > FLAG) offAxis.push(row); continue; }
    if (Math.abs(off) > FLAG) flagged.push(row);
  }
}

flagged.sort((a, b) => Math.abs(b.off) - Math.abs(a.off));
console.log(`${scanned} frame(s) with a baked centre of mass`
  + (noAnchor ? `, ${noAnchor} without one` : "")
  + `; ${Object.keys(VERIFIED).length} fighters carry a verified per-character value.\n`);

if (!flagged.length) {
  console.log("No upright frame disagrees with its fighter's own value by more "
    + `than ${FLAG}. Nothing to review.`);
} else {
  console.log(`${flagged.length} upright frame(s) more than ${FLAG} off their `
    + "fighter's verified centre — worth a look in the sprite workbench:\n");
  console.log(`${"char".padEnd(13)}${"frame".padEnd(16)}${"this frame".padStart(11)}`
    + `${"fighter".padStart(9)}${"off by".padStart(8)}`);
  for (const r of (showAll ? flagged : flagged.slice(0, 25))) {
    console.log(`${r.charKey.padEnd(13)}${r.frameKey.padEnd(16)}${String(r.frac).padStart(11)}`
      + `${String(r.ref).padStart(9)}${(r.off > 0 ? "+" : "") + r.off.toFixed(3)}`.padStart(8));
  }
  if (!showAll && flagged.length > 25) console.log(`\n… and ${flagged.length - 25} more (--all)`);
}

console.log(`\n(${offAxis.length} off-axis frame(s) — prone, crouch, ledge, roll — also `
  + "differ, which is what those poses ARE; they are not listed as faults.)");
console.log("\nEdit a frame's anchor in /sprites/workbench/ ; the per-character value "
  + "is the verification bench's \"centre-of-mass\" set.");
