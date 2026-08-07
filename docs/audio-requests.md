# Audio Requests — sound-effect generation prompts

Companion to `docs/asset-requests.md`, same idea: an audit of what the game
actually needs, with a ready-to-paste prompt per file.

Everything below is measured against the code as it stands, not guessed —
counts come from grepping `playSfx()` call sites and the `sfx:` fields in
`src/characters.js`.

---

## Where the game is today

**15 sound files** back **15 registry keys** in `SFX_FILES` (`src/audio.js`),
covering a 23-fighter roster with domains, ultimates, summons and a full menu
system. Three concrete consequences:

**1. One explosion is doing most of the work.** `blast` is requested from
**25 call sites in code plus 28 move configs** — it plays for a projectile
popping, a counter triggering, a summon appearing, a meteor landing and a
Domain Expansion. `punch` covers 32 move configs. The palette is so narrow
that most of the game sounds the same.

**2. Nine of the 23 live fighters have no voice at all.** `GRUNT_GROUPS` maps
only 14 characters to one of 4 shared grunt files. These fighters are silent
when they attack:

> **gojo, yuji, megumi, inumaki, nanami, yuta, geto, toji, reggie**

The 14 that do have a voice share 4 files between them — every "big" character
(hakari, todo, sukuna, choso, gakuganji) makes the identical noise.

**3. Several moments make no sound at all.** Verified silent in code:

| Moment | Where | Status |
|---|---|---|
| **READY… / GO!** countdown | `main.js:109,131` | `main.js` contains **zero** `playSfx` calls |
| **GAME!** at match end | `main.js:175` | silent |
| **Ground jump** | `fighter.js:678` | dust particles only — air jump gets a whoosh, ground jump gets nothing |
| **Ultimate meter filling** | `ui.js` `renderMeter` | HUD prints "ULTIMATE READY" with no audio cue |
| **Respawn** | `fighter.js:337` | silent |
| **Black Flash** (Yuji signature) | `combat.js:470` | popup only, no sound |
| **7:3 crit** (Nanami signature) | `combat.js:460` | popup only, no sound |
| **All 7 Domain Expansions** | `domains.js:65` | every one plays the same `ult` clip as a normal ultimate |

The menu works but borrows combat sounds — cursor movement is a pitched-up
`whoosh`, confirming is a `slash`, settings toggles are a sword `block`.

---

## Delivery spec

- **Format:** WAV (24-bit / 48 kHz) preferred, or MP3 at 192 kbps+. The loader
  handles both — existing files are a mix.
- **Channels:** mono for combat/UI one-shots (the engine has no panning, so
  stereo just doubles file size). Stereo is fine for domain/ultimate stings.
- **Trim:** **no leading silence.** The engine plays a one-shot the instant a
  hit lands, so even 30 ms of head padding reads as lag. Two files currently
  need a hardcoded offset to work around this (`SFX_START` in `audio.js`, for
  `landing` and `whoosh`) — please don't add more.
- **Loudness:** normalise peaks to about **-3 dBFS**, and keep loudness
  consistent *within* a tier. The engine scales volume per call, so a clip
  that arrives twice as loud as its neighbours can't be fixed without a code
  change.
- **Length:** stay inside the per-sound budget below. Combat one-shots that
  run long overlap themselves during combos and turn to mush (there is a
  24-voice cap, and long clips eat it).
- **Dry, no music, no reverb tail** unless the entry asks for it. Anything
  with a long tail fights the background track.
- **No speech.** Grunts are non-verbal exertion only, no words.
- **Naming:** exactly the filename given, into `assets/sfx/`.

### Prompt style suffix

Append to every prompt unless the entry says otherwise:

> dry punchy game sound effect, tight transient, no music, no reverb tail,
> no speech, mono, clean

---

## How these get wired in

Each new file needs one line in `SFX_FILES` (`src/audio.js`):

```js
hitLight: "assets/sfx/hit_light.wav",
```

Call sites then use `playSfx("hitLight")`, or a move config sets
`sfx: "hitLight"`. **I'll do the wiring** — deliver the files and I'll add the
keys, repoint the existing call sites, and add sounds to the silent moments.
Nothing breaks in the meantime: an unregistered key is a no-op, and the game
keeps using the current files until I switch them over.

Tiers are ordered by how much each one improves the game per file delivered.
**Tier 1 and 2 are the ones that matter** — 22 files that fix the "everything
sounds the same" problem and the silent moments. Tiers 3–5 are depth.

---

## Tier 1 — Core combat (12 files)

These fire constantly. Right now they're covered by 4 clips.

| File | When it fires | Length | Prompt |
|---|---|---|---|
| `hit_light.wav` | Every jab / light attack connecting | 0.2 s | "a sharp quick punch impact on a body, tight snappy thud with a little slap on the front, anime fighting game light hit" |
| `hit_medium.wav` | Standard attack connecting | 0.3 s | "a solid punch landing on a torso, meaty low thump with a crisp attack, anime fighting game hit" |
| `hit_heavy.wav` | Heavy / smash attacks | 0.45 s | "a devastating heavy punch impact, deep bassy body blow with a cracking transient and a short low-end boom, anime fighting game heavy hit" |
| `hit_crit.wav` | Nanami's 7:3 crit band — **currently silent** | 0.5 s | "a perfect critical strike impact, sharp metallic ring layered over a deep body impact, a bright glassy shimmer on the tail, satisfying precision hit" |
| `black_flash.wav` | Yuji's Black Flash proc — **currently silent** | 0.9 s | "a reality-cracking impact, distorted low boom with a sharp glassy shatter and a brief warped ringing sub-bass drop, ominous and heavy, anime power moment" |
| `slash_light.wav` | Fast blade attacks (Yuta, Maki, Toji) | 0.25 s | "a fast katana slash cutting air and flesh, sharp metallic whisk with a wet cutting edge, quick" |
| `slash_heavy.wav` | Heavy blade attacks | 0.4 s | "a powerful greatsword cleave, heavy metallic slash with a deep whoosh and a solid cutting impact" |
| `swing_whiff.wav` | An attack that hits nothing | 0.25 s | "a fast arm swinging through empty air, sharp airy whoosh, no impact" |
| `guard_hit.wav` | Attack absorbed by a shield | 0.3 s | "an impact absorbed by an energy barrier, muffled thud with a bright shimmering ring on top, magical shield deflection" |
| `guard_break.wav` | Shield depleted → dizzy (**currently a pitched-up KO sound**) | 0.8 s | "a glass energy barrier shattering, bright crystalline crack breaking into falling shards, with a low pressure release underneath" |
| `parry.wav` | Counter triggers (Gojo's Infinity, reflects) | 0.6 s | "a perfect parry, a bright ringing metallic clang with a sharp time-stopping shimmer, crisp and satisfying" |
| `launch.wav` | A hit sends someone flying at high knockback | 0.5 s | "a powerful launching blow sending a body flying, deep impact followed by a fast rising doppler whoosh away from the listener" |

---

## Tier 2 — Currently silent moments (10 files)

Each of these is a moment the game presents visually with nothing on the audio
track.

| File | When it fires | Length | Prompt |
|---|---|---|---|
| `jump.wav` | Ground jump — **silent today** | 0.2 s | "a light athletic jump takeoff, soft cloth and shoe scuff with a quick air push, subtle" |
| `double_jump.wav` | Air jump | 0.3 s | "a mid-air second jump on a burst of energy, soft airy pulse with a gentle magical shimmer" |
| `land_soft.wav` | Landing from a short hop | 0.2 s | "a light footstep landing on a hard surface, soft scuff thud" |
| `land_heavy.wav` | Landing from height / after a launch | 0.4 s | "a heavy body landing hard on stone, deep thud with debris scatter and a small dust puff" |
| `dash.wav` | Ground dash (double tap) | 0.3 s | "a fast burst of forward movement, sharp low whoosh with a scraping foot push-off" |
| `respawn.wav` | Fighter returns after a KO — **silent today** | 1.0 s | "a character materialising back into the world, a warm rising magical shimmer settling into a soft chime, hopeful" |
| `meter_full.wav` | Ultimate meter reaches max — **silent today** | 1.2 s | "a power meter reaching full charge, a rising energy hum resolving into a bright confident chime with a subtle choir swell, triumphant and noticeable but not loud" |
| `countdown_ready.wav` | The "READY…" banner — **silent today** | 0.8 s | "a deep resonant gong strike announcing a duel about to begin, ominous anticipation, single hit with a short tail" |
| `countdown_go.wav` | The "GO!" banner — **silent today** | 0.6 s | "a sharp bright bell hit signalling a fight to start, urgent and energetic, single strike" |
| `match_end.wav` | The "GAME!" banner — **silent today** | 1.5 s | "a match-ending flourish, a decisive low impact followed by a short triumphant brass and taiko sting, conclusive" |

---

## Tier 3 — Character voices (18 files)

Non-verbal exertion only — **no words, no anime catchphrases.** These fire on
specials via `playGrunt(charKey)`.

Currently 4 files cover 14 characters and 9 characters have nothing. The plan
below is **6 voice groups × 3 variants** so repeated specials don't loop the
identical sample, and so the 9 silent fighters get a voice.

Length **0.4–0.7 s** for all of these. Prompt suffix for the whole tier:

> a single short non-verbal exertion grunt, dry close-mic vocal, no words, no
> music, anime fighting game voice

| Files | Covers | Prompt (before the suffix) |
|---|---|---|
| `grunt_young_male_1/2/3.wav` | **gojo, yuji, megumi, yuta, inumaki** — all currently silent | "a young man in his late teens giving a sharp confident effort grunt while attacking" |
| `grunt_adult_male_1/2/3.wav` | **nanami, toji, geto, reggie** — all currently silent | "a calm adult man giving a low restrained effort grunt while striking, controlled and unbothered" |
| `grunt_big_1/2/3.wav` | hakari, todo, sukuna, choso, gakuganji | "a large powerful man giving a deep booming battle shout while swinging, heavy and aggressive" |
| `grunt_female_1/2/3.wav` | maki, nobara, momo, meimei, uro | "a young woman giving a sharp determined effort grunt while attacking, fierce" |
| `grunt_monster_1/2/3.wav` | jogo, hanami | "a large inhuman creature giving a guttural rumbling snarl, throaty and non-human" |
| `grunt_animal_1/2/3.wav` | panda, mahito | "a heavy animalistic huff and growl, bestial and short" |

If 18 is too many for one pass, **the 6 files for young-male and adult-male are
the priority** — they cover the 9 fighters that are currently mute, including
Gojo, who is the default cursor position and the most-played character.

### KO cries (6 files, optional)

Same six groups, played when a fighter is knocked out. Length 0.8–1.2 s.

> `ko_young_male.wav`, `ko_adult_male.wav`, `ko_big.wav`, `ko_female.wav`,
> `ko_monster.wav`, `ko_animal.wav`

Prompt: "a single short pained cry of being knocked away, fading as it recedes
into the distance, non-verbal, anime fighting game defeat voice" + the group's
voice description.

---

## Tier 4 — Menu and UI (7 files)

The menu currently borrows combat sounds. These are quiet, quick, and should
feel like UI rather than fighting.

| File | When it fires | Length | Prompt |
|---|---|---|---|
| `ui_move.wav` | Cursor moves between fighters / options | 0.1 s | "a soft crisp UI cursor tick, short synthetic blip, subtle and clean" |
| `ui_select.wav` | Confirming a menu button | 0.2 s | "a positive UI confirmation click, short bright two-tone chime" |
| `ui_back.wav` | Backing out of a screen | 0.2 s | "a soft UI cancel sound, short descending two-tone blip, gentle" |
| `ui_lock_in.wav` | A player locks in their fighter | 0.6 s | "a decisive character-select lock-in, a solid stamp impact with a bright energetic shimmer rising after it, satisfying commitment" |
| `ui_denied.wav` | Trying to start before everyone is ready | 0.3 s | "a soft UI error buzz, short muted low double blip, discouraging but not harsh" |
| `ui_start.wav` | Leaving the menu to begin a match | 1.0 s | "a match-starting flourish, a rising energetic swell resolving into a bright impact, exciting" |
| `ui_pause.wav` | Opening or closing the pause menu | 0.3 s | "a game pausing, a short muffled downward whoosh with a soft filtered thud" |

---

## Tier 5 — Cursed energy, summons, domains (11 files)

Where the game's identity lives, and where `blast` is currently doing the most
undeserved work.

| File | When it fires | Length | Prompt |
|---|---|---|---|
| `energy_charge.wav` | Holding a chargeable heavy | 1.5 s, **loopable** | "cursed energy gathering, a low rising electrical hum with crackling arcs building in intensity, seamless loop, ominous" |
| `projectile_fire.wav` | Launching an energy projectile | 0.4 s | "firing a ball of cursed energy, a compressed woosh with a low electrical thrum leaving the hand" |
| `projectile_hit.wav` | Energy projectile connecting | 0.5 s | "a ball of cursed energy bursting on impact, sharp energetic pop with a low bass thump and crackling residue" |
| `explosion_small.wav` | Small bursts, traps springing | 0.6 s | "a small tight explosion, punchy debris burst with a short low tail" |
| `explosion_large.wav` | Meteors, big ultimate impacts | 1.5 s | "a huge devastating explosion, enormous low-end boom with a long rumbling debris tail and a sharp cracking transient" |
| `summon_appear.wav` | A shikigami / curse is summoned | 0.8 s | "a creature being summoned out of shadow, a low swelling whoosh with a dark magical shimmer and a bestial growl at the end" |
| `summon_attack.wav` | A summon lunges and bites | 0.4 s | "a beast lunging bite, sharp snapping jaws with a wet snarl, quick" |
| `ultimate_activate.wav` | Any ultimate firing | 1.5 s | "a devastating ultimate technique activating, a deep charging swell exploding into a powerful energy release, cinematic and heavy" |
| `domain_expansion.wav` | **All 7 domains share one clip today** | 3.0 s | "a reality-warping domain unfolding, a vast low rumbling swell with an inverted reversed shimmer, a deep resonant bell strike, and the world sealing shut around the listener, ominous and enormous, stereo" |
| `domain_collapse.wav` | A domain ending | 1.5 s | "a sealed domain shattering and reality snapping back, glass-like cracking with a reversed whoosh and a low pressure release" |
| `install_activate.wav` | A transformation buff turning on (True Form, Gorilla Mode) | 1.2 s | "a character powering up and transforming, a rising energy surge with a heavy pulsing bass swell and crackling aura, intense" |

### Per-domain stings (7 files, stretch goal)

The seven domains defined in `src/domains.js` currently all announce with the
same clip. If you want each to feel distinct, add a **1.5–2 s** signature layer
to sit under the shared `domain_expansion.wav`:

| File | Domain | Prompt |
|---|---|---|
| `domain_unlimited_void.wav` | Gojo — Unlimited Void | "infinite information flooding a mind, a vast airy void tone with layered whispering static swelling into overwhelming silence, cold and endless" |
| `domain_malevolent_shrine.wav` | Sukuna — Malevolent Shrine | "a shrine of bone and slaughter manifesting, deep ritual drums with wet bone-cracking and a menacing low choir, brutal" |
| `domain_shadow_garden.wav` | Megumi — Chimera Shadow Garden | "a garden of living shadow spreading, a soft dark liquid rush with rising inky whooshes and distant animal growls" |
| `domain_self_embodiment.wav` | Mahito — Self-Embodiment of Perfection | "souls being reshaped, an unsettling warped choral drone with wet stretching and morphing textures, deeply wrong" |
| `domain_iron_mountain.wav` | Jogo — Coffin of the Iron Mountain | "a volcanic mountain sealing shut, immense grinding stone with roaring magma and a deep suffocating heat rumble" |
| `domain_idle_death_gamble.wav` | Hakari — Idle Death Gamble | "a pachinko parlour of fate exploding into life, cascading metal balls with bright manic jackpot bells and gaudy arcade fanfare" |
| `domain_mutual_love.wav` | Yuta — Authentic Mutual Love | "an overwhelming outpouring of love and grief, a soaring sorrowful string swell with a warm protective hum underneath, beautiful and sad" |

---

## Suggested delivery order

1. **Tier 3's 6 male-voice files** — 9 fighters including Gojo are literally
   mute right now. Biggest gap per file.
2. **Tier 1** (12 files) — breaks up the one-explosion-for-everything problem
   in the moment-to-moment game.
3. **Tier 2** (10 files) — fills the silent moments. `meter_full` and
   `countdown_go` are the two players will notice most.
4. **Tier 4** (7 files) — makes menus stop sounding like swordfights.
5. **Tier 5** (11 files) — the identity pass.
6. Per-domain stings and KO cries last.

Totals: **58 files** for tiers 1–5, plus 13 optional. Tiers 1–3 alone
(40 files) would transform how the game feels.

---

## Delivery checklist

| Tier | Files | Delivered | Wired up |
|---|---|---|---|
| 1 — core combat | 12 | ☐ | ☐ |
| 2 — silent moments | 10 | ☐ | ☐ |
| 3 — voices | 18 (+6 KO) | ☐ | ☐ |
| 4 — menu / UI | 7 | ☐ | ☐ |
| 5 — energy / summons / domains | 11 (+7 stings) | ☐ | ☐ |
