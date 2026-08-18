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

**37 images outstanding.**

- **The sprite game** — 37 images, round 22
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

**37 images, round 22.** Authored in
[docs/asset-requests.md](asset-requests.md) and reproduced whole below.

- **22I** — Seven frames the round-22 boards rejected (7 sprites)
- **22J** — Everything else the workbench has flagged (23 sprites)
- **22K** — A teeter for the seven newly promoted (7 sprites)

## 22I. Seven frames the round-22 boards rejected — 7 sprites

The faults found reviewing round 22 — six from the 22B–22D sprite sets and one
from the teeter. Three more were on this list and are answered: the
`kashimo/special_side` costume and both of Yaga's crouches were redrawn with
round 23 and are
[in the history](asset-requests-history.md#round-23--round-24s-four-staged-fighters-delivered).
Everything else in those deliveries is in the game; these
seven are in it too, drawing what was delivered, and flagged in the workbench so
they are visible while they wait. Same character blocks, same key screens, same
delivery paths as the sets they belong to.

**Six of them are one fault**, and it is the reason the brief now measures the
wind-up: Yaga's and Naoya's `_a` frames were drawn about as extended as their
own strikes. Kashimo's set is not among them — his light and heavy pairs read
correctly, and his aerial pair was drawn correctly and delivered INVERTED,
which was fixed by pointing each pose at the other file rather than by a
redraw. The `_a`
rule in [pose-brief.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/docs/pose-brief.md) applies to these redraws
too, and both halves of the pair have to pass the ruler.

| File | Fighter | What is wrong, and what to draw |
|---|---|---|
| `naoya/attack_light_a.png` | Naoya | **The wind-up is already the strike.** Drawn mid-blow, so the light attack has no coil and no tell. Redraw as the coil: striking hand drawn back beside the body, shoulders turned away from the target, weight on the back foot, lead arm up as a guard. It must reach **no further forward than `naoya/idle_a.png`** |
| `naoya/attack_heavy_a.png` | Naoya | Same fault. Redraw as the wind-up of one committed blow: fist drawn as far back as the body allows, hips loaded, front foot light — and inside the idle's reach |
| `naoya/attack_air_a.png` | Naoya | Same fault, airborne. Body coiled mid-jump, striking limb cocked, legs gathered — the extension belongs to `attack_air_b` |
| `yaga/attack_light_a.png` | Yaga | Same fault as Naoya's, same fix, against `yaga/idle_a.png` |
| `yaga/attack_heavy_a.png` | Yaga | Same fault. It is standing in on his `guard` frame in the workbench meanwhile, which is a stopgap and not a wind-up — the delivered plate needs redrawing as the coil |
| `yaga/attack_air_a.png` | Yaga | Same fault, airborne |
| `nanami/teeter.png` | Nanami | **Framing.** The pose is right — weight back, arms out, head down toward the drop — but his blunt blade runs off the LEFT edge of the plate and is cut flat by the canvas. The delivery spec's "nothing may touch the canvas edge" rule, and the "reach falls off the canvas" fault the brief has named since round 13. Redraw the same pose with margin on all four sides so the blade finishes inside the frame |

**Kashimo's canonical reference is now his own idle**, not the wiki render —
36 poses landed, so the rule that governs every other fighter applies to him:

- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kashimo/idle_a.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/naoya/idle_a.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yaga/idle_a.png>

## 22J. Everything else the workbench has flagged — 23 sprites

Frames carrying a workbench flag that no other section asks for. The file
defines a pose as outstanding if it is flagged *or* drawing a file that is not
its own, and these had drifted out of the rounds — some since round 18, most
from the placement passes over rounds 22 and 23. They are listed here so the
request documents stop understating what is owed.

**Every one of them is in the game today**, drawing what the `File` column
names — a flag asks for a better drawing, it never takes the current one out of
play. Where that file is another pose's, it is a deliberate stand-in chosen in
the workbench and it stays until something better arrives.

Written from `python3 tools/list_replacements.py --markdown`, which reads the
flags themselves, so this table cannot disagree with the workbench.

| Fighter | Pose | Kind | Drawing today | What is wrong |
|---|---|---|---|---|
| Dagon | `dagon/attack_light_a` | pose | `dagon/attack_light_a.png` | should be wind-up for attack |
| Dagon | `dagon/crouch_attack_b` | pose | `dagon/crouch_attack_b.png` | — |
| Dagon | `dagon/crouch_b` | pose | `dagon/crouch_b.png` | Drops 21% of standing height where the brief asks for a quarter, and reads taller than crouch_a beside it. Same crouch as crouch_a, a breath later. |
| Dagon | `dagon/run_reach_a` | pose | `dagon/run_reach_a.png` | Should reach with leg not with arm |
| Dagon | `dagon/run_reach_b` | pose | `dagon/run_reach_b.png` | should reach with leg instead of arm |
| Haruta Shigemo | `haruta/attack_air_a` | pose | `haruta/attack_air_a.png` | Needs to be winding-up for attack, not already attacking |
| Haruta Shigemo | `haruta/dizzy` | pose | `haruta/hurt.png` | I'm using a new image that better approximates it, but we need to redo the "dizzy" sprite which came out as an erroneous sheet of multiple images. |
| Haruta Shigemo | `haruta/special_down` | pose | `haruta/attack_air_a.png` | Needs to be winding-up for attack, not already attacking |
| Hajime Kashimo | `kashimo/attack_air_b` | quality | `kashimo/attack_air_a.png` | — |
| Hajime Kashimo | `kashimo/attack_up` | quality | `kashimo/attack_up.png` | Has double knee and also strike focus should be upward |
| Hajime Kashimo | `kashimo/ledge_hang` | character | `kashimo/ledge_hang.png` | Different hair color |
| Kirara Hoshi | `kirara/attack_down` | pose | `kirara/attack_down.png` | should be aiming attack at the ground |
| Kirara Hoshi | `kirara/attack_heavy_b` | pose | `kirara/attack_heavy_b.png` | Should have her right arm forward in a punch |
| Kirara Hoshi | `kirara/attack_light_b` | pose | `kirara/attack_light_b.png` | should have her right arm out in a punch |
| Mahito | `mahito/attack_light_a` | quality | `mahito/attack_light_a.png` | — |
| Kasumi Miwa | `miwa/attack_heavy_a` | quality | `miwa/attack_heavy_a.png` | her drawn back sword has no blade on it |
| Kasumi Miwa | `miwa/attack_light_a` | quality | `miwa/attack_light_a.png` | Her sword should be unsheathed in her wind-up to attack. |
| Kasumi Miwa | `miwa/attack_light_b` | quality | `miwa/attack_light_b.png` | Her sword is cut off / clipped on the right |
| Kasumi Miwa | `miwa/charge` | pose | `miwa/charge.png` | She looks like she's just idling instead of charging up |
| Kasumi Miwa | `miwa/dizzy` | quality | `miwa/hurt.png` | I replaced with another sprite as a backup, but we need a new "dizzy" one (old one was a sheet showing multiple at once). |
| Kasumi Miwa | `miwa/special_neutral` | quality | `miwa/special_neutral.png` | Her sword is cut off on the right |
| Kasumi Miwa | `miwa/ult_a` | quality | `miwa/ult_a.png` | her sword is going through her leg |
| Takako Uro | `uro/attack_light_b` | quality | `uro/attack_light_a.png` | — |

**Two of Miwa's are unrecoverable crops, not framing.** `attack_light_b` and
`special_neutral` were delivered with the blade running off the RIGHT edge of
the plate — 26 px and 23 px of the source's own right-hand column is figure, so
the tip was never drawn and no re-crop can bring it back. Both need the pose
redrawn with margin on all four sides.

**The two `dizzy` sheets cannot be salvaged either.** `miwa/dizzy` came back as
fifteen figures on one 1536x1024 canvas and `haruta/dizzy` as eleven; the
tallest figure on either sheet is 495 px against the spec's 600 px body
minimum, and the median is under 310 px. Even setting resolution aside, none of
the figures on either sheet is a dizzy pose — they are idles, draws, crouches
and slashes. Both are re-requests, and both draw the fighter's `hurt` frame
meanwhile, which is the closest read the set has.

## 22K. A teeter for the seven newly promoted — 7 sprites

22A drew this pose for the roster of 27. The seven fighters staged behind
rounds 23 and 24 were deliberately not in it, because none of them was on the
select screen yet; all seven are now, which makes them the only fighters in the
game without a teeter drawing.

**Nothing is broken meanwhile.** The state falls back to the fighter's own idle
frames with the procedural lean `src/motion.js` supplies — exactly what the
whole roster did before 22A landed — so this upgrades a read that already
exists.

**The brief is 22A's, unchanged**: a standing pose, weight shifted BACK from the
drop, arms out for balance, front foot at or just over the lip, head turned down
toward the fall. Caught rather than alarmed — the moment after realising the
ground ran out. It has to read against that fighter's own idle at a glance,
which is the test. Drawn facing RIGHT with the drop on the right, like every
other pose; the engine mirrors it for the left-hand lip.

Each fighter's own `idle_a` is the canon for costume, proportions and palette:

| Sprite | Fighter | Idle to draw against |
|---|---|---|
| `kashimo/teeter.png` | Kashimo | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kashimo/idle_a.png> |
| `yaga/teeter.png` | Yaga | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yaga/idle_a.png> |
| `naoya/teeter.png` | Naoya | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/naoya/idle_a.png> |
| `kirara/teeter.png` | Kirara | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kirara/idle_a.png> |
| `haruta/teeter.png` | Haruta | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/haruta/idle_a.png> |
| `tengen/teeter.png` | Tengen | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/tengen/idle_a.png> |
| `miwa/teeter.png` | Miwa | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/miwa/idle_a.png> |

**Tengen is white and grey.** His delivered panes carried a magenta cast from
the screen they were shot against and have been neutralised in place, so draw
the robe and the barrier as white glass — nothing on him is violet.

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

**30 flagged, 25 drawing somebody else's art.**

| Fighter | Pose | Why |
|---|---|---|
| kashimo | `attack_air_b` | quality |
| kashimo | `attack_up` | quality |
| mahito | `attack_light_a` | quality |
| miwa | `attack_heavy_a` | quality |
| miwa | `attack_light_a` | quality |
| miwa | `attack_light_b` | quality |
| miwa | `dizzy` | quality |
| miwa | `special_neutral` | quality |
| miwa | `ult_a` | quality |
| nanami | `teeter` | quality |
| uro | `attack_light_b` | quality |
| dagon | `attack_light_a` | pose |
| dagon | `crouch_attack_b` | pose |
| dagon | `crouch_b` | pose |
| dagon | `run_reach_a` | pose |
| dagon | `run_reach_b` | pose |
| haruta | `attack_air_a` | pose |
| haruta | `dizzy` | pose |
| haruta | `special_down` | pose |
| kirara | `attack_down` | pose |
| kirara | `attack_heavy_b` | pose |
| kirara | `attack_light_b` | pose |
| miwa | `charge` | pose |
| naoya | `attack_air_a` | pose |
| naoya | `attack_heavy_a` | pose |
| naoya | `attack_light_a` | pose |
| yaga | `attack_air_a` | pose |
| yaga | `attack_heavy_a` | pose |
| yaga | `attack_light_a` | pose |
| kashimo | `ledge_hang` | character |
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
| uro | `attack_light_b` | drawing `attack_light_a` |
| yuji | `attack_light_a` | drawing `guard` |
| reggie | `attack_light_a` | drawing `attack_heavy_a_2` |
| yuki | `attack_heavy_b` | drawing `ult_b` |
| kurourushi | `attack_heavy_b` | drawing `attack_light_b` |
| kurourushi | `attack_light_b` | drawing `attack_air_b_2` |
| kurourushi | `crouch_attack_b` | drawing `dash_2` |
| kurourushi | `dash` | drawing `dodge_roll_2` |
| kashimo | `attack_air_a` | drawing `attack_air_b` |
| kashimo | `attack_air_b` | drawing `attack_air_a` |
| haruta | `dizzy` | drawing `hurt` |
| haruta | `special_down` | drawing `attack_air_a` |
| miwa | `dizzy` | drawing `hurt` |

Separately, **2 improvement requests** — the art works and is just
not as good as it should be. Nothing is blocked by one, and the standing
ones are alpha fixes to delivered files, which is repo work rather than a
request.
