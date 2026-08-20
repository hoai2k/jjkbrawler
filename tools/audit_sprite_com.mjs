// Which frames' centre of mass is worth a human look?
//
// THE TEST ITSELF LIVES IN sprites/src/com_review.js, which carries the
// reasoning for each of its four reasons. This is the terminal view of it. The
// other view is the verification bench's queue, where the same list can be
// answered rather than only read:
//
//     /workbench/?edit=verification&set=frame-com
//
// They used to be able to disagree — the audit held the only copy of the test,
// and nothing in the repo could record that a person had looked at one of these
// numbers and approved it. Now the rule is shared and the queue is where the
// answer goes.
//
// WHY IT MATTERS. The per-frame `anchors.com` used to matter only as a pivot —
// a tumble turned about it, a squash widened about it — where being a few
// pixels out is a subtlety. It now also decides WHERE AN AIRBORNE DRAWING IS
// PLACED (src/render.js holdComY) and, under `?smooth=com`, how far a
// cross-fade slides its two drawings to line them up. A bad bake moves the
// whole fighter rather than tilting them slightly.
//
// Fix one by dragging its `com` anchor in the SPRITE workbench
// (`/sprites/workbench/`) or by answering it in the queue above, which exports
// the same sprite-adjustments block. The per-CHARACTER value is a different
// question and a different set ("centre-of-mass").
//
// Usage: node tools/audit_sprite_com.mjs [--all] [--char <key>] [--swings]
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const only = args.includes("--char") ? args[args.indexOf("--char") + 1] : null;
const showAll = args.includes("--all");
const swingsOnly = args.includes("--swings");

// The game reads its manifest over the network, and `resolvedAnim` — which the
// swing test walks to find the pairs an animation actually plays — asks
// assets.js for it. Same shim tools/check_pointing.mjs uses, and for the same
// reason: without it every lookup misses and the audit reports nothing.
const ROOT = new URL("../", import.meta.url);
globalThis.fetch = async (url) => {
  const body = await readFile(new URL(String(url).replace(/^\.?\//, ""), ROOT), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};

const { loadCoreAssets } = await import("../src/assets.js");
await loadCoreAssets();
const { suspectFrames, COM_HEIGHT_FLAG } = await import("../sprites/src/com_review.js");
const { XFADE_COM_MAX_FRAC } = await import("../src/config_tuning.js");

const manifest = JSON.parse(await readFile(new URL("sprites/assets/manifest.json", ROOT), "utf8"));
const rows = suspectFrames(manifest, { chars: only ? [only] : null });

let scanned = 0;
for (const frames of Object.values(manifest.characters || {})) {
  for (const meta of Object.values(frames)) {
    if (meta && typeof meta === "object" && meta.anchors?.com) scanned++;
  }
}

const counted = {};
for (const r of rows) for (const x of r.reasons) counted[x.kind] = (counted[x.kind] || 0) + 1;

const shown = swingsOnly
  ? rows.filter((r) => r.reasons.some((x) => x.kind === "swing"))
  : rows;

console.log(`${scanned} frame(s) with a baked centre of mass; `
  + `${shown.length} worth a look`
  + (swingsOnly ? " (swings only)" : "") + ".\n");
console.log(`  height   ${counted.height || 0}\tmore than ${COM_HEIGHT_FLAG} off their fighter's verified centre`);
console.log(`  swing    ${counted.swing || 0}\tjump more than ${XFADE_COM_MAX_FRAC} of body height between two drawings of one animation`);
console.log(`  outside  ${counted.outside || 0}\tsit off the body's own core span`);
console.log(`  unbaked  ${counted.unbaked || 0}\tcarry no anchor at all\n`);

if (!shown.length) {
  console.log("Nothing to review.");
} else {
  for (const r of (showAll ? shown : shown.slice(0, 25))) {
    console.log(`${r.charKey.padEnd(13)}${r.frameKey.padEnd(18)}${r.reasons.map((x) => x.kind).join(",")}`);
    for (const x of r.reasons) console.log(`${"".padEnd(13)}  ${x.detail}`);
  }
  if (!showAll && shown.length > 25) console.log(`\n… and ${shown.length - 25} more (--all)`);
}

console.log("\nAnswer these in /workbench/?edit=verification&set=frame-com , or drag one "
  + "anchor at a time in /sprites/workbench/ . Both write the same field.");
