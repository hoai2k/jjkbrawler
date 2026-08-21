// CAN THE STICK SAY WHAT THE GAME ASKS IT TO SAY?
//
//     node tools/check_stick_angles.mjs
//
// The left stick answers two different kinds of question. A THRESHOLD one —
// "is this pushed right?", "is this a crouch?" — which wants a deadzone, and
// an ANGLE one — "how far above horizontal is the player aiming this attack?"
// — which a deadzone destroys rather than attenuates.
//
// src/input.js used to answer both with one square deadzone: x zeroed under
// 0.28, y under 0.42. Nothing complained, because the result was a plausible
// number. But zeroing an axis pins the angle to the other one's cardinal, so a
// quarter turn of the stick could only report 0, 24.9 through 73.7, and 90
// degrees. The aimed attack (fighter.js attackTilt) takes tilts between 12 and
// 62 degrees off horizontal, so a THIRD of its own range was not a hard input,
// it was an impossible one — and no test could see it, because every part in
// isolation was doing what it said.
//
// So this checks the seam itself, in both directions:
//
//   1. COVERAGE. Sweep the stick around the circle and confirm every angle the
//      aimed attack accepts can actually be produced, in all four quadrants.
//   2. NO REGRESSION. Every digital read — left, right, up, down — is bit
//      identical to what the old square-deadzone code returned, at every
//      position on that sweep. Those thresholds are tuned feel and this change
//      was not allowed to move them.
//   3. The walk still starts exactly where it did (fighter.js moveTilt), which
//      is the one consumer that wanted the deadzone and now applies it itself.
//
// Run by `npm run check`.

// input.js reaches for `window` inside initInput, and pulls in audio.js which
// touches it at module scope. Neither runs here; the stub is so the import
// resolves at all.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
globalThis.document ??= { addEventListener() {}, removeEventListener() {}, hidden: false };

const { padSnapshot } = await import("../src/input.js");
const {
  MOVE_DEADZONE, VERT_CARDINAL, STICK_NOISE,
  ATTACK_TILT_LEVEL_DEG, ATTACK_TILT_CARDINAL_DEG, ATTACK_TILT_MIN_MAG,
} = await import("../src/constants.js");

let bad = 0;
const fail = (msg) => { console.log("FAIL " + msg); bad += 1; };
const ok = (msg) => console.log("ok   " + msg);

/** A gamepad with nothing pressed and the left stick where we put it. */
const padAt = (x, y) => ({
  index: 0,
  axes: [x, y, 0, 0],
  buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
});

/** What the old square-deadzone code produced, kept here as the thing the
 *  digital reads must still agree with. */
const legacy = (x, y) => {
  const axX = Math.abs(x) > 0.28 ? x : 0;
  const axY = Math.abs(y) > 0.42 ? y : 0;
  return { left: axX < -0.28, right: axX > 0.28, up: axY < -0.5, down: axY > 0.5 };
};

// The angle a swept stick reports, in the game's own reading: degrees above
// horizontal, which is what attackTilt computes.
const STEP = 0.05;
const sweep = [];
for (let deg = 0; deg < 360; deg += STEP) {
  const r = (deg * Math.PI) / 180;
  const x = Math.cos(r), y = -Math.sin(r);          // canvas y: up is negative
  const snap = padSnapshot(padAt(x, y));
  const mag = Math.hypot(snap.moveX, snap.moveY);
  sweep.push({
    deg, x, y, snap,
    // attackTilt's own reading: |x| against -y, so all four quadrants fold
    // onto the same 0-90 question.
    reported: mag ? Math.abs(Math.atan2(-snap.moveY, snap.moveX)) * 180 / Math.PI : null,
    mag,
  });
}

// ---------------------------------------------------------------- 1. coverage
//
// Fold to the 0-90 quarter the tilt is judged in, keep the samples the aimed
// attack would actually act on, and look for a hole.
const acted = sweep.filter((s) => s.mag >= ATTACK_TILT_MIN_MAG && s.reported != null);
const folded = acted
  .map((s) => (s.reported > 90 ? 180 - s.reported : s.reported))
  .filter((d) => d >= ATTACK_TILT_LEVEL_DEG - 1 && d <= ATTACK_TILT_CARDINAL_DEG + 1)
  .sort((a, b) => a - b);

const BAND = `${ATTACK_TILT_LEVEL_DEG}-${ATTACK_TILT_CARDINAL_DEG}°`;
if (!folded.length) {
  fail(`no stick position anywhere on the circle lands inside the aimed attack's ${BAND} band`);
} else {
  let worst = 0, at = 0;
  for (let i = 1; i < folded.length; i++) {
    const gap = folded[i] - folded[i - 1];
    if (gap > worst) { worst = gap; at = folded[i - 1]; }
  }
  // Also check the ends: the band has to be covered, not merely entered.
  const lo = folded[0], hi = folded.at(-1);
  if (lo > ATTACK_TILT_LEVEL_DEG + 1) {
    fail(`the shallowest aimed attack a stick can ask for is ${lo.toFixed(1)}°, but the band `
      + `opens at ${ATTACK_TILT_LEVEL_DEG}° — ${(lo - ATTACK_TILT_LEVEL_DEG).toFixed(1)}° of it `
      + `is unreachable, which is a deadzone eating an angle`);
  }
  if (hi < ATTACK_TILT_CARDINAL_DEG - 1) {
    fail(`the steepest aimed attack a stick can ask for is ${hi.toFixed(1)}°, but the band `
      + `runs to ${ATTACK_TILT_CARDINAL_DEG}°`);
  }
  if (worst > 1) {
    fail(`a ${worst.toFixed(1)}° hole in the aimed attack's range at ${at.toFixed(1)}° — `
      + `no stick position reports an angle in it`);
  }
  if (!bad) {
    ok(`every angle in the aimed attack's ${BAND} band is reachable `
      + `(${lo.toFixed(1)}-${hi.toFixed(1)}°, largest step ${worst.toFixed(2)}°)`);
  }
}

// ------------------------------------------------------- 2. no regression
const drifted = sweep.filter((s) => {
  const was = legacy(s.x, s.y);
  return was.left !== s.snap.left || was.right !== s.snap.right
    || was.up !== s.snap.up || was.down !== s.snap.down;
});
if (drifted.length) {
  const d = drifted[0];
  fail(`${drifted.length} stick position(s) changed a digital read — at ${d.deg.toFixed(1)}° `
    + `(x ${d.x.toFixed(3)}, y ${d.y.toFixed(3)}) the old code said `
    + `${JSON.stringify(legacy(d.x, d.y))} and this one says `
    + `${JSON.stringify({ left: d.snap.left, right: d.snap.right, up: d.snap.up, down: d.snap.down })}`);
} else {
  ok(`left/right/up/down unchanged at all ${sweep.length} positions on the sweep `
    + `(thresholds ${MOVE_DEADZONE} sideways, ${VERT_CARDINAL} vertical)`);
}

// --------------------------------------------------------------- 3. the walk
//
// moveTilt is the consumer that wanted the deadzone. It owns it now, so it has
// to still bite in the same place.
const { default: fs } = await import("node:fs/promises");
const fighterSrc = await fs.readFile(new URL("../src/fighter.js", import.meta.url), "utf8");
if (!/ax > MOVE_DEADZONE \? Math\.min\(1, ax\)/.test(fighterSrc)) {
  fail("fighter.js moveTilt no longer gates on MOVE_DEADZONE — with input.js reporting the "
    + "stick as held, a resting thumb would read as a walk");
} else {
  ok(`the walk still begins at MOVE_DEADZONE (${MOVE_DEADZONE}), applied where it is used`);
}

// --------------------------------------------------------------- 4. at rest
const rest = padSnapshot(padAt(STICK_NOISE * 0.5, STICK_NOISE * 0.5));
if (rest.moveX || rest.moveY) {
  fail(`a centred stick inside the ${STICK_NOISE} noise floor still reported `
    + `(${rest.moveX}, ${rest.moveY})`);
} else {
  ok(`a stick inside the ${STICK_NOISE} noise floor reports centred`);
}

console.log(bad ? `\n${bad} check(s) failed` : "\nthe stick can say everything the game asks it to");
process.exit(bad ? 1 : 0);
