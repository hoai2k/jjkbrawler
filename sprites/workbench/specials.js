// The SPECIALS WORKBENCH (`/workbench/?edit=specials`).
//
// Everything a fighter throws that is not a normal attack, on one page: the
// three B specials, the ultimate, and the Domain Expansion — each one with the
// BUTTON that casts it, what it COSTS, what it does, and a preview that is the
// move itself rather than a picture of it.
//
// WHY IT EXISTS. A kit's specials are written in four places that have no
// reason to agree with each other: the move and its numbers in characters.js,
// the button in config_controls.js, the slot the button picks in fighter.js,
// and the handler that decides what the numbers mean in specials.js /
// ultimates.js / domains.js. Reading a kit meant holding all four open, and
// comparing two kits meant holding eight. This puts one fighter's whole
// technique list in front of you with its mappings and its costs beside it, so
// "why does his side-B hit harder than his ultimate" is a question you can
// see the answer to instead of one you have to go and assemble.
//
// THE PREVIEW IS A REAL MATCH. The bench stands two fighters on a real stage,
// calls the game's own performSpecial / performUltimate / performDomain, and
// steps the same simulation the match loop steps — then hands the frame to
// render.js. Nothing here re-implements a move or draws one: what plays is the
// technique, with its real startup, its real projectiles, its real summons, its
// real screen shake, against a body that takes the hit and gets launched by it.
// A special that looks wrong here is wrong in the game.
//
// The dummy is the other half of judging power. It is a live fighter, not a
// post: it flinches, it takes damage, it flies, and how far it flies at the
// damage you set it to is the reading the numbers panel cannot give you.

import { state } from "../../src/state.js";
import { CHARACTERS, CHARACTER_KEYS } from "../../src/characters.js";
import { makeFighter, updateFighter } from "../../src/fighter.js";
import { performSpecial } from "../../src/specials.js";
import { performUltimate } from "../../src/ultimates.js";
import { performDomain, domainStickFor, charDomainSpecialSlot } from "../../src/domains.js";
import { updateHitboxes, updateProjectiles, stepHitCredit } from "../../src/combat.js";
import { updateParticles } from "../../src/particles.js";
import { updateCamera } from "../../src/camera.js";
import { draw } from "../../src/render.js";
import { blankInput } from "../../src/input.js";
import { getStage, STAGES } from "../../src/stages.js";
import { initStageFx } from "../../src/stage_fx.js";
import { loadCoreAssets, ensureMatchAssets } from "../../src/assets.js";
import { padLabelsFor, KEY_BINDS, keyLabel } from "../../src/config_controls.js";
import { WORLD, METER_MAX, ULT_METER_COST, DOMAIN_METER_COST } from "../../src/constants.js";
import { fillCharSelect } from "./char_select.js";
import { initTooltips } from "./tooltip.js";
import { fitStageCanvas } from "./fit_stage.js";

const $ = (id) => document.getElementById(id);
const view = $("specialsView");

// The board the preview runs on. A wide main platform with side shelves, so a
// launched dummy has somewhere to land and a summon has somewhere to stand —
// this bench is where the last change to summon footing would have been seen.
const DEFAULT_STAGE = "academyHall";

// Where the two of them start, and how far apart. Close enough that a
// short-range special connects without anyone driving, far enough that a
// projectile is visibly a projectile rather than a point-blank hit.
const CASTER_X = 470;
const DUMMY_GAP = 250;

// How long a preview runs before it loops, per KIND of technique. One number
// for all of them was wrong at both ends: a jab-fast special made you sit
// through six seconds of two fighters standing still before it came round
// again, and a domain was cut off mid-sentence. A domain is asked how long it
// runs (its own `duration`) and given time on top to open and close.
const RUN_TIME = { special: 3.4, ult: 5.5, domain: 4 };
const DOMAIN_TAIL = 3;

function runTimeOf(a) {
  if (!a) return RUN_TIME.special;
  if (a.kind === "domain") return (a.duration || RUN_TIME.domain) + DOMAIN_TAIL;
  return RUN_TIME[a.kind] ?? RUN_TIME.special;
}

// A preview steps at a fixed rate rather than off the wall clock: two runs of
// the same move must play identically, or comparing them proves nothing.
const SIM_DT = 1 / 60;

const wb = {
  char: "gojo",
  action: null,          // the entry being previewed
  t: 0,
  playing: false,
  speed: 1,
  loop: true,
  // What the dummy is standing at when the move lands. Knockback scales with
  // damage, so the same special sends them a step at 0% and off the board at
  // 120% — which is the whole reason this is a control rather than a constant.
  dummyDamage: 60,
  dummyGuards: false,
  boxes: false,
  stage: DEFAULT_STAGE,
};

let canvas, ctx, caster, dummy, raf = 0;

// ------------------------------------------------------------ the mappings
//
// Asked of the control map and the sim, never written down here. `padLabelsFor`
// reads the same table input.js reads, the special SLOT rule is the one
// fighter.js applies, and how a fighter with several domains splits them across
// the stick is domains.js's own answer (domainStickFor) — the moves screen asks
// it the same question. A bench that stated its own mappings would be a fourth
// place for them to disagree, which is the problem it was built to end.

const padLabel = (id) => padLabelsFor(id).join(" or ") || "—";

/** The keyboard stand-in for player 1, which is how this bench is actually
 *  driven — there may be no pad plugged into the machine doing the balancing. */
const keyFor = (id) => (KEY_BINDS[1][id] || []).map(keyLabel).join(" / ");

/** How the special button picks a slot (fighter.js): down beats a direction,
 *  a direction beats neutral. */
const SPECIAL_SLOTS = [
  ["neutral", "Neutral B", () => padLabel("special"), "no direction held"],
  ["side", "Side B", () => `${padLabel("special")} + ◀ ▶`, "left stick held sideways"],
  ["down", "Down B", () => `${padLabel("special")} + ▼`, "left stick held down, or crouching"],
];

// ------------------------------------------------------------- the entries

function num(n) {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : null;
}

/** The numbers worth putting side by side — the "power mapping" half of this
 *  bench. Pulled off the move's own params, so a kit that names a field this
 *  does not know about simply does not show it, and one that renames a field
 *  stops showing it rather than showing a stale number. */
function powerFacts(p = {}) {
  const facts = [];
  if (num(p.dmg)) facts.push(`${num(p.dmg)} dmg`);
  if (num(p.base) || num(p.growth)) facts.push(`kb ${num(p.base) ?? "—"}/${num(p.growth) ?? "—"}`);
  if (num(p.duration)) facts.push(`${num(p.duration)}s`);
  if (num(p.speed)) facts.push(`${num(p.speed)}px/s`);
  if (num(p.cost)) facts.push(`${num(p.cost)} meter`);
  if (p.effect) facts.push(p.effect);
  if (p.unblockable) facts.push("unblockable");
  if (p.pierce) facts.push("pierces");
  return facts;
}

/** Every technique this fighter has, in the order the buttons are laid out on
 *  the pad: the three specials, then the ultimate, then the domain. */
function entriesFor(charKey) {
  const c = CHARACTERS[charKey];
  const groups = [];

  groups.push({
    name: "Specials",
    note: `Special is ${padLabel("special")} on a pad, ${keyFor("special")} on the keyboard. `
        + "Which of the three you get is the left stick at the moment you press it.",
    items: SPECIAL_SLOTS.flatMap(([slot, label, mapping, how]) => {
      const cfg = c.specials?.[slot];
      if (!cfg) return [];
      return [{
        kind: "special", slot,
        label, mapping: mapping(), how,
        name: cfg.name, desc: cfg.desc, type: cfg.type,
        cost: cfg.p?.cost ? `${cfg.p.cost} meter` : null,
        facts: [cfg.type, `${num(cfg.cooldown ?? 1.2)}s cooldown`, ...powerFacts(cfg.p)],
        // The Simple Domain case: a special the DOMAIN button also casts.
        alsoDomain: charDomainSpecialSlot(c) === slot,
      }];
    }),
  });

  if (c.ultimate) {
    groups.push({
      name: "Ultimate",
      note: `${padLabel("ult")} on a pad, ${keyFor("ult")} on the keyboard. Costs a full bar.`,
      items: [{
        kind: "ult",
        label: "Ultimate", mapping: padLabel("ult"), how: "a full meter bar, no direction",
        name: c.ultimate.name, desc: c.ultimate.desc, type: c.ultimate.type,
        cost: `${ULT_METER_COST} meter (full bar)`,
        facts: [c.ultimate.type, ...powerFacts(c.ultimate.p)],
      }],
    });
  }

  const domains = c.domains || [];
  const simple = charDomainSpecialSlot(c);
  groups.push({
    name: "Domain Expansion",
    note: `${padLabel("domain")} on a pad, ${keyFor("domain")} on the keyboard.`
        + (domains.length > 1 ? " Several to choose between, split across the left stick." : ""),
    items: domains.length
      ? domains.map((d, i) => {
          // How this one is reached is domains.js's answer, not this bench's:
          // the button alone opens the only domain a fighter has, and just the
          // fighters with more than one split them across the stick.
          const stick = domainStickFor(i, domains.length);
          return {
            kind: "domain", slot: i,
            label: domains.length > 1 ? `Domain ${i + 1}` : "Domain Expansion",
            mapping: stick ? `${padLabel("domain")} + ${stick.map(stickArrow).join(" ")}` : padLabel("domain"),
            how: stick ? "hold that stick direction as you press" : "the button alone",
            name: d.name, desc: d.desc, type: d.type, howTo: d.howTo,
            duration: d.p?.duration,
            cost: `${DOMAIN_METER_COST} meter (full bar)`,
            facts: [d.type, ...powerFacts(d.p)],
          };
        })
      : simple
        // Not an Expansion — the Simple Domain the New Shadow Style teaches,
        // which lives in the special list and which the domain button casts at
        // its own cooldown. Listed here because "the domain button opens my
        // domain" is true for them too, and this is the page that has to say so.
        ? [{
            kind: "special", slot: simple,
            label: "Simple Domain", mapping: padLabel("domain"),
            how: `the domain button, which casts their ${slotName(simple)} — no meter`,
            name: c.specials[simple].name, desc: c.specials[simple].desc,
            type: c.specials[simple].type,
            cost: "no meter — its own cooldown",
            facts: [c.specials[simple].type,
                    `${num(c.specials[simple].cooldown ?? 1.2)}s cooldown`,
                    ...powerFacts(c.specials[simple].p)],
          }]
        : [{ kind: "none", label: "None", name: "No Domain Expansion",
             desc: "This fighter has neither an Expansion nor a Simple Domain — the domain button does nothing for them.",
             mapping: "—", facts: [] }],
  });

  return groups;
}

const slotName = (slot) => SPECIAL_SLOTS.find(([s]) => s === slot)?.[1] || slot;
const stickArrow = (k) => ({ up: "▲", down: "▼", left: "◀", right: "▶", neutral: "●" }[k] || k);

// -------------------------------------------------------------- the preview

/** Put the board back the way it started. Every preview begins from the same
 *  frame, or two runs of one move are not comparable and two moves are not
 *  either. */
function resetScene() {
  const stage = getStage(wb.stage);
  state.stageKey = stage.key;
  state.platforms = stage.platforms.map((p) => ({ ...p }));
  state.hitboxes.length = 0;
  state.projectiles.length = 0;
  state.entities.length = 0;
  state.particles.length = 0;
  state.popups.length = 0;
  state.banners.length = 0;
  state.domain = null;
  state.domainOverlay = null;
  state.domainCasting = null;
  state.screenFlash = null;
  state.vignette = null;
  state.slowMo = 0;
  state.matchTime = 0;
  state.introT = 0;
  state.endT = 0;
  state.camera = { x: WORLD.w / 2, y: 360, zoom: 1, shake: 0, kick: 0 };
  state.hazardZones = [];
  // The board's own gimmicks, because a special is thrown on a real stage and
  // the field modifiers (Domain Core's gravity, Sunken Crossing's ice) are part
  // of how it lands.
  initStageFx();

  const groundY = state.platforms[0].y;
  caster = makeFighter(1, wb.char, CASTER_X, 1);
  dummy = makeFighter(2, wb.char === "gojo" ? "megumi" : "gojo", CASTER_X + DUMMY_GAP, -1);
  for (const f of [caster, dummy]) {
    f.y = groundY;
    f.grounded = true;
    // No spawn invulnerability: the preview is about the hit landing, and 1.4s
    // of it is most of the run.
    f.invuln = 0;
    f.stocks = 99;
    f.lastInput = blankInput();
  }
  caster.team = 1;
  dummy.team = 2;
  // A full bar, so the ultimate and the domain are castable on demand rather
  // than something you have to farm for on a bench.
  caster.meter = METER_MAX;
  dummy.damage = wb.dummyDamage;
  state.fighters = [caster, dummy];
  state.debugHitboxes = wb.boxes;
}

/** One simulation step. This is updateSimulation() from main.js with the match
 *  management taken out — no countdown, no clock, no KO, no result screen,
 *  because none of those are the move. Everything that IS the move is the game's
 *  own code, called in the game's own order. */
function stepSim(dt) {
  state.matchTime += dt;
  for (const f of state.fighters) {
    // Nobody is driving. A special is judged on what it does, not on what a
    // hand does around it, and a dummy that dodged would answer a different
    // question than the one this bench asks.
    const input = blankInput();
    if (f === dummy && wb.dummyGuards) input.shieldHeld = true;
    f.lastInput = input;
    updateFighter(f, dt, input);
  }
  for (const f of state.fighters) stepHitCredit(f, dt);
  updateHitboxes(dt);
  updateProjectiles(dt);
  for (let i = state.entities.length - 1; i >= 0; i--) {
    const e = state.entities[i];
    if (e.owner && e.owner.hitPause > 0) continue;
    e.update(dt);
    if (e.dead) state.entities.splice(i, 1);
  }
  for (const key of ["screenFlash", "vignette", "domainOverlay"]) {
    if (!state[key]) continue;
    state[key].life -= dt;
    if (state[key].life <= 0) state[key] = null;
  }
  updateParticles(dt);
  updateCamera(dt);
}

/** Cast the selected technique. The bench does not reach inside a move — it
 *  presses the same button the player presses, through the same entry point
 *  fighter.js calls, so anything a kit does on the way in (a spoken command,
 *  a refusal, a meter charge) happens here too. */
function cast(a) {
  if (!a || a.kind === "none") return;
  if (a.kind === "special") performSpecial(caster, a.slot);
  else if (a.kind === "ult") performUltimate(caster);
  else if (a.kind === "domain") performDomain(caster, a.slot);
}

function replay() {
  if (!wb.action) return;
  resetScene();
  wb.t = 0;
  wb.playing = true;
  cast(wb.action);
  paintPanel();
}

function frame() {
  raf = requestAnimationFrame(frame);
  if (wb.playing) {
    // Fixed steps, scaled by the speed control — a slowed preview runs fewer
    // steps per frame rather than smaller ones, so the physics of a half-speed
    // run is the physics of a full-speed one.
    let budget = SIM_DT * wb.speed;
    while (budget > 1e-6) {
      const dt = Math.min(SIM_DT, budget);
      stepSim(dt);
      wb.t += dt;
      budget -= dt;
    }
    if (wb.t >= runTimeOf(wb.action)) {
      if (wb.loop) replay();
      else wb.playing = false;
    }
  }
  draw(ctx);
  drawOverlay();
}

/** The run clock and what is on the board, over the scene. Which is the other
 *  thing this bench is for: a technique that spawned nothing, or that is still
 *  holding five entities four seconds later, is a fact about the move. */
function drawOverlay() {
  const a = wb.action;
  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 18, 0.72)";
  ctx.fillRect(0, 0, WORLD.w, 34);
  ctx.fillStyle = "#e8ecf8";
  ctx.font = "600 15px ui-sans-serif, system-ui, sans-serif";
  const bits = a
    ? [`${CHARACTERS[wb.char].name} · ${a.name}`,
       `${wb.t.toFixed(2)}s / ${runTimeOf(a).toFixed(1)}s`,
       `meter ${Math.round(caster.meter)}`,
       `dummy ${Math.round(dummy.damage)}%`,
       `${state.projectiles.length} proj · ${state.entities.length} entities · ${state.hitboxes.length} hitboxes`]
    : ["Pick a technique on the left"];
  ctx.fillText(bits.join("   ·   "), 14, 23);
  ctx.restore();
}

// ------------------------------------------------------------------- panel

function markup() {
  view.innerHTML = `
    <section class="sp-stage">
      <div class="stage-fit"><div class="stage-wrap">
        <canvas id="spStage" width="${WORLD.w}" height="${WORLD.h}"></canvas>
      </div></div>
      <div class="row sp-controls">
        <div class="group">
          <label>Preview</label>
          <div class="chips">
            <button id="spReplay" class="ghost sm" type="button">▶ Replay</button>
            <label class="chip"><input type="checkbox" id="spLoop" checked> Loop</label>
            <label class="chip"><input type="checkbox" id="spBoxes"> Hitboxes</label>
          </div>
        </div>
        <div class="group grow">
          <label>Speed <span class="sub" id="spSpeedVal">1.00x</span></label>
          <input type="range" id="spSpeed" min="0.1" max="1.5" step="0.05" value="1">
        </div>
      </div>
      <div class="row sp-controls">
        <div class="group grow" data-help="&lt;b&gt;What the dummy is standing at when the move lands.&lt;/b&gt; Knockback scales with the victim's damage, so the same special is a nudge at 0% and a kill at 140% — reading a move's power off its numbers alone hides that. Set it where the matchup you care about actually is.">
          <label>Dummy damage <span class="sub" id="spDmgVal">60%</span></label>
          <input type="range" id="spDmg" min="0" max="180" step="5" value="60">
        </div>
        <div class="group">
          <label>Dummy</label>
          <div class="chips">
            <label class="chip"><input type="checkbox" id="spGuard"> Shielding</label>
          </div>
        </div>
        <div class="group">
          <label>Stage</label>
          <select id="spStageSel"></select>
        </div>
      </div>
    </section>

    <aside class="sp-panel">
      <div class="group">
        <label for="spChar">Fighter</label>
        <select id="spChar"></select>
      </div>
      <div id="spList" class="sp-list"></div>
    </aside>`;
}

// The current fighter's entries, built once when the fighter changes. Held
// rather than re-derived per repaint because `wb.action` is one of THESE
// objects: rebuilding the list under it would leave the selection pointing at
// an equal-looking object from a previous build, which is how a highlight ends
// up on the wrong card.
let entries = [];       // the groups
let flatEntries = [];   // every item, in the order the cards are laid out

function rebuildEntries() {
  entries = entriesFor(wb.char);
  flatEntries = entries.flatMap((g) => g.items);
}

function paintPanel() {
  const list = $("spList");
  list.innerHTML = entries.map((g) => `
    <section class="sp-group">
      <h3>${esc(g.name)}</h3>
      ${g.note ? `<p class="sp-note">${esc(g.note)}</p>` : ""}
      ${g.items.map((item) => cardHtml(item, flatEntries.indexOf(item))).join("")}
    </section>`).join("");

  for (const el of list.querySelectorAll("[data-action]")) {
    const idx = Number(el.dataset.action);
    el.onclick = () => { wb.action = flatEntries[idx]; replay(); };
    el.onkeydown = (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      wb.action = flatEntries[idx];
      replay();
    };
  }
  // Marked after the list is rebuilt, because replay() repaints and the mark
  // has to survive that.
  const i = wb.action ? flatEntries.indexOf(wb.action) : -1;
  if (i >= 0) list.querySelector(`[data-action="${i}"]`)?.classList.add("on");
}

function cardHtml(item, idx) {
  const playable = item.kind !== "none";
  return `
    <article class="sp-card${playable ? "" : " sp-card--empty"}"
             ${playable ? `data-action="${idx}" role="button" tabindex="0"` : ""}>
      <header>
        <span class="sp-slot">${esc(item.label)}</span>
        <span class="sp-map" title="${esc(item.how || "")}">${esc(item.mapping)}</span>
      </header>
      <strong class="sp-name">${esc(item.name)}</strong>
      ${item.alsoDomain ? `<span class="sp-flag">also cast by the domain button</span>` : ""}
      <p class="sp-desc">${esc(item.desc || "")}</p>
      ${item.cost ? `<p class="sp-cost">${esc(item.cost)}</p>` : ""}
      ${item.facts?.length ? `<ul class="sp-facts">${item.facts.map((f) => `<li>${esc(String(f))}</li>`).join("")}</ul>` : ""}
      ${item.howTo ? `<p class="sp-howto"><b>Inside it:</b> ${esc(item.howTo)}</p>` : ""}
    </article>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function setChar(key) {
  wb.char = key;
  $("spChar").value = key;
  // The fighter's art, their opponent's, and whatever their kit summons or
  // transforms into — asked for through the game's own loader, so the preview
  // is never drawing a placeholder the match would not draw.
  await ensureMatchAssets([key, key === "gojo" ? "megumi" : "gojo"], wb.stage);
  rebuildEntries();
  wb.action = flatEntries.find((x) => x.kind !== "none") || null;
  replay();
  const url = new URL(location.href);
  url.searchParams.set("char", key);
  history.replaceState(null, "", url);
}

async function boot() {
  markup();
  canvas = $("spStage");
  ctx = canvas.getContext("2d");
  fitStageCanvas(canvas);

  await loadCoreAssets();

  fillCharSelect($("spChar"));
  $("spChar").onchange = (e) => setChar(e.target.value);

  const stageSel = $("spStageSel");
  for (const s of STAGES) {
    const o = document.createElement("option");
    o.value = s.key; o.textContent = s.name;
    stageSel.appendChild(o);
  }
  stageSel.value = wb.stage;
  stageSel.onchange = (e) => { wb.stage = e.target.value; replay(); };

  $("spReplay").onclick = () => replay();
  $("spLoop").onchange = (e) => { wb.loop = e.target.checked; };
  $("spBoxes").onchange = (e) => { wb.boxes = e.target.checked; state.debugHitboxes = wb.boxes; };
  $("spSpeed").oninput = (e) => {
    wb.speed = parseFloat(e.target.value);
    $("spSpeedVal").textContent = `${wb.speed.toFixed(2)}x`;
  };
  $("spDmg").oninput = (e) => {
    wb.dummyDamage = parseFloat(e.target.value);
    $("spDmgVal").textContent = `${wb.dummyDamage}%`;
  };
  $("spGuard").onchange = (e) => { wb.dummyGuards = e.target.checked; replay(); };

  document.addEventListener("keydown", (ev) => {
    if (ev.target.matches("input, select, textarea")) return;
    if (ev.code === "KeyR" || ev.code === "Space") { ev.preventDefault(); replay(); }
  });

  initTooltips(view);

  const wanted = new URLSearchParams(location.search).get("char");
  await setChar(CHARACTER_KEYS.includes(wanted) ? wanted : "gojo");
  $("loadState").textContent = "";
  frame();
}

boot();
