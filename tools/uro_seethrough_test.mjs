// Experiment: Uro's cloud garments keyed to alpha 0, composited over a stage
// background, to see whether a "see-through garments" render mode reads at all.
//
//   node tools/uro_seethrough_test.mjs [--out DIR] [--bg NAME] [--poses a,b,c]
//                                      [--modes cut,hem,ghost:0.45] [--format jpeg]
//
// The key is hue-based with a connected-component pass: cyan cloud pixels are
// the seeds, and near-white pixels are only taken when they are connected to a
// seed, so eye whites and skin highlights survive. Output is a set of
// side-by-side PNGs (original | keyed) over the chosen background.

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
const MODES = arg("modes", "cut,ghost,hem").split(",");

async function dataUrl(rel) {
  const buf = await readFile(path.join(ROOT, rel));
  const ext = path.extname(rel).slice(1).toLowerCase();
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ---------------------------------------------------------------- page work

// Runs inside the browser. Returns a PNG data URL of the comparison sheet.
function composeInPage({ spriteUrl, bgUrl, label, mode, format }) {
  return new Promise((resolve) => {
    const load = (src) =>
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.src = src;
      });

    Promise.all([load(spriteUrl), load(bgUrl)]).then(([sprite, bg]) => {
      // --- 1. read the sprite ------------------------------------------
      const sc = document.createElement("canvas");
      sc.width = sprite.width;
      sc.height = sprite.height;
      const sx = sc.getContext("2d");
      sx.drawImage(sprite, 0, 0);
      const img = sx.getImageData(0, 0, sc.width, sc.height);
      const d = img.data;
      const W = sc.width;
      const H = sc.height;

      // --- 2. classify --------------------------------------------------
      // 2 = seed (saturated cyan cloud), 1 = candidate (near-white, could be
      // cloud interior or an eye white), 0 = keep.
      const cls = new Uint8Array(W * H);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const a = d[i + 3];
        if (a < 8) continue;
        const r = d[i] / 255;
        const g = d[i + 1] / 255;
        const b = d[i + 2] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const v = max;
        const s = max === 0 ? 0 : (max - min) / max;
        let h = 0;
        if (max !== min) {
          if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
          else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
          else h = 60 * ((r - g) / (max - min) + 4);
          if (h < 0) h += 360;
        }
        // The cloud sits in a narrow cyan band. Skin is orange (h ~20-40),
        // hair violet (h ~270-300), choker brown, nails violet.
        if (h >= 165 && h <= 225 && s >= 0.10 && v >= 0.45) cls[p] = 2;
        else if (s < 0.14 && v >= 0.80) cls[p] = 1;
        else if (h >= 150 && h <= 235 && s >= 0.05 && v >= 0.55) cls[p] = 1;
      }

      // --- 3. flood from seeds through candidates -----------------------
      // Label each connected region separately so step 3b can throw away the
      // ones that are not garments (her cursed-energy palm FX is the same cyan).
      const label = new Int32Array(W * H).fill(-1);
      const boxes = [];
      for (let start = 0; start < cls.length; start++) {
        if (cls[start] !== 2 || label[start] >= 0) continue;
        const id = boxes.length;
        const box = { id, x0: W, y0: H, x1: 0, y1: 0, n: 0, pixels: [] };
        boxes.push(box);
        const stack = [start];
        label[start] = id;
        while (stack.length) {
          const p = stack.pop();
          const x = p % W;
          const y = (p - x) / W;
          box.n++;
          box.pixels.push(p);
          if (x < box.x0) box.x0 = x;
          if (y < box.y0) box.y0 = y;
          if (x > box.x1) box.x1 = x;
          if (y > box.y1) box.y1 = y;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              const q = ny * W + nx;
              if (label[q] >= 0 || !cls[q]) continue;
              label[q] = id;
              stack.push(q);
            }
          }
        }
      }

      // --- 3b. keep only the garment regions ----------------------------
      // A garment band is big, and it sits on the torso: between the shoulder
      // line and mid-thigh, and horizontally over the middle of the body.
      // Anything else that is cyan (palm FX, sky ripples) is not clothing.
      let bodyX0 = W, bodyX1 = 0, bodyY0 = H, bodyY1 = 0;
      for (let p = 0, i = 3; p < W * H; p++, i += 4) {
        if (d[i] < 24) continue;
        const x = p % W;
        const y = (p - x) / W;
        if (x < bodyX0) bodyX0 = x;
        if (x > bodyX1) bodyX1 = x;
        if (y < bodyY0) bodyY0 = y;
        if (y > bodyY1) bodyY1 = y;
      }
      const bh = bodyY1 - bodyY0 || 1;
      const bw = bodyX1 - bodyX0 || 1;
      const cxBody = (bodyX0 + bodyX1) / 2;
      const garment = new Set();
      for (const box of boxes) {
        if (box.n < 400) continue;                                // speck
        const midY = ((box.y0 + box.y1) / 2 - bodyY0) / bh;
        const midX = ((box.x0 + box.x1) / 2 - cxBody) / bw;
        if (midY < 0.18 || midY > 0.72) continue;                 // not torso height
        if (Math.abs(midX) > 0.35) continue;                      // off to one side: FX
        garment.add(box.id);
      }

      const keyed = new Uint8Array(W * H);
      const stack2 = [];
      for (const box of boxes) {
        if (!garment.has(box.id)) continue;
        for (const p of box.pixels) { keyed[p] = 1; stack2.push(p); }
      }
      // Absorb the near-white cloud interiors that touch a kept garment region.
      while (stack2.length) {
        const p = stack2.pop();
        const x = p % W;
        const y = (p - x) / W;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const q = ny * W + nx;
            if (keyed[q] || cls[q] !== 1) continue;
            keyed[q] = 1;
            stack2.push(q);
          }
        }
      }

      // --- 3c. keep a one-pixel hem ------------------------------------
      // Erode the mask by `HEM` px so the garment's own dark outline survives
      // at full alpha and the edge reads as a hem, not a tear.
      const HEM = mode === "hem" ? 3 : 0;   // eroded only in hem mode
      if (HEM) {
        let cur = keyed;
        for (let pass = 0; pass < HEM; pass++) {
          const next = new Uint8Array(cur);
          for (let p = 0; p < cur.length; p++) {
            if (!cur[p]) continue;
            const x = p % W;
            const y = (p - x) / W;
            let edge = false;
            for (let dy = -1; dy <= 1 && !edge; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                if (!cur[ny * W + nx]) { edge = true; break; }
              }
            }
            if (edge) next[p] = 0;
          }
          cur = next;
        }
        keyed.set(cur);
      }

      // --- 4. apply -----------------------------------------------------
      // mode "cut"   -> alpha 0 (a true hole)
      // mode "ghost" -> alpha 0.18 (garment left as a faint tint)
      // mode "hem"   -> alpha 0, but the garment outline is kept (see 3c)
      const alpha = mode.startsWith("ghost") ? (Number(mode.split(":")[1]) || 0.18) : 0;
      let cut = 0;
      for (let p = 0; p < keyed.length; p++) {
        if (!keyed[p]) continue;
        cut++;
        d[p * 4 + 3] = Math.round(d[p * 4 + 3] * alpha);
      }
      const kc = document.createElement("canvas");
      kc.width = W;
      kc.height = H;
      kc.getContext("2d").putImageData(img, 0, 0);

      // --- 5. comparison sheet: original | keyed, both over the stage ---
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
        // cover-fit the background into the panel
        const bs = Math.max(panelW / bg.width, PANEL_H / bg.height);
        const bw = bg.width * bs;
        const bh = bg.height * bs;
        cx.drawImage(bg, ox + (panelW - bw) / 2, (PANEL_H - bh) / 2, bw, bh);
        cx.drawImage(art, ox + 40, 0, W * scale, PANEL_H);
        cx.restore();
        cx.fillStyle = "#0b0d12";
        cx.fillRect(ox, PANEL_H, panelW, 70);
        cx.fillStyle = "#e8eef6";
        cx.font = "600 26px system-ui, sans-serif";
        cx.textBaseline = "middle";
        cx.fillText(caption, ox + 20, PANEL_H + 35);
      };

      drawPanel(0, sprite, `${label} — as drawn`);
      drawPanel(panelW, kc, `${label} — garments keyed (${mode})`);
      cx.strokeStyle = "#0b0d12";
      cx.lineWidth = 4;
      cx.beginPath();
      cx.moveTo(panelW, 0);
      cx.lineTo(panelW, PANEL_H);
      cx.stroke();

      const url = format === "jpeg" ? sheet.toDataURL("image/jpeg", 0.86) : sheet.toDataURL("image/png");
      resolve({ url, cut, total: W * H });
    });
  });
}

// ------------------------------------------------------------------ driver

const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.setContent("<body style='margin:0'></body>");
await mkdir(OUT, { recursive: true });

const bgUrl = await dataUrl(`assets/backgrounds/${BG}.jpg`);

for (const pose of POSES) {
  for (const mode of MODES) {
    const spriteUrl = await dataUrl(`sprites/assets/uro/${pose}.png`);
    const res = await page.evaluate(composeInPage, {
      spriteUrl,
      bgUrl,
      label: `Uro / ${pose} / ${BG}`,
      mode,
      format: FORMAT,
    });
    const file = path.join(OUT, `uro_${pose}_${mode.replace(/[^a-z0-9]+/gi, "")}.${FORMAT === "jpeg" ? "jpg" : "png"}`);
    await writeFile(file, Buffer.from(res.url.split(",")[1], "base64"));
    const pct = ((res.cut / res.total) * 100).toFixed(1);
    console.log(`${path.relative(ROOT, file)}  keyed ${res.cut}px (${pct}% of frame)`);
  }
}

await browser.close();
