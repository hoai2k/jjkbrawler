// Smoke-test the billboard pipeline — phase B0's exit criteria, as a script.
//
// Two passes:
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
  // The phase blips through playing during round setup; a real running match
  // is playing + fighters + a few seconds on the clock, polled until stable.
  await page.waitForFunction(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 0 && state.matchTime > 3;
  }, { timeout: 180000 });
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
    const drew = bb.drawCharFrame(ctx, charKey, token, 150, 280, { scale: 0.6, facing: 1 });
    let px = 0;
    const d = ctx.getImageData(0, 0, 300, 300).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 60) px++;
    return {
      registered: bb.hasModel(charKey), ownSrc: own?.source, ultSrc: inherited?.source,
      token, drew, px,
    };
  }, TEST_CHAR);

  check(r.registered, "an imported+approved .glb registers from the manifest");
  check(r.token.startsWith("bb:"), "rigged characters hand out billboard pose tokens", r.token);
  check(r.ownSrc === "own", "a state the rig covers resolves to its own clip", r.ownSrc);
  check(r.ultSrc === "default", "a state it lacks resolves to the default pose set", r.ultSrc);
  check(r.drew === true && r.px > 100, "the delivered rig draws through drawCharFrame", `${r.px} px`);
  check(errors.length === 0, "no page errors on the delivered-rig path", errors.slice(0, 2).join(" | "));
  await page.close();
} finally {
  writeFileSync(MANIFEST, manifestBefore);
  rmSync(join(ROOT, "billboards", "assets", TEST_CHAR), { recursive: true, force: true });
  rmSync(join(ROOT, "billboards", "intake", TEST_CHAR), { recursive: true, force: true });
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
