// Sprite Workbench — live editor for per-frame renderScale, horizontal offset
// and ground-contact height.
//
// Everything is drawn through the GAME'S OWN modules (assets.js, sprites.js,
// characters.js, render.js), and adjustments mutate the very manifest objects
// the renderer reads. So the preview can never drift from what the game shows,
// and any fix applied elsewhere in the pipeline appears here immediately.

import {
  loadCoreAssets, loadFrame, frameImage, spriteManifest, sharedSpriteKeys, loadSharedImage, getImage,
  forgetSharedMirror,
  frameMeta, loadSpriteFile, spriteFileImage, sharedFileOf,
} from "../../src/assets.js";
import {
  drawCharFrame, anchorLocal, anchorsForFrame, statesUsingFrame, isAirborneOnly, isAnchorPlaced, animsOf, resolvedAnim,
  drawnByFallbackOnly,
  anchorScreenPos, screenPosToLocal, warmAnchors, EXTRA_ANCHORS,
  REPLACEMENT_KINDS, replacementKind, IMPROVEMENT_KINDS, improvementKind,
  variantsOf, VARIANT_BANKED, VARIANT_ONLY_KINDS, NOTE_FIELDS, ALTERNATE_KIND,
} from "../src/sprites.js";
import { drawPlatformShape } from "../../src/render.js";
import {
  applySharedSpriteScales, sharedSpriteInfo, SPRITE_LIST_KEY_FIELDS, sharedHit,
} from "../../src/shared_sprites.js";
import { lightMove, heavyMove, visibleArtReach, strikeArcs } from "../../src/moves.js";
import { bodyMetrics, refreshSilhouettes } from "../../src/silhouette.js";
import { muzzleOf, spawnOffset, REFERENCE_MUZZLE } from "../../src/muzzle.js";
import { PIVOTED_STATES } from "../../src/motion.js";
import { HURTBOX, GRAB } from "../../src/constants.js";
import { HEIGHT_BASE_PX } from "../../src/config_tuning.js";
import { CHARACTERS, CHARACTER_KEYS, STAGED_CHARACTER_KEYS, SPRITE_ACTORS, getActor }
  from "../../src/characters.js";
import { TRANSFORM_POSES, TRANSFORM_POSE_ALTERNATIVES } from "../../src/config_transform.js";
import {
  headHeightTarget, applyHeightScale, hasHeightOverride, heightRatio, measuredIdleSpan,
  heightLabel,
} from "../../src/heights.js";
import { actorPosesReady } from "../../src/ultimates.js";
import { initTooltips, setHelp } from "./tooltip.js";
import { makeCharLoader, frameLoaded } from "./lazy_sprites.js";
import { fitStageCanvas } from "./fit_stage.js";
import { makeEffectPreview, firingUse } from "./effect_preview.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");

// The floor line, in canvas pixels. Sits low in the frame on purpose: a pose
// extends UPWARD far more than it extends down — an ultimate, a ledge hang, an
// up-heavy all reach for the top of the canvas, while nothing but a weapon tip
// goes below the feet — so the headroom is worth more than the footroom.
const GROUND_Y = 516;
// The platform the stage draws, and how far onto it the size benchmark stands.
const PLATFORM_W = 680;
// Centred on whatever the canvas is, rather than on the 760 it used to be, so
// widening the viewer keeps the platform and the comparison slot under the
// middle of it. `canvas` is not defined yet at module scope, so this is a
// getter rather than a constant.
const platformX = () => canvas.width / 2 - PLATFORM_W / 2;
const BENCHMARK_INSET = 78;
const CELL_W = 313.5;
// Scalar fields the workbench can edit. `anchors` is edited too but is nested,
// so snapshot/restore/compare handle it separately.
const EDITABLE = ["renderScale", "ox", "bodyBottom", "rotationDeg", "faceLeft",
                  // Shared drawings only: a nudge in GAME pixels away from the
                  // point the spawn site paints them on. A pose uses `ox` and
                  // `bodyBottom` for the same two directions, because a pose is
                  // placed inside its cell and one of these is not.
                  "dx", "dy",
                  // ...and where the MOVE creates it, which is a different
                  // point entirely: `dx`/`dy` move the picture onto the spawn
                  // point, these move the spawn point onto the character (a
                  // lance of blood should leave the finger). Exported as a note
                  // against the kit, since `ox`/`oy` live in characters.js.
                  "spawnOx", "spawnOy",
                  // A few frames of ramp as an energy shot leaves, in seconds
                  // (sharedFadeIn). Set in the Play window, where whether it is
                  // enough is a thing you can actually see.
                  "fadeIn",
                  "needsReplacement", "wantsImprovement",
                  "replacementNote", "improvementNote"];
// Fields whose VALUE is a kind string rather than a number, so a change of kind
// is a change and `false` means "cleared" rather than "unset".
const KIND_FIELDS = { needsReplacement: replacementKind, wantsImprovement: improvementKind };
// Fields that are true/false rather than a number, so comparison and export
// treat them differently (and `false` is a meaningful value, not "unset").
const BOOLEAN_FIELDS = new Set(["faceLeft"]);
// Free text written beside a flag. Compared as strings and exported verbatim;
// the empty string is meaningful, clearing a note rather than leaving it.
const TEXT_FIELDS = new Set(Object.values(NOTE_FIELDS));

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
  // Not a filter on this character's own poses at all — a different SET,
  // narrowed to them: the shared effect and summon art their kit draws. It
  // lives in this dropdown because that is where you are standing when the
  // question arises, and framesOf below is where the swap happens.
  effects: { label: "Effects this fighter uses", keep: () => true, shared: true },
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

// Fighters the workbench edits: the roster, plus the ones still staged.
//
// A staged fighter is off the select screen because their art is not finished
// (STAGED_CHARACTER_KEYS, src/characters.js) — which makes them exactly the set
// somebody needs this tool for. Their sprites arrive through the same intake,
// land on the same updated list, and wait for the same approval; leaving them
// out meant a delivery could not be looked at until the fighter was already
// live, which is backwards. They are labelled in the dropdown rather than
// hidden, because "not in the game yet" changes what an approval means: it
// settles what the art WILL be, not what a player sees today.
const WB_FIGHTERS = [...CHARACTER_KEYS, ...STAGED_CHARACTER_KEYS];
const isStaged = (key) => STAGED_CHARACTER_KEYS.includes(key);

// The entry that is not a sprite set at all: a cross-character work list of
// poses an intake round wrote over work already done. See recentUpdates().
const RECENT_KEY = "__recent";
const RECENT_LABEL = "All Recently Updated Poses";

// Its sibling: the poses somebody has asked to have DRAWN AGAIN. The updated
// list answers "what landed and still needs placing"; this one answers "what
// did I reject", which is the question a request round is written from and
// which was only answerable by opening all twenty-eight characters in turn.
//
// A flag is not a rejection once the pose has been pointed at another drawing.
// That falls out of where the flag is read rather than being special-cased
// here: `needsReplacement` reads the POSE, and the pose mirrors whichever
// option it currently uses (poseView), so choosing a good drawing takes it off
// this list while the bad drawing keeps its own tag for the variants menu.
const FLAGGED_KEY = "__flagged";
const FLAGGED_LABEL = "All Needing Regeneration";

const isOther = (charKey) => charKey === OTHER_KEY;
const isActor = (charKey) => ACTOR_KEYS.includes(charKey);
const inRecent = () => state.group === RECENT_KEY;
const inFlagged = () => state.group === FLAGGED_KEY;
/** Either cross-character work list — neither is a sprite set. */
const inList = () => inRecent() || inFlagged();

/** Character-ish record for anything selectable, real fighter or not. */
function actorOf(charKey) {
  if (isOther(charKey)) return { name: OTHER_LABEL, scale: 1 };
  return getActor(charKey) || { name: charKey, scale: 1 };
}

/** The character whose kit spawns this shared sprite, if one does. The usage
 *  index records the name for reading; this wants the key, to draw them. */
function sharedOwner(key) {
  // The REGISTRY's owner first. Both indexes walk the same kits, but only the
  // registry knows the difference between a move that spawns a drawing and a
  // creature pool that merely lists it as a stand-in — it files stand-ins last,
  // so the fighter it names is the one whose move this art belongs to. Reading
  // the raw usage order instead stood Megumi beside Panda's triceratops,
  // because the shikigami pool happens to list it before Panda's ultimate
  // declares it. On a size reference that is not a cosmetic error: the whole
  // judgement is "how big is this next to the man who throws it", and it was
  // being made against the wrong man.
  //
  // Only when it names a FIGHTER, though. A creature's registry owner is the
  // creature itself — "Divine Dogs", "Transfigured Human" — which is the right
  // answer to "whose drawing is this" and no answer at all to "who do we stand
  // it beside". Those fall through to the usage index, which records the
  // fighter whose kit the pool hangs off.
  const byName = (name) => WB_FIGHTERS.find((k) => CHARACTERS[k]?.name === name) || null;
  // A creature POSE (`summon:toad:idle_a`) is not itself referenced by any kit —
  // the creature is — so the lookup falls back to the creature the same way the
  // manifest does. Without it every pose of every shikigami stood beside Gojo,
  // the last-resort reference, instead of beside the fighter who summons them.
  const creature = key.split(":").length === 3 ? key.split(":").slice(0, 2).join(":") : null;
  const usage = (k) => (sharedUsage().get(k) || [])[0]?.who;
  // THE FIGHTER YOU ARE STANDING IN BEATS THE DEFAULT. A drawing two kits draw
  // has one registry owner and it is whoever the walk reached first, which is
  // the right answer to "whose drawing is this" and the wrong one to "who am I
  // looking at". `effect:curse_dragon` is the stand-in for Megumi's Great
  // Serpent AND Geto's Rainbow Dragon: opened from Geto's effects list it was
  // standing Megumi beside it, which is a reference to the wrong body and a
  // wrong answer about size. Whoever's list this was opened from wins, as long
  // as their kit really does draw it.
  const inContext = state.effectsOwner
    && (sharedUsage().get(key) || []).some((u) => u.charKey === state.effectsOwner && !u.dead)
    ? state.effectsOwner : null;
  return inContext
    || byName(sharedSpriteInfo(key)?.owner)
    || byName(usage(key))
    || (creature ? byName(sharedSpriteInfo(creature)?.owner) || byName(usage(creature)) : null);
}

/** Where a shared sprite is drawn from, and how tall the game draws it. Built
 *  by walking the kits for `sprite:`/`sprites:` references, so it stays true as
 *  moves change instead of being a second list to maintain. */
/** Is `key` a fallback in `stack` that an earlier entry's art already covers?
 *
 *  Mirrors summons.js: the creature is drawn from its own pose set when it has
 *  one, and every entry behind it is dead weight. Only entries AFTER the first
 *  drawable one can be superseded — the head of the stack is the creature. */
function supersededStandIn(stack, key, cfg) {
  // A creature that animates through an ACTOR — a full sprite set of its own —
  // never draws its still either. Mahoraga has one and it is complete, so
  // summons.js takes the actor branch every time (`drawActor`) and
  // `summon:mahoraga.png` is a fallback for art that is no longer missing. He
  // was showing up as a creature to size, and mirrored by the creature rule
  // rather than the character one, which is why he faced the wrong way.
  if (cfg?.actor && actorPosesReady(cfg.actor)) return true;
  const i = stack.indexOf(key);
  if (i <= 0) return false;
  // Asked of the REGISTERED fetches rather than of loaded images: this index is
  // built once, early, and a check against what happens to be in memory would
  // answer differently depending on how far the page had got.
  registeredShared ||= new Set(sharedSpriteKeys());
  const has = (k) => registeredShared.has(k) || registeredShared.has(`${k}:idle_a`);
  return stack.slice(0, i).some(has);
}
let registeredShared = null;

let sharedUsageCache = null;
function sharedUsage() {
  if (sharedUsageCache) return sharedUsageCache;
  sharedUsageCache = new Map();
  const note = (key, who, label, h, charKey, dead) => {
    if (!key) return;
    const list = sharedUsageCache.get(key) || [];
    list.push({ who, label, h, charKey, dead: !!dead });
    sharedUsageCache.set(key, list);
  };
  const walk = (node, who, label, charKey) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.sprite === "string") note(node.sprite, who, label, node.spriteH, charKey);
    // Every list-valued field shared_sprites.js walks, read from that file so
    // the two cannot drift. They did: this knew `sprites` and not `spritePool`,
    // so Geto's four volley curses had no height here, the header called them
    // "sized by the code that spawns it" and the Size control went away — on
    // the four drawings whose size the workbench is the only way to set.
    for (const field of SPRITE_LIST_KEY_FIELDS) {
      if (!Array.isArray(node[field])) continue;
      for (const k of node[field]) {
        // A creature's `sprites` is a stack, not a set: summons.js draws
        // `poseKeyOf(...)` and only reaches a later entry where NO pose art
        // landed (src/summons.js, drawStill). Mahito's Crawlers shipped all six
        // plates, so `effect:curse_b` — the stand-in behind them — is never
        // drawn for him, and listing it under his effects sent you to align art
        // against a body that never shows it. Recorded as a dead stand-in
        // rather than dropped, so the panel can still say who kept it.
        const dead = field === "sprites" && supersededStandIn(node[field], k, node);
        note(k, who, label, node.spriteH, charKey, dead);
      }
    }
    if (typeof node.aura === "string") note(node.aura, who, `${label} (aura)`, node.spriteH, charKey);
    if (typeof node.domainSprite === "string") note(node.domainSprite, who, `${label} (domain)`, node.spriteH, charKey);
    // The two kit shapes that name a drawing under their own field names.
    // Missing them made five drawings read as "nothing references this" —
    // Reggie's three falling objects and Mechamaru's pigeon orbs — which then
    // hid them from the used-in-game view and took their Size slider away.
    if (typeof node.orbSprite === "string") note(node.orbSprite, who, `${label} (orbs)`, node.orbSpriteH, charKey);
    if (typeof node.key === "string" && node.key.startsWith("effect:")) {
      note(node.key, who, `${label}${node.name ? ` — ${node.name}` : ""}`, node.h, charKey);
    }
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, who, label, charKey);
  };
  for (const key of WB_FIGHTERS) {
    const c = CHARACTERS[key];
    for (const [slot, def] of Object.entries(c.specials || {})) walk(def, c.name, def.name || slot, key);
    if (c.ultimate) walk(c.ultimate, c.name, c.ultimate.name || "Ultimate", key);
  }
  return sharedUsageCache;
}

/** The colour an install glows in — its kit's `p.color`, carried through the
 *  shared registry. The aura art is a white-ish plate that the game tints by
 *  glowing it in this colour, so a preview that skips it is showing the plate
 *  rather than the effect. Falls back to the game's own default cyan. */
function installColorOf(key) {
  return sharedSpriteInfo(key)?.installColor || "#8fd3ff";
}

/** The moves of `charKey` that draw this shared art, named — "Piercing Blood",
 *  "Overtime (aura)". Joined when a kit names the same drawing from more than
 *  one move, because that is a fact about the drawing worth seeing before you
 *  resize it: the other move is about to move too. */
function movesDrawing(key, charKey) {
  const labels = (sharedUsage().get(key) || [])
    .filter((u) => u.charKey === charKey)
    .map((u) => u.label);
  return [...new Set(labels)].join(" · ") || null;
}

/** The shared effect/summon art THIS fighter's kit draws.
 *
 *  The Other Sprites set is one long alphabetical list of every drawing in the
 *  game, which is the right shape for working through it and the wrong shape
 *  for the question that actually comes up: I am looking at Gakuganji, which
 *  of these are his. Same drawings, filtered by whose kit names them. */
function effectsOf(charKey) {
  const out = [];
  for (const [key, uses] of sharedUsage()) {
    // A stand-in the fighter's own creature art supersedes is not one of their
    // effects — it is a fallback nothing reaches. Listing it sent you to tune a
    // drawing against a body that never draws it.
    if (uses.some((u) => u.charKey === charKey && !u.dead)) out.push(key);
  }
  return out.sort();
}

const HANDLE_R = 7;

/** The "not a request" entry in the replacement menu — see its onchange. */
const BORROW_OPTION = "__chooseSprite";

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
  dragAttack: null,
  // Dragging the hit circle: "move" on its centre, "size" on its rim.
  dragHit: null,
  // RECENT_KEY while the cross-character updated list is open. `char` stays a
  // real character throughout — every control below edits the pose that is
  // selected, and which list it was picked from changes nothing about that.
  group: null,
  // The fighter whose "Effects this fighter uses" list is open, while the thing
  // being EDITED is a shared drawing in `__other`. The two have to be held
  // apart: a shared drawing's numbers only exist in the shared set, so `char`
  // has to go there, but the list you picked it from is a question about a
  // kit and belongs to the fighter. Null whenever the list is not open.
  effectsOwner: null,
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
    // EVERYTHING THE GAME CAN DRAW, which is more than everything with a file.
    // `sharedSpriteKeys` lists registered fetches, and a creature whose art is a
    // pose set has no fetch under its own name — `summon:curseHound` is a name,
    // its six plates are the files. It was therefore missing from this list,
    // which is what `dirtyFrames` walks, so an edit stored against the creature
    // (its attack box, which is one fact about the creature and not six) could
    // never be exported. The kits know it exists; that is the other half of the
    // set.
    const named = new Set([...sharedSpriteKeys(), ...sharedUsage().keys()]);
    return [...named].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
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

/** A replacement that has landed but is NOT in the game yet.
 *
 *  Since the roster finished, an intake round no longer overwrites art on
 *  arrival: it lands the new drawing beside the old one as a variant marked
 *  `pending` and leaves the pose pointing where it was, so what players see is
 *  unchanged until somebody stands the two side by side and picks. This is that
 *  state — the confirm step, and the thing the dot in the character dropdown
 *  now counts first. See hold_for_approval() in tools/intake_import.py.
 */
function approvalNote(charKey, frameKey) {
  return rawMeta(charKey, frameKey)?.awaitingApproval || null;
}

function awaitingApproval(charKey, frameKey) {
  return !!approvalNote(charKey, frameKey);
}

/** Poses the pose list offers, filtered by the current view. May be empty —
 *  "Edited only" on an untouched character legitimately matches nothing, and
 *  quietly widening the filter would be a lie about what you are looking at.
 *  The selected pose stays on the canvas either way. */
function framesOf(charKey) {
  const view = VIEWS[state.view] || VIEWS.unedited;
  // The effects view answers a question about the KIT rather than about the
  // sprite sheet, so it lists shared drawings instead of this character's
  // poses. They belong to the `__other` set and are edited there; the cells
  // carry their owner and selecting one takes you to it.
  // Selecting one of them opens the shared set to edit it — that is where a
  // shared drawing's numbers live — and the list has to survive that, or the
  // view empties itself the moment it is used: `charKey` is `__other` from the
  // first click on, and `__other` has no kit to walk. `effectsOwner` is the
  // fighter whose list this is, remembered across that hop.
  if (view.shared) {
    const owner = isOther(charKey) ? state.effectsOwner : charKey;
    return owner ? effectsOf(owner) : [];
  }
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
  if (isOther(charKey)) return sharedTodoNote(frameKey);
  const meta = spriteManifest?.characters?.[charKey]?.[frameKey];
  // A pose still waiting to be approved belongs on the list whatever else has
  // happened to it. The `replaced` marker clears the moment the pose is
  // adjusted — which is right for a re-tune, and wrong here: placing the new
  // art is exactly what you do BEFORE deciding, so tuning it dropped the pose
  // off the queue while the game was still drawing the old drawing. The
  // approval is the thing being tracked, so it outranks the marker.
  if (meta?.awaitingApproval) {
    return meta.replaced || { at: meta.awaitingApproval.at || "", kept: "await",
                              how: "await", lost: [] };
  }
  return meta?.replaced || surfacedNote(charKey, frameKey);
}

/**
 * A SHARED DRAWING NOBODY HAS DECIDED ABOUT, for the same list.
 *
 * The updated list is where work that is scattered across the roster goes to be
 * found, and shared art has exactly that shape: it belongs to no character, so
 * the only way to work through it was to open Other Sprites and remember which
 * of ninety drawings you had already looked at. The "no saved edits" view
 * answers the question one character at a time, and shared art has no
 * character.
 *
 * A drawing counts as undecided when the game draws it and nobody has saved a
 * number against it. A MACHINE-placed number does not count — `autoTuned` is
 * how auto_tune records a starting point, and it means the same thing here: the
 * four creatures whose facing was read off their own plates rather than chosen
 * are on this list precisely so somebody can disagree.
 */
function sharedTodoNote(frameKey) {
  if (!frameKey || !isUsed(OTHER_KEY, frameKey)) return null;
  // "I looked at this and it needed nothing" is a decision about the drawing,
  // and this list is a list of undecided ones. It is the same marker a pose
  // leaves by (`surfacedReviewed`, written by apply_sprite_adjustments.py) and
  // it is read explicitly rather than counted as a number below, because it is
  // a record of the looking rather than a placement.
  if (peekMeta(OTHER_KEY, frameKey)?.surfacedReviewed) return null;
  // A DRAWING WITH NOTHING TO DECIDE is not undecided. A domain backdrop is
  // cover-fitted to the whole stage (drawDomainBackdrop, render.js): no size,
  // no offset, no tilt, and the panel says so. All nine sat here permanently,
  // because the only way off this list is a number and there is no number to
  // set — a to-do item nobody could ever do. What such a drawing still has is a
  // redraw flag, which is the other list and the right place for "this backdrop
  // is wrong".
  const controls = sharedControls(frameKey);
  if (controls && !controls.size && !controls.offset && !controls.rotate) return null;
  // One entry per DRAWING. A creature's six poses are one drawing set with one
  // set of numbers (entryOf, shared_sprites.js), so listing each pose would put
  // the same decision on the list six times and bury everything else.
  if (attackBoxKey(frameKey) !== frameKey) return null;
  const meta = rawMeta(OTHER_KEY, frameKey);
  const auto = meta?.autoTuned?.fields || {};
  // NOT `hasSavedEdits`. That reads the `edited` record, which several tools
  // write and several older ones did not: effect:piercing_blood carries a
  // renderScale and two nudges and no `edited` at all, and calling that
  // untouched would have put most of the finished work back on the to-do list.
  // A NUMBER AGAINST THE DRAWING is the decision; the record of it is
  // bookkeeping. A number a machine placed is not a decision — same rule
  // auto_tune has always followed — so it is subtracted here.
  const decided = meta && Object.keys(meta).some((f) =>
    !BOOKKEEPING.has(f) && !(f in auto) && meta[f] != null);
  if (decided) return null;
  return { at: meta?.autoTuned?.at || "", kept: "keep",
           how: Object.keys(auto).length ? "placed" : "unreviewed", lost: [] };
}

/** Fields on a shared entry that are not somebody's decision about the art. */
const BOOKKEEPING = new Set(["edited", "src", "autoTuned", "surfacedReviewed"]);

// A second way onto the list, and the same job: poses that need a look now and
// would otherwise have to be hunted for.
//
// `statesUsingFrame` used to answer against the frames a state DECLARES rather
// than the ones it resolves to, so a pose the game only reaches through its
// state's `fallback` was reported unused — filtered out of the in-game views,
// and so never opened to be sized. Fixing that (sprites/src/sprites.js) hands the
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

// The dot beside a name in the character dropdown: this sprite set has WORK
// LEFT. It used to mean the opposite — "already worked on" — which was the
// right signal while most of the roster was untouched, but every character has
// been through a pass now, so a dot on all of them said nothing. Inverted, it
// is a to-do list again, and it answers the question you actually ask when
// picking who to do next.
//
// Committed state only, so a set does not sprout or lose its dot as you nudge
// things this session; that is what the dirty markers are for.
const TODO_MARK = "\u25cf ";
const NO_TODO_PAD = "  ";

/** What is still waiting on this character, as a short reason or null.
 *
 *  Two things count, ordered by how much they block: art the game is NOT yet
 *  drawing because nobody has approved it, then poses nobody has placed. Both
 *  read committed state.
 */
function charTodo(charKey) {
  const frames = allFramesOf(charKey);
  const waiting = frames.filter((k) => awaitingApproval(charKey, k)).length;
  if (waiting) return `${waiting} replacement${waiting === 1 ? "" : "s"} awaiting approval`;
  const unplaced = frames.filter((k) => isUsed(charKey, k) && !hasSavedEdits(charKey, k)).length;
  return unplaced ? `${unplaced} pose${unplaced === 1 ? "" : "s"} with no saved edits` : null;
}

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
  // The shared set is walked from its own key list rather than from the
  // manifest, because a drawing nobody has ever tuned has no manifest entry to
  // be found under — and those are exactly the ones this list is for.
  const sets = [...WB_FIGHTERS, ...ACTOR_KEYS].map((c) =>
    [c, Object.keys(spriteManifest?.characters?.[c] || {})]);
  sets.push([OTHER_KEY, allFramesOf(OTHER_KEY)]);
  for (const [charKey, frames] of sets) {
    for (const frameKey of frames) {
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
  // A machine-placed number leads the undecided ones: it is a claim waiting to
  // be agreed with, which is more urgent than a drawing nobody has touched.
  const rank = (e) => (e.how === "placed" ? 2 : e.how === "unreviewed" ? 3
                       : e.how === "surfaced" ? 2.5 : e.how === "new" ? 1 : 0);
  return out.sort((a, b) =>
    rank(a) - rank(b)
    || b.at.localeCompare(a.at)
    || (b.lost.length ? 1 : 0) - (a.lost.length ? 1 : 0)
    || a.char.localeCompare(b.char)
    || a.frame.localeCompare(b.frame));
}

/** Every pose flagged for a redraw, across the whole roster.
 *
 *  The counterpart to recentUpdates(): that one is what ARRIVED, this one is
 *  what was sent back. It is the list an art round is written from, and until
 *  now the only way to read it was to open each character and count the
 *  flagged cells — which is how a flag set in one session got forgotten by the
 *  next.
 *
 *  WHAT IS NOT ON IT. A pose whose flag is still on a drawing it no longer
 *  uses. Marking the delivered art bad and then pointing the pose at a good
 *  alternate is a fix, not a rejection, and asking for it again would commission
 *  a drawing that is already there. Nothing here enforces that: `needsReplacement`
 *  reads the pose, the pose mirrors the option it points at, so a reassigned
 *  pose is simply not flagged any more. The bad drawing keeps its own tag,
 *  which is what the variants menu and `delete` want.
 *
 *  Grouped by kind — the same order the flag's own menu offers, so the list
 *  reads as "these were rejected outright, then these want another pass" —
 *  and by character within it, so it holds still while it is worked through. */
function flaggedPoses() {
  const out = [];
  // allFramesOf rather than the manifest's own keys, because the shared effect
  // and summon art keeps its flags in a section beside the characters — read
  // the characters map and every rejected effect plate is missing from the one
  // list that exists to find them.
  for (const charKey of [...WB_FIGHTERS, ...ACTOR_KEYS, OTHER_KEY]) {
    for (const frameKey of allFramesOf(charKey)) {
      const kind = replacementKind(peekMeta(charKey, frameKey));
      // `delete` is about one drawing among several, not about the pose, and
      // poseView already keeps it off a pose. Guarded again because this walks
      // the manifest directly and a shared sprite's flags do not go through it.
      if (!kind || VARIANT_ONLY_KINDS.has(kind)) continue;
      out.push({ char: charKey, frame: frameKey, kind });
    }
  }
  const order = REPLACEMENT_KINDS.map(([k]) => k);
  const rank = (e) => {
    const i = order.indexOf(e.kind);
    return i < 0 ? order.length : i;
  };
  return out.sort((a, b) =>
    rank(a) - rank(b)
    || a.char.localeCompare(b.char)
    || a.frame.localeCompare(b.frame));
}

/** Every pose with a redraw flag ANYWHERE on it — on the drawing it uses now or
 *  on one of its alternates. The superset flaggedPoses() narrows.
 *
 *  Only the difference between the two is interesting, and it is the whole
 *  point of the list: a pose in here but not in there is one somebody rejected
 *  and then fixed by choosing another drawing. Nothing on screen distinguishes
 *  those, which is why the smoke asserts against this rather than against a
 *  fixture it would have to stage. */
function allFlagBearingPoses() {
  const out = [];
  for (const charKey of [...WB_FIGHTERS, ...ACTOR_KEYS, OTHER_KEY]) {
    for (const frameKey of allFramesOf(charKey)) {
      const own = replacementKind(peekMeta(charKey, frameKey));
      const any = poseVariants(charKey, frameKey)
        .some((o) => o.needsReplacement && !VARIANT_ONLY_KINDS.has(o.needsReplacement));
      if ((own && !VARIANT_ONLY_KINDS.has(own)) || any) out.push({ char: charKey, frame: frameKey });
    }
  }
  return out;
}

/** What was overwritten, in a sentence. Reads off the marker rather than
 *  guessing, so "nothing was lost" is stated rather than implied by silence. */
function updateSummary(note) {
  if (note.how === "unreviewed") {
    return "The game draws this and <b>nobody has set a number against it</b> — "
      + "it is on whatever size and position the pipeline gave it.<br>"
      + "Play it in action to see what it has to match, then place it, or mark "
      + "it reviewed if it is already right.";
  }
  if (note.how === "placed") {
    return "Something here was <b>placed by a machine, not chosen</b> — it is "
      + "on this list so somebody can disagree with it.<br>"
      + "The panel says which field and why. Change it, or mark it reviewed to "
      + "agree with it.";
  }
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
  if (note.how === "await") {
    return "New art for this pose is in the repo and <b>the game is still drawing "
      + "the old drawing</b>. Place it, compare the two, then approve or keep — "
      + "the buttons are below the sliders.";
  }
  if (note.how === "alternate") {
    const at = note.at ? new Date(note.at) : null;
    const when = at && !Number.isNaN(at.getTime()) ? at.toLocaleString() : (note.at || "an earlier round");
    return `An alternate you asked for arrived on ${when}, beside the drawing `
      + "this pose already had.<br>"
      + "<b>Nothing changed on screen</b> — the game still draws the original. "
      + "Open the chevron to compare them and pick, or mark it reviewed to keep "
      + "what is there.";
  }
  const how = note.how === "variant"
    ? "a delivered alternate was selected over it"
    : "new art was imported over it";
  const lost = (Array.isArray(note.lost) ? note.lost : []);
  const what = lost.length
    ? `Rolled back: <b>${lost.join(", ")}</b> — this pose needs tuning again.`
    : "The tuning was carried across intact — worth a look, not a re-tune.";
  return `${how} on ${landed}.<br>${what}`;
}

/** What tools/auto_tune.py did to this pose, if anything.
 *
 *  Deliberately NOT an edit. The tuner only ever replaces numbers the pipeline
 *  derived, using rules measured from hand tuning (sprites/docs/sprite-auto-adjust.md),
 *  so a tuned pose is still a pose nobody has looked at — it stays on the "no
 *  saved edits" list and on the updated list, and `hasSavedEdits` never reads
 *  this. It is shown so the numbers in the panel are not mistaken for either a
 *  raw pipeline guess or somebody's decision. */
function autoTuneSummary(charKey, frameKey) {
  const note = rawMeta(charKey, frameKey)?.autoTuned;
  const fields = note && note.fields;
  if (!fields || !Object.keys(fields).length) return null;
  const when = note.at ? new Date(note.at) : null;
  const landed = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString() : (note.at || "an earlier round");
  const rows = Object.entries(fields)
    .map(([f, why]) => `<b>${f}</b> — ${why}`).join("<br>");
  return `Placed automatically on ${landed} from rules measured across the `
    + `roster:<br>${rows}<br>`
    + "This is a starting point, not a decision — the pose still needs your eye.";
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

/** The same object, but WITHOUT bringing it into being.
 *
 *  `rawMeta` creates a shared sprite's entry on demand, which is right when
 *  something is about to be written to it and wrong when the whole roster is
 *  being read. flaggedPoses() walks every sprite there is; doing that through
 *  rawMeta would seed an empty object for each one and quietly undo the
 *  "an untouched sprite adds nothing to the file" promise above. */
function peekMeta(charKey, frameKey) {
  if (isOther(charKey)) return spriteManifest?.otherSprites?.[frameKey] || null;
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
  out.attackBox = meta.attackBox ? { ...meta.attackBox } : null;
  out.hit = meta.hit ? { ...meta.hit } : null;
  return out;
}

function restore(charKey, frameKey, snap) {
  const meta = rawMeta(charKey, frameKey);
  for (const f of EDITABLE) meta[f] = snap[f];
  if (snap.anchors) meta.anchors = JSON.parse(JSON.stringify(snap.anchors));
  else delete meta.anchors;
  // Undo and Reset have to reach it too, or a box placed this session survives
  // the thing that is supposed to take it back.
  if (snap.attackBox) meta.attackBox = { ...snap.attackBox };
  else delete meta.attackBox;
  if (snap.hit) meta.hit = { ...snap.hit };
  else delete meta.hit;
}

// ------------------------------------------------------------------ anchors
//
// Anchors are stored in the SOURCE IMAGE's own pixels, so they ride along with
// every later size / horizontal / ground-contact tweak: a point put on a
// character's navel stays on the navel however the frame is nudged afterwards.
// See sprites/src/sprites.js for the full contract.

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
  // rawMeta, not the game's view: setAnchor writes into the manifest entry, so
  // the readout has to be reading that same entry. On a pose awaiting approval
  // the two differ, and the panel reported the old art's anchor back at you
  // however far you dragged the new one.
  const meta = rawMeta(charKey, frameKey);
  const v = anchorLocal(charKey, frameKey, name, meta);
  if (v) return v;
  // An extra anchor with nothing stored starts life at the centre of mass,
  // which is a far better first guess than the image's corner.
  return anchorLocal(charKey, frameKey, "com", meta) || [0, 0];
}

function setAnchor(charKey, frameKey, name, x, y) {
  const meta = rawMeta(charKey, frameKey);
  (meta.anchors ??= {})[name] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

/** Anchors are visible unless explicitly switched off. */
function isAnchorShown(name) {
  // One switch, under the canvas, next to the other things drawn on it. The
  // per-anchor checkboxes in the panel were a second place to look for the
  // same answer, on a control whose real interface is the handle itself.
  return $("showAnchors")?.checked !== false && state.anchorShown[name] !== false;
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
  // Enrolling a character in `state.originals` is what puts it in the export
  // (editedChars), so its CHARACTER-level baselines have to be taken at the
  // same moment. They used to be taken in openChar alone, which is fine while
  // the only way to meet a character is to select it — but the updated list
  // renders poses from the whole roster, and buildPoseEntry calls this for
  // every one. Those characters entered the export with no span baseline
  // recorded, so the comparison below read "manifest value vs undefined" as a
  // change and an export that touched Choso alone carried eight other
  // characters' spans, each identical to what was already committed.
  rememberHead(charKey);
  rememberSpan(charKey);
}

function isDirty(charKey, frameKey) {
  const orig = state.originals[charKey]?.[frameKey];
  if (!orig) return false;
  const meta = rawMeta(charKey, frameKey);
  return EDITABLE.some((f) => {
    const kindOf = KIND_FIELDS[f];
    if (kindOf) return kindOf(meta) !== kindOf(orig);
    if (BOOLEAN_FIELDS.has(f)) return !!meta[f] !== !!orig[f];
    if (TEXT_FIELDS.has(f)) return (meta[f] || "") !== (orig[f] || "");
    return Math.abs((meta[f] ?? 0) - (orig[f] ?? 0)) > 1e-4;
  }) || anchorsDirty(charKey, frameKey) || attackBoxDirty(charKey, frameKey)
    || hitDirty(charKey, frameKey);
}

/** A creature's canonical drawing, for the entry that names the creature itself.
 *
 *  `summon:curseHound` has no file: that creature shipped as six POSE plates
 *  and no single still, so the base key is a name rather than a picture and the
 *  viewer said "not delivered yet" over art that is very much delivered. The
 *  game has never had this problem — summons.js resolves a creature to
 *  `poseKeyOf(...)` + `idle_a` and only falls back to a single still where no
 *  pose art landed (canonicalImage) — so this is the same rule, in the one
 *  place the workbench needed it.
 *
 *  Returns the key to actually draw, which is usually the one passed in. */
function drawableSharedKey(key) {
  if (getImage(key) || !key?.startsWith("summon:") || key.split(":").length !== 2) return key;
  const resting = `${key}:idle_a`;
  return getImage(resting) ? resting : key;
}

/** A creature's attack box, compared whole.
 *
 *  It is four fractions in one object, so it cannot ride in EDITABLE with the
 *  scalars — and being left out of the dirty test did not just cost it the
 *  yellow dot. `payloadFor` walks `dirtyFrames`, so a pose whose ONLY change
 *  was its attack box was never reached, and the box was dropped at export: it
 *  survived only when some other edit on the same pose carried it out. */
function attackBoxDirty(charKey, frameKey) {
  const orig = state.originals[charKey]?.[frameKey];
  if (!orig) return false;
  const now = rawMeta(charKey, frameKey)?.attackBox;
  return JSON.stringify(now ?? null) !== JSON.stringify(orig.attackBox ?? null);
}

/** A creature's poses and the creature share one attack box, so editing it from
 *  a pose has to mark the CREATURE dirty — the export walks the dirty list, and
 *  a box placed on the attack pose would otherwise never be reached. */
function markCreatureDirty(key) {
  const owner = attackBoxKey(key);
  if (owner !== key) remember(OTHER_KEY, owner);
}

/** The hit region's correction, compared whole, and in the dirty test for
 *  exactly the reason the attack box is: `payloadFor` walks the dirty list, so
 *  a drawing whose only change was its hit circle would never be reached and
 *  the edit would be dropped at export. */
function hitDirty(charKey, frameKey) {
  const orig = state.originals[charKey]?.[frameKey];
  if (!orig) return false;
  const now = rawMeta(charKey, frameKey)?.hit;
  return JSON.stringify(now ?? null) !== JSON.stringify(orig.hit ?? null);
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
    // `surfacedReviewed` counts too: "I looked at this and it needed nothing" is
    // a decision about the pose, and the to-do list is a list of undecided ones.
    // Without it the only way off the list was to change a number, which meant
    // nudging a pose that was already right.
    if (Object.keys(meta.edited || {}).length > 0 || meta.needsReplacement
        || meta.wantsImprovement || meta.surfacedReviewed) {
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
  // A shared drawing has no anim table to ask, but it does have an owner: a
  // move that throws it, a creature that wears it, an install, a hazard. That
  // is the same question — does the game ever draw this — and the answer used
  // to be a blanket yes, which put every unreferenced leftover in front of you
  // in the working views. `sharedControls` already has to know who draws each
  // one to decide which sliders are honest; the filter reads the same answer.
  if (isOther(charKey)) {
    const can = sharedControls(frameKey);
    // Ambience is not the working set. A domain backdrop is cover-fitted to the
    // whole stage and an install aura is a glow around a fighter: the game
    // draws both, neither is placed against anything, and having them in the
    // three working views padded every to-do list with drawings there is no
    // placement work to do on. They keep their controls — they are still there
    // under "All sprites", and an aura's size and nudge still reach the screen.
    return !!can?.used && can.kind !== "aura" && can.kind !== "domain";
  }
  // An ACTOR is asked the same question as a fighter. It used to be exempt,
  // from when `animsOf` could not resolve a SPRITE_ACTOR's table at all and the
  // honest answer was unavailable; that is fixed (sprites/src/sprites.js), so exempting
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

/** Is a *drawing* already on order for this pose?
 *
 *  Every replacement kind except `delete` means somebody has been asked to draw
 *  this pose again, so any placement done today is measured off art that is on
 *  its way out — the replacement is measured from scratch when it lands.
 *  `delete` is the exception: it throws a drawing away and asks for nothing, so
 *  no new art is coming and the pose is not warned about.
 *
 *  This is what the caution mark in the grid means. It is deliberately narrower
 *  than `flagged`, which also covers the improvement flags — those are repo work
 *  on the file we already have, and nothing arrives to overwrite the numbers.
 */
function redrawPending(charKey, frameKey) {
  const kind = replacementKind(rawMeta(charKey, frameKey));
  return !!kind && kind !== "delete";
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
    // updateGrabReach: a box from the fighter's own x, forward by their
    // measured reach plus the closing hand's grace, 90% of body height tall.
    return [{ kind: "reach", w: m.reach * 0.85 + GRAB.grace, h: m.height * 0.9 }];
  }
  // pinVictim puts the two bodies (a.width + b.width) * 0.45 apart, and turns
  // the victim to face the holder. So from EITHER pose, drawn facing right, the
  // other fighter stands the same gap ahead — the holder in front of the one
  // being held, the victim in front of the one holding. Measured against
  // another fighter of this build, there being only one body on this canvas.
  return [{ kind: "partner", gap: m.width * 0.9, w: m.width, h: m.height * HURTBOX.standH,
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
    ctx.fillText(`Grab reach · ${Math.round(g.w)}px — a grab connects up to here`,
      wx(g.w) + 6, wy(-g.h) + 12);
    ctx.fillStyle = "rgba(255, 140, 110, 0.7)";
    ctx.fillText("put the grasping hand ON it", wx(g.w) + 6, wy(-g.h) + 26);
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
    ctx.strokeStyle = "rgba(120, 210, 240, 0.9)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(wx(grip), wy(-g.h)); ctx.lineTo(wx(grip), wy(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(150, 220, 250, 0.95)";
    ctx.fillText("the grip — hands here, chest height", wx(grip) + 6, wy(-g.h * 0.62));
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

/** A shared effect/summon sprite, drawn at the height the game draws it where
 *  that is known, and at its own pixel height where it is not. Nothing here is
 *  adjustable — the point is to see the art as it appears in a match. */
const sharedTried = new Set();

function drawSharedSprite(cx) {
  const img = getImage(drawableSharedKey(state.frame));
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
  const v = sharedView();
  if (!v) return;
  const { h, w, px, py, top, nx, ny, deg } = v;

  ctx.save();
  // The same transform render.js builds, in the same order: to the point, mirror
  // if it travels, then the drawing's own tilt, then the picture with its nudge
  // — so a `dx` moves the art the same way here as it does in a match.
  ctx.translate(px, py);
  if (v.mirror) ctx.scale(-1, 1);
  if (deg) ctx.rotate(deg * Math.PI / 180);
  // An aura is an additive glow with the install's colour bleeding off its edge,
  // and it was being shown here as a flat opaque plate. Two different pictures:
  // the plate reads as a hard-edged shape you would align by its bounding box,
  // and the thing the player sees has no edge at all. Same numbers as
  // drawInstallAura, so what is on this canvas is what goes on the screen.
  if (v.can?.kind === "aura") {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.72;
    ctx.shadowColor = installColorOf(state.frame);
    ctx.shadowBlur = 18 * v.z;
  }
  ctx.drawImage(img, -w / 2 + nx, top - py + ny, w, h);
  // The box is an annotation, not part of the drawing — it must not pick up the
  // aura's blend, or it stops being readable on exactly the art that needs it.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  if ($("showBox").checked) {
    ctx.strokeStyle = "rgba(255, 120, 160, 0.8)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-w / 2 + nx, top - py + ny, w, h);
    ctx.setLineDash([]);
  }
  ctx.restore();

  // The drawing is too big for the viewer and everything on the canvas has been
  // shrunk to hold it. Said out loud because the alternative is a slider that
  // appears to do nothing: once the fit is active, Size is spent entirely on
  // making the view smaller, and the picture sits at the same height however
  // far it is pushed. The Zoom control is the way out, so it is named here.
  if (v.fitted || v.overflows) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 210, 140, 0.85)";
    ctx.font = "500 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(v.fitted
      ? `nothing declares this one's size — fitted to ${Math.round(v.z / state.zoom * 100)}% of Zoom, `
        + "reference included. Size is relative here."
      : "taller than the viewer — drawn full size against the reference. Lower Zoom to see all of it.",
      canvasCentreX(), GROUND_Y + 34);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- attack box
//
// A creature's HURT box is the whole drawing and is measured, so there is
// nothing to place. What it hits WITH is a different shape and always was: a
// dog bites with its head, and a tail that deals 6.5% is a bug you can only see
// by playing. Fighters have had the two separate from the start; this is where
// a creature's gets placed.
//
// Stored as fractions of the drawing (`attackBox` in `otherSprites`, read by
// sharedAttack in src/shared_sprites.js) so it travels with the art: rescale
// the creature here or redraw it bigger and the bite stays on the mouth.

/** The default the game uses when nobody has placed one — kept in step with
 *  DEFAULT_ATTACK in src/summons.js. Shown as a starting point rather than as
 *  an empty canvas, so placing one is an edit rather than an invention. */
const DEFAULT_ATTACK_BOX = { x: 0.28, y: 0.52, w: 0.44, h: 0.76 };

/** Whether this drawing is a creature whose attack box can be placed: a
 *  creature stands on its feet and has a measured hurt box. A projectile's
 *  collision is its move's `r` and is not a shape anybody draws here. */
function canPlaceAttack(key) {
  const can = sharedControls(key);
  // `bites` is the difference between a box the game reads and a box nothing
  // reads: a support creature hovers and shoots and never runs the contact
  // test, so offering it a bite to place would be offering an edit that cannot
  // reach the screen — the exact fault this panel keeps being fixed for.
  return !!(can?.used && can.measuredBox && can.anchor === "feet" && can.bites !== false);
}

/** THE CREATURE AN ATTACK BOX BELONGS TO.
 *
 *  A creature bites with one part of itself, and that is one fact about the
 *  creature — not six facts, one per pose. summons.js reads exactly one box for
 *  it (`sharedAttack(poseKeyOf(cfg.sprites))`, the creature's own key), and
 *  shared_sprites.js already resolves a pose's READ back to the creature. Only
 *  the write was landing on the pose, so a box placed while looking at the
 *  attack drawing — which is the drawing you would want to place it against —
 *  was stored somewhere nothing reads.
 *
 *  So the pose is where you LOOK and the creature is where it is KEPT. */
function attackBoxKey(key) {
  const parts = String(key || "").split(":");
  return parts[0] === "summon" && parts.length === 3 ? `${parts[0]}:${parts[1]}` : key;
}

/** The stored box, or the default, for the drawing on screen. */
function attackBoxOf(key) {
  const stored = rawMeta(OTHER_KEY, attackBoxKey(key))?.attackBox;
  return { ...DEFAULT_ATTACK_BOX, ...(stored || {}) };
}

/** The drawn rectangle on the CANVAS, which the fractions are measured against:
 *  the same rectangle the game paints, at the workbench's zoom. */
function drawnRectOnCanvas(key) {
  // The rectangle the art is ACTUALLY drawn in — size, nudge and view fit
  // included — rather than a second guess at it. A creature sized to 60% used
  // to keep its attack box on the 100% rectangle, which put the bite off the
  // head by the same amount the drawing had shrunk.
  const v = sharedView(key);
  if (!v || !Number.isFinite(v.h) || v.h <= 0) return null;
  return { x: v.px - v.w / 2 + v.nx, y: v.top + v.ny, w: v.w, h: v.h };
}

/** The attack box on the canvas, from the fractions. The art is drawn facing
 *  right here, which is the direction `x` is positive in. */
function attackBoxOnCanvas(key) {
  const rect = drawnRectOnCanvas(key);
  if (!rect) return null;
  const box = attackBoxOf(key);
  // Measured from the DRAWING — forward from its middle, up from its feet —
  // which is where sharedAttack measures from, and no longer from the canvas
  // centre line and the ground: a creature painted off the ground line or
  // nudged aside took its box with it in game and left it behind here.
  const cx = rect.x + rect.w / 2 + box.x * rect.w;
  const cy = rect.y + rect.h - box.y * rect.h;
  return { x: cx - (box.w * rect.w) / 2, y: cy - (box.h * rect.h) / 2,
           w: box.w * rect.w, h: box.h * rect.h, rect };
}

function drawAttackBox(key) {
  const b = attackBoxOnCanvas(key);
  if (!b) return;
  const held = state.dragAttack;
  ctx.save();
  ctx.fillStyle = held ? "rgba(255, 120, 120, 0.22)" : "rgba(255, 90, 90, 0.14)";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = held ? "rgba(255, 170, 170, 0.95)" : "rgba(255, 110, 110, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.setLineDash([]);
  // The corner that resizes it, bottom-right in canvas terms — the forward,
  // lower corner of the box, which is the one you reach for on a head.
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(b.x + b.w - HANDLE_R, b.y + b.h - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
  ctx.globalAlpha = 0.95;
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("attack box — drag to place, corner to size", b.x + b.w / 2, Math.max(12, b.y - 6));
  ctx.restore();
}

/** Write a changed attack box back onto the drawing's manifest entry. */
/** Move or resize a drawing's hit region. Same shape as setAttackBox below and
 *  for the same reasons — baseline first, undo point on the first change of a
 *  drag, and the pose list repainted because its dirty dot is feedback.
 *
 *  A correction that comes to nothing is REMOVED rather than stored as zeroes:
 *  an entry saying "moved by 0, scaled by 1" claims a decision nobody made, and
 *  the stamp/reset machinery would then carry it forward as one. */
function setSharedHit(key, hit, start) {
  remember(OTHER_KEY, key);
  if (start) pushHistory(OTHER_KEY, key);
  const meta = rawMeta(OTHER_KEY, key);
  if (!meta) return;
  // ZERO IS A DECISION NOW, not an absence. No entry means "the circle sits on
  // the shot's own position"; `{0, 0, 1}` means "the circle sits on the
  // picture" — and those are different places the moment the picture has been
  // nudged anywhere. Dropping the entry at zero would have snapped the circle
  // off the art and back onto the spawn point. It is only really empty when the
  // drawing has no offset either, so the two readings coincide.
  const nudged = (meta.dx ?? 0) || (meta.dy ?? 0);
  const empty = !hit.dx && !hit.dy && !nudged
    && (hit.scale === 1 || hit.scale === undefined);
  if (empty) delete meta.hit;
  else meta.hit = { dx: hit.dx || 0, dy: hit.dy || 0, scale: hit.scale ?? 1 };
  refreshControls();
  buildPoseList();
  render();
}

function setAttackBox(rawKey, box, start) {
  const key = attackBoxKey(rawKey);
  // Take the baseline before the first change of a drag, the same as every
  // other edit does. Without it the box was compared against nothing, so it
  // could not be dirty, could not show its dot, and — because the export walks
  // the dirty list — could not be exported unless something else on the same
  // drawing happened to be edited too.
  remember(OTHER_KEY, key);
  if (start) pushHistory(OTHER_KEY, key);
  const meta = rawMeta(OTHER_KEY, key);
  if (!meta) return;
  const r3 = (v) => Number(v.toFixed(3));
  meta.attackBox = { x: r3(box.x), y: r3(box.y), w: r3(box.w), h: r3(box.h) };
  refreshControls();
  buildPoseList();          // the dot in the list is part of the feedback
  render();
}

/** The move's own collision shape, drawn about the spawn point.
 *
 *  A bolt drawn twice the width of its `r` looks like it should clip somebody
 *  it passes straight through; a creature drawn half its `hitW` looks like it
 *  should be walked past. Neither is visible in the picture, and both are
 *  numbers the kit already declares — so the workbench can show them and the
 *  art can be matched to them instead of guessed at. Nothing here changes play:
 *  this is the game's shape, drawn, not a shape the workbench sets.
 *
 *  **It does not follow the spawn nudge, and — with one exception — it does not
 *  follow Size**, which is the useful part: the shape is a kit number, so
 *  moving the slider moves the picture against a fixed target and you can see
 *  when they agree. Marked `fixed` on the label, because a shape that held
 *  still could otherwise be mistaken for one that had not been re-drawn yet.
 *  The exception is a random drop, whose `h` is both the height it is painted
 *  at and the height of the box it lands in, so there the box does follow Size
 *  and says so. Contrast a FIGHTER's hurtbox, which is measured off the art and
 *  therefore always follows it.
 */
function drawSharedHit(v) {
  const { px, py, z, hit, anchor, scale } = v;
  // A melee move's box is measured from the FIGHTER, not from the drawing —
  // `hitboxRect` in combat.js — so it is drawn there, beside the pose, and says
  // whose it is. Only possible at all now that the fighter is standing at the
  // distance the move puts them; before this the rectangle had nowhere honest
  // to go and was drawn around the picture, which claimed a shape the game
  // never tests there.
  if (hit.melee && v.launch) {
    const fx = px - v.launch.forward * z;
    const x = fx + hit.melee.forward * z, y = GROUND_Y + hit.melee.y * z;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 210, 90, 0.9)";
    ctx.fillStyle = "rgba(255, 210, 90, 0.10)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.fillRect(x, y, hit.melee.w * z, hit.melee.h * z);
    ctx.strokeRect(x, y, hit.melee.w * z, hit.melee.h * z);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 226, 150, 0.95)";
    ctx.font = "600 11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`the swing's box ${Math.round(hit.melee.w)}×${Math.round(hit.melee.h)}px — on the fighter`,
                 x, Math.max(12, y - 6));
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.strokeStyle = "rgba(255, 210, 90, 0.9)";
  ctx.fillStyle = "rgba(255, 210, 90, 0.10)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  // "follows Size" was only ever half true, and the missing half is the one
  // that confuses: a drop's HEIGHT is the art's own height, so those two can
  // never disagree, while its WIDTH is a plain kit number that does not move at
  // all. Size a vending machine up and it grows wider than the box it lands in
  // while staying exactly as tall — which reads as the box shrinking.
  const follows = !!hit.followsSize;
  const note = follows ? "height follows Size · width fixed" : "fixed";
  let label = "", topOf;
  if (hit.shape === "circle") {
    // A circle is the one shape the drawing can move and resize for itself —
    // it is what a projectile collides on, and a shot whose art is a wall of
    // water has no business colliding from the middle of its plate. The kit
    // still owns the radius; this is a multiplier and an offset on top.
    const c = hitCentreOnCanvas(v);
    const r = hit.r * v.hitAdj.scale * z;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    const sized = v.hitAdj.scale !== 1;
    label = `hit radius ${Math.round(hit.r * v.hitAdj.scale)}px`
      + (sized ? ` (${hit.r} × ${v.hitAdj.scale.toFixed(2)})` : "")
      + (!v.hitAdj.placed ? " · on the spawn point"
         : (v.hitAdj.ownDx || v.hitAdj.ownDy)
           ? ` · ${round1(v.hitAdj.ownDx)}, ${round1(v.hitAdj.ownDy)} from the drawing`
           : " · on the drawing");
    topOf = c.y - r;
    // Both handles on the RIM — see hitHandles for why not the centre. The
    // shape's interior is draggable too, but a big circle makes that obvious
    // and a small one has no room for it, so the handles are what is drawn.
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const hh = hitHandles(c, r);
    for (const [pt, mode] of [[hh.move, "move"], [hh.size, "size"]]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, HANDLE_R * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = state.dragHit?.mode === mode
        ? "rgba(255, 240, 190, 0.95)" : "rgba(255, 210, 90, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 226, 150, 0.95)";
      ctx.stroke();
    }
    // A short tick from the circle's centre to WHAT IT IS MEASURED FROM — the
    // picture once it has been placed, the spawn point until then — so "how far
    // has this been moved, and from what" is readable without doing arithmetic
    // on the numbers in the panel.
    const from = v.hitAdj.placed ? drawingHome(v) : { x: px, y: py };
    if (Math.hypot(c.x - from.x, c.y - from.y) > 2) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y); ctx.lineTo(from.x, from.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(255, 210, 90, 0.9)";
  } else {
    const hh = hit.h * (follows ? scale : 1);
    const w = hit.w * z, h = hh * z;
    const top = anchor === "feet" ? py - h : py - h / 2;
    ctx.fillRect(px - w / 2, top, w, h);
    ctx.strokeRect(px - w / 2, top, w, h);
    label = `${hit.from === "hitW/hitH" ? "hitbox" : "hit box"} `
      + `${Math.round(hit.w)}×${Math.round(hh)}px · ${note}`;
    topOf = top;
  }
  ctx.setLineDash([]);
  // Above the shape, and above the spawn-point caption, so the two readouts do
  // not sit on top of each other.
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgba(255, 226, 150, 0.95)";
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, px, Math.max(12, topOf - 6));
  ctx.restore();
}

/** The canvas x every sprite is drawn about. */
const canvasCentreX = () => canvas.width / 2;

/** Where the reference fighter stands beside a shared drawing.
 *
 *  Three answers, and the drawing decides which:
 *
 *    at the LAUNCH distance   the move declares where it leaves them, so they
 *                             stand that far from the drawing and the art can
 *                             be lined up against the hand that throws it.
 *    at the DRAWING'S CENTRE  the move paints ON the caster — an aura worn, a
 *                             concert wave centred on the chest, a transformed
 *                             body replacing them. Standing them aside answers
 *                             only "how big" and leaves every question the art
 *                             actually raises unanswerable off-stage.
 *    at the BENCHMARK INSET   nothing relates the two: a stage hazard, a domain
 *                             backdrop, a shot centred on the OPPONENT. Null,
 *                             and drawComparison falls back on its own.
 */
function referenceX(v) {
  const launch = v.launch;
  if (!launch || launch.atOpponent) return v.can?.kind === "aura" ? v.px : null;
  // `forwardOfWidth` is an offset expressed as a fraction of the ART's width —
  // Gakuganji's shout sits at `f.facing * w * 0.3` — so it can only be resolved
  // once the drawing's width is known.
  const forward = launch.forward + (launch.forwardOfWidth || 0) * (v.w / v.z);
  return forward ? canvasCentreX() - forward * v.z : v.px;
}

/** Which way a travelling drawing flies, and which way its plate has to point.
 *
 *  This is the one thing about a projectile the viewer could not show and the
 *  art most needs to get right. drawProjectiles mirrors the drawing to the way
 *  it is travelling — `flip = vx > 0 ? -1 : 1` — so what a player sees flying
 *  RIGHT is the mirror of the plate, and the plate itself is the leftward
 *  version. A cone drawn opening to the right therefore fires apex-first, and
 *  nothing on this canvas said so: the workbench shows the plate, the game
 *  shows it flipped, and the two look like different drawings.
 *
 *  The nudge is honest in this frame either way — render.js applies `dx` INSIDE
 *  the mirrored transform, so pushing the picture right here pushes it toward
 *  the same end of the drawing in flight, whichever way the shot goes. */
function drawTravelDirection(v) {
  const y = v.py;
  const x0 = v.px + v.w / 2 + 14;
  ctx.save();
  ctx.strokeStyle = "rgba(150, 230, 255, 0.75)";
  ctx.fillStyle = "rgba(150, 230, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();                       // an arrow the way this shot is flying
  ctx.moveTo(x0, y); ctx.lineTo(x0 + 34, y);
  ctx.moveTo(x0 + 26, y - 5); ctx.lineTo(x0 + 34, y); ctx.lineTo(x0 + 26, y + 5);
  ctx.stroke();
  ctx.font = "500 10.5px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("flying", x0 + 40, y + 4);
  ctx.textAlign = "center";
  ctx.fillText("shown as fired — mirrored, the way a player sees it. The plate faces the other way.",
               canvasCentreX(), GROUND_Y + 50);
  ctx.restore();
}

/** The zoom EVERYTHING in the Other Sprites view is drawn at — the drawing, its
 *  hit shape, its spawn point, and the fighter standing beside it as a size
 *  reference. The Zoom slider unless the drawing is too tall for the canvas, in
 *  which case the whole scene comes down together rather than the drawing alone.
 *
 *  Sizing an effect is a question about a ratio — "how big is this next to the
 *  man who throws it" — so the one thing the viewer must never do is scale the
 *  two by different numbers. */
function sceneZoom(key = state.frame) {
  return sharedView(key)?.z ?? state.zoom;
}

/** Everything about a shared drawing's place on the canvas, in one place.
 *
 *  The art, the move's hit shape, the spawn crosshair and the drag that moves
 *  it were each doing this arithmetic themselves, and the copies disagreed the
 *  moment a drawing was too big for the viewer: the picture was clamped to the
 *  canvas and the hit shape was not, so past about 120% they grew apart and the
 *  art could never be made to meet its box. The clamp is now a VIEW zoom that
 *  everything here is drawn at — shrink the view, not the drawing — so the two
 *  hold their real proportions at any size.
 *
 *  `z` is that view zoom: game pixels to canvas pixels, and the divisor the
 *  drag uses to turn a gesture back into `dx`/`dy` game pixels.
 */
function sharedView(key = state.frame) {
  const img = getImage(drawableSharedKey(key));
  if (!img) return null;
  const can = sharedControls(key);
  const meta = rawMeta(OTHER_KEY, key);
  const scale = Number.isFinite(meta?.renderScale) && meta.renderScale > 0 ? meta.renderScale : 1;
  const gameH = can?.info?.h ?? gameHeightOf(key);
  // Art whose spawn site sizes it per instance — a domain backdrop, an aura —
  // has no height in game pixels to work in, so its own plate stands in for
  // one. The scale still moves it, which keeps the control honest about being
  // relative rather than absolute.
  const artH = (Number.isFinite(gameH) ? gameH : img.height) * scale;
  const hit = can?.info?.hit || null;
  // A drop's box IS the height the art is painted at (`h` serves both in
  // randomDrop), so it grows with Size; every other shape is a fixed kit
  // number. Both have to be inside the view or a fit lies about one of them.
  const hitH = !hit ? 0
    : hit.shape === "circle" ? hit.r * 2
    : hit.h * (hit.followsSize ? scale : 1);
  // A drawing the kit gives a height to is drawn at the Zoom slider's value and
  // nothing else, however tall that makes it. Fitting it to the canvas was the
  // wrong instinct: this is the case where the size is a RATIO to the fighter
  // standing beside it, and a fit spends every further turn of the slider on
  // shrinking the view instead of growing the picture — the machine looked
  // frozen while its number climbed. Overflowing the top of the viewer is the
  // honest outcome, and Zoom is right there to pull it back in.
  //
  // The fit survives for the other case only: art nobody declares a height for,
  // which is standing in with its own plate — 1400px of domain backdrop that
  // would otherwise fill the canvas fifteen times over and mean nothing when it
  // did, there being no ratio in it to preserve.
  const z = Number.isFinite(gameH) ? state.zoom
    : Math.min(state.zoom, (GROUND_Y - 20) / Math.max(artH, hitH, 1));
  const h = artH * z;
  const anchor = can?.anchor || "feet";
  // Where the move puts it on the fighter, when the handler's arithmetic is
  // known: `y` game pixels from their feet, which is the height the crosshair
  // and everything hung off it belong at. Without a launch it falls back to the
  // viewer's own resting heights.
  // The point the move really launches from, kit numbers corrected — see
  // launchPoint. Everything hung off the crosshair moves with it.
  const launch = launchPoint(key);
  // An aura does not stand on the floor: render.js paints it from `f.y + 10`,
  // ten pixels UNDER the fighter's feet, so the glow skirts the platform rather
  // than being sheared off by it. Drawing it on the ground line here was a
  // silent ten-pixel lie in the one view somebody sets `dy` from — small, and
  // exactly the size of the nudges this panel exists to make.
  const footDy = Number.isFinite(can?.info?.footDy) ? can.info.footDy : 0;
  const py = launch ? GROUND_Y + launch.y * z : anchorScreenY(anchor, h) + footDy * z;
  return {
    img, can, meta, scale, hit, z, h, anchor, launch, footDy,
    // The drawing's own correction on the hit region — where it sits relative
    // to the point the game spawns on, and how big. Resolved here so the
    // drawing, the drag and the readout cannot disagree about it.
    hitAdj: sharedHit(key),
    // Two different things worth saying out loud, and only one of them is a
    // compromise: `fitted` means the view was shrunk because the drawing has no
    // declared size to hold it to, `overflows` means it is drawn at full size
    // and runs off the top, which is only ever a reason to reach for Zoom.
    fitted: z < state.zoom - 1e-6,
    overflows: artH * z > GROUND_Y - 4,
    // Travelling art is shown AS FIRED, to the right — mirrored, exactly as
    // drawProjectiles paints it (`flip = vx > 0 ? -1 : 1`). The plate and the
    // thing a player sees are mirror images of each other, and showing the
    // plate while the game shows the flip is how a drawing already pointing
    // the right way gets "corrected" with the Mirror box into flying backwards.
    // Fired right rather than left because the reference fighter faces right.
    mirror: !!can?.mirrored,
    w: img.width * h / img.height,
    px: canvasCentreX(),
    py,
    top: anchor === "centre" ? py - h / 2 : anchor === "top" ? py : py - h,
    nx: (meta?.dx ?? 0) * z,
    ny: (meta?.dy ?? 0) * z,
    deg: meta?.rotationDeg ?? 0,
  };
}

/** Where the drawing leaves the fighter, in GAME pixels from their feet — the
 *  point the game will really spawn it from, which is not what the kit says.
 *
 *  Two corrections on the kit's own `ox`/`oy`, and both were missing:
 *
 *    the FIGHTER'S HAND  a shot leaves the muzzle src/muzzle.js resolves for
 *                        this fighter in this pose — a verified point, the
 *                        rig's measured hand, or the reference offsets scaled
 *                        onto their height. The kit's numbers are a
 *                        displacement from the reference on top of that, not
 *                        the whole answer. The crosshair used to sit at the raw
 *                        kit number, which is where nothing leaves from.
 *    the PENDING EDIT    `spawnOx`/`spawnOy` — the muzzle dragged on the action
 *                        preview and not yet carried into the kit. Only that
 *                        canvas was reading them, so the two views of one
 *                        drawing disagreed about where it comes from, and the
 *                        main viewer was the one ignoring the change you had
 *                        just made.
 *
 *  `edited` says the second correction is in play, and `source` names which of
 *  the three answers the hand came from, so the readout can say whether anybody
 *  has actually looked at this fighter. Both are for the readout to explain
 *  rather than for anything to draw. */
function launchPoint(key) {
  const base = sharedControls(key)?.launch;
  if (!base) return null;
  const meta = rawMeta(OTHER_KEY, key) || {};
  const edited = Number.isFinite(meta.spawnOx) || Number.isFinite(meta.spawnOy);
  const ox = Number.isFinite(meta.spawnOx) ? meta.spawnOx : base.forward;
  const oy = Number.isFinite(meta.spawnOy) ? meta.spawnOy : base.y;
  const owner = sharedOwner(key);
  if (!base.scaled || !owner) {
    return { ...base, forward: ox, y: oy, edited, source: null };
  }
  const m = spawnOffset(owner, base.anim, ox, oy);
  return { ...base, forward: m.x, y: m.y, edited, source: m.source };
}

/** The kit-space multiplier the game applies to a move's own offset — what a
 *  number dragged on a canvas has to be divided by to become the number that
 *  belongs in the kit. 1 when nothing scales it. */
function launchScale(key) {
  const base = sharedControls(key)?.launch;
  const owner = sharedOwner(key);
  if (!base?.scaled || !owner) return 1;
  return bodyMetrics(owner).height / HEIGHT_BASE_PX;
}

/**
 * EVERY HANDLE AND LABEL FOR A SHARED DRAWING, drawn after the reference
 * fighter rather than with the art.
 *
 * The art goes UNDER the fighter, because that is the game's paint order. The
 * handles are not art — they are the tool — and putting them under the fighter
 * too hid them: on Dagon's tide the caster stands 2.7px from the drawing, so
 * the spawn crosshair was completely behind his body. It was still draggable,
 * and dragging it still worked, which is the worst version of a bug like this:
 * the thing you cannot see is the thing you are told to grab.
 */
function drawSharedOverlay() {
  const v = sharedView();
  if (!v) return;
  if ($("showHurtbox")?.checked && v.hit) drawSharedHit(v);
  // A creature has no fixed hit region to draw — its hurt box is the drawing —
  // so the same toggle shows the one shape that IS placed by hand.
  if ($("showHurtbox")?.checked && canPlaceAttack(state.frame)) drawAttackBox(state.frame);
  if (v.can?.used && v.can.anchor) drawSpawnPoint(v.px, v.py, v.anchor, v.can.offset);
  if (v.can?.offset) drawDrawingPoint(v);
  if (v.can?.travels) drawTravelDirection(v);
}

/** Where the DRAWING's own anchor sits on the canvas: the spawn point plus its
 *  nudge. Mirrored the way the picture is, because `dx` is applied inside the
 *  as-fired flip (render.js) — the same frame hitCentreOnCanvas works in. */
function drawingHome(v) {
  const sx = v.mirror ? -1 : 1;
  return { x: v.px + sx * (v.meta?.dx ?? 0) * v.z, y: v.py + (v.meta?.dy ?? 0) * v.z };
}

/**
 * The handle that moves the PICTURE — the second of the two points the action
 * preview has always shown and the main viewer never did.
 *
 * The viewer had one marker, the spawn crosshair, and dragging it moved the art
 * beneath a handle that stayed put. That is defensible — the point belongs to
 * the game and not to us — and it is also why moving a drawing looked like
 * nothing happening: the thing under the pointer did not move, and on art as
 * large as a tide wave the picture sliding a few pixels behind a fighter is
 * easy to miss entirely.
 *
 * So the picture gets a handle of its own, at the picture's anchor, and it
 * moves with the picture. The crosshair beside it stays exactly where the game
 * spawns the effect, which is what makes the gap between them readable: that
 * gap IS `dx`/`dy`.
 */
function drawDrawingPoint(v) {
  const d = drawingHome(v);
  const held = !!state.dragSpawn;
  const moved = (v.meta?.dx ?? 0) || (v.meta?.dy ?? 0);
  ctx.save();
  // The line back to the spawn point, so the offset is a thing you can see
  // rather than two numbers to subtract.
  if (moved) {
    ctx.strokeStyle = "rgba(240, 180, 90, 0.5)";
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(v.px, v.py); ctx.lineTo(d.x, d.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = held ? "rgba(255, 226, 170, 0.98)" : "rgba(240, 180, 90, 0.95)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(d.x, d.y, HANDLE_R, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(d.x, d.y, HANDLE_R * 2.1, 0, Math.PI * 2); ctx.stroke();
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "left";
  const label = moved
    ? `drawing · ${round1(v.meta.dx ?? 0)}, ${round1(v.meta.dy ?? 0)} from the spawn point`
    : "drawing · drag to move the picture";
  const wLab = ctx.measureText(label).width;
  const flip = d.x + 18 + wLab + 12 > canvas.width - 8;
  const bx = flip ? d.x - 18 - wLab - 12 : d.x + 18;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "rgba(8, 12, 20, 0.86)";
  ctx.fillRect(bx, d.y + 4, wLab + 12, 18);
  ctx.globalAlpha = 1;
  ctx.fillStyle = held ? "rgba(255, 226, 170, 0.98)" : "rgba(245, 200, 130, 0.95)";
  ctx.fillText(label, bx + 6, d.y + 17);
  ctx.restore();
}

/** The circle's two grab points, both ON THE RIM. Deliberately not at the
 *  centre: that is where the spawn crosshair is until the circle is moved, and
 *  a handle there would compete with it for the same pixels on every drawing
 *  nobody has touched yet — which is exactly how the crosshair became
 *  ungrabbable. Top moves, right resizes. */
function hitHandles(c, r) {
  return { move: { x: c.x, y: c.y - r }, size: { x: c.x + r, y: c.y } };
}

/** Where the hit circle's centre lands on the canvas — the spawn point plus the
 *  drawing's own correction. One definition, so the shape, its two handles and
 *  the drag that moves them cannot disagree.
 *
 *  `dx` is FORWARD, and the viewer shows travelling art as fired (mirrored), so
 *  it runs the same way the picture does on this canvas. */
function hitCentreOnCanvas(v) {
  const sx = v.mirror ? -1 : 1;
  // `hitAdj.dx/dy` is already resolved back to the spawn point by sharedHit —
  // the picture's offset folded in — so this stays anchored on the crosshair
  // and the circle nevertheless rides with the art. One arithmetic, in one
  // place, and the workbench cannot disagree with the game about it.
  return { x: v.px + sx * v.hitAdj.dx * v.z, y: v.py + v.hitAdj.dy * v.z };
}

/** The spawn point's place on the canvas — one definition, used by the marker
 *  and by the hit test, so they cannot drift apart. */
function spawnHome() {
  const v = sharedView();
  return v ? { x: v.px, y: v.py } : { x: canvasCentreX(), y: GROUND_Y };
}

/** The y the spawn point sits at on the canvas, for each anchor. The drawing is
 *  hung off it; the point does not move when the art is resized. */

function anchorScreenY(anchor, h) {
  if (anchor === "centre") return GROUND_Y - Math.max(h, 120) / 2 - 40;
  if (anchor === "top") return GROUND_Y - 300;
  return GROUND_Y;
}

/** The point the game paints this drawing on — the thing the nudge is measured
 *  from. Draggable: moving it moves the DRAWING under it, which is the edit
 *  somebody actually wants to make, and it is one gesture instead of two
 *  sliders and a guess about which way is positive.
 *
 *  Not everywhere, though. A trap and a dropped vending machine are painted
 *  straight from the image by their spawn sites, which never read the nudge, so
 *  there the crosshair is a reference and says so: it is still where the art
 *  meets the ground, and that is worth seeing even when nothing can move it. */
function drawSpawnPoint(px, py, anchor, draggable = true) {
  const held = state.dragSpawn;
  ctx.save();
  ctx.strokeStyle = held ? "rgba(120, 255, 200, 0.95)" : "rgba(120, 220, 255, 0.9)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px - 14, py); ctx.lineTo(px + 14, py);
  ctx.moveTo(px, py - 14); ctx.lineTo(px, py + 14);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.stroke();
  // On a backing plate: the label sits over whatever the drawing happens to be,
  // and a caption that cannot be read is not a caption.
  const label = draggable ? "spawn point" : "spawn point · not nudgeable";
  const sub = ANCHOR_WORDS[anchor] || "";
  ctx.font = "500 10px Inter, sans-serif";
  const wSub = ctx.measureText(sub).width;
  ctx.font = "600 11px Inter, sans-serif";
  const wLab = ctx.measureText(label).width;
  const boxW = Math.max(wLab, wSub) + 12;
  const flip = px + 18 + boxW > canvas.width - 8;   // hug the other side at the edge
  const bx = flip ? px - 18 - boxW : px + 18;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "rgba(8, 12, 20, 0.86)";
  ctx.fillRect(bx, py - 17, boxW, 30);
  ctx.globalAlpha = 1;
  ctx.fillStyle = held ? "rgba(150, 255, 220, 0.95)" : "rgba(150, 230, 255, 0.95)";
  ctx.textAlign = "left";
  ctx.fillText(label, bx + 6, py - 5);
  ctx.globalAlpha = 0.72;
  ctx.font = "500 10px Inter, sans-serif";
  ctx.fillText(sub, bx + 6, py + 8);
  ctx.restore();
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
  // A kit's own declared height first; failing that the registry's, which is
  // where a CREATURE's height lives — a summon is sized by `h` in
  // config_summons.js rather than by a `spriteH` on the move, so reading only
  // the kits called every shikigami "sized by the code that spawns it" while
  // its Size control was live and working.
  return uses.find((u) => Number.isFinite(u.h))?.h ?? sharedSpriteInfo(key)?.h ?? null;
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

// ------------------------------------------------------- sprite picker
//
// Every sprite the character has, drawn rather than named: choosing what an
// action looks like is a visual decision, and a dropdown of file names is not
// one. Right-click enlarges a tile in place, for the cases where a thumbnail is
// too small to judge.

/** Open the grid.
 *
 *  `drawings` is an explicit list of one pose's own drawings — "which of these
 *  do I want to see beside it". Without it the grid is the CHARACTER'S WHOLE
 *  CATALOGUE, every drawing they have: what each pose points at, plus every
 *  other drawing banked on it. Choosing art is a question about images, not
 *  about poses, so an alternate nobody currently draws is as valid an answer
 *  as the one in play. */
function openSpritePicker({ title, sub, current, currentPose = null, onPick,
                           drawings = null, primaryOnly = false }) {
  const modal = $("spritePicker");
  const grid = $("pickerGrid");
  $("pickerTitle").textContent = title;
  $("pickerSub").textContent = sub;
  grid.innerHTML = "";
  closePickerMenu();
  pickerPage = null;
  // Scrolling takes the tile out from under the pointer, so whatever it was
  // showing goes with it.
  grid.onscroll = () => { cancelDwell(); closePickerPreview(); };

  if (drawings) {
    for (const d of drawings) grid.appendChild(buildDrawingTile(d, current, onPick));
    modal.hidden = false;
    closePickerPreview();
    grid.querySelector(".picker-tile.current")?.scrollIntoView({ block: "center" });
    return;
  }

  // A roster character has 50-odd poses and as many banked alternates again,
  // and every tile costs an image fetch. So the catalogue is laid down a page
  // at a time and the rest follows the scroll — the sprites worth looking at
  // are at the top by construction, and most choices never reach the bottom.
  pickerPage = {
    items: spriteCatalogue(state.char, currentPose ?? current, primaryOnly),
    at: 0, current, onPick,
  };
  appendPickerPage();
  modal.hidden = false;
  closePickerPreview();
  grid.querySelector(".picker-tile.current")?.scrollIntoView({ block: "center" });
}

const PICKER_PAGE = 48;
let pickerPage = null;
let pickerWatcher = null;

function appendPickerPage() {
  if (!pickerPage) return;
  const grid = $("pickerGrid");
  const { items, at, current, onPick } = pickerPage;
  const end = Math.min(items.length, at + PICKER_PAGE);
  for (let i = at; i < end; i++) {
    const item = items[i];
    if (item.head) {
      const head = document.createElement("h4");
      head.className = "picker-head";
      head.textContent = item.head;
      grid.appendChild(head);
      continue;
    }
    grid.appendChild(buildDrawingTile(item, current, onPick));
  }
  pickerPage.at = end;

  // The sentinel rides at the end of the grid: when it comes into view there
  // is more catalogue below the fold, so the next page is laid down.
  pickerWatcher?.disconnect();
  pickerWatcher = null;
  grid.querySelector(".picker-more")?.remove();
  if (end >= items.length) return;
  const more = document.createElement("div");
  more.className = "picker-more";
  more.textContent = `${items.length - end} more…`;
  grid.appendChild(more);
  if (typeof IntersectionObserver !== "function") return;
  pickerWatcher = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) appendPickerPage();
    // The grid is the scroller, so it is also the root the sentinel is
    // measured against.
  }, { root: grid, rootMargin: "400px" });
  pickerWatcher.observe(more);
}

/** The family a sprite key belongs to: everything up to the variant suffix, so
 *  `attack_light_b` and `attack_light_a` are the same family and `crouch_a` and
 *  `crouch_attack_b` are neighbours under `crouch`. */
function spriteFamily(key) {
  return String(key).split("_")[0];
}

/** Every drawing this character has, nearest first.
 *
 *  Nearest is the pose's own family — the crouches when you are on a crouch —
 *  because a pose is nearly always redrawn by a neighbour of itself. Within
 *  that, what the game actually draws leads what is only banked beside it: an
 *  alternate is a real answer, but the drawing in play is the likelier one.
 */
function spriteCatalogue(charKey, current, primaryOnly = false) {
  const family = spriteFamily(current);
  const buckets = [[], [], [], [], []];
  const seen = new Set();
  for (const key of allFramesOf(charKey)) {
    const live = frameMeta(charKey, key);
    const used = statesUsing(charKey, key).length > 0;
    const near = spriteFamily(key) === family;
    const drawings = [];
    if (live?.file) drawings.push({ file: live.file, meta: live, primary: true, label: null });
    // The LIVE option objects, not variantsOf()'s copies: right-clicking a
    // tile writes a deletion tag onto the drawing, and a tag written to a copy
    // is a tag written to nothing.
    for (const o of primaryOnly ? [] : (variantEntry(charKey, key)?.options || [])) {
      if (!o.file || o.file === live?.file) continue;
      drawings.push({ file: o.file, meta: poseView(o), primary: false, label: o.label, option: o });
    }
    for (const d of drawings) {
      if (seen.has(d.file)) continue;
      seen.add(d.file);
      const item = { ...d, pose: key, used, caption: frameLabel(charKey, key).name };
      // In play and in the family first, then the drawings banked beside them,
      // then the same pair for everything outside the family, and the cells
      // nothing draws last with their own alternates.
      const bucket = !used ? 4
        : near ? (d.primary ? 0 : 1)
        : (d.primary ? 2 : 3);
      buckets[bucket].push(item);
    }
  }
  const titles = [
    family ? `The ${family} sprites the game draws` : "What the game draws",
    family ? `Other ${family} drawings` : "Other drawings",
    "Everything else the game draws",
    "Other drawings of those",
    "Sheet cells nothing draws",
  ];
  const out = [];
  buckets.forEach((list, i) => {
    if (!list.length) return;
    out.push({ head: titles[i] });
    out.push(...list);
  });
  return out;
}

function closeSpritePicker() {
  $("spritePicker").hidden = true;
  cancelDwell();
  pickerWatcher?.disconnect();
  pickerWatcher = null;
  pickerPage = null;
  closePickerMenu();
  closePickerPreview();
}

/** A tile for one DRAWING. Captioned with the pose it belongs to and, for a
 *  drawing the pose is not currently using, what that drawing is. */
function buildDrawingTile(d, current, onPick) {
  const tile = document.createElement("button");
  const doomed = () => d.option?.needsReplacement === "delete";
  tile.className = "picker-tile"
    + (d.file === current ? " current" : "")
    + (doomed() ? " doomed" : "");
  const cv = document.createElement("canvas");
  cv.width = 132; cv.height = 132;
  tile.appendChild(cv);
  const cap = document.createElement("span");
  const sub = d.label || (d.primary ? (d.used ? "in the game" : "unused") : "alternate");
  cap.innerHTML = `${d.caption ?? d.pose ?? ""}<i>${sub}</i>`;
  tile.appendChild(cap);
  tile.title = `${d.pose ? `${d.pose} — ` : ""}${d.file}`;

  const paint = () => {
    const img = d.img || spriteFileImage(d.file)
      || (d.primary && d.pose ? frameImage(state.char, d.pose) : null);
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    if (!img || !d.meta) {
      c.fillStyle = "rgba(154, 164, 192, 0.5)";
      c.font = "600 10px Inter, sans-serif";
      c.textAlign = "center";
      c.fillText("loading…", cv.width / 2, cv.height / 2);
      loadSpriteFile(d.file).then((ok) => { if (ok) paint(); });
      return;
    }
    const pad = 10;
    const scale = Math.min((cv.width - pad * 2) / d.meta.w, (cv.height - pad * 2) / d.meta.h);
    c.drawImage(img, cv.width / 2 - (d.meta.w * scale) / 2,
                cv.height - pad - d.meta.h * scale, d.meta.w * scale, d.meta.h * scale);
  };
  paint();

  const choose = () => { onPick(d.file, d); closeSpritePicker(); };
  tile.onclick = choose;
  tile.oncontextmenu = (e) => {
    e.preventDefault();
    cancelDwell();
    closePickerPreview();
    openPickerMenu(e, d, tile, choose, paint);
  };

  // Dwell to enlarge. A thumbnail is enough to tell an idle from a crouch and
  // not enough to judge a hand, so the bigger look is what you get for staying
  // still — no click to spend, and none to spend getting out of it either.
  // Delayed, or sweeping the grid on the way to one tile would flash the
  // preview over every tile in the path.
  tile.onmouseenter = (e) => {
    let x = e.clientX, y = e.clientY;
    tile.onmousemove = (m) => { x = m.clientX; y = m.clientY; };
    startDwell(() => openPickerPreview(d, x, y));
  };
  tile.onmouseleave = () => {
    tile.onmousemove = null;
    cancelDwell();
    closePickerPreview();
  };
  return tile;
}

const DWELL_MS = 320;
let dwellTimer = 0;

function startDwell(fn) {
  cancelDwell();
  dwellTimer = setTimeout(fn, DWELL_MS);
}

function cancelDwell() {
  clearTimeout(dwellTimer);
  dwellTimer = 0;
}

// -------------------------------------------------- the tile context menu
//
// Right-click asks about the DRAWING under the cursor rather than the pose in
// the panel, which is the only place that question can be asked of art the
// pose is not using — a bad alternate is invisible everywhere else.

function closePickerMenu() {
  document.getElementById("pickerMenu")?.remove();
}

function openPickerMenu(e, d, tile, choose, repaint) {
  closePickerMenu();
  const menu = document.createElement("div");
  menu.id = "pickerMenu";
  menu.className = "picker-menu";
  const doomed = d.option?.needsReplacement === "delete";
  // Deleting the only drawing a pose has would leave a hole where a sprite
  // should be, so it is offered on a drawing that has somewhere to fall back
  // to — the same rule the panel's own delete tag follows.
  const spare = d.pose ? poseVariants(state.char, d.pose).length > 1 : false;
  const items = doomed
    ? [["Restore this sprite", () => setDrawingDoomed(d, false, tile, repaint)]]
    : [
      ["Choose this sprite", choose],
      ["Delete this sprite", spare && d.option ? () => setDrawingDoomed(d, true, tile, repaint) : null,
       "the only drawing this pose has — deleting it would leave a hole"],
    ];
  for (const [label, action, why] of items) {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !action;
    if (!action && why) b.title = why;
    b.onclick = () => { closePickerMenu(); action?.(); };
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - w - 8)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - h - 8)}px`;
  setTimeout(() => document.addEventListener("mousedown", onMenuOutside, true), 0);
}

function onMenuOutside(e) {
  if (document.getElementById("pickerMenu")?.contains(e.target)) return;
  document.removeEventListener("mousedown", onMenuOutside, true);
  closePickerMenu();
}

/** Mark one drawing for deletion, or take the mark off.
 *
 *  The same tag the panel's "Delete variant" writes — a statement about an
 *  IMAGE, banked on its variant option, collected by the request tooling and
 *  exported through `variantPlacement`. Here it can be put on a drawing the
 *  pose is not using, which is where a bad alternate actually lives. */
function setDrawingDoomed(d, doomed, tile, repaint) {
  if (!d.pose || !d.file) return;
  // Resolved from the manifest at the moment of writing, so the tag lands on
  // the drawing rather than on whatever object built the tile.
  const option = variantEntry(state.char, d.pose)?.options.find((o) => o.file === d.file);
  if (!option) return;
  d.option = option;
  if (doomed) option.needsReplacement = "delete";
  else delete option.needsReplacement;
  variantFlagEdits.add(`${state.char}/${d.pose}`);
  remember(state.char, d.pose);
  tile.classList.toggle("doomed", doomed);
  repaint();
  buildPoseList();
  refreshControls();
}

/** One tile's art, fetched if this character's set has not streamed in yet. */
function drawTileSprite(cv, key) {
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  // The drawing the GAME uses, numbers and image both. On a pose with a
  // replacement waiting the two come from different places, and a tile that
  // measured one against the other cropped the art it was drawing.
  const meta = frameMeta(state.char, key);
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
function openPickerPreview(d, clientX, clientY) {
  const box = $("pickerPreview");
  const cv = $("pickerPreviewCanvas");
  const meta = d.meta;
  const img = spriteFileImage(d.file)
    || (d.primary && d.pose ? frameImage(state.char, d.pose) : null);
  if (!meta) return;
  // A tile can be right-clicked before its art has streamed in; fetch it and
  // come back rather than doing nothing.
  if (!img) {
    loadSpriteFile(d.file).then((ok) => {
      if (ok && !$("spritePicker").hidden) openPickerPreview(d, clientX, clientY);
    });
    return;
  }
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  const pad = 16;
  const scale = Math.min((cv.width - pad * 2) / meta.w, (cv.height - pad * 2) / meta.h);
  c.drawImage(img, cv.width / 2 - (meta.w * scale) / 2, cv.height - pad - meta.h * scale,
              meta.w * scale, meta.h * scale);
  $("pickerPreviewLabel").innerHTML =
    `${d.caption ?? d.pose ?? ""}${d.label ? ` <i>${d.label}</i>` : ""} · ${meta.w}×${meta.h}`;
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

function sharedControls(key) {
  if (!key) return null;
  const info = sharedSpriteInfo(key);
  if (!info) {
    return { used: false, size: false, offset: false, rotate: false,
             what: "nothing in the game draws this, so there is no size or position to set" };
  }
  if (info.anchor === "screen") {
    return { used: true, size: false, offset: false, rotate: false, info,
             what: info.what };
  }
  // Every spawn site reads sharedAdjust now, so the nudge and the tilt are
  // always live. They were not: a dozen ultimate directors and a handful of
  // specials painted straight from `getImage`, and this took the controls off
  // rather than let them look live and do nothing. The right fix was the other
  // one — make the sites read it — because "this drawing cannot be moved" is
  // never a fact about a drawing, only a gap in the code that paints it.
  const nudge = info.nudge !== false;
  return {
    used: true,
    // A drawing whose height the spawn site decides per instance has no single
    // size to set; nor has one the RENDERER fixes a height for — Yuta's Rika at
    // 238px, Panda's triceratops at 210px, a domain backdrop cover-fitted to
    // the stage. Those have a height to draw them at and no way to change it.
    size: Number.isFinite(info.h) && info.sizable !== false,
    travels: !!info.travels,
    mirrored: !!info.mirrored,
    launch: info.launch || null,
    kind: info.kind || "effect",
    offset: nudge,
    rotate: nudge,
    nudgeSite: info.nudgeSite || null,
    info,
    what: info.what,
    anchor: info.anchor,
    owner: info.owner,
    measuredBox: !!info.measuredBox,
    bites: info.bites,
    hovers: info.hovers || null,
  };
}

/** Where on the drawing the game's spawn point lands, in words. */
const ANCHOR_WORDS = {
  centre: "painted AROUND the point — the middle of the drawing lands on it",
  feet: "painted STANDING ON the point — the bottom centre of the drawing lands on it",
  top: "hung FROM the point — the top centre of the drawing lands on it",
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

// Decisions made this session, exported as `approvals`. Kept apart from the
// numbers because it is a different kind of change: not "this pose moved" but
// "this drawing is the one the game should use from now on".
const approvalSettled = new Map();

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
  $("poseCount").textContent = `${frames.length} shown`
    + (hidden > 0 ? ` · ${hidden} hidden` : "")
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
                 + " optional, the replacement is measured from scratch" : "");
  const selected = charKey === state.char && key === state.frame;
  b.className = (selected ? "sel " : "")
    + (isDirty(charKey, key) || variantFlagEdits.has(`${charKey}/${key}`) ? "dirty " : "")
    + (needsReplacement(charKey, key) || doomed ? "flagged " : "")
    + (wantsImprovement(charKey, key) ? "wanted " : "")
    + (requested ? "warned " : "")
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
    rawMeta(state.char, state.frame).renderScale = Math.max(0.02, (orig.renderScale ?? 1) * relative);
    applySharedSpriteScales();
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

const round1 = (v) => Math.round(v * 10) / 10;

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
      if (TEXT_FIELDS.has(f)) {
        // "" is meaningful too — it clears a note rather than leaving the old
        // one standing, which matters when the flag it explains has changed.
        if ((value || "") !== (orig[f] || "")) entry[f] = value || "";
        continue;
      }
      if (!Number.isFinite(value)) continue;
      if (Math.abs(value - (orig[f] ?? 0)) > 1e-4) {
        // A tenth of a pixel is the right precision for a nudge and far too
        // coarse for the two fields that are not pixels: a scale needs four
        // places, and a fade measured in seconds over a 0–0.3 range has only
        // three usable steps at one. Each field gets the precision its UNIT
        // deserves rather than the one that suits most of them.
        const places = f === "renderScale" ? 4 : f === "fadeIn" ? 2 : 1;
        entry[f] = Number(value.toFixed(places));
      }
    }
    if (anchorsDirty(charKey, key) && meta.anchors) entry.anchors = meta.anchors;
    // The creature's attack box, when this session placed or moved one. An
    // object rather than a number, so it travels whole — four fractions that
    // only mean anything together.
    if (meta.attackBox && JSON.stringify(meta.attackBox) !== JSON.stringify(orig.attackBox)) {
      entry.attackBox = meta.attackBox;
    }
    // The hit region's own correction, likewise whole — an offset and a scale
    // that only mean anything together. `null` when it has been dragged back to
    // nothing, because clearing has to export as clearly as setting.
    if (JSON.stringify(meta.hit ?? null) !== JSON.stringify(orig.hit ?? null)) {
      entry.hit = meta.hit ?? null;
    }
    if (Object.keys(entry).length) {
      // WHICH DRAWING this tuning was measured against. A shared key resolves
      // to one fixed filename — `blood_orb.png` is always `blood_orb.png` — so
      // unlike a character pose, whose replacement lands under a new name, a
      // redelivered effect leaves no trace that the numbers beside it were
      // chosen for a picture that is gone. Naming the file is what lets the
      // apply tool fingerprint it and the checker notice later.
      const file = isOther(charKey) ? sharedFileOf(key) : null;
      if (file) entry.file = file;
      out[key] = entry;
    }
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
        // The drawing on screen has its numbers on the POSE, not on its option
        // — they are banked when the pose switches away, which has not
        // happened if you are still looking at it. Bank them here too, or the
        // export would ship an option that forgets the tuning it was given.
        const showing = rawMeta(charKey, pose)?.file;
        return [pose, entry ? entry.options.map((o) => ({
          file: o.file,
          // Provenance, for an option this session created: which pose the
          // drawing was borrowed from, and the name the chevron shows.
          ...(o.label ? { label: o.label } : {}),
          ...(o.borrowedFrom ? { borrowedFrom: o.borrowedFrom } : {}),
          ...takeBanked(o),
          ...(o.file === showing ? takeBanked(rawMeta(charKey, pose)) : {}),
          // Always present, so clearing a tag exports as clearly as setting one.
          needsReplacement: o.needsReplacement || false,
          // Same reason: approving a held-back replacement is the ABSENCE of
          // this flag, so it has to be stated rather than omitted.
          pending: !!o.pending,
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
  // Which held-back replacements were let into the game, and which were sent
  // back. Separate from the numbers: not "this pose moved" but "this drawing is
  // the one the game uses from now on".
  const approvals = {};
  for (const [id, verdict] of approvalSettled) {
    const [who, pose] = id.split("/");
    if (who === charKey) approvals[pose] = verdict;
  }
  if (Object.keys(approvals).length) payload.approvals = approvals;
  const actions = dirtyActions(charKey);
  if (Object.keys(actions).length) payload.animOverrides = actions;
  // The pinned reference travels with the edit that caused it, or the applied
  // manifest would re-derive the span from the new idle and resize the set.
  // `charKey in`, not a `??` default: an unpinned character's baseline is
  // legitimately `undefined`, and defaulting would swallow the first real pin.
  // This says only "if no baseline was ever taken, do not guess" — which
  // remember() now makes unreachable, and which fails by omitting rather than
  // by inventing a change.
  const span = spriteManifest?.heightSpans?.[charKey];
  if (Number.isFinite(span) && (charKey in state.originalSpans)
      && span !== state.originalSpans[charKey]) {
    payload.heightSpan = span;
  }
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
