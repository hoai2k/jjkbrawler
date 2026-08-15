// Shared parts for verification task sets.
//
// Most of what these sets do is the same job with a different question: put a
// fighter's own drawing on the canvas, put a claim on top of it, and let a
// person move the claim. This module owns that job so a provider is only the
// part that differs — which items, which drawing, which claim.
//
// COORDINATES. Every set here works in GAME PIXELS relative to the fighter:
// `x` forward from the centre line, `y` from the foot line with up negative —
// the frame `moves.js` writes `oy: -92` in, and the frame every config these
// sets export is read in. `drawCharFrame` at the actor's own scale already
// draws a fighter at their game size, so the only conversion is the bench
// ZOOM, applied to the art scale and to every overlay together.

import { loadFrame, frameKeys } from "../src/assets.js";
import { currentFrame, drawCharFrame } from "../src/render_backend.js";
import { resolvedAnim } from "../sprites/src/sprites.js";
import { getActor } from "../src/characters.js";
import { bodyMetrics } from "../src/silhouette.js";
import { HURTBOX } from "../src/constants.js";
import { COM_BODY_FRAC } from "../src/config_tuning.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";

export const ZOOM = 1.7;
export const GROUND_Y = 430;
export const CENTRE_X = 180;

export const artScaleFor = (charKey) => (getActor(charKey)?.scale || 1) * ZOOM;

/** Game-space point -> canvas point, and back. The only conversion in play. */
export const toCanvas = (p) => ({ x: CENTRE_X + p.x * ZOOM, y: GROUND_Y + p.y * ZOOM });
export const toGame = (p) => ({
  x: Math.round((p.x - CENTRE_X) / ZOOM),
  y: Math.round((p.y - GROUND_Y) / ZOOM),
});

// ------------------------------------------------------------------ frames

/** Which drawing a reviewer is looking at, per task. A VIEW, not a decision:
 *  never part of a value and never exported. */
const FRAME_VIEW = new Map();

/** The frame a state's contact beat falls on — the strike, not the wind-up.
 *  Rounded rather than floored because `beat` sits exactly on the boundary
 *  between the two (states.js derives it from the sheet's own fps), and the
 *  wrong side of that rounding shows a fighter with their fists still up. */
export function contactIndex(charKey, state) {
  const anim = resolvedAnim(charKey, state);
  const beat = STATES[clipNameFor(state)]?.beat;
  if (!anim?.fps || !anim.frames?.length) return 0;
  if (beat === undefined) return 0;
  return Math.min(anim.frames.length - 1, Math.round(beat * anim.fps));
}

export function frameIndex(task) {
  const held = FRAME_VIEW.get(task.id);
  return held === undefined ? contactIndex(task.charKey, task.state) : held;
}

export function setFrameIndex(task, i) {
  FRAME_VIEW.set(task.id, i);
}

/** The prev / next / contact stepper, for a state drawn from several frames.
 *  Appends nothing when there is only one drawing to look at. */
export function frameStepper(container, task, redraw) {
  const frames = resolvedAnim(task.charKey, task.state)?.frames || [];
  if (frames.length < 2) return;
  const idx = frameIndex(task);
  const home = contactIndex(task.charKey, task.state);
  const wrap = document.createElement("div");
  wrap.className = "group";
  wrap.innerHTML = `
    <label>Frame <span class="sub">${idx + 1} of ${frames.length} — ${frames[idx]}${
      idx === home ? " (contact)" : ""}</span></label>
    <div class="v-nav v-nav--wrap">
      <button class="ghost sm" data-step="-1" type="button">‹ prev</button>
      <button class="ghost sm" data-step="1" type="button">next ›</button>
      <button class="ghost sm" data-step="0" type="button">contact</button>
    </div>`;
  for (const btn of wrap.querySelectorAll("[data-step]")) {
    btn.addEventListener("click", () => {
      const step = Number(btn.dataset.step);
      setFrameIndex(task, step === 0 ? home : (frameIndex(task) + step + frames.length) % frames.length);
      redraw?.();
    });
  }
  container.appendChild(wrap);
}

const ready = new Set();      // characters whose art is in memory
const inFlight = new Map();   // charKey -> the one load promise

/**
 * Pull a character's frames into memory. Resolves true when the art arrived
 * on THIS call's watch — so a caller repaints when there is a reason to, and
 * only then.
 *
 * The in-flight map is the whole point, and its absence was a bug you could
 * see: an earlier version marked the character loaded BEFORE awaiting, so a
 * second draw during the load — and there is always a second draw, because
 * selecting an item renders the editor and the canvas — was told "nothing
 * new" and scheduled no repaint. The load then finished with nobody
 * listening, and the canvas sat on "loading art…" until something else
 * repainted it. Switching away and back worked because by then the art was
 * in memory and the first draw succeeded.
 *
 * Now every caller that arrives mid-load gets the SAME promise and all of
 * them resolve true together, so whichever draw was last still repaints.
 */
export function ensureFrames(charKey) {
  if (ready.has(charKey)) return Promise.resolve(false);
  let load = inFlight.get(charKey);
  if (!load) {
    load = Promise.all(frameKeys(charKey).map((k) => loadFrame(charKey, k).catch(() => {})))
      .then(() => {
        ready.add(charKey);
        inFlight.delete(charKey);
        return true;
      });
    inFlight.set(charKey, load);
  }
  return load;
}

// ------------------------------------------------------------------ canvas

/**
 * The stage every sprite-based set draws on: background, ground line, centre
 * line, the fighter, and the reference marks that say what the numbers mean.
 *
 * `opts.guides` picks which references to show — a set about the centre of
 * mass wants the hurtbox and the COM line, one about a muzzle does not care
 * about either. Returns false when the art was not in memory (it asks for it
 * and the caller repaints).
 */
export function drawStage(task, { ctx, canvas, guides = {}, redraw }) {
  const { charKey, state } = task;
  const b = bodyMetrics(charKey);

  ctx.fillStyle = "#0d1018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(130, 150, 205, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y);
  ctx.moveTo(CENTRE_X, 0); ctx.lineTo(CENTRE_X, canvas.height);
  ctx.stroke();

  // The drawing, asked for by INDEX and sampled mid-frame — see contactIndex.
  const anim = resolvedAnim(charKey, state);
  const idx = frameIndex(task);
  const t = anim?.fps ? (idx + 0.5) / anim.fps : 0;
  const frame = currentFrame(charKey, state, t);
  const drew = drawCharFrame(ctx, charKey, frame, CENTRE_X, GROUND_Y,
    { scale: artScaleFor(charKey), facing: 1 });
  if (!drew) {
    // The engine has already asked for this art and will repaint when it
    // lands (verification.js renderCurrent) — this only says so meanwhile.
    ctx.fillStyle = "#9aa4c0";
    ctx.font = "13px system-ui";
    ctx.fillText("loading art…", CENTRE_X - 34, GROUND_Y - 60);
  }

  if (guides.hurtbox) {
    const boxH = b.height * HURTBOX.standH * ZOOM;
    const boxW = b.width * ZOOM;
    ctx.strokeStyle = "rgba(255,255,255,0.30)";
    ctx.strokeRect(CENTRE_X - boxW / 2, GROUND_Y - boxH, boxW, boxH);
  }
  if (guides.com) {
    const y = GROUND_Y - b.height * COM_BODY_FRAC * ZOOM;
    ctx.strokeStyle = "rgba(160, 170, 190, 0.55)";
    ctx.beginPath();
    ctx.moveTo(CENTRE_X - 9, y); ctx.lineTo(CENTRE_X + 9, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(160, 170, 190, 0.75)";
    ctx.font = "10px system-ui";
    ctx.fillText("COM 0.55", CENTRE_X + 13, y + 3);
  }
  if (guides.reach) {
    const x = CENTRE_X + b.reach * ZOOM;
    ctx.strokeStyle = "rgba(255, 190, 90, 0.5)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y - b.height * ZOOM); ctx.lineTo(x, GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  return drew;
}

export function marker(ctx, x, y, color, r = 9) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r - 4, y); ctx.lineTo(x + r + 4, y);
  ctx.moveTo(x, y - r - 4); ctx.lineTo(x, y + r + 4);
  ctx.stroke();
}

/** A horizontal rule across the stage, for a claim that is a HEIGHT rather
 *  than a point (the centre of mass). */
export function heightLine(ctx, canvas, y, color, label) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(30, y); ctx.lineTo(canvas.width - 30, y);
  ctx.stroke();
  if (label) {
    ctx.fillStyle = color;
    ctx.font = "11px system-ui";
    ctx.fillText(label, 34, y - 5);
  }
}

export const caption = (ctx, canvas, text) => {
  ctx.fillStyle = "#9aa4c0";
  ctx.font = "11px system-ui";
  ctx.fillText(text, 10, 16);
};

// ------------------------------------------------------------------ editor

/**
 * A labelled slider tied to a number box, the pattern every bench in this repo
 * uses. `onCommit` fires on both.
 *
 * Returns `{ el, set }`. `set(v)` moves the control WITHOUT firing onCommit —
 * that is how a slider follows a corner dragged on the canvas without the two
 * shouting the value back and forth at each other. It is also why the editor
 * no longer has to be rebuilt on every change, which is what the sliders were
 * paying for in lag.
 *
 * `unit` because these sets no longer only measure pixels: a hurtbox fit is a
 * multiplier and reading "1.05 px" off it was worse than reading nothing.
 */
export function slider(container, { label, hint, min, max, step = 1, value, unit = "px" }, onCommit) {
  const wrap = document.createElement("div");
  wrap.className = "group";
  wrap.innerHTML = `
    <label>${label} <span class="sub">${hint || ""}</span></label>
    <div class="slider-row">
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      <input type="number" class="num" step="${step}" value="${value}">
      <span class="unit">${unit}</span>
    </div>`;
  const [range, num] = wrap.querySelectorAll("input");
  const round = (v) => (step < 1 ? Number(Number(v).toFixed(3)) : Math.round(Number(v)));
  const push = (v) => {
    const n = round(v);
    if (!Number.isFinite(n)) return;
    range.value = n; num.value = n;
    onCommit(n);
  };
  range.addEventListener("input", (e) => push(e.target.value));
  num.addEventListener("change", (e) => push(e.target.value));
  container.appendChild(wrap);
  return {
    el: wrap,
    set(v) {
      const n = round(v);
      if (!Number.isFinite(n) || n === round(range.value)) return;
      range.value = n; num.value = n;
    },
  };
}

/**
 * The two sliders a point-placing set wants.
 *
 * Each emits a SINGLE-KEY PATCH rather than a whole value. The editor is not
 * rebuilt between changes any more, so `value` here is the value as of the
 * last rebuild — spreading it would carry a stale sibling axis back over a
 * fresh one, and dragging Forward would quietly undo Height.
 */
export function pointEditor(container, charKey, value, onChange, bindSync) {
  const b = bodyMetrics(charKey);
  const x = slider(container, {
    label: "Forward", hint: "from the centre line, along the facing",
    min: -Math.round(b.width), max: Math.round(Math.max(b.reach * 2.2, b.width * 3)),
    value: value.x,
  }, (v) => onChange({ x: v }));
  const y = slider(container, {
    label: "Height", hint: "from the foot line; up is negative",
    min: -Math.round(b.height * 1.3), max: 0, value: value.y,
  }, (v) => onChange({ y: v }));
  bindSync?.((v) => { x.set(v.x); y.set(v.y); });
}

/**
 * THE FRAMEWORK HOOK. Everything a task needs in memory before it can be
 * drawn — for every sprite-backed set, that is its character's frames.
 *
 * Providers export this as `ensureReady` and do nothing else about loading:
 * the ENGINE calls it for the item on screen and repaints when it resolves,
 * and calls it again for the neighbours to warm them. Leaving it to each
 * provider is how the canvas ended up stuck on "loading art…" in the sets
 * whose draw function forgot to ask.
 *
 * Resolves true when art arrived on this call's watch, false when there was
 * nothing to wait for — which is what stops the engine repainting forever.
 */
export const ensureTaskArt = (task) =>
  (task?.charKey ? ensureFrames(task.charKey) : Promise.resolve(false));


/** A read-only line of context above the editor. */
export const describeXY = (charKey, value, source) => {
  const b = bodyMetrics(charKey);
  return `${source} · <b>x ${value.x}</b>, <b>y ${value.y}</b> — `
    + `${(-value.y / b.height * 100).toFixed(0)}% of height up`;
};
