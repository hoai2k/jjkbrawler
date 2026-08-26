// THE GRIP, across the roster — where each fighter's hand has hold of the other.
//
// `src/grab.js` stands the two bodies `hand - chest` apart so the holder's fist
// lands on the victim's chest. Both halves are ANCHORS on drawings, dragged in
// the sprite workbench, and this is the same value asked for as a sweep: 34
// fighters, one drawing each, one point on it.
//
// ONE STORE, TWO DOORS, AND THAT IS THE POINT. This queue does not keep its own
// copy of anything. It reads `meta.anchors.grabHand` out of the sprite manifest
// and its export is a SPRITE-ADJUSTMENT payload, applied by the same
// `tools/apply_sprite_adjustments.py` the sprite workbench's export goes
// through — so a hand placed here and a hand dragged there are the same number
// in the same field, and each bench sees the other's work the moment it is
// applied. A task drops out of this queue when the anchor is placed, whichever
// door it came through.
//
// WHY THE HOLD RATHER THAN THE REACH. `grabHand` is asked for on two drawings.
// The reach's sets how far the grab gets; the hold's sets how far apart the two
// fighters stand while it lasts. `holdGapOf` reads the hold's first and falls
// back to the reach's — and the fallback was all there was on every fighter,
// because the handle only appeared on the reach until now. So the distance the
// game pins a hold at came from a pose with the arm thrown out straight, which
// is not where a closed hold keeps its fist.
//
// Provider contract: see verification.js and verify_strike_points.js.

import { resolvedAnim, anchorLocal, hasAnchor } from "../sprites/src/sprites.js";
import { CHARACTER_KEYS, byCharacterName } from "../src/characters.js";
import { spriteManifest } from "../src/assets.js";
import { imageToGame, gameToImage } from "../src/strike_reach.js";
import { holdGapOf } from "../src/grab.js";
import { bodyMetrics } from "../src/silhouette.js";
import {
  ZOOM, GROUND_Y, CENTRE_X, toCanvas, toGame, drawStage, marker,
  caption, pointEditor, frameStepper, ensureTaskArt,
} from "./verify_common.js";

const STATE = "grabHold";
const ANCHOR = "grabHand";

/** The drawing this fighter's hold resolves to — the one the anchor lives on. */
const frameOf = (charKey) => resolvedAnim(charKey, STATE)?.frames?.filter(Boolean)?.[0] || null;

const metaOf = (charKey) => {
  const frame = frameOf(charKey);
  return frame ? spriteManifest?.characters?.[charKey]?.[frame] : null;
};

/**
 * PLACED BY A PERSON, which is not the same as present.
 *
 * `apply_sprite_adjustments.py` records every hand-set field under `edited`,
 * anchors included, precisely because an anchor can also arrive from a bake or
 * a default. A queue that treated "the anchor exists" as "somebody answered"
 * would read its own starting guess back as a confirmed answer — which is what
 * the teeter queue did, and 26 of those feet then moved by hundreds of pixels.
 */
const committed = (task) => (metaOf(task.charKey)?.edited?.anchors || {})[ANCHOR] !== undefined;

/** Changes when the art placement does, so a re-key or a nudge reopens the set:
 *  the anchor is in image pixels and the guides are in game px, and what maps
 *  between them is exactly this metadata. */
function fingerprint() {
  let n = 0;
  for (const key of CHARACTER_KEYS) {
    const m = metaOf(key);
    if (!m) continue;
    n = (n * 31 + Math.round((m.ox ?? 0) * 10) + Math.round((m.renderScale || 1) * 1e4)) >>> 0;
  }
  return `grip-${n.toString(36)}`;
}

/** Where the handle starts, and what the game is doing about it meanwhile.
 *
 * ON THIS DRAWING, always. The honest number to start from would be the one the
 * game is pinning with — the hand placed on `grab_reach` — but that pose has the
 * arm thrown out straight, and on Sukuna and Momo it lands 100px BEYOND the edge
 * of the hold's own picture. A handle that opens off the drawing is a handle
 * nobody can read. So the guess is the same one the sprite workbench's handle
 * opens at (`anchorLocal`, the frontmost pixel at chest height) and the borrowed
 * number is said in words instead, where it belongs.
 */
function startingPoint(charKey) {
  const frame = frameOf(charKey);
  const local = anchorLocal(charKey, frame, ANCHOR);
  const placed = hasAnchor(charKey, frame, ANCHOR);
  const g = local && imageToGame(charKey, frame, local[0], local[1]);
  const b = bodyMetrics(charKey);
  const borrowed = holdGapOf(charKey, charKey);
  return {
    x: Math.round(g ? g.x : b.reach * 0.6),
    y: Math.round(g ? g.y : -b.height * 0.45),
    source: placed ? "placed on this drawing"
      : borrowed.handFrom === "grabReach"
        ? `the game is using the reach's hand, ${Math.round(borrowed.hand)}px out`
        : "nothing placed",
  };
}

export async function provider() {
  const tasks = CHARACTER_KEYS
    .filter((key) => frameOf(key))
    .sort(byCharacterName)
    .map((charKey) => {
      const start = startingPoint(charKey);
      return {
        id: `grip/${charKey}`,
        title: charKey,
        subtitle: committed({ charKey }) ? "already placed" : start.source,
        charKey,
        state: STATE,
        frame: frameOf(charKey),
        exportKeys: { char: charKey, frame: frameOf(charKey) },
      };
    });

  return {
    tasks,
    fingerprint: fingerprint(),
    initialValue: (task) => {
      const p = startingPoint(task.charKey);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    },
    describe(task, value) {
      const held = holdGapOf(task.charKey, task.charKey);
      const chest = Number.isFinite(held.hand) ? held.hand - held.gap : null;
      const gap = chest === null ? null : Math.round(value.x - chest);
      const b = bodyMetrics(task.charKey);
      // WHAT THE NUMBER MEANS, including when it is nonsense. The handle opens
      // at the drawing's own default, which is the centre of mass at chest
      // height — near the centre LINE, so the gap it implies starts at about
      // zero and the two bodies start inside each other. Reading "-1px apart"
      // with no explanation looks like a broken guide rather than an unplaced
      // point, so it says which it is.
      const stand = gap === null ? ""
        : gap < b.width * 0.5
          ? ` — at <b>${gap}px</b> apart the two bodies would overlap; the fist `
            + "has to be out in front of this one"
          : ` — the two fighters would stand <b>${gap}px</b> apart`;
      return `${task.subtitle} · <b>x ${value.x}</b>, <b>y ${value.y}</b>${stand}`
        + "<br>Put it on the hand that has hold of them, at the depth the fist "
        + "actually closes. The body being held moves with it.";
    },
    renderEditor(task, { container, value, onChange, redraw, bindSync }) {
      container.replaceChildren();
      frameStepper(container, task, redraw);
      pointEditor(container, task.charKey, value, onChange, bindSync);
    },
    onCanvasDrag: (task, pt) => toGame(pt, task),
    draw(task, { ctx, canvas, value, redraw }) {
      drawStage(task, { ctx, canvas, redraw, guides: { hurtbox: true } });
      const b = bodyMetrics(task.charKey);
      const held = holdGapOf(task.charKey, task.charKey);
      const chest = Number.isFinite(held.hand) ? held.hand - held.gap : 0;
      // THE OTHER BODY, WHERE THIS POINT WOULD PUT IT. The whole reason the
      // answer matters: drag the hand and the fighter being held moves with it,
      // because the gap IS hand minus chest. A guide that stood still while the
      // thing it depends on moved would be a picture of the old answer.
      const gap = value.x - chest;
      const x0 = CENTRE_X + (gap - b.width / 2) * ZOOM;
      ctx.strokeStyle = "rgba(255, 120, 90, 0.55)";
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(x0, GROUND_Y - b.height * ZOOM, b.width * ZOOM, b.height * ZOOM);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 140, 110, 0.9)";
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText(`the fighter held · ${Math.round(gap)}px away`, x0, GROUND_Y - b.height * ZOOM - 6);
      const p = toCanvas(value, task);
      marker(ctx, p.x, p.y, "rgba(120, 240, 255, 0.95)");
      caption(ctx, canvas, "where does this fist have hold of them?");
      ctx.fillText("drag to place", 10, canvas.height - 10);
    },
    ensureReady: ensureTaskArt,
    committed,
    exportBlock,
  };
}

/**
 * A SPRITE-ADJUSTMENT PAYLOAD, not a config block of this queue's own.
 *
 * Every other set here files into a config file under `src/`. This one must not:
 * the value already has a home, `meta.anchors.grabHand` in the sprite manifest,
 * and a second one would be the duplicate that rots. So the export is exactly
 * what the sprite workbench exports, applied by the same tool — one field, one
 * writer, and both benches read it back.
 */
function exportBlock(decisions) {
  const payloads = [];
  const flagged = [];
  for (const d of decisions) {
    if (d.status === "skipped") continue;
    if (d.status === "rejected") {
      flagged.push(`${d.char}/${d.frame}: ${d.note || "flagged, no note"}`);
      continue;
    }
    if (!d.frame) continue;
    // Back into the drawing's own pixels: an anchor is a claim about the
    // artwork, so it has to survive the sprite being nudged or resized.
    const img = gameToImage(d.char, d.frame, d.value.x, d.value.y);
    if (!img) continue;
    payloads.push({
      character: d.char,
      adjustments: {
        [d.frame]: { anchors: { [ANCHOR]: [Math.round(img.x * 10) / 10,
                                           Math.round(img.y * 10) / 10] } },
      },
    });
  }
  return {
    file: "grab-grip.json",
    note: "save it and run `python3 tools/apply_sprite_adjustments.py <file>` — the same "
      + "tool the sprite workbench's export goes through, writing the same anchor",
    text: JSON.stringify(payloads, null, 1)
      + (flagged.length ? `\n\n// flagged, needing a fix at the source:\n// ${flagged.join("\n// ")}\n` : ""),
  };
}
