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
picked at boot with `?render=` — `sprite`/`sprites` and
`billboard`/`billboards` both resolve (the plurals are aliases):

- [`sprites/`](sprites/README.md) — the 2D sprite path: art, the renderer, the
  sprite workbench (`/sprites/workbench/`) and its documentation. The default.
- [`billboards/`](billboards/README.md) — the 2.5D path: 3D models posed,
  rendered offscreen and blitted into the same 2D world. The pipeline is built
  (try `?render=billboard&mannequin=all`, review in `/billboards/workbench/`);
  fighters draw as models per character as rigs are delivered, and as their
  sprites otherwise. Gameplay is identical on both backends by design.

Shared art the renderer spawns — effects, summon creatures, backgrounds — stays
under [`assets/`](assets/sprites/README.md) and is untouched by that choice.

## Docs

- [Game mechanics](docs/game-mechanics.md)
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
