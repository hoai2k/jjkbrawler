// STRIKE POINTS, as a review queue — the reference task provider.
//
// One item per fighter per attack: their own drawing at that move's contact
// beat, with the measured strike point on it, and the question "is that where
// the blow is?". Approve it, drag it, or flag the ones no nudge can fix.
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
//   renderEditor(task, ctx)         -> build controls into ctx.container
//   draw(task, ctx)                 -> paint the canvas
//   onCanvasDrag(task, pt, ctx)     -> optional; return a new value
//   exportBlock(decisions)          -> optional; paste-ready config text
//
// The drawing, the guides, the frame stepper and the two sliders are all
// verify_common.js — a provider is meant to be the part that DIFFERS.

import { resolvedAnim } from "../sprites/src/sprites.js";
import { CHARACTER_KEYS } from "../src/characters.js";
import { MODEL_REACH, ENVELOPE_INPUTS } from "../src/config_model_reach.js";
import { STRIKE_POINTS, STRIKE_POINT_META } from "../src/config_strike_points.js";
import { contactFrame, imageToGame, gameToImage } from "../src/strike_points.js";
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
  for (const charKey of CHARACTER_KEYS) {
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
 * engine consults this. A point whose FILE has since changed does not count:
 * the drawing was replaced, so the decision is about a picture that is no
 * longer there and somebody has to look at it afresh.
 */
function committed(task) {
  const frame = contactFrame(task.charKey, task.state);
  const held = frame ? STRIKE_POINTS[task.charKey]?.[frame] : null;
  if (!held) return false;
  const file = frameMeta(task.charKey, frame)?.file;
  return !held.file || !file || held.file === file;
}

/** Where the value on screen came from before anybody touched it. */
function sourceOf(charKey, state) {
  const frame = contactFrame(charKey, state);
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
  return `${sourceOf(task.charKey, task.state)} · <b>x ${value.x}</b>, <b>y ${value.y}</b>`
    + ` — ${upFrac}% of height up, ${reachFrac}% of measured reach out`;
}

function renderEditor(task, { container, value, onChange, redraw }) {
  container.replaceChildren();
  // The point is a claim about the CONTACT frame, and that is what the bench
  // opens on — but the neighbours are how you tell a fist at full extension
  // from one still travelling, so they are a click away.
  frameStepper(container, task, redraw);
  pointEditor(container, task.charKey, value, onChange);
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
  const byChar = new Map();
  const flagged = [];
  // Everything already in the tree goes in FIRST, so the block this produces
  // is the whole file rather than a fragment. Pasting it over the old one is
  // then a safe, complete replacement — a block carrying only the current
  // sitting would silently drop every point committed before it.
  for (const [char, frames] of Object.entries(STRIKE_POINTS)) {
    for (const [frame, held] of Object.entries(frames)) {
      if (!byChar.has(char)) byChar.set(char, new Map());
      byChar.get(char).set(frame, {
        char, frame, image: { x: held.x, y: held.y }, file: held.file || null,
        at: STRIKE_POINT_META[char]?.[frame]?.at || null,
        states: STRIKE_POINT_META[char]?.[frame]?.states || [],
        fromTree: true,
      });
    }
  }
  for (let d of decisions) {
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
    d = { ...d, image: { x: Math.round(img.x * 10) / 10, y: Math.round(img.y * 10) / 10 } };
    if (!byChar.has(d.char)) byChar.set(d.char, new Map());
    // Keyed by FRAME, so two states showing one drawing collapse to one entry.
    // Last decision wins, and the states it was reviewed under are collected
    // for the meta — a reader should be able to see that a shared drawing was
    // signed off from more than one place.
    const held = byChar.get(d.char).get(d.frame);
    byChar.get(d.char).set(d.frame, {
      ...d,
      states: [...new Set([...(held?.states || []), d.state])],
    });
  }
  const lines = [];
  const meta = [];
  for (const [char, frames] of [...byChar].sort()) {
    const sorted = [...frames].sort(([a], [b]) => a.localeCompare(b));
    lines.push(`  ${JSON.stringify(char)}: { `
      + sorted.map(([frame, d]) => `${frame}: { x: ${d.image.x}, y: ${d.image.y}`
        + `, file: ${JSON.stringify(d.fromTree ? d.file : fileOf(d.char, frame))} }`).join(", ")
      + ` },`);
    meta.push(`  ${JSON.stringify(char)}: { `
      + sorted.map(([frame, d]) => `${frame}: { at: ${JSON.stringify((d.at || "").slice(0, 10))}`
        + `, states: ${JSON.stringify(d.states)}`
        + (d.note ? `, note: ${JSON.stringify(d.note)}` : "") + ` }`).join(", ")
      + ` },`);
  }
  return {
    file: "src/config_strike_points.js",
    note: "keyed by sprite frame — a point is a claim about one drawing",
    text: `export const STRIKE_POINTS = {\n${lines.join("\n")}\n};\n\n`
      + `export const STRIKE_POINT_META = {\n${meta.join("\n")}\n};\n`
      + (flagged.length
        ? `\n// Flagged as broken — these want a fix at the source:\n${flagged.join("\n")}\n` : ""),
  };
}
