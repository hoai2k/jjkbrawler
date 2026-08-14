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
  DOMAIN_CALL, MOVE_CALL, SFX, SPOKEN_LINES, SPOKEN_TIMING, AUDIO_MIX, VOICE_ALTERNATES,
} from "../src/config_audio.js";
import {
  playSfx, playSfxEntry, cutSfx, spokenLead, spokenCommitAt, audioSettings,
  GRUNT_GROUPS, KO_FOR_GROUP,
} from "../src/audio.js";
import { loadCoreAssets, loadFrame, frameKeys } from "../src/assets.js";
import { currentFrame, drawCharFrame } from "../src/render_backend.js";
import { state } from "../src/state.js";

const $ = (sel) => document.querySelector(sel);
const els = {
  castList: $("#castList"), castSummary: $("#castSummary"),
  charName: $("#charName"), charSub: $("#charSub"),
  trackList: $("#trackList"), trackSummary: $("#trackSummary"),
  loadState: $("#loadState"), stage: $("#stage"),
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

/** Which slot a named move sits in, for the track's subtitle. */
function whereIsMove(char, moveName) {
  for (const [slot, cfg] of Object.entries(char.specials || {})) {
    if (cfg.name === moveName) return `${slot} special`;
  }
  if (char.ultimate?.name === moveName) return "ultimate";
  return null;
}

const CAST = Object.keys(CHARACTERS).filter(
  (k) => DOMAIN_CALL[k] || Object.keys(MOVE_CALL[k] || {}).length
);

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
    btn.innerHTML = `${CHARACTERS[key].name}<span class="n">${lines} line${lines === 1 ? "" : "s"}</span>`;
    btn.addEventListener("click", () => select(key));
    li.append(btn);
    els.castList.append(li);
  }
  const totalLines = CAST.reduce((n, k) => n + tracksFor(k).filter((t) => t.kind === "line").length, 0);
  els.castSummary.textContent = `${CAST.length} fighters · ${totalLines} spoken lines`;
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
  // anything if it is obvious which one the game actually uses — and because
  // the answer to "is this one better" is usually "play them again".
  const alts = VOICE_ALTERNATES[t.sfx] || [];
  if (!alts.length) return [row];
  const out = [row];
  row.classList.add("has-alts");
  for (const alt of alts) {
    const files = [alt.file].flat();
    const arow = document.createElement("div");
    arow.className = "track alt";
    const abtn = document.createElement("button");
    abtn.type = "button";
    abtn.textContent = "▶";
    abtn.title = `Play the alternate take of ${t.sfx}`;
    // Mixed through the entry the alternate would REPLACE — same category, same
    // gain — so what is being compared is the take and nothing else.
    abtn.addEventListener("click", () =>
      playEntry({ file: alt.file, category: entry.category, gain: entry.gain }, arow));
    const abody = document.createElement("div");
    const ameta = [alt.note];
    ameta.push(files.length > 1 ? `${files.length} files` : `<code>${files[0]}</code>`);
    abody.innerHTML = `<div class="label">Alternate <span class="tag">not in game</span></div>`
      + `<div class="meta">${ameta.join(" · ")}</div>`;
    arow.append(abtn, abody);
    out.push(arow);
  }
  return out;
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
  els.charSub.textContent = char.epithet || "";
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
