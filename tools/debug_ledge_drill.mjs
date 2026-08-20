// DOES THE HANG POSE EVER SHOW WITHOUT A LEDGE?
//
// Reported from the character bench: a hang appearing with the gripping hand
// nowhere near a corner. Every ledge exit is taken inside `updateLedge`, and
// that branch returns before `pickAnim` — so an exit that does not name a pose
// leaves the fighter wearing the hang until the next frame picks one. The
// drop-off did exactly that. One frame, which the 0.08s cross-fade then ghosts
// into five.
//
// So this runs the bench's own ledge drill, twice, and watches every frame for
// the pose and the ledge disagreeing: `animKey === "ledge"` while `f.ledge` and
// `f.ledgeMove` are both null is a hand closed on air.
//
// Usage: node tools/debug_ledge_drill.mjs [baseUrl]
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

await page.goto(`${BASE}/workbench/?edit=character&char=gojo`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__bench?.state().fighters > 0, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const out = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const f = state.fighters[0];
  const runs = [];

  for (let n = 0; n < 2; n++) {
    document.getElementById("ledgeDrill").click();
    const seen = new Set();
    let orphan = 0, hung = false, climbed = false;
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      seen.add(f.animKey);
      if (f.ledge) hung = true;
      // The fault: wearing the hang with nothing to hang from.
      if (f.animKey === "ledge" && !f.ledge && !f.ledgeMove) orphan++;
      if (hung && f.grounded && !f.ledgeMove) { climbed = true; break; }
    }
    runs.push({ hung, climbed, orphanFrames: orphan, poses: [...seen].join(" ") });
    await new Promise((r) => setTimeout(r, 300));
  }
  // AND THE EXIT THE DRILL DOES NOT TAKE.
  //
  // The drill climbs, which goes through `beginLedgeMove` and names its own
  // poses. The reported fault was the other exit: the DROP-OFF clears
  // `f.ledge`, sets a velocity and returns, naming nothing.
  //
  // Stepped BY HAND rather than watched over requestAnimationFrame. The fault
  // is one simulation step wide, and a rAF sampler is racing the bench's own
  // loop for who reads the fighter first — which is how the first version of
  // this reported a clean run against code that still had the bug. Here the
  // step and the read are the same statement.
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const plat = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  const dt = 1 / 60;

  const drop = { reached: false, poseOnDropStep: null, orphan: false };
  // Put them on the ledge through the real grab, then step until it takes.
  Object.assign(f, {
    x: plat.x - 24, y: plat.y + 40, vx: 0, vy: 60, grounded: false, airT: 0.5,
    ledge: null, ledgeMove: null, ledgeCooldown: 0, hitstun: 0, action: null,
  });
  // Until the hang has SETTLED. A grab starts a `catch` transition and
  // `f.ledge` is set while that runs, so stepping until `f.ledge` alone leaves
  // the fighter mid-reach — where `updateLedgeMove` owns the pose and the hang
  // timer is not read at all. That is why the first version of this could not
  // reach the branch it was written to test.
  for (let i = 0; i < 120 && !(f.ledge && !f.ledgeMove); i++) {
    updateFighter(f, dt, blankInput());
  }
  drop.reached = !!(f.ledge && !f.ledgeMove);
  if (drop.reached) {
    // Past the 2.8s hang timer, which is the same branch as pressing down.
    f.ledgeTimer = 3;
    updateFighter(f, dt, blankInput());
    drop.poseOnDropStep = f.animKey;
    drop.orphan = f.animKey === "ledge" && !f.ledge && !f.ledgeMove;
  }
  return { runs, drop };
});

for (const [i, r] of out.runs.entries()) {
  console.log(`run ${i + 1}: caught the ledge ${r.hung}, climbed back ${r.climbed}`);
  console.log(`  poses:  ${r.poses}`);
  console.log(`  frames wearing the hang with no ledge: ${r.orphanFrames}`);
}
console.log(`\ndrop-off (the exit that was broken): reached the ledge ${out.drop.reached}`);
console.log(`  pose on the step that let go: ${out.drop.poseOnDropStep}`);
console.log(`  wearing the hang with no ledge: ${out.drop.orphan}`);

if (errs.length) console.log("\nERRORS:", errs.slice(0, 4));

await page.screenshot({ path: process.env.SHOT || "/tmp/ledge-drill.png" });
await browser.close();
