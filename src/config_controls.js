// ---------------------------------------------------------------------------
// The control map — the ONE place a binding is written down.
//
// Every surface that reads inputs or describes them starts here:
//
//   src/input.js          builds its keyboard and pad snapshots from KEY_BINDS
//                         and PAD_BUTTONS
//   src/config_menus.js   builds the move screen's keyboard lines and pad tips
//                         from CONTROL_ROWS, so the in-game instructions cannot
//                         describe a button the game does not use
//   tools/check_controls.mjs  regenerates the tables in README.md and
//                         docs/game-mechanics.md and fails `npm run check` if
//                         they have drifted (`--fix` rewrites them)
//
// So: change a key code or a pad index here, and the game AND every set of
// instructions move together. Nothing else hard-codes a button.
// ---------------------------------------------------------------------------

/** Keyboard codes per player slot. Slots 3 and 4 are gamepad-only. */
export const KEY_BINDS = {
  1: {
    left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"],
    light: ["KeyJ"], heavy: ["KeyK"], special: ["KeyL"], ult: ["KeyI"],
    shield: ["ShiftLeft"],
    dash: ["KeyQ"],
    // Domain Expansion — one key, like the one shoulder button it mirrors.
    domain: ["KeyU"],
    // Summon steering — the keyboard's stand-in for the d-pad. A cluster left
    // of the attack keys, reachable without leaving the WASD hand's
    // neighbours; see summons.js for what it drives.
    steerUp: ["KeyT"], steerLeft: ["KeyF"], steerDown: ["KeyG"], steerRight: ["KeyH"],
  },
  2: {
    left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"],
    light: ["Comma", "Numpad1"], heavy: ["Period", "Numpad2"], special: ["Slash", "Numpad3"], ult: ["Quote", "Numpad0"],
    shield: ["ShiftRight", "NumpadEnter"],
    dash: ["Backslash"],
    domain: ["Semicolon", "Numpad5"],
    // The numpad is fully spoken for by P2's buttons, so their steering cluster
    // is the number row in the same 8/4/5/6 shape.
    steerUp: ["Digit8"], steerLeft: ["Digit4"], steerDown: ["Digit5"], steerRight: ["Digit6"],
  },
};

/** Standard-mapping gamepad button indices. */
export const PAD_BUTTONS = {
  jump: 0,
  dash: 1,
  light: 2,
  heavy: 3,
  domain: 4,   // LB
  ult: 5,      // RB
  shield: 6,   // LT
  special: 7,  // RT
  pause: 9,
  dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15,
};

/** Analog axes. The left stick moves; the right stick attacks. */
export const PAD_AXES = { moveX: 0, moveY: 1, tiltX: 2, tiltY: 3 };

// How a key code is written on screen. Anything not listed reads as itself
// minus the "Key"/"Digit" prefix, which covers every letter and number.
const KEY_LABELS = {
  ArrowLeft: "◀", ArrowRight: "▶", ArrowUp: "▲", ArrowDown: "▼",
  ShiftLeft: "Left Shift", ShiftRight: "Right Shift",
  Comma: ",", Period: ".", Slash: "/", Quote: "'", Semicolon: ";",
  Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  NumpadEnter: "Numpad Enter", Space: "Space", Escape: "Esc",
};

export function keyLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith("Numpad")) return `Numpad ${code.slice(6)}`;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

// The control scheme as rows, in the order the tables print them. `pad` is
// hand-written against PAD_BUTTONS above, which is what the game reads — a pad
// button has no code to derive a name from.
//
// There is no keyboard column. The game is played on controllers, one pad per
// player: that is what the roster, the four-way select screen and the in-game
// diagram are all built around, and it is what the instructions describe.
// KEY_BINDS above still drives slots 1 and 2 so the game can be played and
// tested at a desk with no pad plugged in, but it is deliberately undocumented
// rather than offered as a supported way to play.
export const CONTROL_ROWS = [
  { id: "move", action: "Move", pad: "Left stick" },
  { id: "jump", action: "Jump", pad: "A" },
  { id: "crouch", action: "Crouch / fast-fall", pad: "Left stick ▼" },
  { id: "light", action: "Light attack", pad: "X" },
  { id: "heavy", action: "Heavy attack (hold = charge)", pad: "Y" },
  { id: "special", action: "Special", pad: "RT" },
  { id: "dash", action: "Dash", pad: "B, or double-tap" },
  { id: "ult", action: "Ultimate", pad: "RB" },
  { id: "domain", action: "Domain Expansion", pad: "LB" },
  { id: "shield", action: "Shield / dodges", pad: "LT" },
  { id: "tilt", action: "Tilt attacks (no run-up)", pad: "Right stick" },
  { id: "steer", action: "Steer summons / aim creature shots", pad: "D-pad" },
  { id: "pause", action: "Pause", pad: "Start" },
];

/** The pad column as "button — action" pairs, for the controller tips block. */
export function padTips() {
  return CONTROL_ROWS.filter((row) => row.id !== "move" && row.id !== "crouch")
    .map((row) => [row.pad, row.action]);
}

/** The markdown table both README.md and docs/game-mechanics.md carry. Written
 *  by tools/check_controls.mjs, which is also what verifies it. */
export function controlsTable() {
  const lines = [
    "| Action | Gamepad |",
    "|---|---|",
    ...CONTROL_ROWS.map((row) => `| ${row.action} | ${row.pad} |`),
  ];
  return lines.join("\n");
}
