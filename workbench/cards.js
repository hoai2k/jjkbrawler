// THE CARD WORKBENCH — where each fighter's painting gets cropped.
//
//     /workbench/?edit=cards
//
// One control, and it is a line: drag it up and down the painting to say which
// height must survive when the card is squeezed into a hole that is not its
// shape. Everything else on the page exists to show the CONSEQUENCE of that
// line, because the line on its own tells you nothing — a card is never seen at
// this size in the game, and "looks about right on the big picture" is how the
// blanket `top` crop got shipped in the first place.
//
// So the rail holds every real hole, each an actual `object-fit: cover` box at
// its actual size, re-cropping live as the line moves — widest first, because
// the widest hole discards the most height. The roster tile at the top is the
// one to watch: it is both the hardest crop in the game and the one most of the
// game is seen through.
//
// Nothing here persists — no localStorage, no server write, like the audio
// bench's picks. Export writes a JSON snapshot of every card, tuned or not, and
// tools/apply_card_focus.mjs rebuilds src/config_cards.js from it.
//
// PORTED FROM MECH BRAWLER, which branched off this repo and grew the tool
// first (its workbench/cards.js). The shape of it is the same deliberately, so
// a fix to either can be read across; what differs is this game's own set of
// holes, and that its roster grid has two art sets — see rosterTileSrc() in
// src/ui.js and the note in src/config_cards.js on why the focus means the
// paintings.

import { CHARACTERS, CHARACTER_KEYS, STAGED_CHARACTER_KEYS } from "../src/characters.js";

// Cards the workbench crops: the roster, plus the fighters still staged. Same
// reasoning as the sprite workbench's WB_FIGHTERS — a staged fighter's hero
// card arrives through the same intake and needs the same crop line settled
// before the fighter is promoted, and leaving them out meant the card could
// not be looked at until the fighter was already live. Their tiles are
// labelled rather than hidden; a card that has not been delivered yet simply
// shows the broken-image placeholder until it lands in assets/cards/.
const WB_CARD_KEYS = [...CHARACTER_KEYS, ...STAGED_CHARACTER_KEYS];
const isStaged = (key) => STAGED_CHARACTER_KEYS.includes(key);
import { CARD_FOCUS, cardFocus } from "../src/config_cards.js";
import { ROSTER_ASPECTS, USE_SIMPLE_CARDS } from "../src/config_menus.js";

const el = (id) => document.getElementById(id);
const cardSrc = (key) => `../assets/cards/${key}_card.jpg`;

// The holes the game actually crops a card into, measured off styles.css. The
// point of listing them here is that they are the REAL shapes: a preview at a
// convenient size would agree with the game only by luck.
//
// ORDERED WIDEST FIRST, because a wide hole is a hard crop: `cover` scales the
// painting until it fills, so the wider the hole relative to the painting, the
// more of the painting's HEIGHT is thrown away. The first previews are
// therefore the ones a wrong line ruins first, which is the order to look in.
//
// The roster tile is not one shape: layoutCharacterGrid() walks ROSTER_ASPECTS
// and takes the widest rung that fits the window, so a card is cropped hardest
// exactly where it is seen most. A short window lands on the flat end of that
// ladder, which keeps about a third of a portrait's height. Built from the
// shared list so this cannot drift from what the game does.
const TILE_W = 110; // a roster tile's measured width at a typical window
const ROSTER_HOLES = ROSTER_ASPECTS.map((aspect, i) => {
  const [aw, ah] = aspect.split("/").map((n) => Number(n.trim()));
  return {
    label: `Roster tile · ${aspect.replace(/\s/g, "")}`,
    note: i === ROSTER_ASPECTS.length - 1
      ? ".char-card img — the widest rung, taken when the window is short"
      : `.char-card img — rung ${i + 1} of ${ROSTER_ASPECTS.length}, taken when the window is tall enough`,
    w: TILE_W,
    h: Math.round((TILE_W * ah) / aw),
  };
});

const HOLES = [...ROSTER_HOLES, ...[
  { label: "Loser card", note: ".victory-card--loser img — overscanned 124%", w: 140, h: 112 },
  { label: "Victory hero", note: ".victory-hero-art — overscanned 124%", w: 174, h: 140 },
  { label: "HUD portrait", note: ".hud-portrait — beside the damage", w: 52, h: 52 },
  { label: "Pause chip", note: ".pause-chip img", w: 44, h: 44 },
  { label: "Intro panel", note: ".intro-panel img — the VS splash, overscanned 134%", w: 168, h: 210 },
  // The select screen's hero card has two shapes, because the card does: the
  // landscape variant stands the portrait beside the stats and the portrait one
  // stacks them (styles.css, fitMatchupBar in src/ui.js). Both are listed —
  // which one a player sees depends on how many are playing.
  { label: "Matchup art · wide", note: ".matchup-side img — the portrait hero card, 3 or 4 players", w: 168, h: 118 },
  { label: "Matchup art · tall", note: ".matchup-side img — the landscape hero card, 1v1", w: 168, h: 196 },
  { label: "Victory card", note: ".victory-card img", w: 120, h: 160 },
]].sort((a, b) => b.w / b.h - a.w / a.h);

// The widest hole above, which is the one that discards the most height — and
// so the one the dimmed band on the painting is measured against. Derived
// rather than assumed: a hard-coded square would quietly tell the operator that
// less was being thrown away than really is.
const tightestAspect = Math.max(...HOLES.map((h) => h.w / h.h));

// key -> percentage from the painting's top edge. Seeded from the committed
// config so a session REFINES what is shipped rather than starting from blank
// and quietly reverting somebody's earlier pass on export.
const store = new Map();
const touched = new Set();
let current = null;
let dirty = false;

const focusOf = (key) => (store.has(key) ? store.get(key) : 0);

function setFocus(key, pct, { mark = true } = {}) {
  const v = Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
  store.set(key, v);
  if (mark) {
    touched.add(key);
    dirty = true;
    el("dirtyFlag").hidden = false;
  }
  if (key === current) paint();
  const tile = el(`tile-${key}`);
  if (tile) tile.classList.toggle("is-dirty", touched.has(key));
}

// ----------------------------------------------------------------- geometry
//
// The painting is letterboxed inside its box by `object-fit: contain`, so every
// reading and every overlay has to be measured against the PAINTED rect rather
// than the element — otherwise the line lands somewhere the game will not crop
// to, off by exactly the letterbox.

function paintedRect() {
  const img = el("cardImg");
  const box = img.getBoundingClientRect();
  const nat = img.naturalWidth / img.naturalHeight;
  if (!nat || !box.width) return { top: box.top, left: box.left, width: box.width, height: box.height };
  if (box.width / box.height > nat) {
    const w = box.height * nat;
    return { top: box.top, height: box.height, left: box.left + (box.width - w) / 2, width: w };
  }
  const h = box.width / nat;
  return { top: box.top + (box.height - h) / 2, height: h, left: box.left, width: box.width };
}

/** The fraction of the painting's HEIGHT that survives the WIDEST hole in the
 *  game — the crop that throws away the most, and so the honest one to draw.
 *  `cover` scales the painting until it fills the hole's width, which leaves
 *  (painting aspect ÷ hole aspect) of its height showing; a hole narrower than
 *  the painting keeps all of it and crops sideways instead, hence the clamp. */
function keptFraction() {
  const img = el("cardImg");
  if (!img.naturalWidth || !img.naturalHeight) return 1;
  return Math.min(1, (img.naturalWidth / img.naturalHeight) / tightestAspect);
}

/** Lay the line, its grab handle and the two discarded bands over the painting.
 *  Pixel positions rather than percentages, because they are positioned against
 *  the painted rect and that is not the element they live in. */
function layout() {
  const wrap = el("cardWrap");
  const r = paintedRect();
  const box = wrap.getBoundingClientRect();
  const left = r.left - box.left;
  const top = r.top - box.top;
  const pct = focusOf(current) / 100;
  const kept = keptFraction();
  // Where the surviving window sits, as a fraction of the painting's height:
  // `object-position: 50% p%` aligns the p point of the painting with the p
  // point of the hole, which puts the window's top at p × (1 − kept).
  const winTop = pct * (1 - kept);

  for (const id of ["focusLine", "focusGrab", "focusAbove", "focusBelow"]) {
    const node = el(id);
    node.style.left = `${left}px`;
    node.style.width = `${r.width}px`;
  }
  el("focusLine").style.top = `${top + pct * r.height}px`;
  el("focusGrab").style.top = `${top + pct * r.height}px`;
  el("focusAbove").style.top = `${top}px`;
  el("focusAbove").style.height = `${winTop * r.height}px`;
  el("focusBelow").style.top = `${top + (winTop + kept) * r.height}px`;
  el("focusBelow").style.height = `${(1 - winTop - kept) * r.height}px`;
}

// ------------------------------------------------------------------ painting

const holeId = (label) => `hole-${label.replace(/\W+/g, "")}`;

function paint() {
  const key = current;
  const pct = focusOf(key);
  layout();
  el("focusGrab").setAttribute("aria-valuenow", String(pct));
  el("focusPct").textContent = `${pct.toFixed(1)}%`;
  el("focusRange").value = String(pct);
  el("focusOut").textContent = `${pct.toFixed(1)}%`;
  el("resetBtn").disabled = !touched.has(key) && pct === cardFocus(key);
  for (const hole of HOLES) {
    const img = el(holeId(hole.label));
    if (img) img.style.objectPosition = `50% ${pct}%`;
  }
  const committed = cardFocus(key);
  el("committed").textContent = CARD_FOCUS[key] === undefined
    ? "not tuned yet — the game crops this card at the top"
    : `committed: ${committed}%`;
}

function select(key) {
  current = key;
  const char = CHARACTERS[key];
  for (const k of WB_CARD_KEYS) {
    el(`tile-${k}`)?.classList.toggle("is-selected", k === key);
  }
  el("who").textContent = char?.fullName || char?.name || key;
  el("whoKey").textContent = `${key}_card.jpg`;
  el("cardImg").src = cardSrc(key);
  for (const hole of HOLES) {
    const img = el(holeId(hole.label));
    if (img) img.src = cardSrc(key);
  }
  paint();
}

// ---------------------------------------------------------------- the export

const EXPORT_SCHEMA = "jjkbrawler.card-focus";
const EXPORT_VERSION = 1;

function snapshot() {
  const cards = {};
  for (const key of WB_CARD_KEYS) {
    cards[key] = {
      // `set` is the one thing a reader cannot derive: a card parked at 0
      // because nobody touched it and a card deliberately SET to 0 export the
      // same number, and only the deliberate one belongs in the config.
      set: touched.has(key) || CARD_FOCUS[key] !== undefined,
      focus: focusOf(key),
      name: CHARACTERS[key]?.name || key,
    };
  }
  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    generatedBy: "JJK Brawler II card workbench (/workbench/?edit=cards) — nothing is persisted in the browser; this file is the only record of the session's edits.",
    generatedAt: new Date().toISOString(),
    applyTo: "src/config_cards.js — export const CARD_FOCUS",
    howToApply: "node tools/apply_card_focus.mjs <this file>. Rebuilds CARD_FOCUS wholesale: an entry for every key whose `set` is true, dropping the rest. `focus` is a percentage from the painting's top edge and goes to CSS as the y half of object-position.",
    defaults: { focus: 0 },
    counts: {
      cards: WB_CARD_KEYS.length,
      set: WB_CARD_KEYS.filter((k) => touched.has(k) || CARD_FOCUS[k] !== undefined).length,
    },
    cards,
  };
}

function exportJSON() {
  const text = JSON.stringify(snapshot(), null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jjkbrawler-card-focus-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  dirty = false;
  el("dirtyFlag").hidden = true;
  el("status").textContent = `exported ${a.download} — apply it with tools/apply_card_focus.mjs`;
}

// ----------------------------------------------------------------- the shell

function shell() {
  const tiles = WB_CARD_KEYS.map((key) => `
    <button class="tile" id="tile-${key}" type="button" data-key="${key}">
      <img class="tile-thumb tile-thumb--card" src="${cardSrc(key)}" alt="">
      <span class="tile-name">${CHARACTERS[key]?.name || key}${isStaged(key) ? " (not on the roster yet)" : ""}</span>
      <span class="dot"></span>
    </button>`).join("");

  const holes = HOLES.map((h) => `
    <figure class="hole">
      <div class="hole-box" style="width:${h.w}px;height:${h.h}px">
        <img id="${holeId(h.label)}" alt="">
      </div>
      <figcaption>
        <strong>${h.label}</strong>
        <span class="sub">${h.w}×${h.h} · ${h.note}</span>
      </figcaption>
    </figure>`).join("");

  // The roster previews are the loudest thing on the page, and with the simple
  // tile set switched on the grid does not draw these paintings at all — so say
  // so rather than letting five big previews imply otherwise.
  const tileNote = USE_SIMPLE_CARDS
    ? `<p class="sub warn-note">USE_SIMPLE_CARDS is ON: the roster grid draws
       assets/cards/simple/&lt;key&gt;_tile.jpg, not these paintings, and keeps the
       plain top crop. The roster previews below are what the grid would do with
       the flag off; every other hole is live.</p>`
    : "";

  return `
    <header class="bar">
      <strong>Card Workbench</strong>
      <span class="hint">Where each painting is cropped — one line per fighter, previewed in every hole the game shows it in.</span>
      <nav class="modes">
        <a href="?edit=audio">Audio →</a>
        <a href="?edit=verification">Verification →</a>
        <a href="?edit=sprites">Sprites →</a>
      </nav>
      <span id="dirtyFlag" class="loading" hidden>unexported edits</span>
      <button id="exportBtn" class="ghost ghost--go" type="button"
              title="Download every card's focus as JSON, for tools/apply_card_focus.mjs">⭳ Export JSON</button>
      <button id="refreshBtn" class="ghost" type="button"
              title="Reload with a fresh cache key">↻ Refresh</button>
    </header>
    <main class="split split--cards">
      <nav class="rail rail--picker"><div class="grid grid--cards">${tiles}</div></nav>
      <section class="viewer">
        <div class="viewer-stage viewer-stage--card">
          <div id="cardWrap" class="cardwrap">
            <img id="cardImg" class="cardwrap-img" alt="">
            <div id="focusAbove" class="focus-band"></div>
            <div id="focusBelow" class="focus-band"></div>
            <div id="focusLine" class="focus-line"></div>
            <div id="focusGrab" class="focus-grab" tabindex="0" role="slider"
                 aria-label="Crop focus height" aria-valuemin="0" aria-valuemax="100">
              <span id="focusPct" class="focus-pct">0%</span>
            </div>
          </div>
        </div>
        <p class="viewer-note">
          <strong>Drag the line</strong> to the height that must survive a crop — usually the face.
          Click anywhere on the painting to send it there; arrow keys nudge by 0.5%, shift by 5%.
          The dimmed band is what the <em>hardest</em> crop throws away — the widest roster
          tile, the first preview on the right, and the one most of the game is seen through.
          <b id="committed" class="committed"></b>
        </p>
      </section>
      <aside class="rail rail--cards">
        <div class="params">
          <div class="params-head">
            <h2 id="who">…</h2>
            <code id="whoKey"></code>
          </div>
          <div class="ctrls">
            <label class="ctrl">
              <span class="ctrl-name">Focus</span>
              <input id="focusRange" type="range" min="0" max="100" step="0.5" value="0">
              <output id="focusOut">0%</output>
            </label>
          </div>
          <div class="rail-actions">
            <button id="resetBtn" class="ghost" type="button">Reset this card</button>
            <button id="centreBtn" class="ghost" type="button">Centre (50%)</button>
          </div>
        </div>
        <h3 class="rail-head">Every hole the game crops this card into</h3>
        ${tileNote}
        <div class="holes">${holes}</div>
        <p id="status" class="sub rail-foot">Nothing is saved in the browser — export when you are done.</p>
      </aside>
    </main>`;
}

// ------------------------------------------------------------------ dragging

function bindLine() {
  const wrap = el("cardWrap");
  const img = el("cardImg");
  let dragging = false;

  const fromEvent = (ev) => {
    const r = paintedRect();
    return ((ev.clientY - r.top) / r.height) * 100;
  };

  wrap.addEventListener("pointerdown", (ev) => {
    dragging = true;
    wrap.setPointerCapture(ev.pointerId);
    setFocus(current, fromEvent(ev));
    ev.preventDefault();
  });
  wrap.addEventListener("pointermove", (ev) => {
    if (dragging) setFocus(current, fromEvent(ev));
  });
  const stop = (ev) => {
    if (!dragging) return;
    dragging = false;
    try { wrap.releasePointerCapture(ev.pointerId); } catch { /* already gone */ }
  };
  wrap.addEventListener("pointerup", stop);
  wrap.addEventListener("pointercancel", stop);

  el("focusGrab").addEventListener("keydown", (ev) => {
    const step = ev.shiftKey ? 5 : 0.5;
    if (ev.key === "ArrowUp") setFocus(current, focusOf(current) - step);
    else if (ev.key === "ArrowDown") setFocus(current, focusOf(current) + step);
    else return;
    ev.preventDefault();
  });

  // The overlay is measured off the painted rect, so it has to be re-laid when
  // the painting's own size changes: a new card decoding, or the window moving
  // under it. Until a card has decoded, naturalWidth is 0 and the kept-band
  // maths would divide into nothing.
  img.addEventListener("load", layout);
  window.addEventListener("resize", layout);
}

function boot(root) {
  root.innerHTML = shell();

  for (const key of WB_CARD_KEYS) {
    store.set(key, cardFocus(key));
    el(`tile-${key}`).addEventListener("click", () => select(key));
  }

  bindLine();

  el("focusRange").addEventListener("input", (ev) => setFocus(current, Number(ev.target.value)));
  el("resetBtn").addEventListener("click", () => {
    touched.delete(current);
    setFocus(current, cardFocus(current), { mark: false });
    el(`tile-${current}`).classList.remove("is-dirty");
    paint();
  });
  el("centreBtn").addEventListener("click", () => setFocus(current, 50));
  el("exportBtn").addEventListener("click", exportJSON);
  // Same escape hatch every bench here has: a URL nobody has fetched, so the
  // page and everything it imports miss the cache. See router.js.
  el("refreshBtn").addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("bust", Date.now().toString(36));
    location.href = url.href;
  });

  // An unexported session is lost on navigation, and this tool is one drag per
  // card — easy to do two dozen of and then close the tab.
  window.addEventListener("beforeunload", (ev) => {
    if (!dirty) return;
    ev.preventDefault();
    ev.returnValue = "";
  });

  select(WB_CARD_KEYS[0]);
}

// This bench builds into its own root, like the verification queue: index.html
// holds every local bench at one address and removes the ones that were not
// asked for. Booting on import rather than exporting to a caller matches how
// router.js injects a module — there is nothing to call it.
boot(document.getElementById("cardsRoot"));
