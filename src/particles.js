import { state } from "./state.js";
import { rand, clamp } from "./utils.js";

export function burst(x, y, color, count = 20, force = 1) {
  if (state.particles.length > 700) return;
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = (120 + rand(0, 420)) * force;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 120,
      size: 3 + rand(0, 9),
      life: 0.28 + rand(0, 0.48),
      maxLife: 0.76,
      color,
    });
  }
}

export function dust(x, y, count = 10) {
  if (state.particles.length > 700) return;
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x: x + rand(-18, 18), y,
      vx: rand(-90, 90),
      vy: -40 - rand(0, 120),
      gravity: 360,
      size: 5 + rand(0, 12),
      life: 0.22 + rand(0, 0.35),
      maxLife: 0.57,
      color: "rgba(188, 196, 220, 0.8)",
    });
  }
}

export function sparkLine(x, y, dirX, color, count = 12) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x, y: y + rand(-14, 14),
      vx: dirX * (220 + rand(0, 480)),
      vy: rand(-140, 140),
      gravity: 60,
      size: 2 + rand(0, 6),
      life: 0.16 + rand(0, 0.3),
      maxLife: 0.46,
      color,
    });
  }
}

export function ring(x, y, color, radius = 60) {
  state.particles.push({ ringR: 8, ringMax: radius, x, y, life: 0.32, maxLife: 0.32, color, size: 0, vx: 0, vy: 0, gravity: 0 });
}

export function popup(x, y, text, color = "#ffffff", size = 26) {
  state.popups.push({ x: clamp(x, 60, 1220), y: clamp(y, 60, 660), vy: -46, text, color, size, life: 0.7, maxLife: 0.7 });
}

export function banner(text, color = "#ffffff", opts = {}) {
  state.banners.push({
    x: opts.x ?? 640, y: opts.y ?? 200,
    vy: opts.vy ?? -12,
    text, color,
    size: opts.size ?? 54,
    life: opts.life ?? 1.1,
    maxLife: opts.life ?? 1.1,
  });
}

export function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) { state.particles.splice(i, 1); continue; }
    if (p.ringMax) {
      p.ringR += (p.ringMax - p.ringR) * dt * 14;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.size *= Math.pow(0.985, dt * 60);
  }
  for (let i = state.popups.length - 1; i >= 0; i--) {
    const p = state.popups[i];
    p.life -= dt;
    p.y += p.vy * dt;
    if (p.life <= 0) state.popups.splice(i, 1);
  }
  for (let i = state.banners.length - 1; i >= 0; i--) {
    const b = state.banners[i];
    b.life -= dt;
    b.y += b.vy * dt;
    if (b.life <= 0) state.banners.splice(i, 1);
  }
}

export function drawParticles(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of state.particles) {
    const alpha = clamp(p.life / 0.55, 0, 1);
    ctx.globalAlpha = alpha;
    if (p.ringMax) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.ringR, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size / 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// popups float in world space (they follow fighters through the camera)
export function drawPopupsWorld(ctx) {
  ctx.save();
  ctx.textAlign = "center";
  for (const p of state.popups) {
    ctx.globalAlpha = clamp(p.life / 0.35, 0, 1);
    ctx.font = `900 ${p.size}px Inter, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

// banners are screen-space announcements
export function drawBannersScreen(ctx) {
  ctx.save();
  ctx.textAlign = "center";
  for (const b of state.banners) {
    ctx.globalAlpha = clamp(b.life / 0.35, 0, 1);
    ctx.font = `900 ${b.size}px Inter, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(b.text, b.x, b.y);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, b.x, b.y);
  }
  ctx.restore();
}
