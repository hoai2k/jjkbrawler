// HURTBOX FIT — does the box you can be hit on cover the body that is drawn?
//
// One item per fighter per state. The box is derived (combat.js hurtbox, from
// bodyMetrics and the HURTBOX fractions), and most of it is measured from the
// art — but the fractions themselves are roster-wide judgements, and three of
// the states are recent enough that nobody has looked at them across the
// roster: the airborne box, the tumble box, and the measured crouch that
// replaced a flat assumption.
//
// The question here is not "is this pretty" but "can this fighter be hit
// where they look like they are, and NOT where they don't". Two failures
// matter and they are different: box larger than the body is a fighter being
// hit out of thin air, box smaller is attacks passing visibly through them.
//
// AN EDIT MOVES FOUR EDGES, from four numbers: `w` and `h` scale the derived
// size, `dx` and `dy` shift the whole box. Size alone was not enough — plenty
// of drawings sit OFF-CENTRE in their cell (a fighter leaning, a stance with
// the weight on one leg), and a box that could only be grown about a fixed
// centre had to swell on both sides to cover a body that had moved to one.
// That is a fighter being hit out of thin air on the empty side, bought to fix
// the other. Shifting costs nothing and covers exactly the body that is there.
//
// Everything is a FRACTION of the derived box rather than a pixel count, for
// the reason config_body_points.js gives: the derived box tracks the art, so a
// fighter whose sprites are redrawn keeps a correct fit. A pixel offset would
// freeze the decision at whatever the drawing was on the day somebody looked.
//
// DRAG THE BOX, don't reach for the sliders. Any corner resizes about the
// opposite one — so a single corner can fix a body that overhangs on one side
// without touching the other three edges — and a grab anywhere inside moves
// the whole box. The sliders are still there for a number somebody wants
// exact.

import { resolvedAnim } from "../sprites/src/sprites.js";
import { CHARACTER_KEYS } from "../src/characters.js";
import { HURTBOX_FIT } from "../src/config_body_points.js";
import { bodyMetrics } from "../src/silhouette.js";
import { HURTBOX } from "../src/constants.js";
import {
  ZOOM, GROUND_Y, CENTRE_X, drawStage, caption, slider, frameStepper,
  ensureTaskArt,
} from "./verify_common.js";

/** The states whose box the game actually builds, with the drawing that shows
 *  the body in it. `tumble` reuses the air art: it is the same body, spun. */
const CASES = [
  { key: "stand", state: "idle", label: "standing" },
  { key: "crouch", state: "crouch", label: "ducking" },
  { key: "air", state: "fall", label: "airborne" },
  { key: "hurt", state: "hurt", label: "reeling" },
  { key: "prone", state: "prone", label: "flat out" },
  { key: "ledge", state: "ledge", label: "hanging" },
];

/** How close a pointer has to be to a corner to have grabbed it rather than
 *  the box. Generous: these are 1.5px strokes on a busy canvas. */
const HANDLE = 13;

const r3 = (n) => Number(n.toFixed(3));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export async function provider() {
  const tasks = [];
  for (const charKey of CHARACTER_KEYS) {
    const b = bodyMetrics(charKey);
    for (const c of CASES) {
      if (!resolvedAnim(charKey, c.state)?.frames?.length) continue;
      tasks.push({
        id: `fit/${charKey}/${c.key}`,
        title: `${charKey} · ${c.label}`,
        subtitle: HURTBOX_FIT[charKey]?.[c.key] ? "already adjusted" : describeSource(c.key, b),
        charKey,
        state: c.state,
        caseKey: c.key,
        exportKeys: { char: charKey, case: c.key },
      });
    }
  }
  return {
    tasks,
    fingerprint: `fit-${CHARACTER_KEYS.length}-${Object.keys(HURTBOX).length}`,
    initialValue: (task) => {
      const f = HURTBOX_FIT[task.charKey]?.[task.caseKey];
      return {
        w: f?.w ?? 1, h: f?.h ?? 1, dx: f?.dx ?? 0, dy: f?.dy ?? 0,
      };
    },
    describe(task, value) {
      const base = baseBox(task);
      const px = `<b>${Math.round(base.w * value.w)}×${Math.round(base.h * value.h)}px</b>`;
      const moved = value.dx || value.dy;
      const sized = value.w !== 1 || value.h !== 1;
      if (!moved && !sized) return `${task.subtitle} · ${px} — as derived`;
      const parts = [];
      if (sized) parts.push(`×${value.w.toFixed(2)}, ×${value.h.toFixed(2)}`);
      if (moved) {
        parts.push(`moved ${Math.round(value.dx * base.w)}px forward, `
          + `${Math.round(value.dy * base.h)}px up`);
      }
      return `${task.subtitle} · ${px} — ${parts.join(" · ")}`;
    },
    renderEditor(task, { container, value, onChange, redraw, bindSync }) {
      container.replaceChildren();
      frameStepper(container, task, redraw);
      const w = slider(container, {
        label: "Width", hint: "× the derived width", min: 0.4, max: 1.8,
        step: 0.01, value: value.w, unit: "×",
      }, (v) => onChange({ w: v }));
      const h = slider(container, {
        label: "Height", hint: "× the derived height", min: 0.4, max: 1.8,
        step: 0.01, value: value.h, unit: "×",
      }, (v) => onChange({ h: v }));
      const dx = slider(container, {
        label: "Shift forward", hint: "× the derived width; negative is back",
        min: -0.6, max: 0.6, step: 0.01, value: value.dx, unit: "×",
      }, (v) => onChange({ dx: v }));
      const dy = slider(container, {
        label: "Shift up", hint: "× the derived height; negative sinks it",
        min: -0.6, max: 0.6, step: 0.01, value: value.dy, unit: "×",
      }, (v) => onChange({ dy: v }));
      bindSync((v) => { w.set(v.w); h.set(v.h); dx.set(v.dx); dy.set(v.dy); });
      const p = document.createElement("p");
      p.className = "legend";
      p.innerHTML = "<b>Drag the cyan box</b> — a corner resizes about the opposite "
        + "one, anywhere inside moves the whole box. The sliders are for a number "
        + "you want exact.";
      container.appendChild(p);
    },
    onCanvasDrag,
    draw(task, { ctx, canvas, value, redraw }) {
      drawStage(task, { ctx, canvas, redraw, guides: {} });
      const g = geom(task, value);
      // The derived box, ghosted, and the adjusted one over it.
      strokeBox(ctx, { left: CENTRE_X - g.bw / 2, right: CENTRE_X + g.bw / 2,
                       top: g.baseBottom - g.bh, bottom: g.baseBottom },
        "rgba(255,255,255,0.22)");
      strokeBox(ctx, g, "rgba(120, 240, 255, 0.9)");
      handles(ctx, g);
      caption(ctx, canvas,
        `${task.caseKey} box · white = derived · cyan = what would ship`);
      ctx.fillText("drag a corner to resize, the middle to move — "
        + "does it cover the body, and nothing that is not the body?",
        10, canvas.height - 10);
    },
    ensureReady: ensureTaskArt,
    committed: (task) => HURTBOX_FIT[task.charKey]?.[task.caseKey] !== undefined,
    exportBlock,
  };
}

function describeSource(key, b) {
  if (key === "crouch") return `measured crouch ${(b.crouch).toFixed(2)} of height`;
  if (key === "air") return `measured air ${(b.air ?? 0.78).toFixed(2)} of height`;
  return "derived from the fractions";
}

/** The box combat.js would build for this case, in game px, as
 *  { w, h, top } where `top` is px above the foot line. */
function baseBox(task) {
  const b = bodyMetrics(task.charKey);
  const H = b.height, W = b.width;
  switch (task.caseKey) {
    case "crouch": return { w: W * HURTBOX.crouchW, h: H * b.crouch, top: H * b.crouch };
    case "air": {
      const h = H * (b.air ?? HURTBOX.airH);
      return { w: W, h, top: h };
    }
    case "hurt": return { w: W * HURTBOX.hurtW, h: H * HURTBOX.hurtH, top: H * HURTBOX.hurtH };
    case "prone": return { w: H * HURTBOX.proneW, h: H * HURTBOX.proneH, top: H * HURTBOX.proneH };
    case "ledge": return { w: W * HURTBOX.ledgeW, h: H * HURTBOX.ledgeH, top: H * HURTBOX.ledgeTop };
    default: return { w: W, h: H * HURTBOX.standH, top: H * HURTBOX.standH };
  }
}

// ------------------------------------------------------------ box geometry
//
// One place that knows how a value becomes four canvas edges, and one that
// knows how four edges become a value. Everything else — drawing, hit-testing
// the handles, dragging — goes through these, so there is a single definition
// of what `dx` means and no chance of the drag and the paint disagreeing.

/** Value -> canvas edges, plus the derived box the value is relative to. */
function geom(task, value) {
  const base = baseBox(task);
  const bw = base.w * ZOOM;
  const bh = base.h * ZOOM;
  // The derived box is anchored on its own BOTTOM edge, which is where
  // combat.js hangs it: `top` px above the foot line, `h` px tall.
  const baseBottom = GROUND_Y - (base.top - base.h) * ZOOM;
  const w = bw * (value.w ?? 1);
  const h = bh * (value.h ?? 1);
  const cx = CENTRE_X + (value.dx || 0) * bw;
  const bottom = baseBottom - (value.dy || 0) * bh;
  return {
    base, bw, bh, baseBottom,
    left: cx - w / 2, right: cx + w / 2, top: bottom - h, bottom,
  };
}

/** Canvas edges -> value. The inverse of `geom`, and the only place a drag
 *  turns back into numbers somebody has to live with. */
function toValue(g, { left, right, top, bottom }) {
  const w = Math.max(8, right - left);
  const h = Math.max(8, bottom - top);
  return {
    w: clamp(r3(w / g.bw), 0.2, 3),
    h: clamp(r3(h / g.bh), 0.2, 3),
    dx: clamp(r3(((left + right) / 2 - CENTRE_X) / g.bw), -1.5, 1.5),
    dy: clamp(r3((g.baseBottom - bottom) / g.bh), -1.5, 1.5),
  };
}

const CORNERS = [
  ["tl", (g) => ({ x: g.left, y: g.top })],
  ["tr", (g) => ({ x: g.right, y: g.top })],
  ["bl", (g) => ({ x: g.left, y: g.bottom })],
  ["br", (g) => ({ x: g.right, y: g.bottom })],
];

/** What the pointer took hold of on the way down, and where it took hold of
 *  it. Module-level because a drag outlives any one call. */
let grab = null;

function onCanvasDrag(task, pt, { value, phase }) {
  const g = geom(task, value);
  if (phase === "start") {
    grab = null;
    let best = HANDLE;
    for (const [id, at] of CORNERS) {
      const c = at(g);
      const d = Math.hypot(pt.x - c.x, pt.y - c.y);
      if (d <= best) { best = d; grab = { corner: id }; }
    }
    // Not a corner — inside is a wholesale move, and the grab point is kept
    // so the box does not jump to centre itself under the pointer.
    if (!grab && pt.x >= g.left && pt.x <= g.right && pt.y >= g.top && pt.y <= g.bottom) {
      grab = { move: true, ox: pt.x - (g.left + g.right) / 2, oy: pt.y - g.bottom };
    }
    // A click on empty canvas changes nothing: this set's value is a box, not
    // a point, so there is no sensible "place it here".
    return undefined;
  }
  if (!grab) return undefined;
  const next = grab.move
    ? moveTo(g, pt)
    : resizeCorner(g, pt, grab.corner);
  if (phase === "end") grab = null;
  return next;
}

function moveTo(g, pt) {
  const cx = pt.x - grab.ox;
  const bottom = pt.y - grab.oy;
  const w = g.right - g.left;
  return toValue(g, { left: cx - w / 2, right: cx + w / 2,
                      top: bottom - (g.bottom - g.top), bottom });
}

/** Move the two edges that meet at `corner`, leaving the other two exactly
 *  where they are. That is what makes a lopsided body fixable without paying
 *  for it on the opposite side — the thing four symmetric multipliers could
 *  never express. */
function resizeCorner(g, pt, corner) {
  const e = { left: g.left, right: g.right, top: g.top, bottom: g.bottom };
  if (corner === "tl" || corner === "bl") e.left = Math.min(pt.x, e.right - 8);
  else e.right = Math.max(pt.x, e.left + 8);
  if (corner === "tl" || corner === "tr") e.top = Math.min(pt.y, e.bottom - 8);
  else e.bottom = Math.max(pt.y, e.top + 8);
  return toValue(g, e);
}

// ---------------------------------------------------------------- painting

function strokeBox(ctx, { left, right, top, bottom }, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left, top, right - left, bottom - top);
}

/** The corners, drawn. A drag target nobody can see is a feature nobody
 *  finds — the sliders stayed the only way to resize for exactly that
 *  reason. */
function handles(ctx, g) {
  ctx.fillStyle = "rgba(120, 240, 255, 0.9)";
  ctx.strokeStyle = "rgba(10, 14, 22, 0.9)";
  ctx.lineWidth = 1;
  for (const [, at] of CORNERS) {
    const c = at(g);
    ctx.fillRect(c.x - 4, c.y - 4, 8, 8);
    ctx.strokeRect(c.x - 4, c.y - 4, 8, 8);
  }
}

// ------------------------------------------------------------------ export

/** A fit worth writing down. An approve at 1×1 with no shift is recorded
 *  anyway — see the note in the block — but the offsets are only emitted when
 *  they are non-zero, so an unshifted fit reads exactly as it always did. */
function fitLiteral(v) {
  const parts = [`w: ${v.w}`, `h: ${v.h}`];
  if (v.dx) parts.push(`dx: ${v.dx}`);
  if (v.dy) parts.push(`dy: ${v.dy}`);
  return `{ ${parts.join(", ")} }`;
}

function exportBlock(decisions) {
  const byChar = new Map();
  const flagged = [];
  for (const d of decisions) {
    if (d.status === "skipped") continue;
    if (d.status === "rejected") {
      flagged.push(`//   ${d.char}.${d.case}: ${d.note || "flagged, no note"}`);
      continue;
    }
    // An approve at 1,1 IS recorded, as 1x1. It costs nothing — a multiplier
    // of one is a no-op, so the box goes on tracking the art exactly as it
    // did — and it is what makes "somebody looked at this and it was right"
    // a fact the queue can see, instead of a review that has to be done again
    // every time the bench is opened.
    if (!byChar.has(d.char)) byChar.set(d.char, []);
    byChar.get(d.char).push(d);
  }
  // Committed fits first, so the block replaces the file cleanly.
  for (const [char, held] of Object.entries(HURTBOX_FIT)) {
    if (byChar.has(char)) continue;
    byChar.set(char, Object.entries(held).map(([c, v]) => ({ char, case: c, value: v })));
  }
  const lines = [];
  for (const [char, list] of [...byChar].sort()) {
    lines.push(`  ${JSON.stringify(char)}: { `
      + list.map((d) => `${d.case}: ${fitLiteral({
        w: d.value.w ?? 1, h: d.value.h ?? 1, dx: d.value.dx ?? 0, dy: d.value.dy ?? 0,
      })}`).join(", ") + ` },`);
  }
  return {
    file: "src/config_body_points.js",
    note: "replaces HURTBOX_FIT. A box approved as-derived is recorded at 1x1 — "
      + "a no-op multiplier that still says somebody checked it. `dx`/`dy` appear "
      + "only where the box was shifted off the derived centre.",
    text: `export const HURTBOX_FIT = {\n${lines.join("\n")}\n};\n`
      + (flagged.length ? `\n// Flagged — a fix at the source:\n${flagged.join("\n")}\n` : ""),
  };
}
