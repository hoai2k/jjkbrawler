// THE SCENE BECOMES BROKEN GLASS — Thin Ice Breaker, done to the screen.
//
// In the source material Uro's sky is not scenery, it is a SURFACE the whole
// visible world is drawn on: when Thin Ice Breaker lands, the picture itself
// fractures like a windshield and the pieces fall away. The object that
// corresponds to "the picture" in this game is the composited frame, so that
// is what breaks — but LOCALLY. The pane that shatters is a disc of the frame
// around the victim, roughly a third of the screen, because the blow breaks
// the sky around its target; the rest of the picture never stops being the
// live game. Inside the pane: the image freezes with cracks racing across it,
// splits along the fracture, and the shards — real pieces of what was on
// screen — drop away like glass, leaving a dark not-sky hole that then heals
// over as the sky regenerates. No sprite is involved anywhere.
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
// sets slowMo on its slam, so the pane breaks in the same slow-motion beat as
// the blow that broke it. That is not a coincidence; it is the reason the
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
  ringFracs: [0.34, 0.68, 1.0],  // crack rings between impact and the web's rim
  jitter: 0.6,         // 0 = clean starburst, 1 = dropped windscreen
  // The pane is LOCAL: at scale 1 this radius keeps the broken region to
  // roughly a third of the screen's area.
  reach: 330,          // web radius in WORLD units at scale 1
  crackTime: 0.10,     // frozen pane + web drawing itself
  splitTime: 0.16,     // shards parted along the fracture, still in place
  fallTime: 0.6,       // shards dropping away
  regenTime: 0.55,     // the hole healing over — the sky regenerating
  maxShards: 40,       // safety valve; the web above yields ~27
};

const TOTAL = SHATTER.crackTime + SHATTER.splitTime + SHATTER.fallTime + SHATTER.regenTime;

/** Where a sim-space point sits on screen, as fractions, under the flat
 *  camera's framing (translate to centre, scale by zoom). The 2.5D rig frames
 *  the same fighters a few percent differently, which for an effect centred
 *  "roughly on the victim" is inside the noise. Clamped inboard so a pane
 *  centred on someone at the blast zone still lands mostly on screen. */
export function simToScreenFrac(x, y) {
  const cam = state.camera;
  const zoom = cam.zoom || 1;
  return {
    x: Math.min(0.85, Math.max(0.15, ((x - cam.x) * zoom + WORLD.w / 2) / WORLD.w)),
    y: Math.min(0.8, Math.max(0.15, ((y - cam.y) * zoom + WORLD.h / 2) / WORLD.h)),
  };
}

/** Ask for the screen to shatter around a point at the end of THIS frame.
 *
 *  `opts.cx, cy`  the impact, as fractions of the screen (default centre-ish).
 *  `opts.color`   reserved — the mirror hairlines are uncoloured; kept so a
 *                 technique could tint a fracture without a signature change.
 *  `opts.scale`   0..1 overall violence — radius, separation and shard speed
 *                 all follow it (default 1).
 *
 *  One at a time: a second request while one is playing replaces it, because
 *  two half-broken panes on top of each other read as a renderer bug.
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
      if (sh.t >= TOTAL) {
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
  const { crackTime, splitTime, fallTime, regenTime } = SHATTER;
  const fallStart = crackTime + splitTime;
  ctx.save();

  // --- the hole where the pane was --------------------------------------
  // Opens as the shards leave and heals over afterwards — the sky
  // regenerating. Drawn first, so the falling shards pass in front of it.
  if (t > fallStart) {
    const opened = Math.min(1, (t - fallStart) / 0.15);
    const healed = Math.max(0, (t - fallStart - fallTime) / regenTime);
    const holeAlpha = 0.7 * opened * (1 - healed * healed);
    if (holeAlpha > 0.01) {
      ctx.save();
      ctx.beginPath();
      const hull = sh.rays.map((pts) => pts[pts.length - 1]);
      ctx.moveTo(hull[0].x, hull[0].y);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = holeAlpha;
      const g = ctx.createRadialGradient(sh.ix, sh.iy, 0, sh.ix, sh.iy, sh.reach);
      g.addColorStop(0, "#040612");
      g.addColorStop(0.7, "#0a1030");
      g.addColorStop(1, "rgba(10, 16, 48, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(sh.ix - sh.reach, sh.iy - sh.reach, sh.reach * 2, sh.reach * 2);
      ctx.restore();
    }
  }

  // --- phase 1: the frozen pane, cracking -------------------------------
  // Only the pane — outside the web the live game never stops, which is what
  // keeps the break a place in the scene rather than a whole-screen wipe.
  if (t < fallStart) {
    for (const s of sh.shards) drawShard(ctx, s, 0, 0, 0, 1);
  }
  if (t < crackTime + splitTime * 0.6) {
    drawWeb(ctx, sh, Math.min(1, t / crackTime), t < crackTime ? 1 : 0.85);
  }

  // --- phase 2: the pane splits ------------------------------------------
  // The pieces part along the fracture. No stroke on the shard edges — the
  // gap between two pieces of the frozen picture, with the live game showing
  // through it, is the line.
  if (t >= crackTime && t < fallStart) {
    const k = (t - crackTime) / splitTime;
    const part = k * k * 10 * sh.scale;
    for (const s of sh.shards) {
      drawShard(ctx, s, Math.cos(s.away) * part, Math.sin(s.away) * part, s.spin * k * 0.05, 1);
    }
  }

  // --- phase 3: the pieces fall away -------------------------------------
  // Glass drops: a little outward shove, a lot of gravity. The alpha holds
  // until a piece is well on its way — a shard that dissolves the frame it
  // moves reads as fog, not glass.
  if (t >= fallStart && t < fallStart + fallTime) {
    const ft = t - fallStart;
    const fade = ft < fallTime * 0.4 ? 1 : Math.max(0, 1 - (ft - fallTime * 0.4) / (fallTime * 0.6));
    for (const s of sh.shards) {
      const dx = Math.cos(s.away) * s.speed * 0.35 * ft * sh.scale;
      const dy = Math.sin(s.away) * s.speed * 0.2 * ft * sh.scale + 1500 * ft * ft;
      drawShard(ctx, s, 10 * sh.scale * Math.cos(s.away) + dx, 10 * sh.scale * Math.sin(s.away) + dy,
                s.spin * (0.05 + ft * 1.6), fade);
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

/** The crack web, drawn the way a broken mirror reads: HAIRLINES. A shadow
 *  hair under a light hair — the dark and bright edge of a real glass crack —
 *  and nothing thicker; no glow pass, no blaze. It lives only through the
 *  freeze and the first beat of the split — once the pieces move, the gaps
 *  between them are the lines, and drawn ones would double them. */
function drawWeb(ctx, sh, grow, alpha) {
  ctx.save();
  ctx.lineJoin = "round";
  for (const pass of [
    { width: 2.6, style: "rgba(12, 20, 38, 0.5)", a: 0.8 },
    { width: 1.1, style: "rgba(240, 249, 255, 0.9)", a: 0.95 },
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
    // Ring links as broken chords, not closed loops — real fractures link
    // some neighbours and skip others.
    for (let ri = 0; ri < sh.rings.length; ri++) {
      if (grow < sh.rings[ri].frac * 0.9) continue;
      const ring = sh.rings[ri];
      for (let i = 0; i < ring.pts.length; i++) {
        if ((i + ri) % 3 === 2) continue;
        const p2 = ring.pts[i];
        const p3 = ring.pts[(i + 1) % ring.pts.length];
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Capture the frame and cut the pane. Runs once, inside the frame that
 *  triggered. */
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

  // The web, in WORLD units — a LOCAL disc around the impact, not a net over
  // the whole screen.
  const ix = sh.cx * WORLD.w;
  const iy = sh.cy * WORLD.h;
  const reach = SHATTER.reach * (0.55 + 0.45 * sh.scale);

  const n = SHATTER.rays;
  const rays = [];
  for (let i = 0; i < n; i++) {
    const heading = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * (SHATTER.jitter / n) * Math.PI * 2;
    const pts = [{ x: ix, y: iy }];
    for (const frac of SHATTER.ringFracs) {
      const dist = frac * reach * (1 + (Math.random() - 0.5) * 0.12 * SHATTER.jitter);
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

  sh.ix = ix;
  sh.iy = iy;
  sh.reach = reach;
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
