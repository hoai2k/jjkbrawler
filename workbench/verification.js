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
  "strike-points": {
    label: "Strike points",
    blurb: "Where each attack actually lands — the fist, the foot or the blade — "
      + "checked against the fighter's own drawing.",
    load: () => import(withKey("./verify_strike_points.js")).then((m) => m.provider()),
  },
  "center-of-mass": {
    label: "Centre of mass",
    blurb: "Where each fighter's weight sits. One global 0.55 drives the tumble "
      + "pivot, the 3D rotation and the aim chest line — it was chosen, never measured.",
    load: () => import(withKey("./verify_body_points.js")).then((m) => m.comProvider()),
  },
  "muzzle-points": {
    label: "Muzzle points",
    blurb: "Where a shot leaves the caster. Today it is one offset for the whole "
      + "roster, scaled by height — so it departs one fighter's forehead and another's waist.",
    load: () => import(withKey("./verify_body_points.js")).then((m) => m.muzzleProvider()),
  },
  "ledge-grip": {
    label: "Ledge grip",
    blurb: "Where the hand meets the lip on a ledge hang, per fighter.",
    load: () => import(withKey("./verify_body_points.js")).then((m) => m.ledgeProvider()),
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
  "pose-reads": {
    label: "Pose reads",
    blurb: "Does the model's pose read as the drawing it was built from?",
    load: () => import(withKey("./verify_model.js")).then((m) => m.poseProvider()),
  },
};

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
    <select id="vSet" class="ghost" aria-label="Task set"></select>
    <button id="vExport" class="ghost ghost--go" type="button"
            title="Download every decision so far, as JSON">⭳ Export decisions</button>
    <button id="vRefresh" class="ghost" type="button"
            title="Reload with a fresh cache key">↻ Refresh</button>
    <span id="vState" class="loading">loading…</span>
  </header>

  <main class="layout layout--verify">
    <aside class="col">
      <h2>Queue</h2>
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
        <b>Approve</b> records the value as it stands — measured or edited.
        <b>Flag as broken</b> is for an item no nudge can fix (a mis-gripped
        weapon, a pose that never extends): it exports as a rejection with your
        note, so the fix lands where the fault is instead of being papered over
        here. Nothing on this page reaches the game until the export is applied
        and committed.
      </p>
      <p class="legend" id="vKeys">
        <b>←/→</b> move · <b>Enter</b> approve &amp; next · <b>S</b> skip ·
        <b>R</b> flag · <b>Z</b> undo edit · drag on the canvas to place.
      </p>
    </section>
  </main>
`;

const el = (id) => document.getElementById(id);
const els = {
  blurb: el("vBlurb"), set: el("vSet"), exportBtn: el("vExport"), refresh: el("vRefresh"),
  state: el("vState"), progress: el("vProgress"), barFill: el("vBarFill"), list: el("vList"),
  stage: el("vStage"), title: el("vTitle"), subtitle: el("vSubtitle"), source: el("vSource"),
  editor: el("vEditor"), note: el("vNote"), resume: el("vResume"),
  prev: el("vPrev"), next: el("vNext"), approve: el("vApprove"), skip: el("vSkip"),
  reset: el("vReset"), reject: el("vReject"), clear: el("vClear"),
};

// ---------------------------------------------------------------- the state

const bench = {
  setId: null,
  provider: null,
  tasks: [],
  i: 0,
  filter: "all",
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

/** One store for the whole bench. Each set carries the fingerprint of the
 *  measurements it was reviewing, so a re-bake drops THAT set's stale
 *  decisions and leaves the others alone — the failure the pose bench's
 *  stored edits used to cause, headed off rather than repeated. */
const STORE = "jjk.verify.v2";

function setWork(setId) {
  let w = bench.work.get(setId);
  if (!w) bench.work.set(setId, (w = { fingerprint: null, i: 0, decisions: new Map() }));
  return w;
}

function persist() {
  try {
    const out = {};
    for (const [id, w] of bench.work) {
      if (!w.decisions.size) continue;
      out[id] = { fingerprint: w.fingerprint, i: w.i, decisions: [...w.decisions] };
    }
    localStorage.setItem(STORE, JSON.stringify({ at: new Date().toISOString(), sets: out }));
  } catch { /* private mode, quota — the export is the real record */ }
}

/** Read every set's stored work back. Called once, before any set opens, so
 *  the total is known even for sets this session never visits. */
function restoreAll() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch { saved = null; }
  if (!saved?.sets) return;
  for (const [id, w] of Object.entries(saved.sets)) {
    if (!SETS[id]) continue;   // a set that has since been removed
    bench.work.set(id, {
      fingerprint: w.fingerprint || null,
      i: w.i || 0,
      decisions: new Map(w.decisions || []),
    });
  }
  bench.restoredAt = saved.at || null;
}

/** Drop a set's restored decisions when the numbers they were about have
 *  moved. Announced rather than silent: a queue that quietly emptied itself
 *  would read as the bench losing work. */
function reconcileFingerprint(setId, fingerprint) {
  const w = setWork(setId);
  if (w.fingerprint && fingerprint && w.fingerprint !== fingerprint && w.decisions.size) {
    const n = w.decisions.size;
    w.decisions.clear();
    w.i = 0;
    w.fingerprint = fingerprint;
    return n;
  }
  w.fingerprint = fingerprint;
  return 0;
}

function renderResume(dropped) {
  const total = totalDecisions();
  if (!total && !dropped) { els.resume.hidden = true; return; }
  els.resume.hidden = false;
  const when = (bench.restoredAt || "").slice(0, 16).replace("T", " ");
  const parts = [];
  if (total) parts.push(`Holding <b>${total}</b> decision(s) across ${setsWithWork().length} set(s)`
    + (when ? `, last touched ${when}` : ""));
  if (dropped) parts.push(`<b>${dropped}</b> dropped — the measurements they were about have changed`);
  els.resume.innerHTML = `${parts.join(". ")}. `
    + `<button class="ghost sm" id="vDiscard" type="button">Discard all and start over</button>`;
  el("vDiscard").addEventListener("click", () => {
    if (!confirm("Throw away every decision in every set?")) return;
    try { localStorage.removeItem(STORE); } catch { /* nothing to clear */ }
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

// --------------------------------------------------------------- rendering

function renderAll() {
  renderList();
  renderCurrent();
  renderProgress();
  refreshSetCounts();
}

/** Decision counts on the set picker's options. */
function refreshSetCounts() {
  for (const opt of els.set.options) {
    const n = bench.work.get(opt.value)?.decisions.size || 0;
    opt.textContent = n ? `${SETS[opt.value].label} (${n})` : SETS[opt.value].label;
  }
}

function statusOf(task) {
  return decisionFor(task)?.status || "todo";
}

const STATUS_LABEL = {
  approved: "approved", edited: "edited", rejected: "flagged",
  skipped: "skipped", todo: "",
};

function visibleTasks() {
  if (bench.filter === "todo") {
    return bench.tasks.filter((t) => {
      const s = statusOf(t);
      return s === "todo" || s === "skipped";
    });
  }
  if (bench.filter === "done") {
    return bench.tasks.filter((t) => ["approved", "edited", "rejected"].includes(statusOf(t)));
  }
  return bench.tasks;
}

function renderList() {
  const frag = document.createDocumentFragment();
  for (const task of visibleTasks()) {
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
  let decided = 0, edited = 0, flagged = 0;
  for (const t of bench.tasks) {
    const s = statusOf(t);
    if (["approved", "edited", "rejected"].includes(s)) decided++;
    if (s === "edited") edited++;
    if (s === "rejected") flagged++;
  }
  const pct = total ? Math.round((decided / total) * 100) : 0;
  els.progress.textContent = total
    ? `${decided} / ${total} decided (${pct}%) · ${edited} edited · ${flagged} flagged`
    : "nothing to review";
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

function renderCurrent() {
  const task = current();
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
  const status = statusOf(task);
  els.source.innerHTML = bench.provider.describe(task, valueFor(task))
    + (status !== "todo" ? ` <span class="v-item-tag">${STATUS_LABEL[status]}</span>` : "");
  bench.provider.renderEditor(task, {
    container: els.editor,
    value: valueFor(task),
    onChange: (value) => {
      setDecision(task, { status: "edited", value });
      renderCurrent();
      renderList();
      renderProgress();
    },
    // For controls that change the VIEW rather than the value — which frame
    // is on screen, say. A view change must not record a decision, so it gets
    // its own door rather than going through onChange.
    redraw: () => renderCurrent(),
  });
  draw();
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
}

/** Advance to the next item that still wants a decision, or just the next one
 *  when everything ahead is settled — so a pass through the queue does not
 *  make you walk back over work you have already done. */
function advance() {
  const start = bench.i;
  for (let n = 1; n <= bench.tasks.length; n++) {
    const j = (start + n) % bench.tasks.length;
    const s = statusOf(bench.tasks[j]);
    if (s === "todo") return goTo(j);
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
  const dropped = reconcileFingerprint(id, provider.fingerprint);
  const w = setWork(id);
  bench.i = Math.min(w.i || 0, Math.max(0, bench.tasks.length - 1));
  const wanted = parseInt(params.get("i") || "", 10);
  if (Number.isFinite(wanted)) bench.i = Math.max(0, Math.min(wanted, bench.tasks.length - 1));
  els.state.textContent = `${bench.tasks.length} item(s)`;
  els.state.className = "loading done";
  renderResume(dropped);
  renderAll();
}

function wire() {
  for (const [id, def] of Object.entries(SETS)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = def.label;
    els.set.appendChild(opt);
  }
  const asked = params.get("set");
  els.set.value = SETS[asked] ? asked : Object.keys(SETS)[0];
  els.set.addEventListener("change", () => openSet(els.set.value));
  // How much work each set is holding, in the picker itself — so switching
  // sets is an informed move rather than a guess, and a pass left half-done
  // somewhere else is visible from here.
  refreshSetCounts();

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
      renderList();
    });
  }
  root.querySelector('[data-filter="all"]').classList.add("is-on");

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
      case "ArrowLeft": goTo(bench.i - 1); break;
      case "ArrowRight": goTo(bench.i + 1); break;
      case "Enter": approve(); break;
      case "s": case "S": skip(); break;
      case "r": case "R": reject(); break;
      case "z": case "Z": resetValue(); break;
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
    if (value === undefined || value === null) return;
    setDecision(task, { status: "edited", value });
    renderCurrent();
    if (phase === "end") { renderList(); renderProgress(); }
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
}

await loadCoreAssets();
restoreAll();
wire();
await openSet(els.set.value);
