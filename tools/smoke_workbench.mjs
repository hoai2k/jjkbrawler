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

check(!errors.length, "no page errors", errors.slice(0, 2).join(" | "));
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks pass");
process.exit(fails ? 1 : 0);
