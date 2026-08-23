// Static audit of stage platform layouts (src/stages.js) against the
// movement budget in docs/stage-variety-plan.md ("Platform configurations"):
//
//   - the main platform(s) are the lowest surface — one on most boards, two on
//     the six with a split floor, and they sit level with each other
//   - a board with a lower floor carries exactly one `kind: "spawn"` tier, the
//     platform a match opens on, and it is above the floor and reachable from it
//   - every stage has 2–8 platforms besides the main
//   - every platform is reachable by the WEAKEST jumper (jump 780 @ g 2350:
//     single hop rises 129 px, single + air jump ~239 px) via some chain of
//     hops — max vertical rise per hop 175 px, with a horizontal-gap budget
//     that shrinks as the rise grows
//   - the highest platform sits at y ≥ 235, so a full jump from it cannot
//     leave the top of the board (y = 0)
//
// Run: node tools/audit_stage_reach.mjs   (exit 1 on any error)

import { STAGES } from "../src/stages.js";

const MAX_RISE = 175;        // hard ceiling per hop (weakest reach is ~239)
const COMFY_RISE = 145;      // above this, flag as a warning
const MIN_TOP_Y = 235;       // highest allowed platform
const ORBIT_SLACK = 24;      // domainCore shards bob ±24 in y

// Horizontal gap budget for a hop: plenty of drift on low hops, little near
// the apex of a maximum-height jump.
const gapBudget = (rise) => (rise <= 110 ? 220 : rise <= 145 ? 160 : 90);

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
  const tier = plats.filter((p) => p.kind === "spawn");
  const slack = stage.key === "domainCore" ? ORBIT_SLACK : 0;
  const problems = [];
  const warns = [];

  if (!main) problems.push("no main platform");
  if (plats[0] !== main) problems.push("main is not platforms[0]");
  if (mains.length > 2) problems.push(`${mains.length} main platforms (allowed 1 or 2)`);
  // A split floor is two halves of ONE floor: level with each other, with a
  // real hole between them rather than an overlap or a step.
  if (mains.length === 2) {
    const [a, b] = mains.slice().sort((p, q) => p.x - q.x);
    if (a.y !== b.y) problems.push(`split floor halves are not level (${a.y} vs ${b.y})`);
    const hole = b.x - (a.x + a.w);
    if (hole < 90) problems.push(`split floor's hole is only ${hole}px (want ≥ 90)`);
  }
  if (others.length < 2 || others.length > 8) {
    problems.push(`${others.length} non-main platforms (allowed 2–8)`);
  }
  if (tier.length > 1) problems.push(`${tier.length} spawn tiers (allowed 0 or 1)`);
  for (const p of others) {
    if (p.y >= main.y) problems.push(`platform at (${p.x},${p.y}) is not above the main (y ${main.y})`);
  }
  // THE TIER A MATCH OPENS ON has to be somewhere a fighter can get back to
  // after being knocked down to the floor, or the storey below is a trap.
  if (tier.length === 1) {
    const t = tier[0];
    const rise = main.y - t.y;
    if (rise > MAX_RISE) problems.push(`the spawn tier is a ${rise}px hop off the floor (max ${MAX_RISE})`);
    else if (rise > COMFY_RISE) warns.push(`the spawn tier needs a ${rise}px hop off the floor`);
    // ...and wide enough that a crowd can line up on it (spawnXs insets 70px
    // a side, and CROWD_SPAN_MAX caps how far apart they stand).
    if (t.w < 300) problems.push(`the spawn tier is only ${t.w}px wide`);
  }
  const highest = Math.min(...plats.map((p) => p.y - slack));
  if (highest < MIN_TOP_Y) problems.push(`highest platform y ${highest} above the cap (min ${MIN_TOP_Y})`);

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
        if (rise > MAX_RISE) continue;
        if (horizontalGap(from, p) > gapBudget(Math.max(0, rise))) continue;
        best = Math.min(best, rise);
      }
      if (best === Infinity) continue;
      reached.add(p);
      if (best > COMFY_RISE) warns.push(`(${p.x},${p.y}) needs a ${Math.round(best)}px hop`);
      grew = true;
    }
  }
  for (const p of others) {
    if (!reached.has(p)) problems.push(`platform at (${p.x},${p.y}) w${p.w} is unreachable`);
  }

  const shape = mains.length === 2 ? "split" : tier.length ? "floor" : "classic";
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
