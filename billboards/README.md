# `billboards/` — the 2.5D character rendering path

3D models, posed and rendered to a texture, blitted into the same 2D world the
sprite path draws into. **Yuji plays as a model today** — round B1 is delivered:
his rig is conformed to spec and carries all 26 clips, and he fights beside
twenty-six sprite fighters in a real match. Everyone else draws their sprites
until their rig lands, per character, per draw. What the pilot cost and what it
found is [docs/b1-yuji.md](docs/b1-yuji.md).

    node server.mjs
    open 'http://127.0.0.1:5174/?render=billboard'               # the real thing
    open 'http://127.0.0.1:5174/?render=billboard&mannequin=all'  # grey proof bodies for the un-rigged
    open 'http://127.0.0.1:5174/billboards/workbench/'           # the review tool

`?render=billboards` and `?render=sprites` work too — the plural spellings are
aliases (src/render_backend.js), not typos.

- **[docs/plan.md](docs/plan.md)** — the implementation plan: decisions,
  architecture, phases, risks.
- **[docs/asset-requests.md](docs/asset-requests.md)** — every rig and clip the
  roster needs: delivery spec, clip timing contract, prop and chain bone
  naming, the aim contract. Round B1 (the Yuji pilot) is open.
- **[intake/README.md](intake/README.md)** — where deliveries land and how they
  get into the game. Separate from the sprite intake on purpose.

```
billboards/
  src/         the pipeline: billboard.js (backend entry), rig.js (registry +
               clip inheritance), renderer.js (offscreen WebGL + pose cache),
               blit.js, states.js (the 26-state contract), mannequin.js (the
               proof body + THE DEFAULT POSE SET), props.js (weapons, props,
               physics chains), ik.js (two-bone reach solver)
  workbench/   /billboards/workbench/ — model vs sprite ghost, aim target,
               per-state clip inheritance editor, approval
               (three.js is shared with the 2.5D camera and lives at the repo
               root: ../vendor/, see its VENDOR.md. src/ reaches it only via
               dynamic import(), so sprite players never load it)
  assets/      approved runtime rigs + manifest.json (the index)
  intake/      where deliveries land first
```

## How it works, in one paragraph

Keep the game 2D. `render.js` asks for a character at `(x, y)` with a facing
and a scale and gets back a rectangle of pixels; whether those came from a PNG
or a WebGL render of a posed model is not its business. One offscreen renderer
poses a rig per unique `(character, state, quantised time, aim)` and caches the
texture — most states are holds, so a fighter costs a couple of renders a
second, not sixty. The blit anchors the foot line to `(x, y)` and applies the
same mirror/squash/rotate arithmetic as sprites.js, so every piece of game feel
in motion.js reads identically on both backends. Characters without a rig fall
through to sprites per character, per draw — one delivered fighter plays in a
roster of 27 sprite ones, and every failure (bad load, missing clip, render
error) degrades to sprites loudly rather than to an invisible fighter.

## The default pose set and clip inheritance

The mannequin's programmatic clips are **the default pose set**: any state a
rig does not cover, and nothing else answers, plays the default clip on that
rig — so a fighter delivered with only their six identity clips is playable on
day one. Between "own" and "default" sits inheritance, edited in the workbench
and stored in `assets/manifest.json`: a per-state override ("draw `sideHeavy`
with Todo's clip"), or a whole-set fallback (`inheritClips`). Clips bind by
bone name and every rig honours the standard skeleton, which is what makes a
clip portable between rigs. Resolution order — hand-set override, own clip,
inherited set, default — is `resolveClip` in `src/rig.js`.

## Weapons, props, physics, aim

- **Props are rig bones** (`Prop_Main`, `Prop_Off`, `Prop_Float`), never
  separate files. The mannequin hangs crude placeholders for every fighter the
  roster table arms (props.js) so clips are authored against the silhouette
  that will actually swing.
- **Physics chains** (`Chain_<name>_<i>` — Mei Mei's braid, Dagon's tendrils)
  sway deterministically off the pose clock, which keeps the pose cache honest;
  true integration is a per-rig opt-in later, at per-frame render cost.
- **Strikes aim, and reach.** Aimable states pitch the spine toward a target —
  the controller's point when input sets `fighter.aimPoint`, else the nearest
  opponent (render.js) — and **two-bone IK** (`src/ik.js`) then solves the
  striking limb so the hand points at it exactly. The solve re-aims without
  re-lengthening: the clip's own extension is preserved and only the direction
  tracks, so a jab stays a jab while landing at any angle. IK ramps in over the
  wind-up so the clip keeps its anticipation. Clips are authored aim-neutral;
  the workbench's draggable crosshair runs the same math the game does.

## Gameplay parity

`bodyWidth` and `headHeightTarget` stay sprite-derived on **every** backend: a
model changes how a fighter looks, never how they play. The delivery bears the
burden instead — a rig must match its fighter's sprite silhouette, checked by
overlay in the workbench. Full reasoning in [docs/plan.md](docs/plan.md).

## Contract

Everything here honours what `src/render_backend.js` documents: `drawCharFrame`
returns **false** only when nothing could draw (render.js then paints its
placeholder), and leaves the canvas context exactly as it found it. Verified by
`tools/smoke_billboard.mjs`, which is phase B0's exit criteria as a script.
