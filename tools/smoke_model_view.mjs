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

// ------------------------------------------------- the correction layer bites
//
// The old Nobara carries a 65° yaw correction, which is the one fix on the
// roster today that visibly moves a body: everything else was baked into the
// files. With the switch off the rig faces where it was BUILT; with it on it
// faces where the spec says.

const rootYaw = () => page.evaluate(() => {
  const root = window.__modelView.bone("Hips");
  return root ? root : null;
});
const before = await rootYaw();
await page.evaluate(() => {
  const c = document.getElementById("showFixes");
  c.checked = true;
  c.onchange({ target: c });
});
await page.waitForTimeout(500);
const after = await rootYaw();
const moved = before && after
  && before.quat.some((v, i) => Math.abs(v - after.quat[i]) > 0.01);
check(moved, "the correction layer turns the rig when it is on",
  `${JSON.stringify(before?.quat)} -> ${JSON.stringify(after?.quat)}`);

await page.evaluate(() => {
  const c = document.getElementById("showFixes");
  c.checked = false;
  c.onchange({ target: c });
});
await page.waitForTimeout(500);
const back = await rootYaw();
check(back && before.quat.every((v, i) => Math.abs(v - back.quat[i]) < 1e-3),
  "...and off puts the file back exactly as delivered");

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

check(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | "));

console.log(failures ? `\n${failures} check(s) failed` : "\nall model-viewer checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
