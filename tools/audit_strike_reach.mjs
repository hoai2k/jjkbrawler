#!/usr/bin/env node
// IS EVERY FIGHTER ACTUALLY TRYING TO HIT WHERE THEY ARE AIMING?
//
//     node server.mjs &
//     node tools/audit_strike_reach.mjs
//
// The aim solver puts a target out along the facing at this fighter's own
// reach, and the reach solver swings the striking limb onto it (ik.js
// applyReach). Whether the limb ARRIVES is not the question — a 2.2 m Hanami
// with a 108 px reach is aiming past the end of his own arm, and that is fine:
// the attack arc is drawn at the true distance and the hitbox is its own box.
// The question is whether the limb is EXTENDED and POINTING AT IT. A fist that
// stops at 60% with the elbow bent, or points 40° off, is a fighter who looks
// like they are punching somewhere else.
//
// Two numbers per pose, both independent of whether the target is in range:
//
//   extension   how much of the limb's own length it spans, shoulder to hand.
//               ~100% is a locked elbow. Anything under EXTEND_MIN is a limb
//               that gave up early.
//   off-target  the angle between "shoulder toward hand" and "shoulder toward
//               target". 0° is pointing straight at it.
//
// WEAPON FIGHTERS ARE MEASURED AT THE TIP, not the fist. A spear is not a
// punch: the authored two-handed strike deliberately keeps the main hand IN
// and lets the shaft do the extending (ik.js applyTwoHandGrip, "THE COUPLED
// HALF"), so scoring Maki's knuckles against the target would report a fault
// that is really a feature. What has to point at the target is the thing that
// hits it.

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5174";
/** Below this fraction of its own length, a limb is not trying. */
const EXTEND_MIN = 0.85;
/** Above this many degrees off, it is not pointing at the target. */
const OFF_MAX = 12;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 200)));
await page.goto(`${BASE}/index.html?render=3d&camera=flat`, { waitUntil: "load" });
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 90000 });

const rows = await page.evaluate(async ({ EXTEND_MIN }) => {
  const pose = await import("/render3d/src/pose.js");
  const loader = await import("/render3d/src/loader.js");
  const ik = await import("/render3d/src/ik.js");
  const { STATES, clipNameFor, aimSolve } = await import("/render3d/src/states.js");
  const { twoHandGrip, CHARACTER_PROPS } = await import("/render3d/src/props.js");
  const { artReach } = await import("/src/silhouette.js");
  const { headHeightTarget } = await import("/src/heights.js");
  const { COM_BODY_FRAC } = await import("/src/config_tuning.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");
  const deg = (r) => (r * 180) / Math.PI;
  const MELEE = ["light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack", "airLight"];
  const out = [];

  for (const charKey of CHARACTER_KEYS) {
    const rig = loader.getRig(charKey);
    if (!rig || rig.isMannequin || !rig.height) continue;
    const V = rig.root.position.constructor;
    const wp = (b) => b.getWorldPosition(new V());
    // The prop that leads this fighter's strike, if any.
    const propBone = (CHARACTER_PROPS?.[charKey] || [])[0]?.bone || null;

    for (const st of MELEE) {
      const resolved = loader.resolveClip(charKey, st);
      if (!resolved) continue;
      const beat = STATES[clipNameFor(st)]?.beat;
      const targetPx = headHeightTarget(charKey);
      const solved = aimSolve(0, 0, -targetPx * COM_BODY_FRAC, null, 1, st, artReach(charKey));
      if (!solved) continue;
      const mPerPx = rig.height / targetPx;
      pose.poseRig(rig, st, pose.sampleTime(st, beat, beat), resolved.clip, {
        charKey, beat, presentMirror: true, facing: 1, facingK: 1, turnYawRad: 0,
        aimRad: solved.pitch, reach: { dx: solved.dx, dy: solved.dy, targetPx },
      });
      rig.root.updateMatrixWorld(true);

      const names = ik.reachChain(st);
      const bones = names?.map((n) => rig.root.getObjectByName(n));
      if (!bones || bones.some((b) => !b)) continue;
      const s = wp(bones[0]), e = wp(bones[1]), h = wp(bones[2]);
      const maxSpan = s.distanceTo(e) + e.distanceTo(h);
      const extension = maxSpan > 0 ? s.distanceTo(h) / maxSpan : 0;

      const v = new V(0, solved.dy * mPerPx, solved.dx * mPerPx);
      if (rig._presentDelta) v.applyAxisAngle(new V(0, 1, 0), -rig._presentDelta);
      const target = rig.root.localToWorld(v);

      // What actually hits: the weapon's far end where one leads, else the
      // limb's own end. The weapon only counts when the striking limb is the
      // one HOLDING it — `airLight` kicks with a leg, and scoring Maki's spear
      // against a target her foot is going to reach reported a 77° fault on a
      // pose that is doing exactly the right thing.
      let tip = h, via = names[names.length - 1].includes("Foot") ? "foot" : "fist";
      const prop = propBone && rig.root.getObjectByName(propBone);
      if (prop && twoHandGrip(charKey)) {
        let gripHand = null;
        for (let pr = prop.parent; pr; pr = pr.parent) {
          if (pr.name === "LeftHand" || pr.name === "RightHand") { gripHand = pr.name; break; }
        }
        const box = prop.userData.__shaft;
        if (gripHand && gripHand === names[names.length - 1] && box?.dir && box.extent) {
          prop.updateWorldMatrix(true, false);
          tip = new V().copy(box.dir).multiplyScalar(box.extent).applyMatrix4(prop.matrixWorld);
          via = "weapon";
        }
      }
      const toTip = tip.clone().sub(s).normalize();
      const toTarget = target.clone().sub(s).normalize();
      const off = deg(Math.acos(Math.max(-1, Math.min(1, toTip.dot(toTarget)))));
      // ARRIVING IS ALSO TRYING. A target inside the limb's own span should be
      // touched and no more — an elbow locked out past it would be a fighter
      // punching through their opponent. So extension is only evidence of
      // giving up when the strike did NOT get there; within a hand's width of
      // the target the pose is finished by definition, however bent the arm.
      const missPx = tip.distanceTo(target) / mPerPx;
      out.push({ charKey, state: st, via,
        extension: Math.round(extension * 100),
        off: Math.round(off),
        arrived: missPx <= 10,
        missPx: Math.round(missPx),
        reachablePx: Math.round(s.distanceTo(tip) / mPerPx),
        aimedPx: Math.round(solved.dx) });
    }
  }
  return out;
}, { EXTEND_MIN });

await browser.close();

// A pose is at fault only when it neither ARRIVED nor STRETCHED: pointing off
// the target is always a fault, but a bent arm is only one when the target was
// out of range and the limb stopped short of its own limit anyway.
const bad = rows.filter((r) => r.off > OFF_MAX
  || (!r.arrived && r.extension < EXTEND_MIN * 100));
console.log(`=== striking limbs, ${rows.length} pose(s) across `
  + `${new Set(rows.map((r) => r.charKey)).size} rig(s) ===\n`);
const worstExt = Math.min(...rows.map((r) => r.extension));
const worstOff = Math.max(...rows.map((r) => r.off));
console.log(`  worst extension ${worstExt}%  ·  worst off-target ${worstOff}°`);
console.log(`  thresholds: extended >= ${EXTEND_MIN * 100}%, off-target <= ${OFF_MAX}°\n`);

if (!bad.length) {
  console.log("every striking limb extends and points at what it is aiming at");
} else {
  console.log(`${bad.length} pose(s) not trying:\n`);
  for (const r of bad) {
    console.log(`  ${r.charKey.padEnd(11)} ${r.state.padEnd(12)} ${r.via.padEnd(7)}`
      + ` extended ${String(r.extension).padStart(3)}%`
      + `  ${String(r.off).padStart(3)}° off target`
      + `  ${r.arrived ? "arrived" : `${r.missPx}px short`}`);
  }
}
// A reach nobody can span is not a fault — see the header — but it is worth
// seeing, because it is what decides whether the drawn arc and the body agree.
const stretched = rows.filter((r) => r.aimedPx > r.reachablePx * 1.35);
if (stretched.length) {
  console.log(`\n${stretched.length} pose(s) aim beyond the limb (fine — the arc is `
    + `drawn at the true distance):`);
  const by = new Map();
  for (const r of stretched) by.set(r.charKey, (by.get(r.charKey) || 0) + 1);
  console.log("  " + [...by].map(([k, n]) => `${k}×${n}`).join("  "));
}
process.exit(bad.length ? 1 : 0);
