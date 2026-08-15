// Which way is each STATE turned, and does the strike follow the target?
//
// Two rules, both about how a 3D fighter is presented rather than about how
// they are posed:
//
//   1. A STAND is a portrait and keeps its three-quarter; everything the
//      fighter DOES turns out toward profile. A run seen at ¾ is a jog toward
//      the viewer, and a punch at ¾ goes past the camera rather than across it.
//      An attack turns THROUGH the swing — wind-up toward the lens, where the
//      move is legible, contact in profile, where the strike is seen landing.
//      That is `attack_a` and `attack_b` in the sprite sets, read here against
//      the clip's own contact beat.
//   2. Attacks aim at their target within a band around their anchor
//      elevation. They used to snap to the anchor exactly, so a side attack at
//      an opponent a platform up stayed dead level.
//
// Usage: node tools/smoke_present.mjs [baseUrl]
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
await page.goto(`${BASE}/render3d/workbench/index.html?char=nobara`);
await page.waitForFunction(() => window.__rigBench || document.querySelector("canvas"), { timeout: 60000 });
await page.waitForTimeout(4000);

const r = await page.evaluate(async () => {
  const pose = await import("/render3d/src/pose.js");
  const scene = await import("/render3d/src/scene.js");
  const { STATES, aimSolve, AIM_ELEVATIONS, AIM_BAND_DEG } = await import("/render3d/src/states.js");
  const deg = (rad) => (rad * 180) / Math.PI;
  // Missing entirely on a build without any of this, and a guard should report
  // that as failed checks rather than crash on the first call.
  const present = (key, t) => (typeof pose.presentDegFor === "function"
    ? pose.presentDegFor(key, t, STATES[key]?.beat)
    : null);

  // The scene yaw at each state, both facings.
  const yaw = (key, t, facing) => deg(scene.sceneFacingYaw(facing, present(key, t)));

  const beat = STATES.light.beat;
  const chestY = -90;
  const pitchAt = (st, dy) => {
    const s = aimSolve(0, 0, chestY, { x: 120, y: chestY + dy }, 1, st, 96);
    return Math.round(deg(s.pitch));
  };
  const anchorOnly = (st) => Math.round(deg(aimSolve(0, 0, chestY, null, 1, st, 96).pitch));

  return {
    idle: present("idle", 0),
    run: present("run", 0),
    walk: present("walk", 0),
    windup: present("light", 0),
    contact: present("light", beat),
    follow: present("light", beat * 1.8),
    yawRunR: yaw("run", 0, 1), yawRunL: yaw("run", 0, -1),
    yawHitR: yaw("light", beat, 1), yawHitL: yaw("light", beat, -1),
    band: AIM_BAND_DEG ?? 0,
    lightUp: pitchAt("light", -160),
    lightLevel: pitchAt("light", 0),
    lightDown: pitchAt("light", 60),
    upHeavyNear: pitchAt("upHeavy", -60),
    upHeavyFar: pitchAt("upHeavy", -160),
    lightAnchor: anchorOnly("light"),
    upHeavyAnchor: anchorOnly("upHeavy"),
    upHeavyAnchorDeclared: AIM_ELEVATIONS.upHeavy[0],
  };
});

// 1. The stand keeps the delivery's angle; travel turns out.
check(r.idle === null,
  "the stand keeps whatever three-quarter the delivery was drawn at",
  `idle present = ${r.idle === null ? "delivery" : r.idle}`);
check(r.run !== null && r.walk !== null && r.run > 70 && r.walk > 70,
  "travel is turned out toward profile instead",
  `walk ${r.walk}°, run ${r.run}° off chest-on`);

// 2. An attack turns through the swing.
check(r.windup !== null && r.contact !== null && r.run !== null && r.windup < 55,
  "an attack's wind-up faces the camera more than travel does",
  `wind-up ${Math.round(r.windup)}° against run ${r.run}°`);
check(r.contact > r.windup + 25,
  "...and the contact arrives in profile",
  `${Math.round(r.windup)}° -> ${Math.round(r.contact)}° across the wind-up`);
check(Math.abs(r.follow - r.contact) < 1,
  "...and the follow-through holds there rather than winding back",
  `contact ${Math.round(r.contact)}°, after ${Math.round(r.follow)}°`);

// 3. Still an exact mirror at every one of those angles.
check(Math.abs(r.yawRunR + r.yawRunL) < 0.01 && Math.abs(r.yawHitR + r.yawHitL) < 0.01,
  "both facings stay exact mirrors at every angle",
  `run ${Math.round(r.yawRunR)}/${Math.round(r.yawRunL)}, hit ${Math.round(r.yawHitR)}/${Math.round(r.yawHitL)}`);

// 4. The aim follows the target inside its band.
check(r.lightUp > 10 && r.lightDown < -10,
  "a side attack aims at an opponent above or below, not dead level",
  `up ${r.lightUp}°, level ${r.lightLevel}°, down ${r.lightDown}°`);
check(Math.abs(r.lightUp) <= r.band && Math.abs(r.lightDown) <= r.band,
  "...but never further than its band, so it stays inside its own hitbox",
  `band ±${r.band}°, worst ${Math.max(Math.abs(r.lightUp), Math.abs(r.lightDown))}°`);
check(r.upHeavyFar > r.upHeavyNear + 10,
  "an up attack reaches higher for a target further overhead",
  `${r.upHeavyNear}° just above vs ${r.upHeavyFar}° well above`);
check(Math.abs(r.upHeavyAnchor - r.upHeavyAnchorDeclared) <= 2 && Math.abs(r.lightAnchor) <= 2,
  "swinging at nobody sits exactly on the anchor",
  `light ${r.lightAnchor}°, upHeavy ${r.upHeavyAnchor}° against ${r.upHeavyAnchorDeclared}°`);

// 5. THE ANGLES REACH THE FLAT PATH, which is the one the game renders in by
//    default and the one the verification bench draws.
//
//    Everything above tests what the angle SHOULD be and what the scene path
//    does with it. For a while that was the whole test, and the flat path was
//    quietly ignoring all of it: pose.facingYaw carried an allowlist of
//    idle/walk/run/dash and returned the delivery's own angle for every other
//    state, so crouch, shield, hurt, win and every attack stood at the stand's
//    ~60° while the table asked for 80–88. A check that only exercises the
//    path which happens to work is not a check.
const flat = await page.evaluate(async () => {
  const pose = await import("/render3d/src/pose.js");
  const loader = await import("/render3d/src/loader.js");
  const ik = await import("/render3d/src/ik.js");
  const { STATES, clipNameFor, aimSolve } = await import("/render3d/src/states.js");
  const { artReach } = await import("/src/silhouette.js");
  const { headHeightTarget } = await import("/src/heights.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");
  const deg = (r) => (r * 180) / Math.PI;

  // (a) Which states get re-aimed at all, posed through the flat path's layers.
  const rig = loader.getRig("nobara");
  const applied = {};
  for (const st of ["idle", "walk", "run", "crouch", "shield", "hurt", "win", "light", "jump"]) {
    const resolved = loader.resolveClip("nobara", st);
    if (!resolved) continue;
    const beat = STATES[clipNameFor(st)]?.beat;
    const t = pose.sampleTime(st, beat > 0 ? beat : 0, beat);
    pose.poseRig(rig, st, t, resolved.clip,
      { charKey: "nobara", beat, presentMirror: true, facing: 1, facingK: 1, turnYawRad: 0 });
    applied[st] = deg(rig._presentDelta || 0);
  }

  // (b) The presentation must not drag the strike with it. The reach target is
  //     built root-local, so turning the body would swing the punch off its
  //     aim — applyMachineReach counter-rotates by the same delta. Measured as
  //     "how far short of its target does the hand end up", which must be the
  //     same number whether the body was turned or not.
  const hand = (r, animKey) => {
    const names = ik.reachChain(animKey);
    const b = names && r.root.getObjectByName(names[names.length - 1]);
    if (!b) return null;
    r.root.updateMatrixWorld(true);
    return b.getWorldPosition(new (b.position.constructor)());
  };
  let worstDrift = 0, poses = 0, turned = 0;
  for (const charKey of CHARACTER_KEYS) {
    const rg = loader.getRig(charKey);
    if (!rg || rg.isMannequin || !rg.height) continue;
    for (const st of ["light", "sideHeavy", "upHeavy", "downHeavy"]) {
      const resolved = loader.resolveClip(charKey, st);
      if (!resolved) continue;
      const beat = STATES[clipNameFor(st)]?.beat;
      const targetPx = headHeightTarget(charKey);
      const solved = aimSolve(0, 0, -targetPx * 0.55, null, 1, st, artReach(charKey));
      if (!solved) continue;
      const mPerPx = rg.height / targetPx;
      const V = rg.root.position.constructor;
      const layers = { charKey, beat, presentMirror: true, facing: 1, facingK: 1,
                       turnYawRad: 0, reach: { dx: solved.dx, dy: solved.dy, targetPx } };
      const t = pose.sampleTime(st, beat, beat);
      const missBy = () => {
        const v = new V(0, solved.dy * mPerPx, solved.dx * mPerPx);
        if (rg._presentDelta) v.applyAxisAngle(new V(0, 1, 0), -rg._presentDelta);
        rg.root.updateMatrixWorld(true);
        const target = rg.root.localToWorld(v);
        const h = hand(rg, st);
        return h ? h.distanceTo(target) : null;
      };
      pose.poseRig(rg, st, t, resolved.clip, layers);
      const on = missBy();
      if (Math.abs(deg(rg._presentDelta || 0)) > 5) turned++;
      pose.poseRig(rg, st, t, resolved.clip, { ...layers, presentMirror: false });
      const off = missBy();
      if (on === null || off === null) continue;
      poses++;
      worstDrift = Math.max(worstDrift, Math.abs(on - off));
    }
  }
  return { applied, worstDrift, poses, turned };
});

const idleFlat = Math.abs(flat.applied.idle ?? 99);
const doing = ["crouch", "shield", "hurt", "win", "light"];
const unturned = doing.filter((s) => Math.abs(flat.applied[s] ?? 0) < 5);
check(idleFlat < 0.01,
  "the flat path leaves the stand at its delivery's own angle",
  `idle re-aimed by ${idleFlat.toFixed(1)}°`);
check(unturned.length === 0,
  "...and turns out everything the fighter DOES, not just travel",
  unturned.length ? `still at the stand's angle: ${unturned.join(", ")}`
    : doing.map((s) => `${s} ${flat.applied[s].toFixed(0)}°`).join(", "));

// Only the rigs this page has actually loaded — the bench loads them on
// demand, so this is a handful rather than the roster. It is enough: the
// counter-rotation is exact arithmetic (R(base+d)·R(-d) = R(base)), so one
// turned pose that does not drift is the same evidence as a hundred. Stated
// rather than asserted at a number, so a page that loads more says so.
check(flat.poses > 0 && flat.turned === flat.poses && flat.worstDrift < 0.005,
  "presenting the body does not drag the strike off its aim",
  `${flat.poses} attack pose(s) loaded, ${flat.turned} of them turned; `
    + `worst change in hand-to-target ${(flat.worstDrift * 100).toFixed(2)}cm`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall presentation checks passed");
process.exit(failed ? 1 : 0);
