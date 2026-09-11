// WHO a move picks, when there is more than one enemy to pick from.
//
// Everything in the game that acts on "the enemy" has to answer a question a
// 1v1 never asks: which one? The answers that matter are (a) location — the
// nearest body, the one in the blast radius, the one you are looking at — and
// (b) a coin flip when location genuinely cannot separate them. What is never
// an answer is `state.fighters` order, which is the slot a player took on the
// select screen: a move that resolves ties by slot hands player 2 every single
// one and player 4 none, forever, and it looks exactly like a broken move.
//
// This stands up royal-mode rows of fighters and checks the picks.
//
// Needs `playwright` and Chromium. Start the game first (node server.mjs),
// then: node tools/smoke_target_picking.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !/Failed to load resource/.test(t)) errors.push(t.slice(0, 300));
});

await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(400);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 5000 });
await page.locator(".stage-card").nth(0).click();

for (let waited = 0; ; waited += 120) {
  const ready = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 0;
  });
  if (ready) break;
  if (waited > 90000) throw new Error("match never started");
  await page.waitForTimeout(120);
}

// A royal-mode row, built by hand: the menus cannot seat four fighters in a
// headless run, and everything under test is about who is standing where.
// Foes are stripped of their AI so the row stays where it is put.
const SEAT = `
  async function seat(castKey, castX, castFacing, foeXs) {
    const { state } = await import("/src/state.js");
    const { makeFighter } = await import("/src/fighter.js");
    const ground = state.fighters[0].y;
    // Spawn i-frames are cleared on everyone: a fresh fighter carries the
    // respawn-platform invulnerability a real entrant gets, and a test that
    // left it on would measure nothing but that.
    const caster = makeFighter(1, castKey, castX, castFacing);
    caster.y = ground; caster.grounded = true; caster.team = 1;
    caster.aiState = null; caster.invuln = 0; caster.meter = 100;
    const foes = foeXs.map((x, i) => {
      const f = makeFighter(i + 2, "yuta", x, -1);
      f.y = ground; f.grounded = true; f.team = i + 2;
      f.aiState = null; f.invuln = 0;
      return f;
    });
    state.fighters = [caster, ...foes];
    state.hitboxes.length = 0;
    state.projectiles.length = 0;
    state.entities.length = 0;
    return { caster, foes, ground };
  }
`;

/** Run the real simulation for `seconds`, at a fixed step, with nobody
 *  pressing anything — so a move's own timeline plays out exactly as it would
 *  in a match, and the test does not have to race the animation frame. */
const STEP = `
  async function run(seconds) {
    const { stepWorld } = await import("/src/sim.js");
    const { blankInput } = await import("/src/input.js");
    for (let i = 0; i < Math.round(seconds * 60); i++) stepWorld(1 / 60, () => blankInput());
  }
`;

const script = (body) => page.evaluate(`(async () => { ${SEAT}\n${STEP}\n${body} })()`);

// ---------------------------------------------------------------- the picks

// Todo claps at the fighter he is LOOKING AT. The one behind him is nearer, so
// a nearest-foe pick takes it every time and the player's aim means nothing.
const clap = await script(`
  const { performSpecial } = await import("/src/specials.js");
  const picked = { behind: 0, near: 0, far: 0 };
  for (let n = 0; n < 60; n++) {
    const { caster, foes } = await seat("todo", 600, 1, [500, 800, 950]);
    caster.cooldowns.neutral = 0;
    performSpecial(caster, "neutral");
    // Whoever ended up standing where Todo was is who he swapped with.
    const hit = foes.findIndex((f) => Math.abs(f.x - 600) < 40);
    if (hit === 0) picked.behind++;
    if (hit === 1) picked.near++;
    if (hit === 2) picked.far++;
  }
  return picked;
`);
check(clap.behind === 0, "Boogie Woogie never claps at the fighter behind him",
  `behind ${clap.behind} / ahead ${clap.near + clap.far} of 60`);
check(clap.near > 0 && clap.far > 0,
  "...and spreads over the fighters it IS aimed at", `near ${clap.near} / far ${clap.far}`);

// Cashing in marks has to find the MARKED body. The unmarked fighter standing
// closer is the one a nearest-foe pick hands the move to, and the move then
// reports that no marks are set.
const hairpin = await script(`
  const { performSpecial } = await import("/src/specials.js");
  const { applyStatus } = await import("/src/combat.js");
  const { caster, foes } = await seat("nobara", 400, 1, [520, 980]);
  applyStatus("nailMark", caster, foes[1]);
  applyStatus("nailMark", caster, foes[1]);
  caster.cooldowns.side = 0;
  performSpecial(caster, "side");
  await run(0.6);
  return { near: Math.round(foes[0].damage), marked: Math.round(foes[1].damage) };
`);
check(hairpin.marked > 0 && hairpin.near === 0,
  "Hairpin detonates the nailed fighter, not the closest one",
  `marked ${hairpin.marked}% / unmarked bystander ${hairpin.near}%`);

const stars = await script(`
  const { performSpecial } = await import("/src/specials.js");
  const { applyStatus } = await import("/src/combat.js");
  const { caster, foes } = await seat("kirara", 400, 1, [520, 980]);
  applyStatus("starMark", caster, foes[1]);
  applyStatus("starMark", caster, foes[1]);
  caster.cooldowns.down = 0;
  performSpecial(caster, "down");
  await run(0.6);
  return { near: Math.round(foes[0].damage), marked: Math.round(foes[1].damage) };
`);
check(stars.marked > 0 && stars.near === 0,
  "Southern Cross cashes in the starred fighter, not the closest one",
  `marked ${stars.marked}% / unmarked bystander ${stars.near}%`);

// "A stage-wide storm that grinds everything caught in it" — the kit's own
// words, and the test for them is that all three take damage.
const tempest = await script(`
  const { performUltimate } = await import("/src/ultimates.js");
  const { caster, foes } = await seat("momo", 300, 1, [600, 800, 1000]);
  performUltimate(caster);
  await run(4.2);
  return foes.map((f) => Math.round(f.damage));
`);
check(tempest.every((d) => d > 0), "Great Tempest grinds every fighter on the stage",
  `damage ${tempest.join(" / ")}`);

// Supernova rings a POINT and detonates inward on it: everyone inside the ring
// is inside the ring.
const nova = await script(`
  const { performUltimate } = await import("/src/ultimates.js");
  const { caster, foes } = await seat("choso", 400, 1, [820, 880, 940]);
  performUltimate(caster);
  await run(3.5);
  return foes.map((f) => Math.round(f.damage));
`);
check(nova.every((d) => d > 0), "Supernova catches every body inside the ring",
  `damage ${nova.join(" / ")}`);

// A flurry is one target held through one animation. Walking a third fighter
// into the middle of somebody else's ultimate used to inherit the rest of it.
const flurry = await script(`
  const { performUltimate } = await import("/src/ultimates.js");
  const { caster, foes } = await seat("todo", 400, 1, [600, 1100]);
  performUltimate(caster);
  await run(0.5);
  foes[1].x = caster.x + 40;        // the interloper, now the nearest body
  await run(2.2);
  return { victim: Math.round(foes[0].damage), interloper: Math.round(foes[1].damage) };
`);
check(flurry.victim > 0 && flurry.interloper === 0,
  "a flurry keeps hitting the fighter it opened on",
  `victim ${flurry.victim}% / interloper ${flurry.interloper}%`);

// Genuinely equidistant foes: neither location nor anything else separates
// them, so the pick has to be a coin flip rather than the lower slot.
const ties = await script(`
  const { opponentOf } = await import("/src/combat.js");
  const { caster, foes } = await seat("gojo", 640, 1, [340, 940]);
  const seen = new Set();
  for (let n = 0; n < 80; n++) seen.add(opponentOf(caster)?.id);
  return [...seen].sort();
`);
check(ties.length === 2, "an exact tie is broken by a coin flip, not by player slot",
  `picked ${ties.join(" and ")}`);

// Two bodies inside one grab box: the hand closes on the nearer one.
const grab = await script(`
  const { beginGrab } = await import("/src/grab.js");
  const { caster, foes } = await seat("maki", 400, 1, [470, 445]);
  beginGrab(caster);
  await run(0.5);
  return { held: foes.findIndex((f) => f.grabbedBy === caster), xs: foes.map((f) => Math.round(f.x)) };
`);
check(grab.held === 1, "a grab closes on the nearest body in reach, not the lowest slot",
  `held foe at x=${grab.xs[grab.held]} (of ${grab.xs.join(", ")})`);

check(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nall good");
process.exit(failures ? 1 : 0);
