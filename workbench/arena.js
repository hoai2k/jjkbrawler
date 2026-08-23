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
import { AUTHORED_STAGES, mainPlatform } from "../src/stages.js";
import { initStageFx } from "../src/stage_fx.js";
import { CHARACTER_KEYS, characterName } from "../src/characters.js";
import { ART_SCALE } from "../src/config_tuning.js";
import { WORLD, BLAST } from "../src/constants.js";
import { clamp } from "../src/utils.js";

const root = document.getElementById("arenaRoot");
const url = new URL(window.location.href);

// The kinds a platform can be, and what each one means to the game. Straight
// from what fighter.js actually tests for, so this list cannot drift from the
// behaviour: "main" is the ground and the only thing with grabbable ledges,
// "side"/"top" are drop-through slivers, and "wall" is the one piece of stage
// that blocks sideways movement.
const KINDS = [
  { key: "main", label: "main — the ground, grabbable ledges, drop-through never" },
  { key: "side", label: "side — drop-through platform" },
  { key: "top", label: "top — drop-through platform (highest tier by convention)" },
  { key: "wall", label: "wall — blocks sideways movement, walkable on top" },
];

// A new platform starts as a contestable drop-through: ~3 body widths, the
// width docs/level-design-review.md calls the floor for a platform two people
// are meant to fight over.
const NEW_PLATFORM = { w: 210, h: 15, kind: "side" };

const bench = {
  stageKey: url.searchParams.get("stage") || AUTHORED_STAGES[0].key,
  charKey: url.searchParams.get("char") || CHARACTER_KEYS[0],
  editing: url.searchParams.get("editing") !== "off",
  // A multiplier on the pinned editing zoom. 1 is the game's own furthest
  // pull-back; below 1 reaches past it to the blast lines, which is the only
  // reason to touch it — see the guides drawn in editing mode.
  view: 1,
  arena: null,       // the authored board being edited
  selected: -1,
  drag: null,
  loading: false,
  fps: 0,
};

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
  <div class="arenabench">
    <aside class="arenas" id="arenaPane">
      <div class="arenas__head">
        <label class="arenas__search">
          <input id="arenaFilter" type="search" placeholder="Filter…" autocomplete="off">
        </label>
        <p class="arenas__hint">Unsaved edits are lost when you switch board</p>
      </div>
      <ul id="arenaList" class="arenas__list" role="listbox"></ul>
    </aside>

    <section class="viewer">
      <div class="viewer__stage">
        <canvas id="arenaCanvas" width="1280" height="720"></canvas>
        <div class="viewer__overlay" id="arenaOverlay"></div>
      </div>
      <div class="viewer__foot">
        <label class="toggle" title="On: the camera is pinned at the furthest the game ever pulls back and never moves, so what you are dragging holds still. Off: the game's own framing camera takes over, which is how the board FEELS in a match.">
          <input type="checkbox" id="editingToggle"> editing mode
        </label>
        <button class="ghost" id="addPlatform" type="button" title="Add a drop-through platform in the middle of the view">＋ platform</button>
        <button class="ghost" id="delPlatform" type="button" title="Remove the selected platform (or press Delete)">🗑 delete</button>
        <button class="ghost" id="resetArena" type="button" title="Throw away every edit and reload this board as it ships">↺ revert</button>
        <label class="toggle zoom" title="A multiplier on the pinned editing camera. 1 is the game's furthest pull-back; below 1 reaches past it so you can drag a platform out toward the blast lines.">view
          <input type="range" id="viewRange" min="0.5" max="1.15" step="0.01">
          <span id="viewValue"></span>
        </label>
        <select id="charPick" class="dummyPick" title="Who you are driving. Any fighter — the point is to feel the board under a body, so pick the one whose movement you are worried about."></select>
        <span class="viewer__pads" id="arenaPads"></span>
        <span class="viewer__fps" id="arenaFps"></span>
      </div>
    </section>

    <aside class="props" id="propsPane">
      <h2>Platform</h2>
      <p class="sub" id="propsNone">Click a platform to select it.</p>
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
    </aside>
  </div>`;

const canvas = document.getElementById("arenaCanvas");
const ctx = canvas.getContext("2d");
const overlayEl = document.getElementById("arenaOverlay");
const listEl = document.getElementById("arenaList");
const filterEl = document.getElementById("arenaFilter");
const editingEl = document.getElementById("editingToggle");
const viewEl = document.getElementById("viewRange");
const viewValueEl = document.getElementById("viewValue");
const charPickEl = document.getElementById("charPick");
const padEl = document.getElementById("arenaPads");
const fpsEl = document.getElementById("arenaFps");
const propsNoneEl = document.getElementById("propsNone");
const propsBodyEl = document.getElementById("propsBody");
const thickEl = document.getElementById("pThickness");
const reachEl = document.getElementById("reachOut");
const fxEl = document.getElementById("fxToggle");
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

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  // The same transform the game sets: everything downstream draws in WORLD
  // units and never learns how big the window is.
  ctx.setTransform(canvas.width / WORLD.w, 0, 0, canvas.height / WORLD.h, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

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
  bench.arena = authored(key);
  bench.selected = -1;
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
  const next = new URL(window.location.href);
  next.searchParams.set("stage", key);
  history.replaceState(null, "", next);
}

function spawnFighter() {
  const main = mainPlatform(state.platforms);
  const x = main ? main.x + main.w / 2 : WORLD.w / 2;
  const f = makeFighter(1, bench.charKey, x, 1);
  f.y = main ? main.y : WORLD.h / 2;
  f.grounded = true;
  state.fighters = [f];
}

/** The fighter is standing on a board somebody is editing out from under them.
 *  Put them back rather than letting them fall out of the world forever. */
function keepOnStage() {
  const f = state.fighters[0];
  if (!f) return;
  if (f.y < BLAST.bottom && f.x > BLAST.left && f.x < BLAST.right && f.y > BLAST.top) return;
  const main = mainPlatform(state.platforms);
  f.x = main ? main.x + main.w / 2 : WORLD.w / 2;
  f.y = main ? main.y : WORLD.h / 2;
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
    li.className = "arena" + (s.key === bench.stageKey ? " is-on" : "");
    li.dataset.stage = s.key;
    li.setAttribute("role", "option");
    const plats = s.platforms.length;
    const main = s.platforms.find((p) => p.kind === "main") || s.platforms[0];
    const walls = s.platforms.filter((p) => p.kind === "wall").length;
    li.innerHTML = `<b>${s.name}</b><span>${plats} platform${plats === 1 ? "" : "s"}`
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

/** What is under this world point: an index and which part of it was hit. */
function pick(w) {
  const m = grabPx();
  // Last first: later platforms are drawn over earlier ones, so they are the
  // ones the eye thinks it is pointing at.
  for (let i = bench.arena.platforms.length - 1; i >= 0; i--) {
    const r = rectOf(i);
    if (w.y < r.y - m || w.y > r.y + r.h + m) continue;
    if (w.x < r.x - m || w.x > r.x + r.w + m) continue;
    if (Math.abs(w.x - r.x) <= m) return { i, part: "left" };
    if (Math.abs(w.x - (r.x + r.w)) <= m) return { i, part: "right" };
    return { i, part: "move" };
  }
  return null;
}

// ----------------------------------------------------------------- dragging
canvas.addEventListener("pointerdown", (ev) => {
  if (!bench.editing || !bench.arena) return;
  const w = toWorld(ev);
  const hit = pick(w);
  select(hit ? hit.i : -1);
  if (!hit) return;
  const p = bench.arena.platforms[hit.i];
  bench.drag = { part: hit.part, i: hit.i, ox: w.x - p.x, oy: w.y - p.y, w0: p.w, x0: p.x };
  canvas.setPointerCapture(ev.pointerId);
  ev.preventDefault();
});

canvas.addEventListener("pointermove", (ev) => {
  if (!bench.editing || !bench.arena) return;
  const w = toWorld(ev);
  if (!bench.drag) {
    const hit = pick(w);
    canvas.style.cursor = !hit ? "default"
      : hit.part === "move" ? "move" : "ew-resize";
    return;
  }
  const d = bench.drag;
  const p = bench.arena.platforms[d.i];
  if (d.part === "move") {
    p.x = Math.round(w.x - d.ox);
    p.y = Math.round(w.y - d.oy);
  } else if (d.part === "left") {
    // The RIGHT edge is what stays put when you pull the left one.
    const right = d.x0 + d.w0;
    const x = Math.min(Math.round(w.x), right - 8);
    p.x = x;
    p.w = right - x;
  } else {
    p.w = Math.max(8, Math.round(w.x - p.x));
  }
  syncPlatforms();
  paintProps();
});

const endDrag = () => { bench.drag = null; };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// ------------------------------------------------------------- selection/props
function select(i) {
  bench.selected = i;
  paintProps();
}

function paintProps() {
  const p = bench.arena && bench.selected >= 0 ? bench.arena.platforms[bench.selected] : null;
  propsNoneEl.hidden = !!p;
  propsBodyEl.hidden = !p;
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
  const p = bench.arena.platforms[bench.selected];
  if (!p) return;
  p.kind = fields.kind.value;
  // A wall's height is collision and a slab's is art, so the sensible default
  // thickness is different for each. Only nudged when the current value is the
  // OTHER kind's default, so a height somebody chose is never overwritten.
  if (p.kind === "wall" && p.h <= 42) p.h = 130;
  if (p.kind !== "wall" && p.h > 42) p.h = p.kind === "main" ? 42 : 15;
  syncPlatforms();
  paintProps();
});

for (const key of ["x", "y", "w", "h"]) {
  fields[key].addEventListener("input", () => {
    const p = bench.arena.platforms[bench.selected];
    if (!p) return;
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
  bench.arena.platforms.push(p);
  syncPlatforms();
  select(bench.arena.platforms.length - 1);
});

function deleteSelected() {
  const i = bench.selected;
  if (i < 0) return;
  const p = bench.arena.platforms[i];
  // The main is the ground, the ledges and where every spawn stands. Losing it
  // does not make an interesting board, it makes a broken one.
  if (p.kind === "main" && bench.arena.platforms.filter((q) => q.kind === "main").length <= 1) {
    flash("that is the board's only main platform — change its kind first");
    return;
  }
  bench.arena.platforms.splice(i, 1);
  select(-1);
  syncPlatforms();
}
document.getElementById("delPlatform").addEventListener("click", deleteSelected);

window.addEventListener("keydown", (e) => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
  if (!bench.editing) return;
  e.preventDefault();
  deleteSelected();
});

document.getElementById("resetArena").addEventListener("click", () => {
  bench.arena = authored(bench.stageKey);
  select(-1);
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

document.getElementById("arenaExport").addEventListener("click", () => {
  const a = bench.arena;
  const payload = {
    note: "Authored numbers, ready for src/stages.js. `h` is pre-ART_SCALE thickness — the game scales it (walls excepted).",
    key: a.key, name: a.name, bgFile: a.bgFile, tint: a.tint,
    mods: a.mods, platforms: a.platforms,
    reach: reachReport(),
    stagesJs: stagesJsLine(a),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `arena-${a.key}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  flash(`exported arena-${a.key}.json`);
});

// ------------------------------------------------------------------- reach
//
// The same budget tools/audit_stage_reach.mjs enforces, live: a board you can
// build here but not land in `main` is a board the bench let you waste time on.
const MAX_RISE = 175;
const COMFY_RISE = 145;
const gapBudget = (rise) => (rise <= 110 ? 220 : rise <= 145 ? 160 : 90);

function horizontalGap(a, b) {
  if (a.x + a.w >= b.x && b.x + b.w >= a.x) return 0;
  return a.x + a.w < b.x ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
}

function reachReport() {
  const plats = bench.arena.platforms;
  const main = plats.find((p) => p.kind === "main") || plats[0];
  if (!main) return { problems: ["no main platform"], warnings: [] };
  const others = plats.filter((p) => p !== main);
  const problems = [];
  const warnings = [];
  for (const p of others) {
    if (p.y >= main.y) problems.push(`(${p.x},${p.y}) is not above the main`);
  }
  const highest = Math.min(...plats.map((p) => p.y));
  if (highest < 235) problems.push(`highest platform y ${highest} is above the 235 cap`);
  const reached = new Set([main]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of others) {
      if (reached.has(p)) continue;
      let best = Infinity;
      for (const from of reached) {
        const rise = from.y - p.y;
        if (rise > MAX_RISE) continue;
        if (horizontalGap(from, p) > gapBudget(Math.max(0, rise))) continue;
        best = Math.min(best, rise);
      }
      if (best === Infinity) continue;
      reached.add(p);
      if (best > COMFY_RISE) warnings.push(`(${p.x},${p.y}) needs a ${Math.round(best)}px hop`);
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

  for (let i = 0; i < bench.arena.platforms.length; i++) {
    const r = rectOf(i);
    const on = i === bench.selected;
    ctx.lineWidth = (on ? 2.5 : 1.2) * px;
    ctx.strokeStyle = on ? "rgba(120, 240, 190, 0.95)" : "rgba(255, 255, 255, 0.28)";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (!on) continue;
    // The two handles that resize it, drawn a constant size on screen.
    const s = 9 * px;
    ctx.fillStyle = "rgba(120, 240, 190, 0.95)";
    for (const hx of [r.x, r.x + r.w]) {
      ctx.fillRect(hx - s / 2, r.y + r.h / 2 - s, s, s * 2);
    }
    ctx.fillStyle = "rgba(230, 255, 245, 0.95)";
    ctx.font = `${13 * px}px ui-monospace, monospace`;
    ctx.fillText(`${r.w}w  x${bench.arena.platforms[i].x} y${bench.arena.platforms[i].y}`,
                 r.x, r.y - 10 * px);
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

viewEl.addEventListener("input", () => {
  bench.view = Number(viewEl.value);
  viewValueEl.textContent = `${bench.view.toFixed(2)}x`;
  if (bench.editing) pinCamera();
});

charPickEl.innerHTML = CHARACTER_KEYS
  .map((k) => `<option value="${k}">${characterName(k)}</option>`).join("");
charPickEl.addEventListener("change", async () => {
  bench.charKey = charPickEl.value;
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
  viewEl.value = String(bench.view);
  viewValueEl.textContent = `${bench.view.toFixed(2)}x`;
  charPickEl.value = bench.charKey;

  resizeCanvas();
  pinCamera();
  await loadArena(bench.stageKey);
  requestAnimationFrame((t) => { previous = t; fpsAt = t; loop(t); });
}

boot().catch((err) => {
  overlayEl.textContent = `Bench failed to start: ${err.message}`;
  overlayEl.classList.add("is-on");
  console.error(err);
});
