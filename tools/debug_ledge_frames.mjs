// THE LEDGE, FRAME BY FRAME — and how many bodies are on screen.
//
// Three reports from the character bench, all about the same few frames:
//
//   1. the hang pose arrives too early, gripping nothing
//   2. with the cross-fade on, the hang draws two sprites at once
//   3. a trail follows a fighter who has only started running
//
// The first two are one measurement: for every frame of a catch and the hang
// after it, where is the GRIPPING HAND relative to the corner, and what pose is
// being drawn. A hang whose hand is not on the corner is the bug, whatever the
// pose is called.
//
// The third is a different question — how many separate bodies the renderer
// puts on screen — so it is counted as blobs of fighter-coloured pixels rather
// than reasoned about.
//
// Usage: node tools/debug_ledge_frames.mjs [baseUrl] [--char gojo]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const argv = process.argv.slice(2);
const charAt = argv.indexOf("--char");
const CHAR = charAt > -1 ? argv[charAt + 1] : "gojo";
const BASE = argv.filter((a, i) => i !== charAt && i !== charAt + 1)[0]
  || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));

await page.goto(`${BASE}/?camera=flat`);
await pressStart(page);
await page.click(`[data-character="${CHAR}"]`);
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

const out = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { draw, hangGripShift } = await import("/src/render.js");
  const { WORLD } = await import("/src/constants.js");
  const { setSmoothing } = await import("/src/flags.js");
  const { currentFrame } = await import("/src/render_backend.js");
  const { anchorOffset } = await import("/src/render_backend.js");
  const { getActor } = await import("/src/characters.js");

  const f = state.fighters[0];
  const plat = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  state.fighters[1].x = -9999;
  state.fighters[1].dead = true;
  const dt = 1 / 60;
  const key = f.spriteChar || f.charKey;
  const scale = getActor(key)?.scale;

  const cv = new OffscreenCanvas(WORLD.w, WORLD.h);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  state.camera.x = WORLD.w / 2; state.camera.y = WORLD.h / 2;
  state.camera.zoom = 1; state.camera.shake = 0;

  /** How many separate bodies the renderer put on screen. Counted as runs of
   *  columns that carry fighter pixels, which is crude and exactly enough: two
   *  drawings a body-width apart are two runs, and one drawing is one. */
  const bodies = () => {
    state.particles = [];
    ctx.clearRect(0, 0, WORLD.w, WORLD.h);
    const wasDead = f.dead;
    f.dead = true;
    draw(ctx);
    const plate = ctx.getImageData(0, 0, WORLD.w, WORLD.h).data;
    f.dead = wasDead;
    ctx.clearRect(0, 0, WORLD.w, WORLD.h);
    draw(ctx);
    const live = ctx.getImageData(0, 0, WORLD.w, WORLD.h).data;
    const cols = new Int32Array(WORLD.w);
    for (let y = 0; y < WORLD.h; y++) {
      let i = y * WORLD.w * 4;
      for (let x = 0; x < WORLD.w; x++, i += 4) {
        const d = Math.abs(live[i] - plate[i]) + Math.abs(live[i + 1] - plate[i + 1])
          + Math.abs(live[i + 2] - plate[i + 2]);
        if (d > 40) cols[x]++;
      }
    }
    let runs = 0, gap = 0, on = false, wide = 0;
    for (let x = 0; x < WORLD.w; x++) {
      if (cols[x] >= 3) { if (!on) { runs++; on = true; } gap = 0; wide++; }
      else if (on && ++gap > 12) on = false;      // a real separation, not a limb
    }
    return { runs, width: wide };
  };

  /** How far the drawing's gripping hand is from the corner, in px. This is
   *  the question the report is about: a hang whose hand is not on the corner
   *  is wrong however the pose is named. */
  const handOffCorner = () => {
    if (!f.hangGrip) return null;
    const frame = currentFrame(key, f.animKey, f.animTime);
    const a = frame && anchorOffset(key, frame, "ledge", { scale, facing: f.facingVis ?? f.facing });
    if (!a) return null;
    const g = hangGripShift(f, scale);
    return Math.round(Math.hypot(
      f.x + a.x + g.x - f.hangGrip.x,
      f.y + a.y + g.y - f.hangGrip.y,
    ));
  };

  const runCatch = (xfade) => {
    setSmoothing({ com: true, xfade });
    Object.assign(f, {
      x: plat.x - 24, y: plat.y + 40, vx: 0, vy: 60, grounded: false, airT: 0.5,
      ledge: null, ledgeMove: null, ledgeCooldown: 0, hitstun: 0, action: null,
      dead: false, respawnTimer: 0, hangGrip: null, hangGripW: 0, facing: 1,
      facingVis: 1, animKey: "fall", animTime: 0.2, prevAnim: null,
    });
    const rows = [];
    for (let i = 0; i < 90; i++) {
      updateFighter(f, dt, blankInput());
      const b = bodies();
      rows.push({
        pose: f.animKey,
        gripW: +(f.hangGripW || 0).toFixed(2),
        hand: handOffCorner(),
        bodies: b.runs,
        phase: f.ledgeMove ? f.ledgeMove.kind : (f.ledge ? "hang" : "air"),
      });
      // Stop a little after the hang has settled.
      if (rows.filter((r) => r.pose === "ledge").length > 8) break;
    }
    return rows;
  };

  const withFade = runCatch(true);
  const noFade = runCatch(false);
  setSmoothing({ com: true, xfade: true });

  // ---- the run trail
  const runTrail = () => {
    Object.assign(f, {
      x: plat.x + plat.w / 2 - 200, y: plat.y, vx: 0, vy: 0, grounded: true,
      ledge: null, ledgeMove: null, hitstun: 0, action: null, dead: false,
      hangGrip: null, hangGripW: 0, animKey: "idle", animTime: 0, prevAnim: null,
      dashT: 0, trail: [],
    });
    const held = { ...blankInput(), right: true, dirX: 1, moveX: 1 };
    const rows = [];
    for (let i = 0; i < 90; i++) {
      updateFighter(f, dt, held);
      rows.push({
        t: +(i * dt).toFixed(2), pose: f.animKey,
        dashT: +(f.dashT || 0).toFixed(2), trail: f.trail.length,
      });
    }
    return rows;
  };
  const trail = runTrail();

  // ---- AND THE CASE THE REPORT WAS ACTUALLY IN. Naoya's Projection Sorcery
  // earns afterimages off a sustained sprint (`char.frameTrail`, machRamp) and
  // `trailStrength` never asks whether he is still running — so a fighter who
  // sprinted off the edge goes on spawning trail samples while he HANGS. The
  // samples are drawn at the fighter's raw position, without the hang grip, so
  // a hang-frame sample lands a grip-length away from the gripped body: two
  // hangs on screen, one holding the corner and one holding nothing.
  const hangTrail = () => {
    Object.assign(f, {
      x: plat.x - 24, y: plat.y + 40, vx: 0, vy: 60, grounded: false, airT: 0.5,
      ledge: null, ledgeMove: null, ledgeCooldown: 0, hitstun: 0, action: null,
      dead: false, respawnTimer: 0, hangGrip: null, hangGripW: 0, facing: 1,
      facingVis: 1, animKey: "fall", animTime: 0.2, prevAnim: null, trail: [],
    });
    // Wound up, as it would be off a sprint to the edge.
    f.machRamp = 2;
    const rows = [];
    for (let i = 0; i < 60; i++) {
      updateFighter(f, dt, blankInput());
      if (f.ledge && !f.ledgeMove) {
        const b = bodies();
        rows.push({ pose: f.animKey, trail: f.trail.length, bodies: b.runs,
                    mach: +(f.machRamp || 0).toFixed(2) });
        if (rows.length > 14) break;
      }
    }
    return rows;
  };
  const wound = hangTrail();

  return { withFade, noFade, trail, wound };
});

const fmt = (rows) => rows.map((r, i) =>
  `  ${String(i).padStart(2)}  ${r.phase.padEnd(6)}${r.pose.padEnd(8)}`
  + `gripW ${String(r.gripW).padStart(4)}  hand ${String(r.hand ?? "—").padStart(4)}px  `
  + `${r.bodies} ${r.bodies === 1 ? "body" : "bodies"}`).join("\n");

console.log(`the catch and the hang, ${CHAR} — cross-fade ON\n`);
console.log(fmt(out.withFade));
console.log(`\nthe same with cross-fade OFF\n`);
console.log(fmt(out.noFade));

// Only the frames actually DRAWN as the hang. On a `fall` frame the "hand" is
// a fallback guess — the fall pose carries no ledge anchor — so including
// those measures the guess rather than the grip.
const drawnHang = out.withFade.filter((r) => r.pose === "ledge");
const worstFade = Math.max(0, ...drawnHang.map((r) => r.hand ?? 0));
const worstBodies = Math.max(...out.withFade.map((r) => r.bodies));
console.log(`\nframes drawn as the hang: ${drawnHang.length}, `
  + `worst hand-off-corner ${worstFade}px, most bodies on screen ${worstBodies}`);

console.log("\nstarting a run — where does the trail come from?\n");
for (const r of out.trail.filter((_, i) => i % 6 === 0)) {
  console.log(`  t=${String(r.t).padStart(4)}  ${r.pose.padEnd(6)} dashT ${String(r.dashT).padStart(4)}  trail samples ${r.trail}`);
}

console.log("\nhanging with Projection Sorcery wound up — bodies on screen\n");
for (const r of out.wound) {
  console.log(`  ${r.pose.padEnd(6)} machRamp ${String(r.mach).padStart(4)}  `
    + `trail samples ${String(r.trail).padStart(2)}  ${r.bodies} on screen`);
}

await browser.close();
