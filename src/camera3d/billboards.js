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
// the sprite pose resolver, fighterTransform for lean/squash/tumble. Glow
// halos (canvas shadowBlur) have no cheap GL equivalent and are skipped; the
// overlay still draws every particle and arc on top.
//
// Not every fighter here is a sprite: under `?render=billboard` a body is a
// card wearing the posed-model texture, and under `?render=3d` the body is
// not a card at all — models.js puts the real rig in the scene and this
// module draws only that fighter's shadow and trail. Per character, so a
// half-delivered roster mixes models and sprites in one shot.

import {
  CanvasTexture, SRGBColorSpace, AdditiveBlending, NormalBlending, Group,
} from "../../vendor/three/three.module.js";
import {
  makeQuadPool, imageTexture, rectMatrix, ORDER,
  matIdentity, matTranslate, matScale, matRotate,
} from "./quads.js";
import { frameMeta, frameImage, getImage } from "../assets.js";
import { paintProceduralAura, AURA_ELLIPSE } from "../render.js";
import { sharedAdjust, AURA_H, AURA_PULSE, AURA_FOOT_DY } from "../shared_sprites.js";
import { makeEffectLayer } from "./effects.js";
// The SPRITE pose resolver, deliberately not the render-backend dispatcher.
//
// The sprite CARD path below has to come out of frameImage(), which
// understands sprite frame keys and nothing else, while the model backends
// hand out opaque tokens (`r3d:idle@0.5`, `bb:idle@0.5`) only their own
// drawCharFrame can interpret. Asking the dispatcher for a pose here once
// returned a token frameImage could not resolve, so every fighter drew as
// NOTHING under `?render=3d&camera=3d` — two features each correct alone,
// silently empty together. This resolver is the sprite fallback, and it is
// reached only when a fighter has no model to show.
//
// What each backend actually gets in this mode is decided by its scene
// adapter (src/render_backend.js sceneAdapter):
//
//   ?render=sprite      a sprite card — drawChar, below
//   ?render=billboard   a card wearing the POSED-MODEL texture — drawPosedCard
//   ?render=3d          real rig geometry in the scene — src/camera3d/models.js
import { currentFrame as spriteFrame } from "../../sprites/src/sprites.js";
import { sceneAdapter } from "../render_backend.js";
import { headHeightTarget } from "../heights.js";
import { FOOT_FRAC } from "../../billboards/src/renderer.js";
import { state as gameState } from "../state.js";
import { anchorPoint, frameFootY } from "../../sprites/src/sprites.js";
import { getActor } from "../characters.js";
import { fighterTransform, trailStrength } from "../motion.js";
import { TRAIL_ALPHA } from "../config_tuning.js";
import { CELL_W } from "../constants.js";

const DEG = Math.PI / 180;
// How far behind the gameplay plane the "behind the fighters" layer sits —
// see behindPool.
const BEHIND_Z = -0.01;
const EMPTY = new Set();
let posedCards = 0;
let auraQuads = 0;
let fxLayer = false;
let bail = null;

/** The auto-aim target the pose-per-draw backends take: the nearest live
 *  opponent's chest, or null. */
function nearestFoe(f) {
  let best = null;
  let bestD = Infinity;
  for (const o of gameState.fighters) {
    if (o === f || o.dead || o.respawnTimer > 0) continue;
    if (o.team != null && f.team != null && o.team === f.team) continue;
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best ? { x: best.x, y: best.y - 80 } : null;
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

// The procedural install aura, baked per fighter into a canvas the scene can
// wear. Redrawn every frame because the drawing itself moves — the ellipse
// pulses and Distortion Solo's clipped ring spins — and painted by render.js's
// own paintProceduralAura, so the flat aura and this one are one drawing.
const auraCanvases = new Map(); // fighter id -> { canvas, tex }

function proceduralAura(f) {
  const w = Math.ceil(AURA_ELLIPSE.rx * 2) + 8;
  const h = Math.ceil(AURA_ELLIPSE.ry * 2) + 8;
  let entry = auraCanvases.get(f.id);
  if (!entry) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    entry = { canvas, tex: new CanvasTexture(canvas), w, h };
    entry.tex.colorSpace = SRGBColorSpace;
    auraCanvases.set(f.id, entry);
  }
  const ctx = entry.canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  paintProceduralAura(ctx, f, w / 2, h / 2);
  ctx.restore();
  entry.tex.needsUpdate = true;
  return entry;
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
  // `depthTest: false` — fighters are never occluded by the stage.
  //
  // This is parity, not a workaround. The flat renderer paints platforms and
  // THEN fighters (render.js draw()), so a fighter is always on top of the
  // stage: the sprites are drawn with their feet overlapping the platform in
  // front of it, and a landing has to put them back in front. Letting the
  // depth buffer decide instead put the platform in front — the quads sit on
  // the gameplay plane at z = 0 and the platform's front face is a hair nearer
  // at z = 0.002 — which sliced a fighter in half wherever the two crossed,
  // and did it most visibly on the boards whose platforms MOVE, because there
  // the cut line slides across the body.
  //
  // Paint order alone decides, exactly as it does flat: ORDER.billboard is
  // above ORDER.platform, so fighters land on top; ORDER.garnishFront is above
  // fighters, so traffic still passes in front of them.
  const pool = makeQuadPool({ depthTest: false });

  // THE LAYER BEHIND THE FIGHTERS — install auras and projectile art.
  //
  // Everything above is about fighters never being CUT by the stage. These
  // have the opposite requirement: they must go BEHIND the fighter, which is
  // where the flat renderer puts them (render.js draws the aura between the
  // shadow and the body, and every projectile before drawFighters). Paint
  // order alone cannot do it under `?render=3d`, because there the body is
  // opaque geometry and three draws every transparent quad after every opaque
  // mesh whatever its renderOrder — only the depth buffer can put a quad
  // behind a rig.
  //
  // So they get their own pool that DOES test depth, sitting a centimetre
  // behind the gameplay plane: far enough back for a body with volume to
  // occlude it, still well in front of the platform surface at z = -0.06, so
  // it paints over the stage exactly as it does flat.
  const behindPool = makeQuadPool({ depthTest: true });
  const group = new Group();
  group.add(behindPool.group, pool.group);

  // Every state.entities draw, as one picture behind the fighters (effects.js).
  const effects = makeEffectLayer();

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

  /** `?render=billboard`: the fighter as a card wearing the posed-model
   *  texture. Geometry comes from the same two constants the flat blit uses —
   *  the model origin sits at the texture's horizontal centre and the foot
   *  line FOOT_FRAC up from its bottom — so the card lands where the sprite
   *  card would, at the size the sprite card would be. Returns false when the
   *  active backend has no texture adapter or no rig for this fighter, and
   *  the caller draws the sprite card instead. */
  function drawPosedCard(f, charKey, order) {
    const adapter = sceneAdapter();
    if (!adapter || adapter.kind !== "texture" || !adapter.ready?.()) { bail = "no-adapter"; return false; }
    const targetPx = headHeightTarget(charKey);
    const entry = adapter.poseTexture(charKey, f.animKey, f.animTime, {
      facing: f.facingVis, x: f.x, y: f.y, chestY: f.y - targetPx * 0.55,
      aim: nearestFoe(f),
    });
    if (!entry) { bail = "no-entry"; return false; }

    const m = fighterTransform(f);
    const texPx = entry.canvas.height;
    // Game px per texture px: the rows the body spans must land at targetPx.
    const sc = (targetPx * (entry.renderScale ?? 1)) / (entry.rowsPerMetre * entry.heightM);
    const w = texPx * sc;
    const h = texPx * sc;
    // The texture's foot row, as a distance above the card's centre.
    const footFromTop = texPx * (1 - FOOT_FRAC) * sc;
    const cx = f.x + (m.offsetX || 0);
    const cy = f.y + (m.offsetY || 0) - footFromTop + h / 2;
    drawRect(imageTexture(entry.canvas), cx, cy, w, h, {
      rotation: m.rotation, flipX: f.facingVis < 0,
      alpha: f.invuln > 0.1 && Math.floor(f.invuln * 16) % 2 === 0 ? 0.6 : 1,
    }, 0, order);
    posedCards++;
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

  /** The install aura, BEHIND the fighter.
   *
   *  Flat, render.js paints this between the shadow and the body, so it sits
   *  under them. Here the body is a card — or, under `?render=3d`, real
   *  geometry — in the WebGL layer, and the overlay canvas is strictly on top
   *  of that layer, so the same call there put the aura in FRONT of the
   *  fighter wearing it. It is a picture standing on the gameplay plane like
   *  everything else in this file, so it belongs in the scene, drawn before
   *  the body in the same paint order the flat renderer uses.
   *
   *  Art auras replay drawInstallAura's transform chain call for call: the
   *  tilt turns about the FEET, not the image centre, so a leaning aura leans
   *  instead of sliding. The canvas shadowBlur halo has no cheap GL
   *  equivalent and is skipped, as it is for bodies. */
  function drawAura(f, order) {
    if (!f.installs) return;
    auraQuads++;
    const art = f.installs.aura ? getImage(f.installs.aura) : null;
    const pulse = AURA_PULSE.base + AURA_PULSE.amp * Math.sin(gameState.matchTime * AURA_PULSE.rate);
    if (art) {
      const adj = sharedAdjust(f.installs.aura);
      const h = AURA_H * pulse * adj.scale;
      const w = art.width * h / art.height;
      const m = matIdentity();
      matTranslate(m, f.x, f.y + AURA_FOOT_DY);
      if (adj.rot) matRotate(m, adj.rot);
      matTranslate(m, -w / 2 + adj.dx, -h + adj.dy);
      matScale(m, w, h);
      behindPool.draw(imageTexture(art), m, {
        z: BEHIND_Z, order, alpha: 0.72, blending: AdditiveBlending,
      });
      return;
    }
    const { tex, w, h } = proceduralAura(f);
    behindPool.draw(tex, rectMatrix(f.x, f.y + AURA_ELLIPSE.dy, w, h), {
      z: BEHIND_Z, order, blending: AdditiveBlending,
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
   *  renderer: projectiles, then per fighter the shadow, the aura, the
   *  afterimage trail and the body, back-to-front by y. */
  function update(st, asModels = EMPTY) {
    pool.begin();
    behindPool.begin();
    posedCards = 0;
    auraQuads = 0;
    fxLayer = false;
    bail = null;
    let order = ORDER.billboard;

    // The entity effect layer first of all — traps, ultimate waves, hazards.
    // Flat, render.js draws these before the fighters; on the overlay canvas
    // they could only ever be in front, so they come into the scene as one
    // quad (effects.js) at the back of this layer.
    const fxRect = effects.update(st);
    fxLayer = !!fxRect;
    if (fxRect) {
      behindPool.draw(effects.texture,
        rectMatrix(fxRect.x + fxRect.w / 2, fxRect.y + fxRect.h / 2, fxRect.w, fxRect.h),
        { z: BEHIND_Z, order: order++ });
    }

    // Projectiles next, into the same layer.
    //
    // The flat renderer draws every projectile before drawFighters, so a blast
    // passes BEHIND the fighter it is about to hit and you can still read the
    // body. Drawing them last here — which is where they used to be, on the
    // no-depth pool — inverted that: Gakuganji's Power Chord is 120 px of
    // opaque energy art, and parked on a target it simply erased them from the
    // chest down. Sprite art as oriented quads, fallback orbs as additive
    // blobs. Comet trails stay on the overlay canvas.
    for (const p of st.projectiles) {
      const sprite = p.sprite ? getImage(p.sprite) : null;
      if (sprite) {
        const h = p.spriteH || p.r * 3;
        const w = sprite.width * h / sprite.height;
        const flip = p.vx > 0;
        const rot = p.vy ? Math.atan2((flip ? 1 : -1) * p.vy, (flip ? 1 : -1) * p.vx) : 0;
        behindPool.draw(imageTexture(sprite),
          rectMatrix(p.x, p.y + (p.wave ? p.r * 0.68 : 0), w, h, { rotation: rot, flipX: flip }),
          { z: BEHIND_Z, order: order++ });
      } else {
        behindPool.draw(orbTexture(p.color), rectMatrix(p.x, p.y, p.r * 2, p.r * 2),
          { z: BEHIND_Z, order: order++, blending: AdditiveBlending });
      }
    }

    const sorted = [...st.fighters].sort((a, b) => a.y - b.y);
    for (const f of sorted) {
      if (f.dead || f.respawnTimer > 0) continue;

      // shadow
      const gy = groundBelow(f, st.platforms);
      const shAlpha = Math.min(0.42, Math.max(0.08, 0.42 - (gy - f.y) / 900));
      drawRect(shadowTexture(), f.x, gy + 8, 68, 16, { alpha: shAlpha }, 0.01, order++);

      // ...then the aura, under the body — render.js's own order.
      drawAura(f, order++);

      const spriteKey = f.spriteChar || f.charKey;
      const spriteActor = getActor(spriteKey) || f.char;
      const frameKey = spriteFrame(spriteKey, f.animKey, f.animTime);
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

      // Drawn as real geometry by models.js this frame (?render=3d): it owns
      // the body, we keep the shadow and the trail. Checked AFTER those so a
      // modelled fighter still lands on the floor and still leaves afterimages.
      if (asModels.has(f.id)) continue;

      // ?render=billboard: a card wearing the POSED MODEL instead of a sprite
      // sheet frame — the native form for a backend whose whole identity is
      // "pose a rig, cache the texture, draw it flat". Falls through to the
      // sprite card when the backend has no rig for this fighter.
      if (drawPosedCard(f, spriteKey, order)) { order++; continue; }

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

    pool.end();
    behindPool.end();
  }

  // Posed-model cards drawn last frame, and why the last attempt declined.
  // Same reasoning as the quad count: a card layer that silently drew sprites
  // instead of models looks identical from outside to one that worked.
  return { group, update, count: pool.count,
           auraCount: () => auraQuads,
           fxLayerDrawn: () => fxLayer,
           quadPools: () => ({ body: pool.group, behind: behindPool.group }),
           posedCount: () => posedCards, lastBail: () => bail };
}
