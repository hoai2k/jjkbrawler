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
  Group, Mesh, BufferGeometry, BufferAttribute, MeshBasicMaterial,
  Texture, CanvasTexture, SRGBColorSpace, DoubleSide,
  AdditiveBlending, NormalBlending, Matrix4,
} from "../../vendor/three.module.js";
import { frameMeta, frameImage, getImage } from "../assets.js";
import { currentFrame } from "../render_backend.js";
import { anchorPoint, frameFootY } from "../../sprites/src/sprites.js";
import { getActor } from "../characters.js";
import { fighterTransform, trailStrength } from "../motion.js";
import { TRAIL_ALPHA } from "../config_tuning.js";
import { CELL_W } from "../constants.js";

const DEG = Math.PI / 180;

// ------------------------------------------------------------------ 2D affine
//
// Canvas-semantics matrix ops (post-multiply), so the composition below reads
// exactly like the ctx calls in drawCharFrame.

function matIdentity() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
function matTranslate(m, x, y) {
  m.e += m.a * x + m.c * y;
  m.f += m.b * x + m.d * y;
}
function matScale(m, x, y) {
  m.a *= x; m.b *= x; m.c *= y; m.d *= y;
}
function matRotate(m, t) {
  const cos = Math.cos(t), sin = Math.sin(t);
  const { a, b, c, d } = m;
  m.a = a * cos + c * sin; m.b = b * cos + d * sin;
  m.c = c * cos - a * sin; m.d = d * cos - b * sin;
}

// ------------------------------------------------------------------ geometry
//
// One shared unit quad: (0,0) is the image's top-left, (1,1) its bottom-right,
// in the y-down space the matrices above work in. UVs account for three.js's
// default flipY texture upload.

function unitQuad() {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array([
    0, 0, 0,  1, 0, 0,  0, 1, 0,  1, 1, 0,
  ]), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array([
    0, 1,  1, 1,  0, 0,  1, 0,
  ]), 2));
  geo.setIndex([0, 2, 1, 2, 3, 1]);
  return geo;
}

const QUAD = unitQuad();

// ------------------------------------------------------------------ textures

const texCache = new Map(); // HTMLImageElement -> Texture

function imageTexture(img) {
  let tex = texCache.get(img);
  if (tex) return tex;
  tex = new Texture(img);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  texCache.set(img, tex);
  return tex;
}

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

// ---------------------------------------------------------------- quad pool
//
// A fixed pool of meshes reused every frame — set matrix/texture/alpha, show;
// hide the rest. No allocation in the draw loop once the pool has grown.

const _m4 = new Matrix4();

export function makeBillboards() {
  const group = new Group(); // added to the sim group by index.js
  const pool = [];
  let used = 0;

  function quad() {
    let mesh = pool[used];
    if (!mesh) {
      mesh = new Mesh(QUAD, new MeshBasicMaterial({
        transparent: true, side: DoubleSide, depthWrite: false,
      }));
      mesh.matrixAutoUpdate = false;
      pool.push(mesh);
      group.add(mesh);
    }
    used++;
    mesh.visible = true;
    return mesh;
  }

  /** Place `mesh` by a 2D sim-space affine, at depth `z` (world units) and
   *  draw order `order` (later = on top, mirroring canvas paint order). */
  function place(mesh, m, z, order) {
    _m4.set(
      m.a, m.c, 0, m.e,
      m.b, m.d, 0, m.f,
      0, 0, 1, z,
      0, 0, 0, 1,
    );
    mesh.matrix.copy(_m4);
    mesh.renderOrder = order;
  }

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
    const mesh = quad();
    mesh.material.map = imageTexture(img);
    mesh.material.opacity = opts.alpha ?? 1;
    mesh.material.blending = NormalBlending;
    mesh.material.color.set(0xffffff);
    mesh.material.needsUpdate = true;
    place(mesh, m, z, order);
    return true;
  }

  /** An axis-aligned image rect (used by transformed fighters, shadows,
   *  projectile art) with optional rotation about its centre. */
  function drawRect(tex, cx, cy, w, h, { rotation = 0, flipX = false, alpha = 1, additive = false, color = 0xffffff } = {}, z, order) {
    const mesh = quad();
    const m = matIdentity();
    matTranslate(m, cx, cy);
    if (rotation) matRotate(m, rotation);
    if (flipX) matScale(m, -1, 1);
    matTranslate(m, -w / 2, -h / 2);
    matScale(m, w, h);
    mesh.material.map = tex;
    mesh.material.opacity = alpha;
    mesh.material.blending = additive ? AdditiveBlending : NormalBlending;
    mesh.material.color.set(color);
    mesh.material.needsUpdate = true;
    place(mesh, m, z, order);
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
    used = 0;
    let order = 0;

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

    for (let i = used; i < pool.length; i++) pool[i].visible = false;
  }

  return { group, update };
}
