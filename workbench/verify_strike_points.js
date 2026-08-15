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
//   tasks          [{ id, title, subtitle, exportKeys? }]
//   fingerprint    changes when the underlying measurements do, so a re-bake
//                  starts a clean queue instead of restoring stale decisions
//   initialValue(task)              -> the value before any human touched it
//   describe(task, value)           -> the line above the editor (HTML)
//   renderEditor(task, ctx)         -> build controls into ctx.container
//   draw(task, ctx)                 -> paint the canvas
//   onCanvasDrag(task, pt, ctx)     -> optional; return a new value
//   exportBlock(decisions)          -> optional; paste-ready config text

import { loadFrame, frameKeys } from "../src/assets.js";
import { currentFrame, drawCharFrame } from "../src/render_backend.js";
import { resolvedAnim } from "../sprites/src/sprites.js";
import { CHARACTER_KEYS, getActor } from "../src/characters.js";
import { MODEL_REACH, ENVELOPE_INPUTS } from "../src/config_model_reach.js";
import { STRIKE_POINTS } from "../src/config_strike_points.js";
import { bodyMetrics } from "../src/silhouette.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";
import { HURTBOX } from "../src/constants.js";
import { COM_BODY_FRAC } from "../src/config_tuning.js";

/** The attacks worth checking, in the order somebody would want to walk them:
 *  the two everything else is judged against first. */
const STATES_TO_CHECK = [
  "light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack", "airLight",
];

const GROUND_Y = 430;   // the foot line on this bench's canvas
const CENTRE_X = 180;   // the fighter's centre line
// How much bigger than life the bench draws. `drawCharFrame` at the actor's
// own scale puts a fighter on screen at their GAME size — a 136 px Yuji is
// 136 canvas px — which is too small to place a fist on with any confidence.
// The zoom multiplies the draw scale and every overlay together, so a canvas
// pixel is a fixed fraction of a game pixel and the numbers in the editor
// stay the numbers that ship.
const ZOOM = 1.7;

export async function provider() {
  const tasks = [];
  for (const charKey of CHARACTER_KEYS) {
    for (const state of STATES_TO_CHECK) {
      // Only states this fighter actually draws: a character whose sheet has
      // no art for a state would be a blank canvas and an unanswerable
      // question.
      if (!resolvedAnim(charKey, state)?.frames?.length) continue;
      tasks.push({
        id: `${charKey}/${state}`,
        title: `${charKey} · ${state}`,
        subtitle: sourceOf(charKey, state),
        charKey,
        state,
        exportKeys: { char: charKey, state },
      });
    }
  }

  return {
    tasks,
    fingerprint: `${ENVELOPE_INPUTS.manifest}-${ENVELOPE_INPUTS.poses}-${ENVELOPE_INPUTS.sprites}`,
    initialValue,
    describe,
    renderEditor,
    draw,
    onCanvasDrag,
    exportBlock,
  };
}

/** Where the value on screen came from before anybody touched it. */
function sourceOf(charKey, state) {
  if (STRIKE_POINTS[charKey]?.[state]) return "already verified in config";
  const m = MODEL_REACH[charKey]?.states?.[state];
  if (m && Number.isFinite(m.sx)) return m.via === "prop" ? "measured — weapon" : "measured — limb";
  return "derived from body (no rig)";
}

function initialValue(task) {
  const { charKey, state } = task;
  const human = STRIKE_POINTS[charKey]?.[state];
  if (human) return { x: human.x, y: human.y };
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

// ------------------------------------------------------------------ editor

function renderEditor(task, { container, value, onChange, redraw }) {
  const b = bodyMetrics(task.charKey);
  container.replaceChildren();

  // WHICH DRAWING IS ON SCREEN. The point is a claim about the contact
  // frame, and that is what the bench opens on — but the neighbours are how
  // you tell a fist at full extension from one still travelling, so they are
  // a click away. Frame choice is a view, not a decision: it is not part of
  // the value and it is not exported.
  const frames = resolvedAnim(task.charKey, task.state)?.frames || [];
  if (frames.length > 1) {
    const wrap = document.createElement("div");
    wrap.className = "group";
    const idx = frameIndex(task);
    wrap.innerHTML = `
      <label>Frame <span class="sub">${idx + 1} of ${frames.length} — ${frames[idx]}${
        idx === contactIndex(task) ? " (contact)" : ""}</span></label>
      <div class="v-nav v-nav--wrap">
        <button class="ghost sm" data-step="-1" type="button">‹ prev</button>
        <button class="ghost sm" data-step="1" type="button">next ›</button>
        <button class="ghost sm" data-step="0" type="button">contact</button>
      </div>`;
    for (const btn of wrap.querySelectorAll("[data-step]")) {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.step);
        FRAME_VIEW.set(task.id, step === 0
          ? contactIndex(task)
          : (frameIndex(task) + step + frames.length) % frames.length);
        redraw?.();
      });
    }
    container.appendChild(wrap);
  }

  const mk = (label, key, min, max, hint) => {
    const wrap = document.createElement("div");
    wrap.className = "group";
    wrap.innerHTML = `
      <label>${label} <span class="sub">${hint}</span></label>
      <div class="slider-row">
        <input type="range" min="${min}" max="${max}" step="1" value="${value[key]}">
        <input type="number" class="num" step="1" value="${value[key]}">
        <span class="unit">px</span>
      </div>`;
    const [range, num] = wrap.querySelectorAll("input");
    const push = (v) => {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return;
      range.value = n; num.value = n;
      onChange({ ...value, [key]: n });
    };
    range.addEventListener("input", (e) => push(e.target.value));
    num.addEventListener("change", (e) => push(e.target.value));
    container.appendChild(wrap);
  };
  mk("Forward", "x", -40, Math.round(b.reach * 2.2) || 220,
    "from the centre line, along the facing");
  mk("Height", "y", -Math.round(b.height * 1.25), 0,
    "from the foot line; up is negative");
}

function onCanvasDrag(task, pt) {
  return {
    x: Math.round((pt.x - CENTRE_X) / ZOOM),
    y: Math.round((pt.y - GROUND_Y) / ZOOM),
  };
}

// ------------------------------------------------------------------ canvas

/** What to hand `drawCharFrame`: the fighter's own game scale times the
 *  bench zoom. Game-space lengths (a strike point, a hurtbox, a reach) are
 *  already in game px, so those multiply by ZOOM alone — multiplying them by
 *  this as well would scale them twice, which is exactly the bug that put a
 *  dragged point at three times a fighter's height. */
function drawScale(charKey) {
  return (getActor(charKey)?.scale || 1) * ZOOM;
}

const loaded = new Set();

function draw(task, { ctx, canvas, value }) {
  const { charKey, state } = task;
  const artScale = drawScale(charKey);
  const b = bodyMetrics(charKey);

  ctx.fillStyle = "#0d1018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ground and centre line, so "x from the centre, y from the feet" is
  // something you can see rather than something you have to hold in mind.
  ctx.strokeStyle = "rgba(130, 150, 205, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y);
  ctx.moveTo(CENTRE_X, 0); ctx.lineTo(CENTRE_X, canvas.height);
  ctx.stroke();

  // The drawing this move shows at its contact beat — the instant the hitbox
  // goes live, which is the instant the strike point is a claim about. Asked
  // for by INDEX and sampled mid-frame: `beat` sits exactly on the boundary
  // between the wind-up and the strike (states.js derives it from the sheet's
  // own fps), and sampling there returns the wind-up on the wrong side of a
  // rounding error — which is how this bench first opened showing a fighter
  // with their fists still up.
  const beat = STATES[clipNameFor(state)]?.beat ?? 0.08;
  const anim = resolvedAnim(charKey, state);
  const idx = frameIndex(task);
  const frame = anim?.fps
    ? currentFrame(charKey, state, (idx + 0.5) / anim.fps)
    : currentFrame(charKey, state, beat);
  const drew = drawCharFrame(ctx, charKey, frame, CENTRE_X, GROUND_Y, { scale: artScale, facing: 1 });
  if (!drew) {
    // Art not in memory yet: ask for it, and repaint when it lands.
    ctx.fillStyle = "#9aa4c0";
    ctx.font = "13px system-ui";
    ctx.fillText("loading art…", CENTRE_X - 34, GROUND_Y - 60);
    ensureFrames(charKey).then((did) => { if (did) draw(task, { ctx, canvas, value }); });
  }

  // The body the blow is being judged against: the standing hurtbox, and the
  // centre of mass the tumble pivot and the aim chest line both use. If the
  // strike point and this cross disagree about where a body is, that is worth
  // seeing here rather than discovering downstream.
  const boxH = b.height * HURTBOX.standH * ZOOM;
  const boxW = b.width * ZOOM;
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.strokeRect(CENTRE_X - boxW / 2, GROUND_Y - boxH, boxW, boxH);
  const comY = GROUND_Y - b.height * COM_BODY_FRAC * ZOOM;
  ctx.strokeStyle = "rgba(160, 170, 190, 0.55)";
  ctx.beginPath();
  ctx.moveTo(CENTRE_X - 9, comY); ctx.lineTo(CENTRE_X + 9, comY);
  ctx.stroke();
  ctx.fillStyle = "rgba(160, 170, 190, 0.75)";
  ctx.font = "10px system-ui";
  ctx.fillText("COM", CENTRE_X + 13, comY + 3);

  // Measured reach, for scale: how far this fighter's art gets.
  const reachX = CENTRE_X + b.reach * ZOOM;
  ctx.strokeStyle = "rgba(255, 190, 90, 0.5)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(reachX, GROUND_Y - boxH * 1.1); ctx.lineTo(reachX, GROUND_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // The measurement, ghosted, whenever a human has moved it — so an edit can
  // be read as a correction of something rather than a bare number.
  const base = baseValue(task);
  if (base && (base.x !== value.x || base.y !== value.y)) {
    marker(ctx, CENTRE_X + base.x * ZOOM, GROUND_Y + base.y * ZOOM,
      "rgba(255, 190, 90, 0.45)", 6);
  }

  // The strike point itself.
  marker(ctx, CENTRE_X + value.x * ZOOM, GROUND_Y + value.y * ZOOM,
    "rgba(120, 240, 255, 0.95)", 9);

  ctx.fillStyle = "#9aa4c0";
  ctx.font = "11px system-ui";
  ctx.fillText(`beat ${Math.round(beat * 1000)}ms · ${ZOOM}× · white box = hurtbox`, 10, 16);
  ctx.fillText("drag to place", 10, canvas.height - 10);
}

/** Which drawing the reviewer is looking at. A view, not a decision. */
const FRAME_VIEW = new Map();

/** The frame the contact beat falls on — the strike, not the wind-up. */
function contactIndex(task) {
  const anim = resolvedAnim(task.charKey, task.state);
  const beat = STATES[clipNameFor(task.state)]?.beat ?? 0.08;
  if (!anim?.fps || !anim.frames?.length) return 0;
  return Math.min(anim.frames.length - 1, Math.round(beat * anim.fps));
}

function frameIndex(task) {
  const held = FRAME_VIEW.get(task.id);
  return held === undefined ? contactIndex(task) : held;
}

function baseValue(task) {
  const m = MODEL_REACH[task.charKey]?.states?.[task.state];
  return m && Number.isFinite(m.sx) ? { x: m.sx, y: -m.sy } : null;
}

function marker(ctx, x, y, color, r) {
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

/** Pull a character's frames into memory once. Resolves true when something
 *  new arrived, so the caller only repaints when there is a reason to. */
async function ensureFrames(charKey) {
  if (loaded.has(charKey)) return false;
  loaded.add(charKey);
  const keys = frameKeys(charKey);
  await Promise.all(keys.map((k) => loadFrame(charKey, k).catch(() => {})));
  return true;
}

// ------------------------------------------------------------------ export

/** The decisions as a block to paste into src/config_strike_points.js.
 *  Approved-as-measured items are included too: "a person looked at this and
 *  it was right" is a fact worth pinning, and it is what stops a later re-bake
 *  from quietly moving a point somebody already blessed. Flagged items are
 *  listed as comments — they are a job, not a value. */
function exportBlock(decisions) {
  const byChar = new Map();
  const flagged = [];
  for (const d of decisions) {
    if (d.status === "skipped") continue;
    if (d.status === "rejected") {
      flagged.push(`//   ${d.char}.${d.state}: ${d.note || "flagged, no note"}`);
      continue;
    }
    if (!byChar.has(d.char)) byChar.set(d.char, []);
    byChar.get(d.char).push(d);
  }
  const lines = [];
  for (const [char, list] of [...byChar].sort()) {
    const inner = list.sort((a, b) => a.state.localeCompare(b.state))
      .map((d) => `${d.state}: { x: ${d.value.x}, y: ${d.value.y} }`).join(", ");
    lines.push(`  ${JSON.stringify(char)}: { ${inner} },`);
  }
  const meta = [];
  for (const [char, list] of [...byChar].sort()) {
    const inner = list.map((d) =>
      `${d.state}: { at: ${JSON.stringify((d.at || "").slice(0, 10))}`
      + (d.note ? `, note: ${JSON.stringify(d.note)}` : "")
      + ` }`).join(", ");
    meta.push(`  ${JSON.stringify(char)}: { ${inner} },`);
  }
  return {
    file: "src/config_strike_points.js",
    text: `export const STRIKE_POINTS = {\n${lines.join("\n")}\n};\n\n`
      + `export const STRIKE_POINT_META = {\n${meta.join("\n")}\n};\n`
      + (flagged.length ? `\n// Flagged as broken — these want a fix at the source:\n${flagged.join("\n")}\n` : ""),
  };
}
