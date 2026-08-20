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
      rows.push({ px: cover(), com: smoothingActivity.com, xfade: smoothingActivity.xfade });
    }
    const px = rows.map((r) => r.px);
    return {
      dipPct: +(100 * (1 - Math.min(...px) / px[0])).toFixed(1),
      maxXfade: +Math.max(...rows.map((r) => r.xfade)).toFixed(3),
      maxCom: +Math.max(...rows.map((r) => r.com)).toFixed(3),
    };
  };

  setSmoothing({ com: true, xfade: true });
  const on = sweep();
  setSmoothing({ com: false, xfade: true });
  const off = sweep();
  setSmoothing({ com: true, xfade: true });
  return { on, off };
});

console.log("how much of the fighter disappears mid-fade, on an idle step:\n");
for (const [k, v] of Object.entries(out)) {
  console.log(`  ${k.padEnd(11)} dip ${String(v.dipPct).padStart(5)}%`
    + `   xfade lamp ${v.maxXfade}   com lamp ${v.maxCom}`);
}
console.log("\n(dip near 0 is the fix; the lamps are what the bench paints green)");

// THE LAMPS THEMSELVES. Yellow is a class, green is a class, and the only way
// to know the second one ever arrives is to catch it — so slow the bench right
// down, run a state change, and watch the DOM for a few hundred frames.
const lamps = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const seen = { xfade: false, com: false };
  const a = state.fighters[0];
  const read = () => {
    for (const el of document.querySelectorAll(".light")) {
      if (el.classList.contains("is-working")) seen[el.dataset.mode] = true;
    }
  };
  // Cut them into a state with somewhere to go.
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
if (errs.length) console.log("\nERRORS:", errs.slice(0, 4));

await page.screenshot({ path: process.env.SHOT || "/tmp/bench-lights.png" });
await browser.close();
