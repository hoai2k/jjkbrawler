// ---------------------------------------------------------------------------
// Content configuration — the file to edit for roster grouping and wording.
//
// Nothing here affects game mechanics. Reorder the groups, rename them, move a
// fighter between them, or rewrite any player-facing string, and the game picks
// it up on reload. Fighter stats and kits live in characters.js; this file is
// only about how the roster is organised and what the game says.
// ---------------------------------------------------------------------------

// Fighter-select categories, in the order they appear on screen. Each group's
// `members` are character keys from CHARACTERS in characters.js, shown left to
// right. The select screen sizes itself from this list, so adding a member, a
// whole group, or reordering either needs no other change.
//
// A character key listed here that has no entry in CHARACTERS is ignored with a
// console warning; a playable character missing from every group also warns,
// because it would be unreachable.
export const CHARACTER_GROUPS = [
  {
    key: "students",
    label: "Tokyo Jujutsu Students",
    members: ["yuta", "maki", "megumi", "nobara", "inumaki", "panda"],
  },
  {
    key: "sorcerers",
    label: "Sorcerers",
    members: ["gojo", "nanami", "todo", "momo", "hakari", "toji", "meimei", "uro"],
  },
  {
    key: "curses",
    label: "Curses and Curse Users",
    members: ["sukuna", "mahito", "jogo", "hanami", "geto", "choso"],
  },
];

// The Random tile is not a fighter, so it sits in its own trailing group rather
// than inside a category. Set `show: false` to drop it from the select screen.
export const RANDOM_GROUP = {
  key: "random",
  label: "Wildcard",
  show: true,
};

// Every player-facing string in the game. Values that take an argument are
// written as functions so word order stays translatable.
export const TEXT = {
  // Fighter select
  menu: {
    eyebrow: "Cursed energy platform fighter",
    logoAlt: "JJK Brawler II",
    startReady: "Choose Stage",
    startWaiting: "Waiting for fighters…",
    hintPicking: "Pick a fighter to lock in. B / Backspace un-readies · LB/RB cycles the corner menus.",
    hintReady: "All fighters locked — confirm again (A / Enter) to choose the stage. B / Backspace un-readies.",
  },

  // The four hero cards above the roster
  slot: {
    player: (n) => `Player ${n}`,
    cpu: "CPU",
    empty: "Choose a fighter",
    emptyGlyph: "?",
    randomName: "Random",
    randomGlyph: "?",
    randomBlurb: "Drawn fresh every round",
    unknownUltimate: "???",
    readyBadge: "Ready",
    randomBadge: "Random",
    ultimateLabel: "Ultimate",
    stats: { speed: "Speed", power: "Power", weight: "Weight" },
  },

  loading: {
    eyebrow: "Summoning fighters",
    title: "Loading…",
    failed: (message) => `Asset load failed: ${message}`,
  },

  stages: {
    eyebrow: "Choose arena",
    title: "Stages",
    random: "Random Stage",
    back: "Back",
  },

  moves: {
    kicker: "Controller guide",
    heading: (name, epithet) => `${name} — ${epithet}`,
    prev: "◀ Prev",
    next: "Next ▶",
    back: "Back",
    sectionTitle: "Signature techniques",
    specialNeutral: "B · Special",
    specialSide: "Side + B",
    specialDown: "Down + B",
    ultimate: "LB / RB",
    ultimateNote: "Requires full Cursed Energy.",
    tips: [
      ["Left stick twice", "Dash"],
      ["Down in air", "Fast-fall"],
      ["Shield + direction", "Dodge"],
      ["Tap shield on impact", "Parry"],
    ],
    keyboardHint:
      "Keyboard: P1 uses WASD + J/K/L/I + Left Shift. P2 uses arrows + ,/./&#47;/&#39; + Right Shift.",
  },

  pause: {
    eyebrow: "Match paused",
    title: "Paused",
    resume: "Resume",
    reset: "Reset",
    quit: "Main Menu",
    pauseButton: "Pause",
  },

  roundOver: {
    kicker: "Match complete",
    winner: (name) => `${name} wins!`,
    draw: "Draw",
    rematch: "Rematch",
    fighterSelect: "Fighter Select",
  },

  settings: {
    eyebrow: "Options",
    title: "Settings",
    music: (mode) => `Music: ${mode}`,
    musicVolume: (pct) => `Music Volume: ${pct}%`,
    sfxVolume: (pct) => `Sound FX Volume: ${pct}%`,
    cpu: (level) => `CPU Difficulty: ${level}`,
    stocks: (n) => `Lives per fighter: ${n}`,
    sprites: (set) => `Sprites: ${set}`,
    spriteDefault: "Default",
    spriteAlternate: "Alternate",
    back: "Back",
  },

  hud: {
    ultimateReady: "ULTIMATE READY",
  },

  controllers: {
    vsCpu: "VS CPU",
    joined: (n) => `${n} players joined`,
    waiting: (who) => `${who} — press any button on another controller to join`,
    allJoined: (who) => `${who} — each player has their own fighter cursor; Start continues`,
  },
};
