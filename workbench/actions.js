// Action Workbench (`workbench/?edit=actions`) — play any character action and
// jump straight to the sprites it uses.
//
// Like the sprite workbench, every pixel goes through the GAME'S OWN modules
// (assets.js, sprites.js, characters.js, moves.js), so the playback here is the
// same animation the match plays: same frames, same fps, same startup/active/
// recovery timing derived from moves.js. Nothing is re-implemented, which is
// the whole point — a pose that looks wrong here is wrong in the game.

import { loadAssets, frameImage, frameMeta, getImage, spriteManifest } from "../src/assets.js";
import { drawCharFrame, currentFrame, warmAnchors, anchorScreenPos } from "../src/sprites.js";
import { drawPlatformShape } from "../src/render.js";
import { CHARACTERS, CHARACTER_KEYS, animFor } from "../src/characters.js";
import { lightMove, heavyMove } from "../src/moves.js";
import { fighterTransform } from "../src/motion.js";
import { SHIELD_MAX, MAX_FALL } from "../src/constants.js";
import { TUMBLE_SPIN_MAX, LAND_SQUASH_TIME, TAKEOFF_STRETCH_TIME } from "../src/config_tuning.js";

const $ = (id) => document.getElementById(id);
const view = $("actionsView");

const GROUND_Y = 470;
const AIR_LIFT = 150;          // how far off the floor aerial actions are drawn
const LOOP_HOLD = 1.6;         // seconds to run a looping anim before it ends

const BACKGROUNDS = [
  ["#12151f", "dark"], ["#5c6478", "grey"], ["#f2f4f8", "white"],
  ["#0f7a3d", "green"], ["#ff00ff", "magenta"], ["#7a3d0f", "brown"],
];

// Grounded movement / reaction states, in the order they read as a kit.
const STATES = [
  ["idle", "Idle"], ["run", "Run"], ["dash", "Dash"], ["jump", "Jump", true],
  ["fall", "Fall", true], ["land", "Land"], ["crouch", "Crouch"],
  ["shield", "Shield"], ["dodge", "Dodge"],
  // The two states a match actually plays; `dodge` above is only the fallback
  // for characters whose round-6 art never landed.
  ["dodge_roll", "Roll"], ["dodge_air", "Air dodge", true],
  ["ledge", "Ledge hang", true],
  ["hurt", "Hurt"], ["dizzy", "Dizzy"], ["charge", "Charge (smash)"],
  ["win", "Victory"],
];

const LIGHTS = [
  ["jab", "Jab 1", 0], ["jab", "Jab 2", 1], ["jab", "Jab 3 (finisher)", 2],
  ["side", "Side tilt"], ["up", "Up tilt"], ["down", "Down tilt (crouch)"],
  ["air", "Air light", 0, true], ["upAir", "Up air", 0, true], ["downAir", "Down air", 0, true],
];

const HEAVIES = [
  ["side", "Side smash"], ["up", "Up smash"], ["down", "Down smash"],
  ["air", "Air heavy", true],
];

const state = {
  char: "gojo",
  action: null,
  t: 0,
  playing: false,
  loop: true,
  speed: 1,
  zoom: 1.9,
  facing: 1,
  bg: BACKGROUNDS[0][0],
};

let canvas, ctx;

// ------------------------------------------------------------ action model

/** Every "effect:*" / "summon:*" image referenced anywhere inside a params
 *  object. Specials hide them under different keys (sprite, aura,
 *  domainSprite, …), so scan by value rather than guessing key names. */
function spriteRefs(obj, out = []) {
  if (!obj || typeof obj !== "object") return out;
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && /^(effect|summon):/.test(v)) {
      if (!out.includes(v)) out.push(v);
    } else if (v && typeof v === "object") spriteRefs(v, out);
  }
  return out;
}

function fmt(n) {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
}

function attackAction(id, label, move, group, air) {
  const total = (move.delay || 0) + (move.dur || 0) + (move.recover || 0);
  return {
    id, label, group, air,
    anim: move.anim,
    duration: total,
    move,
    facts: [
      `${fmt(move.dmg)} dmg`,
      `kb ${fmt(move.baseKb)}/${fmt(move.growth)}`,
      `startup ${Math.round(move.delay * 1000)}ms`,
      `active ${Math.round(move.dur * 1000)}ms`,
      `recover ${Math.round(move.recover * 1000)}ms`,
      ...(move.effect ? [move.effect] : []),
      ...(move.spike ? ["spike"] : []),
    ],
    sub: move.label || null,
  };
}

/** Every action a character can be seen performing, grouped for the panel. */
function actionsFor(charKey) {
  const char = CHARACTERS[charKey];
  const groups = [];

  groups.push({
    name: "States",
    items: STATES.map(([anim, label, air]) => {
      const a = animFor(charKey, anim);
      return {
        id: `state:${anim}`, label, group: "States", anim, air,
        duration: Math.max(a.frames.length / (a.fps || 1), 0.3),
        loopAnim: !!a.loop,
        facts: [`${a.frames.length} frame${a.frames.length === 1 ? "" : "s"}`,
                `${a.fps} fps`, a.loop ? "loops" : "one-shot"],
      };
    }),
  });

  groups.push({
    name: "Light attacks",
    items: LIGHTS.map(([variant, label, step = 0, air]) =>
      attackAction(`light:${variant}:${step}`, label,
        lightMove(char, variant, step), "Light attacks", air)),
  });

  groups.push({
    name: "Heavy attacks",
    items: HEAVIES.map(([variant, label, air]) =>
      attackAction(`heavy:${variant}`, label,
        heavyMove(char, variant, 0), "Heavy attacks", air)),
  });

  const slots = [["neutral", "specialNeutral", "Neutral B"],
                 ["side", "specialSide", "Side B"],
                 ["down", "specialDown", "Down B"]];
  groups.push({
    name: "Specials",
    items: slots.flatMap(([slot, anim, prefix]) => {
      const cfg = char.specials?.[slot];
      if (!cfg) return [];
      const a = animFor(charKey, anim);
      return [{
        id: `special:${slot}`, label: `${prefix} — ${cfg.name}`, group: "Specials", anim,
        duration: a.loop ? LOOP_HOLD : Math.max(a.frames.length / (a.fps || 1), 0.45),
        desc: cfg.desc,
        extras: spriteRefs(cfg.p),
        facts: [cfg.type, `${fmt(cfg.cooldown)}s cooldown`,
                ...(cfg.p?.dmg ? [`${fmt(cfg.p.dmg)} dmg`] : [])],
      }];
    }),
  });

  if (char.ultimate) {
    const a = animFor(charKey, "ult");
    groups.push({
      name: "Ultimate",
      items: [{
        id: "ult", label: char.ultimate.name, group: "Ultimate", anim: "ult",
        duration: a.loop ? LOOP_HOLD : Math.max(a.frames.length / (a.fps || 1), 0.8),
        desc: char.ultimate.desc,
        extras: spriteRefs(char.ultimate.p),
        facts: [char.ultimate.type,
                ...(char.ultimate.p?.dmg ? [`${fmt(char.ultimate.p.dmg)} dmg`] : []),
                ...(char.ultimate.p?.duration ? [`${fmt(char.ultimate.p.duration)}s`] : [])],
      }],
    });
  }

  return groups;
}

// ------------------------------------------------------- procedural motion
//
// Most states are one still frame, so the game leans, tumbles, swings and
// breathes them procedurally (src/motion.js). Judging that here means standing
// up the fighter state the real match would be in while this action plays —
// the transform itself then comes from the game's own code, unmodified.

function mockFighter(a) {
  const f = {
    id: 1, charKey: state.char, char: CHARACTERS[state.char],
    x: 0, y: 0, vx: 0, vy: 0, facing: state.facing,
    animKey: a.anim, animTime: state.t,
    spin: 0, spinAngle: 0, hitstun: 0, dizzy: 0, ledge: null,
    action: null, charging: null, shielding: false,
    grounded: !a.air, dashT: 0, dashDir: state.facing, turnLock: 0,
    shield: SHIELD_MAX, landT: 0, takeoffT: 0, shakeMag: 0, fastFalling: false,
  };
  const k = state.t / Math.max(a.duration, 1e-3);

  if (a.move) {
    f.action = { kind: "attack", t: state.t, dur: a.duration, move: a.move };
    return f;
  }
  switch (a.anim) {
    case "dodge_roll": case "dodge":
      f.action = { kind: "dodge", t: state.t, dur: a.duration };
      f.vx = 500 * state.facing;
      break;
    case "dodge_air":
      f.action = { kind: "dodge", t: state.t, dur: a.duration };
      f.grounded = false; f.vx = 340 * state.facing;
      break;
    case "run": f.vx = f.char.stats.speed * state.facing; break;
    case "dash": f.dashT = 0.2; f.vx = f.char.stats.speed * 1.45 * state.facing; break;
    case "jump":
      f.grounded = false; f.vy = -f.char.stats.jump;
      f.takeoffT = TAKEOFF_STRETCH_TIME * (1 - k);
      break;
    case "fall":
      f.grounded = false; f.vy = MAX_FALL * 0.8; f.fastFalling = true;
      f.vx = f.char.stats.airSpeed * 0.7 * state.facing;
      break;
    case "land": f.landT = LAND_SQUASH_TIME * (1 - k); break;
    case "charge": f.charging = { t: state.t, variant: "side" }; break;
    case "shield": f.shielding = true; f.shield = SHIELD_MAX * (1 - k * 0.9); break;
    case "dizzy": f.dizzy = 1; break;
    case "ledge":
      f.grounded = false;
      f.ledge = { side: state.facing === 1 ? -1 : 1, edgeX: 0, plat: { y: 0 } };
      break;
    case "hurt":
      // show the tumble, which is the whole point of a one-frame hurt pose
      f.grounded = false; f.hitstun = 1; f.vx = 700 * -state.facing;
      f.spin = TUMBLE_SPIN_MAX * 0.45 * -state.facing;
      f.spinAngle = f.spin * state.t;
      break;
  }
  return f;
}

// ------------------------------------------------------------------- draw

function activeWindow(a) {
  if (!a?.move) return null;
  return [a.move.delay || 0, (a.move.delay || 0) + (a.move.dur || 0)];
}

function drawBoxes(a, cx, feetY) {
  const z = state.zoom;
  // Hurtbox: combat.js measures it from the fighter's feet in world px, so it
  // only needs the viewer zoom — the sprite scale is already baked into the art.
  const crouch = a.anim === "crouch" || a.anim === "crouchAttack";
  const hb = crouch ? { x: -36, y: -68, w: 72, h: 68 }
           : a.anim === "ledge" ? { x: -30, y: -82, w: 60, h: 84 }
           : { x: -32, y: -108, w: 64, h: 108 };
  ctx.strokeStyle = "rgba(120, 190, 255, 0.75)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(cx + hb.x * z, feetY + hb.y * z, hb.w * z, hb.h * z);
  ctx.setLineDash([]);

  const win = activeWindow(a);
  if (!win || state.t < win[0] || state.t >= win[1]) return;
  const m = a.move;
  // Mirrors combat.hitboxRect: ox is measured from the fighter's front edge.
  const x = state.facing === 1 ? cx + m.ox * z : cx - (m.ox + m.w) * z;
  ctx.fillStyle = "rgba(255, 90, 120, 0.22)";
  ctx.strokeStyle = "rgba(255, 90, 120, 0.9)";
  ctx.fillRect(x, feetY + m.oy * z, m.w * z, m.h * z);
  ctx.strokeRect(x, feetY + m.oy * z, m.w * z, m.h * z);
}

function render() {
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const a = state.action;
  if (!a) return;

  const cx = canvas.width / 2;
  const feetY = GROUND_Y - (a.air ? AIR_LIFT : 0);

  if ($("aShowPlatform").checked) {
    ctx.save();
    ctx.translate(0, GROUND_Y);
    drawPlatformShape(ctx, { x: cx - 340, y: 0, w: 680, h: 42, kind: "main" });
    ctx.restore();
  }

  const frame = currentFrame(state.char, a.anim, state.t);
  const m = $("aMotion").checked ? fighterTransform(mockFighter(a)) : null;
  drawCharFrame(ctx, state.char, frame, cx, feetY, {
    scale: CHARACTERS[state.char].scale * state.zoom,
    facing: state.facing,
    rotation: m?.rotation ?? 0,
    scaleX: m?.scaleX ?? 1,
    scaleY: m?.scaleY ?? 1,
    offsetX: m?.offsetX ?? 0,
    offsetY: m?.offsetY ?? 0,
  });

  if ($("aShowAnchor").checked) drawComMarker(frame, cx, feetY);
  if ($("aShowBoxes").checked) drawBoxes(a, cx, feetY);

  const win = activeWindow(a);
  const phase = !win ? "" : state.t < win[0] ? "startup"
              : state.t < win[1] ? "ACTIVE" : "recovery";
  $("aFrameTag").innerHTML =
    `${state.char}/<b>${frame}</b> <span class="state">${a.anim}</span>` +
    (phase ? ` <span class="${phase === "ACTIVE" ? "flag" : "state"}">${phase}</span>` : "");

  paintTimeline();
  highlightCurrentSprite(frame);
}

/** The pivot the motion above turns about, so a rotation that looks wrong can
 *  be traced to its anchor and fixed in the sprite workbench. */
function drawComMarker(frameKey, cx, feetY) {
  const p = anchorScreenPos(state.char, frameKey, cx, feetY, {
    scale: CHARACTERS[state.char].scale * state.zoom, facing: state.facing, name: "com",
  });
  if (!p) return;
  const px = p.x, py = p.y;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 235, 190, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px - 13, py); ctx.lineTo(px - 3, py);
  ctx.moveTo(px + 3, py); ctx.lineTo(px + 13, py);
  ctx.moveTo(px, py - 13); ctx.lineTo(px, py - 3);
  ctx.moveTo(px, py + 3); ctx.lineTo(px, py + 13);
  ctx.stroke();
  ctx.restore();
}

function paintTimeline() {
  const a = state.action;
  const bar = $("aTimeline");
  if (!a) return;
  const pct = Math.min(1, state.t / a.duration) * 100;
  bar.querySelector(".play-head").style.left = `${pct}%`;
  $("aTime").textContent = `${state.t.toFixed(2)}s / ${a.duration.toFixed(2)}s`;
}

function buildTimeline() {
  const a = state.action;
  const bar = $("aTimeline");
  bar.innerHTML = "";
  if (!a) return;
  const win = activeWindow(a);
  const seg = (from, to, cls, title) => {
    const d = document.createElement("div");
    d.className = `seg ${cls}`;
    d.style.left = `${(from / a.duration) * 100}%`;
    d.style.width = `${((to - from) / a.duration) * 100}%`;
    d.title = title;
    bar.appendChild(d);
  };
  if (win) {
    seg(0, win[0], "startup", "startup");
    seg(win[0], win[1], "active", "active");
    seg(win[1], a.duration, "recover", "recovery");
  } else {
    seg(0, a.duration, "neutral", a.anim);
  }
  // Frame boundaries, so a two-frame swing shows exactly when it switches.
  const anim = animFor(state.char, a.anim);
  const step = 1 / (anim.fps || 1);
  for (let t = step; t < a.duration - 1e-3; t += step) {
    const d = document.createElement("div");
    d.className = "tick";
    d.style.left = `${(t / a.duration) * 100}%`;
    bar.appendChild(d);
  }
  const head = document.createElement("div");
  head.className = "play-head";
  bar.appendChild(head);
}

// -------------------------------------------------------------- the drawer

function spriteTile({ href, thumb, title, sub, key }) {
  const el = document.createElement(href ? "a" : "div");
  el.className = "sprite-tile";
  if (href) el.href = href;
  if (key) el.dataset.frame = key;
  const box = document.createElement("div");
  box.className = "thumb";
  if (thumb) {
    const img = document.createElement("img");
    img.src = thumb;
    box.appendChild(img);
  } else {
    box.classList.add("missing");
    box.textContent = "missing";
  }
  const name = document.createElement("strong");
  name.textContent = title;
  const note = document.createElement("span");
  note.textContent = sub;
  el.append(box, name, note);
  return el;
}

function openDrawer(a) {
  const drawer = $("aDrawer");
  drawer.classList.add("open");
  document.body.classList.add("drawer-open");
  $("aDrawerTitle").textContent = a.label;
  $("aDrawerSub").textContent =
    `${CHARACTERS[state.char].name} · anim "${a.anim}"` + (a.sub ? ` · ${a.sub}` : "");
  $("aDrawerFacts").innerHTML = (a.facts || [])
    .map((f) => `<span class="fact">${f}</span>`).join("");
  $("aDrawerDesc").textContent = a.desc || "";
  $("aDrawerDesc").hidden = !a.desc;

  const anim = animFor(state.char, a.anim);
  const frames = [...new Set(anim.frames)];
  const grid = $("aSprites");
  grid.innerHTML = "";
  for (const key of frames) {
    const img = frameImage(state.char, key);
    const meta = frameMeta(state.char, key);
    grid.appendChild(spriteTile({
      href: `./?char=${state.char}&frame=${encodeURIComponent(key)}`,
      thumb: img?.src,
      title: key,
      sub: meta?.file ? meta.file.split("/").pop() : "not in manifest",
      key,
    }));
  }

  // Effects and summons the move spawns. They live outside the character
  // manifest, so there is nothing for the sprite workbench to edit — the tile
  // opens the PNG itself instead.
  const extras = a.extras || [];
  $("aExtrasWrap").hidden = extras.length === 0;
  const ex = $("aExtras");
  ex.innerHTML = "";
  for (const ref of extras) {
    const img = getImage(ref);
    ex.appendChild(spriteTile({
      href: img?.src,
      thumb: img?.src,
      title: ref.split(":")[1],
      sub: ref.startsWith("summon:") ? "summon" : "effect",
    }));
  }
}

function closeDrawer() {
  $("aDrawer").classList.remove("open");
  document.body.classList.remove("drawer-open");
}

function highlightCurrentSprite(frameKey) {
  for (const el of $("aSprites").children) {
    el.classList.toggle("now", el.dataset.frame === frameKey);
  }
}

// ------------------------------------------------------------------ panel

function buildActionList() {
  const wrap = $("aActions");
  wrap.innerHTML = "";
  for (const group of actionsFor(state.char)) {
    if (!group.items.length) continue;
    const h = document.createElement("label");
    h.textContent = group.name;
    wrap.appendChild(h);
    const list = document.createElement("div");
    list.className = "action-list";
    for (const item of group.items) {
      const b = document.createElement("button");
      b.className = "action-btn" + (state.action?.id === item.id ? " sel" : "");
      b.innerHTML = `<span>${item.label}</span><em>${item.anim}</em>`;
      b.onclick = () => playAction(item);
      list.appendChild(b);
    }
    wrap.appendChild(list);
  }
  // Keep the playing action visible when it was chosen by URL or carried over
  // from another character rather than clicked. Scrolling the panel directly
  // (rather than scrollIntoView) keeps the page itself put.
  const sel = wrap.querySelector(".action-btn.sel");
  if (sel) wrap.scrollTop = Math.max(0, sel.offsetTop - wrap.clientHeight / 2);
}

function playAction(a) {
  state.action = a;
  state.t = 0;
  state.playing = true;
  buildActionList();
  buildTimeline();
  openDrawer(a);
  render();
}

function replay() {
  if (!state.action) return;
  state.t = 0;
  state.playing = true;
}

// ------------------------------------------------------------------- loop

let last = 0;
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const a = state.action;
  if (a && state.playing) {
    state.t += dt * state.speed;
    if (state.t >= a.duration) {
      if (state.loop) state.t = 0;
      else { state.t = a.duration; state.playing = false; $("aPlay").textContent = "▶ Replay"; }
    }
  }
  render();
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ chrome

function markup() {
  view.className = "layout";
  view.innerHTML = `
    <section class="stage-col">
      <div class="stage-wrap">
        <canvas id="aStage" width="760" height="620"></canvas>
        <div id="aFrameTag" class="frame-tag">pick an action →</div>
      </div>

      <div class="transport">
        <button id="aPlay" class="ghost sm">▶ Replay</button>
        <div id="aTimeline" class="timeline"></div>
        <span id="aTime" class="mono dim">0.00s</span>
      </div>

      <div class="row">
        <div class="group grow">
          <label>Viewer zoom <span class="sub" id="aZoomVal">1.9x</span></label>
          <input type="range" id="aZoom" min="0.6" max="5" step="0.05" value="1.9">
        </div>
        <div class="group grow">
          <label>Playback speed <span class="sub" id="aSpeedVal">1x</span></label>
          <input type="range" id="aSpeed" min="0.1" max="1.5" step="0.05" value="1">
        </div>
        <div class="group">
          <label>Background</label>
          <div id="aBg" class="swatches"></div>
        </div>
      </div>

      <div class="group">
        <label>Options</label>
        <div class="chips">
          <label class="chip"><input type="checkbox" id="aLoop" checked> Loop</label>
          <label class="chip"><input type="checkbox" id="aShowPlatform" checked> Game platform</label>
          <label class="chip"><input type="checkbox" id="aShowBoxes"> Hurtbox / hitbox</label>
          <label class="chip"><input type="checkbox" id="aFlip"> Face left</label>
          <label class="chip"><input type="checkbox" id="aMotion" checked> Procedural motion</label>
          <label class="chip"><input type="checkbox" id="aShowAnchor"> Centre of mass</label>
        </div>
        <p class="note">Frames, fps and startup/active/recovery come from the
          game's own <code>characters.js</code> and <code>moves.js</code>, so the
          playback above is what a match plays. Aerials are drawn off the floor.</p>
        <p class="note">Procedural motion runs the real <code>motion.js</code>
          against the fighter state this action implies — the tumble on Hurt,
          the roll on Dodge, the swing arc on attacks. Untick to see the raw
          frames. Anything that pivots wrongly is an anchor to fix in the
          sprite workbench.</p>
      </div>
    </section>

    <section class="panel">
      <div class="group">
        <label for="aChar">Character</label>
        <select id="aChar"></select>
      </div>
      <div id="aActions" class="actions-panel"></div>
    </section>

    <div id="aDrawer" class="drawer">
      <div class="drawer-bar">
        <div>
          <strong id="aDrawerTitle">—</strong>
          <span id="aDrawerSub" class="dim"></span>
        </div>
        <div id="aDrawerFacts" class="facts"></div>
        <button id="aDrawerClose" class="ghost sm">Close</button>
      </div>
      <p id="aDrawerDesc" class="note" hidden></p>
      <label>Sprites used <span class="sub">click to edit in the sprite workbench</span></label>
      <div id="aSprites" class="sprite-grid"></div>
      <div id="aExtrasWrap" hidden>
        <label>Effects &amp; summons <span class="sub">opens the PNG</span></label>
        <div id="aExtras" class="sprite-grid"></div>
      </div>
    </div>`;
}

async function boot() {
  markup();
  canvas = $("aStage");
  ctx = canvas.getContext("2d");

  const sel = $("aChar");
  for (const key of CHARACTER_KEYS) {
    const o = document.createElement("option");
    o.value = key; o.textContent = CHARACTERS[key].name;
    sel.appendChild(o);
  }
  sel.onchange = () => setChar(sel.value);

  const sw = $("aBg");
  BACKGROUNDS.forEach(([colour, name], i) => {
    const b = document.createElement("button");
    b.style.background = colour; b.title = name;
    if (i === 0) b.classList.add("on");
    b.onclick = () => {
      state.bg = colour;
      [...sw.children].forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
    };
    sw.appendChild(b);
  });

  $("aZoom").oninput = (e) => {
    state.zoom = parseFloat(e.target.value);
    $("aZoomVal").textContent = `${state.zoom.toFixed(2)}x`;
  };
  $("aSpeed").oninput = (e) => {
    state.speed = parseFloat(e.target.value);
    $("aSpeedVal").textContent = `${state.speed.toFixed(2)}x`;
  };
  $("aLoop").onchange = (e) => {
    state.loop = e.target.checked;
    if (state.loop) replay();
  };
  $("aFlip").onchange = (e) => { state.facing = e.target.checked ? -1 : 1; };
  $("aPlay").onclick = () => { replay(); $("aPlay").textContent = "▶ Replay"; };
  $("aDrawerClose").onclick = () => closeDrawer();

  $("aTimeline").onclick = (e) => {
    if (!state.action) return;
    const r = e.currentTarget.getBoundingClientRect();
    state.t = ((e.clientX - r.left) / r.width) * state.action.duration;
    state.playing = false;
    $("aPlay").textContent = "▶ Replay";
  };

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); replay(); }
    if (e.key === "Escape") closeDrawer();
  });

  await loadAssets(() => {});
  warmAnchors(CHARACTER_KEYS);
  $("loadState").textContent = "assets loaded";
  $("loadState").classList.add("done");

  const params = new URLSearchParams(location.search);
  setChar(CHARACTER_KEYS.includes(params.get("char")) ? params.get("char") : "gojo");

  const wanted = params.get("action");
  const first = actionsFor(state.char).flatMap((g) => g.items);
  playAction(first.find((i) => i.id === wanted) || first[0]);

  requestAnimationFrame((t) => { last = t; tick(t); });
}

function setChar(charKey) {
  state.char = charKey;
  $("aChar").value = charKey;
  const keep = state.action?.id;
  const items = actionsFor(charKey).flatMap((g) => g.items);
  const next = items.find((i) => i.id === keep) || items[0];
  if (next) playAction(next); else buildActionList();
}

// `spriteManifest` is only read through the game's helpers, but a missing
// manifest means nothing can draw — surface that instead of a blank canvas.
boot().catch((err) => {
  $("loadState").textContent = `failed: ${err.message}`;
  console.error(err, spriteManifest);
});
