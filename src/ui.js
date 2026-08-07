import { state } from "./state.js";
import { CHARACTER_GROUPS, CHARACTER_KEYS, CHARACTERS } from "./characters.js";
import { STAGES } from "./stages.js";
import { audioSettings, cycleMusicMode, MUSIC_MODES, syncMusic, playSfx } from "./audio.js";
import { cpuLevelName } from "./ai.js";
import { METER_MAX } from "./constants.js";
import { clamp } from "./utils.js";
import { padsMenuState, padsMenuStates } from "./input.js";
import { setSpriteSet } from "./assets.js";

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
    "startButton", "movesButton", "settingsButton", "fullscreenButton", "controllerStatus",
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

  buildCharacterGrid();
  buildStageGrid();
  bindMenuButtons();
  bindMenuKeyboardNav();
  updateSelectionUi();
  updateMenuButtons();
  window.addEventListener("resize", layoutCharacterGrid);
}

function buildCharacterGrid() {
  els.characterGrid.innerHTML = "";
  // Group headings span the full grid row, so each group starts on a new line
  // without needing a separate grid container per group (which would break the
  // geometric pad navigation across the whole roster).
  for (const group of CHARACTER_GROUPS) {
    const section = document.createElement("section");
    section.className = "char-group";
    section.dataset.group = group.key;
    // Groups share the row proportionally to their size, so a 4-fighter group
    // never takes the same width as a 9-fighter one. Any number of groups of
    // any size lays itself out from this one variable.
    section.style.setProperty("--members", group.members.length);

    const heading = document.createElement("h3");
    heading.className = "char-group-title";
    heading.textContent = group.label;
    section.appendChild(heading);

    const cards = document.createElement("div");
    cards.className = "char-group-cards";
    for (const key of group.members) cards.appendChild(buildCharacterCard(key));
    section.appendChild(cards);
    els.characterGrid.appendChild(section);
  }
  // getComputedStyle hands back custom properties unresolved ("clamp(78px,
  // 11vh, 150px)"), so the responsive base size is measured off a probe element
  // that is actually laid out at that width.
  const probe = document.createElement("span");
  probe.className = "card-probe";
  probe.setAttribute("aria-hidden", "true");
  els.characterGrid.appendChild(probe);
}

// Picks a column count per group from the width it actually got, then evens the
// rows out: a group of six in two rows reads as 3+3 rather than 5+1. Runs on
// resize and whenever the menu is shown, and works for any group size, so a new
// fighter or a new category needs no numbers changed here.
const MIN_CARD_PX = 44;

export function layoutCharacterGrid() {
  const grid = els.characterGrid;
  if (!grid || !grid.clientWidth) return; // hidden overlay: nothing to measure
  const base = grid.querySelector(".card-probe")?.getBoundingClientRect().width || 90;
  // Shrink the portraits until the whole screen fits. However the roster grows,
  // the matchup bar and the Start button stay on screen.
  let size = base;
  for (let pass = 0; pass < 12; pass++) {
    grid.style.setProperty("--card-size", `${Math.round(size)}px`);
    applyColumns(grid, size);
    if (els.menuOverlay.scrollHeight <= els.menuOverlay.clientHeight || size <= MIN_CARD_PX) break;
    size = Math.max(MIN_CARD_PX, size * 0.9);
  }
}

function applyColumns(grid, cardSize) {
  const groups = [...grid.querySelectorAll(".char-group-cards")].filter((el) => el.childElementCount);
  if (!groups.length) return;
  // One column count for the whole roster, taken from the narrowest group, then
  // trimmed per group so its rows come out even (six in two rows is 3+3).
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

function buildCharacterCard(key) {
  const char = CHARACTERS[key];
  const btn = document.createElement("button");
  btn.className = "char-card";
  btn.dataset.character = key;
  btn.innerHTML = `<img src="assets/cards/${key}_card.jpg" alt="${char.name}"><span>${char.name}</span>`;
  btn.addEventListener("click", () => {
    state.selection[state.activePicker] = key;
    const maxPicker = state.playerCount === 1 ? 2 : state.playerCount;
    if (state.activePicker < maxPicker) setActivePicker(state.activePicker + 1);
    updateSelectionUi();
    playSfx("slash", 0.3, 1.4);
  });
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    state.selection[2] = key;
    updateSelectionUi();
  });
  return btn;
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
  els.startButton.addEventListener("click", () => {
    if (!state.selection[1]) return;
    setPhase("stageSelect");
  });
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
  els.settingsMusicButton.textContent = `Music: ${label}`;
  els.settingsCpuButton.textContent = `CPU Difficulty: ${cpuLevelName(state.cpuLevel)}`;
  els.settingsStocksButton.textContent = `Lives per fighter: ${state.stocks}`;
  els.settingsSpritesButton.textContent =
    `Sprites: ${state.spriteSet === "alternate" ? "Alternate" : "Default"}`;
}

export function updateSelectionUi() {
  for (const btn of els.characterGrid.querySelectorAll(".char-card")) {
    const key = btn.dataset.character;
    const visiblePlayers = state.playerCount === 1 ? [1, 2] : PLAYER_IDS.slice(0, state.playerCount);
    for (const id of PLAYER_IDS) btn.classList.toggle(`is-p${id}`, visiblePlayers.includes(id) && key === state.selection[id]);
    btn.querySelectorAll(".pick-tag").forEach((el) => el.remove());
    for (const id of visiblePlayers) {
      if (key !== state.selection[id]) continue;
      const tag = document.createElement("i");
      tag.className = `pick-tag pick-tag--p${id}`;
      tag.textContent = id === 2 && state.playerCount === 1 ? "CPU" : `P${id}`;
      btn.appendChild(tag);
    }
  }
  for (const id of PLAYER_IDS) {
    const key = state.selection[id];
    const card = els[`p${id}PickCard`];
    const img = els[`p${id}PickImage`];
    // An empty slot shows a placeholder tile instead of a portrait; setting an
    // src of "undefined_card.jpg" would draw a broken image and log a 404.
    card.classList.toggle("is-empty", !key);
    if (key) {
      img.src = `assets/cards/${key}_card.jpg`;
      els[`p${id}PickName`].textContent = CHARACTERS[key].name;
    } else {
      img.removeAttribute("src");
      els[`p${id}PickName`].textContent = "Choose a fighter";
    }
    card.classList.toggle("hidden", id > 2 && id > state.playerCount);
    card.classList.toggle("is-active", state.activePicker === id);
  }
  els.p2PickLabel.textContent = state.mode === "cpu" ? "CPU" : "Player 2";
  updateStartButton();
  updatePickerCursorClasses();
}

// Player 1 starts unselected, so the match cannot begin until they pick.
function updateStartButton() {
  const ready = !!state.selection[1];
  els.startButton.disabled = !ready;
  els.startButton.textContent = ready ? "Choose Stage" : "Select Player 1";
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
  els.movesTitle.textContent = `${c.name} — ${c.epithet}`;
  els.movesKicker.textContent = "Controller guide";
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
        <span><strong>Left stick twice</strong> Dash</span>
        <span><strong>Down in air</strong> Fast-fall</span>
        <span><strong>Shield + direction</strong> Dodge</span>
        <span><strong>Tap shield on impact</strong> Parry</span>
      </div>
    </div>
    <p class="moves-blurb"><strong>${c.passive.name}:</strong> ${c.passive.desc}</p>
    <div class="moves-section">Signature techniques</div>
    <dl class="moves-table">
      <dt>B · Special</dt><dd><strong>${s.neutral.name}</strong> — ${s.neutral.desc}</dd>
      <dt>Side + B</dt><dd><strong>${s.side.name}</strong> — ${s.side.desc}</dd>
      <dt>Down + B</dt><dd><strong>${s.down.name}</strong> — ${s.down.desc}</dd>
      <dt>LB / RB</dt><dd><strong>${c.ultimate.name}</strong> — ${c.ultimate.desc} <em>Requires full Cursed Energy.</em></dd>
    </dl>
    <p class="keyboard-hint">Keyboard: P1 uses WASD + J/K/L/I + Left Shift. P2 uses arrows + ,/./&#47;/&#39; + Right Shift.</p>
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
  labelEl.textContent = full ? "ULTIMATE READY" : "";
}

export function showRoundOver(winner, loser) {
  els.roundKicker.textContent = "Match complete";
  els.winnerText.textContent = winner ? `${winner.char.name} wins!` : "Draw";
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
      : `${who} — each player has their own fighter cursor; Start continues`;
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
    .filter((el) => !el.classList.contains("hidden") && !el.disabled && el.offsetParent !== null);
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
    focusEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    playSfx("whoosh", 0.25, 1.6);
  }
}

function updatePickerCursorClasses() {
  for (const btn of els.characterGrid?.children || []) {
    for (const id of PLAYER_IDS) btn.classList.remove(`pad-focus-p${id}`);
  }
  for (const id of PLAYER_IDS.slice(0, state.playerCount)) {
    const key = pickerCursor[id];
    if (!key) continue;
    els.characterGrid.querySelector(`[data-character="${key}"]`)?.classList.add(`pad-focus-p${id}`);
  }
}

function setPickerCursor(playerId, key) {
  if (!key || pickerCursor[playerId] === key) return;
  pickerCursor[playerId] = key;
  updatePickerCursorClasses();
  playSfx("whoosh", 0.2, 1.6);
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

function updateCharacterPickerPads(dt) {
  const pads = padsMenuStates();
  for (let i = 0; i < Math.min(4, pads.length, state.playerCount); i++) {
    const playerId = i + 1;
    const pad = pads[i];
    // An unselected slot parks its cursor on the first fighter in the grid.
    if (!pickerCursor[playerId]) pickerCursor[playerId] = state.selection[playerId] || CHARACTER_KEYS[0];
    let dx = 0, dy = 0;
    if (pad.left) dx = -1;
    else if (pad.right) dx = 1;
    else if (pad.up) dy = -1;
    else if (pad.down) dy = 1;
    const dirKey = dx !== 0 ? `x${dx}` : dy !== 0 ? `y${dy}` : null;
    const repeat = pickerRepeat[i];
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
      state.selection[playerId] = pickerCursor[playerId] || state.selection[playerId];
      updateSelectionUi();
      playSfx("slash", 0.3, 1.35);
    }
  }
  updatePickerCursorClasses();
}

export function clearMenuFocus() {
  if (focusEl) focusEl.classList.remove("pad-focus");
  focusEl = null;
  navRepeat.dir = null;
  for (const repeat of pickerRepeat) repeat.dir = null;
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
      menuBack();
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
