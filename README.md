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
picked at boot with `?render=`:

- [`sprites/`](sprites/README.md) — the 2D sprite path: art, the renderer, the
  sprite workbench (`/sprites/workbench/`) and its documentation. The default.
- [`billboards/`](billboards/README.md) — the 2.5D path: 3D models posed and
  blitted into the same 2D world. A stub; `?render=billboard` runs and falls
  through to sprites for every character until models land.

Shared art the renderer spawns — effects, summon creatures, backgrounds — stays
under [`assets/`](assets/sprites/README.md) and is untouched by that choice.

Separately, `?camera=3d` runs the whole game inside a Smash-style perspective
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
