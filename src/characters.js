// All 23 fighters: stats, sprite-frame mappings, attack profiles, specials,
// ultimates, passives. Design rationale for every kit lives in docs/characters/.
//
// `name` is the short form the roster tiles and in-match HUD use, where space
// is tight; `fullName` is the character's full name, shown on the hero card.
// Both, plus `epithet`, mirror the headings in docs/characters.md — that file
// is the research, this one is the data.
//
// `heightCm` is the character's canon height, or null where none was ever
// published. It drives how large they are drawn: heights.js turns it into a
// head-height target and solves `scale` from that once the manifest is loaded.
// The `scale` literals below are only a pre-load fallback — the live value is
// derived, so editing them by hand does nothing. Change `heightCm`, or override
// the target in the sprite workbench.
//
// Frame keys are sheet cells "r{row}c{col}" resolved via assets/sprites/manifest.json.
// Sheet rows: 0 idle/poses, 1 run, 2 air, 3 technique effects, 4 crouch.
// The 17 launch fighters come from those sheets. The six round-7 fighters
// (Choso, Mei Mei, Uro, Yuji, Reggie, Gakuganji) have no sheet at all — their
// frames are semantic pose keys instead; see SEMANTIC_ANIMS below.

import { CHARACTER_GROUPS } from "./config_menus.js";

// The roster itself is defined further down; CHARACTER_KEYS is derived from the
// config groups once the kits exist (see the bottom of this file).

// Fighters whose kits are wired but whose art has not been delivered, so they
// must not reach character select or randomCharacterKey(). Empty right now:
// the whole roster has shipped. To stage a new fighter, add its kit to
// CHARACTERS and list its key here; to ship it, register its sprites in the
// manifest, drop its card in assets/cards/, then move the key out of here and
// into a CHARACTER_GROUPS bucket in src/config.js. Nothing else is needed —
// all six round-7 fighters shipped exactly that way.
export const STAGED_CHARACTER_KEYS = [];

// Sentinel selection meaning "draw a fresh fighter at the start of every match"
// rather than naming one. Never a key in CHARACTERS — resolve it through
// randomCharacterKey() before building a fighter.
export const RANDOM_KEY = "__random";

export function randomCharacterKey() {
  return CHARACTER_KEYS[Math.floor(Math.random() * CHARACTER_KEYS.length)];
}

// The four-frame run cycle (round 12): reach (full stride, one leg planted
// under the hips, the other reaching) and pass (legs crossing beneath the
// body) for each leg lead. A two-frame run can never show a stride — both
// frames read as the same half of it — and the art cannot be mirrored to fake
// the other half because every costume is asymmetric. 13 fps puts the full
// cycle at ~0.31 s, a sprint cadence of ~3 strides a second; the old pair
// plays via `fallback` at its original 10 fps until a fighter's cycle lands.
export const RUN_CYCLE_FRAMES = ["run_reach_a", "run_pass_a", "run_reach_b", "run_pass_b"];
const RUN_ANIM = { frames: RUN_CYCLE_FRAMES, fallback: ["run_a", "run_b"], fps: 13, fallbackFps: 10, loop: true };

// Anim defaults; characters override entries whose sheet cells differ.
export const DEFAULT_ANIMS = {
  idle: { frames: ["idle_a", "idle_b"], fps: 2.2, loop: true },
  run: RUN_ANIM,
  dash: { frames: ["r1c2"], fps: 1, loop: true },
  jump: { frames: ["jump_rise"], fps: 1, loop: true },
  fall: { frames: ["fall"], fps: 1, loop: true },
  land: { frames: ["r4c0"], fps: 1, loop: false },
  hurt: { frames: ["hurt"], fps: 1, loop: true },
  crouch: { frames: ["r4c0", "r4c1"], fps: 3, loop: true },
  crouchAttack: { frames: ["r4c2", "r4c3"], fps: 11, loop: false },
  shield: { frames: ["guard"], fps: 1, loop: true },
  ledge: { frames: ["ledge_hang"], fps: 1, loop: true },
  dodge: { frames: ["r1c2"], fps: 1, loop: true },
  // Round-6 art. Roll and air dodge used to borrow the sprint frame, so a
  // fighter mid-evade looked like they were running on the spot. Characters
  // without the new art fall back to `dodge` (see `animFor`).
  dodge_roll: { frames: ["dodge_roll"], fps: 1, loop: true },
  dodge_air: { frames: ["dodge_air"], fps: 1, loop: true },
  light: { frames: ["r3c0", "r3c1"], fps: 12, loop: false },
  // Wind-up then strike (see SEMANTIC_ANIMS below for the timing note). The
  // `fallback` is what a fighter without the round-9 pair keeps drawing.
  airLight: { frames: ["attack_air_a", "attack_air_b"], fallback: ["attack_air"], fps: 8, loop: false },
  sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c0"], fps: 6, loop: false },
  upHeavy: { frames: ["attack_up"], fps: 6, loop: false },
  downHeavy: { frames: ["r2c2"], fps: 6, loop: false },
  charge: { frames: ["charge"], fps: 2, loop: true },
  specialNeutral: { frames: ["r3c1"], fps: 8, loop: false },
  specialSide: { frames: ["r3c0"], fps: 8, loop: false },
  specialDown: { frames: ["r3c2"], fps: 8, loop: false },
  ult: { frames: ["r3c2", "r3c3"], fps: 7, loop: true },
  dizzy: { frames: ["dizzy"], fps: 1, loop: true },
  // Knocked flat (round-12 art request). Until the pose is delivered the
  // renderer simulates it: `hurt` swept 90 degrees onto the back (fighter.js).
  prone: { frames: ["prone"], fallback: ["hurt"], fps: 1, loop: true },
  win: { frames: ["victory"], fps: 1, loop: true },
};

// Staged characters have no legacy sheet, so every animation state maps to a
// semantic pose key (round-5 naming) rather than an r{row}c{col} cell. This is
// the complete pose list the round-7 asset request asks for — when the art
// lands at assets/sprites/<char>/<pose_key>.png and is registered in the
// manifest, these animations resolve with no further code changes.
export const SEMANTIC_ANIMS = {
  idle: { frames: ["idle_a", "idle_b"], fps: 2.2, loop: true },
  run: RUN_ANIM,
  dash: { frames: ["dash"], fps: 1, loop: true },
  jump: { frames: ["jump_rise"], fps: 1, loop: true },
  fall: { frames: ["fall"], fps: 1, loop: true },
  land: { frames: ["land"], fps: 1, loop: false },
  hurt: { frames: ["hurt"], fps: 1, loop: true },
  crouch: { frames: ["crouch_a", "crouch_b"], fps: 3, loop: true },
  crouchAttack: { frames: ["crouch_attack_a", "crouch_attack_b"], fps: 11, loop: false },
  shield: { frames: ["guard"], fps: 1, loop: true },
  ledge: { frames: ["ledge_hang"], fps: 1, loop: true },
  dodge: { frames: ["dodge_roll"], fps: 1, loop: true },
  dodge_roll: { frames: ["dodge_roll"], fps: 1, loop: true },
  dodge_air: { frames: ["dodge_air"], fps: 1, loop: true },
  light: { frames: ["attack_light_a", "attack_light_b"], fps: 12, loop: false },
  // Wind-up then strike, the same shape the light attack has always had. The
  // `_a`/`_b` art is a round-9 delivery; until it lands for a character, the
  // single delivered frame is all that survives the missing-frame filter in
  // resolvedAnim(), so these read exactly as they did before.
  //
  // The fps is chosen so the frames change when the HITBOX does: a heavy's
  // startup is 0.15/speed s and 6 fps holds frame one for 0.167 s, an aerial's
  // is 0.13/speed and 8 fps holds for 0.125 s. Close enough that the strike
  // frame appears as the move goes live rather than at some arbitrary moment.
  // `fallback` is what a character without the new art keeps drawing: the
  // single delivered pose, exactly as before. It is a fallback rather than a
  // third frame, so a fighter who HAS the pair never plays the old drawing.
  airLight: { frames: ["attack_air_a", "attack_air_b"], fallback: ["attack_air"], fps: 8, loop: false },
  sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["attack_heavy"], fps: 6, loop: false },
  upHeavy: { frames: ["attack_up"], fps: 6, loop: false },
  downHeavy: { frames: ["attack_down"], fps: 6, loop: false },
  charge: { frames: ["charge"], fps: 2, loop: true },
  specialNeutral: { frames: ["special_neutral"], fps: 8, loop: false },
  specialSide: { frames: ["special_side"], fps: 8, loop: false },
  specialDown: { frames: ["special_down"], fps: 8, loop: false },
  ult: { frames: ["ult_a", "ult_b"], fps: 7, loop: true },
  dizzy: { frames: ["dizzy"], fps: 1, loop: true },
  // Knocked flat (round-12 art request). Until the pose is delivered the
  // renderer simulates it: `hurt` swept 90 degrees onto the back (fighter.js).
  prone: { frames: ["prone"], fallback: ["hurt"], fps: 1, loop: true },
  win: { frames: ["victory"], fps: 1, loop: true },
};

export const CHARACTERS = {
  // ------------------------------------------------------------------ GOJO
  gojo: {
    name: "Gojo",
    fullName: "Satoru Gojo",
    epithet: "The Honored One",
    heightCm: 190,     // official
    theme: "#62dcff",
    shadow: "rgba(88, 220, 255, 0.36)",
    scale: 0.60,
    stats: { speed: 468, airSpeed: 380, accel: 3000, jump: 800, airJumps: 1, weight: 0.92, friction: 0.86 },
    // Inherits the semantic table; these keep this fighter's own timing.
    anims: { ...SEMANTIC_ANIMS,
      specialDown: { frames: ["special_down"], fps: 4, loop: true },
    },
    light: { dmg: 7.5, reach: 168, speed: 1.1, angle: 0.32, effect: null, label: "Limitless Jab", sfx: "punch" },
    heavy: { dmg: 15, reach: 186, speed: 1.05, angle: 0.46, effect: null, label: "Lapse Palm", sfx: "punch", shieldMul: 1.5 },
    specials: {
      neutral: {
        name: "Cursed Technique Lapse: Blue", type: "projectile", cooldown: 1.0,
        desc: "A core of attraction that drags the enemy toward it, then pops.",
        p: { speed: 470, vy: 0, r: 40, dur: 1.05, dmg: 9, base: 260, growth: 5.4, angle: 0.6, color: "#3f8dff", pull: 320, label: "Blue", sprite: "effect:blue", spriteH: 126 },
      },
      side: {
        name: "Cursed Technique Reversal: Red", type: "projectile", cooldown: 1.15,
        desc: "A repulsive blast with brutal knockback. Destroys other projectiles.",
        p: { speed: 660, vy: -8, r: 44, dur: 0.9, dmg: 14, base: 500, growth: 8.6, angle: 0.3, color: "#ff4d5d", pierce: true, clearsProjectiles: true, label: "Red", sprite: "effect:red", spriteH: 138 },
      },
      down: {
        name: "Infinity", type: "counter", cooldown: 2.6,
        desc: "Stop. The next attack halts at infinity — nullified, and answered.",
        p: { window: 0.55, dmg: 12, base: 430, growth: 7.4, angle: 0.5, color: "#a8e6ff", label: "Infinity" },
      },
    },
    ultimate: {
      name: "Hollow Technique: Purple", type: "beam",
      desc: "Blue and Red fused — a hollow mass of imaginary matter erased across the whole stage.",
      p: { dmg: 34, base: 900, growth: 11, color: "#b56cff", width: 190, duration: 1.5, sprite: "effect:purple", spriteH: 230 },
    },
    // ---- Domain Expansion -------------------------------------------------
    domains: [{
      name: "Unlimited Void",
      type: "unlimitedVoid",
      desc: "Infinite information floods the mind. They receive everything and can act on none of it.",
      howTo: "The enemy is frozen by information overload for the whole domain. Every hit you land banks a purple orb; when the domain closes, every banked orb detonates on them at once. Hit them as many times as you can.",
      p: { duration: 5.5, color: "#b56cff", bg: "domain:unlimited_void", orbDmg: 4.5, orbBase: 90, maxOrbs: 12 },
    }],
    passive: { id: "limitlessGuard", name: "Infinity (Passive)", desc: "Neutral stance is wrapped in Infinity: shield loses 45% less health when struck." },
    ai: { style: "balanced", range: 340 },
  },

  // ------------------------------------------------------------------ YUTA
  yuta: {
    name: "Yuta",
    fullName: "Yuta Okkotsu",
    epithet: "Rika's Beloved",
    heightCm: 175.3,   // cited
    theme: "#9fc7ff",
    shadow: "rgba(159, 199, 255, 0.36)",
    scale: 0.60,
    stats: { speed: 402, airSpeed: 318, accel: 2540, jump: 760, airJumps: 1, weight: 1.02, friction: 0.83 },
    // Inherits the semantic table; these keep this fighter's own timing.
    anims: { ...SEMANTIC_ANIMS,
      specialDown: { frames: ["special_down"], fps: 4, loop: true },
    },
    light: { dmg: 8.5, reach: 178, speed: 1.0, angle: 0.3, effect: null, label: "Katana Combo", sfx: "slash" },
    heavy: { dmg: 16, reach: 196, speed: 1.0, angle: 0.44, effect: null, label: "Cursed Cleave", sfx: "slashHeavy", shieldMul: 1.6 },
    specials: {
      neutral: {
        name: "Cursed Energy Slash", type: "projectile", cooldown: 1.0,
        desc: "A flying arc of raw cursed energy launched off the katana's edge.",
        p: { speed: 560, vy: -4, r: 34, dur: 0.9, dmg: 12, base: 380, growth: 7.4, angle: 0.36, color: "#9fc7ff", label: "Sword Beam", sprite: "effect:sword_beam", spriteH: 92 },
      },
      side: {
        name: "Rika's Claw", type: "burst", cooldown: 1.4,
        desc: "Rika reaches through from behind Yuta and rakes everything ahead of him.",
        p: { delay: 0.16, dur: 0.2, ox: 78, oy: -104, w: 250, h: 150, dmg: 15, base: 470, growth: 7.8, angle: 0.5, label: "Rika", color: "#e8ecf8", sfx: "slashHeavy", sprite: "summon:rika" },
      },
      down: {
        name: "Reverse Cursed Technique", type: "heal", cooldown: 5.5,
        desc: "Channel refined cursed energy to knit wounds — interrupted if struck.",
        p: { duration: 1.4, healPerSec: 9, color: "#a5ffd8" },
      },
    },
    ultimate: {
      name: "Full Manifestation: Rika", type: "install",
      desc: "The Queen of Curses answers in full. Rika mirrors every blow with her own.",
      p: { duration: 9, echoDamage: 0.55, dmgMul: 1.1, armor: false, color: "#e8ecf8", label: "RIKA", sprite: "summon:rika" },
    },
    // ---- Domain Expansion -------------------------------------------------
    domains: [{
      name: "Authentic Mutual Love",
      type: "mutualLove",
      desc: "The vow between them made real — Rika stands with him inside it, whole.",
      howTo: "Rika manifests completely and heals you continuously. Press SPECIAL to send her at the enemy for a huge unblockable bite; she can be commanded again after a short beat.",
      p: { duration: 7, color: "#e8ecf8", bg: "domain:mutual_love", healPerSec: 4, biteDmg: 17, biteBase: 620, biteGrowth: 8.4, biteCd: 1.1 },
    }],
    passive: { id: "rikaBond", name: "Bond of Love", desc: "Past 100% damage, Rika's fury raises Yuta's damage by 12%." },
    ai: { style: "balanced", range: 300 },
  },

  // ---------------------------------------------------------------- HAKARI
  hakari: {
    name: "Hakari",
    fullName: "Kinji Hakari",
    epithet: "The Gambler",
    heightCm: 185,     // estimated
    theme: "#ff62cf",
    shadow: "rgba(255, 98, 207, 0.38)",
    scale: 0.60,
    stats: { speed: 415, airSpeed: 305, accel: 2560, jump: 745, airJumps: 1, weight: 1.08, friction: 0.82 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c0"], fps: 8, loop: false },
      specialSide: { frames: ["r1c3", "r3c0"], fps: 10, loop: false },
      specialDown: { frames: ["special_down"], fps: 4, loop: false },
      ult: { frames: ["r3c2", "r3c3"], fps: 7, loop: true },
    },
    light: { dmg: 8.5, reach: 172, speed: 1.05, angle: 0.28, effect: null, label: "Fever Jab", sfx: "punch" },
    heavy: { dmg: 16, reach: 184, speed: 1.0, angle: 0.44, effect: null, label: "Shutter Knuckle", sfx: "punch", shieldMul: 1.7 },
    specials: {
      neutral: {
        name: "Rough Energy Shutter", type: "projectile", cooldown: 1.25,
        desc: "Slams a cursed-energy shutter door forward that bulldozes the lane.",
        p: { speed: 380, vy: 0, r: 52, dur: 0.85, dmg: 12, base: 420, growth: 7.0, angle: 0.34, color: "#ff62cf", pierce: true, label: "Shutter", sprite: "effect:shutter", spriteH: 150 },
      },
      side: {
        name: "Restless Rush", type: "dashStrike", cooldown: 1.35,
        desc: "A reckless advancing flurry — Hakari's favorite way to say hello.",
        p: { vel: 520, iframes: 0.1, delay: 0.05, dur: 0.3, ox: 60, oy: -96, w: 168, h: 110, dmg: 8, base: 380, growth: 6.4, angle: 0.32, hits: 3, label: "Rush", sfx: "punch" },
      },
      down: {
        name: "Reserve Balance", type: "gamble", cooldown: 3.2,
        desc: "Spin the pachinko reels: heal, meter, a power surge... or a dud. Feeling lucky?",
        p: { color: "#ffd35a" },
      },
    },
    ultimate: {
      name: "JACKPOT", type: "install",
      desc: "He skips the reels and simply collects: 4:11 of infinite cursed energy. Wounds erase themselves and nothing staggers him.",
      p: { duration: 8, healPerSec: 3.2, armor: true, dmgMul: 1.15, speedMul: 1.1, color: "#ff62cf", label: "JACKPOT", aura: "effect:aura_pink", domainSprite: "effect:domain_gamble" },
    },
    // ---- Domain Expansion -------------------------------------------------
    domains: [{
      name: "Idle Death Gamble",
      type: "idleDeathGamble",
      desc: "A pachinko parlour with the door shut. The reels decide, and the house is him.",
      howTo: "Three reels spin above you. Press SPECIAL to stop one — stop all three on matching symbols for the JACKPOT: full heal, hyper-armour and huge damage for the rest of the round. Mismatches still pay out something small.",
      p: { duration: 8, color: "#ff62cf", bg: "domain:idle_death_gamble", reels: 3, symbols: 4, jackpotDur: 9 },
    }],
    passive: { id: "gamblersFlow", name: "Gambler's Flow", desc: "Lives for the rush — gains ultimate meter 30% faster than anyone." },
    ai: { style: "rush", range: 190 },
  },

  // ------------------------------------------------------------------ MAKI
  maki: {
    name: "Maki",
    fullName: "Maki Zen'in",
    epithet: "Heavenly Restricted",
    heightCm: 170,     // official
    theme: "#69d0a8",
    shadow: "rgba(105, 208, 168, 0.34)",
    scale: 0.60,
    stats: { speed: 452, airSpeed: 340, accel: 2860, jump: 775, airJumps: 1, weight: 1.0, friction: 0.86 },
    anims: {
      light: { frames: ["r0c2", "r1c2"], fps: 12, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["special_neutral"], fps: 8, loop: false },
      specialSide: { frames: ["r3c0", "r3c1"], fps: 10, loop: false },
      specialDown: { frames: ["r3c3"], fps: 4, loop: true },
      ult: { frames: ["r3c2", "r3c1"], fps: 7, loop: true },
    },
    light: { dmg: 8.5, reach: 196, speed: 1.1, angle: 0.26, effect: "weaponBreak", label: "Naginata Combo", sfx: "slash" },
    heavy: { dmg: 15.5, reach: 210, speed: 1.05, angle: 0.42, effect: "weaponBreak", label: "Dragon-Bone Arc", sfx: "slashHeavy", shieldMul: 2.2 },
    specials: {
      neutral: {
        name: "Cursed Tool Toss", type: "projectile", cooldown: 0.95,
        desc: "Hurls a spinning cursed tool from her endless arsenal.",
        p: { speed: 620, vy: -6, r: 24, dur: 0.7, dmg: 10, base: 330, growth: 6.4, angle: 0.32, color: "#69d0a8", effect: "weaponBreak", label: "Cursed Tool", sprite: "effect:cursed_tool", spriteH: 80 },
      },
      side: {
        name: "Playful Cloud", type: "dashStrike", cooldown: 1.3,
        desc: "The sealed staff answers pure muscle — a shield-shattering three-section rush.",
        p: { vel: 560, iframes: 0.12, delay: 0.06, dur: 0.26, ox: 78, oy: -94, w: 230, h: 100, dmg: 15, base: 460, growth: 7.2, angle: 0.26, effect: "weaponBreak", shieldMul: 3.0, label: "Playful Cloud", sfx: "slashHeavy" },
      },
      down: {
        name: "Split Soul Stance", type: "install", cooldown: 6.5,
        desc: "Draws the katana that cuts the soul itself — for a moment, guards mean nothing.",
        p: { duration: 3.2, unblockable: true, color: "#b8ffe2", label: "SOUL CUT" },
      },
    },
    ultimate: {
      name: "Heavenly Restriction: Awakening", type: "install",
      desc: "Everything cursed stripped away, everything physical unleashed — the night the Zen'in clan ended.",
      p: { duration: 8, speedMul: 1.35, dmgMul: 1.3, armor: false, color: "#69d0a8", label: "AWAKENED" },
    },
    passive: { id: "heavenlyBody", name: "Heavenly Restriction", desc: "A body beyond curses: immune to burns, snares, and soul marks." },
    ai: { style: "rush", range: 200 },
  },

  // ---------------------------------------------------------------- MEGUMI
  megumi: {
    name: "Megumi",
    fullName: "Megumi Fushiguro",
    epithet: "Ten Shadows",
    heightCm: 175,     // official
    theme: "#7c8cff",
    shadow: "rgba(124, 140, 255, 0.36)",
    scale: 0.60,
    stats: { speed: 418, airSpeed: 330, accel: 2620, jump: 765, airJumps: 1, weight: 0.96, friction: 0.84 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["special_neutral"], fps: 8, loop: false },
      specialSide: { frames: ["r3c0", "r3c1"], fps: 9, loop: false },
      specialDown: { frames: ["r1c2"], fps: 8, loop: false },
      ult: { frames: ["r3c3", "r2c3"], fps: 7, loop: true },
    },
    light: { dmg: 8, reach: 172, speed: 1.05, angle: 0.3, effect: null, label: "Shadow Combo", sfx: "punch" },
    heavy: { dmg: 15, reach: 188, speed: 1.0, angle: 0.44, effect: "snare", label: "Divine Dog Fang", sfx: "slashHeavy", shieldMul: 1.6 },
    specials: {
      neutral: {
        name: "Great Serpent... no — Nue!", type: "projectile", cooldown: 1.15,
        desc: "The shadow bird dives across the arena, crackling with paralytic charge.",
        // Nue is a creature, not a bullet: the right stick aims the launch and
        // flies it. Steering suspends the arc, so a hand-flown Nue holds its
        // line instead of dropping.
        p: { speed: 520, vy: -120, gravity: 260, r: 38, dur: 1.0, dmg: 11, base: 360, growth: 7.0, angle: 0.5, color: "#7c8cff", effect: "snare", label: "Nue", sprite: "summon:nue", spriteH: 132, steerable: true, steerRate: 6.0 },
      },
      side: {
        name: "Divine Dogs", type: "summon", cooldown: 7.5,
        desc: "Both wolves step out of his shadow and hunt at his side, tearing at whoever they corner.",
        p: {
          id: "divineDogs", behavior: "chaser", duration: 6, speed: 470, maxActive: 2,
          // Both dogs' art is drawn facing RIGHT, against the renderer's
          // face-left default. Set here on `p` rather than per-unit so the
          // white and black dog cannot drift apart.
          faceRight: true,
          color: "#3a3f68", h: 118, hitW: 90, hitH: 96, standOff: 24,
          attack: { dmg: 6.5, base: 240, growth: 4.6, angle: 0.34, cd: 0.9, effect: "snare", sfx: "slash" },
          units: [
            { sprites: ["summon:divineDogWhite"], backOff: 40 },
            { sprites: ["summon:divineDogBlack"], backOff: 90, firstAttackDelay: 0.9 },
          ],
        },
      },
      down: {
        name: "Shadow Sink", type: "shadowPort", cooldown: 2.4,
        desc: "Melts into his own shadow and resurfaces where the fight needs him.",
        p: { dist: 300, iframes: 0.4, color: "#20244a" },
      },
    },
    ultimate: {
      name: "Eight-Handled Sword Divergent Sila Divine General Mahoraga", type: "summon",
      desc: "The complete ritual. The wheel turns, and the general that adapts to everything walks the stage.",
      p: { duration: 8, dmg: 11, base: 440, growth: 7.2, speed: 250, color: "#e8ecf8", selfDamageMul: 0.75, label: "MAHORAGA" },
    },
    // ---- Domain Expansion -------------------------------------------------
    domains: [{
      name: "Chimera Shadow Garden",
      type: "shadowGarden",
      desc: "The floor becomes an ocean of shadow, and everything in it answers to him.",
      howTo: "The stage floods with shadow. Press SPECIAL to sink and instantly resurface behind the enemy — unlimited, no cooldown — and every resurface looses a shikigami strike. Shadow also cushions you: knockback taken is halved inside.",
      p: { duration: 7, color: "#7c8cff", bg: "domain:shadow_garden", portDmg: 9, portBase: 330, portGrowth: 6.4, kbTakenMul: 0.5 },
    }],
    passive: { id: "tenShadows", name: "Ten Shadows Technique", desc: "Shikigami do the fighting: summon specials build 20% extra ultimate meter." },
    ai: { style: "zoner", range: 380 },
  },

  // ---------------------------------------------------------------- NOBARA
  nobara: {
    name: "Nobara",
    fullName: "Nobara Kugisaki",
    epithet: "Straw Doll Sorceress",
    heightCm: 160,     // official
    theme: "#d86a4a",
    shadow: "rgba(216, 106, 74, 0.36)",
    scale: 0.60,
    stats: { speed: 400, airSpeed: 308, accel: 2480, jump: 750, airJumps: 1, weight: 0.98, friction: 0.83 },
    // Inherits the semantic table; these keep this fighter's own timing.
    anims: { ...SEMANTIC_ANIMS,
      specialDown: { frames: ["special_down"], fps: 6, loop: false },
    },
    light: { dmg: 8, reach: 170, speed: 1.0, angle: 0.3, effect: "nailMark", label: "Hammer & Nail", sfx: "punch" },
    heavy: { dmg: 15, reach: 186, speed: 1.0, angle: 0.46, effect: "nailMark", label: "Hammer Smash", sfx: "slashHeavy", shieldMul: 1.6 },
    specials: {
      neutral: {
        name: "Straw Doll: Nail Shot", type: "projectile", cooldown: 0.8,
        desc: "Cursed nails fired downrange. Every hit hammers a mark deeper into the target.",
        p: { speed: 700, vy: -2, r: 18, dur: 0.75, dmg: 8, base: 250, growth: 5.6, angle: 0.3, color: "#d86a4a", effect: "nailMark", count: 2, spread: 90, label: "Nail Shot", sprite: "effect:nail", spriteH: 58 },
      },
      side: {
        name: "Hairpin", type: "detonate", cooldown: 1.6,
        desc: "Snaps her fingers — every planted nail erupts at once. More marks, more pain.",
        p: { dmgPerMark: 6, base: 320, growthPerMark: 2.2, angle: 0.6, color: "#ff9a6a", label: "Hairpin" },
      },
      down: {
        name: "Resonance", type: "resonance", cooldown: 2.8,
        desc: "Drives a nail into the straw doll — marked souls take the hit wherever they stand. Ignores shields.",
        p: { dmgPerMark: 4.5, hitstun: 0.5, color: "#b56cff", label: "Resonance" },
      },
    },
    ultimate: {
      name: "Straw Doll: Deluxe Resonance", type: "nailstorm",
      desc: "A storm of cursed nails and a full-power resonance ritual. Nowhere to hide from the doll.",
      p: { volleys: 7, dmg: 8, base: 340, growth: 6.6, finisherDmg: 18, finisherBase: 720, color: "#d86a4a", label: "DELUXE RESONANCE", sprite: "effect:nail_storm", spriteH: 290 },
    },
    passive: { id: "strawDoll", name: "Straw Doll Technique", desc: "Nail marks last twice as long, and she can bank up to 6 on one target." },
    ai: { style: "zoner", range: 420 },
  },

  // --------------------------------------------------------------- INUMAKI
  inumaki: {
    name: "Inumaki",
    fullName: "Toge Inumaki",
    epithet: "Cursed Speech User",
    heightCm: 164,     // official
    theme: "#d7d9e7",
    shadow: "rgba(215, 217, 231, 0.32)",
    scale: 0.60,
    stats: { speed: 408, airSpeed: 312, accel: 2500, jump: 755, airJumps: 1, weight: 0.98, friction: 0.83 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c0"], fps: 8, loop: false },
      specialSide: { frames: ["r0c3"], fps: 8, loop: false },
      specialDown: { frames: ["r3c1"], fps: 8, loop: false },
      ult: { frames: ["r3c2", "r3c0"], fps: 7, loop: true },
    },
    light: { dmg: 7.5, reach: 162, speed: 1.05, angle: 0.34, effect: null, label: "Salmon Strike", sfx: "punch" },
    heavy: { dmg: 14.5, reach: 180, speed: 1.0, angle: 0.46, effect: null, label: "Bonito Break", sfx: "punch", shieldMul: 1.5 },
    specials: {
      neutral: {
        name: "“Blast Away”", type: "shout", cooldown: 1.1, strain: 1,
        desc: "A cursed command that hurls the listener backward like a cannonball.",
        p: { ox: 40, oy: -120, w: 300, h: 170, dmg: 10, base: 520, growth: 8.0, angle: 0.42, color: "#d7d9e7", label: "BLAST AWAY" },
      },
      side: {
        name: "“Don't Move”", type: "projectile", cooldown: 1.5, strain: 1,
        desc: "The word lands and the body obeys — the target locks in place.",
        p: { speed: 560, vy: -4, r: 36, dur: 0.85, dmg: 6, base: 120, growth: 2.0, angle: 0.3, color: "#b8bdf0", effect: "cursedSpeech", stunBonus: 0.9, label: "DON'T MOVE", sprite: "effect:speech_word", spriteH: 92 },
      },
      down: {
        name: "“Get Crushed”", type: "crush", cooldown: 2.2, strain: 2,
        desc: "Gravity itself obeys the command — the enemy is slammed into the earth.",
        p: { range: 420, dmg: 12, base: 300, growth: 5.4, color: "#8f95c9", label: "GET CRUSHED" },
      },
    },
    ultimate: {
      name: "“GET TWISTED AND BLAST AWAY”", type: "shout",
      desc: "A full-throated scream of layered commands that buckles the whole arena. His throat pays for it after.",
      p: { ox: -320, oy: -220, w: 940, h: 320, dmg: 30, base: 980, growth: 10, angle: 0.5, color: "#d7d9e7", ultShout: true, label: "COUGH DROP", sprite: "effect:scream_wave", spriteH: 330 },
    },
    passive: { id: "throatStrain", name: "Throat Strain", desc: "Commands strain his throat. Too many too fast and he coughs blood — specials sealed for a moment." },
    ai: { style: "zoner", range: 380 },
  },

  // ----------------------------------------------------------------- PANDA
  panda: {
    name: "Panda",
    fullName: "Panda",
    epithet: "Not Just Any Panda",
    heightCm: 200,     // official
    theme: "#8ea0b8",
    shadow: "rgba(142, 160, 184, 0.36)",
    scale: 0.57,
    stats: { speed: 356, airSpeed: 275, accel: 2220, jump: 730, airJumps: 1, weight: 1.28, friction: 0.78 },
    anims: {
      light: { frames: ["r2c0", "r1c3"], fps: 11, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c1"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c0"], fps: 8, loop: false },
      specialSide: { frames: ["r1c3"], fps: 8, loop: false },
      specialDown: { frames: ["r3c2"], fps: 6, loop: false },
      ult: { frames: ["r3c2", "r3c3"], fps: 7, loop: true },
    },
    light: { dmg: 9.5, reach: 178, speed: 0.92, angle: 0.3, effect: null, label: "Panda Paw", sfx: "punch" },
    heavy: { dmg: 18, reach: 196, speed: 0.88, angle: 0.44, effect: null, label: "Cursed Corpse Slam", sfx: "punch", shieldMul: 1.8 },
    specials: {
      neutral: {
        name: "Unblockable Drumming Beat", type: "burst", cooldown: 1.5,
        desc: "A resonant palm that drums straight through any guard.",
        p: { delay: 0.18, dur: 0.16, ox: 56, oy: -100, w: 180, h: 120, dmg: 13, base: 430, growth: 7.0, angle: 0.4, unblockable: true, label: "Drumming Beat", color: "#c9b6ff", sfx: "punch", sprite: "effect:drum_burst", spriteH: 170 },
      },
      side: {
        name: "Cursed Corpse Charge", type: "dashStrike", cooldown: 1.45,
        desc: "Half a ton of mutated cursed corpse at full sprint, with armor to match.",
        p: { vel: 500, armor: true, delay: 0.08, dur: 0.3, ox: 52, oy: -104, w: 190, h: 120, dmg: 15, base: 470, growth: 7.2, angle: 0.36, label: "Charge", sfx: "punch" },
      },
      down: {
        name: "Gorilla Mode", type: "modeToggle", cooldown: 1.2,
        desc: "Switches to his brother's core: slower, but every hit lands like a drum of thunder.",
        p: { duration: 6, dmgMul: 1.3, speedMul: 0.88, armor: true, color: "#c9b6ff", label: "GORILLA MODE" },
      },
    },
    ultimate: {
      name: "Sister Core: Triceratops", type: "rampage",
      desc: "The bashful third sibling wakes up furious — an unstoppable horned stampede, wall to wall.",
      p: { passes: 3, speed: 900, dmg: 17, base: 560, growth: 8.4, color: "#8ea0b8", label: "TRICERATOPS", sprite: "effect:triceratops" },
    },
    passive: { id: "cursedCorpse", name: "Abrupt Mutated Body", desc: "Cotton stuffing and cursed cores: takes 10% less knockback from every hit." },
    ai: { style: "heavy", range: 210 },
  },

  // ------------------------------------------------------------------ TODO
  todo: {
    name: "Todo",
    fullName: "Aoi Todo",
    epithet: "My Brother",
    heightCm: 190,     // official
    theme: "#b66cff",
    shadow: "rgba(182, 108, 255, 0.38)",
    scale: 0.59,
    stats: { speed: 392, airSpeed: 295, accel: 2400, jump: 750, airJumps: 1, weight: 1.18, friction: 0.8 },
    anims: {
      light: { frames: ["r0c2", "r2c0"], fps: 12, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c1", "r2c3"], fps: 9, loop: false },
      specialSide: { frames: ["r3c3"], fps: 8, loop: false },
      specialDown: { frames: ["r0c3"], fps: 4, loop: false },
      ult: { frames: ["r3c1", "r3c2"], fps: 7, loop: true },
    },
    light: { dmg: 9, reach: 176, speed: 0.98, angle: 0.3, effect: null, label: "Brotherly Fist", sfx: "punch" },
    heavy: { dmg: 17, reach: 190, speed: 0.94, angle: 0.44, effect: null, label: "Vigorous Chop", sfx: "punch", shieldMul: 1.7 },
    specials: {
      neutral: {
        name: "Boogie Woogie", type: "swap", cooldown: 2.0,
        desc: "One clap: he and his opponent trade places. The mind games write themselves.",
        p: { range: 560, color: "#b66cff", label: "BOOGIE WOOGIE", sprite: "effect:boogie_clap", spriteH: 190 },
      },
      side: {
        name: "Vigorous Lariat", type: "dashStrike", cooldown: 1.35,
        desc: "A freight-train lariat thrown with idol-worship enthusiasm.",
        p: { vel: 540, iframes: 0.08, delay: 0.07, dur: 0.24, ox: 62, oy: -98, w: 196, h: 112, dmg: 15, base: 480, growth: 7.4, angle: 0.38, label: "Lariat", sfx: "punch" },
      },
      down: {
        name: "Takada-chan Devotion", type: "gamble", cooldown: 3.4,
        desc: "A moment of pure idol devotion. Restores his spirit — meter, mostly.",
        p: { takada: true, color: "#ffd6f2" },
      },
    },
    ultimate: {
      name: "Boogie Woogie: Zero-Distance Finale", type: "flurry",
      desc: "Clap. Behind you. Clap. Above you. A teleporting beatdown only brothers understand, capped with a Black Flash.",
      p: { hits: 6, dmg: 6, base: 220, finisherDmg: 20, finisherBase: 860, growth: 9, teleport: true, color: "#b66cff", label: "BLACK FLASH" },
    },
    passive: { id: "bestFriend", name: "Ride the Wave", desc: "Landing heavy attacks pumps him up — +8 bonus ultimate meter per heavy hit." },
    ai: { style: "rush", range: 200 },
  },

  // ------------------------------------------------------------------ MOMO
  momo: {
    name: "Momo",
    fullName: "Momo Nishimiya",
    epithet: "Witch of the Wind",
    heightCm: 150,     // estimated
    theme: "#b7b8ff",
    shadow: "rgba(183, 184, 255, 0.36)",
    scale: 0.59,
    stats: { speed: 428, airSpeed: 372, accel: 2760, jump: 770, airJumps: 2, weight: 0.88, friction: 0.84 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      run: { ...RUN_ANIM, fps: 12, fallbackFps: 9 },  // keeps her slightly slower cadence
      jump: { frames: ["jump_rise"], fps: 1, loop: true },
      fall: { frames: ["fall"], fps: 1, loop: true },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r2c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r1c2"], fps: 8, loop: false },
      specialSide: { frames: ["r1c1"], fps: 8, loop: false },
      specialDown: { frames: ["r3c3"], fps: 6, loop: false },
      ult: { frames: ["r3c1", "r3c0"], fps: 7, loop: true },
    },
    light: { dmg: 7.5, reach: 180, speed: 1.05, angle: 0.3, effect: "gust", label: "Broom Sweep", sfx: "whoosh" },
    heavy: { dmg: 14, reach: 194, speed: 1.0, angle: 0.46, effect: "gust", label: "Gale Swing", sfx: "whoosh", shieldMul: 1.5 },
    specials: {
      neutral: {
        name: "Wind Scythe", type: "projectile", cooldown: 0.9,
        desc: "A vacuum blade whipped off the broom bristles, sharpened with grit and gravel.",
        p: { speed: 580, vy: -6, r: 30, dur: 0.85, dmg: 10, base: 330, growth: 6.6, angle: 0.34, color: "#b7b8ff", effect: "gust", count: 2, spread: 120, label: "Wind Scythe", sprite: "effect:wind_scythe", spriteH: 84 },
      },
      side: {
        name: "Broom Charge", type: "dashStrike", cooldown: 1.2,
        desc: "Full-throttle flyby. Works midair — her broom doesn't care about floors.",
        p: { vel: 620, air: true, iframes: 0.1, delay: 0.04, dur: 0.26, ox: 54, oy: -96, w: 190, h: 96, dmg: 12, base: 380, growth: 6.8, angle: 0.36, effect: "gust", label: "Broom Charge", sfx: "whoosh" },
      },
      down: {
        name: "Updraft", type: "updraft", cooldown: 1.8,
        desc: "Calls a rising column of wind: enemies are flung skyward, and Momo rides it free.",
        p: { w: 150, h: 320, dmg: 7, base: 380, growth: 6.2, liftSelf: 900, color: "#d5d6ff", label: "Updraft" },
      },
    },
    ultimate: {
      name: "Maximum: Great Tempest", type: "tempest",
      desc: "The whole sky answers her broom — a stage-wide storm that grinds everything caught in it.",
      p: { duration: 3.2, dmgTick: 4, tickRate: 0.28, base: 210, growth: 4.5, finalBase: 760, color: "#b7b8ff", label: "GREAT TEMPEST", sprite: "effect:tempest", spriteH: 650 },
    },
    passive: { id: "broomFlight", name: "Tool Manipulation", desc: "The broom carries her: a third jump and the best air drift in the game." },
    ai: { style: "zoner", range: 430 },
  },

  // ---------------------------------------------------------------- NANAMI
  nanami: {
    name: "Nanami",
    fullName: "Kento Nanami",
    epithet: "The Salaryman",
    heightCm: 184,     // official
    theme: "#ffd35a",
    shadow: "rgba(255, 205, 82, 0.32)",
    scale: 0.60,
    stats: { speed: 388, airSpeed: 285, accel: 2380, jump: 715, airJumps: 1, weight: 1.14, friction: 0.8 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r2c0", "r2c1"], fps: 8, loop: false },
      downHeavy: { frames: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r1c3"], fps: 8, loop: false },
      specialSide: { frames: ["r1c2"], fps: 8, loop: false },
      specialDown: { frames: ["r3c1"], fps: 3, loop: true },
      ult: { frames: ["r3c2", "r3c3"], fps: 7, loop: true },
    },
    light: { dmg: 9, reach: 176, speed: 0.95, angle: 0.29, effect: null, label: "Ratio Strike", sfx: "slash", critBand: { center: 132, tolerance: 30 } },
    heavy: { dmg: 16.5, reach: 192, speed: 0.92, angle: 0.42, effect: null, label: "Ratio Cleave", sfx: "slashHeavy", shieldMul: 1.7, critBand: { center: 160, tolerance: 36 } },
    specials: {
      neutral: {
        name: "Ratio Technique Wave", type: "projectile", cooldown: 1.1,
        desc: "A compressed blade wave. Finds the 7:3 point of whatever it touches.",
        p: { speed: 540, vy: -4, r: 32, dur: 0.85, dmg: 11, base: 360, growth: 7.0, angle: 0.32, color: "#ffd35a", critChance: 0.3, label: "Ratio Wave", sprite: "effect:ratio_wave", spriteH: 74 },
      },
      side: {
        name: "Collapse", type: "dashStrike", cooldown: 1.35,
        desc: "The overhead strike that dropped a whole stairwell — murder on shields.",
        p: { vel: 480, delay: 0.1, dur: 0.22, ox: 70, oy: -100, w: 208, h: 116, dmg: 15, base: 450, growth: 7.4, angle: 0.4, shieldMul: 2.4, label: "Collapse", sfx: "slashHeavy" },
      },
      down: {
        name: "Overtime", type: "install", cooldown: 7,
        desc: "“From here on, I'm working overtime.” The tie comes off and everything gets faster.",
        p: { duration: 5, speedMul: 1.2, dmgMul: 1.2, color: "#ffd35a", label: "OVERTIME", aura: "effect:aura_gold" },
      },
    },
    ultimate: {
      name: "Ratio: Certain Kill", type: "flurry",
      desc: "A methodical rush of blunt-blade strikes, every one at 7:3 — finished with a critical that ends the workday.",
      p: { hits: 5, dmg: 6, base: 200, finisherDmg: 22, finisherBase: 880, growth: 9.4, crit: true, color: "#ffd35a", label: "7:3 CRITICAL" },
    },
    passive: { id: "sevenThree", name: "Ratio Technique", desc: "Strikes at the 7:3 sweet-spot distance are automatic criticals — space your pokes." },
    ai: { style: "balanced", range: 260 },
  },

  // ------------------------------------------------------------------ TOJI
  toji: {
    name: "Toji",
    fullName: "Toji Fushiguro",
    epithet: "The Sorcerer Killer",
    heightCm: 187,     // cited
    theme: "#a8aeb8",
    shadow: "rgba(168, 174, 184, 0.34)",
    scale: 0.60,
    stats: { speed: 465, airSpeed: 350, accel: 2980, jump: 780, airJumps: 1, weight: 1.04, friction: 0.87 },
    anims: {
      light: { frames: ["r0c3", "r1c2"], fps: 13, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c1"], fps: 8, loop: false },
      specialSide: { frames: ["r3c2"], fps: 8, loop: false },
      specialDown: { frames: ["r0c2"], fps: 8, loop: false },
      ult: { frames: ["r3c1", "r3c0"], fps: 8, loop: true },
    },
    light: { dmg: 8.5, reach: 200, speed: 1.15, angle: 0.24, effect: "heavenly", label: "Spear Rush", sfx: "slash" },
    heavy: { dmg: 15.5, reach: 214, speed: 1.05, angle: 0.4, effect: "heavenly", label: "Split Soul Slash", sfx: "slashHeavy", shieldMul: 2.0 },
    specials: {
      neutral: {
        name: "Chain of a Thousand Miles", type: "projectile", cooldown: 1.1,
        desc: "The endless chain snaps out to full length — a sniper shot in melee clothing.",
        p: { speed: 900, vy: 0, r: 20, dur: 0.6, dmg: 11, base: 380, growth: 6.8, angle: 0.28, color: "#a8aeb8", pierce: true, effect: "heavenly", label: "Thousand Miles", sprite: "effect:chain", spriteH: 82 },
      },
      side: {
        name: "Inverted Spear of Heaven", type: "dashStrike", cooldown: 1.4,
        desc: "The technique-nullifying blade. Struck sorcerers can't use specials for a while.",
        p: { vel: 640, iframes: 0.16, delay: 0.05, dur: 0.2, ox: 84, oy: -90, w: 250, h: 96, dmg: 14, base: 470, growth: 7.2, angle: 0.24, effect: "silence", label: "Inverted Spear", sfx: "slashHeavy" },
      },
      down: {
        name: "Inventory Curse", type: "summon", cooldown: 9,
        desc: "The pact-bound curse uncoils at his shoulder and spits cursed tools from its gullet.",
        p: {
          id: "inventoryCurse", behavior: "support", duration: 6, maxActive: 1,
          color: "#9fb8a8", h: 96, hover: { back: 76, up: 158 },
          sprites: ["summon:inventory_curse", "effect:cursed_spirit_orb"],
          attack: {
            cd: 1.15,
            projectile: { speed: 760, r: 20, dur: 0.7, dmg: 7, base: 300, growth: 5.6, angle: 0.3, color: "#cfd6de", effect: "heavenly", sprite: "effect:cursed_tool", spriteH: 70 },
          },
        },
      },
    },
    ultimate: {
      name: "Zen'in Massacre Arsenal", type: "flurry",
      desc: "The cursed-tool warehouse opens: a weapon-swapping execution rush no barrier survives.",
      p: { hits: 7, dmg: 5.5, base: 190, finisherDmg: 19, finisherBase: 840, growth: 9, silence: true, color: "#a8aeb8", label: "SORCERER KILLER" },
    },
    passive: { id: "heavenlyVoid", name: "Invisible to Curses", desc: "No cursed energy to read: dodge invincibility lasts 25% longer, and his hits drain enemy meter." },
    ai: { style: "rush", range: 240 },
  },

  // ---------------------------------------------------------------- SUKUNA
  sukuna: {
    name: "Sukuna",
    fullName: "Ryomen Sukuna",
    epithet: "King of Curses",
    heightCm: 172.7,   // cited
    theme: "#ff4c55",
    shadow: "rgba(255, 67, 75, 0.4)",
    scale: 0.60,
    stats: { speed: 435, airSpeed: 322, accel: 2700, jump: 755, airJumps: 1, weight: 1.06, friction: 0.83 },
    anims: {
      light: { frames: ["r0c2", "r3c0"], fps: 12, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c1"], fps: 6, loop: false },
      crouchAttack: { frames: ["r4c1", "r4c2", "r4c3"], fps: 11, loop: false },
      specialNeutral: { frames: ["r3c0"], fps: 8, loop: false },
      specialSide: { frames: ["r3c3"], fps: 8, loop: false },
      specialDown: { frames: ["r3c2"], fps: 8, loop: false },
      ult: { frames: ["r0c3", "r3c1"], fps: 7, loop: true },
    },
    light: { dmg: 9, reach: 182, speed: 1.05, angle: 0.27, effect: "bleed", label: "Dismantle", sfx: "slash" },
    heavy: { dmg: 16.5, reach: 198, speed: 1.0, angle: 0.42, effect: "bleed", label: "Cleave", sfx: "slashHeavy", shieldMul: 1.7 },
    specials: {
      neutral: {
        name: "Dismantle", type: "projectile", cooldown: 0.85,
        desc: "The default slash of the King of Curses, thrown as easily as breathing.",
        p: { speed: 720, vy: -4, r: 26, dur: 0.7, dmg: 11, base: 360, growth: 7.0, angle: 0.3, color: "#ff4c55", effect: "bleed", label: "Dismantle", sprite: "effect:dismantle", spriteH: 82 },
      },
      side: {
        name: "Cleave", type: "dashStrike", cooldown: 1.25,
        desc: "Adjusts to the target's toughness and carves straight through the space they hold.",
        p: { vel: 600, iframes: 0.1, delay: 0.05, dur: 0.24, ox: 74, oy: -92, w: 224, h: 104, dmg: 10, base: 420, growth: 7.0, angle: 0.28, effect: "bleed", hits: 2, label: "Cleave", sfx: "slashHeavy" },
      },
      down: {
        name: "Divine Flame: Fuga", type: "projectile", cooldown: 2.3,
        desc: "“Open.” An arrow of divine fire that detonates on arrival.",
        p: { speed: 520, vy: -30, gravity: 120, r: 40, dur: 1.1, dmg: 16, base: 520, growth: 8.6, angle: 0.5, color: "#ff8c3f", effect: "burn", explode: 90, label: "Fuga", sprite: "effect:fuga", spriteH: 94 },
      },
    },
    ultimate: {
      name: "Dismantle: Merciless Barrage", type: "flurry",
      desc: "A carving rush too fast to read — Dismantle after Dismantle, closed with a Cleave that finds the exact toughness of whatever it meets.",
      p: { hits: 6, dmg: 6, base: 210, finisherDmg: 21, finisherBase: 860, growth: 9.2, color: "#ff4c55", label: "CLEAVE" },
    },
    // ---- Domain Expansion -------------------------------------------------
    domains: [{
      name: "Malevolent Shrine",
      type: "malevolentShrine",
      desc: "The shrine of skulls, raised without walls. Everything inside its reach is already cut.",
      howTo: "A ring of cleave-blades orbits the shrine and slashes rain on the enemy automatically. Press SPECIAL to snatch a blade out of the air, then LIGHT or HEAVY to unleash it as a colossal Cleave — the more blades still orbiting when you throw, the harder it lands.",
      p: { duration: 7, color: "#ff4c55", bg: "domain:malevolent_shrine", blades: 6, rainTick: 0.34, rainDmg: 2.8, cleaveDmg: 15, cleaveBase: 520, cleaveGrowth: 8.2 },
    }],
    passive: { id: "kingsContempt", name: "King's Contempt", desc: "Scents weakness: +10% damage against opponents past 80%." },
    ai: { style: "rush", range: 260 },
  },

  // ---------------------------------------------------------------- MAHITO
  mahito: {
    name: "Mahito",
    fullName: "Mahito",
    epithet: "Soul Shaper",
    heightCm: 179.1,   // cited
    theme: "#b56cff",
    shadow: "rgba(177, 92, 255, 0.4)",
    scale: 0.60,
    stats: { speed: 422, airSpeed: 328, accel: 2600, jump: 760, airJumps: 1, weight: 0.98, friction: 0.82 },
    // Inherits the semantic table; these keep this fighter's own timing.
    anims: { ...SEMANTIC_ANIMS,
      ult: { frames: ["ult_a", "ult_b"], fps: 8, loop: true },
    },
    light: { dmg: 8, reach: 174, speed: 1.08, angle: 0.31, effect: "soulMark", label: "Soul Touch", sfx: "punch" },
    heavy: { dmg: 15, reach: 188, speed: 1.0, angle: 0.44, effect: "soulMark", label: "Distorted Limb", sfx: "punch", shieldMul: 1.6 },
    specials: {
      neutral: {
        name: "Idle Transfiguration", type: "commandGrab", cooldown: 2.1,
        desc: "One touch on the soul and the body follows. Cannot be blocked — only avoided.",
        p: { range: 120, dmg: 14, base: 420, growth: 7.0, angle: 0.7, effect: "soulMark", color: "#b56cff", label: "Idle Transfiguration", sprite: "effect:soul_touch", spriteH: 150 },
      },
      side: {
        name: "Body Distortion Lunge", type: "dashStrike", cooldown: 1.3,
        desc: "His arm warps into a blade mid-stride and carves through the approach.",
        p: { vel: 560, iframes: 0.1, delay: 0.05, dur: 0.24, ox: 66, oy: -94, w: 204, h: 104, dmg: 13, base: 410, growth: 7.0, angle: 0.3, effect: "soulMark", label: "Distortion", sfx: "slash" },
      },
      down: {
        name: "Transfigured Human", type: "summon", cooldown: 3.4,
        desc: "Reshapes a stored soul into a shambling experiment that lurches after the enemy and bursts.",
        p: {
          id: "transfigured", behavior: "bomber", duration: 4.5, speed: 330, maxActive: 2,
          color: "#8f5cd8", h: 104, hitW: 64, hitH: 88,
          sprites: ["summon:transfigured_human", "effect:soul_isomer"],
          attack: { dmg: 12, base: 400, growth: 6.8, angle: 0.6, r: 90, effect: "soulMark" },
        },
      },
    },
    ultimate: {
      name: "Instant Spirit Body of Distorted Killing", type: "install",
      desc: "His true form — a streamlined killing body. Faster, crueler, and nothing blocks it.",
      p: { duration: 8, speedMul: 1.3, dmgMul: 1.12, unblockable: true, color: "#b56cff", label: "TRUE FORM", aura: "effect:aura_violet" },
    },
    // ---- Domain Expansion -------------------------------------------------
    domains: [{
      name: "Self-Embodiment of Perfection",
      type: "selfEmbodiment",
      desc: "Every surface is his hand. Inside, a soul is something he simply reaches out and reshapes.",
      howTo: "Every attack you land is a direct soul touch: nothing can be blocked, and each hit stacks Distortion on them. At five stacks the soul collapses on its own for massive damage and the counter resets — so keep touching them.",
      p: { duration: 7, color: "#b56cff", bg: "domain:self_embodiment", stacksToBurst: 5, burstDmg: 22, burstBase: 760, burstGrowth: 9 },
    }],
    passive: { id: "soulShaper", name: "Idle Transfiguration (Passive)", desc: "Every hit brushes the soul: marked victims take 18% more damage from all sources." },
    ai: { style: "rush", range: 220 },
  },

  // ------------------------------------------------------------------ GETO
  geto: {
    name: "Geto",
    fullName: "Suguru Geto",
    epithet: "Curse Collector",
    heightCm: 190.5,   // cited
    theme: "#7d58d8",
    shadow: "rgba(125, 88, 216, 0.38)",
    scale: 0.60,
    stats: { speed: 398, airSpeed: 305, accel: 2440, jump: 745, airJumps: 1, weight: 1.04, friction: 0.82 },
    anims: {
      light: { frames: ["r0c3", "r3c0"], fps: 12, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c1"], fps: 6, loop: false },
      shield: { frames: ["guard"], fps: 1, loop: true },
      downHeavy: { frames: ["attack_down"], fps: 6, loop: false },
      specialNeutral: { frames: ["special_neutral"], fps: 8, loop: false },
      specialSide: { frames: ["special_side"], fps: 8, loop: false },
      specialDown: { frames: ["r2c2"], fps: 8, loop: false },
      ult: { frames: ["r2c1", "r3c2"], fps: 7, loop: true },
    },
    light: { dmg: 8.5, reach: 176, speed: 1.0, angle: 0.32, effect: "curseDrain", label: "Cursed Spirit Strike", sfx: "punch" },
    heavy: { dmg: 15.5, reach: 192, speed: 0.98, angle: 0.44, effect: "curseDrain", label: "Curse Hammer", sfx: "slashHeavy", shieldMul: 1.7 },
    specials: {
      neutral: {
        name: "Cursed Spirit Volley", type: "projectile", cooldown: 1.2,
        desc: "Releases a handful of lesser curses that drift hungrily toward the enemy.",
        // Each of the three shots draws a different curse, cut from his own
        // round-6 art. The volley is the one move where seeing a MENAGERIE
        // rather than three identical orbs sells what Geto actually does.
        // Aimed as a fan: the three curses keep their spread perpendicular to
        // whatever direction the stick picks. Steering overrides their homing —
        // if you are flying them, you have decided where they are going.
        p: { speed: 420, vy: -10, r: 26, dur: 1.1, dmg: 8, base: 280, growth: 5.8, angle: 0.4, color: "#7d58d8", count: 3, spread: 170, homing: 130, effect: "curseDrain", label: "Spirit Volley", spritePool: ["effect:curse_a", "effect:curse_b", "effect:curse_c", "effect:curse_d"], spriteH: 96, steerable: true, steerRate: 4.6 },
      },
      side: {
        name: "Rainbow Dragon", type: "summon", cooldown: 8,
        desc: "His prized heavy-hitter is released onto the stage and hunts until the technique is spent.",
        p: {
          id: "rainbowDragon", behavior: "chaser", duration: 5, speed: 380, maxActive: 1,
          // Unlike the other summons, the round-8 dragon art is drawn facing
          // RIGHT, so the renderer's default mirror pointed it away from its
          // target the whole time it was chasing.
          faceRight: true,
          color: "#9d7dff", h: 170, hitW: 130, hitH: 130, standOff: 40,
          sprites: ["summon:rainbow_dragon", "effect:curse_dragon"],
          attack: { dmg: 11, base: 380, growth: 6.6, angle: 0.42, cd: 1.05, effect: "curseDrain", sfx: "slashHeavy" },
        },
      },
      down: {
        name: "Kuchisake-Onna's Scissors", type: "trap", cooldown: 2.3,
        desc: "Plants a lurking curse ahead; it erupts in shears when the enemy steps close.",
        p: { dist: 220, armTime: 0.5, lifetime: 4, w: 130, h: 170, dmg: 13, base: 420, growth: 7.0, angle: 0.9, color: "#5c3fa8", label: "Scissors", sprite: "effect:scissors_curse", spriteH: 190 },
      },
    },
    ultimate: {
      name: "Maximum: Uzumaki", type: "vortex",
      desc: "Every stockpiled curse extracted and wrung into a single spiraling annihilation.",
      p: { speed: 300, r: 120, dur: 2.6, tickRate: 0.18, dmgTick: 4, base: 200, growth: 4.2, finalBase: 800, pull: 420, color: "#7d58d8", label: "UZUMAKI", sprite: "effect:uzumaki", spriteH: 250 },
    },
    passive: { id: "curseHoard", name: "Cursed Spirit Manipulation", desc: "Feeds on the fight: summon specials return double ultimate meter." },
    ai: { style: "zoner", range: 400 },
  },

  // ------------------------------------------------------------------ JOGO
  jogo: {
    name: "Jogo",
    fullName: "Jogo",
    epithet: "Disaster of Flame",
    heightCm: 180,     // cited
    theme: "#ff7a2f",
    shadow: "rgba(255, 122, 47, 0.42)",
    scale: 0.60,
    stats: { speed: 368, airSpeed: 288, accel: 2280, jump: 720, airJumps: 1, weight: 1.16, friction: 0.79 },
    anims: {
      light: { frames: ["r2c0", "r0c3"], fps: 11, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c1"], fps: 8, loop: false },
      specialSide: { frames: ["special_side"], fps: 8, loop: false },
      specialDown: { frames: ["r3c3"], fps: 5, loop: false },
      ult: { frames: ["r3c2", "r3c3"], fps: 7, loop: true },
    },
    light: { dmg: 9.5, reach: 170, speed: 0.94, angle: 0.32, effect: "burn", label: "Scorch Jab", sfx: "punch" },
    heavy: { dmg: 17.5, reach: 186, speed: 0.9, angle: 0.44, effect: "burn", label: "Magma Fist", sfx: "punch", shieldMul: 1.7 },
    specials: {
      neutral: {
        name: "Ember Insects", type: "projectile", cooldown: 1.05,
        desc: "A swarm of blazing embers lobbed in an arc, igniting whatever they land on.",
        p: { speed: 460, vy: -140, gravity: 320, r: 30, dur: 1.15, dmg: 10, base: 360, growth: 6.8, angle: 0.5, color: "#ff7a2f", effect: "burn", count: 2, spread: 130, label: "Embers", sprite: "effect:ember", spriteH: 86 },
      },
      side: {
        name: "Lava Geyser", type: "trap", cooldown: 1.9,
        desc: "The ground under the enemy splits and vents a pillar of magma.",
        p: { atOpponent: true, armTime: 0.45, lifetime: 0.7, w: 120, h: 260, dmg: 15, base: 470, growth: 7.6, angle: 1.2, color: "#ff5a1f", effect: "burn", label: "Geyser", sprite: "effect:lava_geyser", spriteH: 280 },
      },
      down: {
        name: "Furnace Shell", type: "install", cooldown: 5.5,
        desc: "Wraps himself in furnace heat: armored, and searing to the touch.",
        p: { duration: 3.4, armor: true, contactBurn: true, color: "#ff7a2f", label: "FURNACE SHELL", aura: "effect:aura_orange" },
      },
    },
    ultimate: {
      name: "Maximum: Meteor", type: "meteor",
      desc: "He pulls a piece of the sky down on the arena. The crater is the point.",
      p: { dmg: 36, base: 940, growth: 11, r: 200, fallTime: 1.1, burnField: 2.6, color: "#ff7a2f", label: "MAXIMUM: METEOR", sprite: "effect:meteor", spriteH: 310 },
    },
    // ---- Domain Expansion -------------------------------------------------
    domains: [{
      name: "Coffin of the Iron Mountain",
      type: "ironMountain",
      desc: "The inside of a volcano, sealed shut. There is no cool air left in the world.",
      howTo: "The whole floor becomes magma and burns anything standing on it. Press SPECIAL to erupt a geyser directly under the enemy — free and instant, as often as you like. You are immune to your own heat.",
      p: { duration: 7, color: "#ff7a2f", bg: "domain:iron_mountain", floorTick: 0.5, floorDmg: 1.8, geyserDmg: 12, geyserBase: 400, geyserGrowth: 7 },
    }],
    passive: { id: "disasterFlame", name: "Disaster Curse", desc: "Born of humanity's fear of eruption: his burns tick 50% harder." },
    ai: { style: "zoner", range: 400 },
  },

  // ---------------------------------------------------------------- HANAMI
  hanami: {
    name: "Hanami",
    fullName: "Hanami",
    epithet: "Grief of the Forest",
    heightCm: 220,     // cited
    theme: "#9bb36b",
    shadow: "rgba(155, 179, 107, 0.4)",
    scale: 0.58,
    stats: { speed: 358, airSpeed: 278, accel: 2220, jump: 730, airJumps: 1, weight: 1.24, friction: 0.78 },
    anims: {
      light: { frames: ["r2c0"], fps: 9, loop: false },
      sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"], fallback: ["r2c1"], fps: 6, loop: false },
      downHeavy: { frames: ["r2c2"], fps: 6, loop: false },
      specialNeutral: { frames: ["special_neutral"], fps: 8, loop: false },
      specialSide: { frames: ["special_side"], fps: 8, loop: false },
      specialDown: { frames: ["r3c0"], fps: 6, loop: false },
      ult: { frames: ["r3c3", "r3c1"], fps: 7, loop: true },
    },
    light: { dmg: 9.5, reach: 186, speed: 0.9, angle: 0.34, effect: "rootSnare", label: "Root Lash", sfx: "punch" },
    heavy: { dmg: 17.5, reach: 200, speed: 0.88, angle: 0.44, effect: "rootSnare", label: "Timber Crush", sfx: "slashHeavy", shieldMul: 1.7 },
    specials: {
      neutral: {
        name: "Cursed Buds", type: "projectile", cooldown: 1.15,
        desc: "Lobbed seeds that bloom into parasites, sapping the strength to move.",
        p: { speed: 430, vy: -110, gravity: 300, r: 32, dur: 1.1, dmg: 11, base: 350, growth: 6.6, angle: 0.44, color: "#9bb36b", effect: "rootSnare", count: 2, spread: 140, label: "Cursed Bud", sprite: "effect:cursed_bud", spriteH: 84 },
      },
      side: {
        name: "Root Eruption", type: "trap", cooldown: 1.8,
        desc: "Roots burst from the earth beneath the enemy and impale upward.",
        p: { atOpponent: true, armTime: 0.5, lifetime: 0.6, w: 130, h: 240, dmg: 14, base: 440, growth: 7.2, angle: 1.15, color: "#7a9448", effect: "rootSnare", label: "Roots", sprite: "effect:root_spikes", spriteH: 255 },
      },
      down: {
        name: "Flower Field", type: "install", cooldown: 6,
        desc: "A ring of stolen life blooms around the curse, mending its wooden body.",
        p: { duration: 3.5, healPerSec: 4, armor: true, color: "#c8e79a", label: "FLOWER FIELD", aura: "effect:aura_green" },
      },
    },
    ultimate: {
      name: "Domain of the Flowering Forest", type: "eruption",
      desc: "The whole floor becomes his garden — waves of vines and thorned boughs harvest the arena.",
      p: { waves: 5, waveGap: 0.5, dmg: 12, base: 420, growth: 7.4, color: "#9bb36b", label: "FLOWERING FOREST", sprite: "effect:root_spikes" },
    },
    passive: { id: "barkArmor", name: "Old-Growth Body", desc: "Wood deeper than flesh: takes 12% less damage while standing on the ground." },
    ai: { style: "heavy", range: 320 },
  },

  // ----------------------------------------------------------------- CHOSO
  choso: {
    name: "Choso",
    fullName: "Choso",
    epithet: "Eldest Brother",
    heightCm: 181,     // cited
    theme: "#c22e4a",
    shadow: "rgba(194, 46, 74, 0.4)",
    scale: 0.60,
    stats: { speed: 405, airSpeed: 315, accel: 2500, jump: 750, airJumps: 1, weight: 1.06, friction: 0.82 },
    anims: SEMANTIC_ANIMS,
    light: { dmg: 8, reach: 176, speed: 1.05, angle: 0.31, effect: null, label: "Blood Edge", sfx: "slash" },
    heavy: { dmg: 15.5, reach: 190, speed: 0.98, angle: 0.44, effect: null, label: "Crimson Arc", sfx: "slashHeavy", shieldMul: 1.6 },
    specials: {
      neutral: {
        name: "Piercing Blood", type: "projectile", cooldown: 1.15,
        desc: "Blood pressurized past the speed of sound — a needle-thin lance across the whole lane. It costs him a little of himself.",
        p: { speed: 940, vy: 0, r: 18, dur: 0.6, dmg: 12, base: 380, growth: 7.0, angle: 0.28, color: "#c22e4a", pierce: true, bloodCost: 1.5, label: "Piercing Blood", sprite: "effect:piercing_blood", spriteH: 70 },
      },
      side: {
        name: "Convergence: Blood Meteorite", type: "projectile", cooldown: 1.6,
        desc: "Hardened blood compressed into a dense sphere that detonates on arrival.",
        p: { speed: 520, vy: -20, gravity: 80, r: 34, dur: 1.0, dmg: 15, base: 470, growth: 7.8, angle: 0.5, color: "#a01f38", explode: 85, bloodCost: 2, label: "Blood Meteorite", sprite: "effect:blood_orb", spriteH: 88 },
      },
      down: {
        name: "Flowing Red Scale", type: "install", cooldown: 6.5,
        desc: "Overclocks his own blood — pulse, temperature, clotting, all past human limits. Holding it burns him slowly.",
        p: { duration: 4.5, speedMul: 1.22, dmgMul: 1.18, selfDrainPerSec: 1.2, color: "#e84a63", label: "RED SCALE", aura: "effect:aura_crimson" },
      },
    },
    ultimate: {
      name: "Supernova", type: "supernova",
      desc: "Orbs of compressed blood ring the enemy in silence — then every one of them detonates inward at once.",
      p: { orbs: 8, radius: 240, delay: 0.8, dmgPerOrb: 4.5, finalDmg: 14, finalBase: 780, finalGrowth: 9, color: "#c22e4a", label: "SUPERNOVA", sprite: "effect:blood_orb", spriteH: 88 },
    },
    passive: { id: "deathPainting", name: "Death Painting Body", desc: "Half curse, half human, all blood: immune to bleed and poison. His blood techniques spend health instead of restraint." },
    ai: { style: "zoner", range: 380 },
  },

  // --------------------------------------------------------------- MEI MEI
  meimei: {
    name: "Mei Mei",
    fullName: "Mei Mei",
    epithet: "The Mercenary",
    heightCm: null,    // unknown
    theme: "#d8b95c",
    shadow: "rgba(216, 185, 92, 0.36)",
    scale: 0.60,
    stats: { speed: 425, airSpeed: 330, accel: 2650, jump: 765, airJumps: 1, weight: 1.0, friction: 0.84 },
    anims: SEMANTIC_ANIMS,
    light: { dmg: 8.5, reach: 182, speed: 1.0, angle: 0.3, effect: null, label: "Axe Combo", sfx: "slash" },
    heavy: { dmg: 16.5, reach: 196, speed: 0.95, angle: 0.44, effect: null, label: "Executioner's Cleave", sfx: "slashHeavy", shieldMul: 2.0 },
    specials: {
      neutral: {
        name: "Crow Scout", type: "projectile", cooldown: 1.0,
        desc: "A shikigami crow dives on command, wheeling after the target.",
        p: { speed: 470, vy: -30, r: 26, dur: 1.2, dmg: 9, base: 320, growth: 6.2, angle: 0.4, color: "#d8b95c", homing: 150, label: "Crow", sprite: "effect:crow", spriteH: 84 },
      },
      side: {
        name: "Axe Rush", type: "dashStrike", cooldown: 1.35,
        desc: "She closes the distance herself — an overhead axe arc delivered with professional efficiency.",
        p: { vel: 540, iframes: 0.1, delay: 0.06, dur: 0.22, ox: 66, oy: -96, w: 210, h: 108, dmg: 14, base: 450, growth: 7.2, angle: 0.4, shieldMul: 2.2, label: "Axe Rush", sfx: "slashHeavy" },
      },
      down: {
        name: "Advance Payment", type: "payToWin", cooldown: 3.0,
        desc: "Nothing is free. Invests a slice of ultimate meter; the returns are excellent.",
        p: { cost: 15, duration: 4, dmgMul: 1.25, color: "#ffd35a", label: "PAID IN FULL" },
      },
    },
    ultimate: {
      name: "Bird Strike", type: "birdstrike",
      desc: "A crow that abandons self-preservation breaks every limit. It crosses the arena like a cannon shell — and the flock follows.",
      p: { dmg: 30, base: 900, growth: 10.5, r: 90, speed: 1050, followers: 4, followerDmg: 6, followerBase: 300, color: "#d8b95c", label: "BIRD STRIKE", sprite: "effect:crow_flock", spriteH: 220 },
    },
    passive: { id: "warCompensation", name: "Everything Has a Price", desc: "A professional is paid for results: +25% ultimate meter from damage dealt, and every new stock starts with an advance." },
    ai: { style: "balanced", range: 300 },
  },

  // ------------------------------------------------------------------- URO
  uro: {
    name: "Uro",
    fullName: "Takako Uro",
    epithet: "Sky Manipulator",
    heightCm: null,    // unknown
    theme: "#8fd7e8",
    shadow: "rgba(143, 215, 232, 0.36)",
    scale: 0.60,
    stats: { speed: 432, airSpeed: 385, accel: 2750, jump: 790, airJumps: 2, weight: 0.9, friction: 0.84 },
    anims: SEMANTIC_ANIMS,
    light: { dmg: 8, reach: 170, speed: 1.1, angle: 0.3, effect: null, label: "Palm Arts", sfx: "punch" },
    heavy: { dmg: 15, reach: 184, speed: 1.05, angle: 0.46, effect: null, label: "Sky-Splitting Palm", sfx: "punch", shieldMul: 1.5 },
    specials: {
      neutral: {
        name: "Sky Warp Palm", type: "warpStrike", cooldown: 1.5,
        desc: "She strikes the sky where she stands — and the blow arrives out of the air on top of the target.",
        p: { delay: 0.32, r: 95, dmg: 12, base: 420, growth: 7.0, angle: 0.5, color: "#8fd7e8", label: "Sky Palm", sprite: "effect:sky_ripple", spriteH: 150 },
      },
      side: {
        name: "Surface Dive", type: "dashStrike", cooldown: 1.25,
        desc: "Kicks off a fold in the air itself — a swooping strike that works midair.",
        p: { vel: 600, air: true, iframes: 0.12, delay: 0.05, dur: 0.24, ox: 56, oy: -94, w: 195, h: 100, dmg: 12, base: 400, growth: 6.8, angle: 0.36, label: "Surface Dive", sfx: "whoosh" },
      },
      down: {
        name: "Sky Fold", type: "reflectCounter", cooldown: 2.8,
        desc: "Curves the sky into a lens: melee is answered in kind, and projectiles are bent straight back at their owner.",
        p: { window: 0.55, dmg: 13, base: 440, growth: 7.2, angle: 0.5, color: "#bfeaf5", label: "Sky Fold" },
      },
    },
    ultimate: {
      name: "Inverted Sky", type: "skyInvert",
      desc: "The whole sky becomes her weapon — it folds shut, swallows the enemy, and slams them back into the earth.",
      p: { range: 900, dmg: 30, base: 880, growth: 10.5, liftTime: 0.9, color: "#8fd7e8", label: "INVERTED SKY", sprite: "effect:sky_shard", spriteH: 260 },
    },
    passive: { id: "openSky", name: "Mistress of the Air", desc: "The sky is her territory: a third jump, and 12% less damage and knockback while airborne." },
    ai: { style: "balanced", range: 280 },
  },

  // ------------------------------------------------------------------ YUJI
  yuji: {
    name: "Yuji",
    fullName: "Yuji Itadori",
    epithet: "Sukuna's Vessel",
    heightCm: 173,     // official
    theme: "#ff8264",
    shadow: "rgba(255, 130, 100, 0.38)",
    scale: 0.60,
    stats: { speed: 448, airSpeed: 345, accel: 2900, jump: 780, airJumps: 1, weight: 1.02, friction: 0.86 },
    anims: SEMANTIC_ANIMS,
    light: { dmg: 8.5, reach: 174, speed: 1.1, angle: 0.3, effect: null, label: "Straight Right", sfx: "punch" },
    heavy: { dmg: 16, reach: 188, speed: 1.0, angle: 0.44, effect: null, label: "Crushing Blow", sfx: "punch", shieldMul: 1.7 },
    specials: {
      neutral: {
        name: "Divergent Fist", type: "echoStrike", cooldown: 1.2,
        desc: "His cursed energy lags a beat behind the fist — one punch, two impacts.",
        p: { delay: 0.08, dur: 0.14, ox: 46, oy: -96, w: 170, h: 104, dmg: 9, base: 300, growth: 5.6, angle: 0.34, echoDelay: 0.34, echoDmg: 8, echoBase: 440, echoGrowth: 7.2, echoAngle: 0.5, color: "#ff8264", label: "Divergent Fist", sfx: "punch", sprite: "effect:divergent_shock", spriteH: 140 },
      },
      side: {
        name: "Manji Kick", type: "dashStrike", cooldown: 1.3,
        desc: "A sliding capoeira-style low kick that sweeps in under guards and pokes.",
        p: { vel: 560, iframes: 0.08, delay: 0.05, dur: 0.22, ox: 58, oy: -60, w: 200, h: 70, dmg: 12, base: 420, growth: 7.0, angle: 0.28, label: "Manji Kick", sfx: "punch" },
      },
      down: {
        name: "Unbreakable Grit", type: "install", cooldown: 6.0,
        desc: "Plants his feet and refuses to fall — for a moment, nothing staggers him.",
        p: { duration: 2.8, armor: true, dmgTakenMul: 0.88, color: "#ffb37a", label: "GRIT" },
      },
    },
    ultimate: {
      name: "Black Flash: Consecutive", type: "flurry",
      desc: "Cursed energy struck within a millionth of a second of impact — again, and again, and again. Space itself distorts.",
      p: { hits: 5, dmg: 6, base: 210, finisherDmg: 22, finisherBase: 880, growth: 9.2, crit: true, critLabel: "BLACK FLASH", critColor: "#ff3b30", color: "#ff3b30", label: "BLACK FLASH" },
    },
    passive: { id: "blackFlash", name: "Black Flash", desc: "Every melee hit has a 12% chance to spark a Black Flash: bonus damage, extra launch, and a surge of ultimate meter." },
    ai: { style: "rush", range: 210 },
  },

  // ---------------------------------------------------------------- REGGIE
  reggie: {
    name: "Reggie Star",
    fullName: "Reggie Star",
    epithet: "The Contractor",
    heightCm: null,    // unknown
    theme: "#86d67c",
    shadow: "rgba(134, 214, 124, 0.36)",
    scale: 0.60,
    stats: { speed: 402, airSpeed: 310, accel: 2480, jump: 745, airJumps: 1, weight: 1.05, friction: 0.82 },
    anims: SEMANTIC_ANIMS,
    light: { dmg: 8, reach: 178, speed: 1.0, angle: 0.3, effect: null, label: "Umbrella Blade", sfx: "slash" },
    heavy: { dmg: 15.5, reach: 192, speed: 0.98, angle: 0.44, effect: null, label: "Contract Cleave", sfx: "slashHeavy", shieldMul: 1.6 },
    specials: {
      neutral: {
        name: "Receipt: Katana Umbrella", type: "projectile", cooldown: 1.0,
        desc: "Tears a receipt and the purchase appears mid-swing — a blade wave off the umbrella's edge.",
        p: { speed: 580, vy: -4, r: 30, dur: 0.85, dmg: 11, base: 360, growth: 6.8, angle: 0.34, color: "#86d67c", label: "Umbrella Blade", sprite: "effect:receipt_blade", spriteH: 86 },
      },
      side: {
        name: "Receipt: Insecticide", type: "cloudField", cooldown: 2.0,
        desc: "Empties an aerosol contract downrange — a lingering cloud of poison that seeps through guards.",
        p: { dist: 210, w: 220, h: 150, duration: 2.6, tickRate: 0.5, tickDmg: 2.2, effect: "poison", color: "#b9e78a", label: "Insecticide", sprite: "effect:spray_cloud", spriteH: 160 },
      },
      down: {
        name: "Receipt: Big-Ticket Item", type: "randomDrop", cooldown: 2.6,
        desc: "Rips a premium receipt — something heavy materializes over the enemy. Contents may vary.",
        p: {
          armTime: 0.55, color: "#86d67c",
          drops: [
            { key: "effect:drop_vending", name: "Vending Machine", dmg: 15, base: 500, growth: 7.6, w: 130, h: 220 },
            { key: "effect:drop_bike", name: "Motorbike", dmg: 12, base: 430, growth: 7.0, w: 150, h: 150 },
            { key: "effect:drop_futon", name: "Futon", dmg: 5, base: 220, growth: 4, w: 160, h: 100, dud: true },
          ],
        },
      },
    },
    ultimate: {
      name: "Grand Contract: Luxury Sedan", type: "cardrop",
      desc: "The largest purchase on file arrives at terminal velocity — a full-size sedan, and it keeps going after it lands.",
      p: { dmg: 32, base: 900, growth: 10.5, r: 130, fallTime: 0.9, slideSpeed: 760, slideDur: 1.1, slideDmg: 12, slideBase: 480, color: "#86d67c", label: "LUXURY SEDAN", sprite: "effect:sedan", spriteH: 170 },
    },
    passive: { id: "contractor", name: "Paper Trail", desc: "Every deal has fine print in his favor: special cooldowns tick 18% faster." },
    ai: { style: "zoner", range: 380 },
  },

  // ------------------------------------------------------------- GAKUGANJI
  gakuganji: {
    name: "Gakuganji",
    fullName: "Yoshinobu Gakuganji",
    epithet: "The Old Guard",
    heightCm: null,    // unknown
    theme: "#d89b3f",
    shadow: "rgba(216, 155, 63, 0.36)",
    scale: 0.60,
    stats: { speed: 356, airSpeed: 272, accel: 2200, jump: 710, airJumps: 1, weight: 1.18, friction: 0.79 },
    anims: SEMANTIC_ANIMS,
    light: { dmg: 9, reach: 172, speed: 0.92, angle: 0.32, effect: null, label: "Guitar Swing", sfx: "punch" },
    heavy: { dmg: 17, reach: 188, speed: 0.88, angle: 0.44, effect: null, label: "Amp Smash", sfx: "slashHeavy", shieldMul: 1.7 },
    specials: {
      neutral: {
        name: "Power Chord", type: "projectile", cooldown: 1.1,
        desc: "One downstroke — cursed energy rides the riff out as a crushing wall of sound.",
        p: { speed: 500, vy: 0, r: 40, dur: 0.8, dmg: 11, base: 380, growth: 6.8, angle: 0.36, color: "#d89b3f", pierce: true, ampable: true, label: "Power Chord", sprite: "effect:sound_wave", spriteH: 120 },
      },
      side: {
        name: "Feedback Wall", type: "trap", cooldown: 1.9,
        desc: "Plants a standing wave of shrieking feedback that erupts when crossed.",
        p: { dist: 230, armTime: 0.4, lifetime: 3.5, w: 130, h: 180, dmg: 13, base: 430, growth: 7.0, angle: 0.7, color: "#e8b25c", label: "Feedback", sprite: "effect:feedback_wall", spriteH: 200 },
      },
      down: {
        name: "Distortion Solo", type: "install", cooldown: 6.0,
        desc: "Steps on the pedal. While the solo rings, every Power Chord comes out doubled.",
        p: { duration: 4.5, ampUp: true, dmgMul: 1.1, color: "#ffcf7a", label: "DISTORTION", aura: "effect:aura_amber" },
      },
    },
    ultimate: {
      name: "Deadly Melody: Encore", type: "concert",
      desc: "The full performance. Waves of amplified cursed sound roll off the stage until the closing chord throws the crowd.",
      p: { duration: 3.0, tickRate: 0.45, dmgTick: 4, finalDmg: 16, finalBase: 800, finalGrowth: 9, radius: 520, color: "#d89b3f", label: "ENCORE", sprite: "effect:concert_wave", spriteH: 300 },
    },
    passive: { id: "oldGuard", name: "Unshakeable Tradition", desc: "Decades on every kind of stage: takes 25% less hitstun — the old man barely flinches." },
    ai: { style: "zoner", range: 380 },
  },
};

// The roster, resolved from config_menus.js. Editing CHARACTER_GROUPS there is
// the ONLY thing needed to reorder fighters, move one between categories, add a
// category or delete one: grid order, move-list order and asset-load order all
// read from this, so there is one roster ordering rather than several that can
// drift apart.
//
// Resolved, not trusted verbatim. A hand-edited config will eventually contain a
// typo, a fighter left in two categories after a move, or a category emptied out
// rather than deleted — none of which should take the select screen down. So:
// drop members with no kit, drop a repeat of a fighter already placed in an
// earlier category, and drop categories left with nothing in them. Every case is
// warned about below rather than passing silently.
export const RESOLVED_GROUPS = (() => {
  const seen = new Set();
  return CHARACTER_GROUPS
    .map((group) => ({
      ...group,
      members: (group.members || []).filter((key) => {
        if (!CHARACTERS[key] || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }))
    .filter((group) => group.members.length > 0);
})();

export const CHARACTER_KEYS = RESOLVED_GROUPS.flatMap((g) => g.members);

// Config typos are worth saying out loud: a fighter in no group is unreachable,
// and a group member with no kit would break the grid. Staged round-7 fighters
// are excluded from the roster by design and don't count as either.
const ungrouped = Object.keys(CHARACTERS).filter(
  (key) => !CHARACTER_KEYS.includes(key) && !STAGED_CHARACTER_KEYS.includes(key)
);
if (ungrouped.length) {
  console.warn(`Not listed in CHARACTER_GROUPS, so unselectable: ${ungrouped.join(", ")}`);
}

const listed = CHARACTER_GROUPS.flatMap((g) => g.members || []);
const unknown = listed.filter((key) => !CHARACTERS[key]);
if (unknown.length) {
  console.warn(`Listed in CHARACTER_GROUPS but no such fighter: ${unknown.join(", ")}`);
}

const duplicated = [...new Set(listed.filter((key, i) => CHARACTERS[key] && listed.indexOf(key) !== i))];
if (duplicated.length) {
  console.warn(`Listed in more than one CHARACTER_GROUPS category, keeping the first: ${duplicated.join(", ")}`);
}

const emptied = CHARACTER_GROUPS
  .filter((g) => !RESOLVED_GROUPS.some((r) => r.key === g.key))
  .map((g) => g.key);
if (emptied.length) {
  console.warn(`CHARACTER_GROUPS category with no usable members, hidden: ${emptied.join(", ")}`);
}

export function getCharacter(key) {
  return CHARACTERS[key];
}

// Drawable actors that are NOT fighters: nobody selects them, they have no kit
// and no card, but they own a full sprite set so anything that draws a fighter
// can draw them instead. Mahoraga is one because Megumi's ultimate turns into
// him (config_transform.js) rather than summoning him beside her.
export const SPRITE_ACTORS = {
  mahoraga: {
    name: "Mahoraga",
    fullName: "Eight-Handled Sword Divergent Sila Divine General Mahoraga",
    // Drawn markedly larger than any fighter — the point of the transformation
    // is that the thing on screen is enormous.
    scale: 0.95,
    heightCm: 260,
    theme: "#e8ecf8",
    shadow: "rgba(232, 236, 248, 0.4)",
    anims: SEMANTIC_ANIMS,
    // The karma wheel hanging over his head. It used to be drawn into all 31
    // poses, which meant it tumbled with him — a dodge roll sent it round with
    // the body when the whole point is that it hangs level, indifferent to what
    // he is doing. Drawn separately it keeps its own orientation, is keyed once
    // instead of 31 times, and can drift and bob on its own clock.
    prop: {
      sprite: "effect:mahoraga_wheel",
      // As a fraction of his drawn height: how big, and how far above his feet
      // the centre sits. Above 1 puts it clear of the top of his head.
      // Both as a fraction of his drawn height, measured off where the artist
      // had drawn it: across his standing poses the wheel spanned 0.25-0.26 of
      // his foot-to-head height and its centre sat 1.09 of that height above the
      // floor. Keeping those numbers means removing it changed nothing on
      // screen except that it now hangs on its own.
      size: 0.26,
      rise: 1.09,
      behind: true,        // drawn before the body, so his horns cross in front
      bob: { px: 7, rate: 1.1 },   // a slow hover, unrelated to his animation
      // Radians/sec. Off by default: the delivered art holds one orientation,
      // and a turning wheel is a statement about Mahoraga adapting rather than
      // idle decoration. The knob is here for when the ultimate wants it.
      spin: 0,
    },
  },
};

/** A fighter or a sprite-only actor, whichever owns this key. Anything that
 *  only needs to DRAW should look up through here rather than CHARACTERS, so
 *  actors work everywhere a fighter does. */
export function getActor(key) {
  return CHARACTERS[key] || SPRITE_ACTORS[key] || null;
}

export function animFor(charKey, animKey) {
  const char = getActor(charKey);
  return (char?.anims && char.anims[animKey]) || DEFAULT_ANIMS[animKey] || DEFAULT_ANIMS.idle;
}
