// The AUDIO WORKBENCH (`/workbench/?edit=audio`).
//
// Twelve lines in this game are spoken by a named fighter, and until this page
// existed the only way to hear one was to win a match to full meter and land
// the move. That is a bad loop for judging a performance — which is exactly
// what a take needs judging on, and the one thing the generator cannot check.
//
// So: pick a fighter, see who is speaking, hear every line they have.
//
// Two rules it follows, both borrowed from the sprite bench:
//
//   * It plays through the GAME'S mixer (`playSfx`), not its own Audio element.
//     A line's loudness here is its loudness in a match — category trim,
//     per-sound gain and the SFX slider all applied — so "too quiet" heard here
//     is a real finding rather than an artefact of the tool.
//   * It draws through the GAME'S sprite pipeline, so the fighter on the left
//     is the fighter in play.
//
// The cast list is derived from the call tables rather than written down here.
// A fighter given a line tomorrow shows up on this page with no edit to it.

import { CHARACTERS } from "../src/characters.js";
import {
  playSfx, playSfxEntry, cutSfx, sfxUrl, spokenLead, spokenCommitAt, audioSettings,
  GRUNT_GROUPS, KO_FOR_GROUP,
} from "../src/audio.js";
import { loadCoreAssets, loadFrame, frameKeys } from "../src/assets.js";
import { currentFrame, drawCharFrame } from "../src/render_backend.js";
import { state } from "../src/state.js";

// EXACTLY ONE module is imported with this page's cache key on its URL, and the
// restraint is the whole lesson. A keyed URL is a DIFFERENT MODULE INSTANCE, so
// keying `assets.js` gave the bench a private image cache: it loaded a
// fighter's idle into its own copy while the sprite pipeline drew from the
// other one, and every character sat behind "art still loading…" forever. A
// stale bench is a nuisance; a broken one is worse.
//
// `config_audio.js` is safe to double because it is nothing but const tables —
// no cache, no handles, no state to split — and it is the file that actually
// changes when the thing this page displays changes. So it gets the key, and
// what the bench SHOWS is never stale. What the bench PLAYS goes through
// audio.js's own copy and revalidates on the ordinary schedule.
const CACHE_KEY = new URL(import.meta.url).searchParams.get("v") || "";
const {
  DOMAIN_CALL, MOVE_CALL, SFX, SPOKEN_LINES, SPOKEN_TIMING, AUDIO_MIX, VOICE_ALTERNATES,
} = await import(`../src/config_audio.js${CACHE_KEY ? `?v=${encodeURIComponent(CACHE_KEY)}` : ""}`);

const $ = (sel) => document.querySelector(sel);
const els = {
  castList: $("#castList"), castSummary: $("#castSummary"),
  charName: $("#charName"), charSub: $("#charSub"),
  trackList: $("#trackList"), trackSummary: $("#trackSummary"),
  loadState: $("#loadState"), stage: $("#stage"), refresh: $("#refreshBtn"), export: $("#exportBtn"),
};
const ctx = els.stage.getContext("2d");

// ---------------------------------------------------------------- the cast
//
// Who has something to say, and what. One entry per fighter, in roster order so
// the list reads the way the select screen does.

/** -> [{ key, label, sfx, kind }] for one fighter, spoken lines first. */
function tracksFor(charKey) {
  const char = CHARACTERS[charKey];
  const out = [];

  const domainCall = DOMAIN_CALL[charKey];
  if (domainCall) {
    const domain = char.domains?.[0];
    out.push({
      kind: "line",
      sfx: domainCall,
      label: "Domain Expansion",
      detail: domain ? domain.name : null,
    });
  }
  for (const [moveName, key] of Object.entries(MOVE_CALL[charKey] || {})) {
    out.push({ kind: "line", sfx: key, label: moveName, detail: whereIsMove(char, moveName) });
  }

  // The wordless half of a fighter's voice. Shared between several characters —
  // that is the point of the groups — and shown so the page answers "what does
  // this fighter sound like" rather than only "what do they say".
  const group = GRUNT_GROUPS[charKey];
  if (group) {
    out.push({ kind: "grunt", sfx: group, label: "Effort grunt", detail: `${group} — one of three, drawn at random` });
    const ko = KO_FOR_GROUP[group];
    if (ko) out.push({ kind: "grunt", sfx: ko, label: "KO cry", detail: ko });
  }
  return out;
}

/** `gruntAdultMale` -> "adult male", for a list a person reads. */
function voiceGroupName(group) {
  return group.replace(/^grunt/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** Which slot a named move sits in, for the track's subtitle. */
function whereIsMove(char, moveName) {
  for (const [slot, cfg] of Object.entries(char.specials || {})) {
    if (cfg.name === moveName) return `${slot} special`;
  }
  if (char.ultimate?.name === moveName) return "ultimate";
  return null;
}

const SPEAKERS = Object.keys(CHARACTERS).filter(
  (k) => DOMAIN_CALL[k] || Object.keys(MOVE_CALL[k] || {}).length
);

// Everyone who speaks, plus a stand-in for every voice group none of them uses.
//
// The nine speakers between them cover four of the six grunt groups, which left
// gruntAdultMale and gruntFemale — eleven fighters, two KO cries and two whole
// alternate trios — with no way into this page at all. A bench for the game's
// voice has to be able to reach the game's voice, so each uncovered group
// borrows the first fighter on the roster who uses it. They are here as a
// REPRESENTATIVE rather than because they say anything, and the page says so.
const STAND_INS = {};
{
  const covered = new Set(SPEAKERS.map((k) => GRUNT_GROUPS[k]).filter(Boolean));
  for (const [charKey, group] of Object.entries(GRUNT_GROUPS)) {
    if (covered.has(group)) continue;
    covered.add(group);
    STAND_INS[charKey] = group;
  }
}
const CAST = Object.keys(CHARACTERS).filter((k) => SPEAKERS.includes(k) || STAND_INS[k]);

// --------------------------------------------------------------- rendering

let selected = null;
let animT = 0;
let lastFrameTime = 0;

function renderCast() {
  els.castList.innerHTML = "";
  for (const key of CAST) {
    const lines = tracksFor(key).filter((t) => t.kind === "line").length;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    const sub = STAND_INS[key]
      ? `stands in · ${voiceGroupName(STAND_INS[key])}`
      : `${lines} line${lines === 1 ? "" : "s"}`;
    btn.innerHTML = `${CHARACTERS[key].name}<span class="n">${sub}</span>`;
    btn.addEventListener("click", () => select(key));
    li.append(btn);
    els.castList.append(li);
  }
  const totalLines = SPEAKERS.reduce((n, k) => n + tracksFor(k).filter((t) => t.kind === "line").length, 0);
  const stand = Object.keys(STAND_INS).length;
  els.castSummary.textContent = `${SPEAKERS.length} speak · ${totalLines} lines`
    + (stand ? ` · ${stand} stand in for the rest of the voices` : "");
}

function markSelected() {
  [...els.castList.querySelectorAll("button")].forEach((b, i) => {
    b.setAttribute("aria-current", CAST[i] === selected ? "true" : "false");
  });
}

/** Seconds, or a dash when the line has no declared length (which would mean
 *  it fires with no wind-up — worth seeing rather than hiding). */
const secs = (n) => (n ? `${n.toFixed(2)}s` : "—");

function renderTracks() {
  const tracks = tracksFor(selected);
  els.trackList.innerHTML = "";
  const groups = [
    ["Spoken lines", tracks.filter((t) => t.kind === "line")],
    ["Wordless", tracks.filter((t) => t.kind === "grunt")],
  ];
  for (const [title, list] of groups) {
    if (!list.length) continue;
    const box = document.createElement("div");
    box.className = "track-group";
    const h = document.createElement("h3");
    h.textContent = title;
    box.append(h);
    for (const t of list) box.append(...trackRow(t));
    els.trackList.append(box);
  }
  const lines = tracks.filter((t) => t.kind === "line").length;
  els.trackSummary.textContent =
    `${CHARACTERS[selected].name} · ${lines} spoken, ${tracks.length - lines} wordless`;
}

function trackRow(t) {
  const entry = SFX[t.sfx];
  const row = document.createElement("div");
  row.className = "track";

  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "▶";
  play.title = `Play ${t.sfx}`;
  play.addEventListener("click", () => playTrack(t, row));

  const body = document.createElement("div");
  const files = entry ? [entry.file].flat() : [];
  const length = SPOKEN_LINES[t.sfx];
  const bits = [];
  if (t.detail) bits.push(t.detail);
  if (VOICE_ALTERNATES[t.sfx]) bits.push('<span class="tag tag--live">in game</span>');
  bits.push(`<code>${t.sfx}</code>`);
  if (files.length) bits.push(files.length > 1 ? `${files.length} files` : `<code>${files[0]}</code>`);

  if (!entry) {
    bits.push(`<span class="missing">not registered — silent in game</span>`);
  } else if (t.kind === "line") {
    // The three numbers that decide how the move plays, all read from config
    // rather than from the file, exactly as the game reads them.
    const lead = spokenLead(t.sfx);
    const commit = spokenCommitAt(t.sfx);
    bits.push(`length ${secs(length)}`, `fires ${secs(lead)}`, `interruptible to ${secs(commit)}`);
  }
  // What the mixer will actually do to it, so a level judged here is the level
  // in play rather than the raw file.
  if (entry) {
    const cat = AUDIO_MIX.categories[entry.category] ?? 1;
    bits.push(`${entry.category} ×${(cat * (entry.gain ?? 1)).toFixed(2)}`);
  }

  body.innerHTML = `<div class="label">${t.label}</div><div class="meta">${bits.join(" · ")}</div>`;
  row.append(play, body);

  // Other recordings of the same sound, if any were kept. Shown UNDER the take
  // in play and marked as alternates, because the comparison only means
  // anything if it is obvious which one the game actually uses.
  const alts = VOICE_ALTERNATES[t.sfx] || [];
  const out = [row];
  if (!alts.length && files.length < 2) return out;
  row.classList.add("has-alts");

  // A sound with several interchangeable files gets a row PER FILE, both for
  // the take in play and for every alternate. A group is not a thing you judge
  // as a unit: three grunts are three performances, and the useful verdict is
  // usually "the first and third, and the alternate's second" — which needs
  // each one on its own button, not one button that draws at random.
  // A single-file sound with alternates gets rows too, but they are EXCLUSIVE:
  // a domain call is one file, and its registry entry cannot hold two. Ticking
  // one there untanks the other, which is the difference between "which of
  // these do I want" and "which of these do I want to keep".
  const exclusive = files.length < 2;
  const perFile = (list, kind, label) => {
    for (const file of list) out.push(fileRow(t.sfx, entry, file, kind, label, exclusive));
  };
  perFile(files, "live", "in game");

  for (const alt of alts) {
    const afiles = [alt.file].flat();
    const arow = document.createElement("div");
    arow.className = "track alt";
    const abtn = document.createElement("button");
    abtn.type = "button";
    abtn.textContent = "▶";
    abtn.title = `Play ${alt.name || "the alternate"}`;
    // Mixed through the entry the alternate would REPLACE — same category, same
    // gain — so what is being compared is the take and nothing else.
    abtn.addEventListener("click", () =>
      playEntry({ file: alt.file, category: entry.category, gain: entry.gain }, arow));
    const abody = document.createElement("div");
    const ameta = [alt.note];
    ameta.push(afiles.length > 1 ? `${afiles.length} files` : `<code>${afiles[0]}</code>`);
    abody.innerHTML = `<div class="label">${alt.name || "Alternate"} <span class="tag">not in game</span></div>`
      + `<div class="meta">${ameta.join(" · ")}</div>`;
    arow.append(abtn, abody);
    out.push(arow);
    perFile(afiles, "alt", alt.name || "alternate");
  }

  // The verdict, as something that can be acted on. Ticking files across the
  // takes builds the array that would go in the registry, so "I like these
  // three" leaves the bench as a line to paste rather than as a description.
  out.push(chooserRow(t.sfx, entry));
  return out;
}

// Which files are ticked, per sound. Seeded from what the game plays, so the
// readout starts by describing the status quo and every change to it is
// visible as a change.
const chosen = new Map();

// Files marked for deletion, and files marked to move to a different voice
// group. Both are decisions ABOUT A FILE rather than about a sound, so they
// live beside `chosen` rather than inside it: a take can be dropped from the
// group it is in and still be wanted somewhere else, and one that is wanted
// nowhere should stop taking up space in assets/sfx/.
const deleted = new Set();
const moved = new Map();

// Where a take can be moved TO: the voice groups and the KO cries, which are
// the sounds a wordless take could plausibly belong to. Deliberately not every
// voice-category sound — nothing here belongs in a Domain Expansion call-out.
const MOVE_TARGETS = [
  ...new Set([...Object.values(GRUNT_GROUPS), ...Object.values(KO_FOR_GROUP)]),
].filter((k) => SFX[k]);
function chosenFor(key, entry) {
  if (!chosen.has(key)) chosen.set(key, new Set([entry.file].flat()));
  return chosen.get(key);
}

function fileRow(key, entry, file, kind, label, exclusive) {
  const row = document.createElement("div");
  row.className = `track file file--${kind}`;
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "▶";
  play.title = `Play ${file}`;
  // One exact file, not a draw from the group: this row exists to judge THIS
  // recording, so it must play this recording every time.
  play.addEventListener("click", () =>
    playEntry({ file, category: entry.category, gain: entry.gain }, row));

  const body = document.createElement("div");
  const tick = document.createElement("label");
  tick.className = "tick tick--keep";
  const box = document.createElement("input");
  const set = chosenFor(key, entry);
  box.type = exclusive ? "radio" : "checkbox";
  if (exclusive) box.name = `pick-${key}`;
  box.checked = set.has(file);
  box.addEventListener("change", () => {
    if (exclusive) {
      set.clear();
      set.add(file);
    } else if (box.checked) {
      set.add(file);
    } else {
      set.delete(file);
    }
    refreshChooser(key, entry);
  });
  tick.append(box, document.createTextNode(exclusive ? "use" : "keep"));

  // Delete. Contradicts "keep", so ticking one clears the other rather than
  // letting a file be both wanted and binned — the export would have to guess.
  const binLabel = document.createElement("label");
  binLabel.className = "tick tick--bin";
  const bin = document.createElement("input");
  bin.type = "checkbox";
  bin.checked = deleted.has(file);
  binLabel.append(bin, document.createTextNode("delete"));

  // Move to another group. The checkbox is the decision; the select is where it
  // goes, and stays hidden until there is a decision to make, because most rows
  // are never moved and a select on every one of them is noise.
  const moveLabel = document.createElement("label");
  moveLabel.className = "tick tick--move";
  const mover = document.createElement("input");
  mover.type = "checkbox";
  mover.checked = moved.has(file);
  moveLabel.append(mover, document.createTextNode("move"));

  const where = document.createElement("select");
  where.className = "move-to";
  where.hidden = !moved.has(file);
  for (const target of MOVE_TARGETS) {
    const opt = document.createElement("option");
    opt.value = target;
    opt.textContent = voiceGroupName(target.replace(/^ko/, "KO ")) || target;
    if (target === key) opt.disabled = true;
    where.append(opt);
  }
  where.value = moved.get(file) || MOVE_TARGETS.find((t) => t !== key);

  const syncRow = () => {
    row.classList.toggle("binned", bin.checked);
    row.classList.toggle("moving", mover.checked);
    where.hidden = !mover.checked;
    refreshChooser(key, entry);
  };
  bin.addEventListener("change", () => {
    if (bin.checked) {
      deleted.add(file);
      box.checked = false;
      set.delete(file);
      mover.checked = false;
      moved.delete(file);
    } else {
      deleted.delete(file);
    }
    syncRow();
  });
  mover.addEventListener("change", () => {
    if (mover.checked) {
      moved.set(file, where.value);
      bin.checked = false;
      deleted.delete(file);
    } else {
      moved.delete(file);
    }
    syncRow();
  });
  where.addEventListener("change", () => { moved.set(file, where.value); refreshChooser(key, entry); });

  body.innerHTML = `<code>${file}</code> <span class="from">${label}</span>`;
  body.append(tick, binLabel, moveLabel, where);
  row.classList.toggle("binned", bin.checked);
  row.classList.toggle("moving", mover.checked);
  row.append(play, body);
  return row;
}

function chooserRow(key, entry) {
  const row = document.createElement("div");
  row.className = "track chooser";
  row.dataset.chooser = key;
  row.innerHTML = "<div></div><div></div>";
  refreshChooser(key, entry, row);
  return row;
}

function refreshChooser(key, entry, row) {
  const el = row || els.trackList.querySelector(`[data-chooser="${CSS.escape(key)}"]`);
  if (!el) return;
  const picked = [...chosenFor(key, entry)];
  const live = [entry.file].flat();
  const same = picked.length === live.length && picked.every((f) => live.includes(f));
  const single = live.length < 2;
  const body = el.lastElementChild;
  // A single-file sound reads back as a string, a group as an array, because
  // that is the shape the registry wants in each case.
  const value = single ? `"${picked[0]}"` : `[${picked.map((f) => `"${f}"`).join(", ")}]`;
  body.innerHTML = picked.length
    ? `<div class="label">${same ? "As it ships" : "Your pick"} <span class="tag">${picked.length} file${picked.length === 1 ? "" : "s"}</span></div>`
      + `<div class="meta">Paste into <code>SFX.${key}</code>:</div>`
      + `<pre>file: ${value},</pre>`
    : `<div class="label">Nothing kept</div><div class="meta">A sound with no file is silence — tick at least one.</div>`;
  el.classList.toggle("changed", !same);
}

// ------------------------------------------------------------------ export
//
// Everything ticked that differs from what ships, as a file somebody can act
// on. A verdict that lives only on a screen has to be retyped by whoever
// applies it, and retyping a list of eleven filenames is how the wrong take
// ends up in the game.
async function exportChanges() {
  const changes = [];
  for (const [key, set] of chosen) {
    const entry = SFX[key];
    if (!entry) continue;
    const live = [entry.file].flat();
    const picked = [...set];
    const same = picked.length === live.length && picked.every((f) => live.includes(f));
    if (same) continue;
    const single = live.length < 2;
    const change = {
      sfx: key,
      category: entry.category,
      shipping: single ? live[0] : live,
      chosen: single ? picked[0] : picked,
      added: picked.filter((f) => !live.includes(f)),
      dropped: live.filter((f) => !picked.includes(f)),
    };
    // A spoken line's LENGTH is frame data (SPOKEN_LINES), so a swap is not
    // done until that number moves with it. Measured off the actual file here
    // rather than guessed, so whoever applies this has the number in hand.
    if (SPOKEN_LINES[key] !== undefined) {
      change.spokenLine = {
        currentLength: SPOKEN_LINES[key],
        measuredLength: single ? await measure(picked[0]) : null,
        note: "update SPOKEN_LINES to the measured length, then run node tools/check_voice.mjs",
      };
    }
    changes.push(change);
  }

  // A move is a file leaving one group for another, so it is reported once,
  // whole, rather than as a removal in one sound and an addition in another
  // that somebody has to pair up by hand.
  const reassignments = [...moved].map(([file, to]) => ({
    file,
    from: Object.keys(SFX).find((k) => [SFX[k].file].flat().includes(file))
      || Object.entries(VOICE_ALTERNATES).find(([, list]) =>
           list.some((a) => [a.file].flat().includes(file)))?.[0] || null,
    to,
  }));
  const deletions = [...deleted];

  const parts = [];
  if (changes.length) parts.push(`${changes.length} sound(s) changed`);
  if (deletions.length) parts.push(`${deletions.length} file(s) to delete`);
  if (reassignments.length) parts.push(`${reassignments.length} file(s) to move`);

  const doc = {
    tool: "audio-workbench",
    format: 2,
    benchCacheKey: CACHE_KEY || null,
    summary: parts.join(" · ") || "no changes — everything is still as it ships",
    changes,
    deletions,
    reassignments,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "audio-workbench-changes.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  els.loadState.textContent = parts.length ? `exported: ${parts.join(", ")}` : "exported — nothing changed yet";
  els.loadState.className = "loading done";
}

/** A file's real duration, off the file. Resolves null if it will not load. */
function measure(file) {
  return new Promise((done) => {
    const probe = new Audio(sfxUrl(file));
    probe.addEventListener("loadedmetadata", () => done(Number(probe.duration.toFixed(2))));
    probe.addEventListener("error", () => done(null));
    setTimeout(() => done(null), 5000);
  });
}

// ------------------------------------------------------------------ playing
//
// One at a time. Starting a second line cuts the first the way a hit does in
// play — which is also the only way to hear what that cut sounds like.
let nowPlaying = null;

function playTrack(t, row) {
  playEntry(t.sfx, row);
}

/** `what` is a registry key or a registry-shaped entry (an alternate take). */
function playEntry(what, row) {
  if (nowPlaying) {
    cutSfx(nowPlaying.el);
    nowPlaying.row.classList.remove("playing");
  }
  const el = typeof what === "string" ? playSfx(what, 1) : playSfxEntry(what, 1);
  if (!el) {
    els.loadState.textContent = "nothing to play — the file is missing or sound is off";
    els.loadState.className = "loading";
    return;
  }
  row.classList.add("playing");
  nowPlaying = { el, row };
  const done = () => {
    row.classList.remove("playing");
    if (nowPlaying?.el === el) nowPlaying = null;
  };
  el.addEventListener("ended", done);
  el.addEventListener("pause", done);
}

// -------------------------------------------------------------------- stage

async function select(charKey) {
  selected = charKey;
  markSelected();
  const char = CHARACTERS[charKey];
  els.charName.textContent = char.fullName || char.name;
  els.charSub.textContent = STAND_INS[charKey]
    ? `${char.epithet || ""} — standing in for the ${voiceGroupName(STAND_INS[charKey])} voice, which nobody with a spoken line uses`
    : (char.epithet || "");
  renderTracks();

  // Only this fighter's idle art, loaded on demand — the bench has no reason to
  // pull the whole roster's sheets to show one standing pose.
  const idle = frameKeys(charKey).filter((k) => k.startsWith("idle"));
  await Promise.all(idle.map((k) => loadFrame(charKey, k).catch(() => {})));
  els.loadState.textContent = "ready";
  els.loadState.className = "loading done";
}

function draw(now) {
  requestAnimationFrame(draw);
  const dt = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) / 1000) : 0;
  lastFrameTime = now;
  ctx.clearRect(0, 0, els.stage.width, els.stage.height);
  if (!selected) return;
  animT += dt;

  // The idle cycles, because a still frame of an idle is not what the character
  // looks like — the game draws two frames and so does this.
  const frame = currentFrame(selected, "idle", animT);
  const drew = drawCharFrame(ctx, selected, frame, els.stage.width / 2, els.stage.height - 20, {
    scale: 1.05, facing: 1,
  });
  if (!drew) {
    ctx.fillStyle = "#9aa4c0";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("art still loading…", els.stage.width / 2, els.stage.height / 2);
  }
}

// --------------------------------------------------------------------- boot

async function boot() {
  // `?edit=audio` is how this bench is addressed; every OTHER `?edit=` value is
  // a different bench and router.js has already redirected by the time this
  // runs (see index.html). What can still arrive here is a mode nobody has —
  // the router leaves those on this page and marks them, so say so rather than
  // pretending the URL was what they meant.
  const params = new URLSearchParams(location.search);
  const unknown = document.documentElement.dataset.unknownMode;
  if (unknown) {
    const note = $("#unknownMode");
    note.textContent = `No bench called “${unknown}”. These are the ones there are:`;
    note.hidden = false;
  }

  // playSfx refuses to make a sound while the game thinks effects are off, and
  // this page has no Settings screen to turn them back on. It is a bench: it
  // exists to play things.
  state.sfxEnabled = true;
  if (audioSettings.sfxVolume <= 0) audioSettings.sfxVolume = AUDIO_MIX.sfxVolume;
  audioSettings.muted = false;

  // Reload against a key nobody has fetched: the HTML misses the cache, and the
  // token it carries makes the stylesheet, this module and everything this
  // module imports miss it too. The one button that always tells the truth.
  els.export.addEventListener("click", () => { exportChanges(); });
  els.refresh.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("bust", Date.now().toString(36));
    location.href = url.href;
  });
  if (params.get("bust")) {
    els.refresh.textContent = "↻ Refreshed";
    els.refresh.title = `Loaded with cache key ${CACHE_KEY} — nothing on this page came from a cache`;
  }

  await loadCoreAssets();
  renderCast();
  requestAnimationFrame(draw);

  const wanted = params.get("char");
  await select(CAST.includes(wanted) ? wanted : CAST[0]);
}

boot().catch((err) => {
  els.loadState.textContent = `failed to start: ${err.message}`;
  console.error(err);
});
