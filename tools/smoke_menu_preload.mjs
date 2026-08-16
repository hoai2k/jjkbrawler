// Is the next screen's art already in hand when the player gets there?
//
// The menus are HTML, so their pictures are fetched when their element renders,
// which is the moment the screen opens — in front of the player. The arena grid
// was the visible case: twenty cards each holding a 3200x1800, 2.4 MB match
// backdrop behind `loading="lazy"`, so the grid filled in one card at a time
// while the player watched. Two changes answer it, and this checks both:
// menu-sized copies (tools/make_thumbnails.py) and an idle warmer that asks for
// the next screen's art a screen early (src/menu_art.js).
//
// The speculative fetches are checked too — the board Random has drawn, and a
// board the cursor is resting on — because those are the two full backdrops the
// game can know about before it is asked for them.
//
// Usage: node tools/smoke_menu_preload.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
const check = (ok, msg, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));

// Which screen was up when each image request went out. This is the whole
// point of the exercise — the same files, asked for a screen earlier.
let phase = "boot";
const asked = [];
page.on("request", (r) => {
  const u = r.url();
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)) asked.push({ phase, url: u.split("?")[0] });
});

await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(300);
phase = "title";
await page.waitForTimeout(3000);        // a player reading the title screen
const beforeSelect = asked.length;
await pressStart(page);
phase = "menu";
await page.waitForTimeout(3000);

const stageAskedEarly = asked.filter((a) => a.url.includes("/backgrounds/thumbs/")
  && a.phase !== "stageSelect").length;
check(stageAskedEarly > 0,
  "arena art is asked for before the arena screen opens",
  `${stageAskedEarly} thumbnail(s) requested on earlier screens`);

// The board Random has already drawn: its full backdrop should be arriving (or
// arrived) without anyone having pressed Random.
// Tolerant of the export not being there at all: a guard should report a
// missing feature as a failed check, not crash and take the checks after it
// down with it.
const drawn = await page.evaluate(async () => {
  const ui = await import("/src/ui.js");
  return typeof ui.nextRandomStage === "function" ? ui.nextRandomStage() : null;
});
check(!!drawn, "Random has drawn its board in advance", `${drawn}`);

await page.click('[data-character="gojo"]');
await page.waitForTimeout(400);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 20000 });
phase = "stageSelect";

// THE CHECK THIS FILE EXISTS FOR. Measured immediately, with no settle: the
// question is whether the grid is ready when it opens, not whether it gets
// there a second later.
const grid = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll(".stage-card img")];
  return {
    cards: imgs.length,
    ready: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    thumbs: imgs.filter((i) => (i.currentSrc || i.src).includes("/thumbs/")).length,
    // Every card against its own file: a thumbnail smaller than the box it is
    // painted into is a soft card, which is the failure mode of overdoing this.
    tooSmall: imgs.filter((i) => i.naturalWidth
      && i.naturalWidth < Math.ceil(i.getBoundingClientRect().width)).length,
    box: imgs[0] ? Math.round(imgs[0].getBoundingClientRect().width) : 0,
    natural: imgs[0] ? `${imgs[0].naturalWidth}x${imgs[0].naturalHeight}` : "",
  };
});
check(grid.cards > 0 && grid.ready === grid.cards,
  "every arena card is drawn the moment the screen opens",
  `${grid.ready}/${grid.cards} loaded`);
check(grid.cards > 0 && grid.thumbs === grid.cards,
  "...from menu-sized copies, not the match backdrops",
  `${grid.thumbs}/${grid.cards} on thumbnails, first is ${grid.natural} in a ${grid.box}px box`);
check(grid.tooSmall === 0,
  "...and no card is fed a file smaller than the box it fills",
  `${grid.tooSmall} undersized`);

// A board the cursor rests on is one the player is considering: its full
// backdrop should start arriving without a click.
const dwell = await page.evaluate(async () => {
  const { images } = await import("/src/assets.js");
  const cards = [...document.querySelectorAll(".stage-card")];
  // Somebody Random did not already draw, so this measures the dwell and not
  // the draw.
  const ui = await import("/src/ui.js");
  const skip = typeof ui.nextRandomStage === "function" ? ui.nextRandomStage() : null;
  const card = cards.find((c) => c.dataset.stage !== skip) || cards[0];
  const before = images.has(`bg:${card.dataset.stage}`);
  card.dispatchEvent(new MouseEvent("mouseenter"));
  return { key: card.dataset.stage, before };
});
// POLLED, not waited out. A backdrop is ~2.4 MB and the loader is deliberately
// one board at a time behind whatever else is queued, so a fixed sleep races
// the download — this check failed about one run in three on a machine that was
// otherwise fine, which is worse than no check at all. What is being asserted
// is that the fetch STARTS, so waiting longer for a slow one costs nothing and
// a genuine failure still takes the full timeout and then fails.
let dwellLanded = false;
for (let waited = 0; waited < 25000 && !dwellLanded; waited += 400) {
  await page.waitForTimeout(400);
  dwellLanded = await page.evaluate(async (key) => {
    const { images } = await import("/src/assets.js");
    return images.has(`bg:${key}`);
  }, dwell.key);
}
check(!dwell.before && dwellLanded,
  "dwelling on an arena starts fetching its full backdrop",
  `${dwell.key}: in memory before=${dwell.before} after=${dwellLanded}`);

const drawnLanded = drawn && await page.evaluate(async (key) => {
  const { images } = await import("/src/assets.js");
  return images.has(`bg:${key}`);
}, drawn);
check(drawnLanded,
  "...and the board Random drew is fetched before Random is pressed",
  `${drawn} in memory=${drawnLanded}`);

console.log(`\n(${beforeSelect} image requests had gone out before the roster opened)`);
await page.close();
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall menu preload checks passed");
process.exit(failed ? 1 : 0);
