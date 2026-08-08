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
  drawCharFrame, anchorLocal, anchorsForFrame, statesUsingFrame, isAirborneOnly, animsOf, resolvedAnim,
  drawnByFallbackOnly,
  anchorScreenPos, screenPosToLocal, warmAnchors, EXTRA_ANCHORS,
  REPLACEMENT_KINDS, replacementKind, IMPROVEMENT_KINDS, improvementKind,
  variantsOf, VARIANT_BANKED, VARIANT_ONLY_KINDS,
} from "../src/sprites.js";
import { drawPlatformShape } from "../src/render.js";
import { lightMove, heavyMove, VISIBLE_ART_REACH } from "../src/moves.js";
import { PIVOTED_STATES } from "../src/motion.js";
import { CHARACTERS, CHARACTER_KEYS, SPRITE_ACTORS, getActor } from "../src/characters.js";
import { TRANSFORM_POSES, TRANSFORM_POSE_ALTERNATIVES } from "../src/config_transform.js";
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
const EDITABLE = ["renderScale", "ox", "bodyBottom", "rotationDeg", "faceLeft",
                  "needsReplacement", "wantsImprovement"];
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
  // Also gated on `isUsed`: "All sprites" is the one view that shows art the
  // game does not draw, and every other view is a question about the working
  // set. Without the gate this one leaked — a retired sheet cell keeps the
  // `edited` record of the tuning it was given while it was still in use, so
  // the poses most likely to appear here are exactly the ones a re-point had
  // just taken out of the game.
  edited: { label: "Has saved edits (done)", keep: (c, k) => isUsed(c, k) && hasSavedEdits(c, k) },
  used: { label: "Used in game", keep: (c, k) => isUsed(c, k) },
  all: { label: "All sprites", keep: () => true },
};
// Three kinds of entry in the character list are not fighters — the third,
// "All Recently Updated Poses", is not even a sprite set; see recentUpdates().
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
  "win",
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

// The entry that is not a sprite set at all: a cross-character work list of
// poses an intake round wrote over work already done. See recentUpdates().
const RECENT_KEY = "__recent";
const RECENT_LABEL = "All Recently Updated Poses";

const isOther = (charKey) => charKey === OTHER_KEY;
const isActor = (charKey) => ACTOR_KEYS.includes(charKey);
const inRecent = () => state.group === RECENT_KEY;

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
  // "char/frame" the centre of mass was asked for on despite nothing turning
  // that pose. Session-only: it changes what the panel offers, not the art.
  anchorForced: new Set(),
  dragging: false,
  // RECENT_KEY while the cross-character updated list is open. `char` stays a
  // real character throughout — every control below edits the pose that is
  // selected, and which list it was picked from changes nothing about that.
  group: null,
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

// The two idle poses lead every character's list: they are the reference the
// other poses get compared against, so they should be a click away rather than
// wherever the alphabet happens to put them.
const REFERENCE_POSES = ["idle_a", "idle_b"];
function poseRank(key) {
  const i = REFERENCE_POSES.indexOf(key);
  return i === -1 ? REFERENCE_POSES.length : i;
}
function byPose(a, b) {
  return poseRank(a) - poseRank(b) || a.localeCompare(b);
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
  // so an incomplete set reads as a checklist rather than an empty page — minus
  // any whose newer replacement has already landed, the same substitution the
  // readiness check makes (TRANSFORM_POSE_ALTERNATIVES). Otherwise a set that
  // delivered the wind-up/strike pairs still shows the single `attack_heavy`
  // it superseded, as a pose someone might go and draw.
  if (isActor(charKey)) {
    const met = (pose) => TRANSFORM_POSE_ALTERNATIVES[pose]?.every((k) => delivered.includes(k));
    const wanted = TRANSFORM_POSES.filter((pose) => delivered.includes(pose) || !met(pose));
    return [...new Set([...delivered, ...wanted])].sort(byPose);
  }
  return delivered.slice().sort(byPose);
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

// ------------------------------------------------------- recently updated
//
// The workflow this exists for: tune a batch of poses, then a delivery lands
// and intake writes the new art over some of them. The tuning that art was
// given is gone — a redraw rolls it back, because nudges made to compensate for
// bad art must not be inherited by the art that fixes it — so those poses have
// to be done again. They are scattered across the roster by definition, and one
// character at a time is the wrong shape for finding them: a round touches four
// fighters and you would have to open all of them and remember which.
//
// So the character dropdown offers one entry that is not a character. It lists
// the poses intake overwrote, whichever character they belong to, and selecting
// one switches to that character underneath — the panel, the export and the
// undo stack all keep working on real characters, because that is what they are
// still editing.
//
// It is a record, not a guess: `intake_import.py` stamps `replaced` onto the
// pose it writes, saying when the art landed and which hand-tuned fields did not
// survive. And it drains — `apply_sprite_adjustments.py` drops the marker when
// the pose is adjusted again, or when it is marked reviewed as it stands, so the
// list is what is still outstanding rather than a growing history.

/** The intake marker on a pose, or null. */
function updateNote(charKey, frameKey) {
  if (isOther(charKey)) return null;
  return spriteManifest?.characters?.[charKey]?.[frameKey]?.replaced
    || surfacedNote(charKey, frameKey);
}

// A second way onto the list, and the same job: poses that need a look now and
// would otherwise have to be hunted for.
//
// `statesUsingFrame` used to answer against the frames a state DECLARES rather
// than the ones it resolves to, so a pose the game only reaches through its
// state's `fallback` was reported unused — filtered out of the in-game views,
// and so never opened to be sized. Fixing that (src/sprites.js) hands the
// workbench a set of poses that have always been in the game and have never
// been looked at. They are scattered across the roster exactly the way an
// intake round's are, which is what this list is for.
//
// Only on characters that have been worked on before, though. On a fighter
// nobody has touched, every pose is unsized and these are not special — they
// would bury the poses that genuinely came back needing something. A character
// someone has already been through is the case this is about: the set looked
// finished, and these were missing from it.
function isSurfaced(charKey, frameKey) {
  if (isOther(charKey)) return false;
  const meta = spriteManifest?.characters?.[charKey]?.[frameKey];
  if (!meta || meta.replaced) return false;
  // Sized already, or dealt with as it stands — either way it has been seen.
  if (Object.keys(meta.edited || {}).length > 0 || meta.surfacedReviewed) return false;
  if (!drawnByFallbackOnly(charKey, frameKey)) return false;
  return charHasTuning(charKey);
}

/** Whether anyone has ever tuned this character. Reads the committed `edited`
 *  records rather than this session's, so opening a fighter and nudging one
 *  pose does not summon their whole untouched set onto the list. */
const tunedChars = new Map();
function charHasTuning(charKey) {
  if (!tunedChars.has(charKey)) {
    rememberSaved(charKey);
    tunedChars.set(charKey, allFramesOf(charKey)
      .some((key) => hasSavedEdits(charKey, key)));
  }
  return tunedChars.get(charKey);
}

// The dot beside a name in the character dropdown: this sprite set has been
// worked on before. It answers the question you ask when picking who to do
// next — the roster is long, and which fighters have already been through here
// is otherwise something you have to remember or go and check one at a time.
//
// Committed state only, the same `charHasTuning` the updated list gates on, so
// the two never disagree about who counts as done. That also means a set does
// not sprout a dot the moment you nudge something in this session: it says
// "before today", and this session's work is what the dirty markers are for.
const EDITED_MARK = "● ";
// A blank the width of the dot, so the names stay in one column rather than
// stepping in and out as the marks come and go.
const UNEDITED_PAD = "  ";

/** Stamp the dropdown with who has been worked on. Runs once the manifest is
 *  loaded — before it there is nothing to read, and `charHasTuning` caches. */
function markEditedChars() {
  for (const o of $("charSel")?.options || []) {
    const key = o.value;
    if (!o.dataset.name || isOther(key) || key === RECENT_KEY) continue;
    const edited = charHasTuning(key);
    o.textContent = (edited ? EDITED_MARK : UNEDITED_PAD) + o.dataset.name;
    o.title = edited ? "Already worked on — this set has hand-tuned poses" : "";
  }
}

/** The stand-in marker for a surfaced pose, shaped like an intake one so the
 *  panel, the list and the reviewed toggle all read it the same way. */
function surfacedNote(charKey, frameKey) {
  return isSurfaced(charKey, frameKey) ? { at: "", kept: "keep", how: "surfaced", lost: [] } : null;
}

// Poses marked reviewed this session. Session-only, exactly like an edit: the
// manifest marker cannot go until an export has been applied, so these stay on
// the list, ticked and dimmed, rather than vanishing as they are marked. Dropping
// them on the spot would also hide what still had to be exported.
const updatesCleared = new Set();

const isUpdateReviewed = (charKey, frameKey) => updatesCleared.has(`${charKey}/${frameKey}`);

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

/** Every pose carrying an intake marker, across the whole roster.
 *
 *  Ordered newest round first, and within a round the poses that LOST hand
 *  tuning lead — they are the ones with work to redo, as against a touch-up
 *  that came back with its numbers intact. Then by character and pose, so the
 *  list holds still while it is worked through. */
function recentUpdates() {
  const out = [];
  for (const charKey of [...CHARACTER_KEYS, ...ACTOR_KEYS]) {
    for (const frameKey of Object.keys(spriteManifest?.characters?.[charKey] || {})) {
      const note = updateNote(charKey, frameKey);
      if (!note) continue;
      out.push({
        char: charKey, frame: frameKey,
        at: typeof note.at === "string" ? note.at : "",
        kept: note.kept || "discard",
        how: note.how || "import",
        lost: Array.isArray(note.lost) ? note.lost : [],
      });
    }
  }
  // A dated intake round leads; the surfaced poses, which have no round to
  // belong to, sit under them rather than interleaving by an empty timestamp.
  // Poses with tuning to redo lead, then the round's brand-new poses, then the
  // surfaced ones, which belong to no round at all.
  const rank = (e) => (e.how === "surfaced" ? 2 : e.how === "new" ? 1 : 0);
  return out.sort((a, b) =>
    rank(a) - rank(b)
    || b.at.localeCompare(a.at)
    || (b.lost.length ? 1 : 0) - (a.lost.length ? 1 : 0)
    || a.char.localeCompare(b.char)
    || a.frame.localeCompare(b.frame));
}

/** What was overwritten, in a sentence. Reads off the marker rather than
 *  guessing, so "nothing was lost" is stated rather than implied by silence. */
function updateSummary(note) {
  if (note.how === "new") {
    const at = note.at ? new Date(note.at) : null;
    const when = at && !Number.isNaN(at.getTime()) ? at.toLocaleString() : (note.at || "an earlier round");
    return `This pose did not exist before ${when} — the intake round that `
      + "landed it created it.<br>"
      + "Nothing was overwritten, so there is no tuning to redo. It has never "
      + "been placed: size it against the idle and set its ground contact.";
  }
  if (note.how === "surfaced") {
    return "The game draws this pose through its state's <b>fallback</b>, and "
      + "the check for what a state draws used to miss that — so it was filtered "
      + "out of the in-game views and never came up to be sized.<br>"
      + "It has been in every match all along. Size it against the idle.";
  }
  const when = note.at ? new Date(note.at) : null;
  const landed = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString() : (note.at || "an earlier round");
  const how = note.how === "variant"
    ? "a delivered alternate was selected over it"
    : "new art was imported over it";
  const lost = (Array.isArray(note.lost) ? note.lost : []);
  const what = lost.length
    ? `Rolled back: <b>${lost.join(", ")}</b> — this pose needs tuning again.`
    : "The tuning was carried across intact — worth a look, not a re-tune.";
  return `${how} on ${landed}.<br>${what}`;
}

// ---------------------------------------------------------------- variants
//
// A pose can offer several drawings (src/sprites.js). Each option carries its
// OWN placement, so choosing one is not just a file swap: it restores that
// image's size, centring, ground contact and anchors, and banks the outgoing
// image's current numbers first. Otherwise tuning drawing A and then looking at
// drawing B would silently apply A's numbers to B and lose A's. The review
// flags ride along for the same reason — a "fix alpha" is a verdict on one
// drawing, and following the pose instead would pin it to whichever art is
// selected at the time.

function poseVariants(charKey, frameKey) {
  if (isOther(charKey)) return [];
  return variantsOf(charKey, frameKey);
}

function variantEntry(charKey, frameKey) {
  return spriteManifest?.variants?.[charKey]?.[frameKey] || null;
}

/** Copy the fields that belong to the drawing — placement and review both —
 *  off a meta object. */
function takeBanked(meta) {
  const out = {};
  for (const field of VARIANT_BANKED) {
    if (meta[field] !== undefined) out[field] = meta[field];
  }
  return out;
}

/** What the POSE mirrors from the drawing it now points at: everything banked,
 *  minus the kinds that only mean something about an option. "Delete variant"
 *  says discard this one of several — a sentence the pose cannot carry, and one
 *  the request collectors read off the variants list instead. */
function poseView(option) {
  const out = takeBanked(option);
  if (VARIANT_ONLY_KINDS.has(out.needsReplacement)) delete out.needsReplacement;
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
  if (outgoing) Object.assign(outgoing, takeBanked(meta));

  for (const field of VARIANT_BANKED) delete meta[field];
  Object.assign(meta, poseView(incoming), { file });
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

/** Anchors offered for the current frame: `com` when it does anything, plus any
 *  state-specific one the frame's animations call for. */
function anchorNames(charKey, frameKey) {
  const extra = anchorsForFrame(charKey, frameKey);
  return comPivots(charKey, frameKey) ? ["com", ...extra] : extra;
}

/** Whether this frame's centre of mass is a pivot anything actually turns
 *  about — the question of whether it is worth placing.
 *
 *  Three ways to earn it. The pose has a baked tilt, which turns about the com
 *  by definition. Or one of the animation states that draw it is one the game
 *  turns or deforms (PIVOTED_STATES in motion.js). Or the workbench has been
 *  told to show it anyway for this frame, which is the escape hatch for the
 *  cases the list cannot see: a special thrown in mid-air picks up the airborne
 *  lean, and nothing in the manifest says whether a given special is ever used
 *  off the ground.
 *
 *  A cell no animation draws gets nothing — until an action is pointed at it,
 *  at which point statesUsingFrame starts answering and this follows. */
function comPivots(charKey, frameKey) {
  if (state.anchorForced.has(`${charKey}/${frameKey}`)) return true;
  if (rawMeta(charKey, frameKey)?.rotationDeg) return true;
  return statesUsingFrame(charKey, frameKey).some((s) => PIVOTED_STATES.has(s));
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
  // Shared effect and summon art has no anim table to ask — the code that
  // spawns each one decides when it appears — so it is in the game by
  // definition and the question does not apply.
  if (isOther(charKey)) return true;
  // An ACTOR is asked the same question as a fighter. It used to be exempt,
  // from when `animsOf` could not resolve a SPRITE_ACTOR's table at all and the
  // honest answer was unavailable; that is fixed (src/sprites.js), so exempting
  // them now just smuggles retired art into a filtered view. It is how
  // Mahoraga's superseded `attack_air`/`attack_heavy` — the last of a design
  // the game no longer draws — kept appearing under "used in game".
  //
  // A pose an actor is EXPECTED to have but nobody has drawn still counts as
  // used: its state names it, so the transform will play it the moment the art
  // lands, and listing it is what makes the set readable as a checklist.
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

  if (!isOther(state.char)) drawRangeTargets(cx);

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
// render time (lightMove / heavyMove, and the VISIBLE_ART_REACH the energy
// wake starts from), so when move data changes, these markers change with it —
// there is no copied number to drift.

// Which concrete moves each attack animation stands for. A frame serving
// several states gets a target per distinct move.
const RANGE_MOVES = {
  light: (c) => [["Jab finisher", lightMove(c, "jab", 2)], ["Side tilt", lightMove(c, "side")]],
  crouchAttack: (c) => [["Down tilt", lightMove(c, "down")]],
  // The aerial frame serves four moves, and they are not all the same shape:
  // the two forward ones, the rising hit above, and the meteor below.
  airLight: (c) => [["Air light", lightMove(c, "air")], ["Air heavy", heavyMove(c, "air")],
                    ["Up air", lightMove(c, "upAir")], ["Meteor", lightMove(c, "downAir")]],
  sideHeavy: (c) => [["Side smash", heavyMove(c, "side")]],
  upHeavy: (c) => [["Up smash", heavyMove(c, "up")]],
  downHeavy: (c) => [["Down smash", heavyMove(c, "down")]],
};

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

function drawRangeTargets(cx) {
  const char = CHARACTERS[state.char];
  if (!char?.light || !char?.heavy) return;   // sprite actors have no kit
  const moves = [];
  for (const anim of statesUsing(state.char, state.frame)) {
    const make = RANGE_MOVES[anim];
    if (!make) continue;
    // Strike frames only: the wind-up of a pair gets no target, because its
    // job is to not have connected yet.
    const frames = resolvedAnim(state.char, anim).frames;
    if (frames.length > 1 && frames.indexOf(state.frame) < frames.length - 1) continue;
    for (const [label, m] of make(char)) moves.push([label, m]);
  }
  if (!moves.length) return;

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
    shapes.push({ label, box });
  }

  // The body the game actually tests, drawn behind the markers (combat.js
  // hurtbox). Without it a target reads as "this attack reaches miles past the
  // fist", because the eye compares it to the DRAWING. The drawing is not what
  // gets hit: hurtboxes are one size for the whole roster — 64x108 standing,
  // against art drawn around 175 tall — so a fighter's reach has to clear their
  // own box and then meet an opponent's, which starts 32px inside their art.
  const crouched = statesUsing(state.char, state.frame)
    .some((a) => a === "crouch" || a === "crouchAttack");
  const hb = crouched ? { w: 72, h: 68 } : { w: 64, h: 108 };
  ctx.strokeStyle = "rgba(120, 200, 255, 0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(wx(-hb.w / 2), wy(-hb.h), hb.w * z, hb.h * z);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(120, 200, 255, 0.8)";
  ctx.textAlign = "right";
  ctx.fillText(`hurtbox ${hb.w}x${hb.h}`, wx(-hb.w / 2) - 5, wy(-hb.h) + 11);
  ctx.textAlign = "left";

  // Where the art stops being trusted: past this the game draws its energy
  // wake (drawReachWakes in render.js), so art short of a far target is fine —
  // the gap is filled in play. Only meaningful against a horizontal reach, so
  // it is drawn only when one is on screen.
  if (shapes.some((s) => s.box.kind === "forward" || s.box.kind === "sweep")) {
    const capX = wx(VISIBLE_ART_REACH);
    ctx.strokeStyle = "rgba(150, 160, 190, 0.5)";
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(capX, GROUND_Y - 190 * z); ctx.lineTo(capX, GROUND_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(150, 160, 190, 0.85)";
    ctx.fillText("art cap — energy wake beyond", capX + 4, GROUND_Y - 190 * z + 10);
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
  shapes.forEach(({ label, box }) => {
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
      // Forward: the crosshair sits on the far edge at the box's mid height,
      // which is the last point this attack connects at.
      const x = wx(x1), cy = wy((y0 + y1) / 2);
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
const PLACEMENT_GROUPS = ["scaleGroup", "offsetGroup", "groundGroup", "rotationGroup",
                          "anchorGroup", "heightGroup", "mirrorGroup", "referenceGroup",
                          "resetGroup"];

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
  for (const id of ["scaleGroup", "offsetGroup", "groundGroup", "rotationGroup",
                    "anchorGroup", "mirrorGroup"]) {
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
  refreshUpdatedControl();
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
  const deg = rawMeta(state.char, state.frame).rotationDeg ?? 0;
  setPair("rotation", deg);
  $("rotationVal").textContent = deg ? `${deg > 0 ? "+" : ""}${deg.toFixed(1)}°` : "square";

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

/** The intake marker on the selected pose, and the way off the list for a pose
 *  that turned out to need nothing. Shown wherever the pose is selected from,
 *  not only inside the updated list — "this art was replaced under you" is worth
 *  reading while tuning the pose it happened to. */
function refreshUpdatedControl() {
  const group = $("updatedGroup");
  if (!group) return;
  const note = updateNote(state.char, state.frame);
  group.hidden = !note;
  if (!note) return;
  const reviewed = isUpdateReviewed(state.char, state.frame);
  $("updatedVal").textContent = reviewed ? "reviewed — clears on export"
    : note.how === "new" ? "new art — never placed"
    : note.how === "surfaced" ? "newly in the in-game list — never sized"
    : note.lost?.length ? "tuning rolled back" : "tuning carried over";
  $("updatedInfo").innerHTML = updateSummary(note);
  const btn = $("updatedClear");
  btn.textContent = reviewed
    ? "↺ Put it back on the updated list"
    : "Mark reviewed — take it off the updated list";
}

/** The dropdown entry carries its own count, so a round that overwrote work
 *  announces itself from the closed select rather than having to be opened. */
function refreshRecentOption() {
  const opt = $("charSel")?.querySelector(`option[value="${RECENT_KEY}"]`);
  if (!opt) return;
  const waiting = recentUpdates().filter((e) => !isUpdateReviewed(e.char, e.frame)).length;
  opt.textContent = waiting ? `${RECENT_LABEL} (${waiting})` : RECENT_LABEL;
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
  // The view filter is a question about one character's poses ("which of these
  // has nobody dealt with"). The updated list is already a filter, of a
  // different kind, so the select is locked while it is open rather than
  // silently ignored.
  $("viewSel").disabled = inRecent();
  if (inRecent()) { buildRecentPoseList(list); return; }

  const frames = framesOf(state.char);
  const hidden = allFramesOf(state.char).length - frames.length;
  const flagged = frames.filter((k) => needsReplacement(state.char, k)).length;
  // The dimmed ones are counted separately and named for what they are waiting
  // on, so the number that matters — how many of these are actually yours to
  // place — can be read off the line rather than counted off the grid.
  $("poseCount").textContent = `${frames.length} shown`
    + (hidden > 0 ? ` · ${hidden} hidden` : "")
    + (flagged > 0 ? ` · ${frames.length - flagged} to place · ${flagged} awaiting redraw` : "");
  if (!frames.length) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "Nothing matches this view.";
    list.appendChild(empty);
  }
  for (const key of frames) list.appendChild(buildPoseEntry(state.char, key));
}

/** One cell of the pose grid. Takes the character rather than reading
 *  `state.char`, because the updated list mixes several in one grid. */
function buildPoseEntry(charKey, key, { owner = false } = {}) {
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
  const sub = owner ? `${actorOf(charKey).name} · ${key}` : label.sub;
  b.innerHTML = sub ? `${label.name}<i class="pose-file">${sub}</i>` : label.name;
  const states = statesUsing(charKey, key);
  const doomed = hasDeleteTag(charKey, key);
  // The dimmed cells need to say WHY they are dim, or they read as disabled.
  const requested = needsReplacement(charKey, key) && !doomed;
  b.title = (owner ? `${charKey}/${key}` : key)
    + (states.length ? ` — ${states.map(stateLabel).join(", ")}` : " — not drawn by any state")
    + (requested ? " — already requested for redraw; placing it now is optional,"
                 + " the replacement is measured from scratch" : "");
  const selected = charKey === state.char && key === state.frame;
  b.className = (selected ? "sel " : "")
    + (isDirty(charKey, key) || variantFlagEdits.has(`${charKey}/${key}`) ? "dirty " : "")
    + (needsReplacement(charKey, key) || doomed ? "flagged " : "")
    + (wantsImprovement(charKey, key) ? "wanted " : "")
    + (isUpdateReviewed(charKey, key) ? "reviewed" : "");
  const kind = doomed ? "delete" : replacementKind(rawMeta(charKey, key));
  if (kind) b.dataset.kind = kind;
  b.onclick = () => selectPose(charKey, key);

  if (!host) return b;
  host.appendChild(b);
  host.appendChild(buildVariantChevron(key, options));
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

/** What the pose grid currently holds, in the order it is drawn — one
 *  character's filtered poses, or the whole roster's updated ones. The arrow
 *  keys walk this, so they cannot disagree with what is on screen. */
function poseEntries() {
  if (inRecent()) return recentUpdates().map((e) => ({ char: e.char, frame: e.frame }));
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
    loadSharedImage(key).then(() => { sharedTried.add(key); refreshUsageInfo(); render(); });
  }
  else charLoader.prioritize(state.frame);
  refreshLoadState();
  render();
}

/** The dropdown selects either a character or the updated list; `state.group`
 *  is which, so the select can be re-pointed from anywhere that moves the
 *  selection (undo, a deep link, a pose in another character's set). */
function syncCharSelect() {
  $("charSel").value = state.group || state.char;
}

/** Pick a real character. */
function setChar(charKey, wantFrame = null) {
  state.group = null;
  openChar(charKey, wantFrame);
}

/** Open the cross-character updated list, on `wantChar/wantFrame` if that pose
 *  is on it and on the first entry otherwise. An empty list leaves the pose on
 *  screen alone: there is nothing to select, and blanking the canvas to say so
 *  would be worse than the note in the list. */
function setRecent(wantChar = null, wantFrame = null) {
  state.group = RECENT_KEY;
  const entries = recentUpdates();
  const target = entries.find((e) => e.char === wantChar && e.frame === wantFrame) || entries[0];
  if (target) { openChar(target.char, target.frame); return; }
  // Nothing on the list: the pose on screen stays put behind the note. At boot
  // there is no pose yet to stay on, so the character asked for is opened —
  // an empty list must not leave a blank canvas.
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
  const list = inRecent() ? "updated" : null;
  if (url.searchParams.get("char") === state.char
      && url.searchParams.get("frame") === state.frame
      && (url.searchParams.get("list") || null) === list) return;
  url.searchParams.set("char", state.char);
  if (state.frame) url.searchParams.set("frame", state.frame);
  else url.searchParams.delete("frame");
  if (list) url.searchParams.set("list", list);
  else url.searchParams.delete("list");
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

/** Poses of this character marked reviewed this session, as pose keys. */
function clearedUpdates(charKey) {
  return [...updatesCleared]
    .map((id) => id.split("/"))
    .filter(([who]) => who === charKey)
    .map(([, pose]) => pose)
    .sort();
}

/** Every character this session may have something to export for. `originals`
 *  covers everything touched; a review tick is the one thing that can be
 *  recorded against a pose without editing it, so it joins in. */
function editedChars() {
  return [...new Set([
    ...Object.keys(state.originals),
    ...[...updatesCleared].map((id) => id.split("/")[0]),
  ])];
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
          ...takeBanked(o),
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
  // Poses whose new art turned out to need nothing. An adjusted pose leaves the
  // updated list on the strength of the adjustment, so only the untouched ones
  // have to be named here.
  const reviewed = clearedUpdates(charKey).filter((pose) => !out[pose]);
  if (reviewed.length) payload.clearUpdated = reviewed;
  const actions = dirtyActions(charKey);
  if (Object.keys(actions).length) payload.animOverrides = actions;
  // The pinned reference travels with the edit that caused it, or the applied
  // manifest would re-derive the span from the new idle and resize the set.
  const span = spriteManifest?.heightSpans?.[charKey];
  if (Number.isFinite(span) && span !== state.originalSpans[charKey]) payload.heightSpan = span;
  return (payload.headHeight !== undefined || payload.adjustments || payload.animOverrides
          || payload.heightSpan !== undefined || payload.variantPlacement
          || payload.clearUpdated) ? payload : null;
}

/** Everything edited this session, across every character.
 *
 *  A session usually walks the whole roster, so exporting only the character
 *  on screen loses the rest the moment you switch. `apply_sprite_adjustments.py`
 *  already accepts an array, so a multi-character export needs nothing new on
 *  the other end. A lone character still exports as a bare object. */
function exportAll() {
  const payloads = editedChars()
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
  rotation: { show: (v) => v, store: (v) => v, digits: 1 },
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
  // The fighters, alphabetically — the dropdown is something you go to a known
  // name in, and roster order is only meaningful on the select screen. Then a
  // rule, and under it the entries that are not fighters: an actor with its own
  // sprite set (Mahoraga), the shared effect and summon art, and the
  // cross-character work list, which is not a sprite set at all.
  const fighters = [...CHARACTER_KEYS]
    .sort((a, b) => CHARACTERS[a].name.localeCompare(CHARACTERS[b].name));
  for (const key of fighters) {
    const o = document.createElement("option");
    o.value = key;
    o.dataset.name = CHARACTERS[key].name;
    o.textContent = o.dataset.name;
    charSel.appendChild(o);
  }
  // A disabled option rather than an <hr>: it is the separator every browser
  // renders, and being unselectable it cannot be landed on by keyboard either.
  const rule = document.createElement("option");
  rule.disabled = true;
  rule.textContent = "──────────";
  charSel.appendChild(rule);
  for (const key of [...ACTOR_KEYS, OTHER_KEY, RECENT_KEY]) {
    const o = document.createElement("option");
    o.value = key;
    o.dataset.name = key === RECENT_KEY ? RECENT_LABEL
      : isOther(key) ? OTHER_LABEL
      : `${actorOf(key).name} (not a fighter)`;
    o.textContent = o.dataset.name;
    charSel.appendChild(o);
  }
  charSel.onchange = () =>
    (charSel.value === RECENT_KEY ? setRecent() : setChar(charSel.value));

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
  // Actors own a full sprite set and are edited here like anyone else, so their
  // shipped centres of mass have to be resolved before any of these controls
  // can move the numbers those defaults are derived from.
  warmAnchors([...CHARACTER_KEYS, ...ACTOR_KEYS]);
  $("loadState").textContent = "manifest loaded";
  markEditedChars();
  refreshRecentOption();

  const params = new URLSearchParams(location.search);
  const wanted = params.get("char");
  // The same set the dropdown offers. Restricting the deep link to fighters
  // made Mahoraga selectable but not linkable, which is backwards: a
  // non-fighter is exactly what someone needs a link to, having no card or
  // roster tile to find it by.
  const selectable = [...CHARACTER_KEYS, ...ACTOR_KEYS, OTHER_KEY];
  const startChar = selectable.includes(wanted) ? wanted : "gojo";

  // `?frame=` lets the action workbench hand off a specific pose to edit. It is
  // resolved BEFORE setChar so the pose you were sent to is the one fetched
  // first, rather than fetching the default idle and then discarding it.
  const frame = params.get("frame");
  const wantedFrame = frame && allFramesOf(startChar).includes(frame) ? frame : null;
  // `?list=updated` comes back to the cross-character updated list rather than
  // to the character the pose happens to belong to — which list you were working
  // through is as much a part of where you were as which pose is selected.
  if (params.get("list") === "updated") setRecent(startChar, wantedFrame);
  else setChar(startChar, wantedFrame);
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
