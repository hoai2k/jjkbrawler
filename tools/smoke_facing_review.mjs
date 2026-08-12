// Smoke the 3D workbench's facing review — the full-screen, one-fighter-at-a-
// time pass that produces the yaw payload.
//
// It is driven on a PHONE viewport, because that is what it is for and
// because every failure it has had so far was a layout failure: an entry
// point buried behind a panel tab, a figure eighty pixels tall, a control row
// that wrapped, a reference sprite clipped off the side of the screen. None
// of those throw; they just make the tool useless, and only a real viewport
// shows them.
//
// Needs `playwright` and Chromium; start the game first (node server.mjs),
// then: node tools/smoke_facing_review.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const PHONE = { width: 390, height: 844 };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage({
  viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${BASE}/render3d/workbench/index.html?char=gakuganji&state=idle`,
  { waitUntil: "load" });
await page.waitForTimeout(5200);

// The way in has to be reachable without opening anything first.
check(await page.isVisible("#facingReviewTop"),
  "the way in is visible on a phone without opening a panel");

await page.click("#facingReviewTop");
await page.waitForTimeout(2600);

const open = await page.evaluate(() => {
  const o = document.getElementById("facingOverlay");
  const c = document.querySelector("#facingStage canvas");
  const r = c?.getBoundingClientRect();
  const foot = document.querySelector("#facingOverlay footer").getBoundingClientRect();
  return {
    visible: !o.hidden,
    borrowedCanvas: !!c,
    canvasH: r ? Math.round(r.height) : 0,
    stageH: Math.round(document.getElementById("facingStage").getBoundingClientRect().height),
    footTop: Math.round(foot.top),
    winH: innerHeight,
    name: document.getElementById("facingName").textContent,
    progress: document.getElementById("facingProgress").textContent,
    yaw: document.getElementById("facingYawVal").textContent,
  };
});
check(open.visible && open.borrowedCanvas,
  "it opens full screen with the real viewer canvas moved into it");
// The figure has to be big enough to judge a three-quarter turn from a
// profile. Letterboxing a 1040x660 stage into a portrait phone by width is
// what this guards against — it left the fighter unreadably small.
check(open.canvasH > open.stageH * 0.9,
  "the viewer fills the height it is given", `${open.canvasH}px of ${open.stageH}px`);
check(/\d+ \/ \d+/.test(open.progress),
  "it says where you are in the roster", open.progress);

// Every control on one screen, none wrapped off the bottom.
const rows = await page.evaluate(() => {
  const b = [...document.querySelectorAll(".facing-nudge button")].map((e) => e.getBoundingClientRect());
  const acts = [...document.querySelectorAll(".facing-actions button")].map((e) => e.getBoundingClientRect());
  const tops = new Set(b.map((r) => Math.round(r.top)));
  return {
    nudgeRows: tops.size,
    allOnScreen: [...b, ...acts].every((r) => r.bottom <= innerHeight + 1 && r.top >= 0),
    smallestTouch: Math.min(...[...b, ...acts].map((r) => Math.min(r.width, r.height))),
  };
});
check(rows.nudgeRows === 1, "the turn buttons fit one row", `${rows.nudgeRows} row(s)`);
check(rows.allOnScreen, "every control is on screen");
check(rows.smallestTouch >= 30, "controls are thumb-sized",
  `smallest ${Math.round(rows.smallestTouch)}px`);

// Turning actually turns the rig, not just the readout.
const before = await page.evaluate(async () =>
  (await import("/render3d/src/loader.js")).getRig("gakuganji").yawOffsetDeg);
await page.click('[data-nudge="45"]');
await page.waitForTimeout(600);
const after = await page.evaluate(async () => ({
  rig: (await import("/render3d/src/loader.js")).getRig("gakuganji").yawOffsetDeg,
  shown: document.getElementById("facingYawVal").textContent,
}));
check(after.rig === (before + 45) % 360,
  "a turn button moves the RIG, not just the number",
  `${before}° -> ${after.rig}° (shown ${after.shown})`);

// Approve advances, and counts.
const advanced = await (async () => {
  const nameBefore = await page.textContent("#facingName");
  await page.click("#facingApprove");
  await page.waitForTimeout(1500);
  return {
    nameBefore,
    nameAfter: await page.textContent("#facingName"),
    progress: await page.textContent("#facingProgress"),
  };
})();
check(advanced.nameAfter !== advanced.nameBefore,
  "Approve moves on to the next fighter",
  `${advanced.nameBefore} -> ${advanced.nameAfter}`);
check(/1 approved/.test(advanced.progress), "...and counts it", advanced.progress);

// The download is the thing the whole mode exists to produce, and it has to
// be a payload `billboard_intake.mjs apply` will take without editing.
const dl = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
await page.click("#facingSave");
const download = await dl;
check(!!download, "Download JSON produces a file",
  download ? download.suggestedFilename() : "no download event");
if (download) {
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* reported below */ }
  check(payload?.kind === "render3d-workbench",
    "...in the shape `apply --backend 3d` expects", `kind ${payload?.kind}`);
  const entry = payload?.characters?.gakuganji;
  check(!!entry && Number.isFinite(entry.yawOffsetDeg),
    "...carrying the approved yaw on a full manifest entry",
    entry ? `gakuganji ${entry.yawOffsetDeg}°` : "gakuganji missing");
  check(!!entry?.model && entry?.approved === true,
    "...without dropping the rest of that character's entry");
}

// Closing puts the viewer back where it came from — a workbench left without
// its canvas is a dead page.
await page.click("#facingClose");
await page.waitForTimeout(900);
const closed = await page.evaluate(() => ({
  hidden: document.getElementById("facingOverlay").hidden,
  back: !!document.querySelector(".stage-col canvas#stage"),
}));
check(closed.hidden && closed.back, "closing restores the viewer to the desk");
check(errors.length === 0, "no page errors throughout", errors.slice(0, 2).join(" | "));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
