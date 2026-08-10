// Keyboard + gamepad input, exposed as per-player snapshots with edge detection.
//
// Every binding in here comes from src/config_controls.js — the one file that
// says which key and which pad button does what, and the one the instructions
// are generated from. Nothing in this module hard-codes a button.

import { KEY_BINDS, PAD_BUTTONS, PAD_AXES } from "./config_controls.js";

const held = new Set();
const pressed = new Set();

const P1_KEYS = KEY_BINDS[1];
const P2_KEYS = KEY_BINDS[2];

const GAME_CODES = new Set([...Object.values(P1_KEYS).flat(), ...Object.values(P2_KEYS).flat(), "Space", "Escape", "Backquote"]);

const padPrev = new Map(); // pad index -> button pressed array
const padNow = new Map();
const padDeflected = new Map(); // pad index -> was any axis pushed last frame
let joinedPlayers = 1;

// How far a stick must be pushed to read as a deliberate join. Well past the
// movement deadzone, because a controller resting with a drifting stick must
// not walk itself into the match.
const JOIN_AXIS = 0.55;

// Right-stick deadzone. Wider than the movement stick's, because this stick is
// normally at rest: a smash that angles itself off controller drift is worse
// than one that needs a deliberate push. (Steering moved to the d-pad, which is
// digital and needs no deadzone at all.)
export const AIM_DEADZONE = 0.34;

// Fallback for environments that deliver key events without `code`
// (some remote/embedded browsers). Real keyboards always populate `code`.
function codeOf(e) {
  if (e.code) return e.code;
  const k = e.key;
  if (!k) return "";
  if (k.length === 1) {
    if (/[a-z]/i.test(k)) return "Key" + k.toUpperCase();
    if (/[0-9]/.test(k)) return "Digit" + k;
    const punct = { ",": "Comma", ".": "Period", "/": "Slash", "'": "Quote", " ": "Space", "`": "Backquote" };
    if (punct[k]) return punct[k];
  }
  if (k === "Shift") return "ShiftLeft";
  return k; // "ArrowLeft", "Escape", "Enter", ...
}

export function initInput() {
  window.addEventListener("keydown", (e) => {
    const code = codeOf(e);
    if (GAME_CODES.has(code)) e.preventDefault();
    if (!held.has(code)) pressed.add(code);
    held.add(code);
  });
  window.addEventListener("keyup", (e) => held.delete(codeOf(e)));
  window.addEventListener("blur", () => held.clear());
}

export function keyPressed(code) {
  return pressed.has(code);
}

export function consumeKey(code) {
  pressed.delete(code);
}

export function keyHeld(code) {
  return held.has(code);
}

export function readGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const connected = [];
  for (const pad of pads) if (pad && pad.connected) connected.push(pad);
  for (let slot = 0; slot < connected.length; slot++) {
    const pad = connected[slot];
    const prev = padNow.get(pad.index) || [];
    const now = pad.buttons.map((b) => b.pressed);
    padPrev.set(pad.index, prev);
    padNow.set(pad.index, now);
    // Player 1 always owns the first controller. Additional controller slots
    // join only once their player does something deliberate, so a passive USB
    // or Bluetooth connection cannot replace the CPU on its own.
    //
    // Any input counts, not just buttons: picking a pad up and pushing the
    // stick is how people expect to say "I'm in", and a player who did that and
    // saw nothing happen had no way to know a button was the magic word.
    const deflected = pad.axes.some((a) => Math.abs(a) > JOIN_AXIS);
    const wasDeflected = padDeflected.get(pad.index) || false;
    padDeflected.set(pad.index, deflected);
    const acted = now.some((down, i) => down && !prev[i]) || (deflected && !wasDeflected);
    if (slot > 0 && acted) {
      joinedPlayers = Math.max(joinedPlayers, Math.min(4, slot + 1));
    }
  }
}

export function joinedPlayerCount() {
  return joinedPlayers;
}

export function connectedPadCount() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let n = 0;
  for (const pad of pads) if (pad && pad.connected) n += 1;
  return n;
}

/** The physical pad driving a player slot, for rumble (rumble.js). Same
 *  mapping the input snapshots use: Nth connected pad for player N. */
export function padForPlayer(playerId) {
  return padFor(playerId);
}

function padFor(playerId) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const list = [];
  for (const pad of pads) if (pad && pad.connected) list.push(pad);
  return list[playerId - 1] || null;
}

function padButton(pad, i) {
  return !!pad.buttons[i]?.pressed;
}

function padButtonPressed(pad, i) {
  const now = padNow.get(pad.index) || [];
  const prev = padPrev.get(pad.index) || [];
  return !!now[i] && !prev[i];
}

// Buttons and axes come from PAD_BUTTONS / PAD_AXES in config_controls.js.
// The layout they describe, and why:
//
//   A jump · B dash · X light · Y heavy · LT shield · RT special
//   LB Domain Expansion · RB ultimate — the two supers, one shoulder each, so
//     neither can be pressed by accident while reaching for the other. Domain
//     used to be the whole d-pad, which was four buttons spent on a move only
//     eight fighters have and nobody has two of.
//   D-pad steers this player's summons and aims their creature shots. It took
//     that job over from the right stick when the right stick became attacks.
//
// The RIGHT STICK is the tilt stick: flick it and the fighter throws the tilt
// in that direction on the spot — the attack a light press only gives you at a
// standstill (side tilt otherwise needs a run-up) and, in the air, the aerial
// for that direction. Held rather than flicked, it still angles a charged side
// smash on release; a charge cannot act, so aiming one never fires a tilt.
const TILT_DEADZONE = 0.62;

function padSnapshot(pad) {
  const axX = Math.abs(pad.axes[PAD_AXES.moveX] || 0) > 0.28 ? pad.axes[PAD_AXES.moveX] : 0;
  const axY = Math.abs(pad.axes[PAD_AXES.moveY] || 0) > 0.42 ? pad.axes[PAD_AXES.moveY] : 0;
  const left = axX < -0.28;
  const right = axX > 0.28;
  const up = axY < -0.5;
  const down = axY > 0.5;
  const tx = pad.axes[PAD_AXES.tiltX] || 0;
  const ty = pad.axes[PAD_AXES.tiltY] || 0;
  const dLeft = padButton(pad, PAD_BUTTONS.dpadLeft);
  const dRight = padButton(pad, PAD_BUTTONS.dpadRight);
  const dUp = padButton(pad, PAD_BUTTONS.dpadUp);
  const dDown = padButton(pad, PAD_BUTTONS.dpadDown);
  return {
    left, right, up, down,
    aimX: (dRight ? 1 : 0) - (dLeft ? 1 : 0),
    aimY: (dDown ? 1 : 0) - (dUp ? 1 : 0),
    tiltX: Math.abs(tx) > AIM_DEADZONE ? tx : 0,
    tiltY: Math.abs(ty) > AIM_DEADZONE ? ty : 0,
    tiltDir: tiltFlick(pad, tx, ty),
    jumpP: padButtonPressed(pad, PAD_BUTTONS.jump),
    jumpHeld: padButton(pad, PAD_BUTTONS.jump),
    lightP: padButtonPressed(pad, PAD_BUTTONS.light),
    heavyP: padButtonPressed(pad, PAD_BUTTONS.heavy),
    heavyHeld: padButton(pad, PAD_BUTTONS.heavy),
    specialP: padButtonPressed(pad, PAD_BUTTONS.special),
    dashP: padButtonPressed(pad, PAD_BUTTONS.dash),
    domainP: padButtonPressed(pad, PAD_BUTTONS.domain),
    ultP: padButtonPressed(pad, PAD_BUTTONS.ult),
    shieldHeld: padButton(pad, PAD_BUTTONS.shield),
    pauseP: padButtonPressed(pad, PAD_BUTTONS.pause),
  };
}

// A tilt fires on the FLICK, not on the hold: the stick has to return near
// centre before it can throw another. Held past the edge it would otherwise
// machine-gun tilts, and a player angling a smash would be holding an attack.
const tiltRest = new Map(); // pad index -> is the stick outside the deadzone

function tiltFlick(pad, tx, ty) {
  const out = Math.hypot(tx, ty) > TILT_DEADZONE;
  const was = tiltRest.get(pad.index) || false;
  tiltRest.set(pad.index, out);
  if (!out || was) return null;
  return Math.abs(ty) > Math.abs(tx) ? (ty < 0 ? "up" : "down") : (tx < 0 ? "left" : "right");
}

function keysSnapshot(map) {
  const anyHeld = (codes) => codes.some((c) => held.has(c));
  const anyPressed = (codes) => codes.some((c) => pressed.has(c));
  // Keyboard steering is all-or-nothing per direction; the pad's analog
  // magnitude is the richer version of the same axis.
  const axis = (neg, pos) => (anyHeld(pos || []) ? 1 : 0) - (anyHeld(neg || []) ? 1 : 0);
  return {
    left: anyHeld(map.left), right: anyHeld(map.right),
    up: anyHeld(map.up), down: anyHeld(map.down),
    aimX: axis(map.steerLeft, map.steerRight),
    aimY: axis(map.steerUp, map.steerDown),
    jumpP: anyPressed(map.up),
    jumpHeld: anyHeld(map.up),
    lightP: anyPressed(map.light),
    heavyP: anyPressed(map.heavy),
    heavyHeld: anyHeld(map.heavy),
    specialP: anyPressed(map.special),
    ultP: anyPressed(map.ult),
    shieldHeld: anyHeld(map.shield),
    dashP: anyPressed(map.dash || []),
    domainP: anyPressed(map.domain || []),
    // No keyboard tilt stick: on keys a tilt is what a light press already
    // gives you with a direction held, so there is nothing extra to bind.
    tiltX: 0, tiltY: 0, tiltDir: null,
    pauseP: false,
  };
}

export function blankInput() {
  return {
    left: false, right: false, up: false, down: false,
    jumpP: false, jumpHeld: false, lightP: false,
    heavyP: false, heavyHeld: false, specialP: false, ultP: false,
    shieldHeld: false, pauseP: false, dirX: 0, dashP: false,
    // Domain Expansion (LB / U). One button: nobody has two domains, and a
    // fighter who does picks between them with the left stick (domains.js).
    domainP: false,
    // D-pad summon steering / creature aim, -1..1 each.
    aimX: 0, aimY: 0,
    // The right stick. `tiltX/tiltY` is where it is being held, which is what
    // angles a charged smash; `tiltDir` is set for ONE frame on a fresh flick
    // and is what throws a tilt attack.
    tiltX: 0, tiltY: 0, tiltDir: null,
  };
}

// Buttons merge by OR; the analog axes merge by whichever source is pushed
// furthest, so a pad and a keyboard on the same player cannot cancel out or
// collapse a stick to a boolean.
const AXIS_KEYS = new Set(["dirX", "aimX", "aimY", "tiltX", "tiltY"]);
// Fields that carry a VALUE rather than a flag. Whichever source has one wins,
// pad first. ORing these would turn "up" into `true`, which reads as a flick in
// no direction at all.
const VALUE_KEYS = new Set(["tiltDir"]);

function mergeInputs(a, b) {
  const out = blankInput();
  for (const key of Object.keys(out)) {
    if (AXIS_KEYS.has(key)) {
      const av = a[key] || 0;
      const bv = b[key] || 0;
      out[key] = Math.abs(av) >= Math.abs(bv) ? av : bv;
    } else if (VALUE_KEYS.has(key)) {
      out[key] = a[key] ?? b[key] ?? null;
    } else {
      out[key] = !!(a[key] || b[key]);
    }
  }
  return out;
}

export function playerInput(playerId) {
  const keys = playerId === 1 ? keysSnapshot(P1_KEYS) :
    playerId === 2 ? keysSnapshot(P2_KEYS) : blankInput();
  const pad = padFor(playerId);
  const merged = pad ? mergeInputs(keys, padSnapshot(pad)) : keys;
  merged.dirX = (merged.right ? 1 : 0) - (merged.left ? 1 : 0);
  return merged;
}

export function anyPadPausePressed() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (pad && pad.connected && padButtonPressed(pad, PAD_BUTTONS.pause)) return true;
  }
  return false;
}

// Menus are driven by ANY connected pad, so a second player can navigate too.
// Directions report as held state (the menu layer handles its own repeat);
// buttons report as edges.
export function padsMenuState() {
  const out = {
    up: false, down: false, left: false, right: false,
    confirmP: false, backP: false, altP: false,
    pagePrevP: false, pageNextP: false,
  };
  for (const state of padsMenuStates()) {
    for (const key of Object.keys(out)) out[key] ||= state[key];
  }
  return out;
}

// One menu snapshot per connected pad, in the same stable order used by
// playerInput(). Character select consumes these separately so each player has
// an independent cursor instead of all pads steering one shared DOM focus.
export function padsMenuStates() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const out = [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    out.push({
      up: ay < -0.5 || padButton(pad, PAD_BUTTONS.dpadUp),
      down: ay > 0.5 || padButton(pad, PAD_BUTTONS.dpadDown),
      left: ax < -0.5 || padButton(pad, PAD_BUTTONS.dpadLeft),
      right: ax > 0.5 || padButton(pad, PAD_BUTTONS.dpadRight),
      confirmP: padButtonPressed(pad, PAD_BUTTONS.jump),
      backP: padButtonPressed(pad, PAD_BUTTONS.dash),
      altP: padButtonPressed(pad, PAD_BUTTONS.light),
      pagePrevP: padButtonPressed(pad, PAD_BUTTONS.domain),
      pageNextP: padButtonPressed(pad, PAD_BUTTONS.ult),
    });
  }
  return out;
}

export function endInputFrame() {
  pressed.clear();
}
