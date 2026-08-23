// THE BENCH'S MODEL — what a sprite IS, as against how a panel shows it.
//
// Every function here answers a question about the sprite set: which poses a
// character has, what a pose is drawn from, what has been edited, what has been
// flagged, what a shared drawing's spawn site will let you change. None of them
// build any HTML or draw on any canvas, and nothing here calls back into a
// panel — the arrow points one way, from the panels into this file, so a change
// to how something is SHOWN cannot alter what it IS.
//
// It sits above bench_state.js (the canvas, the geometry, the mutable `state`)
// and below workbench.js (the viewer, the panels, the wiring).

import { spriteManifest, sharedSpriteKeys, getImage } from "../../src/assets.js";
import {
  anchorLocal, anchorsForFrame, statesUsingFrame, drawnByFallbackOnly, EXTRA_ANCHORS,
  animsOf,
  REPLACEMENT_KINDS, replacementKind, improvementKind, variantsOf, VARIANT_BANKED,
  VARIANT_ONLY_KINDS,
} from "../src/sprites.js";
import { sharedSpriteInfo, SPRITE_LIST_KEY_FIELDS } from "../../src/shared_sprites.js";
import { PIVOTED_STATES } from "../../src/motion.js";
import { WORLD } from "../../src/constants.js";
import { CHARACTERS, getActor } from "../../src/characters.js";
import { TRANSFORM_POSES, TRANSFORM_POSE_ALTERNATIVES } from "../../src/config_transform.js";
import { headHeightTarget, applyHeightScale, measuredIdleSpan } from "../../src/heights.js";
import { actorPosesReady } from "../../src/ultimates.js";
import {
  $, EDITABLE, KIND_FIELDS, BOOLEAN_FIELDS, TEXT_FIELDS, stateLabel, stateRank, OTHER_KEY,
  OTHER_LABEL, ACTOR_KEYS, WB_FIGHTERS, isOther, isActor, state,
} from "./bench_state.js";

// What the pose list shows. These filter on what is SAVED in the codebase, not
// on what you have done since the page loaded — "unedited" means "no adjustment
// has been committed for this pose yet", so it is a to-do list of poses nobody
// has dealt with. Working on a pose must not remove it from that list mid-edit;
// the dot beside it is what says you have touched it. See hasSavedEdits().
export const VIEWS = {
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

/** The state a frame is named by: the first one in STATE_ORDER that draws it.
 *  Null for a frame nothing draws — an unused sheet cell has no action. */
export function primaryState(charKey, frameKey) {
  const states = statesUsing(charKey, frameKey);
  if (!states.length) return null;
  return states.slice().sort((a, b) => stateRank(a) - stateRank(b))[0];
}

/** What to call a frame in the UI. Semantic files already say what they are, so
 *  they keep their own name; a grid cell is shown by the action it serves, with
 *  the file name kept alongside because that is what is on disk. */
export function frameLabel(charKey, frameKey) {
  if (!/^r\dc\d$/.test(frameKey)) return { name: frameKey, sub: "" };
  const primary = primaryState(charKey, frameKey);
  return primary
    ? { name: stateLabel(primary), sub: frameKey }
    : { name: frameKey, sub: "unused" };
}

/** Character-ish record for anything selectable, real fighter or not. */
export function actorOf(charKey) {
  if (isOther(charKey)) return { name: OTHER_LABEL, scale: 1 };
  return getActor(charKey) || { name: charKey, scale: 1 };
}

/** The character whose kit spawns this shared sprite, if one does. The usage
 *  index records the name for reading; this wants the key, to draw them. */
export function sharedOwner(key) {
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
export function supersededStandIn(stack, key, cfg) {
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

export let registeredShared = null;

export let sharedUsageCache = null;

export function sharedUsage() {
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
export function installColorOf(key) {
  return sharedSpriteInfo(key)?.installColor || "#8fd3ff";
}

/** The moves of `charKey` that draw this shared art, named — "Piercing Blood",
 *  "Overtime (aura)". Joined when a kit names the same drawing from more than
 *  one move, because that is a fact about the drawing worth seeing before you
 *  resize it: the other move is about to move too. */
export function movesDrawing(key, charKey) {
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
export function effectsOf(charKey) {
  const out = [];
  for (const [key, uses] of sharedUsage()) {
    // A stand-in the fighter's own creature art supersedes is not one of their
    // effects — it is a fallback nothing reaches. Listing it sent you to tune a
    // drawing against a body that never draws it.
    if (uses.some((u) => u.charKey === charKey && !u.dead)) out.push(key);
  }
  return out.sort();
}

export function statesUsing(charKey, frameKey) {
  // A first delivery being held is drawn by NOTHING while it waits — the game
  // is still resolving its states to their fallback, which is the whole point
  // of the hold — so the honest game-side answer is an empty list. That answer
  // would drop the pose out of every working view as "not drawn by any state",
  // which is exactly the pose somebody has to place and decide about. So the
  // bench asks the other question: which states DECLARE this frame, and will
  // draw it the moment it is approved.
  const held = approvalNote(charKey, frameKey);
  if (held && !held.live) {
    return Object.entries(animsOf(charKey))
      .filter(([, anim]) => anim.frames.includes(frameKey))
      .map(([name]) => name);
  }
  return statesUsingFrame(charKey, frameKey);
}

// The two idle poses lead every character's list: they are the reference the
// other poses get compared against, so they should be a click away rather than
// wherever the alphabet happens to put them.
export const REFERENCE_POSES = ["idle_a", "idle_b"];

export function poseRank(key) {
  const i = REFERENCE_POSES.indexOf(key);
  return i === -1 ? REFERENCE_POSES.length : i;
}

export function byPose(a, b) {
  return poseRank(a) - poseRank(b) || a.localeCompare(b);
}

export function allFramesOf(charKey) {
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
export function isPending(charKey, frameKey) {
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
export function approvalNote(charKey, frameKey) {
  const note = rawMeta(charKey, frameKey)?.awaitingApproval || null;
  // A declined first delivery keeps its marker, because the marker is what
  // holds it out of the game — there is no older drawing of this pose to point
  // back at, so "no" is a hold that stays. It is not a QUESTION any more, and
  // the queue asks questions, so it is answered here and not there. Approving
  // later drops the marker and the pose goes in, which is what makes a no as
  // changeable as a yes.
  return note && !note.declined ? note : null;
}

/** A first delivery that was turned down and is being held out of the game. */
export function approvalDeclined(charKey, frameKey) {
  return rawMeta(charKey, frameKey)?.awaitingApproval?.declined || null;
}

export function awaitingApproval(charKey, frameKey) {
  return !!approvalNote(charKey, frameKey);
}

/** Poses the pose list offers, filtered by the current view. May be empty —
 *  "Edited only" on an untouched character legitimately matches nothing, and
 *  quietly widening the filter would be a lie about what you are looking at.
 *  The selected pose stays on the canvas either way. */
export function framesOf(charKey) {
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

/** The intake marker on a pose, or null. */
export function updateNote(charKey, frameKey) {
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
export function sharedTodoNote(frameKey) {
  if (!frameKey || !isUsed(OTHER_KEY, frameKey)) return null;
  // "I looked at this and it needed nothing" is a decision about the drawing,
  // and this list is a list of undecided ones. It is the same marker a pose
  // leaves by (`surfacedReviewed`, written by apply_sprite_adjustments.py) and
  // it is read explicitly rather than counted as a number below, because it is
  // a record of the looking rather than a placement.
  if (peekMeta(OTHER_KEY, frameKey)?.surfacedReviewed) return null;
  // A DOMAIN BACKDROP IS NEVER TO-DO. Cover-fitted to the whole stage
  // (drawDomainBackdrop, render.js): no size, no offset, no tilt. All nine sat
  // here permanently once, because the only way off this list is a number and
  // there was no number to set — a to-do item nobody could ever do.
  //
  // They came BACK when the panel learned that a plate wider than the frame can
  // be panned, because "has a control" is what this list reads as "has a
  // decision". Two of the nine really can pan — captivating_skandha and
  // time_cell_moon_palace are 1536x1024 against a 1280x720 stage, so 133px of
  // vertical is a genuine choice — but choosing a crop on a backdrop drawn at
  // 0.82 alpha behind a fight is not work anybody is waiting on, and the list is
  // for work somebody must do. The control stays in the panel, where the art is
  // loaded and the slack can be measured; the queue does not ask for it. What a
  // backdrop still has is a redraw flag, which is the other list and the right
  // place for "this backdrop is wrong".
  if (sharedSpriteInfo(frameKey)?.anchor === "screen") return null;
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
export const BOOKKEEPING = new Set(["edited", "src", "autoTuned", "surfacedReviewed",
                                    // What smooth_cycles.py changed and from what.
                                    // A tool's record of its own work, like
                                    // `autoTuned` — not somebody's decision.
                                    "smoothed"]);

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
export function isSurfaced(charKey, frameKey) {
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
export const tunedChars = new Map();

export function charHasTuning(charKey) {
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
export const TODO_MARK = "\u25cf ";

export const NO_TODO_PAD = "  ";

/** What is still waiting on this character, as a short reason or null.
 *
 *  Two things count, ordered by how much they block: art the game is NOT yet
 *  drawing because nobody has approved it, then poses nobody has placed. Both
 *  read committed state.
 */
export function charTodo(charKey) {
  const frames = allFramesOf(charKey);
  const waiting = frames.filter((k) => awaitingApproval(charKey, k)).length;
  if (waiting) return `${waiting} replacement${waiting === 1 ? "" : "s"} awaiting approval`;
  const unplaced = frames.filter((k) => isUsed(charKey, k) && !hasSavedEdits(charKey, k)).length;
  return unplaced ? `${unplaced} pose${unplaced === 1 ? "" : "s"} with no saved edits` : null;
}

/** The stand-in marker for a surfaced pose, shaped like an intake one so the
 *  panel, the list and the reviewed toggle all read it the same way. */
export function surfacedNote(charKey, frameKey) {
  return isSurfaced(charKey, frameKey) ? { at: "", kept: "keep", how: "surfaced", lost: [] } : null;
}

// Poses marked reviewed this session. Session-only, exactly like an edit: the
// manifest marker cannot go until an export has been applied, so these stay on
// the list, ticked and dimmed, rather than vanishing as they are marked. Dropping
// them on the spot would also hide what still had to be exported.
export const updatesCleared = new Set();

export const isUpdateReviewed = (charKey, frameKey) => updatesCleared.has(`${charKey}/${frameKey}`);

/** Every pose carrying an intake marker, across the whole roster.
 *
 *  Ordered newest round first, and within a round the poses that LOST hand
 *  tuning lead — they are the ones with work to redo, as against a touch-up
 *  that came back with its numbers intact. Then by character and pose, so the
 *  list holds still while it is worked through. */
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

/** The cross-character list itself. */
export function recentUpdates() {
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
export function flaggedPoses() {
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
export function allFlagBearingPoses() {
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
export function updateSummary(note) {
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
export function autoTuneSummary(charKey, frameKey) {
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

export function poseVariants(charKey, frameKey) {
  if (isOther(charKey)) return [];
  return variantsOf(charKey, frameKey);
}

export function variantEntry(charKey, frameKey) {
  return spriteManifest?.variants?.[charKey]?.[frameKey] || null;
}

/** Copy the fields that belong to the drawing — placement and review both —
 *  off a meta object. */
export function takeBanked(meta) {
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
export function poseView(option) {
  const out = takeBanked(option);
  if (VARIANT_ONLY_KINDS.has(out.needsReplacement)) delete out.needsReplacement;
  return out;
}

// Frames whose drawing was switched this session, so the export can say so.
export const variantPicks = new Map();

// Drawings whose delete tag was changed this session. Tracked separately from
// the pose's own flags because the tag belongs to an IMAGE: you mark the bad
// drawing, then switch back to the good one, and the mark has to stay on the
// drawing you marked rather than follow the selection.
export const variantFlagEdits = new Set();

/** The variant option the pose is currently pointing at, if it has any. */
export function currentOption(charKey, frameKey) {
  const entry = variantEntry(charKey, frameKey);
  const meta = rawMeta(charKey, frameKey);
  if (!entry || !meta) return null;
  return entry.options.find((o) => o.file === meta.file) || null;
}

/** True when the drawing on screen is tagged for deletion. */
export function isDeleteTagged(charKey, frameKey) {
  return currentOption(charKey, frameKey)?.needsReplacement === "delete";
}

/** Any drawing of this pose tagged for deletion — what the pose list marks, so
 *  a tagged variant is findable without opening every chevron. */
export function hasDeleteTag(charKey, frameKey) {
  const entry = variantEntry(charKey, frameKey);
  return !!entry?.options.some((o) => o.needsReplacement === "delete");
}

// ------------------------------------------------------- one pose, everybody
//
// The Actions view's two lists (bench_state.js ACTIONS_KEY): which poses there
// are to audit, and who has each one. Both are answers about the whole roster,
// so both are worked out once and kept — `statesUsing` walks every animation
// state of a character, and asking it thirty-five times over sixty poses on
// every repaint would be felt.
//
// The cache is never invalidated because nothing this session can change it:
// which poses a character HAS is the manifest as it was loaded, and which
// states draw them is `src/characters.js`. Pointing a pose at another drawing
// changes the art, not whether the pose exists.
let actionIndexCache = null;

/** pose key -> the characters that have it, drawn poses only, in roster order.
 *
 *  DRAWN, not merely present: the sheet cells a fighter still carries are not
 *  an action anybody audits, and they would bury the sixty real poses under
 *  several hundred `r2c1`s. A pose counts as drawn if any character draws it,
 *  and every character that HAS it is then listed — including one whose own
 *  animation table has not been re-pointed at it yet, since "Toji has this
 *  drawing and does not use it" is exactly the sort of thing this view is for.
 */
export function actionIndex() {
  if (actionIndexCache) return actionIndexCache;
  const roster = [...WB_FIGHTERS, ...ACTOR_KEYS];
  const drawn = new Set();
  const has = new Map();
  for (const char of roster) {
    for (const key of allFramesOf(char)) {
      if (!peekMeta(char, key)?.file) continue;
      has.set(key, [...(has.get(key) || []), char]);
      if (statesUsing(char, key).length) drawn.add(key);
    }
  }
  actionIndexCache = new Map(
    [...has].filter(([key]) => drawn.has(key)).sort((a, b) => byPose(a[0], b[0])),
  );
  return actionIndexCache;
}

/** The characters that have this pose, and the ones that do not. */
export function actionRoster(frameKey) {
  const with_ = actionIndex().get(frameKey) || [];
  const set = new Set(with_);
  const without = [...WB_FIGHTERS, ...ACTOR_KEYS].filter((c) => !set.has(c));
  return { with: with_, without };
}

/**
 * EVERY DRAWING THE GAME IS CURRENTLY PUTTING ON SCREEN for this character.
 *
 * The one question a delete tag has to be able to answer. It is asked of the
 * FILE rather than of the pose in front of you: one drawing can be the art of
 * several poses, so "this pose does not draw it" is not the same sentence as
 * "nothing draws it", and only the second one makes a drawing safe to throw
 * away.
 *
 * Resolved through `statesUsing`, which follows a state's `fallback` — a pose
 * no animation names by hand can still be the drawing every match shows.
 *
 * A set, built once per ask: the caller is about to test it against a hundred
 * tiles, and `statesUsing` walks every animation state each time it is called.
 */
export function drawnFiles(charKey) {
  const out = new Set();
  if (isOther(charKey)) return out;
  for (const key of allFramesOf(charKey)) {
    if (!statesUsing(charKey, key).length) continue;
    const file = peekMeta(charKey, key)?.file;
    if (file) out.add(file);
  }
  return out;
}

/**
 * The variant option that holds what is known about one drawing of one pose,
 * brought into being if the pose has never had options.
 *
 * A delete tag is a statement about an IMAGE, and the variants list is where
 * statements about images live. Most drawings already have somewhere to put
 * one; a pose that was delivered once and never compared against anything has
 * no entry at all, and that is exactly the pose whose art is most likely to be
 * junk nobody wants. Rather than refuse the tag, the entry is created — the
 * same entry `apply_sprite_adjustments.py` creates on the other side when the
 * export arrives, seeded with what is already known about the drawing so it
 * reads like every other option rather than like a bare file name.
 */
export function ensureVariantOption(charKey, frameKey, file, label) {
  if (!spriteManifest || isOther(charKey) || !file) return null;
  const entry = ((spriteManifest.variants ??= {})[charKey] ??= {})[frameKey]
    ??= { options: [] };
  entry.options ??= [];
  let option = entry.options.find((o) => o.file === file);
  if (option) return option;
  const meta = peekMeta(charKey, frameKey);
  option = { file, ...(label ? { label } : {}),
             ...(meta?.file === file ? takeBanked(meta) : {}) };
  entry.options.push(option);
  return option;
}

/** The RAW manifest object the renderer reads. `frameMeta` may hand back a
 *  copy, so all mutation must go through this or edits would be discarded. */
export function rawMeta(charKey, frameKey) {
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
export function peekMeta(charKey, frameKey) {
  if (isOther(charKey)) return spriteManifest?.otherSprites?.[frameKey] || null;
  return spriteManifest?.characters?.[charKey]?.[frameKey] || null;
}

// Head height is the character's GLOBAL size: every frame is drawn at a scale
// solved from it (src/heights.js), so moving this resizes the whole sprite set
// at once rather than just shifting a guide line. Unset, it resolves from the
// fighter's canon height in characters.js; setting it here writes an override.
export function headHeight(charKey) {
  return headHeightTarget(charKey);
}

export function setHeadHeight(charKey, value) {
  (spriteManifest.headHeights ??= {})[charKey] = Math.max(20, value);
  applyHeightScale(charKey);   // rescale every frame of this character now
}

export function clearHeadHeight(charKey) {
  if (spriteManifest.headHeights) delete spriteManifest.headHeights[charKey];
  applyHeightScale(charKey);
}

// The frame the character's scale is solved against.
export const HEIGHT_FRAMES = ["idle_a", "r0c0"];

export function isHeightReferenceFrame(charKey, frameKey) {
  for (const key of HEIGHT_FRAMES) {
    if (rawMeta(charKey, key)) return key === frameKey;
  }
  return false;
}

/** Freeze the character's scale reference at what it is NOW, before an edit to
 *  the idle changes it. Otherwise resizing the idle re-solves the scale and
 *  every other pose in the set moves with it — which is the height target's
 *  job, not the idle's. Pinned once; later idle edits ride on the frozen value. */
export function pinHeightSpan(charKey, frameKey) {
  if (!isHeightReferenceFrame(charKey, frameKey)) return;
  spriteManifest.heightSpans ??= {};
  if (Number.isFinite(spriteManifest.heightSpans[charKey])) return;
  const span = measuredIdleSpan(charKey);
  if (span > 0) spriteManifest.heightSpans[charKey] = Number(span.toFixed(2));
}

export function rememberSpan(charKey) {
  if (!(charKey in state.originalSpans)) {
    state.originalSpans[charKey] = spriteManifest?.heightSpans?.[charKey];
  }
}

export function rememberHead(charKey) {
  state.originalHeads[charKey] ??= headHeight(charKey);
  if (!(charKey in state.originalHeadOverride)) {
    state.originalHeadOverride[charKey] = spriteManifest?.headHeights?.[charKey];
  }
}

export function snapshot(charKey, frameKey) {
  const meta = rawMeta(charKey, frameKey);
  const out = {};
  for (const f of EDITABLE) out[f] = meta[f];
  // deep so an undo entry can't alias the live anchors object
  out.anchors = meta.anchors ? JSON.parse(JSON.stringify(meta.anchors)) : null;
  out.attackBox = meta.attackBox ? { ...meta.attackBox } : null;
  out.hit = meta.hit ? { ...meta.hit } : null;
  return out;
}

export function restore(charKey, frameKey, snap) {
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

export const ANCHOR_META = {
  com: {
    label: "Centre of mass",
    hint: "The pivot every rotation turns about — tumbles, rolls, leans and " +
          "the idle sway. Defaults to the detected centroid at navel height.",
  },
  ...EXTRA_ANCHORS,
};

/** Anchors offered for the current frame: `com` when it does anything, plus any
 *  state-specific one the frame's animations call for. */
export function anchorNames(charKey, frameKey) {
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
export function comPivots(charKey, frameKey) {
  if (state.anchorForced.has(`${charKey}/${frameKey}`)) return true;
  if (rawMeta(charKey, frameKey)?.rotationDeg) return true;
  return statesUsing(charKey, frameKey).some((s) => PIVOTED_STATES.has(s));
}

/** Current value in image-local px, resolved from the default when unset. */
export function anchorValue(charKey, frameKey, name) {
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

export function setAnchor(charKey, frameKey, name, x, y) {
  const meta = rawMeta(charKey, frameKey);
  (meta.anchors ??= {})[name] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

/** Anchors are visible unless explicitly switched off. */
export function isAnchorShown(name) {
  // One switch, under the canvas, next to the other things drawn on it. The
  // per-anchor checkboxes in the panel were a second place to look for the
  // same answer, on a control whose real interface is the handle itself.
  return $("showAnchors")?.checked !== false && state.anchorShown[name] !== false;
}

export function anchorsDirty(charKey, frameKey) {
  const orig = state.originals[charKey]?.[frameKey];
  if (!orig) return false;
  const now = rawMeta(charKey, frameKey).anchors || null;
  return JSON.stringify(now) !== JSON.stringify(orig.anchors || null);
}

export function remember(charKey, frameKey) {
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

export function isDirty(charKey, frameKey) {
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
export function drawableSharedKey(key) {
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
export function attackBoxDirty(charKey, frameKey) {
  const orig = state.originals[charKey]?.[frameKey];
  if (!orig) return false;
  const now = rawMeta(charKey, frameKey)?.attackBox;
  return JSON.stringify(now ?? null) !== JSON.stringify(orig.attackBox ?? null);
}

/** A creature's poses and the creature share one attack box, so editing it from
 *  a pose has to mark the CREATURE dirty — the export walks the dirty list, and
 *  a box placed on the attack pose would otherwise never be reached. */
export function markCreatureDirty(key) {
  const owner = attackBoxKey(key);
  if (owner !== key) remember(OTHER_KEY, owner);
}

/** The hit region's correction, compared whole, and in the dirty test for
 *  exactly the reason the attack box is: `payloadFor` walks the dirty list, so
 *  a drawing whose only change was its hit circle would never be reached and
 *  the edit would be dropped at export. */
export function hitDirty(charKey, frameKey) {
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
export const savedAtLoad = new Set();      // "char/frame" that arrived already dealt with

export const savedScanned = new Set();     // characters whose saved state has been read

/** Read a character's committed state ONCE, before anything can be edited.
 *  `rawMeta` is the live manifest object the workbench mutates in place, so
 *  asking it later would report an in-session flag as a committed one. */
export function rememberSaved(charKey) {
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
export function hasSavedEdits(charKey, frameKey) {
  rememberSaved(charKey);
  return savedAtLoad.has(`${charKey}/${frameKey}`);
}

export function isUsed(charKey, frameKey) {
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
  return statesUsing(charKey, frameKey).length > 0;
}

export function needsReplacement(charKey, frameKey) {
  return !!replacementKind(rawMeta(charKey, frameKey));
}

export function kindLabel(kind, kinds = REPLACEMENT_KINDS) {
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
export function redrawPending(charKey, frameKey) {
  const kind = replacementKind(rawMeta(charKey, frameKey));
  return !!kind && kind !== "delete";
}

export function wantsImprovement(charKey, frameKey) {
  return !!improvementKind(rawMeta(charKey, frameKey));
}

/** Every frame of this character edited this session — NOT filtered by the
 *  current view. Export, the change count and Reset character all read this,
 *  and all three would be wrong if the pose list's filter could hide an edit
 *  from them: an export would silently drop work, and a reset would silently
 *  leave some behind. */
export function dirtyFrames(charKey) {
  return allFramesOf(charKey).filter((k) => isDirty(charKey, k));
}

/** Record a frame's state BEFORE a change. One call per discrete edit. */
export function pushHeadHistory(charKey) {
  state.undo.push({ kind: "head", char: charKey, before: headHeight(charKey) });
  if (state.undo.length > 200) state.undo.shift();
  state.redo.length = 0;
  refreshHistoryButtons();
}

export function pushHistory(charKey, frameKey) {
  state.undo.push({ char: charKey, frame: frameKey, before: snapshot(charKey, frameKey) });
  if (state.undo.length > 200) state.undo.shift();
  state.redo.length = 0;      // a new edit invalidates the redo branch
  refreshHistoryButtons();
}

export function refreshHistoryButtons() {
  $("undoBtn").disabled = state.undo.length === 0;
  $("redoBtn").disabled = state.redo.length === 0;
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
export function attackBoxKey(key) {
  const parts = String(key || "").split(":");
  return parts[0] === "summon" && parts.length === 3 ? `${parts[0]}:${parts[1]}` : key;
}

/** How much of a cover-fitted backdrop falls outside the frame, in stage px, or
 *  null when none of it does. The cover fit scales the plate up until it covers
 *  the stage on both axes; whatever the longer axis has left over is the range
 *  a pan can move within. A plate at the stage's own aspect has none, which is
 *  the case for seven of the nine domains. */
export function panSlack(key) {
  const art = getImage(key);
  // NOT LOADED IS NOT "NO SLACK". Domain plates are fetched lazily (`optional`
  // in src/assets.js), so the panel can be built before the picture arrives —
  // and answering "no" then would take a live control away on a race. Undefined
  // means unknown; the caller offers the control and the note stays general.
  if (!art?.width || !art?.height) return undefined;
  const scale = Math.max(WORLD.w / art.width, WORLD.h / art.height);
  const x = art.width * scale - WORLD.w;
  const y = art.height * scale - WORLD.h;
  return (x > 1 || y > 1) ? { x: Math.max(0, x), y: Math.max(0, y) } : null;
}

export function sharedControls(key) {
  if (!key) return null;
  const info = sharedSpriteInfo(key);
  if (!info) {
    return { used: false, size: false, offset: false, rotate: false,
             what: "nothing in the game draws this, so there is no size or position to set" };
  }
  if (info.anchor === "screen") {
    // A domain backdrop: cover-fitted, so no size and no tilt. `pan` is the one
    // thing it can do — drawDomainBackdrop reads dx/dy to choose which part of
    // an over-wide plate shows — but ONLY where the plate is actually bigger
    // than the frame it is fitted into. Seven of the nine are exactly 1280x720,
    // the stage's own aspect: the cover fit consumes the whole picture, so a
    // nudge slides it off one edge and leaves a gap at the other. There is no
    // choice to make.
    //
    // Saying `pan: true` for all nine put every domain on the recently-updated
    // list, because "has a control" is what that list means by "has a decision
    // to make". Two of them belong there — captivating_skandha and
    // time_cell_moon_palace are 1536x1024 and carry 133px of vertical slack, so
    // which 720 rows show is a real unmade decision. The other seven do not.
    const slack = panSlack(key);
    return { used: true, size: false, rotate: false, info, slack,
             offset: !!info.pan && slack !== null,
             what: slack
               ? `${info.what} — this plate has ${Math.round(slack.y)}px of vertical`
                 + `${slack.x > 1 ? ` and ${Math.round(slack.x)}px of horizontal` : ""}`
                 + " slack to choose from"
               : slack === null
                 ? "a full-screen backdrop at exactly the stage's aspect — the fit uses"
                   + " the whole plate, so there is no size, no tilt and nothing to pan to"
                 : info.what };
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

/** The frames the kit itself gives this state, ignoring any override. */
export function originalAnimFrames(charKey, stateName) {
  return state.originalAnims[charKey]?.[stateName] ?? null;
}

// Decisions made this session, exported as `approvals`. Kept apart from the
// numbers because it is a different kind of change: not "this pose moved" but
// "this drawing is the one the game should use from now on".
export const approvalSettled = new Map();
