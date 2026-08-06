// Derives concrete attack data (timings + hitboxes) from each character's
// light/heavy profiles. Keeps per-character data compact while giving every
// fighter a full Smash-style kit:
//   light:  jab chain (3 steps), side tilt, up tilt, down tilt (crouch), aerials
//   heavy:  side smash (chargeable), up smash, down smash, air heavy

function round1(v) {
  return Math.round(v * 10) / 10;
}

// The sheet cells physically cap visible reach at ~94 px in front of the
// fighter; the profile `reach` numbers (inherited from v1) assumed ~2.5x
// that. This factor pulls hitboxes back to the visuals plus a small grace
// margin so swings connect where they look like they connect.
const REACH_SCALE = 0.62;

function r(reach) {
  return reach * REACH_SCALE;
}

export function lightMove(char, variant, jabStep = 0) {
  const p = char.light;
  const s = p.speed || 1;
  const base = {
    effect: p.effect || null,
    sfx: p.sfx || "punch",
    anim: "light",
  };

  switch (variant) {
    case "jab": {
      const finisher = jabStep >= 2;
      return {
        ...base,
        delay: 0.05 / s, dur: 0.09,
        recover: finisher ? 0.24 : 0.13,
        ox: 42, oy: -92,
        w: r(p.reach) * (finisher ? 1.0 : 0.82), h: 98,
        dmg: round1(p.dmg * (finisher ? 0.95 : 0.5)),
        baseKb: finisher ? 330 : 90,
        growth: finisher ? 6.0 : 1.0,
        angle: finisher ? p.angle : 0.32,
        label: finisher ? p.label : null,
        lungeVx: 40,
      };
    }
    case "side":
      return {
        ...base,
        delay: 0.07 / s, dur: 0.12, recover: 0.2,
        ox: 50, oy: -90, w: r(p.reach), h: 92,
        dmg: round1(p.dmg), baseKb: 310, growth: 5.8, angle: p.angle,
        label: p.label, lungeVx: 90,
      };
    case "up":
      return {
        ...base,
        anim: "upHeavy",
        delay: 0.06 / s, dur: 0.13, recover: 0.2,
        ox: -r(p.reach) * 0.45, oy: -196, w: r(p.reach) * 0.9, h: 130,
        dmg: round1(p.dmg * 0.9), baseKb: 300, growth: 6.0, angle: 1.15,
        label: "Rising " + p.label,
      };
    case "down":
      return {
        ...base,
        anim: "crouchAttack",
        delay: 0.05 / s, dur: 0.12, recover: 0.18,
        ox: 40, oy: -52, w: r(p.reach) * 0.92, h: 54,
        dmg: round1(p.dmg * 0.85), baseKb: 250, growth: 5.0, angle: 0.14,
        label: "Low " + p.label,
      };
    case "air":
      return {
        ...base,
        anim: "airLight",
        delay: 0.05 / s, dur: 0.16, recover: 0.14,
        ox: 30, oy: -104, w: r(p.reach) * 0.95, h: 104,
        dmg: round1(p.dmg * 0.95), baseKb: 290, growth: 5.9, angle: 0.5,
        label: "Aerial " + p.label,
      };
    case "upAir":
      return {
        ...base,
        anim: "airLight",
        delay: 0.05 / s, dur: 0.15, recover: 0.14,
        ox: -r(p.reach) * 0.45, oy: -210, w: r(p.reach) * 0.9, h: 120,
        dmg: round1(p.dmg * 0.9), baseKb: 280, growth: 6.1, angle: 1.3,
        label: "Air Rising " + p.label,
      };
    case "downAir":
      return {
        ...base,
        anim: "airLight",
        delay: 0.07 / s, dur: 0.15, recover: 0.18,
        ox: -r(p.reach) * 0.4, oy: -8, w: r(p.reach) * 0.8, h: 96,
        dmg: round1(p.dmg * 1.05), baseKb: 240, growth: 6.6, angle: -1.25,
        label: "Meteor " + p.label, spike: true,
      };
    default:
      return lightMove(char, "side");
  }
}

export function heavyMove(char, variant, charge = 0) {
  const p = char.heavy;
  const s = p.speed || 1;
  const chargeMul = 1 + 0.55 * charge;
  const base = {
    effect: p.effect || null,
    sfx: p.sfx || "slashHeavy",
    shieldMul: p.shieldMul || 1.6,
    critBand: p.critBand || null,
    heavy: true,
  };

  switch (variant) {
    case "side":
      return {
        ...base,
        anim: "sideHeavy",
        delay: 0.15 / s, dur: 0.14, recover: 0.3,
        ox: 54, oy: -96, w: r(p.reach), h: 108,
        dmg: round1(p.dmg * chargeMul), baseKb: 430 * (1 + 0.25 * charge), growth: 8.4, angle: p.angle,
        label: p.label, lungeVx: 130,
      };
    case "up":
      return {
        ...base,
        anim: "upHeavy",
        delay: 0.14 / s, dur: 0.16, recover: 0.32,
        ox: -r(p.reach) * 0.5, oy: -226, w: r(p.reach), h: 160,
        dmg: round1(p.dmg * 0.95 * chargeMul), baseKb: 440 * (1 + 0.25 * charge), growth: 8.8, angle: 1.35,
        label: "Skyward " + p.label,
      };
    case "down":
      return {
        ...base,
        anim: "downHeavy",
        delay: 0.17 / s, dur: 0.15, recover: 0.34,
        ox: -r(p.reach) * 0.95, oy: -64, w: r(p.reach) * 1.9, h: 78,
        dmg: round1(p.dmg * 0.9 * chargeMul), baseKb: 400 * (1 + 0.25 * charge), growth: 7.8, angle: 0.9,
        label: "Quake " + p.label, quake: true,
      };
    case "air":
      return {
        ...base,
        anim: "airLight",
        delay: 0.13 / s, dur: 0.16, recover: 0.2,
        ox: 34, oy: -104, w: r(p.reach) * 0.95, h: 110,
        dmg: round1(p.dmg * 0.9), baseKb: 380, growth: 7.6, angle: 0.48,
        label: "Aerial " + p.label,
      };
    default:
      return heavyMove(char, "side", charge);
  }
}
