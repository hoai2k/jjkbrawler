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
  const { getStage, STAGES, groundY: stageGroundY } = await import("/src/stages.js");
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

  // ------------------------------------------------------------- geometry
  //
  // Which shelf, and how wide, comes from the STAGE — never from a number
  // written down here. These checks were first written against a Shibuya
  // Night whose shelf started at x=200 and whose floor was y=566; the board
  // has since moved the shelf 30 px left and the floor 120 px down, and every
  // one of those constants had quietly stopped describing the game. Two
  // checks failed and three passed for the wrong reason, which is the worse
  // half. A test that states its own stage layout is one more place for the
  // layout to disagree with itself.

  /** The surface a body at `x` comes to rest on, falling from `fromY`.
   *
   *  The floor is whatever the GAME calls the ground — groundY(), the same
   *  answer summons.js asks for — and not the lowest platform in the list.
   *  Shibuya Night now carries a `main` slab at y=686 sitting BELOW its ground
   *  at 566, so "lowest platform" and "the floor a summon falls to" are two
   *  different numbers on that board, and only one of them is the one the
   *  creature is heading for. */
  function surfaceBelow(key, x, fromY) {
    const plats = getStage(key).platforms;
    const ground = stageGroundY(plats);
    let best = null;
    for (const p of plats) {
      if (x < p.x || x > p.x + p.w || p.y <= fromY || p.y > ground) continue;
      if (!best || p.y < best.y) best = p;
    }
    return best ? best.y : ground;
  }

  /** The lowest SIDE shelf on `key`, leftmost of its tier: the one under test.
   *  "side" and not merely "not main" — a board can also carry a `spawn` deck,
   *  which is a second piece of floor rather than a shelf, and picking that
   *  would ask every question below about the wrong surface. */
  function sideShelf(key) {
    const sides = getStage(key).platforms.filter((p) => p.kind === "side");
    const lowest = Math.max(...sides.map((p) => p.y));
    return sides.filter((p) => p.y === lowest).sort((a, b) => a.x - b.x)[0];
  }

  const SHELF = sideShelf("shibuyaNight");
  const MID = SHELF.x + SHELF.w / 2;
  // Cast on the LEFT quarter of the shelf, so "inward" is unambiguously to
  // the RIGHT — the opposite of the near lip it would have toppled off. Taken
  // off the shelf rather than picked, so it stays left-of-centre when the
  // shelf moves.
  const CAST_X = Math.round(SHELF.x + SHELF.w / 4);
  const DECK = sideShelf("crosswalkRush");
  out.geom = {
    shelf: { x: SHELF.x, y: SHELF.y, w: SHELF.w },
    castX: CAST_X,
    floorY: surfaceBelow("shibuyaNight", CAST_X, SHELF.y),
    farFloorY: surfaceBelow("shibuyaNight", 900, SHELF.y),
    boneFloorY: stageGroundY(getStage("boneSanctum").platforms),
    deck: { x: DECK.x, y: DECK.y, w: DECK.w },
  };

  // ---- lands on the shelf it was cast onto, then paces it
  setStage("shibuyaNight");
  {
    const { s } = cast(of("TRANSFIGURED_POOL", "Crawlers"), CAST_X, SHELF.y, CAST_X, SHELF.y);
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

  // ---- too big for the shelf, with nothing to hunt: inward stride, then down
  setStage("shibuyaNight");
  {
    const { s } = cast(of("SHIKIGAMI_POOL", "Max Elephant"), CAST_X, SHELF.y, 1000, 566);
    step(s, ARRIVE);
    state.fighters[1].dead = true;          // nothing to chase -> room decides
    const landed = { y: s.y, x: s.x, hitW: s.hitW };
    const fromX = s.x;
    step(s, 0.5);
    // CAST_X is the shelf's left quarter, so inward is to the RIGHT — the
    // opposite of the near edge it would have toppled off.
    const inward = Math.sign(s.x - fromX);
    step(s, 3);
    out.tooBig = { landed, inward, endY: s.y };
  }

  // ---- but CHASING, room stops mattering: the same elephant on the same
  //      cramped shelf stays on it while a foe is up there with it
  setStage("shibuyaNight");
  {
    const { s, foe } = cast(of("SHIKIGAMI_POOL", "Max Elephant"), CAST_X, SHELF.y, MID + SHELF.w / 4, SHELF.y);
    step(s, ARRIVE);
    const levels = new Set();
    for (let i = 0; i < 60 * 8; i++) {
      s.update(1 / 60);
      foe.x = MID + SHELF.w / 4; foe.y = SHELF.y; foe.hp = 100;  // hold them up here
      if (!s.airborne) levels.add(Math.round(s.y));
    }
    out.chasingIgnoresRoom = { levels: [...levels] };
  }

  // ---- chasing leaves the shelf: off the edge after a distant foe...
  setStage("shibuyaNight");
  {
    const { s } = cast(of("TRANSFIGURED_POOL", "Crawlers"), CAST_X, SHELF.y, 900, out.geom.farFloorY);
    step(s, ARRIVE + 4);
    out.chaseOff = { y: s.y, x: Math.round(s.x) };
  }

  // ---- ...and straight down after one standing directly beneath it
  setStage("shibuyaNight");
  {
    const { s } = cast(of("TRANSFIGURED_POOL", "Crawlers"), CAST_X, SHELF.y, CAST_X, out.geom.floorY);
    step(s, ARRIVE + 4);
    out.chaseUnder = { y: s.y };
  }

  // ---- ...but only when the fall leads somewhere. Shibuya Night's two side
  //      shelves are both at y=452; stepping off after somebody on the far one
  //      would strand it on the floor underneath them forever, so it holds the
  //      lip and shadows them instead.
  setStage("shibuyaNight");
  {
    const { s, foe } = cast(of("TRANSFIGURED_POOL", "Crawlers"), CAST_X, SHELF.y, 950, SHELF.y);
    step(s, ARRIVE);
    let maxX = s.x;
    const levels = new Set();
    for (let i = 0; i < 60 * 8; i++) {
      s.update(1 / 60);
      foe.x = 950; foe.y = SHELF.y;
      maxX = Math.max(maxX, s.x);
      if (!s.airborne) levels.add(Math.round(s.y));
    }
    out.unreachable = { levels: [...levels], maxX: Math.round(maxX), lip: SHELF.x + SHELF.w };
  }

  // ---- and once that same foe drops to the floor, the fall DOES lead
  //      somewhere and it goes after them
  setStage("shibuyaNight");
  {
    const { s, foe } = cast(of("TRANSFIGURED_POOL", "Crawlers"), CAST_X, SHELF.y, 950, SHELF.y);
    step(s, ARRIVE + 2);
    const heldUp = s.y;
    foe.y = out.geom.farFloorY;               // they come down
    step(s, 4);
    out.thenReachable = { heldUp, endY: s.y };
  }

  // ---- the floor is never left: there is nothing under it but the blast zone
  setStage("shibuyaNight");
  {
    const floor640 = surfaceBelow("shibuyaNight", 640, SHELF.y);
    const { s } = cast(of("SHIKIGAMI_POOL", "Max Elephant"), 640, floor640, 640, floor640);
    step(s, ARRIVE);
    state.fighters[1].dead = true;
    let minY = s.y, maxY = s.y;
    for (let i = 0; i < 60 * 10; i++) { s.update(1 / 60); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
    out.floor = { minY, maxY, expected: floor640 };
  }

  // ---- tiered board: a descent stops on the next shelf down, not the floor
  setStage("boneSanctum");                  // 236 -> 346 -> 456 -> the floor
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
      const { s } = cast(MAHORAGA, CAST_X, SHELF.y, CAST_X, out.geom.floorY);
      step(s, ARRIVE);
      const landed = s.y;
      step(s, 4);
      out.brawlerDown = { hitW: s.hitW, landed, endY: s.y };
    }
    // A foe camping a shelf he does not fit on: he jumps up after them anyway
    // (he can jump back off, so room never talks him out of a chase) and then
    // STAYS, rather than looping up and down as the room rule once made him.
    setStage("shibuyaNight");
    {
      const perchX = Math.round(SHELF.x + SHELF.w / 3);
      const { s, foe } = cast(MAHORAGA, CAST_X, out.geom.floorY, perchX, SHELF.y);
      step(s, 3);
      const levels = new Set();
      for (let i = 0; i < 60 * 8; i++) {
        s.update(1 / 60);
        foe.x = perchX; foe.y = SHELF.y;    // hold them on the perch
        if (!s.airborne) levels.add(Math.round(s.y));
      }
      out.brawlerHolds = { levels: [...levels] };
    }
    // ...but a shelf he DOES fit on (Crosswalk Rush's 520px deck) he still
    // climbs, because the gate is about room and not about height.
    setStage("crosswalkRush");
    {
      const deckMid = DECK.x + DECK.w / 2;
      const { s, foe } = cast(MAHORAGA, deckMid, stageGroundY(getStage("crosswalkRush").platforms), deckMid, DECK.y);
      step(s, 1);
      const levels = new Set();
      for (let i = 0; i < 60 * 8; i++) {
        s.update(1 / 60);
        foe.x = deckMid; foe.y = DECK.y;
        if (!s.airborne) levels.add(Math.round(s.y));
      }
      out.brawlerClimbs = { levels: [...levels] };
    }
  }

  // ---- the size census, for reading ROAM_SPAN against
  {
    const widths = new Set();
    for (const st of STAGES) for (const pl of st.platforms) if (pl.kind === "side" || pl.kind === "top") widths.add(pl.w);
    const census = [];
    setStage("shibuyaNight");
    for (const key of ["SHIKIGAMI_POOL", "TRANSFIGURED_POOL", "CURSE_POOL", "INVENTORY_POOL"]) {
      for (const cfg of pools[key]) {
        if (cfg.behavior === "support") continue;   // flyers have no footing
        state.entities.length = 0;
        state.fighters.length = 0;
        const { s } = cast(cfg, CAST_X, SHELF.y, CAST_X, SHELF.y);
        step(s, ARRIVE);
        census.push({ name: cfg.name, hitW: s.hitW });
      }
    }
    if (MAHORAGA) {
      state.entities.length = 0; state.fighters.length = 0;
      const { s } = cast(MAHORAGA, CAST_X, SHELF.y, CAST_X, SHELF.y);
      step(s, ARRIVE);
      census.push({ name: "Mahoraga", hitW: s.hitW });
    }
    out.census = { widths: [...widths].sort((a, b) => a - b), census };
  }

  return out;
});

// The shelf under test and the floor beneath it, as the STAGE has them —
// reported back by the page above rather than written down here, so a board
// that moves moves these with it.
const SHELF = r.geom.shelf, FLOOR = r.geom.floorY;
console.log(`shelf x ${SHELF.x}..${SHELF.x + SHELF.w} at y ${SHELF.y}; cast from x ${r.geom.castX}; floor y ${FLOOR}\n`);

check(r.land.y === SHELF.y, "cast from a shelf, it lands on that shelf", `y=${r.land.y}`);
check(r.land.hitW * 2 <= SHELF.w, "the Crawler fits the shelf", `${r.land.hitW}px on ${SHELF.w}px`);
check(r.roam.minY === SHELF.y && r.roam.maxY === SHELF.y, "roaming never leaves it", JSON.stringify(r.roam));
check(r.roam.maxX - r.roam.minX > 30, "roaming is a walk, not a stand", JSON.stringify(r.roam));
check(r.roam.minX >= SHELF.x && r.roam.maxX <= SHELF.x + SHELF.w, "roaming stays inside the shelf", JSON.stringify(r.roam));

check(r.tooBig.landed.y === SHELF.y, "the Elephant lands on the shelf first", JSON.stringify(r.tooBig.landed));
check(r.tooBig.landed.hitW * 2 > SHELF.w, "the Elephant does not fit it", `${r.tooBig.landed.hitW}px on ${SHELF.w}px`);
check(r.tooBig.inward === 1, "with nothing to hunt it walks INWARD, not off the near lip", `dir=${r.tooBig.inward}`);
check(r.tooBig.endY > SHELF.y, "and ends up off the shelf, on what is under it", `y=${r.tooBig.endY}`);
check(r.chasingIgnoresRoom.levels.length === 1 && r.chasingIgnoresRoom.levels[0] === SHELF.y,
      "but chasing, it stays on the shelf it does not fit — room stops mattering", JSON.stringify(r.chasingIgnoresRoom));

check(r.chaseOff.y === r.geom.farFloorY && r.chaseOff.x > SHELF.x + SHELF.w, "a chase walks off the edge after a foe BELOW", JSON.stringify(r.chaseOff));
check(r.chaseUnder.y === FLOOR, "and drops through after one directly beneath", JSON.stringify(r.chaseUnder));
check(r.unreachable.levels.length === 1 && r.unreachable.levels[0] === SHELF.y,
      "but never off after one LEVEL with it, where the fall leads nowhere", JSON.stringify(r.unreachable));
check(r.unreachable.maxX <= r.unreachable.lip + 1, "it presses to the lip and shadows them from up there", JSON.stringify(r.unreachable));
check(r.thenReachable.heldUp === SHELF.y && r.thenReachable.endY === FLOOR,
      "and goes after them the moment they drop to the floor", JSON.stringify(r.thenReachable));

check(r.floor.minY === r.floor.expected && r.floor.maxY === r.floor.expected, "nothing ever leaves the floor", JSON.stringify(r.floor));
check(r.tiered.landed === 236, "a descent starts on the shelf it was cast onto", JSON.stringify(r.tiered));
check(r.tiered.rested.some((y) => y > 236 && y < r.geom.boneFloorY), "and stops on an intermediate shelf on the way down", JSON.stringify(r.tiered));
check(r.flyer.y < SHELF.y, "the flyer still hovers, untouched by any of it", JSON.stringify(r.flyer));

check(r.brawlerDown && r.brawlerDown.landed === SHELF.y && r.brawlerDown.endY === FLOOR,
      "the brawler leaves a shelf it does not fit on", JSON.stringify(r.brawlerDown));
check(r.brawlerHolds && r.brawlerHolds.levels.length === 1 && r.brawlerHolds.levels[0] === SHELF.y,
      "but jumps onto one anyway after a foe, and stays without looping", JSON.stringify(r.brawlerHolds));
check(r.brawlerClimbs && r.brawlerClimbs.levels.includes(r.geom.deck.y),
      "and climbs to a roomy one the same way", JSON.stringify({ ...r.brawlerClimbs, deck: r.geom.deck }));

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
