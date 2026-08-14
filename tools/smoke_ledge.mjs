// THE LEDGE BRAKE: momentum never walks a fighter off, a held direction always
// does. Both halves matter, and they pull against each other — a brake strong
// enough to stop the slide is one stroke away from gluing everyone to the stage
// and killing edge-cancels, ledge drops and chasing somebody off the end.
//
// Smash draws this line with the TEETER: walk to the lip slowly and the
// character stops there and will not step off until the stick goes past a
// threshold (ssbwiki.com/Teeter). That needs an analog walk to hang off, and
// this game has none — `dirX` is ±1 past a deadzone. What it can read instead
// is intent: held is deliberate, coasting is not. These checks are that rule
// stated as numbers.
//
//   node server.mjs   then:   node tools/smoke_ledge.mjs [baseUrl]

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
page.on("pageerror", (e) => console.log(`  page error: ${String(e).slice(0, 200)}`));

try {
  await page.goto(`${BASE}/?camera=flat`);
  await pressStart(page);
  await page.waitForSelector('[data-character="gojo"]', { timeout: 120000 });
  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(300);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 15000 });
  await page.locator(".stage-card").nth(0).click();
  for (let w = 0; ; w += 150) {
    const ok = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      return state.phase === "playing" && state.fighters.length > 1;
    });
    if (ok) break;
    if (w > 120000) throw new Error("match never started");
    await page.waitForTimeout(150);
  }

  const r = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { updateFighter } = await import("/src/fighter.js");
    const { blankInput } = await import("/src/input.js");
    const { fighterTransform } = await import("/src/motion.js");
    const dt = 1 / 60;
    const [a, b] = state.fighters;
    const main = (state.platforms || []).find((p) => p.kind === "main");
    const edge = main.x + main.w;
    for (const f of state.fighters) { f.aiState = null; f.stocks = 99; f.invuln = 0; }
    b.x = -9999;                        // out of the way; this is about geometry

    const reset = (fromEdge) => {
      Object.assign(a, { x: edge - fromEdge, y: main.y, vx: 0, vy: 0, grounded: true,
        dashT: 0, hitstun: 0, action: null, facing: 1, invuln: 0,
        respawnTimer: 0, dead: false, ledge: null });
      a.lastTap = { dir: 0, t: -10 };
    };
    const IN = (o) => ({ ...blankInput(), ...o });
    const settle = (frames, input) => {
      for (let i = 0; i < frames; i++) updateFighter(a, dt, input);
    };

    const out = {};

    // 1. Dash at the edge, then LET GO. The slide must stop on the platform.
    //    Started INSIDE the un-braked stopping distance on purpose: a single
    //    dash flick used to need 42px of runway and this begins with 20, so
    //    without the brake this walks off and the check is worth running.
    reset(20);
    updateFighter(a, dt, IN({ right: true, dirX: 1, dashFlick: 1 }));
    out.dashPeakV = Math.round(Math.abs(a.vx));
    settle(200, blankInput());
    out.releasedGrounded = a.grounded;
    out.releasedPastEdge = +(a.x - edge).toFixed(1);

    // 2. The same dash with the direction HELD must still leave the stage.
    reset(60);
    settle(60, IN({ right: true, dirX: 1, dashFlick: 1 }));
    out.heldGrounded = a.grounded;
    out.heldX = Math.round(a.x);

    // 3. A plain run, released. Same rule: no coasting off. Run up to full
    //    speed and let go with 30px left — a full-speed slide carries about
    //    56px un-braked, so this is inside it too.
    reset(220);
    for (let i = 0; i < 400 && edge - a.x > 30; i++) {
      updateFighter(a, dt, IN({ right: true, dirX: 1 }));
    }
    out.runReleaseV = Math.round(Math.abs(a.vx));
    out.runReleaseGap = +(edge - a.x).toFixed(1);
    settle(200, blankInput());
    out.runReleasedGrounded = a.grounded;

    // 4. THE TEETER. Walking at the lip stops there however long you hold it;
    //    pushing the stick to a run goes over. This is the half that needs the
    //    analog walk to exist at all.
    reset(80);
    settle(200, IN({ right: true, dirX: 1, moveX: 0.45 }));
    out.walkHeldGrounded = a.grounded;
    out.walkV = Math.round(Math.abs(a.vx));
    reset(80);
    settle(200, IN({ right: true, dirX: 1, moveX: 1 }));
    out.runHeldGrounded = a.grounded;

    // 5. Knockback is NOT braked — being hit off the stage is the game working.
    reset(30);
    a.hitstun = 0.6; a.vx = 900;
    settle(40, blankInput());
    out.hitstunLeft = !a.grounded;

    // 6a. THE LEDGE POP. Grabbing a ledge and getting off one are teleports in
    //     the simulation — up to ~100px in one frame — and drawn verbatim that
    //     is a body vanishing and reappearing, twice in half a second. What is
    //     measured is the position the RENDERER uses: f.x/f.y plus
    //     fighterTransform's offsets, which is where fighter.js placeFighter
    //     puts the catch-up slide. Ordinary movement is the yardstick: a run
    //     covers ~8px in a frame and a fast fall ~15, so anything past 24 is a
    //     jump rather than a move.
    const drawnAt = () => {
      const m = fighterTransform(a);
      return { x: a.x + (m.offsetX || 0), y: a.y + (m.offsetY || 0) };
    };
    const worstStep = (frames, input) => {
      let prev = drawnAt();
      let worst = 0;
      for (let i = 0; i < frames; i++) {
        updateFighter(a, dt, input);
        const d = drawnAt();
        worst = Math.max(worst, Math.hypot(d.x - prev.x, d.y - prev.y));
        prev = d;
      }
      return +worst.toFixed(1);
    };
    // Fall past the lip into a grab. reset() first, because check 5 threw this
    // fighter off the stage and a respawn in flight is its own teleport.
    reset(0);
    Object.assign(a, {
      x: edge + 26, y: main.y - 40, vx: 0, vy: 40, grounded: false,
      facing: -1, ledgeCooldown: 0, airT: 1, visDX: 0, visDY: 0, visT: 0,
      respawnTimer: 0, respawnPlat: null,
    });
    out.grabStep = worstStep(24, blankInput());
    out.grabbed = !!a.ledge;
    // ...then climb back on.
    out.getupStep = worstStep(24, IN({ left: true, dirX: -1 }));
    out.gotUp = a.grounded && !a.ledge;

    // 6. Standing still at the lip is undisturbed — the brake must not shove
    //    anyone back from where they are legitimately allowed to stand.
    reset(0);
    a.vx = 0;
    const restX = a.x;
    settle(30, blankInput());
    out.restMoved = +(a.x - restX).toFixed(2);

    return out;
  });

  check(r.releasedGrounded, "a dash released before the lip stops on the platform",
    `ended ${r.releasedPastEdge > 0 ? `${r.releasedPastEdge}px past the lip` : "short of the lip"}, `
    + `peak ${r.dashPeakV} px/s`);
  check(!r.heldGrounded, "...but holding the direction still runs off the end",
    `x=${r.heldX} against an edge at the platform's end`);
  check(r.runReleasedGrounded, "a run released before the lip stops too",
    `let go at ${r.runReleaseV} px/s with ${r.runReleaseGap}px of platform left`);
  check(r.walkHeldGrounded, "walking into the lip teeters there, however long it is held",
    `held tilt 0.45 for 200 frames`);
  check(!r.runHeldGrounded, "...and pushing the stick to a run goes straight over");
  check(r.hitstunLeft, "knockback is never braked — hitstun still leaves the stage");
  check(Math.abs(r.restMoved) < 0.01, "standing at the lip is left alone",
    `moved ${r.restMoved}px`);
  check(r.grabbed && r.grabStep <= 24,
    "grabbing the ledge slides the drawing in instead of teleporting it",
    `worst frame ${r.grabStep}px${r.grabbed ? "" : " (NEVER GRABBED)"}`);
  check(r.gotUp && r.getupStep <= 24,
    "...and so does climbing back off it",
    `worst frame ${r.getupStep}px${r.gotUp ? "" : " (NEVER GOT UP)"}`);
} catch (err) {
  check(false, "smoke_ledge ran", err.message);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} failure(s)` : "\nall ledge checks passed");
process.exit(failures ? 1 : 0);
