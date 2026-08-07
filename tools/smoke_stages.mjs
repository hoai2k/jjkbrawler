// Smoke-test every stage's Active Boards gimmick (src/stage_fx.js): starts a
// real match on each board in headless Chromium, fast-forwards matchTime
// through several hazard cycles, and fails on any page error. Also checks the
// Settings toggle path (Active Boards: Off -> no fx entity, neutral mods).
//
// Needs `playwright` (npm i playwright) and a Chromium binary — set
// CHROMIUM_PATH if yours is elsewhere. Start the game first (node server.mjs),
// then: node tools/smoke_stages.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const STAGE_KEYS = [
  "trainingBridge", "quietHall", "floodedGate", "shibuyaNight", "curseMaw",
  "gardenSteps", "lanternCorridor", "sunkenCrossing", "neonSplit", "boneSanctum",
  "bridgeDuel", "academyHall", "mistPier", "crosswalkRush", "cursedTeeth",
  "riverGate", "schoolWing", "emptyCity", "billboardRoof", "domainCore",
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push({ stage: current, err: String(e) }));
page.on("console", (m) => { if (m.type() === "error") errors.push({ stage: current, err: "console: " + m.text() }); });
let current = "boot";

await page.goto(BASE, { waitUntil: "load" });
// wait for asset load -> menu phase
await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(400);

// Sprite art loads lazily now (src/assets.js), so picking a stage can put a
// short loading screen in front of the match while the entrants' frames arrive.
// Wait for the fight to actually be running rather than for a fixed delay.
async function waitForMatch(timeout = 90000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const ready = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      return state.phase === "playing" && state.fighters.length > 0;
    });
    if (ready) return;
    if (Date.now() > deadline) throw new Error(`match never started (${current})`);
    await page.waitForTimeout(120);
  }
}

const results = [];
for (let i = 0; i < STAGE_KEYS.length; i++) {
  current = STAGE_KEYS[i];
  const before = errors.length;
  // re-lock the fighter (quitting to menu un-readies) then menu -> stage select
  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(250);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 5000 });
  await page.locator(".stage-card").nth(i).click();
  await waitForMatch();

  const report = await page.evaluate(async (stageKey) => {
    const { state } = await import("/src/state.js");
    if (state.stageKey !== stageKey) return { fail: `wrong stage: ${state.stageKey}` };
    const fxCount = state.entities.filter((e) => e.owner === null).length;
    const mods = JSON.stringify(state.stageMods);
    // Fast-forward through 3+ hazard cycles: jump time, then let it simulate.
    const jumps = [10, 14, 18, 22, 26, 29, 44, 58];
    for (const target of jumps) {
      state.matchTime = target;
      await new Promise((r) => setTimeout(r, 700));
    }
    const platsOk = state.platforms.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const fightersOk = state.fighters.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.damage));
    return {
      fxCount, mods, platsOk, fightersOk,
      zones: (state.hazardZones || []).length,
      dmg: state.fighters.map((f) => Math.round(f.damage)),
      stocks: state.fighters.map((f) => f.stocks),
    };
  }, current);

  results.push({ stage: current, ...report, newErrors: errors.length - before });
  console.log(current.padEnd(16), JSON.stringify(report));

  // quit to menu for the next stage
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.click("#pauseMenuButton");
  await page.waitForTimeout(300);
}

// toggle OFF check: no fx entity, neutral mods
current = "toggle-off";
await page.click('[data-character="gojo"]');
await page.waitForTimeout(250);
await page.click("#settingsButton");
await page.waitForTimeout(200);
await page.click("#settingsBoardsButton");
const label = await page.textContent("#settingsBoardsButton");
await page.click("#settingsBackButton");
await page.click("#startButton");
await page.waitForSelector(".stage-card");
await page.locator(".stage-card").nth(9).click(); // Bone Sanctum
await waitForMatch();
const off = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  state.matchTime = 25;
  await new Promise((r) => setTimeout(r, 900));
  return {
    fxCount: state.entities.filter((e) => e.owner === null).length,
    mods: JSON.stringify(state.stageMods),
    anyGhost: state.platforms.some((p) => p.ghost),
  };
});
console.log("toggle-off label:", JSON.stringify(label), JSON.stringify(off));

console.log("\n=== ERRORS ===", errors.length);
for (const e of errors) console.log(e.stage, "→", e.err.slice(0, 300));
await browser.close();
process.exit(errors.length ? 1 : 0);
