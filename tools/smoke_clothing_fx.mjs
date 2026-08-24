// Clothing FX, end to end in a browser (src/clothing_fx.js). Needs a server,
// so it is not part of `npm run check`; the drift guard that IS part of it is
// tools/check_clothing_fx.mjs, which needs neither browser nor server.
//
//     node server.mjs &
//     node tools/smoke_clothing_fx.mjs [--shots DIR]
//
// Four things, because each one has failed differently during the build:
//
//   1. The setting exists on the settings screen and toggles its own label.
//   2. The pass keys a real Uro frame — and keys NOTHING on a fighter with no
//      garment profile, which is the property that keeps this a table of one
//      rather than something the whole roster silently gets.
//   3. The keyed canvas is the same size as the source image. Everything the
//      game knows about where a body is comes off the manifest, so a pass that
//      returned a differently sized drawing would move a fighter without
//      moving one number anybody could check.
//   4. Uro renders through the game's own draw path with the effect on, in the
//      arena bench — which is the game, not a preview.
//
// Exits non-zero on the first failed assertion. `--shots` writes what it drew.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
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
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => {
  failures++;
  console.log(`FAIL page error   ${e.message}`);
});
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// --- 1. the setting ---------------------------------------------------------
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForSelector("#settingsButton", { state: "visible", timeout: 30000 });
await page.click("#settingsButton");
await page.waitForSelector("#settingsClothingButton", { state: "visible" });
const off = await page.textContent("#settingsClothingButton");
check(off === "Clothing FX: Off", "settings: default label is Off", `got ${JSON.stringify(off)}`);
await page.click("#settingsClothingButton");
const on = await page.textContent("#settingsClothingButton");
check(on === "Clothing FX: On", "settings: click turns it On", `got ${JSON.stringify(on)}`);
await page.click("#settingsClothingButton");
check(await page.textContent("#settingsClothingButton") === "Clothing FX: Off",
      "settings: click turns it back Off");
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "settings.png") });

// --- 2 & 3. the pass, on a character with a profile and one without ---------
const pass = await page.evaluate(async () => {
  const fx = await import("/src/clothing_fx.js");
  const assets = await import("/src/assets.js");
  await assets.loadCoreAssets();
  fx.setClothingFx(true);

  const load = (charKey, frameKey) =>
    assets.loadFrame(charKey, frameKey).then(() => assets.frameImage(charKey, frameKey));

  const out = {};
  for (const [charKey, frameKey] of [["uro", "idle_a"], ["gojo", "idle_a"]]) {
    const img = await load(charKey, frameKey);
    if (!img) { out[charKey] = { error: "no image" }; continue; }
    const keyed = fx.clothingFrame(charKey, frameKey, img);
    // How many pixels actually lost their alpha, measured off the two drawings
    // rather than trusted from the mask.
    const read = (src) => {
      const c = document.createElement("canvas");
      c.width = src.width || src.naturalWidth;
      c.height = src.height || src.naturalHeight;
      c.getContext("2d").drawImage(src, 0, 0);
      return c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    };
    const before = read(img);
    const after = read(keyed);
    let cleared = 0;
    for (let i = 3; i < before.length; i += 4) {
      if (before[i] > 8 && after[i] === 0) cleared++;
    }
    out[charKey] = {
      same: keyed === img,
      w: keyed.width || keyed.naturalWidth,
      h: keyed.height || keyed.naturalHeight,
      srcW: img.naturalWidth,
      srcH: img.naturalHeight,
      cleared,
      total: (img.naturalWidth * img.naturalHeight),
    };
  }
  return out;
});

const uro = pass.uro;
const gojo = pass.gojo;
check(!uro.error && !uro.same, "uro: the pass returns a keyed copy, not the source");
check(uro.w === uro.srcW && uro.h === uro.srcH,
      "uro: the keyed drawing is the same size as the source",
      `${uro.w}x${uro.h} vs ${uro.srcW}x${uro.srcH}`);
const pct = (uro.cleared / uro.total) * 100;
check(pct > 3 && pct < 15, "uro: a plausible share of the frame is keyed",
      `${pct.toFixed(1)}% cleared`);
check(gojo.same === true, "gojo: a fighter with no garment profile is untouched");

// --- 4. the game's own draw path -------------------------------------------
// The arena bench runs render.js against real state, so this is the picture a
// match draws. Two shots: effect off, then on, so a regression that keys
// nothing is as visible as one that keys everything.
for (const enabled of [false, true]) {
  await page.goto(`${BASE}/workbench/?edit=arena&char=uro`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("canvas") !== null, { timeout: 30000 });
  await page.evaluate(async (on) => {
    const fx = await import("/src/clothing_fx.js");
    fx.setClothingFx(on);
  }, enabled);
  // Let the bench finish streaming the fighter's art and draw a few frames
  // with the setting in its final position.
  await page.waitForTimeout(4000);
  const drew = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return !!c && c.width > 0 && c.height > 0;
  });
  check(drew, `arena bench draws with Clothing FX ${enabled ? "on" : "off"}`);
  if (SHOTS) {
    await page.locator("canvas").first()
      .screenshot({ path: path.join(SHOTS, `arena_${enabled ? "on" : "off"}.png`) });
  }
}

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nclothing fx ok");
process.exit(failures ? 1 : 0);
