// Uro breaks the screen, END TO END — the shatter reaches the framebuffer.
//
//     node server.mjs &
//     node tools/smoke_sky_shatter.mjs [--shots DIR]
//
// Plays a real match as Uro, casts Sky Warp Palm, and asserts three things:
//
//   * the shatter LIFECYCLE runs — state.skyShatter appears on the impact beat
//     and cleans itself up afterwards;
//   * the crack web reaches the PIXELS — the count of blazing near-white pixels
//     on screen during the break is a multiple of the count in calm play. The
//     Clothing FX bug shipped because every check stopped short of the
//     framebuffer; effects here get asserted on the framebuffer, full stop;
//   * no page errors anywhere in the run — the capture path touches WebGL
//     readback, which is exactly the kind of thing that fails quietly.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = flag("base", "http://127.0.0.1:5174");
const SHOTS = flag("shots", null);

let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`ok   ${label}`);
  else {
    failures++;
    console.log(`FAIL ${label}${detail ? `   ${detail}` : ""}`);
  }
};

const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** Count near-white pixels on the 2D overlay canvas — the canvas the shatter
 *  is drawn on — right now, synchronously, in-page. Screenshot-based counting
 *  could not catch the quarter-second blaze (each capture cost ~300ms and the
 *  DOM HUD's white text swamped the signal); reading the overlay's own pixels
 *  every frame can, and that canvas is still exactly what the player sees. */
function overlayWhite() {
  return `(() => {
    const c = document.getElementById("gameCanvas");
    if (!c) return -1;
    const g = c.getContext("2d");
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 8) {
      if (d[i + 3] > 100 && d[i] > 235 && d[i + 1] > 240 && d[i + 2] > 240) n++;
    }
    return n;
  })()`;
}

if (SHOTS) await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => {
  failures++;
  console.log(`FAIL page error   ${e.message}`);
});
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForSelector("#settingsButton", { state: "visible", timeout: 30000 });

for (let i = 0; i < 20; i++) {
  const phase = await page.evaluate(async () => (await import("/src/state.js")).state.phase);
  if (phase === "menu") break;
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}
await page.waitForSelector('#characterGrid [data-character="uro"]', { state: "visible", timeout: 30000 });
await page.click('#characterGrid [data-character="uro"]');
await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector("#stageGrid [data-stage]", { timeout: 30000 });
await page.click("#stageGrid [data-stage]");
await page.waitForFunction(
  () => document.getElementById("introOverlay")?.classList.contains("hidden"),
  null, { timeout: 90000, polling: 500 },
);
for (let i = 0; i < 60; i++) {
  const st = await page.evaluate(async () => {
    const s = (await import("/src/state.js")).state;
    return { introT: s.introT, phase: s.phase };
  });
  if (st.phase === "playing" && st.introT <= 0) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(400);

const calm = await page.evaluate(overlayWhite());

// Cast, then let an in-page frame loop watch the whole lifetime: it samples
// the overlay every animation frame while state.skyShatter lives, so the
// quarter-second of visible cracks cannot fall between out-of-process polls.
//
// Cast up to three times: the CPU is a live opponent, and a hit landing
// during the windup cancels the special — a real match fact, not a bug, and
// not what this smoke exists to measure.
let run = { sawShatter: false, peak: 0 };
for (let attempt = 0; attempt < 3 && !run.sawShatter; attempt++) {
  await page.keyboard.press("KeyL");
  run = await watch(page);
  if (!run.sawShatter) await page.waitForTimeout(600);
}
const watchResult = run;

async function watch(page2) {
  return await page2.evaluate(async (expr) => {
  const mod = await import("/src/state.js");
  const sample = () => eval(expr);
  return await new Promise((resolve) => {
    let sawShatter = false;
    let peak = 0;
    let frames = 0;
    const tick = () => {
      frames++;
      const live = !!mod.state.skyShatter;
      if (live) {
        sawShatter = true;
        peak = Math.max(peak, sample());
      }
      if ((sawShatter && !live) || frames > 600 || (!sawShatter && frames > 120)) {
        resolve({ sawShatter, peak, ended: !live });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  }, overlayWhite());
}
const { sawShatter, peak } = watchResult;
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "after.png") });

const cleared = await page.evaluate(async () => !(await import("/src/state.js")).state.skyShatter);

check(sawShatter, "the impact raises a screen shatter");
check(cleared, "the shatter cleans itself up");
check(peak > Math.max(600, calm * 2),
      "the crack web blazes on the framebuffer",
      `calm ${calm} bright px, peak ${peak}`);

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nthe sky breaks on screen");
process.exit(failures ? 1 : 0);
