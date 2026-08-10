# JJK Brawler II

A cursed-energy platform fighter. Plain HTML/CSS/JS — no build step, no dependencies.

## Play online

https://hoai2k.github.io/jjkbrawler/

## Play locally

Requires Node.js.

```
npm start
```

Then open http://127.0.0.1:5174

Or double-click `play-mac.command` (macOS) / `play-windows.bat` (Windows).

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Move | `WASD` | Arrow keys |
| Light attack | `J` | `,` or `Numpad 1` |
| Heavy attack | `K` | `.` or `Numpad 2` |
| Special | `L` | `/` or `Numpad 3` |
| Ultimate | `I` | `'` or `Numpad 0` |
| Shield | `Left Shift` | `Right Shift` or `Numpad Enter` |

Gamepads are supported too.

Press `Esc` to pause. The in-game `i` button lists the full move set.

## Rendering

Characters are drawn through a named render backend (`src/render_backend.js`),
picked at boot with `?render=` — `sprite`/`sprites`, `billboard`/`billboards`
and `3d`/`render3d`/`anime` all resolve (the extra spellings are aliases):

- [`sprites/`](sprites/README.md) — the 2D sprite path: art, the renderer, the
  sprite workbench (`/sprites/workbench/`) and its documentation. The default.
- [`billboards/`](billboards/README.md) — the 2.5D path: 3D models posed at
  quantised holds, rendered offscreen and blitted into the same 2D world. The
  pipeline is built (try `?render=billboard&mannequin=all`, review in
  `/billboards/workbench/`); fighters draw as models per character as rigs
  are delivered, and as their sprites otherwise.
- [`render3d/`](render3d/README.md) — the live-3D anime path: the same
  rigs animated at full frame rate, toon-ramped, ink-outlined and stepped on
  twos, with real turnarounds, aimed strikes, head tracking and stage-derived
  lighting (try `?render=3d&mannequin=all`, review in `/render3d/workbench/`).
  Same per-character fallthrough to sprites.

Gameplay is identical on every backend by design — hurtboxes, reach and
height stay sprite-derived however a fighter is drawn.

Shared art the renderer spawns — effects, summon creatures, backgrounds — stays
under [`assets/`](assets/sprites/README.md) and is untouched by that choice.

`?camera=3d` is a separate, orthogonal choice: `?render=` decides how a
CHARACTER is drawn, `?camera=` decides the stage and lens they exist in, and
the two compose. It runs the whole game inside a Smash-style perspective
camera — the current sprites billboarded into a real 3D scene, with depth,
parallax and a living camera ([plan & status](docs/2.5d-camera-plan.md)).
Off by default; the flat renderer is byte-for-byte untouched without the param.

## Docs

- [Game mechanics](docs/game-mechanics.md)
- [2.5D camera](docs/2.5d-camera-plan.md) — the `?camera=3d` mode: plan,
  implementation status, per-board camera treatments
- [Move list](docs/move-list.md) — every fighter's specials, ultimate and domain
  in one table (generated from the kits)
- [Characters](docs/characters.md) — why each kit is the way it is
- [Asset pipeline](sprites/docs/asset-pipeline.md)
- [Automating the placement pass](sprites/docs/sprite-auto-adjust.md) — what the hand
  tuning data says is mechanical, and what is judgement
- [Full sprite cleanup](sprites/docs/sprite-cleanup.md) — the runbook for answering every
  flag set in the sprite workbench
- [Asset requests](docs/asset-requests.md) — open art rounds
  ([history](docs/asset-requests-history.md))
- [Audio requests](docs/audio-requests.md) — nothing outstanding; the sound round
  and its prompts are in [history](docs/audio-requests-history.md)
