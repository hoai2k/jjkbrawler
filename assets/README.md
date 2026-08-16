# `assets/` — everything that is not a fighter's own art

The split this directory exists for: art a fighter is **drawn from** lives in
[`sprites/assets/`](../sprites/README.md) (and rigs in
[`render3d/assets/`](../render3d/README.md)); art the renderer **spawns**, and
everything that is not a character at all, lives here. It is shared, it belongs
to no single fighter, and it is untouched by `?render=`.

| | |
|---|---|
| [`sprites/`](sprites/README.md) | the shared drawings the renderer spawns — `effects/` (techniques, auras, impacts), `summons/` (shikigami and creature plates), `garnish/` |
| `backgrounds/` | one painted backdrop per stage, plus the domain backgrounds |
| `cards/` | the select-screen hero cards |
| `ui/` | menu and HUD art |
| `fonts/` | the typefaces the game loads |
| `music/` | match and menu tracks, and `boards/` for per-stage music |
| `sfx/` | every sound effect and voice line, normalised by `tools/normalize_sfx.py` |
| [`intake/`](intake/README.md) | where a 2D delivery lands before it is imported. **Never drop art straight into the trees above** |
| `reference/` | canon reference and previous rounds, kept for comparison; nothing here is loaded by the game |

What to draw is [`docs/image-requests.md`](../docs/image-requests.md) — the one
image-request document for every render mode, generated from the open rounds
and from what is on disk. How a delivery becomes art in the game is
[`intake/README.md`](intake/README.md).

Paths are resolved through `spriteUrl()` in `src/assets.js` (JS) and
`tools/sprite_paths.py` (Python), which know which of the two roots a manifest
entry belongs to. Nothing else should concatenate one by hand.
