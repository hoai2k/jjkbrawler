// DRAWING THE LINE THROUGH A PATCH THAT IS BOTH.
//
// Most sealed patches are one thing or the other and a button settles them. Some
// are genuinely both: a shadow on a sleeve that runs into the gap beside the arm,
// with nothing between them, so they key as one region and one point cannot
// answer for two halves. Before this the only honest answer was "mixed", which
// recorded the problem and fixed nothing.
//
// So: lasso the parts that are the FIGURE, and everything else in the patch is
// background. That is the whole contract — the loops are the shadow, the rest is
// the gap — and it is stored in the delivered plate's own pixels beside the
// verdict, so it survives every re-key of that drawing exactly as a verdict does.
//
// The window is big, zoomable and pannable because the line usually matters at
// the pixel: wheel to zoom about the cursor, drag with the right or middle
// button (or hold space) to pan, drag with the left to draw. It opens framed on
// the patch, since that is what is being asked about.
//
// It draws the RESULT rather than the tool: the part that will be cut is shown
// as the hole it will leave, and the part the loops keep is shown solid. The
// question is what the sprite will look like, so the answer should be a picture
// of the sprite.

const STYLE = `
.lasso-wrap { position: fixed; inset: 0; z-index: 400; display: flex; flex-direction: column;
  background: rgba(8, 10, 16, 0.97); }
.lasso-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 16px; border-bottom: 1px solid rgba(130, 150, 205, 0.25); }
.lasso-bar h2 { margin: 0 8px 0 0; font: 600 15px/1.3 system-ui, sans-serif; color: #e7eaf4; }
.lasso-bar p { margin: 0; font: 12px/1.4 system-ui, sans-serif; color: #9aa4c0; flex: 1 1 260px; }
.lasso-bar b { color: #cfd6ea; font-weight: 600; }
.lasso-stage { flex: 1; position: relative; overflow: hidden; cursor: crosshair; }
.lasso-stage.panning { cursor: grabbing; }
.lasso-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.lasso-count { font: 12px/1 ui-monospace, monospace; color: #9aa4c0; }
`;

let styled = false;

/**
 * Open the editor on one region.
 *
 * `task` carries the plate, the region's box and its run lengths; `img` is the
 * plate already loaded by the bench. Resolves to an array of loops in PLATE
 * pixels, or null if the reviewer cancelled — null and [] mean different things,
 * so a cancel does not read as "no shadow in this patch".
 */
export function openLasso({ task, img, loops = [], mask }) {
  if (!styled) {
    const el = document.createElement("style");
    el.textContent = STYLE;
    document.head.append(el);
    styled = true;
  }
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "lasso-wrap";
    wrap.innerHTML = `
      <div class="lasso-bar">
        <h2>${task.char} · ${task.pose}</h2>
        <p>Draw round the parts of the patch that are <b>the fighter</b> — a shadow, a
           fold, anything drawn on them. Everything else in the patch is treated as
           <b>background</b> and cut. Wheel zooms · right-drag or space pans · left-drag draws.</p>
        <span class="lasso-count"></span>
        <button class="ghost sm" data-act="undo" type="button">Undo loop</button>
        <button class="ghost sm" data-act="clear" type="button">Clear</button>
        <button class="ghost sm" data-act="fit" type="button">Fit patch</button>
        <button class="ghost sm" data-act="cancel" type="button">Cancel</button>
        <button class="ghost sm" data-act="save" type="button">Save the split</button>
      </div>
      <div class="lasso-stage"><canvas></canvas></div>`;
    document.body.append(wrap);

    const stage = wrap.querySelector(".lasso-stage");
    const cv = wrap.querySelector("canvas");
    const ctx = cv.getContext("2d");
    const drawn = loops.map((l) => l.map((p) => [...p]));
    let live = null;              // the loop being drawn
    let view = { s: 1, x: 0, y: 0 };
    let panning = null, spaceDown = false;

    const toPlate = (ev) => {
      const r = cv.getBoundingClientRect();
      return [(ev.clientX - r.left - view.x) / view.s, (ev.clientY - r.top - view.y) / view.s];
    };

    function fit() {
      const [x0, y0, x1, y1] = task.crop;
      const w = cv.width, h = cv.height;
      view.s = Math.min(w / (x1 - x0), h / (y1 - y0)) * 0.9;
      view.x = w / 2 - ((x0 + x1) / 2) * view.s;
      view.y = h / 2 - ((y0 + y1) / 2) * view.s;
    }

    // The region's own pixels, as a canvas that can be drawn through the same
    // transform as the plate — so the tint lands exactly on the patch at any zoom.
    const patch = document.createElement("canvas");
    if (mask) {
      patch.width = mask.w; patch.height = mask.h;
      const pc = patch.getContext("2d");
      const px = pc.createImageData(mask.w, mask.h);
      for (let i = 0; i < mask.inside.length; i++) {
        if (!mask.inside[i]) continue;
        px.data[i * 4] = 255; px.data[i * 4 + 1] = 255;
        px.data[i * 4 + 2] = 255; px.data[i * 4 + 3] = 255;
      }
      pc.putImageData(px, 0, 0);
    }

    /** The patch, split by the loops: kept where a loop covers it, cut elsewhere. */
    function paintPatch() {
      if (!mask) return;
      const off = document.createElement("canvas");
      off.width = mask.w; off.height = mask.h;
      const oc = off.getContext("2d");
      // start from the whole patch, then knock the loops out of it
      oc.drawImage(patch, 0, 0);
      oc.globalCompositeOperation = "destination-out";
      oc.translate(-mask.x0, -mask.y0);
      for (const loop of [...drawn, ...(live && live.length > 2 ? [live] : [])]) {
        oc.beginPath();
        loop.forEach(([x, y], i) => (i ? oc.lineTo(x, y) : oc.moveTo(x, y)));
        oc.closePath();
        oc.fill();
      }
      oc.setTransform(1, 0, 0, 1, 0, 0);
      // what is left will be cut: show it as the hole it leaves
      oc.globalCompositeOperation = "source-in";
      const cell = 8;
      for (let y = 0; y < mask.h; y += cell) {
        for (let x = 0; x < mask.w; x += cell) {
          oc.fillStyle = ((x / cell + y / cell) & 1) ? "#eb3c96" : "#281828";
          oc.fillRect(x, y, cell, cell);
        }
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, mask.x0, mask.y0);
      ctx.imageSmoothingEnabled = true;
    }

    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0d1018";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(view.s, 0, 0, view.s, view.x, view.y);
      ctx.drawImage(img, 0, 0);
      paintPatch();
      const line = 1.6 / view.s;
      for (const loop of drawn) {
        ctx.beginPath();
        loop.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = "rgba(255, 214, 64, 0.18)";
        ctx.strokeStyle = "rgba(255, 214, 64, 0.95)";
        ctx.lineWidth = line;
        ctx.fill(); ctx.stroke();
      }
      if (live && live.length > 1) {
        ctx.beginPath();
        live.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = "rgba(120, 220, 255, 0.95)";
        ctx.lineWidth = line;
        ctx.stroke();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      wrap.querySelector(".lasso-count").textContent =
        `${drawn.length} loop${drawn.length === 1 ? "" : "s"}`;
    }

    function resize() {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      render();
    }

    // A canvas sized in device pixels but laid out in CSS pixels needs the
    // pointer scaled too, or the line lands where the cursor is not.
    const dprOf = () => cv.width / cv.getBoundingClientRect().width;

    cv.addEventListener("pointerdown", (ev) => {
      cv.setPointerCapture(ev.pointerId);
      if (ev.button !== 0 || spaceDown) {
        panning = { x: ev.clientX, y: ev.clientY };
        stage.classList.add("panning");
        return;
      }
      const d = dprOf();
      const r = cv.getBoundingClientRect();
      live = [[((ev.clientX - r.left) * d - view.x) / view.s,
               ((ev.clientY - r.top) * d - view.y) / view.s]];
      render();
    });
    cv.addEventListener("pointermove", (ev) => {
      if (panning) {
        const d = dprOf();
        view.x += (ev.clientX - panning.x) * d;
        view.y += (ev.clientY - panning.y) * d;
        panning = { x: ev.clientX, y: ev.clientY };
        render();
        return;
      }
      if (!live) return;
      const d = dprOf();
      const r = cv.getBoundingClientRect();
      const p = [((ev.clientX - r.left) * d - view.x) / view.s,
                 ((ev.clientY - r.top) * d - view.y) / view.s];
      const last = live[live.length - 1];
      // one point per plate pixel of travel is plenty, and keeps the stored
      // loop small enough to read in a diff
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) * view.s > 2) {
        live.push(p);
        render();
      }
    });
    const finish = () => {
      if (panning) { panning = null; stage.classList.remove("panning"); return; }
      if (live && live.length > 2) drawn.push(live.map(([x, y]) => [Math.round(x), Math.round(y)]));
      live = null;
      render();
    };
    cv.addEventListener("pointerup", finish);
    cv.addEventListener("pointercancel", finish);
    cv.addEventListener("contextmenu", (ev) => ev.preventDefault());
    cv.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const d = dprOf();
      const r = cv.getBoundingClientRect();
      const mx = (ev.clientX - r.left) * d, my = (ev.clientY - r.top) * d;
      const k = Math.exp(-ev.deltaY * 0.0018);
      const s = Math.max(0.05, Math.min(40, view.s * k));
      view.x = mx - (mx - view.x) * (s / view.s);
      view.y = my - (my - view.y) * (s / view.s);
      view.s = s;
      render();
    }, { passive: false });

    const onKey = (ev) => {
      if (ev.code === "Space") { spaceDown = ev.type === "keydown"; ev.preventDefault(); }
      if (ev.type !== "keydown") return;
      if (ev.key === "Escape") close(null);
      if (ev.key === "Enter") close(drawn);
      if ((ev.key === "z" || ev.key === "Z") && (ev.metaKey || ev.ctrlKey)) {
        drawn.pop(); render();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    function close(result) {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("resize", onResize);
      wrap.remove();
      resolve(result);
    }

    wrap.querySelector('[data-act="undo"]').onclick = () => { drawn.pop(); render(); };
    wrap.querySelector('[data-act="clear"]').onclick = () => { drawn.length = 0; render(); };
    wrap.querySelector('[data-act="fit"]').onclick = () => { fit(); render(); };
    wrap.querySelector('[data-act="cancel"]').onclick = () => close(null);
    wrap.querySelector('[data-act="save"]').onclick = () => close(drawn);

    resize();
    fit();
    render();
  });
}
