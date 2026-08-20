// Nothing about a fighter's drawing may change by a visible step in one frame
// unless the game means it to. Three mechanisms, all reported as "flickery,
// especially near the edges":
//
//   1. THE COM HOLD EASES ACROSS THE GROUNDED FLIP. Hanging an airborne
//      drawing from its mass is right, but switching the hold on the frame
//      `grounded` flips applied the whole correction at once — a one-frame
//      vertical jump of 14 px on the roster median (probe_com_pop.mjs), at
//      exactly the place grounded flips most: the ledge. fighter.js ramps
//      `comHoldW` over COM_HOLD_EASE instead.
//   2. THE TEETER EXITS ON THE RAMP IT ENTERED ON. The lean eased in over
//      ledgeLeanIn and then vanished in one frame, because it lived on the
//      teeter POSE and the pose flips the instant the stillness gate breaks —
//      which micro-adjusting your footing does constantly. The gate has
//      hysteresis now (enter under 24 px/s, drop only over 48) and teeterT
//      decays instead of zeroing, with motion.js riding the timer rather than
//      the pose.
//   4. THE ALIGNED FADE DOES NOT BLINK THE BODY. Dissolving two drawings that
//      overlap costs opacity, and on a slow held loop that dip repeats twice a
//      second — see the check itself, which carries the arithmetic.
//   3. SPRITE STATE CHANGES CROSS-FADE. The 3D backend blends a state change
//      over 0.1 s off the `prevAnim` record; the sprite renderer ignored the
//      same record and cut. It now draws the outgoing frame under the new one
//      at falling alpha for SPRITE_XFADE — except into `hurt` and `land`,
//      where the cut is the read, exactly the 3D backend's NO_BLEND_IN.
//
// Usage: node tools/smoke_smooth.mjs [baseUrl]
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

// ------------------------------------------------- 1. the COM hold's ease
const hold = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { COM_HOLD_EASE } = await import("/src/config_tuning.js");
  const dt = 1 / 60;
  const a = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main");
  for (const f of state.fighters) { f.aiState = null; f.stocks = 99; f.invuln = 0; }
  state.fighters[1].x = -9999;

  const ground = () => Object.assign(a, {
    x: main.x + main.w / 2, y: main.y, vx: 0, vy: 0, grounded: true,
    hitstun: 0, action: null, dead: false, respawnTimer: 0, ledge: null,
    ledgeMove: null, comHoldW: a.comHoldW,
  });
  // Settle on the ground until the weight has fully drained.
  ground();
  for (let i = 0; i < 30; i++) { updateFighter(a, dt, blankInput()); ground(); }
  const onGround = a.comHoldW ?? -1;

  // Step into the air and watch the weight arrive.
  Object.assign(a, { y: main.y - 200, vy: -100, grounded: false });
  const ramp = [];
  for (let i = 0; i < 12; i++) {
    updateFighter(a, dt, blankInput());
    Object.assign(a, { y: main.y - 200, vy: -100, grounded: false });
    ramp.push(+(a.comHoldW ?? -1).toFixed(3));
  }
  // ...and drain again on landing.
  ground();
  const drain = [];
  for (let i = 0; i < 12; i++) {
    updateFighter(a, dt, blankInput());
    ground();
    drain.push(+(a.comHoldW ?? -1).toFixed(3));
  }
  return { ease: COM_HOLD_EASE, onGround, first: ramp[0], ramp, drain };
});

check(hold.onGround === 0, "standing, the COM hold carries no weight", `w=${hold.onGround}`);
check(hold.first > 0 && hold.first < 0.5,
  "leaving the ground, the hold ARRIVES over frames instead of as a step",
  `first airborne frame w=${hold.first} (a step would be 1)`);
check(hold.ramp.at(-1) === 1, "...and reaches full weight once airborne for real",
  `w=${hold.ramp.at(-1)} after ${hold.ramp.length} frames`);
check(hold.drain[0] < 1 && hold.drain[0] > 0.3 && hold.drain.at(-1) === 0,
  "landing drains it the same way, not as a step",
  `first grounded frame w=${hold.drain[0]}, settled w=${hold.drain.at(-1)}`);

// The drawn effect of the ramp: the renderer scales the held offset by the
// weight, so half the weight is half the shift.
const scaled = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { drawCharFrame } = await import("/sprites/src/sprites.js");
  const { spriteManifest } = await import("/src/assets.js");
  const a = state.fighters[0];
  const frames = spriteManifest.characters[a.charKey];
  const key = Object.keys(frames).find((k) => k.startsWith("fall"));
  const W = 400, H = 400, OY = 320;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const centroid = (opts) => {
    ctx.clearRect(0, 0, W, H);
    drawCharFrame(ctx, a.charKey, key, W / 2, OY, { facing: 1, ...opts });
    const d = ctx.getImageData(0, 0, W, H).data;
    let sum = 0, n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) { sum += (i >> 2) / W | 0, n++; }
    // integer row of each pixel: (i/4) / W
    sum = 0; n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 40) { sum += y; n++; }
    }
    return n ? sum / n : null;
  };
  const off = centroid({ holdComY: null });
  const full = centroid({ holdComY: -120, holdComMax: 60, holdComW: 1 });
  const half = centroid({ holdComY: -120, holdComMax: 60, holdComW: 0.5 });
  return { off: +off.toFixed(1), full: +full.toFixed(1), half: +half.toFixed(1) };
});
const fullShift = scaled.full - scaled.off;
const halfShift = scaled.half - scaled.off;
check(Math.abs(fullShift) > 4 && Math.abs(halfShift - fullShift / 2) < 1.5,
  "half the weight draws half the shift",
  `full ${fullShift.toFixed(1)}px, half ${halfShift.toFixed(1)}px`);

// ------------------------------------------------- 2. the teeter's exit
const teeter = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter, isTeetering } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { fighterTransform } = await import("/src/motion.js");
  const dt = 1 / 60;
  const a = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main");
  const edge = main.x + main.w;

  const atLip = () => Object.assign(a, {
    x: edge + 10, y: main.y, vx: 0, vy: 0, grounded: true, hitstun: 0,
    action: null, dead: false, respawnTimer: 0, ledge: null, ledgeMove: null,
    dashT: 0, facing: 1,
  });
  atLip();
  for (let i = 0; i < 30; i++) { updateFighter(a, dt, blankInput()); a.x = edge + 10; a.vx = 0; a.grounded = true; }
  const settled = { teetering: isTeetering(a), lean: fighterTransform(a).rotation };

  // A footing correction: velocity between the entry gate (24) and the exit
  // gate (48) must NOT drop the lean.
  a.vx = 36;
  updateFighter(a, dt, blankInput());
  a.x = edge + 10; a.grounded = true;
  const nudged = { teetering: isTeetering(a), teeterT: a.teeterT };

  // Real movement drops it — but over frames, riding the same ramp out.
  const leans = [fighterTransform(a).rotation];
  a.vx = 120;
  for (let i = 0; i < 14; i++) {
    updateFighter(a, dt, blankInput());
    a.x = edge + 10; a.grounded = true; a.vx = 120;
    leans.push(fighterTransform(a).rotation);
  }
  const steps = leans.slice(1).map((v, i) => Math.abs(v - leans[i]));
  return {
    settled, nudged,
    leanBefore: +leans[0].toFixed(4),
    // The teeter's OWN state, not the transform: at vx=120 the run sway is in
    // the rotation too, so "the lean ended" is teeterT hitting zero.
    gone: a.teeterT === 0 && a.teeterDir === 0,
    worstStep: +Math.max(...steps).toFixed(4),
    frames: leans.length - 1,
  };
});

check(teeter.settled.teetering && Math.abs(teeter.settled.lean) > 0.02,
  "standing on the lip still teeters, with a real lean",
  `lean ${teeter.settled.lean.toFixed(3)} rad`);
check(teeter.nudged.teetering,
  "a footing correction inside the hysteresis band keeps the teeter",
  `vx=36 (gate in 24, out 48), teeterT=${teeter.nudged.teeterT.toFixed(3)}`);
check(teeter.gone,
  "running off the lip does end the teeter", `teeterT drained over ${teeter.frames} frames`);
check(teeter.worstStep < Math.abs(teeter.leanBefore) * 0.6,
  "...but it fades over frames instead of vanishing in one",
  `worst one-frame step ${teeter.worstStep} rad of a ${teeter.leanBefore} rad lean`);

// ------------------------------------------------- 3. the sprite cross-fade
const fade = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { draw } = await import("/src/render.js");
  const a = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main");
  const canvas = document.createElement("canvas");
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Pixels are hopeless here — the stage furniture animates on the wall
  // clock, so two byte-identical states render differently and the ghost
  // drowns in that noise. What a ghost IS, mechanically, is one extra
  // drawImage of the fighter's sheet per frame, so count drawImage calls
  // through a whole real draw(): deterministic, and exactly the claim.
  let calls = 0;
  const orig = ctx.drawImage.bind(ctx);
  ctx.drawImage = (...args) => { calls++; return orig(...args); };
  const drawCalls = () => {
    calls = 0;
    ctx.clearRect(0, 0, 1280, 720);
    draw(ctx);
    return calls;
  };

  const setState = (animKey, animTime, prevAnim) => Object.assign(a, {
    x: main.x + main.w / 2, y: main.y - 150, vx: 0, vy: 0, grounded: false,
    hitstun: 0, action: null, dead: false, respawnTimer: 0, ledge: null,
    ledgeMove: null, animKey, animTime, prevAnim, comHoldW: 1,
  });
  for (const f of state.fighters) { f.aiState = null; f.invuln = 0; }
  state.fighters[1].x = -9999; state.fighters[1].respawnTimer = 5;

  // The same state twice: the count must be stable for any of this to mean
  // anything.
  setState("fall", 0.01, null);
  const base1 = drawCalls();
  const base2 = drawCalls();

  setState("fall", 0.01, { key: "jump", t: 0.2 });
  const fresh = drawCalls();
  setState("fall", 0.2, { key: "jump", t: 0.2 });
  const late = drawCalls();
  setState("hurt", 0.01, { key: "idle", t: 0.2 });
  const hurtGhost = drawCalls();
  setState("hurt", 0.01, null);
  const hurtBare = drawCalls();
  return { base1, base2, fresh, late, hurt: hurtGhost, hurtBare };
});

check(fade.base1 === fade.base2,
  "the draw-call count is stable for the same state", `${fade.base1} vs ${fade.base2}`);
check(fade.fresh === fade.base1 + 1,
  "a fresh state change draws the outgoing pose fading under the new one",
  `${fade.fresh} draw calls against ${fade.base1} — exactly one ghost`);
check(fade.late === fade.base1,
  "...and the ghost is gone once the fade window has passed",
  `${fade.late} draw calls`);
check(fade.hurt === fade.hurtBare,
  "a hit still CUTS — no ghost into hurt, matching the 3D backend's rule",
  `${fade.hurt} vs ${fade.hurtBare} draw calls`);

// ---------------------------------------- 4. the fade does not blink the body
//
// A fourth flicker, and the newest: `?smooth=com` ramps the incoming drawing
// up as the outgoing one ramps down, because an opaque body cannot be lined up
// with a ghost nobody can see past. Two drawings that OVERLAP cost opacity
// that way — the ghost at 1-k under the body at k covers (1-k) + k² of the
// background, bottoming out at 0.75 — and on `idle`, which steps between two
// drawings of one stance twice a second and overlaps almost exactly, the dip
// lands on the whole body every 0.45 s. A quarter of the fighter, gone and
// back, twice a second. It was reported as a flicker because it is one.
//
// The fade now goes only as deep as the alignment needs (render.js `dissolve`),
// so a step with nothing to align keeps an opaque body. This measures the
// thing that flickered: how many pixels of fighter survive the fade.
const blink = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { draw } = await import("/src/render.js");
  const { WORLD } = await import("/src/constants.js");
  const { setSmoothing } = await import("/src/flags.js");

  const cv = new OffscreenCanvas(WORLD.w, WORLD.h);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const a = state.fighters[0];

  // PUT THEM BACK ON THE FLOOR FIRST. The checks above leave this fighter
  // wherever their case needed them — hanging off a ledge, mid-fall, teetering
  // — and a body half off the canvas makes "how much of them is on screen"
  // measure the edge of the frame instead of the fade. Also parks the camera,
  // because a camera still easing toward somewhere moves the body between the
  // plate and the samples and every pixel of that lands in the diff.
  const main = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  Object.assign(a, {
    x: main.x + main.w / 2, y: main.y, vx: 0, vy: 0, grounded: true,
    hitstun: 0, action: null, dead: false, respawnTimer: 0, ledge: null,
    ledgeMove: null, shakeMag: 0, teeterT: 0, teeterDir: 0, invuln: 0,
    comHoldW: 0, spin: 0, spinAngle: 0, facingVis: a.facing,
  });
  state.camera.x = WORLD.w / 2;
  state.camera.y = WORLD.h / 2;
  state.camera.zoom = 1;
  state.camera.shake = 0;

  const shot = () => {
    state.particles = [];
    ctx.clearRect(0, 0, WORLD.w, WORLD.h);
    draw(ctx);
    return ctx.getImageData(0, 0, WORLD.w, WORLD.h).data;
  };
  a.dead = true; const plate = shot(); a.dead = false;
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
  // Straddling the idle step at 1/2.2 s, sampled at 120 Hz so the 0.07 s fade
  // is crossed eight or nine times rather than stepped over.
  const worstDip = () => {
    const px = [];
    for (let i = 0; i < 40; i++) {
      a.animKey = "idle"; a.prevAnim = null; a.animTime = 0.40 + i * (1 / 120);
      px.push(cover());
    }
    return +(100 * (1 - Math.min(...px) / px[0])).toFixed(1);
  };

  const before = setSmoothing({ com: true, holds: true, xfade: true }) && worstDip();
  setSmoothing({ com: false, holds: true });
  const holdsOnly = worstDip();
  setSmoothing({ com: false, holds: false, xfade: true });
  return { both: before, holdsOnly };
});

// The ghost's own extremities fade out at the edges of the silhouette whatever
// happens, so the floor is not zero — `holds` alone is the honest baseline and
// the aligned fade has to stay near it rather than near 25%.
check(blink.both < blink.holdsOnly + 4,
  "an idle step does not blink the body when com and holds are both on",
  `${blink.both}% of the fighter dips out at the worst frame, against `
  + `${blink.holdsOnly}% with holds alone. Undo the depth scaling in render.js `
  + "and this reads about 47% against the same baseline, which is the bug.");

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall smoothness checks passed");
process.exit(failed ? 1 : 0);
