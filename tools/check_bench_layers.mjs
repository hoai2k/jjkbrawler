// The sprite bench's modules depend on each other in one direction only.
//
//   node tools/check_bench_layers.mjs
//
// WHY THIS EXISTS
//
// workbench.js was 6,321 lines and 233 functions in one module. Nothing in it
// was wrong on its own; what was wrong was that everything could see everything
// else, so no piece of it had to say what it depended on — and a fix in one
// panel could change another without either of them mentioning the other. Most
// of the drawing bugs this bench has been fixed for were of that shape.
//
// It is layered now. Each layer may import the ones below it and nothing above:
//
//   bench_state.js       the canvas, its geometry, the mutable `state`
//   bench_model.js       what a sprite IS — poses, flags, edits, spawn sites
//   bench_picker.js      the drawing grid          } leaves: they read the model
//   bench_shared_art.js  the shared-drawing viewer } and answer through hooks
//   bench_export.js      the adjustment file
//   workbench.js         the pose canvas, the panels, the wiring, the boot
//
// A leaf that needs something from the page above it (repaint the panel after
// an edit) is given it at boot as a hook — `initSpritePicker`, `initSharedArt`
// — rather than importing it, which is what keeps the arrows one-way. This
// fails if any of that is undone, because an import cycle does not throw: it
// silently hands somebody a half-initialised module, and the symptom turns up
// somewhere else entirely.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BENCH = join(ROOT, "sprites", "workbench");

/** Bottom to top. A module may import anything EARLIER in this list. */
const LAYERS = [
  "bench_state.js",
  // Reads the game's own hurtbox configuration and nothing of the bench's, so
  // it sits near the bottom: everything above may use it, it uses none of them.
  "bench_hurtbox_fit.js",
  "bench_model.js",
  "bench_picker.js",
  "bench_shared_art.js",
  "bench_export.js",
  "workbench.js",
];

/** Modules that predate the split and are addressed by their own factories
 *  (makeEffectPreview, makeCharLoader): they take what they need as arguments,
 *  so they sit outside the ladder rather than on a rung of it. */
const OUTSIDE = new Set([
  "effect_preview.js", "preview_playback.js", "lazy_sprites.js",
  "fit_stage.js", "tooltip.js", "actions.js",
]);

const problems = [];
LAYERS.forEach((name, rung) => {
  const src = readFileSync(join(BENCH, name), "utf8");
  for (const m of src.matchAll(/^import\s+(?:[\w*{][^"]*?from\s+)?"\.\/([^"]+)";/gm)) {
    const target = m[1];
    if (OUTSIDE.has(target)) continue;
    const at = LAYERS.indexOf(target);
    if (at < 0) {
      problems.push(`${name} imports ./${target}, which is on no layer — add it to`
        + " LAYERS in this file, or to OUTSIDE if it takes its dependencies as arguments");
    } else if (at >= rung) {
      problems.push(`${name} imports ./${target}, which is at or above its own layer`
        + " — the bench's modules import downward only");
    }
  }
});

if (problems.length) {
  for (const line of problems) console.error(`  FAIL ${line}`);
  console.error(`\n${problems.length} import(s) pointing the wrong way.`);
  process.exit(1);
}

console.log(`bench layers ok — ${LAYERS.length} modules, every import points downward`);
