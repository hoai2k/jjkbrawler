// WHICH WAY A CREATURE'S ART POINTS, as a review queue.
//
// WHY THIS NEEDS EYES. summons.js used to assume every creature's plate was
// drawn facing LEFT and mirror it; the assumption was wrong for most of the
// delivered set, so creatures ran backwards whenever they chased to the right.
// The rule is now the one every other drawing follows — the art faces RIGHT and
// is mirrored to face left — and `faceLeft` in the manifest marks the ones that
// really do point the other way.
//
// Changing that rule INVERTED the correct value for every creature at once. Any
// facing settled under the old rule now reads backwards, and there is no way to
// re-derive them from the code: the answer is a fact about a drawing, and the
// only instrument that can read it is somebody looking at the drawing.
//
// I tried to read them off the plates and got it wrong at least once — the
// Great Serpent came out of my own reading facing one way and out of the
// preview facing the other — which is exactly why this is a queue and not a
// script. Each item shows the creature AS THE GAME WILL DRAW IT, moving right,
// with the direction of travel marked. The question is one thing: is it leading
// with its head?
//
// Provider contract: see verification.js and verify_strike_points.js.

import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";
import { getImage, loadSharedImage, spriteManifest } from "../src/assets.js";
import { GROUND_Y, caption } from "./verify_common.js";

const STAGE_X = 300;

/**
 * Every creature summons.js actually draws from a plate.
 *
 * Not every `summon:` key: one that animates through a full sprite set of its
 * own (Mahoraga) never draws its still, and a stand-in behind a creature with
 * its own poses is never reached either. Asking about a drawing the game does
 * not use would be asking a question with no answer.
 */
function creatures() {
  const out = new Map();
  for (const charKey of CHARACTER_KEYS) {
    const c = CHARACTERS[charKey];
    const slots = Object.entries(c?.specials || {});
    if (c?.ultimate) slots.push(["ult", c.ultimate]);
    for (const [, spec] of slots) {
      const pool = spec?.p?.pool || (spec?.type === "summon" && spec.p ? [spec.p] : []);
      for (const entry of pool) {
        const key = entry.sprites?.[0];
        if (!key?.startsWith("summon:")) continue;
        if (entry.actor) continue;   // draws its own rig, not this plate
        if (out.has(key)) continue;
        out.set(key, { key, cfg: entry, charKey, name: entry.name || entry.label || key });
      }
    }
  }
  return [...out.values()];
}

/** The plates this creature animates through, in the order they are asked for. */
const PLATES = ["move_a", "move_b", "idle_a", "idle_b", "attack"];

/** The drawing the game would show for this creature right now, with `faceLeft`
 *  already applied by assets.js — which is the whole point: the queue judges the
 *  picture the player sees, not the file on disk. */
function plateFor(key) {
  for (const pose of PLATES) {
    const img = getImage(`${key}:${pose}`);
    if (img) return img;
  }
  return getImage(key);
}

export async function provider() {
  const list = creatures();
  const tasks = list.map(({ key, cfg, charKey, name }) => ({
    id: key,
    title: `${name} · ${key}`,
    subtitle: `${charKey}'s ${cfg.behavior || "chaser"} — ${cfg.h ?? 110}px tall`,
    key, cfg, charKey,
    exportKeys: { key },
  }));
  return {
    tasks,
    // Any change to a stored facing restarts the queue: every decision here is
    // relative to what the manifest holds, so a manifest that moved underneath
    // makes the older decisions answers to a different question.
    fingerprint: `facing-${list.map((c) => `${c.key}:${storedLeft(c.key) ? 1 : 0}`).join(",")}`,
    initialValue: (task) => ({ faceLeft: storedLeft(task.key) }),
    describe: (task, value) => {
      const was = storedLeft(task.key);
      return `stored <b>${was ? "faces left" : "faces right"}</b>`
        + (value.faceLeft !== was
          ? ` → proposed <b>${value.faceLeft ? "faces left" : "faces right"}</b>` : "")
        + " — the creature below is moving RIGHT, drawn exactly as the game will "
        + "draw it. Is it leading with its head?";
    },
    renderEditor,
    draw,
    exportBlock,
    ensureReady,
  };
}

const storedLeft = (key) => !!spriteManifest?.otherSprites?.[key]?.faceLeft;

/**
 * Fetch this creature's plates, and say whether anything ARRIVED.
 *
 * The boolean is the whole contract: the engine repaints when it resolves true,
 * so a version that always resolves truthy repaints forever and wedges the
 * page. Mine returned `Promise.all([...])` — an array, always truthy — and the
 * bench hung on the first item with the main thread pinned. Once a creature is
 * in memory this resolves false and the loop stops, exactly as ensureFrames
 * does for a fighter's sheet (verify_common.js).
 */
const loaded = new Set();
const loading = new Map();
function ensureReady(task) {
  const key = task?.key;
  if (!key || loaded.has(key)) return Promise.resolve(false);
  let job = loading.get(key);
  if (!job) {
    job = Promise.all([...PLATES.map((pose) => loadSharedImage(`${key}:${pose}`)),
                       loadSharedImage(key)])
      .catch(() => {})
      .then(() => { loaded.add(key); loading.delete(key); return true; });
    loading.set(key, job);
  }
  return job;
}

function renderEditor(task, { container, value, onChange, bindSync }) {
  container.replaceChildren();
  let live = value;
  const wrap = document.createElement("div");
  wrap.className = "v-nav v-nav--wrap";
  wrap.innerHTML = `<button class="ghost sm" data-act="flip" type="button">`
    + `Flip it — it is facing backwards</button>`
    + `<button class="ghost sm" data-act="reset" type="button">Back to stored</button>`;
  wrap.querySelector('[data-act="flip"]')
    .addEventListener("click", () => onChange({ faceLeft: !live.faceLeft }));
  wrap.querySelector('[data-act="reset"]')
    .addEventListener("click", () => onChange({ faceLeft: storedLeft(task.key) }));
  bindSync((v) => { live = v; });
  container.append(wrap);
}

function draw(task, { ctx, canvas, value }) {
  ctx.fillStyle = "#0d1018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(130, 150, 205, 0.28)";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();

  // WHICH WAY IT IS GOING, drawn large, because the whole question is whether
  // the art agrees with it.
  ctx.strokeStyle = "rgba(120, 210, 140, 0.9)";
  ctx.fillStyle = "rgba(120, 210, 140, 0.9)";
  ctx.lineWidth = 3;
  const ay = GROUND_Y + 34;
  ctx.beginPath();
  ctx.moveTo(STAGE_X - 120, ay);
  ctx.lineTo(STAGE_X + 150, ay);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(STAGE_X + 168, ay);
  ctx.lineTo(STAGE_X + 148, ay - 9);
  ctx.lineTo(STAGE_X + 148, ay + 9);
  ctx.closePath();
  ctx.fill();
  ctx.font = "12px system-ui";
  ctx.fillText("travelling this way", STAGE_X + 182, ay + 4);

  const img = plateFor(task.key);
  if (!img) {
    ctx.fillStyle = "#9aa4c0";
    ctx.font = "13px system-ui";
    ctx.fillText(`no plate loaded for ${task.key}`, 20, 40);
    return;
  }

  // The stored image already carries the manifest's `faceLeft`. A PROPOSED
  // value that differs from the stored one is shown by flipping here, so the
  // canvas answers the question you are about to answer rather than the one
  // that was answered last time.
  const flipProposed = value.faceLeft !== storedLeft(task.key);
  const h = (task.cfg.h ?? 110) * 1.7;
  const w = img.width * h / img.height;
  ctx.save();
  ctx.translate(STAGE_X, GROUND_Y);
  // summons.js: the art faces right and is mirrored to face left. Moving right,
  // it is drawn unmirrored — so this is a straight blit unless the proposal
  // changes the flag.
  if (flipProposed) ctx.scale(-1, 1);
  ctx.shadowColor = task.cfg.color || "#8fd3ff";
  ctx.shadowBlur = 16;
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();

  caption(ctx, canvas,
    `${task.key} — ${value.faceLeft ? "faceLeft: true (the plate faces left, so it is turned)"
                                     : "faceLeft: false (the plate faces right, drawn as-is)"}`);
}

/**
 * Paste-ready for the pipeline that already exists.
 *
 * Emitted in the shape `tools/apply_sprite_adjustments.py` reads, so a settled
 * queue lands the same way every other shared-art decision does rather than
 * needing a hand edit of the manifest.
 */
function exportBlock(decisions) {
  const adjustments = {};
  const notes = [];
  for (const d of decisions) {
    if (d.status === "skipped") continue;
    if (d.status === "rejected") {
      notes.push(`//   ${d.key || d.id}: ${d.note || "flagged, no note"}`);
      continue;
    }
    const key = d.key || d.id;
    adjustments[key] = { faceLeft: !!d.value.faceLeft };
  }
  const body = JSON.stringify({ character: "__other", adjustments }, null, 2);
  return {
    file: "an adjustments file",
    note: "save as __other-adjustments.json and run "
      + "`python3 tools/apply_sprite_adjustments.py <file>` — the same door every "
      + "other shared-art decision goes through.",
    text: notes.length ? `${body}\n\n// flagged:\n${notes.join("\n")}` : body,
  };
}
