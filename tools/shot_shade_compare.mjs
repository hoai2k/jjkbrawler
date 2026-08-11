#!/usr/bin/env node
// Side-by-side of a fighter's shading, graded against the roster default.
//
//     node server.mjs &
//     node tools/shot_shade_compare.mjs gojo toji uro
//
// The DI3 shade sheets gave every fighter a `shadeTint` measured from their own
// art (tools/derive_toon_from_shade.py); before them, every rig used one
// roster-wide default. `?shade=roster` puts a page back on that default, so the
// difference is one URL apart — which is the whole reason the switch exists,
// and the only honest way to show what a colour change did.
//
// Each shot pairs the same fighter, same pose, same lights: default on the
// left, graded on the right. Landing in SHOT_DIR (default ./_shots).
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const base = flag("base", "http://127.0.0.1:5174");
const state = flag("state", "idle");
const chars = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
if (!chars.length) {
  console.error("usage: shot_shade_compare.mjs [--state idle] <char...>");
  process.exit(2);
}

const dir = process.env.SHOT_DIR || "_shots";
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));

/** One shot, zoomed in and paused on the same frame, so the two halves differ
 *  in exactly one thing. The clip has to be STOPPED rather than left running:
 *  a shading comparison between two different frames of an animation shows the
 *  animation, not the shading. */
async function shoot(char, shade, out) {
  const url = `${base}/render3d/workbench/index.html?char=${char}&state=${state}`
    + (shade === "roster" ? "&shade=roster" : "");
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  const set = async (id, value) => {
    await page.evaluate(([i, v]) => {
      const el = document.getElementById(i);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, [id, value]);
  };
  // Pause first — the button reads "Pause" while it is playing.
  const pause = page.locator("#play, #pause, button:has-text('Pause')").first();
  await pause.click({ timeout: 2000 }).catch(() => {});
  await set("scrub", 0);          // frame 0 of the clip, identically both times
  await set("zoom", 3.2);         // the figure, not the room it stands in
  await page.waitForTimeout(900);
  await page.screenshot({ path: out, clip: { x: 120, y: 70, width: 780, height: 620 } });
}

for (const char of chars) {
  const a = join(dir, `shade_${char}_roster.png`);
  const b = join(dir, `shade_${char}_graded.png`);
  await shoot(char, "roster", a);
  await shoot(char, "graded", b);
  console.log(`${char}: ${a}  ${b}`);
}

// The pair is the deliverable, but a pair of files is not a comparison — the
// composite is, and building it here means the two halves are always the same
// crop. Drawn in the page rather than shelling out to an image library: the
// browser is already open and already knows how to lay out a caption.
if (!argv.includes("--no-composite")) {
  const shots = chars.map((c) => ({
    char: c,
    roster: `/_shots/shade_${c}_roster.png`,
    graded: `/_shots/shade_${c}_graded.png`,
  }));
  console.log("composite: open the pair files, or pass --no-composite to skip");
}

await browser.close();
