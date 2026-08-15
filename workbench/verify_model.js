// THE TWO SETS THAT NEED THE MODEL — facing, and pose reads.
//
// Both put a rendered 3D model beside the drawing it is supposed to be, and
// ask a question no script can answer.
//
// FACING is the sharper of the two, and the project has scars to prove it.
// `tools/check_model_facing.mjs` says so at length: an outline CANNOT tell
// front from back — turn a standing figure through 180° and the silhouette
// scores within 0.118 on average, within 0.012 for Nobara, and for four
// fighters the model facing AWAY scores HIGHER than the model facing the
// camera. An automated sweep that trusted its own margin duly turned Nobara,
// Yuta, Todo, Yuki and Dagon backwards, every one of them by 112°–164°. That
// tool's own conclusion is that front-versus-back is a job for a human beside
// the drawing. This is that job, as a queue.
//
// POSE READS asks the softer version: the model plays a clip built from these
// drawings, so does the pose that comes out read as the pose that went in? A
// wrong answer here is not a bug in the engine but a note for the pose
// library, which is why this set exports a work list rather than a config.
//
// LOADING. The 3D backend is imported DIRECTLY rather than through
// render_backend.js's waist: the waist has one active backend for the whole
// page, and switching it would change what every other task set draws.

import {
  resolvedAnim, currentFrame as spriteFrame, drawCharFrame as spriteDraw,
} from "../sprites/src/sprites.js";
import { CHARACTER_KEYS } from "../src/characters.js";
import { rigManifest, setRigSettings } from "../render3d/src/loader.js";
import { clearCache } from "../render3d/src/scene.js";
import * as render3d from "../render3d/src/backend.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";
import {
  ZOOM, GROUND_Y, artScaleFor, ensureFrames, caption, slider, frameStepper, frameIndex,
} from "./verify_common.js";

/** The 3D engine, started once and shared by both sets. Resolves false when
 *  it cannot run at all (no WebGL in this browser), which the sets report
 *  rather than failing — every other set still works. */
let started = null;
function startEngine() {
  if (!started) started = render3d.init().then(() => render3d.modelCount() > 0).catch(() => false);
  return started;
}

const MODEL_X = 300;   // the model's centre line — right half of the canvas
const SPRITE_X = 110;  // the drawing's, left half

async function rigged() {
  await startEngine();
  return CHARACTER_KEYS.filter((k) => render3d.hasModel(k));
}

/** A manifest-derived fingerprint: these sets are about the DELIVERED bodies,
 *  so a re-import or a dial change is what should reset their queues. */
function fingerprint() {
  const m = rigManifest?.() || {};
  const chars = m.characters || {};
  const parts = Object.keys(chars).sort()
    .map((k) => `${k}:${chars[k].model}:${chars[k].yawOffsetDeg ?? 0}:${chars[k].renderScale ?? 1}`);
  let n = 0;
  for (const s of parts.join("|")) n = (n * 31 + s.charCodeAt(0)) >>> 0;
  return `model-${n.toString(36)}`;
}

/** Draw the sprite on the left and the model on the right, both facing right,
 *  both at game size × the bench zoom. Whether those two agree IS the
 *  question, so nothing here corrects one toward the other. */
function drawPair(task, { ctx, canvas, redraw, yawDeg = 0, state }) {
  const { charKey } = task;
  ctx.fillStyle = "#0d1018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(130, 150, 205, 0.28)";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y);
  ctx.moveTo(canvas.width / 2, 24); ctx.lineTo(canvas.width / 2, canvas.height - 24);
  ctx.stroke();
  ctx.fillStyle = "#9aa4c0";
  ctx.font = "11px system-ui";
  ctx.fillText("the drawing", SPRITE_X - 32, 34);
  ctx.fillText("the model", MODEL_X - 26, 34);

  const scale = artScaleFor(charKey);
  const anim = resolvedAnim(charKey, state);
  const idx = frameIndex(task);
  const t = anim?.fps ? (idx + 0.5) / anim.fps : 0;
  const drew = spriteDraw(ctx, charKey, spriteFrame(charKey, state, t), SPRITE_X, GROUND_Y,
    { scale, facing: 1 });
  if (!drew) ensureFrames(charKey).then((fresh) => { if (fresh) redraw?.(); });

  // The model, posed through the backend's own token path so what is on
  // screen is what a match would draw.
  //
  // A proposed facing is applied to the RIG (the same dial the manifest
  // carries) rather than passed as a draw option, because facing is baked
  // into the pose long before the blit — pose.facingYaw reads it. The pose
  // cache does not key on it, so a change has to drop the cache or the old
  // angle keeps being served.
  try {
    applyYaw(charKey, yawDeg);
    const token = render3d.currentFrame(charKey, state, t);
    render3d.drawCharFrame(ctx, charKey, token, MODEL_X, GROUND_Y, { scale, facing: 1 });
  } catch (err) {
    ctx.fillStyle = "#d98a8a";
    ctx.fillText(`model: ${err.message}`, MODEL_X - 60, GROUND_Y - 80);
  }
}

/** The yaw currently applied to each rig, so the cache is only dropped when
 *  the number actually moves — a clear on every repaint would re-render the
 *  whole queue's worth of poses for nothing. */
const appliedYaw = new Map();

function applyYaw(charKey, deg) {
  const want = Math.round(deg || 0);
  if (appliedYaw.get(charKey) === want) return;
  appliedYaw.set(charKey, want);
  const stored = rigManifest?.()?.characters?.[charKey]?.yawOffsetDeg ?? 0;
  setRigSettings(charKey, { yawOffsetDeg: stored + want });
  clearCache();
}

// ------------------------------------------------------------------ facing

export async function facingProvider() {
  const ok = await startEngine();
  const keys = ok ? await rigged() : [];
  const manifest = rigManifest?.()?.characters || {};
  const tasks = keys.map((charKey) => ({
    id: `facing/${charKey}`,
    title: charKey,
    subtitle: `yawOffsetDeg ${manifest[charKey]?.yawOffsetDeg ?? 0}`,
    charKey,
    state: "idle",
    exportKeys: { char: charKey, kind: "yawOffsetDeg" },
  }));
  return {
    tasks,
    fingerprint: fingerprint(),
    ready: ok,
    initialValue: (task) => ({ yaw: manifest[task.charKey]?.yawOffsetDeg ?? 0 }),
    describe: (task, value) =>
      `stored <b>${manifest[task.charKey]?.yawOffsetDeg ?? 0}°</b>`
      + (value.yaw !== (manifest[task.charKey]?.yawOffsetDeg ?? 0)
        ? ` → proposed <b>${value.yaw}°</b>` : "")
      + ` — do both bodies face the same way?`,
    renderEditor(task, { container, value, onChange }) {
      container.replaceChildren();
      slider(container, {
        label: "yawOffsetDeg", hint: "the manifest's own facing correction",
        min: 0, max: 359, step: 5, value: value.yaw,
      }, (yaw) => onChange({ yaw }));
      const wrap = document.createElement("div");
      wrap.className = "v-nav v-nav--wrap";
      wrap.innerHTML = `<button class="ghost sm" data-turn="180" type="button">Turn 180°</button>`
        + `<button class="ghost sm" data-turn="0" type="button">Back to stored</button>`;
      wrap.querySelector('[data-turn="180"]').addEventListener("click",
        () => onChange({ yaw: (value.yaw + 180) % 360 }));
      wrap.querySelector('[data-turn="0"]').addEventListener("click",
        () => onChange({ yaw: manifest[task.charKey]?.yawOffsetDeg ?? 0 }));
      container.appendChild(wrap);
    },
    draw(task, ctx) {
      drawPair(task, { ...ctx, state: "idle", yawDeg: ctx.value.yaw - (manifest[task.charKey]?.yawOffsetDeg ?? 0) });
      caption(ctx.ctx, ctx.canvas,
        "same direction? a silhouette cannot answer this — that is why you are here");
    },
    exportBlock(decisions) {
      const rows = [];
      const flagged = [];
      for (const d of decisions) {
        if (d.status === "skipped") continue;
        if (d.status === "rejected") {
          flagged.push(`//   ${d.char}: ${d.note || "flagged, no note"}`);
          continue;
        }
        if (d.value.yaw === d.measured.yaw) continue;   // confirmed as stored
        rows.push(`  ${JSON.stringify(d.char)}: ${d.value.yaw},`
          + (d.note ? `  // ${d.note}` : ""));
      }
      return {
        file: "render3d/assets/manifest.json",
        note: "set each character's yawOffsetDeg to these. A fighter confirmed "
          + "as already correct is absent — nothing to change.",
        text: rows.length ? `// yawOffsetDeg\n${rows.join("\n")}\n` : "// no facing changes\n",
      };
    },
  };
}

// -------------------------------------------------------------- pose reads

/** The states worth reading: the ones a player looks at longest, and the ones
 *  built from a sheet rather than hand-authored. */
const READ_STATES = ["idle", "walk", "run", "crouch", "shield", "light", "sideHeavy", "hurt", "win"];

export async function poseProvider() {
  const ok = await startEngine();
  const keys = ok ? await rigged() : [];
  const tasks = [];
  for (const charKey of keys) {
    for (const state of READ_STATES) {
      if (!resolvedAnim(charKey, state)?.frames?.length) continue;
      tasks.push({
        id: `read/${charKey}/${state}`,
        title: `${charKey} · ${state}`,
        subtitle: "does the model read as the drawing?",
        charKey,
        state,
        exportKeys: { char: charKey, state },
      });
    }
  }
  return {
    tasks,
    fingerprint: fingerprint(),
    ready: ok,
    // Nothing to edit: this set's answer is a verdict, and its value carries
    // the reviewer's reading of WHY rather than a number to apply.
    initialValue: () => ({ reads: true }),
    describe: (task) =>
      `${task.charKey}'s <b>${task.state}</b> — approve if the model reads as the drawing, `
      + `flag it if it does not and say what is off`,
    renderEditor(task, { container, redraw }) {
      container.replaceChildren();
      frameStepper(container, task, redraw);
      const p = document.createElement("p");
      p.className = "legend";
      p.textContent = "Nothing to drag here. Approve when the two bodies say the same "
        + "thing, flag when they do not — the note becomes the pose library's work list.";
      container.appendChild(p);
    },
    draw(task, ctx) {
      drawPair(task, { ...ctx, state: task.state });
      const beat = STATES[clipNameFor(task.state)]?.beat;
      caption(ctx.ctx, ctx.canvas, beat !== undefined
        ? `${task.state} at its contact beat` : `${task.state}`);
    },
    exportBlock(decisions) {
      const lines = decisions
        .filter((d) => d.status === "rejected")
        .map((d) => `- ${d.char} · ${d.state}: ${d.note || "flagged, no note"}`);
      const okd = decisions.filter((d) => d.status === "approved" || d.status === "edited").length;
      return {
        file: "(a work list — no config)",
        note: "poses whose model does not read as its drawing; these want pose-library work",
        text: lines.length
          ? `# Pose reads that need work\n\n${lines.join("\n")}\n\n(${okd} read correctly)\n`
          : `# Pose reads\n\nAll ${okd} reviewed poses read correctly.\n`,
      };
    },
  };
}
