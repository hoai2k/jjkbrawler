// Sprite Workbench — live editor for per-frame renderScale, horizontal offset
// and ground-contact height.
//
// Everything is drawn through the GAME'S OWN modules (assets.js, sprites.js,
// characters.js, render.js), and adjustments mutate the very manifest objects
// the renderer reads. So the preview can never drift from what the game shows,
// and any fix applied elsewhere in the pipeline appears here immediately.
//
// THIS FILE IS THE PAGE: the pose canvas, the panels, the wiring and the boot.
// What it is NOT is everything else the bench does — that used to be true, and
// 6,321 lines in one module is how a fix in one panel came to change another.
// The rest is layered underneath, each importing only downward
// (tools/check_bench_layers.mjs keeps it that way):
//
//   bench_state.js       the canvas, its geometry, the mutable `state`
//   bench_model.js       what a sprite IS — poses, flags, edits, spawn sites
//   bench_picker.js      the drawing grid and its tile menu
//   bench_shared_art.js  the shared-drawing viewer and everything hung off it
//   bench_export.js      the adjustment file that leaves the bench
//
// The two leaves that need something back from this page are given it at boot
// — initSpritePicker, initSharedArt — so they never import it.

import {
  loadCoreAssets, loadFrame, frameImage, spriteManifest, loadSharedImage, getImage,
  forgetSharedMirror, frameMeta, loadSpriteFile, spriteFileImage,
} from "../../src/assets.js";
import {
  drawCharFrame, statesUsingFrame, isAirborneOnly, isAnchorPlaced, animsOf, resolvedAnim,
  anchorScreenPos, screenPosToLocal, warmAnchors, REPLACEMENT_KINDS, replacementKind,
  IMPROVEMENT_KINDS, improvementKind, VARIANT_BANKED, VARIANT_ONLY_KINDS, NOTE_FIELDS,
  ALTERNATE_KIND,
} from "../src/sprites.js";
import { drawPlatformShape } from "../../src/render.js";
import { lightMove, heavyMove, visibleArtReach, strikeArcs } from "../../src/moves.js";
import { bodyMetrics, refreshSilhouettes } from "../../src/silhouette.js";
import { HURTBOX, GRAB } from "../../src/constants.js";
import { grabReachOf, holdGapOf } from "../../src/grab.js";
import { CHARACTERS } from "../../src/characters.js";
import {
  applyHeightScale, hasHeightOverride, heightRatio, heightLabel,
} from "../../src/heights.js";
import { initTooltips, setHelp } from "./tooltip.js";
import { makeCharLoader, frameLoaded } from "./lazy_sprites.js";
import { fitStageCanvas } from "./fit_stage.js";
import { makeEffectPreview, firingUse } from "./effect_preview.js";
import {
  $, canvas, ctx, GROUND_Y, PLATFORM_W, platformX, BENCHMARK_INSET, CELL_W, stateLabel,
  stateRank, OTHER_KEY, OTHER_LABEL, ACTOR_KEYS, WB_FIGHTERS, isStaged, RECENT_KEY,
  RECENT_LABEL, FLAGGED_KEY, FLAGGED_LABEL, isOther, inRecent, inFlagged, inList,
  BACKGROUNDS, state, HANDLE_R, round1,
} from "./bench_state.js";
import {
  VIEWS, primaryState, frameLabel, actorOf, sharedOwner, sharedUsage, movesDrawing,
  effectsOf, statesUsing, allFramesOf, isPending, approvalNote, awaitingApproval, isUsed,
  framesOf, updateNote,
  TODO_MARK, NO_TODO_PAD, charTodo, updatesCleared, isUpdateReviewed, recentUpdates,
  flaggedPoses, allFlagBearingPoses, updateSummary, autoTuneSummary, poseVariants,
  variantEntry, takeBanked, poseView, variantPicks, variantFlagEdits, currentOption,
  isDeleteTagged, hasDeleteTag, rawMeta, headHeight, setHeadHeight, clearHeadHeight,
  pinHeightSpan, rememberSpan, rememberHead, snapshot, restore, ANCHOR_META, anchorNames,
  anchorValue, setAnchor, isAnchorShown, remember, isDirty, drawableSharedKey, hasSavedEdits,
  needsReplacement, kindLabel, redrawPending, wantsImprovement, dirtyFrames, pushHeadHistory,
  pushHistory, refreshHistoryButtons, sharedControls, attackBoxKey, approvalSettled,
  originalAnimFrames,
} from "./bench_model.js";
import {
  openSpritePicker, closeSpritePicker, closePickerPreview, initSpritePicker,
} from "./bench_picker.js";
import {
  clearedUpdates, editedChars, payloadFor, exportAll, dirtyActions, unexportedWork,
} from "./bench_export.js";
import {
  ANCHOR_WORDS, attackBoxOf, attackBoxOnCanvas, canPlaceAttack, drawCanvasSpinner,
  drawPendingNotice, drawSharedOverlay, drawSharedSprite, drawSpinPreview, drawingHome,
  gameHeightOf, hitCentreOnCanvas, hitHandles, initSharedArt, launchPoint, launchScale,
  referenceX, setAttackBox, setSharedHit, sharedTried, sharedView, spawnHome,
} from "./bench_shared_art.js";

/** The "not a request" entry in the replacement menu — see its onchange. */
const BORROW_OPTION = "__chooseSprite";

/** Stamp the dropdown with who still has work waiting. Runs once the manifest
 *  is loaded — before it there is nothing to read. */
function markEditedChars() {
  for (const o of $("charSel")?.options || []) {
    const key = o.value;
    // The two work lists carry their own counts (refreshRecentOption), so
    // stamping a to-do marker over them would overwrite it.
    if (!o.dataset.name || isOther(key) || key === RECENT_KEY || key === FLAGGED_KEY) continue;
    const todo = charTodo(key);
    o.textContent = (todo ? TODO_MARK : NO_TODO_PAD) + o.dataset.name;
    o.title = todo || "Nothing waiting \u2014 every pose placed, every replacement approved";
  }
}

function toggleUpdateReviewed(charKey, frameKey) {
  const id = `${charKey}/${frameKey}`;
  if (updatesCleared.has(id)) updatesCleared.delete(id);
  else updatesCleared.add(id);
  // The pose belongs to a character the export has to visit, and clearing is
  // the only thing that may have happened to it.
  remember(charKey, frameKey);
  refreshRecentOption();
  refreshControls(); buildPoseList();
}

// ---------------------------------------------------------------- variants
//
// A pose can offer several drawings (sprites/src/sprites.js). Each option carries its
// OWN placement, so choosing one is not just a file swap: it restores that
// image's size, centring, ground contact and anchors, and banks the outgoing
// image's current numbers first. Otherwise tuning drawing A and then looking at
// drawing B would silently apply A's numbers to B and lose A's. The review
// flags ride along for the same reason — a "fix alpha" is a verdict on one
// drawing, and following the pose instead would pin it to whichever art is
// selected at the time.

/** Point a pose at one of its other drawings.
 *
 *  The whole swap, in one place: bank what is leaving, clear every field that
 *  belongs to a drawing, take the arriving one's, and re-fetch the image so
 *  the frame's slot holds the picture whose numbers are now in play. Anything
 *  that changes which drawing a pose uses goes through here — including an
 *  approval, which is the same swap wearing a different question. */
async function pointPoseAt(charKey, frameKey, file) {
  const entry = variantEntry(charKey, frameKey);
  const meta = rawMeta(charKey, frameKey);
  if (!entry || !meta || meta.file === file) return;
  const incoming = entry.options.find((o) => o.file === file);
  if (!incoming) return;

  // Bank what is on screen back onto the image it belongs to, including any
  // adjustment made this session, before it is replaced.
  const outgoing = entry.options.find((o) => o.file === meta.file);
  if (outgoing) Object.assign(outgoing, takeBanked(meta));

  for (const field of VARIANT_BANKED) delete meta[field];
  Object.assign(meta, poseView(incoming), { file });

  // The new art has almost certainly never been fetched — the streamer only
  // pulls the file each pose pointed at when the character loaded.
  await loadFrame(charKey, frameKey, { reload: true });
  syncAll();
}

/** Draw this pose with another of the character's sprites.
 *
 *  The point is a pose the set has no drawing for: a prone body made out of a
 *  standing one, a lean made out of an idle. The borrowed image arrives as an
 *  OPTION on this pose, carrying its own copy of the source's placement, and
 *  every number the panel then edits belongs to that option — so tipping the
 *  borrowed sprite onto its back does not tip the pose it was borrowed from.
 *  Two poses drawing one file is already how the sheet works; what is new is
 *  that they no longer have to agree about how it sits.
 *
 *  Not a replacement request: nothing has to be drawn. The pose the art came
 *  from is untouched, and the flag that opened the picker travels away with
 *  the drawing it was about, because review flags are banked per option.
 */
async function borrowDrawing(charKey, frameKey, drawing) {
  const meta = rawMeta(charKey, frameKey);
  // Whatever the tile was showing — the drawing in the game, or one of the
  // alternates banked beside it. Choosing art is a question about images, so
  // an alternate is as valid an answer as the pose's own.
  const source = drawing?.meta;
  const file = drawing?.file;
  if (!meta || !file || meta.file === file) return;
  pushHistory(charKey, frameKey);
  remember(charKey, frameKey);

  const entry = ((spriteManifest.variants ??= {})[charKey] ??= {})[frameKey]
    ??= { options: [] };
  // The drawing being left has to be an option too, or the pose could not get
  // back to the art it started with.
  if (!entry.options.some((o) => o.file === meta.file)) {
    entry.options.unshift({ ...takeBanked(meta), file: meta.file, label: "Delivered" });
  }
  if (!entry.options.some((o) => o.file === file)) {
    entry.options.push({
      ...takeBanked(source || {}),
      file,
      label: drawing.pose === frameKey ? drawing.label || "Alternate" : `From ${drawing.pose}`,
      ...(drawing.pose && drawing.pose !== frameKey ? { borrowedFrom: drawing.pose } : {}),
    });
  }
  await chooseVariant(charKey, frameKey, file);
}

async function chooseVariant(charKey, frameKey, file) {
  const meta = rawMeta(charKey, frameKey);
  if (!meta || meta.file === file) return;
  variantPicks.set(`${charKey}/${frameKey}`, file);
  await pointPoseAt(charKey, frameKey, file);
}

// ------------------------------------------------------------ undo / redo

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
  syncCharSelect();
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
  syncCharSelect();
  syncAll();
}

// ------------------------------------------------------------------- draw

function spriteScale(charKey, meta) {
  return actorOf(charKey).scale * state.zoom * (meta.renderScale ?? 1);
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
  return { scale: actorOf(charKey).scale * state.zoom, facing: 1, name };
}

// Both of these are for the pose being edited, which the canvas draws with
// `preview` — the replacement waiting for approval, not the drawing the game
// is still playing. The conversions have to agree with it, or the handle sits
// where the OLD art's placement puts it and dragging writes into a space the
// picture is not in: the anchor readout changed and the crosshair did not.
function localToCanvas(charKey, frameKey, name) {
  return anchorScreenPos(charKey, frameKey, canvas.width / 2, GROUND_Y,
                         { ...viewOpts(charKey, name), preview: true });
}

function canvasToLocal(charKey, frameKey, px, py) {
  return screenPosToLocal(charKey, frameKey, px, py, canvas.width / 2, GROUND_Y,
                          { ...viewOpts(charKey), preview: true });
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

function drawGhost(charKey, frameKey, alpha, x = canvas.width / 2, as = null, zoom = state.zoom) {
  if (!as && (!rawMeta(charKey, frameKey) || !frameImage(charKey, frameKey))) return;
  if (as && (!as.meta || !as.img)) return;
  drawCharFrame(ctx, charKey, frameKey, x, GROUND_Y, {
    scale: actorOf(charKey).scale * zoom, facing: 1, alpha,
    preview: !as, as,
  });
}

/** The OTHER drawing of this pose worth standing beside it, or null.
 *
 *  Two cases, and the first is the reason this exists. While a replacement is
 *  waiting to be approved the canvas shows the new art, so the question you
 *  actually have is "is it better than what we are shipping" — and the only way
 *  to answer that is to see them together. There the other drawing is the one
 *  still in the game, which `frameMeta`/`frameImage` already resolve without
 *  `preview`.
 *
 *  Otherwise it is the newest alternate the pose has, on the reading that the
 *  most recently delivered drawing is the one you have not decided about yet.
 *  Options are appended in arrival order, so the last is the newest.
 */
/** Which drawing the Alternate sprite view is standing beside this pose, when
 *  the automatic choice has been overridden for it. Per pose, not global: the
 *  answer to "which other one" is about this pose's drawings. */
const altPicked = new Map();

/** Every drawing this pose has OTHER than the one on the canvas — the ones the
 *  comparison can stand beside it. */
function altCandidates(charKey, frameKey) {
  const meta = rawMeta(charKey, frameKey);
  if (!meta) return [];
  const out = [];
  // The drawing in the game, while a replacement is waiting to take its place.
  if (meta.awaitingApproval?.live) {
    out.push({
      meta: frameMeta(charKey, frameKey),
      img: frameImage(charKey, frameKey),
      file: meta.awaitingApproval.live.file,
      caption: "in the game now",
      primary: true,
    });
  }
  const others = poseVariants(charKey, frameKey).filter((o) => o.file !== meta.file);
  // The drawing this pose most recently displaced leads the rest: approving
  // must not change what the comparison shows, and after a yes the answer to
  // "what was here before" is the drawing that just lost.
  const rank = (o) => (o.supersededAt ? `1${o.supersededAt}` : "0");
  for (const o of [...others].sort((a, b) => rank(b).localeCompare(rank(a)))) {
    if (out.some((e) => e.file === o.file)) continue;
    out.push({
      meta: poseView(o),
      img: spriteFileImage(o.file),
      file: o.file,
      caption: o.label === "Not approved" ? "the replacement, not approved"
        : o.supersededAt ? "the drawing this replaced"
        : o.label ? `alternate: ${o.label}` : "alternate",
    });
  }
  return out;
}

function altCompare() {
  const list = altCandidates(state.char, state.frame);
  if (!list.length) return null;
  const chosen = altPicked.get(`${state.char}/${state.frame}`);
  return list.find((e) => e.file === chosen) || list[0];
}

/** What the comparison slot should answer, for the list being opened.
 *
 *  Picking a character is a pass through one sprite set, where the question is
 *  "is this pose the right size for this character" — their idle beside it.
 *  The updated list is a different job: every pose on it has just had art
 *  land, and the question is "is the new drawing better than the old one",
 *  which only the other drawing answers. Set on the selection rather than
 *  fixed, so each list opens on the view it is for; changing it by hand still
 *  sticks until the next list is chosen. */
function defaultSelfIdleMode(mode) {
  const sel = $("selfIdleMode");
  if (sel) sel.value = mode;
}

/** Hide the option on a pose that has nothing to compare against, so the menu
 *  never offers a view that would silently show the same drawing twice.
 *
 *  What it does NOT do is change the selection. Stepping through a set with
 *  this view on used to reset it to Comparison at the first pose with a single
 *  drawing, so the setting had to be picked again every few poses; the slot
 *  says "no alternate available" on those instead, and the view survives to
 *  the next pose that has one. The option stays in the menu while it is the
 *  one selected, so the closed select still reads what it is showing. */
function refreshSelfIdleOptions() {
  const sel = $("selfIdleMode");
  const opt = sel?.querySelector('option[value="alternate"]');
  if (!opt) return;
  const alt = altCompare();
  opt.hidden = !alt && sel.value !== "alternate";
  // Offered only where there is a choice to make: one other drawing is not a
  // decision, it is the answer.
  const choices = altCandidates(state.char, state.frame);
  const pick = $("altPick");
  if (pick) pick.hidden = sel.value !== "alternate" || choices.length < 2;
  // Fetch it once it is asked for; the per-pose slot holds only the drawing
  // the pose points at.
  if (alt && !alt.img && alt.file) {
    loadSpriteFile(alt.file).then((ok) => { if (ok) render(); });
  }
}

/** The size benchmark stands at the left end of the platform rather than
 *  underneath the pose. It answers a different question from the self-ghost:
 *  "is this character the right size next to the rest of the roster", which is
 *  a comparison you read side by side, not by overlaying two silhouettes. */
function benchmarkKey() {
  return rawMeta("gojo", "idle_a") ? "idle_a" : "r0c0";
}

/** Gojo's idle is the roster's size reference, so it is drawn next to every
 *  character. Loaded on its own rather than waiting for his whole set. */
async function loadBenchmarkFrame() {
  if (await loadFrame("gojo", benchmarkKey())) render();
}

function selfIdleKey() {
  return rawMeta(state.char, "idle_a") ? "idle_a" : rawMeta(state.char, "r0c0") ? "r0c0" : null;
}

/** What stands in the comparison slot.
 *
 *  The dropdown names it, and the caption under the slot repeats that name, so
 *  what is standing there is never a guess. One thing outranks the menu: while
 *  a secondary action is being previewed the slot shows that action's SAVED
 *  sprite, because "what am I changing this from" is the more specific
 *  question and it is only on screen while the preview is.
 *
 *  Null for None and for Overlay idle pose — the overlay draws under the pose
 *  rather than beside it, so its slot is legitimately empty. */
function comparisonTarget() {
  // A shared sprite is drawn beside the fighter who throws it, because the
  // only useful question about an effect's size is "next to whom". Falls back
  // to Gojo when nothing in a kit claims it — a stage hazard, a domain.
  if (isOther(state.char)) {
    const mode = $("selfIdleMode").value;
    if (mode === "hide") return null;
    const owner = sharedOwner(state.frame);
    const charKey = mode === "gojo" || !owner ? "gojo" : owner;
    // The pose the fighter is IN while this drawing exists, when the move says
    // which — the special's own slot animation, or `ult`. A beam is aligned to
    // the hand that fires it, and that hand is only in the right place in the
    // pose that fires it; an idle put it somewhere else entirely.
    const launch = charKey === owner ? sharedControls(state.frame)?.launch : null;
    const firing = launch?.anim ? launchPose(charKey, launch.anim) : null;
    const key = firing || (rawMeta(charKey, "idle_a") ? "idle_a" : "r0c0");
    const move = sharedUsage().get(state.frame)?.[0]?.label;
    // Nobody throws an aura. It hangs on the fighter for the length of an
    // install, which is why the reference stands inside it rather than beside
    // it — and the caption has to say the same thing the picture does.
    const worn = sharedControls(state.frame)?.kind === "aura" ? " — wears this" : " — throws this";
    return {
      charKey, frameKey: key,
      caption: charKey === owner
        ? `${actorOf(charKey).name}${firing && move ? ` — ${move}` : worn}`
        : "Gojo — roster size reference",
    };
  }
  const row = state.actionRow;
  if (row?.saved && row.saved !== state.frame) {
    const label = frameLabel(state.char, row.saved);
    return {
      charKey: state.char, frameKey: row.saved,
      caption: `saved: ${label.sub || label.name}`, sub: stateLabel(row.name),
    };
  }
  const mode = $("selfIdleMode").value;
  if (mode === "hide" || mode === "overlay") return null;

  if (mode === "alternate") {
    const alt = altCompare();
    if (alt?.img) {
      return { charKey: state.char, frameKey: state.frame, caption: alt.caption, as: alt };
    }
    // Asked for, and this pose has not got one. The slot stays empty and says
    // why: the answer to "show me the alternate" is never a different sprite
    // that looks like one, and least of all Gojo.
    return { caption: "no alternate available", empty: true };
  }

  if (mode === "comparison") {
    const key = selfIdleKey();
    // On the idle itself the slot shows the idle again. It is the same drawing
    // twice on purpose: the pair is how every other pose is read, so dropping
    // to something else here would change what the canvas means at exactly the
    // pose the rest of the set is measured against.
    if (key) {
      return {
        charKey: state.char, frameKey: key,
        caption: key === state.frame ? "idle pose — same pose" : "idle pose",
      };
    }
    return { caption: "no idle to compare against", empty: true };
  }

  const gojo = benchmarkKey();
  return { charKey: "gojo", frameKey: gojo, caption: "Gojo — roster size reference" };
}

/** The comparison stands at the left end of the platform, drawn SOLID: it is a
 *  second sprite to look at, not a tracing guide, and ghosting it made it read
 *  as an overlay that had slipped sideways. */
const comparisonAsked = new Set();

/** The frame a fighter is showing while their own move runs — the last frame of
 *  that animation, which is the release rather than the wind-up. Null when they
 *  have no art for it, in which case the idle stands in rather than a hole. */
function launchPose(charKey, anim) {
  const frames = resolvedAnim(charKey, anim)?.frames || [];
  const key = frames[frames.length - 1];
  return key && rawMeta(charKey, key) ? key : null;
}

function drawComparison({ charKey, frameKey, caption, sub, as, empty }, zoom = state.zoom, x = null) {
  x ??= platformX() + BENCHMARK_INSET;
  // The slot can name a character whose set has never been streamed — the
  // fighter who throws an effect, most of all, since Other Sprites downloads
  // no fighter at all. Asked for once, then drawn when it lands.
  if (!empty && !as && charKey && frameKey && !frameImage(charKey, frameKey)) {
    const id = `${charKey}/${frameKey}`;
    if (!comparisonAsked.has(id)) {
      comparisonAsked.add(id);
      loadFrame(charKey, frameKey).then((ok) => { if (ok) render(); });
    }
  }
  if (!empty) drawGhost(charKey, frameKey, 1, x, as, zoom);
  ctx.save();
  ctx.fillStyle = empty ? "rgba(154, 164, 192, 0.55)" : "rgba(154, 164, 192, 0.9)";
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(caption, x, GROUND_Y + 60);
  if (sub) {
    ctx.fillStyle = "rgba(120, 170, 255, 0.9)";
    ctx.fillText(sub, x, GROUND_Y + 76);
  }
  ctx.restore();
}

function render() {
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.frame) return;
  const cx = canvas.width / 2;

  // A real game platform, drawn by the game's own routine, so feet can be
  // aligned against the surface players actually stand on.
  // Always: the platform is the floor every grounded pose is placed against,
  // and a viewer without it is a viewer with nothing to align to.
  {
    ctx.save();
    ctx.translate(0, GROUND_Y);
    drawPlatformShape(ctx, { x: platformX(), y: 0, w: PLATFORM_W, h: 42, kind: "main" });
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
    const hh = isOther(state.char) ? 0 : headHeight(state.char);
    if (hh) {
      const headY = GROUND_Y - hh * state.zoom;
      ctx.strokeStyle = "rgba(200, 160, 70, 0.85)";
      ctx.beginPath(); ctx.moveTo(0, headY); ctx.lineTo(canvas.width, headY); ctx.stroke();
      ctx.fillStyle = "rgba(200, 160, 70, 0.95)";
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText(`head height target (${hh.toFixed(1)})`, 8, headY - 5);
    }
  }

  const comparison = comparisonTarget();
  // The fighter beside a shared drawing is a SIZE REFERENCE, and a reference
  // drawn at a different zoom from the thing it references is worse than none:
  // it was standing at the Zoom slider's value while a too-tall effect was
  // fitted to the canvas, so at a 76% fit the effect was shown three quarters
  // its real size next to him and every judgement made against him was wrong by
  // that much. One zoom for the whole scene. Below the fit they grow together
  // and the slider does the obvious thing; at the fit the drawing holds the
  // canvas and the fighter shrinks against it, which is the same fact seen from
  // the other side — the effect is getting bigger relative to a man.
  const sharedV = isOther(state.char) ? sharedView() : null;
  // THE FIGHTER GOES ON TOP OF A SHARED DRAWING, always, because that is the
  // game's own order: entities, then projectiles, then fighters (render.js
  // `draw`), and the install aura is painted between a fighter's shadow and
  // their body. Every one of them passes UNDER. This canvas paints the
  // reference first, so it was showing all of it in front — invisible on a
  // shot flying away from its caster, and a different picture entirely on art
  // centred on him. Gakuganji's concert wave covered him here and stands
  // behind him in a match.
  //
  // Where the fighter STANDS is the other half, and it is per drawing: at the
  // launch distance when the move declares one, at the drawing's own centre
  // when the move paints on the caster, and off at the benchmark inset when
  // there is nothing to be relative to.
  const fighterX = comparison && sharedV ? referenceX(sharedV) : null;
  // A FIGHTER'S OWN COMPARISON, which is the case this slot exists for: their
  // idle standing beside the pose, because a pose is read against the idle and
  // nothing else. It is drawn here, before the pose, exactly where it used to
  // be — the shared-art branch below needs the reference painted AFTER the
  // drawing to get the game's paint order, and moving the one call in there to
  // do that (#61) left every ordinary fighter with no comparison at all. Two
  // call sites because the two cases genuinely differ in order, not one call
  // site that has to be right for both.
  if (comparison && !isOther(state.char)) drawComparison(comparison);
  // Overlaid, and only overlaid: within one sprite set the question is whether
  // this pose lines up with the character's own idle, and that is only readable
  // when the two occupy the same space. Standing it aside is the Comparison
  // option, handled above.
  if ($("selfIdleMode").value === "overlay") {
    const k = selfIdleKey();
    if (k && k !== state.frame) drawGhost(state.char, k, 0.32);
  }

  // Art streams in per character, so the pose can be selected before its image
  // exists. drawCharFrame silently draws nothing in that case, which is
  // indistinguishable from a broken sprite — say so instead.
  if (isOther(state.char)) {
    drawSharedSprite(cx);
    // ...the body over it, in the game's paint order...
    if (comparison) drawComparison(comparison, sharedV ? sharedV.z : state.zoom, fighterX);
    // ...and every handle and label over BOTH. They are the tool, not the
    // scene: a crosshair hidden behind the caster is a control that does not
    // exist as far as anybody using it is concerned.
    drawSharedOverlay();
  } else if (isPending(state.char, state.frame)) {
    drawPendingNotice(cx);
  } else if (!frameLoaded(state.char, state.frame)) {
    drawCanvasSpinner(cx);
  } else if ($("spinPreview").checked) {
    drawSpinPreview(cx);
  } else {
    drawCharFrame(ctx, state.char, state.frame, cx, GROUND_Y, {
      scale: actorOf(state.char).scale * state.zoom, facing: 1,
      // The workbench edits the drawing that is WAITING, not the one in play —
      // placing it is the work the approval is waiting on.
      preview: true,
    });
  }

  if ($("showBox").checked && !isOther(state.char) && !isPending(state.char, state.frame)) {
    const meta = rawMeta(state.char, state.frame);
    const s = spriteScale(state.char, meta);
    ctx.strokeStyle = "rgba(255, 120, 160, 0.8)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx + (meta.ox - CELL_W / 2) * s,
                   GROUND_Y + (meta.oy - meta.bodyBottom) * s,
                   meta.w * s, meta.h * s);
    ctx.setLineDash([]);
  }

  // The toggle draws it on every pose; the range pass draws it too, because a
  // reach target is meaningless without the body it reaches from. Guarded so a
  // strike frame with the toggle on does not stroke it twice at double opacity.
  const rangeDrewIt = !isOther(state.char) && drawRangeTargets(cx);
  if ($("showHurtbox").checked && !rangeDrewIt) drawHurtbox(cx);

  // Every anchor the frame carries that has not been switched off. Drawn last
  // so handles are never buried under the art.
  if (!isOther(state.char) && !isPending(state.char, state.frame)) {
    for (const name of anchorNames(state.char, state.frame)) {
      if (isAnchorShown(name)) drawAnchorHandle(name, name === state.anchor);
    }
  }
}

// ------------------------------------------------------- attack range targets
//
// For a pose that is the STRIKE of an attack — the last frame of its animation,
// never the wind-up — draw a target at the far edge of that attack's hitbox, so
// the sprite's visible reach can be eyeballed against the range the game
// actually plays. Everything here is COMPUTED from the game's own moves.js at
// render time (lightMove / heavyMove, and the VISIBLE_ART_REACH the art stops
// at), so when move data changes, these markers change with it — there is no
// copied number to drift.

// Every move in the kit, and what to call it. Which ANIMATION each one plays is
// not listed here — moves.js already knows, on the move's own `anim` field, and
// asking it is what keeps this honest. The table used to name the animations
// itself, and the three moves nobody thought to add (both dash attacks and the
// up tilt) drew no target at all: `attack_dash` is a pose whose whole job is
// reach, shown with nothing to place it against.
const KIT_MOVES = (c) => [
  ["Jab finisher", lightMove(c, "jab", 2)],
  ["Side tilt", lightMove(c, "side")],
  ["Up tilt", lightMove(c, "up")],
  ["Down tilt", lightMove(c, "down")],
  ["Dash attack", lightMove(c, "dash")],
  ["Air light", lightMove(c, "air")],
  ["Up air", lightMove(c, "upAir")],
  ["Meteor", lightMove(c, "downAir")],
  ["Side smash", heavyMove(c, "side")],
  ["Up smash", heavyMove(c, "up")],
  ["Down smash", heavyMove(c, "down")],
  ["Dash smash", heavyMove(c, "dash")],
  ["Air heavy", heavyMove(c, "air")],
];

/** The moves a given animation plays for, grouped off their own `anim`.
 *
 *  A frame serving several states gets a target per distinct move — the aerial
 *  pose alone stands for four, and they are not the same shape: the two forward
 *  ones, the rising hit above and the meteor below. */
function movesForAnim(c, anim) {
  return KIT_MOVES(c).filter(([, m]) => m?.anim === anim);
}

// A move's hitbox is a rectangle offset from the fighter (combat.js
// hitboxRect), and the shape of that rectangle says what kind of attack it is.
// Marking every one of them at "ox + w, half height" described a punch, which
// is wrong for the three quarters of the kit that are not punches: an up smash
// straddles the fighter and reaches UPWARD, and a quake or a meteor comes out
// both sides at once. Read the geometry instead of assuming it.
function rangeShape(m) {
  const x0 = m.ox, x1 = m.ox + m.w, y0 = m.oy, y1 = m.oy + m.h;
  if (x0 >= 0) return { kind: "forward", x0, x1, y0, y1 };
  // Straddling the fighter: the reach is not "in front", it is out from the
  // middle. Which way depends on the box.
  const aspect = Math.max(m.w, m.h) / Math.min(m.w, m.h);
  if (aspect < 1.4) return { kind: "radial", x0, x1, y0, y1 };
  if (m.h > m.w) return { kind: "vertical", x0, x1, y0, y1 };
  return { kind: "sweep", x0, x1, y0, y1 };
}

/** The box `combat.js` actually tests for hits, for THIS pose.
 *
 *  Range targets only appear on a strike frame, because only a strike has
 *  reach — but every pose has a hurtbox, which makes it the one fixed reference
 *  a pose can be placed against. That is why the vertical-position control
 *  stays live on airborne poses: line the body up inside this.
 *
 *  Which box, though, depends on the pose. `hurtbox()` has five shapes — ledge,
 *  prone, crouch, hitstun and standing — and this used to draw the standing one
 *  on all of them. On a `prone` pose that is a box more than three times too
 *  tall, and on a `ledge_hang` it is the wrong box in the wrong place. Inviting
 *  someone to line a body up inside a box the game does not test for that pose
 *  is worse than showing no box, so the branches are mirrored from combat.js.
 *
 *  Sized from THIS character's own art, the same way the game sizes it, so the
 *  box on screen is the box in play. Re-measured every frame rather than
 *  cached: the workbench is where `ox`, `bodyBottom` and `renderScale` get
 *  dragged around, and all three move what the silhouette measures. The game
 *  never edits the manifest, so it keeps the cache; here, live numbers matter
 *  more than the handful of reads.
 */
function drawHurtbox(cx) {
  if (isOther(state.char) || !CHARACTERS[state.char]) return;
  const z = state.zoom;
  const wx = (v) => cx + v * z;
  const wy = (v) => GROUND_Y + v * z;
  refreshSilhouettes(state.char);
  const body = bodyMetrics(state.char);
  const H = body.height, W = body.width;
  const states = statesUsing(state.char, state.frame);
  const has = (...names) => states.some((a) => names.includes(a));
  // `top` is how far the box rises above the foot line, `h` how tall it is.
  // They differ only on the ledge box, which the game floats clear of the feet.
  let hb;
  if (has("ledge")) {
    hb = { w: W * HURTBOX.ledgeW, top: H * HURTBOX.ledgeTop, h: H * HURTBOX.ledgeH, label: "ledge" };
  } else if (has("prone")) {
    hb = { w: H * HURTBOX.proneW, top: H * HURTBOX.proneH, h: H * HURTBOX.proneH, label: "prone" };
  } else if (has("crouch", "crouchAttack")) {
    hb = { w: W * HURTBOX.crouchW, top: H * body.crouch, h: H * body.crouch, label: "crouch" };
  } else if (has("hurt")) {
    // Hitstun only. A shield-break `dizzy` is not hitstun, so combat.js falls
    // through to the standing box there and so does this.
    hb = { w: W * HURTBOX.hurtW, top: H * HURTBOX.hurtH, h: H * HURTBOX.hurtH, label: "hitstun" };
  } else {
    hb = { w: W, top: H * HURTBOX.standH, h: H * HURTBOX.standH, label: "hurtbox" };
  }
  ctx.save();
  ctx.font = "600 10.5px Inter, sans-serif";
  ctx.strokeStyle = "rgba(120, 200, 255, 0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(wx(-hb.w / 2), wy(-hb.top), hb.w * z, hb.h * z);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(120, 200, 255, 0.8)";
  ctx.textAlign = "right";
  // "follows" is the other half of the shared sprites' "fixed": a fighter's box
  // is MEASURED from their art (src/silhouette.js), so resizing the pose
  // resizes the box with it — which is exactly the thing you need to know
  // before deciding whether to match the art to the box or the box to the art.
  ctx.fillText(`${hb.label} ${Math.round(hb.w)}x${Math.round(hb.h)} · follows the art`,
               wx(-hb.w / 2) - 5, wy(-hb.top) + 11);
  ctx.restore();
}

// ------------------------------------------------------------------- grabs
//
// A grab has no hitbox — it tests a plain rectangle and ignores shields, which
// is the entire reason it exists (src/grab.js) — so it produced no range target
// and its three poses were placed against nothing at all. They are the poses
// that need it most: `grab_reach` is a defined distance, and the two holding
// poses are drawn against a body that has to be exactly where the game pins it.
//
// Everything here is read from grab.js's own arithmetic, at the workbench's
// live measurements, so a resized pose moves these with it.

/** What the game does with this pose, if it is one of the grab three. */
function grabShapes(charKey, anim) {
  if (!["grabReach", "grabHold", "grabbed"].includes(anim)) return [];
  const m = bodyMetrics(charKey);
  if (anim === "grabReach") {
    // ASKED OF src/grab.js RATHER THAN RECOMPUTED, and that is the whole point.
    // This line used to be the roster formula with "put the grasping hand ON
    // it" written beside it — a second answer to the question the `grabHand`
    // anchor answers. The moment anybody placed the anchor the game used the
    // hand and the canvas went on drawing the formula, so the guide was telling
    // the artist to move a hand that had already been measured. Now the line
    // follows the hand: place the anchor and the reach moves with it.
    const r = grabReachOf(charKey);
    return [{ kind: "reach", w: r.reach + GRAB.grace, hand: r.reach,
              source: r.source, h: m.height * 0.9 }];
  }
  // pinVictim stands the two bodies `holdGapOf` apart and turns the victim to
  // face the holder. So from EITHER pose, drawn facing right, the other fighter
  // stands the same gap ahead — the holder in front of the one being held, the
  // victim in front of the one holding. Measured against another fighter of
  // this build, there being only one body on this canvas.
  const g = holdGapOf(charKey, charKey);
  return [{ kind: "partner", gap: g.gap, source: g.source,
            w: m.width, h: m.height * HURTBOX.standH,
            label: anim === "grabHold" ? "the fighter held" : "the fighter holding" }];
}

/** The grab's own geometry, in the same red as a move's reach: the reach box
 *  with its far edge marked, or the partner body a hold is pinned against. */
function drawGrabShape(cx, g) {
  const z = state.zoom;
  const wx = (v) => cx + v * z;
  const wy = (v) => GROUND_Y + v * z;
  ctx.save();
  ctx.font = "600 10.5px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.lineWidth = 1.5;
  if (g.kind === "reach") {
    ctx.strokeStyle = "rgba(255, 120, 90, 0.28)";
    ctx.setLineDash([2, 3]);
    ctx.strokeRect(wx(0), wy(-g.h), g.w * z, g.h * z);
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255, 120, 90, 0.9)";
    ctx.fillStyle = "rgba(255, 140, 110, 0.95)";
    ctx.beginPath();                       // the far edge: the last px it closes on
    ctx.moveTo(wx(g.w), wy(-g.h)); ctx.lineTo(wx(g.w), wy(0));
    ctx.stroke();
    const note = g.source === "hand"
      ? `follows the Grabbing hand anchor · +${Math.round(g.w - g.hand)}px closing grace`
      : "no Grabbing hand placed — this is the roster formula, not this drawing";
    // Measured rather than guessed at: the note is a sentence, and on a
    // long-armed fighter at high zoom it ran off the right edge of the canvas.
    const room = wx(g.w) + 6 + ctx.measureText(note).width < canvas.width - 4;
    ctx.textAlign = room ? "left" : "right";
    const lx = wx(g.w) + (room ? 6 : -6);
    // ABOVE the box, not inside it: flipped to the left the notes landed on
    // top of the hurtbox caption, and two red-on-blue sentences over each other
    // are worse than no caption at all.
    ctx.fillText(`Grab reach · ${Math.round(g.w)}px — a grab connects up to here`,
      lx, wy(-g.h) - 18);
    ctx.fillStyle = "rgba(255, 140, 110, 0.7)";
    // WHICH OF THE TWO IS THE ANSWER, said out loud. With the hand placed this
    // line is a readout of it and there is nothing to do here; without one it
    // is the roster's guess, and the fix is still to place the anchor rather
    // than to slide the drawing until it touches a line.
    ctx.fillText(note, lx, wy(-g.h) - 5);
    ctx.textAlign = "left";
  } else {
    // The other body, where the pin puts it: a plain hurtbox, because that is
    // all the pose has to agree with — hands on it, and not through it.
    ctx.strokeStyle = "rgba(255, 120, 90, 0.55)";
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(wx(g.gap - g.w / 2), wy(-g.h), g.w * z, g.h * z);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 140, 110, 0.95)";
    ctx.fillText(`${g.label} · ${Math.round(g.gap)}px away`, wx(g.gap - g.w / 2), wy(-g.h) - 5);
    ctx.beginPath();                       // the centre line the other body pins to
    ctx.moveTo(wx(g.gap), wy(-g.h)); ctx.lineTo(wx(g.gap), wy(0));
    ctx.strokeStyle = "rgba(255, 120, 90, 0.9)";
    ctx.stroke();
    // THE GRIP, which is the thing these two poses actually have to agree on
    // and the one line this canvas was not drawing. The brief calls it "the
    // constraint that spans fighters": `grab_hold`'s closed fist and
    // `grabbed`'s prying hands both sit at chest height on the leading edge,
    // because the game stands the two bodies at a fixed gap and the pair is
    // what a player reads. Halfway between the two body centres is where those
    // two hands meet — derived from `holdGap`, not invented for the picture.
    //
    // NEITHER POSE MOVES TO IT. The body stays on its own ground contact; what
    // lines up with this is the HANDS. Sliding the drawing sideways to reach
    // the line would take the fighter off the spot the game pins them to.
    const grip = g.gap / 2;
    // Which store this gap came from — the two placed anchors, or the width
    // formula that stands in until they are.
    ctx.fillStyle = "rgba(255, 140, 110, 0.7)";
    ctx.fillText(g.source === "grip"
      ? "gap from the placed Grabbing hand and Held chest"
      : "gap from the width formula — place both grip anchors to set it",
      wx(g.gap - g.w / 2), wy(-g.h) - 18);
    ctx.strokeStyle = "rgba(120, 210, 240, 0.9)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(wx(grip), wy(-g.h)); ctx.lineTo(wx(grip), wy(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(150, 220, 250, 0.95)";
    // Clear of the anchor handle's own label, which sits at chest height —
    // which is exactly where this line is about.
    ctx.fillText("the grip — hands here, chest height", wx(grip) + 6, wy(-g.h * 0.82));
  }
  ctx.restore();
}

function drawRangeTargets(cx) {
  const char = CHARACTERS[state.char];
  if (!char?.light || !char?.heavy) return false;   // sprite actors have no kit
  const moves = [];
  const grabs = [];
  for (const anim of statesUsing(state.char, state.frame)) {
    const made = movesForAnim(char, anim);
    const grab = grabShapes(state.char, anim);
    if (!made.length && !grab.length) continue;
    // Strike frames only: the wind-up of a pair gets no target, because its
    // job is to not have connected yet.
    const frames = resolvedAnim(state.char, anim).frames;
    if (frames.length > 1 && frames.indexOf(state.frame) < frames.length - 1) continue;
    for (const [label, m] of made) moves.push([label, m]);
    grabs.push(...grab);
  }
  if (!moves.length && !grabs.length) return false;
  if (!moves.length) {
    // A grab reaches and holds; it has no hitbox rectangle to mark, so the
    // shapes below have nothing to iterate. The body it reaches FROM still
    // matters — it is what the drawing is placed against — so the hurtbox and
    // the grab's own geometry are drawn on their own.
    drawHurtbox(cx);
    for (const g of grabs) drawGrabShape(cx, g);
    return true;
  }

  const z = state.zoom;   // world px -> canvas px at this viewer zoom
  const wx = (v) => cx + v * z;
  const wy = (v) => GROUND_Y + v * z;
  ctx.save();
  ctx.font = "600 10.5px Inter, sans-serif";
  ctx.textAlign = "left";

  const shapes = [];
  const seen = new Set();
  for (const [label, m] of moves) {
    const box = rangeShape(m);
    const key = [box.kind, Math.round(box.x0), Math.round(box.x1),
                 Math.round(box.y0), Math.round(box.y1)].join(",");
    if (seen.has(key)) continue;              // two moves, same box: one marker
    seen.add(key);
    shapes.push({ label, box, move: m });
  }

  // The body the game actually tests, drawn behind the markers. Without it a
  // target reads as "this attack reaches miles past the fist", because the eye
  // compares it to the DRAWING — and the drawing is not what gets hit.
  drawHurtbox(cx);
  ctx.textAlign = "left";

  // Where this character's art currently reaches, measured from their own
  // attack frames (src/silhouette.js) rather than assumed from a single global
  // constant. It is the number the game builds their hitboxes from, so the gap
  // between this line and a range target IS that move's grace margin — and it
  // should look about the same on every fighter. Past it the reach is carried
  // by the swing's strike arc (drawStrikeArcs in render.js), so art stopping
  // short of a far target is fine.
  if (shapes.some((s) => s.box.kind === "forward" || s.box.kind === "sweep")) {
    const capX = wx(visibleArtReach(char));
    ctx.strokeStyle = "rgba(150, 160, 190, 0.5)";
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(capX, GROUND_Y - 190 * z); ctx.lineTo(capX, GROUND_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(150, 160, 190, 0.85)";
    ctx.fillText("art cap — strike arc beyond", capX + 4, GROUND_Y - 190 * z + 10);
  }

  // Several moves share one frame and can land within a few px of each other —
  // an air light and an air heavy differ by 3px of hitbox height. Captions are
  // pushed clear of the ones already placed rather than staggered by index,
  // which only helps when the collision happens to be with the previous one.
  const placed = [];
  const clearOf = (x, y) => {
    let out = y;
    while (placed.some((q) => Math.abs(q.x - x) < 120 && Math.abs(q.y - out) < 13)) out -= 13;
    placed.push({ x, y: out });
    return out;
  };
  shapes.forEach(({ label, box, move }) => {
    const { kind, x0, x1, y0, y1 } = box;
    // The box the game actually tests, faint behind the marker. Reading the
    // real rectangle is the whole point — a single crosshair cannot say
    // whether a hit comes out one side or both.
    ctx.strokeStyle = "rgba(255, 120, 90, 0.28)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeRect(wx(x0), wy(y0), (x1 - x0) * z, (y1 - y0) * z);
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(255, 120, 90, 0.9)";
    ctx.fillStyle = "rgba(255, 140, 110, 0.95)";
    ctx.lineWidth = 1.5;
    let tx, ty, text;

    if (kind === "radial") {
      // Out from the middle in every direction: an ellipse, drawn on the
      // radii the box gives rather than faked as a circle.
      const ecx = wx((x0 + x1) / 2), ecy = wy((y0 + y1) / 2);
      ctx.beginPath();
      ctx.ellipse(ecx, ecy, (x1 - x0) / 2 * z, (y1 - y0) / 2 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(ecx, ecy, 2, 0, Math.PI * 2); ctx.stroke();
      tx = wx(x1); ty = ecy;
      text = `${label} · ±${Math.round((x1 - x0) / 2)}px`;
    } else if (kind === "vertical") {
      // Reaches up (or down) from the fighter: mark the edge furthest from the
      // feet, across the width it covers.
      const up = Math.abs(y0) > Math.abs(y1);
      const edge = wy(up ? y0 : y1);
      ctx.beginPath(); ctx.moveTo(wx(x0), edge); ctx.lineTo(wx(x1), edge); ctx.stroke();
      const mid = wx((x0 + x1) / 2);
      ctx.beginPath();                                   // arrow along the reach
      ctx.moveTo(mid, wy(0)); ctx.lineTo(mid, edge);
      ctx.moveTo(mid - 5, edge + (up ? 8 : -8)); ctx.lineTo(mid, edge);
      ctx.lineTo(mid + 5, edge + (up ? 8 : -8));
      ctx.stroke();
      tx = wx(x1); ty = edge + (up ? -6 : 14);
      text = `${label} · ${Math.round(Math.abs(up ? y0 : y1))}px ${up ? "up" : "down"}`;
    } else if (kind === "sweep") {
      // Both sides at once: a tick on each edge, so it cannot be read as a
      // forward attack that happens to start behind the fighter.
      const mid = wy((y0 + y1) / 2);
      for (const x of [x0, x1]) {
        ctx.beginPath();
        ctx.moveTo(wx(x), wy(y0)); ctx.lineTo(wx(x), wy(y1));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(wx(x0), mid); ctx.lineTo(wx(x1), mid);
      ctx.stroke();
      tx = wx(x1); ty = mid;
      text = `${label} · ±${Math.round((x1 - x0) / 2)}px`;
    } else {
      // Forward: the crosshair sits on the far edge — the last point this
      // attack connects at — at the height the swing is DRAWN at, which is not
      // the box's mid height.
      //
      // Hitboxes are deliberately generous downward: a jab's box runs from
      // chest to floor so it catches a crouching opponent (moves.js). Marking
      // its middle put the target at hip level on a punch thrown at chest
      // level, and the pair read as a diagonal aimed at the floor. render.js
      // has the same problem with the strike arc and solves it by asking
      // strikeArcs() where the swing hangs; the marker asks the same function,
      // so it lands where the crescent does in a match.
      const arc = strikeArcs(move, headHeight(state.char) || 175)
        .find((a) => a.aim === 0);
      const x = wx(x1), cy = wy(arc ? arc.pivotY : (y0 + y1) / 2);
      ctx.beginPath(); ctx.arc(x, cy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, cy, 2, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 14, cy); ctx.lineTo(x - 4, cy);
      ctx.moveTo(x + 4, cy); ctx.lineTo(x + 14, cy);
      ctx.moveTo(x, cy - 14); ctx.lineTo(x, cy - 4);
      ctx.moveTo(x, cy + 4); ctx.lineTo(x, cy + 14);
      ctx.stroke();
      tx = x; ty = cy - 12;
      text = `${label} · ${Math.round(x1)}px`;
    }

    // Near the right edge the label flips to the left of its marker, so a
    // long-reach move's caption is not cropped off the canvas.
    const flip = tx > canvas.width - 130;
    ctx.textAlign = flip ? "right" : "left";
    ctx.fillText(text, tx + (flip ? -12 : 12), clearOf(tx, ty));
  });
  ctx.restore();
  // A pose can serve both — a dash attack whose frame is also the grab reach —
  // so the grab geometry is drawn here too rather than only on the path where
  // there are no moves at all.
  for (const g of grabs) drawGrabShape(cx, g);
  return true;      // it drew, hurtbox included
}

// ------------------------------------------------- secondary action editor
//
// Which sprite each action draws. The pose list covers the actions a sprite was
// drawn FOR; this covers the rest — the states that borrow a cell belonging to
// something else, which on the sheet-era fighters is most of their kit.

/** States that are not the primary owner of the sprite they draw, plus any
 *  state that has been re-pointed by hand (so a change can be undone even once
 *  it no longer looks secondary). */
function secondaryActions(charKey) {
  if (isOther(charKey) || !spriteManifest?.characters?.[charKey]) return [];
  const anims = animsOf(charKey);
  const rows = [];
  for (const [name, anim] of Object.entries(anims)) {
    const overridden = !!spriteManifest?.animOverrides?.[charKey]?.[name];
    anim.frames.forEach((frame, i) => {
      if (!frame) return;
      // A state is listed when the sprite it draws was drawn for something
      // else. A two-frame cycle is listed per slot, since each half can be
      // borrowing separately.
      if (!overridden && primaryState(charKey, frame) === name) return;
      rows.push({
        name, frame, index: i, overridden,
        label: anim.frames.length > 1
          ? `${stateLabel(name)} (${i + 1} of ${anim.frames.length})`
          : stateLabel(name),
      });
    });
  }
  return rows.sort((a, b) => stateRank(a.name) - stateRank(b.name) || a.index - b.index);
}

function setActionFrame(charKey, stateName, index, frameKey) {
  spriteManifest.animOverrides ||= {};
  const forChar = (spriteManifest.animOverrides[charKey] ||= {});
  const original = originalAnimFrames(charKey, stateName);
  const current = (forChar[stateName] || original || []).slice();
  current[index] = frameKey;
  // Back to exactly what the kit gives: drop the override rather than storing a
  // copy of it, so an export never carries a change that changes nothing.
  if (original && current.length === original.length && current.every((f, i) => f === original[i])) {
    delete forChar[stateName];
  } else {
    forChar[stateName] = current;
  }
  if (!Object.keys(forChar).length) delete spriteManifest.animOverrides[charKey];
  syncAll();
}

function rememberAnims(charKey) {
  if (state.originalAnims[charKey] || isOther(charKey)) return;
  const snap = {};
  // The manifest's overrides are themselves saved state, so "original" means
  // what is committed — reverting a row returns to the file, not to whatever
  // the kit said before a previous session's export.
  for (const [name, anim] of Object.entries(animsOf(charKey))) snap[name] = anim.frames.slice();
  state.originalAnims[charKey] = snap;
}

/** Show what an action currently draws, with its committed choice beside it. */
function previewAction(row) {
  state.actionRow = { name: row.name, index: row.index, saved: savedActionFrame(state.char, row.name, row.index) };
  state.frame = row.frame;
  syncAll();
}

/** The frame this action drew when the page loaded — what is committed in the
 *  repo, as opposed to whatever it is pointed at right now. */
function savedActionFrame(charKey, stateName, index) {
  return state.originalAnims[charKey]?.[stateName]?.[index] ?? null;
}

function buildActionRows() {
  const box = $("actionRows");
  if (!box) return;
  const rows = secondaryActions(state.char);
  const frames = allFramesOf(state.char);
  $("secondaryCount").textContent = rows.length ? `${rows.length}` : "none";
  box.innerHTML = "";
  if (!rows.length) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = isOther(state.char)
      ? "Shared sprites are spawned by code, not by an animation table."
      : "Every action here draws its own sprite.";
    box.appendChild(note);
    return;
  }
  for (const row of rows) {
    const el = document.createElement("div");
    const active = state.actionRow?.name === row.name && state.actionRow?.index === row.index;
    el.className = "action-row"
      + (row.overridden ? " overridden" : "")
      + (active ? " active" : "");

    // The action's name previews it: canvas shows what it draws now, the
    // benchmark slot shows what it is saved as.
    const name = document.createElement("button");
    name.className = "action-name";
    name.textContent = row.label;
    name.title = "Show this action on the canvas";
    name.onclick = () => previewAction(row);

    // The current sprite, and the way to change it.
    const pick = document.createElement("button");
    pick.className = "action-pick";
    const label = frameLabel(state.char, row.frame);
    pick.innerHTML = `${label.name}${label.sub ? `<i>${label.sub}</i>` : ""}`;
    pick.title = "Choose a different sprite for this action";
    pick.onclick = () => openSpritePicker({
      title: `${stateLabel(row.name)} — choose a sprite`,
      sub: `${actorOf(state.char).name} · currently ${row.frame}`,
      current: frameMeta(state.char, row.frame)?.file,
      currentPose: row.frame,
      // An action names a POSE, not a file — the pose is what animsOf resolves
      // — so the alternates are not answers to this question.
      primaryOnly: true,
      onPick: (file, d) => {
        setActionFrame(state.char, row.name, row.index, d.pose);
        previewAction({ ...row, frame: d.pose });
      },
    });

    el.append(name, pick);
    if (row.overridden) {
      const reset = document.createElement("button");
      reset.className = "reset-action";
      reset.title = "Back to the sprite the kit gives this action";
      reset.textContent = "↺";
      reset.onclick = () => setActionFrame(state.char, row.name, row.index,
        originalAnimFrames(state.char, row.name)?.[row.index]);
      el.appendChild(reset);
    }
    box.appendChild(el);
  }
}

// -------------------------------------------------------------- ui wiring

// Which half of the panel applies. A shared sprite has no pose to place — the
// code that spawns it decides where it goes — so the placement sliders would
// be writing into nothing. Two of them are not about placement though: which
// way the drawing FACES and how big it is relative to the fighter who throws
// it are properties of the picture, and both now reach the game (see
// src/shared_sprites.js), so they stay.
const PLACEMENT_GROUPS = ["anchorGroup", "heightGroup", "resetGroup"];
// The two nudge sliders. A shared drawing does not use them: its position is
// one gesture on the canvas — drag the spawn point — rather than two sliders
// and a guess about which way is positive.
const NUDGE_GROUPS = ["offsetGroup", "groundGroup"];

function applyPanelMode() {
  const other = isOther(state.char);
  for (const id of PLACEMENT_GROUPS) $(id)?.toggleAttribute("hidden", other);
  for (const id of NUDGE_GROUPS) $(id)?.toggleAttribute("hidden", other);
  $("secondaryGroup")?.toggleAttribute("hidden", other);
  $("usageGroup")?.toggleAttribute("hidden", !other);
  // What a shared drawing offers is a property of the drawing (the registry in
  // src/shared_sprites.js): a size only where something declares a height, a
  // tilt wherever it is painted at all, and nothing at all for a backdrop the
  // renderer fits to the screen. The usage panel says which, and why.
  const can = other ? sharedControls(state.frame) : null;
  $("scaleGroup")?.toggleAttribute("hidden", other && !can?.size);
  $("rotationGroup")?.toggleAttribute("hidden", other && !can?.rotate);
  // The nudge is the shared-drawing counterpart of a pose's placement fields,
  // so it appears exactly where those disappear.
  $("nudgeGroup")?.toggleAttribute("hidden", !(other && can?.offset));
  if (other) refreshUsageInfo();

  // A pose with no art yet has nothing to place: the controls stay visible so
  // the panel does not jump around as the set fills in, but they are greyed
  // and inert rather than pretending to edit something.
  const pending = !other && isPending(state.char, state.frame);
  for (const id of ["scaleGroup", "offsetGroup", "groundGroup", "rotationGroup",
                    "anchorGroup", "mirrorGroup"]) {
    const group = $(id);
    if (!group) continue;
    group.classList.toggle("disabled", pending);
    for (const input of group.querySelectorAll("input, select, button")) input.disabled = pending;
  }
}

/** Who spawns this sprite, and how big the game draws it. */
/** What the game will actually honour for a shared drawing.
 *
 *  Every one of these sprites has a size and a place, but they come from four
 *  different owners: a kit's `spriteH` for anything a move throws, `h` in
 *  config_summons.js for a creature, a constant in the renderer for an install
 *  aura, another in stage_fx.js for a hazard. The workbench used to offer Size
 *  on all of them and only the first was wired, so a number typed against a
 *  summon was stored, displayed, and inert — which is exactly the way a control
 *  should never fail. All four are read now (src/shared_sprites.js), and this
 *  says which drawings have an owner at all: art nothing spawns has no size to
 *  be wrong, and offering the slider there would be the same lie again.
 */
// Shared art drawn by code that no kit names, with what its size means there.
// A short list by necessity: these are drawn by a domain or a stage rather than
// by a move, so there is nothing to walk. Anything not here and not referenced
// by a kit really is unused.
const CODE_DRAWN = {
  "effect:shrine": "the shrine behind Sukuna's domain (src/domains.js)",
};

function refreshUsageInfo() {
  const box = $("usageInfo");
  if (!box) return;
  const shown = drawableSharedKey(state.frame);
  const img = getImage(shown);
  const uses = sharedUsage().get(state.frame) || [];
  const size = img
    ? `${img.width}×${img.height} delivered`
      + (shown !== state.frame ? " — its resting pose; this creature has no single still" : "")
    : "not loaded";
  const drawn = gameHeightOf(state.frame);
  const lines = [
    `<b>${state.frame}</b>`,
    size + (drawn ? ` · drawn ${drawn}px tall in game` : " · size decided by the code that spawns it"),
  ];
  lines.push(uses.length
    ? uses.map((u) => `${u.who} — ${u.label}`).join("<br>")
    : "No kit references this sprite — it is spawned from code (a stage hazard, a domain, or a shikigami).");
  // WHY THERE IS NO PLAY BUTTON, on the one class of drawing that will never
  // get one. A stand-in behind a creature whose own plates have landed is
  // never reached (summons.js draws the first that loaded), so there is no
  // action to play — and a greyed-out button with no explanation reads as a
  // preview that is broken rather than a drawing that is retired.
  if (uses.length && uses.every((u) => u.dead)) {
    lines.push("<b>Nothing draws this today.</b> It is a STAND-IN behind a creature whose "
      + "own art has since been delivered, kept so the fighter still has something to draw "
      + "if that art is ever pulled. There is no action to play for the same reason.");
  }
  const can = sharedControls(state.frame);
  if (can?.used && (can.size || can.offset)) {
    const meta = rawMeta(state.char, state.frame);
    const dx = meta?.dx ?? 0, dy = meta?.dy ?? 0, deg = meta?.rotationDeg ?? 0;
    if (can.size) lines.push(`<b>Size</b> multiplies ${can.what}.`);
    if (can.info?.hit) {
      const h = can.info.hit;
      const shape = h.shape === "circle" ? `a ${h.r}px radius` : `${h.w}×${h.h}px`;
      lines.push(`<b>Hit region:</b> ${shape} — ${h.what} (the kit's <code>${h.from}</code>). `
        + (h.followsSize
          ? "<b>Its height follows Size and its width does not.</b> The move paints the "
            + "drawing at the same <code>h</code> it collides on, so those two can never "
            + "disagree — but the art keeps its aspect while <code>w</code> stays put, so "
            + "sizing up makes the picture wider than the box it lands in. Width is the "
            + "only thing there is to match here. "
          : "It does not follow Size — the kit owns how far this move reaches. ")
        + "Turn on Hurtbox to see it."
        + (h.shape === "circle" && !h.melee
          ? " <b>Two handles on the circle's edge:</b> the top one moves it, the right one "
            + "resizes it — or drag anywhere inside the shape to move it. They sit on the "
            + "RIM so they never compete with the spawn crosshair, which the circle starts "
            + "centred on. This is a different edit from moving the picture: <b>the orange "
            + "handle places the art, these place what the shot actually connects with.</b> "
            + "Corrections against this drawing (a shot whose art is a wall of water should "
            + "collide with the water, not with the middle of a mostly-empty plate), riding "
            + "on top of the kit's own number rather than replacing it."
          : ""));
    }
    // A creature with no authored pair measures its box off this drawing, so
    // there is no target to match and nothing worth drawing: the box is the
    // picture, at 85% of it, and it follows Size because it is derived from it.
    if (can.hovers) {
      lines.push(`<b>It never lands.</b> This one holds station ${can.hovers.back}px `
        + `behind its summoner and ${can.hovers.up}px up, for its whole life — the `
        + "canvas here stands it on the floor because that is what the anchor says, "
        + "and the floor is somewhere the game never puts it. Play it in action to "
        + "see it where it actually sits.");
    }
    if (can.measuredBox) {
      lines.push("<b>Hurt box:</b> measured from this drawing — 85% of the drawn "
        + "rectangle, so it follows Size and there is nothing to match it against. "
        + "Size the creature and it comes with it.");
      if (canPlaceAttack(state.frame)) {
        const b = attackBoxOf(state.frame);
        const placed = !!rawMeta(OTHER_KEY, state.frame)?.attackBox;
        const pct = (v) => `${Math.round(v * 100)}%`;
        lines.push(`<b>Attack box:</b> what it hits WITH — ${placed ? "placed here" : "the default, not yet placed"}. `
          + `${pct(b.w)}×${pct(b.h)} of the drawing, centred ${pct(b.x)} forward and ${pct(b.y)} up. `
          + "Drag it on the canvas to place it (a dog bites with its head, not its tail); "
          + "drag the corner to size it. Shown under the Hurtbox toggle.");
      }
    }
    if (can.launch) {
      const L = launchPoint(state.frame) || can.launch;
      const round = (n) => Math.round(n * 10) / 10;
      const where = `${round(Math.abs(L.forward))}px ${L.forward < 0 ? "behind" : "in front of"} them`
        + `, ${L.y < 0 ? `${round(Math.abs(L.y))}px up`
              : L.y > 0 ? `${round(L.y)}px below their feet` : "at their feet"}`;
      lines.push(`<b>Launched from the fighter:</b> ${where} — so the canvas stands them `
        + "at that distance, in the pose the move plays, and you can line the drawing up "
        + "against the hand that throws it. Moving the drawing off that point is what the "
        + "nudge does.");
      // The point shown is rarely the kit's own number, and how it was arrived
      // at is the thing somebody has to know before tuning one.
      const k = launchScale(state.frame);
      const who = sharedOwner(state.frame);
      if (L.source) {
        const name = actorOf(who).name;
        lines.push({
          human: `<b>${name}'s muzzle is placed by hand</b> (<code>muzzle</code> in `
            + "config_body_points.js, written by the verification bench). That point is "
            + "where the shot leaves; the move's <code>ox</code>/<code>oy</code> ride on "
            + "top of it as an offset from the reference body.",
          model: `<b>${name}'s muzzle is measured off their rig</b> — the hand posed at this `
            + "move's own beat (<code>config_model_reach.js</code>). Good enough to place "
            + "art against; verify it on the bench to make it a decision rather than a "
            + "measurement.",
          derived: `<b>Nobody has placed ${name}'s muzzle.</b> This is the reference body's `
            + `70, -86 scaled onto their height — ×${k.toFixed(3)} here — which is a guess `
            + "the whole roster shares. The verification bench's “muzzle-points” set is "
            + "where that stops being a guess.",
        }[L.source]);
      }
      if (L.edited) {
        lines.push("<b>Unsaved spawn offset.</b> This is the point dragged on the action "
          + "preview, not the one the kit holds. It exports as <code>spawnOx</code>/"
          + "<code>spawnOy</code>, which is a NOTE: nothing in the game reads those, and "
          + "apply_sprite_adjustments.py skips them. Landing it means editing "
          + "<code>ox</code>/<code>oy</code> on the move in src/characters.js — or, if what "
          + "you are really correcting is where this FIGHTER's hand is rather than where "
          + "this MOVE spawns, placing their muzzle on the verification bench instead, "
          + "which fixes it for every move they throw.");
      }
    }
    if (can.travels) {
      lines.push("<b>Directional.</b> The game mirrors this drawing to the way it is "
        + "travelling, so the plate is the version you see flying LEFT and a player "
        + "firing right sees it flipped. There is only ONE point here: the projectile's "
        + "position is both what it collides on and what the picture is hung around "
        + "(<code>drawProjectiles</code>, render.js). Moving the drawing off that point "
        + "is what the nudge does, and moving the CIRCLE off it is what the hit handles "
        + "do — the two used to be locked together, which was right until the art stopped "
        + "being a ball. Both are in the drawing's own frame, so they mirror with it: put "
        + "the collision on the face of a wave and it stays on the face whichever way the "
        + "wave rolls.");
    }
    if (can.offset) {
      lines.push(`<b>Spawn point:</b> ${ANCHOR_WORDS[can.anchor] || ""}. `
        + "The blue crosshair is that point and it does not move — it is the game's, not "
        + "yours. The <b>orange handle beside it is the DRAWING</b>: drag that to move the "
        + "picture, and the dashed line between the two is the offset you are setting.");
      lines.push(`Drawing sits ${dx || dy ? `${dx > 0 ? "+" : ""}${dx}, ${dy > 0 ? "+" : ""}${dy} px from it`
                                          : "on the point, unmoved"}`
        + (deg ? ` · tilted ${deg > 0 ? "+" : ""}${deg}°` : ""));
    } else if (can.anchor) {
      // The point is still worth showing — it is where the art meets the world
      // — but this spawn site paints straight from the image and never reads
      // the nudge, so there is nothing to drag and saying so beats a handle
      // that quietly does nothing.
      lines.push(`<b>Spawn point:</b> ${ANCHOR_WORDS[can.anchor] || ""}. `
        + `<b>Nudge and tilt are not read here</b> — ${can.nudgeSite} paints this `
        + "drawing straight from the image, so only Size reaches the screen. "
        + "Match the art to the point by how it is drawn in the plate."
        + (dx || dy || deg ? ` (${dx}, ${dy}px${deg ? ` and ${deg}°` : ""} are stored on this `
          + "drawing and have no effect.)" : ""));
    }
  } else if (can) {
    lines.push(`<b>No size or position controls:</b> ${can.what}.`);
  }
  box.innerHTML = lines.join("<br>");
  // Folded shut, the summary still has to answer the question you would have
  // opened it for: who draws this. Everything else in there is detail you go
  // looking for; this is the bit you want at a glance.
  const val = $("usageVal");
  if (val) {
    const who = [...new Set(uses.map((u) => u.who))];
    val.textContent = who.length === 0 ? "spawned from code"
      : who.length === 1 ? who[0]
      : `${who[0]} +${who.length - 1}`;
  }

  // Offered only where there is an action to play: art fired by a move. A
  // stage hazard or a domain backdrop has no character animation to run it
  // against, and a button that opened an empty stage would be worse than no
  // button.
  const play = $("playEffectBtn");
  if (play) {
    const fires = isOther(state.char) ? firingUse(state.frame, state.effectsOwner) : null;
    play.hidden = !fires;
    if (fires) play.textContent = `▶ Play it in action — ${fires.name}`;
  }
}

// ---------------------------------------------------------- the effect player
//
// Opens over the bench, plays the move that fires this drawing, and writes the
// two placements straight back into the same adjustment record everything else
// on this page edits — so what it shows is the unsaved state, and what it
// changes exports with the rest.

const effectPreview = makeEffectPreview({
  canvas: $("effectStage"),
  read: () => {
    const meta = rawMeta(OTHER_KEY, state.frame) || {};
    return {
      dx: meta.dx ?? 0,
      dy: meta.dy ?? 0,
      scale: Number.isFinite(meta.renderScale) && meta.renderScale > 0 ? meta.renderScale : 1,
      rot: (meta.rotationDeg ?? 0) * Math.PI / 180,
      spawnOx: Number.isFinite(meta.spawnOx) ? meta.spawnOx : undefined,
      spawnOy: Number.isFinite(meta.spawnOy) ? meta.spawnOy : undefined,
      fadeIn: Number.isFinite(meta.fadeIn) && meta.fadeIn > 0 ? meta.fadeIn : 0,
    };
  },
  // `start` marks the first write of a drag, which is where the undo point
  // goes — exactly as setAttackBox does it for the box on the main canvas.
  write: (patch, start) => {
    if (start) pushHistory(OTHER_KEY, state.frame);
    Object.assign(rawMeta(OTHER_KEY, state.frame), patch);
    refreshControls();
    refreshUsageInfo();
    render();
  },
  onClose: () => { $("effectOverlay").hidden = true; },
});

function openEffectPreview() {
  const title = $("effectTitle");
  if (!effectPreview.open(state.frame, state.effectsOwner)) return;
  const u = effectPreview.use;
  title.textContent = `${u.name} — ${CHARACTERS[u.charKey]?.name || u.charKey}, ${u.state}`;
  refreshFadeIn();
  setHold(false);
  setDragTarget("drawing");
  $("effectOverlay").hidden = false;
}

/** Stop the clock, or start it again.
 *
 *  The player loops one pass of the move, and for a short-lived drawing the
 *  drawing is a small part of that pass: Miwa's Last Draw is on screen for
 *  0.5s of a 1.85s loop, so four fifths of every pass is an empty stage — which
 *  is indistinguishable from a preview that does not work, and is how a
 *  perfectly good playback got reported as a missing one. Held, the frame stays
 *  put and the scrubber walks the pass by hand; every control on the page goes
 *  on working against the frozen frame, which is the point. */
function setHold(on) {
  const btn = $("holdBtn"), range = $("scrubRange"), val = $("scrubVal");
  const held = effectPreview.hold(on);
  if (btn) btn.textContent = held ? "▶ Play" : "⏸ Hold";
  if (range) {
    range.disabled = !held;
    range.value = String(effectPreview.at);
  }
  if (val) val.textContent = held
    ? `${(effectPreview.at * effectPreview.cycle).toFixed(2)}s of ${effectPreview.cycle.toFixed(2)}s`
    : "playing";
}
/** The fade-in slider inside the player. Written straight onto the drawing's
 *  meta like every other adjustment, so it exports with the rest and the
 *  running preview picks it up on its next frame. */
function setFadeIn(seconds, start) {
  remember(OTHER_KEY, state.frame);
  if (start) pushHistory(OTHER_KEY, state.frame);
  const meta = rawMeta(OTHER_KEY, state.frame);
  if (!meta) return;
  if (seconds > 0) meta.fadeIn = Number(seconds.toFixed(2));
  else delete meta.fadeIn;
  refreshFadeIn();
  refreshControls();
  buildPoseList();
}

function refreshFadeIn() {
  const range = $("fadeInRange"), val = $("fadeInVal");
  if (!range) return;
  const held = rawMeta(OTHER_KEY, state.frame)?.fadeIn ?? 0;
  range.value = String(held);
  if (val) val.textContent = held > 0 ? `${held.toFixed(2)}s ramp` : "hard cut";
}

$("fadeInRange")?.addEventListener("input", (e) =>
  setFadeIn(Number(e.target.value), !fadeDragging(e)));
let fadeStarted = false;
const fadeDragging = () => (fadeStarted ? true : (fadeStarted = true, false));
$("fadeInRange")?.addEventListener("change", () => { fadeStarted = false; });
$("fadeInClear")?.addEventListener("click", () => { fadeStarted = false; setFadeIn(0, true); });

/** Which of the two markers a drag picks up.
 *
 *  They coincide until one of them is moved — a shot's drawing marker starts
 *  exactly on its muzzle — and the tie always went to the drawing, so the spawn
 *  point of anything nobody had nudged could not be grabbed at all. Saying
 *  which one is being moved also says, on the one screen where it matters, that
 *  they are two different numbers going to two different places. */
function setDragTarget(which) {
  const spawnable = effectPreview.spawnable;
  const now = effectPreview.prefer(spawnable ? which : "drawing");
  const draw = $("moveDrawingBtn"), spawn = $("moveSpawnBtn");
  if (draw) draw.classList.toggle("ghost--go", now === "drawing");
  if (spawn) {
    spawn.classList.toggle("ghost--go", now === "spawn");
    spawn.disabled = !spawnable;
    spawn.title = spawnable
      ? "The point the game spawns this from — exports as a note against the move"
      : "This action has no spawn point to move: its handler decides where the drawing goes";
  }
}

$("moveDrawingBtn")?.addEventListener("click", () => setDragTarget("drawing"));
$("moveSpawnBtn")?.addEventListener("click", () => setDragTarget("spawn"));
$("holdBtn")?.addEventListener("click", () => setHold(!effectPreview.held));
$("scrubRange")?.addEventListener("input", (e) => {
  effectPreview.at = Number(e.target.value);
  const val = $("scrubVal");
  if (val) val.textContent = `${(effectPreview.at * effectPreview.cycle).toFixed(2)}s`
    + ` of ${effectPreview.cycle.toFixed(2)}s`;
});

$("playEffectBtn")?.addEventListener("click", openEffectPreview);
$("effectClose")?.addEventListener("click", () => effectPreview.close());
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("effectOverlay").hidden) effectPreview.close();
});

function refreshTag() {
  const meta = rawMeta(state.char, state.frame);
  const states = statesUsing(state.char, state.frame);
  // `meta.faceLeft` is authoritative once assets are loaded — nativeLeft only
  // seeds it, so consulting the list here would keep saying "mirrored" after
  // the Mirror control turned it off.
  const left = !!meta?.faceLeft;
  $("frameTag").innerHTML = `${state.char}/${state.frame}` +
    (states.length ? ` <span class="state">${states.map(stateLabel).join(", ")}</span>` : "") +
    (left ? ` <span class="flag">mirrored</span>` : "");
}

/** The drawing's nudge, as numbers. Mirrors the canvas handle exactly — same
 *  field, same units — so whichever way you reach for it you are editing one
 *  thing. Fields rather than sliders: a nudge has no natural range (a scream
 *  wave wants tens of pixels, a lance wants sixty) and typing a number is the
 *  precise half of this pairing. */
function refreshNudge() {
  const x = $("nudgeXNum"), y = $("nudgeYNum"), val = $("nudgeVal");
  if (!x || !isOther(state.char)) return;
  const meta = rawMeta(OTHER_KEY, state.frame) || {};
  const dx = round1(meta.dx ?? 0), dy = round1(meta.dy ?? 0);
  if (document.activeElement !== x) x.value = String(dx);
  if (document.activeElement !== y) y.value = String(dy);
  if (val) val.textContent = dx || dy ? `${dx}, ${dy} px from the spawn point` : "on the spawn point";
}

function setNudge(patch) {
  remember(OTHER_KEY, state.frame);
  pushHistory(OTHER_KEY, state.frame);
  const meta = rawMeta(OTHER_KEY, state.frame);
  if (!meta) return;
  if (Number.isFinite(patch.dx)) meta.dx = round1(patch.dx);
  if (Number.isFinite(patch.dy)) meta.dy = round1(patch.dy);
  refreshNudge();
  refreshControls();
  buildPoseList();
  render();
}

$("nudgeXNum")?.addEventListener("change", (e) => setNudge({ dx: Number(e.target.value) }));
$("nudgeYNum")?.addEventListener("change", (e) => setNudge({ dy: Number(e.target.value) }));
$("nudgeClear")?.addEventListener("click", () => setNudge({ dx: 0, dy: 0 }));

function refreshControls() {
  refreshNudge();
  refreshHeadControl();
  refreshUpdatedControl();
  refreshSelfIdleOptions();
  refreshApprovalControl();
  refreshAutoTuneControl();
  const meta = rawMeta(state.char, state.frame);
  if (!meta) return;
  // syncAll snapshots the selected pose before calling this, so the original is
  // always here. Guarded anyway: this runs inside the repaint path, and a throw
  // here silently takes the canvas with it rather than failing visibly.
  const orig = state.originals[state.char]?.[state.frame];
  if (!orig) return;

  const rel = (meta.renderScale ?? 1) / (orig.renderScale || 1);
  setPair("scale", rel);
  const can = isOther(state.char) ? sharedControls(state.frame) : null;
  $("scaleVal").textContent = can
    ? `${(rel * 100).toFixed(1)}% of ${can.what}`
    : `${(rel * 100).toFixed(1)}% of delivered`;

  // A shared drawing is nudged in game pixels from the point it spawns on; a
  // pose is moved within its cell. Same two sliders, different fields.
  const other = isOther(state.char);
  const dx = other ? (meta.dx ?? 0) - (orig.dx ?? 0)
                   : (meta.ox ?? 0) - (orig.ox ?? 0);
  setPair("offset", dx);
  $("offsetVal").textContent = `${dx > 0 ? "+" : ""}${dx.toFixed(1)} px`
    + (other ? " from the spawn point" : "");

  // positive slider = sprite sits LOWER, which reads more naturally than the
  // underlying bodyBottom (where a bigger value lifts the art)
  // Live on an airborne pose too. It used to lock, on the reading that a pose
  // which never touches the floor has no floor contact to set — true, but it
  // still has to sit correctly against the HURTBOX, which does not move when
  // the fighter leaves the ground. Locking the control meant an air pose could
  // only ever sit where the import put it.
  //
  // The one pose it is still locked on is a ledge hang, and for the opposite
  // reason: there it does nothing at all. A ledge pose is hung from its grip
  // anchor onto the platform corner, and that arithmetic cancels `bodyBottom`
  // out entirely — so the slider would move, the number would change, and the
  // sprite would not. The grip anchor is what places it.
  const airborne = !other && isAirborneOnly(state.char, state.frame);
  const anchored = !other && isAnchorPlaced(state.char, state.frame);
  const dg = other ? (meta.dy ?? 0) - (orig.dy ?? 0)
                   : (orig.bodyBottom ?? 0) - (meta.bodyBottom ?? 0);
  setPair("ground", dg);
  $("groundVal").textContent = anchored
    ? "set by the grip anchor"
    : `${dg > 0 ? "+" : ""}${dg.toFixed(1)} px`
      + (airborne ? " · airborne" : other ? " down from the spawn point" : "");
  const deg = rawMeta(state.char, state.frame).rotationDeg ?? 0;
  setPair("rotation", deg);
  $("rotationVal").textContent = deg ? `${deg > 0 ? "+" : ""}${deg.toFixed(1)}°` : "square";

  $("groundGroup").classList.toggle("disabled", anchored);
  $("groundRange").disabled = anchored;
  $("groundNum").disabled = anchored;

  // A delete tag lives on the drawing rather than the pose, so it is read from
  // the variant option — but it presents as just another kind of "this art is
  // wrong", which is what it is.
  const deleting = isDeleteTagged(state.char, state.frame);
  const kind = deleting ? "delete" : replacementKind(meta);
  $("replaceBox").checked = !!kind;
  $("replaceKind").hidden = !kind;
  $("replaceKind").value = kind || REPLACEMENT_KINDS[0][0];
  $("replaceVal").textContent = kind ? kindLabel(kind).split(" — ")[0].toLowerCase() : "";
  // The note is refilled from the pose on every selection, so walking a list of
  // flagged poses shows each one's own description rather than carrying the
  // last one along. "delete" is a verdict on a file, not a brief for an artist,
  // so it is the one kind with nothing to describe.
  const noteBox = $("replaceNote");
  noteBox.hidden = !kind || kind === "delete";
  noteBox.value = meta[NOTE_FIELDS.needsReplacement] || "";
  noteBox.placeholder = kind === ALTERNATE_KIND
    ? "What should the alternate try instead? (optional)"
    : "What is wrong with it? (optional)";
  // Deleting the only drawing a pose has would leave a hole where a sprite
  // should be, so the option is not offered until there is something to fall
  // back to.
  const alternatives = poseVariants(state.char, state.frame).length > 1;
  for (const opt of $("replaceKind").options) {
    if (VARIANT_ONLY_KINDS.has(opt.value)) opt.hidden = !alternatives;
  }

  const want = improvementKind(meta);
  $("improveBox").checked = !!want;
  $("improveKind").hidden = !want;
  $("improveKind").value = want || IMPROVEMENT_KINDS[0][0];
  $("improveVal").textContent = want ? kindLabel(want, IMPROVEMENT_KINDS).split(" — ")[0].toLowerCase() : "";
  const wantNote = $("improveNote");
  wantNote.hidden = !want;
  wantNote.value = meta[NOTE_FIELDS.wantsImprovement] || "";

  const mirrored = !!meta.faceLeft;
  $("mirrorBox").checked = mirrored;
  $("mirrorVal").textContent = mirrored
    ? "flipped — art is drawn facing left"
    : "as delivered — art is drawn facing right";

  refreshAnchorControls();

  // counted across every character touched this session, since that is what
  // Export now emits
  let poses = 0, heads = 0, chars = 0, actions = 0, reviews = 0;
  for (const c of editedChars()) {
    const n = dirtyFrames(c).length;
    const headChanged = Math.abs(headHeight(c) - (state.originalHeads[c] ?? headHeight(c))) > 1e-4;
    const a = Object.keys(dirtyActions(c)).length;
    // Only the ticks that have something to say on their own: adjusting a pose
    // takes it off the updated list anyway, so counting that twice would
    // overstate what the export carries.
    const r = clearedUpdates(c).filter((pose) => !isDirty(c, pose)).length;
    if (n || headChanged || a || r) chars++;
    poses += n;
    actions += a;
    reviews += r;
    if (headChanged) heads++;
  }
  $("dirtyCount").textContent = poses || heads || actions || reviews
    ? [poses ? `${poses} pose${poses === 1 ? "" : "s"}` : "",
       heads ? `${heads} head height${heads === 1 ? "" : "s"}` : "",
       actions ? `${actions} action${actions === 1 ? "" : "s"}` : "",
       reviews ? `${reviews} reviewed` : ""].filter(Boolean).join(" + ")
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

  // The centre of mass is offered only where something turns about it. Where
  // nothing does, the row goes and a one-line reason takes its place, with the
  // override beside it — hidden, not removed, because "this pose never turns"
  // is a fact worth reading rather than a silently missing control.
  const id = `${state.char}/${state.frame}`;
  const forced = state.anchorForced.has(id);
  const pivots = names.includes("com");
  const drawnBy = statesUsingFrame(state.char, state.frame);
  $("anchorForceRow").hidden = pivots && !forced;
  $("anchorForce").checked = forced;
  $("anchorNote").textContent = pivots
    ? ""
    : drawnBy.length ? "the game draws this one square" : "nothing draws this one";

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
    const title = document.createElement("span");
    title.className = "anchor-title";
    title.textContent = meta.label ?? name;
    const val = document.createElement("span");
    val.className = "anchor-val";
    val.textContent = `${x.toFixed(1)}, ${y.toFixed(1)}`
      + (changed ? " · edited" : stored ? "" : " · derived");

    // Placing it is the handle on the canvas — the panel is the readout, and
    // the one thing the canvas has no gesture for: putting it back.
    const reset = document.createElement("button");
    reset.className = "ghost sm";
    reset.textContent = "Reset";
    reset.disabled = !changed;
    reset.onclick = () => resetAnchor(name);
    head.append(title, val, reset);

    row.append(head);
    wrap.appendChild(row);
  }

  // The anchors a pose carries vary, so its help is assembled rather than
  // written into the markup: the general rule, then a line per anchor.
  setHelp($("anchorLabel"), names.length
    ? "Drag the handle on the sprite to place it — <b>Centre of mass</b> under "
      + "the canvas shows and hides the handles. Anchors are stored "
      + "against the artwork, so later size, position and ground tweaks carry "
      + "them along.<br><br>"
      + names.map((n) => `<b>${ANCHOR_META[n]?.label ?? n}</b> — ${ANCHOR_META[n]?.hint ?? ""}`)
             .join("<br><br>")
    : "This pose carries no anchors.");
}

/** The intake marker on the selected pose, and the way off the list for a pose
 *  that turned out to need nothing. Shown wherever the pose is selected from,
 *  not only inside the updated list — "this art was replaced under you" is worth
 *  reading while tuning the pose it happened to. */
function refreshUpdatedControl() {
  const group = $("updatedGroup");
  if (!group) return;
  const note = updateNote(state.char, state.frame);
  group.hidden = !note;
  if (!note) {
    refreshReviewButton();
    return;
  }
  const reviewed = isUpdateReviewed(state.char, state.frame);
  $("updatedVal").textContent = reviewed ? "reviewed — clears on export"
    : note.how === "new" ? "new art — never placed"
    : note.how === "surfaced" ? "newly in the in-game list — never sized"
    // The two a shared drawing arrives with. Without them both fell through to
    // "tuning carried over", which describes a redraw that kept its numbers —
    // the opposite of a drawing that has never had any.
    : note.how === "unreviewed" ? "in the game — never placed"
    : note.how === "placed" ? "placed by a machine — never agreed with"
    : note.lost?.length ? "tuning rolled back" : "tuning carried over";
  $("updatedInfo").innerHTML = updateSummary(note);
  refreshReviewButton();
}

/** The one button that takes a pose off a to-do list without editing it.
 *
 *  Offered on ANY pose, not only one an intake round touched. A pose that is
 *  simply right needs a way to say so: before this, leaving the "no saved
 *  edits" list meant changing a number, so the only way to record "I looked at
 *  this and it needed nothing" was to nudge something that did not need
 *  nudging. Both lists ask the same question — has anyone decided about this
 *  pose — so one button answers it. */
function refreshReviewButton() {
  const group = $("updatedClearGroup");
  if (!group) return;
  const other = isOther(state.char);
  const note = updateNote(state.char, state.frame);
  const done = hasSavedEdits(state.char, state.frame);
  // SHARED ART GETS THE BUTTON TOO, wherever it is on the list. It was hidden
  // here before the shared set could BE on a list: sharedTodoNote came later,
  // and the gate it was written against was never revisited — so a drawing like
  // `stagefx:stage_flower` sat on "All Recently Updated Poses" with the panel
  // telling the reader to "mark it reviewed if it is already right" and no
  // button to do it with. The only way off was to change a number on a drawing
  // that did not need one, which is exactly what this button exists to avoid.
  //
  // What is still withheld is the no-saved-edits half. A shared drawing's
  // membership of that list IS "nobody has set a number against it", which is
  // the same fact its note carries, so offering "mark as done" where there is
  // no note would be answering a question nothing asked.
  group.hidden = other ? !note : (!note && done);
  if (group.hidden) return;
  const reviewed = isUpdateReviewed(state.char, state.frame);
  $("updatedClear").textContent = reviewed
    ? "↺ Put it back on the to-do list"
    : note
      ? "Mark reviewed — take it off the updated list"
      : "Mark as done — take it off the no-saved-edits list";
}

/** The approve/keep decision on a replacement the game is not drawing yet.
 *
 *  Deliberately two buttons rather than one: "approve" and "keep what we have"
 *  are both real answers, and a single button would make rejecting the new art
 *  the thing you do by NOT clicking — which is indistinguishable from not
 *  having got to it. */
/** Record that the waiting replacement has been decided about, either way.
 *
 *  `pending` comes off the option and the pose is marked reviewed, which is the
 *  same door every other updated-list entry leaves by. Both halves export:
 *  the option flag through `variantPlacement`, the review through
 *  `clearUpdated`. */
async function settleApproval(charKey, frameKey, approve) {
  const meta = rawMeta(charKey, frameKey);
  const note = meta?.awaitingApproval;
  if (!note) return;
  pushHistory(charKey, frameKey);

  // Both drawings become options on the pose before either wins. That is what
  // makes the decision reversible: the loser is a banked variant like any
  // other, with its own file and its own numbers, so switching back is the
  // same operation as switching between two alternates — and the answer can be
  // changed as often as you like without the pose losing either drawing.
  const pair = bankApprovalPair(charKey, frameKey, note, approve);
  delete meta.awaitingApproval;
  approvalSettled.set(`${charKey}/${frameKey}`, approve ? "approve" : "keep");
  remember(charKey, frameKey);
  if (!isUpdateReviewed(charKey, frameKey)) toggleUpdateReviewed(charKey, frameKey);
  // Keeping means the pose IS the drawing in play again — its file and every
  // number that belongs to that image. Field-by-field assignment left the
  // rejected drawing's own fields behind (and, worse, left its image in the
  // frame's slot), which is what drew the old art's numbers onto the new
  // picture and stretched it.
  if (!approve && pair?.live) await pointPoseAt(charKey, frameKey, pair.live);
  else syncAll();
}

/** Answer, then move on. Deciding is a pass down a list — a replacement is
 *  waiting on dozens of poses after a round — so the two buttons carry the
 *  step to the next pose with them rather than leaving it to be clicked. */
async function decideAndStep(charKey, frameKey, approve) {
  const at = poseEntries().findIndex((e) => e.char === charKey && e.frame === frameKey);
  await settleApproval(charKey, frameKey, approve);
  const list = poseEntries();
  if (!list.length) return;
  // The pose just answered may have left the list it was in — the updated list
  // is precisely the list a decision takes a pose off. When it has, the pose
  // that moved up into its place is the next one, not the one after that.
  const still = list.findIndex((e) => e.char === state.char && e.frame === state.frame);
  const next = still >= 0
    ? list[(still + 1) % list.length]
    : list[Math.min(Math.max(at, 0), list.length - 1)];
  if (next) selectPose(next.char, next.frame);
}

/** Swap the pose's answer after the fact, as many times as it takes. */
async function switchApproval(charKey, frameKey, approve) {
  const pair = approvalPairs.get(`${charKey}/${frameKey}`);
  if (!pair) return;
  pushHistory(charKey, frameKey);
  approvalSettled.set(`${charKey}/${frameKey}`, approve ? "approve" : "keep");
  labelApprovalPair(charKey, frameKey, approve);
  await pointPoseAt(charKey, frameKey, approve ? pair.delivered : pair.live);
}

/** The two drawings an approval decides between, by file, for every pose
 *  settled this session. */
const approvalPairs = new Map();

/** Bank the delivered drawing and the one in the game as options on the pose.
 *
 *  `tools/apply_sprite_adjustments.py` does the same thing when the export is
 *  applied, so what the session shows and what the file ends up holding are
 *  the same shape. Labels say which is which; `supersededAt` is what the
 *  Alternate sprite view sorts on. */
function bankApprovalPair(charKey, frameKey, note, approve) {
  const meta = rawMeta(charKey, frameKey);
  const live = note.live ? { ...note.live } : null;
  if (!meta?.file) return null;
  const entry = ((spriteManifest.variants ??= {})[charKey] ??= {})[frameKey]
    ??= { options: [] };
  const put = (option) => {
    const at = entry.options.findIndex((o) => o.file === option.file);
    if (at >= 0) entry.options[at] = { ...entry.options[at], ...option };
    else entry.options.push(option);
  };
  put({ ...takeBanked(meta), file: meta.file });
  if (live) put({ ...live });
  const pair = { delivered: meta.file, live: live?.file || null };
  approvalPairs.set(`${charKey}/${frameKey}`, pair);
  labelApprovalPair(charKey, frameKey, approve, note.at);
  return pair;
}

/** Which of the two drawings lost, in the words the apply script uses, so the
 *  session and the applied manifest describe the pose the same way. The loser
 *  carries the moment it lost, which is what the Alternate sprite view sorts
 *  on — so the comparison keeps answering "what is the other one". */
function labelApprovalPair(charKey, frameKey, approve, at) {
  const pair = approvalPairs.get(`${charKey}/${frameKey}`);
  const options = variantEntry(charKey, frameKey)?.options;
  if (!pair || !options) return;
  const stamp = at || new Date().toISOString();
  const mark = (file, lost, label) => {
    const option = options.find((o) => o.file === file);
    if (!option) return;
    option.label = label;
    if (lost) option.supersededAt = stamp;
    else delete option.supersededAt;
  };
  mark(pair.delivered, !approve, approve ? "Delivered" : "Not approved");
  mark(pair.live, approve, approve ? "Superseded" : "In game");
}

function refreshApprovalControl() {
  const group = $("approvalGroup");
  if (!group) return;
  const id = `${state.char}/${state.frame}`;
  const note = approvalNote(state.char, state.frame);
  const settled = approvalSettled.get(id);
  group.hidden = !note && !settled;
  if (group.hidden) return;

  // Two states, one group. Before an answer: the question and both answers.
  // After one: what was decided, and the other answer — a decision made by
  // looking at two drawings is one you change by looking again, and both
  // drawings are still on the pose either way.
  $("approvalAsk").hidden = !note;
  $("approvalDone").hidden = !!note;
  if (note) {
    // A staged fighter is not on the select screen, so "the game is drawing the
    // old one" is not true of them — nobody is drawing either. The decision is
    // still real: it settles which drawing the set carries when they ship.
    const staged = isStaged(state.char);
    $("approvalInfo").innerHTML =
      (staged
        ? "<b>The canvas is showing the new art</b> (the old one is <code>"
          + `${note.live?.file || "—"}</code>). This fighter is not on the `
          + "roster yet, so nothing is drawing either drawing today — "
          + "approving settles which one the set carries when they ship.<br>"
        : "<b>The canvas is showing the new art; the game is still drawing the old "
          + `one</b> (<code>${note.live?.file || "—"}</code>).<br>`)
      + "Place it, then decide. <b>Approve</b> lets it into the game with the "
      + "placement you have given it; <b>keep</b> leaves the old drawing in "
      + "play. Either answer takes the pose off the updated list, and either "
      + "can be changed afterwards — both drawings stay on the pose.";
    $("approvalLabel").textContent = "Replacement waiting";
    $("approvalState").textContent = staged ? "not on the roster yet" : "not in the game yet";
    return;
  }
  const approved = settled === "approve";
  const pair = approvalPairs.get(id);
  $("approvalLabel").textContent = "Replacement decided";
  $("approvalState").textContent = approved ? "the new art is in" : "the old art stays";
  $("approvalDoneInfo").innerHTML = approved
    ? `<b>Approved</b> — the pose draws <code>${state.frame && rawMeta(state.char, state.frame)?.file || "—"}</code>, `
      + `and <code>${pair?.live || "the drawing it replaced"}</code> is banked as an alternate.`
    : `<b>Kept</b> — the pose still draws <code>${pair?.live || "the old art"}</code>, `
      + `and <code>${pair?.delivered || "the replacement"}</code> is banked as an alternate.`;
  $("approvalSwitch").textContent = approved
    ? "Change to: keep the old art"
    : "Change to: approve the new art";
  $("approvalSwitch").disabled = !pair;
}

/** The auto-tune marker, in its own group so it shows on poses that carry no
 *  update marker at all — a brand-new character's set, for instance. */
function refreshAutoTuneControl() {
  const group = $("autoTunedGroup");
  if (!group) return;
  const summary = autoTuneSummary(state.char, state.frame);
  group.hidden = !summary;
  if (summary) $("autoTunedInfo").innerHTML = summary;
}

/** The dropdown entry carries its own count, so a round that overwrote work
 *  announces itself from the closed select rather than having to be opened. */
function refreshRecentOption() {
  const opt = $("charSel")?.querySelector(`option[value="${RECENT_KEY}"]`);
  if (!opt) return;
  const waiting = recentUpdates().filter((e) => !isUpdateReviewed(e.char, e.frame)).length;
  opt.textContent = waiting ? `${RECENT_LABEL} (${waiting})` : RECENT_LABEL;
  const flagged = $("charSel")?.querySelector(`option[value="${FLAGGED_KEY}"]`);
  if (!flagged) return;
  const open = flaggedPoses().length;
  flagged.textContent = open ? `${FLAGGED_LABEL} (${open})` : FLAGGED_LABEL;
}

/** Character-level, so it must update even when no pose is selected. */
function refreshHeadControl() {
  rememberHead(state.char);
  const hh = headHeight(state.char);
  const changed = Math.abs(hh - state.originalHeads[state.char]) > 1e-4;
  const cm = actorOf(state.char)?.heightCm;
  $("headRange").value = hh.toFixed(1);
  const source = hasHeightOverride(state.char)
    ? (changed ? "hand-set, changed" : "hand-set")
    : cm ? `from ${heightLabel(cm)}` : "no published height — reference default";
  $("headVal").textContent =
    `${hh.toFixed(1)} px · ${(heightRatio(state.char)).toFixed(3)}x · ${source}`;
  $("resetHead").disabled = !changed && !hasHeightOverride(state.char);
}

function buildPoseList() {
  const list = $("poseList");
  list.innerHTML = "";
  // The view filter is a question about one character's poses ("which of these
  // has nobody dealt with"). The updated list is already a filter, of a
  // different kind, so the select is locked while it is open rather than
  // silently ignored.
  $("viewSel").disabled = inList();
  if (inRecent()) { buildRecentPoseList(list); return; }
  if (inFlagged()) { buildFlaggedPoseList(list); return; }

  const frames = framesOf(state.char);
  const hidden = allFramesOf(state.char).length - frames.length;
  const flagged = frames.filter((k) => needsReplacement(state.char, k)).length;
  // The dimmed ones are counted separately and named for what they are waiting
  // on, so the number that matters — how many of these are actually yours to
  // place — can be read off the line rather than counted off the grid.
  // Counted before the grid is built so the line can name what is in it. The
  // approval count leads for the same reason charTodo leads with it: it is the
  // only one of these where the game is drawing something nobody has agreed to.
  const awaiting = frames.filter((k) => awaitingApproval(state.char, k)).length;
  $("poseCount").textContent = `${frames.length} shown`
    + (hidden > 0 ? ` · ${hidden} hidden` : "")
    + (awaiting > 0 ? ` · ${awaiting} awaiting approval` : "")
    + (flagged > 0 ? ` · ${frames.length - flagged} to place · ${flagged} awaiting redraw` : "");
  if (!frames.length) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "Nothing matches this view.";
    list.appendChild(empty);
  }
  const view = VIEWS[state.view] || VIEWS.unedited;
  for (const key of frames) {
    // In the effects list every cell has the same owner — the shared set — so
    // naming it under each one says nothing and repeats the key. What is worth
    // saying there is which MOVE draws it, since that is the question the view
    // was opened to answer, and one fighter can name the same art from two.
    list.appendChild(view.shared
      ? buildPoseEntry(OTHER_KEY, key, { sub: movesDrawing(key, state.effectsOwner || state.char) })
      : buildPoseEntry(state.char, key));
  }
}

/** One cell of the pose grid. Takes the character rather than reading
 *  `state.char`, because the updated list mixes several in one grid. */
function buildPoseEntry(charKey, key, { owner = false, sub: subOverride = null } = {}) {
  remember(charKey, key);
  const options = poseVariants(charKey, key);
  // A pose with a choice of drawings is a cell plus a chevron, so the two
  // jobs stay separate: the cell still selects the pose, and only the chevron
  // opens the menu. Wrapping every cell instead would change the grid for the
  // 90% of poses that have exactly one drawing.
  const host = options.length > 1 ? document.createElement("div") : null;
  if (host) host.className = "pose-cell";

  const b = document.createElement("button");
  const label = frameLabel(charKey, key);
  // In the updated list a pose has to say whose it is: two characters can have
  // an `idle_a`, and the pose name alone would be the same cell twice. The key
  // goes with it rather than `label.sub`, which on an undrawn cell is a remark
  // ("unused") rather than the pose's name.
  const sub = subOverride ?? (owner ? `${actorOf(charKey).name} · ${key}` : label.sub);
  b.innerHTML = sub ? `${label.name}<i class="pose-file">${sub}</i>` : label.name;
  const states = statesUsing(charKey, key);
  const doomed = hasDeleteTag(charKey, key);
  // The dimmed cells need to say WHY they are dim, or they read as disabled.
  const requested = redrawPending(charKey, key) && !doomed;
  b.title = (owner ? `${charKey}/${key}` : key)
    + (states.length ? ` — ${states.map(stateLabel).join(", ")}` : " — not drawn by any state")
    + (requested ? " — ⚠ new art is on order for this pose; placing it now is"
                 + " optional, the replacement is measured from scratch" : "")
    + (awaitingApproval(charKey, key)
        ? " — a replacement has landed and is NOT in the game: stand the two"
          + " side by side and approve or reject it" : "");
  const selected = charKey === state.char && key === state.frame;
  // THE TWO THINGS THE CHARACTER DOT COUNTS, said per pose. The dropdown marks
  // a fighter with work left and names the reason in its tooltip, but the grid
  // said nothing about WHICH poses, so the dot pointed at a set of 47 cells.
  // `charTodo` orders them the same way: art the game is not drawing yet
  // because nobody has picked, then poses nobody has placed.
  const awaiting = awaitingApproval(charKey, key);
  const unplaced = isUsed(charKey, key) && !hasSavedEdits(charKey, key);
  b.className = (selected ? "sel " : "")
    + (isDirty(charKey, key) || variantFlagEdits.has(`${charKey}/${key}`) ? "dirty " : "")
    + (needsReplacement(charKey, key) || doomed ? "flagged " : "")
    + (wantsImprovement(charKey, key) ? "wanted " : "")
    + (requested ? "warned " : "")
    + (awaiting ? "awaiting " : "")
    + (unplaced ? "unplaced " : "")
    + (isUpdateReviewed(charKey, key) ? "reviewed" : "");
  const kind = doomed ? "delete" : replacementKind(rawMeta(charKey, key));
  if (kind) b.dataset.kind = kind;
  const want = improvementKind(rawMeta(charKey, key));
  if (want) b.dataset.want = want;
  b.onclick = () => selectPose(charKey, key);
  // The caution mark, in the corner rather than in the label: the pose is still
  // perfectly editable — a request can sit unanswered for rounds — and this is
  // a heads-up, not a barrier. The dimming says the same thing quietly; this
  // says it at a glance, which is what you want before starting work on a pose.
  if (requested) {
    const warn = document.createElement("i");
    warn.className = "pose-warn";
    // The glyph is drawn by CSS rather than set here, so it stays out of the
    // cell's textContent — the pose name is how a cell is found, in the arrow
    // and Tab walks and in the smoke test alike, and a mark that joined the
    // text would rename every pose it lands on.
    warn.setAttribute("aria-label", "new art on order");
    b.appendChild(warn);
  }
  // The confirm step, marked where the work is chosen. Top LEFT, because the
  // top right already carries the redraw caution and a pose can be in both
  // states at once — new art has landed AND a further redraw is on order. Same
  // reason the glyph is drawn by CSS: a mark that joined the cell's text would
  // rename the pose for every arrow walk and every smoke test that finds it by
  // name.
  if (awaiting) {
    const badge = document.createElement("i");
    badge.className = "pose-awaiting";
    badge.setAttribute("aria-label", "replacement awaiting approval");
    b.appendChild(badge);
  }

  if (!host) return b;
  host.appendChild(b);
  host.appendChild(buildVariantChevron(key, options, charKey));
  return host;
}

/** The cross-character list of poses an intake round overwrote. */
function buildRecentPoseList(list) {
  const entries = recentUpdates();
  const reviewed = entries.filter((e) => isUpdateReviewed(e.char, e.frame)).length;
  const retune = entries.filter((e) => e.lost.length).length;
  const surfaced = entries.filter((e) => e.how === "surfaced").length;
  const fresh = entries.filter((e) => e.how === "new").length;
  $("poseCount").textContent = entries.length
    ? `${entries.length} updated`
      + (retune ? ` · ${retune} to re-tune` : "")
      + (fresh ? ` · ${fresh} new` : "")
      + (surfaced ? ` · ${surfaced} newly in game` : "")
      + (reviewed ? ` · ${reviewed} reviewed` : "")
    : "none";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "Nothing is waiting. Poses land here when intake delivers "
      + "art — a new pose that has never been placed, or new art written over a "
      + "pose that already had work on it — and leave as each one is tuned or "
      + "marked reviewed.";
    list.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    list.appendChild(buildPoseEntry(entry.char, entry.frame, { owner: true }));
  }
}

/** The cross-character list of poses flagged for a redraw. */
function buildFlaggedPoseList(list) {
  const entries = flaggedPoses();
  const byKind = new Map();
  for (const e of entries) byKind.set(e.kind, (byKind.get(e.kind) || 0) + 1);
  // The kind's own label carries its explanation after a dash — right on the
  // flag's menu, far too long for a tally of seven. The word before the dash is
  // the name of the kind.
  const kindWord = (k) => kindLabel(k).split("—")[0].trim().toLowerCase();
  $("poseCount").textContent = entries.length
    ? `${entries.length} to redraw · `
      + [...byKind].map(([k, n]) => `${n} ${kindWord(k)}`).join(" · ")
    : "none";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "Nothing is flagged. Poses land here when the drawing is "
      + "marked as needing to be drawn again, and leave when the flag is cleared "
      + "or the pose is pointed at a drawing that works — choosing a good "
      + "alternate is a fix, not a request, so it is not asked for again.";
    list.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    list.appendChild(buildPoseEntry(entry.char, entry.frame, { owner: true }));
  }
}

/** Drawings a delivery has just put on this pose that nobody has looked at.
 *
 *  An alternate arrives without changing what the game draws — that is the
 *  point of asking for one — so nothing about the pose looks different and it
 *  would sit unopened forever. The dot is the only thing saying there is a
 *  choice waiting. Cleared by `intake_variants.py`'s marker lifecycle: adjust
 *  the pose or mark it reviewed and both the dot and the updated-list entry go.
 */
function freshOptions(charKey, frameKey) {
  return poseVariants(charKey, frameKey).filter((o) => o.fresh);
}

/** The far-right chevron on a pose that has more than one drawing. Opens a menu
 *  of them; picking one swaps which art the pose uses, bringing that image's own
 *  placement with it. */
function buildVariantChevron(frameKey, options, charKey = state.char) {
  const chev = document.createElement("button");
  chev.className = "pose-variant";
  chev.textContent = "⌄";
  const fresh = freshOptions(charKey, frameKey).length;
  if (fresh) {
    chev.classList.add("has-fresh");
    chev.setAttribute("data-fresh", fresh);
  }
  chev.title = `${options.length} drawings for ${frameKey}`
    + (fresh ? ` — ${fresh} new, not looked at yet` : "");
  chev.setAttribute("aria-label", `Choose the drawing for ${frameKey}`);
  chev.onclick = (e) => {
    e.stopPropagation();     // the cell behind it selects the pose; this does not
    openVariantMenu(chev, frameKey, options, charKey);
  };
  return chev;
}

function closeVariantMenu() {
  document.querySelector(".variant-menu")?.remove();
  document.removeEventListener("mousedown", onVariantOutside, true);
}

function onVariantOutside(e) {
  if (!e.target.closest(".variant-menu, .pose-variant")) closeVariantMenu();
}

function openVariantMenu(anchor, frameKey, options, charKey = state.char) {
  const existing = document.querySelector(".variant-menu");
  closeVariantMenu();
  if (existing?.dataset.frame === frameKey) return;   // second click closes it

  const menu = document.createElement("div");
  menu.className = "variant-menu";
  menu.dataset.frame = frameKey;
  for (const opt of options) {
    const row = document.createElement("button");
    row.className = (opt.current ? "current " : "")
      + (opt.fresh ? "fresh " : "")
      + (opt.needsReplacement === "delete" ? "doomed" : "");
    // The file is the identity of a drawing, so it is shown rather than hidden
    // behind a label — two options can reasonably share a label.
    row.innerHTML = `<span class="variant-label">${opt.label || "Untitled"}</span>`
      + `<i class="variant-file">${opt.file}</i>`;
    row.onclick = (e) => {
      e.stopPropagation();
      closeVariantMenu();
      if (charKey !== state.char) selectPose(charKey, frameKey);
      chooseVariant(charKey, frameKey, opt.file);
    };
    menu.appendChild(row);
  }
  const box = anchor.getBoundingClientRect();
  menu.style.left = `${Math.min(box.left, window.innerWidth - 300)}px`;
  menu.style.top = `${box.bottom + 4}px`;
  document.body.appendChild(menu);
  document.addEventListener("mousedown", onVariantOutside, true);
}

// Arrow keys walk the pose list as the GRID it is drawn as: left/right by one,
// up/down by a row. The column count is read off the laid-out list rather than
// hard-coded, so changing `.pose-list`'s CSS cannot make the keys disagree with
// what is on screen.
/** The next or previous pose in the grid, wrapping at either end.
 *
 *  Wrapping rather than stopping: the point is to walk a whole set without
 *  looking at the keyboard, and a step that silently does nothing at the last
 *  cell reads as the key having failed. */
function stepPose(delta) {
  const list = poseEntries();
  if (list.length < 2) return;
  const at = list.findIndex((e) => e.char === state.char && e.frame === state.frame);
  const next = list[((at < 0 ? 0 : at + delta) + list.length) % list.length];
  if (next) selectPose(next.char, next.frame);
}

const ARROW_STEP = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

function poseColumns() {
  const list = $("poseList");
  const cols = getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length;
  return Math.max(1, cols);
}

/** What the pose grid currently holds, in the order it is drawn — one
 *  character's filtered poses, or the whole roster's updated ones. The arrow
 *  keys walk this, so they cannot disagree with what is on screen. */
function poseEntries() {
  if (inRecent()) return recentUpdates().map((e) => ({ char: e.char, frame: e.frame }));
  if (inFlagged()) return flaggedPoses().map((e) => ({ char: e.char, frame: e.frame }));
  return framesOf(state.char).map((frame) => ({ char: state.char, frame }));
}

/** Move the selection by [dx, dy] grid cells. Clamped, not wrapped: running off
 *  the end of a 30-pose list back to the start loses your place. */
function movePose([dx, dy]) {
  const entries = poseEntries();
  if (entries.length < 2) return;
  const cols = poseColumns();
  const i = entries.findIndex((e) => e.char === state.char && e.frame === state.frame);
  // A pose the current view hides has no place in the grid, so start from the
  // top rather than from -1.
  const next = i < 0 ? 0 : clampNum(i + dx + dy * cols, 0, entries.length - 1);
  if (next === i) return;
  selectPose(entries[next].char, entries[next].frame);
  scrollPoseIntoView();
}

/** Select a pose from the grid. In the updated list the next pose can belong to
 *  a different character, which means switching character underneath — its art
 *  has to be streamed, and everything else in the panel is keyed to it. */
function selectPose(charKey, frameKey) {
  state.actionRow = null;
  // Picking a drawing out of the effects list edits it in the shared set, but
  // must not close the fighter you were reading it against. Remember whose list
  // it is on the way through — every route to a shared drawing from that view
  // comes past here, the cells and the arrow keys alike.
  if (VIEWS[state.view]?.shared && isOther(charKey) && !isOther(state.char)) {
    state.effectsOwner = state.char;
  }
  if (charKey !== state.char) { openChar(charKey, frameKey); return; }
  state.frame = frameKey;
  syncAll();
}

/** Keep the selection visible when the keys walk past the end of the list. */
function scrollPoseIntoView() {
  const btn = $("poseList").querySelector("button.sel");
  btn?.scrollIntoView({ block: "nearest" });
}

// Every path that changes the selected pose ends here — the pose list, the
// arrow keys, undo/redo, a view change, `?frame=` — so asking the loader for
// the current frame in one place covers all of them. It is a no-op once that
// frame is in memory.
function syncAll() {
  // The SELECTED pose has to be snapshotted here, not left to buildPoseList:
  // the list is view-filtered, so a pose the current view hides — arrived at by
  // `?frame=`, or by the view changing under it — would never be remembered,
  // and refreshControls would then throw on the missing original and abort the
  // whole repaint. That is what made mirroring look like it did nothing.
  remember(state.char, state.frame);
  rememberAnims(state.char);
  applyPanelMode();
  buildActionRows();
  buildPoseList();
  refreshTag();
  refreshControls();
  rememberInUrl();
  if (isOther(state.char)) {
    const key = state.frame;
    // A creature whose art is a pose set has nothing under its own key, so the
    // resting pose is asked for too — that is the drawing it stands for.
    loadSharedImage(key)
      .then((ok) => (ok || !key.startsWith("summon:") || key.split(":").length !== 2
        ? ok : loadSharedImage(`${key}:idle_a`)))
      .then(() => { sharedTried.add(key); refreshUsageInfo(); render(); });
  }
  else charLoader.prioritize(state.frame);
  refreshLoadState();
  render();
}

/** The dropdown selects either a character or the updated list; `state.group`
 *  is which, so the select can be re-pointed from anywhere that moves the
 *  selection (undo, a deep link, a pose in another character's set). */
function syncCharSelect() {
  // `effectsOwner` outranks `char` for the same reason `group` does: the
  // dropdown names the SET you are working through, and while the effects list
  // is open that is a fighter's kit, even though the drawing being edited lives
  // in the shared set. "Choso" beside "Effects this fighter uses" is the whole
  // sentence; flipping to "Other Sprites" on the first click broke it in half.
  $("charSel").value = state.group || state.effectsOwner || state.char;
}

/** Open a fighter's effects list: the LIST is theirs, and the drawing selected
 *  out of it is edited in the shared set, which is the only place a shared
 *  drawing's numbers exist. Both halves are set here so no caller has to know
 *  about the split. False when their kit draws no shared art at all — then
 *  there is no list, and the caller opens them the ordinary way. */
function openEffectsOf(charKey) {
  const first = effectsOf(charKey)[0];
  if (!first) return false;
  state.effectsOwner = charKey;
  openChar(OTHER_KEY, first);
  return true;
}

/** Pick a real character. */
function setChar(charKey, wantFrame = null) {
  state.group = null;
  state.effectsOwner = null;
  defaultSelfIdleMode("comparison");
  // The effects view survives a change of character — it is a view, and the new
  // fighter has a kit too — but everything it lists belongs to the shared set,
  // so the selection has to go there. Otherwise the fighter is left selected
  // against an `effect:` key that means nothing in their own sprite sheet: no
  // cell highlights and the canvas draws a pose they do not have.
  if (!wantFrame && VIEWS[state.view]?.shared && !isOther(charKey)
      && openEffectsOf(charKey)) return;
  openChar(charKey, wantFrame);
}

/** Open the cross-character updated list, on `wantChar/wantFrame` if that pose
 *  is on it and on the first entry otherwise. An empty list leaves the pose on
 *  screen alone: there is nothing to select, and blanking the canvas to say so
 *  would be worse than the note in the list. */
function setRecent(wantChar = null, wantFrame = null) {
  openList(RECENT_KEY, recentUpdates(), wantChar, wantFrame);
}

/** Open the cross-character flagged list, on the same terms. */
function setFlagged(wantChar = null, wantFrame = null) {
  openList(FLAGGED_KEY, flaggedPoses(), wantChar, wantFrame);
}

/** Both lists open the same way, so they cannot drift apart: land on the pose
 *  asked for if it is on the list, on the first entry otherwise, and leave the
 *  pose on screen alone when the list is empty — blanking the canvas to say
 *  "nothing here" would be worse than the note in the list itself. */
function openList(key, entries, wantChar, wantFrame) {
  state.group = key;
  state.effectsOwner = null;   // a cross-character list is nobody's effects list
  defaultSelfIdleMode("alternate");
  const target = entries.find((e) => e.char === wantChar && e.frame === wantFrame) || entries[0];
  if (target) { openChar(target.char, target.frame); return; }
  // At boot there is no pose yet to stay on, so the character asked for is
  // opened — an empty list must not leave a blank canvas.
  if (state.frame) { syncCharSelect(); syncAll(); }
  else openChar(wantChar && allFramesOf(wantChar).length ? wantChar : "gojo", wantFrame);
}

// `wantFrame` is the pose to open on — the action workbench's `?frame=`
// hand-off. It has to be known HERE rather than applied afterwards, because
// this is what tells the loader which frame to fetch first; setting it later
// would mean downloading the default idle and then the pose you asked for.
function openChar(charKey, wantFrame = null) {
  state.char = charKey;
  state.actionRow = null;   // an action preview belongs to the character it was opened from
  syncCharSelect();   // also called from ?char= and undo, not just the select
  const frames = framesOf(charKey);
  const fallback = allFramesOf(charKey);
  state.frame = fallback.includes(wantFrame) ? wantFrame
    : frames.includes("idle_a") ? "idle_a"
    : frames[0] ?? (fallback.includes("idle_a") ? "idle_a" : fallback[0]);
  frames.forEach((k) => remember(charKey, k));
  rememberHead(charKey);
  rememberSpan(charKey);
  // Art for this character may not be here yet; the panels are driven by the
  // manifest, so everything except the canvas is correct immediately. Shared
  // sprites are fetched one at a time in syncAll instead — there is no bundle.
  if (!isOther(charKey)) charLoader.start(charKey, state.frame);
  syncAll();
}

/** Keep the address bar pointing at what is on screen, so a reload — or a link
 *  handed to someone else — comes back to the same character and pose instead
 *  of resetting to Gojo's idle. `replaceState`, not `pushState`: flipping
 *  through poses should not fill the back button with every one you glanced at.
 *
 *  `?frame=` started as a one-shot hand-off from the action workbench; writing
 *  it continuously costs nothing, because boot validates it against the
 *  character's own frames and falls back to the idle if it does not belong. */
function rememberInUrl() {
  const url = new URL(location.href);
  // `char` is always the real character, so a link opens on the right sprite
  // set whether or not the updated list is what it was reached through; `list`
  // says which of the two the dropdown was on.
  const list = inRecent() ? "updated" : inFlagged() ? "flagged" : null;
  // The VIEW is part of where you are, and it was the one thing not written
  // down: a reload of a fighter's effects list came back as Other Sprites on
  // the default filter, which is neither the drawing you were on nor the list
  // you were working through. `owner` is the other half — while the effects
  // list is open the drawing lives in the shared set and the LIST belongs to a
  // fighter, so both have to be said or the pair cannot be rebuilt.
  const view = state.view === "unedited" ? null : state.view;
  const owner = state.effectsOwner || null;
  const same = (k, v) => (url.searchParams.get(k) || null) === v;
  if (same("char", state.char) && same("frame", state.frame)
      && same("list", list) && same("view", view) && same("owner", owner)) return;
  url.searchParams.set("char", state.char);
  for (const [k, v] of [["frame", state.frame], ["list", list],
                        ["view", view], ["owner", owner]]) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  history.replaceState(null, "", url);
}

// Streams the current character's frames, selected pose first. Every arrival
// repaints, because the pose on screen may be the one that just landed.
const charLoader = makeCharLoader({
  onFirst: () => { refreshLoadState(); render(); },
  onFrame: () => { refreshLoadState(); render(); },
  onDone: () => refreshLoadState(),
});

function refreshLoadState() {
  const el = $("loadState");
  if (!el) return;
  const waiting = charLoader.waiting;
  const left = charLoader.remaining;
  el.classList.toggle("spinning", waiting);
  el.classList.toggle("done", !waiting && left === 0);
  el.textContent = waiting ? `loading ${state.char}…`
    : left ? `${state.char}: ${left} more frame${left === 1 ? "" : "s"}…`
    : "assets loaded";
}

// --- edits. `commit` marks a discrete action worth an undo entry.

function applyScale(relative, commit) {
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  // A shared sprite has no head-height reference to pin — nothing is solved
  // from it — and its scale multiplies the height its kit declares.
  if (isOther(state.char)) {
    // Nothing to re-fold: a shared drawing's size is applied where it is
    // painted (paintedHeight, src/shared_sprites.js), so writing the number
    // here IS the edit, in the game's arithmetic as well as this canvas's.
    rawMeta(state.char, state.frame).renderScale = Math.max(0.02, (orig.renderScale ?? 1) * relative);
    refreshControls(); buildPoseList(); render();
    return;
  }
  // Sheet cells carry no `renderScale` at all — the renderer treats a missing
  // one as 1. Reading it raw yields undefined, and `undefined * relative` is
  // NaN, which sticks: once written it poisons the slider and every later edit.
  // Pinned BEFORE the write: the idle's own size is a per-pose adjustment like
  // any other, so the character's scale reference freezes at what it was.
  pinHeightSpan(state.char, state.frame);
  rawMeta(state.char, state.frame).renderScale =
    Math.max(0.02, (orig.renderScale ?? 1) * relative);
  applyHeightScale(state.char);
  refreshControls(); buildPoseList(); render();
}

function applyOffset(dx, commit) {
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  // A shared drawing has no `ox`: it is not placed in a cell, it is painted at
  // a point the spawn site owns. `dx` is a nudge in GAME pixels away from that
  // point, read at every draw site in src/shared_sprites.js.
  if (isOther(state.char)) {
    rawMeta(state.char, state.frame).dx = round1((orig.dx ?? 0) + dx);
    refreshControls(); buildPoseList(); render();
    return;
  }
  rawMeta(state.char, state.frame).ox = (orig.ox ?? 0) + dx;
  refreshControls(); buildPoseList(); render();
}

/** The pose's own tilt, in degrees about its centre of mass. Unlike the other
 *  three this is an ABSOLUTE value rather than a delta from the delivered art:
 *  a drawing has no inherent tilt to be relative to, so 0 means square. */
function applyRotation(deg, commit) {
  if (commit) pushHistory(state.char, state.frame);
  const meta = rawMeta(state.char, state.frame);
  if (Math.abs(deg) < 1e-4) delete meta.rotationDeg;
  else meta.rotationDeg = Number(deg.toFixed(2));
  // A tilted pose turns about its centre of mass, so the anchor stops being
  // decorative the moment this is nonzero — refreshAnchorControls picks that up.
  refreshControls(); buildPoseList(); render();
}

function applyGround(dy, commit) {
  // Shared sprites first: the slider reads as "how far down the drawing sits",
  // and for these that is exactly `dy` — positive down, in game pixels.
  if (isOther(state.char)) {
    const orig = state.originals[state.char][state.frame];
    if (commit) pushHistory(state.char, state.frame);
    rawMeta(state.char, state.frame).dy = round1((orig.dy ?? 0) + dy);
    refreshControls(); buildPoseList(); render();
    return;
  }
  if (isAnchorPlaced(state.char, state.frame)) return;   // see refreshControls
  // Airborne poses are NOT excluded. They have no floor contact, but they do
  // have a hurtbox — the same standing box, which does not move when a fighter
  // leaves the ground — and the body has to sit inside it. This used to return
  // early on `isAirborneOnly`, while refreshControls() and the help text had
  // already been changed to say the control was live: the slider moved, the
  // readout changed, and nothing happened to the sprite. Only `ledge` is
  // genuinely inert, and it is locked in refreshControls() with a reason.
  const orig = state.originals[state.char][state.frame];
  if (commit) pushHistory(state.char, state.frame);
  // slider reads as "how far down the sprite sits", so invert onto bodyBottom
  pinHeightSpan(state.char, state.frame);   // see applySize
  rawMeta(state.char, state.frame).bodyBottom = (orig.bodyBottom ?? 0) - dy;
  applyHeightScale(state.char);
  refreshControls(); buildPoseList(); render();
}

/** Flag this pose's ART as wrong, and say WHAT is wrong with it — a wholesale
 *  redraw and a crop fix are very different asks. The kind is the flag's value,
 *  so there is one field rather than a boolean plus a reason that could
 *  disagree with it. It rides along with the placement values through export
 *  and apply_sprite_adjustments.py; tools/list_replacements.py collects the
 *  flagged poses for the asset request list, and intake clears the flag when
 *  the new art lands. */
function applyNeedsReplacement(kind) {
  pushHistory(state.char, state.frame);
  const meta = rawMeta(state.char, state.frame);
  const option = currentOption(state.char, state.frame);

  // "Delete variant" is a statement about one DRAWING, so it is stored on the
  // variant option. The other kinds are statements about the pose's art in
  // general and stay on the pose, where the request collectors already read
  // them. The two are mutually exclusive: art being thrown away is not also
  // being redrawn.
  if (option) {
    const had = option.needsReplacement === "delete";
    if (kind === "delete") option.needsReplacement = "delete";
    else if (had) delete option.needsReplacement;
    if (had !== (kind === "delete")) {
      variantFlagEdits.add(`${state.char}/${state.frame}`);
    }
  }
  if (kind === "delete") delete meta.needsReplacement;
  else if (kind) meta.needsReplacement = kind;
  else delete meta.needsReplacement;
  if (!kind || kind === "delete") delete meta[NOTE_FIELDS.needsReplacement];

  refreshControls(); buildPoseList(); refreshTag(); render();
}

/** The free text beside a flag: what is actually wrong with this drawing.
 *
 *  Stored on the pose next to the flag it explains, and banked with the drawing
 *  (VARIANT_REVIEW) because it describes one image — switching to the other
 *  drawing must not leave a note about the naginata attached to a redraw that
 *  fixed it. Clearing the flag clears the note with it: a description of a
 *  fault nobody is claiming any more is just stale text nobody will re-read. */
function applyNote(field, text, charKey, frameKey) {
  const meta = rawMeta(charKey, frameKey);
  if (!meta) return;
  const trimmed = (text || "").trim();
  if ((meta[field] || "") === trimmed) return;
  pushHistory(charKey, frameKey);
  if (trimmed) meta[field] = trimmed;
  else delete meta[field];
  buildPoseList(); refreshTag();
}

/** "This art works, but it could be better." A lower-priority ask than a
 *  replacement, kept separate so a wish-list item never sits in the same queue
 *  as a pose that is actually wrong. */
function applyWantsImprovement(kind) {
  pushHistory(state.char, state.frame);
  const meta = rawMeta(state.char, state.frame);
  if (kind) meta.wantsImprovement = kind;
  else delete meta.wantsImprovement;
  if (!kind) delete meta[NOTE_FIELDS.wantsImprovement];
  refreshControls(); buildPoseList(); refreshTag(); render();
}

/** Mirror this frame. The sheets are drawn facing right; a frame the artist
 *  drew facing left is flipped so the fighter always looks where they are
 *  going. `nativeLeft` in the manifest seeded these, but it guesses — this is
 *  the per-frame override, and it exports with everything else. */
function applyMirror(on) {
  pushHistory(state.char, state.frame);
  rawMeta(state.char, state.frame).faceLeft = on;
  // A shared drawing is flipped once, where it is read, and the flipped copy
  // is cached — so an edit here has to drop that copy or the canvas would go
  // on showing the old direction.
  if (isOther(state.char)) forgetSharedMirror(state.frame);
  refreshControls(); buildPoseList(); refreshTag(); render();
}

function applyAnchor(name, x, y, commit) {
  if (commit) pushHistory(state.char, state.frame);
  setAnchor(state.char, state.frame, name, x, y);
  refreshControls(); buildPoseList(); render();
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

// ------------------------------------------------------------------ boot

/** Sliders fire continuously; commit one undo entry per drag, not per pixel. */
function bindSlider(id, apply) {
  const el = $(id);
  let dragging = false;
  el.addEventListener("pointerdown", () => { dragging = false; heldRange = id; });
  el.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!dragging) { dragging = true; apply(v, true); } else apply(v, false);
  });
  const release = () => { dragging = false; if (heldRange === id) heldRange = null; };
  el.addEventListener("change", release);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("blur", release);
}

/** The track a pointer is currently on, if any.
 *
 *  The one thing the elastic range must never do is resize the track somebody
 *  is dragging: the thumb is pinned to a position, so moving the ends moves the
 *  value under the hand. While a track is held it may only grow. */
let heldRange = null;

// Each placement control is a slider paired with the number it sets. The number
// is what the nudge buttons used to be for, only better: it reads out the exact
// value, and a figure noted on one pose can be typed straight into the next.
//
// `PAIRS` holds the conversion, because the size control is stored as a ratio
// and shown as a percentage. Everything else is the identity.
const PAIRS = {
  scale: { show: (v) => v * 100, store: (v) => v / 100, digits: 1 },
  offset: { show: (v) => v, store: (v) => v, digits: 1 },
  ground: { show: (v) => v, store: (v) => v, digits: 1 },
  rotation: { show: (v) => v, store: (v) => v, digits: 1 },
};

/** Write a value to both halves of a pair, without either echoing back. */
function setPair(name, value) {
  const p = PAIRS[name];
  // A pose saved with a value beyond the default span must not snap back to the
  // end of the track when it is selected — and one saved INSIDE it should get
  // the ordinary track back rather than inheriting a range the last pose grew.
  fitRange(`${name}Range`, value);
  $(`${name}Range`).value = value.toFixed(3);
  const num = $(`${name}Num`);
  // Leave a field being typed in alone: rewriting it would fight the caret and
  // turn "1" into "1.0" before the second digit arrives.
  if (document.activeElement !== num) num.value = p.show(value).toFixed(p.digits);
}

function bindPair(name, apply) {
  const p = PAIRS[name];
  bindSlider(`${name}Range`, apply);
  const num = $(`${name}Num`);
  const commit = () => {
    const shown = parseFloat(num.value);
    if (!Number.isFinite(shown)) { refreshControls(); return; } // junk: put it back
    // The typed number wins. Some sprites genuinely need more offset than the
    // slider's default span — Mei Mei's run needs ox past -500 — and clamping
    // to the slider silently threw those edits away. The track is refitted
    // around whatever was typed instead, so it can still be dragged from there
    // — and shrinks back to its authored span once the value is inside it.
    const v = p.store(shown);
    fitRange(`${name}Range`, v);
    apply(v, true);
  };
  num.addEventListener("change", commit);
  num.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { commit(); num.blur(); }
    // Arrow keys belong to the number field while it has focus; the pose-list
    // navigation must not steal them mid-edit.
    e.stopPropagation();
  });
}

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** The span each track was authored with, captured before anything moves it.
 *  Read lazily, which is safe because nothing else writes min/max — every
 *  change goes through fitRange below. */
const rangeDefaults = new Map();
function defaultSpan(el) {
  if (!rangeDefaults.has(el.id)) {
    rangeDefaults.set(el.id, { min: parseFloat(el.min), max: parseFloat(el.max) });
  }
  return rangeDefaults.get(el.id);
}

/**
 * THE TRACK IS A VIEW OF THE VALUE, not a limit on it.
 *
 * A slider spanning every value anything might ever want is a slider with no
 * resolution where the work actually happens: Size covered 40–220% so the 90%
 * to 110% that most poses live in was a few pixels of travel. The track covers
 * the usual span instead, and the number box is the way out of it — type a
 * value past the end and the track grows to reach it, type one back inside and
 * it returns to the authored span.
 *
 * It only ever GROWS while a track is being dragged, because the thumb is
 * pinned to a position: narrowing the ends under a moving hand would change
 * the value being set. Nothing here touches a stored number — the value is
 * whatever was typed either way, and this is only how far the track reaches.
 */
function fitRange(rangeId, value) {
  const el = $(rangeId);
  if (!el) return;
  const def = defaultSpan(el);
  // Rounded outward to something the track can show sensibly: whole units on a
  // pixel or degree slider, twentieths on Size, which works in multipliers.
  // A HELD TRACK IS LEFT ALONE ENTIRELY. Dragging cannot produce a value off
  // the track — the input clamps it — so there is nothing to grow for, and
  // growing anyway feeds back: a wider track moves the value under a thumb that
  // has not moved, which widens it again. The first version crept from 3.35 to
  // 3.65 over three drag steps doing exactly that.
  if (heldRange === el.id) return;
  const step = (def.max - def.min) < 10 ? 0.05 : 1;
  // Rounded through the step and then to a sane number of places: `x / 0.05`
  // is not exact in binary, and a max of "3.6500000000000004" ends up in the
  // DOM attribute where anybody can read it.
  const out = (v, dir) => {
    const q = (dir < 0 ? Math.floor(v / step) : Math.ceil(v / step)) * step;
    return Number(q.toFixed(step < 1 ? 2 : 0));
  };
  const pad = Math.max(Math.abs(value) * 0.1, (def.max - def.min) * 0.05);
  el.min = String(value < def.min ? out(value - pad, -1) : def.min);
  el.max = String(value > def.max ? out(value + pad, 1) : def.max);
}

async function boot() {
  // The picker cannot see the panels around it (it is a leaf, by design), so
  // the one thing it needs from them arrives here: repaint the pose list and
  // the controls after a drawing is tagged from a tile.
  initSpritePicker({ onFlagChanged: () => { buildPoseList(); refreshControls(); } });
  // Same arrangement for the shared-drawing viewer: it draws and it edits, and
  // the two things it cannot reach — the panel and the whole canvas — come to
  // it from here.
  initSharedArt({
    afterEdit: () => { refreshControls(); buildPoseList(); render(); },
    repaint: render,
  });
  const charSel = $("charSel");
  // The fighters, alphabetically — the dropdown is something you go to a known
  // name in, and roster order is only meaningful on the select screen. Then a
  // rule, and under it the entries that are not fighters: an actor with its own
  // sprite set (Mahoraga), the shared effect and summon art, and the
  // cross-character work list, which is not a sprite set at all.
  const fighters = [...WB_FIGHTERS]
    .sort((a, b) => CHARACTERS[a].name.localeCompare(CHARACTERS[b].name));
  for (const key of fighters) {
    const o = document.createElement("option");
    o.value = key;
    // A staged fighter says so. Their poses edit and approve like anyone's, but
    // an approval here decides what the art will be rather than what a player
    // sees, and the label is the only place that difference is visible.
    o.dataset.name = CHARACTERS[key].name + (isStaged(key) ? " (not on the roster yet)" : "");
    o.textContent = o.dataset.name;
    charSel.appendChild(o);
  }
  // A disabled option rather than an <hr>: it is the separator every browser
  // renders, and being unselectable it cannot be landed on by keyboard either.
  const rule = document.createElement("option");
  rule.disabled = true;
  rule.textContent = "──────────";
  charSel.appendChild(rule);
  for (const key of [...ACTOR_KEYS, OTHER_KEY, RECENT_KEY, FLAGGED_KEY]) {
    const o = document.createElement("option");
    o.value = key;
    o.dataset.name = key === RECENT_KEY ? RECENT_LABEL
      : key === FLAGGED_KEY ? FLAGGED_LABEL
      : isOther(key) ? OTHER_LABEL
      : `${actorOf(key).name} (not a fighter)`;
    o.textContent = o.dataset.name;
    charSel.appendChild(o);
  }
  charSel.onchange = () =>
    (charSel.value === RECENT_KEY ? setRecent()
      : charSel.value === FLAGGED_KEY ? setFlagged()
      : setChar(charSel.value));

  $("updatedClear").onclick = () => toggleUpdateReviewed(state.char, state.frame);

  // Picker: the backdrop and Close dismiss it, Escape does too, and a plain
  // click anywhere drops the right-click enlargement.
  const picker = $("spritePicker");
  picker?.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined) closeSpritePicker();
    else closePickerPreview();
  });
  picker?.addEventListener("contextmenu", (e) => {
    if (!e.target.closest(".picker-tile")) { e.preventDefault(); closePickerPreview(); }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || $("spritePicker").hidden) return;
    e.stopPropagation();
    closeSpritePicker();
  }, true);

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

  bindPair("scale", applyScale);
  bindPair("offset", applyOffset);
  bindPair("ground", applyGround);
  bindPair("rotation", applyRotation);
  bindSlider("headRange", applyHead);
  $("resetHead").onclick = () => {
    pushHeadHistory(state.char);
    restoreHeadHeight(state.char);
    refreshControls(); buildPoseList(); render();
  };

  // ---- on-canvas anchor editing. Grabbing near a handle selects it, so an
  // anchor can be picked up directly instead of via the panel first.
  canvas.addEventListener("pointerdown", (e) => {
    if (!state.frame) return;
    const p = eventToCanvas(e);
    // WHICH OF THE OVERLAPPING THINGS DID YOU MEAN.
    //
    // A shared drawing can have four grab targets and they legitimately sit on
    // top of one another: the hit circle starts centred on the spawn crosshair,
    // the drawing handle starts there too, and the circle's INTERIOR covers all
    // of it. Every previous attempt here fixed one pair and broke another — the
    // circle's centre swallowed the crosshair, then the circle's interior
    // swallowed the drawing handle — because each was a special case rather
    // than a rule.
    //
    // The rule: EXPLICIT MARKERS BEAT BULK AREA, and among markers the nearest
    // wins. A marker is a thing drawn as a handle at a point; the bulk area is
    // the circle's fill, which is a convenience for big shapes and must never
    // outrank something somebody aimed at.
    if (isOther(state.char)) {
      const v = sharedView();
      const showHit = $("showHurtbox")?.checked && v?.hit?.shape === "circle" && !v.hit.melee;
      const c = showHit ? hitCentreOnCanvas(v) : null;
      const r = showHit ? v.hit.r * v.hitAdj.scale * v.z : 0;
      const rim = showHit ? hitHandles(c, r) : null;
      const canOffset = !!sharedControls(state.frame)?.offset;

      const markers = [];
      if (rim) {
        markers.push({ at: rim.move, take: "hit-move" });
        markers.push({ at: rim.size, take: "hit-size" });
      }
      if (canOffset && v) {
        markers.push({ at: spawnHome(), take: "spawn" });
        markers.push({ at: drawingHome(v), take: "drawing" });
      }
      let best = null;
      for (const m of markers) {
        const d = Math.hypot(m.at.x - p.x, m.at.y - p.y);
        if (d <= HANDLE_R * 2.4 && (!best || d < best.d)) best = { ...m, d };
      }
      // Nothing aimed at, but inside the circle: move the circle. Last, so it
      // can never take a gesture meant for a handle sitting on top of it.
      if (!best && showHit && Math.hypot(p.x - c.x, p.y - c.y) < r) best = { take: "hit-move" };

      if (best?.take === "hit-move" || best?.take === "hit-size") {
        state.dragHit = { mode: best.take === "hit-size" ? "size" : "move",
                          grabX: p.x, grabY: p.y, hit: { ...v.hitAdj }, started: false };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (best?.take === "spawn" || best?.take === "drawing") {
        state.dragSpawn = { grabX: p.x, grabY: p.y, meta: rawMeta(state.char, state.frame) };
        pushHistory(state.char, state.frame);
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      // A creature's attack box is the one shape with no marker of its own —
      // it is a rectangle you grab by its body and size by its corner.
      if (canPlaceAttack(state.frame) && $("showHurtbox")?.checked) {
        const bx = attackBoxOnCanvas(state.frame);
        const corner = bx && Math.hypot(p.x - (bx.x + bx.w), p.y - (bx.y + bx.h)) <= HANDLE_R * 2.2;
        const inside = bx && p.x >= bx.x && p.x <= bx.x + bx.w && p.y >= bx.y && p.y <= bx.y + bx.h;
        if (corner || inside) {
          state.dragAttack = { mode: corner ? "size" : "move", grabX: p.x, grabY: p.y,
                               box: attackBoxOf(state.frame), rect: bx.rect, started: false };
          canvas.setPointerCapture(e.pointerId);
          e.preventDefault();
        }
      }
      return;
    }
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
    if (state.dragAttack) {
      const p = eventToCanvas(e);
      const d = state.dragAttack;
      const dx = (p.x - d.grabX) / d.rect.w;
      const dy = (p.y - d.grabY) / d.rect.h;
      const box = { ...d.box };
      if (d.mode === "move") {
        box.x = clampNum(d.box.x + dx, -1, 1);
        box.y = clampNum(d.box.y - dy, 0, 1.5);
      } else {
        // The corner drags the far edge, so the box grows away from its centre
        // in both axes at once — two numbers from one gesture.
        box.w = clampNum(d.box.w + dx * 2, 0.05, 2);
        box.h = clampNum(d.box.h + dy * 2, 0.05, 2);
      }
      setAttackBox(state.frame, box, !d.started);
      d.started = true;
      return;
    }
    if (state.dragHit) {
      const p = eventToCanvas(e);
      const d = state.dragHit;
      const v = sharedView();
      if (!v) return;
      const z = v.z || state.zoom;
      if (d.mode === "move") {
        // Written as an offset from the PICTURE (`ownDx`/`ownDy`), which is
        // what makes it stay on the part of the drawing it was put on when the
        // drawing is moved afterwards.
        const sx = v.mirror ? -1 : 1;
        setSharedHit(state.frame, {
          ...d.hit,
          dx: round1(d.hit.ownDx + sx * (p.x - d.grabX) / z),
          dy: round1(d.hit.ownDy + (p.y - d.grabY) / z),
        }, !d.started);
      } else {
        // The rim drags the radius directly: how far the pointer is from the
        // centre, over the kit's own number, is the multiplier.
        const c = hitCentreOnCanvas(v);
        const want = Math.hypot(p.x - c.x, p.y - c.y) / z;
        setSharedHit(state.frame, {
          dx: d.hit.ownDx, dy: d.hit.ownDy,
          scale: clampNum(+(want / v.hit.r).toFixed(3), 0.1, 4),
        }, !d.started);
      }
      d.started = true;
      return;
    }
    if (state.dragSpawn) {
      const p = eventToCanvas(e);
      const d = state.dragSpawn;
      // THE PICTURE FOLLOWS THE POINTER. It used to do the opposite: the handle
      // was the spawn point, the spawn point does not move, so dragging it
      // right pushed the art LEFT beneath it. That was a defensible reading of
      // "the point belongs to the game" and a bad handle — the thing under the
      // pointer stayed still and the thing you were editing slid the other way,
      // which on a big drawing behind a fighter looked like nothing happening
      // at all. The picture has its own handle now (drawDrawingPoint) and both
      // it and the crosshair drag the same way: toward the pointer.
      //
      // Divided by the VIEW zoom — the one the drawing is actually painted at,
      // smaller than the slider's whenever a big drawing has been fitted —
      // because dx/dy are game pixels. Mirrored where the picture is, since
      // render.js applies dx inside the as-fired flip.
      const meta = d.meta;
      const view = sharedView();
      const z = view?.z || state.zoom;
      const sx = view?.mirror ? -1 : 1;
      meta.dx = round1((meta.dx ?? 0) + sx * (p.x - d.grabX) / z);
      meta.dy = round1((meta.dy ?? 0) + (p.y - d.grabY) / z);
      d.grabX = p.x; d.grabY = p.y;
      refreshControls(); buildPoseList(); render();
      return;
    }
    if (!state.dragging || !state.anchor) return;
    const p = eventToCanvas(e);
    const [lx, ly] = canvasToLocal(state.char, state.frame, p.x, p.y);
    applyAnchor(state.anchor, lx, ly, false);
  });
  const endDrag = (e) => {
    if (state.dragAttack) {
      state.dragAttack = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
      render();
      return;
    }
    if (state.dragHit) {
      state.dragHit = null;
      refreshControls();
      render();
    }
    if (state.dragSpawn) {
      state.dragSpawn = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
      render();
      return;
    }
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
    const wasEffects = !!VIEWS[state.view]?.shared;
    state.view = viewSel.value;
    const nowEffects = !!VIEWS[state.view]?.shared;
    // Leaving the effects list goes back to the fighter it belonged to. The
    // dropdown has been naming them the whole time, so anything else would have
    // the view change move the character too — and it would land on `__other`,
    // which is the set you were trying not to be dumped into.
    if (wasEffects && !nowEffects && state.effectsOwner) {
      const owner = state.effectsOwner;
      state.effectsOwner = null;
      openChar(owner);
      return;
    }
    // Entering it from a fighter: same split, made now rather than on the first
    // click, so the view is coherent from the moment it is chosen.
    if (!wasEffects && nowEffects && !isOther(state.char)
        && openEffectsOf(state.char)) return;
    // move to a visible pose when the filter hides the current one, but keep it
    // selected when the filter matches nothing at all — better a stale canvas
    // than a blank one
    const visible = framesOf(state.char);
    if (visible.length && !visible.includes(state.frame)) state.frame = visible[0];
    syncAll();
  };

  $("mirrorBox").onchange = (e) => applyMirror(e.target.checked);
  const kindSel = $("replaceKind");
  for (const [key, label] of REPLACEMENT_KINDS) {
    const o = document.createElement("option");
    o.value = key; o.textContent = label;
    kindSel.appendChild(o);
  }
  // Not a kind of request — the opposite of one. Every other entry says "draw
  // this again"; this one says "there is already a drawing for it", and points
  // the pose at a sprite the character has. It sits in this menu because this
  // is where you are when you have decided the drawing is wrong.
  const borrow = document.createElement("option");
  borrow.value = BORROW_OPTION;
  borrow.textContent = "Choose new sprite — draw this pose with another of this character's";
  kindSel.appendChild(borrow);
  // ticking the box asks for the kind currently shown, which defaults to a
  // wholesale replace — the safest ask when nothing more specific is chosen
  $("replaceBox").onchange = (e) =>
    applyNeedsReplacement(e.target.checked ? kindSel.value : null);
  kindSel.onchange = () => {
    if (kindSel.value !== BORROW_OPTION) return applyNeedsReplacement(kindSel.value);
    // A menu entry that opens a picker, not a value: put the menu back to what
    // the pose actually says before anything is chosen, so cancelling leaves
    // no trace.
    refreshControls();
    openSpritePicker({
      title: `${frameLabel(state.char, state.frame).name} — choose a sprite to draw it with`,
      sub: `${actorOf(state.char).name} · this pose keeps its own size and placement`,
      current: rawMeta(state.char, state.frame)?.file,
      currentPose: state.frame,
      onPick: (file, d) => borrowDrawing(state.char, state.frame, d),
    });
  };

  const wantSel = $("improveKind");
  for (const [key, label] of IMPROVEMENT_KINDS) {
    const o = document.createElement("option");
    o.value = key; o.textContent = label;
    wantSel.appendChild(o);
  }
  $("improveBox").onchange = (e) =>
    applyWantsImprovement(e.target.checked ? wantSel.value : null);
  wantSel.onchange = () => applyWantsImprovement(wantSel.value);

  // Committed on blur rather than per keystroke: every edit pushes an undo entry,
  // and one per character would make Cmd-Z walk back through a sentence.
  //
  // The pose is captured on FOCUS, not read at commit time. Clicking straight
  // from the box onto another pose fires the change event *after* the selection
  // has already moved, so reading `state.frame` then filed the note against
  // whichever pose you had just clicked — the one thing a per-sprite note must
  // never do.
  for (const [id, field] of [["replaceNote", NOTE_FIELDS.needsReplacement],
                             ["improveNote", NOTE_FIELDS.wantsImprovement]]) {
    const box = $(id);
    let owner = null;
    box.onfocus = () => { owner = { char: state.char, frame: state.frame }; };
    box.onchange = () => {
      const who = owner || { char: state.char, frame: state.frame };
      applyNote(field, box.value, who.char, who.frame);
      owner = null;
    };
    // Enter commits and leaves; Escape puts back what was there.
    box.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); box.blur(); }
      if (e.key === "Escape") {
        const who = owner || { char: state.char, frame: state.frame };
        box.value = rawMeta(who.char, who.frame)?.[field] || "";
        owner = null;
        box.blur();
      }
      e.stopPropagation();      // the pose grid listens for arrows and letters
    };
  }

  // Both answers clear `pending` and mark the pose reviewed, which is what
  // takes it off the updated list; they differ only in whether the art swaps.
  // The clearing is local until exported, like every other change here.
  $("approveBtn").onclick = () => decideAndStep(state.char, state.frame, true);
  $("approvalSwitch").onclick = () =>
    switchApproval(state.char, state.frame,
                   approvalSettled.get(`${state.char}/${state.frame}`) !== "approve");
  $("keepBtn").onclick = () => decideAndStep(state.char, state.frame, false);

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
  // NOTHING ON THIS PAGE IS SAVED, and a reload takes the session with it. That
  // is the design --- the manifest belongs to the repository and an export is
  // how an edit reaches it --- but it made losing work silent, and a REVIEW TICK
  // is the easiest thing to lose: it leaves no mark on the canvas, so eight
  // poses ticked done and never exported look exactly like eight poses somebody
  // already landed. Yaga's idle and two of Kashimo's came back a second time
  // for exactly that reason, and nothing had gone wrong that anybody could see.
  //
  // The browser will not show custom text here any more, so the message is for
  // the record rather than the user; what matters is that the dialog appears at
  // all, and only when there is something to lose.
  window.addEventListener("beforeunload", (e) => {
    if (!unexportedWork()) return;
    e.preventDefault();
    e.returnValue = "";
  });
  $("copyBtn").onclick = async () => {
    if (!$("exportOut").value) exportAll();
    try { await navigator.clipboard.writeText($("exportOut").value); $("copyBtn").textContent = "Copied"; }
    catch { $("exportOut").select(); }
    setTimeout(() => ($("copyBtn").textContent = "Copy to clipboard"), 1200);
  };
  ["selfIdleMode", "showGuides", "showBox", "showHurtbox", "showAnchors"]
    .forEach((id) => ($(id).onchange = () => { refreshSelfIdleOptions(); render(); }));

  // Which of this pose's other drawings the comparison stands beside. The
  // picker is the one already used for choosing art — same tiles, and here
  // choosing changes nothing about the pose, only what it is shown against.
  $("altPick").onclick = () => {
    const choices = altCandidates(state.char, state.frame);
    if (choices.length < 2) return;
    openSpritePicker({
      title: `${frameLabel(state.char, state.frame).name} — compare against`,
      sub: `${actorOf(state.char).name} · ${choices.length} other drawings of this pose`,
      current: altCompare()?.file,
      drawings: choices,
      onPick: (file) => {
        altPicked.set(`${state.char}/${state.frame}`, file);
        const chosen = choices.find((c) => c.file === file);
        if (chosen && !chosen.img) loadSpriteFile(file).then((ok) => { if (ok) render(); });
        render();
      },
    });
  };
  $("anchorForce").onchange = () => {
    const id = `${state.char}/${state.frame}`;
    if ($("anchorForce").checked) state.anchorForced.add(id);
    else state.anchorForced.delete(id);
    refreshAnchorControls(); render();
  };
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
    // Anything you can type into keeps its own arrow keys.
    const tag = e.target.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT" || tag === "INPUT") return;

    // The arrows walk the POSE GRID. Stepping through poses and adjusting a
    // couple of things on each is the workflow this tool exists for, so it gets
    // the keys; anchors are dragged on the canvas or typed into their own
    // fields, and placement has a typeable number beside every slider.
    // Tab walks the grid in READING order — the next pose, wrapping at the end
    // — where the arrows walk it geometrically. Stepping straight through a
    // character's set one pose at a time is the commonest pass there is, and it
    // is the one movement the arrows cannot do in a single key: the last cell of
    // a row needs Down-then-Home. Nothing on this page needs focus tabbing; the
    // controls are all reachable by mouse and by their own shortcuts.
    if (e.key === "Tab") {
      e.preventDefault();
      stepPose(e.shiftKey ? -1 : 1);
      return;
    }

    const dir = ARROW_STEP[e.key];
    if (!dir) return;
    e.preventDefault();
    movePose(dir);
  });

  initTooltips();
  fitStageCanvas(canvas);

  // The manifest alone — every number the panels show, and everything
  // warmAnchors needs. Sprite art follows per character, so opening the
  // workbench no longer means downloading the whole roster to edit one pose.
  await loadCoreAssets();
  // Actors own a full sprite set and are edited here like anyone else, so their
  // shipped centres of mass have to be resolved before any of these controls
  // can move the numbers those defaults are derived from.
  warmAnchors([...WB_FIGHTERS, ...ACTOR_KEYS]);
  $("loadState").textContent = "manifest loaded";
  markEditedChars();
  refreshRecentOption();

  const params = new URLSearchParams(location.search);
  const wanted = params.get("char");
  // The same set the dropdown offers. Restricting the deep link to fighters
  // made Mahoraga selectable but not linkable, which is backwards: a
  // non-fighter is exactly what someone needs a link to, having no card or
  // roster tile to find it by.
  const selectable = [...WB_FIGHTERS, ...ACTOR_KEYS, OTHER_KEY];
  const startChar = selectable.includes(wanted) ? wanted : "gojo";

  // `?frame=` lets the action workbench hand off a specific pose to edit. It is
  // resolved BEFORE setChar so the pose you were sent to is the one fetched
  // first, rather than fetching the default idle and then discarding it.
  const frame = params.get("frame");
  const wantedFrame = frame && allFramesOf(startChar).includes(frame) ? frame : null;
  // `?list=updated` / `?list=flagged` come back to the cross-character list
  // rather than to the character the pose happens to belong to — which list you
  // were working through is as much a part of where you were as which pose is
  // selected.
  const startList = params.get("list");
  // `?view=` restores the filter, and with it the one view whose selection is
  // not a pose of the character in the dropdown: `?owner=` names the fighter
  // whose effects list was open, so a reload of "Choso · Effects this fighter
  // uses · aura_crimson" comes back as all three rather than as Other Sprites
  // on the default filter. Validated against the real sets, so a stale link
  // falls back rather than opening something broken.
  const startView = params.get("view");
  if (VIEWS[startView]) {
    state.view = startView;
    $("viewSel").value = startView;
  }
  const owner = params.get("owner");
  const startOwner = VIEWS[state.view]?.shared && WB_FIGHTERS.includes(owner) ? owner : null;

  if (startList === "updated") setRecent(startChar, wantedFrame);
  else if (startList === "flagged") setFlagged(startChar, wantedFrame);
  else if (startOwner) {
    state.effectsOwner = startOwner;
    openChar(OTHER_KEY, wantedFrame);
  } else setChar(startChar, wantedFrame);
  if (wantedFrame) {
    const btn = $("poseList").querySelector("button.sel");
    if (btn) $("poseList").scrollTop = Math.max(0, btn.offsetTop - $("poseList").clientHeight / 2);
  }

  // The size benchmark is Gojo's idle standing beside whatever you are editing,
  // so it is needed on every character, not just his. Fetched alongside the
  // first character rather than as part of it — it is one frame, and waiting on
  // it would delay the pose you actually came to look at.
  loadBenchmarkFrame();
  refreshHistoryButtons();

  // A read-only window onto the two questions the flagged list turns on, for
  // tools/smoke_workbench.mjs. The rule it checks — a pose reassigned to a
  // drawing that works is not asked for again — is invisible on screen: both
  // the listed and the unlisted pose look like an ordinary cell, and the only
  // way to test it from the DOM would be to stage a fixture in the manifest.
  // Same shape as `window.__render3d`, and nothing here mutates.
  window.__spriteWorkbench = {
    flaggedPoses, allFlagBearingPoses, needsReplacement,
    // The updated list and what an export would carry, for the one rule that
    // has no DOM either: a shared drawing marked reviewed has to leave by the
    // export, not just by dimming on screen.
    recentUpdates, payloadFor,
    // The player itself, for the coverage check: it opens each drawing, walks
    // the loop with the clock held, and asks whether anything was painted.
    effectPreview,
    // Who draws each shared drawing, and whether that use is a dead stand-in.
    // The smoke asserts every drawing the game really shows has an action to
    // play; the ones nothing shows are the exception it has to be able to see.
    sharedUsage: () => Object.fromEntries([...sharedUsage()].map(([k, v]) => [k, v])),
    // Where the hit circle and its two handles are on the canvas right now.
    // Read-only, and here for the same reason the flag predicates are: a
    // draggable shape drawn on a canvas has no DOM for a test to grab, so
    // without this a smoke can only click at coordinates it guessed.
    /** The spawn crosshair and the drawing's own handle, for the same reason. */
    spawnPoint: () => (isOther(state.char) ? spawnHome() : null),
    drawingPoint: () => {
      const v = isOther(state.char) ? sharedView() : null;
      return v ? drawingHome(v) : null;
    },
    /** The creature attack box on the canvas, and where it is stored. */
    attackBox: () => (isOther(state.char) && canPlaceAttack(state.frame)
      ? { rect: attackBoxOnCanvas(state.frame), storedOn: attackBoxKey(state.frame) } : null),
    hitGeometry() {
      const v = isOther(state.char) ? sharedView() : null;
      if (!v?.hit || v.hit.shape !== "circle" || v.hit.melee) return null;
      const c = hitCentreOnCanvas(v);
      const r = v.hit.r * v.hitAdj.scale * v.z;
      const h = hitHandles(c, r);
      return { cx: c.x, cy: c.y, r, move: h.move, size: h.size, adj: { ...v.hitAdj } };
    },
  };
}

boot();
