# Audio Requests — open requests

**Nothing is outstanding.** The sound-effect round is delivered and wired in;
the audit, the prompts and the delivery record are in
[audio-requests-history.md](audio-requests-history.md).

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
