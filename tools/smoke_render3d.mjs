// Smoke-test the render3d pipeline — phase D0's exit criteria, as a script.
//
// Three passes:
//
//   1. MANNEQUIN MATCH.  `?render=3d&mannequin=all` boots into a real
//      CPU-vs-CPU match. Asserts: the backend engaged, rigs registered,
//      poses rendered through the 3D pipeline, the ON-TWOS ECONOMY holds
//      (renders per second stays comfortably under samples-per-second ×
//      fighters — the cache doing its job), toon-shaded mannequin pixels
//      are on screen where a fighter stands, and no page errors (the 2D
//      context came through clean).
//
//   2. DETERMINISM.  Same pose token -> byte-identical pixels across a
//      cache clear. The afterimage trail replays tokens seconds later, so
//      a nondeterministic render shows as flickering ghosts.
//
//   3. DELIVERY PIPELINE.  Builds a throwaway .glb with billboard_test_rig,
//      runs it through intake with --backend 3d (validate -> import ->
//      approve), boots with NO mannequin flag, and asserts the delivered
//      rig registered from the render3d manifest, its clips resolve, and
//      the fighter draws through drawCharFrame. Restores everything.
//
// Needs `playwright` and Chromium (CHROMIUM_PATH to override), and the game
// served first:  node server.mjs   then:  node tools/smoke_render3d.mjs [baseUrl]

import { chromium } from "playwright";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "render3d", "assets", "manifest.json");

// A key that can never be a fighter — this test fabricates a delivery under
// it, approves it, and deletes it from disk on the way out. It was `todo`
// while no fighter had a real model; once Todo got one, running the suite
// silently deleted him. See the same note in tools/smoke_billboard.mjs.
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
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 30000 });
  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(300);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 5000 });
  await page.locator(".stage-card").nth(0).click();
  // Wait for a SETTLED match — the same trap smoke_billboard.mjs documents.
  // The phase blips through `playing` with a stale fighter list during round
  // setup, so a single-shot condition catches that blip and then samples
  // during the asset load that follows, which reads as "the 3D pipeline
  // rendered nothing" when in truth the match had not begun. Requiring the
  // condition to hold across consecutive polls, with the clock genuinely
  // advancing, is what makes every number sampled after this mean something.
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

// ------------------------------------------------- 1. mannequin match

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  await bootAndFight(page, `${BASE}/index.html?render=3d&mannequin=all&camera=flat`);
  const before = await page.evaluate(() => ({
    renders: window.__render3d.stats.renders, t: performance.now(),
  }));
  await page.waitForTimeout(4000);

  const r = await page.evaluate(async (before) => {
    const { state } = await import("/src/state.js");
    const { renderBackendName } = await import("/src/render_backend.js");
    const stats = window.__render3d.stats;
    const dials = window.__render3d.dials;
    const elapsed = (performance.now() - before.t) / 1000;
    // Mannequin pixels near a live fighter: the toon-shaded grey-blue body.
    const c = document.getElementById("gameCanvas");
    const ctx = c.getContext("2d");
    const f = state.fighters.find((x) => !x.dead && x.respawnTimer <= 0);
    let hit = 0;
    if (f) {
      const sx = c.width / 1280, sy = c.height / 720;
      const d = ctx.getImageData((f.x - 70) * sx, (f.y - 210) * sy, 140 * sx, 220 * sy).data;
      for (let i = 0; i < d.length; i += 4) {
        const [red, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        if (a > 100 && b >= red && b >= g && red > 60 && b > 90) hit++;
      }
    }
    return {
      backend: renderBackendName(), rigged: window.__render3d.rigged,
      renders: stats.renders, hits: stats.hits, misses: stats.misses,
      windowRenders: stats.renders - before.renders, elapsed,
      hz: dials.sampleHz, fighters: state.fighters.length,
      pixels: hit, sampled: !!f,
    };
  }, before);

  check(r.backend === "3d", "the 3d backend is in force", r.backend);
  check(r.rigged >= 27, "a mannequin rig registered for the whole roster", `${r.rigged} rigs`);
  check(r.renders > 0, "poses were rendered through the 3D pipeline", `${r.renders} renders`);
  // The on-twos economy: live animation must not cost live rendering. Budget
  // = sampleHz per fighter (plus trail ghosts hitting cache, plus slack for
  // aim/parallax dimensions splitting tokens).
  const budget = r.hz * r.fighters * r.elapsed * 2.5;
  check(r.windowRenders <= budget, "renders/sec stays inside the on-twos budget",
    `${r.windowRenders} renders in ${r.elapsed.toFixed(1)}s vs budget ${Math.round(budget)}`);
  check(r.hits > r.misses, "the pose cache carries most frames", `${r.hits} hits / ${r.misses} misses`);
  check(r.sampled && r.pixels > 200, "toon mannequin pixels drawn where a fighter stands", `${r.pixels} px`);
  check(errors.length === 0, "no page errors in a 3d match", errors.slice(0, 2).join(" | "));
  await page.close();
}

// ------------------------------------------------------ 2. determinism

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html?render=3d&mannequin=all&camera=flat`);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 30000 });

  const r = await page.evaluate(async () => {
    const backend = await import("/render3d/src/backend.js");
    const scene = await import("/render3d/src/scene.js");
    const draw = () => {
      const c = document.createElement("canvas");
      c.width = 300; c.height = 300;
      const ctx = c.getContext("2d");
      const token = backend.currentFrame("gojo", "run", 0.1234);
      backend.drawCharFrame(ctx, "gojo", token, 150, 280, { scale: 0.6, facing: -1 });
      return c.toDataURL();
    };
    // Both draws must be MODEL renders. Comparing two sprite fallbacks would
    // also come out identical — a determinism check that cannot tell which
    // path it measured proves nothing about the renderer it is named for.
    const before = window.__render3d.stats.renders;
    const a = draw();
    scene.clearCache();
    const b = draw();
    return { same: a === b, len: a.length, renders: window.__render3d.stats.renders - before };
  });
  check(r.renders >= 2, "both determinism draws went through the model path", `${r.renders} renders`);
  check(r.same, "same pose token renders byte-identical pixels across a cache clear", `${r.len}b`);
  check(errors.length === 0, "no page errors in the determinism probe", errors.slice(0, 2).join(" | "));
  await page.close();
}

// -------------------------------------------------- 3. delivered-.glb path

const manifestBefore = readFileSync(MANIFEST, "utf8");
try {
  const tool = (args) => execFileSync("node", [join(ROOT, "tools", args[0]), ...args.slice(1)], { encoding: "utf8" });
  tool(["billboard_test_rig.mjs", TEST_CHAR, join(ROOT, "render3d", "intake", TEST_CHAR, `${TEST_CHAR}.glb`)]);
  tool(["billboard_intake.mjs", "import", TEST_CHAR, "--backend", "3d"]);
  tool(["billboard_intake.mjs", "approve", TEST_CHAR, "--backend", "3d"]);

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/index.html?render=3d&camera=flat`);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 30000 });

  const r = await page.evaluate(async (charKey) => {
    const backend = await import("/render3d/src/backend.js");
    const loader = await import("/render3d/src/loader.js");
    const own = loader.resolveClip(charKey, "light");
    const inherited = loader.resolveClip(charKey, "ult");
    const c = document.createElement("canvas");
    c.width = 300; c.height = 300;
    const ctx = c.getContext("2d");
    const token = backend.currentFrame(charKey, "idle", 0.5);
    // Count renders across the draw. Pixels alone cannot tell a MODEL from the
    // sprite fallback — drawCharFrame legitimately falls through to sprites
    // and still returns true with a canvas full of pixels, so a check that
    // only counted pixels would pass just as happily with the 3D path dead.
    const before = window.__render3d.stats.renders;
    const drew = backend.drawCharFrame(ctx, charKey, token, 150, 280, { scale: 0.6, facing: 1 });
    const rendered = window.__render3d.stats.renders > before;
    let px = 0;
    const d = ctx.getImageData(0, 0, 300, 300).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 60) px++;
    return {
      registered: backend.hasModel(charKey), ownSrc: own?.source, ultSrc: inherited?.source,
      token, drew, px, rendered,
    };
  }, TEST_CHAR);

  check(r.registered, "an imported+approved .glb registers from the render3d manifest");
  check(r.token.startsWith("r3d:"), "rigged characters hand out render3d pose tokens", r.token);
  check(r.ownSrc === "own", "a state the rig covers resolves to its own clip", r.ownSrc);
  check(r.ultSrc === "default", "a state it lacks resolves to the default pose set", r.ultSrc);
  check(r.drew === true && r.px > 100, "the delivered rig draws through drawCharFrame", `${r.px} px`);
  check(r.rendered, "and draws as a MODEL, not via the sprite fallback");
  check(errors.length === 0, "no page errors on the delivered-rig path", errors.slice(0, 2).join(" | "));
  await page.close();
} finally {
  writeFileSync(MANIFEST, manifestBefore);
  rmSync(join(ROOT, "render3d", "assets", TEST_CHAR), { recursive: true, force: true });
  rmSync(join(ROOT, "render3d", "intake", TEST_CHAR), { recursive: true, force: true });
}

// ---------------------------------------------------------------- IK reach
//
// Same claim as the billboard backend, measured the same way — but with one
// case that only exists here: facing left is a real 180° YAW, not a mirror, so
// "forward" genuinely changes direction in the world. A reach target built
// before that yaw is applied sends every left-facing fighter swinging the way
// they are not facing, and nothing else in the suite would notice.
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html?render=3d&camera=flat`);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });

  const r = await page.evaluate(async () => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const charKey = "gojo";
    const rig = rigs.getRig(charKey);
    const resolved = rigs.resolveClip(charKey, "light");
    if (!rig || !resolved) return { skipped: true };
    const targetPx = 175.3;
    const out = { worst: 0, cases: [], handYs: [], forwardSigns: [] };
    for (const [label, dx, dy, facing] of [
      ["high", 260, 300, 1], ["level", 320, 95, 1],
      ["low", 260, -30, 1], ["left-facing", 260, 200, -1],
    ]) {
      pose.poseRig(rig, "light", 0.083, resolved.clip, {
        aimRad: 0, reach: { dx, dy, targetPx }, turnYawRad: facing < 0 ? Math.PI : 0,
      });
      const sh = new THREE.Vector3(), hand = new THREE.Vector3();
      rig.root.getObjectByName("RightArm").getWorldPosition(sh);
      rig.root.getObjectByName("RightHand").getWorldPosition(hand);
      const want = new THREE.Vector3(0, dy * (rig.height / targetPx), dx * (rig.height / targetPx));
      rig.root.localToWorld(want);
      const deg = (Math.acos(Math.min(1, Math.max(-1,
        want.sub(sh).normalize().dot(hand.clone().sub(sh).normalize())))) * 180) / Math.PI;
      out.worst = Math.max(out.worst, deg);
      out.cases.push(`${label}:${deg.toFixed(1)}°`);
      if (facing > 0) out.handYs.push(hand.y);
      out.forwardSigns.push(Math.sign(+hand.z.toFixed(2)));
      rig.root.rotation.y = 0;
    }
    out.spread = Math.max(...out.handYs) - Math.min(...out.handYs);
    return out;
  });

  if (r.skipped) {
    check(true, "IK reach skipped — no rig registered for the probe character");
  } else {
    check(r.worst < 1, "the striking hand points at the target, every case", `worst ${r.worst.toFixed(2)}° — ${r.cases.join(" ")}`);
    check(r.spread > 0.2, "and aim height genuinely moves the hand", `${r.spread.toFixed(2)}m of travel`);
    // Right-facing reaches +Z, left-facing reaches -Z: the turnaround is real.
    check(r.forwardSigns[0] > 0 && r.forwardSigns[3] < 0,
      "reach follows the 180° turnaround rather than fighting it", `z signs ${r.forwardSigns.join(",")}`);
  }
  check(errors.length === 0, "no page errors solving IK", errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
