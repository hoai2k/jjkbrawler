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

/** Every code bound to `action` for a player, written out: "J", "/ or Numpad 3". */
export function keysFor(playerId, action, join = " or ") {
  const codes = KEY_BINDS[playerId]?.[action];
  if (!codes || !codes.length) return "—";
  return codes.map(keyLabel).join(join);
}

/** Just the first code bound to an action. The in-game line lists ten actions
 *  across one row, so it names the primary key and lets the tables carry the
 *  alternates. */
function keyFor(playerId, action) {
  const codes = KEY_BINDS[playerId]?.[action];
  return codes?.length ? keyLabel(codes[0]) : "—";
}

function pair(playerId, a, b) {
  return `${keysFor(playerId, a)} / ${keysFor(playerId, b)}`;
}

function steerKeys(playerId) {
  return ["steerUp", "steerLeft", "steerDown", "steerRight"]
    .map((a) => keysFor(playerId, a)).join(" / ");
}

// The control scheme as rows, in the order the tables print them. `pad` is the
// only hand-written column — a pad button has no code to derive a name from —
// and it is written against PAD_BUTTONS above, which is what the game reads.
//
// `short` is the compact wording the in-game keyboard line uses; a row with no
// `short` is left off that line (it has no keyboard binding worth listing).
export const CONTROL_ROWS = [
  { id: "move", action: "Move", short: "move", keys: (p) => pair(p, "left", "right"), keysShort: (p) => (p === 1 ? "WASD" : "Arrows"), pad: "Left stick" },
  { id: "jump", action: "Jump", keys: (p) => keysFor(p, "up"), pad: "A" },
  { id: "crouch", action: "Crouch / fast-fall", keys: (p) => keysFor(p, "down"), pad: "Left stick ▼" },
  { id: "light", action: "Light attack", short: "light", keys: (p) => keysFor(p, "light"), keysShort: (p) => keyFor(p, "light"), pad: "X" },
  { id: "heavy", action: "Heavy attack (hold = charge)", short: "heavy", keys: (p) => keysFor(p, "heavy"), keysShort: (p) => keyFor(p, "heavy"), pad: "Y" },
  { id: "special", action: "Special", short: "special", keys: (p) => keysFor(p, "special"), keysShort: (p) => keyFor(p, "special"), pad: "RT" },
  { id: "dash", action: "Dash", short: "dash", keys: (p) => `${keysFor(p, "dash")}, or double-tap a direction`, keysShort: (p) => keysFor(p, "dash"), pad: "B, or double-tap" },
  { id: "ult", action: "Ultimate", short: "ultimate", keys: (p) => keysFor(p, "ult"), keysShort: (p) => keyFor(p, "ult"), pad: "RB" },
  { id: "domain", action: "Domain Expansion", short: "domain", keys: (p) => keysFor(p, "domain"), keysShort: (p) => keyFor(p, "domain"), pad: "LB" },
  { id: "shield", action: "Shield / dodges", short: "shield", keys: (p) => keysFor(p, "shield"), keysShort: (p) => keyFor(p, "shield"), pad: "LT" },
  { id: "tilt", action: "Tilt attacks (no run-up)", keys: () => "—", pad: "Right stick" },
  { id: "steer", action: "Steer summons / aim creature shots", short: "steer summons", keys: steerKeys, keysShort: steerKeys, pad: "D-pad" },
  { id: "pause", action: "Pause", keys: (p) => (p === 1 ? "Space / Esc" : "—"), pad: "Start" },
];

/** One line of keyboard instructions for a player, for the move screen. */
export function keyboardLine(playerId) {
  return CONTROL_ROWS
    .filter((row) => row.short && KEY_BINDS[playerId])
    .map((row) => `${(row.keysShort || row.keys)(playerId)} ${row.short}`)
    .join(" · ");
}

/** The pad column as "button — action" pairs, for the controller tips block. */
export function padTips() {
  return CONTROL_ROWS.filter((row) => row.id !== "move" && row.id !== "crouch")
    .map((row) => [row.pad, row.action]);
}

/** The markdown table both README.md and docs/game-mechanics.md carry. Written
 *  by tools/check_controls.mjs, which is also what verifies it. */
export function controlsTable() {
  const lines = [
    "| Action | P1 | P2 | Gamepad |",
    "|---|---|---|---|",
    ...CONTROL_ROWS.map((row) => `| ${row.action} | ${row.keys(1)} | ${row.keys(2)} | ${row.pad} |`),
  ];
  return lines.join("\n");
}
