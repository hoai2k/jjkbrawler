// Every shared drawing the game can spawn can be SEEN before it is placed.
//
//   node tools/check_effect_previews.mjs            # starts its own server
//   node tools/check_effect_previews.mjs http://127.0.0.1:5174
//
// WHY THIS EXISTS
//
// The Other Sprites panel sizes and nudges a drawing against numbers, and its
// "Play it in action" button is the only place the drawing is shown doing what
// the game makes it do. Placing art without that is guesswork — "I don't know
// how to size it" is the exact report that produced this file.
//
// The button appears when `firingUse` (sprites/workbench/effect_preview.js)
// finds the move that spawns the drawing, and it finds it by walking tables of
// spawn SHAPES: one entry per special type, per ultimate director, per creature
// behaviour. Which means a new KIND of move silently costs the drawings it
// spawns their preview — five had accumulated that way before anyone noticed
// (a boomerang, a massDrive ultimate, a domain backdrop added after the list of
// backdrops was written, and a creature's own projectile). There is no error
// and no warning. There is a button that is not there.
//
// TWO QUESTIONS, BECAUSE THE FIRST ONE IS NOT ENOUGH
//
//   1. is there an action?   `firingUse` resolves the drawing to a move.
//   2. does anything appear?  the action, played end to end, actually puts the
//      drawing on the canvas at least once.
//
// The second is what a person means by "it has no preview". An action that
// resolves and paints nothing — art that never loaded, a director whose sprite
// is never reached, a shot already off the canvas by its first frame — is
// indistinguishable from a missing button, and only the second question sees
// it.
//
// WHAT IS EXEMPT, AND WHY IT IS NOT A LIST
//
//   * a drawing nothing draws: a stand-in behind a creature whose own plates
//     have landed is never reached (summons.js draws the first that loaded), so
//     having no action is the correct answer for it. Read off the workbench's
//     usage index, which already marks those uses dead, rather than named here
//     where it would go stale.
//   * a drawing with no art on disk: it has nothing to show and the request
//     docs already track it. Nothing to place either, so nothing is lost.
//
// A red run means one of two things, and neither is fixed by editing this file:
// either the drawing needs its spawn shape adding to the preview's tables, or
// the art is missing.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const given = process.argv.find((a) => a.startsWith("http"));

/** Is something already serving? Reuse it — a second server on the same port
 *  just fails, and a developer with the game open should not have to close it. */
async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}

let server = null;
let BASE = given || "http://127.0.0.1:5174";
if (!(await reachable(BASE))) {
  if (given) {
    console.error(`nothing is serving ${BASE}`);
    process.exit(1);
  }
  server = spawn("node", ["server.mjs"], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 40 && !(await reachable(BASE)); i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!(await reachable(BASE))) {
    server.kill();
    console.error("could not start server.mjs");
    process.exit(1);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
const finish = async (code) => {
  await browser.close();
  server?.kill();
  process.exit(code);
};

await page.goto(`${BASE}/sprites/workbench/?char=maki`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => /assets loaded/.test(document.getElementById("loadState")?.textContent || ""),
  null, { timeout: 180000 });

// Every shared drawing any kit names, with the fighter whose list it belongs to
// — `firingUse` prefers that fighter, the same way the panel does, because a
// drawing two kits throw has no single answer to "who throws it".
const wanted = await page.evaluate(async () => {
  const ch = await import("/src/characters.js");
  const keys = new Set();
  const owners = {};
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    for (const value of Object.values(node)) {
      if (typeof value === "string" && /^(effect|summon|domain|stagefx):/.test(value)) keys.add(value);
      else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" && /^(effect|summon):/.test(item)) keys.add(item);
          else walk(item);
        }
      } else walk(value);
    }
  };
  for (const key of ch.CHARACTER_KEYS) {
    const before = new Set(keys);
    const c = ch.CHARACTERS[key];
    walk(c.specials); walk(c.ultimate); walk(c.domains);
    for (const k of keys) if (!before.has(k)) owners[k] = key;
  }
  return [...keys].sort().map((key) => [key, owners[key]]);
});

const SAMPLES = 12;
const noAction = [];
const noPixels = [];
const noArt = [];
let played = 0;

for (const [key, owner] of wanted) {
  const verdict = await page.evaluate(async ([frame, char, samples]) => {
    const wb = window.__spriteWorkbench;
    const usage = wb.sharedUsage()[frame] || [];
    // Nothing draws it: a retired stand-in. Correct to have no action.
    if (usage.length && usage.every((u) => u.dead)) return "dead";

    // FETCH THE ART FIRST. Selecting a drawing in the panel is what normally
    // loads it, and this never touches the panel — so without this the drawing
    // is missing from `images` for the honest reason that nobody asked for it,
    // and every preview would be reported as painting nothing. The return says
    // whether there is a file at all, which is the one case that is nobody's
    // bug: art that has not been delivered has nothing to show and is already
    // tracked as an open request.
    const assets = await import("/src/assets.js");
    const onDisk = await assets.loadSharedImage(frame);

    const preview = wb.effectPreview;
    if (!preview.open(frame, char)) return "no action";
    preview.hold(true);
    const tick = () => new Promise((r) => requestAnimationFrame(() => r()));
    let seen = false;
    for (let i = 0; i <= samples; i++) {
      preview.at = i / samples;
      preview.clearDrew();
      await tick();
      await tick();               // one to advance the clock, one to paint it
      if (preview.drew) { seen = true; break; }
    }
    preview.hold(false);
    preview.close();
    // A creature is drawn from its own POSE plates and its base key can be a
    // name rather than a picture (summons.js, canonicalImage), so "no file
    // under this key" does not mean "no art" for one — the preview resolves
    // that itself, and if it still painted nothing that is a real gap.
    const creature = preview.use?.mode === "summon";
    return seen ? "ok" : (onDisk || creature ? "no pixels" : "no art");
  }, [key, owner, SAMPLES]);

  if (verdict === "dead") continue;
  if (verdict === "ok") { played++; continue; }
  if (verdict === "no action") noAction.push(key);
  else if (verdict === "no art") noArt.push(key);
  else noPixels.push(key);
}

for (const key of noArt) console.log(`  --   ${key}: no art on disk yet — nothing to show, nothing to place`);

if (noAction.length || noPixels.length) {
  for (const key of noAction) {
    console.error(`  FAIL ${key}: no move fires it — add its spawn shape to`
      + " sprites/workbench/effect_preview.js");
  }
  for (const key of noPixels) {
    console.error(`  FAIL ${key}: has an action, but nothing is painted anywhere in the loop`);
  }
  console.error(`\n${noAction.length + noPixels.length} drawing(s) cannot be previewed.`);
  await finish(1);
}

console.log(`effect previews ok — ${played} drawing(s) play, ${noArt.length} awaiting art`);
await finish(0);
