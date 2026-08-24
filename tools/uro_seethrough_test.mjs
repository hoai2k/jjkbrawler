// Uro's cloud garments keyed out, composited over a stage background.
//
//   node tools/uro_seethrough_test.mjs [--out DIR] [--bg NAME] [--poses a,b,c]
//                                      [--alpha 0] [--hem 3] [--format jpeg]
//   node tools/uro_seethrough_test.mjs --contact [--cols 8] [--page 12]
//
// `--contact` draws every pose keyed, in a grid over the stage, split across
// as many sheets as it takes. That is the sheet the drift guard means when it
// says to look at the frames before blessing them
// (tools/check_clothing_fx.mjs).
//
// This is the sheet that decided the shipped effect (Settings -> "Clothing FX",
// off by default). It renders through `src/clothing_fx.js` — the same module
// the game draws with — so the comparison cannot drift from what a player sees.
// `--alpha` and `--hem` override the shipped profile so alternatives can be put
// beside it; the defaults ARE the shipped profile.
//
// Notes and the verdict this produced: docs/experiments/uro-seethrough/.

import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT = path.resolve(ROOT, arg("out", "debug/uro_seethrough"));
const BG = arg("bg", "mist_pier");
const FORMAT = arg("format", "png");
const POSES = arg("poses", "idle_a,victory,attack_heavy_a,dodge_roll").split(",");
const ALPHA = arg("alpha", null);
const CONTACT = process.argv.includes("--contact");
const COLS = Number(arg("cols", 8));
const PAGE = Number(arg("page", 16));
const HEM = arg("hem", null);

async function dataUrl(rel, mime) {
  const buf = await readFile(path.join(ROOT, rel));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// The game module, handed to the page as an importable data URL. A dynamic
// `import()` of one gives the page the real exports — no source rewriting, and
// nothing here can quietly diverge from the file the game loads.
async function moduleUrl(rel) {
  return dataUrl(rel, "text/javascript");
}

// ---------------------------------------------------------------- page work

// Runs inside the browser. Returns a data URL of the comparison sheet.
async function composeInPage({ spriteUrl, bgUrl, modUrl, label, alpha, hem, format }) {
  const { GARMENTS, garmentMask } = await import(modUrl);
  const profile = { ...GARMENTS.uro };
  if (alpha !== null) profile.alpha = Number(alpha);
  if (hem !== null) profile.hem = Number(hem);

  const load = (src) =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = src;
    });
  const [sprite, bg] = await Promise.all([load(spriteUrl), load(bgUrl)]);

  const W = sprite.width;
  const H = sprite.height;
  const sc = document.createElement("canvas");
  sc.width = W;
  sc.height = H;
  const sx = sc.getContext("2d");
  sx.drawImage(sprite, 0, 0);
  const img = sx.getImageData(0, 0, W, H);

  const t0 = performance.now();
  const mask = garmentMask(img, profile);
  const ms = performance.now() - t0;

  const d = img.data;
  let cut = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    cut++;
    d[p * 4 + 3] = Math.round(d[p * 4 + 3] * profile.alpha);
  }
  const kc = document.createElement("canvas");
  kc.width = W;
  kc.height = H;
  kc.getContext("2d").putImageData(img, 0, 0);

  // Comparison sheet: as drawn | keyed, both over the stage.
  const PANEL_H = 900;
  const scale = PANEL_H / H;
  const panelW = Math.round(W * scale) + 80;
  const sheet = document.createElement("canvas");
  sheet.width = panelW * 2;
  sheet.height = PANEL_H + 70;
  const cx = sheet.getContext("2d");
  cx.imageSmoothingQuality = "high";

  const drawPanel = (ox, art, caption) => {
    cx.save();
    cx.beginPath();
    cx.rect(ox, 0, panelW, PANEL_H);
    cx.clip();
    const bs = Math.max(panelW / bg.width, PANEL_H / bg.height);
    cx.drawImage(bg, ox + (panelW - bg.width * bs) / 2, (PANEL_H - bg.height * bs) / 2,
                 bg.width * bs, bg.height * bs);
    cx.drawImage(art, ox + 40, 0, W * scale, PANEL_H);
    cx.restore();
    cx.fillStyle = "#0b0d12";
    cx.fillRect(ox, PANEL_H, panelW, 70);
    cx.fillStyle = "#e8eef6";
    cx.font = "600 24px system-ui, sans-serif";
    cx.textBaseline = "middle";
    cx.fillText(caption, ox + 20, PANEL_H + 35);
  };

  drawPanel(0, sprite, `${label} — as drawn`);
  drawPanel(panelW, kc, `${label} — Clothing FX (alpha ${profile.alpha}, hem ${profile.hem})`);
  cx.strokeStyle = "#0b0d12";
  cx.lineWidth = 4;
  cx.beginPath();
  cx.moveTo(panelW, 0);
  cx.lineTo(panelW, PANEL_H);
  cx.stroke();

  const url = format === "jpeg" ? sheet.toDataURL("image/jpeg", 0.86) : sheet.toDataURL("image/png");
  return { url, cut, total: W * H, ms };
}

// Runs inside the browser: one page of the contact sheet.
async function contactInPage({ sprites, bgUrl, modUrl, alpha, hem, cols, title, format }) {
  const { GARMENTS, garmentMask } = await import(modUrl);
  const profile = { ...GARMENTS.uro };
  if (alpha !== null) profile.alpha = Number(alpha);
  if (hem !== null) profile.hem = Number(hem);

  const load = (src) =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = src;
    });
  const bg = await load(bgUrl);

  const CELL_W = 260;
  const CELL_H = 380;
  const rows = Math.ceil(sprites.length / cols);
  const sheet = document.createElement("canvas");
  sheet.width = cols * CELL_W;
  sheet.height = rows * CELL_H + 44;
  const cx = sheet.getContext("2d");
  cx.imageSmoothingQuality = "high";
  cx.fillStyle = "#0b0d12";
  cx.fillRect(0, 0, sheet.width, sheet.height);
  cx.fillStyle = "#e8eef6";
  cx.font = "600 22px system-ui, sans-serif";
  cx.textBaseline = "middle";
  cx.fillText(title, 16, 22);

  for (let i = 0; i < sprites.length; i++) {
    const { pose, url } = sprites[i];
    const im = await load(url);
    const W = im.width;
    const H = im.height;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ic = c.getContext("2d");
    ic.drawImage(im, 0, 0);
    // Honour the profile's skip list, so the sheet shows what SHIPS rather
    // than what the key would do if it were let loose on every pose.
    const skipped = profile.skip?.includes(pose);
    if (!skipped) {
      const frame = ic.getImageData(0, 0, W, H);
      const mask = garmentMask(frame, profile);
      const d = frame.data;
      for (let p = 0; p < mask.length; p++) {
        if (mask[p]) d[p * 4 + 3] = Math.round(d[p * 4 + 3] * profile.alpha);
      }
      ic.putImageData(frame, 0, 0);
    }

    const col = i % cols;
    const row = (i / cols) | 0;
    const ox = col * CELL_W;
    const oy = row * CELL_H + 44;
    cx.save();
    cx.beginPath();
    cx.rect(ox, oy, CELL_W - 2, CELL_H - 2);
    cx.clip();
    const bs = Math.max((CELL_W - 2) / bg.width, (CELL_H - 2) / bg.height);
    cx.drawImage(bg, ox + ((CELL_W - 2) - bg.width * bs) / 2, oy + ((CELL_H - 2) - bg.height * bs) / 2,
                 bg.width * bs, bg.height * bs);
    // Fit the drawing into the cell, leaving room for the caption strip.
    const fit = Math.min((CELL_W - 24) / W, (CELL_H - 44) / H);
    cx.drawImage(c, ox + (CELL_W - W * fit) / 2, oy + 8, W * fit, H * fit);
    cx.fillStyle = "rgba(11,13,18,0.86)";
    cx.fillRect(ox, oy + CELL_H - 30, CELL_W - 2, 28);
    cx.fillStyle = "#e8eef6";
    cx.font = "500 15px system-ui, sans-serif";
    cx.fillText(skipped ? `${pose}  — skipped` : pose, ox + 10, oy + CELL_H - 16);
    cx.restore();
  }
  return format === "jpeg" ? sheet.toDataURL("image/jpeg", 0.88) : sheet.toDataURL("image/png");
}

// ------------------------------------------------------------------ driver

const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROME });
const page_ = await browser.newPage();
const page = page_;
await page.setContent("<body style='margin:0'></body>");
await mkdir(OUT, { recursive: true });

const bgUrl = await dataUrl(`assets/backgrounds/${BG}.jpg`, "image/jpeg");
const modUrl = await moduleUrl("src/clothing_fx.js");

if (CONTACT) {
  const { readFile: rf } = await import("node:fs/promises");
  const manifest = JSON.parse(await rf(path.join(ROOT, "sprites/assets/manifest.json"), "utf8"));
  const all = Object.entries(manifest.characters.uro);
  const ext = FORMAT === "jpeg" ? "jpg" : "png";
  for (let page = 0; page * PAGE < all.length; page++) {
    const slice = all.slice(page * PAGE, (page + 1) * PAGE);
    const sprites = [];
    for (const [pose, meta] of slice) {
      sprites.push({ pose, url: await dataUrl(`sprites/assets/${meta.file}`, "image/png") });
    }
    const url = await page_.evaluate(contactInPage, {
      sprites, bgUrl, modUrl, alpha: ALPHA, hem: HEM, cols: COLS, format: FORMAT,
      title: `Uro / Clothing FX / ${BG} — ${page * PAGE + 1}-${page * PAGE + slice.length} of ${all.length}`,
    });
    const file = path.join(OUT, `contact_${page + 1}.${ext}`);
    await writeFile(file, Buffer.from(url.split(",")[1], "base64"));
    console.log(`${path.relative(ROOT, file)}  ${slice.length} poses`);
  }
  await browser.close();
  process.exit(0);
}

for (const pose of POSES) {
  const spriteUrl = await dataUrl(`sprites/assets/uro/${pose}.png`, "image/png");
  const res = await page.evaluate(composeInPage, {
    spriteUrl, bgUrl, modUrl, alpha: ALPHA, hem: HEM, format: FORMAT,
    label: `Uro / ${pose} / ${BG}`,
  });
  const ext = FORMAT === "jpeg" ? "jpg" : "png";
  const file = path.join(OUT, `uro_${pose}.${ext}`);
  await writeFile(file, Buffer.from(res.url.split(",")[1], "base64"));
  const pct = ((res.cut / res.total) * 100).toFixed(1);
  console.log(
    `${path.relative(ROOT, file)}  keyed ${res.cut}px (${pct}%)  mask ${res.ms.toFixed(0)}ms`
  );
}

await browser.close();
