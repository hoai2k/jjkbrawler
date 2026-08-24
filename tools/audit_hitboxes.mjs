// Static audit of what the roster's attacks actually reach, and what the
// roster is actually shaped like — the measurements docs/hitbox-audit.md was
// written from, run against the live code so they cannot go stale.
//
// It answers the three questions the audit asked:
//
//   1. do hitboxes match the sprites?    the grace margin between the art's
//                                        painted reach and the hitbox's far
//                                        edge should be the SAME on everyone
//   2. is range variance meaningful?     spread across the roster, and whether
//                                        reach is priced in startup
//   3. does vertical work?               hurtbox coverage against drawn height,
//                                        and which platform gaps an up smash
//                                        can actually threaten
//
// Run: node tools/audit_hitboxes.mjs        (exit 1 on any invariant failure)

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// src/assets.js loads the manifest over fetch, which does not do file URLs.
// Serve it off disk instead — this is the only thing standing between the game
// modules and running headless.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const href = typeof url === "string" ? url : url.href;
  if (!href.startsWith("file:")) return realFetch(url);
  const text = await readFile(fileURLToPath(href), "utf8");
  return { ok: true, json: async () => JSON.parse(text), text: async () => text };
};

const { loadCoreAssets } = await import("../src/assets.js");
await loadCoreAssets();

const { CHARACTERS, CHARACTER_KEYS } = await import("../src/characters.js");
const { spriteManifest } = await import("../src/assets.js");
const { lightMove, heavyMove, visibleArtReach } = await import("../src/moves.js");
const { bodyMetrics, rosterReach, reachSourceName, moveReach, paintedReach } =
  await import("../src/silhouette.js");
const { reachFaults, FORWARD_STATES } = await import("../src/strike_reach.js");
const { HURTBOX } = await import("../src/constants.js");
const { MELEE_GRACE, ADDED_RANGE, BODY, REACH_NUDGE } = await import("../src/config_tuning.js");
const { STAGES } = await import("../src/stages.js");

const n0 = (v) => Math.round(v).toString();
const n2 = (v) => v.toFixed(2);
const pad = (s, w) => String(s).padStart(w);

let errors = 0;
const fail = (msg) => { console.log("  FAIL " + msg); errors += 1; };

// ------------------------------------------------------------------- 1 & 2

const rows = CHARACTER_KEYS.map((key) => {
  const char = CHARACTERS[key];
  const b = bodyMetrics(key);
  const light = lightMove(char, "side");
  const heavy = heavyMove(char, "side");
  const up = heavyMove(char, "up");
  return {
    key, b,
    art: b.reach,
    // The art each of those two is BUILT from, which is per move now: a jab
    // and a spear thrust are different drawings and no longer share a number.
    lightArt: visibleArtReach(char, light.anim),
    heavyArt: visibleArtReach(char, heavy.anim),
    lightTip: light.ox + light.w,
    heavyTip: heavy.ox + heavy.w,
    startup: heavy.delay * 1000,
    upTop: -up.oy,                       // how far above the feet it reaches
    sweet: heavy.critBand ? heavy.critBand.center : 0,
    measured: b.measured,
  };
});

console.log(`\n=== reach, against the art it is drawn from (source: ${reachSourceName()}) ===`);
console.log("char         drawnH  drawn  reach  from      jabArt  jabTip  smashArt  smashTip   grace"
  + "  startup  upSmashTop  sweet");
for (const r of [...rows].sort((a, b) => b.heavyTip - a.heavyTip)) {
  console.log(
    r.key.padEnd(12), pad(n0(r.b.height), 6),
    pad(n0(r.b.reachMeasured), 6), pad(n0(r.art), 6), r.b.reachFrom.padEnd(9),
    pad(n0(r.lightArt), 6), pad(n0(r.lightTip), 7),
    pad(n0(r.heavyArt), 8), pad(n0(r.heavyTip), 9),
    pad(n0(r.heavyTip - r.heavyArt), 7), pad(n0(r.startup) + "ms", 8),
    pad(n0(r.upTop), 11), pad(r.sweet ? n0(r.sweet) : "-", 6),
    r.measured ? "" : "  (unmeasured art)");
}

// THE TWO FLOORS EVERY FORWARD ATTACK HAS TO CLEAR.
//
// A hitbox is built from where the blow LANDS (the verified strike point) plus
// a margin, and floored at where the DRAWING stops plus a smaller one. Both
// have to hold on every forward move, and the second is the one a player feels:
// a swing that visually overlaps an opponent and does nothing is the complaint
// the floor exists to answer. Dagon's side smash used to end 3 px inside his
// own ink and 77 of these 204 were within 8 px of theirs.
const FORWARD = [
  ["light", "jab", "light", "jab"],
  ["light", "side", "light", "side"],
  ["light", "down", "crouchAttack", "down"],
  ["light", "air", "airLight", "air"],
  ["heavy", "side", "sideHeavy", "sideHeavy"],
  ["heavy", "air", "airLight", "airHeavy"],
];
let inkFloored = 0, checked = 0;
const overArt = [], overPoint = [];
for (const key of CHARACTER_KEYS) {
  const char = CHARACTERS[key];
  for (const [kind, variant, state, graceKey] of FORWARD) {
    const m = kind === "light" ? lightMove(char, variant) : heavyMove(char, variant);
    const tip = m.ox + m.w;
    const point = moveReach(key, state);
    const ink = paintedReach(key, state);
    checked += 1;
    const pastPoint = tip - point;
    overPoint.push(pastPoint);
    if (pastPoint < MELEE_GRACE[graceKey] * MELEE_GRACE.scale - 0.5) {
      fail(`${key} ${kind}.${variant}: connects ${n0(pastPoint)} px past the strike point, `
        + `under the ${n0(MELEE_GRACE[graceKey])} px MELEE_GRACE.${graceKey} says it gets`);
    }
    if (ink == null) continue;
    const pastArt = tip - ink;
    overArt.push(pastArt);
    if (pastArt < ADDED_RANGE.pastArt - 0.5) {
      fail(`${key} ${kind}.${variant}: the hitbox ends ${n0(pastArt)} px past the ink, `
        + `inside ADDED_RANGE.pastArt (${ADDED_RANGE.pastArt}) — this swing can overlap `
        + `an opponent on screen and do nothing`);
    }
    if (Math.abs(pastArt - ADDED_RANGE.pastArt) < 0.5) inkFloored += 1;
  }
}
console.log(`\nmargins over ${checked} forward attacks: `
  + `${n0(Math.min(...overPoint))}-${n0(Math.max(...overPoint))} px past the strike point `
  + `(MELEE_GRACE ${MELEE_GRACE.jabEarly}-${MELEE_GRACE.sideHeavy} plus ADDED_RANGE `
  + `${ADDED_RANGE.long}-${ADDED_RANGE.short} by reach), `
  + `${n0(Math.min(...overArt))}-${n0(Math.max(...overArt))} px past the ink`);
console.log(`  ${inkFloored} of ${checked} are decided by the ink floor rather than the `
  + `strike point — a drawing that carries on past where the blow lands`);

// --------------------------------------------- 1a: tempering, and the order
//
// The shipped range is the measured one pulled toward the roster median
// (BODY.reachTrust) and then nudged by hand for anybody who needed it
// (REACH_NUDGE). Both are deliberate distortions of the art, so both are shown,
// and the one thing neither may do is change WHO reaches further than whom —
// that part is the drawings' to decide.
const tempered = rows.map((r) => ({
  key: r.key, drawn: r.b.reachMeasured, shipped: r.b.reach,
  moved: r.b.reach - r.b.reachMeasured,
}));
const biggest = [...tempered].sort((a, b) => Math.abs(b.moved) - Math.abs(a.moved))[0];
console.log(`\ntempering: reachTrust ${BODY.reachTrust}, `
  + `${Object.keys(REACH_NUDGE).length} hand nudge(s) — `
  + `drawn spread ${n2(Math.max(...tempered.map((t) => t.drawn))
    / Math.min(...tempered.map((t) => t.drawn)))}x `
  + `-> shipped ${n2(Math.max(...tempered.map((t) => t.shipped))
    / Math.min(...tempered.map((t) => t.shipped)))}x, `
  + `largest single move ${n0(biggest.moved)} px (${biggest.key})`);

// Order, both ways round: sort by what was drawn, and the shipped numbers must
// come out sorted too. Ties are not inversions — two fighters drawn the same
// length may land the same length.
const byDrawn = [...tempered].sort((a, b) => a.drawn - b.drawn);
for (let i = 1; i < byDrawn.length; i++) {
  const lo = byDrawn[i - 1], hi = byDrawn[i];
  if (lo.drawn < hi.drawn && lo.shipped > hi.shipped) {
    fail(`tempering reordered the roster: ${hi.key} is drawn longer than ${lo.key} `
      + `(${n0(hi.drawn)} vs ${n0(lo.drawn)}) but ships shorter `
      + `(${n0(hi.shipped)} vs ${n0(lo.shipped)}) — a nudge in REACH_NUDGE is too big`);
  }
}

// ------------------------------------------------- 1b: the points behind it
//
// Under the sprite source a fighter's range is the strike points a person
// placed on their drawings (src/strike_reach.js). A point that cannot be read
// as a reach is not used and not clamped — the move falls back to the
// fighter's scalar and the verification bench reopens the item — but a silent
// fallback is a range nobody can explain, so it is said out loud here.
const faults = CHARACTER_KEYS
  .flatMap((key) => reachFaults(key).map((f) => ({ key, ...f })));
if (faults.length) {
  console.log(`\nstrike points that cannot be read as a reach (${faults.length}) — `
    + `these moves fall back to the fighter's scalar, and the verification bench `
    + `lists them as work:`);
  for (const f of faults) {
    console.log(`  ${f.key} · ${f.state} (${f.frame}): x ${f.x} — ${f.why} `
      + `(usable band ${f.lo}-${f.hi} px)`);
  }
}
const unreviewed = CHARACTER_KEYS.filter((key) => bodyMetrics(key).reachFrom !== "verified");
if (unreviewed.length) {
  console.log(`\nno usable verified point in any forward attack `
    + `(${FORWARD_STATES.join(", ")}), so range comes off the silhouette scan: `
    + unreviewed.join(", "));
}

// Which characters are being measured off art nobody has sized yet, and which
// have swing frames still waiting for the placement pass. An unplaced frame is
// skipped (src/silhouette.js), because a freshly delivered sprite sits at the
// intake pipeline's guess at its scale rather than a decision — so a character
// with unplaced swing art has a range that will move once somebody opens the
// workbench, and is worth knowing about before anyone tunes around it.
const pending = [];
for (const key of CHARACTER_KEYS) {
  const frames = spriteManifest.characters[key] || {};
  const swing = ["attack_light_a", "attack_light_b", "attack_heavy_a", "attack_heavy_b"]
    .filter((k) => frames[k]);
  const unplaced = swing.filter((k) => {
    const e = frames[k].edited;
    return !e || !["renderScale", "ox", "bodyBottom"].some((f) => f in e);
  });
  if (unplaced.length) pending.push(`${key} (${unplaced.join(", ")})`);
}
if (pending.length) {
  console.log(`\nswing frames still awaiting the placement pass — range is provisional for `
    + `${pending.length} fighter(s):`);
  for (const p of pending) console.log("  " + p);
}
const unmeasured = rows.filter((r) => !r.b.placed).map((r) => r.key);
if (unmeasured.length) {
  console.log(`\nno placed swing art at all (measured off raw delivery): ${unmeasured.join(", ")}`);
}

const tips = rows.map((r) => r.heavyTip);
const spread = Math.max(...tips) / Math.min(...tips);
console.log(`heavy tip: ${n0(Math.min(...tips))}-${n0(Math.max(...tips))} px, `
  + `spread ${n2(spread)}x (was 1.13x)`);
if (spread < 1.25) {
  fail(`range spread is only ${n2(spread)}x — the roster's art spans far more than that, `
    + `so something is flattening it`);
}

console.log(`\ncorrelations (n=${rows.length}):`);
const corr = (a, b) => {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
};
const rStart = corr(tips, rows.map((r) => r.startup));
console.log(`  reach <-> startup   ${n2(rStart)}   (was -0.08; range has to cost something)`);
if (rStart < 0.3) {
  fail(`reach and startup correlate at ${n2(rStart)} — REACH_PRICE is not biting, so long `
    + `arms are free`);
}

// ------------------------------------------------------- 2b: dash attacks

// The two attacks a run has (moves.js, variant "dash"). They are the same
// forward geometry as the standing pair, so they inherit the grace margin
// checked above — what needs watching is the TRADE, since a dash attack that
// reached further AND recovered faster than the tilt it replaces would simply
// retire the standing game.
console.log("\n=== dash attacks vs the standing move they replace ===");
console.log("char         lightTip  dashTip   lightEnd  dashEnd   heavyTip  dashHvyTip");
for (const key of CHARACTER_KEYS) {
  const char = CHARACTERS[key];
  const side = lightMove(char, "side");
  const dash = lightMove(char, "dash");
  const heavy = heavyMove(char, "side");
  const dashHeavy = heavyMove(char, "dash");
  const tip = (m) => m.ox + m.w;
  if (dash.recover <= side.recover) {
    fail(`${key}: the dash attack recovers in ${n0(dash.recover * 1000)}ms against the side `
      + `tilt's ${n0(side.recover * 1000)}ms — a run has to cost something`);
  }
  if (dashHeavy.recover <= heavy.recover) {
    fail(`${key}: the heavy dash attack recovers faster than the side smash it skips the `
      + `charge for`);
  }
  if (dash.dmg <= side.dmg) {
    fail(`${key}: the dash attack hits for ${dash.dmg} against the side tilt's ${side.dmg} — `
      + `it commits harder, so it has to pay better`);
  }
  console.log(key.padEnd(12), pad(n0(tip(side)), 9), pad(n0(tip(dash)), 8),
    pad(n0(side.recover * 1000) + "ms", 9), pad(n0(dash.recover * 1000) + "ms", 8),
    pad(n0(tip(heavy)), 9), pad(n0(tip(dashHeavy)), 11));
}

// ----------------------------------------------------------------------- 3

console.log("\n=== bodies ===");
console.log("char         drawnH  hurtW  hurtH  coverage");
for (const r of [...rows].sort((a, b) => b.b.height - a.b.height)) {
  const h = r.b.height * HURTBOX.standH;
  console.log(r.key.padEnd(12), pad(n0(r.b.height), 6), pad(n0(r.b.width), 6),
    pad(n0(h), 6), pad(n2(h / r.b.height) + "x", 9));
}
const heights = rows.map((r) => r.b.height);
const widths = rows.map((r) => r.b.width);
console.log(`\nheight ${n0(Math.min(...heights))}-${n0(Math.max(...heights))} `
  + `(spread ${n2(Math.max(...heights) / Math.min(...heights))}x), `
  + `width ${n0(Math.min(...widths))}-${n0(Math.max(...widths))} `
  + `(spread ${n2(Math.max(...widths) / Math.min(...widths))}x, was 1.00x — one box for everyone)`);
if (Math.max(...widths) === Math.min(...widths)) {
  fail("every fighter is the same width — hurtboxes are not coming off the art");
}

// Platform pressure. An opponent standing `gap` px above has a hurtbox whose
// bottom edge is at -gap; an up smash reaching `upTop` above the feet threatens
// them when it clears that. Whether a given platform is contestable is a real
// design decision — this reports which way each one currently falls, so it is
// a decision rather than an accident.
console.log("\n=== platform gaps vs up smash ===");
const upTops = rows.map((r) => r.upTop);
const [loUp, hiUp] = [Math.min(...upTops), Math.max(...upTops)];
console.log(`up smash reaches ${n0(loUp)}-${n0(hiUp)} px above the feet across the roster\n`);
const buckets = { none: [], some: [], all: [] };
for (const stage of STAGES) {
  const main = stage.platforms.find((p) => p.kind === "main");
  for (const p of stage.platforms) {
    if (p === main) continue;
    const gap = main.y - p.y;
    const who = upTops.filter((t) => t >= gap).length;
    const kind = who === 0 ? "none" : who === upTops.length ? "all" : "some";
    buckets[kind].push(`${stage.key}+${n0(gap)}`);
  }
}
console.log(`  every fighter can contest : ${buckets.all.length} platforms`);
console.log(`  only the tall ones can    : ${buckets.some.length} platforms  `
  + (buckets.some.slice(0, 6).join(", ") || ""));
console.log(`  nobody can                : ${buckets.none.length} platforms  `
  + (buckets.none.slice(0, 6).join(", ") || ""));
console.log("\n  (a mix is fine and wanted — this is here so the mix stays a decision.\n"
  + "   'only the tall ones' is the interesting bucket: those gaps are where being\n"
  + "   drawn tall buys real stage control.)");

// Hand-authored kit hitboxes. Special/ultimate `p` blocks write oy/w/h as
// literals for the reference body and are height-scaled at spawn
// (combat.js spawnMeleeScaled) — so the literals themselves must stay inside
// a reference-body sanity band, or a typo'd offset floats a hit above every
// head on the roster and nothing else would ever say so.
console.log("\n=== hand-authored special hitboxes (reference-body literals) ===");
let specialsChecked = 0;
const checkBlock = (key, name, p) => {
  if (!p || typeof p !== "object") return;
  if (p.w == null && p.h == null) return; // not a melee rect block
  specialsChecked++;
  if (p.oy != null && (p.oy < -300 || p.oy > 60)) {
    fail(`${key}.${name}: oy ${p.oy} is outside the reference band (-300..60) — `
      + `authored offsets are per reference body and scale at spawn`);
  }
  if (p.h != null && (p.h <= 0 || p.h > 360)) {
    fail(`${key}.${name}: h ${p.h} is outside the reference band (0..360)`);
  }
};
for (const key of CHARACTER_KEYS) {
  const char = CHARACTERS[key];
  for (const [slot, cfg] of Object.entries(char.specials || {})) {
    checkBlock(key, `specials.${slot}`, cfg?.p);
  }
  checkBlock(key, "ultimate", char.ultimate?.p);
}
console.log(`  ${specialsChecked} authored blocks checked against the reference band`);

// Model-derived reach must not go stale: the rigs and pose libraries are in
// flux, and a reach measured from a body that no longer exists is exactly the
// hand-typed-number problem this audit was written to end. The derive tool's
// --check recomputes the input fingerprint without a browser.
console.log("\n=== model reach envelopes ===");
try {
  const toolPath = fileURLToPath(new URL("./derive_attack_envelopes.mjs", import.meta.url));
  execFileSync(process.execPath, [toolPath, "--check"], { stdio: "pipe" });
  console.log("  config_model_reach.js is current with the rigs and pose libraries");
} catch (err) {
  // REPORTS, does not fail. MODEL_REACH is read only while a MODEL backend is
  // drawing (`bodySource`, src/silhouette.js), and those backends are
  // experimental and reachable by `?render=` alone — so a stale config cannot
  // move a single number in the game that ships, and failing here stops
  // everyone's build over a measurement only a URL can reach. Round 25 left it
  // stale and red on main for exactly that reason.
  //
  // It is still worth saying loudly, because the fix is one command and the
  // person who redrew the art is the one who knows whether the new numbers are
  // right: node server.mjs & node tools/derive_attack_envelopes.mjs
  console.log(`  STALE (experimental backends only) — `
    + `${(err.stderr || err.stdout || "").toString().trim() || err.message}`);
}

// Hurtbox fits are HUMAN answers about DRAWINGS, and drawings change. This
// does not fail the audit — a fit reviewed against slightly older art is still
// a better box than none, and failing here would block an art commit on a
// review queue. It reports, so the work is visible and the bench (which asks
// again for exactly these) is not the only place it shows.
// THE ONE BOX THAT IS NOT MEASURED FROM THE FOOT LINE, and the one that was
// therefore wrong for a long time without anything noticing. A hang is placed
// by the grip anchor on the platform corner (render.js `anchorTo`), so its box
// is hung from the same corner (combat.js, hurtbox_art.js `ledgeBox`) — and
// the only way to know the two agree is to measure the drawing against it.
//
// Everything below is quoted RELATIVE TO THE LIP: y down from it in units of
// the fighter's height, x from it along the facing in units of their width.
console.log("\n=== the hang box against the body it is drawn beside ===");
{
  const { resolvedAnim, anchorPoint, frameFootY } = await import("../sprites/src/sprites.js");
  const { frameMeta } = await import("../src/assets.js");
  const { CELL_W, LEDGE_HANG_X, LEDGE_HANG_Y } = await import("../src/constants.js");
  const { ledgeBox } = await import("../src/hurtbox_art.js");
  const hangs = [];
  for (const key of CHARACTER_KEYS) {
    const frames = resolvedAnim(key, "ledge")?.frames || [];
    const frame = frames[0];
    const m = frame ? frameMeta(key, frame) : null;
    if (!m || !Number.isFinite(m.h)) continue;
    const b = bodyMetrics(key);
    const scale = (CHARACTERS[key].scale ?? 1) * (m.renderScale || 1);
    const facing = m.faceLeft ? -1 : 1;
    const foot = frameFootY(m), ox = m.ox ?? 0, oy = m.oy ?? 0;
    const wx = (cx) => (cx - CELL_W / 2) * scale * facing;
    const wy = (cy) => (cy - foot) * scale;
    const grip = anchorPoint(key, frame, "ledge", m);
    if (!grip) continue;
    // The drawing lands with its grip on the corner, so measure it from there.
    const dx = LEDGE_HANG_X - wx(grip.x), dy = -LEDGE_HANG_Y - wy(grip.y);
    const xs = [wx(ox + (m.bodyLeft ?? 0)) + dx, wx(ox + (m.bodyRight ?? m.w)) + dx];
    const art = {
      left: Math.min(...xs) - LEDGE_HANG_X, right: Math.max(...xs) - LEDGE_HANG_X,
      top: wy(oy + (m.bodyTop ?? 0)) + dy + LEDGE_HANG_Y,
      bottom: wy(oy + m.h) + dy + LEDGE_HANG_Y,
    };
    const g = ledgeBox(key);
    const box = { left: g.cx - g.w / 2, right: g.cx + g.w / 2, top: 0, bottom: g.h };
    const drawn = art.bottom - art.top;
    const covered = Math.max(0, Math.min(art.bottom, box.bottom) - Math.max(art.top, box.top));
    hangs.push({
      key, H: b.height, W: b.width, art, box, frame,
      down: art.bottom / b.height,
      cover: drawn > 0 ? covered / drawn : 0,
    });
  }
  console.log("char         drawnDown  boxDown   artL   artR   boxL   boxR  covered");
  for (const r of [...hangs].sort((a, b) => b.down - a.down)) {
    console.log(r.key.padEnd(12),
      pad(n2(r.down) + "x", 9), pad(n2(r.box.bottom / r.H) + "x", 8),
      pad(n2(r.art.left / r.W), 6), pad(n2(r.art.right / r.W), 6),
      pad(n2(r.box.left / r.W), 6), pad(n2(r.box.right / r.W), 6),
      pad(n0(r.cover * 100) + "%", 8));
  }
  const drops = hangs.map((r) => r.down);
  console.log(`\nhang length below the lip: ${n2(Math.min(...drops))}-${n2(Math.max(...drops))} `
    + `of height, box ${HURTBOX.ledgeH}x — a hang drawing is longer than a standing one, `
    + `because the arm is over the head`);
  // The failure this section exists for: a box built up from the fighter's own
  // y instead of the lip covered ~37% of the drawn body and floated the other
  // half of itself over the stage, where nobody was. The bar is not 100% and
  // should not be — the box stops short of the trailing feet on purpose, the
  // same bargain `standH` makes with hair, and a drawing with a long dangle
  // (jogo's is 1.7 heights) spends more of itself outside it. Three fifths is
  // "the box is on the body"; below that it is somewhere else.
  for (const r of hangs) {
    if (r.cover < 0.6) {
      fail(`${r.key}: the hang box covers only ${n0(r.cover * 100)}% of the drawn body `
        + `(${r.frame}) — it is hung from the lip, so it should sit on it`);
    }
    if (r.art.right < r.box.left || r.art.left > r.box.right) {
      fail(`${r.key}: the hang box and the hang drawing do not overlap at all in x`);
    }
  }
}

console.log("\n=== hurtbox fits vs the art they were reviewed against ===");
{
  const { outstandingFits, HURTBOX_CASES } = await import("../src/hurtbox_art.js");
  const { missing, stale } = outstandingFits(CHARACTER_KEYS);
  const total = CHARACTER_KEYS.length * HURTBOX_CASES.length;
  console.log(`  ${total - missing.length - stale.length} of ~${total} case(s) fitted `
    + `against the art as it stands`);
  const list = (label, xs) => {
    if (!xs.length) return;
    console.log(`  ${label}: ${xs.length}`);
    for (let i = 0; i < xs.length; i += 8) console.log(`    ${xs.slice(i, i + 8).join(" ")}`);
  };
  list("never fitted", missing);
  list("REDRAWN SINCE — the bench will ask again", stale);
  if (!missing.length && !stale.length) console.log("  every case is current");
}

console.log(`\nroster median art reach: ${n0(rosterReach())} px`
  + `   MELEE_GRACE.scale: ${MELEE_GRACE.scale}`);
console.log(errors ? `\n${errors} invariant(s) failed` : "\nall invariants hold");
process.exit(errors ? 1 : 0);
