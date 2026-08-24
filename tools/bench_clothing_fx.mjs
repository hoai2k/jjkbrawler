// How long the Clothing FX pass takes, per frame and for a whole character.
//
//   node tools/bench_clothing_fx.mjs [--char uro] [--runs 5]
//
// The number that matters is the TOTAL: main.js warms a fighter's frames behind
// the VS splash, so that total is how much longer the splash has to stand
// before every pose is keyed. Per-frame matters too — a frame that misses the
// warm is keyed on its first draw, and that cost lands inside a rendered frame.

import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const CHAR = arg("char", "uro");
const RUNS = Number(arg("runs", 5));

async function dataUrl(rel, mime) {
  const buf = await readFile(path.join(ROOT, rel));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const manifest = JSON.parse(await readFile(path.join(ROOT, "sprites/assets/manifest.json"), "utf8"));
const frames = Object.entries(manifest.characters[CHAR]).map(([key, meta]) => ({ key, file: meta.file }));

const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.setContent("<body style='margin:0'></body>");

const modUrl = await dataUrl("src/clothing_fx.js", "text/javascript");
const rows = [];

for (const frame of frames) {
  const spriteUrl = await dataUrl(`sprites/assets/${frame.file}`, "image/png");
  const ms = await page.evaluate(async ({ spriteUrl, modUrl, char, runs }) => {
    const { GARMENTS, garmentMask } = await import(modUrl);
    const profile = GARMENTS[char];
    const im = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = spriteUrl;
    });
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const cx = c.getContext("2d");
    cx.drawImage(im, 0, 0);
    const data = cx.getImageData(0, 0, im.width, im.height);
    const times = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      garmentMask(data, profile);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return { median: times[times.length >> 1], px: im.width * im.height };
  }, { spriteUrl, modUrl, char: CHAR, runs: RUNS });
  rows.push({ ...frame, ...ms });
}

rows.sort((a, b) => b.median - a.median);
const total = rows.reduce((n, r) => n + r.median, 0);
console.log(`${CHAR}: ${rows.length} frames, median-of-${RUNS} per frame\n`);
for (const r of rows.slice(0, 5)) {
  console.log(`  slowest  ${r.key.padEnd(18)} ${r.median.toFixed(1)}ms  (${(r.px / 1e6).toFixed(2)}Mpx)`);
}
console.log(`\n  per frame  median ${rows[rows.length >> 1].median.toFixed(1)}ms   max ${rows[0].median.toFixed(1)}ms`);
console.log(`  whole set  ${(total / 1000).toFixed(2)}s`);

await browser.close();
