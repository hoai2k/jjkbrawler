// Regression tests for the 3D workbench's POSE EDITOR — the loop that turns
// "the arm is too low" into keyframes a clip table can take.
//
// Five things are under test, each with its own way of being quietly wrong:
//
//   1. HANDLES LAND ON JOINTS. A handle sits on a joint only if the projection
//      through the render camera, the blit's placement arithmetic and the
//      viewer's zoom all agree — three places that each look right alone.
//   2. THE DRAG IS EXACT. Dragging a joint leaves its limb pointing at the
//      pointer: "rotate the parent toward the mouse", measured, not felt.
//   3. KEYFRAMES, NOT FRAMES. An edit lands on the selected extreme and the
//      in-betweens rebuild through that segment's curve — so the value halfway
//      to the next key is the EASE's, not the average.
//   4. THE TWO SPACES ARE KEPT APART. A bone a solver aims at the target
//      cannot be authored into a keyframe (the solve would erase it), so its
//      edits go to an offset track applied after the solve, and the panel says
//      which is which.
//   5. THE DELIVERY SETTINGS BITE. The scale dial changes how big the model is
//      drawn; the facing dial turns the rig.
//
// Needs `playwright` and a Chromium binary — set CHROMIUM_PATH if yours is
// elsewhere. Start the game first (node server.mjs), then:
//   node tools/smoke_pose_edit.mjs [baseUrl]
import { chromium } from "playwright";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200));
});

let fails = 0;
const check = (ok, label, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
};
const open = async (query) => {
  await page.goto(`${BASE}/render3d/workbench/${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__poseEditor, { timeout: 120000 });
  await page.waitForTimeout(2000);
};

const handleOf = (name) => page.evaluate((n) => {
  const h = window.__poseEditor.handles().find((x) => x.bone.name === n);
  return h ? { x: h.x, y: h.y, space: h.space } : null;
}, name);
const clientOf = (pt) => page.evaluate(([x, y]) => {
  const c = document.getElementById("stage");
  const r = c.getBoundingClientRect();
  const vp = window.__viewport;
  const cx = x * vp.z + vp.panX + vp.pivot.x * (1 - vp.z);
  const cy = y * vp.z + vp.panY + vp.pivot.y * (1 - vp.z);
  return { x: r.left + (cx / c.width) * r.width, y: r.top + (cy / c.height) * r.height };
}, [pt.x, pt.y]);

// A mannequin character: its clips are the authored default set, so the table
// under test is the one the pose tables actually hold.
await open("?char=gojo&state=run");
await page.click("#editPoseBtn");
await page.waitForTimeout(500);

// ---- 3a. the clip arrives as extremes, not as frames ------------------------
const keys = await page.$$eval(".keychip", (n) => n.map((x) => x.textContent));
check(keys.length >= 5 && keys.length <= 12,
  "a run cycle presents as a handful of extremes", `${keys.length} keys`);

// Work on a middle extreme: the first key has no predecessor to interpolate
// from, which would make the curve check compare a segment against itself.
await page.$$eval(".keychip", (n) => n[2].click());
await page.waitForTimeout(300);

// ---- 1. handles are game-pixel positions ------------------------------------
const hand0 = await handleOf("RightHand");
await page.waitForTimeout(800);
const hand1 = await handleOf("RightHand");
check(Math.hypot(hand1.x - hand0.x, hand1.y - hand0.y) < 0.01,
  "a paused pose holds still while the editor previews it");

// ---- 2. the drag points the limb at the pointer ------------------------------
const target = { x: hand0.x + 70, y: hand0.y - 60 };
const from = await clientOf(hand0);
const to = await clientOf(target);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(from.x + (to.x - from.x) * i / 10, from.y + (to.y - from.y) * i / 10);
  await page.waitForTimeout(30);
}
await page.mouse.up();
await page.waitForTimeout(300);
const aim = await page.evaluate((t) => {
  const hs = window.__poseEditor.handles();
  const h = hs.find((x) => x.bone.name === "RightHand");
  const p = hs.find((x) => x.bone.name === "RightForeArm");
  const a = Math.atan2(h.y - p.y, h.x - p.x);
  const b = Math.atan2(t.y - p.y, t.x - p.x);
  return ((b - a) * 180 / Math.PI + 540) % 360 - 180;
}, target);
check(Math.abs(aim) < 1.5, "dragging a joint leaves the limb pointing at the pointer",
  `${aim.toFixed(2)}° off`);
check(await page.inputValue("#jointSelect") === "RightForeArm",
  "the dragged bone becomes the selected joint, in the panel too");

// ---- 3b. the edit is a KEYFRAME, and the curve rebuilds ---------------------
const curve = await page.evaluate(async () => {
  const THREE = await import("/vendor/three/three.module.js");
  const t = window.__poseEditor.tables.gojo.run;
  const clip = window.__poseEditor.editedClip("gojo", "run");
  if (!clip) return null;
  const track = clip.tracks.find((x) => x.name === "RightForeArm.quaternion");
  const it = track.createInterpolant();
  const at = (time) => {
    const v = it.evaluate(time);
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(v[0], v[1], v[2], v[3]), "XYZ");
    return e.z * 180 / Math.PI;
  };
  const ki = window.__poseEditor.state.ki;
  const a = t.keys[Math.max(0, ki - 1)], b = t.keys[ki];
  return { onKey: at(b.t), prevKey: at(a.t), mid: at((a.t + b.t) / 2),
           samples: track.times.length, edited: b.pose.RightForeArm };
});
check(!!curve?.edited, "the drag wrote a pose onto the selected keyframe",
  JSON.stringify(curve?.edited));
check(Math.abs(curve.onKey - curve.edited[2]) < 1.5,
  "the rebuilt clip passes exactly through the edited extreme",
  `${curve.onKey.toFixed(1)}° vs ${curve.edited[2]}°`);
const linearMid = (curve.prevKey + curve.onKey) / 2;
check(curve.samples > 8 && Math.abs(curve.mid - linearMid) > 0.5,
  "and eases between the extremes rather than sliding linearly",
  `mid ${curve.mid.toFixed(1)}° vs linear ${linearMid.toFixed(1)}° over ${curve.samples} samples`);

// A key can be added where the clip has none, and removed again — an extreme
// the delivery lacked is authorable rather than merely movable.
const before = (await page.$$eval(".keychip", (n) => n.length));
await page.evaluate(() => {
  // Park the playhead BETWEEN extremes, which is the only place a new one is
  // a new one (asking for a key that already exists just selects it).
  const s = document.getElementById("scrub");
  s.value = "0.42";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(200);
await page.click("#keyAdd");
await page.waitForTimeout(300);
const added = await page.$$eval(".keychip", (n) => n.length);
await page.click("#keyDel");
await page.waitForTimeout(300);
const back = await page.$$eval(".keychip", (n) => n.length);
check(added === before + 1 && back === before,
  "a keyframe can be added between extremes and removed again",
  `${before} -> ${added} -> ${back}`);

// ---- 4. the two spaces ------------------------------------------------------
await open("?char=gojo&state=light");
await page.click("#editPoseBtn");
await page.waitForTimeout(400);
await page.selectOption("#jointSelect", "RightForeArm");
await page.waitForTimeout(200);
check(/target/i.test(await page.textContent("#spaceBadge")),
  "the striking limb reports as target-oriented");
await page.selectOption("#jointSelect", "LeftUpLeg");
await page.waitForTimeout(200);
check(/character/i.test(await page.textContent("#spaceBadge")),
  "a bone the clip owns reports as character-oriented");

await page.selectOption("#jointSelect", "RightForeArm");
await page.evaluate(() => {
  const r = document.querySelectorAll("#axisRows input[type=range]")[2];
  r.value = "18"; r.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(400);
const spaces = await page.evaluate(() => {
  const t = window.__poseEditor.tables.gojo.light;
  const ki = window.__poseEditor.state.ki;
  return { delta: t.deltas.RightForeArm?.[0]?.deg,
           inKeyframe: t.keys[ki].pose.RightForeArm,
           post: window.__poseEditor.postEdits(t.keys[ki].t)?.map((e) => e[0]) };
});
check(spaces.delta?.[2] === 18,
  "an edit on a solver-owned bone is stored as a target-space offset", JSON.stringify(spaces.delta));
check(Array.isArray(spaces.post) && spaces.post.includes("RightForeArm"),
  "...and is handed to the pose as a POST-solve layer, where it survives");

// ---- export ------------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "clip-edit-"));
const dl = page.waitForEvent("download");
await page.click("#poseExportBtn");
const file = join(dir, "clip-edits.json");
await (await dl).saveAs(file);
const payload = JSON.parse(readFileSync(file, "utf8"));
check(payload.kind === "render3d-clip-edits", "the payload names itself", payload.kind);
const block = payload.characters?.gojo?.light;
check(Array.isArray(block?.keys) && block.keys.every((k) => k.ease && k.pose),
  "every exported key carries its pose and its curve", `${block?.keys?.length} keys`);
check(!!block?.targetSpaceOffsetsDeg?.RightForeArm,
  "target-space offsets are exported apart from the keyframes");

// ---- 5. the delivery settings -------------------------------------------------
await open("?char=gojo&state=idle");
const drawn = () => page.evaluate(async () => {
  const rigs = await import("/render3d/src/loader.js");
  const scene = await import("/render3d/src/scene.js");
  const blit = await import("/render3d/src/blit.js");
  const { getActor } = await import("/src/characters.js");
  const c = document.createElement("canvas");
  c.width = 500; c.height = 600;
  const ctx = c.getContext("2d");
  scene.clearCache();
  const entry = scene.renderPose("gojo", "idle", 0, rigs.getRig("gojo"),
    rigs.resolveClip("gojo", "idle"), {});
  blit.blitPose(ctx, entry, "gojo", 250, 520, { scale: getActor("gojo")?.scale, facing: 1 });
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let top = -1, bot = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 24) { if (top < 0) top = y; bot = y; break; }
    }
  }
  return bot - top + 1;
});
const h1x = await drawn();
await page.evaluate(() => {
  const n = document.getElementById("scaleNum");
  n.value = "1.25"; n.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(400);
const h125 = await drawn();
check(Math.abs(h125 / h1x - 1.25) < 0.04, "the scale dial changes how big the model is drawn",
  `${h1x}px -> ${h125}px (${(h125 / h1x).toFixed(3)}×)`);

const yawed = await page.evaluate(async () => {
  const rigs = await import("/render3d/src/loader.js");
  const pose = await import("/render3d/src/pose.js");
  const rig = rigs.getRig("gojo");
  const clip = rigs.resolveClip("gojo", "idle").clip;
  const read = () => { pose.poseRig(rig, "idle", 0, clip, {}); return rig.root.rotation.y; };
  rigs.setRigSettings("gojo", { yawOffsetDeg: 0 });
  const a = read();
  rigs.setRigSettings("gojo", { yawOffsetDeg: 60 });
  const b = read();
  rigs.setRigSettings("gojo", { yawOffsetDeg: 0 });
  return { a, b };
});
check(Math.abs(yawed.b - yawed.a - Math.PI / 3) < 1e-6,
  "the facing dial turns the whole rig, at any angle",
  `${(yawed.a * 180 / Math.PI).toFixed(0)}° -> ${(yawed.b * 180 / Math.PI).toFixed(0)}°`);

// ---- per-character look-dev -------------------------------------------------
// The dials write the manifest entry's toon block and mark themselves.
await page.evaluate(() => {
  const r = document.getElementById("bright");
  r.value = "1.4"; r.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(300);
const look = await page.evaluate(async () => {
  const rigs = await import("/render3d/src/loader.js");
  const stored = rigs.rigManifest().characters.gojo?.toon?.brightness;
  const dot = document.querySelector('label.dial[data-key="brightness"]')
    .className.includes("overridden");
  let uniform = null;
  rigs.getRig("gojo").root.traverse((o) => {
    const u = o.material?.userData?.uniforms;
    if (u && uniform === null) uniform = u.uBrightness.value;
  });
  return { stored, dot, uniform };
});
check(look.stored === 1.4 && look.uniform === 1.4,
  "a look-dev dial writes this character's toon block and their materials",
  JSON.stringify(look));
check(look.dot, "...and the dial shows the modified dot");
await page.evaluate(() =>
  document.querySelector('label.dial[data-key="brightness"] .clear').click());
await page.waitForTimeout(300);
const cleared = await page.evaluate(async () => {
  const rigs = await import("/render3d/src/loader.js");
  return { stored: rigs.rigManifest().characters.gojo?.toon?.brightness,
    dot: document.querySelector('label.dial[data-key="brightness"]').className.includes("overridden") };
});
check(cleared.stored === undefined && !cleared.dot,
  "× drops the override and the dot together");

check(errors.length === 0, "no page errors", errors.join(" | "));
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nall pose-edit checks passed");
process.exit(fails ? 1 : 0);
