// PUT THE CORRECTIONS INTO THE MODELS, and take them out of the engine.
//
// *** THE ARITHMETIC IS RIGHT; THE BAKE IS NOT SAFE TO SHIP YET. ***
// Run end to end on the roster, the bind lands EXACTLY where the engine asks
// (`bakedBind` and the baked file agree to four decimal places on every
// joint). What does not hold is "the fighter looks the same afterwards", and
// `tools/smoke_bake.mjs` says so in millimetres: extremities move up to
// ~1.1m in a run, ~300mm in an idle.
//
// The reason is not an error in this file. It is that the correction layer
// applied AFTER the pose and a baked bind applies BEFORE it, and three things
// downstream read the bind:
//   * applyIdleArms and applyIdleStand aim limbs FROM the bind, so widening
//     the shoulders in the bind changes the direction the arm is aimed rather
//     than just sliding it out,
//   * buildCharacterClips (loader.js) BUILDS 702 of the roster's 729 clips by
//     posing the rig against the pose libraries and reading it back, so every
//     built clip is re-derived against the new bind,
//   * standOnGround then re-seats the whole body on whatever came out.
//
// Baked is the more correct place for these corrections — that is the whole
// argument for baking — but it is not a no-op, and shipping it would change
// how every fighter moves. The next step is to decide which of those three
// should be re-derived and which re-dialled, not to keep adjusting matrices.
//
//   node server.mjs &
//   node tools/bake_model_fixes.mjs                 # what would be baked
//   node tools/bake_model_fixes.mjs --apply         # bake the roster
//   node tools/bake_model_fixes.mjs --apply yuji    # one fighter
//
// Every fighter is drawn with a layer of corrections on top of their delivered
// .glb — a mirrored skeleton, a head tilted back, arm roots pushed out, a
// clavicle rolled, a root yawed round. They are facts about the FILE, and the
// engine has been applying them on every frame of every state because the file
// does not. This is the step that ends that: the corrections go into the .glb,
// the numbers come out of the manifest, and `setModelFixesEnabled(false)` stops
// changing anything.
//
// WHY IT ASKS THE BROWSER. The corrections are defined by the engine — by
// `bakedBind` in render3d/src/pose.js, which puts a rig into the bind and runs
// the correction layer over it with no pose on top. A baking tool that
// reimplemented that arithmetic in Blender would be a second opinion about
// what the fix is, and the first time the two drifted the bake would silently
// stop matching the game. So this drives a real page, calls the real function,
// and writes down the answer: a matrix per joint. `tools/bake_glb_bind.py`
// then does the arithmetic that makes it the model's bind.
//
// NO DCC ROUND TRIP. An earlier version went through Blender and came back
// with the skeleton right and the skin smeared. That was a symptom, not a bug
// to chase: a glTF bind lives in the joint nodes and the inverseBindMatrices,
// and moving it is linear-blend skinning run once at author time. Going
// through an importer and an exporter to do it rewrites materials, drops the
// `toon` extras this project keeps in material extras, and re-encodes every
// texture — a large cost for arithmetic the file can be edited to hold.
//
// WHAT IS BAKED AND WHAT IS NOT.
//
//   BAKED, because they change the SHAPE of the model:
//     the mirrored skeleton, headTiltDeg, shoulderOutCm, kneeDeg, RIG_FIXES
//       — all of them are bone transforms, so they bake as one rest pose
//     yawOffsetDeg — the whole rig turned about Y
//
//   NOT BAKED: renderScale. It is not a defect in the model. The .glb is the
//   size it is; `renderScale` says how big the fighter is DRAWN, and the blit
//   divides it by `heightM` (blit.js). Baking it would mean scaling the
//   geometry — which would also have to scale every delivered clip's
//   translation track, for a number that has no effect on the model's shape.
//   It stays in the manifest, and is reclassified there as a display
//   calibration rather than a correction owed by the file.
//
// WHY THE CLIPS SURVIVE. A clip track holds a bone's LOCAL rotation, which is
// absolute — change the rest pose and the same track still puts the bone at
// the same orientation. What changes is where the SKIN sits relative to it,
// which is the whole point. And 702 of the roster's 729 state-clips are built
// from the sprite poses at load time anyway (loader.js), so they are rebuilt
// against the new bind for free; the 27 that are delivered are one idle each.
import { webkit } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "render3d/assets/manifest.json");
const BAKER = join(ROOT, "tools/bake_glb_bind.py");

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:5174";
const apply = args.includes("--apply");
const only = new Set(args.filter((a) => !a.startsWith("-") && !a.startsWith("http")));

// ------------------------------------------------------------- ask the engine

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${BASE}/render3d/workbench/index.html?edit=rigs`, { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, {}, { timeout: 90000 });
await page.waitForTimeout(1500);

const keys = (await page.evaluate(() =>
  [...document.getElementById("charSelect").options].map((o) => o.value)))
  .filter((k) => !only.size || only.has(k));

const specs = [];
for (const char of keys) {
  const spec = await page.evaluate(async (key) => {
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const fixes = await import("/render3d/src/rig_fixes.js");
    const GL = (await import("/vendor/three/loaders/GLTFLoader.js")).GLTFLoader;
    await rigs.ensureRig(key, GL).catch(() => {});
    const rig = rigs.getRig(key);
    if (!rig || rig.isMannequin) return null;
    const entry = rigs.rigManifest().characters?.[key] || {};
    const bones = pose.bakedBind(rig, key);
    return {
      char: key,
      model: entry.model,
      yawOffsetDeg: entry.yawOffsetDeg || 0,
      pending: Object.keys(fixes.pendingFixes(key, entry)),
      bones,
    };
  }, char);
  if (spec) specs.push(spec);
}
await browser.close();
if (errors.length) console.log("page errors:", errors.slice(0, 3).join(" | "));

// ------------------------------------------------------------------- and bake

const man = JSON.parse(readFileSync(MANIFEST, "utf8"));
console.log("fighter       bones  yaw   baking");
let baked = 0;
for (const spec of specs) {
  const entry = man.characters[spec.char];
  const willBake = spec.pending.filter((k) => k !== "renderScale");
  console.log(`${spec.char.padEnd(13)} ${String(Object.keys(spec.bones).length).padStart(5)}`
    + `  ${String(spec.yawOffsetDeg).padStart(3)}°  `
    + (willBake.length ? willBake.join(", ") : "nothing"));
  if (!apply || !willBake.length) continue;

  const tmp = mkdtempSync(join(tmpdir(), "bake-"));
  const specPath = join(tmp, "spec.json");
  const out = join(tmp, "baked.glb");
  writeFileSync(specPath, JSON.stringify(spec));
  const model = join(ROOT, "render3d/assets", spec.model);
  try {
    const log = execFileSync("python3",
      [BAKER, "--in", model, "--out", out, "--bind", specPath],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(log);
  } catch (err) {
    console.log(`  ${spec.char}: bake failed — ${String(err.stderr || err).slice(0, 300)}`);
    continue;
  }
  execFileSync("cp", [out, model]);
  // The numbers come OUT of the manifest in the same breath as they go into
  // the file. Leaving them would apply every correction twice.
  for (const k of ["yawOffsetDeg", "headTiltDeg", "shoulderOutCm", "kneeDeg"]) delete entry[k];
  entry.baked = true;
  baked++;
}

if (apply) {
  writeFileSync(MANIFEST, `${JSON.stringify(man, null, 2)}\n`);
  console.log(`\nbaked ${baked} fighter(s); manifest keys cleared.`);
  console.log("NOW PROVE IT: the layer off must change nothing —");
  console.log("    node tools/smoke_bake.mjs");
} else {
  console.log(`\n${specs.length} fighter(s) inspected; dry run — pass --apply to bake`);
}
