// THE ARENA BENCH — `/workbench/?edit=arena`
//
// Pick a board on the left, move its platforms with the mouse, drive a fighter
// around it with a pad, and export the numbers when it feels right.
//
// IT IS THE GAME, NOT A PREVIEW. The picture is `render.js draw`, the step is
// `sim.js advanceWorld`, the platforms are `state.platforms` and the fighter is
// `makeFighter` — so a board that reads wrong here reads wrong in a match,
// which is the only property that makes a bench worth opening. What this file
// owns is the editing layer over that, and the export.
//
// TWO CAMERAS, AND THE DEFAULT IS THE STILL ONE
//
// A match camera is a moving target: it frames the fighters, so it zooms and
// pans while you are trying to drag a platform, and the thing under the cursor
// moves as you reach for it. So EDITING MODE pins the camera at the furthest
// the game ever pulls back (camera.js ZOOM_MIN) and leaves it there — a
// constant frame showing the most board there is to see. Turn editing off and
// the game's own camera takes over, which is how you answer "does it FEEL
// right" as opposed to "is it in the right place".
//
// AUTHORED NUMBERS, NOT RUNTIME ONES
//
// `stages.js` multiplies every platform's thickness by ART_SCALE in place, so
// the live table's `h` is not the number anybody typed. This bench edits
// `AUTHORED_STAGES` — the copy taken before that pass — and rebuilds the
// runtime platforms from it with the same rule, so what you export is what
// belongs in `stages.js` and a round trip cannot quietly shave every slab.
import { state } from "../src/state.js";
import { loadCoreAssets, startBackgroundLoad, ensureMatchAssets } from "../src/assets.js";
import { initInput, readGamepads, endInputFrame, playerInput, blankInput,
         connectedPadCount } from "../src/input.js";
import { advanceWorld, stepWorld, makeLatch, resetFrameClock } from "../src/sim.js";
import { makeFighter } from "../src/fighter.js";
import { draw } from "../src/render.js";
import { applyCamera, releaseCamera, ZOOM_MIN } from "../src/camera.js";
import { AUTHORED_STAGES, mainPlatform, spawnPlatform, spawnSpot } from "../src/stages.js";
import { initStageFx } from "../src/stage_fx.js";
import { CHARACTERS, CHARACTER_KEYS, characterName } from "../src/characters.js";
import { ART_SCALE } from "../src/config_tuning.js";
import { WORLD, BLAST, GRAVITY, AIR_JUMP_MULT } from "../src/constants.js";
import { clamp } from "../src/utils.js";

const root = document.getElementById("arenaRoot");
const url = new URL(window.location.href);

// The kinds a platform can be, and what each one means to the game. Straight
// from what fighter.js actually tests for, so this list cannot drift from the
// behaviour: "main" is the ground and the only thing with grabbable ledges,
// "side"/"top" are drop-through slivers, and "wall" is the one piece of stage
// that blocks sideways movement.
const KINDS = [
  { key: "main", label: "main — the lowest ground, grabbable ledges, never drop-through" },
  { key: "spawn", label: "spawn — the tier a match opens on (one per board)" },
  { key: "side", label: "side — drop-through platform" },
  { key: "top", label: "top — drop-through platform (highest tier by convention)" },
  { key: "wall", label: "wall — blocks sideways movement, walkable on top" },
];

// A platform's default thickness for its kind. `main` is the ground and reads
// heavy; a wall's number is how TALL the obstacle is, which is collision rather
// than slab art (stages.js exempts it from the ART_SCALE pass).
const KIND_H = { main: 42, spawn: 15, side: 15, top: 15, wall: 130 };

// A new platform starts as a contestable drop-through: ~3 body widths, the
// width docs/level-design-review.md calls the floor for a platform two people
// are meant to fight over.
const NEW_PLATFORM = { w: 210, h: 15, kind: "side" };

/** How high this fighter gets on a full jump — the ground hop plus every air
 *  jump they own, each at AIR_JUMP_MULT. Rise is v²/2g. */
function fullJump(key) {
  const st = CHARACTERS[key]?.stats;
  if (!st?.jump) return Infinity;
  const rise = (v) => (v * v) / (2 * GRAVITY);
  return rise(st.jump) + (st.airJumps || 0) * rise(st.jump * AIR_JUMP_MULT);
}

/** THE FIGHTER A BOARD SHOULD BE TESTED WITH: the one who reaches least far.
 *
 *  A layout is only as good as its worst case — if the shortest jumper in the
 *  roster can get everywhere, everyone can, and if they cannot then the board
 *  has a hole in it that a tall jumper will hide from you. Gakuganji and Tengen
 *  are the pair at the bottom today (impulse 780, one air jump, 239px of full
 *  reach against Uro's 434), but this is derived rather than named so it stays
 *  true when somebody re-tunes a stat. */
const weakestJumper = () =>
  CHARACTER_KEYS.reduce((a, b) => (fullJump(b) < fullJump(a) ? b : a), CHARACTER_KEYS[0]);

const bench = {
  stageKey: url.searchParams.get("stage") || AUTHORED_STAGES[0].key,
  charKey: url.searchParams.get("char") || weakestJumper(),
  editing: url.searchParams.get("editing") !== "off",
  // A multiplier on the pinned editing zoom. 1 is the game's own furthest
  // pull-back; below 1 reaches past it to the blast lines, which is the only
  // reason to touch it — see the guides drawn in editing mode.
  view: 1,
  arena: null,       // the authored board being edited
  // WHAT IS SELECTED, as indices into arena.platforms. An array rather than one
  // index because a board is edited in groups as often as one piece at a time —
  // both halves of a split floor move together or they are not a floor.
  sel: [],
  drag: null,
  marquee: null,     // { x0, y0, x1, y1 } while rubber-banding
  clip: null,        // the copied platforms, as authored shapes
  past: [],          // undo stack of whole-board snapshots
  future: [],
  loading: false,
  fps: 0,
  // Which side panels are folded away. In the URL with everything else, so a
  // link to a board carries the layout you were looking at it in.
  panes: {
    left: url.searchParams.get("left") !== "off",
    right: url.searchParams.get("right") !== "off",
  },
};

// How many boards back the undo stack remembers. Snapshots are a handful of
// small objects, so this is generous on purpose: running out of undo is a much
// worse experience than the memory it costs.
const HISTORY_MAX = 100;

// ------------------------------------------------------------------- the shell
root.innerHTML = `
  <header class="bar">
    <strong>Arena Bench</strong>
    <span class="hint">Drag the platforms, drive a fighter over them, export the numbers.
      Runs the game's own step and renderer.</span>
    <nav class="modes">
      <a href="?edit=character">Character →</a>
      <a href="?edit=cards">Cards →</a>
      <a href="../index.html">Play →</a>
    </nav>
    <button id="arenaExport" class="ghost ghost--go" type="button"
            title="Download this board as JSON, with a ready-to-paste src/stages.js line inside it">⭳ Export arena</button>
  </header>
  <div class="arenabench" id="benchGrid">
    <aside class="arenas pane" id="arenaPane">
      <button class="pane__grip" id="leftToggle" type="button"
              title="Hide the board list (more room for the picture)"
              aria-label="Hide the board list" aria-expanded="true">‹</button>
      <div class="pane__body">
      <div class="arenas__head">
        <label class="arenas__search">
          <input id="arenaFilter" type="search" placeholder="Filter…" autocomplete="off">
        </label>
        <p class="arenas__hint">Unsaved edits are lost when you switch board</p>
      </div>
      <ul id="arenaList" class="arenas__list" role="listbox"></ul>
      </div>
    </aside>

    <section class="viewer">
      <div class="viewer__stage" id="arenaStage">
        <!-- The frame is sized in JS to the largest 16:9 box that fits the
             space (layoutCanvas). The canvas fills it, so the world's aspect
             is never stretched — a squashed board is a board you cannot judge
             the layout of, which is the one thing this bench is for. -->
        <div class="viewer__frame" id="arenaFrame">
          <!-- tabindex so the canvas can hold the keyboard. Clicking it calls
               preventDefault (to stop the drag becoming a text selection), and
               preventDefault also suppresses the browser's focus change — so
               without this, a click on the board left the caret in whichever
               property field was last touched and every Delete, Ctrl+Z and
               Ctrl+C after it went to that field instead of to the editor. -->
          <canvas id="arenaCanvas" width="1280" height="720" tabindex="-1"></canvas>
          <div class="viewer__overlay" id="arenaOverlay"></div>
        </div>
      </div>
      <div class="viewer__foot">
        <label class="toggle" title="On: the camera is pinned at the furthest the game ever pulls back and never moves, so what you are dragging holds still. Off: the game's own framing camera takes over, which is how the board FEELS in a match.">
          <input type="checkbox" id="editingToggle"> editing mode
        </label>
        <button class="ghost" id="addPlatform" type="button" title="Add a drop-through platform in the middle of the view">＋ platform</button>
        <button class="ghost" id="delPlatform" type="button" title="Remove the selected platforms (or press Delete)">🗑 delete</button>
        <button class="ghost" id="undoBtn" type="button" title="Undo (Ctrl+Z)">↶</button>
        <button class="ghost" id="redoBtn" type="button" title="Redo (Ctrl+Shift+Z, or Ctrl+Y)">↷</button>
        <button class="ghost" id="resetArena" type="button" title="Throw away every edit and reload this board as it ships">↺ revert</button>
        <label class="toggle zoom" title="A multiplier on the pinned editing camera. 1 is the game's furthest pull-back; below 1 reaches past it so you can drag a platform out toward the blast lines.">view
          <input type="range" id="viewRange" min="0.5" max="1.15" step="0.01">
          <span id="viewValue"></span>
        </label>
        <select id="charPick" class="dummyPick" title="Who you are driving. Defaults to the roster's WEAKEST jumper, because a board is only as good as its worst case: if they can get everywhere, everyone can."></select>
        <span class="viewer__reach" id="charReach" title="This fighter's full jump — the ground hop plus every air jump they own. The reach panel judges hops against the weakest of these."></span>
        <span class="viewer__pads" id="arenaPads"></span>
        <span class="viewer__hist" id="arenaHistory" title="Undo steps held. An edit is one step whatever it touched — a drag that moved eight platforms undoes in one.">0 undo · 0 redo</span>
        <span class="viewer__fps" id="arenaFps"></span>
      </div>
    </section>

    <aside class="props pane" id="propsPane">
      <button class="pane__grip" id="rightToggle" type="button"
              title="Hide the properties panel (more room for the picture)"
              aria-label="Hide the properties panel" aria-expanded="true">›</button>
      <div class="pane__body">
      <h2>Platform</h2>
      <p class="sub" id="propsNone">Click a platform, or drag a box around several.</p>
      <div id="propsBody" hidden>
        <label class="field">kind
          <select id="pKind"></select>
        </label>
        <div class="field-row">
          <label class="field">x <input id="pX" type="number" step="1"></label>
          <label class="field">y <input id="pY" type="number" step="1"></label>
        </div>
        <div class="field-row">
          <label class="field">w <input id="pW" type="number" step="1" min="8"></label>
          <label class="field">h <input id="pH" type="number" step="1" min="1"></label>
        </div>
        <p class="sub" id="pThickness"></p>
      </div>

      <h2>Board</h2>
      <label class="field">name <input id="aName" type="text"></label>
      <label class="toggle" title="Stage gimmicks — hazards and moving platforms (src/stage_fx.js). Off while editing by default: several boards MOVE their platforms, which fights the thing you are dragging.">
        <input type="checkbox" id="fxToggle"> active boards (hazards)
      </label>
      <label class="field" title="Scales gravity for the whole match. Domain Core floats at 0.88.">gravity ×
        <input id="mGravity" type="number" step="0.01" min="0.4" max="1.6">
      </label>
      <label class="field" title="Exponent on ground friction. Below 1 is slick — Sunken Crossing's flooded street is 0.35.">friction ^
        <input id="mFriction" type="number" step="0.01" min="0.05" max="2">
      </label>
      <label class="field" title="The colour wash laid over the backdrop, as CSS rgba().">tint
        <input id="aTint" type="text">
      </label>

      <h2>Reach</h2>
      <p class="sub" id="reachOut">—</p>

      <h2>Keys</h2>
      <ul class="keys">
        <li><kbd>click</kbd> select · <kbd>shift</kbd>+click add</li>
        <li><kbd>drag</kbd> on empty space marquees</li>
        <li><kbd>ctrl</kbd>+<kbd>A</kbd> all · <kbd>esc</kbd> none</li>
        <li><kbd>ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copy, paste · <kbd>ctrl</kbd>+<kbd>D</kbd> duplicate</li>
        <li><kbd>ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>ctrl</kbd>+<kbd>shift</kbd>+<kbd>Z</kbd> redo</li>
        <li><kbd>del</kbd> remove the selection</li>
        <li><kbd>[</kbd> / <kbd>]</kbd> hide either side panel</li>
      </ul>
      </div>
    </aside>
  </div>`;

const canvas = document.getElementById("arenaCanvas");
const ctx = canvas.getContext("2d");
const overlayEl = document.getElementById("arenaOverlay");
const gridEl = document.getElementById("benchGrid");
const stageEl = document.getElementById("arenaStage");
const frameEl = document.getElementById("arenaFrame");
const listEl = document.getElementById("arenaList");
const filterEl = document.getElementById("arenaFilter");
const editingEl = document.getElementById("editingToggle");
const viewEl = document.getElementById("viewRange");
const viewValueEl = document.getElementById("viewValue");
const charPickEl = document.getElementById("charPick");
const charReachEl = document.getElementById("charReach");
const padEl = document.getElementById("arenaPads");
const fpsEl = document.getElementById("arenaFps");
const historyEl = document.getElementById("arenaHistory");
const exportEl = document.getElementById("arenaExport");
const leftToggleEl = document.getElementById("leftToggle");
const rightToggleEl = document.getElementById("rightToggle");
const propsNoneEl = document.getElementById("propsNone");
const propsBodyEl = document.getElementById("propsBody");
const thickEl = document.getElementById("pThickness");
const reachEl = document.getElementById("reachOut");
const fxEl = document.getElementById("fxToggle");
// True while a burst of typing in one property field is still one undo step.
let fieldDirty = false;

const fields = {
  kind: document.getElementById("pKind"),
  x: document.getElementById("pX"), y: document.getElementById("pY"),
  w: document.getElementById("pW"), h: document.getElementById("pH"),
  name: document.getElementById("aName"), tint: document.getElementById("aTint"),
  gravity: document.getElementById("mGravity"), friction: document.getElementById("mFriction"),
};

// input.js listens on WINDOW and preventDefaults every code the game binds —
// which is most of the letters. Any keystroke that reaches it from a field in
// this panel would both fail to type and drive the fighter, so the fields
// swallow their own keys before they ever get there.
for (const el of [filterEl, ...Object.values(fields)]) {
  el.addEventListener("keydown", (e) => e.stopPropagation());
  el.addEventListener("keyup", (e) => e.stopPropagation());
}

/**
 * THE PICTURE KEEPS THE WORLD'S SHAPE.
 *
 * The game is 1280x720 and it has to be LOOKED at as 1280x720: this bench
 * exists to judge where a platform sits, and a board stretched to whatever
 * shape the window left over is a board you cannot judge. The canvas used to
 * fill its box and take its transform as `width/1280` by `height/720` — two
 * independent scales — so every non-16:9 box quietly squashed the world. The
 * `object-fit: contain` in the stylesheet could never help: the bitmap was
 * always sized to match the box exactly, so there was nothing left to fit.
 *
 * So the FRAME is sized here to the largest 16:9 box that fits the space, the
 * canvas fills that, and the transform is ONE scale on both axes. Whatever the
 * panels are doing, the picture is the right shape and as large as it can be.
 */
function layoutCanvas() {
  const box = stageEl.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const fit = Math.min(box.width / WORLD.w, box.height / WORLD.h);
  frameEl.style.width = `${WORLD.w * fit}px`;
  frameEl.style.height = `${WORLD.h * fit}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(WORLD.w * fit * dpr));
  canvas.height = Math.max(1, Math.round(WORLD.h * fit * dpr));
  // ONE scale, taken from the width and used for both axes. Rounding the
  // bitmap to whole device pixels can leave the two ratios a thousandth apart,
  // and "a thousandth of a squash" is still the bug this is here to prevent.
  const s = canvas.width / WORLD.w;
  ctx.setTransform(s, 0, 0, s, 0, 0);
}
window.addEventListener("resize", layoutCanvas);
// The panels collapsing changes the space without the WINDOW changing size, and
// so does anything else that reflows the page. Watching the box itself catches
// every one of them, including the frame the CSS transition passes through.
if (typeof ResizeObserver === "function") {
  new ResizeObserver(layoutCanvas).observe(stageEl);
}

// ------------------------------------------------------- the board, and the game
//
// The bench's model is AUTHORED (see the header). Everything the game touches
// is rebuilt from it, with the one rule stages.js applies: thickness follows
// the roster, except on a wall, whose height is collision rather than slab art.

const runtimeOf = (p) => ({
  ...p,
  h: p.kind === "wall" ? p.h : Math.max(6, Math.round(p.h * ART_SCALE)),
});

/** Push the edited board into the live world. Called after every edit rather
 *  than every frame, so Active Boards' moving platforms are free to move. */
function syncPlatforms() {
  state.platforms = bench.arena.platforms.map(runtimeOf);
  paintEdited();
  // The fighter holds a reference to the platform they are standing on, and
  // the array it came from has just been replaced. resolvePlatforms reassigns
  // it on the next step; this stops the one frame in between reading a shape
  // that is no longer part of the board.
  for (const f of state.fighters) f.currentPlatform = null;
  paintReach();
}

/** Re-arm the stage's gimmicks and field modifiers from the EDITED board.
 *  `initStageFx` reads the shipped table, so the bench's own mods are written
 *  over the top of whatever it set. */
function syncStageFx() {
  // Stage fx are the entities with no owner; drop the previous board's before
  // arming this one, or every toggle would stack another copy.
  state.entities = state.entities.filter((e) => e.owner !== null);
  initStageFx();
  const mods = bench.arena.mods || {};
  state.stageMods.gravityMul = mods.gravityMul ?? 1;
  state.stageMods.frictionPow = mods.frictionPow ?? 1;
}

// ------------------------------------------------------------------- history
//
// Undo over the AUTHORED board, snapshotted whole. A board is a few dozen small
// objects, so a snapshot is cheaper than tracking deltas and cannot drift out
// of step with what is on screen the way a delta log can — every edit path,
// including a drag that touched twelve platforms, gets undo for free by calling
// `commit()` once before it starts.

const snapshot = () => JSON.stringify({
  name: bench.arena.name, tint: bench.arena.tint,
  mods: bench.arena.mods, platforms: bench.arena.platforms,
});

/** Remember the board as it is NOW, before the change you are about to make.
 *  Call it once at the START of an edit — on pointerdown for a drag, not on
 *  every frame of one — so undo steps land on whole gestures. */
function commit() {
  bench.past.push(snapshot());
  if (bench.past.length > HISTORY_MAX) bench.past.shift();
  // A new edit is a new branch: whatever was redone away is gone.
  bench.future.length = 0;
  paintHistory();
}

function restore(json) {
  const b = JSON.parse(json);
  bench.arena.name = b.name;
  bench.arena.tint = b.tint;
  bench.arena.mods = b.mods;
  bench.arena.platforms = b.platforms;
  // Indices that no longer exist are dropped rather than left dangling: an
  // undo that removed platforms must not leave the panel editing a hole.
  bench.sel = bench.sel.filter((i) => i < bench.arena.platforms.length);
  syncPlatforms();
  paintProps();
  paintBoard();
  paintHistory();
}

function undo() {
  if (!bench.past.length) return flash("nothing to undo");
  bench.future.push(snapshot());
  restore(bench.past.pop());
}

function redo() {
  if (!bench.future.length) return flash("nothing to redo");
  bench.past.push(snapshot());
  restore(bench.future.pop());
}

function paintHistory() {
  historyEl.textContent = `${bench.past.length} undo · ${bench.future.length} redo`;
}

/** Keep the board list's change marks and the export button honest about how
 *  much work is waiting to come out. */
function paintEdited() {
  const n = editedBoards().length;
  exportEl.textContent = n > 1 ? `⭳ Export ${n} boards` : "⭳ Export arena";
  exportEl.title = n > 1
    ? `Download all ${n} changed boards as one JSON, with paste-ready src/stages.js lines`
    : "Download this board as JSON, with a ready-to-paste src/stages.js line inside it";
  for (const li of listEl.querySelectorAll(".arena")) {
    li.classList.toggle("is-edited", isEdited(li.dataset.stage));
    const b = li.querySelector("b");
    const has = !!b.querySelector(".dot");
    if (isEdited(li.dataset.stage) === has) continue;
    if (has) b.querySelector(".dot").remove();
    else b.insertAdjacentHTML("beforeend", '<i class="dot" title="changed from what ships">●</i>');
  }
}

// EVERY BOARD YOU HAVE TOUCHED, KEPT AS YOU LEFT IT.
//
// Switching boards used to rebuild the new one from the shipped table and throw
// the old one away, so an afternoon's work on Billboard Roof vanished the
// moment you looked at Empty City. A bench you cannot leave is a bench you
// cannot compare anything in — and comparing is most of what laying out a set
// of boards IS.
//
// So each board gets its own entry the first time it is opened, and keeps it:
// the arena, and its own undo and redo stacks, because "undo" after switching
// back has to mean the last thing you did TO THAT BOARD.
//
// The CLIPBOARD is deliberately not in here. It is global, and it survives a
// switch on purpose: copying a ledge arrangement off one board and pasting it
// onto another is the whole reason a bench has a clipboard rather than a
// duplicate button.
const boards = new Map();

function boardState(key) {
  let b = boards.get(key);
  if (!b) {
    b = { arena: authored(key), past: [], future: [] };
    boards.set(key, b);
  }
  return b;
}

/** Has this board been changed from what ships? Compared on the authored
 *  numbers, so moving a platform and moving it back leaves nothing behind. */
function isEdited(key) {
  const b = boards.get(key);
  if (!b) return false;
  return JSON.stringify(b.arena) !== JSON.stringify(authored(key));
}

/** Every board that differs from what ships, in table order. */
function editedBoards() {
  return AUTHORED_STAGES.map((a) => a.key).filter(isEdited);
}

function authored(key) {
  const s = AUTHORED_STAGES.find((a) => a.key === key) || AUTHORED_STAGES[0];
  return {
    key: s.key, name: s.name, bgFile: s.bgFile, tint: s.tint,
    mods: s.mods ? { ...s.mods } : {},
    platforms: s.platforms.map((p) => ({ ...p })),
  };
}

async function loadArena(key) {
  bench.stageKey = key;
  // The board as YOU left it, with its own history. First visit builds it from
  // the shipped table; every visit after that is where you were.
  const b = boardState(key);
  bench.arena = b.arena;
  bench.past = b.past;
  bench.future = b.future;
  bench.sel = [];
  // bench.clip is NOT cleared — see the note on `boards`.
  bench.loading = true;
  overlayEl.textContent = "Loading…";
  overlayEl.classList.add("is-on");
  state.stageKey = key;
  syncPlatforms();
  await ensureMatchAssets([bench.charKey], key);
  syncStageFx();
  spawnFighter();
  bench.loading = false;
  overlayEl.classList.remove("is-on");
  renderList();
  paintProps();
  paintBoard();
  paintHistory();
  const next = new URL(window.location.href);
  next.searchParams.set("stage", key);
  history.replaceState(null, "", next);
}

/** Stand the driven fighter where a MATCH would start them — the board's
 *  spawn tier, through the game's own rule (stages.js spawnSpot) — rather than
 *  on the lowest ground. The bench had its own copy of this and stood everybody
 *  on the floor, which made a tiered board look like it opened a storey below
 *  where it really does. */
function benchSpawn() {
  const tier = spawnPlatform(state.platforms);
  return spawnSpot(state.platforms, tier.x + tier.w / 2);
}

function spawnFighter() {
  const at = benchSpawn();
  const f = makeFighter(1, bench.charKey, at.x, 1);
  f.y = at.y;
  f.grounded = true;
  state.fighters = [f];
}

/** The fighter is standing on a board somebody is editing out from under them.
 *  Put them back rather than letting them fall out of the world forever. */
function keepOnStage() {
  const f = state.fighters[0];
  if (!f) return;
  if (f.y < BLAST.bottom && f.x > BLAST.left && f.x < BLAST.right && f.y > BLAST.top) return;
  const at = benchSpawn();
  f.x = at.x;
  f.y = at.y;
  f.vx = 0; f.vy = 0; f.grounded = true; f.hitstun = 0; f.action = null;
}

// ------------------------------------------------------------------ the list
function visibleArenas() {
  const q = filterEl.value.trim().toLowerCase();
  if (!q) return AUTHORED_STAGES;
  return AUTHORED_STAGES.filter((s) => s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q));
}

function renderList() {
  listEl.innerHTML = "";
  for (const s of visibleArenas()) {
    const li = document.createElement("li");
    const edited = isEdited(s.key);
    li.className = "arena" + (s.key === bench.stageKey ? " is-on" : "") + (edited ? " is-edited" : "");
    li.dataset.stage = s.key;
    li.setAttribute("role", "option");
    // Counts come from the board AS EDITED once you have opened it, so the list
    // is a summary of your work rather than of what shipped.
    const live = boards.get(s.key)?.arena || s;
    const plats = live.platforms.length;
    const main = live.platforms.find((p) => p.kind === "main") || live.platforms[0];
    const walls = live.platforms.filter((p) => p.kind === "wall").length;
    li.innerHTML = `<b>${s.name}${edited ? '<i class="dot" title="changed from what ships">●</i>' : ""}</b>`
      + `<span>${plats} platform${plats === 1 ? "" : "s"}`
      + ` · main ${main.w}w${walls ? ` · ${walls} wall${walls === 1 ? "" : "s"}` : ""}</span>`;
    li.addEventListener("click", () => { if (s.key !== bench.stageKey) loadArena(s.key); });
    listEl.appendChild(li);
  }
}
filterEl.addEventListener("input", renderList);

// --------------------------------------------------------------- the camera
//
// Editing pins the frame; playing hands it back to the game.

function pinCamera() {
  const cam = state.camera;
  cam.zoom = ZOOM_MIN * bench.view;
  cam.x = WORLD.w / 2;
  cam.y = WORLD.h / 2;
  cam.shake = 0;
  // So the game's camera starts from a sane place the moment editing is turned
  // off, rather than easing in from the pinned shot.
  cam.aimX = null; cam.aimY = null; cam.aimZoom = null;
}

/** World point under a client point, through whatever the camera currently is. */
function toWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  const cam = state.camera;
  const ux = ((ev.clientX - rect.left) / rect.width) * WORLD.w;
  const uy = ((ev.clientY - rect.top) / rect.height) * WORLD.h;
  return {
    x: (ux - WORLD.w / 2) / cam.zoom + cam.x,
    y: (uy - WORLD.h / 2) / cam.zoom + cam.y,
  };
}

// ------------------------------------------------------------- hit testing
//
// A platform is a rect from its top surface down by its RUNTIME thickness —
// what is actually drawn — so what you can click is what you can see. The grab
// margin is constant in SCREEN px, so a handle is the same size to the hand
// however far the view is pulled out.
const grabPx = () => 11 / state.camera.zoom;

function rectOf(i) {
  const p = bench.arena.platforms[i];
  const r = runtimeOf(p);
  return { x: r.x, y: r.y, w: r.w, h: Math.max(r.h, 10) };
}

/** How wide a grab zone this platform can afford on each edge.
 *
 *  A quarter of the width, capped at the ordinary margin — because two full
 *  margins do not FIT on a narrow platform, and when they do not fit they eat
 *  it whole. A 30px wall at editing zoom left a 1.8px band in the middle where
 *  "move" was reachable, which is why a wall could be resized all day and never
 *  picked up. Reserving half the width for the body means every platform, at
 *  any zoom, can always be dragged. */
function edgeGrab(r) {
  return Math.min(grabPx(), r.w / 4);
}

/** Which handle of platform `i` is under this point, if any. */
function handleAt(i, w) {
  const m = grabPx();
  const r = rectOf(i);
  if (w.y < r.y - m || w.y > r.y + r.h + m) return null;
  if (w.x < r.x - m || w.x > r.x + r.w + m) return null;
  const e = edgeGrab(r);
  if (Math.abs(w.x - r.x) <= e) return { i, part: "left" };
  if (Math.abs(w.x - (r.x + r.w)) <= e) return { i, part: "right" };
  if (bench.arena.platforms[i].kind === "wall"
      && Math.abs(w.y - (r.y + r.h)) <= Math.min(m, r.h / 3)) {
    return { i, part: "bottom" };
  }
  return null;
}

/** What is under this world point: an index and which part of it was hit. */
function pick(w) {
  const m = grabPx();
  // THE SELECTION'S OWN HANDLES COME FIRST.
  //
  // Reaching for a grip on the thing you just selected must not hand you a
  // different platform because that one happens to be drawn later and overlaps
  // the grip — a wall standing on a shelf puts its handles right on top of that
  // shelf. Once something is picked, its grips own their few pixels; the body
  // underneath is still up for grabs, so clicking INTO another platform still
  // selects it.
  if (bench.sel.length === 1) {
    const own = handleAt(bench.sel[0], w);
    if (own) return own;
  }
  // Last first: later platforms are drawn over earlier ones, so they are the
  // ones the eye thinks it is pointing at.
  for (let i = bench.arena.platforms.length - 1; i >= 0; i--) {
    const r = rectOf(i);
    if (w.y < r.y - m || w.y > r.y + r.h + m) continue;
    if (w.x < r.x - m || w.x > r.x + r.w + m) continue;
    const e = edgeGrab(r);
    if (Math.abs(w.x - r.x) <= e) return { i, part: "left" };
    if (Math.abs(w.x - (r.x + r.w)) <= e) return { i, part: "right" };
    // A WALL'S HEIGHT IS ITS REACH, so it gets a handle for it. On everything
    // else `h` is slab thickness — a drawing decision the ART_SCALE pass owns
    // (stages.js) — and dragging it by accident while reaching for the body
    // would be a change nobody asked for. The numeric field still edits it.
    if (bench.arena.platforms[i].kind === "wall"
        && Math.abs(w.y - (r.y + r.h)) <= Math.min(m, r.h / 3)) {
      return { i, part: "bottom" };
    }
    return { i, part: "move" };
  }
  return null;
}

// ----------------------------------------------------------------- dragging
canvas.addEventListener("pointerdown", (ev) => {
  if (!bench.editing || !bench.arena) return;
  const w = toWorld(ev);
  const hit = pick(w);
  const additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;

  if (!hit) {
    // Empty space starts a MARQUEE. Additive keeps what is already picked, so a
    // group can be built up out of several sweeps.
    if (!additive) setSelection([]);
    bench.marquee = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, add: additive };
    canvas.setPointerCapture(ev.pointerId);
    canvas.focus({ preventScroll: true });
    ev.preventDefault();
    return;
  }

  if (additive) toggleSelected(hit.i);
  else if (!bench.sel.includes(hit.i)) setSelection([hit.i]);
  // Clicking one of an existing group KEEPS the group, so dragging moves all of
  // it — picking a member must not be a way to accidentally lose the rest.

  // A resize only ever means one platform. With a group picked the handles are
  // not drawn, so any drag from inside it is a move.
  const part = bench.sel.length === 1 ? hit.part : "move";
  const p = bench.arena.platforms[hit.i];
  commit();
  bench.drag = {
    part, i: hit.i, ox: w.x - p.x, oy: w.y - p.y, w0: p.w, x0: p.x,
    // Where every selected platform started, so a group move is one offset
    // applied to all of them rather than a chain of relative nudges.
    from: bench.sel.map((i) => ({ i, x: bench.arena.platforms[i].x, y: bench.arena.platforms[i].y })),
    moved: false,
  };
  canvas.setPointerCapture(ev.pointerId);
  canvas.focus({ preventScroll: true });
  ev.preventDefault();
});

canvas.addEventListener("pointermove", (ev) => {
  if (!bench.editing || !bench.arena) return;
  const w = toWorld(ev);

  if (bench.marquee) {
    bench.marquee.x1 = w.x;
    bench.marquee.y1 = w.y;
    return;
  }
  if (!bench.drag) {
    const hit = pick(w);
    canvas.style.cursor = !hit ? "default"
      : hit.part === "move" || bench.sel.length > 1 ? "move"
      : hit.part === "bottom" ? "ns-resize" : "ew-resize";
    return;
  }

  const d = bench.drag;
  d.moved = true;
  if (d.part === "move") {
    // ONE offset, applied to where each platform started. Nudging each shape by
    // a per-frame delta instead would let rounding accumulate differently for
    // each of them, and a group would slowly shear apart as you dragged it.
    const anchor = d.from.find((s) => s.i === d.i);
    const offX = Math.round(w.x - d.ox) - anchor.x;
    const offY = Math.round(w.y - d.oy) - anchor.y;
    for (const s of d.from) {
      const q = bench.arena.platforms[s.i];
      if (!q) continue;
      q.x = s.x + offX;
      q.y = s.y + offY;
    }
  } else if (d.part === "left") {
    // The RIGHT edge is what stays put when you pull the left one.
    const p = bench.arena.platforms[d.i];
    const right = d.x0 + d.w0;
    const x = Math.min(Math.round(w.x), right - 8);
    p.x = x;
    p.w = right - x;
  } else if (d.part === "bottom") {
    // Down from the TOP surface, which is the edge everything stands on and
    // the one number a wall must not move while it is being made taller.
    const p = bench.arena.platforms[d.i];
    p.h = Math.max(8, Math.round(w.y - p.y));
  } else {
    const p = bench.arena.platforms[d.i];
    p.w = Math.max(8, Math.round(w.x - p.x));
  }
  syncPlatforms();
  paintProps();
});

function endDrag() {
  if (bench.marquee) {
    const m = bench.marquee;
    bench.marquee = null;
    const lo = { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1) };
    const hi = { x: Math.max(m.x0, m.x1), y: Math.max(m.y0, m.y1) };
    // A click that never moved is a click on nothing, not an empty marquee.
    if (hi.x - lo.x < 4 && hi.y - lo.y < 4) return;
    const caught = [];
    for (let i = 0; i < bench.arena.platforms.length; i++) {
      const r = rectOf(i);
      // TOUCHED, not enclosed: sweeping across a 1500px floor to catch it
      // would otherwise mean starting the sweep off the edge of the board.
      if (r.x + r.w >= lo.x && r.x <= hi.x && r.y + r.h >= lo.y && r.y <= hi.y) caught.push(i);
    }
    setSelection(m.add ? [...new Set([...bench.sel, ...caught])] : caught);
    return;
  }
  if (bench.drag && !bench.drag.moved) {
    // A press that never moved changed nothing, so it should not cost an undo.
    bench.past.pop();
    paintHistory();
  }
  bench.drag = null;
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// ------------------------------------------------------------- selection/props
function setSelection(list) {
  bench.sel = [...new Set(list)].filter((i) => i >= 0 && i < bench.arena.platforms.length);
  paintProps();
}

function toggleSelected(i) {
  setSelection(bench.sel.includes(i) ? bench.sel.filter((j) => j !== i) : [...bench.sel, i]);
}

/** The one selected platform, or null when none or several are. The property
 *  fields edit a single shape; a group is moved, copied and deleted instead. */
function onlySelected() {
  return bench.arena && bench.sel.length === 1 ? bench.arena.platforms[bench.sel[0]] : null;
}

function paintProps() {
  const p = onlySelected();
  const many = bench.sel.length > 1;
  propsNoneEl.hidden = !!p;
  propsBodyEl.hidden = !p;
  if (many) {
    propsNoneEl.textContent = `${bench.sel.length} platforms selected — drag to move them, `
      + `Ctrl+C / Ctrl+V to copy, Delete to remove.`;
  } else if (!p) {
    propsNoneEl.textContent = "Click a platform, or drag a box around several.";
  }
  if (!p) return;
  fields.kind.value = p.kind;
  fields.x.value = String(p.x);
  fields.y.value = String(p.y);
  fields.w.value = String(p.w);
  fields.h.value = String(p.h);
  const drawn = runtimeOf(p).h;
  thickEl.textContent = p.kind === "wall"
    ? `drawn ${drawn}px tall — a wall keeps its authored height`
    : `drawn ${drawn}px thick (authored ${p.h} × ART_SCALE ${ART_SCALE})`;
}

function paintBoard() {
  const a = bench.arena;
  fields.name.value = a.name;
  fields.tint.value = a.tint || "";
  fields.gravity.value = String(a.mods.gravityMul ?? 1);
  fields.friction.value = String(a.mods.frictionPow ?? 1);
  fxEl.checked = !!state.activeBoards;
}

fields.kind.innerHTML = KINDS.map((k) => `<option value="${k.key}">${k.label}</option>`).join("");
fields.kind.addEventListener("change", () => {
  const p = onlySelected();
  if (!p) return;
  commit();
  const was = p.kind;
  p.kind = fields.kind.value;
  // A wall's height is collision and a slab's is art, so the sensible default
  // thickness is different for each. Only nudged when the height still IS the
  // old kind's default, so a number somebody chose is never overwritten.
  if (p.h === KIND_H[was]) p.h = KIND_H[p.kind] ?? p.h;
  syncPlatforms();
  paintProps();
});

for (const key of ["x", "y", "w", "h"]) {
  // One undo step per burst of typing rather than per keystroke: a field being
  // edited coalesces until focus leaves it or another kind of edit happens.
  fields[key].addEventListener("focus", () => { fieldDirty = false; });
  fields[key].addEventListener("input", () => {
    const p = onlySelected();
    if (!p) return;
    if (!fieldDirty) { commit(); fieldDirty = true; }
    const v = Number(fields[key].value);
    if (!Number.isFinite(v)) return;
    p[key] = key === "w" ? Math.max(8, Math.round(v))
      : key === "h" ? Math.max(1, Math.round(v)) : Math.round(v);
    syncPlatforms();
    paintProps();
  });
}

fields.name.addEventListener("input", () => { bench.arena.name = fields.name.value; });
fields.tint.addEventListener("input", () => {
  bench.arena.tint = fields.tint.value;
  // The tint is read off the SHIPPED stage by the renderer, so the live table's
  // copy is what has to change for the picture to follow the field.
  const live = AUTHORED_STAGES.find((s) => s.key === bench.stageKey);
  if (live) live.tint = fields.tint.value;
});
for (const [key, mod] of [["gravity", "gravityMul"], ["friction", "frictionPow"]]) {
  fields[key].addEventListener("input", () => {
    const v = Number(fields[key].value);
    if (!Number.isFinite(v) || v <= 0) return;
    bench.arena.mods[mod] = v;
    state.stageMods[mod] = v;
  });
}

fxEl.addEventListener("change", () => {
  state.activeBoards = fxEl.checked;
  syncPlatforms();
  syncStageFx();
});

// ------------------------------------------------------------- add / delete
document.getElementById("addPlatform").addEventListener("click", () => {
  const cam = state.camera;
  const p = {
    x: Math.round(cam.x - NEW_PLATFORM.w / 2),
    // Above the ground rather than through it, so a new platform is somewhere
    // you can immediately jump to instead of somewhere buried in the floor.
    y: Math.round(mainPlatform(state.platforms)?.y - 140 || cam.y),
    w: NEW_PLATFORM.w, h: NEW_PLATFORM.h, kind: NEW_PLATFORM.kind,
  };
  commit();
  bench.arena.platforms.push(p);
  syncPlatforms();
  setSelection([bench.arena.platforms.length - 1]);
});

function deleteSelected() {
  if (!bench.sel.length) return;
  const doomed = new Set(bench.sel);
  const mains = bench.arena.platforms.filter((q) => q.kind === "main");
  const losing = mains.filter((q) => doomed.has(bench.arena.platforms.indexOf(q))).length;
  // The main is the ground and the ledges. Losing every one of them does not
  // make an interesting board, it makes a board with no floor.
  if (mains.length && losing >= mains.length) {
    flash("that would leave the board with no main platform — change a kind first");
    return;
  }
  commit();
  // Highest index first, so each splice cannot shift the ones still to go.
  for (const i of [...bench.sel].sort((a, b) => b - a)) bench.arena.platforms.splice(i, 1);
  setSelection([]);
  syncPlatforms();
}
document.getElementById("delPlatform").addEventListener("click", deleteSelected);
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("redoBtn").addEventListener("click", redo);

// ------------------------------------------------------------- copy and paste
//
// The clipboard holds authored SHAPES, not indices — so a copy survives every
// edit made between taking it and pasting it, including deleting the originals.

function copySelected() {
  if (!bench.sel.length) return flash("nothing to copy");
  bench.clip = bench.sel.map((i) => ({ ...bench.arena.platforms[i] }));
  flash(`copied ${bench.clip.length} platform${bench.clip.length === 1 ? "" : "s"}`);
}

// How far a paste lands from what it came from. Enough to see that it is a
// second thing rather than a redraw of the first, and small enough to drag
// where you meant it to go.
const PASTE_OFFSET = 28;

function paste() {
  if (!bench.clip || !bench.clip.length) return flash("nothing to paste");
  commit();
  const at = bench.arena.platforms.length;
  for (const p of bench.clip) {
    bench.arena.platforms.push({ ...p, x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET });
  }
  // The PASTED copies become the selection, so the next drag moves what you
  // just made rather than what you copied it from.
  setSelection(bench.clip.map((_, i) => at + i));
  // ...and the clipboard follows them down, so pasting twice makes a staircase
  // instead of stacking two copies in the same place.
  bench.clip = bench.clip.map((p) => ({ ...p, x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET }));
  syncPlatforms();
}

// One place deciding whether a key belongs to the editor or to whatever has
// focus. A field is typing; the canvas is editing.
const typingIn = (t) => t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");

window.addEventListener("keydown", (e) => {
  if (!bench.editing || !bench.arena) return;
  const mod = e.ctrlKey || e.metaKey;

  // UNDO ANSWERS WHEREVER THE CARET IS. Everything else defers to a focused
  // field, but undo must not: with the caret in a property box the browser
  // takes Ctrl+Z as "undo my typing", restores the old text, and the `input`
  // handler writes THAT back to the platform — so the board appears to undo
  // while the bench's own history sits untouched, and the two drift apart
  // silently. preventDefault stops the text undo; this is the only meaning
  // Ctrl+Z has here.
  if (mod && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
    e.preventDefault();
    // Shift+Z redoes, the chord every editor uses; Ctrl+Y for the hands that
    // learned it the other way.
    if (e.key.toLowerCase() === "y" || e.shiftKey) redo(); else undo();
    return;
  }
  if (typingIn(e.target)) return;
  if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copySelected(); return; }
  if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); paste(); return; }
  if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); copySelected(); paste(); return; }
  if (mod && e.key.toLowerCase() === "a") {
    e.preventDefault();
    setSelection(bench.arena.platforms.map((_, i) => i));
    return;
  }
  if (e.key === "[") { setPane("left", !bench.panes.left); return; }
  if (e.key === "]") { setPane("right", !bench.panes.right); return; }
  if (e.key === "Escape") { setSelection([]); return; }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelected();
  }
});

document.getElementById("resetArena").addEventListener("click", () => {
  commit();
  const fresh = authored(bench.stageKey);
  bench.arena.name = fresh.name;
  bench.arena.tint = fresh.tint;
  bench.arena.mods = fresh.mods;
  bench.arena.platforms = fresh.platforms;
  setSelection([]);
  syncPlatforms();
  paintBoard();
  flash("reverted to the board as it ships");
});

let flashT = 0;
function flash(msg) {
  overlayEl.textContent = msg;
  overlayEl.classList.add("is-on", "is-flash");
  flashT = 2.2;
}

// ---------------------------------------------------------------- the export
//
// What comes out is the line that belongs in src/stages.js, plus the same
// numbers as data. Authored thickness, so it can be pasted without arithmetic.

function stagesJsLine(a) {
  const mods = Object.keys(a.mods || {}).length
    ? `mods: { ${Object.entries(a.mods).map(([k, v]) => `${k}: ${v}`).join(", ")} }, ` : "";
  const plats = a.platforms
    .map((p) => `{ x: ${p.x}, y: ${p.y}, w: ${p.w}, h: ${p.h}, kind: "${p.kind}" }`)
    .join(", ");
  return `  { key: "${a.key}", name: "${a.name}", bgFile: "${a.bgFile}", tint: "${a.tint}", ${mods}platforms: [\n    ${plats}\n  ] },`;
}

/** One board's worth of export, including what the reach panel makes of it. */
function boardPayload(key) {
  const a = boards.get(key).arena;
  return {
    key: a.key, name: a.name, bgFile: a.bgFile, tint: a.tint,
    mods: a.mods, platforms: a.platforms,
    reach: reachReportFor(a),
    stagesJs: stagesJsLine(a),
  };
}

document.getElementById("arenaExport").addEventListener("click", () => {
  // EVERYTHING YOU CHANGED, not just the board you happen to be looking at —
  // the same bargain the audio bench's "Export changes" strikes. A session
  // spent balancing four boards against each other should come out as one file.
  // Nothing changed anywhere? Then export the board on screen, so the button
  // always does the obvious thing rather than refusing.
  const keys = editedBoards();
  const only = keys.length ? null : bench.stageKey;
  const list = (only ? [only] : keys).map(boardPayload);
  const payload = {
    note: "Authored numbers, ready for src/stages.js. `h` is pre-ART_SCALE thickness — the game scales it (walls excepted).",
    boards: list,
    // Every changed board's line, in table order, ready to paste in one go.
    stagesJs: list.map((b) => b.stagesJs).join("\n"),
    // A single-board export also carries that board at the top level, so the
    // common case reads exactly as it always did.
    ...(list.length === 1 ? list[0] : {}),
  };
  const name = list.length === 1 ? `arena-${list[0].key}.json` : `arenas-${list.length}-boards.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  flash(`exported ${name}`);
});

// ------------------------------------------------------------------- reach
//
// The same budget tools/audit_stage_reach.mjs enforces, live: a board you can
// build here but not land in `main` is a board the bench let you waste time on.
// The same budget tools/audit_stage_reach.mjs uses, and for the reasons derived
// there: 235 is the weakest fighter's real full-jump reach (239) less a few
// pixels for landing, and 175 — what the ceiling used to be — is now the point
// where a hop starts needing a deliberate double jump and earns a warning.
const MAX_RISE = 235;
const COMFY_RISE = 175;
const TOP_CAP = 170;
const gapBudget = (rise) => (rise <= 110 ? 220 : rise <= 145 ? 160 : rise <= 175 ? 120 : 90);

function horizontalGap(a, b) {
  if (a.x + a.w >= b.x && b.x + b.w >= a.x) return 0;
  return a.x + a.w < b.x ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
}

const reachReport = () => reachReportFor(bench.arena);

function reachReportFor(arena) {
  const plats = arena.platforms;
  // A hop is worth more where gravity is lower (rise goes as v²/2g), so the
  // budgets scale by the reciprocal of this board's own gravity — the same
  // rule tools/audit_stage_reach.mjs applies, so the panel says what CI will.
  const gMul = arena.mods?.gravityMul ?? 1;
  const maxRise = MAX_RISE / gMul;
  const comfyRise = COMFY_RISE / gMul;
  const mains = plats.filter((p) => p.kind === "main");
  const main = mains[0] || plats[0];
  if (!main) return { problems: ["no main platform"], warnings: [] };
  const others = plats.filter((p) => !mains.includes(p));
  const tier = plats.filter((p) => p.kind === "spawn");
  const problems = [];
  const warnings = [];
  if (mains.length > 2) problems.push(`${mains.length} main platforms (allowed 1 or 2)`);
  if (mains.length === 2) {
    const [a, b] = mains.slice().sort((p, q) => p.x - q.x);
    if (a.y !== b.y) problems.push(`the split floor's halves are not level`);
    else if (b.x - (a.x + a.w) < 90) problems.push(`the split floor's hole is under 90px`);
  }
  if (tier.length > 1) problems.push(`${tier.length} spawn tiers (allowed 0 or 1)`);
  if (tier.length === 1) {
    const rise = main.y - tier[0].y;
    if (rise <= 0) problems.push("the spawn tier is not above the floor");
    else if (rise > maxRise) problems.push(`the spawn tier is a ${rise}px hop off the floor (max ${Math.round(maxRise)})`);
    else if (rise > comfyRise) warnings.push(`the spawn tier needs a ${rise}px hop off the floor`);
    if (tier[0].w < 300) problems.push(`the spawn tier is only ${tier[0].w}px wide`);
  }
  for (const p of others) {
    if (p.y >= main.y) problems.push(`(${p.x},${p.y}) is not above the main`);
  }
  const highest = Math.min(...plats.map((p) => p.y));
  // The same cap tools/audit_stage_reach.mjs enforces, and for the reason
  // derived there: it is where the weakest full jump stops keeping the tallest
  // fighter's head inside the shot, not the top of the world rect.
  if (highest < TOP_CAP) {
    warnings.push(`y ${highest} is high — a full jump from it takes the strongest `
      + `fighters entirely out of frame`);
  }
  const reached = new Set(mains.length ? mains : [main]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of others) {
      if (reached.has(p)) continue;
      let best = Infinity;
      for (const from of reached) {
        const rise = from.y - p.y;
        if (rise > maxRise) continue;
        if (horizontalGap(from, p) > gapBudget(Math.max(0, rise) * gMul)) continue;
        best = Math.min(best, rise);
      }
      if (best === Infinity) continue;
      reached.add(p);
      if (best > comfyRise) warnings.push(`(${p.x},${p.y}) needs a ${Math.round(best)}px hop`);
      grew = true;
    }
  }
  for (const p of others) {
    if (!reached.has(p)) problems.push(`(${p.x},${p.y}) w${p.w} is unreachable`);
  }
  return { problems, warnings };
}

function paintReach() {
  const r = reachReport();
  reachEl.className = "sub " + (r.problems.length ? "is-bad" : r.warnings.length ? "is-warn" : "is-ok");
  reachEl.textContent = r.problems.length ? `✗ ${r.problems.join("; ")}`
    : r.warnings.length ? `! ${r.warnings.join("; ")}`
    : "✓ every platform is reachable, and nothing is over the top cap";
}

// ------------------------------------------------------------ editing chrome
//
// Drawn in WORLD space, over the game's own picture, through the game's own
// camera transform — so a handle sits exactly on the platform it belongs to
// whatever the view is doing.
function drawEditing() {
  const cam = state.camera;
  applyCamera(ctx);
  const px = 1 / cam.zoom;   // one screen pixel, in world units

  // The two frames that decide whether a board reads as "reaching the edge":
  // the painted world, and the blast lines a body actually dies at.
  ctx.setLineDash([8 * px, 7 * px]);
  ctx.lineWidth = 1.5 * px;
  ctx.strokeStyle = "rgba(150, 200, 255, 0.5)";
  ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
  ctx.strokeStyle = "rgba(255, 110, 130, 0.45)";
  ctx.strokeRect(BLAST.left, BLAST.top, BLAST.right - BLAST.left, BLAST.bottom - BLAST.top);
  // ...and the widest shot the GAME will ever give this board, which is the
  // thing the platform has to reach to look like it reaches the edge.
  const halfW = WORLD.w / 2 / ZOOM_MIN;
  const halfH = WORLD.h / 2 / ZOOM_MIN;
  ctx.strokeStyle = "rgba(255, 211, 92, 0.5)";
  ctx.strokeRect(WORLD.w / 2 - halfW, WORLD.h / 2 - halfH, halfW * 2, halfH * 2);
  ctx.setLineDash([]);

  ctx.font = `${13 * px}px ui-monospace, monospace`;
  ctx.fillStyle = "rgba(255, 211, 92, 0.85)";
  ctx.fillText("widest game shot", WORLD.w / 2 - halfW + 8 * px, WORLD.h / 2 - halfH + 18 * px);

  const single = bench.sel.length === 1;
  for (let i = 0; i < bench.arena.platforms.length; i++) {
    const r = rectOf(i);
    const on = bench.sel.includes(i);
    ctx.lineWidth = (on ? 2.5 : 1.2) * px;
    ctx.strokeStyle = on ? "rgba(120, 240, 190, 0.95)" : "rgba(255, 255, 255, 0.28)";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (!on) continue;
    // Handles only when ONE is picked: a resize means one platform, and drawing
    // grips on a group would promise a gesture that does nothing.
    if (single) {
      // Drawn no wider than the zone that actually answers, so a narrow wall
      // shows two small grips with body between them rather than two big ones
      // that appear to cover it.
      const s = Math.min(9 * px, edgeGrab(r));
      ctx.fillStyle = "rgba(120, 240, 190, 0.95)";
      for (const hx of [r.x, r.x + r.w]) {
        ctx.fillRect(hx - s / 2, r.y + r.h / 2 - s, s, s * 2);
      }
      // The height grip, on the one kind whose height is a gameplay number.
      if (bench.arena.platforms[i].kind === "wall") {
        const t = Math.min(9 * px, r.h / 3);
        ctx.fillRect(r.x + r.w / 2 - t, r.y + r.h - t / 2, t * 2, t);
      }
      ctx.fillStyle = "rgba(230, 255, 245, 0.95)";
      ctx.font = `${13 * px}px ui-monospace, monospace`;
      ctx.fillText(`${r.w}w  x${bench.arena.platforms[i].x} y${bench.arena.platforms[i].y}`,
                   r.x, r.y - 10 * px);
    }
  }

  // The group's own outline, so a multi-selection reads as one thing to drag.
  if (bench.sel.length > 1) {
    const rs = bench.sel.map((i) => rectOf(i));
    const lo = { x: Math.min(...rs.map((r) => r.x)), y: Math.min(...rs.map((r) => r.y)) };
    const hi = { x: Math.max(...rs.map((r) => r.x + r.w)), y: Math.max(...rs.map((r) => r.y + r.h)) };
    ctx.setLineDash([6 * px, 5 * px]);
    ctx.lineWidth = 1.5 * px;
    ctx.strokeStyle = "rgba(120, 240, 190, 0.55)";
    ctx.strokeRect(lo.x - 6 * px, lo.y - 6 * px, hi.x - lo.x + 12 * px, hi.y - lo.y + 12 * px);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(230, 255, 245, 0.9)";
    ctx.font = `${13 * px}px ui-monospace, monospace`;
    ctx.fillText(`${bench.sel.length} selected`, lo.x, lo.y - 14 * px);
  }

  if (bench.marquee) {
    const m = bench.marquee;
    ctx.fillStyle = "rgba(120, 240, 190, 0.12)";
    ctx.strokeStyle = "rgba(120, 240, 190, 0.8)";
    ctx.lineWidth = 1.5 * px;
    const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1);
    const w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
  releaseCamera(ctx);
}

// -------------------------------------------------------------------- the loop
const latch = makeLatch();
let previous = 0;
let frames = 0;
let fpsAt = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.max(0, Math.min((now - previous) / 1000, 1 / 30));
  previous = now;
  readGamepads();

  if (!bench.loading && state.fighters.length) {
    advanceWorld(dt, {
      latch,
      read: (id) => (id === 1 ? playerInput(1) : blankInput()),
      step: (d) => {
        stepWorld(d, (f) => (f.id === 1 ? latch[1] : blankInput()));
        keepOnStage();
      },
    });
    // advanceWorld runs the game's camera. In editing mode the frame is not
    // allowed to be a moving target, so it is put straight back.
    if (bench.editing) pinCamera();
  }

  draw(ctx);
  if (bench.editing && bench.arena) drawEditing();

  if (flashT > 0) {
    flashT -= dt;
    if (flashT <= 0) overlayEl.classList.remove("is-on", "is-flash");
  }

  endInputFrame();
  frames += 1;
  if (now - fpsAt > 500) {
    bench.fps = Math.round((frames * 1000) / (now - fpsAt));
    frames = 0;
    fpsAt = now;
    fpsEl.textContent = `${bench.fps} fps`;
    const pads = connectedPadCount();
    padEl.textContent = pads ? `${pads} pad${pads > 1 ? "s" : ""}` : "keyboard";
  }
}

// ------------------------------------------------------------------ controls
editingEl.addEventListener("change", () => {
  bench.editing = editingEl.checked;
  canvas.classList.toggle("is-editing", bench.editing);
  if (bench.editing) pinCamera();
  else resetFrameClock();
  const next = new URL(window.location.href);
  next.searchParams.set("editing", bench.editing ? "on" : "off");
  history.replaceState(null, "", next);
});

// ------------------------------------------------------------- the side panels
//
// Folded to a grip rather than removed: the button that brings a panel back has
// to be where the panel was, or hiding one is a thing you cannot undo without
// knowing the URL.

function setPane(side, open) {
  bench.panes[side] = open;
  gridEl.classList.toggle(`${side}-off`, !open);
  const btn = side === "left" ? leftToggleEl : rightToggleEl;
  // The chevron points where pressing it will send the panel.
  btn.textContent = side === "left" ? (open ? "‹" : "›") : (open ? "›" : "‹");
  const what = side === "left" ? "the board list" : "the properties panel";
  btn.title = `${open ? "Hide" : "Show"} ${what} (more room for the picture)`;
  btn.setAttribute("aria-label", btn.title);
  btn.setAttribute("aria-expanded", String(open));
  const next = new URL(window.location.href);
  next.searchParams.set(side, open ? "on" : "off");
  history.replaceState(null, "", next);
  // The grid has changed shape; the picture has to be re-fitted into what is
  // left. The ResizeObserver catches this too — this makes it immediate rather
  // than a frame later, so the canvas never flashes at the wrong size.
  layoutCanvas();
}

leftToggleEl.addEventListener("click", () => setPane("left", !bench.panes.left));
rightToggleEl.addEventListener("click", () => setPane("right", !bench.panes.right));

viewEl.addEventListener("input", () => {
  bench.view = Number(viewEl.value);
  viewValueEl.textContent = `${bench.view.toFixed(2)}x`;
  if (bench.editing) pinCamera();
});

// The list says what each fighter can reach, so picking one to test with is an
// informed choice rather than a name you recognise.
charPickEl.innerHTML = CHARACTER_KEYS
  .map((k) => `<option value="${k}">${characterName(k)} · ${Math.round(fullJump(k))}px</option>`)
  .join("");

function paintReachOfChar() {
  const px = Math.round(fullJump(bench.charKey));
  const weakest = bench.charKey === weakestJumper();
  charReachEl.textContent = `${px}px jump${weakest ? " · weakest" : ""}`;
  charReachEl.classList.toggle("is-weakest", weakest);
}
charPickEl.addEventListener("change", async () => {
  bench.charKey = charPickEl.value;
  paintReachOfChar();
  bench.loading = true;
  await ensureMatchAssets([bench.charKey], bench.stageKey);
  spawnFighter();
  bench.loading = false;
});

// --------------------------------------------------------------------- boot
async function boot() {
  overlayEl.textContent = "Loading…";
  overlayEl.classList.add("is-on");
  await loadCoreAssets();
  initInput();
  startBackgroundLoad();

  // `playing` is what the renderer and the camera expect to be looking at; the
  // bench has no other phase. No HUD means no band for the camera to frame the
  // fight under, which is what makes the pinned shot exactly centred.
  state.phase = "playing";
  state.matchTime = 0;
  state.timeLimit = 0;
  state.hudBand = 0;
  // Off while editing: several boards MOVE their platforms, and a platform that
  // walks away from the cursor is not something you can drag.
  state.activeBoards = false;

  editingEl.checked = bench.editing;
  canvas.classList.toggle("is-editing", bench.editing);
  setPane("left", bench.panes.left);
  setPane("right", bench.panes.right);
  viewEl.value = String(bench.view);
  viewValueEl.textContent = `${bench.view.toFixed(2)}x`;
  charPickEl.value = bench.charKey;
  paintReachOfChar();

  layoutCanvas();
  pinCamera();
  await loadArena(bench.stageKey);
  requestAnimationFrame((t) => { previous = t; fpsAt = t; loop(t); });
}

boot().catch((err) => {
  overlayEl.textContent = `Bench failed to start: ${err.message}`;
  overlayEl.classList.add("is-on");
  console.error(err);
});
