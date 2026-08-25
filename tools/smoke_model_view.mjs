// Smoke the MODEL VIEWER (`?edit=3d`) — the bench that shows the .glb itself.
//
// What it guards is the claim the page makes: that what is on screen is the
// FILE, that switching versions switches the file rather than relabelling the
// same one, that the correction switch is the engine's own layer and moves the
// body when it is on, and that the facts panel is measured off the model
// rather than copied from the manifest. None of those fail loudly — a viewer
// that quietly shows the wrong body, or shows the corrected one while saying
// "as delivered", sends somebody off to fix a fault that is not there.
//
//     node server.mjs &
//     node tools/smoke_model_view.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv.slice(2).find((a) => !a.startsWith("--"))
  || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  // version.json is written by the deploy workflow and is absent locally on
  // every bench; it is not this page's failure to report.
  if (m.type() === "error" && !/version\.json|Failed to load resource/.test(m.text())) {
    errors.push(m.text().slice(0, 200));
  }
});

// NOBARA IS THE CASE WORTH OPENING ON: two generations on file, a weapon, and
// a yaw correction on the older one — everything this bench exists for, in one
// fighter.
await page.goto(`${BASE}/render3d/workbench/index.html?edit=3d&char=nobara`, { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, { timeout: 90000 });
await page.waitForTimeout(1200);

// ---------------------------------------------------------------- it opened

check(await page.evaluate(() => document.body.classList.contains("mode-model")),
  "?edit=3d opens the model viewer");
const shell = await page.evaluate(() => ({
  canvas: !!document.getElementById("view"),
  // Another bench's controls on this page would read as a broken viewer rather
  // than as the wrong one.
  strays: ["boneSelect", "stateSelect", "compareMode", "fixText"]
    .filter((id) => document.getElementById(id)).length,
  chars: document.getElementById("charSelect").options.length,
  versions: [...document.getElementById("verSelect").options].map((o) => o.value),
}));
check(shell.canvas, "it has a live viewport");
check(shell.strays === 0, "...and none of the other benches' controls came with it");
check(shell.chars >= 25, "every delivered fighter is in the picker", `${shell.chars} of them`);
check(shell.versions.join(",") === "current,alt",
  "a fighter with two bodies on file offers both", shell.versions.join(", "));

// -------------------------------------------------- it is showing THE FILE
//
// Measured off the loaded model, then held against what the file actually is.
// The two conformed D7 rigs and the Tripo bodies they replaced differ in every
// one of these, which is what makes them a usable assertion.

const facts = () => page.evaluate(() => window.__modelView.measure());
const current = await facts();
check(current.generator.includes("conform_delivery"),
  "the current Nobara is the conformed delivery", current.generator);
check(Math.abs(current.heightM - 1.6) < 0.02,
  "...measured off the model rather than read from the manifest", `${current.heightM.toFixed(3)} m`);
check(current.props.includes("Prop_Main"),
  "...and her hammer's bone is there to see", current.props.join(", ") || "no prop bones");

// -------------------------------------------------------- versions switch

await page.evaluate(() => {
  const s = document.getElementById("verSelect");
  s.value = "alt";
  s.onchange({ target: s });
});
await page.waitForFunction(() => window.__modelView.state.version === "alt", { timeout: 30000 });
await page.waitForTimeout(2000);
const alt = await facts();
check(alt.generator !== current.generator && alt.clips.length > current.clips.length,
  "switching versions loads the other body, not a relabel",
  `${alt.generator}, ${alt.clips.length} clips vs ${current.clips.length}`);
check(new URL(page.url()).searchParams.get("ver") === "alt",
  "...and the address carries the version, so the comparison is linkable");

// -------------------------------------------------------------- the yaw switch
//
// The old Nobara carries a 65° yaw, and it is the game's FRAMING rather than a
// fault in her file — solved against her idle sprite through a camera pinned
// at −60°. So it is its own switch, and it must be its own switch: while it
// rode the correction layer, ticking "corrections" swung the conformed Nobara
// 30° off front when her file faces exactly where the spec asks.

const bone = (name) => page.evaluate((n) => window.__modelView.bone(n), name);
const tick = async (id, on) => {
  await page.evaluate(({ id, on }) => {
    const c = document.getElementById(id);
    c.checked = on;
    c.onchange({ target: c });
  }, { id, on });
  await page.waitForTimeout(400);
};

const facing = await bone("Hips");
await tick("applyYaw", true);
const yawed = await bone("Hips");
check(facing && yawed && facing.quat.some((v, i) => Math.abs(v - yawed.quat[i]) > 0.01),
  "the yaw switch turns the rig", `${JSON.stringify(facing?.quat)} -> ${JSON.stringify(yawed?.quat)}`);
await tick("applyYaw", false);
const unyawed = await bone("Hips");
check(unyawed && facing.quat.every((v, i) => Math.abs(v - unyawed.quat[i]) < 1e-3),
  "...and off leaves the body facing where it was delivered");

// ------------------------------------------------- the correction layer bites
//
// Nothing on the roster carries a shape correction any more — they were all
// baked into the files — so the switch is a no-op on every fighter today, and
// a check that only watched a no-op would pass just as happily with the layer
// unplugged. So one is put ON the live manifest entry, which is what every
// other dial in this workbench does to it, and then measured: a head tilt
// turns the head without moving its origin, which is exactly the kind of
// change a coarser assertion would miss.

const headBefore = await bone("Head");
await page.evaluate(() => {
  window.__modelView.shown().entry.headTiltDeg = 18;
  window.__modelView.refresh();
});
await tick("showFixes", true);
const headTilted = await bone("Head");
check(headTilted && headBefore
  && headBefore.quat.some((v, i) => Math.abs(v - headTilted.quat[i]) > 0.05),
  "the correction layer applies a head tilt when it is on",
  `${JSON.stringify(headBefore?.quat)} -> ${JSON.stringify(headTilted?.quat)}`);
check(headTilted && Math.abs(headTilted.pos[1] - headBefore.pos[1]) < 1e-3,
  "...as a rotation, without moving the joint it turns about");
await tick("showFixes", false);
const headBack = await bone("Head");
check(headBack && headBefore.quat.every((v, i) => Math.abs(v - headBack.quat[i]) < 1e-3),
  "...and off puts the file back exactly as delivered");
await page.evaluate(() => {
  delete window.__modelView.shown().entry.headTiltDeg;
  window.__modelView.refresh();
});

// A fighter whose corrections are all baked must SAY so rather than showing an
// empty box: "nothing outstanding" is the finished state, and a blank panel
// reads as a broken one.
await page.evaluate(() => {
  const s = document.getElementById("charSelect");
  s.value = "gojo";
  s.onchange({ target: s });
});
await page.waitForFunction(() => window.__modelView.state.char === "gojo", { timeout: 30000 });
await page.waitForTimeout(2500);
const fixText = await page.evaluate(() => document.getElementById("fixList").textContent.trim());
check(fixText.length > 0, "the corrections panel always says something", fixText.slice(0, 60));

// --------------------------------------------------------------- the gestures

const camera = () => page.evaluate(() => ({ ...window.__modelView.view, target: window.__modelView.view.target.toArray() }));
const start = await camera();
const box = await page.evaluate(() => {
  const r = document.getElementById("view").getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.mouse.move(box.x + 120, box.y + 10, { steps: 6 });
await page.mouse.up();
const turned = await camera();
check(Math.abs(turned.yaw - start.yaw) > 10, "a drag turns the model",
  `${start.yaw.toFixed(1)}° -> ${turned.yaw.toFixed(1)}°`);
check(turned.target.every((v, i) => Math.abs(v - start.target[i]) < 1e-6),
  "...without sliding it, which is what pan is for");

await page.mouse.move(box.x, box.y);
await page.keyboard.down("Shift");
await page.mouse.down();
await page.mouse.move(box.x + 80, box.y, { steps: 6 });
await page.mouse.up();
await page.keyboard.up("Shift");
const panned = await camera();
check(panned.target.some((v, i) => Math.abs(v - turned.target[i]) > 0.01),
  "shift-drag pans", `target ${panned.target.map((v) => v.toFixed(2)).join(", ")}`);
check(Math.abs(panned.yaw - turned.yaw) < 1e-6, "...without turning it");

await page.mouse.wheel(0, -200);
await page.waitForTimeout(100);
const zoomed = await camera();
check(zoomed.dist < panned.dist, "the wheel zooms in",
  `${panned.dist.toFixed(2)} -> ${zoomed.dist.toFixed(2)}`);

// The one dial that is only about looking: it must move the light and say so,
// and it must not be mistaken for something the game does.
const lightAt = () => page.evaluate(() => Number(document.getElementById("lightVal").textContent.replace("×", "")));
const litBefore = await lightAt();
await page.evaluate(() => {
  const s = document.getElementById("light");
  s.value = "5";
  s.oninput({ target: s });
});
await page.waitForTimeout(200);
const litAfter = await lightAt();
check(litAfter > litBefore && new URL(page.url()).searchParams.get("light") === "5.00",
  "the ambient dial moves and travels in the address", `${litBefore} -> ${litAfter}`);

check(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | "));

console.log(failures ? `\n${failures} check(s) failed` : "\nall model-viewer checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
