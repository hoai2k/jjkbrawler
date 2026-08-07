// Persistent ally minions: shikigami, curses, transfigured humans.
//
// A summon differs from a projectile in that it lives on the stage, picks its
// own targets, and acts on a cadence — and from the bespoke Mahoraga ultimate
// in that it is data-driven: characters describe a summon in their kit config
// and this module supplies the behavior.
//
// Behaviors:
//   chaser  — grounded pursuer that lunge-bites what it catches
//   bomber  — pursuer that detonates on contact and dies
//   support — hovers behind its owner and fires projectiles at the target
//
// Summons are lifetime-limited and capped per (owner, id): recasting past the
// cap dismisses the oldest. They die with their owner's elimination; match
// reset clears state.entities wholesale.

import { state } from "./state.js";
import { clamp, sign, rand, rectsOverlap } from "./utils.js";
import { applyHit, hurtbox, spawnProjectile } from "./combat.js";
import { burst, dust, ring } from "./particles.js";
import { playSfx } from "./audio.js";
import { getImage } from "./assets.js";

function groundY() {
  return state.platforms.length ? state.platforms[0].y : 568;
}

function nearestTarget(owner, x) {
  let best = null;
  let bestD = Infinity;
  for (const f of state.fighters) {
    if (f === owner || f.dead || f.respawnTimer > 0) continue;
    const d = Math.abs(f.x - x);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

// First loaded image from a preference list, so placeholder art can ship now
// and dedicated art (docs/asset-requests.md) drops in without code changes.
function summonImage(sprites) {
  for (const key of sprites || []) {
    const img = getImage(key);
    if (img) return img;
  }
  return null;
}

function enforceCap(owner, id, maxActive) {
  const mine = state.entities.filter((e) => e.kind === "summon" && e.owner === owner && e.id === id && !e.dead);
  while (mine.length >= maxActive) {
    const oldest = mine.shift();
    oldest.dismiss();
  }
}

export function spawnSummon(owner, cfg) {
  enforceCap(owner, cfg.id, cfg.maxActive || 1);

  const s = {
    kind: "summon",
    id: cfg.id,
    owner,
    behavior: cfg.behavior || "chaser",
    x: clamp(owner.x - owner.facing * (cfg.backOff ?? 60) + (cfg.offsetX || 0), 90, 1190),
    y: groundY(),
    dir: owner.facing,
    t: 0,
    dur: cfg.duration ?? 6,
    bob: rand(0, Math.PI * 2),
    attackCd: cfg.firstAttackDelay ?? 0.5,
    lungeT: 0,
    dead: false,

    dismiss() {
      if (this.dead) return;
      this.dead = true;
      burst(this.x, this.y - (cfg.hitH || 90) / 2, cfg.color, 14, 0.8);
    },

    update(dt) {
      this.t += dt;
      this.bob += dt * 5;
      if (this.t >= this.dur || owner.dead) { this.dismiss(); return; }
      this.attackCd -= dt;
      this.lungeT = Math.max(0, this.lungeT - dt);

      const target = nearestTarget(owner, this.x);
      if (this.behavior === "support") this.updateSupport(dt, target);
      else this.updatePursuit(dt, target);
    },

    // chaser + bomber share pursuit; they differ in what contact means.
    updatePursuit(dt, target) {
      const speed = cfg.speed ?? 420;
      if (target) {
        this.dir = sign(target.x - this.x) || this.dir;
        const gap = Math.abs(target.x - this.x);
        const desired = this.behavior === "bomber" ? 0 : (cfg.standOff ?? 30);
        if (gap > desired) this.x = clamp(this.x + this.dir * speed * dt, 90, 1190);
      }
      this.y = groundY();
      if (Math.random() < dt * 5) dust(this.x - this.dir * 20, this.y, 3);
      if (!target) return;

      const rect = {
        x: this.x - (cfg.hitW ?? 70) / 2, y: this.y - (cfg.hitH ?? 90),
        w: cfg.hitW ?? 70, h: cfg.hitH ?? 90,
      };
      if (!rectsOverlap(rect, hurtbox(target))) return;

      if (this.behavior === "bomber") {
        this.dead = true;
        burst(this.x, this.y - 50, cfg.color, 30, 1.3);
        ring(this.x, this.y - 50, cfg.color, (cfg.attack.r || 90) * 1.3);
        playSfx("blast", 0.9, 1.1);
        state.camera.shake = Math.max(state.camera.shake, 5);
        applyHit(owner, target, {
          dmg: cfg.attack.dmg, baseKb: cfg.attack.base, growth: cfg.attack.growth,
          angle: cfg.attack.angle, effect: cfg.attack.effect || null,
          label: cfg.label, sfx: "blast",
        }, "script");
        return;
      }

      if (this.attackCd > 0) return;
      this.attackCd = cfg.attack.cd ?? 0.8;
      this.lungeT = 0.22;
      applyHit(owner, target, {
        dmg: cfg.attack.dmg, baseKb: cfg.attack.base, growth: cfg.attack.growth,
        angle: cfg.attack.angle, effect: cfg.attack.effect || null,
        label: cfg.label, sfx: cfg.attack.sfx || "slash",
      }, "script");
      burst(target.x, target.y - 80, cfg.color, 10, 0.7);
    },

    updateSupport(dt, target) {
      // Hover behind and above the owner's shoulder, tracking smoothly.
      const anchorX = clamp(owner.x - owner.facing * (cfg.hover?.back ?? 70), 90, 1190);
      const anchorY = owner.y - (cfg.hover?.up ?? 150) + Math.sin(this.bob) * 8;
      this.x += (anchorX - this.x) * Math.min(1, dt * 6);
      this.y += (anchorY - this.y) * Math.min(1, dt * 6);
      this.dir = target ? (sign(target.x - this.x) || this.dir) : owner.facing;
      if (!target || this.attackCd > 0) return;
      this.attackCd = cfg.attack.cd ?? 1.2;
      const proj = spawnProjectile(owner, {
        ...cfg.attack.projectile,
        x: this.x + this.dir * 24,
        y: this.y,
        dir: this.dir,
        label: cfg.label,
      });
      // aim at the target rather than firing flat
      const dy = (target.y - 80) - this.y;
      proj.vy = clamp(dy * 1.6, -260, 300);
      burst(this.x + this.dir * 20, this.y, cfg.color, 6, 0.5);
      playSfx("whoosh", 0.6, 1.3);
    },

    draw(ctx) {
      const img = summonImage(cfg.sprites);
      const fade = this.t < 0.25 ? this.t / 0.25 : Math.min(1, (this.dur - this.t) / 0.35);
      const lunge = this.lungeT > 0 ? Math.sin((0.22 - this.lungeT) / 0.22 * Math.PI) * 16 : 0;
      const hoverBob = this.behavior === "support" ? 0 : Math.sin(this.bob) * (cfg.bobAmp || 0);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      ctx.translate(this.x + this.dir * lunge, this.y + hoverBob);
      // Sway with the hover, and lean into a lunge. Summons are a single
      // still image held for their whole lifetime, so this is the only thing
      // separating a hovering curse from a decal pinned to the stage.
      const sway = Math.sin(this.bob * 0.7) * 0.045 + (lunge / 16) * this.dir * 0.12;
      ctx.rotate(sway);
      // summon art faces left in source unless flagged; mirror to face dir
      ctx.scale(this.dir > 0 ? (cfg.faceRight ? 1 : -1) : (cfg.faceRight ? -1 : 1), 1);
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = 14;
      if (img) {
        const h = cfg.h ?? 110;
        const w = img.width * h / img.height;
        ctx.drawImage(img, -w / 2, -h, w, h);
      } else {
        // no art at all: glowing orb silhouette
        ctx.fillStyle = cfg.color;
        ctx.globalAlpha *= 0.8;
        ctx.beginPath();
        ctx.arc(0, -(cfg.h ?? 110) / 2, (cfg.h ?? 110) / 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };

  if (s.behavior === "support") {
    s.y = owner.y - (cfg.hover?.up ?? 150);
  }
  state.entities.push(s);
  burst(s.x, s.y - (cfg.hitH || 90) / 2, cfg.color, 18, 1);
  dust(s.x, groundY(), 8);
  return s;
}
