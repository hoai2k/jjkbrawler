// THE CHARACTER BENCH — `/workbench/?edit=character`
//
// Pick a fighter on the left, drive them on the right. Every action they have
// in a match, on a pad or the keyboard, with no menus and no opponent to fight
// you back: the point is to LOOK at a fighter, which a match is a poor place to
// do because you are busy.
//
// IT IS THE GAME, NOT A PREVIEW. The fighter is `makeFighter`, the step is
// `sim.js stepWorld` — the same one `main.js` runs — and the picture is
// `render.js draw`. Nothing here re-implements movement, attacks, or drawing,
// so a pose that reads wrong here reads wrong in a match, which is the only
// property that makes a bench worth opening. What this file owns is the loop
// around that, the roster list, and the switches.
//
// WHY THE SWITCHES ARE HERE
//
// Three smoothing mechanisms sit between the animation data and the screen
// (src/flags.js): the shipped cross-fade, `com` alignment, and `holds`. Judging
// any of them means seeing the same fighter do the same thing with the thing on
// and off, and until now that meant editing a URL and reloading — which loses
// the pose, the position and your place in the comparison. The flags are live
// bindings, so these toggles change the next frame while you hold the stick.
import { state } from "../src/state.js";
import { loadCoreAssets, ensureMatchAssets, startBackgroundLoad,
         sharedArtSettled } from "../src/assets.js";
import { initInput, readGamepads, endInputFrame, playerInput, blankInput,
         connectedPadCount } from "../src/input.js";
import { stepWorld, makeLatch, advanceWorld, resetFrameClock } from "../src/sim.js";
import { makeFighter, turnSweeps } from "../src/fighter.js";
import { draw, smoothingActivity } from "../src/render.js";
import { getStage } from "../src/stages.js";
import { initStageFx } from "../src/stage_fx.js";
import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";
import { applyAllHeightScales } from "../src/heights.js";
import { setSmoothing, smoothingState } from "../src/flags.js";
import { WORLD } from "../src/constants.js";

const root = document.getElementById("characterRoot");
const url = new URL(window.location.href);

// A board with a floor and two ledges, so the ledge grab and the teeter are
// reachable. Any stage works; this one is picked for having somewhere to fall
// off rather than for how it looks.
const STAGE = url.searchParams.get("stage") || "shibuya";

// Where the bench's own state lives. Everything else is `state`, the game's.
const bench = {
  char: url.searchParams.get("char") || CHARACTER_KEYS[0],
  dummy: url.searchParams.get("dummy") !== "off",
  loading: false,
  fps: 0,
  // The camera's own zoom is what a match uses, and a match is framed for two
  // people fighting. A bench is one person LOOKING, so this multiplies it.
  zoom: Number(url.searchParams.get("zoom")) || 1,
  // SLOW MOTION. A fade is 0.08s and a hold fade 0.07s — four or five frames,
  // which is not long enough to see what a mechanism is doing, only long
  // enough to know something happened. This scales how much simulated time a
  // real second buys, so those five frames can be spread over a second and
  // watched. The renderer is untouched and the step is still FIXED_DT, so
  // nothing plays out in a different order than it does at full speed.
  speed: Number(url.searchParams.get("speed")) || 1,
  // How many simulation steps have run. The bench has no clock of its own and
  // the game has no global one, so this is what "how much game happened" means
  // here — and it is the only honest way to show that the speed control slows
  // the SIMULATION rather than the frame rate.
  steps: 0,
};

// ------------------------------------------------------------------- the shell
root.innerHTML = `
  <header class="bar">
    <strong>Character Bench</strong>
    <span class="hint">Every action, on a pad, with nobody hitting back.
      Runs the game's own step and renderer.</span>
    <nav class="modes">
      <a href="?edit=sprites">Sprites →</a>
      <a href="?edit=verification">Verification →</a>
      <a href="../index.html">Play →</a>
    </nav>
  </header>
  <div class="charbench">
    <aside class="roster" id="rosterPane">
      <div class="roster__head">
        <label class="roster__search">
          <input id="rosterFilter" type="search" placeholder="Filter…" autocomplete="off">
        </label>
        <p class="roster__hint">↑ ↓ to change · Enter to focus the viewer</p>
      </div>
      <ul id="rosterList" class="roster__list" role="listbox" tabindex="0"></ul>
    </aside>
    <section class="viewer">
      <canvas id="benchCanvas" width="1280" height="720"></canvas>
      <div class="viewer__overlay" id="viewerOverlay"></div>
      <div class="lights" id="lights">
        <button class="light" data-mode="xfade" type="button" title="The cross-fade the game ships: the outgoing drawing lingers 0.08s under the new one on a state change">
          <span class="light__dot"></span><span class="light__name">cross-fade</span>
        </button>
        <button class="light" data-mode="com" type="button" title="?smooth=com — a fade lines its two drawings up by their centre of mass and slides it between them">
          <span class="light__dot"></span><span class="light__name">com align</span>
        </button>
        <button class="light" data-mode="holds" type="button" title="?smooth=holds — the slow held loops (idle, crouch, charge) cross-fade their own frame steps">
          <span class="light__dot"></span><span class="light__name">hold fade</span>
        </button>
        <button class="light" data-mode="turn" type="button" title="The facing sweep (TURN_TIME, fighter.js). It follows the BACKEND by default: a rig has a back and turns through side-on, a drawing has none and flips whole — so this is off on sprites and on in 3D. Forced here either way, because seeing the sprite sweep is the only way to see why it went.">
          <span class="light__dot"></span><span class="light__name">turn sweep</span>
        </button>
        <span class="lights__state" id="lightsState"></span>
      </div>
      <div class="viewer__foot">
        <label class="toggle"><input type="checkbox" id="dummyToggle"> training dummy</label>
        <label class="toggle zoom">zoom
          <input type="range" id="zoomRange" min="0.6" max="3" step="0.05">
          <span id="zoomValue"></span>
        </label>
        <label class="toggle zoom" title="Slows the SIMULATION, not the frame rate — the game keeps stepping at its fixed step, just fewer of them per second, so every mechanism here plays out in the same order at 1/10th speed.">speed
          <input type="range" id="speedRange" min="0.05" max="1" step="0.05">
          <span id="speedValue"></span>
        </label>
        <span class="viewer__pads" id="padState"></span>
        <span class="viewer__fps" id="fpsState"></span>
      </div>
    </section>
  </div>`;

const canvas = document.getElementById("benchCanvas");
const ctx = canvas.getContext("2d");
const listEl = document.getElementById("rosterList");
const filterEl = document.getElementById("rosterFilter");
const overlayEl = document.getElementById("viewerOverlay");
const lightsEl = document.getElementById("lights");
const lightsStateEl = document.getElementById("lightsState");
const dummyEl = document.getElementById("dummyToggle");
const zoomEl = document.getElementById("zoomRange");
const zoomValueEl = document.getElementById("zoomValue");
const speedEl = document.getElementById("speedRange");
const speedValueEl = document.getElementById("speedValue");
const padEl = document.getElementById("padState");
const fpsEl = document.getElementById("fpsState");

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

// -------------------------------------------------------------------- the list
const roster = CHARACTER_KEYS.map((key) => ({
  key, name: CHARACTERS[key]?.fullName || CHARACTERS[key]?.name || key,
}));

function visibleRoster() {
  const q = (filterEl.value || "").trim().toLowerCase();
  if (!q) return roster;
  return roster.filter((r) => r.key.includes(q) || r.name.toLowerCase().includes(q));
}

function renderList() {
  const rows = visibleRoster();
  listEl.innerHTML = rows.map((r) => `
    <li role="option" data-key="${r.key}" aria-selected="${r.key === bench.char}"
        class="${r.key === bench.char ? "is-on" : ""}">
      <span class="roster__name">${r.name}</span>
      <span class="roster__key">${r.key}</span>
    </li>`).join("");
  const on = listEl.querySelector(".is-on");
  if (on) on.scrollIntoView({ block: "nearest" });
}

listEl.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-key]");
  if (li) select(li.dataset.key);
});
filterEl.addEventListener("input", renderList);

/** Move the selection by `step` through the list as it is currently filtered,
 *  which is what a person means by "the next one" when they have typed a
 *  filter. */
function step(delta) {
  const rows = visibleRoster();
  if (!rows.length) return;
  const at = rows.findIndex((r) => r.key === bench.char);
  const next = rows[(at + delta + rows.length) % rows.length];
  select(next.key);
}

// --------------------------------------------------------------- the sandbox
const latch = makeLatch([1, 2]);

/** Stand a fighter up on the stage's main platform.
 *
 *  `dead` is never set and no stock is counted: a bench fighter cannot lose,
 *  so walking into the blast zone respawns them where they started rather than
 *  ending anything. Falling off is a thing to look at, not a fail state.
 */
function spawn(charKey) {
  const main = state.platforms[0];
  const one = makeFighter(1, charKey, main.x + main.w * 0.4, 1);
  one.y = main.y;
  one.grounded = true;
  one.team = 1;
  state.fighters = [one];
  if (bench.dummy) {
    const two = makeFighter(2, charKey, main.x + main.w * 0.62, -1);
    two.y = main.y;
    two.grounded = true;
    two.team = 2;
    // No `aiState`: the dummy is driven by `blankInput` below, so it stands
    // there and takes it. That is the whole job — a grab, a throw and every
    // strike need a body, and one that fights back is a match, not a look.
    state.fighters.push(two);
  }
  state.hitboxes.length = 0;
  state.projectiles.length = 0;
  state.entities.length = 0;
  state.particles.length = 0;
  state.popups.length = 0;
  state.banners.length = 0;
}

async function select(charKey) {
  if (bench.loading) return;
  bench.char = charKey;
  url.searchParams.set("char", charKey);
  history.replaceState(null, "", url);
  renderList();
  bench.loading = true;
  overlayEl.textContent = `Loading ${CHARACTERS[charKey]?.name || charKey}…`;
  overlayEl.classList.add("is-on");
  try {
    await ensureMatchAssets([charKey], state.stageKey);
    applyAllHeightScales();
    spawn(charKey);
  } catch (err) {
    overlayEl.textContent = `Could not load ${charKey}: ${err.message}`;
    console.warn(err);
    bench.loading = false;
    return;
  }
  bench.loading = false;
  // The load just ate real time that is not elapsed play, and the frame clock
  // would otherwise hand the new fighter all of it at once.
  resetFrameClock();
  overlayEl.classList.remove("is-on");
}

// --------------------------------------------------------------- the switches
// ARMED IS NOT THE SAME AS WORKING, and the dots say which.
//
//   dark    off
//   yellow  on, and doing nothing this frame
//   green   doing something RIGHT NOW
//
// The difference is the whole reason to have lights rather than checkboxes. A
// cross-fade runs for 0.08 seconds at a state change; a hold fade for 0.07,
// twice a second; a turn only while a fighter is coming about. A lamp that is
// lit whenever the switch is on says nothing about the frame in front of you,
// which is the frame you are trying to judge. Green is rare and brief on
// purpose — turn the speed down to hold it long enough to read.
//
const lightEls = [...lightsEl.querySelectorAll(".light")];

/** What is armed right now. `turn` is the odd one: its flag is an OVERRIDE
 *  that is null by default, meaning "ask the backend", so the lamp has to show
 *  the answer the simulation acted on rather than the null. */
const armedNow = () => ({ ...smoothingState(), turn: turnSweeps() });

function paintLights() {
  const on = armedNow();
  for (const el of lightEls) {
    const mode = el.dataset.mode;
    el.classList.toggle("is-on", !!on[mode]);
    el.setAttribute("aria-pressed", String(!!on[mode]));
  }
  const live = Object.entries(on).filter(([, v]) => v).map(([k]) => k);
  lightsEl.classList.toggle("is-live", live.length > 0);
  lightsStateEl.textContent = live.length ? `armed: ${live.join(" + ")}` : "no smoothing";
}

/** The half that changes every frame: which of the armed lamps is actually
 *  doing something, straight off what the renderer just did. Reading a live
 *  readout rather than re-deriving it is the point — the lamp cannot claim
 *  something the picture did not do. */
function paintActivity() {
  const on = armedNow();
  let working = false;
  for (const el of lightEls) {
    const mode = el.dataset.mode;
    const active = !!on[mode] && smoothingActivity[mode] > 0.001;
    el.classList.toggle("is-working", active);
    // The dot brightens with how hard the mechanism is working, so a fade that
    // found nothing to align reads differently from one sliding a whole body.
    el.style.setProperty("--work", active ? smoothingActivity[mode].toFixed(3) : "0");
    if (active) working = true;
  }
  lightsEl.classList.toggle("is-working", working);
}

lightsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".light");
  if (!btn) return;
  const now = armedNow();
  setSmoothing({ [btn.dataset.mode]: !now[btn.dataset.mode] });
  paintLights();
});

speedEl.addEventListener("input", () => {
  bench.speed = Number(speedEl.value);
  speedValueEl.textContent = bench.speed === 1 ? "1x" : `${bench.speed.toFixed(2)}x`;
  url.searchParams.set("speed", String(bench.speed));
  history.replaceState(null, "", url);
});

zoomEl.addEventListener("input", () => {
  bench.zoom = Number(zoomEl.value);
  zoomValueEl.textContent = `${bench.zoom.toFixed(2)}x`;
  url.searchParams.set("zoom", String(bench.zoom));
  history.replaceState(null, "", url);
});

dummyEl.addEventListener("change", () => {
  bench.dummy = dummyEl.checked;
  url.searchParams.set("dummy", bench.dummy ? "on" : "off");
  history.replaceState(null, "", url);
  spawn(bench.char);
});

// ------------------------------------------------------------------ the keys
//
// Arrow keys change the fighter, and the game's own controls drive them — which
// collide on nothing, because the keyboard map for player 1 is WASD and the
// letter keys (src/config_controls.js). The arrows are free.
window.addEventListener("keydown", (e) => {
  if (e.target === filterEl && e.key !== "Escape") return;
  if (e.key === "ArrowUp") { step(-1); e.preventDefault(); }
  else if (e.key === "ArrowDown") { step(1); e.preventDefault(); }
  else if (e.key === "Escape") { filterEl.blur(); canvas.focus(); }
  else if (e.key === "r" && (e.metaKey || e.ctrlKey)) { /* let the browser reload */ }
});

// ------------------------------------------------------------------- the loop
let previous = 0;
// What `updateCamera` believes the zoom is. The value it lerps toward is a
// property of the match — how far apart the fighters are — so the bench's
// multiplier is applied to the RESULT and taken back off before the next step,
// or each frame would compound the last one's and run away.
let camZoom = 1;
let frames = 0;
let fpsAt = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.max(0, Math.min((now - previous) / 1000, 1 / 30));
  previous = now;

  readGamepads();

  if (!bench.loading && state.fighters.length) {
    // ONE CALL, AND IT IS THE GAME'S.
    //
    // `advanceWorld` is the whole live-world frame — the latch, the fixed-step
    // clock, the slow-motion scale, the particles and the camera — shared with
    // main.js. The bench supplies only the part that legitimately differs: what
    // one fixed step of THIS world is, which is the fight plus a respawn
    // instead of the fight plus a match.
    //
    // It is a call rather than a copy because the copy was wrong. This loop
    // used to step the world itself and forgot `updateParticles`, so every
    // spark and every banner the fight threw off stayed frozen on screen for
    // the life of the page.
    //
    // `scale` is the bench's own speed control, and it goes through the shared
    // clock for the same reason the rest of this does: slow motion is LESS
    // SIMULATED TIME PER REAL SECOND, not a smaller step. A smaller step would
    // change what the game computes — every timer, every ramp, the fade
    // windows themselves — and a bench that shows you a different game at 0.1x
    // is worse than no bench. It multiplies the dramatic slow-mo rather than
    // replacing it, so a KO still reads as a KO while you are dialled down.
    //
    // The camera's own zoom is taken back before the call and the bench's
    // multiplier re-applied after, so `updateCamera` lerps the value a match
    // would have and the zoom slider does not compound into it.
    state.camera.zoom = camZoom;
    advanceWorld(dt, {
      latch,
      scale: bench.speed,
      read: (id) => (id === 1 ? playerInput(1) : blankInput()),
      step: (d) => {
        stepWorld(d, (f) => (f.id === 1 ? latch[1] : blankInput()));
        bench.steps += 1;
        keepOnStage();
      },
    });
    camZoom = state.camera.zoom;
    frameForBench();
  }
  draw(ctx);
  // Straight after the draw, because that is what it describes: which of the
  // armed mechanisms actually did something to the frame now on screen.
  paintActivity();
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

/** Zoom in on the fighter being driven, past what a match would.
 *
 *  At 1x this does nothing and the game's own camera is what you see, which is
 *  the default for a reason: the framing is part of how the game reads.
 *
 *  Past 1x the bench takes the framing over, and it has to — `updateCamera`
 *  clamps its centre so the view never leaves the world, and at zoom 1 that
 *  clamp is the world's exact middle: the camera CANNOT pan. Multiplying its
 *  zoom without re-centring therefore crops toward the middle of the stage and
 *  leaves the fighter wherever they happened to be, half out of frame. So the
 *  centre is taken from the fighter and re-clamped against the tighter view the
 *  zoom just created.
 */
function frameForBench() {
  const z = camZoom * bench.zoom;
  state.camera.zoom = z;
  if (bench.zoom === 1) return;
  const me = state.fighters[0];
  if (!me) return;
  const halfW = WORLD.w / 2 / z;
  const halfH = WORLD.h / 2 / z;
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
  state.camera.x = clamp(me.x, halfW, WORLD.w - halfW);
  // The same 90px lift the camera gives a solo fighter, so the head has room
  // and the feet are not on the bottom edge.
  state.camera.y = clamp(me.y - 90, halfH, WORLD.h - halfH);
}

/** A fighter who leaves the world comes back, rather than dying.
 *
 *  There is no match here to lose, and a bench that empties itself the first
 *  time somebody walks off the edge would be a bench nobody uses twice. Reset
 *  is the state a fresh spawn is in, so it is the same call. */
function keepOnStage() {
  for (const f of state.fighters) {
    const out = f.y > WORLD.h + 400 || f.x < -500 || f.x > WORLD.w + 500;
    if (!out && !f.dead) continue;
    const main = state.platforms[0];
    f.dead = false;
    f.x = main.x + main.w * (f.id === 1 ? 0.4 : 0.62);
    f.y = main.y;
    f.vx = 0;
    f.vy = 0;
    f.damage = 0;
    f.grounded = true;
  }
}

// -------------------------------------------------------------------- the boot
async function boot() {
  overlayEl.textContent = "Loading…";
  overlayEl.classList.add("is-on");
  await loadCoreAssets();
  initInput();
  // THE SHARED ART, or a special draws as a white circle.
  //
  // `ensureMatchAssets` gates on the fighter and the stage — `matchGroupIds`
  // lists `char:` and `stage:` groups and nothing else — because in the game
  // the shared group (effects, summons, backdrops) is already in hand: boot
  // starts it downloading while the player is still on the menu. A bench that
  // skips the menu skipped that too, so every technique fell back to the
  // procedural shape it draws when its art is missing.
  //
  // The game's own call, queued the same way: `shared` first, then the roster
  // behind it — which also means flicking through the list with the arrow keys
  // stops waiting on a download after the first pass.
  startBackgroundLoad();

  const stage = getStage(STAGE);
  state.stageKey = stage.key;
  state.platforms = stage.platforms.map((p) => ({ ...p }));
  // `playing` is what the renderer and the camera expect to be looking at; the
  // bench has no other phase.
  state.phase = "playing";
  state.matchTime = 0;
  state.timeLimit = 0;
  initStageFx(stage);

  resizeCanvas();
  renderList();
  dummyEl.checked = bench.dummy;
  zoomEl.value = String(bench.zoom);
  zoomValueEl.textContent = `${bench.zoom.toFixed(2)}x`;
  speedEl.value = String(bench.speed);
  speedValueEl.textContent = bench.speed === 1 ? "1x" : `${bench.speed.toFixed(2)}x`;
  camZoom = state.camera.zoom;
  paintLights();
  await select(bench.char);
  requestAnimationFrame((t) => { previous = t; fpsAt = t; loop(t); });
}

// The bench is a page, and a page that fails silently is a black rectangle
// nobody can debug. Say it on the canvas.
boot().catch((err) => {
  overlayEl.textContent = `Bench failed to start: ${err.message}`;
  overlayEl.classList.add("is-on");
  console.error(err);
});

// For the smoke test: driving a pad from Playwright is not possible, so the
// check reaches in here instead. Nothing in the page reads these.
window.__bench = {
  state: () => ({ char: bench.char, fighters: state.fighters.length,
                  anim: state.fighters[0]?.animKey, smoothing: smoothingState(),
                  steps: bench.steps, speed: bench.speed,
                  activity: { ...smoothingActivity },
                  // What the loop is responsible for retiring. A number here
                  // that only ever grows is the bug this bench shipped with:
                  // the world was stepped and the PRESENTATION was not, so
                  // every spark, damage number and banner ever spawned stayed
                  // on screen for the life of the page.
                  particles: state.particles.length, popups: state.popups.length,
                  banners: state.banners.length,
                  sharedArt: sharedArtSettled() }),
  setSpeed: (v) => {
    speedEl.value = String(v);
    speedEl.dispatchEvent(new Event("input"));
  },
  select,
  step,
  press: (key) => { latch[1][key] = true; },
};
