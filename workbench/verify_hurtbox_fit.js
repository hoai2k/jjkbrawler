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
// An edit adjusts the box's width and height for that ONE state on that ONE
// fighter, as a multiplier on what the fractions give — so an approve costs
// nothing and a correction is a small, local, readable number.

import { resolvedAnim } from "../sprites/src/sprites.js";
import { CHARACTER_KEYS } from "../src/characters.js";
import { HURTBOX_FIT } from "../src/config_body_points.js";
import { bodyMetrics } from "../src/silhouette.js";
import { HURTBOX } from "../src/constants.js";
import {
  ZOOM, GROUND_Y, CENTRE_X, drawStage, caption, slider, frameStepper,
  prefetchTask,
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
    initialValue: (task) => ({
      w: HURTBOX_FIT[task.charKey]?.[task.caseKey]?.w ?? 1,
      h: HURTBOX_FIT[task.charKey]?.[task.caseKey]?.h ?? 1,
    }),
    describe(task, value) {
      const base = baseBox(task);
      return `${task.subtitle} · <b>${Math.round(base.w * value.w)}×${Math.round(base.h * value.h)}px</b>`
        + (value.w !== 1 || value.h !== 1
          ? ` — adjusted ×${value.w.toFixed(2)}, ×${value.h.toFixed(2)}` : " — as derived");
    },
    renderEditor(task, { container, value, onChange, redraw }) {
      container.replaceChildren();
      frameStepper(container, task, redraw);
      slider(container, {
        label: "Width", hint: "× the derived width", min: 0.6, max: 1.6, step: 0.01, value: value.w,
      }, (w) => onChange({ ...value, w }));
      slider(container, {
        label: "Height", hint: "× the derived height", min: 0.6, max: 1.6, step: 0.01, value: value.h,
      }, (h) => onChange({ ...value, h }));
    },
    draw(task, { ctx, canvas, value, redraw }) {
      drawStage(task, { ctx, canvas, redraw, guides: {} });
      const base = baseBox(task);
      // The derived box, ghosted, and the adjusted one over it.
      rect(ctx, base, 1, 1, "rgba(255,255,255,0.22)");
      rect(ctx, base, value.w, value.h, "rgba(120, 240, 255, 0.9)");
      caption(ctx, canvas,
        `${task.caseKey} box · white = derived · cyan = what would ship`);
      ctx.fillText("does it cover the body, and nothing that is not the body?",
        10, canvas.height - 10);
    },
    prefetch: prefetchTask,
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

function rect(ctx, base, mw, mh, color) {
  const w = base.w * mw * ZOOM;
  const h = base.h * mh * ZOOM;
  // Grown about the box's own bottom edge, which is where it is anchored.
  const bottom = GROUND_Y - (base.top - base.h) * ZOOM;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(CENTRE_X - w / 2, bottom - h, w, h);
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
    // An approve at 1,1 is "the derived box is right" — worth recording as a
    // decision, but it is not an override and writing it as one would freeze
    // a box that should keep tracking the art.
    if (d.value.w === 1 && d.value.h === 1) continue;
    if (!byChar.has(d.char)) byChar.set(d.char, []);
    byChar.get(d.char).push(d);
  }
  const lines = [];
  for (const [char, list] of [...byChar].sort()) {
    lines.push(`  ${JSON.stringify(char)}: { `
      + list.map((d) => `${d.case}: { w: ${d.value.w}, h: ${d.value.h} }`).join(", ") + ` },`);
  }
  return {
    file: "src/config_body_points.js",
    note: "merge into HURTBOX_FIT. Boxes approved as-derived are deliberately "
      + "absent: they keep tracking the art.",
    text: `export const HURTBOX_FIT = {\n${lines.join("\n")}\n};\n`
      + (flagged.length ? `\n// Flagged — a fix at the source:\n${flagged.join("\n")}\n` : ""),
  };
}
