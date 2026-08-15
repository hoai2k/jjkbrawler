// An airborne fighter hangs from their centre of mass, not from their feet —
// whichever backend draws them.
//
// A drawing is placed by its foot line, which is right on the ground and wrong
// in the air: the foot line means something different in every airborne pose —
// a tuck carries it to the hips, a sprawl puts it out sideways — so anchoring
// there turns the pose's own movement of the feet into the whole fighter
// jumping about. Nothing holds still, because the point being held still is not
// on the body in any consistent way.
//
// The height held is the one the SIM already believes the mass is at
// (`f.y - H * comFrac`, which is what combat.js centres an airborne hurtbox
// on), so this also stops the picture and the hurtbox being able to disagree.
//
// GROUNDED IS UNCHANGED, deliberately: feet on a deck have something to stand
// on, and a foot anchor is what keeps them on it.
//
// Usage: node tools/smoke_sprite_com.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
const check = (ok, msg, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));
await page.goto(`${BASE}/?camera=flat`);
await pressStart(page);
await page.click('[data-character="gojo"]');
await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 20000 });
await page.locator(".stage-card").nth(0).click();
for (let w = 0; ; w += 200) {
  const ok = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 1;
  });
  if (ok) break;
  if (w > 120000) throw new Error("match never started");
  await page.waitForTimeout(200);
}

const r = await page.evaluate(async () => {
  const { anchorPoint } = await import("/sprites/src/sprites.js");
  const { frameMeta } = await import("/src/assets.js");
  const { bodyMetrics } = await import("/src/silhouette.js");
  const { comFrac } = await import("/src/body_points.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");
  const { spriteManifest } = await import("/src/assets.js");

  const CELL_W = 384;
  // Where each frame's COM sits above its own foot line, in DRAWN px at the
  // scale the game uses — the quantity a foot anchor lets wander and a COM
  // anchor pins.
  const comAboveFeet = (charKey, frameKey) => {
    const meta = frameMeta(charKey, frameKey);
    if (!meta) return null;
    const a = anchorPoint(charKey, frameKey, "com", meta);
    if (!a) return null;
    const footY = meta.bodyBottom ?? CELL_W * 0.94;
    return (footY - a.y) * (0.6 * (meta.renderScale || 1));
  };

  // The airborne states a fighter really passes through, and the ones whose
  // foot line moves most within the drawing.
  const AIR = ["jump", "fall", "airLight", "dodge_air", "hurt", "prone"];
  const rows = [];
  for (const charKey of CHARACTER_KEYS) {
    const frames = spriteManifest?.characters?.[charKey];
    if (!frames) continue;
    const H = bodyMetrics(charKey).height;
    const want = H * comFrac(charKey);
    const seen = [];
    for (const state of AIR) {
      // The frame the state actually draws, whatever it resolves to.
      for (const key of Object.keys(frames)) {
        if (!key.startsWith(state)) continue;
        const v = comAboveFeet(charKey, key);
        if (v !== null) seen.push(v);
        break;
      }
    }
    if (seen.length < 3) continue;
    rows.push({
      charKey,
      want: +want.toFixed(1),
      // FOOT-ANCHORED, the drawn COM lands wherever this frame happens to put
      // it: the spread across a fighter's airborne poses is how far the mass
      // moves between them for no reason the player can see.
      footSpread: +(Math.max(...seen) - Math.min(...seen)).toFixed(1),
      // COM-ANCHORED it is `want` every time, by construction — so what is
      // worth reporting is how far the anchor has to move to get there.
      worstShift: +Math.max(...seen.map((v) => Math.abs(v - want))).toFixed(1),
    });
  }
  return rows;
});

const worstFoot = r.reduce((a, b) => (b.footSpread > a.footSpread ? b : a));
const median = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
check(r.length > 10, "measured the airborne poses across the roster", `${r.length} fighters`);
check(worstFoot.footSpread > 8,
  "foot-anchoring really does let the drawn mass wander between airborne poses",
  `worst ${worstFoot.charKey}: ${worstFoot.footSpread}px of drift, roster median `
  + `${median(r.map((x) => x.footSpread))}px`);

// AND THE SHIPPED RENDERER, measured on the pixels it actually draws. Each
// airborne pose is drawn onto a scratch canvas and the ink's vertical centroid
// read back: held, the mass should sit at the same height in every one of them;
// unheld, it wanders by however much the foot line does.
const live = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { drawCharFrame } = await import("/sprites/src/sprites.js");
  const { bodyMetrics } = await import("/src/silhouette.js");
  const { comFrac } = await import("/src/body_points.js");
  const { spriteManifest } = await import("/src/assets.js");
  const a = state.fighters[0];
  const H = bodyMetrics(a.charKey).height;
  const want = -H * comFrac(a.charKey);

  const W = 500, HH = 500, ORIGIN_Y = 380;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = HH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  /** The vertical centroid of the drawn ink, in px above the placement point. */
  const inkCentroid = (frameKey, holdComY) => {
    ctx.clearRect(0, 0, W, HH);
    const drew = drawCharFrame(ctx, a.charKey, frameKey, W / 2, ORIGIN_Y, {
      facing: 1, holdComY,
    });
    if (!drew) return null;
    const d = ctx.getImageData(0, 0, W, HH).data;
    let sum = 0, n = 0;
    for (let y = 0; y < HH; y++) {
      for (let x = 0; x < W; x++) {
        const alpha = d[(y * W + x) * 4 + 3];
        if (alpha > 40) { sum += y; n++; }
      }
    }
    return n ? +(sum / n - ORIGIN_Y).toFixed(1) : null;
  };

  const frames = spriteManifest.characters[a.charKey];
  const picked = ["jump", "fall", "hurt", "dodge_air"]
    .map((s) => Object.keys(frames).find((k) => k.startsWith(s)))
    .filter(Boolean);
  const held = picked.map((k) => inkCentroid(k, want)).filter((v) => v !== null);
  const free = picked.map((k) => inkCentroid(k, null)).filter((v) => v !== null);
  const span = (v) => (v.length ? +(Math.max(...v) - Math.min(...v)).toFixed(1) : 0);
  return { charKey: a.charKey, frames: picked, held, free,
           heldSpan: span(held), freeSpan: span(free) };
});

check(live.held.length >= 3, "drew the airborne poses to measure them",
  `${live.charKey}: ${live.frames.join(", ")}`);
check(live.heldSpan < live.freeSpan,
  "held, the drawn mass moves less between airborne poses than foot-anchored",
  `${live.heldSpan}px against ${live.freeSpan}px`);
// NOT "it stops moving entirely", because the ink centroid is not the mass: a
// pose with a leg out shifts the ink without shifting the body's balance, and
// the baked per-frame anchors are a measurement rather than a judgement. What
// is claimed is that the mass is what holds — the residual is limb, and where
// it is more than that the frame's COM wants a look in the verification bench
// (tools/audit_sprite_com.mjs lists them).
check(live.heldSpan <= live.freeSpan * 0.75,
  "...by a clear margin, not a rounding",
  `centroids ${live.held.join(", ")} (foot-anchored: ${live.free.join(", ")})`);

// ---------------------------------------------------------------- flat blit
//
// `?render=3d&camera=flat` renders the rig to a texture and blits it by its
// foot row, so it had the same fault and takes the same option. It also had one
// of its own: the pivot was a flat 0.55 of the target height for every fighter
// in every pose, multiplied against `targetPx` rather than the rows the body
// really occupies — so it ignored `renderScale` too.
// Its own page: this file's first one runs the SPRITE backend, where no 3D
// engine has been loaded and there is no rig to ask.
await page.close();
const flat = await browser.newPage();
flat.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));
await flat.goto(`${BASE}/?render=3d&camera=flat`);
await pressStart(flat);
await flat.click('[data-character="nobara"]');
await flat.waitForTimeout(400);
await flat.click("#startButton");
await flat.waitForSelector(".stage-card", { timeout: 30000 });
await flat.locator(".stage-card").nth(0).click();
for (let w = 0; ; w += 250) {
  const ok = await flat.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 1;
  });
  if (ok) break;
  if (w > 180000) throw new Error("match never started");
  await flat.waitForTimeout(250);
}
await flat.waitForTimeout(6000);

const blit = await flat.evaluate(async () => {
  const scene = await import("/render3d/src/scene.js");
  const rigs = await import("/render3d/src/loader.js");
  const rig = rigs.getRig("nobara");
  if (!rig) return null;
  // Render a few airborne poses and read back where each one left its mass.
  const seen = [];
  for (const [animKey, t] of [["jump", 0.1], ["fall", 0.1], ["hurt", 0.1], ["dodge_air", 0.1]]) {
    const resolved = rigs.resolveClip("nobara", animKey);
    if (!resolved) continue;
    const entry = scene.renderPose("nobara", animKey, t, rig, resolved, {});
    if (entry?.comM != null) seen.push(+entry.comM.toFixed(4));
  }
  return { comMs: seen, heightM: +rig.height.toFixed(3) };
});

check(blit && blit.comMs.length >= 3,
  "the flat blit's render carries the mass it actually posed",
  blit ? `nobara comM ${blit.comMs.join(", ")} m of a ${blit.heightM} m body` : "no rig here");
if (blit && blit.comMs.length >= 3) {
  const span = Math.max(...blit.comMs) - Math.min(...blit.comMs);
  check(span > 0.001,
    "...which really does move between airborne poses, so holding it is not a no-op",
    `${(span * 100).toFixed(1)} cm between the highest and lowest`);
  const flat = 0.55 * blit.heightM;
  check(blit.comMs.some((v) => Math.abs(v - flat) > 0.02),
    "...and it is not the flat 0.55 of height the blit used to assume",
    `measured ${blit.comMs.join(", ")} against a constant ${flat.toFixed(3)}`);
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall sprite COM checks passed");
process.exit(failed ? 1 : 0);
