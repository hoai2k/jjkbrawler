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
import { openLasso } from "./sealed_lasso.js";

const QUEUE = "../sprites/assets/sealed_queue.json";
const PLATE_ROOT = "../";

/** Everything the game can put on screen, or that somebody is waiting on. */
export const provider = () => build((r) => r.band !== "other");

/** The rest: cells and banked alternates nothing reaches. Its own queue so the
 *  main one is all art with consequences — a patch nobody can see should never
 *  be between the reviewer and one that is on screen. */
export const unusedProvider = () => build((r) => r.band === "other");

async function build(inBand) {
  const doc = await fetch(QUEUE).then((r) => (r.ok ? r.json() : { regions: [] }))
    .catch(() => ({ regions: [] }));
  // ONE FIGHTER AT A TIME, from the address bar: `&char=kashimo`. The queue is
  // meant to be worked at leisure, so the useful unit is a fighter — their
  // plates share a costume and a palette, and the same judgement carries down
  // the list. Without it the order still groups them, band first.
  const want = new URL(location.href).searchParams.get("char");
  const regions = (doc.regions || [])
    .filter(inBand)
    .filter((r) => !want || r.char === want);

  const tasks = regions.map((r) => ({
    id: `${r.char}/${r.pose}@${r.x},${r.y}`,
    title: `${r.char} · ${r.pose}`,
    subtitle: `${r.px.toLocaleString()} px — the keyer ${r.now === "cut" ? "cuts" : "keeps"} it today`
      + (r.band === "flagged" ? " · flagged" : r.band === "held" ? " · held" : "")
      + (r.loops ? ` · split into ${r.loops.length}`
         : r.mark === "mixed" ? " · marked part-and-part"
         : r.mark === "other" ? " · marked another alpha fault" : ""),
    ...r,
    exportKeys: { char: r.char, pose: r.pose, x: r.x, y: r.y },
  }));

  return {
    tasks,
    // The queue is rebuilt from the plates and the answers already given, so a
    // rebuild is a different set of questions and older decisions were answers
    // to a different one.
    fingerprint: `sealed-${regions.length}-${regions.map((r) => `${r.char}/${r.pose}@${r.x},${r.y}`).join("|").length}`,
    initialValue: (task) => ({
      background: task.now === "cut",
      mixed: task.mark === "mixed" || !!task.loops,
      other: task.mark === "other",
      ...(task.loops ? { loops: task.loops } : {}),
    }),
    describe: (task, value) => {
      const now = task.now === "cut" ? "cuts it away" : "keeps it";
      if (value.mixed && value.loops?.length) {
        return `The keyer <b>${now}</b> today. Split by hand into <b>${value.loops.length} `
          + `drawn part${value.loops.length === 1 ? "" : "s"}</b>.<br>`
          + "What the loops cover is the fighter and is kept; the rest of the patch is "
          + "background and is cut. Reopen the window to change where the line goes.";
      }
      if (value.mixed) {
        return `The keyer <b>${now}</b> today. Marked as <b>part gap, part shadow</b>.<br>`
          + "One point cannot answer for two halves. Draw the split to say where the line "
          + "goes — or leave it, and it is recorded as art wanting a hand mask or a redraw "
          + "and comes back to be judged again.";
      }
      if (value.other) {
        return `The keyer <b>${now}</b> today. Marked as <b>a different alpha fault</b>.<br>`
          + "Not a keying decision at all — a ghost image, a trail, something that wants "
          + "removing rather than a better key. Recorded and brought back afterwards.";
      }
      const want = value.background ? "the stage showing through" : "drawn on the fighter";
      return `The keyer <b>${now}</b> today. Marked as <b>${want}</b>.<br>`
        + "Is the outlined patch a hole in the fighter, or a shadow lying on them?";
    },
    // ALREADY ANSWERED, AND BACK ANYWAY. A region leaves the queue the moment
    // its verdict is applied — except the two that are not answers the keyer
    // can carry out: "part gap, part shadow" and "another alpha fault" come
    // back on purpose, because they are work somebody still means to do. They
    // were indistinguishable from a question nobody had touched, so a pass
    // through the to-do list kept running into decisions already sent. Saying
    // they are committed puts them under "answered", where they can still be
    // revisited, and leaves the to-do list as the things genuinely unjudged.
    committed: (task) => !!task.mark || !!task.loops,
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
      // A FAILURE IS NOT CACHED. These plates are a megabyte and a half and the
      // queue prefetches its neighbours, so a request that loses a race leaves
      // one item permanently reading "no plate loaded" if the miss is stored
      // as an answer. Nothing is written, the next visit asks again, and the
      // canvas says "loading" rather than "not there" in the meantime.
      img.onerror = () => resolve(true);
      img.src = PLATE_ROOT + task.src;
    }).then((v) => { loading.delete(task.src); return v; });
    loading.set(task.src, job);
  }
  return job;
}

/**
 * The region, decoded from the run lengths the queue carries.
 *
 * IT USED TO BE FOUND AGAIN HERE, by flooding the screen colour out from the
 * seed point, and that was wrong twice. The key was read from the plate's
 * top-left corner, so Dagon's magenta screen — whose corner is 36 apart from
 * the patch in the middle of him — matched nothing and the patch was never
 * outlined at all: the reviewer was shown a picture with no question on it.
 * And where the key was right, a flood with no variance test and nothing to
 * stop it at the silhouette ran 36% past the real region. Asking somebody to
 * judge one patch means outlining that patch, so the keyer sends its own.
 */
function maskFor(task) {
  const hit = masks.get(task.id);
  if (hit) return hit;
  if (!task.rle || !task.box) return null;
  const [bx0, by0, bx1, by1] = task.box;
  const w = bx1 - bx0, h = by1 - by0;
  const inside = new Uint8Array(w * h);
  let at = 0, on = 0;
  for (const run of task.rle) {
    if (on) inside.fill(1, at, at + run);
    at += run;
    on ^= 1;
  }
  const out = { w, h, x0: bx0, y0: by0, inside };
  masks.set(task.id, out);
  return out;
}

/** Even-odd point in polygon, over however many loops were drawn. */
function inAnyLoop(loops, x, y) {
  for (const loop of loops) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const [xi, yi] = loop[i], [xj, yj] = loop[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

function renderEditor(task, { container, value, onChange, bindSync }) {
  container.replaceChildren();
  let live = value;
  const wrap = document.createElement("div");
  wrap.className = "v-nav v-nav--wrap";
  wrap.innerHTML =
    `<button class="ghost sm" data-act="gap" type="button">Gap — cut it away</button>`
    + `<button class="ghost sm" data-act="shadow" type="button">Shadow — it is the fighter</button>`
    + `<button class="ghost sm" data-act="both" type="button">Both — part gap, part shadow</button>`
    + `<button class="ghost sm" data-act="other" type="button">Other alpha fault — ghosts, trails</button>`
    + `<button class="ghost sm" data-act="split" type="button" hidden>Draw the split…</button>`
    + `<button class="ghost sm" data-act="reset" type="button">Back to what the keyer does</button>`;
  const paint = () => {
    const plain = !live.mixed && !live.other;
    wrap.querySelector('[data-act="gap"]').classList.toggle("on", plain && live.background);
    wrap.querySelector('[data-act="shadow"]').classList.toggle("on", plain && !live.background);
    wrap.querySelector('[data-act="both"]').classList.toggle("on", !!live.mixed);
    wrap.querySelector('[data-act="other"]').classList.toggle("on", !!live.other);
    // Only offered on a patch that has been called part-and-part, because that
    // is the only answer a line through the middle can improve on.
    const split = wrap.querySelector('[data-act="split"]');
    split.hidden = !live.mixed;
    split.textContent = live.loops?.length
      ? `Redraw the split (${live.loops.length} loop${live.loops.length === 1 ? "" : "s"})`
      : "Draw the split…";
    split.classList.toggle("on", !!live.loops?.length);
  };
  // DELIBERATELY DOES NOT ADVANCE. The answer repaints the canvas — a gap turns
  // into the hole it would leave — and seeing that is half of checking it. The
  // bench's own Next is one key away.
  // Every button states the WHOLE answer. `onChange` merges its patch into the
  // value in play rather than replacing it — which is right for a slider that
  // owns one axis, and wrong for four buttons that are one choice between them:
  // pressing Gap on a patch already marked part-and-part left both flags on,
  // and the panel went on reading "part gap, part shadow" whatever was pressed.
  const answer = (v) => onChange({ background: false, mixed: false, other: false, ...v });
  wrap.querySelector('[data-act="gap"]').addEventListener("click", () => answer({ background: true }));
  wrap.querySelector('[data-act="shadow"]').addEventListener("click", () => answer({ background: false }));
  wrap.querySelector('[data-act="both"]').addEventListener("click", () => answer({ mixed: true }));
  wrap.querySelector('[data-act="other"]').addEventListener("click", () => answer({ other: true }));
  wrap.querySelector('[data-act="split"]').addEventListener("click", async () => {
    const img = plates.get(task.src);
    if (!img) return;
    // Cancel and "no loops" are different answers, so a cancel leaves whatever
    // was there rather than quietly clearing it.
    const loops = await openLasso({ task, img, loops: live.loops || [], mask: maskFor(task) });
    if (loops) onChange({ mixed: true, background: false, other: false, loops });
  });
  wrap.querySelector('[data-act="reset"]')
    .addEventListener("click", () => answer({ background: task.now === "cut" }));
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
    ctx.fillText(`loading ${task.src.split("/").slice(-3).join("/")}…`, 20, 40);
    ensureReady(task);
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
      if (value.mixed && value.loops?.length) {
        // The split, drawn as what it produces: kept where a loop covers it,
        // cut everywhere else in the patch.
        const x = i % m.w, y = (i - x) / m.w;
        const keep = inAnyLoop(value.loops, x + m.x0, y + m.y0);
        if (keep) {
          px.data[j] = 255; px.data[j + 1] = 214; px.data[j + 2] = 64;
          px.data[j + 3] = edge ? 255 : 70;
        } else {
          const on = ((x >> 3) + (y >> 3)) & 1;
          px.data[j] = on ? 235 : 40; px.data[j + 1] = on ? 60 : 20;
          px.data[j + 2] = on ? 150 : 40; px.data[j + 3] = edge ? 255 : 205;
        }
      } else if (value.mixed || value.other) {
        // Neither answer, and it should not look like either: a hatch over art
        // left exactly as it is — amber for part-and-part, blue for a fault the
        // key cannot fix.
        const x = i % m.w, y = (i - x) / m.w;
        const on = ((x + y) >> 2) & 1;
        if (value.mixed) {
          px.data[j] = 235; px.data[j + 1] = on ? 170 : 120; px.data[j + 2] = 20;
        } else {
          px.data[j] = on ? 90 : 40; px.data[j + 1] = on ? 170 : 110; px.data[j + 2] = 245;
        }
        px.data[j + 3] = edge ? 255 : 120;
      } else if (value.background) {
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
    // THE MASK IS THE REGION'S OWN BOX, NOT THE CROP. It used to be the size of
    // the crop, because the bench found the region itself by flooding over the
    // crop, and this blitted it corner to corner. Now the keyer sends the region
    // in its own bounding box — smaller, and offset inside the crop — so it has
    // to be placed and scaled like anything else, or the highlight stretches
    // across the whole picture and lands nowhere near the patch it describes.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, dx + (m.x0 - x0) * scale, dy + (m.y0 - y0) * scale,
                  m.w * scale, m.h * scale);
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
    // A split is a different shape of answer — a point AND the loops that cut it
    // in two — so it goes in its own list rather than pretending to be a point.
    if (d.value.mixed && d.value.loops?.length) {
      ((out[ref] ??= {}).split ??= []).push({ at: [d.x, d.y], shadow: d.value.loops });
      continue;
    }
    const what = d.value.mixed ? "mixed" : d.value.other ? "other"
      : d.value.background ? "background" : "figure";
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
