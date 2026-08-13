# Image Requests — every image still to draw

**This is the one image-request document.** Every render mode's requests are
here, in their own section, whatever pipeline they feed. If you are drawing
or generating anything 2D for this project, this file is the list, and the
per-mode documents point here rather than keeping their own.

**It is generated** by `node tools/build_image_requests.mjs` from the
documents that author each round, plus the manifests and the files on disk.
Do not edit it; edit the source round and re-run. `--check` fails when it is
stale, and also when a source has an open round the tool did not recognise —
that second one is the guard, because a round written in an unexpected shape
is exactly how 172 images once went missing from this list.

**29 images outstanding.**

- **The sprite game** — 24 images, round 20
- **The live-3D anime path** — 5 images

## Rules that hold everywhere here

- **The canon reference is the subject.** A fighter's own `<char>_idle.png`
  under `assets/reference/canon/` carries their costume, proportions, palette,
  line weight and shading. The drawing is that character, not an
  interpretation of them.
- **The character block goes in the prompt verbatim.** All of them are at the
  bottom of this file.
- **Any subset is useful.** Everything here lands per fighter or per file, and
  anything undelivered keeps whatever the engine does today. Nothing in this
  file blocks play.

**The modes want opposite deliveries, and it is the one thing worth not
getting wrong.** Sprite rounds are keyed plates — flat magenta `#FF00FF` or
grey `#808080` screen, one subject, margin on all four sides, trimmed at
intake. The 3D inputs are the reverse: a turnaround wants clean white or
transparency, a swatch sheet wants labels, and nothing about them is keyed or
trimmed. Applying either mode's rules to the other produces a file its
pipeline cannot use. Each section states its own.

---

# The sprite game

Art for the game as a player sees it: `?render=sprite`, the default, and
the path all 27 fighters actually ship on. Keyed plates, delivered to
`assets/intake/`, trimmed and measured on import.

**24 images, round 20.** Authored in
[docs/asset-requests.md](asset-requests.md) and reproduced whole below.

- **20B** — Twenty backgrounds, re-extended from the paintings they replaced (20 images)
- **20E** — Yuji's four Round 20 poses (4 sprites)

## 20B. Twenty backgrounds, re-extended from the paintings they replaced — 20 images

**This is a re-request of 18E against a different input: the old painting
itself.** 18E asked for twenty boards repainted at 3200×1800 and got exactly
that — the resolution problem it was written to fix is fixed, and nothing here
is a complaint about sharpness. What it did not ask for, and so did not get, is
*the same picture*. Each plate was drawn fresh from the board's brief, so twenty
scenes were re-invented at the same time as they were enlarged, and the result
against the 3D camera's crop reads **sparser and darker than the paintings it
replaced** — more empty middle distance, less of the lit, busy, close detail the
old boards put right behind the fighters.

So: keep the resolution win, take the composition back. **Extend each previous
painting outward instead of replacing it.**

### The previous paintings are the input

They are in the repo, at **`assets/backgrounds/flat/`** — moved there from
`assets/reference/backgrounds_previous/` when this request was written, because
they are runtime art again: the flat camera now draws them (`backgroundFile()`
in `src/stages.js`), which is the half of this that needed no art at all. Flat
mode shows a whole plate, so pointing it back at the paintings composed for a
whole plate fixed flat mode the same afternoon. 3d mode is what this request is
for.

**The input image is the brief.** There is no scene description below and there
should not be one — the board being asked for is the board that is already
there, and any wording paraphrasing it is a chance to drift. Open the file.

### The one rule

> **Keep the source painting as the picture. Extend the scene outward by 30% on
> each of the four sides — same place, same moment, more of it — and deliver the
> whole thing at 3200×1800 or larger, exactly 16:9.**

30% on each side is **1.6× linear**, so the source painting ends up as the
**centre 62.5%** of the delivered plate, in both dimensions:

| delivered plate | the source painting occupies | new ring |
|---|---|---|
| 3200×1800 (minimum) | centre **2000×1125** | 600 px left/right, 337 px top/bottom |
| 4096×2304 (preferred) | centre **2560×1440** | 768 px left/right, 432 px top/bottom |

**Why 30% and not more.** The 3D camera over-fills its frustum on purpose
(×1.5 height, ×1.35 width — `src/camera3d/stage_geo.js`), so only the centre
**49.4%** of a plate's width is ever on screen. Against a 1.6× extension that
visible crop is **79% of the source painting**, centred — so what a player sees
in 3d becomes the old board, very slightly cropped, instead of a different
painting. The ring is not scenery anybody is meant to look at: it exists so no
dolly, yaw or roll can swing past the edge. Extending further would push the old
composition back out of frame, which is the fault being fixed.

The 3D crop of a 3200×1800 delivery is 1581 source pixels across 1280 CSS
pixels — still a downscale, so 18E's sharpness holds. 4096×2304 gives 2023 and
is comfortable at DPR 2, which is why it is preferred.

### What the ring may contain

- **More of the same scene, continued.** Same architecture, materials, weather,
  time of day, light direction and colour temperature; the same painterly style
  and line weight. A wall keeps going, a street keeps receding, a canopy of
  branches keeps spreading.
- **Nothing that reads as a second picture.** No new focal subject, no character,
  no creature, no large new light source, no text, watermark, border or vignette.
  If the ring is interesting enough to look at on its own, it is wrong.
- **Nothing painted at foreground depth in the centre 49.4%.** That is 18E's
  standing rule and it still holds: the near field belongs to the garnish layer
  (`src/camera3d/garnish.js`), which draws cards in front of the backdrop and
  will overlap anything painted there. Where a source painting already has a
  foreground element in its centre, **leave it** — it is the board players know,
  and the garnish placement is checked per board after delivery.

### Do not re-light the middle

The other half of what feels wrong is exposure. Match the source plate's
**brightness, contrast and palette exactly** where the ring meets it, and do not
take the opportunity to grade the centre — no darkening, no desaturating, no
"cinematic" cool cast. Note that the renderer already lays a 30% black wash and
the stage's tint over the plate before a player sees it
(`drawBackdrop()` in `src/render.js`), so a plate that looks a little bright and
a little saturated on its own is the one that lands correctly in the game.

Resampling the centre is unavoidable — a 1600×900 source becomes 2000×1125 at
the minimum delivery size — so upscale it cleanly and keep its detail. **Do not
repaint it.**

### The twenty, and what to open

Filenames are the ones `src/stages.js` registers, so nineteen boards need no
code change and Shibuya Night needs none either as long as it is delivered as
`.jpg` (the source is the older `.webp`; the live plate is already `.jpg`).

| Board | Stage key | Source file (under `assets/backgrounds/flat/`) | Source size | Region to extend |
|---|---|---|---|---|
| Training Bridge | `trainingBridge` | `training_bridge.jpg` | 1920×1080 | whole image |
| Quiet Hall | `quietHall` | `quiet_hall.jpg` | 1920×1080 | whole image |
| Flooded Gate | `floodedGate` | `flooded_gate.jpg` | 800×437 | centre **777×437** ⚠ |
| Shibuya Night | `shibuyaNight` | `shibuya_night.webp` | 1200×675 | whole image |
| Curse Maw | `curseMaw` | `curse_maw.jpg` | 1920×1640 | centre **1920×1080** ⚠ |
| Garden Steps | `gardenSteps` | `garden_steps.jpg` | 1600×900 | whole image |
| Lantern Corridor | `lanternCorridor` | `lantern_corridor.jpg` | 1600×900 | whole image |
| Sunken Crossing | `sunkenCrossing` | `sunken_crossing.jpg` | 1600×900 | whole image |
| Neon Split | `neonSplit` | `neon_split.jpg` | 1600×900 | whole image |
| Bone Sanctum | `boneSanctum` | `bone_sanctum.jpg` | 1600×900 | whole image |
| Bridge Duel | `bridgeDuel` | `bridge_duel.jpg` | 1600×900 | whole image |
| Academy Hall | `academyHall` | `academy_hall.jpg` | 1600×900 | whole image |
| Mist Pier | `mistPier` | `mist_pier.jpg` | 1600×900 | whole image |
| Crosswalk Rush | `crosswalkRush` | `crosswalk_rush.jpg` | 1600×900 | whole image |
| Cursed Teeth | `cursedTeeth` | `cursed_teeth.jpg` | 1600×900 | whole image |
| River Gate | `riverGate` | `river_gate.jpg` | 1600×900 | whole image |
| School Wing | `schoolWing` | `school_wing.jpg` | 1600×900 | whole image |
| Empty City | `emptyCity` | `empty_city.jpg` | 1600×900 | whole image |
| Billboard Roof | `billboardRoof` | `billboard_roof.jpg` | 1600×900 | whole image |
| Domain Core | `domainCore` | `domain_core.jpg` | 1600×900 | whole image |

**The two ⚠ rows are the boards whose source is not 16:9.** Take the centred
16:9 region first — that is what the game has always shown of them, since
`drawBackdrop()` cover-fits — and extend *that*, so the delivery is 16:9
throughout and nothing the player knows is cropped by the change.

**Flooded Gate is the hard one.** Its source is 800×437, so the centre of a
3200×1800 delivery is a 2.6× upscale of a small, soft image and clean
resampling will not carry it. This is the one board where **re-detailing inside
the kept composition is expected**: same gate, same water, same framing, same
palette and light, painted at the delivered resolution. It is also the board
where a 4096×2304 delivery buys the least, so 3200×1800 is fine for it.

### Delivery

`assets/intake/backgrounds/<file>.jpg` — JPEG, high quality, the filenames in
the table above (Shibuya Night as `shibuya_night.jpg`). No alpha, no key screen:
a background is a finished picture, not a subject on a field, and it takes the
short path through intake — no keying, no measuring, no manifest entry (see
[assets/intake/README.md](../assets/intake/README.md)).

**On landing, archive the plate being replaced** into
`assets/reference/backgrounds_18e/`, the same way 18E archived what it replaced.
`assets/backgrounds/flat/` is **not** an archive and must not be touched: the
flat camera draws those twenty files every match.

Checked on delivery, per plate:

1. exactly 16:9, at least 3200×1800;
2. the centre 62.5% is the source painting — not a redraw of it — at matching
   brightness and palette;
3. the centre 49.4% stands as a finished picture, which follows from (2);
4. no text, border, watermark or signature anywhere, ring included.

---

## 20E. Yuji's four Round 20 poses — 4 sprites

**The remainder of 20C and 20D, and the whole of it is one fighter.** Both
rounds asked for one file per fighter, both arrived as twenty-seven files, and
both of those twenty-seven were Mahoraga rather than Yuji. Mahoraga is animated
out of a character sprite set and has an intake directory like everyone else,
but he is a summon and is not on `CHARACTER_KEYS`; his four are landed and
welcome, and they are not a fighter's. So the count was right twice and the
roster was wrong twice, which is now a row in
[pose-brief.md § 5](../sprites/docs/pose-brief.md#5-the-faults-that-keep-coming-back)
and a `ROSTER COVERAGE` line that `tools/intake.py` prints on every delivery.

**Nothing is blocked.** Yuji draws exactly what the whole roster drew before
round 20: `grabReach` falls back to his first light-attack frame, `grabHold` to
`charge`, `grabbed` to `hurt`, and both dash attacks to his standing strike
(`src/characters.js`). He is the one fighter whose grab still reads as a frozen
jab, which is precisely the thing 20C was written to end.

| File | Pose line |
|---|---|
| `assets/intake/yuji/grab_reach.png` | "a committed forward lunge with one open, grasping hand leading — reaching to seize, not to strike — the other arm up as a guard" |
| `assets/intake/yuji/grab_hold.png` | "gripping an unseen opponent at arm's length by the collar: front hand closed in a fist at chest height, weight planted, body coiled to heave" |
| `assets/intake/yuji/grabbed.png` | "seized and struggling: body arched back from the collar, feet scrabbling, both hands prying at an unseen grip at their own chest" |
| `assets/intake/yuji/attack_dash.png` | "sprinting forward and striking at the same moment, body low and driving, weight thrown ahead of the leading foot, back leg extended behind, striking arm fully extended forward along the direction of the run, trailing arm swept back, at the instant of impact" |

The two grab poses have to answer the same grip-point rule the other twenty-six
already do — **fist and prying hands both at chest height on the leading edge of
the body** — because the game draws Yuji's `grab_hold` against somebody else's
`grabbed` at a fixed gap, so his is not judged on its own. Open any delivered
pair (`sprites/assets/gojo/grab_hold.png` beside
`sprites/assets/nobara/grabbed.png`) and match the height.

Otherwise the standard spec: grey key screen (Yuji is on the warm-palette list),
facing right, one zoom matched to his own `idle_a`, at least 600 px of body, one
subject per file. His character block and canonical reference are above, and
[pose-brief.md](../sprites/docs/pose-brief.md) has all four pose lines in the
set they now belong to.

---

# The live-3D anime path

2D images the `?render=3d` pipeline consumes: inputs that models are
GENERATED from, and textures the anime pass reads at runtime. They serve
`?render=billboard` too, which reads the same rigs. These are NOT keyed
plates — each round states its own delivery.

**5 images.** Authored in
[render3d/docs/image-requests.md](../render3d/docs/image-requests.md) and reproduced whole below.

- **DI1** — model-generation turnaround boards (the Tripo inputs) (0 images)
- **DI2** — face sheets (the face-first gate's reference) (0 images)
- **DI3** — shade palette swatches (0 images)
- **DI4** — shared face textures (0 images)
- **DI5** — regeneration seeds (5 images)

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

**THE WHOLE FIGURE MUST FIT, WITH MARGIN.** Every view complete inside the
canvas — the crown of the head, any horns, hair or headgear, and the feet — with
clear white on all four sides. Twelve of the first twenty boards were refused
for exactly this: the figures were scaled to fill the frame and the tops of
their heads went off it, which on a model-generation seed is the one thing that
cannot be worked around. A smaller figure with air around it beats a large one
that is cut. `tools/import_render3d_images.py` measures this at import and
refuses a board whose head runs off the edge.

**Deliverable: 1 board per fighter.** Twelve are outstanding — the list is in
the refusal note above, and in
[docs/image-requests.md](../docs/image-requests.md), which resolves it
against what is on disk.

### DI1: who is still owed one — 0 of 28

A fighter whose rig has already been delivered is NOT listed: a turnaround board's only job is to be the thing a model is generated from, and theirs exists.

**Nothing outstanding.** Every fighter has one.

## Round DI2 — face sheets (the face-first gate's reference)

AI-generated meshes fail at faces first (plan §9), and the workbench's
sweeping-light check needs something to judge AGAINST. Per fighter: one
sheet, front + ¾ + profile of the **head only**, at least 512px per view,
canon palette, neutral expression — the drawn truth of the jawline, the eye
shapes, the hair clumping and parting side. Hair clump direction matters:
the modeller combs the normals along it (D-spec addition 3).

**Deliverable: 1 sheet per fighter, same gating as DI1.**

### DI2: who is still owed one — 0 of 28

Listed for delivered rigs too — this is what the face-first review gate reads AGAINST, so it is wanted whether or not the model exists.

**Nothing outstanding.** Every fighter has one.

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

### DI3: who is still owed one — 0 of 28

Listed for delivered rigs too: these numbers land in the rig's material extras at intake, and not one delivered rig carries a `toon` block today — all of them are running on engine defaults.

**Nothing outstanding.** Every fighter has one.

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

### DI4: who is still owed one — 0 of 28

The shared eye-highlight texture is delivered; these are the optional per-fighter mouth sheets. Nothing ships blocked on one.

**Nothing outstanding.** Every fighter has one.

## Round DI5 — regeneration seeds *(the boards that produced broken models)*

Some delivered models are wrong in ways nothing downstream can fix, because
what is wrong with them is missing or invented GEOMETRY. Mei Mei has horns.
Momo has one leg and a broom where the other should be. Both survived a facing
review, a size review and a stance pass before anybody said so out loud, which
is its own lesson.

**Both faults trace to their seed board**, and both boards are on DI1's refused
list — they were used anyway, because rigs for the whole roster landed while
the refusal was being sorted out and DI1 was closed as "overtaken, not
completed". This is that round reopening, for the fighters it actually cost.

### What went wrong, measured

`blender -b -P tools/audit_model_health.py` weighs the mesh bound to each limb
against the roster's own median and reports what cannot be true of a body. It
is the acceptance gate for this round's models as well as the evidence for it;
the full table is at [reference/model-health.json](../render3d/docs/reference/model-health.json).

| Fighter | What the model does | What the mesh says |
|---|---|---|
| `momo` | one leg, a broom standing in its place, broom in fragments | one leg is **51%** of a normal leg and the other **181%**; the prop carries 4201 of weight — the broom is fused into the body |
| `meimei` | two horns rising from the crown | **5.8% of her stature** sits above her head, and it is mesh: it is still there with the hair chain removed and the chain bones reset |
| `maki` | polearm merged into the forearm | one arm is **167%** of a normal arm, and 8% of stature sits above the head |
| `gakuganji` | guitar merged into the arm | one arm is **158%** of normal |
| `uro` | proportions the stance pass could not settle | legs **55%** of normal, and **29% of stature above the head** |

`nanami`, `nobara` and `yuji` show uneven arms (0.55–0.71) without a fused
prop — worth looking at in the workbench's **Mannequin(s)** view before
spending credits, not worth a regeneration on the number alone.

### The board, and the four rules that are new

Same deliverable as DI1 — **one 2048×1024+ PNG per fighter, front, ¾-front,
side and back, flat colour, no dramatic lighting, no perspective, clean white
or transparent ground** — with everything DI1 asks for, plus what these two
failures taught. Each rule below is here because a specific model is broken
without it.

1. **THE WHOLE FIGURE, WITH MARGIN — INCLUDING THE CROWN.** Every view
   complete inside the canvas: the top of the head, any hat, horn, hair or
   headgear, and the feet, with clear ground on all four sides. Mei Mei's board
   was cut at her *eyes* in all four views, so the generator had nothing to
   reconstruct a skull from and invented one. What it invents is spikes.
   `tools/import_render3d_images.py` REFUSES a board whose head runs off the
   top, and now measures the other three edges too — it warns rather than
   refuses on those, because the top edge is proven (twelve boards, two broken
   models) and the others are not: Todo's board runs 107px off the bottom and
   his model measures clean.

2. **PROPS DO NOT TOUCH THE BODY.** No weapon, broom, axe, guitar or bag may
   overlap or touch the figure's silhouette in ANY view. Draw it held at
   arm's length, or lay it beside the figure and give it its own isolated
   view. Momo's broom stood against her leg in three views of four, and image-
   to-3D cannot separate a long thin object from a limb it is touching —
   so it did not: her leg *is* the broom.

3. **NOTHING LONG AND THIN PARALLEL TO A LIMB.** Even clear of the body, a
   staff drawn vertically beside a standing leg reads as that leg's second
   silhouette. Angle it — 30° off vertical is enough — or lay it horizontally
   below the figure.

4. **DAYLIGHT BETWEEN THE LEGS, AND BETWEEN ARMS AND TORSO.** A visible gap in
   the front and back views, ankles apart, hands clear of the hips. DI1 asked
   for a near-A-pose; this says why, and extends it downward.

Two more that cost less but are worth stating:

5. **HAIR THAT HANGS IS DRAWN ALONG ITS WHOLE LENGTH** in the side and back
   views, clear of the head's silhouette — a braid or a tendril the engine
   simulates has to be findable as its own shape. Mei Mei's braid chain
   extraction grabbed the top of her skull instead of her braid, because on
   this model the braid is welded to the head.

6. **THE BACK VIEW ANSWERS THE QUESTIONS THE SPRITES NEVER HAD TO** — hair
   back, uniform back, where the prop is stowed — since it is the only view of
   that half of the fighter the generator will ever see.

**Deliver to** `assets/intake/render3d/<char>_turnaround.png`, replacing the
refused board. The old plates stay at `assets/reference/round21/di1_cropped/`
for comparison.

**Deliverable: 1 board per fighter listed above.** The model round that
consumes them is [D6](../render3d/docs/asset-requests.md#round-d6--regeneration-the-workbench-catches-open).

---

### DI5: who is still owed one — 5 of 28

Named by MEASUREMENT, not by eye: tools/audit_model_health.py weighs the mesh bound to each limb against the roster's median and reports what cannot be true of a body. A fighter leaves this list when a replacement board lands — not when their model is regenerated, since regenerating from the same board is what produced the fault.

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Maki Zen'in | `maki` | 170 cm | polearm | `assets/reference/canon/maki_idle.png` | Playful Cloud |
| Takako Uro | `uro` | 190 cm* | unarmed | `assets/reference/canon/uro_idle.png` | Sky-palm effects are engine-side |
| Yoshinobu Gakuganji | `gakuganji` | 190 cm* | caster | `assets/reference/canon/gakuganji_idle.png` | Guitar, slung and played |
| Mei Mei | `meimei` | 190 cm* | heavy | `assets/reference/canon/meimei_idle.png` | Braided axe; braid needs bones |
| Momo Nishimiya | `momo` | 150 cm | polearm | `assets/reference/canon/momo_idle.png` | Broom — also ridden; see her kit |

---

# The character blocks

Used **verbatim** as `[CHARACTER BLOCK]` in every prompt above — this is how
a fighter stays the same character across their sprites, their card and
their turnaround. Reproduced from
[asset-requests.md](asset-requests.md#character-blocks), which owns them.

**Where the block and the canon reference disagree, the reference wins.**
Every fighter now has a `<char>_idle.png`, regenerated from their approved
idle, and it carries the figure scale, palette and shading the delivered set
actually has — which block text cannot. The wiki's (Anime) render answers
design questions the reference leaves open, and is where the blocks came
from: three were rewritten in round 9E because they described characters who
looked nothing like their anime designs, and Uro's again in round 18 after an
ambiguous sentence was drawn the wrong way twice.

| Key | Block |
|---|---|
| `yuji` | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" |
| `todo` | "Aoi Todo from Jujutsu Kaisen, very large muscular man with black hair in a short topknot and thick eyebrows, wearing a dark navy jacket over a maroon shirt with dark trousers" |
| `yuki` | "Yuki Tsukumo from Jujutsu Kaisen, tall athletic young woman with very long straight blonde hair falling past her waist with two tufts framing her face and brown eyes, wearing a sleeveless dark indigo mandarin-collar top with gold frog clasps at the shoulder, a grey buttoned corset belt at the waist, high-waisted light blue jeans and brown ankle boots" |
| `uro` | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a fierce confident grin, pale violet-pink hair sweeping upward and outward in wild flame-like curling points, sharp violet eyes with heavy dark eyeliner, large gold cylindrical drop earrings, a black choker and a black band on each wrist, her only covering **two separate bands of pale-cyan cloud vapour with soft drifting edges — one wrapped across the chest, one at the hips — with the midriff BARE between them and never a single garment joining the two**, bare arms and legs, barefoot with violet-painted nails" |
| `mahito` | "Mahito from Jujutsu Kaisen, slim young man with pale blue-grey patchwork skin covered in stitched seams, long grey-blue hair in a loose bun, dark sleeveless vest and dark trousers" |
| `sukuna` | "Ryomen Sukuna the King of Curses from Jujutsu Kaisen, bare-chested muscular man with spiky salmon-pink hair, four eyes, black tattoo band markings across his face, chest and arms, dark loose trousers with a black sash" |
| `choso` | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" |
| `hakari` | "Kinji Hakari from Jujutsu Kaisen, tall young man with slicked-back blond hair and an undercut, wearing a black school jacket hanging open over his bare chest, dark trousers" |
| `yuta` | "Yuta Okkotsu from Jujutsu Kaisen, slim young man with messy black hair, wearing an all-white long-sleeve school uniform with white trousers, a katana at his hip" |
| `nanami` | "Kento Nanami from Jujutsu Kaisen, tall blond man with a straight bob and tinted rectangular glasses, wearing a tan-beige suit with a patterned tie, carrying a blunt-tipped cleaver sword" |
| `toji` | "Toji Fushiguro from Jujutsu Kaisen, tall muscular man with short black hair and a vertical scar at the corner of his mouth, fitted black short-sleeve T-shirt and loose dark charcoal trousers with a dark sash" |
| `reggie` | "Reggie Star from Jujutsu Kaisen, tall lean man with straight shoulder-length blond hair parted at the side, heavy-lidded tired eyes and a narrow pointed chin beard, wearing a shaggy knee-length tunic and matching shoulder cape built from layered rows of torn white paper receipts with small pale mint-green printed tabs, bare arms and bare lower legs, barefoot" |
| `nobara` | "Nobara Kugisaki from Jujutsu Kaisen, young woman with short auburn-orange bob hair, navy school uniform dress with a belt, dark tights and brown boots, small hammer in hand" |
| `meimei` | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| `maki` | "Maki Zen'in from Jujutsu Kaisen, athletic young woman with dark green hair in a high ponytail and rectangular glasses, navy school uniform tunic over dark leggings, carrying a long naginata polearm" |
| `momo` | "Momo Nishimiya from Jujutsu Kaisen, petite young woman with shoulder-length auburn hair and a large dark witch hat, dark navy Kyoto uniform dress, riding or holding a wooden broom" |
| `gojo` | "Satoru Gojo from Jujutsu Kaisen, tall slim young man with spiky white hair and a black blindfold over his eyes, wearing a black high-collared jujutsu uniform with dark trousers and black boots" |
| `megumi` | "Megumi Fushiguro from Jujutsu Kaisen, young man with spiky black hair, wearing a dark navy high-collared jujutsu uniform with dark trousers and brown boots" |
| `inumaki` | "Toge Inumaki from Jujutsu Kaisen, slim young man with light grey-blond hair, wearing a dark navy high-collared school uniform zipped up over his mouth, white sneakers" |
| `mechamaru` | "Ultimate Mechamaru from Jujutsu Kaisen, a tall humanoid cursed-corpse puppet with a smooth clay-brown carved head, two round glowing green lens eyes and a small third lens on the forehead, a fixed grin of bared square teeth, a thick white puffy scarf around the neck, wearing a dark navy high-collared jujutsu uniform tunic with a white sash and very wide baggy navy trousers, bare carved wooden hands and bare wooden feet" |
| `gakuganji` | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern hunched elderly man, bald on top with long straight white hair falling past his shoulders at the sides, a long thin white beard and drooping moustache, deeply wrinkled face with hooded eyes and gold hoop earrings, wearing a cream-white kimono top under a black band T-shirt with the kimono sleeves hanging loose, wide dark-purple hakama trousers, white tabi socks and wooden geta sandals, a crimson-red Flying-V electric guitar slung across his chest on a strap" |
| `geto` | "Suguru Geto from Jujutsu Kaisen, tall man with long black hair in a topknot, wearing a black traditional robe with gold trim over dark clothing" |
| `jogo` | "Jogo from Jujutsu Kaisen, a volcano-headed cursed spirit with a single large eye, cracked earthen skin, wearing a yellow-and-black spotted fur mantle over dark trousers" |
| `panda` | "Panda from Jujutsu Kaisen, a large anthropomorphic panda with black and white fur, muscular build, a small teal cursed-energy core visible on his shoulder" |
| `hanami` | "Hanami from Jujutsu Kaisen, tall powerfully built cursed spirit with a lean muscular pale bone-cream body marked by thick black brushstroke stripes down the face, arms, chest and abdomen, a rigid mask-like face with hollow black eye sockets, pale slit pupils and a wide fixed grin of large square teeth, a crown of thick tan antler horns curving up and back over the scalp, the entire right shoulder and arm wrapped in heavy white cloth bound close to the body with stitched seams where it meets the chest, a white cloth sash knotted at the waist with the ends hanging, wide baggy black hakama trousers gathered at the ankles, barefoot with broad clawed feet and long dark claws on both hands" |
| `dagon` | "Dagon from Jujutsu Kaisen, a tall broad hunched humanoid cursed spirit with deep red outer limbs and a tan inner chest and belly, a black midsection, a smooth red octopus-like head with blank pale eyes and a beard of thick red tentacles hanging from the jaw, black bat-like wings folded at the lower back, four heavy clawed fingers per hand and broad two-toed feet" |
| `kurourushi` | "Kurourushi from Jujutsu Kaisen, a tall cockroach cursed spirit draped head to floor in a smooth glossy black shroud, a maroon insect face with eight red-and-orange eyes in uneven pairs and a wide grin of human teeth behind layered jaws, six very long thin purple antennae sweeping out from the head, dark chitinous insect legs splayed out at the base of the shroud, wielding a long dark cursed sword with six firing barrels along its spine" |
| `mahoraga` | "Mahoraga from Jujutsu Kaisen, the Divine General shikigami — a towering pale-white humanoid with grey sculpted musculature, a long segmented tail, and a fanned crest of white blade-like spines sweeping back from his head. **A brass eight-spoked karma wheel is mounted on the headdress behind his skull, with a ball at the end of each spoke** — it is part of his head and turns with it. Bandaged wrap and beads at the throat, a torn dark charcoal skirt over a pale sash, purple-grey wraps at wrists and ankles, barefoot, carrying a long pale bone-textured sword" |

---

# Outstanding by manifest, not by request

The other half of the question, and a narrower one: poses whose art EXISTS
and is wrong. A workbench flag says so directly; a pose drawing a file that
is not its own says so silently, which is how seven of them stayed invisible
until round 18G. Neither can see a pose that was never drawn — that is what
the rounds above are for.

**Nothing outstanding.** No pose carries a replacement flag, and no pose is
drawing a file that is not its own.

Separately, **2 improvement requests** — the art works and is just
not as good as it should be. Nothing is blocked by one, and the standing
ones are alpha fixes to delivered files, which is repo work rather than a
request.
