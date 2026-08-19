// The entity effect layer, as one quad on the gameplay plane.
//
// THE PROBLEM THIS SOLVES. Everything in `state.entities` — traps, ultimate
// waves, summon flashes, stage hazards — paints itself with arbitrary canvas
// 2D code in sim coordinates. Flat, render.js runs those draws BEFORE
// drawFighters, so an effect passes behind the bodies and you can still read
// who is standing in it. In 2.5D the bodies moved to the WebGL layer and the
// entity draws stayed on the overlay canvas, which is strictly above it — so
// every one of them landed in FRONT of every fighter. Gakuganji's Encore is
// 300 px of energy art at 60% alpha; a fighter under it was gone, and so was
// the fighter twenty metres away who had nothing to do with it.
//
// Reordering the overlay cannot fix that: the fighters are not on it. Nor can
// the entities each be turned into a quad — they are drawing code, not
// pictures, and there are dozens of them.
//
// So the WHOLE LAYER becomes one picture. The entities draw, unmodified, into
// an offscreen canvas covering the sim rectangle the camera can currently see,
// and that canvas goes into the scene as a single textured quad on z = 0,
// behind the fighters. Draw order is restored exactly, every effect at once,
// with no per-effect work and no change to flat mode.
//
// The rect is squared to the canvas's own aspect so the scale is uniform in x
// and y — the camera's yaw makes the projected sim rect a hair non-rectangular
// and fitting a stretched rect to it would smear the art.
//
// The canvas is sized to the pixels it is actually displayed at rather than to
// a constant (see EFFECT_LAYER in config_camera.js, and `resize` below); the
// aspect is WORLD's either way, so only the resolution moves.

import { CanvasTexture, SRGBColorSpace, LinearFilter } from "../../vendor/three/three.module.js";
import { overlayTransform } from "./rig.js";
import { WORLD } from "../constants.js";
import { EFFECT_LAYER } from "../config_camera.js";
import { clamp } from "../utils.js";

/** The sim-space rectangle the camera can see this frame, from the same affine
 *  the overlay canvas positions itself with — inverted. Returns null if the
 *  transform is degenerate (it never is; the guard is free). */
function visibleSimRect() {
  const t = overlayTransform();
  const det = t.a * t.d - t.b * t.c;
  if (!det) return null;
  const inv = (x, y) => {
    const dx = x - t.e;
    const dy = y - t.f;
    return { x: (dx * t.d - dy * t.c) / det, y: (dy * t.a - dx * t.b) / det };
  };
  const pts = [inv(0, 0), inv(WORLD.w, 0), inv(0, WORLD.h), inv(WORLD.w, WORLD.h)];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  // A margin, because an effect whose centre is just off screen can still have
  // art reaching into it, and because clipping one at the frame edge would be
  // a seam that moves with the camera.
  const mx = (x1 - x0) * 0.06;
  const my = (y1 - y0) * 0.06;
  x0 -= mx; x1 += mx; y0 -= my; y1 += my;
  // Square to the canvas aspect about the centre, so one scale serves both
  // axes and the art is never stretched.
  let w = x1 - x0;
  let h = y1 - y0;
  const aspect = WORLD.w / WORLD.h;
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

export function makeEffectLayer() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let texture = null;

  /** Point the scene at a texture matching the canvas as it now is.
   *
   *  A CanvasTexture is allocated at its source's size on first upload and
   *  every upload after that is a texSubImage2D into that allocation (three's
   *  `allocateMemory` is false once `__version` is set), so a canvas that
   *  changes size underneath one does not merely look wrong — it feeds GL a
   *  picture that no longer fits the storage it was given. Resizing therefore
   *  retires the old texture and hangs a new one, which is cheap because it
   *  happens on window resize and fullscreen, not per frame. */
  function attach() {
    texture?.dispose();
    texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    // NO MIPMAPS. three's default for a CanvasTexture is LinearMipmapLinearFilter
    // with generateMipmaps on, so every one of the per-frame uploads below also
    // built the whole mip chain — an eleven-level reduction, 60 times a second,
    // for a picture that is never minified: the canvas is sized at or below
    // what it is displayed at (resize, below), so the quad only ever magnifies
    // it. Not one of those levels was ever sampled.
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
  }

  /** Size the canvas to the pixels it is actually displayed at, clamped by
   *  EFFECT_LAYER. `bufferW` is the GL canvas's drawing-buffer width — the CSS
   *  box times the DPR — which is the number of real pixels this layer's quad
   *  will be stretched across. WORLD's aspect is kept whatever happens, because
   *  visibleSimRect squares its rect to that aspect and the draw below maps the
   *  two with a single uniform scale. */
  function resize(bufferW) {
    const max = WORLD.w * EFFECT_LAYER.maxScale;
    const w = Math.round(clamp(bufferW || WORLD.w, EFFECT_LAYER.minWidth, max));
    const h = Math.round(w * WORLD.h / WORLD.w);
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    attach();
  }

  resize(WORLD.w);

  return {
    get texture() { return texture; },
    resize,
    /** The canvas's current pixel size, for debugStats — a layer silently stuck
     *  at the wrong resolution looks exactly like one at the right one. */
    size: () => [canvas.width, canvas.height],
    /** Repaint the layer from this frame's entities. Returns the sim rect the
     *  texture covers, or null when there is nothing to draw — the caller
     *  skips the quad entirely, so a match with no effects on screen pays
     *  neither the canvas clear nor the texture upload. */
    update(st) {
      // An entity ARMS this whole layer just by having a `draw`, whatever that
      // draw does — a full-canvas clear, every entity called, and a texture
      // upload. So an empty `draw() {}` is not the free no-op it looks
      // like: five boards whose gimmicks only move platforms carried one, and
      // paid the entire layer every frame of every match to paint nothing.
      // A board with nothing to draw should not define `draw` at all.
      let any = false;
      for (const e of st.entities) if (e.draw) { any = true; break; }
      if (!any) return null;
      const rect = visibleSimRect();
      if (!rect || !(rect.w > 0) || !(rect.h > 0)) return null;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const s = canvas.width / rect.w;
      ctx.setTransform(s, 0, 0, s, -rect.x * s, -rect.y * s);
      for (const e of st.entities) {
        if (!e.draw) continue;
        // One bad effect must not take the frame down with it, and the canvas
        // state must not leak from one to the next whatever they do to it.
        ctx.save();
        try { e.draw(ctx); } catch { /* the flat path logs it; here it is a no-op */ }
        ctx.restore();
      }
      texture.needsUpdate = true;
      return rect;
    },
  };
}
