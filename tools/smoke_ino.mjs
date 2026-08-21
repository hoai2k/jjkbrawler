// Smoke-test Takuma Ino's OWN mechanics — the four things his kit claims that
// nothing else in the game does, checked in a real match rather than read off
// the source.
//
//   * the mask comes off on a shield break, and Auspicious Beasts Summon stops
//   * the mask's damage bonus is gone while it is off, and back when it returns
//   * Kirin cannot be staggered, bills him for the ride, and leaves him snared
//   * Ryu re-arms and hits the same body several times as it coils past
//   * Kaichi keeps turning toward a target that is not in front of him
//
// He is STAGED (no art), so this borrows smoke_staged.mjs's trick: swap the
// simulation half of a delivered fighter over to his kit and leave `charKey`
// pointing at art that exists.
//
//   node server.mjs & node tools/smoke_ino.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });

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
    return state.phase === "playing" && state.fighters.length > 1;
  });
  if (ready) break;
  if (waited > 90000) throw new Error("match never started");
  await page.waitForTimeout(120);
}

// Nobody swings but this script, and nobody runs out of stocks mid-sweep.
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  for (const f of state.fighters) { f.aiState = null; f.stocks = 99; }
});

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

/** Put Ino's kit on fighter 0 and reset him to a clean, neutral state. */
const asIno = async () => page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { CHARACTERS } = await import("/src/characters.js");
  const { METER_MAX } = await import("/src/constants.js");
  const f = state.fighters[0], o = state.fighters[1];
  f.char = { ...CHARACTERS.ino, key: f.charKey };
  f.cooldowns = { neutral: 0, side: 0, down: 0 };
  f.meter = METER_MAX; f.action = null; f.installs = null;
  f.statuses.silence = 0; f.statuses.snare = 0;
  f.damage = 0; f.shield = 100; f.dizzy = 0; f.hitstun = 0;
  o.damage = 0; o.hitstun = 0; o.invuln = 0; o.shield = 100;
});

// --------------------------------------------- the mask, off and back on again
await asIno();
const maskOff = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { shieldBreak } = await import("/src/combat.js");
  const f = state.fighters[0];
  const before = f.statuses.silence;
  shieldBreak(f);
  return { before, after: f.statuses.silence };
});
check("a shield break tears Ino's mask off", maskOff.before === 0 && maskOff.after > 4,
  `silence ${maskOff.before} -> ${maskOff.after}`);

const sealed = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { performSpecial } = await import("/src/specials.js");
  const f = state.fighters[0];
  f.action = null; f.dizzy = 0;
  const n = state.projectiles.length;
  performSpecial(f, "neutral");
  return { fired: state.projectiles.length - n, silence: f.statuses.silence };
});
check("no beast answers while the mask is off", sealed.fired === 0,
  `${sealed.fired} projectile(s) spawned, silence ${sealed.silence.toFixed(1)}s`);

// The bonus is the same flag, so it has to move with it.
const dmg = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { applyHit } = await import("/src/combat.js");
  const f = state.fighters[0], o = state.fighters[1];
  const hit = { dmg: 10, baseKb: 200, growth: 5, angle: 0.4, sfx: null };
  const measure = () => { o.damage = 0; o.hitstun = 0; o.invuln = 0;
    applyHit(f, o, { ...hit }, "projectile"); return o.damage; };
  f.statuses.silence = 4;  const off = measure();
  f.statuses.silence = 0;  const on = measure();
  o.damage = 0;
  return { off, on };
});
check("the mask is what makes a beast hit harder", dmg.on > dmg.off,
  `masked ${dmg.on} vs unmasked ${dmg.off}`);

// ------------------------------------------------------------------ Kirin
await asIno();
const kirin = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { performSpecial } = await import("/src/specials.js");
  const f = state.fighters[0];
  performSpecial(f, "down");
  return { armor: !!f.installs?.armor, endSnare: f.installs?.endSnare,
           drain: f.installs?.selfDrainPerSec, dur: f.installs?.t, dmg0: f.damage };
});
check("Kirin stops him being staggered", kirin.armor === true, `armor=${kirin.armor}`);

// Let it run its whole length, then look at what it left behind.
await page.waitForTimeout(Math.ceil((kirin.dur + 0.5) * 1000));
const after = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const f = state.fighters[0];
  return { install: !!f.installs, snare: f.statuses.snare, damage: f.damage };
});
check("Kirin is paid for out of his own body", after.damage > kirin.dmg0,
  `self damage ${kirin.dmg0} -> ${after.damage.toFixed(1)}%`);
check("he cannot move for a moment when Kirin lifts", !after.install && after.snare > 0,
  `snare ${after.snare.toFixed(2)}s`);

// --------------------------------------------------------------------- Ryu
await asIno();
const ryu = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { performUltimate } = await import("/src/ultimates.js");
  const f = state.fighters[0], o = state.fighters[1];
  // Stand the target directly in the dragon's path and stop it being launched
  // out of it — this is a check about how many times it hits, not about kb.
  o.x = f.x + f.facing * 300; o.y = f.y; o.damage = 0; o.weight = 99;
  performUltimate(f);
  return { at: o.damage };
});
await page.waitForTimeout(2600);
const ryuHit = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const o = state.fighters[1];
  return { damage: o.damage };
});
// One 9% poke is one pass; a body going past is several.
check("Ryu coils — it hits more than once on the way through",
  ryuHit.damage > 9 * 1.5, `${ryu.at}% -> ${ryuHit.damage.toFixed(1)}%`);

// ------------------------------------------------------------------ Kaichi
await asIno();
const kaichi = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { performSpecial } = await import("/src/specials.js");
  const f = state.fighters[0], o = state.fighters[1];
  // Well above the muzzle: a shot with no homing simply never comes back down.
  o.x = f.x + f.facing * 420; o.y = f.y - 300; o.invuln = 99;
  performSpecial(f, "neutral");
  const p = state.projectiles[state.projectiles.length - 1];
  return { vy0: p.vy, label: p.label };
});
await page.waitForTimeout(400);
const kaichiNow = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const p = state.projectiles.find((q) => q.label === "Kaichi");
  return p ? { vy: p.vy } : null;
});
check("Kaichi keeps turning toward what it was aimed at",
  !!kaichiNow && kaichiNow.vy < kaichi.vy0 - 20,
  kaichiNow ? `vy ${kaichi.vy0.toFixed(0)} -> ${kaichiNow.vy.toFixed(0)} (target is above)` : "shot expired");

// --------------------------------------------------------------------- report
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  [${r.detail}]`);
const failed = results.filter((r) => !r.pass).length;
if (errors.length) { console.error("\npage errors:"); for (const e of errors) console.error("  " + e); }
console.log(`\n${results.length - failed}/${results.length} checks passed${errors.length ? `, ${errors.length} page error(s)` : ", no page errors"}`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
