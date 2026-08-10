// Per-drawing adjustments for the shared `effect:*` and `summon:*` art.
//
// These sprites belong to no fighter. They have no manifest entry of their own
// and no placement data: the code that spawns each one decides where it goes
// and how big it is, from `sprite` and `spriteH` in the kit that throws it.
// That is the right shape — a projectile's size is a property of the move, not
// of the picture — but it leaves two things nobody can fix without editing a
// kit by hand:
//
//   faceLeft     art that arrived drawn facing the wrong way. Every fighter's
//                sheet is drawn facing right and the renderer mirrors it; an
//                effect that points left is simply wrong, everywhere it is
//                used. Applied in assets.js, at the one place a drawing is
//                read, so no spawn site has to know about that one file.
//
//   renderScale  art delivered at the wrong size RELATIVE to the character who
//                throws it. The kits declare a height in pixels each; rather
//                than re-authoring fifty numbers by eye, the workbench tunes
//                one multiplier against the character it is drawn beside, and
//                it is folded into those declared heights here.
//
//                Kit `spriteH` is not the only place a size comes from, and it
//                used to be the only one this reached — so a scale set on a
//                summon, an install aura or a stage hazard was stored, showed
//                in the workbench, and did nothing on stage. `sharedScale()`
//                is now read at those draw sites too.
//
//   dx, dy       where the picture sits relative to the point the game spawns
//                it on. Art arrives off-centre in its plate and the collision
//                point is not negotiable, so the drawing moves.
//
//   rotationDeg  a standing tilt correction, about the same point. Art that
//                arrives at an angle is otherwise unusable for anything the
//                engine turns itself.
//
// Both are written by the sprite workbench's Other Sprites view and stored in
// `otherSprites` in the manifest, beside the review flags that already live
// there.

import { CHARACTERS, CHARACTER_KEYS } from "./characters.js";
import { spriteManifest } from "./assets.js";

/** How a kit node names a shared drawing, and which field holds the height that
 *  drawing is painted at.
 *
 *  There is no single convention and there does not need to be — a projectile's
 *  `spriteH`, a pigeon orb's `orbSpriteH` and a dropped vending machine's plain
 *  `h` are each the natural name in their own move. What matters is that every
 *  one of them is listed here, because a pair that is missing is a drawing the
 *  workbench cannot size and the usage index reports as unused. Three moves'
 *  worth of art sat in exactly that hole: Reggie's drops, Mechamaru's orbs.
 *
 *  A null height means the drawing is sized by the renderer rather than by the
 *  kit — auras and domain backdrops — and is handled at those draw sites.
 */
const SPRITE_FIELDS = [
  // A list per field, first one present wins: Yuta's side special names Rika
  // under `sprite` but declares her height as plain `h`, so a single partner
  // name would leave that one drawing unscalable.
  ["sprite", ["spriteH", "h"]],
  ["orbSprite", ["orbSpriteH"]],
  ["key", ["h"]],          // a random-drop entry: `{ key: "effect:…", w, h }`
  ["aura", []],
  ["domainSprite", []],
];

/** Fields holding a LIST of interchangeable drawings that share one declared
 *  height, and the field that declares it.
 *
 *  `sprites` is a preference list — the first drawing that has loaded is the
 *  one used, the rest are stand-ins. `spritePool` is a random pick: Geto's
 *  volley throws one of four curses per shot, all painted at the same
 *  `spriteH`. Both are one height for several keys, so a size set on any
 *  member is a statement about all of them — which is honest, because the move
 *  declares one number and there is nowhere to put a second.
 *
 *  `spritePool` was missing here, and it is the whole reason the four curses
 *  could be sized in the workbench with nothing happening on stage and be
 *  reported as belonging to a summon they are only the stand-in for. It is the
 *  same hole this file's header describes Reggie's drops falling into. */
const SPRITE_LIST_FIELDS = [
  ["sprites", "spriteH"],
  ["spritePool", "spriteH"],
];

/** The list fields' names, for the checker that polices this contract. */
export const SPRITE_LIST_KEY_FIELDS = SPRITE_LIST_FIELDS.map(([f]) => f);

/** Field names that hold a shared-sprite key, for callers that only need those. */
export const SPRITE_KEY_FIELDS = [
  ...SPRITE_FIELDS.map(([f]) => f),
  ...SPRITE_LIST_FIELDS.map(([f]) => f),
];

const isSharedKey = (v) => typeof v === "string"
  && (v.startsWith("effect:") || v.startsWith("summon:") || v.startsWith("stagefx:"));

/** The stored entry for a shared drawing, following the one inheritance rule
 *  this map has: a summon POSE (`summon:nue:idle_a`) falls back to its creature
 *  (`summon:nue`). The six poses of a creature are one drawing at one zoom, so
 *  a size set on any of them is a statement about the creature; without this,
 *  adjusting the pose you happen to be looking at silently does nothing. */
function entryOf(key) {
  const all = spriteManifest?.otherSprites;
  if (!all) return null;
  if (all[key]) return all[key];
  const parts = String(key).split(":");
  if (parts[0] === "summon" && parts.length === 3) return all[`${parts[0]}:${parts[1]}`] || null;
  return null;
}

function scaleOf(key) {
  const scale = entryOf(key)?.renderScale;
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

/**
 * Every per-drawing adjustment for a shared sprite, resolved.
 *
 *   scale   a multiplier on whatever height the drawing is drawn at, wherever
 *           that height comes from — a kit's `spriteH`, a creature's `h` in
 *           config_summons.js, the install aura's own constant, a stage
 *           hazard's. One knob, because "this art is delivered too big" is one
 *           fact about the picture and should not need finding in four files.
 *   dx, dy  a nudge in game pixels, applied where the drawing is painted and
 *           NOT to anything it collides with. That is the point: art arrives
 *           off-centre in its plate — an egg at one end of a long trail, a
 *           creature drawn to one side — and the fix is to move the picture
 *           onto the point the game is actually using, rather than to move the
 *           point. Positive dy is DOWN, matching canvas coordinates.
 *
 * Returns the identity adjustment for a drawing nobody has touched, so callers
 * can use it unconditionally.
 */
export function sharedAdjust(key) {
  const e = entryOf(key);
  const scale = Number.isFinite(e?.renderScale) && e.renderScale > 0 ? e.renderScale : 1;
  const deg = Number.isFinite(e?.rotationDeg) ? e.rotationDeg : 0;
  return {
    scale,
    dx: Number.isFinite(e?.dx) ? e.dx : 0,
    dy: Number.isFinite(e?.dy) ? e.dy : 0,
    // Radians, about the drawing's own anchor. A projectile already turns to
    // follow its flight path; this is the standing correction on top of that,
    // for art delivered at a tilt.
    rot: deg * Math.PI / 180,
    deg,
  };
}

/** Just the size multiplier, for the call sites that only need that. */
export function sharedScale(key) {
  return scaleOf(key) ?? 1;
}

/** Fold each shared sprite's scale into the `spriteH` of every kit entry that
 *  draws it, once, after the manifest has loaded.
 *
 *  The declared heights are the only size the spawn sites read, so multiplying
 *  them here reaches every one — including the effects drawn by code that has
 *  no idea the workbench exists. Idempotent: the baseline is remembered per
 *  node, so re-running after an edit re-derives rather than compounding.
 */
export function applySharedSpriteScales() {
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    for (const [field, heightFields] of SPRITE_FIELDS) {
      if (!isSharedKey(node[field])) continue;
      const heightField = heightFields.find((h) => Number.isFinite(node[h]));
      if (!heightField) continue;
      // Remembered on first visit, so an edit in the workbench scales the
      // authored height rather than the one the last edit left behind.
      const base = `${heightField}Base`;
      if (!Number.isFinite(node[base])) node[base] = node[heightField];
      const scale = scaleOf(node[field]);
      node[heightField] = scale ? node[base] * scale : node[base];
    }
    // A list of drawings under one declared height (SPRITE_LIST_FIELDS): the
    // first member with a scale set decides it, because there is a single
    // number to fold it into.
    for (const [field, heightField] of SPRITE_LIST_FIELDS) {
      if (!Array.isArray(node[field]) || !Number.isFinite(node[heightField])) continue;
      const base = `${heightField}Base`;
      if (!Number.isFinite(node[base])) node[base] = node[heightField];
      const scale = node[field].filter(isSharedKey).map(scaleOf).find((s) => s !== null);
      node[heightField] = scale ? node[base] * scale : node[base];
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  for (const key of CHARACTER_KEYS) {
    const char = CHARACTERS[key];
    visit(char?.specials);
    visit(char?.ultimate);
  }
}

// ---------------------------------------------------------------- the registry
//
// What the game does with each shared drawing: how tall it paints it, and which
// point on the picture it paints AT. Both were spread across four files and
// knowable only by reading them, which is why the workbench could offer a size
// slider that did nothing and a nudge with nothing to nudge against.
//
// `anchor` is the part of the drawing that lands on the spawn point:
//
//   centre   painted around the point — projectiles, impacts, the diving fang
//   feet     painted standing ON the point — creatures, auras, most hazards
//
// Everything here is derived from the code that actually draws, so a change
// there shows up as a change here rather than as a stale note.

import {
  SHIKIGAMI_POOL, TRANSFIGURED_POOL, CURSE_POOL, INVENTORY_POOL,
} from "./config_summons.js";

/** The install aura's painted height (src/render.js, drawInstallAura). */
export const AURA_H = 220;

/** Hazard art, with the height and anchor each draw site uses (stage_fx.js). */
const STAGE_FX = {
  "stagefx:stage_fang": { h: 72, anchor: "centre", what: "a rising fang, and the diving one" },
  "stagefx:stage_flower": { h: 46, anchor: "feet", what: "a bloom on the platform" },
  "stagefx:stage_lantern": { h: 44, anchor: "top", what: "a lantern hung from its cord" },
  "stagefx:stage_weak_curse": { h: 60, anchor: "feet", what: "the curse that wanders the stage" },
};

const POOLS = [SHIKIGAMI_POOL, TRANSFIGURED_POOL, CURSE_POOL, INVENTORY_POOL];

let registry = null;

/** The region of the world this drawing's move actually acts on, if the kit
 *  declares one.
 *
 *  This is the thing art has to agree with and cannot be measured from the
 *  picture: a bolt drawn twice the width of its `r` looks like it should clip
 *  somebody it passes straight through. Every shape here is a number a move
 *  already declares — nothing new is invented, and nothing here changes play.
 */
function hitOfNode(node) {
  if (Number.isFinite(node.r)) {
    return { shape: "circle", r: node.r, from: "r",
             what: "the radius it collides on" };
  }
  if (Number.isFinite(node.width) && Number.isFinite(node.duration)) {
    return { shape: "beam", w: node.width, from: "width",
             what: "how wide the beam hits" };
  }
  if (Number.isFinite(node.w) && Number.isFinite(node.h)) {
    return { shape: "rect", w: node.w, h: node.h, from: "w/h",
             what: "the box it lands in" };
  }
  return null;
}

function buildRegistry() {
  const out = new Map();
  const put = (key, info) => {
    if (!isSharedKey(key) || out.has(key)) return;
    out.set(key, info);
  };
  // A creature's SECOND and later drawings are stand-ins: summons.js draws the
  // first of them that has loaded, so once the creature's own art is delivered
  // the rest are never reached. They are still worth an entry — a drawing with
  // no entry reads as unused — but they must not outrank a usage that really
  // draws, which is what happened while the pools were walked first and first
  // put won. `effect:curse_c` is Geto's volley, and was being described as a
  // Smallpox Deity it has not been drawn as since the Deity got her own set.
  const standIns = [];
  // The pools are reached twice: once here, with the creature's height, hit box
  // and name, and again by the generic kit walk below, which finds the same
  // `sprites` arrays hanging off `p.pool` and knows none of that. Pass 1 wins by
  // having the walk skip the ARRAYS it has already described — not the entries
  // themselves, because a pool entry can also name art the walk is the only
  // route to (the Inventory Curse's cursed tool, nested in its projectile).
  const poolLists = new Set();

  // 1. Creatures: `h` in config_summons.js, standing on the point.
  for (const pool of POOLS) {
    for (const entry of pool || []) {
      const h = entry.h ?? 110;
      const hitOf = (e) => (Number.isFinite(e.hitW) && Number.isFinite(e.hitH)
        ? { shape: "rect", w: e.hitW, h: e.hitH, from: "hitW/hitH", what: "what it can be hit on, and hits with" }
        : null);
      const owner = entry.name || entry.id || "a summon";
      const creature = (keys, height, hit) => (poolLists.add(keys), keys).forEach((key, i) => {
        const info = { h: height, anchor: "feet", owner, hit,
                       what: i === 0
                         ? "the creature's height on stage (config_summons.js)"
                         : `a STAND-IN for ${owner} — only drawn if that creature's own art is missing (config_summons.js)` };
        if (i === 0) put(key, info); else standIns.push([key, info]);
      });
      creature(entry.sprites || [], h, hitOf(entry));
      for (const member of entry.units || entry.members || []) {
        creature(member.sprites || [], member.h ?? h, hitOf(member) || hitOf(entry));
      }
    }
  }

  // 2. Hazards.
  for (const [key, fx] of Object.entries(STAGE_FX)) {
    put(key, { h: fx.h, anchor: fx.anchor, owner: "a stage hazard",
               what: `${fx.what} — its height in stage_fx.js` });
  }

  // 3. Everything a kit names, walked exactly as the scale fold walks it.
  const seen = new Set();
  // WHO draws it decides where it is painted, and that is the special's `type`
  // rather than anything about the key. `summon:nue` is a projectile — Megumi
  // throws the bird — while Yuta's Rika, under the same prefix, is a summon
  // that stands on the stage. Reading the prefix instead got Nue exactly
  // backwards.
  const ANCHOR_BY_TYPE = { summon: "feet", projectile: "centre" };
  const visit = (node, who, drawnBy = "centre") => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (typeof node.type === "string" && ANCHOR_BY_TYPE[node.type]) {
      drawnBy = ANCHOR_BY_TYPE[node.type];
    }
    if (isSharedKey(node.aura)) {
      put(node.aura, { h: AURA_H, anchor: "feet", owner: who,
                       what: "the install aura's height around the fighter (render.js)" });
    }
    const hit = hitOfNode(node);
    for (const [field, heightFields] of SPRITE_FIELDS) {
      if (field === "aura" || !isSharedKey(node[field])) continue;
      const hf = heightFields.find((h) => Number.isFinite(node[`${h}Base`]) || Number.isFinite(node[h]));
      const h = hf ? (node[`${hf}Base`] ?? node[hf]) : null;
      put(node[field], { h, anchor: drawnBy, owner: who, hit,
                         what: h ? "the height its move declares (the kit's own number)"
                                 : "sized by the code that spawns it" });
    }
    for (const [field, heightField] of SPRITE_LIST_FIELDS) {
      if (!Array.isArray(node[field]) || poolLists.has(node[field])) continue;
      const h = node[`${heightField}Base`] ?? node[heightField] ?? null;
      for (const key of node[field]) {
        put(key, { h, anchor: drawnBy, owner: who, hit,
                   what: h ? "the height its move declares (the kit's own number)"
                           : "sized by the code that spawns it" });
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value, who, drawnBy);
    }
  };
  for (const key of CHARACTER_KEYS) {
    const c = CHARACTERS[key];
    visit(c?.specials, c?.name || key);
    visit(c?.ultimate, c?.name || key);
  }
  // Stand-ins last: anything a real usage claimed keeps that usage.
  for (const [key, info] of standIns) put(key, info);

  return out;
}

/**
 * What the game does with this drawing, or null if nothing draws it.
 *
 *   h        the height it is painted at BEFORE the workbench's scale — null
 *            when the spawn site decides per instance
 *   anchor   which part of the drawing lands on the spawn point
 *   owner    who puts it on screen, for the panel to name
 */
export function sharedSpriteInfo(key) {
  if (!key) return null;
  registry ||= buildRegistry();
  if (String(key).startsWith("domain:")) {
    return { h: null, anchor: "screen", owner: "a domain",
             what: "a full-screen backdrop, fitted to the stage — nothing to size or move" };
  }
  // A summon pose inherits its creature's entry, the same way its scale does.
  const parts = String(key).split(":");
  if (parts[0] === "summon" && parts.length === 3) {
    return registry.get(key) || registry.get(`${parts[0]}:${parts[1]}`) || null;
  }
  return registry.get(key) || null;
}

/** Forget the derived registry — the workbench rebuilds kits as it edits. */
export function clearSharedRegistry() { registry = null; }
