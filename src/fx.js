// Element effects — the recipes that make a hit look like WHAT hit, rather
// than one theme-coloured burst for everything (docs/effects-plan.md, CP2).
//
// Which element a hit uses resolves in elementOf(): the move's own `fxElement`
// wins, then the character's (characters.js), then "energy" — which is exactly
// the pre-FX look, so a kit with no tags draws what it always drew.
//
// Every count, palette and speed in here reads from src/config_fx.js.

import { emit, burst, dust, sparkLine, ring } from "./particles.js";
import { FX_DENSITY, HIT_RECIPES, ELEMENT_PALETTES, DASH_FX, PROJ_EMIT } from "./config_fx.js";
import { rand, pick } from "./utils.js";

export function elementOf(hit, owner) {
  return hit.fxElement || owner.char.fxElement || "energy";
}

const n = (count, power) => Math.round(count * power * FX_DENSITY);

// ---------------------------------------------------------------- primitives
// Exported for the later checkpoints (projectile emitters, per-character
// one-offs) as well as the hit recipes below.

export function flames(x, y, count, force = 1) {
  for (let i = 0; i < count; i++) {
    emit({
      x: x + rand(-14, 14), y: y + rand(-8, 8),
      vx: rand(-70, 70) * force, vy: -rand(40, 200) * force,
      gravity: -140,                       // buoyant: fire rises
      size: 5 + rand(0, 8), grow: 1.004,
      life: 0.26 + rand(0, 0.3), maxLife: 0.56,
      ramp: ELEMENT_PALETTES.fire,
    });
  }
}

export function embers(x, y, count, force = 1) {
  for (let i = 0; i < count; i++) {
    emit({
      x, y,
      vx: rand(-160, 160) * force, vy: -rand(60, 260) * force,
      gravity: 220,                        // sparks arc and fall
      size: 2 + rand(0, 3),
      life: 0.4 + rand(0, 0.5), maxLife: 0.9,
      ramp: ELEMENT_PALETTES.ember,
    });
  }
}

export function smoke(x, y, count, ramp = ELEMENT_PALETTES.smoke) {
  for (let i = 0; i < count; i++) {
    emit({
      x: x + rand(-12, 12), y: y + rand(-8, 8),
      vx: rand(-30, 30), vy: -rand(20, 80),
      gravity: -60,
      size: 9 + rand(0, 12), grow: 1.015,
      life: 0.45 + rand(0, 0.45), maxLife: 0.9,
      ramp, additive: false,
    });
  }
}

export function droplets(x, y, dirX, count, force = 1) {
  for (let i = 0; i < count; i++) {
    emit({
      x, y: y + rand(-10, 10),
      vx: (dirX * rand(60, 300) + rand(-90, 90)) * force,
      vy: -rand(40, 320) * force,
      gravity: 980,                        // blood is heavy
      size: 3 + rand(0, 4), shape: "streak", streakLen: 0.02,
      life: 0.3 + rand(0, 0.4), maxLife: 0.7,
      ramp: ELEMENT_PALETTES.blood, additive: false,
    });
  }
}

export function glints(x, y, dirX, count, force = 1, ramp = ELEMENT_PALETTES.steel) {
  for (let i = 0; i < count; i++) {
    emit({
      x, y: y + rand(-12, 12),
      vx: dirX * rand(220, 640) * force + rand(-80, 80),
      vy: rand(-200, 200) * force,
      gravity: 150,
      size: 3 + rand(0, 4), shape: "streak",
      life: 0.12 + rand(0, 0.16), maxLife: 0.28,
      ramp,
    });
  }
}

export function flutter(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    emit({
      x: x + rand(-20, 20), y: y + rand(-20, 10),
      vx: rand(-40, 40), vy: rand(10, 50),
      gravity: 30,
      size: 4 + rand(0, 4), grow: 0.998,
      wobbleAmp: rand(30, 70), wobbleFreq: rand(4, 8), wobblePhase: rand(0, 6.28),
      life: 0.8 + rand(0, 0.8), maxLife: 1.6,
      color, additive: false,
    });
  }
}

/** Jagged branching forks from a point — Black Flash, lightning, cracks.
 *  Each fork is fixed where it spawned and dies in a couple of frames. */
export function crackle(x, y, colors, count, reach = 60) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const pts = [];
    let px = 0, py = 0, ang = a;
    const segs = 2 + Math.floor(rand(0, 2.4));
    for (let s = 0; s < segs; s++) {
      ang += rand(-0.7, 0.7);
      const len = (reach / segs) * rand(0.6, 1.3);
      px += Math.cos(ang) * len;
      py += Math.sin(ang) * len;
      pts.push([px, py]);
    }
    emit({
      x, y, forkPts: pts, shape: "fork",
      size: 4 + rand(0, 4),
      life: 0.06 + rand(0, 0.1), maxLife: 0.16,
      color: pick(colors),
    });
  }
}

// ----------------------------------------------------------------- hit sparks

/** What lands where a hit connects. `power` scales with damage; `theme` is the
 *  attacker's colour, used by the default "energy" look. */
export function hitFx(element, x, y, dir, dmg, theme) {
  const power = 1 + dmg / 24;
  const r = HIT_RECIPES[element] || HIT_RECIPES.energy;
  switch (element) {
    case "fire":
      flames(x, y, n(r.flames, power));
      embers(x, y, n(r.embers, power));
      smoke(x, y - 10, n(r.smoke, 1));
      break;
    case "blood":
      droplets(x, y, dir, n(r.droplets, power));
      burst(x, y, "#8f0f20", n(r.mist, power), 0.5 * power);
      break;
    case "steel":
      // No cursed energy — white metal glints, sparks and dust only.
      glints(x, y, dir, n(r.glints, power));
      sparkLine(x, y, dir, "#ffffff", n(r.sparks, power));
      dust(x, y + 40, n(r.dust, 1));
      break;
    case "wind":
      glints(x, y, dir, n(r.streaks, power), 1, ELEMENT_PALETTES.wind);
      dust(x, y + 30, n(r.dust, 1));
      break;
    case "sound":
      for (let i = 0; i < r.rings; i++) ring(x, y, pick(ELEMENT_PALETTES.sound), 46 + i * 34 + dmg * 2);
      glints(x, y, dir, n(r.streaks, power), 0.8, ELEMENT_PALETTES.sound);
      break;
    case "shadow":
      smoke(x, y, n(r.smoke, power), ELEMENT_PALETTES.shadow);
      burst(x, y, "#3a3f68", n(r.burst, power), 0.8 * power);
      break;
    case "soul":
      ring(x, y, "#a99ede", 60 + dmg * 2.4);
      smoke(x, y, n(r.smoke, power), ELEMENT_PALETTES.soul);
      break;
    default:
      // The pre-FX look, exactly: theme burst + white spark line.
      burst(x, y, theme, Math.round(n(r.burst, 1) + dmg * 1.2), power);
      sparkLine(x, y, dir, "#ffffff", n(r.sparks, 1));
  }
}

// ---------------------------------------------------------------- projectiles

/** Particles shed in flight, by the projectile's fxElement tag. Called every
 *  update tick; the per-element rates live in config_fx.js. */
export function projectileEmit(p, dt) {
  const rate = PROJ_EMIT[p.fxElement] || 0;
  if (!rate || Math.random() > rate * dt * FX_DENSITY) return;
  const back = -Math.sign(p.vx) || 1;
  switch (p.fxElement) {
    case "fire":
      flames(p.x, p.y, 1, 0.45);
      if (Math.random() < 0.5) embers(p.x, p.y, 1, 0.5);
      break;
    case "blood": droplets(p.x, p.y, back, 1, 0.5); break;
    case "feather": flutter(p.x, p.y, "#15161c", 1); break;
    case "wind": glints(p.x, p.y, back, 1, 0.55, ELEMENT_PALETTES.wind); break;
    case "sound": ring(p.x, p.y, pick(ELEMENT_PALETTES.sound), 30); break;
    case "shadow": smoke(p.x, p.y, 1, ELEMENT_PALETTES.shadow); break;
    case "soul": smoke(p.x, p.y, 1, ELEMENT_PALETTES.soul); break;
  }
}

/** An exploding projectile's detonation, element-aware. The default is the
 *  pre-FX look exactly: a colour burst and a ring at the blast radius. */
export function explodeFx(p) {
  ring(p.x, p.y, p.color, p.explode * 1.4);
  switch (p.fxElement) {
    case "fire":
      flames(p.x, p.y, n(16, 1), 1.4);
      embers(p.x, p.y, n(12, 1), 1.4);
      smoke(p.x, p.y - 12, n(5, 1));
      break;
    case "blood":
      droplets(p.x, p.y, 1, n(9, 1), 1.2);
      droplets(p.x, p.y, -1, n(9, 1), 1.2);
      burst(p.x, p.y, "#8f0f20", n(10, 1), 1);
      break;
    default:
      burst(p.x, p.y, p.color, n(26, 1), 1.3);
  }
}

// ----------------------------------------------------------------- dashStrike

/** Launch dressing for the twelve dashStrike side-specials: a fan of streaks
 *  in the move's colour (steel-white for the no-cursed-energy trio) and a
 *  boosted afterimage trail for the lunge (read by trailStrength). */
export function dashLaunchFx(f, color) {
  const steel = f.char.fxElement === "steel";
  glints(
    f.x - f.facing * 26, f.y - 80, -f.facing,
    n(DASH_FX.streaks, 1), 1,
    steel ? ELEMENT_PALETTES.steel : [color, "#ffffff"],
  );
  f.fxTrailT = DASH_FX.trailTime;
}

// ------------------------------------------------------------- status ticks

export function burnTickFx(x, y) {
  flames(x, y, n(4, 1), 0.6);
  embers(x, y, n(2, 1), 0.6);
}

export function bleedTickFx(x, y, dir) {
  droplets(x, y, dir, n(4, 1), 0.7);
}
