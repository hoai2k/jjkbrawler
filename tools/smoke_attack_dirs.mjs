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

  const out = [];
  for (const deg of angles) {
    reset();
    state.hitboxes.length = 0;
    const r = deg * Math.PI / 180;
    const x = Math.cos(r), y = -Math.sin(r);       // canvas y: up is negative
    // Hold before pressing, so a crouch has time to establish — the input a
    // player performs, not a single synthetic frame.
    for (let i = 0; i < 8; i++) updateFighter(f, dt, padInput(x, y));
    updateFighter(f, dt, padInput(x, y, { lightP: true }));
    let rec = null;
    for (let i = 0; i < 40 && !rec; i++) {
      updateFighter(f, dt, padInput(x, y));
      const m = f.action?.move;
      if (m && state.hitboxes.some((h) => h.owner === f)) {
        const arcs = strikeArcs(m, bodyMetrics(f.spriteChar || f.charKey).height);
        const hb = hurtbox(f);
        rec = {
          anim: m.anim, label: m.label,
          tilt: Math.round((m.aimTilt || 0) * D),
          arc: arcs.length ? Math.round(arcs[0].aim * D) : null,
          verdict: f.attackAim?.verdict ?? "-",
          hurtW: Math.round(hb.w), hurtH: Math.round(hb.h),
        };
      }
    }
    out.push({ deg, ...(rec || { anim: "NONE", label: "-", tilt: null, arc: null, verdict: "-", hurtW: 0, hurtH: 0 }) });
  }
  return out;
}, [90, 70, 62, 55, 45, 30, 20, 12, -12, -20, -30, -45, -60, -90]);

const at = (deg) => rows.find((r) => r.deg === deg);
console.log("stick    anim           tilt   arc   verdict    hurtbox     label");
for (const r of rows) {
  console.log(`${String(r.deg).padStart(4)}°   ${String(r.anim).padEnd(14)} ${String(r.tilt).padStart(4)} `
    + `${String(r.arc).padStart(5)}   ${String(r.verdict).padEnd(10)} ${`${r.hurtW}x${r.hurtH}`.padEnd(11)} ${r.label}`);
}
console.log("");

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
const BAND = rows.filter((r) => Math.abs(r.deg) >= 12 && Math.abs(r.deg) <= 62);
const aimed = BAND.filter((r) => r.verdict === "aimed");
check(aimed.length === BAND.length,
  `every diagonal in the 12-62° band throws an AIMED attack (${aimed.length}/${BAND.length})`,
  BAND.filter((r) => r.verdict !== "aimed").map((r) => `${r.deg}°=${r.verdict}`).join(" "));

const offBy = BAND.map((r) => Math.abs(Math.abs(r.tilt) - Math.abs(r.deg)));
check(Math.max(...offBy) <= 1,
  "...swung to the angle the stick is actually holding",
  `worst ${Math.max(...offBy)}° off`);

// THE ARC IS HOW A DIAGONAL READS. The drawing does not change for one, so if
// the crescent does not turn with the box there is nothing on screen to tell a
// player their aim was heard.
const arcOff = BAND.map((r) => Math.abs((r.arc ?? 999) - r.tilt));
check(Math.max(...arcOff) <= 1,
  "...and the strike arc is drawn on the angle it was swung to",
  `worst ${Math.max(...arcOff)}° apart`);

// A diagonal is the NEUTRAL attack aimed, so above the waist it keeps the
// neutral drawing — the arc carries the whole reading.
const upper = BAND.filter((r) => r.deg > 0);
check(upper.every((r) => r.anim === diag.anim && r.anim !== "crouchAttack"),
  "an upward diagonal keeps the standing drawing — only the arc turns",
  upper.map((r) => `${r.deg}°=${r.anim}`).join(" "));

// Below the waist it does not, and that is not a cosmetic choice: past the
// crouch threshold the fighter's HURTBOX ducks, so a standing drawing over it
// would be the picture disagreeing with the box. The two move together or
// neither does.
const ducked = rows.filter((r) => r.anim === "crouchAttack");
check(ducked.every((r) => r.hurtH < diag.hurtH),
  "a crouched attack is drawn ducked AND is hittable as ducked",
  `crouched ${ducked[0]?.hurtW}x${ducked[0]?.hurtH} vs standing ${diag.hurtW}x${diag.hurtH}`);

// ------------------------------------------------------------- outside the band
check(at(70).tilt === 0 && at(70).anim === "upHeavy",
  "a near-vertical stick is still the up attack, not a 70° swing", `${at(70).anim}`);

check(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | "));

console.log(failures ? `\n${failures} check(s) failed` : "\nevery direction the light button offers is reachable");
await browser.close();
process.exit(failures ? 1 : 0);
