// Ultimate attacks. Each character's `ultimate.type` maps to a director here.
// Ultimates cost a full meter and are the cinematic centerpiece of each kit.

import { state } from "./state.js";
import { clamp, sign, rand } from "./utils.js";
import { spawnMelee, spawnProjectile, opponentOf, applyHit, hurtbox } from "./combat.js";
import { burst, dust, ring, popup, banner } from "./particles.js";
import { applyInstall } from "./specials.js";
import { playSfx, playGrunt } from "./audio.js";
import { circleRectOverlap, rectsOverlap } from "./utils.js";
import { getImage } from "./assets.js";

function cinematic(f, name, color) {
  state.slowMo = Math.max(state.slowMo, 0.45);
  state.screenFlash = { color, life: 0.32, maxLife: 0.32 };
  banner(name, color, { y: 210, size: 46, life: 1.5 });
  playSfx("ult", 1);
  playGrunt(f.charKey);
  state.camera.shake = Math.max(state.camera.shake, 9);
  ring(f.x, f.y - 90, color, 190);
}

function beginUltAction(f, dur, opts = {}) {
  f.action = { kind: "ult", t: 0, dur, anim: "ult", lockMovement: true, uninterruptible: true, ...opts };
  f.animTime = 0;
  f.animKey = "ult";
  f.invuln = Math.max(f.invuln, Math.min(dur + 0.1, 1.2));
}

export function performUltimate(f) {
  const ult = f.char.ultimate;
  if (!ult) return;
  f.meter = 0;
  cinematic(f, ult.name, ult.p.color || f.char.theme);
  DIRECTORS[ult.type](f, ult.p, ult);
}

const DIRECTORS = {
  // Gojo — Hollow Purple: a massive erasing mass that crosses the stage.
  beam(f, p) {
    beginUltAction(f, 0.9);
    state.entities.push({
      owner: f, t: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t > 0.55 && !this.fired) {
          this.fired = true;
          spawnProjectile(f, {
            speed: 860, ox: 90, oy: -96, r: p.width / 2, dur: p.duration,
            dmg: p.dmg, base: p.base, growth: p.growth, angle: 0.4,
            color: p.color, pierce: true, unblockable: true,
            clearsProjectiles: true, label: "Hollow Purple",
            sprite: p.sprite, spriteH: p.spriteH,
          });
          playSfx("blast", 1, 0.7);
          state.camera.shake = Math.max(state.camera.shake, 14);
          state.slowMo = Math.max(state.slowMo, 0.2);
        }
        if (this.t > 0.9) this.dead = true;
      },
      draw(ctx) {
        if (this.t < 0.55) {
          const g = Math.min(1, this.t / 0.55);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.75;
          const cx = f.x + f.facing * 90;
          const cy = f.y - 96;
          const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 20 + g * 70);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.5, p.color);
          grad.addColorStop(1, "rgba(181,108,255,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, 20 + g * 70, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      },
    });
  },

  // Sukuna — Malevolent Shrine: slashes rain everywhere inside the domain.
  domain(f, p) {
    beginUltAction(f, 1.0);
    state.domainOverlay = { color: p.color, life: p.duration + 0.6, maxLife: p.duration + 0.6, label: "Malevolent Shrine", ownerId: f.id };
    state.entities.push({
      owner: f, t: 0, tick: 0.5, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t >= p.duration) {
          this.dead = true;
          const opp = opponentOf(f);
          if (opp && !opp.dead && opp.respawnTimer <= 0) {
            applyHit(f, opp, {
              dmg: 14, baseKb: p.finalBase, growth: p.growth * 2, angle: 0.6,
              label: "Malevolent Shrine", sfx: "blast", unblockable: true, heavy: true,
            }, "script");
          }
          return;
        }
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = p.tickRate;
          const opp = opponentOf(f);
          if (opp && !opp.dead && opp.respawnTimer <= 0) {
            const wasInv = opp.invuln > 0;
            if (!wasInv) {
              opp.damage = Math.min(999, opp.damage + p.dmgTick);
              opp.hitstun = Math.max(opp.hitstun, 0.16);
              if (opp.shielding) opp.shield = Math.max(0, opp.shield - 4);
              const sx = opp.x + rand(-70, 70);
              const sy = opp.y - rand(20, 150);
              burst(sx, sy, p.color, 7, 0.8);
              popup(opp.x, opp.y - 140, `${p.dmgTick}%`, p.color, 15);
              state.camera.shake = Math.max(state.camera.shake, 3);
            }
          }
          // ambient slashes
          burst(rand(200, 1080), rand(200, 620), p.color, 4, 0.7);
        }
      },
      draw(ctx) {
        const shrine = p.sprite ? getImage(p.sprite) : null;
        if (!shrine) return;
        const groundY = state.platforms[0]?.y ?? 568;
        const fadeIn = Math.min(1, this.t / 0.45);
        const fadeOut = Math.min(1, Math.max(0, p.duration - this.t) / 0.45);
        const h = 455;
        const w = shrine.width * h / shrine.height;
        ctx.save();
        ctx.globalAlpha = 0.72 * fadeIn * fadeOut;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 32;
        ctx.drawImage(shrine, 640 - w / 2, groundY - h, w, h);
        ctx.restore();
      },
    });
  },

  // Megumi — Mahoraga stalks the stage.
  summon(f, p) {
    beginUltAction(f, 0.9);
    applyInstall(f, { t: p.duration, label: "MAHORAGA", color: p.color, dmgTakenMul: p.selfDamageMul }, 2);
    const opp = opponentOf(f);
    const dir = opp ? sign(opp.x - f.x) || 1 : 1;
    state.entities.push({
      kind: "mahoraga",
      owner: f,
      x: clamp(f.x - dir * 120, 100, 1180), t: 0, dir, wheel: 0, dead: false,
      hitCd: 0,
      update(dt) {
        this.t += dt;
        this.wheel += dt * 2.4;
        if (this.t >= p.duration) { this.dead = true; return; }
        const target = opponentOf(f);
        if (target && !target.dead) this.dir = sign(target.x - this.x) || this.dir;
        this.x = clamp(this.x + this.dir * p.speed * dt, 90, 1190);
        this.hitCd -= dt;
        const groundY = state.platforms[0]?.y ?? 568;
        const rect = { x: this.x - 60, y: groundY - 190, w: 120, h: 190 };
        if (this.hitCd <= 0 && target && !target.dead && target.respawnTimer <= 0 &&
            rectsOverlap(rect, hurtbox(target))) {
          this.hitCd = 0.55;
          applyHit(f, target, {
            dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.7,
            label: "Mahoraga", sfx: "punch", heavy: true,
          }, "script");
          state.camera.shake = Math.max(state.camera.shake, 8);
        }
        if (Math.random() < dt * 6) dust(this.x + rand(-40, 40), groundY, 4);
      },
      draw(ctx) {
        const groundY = state.platforms[0]?.y ?? 568;
        const x = this.x, y = groundY;
        const img = getImage("summon:mahoraga");
        if (img) {
          const h = 250;
          const w = img.width * h / img.height;
          ctx.save();
          ctx.translate(x, y + 6);
          ctx.scale(this.dir > 0 ? -1 : 1, 1);
          ctx.shadowColor = "#e8ecf8";
          ctx.shadowBlur = 16;
          ctx.drawImage(img, -w / 2, -h, w, h);
          ctx.restore();
          return;
        }
        ctx.save();
        // wheel halo
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = "#e8ecf8";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y - 214, 26, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = this.wheel + (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 8, y - 214 + Math.sin(a) * 8);
          ctx.lineTo(x + Math.cos(a) * 26, y - 214 + Math.sin(a) * 26);
          ctx.stroke();
        }
        // body silhouette
        const grad = ctx.createLinearGradient(x, y - 190, x, y);
        grad.addColorStop(0, "rgba(232,236,248,0.95)");
        grad.addColorStop(1, "rgba(120,128,160,0.85)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x - 44, y);
        ctx.quadraticCurveTo(x - 56, y - 120, x - 24, y - 168);
        ctx.quadraticCurveTo(x, y - 196, x + 24, y - 168);
        ctx.quadraticCurveTo(x + 56, y - 120, x + 44, y);
        ctx.closePath();
        ctx.fill();
        // glowing eyes
        ctx.fillStyle = "#62dcff";
        ctx.beginPath();
        ctx.arc(x + this.dir * 10, y - 168, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    });
  },

  // Jogo — Maximum: Meteor.
  meteor(f, p) {
    beginUltAction(f, 1.0);
    const opp = opponentOf(f);
    const tx = clamp(opp ? opp.x : f.x + f.facing * 300, 160, 1120);
    state.entities.push({
      owner: f, t: 0, dead: false, impactAt: p.fallTime + 0.5, exploded: false, burnT: 0,
      update(dt) {
        this.t += dt;
        if (!this.exploded && this.t >= this.impactAt) {
          this.exploded = true;
          playSfx("blast", 1, 0.6);
          state.camera.shake = Math.max(state.camera.shake, 18);
          state.slowMo = Math.max(state.slowMo, 0.25);
          state.screenFlash = { color: "#ff7a2f", life: 0.3, maxLife: 0.3 };
          const groundY = state.platforms[0]?.y ?? 568;
          burst(tx, groundY - 40, "#ff7a2f", 70, 2.2);
          ring(tx, groundY - 40, "#ffd35a", 260);
          for (const t of state.fighters) {
            if (t === f || t.dead || t.respawnTimer > 0) continue;
            if (circleRectOverlap(tx, groundY - 40, p.r, hurtbox(t))) {
              applyHit(f, t, {
                dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.9,
                label: "MAXIMUM: METEOR", sfx: "blast", unblockable: true,
                effect: "burn", heavy: true,
              }, "script");
            }
          }
        }
        if (this.exploded) {
          this.burnT += dt;
          if (this.burnT > 0.4) {
            this.burnT = 0;
            const groundY = state.platforms[0]?.y ?? 568;
            for (const t of state.fighters) {
              if (t === f || t.dead || t.respawnTimer > 0 || t.invuln > 0) continue;
              if (Math.abs(t.x - tx) < p.r && Math.abs(t.y - groundY) < 60) {
                t.damage = Math.min(999, t.damage + 1.6);
                burst(t.x, t.y - 60, "#ff7a2f", 6, 0.5);
              }
            }
          }
          if (this.t >= this.impactAt + p.burnField) this.dead = true;
        }
      },
      draw(ctx) {
        const groundY = state.platforms[0]?.y ?? 568;
        if (!this.exploded) {
          // warning marker
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 16);
          ctx.strokeStyle = "#ff7a2f";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(tx, groundY - 4, 90, 16, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          if (this.t > 0.5) {
            const prog = (this.t - 0.5) / p.fallTime;
            const my = -160 + prog * (groundY - 40 + 160);
            const img = p.sprite ? getImage(p.sprite) : null;
            if (img) {
              const h = p.spriteH || 310;
              const w = img.width * h / img.height;
              ctx.save();
              ctx.translate(tx, my);
              ctx.shadowColor = p.color;
              ctx.shadowBlur = 24;
              ctx.drawImage(img, -w / 2, -h / 2, w, h);
              ctx.restore();
              return;
            }
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const grad = ctx.createRadialGradient(tx, my, 10, tx, my, 90);
            grad.addColorStop(0, "#fff3d0");
            grad.addColorStop(0.4, "#ff9a3f");
            grad.addColorStop(1, "rgba(255,90,31,0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(tx, my, 90, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } else {
          const fade = 1 - (this.t - this.impactAt) / p.burnField;
          ctx.save();
          ctx.globalAlpha = 0.45 * Math.max(0, fade);
          ctx.fillStyle = "#ff5a1f";
          for (let i = -3; i <= 3; i++) {
            const fx = tx + i * (p.r / 3.4);
            const h = 26 + 16 * Math.sin(this.t * 11 + i * 2);
            ctx.beginPath();
            ctx.moveTo(fx - 14, groundY);
            ctx.quadraticCurveTo(fx, groundY - h * 2, fx + 14, groundY);
            ctx.fill();
          }
          ctx.restore();
        }
      },
    });
  },

  // Geto — Maximum: Uzumaki.
  vortex(f, p) {
    beginUltAction(f, 0.9);
    state.entities.push({
      owner: f,
      x: f.x + f.facing * 130, y: f.y - 110, t: 0, tick: 0.4, dead: false,
      update(dt) {
        this.t += dt;
        this.x += f.facing * p.speed * dt;
        if (this.t >= p.dur || this.x < -100 || this.x > 1380) {
          this.dead = true;
          for (const t of state.fighters) {
            if (t === f || t.dead || t.respawnTimer > 0) continue;
            if (circleRectOverlap(this.x, this.y, p.r * 1.3, hurtbox(t))) {
              applyHit(f, t, {
                dmg: 16, baseKb: p.finalBase, growth: p.growth * 2, angle: 0.7,
                label: "UZUMAKI", sfx: "blast", unblockable: true, heavy: true,
              }, "script");
            }
          }
          burst(this.x, this.y, p.color, 50, 1.8);
          ring(this.x, this.y, p.color, 240);
          return;
        }
        for (const t of state.fighters) {
          if (t === f || t.dead || t.respawnTimer > 0 || t.hitstun > 0.5) continue;
          const d = Math.hypot(t.x - this.x, (t.y - 90) - this.y);
          if (d < p.pull) {
            t.vx += sign(this.x - t.x) * 780 * dt;
            if (t.y - 90 > this.y) t.vy -= 620 * dt;
          }
        }
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = p.tickRate;
          for (const t of state.fighters) {
            if (t === f || t.dead || t.respawnTimer > 0 || t.invuln > 0) continue;
            if (circleRectOverlap(this.x, this.y, p.r, hurtbox(t))) {
              t.damage = Math.min(999, t.damage + p.dmgTick);
              t.hitstun = Math.max(t.hitstun, 0.18);
              burst(t.x, t.y - 90, p.color, 6, 0.7);
              popup(t.x, t.y - 140, `${p.dmgTick}%`, p.color, 14);
            }
          }
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        if (img) {
          const h = p.spriteH || 250;
          const w = img.width * h / img.height;
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.t * 0.75);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 24;
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
          return;
        }
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.t * 7);
        ctx.globalCompositeOperation = "lighter";
        for (let arm = 0; arm < 3; arm++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.strokeStyle = arm % 2 ? "#9d7dff" : p.color;
          ctx.lineWidth = 10;
          ctx.beginPath();
          for (let a = 0; a < 2.4; a += 0.2) {
            const rr = 14 + a * (p.r / 2.6);
            ctx.lineTo(Math.cos(a * 2.4) * rr, Math.sin(a * 2.4) * rr);
          }
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

  // Momo — Maximum: Great Tempest.
  tempest(f, p) {
    beginUltAction(f, 0.9);
    state.domainOverlay = { color: p.color, life: p.duration + 0.4, maxLife: p.duration + 0.4, label: "Great Tempest", ownerId: f.id };
    state.entities.push({
      owner: f, t: 0, tick: 0.5, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t >= p.duration) {
          this.dead = true;
          const opp = opponentOf(f);
          if (opp && !opp.dead && opp.respawnTimer <= 0) {
            applyHit(f, opp, {
              dmg: 12, baseKb: p.finalBase, growth: p.growth * 1.6, angle: 1.2,
              label: "GREAT TEMPEST", sfx: "blast", unblockable: true, heavy: true,
            }, "script");
          }
          return;
        }
        const opp = opponentOf(f);
        if (opp && !opp.dead && opp.respawnTimer <= 0) {
          opp.vx += Math.sin(this.t * 5) * 900 * dt;
          if (!opp.grounded) opp.vy -= 300 * dt;
          this.tick -= dt;
          if (this.tick <= 0 && opp.invuln <= 0) {
            this.tick = p.tickRate;
            opp.damage = Math.min(999, opp.damage + p.dmgTick);
            opp.hitstun = Math.max(opp.hitstun, 0.14);
            burst(opp.x + rand(-40, 40), opp.y - rand(30, 130), "#d5d6ff", 5, 0.8);
            popup(opp.x, opp.y - 140, `${p.dmgTick}%`, p.color, 13);
          }
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        if (img) {
          const h = p.spriteH || 650;
          const w = img.width * h / img.height;
          const sway = Math.sin(this.t * 2.6) * 34;
          ctx.save();
          ctx.translate(640 + sway, 595);
          ctx.globalAlpha = Math.min(0.78, this.t * 1.6) * Math.min(1, (p.duration - this.t) * 3);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 28;
          ctx.drawImage(img, -w / 2, -h, w, h);
          ctx.restore();
          return;
        }
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const yy = ((this.t * 340 + i * 110) % 820) - 60;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.bezierCurveTo(420, yy - 60 * Math.sin(this.t * 3 + i), 860, yy + 60 * Math.cos(this.t * 2.4 + i), 1280, yy - 30);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

  // Install ultimates: Hakari Jackpot, Mahito True Form, Maki Awakening, Yuta Rika.
  install(f, p, ult) {
    beginUltAction(f, 0.8);
    if (p.domainSprite) {
      state.domainOverlay = {
        color: p.color, life: p.duration, maxLife: p.duration,
        label: p.label, ownerId: f.id, sprite: p.domainSprite,
      };
    }
    applyInstall(f, {
      t: p.duration, label: p.label, color: p.color,
      speedMul: p.speedMul, dmgMul: p.dmgMul, armor: p.armor,
      unblockable: p.unblockable, healPerSec: p.healPerSec,
      echoDamage: p.echoDamage, dmgTakenMul: p.dmgTakenMul, aura: p.aura,
    }, 2);
    burst(f.x, f.y - 90, p.color, 40, 1.6);
    if (p.sprite) {
      state.entities.push({
        owner: f, dead: false,
        update() {
          if (f.dead || !f.installs || f.installs.label !== p.label) this.dead = true;
        },
        draw(ctx) {
          const img = getImage(p.sprite);
          if (!img) return;
          const h = 238;
          const w = img.width * h / img.height;
          ctx.save();
          ctx.translate(f.x - f.facing * 58, f.y + 18);
          ctx.scale(f.facing > 0 ? -1 : 1, 1);
          ctx.globalAlpha = 0.58;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 20;
          ctx.drawImage(img, -w / 2, -h, w, h);
          ctx.restore();
        },
      });
    }
  },

  // Flurry rushes: Nanami, Toji, Todo.
  flurry(f, p, ult) {
    const opp = opponentOf(f);
    const inRange = opp && !opp.dead && opp.respawnTimer <= 0 && Math.abs(opp.x - f.x) < 640;
    if (!inRange) {
      beginUltAction(f, 0.7);
      f.vx = f.facing * 700;
      spawnMelee(f, {
        delay: 0.1, dur: 0.3, ox: 50, oy: -100, w: 220, h: 120,
        dmg: 14, base: 520, growth: 8, angle: 0.4, label: ult.name, sfx: "slashHeavy", heavy: true,
      });
      f.meter = 40; // partial refund on whiffed read
      popup(f.x, f.y - 170, "MISSED THE MARK", "#9aa4c0", 16);
      return;
    }
    const total = p.hits * 0.15 + 0.7;
    beginUltAction(f, total);
    f.invuln = Math.max(f.invuln, total);
    opp.hitstun = Math.max(opp.hitstun, total);
    let i = 0;
    const events = [];
    for (; i < p.hits; i++) {
      events.push({
        at: 0.3 + i * 0.15,
        fn: (self) => {
          const t = opponentOf(self);
          if (!t || t.dead || t.respawnTimer > 0 || t.invuln > 0.3) return;
          const side = p.teleport ? (Math.random() < 0.5 ? -1 : 1) : (self.x < t.x ? -1 : 1);
          self.x = clamp(t.x + side * 70, 60, 1220);
          self.facing = sign(t.x - self.x) || 1;
          t.hitstun = Math.max(t.hitstun, 0.5);
          t.damage = Math.min(999, t.damage + p.dmg);
          t.shakeMag = 5;
          burst(t.x, t.y - 90, ult.p.color, 12, 1);
          popup(t.x + rand(-30, 30), t.y - 120 - rand(0, 40), `${p.dmg}%`, "#ffffff", 16);
          playSfx(Math.random() < 0.5 ? "punch" : "slash", 0.85);
          state.camera.shake = Math.max(state.camera.shake, 5);
          if (p.teleport) burst(self.x, self.y - 80, ult.p.color, 8, 0.7);
        },
      });
    }
    events.push({
      at: 0.3 + p.hits * 0.15 + 0.15,
      fn: (self) => {
        const t = opponentOf(self);
        if (!t || t.dead || t.respawnTimer > 0) return;
        applyHit(self, t, {
          dmg: p.finisherDmg, baseKb: p.finisherBase, growth: p.growth, angle: 0.55,
          label: ult.p.label, sfx: "blast", unblockable: true, heavy: true,
          effect: p.silence ? "silence" : null,
        }, "script");
        if (p.crit) popup(t.x, t.y - 180, "7:3!!", "#ffd35a", 30);
        state.slowMo = Math.max(state.slowMo, 0.3);
      },
    });
    f.action.events = events;
  },

  // Hanami — waves of roots erupt across the whole floor.
  eruption(f, p) {
    beginUltAction(f, 1.0);
    state.entities.push({
      owner: f, t: 0, wave: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.wave >= p.waves) { this.dead = true; return; }
        if (this.t >= this.wave * p.waveGap) {
          const groundY = state.platforms[0]?.y ?? 568;
          const originX = f.x;
          const spread = 150 + this.wave * 170;
          for (const dir of [-1, 1]) {
            const px = originX + dir * spread;
            if (px < 100 || px > 1180) continue;
            burst(px, groundY - 60, p.color, 18, 1.1);
            dust(px, groundY, 12);
            for (const t of state.fighters) {
              if (t === f || t.dead || t.respawnTimer > 0) continue;
              if (Math.abs(t.x - px) < 90 && Math.abs(t.y - groundY) < 140) {
                applyHit(f, t, {
                  dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 1.1,
                  label: "Flowering Forest", sfx: "blast", effect: "rootSnare",
                }, "script");
              }
            }
          }
          playSfx("blast", 0.7, 0.85);
          state.camera.shake = Math.max(state.camera.shake, 7);
          this.wave += 1;
        }
      },
      draw(ctx) {
        const groundY = state.platforms[0]?.y ?? 568;
        const roots = p.sprite ? getImage(p.sprite) : null;
        ctx.save();
        ctx.globalAlpha = roots ? 0.85 : 0.5;
        ctx.fillStyle = p.color;
        for (let w = 0; w < this.wave; w++) {
          const spread = 150 + w * 170;
          for (const dir of [-1, 1]) {
            const px = f.x + dir * spread;
            if (px < 100 || px > 1180) continue;
            const age = this.t - w * p.waveGap;
            const h = Math.max(0, 130 * (1 - age * 0.8));
            if (h <= 4) continue;
            if (roots) {
              const drawH = h * 1.65;
              const drawW = roots.width * drawH / roots.height;
              ctx.drawImage(roots, px - drawW / 2, groundY - drawH, drawW, drawH);
              continue;
            }
            ctx.beginPath();
            ctx.moveTo(px - 36, groundY);
            ctx.lineTo(px - 10, groundY - h * 0.8);
            ctx.lineTo(px, groundY - h);
            ctx.lineTo(px + 12, groundY - h * 0.7);
            ctx.lineTo(px + 36, groundY);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      },
    });
  },

  // Nobara — Deluxe Resonance nail storm.
  nailstorm(f, p, ult) {
    beginUltAction(f, 1.0);
    state.entities.push({
      owner: f, t: 0, volley: 0, dead: false,
      update(dt) {
        this.t += dt;
        const opp = opponentOf(f);
        if (this.volley < p.volleys && this.t >= 0.3 + this.volley * 0.16) {
          this.volley += 1;
          if (opp && !opp.dead) {
            const fromAbove = this.volley % 2 === 0;
            spawnProjectile(f, {
              x: opp.x + rand(-120, 120), y: fromAbove ? -30 : f.y - 90,
              dir: 1, speed: 0, vy: fromAbove ? 980 : 0,
              r: 16, dur: 1.1, dmg: p.dmg, base: p.base, growth: p.growth,
              angle: fromAbove ? 1.2 : 0.4, color: p.color, effect: "nailMark",
              label: "Nail Storm", sprite: "effect:nail", spriteH: 58,
            });
            if (!fromAbove) {
              spawnProjectile(f, {
                dir: sign(opp.x - f.x) || f.facing, speed: 900, ox: 60, oy: -96,
                r: 16, dur: 0.8, dmg: p.dmg, base: p.base, growth: p.growth,
                angle: 0.4, color: p.color, effect: "nailMark", label: "Nail Storm",
                sprite: "effect:nail", spriteH: 58,
              });
            }
            playSfx("slash", 0.6, 1.3);
          }
        }
        if (this.volley >= p.volleys && this.t >= 0.3 + p.volleys * 0.16 + 0.5 && !this.finished) {
          this.finished = true;
          this.dead = true;
          if (opp && !opp.dead && opp.respawnTimer <= 0) {
            const marks = Math.max(1, opp.statuses.nailMarks);
            applyHit(f, opp, {
              dmg: p.finisherDmg + marks * 2, baseKb: p.finisherBase + marks * 30,
              growth: 9, angle: 0.6, label: ult.p.label, sfx: "blast",
              unblockable: true, heavy: true,
            }, "script");
            opp.statuses.nailMarks = 0;
            ring(opp.x, opp.y - 90, "#b56cff", 220);
          }
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        if (!img || this.t > 1.75) return;
        const h = p.spriteH || 290;
        const w = img.width * h / img.height;
        const travel = Math.min(1, this.t / 1.45);
        const x = f.facing > 0 ? -w / 2 + travel * (1280 + w) : 1280 + w / 2 - travel * (1280 + w);
        ctx.save();
        ctx.translate(x, 310);
        ctx.scale(f.facing > 0 ? -1 : 1, 1);
        ctx.globalAlpha = Math.min(0.82, this.t * 3) * Math.min(1, (1.75 - this.t) * 4);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 20;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      },
    });
  },

  // Inumaki — a stage-buckling scream.
  shout(f, p, ult) {
    beginUltAction(f, 1.1);
    spawnMelee(f, {
      delay: 0.45, dur: 0.2, ox: p.ox, oy: p.oy, w: p.w, h: p.h,
      dmg: p.dmg, base: p.base, growth: p.growth, angle: p.angle,
      label: ult.name, sfx: "blast", unblockable: true, heavy: true,
    });
    state.entities.push({
      owner: f, t: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t > 0.45 && !this.boomed) {
          this.boomed = true;
          state.camera.shake = Math.max(state.camera.shake, 16);
          state.screenFlash = { color: "#d7d9e7", life: 0.25, maxLife: 0.25 };
          ring(f.x, f.y - 100, "#d7d9e7", 320);
          playSfx("blast", 1, 0.6);
          f.throatLock = 4; // his throat pays the price
          popup(f.x, f.y - 180, "*cough cough*", "#ff8a8a", 16);
        }
        if (this.t > 1.0) this.dead = true;
      },
      draw(ctx) {
        if (this.t > 0.45) {
          const a = 1 - (this.t - 0.45) / 0.55;
          const img = p.sprite ? getImage(p.sprite) : null;
          if (img) {
            const h = (p.spriteH || 330) * (0.65 + (this.t - 0.45) * 1.2);
            const w = img.width * h / img.height;
            ctx.save();
            ctx.translate(f.x + f.facing * w * 0.3, f.y - 105);
            ctx.scale(f.facing > 0 ? -1 : 1, 1);
            ctx.globalAlpha = Math.max(0, a) * 0.85;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 24;
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
            return;
          }
          ctx.save();
          ctx.globalAlpha = a * 0.5;
          ctx.strokeStyle = "#d7d9e7";
          ctx.lineWidth = 6;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(f.x, f.y - 100, 80 + i * 90 + (this.t - 0.45) * 700, -0.9, 0.9);
            ctx.stroke();
          }
          ctx.restore();
        }
      },
    });
  },

  // Panda — Triceratops stampede.
  rampage(f, p, ult) {
    const total = p.passes * 1.0;
    beginUltAction(f, total, { lockMovement: true });
    applyInstall(f, { t: total, label: "TRICERATOPS", color: p.color, armor: true, dmgMul: 1.1, sprite: p.sprite }, 2);
    f.invuln = Math.max(f.invuln, 0.5);
    state.entities.push({
      owner: f, t: 0, pass: 0, dir: f.facing, dead: false, hitCd: new Map(),
      update(dt) {
        this.t += dt;
        if (this.t >= total || f.dead || f.respawnTimer > 0) {
          this.dead = true;
          if (f.action?.kind === "ult") f.action = null;
          return;
        }
        f.vx = this.dir * p.speed;
        f.facing = this.dir;
        if ((this.dir === 1 && f.x > 1150) || (this.dir === -1 && f.x < 130)) {
          this.dir *= -1;
          this.pass += 1;
          dust(f.x, f.y, 16);
          state.camera.shake = Math.max(state.camera.shake, 6);
        }
        for (const t of state.fighters) {
          if (t === f || t.dead || t.respawnTimer > 0) continue;
          const cd = this.hitCd.get(t) || 0;
          if (cd > state.matchTime) continue;
          if (Math.abs(t.x - f.x) < 110 && Math.abs(t.y - f.y) < 130) {
            this.hitCd.set(t, state.matchTime + 0.5);
            applyHit(f, t, {
              dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.6,
              label: "TRICERATOPS", sfx: "punch", unblockable: true, heavy: true,
            }, "script");
          }
        }
        if (Math.random() < dt * 14) dust(f.x - this.dir * 40, f.y, 5);
      },
      draw(ctx) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(f.x - this.dir * (40 + i * 34), f.y - 30 - i * 8);
          ctx.lineTo(f.x - this.dir * (90 + i * 34), f.y - 30 - i * 8);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },
};
