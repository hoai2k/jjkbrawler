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

## Docs

- [Game mechanics](docs/game-mechanics.md)
- [Characters](docs/characters.md)
- [Asset pipeline](docs/asset-pipeline.md)
- [Full sprite cleanup](docs/sprite-cleanup.md) — the runbook for answering every
  flag set in the sprite workbench
