// Sprite Workbench — live editor for per-frame renderScale, horizontal offset
// and ground-contact height.
//
// Everything is drawn through the GAME'S OWN modules (assets.js, sprites.js,
// characters.js, render.js), and adjustments mutate the very manifest objects
// the renderer reads. So the preview can never drift from what the game shows,
// and any fix applied elsewhere in the pipeline appears here immediately.

import { loadAssets, frameImage, spriteManifest } from "../src/assets.js";
import { drawCharFrame } from "../src/sprites.js";
import { drawPlatformShape } from "../src/render.js";
import { CHARACTERS, CHARACTER_KEYS, DEFAULT_ANIMS } from "../src/characters.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");

const GROUND_Y = 470;
const CELL_W = 313.5;
// Fields the workbench can edit; also the shape of an undo entry.
const EDITABLE = ["renderScale", "ox", "bodyBottom"];

const BACKGROUNDS = [
  ["#12151f", "dark"], ["#5c6478", "grey"], ["#f2f4f8", "white"],
  ["#0f7a3d", "green"], ["#ff00ff", "magenta"], ["#7a3d0f", "brown"],
];

const state = {
  char: "gojo", frame: null, bg: BACKGROUNDS[0][0], zoom: 1.9,
  originals: {}, originalHeads: {}, undo: [], redo: [],
};

// ---------------------------------------------------------------- helpers

function statesUsing(charKey, frameKey) {
  const anims = { ...DEFAULT_ANIMS, ...(CHARACTERS[charKey].anims || {}) };
  return Object.entries(anims).filter(([, a]) => a.frames.includes(frameKey)).map(([n]) => n);
}

function framesOf(charKey) {
  return Object.keys(spriteManifest?.characters?.[charKey] || {}).sort();
}

/** The RAW manifest object the renderer reads. `frameMeta` may hand back a
 *  copy, so all mutation must go through this or edits would be discarded. */
function rawMeta(charKey, frameKey) {
  return spriteManifest?.characters?.[charKey]?.[frameKey] || null;
}

function headHeight(charKey) {
  return spriteManifest?.headHeights?.[charKey] ?? 0;
}

function setHeadHeight(charKey, value) {
  (spriteManifest.headHeights ??= {})[charKey] = Math.max(20, value);
}

function rememberHead(charKey) {
  state.originalHeads[charKey] ??= headHeight(charKey);
}

function snapshot(charKey, frameKey) {
  const meta = rawMeta(charKey, frameKey);
  const out = {};
  for (const f of EDITABLE) out[f] = meta[f];
  return out;
}

function restore(charKey, frameKey, snap) {
  const meta = rawMeta(charKey, frameKey);
  for (const f of EDITABLE) meta[f] = snap[f];
}

function remember(charKey, frameKey) {
  if (!rawMeta(charKey, frameKey)) return;
  state.originals[charKey] ??= {};
  state.originals[charKey][frameKey] ??= snapshot(charKey, frameKey);
}

function isDirty(charKey, frameKey) {
  const orig = state.originals[charKey]?.[frameKey];
  if (!orig) return false;
  const meta = rawMeta(charKey, frameKey);
  return EDITABLE.some((f) => Math.abs((meta[f] ?? 0) - (orig[f] ?? 0)) > 1e-4);
}

function dirtyFrames(charKey) {
  return framesOf(charKey).filter((k) => isDirty(charKey, k));
}

// ------------------------------------------------------------ undo / redo

/** Record a frame's state BEFORE a change. One call per discrete edit. */
function pushHeadHistory(charKey) {
  state.undo.push({ kind: "head", char: charKey, before: headHeight(charKey) });
  if (state.undo.length > 200) state.undo.shift();
  state.redo.length = 0;
  refreshHistoryButtons();
}

function pushHistory(charKey, frameKey) {
  state.undo.push({ char: charKey, frame: frameKey, before: snapshot(charKey, frameKey) });
  if (state.undo.length > 200) state.undo.shift();
  state.redo.length = 0;      // a new edit invalidates the redo branch
  refreshHistoryButtons();
}

function undo() {
  const entry = state.undo.pop();
  if (!entry) return;
  if (entry.kind === "head") {
    state.redo.push({ ...entry, after: headHeight(entry.char) });
    setHeadHeight(entry.char, entry.before);
  } else {
    state.redo.push({ ...entry, after: snapshot(entry.char, entry.frame) });
    restore(entry.char, entry.frame, entry.before);
  }
  state.char = entry.char;
  if (entry.frame) state.frame = entry.frame;
  $("charSel").value = entry.char;
  syncAll();
}

function redo() {
  const entry = state.redo.pop();
  if (!entry) return;
  if (entry.kind === "head") {
    state.undo.push({ ...entry, before: headHeight(entry.char) });
    setHeadHeight(entry.char, entry.after);
  } else {
    state.undo.push({ char: entry.char, frame: entry.frame, before: snapshot(entry.char, entry.frame) });
    restore(entry.char, entry.frame, entry.after);
  }
  state.char = entry.char;
  if (entry.frame) state.frame = entry.frame;
  $("charSel").value = entry.char;
  syncAll();
}

function refreshHistoryButtons() {
  $("undoBtn").disabled = state.undo.length === 0;
  $("redoBtn").disabled = state.redo.length === 0;
}

// ------------------------------------------------------------------- draw

function spriteScale(charKey, meta) {
  return CHARACTERS[charKey].scale * state.zoom * (meta.renderScale ?? 1);
}

function drawGhost(charKey, frameKey, alpha) {
  if (!rawMeta(charKey, frameKey) || !frameImage(charKey, frameKey)) return;
  drawCharFrame(ctx, charKey, frameKey, canvas.width / 2, GROUND_Y, {
    scale: CHARACTERS[charKey].scale * state.zoom, facing: 1, alpha,
  });
}

function render() {
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.frame) return;
  const cx = canvas.width / 2;

  // A real game platform, drawn by the game's own routine, so feet can be
  // aligned against the surface players actually stand on.
  if ($("showPlatform").checked) {
    ctx.save();
    ctx.translate(0, GROUND_Y);
    drawPlatformShape(ctx, { x: cx - 340, y: 0, w: 680, h: 42, kind: "main" });
    ctx.restore();
  }

  if ($("showGuides").checked) {
    ctx.strokeStyle = "rgba(110, 220, 150, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y); ctx.stroke();
    ctx.strokeStyle = "rgba(120, 170, 255, 0.5)";
    ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height); ctx.stroke();
    ctx.setLineDash([]);

    // The head-height bar is a per-character TARGET, independent of any
    // sprite, so an idle can be scaled to meet it instead of dragging it along.
    const hh = headHeight(state.char);
    if (hh) {
      const headY = GROUND_Y - hh * state.zoom;
      ctx.strokeStyle = "rgba(200, 160, 70, 0.85)";
      ctx.beginPath(); ctx.moveTo(0, headY); ctx.lineTo(canvas.width, headY); ctx.stroke();
      ctx.fillStyle = "rgba(200, 160, 70, 0.95)";
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText(`head height target (${hh.toFixed(1)})`, 8, headY - 5);
    }
  }

  // usable on Gojo himself as well — comparing a pose against his own idle
  // benchmark is exactly as useful as comparing another character's
  if ($("refGojo").checked) {
    drawGhost("gojo", rawMeta("gojo", "idle_a") ? "idle_a" : "r0c0", 0.3);
  }
  if ($("refSelf").checked) {
    const k = rawMeta(state.char, "idle_a") ? "idle_a" : "r0c0";
    if (k !== state.frame) drawGhost(state.char, k, 0.32);
  }

  drawCharFrame(ctx, state.char, state.frame, cx, GROUND_Y, {
    scale: CHARACTERS[state.char].scale * state.zoom, facing: 1,
  });

  if ($("showBox").checked) {
    const meta = rawMeta(state.char, state.frame);
    const s = spriteScale(state.char, meta);
    ctx.strokeStyle = "rgba(255, 120, 160, 0.8)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx + (meta.ox - CELL_W / 2) * s,
                   GROUND_Y + (meta.oy - meta.bodyBottom) * s,
                   meta.w * s, meta.h * s);
    ctx.setLineDash([]);
  }
}

// -------------------------------------------------------------- ui wiring

function refreshTag() {
  const meta = rawMeta(state.char, state.frame);
  const states = statesUsing(state.char, state.frame);
  const left = meta?.faceLeft || (spriteManifest?.nativeLeft?.[state.char] || []).includes(state.frame);
  $("frameTag").innerHTML = `${state.char}/${state.frame}` +
    (states.length ? ` <span class="state">${states.join(", ")}</span>` : "") +
    (left ? ` <span class="flag">mirrored</span>` : "");
}

function refreshControls() {
  refreshHeadControl();
  const meta = rawMeta(state.char, state.frame);
  if (!meta) return;
  const orig = state.originals[state.char][state.frame];

  const rel = (meta.renderScale ?? 1) / (orig.renderScale || 1);
  $("scaleRange").value = rel.toFixed(3);
  $("scaleVal").textContent = `${(rel * 100).toFixed(1)}% of delivered`;

  const dx = (meta.ox ?? 0) - (orig.ox ?? 0);
  $("offsetRange").value = dx.toFixed(1);
  $("offsetVal").textContent = `${dx > 0 ? "+" : ""}${dx.toFixed(1)} px`;

  // positive slider = sprite sits LOWER, which reads more naturally than the
  // underlying bodyBottom (where a bigger value lifts the art)
  const dg = (orig.bodyBottom ?? 0) - (meta.bodyBottom ?? 0);
  $("groundRange").value = dg.toFixed(1);
  $("groundVal").textContent = `${dg > 0 ? "+" : ""}${dg.toFixed(1)} px`;

  const n = dirtyFrames(state.char).length;
  const headChanged =
    Math.abs(headHeight(state.char) - state.originalHeads[state.char]) > 1e-4;
  $("dirtyCount").textContent = n || headChanged
    ? `${n} pose${n === 1 ? "" : "s"}${headChanged ? " + head height" : ""} changed`
    : "none";
  refreshHistoryButtons();
}

/** Character-level, so it must update even when no pose is selected. */
function refreshHeadControl() {
  rememberHead(state.char);
  const hh = headHeight(state.char);
  const changed = Math.abs(hh - state.originalHeads[state.char]) > 1e-4;
  $("headRange").value = hh.toFixed(1);
  $("headVal").textContent = `${hh.toFixed(1)} px${changed ? " (changed)" : ""}`;
}

function buildPoseList() {
  const list = $("poseList");
  list.innerHTML = "";
  const frames = framesOf(state.char);
  $("poseCount").textContent = `${frames.length} frames`;
  for (const key of frames) {
    remember(state.char, key);
    const b = document.createElement("button");
    b.textContent = key;
    b.className = (key === state.frame ? "sel " : "") + (isDirty(state.char, key) ? "dirty" : "");
    b.onclick = () => { state.frame = key; syncAll(); };
    list.appendChild(b);
  }
}

function syncAll() { buildPoseList(); refreshTag(); refreshControls(); render(); }

function setChar(charKey) {
  state.char = charKey;
  const frames = framesOf(charKey);
  state.frame = frames.includes("idle_a") ? "idle_a" : frames[0];
  frames.forEach((k) => remember(charKey, k));
  rememberHead(charKey);
  syncAll();
}

// --- edits. `commit` marks a discrete action worth an undo entry.

function applyScale(relative, commit) {
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  rawMeta(state.char, state.frame).renderScale = Math.max(0.02, orig.renderScale * relative);
  refreshControls(); buildPoseList(); render();
}

function applyOffset(dx, commit) {
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  rawMeta(state.char, state.frame).ox = (orig.ox ?? 0) + dx;
  refreshControls(); buildPoseList(); render();
}

function applyGround(dy, commit) {
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  // slider reads as "how far down the sprite sits", so invert onto bodyBottom
  rawMeta(state.char, state.frame).bodyBottom = (orig.bodyBottom ?? 0) - dy;
  refreshControls(); buildPoseList(); render();
}

function applyHead(value, commit) {
  if (commit) pushHeadHistory(state.char);
  setHeadHeight(state.char, value);
  refreshControls(); render();
}

function exportChar() {
  const out = {};
  for (const key of dirtyFrames(state.char)) {
    const meta = rawMeta(state.char, key);
    const orig = state.originals[state.char][key];
    const entry = {};
    for (const f of EDITABLE) {
      if (Math.abs((meta[f] ?? 0) - (orig[f] ?? 0)) > 1e-4) {
        entry[f] = f === "renderScale" ? Number(meta[f].toFixed(4)) : Number(meta[f].toFixed(1));
      }
    }
    out[key] = entry;
  }
  const payload = { character: state.char };
  const hh = headHeight(state.char);
  if (Math.abs(hh - state.originalHeads[state.char]) > 1e-4) {
    payload.headHeight = Number(hh.toFixed(1));
  }
  if (Object.keys(out).length) payload.adjustments = out;
  $("exportOut").value = (payload.headHeight !== undefined || payload.adjustments)
    ? JSON.stringify(payload, null, 2)
    : `// no changes for ${state.char}`;
}

// ------------------------------------------------------------------ boot

/** Sliders fire continuously; commit one undo entry per drag, not per pixel. */
function bindSlider(id, apply) {
  const el = $(id);
  let dragging = false;
  el.addEventListener("pointerdown", () => { dragging = false; });
  el.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!dragging) { dragging = true; apply(v, true); } else apply(v, false);
  });
  el.addEventListener("change", () => { dragging = false; });
}

async function boot() {
  const charSel = $("charSel");
  for (const key of CHARACTER_KEYS) {
    const o = document.createElement("option");
    o.value = key; o.textContent = CHARACTERS[key].name;
    charSel.appendChild(o);
  }
  charSel.onchange = () => setChar(charSel.value);

  const sw = $("bgSwatches");
  BACKGROUNDS.forEach(([colour, name], i) => {
    const b = document.createElement("button");
    b.style.background = colour; b.title = name;
    if (i === 0) b.classList.add("on");
    b.onclick = () => {
      state.bg = colour;
      [...sw.children].forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
      render();
    };
    sw.appendChild(b);
  });

  $("zoomRange").oninput = (e) => {
    state.zoom = parseFloat(e.target.value);
    $("zoomVal").textContent = `${state.zoom.toFixed(2)}x`;
    render();
  };

  bindSlider("scaleRange", applyScale);
  bindSlider("offsetRange", applyOffset);
  bindSlider("groundRange", applyGround);
  bindSlider("headRange", applyHead);
  document.querySelectorAll("[data-head]").forEach((b) => {
    b.onclick = () => applyHead(headHeight(state.char) + parseFloat(b.dataset.head), true);
  });
  $("resetHead").onclick = () => {
    pushHeadHistory(state.char);
    setHeadHeight(state.char, state.originalHeads[state.char]);
    refreshControls(); render();
  };

  document.querySelectorAll("[data-scale]").forEach((b) => {
    b.onclick = () => applyScale(parseFloat($("scaleRange").value) + parseFloat(b.dataset.scale), true);
  });
  document.querySelectorAll("[data-off]").forEach((b) => {
    b.onclick = () => applyOffset(parseFloat($("offsetRange").value) + parseFloat(b.dataset.off), true);
  });
  document.querySelectorAll("[data-ground]").forEach((b) => {
    b.onclick = () => applyGround(parseFloat($("groundRange").value) + parseFloat(b.dataset.ground), true);
  });

  $("undoBtn").onclick = undo;
  $("redoBtn").onclick = redo;

  $("resetFrame").onclick = () => {
    pushHistory(state.char, state.frame);
    restore(state.char, state.frame, state.originals[state.char][state.frame]);
    syncAll();
  };
  $("resetChar").onclick = () => {
    if (Math.abs(headHeight(state.char) - state.originalHeads[state.char]) > 1e-4) {
      pushHeadHistory(state.char);
      setHeadHeight(state.char, state.originalHeads[state.char]);
    }
    for (const key of dirtyFrames(state.char)) {
      pushHistory(state.char, key);
      restore(state.char, key, state.originals[state.char][key]);
    }
    syncAll();
  };

  $("exportBtn").onclick = exportChar;
  $("copyBtn").onclick = async () => {
    if (!$("exportOut").value) exportChar();
    try { await navigator.clipboard.writeText($("exportOut").value); $("copyBtn").textContent = "Copied"; }
    catch { $("exportOut").select(); }
    setTimeout(() => ($("copyBtn").textContent = "Copy to clipboard"), 1200);
  };
  ["refSelf", "refGojo", "showGuides", "showBox", "showPlatform"]
    .forEach((id) => ($(id).onchange = render));

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    const frames = framesOf(state.char);
    const i = frames.indexOf(state.frame);
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") { applyOffset(parseFloat($("offsetRange").value) - step, true); e.preventDefault(); }
    if (e.key === "ArrowRight") { applyOffset(parseFloat($("offsetRange").value) + step, true); e.preventDefault(); }
    if (e.key === "ArrowUp") { state.frame = frames[(i - 1 + frames.length) % frames.length]; syncAll(); e.preventDefault(); }
    if (e.key === "ArrowDown") { state.frame = frames[(i + 1) % frames.length]; syncAll(); e.preventDefault(); }
  });

  await loadAssets(() => {});
  $("loadState").textContent = "assets loaded";
  $("loadState").classList.add("done");

  const params = new URLSearchParams(location.search);
  setChar(CHARACTER_KEYS.includes(params.get("char")) ? params.get("char") : "gojo");
  refreshHistoryButtons();
}

boot();
