# Audio Requests — open requests

**Two rounds are open: Round 10 (the domain moment) and the four sounds the
staged fighters brought with them when they shipped.** Everything earlier is
delivered, wired in and recorded in
[audio-requests-history.md](audio-requests-history.md), along with every
round's audit, prompts and delivery record.

**The four "owed" sounds are now live gaps, not future ones.** They were
written down when Mechamaru, Yuki, Dagon and Kurourushi were staged and
unplayable. All four are on the select screen today — `STAGED_CHARACTER_KEYS`
is empty and the roster is 27 — so those four sounds are missing *in play*
rather than owed against future art. Dagon's domain sting is the loudest of
them: expanding Horizon of the Captivating Skandha currently plays the shared
sting and nothing else, because `DOMAIN_STING` names a key whose file does not
exist. See [Owed by the staged fighters](#owed-by-the-staged-fighters).

This file exists so there is somewhere obvious for the next request to go, and
so "is any audio still owed?" has a one-line answer rather than an 800-line
document to read.

**Voice is the one thing that could still be asked for** — every fighter has a
grunt trio and a KO cry, but nobody has per-character technique call-outs. A
full pass is 27 fighters × lines and should be scoped on its own. **Round 10
below takes the first, smallest slice of it**: the eight fighters who have a
Domain Expansion, saying the one line each of them is known for.

## Where the game actually is

| | |
|---|---|
| Sound files | **96** referenced, in `assets/sfx/` |
| Registry keys | **84** in `SFX` (`src/config_audio.js`) |
| With a generation prompt on file | **95 of 96** — `sound_shield.mp3` predates the rounds and has none |
| Fighters with a voice | **23 of 23** — six voice groups, three grunt variants each, plus a matching KO cry |
| Domain Expansions with their own sting | **7 of 7** |
| Element hit layers | **7 of 7** — fire, blood, steel, wind, sound, shadow, soul |
| Generic sounds left in `stage_fx.js` | **none** — all 26 calls name a specific hazard sound |

Categories and their mix levels: `combat` (22), `energy` (14), `voice` (12),
`domain` (10), `hazard` (10), `ui` (7), `stinger` (5), `movement` (4).

The things the original audit was written to fix are all fixed: one explosion no
longer covers every impact, no fighter is mute, the countdown / match end /
meter-full / respawn / Black Flash / 7:3-crit moments all sound, and the menus
no longer borrow swordfight clips. Round 9 closed the last of it: a fire hit no
longer sounds the same as a steel one, and the techniques whose whole identity
is a sound — Todo's clap, Gakuganji's chord, Mei Mei's crow — make it.

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
- **The Round 9 files are stereo**, where every earlier file is mono. They play
  the same and cost about 4 KB each extra; `tools/generate_sfx.py` writes mono,
  so re-rolling any of them converts it.

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
   A sound that loops in game also goes in `LOOPING` there, or it comes back
   trimmed and faded.
3. Register the key in `src/config_audio.js` with its category, and call it with
   `playSfx("key")` — or, for a held sound, `startLoop` in `src/audio.js`.

If a whole new round is ever commissioned, write it here as an open request and
move it across once it lands — the same relationship
[asset-requests.md](asset-requests.md) has with its history file. Delivered
files are uploaded to `assets/intake/sfx/` and moved into `assets/sfx/` as part
of that landing, the way art arrives through `assets/intake/`.

---

## Round 10 — the domain moment *(open)*

A Domain Expansion is the biggest thing in this game: it costs a full meter,
it stops the world for half a second, it swaps the entire backdrop, and it is
the move every one of these characters is known for. It currently sounds like
**one sting, one signature layer, and then seven seconds of the ordinary fight
mix** — no voice, no barrier, no room tone, and no sound at all when the
barrier comes down.

This round fixes that. It is deliberately two halves with different
deliverers: **10A is voice** and cannot come from the sound-effects generator;
**10B is sound effects** and can.

Everything in both halves is **already wired**. Every key below is registered
in `src/config_audio.js` and called from `src/domains.js`, and an undelivered
sound is dropped silently by `playSfx` — so the game sounds exactly as it does
today until the files land, and needs no code change on the day they do. Drop
the mp3s in `assets/sfx/` and the moment assembles itself.

### 10A — "Ryōiki Tenkai", per domain owner *(voice — 8 files)*

Eight fighters have a Domain Expansion. Each says the same two-part line the
show gives them: **領域展開** (*Ryōiki Tenkai*, "Domain Expansion") followed by
the domain's name. In Japanese, in character, one file each.

**One file per fighter, containing the whole line**, rather than a shared
"Ryōiki Tenkai" plus a separate name. The pacing between the two halves — how
long Gojo lets the pause sit, how fast Sukuna spits it — is a performance
decision, and splitting it would hand that to engine timing, which fires both
banners on the same frame and has no opinion worth having.

| Key | File | Fighter | Domain | Japanese | The read |
|---|---|---|---|---|---|
| `domainCallGojo` | `domain_call_gojo.mp3` | Gojo | Unlimited Void | 無量空処 *Muryōkūsho* | Unhurried, almost bored. He is not straining; he is doing the easiest thing he knows |
| `domainCallSukuna` | `domain_call_sukuna.mp3` | Sukuna | Malevolent Shrine | 伏魔御廚子 *Fukuma Mizushi* | Low, amused, contemptuous. A king naming a thing he has named a thousand times |
| `domainCallMegumi` | `domain_call_megumi.mp3` | Megumi | Chimera Shadow Garden | 嵌合暗翳庭 *Kanko Chōkatei* | Young, strained, committing everything. This costs him and it should sound like it |
| `domainCallMahito` | `domain_call_mahito.mp3` | Mahito | Self-Embodiment of Perfection | 自閉円頓裹 *Jihei Endonka* | Delighted. A child showing you something he made |
| `domainCallJogo` | `domain_call_jogo.mp3` | Jogo | Coffin of the Iron Mountain | 蓋棺鉄囲山 *Gaikan Tessaisen* | Guttural, volcanic, furious — a curse's throat, not a man's |
| `domainCallDagon` | `domain_call_dagon.mp3` | Dagon | Horizon of the Captivating Skandha | 蕩蘊平線 *Tōun Heisen* | Serene and wrong. Gentle, unbothered, like an announcement at a resort |
| `domainCallHakari` | `domain_call_hakari.mp3` | Hakari | Idle Death Gamble | 坐殺博徒 *Zasatsu Bakuto* | Loud, gleeful, showman — pitched to a crowd that is not there |
| `domainCallYuta` | `domain_call_yuta.mp3` | Yuta | Authentic Mutual Love | 真贋相愛 *Shingan Sōai* | Quiet and certain. Grief that has stopped arguing with itself |

**Check the Japanese before recording.** The kanji and romanizations above are
written from memory and at least two are contested in circulation
(Megumi's and Jogo's especially). The repo already has a standing rule for
this on the art side — *the authority is the character's page on
[jujutsu-kaisen.fandom.com](https://jujutsu-kaisen.fandom.com), not the text
in this file* — and it applies here. Fix the row when you check it.

**Delivery:** mono, dry, no music bed, no reverb — the sting and the barrier
underneath already supply the space, and a pre-reverbed line cannot be placed
in that mix. 1.5–3.0 s each; peak-normalised like every other file. Voice
category, trimmed at 1.1 gain so the line sits *above* its own sting rather
than inside it (`src/config_audio.js`).

**These cannot come from `tools/generate_sfx.py`.** That tool drives a
sound-*effects* endpoint; it does not speak. Route: a Japanese-speaking VA, or
a TTS/voice-cloning service driven by hand. Eight files is small enough to do
by hand and this is the wrong eight files to have sound synthetic.

### 10B — the barrier and the room *(sound effects — 4 files)*

These four go through the normal flow: they are written in the format
`tools/generate_sfx.py` parses, so
`ELEVENLABS_API_KEY=... python3 tools/generate_sfx.py` will make them. (That
tool now reads this file as well as the history file, precisely so an open
round can be generated before it lands.)

**`domain_captivating_skandha.wav`** · Dagon — Horizon of the Captivating Skandha · 2.0 s
```
A calm tropical shoreline opening into something enormous moving beneath the water, gentle surf and distant gulls with a vast low whale-like groan swelling underneath and pressure building, serene on the surface and deeply wrong below, about 2 seconds long with a long tail, stereo supernatural atmosphere layer, no music, no voice
```

**`domain_barrier.wav`** · the barrier closing over the stage · 1.2 s
```
An enormous curved barrier sealing shut around an arena, a deep dome-shaped whoomp with a glassy shimmering closure and a final locking thud, vast and enclosing, about 1.2 seconds long, stereo anime supernatural barrier, no music, no voice
```

**`domain_interior.wav`** · the room tone inside an open domain · 2.0 s, **seamless loop**
```
The inside of a vast supernatural enclosed space, a low airy pressurised drone with faint shifting harmonic overtones and a sense of enormous empty volume, oppressive and otherworldly but quiet enough to sit under combat, designed as a seamless loop with matching start and end so it can repeat without a click, exactly 2 seconds long, stereo ambient bed, no music, no voice
```

**`domain_rejected.wav`** · a second domain refused while one is open · 0.5 s
```
A cursed technique failing to take hold, a short choked energy swell that collapses inward with a dull dissonant clank, denied and final, about 0.5 seconds long, mono anime fighting game negative cue, no music, no voice
```

### What already changed in code

Three wiring gaps were closed while this round was written, all of them
audible today with the files that already exist:

- **`domainCollapse` has never been played.** `domain_collapse.mp3` has sat in
  `assets/sfx/` and in the registry since the round-8 pass; the barrier came
  down on a popup and silence. Now played from the domain entity's close path,
  which every exit runs through — expiry, the owner dying, the owner knocked
  off the stage.
- **`domainRejected`** is now called on the "A DOMAIN IS ALREADY OPEN" branch,
  which was silent.
- **`domainInterior`** starts with the barrier and stops on close *and* on
  match reset — a domain open when the match ends never runs its own close
  path, so without that a rematch would start inside the last match's room
  tone and never leave it.

The call-out **replaces the generic effort grunt** for these eight fighters
(`playGrunt` still runs for anyone else who ever gains a domain), so a
delivered line does not double up with a wordless shout.

---

## Owed by the staged fighters

Round 15 of [asset-requests.md](asset-requests.md) added four fighters —
Mechamaru, Yuki Tsukumo, Dagon and Kurourushi — whose kits were built before
their art. Their audio was wired as far as it could go without new files: all
four are in `GRUNT_GROUPS` (`src/audio.js`) and so have a grunt trio and a KO
cry from the existing six voice groups.

> **These four have since shipped, so this section is no longer a forecast.**
> `STAGED_CHARACTER_KEYS` is empty, the roster is 27, and all four are on the
> select screen. The wording below was written when nothing in a match could
> reach them; today every one of these sounds is a **silent gap in play** —
> `playSfx` drops an unregistered or undelivered key without complaint, which
> is what has kept it invisible. Dagon's domain sting is the most audible
> absence and is folded into [Round 10B](#10b--the-barrier-and-the-room-sound-effects--4-files)
> above, where it has a generation prompt. The three element layers below
> still need one.

| Key | Where it belongs | What it is |
|---|---|---|
| `hitWater` | `ELEMENT_HIT_SFX.water` | The eighth element hit layer, for Dagon. A heavy wet slap and displacement — a body hit by a mass of water, not a splash in a puddle |
| `hitMachine` | `ELEMENT_HIT_SFX.machine` | The ninth, for Mechamaru. Steel on steel with a servo whine under it and a short vent of pressure after |
| `hitSwarm` | `ELEMENT_HIT_SFX.swarm` | The tenth, for Kurourushi. A dry chitinous crunch and a scatter of skittering — insects, close and many |
| `domainCaptivatingSkandha` | `DOMAIN_STING` (`src/domains.js`) | The eighth domain sting, for Horizon of the Captivating Skandha. Surf and gulls opening into something enormous moving underwater — the domain's whole trick is that it sounds like a holiday |

The three element layers are the same brief as Round 9's seven (see the history
file for those prompts and their mix levels): **seasoning under the impact, not
the impact** — short, dry, and gain-trimmed to about 0.5.

`DOMAIN_STING` already names the Skandha key, and `ELEMENT_HIT_SFX` deliberately
does **not** name the three hit layers yet: an entry pointing at a file that is
not there logs a failed fetch on every hit, which reads as an error and trips
the smoke tests. Adding the three lines is part of landing the files, not part
of staging the fighters.
