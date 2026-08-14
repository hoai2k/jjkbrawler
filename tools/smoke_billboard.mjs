// Smoke-test the billboard pipeline — phase B0's exit criteria, as a script.
//
// Three passes:
//
//   1. MANNEQUIN MATCH.  `?render=billboard&mannequin=all` boots into a real
//      CPU-vs-CPU match. Asserts: the backend engaged, rigs registered, poses
//      actually rendered with a healthy cache hit rate, mannequin pixels are
//      on screen where a fighter stands, and the 2D context came through
//      clean (the HUD still draws).
//
//   2. DELIVERY PIPELINE.  Builds a throwaway .glb with billboard_test_rig,
//      runs it through intake (validate -> import -> approve), boots the game
//      with NO mannequin flag, and asserts the delivered rig registered from
//      the manifest, its own clips resolve as "own", missing states resolve
//      to the default pose set, and the fighter draws. Cleans up after
//      itself: the manifest and assets tree are restored no matter what.
//
//   3. IK REACH.  Solves the same strike at four targets and measures the
//      angle between where the hand ended up and where it was aimed. Exact,
//      not approximate — a loose tolerance would have hidden the stale-camera
//      bug that made only the first solve after a reframe wrong.
//
// Needs `playwright` and Chromium (CHROMIUM_PATH to override), and the game
// served first:  node server.mjs   then:  node tools/smoke_billboard.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// One registry now: the billboard backend draws render3d's rigs as cards.
const MANIFEST = join(ROOT, "render3d", "assets", "manifest.json");

// The fighter this test fabricates a delivery for, imports, approves, and then
// DELETES from disk on the way out.
//
// It used to be `todo`, chosen when no fighter had a real model and any roster
// key was a safe stand-in. The moment Todo got one, this test started eating
// it: a full build would finish, the suite would run, and the model plus its
// intake would be gone — leaving a manifest pointing at a file that no longer
// existed, which `billboard_intake.mjs check` duly failed on. It cost a
// regeneration to notice, because the deletion looks nothing like its cause.
//
// So the test rig gets a key that CANNOT be a fighter. Nothing under this name
// is ever shipped, and picking a real one again is now a visible mistake
// rather than a silent one.
const TEST_CHAR = "__smoketest";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

async function bootAndFight(page, url) {
  await page.goto(url);
  await pressStart(page);
  await page.waitForFunction(() => window.__billboards?.ready === true, { timeout: 30000 });
  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(300);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 5000 });
  await page.locator(".stage-card").nth(0).click();
  // Wait for a SETTLED match. The phase blips through `playing` with a stale
  // fighter list during round setup, and a single-shot condition catches that
  // blip and then samples during the asset load that follows — which reads as
  // "the 3D pipeline rendered nothing" when in truth the match had not begun.
  // Requiring the condition to hold on consecutive polls, with the clock
  // genuinely advancing, is what makes the sample mean what it says.
  let stable = 0;
  let last = -1;
  for (let waited = 0; stable < 3; waited += 500) {
    if (waited > 180000) throw new Error("match never settled");
    await page.waitForTimeout(500);
    const s = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      return { phase: state.phase, n: state.fighters.length, t: state.matchTime || 0 };
    });
    stable = (s.phase === "playing" && s.n > 0 && s.t > 3 && s.t > last) ? stable + 1 : 0;
    last = s.t;
  }
}

// ------------------------------------------------------- 1. mannequin match

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  await bootAndFight(page, `${BASE}/index.html?render=billboard&mannequin=all`);
  await page.waitForTimeout(3000);

  const r = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { renderBackendName } = await import("/src/render_backend.js");
    const stats = window.__billboards.stats;
    // Mannequin pixels near a live fighter: the grey-blue body colour.
    const c = document.getElementById("gameCanvas");
    const ctx = c.getContext("2d");
    const f = state.fighters.find((x) => !x.dead && x.respawnTimer <= 0);
    // A LIVE fighter's own token, redrawn onto a scratch canvas.
    //
    // This used to read the game canvas in a box at (f.x, f.y) — but those are
    // WORLD coordinates and the canvas shows a CAMERA view, so the box only
    // landed on the fighter while the camera happened to sit near the origin.
    // It also sniffed for the mannequin's grey-blue, which stopped meaning
    // anything once the roster was fully delivered (a mannequin never
    // displaces a real rig — rig.js initRigs — so `mannequin=all` now yields
    // none). Redrawing the fighter's current token through the backend's own
    // entry point tests the same claim — a body comes out of this pipeline for
    // someone actually in a match — without depending on where the camera is.
    let hit = 0, drew = false;
    if (f) {
      const bb = await import("/billboards/src/billboard.js");
      const s = document.createElement("canvas");
      s.width = 300; s.height = 300;
      const sctx = s.getContext("2d");
      const token = bb.currentFrame(f.charKey, f.animKey || "idle", f.animTime || 0);
      drew = bb.drawCharFrame(sctx, f.charKey, token, 150, 280, { scale: 0.6, facing: 1 });
      const d = sctx.getImageData(0, 0, 300, 300).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 100) hit++;
    }
    return {
      backend: renderBackendName(), rigged: window.__billboards.rigged,
      renders: stats.renders, hits: stats.hits, misses: stats.misses,
      pixels: hit, sampled: !!f, drew,
    };
  });

  check(r.backend === "billboard", "the billboard backend is in force", r.backend);
  check(r.rigged >= 27, "a mannequin rig registered for the whole roster", `${r.rigged} rigs`);
  check(r.renders > 0, "poses were rendered through the 3D pipeline", `${r.renders} renders`);
  check(r.hits > r.misses, "the pose cache carries most frames", `${r.hits} hits / ${r.misses} misses`);
  check(r.sampled && r.drew && r.pixels > 200,
    "a live fighter's own token draws a body", `${r.pixels} px`);
  check(errors.length === 0, "no page errors in a billboard match", errors.slice(0, 2).join(" | "));
  await page.close();
}

// -------------------------------------------------- 2. delivered-.glb path

const manifestBefore = readFileSync(MANIFEST, "utf8");
try {
  const tool = (args) => execFileSync("node", [join(ROOT, "tools", args[0]), ...args.slice(1)], { encoding: "utf8" });
  tool(["billboard_test_rig.mjs", TEST_CHAR]);
  tool(["billboard_intake.mjs", "import", TEST_CHAR]);
  tool(["billboard_intake.mjs", "approve", TEST_CHAR]);

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/index.html?render=billboard&camera=flat`);
  await pressStart(page);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__billboards?.ready === true, { timeout: 30000 });

  const r = await page.evaluate(async (charKey) => {
    const bb = await import("/billboards/src/billboard.js");
    const rig = await import("/render3d/src/loader.js");
    const own = rig.resolveClip(charKey, "light");
    const inherited = rig.resolveClip(charKey, "ult");
    // Draw once through the real entry point onto a scratch canvas.
    const c = document.createElement("canvas");
    c.width = 300; c.height = 300;
    const ctx = c.getContext("2d");
    const token = bb.currentFrame(charKey, "idle", 0.5);
    // Count renders across the draw. Pixels alone cannot tell a MODEL from the
    // sprite fallback — drawCharFrame legitimately falls through to sprites and
    // still returns true with a canvas full of pixels, so a check that only
    // counted pixels would pass just as happily with the 3D path dead.
    const before = window.__billboards.stats.renders;
    const drew = bb.drawCharFrame(ctx, charKey, token, 150, 280, { scale: 0.6, facing: 1 });
    const rendered = window.__billboards.stats.renders > before;
    let px = 0;
    const d = ctx.getImageData(0, 0, 300, 300).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 60) px++;
    return {
      registered: bb.hasModel(charKey), ownSrc: own?.source, ultSrc: inherited?.source,
      token, drew, px, rendered,
    };
  }, TEST_CHAR);

  check(r.registered, "an imported+approved .glb registers from the manifest");
  check(r.token.startsWith("bb:"), "rigged characters hand out billboard pose tokens", r.token);
  check(r.ownSrc === "own", "a state the rig covers resolves to its own clip", r.ownSrc);
  check(r.ultSrc === "default", "a state it lacks resolves to the default pose set", r.ultSrc);
  check(r.drew === true && r.px > 100, "the delivered rig draws through drawCharFrame", `${r.px} px`);
  check(r.rendered, "and draws as a MODEL, not via the sprite fallback");
  check(errors.length === 0, "no page errors on the delivered-rig path", errors.slice(0, 2).join(" | "));
  await page.close();
} finally {
  writeFileSync(MANIFEST, manifestBefore);
  rmSync(join(ROOT, "billboards", "assets", TEST_CHAR), { recursive: true, force: true });
  rmSync(join(ROOT, "render3d", "intake", TEST_CHAR), { recursive: true, force: true });
}

// ------------------------------------------------------------- 3. IK reach
//
// The claim is "attacks at any angle". Measured, not eyeballed: solve the same
// strike at four targets and check the striking hand ends up pointing at each
// one. Angular error, because at fighting range the target is metres away and
// an arm reaches half a metre — the limb holds the clip's own extension and
// only the DIRECTION tracks (see applyReach in render3d/src/ik.js).
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html?camera=flat`);
  await pressStart(page);

  const r = await page.evaluate(async () => {
    const THREE = await import("/vendor/three/three.module.js");
    const rig = await import("/render3d/src/loader.js");
    const renderer = await import("/billboards/src/renderer.js");
    const { aimSolve, STATES } = await import("/render3d/src/states.js");
    renderer.initRenderer(THREE);
    await rig.initRigs(THREE, null, ["mann"], ["mann"]);

    const targetPx = 175.3;
    const chestY = -targetPx * 0.55;
    const out = { worst: 0, byState: [], invariant: [], elevations: {} };

    // 1. The hand lands on the solved target, exactly, in every state.
    for (const [state, label] of [["light", "level"], ["upHeavy", "up"], ["crouchAttack", "low"]]) {
      const aim = aimSolve(0, 0, chestY, { x: 300, y: -100 }, 1, state, 96);
      // Sample at the state's OWN contact beat: the IK ramps in over the
      // wind-up, so probing every state at one fixed time measures the clip
      // on the slow ones and the solve on the quick ones.
      renderer.renderPose("mann", state, STATES[state].beat, rig.resolveClip, aim, targetPx);
      const r0 = rig.getRig("mann");
      const shoulder = new THREE.Vector3(), hand = new THREE.Vector3();
      r0.root.getObjectByName("RightArm").getWorldPosition(shoulder);
      r0.root.getObjectByName("RightHand").getWorldPosition(hand);
      const camRight = new THREE.Vector3().setFromMatrixColumn(renderer.__cam().matrixWorld, 0);
      const want = new THREE.Vector3(0, aim.dy * (r0.height / targetPx), 0)
        .addScaledVector(camRight, aim.dx * (r0.height / targetPx))
        .sub(shoulder).normalize();
      const got = hand.clone().sub(shoulder).normalize();
      const deg = (Math.acos(Math.min(1, Math.max(-1, want.dot(got)))) * 180) / Math.PI;
      out.worst = Math.max(out.worst, deg);
      out.byState.push(`${label}:${deg.toFixed(1)}°`);
      out.elevations[label] = Math.round(Math.atan2(aim.dy - (-chestY), aim.dx) * 180 / Math.PI);
    }

    // 2. A grounded arm strike is thrown LEVEL wherever the opponent stands.
    //    Continuous aim is what pointed a standing jab at the floor.
    for (const [dx, dy] of [[300, 300], [300, 95], [300, -140], [700, 20]]) {
      const a = aimSolve(0, 0, chestY, { x: dx, y: -dy }, 1, "light", 96);
      out.invariant.push(`${a.dx},${a.dy}`);
    }
    return out;
  });

  check(r.worst < 1, "the striking hand lands on the solved target, every state",
    `worst ${r.worst.toFixed(2)}° — ${r.byState.join(" ")}`);
  check(new Set(r.invariant).size === 1,
    "a grounded arm strike is thrown level wherever the opponent stands",
    `solutions: ${[...new Set(r.invariant)].join(" | ")}`);
  // The move IS the aim: an up attack goes up, a crouch poke goes low, and a
  // standing jab goes neither.
  check(r.elevations.up > 30 && r.elevations.level === 0 && r.elevations.low < -10,
    "each attack keeps its own elevation",
    `up ${r.elevations.up}°, level ${r.elevations.level}°, low ${r.elevations.low}°`);
  check(errors.length === 0, "no page errors solving IK", errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
