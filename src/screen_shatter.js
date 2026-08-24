// THE SCENE BECOMES BROKEN GLASS — Thin Ice Breaker, done to the screen.
//
// In the source material Uro's sky is not scenery, it is a SURFACE the whole
// visible world is drawn on: when Thin Ice Breaker lands, the panel itself
// fractures like a windshield and the pieces of the picture burst apart. The
// object that corresponds to "the panel" in this game is the composited frame,
// so that is what breaks. On the impact beat the frame is captured, a fracture
// web is cut through it, and the shards — real pieces of the picture that was
// on screen — hang for a beat, split apart along glowing seams, and fly out,
// while the live game keeps running underneath and is revealed through the
// gaps. No sprite is involved anywhere: the effect IS the screen.
//
// HOW THE CAPTURE WORKS, and why it lives inside render.js's frame. In 2.5D
// the scene is two stacked canvases — the WebGL layer with the world and
// fighters, the 2D overlay with arcs, particles and popups. A WebGL canvas can
// only be read back reliably in the same task that rendered it (the drawing
// buffer is not preserved across frames), so the trigger does not capture:
// it leaves a request on `state.skyShatter`, and `drawScreenShatter` — called
// at the very end of the frame, after both layers are drawn — performs the
// capture right there, where the GL buffer is guaranteed fresh. Flat mode is
// the same call with one canvas.
//
// CLOCK. The animation is stepped by the entity the trigger pushes, which
// means it runs on the SIM clock and inherits slow motion — and the ultimate
// sets slowMo on its slam, so the screen breaks in the same slow-motion beat
// as the blow that broke it. That is not a coincidence; it is the reason the
// clock is the sim's.
//
// All geometry is in WORLD units (the space drawScreenFlash and the banners
// already draw in); the capture is in canvas pixels and the two meet through
// one scale factor at bake time.

import { state } from "./state.js";
import { WORLD } from "./constants.js";
import { playSfx } from "./audio.js";

// Cosmetic tuning — nothing here touches gameplay. Edit freely.
const SHATTER = {
  rays: 9,             // fracture lines out of the impact
  ringFracs: [0.3, 0.62, 1.0],   // crack rings between impact and screen edge
  jitter: 0.6,         // 0 = clean starburst, 1 = dropped windscreen
  crackTime: 0.10,     // frozen frame + web drawing itself
  splitTime: 0.16,     // shards parted along glowing seams, still in place
  flyTime: 0.5,        // shards leaving
  maxShards: 40,       // safety valve; the web above yields ~36
};

/** Where a sim-space point sits on screen, as fractions, under the flat
 *  camera's framing (translate to centre, scale by zoom). The 2.5D rig frames
 *  the same fighters a few percent differently, which for an effect centred
 *  "roughly on the victim" is inside the noise. Clamped inboard so a crack
 *  centred on someone at the blast zone still webs the whole screen. */
export function simToScreenFrac(x, y) {
  const cam = state.camera;
  const zoom = cam.zoom || 1;
  return {
    x: Math.min(0.85, Math.max(0.15, ((x - cam.x) * zoom + WORLD.w / 2) / WORLD.w)),
    y: Math.min(0.8, Math.max(0.15, ((y - cam.y) * zoom + WORLD.h / 2) / WORLD.h)),
  };
}

/** Ask for the screen to shatter at the end of THIS frame.
 *
 *  `opts.cx, cy`  the impact, as fractions of the screen (default centre-ish).
 *  `opts.color`   seam glow (default Uro's cyan).
 *  `opts.scale`   0..1 overall violence — the neutral special passes less,
 *                 the ultimate full (default 1).
 *
 *  One at a time: a second request while one is playing replaces it, because
 *  two half-broken screens on top of each other read as a renderer bug.
 */
export function triggerScreenShatter(opts = {}) {
  state.skyShatter = {
    pending: true,
    cx: opts.cx ?? 0.5,
    cy: opts.cy ?? 0.42,
    color: opts.color || "#8fd7e8",
    scale: Math.max(0.3, Math.min(1, opts.scale ?? 1)),
    t: 0,
    shards: null,
    rays: null,
  };
  // The clock. An entity, so the sim steps it, slow motion stretches it, and a
  // round ending throws it away with everything else.
  state.entities.push({
    kind: "skyShatterClock", owner: opts.owner || null, t: 0, dead: false,
    update(dt) {
      const sh = state.skyShatter;
      if (!sh) { this.dead = true; return; }
      sh.t += dt;
      const total = SHATTER.crackTime + SHATTER.splitTime + SHATTER.flyTime;
      if (sh.t >= total) {
        state.skyShatter = null;
        this.dead = true;
      }
    },
  });
  playSfx("parry", 0.8, 1.4);
}

/** Draw (and on the first frame, capture). Called by render.js after
 *  EVERYTHING else in the frame; `layers` is the canvases under this effect,
 *  bottom first — [glCanvas, overlayCanvas] in 2.5D, [canvas] flat. */
export function drawScreenShatter(ctx, layers) {
  const sh = state.skyShatter;
  if (!sh) return;

  if (sh.pending) {
    build(sh, layers);
    sh.pending = false;
  }
  if (!sh.shards) { state.skyShatter = null; return; }

  const t = sh.t;
  const { crackTime, splitTime, flyTime } = SHATTER;
  ctx.save();

  // --- phase 1: the frozen pane, cracking -------------------------------
  // The captured frame IS the live frame at the moment of capture, so drawing
  // it whole reads as a hit-stop, not a cut — and the cracks race across it.
  if (t < crackTime + splitTime) {
    for (const s of sh.shards) drawShard(ctx, s, 0, 0, 0, 1);
  }
  const grow = Math.min(1, t / crackTime);
  if (t < crackTime + splitTime) {
    drawWeb(ctx, sh, grow, t < crackTime ? 1 : 0.8);
  }

  // --- phase 2: the pane splits along the seams -------------------------
  if (t >= crackTime && t < crackTime + splitTime) {
    const k = (t - crackTime) / splitTime;
    const part = k * k * 9 * sh.scale;          // pixels of separation
    for (const s of sh.shards) {
      drawShard(ctx, s, Math.cos(s.away) * part, Math.sin(s.away) * part, s.spin * k * 0.06, 1);
      seam(ctx, s, sh.color, 0.5 * (1 - k * 0.4));
    }
  }

  // --- phase 3: the pieces leave ----------------------------------------
  if (t >= crackTime + splitTime) {
    const ft = t - crackTime - splitTime;
    // Hold solid for the first stretch of the flight, then go — a shard that
    // starts dissolving the frame it moves reads as fog, not glass.
    const fade = ft < flyTime * 0.35 ? 1 : Math.max(0, 1 - (ft - flyTime * 0.35) / (flyTime * 0.65));
    const ease = ft * ft;
    for (const s of sh.shards) {
      const dx = Math.cos(s.away) * s.speed * ft * sh.scale;
      const dy = Math.sin(s.away) * s.speed * ft * sh.scale + 900 * ease;
      drawShard(ctx, s, 9 * sh.scale * Math.cos(s.away) + dx, 9 * sh.scale * Math.sin(s.away) + dy,
                s.spin * (0.06 + ft * 1.4), fade);
      if (fade > 0.4) seam(ctx, s, sh.color, (fade - 0.4) * 0.6);
    }
  }

  ctx.restore();
}

// --------------------------------------------------------------- internals

function drawShard(ctx, s, dx, dy, rot, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(s.cx + dx, s.cy + dy);
  ctx.rotate(rot);
  ctx.drawImage(s.canvas, s.ox - s.cx, s.oy - s.cy, s.w, s.h);
  ctx.restore();
}

/** A shard's bright edge — the light catching the break. */
function seam(ctx, s, color, alpha) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s.poly[0].x, s.poly[0].y);
  for (let i = 1; i < s.poly.length; i++) ctx.lineTo(s.poly[i].x, s.poly[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** The crack web itself: white cores over a coloured halo, racing outward. */
function drawWeb(ctx, sh, grow, alpha) {
  ctx.save();
  ctx.lineJoin = "round";
  for (const pass of [
    { width: 6, style: sh.color, a: 0.4 },
    { width: 2, style: "#f4fcff", a: 0.95 },
  ]) {
    ctx.globalAlpha = pass.a * alpha;
    ctx.strokeStyle = pass.style;
    ctx.lineWidth = pass.width;
    for (const pts of sh.rays) {
      const tip = grow * (pts.length - 1);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= Math.floor(tip); i++) ctx.lineTo(pts[i].x, pts[i].y);
      const k = tip - Math.floor(tip);
      if (k > 0 && Math.floor(tip) + 1 < pts.length) {
        const p0 = pts[Math.floor(tip)];
        const p1 = pts[Math.floor(tip) + 1];
        ctx.lineTo(p0.x + (p1.x - p0.x) * k, p0.y + (p1.y - p0.y) * k);
      }
      ctx.stroke();
    }
    for (const ring of sh.rings) {
      if (grow < ring.frac * 0.9) continue;
      ctx.beginPath();
      ctx.moveTo(ring.pts[0].x, ring.pts[0].y);
      for (let i = 1; i < ring.pts.length; i++) ctx.lineTo(ring.pts[i].x, ring.pts[i].y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Capture the frame and cut it. Runs once, inside the frame that triggered. */
function build(sh, layers) {
  const base = layers.find((c) => c && c.width > 1);
  if (!base) return;

  // The composite, at the overlay's pixel size. The GL canvas was rendered in
  // this same task, so this readback is the one that is guaranteed to work.
  const cap = document.createElement("canvas");
  cap.width = base.width;
  cap.height = base.height;
  const cctx = cap.getContext("2d");
  for (const layer of layers) {
    if (layer && layer.width > 1) cctx.drawImage(layer, 0, 0, cap.width, cap.height);
  }
  const kx = cap.width / WORLD.w;
  const ky = cap.height / WORLD.h;

  // The web, in WORLD units, from the impact to past every screen corner so
  // the shards tile the whole picture.
  const ix = sh.cx * WORLD.w;
  const iy = sh.cy * WORLD.h;
  const reach = Math.max(
    Math.hypot(ix, iy), Math.hypot(WORLD.w - ix, iy),
    Math.hypot(ix, WORLD.h - iy), Math.hypot(WORLD.w - ix, WORLD.h - iy),
  ) * 1.15;

  const n = SHATTER.rays;
  const rays = [];
  for (let i = 0; i < n; i++) {
    const heading = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * (SHATTER.jitter / n) * Math.PI * 2;
    const pts = [{ x: ix, y: iy }];
    for (const frac of SHATTER.ringFracs) {
      const dist = frac * reach * (1 + (Math.random() - 0.5) * 0.1 * SHATTER.jitter);
      const bend = heading + (Math.random() - 0.5) * 0.3 * SHATTER.jitter;
      pts.push({ x: ix + Math.cos(bend) * dist, y: iy + Math.sin(bend) * dist });
    }
    rays.push(pts);
  }
  const rings = SHATTER.ringFracs.slice(0, -1).map((frac, r) => ({
    frac, pts: rays.map((pts) => pts[r + 1]),
  }));

  // Shards: the quads between neighbouring rays and consecutive rings, plus
  // the innermost fans. Clipped to the screen, baked once from the capture.
  const shards = [];
  const stops = [0, ...SHATTER.ringFracs];
  for (let i = 0; i < n && shards.length < SHATTER.maxShards; i++) {
    const a = rays[i];
    const b = rays[(i + 1) % n];
    for (let f = 0; f + 1 < stops.length; f++) {
      const poly = f === 0
        ? [a[0], a[1], b[1]]
        : [a[f], a[f + 1], b[f + 1], b[f]];
      const baked = bake(cap, kx, ky, poly);
      if (!baked) continue;
      const cx2 = poly.reduce((s2, p2) => s2 + p2.x, 0) / poly.length;
      const cy2 = poly.reduce((s2, p2) => s2 + p2.y, 0) / poly.length;
      shards.push({
        ...baked, poly, cx: cx2, cy: cy2,
        away: Math.atan2(cy2 - iy, cx2 - ix),
        speed: 320 + Math.random() * 420,
        spin: (Math.random() - 0.5) * 3,
      });
    }
  }

  sh.rays = rays;
  sh.rings = rings;
  sh.shards = shards.length ? shards : null;
}

/** One shard cut from the capture: a WORLD-unit bbox canvas holding the
 *  clipped piece, or null when the polygon misses the screen entirely. */
function bake(cap, kx, ky, poly) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const ox = Math.max(0, Math.floor(Math.min(...xs)));
  const oy = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(WORLD.w, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(WORLD.h, Math.ceil(Math.max(...ys)));
  const w = x1 - ox;
  const h = y1 - oy;
  if (w < 3 || h < 3) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * kx));
  canvas.height = Math.max(1, Math.round(h * ky));
  const ctx = canvas.getContext("2d");
  ctx.scale(kx, ky);
  ctx.translate(-ox, -oy);
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(cap, 0, 0, cap.width, cap.height, 0, 0, WORLD.w, WORLD.h);
  return { canvas, ox, oy, w, h };
}
