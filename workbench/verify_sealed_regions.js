// SHADOW OR GAP — the one keying question a measurement cannot answer.
//
// Round 25's plates arrive on a flat neutral screen, and the artist shaded the
// pale costumes in that same neutral. So a sealed patch of screen colour inside
// a silhouette is either the stage showing through — the gap between an arm and
// a body — or a shadow lying on a sleeve, and the two are the same pixels:
// 128,128,128 exactly, flat, fenced by the same white cloth, neither reachable
// by a flood from the border.
//
// sprites/docs/sprite-cleanup.md lists what was measured against regions
// labelled by eye on both sides — colour, local variance, depth inside the
// silhouette, ink in the fence, elongation, erosion survival, plain
// reachability — and none of them separates the two. The difference is not in
// the image. It is in knowing what a sleeve is.
//
// So it is a queue. One region at a time, at full size, with the plate as
// delivered underneath: gap or shadow. The answer is stored as a POINT in that
// plate's own pixels (`sprites/assets/sealed_verdicts.json`), and the delivery
// is archived and never changes, so an answer given once holds for every re-key
// of that drawing afterwards.
//
// Only art the game draws is in here. `tools/build_sealed_queue.mjs` asks the
// game's own resolver; there are 1,618 unanswered regions across the whole
// tree and most of them are on cells and alternates nobody ever sees.
//
// Provider contract: see verification.js and verify_strike_points.js.

import { caption } from "./verify_common.js";

const QUEUE = "../sprites/assets/sealed_queue.json";
const PLATE_ROOT = "../";

export async function provider() {
  const doc = await fetch(QUEUE).then((r) => (r.ok ? r.json() : { regions: [] }))
    .catch(() => ({ regions: [] }));
  // ONE FIGHTER AT A TIME, from the address bar: `&char=kashimo`. The queue is
  // 1,567 regions and it is meant to be worked at leisure, so the useful unit
  // is a fighter — their plates share a costume and a palette, and the same
  // judgement carries down the list. Without it the order still groups them,
  // biggest question first within each.
  const want = new URL(location.href).searchParams.get("char");
  const regions = (doc.regions || []).filter((r) => !want || r.char === want);

  const tasks = regions.map((r) => ({
    id: `${r.char}/${r.pose}@${r.x},${r.y}`,
    title: `${r.char} · ${r.pose}`,
    subtitle: `${r.px.toLocaleString()} px — the keyer ${r.now === "cut" ? "cuts" : "keeps"} it today`,
    ...r,
    exportKeys: { char: r.char, pose: r.pose, x: r.x, y: r.y },
  }));

  return {
    tasks,
    // The queue is rebuilt from the plates and the answers already given, so a
    // rebuild is a different set of questions and older decisions were answers
    // to a different one.
    fingerprint: `sealed-${regions.length}-${regions.map((r) => `${r.char}/${r.pose}@${r.x},${r.y}`).join("|").length}`,
    initialValue: (task) => ({ background: task.now === "cut" }),
    describe: (task, value) => {
      const now = task.now === "cut" ? "cuts it away" : "keeps it";
      const want = value.background ? "the stage showing through" : "drawn on the fighter";
      return `The keyer <b>${now}</b> today. Marked as <b>${want}</b>.<br>`
        + "Is the outlined patch a hole in the fighter, or a shadow lying on them?";
    },
    renderEditor,
    draw,
    exportBlock,
    ensureReady,
  };
}

// ------------------------------------------------------------- the plates
//
// One image per PLATE, not per region: a fighter's throw has a dozen regions on
// it and they all read the same file.
const plates = new Map();
const loading = new Map();
const masks = new Map();

function ensureReady(task) {
  if (!task?.src || plates.has(task.src)) return Promise.resolve(false);
  let job = loading.get(task.src);
  if (!job) {
    job = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { plates.set(task.src, img); resolve(true); };
      img.onerror = () => { plates.set(task.src, null); resolve(true); };
      img.src = PLATE_ROOT + task.src;
    }).then((v) => { loading.delete(task.src); return v; });
    loading.set(task.src, job);
  }
  return job;
}

/**
 * The region itself, found again in the browser rather than shipped.
 *
 * A mask is a picture and the queue is a list of numbers; sending 1,600 of them
 * would be sending the plates twice. The seed point is enough: flood the screen
 * colour out from it and the same patch comes back, because "sealed" is what
 * makes it a question in the first place — nothing joins it to the border.
 *
 * The key colour is read from the plate's own corner, which is what
 * `border_key` does on the other side.
 */
function maskFor(task) {
  const hit = masks.get(task.id);
  if (hit) return hit;
  const img = plates.get(task.src);
  if (!img) return null;
  const [x0, y0, x1, y1] = task.crop;
  const w = x1 - x0, h = y1 - y0;
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const c = off.getContext("2d", { willReadFrequently: true });
  c.drawImage(img, x0, y0, w, h, 0, 0, w, h);
  const data = c.getImageData(0, 0, w, h).data;

  const corner = document.createElement("canvas");
  corner.width = corner.height = 1;
  const cc = corner.getContext("2d", { willReadFrequently: true });
  cc.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
  const [kr, kg, kb] = cc.getImageData(0, 0, 1, 1).data;

  const near = (i) => Math.abs(data[i] - kr) + Math.abs(data[i + 1] - kg)
                    + Math.abs(data[i + 2] - kb) < 24;
  const inside = new Uint8Array(w * h);
  const sx = task.x - x0, sy = task.y - y0;
  const stack = [sy * w + sx];
  inside[stack[0]] = 1;
  while (stack.length) {
    const p = stack.pop();
    const px = p % w, py = (p - px) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (inside[q] || !near(q * 4)) continue;
      inside[q] = 1;
      stack.push(q);
    }
  }
  const out = { w, h, x0, y0, inside };
  masks.set(task.id, out);
  return out;
}

function renderEditor(task, { container, value, onChange, bindSync }) {
  container.replaceChildren();
  let live = value;
  const wrap = document.createElement("div");
  wrap.className = "v-nav v-nav--wrap";
  wrap.innerHTML =
    `<button class="ghost sm" data-act="gap" type="button">Gap — cut it away</button>`
    + `<button class="ghost sm" data-act="shadow" type="button">Shadow — it is the fighter</button>`
    + `<button class="ghost sm" data-act="reset" type="button">Back to what the keyer does</button>`;
  const paint = () => {
    wrap.querySelector('[data-act="gap"]').classList.toggle("on", live.background);
    wrap.querySelector('[data-act="shadow"]').classList.toggle("on", !live.background);
  };
  wrap.querySelector('[data-act="gap"]').addEventListener("click", () => onChange({ background: true }));
  wrap.querySelector('[data-act="shadow"]').addEventListener("click", () => onChange({ background: false }));
  wrap.querySelector('[data-act="reset"]')
    .addEventListener("click", () => onChange({ background: task.now === "cut" }));
  bindSync((v) => { live = v; paint(); });
  paint();
  container.append(wrap);
}

function draw(task, { ctx, canvas, value }) {
  ctx.fillStyle = "#0d1018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = plates.get(task.src);
  if (!img) {
    ctx.fillStyle = "#9aa4c0";
    ctx.font = "13px system-ui";
    ctx.fillText(`no plate loaded for ${task.src}`, 20, 40);
    return;
  }
  const m = maskFor(task);
  const [x0, y0, x1, y1] = task.crop;
  const cw = x1 - x0, ch = y1 - y0;
  const scale = Math.min((canvas.width - 40) / cw, (canvas.height - 70) / ch);
  const dw = cw * scale, dh = ch * scale;
  const dx = (canvas.width - dw) / 2, dy = 26;

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, x0, y0, cw, ch, dx, dy, dw, dh);

  if (m) {
    // The answer, painted on. A gap is shown as the hole it would leave, so
    // "cut it" is a picture of the result rather than a word for it; a shadow
    // is left alone under an outline, because keeping it means changing nothing.
    const off = document.createElement("canvas");
    off.width = m.w; off.height = m.h;
    const oc = off.getContext("2d");
    const px = oc.createImageData(m.w, m.h);
    for (let i = 0; i < m.inside.length; i++) {
      if (!m.inside[i]) continue;
      const edge = !(m.inside[i - 1] && m.inside[i + 1]
                     && m.inside[i - m.w] && m.inside[i + m.w]);
      const j = i * 4;
      if (value.background) {
        // a checker, so it reads as absence rather than as paint
        const x = i % m.w, y = (i - x) / m.w;
        const on = ((x >> 3) + (y >> 3)) & 1;
        px.data[j] = on ? 235 : 40; px.data[j + 1] = on ? 60 : 20;
        px.data[j + 2] = on ? 150 : 40; px.data[j + 3] = edge ? 255 : 205;
      } else {
        px.data[j] = 255; px.data[j + 1] = 220; px.data[j + 2] = 0;
        px.data[j + 3] = edge ? 255 : 0;
      }
    }
    oc.putImageData(px, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = true;
  }

  ctx.strokeStyle = "rgba(130, 150, 205, 0.35)";
  ctx.strokeRect(dx, dy, dw, dh);
  caption(ctx, canvas, `${task.char}/${task.pose} — ${task.px.toLocaleString()} px at `
    + `${task.x},${task.y} in ${task.src.split("/").slice(-3).join("/")}`);
}

/**
 * The verdicts, in the shape `sealed_verdicts.json` already holds.
 *
 * Applied by `python3 tools/apply_sealed_verdicts.py <file>`, which merges them
 * into the store rather than replacing it — a queue worked through one fighter
 * at a time should not throw away the fighter before.
 */
function exportBlock(decisions) {
  const out = {};
  const notes = [];
  for (const d of decisions) {
    if (d.status === "skipped") continue;
    if (d.status === "rejected") {
      notes.push(`//   ${d.char}/${d.pose} @${d.x},${d.y}: ${d.note || "flagged, no note"}`);
      continue;
    }
    const ref = `${d.char}/${d.pose}`;
    const what = d.value.background ? "background" : "figure";
    ((out[ref] ??= {})[what] ??= []).push([d.x, d.y]);
  }
  const body = JSON.stringify(out, null, 1);
  return {
    file: "sealed-verdicts.json",
    note: "save it and run `python3 tools/apply_sealed_verdicts.py <file>` — it merges "
      + "into sprites/assets/sealed_verdicts.json and prints the plates worth re-keying.",
    text: notes.length ? `${body}\n\n// flagged:\n${notes.join("\n")}` : body,
  };
}
