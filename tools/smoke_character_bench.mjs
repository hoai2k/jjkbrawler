// The character bench: does a fighter actually boot, move and act?
//
// `/workbench/?edit=character` is a bench whose whole claim is that it runs the
// GAME — the same `sim.js stepWorld`, the same `render.js draw` — rather than a
// preview of it. That claim is only worth anything if it keeps working, and it
// is the kind of thing that breaks silently: the page still loads, the roster
// still lists, and the fighter stands there doing nothing because a module
// moved or the input latch stopped being fed.
//
// So this drives it the way a person does: real key events through the game's
// own control map, and the fighter's own `animKey` read back as the answer. It
// is deliberately NOT reading the canvas — what a pixel looks like is the
// sprite workbench's question; this one asks whether the machine underneath is
// turning.
//
// Needs `playwright` and a Chromium binary (set CHROMIUM_PATH if yours is
// elsewhere). Start the game first (node server.mjs), then:
//   node tools/smoke_character_bench.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
function ok(pass, label, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
}

const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  // A failed fetch is reported twice — once as a response and once as a console
  // line that names no URL — so the console copy is dropped and the response
  // below is the one that counts. Anything else a page logs as an error is a
  // real error.
  const t = m.text();
  if (m.type() === "error" && !/Failed to load resource/.test(t)) errors.push(t);
});
page.on("response", (r) => {
  // `version.json` is the deploy stamp, which exists only on the published
  // build — a local server 404s it by design (src/deploystamp.js) and the
  // header falls back to "local build".
  if (r.status() === 404 && !r.url().includes("version.json")) {
    errors.push(`404 ${r.url().replace(BASE, "")}`);
  }
});

await page.goto(`${BASE}/workbench/?edit=character`, { waitUntil: "load" });
await page.waitForFunction(() => window.__bench?.state().fighters > 0, null, { timeout: 60000 });

const read = () => page.evaluate(() => window.__bench.state());
const anim = async () => (await read()).anim;

const booted = await read();
ok(booted.fighters > 0, "a fighter is standing on the stage",
   `${booted.char}, ${booted.fighters} on the board`);
ok(booted.anim === "idle", "and is idle to start", booted.anim);

// The roster list is the left half of the bench.
const listed = await page.evaluate(() => document.querySelectorAll("#rosterList li").length);
ok(listed > 20, "the roster lists the fighters", `${listed} rows`);

// --- the fighter does what a pad tells them
//
// Player 1's keyboard map is WASD to move and J/K/L/I to attack
// (src/config_controls.js). Each of these is a different code path — walking is
// fighter.js, an attack is moves.js, a special is specials.js — so they are
// checked one at a time rather than assumed from the first that works.
const ACTIONS = [
  { key: "KeyD", hold: 500, want: "run", label: "runs when the stick goes over" },
  { key: "KeyJ", hold: 90, want: "light", label: "throws a light attack" },
  // Heavy is hold-to-charge: holding it gives `charge` and the blow comes out
  // on RELEASE, so this is the one that has to let go before it reads. Both
  // halves are checked, because "the button does nothing" and "the button only
  // charges" are different breakages.
  { key: "KeyK", hold: 120, want: "charge", label: "winds up a heavy" },
  { key: "KeyK", hold: 120, want: "sideHeavy", label: "throws the heavy on release",
    after: 90 },
  { key: "KeyW", hold: 160, want: "jump", label: "jumps" },
  { key: "KeyL", hold: 120, want: "specialNeutral", label: "casts a special" },
];
for (const a of ACTIONS) {
  await page.keyboard.down(a.key);
  await page.waitForTimeout(a.hold);
  // `after` reads the pose the RELEASE produces; without it the read is of the
  // pose while the key is still down.
  if (a.after) {
    await page.keyboard.up(a.key);
    await page.waitForTimeout(a.after);
  }
  const got = await anim();
  if (!a.after) await page.keyboard.up(a.key);
  ok(got === a.want, `it ${a.label}`, `${a.key} -> ${got}`);
  // Back to the ground and out of whatever that was before the next one.
  await page.waitForTimeout(900);
}

// --- the arrow keys change fighter
const before = (await read()).char;
await page.keyboard.press("ArrowDown");
await page.waitForFunction((was) => window.__bench.state().char !== was, before, { timeout: 30000 });
await page.waitForFunction(() => window.__bench.state().fighters > 0, null, { timeout: 30000 });
const after = await read();
ok(after.char !== before, "the arrow keys walk the roster", `${before} -> ${after.char}`);
ok(after.fighters > 0, "and the new fighter loads and stands up", after.char);

// --- the smoothing switches move the flags they name
//
// These are live module bindings (src/flags.js), so a toggle has to change what
// the RENDERER sees, not just the button's colour. Reading them back through
// `smoothingState()` is reading the same binding render.js imports.
const start = (await read()).smoothing;
ok(start.xfade === true && start.com === false && start.holds === false,
   "the switches start where the game ships", JSON.stringify(start));
for (const mode of ["com", "holds", "xfade"]) {
  await page.click(`.light[data-mode="${mode}"]`);
  const now = (await read()).smoothing;
  ok(now[mode] !== start[mode], `the ${mode} switch moves its flag`,
     `${start[mode]} -> ${now[mode]}`);
  const lit = await page.evaluate(
    (m) => document.querySelector(`.light[data-mode="${m}"]`).classList.contains("is-on"), mode);
  ok(lit === now[mode], `and its light agrees`, `light ${lit ? "on" : "off"}`);
}
const anyOn = await page.evaluate(() => document.getElementById("lights").classList.contains("is-live"));
ok(anyOn, "the indicator reads as live while anything is on");

ok(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
