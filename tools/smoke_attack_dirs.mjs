// CAN A PLAYER ACTUALLY THROW EVERY ATTACK THE STICK IS SUPPOSED TO OFFER?
//
//     node server.mjs   then:  node tools/smoke_attack_dirs.mjs [baseUrl]
//
// The light button has three answers in it and the stick picks between them:
//
//   straight down   the DOWN ATTACK — its own move, its own low box, and its
//                   own drawing (`crouchAttack`), so it is visible as itself.
//   a DIAGONAL      the neutral attack, swung to the angle the stick is
//                   holding. The drawing does not change; the strike arc turns
//                   with the box, and that is the whole of how it reads.
//   anything else   the jab, the side tilt, the dash attack.
//
// WHY THIS EXISTS. Every one of those was reachable in the code and two of
// them were not reachable by a PLAYER, because input.js applied a square
// deadzone and handed the angle-shaped result to a feature asking an angle
// question: shallow diagonals (12-24.9 degrees) could not be expressed at all.
// The fix moved each threshold to the feature that wanted it
// (tools/check_stick_angles.mjs guards that end), and this guards the other:
// it drives the REAL pad snapshot into the REAL updateFighter and names what
// came out. A deadzone, a threshold or a dispatch order that eats one of these
// again fails here, in the terms a player would report it in.
//
// IT READS THE SPAWNED HITBOX, not the move. `drawStrikeArcs` (render.js) is
// handed the box `spawnMelee` copies out of the move, so a field that copy
// drops is a field the renderer never sees — and this asked the move, so for as
// long as aiming has existed it reported turned crescents while the game drew
// every one of them dead level. `tools/check_strike_arcs.mjs` guards the copy
// itself now; this reads the box for the same reason, so the angle it prints is
// the angle on screen.
//
// The sim is parked first, so the only thing stepping this fighter is the test.
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(400);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 20000 });
await page.locator(".stage-card").nth(0).click();
for (let waited = 0; ; waited += 150) {
  const ready = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 0;
  });
  if (ready) break;
  if (waited > 90000) throw new Error("match never started");
  await page.waitForTimeout(150);
}

/**
 * Hold the stick at `deg` above horizontal (negative is down, forward is +x),
 * press light, and report the attack that came out.
 *
 * The stick goes in as a REAL pad reading — `padSnapshot` and the same
 * post-processing `playerInput` does — so the deadzones and thresholds under
 * test are the ones a player's thumb meets.
 */
const rows = await page.evaluate(async (angles) => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { blankInput, padSnapshot } = await import("/src/input.js");
  const { strikeArcs } = await import("/src/moves.js");
  const { bodyMetrics } = await import("/src/silhouette.js");
  const { hurtbox } = await import("/src/combat.js");
  const { strikePoint } = await import("/src/strike_points.js");

  state.phase = "paused";
  const f = state.fighters[0];
  state.fighters[1].x = -9999;              // nobody to trade with
  const main = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  const dt = 1 / 60;
  const D = 180 / Math.PI;

  const padAt = (x, y) => ({
    index: 0, axes: [x, y, 0, 0],
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
  });
  const padInput = (x, y, patch = {}) => {
    const merged = { ...blankInput(), ...padSnapshot(padAt(x, y)), ...patch };
    merged.dirX = (merged.right ? 1 : 0) - (merged.left ? 1 : 0);
    if (!merged.moveX) merged.moveX = merged.dirX;
    if (!merged.moveY) merged.moveY = (merged.down ? 1 : 0) - (merged.up ? 1 : 0);
    return merged;
  };
  const reset = () => Object.assign(f, {
    x: main.x + main.w / 2, y: main.y, vx: 0, vy: 0, grounded: true, hitstun: 0,
    action: null, charging: false, crouching: false, crouchGrace: 0, dashT: 0,
    walking: false, facing: 1, facingVis: 1, aimPoint: null, jabStep: 0,
    jabResetT: 0, dead: false, respawnTimer: 0, hitPause: 0, shielding: false,
    ledge: null, ledgeMove: null, prone: 0, attackAim: null,
  });

  const bodyH = bodyMetrics(f.spriteChar || f.charKey).height;
  const blank = { anim: "NONE", label: "-", tilt: null, arc: null, radius: null,
    pivotY: null, tipX: null, tipY: null, verdict: "-", hurtW: 0, hurtH: 0 };

  const throwAt = (deg, button) => {
    reset();
    state.hitboxes.length = 0;
    const r = deg * Math.PI / 180;
    const x = Math.cos(r), y = -Math.sin(r);       // canvas y: up is negative
    // Hold before pressing, so a crouch has time to establish — the input a
    // player performs, not a single synthetic frame.
    for (let i = 0; i < 8; i++) updateFighter(f, dt, padInput(x, y));
    updateFighter(f, dt, padInput(x, y, { [`${button}P`]: true }));
    // A smash has to be let go of. Hold it a few frames, then release, so the
    // heavy button is tested as a player uses it rather than as a tap the
    // charge state never sees.
    if (button === "heavy") {
      for (let i = 0; i < 5; i++) updateFighter(f, dt, padInput(x, y, { heavy: true }));
      updateFighter(f, dt, padInput(x, y));
    }
    for (let i = 0; i < 60; i++) {
      updateFighter(f, dt, padInput(x, y));
      const m = f.action?.move;
      const box = state.hitboxes.find((h) => h.owner === f);
      if (!m || !box) continue;
      // THE BOX, not the move — see the note at the top of this file.
      const arcs = strikeArcs(box, bodyH);
      const a = arcs[0] || null;
      const hb = hurtbox(f);
      return {
        deg, button, anim: m.anim, label: m.label,
        tilt: Math.round((box.aimTilt || 0) * D),
        arc: a ? Math.round(a.aim * D) : null,
        radius: a ? Math.round(a.radius) : null,
        pivotY: a ? Math.round(a.pivotY) : null,
        // Where the crescent's own middle lands, relative to the fighter's feet
        // — the one number a player is actually looking at.
        tipX: a ? Math.round(a.radius * Math.cos(a.aim)) : null,
        tipY: a ? Math.round(a.pivotY + a.radius * Math.sin(a.aim)) : null,
        verdict: f.attackAim?.verdict ?? "-",
        hurtW: Math.round(hb.w), hurtH: Math.round(hb.h),
      };
    }
    return { ...blank, deg, button };
  };

  // THE BAND'S EDGES COME FROM constants.js, never from a number typed here.
  // This file used to carry its own 12 / 62 / 46 beside the game's, which is
  // two places for one decision — and it sampled the hand-off EXACTLY, which
  // is worse than stale. See the note on `angles` below.
  const C = await import("/src/constants.js");
  const out = {
    bodyH: Math.round(bodyH), light: [], heavy: [],
    edges: {
      level: C.ATTACK_TILT_LEVEL_DEG,
      cardinal: C.ATTACK_TILT_CARDINAL_DEG,
      groundDown: C.ATTACK_TILT_GROUND_DOWN_DEG,
    },
  };
  // Where this fighter's rising attack is DRAWN landing, so the up arc can be
  // held to the arm that throws it rather than to a literal nobody measured.
  const up = strikePoint(f.spriteChar || f.charKey, "upHeavy");
  out.fistY = Math.round(up.y);
  out.fistSource = up.source;
  for (const deg of angles) out.light.push(throwAt(deg, "light"));
  for (const deg of angles) out.heavy.push(throwAt(deg, "heavy"));
  return out;
}, [90, 70, 64, 62, 55, 45, 30, 20, 13, 11, -11, -13, -20, -30, -36, -45, -48, -60, -90]);

const { bodyH, fistY, fistSource } = rows;
const at = (deg) => rows.light.find((r) => r.deg === deg);
const atH = (deg) => rows.heavy.find((r) => r.deg === deg);

const table = (label, list) => {
  console.log(`${label}   anim           tilt   arc   pivot  tip        verdict    hurtbox     move`);
  for (const r of list) {
    console.log(`${String(r.deg).padStart(4)}°   ${String(r.anim).padEnd(14)} ${String(r.tilt).padStart(4)} `
      + `${String(r.arc).padStart(5)} ${String(r.pivotY).padStart(6)}  ${`${r.tipX},${r.tipY}`.padEnd(10)} `
      + `${String(r.verdict).padEnd(10)} ${`${r.hurtW}x${r.hurtH}`.padEnd(11)} ${r.label}`);
  }
  console.log("");
};
console.log(`Gojo stands ${bodyH} px; his rising attack is drawn landing ${-fistY} px `
  + `above his feet (${fistSource})\n`);
table("light", rows.light);
table("heavy", rows.heavy);

// ------------------------------------------------------------ the cardinals
//
// The down attack has to BE something: its own move and its own drawing, or it
// is a side tilt thrown from a squat and there was never any point pressing
// down.
const down = at(-90), up = at(90), diag = at(45);
check(down.anim === "crouchAttack" && /^Low /.test(down.label),
  "a stick held straight down throws the DOWN attack",
  `${down.anim} · "${down.label}"`);
check(down.anim !== diag.anim,
  "...and it is drawn as its own pose, not the neutral attack",
  `down ${down.anim} vs neutral ${diag.anim}`);
check(down.tilt === 0,
  "...unswung: the down attack is a move, not the neutral one aimed down",
  `tilt ${down.tilt}°`);
check(up.anim === "upHeavy" && /^Rising /.test(up.label),
  "a stick held straight up throws the UP attack", `${up.anim} · "${up.label}"`);

// ------------------------------------------------------------- the diagonals
//
// Every angle the band accepts has to be reachable AND land on the angle asked
// for. `tools/check_stick_angles.mjs` proves the stick can say it; this proves
// the attack hears it.
//
// The band is NOT symmetric on the ground and the two halves are listed apart
// for it. A grounded fighter cannot swing under the floor, and the move that
// owns "low" is the crouch poke — a forward attack — so the downward hand-off
// comes at 46° where the two pictures meet, rather than at 62° where the arc
// had to snap back through sixty degrees to level. See
// ATTACK_TILT_GROUND_DOWN_DEG.
// SAMPLED JUST INSIDE THE HAND-OFF, NOT ON IT. The shallow edge used to be
// probed at exactly ATTACK_TILT_LEVEL_DEG, and the rule there is `deg < 12 ->
// level`, so the whole question was whether a stick held at 12.000000° came
// back as 12 or as a hair under. It comes back as 11.999999999999998: the
// angle is turned into axes with cos/sin and recovered with atan2, and that
// round trip loses the last ulp at 12° (though not at 62°). Four checks failed
// on it, all reporting the same one degree, none of them describing anything a
// player can do — nobody holds a stick to fifteen decimal places.
//
// So the band is probed one degree inside each edge, and the edges themselves
// come from the game's own constants. The hand-off still gets checked, but
// deliberately and in one place: see "the hand-off itself" below.
const EDGE = rows.edges;
const inBand = (r) => (r.deg > 0
  ? r.deg >= EDGE.level && r.deg <= EDGE.cardinal
  : -r.deg >= EDGE.level && -r.deg <= EDGE.groundDown);
const BAND = rows.light.filter(inBand);
const aimed = BAND.filter((r) => r.verdict === "aimed");
check(aimed.length === BAND.length,
  `every diagonal in the band throws an AIMED attack (${aimed.length}/${BAND.length})`,
  BAND.filter((r) => r.verdict !== "aimed").map((r) => `${r.deg}°=${r.verdict}`).join(" "));

const offBy = BAND.map((r) => Math.abs(Math.abs(r.tilt) - Math.abs(r.deg)));
check(Math.max(...offBy) <= 1,
  "...swung to the angle the stick is actually holding",
  `worst ${Math.max(...offBy)}° off`);

// THE ARC IS HOW A DIAGONAL READS. The drawing does not change for one, so if
// the crescent does not turn with the box there is nothing on screen to tell a
// player their aim was heard — and this is read off the SPAWNED BOX, which is
// the copy that reaches the renderer.
const arcOff = BAND.map((r) => Math.abs((r.arc ?? 999) - r.tilt));
check(Math.max(...arcOff) <= 1,
  "...and the strike arc is drawn on the angle it was swung to",
  `worst ${Math.max(...arcOff)}° apart`);

// ...and it has to be drawn far enough out to SEE. An aimed box is scaled by
// the cosine of its tilt, so reading the arc's radius off the box's forward
// edge shrank the crescent as the swing steepened — Gojo's 62° jab was marked
// at 37 px, inside his own shoulder, which is why upward diagonals read as
// nothing happening at all. The radius follows the swing's own line now.
const level = at(20).radius;
const shortest = Math.min(...BAND.map((r) => r.radius));
check(shortest >= level * 0.7,
  "...at a radius that survives the angle, so the crescent is visible at every one",
  `shallowest ${level} px, steepest ${shortest} px`);

// A diagonal is the NEUTRAL attack aimed, so above the waist it keeps the
// neutral drawing — the arc carries the whole reading.
const upper = BAND.filter((r) => r.deg > 0);
check(upper.every((r) => r.anim === diag.anim && r.anim !== "crouchAttack"),
  "an upward diagonal keeps the standing drawing — only the arc turns",
  upper.map((r) => `${r.deg}°=${r.anim}`).join(" "));

// ---- the hand-off itself
//
// The shallow edge, checked ON PURPOSE and in ONE place, a degree either side
// of it rather than on it. Under the edge a stick a few degrees off horizontal
// means "forward" and the swing must not wobble with it; over the edge the
// attack is aimed. Both numbers are the game's own, so moving
// ATTACK_TILT_LEVEL_DEG moves this check with it.
for (const sign of [1, -1]) {
  const below = at(sign * (EDGE.level - 1));
  const above = at(sign * (EDGE.level + 1));
  check(below?.verdict === "level",
    `a stick just under the edge stays LEVEL (${sign > 0 ? "up" : "down"})`,
    `${below?.deg}° = ${below?.verdict}`);
  check(above?.verdict === "aimed",
    `and a degree over it is AIMED (${sign > 0 ? "up" : "down"})`,
    `${above?.deg}° = ${above?.verdict}`);
}

// Below the waist it does not, and that is not a cosmetic choice: past the
// crouch threshold the fighter's HURTBOX ducks, so a standing drawing over it
// would be the picture disagreeing with the box. The two move together or
// neither does.
const ducked = rows.light.filter((r) => r.anim === "crouchAttack");
check(ducked.every((r) => r.hurtH < diag.hurtH),
  "a crouched attack is drawn ducked AND is hittable as ducked",
  `crouched ${ducked[0]?.hurtW}x${ducked[0]?.hurtH} vs standing ${diag.hurtW}x${diag.hurtH}`);

// ...AND THE ARC HAS TO DUCK WITH THEM. This is the other half of the same
// complaint and the half that went unnoticed: the crescent hung at a fraction
// of STANDING height whatever the fighter was drawn doing, so a ducked Gojo
// swung out of a shoulder 20 px above his own crouched head.
const crouchTop = Math.min(...ducked.map((r) => -r.hurtH));
check(ducked.every((r) => r.pivotY >= crouchTop),
  "...and its arc swings from the ducked body, not from a standing shoulder",
  ducked.map((r) => `${r.deg}°=${r.pivotY}`).join(" ") + ` vs crouch top ${crouchTop}`);

// ------------------------------------------- the sweep has no cliff in it
//
// The reading a player gets is where the crescent lands, and sweeping the stick
// round its circle has to move it rather than teleport it. Every fault this
// smoke was rewritten for showed up here first: the arc snapping back through
// sixty degrees at the bottom of the band, the pivot dropping to the ankles,
// the radius collapsing into the shoulder.
const path = rows.light.filter((r) => r.tipX != null).sort((a, b) => b.deg - a.deg);
let drift = { rate: 0 };
let handoff = { gap: 0 };
for (let i = 1; i < path.length; i++) {
  const a = path[i - 1], b = path[i];
  const gap = Math.hypot(a.tipX - b.tipX, a.tipY - b.tipY);
  const where = `${a.deg}° (${a.tipX},${a.tipY}) -> ${b.deg}° (${b.tipX},${b.tipY})`;
  // WITHIN one move the crescent has to follow the thumb; ACROSS a hand-off
  // from one move to the next it is allowed to step, because the drawing and
  // the hitbox step too — but not by more than the fighter is tall, or the
  // player has lost the thread of where their own attack went.
  if (a.label === b.label && a.anim === b.anim) {
    const rate = gap / Math.max(1, a.deg - b.deg);
    if (rate > drift.rate) drift = { rate, where };
  } else if (gap > handoff.gap) {
    handoff = { gap, where: `${where} (${a.label} -> ${b.label})` };
  }
}
check(drift.rate <= 4,
  "sweeping the stick moves the crescent instead of teleporting it",
  `worst ${drift.rate.toFixed(1)} px per degree${drift.where ? `, ${drift.where}` : ""}`);
check(handoff.gap <= bodyH * 0.5,
  "...and hands off between moves without throwing it across the fighter",
  `worst ${Math.round(handoff.gap)} px of a ${bodyH} px body, ${handoff.where}`);

// ------------------------------------------------- where the rising arc sits
//
// The up attack's box used to top out at a literal — 1.88 body heights for
// everybody — and the arc is drawn at the box's far edge, so the crescent hung
// eighty-odd px over the arm throwing it. The top comes off the verified
// contact point plus the move's grace now, so the mark lands near the fist.
const rise = at(90);
const overFist = rise.tipY - fistY;             // negative is above the fist
check(Math.abs(overFist) <= bodyH * 0.5,
  "the up attack's arc is drawn near the fist that throws it",
  `arc at ${rise.tipY}, fist at ${fistY} — ${Math.abs(overFist)} px apart `
  + `(${(Math.abs(overFist) / bodyH).toFixed(2)} of a body)`);

// ------------------------------------------------------------- outside the band
check(at(70).tilt === 0 && at(70).anim === "upHeavy",
  "a near-vertical stick is still the up attack, not a 70° swing", `${at(70).anim}`);

// --------------------------------------------------------- and the HEAVY button
//
// The light button has had aiming since aiming arrived. The heavy button never
// did: it picked its variant off two independent half-plane flags, so a stick
// held between up and forward resolved to one or the other and the smash had no
// diagonal anywhere in its circle. Only the RIGHT stick could angle one, and
// only on release.
const hDiag = rows.heavy.filter((r) => r.deg >= 30 && r.deg <= 62);
check(hDiag.every((r) => Math.abs(Math.abs(r.tilt) - r.deg) <= 1),
  "the heavy button aims off the left stick too, at the angle it is held",
  hDiag.map((r) => `${r.deg}°=${r.tilt}°`).join(" "));
check(hDiag.every((r) => Math.abs((r.arc ?? 999) - r.tilt) <= 1),
  "...and the smash's crescent turns with it",
  hDiag.map((r) => `${r.deg}°arc=${r.arc}°`).join(" "));
check(atH(90).anim === "upHeavy" && atH(-90).label.startsWith("Quake"),
  "...while the cardinals still pick the vertical smashes",
  `up ${atH(90).anim} · down "${atH(-90).label}"`);

// The QUAKE is a shockwave along the FLOOR, and its arc drew at the fighter's
// shoulders — the body-fraction pivot could not tell a floor attack from a
// punch. It comes off the move's own contact point now.
const quake = atH(-90);
check(quake.pivotY > -bodyH * 0.25,
  "the quake's shockwave is drawn along the floor, not at the shoulders",
  `pivot ${quake.pivotY} on a ${bodyH} px fighter`);

check(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | "));

console.log(failures ? `\n${failures} check(s) failed` : "\nevery direction the light button offers is reachable");
await browser.close();
process.exit(failures ? 1 : 0);
