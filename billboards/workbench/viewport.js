// A zoomable, pannable 2D viewport for the model workbenches.
//
// Both the billboard and the 3D workbench draw into a fixed 1040×660 canvas
// whose coordinates ARE game pixels — the ground line, the height reference and
// the aim target all live in that space, and every one of them would need
// re-deriving if zoom were bolted on per drawing call. So zoom and pan live in
// one transform instead: `begin(ctx)` pushes it, the workbench keeps drawing in
// game pixels exactly as before, `end(ctx)` pops it, and anything that must
// stay screen-fixed (HUD text) is drawn after the pop.
//
// The one rule for callers: pointer coordinates must go through `toWorld` (not
// the raw canvas point), or clicking a handle stops matching where it is drawn
// the moment anyone touches the zoom slider.
//
// Shared by both workbenches on purpose — the arithmetic is small, but it is
// the kind that goes subtly wrong in one copy and not the other.

/** Pointer event -> canvas pixel coordinates (before zoom/pan). */
export function canvasPoint(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * canvas.width,
           y: ((ev.clientY - r.top) / r.height) * canvas.height };
}

/**
 * `pivot` is the world point zoom grows around when the slider is used — the
 * fighter's feet, so zooming in keeps the character on screen rather than
 * walking off the top-left corner.
 *
 * `ids` names the optional DOM controls: { range, out, in, reset, value }.
 */
export function makeViewport(canvas, pivot, ids = {}) {
  const $ = (id) => (id ? document.getElementById(id) : null);
  const el = { range: $(ids.range), out: $(ids.out), in: $(ids.in),
               reset: $(ids.reset), value: $(ids.value) };

  const vp = {
    z: 1, panX: 0, panY: 0, pivot,
    minZ: 0.4, maxZ: 4,
    panning: false, _last: null,
    pinching: false, // two touch pointers down: single-finger handlers yield
  };

  const clamp = (z) => Math.max(vp.minZ, Math.min(vp.maxZ, z));

  function sync() {
    if (el.range) el.range.value = String(vp.z);
    if (el.value) el.value.textContent = `${vp.z.toFixed(2)}×`;
  }

  /** Canvas point -> world (pre-transform) point. */
  vp.toWorld = (pt) => ({
    x: (pt.x - vp.panX - vp.pivot.x * (1 - vp.z)) / vp.z,
    y: (pt.y - vp.panY - vp.pivot.y * (1 - vp.z)) / vp.z,
  });

  /** World point -> canvas point. */
  vp.toCanvas = (pt) => ({
    x: pt.x * vp.z + vp.panX + vp.pivot.x * (1 - vp.z),
    y: pt.y * vp.z + vp.panY + vp.pivot.y * (1 - vp.z),
  });

  /** Pointer event -> world point, which is what every hit test wants. */
  vp.pointer = (ev) => vp.toWorld(canvasPoint(canvas, ev));

  vp.begin = (ctx) => {
    ctx.save();
    ctx.setTransform(vp.z, 0, 0, vp.z,
      vp.panX + vp.pivot.x * (1 - vp.z),
      vp.panY + vp.pivot.y * (1 - vp.z));
  };
  vp.end = (ctx) => ctx.restore();

  /** Set the zoom, holding `anchor` (a canvas point) still. */
  vp.setZoom = (z, anchor = null) => {
    const next = clamp(z);
    if (anchor) {
      const w = vp.toWorld(anchor);
      vp.z = next;
      vp.panX = anchor.x - vp.z * w.x - vp.pivot.x * (1 - vp.z);
      vp.panY = anchor.y - vp.z * w.y - vp.pivot.y * (1 - vp.z);
    } else {
      vp.z = next;
    }
    sync();
  };

  vp.reset = () => { vp.z = 1; vp.panX = 0; vp.panY = 0; sync(); };

  // Panning: the workbench calls startPan only when nothing nearer the pointer
  // (a handle, the aim crosshair) claimed the press, so dragging the empty
  // background moves the view and dragging a handle never does.
  vp.startPan = (ev) => { vp.panning = true; vp._last = canvasPoint(canvas, ev); };
  vp.movePan = (ev) => {
    if (!vp.panning) return false;
    const pt = canvasPoint(canvas, ev);
    vp.panX += pt.x - vp._last.x;
    vp.panY += pt.y - vp._last.y;
    vp._last = pt;
    return true;
  };
  vp.endPan = () => { vp.panning = false; };

  if (el.range) el.range.oninput = () => vp.setZoom(parseFloat(el.range.value));
  if (el.in) el.in.onclick = () => vp.setZoom(vp.z * 1.25);
  if (el.out) el.out.onclick = () => vp.setZoom(vp.z / 1.25);
  if (el.reset) el.reset.onclick = () => vp.reset();
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    vp.setZoom(vp.z * (ev.deltaY < 0 ? 1.1 : 1 / 1.1), canvasPoint(canvas, ev));
  }, { passive: false });

  // Touch: two fingers pinch to zoom about their midpoint and pan with it.
  // Tracked from raw pointer events so the workbench's own one-finger handlers
  // (bone drags, the crosshair, background panning) stay untouched; while two
  // pointers are down, `vp.pinching` tells them to stand down.
  const touches = new Map();
  let pinchStart = null;
  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType !== "touch") return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: vp.z };
      vp.pinching = true;
      vp.endPan();
    }
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 2 && pinchStart) {
      const [a, b] = [...touches.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 8) {
        const mid = canvasPoint(canvas, { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        vp.setZoom(pinchStart.z * (dist / pinchStart.dist), mid);
      }
    }
  });
  const endTouch = (ev) => {
    touches.delete(ev.pointerId);
    if (touches.size < 2) { pinchStart = null; vp.pinching = false; }
  };
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);

  sync();
  // A probe for the smoke tests, which have to turn a game-pixel position into
  // a click somewhere on a zoomed, panned canvas.
  if (typeof window !== "undefined") window.__viewport = vp;
  return vp;
}
