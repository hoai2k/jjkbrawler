// Central mutable game state shared by every module.
export const state = {
  phase: "loading", // loading | menu | stageSelect | moves | playing | paused | roundOver | settings
  prevPhase: "menu",
  mode: "cpu",      // cpu | local
  playerCount: 1,   // human players; 1 means P1 versus CPU
  cpuLevel: 1,      // 0 easy, 1 normal, 2 hard
  stocks: 3,
  selection: { 1: "gojo", 2: "sukuna", 3: "megumi", 4: "nobara" },
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
