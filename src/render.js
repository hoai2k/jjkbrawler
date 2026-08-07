import { state } from "./state.js";
import { getImage } from "./assets.js";
import { getStage } from "./stages.js";
import { drawCharFrame, currentFrame } from "./sprites.js";
import { fighterTransform, trailStrength } from "./motion.js";
import { TRAIL_ALPHA } from "./config_tuning.js";
import { drawParticles, drawPopupsWorld, drawBannersScreen } from "./particles.js";
import { hitboxRect, hurtbox } from "./combat.js";
import { applyCamera, releaseCamera } from "./camera.js";
import { WORLD, SHIELD_MAX, PARRY_WINDOW } from "./constants.js";
import { clamp } from "./utils.js";

export function draw(ctx) {
  ctx.clearRect(0, 0, WORLD.w, WORLD.h);
  applyCamera(ctx);

  drawBackdrop(ctx);
  drawDomainBackdrop(ctx);
  drawPlatforms(ctx);

  for (const e of state.entities) if (e.draw) e.draw(ctx);
  drawProjectiles(ctx);
  drawFighters(ctx);
  if (state.debugHitboxes) drawDebug(ctx);
  drawParticles(ctx);
  drawPopupsWorld(ctx);

  releaseCamera(ctx);

  drawDomainOverlay(ctx);
  drawBannersScreen(ctx);
  drawScreenFlash(ctx);
}

function drawBackdrop(ctx) {
  const stage = getStage(state.stageKey);
  const img = getImage(`bg:${stage.key}`);
  if (img) {
    const scale = Math.max(WORLD.w / img.width, WORLD.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (WORLD.w - w) / 2, (WORLD.h - h) / 2, w, h);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD.h);
    grad.addColorStop(0, "#141b33");
    grad.addColorStop(1, "#05070f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  }
  ctx.fillStyle = "rgba(3, 5, 12, 0.30)";
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
  ctx.fillStyle = stage.tint;
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
}

function drawPlatforms(ctx) {
  for (const p of state.platforms) drawPlatformShape(ctx, p);
}

// Exported so the sprite workbench can show a real platform to align feet
// against, rather than an approximation that could drift from the game.
export function drawPlatformShape(ctx, p) {
  ctx.save();
  ctx.fillStyle = "rgba(2, 3, 8, 0.45)";
  roundRect(ctx, p.x + 8, p.y + 12, p.w, p.h, 8);
  ctx.fill();

  const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y);
  if (p.kind === "main") {
    grad.addColorStop(0, "#263044");
    grad.addColorStop(0.5, "#111827");
    grad.addColorStop(1, "#4d3a19");
  } else {
    grad.addColorStop(0, "#1d2739");
    grad.addColorStop(0.5, "#111827");
    grad.addColorStop(1, "#2a2f3f");
  }
  ctx.fillStyle = grad;
  roundRect(ctx, p.x, p.y, p.w, p.h, 8);
  ctx.fill();

  ctx.strokeStyle = p.kind === "main" ? "rgba(255, 211, 92, 0.55)" : "rgba(97, 216, 255, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x + 6, p.y + 1);
  ctx.lineTo(p.x + p.w - 6, p.y + 1);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawProjectiles(ctx) {
  for (const p of state.projectiles) {
    const sprite = p.sprite ? getImage(p.sprite) : null;
    if (sprite) {
      const h = p.spriteH || p.r * 3;
      const w = sprite.width * h / sprite.height;
      ctx.save();
      ctx.translate(p.x, p.y + (p.wave ? p.r * 0.68 : 0));
      // Point the art along its actual flight path. An arcing shot used to
      // hold one orientation the whole way, which read as a sliding decal.
      // The art faces LEFT natively and is mirrored when travelling right, so
      // the nose already points along vx; the rotation only has to add the
      // vertical component, measured in that same mirrored frame.
      const flip = p.vx > 0 ? -1 : 1;
      if (p.vy) ctx.rotate(Math.atan2(-flip * p.vy, -flip * p.vx));
      ctx.scale(flip, 1);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, p.color);
    grad.addColorStop(1, "rgba(80, 120, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFighters(ctx) {
  const sorted = [...state.fighters].sort((a, b) => a.y - b.y);
  for (const f of sorted) {
    if (f.dead || f.respawnTimer > 0) {
      if (f.respawnTimer > 0) drawRespawnPlatform(ctx, f);
      continue;
    }
    drawShadow(ctx, f);
    drawInstallAura(ctx, f);

    const frameKey = currentFrame(f.charKey, f.animKey, f.animTime);
    const flicker = f.invuln > 0.1 && Math.floor(f.invuln * 16) % 2 === 0;
    const shakeX = f.shakeMag > 0 ? (Math.random() - 0.5) * f.shakeMag : 0;
    const glowing = ["specialNeutral", "specialSide", "specialDown", "ult", "charge"].includes(f.animKey) || f.installs;

    const transformed = f.installs?.sprite ? getImage(f.installs.sprite) : null;
    if (transformed) {
      const h = 210;
      const w = transformed.width * h / transformed.height;
      ctx.save();
      ctx.translate(f.x + shakeX, f.y + 10);
      ctx.scale(f.facing > 0 ? -1 : 1, 1);
      ctx.globalAlpha = flicker ? 0.6 : 1;
      ctx.shadowColor = f.installs.color || f.char.shadow;
      ctx.shadowBlur = 24;
      ctx.drawImage(transformed, -w / 2, -h, w, h);
      ctx.restore();
    } else {
      drawTrail(ctx, f);
      const m = fighterTransform(f);
      drawCharFrame(ctx, f.charKey, frameKey, f.x + shakeX, f.y, {
        scale: f.char.scale,
        facing: f.facingVis,
        alpha: flicker ? 0.6 : 1,
        rotation: m.rotation,
        scaleX: m.scaleX,
        scaleY: m.scaleY,
        offsetX: m.offsetX,
        offsetY: m.offsetY,
        // A frame with a ledge-grip anchor is hung from that hand on the real
        // platform corner, instead of standing its feet in mid-air beside it.
        anchorTo: f.ledge
          ? { name: "ledge", x: f.ledge.edgeX, y: f.ledge.plat.y }
          : null,
        glow: glowing ? (f.installs ? f.installs.color : f.char.shadow) : f.char.shadow,
        glowBlur: glowing ? 26 : 12,
      });
    }

    if (f.shielding) drawShieldBubble(ctx, f);
    if (f.dizzy > 0) drawDizzyStars(ctx, f);
    if (f.counter) drawCounterAura(ctx, f);
    if (f.statuses.nailMarks > 0) drawNailMarks(ctx, f);
    drawShieldMeter(ctx, f);
  }
}

// Afterimages behind a dash, roll, air dodge or tumble. The cheapest possible
// "this is fast" signal, and the one that costs no new art at all.
function drawTrail(ctx, f) {
  const strength = trailStrength(f);
  if (!strength || f.trail.length < 2) return;
  ctx.save();
  ctx.shadowColor = f.char.theme;
  ctx.shadowBlur = 10;
  for (let i = 0; i < f.trail.length; i++) {
    const g = f.trail[i];
    const fade = ((i + 1) / f.trail.length) * TRAIL_ALPHA * strength;
    drawCharFrame(ctx, f.charKey, g.frame, g.x, g.y, {
      scale: f.char.scale,
      facing: g.facing,
      alpha: fade,
      rotation: g.rot,
    });
  }
  ctx.restore();
}

function drawShadow(ctx, f) {
  const groundY = groundBelow(f);
  ctx.save();
  ctx.globalAlpha = clamp(0.42 - (groundY - f.y) / 900, 0.08, 0.42);
  ctx.fillStyle = "#020308";
  ctx.beginPath();
  ctx.ellipse(f.x, groundY + 8, 34, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function groundBelow(f) {
  let best = 700;
  for (const p of state.platforms) {
    if (f.x >= p.x - 20 && f.x <= p.x + p.w + 20 && p.y >= f.y - 4 && p.y < best) best = p.y;
  }
  return best;
}

function drawInstallAura(ctx, f) {
  if (!f.installs) return;
  const art = f.installs.aura ? getImage(f.installs.aura) : null;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.88 + 0.06 * Math.sin(state.matchTime * 8);
  if (art) {
    const h = 220 * pulse;
    const w = art.width * h / art.height;
    ctx.globalAlpha = 0.72;
    ctx.shadowColor = f.installs.color;
    ctx.shadowBlur = 18;
    ctx.drawImage(art, f.x - w / 2, f.y + 10 - h, w, h);
    ctx.restore();
    return;
  }
  ctx.globalAlpha = 0.24 + 0.1 * Math.sin(state.matchTime * 8);
  ctx.fillStyle = f.installs.color;
  ctx.beginPath();
  ctx.ellipse(f.x, f.y - 60, 56, 96, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShieldBubble(ctx, f) {
  const pct = f.shield / SHIELD_MAX;
  const fresh = state.matchTime - f.shieldRaisedAt <= PARRY_WINDOW;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = fresh ? "#ffffff" : f.char.theme;
  ctx.lineWidth = 2 + pct * 5;
  ctx.fillStyle = f.char.shadow;
  ctx.beginPath();
  ctx.arc(f.x, f.y - 70, 52 + pct * 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawShieldMeter(ctx, f) {
  if (f.shield > 99 && !f.shielding) return;
  const pct = f.shield / SHIELD_MAX;
  ctx.save();
  ctx.fillStyle = "rgba(6, 10, 20, 0.7)";
  ctx.fillRect(f.x - 35, f.y - 148, 70, 7);
  ctx.fillStyle = pct > 0.35 ? f.char.theme : "#ff5a5a";
  ctx.fillRect(f.x - 34, f.y - 147, 68 * pct, 5);
  ctx.restore();
}

function drawDizzyStars(ctx, f) {
  ctx.save();
  ctx.fillStyle = "#ffd35a";
  for (let i = 0; i < 3; i++) {
    const a = state.matchTime * 5 + (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(f.x + Math.cos(a) * 30, f.y - 130 + Math.sin(a) * 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCounterAura(ctx, f) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(state.matchTime * 20);
  ctx.strokeStyle = "#a8e6ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(f.x, f.y - 70, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawNailMarks(ctx, f) {
  ctx.save();
  ctx.fillStyle = "#d86a4a";
  for (let i = 0; i < f.statuses.nailMarks; i++) {
    ctx.beginPath();
    ctx.arc(f.x - 24 + i * 10, f.y - 156, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRespawnPlatform(ctx, f) {
  const x = f.id === 1 ? 430 : 850;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = f.char.theme;
  ctx.beginPath();
  ctx.ellipse(x, 250, 60, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  drawCharFrame(ctx, f.charKey, "r0c0", x, 244, { scale: f.char.scale, facing: x < 640 ? 1 : -1, alpha: 0.85 });
  ctx.restore();
}

function drawDebug(ctx) {
  ctx.save();
  for (const hb of state.hitboxes) {
    if (hb.age < 0) continue;
    const r = hitboxRect(hb);
    ctx.fillStyle = "rgba(255, 80, 80, 0.32)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  for (const f of state.fighters) {
    if (f.dead) continue;
    const r = hurtbox(f);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

// The bulk of a domain's atmosphere is painted BEHIND the fighters: a domain
// runs for seconds while both players are still fighting, so tinting over the
// characters would bury the thing the player most needs to read.
function drawDomainBackdrop(ctx) {
  const d = state.domainOverlay;
  if (!d) return;
  const a = clamp(d.life / d.maxLife, 0, 1);
  ctx.save();
  // dim the stage first, then place any domain-specific environment above it
  ctx.globalAlpha = Math.min(0.72, a * 0.8);
  ctx.fillStyle = "rgba(2, 2, 8, 0.78)";
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
  const art = d.sprite ? getImage(d.sprite) : null;
  if (art) {
    const scale = Math.max(WORLD.w / art.width, WORLD.h / art.height);
    const w = art.width * scale;
    const h = art.height * scale;
    ctx.globalAlpha = Math.min(0.82, a * 1.35);
    ctx.drawImage(art, (WORLD.w - w) / 2, (WORLD.h - h) / 2, w, h);
  }
  // finish with a light color grade
  ctx.globalAlpha = Math.min(0.18, a * 0.22);
  ctx.fillStyle = d.color;
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
  ctx.restore();
}

// On top, only a soft edge vignette — enough to sell the enclosure without
// washing out the fighters.
function drawDomainOverlay(ctx) {
  const d = state.domainOverlay;
  if (!d) return;
  const a = clamp(d.life / d.maxLife, 0, 1);
  ctx.save();
  ctx.globalAlpha = Math.min(0.26, a * 0.3);
  const grad = ctx.createRadialGradient(640, 360, 420, 640, 360, 900);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, d.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.restore();
}

function drawScreenFlash(ctx) {
  const fl = state.screenFlash;
  if (!fl) return;
  ctx.save();
  ctx.globalAlpha = clamp(fl.life / fl.maxLife, 0, 1) * 0.5;
  ctx.fillStyle = fl.color;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.restore();
}
