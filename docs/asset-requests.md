# Asset Requests — open requests

Everything in this file is **outstanding**. Delivered rounds are recorded in
[asset-requests-history.md](asset-requests-history.md) — including the round
numbers, so a commit or code comment citing "round 5 art" still resolves.

**Current status: rounds 1–8 delivered. Round 9 is the only open round.**

The roster is complete: all 23 fighters have a card, 31 poses and their effect
sprites. Nothing pending blocks play — round 9 is consistency and polish.

---

## Where to deliver

**Upload art to `assets/intake/`, never to `assets/sprites/`.**

```
assets/intake/<character>/<pose_key>.png    sprites
assets/intake/effects/<name>.png            technique effects
assets/intake/summons/<name>.png            summon minions
assets/intake/cards/<key>_card.jpg          hero cards
assets/intake/backgrounds/<name>.jpg        stage / domain backgrounds
```

`assets/sprites/` holds **finished runtime art only** — keyed, trimmed, alpha,
registered in `manifest.json`. Generated art arrives as an untrimmed plate on a
flat colour field with no alpha, so a raw file landing there makes the game try
to draw a 1024×1536 background as a sprite. Every round so far has arrived that
way, so this is the normal case rather than a mistake — it just has to go
through the pipeline first.

`assets/intake/` is tracked by git (only `_processed/` is ignored) so uploading
into it works. Raw files live there until processed, then move to
`assets/reference/round<N>/` as the permanent archive. See
[assets/intake/README.md](../assets/intake/README.md) for the full flow.

---

## Delivery spec

PNG, **one subject per file**, no text, no watermark, no border, no grids.
(Hero cards are the exception: JPEG, full-bleed background — see 9A.)

- **Background:** true alpha if possible; otherwise solid magenta `#FF00FF` —
  except warm-palette characters (Sukuna, Nobara, Momo, Hakari, Yuji, Choso),
  which need mid-grey `#808080`. A magenta key eats pink and red tones.
- **Facing:** draw everything **facing RIGHT**. If your generator prefers left,
  say so and it gets batch-mirrored on import.
- **Framing:** full body inside the frame with margin on **all four sides**.
  Nothing may touch the canvas edge.
- **Resolution:** character body **at least 600 px tall**.
- **One zoom per character.** Draw every pose of a character at the same figure
  scale — do not redraw each pose to fill its canvas. Standing poses should
  measure within a few percent of each other; low poses (crouch, roll, run) are
  genuinely shorter. This is the single most expensive thing to fix later: it is
  only catchable by eye, and a mismatch between two frames of the same idle
  makes the character visibly pulse while standing still.
- **Opacity:** bodies 100% opaque; only genuine effects (glow, mist, sound
  waves) may be translucent.

Style suffix — append to every sprite prompt:

> clean Japanese anime key-art style matching the Jujutsu Kaisen TV anime,
> crisp dark lineart, cel shading with soft gradient accents, vibrant colors,
> high detail, full body, no text

Prompt formula: `[CHARACTER BLOCK]`, `[POSE LINE]`, facing right,
`[STYLE SUFFIX]`.

### Directional effects point LEFT

The projectile renderer mirrors a sprite when it travels right, so art drawn
pointing right flies backwards with its blunt end leading. Draw travelling
effects (beams, lances, diving creatures) **pointing left**; `chain.png` and
`crow.png` are the correct references.

---

## Character blocks

Used verbatim as `[CHARACTER BLOCK]` in every prompt below, so a character's
design stays identical across their card, their sprites and any new art.

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
| yuji | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" *(grey key)* |
| choso | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" *(grey key)* |
| meimei | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| uro | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a short dark bob haircut and sharp eyes, wearing a fitted pale combat bodysuit with purple accent panels and bandage-wrapped forearms, light flexible shoes" |
| reggie | "Reggie Star from Jujutsu Kaisen, lean sly man with long dark hair swept back and a small chin beard, wearing a dark fur-collared jacket over a patterned shirt with dark trousers, carrying a closed dark-purple umbrella that conceals a katana" |
| gakuganji | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern elderly man, mostly bald with grey hair at the sides and a long grey beard and mustache, heavy wrinkles and hooded eyes, wearing dark traditional kimono-style robes, carrying a black electric guitar on a strap" |

*(The 17 above are the launch roster; the six below shipped in round 7.)*


---

# Round 9 — open

Three independent parts; any can be delivered on its own.

---

## 9A. Regenerate the 17 original hero cards

Round 7 delivered six new fighters, and their hero cards landed in a **visibly
different art style** from the original seventeen. All six are now live, so the
select screen shows a clear seam between the two styles. (All six round-7 fighters have since shipped, so the split is now **17 old-style
cards against 6 new-style ones**.)

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

Character blocks are unchanged — reuse them verbatim from **Character blocks** above
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
labelled rows (`CHARACTER_GROUPS` in `src/config_menus.js`), so finishing a whole
group makes that row internally consistent even while others are pending:

1. **Sorcerers** — `gojo`, `nanami`, `todo`, `momo`, `hakari`, `toji`
   (this row also contains new-style `meimei` and `gakuganji`, so the mismatch
   is most visible here).
2. **Tokyo Jujutsu Students** — `yuta`, `maki`, `megumi`, `nobara`, `inumaki`,
   `panda` (this row also holds new-style `yuji`).
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

---

## 9B. Technique frames that show the wrong move — 10 frames

Carried over from the missing-sprites audit. These are **not** missing files,
so nothing 404s and nothing appears in the console — the state resolves to a
generic cell from the original sprite sheet that does not depict the technique
being used. Verified still outstanding against `src/characters.js`.

All ten belong to the original 17, who still use `r{row}c{col}` sheet cells for
states round 5 did not cover.

| Character / state | Move it should show | Currently draws |
|---|---|---|
| `maki` / `specialNeutral` | Cursed Tool Toss | `r1c2` — her dash frame |
| `nobara` / `specialNeutral` | Straw Doll: Nail Shot | `r0c2` |
| `geto` / `specialNeutral` | Cursed Spirit Volley | `r3c2` |
| `geto` / `specialSide` | Rainbow Dragon | `r3c0` |
| `geto` / `downHeavy` | Kuchisake-Onna's Scissors | `r2c2` |
| `hakari` / `specialDown` | Reserve Balance | `r4c3` |
| `megumi` / `specialNeutral` | Nue | `r3c2` |
| `hanami` / `specialNeutral` | Cursed Buds | `r3c2` |
| `hanami` / `specialSide` | Root Eruption | `r2c2` |
| `jogo` / `specialSide` | Lava Geyser | `r2c2` |

Deliver as semantic pose keys, the same naming the round-7 fighters use, so the
frame is addressed by what it is rather than by a grid position:

| File | Pose line |
|---|---|
| `maki/special_neutral.png` | "hurling a spinning cursed tool forward underarm, weight rotated through the throw, arm following through across the body" |
| `nobara/special_neutral.png` | "firing cursed nails from a drawn-back hammer, nails streaking from the hammer head, off hand flicked open" |
| `geto/special_neutral.png` | "releasing a handful of small cursed spirits from an open palm held forward, robe sleeve falling back" |
| `geto/special_side.png` | "both arms sweeping outward to loose a huge serpentine cursed spirit low along the ground, body braced against the recoil" |
| `geto/attack_down.png` | "swinging a heavy overhead blow straight down into the ground, deep stance, robe billowing with the drop" |
| `hakari/special_down.png` | "slamming an open palm down as a pachinko reel of light spins beside him, cocky grin, jacket flaring" |
| `megumi/special_neutral.png` | "flicking a hand out low as a winged shadow shikigami launches forward from beneath him, shadow pooling at his feet" |
| `hanami/special_neutral.png` | "lobbing a cluster of seed pods underhand from a bark-clad palm, branch arm extended forward" |
| `hanami/special_side.png` | "driving one arm down into the earth to raise roots, torso twisted low, bark shoulders hunched" |
| `jogo/special_side.png` | "thrusting a hand toward the ground to erupt a magma vent, single eye narrowed, heat haze rippling off the volcanic head" |

Each needs the same **one zoom per character** treatment as everything else:
match the figure scale of that character's existing `idle_a`.

Once delivered these are wired by pointing the character's `anims` entry at the
new key (e.g. `specialNeutral: { frames: ["special_neutral"], … }`), which is a
one-line change per state.

