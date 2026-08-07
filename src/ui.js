import { state } from "./state.js";
import { CHARACTER_KEYS, CHARACTERS, RANDOM_KEY, randomCharacterKey } from "./characters.js";
import { STAGES } from "./stages.js";
import { audioSettings, cycleMusicMode, MUSIC_MODES, syncMusic, playSfx } from "./audio.js";
import { cpuLevelName } from "./ai.js";
import { METER_MAX } from "./constants.js";
import { clamp } from "./utils.js";
import { padsMenuState, padsMenuStates } from "./input.js";
import { setSpriteSet } from "./assets.js";
import { CHARACTER_GROUPS, RANDOM_GROUP, TEXT } from "./config.js";

const $ = (id) => document.getElementById(id);

export const els = {};
let callbacks = {};
let movesIndex = 0;
let movesReturnPhase = "menu";
let settingsReturnPhase = "menu";

const STOCK_OPTIONS = [1, 2, 3, 5];
const PLAYER_IDS = [1, 2, 3, 4];
const pickerCursor = { 1: null, 2: null, 3: null, 4: null };
const pickerRepeat = PLAYER_IDS.map(() => ({ dir: null, t: 0 }));

export function initUi(cb) {
  callbacks = cb;
  for (const id of [
    "hud", "utilityActions", "menuOverlay", "stageOverlay", "movesOverlay", "roundOverlay", "pauseOverlay",
    "settingsOverlay", "loadOverlay", "loadStatus", "loadBar", "loadBarFill", "characterGrid", "stageGrid",
    "p1PickCard", "p2PickCard", "p3PickCard", "p4PickCard",
    "p1PickImage", "p2PickImage", "p3PickImage", "p4PickImage",
    "p1PickName", "p2PickName", "p3PickName", "p4PickName",
    "p1PickLabel", "p2PickLabel", "p3PickLabel", "p4PickLabel",
    "p1PickInfo", "p2PickInfo", "p3PickInfo", "p4PickInfo",
    "p1PickReady", "p2PickReady", "p3PickReady", "p4PickReady",
    "p1PickRandomArt", "p2PickRandomArt", "p3PickRandomArt", "p4PickRandomArt",
    "startButton", "movesButton", "settingsButton", "fullscreenButton", "controllerStatus", "menuHint",
    "p1Panel", "p2Panel", "p3Panel", "p4Panel",
    "p1Name", "p2Name", "p3Name", "p4Name",
    "p1Damage", "p2Damage", "p3Damage", "p4Damage",
    "p1Stocks", "p2Stocks", "p3Stocks", "p4Stocks",
    "p1Meter", "p2Meter", "p3Meter", "p4Meter",
    "p1MeterLabel", "p2MeterLabel", "p3MeterLabel", "p4MeterLabel",
    "p1Portrait", "p2Portrait", "p3Portrait", "p4Portrait", "pauseButton",
    "movesPanel", "movesTitle", "movesKicker", "movesPrevButton", "movesNextButton", "movesBackButton",
    "randomStageButton", "stageBackButton", "roundKicker", "winnerText", "rematchButton", "menuButton",
    "resumeButton", "pauseResetButton", "pauseMenuButton",
    "settingsMusicButton", "settingsCpuButton", "settingsStocksButton", "settingsSpritesButton", "musicVolumeRange", "musicVolumeLabel",
    "sfxVolumeRange", "sfxVolumeLabel", "settingsBackButton",
  ]) {
    els[id] = $(id);
  }

  applyStaticText();
  buildCharacterGrid();
  buildStageGrid();
  bindMenuButtons();
  bindMenuKeyboardNav();
  updateSelectionUi();
  updateMenuButtons();
  window.addEventListener("resize", layoutCharacterGrid);
}

// Screens whose wording never changes at runtime still comes from config.js, so
// every player-facing string lives in one file. Anything dynamic is written by
// the render functions below.
function applyStaticText() {
  const set = (el, text) => { if (el) el.textContent = text; };
  set(els.pauseButton, TEXT.pause.pauseButton);
  set(els.startButton, TEXT.menu.startWaiting);
  set(els.loadStatus, TEXT.loading.title);
  set(els.randomStageButton, TEXT.stages.random);
  set(els.stageBackButton, TEXT.stages.back);
  set(els.movesPrevButton, TEXT.moves.prev);
  set(els.movesNextButton, TEXT.moves.next);
  set(els.movesBackButton, TEXT.moves.back);
  set(els.rematchButton, TEXT.roundOver.rematch);
  set(els.menuButton, TEXT.roundOver.fighterSelect);
  set(els.resumeButton, TEXT.pause.resume);
  set(els.pauseResetButton, TEXT.pause.reset);
  set(els.pauseMenuButton, TEXT.pause.quit);
  set(els.settingsBackButton, TEXT.settings.back);
  for (const id of PLAYER_IDS) {
    set(els[`p${id}PickLabel`], TEXT.slot.player(id));
    set(els[`p${id}PickReady`], TEXT.slot.readyBadge);
    set(els[`p${id}PickRandomArt`], TEXT.slot.randomGlyph);
  }
  // Overlay headings are keyed off the markup rather than ids, since they are
  // pure decoration with nothing to address them by.
  const heading = (overlay, eyebrow, title) => {
    const lockup = els[overlay]?.querySelector(".title-lockup");
    if (!lockup) return;
    set(lockup.querySelector(".eyebrow"), eyebrow);
    if (title !== undefined) set(lockup.querySelector("h2"), title);
  };
  heading("menuOverlay", TEXT.menu.eyebrow);
  heading("stageOverlay", TEXT.stages.eyebrow, TEXT.stages.title);
  heading("pauseOverlay", TEXT.pause.eyebrow, TEXT.pause.title);
  heading("settingsOverlay", TEXT.settings.eyebrow, TEXT.settings.title);
  heading("loadOverlay", TEXT.loading.eyebrow, TEXT.loading.title);
  const logo = els.menuOverlay?.querySelector(".game-logo");
  if (logo) logo.alt = TEXT.menu.logoAlt;
}

// ------------------------------------------------- ready / lock-in helpers

// The CPU slot (P2 in single-player) never needs to lock in; it is always
// considered ready with whatever fighter is currently assigned to it.
function isCpuSlot(id) {
  return state.playerCount === 1 && id === 2;
}

function humanIds() {
  return PLAYER_IDS.slice(0, state.playerCount);
}

function allReady() {
  return humanIds().every((id) => state.ready[id]);
}

export function resetReady() {
  for (const id of PLAYER_IDS) state.ready[id] = false;
  state.cpuRoll = null;
  state.activePicker = 1;
}

// The CPU draws its fighter the instant the humans finish locking in, so the
// select screen can show who they are about to face. Backing out of a lock
// discards the draw, so re-readying faces a fresh opponent.
function syncCpuRoll() {
  const auto = state.playerCount === 1 && state.selection[2] === RANDOM_KEY;
  if (!auto || !allReady()) state.cpuRoll = null;
  else if (!state.cpuRoll) state.cpuRoll = randomCharacterKey();
}

// Commit a fighter for a slot. Humans lock in (ready); the CPU slot just takes
// the fighter and hands the shared cursor back to Player 1.
function selectFighter(id, key) {
  state.selection[id] = key;
  if (isCpuSlot(id)) {
    state.activePicker = 1;
  } else {
    state.ready[id] = true;
    const next = humanIds().find((h) => !state.ready[h]);
    if (next) state.activePicker = next;
  }
  // The pick is settled, so this player stops pointing at the grid: their
  // cursor ring and keyboard focus both go away until they back out with B.
  if (state.ready[id]) {
    pickerCursor[id] = null;
    if (focusEl?.dataset?.character) clearMenuFocus();
  }
  updateSelectionUi();
  playLockIn(id);
  playSfx("slash", 0.3, 1.4);
}

// Restarts the lock-in animation on a hero card even if it is already playing,
// so a re-pick reads as a fresh commit rather than nothing happening.
function playLockIn(id) {
  const card = els[`p${id}PickCard`];
  card.classList.remove("is-locking");
  void card.offsetWidth;
  card.classList.add("is-locking");
  card.addEventListener("animationend", () => card.classList.remove("is-locking"), { once: true });
}

function unready(id) {
  const target = state.ready[id] ? id : [...humanIds()].reverse().find((h) => state.ready[h]);
  if (!target) return false;
  state.ready[target] = false;
  state.activePicker = target;
  // Backing out puts the cursor back where the pick was made.
  pickerCursor[target] = state.selection[target] || CHARACTER_KEYS[0];
  updateSelectionUi();
  playSfx("whoosh", 0.3, 0.9);
  return true;
}

function tryStart() {
  if (!allReady()) return;
  els.startButton.click();
}

function buildCharacterGrid() {
  els.characterGrid.innerHTML = "";
  for (const group of CHARACTER_GROUPS) {
    els.characterGrid.appendChild(buildGroupSection(group.key, group.label, group.members));
  }
  // Random is its own trailing tile rather than a member of any category.
  if (RANDOM_GROUP.show !== false) {
    const wildcard = buildGroupSection(RANDOM_GROUP.key, RANDOM_GROUP.label, [RANDOM_KEY]);
    wildcard.classList.add("char-group--wildcard");
    els.characterGrid.appendChild(wildcard);
  }

  // getComputedStyle hands back custom properties unresolved ("clamp(78px,
  // 15vh, 200px)"), so the responsive base size is measured off a probe element
  // that is actually laid out at that width.
  const probe = document.createElement("span");
  probe.className = "card-probe";
  probe.setAttribute("aria-hidden", "true");
  els.characterGrid.appendChild(probe);
}

function buildGroupSection(key, label, members) {
  const section = document.createElement("section");
  section.className = "char-group";
  section.dataset.group = key;
  // Widths are driven off the member count, so any number of groups of any
  // size lays itself out from this one variable.
  section.style.setProperty("--members", members.length);

  const heading = document.createElement("h3");
  heading.className = "char-group-title";
  heading.textContent = label;
  section.appendChild(heading);

  const cards = document.createElement("div");
  cards.className = "char-group-cards";
  for (const member of members) cards.appendChild(buildCharacterCard(member));
  section.appendChild(cards);
  return section;
}

function buildCharacterCard(key) {
  const random = key === RANDOM_KEY;
  const name = random ? TEXT.slot.randomName : CHARACTERS[key].name;
  const btn = document.createElement("button");
  btn.className = random ? "char-card char-card--random" : "char-card";
  btn.dataset.character = key;
  btn.innerHTML = random
    ? `<b class="random-glyph">${TEXT.slot.randomGlyph}</b><span>${name}</span>`
    : `<img src="assets/cards/${key}_card.jpg" alt="${name}"><span>${name}</span>`;
  btn.addEventListener("click", () => selectFighter(state.activePicker, key));
  // Hovering previews the fighter in the active picker's hero card, the same
  // way the pad cursor does, without committing anything.
  btn.addEventListener("mouseenter", () => setPickerCursor(state.activePicker, key, { quiet: true }));
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    state.selection[2] = key;
    updateSelectionUi();
  });
  return btn;
}

const MIN_CARD_PX = 44;

// Sizes the roster to the window: portraits scale with the viewport, groups sit
// side by side while they fit, columns are balanced so rows come out even (six
// fighters in two rows read as 3+3, never 5+1), and the whole thing shrinks
// until the matchup bar below it still fits on screen. Runs on resize and
// whenever the menu is shown; nothing here is tied to the current roster size.
export function layoutCharacterGrid() {
  const grid = els.characterGrid;
  if (!grid || !grid.clientWidth) return; // hidden overlay: nothing to measure
  grid.style.removeProperty("--grid-height"); // measure the natural size first
  const base = grid.querySelector(".card-probe")?.getBoundingClientRect().width || 90;
  let size = base;
  for (let pass = 0; pass < 12; pass++) {
    grid.style.setProperty("--card-size", `${Math.round(size)}px`);
    applyColumns(grid, size);
    if (els.menuOverlay.scrollHeight <= els.menuOverlay.clientHeight || size <= MIN_CARD_PX) break;
    size = Math.max(MIN_CARD_PX, size * 0.9);
  }
  // Pin the fitted height so the roster cannot shift while a player is choosing.
  grid.style.setProperty("--grid-height", `${Math.ceil(grid.getBoundingClientRect().height)}px`);
}

function applyColumns(grid, cardSize) {
  const groups = [...grid.querySelectorAll(".char-group:not(.char-group--wildcard) .char-group-cards")]
    .filter((el) => el.childElementCount);
  if (!groups.length) return;
  // One column count for the whole roster, taken from the narrowest group, then
  // trimmed per group so its rows come out even.
  const gap = parseFloat(getComputedStyle(groups[0]).columnGap) || 0;
  const narrowest = Math.min(...groups.map((el) => el.clientWidth));
  const fit = Math.max(1, Math.floor((narrowest + gap) / (cardSize + gap)));
  for (const cards of groups) {
    const count = cards.childElementCount;
    const cols = Math.min(fit, count);
    const rows = Math.ceil(count / cols);
    cards.style.setProperty("--cols", Math.ceil(count / rows));
  }
}

function buildStageGrid() {
  els.stageGrid.innerHTML = "";
  for (const stage of STAGES) {
    const btn = document.createElement("button");
    btn.className = "stage-card";
    btn.innerHTML = `<img src="assets/backgrounds/${stage.bgFile}" alt="${stage.name}" loading="lazy"><span>${stage.name}</span>`;
    btn.addEventListener("click", () => callbacks.startMatch(stage.key));
    els.stageGrid.appendChild(btn);
  }
}

function setActivePicker(n) {
  state.activePicker = n;
  updateSelectionUi();
}

function bindMenuButtons() {
  for (const id of PLAYER_IDS) els[`p${id}PickCard`].addEventListener("click", () => setActivePicker(id));
  els.startButton.addEventListener("click", () => setPhase("stageSelect"));
  els.stageBackButton.addEventListener("click", () => setPhase("menu"));
  els.randomStageButton.addEventListener("click", () => {
    const stage = STAGES[Math.floor(Math.random() * STAGES.length)];
    callbacks.startMatch(stage.key);
  });

  els.settingsCpuButton.addEventListener("click", () => {
    state.cpuLevel = (state.cpuLevel + 1) % 3;
    updateMenuButtons();
  });
  els.settingsStocksButton.addEventListener("click", () => {
    const i = STOCK_OPTIONS.indexOf(state.stocks);
    state.stocks = STOCK_OPTIONS[(i + 1) % STOCK_OPTIONS.length];
    updateMenuButtons();
  });
  els.settingsSpritesButton.addEventListener("click", () => {
    state.spriteSet = state.spriteSet === "alternate" ? "default" : "alternate";
    setSpriteSet(state.spriteSet);
    updateMenuButtons();
  });
  const musicClick = () => {
    cycleMusicMode();
    updateMenuButtons();
    syncMusic(state.phase);
  };
  els.settingsMusicButton.addEventListener("click", musicClick);

  els.movesButton.addEventListener("click", () => {
    movesReturnPhase = state.phase === "moves" ? movesReturnPhase : state.phase;
    movesIndex = Math.max(0, CHARACTER_KEYS.indexOf(state.selection[1]));
    setPhase("moves");
  });
  els.movesBackButton.addEventListener("click", () => setPhase(movesReturnPhase));
  els.movesPrevButton.addEventListener("click", () => {
    movesIndex = (movesIndex - 1 + CHARACTER_KEYS.length) % CHARACTER_KEYS.length;
    renderMoveList();
  });
  els.movesNextButton.addEventListener("click", () => {
    movesIndex = (movesIndex + 1) % CHARACTER_KEYS.length;
    renderMoveList();
  });

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.querySelector(".arena-wrap").requestFullscreen?.();
  };
  els.fullscreenButton.addEventListener("click", fullscreen);

  els.settingsButton.addEventListener("click", () => {
    settingsReturnPhase = state.phase === "settings" ? settingsReturnPhase : state.phase;
    setPhase("settings");
  });
  els.settingsBackButton.addEventListener("click", () => setPhase(settingsReturnPhase));

  els.musicVolumeRange.addEventListener("input", () => {
    audioSettings.musicVolume = els.musicVolumeRange.value / 100;
    els.musicVolumeLabel.textContent = `Music Volume: ${els.musicVolumeRange.value}%`;
    syncMusic(state.phase);
  });
  els.sfxVolumeRange.addEventListener("input", () => {
    audioSettings.sfxVolume = els.sfxVolumeRange.value / 100;
    els.sfxVolumeLabel.textContent = `Sound FX Volume: ${els.sfxVolumeRange.value}%`;
    playSfx("block", 0.8);
  });

  els.pauseButton.addEventListener("click", () => callbacks.togglePause());
  els.resumeButton.addEventListener("click", () => callbacks.togglePause());
  els.pauseResetButton.addEventListener("click", () => callbacks.resetMatch());
  els.pauseMenuButton.addEventListener("click", () => callbacks.quitToMenu());
  els.rematchButton.addEventListener("click", () => callbacks.resetMatch());
  els.menuButton.addEventListener("click", () => callbacks.quitToMenu());
}

export function updateMenuButtons() {
  const label = MUSIC_MODES[audioSettings.musicMode].label;
  els.settingsMusicButton.textContent = TEXT.settings.music(label);
  els.settingsCpuButton.textContent = TEXT.settings.cpu(cpuLevelName(state.cpuLevel));
  els.settingsStocksButton.textContent = TEXT.settings.stocks(state.stocks);
  els.settingsSpritesButton.textContent = TEXT.settings.sprites(
    state.spriteSet === "alternate" ? TEXT.settings.spriteAlternate : TEXT.settings.spriteDefault
  );
}

// Stat bars for the hero cards, normalized against the full roster so a bar
// at 100% means "best in the game", not an absolute number.
const STAT_DEFS = [
  { label: TEXT.slot.stats.speed, value: (c) => c.stats.speed },
  { label: TEXT.slot.stats.power, value: (c) => c.heavy.dmg + c.light.dmg },
  { label: TEXT.slot.stats.weight, value: (c) => c.stats.weight },
];
const STAT_RANGES = STAT_DEFS.map((def) => {
  const values = CHARACTER_KEYS.map((k) => def.value(CHARACTERS[k]));
  return { min: Math.min(...values), max: Math.max(...values) };
});

function randomInfoHtml() {
  const bars = STAT_DEFS.map((def) =>
    `<span class="hero-stat"><i>${def.label}</i><b></b></span>`).join("");
  return `
    <em class="hero-epithet">${TEXT.slot.randomBlurb}</em>
    <span class="hero-stats">${bars}</span>
    <span class="hero-ult"><i>${TEXT.slot.ultimateLabel}</i> ${TEXT.slot.unknownUltimate}</span>
  `;
}

function heroInfoHtml(char) {
  const bars = STAT_DEFS.map((def, i) => {
    const { min, max } = STAT_RANGES[i];
    const pct = Math.round(15 + 85 * ((def.value(char) - min) / (max - min || 1)));
    return `<span class="hero-stat"><i>${def.label}</i><b><u style="width:${pct}%"></u></b></span>`;
  }).join("");
  return `
    <em class="hero-epithet" title="${char.epithet}">${char.epithet}</em>
    <span class="hero-stats">${bars}</span>
    <span class="hero-ult" title="${char.ultimate.name}"><i>${TEXT.slot.ultimateLabel}</i> ${char.ultimate.name}</span>
  `;
}

// A human slot that has not locked in is "browsing": its card shows whatever
// the cursor is over (or its last pick) greyed out, because nothing is settled
// yet. The CPU slot never browses — it is committed to whatever it holds.
function isBrowsing(id) {
  return !state.ready[id] && !isCpuSlot(id);
}

// The fighter a browsing slot is pointing at right now. Falls back to its last
// pick so backing out with B keeps showing the fighter it was on.
function browsingKey(id) {
  if (!isBrowsing(id)) return null;
  const cursor = state.activePicker === id ? pickerCursor[id] : null;
  return cursor || state.selection[id];
}

// What each slot's card should point at right now. Normally the selection
// itself, but once the CPU has drawn, its tag follows the drawn fighter rather
// than sitting on the Random card.
function shownKey(id) {
  const drawn = id === 2 && state.selection[id] === RANDOM_KEY ? state.cpuRoll : null;
  return drawn || state.selection[id];
}

export function updateSelectionUi() {
  syncCpuRoll();
  for (const btn of els.characterGrid.querySelectorAll(".char-card")) {
    const key = btn.dataset.character;
    const visiblePlayers = state.playerCount === 1 ? [1, 2] : PLAYER_IDS.slice(0, state.playerCount);
    for (const id of PLAYER_IDS) btn.classList.toggle(`is-p${id}`, visiblePlayers.includes(id) && key === shownKey(id));
    btn.querySelectorAll(".pick-tag").forEach((el) => el.remove());
    for (const id of visiblePlayers) {
      if (key !== shownKey(id)) continue;
      const tag = document.createElement("i");
      tag.className = `pick-tag pick-tag--p${id}`;
      tag.textContent = id === 2 && state.playerCount === 1 ? "CPU" : `P${id}`;
      btn.appendChild(tag);
    }
  }
  for (const id of PLAYER_IDS) {
    // A random slot shows a "?" tile, except the CPU once it has drawn: then
    // the card reveals the fighter the next match will actually use. A slot
    // nobody has picked yet (P1 at boot) shows an empty placeholder instead of
    // a portrait — an unset key would build "undefined_card.jpg" and 404.
    const drawn = id === 2 && state.selection[id] === RANDOM_KEY ? state.cpuRoll : null;
    const browsing = isBrowsing(id);
    const key = drawn || (browsing ? browsingKey(id) : state.selection[id]);
    const random = key === RANDOM_KEY;
    const char = key && !random ? CHARACTERS[key] : null;
    const badge = els[`p${id}PickReady`];

    els[`p${id}PickCard`].classList.toggle("is-browsing", browsing && !!key);
    els[`p${id}PickCard`].classList.toggle("is-empty", !key);
    els[`p${id}PickImage`].classList.toggle("hidden", !char);
    els[`p${id}PickRandomArt`].classList.toggle("hidden", !random);
    if (char) els[`p${id}PickImage`].src = `assets/cards/${key}_card.jpg`;
    else els[`p${id}PickImage`].removeAttribute("src");
    els[`p${id}PickName`].textContent =
      char ? char.name : random ? TEXT.slot.randomName : TEXT.slot.empty;
    els[`p${id}PickInfo`].innerHTML = char ? heroInfoHtml(char) : random ? randomInfoHtml() : "";

    badge.textContent = drawn ? TEXT.slot.randomBadge : TEXT.slot.readyBadge;
    badge.classList.toggle("hero-ready--random", !!drawn);
    badge.classList.toggle("hidden", !state.ready[id] && !drawn);
    els[`p${id}PickCard`].classList.toggle("hidden", id > 2 && id > state.playerCount);
    els[`p${id}PickCard`].classList.toggle("is-active", state.activePicker === id);
    els[`p${id}PickCard`].classList.toggle("is-ready", state.ready[id]);
  }
  els.p2PickLabel.textContent = state.mode === "cpu" ? TEXT.slot.cpu : TEXT.slot.player(2);
  const go = allReady();
  els.startButton.disabled = !go;
  els.startButton.textContent = go ? TEXT.menu.startReady : TEXT.menu.startWaiting;
  els.menuHint.textContent = go ? TEXT.menu.hintReady : TEXT.menu.hintPicking;
  updatePickerCursorClasses();
}

export function syncControllerPlayers(count) {
  const joined = Math.min(4, count);
  if (joined <= state.playerCount) return;
  state.playerCount = joined;
  state.mode = joined === 1 ? state.mode : "local";
  updateMenuButtons();
  updateSelectionUi();
}

// ------------------------------------------------------------------ phases

const OVERLAY_FOR_PHASE = {
  loading: "loadOverlay",
  menu: "menuOverlay",
  stageSelect: "stageOverlay",
  moves: "movesOverlay",
  paused: "pauseOverlay",
  roundOver: "roundOverlay",
  settings: "settingsOverlay",
  playing: null,
};

export function setPhase(phase) {
  state.prevPhase = state.phase;
  state.phase = phase;
  for (const [ph, id] of Object.entries(OVERLAY_FOR_PHASE)) {
    if (id) els[id].classList.toggle("hidden", ph !== phase);
  }
  els.utilityActions.classList.toggle("hidden", phase === "loading");
  els.hud.classList.toggle("hidden", !["playing", "paused", "roundOver"].includes(phase));
  // The roster can only be measured once its overlay is on screen.
  if (phase === "menu") layoutCharacterGrid();
  if (phase === "moves") renderMoveList();
  clearMenuFocus();
  syncMusic(phase);
}

export function setLoadProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  els.loadBarFill.style.width = `${pct}%`;
  els.loadBar.setAttribute("aria-valuenow", String(pct));
}

// ------------------------------------------------------------------- moves

function renderMoveList() {
  const key = CHARACTER_KEYS[movesIndex];
  const c = CHARACTERS[key];
  els.movesTitle.textContent = TEXT.moves.heading(c.name, c.epithet);
  els.movesKicker.textContent = TEXT.moves.kicker;
  const s = c.specials;
  els.movesPanel.innerHTML = `
    <div class="controller-guide">
      <svg class="xbox-controller" viewBox="0 0 660 300" role="img" aria-label="Xbox controller button map">
        <path class="controller-shell" d="M180 55C128 60 94 99 80 155L53 246c-8 28 25 43 43 21l69-81h330l69 81c18 22 51 7 43-21l-27-91c-14-56-48-95-100-100-48-5-66 14-110 14S228 50 180 55Z"/>
        <rect class="controller-bumper" x="145" y="38" width="100" height="26" rx="10"/><rect class="controller-bumper" x="415" y="38" width="100" height="26" rx="10"/>
        <text x="195" y="56">LB · ULTIMATE</text><text x="465" y="56">RB · ULTIMATE</text>
        <circle class="controller-stick" cx="205" cy="126" r="35"/><circle class="controller-stick-cap" cx="205" cy="126" r="21"/>
        <text class="controller-callout" x="205" y="184">MOVE · CROUCH · AIM</text>
        <g class="controller-dpad"><rect x="270" y="168" width="62" height="22" rx="5"/><rect x="290" y="148" width="22" height="62" rx="5"/></g>
        <circle class="controller-menu" cx="305" cy="104" r="10"/><circle class="controller-menu" cx="355" cy="104" r="10"/>
        <g class="controller-face">
          <circle class="button-y" cx="468" cy="102" r="20"/><text x="468" y="108">Y</text>
          <circle class="button-x" cx="428" cy="141" r="20"/><text x="428" y="147">X</text>
          <circle class="button-b" cx="508" cy="141" r="20"/><text x="508" y="147">B</text>
          <circle class="button-a" cx="468" cy="180" r="20"/><text x="468" y="186">A</text>
        </g>
        <text class="face-label" x="552" y="106">HEAVY</text><text class="face-label" x="368" y="146" text-anchor="end">LIGHT</text>
        <text class="face-label" x="552" y="146">SPECIAL</text><text class="face-label" x="552" y="186">JUMP</text>
        <text class="controller-trigger" x="113" y="27">LT · SHIELD / DODGE</text><text class="controller-trigger" x="547" y="27" text-anchor="end">RT · SHIELD / DODGE</text>
      </svg>
      <div class="controller-tips">
        ${TEXT.moves.tips.map(([input, action]) => `<span><strong>${input}</strong> ${action}</span>`).join("")}
      </div>
    </div>
    <p class="moves-blurb"><strong>${c.passive.name}:</strong> ${c.passive.desc}</p>
    <div class="moves-section">${TEXT.moves.sectionTitle}</div>
    <dl class="moves-table">
      <dt>${TEXT.moves.specialNeutral}</dt><dd><strong>${s.neutral.name}</strong> — ${s.neutral.desc}</dd>
      <dt>${TEXT.moves.specialSide}</dt><dd><strong>${s.side.name}</strong> — ${s.side.desc}</dd>
      <dt>${TEXT.moves.specialDown}</dt><dd><strong>${s.down.name}</strong> — ${s.down.desc}</dd>
      <dt>${TEXT.moves.ultimate}</dt><dd><strong>${c.ultimate.name}</strong> — ${c.ultimate.desc} <em>${TEXT.moves.ultimateNote}</em></dd>
    </dl>
    <p class="keyboard-hint">${TEXT.moves.keyboardHint}</p>
  `;
}

// -------------------------------------------------------------------- HUD

function damageColor(d) {
  const t = clamp(d / 160, 0, 1);
  const r = 255;
  const g = Math.round(255 - t * 190);
  const b = Math.round(255 - t * 230);
  return `rgb(${r},${g},${b})`;
}

export function updateHud() {
  els.hud.classList.toggle("hud--multiplayer", state.fighters.length > 2);
  for (const id of PLAYER_IDS) {
    const f = state.fighters[id - 1];
    els[`p${id}Panel`].classList.toggle("hidden", !f);
    if (!f) continue;
    document.documentElement.style.setProperty(`--p${id}-theme`, f.char.theme);
    els[`p${id}Name`].textContent = f.char.name;
    els[`p${id}Portrait`].src = `assets/cards/${f.charKey}_card.jpg`;
    els[`p${id}Damage`].textContent = `${Math.round(f.damage)}%`;
    els[`p${id}Damage`].style.color = damageColor(f.damage);
    renderStocks(els[`p${id}Stocks`], f);
    renderMeter(els[`p${id}Meter`], els[`p${id}MeterLabel`], f);
  }
}

function renderStocks(el, f) {
  if (el.childElementCount !== state.stocks) {
    el.innerHTML = "";
    for (let i = 0; i < state.stocks; i++) {
      const dot = document.createElement("span");
      dot.className = "stock-dot";
      el.appendChild(dot);
    }
  }
  [...el.children].forEach((dot, i) => {
    dot.classList.toggle("stock-dot--lost", i >= f.stocks);
  });
}

function renderMeter(fillEl, labelEl, f) {
  const pct = (f.meter / METER_MAX) * 100;
  fillEl.style.width = `${pct}%`;
  const full = f.meter >= METER_MAX;
  fillEl.parentElement.classList.toggle("meter--full", full);
  labelEl.textContent = full ? TEXT.hud.ultimateReady : "";
}

export function showRoundOver(winner, loser) {
  els.roundKicker.textContent = TEXT.roundOver.kicker;
  els.winnerText.textContent = winner ? TEXT.roundOver.winner(winner.char.name) : TEXT.roundOver.draw;
  setPhase("roundOver");
}

export function updateControllerStatus(count) {
  els.controllerStatus.classList.toggle("hidden", count === 0);
  if (count > 0) {
    const joined = state.playerCount;
    const waiting = Math.max(0, Math.min(4, count) - joined);
    const who = joined === 1 ? "VS CPU" : `${joined} players joined`;
    els.controllerStatus.textContent = waiting
      ? `${who} — press any button on another controller to join`
      : `${who} — A locks your fighter, A again starts · B backs out · LB/RB corner menus`;
  }
}

// ------------------------------------------- gamepad / keyboard menu nav
//
// Spatial navigation over whatever overlay is visible: directions move focus
// to the geometrically nearest control, A/Enter activates, B backs out of the
// current screen. Works on the character grid, stage grid, and every button
// row without any per-screen wiring.

let focusEl = null;
const navRepeat = { dir: null, t: 0 };

const BACK_TARGET = {
  stageSelect: () => els.stageBackButton,
  moves: () => els.movesBackButton,
  settings: () => els.settingsBackButton,
  paused: () => els.resumeButton,
};

function menuFocusables() {
  const overlayId = OVERLAY_FOR_PHASE[state.phase];
  if (!overlayId) return [];
  const overlay = els[overlayId];
  return [...overlay.querySelectorAll("button, input[type=range]")]
    .filter((el) => !el.classList.contains("hidden") && el.offsetParent !== null && !el.disabled);
}

function defaultFocus() {
  const items = menuFocusables();
  if (!items.length) return null;
  if (state.phase === "menu") {
    const key = state.selection[state.activePicker];
    const current = key
      ? els.characterGrid.querySelector(`[data-character="${key}"]`)
      : els.characterGrid.querySelector(".char-card");
    if (current) return current;
  }
  if (state.phase === "stageSelect") {
    const first = els.stageGrid.querySelector(".stage-card");
    if (first) return first;
  }
  return items.find((el) => el.classList.contains("primary-action")) || items[0];
}

function setFocus(el) {
  if (focusEl === el) return;
  if (focusEl) focusEl.classList.remove("pad-focus");
  focusEl = el;
  if (focusEl) {
    focusEl.classList.add("pad-focus");
    // Keyboard focus previews too, so arrow-key browsing reads the same as pad.
    if (state.phase === "menu" && focusEl.dataset.character) {
      setPickerCursor(state.activePicker, focusEl.dataset.character, { quiet: true });
    }
    focusEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    playSfx("whoosh", 0.25, 1.6);
  }
}

function updatePickerCursorClasses() {
  // Cards, not the grid's direct children — those are the group sections, and
  // clearing them would leave a cursor ring on every card ever visited.
  for (const btn of els.characterGrid?.querySelectorAll(".char-card") || []) {
    for (const id of PLAYER_IDS) btn.classList.remove(`pad-focus-p${id}`);
  }
  for (const id of PLAYER_IDS.slice(0, state.playerCount)) {
    // a ready player's cursor disappears: their pick is committed
    if (state.ready[id]) continue;
    const key = pickerCursor[id];
    if (!key) continue;
    els.characterGrid.querySelector(`[data-character="${key}"]`)?.classList.add(`pad-focus-p${id}`);
  }
}

function setPickerCursor(playerId, key, { quiet = false } = {}) {
  if (!key || pickerCursor[playerId] === key) return;
  pickerCursor[playerId] = key;
  // Repaints the hero card too: the cursor drives the transient preview.
  updateSelectionUi();
  if (!quiet) playSfx("whoosh", 0.2, 1.6);
}

function movePickerCursor(playerId, dx, dy) {
  const items = [...els.characterGrid.querySelectorAll(".char-card")];
  if (!items.length) return;
  const currentKey = pickerCursor[playerId] || state.selection[playerId];
  const current = items.find((el) => el.dataset.character === currentKey) || items[0];
  const from = current.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const along = dx !== 0 ? (cx - fx) * dx : (cy - fy) * dy;
    const ortho = dx !== 0 ? Math.abs(cy - fy) : Math.abs(cx - fx);
    if (along < 4) continue;
    const score = along + ortho * 2.6;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best && dx !== 0) {
    const index = items.indexOf(current);
    best = items[index + dx] || null;
  }
  if (best) setPickerCursor(playerId, best.dataset.character);
}

// LB/RB on the menu cycle a highlight through the utility buttons in the top
// right corner, then wrap back to the fighter grid (or the start button once
// everyone is locked in). A activates the highlighted button.
const UTILITY_IDS = ["movesButton", "settingsButton", "fullscreenButton"];
let utilityIdx = -1;
let menuHighlightEl = null;

function setMenuHighlight(el) {
  if (menuHighlightEl === el) return;
  if (menuHighlightEl) menuHighlightEl.classList.remove("pad-focus");
  menuHighlightEl = el;
  if (el) {
    el.classList.add("pad-focus");
    playSfx("whoosh", 0.25, 1.6);
  }
}

function syncMenuHighlight() {
  if (utilityIdx >= 0) setMenuHighlight(els[UTILITY_IDS[utilityIdx]]);
  else setMenuHighlight(allReady() ? els.startButton : null);
}

function cycleUtility(dir) {
  const n = UTILITY_IDS.length;
  utilityIdx = dir > 0
    ? (utilityIdx >= n - 1 ? -1 : utilityIdx + 1)
    : (utilityIdx < 0 ? n - 1 : utilityIdx - 1);
}

function updateCharacterPickerPads(dt) {
  const pads = padsMenuStates();

  if (pads.some((p) => p.pageNextP)) cycleUtility(1);
  else if (pads.some((p) => p.pagePrevP)) cycleUtility(-1);

  // While a utility button is highlighted, A presses go to it, not the grid.
  if (utilityIdx >= 0) {
    if (pads.some((p) => p.confirmP)) {
      const el = els[UTILITY_IDS[utilityIdx]];
      utilityIdx = -1;
      setMenuHighlight(null);
      playSfx("slash", 0.3, 1.5);
      el.click();
      return;
    }
    if (pads.some((p) => p.backP)) utilityIdx = -1;
    syncMenuHighlight();
    updatePickerCursorClasses();
    return;
  }

  for (let i = 0; i < Math.min(4, pads.length, state.playerCount); i++) {
    const playerId = i + 1;
    const pad = pads[i];
    const repeat = pickerRepeat[i];

    // Ready players stop steering the grid. A starts the match (once everyone
    // is ready); B releases their pick so they can browse again.
    if (state.ready[playerId]) {
      repeat.dir = null;
      if (pad.backP) unready(playerId);
      else if (pad.confirmP) tryStart();
      continue;
    }

    // A slot with no cursor yet (fresh boot, or just backed out) parks on its
    // own pick, else on the first fighter in the grid.
    if (!pickerCursor[playerId]) pickerCursor[playerId] = state.selection[playerId] || CHARACTER_KEYS[0];
    let dx = 0, dy = 0;
    if (pad.left) dx = -1;
    else if (pad.right) dx = 1;
    else if (pad.up) dy = -1;
    else if (pad.down) dy = 1;
    const dirKey = dx !== 0 ? `x${dx}` : dy !== 0 ? `y${dy}` : null;
    if (dirKey) {
      if (repeat.dir !== dirKey) {
        repeat.dir = dirKey;
        repeat.t = 0.34;
        movePickerCursor(playerId, dx, dy);
      } else {
        repeat.t -= dt;
        if (repeat.t <= 0) { repeat.t = 0.13; movePickerCursor(playerId, dx, dy); }
      }
    } else repeat.dir = null;
    if (pad.confirmP) {
      selectFighter(playerId, pickerCursor[playerId] || state.selection[playerId]);
    }
  }
  syncMenuHighlight();
  updatePickerCursorClasses();
}

export function clearMenuFocus() {
  if (focusEl) focusEl.classList.remove("pad-focus");
  focusEl = null;
  navRepeat.dir = null;
  for (const repeat of pickerRepeat) repeat.dir = null;
  utilityIdx = -1;
  if (menuHighlightEl) menuHighlightEl.classList.remove("pad-focus");
  menuHighlightEl = null;
}

function moveFocus(dx, dy) {
  const items = menuFocusables();
  if (!items.length) return;
  if (!focusEl || !items.includes(focusEl)) {
    setFocus(defaultFocus());
    return;
  }

  // sliders consume left/right to adjust their value
  if (focusEl.tagName === "INPUT" && dy === 0) {
    focusEl.value = clamp(Number(focusEl.value) + dx * 5, Number(focusEl.min), Number(focusEl.max));
    focusEl.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  const from = focusEl.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === focusEl) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const alongX = (cx - fx) * dx;
    const alongY = (cy - fy) * dy;
    const along = dx !== 0 ? alongX : alongY;
    const ortho = dx !== 0 ? Math.abs(cy - fy) : Math.abs(cx - fx);
    if (along < 4) continue; // must lie in the pressed direction
    const score = along + ortho * 2.6;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    setFocus(best);
  } else if (dx !== 0) {
    // end of a grid row: fall through to the next/previous item in reading order
    const idx = items.indexOf(focusEl);
    const next = items[idx + dx];
    if (next) setFocus(next);
  }
}

function activateFocus() {
  if (!focusEl || !menuFocusables().includes(focusEl)) {
    setFocus(defaultFocus());
    return;
  }
  if (focusEl.tagName === "INPUT") return; // sliders adjust with left/right
  // On the fighter grid, a confirm from a player who is already locked in is
  // the "second press": it starts the match instead of re-picking.
  if (state.phase === "menu" && focusEl.classList.contains("char-card") && state.ready[state.activePicker]) {
    tryStart();
    return;
  }
  playSfx("slash", 0.3, 1.5);
  focusEl.click();
}

function menuBack() {
  const target = BACK_TARGET[state.phase]?.();
  if (target) target.click();
}

// Called every frame by the main loop while a menu phase is active.
export function updateMenuNav(dt) {
  if (state.phase === "menu" && padsMenuStates().length) {
    updateCharacterPickerPads(dt);
    return;
  }
  const pad = padsMenuState();

  let dx = 0;
  let dy = 0;
  if (pad.left) dx = -1;
  else if (pad.right) dx = 1;
  else if (pad.up) dy = -1;
  else if (pad.down) dy = 1;

  const dirKey = dx !== 0 ? `x${dx}` : dy !== 0 ? `y${dy}` : null;
  if (dirKey) {
    if (navRepeat.dir !== dirKey) {
      navRepeat.dir = dirKey;
      navRepeat.t = 0.34; // initial repeat delay
      moveFocus(dx, dy);
    } else {
      navRepeat.t -= dt;
      if (navRepeat.t <= 0) {
        navRepeat.t = 0.13;
        moveFocus(dx, dy);
      }
    }
  } else {
    navRepeat.dir = null;
  }

  if (pad.confirmP) activateFocus();
  if (pad.backP) menuBack();
  if (pad.altP && state.phase === "menu" && focusEl?.dataset?.character) {
    state.selection[2] = focusEl.dataset.character;
    updateSelectionUi();
    playSfx("slash", 0.3, 1.2);
  }
  if (state.phase === "moves") {
    if (pad.pagePrevP) els.movesPrevButton.click();
    if (pad.pageNextP) els.movesNextButton.click();
  }
}

function bindMenuKeyboardNav() {
  window.addEventListener("keydown", (e) => {
    if (state.phase === "playing" || state.phase === "loading") return;
    const map = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const code = e.code || e.key;
    if (map[code]) {
      e.preventDefault();
      moveFocus(...map[code]);
    } else if (code === "Enter" || code === "Return" || code === "NumpadEnter") {
      e.preventDefault();
      activateFocus();
    } else if (code === "Backspace") {
      e.preventDefault();
      if (state.phase === "menu") unready(state.activePicker);
      else menuBack();
    }
  });
  // real mouse use hides the pad cursor until the pad speaks again
  // (ignore sub-pixel jitter so a nudged desk doesn't eat a controller input)
  let lastMouse = null;
  window.addEventListener("mousemove", (e) => {
    if (lastMouse && Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y) > 8) clearMenuFocus();
    lastMouse = { x: e.clientX, y: e.clientY };
  }, { passive: true });
}
