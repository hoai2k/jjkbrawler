// Keyboard + gamepad input, exposed as per-player snapshots with edge detection.

const held = new Set();
const pressed = new Set();

const P1_KEYS = {
  left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"],
  light: ["KeyJ"], heavy: ["KeyK"], special: ["KeyL"], ult: ["KeyI"],
  shield: ["ShiftLeft"],
  // Domain Expansion. Three slots so a fighter with more than one domain can
  // bind them separately; only slot 0 is used by the current roster.
  domain: ["KeyU"], domain2: ["KeyY"], domain3: ["KeyO"],
};

const P2_KEYS = {
  left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"],
  light: ["Comma", "Numpad1"], heavy: ["Period", "Numpad2"], special: ["Slash", "Numpad3"], ult: ["Quote", "Numpad0"],
  shield: ["ShiftRight", "NumpadEnter"],
  domain: ["Semicolon", "Numpad5"], domain2: ["BracketLeft", "Numpad4"], domain3: ["BracketRight", "Numpad6"],
};

const GAME_CODES = new Set([...Object.values(P1_KEYS).flat(), ...Object.values(P2_KEYS).flat(), "Space", "Escape", "Backquote"]);

const padPrev = new Map(); // pad index -> button pressed array
const padNow = new Map();
let joinedPlayers = 1;

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
    // join only after their player presses a button, preventing passive USB or
    // Bluetooth connections from unexpectedly replacing the CPU.
    if (slot > 0 && now.some((down, i) => down && !prev[i])) {
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

// Standard mapping: 0 A jump, 1 B special, 2 X light, 3 Y heavy,
// 4 LB ultimate, 5 RB ultimate, 6/7 LT/RT shield.
//
// The D-pad (12-15) is the DOMAIN pad, not a second movement stick: up opens a
// fighter's primary Domain Expansion, left/right open alternates where they
// have them. Movement is the left analog stick. The d-pad used to duplicate
// the stick, so nothing that was reachable before became unreachable — but a
// player who moved on the d-pad has to use the stick now, which is why the
// controls screen calls it out.
function padSnapshot(pad) {
  const axX = Math.abs(pad.axes[0] || 0) > 0.28 ? pad.axes[0] : 0;
  const axY = Math.abs(pad.axes[1] || 0) > 0.42 ? pad.axes[1] : 0;
  const left = axX < -0.28;
  const right = axX > 0.28;
  const up = axY < -0.5;
  const down = axY > 0.5;
  return {
    left, right, up, down,
    domainP: padButtonPressed(pad, 12),
    domain2P: padButtonPressed(pad, 14),
    domain3P: padButtonPressed(pad, 15),
    jumpP: padButtonPressed(pad, 0),
    jumpHeld: padButton(pad, 0),
    lightP: padButtonPressed(pad, 2),
    heavyP: padButtonPressed(pad, 3),
    heavyHeld: padButton(pad, 3),
    specialP: padButtonPressed(pad, 1),
    ultP: padButtonPressed(pad, 4) || padButtonPressed(pad, 5),
    shieldHeld: padButton(pad, 6) || padButton(pad, 7),
    pauseP: padButtonPressed(pad, 9),
  };
}

function keysSnapshot(map) {
  const anyHeld = (codes) => codes.some((c) => held.has(c));
  const anyPressed = (codes) => codes.some((c) => pressed.has(c));
  return {
    left: anyHeld(map.left), right: anyHeld(map.right),
    up: anyHeld(map.up), down: anyHeld(map.down),
    jumpP: anyPressed(map.up),
    jumpHeld: anyHeld(map.up),
    lightP: anyPressed(map.light),
    heavyP: anyPressed(map.heavy),
    heavyHeld: anyHeld(map.heavy),
    specialP: anyPressed(map.special),
    ultP: anyPressed(map.ult),
    shieldHeld: anyHeld(map.shield),
    domainP: anyPressed(map.domain || []),
    domain2P: anyPressed(map.domain2 || []),
    domain3P: anyPressed(map.domain3 || []),
    pauseP: false,
  };
}

export function blankInput() {
  return {
    left: false, right: false, up: false, down: false,
    jumpP: false, jumpHeld: false, lightP: false,
    heavyP: false, heavyHeld: false, specialP: false, ultP: false,
    shieldHeld: false, pauseP: false, dirX: 0,
    domainP: false, domain2P: false, domain3P: false,
  };
}

function mergeInputs(a, b) {
  const out = blankInput();
  for (const key of Object.keys(out)) out[key] = !!(a[key] || b[key]);
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
    if (pad && pad.connected && padButtonPressed(pad, 9)) return true;
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
      up: ay < -0.5 || padButton(pad, 12),
      down: ay > 0.5 || padButton(pad, 13),
      left: ax < -0.5 || padButton(pad, 14),
      right: ax > 0.5 || padButton(pad, 15),
      confirmP: padButtonPressed(pad, 0),
      backP: padButtonPressed(pad, 1),
      altP: padButtonPressed(pad, 2),
      pagePrevP: padButtonPressed(pad, 4),
      pageNextP: padButtonPressed(pad, 5),
    });
  }
  return out;
}

export function endInputFrame() {
  pressed.clear();
}
