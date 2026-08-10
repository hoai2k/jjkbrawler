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

/** Field names that hold a shared-sprite key, for callers that only need those. */
export const SPRITE_KEY_FIELDS = SPRITE_FIELDS.map(([f]) => f);

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
    // `sprites: []` — a summon naming several drawings, the first preferred.
    if (Array.isArray(node.sprites) && Number.isFinite(node.spriteH)) {
      if (!Number.isFinite(node.spriteHBase)) node.spriteHBase = node.spriteH;
      const scale = node.sprites.filter(isSharedKey).map(scaleOf).find((s) => s !== null);
      node.spriteH = scale ? node.spriteHBase * scale : node.spriteHBase;
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

function buildRegistry() {
  const out = new Map();
  const put = (key, info) => {
    if (!isSharedKey(key) || out.has(key)) return;
    // A creature is a creature wherever its numbers came from. Megumi declares
    // Nue's height inside the special rather than in a pool, and Yuta declares
    // Rika's as a plain `h` — but both are put on the stage by summons.js,
    // which stands them ON the point rather than around it.
    if (String(key).startsWith("summon:")) info = { ...info, anchor: "feet" };
    out.set(key, info);
  };

  // 1. Creatures: `h` in config_summons.js, standing on the point.
  for (const pool of POOLS) {
    for (const entry of pool || []) {
      const h = entry.h ?? 110;
      for (const key of entry.sprites || []) {
        put(key, { h, anchor: "feet", owner: entry.name || entry.id || "a summon",
                   what: "the creature's height on stage (config_summons.js)" });
      }
      for (const member of entry.members || []) {
        for (const key of member.sprites || []) {
          put(key, { h: member.h ?? h, anchor: "feet", owner: entry.name || entry.id || "a summon",
                     what: "the creature's height on stage (config_summons.js)" });
        }
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
  const visit = (node, who) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (isSharedKey(node.aura)) {
      put(node.aura, { h: AURA_H, anchor: "feet", owner: who,
                       what: "the install aura's height around the fighter (render.js)" });
    }
    for (const [field, heightFields] of SPRITE_FIELDS) {
      if (field === "aura" || !isSharedKey(node[field])) continue;
      const hf = heightFields.find((h) => Number.isFinite(node[`${h}Base`]) || Number.isFinite(node[h]));
      const h = hf ? (node[`${hf}Base`] ?? node[hf]) : null;
      put(node[field], { h, anchor: "centre", owner: who,
                         what: h ? "the height its move declares (the kit's own number)"
                                 : "sized by the code that spawns it" });
    }
    if (Array.isArray(node.sprites)) {
      const h = node.spriteHBase ?? node.spriteH ?? null;
      for (const key of node.sprites) {
        put(key, { h, anchor: "centre", owner: who,
                   what: h ? "the height its move declares (the kit's own number)"
                           : "sized by the code that spawns it" });
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value, who);
    }
  };
  for (const key of CHARACTER_KEYS) {
    const c = CHARACTERS[key];
    visit(c?.specials, c?.name || key);
    visit(c?.ultimate, c?.name || key);
  }
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
