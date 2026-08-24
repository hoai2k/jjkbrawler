// WHERE THE BLOW LANDS, PLACED ON THE DRAWING IT LANDS IN.
//
// A strike point is the one measurement in this repository that nothing can
// derive: it is a person saying "the fist is HERE on this picture". Everything
// downstream is built on it — how far the move reaches (src/silhouette.js
// moveReach), how big a margin of forgiveness it gets (src/moves.js), where the
// strike arc is drawn, and whether the fighter's scalar reach is measured from
// their art at all. src/strike_points.js falls back to the rig, and then to a
// fraction of the fighter's own reach, precisely because the human answer is
// often missing.
//
// WHY THIS LIVES IN THE SPRITE BENCH, AND WHY IT ALSO LIVES IN THE OTHER ONE.
// The same reason the hurtbox fit does, and the comment at the top of
// bench_hurtbox_fit.js is the argument in full: the judgement is about a
// PICTURE, and this is the bench with the picture in it. The verification bench
// asks the roster the question in a queue — 204 items, one at a time, which is
// how a sweep gets finished; here it is answered on the pose you are already
// looking at, at the moment you notice the jab is drawn short. Neither replaces
// the other, and because both export the same document into the same merge
// tool, a sitting in one cannot revert a sitting in the other.
//
// NOT IN THE MANIFEST, so not in the ordinary export. A strike point lives in
// src/config_strike_points.js, keyed by the DRAWING rather than by the state,
// so it survives a pose being re-pointed at a different action. It leaves this
// bench as its own small file in the shape the verification bench exports,
// which `tools/apply_verification.mjs` already merges key by key.
//
// STORED IN IMAGE PIXELS, CONVERTED AT THE EDGES. The config is in the
// drawing's own pixels — that is what makes a point survive the frame being
// nudged, resized or re-grounded — so that is what this module holds. The
// canvas conversion below mirrors `drawCharFrame`'s placement exactly (the same
// arithmetic `anchorScreenPos` uses, on a raw point instead of a named anchor),
// and the export converts to game px through `imageToGame`, which is the same
// function the verification bench places its points with. Both benches
// therefore agree about what a point MEANS, and the round trip through
// `gameToImage` in the apply tool is lossless.

import { frameMeta } from "../../src/assets.js";
import { frameFootY, renderScaleOf } from "../src/sprites.js";
import { CELL_W } from "../../src/constants.js";
import { STRIKE_POINTS } from "../../src/config_strike_points.js";
import {
  STRIKE_STATES, ALIAS, contactFrame, imageToGame, gameToImage, reachGuard,
} from "../../src/strike_reach.js";
import { strikePoint } from "../../src/strike_points.js";

/** This session's edits, `char/frame` -> { x, y } in image px. Empty until
 *  somebody drags something: absent means "whatever the config says", which is
 *  what keeps an untouched drawing out of the export entirely. */
const edits = new Map();

const idOf = (charKey, frameKey) => `${charKey}/${frameKey}`;

/** The states this DRAWING is the contact frame for.
 *
 *  A drawing can serve more than one — the sheet fighters share cells, so one
 *  picture is often both the jab's contact beat and the dash attack's — and
 *  that is exactly why the config is keyed by frame: ONE point answers for all
 *  of them. The list is what the panel names and what the export files as the
 *  decision's `state`, and it is empty for every pose that is not a strike,
 *  which is what hides the whole control.
 *
 *  Aliases are skipped: `dashAttack` resolves to the same drawing and the same
 *  point as `light`, and listing both would say a thing twice. */
export function strikeStatesForFrame(charKey, frameKey) {
  if (!charKey || !frameKey) return [];
  return [...STRIKE_STATES]
    .filter((s) => !ALIAS[s])
    .filter((s) => contactFrame(charKey, s) === frameKey);
}

/** The point as the repository has it, in image px — what Reset goes back to,
 *  and what a drag is compared against to decide whether anything changed.
 *
 *  Null when nobody has placed one. The caller wants that distinction: an
 *  unplaced point is shown at the derived guess, and the panel says so rather
 *  than presenting a fallback as somebody's decision. */
export function committedPoint(charKey, frameKey) {
  const stored = STRIKE_POINTS[charKey]?.[frameKey];
  return stored ? { x: stored.x, y: stored.y } : null;
}

/**
 * Where the handle sits, in image px: this session's edit, else the committed
 * point, else the best guess `strikePoint` can make for one of the states this
 * drawing serves (the rig's baked contact, or a fraction of the fighter's reach
 * at the height their mass sits).
 *
 * The guess is converted back through `gameToImage` rather than invented here,
 * so the handle opens exactly where the game currently thinks the blow lands.
 * Dragging it is then a correction to a visible claim rather than placement
 * from nothing, which is the difference between a bench you can sweep and one
 * where every pose starts at the corner of the image.
 */
export function pointOf(charKey, frameKey) {
  const held = edits.get(idOf(charKey, frameKey));
  if (held) return held;
  const stored = committedPoint(charKey, frameKey);
  if (stored) return stored;
  const state = strikeStatesForFrame(charKey, frameKey)[0];
  if (!state) return null;
  const guess = strikePoint(charKey, state);
  const img = gameToImage(charKey, frameKey, guess.x, guess.y);
  return img ? { x: Math.round(img.x * 10) / 10, y: Math.round(img.y * 10) / 10 } : null;
}

/** Which of the three answers the handle is currently showing. The panel says
 *  it out loud, because "nobody has looked at this" and "somebody decided this"
 *  are the two states a sweep is trying to tell apart. */
export function pointSource(charKey, frameKey) {
  if (edits.has(idOf(charKey, frameKey))) return "edited";
  if (committedPoint(charKey, frameKey)) return "committed";
  const state = strikeStatesForFrame(charKey, frameKey)[0];
  return state ? strikePoint(charKey, state).source : "derived";
}

/** True when the committed point was placed on a drawing that has since been
 *  replaced. The decision still applies — an answer about a slightly different
 *  picture beats no answer — but this is the moment somebody is looking at the
 *  picture, so it is worth saying. */
export function pointStale(charKey, frameKey) {
  const stored = STRIKE_POINTS[charKey]?.[frameKey];
  const file = frameMeta(charKey, frameKey)?.file;
  return !!(stored?.file && file && stored.file !== file);
}

const same = (a, b) => a && b && Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05;

export const pointEdited = (charKey, frameKey) =>
  edits.has(idOf(charKey, frameKey));

/**
 * Set one point, in image px.
 *
 * CLAMPED TO THE DRAWING, because the question is "where on this picture does
 * the blow land" and there is no answer off the edge of it. A pointer that runs
 * past the artwork mid-drag would otherwise file a point in a space the image
 * does not occupy — which converts to a plausible-looking game coordinate, so
 * nothing downstream can tell it from a real one until somebody notices a jab
 * reaching into the next postcode. `tools/apply_verification.mjs` refuses an
 * off-the-drawing point for the same reason; clamping here means that guard
 * only ever fires for the case it is really for, an export placed against a
 * drawing that has since been replaced.
 *
 * An edit that lands back on the committed value is DROPPED rather than stored
 * as agreement — the export carries what somebody changed, and a value
 * identical to the one in the file is not a change. A drawing with NO committed
 * point has no such value to land on, so every placement on it is a change.
 */
export function setPoint(charKey, frameKey, x, y) {
  const meta = frameMeta(charKey, frameKey, { preview: true });
  if (!meta) return;
  const at = (v, hi) => Math.min(hi, Math.max(0, v));
  const next = { x: Math.round(at(x, meta.w) * 10) / 10, y: Math.round(at(y, meta.h) * 10) / 10 };
  if (same(next, committedPoint(charKey, frameKey))) edits.delete(idOf(charKey, frameKey));
  else edits.set(idOf(charKey, frameKey), next);
}

export function resetPoint(charKey, frameKey) {
  edits.delete(idOf(charKey, frameKey));
}

/** How many points this session has moved, for the panel and for the "you have
 *  work that has not left the bench" warning. */
export const pointEditCount = () => edits.size;

// ------------------------------------------------------- canvas <-> image px
//
// `drawCharFrame` places a frame's image at `(ox - CELL_W/2, oy - footY)`
// scaled about the fighter's origin, so a pixel inside it lands at that corner
// plus its own offset. These two are that sentence and its inverse, and they
// take a raw point where `anchorScreenPos` takes a name.
//
// `preview: true` throughout, matching the canvas: a replacement waiting for
// approval is drawn from its OWN placement while the game still reads the old
// one, and a handle converted against the live meta would sit where the retired
// drawing puts it and write into a space the picture is not in.

export function pointToCanvas(charKey, frameKey, point, originX, originY, scale) {
  const meta = frameMeta(charKey, frameKey, { preview: true });
  if (!meta || !point) return null;
  const s = scale * renderScaleOf(meta);
  const mirror = meta.faceLeft ? -1 : 1;
  return {
    x: originX + ((meta.ox ?? 0) - CELL_W / 2 + point.x) * s * mirror,
    y: originY + ((meta.oy ?? 0) - frameFootY(meta) + point.y) * s,
  };
}

export function canvasToPoint(charKey, frameKey, px, py, originX, originY, scale) {
  const meta = frameMeta(charKey, frameKey, { preview: true });
  if (!meta) return null;
  const s = scale * renderScaleOf(meta);
  if (!s) return null;
  const mirror = meta.faceLeft ? -1 : 1;
  return {
    x: (px - originX) / (s * mirror) + CELL_W / 2 - (meta.ox ?? 0),
    y: (py - originY) / s + frameFootY(meta) - (meta.oy ?? 0),
  };
}

/**
 * The point in GAME px — how far forward of the centre line and how far above
 * the foot line the blow lands — which is the number that actually means
 * something, and the one the panel shows.
 *
 * Also where the guard band is checked. `reachGuard` is the same test
 * `verifiedReach` applies before it will read a point as a reach: outside it
 * the point is not clamped, it is refused, and the move falls back to the
 * fighter's scalar. Saying so HERE, while the handle is under the pointer, is
 * the whole reason this control is worth having in the sprite bench — Hakari's
 * jab sat 24 px behind his own centre line for two rounds, and the only place
 * that fact ever surfaced was an audit nobody was running.
 */
export function pointInGame(charKey, frameKey, point) {
  const g = point && imageToGame(charKey, frameKey, point.x, point.y);
  if (!g) return null;
  const { lo, hi } = reachGuard(charKey);
  return {
    x: Math.round(g.x), y: Math.round(g.y),
    lo: Math.round(lo), hi: Math.round(hi),
    // A forward state's point has to be a reach; a rising one (`upHeavy`) is
    // thrown along the centre line and its x is not a reach at all, so the band
    // is not its test and the panel must not report it as failing one.
    forward: strikeStatesForFrame(charKey, frameKey).some((s) => s !== "upHeavy"),
    inBand: g.x >= lo && g.x <= hi,
  };
}

// ------------------------------------------------------------------- export

/** What the last export carried, so "is there work that has not left the
 *  bench" is answered exactly rather than guessed from a dirty flag. Nothing
 *  here is saved — a reload throws every edit away, the same bargain the rest
 *  of this bench makes. */
let lastExported = "";

const signature = () => JSON.stringify([...edits].sort());

export const unexportedPoints = () => signature() !== lastExported;

export function markPointsExported() {
  lastExported = signature();
}

/**
 * The export: the same document the verification bench downloads, carrying one
 * set, so `tools/apply_verification.mjs` merges it into
 * src/config_strike_points.js key by key.
 *
 * `value` is in GAME px because that is what the apply tool expects and what
 * the verification bench files — it converts back through `gameToImage` against
 * whatever drawing the pose uses at apply time, which is also what makes the
 * tool's off-the-drawing guard able to catch a sitting that predates a
 * delivery. `state` is the first state this drawing serves, which is what the
 * meta records as the reason the point was placed.
 */
export function strikeExportDoc() {
  const at = new Date().toISOString();
  const decisions = [...edits].map(([id, point]) => {
    const [char, frame] = id.split("/");
    const g = imageToGame(char, frame, point.x, point.y);
    if (!g) return null;
    const stored = committedPoint(char, frame);
    const wasGame = stored && imageToGame(char, frame, stored.x, stored.y);
    return {
      id: `${char}/${strikeStatesForFrame(char, frame)[0] || "light"}`,
      status: "edited",
      char,
      state: strikeStatesForFrame(char, frame)[0] || null,
      frame,
      value: { x: Math.round(g.x), y: Math.round(g.y) },
      measured: wasGame ? { x: Math.round(wasGame.x), y: Math.round(wasGame.y) } : null,
      at,
    };
  }).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
  if (!decisions.length) return null;
  return {
    tool: "sprite-workbench",
    format: 2,
    exportedAt: at,
    summary: `strike-points: ${decisions.length} edited`,
    sets: {
      "strike-points": {
        label: "Strike points",
        fingerprint: null,
        counts: { edited: decisions.length },
        decisions,
      },
    },
  };
}
