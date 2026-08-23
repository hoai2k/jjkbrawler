// Smoke for the LOWER FLOOR and the SPAWN TIER (src/stages.js): every board's
// lowest ground now sits at the bottom of the world, and what used to be the
// ground is a `kind: "spawn"` drop-through a match opens on. Six boards split
// that floor down the middle.
//
// Three things have to hold or the storey below is a trap rather than space:
//   * a match OPENS on the tier, never on the floor a storey under it
//   * the floor really is below the start, by a hop a fighter can climb back
//   * on a split board BOTH halves offer their ledges — including the two lips
//     facing the hole, which is the whole point of splitting it
//
// The last one is the regression this was written for: `tryGrabLedge` read
// only the FIRST main, so half of a split board's ledges were dead to the
// touch and falling down the middle was unsurvivable by design.
//
// Needs `playwright` and a Chromium binary — set CHROMIUM_PATH if yours is
// elsewhere. Start the game first (node server.mjs), then:
//   node tools/smoke_stage_floor.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";
const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push("console: " + m.text()); });
let fails = 0;
const check = (ok, label, d = "") => { if (!ok) { fails++; console.log(`FAIL ${label} ${d}`); } else console.log(`ok   ${label} ${d}`); };

await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 120000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 15000 });
await page.click('[data-stage="mistPier"]');          // a SPLIT board
for (let w = 0; ; w += 150) {
  if (await page.evaluate(async () => (await import("/src/state.js")).state.phase === "playing" && (await import("/src/state.js")).state.fighters.length > 1)) break;
  if (w > 120000) throw new Error("no match"); await page.waitForTimeout(150);
}

const r = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { mainPlatforms, spawnPlatform } = await import("/src/stages.js");
  const mains = mainPlatforms(state.platforms);
  const tier = spawnPlatform(state.platforms);
  const started = state.fighters.map((f) => Math.round(f.y));
  // drop the fighter beside the LEFT half's INNER edge (facing the hole) and
  // see whether the ledge is offered there
  const grabAt = async (edgeX, platY) => {
    const f = state.fighters[0];
    Object.assign(f, {
      x: edgeX + 14, y: platY + 30, vx: 0, vy: 120, grounded: false, airT: 0.6,
      ledge: null, ledgeMove: null, ledgeCooldown: 0, hitstun: 0, action: null,
      dead: false, respawnTimer: 0, hangGrip: null, hangGripW: 0,
    });
    for (let i = 0; i < 40; i++) await new Promise((res) => requestAnimationFrame(res));
    return f.ledge ? Math.round(f.ledge.edgeX) : null;
  };
  const [left, right] = mains.slice().sort((a, b) => a.x - b.x);
  const innerLeft = await grabAt(left.x + left.w, left.y);   // right lip of left half
  const innerRight = await grabAt(right.x - 28, right.y);     // left lip, from IN the hole
  return {
    mains: mains.length, tierY: tier.y, floorY: mains[0].y, started,
    hole: right.x - (left.x + left.w),
    innerLeft, innerRight,
    wantLeft: left.x + left.w, wantRight: right.x,
  };
});
console.log(JSON.stringify(r));
check(r.started.every((y) => y === r.tierY), "a match opens on the spawn tier, not the floor", `y=${r.started} tier=${r.tierY}`);
check(r.floorY > r.tierY + 100, "the floor is a storey below the start", `${r.tierY} -> ${r.floorY}`);
check(r.mains === 2 && r.hole >= 90, "the split floor really has a hole", `${r.hole}px`);
check(r.innerLeft === r.wantLeft, "the left half's inner ledge is grabbable", `got ${r.innerLeft} want ${r.wantLeft}`);
check(r.innerRight === r.wantRight, "the right half's inner ledge is grabbable", `got ${r.innerRight} want ${r.wantRight}`);
// ...and the same invariants across the WHOLE table, statically: every board
// with a tier starts above its floor, within one climb of it.
const table = await page.evaluate(async () => {
  const { STAGES, mainPlatforms, spawnPlatform } = await import("/src/stages.js");
  return STAGES.map((s) => {
    const mains = mainPlatforms(s.platforms);
    const tier = s.platforms.find((p) => p.kind === "spawn");
    return {
      key: s.key, floors: mains.length, floorY: mains[0].y,
      tierY: tier ? tier.y : null, rise: tier ? mains[0].y - tier.y : 0,
      hole: mains.length === 2
        ? Math.min(...mains.slice(1).map((m, i) => m.x - (mains[i].x + mains[i].w))) : 0,
    };
  });
});
const withTier = table.filter((t) => t.tierY !== null);
check(withTier.length >= 12, "most boards gained a storey", `${withTier.length}/${table.length}`);
check(withTier.every((t) => t.rise > 0 && t.rise <= 175),
  "every tier is one climb above its floor",
  `rises ${Math.min(...withTier.map((t) => t.rise))}-${Math.max(...withTier.map((t) => t.rise))}`);
check(table.filter((t) => t.floors === 2).length >= 4, "several boards split the floor",
  `${table.filter((t) => t.floors === 2).length} split`);
check(table.filter((t) => t.floors === 2).every((t) => t.hole >= 90),
  "every split floor has a real hole");
check(table.filter((t) => t.tierY === null).length >= 2,
  "and some boards deliberately keep a high floor",
  table.filter((t) => t.tierY === null).map((t) => t.key).join(", "));

console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await browser.close();
console.log(fails || errors.length ? `\n${fails} check(s) failed` : "\nall stage-floor checks passed");
process.exit(fails || errors.length ? 1 : 0);
