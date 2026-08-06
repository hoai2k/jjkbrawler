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
