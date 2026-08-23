// TURNING AROUND AT A RUN, AND THE QUARTER SECOND NOBODY WAS DRAWING.
//
//     node server.mjs   then:  node tools/smoke_skid.mjs [baseUrl]
//
// Reversing at speed does not reverse a fighter. `turnLock` (fighter.js)
// refuses them any acceleration for as long as their velocity opposes the
// stick, so all that happens is friction — and from Gojo's 468 px/s top speed
// that takes FIFTEEN FRAMES. A quarter of a second in which the body travels
// right while the drawing faces left.
//
// It was drawn as running, because `pickAnim` only knows |vx|: the run cycle
// for the first eleven frames, and then — once the slide fell under the run
// threshold — the standing idle for the last four. A run cycle playing over a
// body sliding backwards is "running on the spot", which is exactly what it was
// reported as, and a standing idle gliding along the floor is worse.
//
// The physics are untouched; the fix is a reading. `f.skidding` is the frames
// where the stick says one way and the body still goes the other, and it drives
// a pose of its own (the run cycle's legs-together PASS frame, held), a lean
// into the direction being asked for, and dust off the sliding foot.
//
// This drives the REAL pad snapshot into the REAL updateFighter and reads the
// frames back, so a threshold, an ordering or an animation branch that loses
// any of it fails here in the terms a player would report it in.
//
// Run by `npm run check`.
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(400);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 20000 });
await page.locator(".stage-card").nth(0).click();
for (let waited = 0; ; waited += 150) {
  const ready = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 0;
  });
  if (ready) break;
  if (waited > 90000) throw new Error("match never started");
  await page.waitForTimeout(150);
}

const out = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput, padSnapshot } = await import("/src/input.js");
  const { fighterTransform } = await import("/src/motion.js");

  state.phase = "paused";
  const f = state.fighters[0];
  state.fighters[1].x = -9999;
  const main = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  const dt = 1 / 60;
  const cx = main.x + main.w / 2;

  const padAt = (x, y) => ({
    index: 0, axes: [x, y, 0, 0],
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
  });
  const padInput = (x, y) => {
    const m = { ...blankInput(), ...padSnapshot(padAt(x, y)) };
    m.dirX = (m.right ? 1 : 0) - (m.left ? 1 : 0);
    if (!m.moveX) m.moveX = m.dirX;
    if (!m.moveY) m.moveY = (m.down ? 1 : 0) - (m.up ? 1 : 0);
    return m;
  };
  // Held on the spot: this is about the frames, not about crossing a stage, and
  // the wide boards would run him off the end long before the turn.
  const step = (dir) => {
    updateFighter(f, dt, padInput(dir, 0));
    f.x = cx; f.y = main.y; f.grounded = true; f.vy = 0;
  };
  const reset = () => {
    Object.assign(f, {
      x: cx, y: main.y, vx: 0, vy: 0, grounded: true, hitstun: 0, action: null,
      charging: false, crouching: false, crouchGrace: 0, dashT: 0, walking: false,
      facing: 1, facingVis: 1, dead: false, respawnTimer: 0, hitPause: 0,
      shielding: false, ledge: null, ledgeMove: null, prone: 0,
      turnLock: 0, skidding: false, skidFxT: 0,
    });
    state.particles.length = 0;
  };
  const sample = () => ({
    vx: Math.round(f.vx), anim: f.animKey, facing: f.facing,
    skidding: !!f.skidding, particles: state.particles.length,
    rot: +fighterTransform(f).rotation.toFixed(4),
  });

  // ---- the turnaround: full speed one way, then the stick the other.
  reset();
  for (let i = 0; i < 120; i++) step(1);
  const top = Math.round(f.char.stats.speed);
  const runVx = Math.round(f.vx);
  const runAnim = f.animKey;
  state.particles.length = 0;
  const turn = [];
  for (let i = 0; i < 30; i++) { step(-1); turn.push({ frame: i + 1, ...sample() }); }

  // ---- and a run started from a standstill, which is not a skid.
  reset();
  const fromRest = [];
  for (let i = 0; i < 8; i++) { step(1); fromRest.push({ frame: i + 1, ...sample() }); }

  return { top, runVx, runAnim, turn, fromRest };
});

const { top, runVx, runAnim, turn, fromRest } = out;
console.log(`Gojo tops out at ${top} px/s and is running right at ${runVx} (${runAnim}) `
  + `when the stick flips to LEFT\n`);
console.log("frame     vx   anim    facing  skid    lean   particles");
for (const r of turn.slice(0, 20)) {
  console.log(`${String(r.frame).padStart(5)} ${String(r.vx).padStart(6)}   ${r.anim.padEnd(7)} `
    + `${String(r.facing).padStart(6)}  ${String(r.skidding).padEnd(6)} ${String(r.rot).padStart(7)}   ${r.particles}`);
}
console.log("");

// The slide is every frame the fighter is still travelling the way they are no
// longer facing. That is the thing being drawn, so that is the span under test.
const sliding = turn.filter((r) => r.vx > 0);
const after = turn.filter((r) => r.vx < 0);

check(sliding.length >= 8,
  "reversing at a run leaves the fighter sliding the old way for a real stretch",
  `${sliding.length} frame(s), ${(sliding.length / 60).toFixed(2)}s`);

// ---------------------------------------------------------------- the pose
check(sliding.every((r) => r.anim === "skid"),
  "...and every one of those frames draws the SKID, not a run cycle or an idle",
  [...new Set(sliding.map((r) => r.anim))].join(" "));

check(!sliding.some((r) => r.anim === "run"),
  "...so a fighter travelling backwards is never drawn running",
  sliding.filter((r) => r.anim === "run").map((r) => `f${r.frame}`).join(" "));

// The other half of the same rule: it has to END. A pose that outlasts the
// brake is the same fault the other way round — a fighter at full speed drawn
// braking.
check(after.length > 0 && after.every((r) => !r.skidding),
  "...and the READING ends the moment the fighter is moving the way they asked to",
  after.length ? `first ${after[0].vx} px/s at f${after[0].frame}` : "never reversed");

// The pose outlasts the reading by the beat it takes to get up to speed, and
// deliberately: a turn passes through zero, so between the last sliding frame
// and the first frame quick enough to be a run there is a moment at walking
// pace. Letting the pose go there dropped one frame of standing idle into the
// middle of the turnaround.
const crossing = after.filter((r) => Math.abs(r.vx) <= 50);
check(crossing.every((r) => r.anim === "skid"),
  "...while the POSE holds through the crossover, so no idle frame lands mid-turn",
  crossing.map((r) => `f${r.frame}=${r.anim}`).join(" ") || "no crossover frame");

const running = after.filter((r) => Math.abs(r.vx) > 50);
check(running.length > 0 && running.every((r) => r.anim === "run"),
  "...which is when the run cycle picks up",
  running.length ? `f${running[0].frame} onward` : "never reached run speed");

// ---------------------------------------------------------------- the lean
//
// Toward the direction being ASKED for — a body throwing its weight the new way
// to brake. `rotation` is world-space (motion.js scales by facing), so leaning
// into a leftward turn is a negative one.
const leaning = sliding.filter((r) => Math.abs(r.vx) > top * 0.15);
check(leaning.every((r) => Math.sign(r.rot) === r.facing),
  "the body leans INTO the direction being asked for, not against it",
  leaning.map((r) => `f${r.frame}=${r.rot}`).slice(0, 4).join(" "));

check(Math.abs(sliding[0].rot) > Math.abs(sliding[sliding.length - 1].rot),
  "...and eases upright as the momentum runs out",
  `${sliding[0].rot} at ${sliding[0].vx} px/s -> ${sliding[sliding.length - 1].rot} `
  + `at ${sliding[sliding.length - 1].vx} px/s`);

// --------------------------------------------------------------- the dust
//
// The pose says the fighter is braking; only the grit says the FLOOR is what
// they are braking against.
const dust = turn[Math.min(9, turn.length - 1)].particles;
check(dust > 0, "the sliding foot throws grit off the floor",
  `${dust} particle(s) by frame 10`);

// ...and stops throwing it once there is nothing left to slide. A scuff that
// outlives the skid is a fighter standing still in a dust cloud.
const settled = turn[turn.length - 1];
check(!settled.skidding, "...and the skid does not outlive the turn it describes",
  `f${settled.frame}: ${settled.vx} px/s, ${settled.anim}`);

// ------------------------------------------------------- and not otherwise
//
// A fighter accelerating from a standstill is not braking, however slowly they
// are moving. Reading it off speed alone would have caught them.
check(fromRest.every((r) => !r.skidding),
  "starting a run from a standstill never skids",
  fromRest.filter((r) => r.skidding).map((r) => `f${r.frame}`).join(" ") || "none");

check(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | "));

console.log(failures
  ? `\n${failures} check(s) failed`
  : "\nthe turnaround is drawn as the brake it is");
await browser.close();
process.exit(failures ? 1 : 0);
