// ---------------------------------------------------------------------------
// Sound-effect configuration — the registry, the mix, and the categories.
//
// Every sound the game can play is declared here as
//   key: { file, category, gain?, start?, loop? }
// and referenced from code as `playSfx("key")` or from a move config as
// `sfx: "key"`. A key with no entry is a silent no-op, so a missing delivery
// degrades to silence rather than an error.
//
// `gain` is a per-sound trim applied on top of its category, for the cases
// where one clip lands hotter or quieter than its neighbours. Prefer fixing
// the file; use gain when the file is right and only its role in the mix is
// wrong.
//
// Generation prompts for all of these live in docs/audio-requests-history.md —
// that round is delivered, but the prompts are what tools/generate_sfx.py reads
// to regenerate or re-roll a file, so they stay live input.
// ---------------------------------------------------------------------------

export const SFX_DIR = "assets/sfx/";

// ---------------------------------------------------------------- the mix
//
// Relative levels between the two buses and between categories. The Settings
// sliders scale the two MASTER values; everything else here is fixed balance
// that a player never sees.
//
// SFX sits well above music on purpose: this is a fighting game, and the hit
// feedback is information, not decoration. Music is atmosphere and should duck
// under a busy exchange rather than compete with it.
export const AUDIO_MIX = {
  // Default slider positions (0..1). Players override these in Settings.
  musicVolume: 0.28,
  sfxVolume: 0.20,

  // Hard ceiling applied after everything else, so a stacked frame — several
  // hits, a grunt and a hazard in the same 100 ms — cannot clip.
  master: 0.9,

  // Per-category trim. Combat is the reference at 1.0; everything else is
  // placed relative to it.
  categories: {
    combat: 1.00,   // hits, slashes, blocks — the loudest, most frequent layer
    movement: 0.55, // jumps, landings, dashes: constant, must not fatigue
    voice: 0.80,    // grunts sit just under their own hit so they blend
    ui: 0.45,       // menus should never be as loud as a fight
    stinger: 0.85,  // countdown, match end, meter full — occasional and big
    energy: 0.90,   // projectiles, summons, installs
    domain: 1.00,   // the biggest moments in the game
    hazard: 0.65,   // stage gimmicks are ambience with teeth, not attacks
  },
};

// How many one-shots may overlap. Past this, new calls are dropped rather than
// queued — a fighting game would otherwise pile up dozens of voices per second
// during a combo and turn to mush.
export const MAX_VOICES = 24;

// --------------------------------------------------------------- registry

export const SFX = {
  // ---- Tier 1: core combat
  hitLight: { file: "hit_light.mp3", category: "combat" },
  hitMedium: { file: "hit_medium.mp3", category: "combat" },
  hitHeavy: { file: "hit_heavy.mp3", category: "combat" },
  hitCrit: { file: "hit_crit.mp3", category: "combat" },
  blackFlash: { file: "black_flash.mp3", category: "combat", gain: 1.1 },
  slashLight: { file: "slash_light.mp3", category: "combat" },
  slashHeavy: { file: "slash_heavy.mp3", category: "combat" },
  swingWhiff: { file: "swing_whiff.mp3", category: "combat", gain: 0.7 },
  guardHit: { file: "guard_hit.mp3", category: "combat" },
  guardBreak: { file: "guard_break.mp3", category: "combat", gain: 1.1 },
  parry: { file: "parry.mp3", category: "combat", gain: 1.1 },
  launch: { file: "launch.mp3", category: "combat" },

  // ---- Tier 2: movement and match flow
  jump: { file: "jump.mp3", category: "movement" },
  landSoft: { file: "land_soft.mp3", category: "movement" },
  landHeavy: { file: "land_heavy.mp3", category: "movement" },
  dash: { file: "dash.mp3", category: "movement" },
  respawn: { file: "respawn.mp3", category: "stinger", gain: 0.8 },
  meterFull: { file: "meter_full.mp3", category: "stinger" },
  countdownReady: { file: "countdown_ready.mp3", category: "stinger" },
  countdownGo: { file: "countdown_go.mp3", category: "stinger" },
  matchEnd: { file: "match_end.mp3", category: "stinger" },

  // ---- Tier 3: character voices. Groups are picked in GRUNT_GROUPS (audio.js)
  // and one variant is drawn at random per call, so a repeated special does not
  // loop the identical sample.
  gruntYoungMale: { file: ["grunt_young_male_alt_2.mp3", "grunt_young_male_alt_4.mp3", "grunt_young_male_alt_6.mp3"], category: "voice" },
  gruntAdultMale: { file: ["grunt_adult_male_alt_5.mp3", "grunt_adult_male_alt_6.mp3"], category: "voice" },
  gruntBig: { file: "grunt_big_alt_6.mp3", category: "voice" },
  gruntFemale: { file: ["grunt_female_alt_1.mp3", "grunt_female_alt_2.mp3", "grunt_female_alt_3.mp3"], category: "voice" },
  gruntMonster: { file: "grunt_monster_alt_3.mp3", category: "voice" },
  gruntAnimal: { file: "grunt_animal_2.mp3", category: "voice" },

  koYoungMale: { file: "ko_young_male_alt_2.mp3", category: "voice" },
  koAdultMale: { file: "ko_adult_male_alt_3.mp3", category: "voice" },
  koBig: { file: "ko_big_alt_1.mp3", category: "voice" },
  koFemale: { file: "ko_female_alt_2.mp3", category: "voice" },
  koMonster: { file: "ko_monster_alt_2.mp3", category: "voice" },
  koAnimal: { file: "ko_animal.mp3", category: "voice" },

  // ---- Tier 4: menus
  uiMove: { file: "ui_move.mp3", category: "ui" },
  uiSelect: { file: "ui_select.mp3", category: "ui" },
  uiBack: { file: "ui_back.mp3", category: "ui" },
  uiLockIn: { file: "ui_lock_in.mp3", category: "ui", gain: 1.2 },
  uiDenied: { file: "ui_denied.mp3", category: "ui" },
  uiStart: { file: "ui_start.mp3", category: "ui", gain: 1.2 },
  uiPause: { file: "ui_pause.mp3", category: "ui" },

  // ---- Tier 5: cursed energy, summons, domains
  energyCharge: { file: "energy_charge.mp3", category: "energy", loop: true, gain: 0.7 },
  projectileFire: { file: "projectile_fire.mp3", category: "energy" },
  projectileHit: { file: "projectile_hit.mp3", category: "energy" },
  explosionSmall: { file: "explosion_small.mp3", category: "energy" },
  explosionLarge: { file: "explosion_large.mp3", category: "energy" },
  summonAppear: { file: "summon_appear.mp3", category: "energy" },
  summonAttack: { file: "summon_attack.mp3", category: "energy" },
  ultimate: { file: "ultimate_activate.mp3", category: "domain" },
  domainExpansion: { file: "domain_expansion.mp3", category: "domain" },
  domainCollapse: { file: "domain_collapse.mp3", category: "domain" },
  installActivate: { file: "install_activate.mp3", category: "energy" },

  // Per-domain signature layers, played under domainExpansion.
  domainUnlimitedVoid: { file: "domain_unlimited_void.mp3", category: "domain", gain: 0.8 },
  domainMalevolentShrine: { file: "domain_malevolent_shrine.mp3", category: "domain", gain: 0.8 },
  domainShadowGarden: { file: "domain_shadow_garden.mp3", category: "domain", gain: 0.8 },
  domainSelfEmbodiment: { file: "domain_self_embodiment.mp3", category: "domain", gain: 0.8 },
  domainIronMountain: { file: "domain_iron_mountain.mp3", category: "domain", gain: 0.8 },
  domainIdleDeathGamble: { file: "domain_idle_death_gamble.mp3", category: "domain", gain: 0.8 },
  domainMutualLove: { file: "domain_mutual_love.mp3", category: "domain", gain: 0.8 },
  // The eighth, for Dagon. Owed since round 15 staged him, delivered with
  // round 10 — DOMAIN_STING has always named this key.
  domainCaptivatingSkandha: { file: "domain_captivating_skandha.mp3", category: "domain", gain: 0.8 },

  // ---- The domain moment, round 10 (docs/audio-requests-history.md). Every
  // key here was registered ahead of its file — an undelivered sound is dropped
  // silently (audio.js) — so the sequence played exactly as it had until the
  // mp3s landed, and needed no code change on the day they did.
  //
  // The call-out: "領域展開" and the domain's name, in the owner's own voice.
  // Per CHARACTER rather than per voice group — eight fighters have a domain
  // and this is the one line each of them is known for, so the grunt-group
  // sharing that covers 27 fighters' effort noises is the wrong economy here.
  domainCallGojo: { file: "domain_call_gojo_alt_relaxed.mp3", category: "voice", gain: 1.1 },
  domainCallSukuna: { file: "domain_call_sukuna.mp3", category: "voice", gain: 1.1 },
  domainCallMegumi: { file: "domain_call_megumi.mp3", category: "voice", gain: 1.1 },
  domainCallMahito: { file: "domain_call_mahito.mp3", category: "voice", gain: 1.1 },
  domainCallJogo: { file: "domain_call_jogo.mp3", category: "voice", gain: 1.1 },
  domainCallDagon: { file: "domain_call_dagon_alt_deep.mp3", category: "voice", gain: 1.1 },
  domainCallHakari: { file: "domain_call_hakari.mp3", category: "voice", gain: 1.1 },
  domainCallYuta: { file: "domain_call_yuta.mp3", category: "voice", gain: 1.1 },
  // ---- Inumaki's cursed speech, round 11. The command itself, in Japanese,
  // in his voice — see MOVE_CALL below for how these reach a move. He is the
  // one fighter whose entire technique is his voice, and until these landed he
  // fired the wordless young-male grunt he shares with four other students.
  callInumakiBlastAway: { file: "call_inumaki_blast_away.mp3", category: "voice", gain: 1.1 },
  callInumakiDontMove: { file: "call_inumaki_dont_move.mp3", category: "voice", gain: 1.1 },
  callInumakiGetCrushed: { file: "call_inumaki_get_crushed.mp3", category: "voice", gain: 1.1 },
  callInumakiUltimate: { file: "call_inumaki_ultimate.mp3", category: "voice", gain: 1.1 },

  // The barrier itself, and the room it encloses.
  domainBarrier: { file: "domain_barrier.mp3", category: "domain", gain: 0.9 },
  domainInterior: { file: "domain_interior.mp3", category: "domain", loop: true, gain: 0.45 },
  // A second domain refused while one is open — the popup has never had a sound.
  domainRejected: { file: "domain_rejected.mp3", category: "ui", gain: 0.9 },

  // ---- Tier 6: stage hazards (Active Boards)
  hazardTelegraph: { file: "hazard_telegraph.mp3", category: "hazard" },
  hazardWaterSurge: { file: "hazard_water_surge.mp3", category: "hazard" },
  hazardFangSnap: { file: "hazard_fang_snap.mp3", category: "hazard" },
  hazardBloom: { file: "hazard_bloom.mp3", category: "hazard" },
  hazardBell: { file: "hazard_bell.mp3", category: "hazard" },
  hazardFirePatch: { file: "hazard_fire_patch.mp3", category: "hazard", loop: true, gain: 0.7 },
  hazardElectricArc: { file: "hazard_electric_arc.mp3", category: "hazard" },
  hazardTrafficPass: { file: "hazard_traffic_pass.mp3", category: "hazard" },
  hazardSignalChirp: { file: "hazard_signal_chirp.mp3", category: "hazard" },
  hazardCurseLatch: { file: "hazard_curse_latch.mp3", category: "hazard" },

  // ---- Tier 7a: element hit layers, played UNDER the normal hit sound (see
  // ELEMENT_HIT_SFX below). Seasoning, not the meal: combat.js already scales
  // them by damage, and the trim here keeps even a big hit's layer under the
  // impact it is dressing.
  hitFire: { file: "hit_fire.mp3", category: "combat", gain: 0.5 },
  hitBlood: { file: "hit_blood.mp3", category: "combat", gain: 0.5 },
  hitSteel: { file: "hit_steel.mp3", category: "combat", gain: 0.5 },
  hitWind: { file: "hit_wind.mp3", category: "combat", gain: 0.5 },
  hitSound: { file: "hit_sound.mp3", category: "combat", gain: 0.5 },
  hitShadow: { file: "hit_shadow.mp3", category: "combat", gain: 0.5 },
  hitSoul: { file: "hit_soul.mp3", category: "combat", gain: 0.5 },
  // The three owed since round 15 staged Dagon, Mechamaru and Kurourushi. They
  // were the only fighters on the roster whose element hit nothing at all.
  hitWater: { file: "hit_water.mp3", category: "combat", gain: 0.5 },
  hitMachine: { file: "hit_machine.mp3", category: "combat", gain: 0.5 },
  hitSwarm: { file: "hit_swarm.mp3", category: "combat", gain: 0.5 },

  // ---- Tier 7b: signature one-shots. Each is the sound of one technique, so
  // they sit with the layer they belong to rather than in a group of their own.
  boogieClap: { file: "boogie_clap.mp3", category: "combat", gain: 1.1 },
  seamCrack: { file: "seam_crack.mp3", category: "combat" },
  powerChord: { file: "power_chord.mp3", category: "energy" },
  crowCaw: { file: "crow_caw.mp3", category: "energy" },
  paperRustle: { file: "paper_flutter.mp3", category: "energy" },
  soulReshape: { file: "soul_reshape.mp3", category: "energy" },
  healChime: { file: "rct_chime.mp3", category: "energy", gain: 0.9 },
  // Held under anything currently on fire — burn ticks, Furnace Shell — the
  // way `shield` sits under a raised guard. See the fire loop in audio.js.
  fireBurnLoop: { file: "fire_burn_loop.mp3", category: "energy", loop: true, gain: 0.55 },

  // ---- Originals kept for the shield loop, which has no replacement yet.
  shield: { file: "sound_shield.mp3", category: "combat", gain: 0.6, loop: true },
};

// Element hit layers — played UNDER the normal hit sound when a hit's
// fxElement (config_fx.js / characters.js) matches, at reduced gain. All ten
// are delivered and registered in SFX above; playSfx treats an unregistered
// name as silence, so an element listed here with no entry up there is simply
// silent. Remove a row to silence that element.
//
// `feather` — Mei Mei's crow and Axe Rush — is the one fxElement in the game
// with no row here, and is deliberately absent rather than forgotten: no layer
// has been requested for it. Her crow already has crowCaw as a fire sound, so
// she is the one case where the element is not silent for want of this table.
export const ELEMENT_HIT_SFX = {
  fire: "hitFire",
  blood: "hitBlood",
  steel: "hitSteel",
  wind: "hitWind",
  sound: "hitSound",
  shadow: "hitShadow",
  soul: "hitSoul",
  water: "hitWater",
  machine: "hitMachine",
  swarm: "hitSwarm",
};

// The line a fighter speaks when they use a particular move, played INSTEAD of
// their wordless effort grunt (`playGrunt`, audio.js). Keyed by character and
// then by the move's own `name` from characters.js, so a row reads like the
// character sheet and survives a move being moved between slots.
//
// This is the general form of what `DOMAIN_CALL` (domains.js) does for the
// eight Domain Expansions: a fighter with a line for this move says it, and
// everyone else keeps the grunt, so a move is never silent. Nothing here is
// Inumaki-shaped except the rows — any fighter who is ever given a technique
// call-out goes in the same map.
//
// The names carry curly quotes because the kit does (“Blast Away”, not "Blast
// Away"). A row whose name matches no move would silently never play, so
// audio.js checks them against the roster at load and says so.
// The Domain Expansion call-out — "Ryōiki Tenkai", and the domain's name — in
// the owner's own voice. Keyed by CHARACTER rather than by move, unlike
// MOVE_CALL below: a fighter has at most one Domain Expansion, and the line is
// a person speaking rather than a property of a particular move. An unlisted
// key is silence, so a fighter who gains a domain later is mute rather than
// borrowing someone else's voice.
export const DOMAIN_CALL = {
  gojo: "domainCallGojo",
  sukuna: "domainCallSukuna",
  megumi: "domainCallMegumi",
  mahito: "domainCallMahito",
  jogo: "domainCallJogo",
  dagon: "domainCallDagon",
  hakari: "domainCallHakari",
  yuta: "domainCallYuta",
};

export const MOVE_CALL = {
  inumaki: {
    "“Blast Away”": "callInumakiBlastAway",
    "“Don't Move”": "callInumakiDontMove",
    "“Get Crushed”": "callInumakiGetCrushed",
    "“GET TWISTED AND BLAST AWAY”": "callInumakiUltimate",
  },
};

// ------------------------------------------------------- alternate takes
//
// Other recordings of a sound that is already in the game, kept beside it so
// the two can be heard next to each other in the audio workbench
// (/workbench/?edit=audio). **Nothing here is ever played by the game.**
//
// The reason they exist rather than simply replacing what shipped: whether a
// take is good is the one question no tool in this repo can answer. A
// generator can confirm a line exists, is the right length and is reachable
// from a move; it cannot tell you that Gojo sounds bored instead of effortless.
// So a re-roll lands HERE first and is promoted by hand — swap the filename in
// the SFX entry above, update SPOKEN_LINES if it is a spoken line, and let
// tools/check_voice.mjs confirm the timing still adds up.
//
// `file` takes the same shape as an SFX entry's: a string, or several
// interchangeable files for a group that draws one per call.
export const VOICE_ALTERNATES = {
  // Gojo's line was promoted to the relaxed take; the other two stay here so
  // the choice is reversible without going through the history.
  domainCallGojo: [
    { name: "Flat", file: "domain_call_gojo_alt_even.mp3",
      note: "even and unperformed, stability 1.0 — a man saying it to himself" },
    { name: "Original", file: "domain_call_gojo.mp3",
      note: "the first delivery — casual, and the longest of the three" },
  ],
  domainCallDagon: [
    { name: "Original", file: "domain_call_dagon.mp3",
      note: "the first delivery — gentle, before the 0.86 resample" },
  ],

  // ---- every take that exists for a voice group and is not currently in it.
  //
  // Listed exhaustively ON PURPOSE. The bench is now where takes get pruned as
  // well as chosen, and a file nobody can see is a file nobody can delete — so
  // the rejected rounds stay visible until somebody says otherwise, rather than
  // quietly accumulating in assets/sfx/ where the only way to find them is a
  // directory listing.
  // ---- every take that exists for a voice group and is not currently in it.
  //
  // Listed exhaustively ON PURPOSE. The bench is where takes get pruned as well
  // as chosen, and a file nobody can see is a file nobody can delete.
  //
  // **This list is now short because it was USED.** One pass through the bench
  // deleted 33 files and moved 2, which is what the rounds of alternates were
  // for: a wide net cast, judged by ear, and hauled in. What is left is the
  // survivors and the round-14 pairs bred from them — every "Round 14" entry
  // below was cast from the same voice, pitch and settings as the take its
  // group actually kept, rather than from a fresh guess.
  gruntYoungMale: [
    { name: "Round 14", file: ["grunt_young_male_alt_7.mp3", "grunt_young_male_alt_8.mp3"],
      note: "two more from Ryunosuke, the voice all three live takes came from" },
    { name: "Round 12", file: ["grunt_young_male_alt_1.mp3"],
      note: "the kiai round — the only one of it left in this group" },
  ],
  gruntAdultMale: [
    { name: "Round 14", file: ["grunt_adult_male_alt_7.mp3", "grunt_adult_male_alt_8.mp3"],
      note: "two more from Akira; Nagi's entire round-12 casting was deleted or reassigned" },
    { name: "Round 13", file: ["grunt_adult_male_alt_4.mp3"],
      note: "wordless bank — non-lexical, one utterance each" },
  ],
  gruntBig: [
    { name: "Round 14", file: ["grunt_big_alt_7.mp3", "grunt_big_alt_8.mp3"],
      note: "two more from Sho at pitch 0.94, matching the live take" },
    { name: "Round 13", file: ["grunt_big_alt_4.mp3"],
      note: "wordless bank — non-lexical, one utterance each" },
    { name: "Round 12", file: ["grunt_big_alt_1.mp3"],
      note: "the kiai round — the only one of it left in this group" },
  ],
  gruntFemale: [
    { name: "Round 14", file: ["grunt_female_alt_4.mp3", "grunt_female_alt_5.mp3"],
      note: "two more from Rina, the voice all three live takes came from" },
    // Adopted, not generated. These were cast as ADULT MALE grunts in round 12
    // and judged in the bench to sit better here — which is a thing only a
    // listener can decide, and the reason the bench grew a move control.
    // The filenames are left alone deliberately: renaming an asset to match
    // where it ended up breaks every prompt record that produced it.
    { name: "Adopted from gruntAdultMale", file: ["grunt_adult_male_alt_2.mp3", "grunt_adult_male_alt_3.mp3"],
      note: "Nagi's round-12 takes, moved here by ear — the names are their origin, not their group" },
  ],
  gruntMonster: [
    { name: "Round 14", file: ["grunt_monster_alt_4.mp3", "grunt_monster_alt_5.mp3"],
      note: "two more from Shimura at pitch 0.85, matching the live take" },
    { name: "Round 13", file: ["grunt_monster_alt_1.mp3", "grunt_monster_alt_2.mp3"],
      note: "wordless bank — non-lexical, one utterance each" },
  ],
  // The animal groups went the other way from every human one: their
  // voice-cast alternates were all deleted and the round-8 effects-endpoint
  // take is what survived. A model imitating a beast beats an actor playing
  // one — so round 14 asked generate_sfx.py for these, not generate_voice.py.
  gruntAnimal: [
    { name: "Round 14", file: ["grunt_animal_alt_1.mp3", "grunt_animal_alt_2.mp3"],
      note: "effects endpoint, varied off grunt_animal_2 — the take that survived" },
  ],
  koYoungMale: [
    { name: "Round 14", file: ["ko_young_male_alt_4.mp3", "ko_young_male_alt_5.mp3"],
      note: "both keep the SHARP cry the group kept; its falling and breathless takes were deleted" },
  ],
  koAdultMale: [
    { name: "Round 14", file: ["ko_adult_male_alt_4.mp3", "ko_adult_male_alt_5.mp3"],
      note: "both keep the BREATHLESS falling cry the group kept" },
    { name: "Round 13", file: ["ko_adult_male_alt_1.mp3", "ko_adult_male_alt_2.mp3"],
      note: "wordless bank — non-lexical, one utterance each" },
  ],
  koBig: [
    { name: "Round 14", file: ["ko_big_alt_4.mp3", "ko_big_alt_5.mp3"],
      note: "two more deep bellows from Sho at pitch 0.94" },
    { name: "Round 13", file: ["ko_big_alt_2.mp3", "ko_big_alt_3.mp3"],
      note: "wordless bank — non-lexical, one utterance each" },
  ],
  koFemale: [
    { name: "Round 14", file: ["ko_female_alt_4.mp3", "ko_female_alt_5.mp3"],
      note: "both keep the sharp cry of pain the group kept" },
    { name: "Round 13", file: ["ko_female_alt_1.mp3", "ko_female_alt_3.mp3"],
      note: "wordless bank — non-lexical, one utterance each" },
  ],
  koMonster: [
    { name: "Round 14", file: ["ko_monster_alt_4.mp3", "ko_monster_alt_5.mp3"],
      note: "two more guttural roars from Shimura at pitch 0.85" },
    { name: "Round 13", file: ["ko_monster_alt_1.mp3", "ko_monster_alt_3.mp3"],
      note: "wordless bank — non-lexical, one utterance each" },
  ],
  koAnimal: [
    { name: "Round 14", file: ["ko_animal_alt_4.mp3", "ko_animal_alt_5.mp3"],
      note: "effects endpoint, varied off ko_animal — every voice-cast take here was deleted" },
  ],
};

// ------------------------------------------------- spoken lines as wind-up
//
// A spoken line is an INTRODUCTION, not a sound laid over a move that has
// already happened. A fighter who says something holds the pose while they say
// it and the attack lands near the end of the line, so the voice builds the
// moment instead of commenting on it after the fact.
//
// **The delay is read from here and never measured from the audio**, which is
// the whole reason these lengths are written down rather than taken off the
// Audio element. Timing must be identical with the sound off, with the SFX
// slider at zero, on a machine that has not finished downloading the mp3, and
// on the first cast of a match before anything is cached. A move whose frame
// data depends on whether audio loaded is a move nobody can learn.
//
// Lengths are the DELIVERED lengths, in seconds. Re-rolling a line changes its
// length, so a re-roll means updating its row — `node tools/check_voice.mjs`
// compares these against the files and says which ones drifted.
export const SPOKEN_LINES = {
  domainCallGojo: 2.83,
  domainCallSukuna: 2.52,
  domainCallMegumi: 2.48,
  domainCallMahito: 3.03,
  domainCallJogo: 2.80,
  domainCallDagon: 2.59,
  domainCallHakari: 2.03,
  domainCallYuta: 2.42,
  callInumakiBlastAway: 1.14,
  callInumakiDontMove: 0.73,
  callInumakiGetCrushed: 0.97,
  callInumakiUltimate: 2.10,
};

// How far into a line its move actually lands.
//
// `fraction` is the dial the whole feature turns on: 1.0 waits for the line to
// finish before anything happens, 0.8 lets the attack overlap the last fifth of
// it so the two land together, and 0 restores the old behaviour of everything
// firing on the same frame as the shout. The clamps are what keep it a range
// rather than a straight multiplier: `min` stops a very short line from being
// no wind-up at all, and `max` is the hard ceiling on how long any one move may
// stall a match — Gojo's line is the longest at 3.28 s and would otherwise hold
// the game for 2.6 s on its own.
// `commit` is how much of the LINE an opponent may still interrupt: 0.5 means
// you can shout someone down during the first half of what they are saying,
// and after that the move is going to happen. By the time a line is finishing
// its move is already underway, and taking it back then would read as the game
// reneging on something it had visibly started.
//
// Measured against the spoken line rather than the wind-up because that is the
// thing a player actually perceives — "you can interrupt them early in the
// sentence" is a rule someone can hear. It is capped by the wind-up itself, so
// it can never outlast the move it guards.
//
// 1.0 leaves a move interruptible right up to the moment it fires; 0 makes one
// safe as soon as it is announced.
export const SPOKEN_TIMING = {
  fraction: 0.8,
  min: 0.35,
  max: 2.2,
  commit: 0.5,
};

// Legacy keys from before the round-8 sound pass. Call sites and move configs
// still name these; each maps to whichever new sound now covers that role, so
// the old names keep working and can be migrated at leisure.
export const SFX_ALIASES = {
  punch: "hitMedium",
  melee: "hitMedium",
  blast: "explosionSmall",
  block: "guardHit",
  slash: "slashLight",
  miss: "swingWhiff",
  landing: "landSoft",
  gone: "launch",
  whoosh: "swingWhiff",
  ult: "ultimate",
};
