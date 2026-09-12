// Uro breaks the screen, END TO END — the shatter reaches the framebuffer.
//
//     node server.mjs &
//     node tools/smoke_sky_shatter.mjs [--shots DIR]
//
// Plays a real match as Uro, casts Sky Warp Palm, and asserts three things:
//
//   * the shatter LIFECYCLE runs — state.skyShatter appears on the impact beat
//     and cleans itself up afterwards;
//   * the crack web reaches the PIXELS — the count of blazing near-white pixels
//     on screen during the break is a multiple of the count in calm play. The
//     Clothing FX bug shipped because every check stopped short of the
//     framebuffer; effects here get asserted on the framebuffer, full stop;
//   * no page errors anywhere in the run — the capture path touches WebGL
//     readback, which is exactly the kind of thing that fails quietly;
//   * Uro is NOT IN HER OWN GLASS. The pane is a photograph of the frame, so
//     everyone standing in it was captured and came apart with it — Uro most
//     of all, since she is usually inside the pane she just made. The sky now
//     keeps only the bodies the blow landed on and both renderers paint the
//     rest back over it, and this asserts that on the framebuffer: in 2.5D a
//     fighter's body lives in the WebGL layer, so her body pixels appearing on
//     the 2D OVERLAY is the repaint, and nothing else.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = flag("base", "http://127.0.0.1:5174");
const SHOTS = flag("shots", null);

let failures = 0;
const check = (ok, label, detail = "") => {
  if (ok) console.log(`ok   ${label}${detail ? `   ${detail}` : ""}`);
  else {
    failures++;
    console.log(`FAIL ${label}${detail ? `   ${detail}` : ""}`);
  }
};

const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** Count near-white pixels on the 2D overlay canvas — the canvas the shatter
 *  is drawn on — right now, synchronously, in-page. Screenshot-based counting
 *  could not catch the quarter-second blaze (each capture cost ~300ms and the
 *  DOM HUD's white text swamped the signal); reading the overlay's own pixels
 *  every frame can, and that canvas is still exactly what the player sees. */
function overlayWhite() {
  return `(() => {
    const c = document.getElementById("gameCanvas");
    if (!c) return -1;
    const g = c.getContext("2d");
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 8) {
      if (d[i + 3] > 100 && d[i] > 235 && d[i + 1] > 240 && d[i + 2] > 240) n++;
    }
    return n;
  })()`;
}

/** In-page helper, injected into the watcher below as source.
 *
 *  `warmPx()` counts WARM opaque pixels on the 2D overlay — red clearly ahead
 *  of blue. Bodies are warm (skin, cloth, the missing-art placeholder's red
 *  dashes); the pane's glass, its crack hairlines and the not-sky hole behind
 *  them are all blue-white or near-black. The count is taken over the whole
 *  canvas rather than a box on a fighter, because "where is Uro on screen"
 *  differs between the flat camera and the 2.5D rig and a test that has to
 *  guess it measures the guess. */
const PAGE_HELPERS = `
  function warmPx() {
    const c = document.getElementById("gameCanvas");
    if (!c) return -1;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 8) {
      if (d[i + 3] > 120 && d[i] > 150 && d[i] - d[i + 2] > 34) n++;
    }
    return n;
  }
`;

if (SHOTS) await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => {
  failures++;
  console.log(`FAIL page error   ${e.message}`);
});
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForSelector("#settingsButton", { state: "visible", timeout: 30000 });

for (let i = 0; i < 20; i++) {
  const phase = await page.evaluate(async () => (await import("/src/state.js")).state.phase);
  if (phase === "menu") break;
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}
await page.waitForSelector('#characterGrid [data-character="uro"]', { state: "visible", timeout: 30000 });
await page.click('#characterGrid [data-character="uro"]');
await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector("#stageGrid [data-stage]", { timeout: 30000 });
await page.click("#stageGrid [data-stage]");
await page.waitForFunction(
  () => document.getElementById("introOverlay")?.classList.contains("hidden"),
  null, { timeout: 90000, polling: 500 },
);
for (let i = 0; i < 60; i++) {
  const st = await page.evaluate(async () => {
    const s = (await import("/src/state.js")).state;
    return { introT: s.introT, phase: s.phase };
  });
  if (st.phase === "playing" && st.introT <= 0) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(400);

const calm = await page.evaluate(overlayWhite());

// Stand the fight up where the measurement can see it. The pane is LOCAL — a
// disc around wherever the palm lands — and the palm lands on the opponent, so
// against a live CPU that runs away half the casts break the sky nowhere near
// Uro and there is simply no glass over her to repaint. Putting the opponent
// an arm's length away, and taking their hands off the controls, makes every
// cast the case this test exists to measure. Everything else about the cast —
// the real special, the real capture, the real beats — is untouched.
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const [uro, foe] = state.fighters;
  if (!foe) return;
  foe.aiState = null;
  foe.x = uro.x + 130 * (uro.facing || 1);
  foe.y = uro.y;
  foe.vx = 0; foe.vy = 0;
  foe.grounded = true;
  foe.stocks = 9;
});
await page.waitForTimeout(300);

// Cast, then let an in-page frame loop watch the whole lifetime: it samples
// the overlay every animation frame while state.skyShatter lives, so the
// quarter-second of visible cracks cannot fall between out-of-process polls.
//
// Cast up to three times: the CPU is a live opponent, and a hit landing
// during the windup cancels the special — a real match fact, not a bug, and
// not what this smoke exists to measure.
// Cast until there is something to measure, and keep the best attempt.
//
// The pane is LOCAL — a disc around wherever the palm landed — and the CPU is
// a live opponent, so some casts break the sky far enough from Uro that she is
// nowhere near the glass. Those are not evidence: with no pane over her there
// is nothing to repaint, both samples come back identical, and reading that as
// a verdict is how a smoke test starts failing at random. A build that has
// LOST the repaint fails all the same, because its two samples are identical
// on every attempt, however close to the glass she stands.
const MEASURABLE = 200;
const delta = (r) => (r.sawShatter ? (r.withRepaint || 0) - (r.without || 0) : -1);
let run = { sawShatter: false, sawHold: false, heldStill: false, peak: 0 };
for (let attempt = 0; attempt < 4 && delta(run) <= MEASURABLE; attempt++) {
  await page.keyboard.press("KeyL");
  const got = await watch(page);
  if (delta(got) > delta(run)) run = got;
  if (delta(run) <= MEASURABLE) await page.waitForTimeout(600);
}
const watchResult = run;

async function watch(page2) {
  return await page2.evaluate(async ([expr, helpers]) => {
  const mod = await import("/src/state.js");
  const shatter = await import("/src/screen_shatter.js");
  const sample = () => eval(expr);
  // eslint-disable-next-line no-eval
  eval(helpers);
  return await new Promise((resolve) => {
    let sawShatter = false;
    let sawHold = false;
    let heldStill = false;
    let holdSample = null;
    let peak = 0;
    let withRepaint = 0;
    let without = 0;
    let phase = 0;
    let abStarted = false;
    let pinT = null;
    let pairs = 0;
    let uroInGlass = false;
    let uroSpared = false;
    let sparedIds = [];
    let frames = 0;
    const tick = () => {
      frames++;
      const live = !!mod.state.skyShatter;
      if (live) {
        sawShatter = true;
        peak = Math.max(peak, sample());
        // Who the sky kept, and who it handed back. Uro must never be in her
        // own glass, and must be in the list both renderers repaint.
        const caster = mod.state.fighters[0];
        const victims = mod.state.skyShatter.victims;
        // Read defensively: a build where the sky keeps everybody has neither
        // of these, and that has to come back as a failed check rather than as
        // a throw inside an animation frame that never resolves.
        // Read BEFORE the break, because the A/B below puts her in and out of
        // this very set to take its two samples.
        if (!mod.state.skyShatter.broke &&
            victims && victims.has && victims.has(caster)) uroInGlass = true;
        if (typeof shatter.sparedFighters === "function") {
          const spared = shatter.sparedFighters() || [];
          if (spared.includes(caster)) uroSpared = true;
          if (spared.length) sparedIds = spared.map((f) => f.id);
        }
        // THE REPAINT, ON THE FRAMEBUFFER, measured A/B against itself.
        //
        // Sampled only from the break onward — before that the pane is the
        // frozen frame Uro is already standing in and the repaint lands
        // exactly on top of itself, so there is nothing to see. Once the
        // pieces move there is: her body is in front of them.
        //
        // The comparison is the same shatter, the same beat, the same shards,
        // with the repaint the only difference — done by putting her in and
        // out of the victim set every few frames. Anything else that is warm
        // on screen (the captured backdrop inside the shards, the HUD) is in
        // both samples and cancels. Two frames are allowed to pass after each
        // flip so the game's own rAF has certainly drawn under it.
        if (mod.state.skyShatter.broke && victims && victims.add && pairs < 3) {
          // PIN THE FRAME. The samples below are taken seconds apart in wall
          // time, and during the fall beats the world is live again — fighters
          // move, particles spawn, the camera drifts — so a count taken over
          // the whole canvas wanders by thousands between them and buries the
          // thing being measured. So for the length of the measurement the
          // world is held (simHold), the shatter's own clock is pinned, and
          // the camera shake is stilled: two consecutive samples are then the
          // same picture, and the ONLY difference between them is whether Uro
          // is in the victim set and therefore left out of the repaint.
          mod.state.simHold = 0.5;
          mod.state.camera.shake = 0;
          if (pinT === null) pinT = mod.state.skyShatter.t;
          mod.state.skyShatter.t = pinT;
          if (!abStarted) {
            // Begin with the repaint OFF, so the first sample of each kind is
            // taken under a setting that has actually been in force. Sampling
            // straight away would read a repainted frame and call it the
            // un-repainted one.
            abStarted = true;
            phase = 0;
            victims.add(caster);
          } else if (++phase === 3) {
            without = Math.max(without, warmPx());
            victims.delete(caster);
          } else if (phase >= 6) {
            withRepaint = Math.max(withRepaint, warmPx());
            victims.add(caster);
            phase = 0;
            pairs++;
          }
        } else if (abStarted && pairs >= 3 && victims && victims.delete) {
          // Measured. Let go of the world and let the sky finish breaking.
          victims.delete(caster);
          mod.state.simHold = 0;
        }
        // The crack beat freezes the WORLD: while simHold drains, no fighter
        // moves and no animation clock advances. Sample one fighter twice a
        // few frames apart inside the hold and require identity — the pixels
        // above prove the cracks animate, this proves the world does not.
        if (mod.state.simHold > 0) {
          sawHold = true;
          const f = mod.state.fighters[1] || mod.state.fighters[0];
          const now = f ? [f.x, f.y, f.animTime] : null;
          if (holdSample && now) {
            heldStill = heldStill ||
              (now[0] === holdSample[0] && now[1] === holdSample[1] && now[2] === holdSample[2]);
          }
          holdSample = now;
        }
      }
      if ((sawShatter && !live) || frames > 600 || (!sawShatter && frames > 120)) {
        resolve({ sawShatter, sawHold, heldStill, peak, withRepaint, without, pairs, uroInGlass, uroSpared, sparedIds, ended: !live });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  }, [overlayWhite(), PAGE_HELPERS]);
}
const { sawShatter, sawHold, heldStill, peak, withRepaint, without, pairs, uroInGlass, uroSpared } = watchResult;
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "after.png") });

const cleared = await page.evaluate(async () => !(await import("/src/state.js")).state.skyShatter);

check(sawShatter, "the impact raises a screen shatter");
check(sawHold, "the crack beat arms the world hold (state.simHold)");
check(heldStill, "the world actually stands still while the cracks spread");
check(cleared, "the shatter cleans itself up");
// 1.6x, not the old 2x: the web is deliberate mirror-HAIRLINES now, and the
// world it draws over is FROZEN for the crack beat — stilled particles mean
// the calm frame's own white barely rises. The multiple is over calm play,
// so a web that stopped reaching the pixels still fails by a wide margin.
check(peak > Math.max(500, calm * 1.6),
      "the crack web reaches the framebuffer",
      `calm ${calm} bright px, peak ${peak}`);
check(!uroInGlass, "Uro is never a victim of her own sky");
check(uroSpared, "...so the sky hands her back to be drawn over it",
      `spared ${(watchResult.sparedIds || []).join(", ") || "nobody"}`);
check(pairs > 0 && withRepaint > without + MEASURABLE,
      "...and her body is actually painted over the broken pane",
      `${withRepaint} warm px with the repaint, ${without} without it (${pairs} pairs)`);

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nthe sky breaks on screen");
process.exit(failures ? 1 : 0);
