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
import { ART_SCALE } from "./config_tuning.js";
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
// The third element, where present, is the field's OWN hit numbers. A node can
// declare two drawings at once — Mechamaru's ultimate names the cannon under
// `sprite` and the five orbs it opens with under `orbSprite` — and the node's
// hit numbers describe only the first of them. Without this the orbs inherited
// the cannon's, and a 64px pigeon was shown against a 170px shot.
const SPRITE_FIELDS = [
  // A list per field, first one present wins: Yuta's side special names Rika
  // under `sprite` but declares her height as plain `h`, so a single partner
  // name would leave that one drawing unscalable.
  ["sprite", ["spriteH", "h"]],
  ["orbSprite", ["orbSpriteH"], { r: "orbR" }],
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

/**
 * The box a CREATURE hits with, as fractions of its own drawing.
 *
 * Its hurt box is the whole sprite — a dog drawn 205 px long is hit anywhere
 * along those 205 px, which is what a hurt box should be. Its ATTACK box is not
 * the same shape and never was: a dog bites with its head, and being brushed by
 * the tail of a passing shikigami should not take 6.5%. Fighters have had the
 * two separate since the beginning; this gives creatures the same split.
 *
 *   x  centre of the box, FORWARD from the middle of the drawing, in fractions
 *      of its width. Positive is the way the creature faces, so it mirrors.
 *   y  centre of the box above the feet, in fractions of the drawing's height.
 *   w  width, as a fraction of the drawing's width.
 *   h  height, as a fraction of the drawing's height.
 *
 * Fractions rather than pixels, so the box travels with the art: rescale the
 * creature in the workbench, or redraw it bigger, and the bite stays on the
 * mouth. Stored per creature in `otherSprites`, beside the size and the nudge,
 * and edited on the canvas.
 */
export function sharedAttack(key) {
  const box = entryOf(key)?.attackBox;
  if (!box) return null;
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  return { x: n(box.x, 0.25), y: n(box.y, 0.5), w: n(box.w, 0.5), h: n(box.h, 0.8) };
}

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
 * WHERE THE SHOT ACTUALLY HITS, relative to where the game puts it.
 *
 * A projectile has had exactly one point since the beginning: its position is
 * both what it collides on and what the picture hangs off, so `dx`/`dy` move
 * the art and the collision circle stays put. For most art that is right — the
 * shot IS the drawing, and moving the picture onto the point is the whole job.
 *
 * It stops being right when the drawing is not a ball. Dagon's tide is a wall
 * of water 130px tall drawn along the floor: the part that should hit is the
 * face of the wave, not the middle of a mostly-empty plate, and no amount of
 * nudging the picture fixes that — nudging it moves the water off the point
 * instead. The collision needs to move to the water.
 *
 *   dx, dy  the centre, offset from THE PICTURE in game px — not from the shot's
 *           own position. `dx` is FORWARD along the way it is travelling, so it
 *           mirrors with the drawing exactly as the drawing does; `dy` is down.
 *
 *           Measured from the picture because of what this is FOR: naming the
 *           part of the drawing that does the damage. That part does not move
 *           when the picture is nudged into place, so the number describing it
 *           should not have to be re-entered every time — which is exactly what
 *           storing it against the spawn point required.
 *
 *           A drawing nobody has placed keeps the circle on the shot's own
 *           position, unchanged. See `placed` below.
 *   scale   a multiplier on whatever the kit declares — `r` for a circle. The
 *           kit still owns the number, because how far a move reaches is
 *           balance; this is the correction for art whose dense part is a
 *           different size from the plate it arrived in.
 *
 * Per drawing rather than per move, like every other adjustment here and for
 * the same reason: it is a fact about the picture. A drawing two moves throw
 * gets one answer, which is the same bargain `renderScale` already makes.
 */
export function sharedHit(key) {
  const e = entryOf(key);
  const h = e?.hit;
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  const scale = h && Number.isFinite(h.scale) && h.scale > 0 ? h.scale : 1;
  // NOT PLACED: the circle stays exactly on the shot's own position, which is
  // where it has always been and where it belongs for most art. A lance is the
  // case that settles it — `dx` slides the long plate so its business end meets
  // the collision point, and a circle that followed the picture's centre would
  // land halfway down the shaft. So an untouched drawing changes nothing.
  if (!h) return { dx: 0, dy: 0, scale: 1, placed: false, ownDx: 0, ownDy: 0 };
  // PLACED: the offset is measured from the PICTURE, and resolved back to the
  // shot's position by adding the picture's own. That is what makes moving the
  // art carry the collision with it — you place the circle on the part of the
  // drawing that should hurt, once, and it stays on that part wherever the
  // drawing goes. Storing it against the spawn point instead meant re-placing
  // it after every nudge, which is what it was doing.
  const ownDx = n(h.dx, 0), ownDy = n(h.dy, 0);
  return {
    dx: n(e.dx, 0) + ownDx,
    dy: n(e.dy, 0) + ownDy,
    scale, placed: true, ownDx, ownDy,
  };
}

/**
 * A QUICK FADE-IN AS THE SHOT LEAVES, in seconds. 0 — the default — is the hard
 * cut every projectile has always had.
 *
 * Energy art is the case that wants it. A lance of blood or a ball of cursed
 * energy has no edge in the fiction: it gathers. Cutting it in at full opacity
 * one frame after the hand opens reads as a decal appearing rather than as
 * something being released, and the fix is a handful of frames of ramp — short
 * enough that it is still a fast attack, long enough that the eye reads a
 * beginning.
 *
 * A property of the DRAWING rather than the move, like everything else here:
 * whether a picture needs easing in is a fact about the picture. A solid object
 * — a vending machine, a nail — wants 0 and gets it.
 */
export function sharedFadeIn(key) {
  const v = entryOf(key)?.fadeIn;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Has anybody moved or resized this drawing's hit region? For the workbench,
 *  which says so, and for the checker. */
export function hasSharedHit(key) {
  const h = entryOf(key)?.hit;
  return !!(h && (Number.isFinite(h.dx) || Number.isFinite(h.dy) || Number.isFinite(h.scale)));
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

/**
 * HOW TALL A SHARED DRAWING IS PAINTED — the one answer, for every caller.
 *
 * A drawing's size is two numbers multiplied: the height its kit (or its
 * handler, or the aura constant, or a stage hazard) declares, and the
 * `renderScale` somebody set on the picture in the workbench. There is nothing
 * subtle about the arithmetic; what went wrong for a year is WHO DOES IT.
 *
 * It used to be folded — `applySharedSpriteScales` multiplied the scale into
 * every kit's `spriteH` once at boot and kept the authored number beside it as
 * `spriteHBase`, so a spawn site read a height with the size already in it and
 * must not multiply again, while the registry un-folded to `spriteHBase` and
 * multiplied itself, and the aura and the stage hazards (whose heights are not
 * kit numbers at all) multiplied at the draw. Three conventions, and the only
 * way to know which one a given line was written under was to know the whole
 * history: the action player read the folded height AND multiplied, so every
 * drawing anybody had resized was previewed at scale-squared.
 *
 * So there is no fold. A kit's height is the authored height, always, and
 * everything that paints a shared drawing asks this:
 *
 *     const h = paintedHeight("effect:batto_flash", p.spriteH || 280);
 *
 * One multiply, at the moment of painting, visible in the line that draws.
 * `node tools/check_shared_heights.mjs` fails on a draw site that multiplies
 * by a scale itself.
 */
export function paintedHeight(key, base) {
  return (Number.isFinite(base) ? base : 0) * (scaleOf(key) ?? 1);
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
import { SPAWN_SHAPES } from "./config_spawn_shapes.js";

/** The install aura's nominal painted height (src/render.js, drawInstallAura). */
export const AURA_H = 220;

/** The aura breathes rather than sitting still, so `AURA_H` is never the height
 *  it is actually painted at: the drawing is `AURA_H * pulse`, and the pulse
 *  swings between 0.82 and 0.94. Lives here with the height because three files
 *  paint this one drawing — the flat renderer, the 2.5D scene, and the
 *  workbench's preview of it — and a breath that differs between them is a
 *  preview that lies about the size by a tenth. */
export const AURA_PULSE = { base: 0.88, amp: 0.06, rate: 8 };

/** The aura stands this many pixels BELOW the fighter's feet, so the glow skirts
 *  the floor they are standing on rather than being cut off by it. */
export const AURA_FOOT_DY = 10 * ART_SCALE;

/** The height a STILL picture of an aura should use — the middle of the breath.
 *  The workbench renders on demand rather than every frame, so it has to pick a
 *  moment, and the mid-point is the only defensible one. */
export const AURA_PREVIEW_H = Math.round(AURA_H * AURA_PULSE.base);

/**
 * A METEOR'S APPROACH — the one place the fall is described.
 *
 * It used to slide down a straight line at a constant screen speed, full size
 * the whole way, which is what a lift does and not what a rock entering the
 * atmosphere does. Nothing about it read as fast, because nothing about it read
 * as FAR: a thing at constant apparent size is a thing that never approached.
 *
 * So the fall is a perspective one. The rock travels toward the camera at a
 * constant rate, `z` running from `far` back to 1, and everything on screen is
 * that one number: apparent size is `1/z`, and the distance travelled from the
 * point it came out of is `1/z` as well. That is not a stylistic curve — it is
 * what a straight-line approach looks like through a lens, and it is why the
 * thing appears to hang as a speck for most of its flight and then cross the
 * whole sky in the last quarter second. The `fallTime` never changed; where the
 * time is SPENT did.
 *
 * `far` is how big it looks at the start as a fraction of its size on arrival —
 * 0.09 means it enters a eleventh of full size, eleven times further away.
 * `fromX` and `fromY` are where it enters, measured back from the impact point,
 * so it comes down and to the right on a shallow entry path the way a body
 * arriving from orbit does, rather than dropping like a weight. Kept inside the
 * shortest stage anyone paints this on — the workbench's 900x420 — so the speck
 * is on screen from the first frame instead of streaking in from the void.
 */
export const METEOR_FALL = { far: 0.09, fromX: 430, fromY: 300 };

/**
 * Where a falling meteor is, and how big, `u` of the way through its fall.
 *
 * Read by the game's director AND by the workbench's preview of it, because a
 * preview whose approach curve is a re-derivation of the game's is a preview
 * that will quietly stop matching. `impactX`/`impactY` are where it lands.
 *
 * Returns `{ x, y, scale }` — `scale` multiplies the drawing's height.
 */
export function meteorAt(p, u, impactX, impactY) {
  const far = p?.far ?? METEOR_FALL.far;
  const t = Math.max(0, Math.min(1, u));
  // z: the distance, in units of "as far as it is at impact". Linear in time,
  // because the rock is not slowing down.
  const z = (1 / far) + (1 - 1 / far) * t;
  const scale = 1 / z;                        // apparent size, `far` .. 1
  const along = (scale - far) / (1 - far);    // 0 at entry, 1 at impact
  return {
    x: impactX - (p?.fromX ?? METEOR_FALL.fromX) * (1 - along),
    y: impactY - (p?.fromY ?? METEOR_FALL.fromY) * (1 - along),
    scale,
  };
}

/** Hazard art, with the height and anchor each draw site uses (stage_fx.js). */
const STAGE_FX = {
  // ONE DRAWING, TWO USES, and the anchor belongs to the one that grows: the
  // fang that comes out of the floor is drawn from the platform line UP
  // (`-h * 2` above `plat.y + 6`, src/stage_fx.js), so its bottom is pinned and
  // it grows out of the ground. The diving fang is centred on its own falling
  // point and rotated to point down. Describing this as "centre" made the
  // workbench swell it about its middle, which is the one thing neither use
  // does — and is what got reported as the game being wrong when the game was
  // right.
  "stagefx:stage_fang": { h: 72, anchor: "feet", what: "a fang that grows out of the floor (the diving one is the same drawing, centred on its fall)" },
  "stagefx:stage_flower": { h: 46, anchor: "feet", what: "a bloom on the platform" },
  "stagefx:stage_lantern": { h: 44, anchor: "top", what: "a lantern hung from its cord" },
  "stagefx:stage_weak_curse": { h: 60, anchor: "feet", what: "the curse that wanders the stage" },
};

const POOLS = [SHIKIGAMI_POOL, TRANSFIGURED_POOL, CURSE_POOL, INVENTORY_POOL];

/** The usual answer: this drawing's spawn site reads sharedAdjust, so a dx/dy
 *  and a tilt set against it are honoured. Spread into an entry rather than
 *  assumed, so a site that did NOT would read as a decision
 *  rather than as a field somebody forgot. */
const NUDGED = { nudge: true };

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
  // A `width` is not a band. Both moves that declare one — Gojo's Purple and
  // Mechamaru's cannon — spawn an ordinary projectile with `r: width / 2`
  // (ultimates.js), so what they actually collide on is a circle that crosses
  // the stage. Drawing it as a screen-wide beam described the fiction rather
  // than the code, and put a 190px band over art that hits on 95px.
  if (Number.isFinite(node.width) && Number.isFinite(node.duration)) {
    return { shape: "circle", r: node.width / 2, from: "width",
             what: "the radius it collides on, half the move's width" };
  }
  if (Number.isFinite(node.w) && Number.isFinite(node.h)) {
    // The AUTHORED height, which is now the only kind there is: the box is a
    // kit fact and does not move when somebody resizes the picture.
    return { shape: "rect", w: node.w, h: node.h, from: "w/h",
             what: "the box it lands in" };
  }
  return null;
}

/** A secondary drawing's own hit numbers, named by its SPRITE_FIELDS entry.
 *  Absent numbers mean no shape rather than the node's: a drawing whose spawn
 *  site invents its collision is one the kit cannot describe, and guessing
 *  there is how the orbs ended up wearing the cannon's. */
function hitOfField(node, spec) {
  if (spec.r && Number.isFinite(node[spec.r])) {
    return { shape: "circle", r: node[spec.r], from: spec.r,
             what: "the radius it collides on" };
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
      // No authored pair means the box is measured off the drawing at spawn
      // (derivedBox, summons.js). There is nothing fixed to draw against then —
      // the box IS the picture — so the workbench says so instead of showing a
      // shape that would only ever trace the art it is already looking at.
      const hitOf = (e) => (Number.isFinite(e.hitW) && Number.isFinite(e.hitH)
        ? { shape: "rect", w: e.hitW, h: e.hitH, from: "hitW/hitH", what: "what it can be hit on, and hits with" }
        : null);
      const measured = !(Number.isFinite(entry.hitW) && Number.isFinite(entry.hitH));
      const owner = entry.name || entry.id || "a summon";
      // WHETHER IT TOUCHES ANYBODY. `tryContact` — the only reader of a
      // creature's attack box — runs for a chaser and a bomber. A SUPPORT
      // creature hovers at its summoner's shoulder and shoots (updateSupport →
      // fireSupport, src/summons.js); it never makes contact, so a box placed
      // on it is stored, drawn in the workbench, and read by nothing. Carried
      // here rather than re-derived because this is the file that already knows
      // what each draw site does with a drawing.
      const bites = (entry.behavior || "chaser") !== "support";
      // AND WHETHER IT EVER TOUCHES THE FLOOR. A support creature holds station
      // behind and above its summoner's shoulder for its whole life
      // (updateSupport, src/summons.js) — the anchor is still its feet, but its
      // feet are in the air. Saying only "painted standing on the point" left
      // the workbench standing the Toad on the ground, which is somewhere the
      // game never puts it, and made its size look wrong against a floor it
      // does not use.
      const hovers = (entry.behavior || "chaser") === "support" && entry.hover
        ? { back: entry.hover.back ?? 70, up: entry.hover.up ?? 150 } : null;
      const creature = (keys, height, hit) => (poolLists.add(keys), keys).forEach((key, i) => {
        const info = { h: height, anchor: "feet", owner, hit, measuredBox: measured, bites, hovers, ...NUDGED,
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
    put(key, { h: fx.h, anchor: fx.anchor, owner: "a stage hazard", ...NUDGED,
               what: `${fx.what} — its height in stage_fx.js` });
  }

  // 3. Everything a kit names, walked exactly as the scale fold walks it.
  const seen = new Set();
  // WHO draws it decides where it is painted, and that is the special's `type`
  // rather than anything about the key. `summon:nue` is a projectile — Megumi
  // throws the bird — while Yuta's Rika, under the same prefix, is a summon
  // that stands on the stage. Reading the prefix instead got Nue exactly
  // backwards.
  //
  // WHAT EACH MOVE TYPE DOES WITH ITS DRAWING now lives in one table, read by
  // this registry and by the workbench's action player alike
  // (src/config_spawn_shapes.js). It used to be three tables here — the draw
  // site, the launch point and the melee box — plus seven more inside the
  // player, and a move type entered in one set and not the other was invisible
  // until somebody noticed a staff pointing the wrong way. `SPAWN_SHAPES` is
  // the single answer; `node tools/check_spawn_shapes.mjs` fails when a type a
  // kit uses is missing from it.
  //
  // The two things this file still decides for itself are how a CREATURE and a
  // STAGE HAZARD are placed, because neither is a move.
  const shapeOf = (type) => SPAWN_SHAPES[type] || null;
  // Which pose the fighter is in while it happens. A special plays the anim for
  // its slot (slotAnim, specials.js); an ultimate plays `ult`.
  const SLOT_ANIM = { neutral: "specialNeutral", side: "specialSide", down: "specialDown",
                      ult: "ult" };
  // `bodyH` is the nearest enclosing creature's own height. A summon declared
  // inline in a special — Dagon's shikigami, Mahoraga, Kurourushi's brood —
  // never passes through the pool walk above, and its size is `h` on the config
  // rather than a `spriteH` on the move, so reading only the kit fields left
  // every one of them "sized by the code that spawns it". It is carried down
  // because a per-unit override names the art while the config above it
  // declares the size, which is the same merge specials.js does at spawn.
  const visit = (node, who, drawnBy = "centre", bodyH = null, nudge = NUDGED, site = null,
                 slot = null, launch = null, melee = null) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (typeof node.type === "string" && shapeOf(node.type)) {
      site = shapeOf(node.type);
      drawnBy = site.anchor;
      const shown = { travels: !!site.travels, mirrored: !!site.travels || !!site.mirrored };
      // Every spawn site reads sharedAdjust, so the nudge is always live.
      // `nudgeSite` survives as provenance — which code paints this, worth
      // naming in the readout — rather than as a reason to hide a control.
      nudge = { nudge: true, ...(site.site ? { nudgeSite: site.site } : {}), ...shown };
      launch = site.launch || null;
      melee = site.melee || null;
    }
    if (Number.isFinite(node.h)) bodyH = node.h;
    // A creature config, wherever it hangs. `behavior` is the field spawnSummon
    // steers by and every creature has one, which makes it a better mark than
    // the special's `type`: Kurourushi's brood is `offspring` on an ULTIMATE, so
    // it never passes a `type: "summon"` node and was being filed as a
    // centre-anchored effect of unknown size.
    // A creature is drawn by summons.js wherever it hangs — including inside a
    // move whose own flash art is painted by hand — so it stands on its feet
    // AND gets its nudge back. Inheriting `nudge: false` from the move above it
    // would have taken the offset control off every creature declared inside a
    // burst.
    if (typeof node.behavior === "string" && Array.isArray(node.sprites)) {
      drawnBy = "feet";
      nudge = { nudge: true, travels: false };
      site = null;
    }
    if (isSharedKey(node.aura)) {
      // The mid-breath height, not `AURA_H`: this number is what a viewer draws
      // the picture at, and the game never draws it at the nominal one.
      // `footDy` travels with it because the aura's feet are not the fighter's
      // — anything previewing this has to stand it on the same line.
      put(node.aura, { h: AURA_PREVIEW_H, footDy: AURA_FOOT_DY, anchor: "feet",
                       owner: who, ...NUDGED, kind: "aura", installColor: node.color || null,
                       what: "the install aura's height around the fighter (render.js)" });
    }
    // A melee move's box belongs to the fighter, so it is described that way
    // rather than as something the drawing sits inside.
    const meleeBox = melee ? melee(node) : null;
    const hit = meleeBox
      ? { shape: "rect", w: meleeBox.w, h: meleeBox.h, from: "w/h", melee: meleeBox,
          what: "the box the SWING lands in — on the fighter, not on this drawing" }
      : hitOfNode(node);
    for (const [field, heightFields, ownHit] of SPRITE_FIELDS) {
      if (field === "aura" || !isSharedKey(node[field])) continue;
      const hf = heightFields.find((h) => Number.isFinite(node[h]));
      const h = hf ? node[hf] : null;
      // A drop declares one `h` and uses it twice — the height it is painted at
      // and the height of the box it lands in (randomDrop, specials.js) — so a
      // size set here moves the box with the art. That is the opposite of every
      // other hit shape, which is a number the art has to be matched TO, and
      // the workbench has to say which of the two it is showing.
      // Only where the box IS the drawing's own height (a drop). A melee box
      // shares the field name and nothing else.
      const followsSize = !!hit && !hit.melee && hit.from === "w/h" && hf === "h";
      // A handler that paints at a height of its own overrides the kit for the
      // one field it paints — `sprite`. Its `aura` and `domainSprite` are drawn
      // somewhere else entirely and keep their own answers.
      const fixed = site && field === "sprite" && Number.isFinite(site.spriteH) ? site : null;
      // A domain's backdrop is not placed on anything. It is cover-fitted to
      // the whole stage behind the fight (drawDomainBackdrop, render.js), so it
      // has no spawn point, no nudge and no size — the fit decides all three,
      // and the only thing the art has to get right is what it looks like at
      // the stage's own 1280x720 shape.
      if (field === "domainSprite") {
        put(node[field], { h: null, anchor: "centre", owner: who, nudge: false, sizable: false,
                           kind: "domain",
                           what: "cover-fitted to the whole stage behind the fight (render.js)" });
        continue;
      }
      put(node[field], { h: fixed ? fixed.spriteH : h, anchor: drawnBy, owner: who, ...nudge,
                         ...(fixed ? { sizable: false } : {}),
                         // Only the field the handler actually launches — a move's
                         // aura hangs on the fighter, not at the muzzle.
                         ...(launch && field === "sprite" && launch(node)
                           ? { launch: { ...launch(node), anim: SLOT_ANIM[slot] || null } } : {}),
                         hit: ownHit ? hitOfField(node, ownHit)
                                     : (followsSize ? { ...hit, followsSize } : hit),
                         what: fixed
                           ? `a height ${fixed.site} fixes at ${fixed.spriteH}px — the kit does not set it and neither can the slider`
                           : h ? "the height its move declares (the kit's own number)"
                               : "sized by the code that spawns it" });
    }
    for (const [field, heightField] of SPRITE_LIST_FIELDS) {
      if (!Array.isArray(node[field]) || poolLists.has(node[field])) continue;
      let h = node[heightField] ?? null;
      let what = h ? "the height its move declares (the kit's own number)"
                   : "sized by the code that spawns it";
      // `sprites` is a creature's still list and nothing else, so a summon that
      // declares no `spriteH` is not unsized — it is drawn at its body height,
      // and at summons.js's own 110 when it does not name one either.
      if (h === null && field === "sprites" && drawnBy === "feet") {
        h = bodyH ?? 110;
        what = "the creature's height on stage (its kit's own `h`)";
      }
      // The LAUNCH belongs to these as much as to a `sprite`, and leaving it off
      // was why Geto's four volley curses had a spawn crosshair floating in the
      // middle of the canvas with nothing to be relative to. They are thrown by
      // the same handler at the same muzzle — `spritePool` only decides WHICH
      // of the four this shot happens to draw — so the point is the move's, not
      // the field's. Guarded on the field having a launch at all, which keeps a
      // creature's `sprites` list (a stand-in stack, not a thrown thing) out.
      const listLaunch = field === "spritePool" && launch && launch(node)
        ? { launch: { ...launch(node), anim: SLOT_ANIM[slot] || null } } : {};
      for (const [i, key] of node[field].entries()) {
        const info = { h, anchor: drawnBy, owner: who, hit, what, ...nudge, ...listLaunch };
        // A CREATURE'S `sprites` IS A STACK, not a set — summons.js draws the
        // first entry that has loaded and never reaches the rest — so entries
        // after the first are stand-ins and must not outrank a use that really
        // draws. The pool pass has always deferred them; a creature declared
        // INLINE in a move (Dagon's shikigami) came through here instead and
        // did not, so `effect:shikigami_fish` was described as a fish standing
        // on the floor when what actually draws it is the Death Swarm, centred
        // and flying. The workbench's usage index already marks that use dead;
        // this is the registry learning the same thing.
        // `spritePool` is not a stack: it is a random pick between four equals.
        if (field === "sprites" && i > 0) {
          standIns.push([key, { ...info,
            what: `a STAND-IN for ${who} — only drawn if that creature's own art is missing` }]);
        } else {
          put(key, info);
        }
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        visit(value, who, drawnBy, bodyH, nudge, site, slot, launch, melee);
      }
    }
  };
  for (const key of CHARACTER_KEYS) {
    const c = CHARACTERS[key];
    // Slot by slot rather than the whole `specials` object at once: which slot a
    // move sits in IS which pose the fighter is in while they throw it, and that
    // is the pose the workbench has to stand beside the drawing.
    for (const [slot, def] of Object.entries(c?.specials || {})) {
      visit(def, c?.name || key, "centre", null, NUDGED, null, slot);
    }
    visit(c?.ultimate, c?.name || key, "centre", null, NUDGED, null, "ult");
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
 *   nudge    whether that spawn site reads sharedAdjust, so a dx/dy and a tilt
 *            reach the screen. False for the two that paint straight from
 *            getImage, with `nudgeSite` naming which.
 *   hit      the region its move acts on, or null where the spawn site invents
 *            one the kit cannot describe. `followsSize` marks the one case
 *            where the box is the art's own height rather than a target for it.
 */
export function sharedSpriteInfo(key) {
  if (!key) return null;
  registry ||= buildRegistry();
  if (String(key).startsWith("domain:")) {
    // A backdrop is cover-fitted, so there is no size to set and no tilt worth
    // one — but it CAN be moved, and the game has always honoured that: a plate
    // wider than the frame has a choice about which part of it shows, and
    // `dAdj.dx/dy` in drawDomainBackdrop (src/render.js) is that choice. Saying
    // "nothing to move" here took the one live control away from the nine
    // biggest drawings in the game.
    return { h: null, anchor: "screen", owner: "a domain", pan: true,
             what: "a full-screen backdrop, fitted to the stage — no size to set,"
                   + " but it can be panned to choose which part of the plate shows" };
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
