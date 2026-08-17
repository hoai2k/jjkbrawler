// A rolling 3D fighter turns in the SCREEN plane, about their own centre.
//
// Two faults this covers, both of which made a roll look like it was turning
// about some other axis entirely:
//
//   1. THE ORDER. `rotation.y` on the rig root carries the facing and the
//      presentation angle; the roll is `rotation.z` on the same object. Three
//      composes an Euler as XYZ by default, applying Z first and then yawing
//      the result — so the roll axis was the body's local Z carried round by
//      the yaw. At the angle a roll is presented at, almost all of a 45° roll
//      became DEPTH: the fighter swung toward the lens instead of tipping over.
//   2. THE PIVOT. `comFrac` is a fraction of the DRAWN SPRITE's height, placed
//      by eye on the drawing. The rig is a different body — Panda's drawing
//      carries its mass at 0.497 of its height, his rig's spine is at 0.58 —
//      so the model turned about a point that was not its centre.
//
// Usage: node tools/smoke_roll_axis.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failed = 0;
const check = (ok, msg, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));
await page.goto(`${BASE}/render3d/workbench/index.html?char=dagon`);
await page.waitForTimeout(10000);

const r = await page.evaluate(async () => {
  const THREE = await import("/vendor/three/three.module.js");
  const rigs = await import("/render3d/src/loader.js");
  const { comFrac } = await import("/src/body_points.js");

  // The composition, exactly as src/camera3d/models.js builds it: a yaw from
  // the pose layer, a roll from the tumble, on one object.
  const headAfterRoll = (order, yawDeg, rollDeg) => {
    const o = new THREE.Object3D();
    o.rotation.order = order;
    o.rotation.y = (yawDeg * Math.PI) / 180;
    o.rotation.z = (rollDeg * Math.PI) / 180;
    o.updateMatrixWorld(true);
    const v = new THREE.Vector3(0, 1, 0).applyMatrix4(o.matrixWorld);
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
  };

  // …and the order the shipped module actually sets.
  const models = await import("/src/camera3d/models.js");
  const layer = models.makeModels();

  const rigged = [];
  for (const key of ["dagon", "panda", "gojo", "nobara"]) {
    const measured = rigs.rigComFrac(key);
    if (measured !== null) rigged.push({ key, measured, sprite: +comFrac(key).toFixed(3) });
  }
  return {
    depthAt80: headAfterRoll("XYZ", 80, 45),
    fixedAt80: headAfterRoll("ZYX", 80, 45),
    fixedAt60: headAfterRoll("ZYX", 60, 45),
    hasLayer: !!layer,
    rigged,
  };
});

// 1. The roll is a screen-plane roll at the angles a roll is actually shown at.
const near = (a, b) => Math.abs(a - b) < 0.01;
check(near(r.fixedAt80.x, -0.707) && near(r.fixedAt80.y, 0.707) && near(r.fixedAt80.z, 0),
  "a 45° roll turns in the screen plane at a travel-state yaw",
  `head at (${r.fixedAt80.x}, ${r.fixedAt80.y}, ${r.fixedAt80.z})`);
check(near(r.fixedAt60.x, -0.707) && near(r.fixedAt60.z, 0),
  "...and at a stand's yaw, which is the same answer",
  `head at (${r.fixedAt60.x}, ${r.fixedAt60.y}, ${r.fixedAt60.z})`);
check(Math.abs(r.depthAt80.z) > 0.5,
  "(the old order really did send the roll into depth — the fault is reproduced here)",
  `XYZ at yaw 80° put the head at z=${r.depthAt80.z}, against 0`);

// 2. The pivot is measured off the model.
check(r.rigged.length > 0, "the rigs report a measured centre of mass",
  r.rigged.map((x) => `${x.key} ${x.measured}`).join(", "));
check(r.rigged.every((x) => x.measured > 0.3 && x.measured < 0.8),
  "...and every one of them is somewhere a torso could be",
  r.rigged.map((x) => `${x.key} ${x.measured} (sprite says ${x.sprite})`).join(", "));
const panda = r.rigged.find((x) => x.key === "panda");
check(!panda || Math.abs(panda.measured - panda.sprite) > 0.05,
  "...and it is not just the sprite's number again where the two bodies differ",
  panda ? `panda: rig ${panda.measured} vs sprite ${panda.sprite}` : "panda has no rig here");

await page.close();

// ...and the same question of the SHIPPED path, because everything above is
// arithmetic and the thing that regresses is a line in src/camera3d/models.js.
// Put a real fighter into a real roll in a real match and read the rig back.
const { pressStart } = await import("./smoke_boot.mjs");
const game = await browser.newPage({ viewport: { width: 1280, height: 720 } });
game.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));
await game.goto(`${BASE}/?render=3d`);
await pressStart(game);
await game.click('[data-character="dagon"]');
await game.waitForTimeout(400);
await game.click("#startButton");
await game.waitForSelector(".stage-card", { timeout: 30000 });
await game.locator(".stage-card").nth(0).click();
for (let w = 0; ; w += 250) {
  const ok = await game.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 1;
  });
  if (ok) break;
  if (w > 180000) throw new Error("match never started");
  await game.waitForTimeout(250);
}
await game.waitForTimeout(6000);

const live = await game.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const rigs = await import("/render3d/src/loader.js");
  const a = state.fighters[0];
  a.aiState = null;
  // Mid-roll: motion.js turns `dodge_roll` into a real rotation, and half way
  // through is where a wrong axis is most obvious.
  Object.assign(a, {
    x: 640, y: state.platforms.find((p) => p.kind === "main").y,
    vx: 0, vy: 0, grounded: true, facing: 1, hitstun: 0, dead: false,
    respawnTimer: 0, invuln: 0,
  });
  // The turn comes from the ACTION, not the clip: motion.js gives a grounded
  // dodge a full TAU across its duration ("a roll that actually rolls"). An
  // eighth of the way through is a roll clearly in progress.
  Object.defineProperty(a, "animKey", { get: () => "dodge_roll", set: () => {}, configurable: true });
  Object.defineProperty(a, "animTime", { get: () => 0.05, set: () => {}, configurable: true });
  const { fighterTransform } = await import("/src/motion.js");
  const inst = rigs.acquireInstance(a.charKey, a.id);
  // RETRIED, because the fixture shares the fighter with the REAL game loop:
  // the loop steps the action's clock and can expire or replace it between
  // the pin and the render, and one bad interleaving used to fail the check
  // about one run in two. Re-pin and read again until a frame really caught
  // the roll mid-turn; a genuine axis fault still fails every attempt.
  let out = null;
  for (let tries = 0; tries < 6; tries++) {
    a.action = { kind: "dodge", t: 0.08, dur: 0.4, anim: "dodge_roll", lockMovement: true };
    a.vx = 300; a.facing = 1; a.facingVis = 1;
    a.hitstun = 0; a.dead = false; a.respawnTimer = 0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    out = {
      charKey: a.charKey,
      order: inst?.root?.rotation?.order || null,
      rollRad: +(inst?.root?.rotation?.z ?? 0).toFixed(4),
      yawRad: +(inst?.root?.rotation?.y ?? 0).toFixed(4),
      motionRot: +(fighterTransform(a).rotation || 0).toFixed(4),
    };
    // BOTH: the facing sweep passes through zero while the fighter turns to
    // face their opponent, and a sample landing on that frame has a roll but
    // no yaw — which is not the composition being tested.
    if (Math.abs(out.rollRad) > 0.01 && Math.abs(out.yawRad) > 0.01) break;
  }
  return out;
});

// AIRBORNE, THE MASS HOLDS STILL. The rig's origin is on the floor between the
// feet, so anchoring there makes the clip's own movement of the hips read as
// the whole fighter bobbing — and mid-somersault there are no feet on anything
// for the anchor to mean. Sweep a roll and watch where the centre goes.
const drift = await game.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const rigs = await import("/render3d/src/loader.js");
  const a = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main");
  Object.assign(a, { x: 640, y: main.y - 260, vx: 0, vy: 0, grounded: false,
    hitstun: 0, dead: false, respawnTimer: 0, invuln: 0 });
  const inst = rigs.acquireInstance(a.charKey, a.id);
  const bones = {};
  inst.root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const spine = bones.Spine || bones.mixamorigSpine || bones.Spine1;
  const feet = [];
  const seen = [];
  for (let i = 0; i <= 8; i++) {
    // Re-pinned every sample: gravity would otherwise carry the fighter down
    // between them and the fall would be measured as pose drift.
    Object.assign(a, { x: 640, y: main.y - 260, vx: 300, vy: 0, grounded: false });
    a.action = { kind: "dodge", t: (i / 8) * 0.4, dur: 0.4, anim: "dodge_roll", lockMovement: true };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    Object.assign(a, { x: 640, y: main.y - 260, vx: 300, vy: 0, grounded: false });
    a.action = { kind: "dodge", t: (i / 8) * 0.4, dur: 0.4, anim: "dodge_roll", lockMovement: true };
    await new Promise((r) => requestAnimationFrame(r));
    inst.root.updateMatrixWorld(true);
    seen.push(spine.matrixWorld.elements[13]);
    feet.push(inst.root.position.y);
  }
  const span = (v) => Math.max(...v) - Math.min(...v);
  return { comSpan: +span(seen).toFixed(4), originSpan: +span(feet).toFixed(4) };
});
// 0.08, not the 0.001 the mechanism itself measures: the fixture shares its
// fighter with the live loop, so up to two sim steps of gravity land between
// each pin and its render and read as drift. The broken anchor measured 0.113
// with the ORIGIN steadier than the centre, so the pair of checks still
// separates cleanly.
check(drift.comSpan < 0.08,
  "airborne, the centre of mass holds still through a whole roll",
  `centre moved ${drift.comSpan} world units across the turn`);
check(drift.originSpan > drift.comSpan,
  "...which is the origin doing the moving instead, as it should be",
  `origin moved ${drift.originSpan} against the centre's ${drift.comSpan}`);

check(live.order === "ZYX",
  "the live model layer composes the roll outside the yaw",
  `${live.charKey}'s rig root is on ${live.order} order`);
check(Math.abs(live.rollRad) > 0.01 && Math.abs(live.yawRad) > 0.01,
  "...on a fighter who is really both rolling and turned",
  `roll ${live.rollRad} rad, yaw ${live.yawRad} rad, motion says ${live.motionRot}`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall roll-axis checks passed");
process.exit(failed ? 1 : 0);
