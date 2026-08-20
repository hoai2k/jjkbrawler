// THE BOX YOU CAN BE HIT ON, EDITED ON THE DRAWING IT IS ABOUT.
//
// A hurtbox is DERIVED — `combat.js hurtbox` sizes it from the fighter's own
// measured body and the roster-wide fractions in constants.js — and a fit
// (`HURTBOX_FIT` in src/config_body_points.js) is the human correction on top
// of it: `w`/`h` scale the derived size about its bottom edge, `dx`/`dy` shift
// the whole box, all as fractions of the derived box so the decision survives
// a re-measure. Two failures matter and they are different: a box bigger than
// the body is a fighter hit out of thin air, smaller is attacks visibly
// passing through them.
//
// WHY THIS LIVES IN THE SPRITE BENCH. The judgement is about a PICTURE — does
// this box cover this crouch — and this is the bench with the picture in it,
// at game size, with the placement controls that move the body inside the box
// an inch away. The verification bench asks the same question in a queue, one
// fighter at a time; here it is answered where you already are when you notice
// it, on the pose that is on screen.
//
// SEVEN CASES, NOT ONE PER POSE. `HURTBOX_CASES` (src/hurtbox_art.js) is the
// list combat.js branches on, and each case names the ANIMATION whose drawing
// shows the body in that box. So a case belongs to every frame that animation
// resolves to, and one drawing can carry two: the hurt pose is both the box a
// reeling fighter has and — spun on its side — the box a tumbling one has.
//
// NOT IN THE MANIFEST, so not in the ordinary export. A fit is per fighter and
// per case, not per frame, and it lives in a game config rather than in the
// sprite data. It leaves the bench as its own small file in the shape the
// verification bench exports, because `tools/apply_verification.mjs` already
// knows how to merge that into the config, keys one at a time, without
// touching a fit somebody else committed meanwhile.

import { resolvedAnim } from "../src/sprites.js";
import { HURTBOX_CASES, derivedBox, fittedBox, fitState } from "../../src/hurtbox_art.js";
import { HURTBOX_FIT } from "../../src/config_body_points.js";

const IDENTITY = { w: 1, h: 1, dx: 0, dy: 0 };

/** This session's edits, `char/case` -> { w, h, dx, dy }. Empty until somebody
 *  drags something: absent means "whatever the config says", which is what
 *  keeps an untouched fighter out of the export entirely. */
const edits = new Map();

const idOf = (charKey, caseKey) => `${charKey}/${caseKey}`;

/** The cases this DRAWING shows the body for, in the order combat.js lists
 *  them. A case's `state` is an animation; the drawing carries the case when
 *  that animation actually resolves to it, which is the same question the
 *  hurtbox overlay and the export both need answered. */
export function casesForFrame(charKey, frameKey) {
  if (!charKey || !frameKey) return [];
  return HURTBOX_CASES.filter((c) => {
    const frames = resolvedAnim(charKey, c.state)?.frames;
    return Array.isArray(frames) && frames.includes(frameKey);
  });
}

/** What the game would use right now: this session's edit, else the committed
 *  fit, else the identity that means "the derived box, unchanged". */
export function fitOf(charKey, caseKey) {
  const held = edits.get(idOf(charKey, caseKey));
  if (held) return held;
  const stored = HURTBOX_FIT[charKey]?.[caseKey];
  return stored ? { ...IDENTITY, ...stored } : { ...IDENTITY };
}

/** The fit as the repository has it — what Reset goes back to, and what a
 *  drag is compared against to decide whether anything changed. */
export function committedFit(charKey, caseKey) {
  const stored = HURTBOX_FIT[charKey]?.[caseKey];
  return stored ? { ...IDENTITY, ...stored } : { ...IDENTITY };
}

const same = (a, b) => ["w", "h", "dx", "dy"].every((k) => Math.abs(a[k] - b[k]) < 1e-4);

export const fitEdited = (charKey, caseKey) =>
  !same(fitOf(charKey, caseKey), committedFit(charKey, caseKey));

/** Set one fit. An edit that lands back on the committed value is DROPPED
 *  rather than stored as agreement — the export carries what somebody changed,
 *  and a value identical to the one in the file is not a change. */
export function setFit(charKey, caseKey, value) {
  const next = { ...IDENTITY, ...value };
  if (same(next, committedFit(charKey, caseKey))) edits.delete(idOf(charKey, caseKey));
  else edits.set(idOf(charKey, caseKey), next);
}

export function resetFit(charKey, caseKey) {
  edits.delete(idOf(charKey, caseKey));
}

/** How many fits this session has moved, for the panel and for the "you have
 *  work that has not left the bench" warning. */
export const fitEditCount = () => edits.size;

/**
 * Where a case's box sits in game px relative to the fighter, both as derived
 * and as fitted. One place that knows the geometry, so the overlay, the drag
 * and the readout cannot disagree about what `dx` means.
 */
export function boxesFor(charKey, caseKey) {
  return {
    base: derivedBox(charKey, caseKey),
    box: fittedBox(charKey, caseKey, fitOf(charKey, caseKey)),
  };
}

/**
 * Four canvas edges back into a fit, given where the fighter's own origin is
 * on screen and the zoom. The inverse of `fittedBox`, and the only place a
 * drag turns into numbers somebody has to live with.
 *
 * Clamped the same way the verification bench clamps them: a box a fifth of
 * the derived size or three times it is a mis-drag rather than a decision.
 */
export function fitFromEdges(charKey, caseKey, { left, right, top, bottom }, origin, z) {
  const base = derivedBox(charKey, caseKey);
  const bw = base.w * z, bh = base.h * z;
  const baseBottom = origin.y - (base.top - base.h) * z;
  const baseCx = origin.x + (base.cx || 0) * z;
  const w = Math.max(8, right - left);
  const h = Math.max(8, bottom - top);
  return {
    w: clamp3(w / bw, 0.2, 3),
    h: clamp3(h / bh, 0.2, 3),
    dx: clamp3(((left + right) / 2 - baseCx) / bw, -1.5, 1.5),
    dy: clamp3((baseBottom - bottom) / bh, -1.5, 1.5),
  };
}

const clamp3 = (n, lo, hi) =>
  Number(Math.min(hi, Math.max(lo, n)).toFixed(3));

/** What the last export carried, so "is there work that has not left the
 *  bench" is answered exactly rather than guessed from a dirty flag. Nothing
 *  here is saved — a reload throws every fit edit away, the same bargain the
 *  rest of this bench makes — so the warning on the way out is the only thing
 *  standing between a sitting and losing it. */
let lastExported = "";

const signature = () => JSON.stringify([...edits].sort());

export const unexportedFits = () => signature() !== lastExported;

export function markFitsExported() {
  lastExported = signature();
}

/**
 * The export: the same document the verification bench downloads, carrying one
 * set. `tools/apply_verification.mjs` merges it into config_body_points.js key
 * by key, so a sitting here and a sitting there cannot revert each other.
 *
 * `art` is the token for the drawing the fit was judged against, which is what
 * lets a later redraw say "this decision was about a picture that is gone"
 * instead of inheriting the answer silently.
 */
export function fitExportDoc() {
  const at = new Date().toISOString();
  const decisions = [...edits].map(([id, value]) => {
    const [char, caseKey] = id.split("/");
    return {
      id: `fit/${char}/${caseKey}`,
      status: "edited",
      char,
      case: caseKey,
      art: fitState(char, caseKey).token,
      value,
      measured: { ...IDENTITY },
      at,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (!decisions.length) return null;
  return {
    tool: "sprite-workbench",
    format: 2,
    exportedAt: at,
    summary: `hurtbox-fit: ${decisions.length} edited`,
    sets: {
      "hurtbox-fit": {
        label: "Hurtbox fit",
        fingerprint: null,
        counts: { edited: decisions.length },
        decisions,
      },
    },
  };
}
