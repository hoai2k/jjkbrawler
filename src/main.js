import { state } from "./state.js";
import { loadCoreAssets, startBackgroundLoad, ensureMatchAssets, matchAssetsPending } from "./assets.js";
import { initInput, readGamepads, endInputFrame, playerInput, keyPressed, consumeKey, anyPadPausePressed, connectedPadCount, padForPlayer, joinedPlayerCount, occupiedSeats, blankInput, clearHeldKeys, disconnectedSeats, freezePadSeats } from "./input.js";
import { initAudio, playSfx, setBattleStage, syncMusic, stepAudio, stopDomainLoop, stopShieldLoop, setAudioSuspended, setMatchLive } from "./audio.js";
import { updateRumble } from "./rumble.js";
import { makeFighter } from "./fighter.js";
import { stepWorld, makeLatch, advanceWorld, resetFrameClock } from "./sim.js";
import { banner } from "./particles.js";
import { draw } from "./render.js";
import { selectRenderBackend, renderBackendLabel } from "./render_backend.js";
import { enable3dCamera, camera3d } from "./camera_mode.js";
import { getStage, spawnXs, spawnPlatform } from "./stages.js";
import { matchPlan, HUMAN_TEAM } from "./modes.js";
import { oneSideLeft } from "./teams.js";
import { TEXT } from "./config_menus.js";
import { initStageFx } from "./stage_fx.js";
import { RANDOM_KEY, randomCharacterKey } from "./characters.js";
import { makeAiState, aiInput, cpuDamageMul } from "./ai.js";
import { initUi, setPhase, setLoadProgress, updateHud, showRoundOver, showBattleIntro, fadeBattleIntro, hideBattleIntro, leaveTitle, updateMenuButtons, updateSelectionUi, updateControllerStatus, updateMenuNav, syncControllerPlayers, resetReady, setPauseNotice, reportError, resetHudCache } from "./ui.js";
import { WORLD, SUDDEN_DEATH_DAMAGE } from "./constants.js";
import { clamp } from "./utils.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let previousTime = 0;
let introT = 0;
let endT = 0;

// The pre-match schedule, in seconds. One place rather than three numbers in
// two files that have to be kept in step by hand: `introT` counts DOWN from
// the total, so the splash owns the first stretch and each banner fires as the
// countdown crosses its own mark on the way to zero.
//
//   t=0 ..... the VS splash slams in and holds
//   ......... the splash begins its fade (INTRO_FADE)
//   t=SPLASH  the splash is gone and READY… lands on that same frame
//   ......... GO!  (INTRO_GO before the end)
//   t=total   fighters unfreeze
//
// The splash is faded and dropped from HERE rather than timing itself, so the
// two are one clock: `introT` accumulates the fixed step, which stays accurate
// through the frame hitches a match start is full of, where two setTimeouts
// simply do not.
const INTRO_SPLASH = 2.0;    // how long the splash dwells before handing over
const INTRO_READY = 1.6;     // countdown left when it does — READY…'s cue
const INTRO_FADE = INTRO_READY + 0.28;  // its exit fade starts a beat earlier
const INTRO_GO = 0.6;        // …and when GO! takes over from READY…

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(canvas.width / WORLD.w, 0, 0, canvas.height / WORLD.h, 0, 0);
}

function startMatch(stageKey) {
  state.stageKey = stageKey;
  return resetMatch();
}

/** resetMatch is async — it may have to wait on art — and every caller is a
 *  button that cannot do anything useful with the promise. Without this a
 *  throw anywhere inside it became a silent unhandled rejection that left the
 *  game sitting on the loading overlay forever. */
function beginMatch(stageKey) {
  const started = stageKey === undefined ? resetMatch() : startMatch(stageKey);
  return started.catch((err) => reportError("Could not start the match", err));
}

// Which seats a PERSON is playing. A slot the mode added (`plan.cpuFrom` and
// up) is a CPU whatever is plugged in, and so is a seat in the middle of the
// numbering that nobody is sitting in — players 1 and 3 with an empty 2.
function isHumanSlot(id, plan) {
  if (id >= plan.cpuFrom) return false;
  if (state.playerCount === 1) return id === 1;
  if (id > state.playerCount) return false;
  // Past one player the seating is entirely pad-driven (playerCount only ever
  // rises above 1 because a controller joined), so a seat with no pad in it is
  // a seat nobody is sitting in — the hole players 1 and 3 leave at 2 — and it
  // goes to the CPU rather than to a keyboard nobody is at.
  return !!padForPlayer(id);
}

// Turn each slot's selection into the concrete fighter for this match. Random
// slots draw fresh every time, so a player on Random gets a new fighter each
// round. The CPU honours the roll already shown on the select screen, then
// clears it so the next round re-draws.
function resolveRoster(plan) {
  const taken = [];
  for (let id = 1; id <= plan.count; id++) {
    // Slots a match MODE added — the Battle Royal extras, the CPU team — were
    // never picked by anyone and are never shown, so they always draw fresh.
    const picked = id >= plan.cpuFrom ? null : state.selection[id];
    // An unpicked slot (P1 before anyone chooses) draws like Random rather than
    // building a fighter from nothing; readying normally guarantees a pick.
    if (picked && picked !== RANDOM_KEY) {
      state.roster[id] = picked;
      taken.push(picked);
      continue;
    }
    const shown = id === 2 && plan.cpuFrom > 2 && state.playerCount === 1 ? state.cpuRoll : null;
    // A mode's own CPUs steer clear of fighters already in the match, so a
    // Battle Royal is a brawl between four faces rather than four of one.
    state.roster[id] = shown || randomCharacterKey(id >= plan.cpuFrom ? taken : []);
    taken.push(state.roster[id]);
  }
  state.cpuRoll = null;
}

// Bumped by every match start. An await in the middle of resetMatch is a window
// in which the player can back out or start something else, and the stale call
// must not then seize the screen.
let matchToken = 0;

async function resetMatch() {
  const token = ++matchToken;
  // How many fighters, which slots are mode-added CPUs, and who is on whose
  // side — all of it from the match mode chosen on the select screen.
  const plan = matchPlan();
  const entrantCount = plan.count;
  // Resolved BEFORE the assets are gathered, because a Random slot only becomes
  // a concrete fighter here — and it re-rolls every rematch, so this is the
  // first point at which the match knows what art it needs.
  resolveRoster(plan);
  const entrants = Array.from({ length: entrantCount }, (_, i) => state.roster[i + 1]);

  // The VS splash goes up FIRST, before any of this match's art is fetched.
  // What it draws — the painted hero cards — is core art that is always in
  // memory, so there was never a reason to make the player watch a loading
  // screen and only then get the VS screen. Anything still streaming shows as
  // a bar along the bottom of the splash instead of replacing it.
  const pending = matchAssetsPending(entrants, state.stageKey);
  showBattleIntro(
    Array.from({ length: entrantCount }, (_, i) => ({
      id: i + 1,
      key: state.roster[i + 1],
      cpu: !isHumanSlot(i + 1, plan),
    })),
    { loading: pending },
  );
  if (pending) {
    await ensureMatchAssets(entrants, state.stageKey, setLoadProgress);
    // Superseded while we waited — something else has taken the screen, and it
    // took the splash down with it (setPhase).
    if (token !== matchToken) return;
  }

  const stage = getStage(state.stageKey);
  // Pick this match's battle track before the phase flips to "playing".
  setBattleStage(stage.key);
  state.platforms = stage.platforms.map((p) => ({ ...p }));

  // A spawn stands on the STARTING TIER — the `spawn: true` platform, which is
  // the height every board's ground used to be at (stages.js). Below it is a
  // whole storey of board that a match should not open in the middle of, so the
  // tier wins outright wherever it is underfoot; anywhere else the rule is the
  // old one, the lowest surface under that x, which is what puts Bridge Duel's
  // outer slots on its side platforms Battlefield-style. An x with nothing
  // under it at all is pulled onto the tier rather than dropped into the void.
  const tier = spawnPlatform(state.platforms);
  const spawnSpot = (x) => {
    const under = state.platforms.filter((p) => x >= p.x + 12 && x <= p.x + p.w - 12);
    const onTier = under.filter((p) => p.kind === "spawn");
    const pick = onTier.length ? onTier : under;
    if (pick.length) return { x, y: Math.max(...pick.map((p) => p.y)) };
    return { x: clamp(x, tier.x + 50, tier.x + tier.w - 50), y: tier.y };
  };

  const spawns = spawnXs(entrantCount, tier);
  state.fighters = Array.from({ length: entrantCount }, (_, i) => {
    const id = i + 1;
    const spot = spawnSpot(spawns[i]);
    const fighter = makeFighter(id, state.roster[id], spot.x, spot.x < WORLD.w / 2 ? 1 : -1);
    fighter.y = spot.y;
    fighter.grounded = true;
    // Free-for-all gives every fighter a side of their own, so "teammate" only
    // means something in the modes that actually have teams.
    fighter.team = plan.teamOf(id);
    return fighter;
  });
  // Any entrant without a human control source is driven by the CPU.
  // Slots 1 and 2 always have keyboard maps; slots 3+ are gamepad-only, so
  // they fall back to AI unless a pad is connected for them. This keeps 3/4
  // player modes playable (and testable) instead of seating motionless dummies.
  for (const fighter of state.fighters) {
    if (isHumanSlot(fighter.id, plan)) continue;
    fighter.aiState = makeAiState();
    fighter.cpuDamageMul = cpuDamageMul(state.cpuLevel);
  }

  state.hitboxes.length = 0;
  state.projectiles.length = 0;
  state.entities.length = 0;
  state.particles.length = 0;
  state.popups.length = 0;
  state.banners.length = 0;
  state.domainOverlay = null;
  state.domain = null;
  state.domainCasting = null;
  // A domain open when the match ended never runs its own close path — the
  // entity is dropped here, not expired — so its held sound is stopped by the
  // reset that dropped it. Without this a rematch starts inside the last
  // match's domain ambience, forever.
  stopDomainLoop();
  state.screenFlash = null;
  state.slowMo = 0;
  state.matchTime = 0;
  state.timeLeft = state.timeLimit;
  state.suddenDeath = false;
  state.endReason = "ko";
  pendingResult = null;
  setPauseNotice(null);
  resetHudCache();
  state.camera.x = 640; state.camera.y = 360; state.camera.zoom = 1; state.camera.shake = 0; state.camera.kick = 0;
  state.camera.aimX = null; state.camera.aimY = null; state.camera.aimZoom = null;
  state.camera.highT = 0;
  camera3d?.resetRig();

  // Stage identity (Active Boards): field modifiers + the gimmick entity.
  // After the arrays are cleared, so the fx entity survives the reset.
  initStageFx();

  // The countdown budget: the splash's dwell plus the READY…GO! that follows
  // it (see the schedule at the top of this file).
  introT = INTRO_SPLASH + INTRO_READY;
  endT = 0;
  // Music, and the screens that can be opened from inside a fight, both key off
  // this: while it is set, Settings and the move list hold the battle track
  // where it is instead of cutting to the menu one (audio.js).
  setMatchLive(true);
  // The seats belong to this match now: a pad that drops out keeps its fighter
  // instead of the remaining pads shuffling up under the players holding them.
  freezePadSeats(true);
  playSfx("uiStart");
  // The splash is already up (above); this only hands the screen under it to
  // the match, and starts the countdown that will fade it.
  setPhase("playing");
}

function quitToMenu() {
  setMatchLive(false);
  // Back on the menu the seating follows whatever is actually plugged in again.
  freezePadSeats(false);
  setPauseNotice(null);
  resetReady();
  setPhase("menu");
  updateSelectionUi();
  updateMenuButtons();
}

function togglePause() {
  if (state.phase === "playing") {
    // A held shield voices a loop that is only ever stopped by the fighter
    // update — which stops running the moment the phase leaves "playing", so
    // pausing mid-block left it humming under the overlay forever.
    stopShieldLoop();
    playSfx("uiPause");
    setPhase("paused");
  } else if (state.phase === "paused") {
    handOffDeadSeats();
    playSfx("uiPause");
    setPhase("playing");
  }
}

// ------------------------------------------------- controllers going missing
//
// Seats are sticky, so a pad that stops answering does not hand its fighter
// back to anybody: slots 1 and 2 fall through to the keyboard, but slots 3 and
// 4 have no other input source and simply stop moving. A motionless fighter
// standing in the middle of a live match reads as the game having broken, so
// the match stops and says what happened instead.

/** Human seats whose pad is currently missing. A seat above `playerCount` was
 *  never in this match, and a fighter already driven by the CPU has nothing to
 *  lose. */
function missingSeats() {
  return disconnectedSeats(state.playerCount).filter((seat) => {
    const f = state.fighters[seat - 1];
    return f && !f.aiState && !f.dead;
  });
}

function checkControllers() {
  const missing = missingSeats();
  if (!missing.length) return;
  stopShieldLoop();
  setPauseNotice(missing);
  setPhase("paused");
}

/** Resuming with a pad still missing gives that fighter to the CPU rather than
 *  leaving a dummy on the stage. Reconnecting first keeps the seat, because
 *  this only ever looks at who is still missing at the moment of resuming. */
function handOffDeadSeats() {
  for (const seat of missingSeats()) {
    const f = state.fighters[seat - 1];
    f.aiState = makeAiState();
    f.cpuDamageMul = cpuDamageMul(state.cpuLevel);
  }
  setPauseNotice(null);
}

// ------------------------------------------------------------- match result
//
// How the match ended, resolved once rather than re-derived on the result
// screen. A KO ending has a last fighter standing to point at; a time-out has
// a leader on the clock, who may still be sharing the stage with the fighter
// they beat, so the winner has to be carried rather than looked up.
let pendingResult = null;

/** Alive fighters grouped into sides, best first: most stocks, then least
 *  damage. A free-for-all has one fighter per side, so the same comparison
 *  decides both shapes. */
function standings() {
  const sides = new Map();
  for (const f of state.fighters) {
    if (f.dead) continue;
    const key = f.team ?? `solo:${f.id}`;
    const side = sides.get(key) || { key, stocks: 0, damage: 0, members: [] };
    side.stocks += f.stocks;
    side.damage += f.damage;
    side.members.push(f);
    sides.set(key, side);
  }
  return [...sides.values()].sort((a, b) => b.stocks - a.stocks || a.damage - b.damage);
}

function endMatch(reason, winner = null) {
  state.endReason = reason;
  pendingResult = { winner };
  endT = 1.4;
  banner(reason === "time" ? "TIME!" : "GAME!", "#ffffff", { y: 280, size: 80, life: 1.3 });
  playSfx("matchEnd");
  state.slowMo = Math.max(state.slowMo, 0.6);
}

function finishMatch() {
  const winner = pendingResult?.winner ?? state.fighters.find((f) => !f.dead);
  // A team match is won by a side, not by whoever happened to survive, so
  // the result screen is told which side that was.
  const side = !winner || !matchPlan().teams ? null
    : winner.team === HUMAN_TEAM ? TEXT.roundOver.players
    : TEXT.roundOver.cpus;
  pendingResult = null;
  setMatchLive(false);
  showRoundOver({ winner, side, reason: state.endReason });
}

/** The clock ran out. The side ahead on stocks — then on damage — takes it;
 *  a dead heat plays it off instead of being called a draw. */
function resolveTimeUp() {
  const sides = standings();
  if (!sides.length) { endMatch("time"); return; }
  const best = sides[0];
  const tied = sides.filter((s) => s.stocks === best.stocks && s.damage === best.damage);
  if (tied.length <= 1) { endMatch("time", best.members[0]); return; }
  startSuddenDeath(tied);
}

/** One stock each at heavy damage, no clock: the next clean hit ends it. */
function startSuddenDeath(tiedSides) {
  const survivors = new Set(tiedSides.flatMap((s) => s.members));
  for (const f of state.fighters) {
    if (!survivors.has(f)) { f.stocks = 0; f.dead = true; continue; }
    f.stocks = 1;
    f.damage = SUDDEN_DEATH_DAMAGE;
  }
  state.suddenDeath = true;
  state.endReason = "suddenDeath";
  state.timeLeft = 0;
  banner("SUDDEN DEATH", "#ff8a8a", { y: 260, size: 64, life: 1.6 });
  playSfx("matchEnd");
}

function updateSimulation(dt, held) {
  state.matchTime += dt;
  // Mirrored onto state for consumers outside this module — the 2.5D camera
  // rig keys its intro pull-out and final-blow shot off these. Nothing in the
  // simulation reads them back.
  state.introT = introT;
  state.endT = endT;

  if (introT > 0) {
    const before = introT;
    introT -= dt;
    // The splash's exit, driven by this countdown rather than by its own
    // timers: it starts fading here…
    if (before > INTRO_FADE && introT <= INTRO_FADE) fadeBattleIntro();
    // …and is gone on the very frame READY… lands, which is what makes the
    // hand-over read as one move instead of two things that nearly agree.
    if (before > INTRO_READY && introT <= INTRO_READY) {
      hideBattleIntro();
      banner("READY…", "#e8ecf8", { y: 300, size: 60, life: INTRO_READY - INTRO_GO });
      playSfx("countdownReady");
    }
    if (before > INTRO_GO && introT <= INTRO_GO) {
      banner("GO!", "#ffd35a", { y: 300, size: 72, life: INTRO_GO });
      playSfx("countdownGo");
    }
  }

  // The world itself — fighters, hitboxes, projectiles, summons, screen
  // effects — is `sim.js stepWorld`, shared with the character bench so the two
  // cannot drift. Everything left in this function is the MATCH: the countdown
  // above, the clock and the KO below.
  //
  // Who is acting on what is decided here, because it is the only part that
  // differs between a match and a bench: the CPU drives an AI seat, a latched
  // pad drives a human one, and a fighter who is dizzy or watching the round
  // end drives nothing.
  stepWorld(dt, (f) => {
    if (introT > 0) return blankInput();
    if (f.dizzy > 0 || endT > 0) return blankInput();
    return f.aiState ? aiInput(f) : (held[f.id] || blankInput());
  });

  // round end
  if (endT > 0) {
    endT -= dt;
    if (endT <= 0) finishMatch();
    return;
  }
  const alive = state.fighters.filter((f) => !f.dead);
  if (oneSideLeft(alive)) {
    endMatch(state.suddenDeath ? "suddenDeath" : "ko");
    return;
  }

  // The clock. Only runs once the countdown is over and only while the match
  // can still be decided by it — sudden death has already stopped it.
  if (state.timeLimit > 0 && !state.suddenDeath && introT <= 0) {
    const before = state.timeLeft;
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    // The last ten seconds get counted out loud, once each.
    if (before > 10 && state.timeLeft <= 10) playSfx("countdownReady");
    if (state.timeLeft <= 0) resolveTimeUp();
  }
}

let lastFrameAt = 0;
// The last time a REAL rAF callback ran, which is the only evidence that the
// browser is still driving frames. Kept apart from `lastFrameAt` because the
// watchdog below writes that one too, so a watchdog tick used to look exactly
// like a delivered frame.
let lastRafAt = 0;
let rafPending = false;

// The latch lives in sim.js with the frame that consumes it — see the note
// there for why an edge has to survive a stepless frame.
const latched = makeLatch();

function rafLoop(time) {
  rafPending = false;
  lastRafAt = performance.now();
  loop(time);
}

function loop(time) {
  lastFrameAt = performance.now();
  // Clamped at BOTH ends. The ceiling covers a stall; the floor covers the fact
  // that this loop has two callers whose clocks do not agree — the watchdog
  // below passes `performance.now()`, while rAF passes the vsync timestamp for
  // the START of the frame, which is a few ms EARLIER than the moment its
  // callback runs. A watchdog tick immediately followed by a real frame
  // therefore produced a negative dt, which ran the whole frame backwards:
  // shrinking ring particles past zero radius until drawParticles() threw an
  // IndexSizeError and took the rest of that frame's rendering with it.
  const dt = Math.max(0, Math.min((time - previousTime) / 1000, 1 / 30));
  previousTime = Math.max(previousTime, time);

  readGamepads();
  updateRumble(dt);
  stepAudio(dt);

  if (anyPadPausePressed()) {
    // PRESS START, literally: the pad's Start button leaves the title splash
    // and takes the game fullscreen (leaveTitle tolerates a browser that
    // refuses the fullscreen request outside a real user gesture).
    if (state.phase === "title") leaveTitle({ fullscreen: true });
    else if (["playing", "paused"].includes(state.phase)) togglePause();
    else if (state.phase === "menu") document.getElementById("startButton").click();
    else if (state.phase === "stageSelect") document.getElementById("randomStageButton").click();
    else if (state.phase === "roundOver") document.getElementById("rematchButton").click();
  }
  if (keyPressed("Space") || keyPressed("Escape")) {
    if (["playing", "paused"].includes(state.phase)) togglePause();
    consumeKey("Space");
    consumeKey("Escape");
  }
  if (keyPressed("Backquote")) {
    state.debugHitboxes = !state.debugHitboxes;
    consumeKey("Backquote");
  }

  const padCount = connectedPadCount();
  syncControllerPlayers(joinedPlayerCount(), occupiedSeats());
  updateControllerStatus(padCount);

  if (!["playing", "loading"].includes(state.phase)) {
    updateMenuNav(dt);
  }

  if (state.phase === "playing") {
    checkControllers();
  }

  if (state.phase === "playing") {
    // The latch, the fixed-step clock, the slow-motion scale, the particles and
    // the camera are all `sim.js advanceWorld` — shared with the character
    // bench, so a second caller cannot assemble a frame that is missing one of
    // them. What stays here is the MATCH: this passes it in as the step.
    advanceWorld(dt, { latch: latched, step: (d) => updateSimulation(d, latched) });
    updateHud();
  }

  if (["playing", "paused", "roundOver"].includes(state.phase)) {
    draw(ctx);
  }

  endInputFrame();
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(rafLoop);
  }
}

// --------------------------------------------------------- page-level guards
//
// Everything about being a tab rather than an application: losing focus,
// leaving mid-fight, and failing in a way nobody would otherwise see.
function initPageGuards() {
  // A hidden tab stops entirely. Both halves matter: pausing keeps the match
  // where the player left it, and suspending the audio stops the game being
  // the tab making noise in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearHeldKeys();
      if (state.phase === "playing") {
        stopShieldLoop();
        setPhase("paused");
      }
      setAudioSuspended(true);
    } else {
      setAudioSuspended(false);
      // The frame clock has to be re-based: `previousTime` is from before the
      // tab went away, and the gap would otherwise arrive as one enormous dt.
      previousTime = performance.now();
      lastFrameAt = previousTime;
      lastRafAt = previousTime;
      resetFrameClock();
    }
  });

  // Closing the tab mid-match throws the match away, and there is nowhere to
  // save it to. The browser decides whether to show this at all.
  window.addEventListener("beforeunload", (e) => {
    if (!["playing", "paused"].includes(state.phase)) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // Anything that throws outside a tool call would otherwise be invisible:
  // the canvas simply stops updating and the player is looking at a frozen
  // frame with no idea whether the game or their machine gave up.
  window.addEventListener("error", (e) => reportError("Something went wrong", e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("Something went wrong", e.reason));

  // The canvas is a game, not a document: a right-click during a fight should
  // not raise the browser's menu over it. The roster keeps its own handler,
  // where right-click is a real binding.
  document.querySelector(".arena-wrap")?.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".char-card")) return;
    e.preventDefault();
  });
}

async function init() {
  // Which renderer draws the characters, before anything asks for a pose.
  // `?render=<name>` picks one; an unknown name warns and falls back, so a
  // typo starts the game rather than blanking it.
  const chosen = selectRenderBackend(new URLSearchParams(location.search).get("render"));
  if (chosen !== "sprite") console.log(`render backend: ${chosen} (${renderBackendLabel()})`);

  // The 2.5D perspective camera (docs/2.5d-camera-plan.md) is what the game
  // ships with: it carries the intro pull-out, the ultimate dolly and the
  // final-blow shot, and those are the game's presentation rather than an
  // option. `?camera=flat` opts back into the original flat framing.
  //
  // Still lazy-imported and still guarded twice, because the flat renderer is
  // now the FALLBACK rather than the default: a failed fetch or a machine with
  // no WebGL lands there with a console note, never on a broken screen.
  if (new URLSearchParams(location.search).get("camera") !== "flat") {
    try {
      const mod = await import("./camera3d/index.js");
      if (mod.initRender3d()) {
        enable3dCamera(mod);
      } else {
        console.warn("WebGL is unavailable — running the flat camera.");
      }
    } catch (err) {
      console.warn(`the 2.5D camera failed to load (${err.message}) — running flat.`);
    }
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  initInput();
  initAudio();
  initUi({ startMatch: beginMatch, resetMatch: beginMatch, quitToMenu, togglePause });
  initPageGuards();
  setPhase("loading");
  try {
    await loadCoreAssets();
  } catch (err) {
    document.getElementById("loadStatus").textContent = TEXT.loading.failed(err.message);
    return;
  }
  // The game opens on its title splash rather than dropping the player
  // straight into fighter select; pressing start there is what reaches the
  // menu (leaveTitle in ui.js).
  setPhase("title");
  // The roster is ~450 MB of sprite art and a match uses at most four fighters,
  // so it streams in behind the menu instead of in front of it. Choosing a
  // fighter pulls them to the front of that queue (see ui.js), and startMatch
  // waits on whatever is still missing.
  startBackgroundLoad();
  previousTime = performance.now();
  lastFrameAt = previousTime;
  lastRafAt = previousTime;
  rafPending = true;
  requestAnimationFrame(rafLoop);
  // rAF can be throttled or suspended (embedded webviews, a window dragged
  // between displays); a watchdog keeps the simulation running whenever frames
  // stop arriving while the page is actually being looked at.
  //
  // Explicitly NOT while the tab is hidden. rAF stopping is the browser saying
  // "nobody is watching", and driving the loop through it anyway ran the match
  // on in ~30x slow motion behind the player's back — they came back to a
  // stock they never saw lost. A hidden tab is handled by pausing instead
  // (see the visibilitychange listener above).
  //
  // It watches for rAF STOPPING, not for rAF being slow, and the difference
  // is the whole thing. It used to poll every 12 ms and fire a whole extra
  // frame — simulation, HUD and a full draw — whenever 28 ms had passed since
  // the last one. 28 ms is 36 fps: any machine merely having a hard time
  // crossed it constantly, and every crossing bought it a SECOND frame's work
  // to do, which made the next frame later still. A four-fighter match on the
  // 2.5D camera measured 143 loop() calls for 74 delivered frames — half the
  // frame budget spent rendering pictures the browser had not asked for and
  // was never going to show. The heavier the machine's load, the harder this
  // pushed, which is exactly backwards.
  //
  // So: poll slowly, and only step in when rAF has genuinely stopped. A quarter
  // of a second with no callback is not a slow machine, it is a suspended one
  // (an embedded webview, a window dragged between displays) — the case this
  // was written for, and the only case it now answers.
  setInterval(() => {
    if (document.hidden) return;
    if (performance.now() - lastRafAt > 250) loop(performance.now());
  }, 100);
}

init();
