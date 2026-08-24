// CRACKS IN THE SKY — the telegraph half of Uro's glass.
//
// Her techniques break the world in two registers, and this module is the
// quieter one. The IMPACT is src/screen_shatter.js: the whole composited frame
// becomes broken glass and bursts. This is what comes BEFORE it — a fracture
// web growing in the world itself, behind the fighters, marking the spot the
// sky is about to give way. Sky Warp Palm grows one over the target for
// exactly its windup, so the crack completing and the blow landing are the
// same moment and the crack IS the tell; Sky Fold pops a small one where a
// blow was folded away.
//
// It draws through `state.entities`' draw(ctx) in sim coordinates, which is
// the seam that lands it BEHIND the fighters in both renderers — flat,
// render.js draws entities before the bodies; in 2.5D the entity layer is a
// quad behind them (src/camera3d/effects.js). A crack in the sky in front of
// the person standing under it would be a decal; behind them it is a place.

import { state } from "./state.js";
import { playSfx } from "./audio.js";

// Cosmetic tuning — nothing here touches gameplay. Edit freely.
const CRACK = {
  rays: 10,           // fracture lines out of the impact
  ringFracs: [0.45, 0.8],   // where the cross-links sit along them
  jitter: 0.8,        // 0 = clean starburst, 1 = shattered windscreen
  coreWidth: 2.5,     // the white centre of a crack line
  glowWidth: 7,       // the coloured halo under it
};

/** A crack growing in the sky at a sim-space point.
 *
 *  `opts.r`         reach of the fracture web (default 130).
 *  `opts.crackTime` seconds it takes to grow — Sky Warp Palm passes its own
 *                   windup, so the telegraph and the timing are one number.
 *  `opts.holdTime`  fully-cracked linger before the fade (default 0.15).
 *  `opts.color`     glow colour (default Uro's cyan).
 *  `opts.flash`     brighten hard at the end of the growth — the moment the
 *                   sky gives — before fading (default true).
 */
export function spawnSkyCrack(x, y, opts = {}) {
  const r = opts.r ?? 130;
  const crackTime = Math.max(0.05, opts.crackTime ?? 0.3);
  const holdTime = opts.holdTime ?? 0.15;
  const color = opts.color || "#8fd7e8";
  const flash = opts.flash !== false;
  const fadeTime = 0.22;
  const total = crackTime + holdTime + fadeTime;

  // The web, built once: rays with jittered headings and kinked segments.
  const rays = [];
  const n = CRACK.rays;
  for (let i = 0; i < n; i++) {
    const heading = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * (CRACK.jitter / n) * Math.PI * 2;
    const pts = [{ x, y }];
    const segs = 3;
    for (let s = 1; s <= segs; s++) {
      const dist = (s / segs) * r * (1 + (Math.random() - 0.5) * 0.14 * CRACK.jitter);
      const bend = heading + (Math.random() - 0.5) * 0.5 * CRACK.jitter;
      pts.push({ x: x + Math.cos(bend) * dist, y: y + Math.sin(bend) * dist });
    }
    rays.push(pts);
  }
  const along = (pts, frac) => {
    const t = frac * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(t));
    const k = t - i;
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
  };

  state.entities.push({
    kind: "skyCrack", owner: opts.owner || null, t: 0, dead: false,
    update(dt) {
      this.t += dt;
      if (this.t >= total) this.dead = true;
      if (flash && !this.cued && this.t >= crackTime) {
        this.cued = true;
        playSfx("parry", 0.5, 1.6);
      }
    },
    draw(ctx) {
      const t = this.t;
      const grow = Math.min(1, t / crackTime);
      const fade = Math.max(0, Math.min(1, 1 - (t - crackTime - holdTime) / fadeTime));
      if (fade <= 0) return;
      const blaze = flash && t > crackTime - 0.06 && t < crackTime + 0.08 ? 1.6 : 1;
      ctx.save();
      ctx.lineJoin = "round";
      for (const pass of [
        { width: CRACK.glowWidth, style: color, alpha: 0.45 },
        { width: CRACK.coreWidth, style: "#f2fbff", alpha: 0.95 },
      ]) {
        ctx.globalAlpha = pass.alpha * fade * Math.min(1, blaze);
        ctx.strokeStyle = pass.style;
        ctx.lineWidth = pass.width * blaze;
        for (const pts of rays) {
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
        // Cross-links appear once the growth passes them — as broken chords,
        // not a closed loop: real fractures link some neighbours and skip
        // others, and a full ring reads as a drawn asterisk at any size.
        for (let ri = 0; ri < CRACK.ringFracs.length; ri++) {
          const frac = CRACK.ringFracs[ri];
          if (grow < frac) continue;
          for (let i = 0; i < n; i++) {
            if ((i + ri) % 3 === 2) continue;   // the skipped links
            const p2 = along(rays[i], frac * (1 + ((i * 7 + ri * 3) % 5 - 2) * 0.03));
            const p3 = along(rays[(i + 1) % n], frac * (1 + ((i * 5 + ri) % 5 - 2) * 0.03));
            ctx.beginPath();
            ctx.moveTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    },
  });
}
