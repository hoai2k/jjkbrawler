# Missing Sprites — audit

Audit of every image the game asks for against what is in the repo. Method:

- Resolved every animation state for all 17 characters through
  `animFor()` + `DEFAULT_ANIMS` (not just per-character `anims` overrides) and
  looked each frame key up in `assets/sprites/manifest.json`.
- Loaded `index.html` and `workbench/index.html` in a headless browser and
  recorded every console message and every HTTP response ≥ 400.
- Existence-checked all 707 asset paths the loader builds: manifest frames,
  alternates, effects, summons, stage backgrounds, character cards, UI art,
  music and SFX.

## Result

**Nothing 404s.** Every file referenced by `src/assets.js`, `src/audio.js`,
`src/ui.js`, `index.html` and `styles.css` is present, so the
`Failed to load …` warning at `src/assets.js:119` does not fire on the current
build.

**18 sprites are missing as art**, not as failed requests: they are absent from
the manifest, so the loader never asks for them and nothing is logged. The
engine silently substitutes another frame.

## The gap — `dodge_roll` and `dodge_air`, 9 of 17 characters

Round 6 delivered these two poses for 8 characters only. `dodgeAnim()` in
`src/fighter.js:25` falls back to the old shared `dodge` (the sprint cell
`r1c2`) for the rest — so those 9 fighters look like they are running on the
spot during a roll, and like they are sprinting in mid-air during an air dodge.

| Have both | Need both |
|---|---|
| gojo, geto, maki, momo, panda, sukuna, todo, toji | hakari, hanami, inumaki, jogo, mahito, megumi, nanami, nobara, yuta |

### Files to upload

Deliver into `assets/intake/` — nothing there is loaded by the game until
`tools/intake.py` checks and imports it to `assets/sprites/<char>/<key>.png`.

```
assets/intake/
├── hakari/
│   ├── dodge_air.png
│   └── dodge_roll.png
├── hanami/
│   ├── dodge_air.png
│   └── dodge_roll.png
├── inumaki/
│   ├── dodge_air.png
│   └── dodge_roll.png
├── jogo/
│   ├── dodge_air.png
│   └── dodge_roll.png
├── mahito/
│   ├── dodge_air.png
│   └── dodge_roll.png
├── megumi/
│   ├── dodge_air.png
│   └── dodge_roll.png
├── nanami/
│   ├── dodge_air.png
│   └── dodge_roll.png
├── nobara/
│   ├── dodge_air.png
│   └── dodge_roll.png
└── yuta/
    ├── dodge_air.png
    └── dodge_roll.png
```

Prompts and the delivery spec (magenta key, facing right, body ≥ 600 px) are in
[asset-requests-outfit-pose.md](asset-requests-outfit-pose.md) §2.1 and
[asset-requests.md](asset-requests.md). If only one can be made, do
`dodge_roll` — the grounded roll is far more frequent than the air dodge.

## Secondary — poses that exist but show the wrong technique

Not missing files, so no console trace, but still outstanding from
[asset-requests-outfit-pose.md](asset-requests-outfit-pose.md) §2.2. Each of
these still resolves to an original grid cell rather than dedicated art:

| Character / state | Still draws |
|---|---|
| `maki/specialNeutral` (Cursed Tool Toss) | `r1c2` — her dash frame |
| `nobara/specialNeutral` (nail volley) | `r0c2` |
| `geto/specialNeutral` (Rainbow Dragon) | `r3c2` |
| `geto/specialSide` (Cursed Spirit Volley) | `r3c0` |
| `geto/downHeavy` (Scissors) | `r2c2` |
| `hakari/specialDown` (Reserve Balance) | `r4c3` |
| `megumi/specialNeutral` (Nue) | `r3c2` |
| `hanami/specialNeutral` (Cursed Buds) | `r3c2` |
| `jogo/specialSide` (flame jet) | `r2c2` |
| `hanami/specialSide` (vine lash) | `r2c2` |
