// Central mutable game state shared by every module.
import { DEFAULT_TIME_LIMIT } from "./constants.js";
import { DEBUG_HITBOXES } from "./flags.js";

export const state = {
  phase: "loading", // loading | title | menu | stageSelect | moves | playing | paused | roundOver | settings
  prevPhase: "menu",
  mode: "cpu",      // cpu | local
  playerCount: 1,   // human players; 1 means P1 versus CPU
  cpuLevel: 1,      // 0 easy, 1 normal, 2 hard
  // Chosen from the VS badge on the select screen (src/modes.js):
  // versus (free-for-all) | playersVsCpus (teams) | royal1 | royal2 (extra CPUs).
  matchMode: "versus",
  stocks: 3,
  // "Time limit" (Settings), in seconds; 0 is no limit. See TIME_OPTIONS.
  timeLimit: DEFAULT_TIME_LIMIT,
  // "Sound Effects" (Settings): the whole SFX bus. Off silences every one-shot
  // and the shield loop; music is a separate setting.
  sfxEnabled: true,
  // "Active Boards" (Settings): stage gimmicks — hazards, moving platforms,
  // surface/gravity modifiers (src/stage_fx.js). Off = every stage reverts to
  // its static v1 layout.
  activeBoards: true,
  // "Strike Arcs" (Settings): how richly the swing crescents are drawn. Both
  // settings say the same things — reach, sweetspot, launch angle — so this is
  // a cost dial, not a fidelity one. "simple" is the one to reach for on a
  // machine that struggles with four fighters swinging at once, because the
  // arcs are the part of the renderer whose cost climbs with that.
  arcDetail: "full",   // "full" | "simple"
  // What each slot picked on the select screen. May be RANDOM_KEY, which
  // resolves to a different fighter every match. The CPU defaults to random.
  // P1 starts empty on purpose: the player picks their own fighter rather than
  // inheriting one. The other slots keep defaults so a 1P game is one click.
  // Eight seats: the engine tops out at eight fighters, and every one of them
  // can now be a person (src/input.js MAX_SEATS).
  selection: { 1: null, 2: "__random", 3: "megumi", 4: "nobara", 5: "todo", 6: "toji", 7: "nanami", 8: "maki" },
  // Concrete fighter each slot is actually using this match, after RANDOM_KEY
  // has been resolved. This is what fighters are built from.
  roster: { 1: "gojo", 2: "sukuna", 3: "megumi", 4: "nobara", 5: "todo", 6: "toji", 7: "nanami", 8: "maki" },
  // The CPU's random draw, rolled the moment the humans lock in so the select
  // screen can show who they are about to face. Cleared once a match consumes
  // it, so every rematch faces a fresh opponent.
  cpuRoll: null,
  // Per-player lock-in on the fighter select screen. A player who is ready has
  // committed a fighter; the match can start once every human slot is ready.
  ready: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false },
  // Which human seats have a controller in them right now (src/input.js). The
  // numbering has holes on purpose: player 2 unplugging leaves players 1 and 3
  // where they are, and the next pad to join takes the empty seat 2 back.
  seats: [1],
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

  // aimX/aimY/aimZoom are the deadzoned framing target the pan eases toward —
  // camera.js owns them; nothing else should write them.
  // highT is the high-play envelope (camera.js): how much of the recent fight
  // has been above the main platform, 0..1, which carries the framing up so the
  // ground stays low while play stays high.
  camera: { x: 640, y: 360, zoom: 1, shake: 0, kick: 0, aimX: null, aimY: null, aimZoom: null, highT: 0 },
  slowMo: 0,
  screenFlash: null, // {color, life, maxLife}
  vignette: null,    // {color, alpha, life, maxLife} — Black Flash's dark beat
  domainOverlay: null, // {color, life, maxLife, ownerId, label}
  domain: null,        // the live Domain Expansion entity, or null (domains.js)
  // The fighter part-way through a Domain Expansion call-out, or null. The
  // barrier does not exist yet during that window, so this is what stops a
  // second domain starting inside the first one's sentence.
  domainCasting: null,

  matchTime: 0,
  // Seconds left on the match clock, counted down while the fight is live.
  // Meaningless when `timeLimit` is 0 — nothing reads it in that case.
  timeLeft: 0,
  // Set once the clock has run out on a tie and the play-off is running: the
  // clock stops, and the result screen says how the match was decided.
  suddenDeath: false,
  // How the match ended, for the result screen: "ko" | "time" | "suddenDeath".
  endReason: "ko",
  // The hitbox overlay (render.js drawDebug), toggled live on backquote and
  // started on by `?debug=hitbox` (flags.js).
  debugHitboxes: DEBUG_HITBOXES,
  // Ad-hoc hit-test shapes registered by special/ultimate scripts while the
  // overlay is on (combat.js debugShape); drawn and decayed by drawDebug.
  debugShapes: [],
  // The last judged contact (src/contact.js): where it landed, how clean it
  // was and when. Written by applyHit, read by the hitbox overlay and by
  // nothing else — a hit's quality is otherwise only visible as the size of
  // its own spark, which is exactly the thing that has to be checked against a
  // number while the tier is being judged.
  lastContact: null,
  // Mirrors of main.js's round countdown / round end timers, written each sim
  // step. Read-only for everyone else; the 2.5D camera rig keys its intro
  // pull-out and final-blow framing off them.
  introT: 0,
  endT: 0,

  // Fraction of the arena's height the stats HUD covers along the TOP edge,
  // measured from the live DOM by ui.js (the panels are absolutely positioned
  // CSS chrome, so how much of the picture they eat depends on the window and
  // on how many seats the match has). The camera frames the fight into what is
  // left rather than into the whole canvas — see camera.js.
  hudBand: 0,

  // Stage-wide physics modifiers, set per match by initStageFx (stage_fx.js).
  // gravityMul scales GRAVITY; frictionPow < 1 makes ground slick (the
  // per-character friction base is raised to this power).
  stageMods: { gravityMul: 1, frictionPow: 1 },
  // Telegraphed danger areas ({x, w, until, yMin?, yMax?}) advertised by stage
  // hazards so the CPU can step out of them (ai.js).
  hazardZones: [],
};
