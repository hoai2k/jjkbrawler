#!/usr/bin/env node
// A HEIGHT ON A BODY IS NOT A NUMBER OF PIXELS.
//
//   node tools/check_body_scale.mjs
//
// WHY THIS EXISTS. Every "chest height" and "over the head" in this game was
// once written the obvious way — `f.y - 90`, against a reference fighter 149px
// tall. Then the roster went to 70% (ART_SCALE, config_tuning.js): bodies were
// drawn 104px tall, the camera zoomed in by the reciprocal so the picture did
// not change, and every one of those offsets became a third of a body too
// high. Four files were swept to `f.y - 90 * ART_SCALE` that day. Six were
// not, and nobody could tell by looking: `burst(t.x, t.y - 90 * ART_SCALE)`
// and `dismantleLatticeFx(t.x, t.y - 90)` sat four lines apart in ultimates.js
// for three months, aimed at the same point on the same body.
//
// The same mistake in the DATA — hand-placed muzzle points stored as pixels —
// put Gojo's Blue above his own head for three days. That half is fixed by
// storing fractions (config_body_points.js) and checked by audit_hitboxes.mjs.
// This is the other half: the offsets written in code.
//
// THE RULE. In src/, a literal offset from a fighter's `y` is a BODY length
// and goes through `bodyY` (src/body_points.js), which applies ART_SCALE. Two
// things are allowed to be raw, and have to say so on the line (or just above
// it):
//
//   "board length"   stage geometry a body is being compared against — a
//                    platform tier, a ledge slack. The board deliberately did
//                    NOT shrink with the roster; that gap is the whole point.
//   "kit space"      a number authored in a kit (`ox`, `oy`, `w`, `h`), which
//                    scales by the CASTER'S HEIGHT at spawn rather than by
//                    ART_SCALE — see combat.js spawnMeleeScaled.
//
// A marker is a claim, not an escape: it is there so the next reader knows the
// raw number was a decision. There are four of them in the whole of src/.
//
// Exits non-zero on the first unmarked offset, so it can gate a commit.

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

// The names a fighter, a target or a summon travels under in src/. Anything
// else with a `.y` is a projectile, a particle or a platform — none of which
// is a body, and none of which this has an opinion about.
const BODIES = "f|t|self|opp|owner|target|attacker|caster|foe|other";
const OFFSET = new RegExp(`\\b(?:${BODIES})\\.y\\s*[-+]\\s*\\d`, "g");
const MARKERS = ["board length", "kit space", "KIT SPACE"];
const SCALED = /\*\s*(ART_SCALE|A)\b/;

let flagged = 0;
let scanned = 0;
let marked = 0;

for (const name of readdirSync(SRC).filter((f) => f.endsWith(".js")).sort()) {
  const lines = readFileSync(join(SRC, name), "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // PROSE IS NOT CODE. Every module that explains this rule has to be able
    // to write the wrong form down — this file included — so a line that is
    // only a comment is not a call site, and a marker in a trailing comment
    // still counts for the code beside it.
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    const code = line.split("//")[0];
    if (!OFFSET.test(code)) { OFFSET.lastIndex = 0; continue; }
    OFFSET.lastIndex = 0;
    scanned++;
    if (SCALED.test(code)) continue;
    // A marker on the line, or in the comment block immediately above it.
    const context = [line, lines[i - 1] || "", lines[i - 2] || "", lines[i - 3] || ""].join("\n");
    if (MARKERS.some((m) => context.includes(m))) { marked++; continue; }
    flagged++;
    console.log(`  FAIL src/${name}:${i + 1}: ${line.trim()}`);
    console.log(`       a length up a body — use bodyY(f, n) from src/body_points.js, `
      + `or say "board length" / "kit space" if it is neither`);
  }
}

console.log(`\n${scanned} body-relative offset(s) in src/, ${marked} raw and marked as `
  + `board or kit space`);
if (flagged) {
  console.log(`${flagged} unscaled offset(s) — these land a third of a body high on the `
    + `roster as it is drawn`);
  process.exit(1);
}
console.log("every height on a body is measured in bodies");
