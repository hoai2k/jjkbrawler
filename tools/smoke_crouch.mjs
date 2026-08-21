// Attacking out of a crouch, in a real match.
//
// The bug this exists for: a crouch used to end on the very frame `down` was
// let go, so the natural fighting-game input — hold down, flick forward, hit
// attack — put a fighter bolt upright into a jab instead of throwing the low
// poke the hands had asked for. Smash gets that feel from its squat exit
// animation (an attack out of the stand-up frames is still the down tilt);
// this game gets it from CROUCH_GRACE, coyote time for the crouch.
//
// Each case drives the REAL updateFighter with a scripted input stream — the
// sim loop is paused first so nothing else touches the fighter — and names the
// attack that came out by its animation: `crouchAttack` is the low one.
//
// Needs playwright + Chromium (CHROMIUM_PATH to override) and the game served:
//   node server.mjs   then:  node tools/smoke_crouch.mjs [baseUrl]
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
// Park the sim: from here the only thing stepping fighter 1 is this test.
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  state.phase = "paused";
});

/** Run one scripted input stream and report the attack that came out.
 *  `script` is a list of [frames, patch] — the patch is merged over a blank
 *  input for that many 60 Hz steps. */
async function play(script) {
  return page.evaluate(async ({ script }) => {
    const { state } = await import("/src/state.js");
    const { updateFighter } = await import("/src/fighter.js");
    const { blankInput } = await import("/src/input.js");
    const f = state.fighters[0];
    const plat = state.platforms.find((p) => p.kind === "main");
    // A clean standing fighter in the middle of the main platform.
    Object.assign(f, {
      x: plat.x + plat.w / 2, y: plat.y, vx: 0, vy: 0, grounded: true,
      action: null, charging: null, crouching: false, crouchGrace: 0,
      dashT: 0, hitstun: 0, hitPause: 0, shielding: false, jabStep: 0,
      jabResetT: 0, invuln: 99, dizzy: 0, prone: 0, landLag: 0, bufferedAction: null,
    });
    const DT = 1 / 60;
    let out = null;
    for (const [frames, patch] of script) {
      for (let i = 0; i < frames; i++) {
        const { airborne, ...rest } = patch;
        if (airborne) { f.grounded = false; f.y -= 220; f.vy = -40; }
        const input = Object.assign(blankInput(), rest);
        if (patch.right) input.dirX = 1;
        if (patch.left) input.dirX = -1;
        // The stick, not just the buttons: the attack angle is read off the
        // ANALOG axes now (fighter.js attackTilt), so a script that only set
        // the booleans was holding a stick at dead centre and never reached
        // the diagonal band at all.
        input.moveX = input.dirX;
        input.moveY = (patch.down ? 1 : 0) - (patch.up ? 1 : 0);
        f.lastInput = input;
        updateFighter(f, DT, input);
        if (!out && f.action?.kind === "attack") {
          out = {
            anim: f.action.anim, label: f.action.move?.label || "",
            crouching: f.crouching, aimed: !!f.aimPoint,
          };
        }
      }
    }
    return out;
  }, { script });
}

const HOLD_DOWN = [12, { down: true }];

// 1. The plain case, unchanged: down held, attack pressed, low poke.
check((await play([HOLD_DOWN, [1, { down: true, lightP: true }], [4, {}]]))?.anim === "crouchAttack",
  "down + attack is the crouch attack");

// 2. The case the grace exists for: let go of down, push forward, attack.
//    Two frames of forward — about as fast as hands actually roll the input.
const rolled = await play([HOLD_DOWN, [2, { right: true }], [1, { right: true, lightP: true }], [4, {}]]);
check(rolled?.anim === "crouchAttack",
  "crouch, flick forward, attack is still the crouch attack",
  `got ${rolled?.anim} (${rolled?.label})`);

// 3. …and it is a WINDOW, not a mode: half a second later the crouch is over.
const late = await play([HOLD_DOWN, [30, { right: true }], [1, { right: true, lightP: true }], [4, {}]]);
check(late?.anim !== "crouchAttack", "the grace expires — a run into attack is not the crouch attack",
  `got ${late?.anim} (${late?.label})`);
const standing = await play([HOLD_DOWN, [20, {}], [1, { lightP: true }], [4, {}]]);
check(standing?.anim === "light", "and standing up hands the jab back",
  `got ${standing?.anim} (${standing?.label})`);

// 4. The stick at five o'clock — down AND forward, the angle a pad reports
//    mid-roll. The attack keeps the diagonal's 45° reach (it is the SIDE move,
//    swung at the legs, not the down move), but it is drawn out of the crouch:
//    the fighter is crouched there, and a standing swing out of a crouching
//    body was the game disagreeing with itself on screen.
const diag = await play([HOLD_DOWN, [1, { down: true, right: true, lightP: true }], [4, {}]]);
check(diag?.anim === "crouchAttack", "down + forward is posed out of the crouch",
  `got ${diag?.anim} (${diag?.label})`);
check(diag?.aimed && !/^Low /.test(diag?.label || ""),
  "…and still the angled side attack, not the plain down move",
  `got ${diag?.label} aimed=${diag?.aimed}`);

// 4b. The AIR has no crouch to win, so the down diagonal still angles the
//     aerial at the legs there — `aimPoint` is the tell (fighter.js aimAlong).
const air = await play([[1, { airborne: true }], [1, { down: true, right: true, lightP: true }], [4, {}]]);
check(air?.anim === "airLight" && air?.aimed, "in the air, down + forward still angles the aerial",
  `got ${air?.anim} aimed=${air?.aimed}`);

// 4c. Up + forward is untouched: still the side attack angled up, not the up
//     attack and not a crouch.
const upDiag = await play([[1, { up: true, right: true, lightP: true }], [4, {}]]);
check(upDiag?.aimed && upDiag?.anim !== "upHeavy", "up + forward still angles the side attack",
  `got ${upDiag?.anim} (${upDiag?.label}) aimed=${upDiag?.aimed}`);

// 5. A dash out of a crouch is a decision to stand: the dash attack must not
//    be swallowed by a stale crouch.
const dashed = await play([HOLD_DOWN, [1, { right: true, dashP: true }], [2, { right: true }],
  [1, { right: true, lightP: true }], [4, {}]]);
check(dashed?.anim !== "crouchAttack", "a dash clears the crouch grace",
  `got ${dashed?.anim} (${dashed?.label})`);

// 6. The BOX agrees with the pose. `f.crouching` is false for the whole of an
//    attack — a fighter cannot act and crouch at once — so the hurtbox used to
//    stand up the instant the low swing started, while the art stayed folded
//    in half (combat.js isDucking).
const boxes = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { hurtbox } = await import("/src/combat.js");
  const f = state.fighters[0];
  const plat = state.platforms.find((p) => p.kind === "main");
  Object.assign(f, {
    x: plat.x + plat.w / 2, y: plat.y, vx: 0, vy: 0, grounded: true,
    action: null, crouching: false, crouchGrace: 0, hitstun: 0, invuln: 99,
  });
  const DT = 1 / 60;
  const step = (patch = {}) => updateFighter(f, DT, Object.assign(blankInput(), patch));
  for (let i = 0; i < 6; i++) step();
  const standing = hurtbox(f).h;
  for (let i = 0; i < 12; i++) step({ down: true });
  const crouching = hurtbox(f).h;
  step({ down: true, lightP: true });
  for (let i = 0; i < 3; i++) step({ down: true });
  return { standing, crouching, attacking: hurtbox(f).h, anim: f.animKey };
});
check(boxes.anim === "crouchAttack" && Math.abs(boxes.attacking - boxes.crouching) < 1,
  "the hurtbox stays ducked through the crouch attack",
  `standing=${Math.round(boxes.standing)} crouch=${Math.round(boxes.crouching)} attacking=${Math.round(boxes.attacking)}`);

check(errors.length === 0, "no page errors", errors.join(" | "));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
