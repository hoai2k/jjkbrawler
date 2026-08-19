// One multiply, in one function: how tall a shared drawing is painted.
//
//   node tools/check_shared_heights.mjs
//
// A shared drawing's size is its authored height times the `renderScale`
// somebody set on the picture in the workbench, and the arithmetic is trivial.
// What was not trivial was WHO DID IT. The scale used to be folded into every
// kit's `spriteH` at boot, so a spawn site read a height with the size already
// in it; the registry un-folded and multiplied itself; and the aura and the
// stage hazards, whose heights are not kit numbers, multiplied at the draw.
// Three conventions in one codebase, and the only way to know which one a line
// was written under was to know the history. The action player did not, so
// every drawing anybody had resized was previewed at scale-squared while the
// game drew it right.
//
// There is one convention now — `paintedHeight(key, base)` in
// src/shared_sprites.js — and this is what keeps it one: a draw site that
// reaches for a scale itself is the old habit coming back, and it fails here
// rather than in somebody's eyes six weeks later.
//
// WHAT IT LOOKS FOR: `.scale` taken off a `sharedAdjust`-shaped object and
// multiplied into a height. The nudge (`dx`/`dy`), the tilt (`rot`) and the
// mirror are all still the caller's business — this is only about size.
//
// NOT the hit shape's scale. `sharedHit` carries a second, unrelated
// adjustment — how big the region a move COLLIDES on is, against the picture —
// and `hitAdj.scale` is that one. It is a different number with a different
// owner, and the six lines that draw the hit circle in the workbench are
// entitled to it.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where shared art is painted: the game, the 2.5D scene, and both workbench
 *  canvases. Everything else has no business with a shared drawing's height. */
const ROOTS = ["src", "sprites/workbench", "sprites/src"];

/** The one place allowed to multiply by a shared scale, being the function that
 *  defines what the multiply means. */
const HOME = "src/shared_sprites.js";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".js")) out.push(path);
  }
  return out;
}

const problems = [];
for (const dirName of ROOTS) {
  for (const path of walk(join(ROOT, dirName))) {
    const rel = relative(ROOT, path);
    if (rel === HOME) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
      // `adj.scale`, `fa.scale`, `shotAdj.scale`, `sharedScale(key)` — any of
      // them arriving in an expression that also has a height in it.
      const usesScale = /\b\w*[Aa]dj\.scale\b|\bsharedScale\(/.test(line)
        && !/\bhitAdj\.scale\b/.test(line);
      if (!usesScale) return;
      problems.push(`${rel}:${i + 1}  ${line.trim()}`);
    });
  }
}

if (problems.length) {
  console.error("A shared drawing's size is applied by paintedHeight() and nowhere else."
    + " These lines multiply by a scale themselves:\n");
  for (const line of problems) console.error(`  FAIL ${line}`);
  console.error(`\n${problems.length} line(s) rolling their own scale.`);
  process.exit(1);
}

console.log("shared heights ok — every drawing is sized by paintedHeight()");
