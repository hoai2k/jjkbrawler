// Static audit of stage platform layouts (src/stages.js) against the
// movement budget in docs/stage-variety-plan.md ("Platform configurations"):
//
//   - the main platform(s) are the lowest surface — one on most boards, two or
//     three on the boards with a split floor, and they sit level with each other
//   - a board with a lower floor carries exactly one tier, the platform a match
//     opens on (a `kind: "spawn"` drop-through, or a main marked `spawn: true`),
//     and a drop-through tier is above the floor and reachable from it
//   - every stage has 2–10 platforms besides the main
//   - every platform is reachable by the WEAKEST jumper (jump 780 @ g 2350:
//     single hop rises 129 px, single + air jump ~239 px) via some chain of
//     hops — max vertical rise per hop 175 px, with a horizontal-gap budget
//     that shrinks as the rise grows
//   - the highest platform sits at y ≥ MIN_TOP_Y, so a full jump from it keeps
//     the jumper inside the shot (see the derivation on that constant)
//
// Run: node tools/audit_stage_reach.mjs   (exit 1 on any error)

import { STAGES } from "../src/stages.js";

// WHAT A HOP ACTUALLY COSTS.
//
// MAX_RISE was 175 against a weakest reach of ~239 — a "comfortable" number
// standing in for the physical one, which meant the audit called platforms
// unreachable that a player could plainly get to. Reported from the arena
// bench: everything on a hand-built board was reachable by double jump, and
// this said otherwise.
//
// So the ceiling is the real one now. The weakest jumper in the roster rises
// 239px on a full jump (impulse 780, one air jump at x0.92, gravity 2350), and
// 235 leaves a few pixels for the fact that landing ON a platform is not the
// same as touching its height at the apex. Anything under it, every fighter can
// make; anything over it, nobody can.
//
// COMFY_RISE is what used to be the ceiling, which makes it an honest warning
// band: 175–235 is a hop that WORKS but wants a deliberate double jump, and
// saying so is more useful than refusing it.
const MAX_RISE = 235;        // physical ceiling per hop (weakest full jump 239)
const COMFY_RISE = 175;      // above this it needs a real double jump — warn
// HOW HIGH A PLATFORM MAY SIT — and why it is not 235 any more.
//
// The old cap was 235, chosen so a full jump from the highest platform could
// not carry a fighter past y = 0. That reads like a safety rule and is not one:
// y = 0 is the top of the world RECT and means nothing mechanically. Above it
// there is painted backdrop (VIEW_BLEED bleeds the plate to y = -400) and no
// danger (BLAST.top, where a fighter dies, is y = -420). The rule was costing
// 200px of usable board to protect a line that does not exist.
//
// THE RULE THAT MATTERS is that a fighter must never end up ENTIRELY above the
// shot. Partly offscreen at the apex of a jump is ordinary in this genre;
// wholly gone is disorienting. So the test is the FEET — the lowest point of
// the body — against the top of the frame:
//
//   camera can show up to y     -260   (OVERSCAN_Y in camera.js; the same
//                                       number at every zoom, because
//                                       cam.y ≥ halfH - OVERSCAN_Y makes the
//                                       frame top cam.y - halfH ≥ -OVERSCAN_Y)
//   strongest full jump rises   434px  (jump 870 plus two air jumps at x0.92,
//                                       gravity 2350)
//   so a platform must sit at   y ≥ 434 - 260 = 174
//
// 170 is that, rounded down by the width of a rounding error so a board whose
// shards BOB can still sit at its authored height — Domain Core's orbit lifts
// its highest platform 24px on the way round, and those four pixels buy that
// at no real cost.
//
// This is deliberately NOT scaled by a board's gravity the way the reach
// budgets below are. Low gravity means a fighter rises further, so scaling it
// would make the one board that floats (Domain Core, x0.88) the most
// restricted board in the set — which is backwards: that board is the one whose
// whole idea is height. A maximal triple jump from its top shard can clear the
// frame for a few frames. That is a CAMERA limit (OVERSCAN_Y), not a fault in
// the board, and the place to fix it if it ever shows up in play is the camera.
const MIN_TOP_Y = 170;       // highest allowed platform
const ORBIT_SLACK = 24;      // domainCore shards bob ±24 in y
// How close a lip has to be to a wall's face to count as reachable off it. The
// wall jump's own reach is 18px from the body's edge (constants.js
// WALL_JUMP_REACH); this is that plus the sideways shove that carries you off
// the face, which is what actually lands you on a neighbouring platform.
const WALL_REACH = 120;
// How far two halves of a split floor may sit apart before it reads as a step
// rather than as one floor with a hole in it. Generous: a few pixels is a drag
// that landed a hair off, and nothing in the game measures it.
const LEVEL_SLOP = 12;

// Horizontal gap budget for a hop: plenty of drift on low hops, little near
// the apex of a maximum-height jump.
// How much DRIFT a hop of a given rise can spend. Plenty near the ground,
// almost none near the apex of a maximal double jump — the higher you are
// asking someone to go, the less of the jump is left for going sideways.
const gapBudget = (rise) => (rise <= 110 ? 220 : rise <= 145 ? 160 : rise <= 175 ? 120 : 90);

function horizontalGap(a, b) {
  if (a.x + a.w >= b.x && b.x + b.w >= a.x) return 0; // spans overlap
  return a.x + a.w < b.x ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
}

let errors = 0;
let warnings = 0;

for (const stage of STAGES) {
  const plats = stage.platforms;
  const mains = plats.filter((p) => p.kind === "main");
  const main = mains[0];
  const others = plats.filter((p) => !mains.includes(p));
  // THE TIER a match opens on: a drop-through `kind: "spawn"`, or any platform
  // marked `spawn: true` — including a main, for the board that wants to open
  // on solid ground with a floor still underneath it (stages.js spawnPlatform).
  const tier = plats.filter((p) => p.kind === "spawn" || p.spawn);
  const slack = stage.key === "domainCore" ? ORBIT_SLACK : 0;
  // A HOP IS WORTH MORE WHERE GRAVITY IS LOWER. Rise goes as v²/2g, so a board
  // that scales gravity scales every budget here by the reciprocal — Domain
  // Core's 0.88 buys 14% more height, and judging its shards against sea-level
  // numbers called reachable hops uncomfortable.
  const gMul = stage.mods?.gravityMul ?? 1;
  const maxRise = MAX_RISE / gMul;
  const comfyRise = COMFY_RISE / gMul;
  const problems = [];
  const warns = [];

  if (!main) problems.push("no main platform");
  if (plats[0] !== main) problems.push("main is not platforms[0]");
  // HOW MANY PIECES A FLOOR MAY COME IN. Two is the usual split; three is Curse
  // Maw, whose floor is a row of teeth with a gap between each. Past that it
  // stops being a floor with holes in it and starts being a set of stepping
  // stones, which is a `side` platform's job.
  if (mains.length > 3) problems.push(`${mains.length} main platforms (allowed 1–3)`);
  // A split floor is pieces of ONE floor: level with each other, with real
  // holes between them rather than overlaps or steps.
  if (mains.length >= 2) {
    const row = mains.slice().sort((p, q) => p.x - q.x);
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1];
      const b = row[i];
      // A WARNING, and only past a real step. Level halves are the usual shape,
      // but a board is allowed to put one side lower than the other — that is a
      // design, not a mistake — and a couple of pixels between them is a drag
      // that landed a hair off and means nothing to anybody playing.
      const step = Math.abs(a.y - b.y);
      if (step > LEVEL_SLOP) {
        warns.push(`the floor's pieces sit ${step}px apart (${a.y} vs ${b.y}) — a step, not one floor`);
      }
      const hole = b.x - (a.x + a.w);
      if (hole < 90) problems.push(`the floor's hole is only ${hole}px (want ≥ 90)`);
    }
  }
  // An ARCHETYPE guard, not a mechanical limit: nothing in the game cares how
  // many platforms a board has, but a board with thirty of them is not one of
  // the shapes docs/stage-variety-plan.md set out to build. Raised as the
  // boards got richer — a floor, a starting tier and an orbit field of shards
  // is nine before anybody has done anything unusual.
  if (others.length < 2 || others.length > 10) {
    problems.push(`${others.length} non-main platforms (allowed 2–10)`);
  }
  if (tier.length > 1) problems.push(`${tier.length} spawn tiers (allowed 0 or 1)`);
  // A PLATFORM BELOW THE FLOOR is unusual, not broken. It used to be an error
  // on the reading that the main is "the lowest surface", which was true of
  // every board when it was written. Bridge Duel now hangs two catch platforms
  // UNDER its bridge, which is a recovery decision, and nothing in the game
  // objects: you can stand on them, they simply have no grabbable ledges (only
  // a main does) and the blast line is a long way further down. So: say it,
  // because a slab that drifted below the floor by accident looks the same.
  for (const p of others) {
    if (p.y >= main.y) {
      warns.push(`(${p.x},${p.y}) hangs below the floor (y ${main.y}) — no ledges to grab on it`);
    }
  }
  // THE TIER A MATCH OPENS ON has to be somewhere a fighter can get back to
  // after being knocked down to the floor, or the storey below is a trap.
  if (tier.length === 1 && tier[0].kind !== "main") {
    const t = tier[0];
    const rise = main.y - t.y;
    if (rise > maxRise) problems.push(`the spawn tier is a ${rise}px hop off the floor (max ${Math.round(maxRise)})`);
    else if (rise > comfyRise) warns.push(`the spawn tier needs a ${rise}px hop off the floor`);
    // ...and wide enough that a crowd can line up on it (spawnXs insets 70px
    // a side, and CROWD_SPAN_MAX caps how far apart they stand).
    if (t.w < 300) problems.push(`the spawn tier is only ${t.w}px wide`);
  }
  const highest = Math.min(...plats.map((p) => p.y - slack));
  // A WARNING, not an error. Nothing breaks up there: no death line, painted
  // backdrop all the way, and the board is still playable. What it costs is
  // that the strongest jumpers leave the top of the shot entirely for a few
  // frames, and that is a CAMERA limit worth knowing about rather than a
  // layout somebody is not allowed to build. Whoever laid the board out is the
  // authority on whether the height is worth it.
  if (highest < MIN_TOP_Y) {
    warns.push(`highest platform y ${highest} is above y ${MIN_TOP_Y} — a full jump `
      + `from it takes the strongest fighters entirely out of frame`);
  }

  // A WALL IS A LADDER (fighter.js wallAgainst). A jump taken against a wall
  // pushes off it without spending the air jump, so a tall wall can be climbed
  // as long as you keep reaching it — which makes everything alongside its face
  // reachable, whatever the rise from the nearest platform. A board can be
  // built to climb, and an audit that did not know it would call a deliberate
  // vertical layout broken.
  //
  // A wall counts once you can GET to it: its foot has to be standing at or
  // above something already reached, or its face has to run past it.
  const walls = plats.filter((p) => p.kind === "wall");
  const reachesWall = (w, from) => {
    const foot = w.y + w.h;
    const beside = horizontalGap(w, from) <= WALL_REACH;
    // ...level with the face, or standing on top of it
    return beside && foot >= from.y - maxRise && w.y <= from.y + WALL_REACH;
  };
  /** Everything a climbable wall opens up: any platform whose lip is beside its
   *  face, anywhere up its height, plus one hop above the top it ends at. */
  const alongWall = (w, p) =>
    horizontalGap(w, p) <= WALL_REACH
    && p.y >= w.y - maxRise && p.y <= w.y + w.h + WALL_REACH;

  // Reachability: climb from the main, admitting any platform some already-
  // reached surface can hop to within the rise/gap budget.
  const reached = new Set(mains);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of others) {
      if (reached.has(p)) continue;
      // judge the platform by its EASIEST admitting hop, not the first found
      let best = Infinity;
      for (const from of reached) {
        const rise = from.y - p.y + slack; // worst case: target at orbit top
        if (rise > maxRise) continue;
        if (horizontalGap(from, p) > gapBudget(Math.max(0, rise) * gMul)) continue;
        best = Math.min(best, rise);
      }
      if (best === Infinity) continue;
      reached.add(p);
      if (best > comfyRise) warns.push(`(${p.x},${p.y}) needs a ${Math.round(best)}px hop`);
      grew = true;
    }
    // ...and everything a wall you can already get to puts within reach.
    for (const w of walls) {
      if (![...reached].some((from) => from === w || reachesWall(w, from))) continue;
      reached.add(w);
      for (const p of others) {
        if (reached.has(p) || !alongWall(w, p)) continue;
        reached.add(p);
        grew = true;
      }
    }
  }
  for (const p of others) {
    if (!reached.has(p)) problems.push(`platform at (${p.x},${p.y}) w${p.w} is unreachable`);
  }

  const shape = mains.length >= 2 ? "split" : tier.length ? "floor" : "classic";
  const label = `${stage.key.padEnd(16)} ${shape.padEnd(7)} main+${others.length}`;
  if (problems.length) {
    errors += problems.length;
    console.log(`FAIL ${label}: ${problems.join("; ")}`);
  } else if (warns.length) {
    warnings += warns.length;
    console.log(`warn ${label}: ${warns.join("; ")}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

console.log(`\n${errors} error(s), ${warnings} warning(s) across ${STAGES.length} stages`);
process.exit(errors ? 1 : 0);
