// A shot has to be able to hit ANY of the fighters in front of it.
//
// Royal modes put three and four fighters on the stage (src/modes.js), and for
// as long as they have, every projectile in the game resolved its collision
// against ONE fighter: `state.fighters.find(isFoe)`, which is the first foe in
// the list and therefore always player 2. Gojo's Blue, Red and Purple — and
// every other shot — passed through players 3 and 4 as if they were scenery,
// and Blue's gravity well only ever pulled on player 2.
//
// It is a bug the static audits cannot see (the numbers are all correct) and a
// 1v1 cannot reach, so this stands up a four-way free-for-all in a real match
// and fires real kit at the far end of it.
//
// Needs `playwright` and Chromium. Start the game first (node server.mjs),
// then: node tools/smoke_multi_target.mjs [baseUrl]
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

/** Re-seat the live match as a four-way free-for-all: Gojo on the left and
 *  three foes standing in a row to his right, each on a side of their own.
 *  Everything downstream is the real simulation — this only decides who is on
 *  the stage, which no menu in a headless run can. */
async function seatFourWay() {
  return page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { makeFighter } = await import("/src/fighter.js");
    const owner = state.fighters[0];
    owner.x = 200;
    owner.facing = 1;
    owner.team = 1;
    owner.damage = 0;
    const foes = [2, 3, 4].map((id, i) => {
      const f = makeFighter(id, "yuta", 460 + i * 220, -1);
      f.y = owner.y;
      f.grounded = true;
      f.team = id;
      f.cpu = null;
      return f;
    });
    state.fighters = [owner, ...foes];
    state.hitboxes.length = 0;
    state.projectiles.length = 0;
    return state.fighters.map((f) => f.x);
  });
}

/** Fire one shot from Gojo's own kit and run the projectile layer over it by
 *  hand, so the result is about collision rather than about CPU behaviour. */
async function fire(slot, patch = {}) {
  return page.evaluate(async ([slot, patch]) => {
    const { state } = await import("/src/state.js");
    const { spawnProjectileScaled, updateProjectiles } = await import("/src/combat.js");
    const owner = state.fighters[0];
    const kit = owner.char.specials[slot].p;
    state.fighters.forEach((f, i) => {
      f.x = i === 0 ? 200 : 240 + i * 180;
      f.damage = 0; f.hitstun = 0; f.invuln = 0; f.vx = 0; f.vy = 0;
      f.hitPause = 0; f.shielding = false;
    });
    const before = state.fighters.slice(1).map((f) => f.x);
    spawnProjectileScaled(owner, { ...kit, ...patch, dir: 1 });
    // Long enough for a shot to cross the row, at the simulation's own step.
    // Hitlag is drained by hand because this drives the projectile layer alone:
    // a shot freezes with its owner's hitPause (updateProjectiles), and nothing
    // here is running the fighter update that would count it down.
    for (let i = 0; i < 240 && state.projectiles.length; i++) {
      for (const f of state.fighters) f.hitPause = 0;
      updateProjectiles(1 / 60);
    }
    return {
      damage: state.fighters.slice(1).map((f) => Math.round(f.damage * 10) / 10),
      drift: state.fighters.slice(1).map((f, i) => Math.round(f.x - before[i])),
      // Speed, not position: only the projectile layer is stepped here, and a
      // fighter's x is moved by the fighter update. What a gravity well does to
      // a body is push on its velocity, so that is what the pull is read from.
      vx: state.fighters.slice(1).map((f) => Math.round(f.vx)),
    };
  }, [slot, patch]);
}

const xs = await seatFourWay();
check(xs.length === 4, "four fighters on the stage", xs.join(" / "));

// Red pierces, so one shot should reach all three bodies in the row. Before
// the fix this damaged fighter 2 and nothing else, no matter how long it flew.
const red = await fire("side");
check(red.damage.every((d) => d > 0),
  "Red damages every fighter it passes through", `damage ${red.damage.join(" / ")}`);

// Blue does not pierce — it should hit the FIRST body it reaches and stop. The
// point here is the second half: its gravity well pulls on everyone in range,
// which is what "a core of attraction" means with four fighters on the stage.
const blue = await fire("neutral", { pull: 900, dur: 2.4, speed: 120 });
check(blue.damage[0] > 0, "Blue lands on the nearest fighter", `damage ${blue.damage.join(" / ")}`);
check(blue.vx.slice(1).every((v) => v < 0),
  "Blue's well pulls on the fighters past the first one", `vx ${blue.vx.join(" / ")}`);

// Hollow Purple is a piercing projectile too (ultimates.js beam), so the same
// fix is what lets an ultimate cross a royal match.
const purple = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { spawnProjectileScaled, updateProjectiles } = await import("/src/combat.js");
  const owner = state.fighters[0];
  const p = owner.char.ultimate.p;
  state.fighters.forEach((f, i) => {
    f.x = i === 0 ? 200 : 240 + i * 180;
    f.damage = 0; f.hitstun = 0; f.invuln = 0; f.vx = 0; f.vy = 0; f.hitPause = 0;
  });
  spawnProjectileScaled(owner, {
    speed: 860, r: p.width / 2, dur: p.duration, dmg: p.dmg, base: p.base,
    growth: p.growth, angle: 0.4, color: p.color, pierce: true, unblockable: true,
    label: "Hollow Purple", dir: 1,
  });
  for (let i = 0; i < 240 && state.projectiles.length; i++) {
    for (const f of state.fighters) f.hitPause = 0;
    updateProjectiles(1 / 60);
  }
  return state.fighters.slice(1).map((f) => Math.round(f.damage * 10) / 10);
});
check(purple.every((d) => d > 0), "Hollow Purple erases the whole row", `damage ${purple.join(" / ")}`);

check(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nall good");
process.exit(failures ? 1 : 0);
