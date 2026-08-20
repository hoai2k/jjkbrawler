import { chromium } from "playwright";
import { pressStart } from "./tools/smoke_boot.mjs";
const BASE = "http://127.0.0.1:5174";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0,200)));
await page.goto(`${BASE}/?camera=flat`);
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 120000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 15000 });
await page.locator(".stage-card").nth(0).click();
for (let w = 0; ; w += 150) {
  const ok = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 1;
  });
  if (ok) break;
  if (w > 120000) throw new Error("no match");
  await page.waitForTimeout(150);
}
const out = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { fighterTransform } = await import("/src/motion.js");
  const { anchorOffset, currentFrame } = await import("/src/render_backend.js");
  const dt = 1/60;
  const [a, b] = state.fighters;
  const main = (state.platforms || []).find((p) => p.kind === "main");
  const edge = main.x + main.w;
  for (const f of state.fighters) { f.aiState = null; f.stocks = 99; f.invuln = 0; }
  b.x = -9999;
  const IN = (o) => ({ ...blankInput(), ...o });

  // What the RENDERER actually puts on screen, mirroring src/render.js:
  // motion offsets, then the ledge/teeter anchor, reported at the pose's own
  // centre of mass so it is the body being tracked, not the frame's corner.
  const drawn = (f) => {
    const key = f.spriteChar || f.charKey;
    const frame = currentFrame(key, f.animKey, f.animT ?? 0) || f.frameKey;
    const m = fighterTransform(f);
    const opts = { scale: f.char.scale, facing: f.facing };
    let x = f.x + (m.offsetX || 0), y = f.y + (m.offsetY || 0);
    const com = anchorOffset(key, frame, "com", opts) || { x: 0, y: 0 };
    let ax = 0, ay = 0;
    if (f.ledge) {
      const g = anchorOffset(key, frame, "ledge", opts);
      if (g) { ax = f.ledge.edgeX - (x + g.x); ay = f.ledge.plat.y - (y + g.y); }
    }
    return { simX: x, simY: y, x: x + ax + com.x, y: y + ay + com.y, frame, anim: f.animKey };
  };
  const fallToLedge = () => Object.assign(a, {
    x: edge + 26, y: main.y - 40, vx: 0, vy: 40, grounded: false, facing: -1,
    ledge: null, ledgeMove: null, ledgeCooldown: 0, airT: 1, hitstun: 0, action: null,
    respawnTimer: 0, respawnPlat: null, teeterT: 0, teeterDir: 0, dead: false, invuln: 0,
  });
  const trace = (frames, input, label) => {
    let prev = drawn(a), worstBody = 0, worstSim = 0, atBody = null, steps = [];
    for (let i = 0; i < frames; i++) {
      updateFighter(a, dt, input);
      const d = drawn(a);
      const body = Math.hypot(d.x - prev.x, d.y - prev.y);
      const sim = Math.hypot(d.simX - prev.simX, d.simY - prev.simY);
      steps.push({ i, body: +body.toFixed(1), sim: +sim.toFixed(1), anim: d.anim });
      if (body > worstBody) { worstBody = body; atBody = { i, from: prev.anim, to: d.anim,
        dx: +(d.x - prev.x).toFixed(1), dy: +(d.y - prev.y).toFixed(1) }; }
      worstSim = Math.max(worstSim, sim);
      prev = d;
    }
    return { label, worstBody: +worstBody.toFixed(1), worstSim: +worstSim.toFixed(1), atBody,
             top: steps.sort((p, q) => q.body - p.body).slice(0, 4) };
  };
  const dbg = [];
  const snap = () => { const d = drawn(a); return { anim: a.animKey, frame: d.frame,
    ledge: !!a.ledge, move: a.ledgeMove?.kind || null, simX: +a.x.toFixed(1), simY: +a.y.toFixed(1),
    x: +d.x.toFixed(1), y: +d.y.toFixed(1) }; };
  const res = [];
  fallToLedge();
  res.push(trace(30, blankInput(), "fall -> catch -> hang"));
  dbg.push(snap());
  for (let i = 0; i < 5; i++) { updateFighter(a, dt, IN({ left: true, dirX: -1 })); dbg.push(snap()); }
  res.push(trace(30, IN({ left: true, dirX: -1 }), "climb (after 5)"));
  fallToLedge(); trace(24, blankInput());
  res.push(trace(50, IN({ shieldHeld: true }), "roll"));
  fallToLedge(); trace(24, blankInput());
  res.push(trace(32, IN({ lightP: true }), "ledge attack"));
  fallToLedge(); trace(24, blankInput());
  res.push(trace(16, IN({ jumpP: true }), "jump off"));
  return { res, dbg };
});
console.log(JSON.stringify(out.dbg, null, 1));
for (const r of out.res) {
  console.log(`\n${r.label}: worst drawn-body step ${r.worstBody}px (sim step ${r.worstSim}px)`);
  console.log("  at", JSON.stringify(r.atBody));
  console.log("  top steps", r.top.map((s) => `${s.anim}:${s.body}`).join("  "));
}
await browser.close();
