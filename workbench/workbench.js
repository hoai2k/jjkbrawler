// Sprite Workbench — live editor for per-frame renderScale, horizontal offset
// and ground-contact height.
//
// Everything is drawn through the GAME'S OWN modules (assets.js, sprites.js,
// characters.js, render.js), and adjustments mutate the very manifest objects
// the renderer reads. So the preview can never drift from what the game shows,
// and any fix applied elsewhere in the pipeline appears here immediately.

import {
  loadCoreAssets, loadFrame, frameImage, spriteManifest, sharedSpriteKeys, loadSharedImage, getImage,
} from "../src/assets.js";
import {
  drawCharFrame, anchorLocal, anchorsForFrame, statesUsingFrame, isAirborneOnly, animsOf,
  anchorScreenPos, screenPosToLocal, warmAnchors, EXTRA_ANCHORS,
  REPLACEMENT_KINDS, replacementKind, IMPROVEMENT_KINDS, improvementKind,
  variantsOf, VARIANT_PLACEMENT, VARIANT_ONLY_KINDS,
} from "../src/sprites.js";
import { drawPlatformShape } from "../src/render.js";
import { CHARACTERS, CHARACTER_KEYS, SPRITE_ACTORS, getActor } from "../src/characters.js";
import { TRANSFORM_POSES } from "../src/config_transform.js";
import {
  headHeightTarget, applyHeightScale, hasHeightOverride, heightRatio, measuredIdleSpan,
} from "../src/heights.js";
import { initTooltips, setHelp } from "./tooltip.js";
import { makeCharLoader, frameLoaded } from "./lazy_sprites.js";

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
const EDITABLE = ["renderScale", "ox", "bodyBottom", "faceLeft", "needsReplacement", "wantsImprovement"];
// Fields whose VALUE is a kind string rather than a number, so a change of kind
// is a change and `false` means "cleared" rather than "unset".
const KIND_FIELDS = { needsReplacement: replacementKind, wantsImprovement: improvementKind };
// Fields that are true/false rather than a number, so comparison and export
// treat them differently (and `false` is a meaningful value, not "unset").
const BOOLEAN_FIELDS = new Set(["faceLeft"]);

// What the pose list shows. These filter on what is SAVED in the codebase, not
// on what you have done since the page loaded — "unedited" means "no adjustment
// has been committed for this pose yet", so it is a to-do list of poses nobody
// has dealt with. Working on a pose must not remove it from that list mid-edit;
// the dot beside it is what says you have touched it. See hasSavedEdits().
const VIEWS = {
  unedited: { label: "No saved edits (to do)", keep: (c, k) => isUsed(c, k) && !hasSavedEdits(c, k) },
  edited: { label: "Has saved edits (done)", keep: (c, k) => hasSavedEdits(c, k) },
  used: { label: "Used in game", keep: (c, k) => isUsed(c, k) },
  all: { label: "All sprites", keep: () => true },
};
// Two kinds of entry in the character list are not fighters.
//
// SPRITE_ACTORS (Mahoraga) own a full sprite set and are drawn exactly like a
// fighter, so everything here works on them unchanged — they simply have no
// kit. Their poses are listed from TRANSFORM_POSES even before any art exists,
// so the set can be tracked as it arrives rather than appearing all at once.
//
// "Other Sprites" is the shared effect/summon art. It has no per-frame
// placement data at all — the code that spawns each one decides its size and
// position — so the placement half of the panel does not apply to it and is
// hidden. What it supports is looking at the art and flagging it.
// A sheet cell usually serves several states at once, so the pose list needs
// one of them to name it by. Order is "what was this cell drawn as": movement
// before the attacks that borrow it, because on the original 4x5 sheets row 1
// is the run row and row 4 the crouch row, and those cells are sprint and
// crouch poses that attacks were later pointed at for want of anything better.
const STATE_ORDER = [
  "idle", "run", "dash", "crouch", "crouchAttack", "jump", "fall", "land",
  "ledge", "shield", "dodge", "dodge_roll", "dodge_air",
  "light", "airLight", "sideHeavy", "upHeavy", "downHeavy", "charge",
  "specialNeutral", "specialSide", "specialDown", "ult", "hurt", "dizzy",
  "win", "respawn",
];

const STATE_LABELS = {
  idle: "Idle", run: "Run", dash: "Dash", crouch: "Crouch",
  crouchAttack: "Crouch attack", jump: "Jump", fall: "Fall", land: "Land",
  ledge: "Ledge hang", shield: "Guard", dodge: "Dodge", dodge_roll: "Dodge roll",
  dodge_air: "Air dodge", light: "Light attack", airLight: "Air attack",
  sideHeavy: "Side heavy", upHeavy: "Up heavy", downHeavy: "Down heavy",
  charge: "Charge", specialNeutral: "Special · neutral",
  specialSide: "Special · side", specialDown: "Special · down",
  ult: "Ultimate", hurt: "Hurt", dizzy: "Dizzy", win: "Victory",
  respawn: "Respawn platform",
};

const stateLabel = (name) => STATE_LABELS[name] || name;
const stateRank = (name) => {
  const i = STATE_ORDER.indexOf(name);
  return i < 0 ? STATE_ORDER.length : i;
};

/** The state a frame is named by: the first one in STATE_ORDER that draws it.
 *  Null for a frame nothing draws — an unused sheet cell has no action. */
function primaryState(charKey, frameKey) {
  const states = statesUsing(charKey, frameKey);
  if (!states.length) return null;
  return states.slice().sort((a, b) => stateRank(a) - stateRank(b))[0];
}

/** What to call a frame in the UI. Semantic files already say what they are, so
 *  they keep their own name; a grid cell is shown by the action it serves, with
 *  the file name kept alongside because that is what is on disk. */
function frameLabel(charKey, frameKey) {
  if (!/^r\dc\d$/.test(frameKey)) return { name: frameKey, sub: "" };
  const primary = primaryState(charKey, frameKey);
  return primary
    ? { name: stateLabel(primary), sub: frameKey }
    : { name: frameKey, sub: "unused" };
}

const OTHER_KEY = "__other";
const OTHER_LABEL = "Other Sprites";
const ACTOR_KEYS = Object.keys(SPRITE_ACTORS);

const isOther = (charKey) => charKey === OTHER_KEY;
const isActor = (charKey) => ACTOR_KEYS.includes(charKey);

/** Character-ish record for anything selectable, real fighter or not. */
function actorOf(charKey) {
  if (isOther(charKey)) return { name: OTHER_LABEL, scale: 1 };
  return getActor(charKey) || { name: charKey, scale: 1 };
}

/** Where a shared sprite is drawn from, and how tall the game draws it. Built
 *  by walking the kits for `sprite:`/`sprites:` references, so it stays true as
 *  moves change instead of being a second list to maintain. */
let sharedUsageCache = null;
function sharedUsage() {
  if (sharedUsageCache) return sharedUsageCache;
  sharedUsageCache = new Map();
  const note = (key, who, label, h) => {
    if (!key) return;
    const list = sharedUsageCache.get(key) || [];
    list.push({ who, label, h });
    sharedUsageCache.set(key, list);
  };
  const walk = (node, who, label) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.sprite === "string") note(node.sprite, who, label, node.spriteH);
    if (Array.isArray(node.sprites)) for (const k of node.sprites) note(k, who, label, node.spriteH);
    if (typeof node.aura === "string") note(node.aura, who, `${label} (aura)`, node.spriteH);
    if (typeof node.domainSprite === "string") note(node.domainSprite, who, `${label} (domain)`, node.spriteH);
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, who, label);
  };
  for (const key of CHARACTER_KEYS) {
    const c = CHARACTERS[key];
    for (const [slot, def] of Object.entries(c.specials || {})) walk(def, c.name, def.name || slot);
    if (c.ultimate) walk(c.ultimate, c.name, c.ultimate.name || "Ultimate");
  }
  return sharedUsageCache;
}

const HANDLE_R = 7;

const BACKGROUNDS = [
  ["#12151f", "dark"], ["#5c6478", "grey"], ["#f2f4f8", "white"],
  ["#0f7a3d", "green"], ["#ff00ff", "magenta"], ["#7a3d0f", "brown"],
];

const state = {
  char: "gojo", frame: null, bg: BACKGROUNDS[0][0], zoom: 1.9,
  originals: {}, originalHeads: {}, originalHeadOverride: {}, originalAnims: {},
  originalSpans: {}, undo: [], redo: [],
  // Which anchor the arrow keys act on — set by whatever you last moved, not by
  // a separate selection step. Every SHOWN anchor is draggable regardless.
  anchor: null,
  anchorShown: {},     // name -> false to hide; anchors are shown by default
  dragging: false,
  view: "unedited",    // key into VIEWS
  // The secondary action being previewed: the canvas shows the sprite it is
  // pointed at now, and the saved choice stands where the size benchmark does,
  // so a reassignment can be read as a before/after rather than from memory.
  actionRow: null,     // { name, index, saved }
};

// ---------------------------------------------------------------- helpers

function statesUsing(charKey, frameKey) {
  return statesUsingFrame(charKey, frameKey);
}

function allFramesOf(charKey) {
  // Grouped by what they are, then alphabetical: technique effects first
  // (much the largest group and the one most often reviewed), then the
  // shikigami and other summons, then the domain backdrops.
  if (isOther(charKey)) {
    const rank = (k) => (k.startsWith("effect:") ? 0 : k.startsWith("summon:") ? 1 : 2);
    return sharedSpriteKeys().slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
  const delivered = Object.keys(spriteManifest?.characters?.[charKey] || {});
  // An actor lists the poses its transformation needs even before they exist,
  // so an incomplete set reads as a checklist rather than an empty page.
  if (isActor(charKey)) return [...new Set([...delivered, ...TRANSFORM_POSES])].sort();
  return delivered.sort();
}

/** True for a pose the character is expected to have but nobody has delivered.
 *  Only actors can be in this state; a fighter's list comes from the manifest,
 *  so every entry exists by definition. */
function isPending(charKey, frameKey) {
  return !isOther(charKey) && !spriteManifest?.characters?.[charKey]?.[frameKey];
}

/** Poses the pose list offers, filtered by the current view. May be empty —
 *  "Edited only" on an untouched character legitimately matches nothing, and
 *  quietly widening the filter would be a lie about what you are looking at.
 *  The selected pose stays on the canvas either way. */
function framesOf(charKey) {
  const view = VIEWS[state.view] || VIEWS.unedited;
  return allFramesOf(charKey).filter((k) => view.keep(charKey, k));
}

// ---------------------------------------------------------------- variants
//
// A pose can offer several drawings (src/sprites.js). Each option carries its
// OWN placement, so choosing one is not just a file swap: it restores that
// image's size, centring, ground contact and anchors, and banks the outgoing
// image's current numbers first. Otherwise tuning drawing A and then looking at
// drawing B would silently apply A's numbers to B and lose A's.

function poseVariants(charKey, frameKey) {
  if (isOther(charKey)) return [];
  return variantsOf(charKey, frameKey);
}

function variantEntry(charKey, frameKey) {
  return spriteManifest?.variants?.[charKey]?.[frameKey] || null;
}

/** Copy the placement fields the workbench edits off a meta object. */
function takePlacement(meta) {
  const out = {};
  for (const field of VARIANT_PLACEMENT) {
    if (meta[field] !== undefined) out[field] = meta[field];
  }
  return out;
}

/** Point a pose at one of its other drawings. */
async function chooseVariant(charKey, frameKey, file) {
  const entry = variantEntry(charKey, frameKey);
  const meta = rawMeta(charKey, frameKey);
  if (!entry || !meta || meta.file === file) return;
  const incoming = entry.options.find((o) => o.file === file);
  if (!incoming) return;

  // Bank what is on screen back onto the image it belongs to, including any
  // adjustment made this session, before it is replaced.
  const outgoing = entry.options.find((o) => o.file === meta.file);
  if (outgoing) Object.assign(outgoing, takePlacement(meta));

  for (const field of VARIANT_PLACEMENT) delete meta[field];
  Object.assign(meta, takePlacement(incoming), { file });
  variantPicks.set(`${charKey}/${frameKey}`, file);

  // The new art has almost certainly never been fetched — the streamer only
  // pulls the file each pose pointed at when the character loaded.
  await loadFrame(charKey, frameKey, { reload: true });
  syncAll();
}

// Frames whose drawing was switched this session, so the export can say so.
const variantPicks = new Map();

// Drawings whose delete tag was changed this session. Tracked separately from
// the pose's own flags because the tag belongs to an IMAGE: you mark the bad
// drawing, then switch back to the good one, and the mark has to stay on the
// drawing you marked rather than follow the selection.
const variantFlagEdits = new Set();

/** The variant option the pose is currently pointing at, if it has any. */
function currentOption(charKey, frameKey) {
  const entry = variantEntry(charKey, frameKey);
  const meta = rawMeta(charKey, frameKey);
  if (!entry || !meta) return null;
  return entry.options.find((o) => o.file === meta.file) || null;
}

/** True when the drawing on screen is tagged for deletion. */
function isDeleteTagged(charKey, frameKey) {
  return currentOption(charKey, frameKey)?.needsReplacement === "delete";
}

/** Any drawing of this pose tagged for deletion — what the pose list marks, so
 *  a tagged variant is findable without opening every chevron. */
function hasDeleteTag(charKey, frameKey) {
  const entry = variantEntry(charKey, frameKey);
  return !!entry?.options.some((o) => o.needsReplacement === "delete");
}

/** The RAW manifest object the renderer reads. `frameMeta` may hand back a
 *  copy, so all mutation must go through this or edits would be discarded. */
function rawMeta(charKey, frameKey) {
  // Shared sprites have no manifest entry of their own, so their review flags
  // live in a section beside the characters. Created on demand: an untouched
  // sprite should add nothing to the file.
  if (isOther(charKey)) {
    if (!spriteManifest) return null;
    spriteManifest.otherSprites ||= {};
    spriteManifest.otherSprites[frameKey] ||= {};
    return spriteManifest.otherSprites[frameKey];
  }
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

// The frame the character's scale is solved against.
const HEIGHT_FRAMES = ["idle_a", "r0c0"];

function isHeightReferenceFrame(charKey, frameKey) {
  for (const key of HEIGHT_FRAMES) {
    if (rawMeta(charKey, key)) return key === frameKey;
  }
  return false;
}

/** Freeze the character's scale reference at what it is NOW, before an edit to
 *  the idle changes it. Otherwise resizing the idle re-solves the scale and
 *  every other pose in the set moves with it — which is the height target's
 *  job, not the idle's. Pinned once; later idle edits ride on the frozen value. */
function pinHeightSpan(charKey, frameKey) {
  if (!isHeightReferenceFrame(charKey, frameKey)) return;
  spriteManifest.heightSpans ??= {};
  if (Number.isFinite(spriteManifest.heightSpans[charKey])) return;
  const span = measuredIdleSpan(charKey);
  if (span > 0) spriteManifest.heightSpans[charKey] = Number(span.toFixed(2));
}

function rememberSpan(charKey) {
  if (!(charKey in state.originalSpans)) {
    state.originalSpans[charKey] = spriteManifest?.heightSpans?.[charKey];
  }
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
  return EDITABLE.some((f) => {
    const kindOf = KIND_FIELDS[f];
    if (kindOf) return kindOf(meta) !== kindOf(orig);
    if (BOOLEAN_FIELDS.has(f)) return !!meta[f] !== !!orig[f];
    return Math.abs((meta[f] ?? 0) - (orig[f] ?? 0)) > 1e-4;
  }) || anchorsDirty(charKey, frameKey);
}

// Two INDEPENDENT questions get asked about a frame, and they must not be
// confused — mixing them is what made a pose vanish the instant it was flagged:
//
//   isDirty()       has this changed SINCE THE SESSION OPENED?
//                   -> the yellow dot, the change count, and what Export emits.
//   hasSavedEdits() had this already been dealt with BEFORE the session opened?
//                   -> which view ("Unedited only" / "Edited only") it appears in.
//
// So the pose list is a work list, and it holds still while you work: an edit
// made now never moves a frame between views, because the answer to the second
// question cannot change until the export is applied and the page reloaded. The
// dot is how you see what you have done in the meantime.
const savedAtLoad = new Set();      // "char/frame" that arrived already dealt with
const savedScanned = new Set();     // characters whose saved state has been read

/** Read a character's committed state ONCE, before anything can be edited.
 *  `rawMeta` is the live manifest object the workbench mutates in place, so
 *  asking it later would report an in-session flag as a committed one. */
function rememberSaved(charKey) {
  if (savedScanned.has(charKey)) return;
  savedScanned.add(charKey);
  for (const key of allFramesOf(charKey)) {
    const meta = rawMeta(charKey, key);
    if (!meta) continue;
    // `edited` is written by apply_sprite_adjustments.py; a replacement request
    // counts too, since either way that pose has been decided about.
    if (Object.keys(meta.edited || {}).length > 0 || meta.needsReplacement || meta.wantsImprovement) {
      savedAtLoad.add(`${charKey}/${key}`);
    }
  }
}

/** Adjustments committed to the codebase before this session started, as
 *  opposed to the unsaved ones the dot marks. Self-initialising, so it is safe
 *  to call from the view predicates that run before setChar finishes. */
function hasSavedEdits(charKey, frameKey) {
  rememberSaved(charKey);
  return savedAtLoad.has(`${charKey}/${frameKey}`);
}

function isUsed(charKey, frameKey) {
  // Every shared sprite is in the game by definition, and an actor's pose is
  // expected whether or not it has been drawn — neither is filtered out by the
  // "used in game" views the way an unused sheet cell is.
  if (isOther(charKey) || isActor(charKey)) return true;
  return statesUsingFrame(charKey, frameKey).length > 0;
}

function needsReplacement(charKey, frameKey) {
  return !!replacementKind(rawMeta(charKey, frameKey));
}

function kindLabel(kind, kinds = REPLACEMENT_KINDS) {
  return kinds.find(([k]) => k === kind)?.[1] ?? kind;
}

function wantsImprovement(charKey, frameKey) {
  return !!improvementKind(rawMeta(charKey, frameKey));
}

/** Every frame of this character edited this session — NOT filtered by the
 *  current view. Export, the change count and Reset character all read this,
 *  and all three would be wrong if the pose list's filter could hide an edit
 *  from them: an export would silently drop work, and a reset would silently
 *  leave some behind. */
function dirtyFrames(charKey) {
  return allFramesOf(charKey).filter((k) => isDirty(charKey, k));
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
    scale: actorOf(charKey).scale * state.zoom, facing: 1, alpha,
  });
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

/** What stands in the comparison slot, in priority order:
 *
 *   1. the SAVED sprite of the secondary action being previewed — the most
 *      specific question on screen, "what am I changing this from";
 *   2. this character's own idle, when the dropdown asks for it beside rather
 *      than under the pose;
 *   3. Gojo's idle, the roster size reference.
 *
 *  Null when the comparison is switched off, or when what it would show is
 *  already the pose on the canvas. */
function comparisonTarget() {
  if (!$("showComparison").checked) return null;
  const row = state.actionRow;
  if (row?.saved && row.saved !== state.frame) {
    const label = frameLabel(state.char, row.saved);
    return {
      charKey: state.char, frameKey: row.saved,
      caption: `saved: ${label.sub || label.name}`, sub: stateLabel(row.name),
    };
  }
  if ($("selfIdleMode").value === "comparison") {
    const key = selfIdleKey();
    if (key && key !== state.frame) {
      return { charKey: state.char, frameKey: key, caption: "this character's idle" };
    }
  }
  const gojo = benchmarkKey();
  if (state.char === "gojo" && gojo === state.frame) return null;
  return { charKey: "gojo", frameKey: gojo, caption: "Gojo idle — size benchmark" };
}

/** The comparison stands at the left end of the platform, drawn SOLID: it is a
 *  second sprite to look at, not a tracing guide, and ghosting it made it read
 *  as an overlay that had slipped sideways. */
function drawComparison({ charKey, frameKey, caption, sub }) {
  const x = PLATFORM_X + BENCHMARK_INSET;
  drawGhost(charKey, frameKey, 1, x);
  ctx.save();
  ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
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
  if (comparison) drawComparison(comparison);
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
  } else if (isPending(state.char, state.frame)) {
    drawPendingNotice(cx);
  } else if (!frameLoaded(state.char, state.frame)) {
    drawCanvasSpinner(cx);
  } else if ($("spinPreview").checked) {
    drawSpinPreview(cx);
  } else {
    drawCharFrame(ctx, state.char, state.frame, cx, GROUND_Y, {
      scale: actorOf(state.char).scale * state.zoom, facing: 1,
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

  // Every anchor the frame carries that has not been switched off. Drawn last
  // so handles are never buried under the art.
  if (!isOther(state.char) && !isPending(state.char, state.frame)) {
    for (const name of anchorNames(state.char, state.frame)) {
      if (isAnchorShown(name)) drawAnchorHandle(name, name === state.anchor);
    }
  }
}

/** A shared effect/summon sprite, drawn at the height the game draws it where
 *  that is known, and at its own pixel height where it is not. Nothing here is
 *  adjustable — the point is to see the art as it appears in a match. */
const sharedTried = new Set();

function drawSharedSprite(cx) {
  const img = getImage(state.frame);
  if (!img) {
    const done = sharedTried.has(state.frame);
    ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(done ? "not delivered yet" : `loading ${state.frame}…`, cx, GROUND_Y - 150);
    if (done) {
      ctx.font = "500 11px Inter, sans-serif";
      ctx.fillText(state.frame, cx, GROUND_Y - 130);
    }
    ctx.textAlign = "left";
    return;
  }
  let h = (gameHeightOf(state.frame) || img.height) * state.zoom;
  // Domain backdrops are full-screen images rather than sprites; shown whole
  // instead of overflowing the canvas by a factor of ten.
  const maxH = GROUND_Y - 20;
  if (h > maxH) h = maxH;
  const w = img.width * h / img.height;
  ctx.drawImage(img, cx - w / 2, GROUND_Y - h, w, h);
  if ($("showBox").checked) {
    ctx.strokeStyle = "rgba(255, 120, 160, 0.8)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx - w / 2, GROUND_Y - h, w, h);
    ctx.setLineDash([]);
  }
}

/** An actor pose nobody has delivered yet. Says so plainly rather than showing
 *  a spinner that will never finish. */
function drawPendingNotice(cx) {
  ctx.save();
  ctx.strokeStyle = "rgba(154, 164, 192, 0.4)";
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(cx - 90, GROUND_Y - 260, 180, 260);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
  ctx.font = "600 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("not delivered yet", cx, GROUND_Y - 140);
  ctx.font = "500 11px Inter, sans-serif";
  ctx.fillText(state.frame, cx, GROUND_Y - 120);
  ctx.restore();
}

/** The height the game draws a shared sprite at, from the kit that spawns it. */
function gameHeightOf(key) {
  const uses = sharedUsage().get(key) || [];
  return uses.find((u) => Number.isFinite(u.h))?.h ?? null;
}

/** Drawn where the sprite will be, so the wait reads as "this pose is coming"
 *  rather than "this pose is blank". Animated from the clock rather than a
 *  timer: `render()` is already called on every arrival and every edit, and a
 *  rAF loop just to spin an arc would keep the page busy for no reason. */
function drawCanvasSpinner(cx) {
  const t = performance.now() / 1000;
  const cy = GROUND_Y - 150;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 170, 255, 0.28)";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(120, 170, 255, 0.95)";
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, 26, t * 4, t * 4 + 1.5); ctx.stroke();
  ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
  ctx.font = "600 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`loading ${state.char}/${state.frame}…`, cx, cy + 52);
  ctx.restore();
  // One frame of animation per render, and renders stop once the art lands.
  requestAnimationFrame(() => { if (!frameLoaded(state.char, state.frame)) render(); });
}

/** Spin the pose about its centre of mass, so a badly-placed anchor is obvious
 *  — an off-centre pivot makes the body orbit instead of turn. */
function drawSpinPreview(cx) {
  const t = performance.now() / 1000;
  drawCharFrame(ctx, state.char, state.frame, cx, GROUND_Y, {
    scale: actorOf(state.char).scale * state.zoom,
    facing: 1,
    rotation: t * 1.6,
  });
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

/** The frames the kit itself gives this state, ignoring any override. */
function originalAnimFrames(charKey, stateName) {
  return state.originalAnims[charKey]?.[stateName] ?? null;
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
    pick.onclick = () => openSpritePicker(row);

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

// ------------------------------------------------------- sprite picker
//
// Every sprite the character has, drawn rather than named: choosing what an
// action looks like is a visual decision, and a dropdown of file names is not
// one. Right-click enlarges a tile in place, for the cases where a thumbnail is
// too small to judge.

let pickerRow = null;

function openSpritePicker(row) {
  pickerRow = row;
  const modal = $("spritePicker");
  const grid = $("pickerGrid");
  $("pickerTitle").textContent = `${stateLabel(row.name)} — choose a sprite`;
  $("pickerSub").textContent = `${actorOf(state.char).name} · currently ${row.frame}`;
  grid.innerHTML = "";
  for (const key of allFramesOf(state.char)) {
    grid.appendChild(buildPickerTile(key, row));
  }
  modal.hidden = false;
  closePickerPreview();
  // Focus the current choice so the keyboard lands somewhere sensible.
  grid.querySelector(".picker-tile.current")?.scrollIntoView({ block: "center" });
}

function closeSpritePicker() {
  pickerRow = null;
  $("spritePicker").hidden = true;
  closePickerPreview();
}

function buildPickerTile(key, row) {
  const tile = document.createElement("button");
  tile.className = "picker-tile" + (key === row.frame ? " current" : "");
  const label = frameLabel(state.char, key);
  const states = statesUsing(state.char, key);

  const cv = document.createElement("canvas");
  cv.width = 132; cv.height = 132;
  tile.appendChild(cv);

  const cap = document.createElement("span");
  cap.innerHTML = `${label.name}${label.sub ? `<i>${label.sub}</i>` : ""}`;
  tile.appendChild(cap);

  tile.title = states.length
    ? `${key} — also drawn by ${states.map(stateLabel).join(", ")}`
    : `${key} — unused, nothing draws it`;

  drawTileSprite(cv, key);
  tile.onclick = () => {
    setActionFrame(state.char, row.name, row.index, key);
    previewAction({ ...row, frame: key });
    closeSpritePicker();
  };
  tile.oncontextmenu = (e) => { e.preventDefault(); openPickerPreview(key, e.clientX, e.clientY); };
  return tile;
}

/** One tile's art, fetched if this character's set has not streamed in yet. */
function drawTileSprite(cv, key) {
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  const meta = rawMeta(state.char, key);
  const img = frameImage(state.char, key);
  if (!meta || !img) {
    c.fillStyle = "rgba(154, 164, 192, 0.5)";
    c.font = "600 10px Inter, sans-serif";
    c.textAlign = "center";
    c.fillText(img ? "no data" : "loading…", cv.width / 2, cv.height / 2);
    if (!img) loadFrame(state.char, key).then((ok) => { if (ok) drawTileSprite(cv, key); });
    return;
  }
  // Fitted to the tile rather than drawn at game scale: these are for telling
  // poses apart, and a tall pose and a wide one should both fill the box.
  const pad = 10;
  const scale = Math.min((cv.width - pad * 2) / meta.w, (cv.height - pad * 2) / meta.h);
  c.drawImage(img, cv.width / 2 - (meta.w * scale) / 2, cv.height - pad - meta.h * scale,
              meta.w * scale, meta.h * scale);
}

/** Right-click preview: the same sprite, big enough to judge. */
function openPickerPreview(key, clientX, clientY) {
  const box = $("pickerPreview");
  const cv = $("pickerPreviewCanvas");
  const meta = rawMeta(state.char, key);
  const img = frameImage(state.char, key);
  if (!meta) return;
  // A tile can be right-clicked before its art has streamed in; fetch it and
  // come back rather than doing nothing.
  if (!img) {
    loadFrame(state.char, key).then((ok) => { if (ok && !$("spritePicker").hidden) openPickerPreview(key, clientX, clientY); });
    return;
  }
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  const pad = 16;
  const scale = Math.min((cv.width - pad * 2) / meta.w, (cv.height - pad * 2) / meta.h);
  c.drawImage(img, cv.width / 2 - (meta.w * scale) / 2, cv.height - pad - meta.h * scale,
              meta.w * scale, meta.h * scale);
  const label = frameLabel(state.char, key);
  $("pickerPreviewLabel").innerHTML =
    `${label.name}${label.sub ? ` <i>${label.sub}</i>` : ""} · ${meta.w}×${meta.h}`;
  box.hidden = false;
  // Kept on screen whichever corner it was opened from.
  const r = box.getBoundingClientRect();
  const x = Math.min(Math.max(8, clientX + 14), window.innerWidth - r.width - 8);
  const y = Math.min(Math.max(8, clientY - r.height / 2), window.innerHeight - r.height - 8);
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
}

function closePickerPreview() {
  const box = $("pickerPreview");
  if (box) box.hidden = true;
}

/** Actions re-pointed away from what the kit gives them, for the export. */
function dirtyActions(charKey) {
  const out = {};
  const overrides = spriteManifest?.animOverrides?.[charKey] || {};
  for (const [name, frames] of Object.entries(overrides)) {
    const original = originalAnimFrames(charKey, name);
    if (!Array.isArray(frames) || !frames.length) continue;
    if (!original || frames.length !== original.length || frames.some((f, i) => f !== original[i])) {
      out[name] = frames;
    }
  }
  return out;
}

// -------------------------------------------------------------- ui wiring

// Which half of the panel applies. Shared sprites carry no placement data, so
// showing sliders that write into nothing would be a lie about what they do.
const PLACEMENT_GROUPS = ["scaleGroup", "offsetGroup", "groundGroup", "anchorGroup",
                          "heightGroup", "mirrorGroup", "referenceGroup", "resetGroup"];

function applyPanelMode() {
  const other = isOther(state.char);
  for (const id of PLACEMENT_GROUPS) $(id)?.toggleAttribute("hidden", other);
  $("secondaryGroup")?.toggleAttribute("hidden", other);
  $("usageGroup")?.toggleAttribute("hidden", !other);
  if (other) refreshUsageInfo();

  // A pose with no art yet has nothing to place: the controls stay visible so
  // the panel does not jump around as the set fills in, but they are greyed
  // and inert rather than pretending to edit something.
  const pending = !other && isPending(state.char, state.frame);
  for (const id of ["scaleGroup", "offsetGroup", "groundGroup", "anchorGroup", "mirrorGroup"]) {
    const group = $(id);
    if (!group) continue;
    group.classList.toggle("disabled", pending);
    for (const input of group.querySelectorAll("input, select, button")) input.disabled = pending;
  }
}

/** Who spawns this sprite, and how big the game draws it. */
function refreshUsageInfo() {
  const box = $("usageInfo");
  if (!box) return;
  const img = getImage(state.frame);
  const uses = sharedUsage().get(state.frame) || [];
  const size = img ? `${img.width}×${img.height} delivered` : "not loaded";
  const drawn = gameHeightOf(state.frame);
  const lines = [
    `<b>${state.frame}</b>`,
    size + (drawn ? ` · drawn ${drawn}px tall in game` : " · size decided by the code that spawns it"),
  ];
  lines.push(uses.length
    ? uses.map((u) => `${u.who} — ${u.label}`).join("<br>")
    : "No kit references this sprite — it is spawned from code (a stage hazard, a domain, or a shikigami).");
  box.innerHTML = lines.join("<br>");
}

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

function refreshControls() {
  refreshHeadControl();
  const meta = rawMeta(state.char, state.frame);
  if (!meta) return;
  // syncAll snapshots the selected pose before calling this, so the original is
  // always here. Guarded anyway: this runs inside the repaint path, and a throw
  // here silently takes the canvas with it rather than failing visibly.
  const orig = state.originals[state.char]?.[state.frame];
  if (!orig) return;

  const rel = (meta.renderScale ?? 1) / (orig.renderScale || 1);
  setPair("scale", rel);
  $("scaleVal").textContent = `${(rel * 100).toFixed(1)}% of delivered`;

  const dx = (meta.ox ?? 0) - (orig.ox ?? 0);
  setPair("offset", dx);
  $("offsetVal").textContent = `${dx > 0 ? "+" : ""}${dx.toFixed(1)} px`;

  // positive slider = sprite sits LOWER, which reads more naturally than the
  // underlying bodyBottom (where a bigger value lifts the art)
  const airborne = isAirborneOnly(state.char, state.frame);
  const dg = (orig.bodyBottom ?? 0) - (meta.bodyBottom ?? 0);
  setPair("ground", dg);
  $("groundVal").textContent = airborne ? "n/a — never touches the floor"
                                        : `${dg > 0 ? "+" : ""}${dg.toFixed(1)} px`;
  $("groundGroup").classList.toggle("disabled", airborne);
  $("groundRange").disabled = airborne;
  $("groundNum").disabled = airborne;

  // A delete tag lives on the drawing rather than the pose, so it is read from
  // the variant option — but it presents as just another kind of "this art is
  // wrong", which is what it is.
  const deleting = isDeleteTagged(state.char, state.frame);
  const kind = deleting ? "delete" : replacementKind(meta);
  $("replaceBox").checked = !!kind;
  $("replaceKind").hidden = !kind;
  $("replaceKind").value = kind || REPLACEMENT_KINDS[0][0];
  $("replaceVal").textContent = kind ? kindLabel(kind).split(" — ")[0].toLowerCase() : "";
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

  const mirrored = !!meta.faceLeft;
  $("mirrorBox").checked = mirrored;
  $("mirrorVal").textContent = mirrored
    ? "flipped — art is drawn facing left"
    : "as delivered — art is drawn facing right";

  refreshAnchorControls();

  // counted across every character touched this session, since that is what
  // Export now emits
  let poses = 0, heads = 0, chars = 0, actions = 0;
  for (const c of Object.keys(state.originals)) {
    const n = dirtyFrames(c).length;
    const headChanged = Math.abs(headHeight(c) - (state.originalHeads[c] ?? headHeight(c))) > 1e-4;
    const a = Object.keys(dirtyActions(c)).length;
    if (n || headChanged || a) chars++;
    poses += n;
    actions += a;
    if (headChanged) heads++;
  }
  $("dirtyCount").textContent = poses || heads || actions
    ? [poses ? `${poses} pose${poses === 1 ? "" : "s"}` : "",
       heads ? `${heads} head height${heads === 1 ? "" : "s"}` : "",
       actions ? `${actions} action${actions === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ")
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

  // The anchors a pose carries vary, so its help is assembled rather than
  // written into the markup: the general rule, then a line per anchor.
  setHelp($("anchorLabel"), names.length
    ? "Drag a handle on the sprite, or nudge it here. Anchors are stored "
      + "against the artwork, so later size, position and ground tweaks carry "
      + "them along.<br><br>"
      + names.map((n) => `<b>${ANCHOR_META[n]?.label ?? n}</b> — ${ANCHOR_META[n]?.hint ?? ""}`)
             .join("<br><br>")
    : "This pose carries no anchors.");
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
    const options = poseVariants(state.char, key);
    // A pose with a choice of drawings is a cell plus a chevron, so the two
    // jobs stay separate: the cell still selects the pose, and only the chevron
    // opens the menu. Wrapping every cell instead would change the grid for the
    // 90% of poses that have exactly one drawing.
    const host = options.length > 1 ? document.createElement("div") : null;
    if (host) host.className = "pose-cell";

    const b = document.createElement("button");
    const label = frameLabel(state.char, key);
    b.innerHTML = label.sub
      ? `${label.name}<i class="pose-file">${label.sub}</i>`
      : label.name;
    const states = statesUsing(state.char, key);
    b.title = states.length
      ? `${key} — ${states.map(stateLabel).join(", ")}`
      : `${key} — not drawn by any state`;
    const doomed = hasDeleteTag(state.char, key);
    b.className = (key === state.frame ? "sel " : "")
      + (isDirty(state.char, key) || variantFlagEdits.has(`${state.char}/${key}`) ? "dirty " : "")
      + (needsReplacement(state.char, key) || doomed ? "flagged " : "")
      + (wantsImprovement(state.char, key) ? "wanted" : "");
    const kind = doomed ? "delete" : replacementKind(rawMeta(state.char, key));
    if (kind) b.dataset.kind = kind;
    b.onclick = () => { state.actionRow = null; state.frame = key; syncAll(); };

    if (!host) { list.appendChild(b); continue; }
    host.appendChild(b);
    host.appendChild(buildVariantChevron(key, options));
    list.appendChild(host);
  }
}

/** The far-right chevron on a pose that has more than one drawing. Opens a menu
 *  of them; picking one swaps which art the pose uses, bringing that image's own
 *  placement with it. */
function buildVariantChevron(frameKey, options) {
  const chev = document.createElement("button");
  chev.className = "pose-variant";
  chev.textContent = "⌄";
  chev.title = `${options.length} drawings for ${frameKey}`;
  chev.setAttribute("aria-label", `Choose the drawing for ${frameKey}`);
  chev.onclick = (e) => {
    e.stopPropagation();     // the cell behind it selects the pose; this does not
    openVariantMenu(chev, frameKey, options);
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

function openVariantMenu(anchor, frameKey, options) {
  const existing = document.querySelector(".variant-menu");
  closeVariantMenu();
  if (existing?.dataset.frame === frameKey) return;   // second click closes it

  const menu = document.createElement("div");
  menu.className = "variant-menu";
  menu.dataset.frame = frameKey;
  for (const opt of options) {
    const row = document.createElement("button");
    row.className = (opt.current ? "current " : "")
      + (opt.needsReplacement === "delete" ? "doomed" : "");
    // The file is the identity of a drawing, so it is shown rather than hidden
    // behind a label — two options can reasonably share a label.
    row.innerHTML = `<span class="variant-label">${opt.label || "Untitled"}</span>`
      + `<i class="variant-file">${opt.file}</i>`;
    row.onclick = (e) => {
      e.stopPropagation();
      closeVariantMenu();
      chooseVariant(state.char, frameKey, opt.file);
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
const ARROW_STEP = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

function poseColumns() {
  const list = $("poseList");
  const cols = getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length;
  return Math.max(1, cols);
}

/** Move the selection by [dx, dy] grid cells. Clamped, not wrapped: running off
 *  the end of a 30-pose list back to the start loses your place. */
function movePose([dx, dy]) {
  const frames = framesOf(state.char);
  if (frames.length < 2) return;
  const cols = poseColumns();
  const i = frames.indexOf(state.frame);
  // A pose the current view hides has no place in the grid, so start from the
  // top rather than from -1.
  const next = i < 0 ? 0 : clampNum(i + dx + dy * cols, 0, frames.length - 1);
  if (next === i) return;
  state.frame = frames[next];
  syncAll();
  scrollPoseIntoView();
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
    loadSharedImage(key).then(() => { sharedTried.add(key); refreshUsageInfo(); render(); });
  }
  else charLoader.prioritize(state.frame);
  refreshLoadState();
  render();
}

// `wantFrame` is the pose to open on — the action workbench's `?frame=`
// hand-off. It has to be known HERE rather than applied afterwards, because
// this is what tells the loader which frame to fetch first; setting it later
// would mean downloading the default idle and then the pose you asked for.
function setChar(charKey, wantFrame = null) {
  state.char = charKey;
  state.actionRow = null;   // an action preview belongs to the character it was opened from
  $("charSel").value = charKey;   // also called from ?char= and undo, not just the select
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
  if (url.searchParams.get("char") === state.char && url.searchParams.get("frame") === state.frame) return;
  url.searchParams.set("char", state.char);
  if (state.frame) url.searchParams.set("frame", state.frame);
  else url.searchParams.delete("frame");
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

  refreshControls(); buildPoseList(); refreshTag(); render();
}

/** "This art works, but it could be better." A lower-priority ask than a
 *  replacement, kept separate so a wish-list item never sits in the same queue
 *  as a pose that is actually wrong. */
function applyWantsImprovement(kind) {
  pushHistory(state.char, state.frame);
  const meta = rawMeta(state.char, state.frame);
  if (kind) meta.wantsImprovement = kind;
  else delete meta.wantsImprovement;
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
      const kindOf = KIND_FIELDS[f];
      if (kindOf) {
        // the VALUE is the kind, so a change of kind counts as a change; and
        // `false` is meaningful, clearing a request rather than leaving it
        const now = kindOf(meta);
        const was = kindOf(orig);
        if (now !== was) entry[f] = now ?? false;
        continue;
      }
      if (BOOLEAN_FIELDS.has(f)) {
        // `false` is meaningful, not "unset": it turns OFF a mirror that
        // `nativeLeft` would otherwise re-apply
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
  // Which drawing each pose should use, when that was changed this session.
  // Exported separately from the numbers because it is a different decision:
  // the placement that travels with it is banked onto the option itself.
  const picks = {};
  for (const [id, file] of variantPicks) {
    const [who, pose] = id.split("/");
    if (who === charKey) picks[pose] = file;
  }
  // A delete tag is banked the same way the numbers are: onto the option, by
  // file. Poses that only had a tag changed still need their options exported,
  // so they join `picks` for the placement pass without a selection change.
  const flagged = new Set();
  for (const id of variantFlagEdits) {
    const [who, pose] = id.split("/");
    if (who === charKey) flagged.add(pose);
  }

  const payload = { character: charKey };
  if (Object.keys(picks).length || flagged.size) {
    if (Object.keys(picks).length) payload.variantChoice = picks;
    const poses = new Set([...Object.keys(picks), ...flagged]);
    payload.variantPlacement = Object.fromEntries(
      [...poses].map((pose) => {
        const entry = variantEntry(charKey, pose);
        return [pose, entry ? entry.options.map((o) => ({
          file: o.file,
          ...takePlacement(o),
          // Always present, so clearing a tag exports as clearly as setting one.
          needsReplacement: o.needsReplacement || false,
        })) : []];
      }),
    );
  }
  const hh = headHeight(charKey);
  if (Math.abs(hh - (state.originalHeads[charKey] ?? hh)) > 1e-4) {
    payload.headHeight = Number(hh.toFixed(1));
  }
  if (Object.keys(out).length) payload.adjustments = out;
  const actions = dirtyActions(charKey);
  if (Object.keys(actions).length) payload.animOverrides = actions;
  // The pinned reference travels with the edit that caused it, or the applied
  // manifest would re-derive the span from the new idle and resize the set.
  const span = spriteManifest?.heightSpans?.[charKey];
  if (Number.isFinite(span) && span !== state.originalSpans[charKey]) payload.heightSpan = span;
  return (payload.headHeight !== undefined || payload.adjustments || payload.animOverrides
          || payload.heightSpan !== undefined || payload.variantPlacement) ? payload : null;
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
  const json = payloads.length
    ? JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2)
    : "";
  $("exportOut").value = json || "// no changes yet";
  if (json) downloadJson(json, exportFileName(payloads));
}

/** Named after what is in it, so a folder of exports is readable months later:
 *  `gojo-adjustments.json`, or `roster-adjustments.json` for a multi-character
 *  session. No timestamp — the file system already records that, and a name
 *  that changes every second cannot be overwritten in place. */
function exportFileName(payloads) {
  const who = payloads.length === 1 ? payloads[0].character : "roster";
  return `${who}-adjustments.json`;
}

/** Save the export as a file rather than leaving it in the textarea to be
 *  selected and copied by hand. The textarea stays filled — reading the diff
 *  before sending it on is the normal thing to do. */
function downloadJson(json, filename) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Freed on the next tick: revoking synchronously can beat the download in
  // some browsers and save an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
};

/** Write a value to both halves of a pair, without either echoing back. */
function setPair(name, value) {
  const p = PAIRS[name];
  // A pose saved with a value beyond the default span (see growRangeToFit)
  // must not snap back to the end of the track when it is selected.
  growRangeToFit(`${name}Range`, value);
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
    // to the slider silently threw those edits away. The slider grows to cover
    // whatever was typed instead, so it can still be dragged from there.
    const v = p.store(shown);
    growRangeToFit(`${name}Range`, v);
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

/** Widen a slider so a value outside its span is still on it. Rounded outward
 *  to a whole step so the track keeps sensible numbers, and never narrowed —
 *  a range that grew for one pose stays put while you work through the rest. */
function growRangeToFit(rangeId, value) {
  const el = $(rangeId);
  if (!el) return;
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  const pad = Math.max(Math.abs(value) * 0.1, (max - min) * 0.05);
  if (value < min) el.min = String(Math.floor(value - pad));
  if (value > max) el.max = String(Math.ceil(value + pad));
}

async function boot() {
  const charSel = $("charSel");
  // Fighters first, then the non-fighter entries: an actor with its own sprite
  // set (Mahoraga), then the shared effect and summon art.
  for (const key of [...CHARACTER_KEYS, ...ACTOR_KEYS, OTHER_KEY]) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = isOther(key) ? OTHER_LABEL
      : isActor(key) ? `${actorOf(key).name} (not a fighter)`
      : CHARACTERS[key].name;
    charSel.appendChild(o);
  }
  charSel.onchange = () => setChar(charSel.value);

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
  bindSlider("headRange", applyHead);
  document.querySelectorAll("[data-head]").forEach((b) => {
    b.onclick = () => applyHead(headHeight(state.char) + parseFloat(b.dataset.head), true);
  });
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
  const kindSel = $("replaceKind");
  for (const [key, label] of REPLACEMENT_KINDS) {
    const o = document.createElement("option");
    o.value = key; o.textContent = label;
    kindSel.appendChild(o);
  }
  // ticking the box asks for the kind currently shown, which defaults to a
  // wholesale replace — the safest ask when nothing more specific is chosen
  $("replaceBox").onchange = (e) =>
    applyNeedsReplacement(e.target.checked ? kindSel.value : null);
  kindSel.onchange = () => applyNeedsReplacement(kindSel.value);

  const wantSel = $("improveKind");
  for (const [key, label] of IMPROVEMENT_KINDS) {
    const o = document.createElement("option");
    o.value = key; o.textContent = label;
    wantSel.appendChild(o);
  }
  $("improveBox").onchange = (e) =>
    applyWantsImprovement(e.target.checked ? wantSel.value : null);
  wantSel.onchange = () => applyWantsImprovement(wantSel.value);

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
  ["showComparison", "selfIdleMode", "showGuides", "showBox", "showPlatform"]
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
    // Anything you can type into keeps its own arrow keys.
    const tag = e.target.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT" || tag === "INPUT") return;

    // The arrows walk the POSE GRID. Stepping through poses and adjusting a
    // couple of things on each is the workflow this tool exists for, so it gets
    // the keys; the anchors keep their own nudge buttons and stay draggable, and
    // placement now has a typeable number beside every slider.
    const dir = ARROW_STEP[e.key];
    if (!dir) return;
    e.preventDefault();
    movePose(dir);
  });

  initTooltips();

  // The manifest alone — every number the panels show, and everything
  // warmAnchors needs. Sprite art follows per character, so opening the
  // workbench no longer means downloading the whole roster to edit one pose.
  await loadCoreAssets();
  warmAnchors(CHARACTER_KEYS);
  $("loadState").textContent = "manifest loaded";

  const params = new URLSearchParams(location.search);
  const wanted = params.get("char");
  const startChar = CHARACTER_KEYS.includes(wanted) ? wanted : "gojo";

  // `?frame=` lets the action workbench hand off a specific pose to edit. It is
  // resolved BEFORE setChar so the pose you were sent to is the one fetched
  // first, rather than fetching the default idle and then discarding it.
  const frame = params.get("frame");
  const wantedFrame = frame && allFramesOf(startChar).includes(frame) ? frame : null;
  setChar(startChar, wantedFrame);
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
}

boot();
