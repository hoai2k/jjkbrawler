# Audio Requests — open requests

**One round outstanding: the element and signature layer, 15 files.** The
previous sound-effect round is delivered and wired in; its audit, prompts and
delivery record are in [audio-requests-history.md](audio-requests-history.md).

## Open — element hit layers and signature one-shots (15 files)

Comes out of the effects work in [effects-plan.md](effects-plan.md): hits now
carry an element (fire, blood, steel…) visually, and every call site for these
sounds is **already wired** — `playSfx` treats an unregistered name as silence,
so each file switches on the moment it is generated and registered in
`src/config_audio.js` with the key noted below. Generate through the normal
flow (step 1–3 under "Adding a sound"); keep each under ~1 s unless noted.

### Element hit layers

Played quietly UNDER the normal hit sound whenever a hit of that element
connects (`ELEMENT_HIT_SFX`, `src/config_audio.js` → `combat.js`). They are
seasoning, not the meal: short, mid-quiet, no music, no voice.

- **`hit_fire.mp3`** (`hitFire`) · flame catching on impact · ~0.5 s
  ```
  a short burst of fire igniting on impact, whoomph of flame with a crackle tail, no explosion boom, tight and dry
  ```
- **`hit_blood.mp3`** (`hitBlood`) · a heavy wet splat · ~0.4 s
  ```
  a thick heavy wet splat, dense liquid impact with a short spatter tail, visceral but not gory squelch
  ```
- **`hit_steel.mp3`** (`hitSteel`) · metal glancing off metal · ~0.4 s
  ```
  a sharp steel-on-steel glance, bright metallic ring cut short, sword clash without the swing
  ```
- **`hit_wind.mp3`** (`hitWind`) · a blade of air slicing through · ~0.4 s
  ```
  a fast slicing gust, sharp air whip crack with a hollow whoosh tail, no voice
  ```
- **`hit_sound.mp3`** (`hitSound`) · a resonant concussive tone · ~0.6 s
  ```
  a deep resonant concussive tone hitting like a struck gong crossed with a bass drop, brief, musical edge
  ```
- **`hit_shadow.mp3`** (`hitShadow`) · dark matter whipping past · ~0.5 s
  ```
  a dark whooshing impact, low smoky rush with a faint reversed tail, ominous, no scream
  ```
- **`hit_soul.mp3`** (`hitSoul`) · something touching the soul · ~0.6 s
  ```
  an eerie shimmering impact, cold glassy ripple with a detuned harmonic tail, unsettling, quiet
  ```

### Signature one-shots

Each already has its call site; the key is what to register.

- **`boogie_clap.mp3`** (`boogieClap`) · Todo's clap — the whole technique is
  this sound · ~0.7 s
  ```
  a single enormous dry hand clap in a large hall, sharp transient, big natural reverb tail, nothing else
  ```
- **`power_chord.mp3`** (`powerChord`) · Gakuganji's Power Chord actually
  sounding like one · ~1.2 s
  ```
  a single aggressive distorted electric guitar power chord, palm-muted strike then ringing out, raw amp tone
  ```
- **`crow_caw.mp3`** (`crowCaw`) · Mei Mei's crow leaving her hand · ~0.6 s
  ```
  a single harsh crow caw with a flutter of wingbeats, close and dry
  ```
- **`paper_flutter.mp3`** (`paperRustle`) · Reggie's receipts becoming things ·
  ~0.6 s
  ```
  a fast flutter of many paper slips fanning and snapping taut, dry crisp rustle ending in a thump
  ```
- **`soul_reshape.mp3`** (`soulReshape`) · Mahito's Idle Transfiguration · ~0.8 s
  ```
  a wet clay-like squelch morphing with a bone creak and a faint chime, unsettling body-horror texture, not gory
  ```
- **`seam_crack.mp3`** (`seamCrack`) · Nanami's 7:3 seam snapping onto the
  target · ~0.5 s
  ```
  a precise glass crack snapping along a line, clean sharp fracture with a faint metallic ping, surgical
  ```
- **`rct_chime.mp3`** (`healChime`) · Reverse Cursed Technique beginning · ~0.9 s
  ```
  a warm gentle chime swell with soft rising sparkle motes, healing shimmer, calm, no melody
  ```
- **`fire_burn_loop.mp3`** (`fireBurnLoop`) · optional bed under Jogo's burn
  ticks and Furnace Shell · ~2 s, seamless loop · **the one file here with no
  call site yet** — wire it like the shield loop (`startShieldLoop`,
  `src/audio.js`) when it lands
  ```
  a small steady fire burning, soft crackle loop, even level, seamless loop, no wind
  ```

**Voice is already covered** — all 23 fighters have grunt trios and KO cries.
If per-character technique call-outs are ever wanted, that is a separate,
much larger round (23 fighters × lines) and should be scoped on its own.

This file exists so there is somewhere obvious for the next request to go, and
so "is any audio still owed?" has a one-line answer rather than a 600-line
document to read.

## Where the game actually is

| | |
|---|---|
| Sound files | **81**, in `assets/sfx/` |
| Registry keys | **70** in `SFX_FILES` (`src/config_audio.js`) |
| With a generation prompt on file | **80 of 81** — `sound_shield.mp3` predates the round and has none |
| Fighters with a voice | **23 of 23** — six voice groups, three grunt variants each, plus a matching KO cry |
| Domain Expansions with their own sting | **7 of 7** |
| Generic sounds left in `stage_fx.js` | **none** — all 26 calls name a specific hazard sound |

Categories and their mix levels: `combat` (13), `voice` (12), `domain` (10),
`hazard` (10), `energy` (8), `ui` (7), `stinger` (5), `movement` (4).

The things the original audit was written to fix are all fixed: one explosion no
longer covers every impact, no fighter is mute, the countdown / match end /
meter-full / respawn / Black Flash / 7:3-crit moments all sound, and the menus
no longer borrow swordfight clips.

## Music

[music-requests.md](music-requests.md) specifies one battle theme per stage.
**All 20 are delivered** and present in `assets/music/boards/`, matching
`BOARD_TRACKS` in `src/config_music.js` exactly — no track listed without a file,
no file without a listing. The menu theme and the two mode tracks are in
`assets/music/`. That document carries no status line of its own, which is worth
knowing before reading it as an open request.

### Leftovers worth knowing about

- **14 unreferenced files** sit in `assets/sfx/` — `sound_punch.mp3`,
  `sound_whoosh.mp3`, `sound_sword_hit*.mp3` and friends. They are the original
  15-file palette the round replaced, and nothing in `src/` names them any more.
  Left in place rather than deleted: they cost ~0.7 MB, they are never fetched
  (the loader only requests registry entries), and they are the only copies of
  the pre-round sound of the game.
- **`sound_shield.mp3`** is the one survivor of that set still in use, which is
  why it has no prompt. If it is ever re-rolled it needs one written first.

## Adding a sound

1. Write the request into
   [audio-requests-history.md](audio-requests-history.md), in the shape the
   entries there already use — **`filename.wav`** · what it is · length, then a
   fenced prompt. That file is not only a record: `tools/generate_sfx.py`
   parses it, so a prompt written anywhere else cannot be generated or re-rolled.
2. Generate it:
   ```sh
   ELEVENLABS_API_KEY=... python3 tools/generate_sfx.py
   ```
   Idempotent — it skips files that already exist unless `--force`. Output is
   trimmed, length-capped, peak-normalised to -3 dBFS and encoded to mono MP3.
3. Register the key in `src/config_audio.js` with its category, and call it with
   `playSfx("key")`.

If a whole new round is ever commissioned, write it here as an open request and
move it across once it lands — the same relationship
[asset-requests.md](asset-requests.md) has with its history file.
