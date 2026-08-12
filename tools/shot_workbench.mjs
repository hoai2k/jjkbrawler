#!/usr/bin/env node
// Screenshot a fighter's states in a model workbench, cropped to the figure.
//
//     node server.mjs &
//     node tools/shot_workbench.mjs uro idle win ult
//     node tools/shot_workbench.mjs --backend billboard maki sideHeavy
//
// Reviewing a delivered rig means looking at it, and looking at it means
// half a dozen navigations, a wait for the engine to load, a pause on the
// contact beat and a crop — per state, per character, per re-import. That is
// the loop this exists to collapse.
//
// Shots land in the directory given by SHOT_DIR (default ./_shots), named
// `<backend>_<char>_<state>.png`, and the frame is held at the state's
// contact beat so a strike is caught where it lands rather than mid-windup.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const backend = flag("backend", "3d");
const base = flag("base", "http://127.0.0.1:5174");
const positional = argv.filter((a, i) =>
  !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const [char, ...states] = positional;
if (!char || !states.length) {
  console.error("usage: shot_workbench.mjs [--backend 3d|billboard] [--base URL] <char> <state...>");
  process.exit(2);
}

const dir = process.env.SHOT_DIR || "_shots";
mkdirSync(dir, { recursive: true });
const wb = backend === "billboard" ? "billboards" : "render3d";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));

for (const state of states) {
  await page.goto(`${base}/${wb}/workbench/index.html?char=${char}&state=${state}`,
    { waitUntil: "load" });
  // The workbench loads three.js, the manifest and the rig through dynamic
  // import; there is no ready flag to await, so wait for the canvas to stop
  // being empty by giving it a beat.
  await page.waitForTimeout(3500);
  await page.evaluate(async (s) => {
    const { STATES, clipNameFor } = await import("/render3d/src/states.js");
    const spec = STATES[clipNameFor(s)];
    if (window.wb) {
      window.wb.playing = false;
      window.wb.t = spec?.beat ?? (spec?.duration ?? 0.5) / 2;
    }
  }, state).catch(() => {});
  await page.waitForTimeout(600);
  // Crop RELATIVE TO THE STAGE CANVAS, not to fixed page pixels. The
  // workbench's side panels grow — a pose editor landed in one and pushed the
  // figure a couple of hundred pixels left, so every shot came out framing an
  // empty corner of the layout. Asking the canvas where it is costs one
  // evaluate and cannot go stale.
  const box = await page.locator("#stage").boundingBox();
  const clip = box
    ? {
      x: box.x + box.width * 0.28,
      y: box.y + box.height * 0.36,
      width: Math.min(box.width * 0.42, 440),
      height: Math.min(box.height * 0.52, 320),
    }
    : { x: 700, y: 360, width: 440, height: 300 };
  const path = join(dir, `${backend}_${char}_${state}.png`);
  await page.screenshot({ path, clip });
  console.log(path);
}

await browser.close();
