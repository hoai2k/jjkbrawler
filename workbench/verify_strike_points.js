// STRIKE POINTS, as a review queue — the reference task provider.
//
// One item per fighter per attack: their own drawing at that move's contact
// beat, with the measured strike point on it, and the question "is that where
// the blow is?". Approve it, drag it, or flag the ones no nudge can fix.
//
// WHAT THEY NOW DECIDE. These points started as a place to put the impact
// spark. They are also the sprite game's RANGE: `src/strike_reach.js` reads the
// `x` of each forward attack's point as how far that attack reaches, and
// moves.js builds the hitbox from it plus a fixed grace margin. So dragging a
// point on a jab moves the jab's hitbox and the crescent drawn around it, and a
// point the reach system cannot read — behind the centre line, or halfway
// across the stage — is rejected rather than clamped, which puts the item back
// in this queue with the reason on it. The queue is where a range gets set now,
// which is the point: a person can see the cursed energy and the smear and
// place the point on the fist instead.
//
// WHY A HUMAN AT ALL. The measurement (src/config_model_reach.js, baked by
// tools/derive_attack_envelopes.mjs) poses the rig at the beat and reports the
// end of the striking limb, or the weapon's far end when a weapon leads. That
// is right most of the time and wrong in ways only a person spots: Gakuganji's
// guitar is gripped at the headstock, so his "blade" reads as a body hanging
// below his hand; Momo's broom reports its brush at shin height. The rig is
// also not what a sprite player sees — the sprite is its own drawing, and the
// point has to sit on THAT.
//
// THE PROVIDER CONTRACT (see verification.js for the engine):
//
//   tasks          [{ id, title, subtitle, charKey?, state?, exportKeys? }]
//   fingerprint    changes when the underlying measurements do, so a re-bake
//                  starts a clean queue instead of restoring stale decisions
//   initialValue(task)              -> the value before any human touched it
//   describe(task, value)           -> the line above the editor (HTML)
//   renderEditor(task, ctx)         -> build controls into ctx.container.
//                  ctx.onChange takes a PATCH — the keys that moved, not the
//                  whole value — because the editor is not rebuilt between
//                  changes and a captured `value` goes stale. ctx.bindSync
//                  registers a control that should follow the value when
//                  something else (the canvas, an undo) moves it.
//   draw(task, ctx)                 -> paint the canvas
//   onCanvasDrag(task, pt, ctx)     -> optional; return a new value
//   exportBlock(decisions)          -> optional; THIS SITTING'S CHANGES, for
//                                      tools/apply_verification.mjs to merge
//
// WHY CHANGES AND NOT THE WHOLE CONFIG. This block used to carry everything
// already committed as well, so that pasting it over the file was a complete
// replacement rather than a truncation. That made the export a snapshot of the
// tree AS THE BENCH LOADED IT — and a bench stays open. Two sittings from one
// page load, or a page load older than the last commit, and the second export
// carries stale values for rows the first one changed; pasting it reverts them
// with nothing to say it did. Export 20 of these points would have done that to
// five of export 19's and dropped a sixth. A merge of the changes cannot: a row
// nobody touched is absent rather than reasserted.
//
// The drawing, the guides, the frame stepper and the two sliders are all
// verify_common.js — a provider is meant to be the part that DIFFERS.

import { resolvedAnim } from "../sprites/src/sprites.js";
import { CHARACTER_KEYS, byCharacterName } from "../src/characters.js";
import { MODEL_REACH, ENVELOPE_INPUTS } from "../src/config_model_reach.js";
import { STRIKE_POINTS, STRIKE_POINT_META } from "../src/config_strike_points.js";
import { contactFrame, imageToGame, gameToImage } from "../src/strike_points.js";
import { reachFault } from "../src/strike_reach.js";
import { bodyMetrics } from "../src/silhouette.js";
import { frameMeta } from "../src/assets.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";
import { COM_BODY_FRAC } from "../src/config_tuning.js";
import {
  ZOOM, toCanvas, toGame, drawStage, marker, caption,
  frameStepper, pointEditor, ensureTaskArt,
} from "./verify_common.js";

/** The attacks worth checking, in the order somebody would want to walk them:
 *  the two everything else is judged against first. */
const STATES_TO_CHECK = [
  "light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack", "airLight",
];

export async function provider() {
  const tasks = [];
  // Alphabetically, so a queue of 200 items can be navigated by name.
  // The QUEUE's own order is its filters (to do / answered); the order
  // inside them was only ever the select screen's grouping.
  for (const charKey of [...CHARACTER_KEYS].sort(byCharacterName)) {
    for (const state of STATES_TO_CHECK) {
      // Only states this fighter actually draws: a character whose sheet has
      // no art for a state would be a blank canvas and an unanswerable
      // question.
      if (!resolvedAnim(charKey, state)?.frames?.length) continue;
      // The decision is about the DRAWING, so the frame travels with it —
      // see src/config_strike_points.js for why the config is keyed that way
      // rather than by state.
      const frame = contactFrame(charKey, state);
      tasks.push({
        id: `${charKey}/${state}`,
        title: `${charKey} · ${state}`,
        subtitle: `${frame} — ${sourceOf(charKey, state)}`,
        charKey,
        state,
        frame,
        exportKeys: { char: charKey, state, frame },
      });
    }
  }
  return {
    tasks,
    fingerprint: `${ENVELOPE_INPUTS.manifest}-${ENVELOPE_INPUTS.poses}-${ENVELOPE_INPUTS.sprites}`,
    initialValue, describe, renderEditor, draw, onCanvasDrag, exportBlock,
    ensureReady: ensureTaskArt,
    committed,
  };
}

/**
 * Is this item's answer already in the tree?
 *
 * A point committed to src/config_strike_points.js on an earlier pass is
 * settled — the queue should not ask again, which is the whole reason the
 * engine consults this. Two things unsettle one:
 *
 *   * its FILE has changed. The drawing was replaced, so the decision is about
 *     a picture that is no longer there.
 *   * the game CANNOT USE IT. Since reach came off these points
 *     (src/strike_reach.js), a forward attack's point is also the number its
 *     hitbox is built from, and one that lands behind the fighter or halfway
 *     across the stage is rejected rather than clamped. The move falls back to
 *     the fighter's scalar reach and the item comes back here, which is the
 *     whole reason the rejection is not silent: something is wrong with this
 *     point and only a person looking at the drawing can say what.
 */
function committed(task) {
  const frame = contactFrame(task.charKey, task.state);
  const held = frame ? STRIKE_POINTS[task.charKey]?.[frame] : null;
  if (!held) return false;
  const file = frameMeta(task.charKey, frame)?.file;
  if (held.file && file && held.file !== file) return false;
  return !reachFault(task.charKey, task.state);
}

/** Where the value on screen came from before anybody touched it. */
function sourceOf(charKey, state) {
  const frame = contactFrame(charKey, state);
  // A point the reach system threw out leads with that, because it is the
  // reason the item is in the queue at all.
  const fault = reachFault(charKey, state);
  if (fault) return `REJECTED (x ${fault.x}) — ${fault.why}`;
  if (frame && STRIKE_POINTS[charKey]?.[frame]) return "already verified in config";
  const m = MODEL_REACH[charKey]?.states?.[state];
  if (m && Number.isFinite(m.sx)) return m.via === "prop" ? "measured — weapon" : "measured — limb";
  return "derived from body (no rig)";
}

function initialValue(task) {
  const { charKey, state } = task;
  // A stored decision is in the DRAWING's pixels; the reviewer works in game
  // px, so it is converted for display exactly as the game converts it.
  const frame = contactFrame(charKey, state);
  const human = STRIKE_POINTS[charKey]?.[frame];
  if (human) {
    const g = imageToGame(charKey, frame, human.x, human.y);
    if (g) return { x: Math.round(g.x), y: Math.round(g.y) };
  }
  const m = MODEL_REACH[charKey]?.states?.[state];
  if (m && Number.isFinite(m.sx)) return { x: m.sx, y: -m.sy };
  const b = bodyMetrics(charKey);
  return { x: Math.round(b.reach * 0.75), y: -Math.round(b.height * COM_BODY_FRAC) };
}

function describe(task, value) {
  const b = bodyMetrics(task.charKey);
  const upFrac = (-value.y / b.height * 100).toFixed(0);
  const reachFrac = (value.x / Math.max(1, b.reach) * 100).toFixed(0);
  const fault = reachFault(task.charKey, task.state);
  // What the point DOES, for a forward attack: x is the reach the game builds
  // this move's hitbox from, so the reviewer should know they are setting a
  // range and not only placing a spark.
  const band = fault
    ? ` · <b>rejected as a reach</b> — usable band ${fault.lo}-${fault.hi} px, `
      + `so this move is falling back to ${Math.round(b.reach)} px`
    : "";
  return `${sourceOf(task.charKey, task.state)} · <b>x ${value.x}</b>, <b>y ${value.y}</b>`
    + ` — ${upFrac}% of height up, ${reachFrac}% of measured reach out${band}`;
}

function renderEditor(task, { container, value, onChange, redraw, bindSync }) {
  container.replaceChildren();
  // The point is a claim about the CONTACT frame, and that is what the bench
  // opens on — but the neighbours are how you tell a fist at full extension
  // from one still travelling, so they are a click away.
  frameStepper(container, task, redraw);
  pointEditor(container, task.charKey, value, onChange, bindSync);
}

function onCanvasDrag(task, pt) {
  return toGame(pt);
}

function draw(task, { ctx, canvas, value, redraw }) {
  drawStage(task, { ctx, canvas, redraw, guides: { hurtbox: true, com: true, reach: true } });

  // The measurement, ghosted, whenever a human has moved it — so an edit
  // reads as a correction of something rather than a bare number.
  const base = baseValue(task);
  if (base && (base.x !== value.x || base.y !== value.y)) {
    const p = toCanvas(base);
    marker(ctx, p.x, p.y, "rgba(255, 190, 90, 0.45)", 6);
  }
  const p = toCanvas(value);
  marker(ctx, p.x, p.y, "rgba(120, 240, 255, 0.95)");

  const beat = STATES[clipNameFor(task.state)]?.beat ?? 0;
  caption(ctx, canvas,
    `${task.frame} · beat ${Math.round(beat * 1000)}ms · ${ZOOM}× · white box = hurtbox`);
  ctx.fillText("drag to place", 10, canvas.height - 10);
}

function baseValue(task) {
  const m = MODEL_REACH[task.charKey]?.states?.[task.state];
  return m && Number.isFinite(m.sx) ? { x: m.sx, y: -m.sy } : null;
}

const fileOf = (charKey, frame) => frameMeta(charKey, frame)?.file || null;

/** The decisions as a block to paste into src/config_strike_points.js.
 *  Approved-as-measured items are included too: "a person looked at this and
 *  it was right" is a fact worth pinning, and it is what stops a later re-bake
 *  from quietly moving a point somebody already blessed. Flagged items are
 *  listed as comments — they are a job, not a value. */
function exportBlock(decisions) {
  const rows = [];
  const meta = [];
  const flagged = [];
  for (const d of decisions) {
    if (d.status === "skipped") continue;
    if (d.status === "rejected") {
      flagged.push(`//   ${d.char}.${d.frame || d.state}: ${d.note || "flagged, no note"}`);
      continue;
    }
    if (!d.frame) continue;   // nothing to file it under
    // Back into the drawing's own pixels — a point is a claim about the
    // artwork, so it has to survive the sprite being nudged or resized.
    const img = gameToImage(d.char, d.frame, d.value.x, d.value.y);
    if (!img) continue;
    const x = Math.round(img.x * 10) / 10, y = Math.round(img.y * 10) / 10;
    const at = (d.at || "").slice(0, 10);
    rows.push(`  ${JSON.stringify(d.char)}: { ${d.frame}: { x: ${x}, y: ${y}`
      + `, file: ${JSON.stringify(fileOf(d.char, d.frame))} } },`
      + (d.note ? `  // ${d.note}` : ""));
    meta.push(`  ${JSON.stringify(d.char)}: { ${d.frame}: { at: ${JSON.stringify(at)}`
      + `, states: ${JSON.stringify([d.state].filter(Boolean))}`
      + (d.note ? `, note: ${JSON.stringify(d.note)}` : "") + ` } },`);
  }
  return {
    file: "src/config_strike_points.js",
    // THIS SITTING ONLY — see the note at the top of the file. The merge tool
    // writes these keys over whatever the config holds and leaves the rest
    // alone, which is the whole reason it is a tool and not a paste.
    note: "changes from this sitting — apply with "
      + "`node tools/apply_verification.mjs <the downloaded file>`, do not paste over the config",
    text: rows.length
      ? `// STRIKE_POINTS — ${rows.length} change(s) from this sitting\n${rows.join("\n")}\n\n`
        + `// STRIKE_POINT_META\n${meta.join("\n")}\n`
        + (flagged.length
          ? `\n// Flagged as broken — these want a fix at the source:\n${flagged.join("\n")}\n` : "")
      : "// no changes\n",
  };
}
