// WHICH WAY A FIGHTER LOOKS, and who gets to decide it.
//
// A standing fighter used to snap around to face the nearest opponent the
// moment the stick came back to centre. That is a 2D fighter's rule — Street
// Fighter locks both players' facing to each other — and in a platform
// fighter it means a turn cannot be HELD: walk left, let go, and the idle
// drawing spins back to the right. It showed up first in the character bench,
// where looking at a fighter is the whole point, but it was the game's rule,
// not the bench's: the bench runs the same `stepWorld`.
//
// So: facing is spent by whoever owns the fighter and holds until they spend
// it again. These cases are that sentence, executable — including the two ways
// it is spent (a tap, and an attack thrown with a direction held) and the CPU,
// which has to turn deliberately now that nothing turns it.
//
// Needs playwright + Chromium (CHROMIUM_PATH to override) and the game served:
//   node server.mjs   then:  node tools/smoke_turn.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

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
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  state.phase = "paused";
});

/** Drive fighter 1 through a scripted input stream with the opponent parked to
 *  their RIGHT, and report the facing (and any attack) at the end. */
async function play(script, { oppSide = 1 } = {}) {
  return page.evaluate(async ({ script, oppSide }) => {
    const { state } = await import("/src/state.js");
    const { updateFighter } = await import("/src/fighter.js");
    const { blankInput } = await import("/src/input.js");
    const f = state.fighters[0];
    const opp = state.fighters[1];
    const plat = state.platforms.find((p) => p.kind === "main");
    const midX = plat.x + plat.w / 2;
    Object.assign(f, {
      x: midX, y: plat.y, vx: 0, vy: 0, grounded: true, facing: oppSide,
      action: null, charging: null, crouching: false, crouchGrace: 0,
      dashT: 0, hitstun: 0, hitPause: 0, shielding: false, invuln: 99,
      jabStep: 0, jabResetT: 0, bufferedAction: null, aiState: null,
    });
    Object.assign(opp, {
      x: midX + oppSide * 260, y: plat.y, vx: 0, vy: 0, grounded: true,
      dead: false, respawnTimer: 0, invuln: 99, aiState: null, action: null,
    });
    const DT = 1 / 60;
    let attack = null;
    for (const [frames, patch] of script) {
      for (let i = 0; i < frames; i++) {
        const input = Object.assign(blankInput(), patch);
        input.dirX = (patch.right ? 1 : 0) - (patch.left ? 1 : 0);
        input.moveX = input.dirX;
        f.lastInput = input;
        updateFighter(f, DT, input);
        if (!attack && f.action?.kind === "attack") attack = { facing: f.facing, anim: f.action.anim };
      }
    }
    return { facing: f.facing, vx: Math.round(f.vx), attack };
  }, { script, oppSide });
}

// 1. THE BUG. Walk away from the opponent, let go, keep walking's facing.
const walked = await play([[30, { left: true }], [60, {}]]);
check(walked.facing === -1, "a fighter who walked away stays facing away",
  `facing=${walked.facing} after letting go`);

// 2. Standing still for a good while does not change it either — this is a
//    hold, not a slow snap back.
const stood = await play([[20, { left: true }], [240, {}]]);
check(stood.facing === -1, "…and still after four seconds of standing there",
  `facing=${stood.facing}`);

// 3. A TAP turns you. This is how facing is spent.
const tapped = await play([[20, { left: true }], [4, { right: true }], [30, {}]]);
check(tapped.facing === 1, "a tap the other way turns the fighter", `facing=${tapped.facing}`);

// 4. So does an attack thrown with a direction held — the rule the tilt stick
//    already had, applied to the buttons ("a tilt aimed behind you is a tilt
//    behind you", fighter.js beginTilt). Standing, not running: at a run the
//    press is the dash attack and it belongs to the way the run is going.
const swung = await play([[20, { left: true }], [12, {}], [1, { right: true, lightP: true }], [10, {}]]);
check(swung.attack?.facing === 1 && swung.attack?.anim !== "dashAttack",
  "an attack with a direction held is thrown that way",
  `facing at the swing=${swung.attack?.facing} (${swung.attack?.anim})`);

// 5. An attack with NO direction goes the way the fighter is already pointed,
//    even when that is away from the opponent. Facing is spent, not lent.
const back = await play([[20, { left: true }], [12, {}], [1, { lightP: true }], [10, {}]]);
check(back.attack?.facing === -1, "an attack with no direction keeps the fighter's own facing",
  `facing at the swing=${back.attack?.facing}`);

// 6. The CPU turns itself. Nothing faces it any more, so its plan has to press
//    the direction before it swings (ai.js finishPlan) — checked on the real
//    aiInput, with the fighter pointed the wrong way and a target in range.
const cpu = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { aiInput, makeAiState } = await import("/src/ai.js");
  const f = state.fighters[0];
  const opp = state.fighters[1];
  const plat = state.platforms.find((p) => p.kind === "main");
  Object.assign(f, {
    x: plat.x + plat.w / 2, y: plat.y, vx: 0, vy: 0, grounded: true,
    facing: -1, action: null, hitstun: 0, aiState: makeAiState(), meter: 0,
  });
  Object.assign(opp, {
    x: f.x + 90, y: plat.y, vx: 0, vy: 0, grounded: true, dead: false,
    respawnTimer: 0, action: null, aiState: null,
  });
  // Many plans over many frames: some attack, some do not. Every frame that
  // presses an attack must also be pressing the way the opponent is.
  let swings = 0, wrongWay = 0;
  for (let i = 0; i < 1200; i++) {
    f.facing = -1;                      // keep pointing it the wrong way
    const inp = aiInput(f);
    if (inp.lightP || inp.heavyP || inp.grabP || inp.specialP) {
      swings++;
      if (inp.dirX !== 1) wrongWay++;
    }
  }
  return { swings, wrongWay };
});
check(cpu.swings > 5 && cpu.wrongWay === 0, "the CPU turns into its own attacks",
  `${cpu.swings} swings, ${cpu.wrongWay} thrown backwards`);

check(errors.length === 0, "no page errors", errors.join(" | "));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
