// Smoke a summon's FOOTING: which surface it lives on, and how it leaves one.
//
// Summons used to know about exactly one surface — the floor — so this is the
// check that the rest of the stage now exists for them. It drives the real
// spawnSummon()/update() against real stage layouts and the real art (the size
// rule is measured off the drawing, so a stubbed image would test nothing) and
// asserts the four things the behaviour is:
//
//   * a summon cast by an owner standing on a shelf LANDS ON THAT SHELF
//   * with nothing to hunt it ROAMS that shelf and never walks off it
//   * chasing, it leaves freely — off the edge after someone across the stage,
//     and straight down through the shelf after someone directly beneath it,
//     because there is no edge that would get it there
//   * a creature TOO BIG for the shelf leaves on its own, walking INWARD and
//     dropping out of that stride rather than shuffling off the lip
//
// It also prints the size census, which is what the ROAM_SPAN constant in
// src/summons.js should be read against: every creature's measured width beside
// every side-platform width in the game. That table is the answer to "would
// this creature stay up there", for all 20 boards at once.
//
// Needs `playwright` and Chromium; start the game first (node server.mjs),
// then: node tools/smoke_summon_platforms.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 400)));
await page.goto(`${BASE}/index.html`, { waitUntil: "load" });

const r = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { spawnSummon } = await import("/src/summons.js");
  const { getStage, STAGES } = await import("/src/stages.js");
  const { makeFighter } = await import("/src/fighter.js");
  const { CHARACTERS } = await import("/src/characters.js");
  const assets = await import("/src/assets.js");
  const pools = await import("/src/config_summons.js");

  // The real art, because the creature's box is measured off its own drawing
  // and the placeholder box would answer every size question wrong.
  await assets.loadCoreAssets();
  await assets.loadAllAssets();

  function setStage(key) {
    state.platforms = getStage(key).platforms.map((p) => ({ ...p }));
    state.entities.length = 0;
    state.fighters.length = 0;
    state.particles.length = 0;
  }

  let fid = 0;
  function fighter(x, y, team) {
    const f = makeFighter(++fid, "megumi", x, 1);
    f.y = y; f.team = team; f.grounded = true; f.respawnTimer = 0; f.invuln = 0;
    return f;
  }

  /** Cast `cfg` from an owner at (ownerX, ownerY) with one foe on the board. */
  function cast(cfg, ownerX, ownerY, foeX, foeY) {
    const owner = fighter(ownerX, ownerY, 1);
    const foe = fighter(foeX, foeY, 2);
    state.fighters.push(owner, foe);
    // A long duration so nothing under test expires mid-measurement, and the
    // first `unit` folded in the way specials.js folds it — the Divine Dogs
    // carry their art per unit, so the bare pool entry has no drawing and
    // would measure as the placeholder.
    const merged = { ...cfg, ...(cfg.units?.[0] || {}), id: cfg.name, color: "#fff", duration: 30 };
    return { s: spawnSummon(owner, merged), owner, foe };
  }

  const step = (s, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) s.update(1 / 60); };
  const ARRIVE = 0.7;                       // past the 0.5s arrival, feet down
  const of = (pool, name) => pools[pool].find((c) => c.name === name);

  // Megumi's Mahoraga, the one summon that fights like a character.
  const findBrawler = (o, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 6) return null;
    if (o.behavior === "brawler") return o;
    for (const v of Object.values(o)) { const f = findBrawler(v, depth + 1); if (f) return f; }
    return null;
  };
  const MAHORAGA = findBrawler(CHARACTERS.megumi);

  const out = {};

  // Shibuya Night: side shelf y=452 spanning x 200..420 (w 220); floor y=566.
  // A Crawler measures 82 px across and fits it; a Max Elephant measures 292
  // and cannot.

  // ---- lands on the shelf it was cast onto, then paces it
  setStage("shibuyaNight");
  {
    const { s } = cast(of("TRANSFIGURED_POOL", "Crawlers"), 300, 452, 300, 452);
    step(s, ARRIVE);
    out.land = { y: s.y, hitW: s.hitW };
    state.fighters[1].dead = true;          // nothing to chase -> roam
    let minY = s.y, maxY = s.y, minX = s.x, maxX = s.x;
    for (let i = 0; i < 60 * 12; i++) {
      s.update(1 / 60);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    }
    out.roam = { minY, maxY, minX: Math.round(minX), maxX: Math.round(maxX) };
  }

  // ---- too big for the shelf: inward stride, then down
  setStage("shibuyaNight");
  {
    const { s } = cast(of("SHIKIGAMI_POOL", "Max Elephant"), 300, 452, 1000, 566);
    step(s, ARRIVE);
    const landed = { y: s.y, x: s.x, hitW: s.hitW };
    const fromX = s.x;
    step(s, 0.5);
    // Cast left-of-centre on the shelf, so inward is to the RIGHT — the
    // opposite of the near edge it would have toppled off.
    const inward = Math.sign(s.x - fromX);
    step(s, 3);
    out.tooBig = { landed, inward, endY: s.y };
  }

  // ---- chasing leaves the shelf: off the edge after a distant foe...
  setStage("shibuyaNight");
  {
    const { s } = cast(of("TRANSFIGURED_POOL", "Crawlers"), 300, 452, 900, 566);
    step(s, ARRIVE + 4);
    out.chaseOff = { y: s.y, x: Math.round(s.x) };
  }

  // ---- ...and straight down after one standing directly beneath it
  setStage("shibuyaNight");
  {
    const { s } = cast(of("TRANSFIGURED_POOL", "Crawlers"), 300, 452, 300, 566);
    step(s, ARRIVE + 4);
    out.chaseUnder = { y: s.y };
  }

  // ---- the floor is never left: there is nothing under it but the blast zone
  setStage("shibuyaNight");
  {
    const { s } = cast(of("SHIKIGAMI_POOL", "Max Elephant"), 640, 566, 640, 566);
    step(s, ARRIVE);
    state.fighters[1].dead = true;
    let minY = s.y, maxY = s.y;
    for (let i = 0; i < 60 * 10; i++) { s.update(1 / 60); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
    out.floor = { minY, maxY };
  }

  // ---- tiered board: a descent stops on the next shelf down, not the floor
  setStage("boneSanctum");                  // 236 -> 346 -> 456 -> 574
  {
    const { s } = cast(of("SHIKIGAMI_POOL", "Max Elephant"), 415, 236, 415, 236);
    state.fighters[1].dead = true;
    step(s, ARRIVE);
    const landed = s.y;
    const rested = [];
    for (let i = 0; i < 60 * 6; i++) {
      s.update(1 / 60);
      if (!s.airborne && !rested.includes(s.y)) rested.push(s.y);
    }
    out.tiered = { landed, rested };
  }

  // ---- the flyer is not a ground creature and none of this touches it
  setStage("shibuyaNight");
  {
    const { s } = cast(of("SHIKIGAMI_POOL", "Toad"), 300, 452, 900, 566);
    step(s, 2);
    out.flyer = { y: s.y, ownerY: 452 };
  }

  // ---- the brawler is a ground creature too, and must not oscillate
  if (MAHORAGA) {
    setStage("shibuyaNight");
    {
      const { s } = cast(MAHORAGA, 300, 452, 300, 566);
      step(s, ARRIVE);
      const landed = s.y;
      step(s, 4);
      out.brawlerDown = { hitW: s.hitW, landed, endY: s.y };
    }
    // A foe camping a shelf he does not fit on: he must NOT hop up and walk
    // back off, over and over, which is what the fitsShelf gate on his chase
    // jump is there to prevent.
    setStage("shibuyaNight");
    {
      const { s, foe } = cast(MAHORAGA, 300, 566, 340, 452);
      step(s, 1.5);
      const levels = new Set();
      for (let i = 0; i < 60 * 8; i++) {
        s.update(1 / 60);
        foe.x = 340; foe.y = 452;           // hold them on the perch
        if (!s.airborne) levels.add(Math.round(s.y));
      }
      out.brawlerHolds = { levels: [...levels] };
    }
    // ...but a shelf he DOES fit on (Crosswalk Rush's 520px deck) he still
    // climbs, because the gate is about room and not about height.
    setStage("crosswalkRush");
    {
      const { s, foe } = cast(MAHORAGA, 640, 570, 640, 430);
      step(s, 1);
      const levels = new Set();
      for (let i = 0; i < 60 * 8; i++) {
        s.update(1 / 60);
        foe.x = 640; foe.y = 430;
        if (!s.airborne) levels.add(Math.round(s.y));
      }
      out.brawlerClimbs = { levels: [...levels] };
    }
  }

  // ---- the size census, for reading ROAM_SPAN against
  {
    const widths = new Set();
    for (const st of STAGES) for (const pl of st.platforms) if (pl.kind !== "main") widths.add(pl.w);
    const census = [];
    setStage("shibuyaNight");
    for (const key of ["SHIKIGAMI_POOL", "TRANSFIGURED_POOL", "CURSE_POOL", "INVENTORY_POOL"]) {
      for (const cfg of pools[key]) {
        if (cfg.behavior === "support") continue;   // flyers have no footing
        state.entities.length = 0;
        state.fighters.length = 0;
        const { s } = cast(cfg, 300, 452, 300, 452);
        step(s, ARRIVE);
        census.push({ name: cfg.name, hitW: s.hitW });
      }
    }
    if (MAHORAGA) {
      state.entities.length = 0; state.fighters.length = 0;
      const { s } = cast(MAHORAGA, 300, 452, 300, 452);
      step(s, ARRIVE);
      census.push({ name: "Mahoraga", hitW: s.hitW });
    }
    out.census = { widths: [...widths].sort((a, b) => a - b), census };
  }

  return out;
});

// The shelf under test, so the numbers below read as more than magic.
const SHELF = { y: 452, x: 200, w: 220 }, FLOOR = 566;

check(r.land.y === SHELF.y, "cast from a shelf, it lands on that shelf", `y=${r.land.y}`);
check(r.land.hitW * 2 <= SHELF.w, "the Crawler fits the shelf", `${r.land.hitW}px on ${SHELF.w}px`);
check(r.roam.minY === SHELF.y && r.roam.maxY === SHELF.y, "roaming never leaves it", JSON.stringify(r.roam));
check(r.roam.maxX - r.roam.minX > 30, "roaming is a walk, not a stand", JSON.stringify(r.roam));
check(r.roam.minX >= SHELF.x && r.roam.maxX <= SHELF.x + SHELF.w, "roaming stays inside the shelf", JSON.stringify(r.roam));

check(r.tooBig.landed.y === SHELF.y, "the Elephant lands on the shelf first", JSON.stringify(r.tooBig.landed));
check(r.tooBig.landed.hitW * 2 > SHELF.w, "the Elephant does not fit it", `${r.tooBig.landed.hitW}px on ${SHELF.w}px`);
check(r.tooBig.inward === 1, "it walks INWARD before dropping, not off the near lip", `dir=${r.tooBig.inward}`);
check(r.tooBig.endY === FLOOR, "and it ends up on the floor", `y=${r.tooBig.endY}`);

check(r.chaseOff.y === FLOOR && r.chaseOff.x > SHELF.x + SHELF.w, "a chase walks off the edge after a distant foe", JSON.stringify(r.chaseOff));
check(r.chaseUnder.y === FLOOR, "and drops through after one directly beneath", JSON.stringify(r.chaseUnder));

check(r.floor.minY === FLOOR && r.floor.maxY === FLOOR, "nothing ever leaves the floor", JSON.stringify(r.floor));
check(r.tiered.landed === 236, "a descent starts on the shelf it was cast onto", JSON.stringify(r.tiered));
check(r.tiered.rested.some((y) => y > 236 && y < 574), "and stops on an intermediate shelf on the way down", JSON.stringify(r.tiered));
check(r.flyer.y < SHELF.y, "the flyer still hovers, untouched by any of it", JSON.stringify(r.flyer));

check(r.brawlerDown && r.brawlerDown.landed === SHELF.y && r.brawlerDown.endY === FLOOR,
      "the brawler leaves a shelf it does not fit on", JSON.stringify(r.brawlerDown));
check(r.brawlerHolds && r.brawlerHolds.levels.length === 1 && r.brawlerHolds.levels[0] === FLOOR,
      "and never loops up onto it after a foe camping there", JSON.stringify(r.brawlerHolds));
check(r.brawlerClimbs && r.brawlerClimbs.levels.includes(430),
      "but still climbs to one it fits on", JSON.stringify(r.brawlerClimbs));

console.log("\nside-platform widths in the game:", r.census.widths.join(", "));
console.log("creature            width   needs   stays on");
for (const c of r.census.census.sort((a, b) => a.hitW - b.hitW)) {
  const needs = c.hitW * 2;
  const stays = r.census.widths.filter((w) => w >= needs);
  console.log(`  ${c.name.padEnd(20)}${String(c.hitW).padStart(4)}${String(needs).padStart(8)}   ` +
              (stays.length ? `${stays.length}/${r.census.widths.length} shelves (${stays[0]}px and up)` : "the floor only"));
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nall summon footing checks passed");
process.exit(failures ? 1 : 0);
