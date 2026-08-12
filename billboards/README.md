# `billboards/` — one way of PRESENTING the 3D models

A card: the same rig `?render=3d` animates, rendered once through a fixed ¾
camera into a texture and blitted flat into the 2D world. That is the whole of
what lives here now.

**This is not a second model pipeline.** The rigs, the clips, the state
contract, the IK, the props and chains, the default pose set and every posing
layer belong to [`render3d/`](../render3d/) and are imported from it. billboards
defines only what makes a card a card:

```
billboards/
  src/
    billboard.js   the backend entry — which fighters have a rig, and the
                   adapter that hands the 2.5D camera a TEXTURE rather than
                   geometry (render3d hands over the rig itself)
    renderer.js    the offscreen WebGL canvas, the fixed ¾ ortho camera, and
                   the pose cache that is the entire economy of this path
    blit.js        anchoring the card's foot line and mirroring it to face left
  workbench/       /billboards/workbench/ — how a fighter READS as a card,
                   beside the sprite it replaces. Read-only: the rig itself is
                   edited in the 3D workbench
  docs/            this path's plan, its asset spec and the B1 pilot writeup
```

It used to keep its own rig registry, its own copy of every `.glb`, its own
manifest and its own copies of states/ik/clips/props/mannequin. They were
byte-identical copies that drifted: a facing review turned 22 of 27 fighters in
render3d's manifest and this path went on drawing them the old way, and the
same happened again with size and stance a day later. One registry is the fix
that makes that class of bug impossible rather than merely fixed.

**Yuji plays as a model today** — round B1 is delivered: his rig is conformed to
spec and carries all 26 clips. What the pilot cost and what it found is
[docs/b1-yuji.md](docs/b1-yuji.md); the whole roster has rigs now.

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
- **[intake/README.md](intake/README.md)** — retired: rigs land in
  `render3d/intake/` and this path draws them.

three.js is shared with the 2.5D camera and lives at the repo root
(`../vendor/`, see its VENDOR.md); `src/` reaches it only through dynamic
`import()`, so sprite players never load it.

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
- **Two-handed weapons are a coupled solve** (`props.js TWO_HANDED_KINDS`,
  `ik.js applyTwoHandGrip`). During attacks and braced holds the off hand
  grips the weapon's shaft — measured from the rig's own geometry, never
  assumed — at the point nearest its shoulder. When the clip flings the
  weapon out of the off arm's reach (every authored strike does), the MAIN
  arm is pulled in until the shaft is graspable, which is exactly what a real
  two-handed strike looks like: hands near the body, the weapon tip doing the
  extending. Locomotion keeps the one-handed canon carry. Verified by
  `tools/smoke_twohand.mjs` against the delivered rig.

## Gameplay parity

`bodyWidth` and `headHeightTarget` stay sprite-derived on **every** backend: a
model changes how a fighter looks, never how they play. The delivery bears the
burden instead — a rig must match its fighter's sprite silhouette, checked by
overlay in the workbench. Full reasoning in [docs/plan.md](docs/plan.md).

## Contract

Everything here honours what `src/render_backend.js` documents: `drawCharFrame`
returns **false** only when nothing could draw (render.js then paints its
placeholder), and leaves the canvas context exactly as it found it. Verified by
`tools/smoke_billboard.mjs`, which is phase B0's exit criteria as a script,
and by `tools/smoke_facing.mjs` for camera facing and the nod axis of the live
layers — both shared with the render3d backend, both wrong on the first
delivery, and neither visible in a 384-pixel render.
