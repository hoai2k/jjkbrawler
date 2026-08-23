// Smoke for the HUD YIELDING to the fight (src/ui.js updateHudYield).
//
// The shot is framed into the strip under the damage plates, so in normal play
// a fighter never reaches them. Boards can now be built tall enough that the
// camera runs out of room — clampView will not look higher than OVERSCAN_Y past
// the world — and at that point a fighter at the top of the board is BEHIND the
// readouts. When the camera has nowhere left to go, the plate gets out of the
// way instead.
//
// The check that matters most is the third: NO FLICKER. The trigger needs the
// camera pinned, but the release only asks whether the body still overlaps, so
// a fighter hovering exactly at the limit — where the camera is pinned one
// frame and free the next — must not strobe the plate. 150 frames of hovering
// should produce at most one change.
//
// Run for BOTH cameras: the flat one projects with cam.x/y/zoom, the shipped
// 2.5D one has to ask the rig, and being 20px out shows as a plate that fades
// late.
//
// Needs `playwright` and a Chromium binary. Start the game (node server.mjs):
//   node tools/smoke_hud_yield.mjs [flat|3d] [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";
const BASE = process.argv[3] || "http://127.0.0.1:5174";
const mode = process.argv[2] || "flat";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server","--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(String(e)));
let fails = 0; const check=(ok,l,d="")=>{if(!ok){fails++;console.log(`FAIL ${l} ${d}`);}else console.log(`ok   ${l} ${d}`);};
await page.goto(`${BASE}/index.html${mode==="flat"?"?camera=flat":""}`, { waitUntil: "load" });
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 120000 });
await page.click('[data-character="gojo"]'); await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 15000 });
await page.click('[data-stage="billboardRoof"]');   // has the very high perch
for (let w=0;;w+=150){ if(await page.evaluate(async()=>(await import("/src/state.js")).state.phase==="playing"&&(await import("/src/state.js")).state.fighters.length>1))break; if(w>120000)throw new Error("x"); await page.waitForTimeout(150);}
await page.waitForTimeout(600);

const probe = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  // Spread them: the frame CENTRES the fighters, so a lone body never reaches a
  // corner plate. Two far apart pins the zoom out and puts each near an edge —
  // which is exactly the shape of the situation this is for.
  const hold = async (y, ms, xs = [-100, 1300]) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      state.fighters.forEach((f, i) => {
        f.y = y; f.x = xs[i % xs.length]; f.vx = 0; f.vy = 0;
        f.grounded = true; f.damage = 0; f.hitstun = 0;
      });
      await new Promise(r => requestAnimationFrame(r));
    }
  };
  const yielded = () => document.querySelectorAll(".fighter-status--yield").length;
  const out = {};
  // 1. ordinary play down on the tier: nothing yields
  await hold(580, 900);
  out.ground = { yielded: yielded(), atTop: !!state.camera.atTop };
  // 2. shove them up behind the plates, where the camera cannot follow
  await hold(-60, 1200);
  out.high = { yielded: yielded(), atTop: !!state.camera.atTop };
  // 3. FLICKER: sit exactly where the camera keeps flipping in and out of its
  //    clamp, and count how many times the class changes
  let flips = 0, was = yielded() > 0;
  for (let i = 0; i < 150; i++) {
    state.fighters.forEach((f, k) => {
      f.y = -60 + (i % 2 ? 8 : -8); f.x = k ? 1300 : -100; f.vx=0; f.vy=0; f.grounded=true;
    });
    await new Promise(r => requestAnimationFrame(r));
    const now = yielded() > 0;
    if (now !== was) flips++;
    was = now;
  }
  out.flips = flips;
  // 4. come back down: it releases
  await hold(580, 1200);
  out.back = { yielded: yielded() };
  return out;
});
console.log(mode, JSON.stringify(probe));
check(probe.ground.yielded === 0, `[${mode}] ordinary play leaves the HUD alone`, `atTop=${probe.ground.atTop}`);
check(probe.high.yielded > 0, `[${mode}] a body behind the plates makes them yield`, `${probe.high.yielded} plate(s), atTop=${probe.high.atTop}`);
check(probe.flips <= 1, `[${mode}] it does not flicker while hovering at the limit`, `${probe.flips} change(s) over 150 frames`);
check(probe.back.yielded === 0, `[${mode}] and it comes back once they are clear`);
check(errors.length === 0, `[${mode}] no page errors`, errors.slice(0,2).join(" | "));
await b.close();
console.log(fails ? `\n${fails} check(s) failed` : `\nall hud-yield checks passed (${mode})`);
process.exit(fails ? 1 : 0);
