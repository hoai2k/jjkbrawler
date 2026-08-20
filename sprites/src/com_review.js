// WHICH FRAMES' CENTRE OF MASS IS WORTH A HUMAN LOOK.
//
// ONE RULE, TWO CONSUMERS. `tools/audit_sprite_com.mjs` prints the list at a
// terminal and the verification bench's "frame centre of mass" set walks it one
// drawing at a time (`/workbench/?edit=verification&set=frame-com`). They used
// to be able to disagree, because the audit carried the only copy of the test;
// now the audit is a printer for this and the bench is an editor for it.
//
// WHY IT MATTERS MORE THAN IT USED TO. `anchors.com` began as a PIVOT — a
// tumble turned about it, a squash widened about it — where being a few pixels
// out is a subtlety nobody would file. It has since become a PLACEMENT twice
// over: an airborne drawing hangs from it (`holdComY`, src/render.js), and a
// cross-fade now lines its two drawings up on it (`?smooth=com`). A placement
// that is wrong moves the whole fighter, so which of these numbers a person has
// actually looked at is a question worth being able to answer.
//
// FOUR REASONS A FRAME LANDS HERE. Each is a different way of being unsure, and
// a frame can carry several:
//
//   unbaked   no stored anchor at all — the renderer is falling back to a
//             guess off the pixel centroid. Nothing is WRONG, but nothing has
//             been measured either, and the consumers that move a body by this
//             number decline to act on it (anchorOffset's `measured`).
//   height    the mass sits at a different fraction of body height than a
//             person said this fighter's mass sits at (config_body_points.js,
//             placed in the bench's "centre-of-mass" set). The audit's
//             original and only test. Skipped for poses that are genuinely
//             not upright, where disagreeing is the drawing being right.
//   outside   the mass sits outside the drawing's own core span — off the
//             body. A pose cannot carry its weight beside itself, so this one
//             is a bake fault rather than a question.
//   swing     the mass jumps between two drawings of the SAME animation by
//             more than a cross-fade can align (XFADE_COM_MAX_FRAC). Either
//             the pose really does lunge that far or one of the two anchors is
//             wrong — and that is exactly the judgement a tool cannot make.
//
// Only `outside` is an outright claim of error. The other three are questions,
// which is why the answer to them is a queue and not a fix.

import { animsOf, anchorLocal, frameFootY, hasAnchor } from "./sprites.js";
import { imageToGame } from "../../src/strike_points.js";
import { bodyMetrics } from "../../src/silhouette.js";
import { comFrac } from "../../src/body_points.js";
import { XFADE_COM_MAX_FRAC } from "../../src/config_tuning.js";

/** How far from the fighter's own verified height fraction is worth asking
 *  about. Set from the roster's own spread: upright frames sit within about
 *  ±0.06 of it, so beyond this a frame is saying something different about the
 *  same body. Inherited from tools/audit_sprite_com.mjs, which is where it was
 *  measured. */
export const COM_HEIGHT_FLAG = 0.09;

/** Poses whose body is genuinely not upright, so a mass far from the standing
 *  fraction is the drawing being right rather than the bake being wrong. They
 *  are still checked for the other three reasons — a crouch may legitimately
 *  sit low and still have its anchor off the body. */
export const OFF_AXIS = /^(prone|tumble|crouch|ledge|dodge_roll|sit|down)/i;

/** This frame's mass, in the two frames of reference the two tests need.
 *
 *  `frac` is where the mass sits up THIS DRAWING, as a fraction of the
 *  drawing's own height. That is the frame the per-character value is quoted
 *  in ("a FRACTION of drawn height", config_body_points.js) and the only one
 *  in which a crouch and a stand can be asked the same question.
 *
 *  `gx` is GAME pixels forward of the centre line — the same units the
 *  renderer works in, arrived at through the same `imageToGame` the bench
 *  edits through, so `renderScale` and the `faceLeft` mirror are handled once
 *  and correctly. The swing test measures in these because the thing it is
 *  testing against is a clamp the renderer applies in them: measured any other
 *  way, the number a reviewer is shown and the number the fade obeys drift
 *  apart, and the review stops describing the game.
 *
 *  Null when the frame has no usable geometry. */
export function comMetrics(charKey, frameKey, meta) {
  if (!meta) return null;
  const local = anchorLocal(charKey, frameKey, "com", meta);
  if (!local) return null;
  const foot = frameFootY(meta) - (meta.oy ?? 0);
  if (!(foot > 0)) return null;
  const g = imageToGame(charKey, frameKey, local[0], local[1]);
  return {
    gx: g ? g.x : null,
    frac: (foot - local[1]) / foot,
    local,
  };
}

/** Every frame worth a look, worst first.
 *
 *  `manifest` is the sprite manifest — passed in rather than imported so this
 *  serves a node tool reading the JSON off disk and a browser bench reading it
 *  out of assets.js without either having to care which it is.
 *
 *  Returns `{ charKey, frameKey, reasons: [{ kind, detail, excess }], severity,
 *  states }`, where `severity` is the largest normalised excess across the
 *  frame's reasons — how far past its threshold the worst of them is — so the
 *  queue puts the frames most likely to be wrong in front of a person first. */
export function suspectFrames(manifest, { chars = null } = {}) {
  const out = new Map();
  const add = (charKey, frameKey, reason) => {
    const id = `${charKey}/${frameKey}`;
    const row = out.get(id)
      || { charKey, frameKey, reasons: [], severity: 0, states: [], partners: [] };
    row.reasons.push(reason);
    row.severity = Math.max(row.severity, reason.excess);
    out.set(id, row);
    return row;
  };

  for (const [charKey, frames] of Object.entries(manifest?.characters || {})) {
    if (chars && !chars.includes(charKey)) continue;
    const ref = comFrac(charKey);

    for (const [frameKey, meta] of Object.entries(frames)) {
      if (!meta || typeof meta !== "object") continue;
      const m = comMetrics(charKey, frameKey, meta);
      if (!m) continue;

      if (!hasAnchor(charKey, frameKey, "com", meta)) {
        // Not ranked against the others: there is no measurement to be off by,
        // so any excess would be invented. It sorts last within its severity,
        // which is where an unanswered question belongs next to a wrong answer.
        add(charKey, frameKey, {
          kind: "unbaked", excess: 0,
          detail: "no baked anchor — the renderer is guessing off the pixel centroid",
        });
      }

      const off = m.frac - ref;
      if (!OFF_AXIS.test(frameKey) && Math.abs(off) > COM_HEIGHT_FLAG) {
        add(charKey, frameKey, {
          kind: "height", excess: Math.abs(off) - COM_HEIGHT_FLAG,
          detail: `mass at ${m.frac.toFixed(3)} of height, this fighter's verified `
            + `value is ${ref.toFixed(3)} (${off > 0 ? "+" : ""}${off.toFixed(3)})`,
        });
      }

      // The core span is the body without its outstretched limbs, which is the
      // right test: a mass point may sit anywhere ON the torso and nowhere off
      // it. Frames whose bake did not record one are simply not asked.
      const { coreLeft, coreRight } = meta;
      if (Number.isFinite(coreLeft) && Number.isFinite(coreRight) && coreRight > coreLeft) {
        const cx = m.local[0];
        const past = Math.max(coreLeft - cx, cx - coreRight);
        if (past > 0) {
          add(charKey, frameKey, {
            kind: "outside", excess: past / (coreRight - coreLeft),
            detail: `mass sits ${past.toFixed(1)}px outside the body's own core span`,
          });
        }
      }
    }

    // The `swing` pass is per ANIMATION rather than per frame: it is about a
    // pair. Both frames are listed, because the pair is what is in question and
    // a reviewer landing on one of them should be able to answer for it.
    for (const [state, anim] of Object.entries(animsOf(charKey))) {
      const keys = (anim?.frames || []).filter((k) => frames[k]);
      for (let i = 1; i < keys.length; i++) {
        const a = comMetrics(charKey, keys[i - 1], frames[keys[i - 1]]);
        const b = comMetrics(charKey, keys[i], frames[keys[i]]);
        if (a?.gx == null || b?.gx == null) continue;
        // The fighter's body height, which is the denominator render.js builds
        // its own cap out of (`bodyMetrics(...).height * XFADE_COM_MAX_FRAC`).
        const span = bodyMetrics(charKey).height;
        if (!(span > 0)) continue;
        const gap = Math.abs(b.gx - a.gx) / span;
        if (gap <= XFADE_COM_MAX_FRAC) continue;
        const detail = `mass jumps ${(gap * 100).toFixed(0)}% of body height between `
          + `${keys[i - 1]} and ${keys[i]} in \`${state}\` — past what a fade can align`;
        const excess = gap - XFADE_COM_MAX_FRAC;
        const pair = [keys[i - 1], keys[i]];
        for (const k of pair) {
          // The PARTNER travels with the row: a jump between two drawings can
          // only be judged with both of them on screen, and which one is wrong
          // is the whole question.
          const row = add(charKey, k, { kind: "swing", excess, detail });
          if (!row.states.includes(state)) row.states.push(state);
          for (const other of pair) {
            if (other !== k && !row.partners.includes(other)) row.partners.push(other);
          }
        }
      }
    }
  }

  return [...out.values()].sort((a, b) => b.severity - a.severity
    || a.charKey.localeCompare(b.charKey) || a.frameKey.localeCompare(b.frameKey));
}
