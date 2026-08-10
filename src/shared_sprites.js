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
  return {
    scale,
    dx: Number.isFinite(e?.dx) ? e.dx : 0,
    dy: Number.isFinite(e?.dy) ? e.dy : 0,
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
