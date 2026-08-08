# Asset Requests — open requests

Everything in this file is **outstanding**. Delivered rounds are recorded in
[asset-requests-history.md](asset-requests-history.md) — including the round
numbers, so a commit or code comment citing "round 5 art" still resolves.

**Current status: rounds 1–10 delivered. Round 11 is open.**

The roster is complete: all 23 fighters have a card, 31 poses and their effect
sprites, and nothing outstanding blocks play. Round 9 closed in full. Round 10
closed with four of its seventeen fighters finished — Gojo, Mahito, Nobara and
Yuta each have one sprite per action — and **the thirteen it did not reach rolled
into round 11 rather than staying open behind it**, so there is one open round at
a time and its numbers are the real remaining work.

Read **[the canonical reference image](#the-canonical-reference-image--one-per-fighter)**
below before drawing anything: it names the one image each fighter is matched
against, and it applies to every request in this file.

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
(Hero cards are the exception: JPEG, full-bleed background — see round 9A in
the [asset-requests-history.md](asset-requests-history.md).)

- **Background:** a **flat key screen**, solid magenta `#FF00FF` — except
  warm-palette characters (Sukuna, Nobara, Momo, Hakari, Yuji, Choso, Uro and
  Gakuganji), which need mid-grey `#808080`. A magenta key eats pink and red
  tones.

  Our generator **cannot output a true alpha channel** — every delivery is an
  opaque plate on a flat colour field, which is why the repo talks about green,
  magenta and grey screens rather than transparency. So the key screen is not a
  fallback, it is the format, and the transparency in `assets/sprites/` is
  something `tools/intake.py` cuts on import. That makes the *quality of the
  screen* the thing that decides whether a sprite comes out clean: pick a
  screen colour that appears nowhere in the character, keep it perfectly flat
  and unlit, and do not let it bounce colour onto hair or cloth edges. Round 9F
  was a whole request that existed because a screen leaked.
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

**Check the block against the show before drawing.** The authority is the
character's **(Anime)** full-body render on
[jujutsu-kaisen.fandom.com](https://jujutsu-kaisen.fandom.com), not the block
text and not the art already in the repo. Three blocks below (`uro`, `reggie`,
`gakuganji`) described characters who look nothing like their anime designs,
which is what round **9E** fixed; those three rows were rewritten from the
reference and their old wording is dead. Downloaded copies
of the references live in
[`assets/reference/canon/`](../assets/reference/canon/), with the source URLs
and a recipe for fetching more in that directory's README.

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
| yuji | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" *(grey key)* |
| choso | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" *(grey key)* |
| meimei | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| uro | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a fierce confident grin, pale violet-pink hair sweeping upward and outward in wild flame-like curling points, sharp violet eyes with heavy dark eyeliner, large gold cylindrical drop earrings, a black choker and a black band on each wrist, her only covering a wrap of pale-cyan cloud vapour clinging across her chest and hips with soft drifting edges, bare arms and legs, barefoot with violet-painted nails" *(grey key)* |
| reggie | "Reggie Star from Jujutsu Kaisen, tall lean man with straight shoulder-length blond hair parted at the side, heavy-lidded tired eyes and a narrow pointed chin beard, wearing a shaggy knee-length tunic and matching shoulder cape built from layered rows of torn white paper receipts with small pale mint-green printed tabs, bare arms and bare lower legs, barefoot" |
| gakuganji | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern hunched elderly man, bald on top with long straight white hair falling past his shoulders at the sides, a long thin white beard and drooping moustache, deeply wrinkled face with hooded eyes and gold hoop earrings, wearing a cream-white kimono top under a black band T-shirt with the kimono sleeves hanging loose, wide dark-purple hakama trousers, white tabi socks and wooden geta sandals, a crimson-red Flying-V electric guitar slung across his chest on a strap" *(grey key)* |

*(The 17 above are the launch roster; the six below shipped in round 7. The
`uro`, `reggie` and `gakuganji` rows were rewritten from the anime reference in
round 9 — see **9E**; art made against their old wording is being replaced.)*


---
## The canonical reference image — one per fighter

Every request in this file says "match the existing set", and every round so far
has had to work out what that means by opening files. This is the answer, once,
for all of them: **a fighter's `idle_a` is their canonical image.**

Open it before drawing anything else for that fighter, and match its **costume,
proportions, age, palette, line weight and shading**. Where `idle_a` and an
older sheet cell disagree — and they do, in places — `idle_a` wins. It is the
newest full-body art, it is the pose the sprite workbench benchmarks size
against, and it is what the player looks at most.

A rendered copy of each is checked in at
[`assets/reference/canon/`](../assets/reference/canon/), alongside
**`roster_idle.png`** — all twenty at matched figure scale on a common floor
line. Look at that one first: it is the only view that shows whether a fighter is
drawn a head too tall, which is the mistake no single-character reference can
catch. The copies are regenerated by `tools/build_canon_reference.py`, so they
keep resolving after a sprite is replaced.

| Fighter | Key | Canonical image |
|---|---|---|
| Choso | `choso` | `assets/reference/canon/choso_idle.png` |
| Geto | `geto` | `assets/reference/canon/geto_idle.png` |
| Gojo | `gojo` | `assets/reference/canon/gojo_idle.png` |
| Hakari | `hakari` | `assets/reference/canon/hakari_idle.png` |
| Hanami | `hanami` | `assets/reference/canon/hanami_idle.png` |
| Inumaki | `inumaki` | `assets/reference/canon/inumaki_idle.png` |
| Jogo | `jogo` | `assets/reference/canon/jogo_idle.png` |
| Mahito | `mahito` | `assets/reference/canon/mahito_idle.png` |
| Maki | `maki` | `assets/reference/canon/maki_idle.png` |
| Megumi | `megumi` | `assets/reference/canon/megumi_idle.png` |
| Mei Mei | `meimei` | `assets/reference/canon/meimei_idle.png` |
| Momo | `momo` | `assets/reference/canon/momo_idle.png` |
| Nanami | `nanami` | `assets/reference/canon/nanami_idle.png` |
| Nobara | `nobara` | `assets/reference/canon/nobara_idle.png` |
| Panda | `panda` | `assets/reference/canon/panda_idle.png` |
| Sukuna | `sukuna` | `assets/reference/canon/sukuna_idle.png` |
| Todo | `todo` | `assets/reference/canon/todo_idle.png` |
| Toji | `toji` | `assets/reference/canon/toji_idle.png` |
| Yuji | `yuji` | `assets/reference/canon/yuji_idle.png` |
| Yuta | `yuta` | `assets/reference/canon/yuta_idle.png` |

**Gakuganji, Reggie Star and Uro used to be exceptions** — their old art was a
different character, so their `idle_a` was exactly what must *not* be matched.
Round 9E replaced all three from the **(Anime)** full-body renders on
[jujutsu-kaisen.fandom.com](https://jujutsu-kaisen.fandom.com), archived in
[`assets/reference/canon/`](../assets/reference/canon/), and their new `idle_a`
is canonical like everyone else's.

**Mahoraga is the one exception left**, for the same reason and until 11A lands:
his canon is `assets/reference/canon/mahoraga_canon.png`, the shikigami render
the game already ships, not the set on disk.

---

# Round 11 — open

Three parts; any can be delivered on its own.

- **11A** — redraw Mahoraga from the shikigami's canon design (31 sprites)
- **11B** — finish the semantic sets for the 13 fighters round 10 did not reach (225 sprites)
- **11C** — wind-up/strike pairs for the 6 round-7 fighters (24 sprites)
- **11D** — one improvement request: Reggie's crouch attack does not read as the action (1 sprite)

**280 sprites in total.** 11B is the bulk of it and the one that changes how the
roster reads: thirteen fighters still play a sprint frame for a punch. 11A is the
most visibly wrong single thing — Mahoraga is currently drawn as a character who
does not exist. 11C is the smallest and finishes a transition already made
everywhere else.

Deliver **one complete fighter at a time** rather than one pose across everybody.
A fighter whose set is finished can be re-pointed and played immediately; a pose
spread across the roster leaves everyone half-converted.

---

## 11A. Redraw Mahoraga from the shikigami's canon design — 31 sprites

### Why

Megumi's ultimate now TRANSFORMS him into Mahoraga — he wears the shikigami and
the player drives it, rather than watching one walk around beside him
(`src/config_transform.js`). That puts all 31 poses on screen as a playable
body, which is a much harder test than a summon walking past, and the round-9
set does not survive it: **it is not the shikigami's design.**

Set the delivered `idle_a` beside the canon image and the disagreements are not
details:

| | Canon | Round-9 delivery |
|---|---|---|
| Head | Face fully covered, white blade-like plates sweeping back from it | Open face with three visible eyes |
| Hair | None — plates and a long white tail | Heavy black mane over the shoulders |
| Wheel | **Brass/gold**, eight spokes with ball finials, sitting close behind the head | **Black**, floating detached well above the head |
| Body | Chalk white, chain-and-tassel necklace at the collar | Chalk white, no necklace |
| Dress | Dark tattered skirt, violet sash, violet wrist and ankle wraps | Dark hakama, beige wraps |
| Weapon | Huge bone/stone sword | None |

All 31 poses are flagged `needsReplacement: "replace"` in the manifest, so
`python3 tools/list_replacements.py --markdown` lists them and intake clears the
flags when the new art lands.

### The canon reference

```
assets/reference/canon/mahoraga_canon.png
```

That is the full-body shikigami render the game already ships as
`summons/mahoraga.png`. **It is the authority for the design** — head, wheel,
necklace, skirt, wraps, tail, sword. It is a standing three-quarter pose, so it
answers *what he looks like*, not what each action looks like; the poses come
from the list below.

This is the same relationship 10B sets up for the roster, with one difference:
Mahoraga's canon is this render rather than an `idle_a`, because his existing
`idle_a` is the thing being replaced.

### What to deliver

The full transform set — the same 31 poses every round-7 fighter has, since a
transform draws from all of them and a missing one leaves a hole mid-fight:

| | Poses |
|---|---|
| **Stance** | `idle_a`, `idle_b`, `crouch_a`, `crouch_b`, `guard`, `dizzy`, `victory` |
| **Movement** | `run_a`, `run_b`, `dash`, `jump_rise`, `fall`, `land`, `ledge_hang`, `dodge_roll`, `dodge_air` |
| **Attacks** | `attack_light_a`, `attack_light_b`, `attack_heavy_a` + `attack_heavy_b`, `attack_up`, `attack_down`, `attack_air_a` + `attack_air_b`, `crouch_attack_a`, `crouch_attack_b`, `charge` |
| **Techniques** | `special_neutral`, `special_side`, `special_down`, `ult_a`, `ult_b` |
| **Reaction** | `hurt` |

Pose lines are in **10A**; the wind-up/strike pairs are **10C**. Note the
attack list uses the `_a`/`_b` pairs rather than the single `attack_heavy` the
round-9 set delivered — Mahoraga is being redrawn from scratch, so there is no
reason to deliver the superseded shape.

### Two things specific to him

**Draw the wheel INTO the pose, at the right size and place, but expect it to be
cut out.** The karma wheel is composited separately at runtime
(`effect:mahoraga_wheel`) precisely so it hangs level while he tumbles — a wheel
painted into every pose rolled with his body on a dodge, which is the opposite
of what it is for. Drawing it in keeps the poses readable and gives the intake
something to measure against; it gets lifted the same way Geto's curses were
(`tools/recut_curses.py` is the model).

**He is enormous, and that is the point.** `heightCm: 260` against a roster
averaging ~175, and `scale: 0.95` on top. Draw him at the same *figure scale* as
everyone else — body ~290 px on the plate, per the delivery spec — and let the
engine do the enlarging. Compensating by drawing him bigger on the plate would
stack with the height solve and put his head off the top of the screen.

### Delivery

```
assets/intake/mahoraga/<pose_key>.png
```

Standard spec at the top of this file. He is chalk-white against a dark
skirt, so **key on magenta `#FF00FF`** — a grey screen would fight the body.

---

## 11B. Finish the semantic sets — 225 sprites across 13 fighters

This is round 10A, carried forward with the four fighters it finished removed
from it. Gojo, Mahito, Nobara and Yuta now have one sprite per action; the other
thirteen still run on **4×5 sprite sheet cells** named `r{row}c{col}`, where one
cell has to serve several actions at once.

The problem was never the naming. It is that a sprint pose is what plays when
Maki throws a punch, and a crouch is what plays when anyone lands — and no amount
of re-pointing fixes it, because there is no fourth sprite to point at.

### What is missing, per fighter

Counts differ because round 9B already delivered some of the technique frames.
**On-disk filenames are the resume authority** — anything already in
`assets/sprites/<char>/` is done, whatever a total elsewhere says.

| Fighter | Key | Missing | Poses |
|---|---|---|---|
| Suguru Geto | `geto` | 15 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Kinji Hakari | `hakari` | 17 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Hanami | `hanami` | 16 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Toge Inumaki | `inumaki` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Jogo | `jogo` | 17 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Maki Zen'in | `maki` | 17 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Megumi Fushiguro | `megumi` | 17 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Momo Nishimiya | `momo` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Kento Nanami | `nanami` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Panda | `panda` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Ryomen Sukuna | `sukuna` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Aoi Todo | `todo` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |
| Toji Fushiguro | `toji` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |

Deliver to:

```
assets/intake/<character>/<pose_key>.png
```

Already delivered, do not redraw: `idle_a`, `idle_b`, `run_a`, `run_b`,
`jump_rise`, `fall`, `hurt`, `guard`, `ledge_hang`, `dizzy`, `victory`,
`charge`, `attack_up`, `dodge_roll`, `dodge_air`.

### Consistency is the point of this round

These 225 sprites are going to sit beside the poses each fighter already has, so
**matching the delivered set matters more than any individual frame looking
good.** For each fighter, put their `idle_a` beside what you are drawing and
check:

- **Same costume, same proportions, same age.** The sheets and the round-3/4/5
  additions already disagree in places; this round should agree with the
  *semantic* files, which are the newer and better art.
- **Same figure scale.** Body height ~290 px on a ~1024×1536 plate, matching
  their existing `idle_a`. The engine solves the final scale per fighter from
  `heightCm`, so do not compensate.
- **Same line weight and shading.** One character's set should look like it was
  drawn in one sitting.
- **Facing right**, one subject per file, flat key screen — the standard
  delivery spec at the top of this file. Warm-palette fighters (Sukuna, Nobara,
  Momo, Hakari) key on mid-grey `#808080`, everyone else on magenta `#FF00FF`.

### Pose lines

Combine each fighter's character block with the line below. Where a pose is a
technique, the fighter's own kit decides what it looks like — the special names
are in `src/characters.js` and on the move list in game.

| Pose | Pose line |
|---|---|
| `attack_light_a` | fast opening jab or short slash, lead hand, body square, minimal wind-up |
| `attack_light_b` | the follow-up strike with the other hand, hips rotated through it — reads as the second half of a two-hit combo |
| `attack_heavy_a` / `_b` | the wind-up and the strike of one committed heavy blow — see **10C**, which supersedes the single `attack_heavy` this row used to ask for |
| `attack_down` | striking downward at the ground in front, weight dropping onto it |
| `special_neutral` | performing their **neutral special** — the named technique, mid-execution, with its cursed energy forming but not yet released |
| `special_side` | their **side special**, moving forward into it |
| `special_down` | their **down special**, weight low, technique breaking out of the ground or the body |
| `ult_a` | the wind-up of their **ultimate**: gathering, energy at maximum, before release |
| `ult_b` | the release of that ultimate, arms and body fully committed |
| `crouch_a` | crouched low, guard up, alert — not resting |
| `crouch_b` | the same crouch a fraction lower, weight settled |
| `crouch_attack_a` | attacking from the crouch, low sweep or upward strike from the knees |
| `crouch_attack_b` | the follow-through of that low attack |
| `dash` | sprinting flat out, body angled forward past the leading foot — a running pose, distinct from `run_a`/`run_b` which are the mid-stride cycle |
| `land` | absorbing a landing, knees bent, one hand near the floor, dust at the feet — distinct from a crouch, which holds |

### The unused cells stay

Each fighter has 5–8 grid cells nothing draws (115 across the roster). **Do not
delete them.** They are alternate poses the sheets happened to contain, and the
sprite workbench can now point any action at any sprite — so an unused cell is a
candidate for a secondary action rather than dead weight. They stay in the
manifest and stay visible in the workbench under "All sprites".

### Integrating

1. Import with `tools/intake.py`, which registers the new poses.
2. Point each fighter's kit at them: the animation tables in `src/characters.js`
   currently name grid cells, and this is what replaces those names. The
   round-7 fighters' tables are the model — they inherit `SEMANTIC_ANIMS`
   wholesale and override almost nothing.
3. Anything not re-pointed keeps working: an action still naming a grid cell
   draws the grid cell exactly as it does today, so this can land fighter by
   fighter rather than all at once.

The result is 23 fighters with one sprite per action and no shared cells, which
is what makes the roster read consistently — and it retires the `r{row}c{col}`
vocabulary from everything except the leftovers.

---

## 11C. Wind-up and strike — 24 sprites across 6 fighters

This is round 10C, carried forward with the fighters it finished removed. The
four sheet-era fighters round 10 completed have their pairs; so does everyone
`11B` covers, since the pairs are in that pose list. What is left is the six
round-7 fighters, who were built with a single-frame heavy and aerial.

| Fighter | Key | Poses |
|---|---|---|
| Choso | `choso` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Yoshinobu Gakuganji | `gakuganji` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Mei Mei | `meimei` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Reggie Star | `reggie` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Takako Uro | `uro` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Yuji Itadori | `yuji` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |

Mahoraga needs these too and is not listed: his whole set is redrawn in 11A, and
the pairs are in that pose list.

### The problem

A heavy attack and an aerial each draw **one frame** for the whole move. The
engine already splits that move into startup, active and recovery
(`delay` / `dur` / `recover` in `src/moves.js`), but the art cannot follow it,
so whatever was drawn is held through all three.

Which half was drawn varies by fighter, and that is the actual bug. Mei Mei's
`attack_heavy` is a clean **wind-up** — axe raised, weight loaded, nothing struck
yet — held for the entire swing, so her heavy never connects on screen. Others
drew the **strike**, so the move has no anticipation and appears to teleport into
its follow-through. Both are good drawings of half a move.

### What to deliver

Two poses per fighter, for both the heavy and the aerial:

| Pose | What it is |
|---|---|
| `attack_heavy_a` | **wind-up.** Weapon or fist drawn back, weight loaded onto the rear foot, body coiled. Nothing has landed. The moment before commitment. |
| `attack_heavy_b` | **strike.** The same swing at full extension, weight transferred through to the front foot, the arc finished. The moment of contact. |
| `attack_air_a` | **wind-up, airborne.** Body coiled mid-jump, striking limb cocked, legs gathered. |
| `attack_air_b` | **strike, airborne.** Fully extended through the aerial arc, legs trailing, committed. |

**These two frames are one motion, drawn twice.** Same camera distance, same
figure scale, same costume, same weapon at the same size — the only thing that
changes is the body. If you can flip between them and see anything move that is
not the character's own action, they will read as a glitch rather than a swing.

Deliver to `assets/intake/<character>/attack_heavy_a.png` and so on, against
that fighter's canonical `idle_a` (10B above).

### The existing art is kept, not replaced

Whatever a fighter has as `attack_heavy` or `attack_air` today stays in the
repository and stays selectable. It becomes a **variant**: when the new pair
lands, both `_a` and `_b` are seeded with the new art, and the old drawing is
offered alongside each of them as a second option in the sprite workbench's
chevron menu (`manifest.variants`, `tools/build_variants.py`).

That matters because some of the existing art is good — Mei Mei's raised axe is a
better wind-up than a fresh one might be. Nothing is thrown away, and the choice
of which drawing serves which half is made per fighter, by eye, in the workbench.

### It is already wired

`src/characters.js` declares both attacks as two-frame animations:

```js
sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"],
             fallback: ["attack_heavy"], fps: 6, loop: false }
```

`resolvedAnim` filters an animation down to the art that exists, so **a fighter
without the pair draws exactly what they draw today**, and picks the pair up the
moment it is imported. No code change per fighter, and the round can land one
fighter at a time.

The frame rate is set so the drawing changes when the **hitbox** does: a heavy's
startup is `0.15 / speed` seconds and 6 fps holds the first frame for 0.167 s; an
aerial's is `0.13 / speed` against 8 fps and 0.125 s. The strike frame appears as
the move goes live, within about 10 ms.

### Relationship to 10A

**10A's `attack_heavy` row is superseded by this section.** The 17 fighters in
that round should be drawn as `attack_heavy_a` + `attack_heavy_b` directly rather
than as a single `attack_heavy` that would immediately need splitting. Everything
else in 10A is unchanged.

---

---

## 11D. Reggie's crouch attack — 1 sprite

The only **improvement** request outstanding, and the only thing in this round
that is not blocking: `reggie/crouch_attack_b` is drawn well, it just does not
read as the action. It is the follow-through of a low attack and looks like
something else.

| Fighter | Key | Pose | Ask |
|---|---|---|---|
| Reggie Star | `reggie` | `crouch_attack_b` | Pose — reads poorly, or is not the action it stands for |

Pose line, from 11B's table: *the follow-through of that low attack.* His canon
reference is `assets/reference/canon/reggie_idle.png` — the receipt tunic, bare
arms and legs, barefoot.

Keep this separate from the rest of the round when scheduling it. A `replace` is
blocking, because something on screen is wrong; this is a wish, and burying the
two together makes the blocking ones wait behind the wish list.
