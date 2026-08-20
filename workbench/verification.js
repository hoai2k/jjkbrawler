// THE VERIFICATION BENCH — a queue of things a person has to look at.
//
//     /workbench/?edit=verification
//     /workbench/?edit=verification&set=strike-points&i=12
//
// WHY THIS EXISTS. A lot of this game is measured rather than authored: body
// sizes come off the silhouettes, attack reach off the rigs, crouch and air
// heights off the poses. Measurement is the right default — it tracks the art
// instead of drifting from it — but a measurement is a claim, and some claims
// only a human can settle. `tools/check_model_facing.mjs` says so at length
// about one of them: an outline cannot tell front from back, and the automated
// version of that check turned five fighters around backwards before anybody
// noticed.
//
// The benches we already have are EDITORS: open a fighter, change a number,
// export. That is the right shape for work you are driving. It is the wrong
// shape for work that is a LIST — every fighter's every attack, every rig's
// facing — where the job is to get to the end without losing your place, and
// where most items want "yes, that's right" rather than an edit.
//
// So this bench is a queue. It presents one item, you approve it or fix it or
// skip it, it advances. It keeps a decision per item, tells you how far
// through you are, and exports the lot as JSON — including, where the task set
// knows how, a block you can paste straight into the config file that owns the
// answer.
//
// ADDING A TASK SET is the whole point of the shape: write a provider (see
// verify_strike_points.js for the reference one), register it in SETS below,
// and it appears in the picker with navigation, decisions, progress, export
// and keyboard handling already working. A provider owns three things — what
// the items ARE, how to draw one, and what an edit means — and nothing else.
//
// A DECISION IS NOT A CHANGE TO THE GAME. Nothing this bench records reaches
// the running game: the export has to be applied to a config file and
// committed. That is deliberate, and it is why resuming from browser storage
// is safe here where the pose bench had to stop doing it (sprite_pose.js tells
// that story) — a resumed decision can only ever be a draft of something a
// person still has to land.

import { loadCoreAssets } from "../src/assets.js";

const CACHE_KEY = new URL(import.meta.url).searchParams.get("v") || "";
const withKey = (path) => (CACHE_KEY ? `${path}?v=${encodeURIComponent(CACHE_KEY)}` : path);

// ------------------------------------------------------------- task sets
//
// Loaded lazily: a set that nobody opened costs nothing, and a set that fails
// to load says so in its own place instead of taking the bench down with it.

const SETS = {
  // FIRST, so it is what opens: this is the queue with somebody waiting on it.
  // Changing summon art to a face-right default inverted the correct `faceLeft`
  // for every creature at once, and which way a drawing points is not something
  // the code can re-derive — it is a fact about a picture.
  // ---- archived: kept because a re-bake or a redraw reopens them -----------
  "creature-facing": {
    archived: true,
    label: "Creature facing",
    blurb: "Which way each creature's art points. Summon art is now assumed to face "
      + "right like every other drawing, which flipped the meaning of the stored flag "
      + "for all of them — so each one is shown moving right, drawn as the game will "
      + "draw it, and the question is whether it leads with its head.",
    load: () => import(withKey("./verify_creature_facing.js")).then((m) => m.provider()),
  },
  // The three anchor queues. Each edits `meta.anchors[<name>]` in the sprite
  // manifest — the same field the SPRITE workbench's handles drag and the game
  // already reads. Not a parallel store: a value moved in either tool is the
  // same number, and the export is an ordinary sprite-adjustments block.
  "grab-hand": {
    label: "Grabbing hand",
    blurb: "The open hand that closes on the collar, on each fighter's grab_reach. "
      + "The grab reaches exactly this far instead of a formula off measured art reach. "
      + "Same anchor the sprite workbench drags; src/grab.js reads it.",
    load: () => import(withKey("./verify_anchors.js")).then((m) => m.anchorProvider("grabHand")()),
  },
  "grab-chest": {
    label: "Held chest",
    blurb: "Where the prying hands sit on each fighter's grabbed pose — the point the "
      + "holder's fist lands on. It only means anything ACROSS fighters: a fist high on "
      + "one and low on another makes every pairing read as a different argument.",
    load: () => import(withKey("./verify_anchors.js")).then((m) => m.anchorProvider("grabChest")()),
  },
  "teeter-foot": {
    label: "Teeter foot",
    blurb: "The foot at the lip. The brake stops everyone with their CENTRE a fixed "
      + "distance past the edge, and each teeter drawing puts its leading foot somewhere "
      + "different inside its own plate. Moves the drawing only — no hurtbox, no spacing.",
    load: () => import(withKey("./verify_anchors.js")).then((m) => m.anchorProvider("teeter")()),
  },
  "strike-points": {
    label: "Strike points",
    blurb: "Where each attack actually lands — the fist, the foot or the blade — "
      + "checked against the fighter's own drawing.",
    load: () => import(withKey("./verify_strike_points.js")).then((m) => m.provider()),
  },
  // THE PER-CHARACTER VALUE, and the reference the per-FRAME set below is
  // judged against — answer this one first for a fighter who appears in both.
  // One number per fighter, so the editor is a height and nothing else: where
  // a body balances ALONG its own centre line is the only part of this that
  // varies per character, since the fighter's x is wherever the simulation
  // says they are. Asked on the idle because a per-character answer needs one
  // neutral upright drawing, and a lunge would bake the lunge into every pose.
  "center-of-mass": {
    label: "Centre of mass",
    blurb: "Where each fighter's weight sits — ONE number per fighter, as a fraction "
      + "of height. The tumble pivot, the airborne hurtbox centre, the aim chest line, "
      + "and the height an airborne drawing hangs from, so being wrong moves the whole "
      + "fighter rather than tilting them. 7 of 34 are still on the assumed 0.55, and "
      + "every frame of theirs in \"Frame centre of mass\" is being judged against that "
      + "guess until this is answered.",
    load: () => import(withKey("./verify_body_points.js")).then((m) => m.comProvider()),
  },
  // The per-FRAME sibling of the set above — a different store answering a
  // different question, not a replacement for it. That one is `com` in
  // config_body_points.js, one fraction per fighter, and it is what the
  // `height` reason here compares against; this one is `meta.anchors.com` in
  // the sprite manifest, an x and a y on one drawing. A queue rather than a
  // roster walk, because there are thousands of these anchors: it lists only
  // the ones sprites/src/com_review.js has reason to doubt.
  "frame-com": {
    label: "Frame centre of mass",
    blurb: "Where each suspect DRAWING carries its weight — `meta.anchors.com`, the "
      + "handle the sprite workbench drags. It was a pivot when it was baked and is a "
      + "placement now: an airborne drawing hangs from it, and a cross-fade lines its "
      + "two drawings up on it. Listed worst first, with why each one is here.",
    load: () => import(withKey("./verify_frame_com.js")).then((m) => m.provider()),
  },
  "muzzle-points": {
    label: "Muzzle points",
    blurb: "Where a shot leaves the caster. Today it is one offset for the whole "
      + "roster, scaled by height — so it departs one fighter's forehead and another's waist.",
    load: () => import(withKey("./verify_body_points.js")).then((m) => m.muzzleProvider()),
  },
  "hurtbox-fit": {
    label: "Hurtbox fit",
    blurb: "Does the box you can be hit on cover the body that is drawn — standing, "
      + "ducking, airborne, reeling and flat out.",
    load: () => import(withKey("./verify_hurtbox_fit.js")).then((m) => m.provider()),
  },
  "model-facing": {
    label: "Model facing",
    blurb: "Is the 3D model facing the way its drawing is? An outline provably cannot "
      + "tell front from back — the automated pass turned five fighters around.",
    load: () => import(withKey("./verify_model.js")).then((m) => m.facingProvider()),
  },
  "guard-hands": {
    label: "Guard hands",
    blurb: "Does the guard put the hands IN FRONT of the chest and head, or through them? "
      + "One shell, authored for a 1.75m human, worn by a bear and a barrel.",
    load: () => import(withKey("./verify_model.js")).then((m) => m.guardProvider()),
  },
  "crouch-orientation": {
    label: "Crouch orientation",
    blurb: "Which way the crouched body points. The foot-levelling solve tilts everyone "
      + "by the same wrong amount, so this is one decision per group, not per fighter.",
    load: () => import(withKey("./verify_model.js")).then((m) => m.crouchProvider()),
  },
  "pose-reads": {
    label: "Pose reads",
    blurb: "Does the model's pose read as the drawing it was built from?",
    load: () => import(withKey("./verify_model.js")).then((m) => m.poseProvider()),
  },
};

// ------------------------------------------------- open, answered, archived
//
// Which drawer a queue is filed in used to be a fact about the table above: a
// set sat under the picker's "archived" rule because `archived: true` said so,
// and moving one took an edit and a commit. But finishing a pass is something
// that happens at the bench, not in the source — so the button next to the
// queue heading files the open set away, or fetches it back, and the choice
// is remembered per browser.
//
// There are THREE groups, because a queue stops being work for two quite
// different reasons and they should not be spelled the same way:
//
//   OPEN      — something in it is still unanswered. Ordinary work.
//   ANSWERED  — every item is in the tree. Nobody has to look at it, but
//               nobody has put it away either: a re-bake or a redraw reopens
//               it, and when that happens it goes straight back to open. This
//               is READ FROM THE TREE, not decided, so it is not a filing.
//   ARCHIVED  — somebody said so. This one is a filing, it outranks the
//               reading, and it survives whatever the tree does next.
//
// So an answered queue is listed under its own rule rather than shoved in
// with the archived ones, and it can still be archived by hand from there —
// or, once archived, unarchived back into whichever of the first two groups
// the tree says it belongs to.
//
// Decisions are deliberately NOT persisted (see setWork below). None of this
// is a decision: it records nothing about any item, claims nothing about the
// tree, and cannot make old work look like new. It is where you keep your
// tools — and a bench that forgot that on reload would not be worth the click.

const ARCHIVE_KEY = "jjk.verification.archived.v1";
const EMPTIED_KEY = "jjk.verification.emptied.v1";
const RECENT_KEY = "jjk.verification.recent.v1";
const SHOW_ARCHIVED_KEY = "jjk.verification.showArchived.v1";

const asArray = (v) => (Array.isArray(v) ? v : []);

/** setId -> boolean, and ONLY for sets somebody moved by hand. Absent means
 *  "whatever the table says", so a new set arrives in the group its author
 *  filed it under, and an entry for a set that no longer exists costs
 *  nothing. */
const archiveOverrides = new Map(
  Object.entries(readStore(ARCHIVE_KEY, {})).map(([id, on]) => [id, !!on]),
);

/** Sets last seen with nothing left to do. Cached rather than recomputed at
 *  boot because knowing costs a provider load, and loading every set to draw
 *  a dropdown would trade the whole point of lazy sets for a sorted list. */
const emptied = new Set(asArray(readStore(EMPTIED_KEY, [])));

/** Set ids, most recently opened first. The open group is a history rather
 *  than a table: the queue you were on last night is the one you want
 *  tonight, and it should not be eleven items down. */
const recent = asArray(readStore(RECENT_KEY, [])).filter((id) => typeof id === "string");

/** Whether the archived group is listed at all. OFF by default: the point of
 *  putting a queue away is not seeing it. */
let showArchived = readStore(SHOW_ARCHIVED_KEY, false) === true;

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    // A junk value is not worth a broken bench: fall back to the table.
    console.warn(`verification: stored "${key}" unreadable — ignoring it`, err);
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`verification: could not store "${key}"`, err);
  }
}

const isArchived = (id) => (
  archiveOverrides.has(id) ? archiveOverrides.get(id) : !!SETS[id]?.archived
);

/** Answered is what is LEFT of "nothing to do here" once a filing has had its
 *  say: an archived queue is archived whether or not the tree agrees. */
const isAnswered = (id) => emptied.has(id) && !isArchived(id);

function setArchived(id, on) {
  if (!SETS[id]) return;
  // Agreeing with the table is stored as nothing rather than as agreement, so
  // a set the table later reopens (or closes) still follows it.
  if (!!SETS[id].archived === on) archiveOverrides.delete(id);
  else archiveOverrides.set(id, on);
  writeStore(ARCHIVE_KEY, Object.fromEntries(archiveOverrides));
}

function setShowArchived(on) {
  showArchived = !!on;
  writeStore(SHOW_ARCHIVED_KEY, showArchived);
}

/** What the tree says about a set that just loaded: open, or answered.
 *  Returns true when this changed the answer and the picker needs rebuilding. */
function noteEmptiness(id, hasWork) {
  const was = emptied.has(id);
  if (hasWork) emptied.delete(id); else emptied.add(id);
  if (emptied.has(id) === was) return false;
  writeStore(EMPTIED_KEY, [...emptied]);
  return true;
}

/** Opening a set is what makes it recent. Returns true when the order moved. */
function noteOpened(id) {
  if (recent[0] === id) return false;
  const at = recent.indexOf(id);
  if (at >= 0) recent.splice(at, 1);
  recent.unshift(id);
  // Bounded by the table it names: ids for sets that are gone are dropped on
  // write rather than kept forever against a set that might come back.
  const live = recent.filter((x) => SETS[x]);
  recent.length = 0;
  recent.push(...live);
  writeStore(RECENT_KEY, recent);
  return true;
}

/** The three groups, each in the order its own question deserves. */
function setGroups() {
  const ids = Object.keys(SETS);
  const byLabel = (a, b) => SETS[a].label.localeCompare(SETS[b].label);
  return {
    open: ids.filter((id) => !isArchived(id) && !isAnswered(id)).sort(byRecency),
    answered: ids.filter(isAnswered).sort(byLabel),
    archived: ids.filter(isArchived).sort(byLabel),
  };
}

/** Somewhere there is still work, failing that somewhere there is at least a
 *  queue — but never the archive, which is where things go to be out of the
 *  way. */
const firstUnarchived = (groups) => groups.open[0] || groups.answered[0] || null;

const params = new URL(location.href).searchParams;
const root = document.getElementById("verificationRoot");

// --------------------------------------------------------------- the shell

root.innerHTML = `
  <header class="bar">
    <strong>Verification</strong>
    <span class="hint" id="vBlurb">One thing at a time, until the list is done.</span>
    <nav class="modes">
      <a href="?edit=audio">Audio →</a>
      <a href="../sprites/workbench/">Sprites →</a>
      <a href="../render3d/workbench/">3D →</a>
    </nav>
    <div class="v-pick">
      <select id="vSet" class="ghost" aria-label="Task set"></select>
      <label class="v-show-archived" for="vShowArchived"
             title="List the queues you have put away, under their own rule">
        <input id="vShowArchived" type="checkbox"> show archived
      </label>
    </div>
    <button id="vExport" class="ghost ghost--go" type="button"
            title="Download every decision so far, as JSON">⭳ Export decisions</button>
    <button id="vRefresh" class="ghost" type="button"
            title="Reload with a fresh cache key">↻ Refresh</button>
    <span id="vState" class="loading">loading…</span>
  </header>

  <main class="layout layout--verify">
    <aside class="col">
      <div class="v-head">
        <h2>Queue</h2>
        <button id="vArchive" class="ghost sm" type="button"></button>
      </div>
      <p class="sub" id="vProgress">—</p>
      <div class="v-bar"><div class="v-bar-fill" id="vBarFill"></div></div>
      <div class="v-filters">
        <button class="ghost sm" data-filter="all" type="button">All</button>
        <button class="ghost sm" data-filter="todo" type="button">To do</button>
        <button class="ghost sm" data-filter="done" type="button">Decided</button>
      </div>
      <ul id="vList" class="v-list"></ul>
      <p class="legend" id="vResume" hidden></p>
    </aside>

    <section class="col stage-col">
      <div class="stage-wrap">
        <canvas id="vStage" width="460" height="520"></canvas>
      </div>
      <div class="who">
        <h2 id="vTitle">—</h2>
        <p class="sub" id="vSubtitle"></p>
      </div>
      <div class="v-nav">
        <button id="vOrbitReset" class="ghost sm" type="button" hidden
                title="Back to the view the game draws (O)">⟲ Game view</button>
        <button id="vPrev" class="ghost" type="button" title="Previous (←)">← Prev</button>
        <button id="vApprove" class="ghost ghost--go" type="button"
                title="Looks right — record it and move on (Enter)">✓ Approve</button>
        <button id="vSkip" class="ghost" type="button" title="Decide later (S)">Skip</button>
        <button id="vNext" class="ghost" type="button" title="Next (→)">Next →</button>
      </div>
    </section>

    <section class="col">
      <h2 id="vEditorHead">This item</h2>
      <p class="sub" id="vSource">—</p>
      <div id="vEditor"></div>
      <div class="group">
        <label for="vNote">Note <span class="sub">travels with the decision</span></label>
        <input id="vNote" class="note-input" type="text" placeholder="optional — why you changed it">
      </div>
      <div class="v-nav v-nav--wrap">
        <button id="vReset" class="ghost sm" type="button">Reset to measured</button>
        <button id="vReject" class="ghost sm ghost--warn" type="button"
                title="Wrong, and an edit here cannot fix it (R)">Flag as broken</button>
        <button id="vClear" class="ghost sm" type="button">Undecide</button>
      </div>
      <p class="legend">
        <b>Editing is the decision</b> — drag or nudge and the item is settled;
        Approve is for the ones where the measurement was already right.
        <b>Flag as broken</b> is for an item no nudge can fix (a mis-gripped
        weapon, a pose that never extends): it exports as a rejection with your
        note, so the fix lands where the fault is instead of being papered over
        here. Nothing on this page reaches the game until the export is applied
        and committed.
      </p>
      <p class="legend" id="vKeys">
        <b>←/→</b> or <b>↑/↓</b> move · <b>Enter</b> approve &amp; next · <b>S</b> skip ·
        <b>R</b> flag · <b>Z</b> undo edit · <b>O</b> game view · drag on the canvas to place
        (or, on the model sets, to turn it).
      </p>
    </section>
  </main>
`;

const el = (id) => document.getElementById(id);
const els = {
  blurb: el("vBlurb"), set: el("vSet"), exportBtn: el("vExport"), refresh: el("vRefresh"),
  state: el("vState"), progress: el("vProgress"), barFill: el("vBarFill"), list: el("vList"),
  archive: el("vArchive"), showArchived: el("vShowArchived"), stage: el("vStage"), title: el("vTitle"),
  subtitle: el("vSubtitle"), source: el("vSource"),
  editor: el("vEditor"), note: el("vNote"), resume: el("vResume"),
  prev: el("vPrev"), next: el("vNext"), approve: el("vApprove"), skip: el("vSkip"),
  reset: el("vReset"), reject: el("vReject"), clear: el("vClear"),
  orbitReset: el("vOrbitReset"),
};

// ---------------------------------------------------------------- the state

const bench = {
  setId: null,
  provider: null,
  tasks: [],
  i: 0,
  // A queue opens on the work that is LEFT. After a committed pass, "All" is
  // mostly things somebody already answered.
  filter: "todo",
  /** EVERY set's work, together, because the export is a single document:
   *  setId -> { fingerprint, i, decisions: Map(taskId -> decision) }. A
   *  decision is { status, value, note, at }, status one of
   *  approved | edited | rejected | skipped; an item absent is undecided.
   *
   *  Kept for sets that are not open — switching sets must not lose a pass,
   *  and one download has to carry the lot so a batch of decisions can be
   *  applied in one go. */
  work: new Map(),
  /** Providers already loaded, by set id. Export needs a provider for every
   *  set carrying decisions (for the measured value and the apply block), and
   *  after a reload that may be a set nobody has opened yet. */
  providers: new Map(),
};

/**
 * DECISIONS ARE NOT PERSISTED, and that is deliberate.
 *
 * They live as long as the tab does — switching task sets keeps them, which
 * is what lets one export cover a whole sitting; reloading throws them away.
 * The reason is the one the pose bench learned the hard way
 * (render3d/workbench/sprite_pose.js): stored edits outlive the moment they
 * were applied to the tree, so corrections that HAD been committed kept
 * coming back. A review queue makes that worse rather than better — the
 * export means "here is what I decided just now", and a session that quietly
 * carried already-committed decisions into the next file would make old and
 * new work indistinguishable at exactly the moment somebody has to tell them
 * apart.
 *
 * So: export before closing the tab. The download is the record, and the
 * config file is the destination.
 */
function setWork(setId) {
  let w = bench.work.get(setId);
  if (!w) bench.work.set(setId, (w = { fingerprint: null, i: 0, decisions: new Map() }));
  return w;
}

/** Every mutation calls this. It does nothing on purpose — see above; keeping
 *  the call sites is what makes "where would this be saved" answerable in one
 *  place if the decision is ever revisited. */
function persist() {}

/** Note which measurements a set's decisions are about, for the export.
 *  Nothing survives a reload, so there is no stale work to reconcile. */
function reconcileFingerprint(setId, fingerprint) {
  setWork(setId).fingerprint = fingerprint;
  return 0;
}

/** The standing note under the queue: what is held, and that it is not saved. */
function renderResume() {
  const total = totalDecisions();
  if (!total) {
    els.resume.hidden = false;
    els.resume.textContent = "Decisions live in this tab only — reloading clears them. "
      + "Export before you close it.";
    return;
  }
  els.resume.hidden = false;
  els.resume.innerHTML = `Holding <b>${total}</b> decision(s) across `
    + `${setsWithWork().length} set(s), <b>not saved</b> — export before closing or reloading. `
    + `<button class="ghost sm" id="vDiscard" type="button">Discard all</button>`;
  el("vDiscard").addEventListener("click", () => {
    if (!confirm("Throw away every decision in every set?")) return;
    bench.work.clear();
    setWork(bench.setId).fingerprint = bench.provider?.fingerprint || null;
    bench.i = 0;
    renderAll();
  });
}

const totalDecisions = () => [...bench.work.values()]
  .reduce((n, w) => n + w.decisions.size, 0);
const setsWithWork = () => [...bench.work].filter(([, w]) => w.decisions.size).map(([id]) => id);

const decisions = () => setWork(bench.setId).decisions;
const current = () => bench.tasks[bench.i] || null;
const decisionFor = (task) => (task ? decisions().get(task.id) || null : null);

/** The value in play for a task: whatever a decision recorded, else the
 *  provider's own starting value. */
function valueFor(task) {
  const d = decisionFor(task);
  return d && d.value !== undefined ? d.value : bench.provider.initialValue(task);
}

function setDecision(task, patch) {
  const map = decisions();
  const prev = map.get(task.id) || {};
  map.set(task.id, { ...prev, ...patch, at: new Date().toISOString() });
  setWork(bench.setId).i = bench.i;
  persist();
}

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A VALUE CHANGE, from a slider, a nudge button or a drag.
 *
 * `patch` is MERGED into the value in play rather than replacing it, so a
 * control only has to say the part it owns — `onChange({ x })` from the
 * forward slider leaves `y` alone. That matters more than it looks: the
 * editor's DOM is no longer rebuilt on every change (see refreshValue), so a
 * control's captured `value` goes stale the moment a sibling moves, and a
 * spread of it would silently revert the sibling's edit.
 *
 * Only the cheap half of a render runs. A drag is a stream of these — up to
 * one per pointer pixel — and the expensive half (rebuilding the editor and
 * the whole queue list) is exactly what made the sliders crawl: every input
 * event replaced the DOM node the pointer was holding, then walked 162 rows
 * to redraw badges that had not changed.
 */
function applyValue(task, patch) {
  if (patch === undefined || patch === null) return;
  const before = statusOf(task);
  const cur = valueFor(task);
  const value = isPlain(patch) && isPlain(cur) ? { ...cur, ...patch } : patch;
  setDecision(task, { status: "edited", value });
  // Controls the change did NOT come from still have to show it — a corner
  // dragged on the canvas has to move the width slider under it. Sent for
  // every change, including the editor's own: a control that emits one key
  // still needs the others, and `set` ignores a value it is already showing,
  // so the control under the pointer is never fought with.
  syncEditor(value);
  refreshValue();
  // The row's badge and the counters only move on a STATUS transition, which
  // happens once per item however many times it is nudged.
  if (statusOf(task) !== before) { renderList(); renderProgress(); }
}

/** Controls that want telling when the value moved underneath them. Rebuilt
 *  with the editor, so a stale one cannot outlive the item it belongs to. */
let editorSyncs = [];
function syncEditor(value) {
  for (const fn of editorSyncs) { try { fn(value); } catch { /* a control's problem */ } }
}

// --------------------------------------------------------------- rendering

/** Put the cursor on something the active filter is actually showing. A queue
 *  that opens on "To do" and then displays an item that is not in that list
 *  reads as broken — and stepping from it lands nowhere near the visible
 *  rows. Returns true when it moved. */
function snapToVisible() {
  const shown = visibleTasks();
  if (!shown.length || shown.includes(current())) return false;
  bench.i = bench.tasks.indexOf(shown[0]);
  setWork(bench.setId).i = bench.i;
  return true;
}

function renderAll() {
  renderArchiveButton();
  renderList();
  renderCurrent();
  renderProgress();
  refreshSetCounts();
  renderResume();
}

/** The archive button says what it will DO, and shows what is true now: a
 *  set already filed away offers to fetch it back. */
function renderArchiveButton() {
  const id = bench.setId;
  els.archive.hidden = !SETS[id];
  if (!SETS[id]) return;
  const on = isArchived(id);
  els.archive.textContent = on ? "⇡ Unarchive" : "⇣ Archive";
  els.archive.classList.toggle("is-on", on);
  els.archive.setAttribute("aria-pressed", String(on));
  els.archive.title = on
    ? `Archived — put “${SETS[id].label}” back in the picker, under `
      + (emptied.has(id) ? "“answered”" : "the open queues")
    : `Archive “${SETS[id].label}” — it leaves the picker until “show archived” is ticked`;
}

/**
 * OPEN QUEUES, THEN THE ANSWERED ONES, THEN — IF YOU ASKED FOR THEM — THE
 * ARCHIVE. The rules between the groups are disabled options, which is the
 * separator every browser renders and which cannot be landed on by keyboard.
 *
 * EACH GROUP IS SORTED BY THE QUESTION IT ANSWERS. The open group is "what am
 * I working on" — most recently opened first, so the queue you were mid-pass
 * on last night is the top item and not eleven down; sets nobody has opened
 * yet follow in the table's own order, which is the order somebody thought to
 * write them in. The other two are "where did that one go" — a name you
 * already know, looked up alphabetically rather than hunted through a history
 * you have stopped keeping.
 *
 * The archive is listed only when the checkbox under the picker asks for it,
 * with one exception: whatever set is OPEN is always in the list. A picker
 * whose selection is not one of its options shows a blank box and lies about
 * where you are, which is a worse trade than one extra line.
 *
 * Rebuilt rather than reordered in place: archiving, answering and opening
 * all move sets between and within the groups, and the option list is a dozen
 * nodes.
 */
function renderSetPicker(preferred) {
  els.set.textContent = "";
  const groups = setGroups();
  const shown = SETS[preferred] ? preferred : firstUnarchived(groups);
  const archived = showArchived || isArchived(shown) ? groups.archived : [];
  const add = (id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = SETS[id].label;
    els.set.appendChild(opt);
  };
  const rule = (text) => {
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.textContent = `────── ${text} ──────`;
    els.set.appendChild(opt);
  };
  groups.open.forEach(add);
  if (groups.answered.length) {
    if (groups.open.length) rule("answered");
    groups.answered.forEach(add);
  }
  if (archived.length) {
    if (groups.open.length || groups.answered.length) rule("archived");
    archived.forEach(add);
  }
  // The first set with work in it, not the first entry: the default has to be
  // somewhere there is something to do, or the bench opens on an empty queue.
  els.set.value = shown || groups.archived[0] || "";
  els.showArchived.checked = showArchived;
  refreshSetCounts();
}

/** Opened-most-recently first, then the ones nobody has opened in the order
 *  the table lists them. */
function byRecency(a, b) {
  const ia = recent.indexOf(a);
  const ib = recent.indexOf(b);
  if (ia === ib) return 0;
  if (ia < 0) return 1;
  if (ib < 0) return -1;
  return ia - ib;
}

/** Decision counts on the set picker's options. */
function refreshSetCounts() {
  for (const opt of els.set.options) {
    // The rule between the two groups is an option too, and it names no set.
    const def = SETS[opt.value];
    if (!def) continue;
    const n = bench.work.get(opt.value)?.decisions.size || 0;
    opt.textContent = n ? `${def.label} (${n})` : def.label;
  }
}

/**
 * Where an item stands. A decision made in this tab wins; failing that, a
 * set can report that the answer is ALREADY IN THE TREE — committed on some
 * earlier pass — and that counts as settled.
 *
 * Without this the queue asked for everything again after every reload, which
 * is the opposite of what a review queue is for: the work left to do is the
 * work nobody has answered yet, whether they answered it a minute ago or last
 * week.
 */
function statusOf(task) {
  const d = decisionFor(task);
  if (d?.status) return d.status;
  return bench.provider?.committed?.(task) ? "committed" : "todo";
}

/** Settled, however it got that way. */
const SETTLED = new Set(["approved", "edited", "rejected", "committed"]);

const FILTER_LABEL = { all: "All", todo: "To do", done: "In tree" };

const STATUS_LABEL = {
  approved: "approved", edited: "edited", rejected: "flagged",
  skipped: "skipped", committed: "in tree", todo: "",
};

/**
 * THE LIST IS A WORKLIST AGAINST THE REPO, not against this tab.
 *
 * "To do" is everything whose answer is not yet in the tree — and it stays
 * there after you edit it, because an edit in a browser tab has not landed
 * anywhere. It leaves the list when the export is applied and committed, and
 * not before. That keeps the queue honest about what is actually done, and it
 * means a decision can be revisited and re-dragged right up until it ships
 * without the item vanishing out from under you mid-pass.
 *
 * A session decision still shows as a badge on the row (edited / approved /
 * flagged) — it just does not change which list the row is in.
 */
const inTree = (task) => !!bench.provider?.committed?.(task);

function visibleTasks() {
  if (bench.filter === "todo") return bench.tasks.filter((t) => !inTree(t));
  if (bench.filter === "done") return bench.tasks.filter(inTree);
  return bench.tasks;
}

/** How many items each filter would show, for the buttons. */
function filterCounts() {
  let done = 0;
  for (const t of bench.tasks) if (inTree(t)) done++;
  return { all: bench.tasks.length, todo: bench.tasks.length - done, done };
}

const EMPTY_NOTE = {
  todo: "Nothing left — every item in this set is already in the tree, so the "
    + "picker lists it under <b>answered</b> rather than with the open queues. "
    + "Switch to <b>All</b> to revisit one, <b>Archive</b> to put it away for "
    + "good, or pick another set.",
  done: "Nothing committed yet. Decisions land here once an export has been "
    + "applied to the config and committed.",
  all: "This set has no items.",
};

function renderList() {
  const frag = document.createDocumentFragment();
  const shown = visibleTasks();
  if (!shown.length) {
    // A blank column reads as a broken bench. Say which filter emptied it and
    // what would fill it — the same courtesy the sprite bench's work lists pay.
    const li = document.createElement("li");
    li.className = "v-empty";
    li.innerHTML = bench.filter === "todo" && isArchived(bench.setId)
      // An archived queue is not sitting under "answered", whatever the tree
      // says about it — do not send anybody looking there for it.
      ? "Nothing left — every item in this set is already in the tree, and the "
        + "set is archived. Switch to <b>All</b> to revisit one, "
        + "<b>Unarchive</b> to put it back among the queues, or pick another."
      : EMPTY_NOTE[bench.filter] || EMPTY_NOTE.all;
    frag.appendChild(li);
    els.list.replaceChildren(frag);
    return;
  }
  for (const task of shown) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    const status = statusOf(task);
    b.className = `v-item is-${status}`;
    if (task === current()) b.setAttribute("aria-current", "true");
    b.innerHTML = `<span class="v-item-name">${task.title}</span>`
      + `<span class="v-item-sub">${task.subtitle || ""}</span>`
      + (STATUS_LABEL[status] ? `<span class="v-item-tag">${STATUS_LABEL[status]}</span>` : "");
    b.addEventListener("click", () => { goTo(bench.tasks.indexOf(task)); });
    li.appendChild(b);
    frag.appendChild(li);
  }
  els.list.replaceChildren(frag);
  els.list.querySelector('[aria-current="true"]')
    ?.scrollIntoView({ block: "nearest" });
}

function renderProgress() {
  const total = bench.tasks.length;
  let committed = 0, fresh = 0, flagged = 0;
  for (const t of bench.tasks) {
    if (inTree(t)) committed++;
    const s = statusOf(t);
    // What THIS sitting produced, which is what the export will carry.
    if (s === "edited" || s === "approved") fresh++;
    if (s === "rejected") flagged++;
  }
  const pct = total ? Math.round((committed / total) * 100) : 0;
  els.progress.textContent = total
    ? `${committed} / ${total} in the tree (${pct}%) · ${fresh} decided here${
      flagged ? ` · ${flagged} flagged` : ""}`
    : "nothing to review";
  const counts = filterCounts();
  for (const b of root.querySelectorAll("[data-filter]")) {
    const n = counts[b.dataset.filter];
    b.textContent = `${FILTER_LABEL[b.dataset.filter]} (${n})`;
  }
  els.barFill.style.width = `${pct}%`;
  // The button counts EVERY set's work, because that is what it downloads —
  // a number that only described the open set would understate the file.
  const all = totalDecisions();
  const others = setsWithWork().filter((id) => id !== bench.setId).length;
  els.exportBtn.textContent = all
    ? `⭳ Export ${all} decision(s)${others ? ` · ${others + 1} sets` : ""}`
    : "⭳ Export decisions";
  els.exportBtn.title = others
    ? `Downloads every set's decisions in one file — including ${others} set(s) you are not looking at`
    : "Downloads every decision so far, as one JSON file";
}

/**
 * THE CHEAP HALF. Everything that follows from the VALUE moving: the summary
 * line above the editor, and the canvas. No DOM is replaced, so a control the
 * pointer is holding survives.
 */
function refreshValue() {
  const task = current();
  if (!task) return;
  const status = statusOf(task);
  els.source.innerHTML = bench.provider.describe(task, valueFor(task))
    + (status !== "todo" ? ` <span class="v-item-tag">${STATUS_LABEL[status]}</span>` : "");
  scheduleDraw();
}

/** One repaint per frame however many changes arrive in it. A slider fires an
 *  input event per pixel of travel; a sprite-and-overlay redraw per pixel is
 *  what a dragged slider felt like. */
let drawPending = 0;
function scheduleDraw() {
  if (drawPending) return;
  drawPending = requestAnimationFrame(() => { drawPending = 0; draw(); });
}

/** THE EXPENSIVE HALF. Rebuilds the editor for a DIFFERENT item — so it runs
 *  on navigation, on undo and on a reset, and not on a drag. */
function renderCurrent() {
  const task = current();
  editorSyncs = [];
  if (!task) {
    els.title.textContent = "Nothing to review";
    els.subtitle.textContent = "";
    els.editor.replaceChildren();
    return;
  }
  els.title.textContent = task.title;
  els.subtitle.textContent = task.subtitle || "";
  const d = decisionFor(task);
  els.note.value = d?.note || "";
  bench.provider.renderEditor(task, {
    container: els.editor,
    value: valueFor(task),
    onChange: (patch) => applyValue(task, patch),
    // For controls that change the VIEW rather than the value — which frame
    // is on screen, say. A view change must not record a decision, so it gets
    // its own door rather than going through onChange.
    redraw: () => { renderCurrent(); },
    /** Register a control that should follow the value when something ELSE
     *  moves it — the canvas, an undo, a nudge button. Optional: a control
     *  that does not bind simply goes stale until the editor is rebuilt. */
    bindSync: (fn) => { editorSyncs.push(fn); },
  });
  refreshValue();
  // ART READINESS IS THE ENGINE'S JOB, not each task set's. A provider says
  // what an item needs (`ensureReady`); this asks for it and repaints once it
  // lands. Leaving it to the draw functions is how the canvas got stuck on
  // "loading art…" in the sets whose draw forgot to ask — a framework can
  // only forget once.
  const wait = bench.provider.ensureReady?.(task);
  if (wait?.then) {
    wait.then((fresh) => {
      // Only if the reviewer is still looking at the item that was waiting.
      if (fresh && current() === task) { renderCurrent(); }
    });
  }
}

function draw() {
  const task = current();
  const ctx = els.stage.getContext("2d");
  ctx.clearRect(0, 0, els.stage.width, els.stage.height);
  if (!task) return;
  try {
    bench.provider.draw(task, { ctx, canvas: els.stage, value: valueFor(task) });
  } catch (err) {
    ctx.fillStyle = "#d98a8a";
    ctx.font = "13px system-ui";
    ctx.fillText(`could not draw: ${err.message}`, 14, 24);
  }
}

// ------------------------------------------------------------- navigation

function goTo(index) {
  if (!bench.tasks.length) return;
  bench.i = (index + bench.tasks.length) % bench.tasks.length;
  setWork(bench.setId).i = bench.i;
  persist();
  renderAll();
  // Warm what is coming through the SAME hook, so a set declares readiness
  // once and gets both behaviours. Both directions: a queue gets walked
  // backwards as often as forwards when somebody is second-guessing a call.
  const warm = bench.provider?.ensureReady;
  if (warm) {
    warm(bench.tasks[(bench.i + 1) % bench.tasks.length]);
    warm(bench.tasks[(bench.i - 1 + bench.tasks.length) % bench.tasks.length]);
  }
}

/** Advance to the next item that still wants a decision, or just the next one
 *  when everything ahead is settled — so a pass through the queue does not
 *  make you walk back over work you have already done. */
function advance() {
  const start = bench.i;
  for (let n = 1; n <= bench.tasks.length; n++) {
    const j = (start + n) % bench.tasks.length;
    const s = statusOf(bench.tasks[j]);
    if (s === "todo") return goTo(j);   // committed items are not asked again
  }
  goTo(start + 1);
}

function approve() {
  const task = current();
  if (!task) return;
  const d = decisionFor(task);
  // An edited item stays "edited" — the distinction is what tells a reader of
  // the export which numbers a person actually moved.
  setDecision(task, {
    status: d?.status === "edited" ? "edited" : "approved",
    value: valueFor(task),
    note: els.note.value.trim() || undefined,
  });
  advance();
}

function reject() {
  const task = current();
  if (!task) return;
  setDecision(task, {
    status: "rejected",
    value: valueFor(task),
    note: els.note.value.trim() || undefined,
  });
  advance();
}

function skip() {
  const task = current();
  if (!task) return;
  setDecision(task, { status: "skipped" });
  advance();
}

function clearDecision() {
  const task = current();
  if (!task) return;
  decisions().delete(task.id);
  persist();
  renderAll();
}

function resetValue() {
  const task = current();
  if (!task) return;
  const d = decisionFor(task);
  if (d) decisions().set(task.id, { ...d, value: undefined });
  renderCurrent();
  renderProgress();
  persist();
}

// ----------------------------------------------------------------- export

/** Everything, from every set, in one document.
 *
 *  One download rather than one per set: a pass over this bench is usually a
 *  sitting that touches several kinds of check, and the person applying it
 *  wants a single artifact to land — not six files to keep in step. Each set
 *  keeps its own section, its own fingerprint and its own paste-ready block,
 *  so applying is still per-file where the answers live. */
async function exportDecisions() {
  els.state.textContent = "gathering…";
  els.state.className = "loading";
  const sets = {};
  let total = 0;
  for (const setId of setsWithWork()) {
    const w = bench.work.get(setId);
    // A set with decisions but no provider loaded — restored from a previous
    // session and never opened this one — still has to export properly, and
    // that needs its provider for the measured value and the apply block.
    const provider = await providerFor(setId);
    if (!provider) continue;
    const byId = new Map(provider.tasks.map((t) => [t.id, t]));
    const rows = [];
    for (const [taskId, d] of w.decisions) {
      const task = byId.get(taskId);
      if (!task) continue;   // an item the set no longer has
      const measured = provider.initialValue(task);
      rows.push({
        id: taskId,
        status: d.status,
        ...(task.exportKeys || {}),
        value: d.value !== undefined ? d.value : measured,
        measured,
        ...(d.note ? { note: d.note } : {}),
        at: d.at,
      });
    }
    if (!rows.length) continue;
    total += rows.length;
    sets[setId] = {
      label: SETS[setId]?.label || setId,
      fingerprint: provider.fingerprint || null,
      counts: countStatuses(rows),
      decisions: rows,
    };
    // A set that knows the shape of the file its answers belong in hands over
    // a paste-ready block, so applying is a copy rather than a transcription.
    if (provider.exportBlock) {
      const block = provider.exportBlock(rows);
      if (block) sets[setId].apply = block;
    }
  }

  const doc = {
    tool: "verification-workbench",
    format: 2,
    benchCacheKey: CACHE_KEY || null,
    exportedAt: new Date().toISOString(),
    summary: Object.entries(sets)
      .map(([id, s]) => `${id}: ${summarise(s.counts)}`).join(" · ") || "no decisions yet",
    sets,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "verification-decisions.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  els.state.textContent = total
    ? `exported ${total} decision(s) across ${Object.keys(sets).length} set(s)`
    : "exported — nothing decided yet";
  els.state.className = "loading done";
}

function countStatuses(rows) {
  const counts = { approved: 0, edited: 0, rejected: 0, skipped: 0 };
  for (const r of rows) if (r.status in counts) counts[r.status]++;
  return counts;
}

const summarise = (counts) => Object.entries(counts)
  .filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "none";

// ------------------------------------------------------------------- boot

/** A set's provider, loaded once and kept. Returns null when the module
 *  fails — a broken set must not take the rest of the bench down. */
async function providerFor(setId) {
  if (bench.providers.has(setId)) return bench.providers.get(setId);
  try {
    const p = await SETS[setId].load();
    bench.providers.set(setId, p);
    return p;
  } catch (err) {
    console.error(`verification: task set "${setId}" failed to load`, err);
    bench.providers.set(setId, null);
    return null;
  }
}

async function openSet(id) {
  bench.setId = id;
  bench.provider = null;
  bench.tasks = [];
  bench.i = 0;
  els.state.textContent = "loading…";
  els.state.className = "loading";
  els.blurb.textContent = SETS[id]?.blurb || "";
  // The URL follows the set, so a deep link to an item is shareable and Back
  // lands where it looks like it should.
  const url = new URL(location.href);
  url.searchParams.set("set", id);
  url.searchParams.delete("i");
  history.replaceState(null, "", url);

  const provider = await providerFor(id);
  if (!provider) {
    els.state.textContent = `“${SETS[id]?.label || id}” failed to load — see the console`;
    els.state.className = "loading";
    renderAll();
    return;
  }
  bench.provider = provider;
  bench.tasks = provider.tasks;
  reconcileFingerprint(id, provider.fingerprint);
  // Now that the tree has been read, the picker can be honest about this set:
  // where it belongs (anything left to answer?) and where it sits among the
  // ones you actually use. Both only ever move OTHER entries around, so the
  // set that just opened stays open and selected.
  const moved = noteEmptiness(id, bench.tasks.some((t) => !inTree(t)));
  if (noteOpened(id) || moved) renderSetPicker(id);
  const w = setWork(id);
  bench.i = Math.min(w.i || 0, Math.max(0, bench.tasks.length - 1));
  const wanted = parseInt(params.get("i") || "", 10);
  if (Number.isFinite(wanted)) bench.i = Math.max(0, Math.min(wanted, bench.tasks.length - 1));
  snapToVisible();
  els.orbitReset.hidden = !provider.resetOrbit;
  els.state.textContent = `${bench.tasks.length} item(s)`;
  els.state.className = "loading done";
  renderResume();
  renderAll();
}

function wire() {
  renderSetPicker(params.get("set"));
  els.set.addEventListener("change", () => openSet(els.set.value));
  // The picker itself carries how much work each set is holding — so switching
  // sets is an informed move rather than a guess, and a pass left half-done
  // somewhere else is visible from here.

  // Archiving is a picker move, not a queue move: the set stays open and the
  // items stay exactly where they were — only which group it is listed under
  // changes, and it survives the reload.
  els.archive.addEventListener("click", () => {
    const id = bench.setId;
    if (!SETS[id]) return;
    const on = !isArchived(id);
    setArchived(id, on);
    // Putting a queue away while the archive is hidden means putting it out of
    // sight, so the bench cannot go on showing it: move to the first queue
    // that is still listed. Unarchiving, and archiving with the archive in
    // view, both leave you where you were — the set is still on the list.
    const next = on && !showArchived ? firstUnarchived(setGroups()) : null;
    if (next && next !== id) { openSet(next); return; }
    renderSetPicker(id);
    renderArchiveButton();
    // The empty-queue note says which drawer the set is in, so it is wrong the
    // moment you move it.
    renderList();
  });

  // Default off: the point of putting a queue away is not seeing it. Ticking
  // the box does not move anything — it only widens what the picker lists —
  // so the set you are on stays where it is either way.
  els.showArchived.addEventListener("change", () => {
    setShowArchived(els.showArchived.checked);
    renderSetPicker(bench.setId);
  });

  // Only the sets that can be turned offer a way back, and it is always
  // visible while they are open — an orbited stage that cannot be un-orbited
  // is a bench showing something other than the game with no way to say so.
  const resetOrbit = () => {
    if (!bench.provider?.resetOrbit) return;
    bench.provider.resetOrbit();
    scheduleDraw();
  };
  els.orbitReset.addEventListener("click", resetOrbit);
  els.prev.addEventListener("click", () => goTo(bench.i - 1));
  els.next.addEventListener("click", () => goTo(bench.i + 1));
  els.approve.addEventListener("click", approve);
  els.skip.addEventListener("click", skip);
  els.reject.addEventListener("click", reject);
  els.clear.addEventListener("click", clearDecision);
  els.reset.addEventListener("click", resetValue);
  els.exportBtn.addEventListener("click", exportDecisions);
  els.note.addEventListener("change", () => {
    const task = current();
    if (task && decisionFor(task)) {
      setDecision(task, { note: els.note.value.trim() || undefined });
    }
  });

  for (const b of root.querySelectorAll("[data-filter]")) {
    b.addEventListener("click", () => {
      bench.filter = b.dataset.filter;
      for (const other of root.querySelectorAll("[data-filter]")) {
        other.classList.toggle("is-on", other === b);
      }
      // Follow the filter: switching to "To do" should show you a to-do.
      if (snapToVisible()) renderAll(); else renderList();
    });
  }
  root.querySelector(`[data-filter="${bench.filter}"]`).classList.add("is-on");

  els.refresh.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("bust", Date.now().toString(36));
    location.href = url.href;
  });

  // Keys are the whole point of a queue — a pass of 150 items done with the
  // mouse is a pass nobody finishes. Ignored while a text field has focus.
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (typing && e.key !== "Escape") return;
    switch (e.key) {
      // Up/down and left/right both step the queue: the list reads as a
      // vertical thing and the stage as a horizontal one, and which of those
      // a hand reaches for depends on where the eye is.
      case "ArrowLeft": case "ArrowUp": goTo(bench.i - 1); break;
      case "ArrowRight": case "ArrowDown": goTo(bench.i + 1); break;
      case "Enter": approve(); break;
      case "s": case "S": skip(); break;
      case "r": case "R": reject(); break;
      case "z": case "Z": resetValue(); break;
      case "o": case "O":
        if (bench.provider?.resetOrbit) { bench.provider.resetOrbit(); scheduleDraw(); }
        break;
      case "Escape": e.target.blur?.(); break;
      default: return;
    }
    e.preventDefault();
  });

  // The canvas is a placement surface where a set wants one.
  let dragging = false;
  const toStage = (e) => {
    const r = els.stage.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (els.stage.width / r.width),
      y: (e.clientY - r.top) * (els.stage.height / r.height),
    };
  };
  const handle = (e, phase) => {
    const task = current();
    if (!task || !bench.provider?.onCanvasDrag) return;
    const value = bench.provider.onCanvasDrag(task, toStage(e), {
      canvas: els.stage, value: valueFor(task), phase,
    });
    applyValue(task, value);
    // Repainted whether or not a value came back: a set can use the drag to
    // move the VIEW instead of a value (the model sets orbit the camera with
    // it), and that has to show even though nothing was decided.
    scheduleDraw();
  };
  els.stage.addEventListener("pointerdown", (e) => {
    if (!bench.provider?.onCanvasDrag) return;
    dragging = true;
    els.stage.setPointerCapture(e.pointerId);
    handle(e, "start");
  });
  els.stage.addEventListener("pointermove", (e) => { if (dragging) handle(e, "move"); });
  const end = (e) => { if (!dragging) return; dragging = false; handle(e, "end"); };
  els.stage.addEventListener("pointerup", end);
  els.stage.addEventListener("pointercancel", end);
  // The wheel is the other half of turning a body over: dolly in on the hand
  // that is wrong. Only for sets that want it, and never scrolls the page.
  els.stage.addEventListener("wheel", (e) => {
    if (!bench.provider?.onCanvasWheel) return;
    e.preventDefault();
    bench.provider.onCanvasWheel(e.deltaY);
    scheduleDraw();
  }, { passive: false });
}

await loadCoreAssets();
wire();
await openSet(els.set.value);
