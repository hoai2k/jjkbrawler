// Sprite Workbench — live editor for per-frame renderScale, horizontal offset
// and ground-contact height.
//
// Everything is drawn through the GAME'S OWN modules (assets.js, sprites.js,
// characters.js, render.js), and adjustments mutate the very manifest objects
// the renderer reads. So the preview can never drift from what the game shows,
// and any fix applied elsewhere in the pipeline appears here immediately.

import { loadAllAssets, frameImage, spriteManifest } from "../src/assets.js";
import {
  drawCharFrame, anchorLocal, anchorsForFrame, statesUsingFrame, isAirborneOnly,
  anchorScreenPos, screenPosToLocal, warmAnchors, EXTRA_ANCHORS,
} from "../src/sprites.js";
import { drawPlatformShape } from "../src/render.js";
import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";
import { headHeightTarget, applyHeightScale, hasHeightOverride, heightRatio } from "../src/heights.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");

const GROUND_Y = 470;
// The platform the stage draws, and how far onto it the size benchmark stands.
const PLATFORM_W = 680;
const PLATFORM_X = 380 - PLATFORM_W / 2;
const BENCHMARK_INSET = 78;
const CELL_W = 313.5;
// Scalar fields the workbench can edit. `anchors` is edited too but is nested,
// so snapshot/restore/compare handle it separately.
const EDITABLE = ["renderScale", "ox", "bodyBottom", "faceLeft", "needsReplacement"];
// Fields that are true/false rather than a number, so comparison and export
// treat them differently (and `false` is a meaningful value, not "unset").
const BOOLEAN_FIELDS = new Set(["faceLeft", "needsReplacement"]);

// What the pose list shows. "Unedited" is the working view: the poses the game
// draws that nobody has adjusted yet, so a pass through a character does not
// keep re-presenting work already done.
const VIEWS = {
  unedited: { label: "Unedited only", keep: (c, k) => isUsed(c, k) && !hasSavedEdits(c, k) },
  edited: { label: "Edited only", keep: (c, k) => hasSavedEdits(c, k) },
  used: { label: "Used in game", keep: (c, k) => isUsed(c, k) },
  all: { label: "All sprites", keep: () => true },
};
const HANDLE_R = 7;

const BACKGROUNDS = [
  ["#12151f", "dark"], ["#5c6478", "grey"], ["#f2f4f8", "white"],
  ["#0f7a3d", "green"], ["#ff00ff", "magenta"], ["#7a3d0f", "brown"],
];

const state = {
  char: "gojo", frame: null, bg: BACKGROUNDS[0][0], zoom: 1.9,
  originals: {}, originalHeads: {}, originalHeadOverride: {}, undo: [], redo: [],
  // Which anchor the arrow keys act on — set by whatever you last moved, not by
  // a separate selection step. Every SHOWN anchor is draggable regardless.
  anchor: null,
  anchorShown: {},     // name -> false to hide; anchors are shown by default
  dragging: false,
  view: "unedited",    // key into VIEWS
};

// ---------------------------------------------------------------- helpers

function statesUsing(charKey, frameKey) {
  return statesUsingFrame(charKey, frameKey);
}

function allFramesOf(charKey) {
  return Object.keys(spriteManifest?.characters?.[charKey] || {}).sort();
}

/** Poses the pose list offers, filtered by the current view. May be empty —
 *  "Edited only" on an untouched character legitimately matches nothing, and
 *  quietly widening the filter would be a lie about what you are looking at.
 *  The selected pose stays on the canvas either way. */
function framesOf(charKey) {
  const view = VIEWS[state.view] || VIEWS.unedited;
  return allFramesOf(charKey).filter((k) => view.keep(charKey, k));
}

/** The RAW manifest object the renderer reads. `frameMeta` may hand back a
 *  copy, so all mutation must go through this or edits would be discarded. */
function rawMeta(charKey, frameKey) {
  return spriteManifest?.characters?.[charKey]?.[frameKey] || null;
}

// Head height is the character's GLOBAL size: every frame is drawn at a scale
// solved from it (src/heights.js), so moving this resizes the whole sprite set
// at once rather than just shifting a guide line. Unset, it resolves from the
// fighter's canon height in characters.js; setting it here writes an override.
function headHeight(charKey) {
  return headHeightTarget(charKey);
}

function setHeadHeight(charKey, value) {
  (spriteManifest.headHeights ??= {})[charKey] = Math.max(20, value);
  applyHeightScale(charKey);   // rescale every frame of this character now
}

function clearHeadHeight(charKey) {
  if (spriteManifest.headHeights) delete spriteManifest.headHeights[charKey];
  applyHeightScale(charKey);
}

function rememberHead(charKey) {
  state.originalHeads[charKey] ??= headHeight(charKey);
  if (!(charKey in state.originalHeadOverride)) {
    state.originalHeadOverride[charKey] = spriteManifest?.headHeights?.[charKey];
  }
}

function snapshot(charKey, frameKey) {
  const meta = rawMeta(charKey, frameKey);
  const out = {};
  for (const f of EDITABLE) out[f] = meta[f];
  // deep so an undo entry can't alias the live anchors object
  out.anchors = meta.anchors ? JSON.parse(JSON.stringify(meta.anchors)) : null;
  return out;
}

function restore(charKey, frameKey, snap) {
  const meta = rawMeta(charKey, frameKey);
  for (const f of EDITABLE) meta[f] = snap[f];
  if (snap.anchors) meta.anchors = JSON.parse(JSON.stringify(snap.anchors));
  else delete meta.anchors;
}

// ------------------------------------------------------------------ anchors
//
// Anchors are stored in the SOURCE IMAGE's own pixels, so they ride along with
// every later size / horizontal / ground-contact tweak: a point put on a
// character's navel stays on the navel however the frame is nudged afterwards.
// See src/sprites.js for the full contract.

const ANCHOR_META = {
  com: {
    label: "Centre of mass",
    hint: "The pivot every rotation turns about — tumbles, rolls, leans and " +
          "the idle sway. Defaults to the detected centroid at navel height.",
  },
  ...EXTRA_ANCHORS,
};

/** Anchors offered for the current frame: `com` always, plus any state-specific
 *  one the frame's animations call for. */
function anchorNames(charKey, frameKey) {
  return ["com", ...anchorsForFrame(charKey, frameKey)];
}

/** Current value in image-local px, resolved from the default when unset. */
function anchorValue(charKey, frameKey, name) {
  const v = anchorLocal(charKey, frameKey, name);
  if (v) return v;
  // An extra anchor with nothing stored starts life at the centre of mass,
  // which is a far better first guess than the image's corner.
  return anchorLocal(charKey, frameKey, "com") || [0, 0];
}

function setAnchor(charKey, frameKey, name, x, y) {
  const meta = rawMeta(charKey, frameKey);
  (meta.anchors ??= {})[name] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

/** Anchors are visible unless explicitly switched off. */
function isAnchorShown(name) {
  return state.anchorShown[name] !== false;
}

function anchorsDirty(charKey, frameKey) {
  const orig = state.originals[charKey]?.[frameKey];
  if (!orig) return false;
  const now = rawMeta(charKey, frameKey).anchors || null;
  return JSON.stringify(now) !== JSON.stringify(orig.anchors || null);
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
  return EDITABLE.some((f) => (BOOLEAN_FIELDS.has(f)
      ? !!meta[f] !== !!orig[f]
      : Math.abs((meta[f] ?? 0) - (orig[f] ?? 0)) > 1e-4))
    || anchorsDirty(charKey, frameKey);
}

/** Adjustments already committed to the codebase, as opposed to the unsaved
 *  ones this session marks with a dot. `edited` is written by
 *  apply_sprite_adjustments.py; a replacement request counts too, since that
 *  pose has been dealt with either way. */
function hasSavedEdits(charKey, frameKey) {
  const meta = rawMeta(charKey, frameKey);
  if (!meta) return false;
  return Object.keys(meta.edited || {}).length > 0 || !!meta.needsReplacement;
}

function isUsed(charKey, frameKey) {
  return statesUsingFrame(charKey, frameKey).length > 0;
}

function needsReplacement(charKey, frameKey) {
  return !!rawMeta(charKey, frameKey)?.needsReplacement;
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

/** Restoring a height means going back to the canon-derived value, which is
 *  "no override" — not writing the number back as an explicit one. */
function restoreHeadHeight(charKey) {
  if (state.originalHeadOverride[charKey] === undefined) clearHeadHeight(charKey);
  else setHeadHeight(charKey, state.originalHeadOverride[charKey]);
}

// ---- canvas <-> image-local mapping, mirroring drawCharFrame's placement so
// a handle sits exactly where the renderer would put that point.

function viewOpts(charKey, name) {
  return { scale: CHARACTERS[charKey].scale * state.zoom, facing: 1, name };
}

function localToCanvas(charKey, frameKey, name) {
  return anchorScreenPos(charKey, frameKey, canvas.width / 2, GROUND_Y, viewOpts(charKey, name));
}

function canvasToLocal(charKey, frameKey, px, py) {
  return screenPosToLocal(charKey, frameKey, px, py, canvas.width / 2, GROUND_Y, viewOpts(charKey));
}

/** Pointer event -> canvas pixels. The canvas is laid out responsively, so its
 *  backing store and its CSS box are different sizes. */
function eventToCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

function drawAnchorHandle(name, active) {
  const p = localToCanvas(state.char, state.frame, name);
  if (!p) return;
  const colour = name === "com" ? "rgba(120, 235, 190, 1)" : "rgba(255, 196, 92, 1)";
  ctx.save();
  // Every shown handle is equally draggable, so none of them should look
  // disabled; `active` only marks the one the arrow keys will move.
  ctx.globalAlpha = active ? 1 : 0.82;
  ctx.strokeStyle = colour;
  ctx.lineWidth = active ? 2 : 1.5;
  // crosshair + ring reads clearly over busy art in either background
  ctx.beginPath();
  ctx.moveTo(p.x - HANDLE_R * 2, p.y); ctx.lineTo(p.x - 3, p.y);
  ctx.moveTo(p.x + 3, p.y); ctx.lineTo(p.x + HANDLE_R * 2, p.y);
  ctx.moveTo(p.x, p.y - HANDLE_R * 2); ctx.lineTo(p.x, p.y - 3);
  ctx.moveTo(p.x, p.y + 3); ctx.lineTo(p.x, p.y + HANDLE_R * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
  ctx.stroke();
  if (active) {
    ctx.fillStyle = colour;
    ctx.globalAlpha = 0.22;
    ctx.fill();
  }
  // label every visible handle, so two anchors on one pose are told apart
  ctx.globalAlpha = active ? 1 : 0.7;
  ctx.fillStyle = colour;
  ctx.font = "600 11px Inter, sans-serif";
  ctx.fillText(ANCHOR_META[name]?.label ?? name, p.x + HANDLE_R * 2 + 4, p.y - 6);
  ctx.restore();
}

function drawGhost(charKey, frameKey, alpha, x = canvas.width / 2) {
  if (!rawMeta(charKey, frameKey) || !frameImage(charKey, frameKey)) return;
  drawCharFrame(ctx, charKey, frameKey, x, GROUND_Y, {
    scale: CHARACTERS[charKey].scale * state.zoom, facing: 1, alpha,
  });
}

/** The size benchmark stands at the left end of the platform rather than
 *  underneath the pose. It answers a different question from the self-ghost:
 *  "is this character the right size next to the rest of the roster", which is
 *  a comparison you read side by side, not by overlaying two silhouettes. */
function drawBenchmark() {
  const key = rawMeta("gojo", "idle_a") ? "idle_a" : "r0c0";
  const x = PLATFORM_X + BENCHMARK_INSET;
  drawGhost("gojo", key, 0.85, x);
  ctx.save();
  ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Gojo idle — size benchmark", x, GROUND_Y + 60);
  ctx.restore();
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
    drawPlatformShape(ctx, { x: PLATFORM_X, y: 0, w: PLATFORM_W, h: 42, kind: "main" });
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

  // usable on Gojo himself as well — standing a pose next to his idle is
  // exactly as useful as standing it next to another character's
  if ($("refGojo").checked) drawBenchmark();
  // The self-ghost stays overlaid: within one sprite set the question is
  // whether this pose lines up with the character's own idle, and that is only
  // readable when the two occupy the same space.
  if ($("refSelf").checked) {
    const k = rawMeta(state.char, "idle_a") ? "idle_a" : "r0c0";
    if (k !== state.frame) drawGhost(state.char, k, 0.32);
  }

  if ($("spinPreview").checked) {
    drawSpinPreview(cx);
  } else {
    drawCharFrame(ctx, state.char, state.frame, cx, GROUND_Y, {
      scale: CHARACTERS[state.char].scale * state.zoom, facing: 1,
    });
  }

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

  // Every anchor the frame carries that has not been switched off. Drawn last
  // so handles are never buried under the art.
  for (const name of anchorNames(state.char, state.frame)) {
    if (isAnchorShown(name)) drawAnchorHandle(name, name === state.anchor);
  }
}

/** Spin the pose about its centre of mass, so a badly-placed anchor is obvious
 *  — an off-centre pivot makes the body orbit instead of turn. */
function drawSpinPreview(cx) {
  const t = performance.now() / 1000;
  drawCharFrame(ctx, state.char, state.frame, cx, GROUND_Y, {
    scale: CHARACTERS[state.char].scale * state.zoom,
    facing: 1,
    rotation: t * 1.6,
  });
}

// -------------------------------------------------------------- ui wiring

function refreshTag() {
  const meta = rawMeta(state.char, state.frame);
  const states = statesUsing(state.char, state.frame);
  // `meta.faceLeft` is authoritative once assets are loaded — nativeLeft only
  // seeds it, so consulting the list here would keep saying "mirrored" after
  // the Mirror control turned it off.
  const left = !!meta?.faceLeft;
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
  const airborne = isAirborneOnly(state.char, state.frame);
  const dg = (orig.bodyBottom ?? 0) - (meta.bodyBottom ?? 0);
  $("groundRange").value = dg.toFixed(1);
  $("groundVal").textContent = airborne ? "n/a — never touches the floor"
                                        : `${dg > 0 ? "+" : ""}${dg.toFixed(1)} px`;
  $("groundGroup").classList.toggle("disabled", airborne);
  $("groundRange").disabled = airborne;
  $("groundNote").hidden = !airborne;
  document.querySelectorAll("[data-ground]").forEach((b) => (b.disabled = airborne));

  const flagged = !!meta.needsReplacement;
  $("replaceBox").checked = flagged;
  $("replaceVal").textContent = flagged ? "flagged for redraw" : "";

  const mirrored = !!meta.faceLeft;
  $("mirrorBox").checked = mirrored;
  $("mirrorVal").textContent = mirrored
    ? "flipped — art is drawn facing left"
    : "as delivered — art is drawn facing right";

  refreshAnchorControls();

  // counted across every character touched this session, since that is what
  // Export now emits
  let poses = 0, heads = 0, chars = 0;
  for (const c of Object.keys(state.originals)) {
    const n = dirtyFrames(c).length;
    const headChanged = Math.abs(headHeight(c) - (state.originalHeads[c] ?? headHeight(c))) > 1e-4;
    if (n || headChanged) chars++;
    poses += n;
    if (headChanged) heads++;
  }
  $("dirtyCount").textContent = poses || heads
    ? `${poses} pose${poses === 1 ? "" : "s"}`
      + (heads ? ` + ${heads} head height${heads === 1 ? "" : "s"}` : "")
      + (chars > 1 ? ` across ${chars} characters` : "")
    : "none";
  refreshHistoryButtons();
}

/** One row per anchor the frame carries: a visibility toggle, the current
 *  value, nudges and a reset. Every shown anchor is draggable on the canvas, so
 *  there is nothing to "select" first — `state.anchor` only records which one
 *  the arrow keys act on, and follows whatever you last moved. */
function refreshAnchorControls() {
  const names = anchorNames(state.char, state.frame);
  if (!names.includes(state.anchor)) state.anchor = null;

  const wrap = $("anchorRows");
  wrap.innerHTML = "";
  for (const name of names) {
    const meta = ANCHOR_META[name] ?? {};
    const [x, y] = anchorValue(state.char, state.frame, name);
    const stored = !!rawMeta(state.char, state.frame).anchors?.[name];
    const changed = anchorChanged(state.char, state.frame, name);

    const row = document.createElement("div");
    row.className = "anchor-row" + (name === state.anchor ? " active" : "");

    const head = document.createElement("div");
    head.className = "anchor-head";
    const toggle = document.createElement("label");
    toggle.className = "chip";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = isAnchorShown(name);
    box.onchange = () => { state.anchorShown[name] = box.checked; render(); };
    toggle.append(box, document.createTextNode(` Show ${meta.label ?? name}`));
    const val = document.createElement("span");
    val.className = "anchor-val";
    val.textContent = `${x.toFixed(1)}, ${y.toFixed(1)}`
      + (changed ? " (edited)" : stored ? "" : " (derived)");
    head.append(toggle, val);

    const mkNudge = (steps) => {
      const bar = document.createElement("div");
      bar.className = "nudge";
      for (const [label, dx, dy] of steps) {
        const b = document.createElement("button");
        b.textContent = label;
        b.onclick = () => nudgeAnchor(name, dx, dy);
        bar.appendChild(b);
      }
      return bar;
    };

    const reset = document.createElement("button");
    reset.className = "ghost sm";
    reset.textContent = "Reset";
    reset.disabled = !changed;
    reset.onclick = () => resetAnchor(name);

    row.append(head,
      mkNudge([["\u21905", -5, 0], ["\u21901", -1, 0], ["1\u2192", 1, 0], ["5\u2192", 5, 0]]),
      mkNudge([["\u21915", 0, -5], ["\u21911", 0, -1], ["\u21931", 0, 1], ["\u21935", 0, 5]]),
      reset);
    wrap.appendChild(row);
  }

  $("anchorHint").textContent = names.length
    ? (state.anchor ? ANCHOR_META[state.anchor]?.hint ?? "" : "")
      || "Drag a handle on the sprite, or nudge it here. Anchors are stored " +
         "against the artwork, so later size, position and ground tweaks carry " +
         "them along."
    : "This pose carries no anchors.";
}

/** Character-level, so it must update even when no pose is selected. */
function refreshHeadControl() {
  rememberHead(state.char);
  const hh = headHeight(state.char);
  const changed = Math.abs(hh - state.originalHeads[state.char]) > 1e-4;
  const cm = CHARACTERS[state.char]?.heightCm;
  $("headRange").value = hh.toFixed(1);
  const source = hasHeightOverride(state.char)
    ? (changed ? "hand-set, changed" : "hand-set")
    : cm ? `from ${cm} cm` : "no published height — reference default";
  $("headVal").textContent =
    `${hh.toFixed(1)} px · ${(heightRatio(state.char)).toFixed(3)}x · ${source}`;
  $("resetHead").disabled = !changed && !hasHeightOverride(state.char);
}

function buildPoseList() {
  const list = $("poseList");
  list.innerHTML = "";
  const frames = framesOf(state.char);
  const hidden = allFramesOf(state.char).length - frames.length;
  const flagged = frames.filter((k) => needsReplacement(state.char, k)).length;
  $("poseCount").textContent = `${frames.length} shown`
    + (hidden > 0 ? ` · ${hidden} hidden` : "")
    + (flagged > 0 ? ` · ${flagged} to redraw` : "");
  if (!frames.length) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "Nothing matches this view.";
    list.appendChild(empty);
  }
  for (const key of frames) {
    remember(state.char, key);
    const b = document.createElement("button");
    b.textContent = key;
    b.className = (key === state.frame ? "sel " : "")
      + (isDirty(state.char, key) ? "dirty " : "")
      + (needsReplacement(state.char, key) ? "flagged" : "");
    b.onclick = () => { state.frame = key; syncAll(); };
    list.appendChild(b);
  }
}

function syncAll() { buildPoseList(); refreshTag(); refreshControls(); render(); }

function setChar(charKey) {
  state.char = charKey;
  $("charSel").value = charKey;   // also called from ?char= and undo, not just the select
  const frames = framesOf(charKey);
  const fallback = allFramesOf(charKey);
  state.frame = frames.includes("idle_a") ? "idle_a"
    : frames[0] ?? (fallback.includes("idle_a") ? "idle_a" : fallback[0]);
  frames.forEach((k) => remember(charKey, k));
  rememberHead(charKey);
  syncAll();
}

// --- edits. `commit` marks a discrete action worth an undo entry.

function applyScale(relative, commit) {
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  // Sheet cells carry no `renderScale` at all — the renderer treats a missing
  // one as 1. Reading it raw yields undefined, and `undefined * relative` is
  // NaN, which sticks: once written it poisons the slider and every later edit.
  rawMeta(state.char, state.frame).renderScale =
    Math.max(0.02, (orig.renderScale ?? 1) * relative);
  // same reason as ground contact: renderScale is part of the idle's span
  applyHeightScale(state.char);
  refreshControls(); buildPoseList(); render();
}

function applyOffset(dx, commit) {
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  rawMeta(state.char, state.frame).ox = (orig.ox ?? 0) + dx;
  refreshControls(); buildPoseList(); render();
}

function applyGround(dy, commit) {
  // A frame only ever drawn in the air has no floor contact to set; the floor
  // stays visible in the viewer purely as a size reference against the idle.
  if (isAirborneOnly(state.char, state.frame)) return;
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  // slider reads as "how far down the sprite sits", so invert onto bodyBottom
  rawMeta(state.char, state.frame).bodyBottom = (orig.bodyBottom ?? 0) - dy;
  // The character's scale is solved so the idle's TOP meets the height target,
  // and the foot line is part of that span — so moving the idle's ground
  // contact has to re-solve, or the head would drift off the bar.
  applyHeightScale(state.char);
  refreshControls(); buildPoseList(); render();
}

/** Flag this pose's ART as wrong and needing to be redrawn. It rides along
 *  with the placement values through export and apply_sprite_adjustments.py;
 *  tools/list_replacements.py collects the flagged poses for the asset request
 *  list, and intake clears the flag when the new art lands. */
function applyNeedsReplacement(on) {
  pushHistory(state.char, state.frame);
  const meta = rawMeta(state.char, state.frame);
  if (on) meta.needsReplacement = true;
  else delete meta.needsReplacement;
  refreshControls(); buildPoseList(); refreshTag(); render();
}

/** Mirror this frame. The sheets are drawn facing right; a frame the artist
 *  drew facing left is flipped so the fighter always looks where they are
 *  going. `nativeLeft` in the manifest seeded these, but it guesses — this is
 *  the per-frame override, and it exports with everything else. */
function applyMirror(on) {
  pushHistory(state.char, state.frame);
  rawMeta(state.char, state.frame).faceLeft = on;
  refreshControls(); buildPoseList(); refreshTag(); render();
}

function applyAnchor(name, x, y, commit) {
  if (commit) pushHistory(state.char, state.frame);
  setAnchor(state.char, state.frame, name, x, y);
  refreshControls(); buildPoseList(); render();
}

function nudgeAnchor(name, dx, dy) {
  if (!name) return;
  state.anchor = name;   // arrow keys follow whatever you last moved
  const [x, y] = anchorValue(state.char, state.frame, name);
  applyAnchor(name, x + dx, y + dy, true);
}

/** Back to what shipped — the measured value from tools/bake_anchors.py, or,
 *  for a frame the bake never reached, back to the derived fallback. Deleting
 *  outright would throw away the measurement in favour of the guess. */
function resetAnchor(name) {
  const orig = state.originals[state.char][state.frame].anchors;
  const meta = rawMeta(state.char, state.frame);
  if (!anchorChanged(state.char, state.frame, name)) return;
  pushHistory(state.char, state.frame);
  if (orig && name in orig) {
    (meta.anchors ??= {})[name] = [...orig[name]];
  } else if (meta.anchors) {
    delete meta.anchors[name];
    if (!Object.keys(meta.anchors).length) delete meta.anchors;
  }
  refreshControls(); buildPoseList(); render();
}

function anchorChanged(charKey, frameKey, name) {
  const orig = state.originals[charKey]?.[frameKey]?.anchors?.[name] || null;
  const now = rawMeta(charKey, frameKey).anchors?.[name] || null;
  return JSON.stringify(orig) !== JSON.stringify(now);
}

function applyHead(value, commit) {
  if (commit) pushHeadHistory(state.char);
  setHeadHeight(state.char, value);
  refreshControls(); render();
}

/** One character's edits, or null if it has none. */
function payloadFor(charKey) {
  const out = {};
  for (const key of dirtyFrames(charKey)) {
    const meta = rawMeta(charKey, key);
    const orig = state.originals[charKey][key];
    const entry = {};
    for (const f of EDITABLE) {
      const value = meta[f];
      if (BOOLEAN_FIELDS.has(f)) {
        // `false` is meaningful, not "unset": it turns OFF a mirror that
        // `nativeLeft` would otherwise re-apply, or clears a redraw request
        if (!!value !== !!orig[f]) entry[f] = !!value;
        continue;
      }
      if (!Number.isFinite(value)) continue;
      if (Math.abs(value - (orig[f] ?? 0)) > 1e-4) {
        entry[f] = f === "renderScale" ? Number(value.toFixed(4)) : Number(value.toFixed(1));
      }
    }
    if (anchorsDirty(charKey, key) && meta.anchors) entry.anchors = meta.anchors;
    if (Object.keys(entry).length) out[key] = entry;
  }
  const payload = { character: charKey };
  const hh = headHeight(charKey);
  if (Math.abs(hh - (state.originalHeads[charKey] ?? hh)) > 1e-4) {
    payload.headHeight = Number(hh.toFixed(1));
  }
  if (Object.keys(out).length) payload.adjustments = out;
  return (payload.headHeight !== undefined || payload.adjustments) ? payload : null;
}

/** Everything edited this session, across every character.
 *
 *  A session usually walks the whole roster, so exporting only the character
 *  on screen loses the rest the moment you switch. `apply_sprite_adjustments.py`
 *  already accepts an array, so a multi-character export needs nothing new on
 *  the other end. A lone character still exports as a bare object. */
function exportAll() {
  const payloads = Object.keys(state.originals)
    .sort()
    .map(payloadFor)
    .filter(Boolean);
  $("exportOut").value = payloads.length
    ? JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2)
    : "// no changes yet";
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
    restoreHeadHeight(state.char);
    refreshControls(); buildPoseList(); render();
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

  // ---- on-canvas anchor editing. Grabbing near a handle selects it, so an
  // anchor can be picked up directly instead of via the panel first.
  canvas.addEventListener("pointerdown", (e) => {
    if (!state.frame) return;
    const p = eventToCanvas(e);
    let name = null, bestD = Infinity;
    for (const n of anchorNames(state.char, state.frame)) {
      if (!isAnchorShown(n)) continue;
      const h = localToCanvas(state.char, state.frame, n);
      if (!h) continue;
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < bestD) { bestD = d; name = n; }
    }
    // a click that is not on a handle is just a click — nothing moves
    if (!name || bestD > HANDLE_R * 2.6) return;
    if (state.anchor !== name) { state.anchor = name; refreshAnchorControls(); }
    state.dragging = true;
    canvas.setPointerCapture(e.pointerId);
    const [lx, ly] = canvasToLocal(state.char, state.frame, p.x, p.y);
    applyAnchor(name, lx, ly, true);
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!state.dragging || !state.anchor) return;
    const p = eventToCanvas(e);
    const [lx, ly] = canvasToLocal(state.char, state.frame, p.x, p.y);
    applyAnchor(state.anchor, lx, ly, false);
  });
  const endDrag = (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  const viewSel = $("viewSel");
  for (const [key, cfg] of Object.entries(VIEWS)) {
    const o = document.createElement("option");
    o.value = key; o.textContent = cfg.label;
    viewSel.appendChild(o);
  }
  viewSel.value = state.view;
  viewSel.onchange = () => {
    state.view = viewSel.value;
    // move to a visible pose when the filter hides the current one, but keep it
    // selected when the filter matches nothing at all — better a stale canvas
    // than a blank one
    const visible = framesOf(state.char);
    if (visible.length && !visible.includes(state.frame)) state.frame = visible[0];
    syncAll();
  };

  $("mirrorBox").onchange = (e) => applyMirror(e.target.checked);
  $("replaceBox").onchange = (e) => applyNeedsReplacement(e.target.checked);

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
      restoreHeadHeight(state.char);
    }
    for (const key of dirtyFrames(state.char)) {
      pushHistory(state.char, key);
      restore(state.char, key, state.originals[state.char][key]);
    }
    syncAll();
  };

  $("exportBtn").onclick = exportAll;
  $("copyBtn").onclick = async () => {
    if (!$("exportOut").value) exportAll();
    try { await navigator.clipboard.writeText($("exportOut").value); $("copyBtn").textContent = "Copied"; }
    catch { $("exportOut").select(); }
    setTimeout(() => ($("copyBtn").textContent = "Copy to clipboard"), 1200);
  };
  ["refSelf", "refGojo", "showGuides", "showBox", "showPlatform"]
    .forEach((id) => ($(id).onchange = render));
  // the spin preview animates, so it needs a frame loop rather than one redraw
  $("spinPreview").onchange = render;
  (function spinLoop() {
    if ($("spinPreview").checked) render();
    requestAnimationFrame(spinLoop);
  })();

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
    if (state.anchor && isAnchorShown(state.anchor)) {
      if (e.key === "ArrowLeft") { nudgeAnchor(state.anchor, -step, 0); e.preventDefault(); return; }
      if (e.key === "ArrowRight") { nudgeAnchor(state.anchor, step, 0); e.preventDefault(); return; }
      if (e.key === "ArrowUp") { nudgeAnchor(state.anchor, 0, -step); e.preventDefault(); return; }
      if (e.key === "ArrowDown") { nudgeAnchor(state.anchor, 0, step); e.preventDefault(); return; }
    }
    if (e.key === "ArrowLeft") { applyOffset(parseFloat($("offsetRange").value) - step, true); e.preventDefault(); }
    if (e.key === "ArrowRight") { applyOffset(parseFloat($("offsetRange").value) + step, true); e.preventDefault(); }
    if (e.key === "ArrowUp") { state.frame = frames[(i - 1 + frames.length) % frames.length]; syncAll(); e.preventDefault(); }
    if (e.key === "ArrowDown") { state.frame = frames[(i + 1) % frames.length]; syncAll(); e.preventDefault(); }
  });

  await loadAllAssets();
  warmAnchors(CHARACTER_KEYS);
  $("loadState").textContent = "assets loaded";
  $("loadState").classList.add("done");

  const params = new URLSearchParams(location.search);
  setChar(CHARACTER_KEYS.includes(params.get("char")) ? params.get("char") : "gojo");

  // `?frame=` lets the action workbench hand off a specific pose to edit.
  const frame = params.get("frame");
  if (frame && framesOf(state.char).includes(frame)) {
    state.frame = frame;
    syncAll();
    const btn = $("poseList").querySelector("button.sel");
    if (btn) $("poseList").scrollTop = Math.max(0, btn.offsetTop - $("poseList").clientHeight / 2);
  }
  refreshHistoryButtons();
}

boot();
