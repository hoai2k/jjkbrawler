# `tools/` — the scripts around the game

Nothing in here ships to a player. These are the checks that keep the docs and
the data honest, the pipelines that turn a delivery into something the game can
draw, and the smoke tests that play the real game headlessly and measure what
came out.

Node scripts (`.mjs`) import the game's own modules, so what they check is what
a match runs. Python scripts (`.py`) do the image and model work. Nothing has a
build step; `npm install` (Playwright) is the only dependency, and only the
browser-driven scripts need it.

## The gate: `npm run check`

One command, and it is what CI runs. In order, it checks imports resolve, voice
lines match their files, the audio mix is within range, SFX are normalised, pose
reads and battle poses parse, the controls tables in `README.md` and
`docs/game-mechanics.md` match `src/config_controls.js`, every kit resolves,
shared art is in sync, `docs/move-list.md` is regenerated from the kits, moves
point where they say they do, every stage is reachable by jump, hitboxes hold
their invariants, both model backends' intakes validate, and the camera boots.

Several of those are **generators run in `--check` mode** — they will rewrite
the file for you rather than only complaining:

    node tools/check_controls.mjs --fix      # the controls tables
    node tools/build_move_list.mjs           # docs/move-list.md
    node tools/build_image_requests.mjs      # docs/image-requests.md
    python3 tools/refresh_shared_art.py      # the shared-art manifest

`python3 tools/check_doc_links.py` walks every markdown file for broken
relative links. It is not in `npm run check`; run it after moving a doc.

`node tools/smoke_stats.mjs` covers /stats/ and the visitor counter. Also
outside `npm run check`, for a different reason: it needs `node server.mjs`
running, and the gate is meant to pass on a bare checkout.

## The families

| Prefix | What it is | Count |
|---|---|---|
| `check_*` | invariants — a non-zero exit means something drifted | 15 |
| `smoke_*` | play the real game (mostly headless via Playwright) and measure the result | 35 |
| `audit_*` | report on the data rather than pass/fail it — reach, hitboxes, frame sizes, model health | 12 |
| `build_*` | generate a checked-in file from the source of truth | 6 |
| `debug_*` | probe one mechanism and print what it did — no pass/fail, for judging a look change | 5 |
| `intake_*`, `*_intake` | take a delivery from `assets/intake/` or `render3d/intake/` into the game | |
| `pose_*` | the sprite pose reads and the sheets that review them | |
| `blender_*` | run inside Blender against a rig; see `render3d/docs/blender-requests.md` | |
| `generate_*`, `normalize_sfx` | audio: synthesise takes, then normalise the mix | |

Roughly 140 scripts in total, most of them written for one round of work and
kept because the next round of the same shape will want them again.

## Where the rest is documented

Each pipeline's own README owns its tools: [`sprites/`](../sprites/README.md)
for the 2D path, [`billboards/`](../billboards/README.md) for the 2.5D cards,
[`render3d/`](../render3d/README.md) for the live-3D path, and
[`assets/intake/`](../assets/intake/README.md) for how a delivery becomes art in
the game. This file is the index; they are the instructions.
