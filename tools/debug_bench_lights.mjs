// Does the idle still flicker, and do the bench lamps describe the frame?
//
// The flicker was a COVERAGE dip, not a colour shift: painting the outgoing
// drawing at 1-k and the incoming one at k over it covers (1-k) + k² of the
// background, which bottoms out at 0.75 halfway through a fade. On a state
// change that reads as a smear; on `idle`, which steps between two drawings of
// one stance twice a second, it lands on the whole body every 0.45s.
//
// So the thing to measure is how many pixels of fighter survive the fade. Flat
// is fixed. A dip is the bug.
//
// Usage: node tools/debug_bench_lights.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

await page.goto(`${BASE}/workbench/?edit=character&char=gojo&smooth=all`, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);

const out = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { draw, smoothingActivity } = await import("/src/render.js");
  const { WORLD } = await import("/src/constants.js");
  const { setSmoothing } = await import("/src/flags.js");

  const cv = new OffscreenCanvas(WORLD.w, WORLD.h);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const a = state.fighters[0];
  if (!a) throw new Error("no fighter on the bench");
  Object.assign(a, { vx: 0, vy: 0, grounded: true, hitstun: 0, action: null, shakeMag: 0 });

  const shot = () => {
    state.particles = [];
    ctx.clearRect(0, 0, WORLD.w, WORLD.h);
    draw(ctx);
    return ctx.getImageData(0, 0, WORLD.w, WORLD.h).data;
  };
  a.dead = true; const plate = shot(); a.dead = false;

  /** Pixels of fighter on screen — the quantity the flicker moved. */
  const cover = () => {
    const px = shot();
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const d = Math.abs(px[i] - plate[i]) + Math.abs(px[i + 1] - plate[i + 1])
        + Math.abs(px[i + 2] - plate[i + 2]);
      if (d > 24) n++;
    }
    return n;
  };

  // Straddles the idle step at 1/2.2s, at 120 Hz so the 0.07s fade is sampled
  // eight or nine times rather than skipped over.
  const sweep = () => {
    const rows = [];
    for (let i = 0; i < 40; i++) {
      a.animKey = "idle"; a.prevAnim = null; a.animTime = 0.40 + i * (1 / 120);
      rows.push({ px: cover(), com: smoothingActivity.com, holds: smoothingActivity.holds });
    }
    const px = rows.map((r) => r.px);
    return {
      dipPct: +(100 * (1 - Math.min(...px) / px[0])).toFixed(1),
      maxHolds: +Math.max(...rows.map((r) => r.holds)).toFixed(3),
      maxCom: +Math.max(...rows.map((r) => r.com)).toFixed(3),
    };
  };

  setSmoothing({ com: true, holds: true, xfade: true });
  const both = sweep();
  setSmoothing({ com: false, holds: true });
  const holdsOnly = sweep();
  setSmoothing({ com: true, holds: false });
  const comOnly = sweep();
  setSmoothing({ com: true, holds: true });
  return { both, holdsOnly, comOnly };
});

console.log("how much of the fighter disappears mid-fade, on an idle step:\n");
for (const [k, v] of Object.entries(out)) {
  console.log(`  ${k.padEnd(11)} dip ${String(v.dipPct).padStart(5)}%`
    + `   holds lamp ${v.maxHolds}   com lamp ${v.maxCom}`);
}
console.log("\n(dip near 0 is the fix; the lamps are what the bench paints green)");

// THE LAMPS THEMSELVES. Yellow is a class, green is a class, and the only way
// to know the second one ever arrives is to catch it — so slow the bench right
// down, start a turn, and watch the DOM for a few hundred frames.
const lamps = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const seen = { xfade: false, com: false, holds: false, turn: false };
  const a = state.fighters[0];
  const read = () => {
    for (const el of document.querySelectorAll(".light")) {
      if (el.classList.contains("is-working")) seen[el.dataset.mode] = true;
    }
  };
  // Turn the fighter round, and cut them into a state with somewhere to go.
  a.facing = -a.facing;
  for (let i = 0; i < 240; i++) {
    if (i === 40) { a.animKey = "specialNeutral"; a.animTime = 0; a.prevAnim = { key: "idle", t: 0.3 }; }
    await new Promise((r) => requestAnimationFrame(r));
    read();
  }
  return { seen, armed: [...document.querySelectorAll(".light.is-on")].map((e) => e.dataset.mode),
           speed: document.getElementById("speedRange")?.value ?? null };
});
console.log("\nlamps that reached GREEN over 240 frames:", lamps.seen);
console.log("lamps showing YELLOW (armed):", lamps.armed, "· speed control:", lamps.speed);

// AND THE SLIDER. Slow motion has to slow the SIMULATION — the same steps,
// fewer of them per real second — not the frame rate and not the step size.
// So the test is simulated time against wall-clock time at two settings.
const slow = await page.evaluate(async () => {
  const run = async (v) => {
    window.__bench.setSpeed(v);
    await new Promise((r) => setTimeout(r, 250));   // let it settle
    const s0 = window.__bench.state().steps, w0 = performance.now();
    await new Promise((r) => setTimeout(r, 1200));
    return (window.__bench.state().steps - s0) / ((performance.now() - w0) / 1000);
  };
  const full = await run(1);
  const tenth = await run(0.1);
  window.__bench.setSpeed(1);
  return { full: +full.toFixed(1), tenth: +tenth.toFixed(1) };
});
console.log(`\nsimulation steps per real second — 1x: ${slow.full}   0.1x: ${slow.tenth}`);
// THE FACING SWEEP, measured as the thing it actually does to a drawing.
//
// `facingVis` slides from +1 to -1 over TURN_TIME and the sprite backend hands
// it to `ctx.scale(facing, 1)`. So the drawing is squashed horizontally toward
// zero and pulled out the other side — which is a card turning over, not a
// body turning round, and there is a frame near the middle where the fighter
// is a vertical line. This measures how narrow they get and for how long.
const turn = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { draw } = await import("/src/render.js");
  const { WORLD } = await import("/src/constants.js");
  const { setSmoothing } = await import("/src/flags.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");

  const cv = new OffscreenCanvas(WORLD.w, WORLD.h);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const a = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  const settle = () => Object.assign(a, {
    x: main.x + main.w / 2, y: main.y, vx: 0, vy: 0, grounded: true,
    hitstun: 0, action: null, dead: false, respawnTimer: 0, ledge: null,
    ledgeMove: null, shakeMag: 0, teeterT: 0, teeterDir: 0, animKey: "idle",
    animTime: 0.1, prevAnim: null,
  });
  settle();
  state.camera.x = WORLD.w / 2; state.camera.y = WORLD.h / 2;
  state.camera.zoom = 1; state.camera.shake = 0;

  const shot = () => { state.particles = []; ctx.clearRect(0,0,WORLD.w,WORLD.h); draw(ctx); return ctx.getImageData(0,0,WORLD.w,WORLD.h).data; };

  // A FRESH PLATE PER SAMPLE. The backdrop breathes — fog drifts, the vignette
  // pulses — so a plate taken once at the top and diffed against a shot taken
  // a second later differs across the whole frame, and the measurement becomes
  // the weather rather than the fighter. Taking the two a millisecond apart
  // leaves only the body between them.
  const pair = () => {
    a.dead = true; const plate = shot();
    a.dead = false; const live = shot();
    return { plate, live };
  };
  // ABOVE THE SHADOW. The cast shadow is an ellipse on the deck and it is not
  // mirrored by anything, so it sits at full width whatever the sprite is
  // doing — measuring the whole figure just measures the shadow, which is how
  // the first version of this reported a body that never changed width. The
  // band is the torso: clear of the shadow at the bottom and of nothing at the
  // top. The camera is parked and unzoomed above, so world y is canvas y.
  const { bodyMetrics } = await import("/src/silhouette.js");
  const h = bodyMetrics(a.spriteChar || a.charKey).height;
  const BAND = { top: Math.round(a.y - h * 0.9), bottom: Math.round(a.y - h * 0.25) };

  /** How wide the drawn body is across the torso, in world px. A column counts
   *  only if several of its pixels changed, so a stray one does not stretch
   *  the answer to the width of the canvas. */
  const width = () => {
    const { plate, live } = pair();
    const cols = new Int32Array(WORLD.w);
    for (let y = Math.max(0, BAND.top); y < Math.min(WORLD.h, BAND.bottom); y++) {
      let i = y * WORLD.w * 4;
      for (let x = 0; x < WORLD.w; x++, i += 4) {
        const d = Math.abs(live[i] - plate[i]) + Math.abs(live[i + 1] - plate[i + 1])
          + Math.abs(live[i + 2] - plate[i + 2]);
        if (d > 40) cols[x]++;
      }
    }
    let lo = -1, hi = -1;
    for (let x = 0; x < WORLD.w; x++) {
      if (cols[x] < 3) continue;
      if (lo < 0) lo = x;
      hi = x;
    }
    return hi < lo ? 0 : hi - lo + 1;
  };

  const run = (sweep) => {
    setSmoothing({ turn: sweep });
    settle();
    a.facing = 1; a.facingVis = 1;
    const rest = width();
    const widths = [], vis = [];
    for (let i = 0; i < 12; i++) {
      // Re-asserted every step: a fighter with nobody to fight turns back
      // toward the dummy, which undoes the flip after one frame and was why
      // the first version of this measured a body that never moved.
      a.facing = -1;
      updateFighter(a, 1 / 60, blankInput());
      settle();                          // keep them still; only the mirror moves
      widths.push(width());
      vis.push(+a.facingVis.toFixed(2));
    }
    return { rest, widths, vis, narrowest: Math.min(...widths),
             frames: widths.filter((w) => w < rest * 0.35).length };
  };

  const on = run(true);
  const off = run(false);
  setSmoothing({ turn: true });
  return { on, off };
});
console.log("\nfacing flip — how wide the drawn body is, world px");
for (const [k, v] of Object.entries(turn)) {
  console.log(`  sweep ${k.padEnd(4)} rest ${String(v.rest).padStart(3)}px`
    + `  narrowest ${String(v.narrowest).padStart(3)}px`
    + `  frames under 35% width: ${v.frames}`);
  console.log(`             widths    ${v.widths.join(" ")}`);
  console.log(`             facingVis ${v.vis.join(" ")}`);
}

if (errs.length) console.log("\nERRORS:", errs.slice(0, 4));

await page.screenshot({ path: process.env.SHOT || "/tmp/bench-lights.png" });
await browser.close();
