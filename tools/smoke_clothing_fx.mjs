// Clothing FX end to end, THROUGH THE MENU AND INTO A REAL MATCH.
//
//     node server.mjs &
//     node tools/smoke_clothing_fx.mjs [--shots DIR]
//
// It plays the game the way a player does: leave the title, open Settings,
// click "Clothing FX", pick Uro, pick a stage, wait out the VS splash, and
// then look at the pixels on screen.
//
// WHY IT IS WRITTEN THIS WAY, and it is the whole lesson of this feature.
// The first version of this smoke asserted three things that were all true
// while the effect was invisible in the game:
//
//   * the settings button toggles its own label       — true, and irrelevant
//   * clothingFrame() returns a keyed canvas          — true, and irrelevant
//   * the arena bench renders with it on              — true, and MISLEADING
//
// The arena bench draws through the flat 2D path. The GAME does not: the 2.5D
// camera is on by default, and it replays drawCharFrame's transform chain in
// src/camera3d/billboards.js and blits the image itself, so the hook in
// sprites.js never ran for a single fighter anybody could see. Every unit-ish
// assertion passed and the feature did nothing.
//
// So this asserts on the FRAMEBUFFER, on the canvas the fighters are actually
// drawn to, in a real match — and it finds that canvas by looking for her hair
// rather than assuming which one it is, because assuming was the bug.
//
// The pure-node drift guard (the key still takes the same thing out of the
// same art) is tools/check_clothing_fx.mjs, and that one is in `npm run check`.

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

// Both counts come off the SAME canvas, chosen by which one her hair is on —
// the flat path draws to the 2D canvas, the 2.5D camera to the WebGL one, and
// a smoke that hard-codes either stops testing the shipped renderer the next
// time that default moves. A WebGL canvas cannot be read with getImageData, so
// each canvas is screenshotted and counted through the page's own decoder.

const LABEL = { off: "Off", hem: "Hem", alpha: "Alpha" };

async function measure(page, { mode }) {
  // Leave the title screen. It takes a keypress and the phase is the only
  // honest signal that it landed.
  for (let i = 0; i < 20; i++) {
    const phase = await page.evaluate(async () => (await import("/src/state.js")).state.phase);
    if (phase === "menu") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
  }

  // Cycle the setting to the mode under test — the cycle is Off -> Hem ->
  // Alpha -> Off and it starts on Alpha, the shipped default. A mode the
  // button cannot reach is a mode no player has.
  {
    await page.click("#settingsButton");
    await page.waitForSelector("#settingsClothingButton", { state: "visible" });
    const seen = [await page.textContent("#settingsClothingButton")];
    for (let i = 0; i < 3 && !seen[seen.length - 1].endsWith(LABEL[mode]); i++) {
      await page.click("#settingsClothingButton");
      seen.push(await page.textContent("#settingsClothingButton"));
    }
    check(seen[0] === "Clothing FX: Alpha", "settings: the default is Alpha", `got ${JSON.stringify(seen[0])}`);
    check(seen[seen.length - 1] === `Clothing FX: ${LABEL[mode]}`,
          `settings: the cycle reaches ${LABEL[mode]}`, `saw ${JSON.stringify(seen)}`);
    await page.click("#settingsBackButton");
  }

  await page.waitForSelector('#characterGrid [data-character="uro"]', { state: "visible", timeout: 30000 });
  await page.click('#characterGrid [data-character="uro"]');
  await page.waitForTimeout(400);
  const picked = await page.evaluate(async () => (await import("/src/state.js")).state.selection[1]);
  check(picked === "uro", "the fighter grid takes the pick", `selection ${JSON.stringify(picked)}`);
  await page.click("#startButton");
  await page.waitForSelector("#stageGrid [data-stage]", { timeout: 30000 });
  await page.click("#stageGrid [data-stage]");

  // The VS splash is painted card art, not sprites — the effect never touches
  // it, and a screenshot taken while it is up measures nothing.
  await page.waitForFunction(
    () => (window.__st ??= null) || document.getElementById("introOverlay")?.classList.contains("hidden"),
    null,
    { timeout: 90000, polling: 500 },
  );
  await page.waitForTimeout(3500);

  const state = await page.evaluate(async () => {
    const st = (await import("/src/state.js")).state;
    const fx = await import("/src/clothing_fx.js");
    const rb = await import("/src/render_backend.js");
    return { phase: st.phase, p1: st.fighters[0]?.charKey, mode: fx.clothingFx.mode, backend: rb.renderBackendLabel?.() };
  });

  // Which canvas is she on? Her hair is the marker: light violet, nothing else
  // on this stage comes near it.
  const canvases = await page.$$("canvas");
  let best = null;
  for (const el of canvases) {
    const id = await el.evaluate((n) => n.id);
    const shot = await el.screenshot();
    const counts = await page.evaluate(async (b64) => {
      const img = await new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.src = "data:image/png;base64," + b64;
      });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext("2d");
      cx.drawImage(img, 0, 0);
      const W = c.width, H = c.height;
      const d = cx.getImageData(0, 0, W, H).data;
      // Find her by her hair — light violet, and nothing else on any stage
      // comes near it. Then count the garment ONLY in the body beneath that
      // hair. Counting the whole frame measures the stage: Training Bridge's
      // water and foliage put ~12k cyan pixels on screen, which buries a
      // garment of one or two thousand and reads as "no change".
      let hair = 0, hx0 = W, hx1 = 0, hy0 = H, hy1 = 0;
      for (let p = 0, i = 0; p < W * H; p++, i += 4) {
        const r = d[i], g = d[i + 1], bl = d[i + 2];
        if (!(r > 195 && bl > 205 && g < r - 25 && g < bl - 25)) continue;
        hair++;
        const x = p % W, y = (p - x) / W;
        if (x < hx0) hx0 = x;
        if (x > hx1) hx1 = x;
        if (y < hy0) hy0 = y;
        if (y > hy1) hy1 = y;
      }
      let cloth = 0;
      let box = null;
      if (hair > 200) {
        const hw = hx1 - hx0 + 1, hh = hy1 - hy0 + 1;
        const cxh = (hx0 + hx1) / 2;
        // Her TORSO, not a generous body box: the bands sit directly under
        // the head, and every pixel of margin is stage showing through. Her
        // hair is drawn much wider than she is, so the box is a fraction of
        // it, and it starts at the hair's bottom rather than its top.
        const bx0 = Math.max(0, Math.round(cxh - hw * 0.45));
        const bx1 = Math.min(W - 1, Math.round(cxh + hw * 0.45));
        const by0 = Math.max(0, Math.round(hy1 - hh * 0.1));
        const by1 = Math.min(H - 1, Math.round(hy1 + hh * 1.6));
        box = { bx0, bx1, by0, by1 };
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
          const i = (y * W + x) * 4;
          const r = d[i], g = d[i + 1], bl = d[i + 2];
          const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
          // Her cloud is a LIGHT cyan — around (180, 225, 245). The tests are
          // pitched above the stage behind her: wet stone is darker and
          // greyer, foliage is green-dominant, water is deeper. Calibrated
          // against the off/on pair on Training Bridge, which is the busiest
          // backdrop the picker can hand us.
          if (bl >= 215 && g >= 195 && bl > r + 45 && g > r + 20 && max - min >= 35) cloth++;
        }
      }
      return { hair, cloth, box };
    }, shot.toString("base64"));
    if (!best || counts.hair > best.hair) best = { id, ...counts, el };
  }
  return { ...state, ...best };
}

async function run(mode) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => {
    failures++;
    console.log(`FAIL page error   ${e.message}`);
  });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector("#settingsButton", { state: "visible", timeout: 30000 });
  const out = await measure(page, { mode });
  if (SHOTS) {
    const box = await out.el.boundingBox();
    await page.screenshot({
      path: path.join(SHOTS, `match_${mode}.png`),
      clip: { x: box.x + box.width * 0.18, y: box.y + box.height * 0.20, width: box.width * 0.20, height: box.height * 0.42 },
    });
  }
  await browser.close();
  return out;
}

if (SHOTS) await mkdir(SHOTS, { recursive: true });

const off = await run("off");
const hem = await run("hem");
const alpha = await run("alpha");

console.log(`\n     backend ${off.backend} · fighters drawn on #${off.id}`);
console.log(`     garment pixels: off ${off.cloth}, hem ${hem.cloth}, alpha ${alpha.cloth}\n`);

for (const [name, run_] of [["off", off], ["hem", hem], ["alpha", alpha]]) {
  check(run_.phase === "playing" && run_.p1 === "uro", `${name}: a real match starts with Uro`);
  check(run_.mode === name, `${name}: the mode the game is in is the one asked for`, `got ${run_.mode}`);
  check(run_.hair > 200, `${name}: Uro is on screen`, `hair px ${run_.hair}`);
}
check(off.cloth > 400, "off: her garment is drawn solid", `${off.cloth} garment px`);
// The heart of it: BOTH keying modes have to actually remove the cloth from
// the framebuffer. Hem leaves the garment's own outline standing and alpha
// leaves a frame on the body edge, so neither reaches zero — but both take the
// mass of it, and a mode that stopped reaching the renderer would sit up near
// `off` where these thresholds catch it.
check(hem.cloth < off.cloth * 0.35, "hem: the garment is keyed out of the picture",
      `${hem.cloth} vs ${off.cloth} — the effect is not reaching the renderer`);
check(alpha.cloth < off.cloth * 0.35, "alpha: the garment is keyed out of the picture",
      `${alpha.cloth} vs ${off.cloth} — the effect is not reaching the renderer`);

console.log(failures ? `\n${failures} failure(s)` : "\nclothing fx reaches the screen in every mode");
process.exit(failures ? 1 : 0);
