# Audio Requests — open requests

**One small round is open: round 12, the grab pack — three sounds.** Everything
before it is delivered, wired in and recorded in
[audio-requests-history.md](audio-requests-history.md), along with every
round's audit, prompts and delivery record.

## Round 12 — the grab pack (open) — 3 sounds

The Smash-style grab/throw mechanic shipped behind `?throw=true`
(`src/grab.js`, [game-mechanics.md §8](game-mechanics.md#grabs--throws--on-by-default-throwfalse-turns-them-off)).
It is fully voiced today off existing files — the table below is the interim
wiring — so nothing is silent; these three are what give the mechanic its own
sonic identity instead of a borrowed one. If the mechanic graduates from its
flag, this round should land with it.

| Key | Moment | What it should be | Playing in the meantime |
|---|---|---|---|
| `grabConnect` | the hand closes on a body | a short cloth-and-impact clutch — a seize, not a punch; no ring-out tail | `punch` |
| `grabBreak` | the victim mashes free | a strained burst-apart — effort released, slightly triumphant, distinct from a parry | `guardHit` (pitched up) |
| `throwHeave` | any of the four throws leaves the hands | one big body-weight heave with a whoosh tail; the landing hit already has its own sound | `whoosh` |

Delivery and registration follow the standing flow in
[Adding a sound](#adding-a-sound); wire the keys into `SFX`
(`src/config_audio.js`) and swap the three call sites in `src/grab.js` from the
interim keys.

Round 11 was the last of them: **Inumaki's cursed speech** — his three commands
and his ultimate, spoken in Japanese in a voice cast for him alone, replacing
the wordless grunt he had been sharing with four other students. It also built
the general mechanism the domain call-outs had only hinted at: `MOVE_CALL` maps
any fighter's move to a spoken line, so the next character to get one needs no
new code.

Round 10 was the one before it: the domain moment — a barrier, a room tone, a
refusal cue, Dagon's missing sting, and **the eight domain owners saying
領域展開 and the name of the domain in their own voices**, which are the first
spoken lines in the game. It landed together with the four sounds Mechamaru,
Dagon and Kurourushi had been owed since round 15 staged them, which had
stopped being sounds owed against future art and become silent gaps in play
once those fighters reached the select screen.

This file exists so there is somewhere obvious for the next request to go, and
so "is any audio still owed?" has a one-line answer rather than an 800-line
document to read.

**Voice is where the next requests go.** Every fighter has a grunt trio and a
KO cry, and the eight domain owners have their call-out; nobody has
per-character technique call-outs beyond that. A full pass is 27 fighters ×
lines and should be scoped on its own — round 10A was the first slice of it and
round 11 the second. `tools/generate_voice.py` is the route both used, and
`MOVE_CALL` (`src/config_audio.js`) is now the wiring any further slice needs:
a row per move, no new code.

## Round 12 — alternate takes *(open)*

Three things in the delivered audio were judged wrong by ear, which is the one
test neither `generate_voice.py` nor `check_voice.mjs` can run. This round is
**alternates, not replacements**: each file below sits beside the one in play,
both are auditionable in the
[audio workbench](../workbench/?edit=audio), and promoting one is a deliberate
edit rather than something this round does on delivery. A take that is merely
*different* is not automatically *better*, and the only way to know is to hear
them next to each other.

| What | Why | Alternate |
|---|---|---|
| Gojo's domain call | Cast cool and unhurried, which read as **uninvested** rather than effortless | More authoritative — a man giving an instruction to reality |
| Dagon's domain call | Cast gentle and serene, which read as **a polite man** rather than a curse | Lower, with the throat of something much bigger |
| The effort grunts | Made on the sound-EFFECTS endpoint in round 8, which is why they read as odd and animal-like — that endpoint does not have a voice, it imitates one | A short human effort, from an actual voice |

### The grunts are the interesting one

They came from `generate_sfx.py`, and that is the whole defect: the
sound-generation endpoint was asked for a human noise and produced its
impression of one. The alternates go through **`generate_voice.py` instead**,
because a voice model making a short vocal effort is a human being making a
short vocal effort. Same reason the domain call-outs never went near the
effects endpoint.

**Only the four human groups are re-requested.** `gruntMonster` (Jogo, Hanami,
Dagon, Kurourushi) and `gruntAnimal` (Panda, Mahito) are *supposed* to sound
like something that is not a person, so "less animal-like" is the wrong note
for them and they are deliberately left alone.

Three variants each, as now — one is drawn per call, and a repeated special
that plays the identical sample is the thing the trio exists to prevent.

**`grunt_young_male_alt_1.wav`** · young male effort · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke — natural, 20s)* · capped · 0.5 s
```
[short sharp effort grunt] はっ！
```

**`grunt_young_male_alt_2.wav`** · young male effort · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke)* · capped · 0.5 s
```
[short sharp effort grunt] ふっ！
```

**`grunt_young_male_alt_3.wav`** · young male effort · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke)* · capped · 0.5 s
```
[strained effort grunt] せいっ！
```

**`grunt_adult_male_alt_1.wav`** · adult male effort · voice `BTUNhQfNpOekzVjlvRHS` *(Nagi — deep, mid-30s)* · capped · 0.5 s
```
[short sharp effort grunt] はっ！
```

**`grunt_adult_male_alt_2.wav`** · adult male effort · voice `BTUNhQfNpOekzVjlvRHS` *(Nagi)* · capped · 0.5 s
```
[short sharp effort grunt] ふんっ！
```

**`grunt_adult_male_alt_3.wav`** · adult male effort · voice `BTUNhQfNpOekzVjlvRHS` *(Nagi)* · capped · 0.5 s
```
[strained effort grunt] ぐっ！
```

**`grunt_big_alt_1.wav`** · heavy fighter effort · voice `wiBTiCATMiTaXSfv8hdN` *(Sho — warm, deep, 40s)* · pitch 0.94 · capped · 0.6 s
```
[heavy effort grunt] ぬんっ！
```

**`grunt_big_alt_2.wav`** · heavy fighter effort · voice `wiBTiCATMiTaXSfv8hdN` *(Sho)* · pitch 0.94 · capped · 0.6 s
```
[heavy effort grunt] どりゃっ！
```

**`grunt_big_alt_3.wav`** · heavy fighter effort · voice `wiBTiCATMiTaXSfv8hdN` *(Sho)* · pitch 0.94 · capped · 0.6 s
```
[strained heavy effort grunt] ぐぬっ！
```

**`grunt_female_alt_1.wav`** · female effort · voice `lxNssjs8lZzgD44uVifH` *(Rina — natural, late 20s)* · capped · 0.5 s
```
[short sharp effort grunt] はっ！
```

**`grunt_female_alt_2.wav`** · female effort · voice `lxNssjs8lZzgD44uVifH` *(Rina)* · capped · 0.5 s
```
[short sharp effort grunt] ふっ！
```

**`grunt_female_alt_3.wav`** · female effort · voice `lxNssjs8lZzgD44uVifH` *(Rina)* · capped · 0.5 s
```
[strained effort grunt] くっ！
```

### The two domain calls

**`domain_call_gojo_alt_commanding.wav`** · Gojo — Unlimited Void, authoritative · voice `FWySLPyI58wEujI5OCqQ` *(Azel — commanding, cinematic)* · 3.0 s
```
[commanding] りょういきてんかい。むりょうくうしょ。
```

**`domain_call_dagon_alt_deep.wav`** · Dagon — Horizon of the Captivating Skandha, lower · voice `3YKJpNw2ZvG9JayfGYAm` *(Sharo — low-pitched, calm)* · pitch 0.86 · 3.0 s
```
[low and guttural] りょういきてんかい。たううんへいせん。
```

**`domain_call_gojo_alt_even.wav`** · Gojo — Unlimited Void, flat and unperformed · voice `A8vsSyy1xmJQkBgZacW0` *(REI — calm, clear, measured)* · stability 1.0 · 3.0 s
```
[quietly, to himself] りょういきてんかい。むりょうくうしょ。
```

**Two Gojos, and they are asking different questions.** The commanding take
answers "he should sound like he means it"; this one answers "he should sound
like it costs him nothing" — a man saying something to himself on the way to
doing it, with the emphasis nowhere. It carries `· stability 1.0 ·` because
that is the only lever that reaches it: v3's stability is how far it may wander
from a flat reading, and while it is free to act, no wording of the direction
stops it acting. The first alternate was judged **too expressive**, which is a
note about the model's freedom rather than about the words.

**Dagon's is the one that needed a new lever.** No amount of direction stops a
text-to-speech model sounding like a person, because it is a model of people —
so the entry carries `· pitch 0.86 ·`, and `generate_voice.py` resamples the
take downward. Deliberately *not* a formant-preserving shift: dragging the
formants down with the pitch is exactly what makes a voice read as coming from
a bigger throat rather than as a man slowed down. It lengthens the take too,
which is why the brief allows 3.0 s for a 2.25 s line.

---

## Where the game actually is

| | |
|---|---|
| Sound files | **115** referenced, in `assets/sfx/` |
| Registry keys | **103** in `SFX` (`src/config_audio.js`) |
| With a generation prompt on file | **114 of 115** — `sound_shield.mp3` predates the rounds and has none |
| Fighters with a voice | **27 of 27** — six voice groups, three grunt variants each, plus a matching KO cry |
| Fighters with a spoken line | **9** — the 8 domain owners, plus Inumaki on all four of his commands |
| Domain Expansions with their own sting | **8 of 8** |
| Element hit layers | **10 of 10** — fire, blood, steel, wind, sound, shadow, soul, water, machine, swarm |
| Generic sounds left in `stage_fx.js` | **none** — all 26 calls name a specific hazard sound |

Categories and their mix levels: `combat` (25), `voice` (24), `energy` (14),
`domain` (13), `hazard` (10), `ui` (8), `stinger` (5), `movement` (4).

The things the original audit was written to fix are all fixed: one explosion no
longer covers every impact, no fighter is mute, the countdown / match end /
meter-full / respawn / Black Flash / 7:3-crit moments all sound, and the menus
no longer borrow swordfight clips. Round 9 closed the last of it: a fire hit no
longer sounds the same as a steel one, and the techniques whose whole identity
is a sound — Todo's clap, Gakuganji's chord, Mei Mei's crow — make it. Round 10
closed the last silence that was structural rather than incidental: a Domain
Expansion no longer runs seven seconds of ordinary fight mix under the biggest
move in the game, and the barrier coming down is no longer a popup over silence.

The one fxElement with no hit layer is **`feather`** (Mei Mei's crow and Axe
Rush). It is the only element left out of `ELEMENT_HIT_SFX`, and no layer has
been requested for it — her crow already carries `crowCaw` as a fire sound, so
it is the one case where the element is not silent for want of that table.

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

1. Write the request **into this file**, in the shape the entries in
   [audio-requests-history.md](audio-requests-history.md) already use —
   **`filename.wav`** · what it is · length, then a fenced prompt — and move it
   across once it lands. `tools/generate_sfx.py` parses **both** files, which is
   the point of it reading two: a round that has not landed yet cannot have its
   prompts in a file called "history" without the status line lying, and a round
   nobody can generate is not a request, it is a wish. A prompt written anywhere
   but these two files cannot be generated or re-rolled.
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

## Hearing what you have

**[`/workbench/?edit=audio`](../workbench/)** plays every spoken line in the
game, next to the fighter who says it. Pick a fighter from the cast list — built
from `DOMAIN_CALL` and `MOVE_CALL`, so it is exactly the set of people with
something to say — and each of their tracks lists the move it belongs to, its
length, when the move fires and how long it stays interruptible.

It plays through **the game's own mixer**, so the loudness is the loudness in a
match: category trim and per-sound gain applied, not the raw file. Starting a
second track cuts the first the way a hit does, which is also the only
convenient way to hear what an interrupted line sounds like.

**Alternate takes appear under the take they would replace**, marked `in game`
and `not in game`, and are mixed through the same category and gain — so what
you are comparing is the performance and nothing else. They live in
`VOICE_ALTERNATES` (`src/config_audio.js`) and **the game never plays them**.

**A sound with several interchangeable files gets a row per file** — for the
take in play and for every alternate. A grunt trio is three performances, not
one, and the useful verdict is usually "the first and third, and the
alternate's second", which needs each recording on its own button rather than
one button that draws at random. Tick the ones worth keeping and the bench
writes the `file:` array they add up to, ready to paste into the registry.

Promoting a take is three deliberate steps: swap the filename (or the array) in
the `SFX` entry, update its `SPOKEN_LINES` length if it is a spoken line, and
run `node tools/check_voice.mjs` to confirm the timing still adds up.

This is the answer to the one thing neither `generate_voice.py` nor
`check_voice.mjs` can tell you: **whether the take is any good.** They can
confirm a line exists, is registered, is reachable and is the right length. Only
listening tells you whether Jogo sounds volcanic.

## Adding a spoken line

Same shape, one extra field, a different tool. An entry that names a cast voice
belongs to [`tools/generate_voice.py`](../tools/generate_voice.py):

~~~
**`domain_call_gojo.wav`** · Gojo — Unlimited Void · voice `<voice id>` · 3.0 s
```
[casually] りょういきてんかい……むりょうくうしょ。
```
~~~

```sh
ELEVENLABS_API_KEY=... python3 tools/generate_voice.py
```

That ``· voice `id` ·`` field is the whole routing rule between the two tools:
an entry that has one is speech and `generate_sfx.py` skips it, an entry that
does not is a sound effect and `generate_voice.py` skips it. A line with no
cast voice is invisible to both, which is the loudest way for that omission to
show up. Three things the round-10 lines settled, worth not rediscovering:

- **Write the line in kana, not kanji.** Every domain name in this game is an
  irregular reading, and a synthesiser handed the kanji guesses at them and
  guesses wrong. Take the furigana from the fandom wiki, which is the repo's
  standing authority for this — it caught three wrong romanizations in the
  round-10 request itself.
- **Bracketed cues are direction, not text.** The `v3` model performs them and
  does not speak them (measured: a tagged line and the same line untagged come
  back within 0.2 s of each other).
- **A spoken entry is never length-capped**, unlike a sound effect — the cap
  lands mid-word. A line that overruns its brief is reported, not trimmed; it
  is a take to re-roll.

Both routes above put a new round **here** first and move it across once it
lands — the same relationship [asset-requests.md](asset-requests.md) has with
its history file. Delivered files are uploaded to `assets/intake/sfx/` and moved
into `assets/sfx/` as part of that landing, the way art arrives through
`assets/intake/`.
