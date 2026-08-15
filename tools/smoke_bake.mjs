// THE BAKE'S ONE TEST: with the corrections in the .glb, turning the
// correction layer OFF must change nothing.
//
//   node server.mjs &
//   node tools/smoke_bake.mjs --capture      # before baking: write the reference
//   node tools/smoke_bake.mjs                # after baking: prove it matches
//
// A bake is invisible when it works. The fighter looked right before, because
// the engine was correcting them on every frame; they look right after,
// because the file is correct. The only way to know the second is the same as
// the first is to have written the first down.
//
// So `--capture` walks the roster with the layer ON and records where every
// joint ends up, in five states — the rig check, and four the game plays. The
// run after the bake walks the same roster with the layer OFF and compares. A
// bake that lands is joint-for-joint identical; one that does not says which
// fighter, which state and which joint, in millimetres.
//
// WHY JOINTS AND NOT PIXELS. A pixel test on a toon-shaded model is a test of
// the renderer's mood — antialiasing, a light that moved a hair, a texture
// that decoded differently. Joint positions are the thing the bake actually
// moves, they are exact, and a millimetre of error is a millimetre whichever
// way the camera is pointing.
import { webkit } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = join(ROOT, "render3d/intake/bake-reference.json");
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:5174";
const capture = args.includes("--capture");
/** How far a joint may move and still count as unchanged, in metres. Tight:
 *  the arithmetic is exact, so anything above float noise is a real error. */
const TOL = 0.001;

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${BASE}/render3d/workbench/index.html?edit=rigs`, { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, {}, { timeout: 90000 });
await page.waitForTimeout(1500);

const allKeys = await page.evaluate(() =>
  [...document.getElementById("charSelect").options].map((o) => o.value));
// AFTER a bake, only the fighters that were baked are expected to match with
// the layer off — an unbaked one is SUPPOSED to change, because the layer is
// still the only thing correcting them. The manifest says which is which.
const bakedSet = new Set(await page.evaluate(async () => {
  const rigs = await import("/render3d/src/loader.js");
  const chars = rigs.rigManifest().characters || {};
  return Object.keys(chars).filter((k) => chars[k].baked === true);
}));
const keys = capture ? allKeys : allKeys.filter((k) => bakedSet.has(k));

/** Where every joint of one fighter sits, in five states, with the correction
 *  layer forced on or off. */
async function sample(char, layerOn) {
  return page.evaluate(async ([key, on]) => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const fixes = await import("/render3d/src/rig_fixes.js");
    const GL = (await import("/vendor/three/loaders/GLTFLoader.js")).GLTFLoader;
    await rigs.ensureRig(key, GL).catch(() => {});
    const rig = rigs.getRig(key);
    if (!rig || rig.isMannequin) return null;
    fixes.setModelFixesEnabled(on);
    const out = {};
    const states = [["T", null], ["idle", "idle"], ["run", "run"],
                    ["sideHeavy", "sideHeavy"], ["crouch", "crouch"]];
    for (const [tag, state] of states) {
      const layers = state
        ? { charKey: key, stanceDeg: rig.stanceDeg || 0 }
        : { charKey: key, rigCheck: "T" };
      const res = rigs.resolveClip(key, state || "idle");
      pose.poseRig(rig, state || "idle", 0, res?.clip || null, layers);
      rig.root.updateMatrixWorld(true);
      const joints = {};
      rig.root.traverse((o) => {
        if (!o.isBone) return;
        const p = o.getWorldPosition(new THREE.Vector3());
        joints[o.name] = [+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5)];
      });
      out[tag] = joints;
    }
    fixes.setModelFixesEnabled(true);
    return out;
  }, [char, layerOn]);
}

if (capture) {
  const ref = { captured: "before the bake, correction layer ON", chars: {} };
  for (const char of keys) {
    const s = await sample(char, true);
    if (s) ref.chars[char] = s;
    process.stdout.write(".");
  }
  writeFileSync(REF, `${JSON.stringify(ref)}\n`);
  console.log(`\ncaptured ${Object.keys(ref.chars).length} fighter(s) -> ${REF}`);
  await browser.close();
  process.exit(0);
}

if (!existsSync(REF)) {
  console.log(`no reference at ${REF} — run with --capture BEFORE baking`);
  await browser.close();
  process.exit(1);
}
const ref = JSON.parse(readFileSync(REF, "utf8"));

let failures = 0;
let worstAll = 0;
console.log("fighter        worst joint move, corrections OFF vs the reference");
for (const char of keys) {
  const before = ref.chars[char];
  if (!before) {
    console.log(`${char.padEnd(14)} — not in the reference`);
    continue;
  }
  const after = await sample(char, false);
  if (!after) continue;
  let worst = 0, where = "";
  const perState = [];
  for (const state of Object.keys(before)) {
    let sw = 0, sb = "";
    for (const [bone, p] of Object.entries(before[state])) {
      const q = after[state]?.[bone];
      if (!q) continue;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d > sw) { sw = d; sb = bone; }
    }
    perState.push(`${state} ${(sw * 1000).toFixed(1)}mm${sw > TOL ? ` (${sb})` : ""}`);
    if (sw > worst) { worst = sw; where = `${state} ${sb}`; }
  }
  worstAll = Math.max(worstAll, worst);
  const ok = worst <= TOL;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${char.padEnd(12)} ${(worst * 1000).toFixed(2)}mm`
    + (worst > TOL ? `  at ${where}` : ""));
  if (!ok) console.log(`       ${perState.join("  |  ")}`);
}

if (errors.length) {
  failures++;
  console.log("page errors:", errors.slice(0, 3).join(" | "));
}
await browser.close();
if (!keys.length) console.log("(nothing baked yet)");
console.log(failures
  ? `\n${failures} fighter(s) moved — the bake did not land`
  : `\nthe layer is a no-op: worst joint moved ${(worstAll * 1000).toFixed(2)}mm across the roster`);
process.exit(failures ? 1 : 0);
