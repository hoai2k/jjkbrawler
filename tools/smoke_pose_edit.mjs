// Regression tests for the 3D workbench's POSE EDITOR — the loop that turns
// "the arm is too low" into numbers a clip table can take.
//
// What is under test is the part that is easy to get subtly wrong and hard to
// see wrong: the mapping between a bone in the scene and the pixel it is drawn
// at. A handle sits on a joint only if the projection through the render
// camera and the blit's placement arithmetic agree with each other AND with
// the viewer's zoom — three places that each look right alone.
//
//   1. HANDLES LAND ON JOINTS. Handle positions are stable across a zoom
//      change (they are game-pixel positions, not screen ones), and clicking
//      where a zoomed, panned handle is drawn selects THAT joint.
//   2. THE DRAG IS EXACT. Dragging a joint leaves its limb pointing at the
//      pointer — "rotate the parent toward the mouse", measured, not felt.
//   3. THE POSE HOLDS STILL. Previewing the same frame for a second changes
//      nothing: the live layers compose onto the clip once per pose, not once
//      per frame (render3d/src/pose.js restoreRest).
//   4. EDITS SURVIVE THE ROUND TRIP. The panel and the viewer share one
//      selection, and Output changes writes the offsets that were made.
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

await page.goto(`${BASE}/render3d/workbench/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__poseEditor, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.click("#editPoseBtn");
await page.waitForTimeout(400);

/** Where a bone's handle is drawn, in game pixels. */
const handleOf = (name) => page.evaluate((n) => {
  const h = window.__poseEditor.handles().find((x) => x.bone.name === n);
  return h ? { x: h.x, y: h.y } : null;
}, name);

/** A game-pixel point as a page-client point, through the viewer's transform. */
const clientOf = (pt) => page.evaluate(([x, y]) => {
  const c = document.getElementById("stage");
  const r = c.getBoundingClientRect();
  const vp = window.__viewport;
  const cx = x * vp.z + vp.panX + vp.pivot.x * (1 - vp.z);
  const cy = y * vp.z + vp.panY + vp.pivot.y * (1 - vp.z);
  return { x: r.left + (cx / c.width) * r.width, y: r.top + (cy / c.height) * r.height };
}, [pt.x, pt.y]);

const handles = await page.evaluate(() => window.__poseEditor.handles().length);
check(handles > 10, "the rig hands out a handle per joint", `${handles} handles`);

// ---- 3. the preview does not drift -----------------------------------------
const hand0 = await handleOf("RightHand");
await page.waitForTimeout(1000);
const hand1 = await handleOf("RightHand");
const drift = Math.hypot(hand1.x - hand0.x, hand1.y - hand0.y);
check(drift < 0.01, "a paused pose holds still while the editor previews it",
  `${drift.toFixed(4)} px of drift in 1s`);

// ---- 2. the drag points the limb at the pointer -----------------------------
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

const edits = await page.evaluate(() => JSON.parse(JSON.stringify(window.__poseEditor.edits)));
const char = await page.inputValue("#charSelect");
const st = await page.inputValue("#stateSelect");
check(!!edits[char]?.[st]?.RightForeArm, "the drag is stored against this character and state",
  JSON.stringify(edits[char]?.[st] || {}));

// ---- 1. handles are game-pixel positions, and hit-test under zoom ------------
const beforeZoom = await handleOf("RightHand");
await page.evaluate(() => {
  const z = document.getElementById("zoom");
  z.value = "2.4";
  z.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(400);
const afterZoom = await handleOf("RightHand");
check(Math.hypot(afterZoom.x - beforeZoom.x, afterZoom.y - beforeZoom.y) < 0.01,
  "zooming the viewer does not move the pose under it",
  `${JSON.stringify(beforeZoom)} -> ${JSON.stringify(afterZoom)}`);


const lh = await handleOf("LeftHand");
const lhClient = await clientOf(lh);
await page.mouse.click(lhClient.x, lhClient.y);
await page.waitForTimeout(250);
check(await page.inputValue("#jointSelect") === "LeftHand",
  "a click where a zoomed handle is DRAWN selects that joint");

// ---- the panel can set a joint the viewer cannot reach ----------------------
await page.selectOption("#jointSelect", "Neck");
await page.evaluate(() => {
  const r = document.querySelectorAll("#axisRows input[type=range]")[1];
  r.value = "25";
  r.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(400);
const neck = await page.evaluate(() => window.__poseEditor.edits);
const neckY = Object.values(Object.values(neck)[0])[0]?.Neck?.[1];
check(neckY === 25, "a joint set by hand in the panel takes the value typed", `Y=${neckY}`);

// ---- 4. Output changes writes what was edited -------------------------------
const dir = mkdtempSync(join(tmpdir(), "pose-edit-"));
const dl = page.waitForEvent("download");
await page.click("#poseExportBtn");
const file = join(dir, "pose-edits.json");
await (await dl).saveAs(file);
const payload = JSON.parse(readFileSync(file, "utf8"));
check(payload.kind === "render3d-pose-edits", "the payload names itself", payload.kind);
const block = payload.characters?.[char]?.[st];
check(!!block?.offsetsDeg?.RightForeArm && !!block?.offsetsDeg?.Neck,
  "the payload carries every joint that was moved",
  Object.keys(block?.offsetsDeg || {}).join(","));
check(Array.isArray(block?.resultLocalDeg?.Neck),
  "...and the absolute rotation a pose table would take");

// ---- resets clear the state --------------------------------------------------
await page.click("#resetStateBtn");
await page.waitForTimeout(300);
const left = await page.evaluate(() => {
  const e = window.__poseEditor.edits;
  return Object.values(e).flatMap((s) => Object.values(s)).flatMap((b) => Object.keys(b)).length;
});
check(left === 0, "Reset state drops this state's edits", `${left} left`);

check(errors.length === 0, "no page errors", errors.join(" | "));
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nall pose-edit checks passed");
process.exit(fails ? 1 : 0);
