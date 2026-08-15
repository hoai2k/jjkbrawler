// PUT THE IDLES BACK, after a bake moved the bind under them.
//
//   node server.mjs &
//   node tools/redial_idle.mjs            # what it would change
//   node tools/redial_idle.mjs --apply    # write the manifest
//
// Baking the correction layer moves a fighter's bind, and two of the engine's
// idle layers are derived FROM the bind: `applyIdleArms` aims each arm at
// `armDeg` off straight down, measured from the bind, and `applyIdleStand`
// splays the legs by `stanceDeg` from the bind pelvis. Widen a fighter's
// shoulders in the file and the arm is now aimed from further out, which is a
// different pose from the same number.
//
// That is not a bug in the bake — it is the correction landing in the right
// place at last. But `armDeg` and `stanceDeg` are POSE dials, not model
// corrections (rig_fixes.js says why they are excluded from the bake list),
// and a pose dial is exactly the right place to absorb a change of base. So
// this re-dials them: for each fighter, find the pair that puts their idle
// back where it was before the bake.
//
// IT SEARCHES RATHER THAN SOLVES. The relationship between the dials and the
// joints runs through two IK layers and a ground re-seat, and is not worth
// inverting analytically for two numbers on a bounded range. A coarse sweep
// then a fine one around the winner costs a few hundred poses per fighter and
// lands on the same answer a solver would, without a page of algebra that
// would need re-deriving the next time the idle layers change.
//
// The reference is the same file the bake's own test uses
// (render3d/intake/bake-reference.json), captured before the bake with the
// correction layer on — which is to say, what the game looked like.
import { webkit } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "render3d/assets/manifest.json");
const REF = join(ROOT, "render3d/intake/bake-reference.json");
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:5174";
const apply = args.includes("--apply");
const only = new Set(args.filter((a) => !a.startsWith("-") && !a.startsWith("http")));

if (!existsSync(REF)) {
  console.log(`no reference at ${REF} — capture one before baking:`);
  console.log("    node tools/smoke_bake.mjs --capture");
  process.exit(1);
}
const ref = JSON.parse(readFileSync(REF, "utf8"));
const man = JSON.parse(readFileSync(MANIFEST, "utf8"));

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${BASE}/render3d/workbench/index.html?edit=rigs`, { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, {}, { timeout: 90000 });
await page.waitForTimeout(1500);

const keys = (await page.evaluate(() =>
  [...document.getElementById("charSelect").options].map((o) => o.value)))
  .filter((k) => (!only.size || only.has(k)) && man.characters[k]?.baked);

console.log("fighter        arm    stance    idle error before -> after");
const changes = [];
for (const char of keys) {
  const want = ref.chars[char]?.idle;
  if (!want) { console.log(`${char.padEnd(14)} — not in the reference`); continue; }

  const found = await page.evaluate(async ([key, target]) => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const GL = (await import("/vendor/three/loaders/GLTFLoader.js")).GLTFLoader;
    await rigs.ensureRig(key, GL).catch(() => {});
    const rig = rigs.getRig(key);
    if (!rig || rig.isMannequin) return null;
    const res = rigs.resolveClip(key, "idle");
    const names = Object.keys(target);
    const keptArm = rig.armDeg, keptStance = rig.stanceDeg;

    /** How far this fighter's idle sits from where it sat before the bake:
     *  the WORST joint, not the average. An average hides one hand a
     *  hand's-width out behind twenty joints that did not move. */
    const err = (armDeg, stanceDeg) => {
      rig.armDeg = armDeg;
      rig.stanceDeg = stanceDeg;
      pose.poseRig(rig, "idle", 0, res?.clip || null,
        { charKey: key, stanceDeg });
      rig.root.updateMatrixWorld(true);
      let worst = 0;
      for (const n of names) {
        const b = rig.root.getObjectByName(n);
        if (!b) continue;
        const p = b.getWorldPosition(new THREE.Vector3());
        const q = target[n];
        const d = Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);
        if (d > worst) worst = d;
      }
      return worst;
    };

    const base = { arm: keptArm ?? 9, stance: keptStance ?? 0 };
    const before = err(base.arm, base.stance);
    let best = { arm: base.arm, stance: base.stance, err: before };
    // Coarse, then fine around the winner. The ranges are the ones the dials
    // are meaningful over: past about 40° an arm stops reading as rest, and a
    // stance over 30° is a stance nobody stands in.
    for (const step of [3, 1, 0.25]) {
      const spanA = step === 3 ? 45 : step * 4;
      const spanS = step === 3 ? 30 : step * 4;
      const a0 = best.arm, s0 = best.stance;
      for (let a = Math.max(0, a0 - spanA); a <= Math.min(45, a0 + spanA); a += step) {
        for (let s = Math.max(0, s0 - spanS); s <= Math.min(30, s0 + spanS); s += step) {
          const e = err(a, s);
          if (e < best.err - 1e-6) best = { arm: +a.toFixed(2), stance: +s.toFixed(2), err: e };
        }
      }
    }
    rig.armDeg = keptArm;
    rig.stanceDeg = keptStance;
    return { before, ...best };
  }, [char, want]);

  if (!found) continue;
  const entry = man.characters[char];
  const changed = found.arm !== (entry.armDeg ?? null) || found.stance !== (entry.stanceDeg ?? 0);
  console.log(`${char.padEnd(14)} ${String(found.arm).padStart(5)}  ${String(found.stance).padStart(6)}`
    + `    ${(found.before * 1000).toFixed(0)}mm -> ${(found.err * 1000).toFixed(0)}mm`
    + (changed ? "" : "   (unchanged)"));
  if (changed) changes.push({ char, ...found });
  if (apply) {
    entry.armDeg = found.arm;
    entry.stanceDeg = found.stance;
  }
}

if (errors.length) console.log("page errors:", errors.slice(0, 3).join(" | "));
await browser.close();

if (apply) {
  writeFileSync(MANIFEST, `${JSON.stringify(man, null, 2)}\n`);
  console.log(`\nre-dialled ${changes.length} fighter(s); manifest written.`);
} else {
  console.log(`\n${changes.length} fighter(s) would change; dry run — pass --apply`);
}
