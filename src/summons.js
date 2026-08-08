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
// PILOTING. Every summon hunts on its own the moment it lands, so casting one
// is never worse than it was. Push the RIGHT STICK and the owner takes the
// reins instead: the summon goes where the stick points until the stick has
// been at rest for PILOT_RELEASE seconds, then resumes hunting. It keeps
// attacking on contact either way — you steer it, you do not have to also
// swing it, which is what makes driving one playable alongside your own
// fighter. Grounded summons steer horizontally and JUMP on up — landing on
// platforms like a fighter, fast-falling on down. Only the support flyer reads
// the vertical axis as flight.
//
// Summons are lifetime-limited and capped per (owner, id): recasting past the
// cap dismisses the oldest. They die with their owner's elimination; match
// reset clears state.entities wholesale.

import { state } from "./state.js";
import { clamp, sign, rand, rectsOverlap } from "./utils.js";
import { applyHit, hurtbox, spawnProjectile, ownerStick } from "./combat.js";
import { burst, dust, ring } from "./particles.js";
import { playSfx } from "./audio.js";
import { getImage } from "./assets.js";
import { MOTION } from "./config_tuning.js";

// Seconds of a centred stick before a piloted summon goes back to hunting on
// its own. Long enough to survive a thumb repositioning mid-drive, short enough
// that letting go reads as "you have it back" rather than as a stuck summon.
const PILOT_RELEASE = 1.2;

// A piloted summon moves at this multiple of its hunting speed. Slightly faster
// is the reward for spending attention on it.
const PILOT_SPEED_MUL = 1.15;

// Vertical bounds for a flying summon under manual control, so it cannot be
// driven into the blast zones or under the stage.
const PILOT_CEILING = 90;

// A grounded summon's jump, for reaching platforms and airborne enemies. Only
// piloted summons jump — hunting ones have no way to decide it is worth it, and
// a shikigami that hops on its own looks like a bug rather than a tactic.
const PILOT_JUMP_VY = -900;
const PILOT_GRAVITY = 2400;
const PILOT_FASTFALL = 1.7;

// How far up the stick must go to count as a jump. Well above the deadzone, so
// steering a flyer diagonally never launches a dog.
const PILOT_JUMP_AXIS = 0.6;

function groundY() {
  return state.platforms.length ? state.platforms[0].y : 568;
}

// The surface a falling summon should land on: the highest platform it is over
// and was above last step. Mirrors the fighter rule (see resolvePlatforms) so
// a dog stands where a fighter would, minus the drop-through handling — nothing
// gives a summon the input to drop through.
function landingY(x, prevY, y, vy) {
  if (vy < 0) return null;
  let best = null;
  for (const plat of state.platforms) {
    if (plat.ghost) continue;
    const margin = plat.kind === "main" ? 14 : 24;
    if (x < plat.x - margin || x > plat.x + plat.w + margin) continue;
    if (prevY <= plat.y + 4 && y >= plat.y) {
      if (best === null || plat.y < best) best = plat.y;
    }
  }
  return best;
}

// Is there still a platform holding this summon up at `y`? A summon that walks
// off the end of the ledge it landed on has to start falling — without this it
// would be pinned to that height out over open air.
function supported(x, y) {
  for (const plat of state.platforms) {
    if (plat.ghost) continue;
    if (Math.abs(plat.y - y) > 1) continue;
    const margin = plat.kind === "main" ? 14 : 24;
    if (x >= plat.x - margin && x <= plat.x + plat.w + margin) return true;
  }
  return false;
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
    // Piloting. `piloted` latches on the first deliberate push of the right
    // stick and stays on through momentary re-centring, which is what `idleT`
    // measures.
    piloted: false,
    idleT: 0,
    // Airtime for a jumping grounded summon. `vy` is only meaningful while
    // airborne; `jumpArmed` makes the jump an edge on the stick rather than a
    // hop every frame the stick is held up.
    vy: 0,
    airborne: false,
    jumpArmed: true,

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

      const stick = ownerStick(owner);
      const pushed = stick.x !== 0 || stick.y !== 0;
      if (pushed) {
        this.idleT = 0;
        // The hand-off is worth announcing once: a summon that silently stops
        // hunting looks broken.
        if (!this.piloted) {
          this.piloted = true;
          ring(this.x, this.y - (cfg.hitH ?? 90) / 2, cfg.color, 60);
          playSfx("summonAppear", 0.45);
        }
      } else if (this.piloted) {
        this.idleT += dt;
        if (this.idleT >= PILOT_RELEASE) this.piloted = false;
      }

      const target = nearestTarget(owner, this.x);
      if (this.piloted) this.updatePiloted(dt, stick, target);
      else if (this.behavior === "support") this.updateSupport(dt, target);
      else this.updatePursuit(dt, target);
    },

    // Manual control. Movement comes from the stick; everything else — what it
    // does when it reaches someone — is the automatic behavior's job, so a
    // driven summon hits exactly as hard as one that found its own way there.
    updatePiloted(dt, stick, target) {
      const speed = (cfg.speed ?? 420) * PILOT_SPEED_MUL;
      const flies = this.behavior === "support";
      if (stick.x) {
        this.x = clamp(this.x + stick.x * speed * dt, 90, 1190);
        this.dir = sign(stick.x);
      } else if (target) {
        // Still face what it would bite, so a summon held steady over an enemy
        // does not sit there looking the wrong way.
        this.dir = sign(target.x - this.x) || this.dir;
      }
      if (flies) {
        // Held steady it keeps bobbing, so a parked flyer still reads as alive.
        const vy = stick.y ? stick.y * speed : Math.sin(this.bob) * 26;
        this.y = clamp(this.y + vy * dt, PILOT_CEILING, groundY());
      } else {
        // Up on the stick is a jump, not flight — a dog that hovered would be
        // a different creature. Re-arms only once the stick comes back down,
        // so holding up gives one jump rather than a hover.
        if (stick.y <= -PILOT_JUMP_AXIS) {
          if (this.jumpArmed && !this.airborne) {
            this.jumpArmed = false;
            this.airborne = true;
            this.vy = PILOT_JUMP_VY;
            dust(this.x, this.y, 6);
            playSfx("jump", 0.4);
          }
        } else {
          this.jumpArmed = true;
        }
        this.stepGravity(dt, stick.y > 0);
        if (stick.x && !this.airborne && Math.random() < dt * 6) dust(this.x - this.dir * 20, this.y, 3);
      }
      if (!target) return;
      // Contact resolves through the same code paths as an automatic hunt.
      if (flies) this.fireSupport(target);
      else this.tryContact(target);
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
      // Finishes any jump the player left it in before pinning back to the
      // ground; a hunting summon never starts one.
      this.stepGravity(dt, false);
      if (!this.airborne && Math.random() < dt * 5) dust(this.x - this.dir * 20, this.y, 3);
      if (target) this.tryContact(target);
    },

    // Airtime for a grounded summon. Shared by piloted and automatic movement,
    // because a summon released mid-jump has to finish the arc — snapping it to
    // the floor the instant the stick centres would read as a teleport.
    stepGravity(dt, fastFall) {
      if (!this.airborne) {
        // Standing: hold the surface it landed on, and step off into a fall the
        // moment that surface stops being under it.
        if (this.y < groundY() && !supported(this.x, this.y)) {
          this.airborne = true;
          this.vy = 0;
        } else {
          if (this.y >= groundY()) this.y = groundY();
          return;
        }
      }
      const prevY = this.y;
      this.vy += PILOT_GRAVITY * (fastFall ? PILOT_FASTFALL : 1) * dt;
      this.y += this.vy * dt;
      const land = landingY(this.x, prevY, this.y, this.vy);
      const floor = groundY();
      if (land !== null) {
        this.y = land;
      } else if (this.y >= floor) {
        this.y = floor;
      } else {
        return;
      }
      this.airborne = false;
      this.vy = 0;
      dust(this.x, this.y, 5);
    },

    // What touching an enemy means, for both the automatic hunt and a piloted
    // drive. Bombers spend themselves; chasers bite on a cooldown.
    tryContact(target) {
      const rect = {
        x: this.x - (cfg.hitW ?? 70) / 2, y: this.y - (cfg.hitH ?? 90),
        w: cfg.hitW ?? 70, h: cfg.hitH ?? 90,
      };
      if (!rectsOverlap(rect, hurtbox(target))) return;

      if (this.behavior === "bomber") {
        this.dead = true;
        burst(this.x, this.y - 50, cfg.color, 30, 1.3);
        ring(this.x, this.y - 50, cfg.color, (cfg.attack.r || 90) * 1.3);
        playSfx("summonAttack", 0.9);
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
      if (target) this.fireSupport(target);
    },

    // A support summon's shot, on its own cooldown. Shared with piloted flight,
    // where the player picks the firing position and the summon still picks the
    // moment.
    fireSupport(target) {
      if (this.attackCd > 0) return;
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
      playSfx("projectileFire", 0.7);
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
      const sway = Math.sin(this.bob * 0.7) * MOTION.summonSway
                 + (lunge / 16) * this.dir * MOTION.summonLunge;
      ctx.rotate(sway);
      // summon art faces left in source unless flagged; mirror to face dir
      ctx.scale(this.dir > 0 ? (cfg.faceRight ? 1 : -1) : (cfg.faceRight ? -1 : 1), 1);
      ctx.shadowColor = cfg.color;
      // A driven summon glows harder than one running itself. With four
      // fighters and several summons on screen, the player needs to see at a
      // glance which one their stick is actually moving.
      ctx.shadowBlur = this.piloted ? 26 : 14;
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

      // The pilot marker rides above the summon, outside the mirrored and
      // rotated transform so it never flips or tilts with the art.
      if (this.piloted) {
        const top = this.y + hoverBob - (cfg.h ?? 110) - 16;
        ctx.save();
        // Pulses, but never dims to the point of being missable. Drawn white
        // with a dark outline rather than in the summon's theme colour — the
        // dogs' navy would vanish against half the stages.
        ctx.globalAlpha = Math.max(0, Math.min(1, fade)) * (0.78 + 0.22 * Math.sin(this.bob * 2));
        ctx.beginPath();
        ctx.moveTo(this.x, top + 12);
        ctx.lineTo(this.x - 9, top);
        ctx.lineTo(this.x + 9, top);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
        ctx.lineWidth = 2;
        ctx.shadowColor = cfg.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    },
  };

  if (s.behavior === "support") {
    s.y = owner.y - (cfg.hover?.up ?? 150);
  }
  state.entities.push(s);
  playSfx("summonAppear");
  burst(s.x, s.y - (cfg.hitH || 90) / 2, cfg.color, 18, 1);
  dust(s.x, groundY(), 8);
  return s;
}
