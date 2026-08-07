// All 17 fighters: stats, sprite-frame mappings, attack profiles, specials,
// ultimates, passives. Design rationale for every kit lives in docs/characters/.
//
// Frame keys are sheet cells "r{row}c{col}" resolved via assets/sprites/manifest.json.
// Sheet rows: 0 idle/poses, 1 run, 2 air, 3 technique effects, 4 crouch.

// Roster grouping used by the fighter-select grid. Three buckets, sized 6/6/5:
// the Tokyo class, everyone else on the human side (faculty, Kyoto, the
// non-sorcerer), and the curses plus Geto, who is human but fights entirely
// through the curses he manipulates.
export const CHARACTER_GROUPS = [
  {
    key: "students",
    label: "Tokyo Jujutsu Students",
    members: ["yuta", "maki", "megumi", "nobara", "inumaki", "panda"],
  },
  {
    key: "sorcerers",
    label: "Sorcerers",
    members: ["gojo", "nanami", "todo", "momo", "hakari", "toji"],
  },
  {
    key: "curses",
    label: "Curses and Curse Users",
    members: ["sukuna", "mahito", "jogo", "hanami", "geto"],
  },
];

// Grid order, move-list order and asset-load order all follow the groups, so
// there is one roster ordering rather than two that can drift apart.
export const CHARACTER_KEYS = CHARACTER_GROUPS.flatMap((g) => g.members);

// Anim defaults; characters override entries whose sheet cells differ.
export const DEFAULT_ANIMS = {
  idle: { frames: ["idle_a", "idle_b"], fps: 2.2, loop: true },
  run: { frames: ["run_a", "run_b"], fps: 10, loop: true },
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
  airLight: { frames: ["attack_air"], fps: 8, loop: false },
  sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
  upHeavy: { frames: ["attack_up"], fps: 6, loop: false },
  downHeavy: { frames: ["r2c2"], fps: 6, loop: false },
  charge: { frames: ["charge"], fps: 2, loop: true },
  specialNeutral: { frames: ["r3c1"], fps: 8, loop: false },
  specialSide: { frames: ["r3c0"], fps: 8, loop: false },
  specialDown: { frames: ["r3c2"], fps: 8, loop: false },
  ult: { frames: ["r3c2", "r3c3"], fps: 7, loop: true },
  dizzy: { frames: ["dizzy"], fps: 1, loop: true },
  win: { frames: ["victory"], fps: 1, loop: true },
};

export const CHARACTERS = {
  // ------------------------------------------------------------------ GOJO
  gojo: {
    name: "Gojo",
    epithet: "The Honored One",
    theme: "#62dcff",
    shadow: "rgba(88, 220, 255, 0.36)",
    scale: 0.60,
    stats: { speed: 468, airSpeed: 380, accel: 3000, jump: 800, airJumps: 1, weight: 0.92, friction: 0.86 },
    anims: {
      idle: { frames: ["idle_a", "idle_b"], fps: 2.2, loop: true },
      run: { frames: ["run_a", "run_b"], fps: 10, loop: true },
      jump: { frames: ["jump_rise"], fps: 1, loop: true },
      fall: { frames: ["fall"], fps: 1, loop: true },
      hurt: { frames: ["hurt"], fps: 1, loop: true },
      shield: { frames: ["guard"], fps: 1, loop: true },
      ledge: { frames: ["ledge_hang"], fps: 1, loop: true },
      airLight: { frames: ["attack_air"], fps: 8, loop: false },
      upHeavy: { frames: ["attack_up"], fps: 6, loop: false },
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["r0c3"], fps: 6, loop: false },
      downHeavy: { frames: ["r2c2"], fps: 6, loop: false },
      specialNeutral: { frames: ["r2c0"], fps: 8, loop: false },
      specialSide: { frames: ["r3c0"], fps: 8, loop: false },
      specialDown: { frames: ["r3c3"], fps: 4, loop: true },
      charge: { frames: ["charge"], fps: 2, loop: true },
      dizzy: { frames: ["dizzy"], fps: 1, loop: true },
      win: { frames: ["victory"], fps: 1, loop: true },
      ult: { frames: ["r3c1", "r3c2"], fps: 7, loop: true },
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
    passive: { id: "limitlessGuard", name: "Infinity (Passive)", desc: "Neutral stance is wrapped in Infinity: shield loses 45% less health when struck." },
    ai: { style: "balanced", range: 340 },
  },

  // ------------------------------------------------------------------ YUTA
  yuta: {
    name: "Yuta",
    epithet: "Rika's Beloved",
    theme: "#9fc7ff",
    shadow: "rgba(159, 199, 255, 0.36)",
    scale: 0.60,
    stats: { speed: 402, airSpeed: 318, accel: 2540, jump: 760, airJumps: 1, weight: 1.02, friction: 0.83 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c1"], fps: 8, loop: false },
      specialSide: { frames: ["r3c2"], fps: 8, loop: false },
      specialDown: { frames: ["r2c3"], fps: 4, loop: true },
      ult: { frames: ["r3c2", "r3c3"], fps: 7, loop: true },
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
    passive: { id: "rikaBond", name: "Bond of Love", desc: "Past 100% damage, Rika's fury raises Yuta's damage by 12%." },
    ai: { style: "balanced", range: 300 },
  },

  // ---------------------------------------------------------------- HAKARI
  hakari: {
    name: "Hakari",
    epithet: "The Gambler",
    theme: "#ff62cf",
    shadow: "rgba(255, 98, 207, 0.38)",
    scale: 0.60,
    stats: { speed: 415, airSpeed: 305, accel: 2560, jump: 745, airJumps: 1, weight: 1.08, friction: 0.82 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c0"], fps: 8, loop: false },
      specialSide: { frames: ["r1c3", "r3c0"], fps: 10, loop: false },
      specialDown: { frames: ["r4c3"], fps: 4, loop: false },
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
      name: "Idle Death Gamble: JACKPOT", type: "install",
      desc: "The reels line up — 4:11 of infinite cursed energy. Wounds erase themselves and nothing staggers him.",
      p: { duration: 8, healPerSec: 3.2, armor: true, dmgMul: 1.15, speedMul: 1.1, color: "#ff62cf", label: "JACKPOT", aura: "effect:aura_pink", domainSprite: "effect:domain_gamble" },
    },
    passive: { id: "gamblersFlow", name: "Gambler's Flow", desc: "Lives for the rush — gains ultimate meter 30% faster than anyone." },
    ai: { style: "rush", range: 190 },
  },

  // ------------------------------------------------------------------ MAKI
  maki: {
    name: "Maki",
    epithet: "Heavenly Restricted",
    theme: "#69d0a8",
    shadow: "rgba(105, 208, 168, 0.34)",
    scale: 0.60,
    stats: { speed: 452, airSpeed: 340, accel: 2860, jump: 775, airJumps: 1, weight: 1.0, friction: 0.86 },
    anims: {
      light: { frames: ["r0c2", "r1c2"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r1c2"], fps: 8, loop: false },
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
    epithet: "Ten Shadows",
    theme: "#7c8cff",
    shadow: "rgba(124, 140, 255, 0.36)",
    scale: 0.60,
    stats: { speed: 418, airSpeed: 330, accel: 2620, jump: 765, airJumps: 1, weight: 0.96, friction: 0.84 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c2"], fps: 8, loop: false },
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
        p: { speed: 520, vy: -120, gravity: 260, r: 38, dur: 1.0, dmg: 11, base: 360, growth: 7.0, angle: 0.5, color: "#7c8cff", effect: "snare", label: "Nue", sprite: "summon:nue", spriteH: 132 },
      },
      side: {
        name: "Divine Dogs", type: "wave", cooldown: 1.3,
        desc: "Twin wolves loosed from shadow sprint the floor and tear through whatever they catch.",
        p: { speed: 640, r: 34, dur: 1.15, dmg: 12, base: 380, growth: 7.2, angle: 0.34, color: "#3a3f68", count: 2, gap: 0.14, effect: "snare", label: "Divine Dogs", sprites: ["summon:divineDogWhite", "summon:divineDogBlack"], spriteH: 118 },
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
    passive: { id: "tenShadows", name: "Ten Shadows Technique", desc: "Shikigami do the fighting: summon specials build 20% extra ultimate meter." },
    ai: { style: "zoner", range: 380 },
  },

  // ---------------------------------------------------------------- NOBARA
  nobara: {
    name: "Nobara",
    epithet: "Straw Doll Sorceress",
    theme: "#d86a4a",
    shadow: "rgba(216, 106, 74, 0.36)",
    scale: 0.60,
    stats: { speed: 400, airSpeed: 308, accel: 2480, jump: 750, airJumps: 1, weight: 0.98, friction: 0.83 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["r2c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r0c2"], fps: 8, loop: false },
      specialSide: { frames: ["r3c0"], fps: 8, loop: false },
      specialDown: { frames: ["r3c2"], fps: 6, loop: false },
      ult: { frames: ["r3c2", "r3c3"], fps: 7, loop: true },
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
    epithet: "Cursed Speech User",
    theme: "#d7d9e7",
    shadow: "rgba(215, 217, 231, 0.32)",
    scale: 0.60,
    stats: { speed: 408, airSpeed: 312, accel: 2500, jump: 755, airJumps: 1, weight: 0.98, friction: 0.83 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
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
    epithet: "Not Just Any Panda",
    theme: "#8ea0b8",
    shadow: "rgba(142, 160, 184, 0.36)",
    scale: 0.57,
    stats: { speed: 356, airSpeed: 275, accel: 2220, jump: 730, airJumps: 1, weight: 1.28, friction: 0.78 },
    anims: {
      light: { frames: ["r2c0", "r1c3"], fps: 11, loop: false },
      sideHeavy: { frames: ["r3c1"], fps: 6, loop: false },
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
    epithet: "My Brother",
    theme: "#b66cff",
    shadow: "rgba(182, 108, 255, 0.38)",
    scale: 0.59,
    stats: { speed: 392, airSpeed: 295, accel: 2400, jump: 750, airJumps: 1, weight: 1.18, friction: 0.8 },
    anims: {
      light: { frames: ["r0c2", "r2c0"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
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
    epithet: "Witch of the Wind",
    theme: "#b7b8ff",
    shadow: "rgba(183, 184, 255, 0.36)",
    scale: 0.59,
    stats: { speed: 428, airSpeed: 372, accel: 2760, jump: 770, airJumps: 2, weight: 0.88, friction: 0.84 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      run: { frames: ["run_a", "run_b"], fps: 9, loop: true },
      jump: { frames: ["jump_rise"], fps: 1, loop: true },
      fall: { frames: ["fall"], fps: 1, loop: true },
      sideHeavy: { frames: ["r2c0"], fps: 6, loop: false },
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
    epithet: "The Salaryman",
    theme: "#ffd35a",
    shadow: "rgba(255, 205, 82, 0.32)",
    scale: 0.60,
    stats: { speed: 388, airSpeed: 285, accel: 2380, jump: 715, airJumps: 1, weight: 1.14, friction: 0.8 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["r2c0", "r2c1"], fps: 8, loop: false },
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
    epithet: "The Sorcerer Killer",
    theme: "#a8aeb8",
    shadow: "rgba(168, 174, 184, 0.34)",
    scale: 0.60,
    stats: { speed: 465, airSpeed: 350, accel: 2980, jump: 780, airJumps: 1, weight: 1.04, friction: 0.87 },
    anims: {
      light: { frames: ["r0c3", "r1c2"], fps: 13, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
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
        name: "Serpent Feint", type: "feint", cooldown: 1.7,
        desc: "A ghost-quiet backstep that flows straight into a lunging counter-slash.",
        p: { back: 260, lunge: 560, delay: 0.16, dur: 0.16, ox: 70, oy: -90, w: 220, h: 96, dmg: 13, base: 430, growth: 7.0, angle: 0.3, iframes: 0.28, label: "Serpent Feint", sfx: "slash" },
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
    epithet: "King of Curses",
    theme: "#ff4c55",
    shadow: "rgba(255, 67, 75, 0.4)",
    scale: 0.60,
    stats: { speed: 435, airSpeed: 322, accel: 2700, jump: 755, airJumps: 1, weight: 1.06, friction: 0.83 },
    anims: {
      light: { frames: ["r0c2", "r3c0"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c1"], fps: 6, loop: false },
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
      name: "Domain Expansion: Malevolent Shrine", type: "domain",
      desc: "The shrine manifests without barrier walls — Cleave and Dismantle rain on everything in the domain, guard or no guard.",
      p: { duration: 3.6, tickRate: 0.22, dmgTick: 3.4, base: 140, growth: 3.6, finalBase: 780, ignoresShield: true, color: "#ff4c55", label: "MALEVOLENT SHRINE", sprite: "effect:shrine" },
    },
    passive: { id: "kingsContempt", name: "King's Contempt", desc: "Scents weakness: +10% damage against opponents past 80%." },
    ai: { style: "rush", range: 260 },
  },

  // ---------------------------------------------------------------- MAHITO
  mahito: {
    name: "Mahito",
    epithet: "Soul Shaper",
    theme: "#b56cff",
    shadow: "rgba(177, 92, 255, 0.4)",
    scale: 0.60,
    stats: { speed: 422, airSpeed: 328, accel: 2600, jump: 760, airJumps: 1, weight: 0.98, friction: 0.82 },
    anims: {
      light: { frames: ["r0c2", "r0c3"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c1"], fps: 8, loop: false },
      specialSide: { frames: ["r3c3"], fps: 8, loop: false },
      specialDown: { frames: ["r3c2"], fps: 8, loop: false },
      ult: { frames: ["r3c2", "r3c1"], fps: 8, loop: true },
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
        name: "Polymorphic Soul Isomer", type: "wave", cooldown: 2.4,
        desc: "Pinches off a shard of his own soul: a scuttling isomer that bursts on contact.",
        p: { speed: 300, r: 30, dur: 2.2, dmg: 12, base: 400, growth: 6.8, angle: 0.6, color: "#8f5cd8", count: 1, explode: 70, effect: "soulMark", label: "Isomer", sprite: "effect:soul_isomer", spriteH: 96 },
      },
    },
    ultimate: {
      name: "Instant Spirit Body of Distorted Killing", type: "install",
      desc: "His true form — a streamlined killing body. Faster, crueler, and nothing blocks it.",
      p: { duration: 8, speedMul: 1.3, dmgMul: 1.12, unblockable: true, color: "#b56cff", label: "TRUE FORM", aura: "effect:aura_violet" },
    },
    passive: { id: "soulShaper", name: "Idle Transfiguration (Passive)", desc: "Every hit brushes the soul: marked victims take 18% more damage from all sources." },
    ai: { style: "rush", range: 220 },
  },

  // ------------------------------------------------------------------ GETO
  geto: {
    name: "Geto",
    epithet: "Curse Collector",
    theme: "#7d58d8",
    shadow: "rgba(125, 88, 216, 0.38)",
    scale: 0.60,
    stats: { speed: 398, airSpeed: 305, accel: 2440, jump: 745, airJumps: 1, weight: 1.04, friction: 0.82 },
    anims: {
      light: { frames: ["r0c3", "r3c0"], fps: 12, loop: false },
      sideHeavy: { frames: ["r3c1"], fps: 6, loop: false },
      shield: { frames: ["guard"], fps: 1, loop: true },
      specialNeutral: { frames: ["r3c2"], fps: 8, loop: false },
      specialSide: { frames: ["r3c0"], fps: 8, loop: false },
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
        p: { speed: 420, vy: -10, r: 26, dur: 1.1, dmg: 8, base: 280, growth: 5.8, angle: 0.4, color: "#7d58d8", count: 3, spread: 170, homing: 130, effect: "curseDrain", label: "Spirit Volley", spritePool: ["effect:curse_a", "effect:curse_b", "effect:curse_c", "effect:curse_d"], spriteH: 96 },
      },
      side: {
        name: "Rainbow Dragon", type: "wave", cooldown: 1.7,
        desc: "His prized heavy-hitter surges along the ground and bites like a landslide.",
        p: { speed: 520, r: 46, dur: 1.2, dmg: 15, base: 470, growth: 7.6, angle: 0.42, color: "#9d7dff", count: 1, label: "Rainbow Dragon", sprite: "effect:curse_dragon", spriteH: 170 },
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
    epithet: "Disaster of Flame",
    theme: "#ff7a2f",
    shadow: "rgba(255, 122, 47, 0.42)",
    scale: 0.60,
    stats: { speed: 368, airSpeed: 288, accel: 2280, jump: 720, airJumps: 1, weight: 1.16, friction: 0.79 },
    anims: {
      light: { frames: ["r2c0", "r0c3"], fps: 11, loop: false },
      sideHeavy: { frames: ["r3c0"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c1"], fps: 8, loop: false },
      specialSide: { frames: ["r2c2"], fps: 8, loop: false },
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
        name: "Coffin of the Iron Mountain", type: "install", cooldown: 5.5,
        desc: "Wraps himself in furnace heat: armored, and searing to the touch.",
        p: { duration: 3.4, armor: true, contactBurn: true, color: "#ff7a2f", label: "IRON MOUNTAIN", aura: "effect:aura_orange" },
      },
    },
    ultimate: {
      name: "Maximum: Meteor", type: "meteor",
      desc: "He pulls a piece of the sky down on the arena. The crater is the point.",
      p: { dmg: 36, base: 940, growth: 11, r: 200, fallTime: 1.1, burnField: 2.6, color: "#ff7a2f", label: "MAXIMUM: METEOR", sprite: "effect:meteor", spriteH: 310 },
    },
    passive: { id: "disasterFlame", name: "Disaster Curse", desc: "Born of humanity's fear of eruption: his burns tick 50% harder." },
    ai: { style: "zoner", range: 400 },
  },

  // ---------------------------------------------------------------- HANAMI
  hanami: {
    name: "Hanami",
    epithet: "Grief of the Forest",
    theme: "#9bb36b",
    shadow: "rgba(155, 179, 107, 0.4)",
    scale: 0.58,
    stats: { speed: 358, airSpeed: 278, accel: 2220, jump: 730, airJumps: 1, weight: 1.24, friction: 0.78 },
    anims: {
      light: { frames: ["r2c0"], fps: 9, loop: false },
      sideHeavy: { frames: ["r2c1"], fps: 6, loop: false },
      downHeavy: { frames: ["r2c2"], fps: 6, loop: false },
      specialNeutral: { frames: ["r3c2"], fps: 8, loop: false },
      specialSide: { frames: ["r2c2"], fps: 8, loop: false },
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
};

// A fighter that never made it into a group would silently vanish from the
// select screen, so say so loudly instead of shipping an unreachable character.
const ungrouped = Object.keys(CHARACTERS).filter((key) => !CHARACTER_KEYS.includes(key));
if (ungrouped.length) {
  console.warn(`Not listed in CHARACTER_GROUPS, so unselectable: ${ungrouped.join(", ")}`);
}

export function getCharacter(key) {
  return CHARACTERS[key];
}

export function animFor(charKey, animKey) {
  const char = CHARACTERS[charKey];
  return (char.anims && char.anims[animKey]) || DEFAULT_ANIMS[animKey] || DEFAULT_ANIMS.idle;
}
