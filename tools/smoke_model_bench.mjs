// Smoke the MODEL BENCH (`?edit=models`) — the bench that edits the rig
// instead of the animation.
//
// What it guards is the claim the page makes: that the figure on screen is the
// engine's own T-pose, that the ring you grab is the axis you get, that the
// number it records is the one the GLB correction layer will apply, and that
// the download hands back that same number. None of those throw when they
// break — you spend a session dragging handles and the file you send on is
// wrong by a rotation nobody can see.
//
//     node server.mjs &
//     node tools/smoke_model_bench.mjs [baseUrl] [--chromium]
import { chromium, webkit } from "playwright";

const BASE = process.argv.slice(2).find((a) => !a.startsWith("--"))
  || "http://127.0.0.1:5174";
const useChromium = process.argv.includes("--chromium");
const browser = useChromium
  ? await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
  })
  : await webkit.launch();
console.log(`engine: ${useChromium ? "chromium" : "webkit (Safari)"}`);

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

await page.goto(`${BASE}/render3d/workbench/index.html?edit=models&char=yuji`,
  { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, { timeout: 90000 });
await page.waitForTimeout(2500);

// ---------------------------------------------------------------- it opened

check(await page.evaluate(() => document.body.classList.contains("mode-models")),
  "?edit=models opens the model bench");
const shell = await page.evaluate(() => ({
  canvas: !!document.getElementById("view"),
  // The pose bench's cockpit must NOT be here: a screen of controls that
  // belong to another tool reads as a broken page, not as the wrong page.
  strays: ["poseSelect", "stateSelect", "compareMode"]
    .filter((id) => document.getElementById(id) && id !== "poseSelect").length,
  poses: [...(document.getElementById("poseSelect")?.options || [])].map((o) => o.value),
  bones: window.__modelBench.boneList().length,
}));
check(shell.canvas, "it has a live viewport rather than a blitted stage");
check(shell.strays === 0, "...and none of the pose bench's controls came with it");
check(shell.poses.join(",") === "T,A",
  "the pose chooser offers the two rig checks and nothing else", shell.poses.join(", "));
check(shell.bones > 15, "the whole skeleton is listed", `${shell.bones} bones`);

// THE WAY TO HAND THE WORK BACK HAS TO BE ON SCREEN. It was not: the panel was
// written with a class this project's CSS does not define, so it had no height
// limit and no scroll, and the download button rendered below the fold of a
// page that does not look scrollable. A button you cannot find is a button
// that is not there.
const handback = await page.evaluate(() => {
  const seen = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
  };
  return { download: seen(document.getElementById("download")),
           copy: seen(document.getElementById("copyFixes")),
           box: !!document.getElementById("fixText") };
});
check(handback.download && handback.copy,
  "the download and copy buttons are on screen without scrolling for them");
check(handback.box, "...and there is a paste box beside them");

// The bench opens on a bone worth turning. The first bone in skeleton order is
// a root wrapper on the floor, and a gizmo around the fighter's ankles is a
// confusing thing to be handed.
const opensOn = await page.evaluate(() => window.__modelBench.state.bone);
check(opensOn === "LeftShoulder", "it opens on a clavicle, not on the root", opensOn);

// ------------------------------------------------- what the page is showing
//
// The engine's own rig check, not a second implementation of one: arms level
// for the T, ~45° down for the A, measured off the rig itself.

const armAngle = (pose) => page.evaluate(async (p) => {
  const sel = document.getElementById("poseSelect");
  sel.value = p;
  sel.onchange();
  await new Promise((r) => setTimeout(r, 500));
  const THREE = await import("/vendor/three/three.module.js");
  const rigs = await import("/render3d/src/loader.js");
  const r = rigs.getRig("yuji");
  const at = (n) => r.root.getObjectByName(n).getWorldPosition(new THREE.Vector3());
  const v = at("LeftHand").sub(at("LeftArm"));
  return +(Math.atan2(-v.y, Math.hypot(v.x, v.z)) * 180 / Math.PI).toFixed(1);
}, pose);
const tDeg = await armAngle("T");
const aDeg = await armAngle("A");
check(Math.abs(tDeg) < 20, "the T-pose puts the arms out level", `${tDeg}° below horizontal`);
check(aDeg > 25 && aDeg < 70, "...and the A-pose drops them to about 45°", `${aDeg}°`);
await armAngle("T");

// -------------------------------------------------------------- the view ring
//
// The three axis rings write a clean single-axis number and are the ones you
// cannot always use: on a clavicle from the default camera one of them
// projects thirteen pixels wide. The view ring's plane is the screen's, so it
// is face-on by construction — there is never a joint you have to orbit twice
// to reach.

const viewRing = await page.evaluate(() => {
  const box = window.__modelBench.canvas.getBoundingClientRect();
  const at = window.__modelBench.ringScreenPoint(window.__modelBench.VIEW_AXIS, 0);
  const across = window.__modelBench.ringScreenPoint(window.__modelBench.VIEW_AXIS, 0.5);
  const wide = window.__modelBench.ringScreenPoint(window.__modelBench.VIEW_AXIS, 0.25);
  const tall = window.__modelBench.ringScreenPoint(window.__modelBench.VIEW_AXIS, 0.75);
  if (!at) return null;
  return { w: Math.hypot(at.x - across.x, at.y - across.y),
           h: Math.hypot(wide.x - tall.x, wide.y - tall.y),
           inside: at.x > box.left && at.x < box.right };
});
check(!!viewRing, "there is a view ring as well as the three axis rings");
check(viewRing && Math.abs(viewRing.w - viewRing.h) < viewRing.w * 0.08,
  "...and it is face-on, which is the whole point of it",
  viewRing ? `${Math.round(viewRing.w)}×${Math.round(viewRing.h)}px` : "");

// Turning it has to write a real correction. It is not a single-axis number —
// the screen plane is not any of the bone's axes — so what is checked is that
// the bone moved and that the drag went into the table.
await page.evaluate(() => document.getElementById("allReset").click());
await page.waitForTimeout(300);
{
  const A = await page.evaluate((ax) => window.__modelBench.ringScreenPoint(ax, 0), 3);
  await page.mouse.move(A.x, A.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    const q = await page.evaluate(([ax, t]) => window.__modelBench.ringScreenPoint(ax, t),
      [3, (0.08 * i) / 6]);
    await page.mouse.move(q.x, q.y);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const rec = await page.evaluate(() => window.__modelBench.RIG_FIXES.yuji?.LeftShoulder);
  const size = rec ? Math.hypot(...rec) : 0;
  check(size > 15 && size < 45,
    "dragging the view ring a twelfth of a turn records about 30° of rotation",
    rec ? `[${rec.join(", ")}] — ${size.toFixed(1)}° total` : "nothing recorded");
}

// ------------------------------------------------------------- the handles
//
// GRAB THE RING YOU SEE. Three rings share a centre and cross each other twice
// per pair, so a picker that decides by depth hands back whichever ring leans
// toward the camera — which is how a drag visibly around the blue ring came
// back as six degrees on green. The picker decides in screen space instead,
// and this is the check that says so.
//
// The X ring is used because from the default camera it projects as a full
// circle (112px across) while the Z ring on a clavicle is nearly edge-on
// (13px). Both are grabbable; only one can be dragged precisely enough for a
// test to assert a number, which is exactly why the bench fades the other.

await page.evaluate(() => document.getElementById("allReset").click());
await page.waitForTimeout(300);

const sweep = 0.1;                                   // a tenth of a turn = 36°
const start = await page.evaluate((t) => window.__modelBench.ringScreenPoint(0, t), 0.13);
await page.mouse.move(start.x, start.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  const at = await page.evaluate(([ax, t]) => window.__modelBench.ringScreenPoint(ax, t),
    [0, 0.13 + (sweep * i) / 8]);
  await page.mouse.move(at.x, at.y);
}
await page.mouse.up();
await page.waitForTimeout(300);

const dragged = await page.evaluate(() => window.__modelBench.RIG_FIXES.yuji || {});
const rx = dragged.LeftShoulder?.[0] ?? 0;
check(Math.abs(rx - 36) < 3,
  "dragging a ring a tenth of a turn records 36° about that ring's axis",
  `[${(dragged.LeftShoulder || []).join(", ")}]`);
check(Math.abs(dragged.LeftShoulder?.[1] || 0) < 1 && Math.abs(dragged.LeftShoulder?.[2] || 0) < 1,
  "...and nothing about the other two", `y ${dragged.LeftShoulder?.[1]}, z ${dragged.LeftShoulder?.[2]}`);

// The edit is not a drawing of an edit: it has to move the body, through the
// engine's own correction layer.
const moved = await page.evaluate(async () => {
  const THREE = await import("/vendor/three/three.module.js");
  const rigs = await import("/render3d/src/loader.js");
  const fixes = await import("/render3d/src/rig_fixes.js");
  const at = () => rigs.getRig("yuji").root.getObjectByName("LeftHand")
    .getWorldPosition(new THREE.Vector3());
  const on = at().clone();
  const keep = fixes.RIG_FIXES.yuji;
  delete fixes.RIG_FIXES.yuji;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const off = at().clone();
  fixes.RIG_FIXES.yuji = keep;
  return +on.distanceTo(off).toFixed(3);
});
check(moved > 0.05,
  "the correction is applied to the body, not just recorded", `hand moves ${moved}m`);

// ...and it is the SAME layer the game uses, so switching the layer off shows
// the .glb as delivered. That is the comparison the whole bake exists for.
const layer = await page.evaluate(async () => {
  const THREE = await import("/vendor/three/three.module.js");
  const rigs = await import("/render3d/src/loader.js");
  const at = () => rigs.getRig("yuji").root.getObjectByName("LeftArm")
    .getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
  // Let the check above's restore land first. It puts the table back and
  // returns, and the rig is only re-posed on the next animation frame — read
  // straight away and "corrections on" is measured on the body with them off.
  await new Promise((r) => setTimeout(r, 300));
  const on = at();
  const box = document.getElementById("showFixes");
  box.checked = false; box.onchange();
  await new Promise((r) => setTimeout(r, 400));
  const off = at();
  box.checked = true; box.onchange();
  await new Promise((r) => setTimeout(r, 400));
  return { on, off, back: at() };
});
check(layer.on.join() !== layer.off.join(),
  "corrections off shows the model as delivered",
  `arm root ${layer.on.join(", ")} -> ${layer.off.join(", ")}`);
check(layer.on.join() === layer.back.join(),
  "...and turning them back on restores it exactly");

// ------------------------------------------------------------ the panel maths

const panel = await page.evaluate(() => {
  const nums = [...document.querySelectorAll("#axisRows .axis input[type=number]")];
  nums[1].value = "-7.5";
  nums[1].onchange();
  return { after: window.__modelBench.RIG_FIXES.yuji?.LeftShoulder,
           shown: nums.map((n) => +n.value) };
});
check(Math.abs((panel.after?.[1] ?? 0) + 7.5) < 0.01,
  "typing an angle sets that axis and leaves the others alone",
  `[${(panel.after || []).join(", ")}]`);
check(Math.abs(panel.shown[0] - 36) < 3,
  "...and the panel still reads what the drag put on X", `${panel.shown[0]}°`);

// -------------------------------------------------------------- the download

const waiting = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
await page.click("#download");
const download = await waiting;
if (!download) {
  check(false, "the download button hands back a file");
} else {
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* reported below */ }
  check(payload?.kind === "render3d-model-bench",
    "the download button hands back a corrections file", download.suggestedFilename());
  const bones = payload?.fixes?.yuji?.bones?.LeftShoulder;
  check(Array.isArray(bones) && Math.abs(bones[0] - 36) < 3 && Math.abs(bones[1] + 7.5) < 0.01,
    "...carrying exactly what is on screen, in RIG_FIXES' own shape",
    bones ? `LeftShoulder [${bones.join(", ")}]` : "not in the file");
  check(!!payload?.fixes?.yuji?.model,
    "...and which model it was measured against", payload?.fixes?.yuji?.model || "");
  // The box and the file have to be the same thing. A paste box that showed a
  // prettier version of the truth would be the one control here you could not
  // trust, and it is the one most likely to be used.
  const boxed = await page.evaluate(() => document.getElementById("fixText").value);
  const same = (() => {
    try {
      const a = JSON.parse(boxed), b = payload;
      return JSON.stringify(a.fixes) === JSON.stringify(b.fixes);
    } catch { return false; }
  })();
  check(same, "the paste box holds exactly what the file holds");
}

// ------------------------------------------------------------ the mannequin
//
// The stand-in is the one body in the project that is certainly correct, so
// standing it in the same pose at the same height turns "does this look like a
// T-pose" into "does this match that". Overlaid rather than beside: a
// five-degree shoulder is invisible when you are comparing two silhouettes
// from memory and obvious as a green edge sticking out of one.
const ghost = await page.evaluate(async () => {
  const box = document.getElementById("showMannequin");
  const before = window.__modelBench.mannequinShown();
  box.checked = true; box.onchange();
  await new Promise((r) => setTimeout(r, 700));
  const on = window.__modelBench.mannequinShown();
  box.checked = false; box.onchange();
  await new Promise((r) => setTimeout(r, 500));
  return { before, on, off: window.__modelBench.mannequinShown() };
});
check(!ghost.before && ghost.on && !ghost.off,
  "the mannequin ghost comes and goes with its checkbox",
  `off ${ghost.before} -> on ${ghost.on} -> off ${ghost.off}`);
check(ghost.on && Math.abs(ghost.on.heightRatio - 1) < 0.06,
  "...standing at this fighter's height, not the stand-in's own",
  ghost.on ? `${ghost.on.mannequinTop}m vs ${ghost.on.charTop}m` : "");

// ------------------------------------------------------- a second character

const swapped = await page.evaluate(async () => {
  const sel = document.getElementById("charSelect");
  sel.value = "jogo";
  await sel.onchange();
  await new Promise((r) => setTimeout(r, 2500));
  return { char: window.__modelBench.state.bone ? "jogo" : null,
           bones: window.__modelBench.boneList().length,
           // Yuji's edits must survive being navigated away from: the download
           // is for the whole session, not for whoever is on screen at the end.
           keptYuji: !!window.__modelBench.edits.get("yuji")?.size,
           url: new URL(location).searchParams.get("char") };
});
check(swapped.bones > 15 && swapped.url === "jogo",
  "picking another fighter loads them", `${swapped.bones} bones, ?char=${swapped.url}`);
check(swapped.keptYuji, "...without losing the edits made to the last one");

check(errors.length === 0, "no page errors throughout", errors.join(" | "));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
