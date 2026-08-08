import { frameMeta, frameImage, spriteManifest } from "./assets.js";
import { animFor, CHARACTERS, DEFAULT_ANIMS } from "./characters.js";
import { CELL_W, CELL_H, CELL_FOOT_Y } from "./constants.js";
import { COM_BODY_FRAC, LEDGE_GRIP_Y_FRAC } from "./config_tuning.js";
import { clamp } from "./utils.js";

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- anchors
//
// A frame carries named anchor points in `meta.anchors`, stored as
// `[x, y]` in the SOURCE IMAGE's own pixels, measured from its top-left
// corner. Image-local coordinates are the whole point: `ox` (horizontal
// placement), `bodyBottom` (ground contact) and `renderScale` (size) all move
// or resize the art, and an anchor expressed this way rides along with it. Put
// one on a character's navel and it stays on the navel no matter how the frame
// is later nudged or rescaled.
//
// `com` — the centre of mass — is the pivot every rotation turns about, so
// every frame has one. Anything else is opt-in per state.

/** Extra anchors beyond `com`, and the animation states that need them. The
 *  workbench builds its editor from this, so supporting a new one is an entry
 *  here plus the renderer call that reads it. */
export const EXTRA_ANCHORS = {
  ledge: {
    label: "Ledge grip",
    states: ["ledge"],
    hint: "The hand that holds the edge. The sprite is hung so this point " +
          "lands on the platform corner. Starts at the top of the art, which " +
          "on a hang pose is the raised hand.",
    // Where an unset anchor starts, as a fraction down the artwork. Landing on
    // the centre of mass would bury it under the `com` handle and be a worse
    // first guess than "the highest thing in the frame".
    defaultYFrac: LEDGE_GRIP_Y_FRAC,
  },
};

// What is wrong with a sprite's ART, as opposed to its placement. The sprite
// workbench writes one of these keys as `needsReplacement`; the flag is a
// request, and clearing it happens when new art is imported. A legacy `true`
// means "replace", which is what the flag meant before it carried a reason.
//
// tools/list_replacements.py parses this list, so it is the single source of
// truth for the set — add a kind here and the tooling follows.
export const REPLACEMENT_KINDS = [
  ["replace", "Replace — redraw the sprite from scratch"],
  ["crop", "Fix crop — the framing or bounds are wrong"],
  ["alpha", "Fix alpha — transparency is wrong or has hard edges"],
  ["bleed", "Fix bleed — colour bleeds past the silhouette"],
  // Only offered on a pose with more than one drawing (VARIANT_ONLY_KINDS
  // below): the ask is not "fix this art" but "we have something better, throw
  // this one away". Deleting the only drawing a pose has would leave a hole.
  ["delete", "Delete variant — discard this drawing at the next cleanup"],
];

/** Kinds that only make sense when a pose has an alternative to fall back on. */
export const VARIANT_ONLY_KINDS = new Set(["delete"]);

// How much of the existing placement survives a redraw, which decides what the
// intake has to do when the new art lands. Read by tools/list_replacements.py
// and by the asset-request write-up, so the rule lives here rather than in
// prose someone has to remember:
//
//   keep    the frame comes back at the same size and framing, so every
//           measurement and anchor is still valid — reuse them as they are.
//   reframe the silhouette keeps its shape but the bounds move, so the
//           measurements have to be re-derived and the anchors shifted by the
//           change in framing (tools/intake_import.py --carry-placement).
//   discard a different drawing entirely; nothing about the old placement
//           means anything, so it is re-measured from scratch.
export const REPLACEMENT_PLACEMENT = {
  replace: "discard",
  crop: "reframe",
  bleed: "reframe",
  alpha: "keep",
  // A deletion has no incoming art, so there is no placement to decide. The
  // entry exists so the value is never silently treated as "discard".
  delete: "none",
};

// A softer ask than a replacement: the art works, but it could be better. These
// are collected at a LOWER priority than `needsReplacement` — nothing is broken,
// so nothing is blocked. Stored as `wantsImprovement`.
export const IMPROVEMENT_KINDS = [
  ["quality", "Quality — the drawing is rough or off-model in execution"],
  ["pose", "Pose — reads poorly, or is not the action it stands for"],
  ["character", "Character — likeness or costume is off"],
];

/** The kind a frame is flagged with, or null. Normalises the legacy boolean. */
export function replacementKind(meta) {
  const flag = meta?.needsReplacement;
  if (!flag) return null;
  if (flag === true) return "replace";
  return REPLACEMENT_KINDS.some(([k]) => k === flag) ? flag : "replace";
}

/** What survives a replacement of this kind: "keep", "reframe" or "discard". */
export function replacementPlacement(meta) {
  const kind = replacementKind(meta);
  return kind ? REPLACEMENT_PLACEMENT[kind] ?? "discard" : null;
}

/** The improvement a frame asks for, or null. Same shape as replacementKind. */
export function improvementKind(meta) {
  const flag = meta?.wantsImprovement;
  if (!flag) return null;
  if (flag === true) return "quality";
  return IMPROVEMENT_KINDS.some(([k]) => k === flag) ? flag : "quality";
}

/** States a frame can appear in that never touch the floor. Frames used ONLY
 *  by these have no meaningful ground contact to set. */
export const AIRBORNE_STATES = ["jump", "fall", "ledge", "dodge_air", "airLight"];

// ------------------------------------------------------------------ variants
//
// A pose can have more than one drawing to choose from — a redraw that may or
// may not be better than what shipped, an alternate costume, a wind-up that
// turned out to read as a strike. `manifest.variants[char][pose]` lists them:
//
//   "variants": { "hanami": { "dodge_roll": {
//       "options": [
//         { "file": "hanami/dodge_roll.png",     "label": "Round 5" },
//         { "file": "hanami/alt/dodge_roll.png", "label": "Round 6 redesign" }
//       ] } } }
//
// EVERY WORKBENCH JUDGEMENT BELONGS TO THE IMAGE, NOT THE POSE. Each option
// carries its own renderScale / ox / bodyBottom / anchors, because two drawings
// of the same action are framed differently and a shared number would be wrong
// for one of them — and its own review flags, because "fix alpha" is something
// you say about a drawing. Switching variants therefore restores that image's
// own numbers and verdicts rather than re-applying the previous one's.
//
// What stays on the POSE is the pose's identity and what draws it: which file
// is selected, and which animation states resolve to this key. What stays on
// the CHARACTER is anything solved across the whole set — `headHeights`,
// `heightSpans`, `nativeLeft`. See VARIANT_BANKED below for the exact line.
//
// The SELECTED option's meta is mirrored into `characters[char][pose]`, which
// is the only thing the game reads. That keeps the runtime exactly as it was —
// variants are an authoring concept, resolved before the game ever loads.

/** Every drawing available for a pose, selected one first-class. Always at
 *  least one entry (the pose's own art) so callers need no special case. */
export function variantsOf(charKey, frameKey) {
  const meta = frameMeta(charKey, frameKey);
  if (!meta) return [];
  const listed = spriteManifest?.variants?.[charKey]?.[frameKey]?.options;
  if (!listed?.length) return [{ ...meta, label: "Delivered", current: true }];
  return listed.map((opt) => ({
    ...opt,
    current: opt.file === meta.file,
  }));
}

/** True when a pose has a real choice to offer — used to decide whether the
 *  workbench draws its chevron at all. */
export function hasVariants(charKey, frameKey) {
  return variantsOf(charKey, frameKey).length > 1;
}

/** The placement fields that travel with an image rather than with the pose. */
export const VARIANT_PLACEMENT = [
  "w", "h", "ox", "oy", "bodyBottom", "bodyH", "bodyTop",
  "centroidX", "renderScale", "rotationDeg", "anchors", "faceLeft",
];

/** The review fields, which travel with the image for the same reason.
 *
 *  "Fix alpha" is a statement about a DRAWING — this file has an unkeyed patch
 *  of background in it — and it stays true whether or not the pose currently
 *  points at that file. Leaving these on the pose would move a verdict onto art
 *  it was never passed on: flag drawing A, switch to B, and B wears A's flag
 *  while A quietly loses it. `edited` banks the values a drawing held before it
 *  was hand-tuned, so it is image-specific for the same reason its numbers are.
 *
 *  Kept separate from VARIANT_PLACEMENT because the two are cleared at
 *  different moments — intake drops the review fields when new art lands, and
 *  re-measures the placement ones. */
export const VARIANT_REVIEW = ["needsReplacement", "wantsImprovement", "edited"];

/** Everything banked onto the option a pose is leaving, and restored from the
 *  one it arrives at. */
export const VARIANT_BANKED = [...VARIANT_PLACEMENT, ...VARIANT_REVIEW];

// Fallback centre of mass, derived from the extraction data the manifest
// already carries. Cached per frame on FIRST use — before the workbench can
// mutate `ox` / `bodyBottom` — so an edit to those fields slides the art and
// the default pivot together rather than leaving the pivot behind.
const comCache = new Map();

function defaultCom(charKey, frameKey, meta) {
  // Keyed by art file so a character's alternate set gets its own default
  // rather than inheriting whichever set happened to draw first.
  const id = meta.file || `${charKey}/${frameKey}`;
  const hit = comCache.get(id);
  if (hit) return hit;
  // Everything here must stay in IMAGE pixels. `ox`, `oy`, `bodyBottom` and
  // `centroidX` are; `bodyH` is NOT — it is a rendered height, used for the
  // head-height comparison — so it cannot be mixed in. The art fills very
  // nearly the full image on these sheets, which makes the foot line a good
  // stand-in for the body's height above the top of the frame.
  const footLocal = (meta.bodyBottom ?? CELL_H * CELL_FOOT_Y) - (meta.oy ?? 0);
  const com = [
    (meta.centroidX ?? CELL_W / 2) - (meta.ox ?? 0),
    footLocal * (1 - COM_BODY_FRAC),
  ];
  comCache.set(id, com);
  return com;
}

/** A named anchor in CELL coordinates — the space `ox`/`oy`/`bodyBottom` live
 *  in — or null if the frame does not define one. `com` always resolves. */
export function anchorPoint(charKey, frameKey, name = "com", meta = null) {
  const m = meta || frameMeta(charKey, frameKey);
  if (!m) return null;
  const local = m.anchors?.[name] || defaultAnchor(charKey, frameKey, name, m);
  if (!local) return null;
  return { x: (m.ox ?? 0) + local[0], y: (m.oy ?? 0) + local[1] };
}

/** The same point as image-local pixels, which is what the workbench edits. */
export function anchorLocal(charKey, frameKey, name = "com", meta = null) {
  const m = meta || frameMeta(charKey, frameKey);
  if (!m) return null;
  const explicit = m.anchors?.[name];
  if (explicit) return [...explicit];
  const fallback = defaultAnchor(charKey, frameKey, name, m);
  return fallback ? [...fallback] : null;
}

/** Where an anchor sits before anyone has placed it. */
function defaultAnchor(charKey, frameKey, name, meta) {
  const com = defaultCom(charKey, frameKey, meta);
  if (name === "com") return com;
  const cfg = EXTRA_ANCHORS[name];
  if (!cfg) return null;
  return [com[0], cfg.defaultYFrac !== undefined ? meta.h * cfg.defaultYFrac : com[1]];
}

/** Resolve every default centre of mass now, while the manifest still holds
 *  its shipped values. The workbench edits `ox` / `bodyBottom` / `renderScale`
 *  in place; without this the default pivot for an untouched frame would be
 *  derived from the edited numbers the first time it happened to be needed,
 *  and would sit somewhere different than it does in the game. */
export function warmAnchors(charKeys) {
  for (const charKey of charKeys) {
    for (const frameKey of Object.keys(spriteManifest?.characters?.[charKey] || {})) {
      anchorPoint(charKey, frameKey, "com");
    }
  }
}

/** The foot line in cell coordinates. The workbench places its overlays with
 *  this too, so both agree on where the floor is.
 *
 *  A `bodyBottom` written into the manifest is a decision somebody made while
 *  looking at the sprite, and it is honoured as given. Only the FALLBACK is
 *  clamped — that is a guess at 92% of cell height for a frame nobody has
 *  measured, and the bounds are there to keep a guess from putting a sprite
 *  somewhere absurd.
 *
 *  It used to clamp both, which quietly capped how far a pose could be moved:
 *  Mahoraga's art is 1,612 px tall against a 313.6 px cell, so his foot line
 *  needs to sit well past the old ceiling of 1.2 cells, and the workbench's
 *  slider went dead partway along with nothing on screen saying why. */
export function frameFootY(meta) {
  const set = meta.bodyBottom;
  if (Number.isFinite(set)) return set;
  return clamp(CELL_H * CELL_FOOT_Y, CELL_H * 0.45, CELL_H * 1.2);
}

/** Animation states that draw this frame, across the character's own overrides
 *  and the shared defaults. Empty means the game never draws it. */
/** A character's animation table with any workbench reassignments applied.
 *
 *  The 17 original fighters came from sprite SHEETS, so one cell often serves
 *  several states — Maki's `r1c2` is her dash, her dodge, her jab and her
 *  neutral special at once. `animOverrides` in the manifest lets a state be
 *  re-pointed at a different sprite without touching characters.js, which is
 *  what the workbench's secondary-action editor writes. */
export function animsOf(charKey) {
  const base = { ...DEFAULT_ANIMS, ...(CHARACTERS[charKey]?.anims || {}) };
  const overrides = spriteManifest?.animOverrides?.[charKey];
  if (!overrides) return base;
  const out = { ...base };
  for (const [state, frames] of Object.entries(overrides)) {
    if (!Array.isArray(frames) || !frames.length) continue;
    out[state] = { ...(base[state] || DEFAULT_ANIMS.idle), frames };
  }
  return out;
}

// An animation may name art that has not been delivered yet — the two-frame
// wind-up/strike attacks are declared for the whole roster and land character by
// character. Naming a missing frame draws NOTHING for that half of the move, so
// the frames are filtered down to what exists:
//
//   some present  play those, in order — a half-delivered pair still animates
//   none present  fall back to `fallback`, the single pose that shipped
//   no fallback   keep the declared list, so a real gap stays visible
const presentCache = new Map();

export function clearAnimFrameCache() {
  presentCache.clear();
}

function presentFrames(charKey, anim) {
  const id = `${charKey}|${anim.frames.join(",")}`;
  const hit = presentCache.get(id);
  if (hit) return hit;
  const has = (key) => !!frameMeta(charKey, key);
  let frames = anim.frames.filter(has);
  if (!frames.length && anim.fallback) frames = anim.fallback.filter(has);
  const out = frames.length ? { ...anim, frames } : anim;
  presentCache.set(id, out);
  return out;
}

/** The frames a state draws right now, override included. */
export function resolvedAnim(charKey, animKey) {
  return presentFrames(charKey, animsOf(charKey)[animKey] || animFor(charKey, animKey));
}

export function statesUsingFrame(charKey, frameKey) {
  const anims = animsOf(charKey);
  // Against what the state RESOLVES to, not what it declares. A state whose
  // round-9 pair has not been drawn yet plays its `fallback`, and asking the
  // declared list instead would call the pose the game is actually drawing
  // unused — which hid it from the workbench's in-game views, left it out of
  // the pivot and airborne answers below, and so kept it from ever being
  // sized. Every fighter still on a single `attack_heavy` was in that hole.
  const states = Object.entries(anims)
    .filter(([, a]) => presentFrames(charKey, a).frames.includes(frameKey))
    .map(([name]) => name);
  // Drawn directly by render.js for the respawn platform, so it is in use even
  // though no animation names it.
  if (frameKey === "r0c0") states.push("respawn");
  return states;
}

/** True when every state that draws this frame happens off the ground, so it
 *  has no floor contact to set. */
export function isAirborneOnly(charKey, frameKey) {
  const states = statesUsingFrame(charKey, frameKey);
  return states.length > 0 && states.every((s) => AIRBORNE_STATES.includes(s));
}

/** Where an anchor lands on screen, given the same placement arguments
 *  `drawCharFrame` was called with. Shared so the workbench overlays sit
 *  exactly on the pivot the renderer uses — including for the frames the
 *  manifest marks `faceLeft`, whose mirroring flips the horizontal offset. */
export function anchorScreenPos(charKey, frameKey, x, y, opts = {}) {
  const meta = frameMeta(charKey, frameKey);
  if (!meta) return null;
  const a = anchorPoint(charKey, frameKey, opts.name || "com", meta);
  if (!a) return null;
  const scale = (opts.scale ?? 0.6) * (meta.renderScale || 1);
  const facing = (opts.facing ?? 1) * (meta.faceLeft ? -1 : 1);
  return {
    x: x + (a.x - CELL_W / 2) * scale * facing,
    y: y + (a.y - frameFootY(meta)) * scale,
  };
}

/** The inverse: a screen point back to image-local pixels, for dragging. */
export function screenPosToLocal(charKey, frameKey, px, py, x, y, opts = {}) {
  const meta = frameMeta(charKey, frameKey);
  if (!meta) return null;
  const scale = (opts.scale ?? 0.6) * (meta.renderScale || 1);
  const facing = (opts.facing ?? 1) * (meta.faceLeft ? -1 : 1);
  return [
    (px - x) / (scale * facing) + CELL_W / 2 - (meta.ox ?? 0),
    (py - y) / scale + frameFootY(meta) - (meta.oy ?? 0),
  ];
}

/** Extra anchors this particular frame should carry, by name. */
export function anchorsForFrame(charKey, frameKey) {
  const states = statesUsingFrame(charKey, frameKey);
  return Object.entries(EXTRA_ANCHORS)
    .filter(([, cfg]) => cfg.states.some((s) => states.includes(s)))
    .map(([name]) => name);
}

// ------------------------------------------------------------------- draw

// Draws a fighter frame with its feet anchored at (x, y). Frames are placed
// using their manifest offsets relative to the logical sheet cell, with the
// detected body-bottom as the foot line so ground animations don't bob.
//
// Optional transforms, all draw-time only:
//   rotation  radians, turned about the frame's centre of mass, on top of the
//             pose's own baked `rotationDeg`
//   scaleX/Y  squash & stretch, anchored at the foot line
//   offsetX/Y world-space nudge
//   anchorTo  { name, x, y } — place a named anchor at a world point instead
//             of standing the frame's feet at (x, y). Uses the derived position
//             when the anchor has not been placed by hand, so a frame gets
//             sensible behaviour before anyone has visited it in the workbench.
export function drawCharFrame(ctx, charKey, frameKey, x, y, opts = {}) {
  const meta = frameMeta(charKey, frameKey);
  const img = frameImage(charKey, frameKey);
  if (!meta || !img) return;

  // renderScale corrects frames whose art is drawn at a different zoom than
  // the character's standing sprites (see tools/extract_sprites.py)
  const scale = (opts.scale ?? 0.6) * (meta.renderScale || 1);
  // The sheets are drawn facing RIGHT (verified across every character's run
  // row); only the frames the manifest marks `faceLeft` are drawn facing left.
  // Mirror so the fighter always looks in their logical direction. A fractional
  // value is legal and is how a turn sweeps through side-on.
  const facing = (opts.facing ?? 1) * (meta.faceLeft ? -1 : 1);
  const anchorY = frameFootY(meta);

  // Local -> world helper for a cell-space point, given the current mirroring.
  const worldX = (cellX) => (cellX - CELL_W / 2) * scale * facing;
  const worldY = (cellY) => (cellY - anchorY) * scale;

  let offX = opts.offsetX || 0;
  let offY = opts.offsetY || 0;
  if (opts.anchorTo) {
    const a = anchorPoint(charKey, frameKey, opts.anchorTo.name, meta);
    if (a) {
      offX += opts.anchorTo.x - (x + worldX(a.x));
      offY += opts.anchorTo.y - (y + worldY(a.y));
    }
  }

  // `rotationDeg` is the pose's OWN tilt, baked in the workbench: art drawn a
  // few degrees off square, corrected once here rather than in every caller.
  // It mirrors with the drawing (× facing) — a figure leaning into its right
  // leans into its left once flipped — where `opts.rotation` is already in
  // world space, because motion.js decides per effect whether a lean should
  // mirror and multiplies by facing itself.
  const rotation = (opts.rotation || 0) + (meta.rotationDeg || 0) * DEG * facing;
  const sx = opts.scaleX ?? 1;
  const sy = opts.scaleY ?? 1;
  const needsPivot = rotation !== 0 || sx !== 1 || sy !== 1;

  ctx.save();
  ctx.translate(x + offX, y + offY);

  if (needsPivot) {
    const com = anchorPoint(charKey, frameKey, "com", meta);
    const px = worldX(com.x);
    const py = worldY(com.y);
    // Squash & stretch keeps the feet planted (y = 0) and only uses the centre
    // of mass to decide what to widen about; rotation turns about the point
    // itself. Landing on a squashing sprite whose feet slid would read as a
    // bug, and a body that rotates about its ankles reads as a falling tree.
    if (sx !== 1 || sy !== 1) {
      ctx.translate(px, 0);
      ctx.scale(sx, sy);
      ctx.translate(-px, 0);
    }
    if (rotation !== 0) {
      ctx.translate(px, py);
      ctx.rotate(rotation);
      ctx.translate(-px, -py);
    }
  }

  ctx.scale(facing, 1);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = opts.glowBlur ?? 14;
  }
  ctx.drawImage(
    img,
    (meta.ox - CELL_W / 2) * scale,
    (meta.oy - anchorY) * scale,
    meta.w * scale,
    meta.h * scale
  );
  ctx.restore();
}

export function currentFrame(charKey, animKey, animTime) {
  const anim = resolvedAnim(charKey, animKey);
  const idx = Math.floor(animTime * anim.fps);
  const i = anim.loop ? idx % anim.frames.length : Math.min(idx, anim.frames.length - 1);
  return anim.frames[i];
}

/** Where the playhead sits inside the current frame, 0..1. Lets procedural
 *  motion ride a 2-frame cycle instead of hard-cutting with it. */
export function framePhase(charKey, animKey, animTime) {
  const anim = animFor(charKey, animKey);
  const t = animTime * anim.fps;
  return t - Math.floor(t);
}
