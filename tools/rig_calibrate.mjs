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
//   KNEE ROLL       which way the knee FACES, measured on the posed idle. The
//                   one leg fault that survives posing, and therefore the only
//                   one worth correcting: `applyIdleStand` aims both leg bones
//                   down one line, which kills the kink and says nothing about
//                   the twist, so a leg built screwed outward at the hip stays
//                   screwed outward with its kneecap and its toe pointing away
//                   from the midline. Read as the angle between the knee's
//                   hinge axis and the body's own width line — 0 is a knee
//                   facing dead front — and corrected by `kneeDeg` in the
//                   manifest, which is a dial in the idle review.
//   MESH TILT       the same shoulder question asked of the SKIN rather than
//                   the skeleton, from the skinned vertices each shoulder owns.
//                   They can disagree and it matters which one is off: Uro's
//                   shoulder BONES are dead level and his skin is not, so
//                   "raise the low shoulder" had to be checked before it was
//                   believed. A clavicle roll does still fix it — lifting the
//                   shoulder lifts the arm hanging off it, which is what a
//                   shrug is — but the size has to come from the right
//                   measurement, and a big mesh-only tilt is as likely to be
//                   an asymmetric collar or hood as a shoulder.
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
  roll: 15.0,    // degrees the knee faces off the front, on the POSED idle
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
// ---------------------------------------------------------------- knee roll
//
// A separate pass because it is a separate question, asked of a different
// body: everything above is read from the BIND, where a defect can only be the
// model, but the roll has to be read from the POSED idle. That is not a
// weakness of the measurement, it is the point — the kink measured in the bind
// is genuinely large and genuinely does not survive `applyIdleStand`, and a
// pass that only looked at the bind spent a whole round correcting the wrong
// thing and made Geto worse.
{
  const browser3 = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  });
  const page3 = await browser3.newPage({ viewport: { width: 1200, height: 800 } });
  page3.on("pageerror", (e) => errors.push(e.message));
  await page3.goto(`${BASE}/render3d/workbench/?edit=animation`, { waitUntil: "networkidle" });
  await page3.waitForFunction(() => !!window.__poseEditor, { timeout: 120000 });
  await page3.waitForTimeout(1200);
  const knees = await page3.evaluate(async (want) => {
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
      const fwd = new THREE.Vector3(-lat.z, 0, lat.x);
      const row = { key };
      for (const side of ["Left", "Right"]) {
        const leg = rig.root.getObjectByName(`${side}Leg`);
        if (!leg) continue;
        // The knee hinges about the shin bone's own local X (measured, not
        // assumed — it is the convention the pose libraries were built on), so
        // where that axis points says which way the knee faces. Flattened to
        // the ground plane: a knee's facing is a yaw question.
        const hinge = new THREE.Vector3(1, 0, 0)
          .applyQuaternion(leg.getWorldQuaternion(new THREE.Quaternion()));
        hinge.y = 0;
        if (hinge.lengthSq() < 1e-8) continue;
        hinge.normalize();
        // Signed so positive means the knee is turned OUT, either side.
        const sign = side === "Left" ? 1 : -1;
        const off = Math.atan2(hinge.dot(fwd) * sign, hinge.dot(lat) * sign) * 180 / Math.PI;
        // The hinge is a line, not an arrow: 180 away is the same axis.
        row[side] = +(((off + 270) % 180) - 90).toFixed(1);
        // AND THE TOE, which is the same fault read at the other end of the
        // leg. Kept beside the hinge rather than instead of it because the two
        // disagree and each is wrong in its own way: the hinge over-reads
        // (Yuji measures 60 and wants about 15), and the toe bone is built at
        // an angle on some rigs (Meimei measures 82 and wants nothing at all).
        // Two readings that agree are worth looking at; one on its own is not.
        const foot = at(`${side}Foot`);
        const toe = at(`${side}ToeBase`) || at(`${side}Toe`);
        if (foot && toe) {
          const d = toe.clone().sub(foot); d.y = 0;
          if (d.lengthSq() > 1e-8) {
            d.normalize();
            row[`${side}Toe`] = +(Math.atan2(d.dot(lat) * sign, d.dot(fwd)) * 180 / Math.PI).toFixed(1);
          }
        }
      }
      out.push(row);
    }
    return out;
  }, only);
  await browser3.close();

  console.log("\nKNEE ROLL, on the posed idle — how far the leg is screwed outward");
  console.log("char           hinge L/R        toe L/R");
  const look = [];
  for (const r of knees) {
    const hinge = ((r.Left ?? 0) + (r.Right ?? 0)) / 2;
    const toe = ((r.LeftToe ?? 0) + (r.RightToe ?? 0)) / 2;
    // BOTH, or neither. Either measure alone names fighters that turn out to
    // want nothing, and the disagreements are the interesting rows: a big
    // hinge with a small toe is a knee built rolled inside a leg that stands
    // straight, and it does not read at game size.
    const flag = hinge > LIMITS.roll && toe > LIMITS.roll;
    console.log(`${r.key.padEnd(13)} ${n(r.Left)} ${n(r.Right)}   ${n(r.LeftToe)} ${n(r.RightToe)}`
      + (flag ? "   << screwed out" : ""));
    if (flag) look.push({ key: r.key, toe });
  }
  if (look.length) {
    // NO NUMBER IS PRINTED, deliberately. The dial moves the toe one for one,
    // so the toe reading is the obvious answer and it is right about half the
    // time — Geto's 35 wants 45 and Choso's 25 wants 45, because the foot is
    // not the only thing the eye is reading. This is a shortlist for the idle
    // review, which is where a dial judged against the drawing belongs.
    console.log(`\n${look.length} rig(s) to look at in the idle review's Knees dial:`);
    console.log(`  ${look.map((l) => `${l.key} (~${Math.round(l.toe)}°)`).join(", ")}`);
    console.log("The bracketed number is the toe splay, which is where to START");
    console.log("the dial, not where to leave it — the drawing settles it.");
  } else {
    console.log("\nevery knee faces the front");
  }
}

if (process.argv.includes("--solve") && findings.length) {
  console.log("\nsolving each shoulder against the POSED rig...\n");
  const browser2 = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  });
  const page2 = await browser2.newPage({ viewport: { width: 1200, height: 800 } });
  await page2.goto(`${BASE}/render3d/workbench/?edit=animation`, { waitUntil: "networkidle" });
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
