#!/usr/bin/env node
// Find each rig's `yawOffsetDeg` by matching the MODEL against the SPRITE.
//
//     node server.mjs &
//     node tools/solve_yaw.mjs                 # report every fighter
//     node tools/solve_yaw.mjs --write         # ...and save the manifest
//     node tools/solve_yaw.mjs gojo hakari     # just these
//
// WHY THIS EXISTS. A generated rig arrives facing whichever way the generator
// felt like, and `yawOffsetDeg` turns it back. Setting that by hand does not
// scale past a handful of fighters and does not converge: three separate
// attempts to DERIVE it from the skeleton all failed, on different characters
// each time —
//
//   * toe-bone direction dies on non-human feet (Hanami's claws curl back);
//   * spine roll does not separate the two facing families at all — Nobara at
//     +90.3 degrees renders correctly and Gakuganji at +94.1 renders in
//     profile;
//   * hips axes are normalised by the conform pass, erasing the signal.
//
// So stop deriving and start MEASURING, against the thing the model is
// supposed to agree with. Every fighter already has a 2D idle sprite drawn
// facing right — that is the authored truth the whole roster is matched to,
// and the workbench's sprite ghost exists so a human can eyeball exactly this
// comparison. This does it numerically instead, at every yaw.
//
// THE SCORE has two halves, because either alone is fooled:
//
//   * SILHOUETTE (IoU of the alpha masks) reads orientation well — a figure
//     square to the camera is wide, one in profile is narrow — but cannot
//     tell front from back, since those are near mirror images.
//   * COLOUR (mean per-cell difference over a coarse grid of the overlap)
//     breaks that tie: a face, a costume front and a pair of hands do not
//     look like the back of a head and a jacket.
//
// Their product is maximised. Reported for every candidate so a close call is
// visible rather than silently resolved.
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "render3d", "assets", "manifest.json");
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const STEP = 10;

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const only = argv.filter((a) => !a.startsWith("--"));

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const chars = (only.length ? only : Object.keys(manifest.characters))
  .filter((c) => manifest.characters[c]?.approved);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));
await page.goto(`${BASE}/index.html?render=3d&camera=flat`, { waitUntil: "load" });
await pressStart(page);
await page.waitForFunction(async () =>
  (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 60000 });

const results = [];
for (const char of chars) {
  const r = await page.evaluate(async ({ char, STEP }) => {
    const backend = await import("/render3d/src/backend.js");
    const scene = await import("/render3d/src/scene.js");
    const rig = await import("/render3d/src/loader.js");
    const sprites = await import("/sprites/src/sprites.js");
    const assets = await import("/src/assets.js");
    if (!backend.hasModel(char)) return { skip: "no model" };
    // The menu has not loaded anybody's sprite frames yet, and a missing
    // frame draws nothing at all — which scores a flawless zero at every
    // yaw and looks exactly like "the solver does not work".
    await assets.loadFrame(char, "idle_a");
    if (!assets.frameImage(char, "idle_a")) return { skip: "no idle_a sprite" };

    const S = 220;
    const shot = (drawer) => {
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const ctx = c.getContext("2d");
      drawer(ctx);
      return ctx.getImageData(0, 0, S, S);
    };
    // Both drawn through the same entry point, same size, same origin, so
    // the only thing that can differ is the figure.
    const opts = { scale: 0.62, facing: 1 };
    const sprite = shot((ctx) =>
      sprites.drawCharFrame(ctx, char, sprites.currentFrame(char, "idle", 0), S / 2, S - 14, opts));

    // Normalise each mask to its own bounding box before comparing: a model
    // and a sprite are never the same size on screen, and an IoU that also
    // measures the size difference would just pick whichever yaw happened to
    // be widest.
    const box = (img) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (img.data[(y * S + x) * 4 + 3] > 90) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    };
    const G = 24;
    const grid = (img, b) => {
      const a = new Float32Array(G * G), rgb = new Float32Array(G * G * 3);
      if (!b) return { a, rgb };
      for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
        let n = 0, cov = 0, R = 0, Gc = 0, B = 0;
        const px0 = b.x0 + Math.floor(gx * b.w / G), px1 = b.x0 + Math.floor((gx + 1) * b.w / G);
        const py0 = b.y0 + Math.floor(gy * b.h / G), py1 = b.y0 + Math.floor((gy + 1) * b.h / G);
        for (let y = py0; y < Math.max(py1, py0 + 1); y++) for (let x = px0; x < Math.max(px1, px0 + 1); x++) {
          const i = (y * S + x) * 4;
          n++;
          if (img.data[i + 3] > 90) { cov++; R += img.data[i]; Gc += img.data[i + 1]; B += img.data[i + 2]; }
        }
        const k = gy * G + gx;
        a[k] = n ? cov / n : 0;
        if (cov) { rgb[k * 3] = R / cov; rgb[k * 3 + 1] = Gc / cov; rgb[k * 3 + 2] = B / cov; }
      }
      return { a, rgb };
    };
    const sBox = box(sprite);
    const sG = grid(sprite, sBox);

    const before = rig.getRig(char)?.yawOffsetDeg || 0;
    const scores = [];
    for (let yaw = 0; yaw < 360; yaw += STEP) {
      rig.setRigSettings(char, { yawOffsetDeg: yaw });
      scene.clearCache();
      const model = shot((ctx) =>
        backend.drawCharFrame(ctx, char, backend.currentFrame(char, "idle", 0), S / 2, S - 14, opts));
      const mG = grid(model, box(model));
      let inter = 0, uni = 0, dsum = 0, dn = 0;
      for (let k = 0; k < G * G; k++) {
        inter += Math.min(sG.a[k], mG.a[k]);
        uni += Math.max(sG.a[k], mG.a[k]);
        if (sG.a[k] > 0.3 && mG.a[k] > 0.3) {
          const dr = sG.rgb[k * 3] - mG.rgb[k * 3];
          const dg = sG.rgb[k * 3 + 1] - mG.rgb[k * 3 + 1];
          const db = sG.rgb[k * 3 + 2] - mG.rgb[k * 3 + 2];
          dsum += Math.sqrt(dr * dr + dg * dg + db * db);
          dn++;
        }
      }
      const iou = uni > 0 ? inter / uni : 0;
      const colour = dn ? 1 - Math.min(1, (dsum / dn) / 160) : 0;
      scores.push({ yaw, iou: +iou.toFixed(4), colour: +colour.toFixed(4), score: +(iou * colour).toFixed(4) });
    }
    rig.setRigSettings(char, { yawOffsetDeg: before });
    scene.clearCache();
    scores.sort((a, b) => b.score - a.score);
    return { before, best: scores[0], runnerUp: scores[1], worst: scores[scores.length - 1] };
  }, { char, STEP });

  if (r.skip) { console.log(`${char.padEnd(11)} skipped (${r.skip})`); continue; }
  const changed = r.best.yaw !== r.before;
  console.log(
    `${char.padEnd(11)} ${String(r.before).padStart(4)}° -> ${String(r.best.yaw).padStart(4)}°`
    + `  score ${r.best.score.toFixed(3)} (iou ${r.best.iou.toFixed(3)} colour ${r.best.colour.toFixed(3)})`
    + `  next ${r.runnerUp.yaw}° at ${r.runnerUp.score.toFixed(3)}`
    + (changed ? "   CHANGED" : ""));
  results.push({ char, from: r.before, to: r.best.yaw, score: r.best.score });
}

if (write) {
  for (const { char, to } of results) {
    if (to) manifest.characters[char].yawOffsetDeg = to;
    else delete manifest.characters[char].yawOffsetDeg;
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nwrote ${results.length} yaw(s) to render3d/assets/manifest.json`);
} else {
  console.log("\n(dry run — pass --write to save)");
}
await browser.close();
