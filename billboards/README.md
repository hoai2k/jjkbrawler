# `billboards/` — the 2.5D character rendering path

3D models, posed and rendered to a texture, blitted into the same 2D world the
sprite path draws into. **A stub today**: the backend is registered and
playable, but no models are loaded, so every character falls through to sprites.

    node server.mjs
    open 'http://127.0.0.1:5174/?render=billboard'

It plays exactly like `?render=sprite` right now, and will keep doing so for any
character without a model — the fallthrough is per character, not per build, so
one rigged fighter can stand in a match against 27 sprite ones.

- **[docs/plan.md](docs/plan.md)** — the implementation plan: decisions,
  architecture, phases B0–B4, risks.
- **[docs/asset-requests.md](docs/asset-requests.md)** — every rig and clip the
  roster needs, with the delivery spec and per-state timing contract. Round B1
  (the Yuji pilot) is the one to draw against.

```
billboards/
  src/         billboard.js — the backend (stubbed)
  assets/      approved runtime models, as billboards/assets/<char>/
  intake/      where deliveries land first — see docs/asset-requests.md
  docs/        the plan and the asset requests
```

## The design in one paragraph

Keep the game 2D. `render.js` asks for a character at `(x, y)` with a facing and
a scale and gets back a rectangle of pixels; whether those pixels came from a
PNG or from a WebGL render of a posed model is not its business. That preserves
`camera.js`, the y-sorted draw order, shadows, strike arcs, `stage_fx.js`,
`domains.js`, `ultimates.js` and every layering decision in `draw()`. Moving the
whole scene into a 3D engine would throw all of that away — that is a rewrite,
not 2.5D.

## What has to be built

1. **Model loading** into `billboards/assets/<char>/` — glTF plus one clip per
   animation state, named for the keys of `SEMANTIC_ANIMS` in
   `src/characters.js`. A model missing one has a hole in its move set. **This,
   not the code, is the project** — though rigged clips retarget where sprite
   drawings never could, so the shared-library plan in
   [docs/asset-requests.md](docs/asset-requests.md) buys the roster for ~250
   clips rather than 26 × 28.
2. **A pose cache.** `currentFrame` runs every frame for every fighter, so the
   token it returns should identify a pose — letting identical poses reuse one
   rendered texture.
3. **The offscreen renderer and the blit**, reusing the placement arithmetic
   `sprites/src/sprites.js` already does: foot line at `(x, y)`, mirrored by
   facing, rotated about the centre of mass.
4. **Gameplay measurements — resolved, differently than first sketched.**
   `bodyWidth` (`src/silhouette.js`) and `headHeightTarget` (`src/heights.js`)
   size hurtboxes and reach off the sprite silhouettes, and they **keep doing
   so on every backend**: a model changes how a fighter looks, never how they
   play, so both render modes stay one game. The burden moves to delivery — a
   model must match its fighter's sprite silhouette (the billboard workbench
   overlays the two). Full reasoning in [docs/plan.md](docs/plan.md).

## Contract

Anything here must honour what `src/render_backend.js` documents, in particular:
`drawCharFrame` returns **false** when it cannot draw (so `render.js` paints its
placeholder instead of leaving an invisible fighter), and leaves the canvas
context exactly as it found it.
