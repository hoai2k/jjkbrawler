// HOW FAR DOES A DASH ATTACK CARRY YOU?
//
// A dash attack is the one move whose distance is not authored anywhere: it is
// the run you already had, plus a lunge, minus whatever drag the action
// applies, over however long the move lasts. Four numbers in three files, and
// the product of them is a thing a player feels immediately and nobody can
// read off a config.
//
// So this measures it. Every fighter is run up to speed through the game's own
// `updateFighter`, fires the dash attack on the next frame with the stick
// released, and is followed until they stop — the light and the heavy — and the
// distance is reported in PIXELS, in BODY HEIGHTS, and as a fraction of the
// main platform.
//
// WHY BODY HEIGHTS. It is the number the eye actually judges: "that fighter
// slid two of himself" is a thing you can see, and 300px is not. It is also
// what makes a comparison with another game possible. In Smash Ultimate a
// dash attack coasts on run speed against the character's own traction —
// Mario's 1.76 u/f against 0.102 u/f² is 15.2 units of slide, about one body
// height and about 10% of a 160-unit stage. Ours were measured at 2.15 and
// 3.04 heights before the drag was split out of the specials' number
// (constants.js DASH_LUNGE_DRAG), and about 1.4 / 2.0 after.
//
// The platform fraction is the other half of the story and it is worth
// keeping in view: our main platform is around 5.5 body heights wide where
// Battlefield is around 11, so the same slide in body heights costs twice as
// much stage here.
//
// Needs `playwright` and a Chromium binary (set CHROMIUM_PATH if yours is
// elsewhere). Start the game first (node server.mjs), then:
//   node tools/audit_dash_slide.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const PLATFORM_W = 780;   // the shibuya main platform, the bench's own stage

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/workbench/?edit=character`, { waitUntil: "load" });
await page.waitForFunction(() => window.__bench?.state().fighters > 0, null, { timeout: 60000 });

const rows = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter, makeFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");
  const { bodyMetrics } = await import("/src/silhouette.js");
  const DT = 1 / 60;
  const out = [];
  for (const key of CHARACTER_KEYS) {
    for (const heavy of [false, true]) {
      const f = makeFighter(99, key, 400, 1);
      f.grounded = true;
      f.y = state.fighters[0].y;
      f.vy = 0;
      // Up to speed the way a player gets there, holding the stick.
      const held = { ...blankInput(), dirX: 1, moveX: 1, right: true };
      for (let i = 0; i < 40; i++) updateFighter(f, DT, held);
      // Back to the middle of the platform before the swing, so a long lunge
      // measures a lunge rather than the distance to the nearest ledge.
      f.x = state.fighters[0].x;
      f.y = state.fighters[0].y;
      f.grounded = true;
      f.vy = 0;
      const runV = f.vx;
      const x0 = f.x;
      updateFighter(f, DT, { ...held, lightP: !heavy, heavyP: heavy, heavyHeld: heavy });
      const anim = f.animKey;
      let frames = 1, peak = Math.abs(f.vx), leftGround = false;
      while (f.action && frames < 240) {
        updateFighter(f, DT, blankInput());
        frames++;
        peak = Math.max(peak, Math.abs(f.vx));
        if (!f.grounded) leftGround = true;
      }
      const during = f.x - x0;
      // ...and whatever is left once the move releases, until they stop.
      let after = 0;
      while (Math.abs(f.vx) > 1 && after < 240) { updateFighter(f, DT, blankInput()); after++; }
      const b = bodyMetrics(key);
      out.push({
        key, heavy, anim, leftGround,
        runV: Math.round(runV), peak: Math.round(peak),
        px: Math.round(f.x - x0), during: Math.round(during),
        frames, height: Math.round(b.height),
        heights: +((f.x - x0) / b.height).toFixed(2),
      });
    }
  }
  return out;
});
await browser.close();

const band = (sel) => {
  const v = rows.filter(sel).sort((a, b) => a.heights - b.heights);
  const at = (i) => v[Math.min(v.length - 1, Math.max(0, i))];
  return { lo: at(0), mid: at(Math.floor(v.length / 2)), hi: at(v.length - 1) };
};

for (const [label, sel] of [["light", (r) => !r.heavy], ["heavy", (r) => r.heavy]]) {
  const b = band(sel);
  console.log(`\n${label} dash attack`);
  for (const [what, r] of [["shortest", b.lo], ["median  ", b.mid], ["longest ", b.hi]]) {
    console.log(`  ${what}  ${r.key.padEnd(12)} ${String(r.px).padStart(4)}px `
      + `= ${r.heights.toFixed(2)} heights, ${(r.px / PLATFORM_W * 100).toFixed(0)}% of the platform `
      + `(run ${r.runV} -> peak ${r.peak} px/s over ${r.frames} frames)`);
  }
}

const wrong = rows.filter((r) => !/^dashAttack/.test(r.anim) || r.leftGround);
if (wrong.length) {
  console.log(`\n! ${wrong.length} sample(s) did not measure a grounded dash attack: `
    + wrong.slice(0, 4).map((r) => `${r.key}${r.heavy ? " heavy" : ""} (${r.anim}`
      + `${r.leftGround ? ", airborne" : ""})`).join(", "));
}
if (errors.length) console.log(`\n! page errors: ${errors.slice(0, 3).join(" | ")}`);
console.log(`\n${rows.length} samples. Smash Ultimate, for scale: ~1 body height, ~10% of the stage.`);
process.exit(wrong.length || errors.length ? 1 : 0);
