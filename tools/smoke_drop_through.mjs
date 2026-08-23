// Smoke for DROPPING THROUGH ONE PLATFORM AT A TIME (fighter.js
// resolvePlatforms / f.dropThrough).
//
// A drop used to switch off EVERY non-main platform for 0.24s — and 0.24s of
// falling is about 87px, so anything stacked under the tier you meant to leave
// went with it. Reported from play: one press could take you down several
// tiers. The fighter now ignores the ONE platform being left, so the next
// surface catches them however close it is.
//
// Needs `playwright` and a Chromium binary. Start the game (node server.mjs):
//   node tools/smoke_drop_through.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";
const BASE = process.argv[2] || "http://127.0.0.1:5174";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors=[]; page.on("pageerror",e=>errors.push(String(e)));
let fails=0; const check=(ok,l,d="")=>{if(!ok){fails++;console.log(`FAIL ${l} ${d}`);}else console.log(`ok   ${l} ${d}`);};
await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 120000 });
await page.click('[data-character="gojo"]'); await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 15000 });
await page.click('[data-stage="trainingBridge"]');
for (let w=0;;w+=150){ if(await page.evaluate(async()=>(await import("/src/state.js")).state.phase==="playing"&&(await import("/src/state.js")).state.fighters.length>1))break; if(w>120000)throw new Error("x"); await page.waitForTimeout(150);}
await page.waitForTimeout(400);

const r = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const dt = 1/60;
  const f = state.fighters[0];
  const out = {};

  // A deliberately CRUEL stack: three drop-throughs 40px apart, well inside the
  // 87px a fighter falls during the old blanket window.
  const x = 600;
  const deck = [
    { x: x - 150, y: 300, w: 300, h: 11, kind: "side" },
    { x: x - 150, y: 340, w: 300, h: 11, kind: "side" },
    { x: x - 150, y: 380, w: 300, h: 11, kind: "side" },
  ];
  const floor = state.platforms.find((p) => p.kind === "main");
  state.platforms = [floor, ...deck];

  const settle = (n, input) => { for (let k = 0; k < n; k++) updateFighter(f, dt, input || blankInput()); };
  const drop = () => { const i = blankInput(); i.down = true; i.jumpP = true; return i; };

  // stand on the top shelf
  Object.assign(f, { x, y: deck[0].y, vx: 0, vy: 0, grounded: true, hitstun: 0,
    action: null, dead: false, respawnTimer: 0, dropTimer: 0, dropThrough: null,
    currentPlatform: deck[0], crouching: false, coyote: 0, jumpBuffer: 0 });
  settle(4);
  out.start = Math.round(f.y);

  // ONE press
  updateFighter(f, dt, drop());
  settle(40);
  out.afterOne = Math.round(f.y);

  // ...and a second press takes them one more, not the rest
  settle(6);
  updateFighter(f, dt, drop());
  settle(40);
  out.afterTwo = Math.round(f.y);

  // A shelf with NOTHING under it must still be leavable
  state.platforms = [floor, { x: x - 150, y: 300, w: 300, h: 11, kind: "side" }];
  Object.assign(f, { x, y: 300, vx: 0, vy: 0, grounded: true, dropTimer: 0,
    dropThrough: null, currentPlatform: state.platforms[1], coyote: 0, jumpBuffer: 0 });
  settle(4);
  updateFighter(f, dt, drop());
  settle(120);
  out.lonelyShelf = { grounded: f.grounded, y: Math.round(f.y), floorY: floor.y };
  return out;
});
console.log(JSON.stringify(r));
check(r.afterOne === 340, "one press falls exactly one platform", `${r.start} -> ${r.afterOne} (next shelf 340)`);
check(r.afterTwo === 380, "a second press falls one more", `${r.afterOne} -> ${r.afterTwo} (next shelf 380)`);
check(r.lonelyShelf.grounded && r.lonelyShelf.y === r.lonelyShelf.floorY,
  "a shelf with nothing under it still drops to the floor below", JSON.stringify(r.lonelyShelf));
console.log("errors:", errors.length?errors:"none");
await b.close();
console.log(fails||errors.length ? `\n${fails} check(s) failed` : "\nall drop-through checks passed");
process.exit(fails||errors.length?1:0);
