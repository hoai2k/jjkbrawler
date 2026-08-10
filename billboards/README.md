# `billboards/` — the 2.5D character rendering path

3D models, posed and rendered to a texture, blitted into the same 2D world the
sprite path draws into. **A stub today**: the backend is registered and
playable, but no models are loaded, so every character falls through to sprites.

    node server.mjs
    open 'http://127.0.0.1:5174/?render=billboard'

It plays exactly like `?render=sprite` right now, and will keep doing so for any
character without a model — the fallthrough is per character, not per build, so
one rigged fighter can stand in a match against 27 sprite ones.

```
billboards/
  src/         billboard.js — the backend (stubbed)
  assets/      models go here, as billboards/assets/<char>/
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
   animation state. The state names come from `DEFAULT_ANIMS` in
   `src/characters.js` (~25: idle, run, dash, jump, fall, land, hurt, crouch,
   crouchAttack, shield, ledge, dodge_roll, dodge_air, light, airLight,
   sideHeavy, upHeavy, downHeavy, charge, specialNeutral/Side/Down, ult, dizzy).
   A model missing one has a hole in its move set. **This, not the code, is the
   project**: 25 clips × 28 characters.
2. **A pose cache.** `currentFrame` runs every frame for every fighter, so the
   token it returns should identify a pose — letting identical poses reuse one
   rendered texture.
3. **The offscreen renderer and the blit**, reusing the placement arithmetic
   `sprites/src/sprites.js` already does: foot line at `(x, y)`, mirrored by
   facing, rotated about the centre of mass.
4. **Gameplay measurements.** `bodyWidth` (`src/silhouette.js`) and
   `headHeightTarget` (`src/heights.js`) size hurtboxes and reach off the
   artwork, today from sprite silhouettes baked into the manifest. A model must
   answer them from its own bounds or every hitbox on a 2.5D fighter is quietly
   wrong. This is deliberately **outside** the render backend contract — see the
   note in `src/render_backend.js`.

## Contract

Anything here must honour what `src/render_backend.js` documents, in particular:
`drawCharFrame` returns **false** when it cannot draw (so `render.js` paints its
placeholder instead of leaving an invisible fighter), and leaves the canvas
context exactly as it found it.
