// ONE ANSWER TO "WHICH PIXELS IS THIS POSE", enforced.
//
//     node tools/check_char_art.mjs        # in `npm run check`
//
// A character frame is blitted two different ways — the canvas 2D chain in
// sprites/src/sprites.js and the textured quad in src/camera3d/billboards.js —
// and neither calls the other. That much is deliberate. What must never be
// duplicated is which IMAGE a pose draws from, because the two blitters then
// disagree and the game draws something no tool, bench or test can see.
//
// That is not hypothetical. Clothing FX shipped hooked to the sprite blitter
// alone: the toggle worked, the pass returned a keyed canvas, the arena bench
// rendered it, every check passed, and no player ever saw the effect, because
// the bench draws flat and the game draws through the 2.5D camera. The fix was
// one line. Nothing in the repo could have caught it.
//
// This is what catches the next one: `frameImage` — the raw lookup — belongs to
// `src/char_frame.js` and nobody else. Everything that draws a character calls
// `frameArt`, so a per-frame effect added there lands on every path at once.
//
// It is a grep with a reason attached, and that is the right size for it: the
// rule is about which module may call which function, which is exactly what
// reading the source can decide and what a runtime test cannot.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Where the game's runtime lives. Tools and workbenches are not in scope: a
// tool that wants the untouched drawing is doing something legitimate (the
// intake compares raw deliveries; the drift guard measures source pixels), and
// nothing it does reaches a player's screen.
const RUNTIME = ["src", "sprites/src", "billboards/src", "render3d/src"];

// The two modules allowed to name the raw lookup, and why.
const ALLOWED = new Map([
  ["src/assets.js", "defines frameImage"],
  ["src/char_frame.js", "the one module that resolves a pose's artwork"],
]);

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
    else if (entry.endsWith(".js")) files.push(rel);
  }
};
for (const dir of RUNTIME) walk(dir);

const offenders = [];
for (const rel of files) {
  if (ALLOWED.has(rel)) continue;
  const lines = readFileSync(path.join(ROOT, rel), "utf8").split("\n");
  lines.forEach((line, i) => {
    // Calls only. A comment explaining the rule is not a violation of it, and
    // several of these files carry one.
    const code = line.replace(/\/\/.*$/, "");
    if (/\bframeImage\s*\(/.test(code) || /\bframeImage\b(?=[^(]*\bfrom\b)/.test(code)) {
      offenders.push({ rel, line: i + 1, text: line.trim() });
    }
    if (/^\s*import\s*\{[^}]*\bframeImage\b[^}]*\}\s*from/.test(code)) {
      offenders.push({ rel, line: i + 1, text: line.trim() });
    }
  });
}

// Dedupe: an import line can match twice.
const seen = new Set();
const unique = offenders.filter((o) => {
  const key = `${o.rel}:${o.line}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

if (unique.length) {
  for (const o of unique) {
    console.log(`FAIL ${o.rel}:${o.line}\n       ${o.text}`);
  }
  console.log(
    `\n${unique.length} runtime use(s) of frameImage outside src/char_frame.js.\n` +
    "\nDrawing a character from the raw lookup opts that call site out of every\n" +
    "per-frame effect the game has — which is how Clothing FX shipped invisible.\n" +
    "Call frameArt (src/char_frame.js) instead. If this really is a non-drawing\n" +
    "use, add the module to ALLOWED here with the reason.",
  );
  process.exit(1);
}

const allowed = [...ALLOWED.keys()].join(", ");
console.log(`ok   character art: ${files.length} runtime modules, frameImage only in ${allowed}`);
