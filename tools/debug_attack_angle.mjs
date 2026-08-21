// WHERE DOES AN ATTACK ACTUALLY POINT WHEN THE STICK IS DIAGONAL?
//
// Reported: holding up-and-forward and attacking looks binary — straight up or
// straight along — rather than angled. The two attack buttons read the stick
// very differently, and only one of them was ever meant to angle off it:
//
//   light   a diagonal ANGLES the neutral attack (fighter.js attackTilt), so
//           up-and-forward is the side attack aimed 45 degrees up.
//   heavy   the left stick picks the VARIANT — up smash, down smash, side
//           smash — and the RIGHT stick angles a side smash on release
//           (releaseHeavy, SMASH_TILT). Binary off the left stick on purpose.
//
// So this measures the angle of the live hitbox, from the fighter's chest, for
// each button at each stick position. Numbers rather than an argument: an
// attack that is angled says so, and one that is not says that.
//
// Usage: node tools/debug_attack_angle.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));

await page.goto(`${BASE}/?camera=flat`);
await pressStart(page);
await page.click('[data-character="gojo"]');
await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 20000 });
await page.locator(".stage-card").nth(0).click();
for (let w = 0; ; w += 200) {
  const ok = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 1;
  });
  if (ok) break;
  if (w > 120000) throw new Error("match never started");
  await page.waitForTimeout(200);
}

const rows = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { hitboxRect } = await import("/src/combat.js");
  const { bodyMetrics } = await import("/src/silhouette.js");
  const { comFrac } = await import("/src/body_points.js");

  const f = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  state.fighters[1].x = -9999;
  const dt = 1 / 60;

  const clearBoxes = () => { state.hitboxes.length = 0; };
  const settle = () => Object.assign(f, {
    x: main.x + main.w / 2, y: main.y, vx: 0, vy: 0, grounded: true,
    hitstun: 0, action: null, charging: false, shielding: false, crouching: false,
    dashT: 0, walking: false, facing: 1, facingVis: 1, aimPoint: null,
    jabStep: 0, jabResetT: 0,
  });

  const key = f.spriteChar || f.charKey;
  const chestY = () => f.y - bodyMetrics(key).height * comFrac(key);

  /** THE LINE THE ATTACK IS THROWN ALONG, from the chest to the middle of the
   *  box, in degrees above horizontal.
   *
   *  From the CHEST because that is where a swing comes from — measuring from
   *  the fighter's origin, which is between their feet, tilts every attack
   *  upward by however tall they are. And to the box's MIDDLE because `oy` is
   *  its top edge: reading `ox`/`oy` raw reported a jab at 74 degrees, which is
   *  the height of the fighter talking, not the direction of the punch. */
  const read = (hb) => {
    const chest = -bodyMetrics(key).height * comFrac(key);
    const mx = hb.ox + hb.w / 2;
    const my = hb.oy + hb.h / 2 - chest;
    return {
      deg: Math.round(-Math.atan2(my, mx) * 180 / Math.PI),
      move: f.action?.move?.label || f.action?.anim || "?",
    };
  };

  /** Hold `stick` and press `button`; return the angle of the first live
   *  hitbox it produces. */
  const fire = (button, stick) => {
    settle();
    clearBoxes();
    const input = { ...blankInput(), ...stick };
    input[button + "P"] = true;
    updateFighter(f, dt, input);
    // Held from here on — a charge needs the button down, a tilt does not care.
    const held = { ...blankInput(), ...stick, [button]: true };
    for (let i = 0; i < 40; i++) {
      updateFighter(f, dt, held);
      const live = state.hitboxes.find((h) => h.owner === f);
      if (live) return read(live);
    }
    // A smash charges until the button is RELEASED, so let go and keep going.
    const let_go = { ...blankInput(), ...stick };
    for (let i = 0; i < 40; i++) {
      updateFighter(f, dt, let_go);
      const live = state.hitboxes.find((h) => h.owner === f);
      if (live) return read(live);
    }
    return { deg: null, move: "no hitbox" };
  };

  const sticks = {
    "forward       ": { right: true },
    "up            ": { up: true },
    "up + forward  ": { up: true, right: true },
    "down + forward": { down: true, right: true },
  };
  const out = [];
  for (const [name, stick] of Object.entries(sticks)) {
    out.push({
      stick: name,
      light: fire("light", stick),
      heavy: fire("heavy", stick),
      // The right stick, which is the only thing that angles a smash.
      heavyAimed: fire("heavy", { ...stick, tiltY: -1 }),
    });
  }
  return out;
});

console.log("the line each attack is thrown along — degrees above horizontal\n");
console.log(`  ${"stick".padEnd(16)}${"light".padStart(22)}${"heavy".padStart(24)}${"heavy + right stick up".padStart(28)}`);
const cell = (r) => `${r.deg === null ? "—" : `${r.deg}°`} (${r.move})`;
for (const r of rows) {
  console.log(`  ${r.stick}  ${cell(r.light).padStart(20)}${cell(r.heavy).padStart(24)}${cell(r.heavyAimed).padStart(28)}`);
}

// ---------------------------------------------------------- the stick window
//
// The report is not that the angle is wrong but that it never happens. That is
// a question about the STICK, not the swing: `attackTilt` needs a horizontal
// AND a vertical at once, and input.js derives each from its own independent
// threshold (`ax > 0.5`, `ay < -0.5`). Both at once is a band of stick angles
// rather than a half-plane, and a stick not pushed to about 0.71 of full
// deflection cannot satisfy both at any angle at all.
//
// So this sweeps a real stick around its circle at full deflection and reports
// which angles actually produce a tilted attack.
const window = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { strikeArcs } = await import("/src/moves.js");
  const { bodyMetrics } = await import("/src/silhouette.js");

  const f = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  const dt = 1 / 60;
  const key = f.spriteChar || f.charKey;

  const test = (deg, mag) => {
    const r = (deg * Math.PI) / 180;
    const ax = Math.cos(r) * mag, ay = -Math.sin(r) * mag;
    Object.assign(f, {
      x: main.x + main.w / 2, y: main.y, vx: 0, vy: 0, grounded: true,
      hitstun: 0, action: null, charging: false, crouching: false, dashT: 0,
      walking: false, facing: 1, facingVis: 1, aimPoint: null, jabStep: 0,
      jabResetT: 0, dead: false,
    });
    state.hitboxes.length = 0;
    // Exactly what input.js builds from a pad at this stick position.
    const stick = {
      right: ax > 0.28, left: ax < -0.28, up: ay < -0.5, down: ay > 0.5,
      dirX: Math.sign(ax), moveX: ax, moveY: ay,
    };
    updateFighter(f, dt, { ...blankInput(), ...stick, lightP: true });
    for (let i = 0; i < 40; i++) {
      updateFighter(f, dt, { ...blankInput(), ...stick });
      const live = state.hitboxes.find((h) => h.owner === f);
      if (live) {
        const arcs = strikeArcs(f.action?.move || {}, bodyMetrics(key).height);
        return {
          tilt: Math.round(((f.action?.move?.aimTilt || 0) * 180) / Math.PI),
          arc: arcs.length ? Math.round((arcs[0].aim * 180) / Math.PI) : null,
        };
      }
    }
    return { tilt: null, arc: null };
  };

  const rows = [];
  for (let deg = -90; deg <= 90; deg += 15) rows.push({ deg, mag: 1, ...test(deg, 1) });
  const mags = [];
  for (const mag of [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) mags.push({ mag, ...test(45, mag) });
  return { rows, mags };
});

console.log("\nstick swept around its circle at FULL deflection, light attack:\n");
console.log("  stick angle   swing tilt   drawn arc");
for (const r of window.rows) {
  console.log(`  ${String(r.deg).padStart(6)}°   ${String(r.tilt === null ? "—" : `${r.tilt}°`).padStart(10)}`
    + `   ${String(r.arc === null ? "—" : `${r.arc}°`).padStart(9)}`);
}
console.log("\nand at 45°, as the stick is pushed less far:\n");
console.log("  deflection   swing tilt");
for (const r of window.mags) {
  console.log(`  ${String(r.mag).padStart(9)}   ${String(r.tilt === null ? "—" : `${r.tilt}°`).padStart(10)}`);
}

await browser.close();
