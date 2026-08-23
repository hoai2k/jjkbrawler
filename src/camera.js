import { state } from "./state.js";
import { clamp, lerp } from "./utils.js";
import { WORLD, RESPAWN_WAIT } from "./constants.js";
import { mainPlatform } from "./stages.js";
import { ART_SCALE } from "./config_tuning.js";

// Smash-style framing: fit the alive fighters' bounding box, padded, and zoom
// to whatever makes that box fill the frame — tight duels are shot tight, a
// full-stage scramble pulls back.
// The pads are sized for the fighters plus the space a fight needs around
// them: heads and jumps above (fighter y is the foot line), attack reach and
// a beat of lookahead to the sides, a strip of ground below.
// The pads are body-sized, so they shrink with the bodies: the room a fight
// needs around two fighters is a fact about the fighters, and holding 240px
// beside a 104px body frames a duel like a wide shot of an empty stage.
const FRAME_PAD_X = 240 * ART_SCALE;
const FRAME_PAD_TOP = 280 * ART_SCALE;
const FRAME_PAD_BOTTOM = 120 * ART_SCALE;
// 1.32 restores the on-screen size fighters had before the roster shrank 15%
// (docs/level-design-review.md G1a): close fights read as large as ever, and
// the zoom-out is what buys the bigger boards their room.
// ...and the zoom goes the other way by exactly as much, so a fighter lands on
// screen the size they always were. This is the half of the roster shrink that
// makes it invisible: the bodies are 70% of what they were in WORLD pixels and
// 100% of what they were in SCREEN pixels, and what actually changed is how
// much board fits around them.
const ZOOM_MAX = 1.32 / ART_SCALE;
const ZOOM_SOLO = 1.12 / ART_SCALE;
// Below 1 the view reaches past the painted world, into the strip of blast
// zone where recoveries actually happen: at 0.78 the shot is 1641 × 923, wide
// enough to hold two fighters hanging off opposite ledges at once. Everything
// painted world-wide bleeds out to match (VIEW_BLEED, render.js). Lower than
// this and the fighters stop reading.
// NOT scaled with the roster, deliberately. This is the floor that lets the
// shot reach into the blast zone after somebody who is recovering, and the
// blast zone did not move when the bodies shrank — it is board, not body. Held
// at 0.78 the frame still covers 1641 x 923 world px, which is what holding two
// fighters off opposite ledges actually costs.
export const ZOOM_MIN = 0.78;
// How far off the world the view centre may push the frame, so a fighter
// scrapping for a ledge from off-stage stays on screen. Generous on purpose:
// it is the containment pass below, not this clamp, that decides where the
// camera goes — this only stops it chasing a body into the blast zone.
const OVERSCAN_X = 280;
const OVERSCAN_Y = 260;

// The frame leads each fighter's velocity by this many seconds (capped), so a
// launch is anticipated instead of chased. Without it the framing target is
// always one reaction behind the fighter that just got hit.
const LOOKAHEAD_T = 0.16;
const LOOKAHEAD_MAX = 260;

// The hard floor under all the smoothing: whatever the eased target is doing,
// every alive fighter's body stays inside the frame with this much room. Top
// pad clears the tallest fighter (200 px) with slack to spare; the rest is
// body width (~76 px at the widest) and a strip of ground. These only ever
// bind in the moments the eased framing would have lost somebody — in normal
// play the frame is wider than they ask for.
const KEEP_PAD_X = 110 * ART_SCALE;
const KEEP_PAD_TOP = 250 * ART_SCALE;
const KEEP_PAD_BOTTOM = 70 * ART_SCALE;

// A FIGHTER WHO IS COMING BACK IS STILL IN THE SHOT — ON THEIR WAY BACK.
//
// A ring-out used to take them out of the framing outright. Two cuts came of
// that, in the same second: the frame let go of the body it had been holding at
// the blast line and whipped in toward whoever was left, and then the blackout
// ended, a body appeared on a revival platform most of a stage away, and the
// containment pass below — which must open the frame the instant somebody is
// outside it — snapped the zoom in ONE frame to catch it.
//
// Both ends are known in advance. fighter.js records where they went out and
// where they are coming back the moment they are rung out (`respawnAt`), so
// what the camera tracks through the blackout is a POINT TRAVELLING BETWEEN
// THEM: at the ring-out it is exactly where the fighter was, so nothing is let
// go of; at the arrival it is exactly where the body appears, so nothing is
// discovered. In between the shot carries the eye across, which is the move a
// human operator would make.
//
// Eased rather than linear, because the ends are what matter: it leaves the
// blast line gently and settles onto the platform gently, and the middle —
// empty stage nobody is looking at — is where the speed goes.
const smooth = (t) => t * t * (3 - 2 * t);

/** How far through the trip back a rung-out fighter is, 0..1. */
const arriving = (f) => (f.dead || !f.respawnAt ? 0
  : smooth(1 - clamp(f.respawnTimer / RESPAWN_WAIT, 0, 1)));

// A FIGHTER ON A LEDGE IS AT THE EDGE OF THE STAGE, NOT IN THE MIDDLE OF A
// FIGHT — SO THE SHOT HOLDS THE EDGE.
//
// Ledge play is four or five fast, short movements inside 150 px: fall past the
// lip, snap onto the hang, hold, climb or roll or jump, maybe drop and regrab.
// Framed body-tight, each one moves the camera — and because they alternate
// direction, the frame swims back and forth through the whole exchange. The
// motion is real and the tracking is honest; it is just not worth following.
// Nobody watching needs the hang centred, they need to SEE it, and the corner
// it happens around does not move at all.
//
// So while the grip has the drawing (fighter.js hangGripW — in across the
// catch, 1 on the hang, out across whichever exit they take), the point this
// fighter contributes to the framing eases from their body onto the platform
// corner, and their velocity stops leading it. The containment pass below is
// untouched and still keeps the real body in frame with its full margin: this
// decides what the shot is ABOUT, never what it is allowed to lose.
function framePoint(f) {
  const at = ledgeHold(f);
  const lead = (v) => clamp((v || 0) * LOOKAHEAD_T, -LOOKAHEAD_MAX, LOOKAHEAD_MAX) * (1 - at.w);
  return {
    x: at.w ? lerp(f.x, at.x, at.w) : f.x,
    y: at.w ? lerp(f.y, at.y, at.w) : f.y,
    lx: lead(f.vx),
    ly: lead(f.vy),
  };
}

/** The corner a fighter's ledge business is happening around, and how much of
 *  the shot it owns.
 *
 *  Full through the hang, and either side of it a ramp, so both edges of the
 *  hold are movements rather than switches:
 *
 *    catching   the hands closing on the lip — the shot settles onto it over
 *               the reach, so the last of the fall is followed and the arrival
 *               is not
 *    hanging    entirely the corner's; a hang does not move
 *    leaving    the grip's own release (fighter.js hangGripW), which is
 *               already the ramp the drawing is handed back on, so the frame
 *               takes the fighter back exactly as the body does
 *
 *  Null weight for everyone else, which is almost everyone almost always. */
function ledgeHold(f) {
  const corner = f.ledge
    ? { x: f.ledge.edgeX, y: f.ledge.plat.y }
    : (f.hangGrip || null);
  if (!corner) return { w: 0 };
  const m = f.ledgeMove;
  const w = m?.kind === "catch" ? smooth(clamp(m.t / m.dur, 0, 1))
    : f.ledge ? 1
      : clamp(f.hangGripW || 0, 0, 1);
  return { x: corner.x, y: corner.y, w };
}

/** Where the shot should be holding them right now. */
function returnPoint(f) {
  const r = f.respawnAt;
  const k = arriving(f);
  return {
    x: lerp(r.fromX ?? r.x, r.x, k),
    y: lerp(r.fromY ?? r.y, r.y, k),
  };
}

// A FIGHT THAT IS NOT GOING ANYWHERE DOES NOT MOVE THE CAMERA AT ALL.
//
// The framing target is built out of live bodies, and a body is never quite
// still: an idle sways, a walk cycle's centre of mass slides a few pixels
// inside the stride, and the sprite a pose is drawn from has its own centre
// that differs a little from the next one's. None of that is motion anyone is
// watching — but the frame was tracking every pixel of it, and because the
// camera holds the fighters roughly fixed on screen, the wobble came out of
// the bodies and went into the WORLD: the stage swam behind a fighter standing
// still. That is the jiggle. It is worst exactly where the shot is best, in a
// tight duel, because tight is where a pixel of target is most screen pixels.
//
// So the target the pan eases toward is not the raw one: it is an aim point
// dragged behind it, allowed to sit anywhere inside a small box around it. The
// aim only moves when the raw target pushes the wall of the box, and then only
// by the overshoot, so:
//
//   sway, breath, per-frame centre noise   the aim does not move — at all, not
//                                          slowly, not a little; the frame is
//                                          perfectly still
//   a step, a jump, a launch               the target leaves the box on the
//                                          first frame and drags the aim with
//                                          it for as long as it keeps moving,
//                                          which is ordinary tracking
//
// A deadzone rather than more damping, because damping cannot tell those two
// apart: any ease big enough to follow a launch still passes a fraction of the
// jitter through, every frame, forever. The box is sized in SCREEN pixels and
// converted at the live zoom, so it is the same visual stillness whether the
// shot is tight on a duel or wide over a scramble.
const DEAD_ZONE_X = 16;
const DEAD_ZONE_Y = 12;
// The same idea for the zoom, which had the same problem in a form that is
// even easier to see: the fit is computed off the bounding box, so a body
// swaying two pixels rescaled the entire picture every frame. Relative, since
// zoom is a ratio: 0.4% is under a pixel of drift at the edge of the frame.
const ZOOM_DEAD_ZONE = 0.004;

/** Pull `aim` the smallest distance that puts it within `dz` of `target` —
 *  i.e. hold it exactly still while the target moves inside the box. */
const deadzone = (aim, target, dz) => clamp(aim, target - dz, target + dz);

const PAN_DAMP = 0.0009;
// ...AND A SPEED LIMIT ON TOP OF IT, because an eased pan is proportional and
// proportional is fastest exactly when the error is largest. A fighter coming
// back from a ledge closes a 300 px framing error, and the first frame of that
// ease is a third of it: the shot lurches, settles, and reads as the camera
// having been startled. The ledge is where this bites hardest — going out and
// coming back is four such errors in a few seconds — but nothing about it is
// special, so this is not a ledge rule.
//
// 720 px/s is 12 px a frame: quicker than a fighter can run (468) and under a
// fast fall (900), so the frame can still travel with anybody without ever
// moving faster than the thing it is following. The containment pass below is
// NOT limited and overrides this whenever it binds — a comfort rule must never
// be the reason somebody leaves the frame.
const PAN_MAX_SPEED = 720;
// Settling into a tighter shot is slow and unnoticeable; opening up to keep
// somebody in frame is near-instant. A single symmetric rate cannot do both,
// and it was the slow one that let a launched fighter leave the frame.
const ZOOM_IN_DAMP = 0.0015;
const ZOOM_OUT_DAMP = 0.00002;

// THE FRAME REMEMBERS THAT THE FIGHT WENT UPSTAIRS.
//
// The shot is framed around the bodies, so a fight that climbs to the top
// platform pulls the camera up and the main platform drops down the screen —
// which is right, and which the frame then throws away the moment everyone
// lands, snapping the ground back to mid-screen with a band of empty backdrop
// under it. On a board whose play LIVES up top that is a camera bobbing up and
// down all match, and it is worst exactly where the headroom matters.
//
// So how much play is happening high up is remembered, and the framing keeps
// the ground low for as long as it stays true. This is the standard shape for
// "react fast, forget slowly" — an ATTACK/RELEASE ENVELOPE, the same asymmetric
// damping Cinemachine gives a framing target and the same trick the zoom above
// already plays (ZOOM_IN_DAMP vs ZOOM_OUT_DAMP: settle slowly, open instantly).
// One state variable, two rates, no modes.
//
//   drive    how far the highest fighter is above the main platform, as a
//            fraction of HIGH_REF — 0 on the ground, 1 at a top platform
//   attack   ~1.4s: a single hop nudges it, a fight that stays up saturates it
//   release  ~9.5s: the ground stays low well past one player touching down,
//            and only a real return to ground-level play eases it back
//
// The bias is a PREFERENCE, applied to the framing target: the containment
// pass below still owes every body a place in frame and overrides this
// whenever it binds, so remembering the high ground can never lose somebody.
const HIGH_REF = 240;                 // ~a double jump's rise: full deflection
const HIGH_BIAS_MAX = 170 * ART_SCALE; // how far up the frame may be carried
const HIGH_ATTACK_DAMP = 0.5;         // toward more headroom — quick, not instant
const HIGH_RELEASE_DAMP = 0.9;        // back to the default — slow on purpose

/** Step the high-play envelope and return this frame's upward framing bias in
 *  world px. `alive` is the bodies actually on the stage. */
function highPlayBias(dt, alive) {
  const cam = state.camera;
  const plat = mainPlatform(state.platforms);
  let drive = 0;
  if (plat && alive.length) {
    // The HIGHEST body decides: it is the one whose headroom is in question,
    // and it is what "the top of the screen is being used" means.
    let above = -Infinity;
    for (const f of alive) above = Math.max(above, plat.y - f.y);
    drive = clamp(above / HIGH_REF, 0, 1);
  }
  const damp = drive > (cam.highT ?? 0) ? HIGH_ATTACK_DAMP : HIGH_RELEASE_DAMP;
  cam.highT = lerp(cam.highT ?? 0, drive, 1 - Math.pow(damp, dt));
  return HIGH_BIAS_MAX * cam.highT;
}

/** Clamp a view centre so the frame stays over the world, allowing `overscan`
 *  px of gutter past each edge. A view wider than world+gutter just centres. */
function clampView(c, half, size, overscan) {
  const lo = half - overscan;
  const hi = size - half + overscan;
  return lo > hi ? size / 2 : clamp(c, lo, hi);
}

/** Slide a view centre the smallest distance that puts [lo, hi] inside a frame
 *  of half-extent `half`. Wider than the frame: centre on it and lose the least. */
function contain(c, half, lo, hi) {
  if (hi - lo > half * 2) return (lo + hi) / 2;
  return clamp(c, hi - half, lo + half);
}

// THE SHOT IS FRAMED INTO WHAT THE HUD LEAVES, NOT INTO THE WHOLE CANVAS.
//
// The damage plates are painted over the top of the picture, so the strip of
// frame beneath them is the only part a player is actually watching the fight
// in — and centring the fight in the canvas puts it half a HUD too high in
// that strip, with the headroom a launch needs hidden behind the readouts and
// a matching band of empty floor going spare at the bottom.
//
// So everything vertical here works in the VISIBLE window: the framing target
// is pushed down by half the band (which moves the fight down the screen by
// exactly the amount the HUD took), the zoom fits the box into the shorter
// height, and containment holds bodies under the band rather than under the
// canvas edge. `state.hudBand` is the fraction of the arena's height the HUD
// covers, measured off the live layout by ui.js; at 0 every line below is the
// arithmetic that was here before.
const bandFrac = () => clamp(state.hudBand || 0, 0, 0.3);

/** The HUD band in world px at a given zoom. */
const bandWorld = (zoom) => bandFrac() * WORLD.h / zoom;

/** Vertical containment, in the window under the HUD: the smallest move that
 *  puts [lo, hi] between the band's lower edge and the bottom of the frame. */
function containY(c, half, band, lo, hi) {
  // The visible strip is the frame minus the band, and its centre sits half a
  // band below the camera's own.
  return contain(c + band / 2, half - band / 2, lo, hi) - band / 2;
}

export function updateCamera(dt) {
  const cam = state.camera;
  const alive = state.fighters.filter((f) => !f.dead && f.respawnTimer <= 0);
  // The bodies that are not on the stage yet, at the point they will appear.
  const incoming = state.fighters
    .filter((f) => f.respawnTimer > 0 && f.respawnAt && !f.dead)
    .map(returnPoint);
  const framed = alive.length + incoming.length;

  let cx = WORLD.w / 2;
  let cy = WORLD.h / 2;
  let zoomTarget = 1;

  if (framed >= 2) {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const f of alive) {
      const p = framePoint(f);
      left = Math.min(left, p.x, p.x + p.lx);
      right = Math.max(right, p.x, p.x + p.lx);
      top = Math.min(top, p.y, p.y + p.ly);
      bottom = Math.max(bottom, p.y, p.y + p.ly);
    }
    // No lookahead: this point's whole path is already known, so there is
    // nothing to anticipate.
    for (const p of incoming) {
      left = Math.min(left, p.x);
      right = Math.max(right, p.x);
      top = Math.min(top, p.y);
      bottom = Math.max(bottom, p.y);
    }
    left -= FRAME_PAD_X;
    right += FRAME_PAD_X;
    top -= FRAME_PAD_TOP;
    bottom += FRAME_PAD_BOTTOM;
    zoomTarget = clamp(
      Math.min(WORLD.w / (right - left), WORLD.h * (1 - bandFrac()) / (bottom - top)),
      ZOOM_MIN, ZOOM_MAX,
    );
    cx = (left + right) / 2;
    cy = (top + bottom) / 2;
  } else if (framed === 1 && alive.length === 1) {
    const p = framePoint(alive[0]);
    cx = p.x + p.lx / 2;
    cy = p.y - 90 + p.ly / 2;
    zoomTarget = ZOOM_SOLO;
  }

  // Down by half the band: the fight lands in the middle of the strip under
  // the HUD instead of the middle of the canvas.
  cy -= bandWorld(clamp(zoomTarget, ZOOM_MIN, ZOOM_MAX)) / 2;

  // ...and up by whatever the fight's recent altitude has earned, which keeps
  // the ground low in frame while play stays high. Stepped every frame, so it
  // decays on the menu and between matches rather than freezing mid-lift.
  cy -= highPlayBias(dt, alive);

  // The deadzone, on the framing target rather than on the camera: everything
  // downstream — the ease, the speed limit, the containment pass — still works
  // on whatever comes out of it, so the shot's character is unchanged. What
  // changed is that a still fight presents a target that is genuinely still
  // instead of one that vibrates. The hit kick below and the hard fit in the
  // containment pass are deliberate moves, not noise, and go straight through.
  //
  // Stale aim from the last match self-corrects: one clamp puts it in the box.
  cam.aimZoom = deadzone(cam.aimZoom ?? zoomTarget, zoomTarget, zoomTarget * ZOOM_DEAD_ZONE);
  zoomTarget = cam.aimZoom;

  if (cam.kick > 0) {
    cam.kick = Math.max(0, cam.kick - dt);
    zoomTarget += 0.05;
  }

  const zoomDamp = zoomTarget < cam.zoom ? ZOOM_OUT_DAMP : ZOOM_IN_DAMP;
  cam.zoom = lerp(cam.zoom, zoomTarget, 1 - Math.pow(zoomDamp, dt));

  cam.aimX = deadzone(cam.aimX ?? cx, cx, DEAD_ZONE_X / cam.zoom);
  cam.aimY = deadzone(cam.aimY ?? cy, cy, DEAD_ZONE_Y / cam.zoom);
  cx = cam.aimX;
  cy = cam.aimY;

  const panHalfW = WORLD.w / 2 / cam.zoom;
  const panHalfH = WORLD.h / 2 / cam.zoom;
  const panT = 1 - Math.pow(PAN_DAMP, dt);
  const wantX = lerp(cam.x, clampView(cx, panHalfW, WORLD.w, OVERSCAN_X), panT);
  const wantY = lerp(cam.y, clampView(cy, panHalfH, WORLD.h, OVERSCAN_Y), panT);
  const dx = wantX - cam.x;
  const dy = wantY - cam.y;
  const step = Math.hypot(dx, dy);
  const cap = PAN_MAX_SPEED * dt;
  const k = step > cap ? cap / step : 1;
  cam.x += dx * k;
  cam.y += dy * k;

  // Containment. The eased pan above is what the shot WANTS; this is what it
  // owes. Anyone the easing (or a zoom that has not finished opening) would
  // have left behind pulls the frame the minimum distance that keeps them in
  // it — including the shake amplitude, which is applied after this.
  let halfW = WORLD.w / 2 / cam.zoom;
  let halfH = WORLD.h / 2 / cam.zoom;
  if (alive.length || incoming.length) {
    const m = cam.shake * 0.5;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const f of alive) {
      left = Math.min(left, f.x - KEEP_PAD_X - m);
      right = Math.max(right, f.x + KEEP_PAD_X + m);
      top = Math.min(top, f.y - KEEP_PAD_TOP - m);
      bottom = Math.max(bottom, f.y + KEEP_PAD_BOTTOM + m);
    }
    // ...and the travelling point, held exactly as a body is. It is where the
    // fighter was when the frame last owed them anything and where the next one
    // appears, so honouring it throughout is what makes both ends free: nothing
    // is dropped at the ring-out and nothing is found at the arrival.
    for (const p of incoming) {
      left = Math.min(left, p.x - KEEP_PAD_X - m);
      right = Math.max(right, p.x + KEEP_PAD_X + m);
      top = Math.min(top, p.y - KEEP_PAD_TOP - m);
      bottom = Math.max(bottom, p.y + KEEP_PAD_BOTTOM + m);
    }
    // Zoom out NOW if the eased zoom has not opened far enough — the shot may
    // lag on the way in, never on the way out. A 2000 px/s launch outruns any
    // easing, and a frame of snap reads far better than a lost fighter.
    const fit = Math.min(
      WORLD.w / (right - left),
      WORLD.h * (1 - bandFrac()) / (bottom - top),
    );
    if (fit < cam.zoom) cam.zoom = Math.max(ZOOM_MIN, fit);
    halfW = WORLD.w / 2 / cam.zoom;
    halfH = WORLD.h / 2 / cam.zoom;
    cam.x = contain(cam.x, halfW, left, right);
    cam.y = containY(cam.y, halfH, bandWorld(cam.zoom), top, bottom);
  }

  // Whatever the containment asked for, the frame still stops at the gutter:
  // a body flung to the blast line is gone, and chasing it would show the
  // unpainted void rather than the fight.
  cam.x = clampView(cam.x, halfW, WORLD.w, OVERSCAN_X);
  cam.y = clampView(cam.y, halfH, WORLD.h, OVERSCAN_Y);

  cam.shake = Math.max(0, cam.shake - dt * 44);
}

export function applyCamera(ctx) {
  const cam = state.camera;
  const sx = (Math.random() - 0.5) * cam.shake;
  const sy = (Math.random() - 0.5) * cam.shake;
  ctx.save();
  ctx.translate(WORLD.w / 2 + sx, WORLD.h / 2 + sy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

export function releaseCamera(ctx) {
  ctx.restore();
}
