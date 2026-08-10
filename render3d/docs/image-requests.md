# render3d Image Requests — the 2D images the 3D pipeline needs

The `?render=3d` track consumes 2D images at two points: as **inputs to
model generation** (Tripo-style image-to-3D is a named sourcing route in
[plan.md §5](plan.md)) and as **texture ingredients** the anime pass reads at
runtime. Those are 2D deliverables, so this file follows the 2D art rules
([docs/asset-requests.md](../../docs/asset-requests.md)): everything here is
outstanding, and the rounds are lettered **DI1, DI2…** so they never collide
with the sprite rounds (numbers), the billboard rounds (B) or the model
rounds (D).

## Delivered

**Yuji's DI1–DI3 and the shared DI4 texture have all arrived** (with the 2D
round-18 batch) and are in the repo, so the sentence above is no longer true of
everything here:

| Round | File | Landed at |
|---|---|---|
| DI1 | `yuji_turnaround.png` | `render3d/docs/reference/yuji_turnaround.png` — four views (front, ¾-front, side, back) on white, consistent eye-line, arms clear of the body: the seed an image-to-3D pass wants |
| DI2 | `yuji_face.png` | `render3d/docs/reference/yuji_face.png` |
| DI3 | `yuji_shade.png` | `render3d/docs/reference/yuji_shade.png` |
| DI4 | `eye_highlight.png` | `render3d/assets/textures/eye_highlight.png` — 128×128, the roster-wide catchlight |
| DI4 | `yuji_mouth_sheet.png` | `render3d/assets/textures/yuji_mouth_sheet.png` — 1024×256, the optional four-cell strip |

**D1 is unblocked**: the pilot model round has every 2D input it named. The
rounds below stay open for each further fighter a D-round names — the briefs
are per fighter, and only Yuji has been drawn.

Deliver to the standard 2D intake unless a row says otherwise:

```
assets/intake/render3d/<char>_turnaround.png     DI1 boards
assets/intake/render3d/<char>_face.png           DI2 face sheets
assets/intake/render3d/<char>_shade.png          DI3 shade palettes
assets/intake/render3d/eye_highlight.png         DI4 shared face textures
assets/intake/render3d/<char>_mouth_sheet.png    DI4 per-fighter (optional)
```

Every request keys off the same canonical appearance reference the sprite
rounds use: `assets/reference/canon/<char>_idle.png`. Where a board must
also match in-game reads, the sprite set at `sprites/assets/<char>/` is the
storyboard.

---

## Round DI1 — model-generation turnaround boards (the Tripo inputs)

One board per fighter being modelled in the current D-round, sized for
image-to-3D seeding: **a single 2048×1024+ PNG, clean white or transparent
background**, containing the fighter in a neutral standing pose from
**front, 3/4-front, side, and back** at consistent scale and eye-line, flat
colors from the canon palette, **no dramatic lighting, no perspective, no
overlapping limbs** (arms slightly away from the body — near-A-pose reads
best for reconstruction). Face visible and on-model in the front view; the
back view must answer every question the sprites never had to (hair back,
uniform back, prop stowage).

A first-draft board can be composited from existing art:
`python tools/build_model_reference.py <char>` assembles the canon reference
plus the fighter's key sprites into a labelled board at
`render3d/docs/reference/<char>_board.png`. That composite is a brief for a
human or a seed for generation — **the request here is for the drawn
turnaround**, because sprites only ever show the one ¾ view and mirror the
rest, which is exactly what a 3D model cannot be built from.

**Deliverable: 1 board per fighter, gated to the fighters the open D-round
names** (D1: `yuji_turnaround.png` only).

## Round DI2 — face sheets (the face-first gate's reference)

AI-generated meshes fail at faces first (plan §9), and the workbench's
sweeping-light check needs something to judge AGAINST. Per fighter: one
sheet, front + ¾ + profile of the **head only**, at least 512px per view,
canon palette, neutral expression — the drawn truth of the jawline, the eye
shapes, the hair clumping and parting side. Hair clump direction matters:
the modeller combs the normals along it (D-spec addition 3).

**Deliverable: 1 sheet per fighter, same gating as DI1.**

## Round DI3 — shade palette swatches

The two-band ramp paints shadows from a palette, not from darkness
(render3d/src/toon.js `shadeTint`, overridable per material). Per fighter:
one small swatch sheet pairing each major material region (skin, hair,
uniform top, uniform bottom, props) with its **lit fill and its painted
shadow color**, taken from or consistent with the fighter's own sprite
shading. This is a color decision, not a texture: the numbers land in the
.glb's material extras (or the manifest's `toon` block) at intake, and the
sheet is what review holds them against.

**Deliverable: 1 swatch sheet per fighter, same gating as DI1. Format free —
a labelled PNG grid is fine.**

## Round DI4 — shared face textures *(one-time, roster-wide)*

The eyes-and-face rules (plan §4) run on small shared textures rather than
per-fighter art:

- `eye_highlight.png` — the camera-facing catchlight sprite: soft-edged
  white/near-white shapes on transparency, 128×128, one primary highlight +
  one small secondary. One texture serves the roster; per-fighter tinting is
  engine-side.
- `<char>_mouth_sheet.png` *(optional, per fighter, unblocking)* — a 4-cell
  strip (idle / hurt / ult-shout / win-grin) matching the fighter's face
  sheet style, 256×256 per cell, for the mouth texture-swap regions the
  D-spec lists in extras. No fighter ships blocked on this; the neutral
  modelled mouth is the default.

**Deliverable: 1 shared highlight texture now; mouth sheets ride whichever
D-round their fighter ships in.**

---

## Not requested here, on purpose

- **Stage light references** — the stage light rig derives everything from
  the stage `tint` already in src/stages.js; no new images.
- **Contact shadows** — rendered from the model's own pose when that dial
  ships; no sprite.
- **Toon ramp textures** — the two-band ramp is analytic (toon.js), not a
  lookup texture; there is nothing to draw.
- **Smear shapes** — geometry authored inside clips (D5), not images.
