# Asset Requests — image-generation prompts

Rounds 1–4 are **delivered, integrated, and verified**. Round 4 in particular
fixed every crouch-row outfit mismatch — all seven characters now wear the same
costume ducking as standing (verified in `tools/debug/round4_check.png`).

Round 5 below is the **quality pass**: regenerating the frames that still come
from the original sprite sheets, plus the poses the game needs and doesn't have.

---

## Why round 5 exists

Two measured findings:

**1. The original sheet art is ~2.5x lower resolution than your generated art.**
Extracted sheet frames give a character body of **256-296 px**; the round 3/4
generated frames give **674-700 px**. The game draws a fighter ~230 px tall, so
the sheet frames run at roughly 1:1 with no headroom and look soft, while the
new art downsamples ~3x and looks crisp. Side by side
(`tools/debug/resolution_compare.png`) the difference is obvious — and it is
worst on the frames players stare at most: idle, run, jump.
**221 of 340 frames** are under 260 px.

**2. Seven animation states have no art and borrow an unrelated frame.**
The engine has 24 animation states but only 20 source frames per character, so
several states draw something that doesn't depict the action:

| State | Currently draws | Problem |
|---|---|---|
| `shield` | the idle frame | Players hold shield constantly; they just stand there |
| `upHeavy` / up-attack | the **jump** frame | Up-attacks look like jumping, not striking upward |
| `airLight` / air attack | the **jump** frame | Aerials are identical to jumping |
| `charge` | the idle frame | No windup read on chargeable smashes |
| `dizzy` (shield break) | the hurt frame | The big punish moment has no distinct art |
| `win` | the idle frame | Victory screen is just a standing pose |
| `ledge` | the fall frame | Hanging characters look like they're falling |

Good news: `idle` animates fine on every character (silhouette difference
20-76%, nothing static), and facing / anchors / sizing are fully handled by the
pipeline now — so this round is purely about art quality and coverage.

---

## Delivery spec

PNG, **one subject per file**, no text, no watermark, no border, no grids.

- **Background:** true alpha transparency if possible; otherwise solid magenta
  `#FF00FF` — except for characters with pink/red/peach palettes (Sukuna,
  Nobara, Momo, Hakari), which should use mid-grey `#808080`.
- **Facing:** draw everything **facing RIGHT**. If your generator prefers left,
  that is fine — just tell me, and I will batch-mirror on import; the tooling
  fixes anchors and centres automatically.
- **Framing:** full body inside the frame, feet near the bottom, small margin.
  Padding is trimmed automatically.
- **Resolution:** higher is better — please keep the character's body **at
  least 600 px tall**. This is the single biggest quality lever.
- **Consistency:** same design, outfit and proportions across all of a
  character's frames.
- **Opacity:** character bodies must be 100% opaque; only genuine effects
  (glow, mist, spirit wisps) may be translucent.

Style suffix — append to every prompt:

> clean Japanese anime key-art style matching the Jujutsu Kaisen TV anime,
> crisp dark lineart, cel shading with soft gradient accents, vibrant colors,
> high detail, full body, no text

---

## How to build a prompt

Combine a **character block** (SS A) with a **pose line** (SS B):

> `[CHARACTER BLOCK]`, `[POSE LINE]`, facing right, `[STYLE SUFFIX]`

File naming: `assets/sprites/<character>/<pose_key>.png` — e.g.
`assets/sprites/gojo/guard.png`. These use semantic keys instead of the old
`r0c0` grid names; the engine resolves frames by name, so this works directly
and is far easier to maintain.

---

## A. Character blocks

Use verbatim — these are the established designs, checked against the current
sheets.

| Character | Block |
|---|---|
| gojo | "Satoru Gojo from Jujutsu Kaisen, tall slim young man with spiky white hair and a black blindfold over his eyes, wearing a black high-collared jujutsu uniform with dark trousers and black boots" |
| yuta | "Yuta Okkotsu from Jujutsu Kaisen, slim young man with messy black hair, wearing an all-white long-sleeve school uniform with white trousers, a katana at his hip" |
| hakari | "Kinji Hakari from Jujutsu Kaisen, tall young man with slicked-back blond hair and an undercut, wearing a black school jacket hanging open over his bare chest, dark trousers" |
| maki | "Maki Zen'in from Jujutsu Kaisen, athletic young woman with dark green hair in a high ponytail and rectangular glasses, navy school uniform tunic over dark leggings, carrying a long naginata polearm" |
| megumi | "Megumi Fushiguro from Jujutsu Kaisen, young man with spiky black hair, wearing a dark navy high-collared jujutsu uniform with dark trousers and brown boots" |
| nobara | "Nobara Kugisaki from Jujutsu Kaisen, young woman with short auburn-orange bob hair, navy school uniform dress with a belt, dark tights and brown boots, small hammer in hand" |
| inumaki | "Toge Inumaki from Jujutsu Kaisen, slim young man with light grey-blond hair, wearing a dark navy high-collared school uniform zipped up over his mouth, white sneakers" |
| panda | "Panda from Jujutsu Kaisen, a large anthropomorphic panda with black and white fur, muscular build, a small teal cursed-energy core visible on his shoulder" |
| todo | "Aoi Todo from Jujutsu Kaisen, very large muscular man with black hair in a short topknot and thick eyebrows, wearing a dark navy jacket over a maroon shirt with dark trousers" |
| momo | "Momo Nishimiya from Jujutsu Kaisen, petite young woman with shoulder-length auburn hair and a large dark witch hat, dark navy Kyoto uniform dress, riding or holding a wooden broom" |
| nanami | "Kento Nanami from Jujutsu Kaisen, tall blond man with a straight bob and tinted rectangular glasses, wearing a tan-beige suit with a patterned tie, carrying a blunt-tipped cleaver sword" |
| toji | "Toji Fushiguro from Jujutsu Kaisen, tall muscular man with short black hair and a vertical scar at the corner of his mouth, fitted black short-sleeve T-shirt and loose dark charcoal trousers with a dark sash" |
| sukuna | "Ryomen Sukuna the King of Curses from Jujutsu Kaisen, bare-chested muscular man with spiky salmon-pink hair, four eyes, black tattoo band markings across his face, chest and arms, dark loose trousers with a black sash" *(grey key)* |
| mahito | "Mahito from Jujutsu Kaisen, slim young man with pale blue-grey patchwork skin covered in stitched seams, long grey-blue hair in a loose bun, dark sleeveless vest and dark trousers" |
| geto | "Suguru Geto from Jujutsu Kaisen, tall man with long black hair in a topknot, wearing a black traditional robe with gold trim over dark clothing" |
| jogo | "Jogo from Jujutsu Kaisen, a volcano-headed cursed spirit with a single large eye, cracked earthen skin, wearing a yellow-and-black spotted fur mantle over dark trousers" |
| hanami | "Hanami from Jujutsu Kaisen, tall upright cursed spirit with a dark grey-brown bark body, branch spurs on the shoulders, a flower growing from its head and glowing eyes in a cracked wooden face" |

---

## B. Poses

### Tier 1 — frames players see constantly (regenerate for sharpness)

On screen almost every frame of a match, and currently the softest art in the
game.

| Pose key | Pose line |
|---|---|
| `idle_a` | "standing at rest in a relaxed combat-ready stance, weight settled, arms loose at the sides" |
| `idle_b` | "standing at rest, a subtle breathing shift — shoulders slightly raised, weight on the other foot, arms loose" |
| `run_a` | "sprinting hard, front leg driving forward, opposite arm swung back, body leaning into the run" |
| `run_b` | "sprinting hard at the opposite stride, rear leg extended behind, other arm forward, hair and clothing trailing" |
| `jump_rise` | "leaping upward, legs tucked, arms raised for balance, clothing pulled down by the rush of air" |
| `fall` | "descending through the air, legs reaching down toward a landing, arms out for balance" |
| `hurt` | "recoiling from a heavy blow, head snapped back, torso arched, arms flung loose, feet leaving the ground" |

### Tier 2 — missing poses (biggest gameplay win)

Each replaces a state that currently draws an unrelated frame.

| Pose key | Pose line |
|---|---|
| `guard` | "braced defensively behind a raised guard, both forearms up in front of the face and chest, knees bent, leaning into an incoming hit" |
| `attack_up` | "striking sharply upward at a steep angle, one arm or weapon thrust up overhead, torso arched back, gaze following the strike skyward" |
| `attack_air` | "attacking in midair, body angled forward off the ground, one arm or weapon swung across in a committed aerial strike, legs trailing" |
| `charge` | "gathering power in a braced crouch, fists or weapon drawn back, body coiled and tense, cursed energy beginning to gather" |
| `dizzy` | "stunned and reeling with guard broken, standing unsteadily, head lolling, arms hanging limp, knees buckling" |
| `victory` | "a confident victory pose after winning, in character — relaxed and triumphant" |
| `ledge_hang` | "hanging one-handed from a ledge, body dangling, other arm reaching up, legs hanging straight down" |

### Tier 3 — optional, lower priority

The technique frames have large baked-in energy effects and read acceptably at
game size. Regenerate only for a fully uniform set.

| Pose key | Pose line |
|---|---|
| `attack_light_a` | "throwing a fast forward jab or quick weapon strike, front arm extended, body squared" |
| `attack_light_b` | "following through on a second fast strike, torso rotated, rear arm now extended" |
| `attack_heavy` | "committing to a heavy full-body strike, deep stance, weapon or fist driven forward with full weight behind it" |
| `crouch` | "crouching low in a guarded stance, one knee near the ground, ready to spring" |
| `dash` | "bursting into a low forward dash, body almost horizontal, trailing motion" |

---

## Volume and sequencing

Tier 1 + Tier 2 is **14 poses x 17 characters = 238 images** — a lot, so a
sensible order:

1. **One character end to end first** (Gojo, Tier 1 + 2 = 14 images). I will
   wire it up, verify in game, and send back a before/after comparison so you
   can judge the payoff before committing to the rest.
2. **Tier 2 for all 17** (119) — adds capability the game does not have; the
   difference is immediately visible in play.
3. **Tier 1 for all 17** (119) — the sharpness upgrade on the most-seen frames.
4. **Tier 3** only if you want everything uniform.

### Round 5 delivery status

Tier 1 + Tier 2 are complete for all 17 fighters (**238/238 sprites**).

- Untouched ImageGen source renders are archived under
  `assets/reference/round5/<character>/`. Nothing in that directory is loaded
  by the game, so the whole reference archive can be removed independently.
- Transparent, cropped runtime copies live under
  `assets/sprites/<character>/<pose_key>.png`.
- `tools/process_round5_sprites.py` reproducibly derives the runtime PNGs from
  the archived chroma sources, including edge decontamination and safety
  padding.
- `tools/integrate_round5_sprites.py` registers all semantic frames in the
  manifest. `DEFAULT_ANIMS` now uses the new sprites roster-wide, while each
  fighter's existing special/ultimate overrides remain intact.
- Tier 3 remains optional and was not generated in this pass.

---

## Integration notes

- Drop files at `assets/sprites/<character>/<pose_key>.png`.
- Import with facing/size/anchor handled automatically:
  ```sh
  python3 tools/sprite_facing.py --import <file> --char gojo --frame guard
  ```
  Add `--face left` if the art faces left — that skips the detector, which is
  only ~83% accurate and should not be trusted blind.
- New keys need wiring into `DEFAULT_ANIMS` / per-character `anims` in
  `src/characters.js`, and registering in `GENERATED_FRAME_TARGETS` in
  `tools/extract_sprites.py` so a re-extraction cannot overwrite them.
- Verify with `python3 tools/audit_frames.py`, `tools/facing_review.py`, and
  the in-game smoke test in `docs/audit-guide.md` section 2.

---

## C. Round 6 — replacements for truncated sheet cells

These are not quality upgrades: the source sheet cell physically clips the
art, so no amount of pipeline work recovers what was never drawn. Confirmed by
the frame's content box touching the cell edge (`ox == 0` or `oy == 0`), then
by eye. Nothing else on the roster clips.

Build each to the same **Delivery spec** above (single figure, transparent or
flat magenta background, full body inside the canvas with margin on all four
sides — the clipping is exactly what went wrong last time).

| Frame | State it drives | What is cut off |
|---|---|---|
| `nobara/r2c0` | jump / air | **Raised arm and hammer cut off at the top.** Worst of the set — body art, not effect. |
| `nobara/r4c2` | crouch attack | Lead arm runs off the left edge. |
| `megumi/r4c3` | crouch attack | Megumi's arm and the shikigami's muzzle run off the left edge. |
| `megumi/r3c2` | special / technique | Left edge clips the shikigami and the shadow effect. |
| `megumi/r3c3` | ultimate | Left edge clips the purple domain sphere. |
| `nobara/r3c2` | special (straw doll) | Left edge clips the purple cursed-energy effect. |
| `nobara/r3c3` | ultimate | Left edge clips the purple sphere. |

The last four clip **effects rather than the character**, so they are lower
priority than the first three — a clipped sphere reads as a design choice in
motion, a clipped arm never does.

### Hair flat-cut in the source art

A separate failure from the ones above. These frames sit well inside their
cell — there is 49–76px of clear space over the head — so nothing truncated
them. **The art was drawn with the top of the hair sliced off**, a flat
horizontal edge across the skull. No pipeline change can recover it.

| Frame | State it drives |
|---|---|
| `gojo/r3c0` | special / technique |
| `gojo/r3c1` | ultimate |
| `gojo/r3c2` | ultimate |
| `inumaki/r0c3` | attack |

Gojo's is the most visible on the roster: his hair is white against a dark
stage and it is his silhouette. When regenerating, give the head **generous
headroom** — the hair should end well inside the canvas, not near its edge.

### Full clipped-frame list (second manual pass)

Same delivery spec; the figure and its effect must sit fully inside the canvas
with margin on all four sides.

**Clipped at the LEFT**

| Frame | Cause |
|---|---|
| `geto/r2c2` | runs off the cell edge |
| `hanami/r2c2` | runs off the cell edge |
| `megumi/r3c2` | runs off the cell edge |
| `hakari/r3c2` | drawn cut off — and overhangs 27px into the neighbouring cell |
| `geto/r3c2`, `maki/r3c2`, `megumi/r3c3`, `megumi/r4c3` | drawn cut off |

**Clipped at the TOP**

| Frame | Cause |
|---|---|
| `hanami/r2c0` | runs off the cell edge |
| `gojo/r3c0`, `r3c1`, `r3c2`, `r3c3` | hair drawn flat-cut |
| `hakari/r3c0`, `r3c2`, `r3c3` | drawn cut off |
| `hanami/r3c2`, `r3c3` | drawn cut off |
| `inumaki/r3c0`, `r3c1`, `r3c2` | drawn cut off |
| `jogo/r3c2`, `r3c3` | drawn cut off |
| `megumi/r3c0`, `r3c1`, `r3c2` | drawn cut off |

Only 4 of these actually reach their cell boundary; the rest sit 30–77px
inside it, meaning **the source art was drawn already cropped**. Both need the
same fix, but it is worth knowing the sheet grid is not at fault for most of
them — regenerating at a larger canvas will not help unless the *pose* is
reframed to include the whole figure.

### Note for whoever generates round 6

The round-5 art arrived keyed off a **green** background, which left a green
halo on every soft edge — hair worst of all — on 205 frames. It has been
repaired in-place (`clean_frames.py --defringe`), but the cleanest fix is
upstream: deliver with real alpha, or key against **magenta `#FF00FF`**, which
no character on this roster wears.

### Clipped-frame list (third manual pass)

| Frame | Clipped |
|---|---|
| `momo/r1c2`, `panda/r3c1`, `yuta/r2c2`, `nanami/r3c2` | left — reaches the cell edge |
| `nobara/r4c2`, `panda/r4c2` | left — drawn cut off |
| `momo/r3c0`, `nanami/r3c1`, `nanami/r3c3`, `nobara/r2c0` | top — reaches the cell edge |
| `nobara/r3c0`, `r3c2`, `r3c3` | top — drawn cut off |
| `yuta/r3c0`, `r3c1`, `r3c2`, `r3c3` | top — drawn cut off (whole technique row) |
| `sukuna/r0c3` | bottom — reaches the cell edge |

`yuta/r3c0`–`r3c3` is the notable one: his entire technique row is cut off at
the top, so it is worth reframing as a set rather than one frame at a time.

### Clipped-frame list (fourth pass — reviewed against the crop sheets)

Of 83 candidates flagged by the tooling, review confirmed **8** are genuinely
cut off. The rest merely sit near a cell boundary and are fine. Detecting a
clipped pose from geometry alone does not work — this is the ratio to expect.

| Frame | Note |
|---|---|
| `geto/r0c3` | |
| `hakari/r2c1` | |
| `hakari/r2c3` | |
| `momo/r2c2` | |
| `momo/r2c0` | uncertain — depends whether the source art extends further |
| `nanami/r2c3` | |
| `sukuna/r3c2` | |
| `yuta/r2c0` | |

---

## Baked-in magic effects

Reviewing the bleed sheets established that **every** detached blob on the
roster is a magic effect drawn into the sprite — not a neighbouring cell
leaking in. Nothing needs removing, and the automatic bleed rules should stay
narrow.

It does raise a design question worth deciding before the next round: **should
technique frames ship with their effects drawn on, or clean?**

Effects baked into the sprite mean:

- they cannot be recoloured, scaled or timed independently of the pose
- they inflate the frame's bounding box, which drags `ox`/`bodyBottom` around
  and makes size normalisation between poses harder
- the same pose cannot be reused for a different move
- every automatic check for stray blobs has to be loosened to tolerate them

Frames drawn **without** effects, with the effect layered by the engine, would
fix all four — at the cost of building an effect system per technique.

Not a request yet, just the trade-off recorded while it is fresh. If you want
to go that way, the technique rows (`r3c0`–`r3c3`) are where it matters, and
they are already due for regeneration on other grounds.

---

## Round 8 — Summon minions (new)

(Numbered 8 because `asset-requests-round7.md` — the six new fighters — was
requested in parallel. The two rounds are independent; either can be
delivered first.)

The summoning system (`src/summons.js`) now fields persistent minions for
Megumi, Geto, Mahito, and Toji. Megumi's shikigami already have art
(`assets/sprites/summons/`). Three minions are running on placeholder effect
sprites and want dedicated art. Same delivery spec as round 5 (transparent or
magenta background, facing RIGHT, body ≥600 px tall, one subject per file, no
text/watermark). Drop the files at the exact paths below — the game prefers
them automatically over the placeholders, no code change needed.

### `assets/sprites/summons/rainbow_dragon.png` (Geto)

Currently falls back to `effects/curse_dragon.png` (cut from his card art —
usable but low-res and semi-effect-like).

> A massive serpentine cursed spirit dragon from dark fantasy anime, long
> sinuous body coiled mid-slither, iridescent scales shimmering violet, teal
> and magenta, gaping jaw with rows of jagged teeth, four short clawed limbs,
> tattered fins along the spine, wreathed in wisps of purple cursed energy,
> full body visible facing right, side view, dynamic hunting pose low to the
> ground, dark anime style with clean lineart and cel shading, transparent
> background, no text

### `assets/sprites/summons/transfigured_human.png` (Mahito)

Currently falls back to `effects/soul_isomer.png` (a small orb — reads as a
projectile, not a creature).

> A grotesque transfigured human cursed creature from dark supernatural anime,
> lumpy asymmetric flesh body with mismatched limbs, small vestigial arms and
> one oversized arm used as a front leg, distorted half-melted face with
> misplaced eyes, pale purple-grey skin with patches of lavender, shambling
> hunched lurching pose, full body visible facing right, side view, unsettling
> but PG-13 (no gore or blood), dark anime style with clean lineart and cel
> shading, transparent background, no text

### `assets/sprites/summons/inventory_curse.png` (Toji)

Currently falls back to `effects/cursed_spirit_orb.png` (generic orb).

> A small pact-bound inventory cursed spirit from dark fantasy anime, a
> floating worm-like curse with a segmented pale green-grey body coiled into a
> loose spiral, its head is a wide unzipping vertical mouth lined with blunt
> teeth opening to reveal a dark storage void, tiny beady white eyes, faint
> green cursed-energy haze around it, hovering pose with the tail curling
> under, full body visible facing right, side view, creepy-cute proportions,
> dark anime style with clean lineart and cel shading, transparent background,
> no text

### Optional round 8 extras (nice-to-have, not wired yet)

- `summons/divine_dog_white.png` / `divine_dog_black.png` regenerations at
  ≥600 px if the current ones look soft next to new art (they now run and
  lunge on stage far longer than before, so quality shows more).

---

## Round 9 — Regenerate the 17 original hero cards

Round 7 delivered six new fighters, and their hero cards landed in a **visibly
different art style** from the original seventeen. Three of those six — Mei Mei,
Uro and Choso — are now live in the roster, so the select screen currently shows
**17 old-style cards next to 3 new-style ones** and the seam is obvious. (Yuji,
Reggie and Gakuganji are still staged; their cards are already new-style, so
promoting them widens the gap rather than closing it.)

This round brings the old cards up to the new style so the roster reads as one
set.

Nothing else about the cards changes: same path (`assets/cards/<key>_card.jpg`),
same **640×820** dimensions (already consistent across all 23 cards on disk —
verified), so delivery is a straight file swap with no code change.

### What actually differs

Measured by putting `gojo_card.jpg` / `sukuna_card.jpg` next to
`yuji_card.jpg` / `meimei_card.jpg`:

| | Original 17 (rounds ≤6) | Round-7 six — **the target** |
|---|---|---|
| Crop | Full body, feet visible | **Half-body to three-quarter** — cut between the waist and mid-thigh, never showing feet |
| Rendering | Glossy semi-3D figure render, airbrushed volumes | **Flat cel shading, crisp dark lineart** — TV-anime cel, not a statue render |
| Background | Abstract ink / paint-splatter on **white** | **Painted environment** — a real place with atmospheric depth and shallow depth-of-field blur |
| Lighting | Even studio light on the figure | **Directional cinematic light**, warm rim light, colored ambience |
| Framing | Wide action pose, character small in frame | Character fills the frame, face large |
| Reads as | A poster of a figurine | A still from the show |

The two levers that matter most are **half-body crop** and **environmental
background instead of white splatter**. Get those right and the set matches even
if the rendering drifts slightly.

### Framing constraint — keep the face high

The UI crops these cards three ways, always anchored to the **top** edge
(`object-position: top`):

| Where | Crop taken | As % of the 820px height |
|---|---|---|
| Hero card on the select screen | top 640×450 | **top 55%** |
| Battle HUD portrait | top 640×640 square | top 78% |
| Roster grid thumbnail | ~ full card | top ~98% |

So the **head and the readable part of the pose must sit inside the top 55%**
of the image. All four delivered round-7 cards already satisfy this — every one
puts the face in the top third — so following the style suffix gets it for
free. Anything important placed low in the frame is only ever seen in the grid
thumbnail.

### Delivery spec (cards)

- **Format:** JPEG, **640×820**, `assets/cards/<key>_card.jpg` (overwrite).
- **No text, no logo, no border, no frame, no signature** — the UI draws the
  name, and a baked border fights the card's rounded corners.
- Full-bleed background: these are the one asset type that is *not* keyed or
  transparent, so paint the scene edge to edge.
- Higher-resolution generation then downscale to 640×820 is fine and preferred.

### Style suffix — append to every card prompt

This is the consistency lever. Use it verbatim on all seventeen:

> half-body portrait cropped between the waist and mid-thigh, character turned
> slightly toward the viewer with the head high in the frame, clean Japanese
> TV-anime key-art style matching the Jujutsu Kaisen anime, crisp dark lineart,
> flat cel shading with soft gradient accents,
> painted environmental background with atmospheric depth and shallow
> depth-of-field blur, dramatic directional lighting with warm rim light,
> vibrant saturated colors, high detail, no text, no logo, no border

And explicitly **avoid** (this is what the old cards look like, so it is worth
negative-prompting): `full body, feet visible, white background, paint splatter,
ink splatter background, 3D render, glossy airbrushed rendering, figurine,
studio product shot, text, watermark, border`.

### Prompt formula

`[CHARACTER BLOCK]` + `,` + `[CARD LINE]` + `,` + `[STYLE SUFFIX]`

Character blocks are unchanged — reuse them verbatim from **section A** above
(the same blocks that drove the sprite rounds), so a character's outfit stays
identical between their card and their in-game sprites.

### Card lines — 17 total

Each line is written for a half-body crop (upper-body action only) and picks a
background that matches the character's in-game theme color, so the card and
their HUD accent agree.

| File | Theme | Card line |
|---|---|---|
| `gojo_card.jpg` | `#62dcff` | "lifting his blindfold with two fingers to reveal one glowing pale-blue Six Eyes, a sphere of blue cursed energy hovering above his other palm, moonlit Tokyo rooftop backdrop" |
| `yuta_card.jpg` | `#9fc7ff` | "katana held up in a reverse grip, the vast translucent pale shape of Rika looming over his shoulder, cold blue-white school courtyard at night" |
| `hakari_card.jpg` | `#ff62cf` | "grinning with his jacket hanging open, a spinning jackpot wheel of hot pink light blazing behind his head, gaudy neon arcade interior" |
| `maki_card.jpg` | `#69d0a8` | "naginata levelled across her body, glasses catching the light, faint jade-green sheen along the blade, dim Zen'in estate corridor" |
| `megumi_card.jpg` | `#7c8cff` | "hands locked in the shikigami ritual hand sign, indigo shadow rising around him with two wolf silhouettes forming in it, moonlit shrine grounds" |
| `nobara_card.jpg` | `#d86a4a` | "hammer cocked back with a straw-doll nail pinched between her fingers, cocky smirk, warm orange dusk over a Tokyo side street" |
| `inumaki_card.jpg` | `#d7d9e7` | "tugging his high collar down to speak, faint silver rings of sound rippling outward from his mouth, pale overcast schoolyard" |
| `panda_card.jpg` | `#8ea0b8` | "arms folded with a broad confident grin, the teal cursed-energy core glowing at his shoulder, bright Kyoto exchange-event grounds" |
| `todo_card.jpg` | `#b66cff` | "hands caught mid-clap, a violet displacement ripple bursting between his palms, dust-lit stadium arena" |
| `momo_card.jpg` | `#b7b8ff` | "hovering side-saddle on her broom with her hat brim tipped low, pale lavender wind streaming past her, high above a cloud-broken sky" |
| `nanami_card.jpg` | `#ffd35a` | "loosening his tie with the blunt cleaver resting on one shoulder, tired unimpressed stare, amber office-tower windows at dusk" |
| `toji_card.jpg` | `#a8aeb8` | "the Inverted Spear of Heaven held low across him, scarred mouth curled in a lazy smile, cold grey concrete underpass" |
| `sukuna_card.jpg` | `#ff4c55` | "all four eyes open, one hand raised with fingers curled to dismantle, crimson slashes tearing through the air around him, burning ruined skyline" |
| `mahito_card.jpg` | `#b56cff` | "head tilted with a childlike smile, one patchwork stitched hand reaching toward the viewer, warping violet soul-light behind him, tiled sewer tunnel" |
| `geto_card.jpg` | `#7d58d8` | "palm open with a cursed spirit orb condensing above it, serene contemptuous expression, purple-lit temple hall" |
| `jogo_card.jpg` | `#ff7a2f` | "single eye narrowed, magma cracking and glowing along his volcanic head, embers streaming upward, scorched black earth and drifting smoke" |
| `hanami_card.jpg` | `#9bb36b` | "one bark-clad hand outstretched with a cursed flower blooming open from the palm, glowing eyes set in the cracked wooden face, sunlit deep forest" |

### Non-human notes

`panda`, `jogo` and `hanami` have no waist to crop at in the usual sense —
frame them **head-and-upper-torso** at roughly the same visual scale as the
human cards, so their heads land in the same band of the frame. Hanami in
particular is tall and thin; do not shrink the whole figure to fit, crop it.

If Hanami is regenerated, note there is an **alternate art set** for him
(`spriteSet: "alternate"`, his round-6 redesign) — the card should match the
**default** design, since the card does not swap with the sprite set.

### Suggested ordering

**Ship `gojo_card.jpg` first, alone.** He is the most-seen card and the
whitest / most abstract of the old backgrounds, so he is the clearest test of
whether the style suffix lands. Compare it against `meimei_card.jpg` (already
live in the same grid), adjust the suffix if needed, then batch the rest.

After that, work **group by group** — the select screen is now split into
labelled rows (`CHARACTER_GROUPS` in `src/config.js`), so finishing a whole
group makes that row internally consistent even while others are pending:

1. **Sorcerers** — `gojo`, `nanami`, `todo`, `momo`, `hakari`, `toji`
   (this row already contains new-style `meimei` and `uro`, so the mismatch is
   most visible here).
2. **Tokyo Jujutsu Students** — `yuta`, `maki`, `megumi`, `nobara`, `inumaki`,
   `panda` (all six are old-style, so this row is currently self-consistent —
   it only looks wrong next to the others).
3. **Curses and Curse Users** — `sukuna`, `mahito`, `jogo`, `hanami`, `geto`
   (row also holds new-style `choso`). Left for last because the non-human
   designs are the biggest style stretch.

### Integration

Drop the files over the existing ones and reload — the paths and dimensions are
unchanged, so nothing in code needs touching. Worth eyeballing afterwards: the
select screen (all 23 cards in one grid), a hero card at lock-in, and the battle
HUD portrait, since those are the three different crops.

### Delivery checklist

| Card | Regenerated | Checked in grid |
|---|---|---|
| `gojo` | ☐ | ☐ |
| `yuta` | ☐ | ☐ |
| `hakari` | ☐ | ☐ |
| `maki` | ☐ | ☐ |
| `megumi` | ☐ | ☐ |
| `nobara` | ☐ | ☐ |
| `inumaki` | ☐ | ☐ |
| `panda` | ☐ | ☐ |
| `todo` | ☐ | ☐ |
| `momo` | ☐ | ☐ |
| `nanami` | ☐ | ☐ |
| `toji` | ☐ | ☐ |
| `sukuna` | ☐ | ☐ |
| `mahito` | ☐ | ☐ |
| `geto` | ☐ | ☐ |
| `jogo` | ☐ | ☐ |
| `hanami` | ☐ | ☐ |
