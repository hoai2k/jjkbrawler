// Smoke for WALL JUMPING (src/fighter.js wallAgainst + the jump chain).
//
// The rule, as asked for: a jump pressed in the air against a wall pushes off
// it and does NOT spend an air jump, so a wall can be climbed indefinitely —
// but taking one spends the air jump for the rest of that fall, so you cannot
// climb a wall and still have a double jump in hand at the top.
//
// Needs `playwright` and a Chromium binary. Start the game (node server.mjs):
//   node tools/smoke_wall_jump.mjs [baseUrl]
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
await page.click('[data-stage="riverGate"]');          // the board with walls
for (let w=0;;w+=150){ if(await page.evaluate(async()=>(await import("/src/state.js")).state.phase==="playing"&&(await import("/src/state.js")).state.fighters.length>1))break; if(w>120000)throw new Error("x"); await page.waitForTimeout(150);}
await page.waitForTimeout(500);

const r = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { bodyMetrics } = await import("/src/silhouette.js");
  const dt = 1 / 60;
  const f = state.fighters[0];
  const wall = state.platforms.find((p) => p.kind === "wall");
  const half = bodyMetrics(f.spriteChar || f.charKey).width * 0.5;
  const out = {};

  // Park them against the wall's LEFT face, in the air, falling.
  const park = () => Object.assign(f, {
    x: wall.x - half, y: wall.y + wall.h / 2, vx: 0, vy: 100,
    grounded: false, airT: 0.5, hitstun: 0, action: null, dead: false,
    respawnTimer: 0, ledge: null, ledgeMove: null, coyote: 0, jumpBuffer: 0,
    crouching: false, airJumpsLeft: 1, wallJumped: false,
  });
  const jump = () => { const i = blankInput(); i.jumpP = true; i.jumpHeld = true; return i; };

  // 1. a jump against the wall pushes off, and costs no air jump
  park();
  const airBefore = f.airJumpsLeft;
  updateFighter(f, dt, jump());
  out.first = { vy: Math.round(f.vy), vx: Math.round(f.vx), air: f.airJumpsLeft, airBefore, wallJumped: f.wallJumped };

  // 2. climb: keep returning to the face and jumping; every one must work
  // Held at the same height on the face each time: what is being tested is
  // that the wall jump REPEATS, not that this particular 130px wall is tall
  // enough to climb — lift them 90px per jump and they are off the top of it
  // after one, which says nothing about the rule.
  let climbs = 0;
  for (let k = 0; k < 6; k++) {
    Object.assign(f, {
      x: wall.x - half, y: wall.y + wall.h / 2, vx: 0, vy: 60,
      grounded: false, airT: 0.5, coyote: 0, jumpBuffer: 0,
    });
    updateFighter(f, dt, jump());
    if (f.vy < -100) climbs++;
  }
  out.climbs = climbs;
  out.airAfterClimb = f.airJumpsLeft;

  // 3. ...but the air jump is gone: away from any wall, a jump does nothing
  f.x = 640; f.y = 300; f.vx = 0; f.vy = 120; f.grounded = false; f.airT = 0.5; f.coyote = 0;
  const vyBefore = f.vy;
  updateFighter(f, dt, jump());
  out.airJumpAfterWall = { vyBefore: Math.round(vyBefore), vyAfter: Math.round(f.vy) };

  // 4. a fresh fighter away from a wall still gets their normal air jump
  Object.assign(f, { x: 640, y: 300, vx: 0, vy: 120, grounded: false, airT: 0.5,
    coyote: 0, airJumpsLeft: 1, wallJumped: false, hitstun: 0, action: null });
  updateFighter(f, dt, jump());
  out.normalAirJump = Math.round(f.vy);

  // 5. landing gives the wall jump back
  Object.assign(f, { wallJumped: true, airJumpsLeft: 0 });
  const main = state.platforms.find((p) => p.kind === "main");
  Object.assign(f, { x: main.x + 200, y: main.y - 6, vy: 200, grounded: false, airT: 0.5 });
  for (let k = 0; k < 8; k++) updateFighter(f, dt, blankInput());
  out.afterLanding = { grounded: f.grounded, wallJumped: f.wallJumped, air: f.airJumpsLeft };
  return out;
});
// --- AND CAN A PLAYER ACTUALLY CLIMB ONE? The rule above is a mechanic; this
// is the board. River Gate's tall walls are the route to its high platforms,
// and the reach audit now says so — this drives a fighter up one the way a
// player would, holding toward the face and jumping whenever they touch it.
const climb = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput } = await import("/src/input.js");
  const { bodyMetrics } = await import("/src/silhouette.js");
  const dt = 1 / 60;
  const f = state.fighters[0];
  const half = bodyMetrics(f.spriteChar || f.charKey).width * 0.5;
  // The tallest wall on the board, and the platform it is the route to.
  const wall = state.platforms.filter((p) => p.kind === "wall")
    .reduce((a, b) => (b.h > a.h ? b : a));
  const goal = state.platforms
    .filter((p) => p.kind !== "wall" && p.y < wall.y + 200)
    .reduce((a, b) => (!a || b.y < a.y ? b : a), null);
  Object.assign(f, {
    x: wall.x + wall.w + half, y: wall.y + wall.h - 4, vx: 0, vy: 0,
    grounded: false, airT: 0.5, coyote: 0, jumpBuffer: 0, hitstun: 0,
    action: null, dead: false, respawnTimer: 0, ledge: null, ledgeMove: null,
    airJumpsLeft: 1, wallJumped: false, crouching: false,
  });
  let best = f.y, jumps = 0;
  for (let k = 0; k < 900; k++) {
    const i = blankInput();
    // hold INTO the wall, which is what keeps you on the face between jumps
    i.left = true; i.dirX = -1; i.moveX = -1;
    const onFace = Math.abs(f.x - (wall.x + wall.w + half)) <= 18
      && f.y > wall.y && f.y <= wall.y + wall.h + 1;
    if (onFace && f.vy > -40) { i.jumpP = true; i.jumpHeld = true; jumps++; }
    updateFighter(f, dt, i);
    best = Math.min(best, f.y);
    if (f.grounded || f.dead) break;
  }
  return { wall: { x: wall.x, y: wall.y, h: wall.h }, goalY: goal ? goal.y : null,
           startedAt: Math.round(wall.y + wall.h), climbedTo: Math.round(best), jumps };
});
console.log("climb:", JSON.stringify(climb));
check(climb.climbedTo < climb.startedAt - 300,
  "a player can climb River Gate's tall wall", `${climb.startedAt} -> ${climb.climbedTo} in ${climb.jumps} jumps`);
check(climb.goalY === null || climb.climbedTo <= climb.goalY + 40,
  "...far enough to reach the platform it serves", `reached ${climb.climbedTo}, platform at ${climb.goalY}`);

console.log(JSON.stringify(r, null, 1));
check(r.first.vy < -300 && r.first.wallJumped, "a jump against a wall pushes off it", `vy=${r.first.vy}`);
// Enough to leave the face and cross a small gap, deliberately NOT more —
// a bigger shove throws you so far out that the climb stalls (constants.js).
check(Math.abs(r.first.vx) >= 150, "...and shoves them clear of the face", `vx=${r.first.vx}`);
check(r.first.air === r.first.airBefore, "...without spending the air jump", `${r.first.airBefore} -> ${r.first.air}`);
check(r.climbs === 6, "a wall can be climbed as many times as you can reach it", `${r.climbs}/6`);
check(r.airAfterClimb === 1, "...still without spending it", `airJumpsLeft=${r.airAfterClimb}`);
check(r.airJumpAfterWall.vyAfter > 0, "but the air jump is gone once you have wall jumped",
  `vy ${r.airJumpAfterWall.vyBefore} -> ${r.airJumpAfterWall.vyAfter}`);
check(r.normalAirJump < -300, "a fighter who has NOT wall jumped keeps their double jump", `vy=${r.normalAirJump}`);
check(r.afterLanding.grounded && !r.afterLanding.wallJumped, "landing gives it all back", JSON.stringify(r.afterLanding));
console.log("errors:", errors.length?errors:"none");
await b.close();
console.log(fails||errors.length ? `\n${fails} check(s) failed` : "\nall wall-jump checks passed");
process.exit(fails||errors.length?1:0);
