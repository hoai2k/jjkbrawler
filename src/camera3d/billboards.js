// Fighters and projectiles as textured quads on the gameplay plane.
//
// Placement parity with the flat renderer is BY CONSTRUCTION, not by
// approximation: each quad's matrix is composed by replaying the exact
// canvas-transform chain drawCharFrame performs (translate, squash about the
// centre of mass, rotate about it, mirror, image rect), in sim coordinates,
// inside a group whose transform is the sim→world mapping. Whatever the flat
// renderer draws at (x, y), the billboard shows at the same point of z = 0.
//
// Reads the same data the flat path reads: frameMeta/frameImage placement,
// currentFrame for the pose, fighterTransform for lean/squash/tumble. Glow
// halos (canvas shadowBlur) have no cheap GL equivalent and are skipped; the
// overlay still draws every particle and arc on top.

import {
  CanvasTexture, SRGBColorSpace, AdditiveBlending, NormalBlending,
} from "../../vendor/three/three.module.js";
import {
  makeQuadPool, imageTexture, rectMatrix, ORDER,
  matIdentity, matTranslate, matScale, matRotate,
} from "./quads.js";
import { frameMeta, frameImage, getImage } from "../assets.js";
import { currentFrame } from "../render_backend.js";
import { anchorPoint, frameFootY } from "../../sprites/src/sprites.js";
import { getActor } from "../characters.js";
import { fighterTransform, trailStrength } from "../motion.js";
import { TRAIL_ALPHA } from "../config_tuning.js";
import { CELL_W } from "../constants.js";

const DEG = Math.PI / 180;

// Soft radial orb for projectiles that have no sprite — the GL stand-in for
// the flat renderer's radial-gradient ball, one texture per colour.
const orbCache = new Map();

function orbTexture(color) {
  let tex = orbCache.get(color);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  orbCache.set(color, tex);
  return tex;
}

// Shared shadow blob under each fighter.
let shadowTex = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 24;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 12, 2, 32, 12, 30);
  g.addColorStop(0, "rgba(2,3,8,1)");
  g.addColorStop(1, "rgba(2,3,8,0)");
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(32, 12); ctx.scale(1, 24 / 64); ctx.translate(-32, -12 * 64 / 24);
  ctx.fillRect(0, 0, 64, 64);
  ctx.restore();
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

export function makeBillboards() {
  const pool = makeQuadPool(); // its group is added to the sim group by index.js

  /** The drawCharFrame transform chain as a matrix, quad space -> sim space.
   *  Mirrors sprites.js drawCharFrame line for line. */
  function charFrameMatrix(charKey, frameKey, x, y, opts) {
    const meta = frameMeta(charKey, frameKey);
    if (!meta) return null;
    const scale = (opts.scale ?? 0.6) * (meta.renderScale || 1);
    const facing = (opts.facing ?? 1) * (meta.faceLeft ? -1 : 1);
    const anchorY = frameFootY(meta);
    const rotation = (opts.rotation || 0) + (meta.rotationDeg || 0) * DEG * facing;
    const sx = opts.scaleX ?? 1;
    const sy = opts.scaleY ?? 1;

    const m = matIdentity();
    matTranslate(m, x + (opts.offsetX || 0), y + (opts.offsetY || 0));
    if (rotation !== 0 || sx !== 1 || sy !== 1) {
      const com = anchorPoint(charKey, frameKey, "com", meta);
      const px = (com.x - CELL_W / 2) * scale * facing;
      const py = (com.y - anchorY) * scale;
      if (sx !== 1 || sy !== 1) {
        matTranslate(m, px, 0); matScale(m, sx, sy); matTranslate(m, -px, 0);
      }
      if (rotation !== 0) {
        matTranslate(m, px, py); matRotate(m, rotation); matTranslate(m, -px, -py);
      }
    }
    matScale(m, facing, 1);
    matTranslate(m, (meta.ox - CELL_W / 2) * scale, (meta.oy - anchorY) * scale);
    matScale(m, meta.w * scale, meta.h * scale);
    return m;
  }

  /** One character frame as a billboard. Returns false when the art is
   *  missing, so the caller can fall back like the flat renderer does. */
  function drawChar(charKey, frameKey, x, y, opts, z, order) {
    const img = frameImage(charKey, frameKey);
    const m = charFrameMatrix(charKey, frameKey, x, y, opts);
    if (!img || !m) return false;
    pool.draw(imageTexture(img), m, { z, order, alpha: opts.alpha ?? 1 });
    return true;
  }

  /** An axis-aligned image rect (used by transformed fighters, shadows,
   *  projectile art) with optional rotation about its centre. */
  function drawRect(tex, cx, cy, w, h, { rotation = 0, flipX = false, alpha = 1, additive = false, color = 0xffffff } = {}, z, order) {
    pool.draw(tex, rectMatrix(cx, cy, w, h, { rotation, flipX }), {
      z, order, alpha, color,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
  }

  function groundBelow(f, platforms) {
    let best = 700;
    for (const p of platforms) {
      if (f.x >= p.x - 20 && f.x <= p.x + p.w + 20 && p.y >= f.y - 4 && p.y < best) best = p.y;
    }
    return best;
  }

  /** Rebuild the frame's billboards from state. Order mirrors the flat
   *  renderer: shadows, trails, bodies back-to-front by y, then projectiles. */
  function update(st) {
    pool.begin();
    let order = ORDER.billboard;

    const sorted = [...st.fighters].sort((a, b) => a.y - b.y);
    for (const f of sorted) {
      if (f.dead || f.respawnTimer > 0) continue;

      // shadow
      const gy = groundBelow(f, st.platforms);
      const shAlpha = Math.min(0.42, Math.max(0.08, 0.42 - (gy - f.y) / 900));
      drawRect(shadowTexture(), f.x, gy + 8, 68, 16, { alpha: shAlpha }, 0.01, order++);

      const spriteKey = f.spriteChar || f.charKey;
      const spriteActor = getActor(spriteKey) || f.char;
      const frameKey = currentFrame(spriteKey, f.animKey, f.animTime);
      const flicker = f.invuln > 0.1 && Math.floor(f.invuln * 16) % 2 === 0;
      const shakeX = f.shakeMag > 0 ? (Math.random() - 0.5) * f.shakeMag : 0;

      const transformed = f.installs?.sprite ? getImage(f.installs.sprite) : null;
      if (transformed) {
        const h = 210;
        const w = transformed.width * h / transformed.height;
        drawRect(imageTexture(transformed), f.x + shakeX, f.y + 10 - h / 2, w, h,
          { flipX: f.facing > 0, alpha: flicker ? 0.6 : 1 }, 0, order++);
        continue;
      }

      // afterimage trail
      const strength = trailStrength(f);
      if (strength && f.trail.length >= 2) {
        for (let i = 0; i < f.trail.length; i++) {
          const g = f.trail[i];
          const fade = ((i + 1) / f.trail.length) * TRAIL_ALPHA * strength;
          drawChar(f.charKey, g.frame, g.x, g.y, {
            scale: f.char.scale, facing: g.facing, alpha: fade, rotation: g.rot,
          }, -0.02, order++);
        }
      }

      const m = fighterTransform(f);
      drawChar(spriteKey, frameKey, f.x + shakeX, f.y, {
        scale: spriteActor.scale,
        facing: f.facingVis,
        alpha: flicker ? 0.6 : 1,
        rotation: m.rotation,
        scaleX: m.scaleX,
        scaleY: m.scaleY,
        offsetX: m.offsetX,
        offsetY: m.offsetY,
      }, 0, order++);
      // Missing art falls through: the overlay's drawMissingArt still runs in
      // 3d mode (render.js), so the failure stays as loud as it is flat.
    }

    // projectiles: sprite art as oriented quads, fallback orbs as additive
    // blobs. Comet trails stay on the overlay canvas.
    for (const p of st.projectiles) {
      const sprite = p.sprite ? getImage(p.sprite) : null;
      if (sprite) {
        const h = p.spriteH || p.r * 3;
        const w = sprite.width * h / sprite.height;
        const flip = p.vx > 0;
        const rot = p.vy ? Math.atan2((flip ? 1 : -1) * p.vy, (flip ? 1 : -1) * p.vx) : 0;
        drawRect(imageTexture(sprite), p.x, p.y + (p.wave ? p.r * 0.68 : 0), w, h,
          { rotation: rot, flipX: flip }, 0.02, order++);
      } else {
        drawRect(orbTexture(p.color), p.x, p.y, p.r * 2, p.r * 2,
          { additive: true }, 0.02, order++);
      }
    }

    pool.end();
  }

  return { group: pool.group, update, count: pool.count };
}
