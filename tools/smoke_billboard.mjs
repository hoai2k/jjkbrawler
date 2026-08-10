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
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "billboards", "assets", "manifest.json");
const TEST_CHAR = "todo";

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
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
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
    let hit = 0;
    if (f) {
      const sx = c.width / 1280, sy = c.height / 720;
      const d = ctx.getImageData((f.x - 70) * sx, (f.y - 210) * sy, 140 * sx, 220 * sy).data;
      for (let i = 0; i < d.length; i += 4) {
        const [red, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        if (a > 100 && b > red && b > g && red > 80 && red < 210 && b > 120 && b < 235) hit++;
      }
    }
    return {
      backend: renderBackendName(), rigged: window.__billboards.rigged,
      renders: stats.renders, hits: stats.hits, misses: stats.misses,
      pixels: hit, sampled: !!f,
    };
  });

  check(r.backend === "billboard", "the billboard backend is in force", r.backend);
  check(r.rigged >= 27, "a mannequin rig registered for the whole roster", `${r.rigged} rigs`);
  check(r.renders > 0, "poses were rendered through the 3D pipeline", `${r.renders} renders`);
  check(r.hits > r.misses, "the pose cache carries most frames", `${r.hits} hits / ${r.misses} misses`);
  check(r.sampled && r.pixels > 200, "mannequin pixels drawn where a fighter stands", `${r.pixels} px`);
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

  await page.goto(`${BASE}/index.html?render=billboard`);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__billboards?.ready === true, { timeout: 30000 });

  const r = await page.evaluate(async (charKey) => {
    const bb = await import("/billboards/src/billboard.js");
    const rig = await import("/billboards/src/rig.js");
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
  rmSync(join(ROOT, "billboards", "intake", TEST_CHAR), { recursive: true, force: true });
}

// ------------------------------------------------------------- 3. IK reach
//
// The claim is "attacks at any angle". Measured, not eyeballed: solve the same
// strike at four targets and check the striking hand ends up pointing at each
// one. Angular error, because at fighting range the target is metres away and
// an arm reaches half a metre — the limb holds the clip's own extension and
// only the DIRECTION tracks (see applyReach in billboards/src/ik.js).
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`);

  const r = await page.evaluate(async () => {
    const THREE = await import("/billboards/vendor/three.module.js");
    const rig = await import("/billboards/src/rig.js");
    const renderer = await import("/billboards/src/renderer.js");
    const { aimSolve } = await import("/billboards/src/states.js");
    renderer.initRenderer(THREE);
    await rig.initRigs(THREE, null, ["mann"], ["mann"]);

    const targetPx = 175.3;
    const out = { worst: 0, spread: 0, cases: [] };
    const handYs = [];
    for (const [label, dx, dy] of [["high", 260, 300], ["level", 320, 95], ["low", 260, -30], ["far", 460, 120]]) {
      const aim = aimSolve(0, 0, -targetPx * 0.55, { x: dx, y: -dy }, 1);
      renderer.renderPose("mann", "light", 0.083, rig.resolveClip, aim, targetPx);
      const r0 = rig.getRig("mann");
      const shoulder = new THREE.Vector3();
      const hand = new THREE.Vector3();
      r0.root.getObjectByName("RightArm").getWorldPosition(shoulder);
      r0.root.getObjectByName("RightHand").getWorldPosition(hand);
      const camRight = new THREE.Vector3().setFromMatrixColumn(renderer.__cam().matrixWorld, 0);
      const want = new THREE.Vector3(0, aim.dy * (r0.height / targetPx), 0)
        .addScaledVector(camRight, aim.dx * (r0.height / targetPx))
        .sub(shoulder).normalize();
      const got = hand.clone().sub(shoulder).normalize();
      const deg = (Math.acos(Math.min(1, Math.max(-1, want.dot(got)))) * 180) / Math.PI;
      out.worst = Math.max(out.worst, deg);
      out.cases.push(`${label}:${deg.toFixed(1)}°`);
      handYs.push(hand.y);
    }
    out.spread = Math.max(...handYs) - Math.min(...handYs);
    return out;
  });

  // Exact, in one pass: a stale camera matrix once made only the FIRST solve
  // after a reframe wrong, so a loose tolerance here would hide that class of
  // bug entirely.
  check(r.worst < 1, "the striking hand points at the target, every case", `worst ${r.worst.toFixed(2)}° — ${r.cases.join(" ")}`);
  check(r.spread > 0.3, "and aim height genuinely moves the hand", `${r.spread.toFixed(2)}m of travel`);
  check(errors.length === 0, "no page errors solving IK", errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
