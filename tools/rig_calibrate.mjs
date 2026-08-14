// WHAT EACH DELIVERED RIG GOT WRONG IN ITS BIND, measured rather than eyeballed.
//
//   node tools/rig_calibrate.mjs [char ...]
//
// A generated model arrives with things wrong that are nobody's pose: one
// shoulder built higher than the other, knees splayed outward, a head modelled
// looking down. They are facts about the FILE — no clip corrects them, every
// state inherits them — and they are exactly what `rig_fixes.js` is a layer
// for until somebody bakes them into the bind.
//
// Finding them by eye is how it has been done and it does not scale: "his
// shoulders look uneven" is not reviewable, and a reviewer looking at
// twenty-seven fighters will not notice the fourth-worst one. So it is
// measured, in the BIND POSE, where a difference can only be the model:
//
//   SHOULDER TILT   one shoulder higher than the other, as a fraction of the
//                   shoulder width. A real body is not perfectly level either,
//                   so the bar is set where it starts to read at game size.
//   KNEE KINK       how far the shin departs from the thigh's line WHEN SEEN
//                   FROM THE FRONT. Not the shin's lean, which was the first
//                   measure and was wrong: a bind with the feet apart leans
//                   both shins inward and that is a stance, not a defect. The
//                   kink is the bow-legged/knock-kneed one — a knee that juts
//                   sideways out of its own leg — and it reads at game size
//                   because it survives every pose the legs are put in.
//   KNEE BEND       how bent the leg is at rest, in the side view. A rig that
//                   arrives pre-bent fights every pose that wants to stand.
//   KNEE BOW        how far the knee sits outboard of the line from hip to
//                   ankle, on the posed idle. This is what `kneeDeg` moves,
//                   one for one — the dial hinges the SHIN, so the knee stays
//                   and the foot swings under it — and it is what reads at
//                   game size as a bandy leg.
//   LEG LEAN        how far the whole leg leans off vertical seen from the
//                   FRONT. Printed beside the bow because the two are easy to
//                   confuse and only one of them is a defect: lean is the
//                   STANCE, which is a fighter's own and not something to
//                   correct, and a leg can lean a long way while standing
//                   perfectly straight.
//
// It prints the fix each finding implies, in the form rig_fixes.js takes, so
// the correction is copy-pasteable rather than re-derived by hand — and with
// `--solve` it SOLVES the amount instead of deriving it, by applying a trial
// correction to the posed rig, measuring what actually changed, and scaling.
//
// That is not belt and braces. The first pass computed the angle from the
// tilt directly and under-corrected by four fifths, because a fix is composed
// in the bone's parent frame while the tilt is measured in the world's, and
// those axes are not the same once the clavicle has any rest rotation at all.
// A number that is right by construction is worth more than one that looks
// right, and the loop costs three renders per character.
//
// Needs playwright and a running `node server.mjs`.

import { chromium } from "playwright";

const BASE = process.env.WORKBENCH_URL || "http://127.0.0.1:5174";
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/** Where a difference stops being a body and starts being a defect. */
const LIMITS = {
  // Set from the roster's own spread rather than from taste: at these bars the
  // tool names the handful of rigs that are genuinely out of line with their
  // twenty-six neighbours, which is the only comparison that means anything
  // when every model came out of the same generator.
  tilt: 0.05,    // shoulder height gap, as a fraction of shoulder width
  kink: 12.0,    // degrees the shin juts sideways out of the thigh's line
  bend: 18.0,    // degrees of knee bend in a bind that should be standing
  lean: 8.0,     // degrees a leg leans out past its own stance, POSED idle
  bow: 8.0,      // degrees the knee bulges outboard of the hip-to-ankle line
};

/** How much of a MESH-only tilt to believe. A shoulder measured off skinned
 *  vertices carries the costume, so the correction is capped where a real
 *  shoulder difference stops and a collar starts. */
const MESH_CAP = 0.10;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/render3d/workbench/?edit=pose`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__workbenchReady, null, { timeout: 120000 });
await page.waitForTimeout(1200);

const rows = await page.evaluate(async (want) => {
  const THREE = await import("/vendor/three/three.module.js");
  const rigs = await import("/render3d/src/loader.js");
  const pose = await import("/render3d/src/pose.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");
  const { GLTFLoader } = await import("/vendor/three/loaders/GLTFLoader.js");
  const keys = want.length ? want : CHARACTER_KEYS;
  const out = [];
  for (const key of keys) {
    try { await rigs.ensureRig(key, GLTFLoader); } catch { out.push({ key, err: "load failed" }); continue; }
    const rig = rigs.getRig(key);
    if (!rig?.root) { out.push({ key, err: "no rig" }); continue; }
    // THE BIND, not a pose: registration measures the idle height and leaves
    // the rig posed, so anything read off it as-found is a pose plus a model.
    // `restoreClean` puts every bone back to what the file shipped.
    pose.restoreClean(rig.root);
    rig.root.updateMatrixWorld(true);
    const at = (n) => {
      const b = rig.root.getObjectByName(n);
      return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null;
    };
    const L = at("LeftArm"); const R = at("RightArm");
    const row = { key, height: rig.height };
    if (L && R) {
      const width = L.distanceTo(R) || 1;
      // Positive = the LEFT shoulder sits higher.
      row.tilt = (L.y - R.y) / width;
      row.widthCm = width * 100;
    }
    for (const side of ["Left", "Right"]) {
      const hip = at(`${side}UpLeg`); const knee = at(`${side}Leg`); const foot = at(`${side}Foot`);
      if (!hip || !knee || !foot) continue;
      const thigh = knee.clone().sub(hip);
      const shin = foot.clone().sub(knee);
      const hipL = at("LeftUpLeg"); const hipR = at("RightUpLeg");
      const lat = hipL && hipR ? hipL.clone().sub(hipR).normalize() : new THREE.Vector3(1, 0, 0);
      const up = new THREE.Vector3(0, 1, 0);
      // THE KINK, in the frontal plane: flatten both segments onto (lateral,
      // up) and ask how far the shin turns off the thigh's line. A leg with
      // the foot placed wide is still straight, and this says so; a knee that
      // juts out of its own leg is not, and this catches it.
      const flat = (v) => new THREE.Vector2(v.dot(lat), v.dot(up));
      const t2 = flat(thigh); const s2 = flat(shin);
      const outward = side === "Left" ? 1 : -1;
      const kink = t2.length() > 1e-4 && s2.length() > 1e-4
        ? (Math.atan2(s2.x, -s2.y) - Math.atan2(t2.x, -t2.y)) * 180 / Math.PI : 0;
      row[`${side}Kink`] = ((kink + 540) % 360 - 180) * outward;
      // The bend is the side view, where a knee is allowed to bend.
      row[`${side}Bend`] = thigh.angleTo(shin) * 180 / Math.PI;
    }

    // THE SKIN's shoulders: every skinned vertex assigned to the bone that
    // weighs it most, then the top of each shoulder's own cloud. Vertices
    // rather than a silhouette, because a silhouette is mostly hair.
    const tops = { Left: -Infinity, Right: -Infinity };
    const idx = new Map();
    rig.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.skeleton.bones.forEach((b, i) => {
        const m = /^(Left|Right)(Shoulder|Arm)$/.exec(b.name);
        if (m) idx.set(`${o.uuid}:${i}`, m[1]);
      });
      const pos = o.geometry.attributes.position;
      const skinIndex = o.geometry.attributes.skinIndex;
      const skinWeight = o.geometry.attributes.skinWeight;
      if (!pos || !skinIndex || !skinWeight) return;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        let best = -1; let bw = 0;
        for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(i, k);
          if (w > bw) { bw = w; best = skinIndex.getComponent(i, k); }
        }
        const side = idx.get(`${o.uuid}:${best}`);
        if (!side) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y > tops[side]) tops[side] = v.y;
      }
    });
    if (Number.isFinite(tops.Left) && Number.isFinite(tops.Right) && row.widthCm) {
      row.meshTilt = (tops.Left - tops.Right) / (row.widthCm / 100);
    }
    out.push(row);
  }
  return out;
}, only);

await browser.close();

const n = (v, d = 1) => (v === undefined || v === null ? "  —  " : v.toFixed(d).padStart(6));
console.log("char          bone tilt  mesh tilt   knee kink L/R       knee bend L/R");
const findings = [];
for (const r of rows) {
  if (r.err) { console.log(`${r.key.padEnd(13)} ${r.err}`); continue; }
  const bad = [];
  if (Math.abs(r.tilt ?? 0) > LIMITS.tilt) bad.push("tilt");
  if (Math.abs(r.LeftKink ?? 0) > LIMITS.kink || Math.abs(r.RightKink ?? 0) > LIMITS.kink) bad.push("kink");
  if ((r.LeftBend ?? 0) > LIMITS.bend || (r.RightBend ?? 0) > LIMITS.bend) bad.push("bend");
  if (Math.abs(r.meshTilt ?? 0) > LIMITS.tilt && Math.abs(r.tilt ?? 0) <= LIMITS.tilt) bad.push("MESH tilt");
  console.log(`${r.key.padEnd(13)} ${n(r.tilt, 3)}    ${n(r.meshTilt, 3)}   `
    + `${n(r.LeftKink)} ${n(r.RightKink)}      ${n(r.LeftBend)} ${n(r.RightBend)}`
    + (bad.length ? `   << ${bad.join(", ")}` : ""));
  if (bad.length) findings.push(r);
}

if (!findings.length) {
  console.log("\nevery rig is within tolerance");
} else {
  console.log(`\n${findings.length} rig(s) outside tolerance `
    + `(tilt ${LIMITS.tilt}, kink ${LIMITS.kink}°, bend ${LIMITS.bend}°). `
    + "Suggested rig_fixes.js entries:\n");
  for (const r of findings) {
    const fix = {};
    // RAISE THE LOWER SHOULDER, never lower the higher one: the higher one is
    // where the costume and the silhouette were built, and dropping it moves
    // the collar. The clavicle's roll about the fighter's facing is what lifts
    // a shoulder, and the sign flips per side.
    //
    // SIZED FROM THE BONE where the bone is off, and only from the mesh when
    // the skeleton is level — and then capped, because the vertex measure
    // picks up whatever the shoulder happens to be wearing. Yuji's skin reads
    // 0.233 against a 0.063 skeleton, and most of that gap is a scarf.
    const boneOff = Math.abs(r.tilt ?? 0) > LIMITS.tilt;
    const meshOff = Math.abs(r.meshTilt ?? 0) > LIMITS.tilt;
    if (boneOff || meshOff) {
      const raw = boneOff ? r.tilt : Math.max(-MESH_CAP, Math.min(MESH_CAP, r.meshTilt));
      const deg = +(Math.asin(Math.min(1, Math.abs(raw))) * 180 / Math.PI).toFixed(1);
      const lower = raw > 0 ? "Right" : "Left";
      fix[`${lower}Shoulder`] = lower === "Right" ? [0, 0, -deg] : [0, 0, deg];
    }
    for (const side of ["Left", "Right"]) {
      const kink = r[`${side}Kink`];
      if (Math.abs(kink ?? 0) > LIMITS.kink) {
        // Straighten the shin back onto the thigh's line: roll the SHIN, not
        // the thigh. Rolling the thigh moves the whole leg and takes the foot
        // with it; the kink is at the knee, so the correction is at the knee.
        const deg = +kink.toFixed(1);
        fix[`${side}Leg`] = [0, 0, side === "Left" ? -deg : deg];
      }
    }
    console.log(`  ${r.key}: ${JSON.stringify(fix)},`);
  }
}
// ----------------------------------------------------------------- the legs
//
// A separate pass because it is a separate question, asked of a different
// body: everything above is read from the BIND, where a defect can only be the
// model, but a leg has to be read from the POSED idle. That is not a weakness
// of the measurement, it is the point — the kink measured in the bind is
// genuinely large and genuinely does not survive `applyIdleStand`, and a pass
// that only looked at the bind spent a whole round correcting the wrong thing
// and made Geto worse.
{
  const browser3 = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  });
  const page3 = await browser3.newPage({ viewport: { width: 1200, height: 800 } });
  page3.on("pageerror", (e) => errors.push(e.message));
  await page3.goto(`${BASE}/render3d/workbench/?edit=keys`, { waitUntil: "networkidle" });
  await page3.waitForFunction(() => !!window.__poseEditor, { timeout: 120000 });
  await page3.waitForTimeout(1200);
  const legs = await page3.evaluate(async (want) => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const { CHARACTER_KEYS } = await import("/src/characters.js");
    const { GLTFLoader } = await import("/vendor/three/loaders/GLTFLoader.js");
    const { poseRig } = await import("/render3d/src/pose.js");
    const keys = want.length ? want : CHARACTER_KEYS;
    const out = [];
    for (const key of keys) {
      try { await rigs.ensureRig(key, GLTFLoader); } catch { continue; }
      const rig = rigs.getRig(key);
      if (!rig?.root || rig.isMannequin) continue;
      // WITH THE DIAL AT ZERO, so the reading is of the model rather than of
      // the last reviewer: a rig already carrying a kneeDeg would otherwise
      // measure straight and the tool would say it needs nothing.
      const held = rig.kneeDeg || 0;
      rig.kneeDeg = 0;
      const clip = rigs.resolveClip(key, "idle");
      poseRig(rig, "idle", { t: 0, animTime: 0 }, clip?.clip || null,
        { charKey: key, stanceDeg: rig.stanceDeg || 0 });
      rig.root.updateMatrixWorld(true);
      rig.kneeDeg = held;
      const at = (n) => { const b = rig.root.getObjectByName(n);
        return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
      const hl = at("LeftUpLeg"); const hr = at("RightUpLeg");
      if (!hl || !hr) continue;
      const lat = hl.clone().sub(hr); lat.y = 0;
      if (lat.lengthSq() < 1e-8) continue;
      lat.normalize();
      const row = { key, stance: rig.stanceDeg || 0 };
      for (const side of ["Left", "Right"]) {
        const hip = at(`${side}UpLeg`); const knee = at(`${side}Leg`); const ankle = at(`${side}Foot`);
        if (!hip || !knee || !ankle) continue;
        const sign = side === "Left" ? 1 : -1;
        // FLATTENED TO THE FRONTAL PLANE — the width line and up — because
        // that is the view a bandy leg exists in. Anything fore-aft here is a
        // stride, and a stride is not what either number is about.
        const flat = (v) => new THREE.Vector2(v.dot(lat) * sign, v.y);
        const whole = flat(ankle.clone().sub(hip));
        // Positive = the foot sits OUTBOARD of the hip. Exactly what kneeDeg
        // moves, and it moves it one for one.
        row[`${side}Lean`] = +(Math.atan2(whole.x, -whole.y) * 180 / Math.PI).toFixed(1);
        // Positive = the knee bulges OUTBOARD of the hip-to-ankle line. The
        // dial cannot touch this one.
        const up2 = flat(knee.clone().sub(hip));
        const lo2 = flat(ankle.clone().sub(knee));
        const bow = (Math.atan2(up2.x, -up2.y) - Math.atan2(lo2.x, -lo2.y)) * 180 / Math.PI;
        row[`${side}Bow`] = +(((bow + 540) % 360) - 180).toFixed(1);
      }
      out.push(row);
    }
    return out;
  }, only);
  await browser3.close();

  console.log("\nTHE LEGS, on the posed idle — bow is what the Knees dial moves");
  console.log("char          stance    lean L/R         bow L/R");
  const look = [];
  for (const r of legs) {
    const lean = ((r.LeftLean ?? 0) + (r.RightLean ?? 0)) / 2;
    const bow = ((r.LeftBow ?? 0) + (r.RightBow ?? 0)) / 2;
    // THE STANCE IS SUBTRACTED from the lean, because it is not a defect: a
    // fighter told to plant their feet 15 degrees apart has legs leaning 15
    // degrees apart and that is the dial working.
    const extra = lean - (r.stance || 0);
    const flag = Math.abs(extra) > LIMITS.lean || Math.abs(bow) > LIMITS.bow;
    console.log(`${r.key.padEnd(13)}${String(r.stance).padStart(5)}   ${n(r.LeftLean)} ${n(r.RightLean)}   `
      + `${n(r.LeftBow)} ${n(r.RightBow)}`
      + (flag ? `   << ${Math.abs(extra) > LIMITS.lean ? "leans out" : ""}`
        + `${Math.abs(bow) > LIMITS.bow ? " bowed" : ""}` : ""));
    if (flag) look.push({ key: r.key, extra, bow });
  }
  if (look.length) {
    console.log(`\n${look.length} rig(s) to look at in the idle review's Knees dial:`);
    for (const l of look) {
      const parts = [];
      if (Math.abs(l.bow) > LIMITS.bow) parts.push(`bow ${Math.round(l.bow)}° — start the dial there`);
      if (Math.abs(l.extra) > LIMITS.lean) parts.push(`leans ${l.extra > 0 ? "+" : ""}${Math.round(l.extra)}° past its own stance (a STANCE question, not a knee one)`);
      console.log(`  ${l.key.padEnd(12)} ${parts.join(", ")}`);
    }
    console.log("\nThe bow figure is where to START the dial — it swings each shin back");
    console.log("under its knee. The drawing is what settles it.");
  } else {
    console.log("\nevery leg stands under its own hip");
  }
}

if (process.argv.includes("--solve") && findings.length) {
  console.log("\nsolving each shoulder against the POSED rig...\n");
  const browser2 = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  });
  const page2 = await browser2.newPage({ viewport: { width: 1200, height: 800 } });
  await page2.goto(`${BASE}/render3d/workbench/?edit=keys`, { waitUntil: "networkidle" });
  await page2.waitForFunction(() => !!window.__poseEditor, { timeout: 120000 });
  await page2.waitForTimeout(1200);
  const solved = await page2.evaluate(async (want) => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const fixes = await import("/render3d/src/rig_fixes.js");
    const { GLTFLoader } = await import("/vendor/three/loaders/GLTFLoader.js");
    const { poseRig } = await import("/render3d/src/pose.js");
    const saved = { ...fixes.RIG_FIXES };
    const out = [];
    for (const { key, lower } of want) {
      await rigs.ensureRig(key, GLTFLoader);
      const rig = rigs.getRig(key);
      if (!rig) continue;
      const measure = () => {
        const r = rigs.resolveClip(key, "idle");
        poseRig(rig, "idle", { t: 0, animTime: 0 }, r?.clip || null, { charKey: key });
        rig.root.updateMatrixWorld(true);
        const at = (n) => { const b = rig.root.getObjectByName(n);
          return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
        const L = at("LeftArm"); const R = at("RightArm");
        return L && R ? (L.y - R.y) / (L.distanceTo(R) || 1) : 0;
      };
      const bone = `${lower}Shoulder`;
      const sign = lower === "Right" ? -1 : 1;
      for (const k of Object.keys(fixes.RIG_FIXES)) delete fixes.RIG_FIXES[k];
      const base = measure();
      // One trial at 10°, then scale: the response is linear enough over the
      // few degrees a shoulder fix ever needs, so one probe gives the gain.
      fixes.RIG_FIXES[key] = { [bone]: [0, 0, sign * 10] };
      const trial = measure();
      const gain = (trial - base) / 10;
      let deg = gain ? +(-base / gain).toFixed(1) : 0;
      deg = Math.max(-20, Math.min(20, deg));
      fixes.RIG_FIXES[key] = { [bone]: [0, 0, deg] };
      const after = measure();
      out.push({ key, bone, deg, before: +base.toFixed(3), after: +after.toFixed(3) });
      for (const k of Object.keys(fixes.RIG_FIXES)) delete fixes.RIG_FIXES[k];
    }
    Object.assign(fixes.RIG_FIXES, saved);
    return out;
  }, findings.filter((r) => Math.abs(r.tilt ?? 0) > LIMITS.tilt || Math.abs(r.meshTilt ?? 0) > LIMITS.tilt)
      .map((r) => ({ key: r.key,
        lower: (Math.abs(r.tilt ?? 0) > LIMITS.tilt ? r.tilt : r.meshTilt) > 0 ? "Right" : "Left" })));
  await browser2.close();
  for (const s2 of solved) {
    console.log(`  ${s2.key.padEnd(12)} ${s2.bone.padEnd(14)} ${String(s2.deg).padStart(6)}°   `
      + `tilt ${String(s2.before).padStart(7)} -> ${String(s2.after).padStart(7)}`);
  }
  console.log("\n  copy:");
  for (const s2 of solved) console.log(`  ${s2.key}: { ${s2.bone}: [0, 0, ${s2.deg}] },`);
}

if (errors.length) { console.error(`\npage errors:\n${errors.join("\n")}`); process.exit(1); }
