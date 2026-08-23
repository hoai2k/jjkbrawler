// Headless smoke for the 2.5D camera rig (src/camera3d/rig.js): runs the REAL
// updateCamera() and the rig against scripted fighter paths — no browser, no
// WebGL, three.js used only for its math — and asserts framing invariants:
//
//   * every alive fighter projects inside the frame with margin (neutral play)
//   * the dolly distance stays inside its clamps
//   * yaw and roll stay inside their configured bounds
//   * nothing goes NaN across KO, respawn, ult, domain, GAME and cue storms
//
// Run: node tools/smoke_camera.mjs
import { state } from "../src/state.js";
import { ART_SCALE } from "../src/config_tuning.js";
import { updateCamera } from "../src/camera.js";
import { updateRig, resetRig, worldToScreen, overlayTransform, dollyFor, camera } from "../src/camera3d/rig.js";
import { cameraCue } from "../src/camera_mode.js";
import { CAMERA, BOARD_CAMERA, CUES } from "../src/config_camera.js";
import { WORLD, BLAST } from "../src/constants.js";

const DT = 1 / 60;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  if (!ok) console.log(`FAIL ${label}${detail ? `   ${detail}` : ""}`);
};
const pass = (label) => console.log(`ok   ${label}`);

function fighter(id, x, y) {
  return { id, x, y, vx: 0, vy: 0, dead: false, respawnTimer: 0, action: null };
}

function resetState(stageKey = "trainingBridge") {
  state.stageKey = stageKey;
  state.platforms = [{ x: 248, y: 568, w: 784, h: 42, kind: "main" }];
  state.fighters = [fighter(1, 430, 568), fighter(2, 850, 568)];
  state.camera = { x: 640, y: 360, zoom: 1, shake: 0, kick: 0 };
  state.introT = 0;
  state.endT = 0;
  state.domainOverlay = null;
  resetRig();
}

const finite = (...ns) => ns.every(Number.isFinite);

function frameInvariants(label, { neutral = true } = {}) {
  const p = camera.position;
  check(finite(p.x, p.y, p.z), `${label}: camera position finite`, `${p.x},${p.y},${p.z}`);
  const q = camera.quaternion;
  check(finite(q.x, q.y, q.z, q.w), `${label}: camera orientation finite`);
  const t = overlayTransform();
  check(finite(t.a, t.b, t.c, t.d, t.e, t.f), `${label}: overlay transform finite`);
  if (neutral) {
    for (const f of state.fighters) {
      if (f.dead || f.respawnTimer > 0) continue;
      const s = worldToScreen(f.x, f.y - 90);
      check(s.x > -80 && s.x < WORLD.w + 80 && s.y > -80 && s.y < WORLD.h + 80,
        `${label}: fighter ${f.id} inside frame`, `(${Math.round(s.x)}, ${Math.round(s.y)})`);
    }
  }
}

function run(seconds, step) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    if (step) step(i * DT);
    updateCamera(DT);
    const out = updateRig(state, DT);
    check(finite(out.D, out.fov, out.yaw, out.roll, out.dollyMul), "rig outputs finite");
    // Global bounds, generous enough for boards' biases and every cue: the
    // dolly never collapses to the plane or backs out past the intro shot.
    check(out.D > 3 && out.D < dollyFor(1) * 1.5, "dolly inside clamps", `D=${out.D.toFixed(2)}`);
    check(Math.abs(out.yaw) < 12, "yaw bounded", `yaw=${out.yaw.toFixed(2)}`);
    check(Math.abs(out.roll) < 6, "roll bounded", `roll=${out.roll.toFixed(2)}`);
    check(out.fov > 20 && out.fov < 40, "fov bounded", `fov=${out.fov.toFixed(2)}`);
  }
}

// ---- 1. neutral play: converge, separate, run to the edges
resetState();
run(3, (t) => {
  state.fighters[0].x = 640 - 200 - Math.sin(t * 2) * 180;
  state.fighters[1].x = 640 + 200 + Math.sin(t * 2) * 180;
  state.fighters[0].vx = -Math.cos(t * 2) * 360;
  state.fighters[1].vx = Math.cos(t * 2) * 360;
});
frameInvariants("neutral spread");
run(3, () => {
  state.fighters[0].x = 300;
  state.fighters[1].x = 420;
});
frameInvariants("left-edge fight");
check(updateRig(state, DT).yaw < 0.01, "camera yaws toward a left-side fight");
pass("neutral play framing");

// ---- 2. intro pull-out eases to standard framing
resetState();
state.introT = 1.6;
let firstD = null;
run(1.9, (t) => {
  state.introT = Math.max(0, 1.6 - t);
  if (firstD === null) firstD = updateRig(state, DT).D;
});
const settled = updateRig(state, DT);
check(firstD > settled.D, "intro starts pulled out", `${firstD?.toFixed(2)} -> ${settled.D.toFixed(2)}`);
frameInvariants("after intro");
pass("round intro");

// ---- 3. KO -> blackout -> respawn never NaNs
resetState();
run(0.5);
state.fighters[1].dead = false;
state.fighters[1].respawnTimer = 0.65;
run(0.7, () => {
  state.fighters[1].respawnTimer = Math.max(0, state.fighters[1].respawnTimer - DT);
});
state.fighters[1].y = 250; // back on the revival platform
run(0.5);
frameInvariants("after respawn");
pass("KO / respawn transitions");

// ---- 3b. A RING-OUT IS A MOVE, NOT A CUT.
//
// The camera used to drop a KO'd fighter from the framing outright: the frame
// closed on whoever was left — the wrong way — and then the blackout ended, a
// body appeared on a revival platform most of a stage away, and the containment
// pass opened the shot in ONE frame to catch it. Measured on this exact script,
// that arrival frame moved the camera 150.6 px, nearly all of it vertical.
//
// fighter.js now records where they went out and where they come back, and the
// shot tracks a point travelling between the two (camera.js). Both ends are
// then free: nothing is let go of at the ring-out, nothing is discovered at the
// arrival.
//
// Measured from the ring-out onward, because that is what changed — the launch
// before it is an ordinary chase and moves the camera as fast as any launch
// does. The bars are a frame of ordinary play, not a frame of stillness.
{
  resetState();
  run(0.6);
  const ko = state.fighters[1];
  let worstPan = 0, worstZoom = 0, watching = false;
  const watch = () => {
    const before = { x: state.camera.x, y: state.camera.y, z: state.camera.zoom };
    updateCamera(DT);
    updateRig(state, DT);
    if (!watching) return;
    worstPan = Math.max(worstPan, Math.hypot(state.camera.x - before.x, state.camera.y - before.y));
    worstZoom = Math.max(worstZoom, Math.abs(state.camera.zoom - before.z));
  };
  // LAUNCHED, not teleported: the camera follows a body out to the blast line,
  // and letting go of THAT frame is half of what used to cut. A fighter set
  // down at the blast line in one step would measure the placement instead.
  ko.vx = 1500; ko.vy = -260;
  while (ko.x < BLAST.right) {
    ko.x += ko.vx * DT;
    ko.y += ko.vy * DT;
    watch();
  }
  // Rung out where they crossed, coming back at the far side — the record
  // fighter.js ringOut() writes.
  watching = true;
  ko.respawnTimer = 0.65;
  ko.respawnAt = { x: 850, y: 250, fromX: Math.min(ko.x, WORLD.w), fromY: Math.max(0, ko.y) };
  ko.vx = 0; ko.vy = 0;
  let arrival = null;
  // The blackout, then the arrival ON THE SAME FRAME the timer runs out —
  // fighter.js respawn() moves the body and clears the timer together, and a
  // harness that did it in two steps would measure a fighter standing in the
  // blast zone for a frame rather than anything the game does.
  for (let i = 0; i < Math.round(0.9 / DT); i++) {
    if (ko.respawnTimer > 0) {
      ko.respawnTimer -= DT;
      if (ko.respawnTimer <= 0) {
        ko.respawnTimer = 0;
        ko.x = ko.respawnAt.x;
        ko.y = ko.respawnAt.y;
        ko.respawnAt = null;
        arrival = { x: state.camera.x, y: state.camera.y };
      }
    }
    watch();
  }
  const settle = Math.hypot(state.camera.x - arrival.x, state.camera.y - arrival.y);
  check(worstPan < 13, "a ring-out and a respawn never cut the camera",
    `worst frame ${worstPan.toFixed(1)}px, against 150.6px before the trip existed`);
  // 0.02 is a fifth of the 0.10 the arrival used to cost and half what the
  // launch just before it spends chasing the body out — a zoom that moves,
  // against one that cuts.
  // In ZOOM UNITS, and the zoom itself is now 1/ART_SCALE larger — so the same
  // proportional move costs proportionally more of them.
  check(worstZoom < 0.02 / ART_SCALE, "...and never snap the zoom",
    `worst frame ${worstZoom.toFixed(4)}x, against 0.1016x before`);
  check(settle < 90, "...so the arrival is the end of the move, not the start",
    `${settle.toFixed(1)}px of camera travel after the body lands`);
  frameInvariants("respawn arrival");
  pass("ring-out framing");
}

// ---- 4. ult cast dollies in on the caster, then releases
resetState();
state.fighters[0].action = { kind: "ult", t: 0, dur: 1.2 };
run(1.2, () => { state.fighters[0].action.t += DT; });
const ultShot = updateRig(state, DT);
check(ultShot.dollyMul < 0.93, "ult shot dollies in", `mul=${ultShot.dollyMul.toFixed(2)}`);
state.fighters[0].action = null;
run(2.5);
check(Math.abs(updateRig(state, DT).dollyMul - 1) < 0.08, "ult shot releases");
frameInvariants("after ult", { neutral: false });
pass("ult drama shot");

// ---- 5. domain: arrive tight, drift back out while the overlay runs
resetState();
state.fighters[0].action = { kind: "ult", t: 0, dur: 0.9 };
state.domainOverlay = { life: 9, maxLife: 9 };
run(0.9, () => { state.fighters[0].action.t += DT; });
state.fighters[0].action = null;
const early = updateRig(state, DT).dollyMul;
run(8, () => { state.domainOverlay.life -= DT; });
const late = updateRig(state, DT).dollyMul;
check(early < late, "domain drifts back out", `${early.toFixed(2)} -> ${late.toFixed(2)}`);
state.domainOverlay = null;
run(1);
frameInvariants("after domain", { neutral: false });
pass("domain drama shot");

// ---- 6. GAME: frame the winner head-on
resetState();
state.fighters[1].dead = true;
state.fighters[0].x = 300;
state.endT = 1.4;
run(1.2, () => { state.endT = Math.max(0.01, state.endT - DT); });
const endShot = updateRig(state, DT);
check(endShot.dollyMul < 0.85, "GAME shot dollies to the winner", `mul=${endShot.dollyMul.toFixed(2)}`);
check(Math.abs(endShot.yaw) < 1.5, "GAME shot faces head-on", `yaw=${endShot.yaw.toFixed(2)}`);
pass("GAME drama shot");

// ---- 7. every cue, at full strength, on the board that uses it
const CUE_BOARDS = {
  hush: "quietHall", surge: "floodedGate", frenzy: "shibuyaNight",
  fangSnap: "curseMaw", bloom: "gardenSteps", punch: "lanternCorridor",
  wallYaw: "neonSplit", rattle: "boneSanctum", layout: "academyHall",
  fog: "mistPier", inhale: "cursedTeeth", wind: "riverGate", lightning: "billboardRoof",
};
for (const [name, board] of Object.entries(CUE_BOARDS)) {
  resetState(board);
  cameraCue(name, 1);
  cameraCue(name, -1); // retrigger with flipped sign must not stack or NaN
  const def = CUES[name];
  run(Math.min(6, (def.attack ?? 0.1) + (def.hold ?? 0) + (def.release ?? 0.3) + 0.5));
  frameInvariants(`cue ${name}`, { neutral: false });
}
pass("all cues stay bounded");

// ---- 8. board personalities: kicks, shake, and drift-follow boards
for (const board of Object.keys(BOARD_CAMERA)) {
  resetState(board);
  state.camera.kick = 0.14;
  state.camera.shake = 16;
  run(1.5);
  frameInvariants(`board ${board}`, { neutral: false });
}
pass("board personalities stay bounded");

// ---- 9. the overlay affine really matches the projection (centre stage)
resetState();
run(2);
const T = overlayTransform();
const probe = (x, y) => ({ x: T.a * x + T.c * y + T.e, y: T.b * x + T.d * y + T.f });
// The projection of a tilted plane is a homography — the camera's pitch and
// height bias give the plane a ~1% per-100-px scale gradient no affine can
// carry — so the fit is PINNED at the mean fighter position: sub-pixel on the
// action, growing with distance from it, worst at an empty far corner. The
// things that must land exactly (hitbox debug, particles, popups riding the
// fighters) are at the anchor; a free-standing stage-FX drawing 400 px from
// the fight may sit a few px off its GL counterpart, which nothing overlaps.
// Tolerances are calibrated at the dynamic camera's tightest shot (camera.js
// ZOOM_MAX): a closer dolly both magnifies the error in screen px and steepens
// the perspective the affine cannot carry — and at that zoom the far probes sit
// at or beyond the frame edge, where nothing aligned is drawn.
//
// So they follow the zoom rather than being written down for one. The roster
// shrank to ART_SCALE and the camera zoomed in by its reciprocal to hold
// fighters the same size on screen (config_tuning.js), which magnifies AND
// steepens — both linear in zoom, so the error a fixed tolerance has to admit
// goes as the square. The numbers below are the 1.32-shot's, carried across.
const TOL = 1 / (ART_SCALE * ART_SCALE);
for (const [x, y, tol] of [[640, 568, 0.75 * TOL], [500, 480, 0.75 * TOL],
                           [300, 400, 4 * TOL], [1000, 250, 12 * TOL]]) {
  const direct = worldToScreen(x, y);
  const affine = probe(x, y);
  const err = Math.hypot(direct.x - affine.x, direct.y - affine.y);
  check(err < tol, `affine fit within ${tol.toFixed(2)} px of true projection`, `err=${err.toFixed(3)} at (${x},${y})`);
}
pass(`overlay affine fit (fov=${CAMERA.fov}, yawMax=${CAMERA.yawMax})`);

// ---- 10. flat framing: nobody leaves the shot
// The rig rides on cam.x/y/zoom, so this section checks those directly — the
// contract camera.js owes both renderers. A fighter inside the painted world
// is always in frame with slack; one out in the gutter is in frame as long as
// the camera is allowed to reach that far (camera.js OVERSCAN).
function flatView() {
  const cam = state.camera;
  return { halfW: WORLD.w / 2 / cam.zoom, halfH: WORLD.h / 2 / cam.zoom, x: cam.x, y: cam.y };
}
function checkFramed(label) {
  const v = flatView();
  for (const f of state.fighters) {
    if (f.dead || f.respawnTimer > 0) continue;
    // Past the gutter the fighter is on their way out of the match: camera.js
    // deliberately stops following rather than showing the void.
    if (f.x < -170 || f.x > WORLD.w + 170 || f.y < -90 || f.y > WORLD.h + 90) continue;
    const inWorld = f.x >= 0 && f.x <= WORLD.w && f.y >= 0 && f.y <= WORLD.h;
    // Body box around the foot point — and a BODY is whatever the roster's
    // scale says it is (config_tuning.js ART_SCALE). Written as the widest
    // fighter's ~76px and the tallest's ~200 at full size, then scaled, so
    // this asks the camera to frame the fighters the game actually draws
    // rather than the ones it drew when the numbers were typed.
    const slack = inWorld ? 30 * ART_SCALE : 0;
    const halfBody = 45 * ART_SCALE;
    const bodyTop = 200 * ART_SCALE;
    const bodyFoot = 20 * ART_SCALE;
    check(Math.abs(f.x - v.x) + halfBody + slack <= v.halfW,
      `${label}: fighter ${f.id} framed horizontally`,
      `x=${f.x.toFixed(0)} cx=${v.x.toFixed(0)} half=${v.halfW.toFixed(0)}`);
    check(f.y - bodyTop >= v.y - v.halfH - (inWorld ? 0 : 40 * ART_SCALE) + slack &&
          f.y + bodyFoot <= v.y + v.halfH - slack,
      `${label}: fighter ${f.id} framed vertically`,
      `y=${f.y.toFixed(0)} cy=${v.y.toFixed(0)} half=${v.halfH.toFixed(0)}`);
  }
}

// A launch: fighter 2 takes a heavy hit and sails up and out while fighter 1
// stays put. This is the case the old symmetric smoothing lost.
for (const [vx0, vy0] of [[1900, -1500], [-2100, -900], [400, 2000], [-2600, -2400]]) {
  resetState();
  run(1);
  const f = state.fighters[1];
  f.vx = vx0; f.vy = vy0;
  state.camera.kick = 0.14;
  state.camera.shake = 14;
  for (let i = 0; i < 90; i++) {
    f.vy += 2350 * DT;
    f.x += f.vx * DT;
    f.y += f.vy * DT;
    updateCamera(DT);
    checkFramed(`launch ${vx0}/${vy0} @${i}`);
  }
}
pass("launches stay framed");

// ---- 10b. THE SHOT NEVER OUTRUNS THE FIGHTERS.
//
// The pan is eased, and an eased pan is proportional: fastest exactly when the
// error is largest. Coming back from a ledge closes a ~300 px framing error and
// the first frame of that ease used to be a third of it — the shot lurched,
// settled, and read as the camera having been startled. It is speed-limited now
// (camera.js PAN_MAX_SPEED, 720 px/s = 12 px a frame), and the containment pass
// is deliberately NOT limited, so this measures the two together: a launch is
// the case where containment SHOULD override, and it is also the case where the
// old proportional whip was worst.
{
  resetState();
  run(1);
  const f = state.fighters[1];
  f.vx = 2400; f.vy = -1800;
  let worst = 0, worstAt = "";
  for (let i = 0; i < 90; i++) {
    f.vy += 2350 * DT;
    f.x += f.vx * DT;
    f.y += f.vy * DT;
    const before = { x: state.camera.x, y: state.camera.y };
    updateCamera(DT);
    const step = Math.hypot(state.camera.x - before.x, state.camera.y - before.y);
    // Containment is allowed to move the frame as far as it must; what is
    // measured here is the frames where it is NOT binding, which is where the
    // comfort rule owns the motion.
    const fitting = Math.abs(f.x - state.camera.x) + 155 < WORLD.w / 2 / state.camera.zoom;
    if (fitting && step > worst) { worst = step; worstAt = `frame ${i}`; }
  }
  check(worst <= 12.2, "the pan never outruns a running fighter",
    `worst unforced frame ${worst.toFixed(1)}px ${worstAt}, cap 12.0px`);
  pass("pan speed limit");
}

// Both fighters at opposite gutters at once — the widest legal shot.
resetState();
state.fighters[0].x = -120; state.fighters[0].y = 400;
state.fighters[1].x = WORLD.w + 120; state.fighters[1].y = 300;
for (let i = 0; i < 240; i++) { updateCamera(DT); }
checkFramed("opposite gutters");
check(state.camera.zoom >= 0.78, "zoom never falls under its floor", `zoom=${state.camera.zoom.toFixed(3)}`);
pass("gutter framing");

// A fast ground chase across the whole stage, every frame framed.
resetState();
state.fighters[0].y = state.fighters[1].y = 568;
for (let i = 0; i < 400; i++) {
  const t = i * DT;
  const a = state.fighters[0], b = state.fighters[1];
  a.x = 640 + Math.sin(t * 3.1) * 560; a.vx = Math.cos(t * 3.1) * 560 * 3.1;
  b.x = 640 + Math.sin(t * 3.1 + 2.2) * 560; b.vx = Math.cos(t * 3.1 + 2.2) * 560 * 3.1;
  updateCamera(DT);
  checkFramed(`chase @${i}`);
}
pass("full-stage chase stays framed");

// A STILL FIGHT DOES NOT MOVE THE FRAME, AND A MOVING ONE STILL DOES.
//
// Two fighters standing their ground, with the few pixels of per-frame noise a
// real one has (sway, stride centre of mass, the sprite's own centre moving
// between poses). The frame must not pass any of it on: the deadzone is what
// stops the stage swimming behind a fighter who is not going anywhere.
resetState();
state.fighters[0].x = 560; state.fighters[1].x = 720;
for (let i = 0; i < 600; i++) updateCamera(DT);
const still = { x: state.camera.x, y: state.camera.y, zoom: state.camera.zoom };
let drift = 0, zoomDrift = 0;
for (let i = 0; i < 300; i++) {
  const t = i * DT;
  // ±3 px of body noise, and out of phase so the box breathes as well as slides.
  state.fighters[0].x = 560 + Math.sin(t * 41) * 3;
  state.fighters[1].x = 720 + Math.sin(t * 37 + 1.7) * 3;
  state.fighters[0].y = 568 + Math.sin(t * 53) * 2;
  state.fighters[1].y = 568 + Math.sin(t * 47 + 0.6) * 2;
  updateCamera(DT);
  drift = Math.max(drift, Math.hypot(state.camera.x - still.x, state.camera.y - still.y));
  zoomDrift = Math.max(zoomDrift, Math.abs(state.camera.zoom - still.zoom));
}
check(drift < 0.001, "body noise never moves the frame", `drift=${drift.toFixed(4)} px`);
check(zoomDrift < 0.0005, "...and never breathes the zoom", `dz=${zoomDrift.toFixed(5)}`);

// ...and the same shot still follows a fighter who actually walks away.
state.fighters[0].vx = -300;
for (let i = 0; i < 120; i++) {
  state.fighters[0].x -= 300 * DT;
  updateCamera(DT);
}
check(still.x - state.camera.x > 40, "a real move still moves the frame",
  `moved ${(still.x - state.camera.x).toFixed(1)} px`);
pass("deadzone kills the jiggle without deadening the shot");

// ---------------------------------------------------------- the high ground
//
// The high-play envelope (camera.js highPlayBias): a fight that climbs carries
// the framing up, and the ground stays low for a while after it comes back
// down rather than snapping to mid-screen the instant everyone lands.
{
  const settle = (steps) => { for (let i = 0; i < steps; i++) updateCamera(DT); };
  const put = (y, steps) => {
    for (let i = 0; i < steps; i++) {
      state.fighters[0].y = y;
      state.fighters[1].y = y;
      updateCamera(DT);
    }
  };
  const main = () => state.platforms[0];

  // A fight that never leaves the floor earns no bias at all.
  resetState();
  state.fighters[0].x = 500; state.fighters[1].x = 780;
  put(main().y, 240);
  const groundT = state.camera.highT;
  const groundY = state.camera.y;
  check(groundT < 0.02, "ground-level play earns no lift", `highT=${groundT.toFixed(3)}`);

  // Play that lives above the floor saturates it.
  put(main().y - 300, 300);
  check(state.camera.highT > 0.9, "sustained high play carries the frame up",
    `highT=${state.camera.highT.toFixed(3)}`);

  // ...and one landing does not throw it away.
  put(main().y, 60);
  const heldT = state.camera.highT;
  const heldY = state.camera.y;
  check(heldT > 0.6, "the lift survives a landing", `highT=${heldT.toFixed(3)}`);
  // The whole point: same bodies, same places, and the ground sits LOWER in
  // frame than it did before the fight went upstairs.
  check(heldY < groundY - 20, "...so the ground still sits low in frame",
    `cam.y ${groundY.toFixed(0)} -> ${heldY.toFixed(0)}`);

  // Stay down and it eases back to where it started.
  put(main().y, 1500);
  check(state.camera.highT < 0.2, "and eases back once the fight stays down",
    `highT=${state.camera.highT.toFixed(3)}`);

  // A brief hop is not "using the top of the screen".
  resetState();
  state.fighters[0].x = 500; state.fighters[1].x = 780;
  settle(120);
  put(main().y - 240, 18);   // ~0.3s in the air, one jump's worth
  put(main().y, 6);
  check(state.camera.highT < 0.35, "a single hop barely moves it",
    `highT=${state.camera.highT.toFixed(3)}`);

  // The bias is a preference, never a way to lose somebody: a body on the floor
  // under a saturated envelope is still inside the frame.
  resetState();
  state.fighters[0].x = 500; state.fighters[1].x = 780;
  put(main().y - 300, 300);
  state.fighters[1].y = main().y;          // one comes down, one stays up
  for (let i = 0; i < 30; i++) updateCamera(DT);
  const halfH = WORLD.h / 2 / state.camera.zoom;
  const lowest = state.camera.y + halfH;
  check(state.fighters[1].y < lowest, "containment still overrides the lift",
    `body ${state.fighters[1].y} vs frame bottom ${lowest.toFixed(0)}`);
  pass("the frame remembers the high ground");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
