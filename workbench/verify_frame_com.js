// WHERE THIS PARTICULAR DRAWING CARRIES ITS WEIGHT.
//
// The bench already has a "centre-of-mass" set. It asks a different question:
// where does THIS FIGHTER carry their mass, one number per character, written
// into config_body_points.js. This one is per DRAWING — `meta.anchors.com` in
// the sprite manifest, the same handle the sprite workbench drags — and there
// are about four thousand of them, so it is not a roster walk. It is a queue of
// the ones a tool has reason to doubt: `sprites/src/com_review.js` owns that
// rule and `tools/audit_sprite_com.mjs` prints the same list at a terminal.
//
// WHY IT IS WORTH SOMEBODY'S TIME NOW. This anchor used to be a pivot, where a
// few pixels out is a subtlety. It has since become a PLACEMENT twice over — an
// airborne drawing hangs from it (`holdComY`), and a cross-fade lines its two
// drawings up on it (`?smooth=com`) — and a placement that is wrong moves the
// whole fighter. The bake has never been reviewed by a person; these are the
// frames where reviewing it would change something.
//
// WHAT AN ANSWER MEANS. Approving records that a human looked, which is the
// thing nothing in the repo could say before. Adjusting exports an ordinary
// sprite-adjustments block — the same shape tools/apply_sprite_adjustments.py
// takes for every other manifest edit, and the same field the sprite workbench
// writes. No new store and no new apply path.
//
// Provider contract: see verification.js and verify_strike_points.js.

import { suspectFrames } from "../sprites/src/com_review.js";
import { anchorLocal } from "../sprites/src/sprites.js";
import { spriteManifest } from "../src/assets.js";
import { imageToGame, gameToImage } from "../src/strike_points.js";
import { bodyMetrics } from "../src/silhouette.js";
import { comFrac } from "../src/body_points.js";
import { XFADE_COM_MAX_FRAC } from "../src/config_tuning.js";
import {
  toCanvas, toGame, drawStage, marker, heightLine, caption, pointEditor,
  ensureTaskArt, artScaleFor, ZOOM, CENTRE_X, GROUND_Y,
} from "./verify_common.js";
import { drawCharFrame } from "../src/render_backend.js";

/** What each reason is called in front of a person, and the colour it sorts
 *  under. The wording is the question being asked, not the test that fired. */
const REASON = {
  swing: "jumps between drawings",
  height: "sits at an odd height",
  outside: "sits off the body",
  unbaked: "never baked",
};

/** Has a HUMAN placed this frame's com, as opposed to it sitting on what the
 *  bake measured? Same convention every other tuned field uses: what a hand
 *  placed is recorded under `edited.anchors` by
 *  tools/apply_sprite_adjustments.py. Presence of `anchors.com` proves nothing
 *  — the bake writes one for every frame. */
function placed(charKey, frameKey) {
  return spriteManifest?.characters?.[charKey]?.[frameKey]?.edited?.anchors?.com !== undefined;
}

/** A state that actually draws this frame, for the stage's own context — a
 *  ledge hang is placed by its hand on the corner rather than by its feet, and
 *  drawStage needs to know which it is looking at.
 *
 *  The list comes from the row itself; `com_review.js` has already resolved it
 *  and drops any frame no state draws, so there is no "or idle" case left to
 *  handle. There used to be, and it was a lie worth removing: it dressed a
 *  legacy sheet cell nothing plays as an idle and put it in the queue. */
const stateOf = (row) => (row.states.includes("ledge") ? "ledge" : row.states[0]);

export async function provider() {
  const rows = suspectFrames(spriteManifest);

  const tasks = rows.map((r) => ({
    id: `frame-com/${r.charKey}/${r.frameKey}`,
    title: `${r.charKey} · ${r.frameKey}`,
    subtitle: r.reasons.map((x) => REASON[x.kind] || x.kind).join(" · ")
      + (placed(r.charKey, r.frameKey) ? " — already placed" : ""),
    states: r.states,
    charKey: r.charKey,
    frameKey: r.frameKey,
    state: stateOf(r),
    reasons: r.reasons,
    partners: r.partners,
    exportKeys: { char: r.charKey, kind: "com" },
  }));

  // The bake is what every value here is measured against, so the cache turns
  // over when the anchors move.
  let n = rows.length;
  for (const r of rows) n = (n * 31 + Math.round(r.severity * 1000)) >>> 0;

  return {
    tasks,
    fingerprint: `frame-com-${n.toString(36)}`,

    // Game px from the centre line and the foot line, which is what the editor
    // and the canvas both speak. The drawing's own image pixels are restored
    // on export — converting on the way out rather than storing game px is
    // what keeps this the same number the sprite workbench shows.
    initialValue(task) {
      const local = anchorLocal(task.charKey, task.frameKey, "com");
      const g = local && imageToGame(task.charKey, task.frameKey, local[0], local[1]);
      if (!g) {
        const b = bodyMetrics(task.charKey);
        return { x: 0, y: -Math.round(b.height * comFrac(task.charKey)) };
      }
      return { x: Math.round(g.x), y: Math.round(g.y) };
    },

    describe(task, value) {
      const b = bodyMetrics(task.charKey);
      return `${task.reasons[0].detail} · <b>x ${value.x}</b>, <b>y ${value.y}</b> — `
        + `${(-value.y / b.height * 100).toFixed(0)}% of height up`;
    },

    renderEditor(task, { container, value, onChange, bindSync }) {
      container.replaceChildren();
      const note = document.createElement("p");
      note.className = "sub";
      note.innerHTML = "Where the body's weight balances — the point it would spin "
        + "about if you flicked it. Not the middle of the picture: an outstretched "
        + "arm moves the drawing's centre and barely moves the body's."
        + task.reasons.map((r) => `<br><b>${REASON[r.kind] || r.kind}</b> — ${r.detail}`).join("");
      container.appendChild(note);
      pointEditor(container, task.charKey, value, onChange, bindSync);
    },

    onCanvasDrag: (task, pt) => toGame(pt),

    draw(task, { ctx, canvas, value, redraw }) {
      drawStage(task, {
        ctx, canvas, redraw, frame: task.frameKey,
        guides: { hurtbox: true, com: "verified" },
      });

      // THE PARTNER DRAWING, ghosted underneath. Only on a `swing` row, where
      // the question is not "is this point right" but "is this jump real" —
      // and that cannot be answered with one of the two drawings on screen.
      // Drawn exactly as the game would draw it, at the same placement, so the
      // gap between the two markers IS the gap the fade has to cover.
      for (const partner of task.partners || []) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        drawCharFrame(ctx, task.charKey, partner, CENTRE_X, GROUND_Y,
          { scale: artScaleFor(task.charKey), facing: 1 });
        ctx.restore();
        const local = anchorLocal(task.charKey, partner);
        const g = local && imageToGame(task.charKey, partner, local[0], local[1]);
        if (!g) continue;
        const p = toCanvas(g);
        marker(ctx, p.x, p.y, "rgba(255, 170, 90, 0.55)", 6);
        ctx.fillStyle = "rgba(255, 170, 90, 0.8)";
        ctx.font = "10px system-ui";
        ctx.fillText(partner, p.x + 10, p.y - 8);
      }

      const p = toCanvas(value);

      // How far a cross-fade is allowed to slide this body to meet its
      // partner. A jump wider than this band is one the fade will clamp, which
      // is the reason a `swing` row is here at all — so draw the band rather
      // than describing it.
      if (task.partners?.length) {
        const cap = bodyMetrics(task.charKey).height * XFADE_COM_MAX_FRAC * ZOOM;
        ctx.fillStyle = "rgba(120, 240, 255, 0.07)";
        ctx.fillRect(p.x - cap, 0, cap * 2, canvas.height);
        ctx.strokeStyle = "rgba(120, 240, 255, 0.25)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x - cap, 0); ctx.lineTo(p.x - cap, canvas.height);
        ctx.moveTo(p.x + cap, 0); ctx.lineTo(p.x + cap, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      heightLine(ctx, canvas, p.y, "rgba(120, 240, 255, 0.35)", null);
      marker(ctx, p.x, p.y, "rgba(120, 240, 255, 0.95)");
      caption(ctx, canvas, `${task.frameKey} — where does this body balance?`);
      ctx.fillStyle = "#9aa4c0";
      ctx.fillText("drag to place", 10, canvas.height - 10);
    },

    ensureReady: ensureTaskArt,
    committed: (task) => placed(task.charKey, task.frameKey),

    exportBlock(decisions) {
      const out = {};
      for (const d of decisions) {
        if (d.status === "skipped") continue;
        const task = tasks.find((t) => t.id === d.id);
        if (!task) continue;
        const px = gameToImage(task.charKey, task.frameKey, d.value.x, d.value.y);
        if (!px) continue;
        (out[task.charKey] ??= {})[task.frameKey] = {
          anchors: { com: [Math.round(px.x * 10) / 10, Math.round(px.y * 10) / 10] },
        };
      }
      if (!Object.keys(out).length) return null;
      // THE SHAPE tools/apply_sprite_adjustments.py READS — a list of
      // { character, adjustments } — and NO LEADING COMMENT: load_payloads
      // skips a file whose first character is `/`, so a helpful header turns
      // the whole export into a silent no-op. See verify_anchors.js, which
      // paid for both of those the hard way.
      return JSON.stringify(
        Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
          .map(([character, adjustments]) => ({ character, adjustments })),
        null, 2);
    },
  };
}
