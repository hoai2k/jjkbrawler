// Regression tests for the sprite workbench's two independent questions about
// a pose, which have been confused before:
//
//   the yellow dot   = changed SINCE THE PAGE LOADED  (drives Export, the
//                      change count, and Reset character)
//   the view filter  = already dealt with BEFORE the page loaded
//
// The bug this exists to prevent: marking a pose "needs replacement" was read
// as a saved edit, so the pose dropped out of the "no saved edits" work list
// the instant it was flagged — and because Export only looked at the frames the
// current view happened to show, it then reported "no changes yet" and silently
// dropped the flag.
//
// Needs `playwright` (npm i playwright) and a Chromium binary — set
// CHROMIUM_PATH if yours is elsewhere. Start the game first (node server.mjs),
// then: node tools/smoke_workbench.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage({ acceptDownloads: true });
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
async function until(fn, arg, timeout = 60000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return true;
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(100);
  }
}

await page.goto(`${BASE}/workbench/?char=maki`, { waitUntil: "domcontentloaded" });
await until(() => document.querySelector("#charSel")?.value === "maki");
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);

// The working view, and a pose in it.
await page.selectOption("#viewSel", "unedited");
await page.waitForTimeout(250);
const before = await page.evaluate(() =>
  [...document.querySelectorAll("#poseList button")].map((b) => b.textContent));
check(before.length > 1, "the work list has poses to work on", `${before.length} shown`);
const target = before[1];
await page.evaluate((t) => [...document.querySelectorAll("#poseList button")]
  .find((b) => b.textContent === t).click(), target);
await page.waitForTimeout(200);

// Flag it as needing new art, with a reason.
await page.check("#replaceBox");
await page.waitForTimeout(150);
const kinds = await page.evaluate(() =>
  [...document.querySelectorAll("#replaceKind option")].map((o) => o.value).filter(Boolean));
if (kinds.includes("crop")) await page.selectOption("#replaceKind", "crop");
await page.waitForTimeout(250);

const after = await page.evaluate((t) => {
  const btns = [...document.querySelectorAll("#poseList button")];
  const el = btns.find((b) => b.textContent === t);
  return {
    present: !!el,
    dirty: !!el?.classList.contains("dirty"),
    flagged: !!el?.classList.contains("flagged"),
    count: btns.length,
    dirtyCount: document.getElementById("dirtyCount").textContent,
  };
}, target);

check(after.present, `flagging "${target}" leaves it in the work list`,
  `list went ${before.length} -> ${after.count}`);
check(after.dirty, "the yellow dot appears on it");
check(after.flagged, "it is also marked as flagged for redraw");
check(!/none/i.test(after.dirtyCount), "the change count sees it", JSON.stringify(after.dirtyCount));

// Export must emit it — the original symptom was "no changes yet".
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
  page.click("#exportBtn"),
]);
const text = await page.inputValue("#exportOut");
check(!/no changes yet/.test(text), "Export does not claim there are no changes");
check(!!download, "Export downloads a file", download ? download.suggestedFilename() : "no download");
let payload = null;
try { payload = JSON.parse(text); } catch { /* reported below */ }
check(payload?.adjustments?.[target]?.needsReplacement !== undefined,
  "the exported JSON carries the replacement flag",
  JSON.stringify(payload?.adjustments?.[target] ?? text.slice(0, 60)));

// An edit hidden by the current filter must still export. Switch to a view the
// flagged pose is absent from and confirm it survives.
await page.selectOption("#viewSel", "edited");
await page.waitForTimeout(250);
const hidden = await page.evaluate((t) =>
  ![...document.querySelectorAll("#poseList button")].some((b) => b.textContent === t), target);
await page.click("#exportBtn");
await page.waitForTimeout(300);
const text2 = await page.inputValue("#exportOut");
let payload2 = null;
try { payload2 = JSON.parse(text2); } catch { /* reported below */ }
check(payload2?.adjustments?.[target]?.needsReplacement !== undefined,
  "an edit the current view hides still exports",
  hidden ? "(pose was hidden by the filter)" : "(pose was still visible — weak test)");

// Reset character must clear it too, from any view.
await page.click("#resetChar");
await page.waitForTimeout(300);
const reset = await page.evaluate(() => document.getElementById("dirtyCount").textContent);
check(/none/i.test(reset), "Reset character clears edits the view was hiding", JSON.stringify(reset));

// ---- the placement controls: a slider paired with a typeable number, no nudges
await page.selectOption("#viewSel", "unedited");
await page.waitForTimeout(250);
await page.evaluate(() => document.querySelectorAll("#poseList button")[0].click());
await page.waitForTimeout(200);
check(await page.evaluate(() => !document.querySelector("[data-scale],[data-off],[data-ground]")),
  "the +/- nudge buttons are gone");
check(await page.evaluate(() => {
  const g = [...document.querySelectorAll(".panel .group")]
    .map((el) => el.querySelector("label")?.textContent.trim() ?? "");
  const at = (re) => g.findIndex((t) => re.test(t));
  return at(/^Size/) < at(/^Anchors/) && at(/^Ground/) < at(/^Anchors/) && at(/^Horizontal/) < at(/^Anchors/);
}), "Size / Horizontal / Ground sit above Anchors");
await page.evaluate(() => {
  const n = document.getElementById("scaleNum");
  n.value = "80"; n.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(200);
check(Math.abs(await page.evaluate(() => parseFloat(document.getElementById("scaleRange").value)) - 0.8) < 0.01,
  "typing into the number box moves the slider");
await page.evaluate(() => {
  const n = document.getElementById("scaleNum");
  n.value = "not a number"; n.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(200);
check(Math.abs(await page.evaluate(() => parseFloat(document.getElementById("scaleRange").value)) - 0.8) < 0.01,
  "junk in the number box is rejected rather than applied");

// ---- arrows walk the pose GRID, and no longer nudge placement
const gridStart = await page.evaluate(() => {
  document.querySelectorAll("#poseList button")[0].click();
  return document.querySelector("#poseList button.sel")?.textContent;
});
await page.waitForTimeout(200);
const offBefore = await page.evaluate(() => parseFloat(document.getElementById("offsetRange").value));
const walk = [];
for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press(key);
  await page.waitForTimeout(160);
  walk.push(await page.evaluate(() => document.querySelector("#poseList button.sel")?.textContent));
}
check(new Set(walk).size > 1 && walk[walk.length - 1] === gridStart,
  "arrows walk the pose grid and right/down/left/up returns", `${gridStart} -> ${walk.join(" -> ")}`);
check(await page.evaluate(() => parseFloat(document.getElementById("offsetRange").value)) === offBefore,
  "arrows no longer move the sprite");

// ---- the improvement request, a separate lower-priority flag
await page.check("#improveBox");
await page.waitForTimeout(150);
await page.selectOption("#improveKind", "pose");
await page.waitForTimeout(250);
check(await page.evaluate(() => {
  const el = document.querySelector("#poseList button.sel");
  return !!el?.classList.contains("wanted") && !!el?.classList.contains("dirty");
}), "an improvement request marks the pose and raises the dot");
await page.click("#exportBtn");
await page.waitForTimeout(300);
let improved = null;
try { improved = JSON.parse(await page.inputValue("#exportOut")); } catch { /* reported below */ }
check(Object.values(improved?.adjustments ?? {}).some((v) => v.wantsImprovement === "pose"),
  "it exports as wantsImprovement, separately from needsReplacement");

// ---- a review flag belongs to the DRAWING, not to the pose
//
// A pose with variants can be pointed at a different drawing. "Fix alpha" is a
// verdict on the file that has the bad transparency in it, so it has to stay
// banked against that file: if it followed the pose instead, switching would
// hand the flag to art nobody passed it on, and the drawing that earned it
// would come back clean. Hanami is the only character with variants today.
await page.goto(`${BASE}/workbench/?char=hanami&frame=dodge_air`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
await page.waitForTimeout(400);

await page.check("#replaceBox");
await page.waitForTimeout(150);
await page.selectOption("#replaceKind", "alpha");
await page.waitForTimeout(250);

await page.locator(".pose-variant").first().click({ force: true });
await page.waitForTimeout(250);
const alt = "hanami_alt/dodge_air.png";
const offered = await page.locator(".variant-menu button", { hasText: alt }).count();
check(offered > 0, "the pose offers its other drawing", `${offered} match(es)`);
await page.locator(".variant-menu button", { hasText: alt }).first().click();
await page.waitForTimeout(1200);

await page.click("#exportBtn");
await page.waitForTimeout(300);
let swapped = null;
try { swapped = JSON.parse(await page.inputValue("#exportOut")); } catch { /* reported below */ }
const forHanami = (Array.isArray(swapped) ? swapped : [swapped])
  .find((p) => p?.character === "hanami");
const banked = Object.fromEntries(
  (forHanami?.variantPlacement?.dodge_air ?? []).map((o) => [o.file, o.needsReplacement ?? null]));
check(forHanami?.variantChoice?.dodge_air === alt,
  "the pose switched to the other drawing", JSON.stringify(forHanami?.variantChoice));
check(banked["hanami/dodge_air.png"] === "alpha",
  "the flag stays with the drawing it was passed on", JSON.stringify(banked));
check(banked[alt] === null || banked[alt] === undefined,
  "the drawing switched to does not inherit it");
check(forHanami?.adjustments?.dodge_air?.needsReplacement === undefined,
  "and it is not left behind on the pose");

check(!errors.length, "no page errors", errors.slice(0, 2).join(" | "));
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks pass");
process.exit(fails ? 1 : 0);
