// Central mutable game state shared by every module.
export const state = {
  phase: "loading", // loading | menu | stageSelect | moves | playing | paused | roundOver | settings
  prevPhase: "menu",
  mode: "cpu",      // cpu | local
  playerCount: 1,   // human players; 1 means P1 versus CPU
  cpuLevel: 1,      // 0 easy, 1 normal, 2 hard
  stocks: 3,
  // "default" | "alternate" — opts into a character's second art set where one
  // exists (currently Hanami's round-6 redesign). See assets.js.
  spriteSet: "default",
  // What each slot picked on the select screen. May be RANDOM_KEY, which
  // resolves to a different fighter every match. The CPU defaults to random.
  // P1 starts empty on purpose: the player picks their own fighter rather than
  // inheriting one. The other slots keep defaults so a 1P game is one click.
  selection: { 1: null, 2: "__random", 3: "megumi", 4: "nobara" },
  // Concrete fighter each slot is actually using this match, after RANDOM_KEY
  // has been resolved. This is what fighters are built from.
  roster: { 1: "gojo", 2: "sukuna", 3: "megumi", 4: "nobara" },
  // The CPU's random draw, rolled the moment the humans lock in so the select
  // screen can show who they are about to face. Cleared once a match consumes
  // it, so every rematch faces a fresh opponent.
  cpuRoll: null,
  // Per-player lock-in on the fighter select screen. A player who is ready has
  // committed a fighter; the match can start once every human slot is ready.
  ready: { 1: false, 2: false, 3: false, 4: false },
  activePicker: 1,
  stageKey: "trainingBridge",

  fighters: [],
  platforms: [],
  hitboxes: [],
  projectiles: [],
  entities: [],   // scripted ultimate/special objects with update/draw
  particles: [],
  popups: [],
  banners: [],

  camera: { x: 640, y: 360, zoom: 1, shake: 0, kick: 0 },
  slowMo: 0,
  screenFlash: null, // {color, life, maxLife}
  domainOverlay: null, // {color, life, maxLife, ownerId, label}

  matchTime: 0,
  debugHitboxes: false,
};
