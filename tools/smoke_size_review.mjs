// Smoke the 3D workbench's size review — the full-screen, one-fighter-at-a-
// time pass that sizes each model against its own idle sprite and produces
// the adjustment payload.
//
// It is driven on a PHONE viewport, because that is what it is for and
// because every failure it has had so far was a layout failure: an entry
// point buried behind a panel tab, a figure eighty pixels tall, a control row
// that wrapped, a reference sprite clipped off the side of the screen. None
// of those throw; they just make the tool useless, and only a real viewport
// shows them.
//
// Needs `playwright` with WebKit installed; start the game first
// (node server.mjs), then: node tools/smoke_size_review.mjs [baseUrl]
import { chromium, webkit, devices } from "playwright";

// Flags and the base URL share argv; take the first non-flag.
const BASE = process.argv.slice(2).find((a) => !a.startsWith("--"))
  || "http://127.0.0.1:5174";
const PHONE = { width: 390, height: 844 };

// WEBKIT BY DEFAULT, because the bug this test now guards was invisible to
// Chromium. A phone-sized Chromium window is not a phone: the workbench
// booted fine there while an actual iPhone ran out of memory loading
// twenty-seven models, never finished its module, and presented a fully
// drawn page on which nothing at all worked. Same engine as Safari or the
// test does not cover the device the tool is for. Pass --chromium to
// cross-check the other engine.
const useChromium = process.argv.includes("--chromium");
const browser = useChromium
  ? await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
  })
  : await webkit.launch();
console.log(`engine: ${useChromium ? "chromium" : "webkit (Safari)"}`);

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const context = useChromium
  ? await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  : await browser.newContext({ ...devices["iPhone 13"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
// Every model the page pulls, so the boot cost is measured rather than
// assumed — see the eager-load note below.
let glbCount = 0, glbBytes = 0;
page.on("response", async (r) => {
  if (!r.url().endsWith(".glb")) return;
  glbCount++;
  try { glbBytes += (await r.body()).length; } catch { /* body gone */ }
});

const t0 = Date.now();
await page.goto(`${BASE}/render3d/workbench/index.html?char=gakuganji&state=idle`,
  { waitUntil: "load" });
let booted = true;
await page.waitForFunction(() => window.__workbenchReady === true, { timeout: 90000 })
  .catch(() => { booted = false; });
const bootSecs = (Date.now() - t0) / 1000;

check(booted, "the module finishes booting on a phone", `${bootSecs.toFixed(1)}s`);
// THE regression guard. The workbench used to fetch every approved delivery
// before wiring a single control: 27 models, 56 MB. That is what killed it on
// an iPhone, and nothing about it looked like a failure — the page rendered,
// and every button did nothing.
check(glbCount <= 3, "boot loads one fighter, not the whole roster",
  `${glbCount} model(s), ${(glbBytes / 1e6).toFixed(1)} MB in ${bootSecs.toFixed(1)}s`);
check(await page.evaluate(() => document.getElementById("bootError").hidden),
  "no boot failure was reported");

// The way in has to be reachable without opening anything first.
check(await page.isVisible("#facingReviewTop"),
  "the way in is visible on a phone without opening a panel");

await page.click("#facingReviewTop");
await page.waitForTimeout(2600);

const open = await page.evaluate(() => {
  const o = document.getElementById("facingOverlay");
  const c = document.querySelector("#facingStage canvas");
  const r = c?.getBoundingClientRect();
  const foot = document.querySelector("#facingOverlay footer").getBoundingClientRect();
  return {
    visible: !o.hidden,
    borrowedCanvas: !!c,
    canvasH: r ? Math.round(r.height) : 0,
    stageH: Math.round(document.getElementById("facingStage").getBoundingClientRect().height),
    footTop: Math.round(foot.top),
    winH: innerHeight,
    name: document.getElementById("facingName").textContent,
    progress: document.getElementById("facingProgress").textContent,
    scale: document.getElementById("facingScaleVal").textContent,
    stance: document.getElementById("facingStanceVal").textContent,
  };
});
check(open.visible && open.borrowedCanvas,
  "it opens full screen with the real viewer canvas moved into it");
// The FIGURES have to be big enough to compare, which is not the same as the
// canvas filling its box. The facing pass cropped the stage sideways so one
// fighter could fill the height; this pass must show the stage WHOLE, because
// the sprite stands off to the left and cropping is what threw it off screen
// last time. So the thing to hold is the figure, measured on the canvas.
const figure = await page.evaluate(() => {
  const c = document.querySelector("#facingStage canvas");
  const ctx = c.getContext("2d");
  const x0 = Math.round(c.width * 0.5);
  const d = ctx.getImageData(x0, 0, c.width - x0, c.height).data;
  const w = c.width - x0;
  let top = -1, bot = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < w; x++) {
      if (d[((y * w) + x) * 4 + 3] > 90) { if (top < 0) top = y; bot = y; break; }
    }
  }
  return { h: bot - top, canvas: c.height };
});
check(figure.h > figure.canvas * 0.45, "the model fills enough of the frame to judge",
  `${figure.h}px of ${figure.canvas}px`);
check(/\d+ \/ \d+/.test(open.progress),
  "it says where you are in the roster", open.progress);

// Every control on one screen, none wrapped off the bottom.
const rows = await page.evaluate(() => {
  const dial = [...document.querySelectorAll(".facing-dial button, .facing-dial input")]
    .map((e) => e.getBoundingClientRect());
  const acts = [...document.querySelectorAll(".facing-actions button")].map((e) => e.getBoundingClientRect());
  const dialRows = new Set([...document.querySelectorAll(".facing-dial")]
    .map((e) => Math.round(e.getBoundingClientRect().top)));
  return {
    dials: dialRows.size,
    allOnScreen: [...dial, ...acts].every((r) => r.bottom <= innerHeight + 1 && r.top >= 0),
    smallestTouch: Math.min(...[...dial, ...acts].map((r) => Math.min(r.width, r.height))),
  };
});
check(rows.dials === 2, "both dials get a row of their own", `${rows.dials} row(s)`);
check(rows.allOnScreen, "every control is on screen");
check(rows.smallestTouch >= 28, "controls are thumb-sized",
  `smallest ${Math.round(rows.smallestTouch)}px`);

// THE REFERENCE IS ON SCREEN. Sizing against a sprite that is not drawn is
// sizing from memory, and a blank half-frame looks exactly like a model that
// is already right. Both figures are sampled from the real canvas: the sprite
// stands COMPARE_DX left of the model, and both must have pixels standing on
// the floor line.
const halves = await page.evaluate(() => {
  const c = document.querySelector("#facingStage canvas");
  const ctx = c.getContext("2d");
  const count = (x0, x1) => {
    const d = ctx.getImageData(x0, 0, x1 - x0, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 90) n++;
    return n;
  };
  const mid = Math.round(c.width * 0.5);
  return { left: count(0, mid), right: count(mid, c.width) };
});
check(halves.left > 400, "the idle sprite is drawn beside the model",
  `${halves.left} px in the sprite half`);
check(halves.right > 400, "...and the model is drawn too",
  `${halves.right} px in the model half`);

// The dials move the RIG, not just their readouts.
const sized = await (async () => {
  const before = await page.evaluate(async () =>
    (await import("/render3d/src/loader.js")).getRig("gakuganji").renderScale);
  await page.fill("#facingScale", "1.22");
  await page.dispatchEvent("#facingScale", "input");
  await page.waitForTimeout(700);
  return {
    before,
    after: await page.evaluate(async () =>
      (await import("/render3d/src/loader.js")).getRig("gakuganji").renderScale),
    shown: await page.textContent("#facingScaleVal"),
  };
})();
check(Math.abs(sized.after - 1.22) < 0.001, "the size dial rescales the RIG",
  `${sized.before}× -> ${sized.after}× (shown ${sized.shown})`);

const stanced = await (async () => {
  await page.fill("#facingStance", "12");
  await page.dispatchEvent("#facingStance", "input");
  await page.waitForTimeout(700);
  return {
    rig: await page.evaluate(async () =>
      (await import("/render3d/src/loader.js")).getRig("gakuganji").stanceDeg),
    shown: await page.textContent("#facingStanceVal"),
  };
})();
check(stanced.rig === 12, "the stance dial widens the RIG's legs",
  `${stanced.rig}° (shown ${stanced.shown})`);

// Stance has to reach the PIXELS, not just the rig object — it is a pose
// layer, and a layer that never gets applied changes a number and nothing
// else. Wide legs are wider: measure the model's silhouette at ankle height.
const widths = await page.evaluate(async (deg) => {
  const rigMod = await import("/render3d/src/loader.js");
  const scene = await import("/render3d/src/scene.js");
  const c = document.querySelector("#facingStage canvas");
  const ctx = c.getContext("2d");
  const ankleBand = () => {
    // A band just above the floor line, model half only.
    const y0 = Math.round(c.height * 0.78), y1 = Math.round(c.height * 0.86);
    const x0 = Math.round(c.width * 0.5);
    const d = ctx.getImageData(x0, y0, c.width - x0, y1 - y0).data;
    const w = c.width - x0;
    let lo = 1e9, hi = -1;
    for (let y = 0; y < y1 - y0; y++) {
      for (let x = 0; x < w; x++) {
        if (d[((y * w) + x) * 4 + 3] > 90) { if (x < lo) lo = x; if (x > hi) hi = x; }
      }
    }
    return hi < 0 ? 0 : hi - lo;
  };
  const settle = () => new Promise((r) => setTimeout(r, 700));
  rigMod.setRigSettings("gakuganji", { stanceDeg: 0 });
  scene.clearCache();
  await settle();
  const narrow = ankleBand();
  rigMod.setRigSettings("gakuganji", { stanceDeg: deg });
  scene.clearCache();
  await settle();
  return { narrow, wide: ankleBand() };
}, 22);
check(widths.wide > widths.narrow + 4,
  "...and that reaches the pixels, not just the number",
  `ankles ${widths.narrow}px at 0° -> ${widths.wide}px at 22°`);

// The download is the thing the whole mode exists to produce, and it has to
// be a payload `billboard_intake.mjs apply` will take without editing.
const dl = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
await page.click("#facingSave");
const download = await dl;
check(!!download, "Download JSON produces a file",
  download ? download.suggestedFilename() : "no download event");
if (download) {
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* reported below */ }
  check(payload?.kind === "render3d-workbench",
    "...in the shape `apply --backend 3d` expects", `kind ${payload?.kind}`);
  const entry = payload?.characters?.gakuganji;
  check(!!entry && Number.isFinite(entry.renderScale) && Number.isFinite(entry.stanceDeg),
    "...carrying both adjustments on a full manifest entry",
    entry ? `gakuganji ${entry.renderScale}× / ${entry.stanceDeg}°` : "gakuganji missing");
  check(!!entry?.model && entry?.approved === true,
    "...without dropping the rest of that character's entry");
}

// Closing puts the viewer back where it came from — a workbench left without
// its canvas is a dead page.
await page.click("#facingClose");
await page.waitForTimeout(900);
const closed = await page.evaluate(() => ({
  hidden: document.getElementById("facingOverlay").hidden,
  back: !!document.querySelector(".stage-col canvas#stage"),
}));
check(closed.hidden && closed.back, "closing restores the viewer to the desk");
check(glbCount < 27, "the whole roster never got pulled in",
  `${glbCount} model(s), ${(glbBytes / 1e6).toFixed(1)} MB`);
check(errors.length === 0, "no page errors throughout", errors.slice(0, 2).join(" | "));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
