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

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall presentation checks passed");
process.exit(failed ? 1 : 0);
