# Asset Requests — Round 7: six new fighters

Round 7 adds **Yuji, Choso, Mei Mei, Uro, Reggie Star, and Gakuganji**.

Unlike previous rounds, this is not a quality pass — these are brand-new
characters. Their gameplay is **already fully built and wired**: stats, moves,
specials, ultimates, passives, AI profiles and audio all live in code behind
`STAGED_CHARACTER_KEYS` (`src/characters.js`). The art below is the only
missing piece. When it lands, integration is: import the sprites, drop the
card, and move the character's key into `CHARACTER_KEYS` — nothing else.

What each character needs:

| Deliverable | Count per character | Destination |
|---|---|---|
| Hero card | 1 | `assets/cards/<key>_card.jpg` |
| Fighter sprites | 31 poses | `assets/sprites/<key>/<pose_key>.png` |
| Technique effect sprites | 1–6 (see section D) | `assets/sprites/effects/<name>.png` |

Character keys (used in all file paths): `yuji`, `choso`, `meimei`, `uro`,
`reggie`, `gakuganji`.

Total volume: 186 fighter sprites + 18 effects + 6 cards = **210 images**.
Suggested sequencing at the bottom.

---

## Delivery spec (sprites)

Same rules as round 5/6, restated so this doc stands alone. PNG, **one subject
per file**, no text, no watermark, no border, no grids.

- **Background:** true alpha transparency if possible; otherwise solid magenta
  `#FF00FF` — **except Yuji and Choso** (salmon-pink hair / crimson palette),
  which must use mid-grey `#808080`. A magenta key eats warm tones; this bit
  Sukuna in round 4.
- **Facing:** draw everything **facing RIGHT**. If your generator prefers
  left, fine — just say so and it gets batch-mirrored on import.
- **Framing:** full body inside the frame with margin on **all four sides**,
  feet near the bottom. Do not let hair, weapons or effects touch the canvas
  edge — clipped art was the entire round-6 problem.
- **Resolution:** character body **at least 600 px tall**. Higher is better.
- **Consistency:** same design, outfit and proportions across all 31 of a
  character's frames.
- **Opacity:** bodies 100% opaque; only genuine effects (glow, mist, sound
  waves, blood shimmer) may be translucent.

Style suffix — append to every sprite prompt:

> clean Japanese anime key-art style matching the Jujutsu Kaisen TV anime,
> crisp dark lineart, cel shading with soft gradient accents, vibrant colors,
> high detail, full body, no text

Prompt formula: `[CHARACTER BLOCK]`, `[POSE LINE]`, facing right,
`[STYLE SUFFIX]`.

Intake pipeline: deliveries can land in `assets/intake/<key>/<pose_key>.png`
and go through `tools/intake.py` → `tools/intake_sheets.py` →
`tools/intake_import.py --approve` as usual, or straight to
`tools/sprite_facing.py --import` per file.

---

## A. Character blocks

Use verbatim as the `[CHARACTER BLOCK]`. Check against show reference for the
face; the outfit descriptions below are the designs the kits were built
around.

| Key | Block |
|---|---|
| `yuji` | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" *(grey key)* |
| `choso` | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" *(grey key)* |
| `meimei` | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| `uro` | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a short dark bob haircut and sharp eyes, wearing a fitted pale combat bodysuit with purple accent panels and bandage-wrapped forearms, light flexible shoes" |
| `reggie` | "Reggie Star from Jujutsu Kaisen, lean sly man with long dark hair swept back and a small chin beard, wearing a dark fur-collared jacket over a patterned shirt with dark trousers, carrying a closed dark-purple umbrella that conceals a katana" |
| `gakuganji` | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern elderly man, mostly bald with grey hair at the sides and a long grey beard and mustache, heavy wrinkles and hooded eyes, wearing dark traditional kimono-style robes, carrying a black electric guitar on a strap" |

---

## B. Shared poses — 26 per character

Every animation state for these fighters resolves through semantic pose keys
(`STAGED_ANIMS` in `src/characters.js`) — there is no legacy sheet to fall
back on, so **all 26 shared poses below plus the 5 technique poses in
section C are required** for a character to ship.

### Tier 1 — on screen constantly

| Pose key | Pose line |
|---|---|
| `idle_a` | "standing at rest in a relaxed combat-ready stance, weight settled, arms loose at the sides" |
| `idle_b` | "standing at rest, a subtle breathing shift — shoulders slightly raised, weight on the other foot, arms loose" |
| `run_a` | "sprinting hard, front leg driving forward, opposite arm swung back, body leaning into the run" |
| `run_b` | "sprinting hard at the opposite stride, rear leg extended behind, other arm forward, hair and clothing trailing" |
| `jump_rise` | "leaping upward, legs tucked, arms raised for balance, clothing pulled down by the rush of air" |
| `fall` | "descending through the air, legs reaching down toward a landing, arms out for balance" |
| `hurt` | "recoiling from a heavy blow, head snapped back, torso arched, arms flung loose, feet leaving the ground" |
| `guard` | "braced defensively behind a raised guard, both forearms up in front of the face and chest, knees bent, leaning into an incoming hit" |

### Tier 2 — core actions

| Pose key | Pose line |
|---|---|
| `attack_light_a` | "throwing a fast forward jab or quick weapon strike, front arm extended, body squared" |
| `attack_light_b` | "following through on a second fast strike, torso rotated, rear arm now extended" |
| `attack_heavy` | "committing to a heavy full-body strike, deep stance, weapon or fist driven forward with full weight behind it" |
| `attack_up` | "striking sharply upward at a steep angle, one arm or weapon thrust up overhead, torso arched back, gaze following the strike skyward" |
| `attack_down` | "slamming a wide low strike into the ground, deep straddle stance, arms or weapon sweeping at ankle height to both sides" |
| `attack_air` | "attacking in midair, body angled forward off the ground, one arm or weapon swung across in a committed aerial strike, legs trailing" |
| `charge` | "gathering power in a braced crouch, fists or weapon drawn back, body coiled and tense, cursed energy beginning to gather" |
| `dizzy` | "stunned and reeling with guard broken, standing unsteadily, head lolling, arms hanging limp, knees buckling" |
| `victory` | "a confident victory pose after winning, in character — relaxed and triumphant" |
| `ledge_hang` | "hanging one-handed from a ledge, body dangling, other arm reaching up, legs hanging straight down" |

### Tier 3 — movement detail

| Pose key | Pose line |
|---|---|
| `dash` | "bursting into a low forward dash, body almost horizontal, trailing motion" |
| `land` | "landing from a jump, knees deeply bent absorbing the impact, arms forward for balance" |
| `crouch_a` | "crouching low in a guarded stance, one knee near the ground, ready to spring" |
| `crouch_b` | "crouching low, a subtle shift — weight rocked slightly forward, arms adjusted" |
| `crouch_attack_a` | "attacking from a low crouch, arm or weapon sweeping forward near the ground" |
| `crouch_attack_b` | "finishing the low sweep, torso rotated, strike fully extended along the ground" |
| `dodge_roll` | "mid combat-roll, body tucked into a tight ball, shoulder toward the ground, clothing wrapped with motion" |
| `dodge_air` | "twisting sideways in midair to evade, body corkscrewed, arms pulled in, motion-blurred edges" |

---

## C. Technique poses — 5 per character, bespoke

These drive the three specials and the ultimate. Draw the **pose only** —
projectiles, clouds, crows, cars etc. are separate effect sprites (section D)
layered by the engine, so keep baked-in energy effects small and attached to
the body (a flare off a fist is fine; a full projectile is not).

### `yuji`
| Pose key | Pose line |
|---|---|
| `special_neutral` | "throwing a committed straight punch, rear fist driven past full extension, a faint trailing after-image of cursed energy behind the fist" |
| `special_side` | "sliding low across the ground on one bent leg, the other leg extended in a sweeping kick, arms braced for balance" |
| `special_down` | "immovable power stance, feet planted wide, fists clenched at his sides, jaw set, cursed energy flaring off his shoulders" |
| `ult_a` | "mid-flurry punch with black and crimson sparks of cursed energy crackling around the fist, snarling focus" |
| `ult_b` | "the opposite-hand punch of the flurry, body fully rotated through, black-red lightning arcing along the whole arm" |

### `choso`
| Pose key | Pose line |
|---|---|
| `special_neutral` | "one arm extended with two fingers pointed forward like a gun, dark red energy gathering at the fingertips, sleeve blown back" |
| `special_side` | "both hands cupped together at chest height compressing a small sphere of dark blood, arms tensed, eyes locked forward" |
| `special_down` | "standing with head bowed and fists clenched, dark red energy steaming off his whole body, hair drifting" |
| `ult_a` | "arms spread wide in command, robe billowing, dark red energy swirling in a ring around him" |
| `ult_b` | "hands clapped together in a sharp commanding gesture, body braced, fierce expression" |

### `meimei`
| Pose key | Pose line |
|---|---|
| `special_neutral` | "one arm raised in command, sleeve fluttering, gaze following something taking flight from her forearm" |
| `special_side` | "mid-lunge overhead axe strike, the axe arcing down in front of her, braids flying behind" |
| `special_down` | "standing composed with a confident smile, one hand raised in a money-counting gesture, faint golden glow around the hand" |
| `ult_a` | "arm thrust forward in absolute command, hair and dress blown back hard by a departing gust" |
| `ult_b` | "axe rested across her shoulders, weight on one hip, calmly watching her strike land" |

### `uro`
| Pose key | Pose line |
|---|---|
| `special_neutral` | "palm pressed flat against the empty air in front of her as if against glass, the air visibly denting around her hand" |
| `special_side` | "diving forward through the air like a swimmer off a block, arms swept back along her sides, body streamlined" |
| `special_down` | "guarded stance with both hands raised open before her, holding a curved lens of faintly distorted air" |
| `ult_a` | "both arms raised overhead, fingers clawed as if gripping the sky itself, face fierce, body stretched tall" |
| `ult_b` | "arms slammed down and across her body, torso twisted through the motion, hair whipping" |

### `reggie`
| Pose key | Pose line |
|---|---|
| `special_neutral` | "slashing forward with a katana drawn from an umbrella sheath, the empty umbrella shell in his off hand, receipt papers fluttering around him" |
| `special_side` | "spraying a large aerosol can forward at arm's length, head turned away with a smug grimace" |
| `special_down` | "tearing a long paper receipt in half above his head with a showman's grin" |
| `ult_a` | "arms spread wide presenting upward like a game-show host, long receipts spiraling around him" |
| `ult_b` | "pointing skyward with a triumphant grin, body angled back, coat swept by wind from above" |

### `gakuganji`
| Pose key | Pose line |
|---|---|
| `special_neutral` | "striking a hard downstroke on the electric guitar, strings visibly vibrating, small ripples of energy bursting from the strings" |
| `special_side` | "slamming a flat palm onto the guitar strings in a hard mute, arm rigid, robes snapping forward" |
| `special_down` | "stepping onto an effects pedal, leaning back into a high bending solo note, beard and robes whipped upward" |
| `ult_a` | "full shredding stance with the guitar raised high, fingers blurred on the fretboard, energy radiating outward" |
| `ult_b` | "windmill strum at the climax of the performance, arm fully extended from the swing, head thrown back" |

---

## D. Effect sprites — 18 total

Layered by the engine over the fighter art: they scale, tint, fade and move
independently, which is why they are not baked into the poses. All: PNG,
transparent (or keyed) background, **no character in frame**, painterly anime
energy-effect style matching the existing files in `assets/sprites/effects/`.
Sizes are guidance for aspect ratio — the engine scales by height, and
`tools/prep_effects.py` trims padding on arrival.

Destination for every file: `assets/sprites/effects/<name>.png`.

| File | For | ~Size | Prompt |
|---|---|---|---|
| `divergent_shock.png` | Yuji, Divergent Fist echo | 500×400 | "concentric crimson-orange shockwave rings of cursed energy from a delayed punch impact, translucent, crackling edges" |
| `piercing_blood.png` | Choso, neutral | 600×120 | "horizontal needle-thin lance of dark crimson blood firing at supersonic speed, motion-streaked, tapered point" |
| `blood_orb.png` | Choso, side + ultimate | 300×300 | "dense glossy sphere of dark crimson blood with small droplets orbiting it, faint inner glow" |
| `aura_crimson.png` | Choso, Flowing Red Scale | 435×700 | "vertical sheath of crimson energy flames rising around an empty silhouette space, translucent, like the existing gold aura" |
| `crow.png` | Mei Mei, neutral + ult followers | 300×250 | "black crow in a steep hunting dive, wings swept back, sharp silhouette, slight golden glint in the eye" |
| `crow_flock.png` | Mei Mei, Bird Strike | 700×400 | "dense flock of black crows flying in a tight arrowhead formation with heavy motion streaks, leading crow glowing with golden energy" |
| `sky_ripple.png` | Uro, Sky Warp Palm | 400×400 | "circular distortion ripple in pale sky-blue, like a pane of air bending inward, concentric refracted rings, glassy" |
| `sky_shard.png` | Uro, Inverted Sky | 500×500 | "cracked shards of pale blue sky folding inward like broken glass, fragments of cloud visible inside the shards" |
| `receipt_blade.png` | Reggie, neutral | 450×200 | "crescent slash wave of pale green energy with long paper receipts fluttering along its trailing edge" |
| `spray_cloud.png` | Reggie, Insecticide | 500×350 | "billowing pale yellow-green aerosol cloud, faintly toxic haze, soft translucent edges" |
| `drop_vending.png` | Reggie, Big-Ticket Item | 250×450 | "Japanese drink vending machine falling, tilted slightly, vertical motion lines above it" |
| `drop_bike.png` | Reggie, Big-Ticket Item | 400×300 | "motorbike falling nose-down, motion lines above it" |
| `drop_futon.png` | Reggie, Big-Ticket Item | 400×250 | "rolled white futon mattress flopping as it falls, comically harmless" |
| `sedan.png` | Reggie, Luxury Sedan ult | 600×250 | "sleek black luxury sedan car in clean side view, slight motion blur, showroom shine" |
| `sound_wave.png` | Gakuganji, Power Chord | 350×350 | "arc-shaped wall of amber sound-wave rings travelling sideways, concentric guitar-riff arcs with crackling energy" |
| `feedback_wall.png` | Gakuganji, Feedback Wall | 300×450 | "vertical shimmering standing wave of amber-orange sound energy, a vibrating translucent column" |
| `concert_wave.png` | Gakuganji, Encore ult | 600×600 | "massive radial burst of amber concert sound rings with lightning-like energy arcs between the rings" |
| `aura_amber.png` | Gakuganji, Distortion Solo | 435×700 | "vertical sheath of amber-gold energy rising around an empty silhouette space, translucent, like the existing gold aura" |

Every effect key above is already referenced by the staged kits and already in
the loader's staged-effects table (`STAGED_EFFECT_KEYS`, `src/assets.js`) —
the files start loading automatically the moment their character joins the
roster. Until a file exists the engine draws a procedural fallback, so partial
deliveries never break the game.

---

## E. Hero cards — 6 total

The character-select and battle-HUD portraits. Match the existing cards:
**640×820 JPEG**, painted half-body portrait, character facing slightly
toward the viewer, dramatic themed background, **no text, no logos, no
border** (the UI draws the name).

Destination: `assets/cards/<key>_card.jpg`.

Card prompt formula: `[CHARACTER BLOCK from section A]` + the line below +
> dramatic painted anime key-art portrait, half-body, dynamic lighting,
> highly detailed, rich background, no text

| File | Card line |
|---|---|
| `yuji_card.jpg` | "cracking his knuckles with a friendly, dangerous grin, black-red sparks of cursed energy flickering around his fist, warm sunset urban backdrop" |
| `choso_card.jpg` | "gazing forward with quiet intensity, ribbons of dark blood coiling weightlessly around his raised hand, deep crimson twilight backdrop" |
| `meimei_card.jpg` | "resting her great axe across her shoulders with a serene, calculating smile, crows wheeling behind her against a golden dusk sky" |
| `uro_card.jpg` | "one palm pressed against a visible ripple in the air, sharp confident smirk, endless open sky and clouds bending behind her" |
| `reggie_card.jpg` | "fanning a handful of long receipts like a card sharp, umbrella-katana over one shoulder, neon-lit night street backdrop" |
| `gakuganji_card.jpg` | "mid power-chord on his electric guitar, robes whipped by sound pressure, stern face lit from below by amber stage light" |

---

## F. Volume and sequencing

1. **Yuji end to end first** (1 card + 31 poses + 1 effect). He is the most
   in-demand character and exercises the full pipeline; he gets wired,
   verified in game, and screenshotted before committing to the other five.
2. **Remaining five cards + Tier 1 + Tier 2 poses** (5 cards + 90 sprites) —
   enough for every character to be playable and looking right.
3. **Technique poses + effects** (55 sprites + 17 effects) — the specials and
   ultimates get their proper reads.
4. **Tier 3 movement detail** (40 sprites) — dash/land/crouch/dodge polish.

If tiers must be cut, Tier 3 falls back gracefully (states borrow the nearest
pose via `STAGED_ANIMS` edits at import time); Tiers 1–2 and section C do not.

---

## G. Integration checklist (per character)

The gameplay side is done; this is the full remaining path to shipping:

1. Drop sprites at `assets/sprites/<key>/<pose_key>.png` (or stage through
   `assets/intake/<key>/` and the intake tools).
2. Import each frame so facing/anchor/size are handled and the manifest is
   updated: `python3 tools/sprite_facing.py --import <file> --char <key>
   --frame <pose_key>` (add `--face left` if delivered left-facing).
3. Register the frames in `GENERATED_FRAME_TARGETS`
   (`tools/extract_sprites.py`) so a re-extraction can't clobber them.
4. Run `tools/prep_effects.py` after dropping effect sprites.
5. Copy the hero card to `assets/cards/<key>_card.jpg`.
6. Move the character's key from `STAGED_CHARACTER_KEYS` into
   `CHARACTER_KEYS` in `src/characters.js`. This single change adds them to
   character select, loads their sprites and effects, and enables them for
   CPU play.
7. Verify: `python3 tools/audit_frames.py`, `tools/size_review.py`, the
   workbench (`workbench/?char=<key>`), and the in-game smoke test from
   `docs/audit-guide.md` §2.
