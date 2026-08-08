import { state } from "./state.js";
import { clamp, sign, rectsOverlap, circleRectOverlap } from "./utils.js";
import { burst, dust, sparkLine, ring, popup, banner } from "./particles.js";
import { playSfx } from "./audio.js";
import { domainKnockbackMul } from "./domains.js";
import {
  SHIELD_DAMAGE_MULT, SHIELD_BREAK_STUN, PARRY_WINDOW, METER_MAX,
  METER_ON_DEAL, METER_ON_TAKE,
} from "./constants.js";
import {
  TUMBLE_KB_MIN, TUMBLE_SPIN_PER_KB, TUMBLE_SPIN_MAX,
  DI_MAX_TURN, DI_SPEED, STALE_QUEUE, STALE_DMG_STEP, STALE_KB_STEP,
} from "./config_tuning.js";

// The right stick belonging to a fighter, or a centred stick when they have no
// live input this step. CPU fighters always read as centred: aiming and steering
// are player affordances, and their kits behave exactly as they did before.
//
// Lives here rather than in summons.js because both summons and projectiles need
// it, and summons.js already depends on this module.
export function ownerStick(f) {
  const input = f?.lastInput;
  if (!input || f.aiState) return { x: 0, y: 0 };
  return { x: input.aimX || 0, y: input.aimY || 0 };
}

export function hurtbox(f) {
  if (f.ledge) return { x: f.x - 30, y: f.y - 82, w: 60, h: 84 };
  if (f.crouching) return { x: f.x - 36, y: f.y - 68, w: 72, h: 68 };
  return { x: f.x - 32, y: f.y - 108, w: 64, h: 108 };
}

export function opponentOf(f) {
  const candidates = state.fighters.filter((o) => o !== f && !o.dead && o.respawnTimer <= 0);
  if (!candidates.length) return state.fighters.find((o) => o !== f && !o.dead) || null;
  return candidates.reduce((best, o) =>
    Math.abs(o.x - f.x) < Math.abs(best.x - f.x) ? o : best
  );
}

// ---------------------------------------------------------------- hitboxes

export function spawnMelee(owner, cfg) {
  state.hitboxes.push({
    owner,
    age: -(cfg.delay || 0),
    dur: cfg.dur || 0.12,
    ox: cfg.ox ?? 40, oy: cfg.oy ?? -96,
    w: cfg.w ?? 160, h: cfg.h ?? 100,
    dmg: cfg.dmg ?? 8,
    baseKb: cfg.baseKb ?? cfg.base ?? 300,
    growth: cfg.growth ?? 5.5,
    angle: cfg.angle ?? 0.32,
    effect: cfg.effect || null,
    label: cfg.label || null,
    sfx: cfg.sfx || "punch",
    shieldMul: cfg.shieldMul || 1,
    unblockable: !!cfg.unblockable,
    heavy: !!cfg.heavy,
    spike: !!cfg.spike,
    critBand: cfg.critBand || null,
    critChance: cfg.critChance || 0,
    stunBonus: cfg.stunBonus || 0,
    maxHits: cfg.hits || 1,
    rehitRate: cfg.rehitRate || 0.16,
    facing: owner.facing, // snapshot: turning mid-swing must not teleport the hitbox
    swung: false,
    hits: new Map(), // fighter -> {count, nextAt}
  });
}

export function hitboxRect(hb) {
  const o = hb.owner;
  const facing = hb.facing ?? o.facing;
  const x = facing === 1 ? o.x + hb.ox : o.x - hb.ox - hb.w;
  return { x, y: o.y + hb.oy, w: hb.w, h: hb.h };
}

export function updateHitboxes(dt) {
  for (let i = state.hitboxes.length - 1; i >= 0; i--) {
    const hb = state.hitboxes[i];
    const o = hb.owner;
    if (o.hitPause > 0) continue; // hitboxes freeze with their owner
    hb.age += dt;
    if (hb.age > hb.dur || o.dead || (o.action == null && hb.age > 0.02)) {
      state.hitboxes.splice(i, 1);
      continue;
    }
    if (hb.age < 0) continue;
    if (!hb.swung) {
      hb.swung = true;
      playSfx("swingWhiff", 0.7);
    }
    const rect = hitboxRect(hb);
    for (const target of state.fighters) {
      if (target === o || target.dead || target.respawnTimer > 0) continue;
      let rec = hb.hits.get(target);
      if (rec && (rec.count >= hb.maxHits || hb.age < rec.nextAt)) continue;
      if (!rectsOverlap(rect, hurtbox(target))) continue;
      const landed = applyHit(o, target, hb, "melee");
      if (landed !== "ignored") {
        if (!rec) rec = { count: 0, nextAt: 0 };
        rec.count += 1;
        rec.nextAt = hb.age + hb.rehitRate;
        hb.hits.set(target, rec);
      }
    }
  }
}

// -------------------------------------------------------------- projectiles

export function spawnProjectile(owner, cfg) {
  const dir = cfg.dir ?? owner.facing;
  const p = {
    owner,
    x: cfg.x ?? owner.x + dir * (cfg.ox ?? 70),
    y: cfg.y ?? owner.y + (cfg.oy ?? -86),
    // An aimed shot supplies its own velocity vector; everything else flies
    // straight out along the caster's facing.
    vx: cfg.vx ?? dir * (cfg.speed ?? 500),
    vy: cfg.vy ?? 0,
    gravity: cfg.gravity ?? 0,
    r: cfg.r ?? 30,
    dur: cfg.dur ?? 0.9,
    age: 0,
    dmg: cfg.dmg ?? 10,
    baseKb: cfg.baseKb ?? cfg.base ?? 320,
    growth: cfg.growth ?? 6,
    angle: cfg.angle ?? 0.38,
    effect: cfg.effect || null,
    label: cfg.label || null,
    color: cfg.color || "#8fd3ff",
    pull: cfg.pull || 0,
    homing: cfg.homing || 0,
    pierce: !!cfg.pierce,
    explode: cfg.explode || 0,
    wave: !!cfg.wave,
    sprite: cfg.sprite || null,
    spriteH: cfg.spriteH || 0,
    clearsProjectiles: !!cfg.clearsProjectiles,
    stunBonus: cfg.stunBonus || 0,
    unblockable: !!cfg.unblockable,
    shieldMul: cfg.shieldMul || 1,
    // Creature projectiles (Nue, Geto's cursed spirits) can be flown with the
    // right stick. `steerRate` is how fast the flight path can be turned, in
    // radians per second.
    steerable: !!cfg.steerable,
    steerRate: cfg.steerRate ?? 5.2,
    hit: new Set(),
  };
  state.projectiles.push(p);
  return p;
}

function explodeProjectile(p) {
  burst(p.x, p.y, p.color, 26, 1.3);
  ring(p.x, p.y, p.color, p.explode * 1.4);
  playSfx("projectileHit", 0.9);
  for (const target of state.fighters) {
    if (target === p.owner || target.dead || target.respawnTimer > 0) continue;
    if (circleRectOverlap(p.x, p.y, p.explode, hurtbox(target))) {
      applyHit(p.owner, target, { ...p, dmg: p.dmg, sfx: "blast" }, "projectile");
    }
  }
}

export function updateProjectiles(dt) {
  const groundY = state.platforms.length ? state.platforms[0].y : 568;
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.age += dt;
    p.dur -= dt;
    const target = state.fighters.find((f) => f !== p.owner && !f.dead);

    // Flying it by hand. The path turns toward the stick at a limited rate
    // rather than snapping, so a steered curse arcs instead of teleporting its
    // heading, and its speed is preserved — steering redirects a shot, it does
    // not accelerate one.
    let steering = false;
    if (p.steerable) {
      const stick = ownerStick(p.owner);
      if (stick.x || stick.y) {
        steering = true;
        const speed = Math.hypot(p.vx, p.vy);
        const want = Math.atan2(stick.y, stick.x);
        const cur = Math.atan2(p.vy, p.vx);
        let delta = want - cur;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const turn = clamp(delta, -p.steerRate * dt, p.steerRate * dt);
        p.vx = Math.cos(cur + turn) * speed;
        p.vy = Math.sin(cur + turn) * speed;
      }
    }

    // A hand-flown shot answers to the hand: its own homing and its arc would
    // otherwise fight the stick for the same velocity.
    if (p.homing && target && !steering) {
      const desired = sign(target.x - p.x);
      p.vx += desired * p.homing * dt * 8;
      const dy = (target.y - 60) - p.y;
      p.vy += clamp(dy, -220, 220) * dt * 3;
    }
    if (!steering) p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.wave) p.y = groundY - p.r * 0.7;

    if (p.pull && target && target.hitstun <= 0) {
      const dx = p.x - target.x;
      const dist = Math.abs(dx);
      if (dist < p.pull) {
        target.vx += sign(dx) * 520 * dt * (1 - dist / p.pull);
        if (target.y > p.y) target.vy -= 320 * dt * (1 - dist / p.pull);
      }
    }

    if (p.clearsProjectiles) {
      for (let j = state.projectiles.length - 1; j >= 0; j--) {
        const q = state.projectiles[j];
        if (q !== p && q.owner !== p.owner && Math.hypot(q.x - p.x, q.y - p.y) < q.r + p.r) {
          burst(q.x, q.y, q.color, 14, 0.9);
          state.projectiles.splice(j, 1);
          if (j < i) i -= 1;
        }
      }
    }

    let remove = p.dur <= 0 || p.x < -160 || p.x > 1440 || p.y > 1050;
    if (remove && p.explode && p.dur <= 0) explodeProjectile(p);

    if (!remove && target && target.respawnTimer <= 0 && !p.hit.has(target)) {
      const box = hurtbox(target);
      // crouching under a high projectile dodges it
      const ducked = target.crouching && p.y < target.y - 70;
      // Sky Fold (Uro): projectiles entering the folded sky are bent straight
      // back at their owner instead of landing
      if (!ducked && target.reflect && target.reflect.t > 0 &&
          circleRectOverlap(p.x, p.y, p.r + 30, box)) {
        p.owner = target;
        p.vx = -p.vx;
        p.vy = -p.vy * 0.4;
        p.hit.clear();
        p.dur = Math.max(p.dur, 0.7);
        burst(p.x, p.y, target.reflect.color || target.char.theme, 14, 0.9);
        ring(p.x, p.y, target.reflect.color || target.char.theme, 70);
        popup(target.x, target.y - 168, "RETURNED", target.char.theme, 20);
        playSfx("guardHit", 0.9, 1.3);
        continue;
      }
      if (!ducked && circleRectOverlap(p.x, p.y, p.r, box)) {
        if (p.explode) {
          explodeProjectile(p);
          remove = true;
        } else {
          const res = applyHit(p.owner, target, { ...p, sfx: "blast" }, "projectile");
          if (res !== "ignored") {
            p.hit.add(target);
            if (!p.pierce) remove = true;
          }
        }
      }
    }

    if (remove) state.projectiles.splice(i, 1);
  }
}

// ---------------------------------------------------------------- statuses

export function applyStatus(effect, owner, target, extra = {}) {
  if (!effect) return;
  const s = target.statuses;
  const immune = (target.char.passive.id === "heavenlyBody" &&
    ["burn", "snare", "soulMark", "rootSnare", "cursedSpeech"].includes(effect)) ||
    // Choso is made of the stuff — bleeding and poisoning blood is pointless
    (target.char.passive.id === "deathPainting" && ["bleed", "poison"].includes(effect));
  if (immune) {
    popup(target.x, target.y - 150, "IMMUNE", "#b8ffe2", 20);
    return;
  }
  switch (effect) {
    case "burn": {
      const mult = owner.char.passive.id === "disasterFlame" ? 1.5 : 1;
      s.burn = { t: 2.6, tick: 0.45, dmg: 1.2 * mult, from: owner };
      break;
    }
    case "bleed":
      s.bleed = { t: 3.2, tick: 0.5, dmg: 1.4, from: owner };
      break;
    case "poison":
      // ticks whether or not the victim moves, and slows them (see speedMul)
      s.poison = { t: 3.0, tick: 0.5, dmg: 1.1, from: owner };
      break;
    case "snare":
      s.snare = Math.max(s.snare || 0, 1.35);
      break;
    case "rootSnare":
      s.snare = Math.max(s.snare || 0, 2.0);
      s.bleed = { t: 1.2, tick: 0.5, dmg: 1.0, from: owner };
      break;
    case "soulMark":
      s.soulMark = Math.max(s.soulMark || 0, 3.4);
      break;
    case "nailMark": {
      const cap = owner.char.passive.id === "strawDoll" ? 6 : 3;
      const dur = owner.char.passive.id === "strawDoll" ? 6.5 : 3.2;
      s.nailMarks = Math.min(cap, (s.nailMarks || 0) + 1);
      s.nailT = dur;
      break;
    }
    case "cursedSpeech":
      s.snare = Math.max(s.snare || 0, 1.7);
      target.hitstun = Math.max(target.hitstun, 0.28 + (extra.stunBonus || 0));
      break;
    case "gust": {
      const dir = sign(target.x - owner.x) || 1;
      target.vx += dir * 90;
      target.vy -= 60;
      break;
    }
    case "heavenly":
      target.invuln = Math.min(target.invuln, 0.02);
      break;
    case "silence":
      s.silence = Math.max(s.silence || 0, 3.0);
      popup(target.x, target.y - 150, "TECHNIQUE SEALED", "#a8aeb8", 18);
      break;
    case "weaponBreak":
      break; // handled at shield contact
    default:
      break;
  }
}

export function updateStatuses(f, dt) {
  const s = f.statuses;
  if (s.burn) {
    s.burn.t -= dt;
    s.burn.tick -= dt;
    if (s.burn.tick <= 0) {
      s.burn.tick = 0.45;
      f.damage += s.burn.dmg;
      burst(f.x, f.y - 80, "#ff7a2f", 6, 0.5);
    }
    if (s.burn.t <= 0) s.burn = null;
  }
  if (s.bleed) {
    s.bleed.t -= dt;
    s.bleed.tick -= dt;
    if (s.bleed.tick <= 0 && Math.abs(f.vx) > 130) {
      s.bleed.tick = 0.5;
      f.damage += s.bleed.dmg;
      burst(f.x, f.y - 70, "#ff4c55", 5, 0.4);
    }
    if (s.bleed.t <= 0) s.bleed = null;
  }
  if (s.poison) {
    s.poison.t -= dt;
    s.poison.tick -= dt;
    if (s.poison.tick <= 0) {
      s.poison.tick = 0.5;
      f.damage += s.poison.dmg;
      burst(f.x, f.y - 80, "#9edb7e", 5, 0.4);
    }
    if (s.poison.t <= 0) s.poison = null;
  }
  if (s.snare > 0) s.snare -= dt;
  if (s.soulMark > 0) s.soulMark -= dt;
  if (s.silence > 0) s.silence -= dt;
  if (s.nailT > 0) {
    s.nailT -= dt;
    if (s.nailT <= 0) s.nailMarks = 0;
  }
}

// ------------------------------------------------------------------- hits

function shieldDamageMult(target) {
  return target.char.passive.id === "limitlessGuard" ? 0.55 : 1;
}

/** The victim's stick as a unit vector, or null when they aren't holding one. */
function diStick(target) {
  const i = target.input;
  if (!i) return null;
  const x = (i.right ? 1 : 0) - (i.left ? 1 : 0);
  const y = (i.down ? 1 : 0) - (i.up ? 1 : 0);
  if (!x && !y) return null;
  const m = Math.hypot(x, y);
  return { x: x / m, y: y / m };
}

/** Launch vector for an attack angle, in screen space (y grows downward). */
function launchVector(angle, dir) {
  return angle < 0
    ? { x: dir * Math.cos(Math.abs(angle)), y: Math.sin(-angle) }
    : { x: dir * Math.cos(Math.abs(angle)), y: -Math.sin(Math.abs(angle)) };
}

function diAngle(target, angle, dir) {
  const s = diStick(target);
  if (!s) return angle;
  const v = launchVector(angle, dir);
  // Cross product: how far off the launch line the stick sits, and which side.
  // Subtracted because a larger `angle` means a steeper *upward* launch, so
  // holding down has to reduce it — hold a direction, go that way.
  const cross = v.x * s.y - v.y * s.x;
  return angle - cross * DI_MAX_TURN * dir;
}

function diSpeedScale(target, angle, dir) {
  const s = diStick(target);
  if (!s) return 1;
  const v = launchVector(angle, dir);
  return 1 + (v.x * s.x + v.y * s.y) * DI_SPEED;   // dot: along = faster
}

// Move staling. Smash keeps a queue of recently-landed moves and weakens
// repeats, which is what stops a match collapsing into whichever single button
// kills best. Dodges already stale here (fighter.js); attacks did not.
/** Stable identity for a move, so the same attack stales across uses. */
function moveId(hit) {
  return hit.label || hit.anim || hit.sfx || "hit";
}

function staleCount(owner, id) {
  return owner.recentMoves ? owner.recentMoves.filter((m) => m === id).length : 0;
}

function pushStale(owner, id) {
  owner.recentMoves = owner.recentMoves || [];
  owner.recentMoves.push(id);
  if (owner.recentMoves.length > STALE_QUEUE) owner.recentMoves.shift();
}

export function applyHit(owner, target, hit, source) {
  if (target.invuln > 0 || target.dead || target.respawnTimer > 0) return "ignored";
  if (owner.dead || owner.respawnTimer > 0) return "ignored";

  const dir = sign(target.x - owner.x) || owner.facing;

  // active counter (Gojo Infinity)
  if (target.counter && target.counter.t > 0) {
    triggerCounter(target, owner);
    return "countered";
  }

  let dmg = hit.dmg;
  let baseKb = hit.baseKb;
  let growth = hit.growth;
  let label = hit.label;

  // Staling is applied before every other multiplier so crits, installs and
  // passives scale the already-weakened value rather than papering over it.
  const mid = moveId(hit);
  const stale = staleCount(owner, mid);
  if (stale) {
    dmg *= Math.max(0.25, 1 - stale * STALE_DMG_STEP);
    baseKb *= Math.max(0.4, 1 - stale * STALE_KB_STEP);
    growth *= Math.max(0.4, 1 - stale * STALE_KB_STEP);
  }

  const unblockable = hit.unblockable || (owner.installs && owner.installs.unblockable);

  // shield
  if (target.shielding && !unblockable) {
    const sinceRaise = state.matchTime - target.shieldRaisedAt;
    if (sinceRaise <= PARRY_WINDOW) {
      // perfect shield
      popup(target.x, target.y - 160, "PARRY!", "#ffffff", 30);
      ring(target.x, target.y - 90, target.char.theme, 90);
      playSfx("guardHit", 1, 1.3);
      owner.hitPause = Math.max(owner.hitPause, 0.34);
      target.hitPause = Math.max(target.hitPause, 0.1);
      target.meter = clamp(target.meter + 6, 0, METER_MAX);
      state.camera.shake = Math.max(state.camera.shake, 5);
      return "parried";
    }
    let shieldDmg = dmg * SHIELD_DAMAGE_MULT * (hit.shieldMul || 1) * shieldDamageMult(target);
    if (hit.effect === "weaponBreak") shieldDmg += 18;
    if (hit.effect === "heavenly") shieldDmg += 14;
    target.shield -= shieldDmg;
    target.shieldStun = 0.1 + dmg * 0.012;
    target.vx += dir * (90 + dmg * 14);
    playSfx("guardHit", 0.85);
    burst(target.x + dir * -30, target.y - 90, "#cfe4ff", 14, 0.8);
    state.camera.shake = Math.max(state.camera.shake, 3);
    if (target.shield <= 0) shieldBreak(target);
    return "blocked";
  }

  // armor: damage but no launch
  const armored = (target.installs && target.installs.armor) || target.armorT > 0;

  // crit band (Nanami)
  const dx = Math.abs(target.x - owner.x);
  let crit = false;
  if (hit.critBand && Math.abs(dx - hit.critBand.center) <= hit.critBand.tolerance) crit = true;
  if (hit.critChance && Math.random() < hit.critChance) crit = true;
  if (crit) {
    dmg *= 1.36; baseKb *= 1.22; growth *= 1.15;
    label = "7:3 " + (label || "");
    popup(target.x, target.y - 175, "7:3!", "#ffd35a", 26);
    playSfx("hitCrit");
  }

  // Black Flash (Yuji): cursed energy lands within a millionth of a second of
  // the fist. Rolled before the other multipliers so installs scale it too.
  if (owner.char.passive.id === "blackFlash" && source === "melee" && Math.random() < 0.12) {
    dmg *= 1.35; baseKb *= 1.15; growth *= 1.1;
    owner.meter = clamp(owner.meter + 10, 0, METER_MAX);
    popup(target.x, target.y - 178, "BLACK FLASH!", "#ff3b30", 26);
    playSfx("blackFlash");
    sparkLine(target.x, target.y - 96, dir, "#ff3b30", 12);
    state.camera.shake = Math.max(state.camera.shake, 8);
    state.slowMo = Math.max(state.slowMo, 0.12);
  }

  // status & passive multipliers
  if (target.statuses.soulMark > 0) { dmg *= 1.18; growth *= 1.1; }
  if (target.char.passive.id === "openSky" && !target.grounded) dmg *= 0.88;
  if (owner.char.passive.id === "kingsContempt" && target.damage >= 80) dmg *= 1.1;
  if (owner.char.passive.id === "rikaBond" && owner.damage >= 100) dmg *= 1.12;
  if (owner.installs && owner.installs.dmgMul) dmg *= owner.installs.dmgMul;
  if (target.installs && target.installs.dmgTakenMul) dmg *= target.installs.dmgTakenMul;
  if (target.char.passive.id === "barkArmor" && target.grounded) dmg *= 0.88;
  if (owner.cpuDamageMul) dmg *= owner.cpuDamageMul;

  dmg = Math.round(dmg * 10) / 10;
  target.damage = Math.min(999, target.damage + dmg);
  pushStale(owner, mid);   // only landed hits stale; whiffs cost nothing

  // meter economy
  let mGain = dmg * METER_ON_DEAL;
  if (owner.char.passive.id === "gamblersFlow") mGain *= 1.3;
  if (owner.char.passive.id === "warCompensation") mGain *= 1.25;
  owner.meter = clamp(owner.meter + mGain, 0, METER_MAX);
  target.meter = clamp(target.meter + dmg * METER_ON_TAKE, 0, METER_MAX);
  if (owner.char.passive.id === "heavenlyVoid") target.meter = clamp(target.meter - 4, 0, METER_MAX);
  if (owner.char.passive.id === "bestFriend" && hit.heavy) owner.meter = clamp(owner.meter + 8, 0, METER_MAX);

  // knockback
  let kb = (baseKb + target.damage * growth) / target.char.stats.weight;
  if (target.char.passive.id === "cursedCorpse") kb *= 0.9;
  if (target.char.passive.id === "openSky" && !target.grounded) kb *= 0.88;
  // Chimera Shadow Garden cushions its owner — the shadow takes the impact.
  kb *= domainKnockbackMul(target);
  const stunBonus = hit.stunBonus || 0;

  // Directional Influence. The victim's stick bends the launch angle and
  // nudges its magnitude, so surviving a hit is something the defender does
  // rather than something that happens to them. Without it every exchange is
  // decided entirely by the attacker and combos are all-or-nothing.
  //
  // Perpendicular DI: only stick input ACROSS the launch vector turns it,
  // which is what makes the classic "DI away to live, DI in to escape" read
  // work. Held toward/away instead trades a little launch speed.
  const angle = diAngle(target, hit.angle ?? 0.35, dir);
  kb *= diSpeedScale(target, hit.angle ?? 0.35, dir);

  if (armored) {
    popup(target.x, target.y - 150, "ARMOR", "#c9b6ff", 20);
    target.vx += dir * 60;
  } else {
    // a hit knocks a hanging fighter off the ledge
    if (target.ledge) {
      target.ledge = null;
      target.ledgeCooldown = 0.5;
    }
    target.vx = dir * Math.cos(Math.abs(angle)) * kb;
    if (angle < 0 && !target.grounded) {
      target.vy = Math.sin(-angle) * kb; // spike: downward
      label = label || "METEOR";
    } else {
      target.vy = -Math.sin(Math.abs(angle)) * kb - 120;
    }
    target.grounded = false;
    // Tumble. Past a threshold the victim rotates through the launch rather
    // than sliding through it rigidly — the single biggest readability win on
    // a hit, since `hurt` is one still frame for every character.
    if (kb > TUMBLE_KB_MIN) {
      const rate = Math.min((kb - TUMBLE_KB_MIN) * TUMBLE_SPIN_PER_KB, TUMBLE_SPIN_MAX);
      target.spin = dir * rate;
    }
    let stun = clamp(0.12 + kb * 0.00048 + stunBonus, 0.12, 1.35);
    if (target.char.passive.id === "oldGuard") stun *= 0.75; // barely flinches
    target.hitstun = stun;
    interruptActions(target);
  }

  target.invuln = 0.06;
  if (hit.effect === "heavenly") target.invuln = 0.02;

  // hitlag / freeze frames
  const lag = clamp(0.028 + dmg * 0.0045, 0.03, 0.15) * (hit.heavy ? 1.25 : 1);
  owner.hitPause = Math.max(owner.hitPause, lag);
  target.hitPause = Math.max(target.hitPause, lag * 1.1);
  target.shakeMag = 3 + Math.min(6, dmg * 0.4);

  // presentation
  const hx = target.x + dir * -14;
  const hy = target.y - 96;
  burst(hx, hy, owner.char.theme, Math.round(14 + dmg * 1.2), 1 + dmg / 24);
  sparkLine(hx, hy, dir, "#ffffff", 8);
  popup(target.x, target.y - 132, `${dmg}%`, "#ffffff", 20 + Math.min(16, dmg));
  if (label) popup(target.x - dir * 26, target.y - 160, label, owner.char.theme, 17);
  state.camera.shake = Math.max(state.camera.shake, clamp(4 + dmg * 0.5, 4, 15));
  if (kb > 880) {
    state.slowMo = Math.max(state.slowMo, 0.1);
    state.camera.kick = 0.14;
  }
  playSfx(hit.sfx === "melee" ? "punch" : hit.sfx || "punch", Math.min(1.05, 0.7 + dmg / 26));

  applyStatus(hit.effect, owner, target, { stunBonus: hit.stunBonus });

  // Rika echoes Yuta's blows during Full Manifestation
  if (owner.installs && owner.installs.echoDamage && source === "melee") {
    const bonus = Math.round(dmg * owner.installs.echoDamage * 10) / 10;
    target.damage = Math.min(999, target.damage + bonus);
    popup(target.x + dir * 30, target.y - 190, `RIKA +${bonus}%`, "#e8ecf8", 18);
    sparkLine(hx, hy - 30, dir, "#e8ecf8", 10);
  }

  // Jogo's Iron Mountain sears anyone who strikes him up close
  if (target.installs && target.installs.contactBurn && source === "melee") {
    applyStatus("burn", target, owner);
    burst(owner.x, owner.y - 80, "#ff7a2f", 10, 0.7);
  }

  return "hit";
}

function interruptActions(target) {
  if (target.action && !target.action.uninterruptible) {
    target.action = null;
  }
  target.charging = null;
  if (target.healing) target.healing = null;
  target.counter = null;
  target.reflect = null;
}

export function shieldBreak(target) {
  target.shield = 0;
  target.shielding = false;
  target.dizzy = SHIELD_BREAK_STUN;
  target.vy = -420;
  target.grounded = false;
  banner("SHIELD BREAK!", "#ff8a8a", { y: 180, size: 44, life: 1.2 });
  playSfx("guardBreak", 0.9);
  burst(target.x, target.y - 90, "#cfe4ff", 40, 1.4);
  state.camera.shake = Math.max(state.camera.shake, 12);
}

export function triggerCounter(target, attacker) {
  const c = target.counter;
  target.counter = null;
  target.invuln = Math.max(target.invuln, 0.5);
  popup(target.x, target.y - 168, c.name || "COUNTER!", target.char.theme, 26);
  ring(target.x, target.y - 90, target.char.theme, 130);
  playSfx("parry", 1);
  state.slowMo = Math.max(state.slowMo, 0.16);
  state.camera.shake = Math.max(state.camera.shake, 10);
  // retaliation only lands at melee range — countering a projectile from
  // across the stage still nullifies it, but doesn't punish the shooter
  if (Math.abs(attacker.x - target.x) < 300) {
    applyHit(target, attacker, {
      dmg: c.dmg, baseKb: c.baseKb, growth: c.growth, angle: c.angle,
      label: c.label, sfx: "blast", unblockable: true,
    }, "counter");
  }
}
