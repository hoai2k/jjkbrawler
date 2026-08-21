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
ok(start.xfade === true && start.stride === true,
   "the switches start where the game ships — both on now", JSON.stringify(start));
// The COM alignment is no longer among them: it is the fade's, not its own,
// and `setSmoothing` turns it on with the fade (src/flags.js). What is left is
// the fade itself and the stride bake.
for (const mode of ["stride", "xfade"]) {
  await page.click(`.light[data-mode="${mode}"]`);
  const now = (await read()).smoothing;
  ok(now[mode] !== start[mode], `the ${mode} switch moves its flag`,
     `${start[mode]} -> ${now[mode]}`);
  const lit = await page.evaluate(
    (m) => document.querySelector(`.light[data-mode="${m}"]`).classList.contains("is-on"), mode);
  ok(lit === now[mode], `and its light agrees`, `light ${lit ? "on" : "off"}`);
}
// The loop above left every switch flipped from where it started, and both
// start ON now — so the honest assertion is that the indicator AGREES with the
// flags, not that it is lit. Asserting "lit" only worked while the defaults
// happened to be off.
const live = await page.evaluate(() => ({
  lit: document.getElementById("lights").classList.contains("is-live"),
  any: Object.values(window.__bench.state().smoothing).some(Boolean),
}));
ok(live.lit === live.any, "the indicator agrees with the switches",
   `lit ${live.lit}, anything on ${live.any}`);

// --- the presentation is stepped, and the effect art is loaded
//
// Both of these shipped broken in the bench's first version and both looked
// like a renderer bug from the outside.
//
// The world was stepped and the PRESENTATION was not, so nothing the fight
// threw off ever expired: sparks, damage numbers and a "KO!" banner stayed
// frozen exactly where they were drawn, for the life of the page. The frame is
// `sim.js advanceWorld` now — shared with the game, so the bench cannot leave a
// piece of it out — and this is the assertion that says so out loud.
// The switches above are BUTTONS, and clicking one leaves the focus on it —
// so a key pressed next goes to a control rather than to the fighter. The
// viewer has to be handed the keyboard back first, exactly as the header tells
// a human to do.
await page.evaluate(() => document.querySelector("canvas")?.focus());
await page.keyboard.press("KeyL");
await page.waitForTimeout(400);
const cast = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  return state.fighters[0].animKey;
});
ok(cast === "specialNeutral", "the viewer takes the keyboard and throws a special", cast);

// AND THE PARTICLES ARE ASKED FOR DIRECTLY, because what is being tested is
// that they EXPIRE — that the bench steps the presentation and not just the
// world. Reading them off whatever special the roster walk happened to land on
// tested a character's kit instead: Yuki's neutral throws none at all, which
// read as a frozen presentation when nothing was frozen.
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { burst } = await import("/src/particles.js");
  const f = state.fighters[0];
  burst(f.x, f.y - 60, "#ffffff", 24);
});
const busy = await read();
ok(busy.particles > 0, "particles land on the stage", `${busy.particles} alive`);
// Long enough for anything a special throws to live out its life.
await page.waitForTimeout(4000);
const settled = await read();
ok(settled.particles === 0, "and they expire instead of piling up",
   `${busy.particles} -> ${settled.particles}`);
ok(settled.banners === 0, "no banner is left hanging", `${settled.banners} on screen`);

// `ensureMatchAssets` gates on the fighter and the stage only, so the shared
// group — every technique's art — has to be asked for separately. Without it a
// special draws the procedural white circle it falls back to.
await page.waitForFunction(() => window.__bench.state().sharedArt, null, { timeout: 90000 })
  .catch(() => {});
ok((await read()).sharedArt, "the shared effect art loads, so specials are not white circles");

// --- the lights say WORKING, not just armed
//
// Three states, and the third is the one worth having: dark off, yellow armed,
// green doing something to the frame in front of you. A fade lasts 0.08s at a
// state change and nothing at all in between, so a lamp that is lit whenever
// the switch is on describes nothing. Green is painted off render.js's own
// `smoothingActivity` — what the renderer just did — so it cannot claim
// something the picture did not do.
await page.evaluate(() => window.__bench.setSpeed(0.1));
const green = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { setSmoothing } = await import("/src/flags.js");
  // The loop above left the switches wherever its last toggle put them, and a
  // fade that is switched off cannot light anything.
  setSmoothing({ stride: true, xfade: true });
  const seen = {};
  const a = state.fighters[0];
  for (let i = 0; i < 240; i++) {
    if (i === 40) { a.animKey = "specialNeutral"; a.animTime = 0; a.prevAnim = { key: "idle", t: 0.3 }; }
    await new Promise((r) => requestAnimationFrame(r));
    for (const el of document.querySelectorAll(".light.is-working")) seen[el.dataset.mode] = true;
  }
  return seen;
});
ok(green.xfade || green.stride,
   "a fade lights its own lamp while it is running", Object.keys(green).join(", "));

// --- the speed control slows the SIMULATION
//
// Not the frame rate, and not the step: scaling FIXED_DT would change what the
// game computes — every timer, every ramp, the fade windows themselves — and a
// bench that shows a different game at 0.1x is worse than no bench. So the
// measure is steps per real second, which should fall with the slider.
const rate = async (v) => await page.evaluate(async (speed) => {
  window.__bench.setSpeed(speed);
  await new Promise((r) => setTimeout(r, 250));
  const s0 = window.__bench.state().steps, w0 = performance.now();
  await new Promise((r) => setTimeout(r, 1000));
  return (window.__bench.state().steps - s0) / ((performance.now() - w0) / 1000);
}, v);
const fullRate = await rate(1);
const slowRate = await rate(0.1);
ok(slowRate < fullRate * 0.35,
   "the speed slider slows the simulation rather than the frame rate",
   `${fullRate.toFixed(0)} steps/s at 1x against ${slowRate.toFixed(1)} at 0.1x`);
await page.evaluate(() => window.__bench.setSpeed(1));

ok(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
