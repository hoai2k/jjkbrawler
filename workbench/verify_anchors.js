// A POINT ON A DRAWING, asked one fighter at a time.
//
// WHAT THIS IS NOT. It is not a second store. Everything here reads and writes
// `meta.anchors[name]` in the sprite manifest — the exact field the SPRITE
// workbench's anchor handles edit, the one `sprites/src/sprites.js` resolves
// through `anchorLocal`/`anchorPoint`, and the one the game already consumes:
// `teeter` through `anchorTo` in src/render.js, `grabHand` and `grabChest`
// through src/grab.js. Move the handle here or move it there and the same
// number changes.
//
// That was learned the expensive way. These three were first added as
// per-fighter numbers in BODY_POINTS with their own verification sets, which
// put a second teeter shift in motion.js competing with the `anchorTo`
// render.js already applied. The fix was to delete them — and deleting them
// took the review queue with it, which was the half of the request that was
// actually wanted. This is that queue, backed by the right store.
//
// WHY A QUEUE AT ALL, when the sprite workbench can already drag these. Two
// different jobs. The sprite workbench is per-fighter and shows one drawing:
// you go there to fix a fighter. This is per-QUESTION and walks the roster:
// you come here to answer "where is the grabbing hand" thirty-four times
// without deciding thirty-four times where to look. The grab pair especially
// only means anything across fighters — a fist drawn high on one and low on
// another makes every pairing look like they are holding different arguments —
// and that is a comparison a per-fighter tool cannot show you.
//
// WHAT IT EXPORTS. A sprite-adjustments block, the same shape
// `tools/apply_sprite_adjustments.py` already takes for every other manifest
// edit, keyed by character and frame with an `anchors` object. There is no new
// apply path and no new file to read.
//
// Provider contract: see verification.js and verify_strike_points.js.

import { resolvedAnim, anchorLocal, EXTRA_ANCHORS } from "../sprites/src/sprites.js";
import { spriteManifest } from "../src/assets.js";
import { CHARACTER_KEYS } from "../src/characters.js";
import { imageToGame, gameToImage } from "../src/strike_points.js";
import { bodyMetrics } from "../src/silhouette.js";
import {
  toCanvas, toGame, drawStage, marker, caption, frameIndex,
  pointEditor, frameStepper, ensureTaskArt,
} from "./verify_common.js";

/** The frame a task edits. An anchor is per-FRAME, so the stepper's current
 *  frame is the subject — not the state, and not the character. */
function frameOf(task) {
  const frames = resolvedAnim(task.charKey, task.state)?.frames?.filter(Boolean) || [];
  return frames[frameIndex(task)] || frames[0] || null;
}

/** Has a HUMAN placed this anchor, as opposed to it sitting on what the bake
 *  measured? Not the same question as whether a value exists: tools/bake_anchors
 *  writes `teeter` and `ledge` for every frame that owes one, so presence is
 *  the bake talking. The first version of this asked `anchors[name] !== undefined`
 *  and reported all 34 teeters as confirmed before anybody had answered one —
 *  and the first sitting then moved 26 of them by hundreds of pixels. What a
 *  hand placed is recorded under `edited.anchors` by
 *  tools/apply_sprite_adjustments.py, which is the same convention every other
 *  tuned field uses. */
function placed(charKey, frameKey, name) {
  const meta = spriteManifest?.characters?.[charKey]?.[frameKey];
  return meta?.edited?.anchors?.[name] !== undefined;
}

/** One provider per named anchor. The set is defined by EXTRA_ANCHORS, so a
 *  new anchor is a queue for free — which is the point of there being one
 *  registry of them. */
export function anchorProvider(name) {
  const cfg = EXTRA_ANCHORS[name];
  if (!cfg) throw new Error(`no such anchor: ${name}`);
  const state = cfg.states[0];

  return async function provider() {
    const roster = CHARACTER_KEYS.filter(
      (k) => resolvedAnim(k, state)?.frames?.filter(Boolean).length);

    const tasks = roster.map((charKey) => ({
      id: `${name}/${charKey}`,
      title: charKey,
      subtitle: placed(charKey, frameOf({ charKey, state, id: `${name}/${charKey}` }), name)
        ? "already placed" : "on the bake's measurement",
      charKey,
      state,
      anchorName: name,
      exportKeys: { char: charKey, kind: name },
    }));

    // The manifest placement is what every value here is measured against, so
    // the cache turns over when the art moves.
    let n = 0;
    for (const key of roster) {
      const b = bodyMetrics(key);
      n = (n * 31 + Math.round(b.height * 10) + Math.round(b.width * 10)) >>> 0;
    }

    return {
      tasks,
      fingerprint: `anchor-${name}-${n.toString(36)}`,

      // Game px from the foot line, which is what the editor and the canvas
      // both speak. The manifest's own image pixels are restored on export.
      initialValue(task) {
        const frameKey = frameOf(task);
        const local = frameKey && anchorLocal(task.charKey, frameKey, name);
        const g = local && imageToGame(task.charKey, frameKey, local[0], local[1]);
        if (!g) {
          const b = bodyMetrics(task.charKey);
          return { x: 0, y: -Math.round(b.height * (1 - (cfg.defaultYFrac ?? 0.5))) };
        }
        return { x: Math.round(g.x), y: Math.round(g.y) };
      },

      describe: (task, value) =>
        `${task.subtitle} · <b>x ${value.x}</b>, <b>y ${value.y}</b> — ${cfg.label.toLowerCase()}`,

      renderEditor(task, { container, value, onChange, redraw, bindSync }) {
        container.replaceChildren();
        const note = document.createElement("p");
        note.className = "sub";
        note.textContent = cfg.hint;
        container.appendChild(note);
        frameStepper(container, task, redraw);
        pointEditor(container, task.charKey, value, onChange, bindSync);
      },

      onCanvasDrag: (task, pt) => toGame(pt),

      draw(task, { ctx, canvas, value, redraw }) {
        drawStage(task, { ctx, canvas, redraw, guides: { hurtbox: true } });
        const p = toCanvas(value);

        // The line the point defines, drawn the way the game uses it: teeter
        // slides the art so this lands on the lip, so its line is vertical;
        // the grab pair meets hand to chest, so theirs is horizontal.
        ctx.strokeStyle = "rgba(120, 240, 255, 0.35)";
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        if (name === "teeter") { ctx.moveTo(p.x, 0); ctx.lineTo(p.x, canvas.height); }
        else { ctx.moveTo(0, p.y); ctx.lineTo(canvas.width, p.y); }
        ctx.stroke();
        ctx.setLineDash([]);

        marker(ctx, p.x, p.y, "rgba(120, 240, 255, 0.95)");
        caption(ctx, canvas, QUESTION[name] || cfg.label);
        ctx.fillText("drag to place", 10, canvas.height - 10);
      },

      ensureReady: ensureTaskArt,
      committed: (task) => placed(task.charKey, frameOf(task), name),

      // Back into the drawing's own pixels, because that is what the anchor
      // is: converting on the way out rather than storing game px is what
      // keeps this the same number the sprite workbench shows.
      exportBlock(decisions) {
        const out = {};
        for (const d of decisions) {
          if (d.status === "skipped") continue;
          const task = tasks.find((t) => t.id === d.id);
          const frameKey = task && frameOf(task);
          if (!frameKey) continue;
          const px = gameToImage(d.char, frameKey, d.value.x, d.value.y);
          if (!px) continue;
          (out[d.char] ??= {})[frameKey] = {
            anchors: { [name]: [Math.round(px.x * 10) / 10, Math.round(px.y * 10) / 10] },
          };
        }
        if (!Object.keys(out).length) return null;
        // THE SHAPE tools/apply_sprite_adjustments.py READS, which is a list of
        // { character, adjustments } — not the { characters: {...} } tree the
        // first version emitted. And NO LEADING COMMENT: load_payloads skips a
        // file whose first character is `/` outright (it is how the workbench's
        // "// no changes" placeholder is tolerated), so a helpful header turned
        // the whole export into a silent no-op. Both faults cost a hand
        // conversion of 68 points before anybody noticed the file did nothing.
        return JSON.stringify(
          Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
            .map(([character, adjustments]) => ({ character, adjustments })),
          null, 2);
      },
    };
  };
}

/** What the canvas asks, in the words the pose brief uses. */
const QUESTION = {
  teeter: "where does the foot meet the lip?",
  grabHand: "where is the hand that closes on the collar?",
  grabChest: "where do the prying hands sit — where the fist lands?",
  ledge: "where does the hand hold the edge?",
};
