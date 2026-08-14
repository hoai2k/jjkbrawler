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

## Round 13 — a wider bank to choose from *(open)*

Round 12's grunts were judged in play and most of them failed. The verdicts,
and what this round does about each:

| Verdict | Response |
|---|---|
| **Some of them have words in them** — unusable, whatever else is right about the take | Every line below is a **non-lexical vocalisation**: a stopped vowel or a nasal, nothing that is a word in any language |
| **None of the adult-male takes work** | Recast entirely — a different voice, not a different reading of the same one |
| **The monster grunts want more variety** | Three of them, and the first alternates that group has ever had |
| **The KO cries do not work**, in any group | Three alternates for every one of the six |

**The words were mine, and they were avoidable.** Round 12 used せいっ, どりゃっ
and ぬんっ — kiai, which are shouts a person chooses to make and which a voice
model articulates as speech. A grunt is not chosen and is not articulated. The
vocabulary here is うっ / んっ / ぐっ / はっ and their stretched forms, which
have no lexical content to articulate.

**A tag on its own produces silence**, which is worth writing down because it
is the obvious first idea: `[grunts]` with no text returns an empty file. The
model needs something to voice, so every entry is a tag *and* a vocalisation —
the tag directs, the kana is what the voice actually does.

**Wordlessness is checked, not hoped for.** `tools/audit_voice_takes.py`
measures how many separate utterances a take contains. A grunt is one; a word
is a run of syllables. Anything that comes back as several is a take to re-roll
whatever it sounds like, and the audit runs over this whole round below.

### Effort grunts — three more for each male group, and the monster's first

**`grunt_young_male_alt_4.wav`** · young male effort · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke — natural, 20s)* · capped · 0.5 s
```
[sharp effort grunt] うっ
```

**`grunt_young_male_alt_5.wav`** · young male effort · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke — natural, 20s)* · capped · 0.5 s
```
[strained effort grunt] んっ
```

**`grunt_young_male_alt_6.wav`** · young male effort · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke — natural, 20s)* · capped · 0.5 s
```
[hard exhaled effort grunt] ふっ
```

**`grunt_adult_male_alt_4.wav`** · adult male effort · voice `OrIijq7uyVaGDbu9tqly` *(Akira — cinematic, measured)* · capped · 0.5 s
```
[low sharp effort grunt] ぐっ
```

**`grunt_adult_male_alt_5.wav`** · adult male effort · voice `OrIijq7uyVaGDbu9tqly` *(Akira — cinematic, measured)* · capped · 0.5 s
```
[strained effort grunt] んっ
```

**`grunt_adult_male_alt_6.wav`** · adult male effort · voice `OrIijq7uyVaGDbu9tqly` *(Akira — cinematic, measured)* · capped · 0.5 s
```
[hard exhaled effort grunt] はっ
```

**`grunt_big_alt_4.wav`** · big effort · voice `wiBTiCATMiTaXSfv8hdN` *(Sho — warm, deep, 40s)* · pitch 0.94 · capped · 0.5 s
```
[heavy effort grunt from the chest] ぐっ
```

**`grunt_big_alt_5.wav`** · big effort · voice `wiBTiCATMiTaXSfv8hdN` *(Sho — warm, deep, 40s)* · pitch 0.94 · capped · 0.5 s
```
[deep strained effort grunt] んんっ
```

**`grunt_big_alt_6.wav`** · big effort · voice `wiBTiCATMiTaXSfv8hdN` *(Sho — warm, deep, 40s)* · pitch 0.94 · capped · 0.5 s
```
[heavy exhaled effort grunt] はっ
```

**`grunt_monster_alt_1.wav`** · monster effort · voice `3U6tYxUqUpcplL5Qep78` *(Shimura — husky, hoarse)* · pitch 0.85 · capped · 0.5 s
```
[guttural inhuman snarl] ぐるっ
```

**`grunt_monster_alt_2.wav`** · monster effort · voice `3U6tYxUqUpcplL5Qep78` *(Shimura — husky, hoarse)* · pitch 0.85 · capped · 0.5 s
```
[low wet inhuman growl] ごぉっ
```

**`grunt_monster_alt_3.wav`** · monster effort · voice `3U6tYxUqUpcplL5Qep78` *(Shimura — husky, hoarse)* · pitch 0.85 · capped · 0.5 s
```
[rasping inhuman huff] はぁっ
```

### KO cries — three alternates for every group

A KO cry plays once, as its owner leaves the stage, so it can be longer and
wilder than an effort grunt — but it is the same rule about words. These are
cries, not exclamations.

**`ko_young_male_alt_1.wav`** · young male KO cry · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke)* · capped · 1.0 s
```
[pained falling cry] うわあっ
```

**`ko_young_male_alt_2.wav`** · young male KO cry · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke)* · capped · 1.0 s
```
[sharp cry of pain] ぐあぁ
```

**`ko_young_male_alt_3.wav`** · young male KO cry · voice `WFLyIjdIbVuEXaAkU0Xb` *(Ryunosuke)* · capped · 1.0 s
```
[breathless cry, falling away] あぁっ
```

**`ko_adult_male_alt_1.wav`** · adult male KO cry · voice `OrIijq7uyVaGDbu9tqly` *(Akira)* · capped · 1.0 s
```
[pained falling cry] ぐあっ
```

**`ko_adult_male_alt_2.wav`** · adult male KO cry · voice `OrIijq7uyVaGDbu9tqly` *(Akira)* · capped · 1.0 s
```
[sharp cry of pain] うおっ
```

**`ko_adult_male_alt_3.wav`** · adult male KO cry · voice `OrIijq7uyVaGDbu9tqly` *(Akira)* · capped · 1.0 s
```
[breathless cry, falling away] あぁっ
```

**`ko_big_alt_1.wav`** · big KO cry · voice `wiBTiCATMiTaXSfv8hdN` *(Sho)* · pitch 0.94 · capped · 1.0 s
```
[deep pained bellow] ぐおおっ
```

**`ko_big_alt_2.wav`** · big KO cry · voice `wiBTiCATMiTaXSfv8hdN` *(Sho)* · pitch 0.94 · capped · 1.0 s
```
[heavy cry of pain] うぐあっ
```

**`ko_big_alt_3.wav`** · big KO cry · voice `wiBTiCATMiTaXSfv8hdN` *(Sho)* · pitch 0.94 · capped · 1.0 s
```
[winded falling cry] はあっ
```

**`ko_female_alt_1.wav`** · female KO cry · voice `lxNssjs8lZzgD44uVifH` *(Rina)* · capped · 1.0 s
```
[pained falling cry] きゃあっ
```

**`ko_female_alt_2.wav`** · female KO cry · voice `lxNssjs8lZzgD44uVifH` *(Rina)* · capped · 1.0 s
```
[sharp cry of pain] ああっ
```

**`ko_female_alt_3.wav`** · female KO cry · voice `lxNssjs8lZzgD44uVifH` *(Rina)* · capped · 1.0 s
```
[breathless cry, falling away] うぅっ
```

**`ko_monster_alt_1.wav`** · monster KO cry · voice `3U6tYxUqUpcplL5Qep78` *(Shimura)* · pitch 0.85 · capped · 1.0 s
```
[inhuman shriek of pain] ぎゃあっ
```

**`ko_monster_alt_2.wav`** · monster KO cry · voice `3U6tYxUqUpcplL5Qep78` *(Shimura)* · pitch 0.85 · capped · 1.0 s
```
[guttural dying roar] ごあああっ
```

**`ko_monster_alt_3.wav`** · monster KO cry · voice `3U6tYxUqUpcplL5Qep78` *(Shimura)* · pitch 0.85 · capped · 1.0 s
```
[wet rasping death rattle] ぐぅっ
```

**`ko_animal_alt_1.wav`** · animal KO cry · voice `AAxVQbetQhXWMEZC9p8S` *(Kmy)* · pitch 0.88 · capped · 1.0 s
```
[animal yelp of pain] ぎゃんっ
```

**`ko_animal_alt_2.wav`** · animal KO cry · voice `AAxVQbetQhXWMEZC9p8S` *(Kmy)* · pitch 0.88 · capped · 1.0 s
```
[startled animal cry] うわんっ
```

**`ko_animal_alt_3.wav`** · animal KO cry · voice `AAxVQbetQhXWMEZC9p8S` *(Kmy)* · pitch 0.88 · capped · 1.0 s
```
[winded animal huff] ふぎゃっ
```

---

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

**`domain_call_gojo_alt_relaxed.wav`** · Gojo — Unlimited Void, relaxed and even · voice `FWySLPyI58wEujI5OCqQ` *(Azel — cinematic)* · stability 1.0 · pitch 0.96 · 3.6 s
```
[relaxed, even pace] りょういきてんかい……[pause] むりょうくうしょ。
```

**`domain_call_dagon_alt_deep.wav`** · Dagon — Horizon of the Captivating Skandha, lower · voice `3YKJpNw2ZvG9JayfGYAm` *(Sharo — low-pitched, calm)* · pitch 0.86 · 3.0 s
```
[low and guttural] りょういきてんかい。たううんへいせん。
```

**`domain_call_gojo_alt_even.wav`** · Gojo — Unlimited Void, flat and unperformed · voice `A8vsSyy1xmJQkBgZacW0` *(REI — calm, clear, measured)* · stability 1.0 · 3.0 s
```
[quietly, to himself] りょういきてんかい。むりょうくうしょ。
```

**Two Gojos, and neither of them is trying to sound impressive.** The first
attempt at an alternate was directed *authoritative* and came back at 1.58 s
against the 3.28 s it replaces — commanding, and **rushed**, which is the
opposite of the man. Being the strongest sorcerer alive is not something he
has to push. So the word came out of the direction entirely and both takes now
ask a quieter question: whether the line should sound relaxed and evenly paced,
or flat to the point of unperformed — someone saying it to themselves on the
way to doing it.

Both carry `· stability 1.0 ·`, which is the lever that actually reaches this:
v3's stability is how far it may wander from a flat reading, and while it is
free to act, no wording of the direction stops it acting. "Too expressive" and
"too rushed" are both notes about the model's freedom rather than about the
words. The relaxed take also carries `· pitch 0.96 ·` — a 4% stretch, which
buys pace without touching the delivery.

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

**[`/workbench/?edit=audio`](../workbench/)** plays every voice in the game,
next to the fighter it belongs to. Each track lists the move it belongs to, its
length, when the move fires and how long it stays interruptible.

The cast is everyone with something to say — built from `DOMAIN_CALL` and
`MOVE_CALL` — **plus a stand-in for every voice group none of them uses.** The
nine speakers cover four of the six grunt groups between them, which used to
leave `gruntAdultMale` and `gruntFemale` unreachable: eleven fighters, two KO
cries and two whole alternate trios with no way onto the page. Nanami and Maki
stand in for those, marked as representatives rather than as speakers.

It plays through **the game's own mixer**, so the loudness is the loudness in a
match: category trim and per-sound gain applied, not the raw file. Starting a
second track cuts the first the way a hit does, which is also the only
convenient way to hear what an interrupted line sounds like.

**Alternate takes appear under the take they would replace**, marked `in game`
and `not in game`, and are mixed through the same category and gain — so what
you are comparing is the performance and nothing else. They live in
`VOICE_ALTERNATES` (`src/config_audio.js`) and **the game never plays them**.

**Not seeing a change you just made?** The header's **↻ Refresh** reloads
against a cache key nobody has fetched — the page, its stylesheet, its module
and everything that module imports all miss the cache together. GitHub Pages
serves source with a ten-minute max-age and a browser may hold an ES module in
a tab with no revalidation at all, so "I edited it and reloaded" is not always
enough on its own. When the bench itself changes, bump `BENCH_VERSION` in
[`workbench/router.js`](../workbench/router.js) so everyone else gets it too.

**A sound with several interchangeable files gets a row per file** — for the
take in play and for every alternate. A grunt trio is three performances, not
one, and the useful verdict is usually "the first and third, and the
alternate's second", which needs each recording on its own button rather than
one button that draws at random. Tick the ones worth keeping and the bench
writes the `file:` array they add up to, ready to paste into the registry.

**`node tools/audit_voice_takes.py`** answers the one question about a grunt
that a machine can answer: is it a grunt, or is it a word? A grunt is a single
burst of voicing; a word is a run of syllables. It cannot tell a good take from
a bad one, but it catches the failure that shipped a whole round of unusable
grunts — and it found two more on its first run: a delivered alternate that was
**completely silent**, and two of the original KO cries.

**Every take that exists is listed, including the rejected rounds.** The bench
is where takes get pruned as well as chosen, and a file nobody can see is a file
nobody can delete — so a rejected round stays visible until somebody says
otherwise rather than quietly accumulating in `assets/sfx/`, where the only way
to find it is a directory listing.

Each recording carries three decisions, not one:

| | |
|---|---|
| **keep** / **use** | it belongs in this sound |
| **delete** | it belongs nowhere — bin the file. Clears **keep**, since a file cannot be both wanted and binned |
| **move** | it belongs in a *different* voice group. Tick it and pick the destination |

**Move is the one that changes what to generate next.** Once the bank holds
only takes that work, the groups that are short are obvious, and the takes
already in them are the reference for what the next round should sound like —
which is a far better brief than a description written from memory.

**⭳ Export changes** downloads every pick that differs from what ships, as
JSON: the shipping files, the chosen ones, what was added and dropped, and —
for a spoken line — the new take's **measured** duration next to the one in
`SPOKEN_LINES`, so whoever applies it has the frame data in hand rather than
having to go and get it. Deletions and moves ride along in the same file, a
move reported whole (`file`, `from`, `to`) rather than as a removal in one
sound and an addition in another that somebody has to pair up by hand. A verdict that lives only on a screen has to be
retyped by whoever acts on it, and retyping eleven filenames is how the wrong
take ends up in the game.

Promoting a take is three deliberate steps: swap the filename (or the array) in
the `SFX` entry, update its `SPOKEN_LINES` length if it is a spoken line, and
run `node tools/check_voice.mjs` to confirm the timing still adds up.
`node tools/smoke_audio_bench.mjs` guards the bench itself — every voice group
reachable, every fighter actually drawn, the export carrying what it claims.

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
