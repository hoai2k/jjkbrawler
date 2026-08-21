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
// Two smoothing mechanisms sit between the animation data and the screen
// (src/flags.js): the shipped cross-fade and `com` alignment. Judging either
// means seeing the same fighter do the same thing with the thing on and off,
// and until this bench existed that meant editing a URL and reloading — which
// loses the pose, the position and your place in the comparison. The flags are
// live bindings, so these toggles change the next frame while you hold the
// stick.
//
// There were four. `?smooth=holds` faded the frame steps inside slow held
// loops and the facing sweep squashed a sprite through side-on; both were
// removed rather than defaulted off, and this bench is where each of them was
// looked at and found wanting.
import { state } from "../src/state.js";
import { loadCoreAssets, ensureMatchAssets, startBackgroundLoad,
         sharedArtSettled } from "../src/assets.js";
import { initInput, readGamepads, endInputFrame, playerInput, blankInput,
         connectedPadCount } from "../src/input.js";
import { stepWorld, makeLatch, advanceWorld, resetFrameClock } from "../src/sim.js";
import { makeFighter } from "../src/fighter.js";
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
  // Who stands opposite. "self" is a copy of whoever is selected, which is
  // what a bench wants by default; any roster key stands that fighter instead.
  dummyChar: url.searchParams.get("dummy2") || "self",
  // The centre pillar. Off unless asked for: it changes the board every other
  // check on this bench is looked at against. See syncWall.
  wall: url.searchParams.get("wall") === "on",
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
  // The ledge drill, when one is running: see runDrill.
  drill: null,
  // The last input handed to the world, for the stick readout. See paintAims.
  stick: null,
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
        <span class="lights__state" id="lightsState"></span>
      </div>
      <div class="aim" id="aimPanel" title="What the last attack made of the left stick — the angle it read, how far the stick was pushed, and where it aimed. Written when the attack starts and left there until the next one, so you can let go of the stick and read it. Light attacks only: a heavy reads the stick as a variant picker, not as an angle.">
        <span class="aim__name">attack read</span>
        <span class="aim__val" id="aimRead">no attack yet</span>
      </div>
      <div class="viewer__foot">
        <label class="toggle"><input type="checkbox" id="dummyToggle"> training dummy</label>
        <select class="dummyPick" id="dummyChar" title="Who the dummy is. Self stands a copy of the fighter you are looking at, which is the default because most of what a bench is for is one fighter against their own size. Anyone else on the roster is here for the questions where the other body matters — reach against a taller opponent, a low attack against Panda."></select>
        <label class="toggle" title="A pillar up the middle of the board, floor to the height of the side platforms, solid to walk into and cleared by going over the top. Somewhere to push up against: holding a diagonal to throw an angled attack also walks you forward, so on an open board the swing is studied from off the edge.">
          <input type="checkbox" id="wallToggle"> wall
        </label>
        <button class="drill" id="ledgeDrill" type="button" title="Walks off the edge, hangs, and climbs back — the real grab, the real transition, no state poked in by hand. Getting there on a pad takes a dozen tries and the interesting part is four frames long; turn the speed down and watch it.">ledge drill</button>
        <label class="toggle zoom">zoom
          <input type="range" id="zoomRange" min="0.6" max="3" step="0.05">
          <span id="zoomValue"></span>
        </label>
        <label class="toggle zoom" title="Slows the SIMULATION, not the frame rate — the game keeps stepping at its fixed step, just fewer of them per second, so every mechanism here plays out in the same order at 1/10th speed.">speed
          <input type="range" id="speedRange" min="0.05" max="1" step="0.05">
          <span id="speedValue"></span>
        </label>
        <span class="viewer__stick" id="stickState" title="The left stick as input.js reports it this frame — the raw angle, back or forward, and how far it is pushed. This is what reaches the attack; the panel over the picture is what the attack made of it.">stick —</span>
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
const wallEl = document.getElementById("wallToggle");
const dummyCharEl = document.getElementById("dummyChar");
const zoomEl = document.getElementById("zoomRange");
const zoomValueEl = document.getElementById("zoomValue");
const speedEl = document.getElementById("speedRange");
const speedValueEl = document.getElementById("speedValue");
const drillEl = document.getElementById("ledgeDrill");
const aimReadEl = document.getElementById("aimRead");
const aimPanelEl = document.getElementById("aimPanel");
const stickEl = document.getElementById("stickState");
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
/** The roster key the dummy should wear: the fighter under inspection unless
 *  somebody has picked one. Falls back to self for a key that is not on the
 *  roster, so a stale `?dummy2=` in a bookmark cannot leave the bench empty. */
function dummyKey(charKey) {
  const pick = bench.dummyChar;
  return pick && pick !== "self" && CHARACTERS[pick] ? pick : charKey;
}

function spawn(charKey) {
  const main = state.platforms[0];
  const one = makeFighter(1, charKey, main.x + main.w * 0.4, 1);
  one.y = main.y;
  one.grounded = true;
  one.team = 1;
  state.fighters = [one];
  if (bench.dummy) {
    const two = makeFighter(2, dummyKey(charKey), main.x + main.w * 0.62, -1);
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
    // Both bodies, or the dummy draws as whatever the loader last had in hand.
    // De-duplicated because self is the usual case and asking for one fighter
    // twice is a wasted queue entry.
    await ensureMatchAssets([...new Set([charKey, dummyKey(charKey)])], state.stageKey);
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
// The difference is the whole reason to have lights rather than checkboxes: a
// cross-fade runs for 0.08 seconds at a state change and nothing at all in
// between, so a lamp that is lit whenever the switch is on says nothing about
// the frame in front of you, which is the frame you are trying to judge. Green
// is rare and brief on purpose — turn the speed down to hold it long enough to
// read.
const lightEls = [...lightsEl.querySelectorAll(".light")];

function paintLights() {
  const on = smoothingState();
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
  const on = smoothingState();
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
  const now = smoothingState();
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

wallEl.addEventListener("change", () => {
  bench.wall = wallEl.checked;
  url.searchParams.set("wall", bench.wall ? "on" : "off");
  history.replaceState(null, "", url);
  syncWall();
});

dummyEl.addEventListener("change", () => {
  bench.dummy = dummyEl.checked;
  url.searchParams.set("dummy", bench.dummy ? "on" : "off");
  history.replaceState(null, "", url);
  paintDummyPick();
  spawn(bench.char);
});

dummyCharEl.addEventListener("change", () => {
  bench.dummyChar = dummyCharEl.value;
  url.searchParams.set("dummy2", bench.dummyChar);
  history.replaceState(null, "", url);
  // Through `select` rather than `spawn`: a fighter the bench has not loaded
  // yet has no art, and select is what waits for it (and puts the loading
  // notice up while it does).
  select(bench.char);
});

/** The dummy picker only exists while there is a dummy. A dropdown that
 *  chooses who an absent fighter would be is a puzzle, not a control. */
function paintDummyPick() {
  dummyCharEl.hidden = !bench.dummy;
}

/** Alphabetical, by the name a person reads rather than the roster key — the
 *  list is 40-odd fighters and the key is an abbreviation of the name in most
 *  cases and a surname in the rest. Self sits above them all as the default. */
function fillDummyPick() {
  const rows = CHARACTER_KEYS
    .map((key) => ({ key, name: CHARACTERS[key]?.fullName || CHARACTERS[key]?.name || key }))
    .sort((a, b) => a.name.localeCompare(b.name));
  dummyCharEl.innerHTML = "";
  for (const { key, name } of [{ key: "self", name: "Self" }, ...rows]) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = name;
    dummyCharEl.append(opt);
  }
  // A `?dummy2=` naming somebody who is not on the roster falls back to self,
  // and the control has to agree with what spawn will actually do.
  if (!CHARACTERS[bench.dummyChar]) bench.dummyChar = "self";
  dummyCharEl.value = bench.dummyChar;
}

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
      read: (id) => {
        if (id !== 1) return blankInput();
        // Kept for the stick readout: this is the exact object the world is
        // about to be stepped with, so what the panel shows and what the
        // fighter was handed cannot disagree.
        bench.stick = playerInput(1);
        return bench.stick;
      },
      step: (d) => {
        // The drill's stick, pressed into the latch after `advanceWorld` has
        // filled it from the real pad and before the world reads it — which is
        // exactly where a second player's input would go. It holds a direction
        // rather than setting a flag, because `updateLedge` triggers the climb
        // off a held stick and nothing else would.
        const hold = runDrill(d);
        if (hold) latch[1][hold] = true;
        stepWorld(d, (f) => (f.id === 1 ? latch[1] : blankInput()));
        bench.steps += 1;
        // The drill parks the fighter off the edge on purpose; letting the
        // out-of-world reset fire mid-reach would snatch them back to the
        // middle before they ever touched the ledge.
        if (!bench.drill) keepOnStage();
      },
    });
    camZoom = state.camera.zoom;
    frameForBench();
  }
  draw(ctx);
  // Straight after the draw, because that is what it describes: which of the
  // armed mechanisms actually did something to the frame now on screen.
  paintActivity();
  paintAims();
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


// ------------------------------------------------------------- the two angles
//
// A diagonal attack that comes out level has two possible faults and they need
// opposite fixes: either the angle never reached the attack code (a deadzone, a
// threshold, a pad axis) or it arrived and the swing was drawn somewhere else.
// Arguing about it from the picture is hopeless, so both numbers are on screen.
//
//   stick         what input.js reports THIS FRAME, raw and signed
//   attack read   what `attackTilt` made of it when the attack began, kept
//                 until the next attack so the stick can be let go of
//
// They are deliberately not the same number. The attack folds the horizontal to
// a magnitude — back-and-up throws the same upward swing as forward-and-up —
// so a stick at 135° and one at 45° both reach the attack as 45°. Two readouts
// that always agreed would not be worth having.
function paintAims() {
  const s = bench.stick;
  const x = s?.moveX || 0;
  // `|| 0` on the negation as well, or a stick held flat left reports -180°:
  // negating a zero gives -0, and atan2(-0, -1) is minus pi.
  const y = -(s?.moveY || 0) || 0;         // up positive, the way an angle reads
  const mag = Math.hypot(x, y);
  stickEl.textContent = mag < 0.05
    ? "stick centred"
    : `stick ${Math.round(Math.atan2(y, x) * (180 / Math.PI))}° · ${mag.toFixed(2)}`;

  const a = state.fighters[0]?.attackAim;
  aimPanelEl.classList.toggle("is-aimed", !!a && a.verdict === "aimed");
  if (!a) { aimReadEl.textContent = "no attack yet"; return; }
  // `deg` is above horizontal with the horizontal FOLDED FORWARD, which is
  // what the attack read; `tilt` is where the swing actually went. When the
  // attack aims they are the same number, and that is the point — seeing them
  // agree is how you know the reading reached the swing.
  aimReadEl.textContent = `${a.deg}° at ${a.mag} → `
    + (a.verdict === "aimed" ? `swings ${a.tilt}°` : `${a.verdict}, swings 0°`);
}

// ------------------------------------------------------------ the ledge drill
//
// A ledge grab is four interesting frames at the end of a fall you have to set
// up by hand, off a platform edge you have to find, at a height with a 260px
// window — and if you miss you fall to your death and respawn in the middle.
// On a pad it takes a dozen tries to see once. That is a bad way to look at
// something, so this does the setup.
//
// IT DOES NOT FAKE THE STATE. Nothing here sets `f.ledge`, or an anim, or a
// transition. It puts the fighter in the air beside the edge, falling, with the
// gates `tryGrabLedge` actually checks satisfied — off the stage, out of
// hitstun, airborne long enough — and then holds a direction at the right
// moment. Every frame after that is the game's: the catch, the hang, the climb,
// and whatever the renderer does with them. A drill that assigned the hang pose
// directly would be a drill that could never show this pose being assigned
// wrongly, which is the entire reason to have it.
const DRILL = {
  // Long enough to see the hang settle and the timers arm, short of the 2.8s
  // auto-drop that would end the drill by dropping them.
  hang: 0.9,
  // If the catch never happens the drill has failed rather than hung: say so
  // and stop, instead of leaving the button lit forever.
  patience: 3,
};

function startDrill() {
  const f = state.fighters[0];
  const plat = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  if (!f || !plat) return;
  // Beside the edge they are facing, a little below the lip and falling: the
  // shape of every real ledge grab, and inside LEDGE_GRAB_X of the corner so
  // the next step catches it.
  const side = f.x < plat.x + plat.w / 2 ? -1 : 1;
  const edgeX = side === -1 ? plat.x : plat.x + plat.w;
  Object.assign(f, {
    x: edgeX + side * 24,
    y: plat.y + 40,
    vx: 0, vy: 60,
    grounded: false,
    // The gates tryGrabLedge reads. `airT` past its 0.18 threshold is the one
    // that would otherwise make the first attempt silently do nothing.
    airT: 0.5,
    ledge: null, ledgeMove: null, ledgeCooldown: 0, ledgeGrabs: 0,
    hitstun: 0, action: null, charging: false, shielding: false,
  });
  f.facing = -side;                   // looking back at the stage they fell off
  bench.drill = { phase: "reach", t: 0, side };
  paintDrill();
}

/** One frame of the drill. Returns the direction it wants HELD this step, or
 *  null — the input goes in through the latch like a pad would, because the
 *  climb is triggered by `updateLedge` reading a held stick and nothing else. */
function runDrill(dt) {
  const d = bench.drill;
  if (!d) return null;
  const f = state.fighters[0];
  if (!f) { bench.drill = null; return null; }
  d.t += dt;

  if (d.phase === "reach") {
    if (f.ledge) { d.phase = "hang"; d.t = 0; paintDrill(); }
    else if (d.t > DRILL.patience) { d.phase = "missed"; paintDrill(); bench.drill = null; }
    return null;
  }
  if (d.phase === "hang") {
    if (d.t < DRILL.hang) return null;
    d.phase = "climb"; d.t = 0;
    paintDrill();
    return null;
  }
  if (d.phase === "climb") {
    // Held INWARD — toward the stage — which is what a player holds to climb.
    // Released the moment they are standing, so the drill does not walk them
    // off the far side afterwards.
    if (f.grounded && !f.ledgeMove) { bench.drill = null; paintDrill(); return null; }
    if (d.t > DRILL.patience) { bench.drill = null; paintDrill(); return null; }
    return d.side === -1 ? "right" : "left";
  }
  return null;
}

function paintDrill() {
  const d = bench.drill;
  drillEl.classList.toggle("is-on", !!d);
  drillEl.textContent = d ? `ledge drill · ${d.phase}` : "ledge drill";
}

drillEl.addEventListener("click", startDrill);

// ------------------------------------------------------------------- the wall
//
// Built from the board rather than written down, so it lands correctly on
// whichever stage the bench was opened with (`?stage=`): up the middle of the
// main platform, as tall as the LOWEST thing above it — the side platforms —
// which is what makes going over it a matter of using them.
//
// Appended, never inserted. Several places here and in the game reach for
// `state.platforms[0]` meaning "the floor".
const WALL_W = 20;

function wallShape() {
  const main = state.platforms.find((p) => p.kind === "main") || state.platforms[0];
  const above = state.platforms.filter((p) => p !== main && p.kind !== "wall" && p.y < main.y);
  // The lowest of the platforms above the floor: the tier you climb to first.
  const tier = above.length ? above.reduce((low, p) => (p.y > low.y ? p : low)) : null;
  const top = tier ? tier.y : main.y - 150;
  return { x: Math.round(main.x + main.w / 2 - WALL_W / 2), y: top,
           w: WALL_W, h: main.y - top, kind: "wall",
           accent: "rgba(255, 211, 92, 0.45)" };
}

function syncWall() {
  state.platforms = state.platforms.filter((p) => p.kind !== "wall");
  if (!bench.wall) return;
  state.platforms.push(wallShape());
  // Nobody is left standing inside it. `pushOutOfWalls` would do this on the
  // next step anyway, but it would do it as a jump on screen.
  const w = state.platforms[state.platforms.length - 1];
  for (const f of state.fighters) {
    if (f.y <= w.y || Math.abs(f.x - (w.x + w.w / 2)) > 90) continue;
    f.x += f.x < w.x + w.w / 2 ? -90 : 90;
    f.vx = 0;
  }
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
  fillDummyPick();
  paintDummyPick();
  wallEl.checked = bench.wall;
  syncWall();
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
                  dummy: state.fighters[1]?.charKey || null,
                  dummyChar: bench.dummyChar,
                  anim: state.fighters[0]?.animKey, smoothing: smoothingState(),
                  steps: bench.steps, speed: bench.speed,
                  activity: { ...smoothingActivity },
                  stick: bench.stick
                    ? { x: bench.stick.moveX || 0, y: bench.stick.moveY || 0 } : null,
                  attackAim: state.fighters[0]?.attackAim || null,
                  aimText: aimReadEl.textContent, stickText: stickEl.textContent,
                  // What the loop is responsible for retiring. A number here
                  // that only ever grows is the bug this bench shipped with:
                  // the world was stepped and the PRESENTATION was not, so
                  // every spark, damage number and banner ever spawned stayed
                  // on screen for the life of the page.
                  wall: state.platforms.find((p) => p.kind === "wall") || null,
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
