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

**49 images outstanding.**

- **The sprite game** — 49 images, round 22
- **The live-3D anime path** — 0 images

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

**49 images, round 22.** Authored in
[docs/asset-requests.md](asset-requests.md) and reproduced whole below.

- **22K** — The four rounds that ran without the newly promoted seven (49 sprites)

## 22K. The four rounds that ran without the newly promoted seven — 49 sprites

Seven fighters joined the select screen when their kits came out of
`STAGED_CHARACTER_KEYS`, and four roster-wide rounds had already run without
them: they were staged at the time, deliberately left out, and the rounds are
in the history. So each of the seven is short the same seven poses, and this
asks for all of them together rather than one round at a time.

**Nothing is broken meanwhile, which is exactly why it went unnoticed.** Every
one of these states falls back to art the fighter does have — the teeter to
their idle with the procedural lean `src/motion.js` supplies, the walk to the
run, the dash attack to the light strike, the grab set to a light attack, the
`charge` and `hurt` frames. It reads correctly enough that nobody notices, and
`node tools/check_pose_coverage.mjs` now says so out loud instead: it compares
every fighter's states against what has been drawn and fails on a gap no round
has asked for. That check is what turned a missing teeter into this list.

| Pose | Round it belongs to | What it must read as |
|---|---|---|
| `teeter` | [22A](asset-requests-history.md#22a-balanced-on-the-lip-the-teeter--27-sprites) | Balanced on the lip: weight shifted BACK from the drop, arms out, front foot at or just over the edge, head turned down toward the fall. Caught, not alarmed — the moment after realising the ground ran out |
| `walk_a`, `walk_b` | [21](asset-requests-history.md#round-21--the-walk-cycle) | The two contacts of an unhurried walk, one per leading leg — a stroll, not a slowed run |
| `attack_dash` | [20D](asset-requests-history.md#20d-the-dash-attack-pose--27-sprites) | The blow that ends a run, one pose: the run was the wind-up, so there is no coil to draw |
| `grab_reach` | [20C](asset-requests-history.md#20c-the-grab-poses--81-sprites) | A committed forward lunge with one open, grasping hand leading — reaching to seize, not to strike. The other arm guards |
| `grab_hold` | 20C | Gripping an unseen opponent at arm's length by the collar — front hand closed in a fist at **chest height on the leading edge of the body**, weight planted, coiled to heave. The opponent is NOT in the drawing |
| `grabbed` | 20C | Seized and struggling: body arched back from the collar, feet scrabbling, both hands prying at an unseen grip at their own chest, at that same chest height |

**The grip point is the one hard constraint**, carried over from 20C: the fist
in `grab_hold` and the prying hands in `grabbed` both sit at chest height on
the leading edge, because the game overlaps the two drawings at a fixed gap
(`holdGap` in `src/grab.js`). A fist drawn high on one fighter and low on
another makes every pairing look like they are holding different arguments.

**Facing.** Drawn facing RIGHT like every other pose. The teeter is drawn with
the drop on the right; the engine mirrors it for the left-hand lip and leans it
the correct way either side (`teeterLean` in `src/config_tuning.js`), so one
drawing serves both edges.

Seven poses each, for seven fighters — 49 sprites. Each fighter's own `idle_a`
is the canon for costume, proportions, palette and figure scale:

| Fighter | Sprites | Idle to draw against |
|---|---|---|
| Kashimo | `kashimo/teeter.png`, `kashimo/walk_a.png`, `kashimo/walk_b.png`, `kashimo/attack_dash.png`, `kashimo/grab_reach.png`, `kashimo/grab_hold.png`, `kashimo/grabbed.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kashimo/idle_a.png> |
| Yaga | `yaga/teeter.png`, `yaga/walk_a.png`, `yaga/walk_b.png`, `yaga/attack_dash.png`, `yaga/grab_reach.png`, `yaga/grab_hold.png`, `yaga/grabbed.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yaga/idle_a.png> |
| Naoya | `naoya/teeter.png`, `naoya/walk_a.png`, `naoya/walk_b.png`, `naoya/attack_dash.png`, `naoya/grab_reach.png`, `naoya/grab_hold.png`, `naoya/grabbed.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/naoya/idle_a.png> |
| Kirara | `kirara/teeter.png`, `kirara/walk_a.png`, `kirara/walk_b.png`, `kirara/attack_dash.png`, `kirara/grab_reach.png`, `kirara/grab_hold.png`, `kirara/grabbed.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kirara/idle_a.png> |
| Haruta | `haruta/teeter.png`, `haruta/walk_a.png`, `haruta/walk_b.png`, `haruta/attack_dash.png`, `haruta/grab_reach.png`, `haruta/grab_hold.png`, `haruta/grabbed.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/haruta/idle_a.png> |
| Tengen | `tengen/teeter.png`, `tengen/walk_a.png`, `tengen/walk_b.png`, `tengen/attack_dash.png`, `tengen/grab_reach.png`, `tengen/grab_hold.png`, `tengen/grabbed.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/tengen/idle_a.png> |
| Miwa | `miwa/teeter.png`, `miwa/walk_a.png`, `miwa/walk_b.png`, `miwa/attack_dash.png`, `miwa/grab_reach.png`, `miwa/grab_hold.png`, `miwa/grabbed.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/miwa/idle_a.png> |

**Tengen is white and grey.** The panes on his delivered set arrived carrying
the magenta screen they were shot against and have been neutralised in place
(`tools/depurple_panes.py`), so draw the robe and any barrier as white glass —
nothing on him is violet.

**The four throw poses are NOT in this list**, for the reason 20C gave when it
registered them: `throw_fwd`, `throw_back`, `throw_up` and `throw_down` each
play the heavy attack swung that way, a throw IS a heave in that direction, and
nobody on the roster has bespoke art for them. They are recorded as deliberately
unowed in `tools/check_pose_coverage.mjs` so the coverage check does not ask
for 136 sprites nobody wants.

# Round 23 — open

**Round 24's four staged fighters — Kirara Hoshi, Haruta Shigemo, Master
Tengen and Kasumi Miwa.** A separate round from 22 on purpose: 22's sets are
already being generated, and a delivery needs to say which batch it answers.
Everything about round 22B–22H's shape holds here unchanged — the kits are
live in code (`STAGED_CHARACTER_KEYS`), both workbenches list the four as
*(not on the roster yet)*, nothing blocks on this art, and the design
rationale is the round-24 section of [characters.md](characters.md).

The same two standing rules, restated so this round is self-contained:

**Absolute URLs.** This batch is expected to be generated outside the repo, so
every reference below is an absolute URL. The character blocks to use verbatim
are the `kirara`, `haruta`, `tengen` and `miwa` rows of the table above.

**The `_a` of an attack pair is the WIND-UP, and the pair has to OPEN.**
Restated here rather than left to the link, because the link is what has not
been reaching: `attack_light_a`, `attack_heavy_a`, `attack_air_a` and
`crouch_attack_a` are the coil — striking hand or weapon drawn BACK, shoulders
turned away from the target, weight on the back foot. The `_b` is the blow.

The check is one comparison, and it is between the two frames rather than
against anything else: **`_b` must reach further forward than its own `_a`, by
at least 0.05 of the fighter's standing height** — the shipped roster's median
pair opens by 0.10. Both frames are drawn at one zoom, so this needs no
placement; `python3 tools/audit_windup.py` measures every pair in the game.

Two ways round 22 broke it, and they have different fixes. Six of Yaga's and
Naoya's wind-ups were drawn about as extended as their own strikes — those need
redrawing. Kashimo's aerial pair was drawn correctly and delivered INVERTED,
the two filenames the wrong way round; that one is a swap, not a redraw.

**Work idle-first — the `idle_a` is its own delivery.** Generate each
fighter's `idle_a` alone first (plain, square-on stance per
[pose-brief.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/docs/pose-brief.md)); intake and approve it in the
sprite workbench; run `tools/build_canon_reference.py`; then generate the
other 35 poses **against that approved idle**, so costume, proportions,
palette, line weight and shading stay locked across the set. Once the idles
land on `main` they resolve at:

- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/kirara_idle.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/haruta_idle.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/tengen_idle.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/miwa_idle.png>

# Round 20 — delivered

**All four requests are in.** The last of them was Yuji's own four poses, which
landed as [20E](asset-requests-history.md#20e-yujis-four-round-20-poses--4-sprites) and are in the game:
his grab now reads as a grab and his dash attack as a lunge, like everybody
else's. Nothing in round 20 is outstanding.

- **~~44 of the 114 summon plates hold six creatures instead of one~~** —
  delivered. All forty-four came back as one figure each,
  `tools/check_summon_plates.py` passes on the whole tree of 114, and the seven
  authored hit boxes that were standing in for an unmeasurable plate came out
  with them.
- **~~Twenty backgrounds, re-extended from the paintings 18E replaced~~** —
  delivered, all twenty at 3200×1800, and in the game. Each one carries its
  source painting's composition rather than a fresh take on the brief, which is
  the whole thing 18E got wrong and the only thing this round was asking for.
  See [the history entry](asset-requests-history.md#20b-twenty-backgrounds-re-extended--delivered).
- **~~The grab poses~~** and **~~the dash attack pose~~** — delivered, 26
  fighters of 27 each, plus Mahoraga. Both are in the game: every one is a new
  pose key, so nothing was replaced and nothing waited for an approval. A grab
  now reads as a grab and a dash attack as a lunge, on everybody except Yuji.
- **~~Yuji's four~~** — [20E](asset-requests-history.md#20e-yujis-four-round-20-poses--4-sprites),
  delivered. 20C and 20D each asked for 27, one per fighter, and each arrived
  as 27 files with Mahoraga in Yuji's place; this was the correction, and it
  came back as the four missing drawings. Imported, anchored, and seeded a
  pose read each — the seeder had to learn that the REFERENCE character can
  gain frames too, since it was skipping him wholesale and he was then the one
  fighter with unread art.

Round 18 is closed and everything in it landed.

**Round 18 was delivered complete** — 28 sprites and 14 near-field cards, every
section of it, plus the five render3d image inputs (DI1–DI4). Its record, and
the reasoning behind each request in it, is now in
[the history](asset-requests-history.md#round-18--delivered).

**Round 20 is the open round.** (19 is skipped as a request number: it was used
for the *intake* of round 18, so `assets/reference/round19/` holds the delivered
plates and no request ever carried that number. Reusing it would make "round 19"
mean two different things.) Anything found from here — a placement pass, an
approval rejection, a manifest audit — lands in 20 beside 20B.

---

# The live-3D anime path

2D images the `?render=3d` pipeline consumes: inputs that models are
GENERATED from, and textures the anime pass reads at runtime. They serve
`?render=billboard` too, which reads the same rigs. These are NOT keyed
plates — each round states its own delivery.

**0 images.** Authored in
[render3d/docs/image-requests.md](../render3d/docs/image-requests.md) and reproduced whole below.

- **DI1** — model-generation turnaround boards (the Tripo inputs) (0 images)
- **DI2** — face sheets (the face-first gate's reference) (0 images)
- **DI3** — shade palette swatches (0 images)
- **DI4** — shared face textures (0 images)
- **DI5** — regeneration seeds (0 images)

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

### DI1: who is still owed one — 0 of 35

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

### DI2: who is still owed one — 0 of 35

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

### DI3: who is still owed one — 0 of 35

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

### DI4: who is still owed one — 0 of 35

The shared eye-highlight texture is delivered; these are the optional per-fighter mouth sheets. Nothing ships blocked on one.

**Nothing outstanding.** Every fighter has one.

## Round DI5 — regeneration seeds *(delivered — read the verdict before generating)*

**All nine landed and all nine pass**: five turnaround boards (`gakuganji`,
`maki`, `meimei`, `momo`, `uro`) and four weapon plates (everyone but Uro, who
carries none). The edge check refused nothing and warned about nothing — the
crowns, the hat tips and the feet are all inside the canvas with margin, which
is the fault that produced Mei Mei's horns.

Checked by eye against every rule below:

| | Verdict |
|---|---|
| Crown and feet in frame | **yes**, all five, with margin — Momo's hat tips included |
| Weapons out of the boards | **yes** — all four are drawn empty-handed |
| Weapon plates | **yes** — broom, polearm, axe, guitar, four views each, alone on white |
| Daylight between the legs | **yes** on Maki and Uro; Momo and Mei Mei stand closer but keep a gap; Gakuganji's legs are inside hakama at any pose |
| Hanging hair drawn along its length | **yes** — Mei Mei's braid reads as its own shape in the side and back views, which is what the chain extraction needs |

**Two notes to weigh before spending credits, neither a blocker:**

1. **Arms hang at the sides rather than in an A-pose.** DI1 asks for them
   slightly away from the body and these are closer than that — wrists near
   the hips on Maki, Momo and Mei Mei. The roster's existing models were
   generated from boards drawn the same way and their arms measure fine
   (0.80–0.99 balance for twenty of them), so this is a known-survivable
   deviation rather than a repeat of the fusion fault. It is also the most
   likely explanation for the three fighters that measure 0.55–0.71.

2. **Hands are relaxed-open, not curled.** The hand is a single bone and
   cannot close later, so a weapon joined to a flat palm reads as passing
   through it. Mei Mei's axe and Maki's polearm are the ones this shows on.
   Worth a redraw of the hands ONLY if the joined result looks wrong — which
   is now a thing that can be checked in an afternoon rather than guessed at,
   because the join is arithmetic.

**Uro's crown flag was partly the metric's fault.** Her board makes it plain
that the hair standing 29% of her stature above her head is her design, not
generated damage. Her legs at 55% of a normal leg still stand, and so does the
scale the Idle Review kept fighting.

### DI5: who is still owed one — 0 of 35

Named by MEASUREMENT, not by eye: tools/audit_model_health.py weighs the mesh bound to each limb against the roster's median and reports what cannot be true of a body. A fighter leaves this list when a replacement board lands — not when their model is regenerated, since regenerating from the same board is what produced the fault.

**Nothing outstanding.** Every fighter has one.

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
| `kashimo` | "Hajime Kashimo from Jujutsu Kaisen, tall lean young man with shaggy mint-green hair sticking out in tufts and two horn-like coiled locks rising from the top of his head, sharp green eyes with a short zig-zag lightning marking under each eye, wearing a loose all-white high-collared padded robe with puffed sleeves gathered at the elbow, white bandage wraps on both forearms, loose white trousers wrapped in white bandages from knee to ankle, pale grey ankle boots, carrying a long red staff with gold caps and a gold ball finial" |
| `yaga` | "Masamichi Yaga from Jujutsu Kaisen, tall broad heavily built middle-aged man with tan skin, dark brown hair in a short spiked crop with shaved sides, a chinstrap beard and moustache, small dark oval sunglasses always covering his eyes, wearing a plain black zip-up high-collared jacket, black trousers and black dress shoes" |
| `naoya` | "Naoya Zen'in from Jujutsu Kaisen, tall slim young man with short olive-blond hair with darker roots swept to one side, narrow brown eyes and a permanent smug smirk, small earrings on his left ear, wearing a white band-collar shirt under a dark teal kimono jacket, a pale grey pleated hakama tied at the waist, dark tabi socks and zōri sandals" |
| `kirara` | "Kirara Hoshi from Jujutsu Kaisen, a slender young person with long black hair past the shoulders, blunt-cut bangs with the right section dyed cyan and two flat face-framing strands, large purple eyes with yellow star-shaped pupils, two beauty marks by the mouth, a black studded choker, an off-shoulder cream ribbed crop top over magenta camisole straps with a bare midriff, a doubled red-brown belt with a gold star buckle, black flared trousers cropped above the ankle, magenta socks and black lace-up ankle boots, black painted nails" |
| `haruta` | "Haruta Shigemo from Jujutsu Kaisen, a short lean young man with slicked blond hair pulled into a long side ponytail tied on the left, thin eyebrows, drooping purple eyes with a lilac teardrop marking under each eye, a faint smug pout, bare-chested under a black one-shoulder jumpsuit with loose trousers gathered at the calves, a pale lilac glove on his sword hand, brown loafers worn barefoot, carrying a single-edged sword whose hilt is a sculpted human hand" |
| `tengen` | "Master Tengen from Jujutsu Kaisen, an inhuman robed figure with a tall smooth cylindrical hairless head, four narrow eyes stacked in two pairs down the face, a small stern mouth, pale grey-white skin, draped floor-length grey-white layered robes with a cowled folded neck and wide sleeves, long-fingered pale hands held open at the sides, bare feet with long toes" |
| `miwa` | "Kasumi Miwa from Jujutsu Kaisen, a young woman with long light-blue hair falling past her shoulders with blunt bangs, dark blue eyes and an earnest expression, wearing the dark navy Kyoto Jujutsu High uniform — a fitted suit-style jacket over a white collared shirt and navy tie, matching navy trousers, brown loafers — with a katana in a brown scabbard at her hip" |

---

# Outstanding by manifest, not by request

The other half of the question, and a narrower one: poses whose art EXISTS
and is wrong. A workbench flag says so directly; a pose drawing a file that
is not its own says so silently, which is how seven of them stayed invisible
until round 18G. Neither can see a pose that was never drawn — that is what
the rounds above are for.

**0 flagged, 20 drawing somebody else's art.**

| Fighter | Pose | Why |
|---|---|---|
| hanami | `attack_light_b` | drawing `special_neutral` |
| sukuna | `attack_light_b` | drawing `r3c0` |
| megumi | `attack_light_a` | drawing `crouch_a_2` |
| yuta | `attack_heavy_b` | drawing `attack_dash` |
| yuta | `attack_light_a` | drawing `attack_air_a` |
| yuta | `attack_light_b` | drawing `attack_air_b` |
| nobara | `attack_heavy_b` | drawing `crouch_attack_b` |
| nobara | `attack_light_a` | drawing `crouch_b_2` |
| nobara | `attack_light_b` | drawing `specialNeutral` |
| nobara | `crouch_attack_b` | drawing `attack_dash` |
| inumaki | `attack_light_a` | drawing `crouch_a_2` |
| uro | `attack_light_a` | drawing `attack_heavy_a_3` |
| yuji | `attack_light_a` | drawing `guard` |
| reggie | `attack_light_a` | drawing `attack_heavy_a_2` |
| yuki | `attack_heavy_b` | drawing `ult_b` |
| kurourushi | `attack_heavy_b` | drawing `attack_light_b` |
| kurourushi | `attack_light_b` | drawing `attack_air_b_2` |
| kurourushi | `crouch_attack_b` | drawing `dash_2` |
| kurourushi | `dash` | drawing `dodge_roll_2` |
| kashimo | `attack_air_a` | drawing `attack_air_b` |

Separately, **2 improvement requests** — the art works and is just
not as good as it should be. Nothing is blocked by one, and the standing
ones are alpha fixes to delivered files, which is repo work rather than a
request.
