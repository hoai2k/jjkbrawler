// TWO POINTS ON A BODY — centre of mass, and the muzzle.
//
// One module because they are one job: a fighter, a drawing, and a place on
// it that the simulation currently assumes rather than knows. Each is a
// separate task set in the picker; they differ in which drawing, which
// starting guess, and which config the answer belongs in.
//
// WHAT EACH ONE IS FOR
//
//   centre of mass  `COM_BODY_FRAC` is 0.55 for the whole roster. It is the
//                   pivot a tumble rotates about (motion.js), the point the
//                   3D rig rotates about in-scene (camera3d/models.js), the
//                   chest line an aim solves from (backend.js) and the centre
//                   the prone box hangs off (combat.js). It was chosen, never
//                   measured, and a fighter carrying a heavy coat or a broom
//                   does not balance where a bare one does.
//
//   muzzle          Where a shot leaves. Resolved per pose by src/muzzle.js;
//                   without a verified answer it is the reference body's
//                   70, -86 scaled by height — a hand's position on nobody in
//                   particular, so shots depart one fighter's forehead and
//                   another's waist.
//
// THERE IS NO LEDGE-GRIP SET, and there should not be. Where the hand meets
// the lip is already a per-frame `ledge` anchor in the sprite manifest —
// baked on all 28 hang frames, consumed by sprites.js (ANCHORED_STATES) to
// hang the art off the real platform corner, and draggable in the SPRITE
// workbench, which is the tool for moving a point on a drawing. A second
// answer to the same question here would be a duplicate that rots: the two
// would drift, and nothing would say which one the game believed.

import { resolvedAnim } from "../sprites/src/sprites.js";
import { CHARACTER_KEYS, CHARACTERS } from "../src/characters.js";
import { BODY_POINTS } from "../src/config_body_points.js";
import { muzzleOf } from "../src/muzzle.js";
import { bodyMetrics } from "../src/silhouette.js";
import { COM_BODY_FRAC } from "../src/config_tuning.js";
import {
  ZOOM, GROUND_Y, CENTRE_X, toCanvas, toGame, drawStage, marker, heightLine,
  caption, slider, pointEditor, frameStepper, ensureTaskArt,
} from "./verify_common.js";

/** Is this fighter's answer for `key` already in src/config_body_points.js?
 *  A committed answer is settled and the queue stops asking — see
 *  verification.js statusOf. */
const committedFor = (key) => (task) => BODY_POINTS[task.charKey]?.[key] !== undefined;

/** Everything these sets read is the sprite manifest and the kit tables, so
 *  one fingerprint serves all three: it changes when the art placement does. */
function fingerprint() {
  let n = 0;
  for (const key of CHARACTER_KEYS) {
    const b = bodyMetrics(key);
    n = (n * 31 + Math.round(b.height * 10) + Math.round(b.width * 10)) >>> 0;
  }
  return `body-${n.toString(36)}`;
}

const roster = (state) => CHARACTER_KEYS.filter(
  (k) => resolvedAnim(k, state)?.frames?.length);

// ------------------------------------------------------------ centre of mass

export async function comProvider() {
  const tasks = roster("idle").map((charKey) => ({
    id: `com/${charKey}`,
    title: charKey,
    subtitle: BODY_POINTS[charKey]?.com !== undefined ? "already verified" : "assumed 0.55",
    charKey,
    state: "idle",
    exportKeys: { char: charKey, kind: "com" },
  }));
  return {
    tasks,
    fingerprint: fingerprint(),
    initialValue: (task) => {
      const b = bodyMetrics(task.charKey);
      const frac = BODY_POINTS[task.charKey]?.com ?? COM_BODY_FRAC;
      return { y: -Math.round(b.height * frac) };
    },
    describe(task, value) {
      const b = bodyMetrics(task.charKey);
      const frac = (-value.y / b.height);
      return `${task.subtitle} · <b>${frac.toFixed(3)}</b> of height `
        + `(<b>${-value.y}px</b> up of ${Math.round(b.height)}) — roster default 0.55`;
    },
    renderEditor(task, { container, value, onChange, bindSync }) {
      const b = bodyMetrics(task.charKey);
      container.replaceChildren();
      const y = slider(container, {
        label: "Centre of mass", hint: "height above the foot line",
        min: -Math.round(b.height), max: 0, value: value.y,
      }, (v) => onChange({ y: v }));
      bindSync((v) => y.set(v.y));
    },
    onCanvasDrag: (task, pt) => ({ y: Math.min(0, toGame(pt).y) }),
    draw(task, { ctx, canvas, value, redraw }) {
      drawStage(task, { ctx, canvas, redraw, guides: { hurtbox: true } });
      const b = bodyMetrics(task.charKey);
      // The assumption, so the edit reads as a move away from it.
      heightLine(ctx, canvas, GROUND_Y - b.height * COM_BODY_FRAC * ZOOM,
        "rgba(160, 170, 190, 0.5)", "0.55 assumed");
      const y = GROUND_Y + value.y * ZOOM;
      heightLine(ctx, canvas, y, "rgba(120, 240, 255, 0.95)",
        `${(-value.y / b.height).toFixed(3)} — balance point`);
      marker(ctx, CENTRE_X, y, "rgba(120, 240, 255, 0.95)", 7);
      caption(ctx, canvas, "where would this body balance if you spun it?");
      ctx.fillText("drag to place", 10, canvas.height - 10);
    },
    ensureReady: ensureTaskArt,
    committed: committedFor("com"),
    exportBlock: (decisions) => blockFor(decisions, "com",
      (d) => {
        const b = bodyMetrics(d.char);
        return (-d.value.y / b.height).toFixed(3);
      }),
  };
}

// ------------------------------------------------------------------- muzzle

/** Only fighters who actually throw something. Asking about a muzzle for a
 *  fighter with no projectile is a question with no answer. */
function shooters() {
  return roster("specialNeutral").filter((key) => {
    const specials = CHARACTERS[key]?.specials || {};
    return Object.values(specials).some((s) => s?.type === "projectile" || s?.type === "wave");
  });
}

/** What the game is using for this fighter right now, in words — so the list
 *  says which of the three answers each task is starting from rather than
 *  "verified or not". A measured hand is a much better starting point than the
 *  roster-wide guess, and worth telling apart from it. */
const MUZZLE_SUBTITLE = {
  human: "already verified",
  model: "measured off the rig — confirm it",
  derived: "assumed 70, -86 scaled",
};

export async function muzzleProvider() {
  const tasks = shooters().map((charKey) => ({
    id: `muzzle/${charKey}`,
    title: charKey,
    subtitle: MUZZLE_SUBTITLE[muzzleOf(charKey, "specialNeutral").source],
    charKey,
    state: "specialNeutral",
    exportKeys: { char: charKey, kind: "muzzle" },
  }));
  return {
    tasks,
    fingerprint: fingerprint(),
    initialValue(task) {
      // Whatever the game is using now — a point already placed, else the rig's
      // measured hand, else the reference scaled onto this body. Starting from
      // the best available answer means confirming a good measurement is one
      // click rather than a re-drag, which is the difference between the rig
      // bake being useful and being ignored.
      const m = muzzleOf(task.charKey, task.state);
      return { x: Math.round(m.x), y: Math.round(m.y) };
    },
    describe: (task, value) =>
      `${task.subtitle} · <b>x ${value.x}</b>, <b>y ${value.y}</b> — where the shot leaves`,
    renderEditor(task, { container, value, onChange, redraw, bindSync }) {
      container.replaceChildren();
      frameStepper(container, task, redraw);
      pointEditor(container, task.charKey, value, onChange, bindSync);
    },
    onCanvasDrag: (task, pt) => toGame(pt),
    draw(task, { ctx, canvas, value, redraw }) {
      drawStage(task, { ctx, canvas, redraw, guides: { hurtbox: true } });
      const p = toCanvas(value);
      marker(ctx, p.x, p.y, "rgba(120, 240, 255, 0.95)");
      // The shot's path, so a muzzle inside the body is obvious.
      ctx.strokeStyle = "rgba(120, 240, 255, 0.35)";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y); ctx.lineTo(canvas.width - 8, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      caption(ctx, canvas, "where does the shot leave the caster?");
      ctx.fillText("drag to place", 10, canvas.height - 10);
    },
    ensureReady: ensureTaskArt,
    committed: committedFor("muzzle"),
    exportBlock: (decisions) => blockFor(decisions, "muzzle",
      (d) => `{ x: ${d.value.x}, y: ${d.value.y} }`),
  };
}

// ------------------------------------------------------------------ export

/** All three sets write into the same config, under their own key, so a
 *  sitting that touched two of them produces two blocks for one file and a
 *  reader can see everything known about a body in one place. */
function blockFor(decisions, key, render) {
  const rows = [];
  const flagged = [];
  // Committed answers first, so the block is the whole picture for this key
  // and pasting it replaces rather than truncates.
  const seen = new Set();
  for (const [char, held] of Object.entries(BODY_POINTS)) {
    if (held?.[key] === undefined) continue;
    if (decisions.some((d) => d.char === char && d.status !== "skipped")) continue;
    seen.add(char);
    rows.push(`  ${JSON.stringify(char)}: { ${key}: ${JSON.stringify(held[key])} },`);
  }
  for (const d of decisions) {
    if (d.status === "skipped") continue;
    if (d.status === "rejected") {
      flagged.push(`//   ${d.char}.${key}: ${d.note || "flagged, no note"}`);
      continue;
    }
    rows.push(`  ${JSON.stringify(d.char)}: { ${key}: ${render(d)} },`
      + (d.note ? `  // ${d.note}` : ""));
  }
  return {
    file: "src/config_body_points.js",
    note: `merge these into BODY_POINTS under each character's "${key}" key`,
    text: `// ${key}\n${rows.join("\n")}\n`
      + (flagged.length ? `\n// Flagged — a fix at the source:\n${flagged.join("\n")}\n` : ""),
  };
}

// ------------------------------------------------------- the vertical lines
//
// Three sets that ask for ONE NUMBER each — an x on a drawing — because the
// thing being placed is a line, not a point. Where a hand is on the way out,
// where a chest is on the way in, where a foot meets the lip. The height is
// not the question in any of them: what has to agree is how far forward.
//
// WHY THEY ARE HERE AND NOT IN THE SPRITE WORKBENCH. That bench moves the
// DRAWING; these leave the drawing exactly where it is and mark a feature on
// it. A grab hand and a grabbed chest are two halves of one measurement taken
// on two different fighters, which is a queue, not a slider.

/** One `x` on one pose, as a task set. `state` picks the pose, `key` the
 *  BODY_POINTS field it lands in, and `seed` the value to start from. */
function lineProvider({ key, state, label, question, hint, seed, colour }) {
  return async function provider() {
    const tasks = roster(state).map((charKey) => ({
      id: `${key}/${charKey}`,
      title: charKey,
      subtitle: label,
      charKey,
      state,
      exportKeys: { char: charKey, kind: key },
    }));
    return {
      tasks,
      fingerprint: fingerprint(),
      initialValue: (task) => ({ x: Math.round(BODY_POINTS[task.charKey]?.[key] ?? seed(task.charKey)) }),
      describe: (task, value) =>
        `${label} · <b>x ${value.x}</b> forward of the centre line — ${question}`,
      renderEditor(task, { container, value, onChange, redraw, bindSync }) {
        container.replaceChildren();
        frameStepper(container, task, redraw);
        const b = bodyMetrics(task.charKey);
        const s = slider(container, {
          label: "Forward", hint,
          min: -Math.round(b.width), max: Math.round(Math.max(b.reach * 2.2, b.width * 3)),
          value: value.x,
        }, (x) => onChange({ x }));
        bindSync((v) => s.set(v.x));
      },
      // Only the x moves: dragging anywhere on the canvas sets the line's
      // distance, so the pointer does not have to find a 9px dot.
      onCanvasDrag: (task, pt) => ({ x: Math.round(toGame(pt).x) }),
      draw(task, { ctx, canvas, value, redraw }) {
        drawStage(task, { ctx, canvas, redraw, guides: { hurtbox: true } });
        const x = CENTRE_X + value.x * ZOOM;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 24); ctx.lineTo(x, GROUND_Y);
        ctx.stroke();
        ctx.fillStyle = colour;
        ctx.font = "11px system-ui";
        ctx.fillText(`${value.x}px`, x + 6, 36);
        caption(ctx, canvas, question);
        ctx.fillText("drag anywhere to move the line", 10, canvas.height - 10);
      },
      ensureReady: ensureTaskArt,
      committed: committedFor(key),
      exportBlock: (decisions) => blockFor(decisions, key, (d) => `${d.value.x}`),
    };
  };
}

/**
 * WHERE THE GRABBING HAND IS, on `grab_reach`.
 *
 * The grab box is currently the fighter's measured art reach x0.85 plus a
 * closing grace — a formula, applied to everybody, that has never been
 * compared against the hand actually drawn reaching. Placed here it becomes
 * the real thing: the distance at which THIS fighter's hand closes.
 */
export const grabHandProvider = lineProvider({
  key: "grabHand",
  state: "grabReach",
  label: "the grabbing hand",
  question: "where does the open hand close?",
  hint: "put the line on the grasping hand",
  seed: (c) => bodyMetrics(c).reach * 0.85,
  colour: "rgba(255, 140, 110, 0.95)",
});

/**
 * WHERE THE HELD CHEST IS, on `grabbed`.
 *
 * The other half of the same measurement, taken on the other fighter. The
 * game stands the two at `holdGap` — a formula off both their widths — and
 * the brief has had to ask, in words, for every fist and every pair of prying
 * hands to land at one height and one depth so the crossing reads. With this
 * placed on both fighters the gap is not a formula any more: it is holder's
 * hand minus victim's chest, which puts the hand ON the chest by construction.
 */
export const grabChestProvider = lineProvider({
  key: "grabChest",
  state: "grabbed",
  label: "the held chest",
  question: "where do the prying hands sit — where the grip lands?",
  hint: "put the line on the chest, at the grip",
  seed: (c) => bodyMetrics(c).width * 0.25,
  colour: "rgba(120, 210, 240, 0.95)",
});

/**
 * WHERE THE TEETERING FOOT IS, on `teeter`.
 *
 * A teeter is a fighter balanced on the lip with the ground gone under the
 * front foot, and the game draws it at the fighter's own x — so how much of
 * the foot is over the edge is whatever that drawing happened to do. Placed
 * here, the renderer can put THIS foot on the lip.
 */
export const teeterFootProvider = lineProvider({
  key: "teeterFoot",
  state: "teeter",
  label: "the teetering foot",
  question: "which point of the foot is on the very edge?",
  hint: "put the line on the front foot's contact",
  seed: (c) => bodyMetrics(c).width * 0.3,
  colour: "rgba(255, 210, 120, 0.95)",
});
