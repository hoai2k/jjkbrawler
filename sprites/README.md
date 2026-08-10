# `sprites/` — the 2D character rendering path

Everything that turns a fighter into pixels the sprite way: the art, the code
that draws it, the tool that places it, and the documentation for all three.

```
sprites/
  assets/      every fighter's sheets + manifest.json (the index)
  src/         sprites.js — the sprite render backend
  workbench/   the sprite workbench, served at /sprites/workbench/
  docs/        the sprite pipeline, pose briefs, motion and cleanup notes
```

## What is in here and what is not

The split is **art a fighter is drawn from** versus **art the renderer spawns**.

| In `sprites/assets/` | Stays in `assets/` |
| --- | --- |
| The 29 character sheet sets, including `hanami_alt` | `assets/sprites/effects/` — techniques, auras, impacts |
| `mahoraga/` — a summon in the fiction, but animated out of a character sprite set like any fighter | `assets/sprites/summons/` — shikigami and creature stills |
| Each character's `archive/`, `alt/` and `incoming/` backups | `assets/backgrounds/`, `assets/cards/`, `assets/ui/` |
| `manifest.json`, the index naming the file each pose draws from | `assets/music/`, `assets/sfx/`, `assets/intake/`, `assets/reference/` |

`manifest.json` paths are relative to `sprites/assets/`, so a character frame is
`sprites/assets/<char>/<pose>.png` — with one exception. The manifest carries a
pseudo-character `effects`, holding the shared install auras so the workbench can
measure and place them through the same editor as a pose; those entries name
`effects/<name>.png` and resolve against the **shared** tree. `spriteUrl()` in
`src/assets.js` routes each manifest path to the right root, which is why nothing
else should concatenate one by hand.

Python tools get both roots from `tools/sprite_paths.py` (`CHAR`, `SHARED`,
`MANIFEST`) rather than rebuilding them, so the next move is one edit.

## Why the split exists

The 2.5D work replaces how *fighters* are drawn and leaves effects, summons and
backgrounds exactly as they are. Separating the two makes that a swap of one
directory and one backend instead of an archaeology exercise across a tree where
both kinds of art were mixed together.

The renderer side of the same idea is `src/render_backend.js`: three functions
(`currentFrame`, `cyclePhase`, `drawCharFrame`) are the whole surface the game
uses to put a character on screen. `sprites/src/sprites.js` is one implementation
of them; `billboards/src/billboard.js` is the other.

## Running the workbench

    node server.mjs
    open http://127.0.0.1:5174/sprites/workbench/

It renders through the game's own modules, so what it shows is what the game
draws. It calls `sprites/src/sprites.js` directly rather than going through the
render backend — correct, because it is the tool for authoring *sprites*.
