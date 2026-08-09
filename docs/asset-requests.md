# Asset Requests — open requests

Everything in this file is **outstanding**. Delivered rounds are recorded in
[asset-requests-history.md](asset-requests-history.md) — including the round
numbers, so a commit or code comment citing "round 5 art" still resolves.

**Current status: rounds 1–12 delivered. Rounds 13, 14, 15 and 16 are open.**

The roster is complete and **every fighter now has one sprite per action** —
round 11 finished the conversion that round 5 started, so the 4×5 sprite sheet
is retired and no action anywhere plays a grid cell. Nothing outstanding blocks
play.

**Rounds 13 and 14 are corrections to art that exists. Round 15 is not:** it is
four new fighters — Mechamaru, Yuki Tsukumo, Dagon and Kurourushi — whose kits
are already built, balanced and tested in code and who cannot be played until
their art lands. It is the same shape as round 7 and can be drawn in any order
against 13 and 14, since it touches no existing file.

**Round 12 is closed.** Every fighter runs on a four-frame cycle, every fighter
has a drawn knockdown, and its thirty-three workbench catches are all in. Its
one unbuilt piece — three install auras, which is effect art rather than a pose
— has moved to round 13 as **13E**, since keeping a whole round open for it
would misreport what is outstanding.

Round 13 is the **roster-wide sweep of the attack and crouch rows** that 12A
only ever sampled. Every attack and crouch frame on every fighter was put on a
shared ground line and read against the action it is bound to; forty-one poses
no round has asked for yet came back wrong. Four of them are the untouched half
of a crouch pair 12A has just fixed, so those four fighters visibly pulse
between a squat and a standing guard while the player holds down.

Round 16 is the first round that is not about fighters at all: **summons now
animate and summon specials now roll a creature out of a pool**, so it asks for
a six-pose set per creature — for the five summons already in the game, and for
twelve new creatures that are live in play today wearing borrowed art. It
touches no existing file either, so it can be drawn alongside any of the
others.

Read **[the canonical reference image](#the-canonical-reference-image--one-per-fighter)**
below before drawing anything: it names the one image each fighter is matched
against, and it applies to every request in this file. (Summons have no
canonical reference: 16A matches the existing still, and 16B is new design.)

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
| mechamaru | "Ultimate Mechamaru from Jujutsu Kaisen, a tall humanoid cursed-corpse puppet with a smooth clay-brown carved head, two round glowing green lens eyes and a small third lens on the forehead, a fixed grin of bared square teeth, a thick white puffy scarf around the neck, wearing a dark navy high-collared jujutsu uniform tunic with a white sash and very wide baggy navy trousers, bare carved wooden hands and bare wooden feet" |
| yuki | "Yuki Tsukumo from Jujutsu Kaisen, tall athletic young woman with very long straight blonde hair falling past her waist with two tufts framing her face and brown eyes, wearing a sleeveless dark indigo mandarin-collar top with gold frog clasps at the shoulder, a grey buttoned corset belt at the waist, high-waisted light blue jeans and brown ankle boots" |
| dagon | "Dagon from Jujutsu Kaisen, a tall broad hunched humanoid cursed spirit with deep red outer limbs and a tan inner chest and belly, a black midsection, a smooth red octopus-like head with blank pale eyes and a beard of thick red tentacles hanging from the jaw, black bat-like wings folded at the lower back, four heavy clawed fingers per hand and broad two-toed feet" *(grey key)* |
| kurourushi | "Kurourushi from Jujutsu Kaisen, a tall cockroach cursed spirit draped head to floor in a smooth glossy black shroud, a maroon insect face with eight red-and-orange eyes in uneven pairs and a wide grin of human teeth behind layered jaws, six very long thin purple antennae sweeping out from the head, dark chitinous insect legs splayed out at the base of the shroud, wielding a long dark cursed sword with six firing barrels along its spine" *(grey key)* |
| gakuganji | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern hunched elderly man, bald on top with long straight white hair falling past his shoulders at the sides, a long thin white beard and drooping moustache, deeply wrinkled face with hooded eyes and gold hoop earrings, wearing a cream-white kimono top under a black band T-shirt with the kimono sleeves hanging loose, wide dark-purple hakama trousers, white tabi socks and wooden geta sandals, a crimson-red Flying-V electric guitar slung across his chest on a strap" *(grey key)* |

*(The 17 above are the launch roster; the six below shipped in round 7. The
`uro`, `reggie` and `gakuganji` rows were rewritten from the anime reference in
round 9 — see **9E**; art made against their old wording is being replaced. The
four `mechamaru` / `yuki` / `dagon` / `kurourushi` rows are round 15 and were
written from the wiki's **(Anime)** renders, archived in
[`assets/reference/canon/`](../assets/reference/canon/) — they are the only
blocks with no delivered art behind them, so the render IS the authority for
them.)*


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
**`roster_idle.png`** — all twenty-three at matched figure scale on a common
floor line. Look at that one first: it is the only view that shows whether a fighter is
drawn a head too tall, which is the mistake no single-character reference can
catch. The copies are regenerated by `tools/build_canon_reference.py`, so they
keep resolving after a sprite is replaced.

| Fighter | Key | Canonical image |
|---|---|---|
| Choso | `choso` | `assets/reference/canon/choso_idle.png` |
| Yoshinobu Gakuganji | `gakuganji` | `assets/reference/canon/gakuganji_idle.png` |
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
| Reggie Star | `reggie` | `assets/reference/canon/reggie_idle.png` |
| Sukuna | `sukuna` | `assets/reference/canon/sukuna_idle.png` |
| Todo | `todo` | `assets/reference/canon/todo_idle.png` |
| Toji | `toji` | `assets/reference/canon/toji_idle.png` |
| Takako Uro | `uro` | `assets/reference/canon/uro_idle.png` |
| Yuji | `yuji` | `assets/reference/canon/yuji_idle.png` |
| Yuta | `yuta` | `assets/reference/canon/yuta_idle.png` |

**Gakuganji, Reggie Star and Uro used to be exceptions** — their old art was a
different character, so their `idle_a` was exactly what must *not* be matched.
Round 9E replaced all three from the **(Anime)** full-body renders on
[jujutsu-kaisen.fandom.com](https://jujutsu-kaisen.fandom.com), archived in
[`assets/reference/canon/`](../assets/reference/canon/), and their new `idle_a`
is canonical like everyone else's — the table above includes them. The
`<char>_anime.png` wiki renders that seeded those redraws stay in the
directory for design questions, but **prefer the `<char>_idle.png` files when
they exist**: they carry the figure scale, line weight and shading the
delivered set actually has.

**The four round-15 fighters have no `idle_a` at all**, which is the one case
this rule cannot cover: there is nothing to match yet. Their canon is the wiki's
**(Anime)** full-body render, checked in beside everyone else's:

| Fighter | Key | Canonical image |
|---|---|---|
| Dagon | `dagon` | `assets/reference/canon/dagon_anime.png` |
| Kurourushi | `kurourushi` | `assets/reference/canon/kurourushi_anime.png` |
| Mechamaru | `mechamaru` | `assets/reference/canon/mechamaru_anime.png` (plus `mechamaru_absolute_anime.png` for Mode: Absolute) |
| Yuki Tsukumo | `yuki` | `assets/reference/canon/yuki_anime.png` |

**Draw each one's `idle_a` first and place it before drawing anything else for
them** — every other pose of that fighter is then matched against their own
idle, exactly like the rest of the roster, and round 7's hardest lesson was that
a new character has no frame to inherit placement from (see
[asset-requests-history.md](asset-requests-history.md#round-7--six-new-fighters)).

**Mahoraga's canon is the shikigami render, not his `idle_a`** —
`assets/reference/canon/mahoraga_canon.png`, the full-body art the game already
ships. Round 11A redrew him from it, so his delivered set now agrees with it;
the render stays the authority for his design because it is what the set was
drawn against.

---

## Repo work, not a request: the two alpha fixes

`hakari/dodge_air` and `toji/dodge_air` both carry unkeyed grey behind the
figure — a drawn shadow in almost exactly the mid-grey `#808080` of their key
screen. Intake cuts the key by flooding in from the border, and a *shaded* grey
is not the flat key colour, so it survives the cut and hangs in the air behind
them every time they air-dodge.

**Neither is an asset request.** The drawings are good and their placement is
correct; the file is what is wrong, and that is repo work. They are flagged
`wantsImprovement: "alpha"` so the workbench shows them and
`tools/list_replacements.py` tracks them, and they are listed here only so a
round's numbers are not mistaken for the whole outstanding list.

If a redelivery is ever easier than a cut, the spec is the standard one with a
single addition: **no drawn shadow of any kind** — the game casts its own.

---

# Round 13 — open

Round 12A caught its poses one at a time, as fighters happened to pass through
the sprite workbench. This round is what happens when the same question is asked
of **every attack and crouch frame on the roster at once**: all 288 of them —
24 sets × 12 poses — composited at `character.scale × renderScale`, anchored by
`bodyBottom` to a shared ground line, mirrored where the manifest sets
`faceLeft`, and read against what the animation asks the pose to do.

Fifty-three came back suspect. Twelve are accounted for — all delivered across
12A's three batches. The remaining **forty-one** are this round, plus the three
install auras carried over from round 12.

- **13A** — crouches that are standing (22 sprites)
- **13B** — `crouch_attack` frames that never get low (10 sprites)
- **13C** — light-attack pairs that do not reach (7 sprites)
- **13D** — one wrong direction, one wrong person (2 sprites)
- **13E** — three install auras, carried over from round 12 (3 sprites)

**44 sprites in total.** All but one of the forty-one poses are `pose`: the
drawings are good, they are the wrong body. Nothing here is blocking — every one
of these frames renders and animates today, it just reads as a different move
than the one it plays for, and 13E's three installs run on procedural
placeholders in the meantime.

**Draw 13A first.** 12A's deliveries fixed one frame of four fighters' crouch
pairs and left the other, so Gojo, Mahito, Maki and Mahoraga now alternate at
3 fps between a genuine squat and the old standing guard. That pulse is more
visible in play than either frame was wrong on its own, and this round is what
closes it.

Idle, run and jump rows were deliberately excluded; the run was being redrawn
as 12B at the time, and has since landed — every fighter now has the
four-frame cycle.

## What the sweep found, before the tables

Three things are worth knowing before drawing any of it, because they say more
about *how* to re-request than any individual entry does.

**The defect lives in one frame slot.** Almost everything below sits in
`crouch_b` and `crouch_attack_b`. The `_a` half of each pair is usually right
and the standing attack rows are largely clean. Whatever produced these sets got
the first frame of a pair right and the second wrong, over and over — which
points at how the pairs were generated, not at twenty-two unrelated bad draws.

**Crouch height splits the roster in two, with nothing in between.** Measuring
drawn silhouette height against each fighter's own `idle_a`, before 12A landed:

| Crouches properly, 0.45–0.60 × idle | Stands up, 0.85–1.00 × idle |
|---|---|
| Yuji, Toji, Choso, Mei Mei, Nanami, Todo, Panda, Reggie | Gojo, Geto, Megumi, Inumaki, Hakari, Jogo, Momo, Mahito, Maki, Hanami, Yuta, Uro, Mahoraga |

There is no middle. A gradient would mean uneven drawing quality; a clean split
like this means two batches were drawn to two different readings of the same
word.

**And that reading is the actual bug.** The 0.85–1.00 group is not badly drawn.
The poses are good — they are just *fighting stances*: knees soft, fists up,
weight centred, head a few percent under the idle. "Crouch" is landing as "low
stance". The comparative test in
[The crouch keeps coming back standing](#the-crouch-keeps-coming-back-standing)
is the fix and it applies verbatim to everything in 13A and 13B — **the head
must drop by at least a quarter of the figure's standing height.** Do not draw
any of these against the pose line alone; 12A's delivered crouches are now the
worked example to match.

By contrast the directional poses came through almost untouched: `attack_up` is
correct on all 24 fighters and `attack_down` on 23 of 24. Explicit direction
words survive the pipeline in a way postural ones do not, which is worth
carrying into how 13A and 13B get prompted.

---

## 13A. Crouches that are standing — 22 sprites

All `pose`. Every one is the same miss: the fighter is upright, or nearly, in a
frame that plays while the player is holding down.

The eleven `crouch_b` entries are the severe half — at 0.87–1.00 × idle they are
indistinguishable from a second idle frame, so a crouching fighter does not
visibly change height at all. The `crouch_a` entries are the softer half: a real
stance, just not a crouch.

**★ marks the four that now sit opposite a delivered 12A crouch.** Those four
are the pulse described above and are the ones to draw first.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Jogo | `jogo` | `crouch_a` | Pose | 1.00 × idle — the idle hunch with the feet moved |
| Jogo | `jogo` | `crouch_b` | Pose | 0.97 × idle — also indistinguishable from idle |
| Toge Inumaki | `inumaki` | `crouch_b` | Pose | 0.98 × idle — upright, arms at his sides |
| Megumi Fushiguro | `megumi` | `crouch_b` | Pose | 0.98 × idle — standing straight, hands relaxed |
| Suguru Geto | `geto` | `crouch_b` | Pose | 0.98 × idle — the idle pose with a wider foot spacing |
| Momo Nishimiya | `momo` | `crouch_b` | Pose | 0.98 × idle — broom held vertical exactly as in idle |
| Mahoraga ★ | `mahoraga` | `crouch_b` | Pose | 0.97 × idle — upright, opposite a delivered `crouch_a` |
| Kinji Hakari | `hakari` | `crouch_b` | Pose | 0.97 × idle — upright, no knee bend |
| Nobara Kugisaki | `nobara` | `crouch_b` | Pose | Upright, hammer at her waist |
| Hanami | `hanami` | `crouch_b` | Pose | 0.94 × idle — standing |
| Yuta Okkotsu | `yuta` | `crouch_b` | Pose | 0.89 × idle — standing, sword lowered |
| Takako Uro | `uro` | `crouch_b` | Pose | 0.87 × idle — a standing lunge, torso vertical |
| Satoru Gojo ★ | `gojo` | `crouch_a` | Pose | 0.90 × idle — a boxing guard, opposite a delivered `crouch_b` |
| Mahito ★ | `mahito` | `crouch_a` | Pose | 0.85 × idle — fighting stance, opposite a delivered `crouch_b` |
| Maki Zen'in ★ | `maki` | `crouch_a` | Pose | A forward spear lunge, opposite a delivered `crouch_b` |
| Toge Inumaki | `inumaki` | `crouch_a` | Pose | 0.89 × idle — fighting stance |
| Kinji Hakari | `hakari` | `crouch_a` | Pose | 0.89 × idle — fighting stance |
| Suguru Geto | `geto` | `crouch_a` | Pose | 0.87 × idle — fighting stance |
| Megumi Fushiguro | `megumi` | `crouch_a` | Pose | Wide stance, head barely under the idle line |
| Momo Nishimiya | `momo` | `crouch_a` | Pose | Standing wide, broom held horizontal |
| Nobara Kugisaki | `nobara` | `crouch_a` | Pose | Standing, hammer raised |
| Ryomen Sukuna | `sukuna` | `crouch_a` | Pose | Fighting stance; only a slight drop from idle |

### Pose lines

Two frames, one held position. `crouch_a` and `crouch_b` are not a motion — they
alternate at 3 fps while the player holds down, so they are the **same crouch
with a small idle-breath difference**, not a descent sampled twice. Same figure
scale, same costume, same camera; only the arms and weight shift.

| Pose | Pose line |
|---|---|
| `crouch_a` | crouched down low, hips dropped to heel height, thighs closer to horizontal than vertical, back angled forward over the knees, head lowered to about chest height of their standing pose, guard up close to the body |
| `crouch_b` | the same low crouch, weight settled slightly further forward and the head a touch lower, arms shifted — the breathing beat of a held crouch, not a rise out of it |

For the four ★ entries, the fighter's **own delivered frame is the reference**:
match its depth, its figure scale and its costume exactly, because the two play
back to back and any difference between them is what the player sees.

---

## 13B. `crouch_attack` frames that never get low — 10 sprites

All `pose`. A `crouch_attack` is the 13A crouch **with the strike coming out of
it** — the body stays down through the follow-through. Three of these have no
strike in them at all, which is the worse failure: the frame the hitbox goes
live on shows a fighter standing still.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Kinji Hakari | `hakari` | `crouch_attack_b` | Pose | Standing upright, arms loose at his sides — no strike and no crouch, it is a neutral stance |
| Jogo | `jogo` | `crouch_attack_b` | Pose | The idle hunch with the arms hanging. No strike of any kind |
| Takako Uro | `uro` | `crouch_attack_b` | Pose | Upright, legs wide, arms spread. Nothing is attacking |
| Megumi Fushiguro | `megumi` | `crouch_attack_a` | Pose | One-legged knee raise, hands slack, and the whole body floats clear of the ground line |
| Megumi Fushiguro | `megumi` | `crouch_attack_b` | Pose | Upright torso, leg swung out at hip height — a standing kick |
| Mahito | `mahito` | `crouch_attack_a` | Pose | Mid-stride knee raise, feet off the ground, hands doing nothing |
| Toge Inumaki | `inumaki` | `crouch_attack_b` | Pose | Torso fully vertical at idle height with a waist-high side kick |
| Kento Nanami | `nanami` | `crouch_attack_a` | Pose | Wide standing stance, cleaver chambered at the hip — the rest of his set crouches properly |
| Yuta Okkotsu | `yuta` | `crouch_attack_b` | Pose | Upright wide stance; only the sword tip dips low |
| Hanami | `hanami` | `crouch_attack_b` | Pose | Standing at full idle height; the low sweep is carried entirely by a branch, not the body |

Megumi's and Mahito's `crouch_attack_a` share a second fault worth calling out:
**the figure is airborne.** A raised knee with both feet clear of the ground is a
jump pose. A crouching attack starts from the floor and stays on it.

### Pose lines

| Pose | Pose line |
|---|---|
| `crouch_attack_a` | crouched low as in `crouch_a`, hips at heel height, winding up a strike from that low position — weight loaded onto the back leg, striking hand or weapon drawn back near the floor, both feet planted |
| `crouch_attack_b` | the same low crouch, the strike now extended forward at ankle-to-knee height and travelling further in the direction `_a` was winding — hips rotated through, still down, head no higher than in `_a` |

The flip test from
[The second frame has to finish the first](#the-second-frame-has-to-finish-the-first)
applies unchanged: put `_a` beside `_b` and every part of the body that was
moving must have moved **further in the same direction**. A `_b` that is taller
than its `_a` is a rising attack, and rising attacks are `attack_up`.

---

## 13C. Light-attack pairs that do not reach — 7 sprites

All `pose`. `attack_light_a`/`_b` is a wind-up and a strike, and `_b` is the
frame that appears as the move becomes active. These have the fist or weapon
still tucked into the body on `_b`, so the fighter connects while visibly not
reaching — the readability problem `REACH_SCALE` exists to fix, coming from the
other direction.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Mei Mei | `meimei` | `attack_light_b` | Pose | The axe is drawn back at her hip and her lead arm trails behind her — this is a wind-up |
| Mei Mei | `meimei` | `attack_light_a` | Pose | And this is the fully extended thrust. **The pair is inverted:** it plays extended, then retracted |
| Mahoraga | `mahoraga` | `attack_light_b` | Pose | The blade stays across the body, tip pointing down and back. Nothing reaches forward |
| Mahoraga | `mahoraga` | `attack_light_a` | Pose | Same on the wind-up — the sword never leaves the body line. **Neither frame of the pair extends** |
| Jogo | `jogo` | `attack_light_b` | Pose | Claws stay at chest height; the arms never commit forward |
| Choso | `choso` | `attack_light_b` | Pose | Less extension than his own `_a` — a mild version of Mei Mei's inversion |
| Reggie Star | `reggie` | `attack_light_b` | Pose | Not wrong, but near-identical to `_a`: the pair has no wind-up-to-strike read at all |

Mei Mei is the one to draw first and the clearest statement of the whole class:
**the two frames she has are both correct drawings, in the wrong order.** If
re-drawing is expensive, hers is fixable by swapping which file each frame is
imported as — but the swap has to go through the workbench, because `ox`,
`bodyBottom` and `renderScale` are per-frame and would otherwise follow the
wrong art.

### Pose lines

| Pose | Pose line |
|---|---|
| `attack_light_a` | winding up a fast strike, striking hand or weapon drawn back beside the body, shoulders coiled away from the target, weight on the back foot, lead arm up as a guard |
| `attack_light_b` | the strike fully extended and travelling forward — arm or weapon at full reach out in front of the body, shoulders rotated through, weight transferred onto the front foot, the drawn-back hand now recovered to the chest |

For an armed fighter the weapon leads: the axe head, blade tip or claw is the
furthest thing forward in the frame, and clear of the body silhouette.

---

## 13D. One wrong direction, one wrong person — 2 sprites

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Suguru Geto | `geto` | `attack_down` | Pose | Both palms are raised **above his head** in an overhead chop. Nothing in the pose is directed downward |
| Reggie Star | `reggie` | `crouch_attack_b` | Character | The suit-and-umbrella design — not the fighter in his `idle_a` |

**Geto's is the only inverted direction on the roster.** `attack_up` is right on
all 24 fighters and `attack_down` on 23; this one frame reaches up where it
should drive down. Pose line:

| Pose | Pose line |
|---|---|
| `attack_down` | driving both palms downward at the ground in front of him, arms extended down and forward below the waist, knees bent and weight dropped over the strike, torso pitched forward, cursed energy gathering at the hands |

**Reggie's is the last of the twelve, and the only one still outstanding.** His
`attack_air_a` `attack_air_b` `attack_heavy_a` `attack_heavy_b` came back
on-model in 12A's second batch; `crouch_attack_b` is the same wrong design — a
dark-haired man in a suit with a purple umbrella — but it was never flagged,
because that pass swept by row rather than by frame. Draw it from
`assets/reference/canon/reggie_idle.png` and nothing else, exactly as his other
four were.

12A's crouch note lists `reggie/crouch_attack_b` among the poses that are "not
crouched". It is not — the pose is a genuine low lunge with the umbrella at
floor level, and it is the only thing about that frame that *is* right. The
fault is the character, which is why it is requested here as `character` rather
than as a crouch.

---

## Re-running this sweep

Worth repeating after any delivery lands, and the reason 13A's split showed up at
all. Render every frame of a pose class across all characters onto one board at
final in-game scale on a shared ground line — `tools/size_board.py` already does
the compositing per character — then read each pose against the action it is
bound to in `SEMANTIC_ANIMS` (`src/characters.js`).

The one number worth computing alongside it is **drawn silhouette height against
the same character's `idle_a`** — `(bodyBottom - oy) × renderScale`, as a ratio.
It does not decide anything on its own (an arm over the head inflates it, which
is exactly why the old `gojo/crouch_attack_b` measured 1.12), but it ranks the
crouch rows for review in seconds and it is what made the 0.60/0.87 gap visible.
Verdicts still come from looking, per §4 of the audit guide.

Two traps this sweep hit, for whoever runs it next:

- **Mirror `faceLeft` frames before judging direction.** Nineteen attack frames
  carry the flag, and read raw they look like they strike backwards. Three
  frames were nearly filed as defects that way.
- **Read a/b pairs together, never one at a time.** Mei Mei's inverted pair is
  invisible frame by frame — both drawings are good — and only shows up when the
  two are flipped between in the same spot, which is what the workbench's
  up/down pose stepping is for.

---

## 13E. Install auras — 3 sprites

Carried over from round 12, where it was 12D. The three sprite parts of
that round are delivered and it is closed; this is the only piece that
never arrived, and it is effect art rather than a pose, so it moves here
rather than keeping a round open on its own.

The install system draws a character-sized aura sprite behind a powered-up
fighter (`drawInstallAura`, `src/render.js`) — Nanami's Overtime has
`aura_gold.png`, Jogo's Furnace Shell `aura_orange.png`, and so on. Three
installs ran on a procedural ellipse because no aura was ever drawn for
them. The engine now names these files and ships **procedural placeholders**
for all three (soft gradient plates, generated in code) — so the slots are
live, and a delivered drawing replaces its placeholder through the normal
intake with no code change.

| File | Install | What to draw |
|---|---|---|
| `aura_jade.png` | Maki — Split Soul Stance / Awakening | **Not cursed energy** — she has none, and that is the point. A faint pale-jade `#b8ffe2` afterimage shell: thin vertical speed-line streaks and a barely-there rim, reading as air sheared by speed rather than as a glow. The most restrained aura in the set. |
| `aura_slate.png` | Panda — Gorilla Mode | Heat-shimmer and steam rolling off the body: soft slate-grey `#8ea0b8` vapour with a faint warm orange-red rim at the shoulders, dense at the bottom, ragged at the top. Physical heat, not energy. |
| `aura_indigo.png` | Yuji — Unbreakable Grit | A low, dense, dark blue-grey `#4a5578` aura hugging the silhouette, heaviest at the planted feet and forearms — endurance, weight, dug-in. No flames, no sparkle. |

Match the existing aura set for format: **portrait plate, the aura alone on the
key screen, no character in the image** — the engine composites it behind the
fighter's own sprite at body size. Open `assets/sprites/effects/aura_gold.png`
beside these before drawing; same canvas proportions, same soft-edged
translucency (the delivery is opaque on the key screen; intake cuts the alpha).
Key on magenta `#FF00FF` for jade and indigo; **grey `#808080` for
`aura_slate`** (its warm rim would fight a magenta key).

Deliver to:

```
assets/intake/effects/aura_jade.png
assets/intake/effects/aura_slate.png
assets/intake/effects/aura_indigo.png
```

---

# Round 14 — open

**Reach is now gameplay.** Until this month a fighter's melee range was a
hand-typed number in `characters.js` with no relation to their sprites, and the
hitboxes it produced reached about 2.1× as far as the art. That is gone: a
move's hitbox is now the distance the character's own committed swing is
*painted* to reach, plus a fixed 34 px of forgiveness that is the same for
everybody (`src/silhouette.js`, `MELEE_GRACE`). The full measurement and
rationale is in [hitbox-audit.md](hitbox-audit.md).

Which means the drawings below are no longer only a readability problem. **A
fighter whose strike pose does not extend now has short range in play**, and a
fighter drawn broad is a broader target. The art is the balance data.

- **14A** — heavy-attack strike frames that do not extend (16 sprites)
- **14B** — a consistent idle stance, for the ten outliers (20 sprites)
- **14C** — three caught while placing round 12's art (3 sprites)

**39 sprites in total.** None of it is blocking: every fighter plays today, and
each delivery re-derives that character's numbers on import with no code change.

Round 13 is the companion to this and should be drawn first where they overlap —
13C already asks for seven **light**-attack strike frames that do not reach, and
13A/13B ask for the crouches. 14A is the same defect in the **heavy** row, which
13's sweep did not separate out.

---

## 14A. Heavy strike frames that do not extend — 16 sprites

### Why

`attack_heavy_a`/`_b` is a wind-up and a strike, and `_b` is what is on screen
while the smash is active. Measured across the roster — from placed art only,
and in the world pixels the game draws at — the furthest a fighter's committed
swing reaches in front of themselves runs from **66 px to 108 px**. That is a
1.6× spread, and it does not line up with what these characters are holding:

| Fighter | Art reach | Holding |
|---|---|---|
| Panda | 108 px | bare paws |
| Yuta, Hanami | 96 px | katana / root-arms |
| Yuji, Todo, Jogo, Choso, Geto, Mei Mei | 90 px | fists, mostly |
| Megumi, Momo, **Nanami** | 84 px | **cleaver blade** |
| **Maki**, **Toji**, Sukuna, Mahito, Hakari, Inumaki | 78 px | **naginata**, **spear** |
| **Uro**, **Reggie** | 72 px | polearm / blade |
| **Gakuganji**, Gojo, Nobara | 66 px | **guitar** |

Gakuganji swings a full-size electric guitar and reaches less far than Panda's
paw. Maki's naginata and Toji's spear reach less far than Yuji's fist. That is
not a balance decision anybody made — it is the poses not extending, and it is
now the thing that decides their range.

**Four of these are a placement job, not a drawing job.** Maki's
`attack_heavy_a` and both heavy frames for Gakuganji, Uro and Reggie have never
been through the sprite workbench's placement pass, so they sit at the intake
pipeline's guess at their scale. The game deliberately ignores unplaced frames
when measuring (it would otherwise hand out ranges that change the moment
somebody opens the workbench), so those four fighters are currently being judged
on half their heavy row. **Place them first** — `node tools/audit_hitboxes.mjs`
lists them, and their numbers may well move on their own.

### What to deliver

Eight fighters, both frames of the heavy pair, drawn to the pose lines below.

| Fighter | Key | Poses | Ask |
|---|---|---|---|
| Gakuganji | `gakuganji` | `attack_heavy_a`, `attack_heavy_b` | The guitar is held across the chest through the whole swing. It should come round and finish out in front, headstock leading, well clear of the body |
| Maki | `maki` | `attack_heavy_a`, `attack_heavy_b` | The naginata stays inside her silhouette. A polearm smash ends with the blade at the far end of a two-handed thrust or sweep — the longest weapon on the roster should read as the longest |
| Toji | `toji` | `attack_heavy_a`, `attack_heavy_b` | Same: the Inverted Spear finishes tucked. He is the roster's weapons specialist and currently out-ranged by a fist |
| Nanami | `nanami` | `attack_heavy_a`, `attack_heavy_b` | The blunt cleaver ends roughly level with his own shoulder. His whole kit is about hitting at a measured distance (the 7:3 band) and the art has to show that distance |
| Uro | `uro` | `attack_heavy_a`, `attack_heavy_b` | Place first (see above), then extend if it still reads short |
| Reggie | `reggie` | `attack_heavy_a`, `attack_heavy_b` | Place first, then extend |
| Sukuna | `sukuna` | `attack_heavy_a`, `attack_heavy_b` | The King of Curses' heavy is a compact chest-height slash. It should be his full span — this is the character who cleaves buildings |
| Gojo | `gojo` | `attack_heavy_a`, `attack_heavy_b` | Lapse Palm ends with the palm barely past his own chest. A thrown palm strike ends with the arm locked out |

### Pose lines

| Pose | Pose line |
|---|---|
| `attack_heavy_a` | the wind-up of a committed, heavy swing: weapon or striking arm drawn fully back and low behind the body, shoulders coiled hard away from the target, weight entirely on the back foot, front foot light. Bigger and slower than the light wind-up — this is a move that takes a moment |
| `attack_heavy_b` | the follow-through at full extension: weapon or arm at maximum reach, arm locked out or the polearm at the end of its sweep, shoulders rotated fully through past square, hips turned, weight driven onto the front foot. **The furthest-forward thing in the frame is the weapon or the fist, and it is clear of the body silhouette by at least half a torso width** |

The comparative test, and the thing to check before delivering: **lay
`attack_heavy_b` over `idle_a` at the same scale. The weapon or striking hand
must sit further forward than anything in the idle by at least a third of the
figure's standing height.** For an armed fighter it should be more. If the two
silhouettes have roughly the same front edge, the pose is a stance, not a strike.

Match each fighter's canonical reference image for costume, proportions and line
weight. Same delivery spec as everything else.

Deliver to:

```
assets/intake/<character>/attack_heavy_a.png
assets/intake/<character>/attack_heavy_b.png
```

---

## 14B. A consistent idle stance — 20 sprites

### Why

Hurtboxes are now measured from each fighter's own art rather than being one
64×108 box for the whole roster. Height works well: heights were solved against
a common target years ago, so a taller fighter is a taller target and the
numbers are trustworthy.

**Width is not.** Measured across the roster's idles, body width runs from
**0.21 to 0.50 of the fighter's own height** — and that spread is drawing style,
not character. Yuji's idle is a slim three-quarter turn; Jogo's is square-on
with his cape spread. Neither fact should decide how easy they are to hit, and
at the moment they would.

The game currently trusts that measurement only 45% of the way
(`BODY.widthTrust`), compressing everyone toward a typical body. That is a
compromise standing in for consistent art — it means a genuinely broad fighter
is under-represented and a slight one over-represented, because the data cannot
be trusted on its own. **Consistent idle stances would let that number go up and
make silhouette a real characteristic.**

Note this is the one row round 13's sweep deliberately excluded, and 12B has
since redrawn the run — so the idle is the remaining unaudited pose, and the one
that now carries the most mechanical weight.

### What to deliver

`idle_a` and `idle_b` for the ten fighters whose measured width falls outside
**0.30–0.45 of their own drawn height** — ten of the twenty-two with placed idle
art, so **20 frames**. The other twelve are already inside the band and need
nothing.

| Too narrow — drawn edge-on | ratio | | Too broad — costume, not body | ratio |
|---|---|---|---|---|
| Yuji | 0.21 | | Sukuna | 0.49 |
| Inumaki | 0.25 | | Jogo | 0.50 |
| Choso | 0.25 | | Mahoraga | 0.80 |
| Mahito | 0.27 | | | |
| Yuta | 0.27 | | | |
| Nobara | 0.29 | | | |
| Megumi | 0.29 | | | |

Mahoraga at 0.80 is the extreme and is partly legitimate — he is a genuinely
enormous shikigami with a tail, and the karma wheel on his headdress is part of
his sprite like everything else he wears. Four-fifths as wide as he is tall is
still a square, though, and the width is carried by the tail sweeping out behind
him rather than by his body. Worth checking against play before asking for a
redraw: a hurtbox that wide is a real disadvantage, but so is a general who
cannot fit his own tail.

`node tools/audit_hitboxes.mjs` prints the live figures; re-run it after any
delivery rather than trusting this table.

The ask is not a redesign. It is one framing rule applied to all of them:

| Pose | Pose line |
|---|---|
| `idle_a` | standing ready, **square to the camera in a three-quarter turn of no more than about 20 degrees**, feet about shoulder-width apart, arms relaxed at the sides or lightly raised, nothing held out away from the body. Weapons carried close — at the side, on the shoulder, or across the back — not extended, not spread |
| `idle_b` | the same stance one breath later: chest a little higher, shoulders a little back, same footprint. **The silhouette's outer edges must not move between the two frames** |

Three specific things to avoid, because they are what the measurements caught:

- **A deep three-quarter or profile turn.** Yuji, Inumaki, Choso and Nobara are
  drawn nearly edge-on, which makes them measure as narrow as a post.
- **Capes, coats and hair spread wide.** Jogo, Sukuna and Gakuganji measure
  broad because of what is *around* them rather than what they are. Costume
  should hang, not fan.
- **Weapons held out.** A held weapon is deliberately excluded from the width
  measurement (`coreLeft`/`coreRight` in `tools/bake_anchors.py` trims it), but
  the trim works best when the weapon is a clear sliver beside the body rather
  than crossing it.

Deliver to:

```
assets/intake/<character>/idle_a.png
assets/intake/<character>/idle_b.png
```

**Important:** the idle is also what every fighter's *size* is solved against
(`docs/character-heights.md`), so a redrawn idle rescales that fighter's entire
sprite set. Deliver these one fighter at a time and expect a workbench pass on
each — this is the one pose where that is unavoidable.

---

## 14C. Caught while placing round 12 — 3 sprites

Three poses flagged in the sprite workbench during the placement pass over
round 12's delivery, rather than by a sweep. They are here rather than in a
round of their own because 14 is the open round for art faults and three poses
do not justify a fourteenth.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Yoshinobu Gakuganji | `gakuganji` | `attack_heavy_b` | Pose | Reads poorly for the action it stands for. Note that 14A already asks for the heavy row to *extend* — this is the same row and should be drawn with that brief in hand. |
| Yoshinobu Gakuganji | `gakuganji` | `attack_air_a` | **Alternate** | "AI hand drawing error" — the hands are malformed. Asked for as an **alternate**, not a replacement: the pose itself is right, so the delivery lands beside the current drawing and the better of the two is chosen by eye. |
| Takako Uro | `uro` | `prone` | Character | "Costume doesn't match canonical exactly" — check against `assets/reference/canon/uro_idle.png`, which is the design the rest of her set was drawn from. |

`attack_air_a` is the first use of **Request alternate**: it comes back as a
second option on the pose rather than overwriting what is there, the chevron in
the workbench gets a dot, and nothing on screen changes until somebody picks.
See [asset-pipeline.md](asset-pipeline.md#request-alternate).

`uro/prone` is a costume note on a pose that is otherwise fine, so a redraw
should keep the pose and the framing and only correct the outfit.

---

# Round 15 — open

**Four new fighters: Mechamaru, Yuki Tsukumo, Dagon and Kurourushi.**

Their kits are already finished. Stats, three specials each, an ultimate each,
Dagon's Domain Expansion, four new passives, three new statuses (`drench`,
`infest`, `blind`) and one new shared technique (Simple Domain) are all written,
balanced against the roster and tested — `node tools/smoke_staged.mjs` plays
every one of their moves in a real match and `node tools/check_kits.mjs` proves
every type they name has a handler. The design rationale for each is in
[characters.md](characters.md#staged--built-not-shipped).

What they do not have is a single pixel. They are held out of character select
by `STAGED_CHARACTER_KEYS` in `src/characters.js`, which is exactly how the six
round-7 fighters waited for their art. **This round is the only thing standing
between them and being playable.**

- **15A** — four full sprite sets (144 sprites)
- **15B** — nine technique effects
- **15C** — four summon minions
- **15D** — four hero cards
- **15E** — one domain background

**162 images in total.** Nothing here is blocking: the game plays exactly as it
does today until the art lands, and nothing existing changes when it does.

**Deliver one fighter at a time, `idle_a` first.** A new character has no frame
to inherit placement from, so their idle is placed by hand and everything else
inherits from it — round 7 learned that the expensive way and Choso shipped 17%
oversized for a round. Anchor `idle_a` to the roster's idle `bodyH` band
(282–299) before importing the rest.

---

## 15A. Four sprite sets — 144 sprites

**36 poses per fighter.** The same semantic set every fighter on the roster now
has (`SEMANTIC_ANIMS`, `src/characters.js`) — no sprite sheet, no grid cells,
one drawing per action:

```
idle_a  idle_b
run_reach_a  run_pass_a  run_reach_b  run_pass_b
dash  jump_rise  fall  land
crouch_a  crouch_b  crouch_attack_a  crouch_attack_b
guard  ledge_hang  dodge_roll  dodge_air
attack_light_a  attack_light_b
attack_heavy_a  attack_heavy_b
attack_air_a  attack_air_b
attack_up  attack_down  charge
special_neutral  special_side  special_down
ult_a  ult_b
hurt  dizzy  prone  victory
```

The pose lines are the shared ones — the run cycle from round 12B, the crouch
and crouch-attack lines in [13A](#13a-crouches-that-are-standing--22-sprites)
and [13B](#13b-crouch_attack-frames-that-never-get-low--10-sprites), the light
pair in [13C](#13c-light-attack-pairs-that-do-not-reach--7-sprites) and the
heavy pair in [14A](#14a-heavy-strike-frames-that-do-not-extend--16-sprites).
**Read those four before starting**: every one of them exists because a
delivered set got that pose wrong, and this is the chance to get 144 frames
right the first time rather than re-request them as round 17.

Two of those matter more than the rest for these four, because reach is now
measured off the art (`src/silhouette.js`) and a pose that does not extend is a
fighter with short range:

- `attack_heavy_b` must put the weapon or fist **further forward than anything
  in that fighter's own `idle_a` by at least a third of their standing height**.
- `crouch_a`/`crouch_b` must drop the head **by at least a quarter** of standing
  height. Not a fighting stance — a crouch.

### What each fighter is holding, and what their poses are of

| Fighter | Key | Weapon / signature | Notes for the action poses |
|---|---|---|---|
| Mechamaru | `mechamaru` | Blades that extend from the right forearm (Sword Option); cannon ports in both palms | A puppet, not a person: joints are visible seams, the face never changes expression, and the grin is fixed in every pose including `hurt` and `dizzy`. `special_neutral` is a palm thrust forward with the port open (Ultra Cannon); `special_side` is a forward lunge with cursed energy venting from both elbows (Boost On); `special_down` is a braced two-handed guard stance inside a circle (Simple Domain). `ult_a`/`ult_b` are the Mode: Absolute firing stance — feet planted wide, both palms forward, head tilted back |
| Yuki Tsukumo | `yuki` | Bare fists | Everything she does is taijutsu, so her attack poses are boxing: `attack_light_*` a jab, `attack_heavy_*` a full hook with the hips through it, `special_neutral` a committed straight with the whole body behind it (Bombaye). `special_side` is a summoning gesture with Garuda's coils behind her; `special_down` is the same braced Simple Domain stance as Mechamaru's, hers unarmed. `ult_a`/`ult_b` are the wind-up and the release of one enormous punch |
| Dagon | `dagon` | No weapon — water and his own bulk | Heavy and hunched; the wings at his lower back let him hover, so `jump_rise`, `fall` and `dodge_air` should read as **levitation**, not a jump. `special_neutral` is a sweeping arm across the floor sending water out; `special_side` is shikigami tearing out of his own chest; `special_down` is both arms drawing inward, water spiralling in (Undertow). `ult_a`/`ult_b`: arms spread, fish streaming out of him |
| Kurourushi | `kurourushi` | The **Festering Life Sword** — a long dark blade with six firing barrels along its spine | The shroud reaches the floor, so its legs are only visible in motion: for `run_*`, `dash` and `dodge_roll` show the insect legs beneath a shroud that lifts. It can produce up to four arms — use two normally, four for `ult_a`/`ult_b` and `attack_heavy_*`. `special_neutral` is the sword levelled, barrels toward the target; `special_side` a sweeping arm trailing roaches; `special_down` a hand thrown up releasing flying sacs |

Deliver to:

```
assets/intake/<character>/<pose_key>.png
```

Keys: `mechamaru`, `yuki`, `dagon`, `kurourushi` — spelled exactly like that,
matching `src/characters.js`. (Round 7 lost time to art arriving in
`gakuganjii/`.) The curse is **Kurourushi**; "Kuroroshi" and "Kuro-Urushi" are
the same character and neither is the key.

**Key screen:** magenta `#FF00FF` for **Mechamaru** and **Yuki**; mid-grey
`#808080` for **Dagon** (he is almost entirely red) and **Kurourushi** (maroon
face, red-orange eyes).

---

## 15B. Technique effects — 9 sprites

Each of these is drawn on a key screen with **no character in the frame** — the
engine composites them itself. Travelling effects must **point LEFT** (see
[Directional effects point LEFT](#directional-effects-point-left)); the ones
that do are marked.

| File | Fighter | Used by | What to draw |
|---|---|---|---|
| `ultra_cannon.png` ◀ | Mechamaru | Ultra Cannon (neutral) | A compact bolt of pale mint-green `#63c7b0` cursed energy with a hard white core and a spiral of exhaust behind it — fired, not thrown. Reads as artillery |
| `pigeon_orb.png` | Mechamaru | Pigeon Viola, in the ultimate | One small tracking orb: a white core in a mint-green shell with a short comet tail. Five of these fly at once, so keep it simple and readable at 64 px |
| `ultimate_cannon.png` ◀ | Mechamaru | Ultimate Cannon, the ultimate's finisher | The three-barrel blast: three converging beams braided into one column, white-hot at the core, mint-green at the edges, wide enough to read as a screen-crosser |
| `star_rage_impact.png` | Yuki | Bombaye (neutral) **and** the ultimate | The moment mass arrives: a hard white shock-ring with amber-gold `#ffb703` fracture lines radiating out, and the air behind it visibly displaced. No flame, no cursed-energy glow — this is weight, not fire |
| `tide_wave.png` ◀ | Dagon | Disaster Tides (neutral) | A rolling wall of sea-blue `#2f8fd8` water, crest breaking forward, foam along the top edge. Wider than it is tall |
| `shikigami_fish.png` ◀ | Dagon | Death Swarm (ultimate) and the summon fallback | One man-eating shikigami mid-lunge: eel-bodied, too many teeth, fins that read at small size. Drawn as a single creature, not a shoal |
| `egg_shot.png` ◀ | Kurourushi | Egg Volley (neutral) | A small dark cursed egg in flight with a wet maroon sheen and a thin trail of already-hatching specks behind it. Tiny — 54 px tall in play |
| `blinding_sacs.png` | Kurourushi | Earthen Insect Trance (down) | A drifting cluster of flying insect curses carrying translucent sacs of ochre `#7c6a3a` liquid, some burst and leaking. A cloud, wider than tall, with ragged edges |
| `aura_chitin.png` | Kurourushi | Parthenogenesis (ultimate install) | An install aura: **the aura alone, no character**, portrait plate, matching `assets/sprites/effects/aura_gold.png` for format. A dense maroon `#8f3b4e` shell of crawling chitin and antennae silhouettes, thickest at the shoulders, ragged at the top |

Deliver to `assets/intake/effects/<name>.png`.

**Not requested, and deliberately:** Simple Domain (the circle) and Undertow
(the spiral) are drawn procedurally in `src/render.js` and `src/specials.js` and
look correct as they are. They need no art and none should be made for them.

---

## 15C. Summon minions — 4 sprites

Persistent creatures that walk the stage on their own. Format follows round 8:
one creature per file, full body, facing **RIGHT** (the summon renderer mirrors
toward its target, and the kits that ship with right-facing art set `faceRight`).

| File | Fighter | What to draw |
|---|---|---|
| `garuda.png` | Yuki | Her shikigami: a large serpentine creature with pale bone-like plating along its length, a blunt armoured head, and a pair of floating wings held clear of the body that carry it. Gold-white `#ffcf5c` accents |
| `dagon_shikigami.png` | Dagon | The heavy end of his menagerie: a thick armoured crustacean-eel, deep sea-blue, plated shell, too many legs, mouth open. Bulkier than `shikigami_fish.png`, which is the fast one |
| `cockroach_swarm.png` | Kurourushi | Not one roach — a **swarm shaped like a body**: a dense knot of cursed cockroaches moving as one mass, roughly waist-high, individual insects readable at the edges |
| `kurourushi_child.png` | Kurourushi | Its offspring: an identical but smaller Kurourushi, same black shroud and maroon eight-eyed face, shorter antennae, no sword |

Deliver to `assets/intake/summons/<name>.png`.

> **Do not drop these into `assets/sprites/summons/` directly.** Files that land
> there skip `tools/intake.py` and keep their key screen, which draws as a solid
> magenta rectangle on stage — round 8's one real mistake, recorded in
> [asset-requests-history.md](asset-requests-history.md#round-8--summon-minions).

---

## 15D. Hero cards — 4 images

Same spec as round 9A: **JPEG, portrait, full-bleed background** — a card, not a
keyed sprite. Character three-quarter or facing, dramatic lighting, a background
that reads at tile size, no text of any kind.

```
assets/intake/cards/mechamaru_card.jpg
assets/intake/cards/yuki_card.jpg
assets/intake/cards/dagon_card.jpg
assets/intake/cards/kurourushi_card.jpg
```

Match the existing set in `assets/cards/` for crop and energy. Suggested
backdrops, from where each of them actually fights: Mechamaru — a mountain
hangar with the cockpit lit; Yuki — open sky at dusk with Garuda coiled behind
her; Dagon — a flooded Shibuya platform, water to the knee; Kurourushi — a
Sendai side street under a hanging swarm.

---

## 15E. Domain background — 1 image

`captivating_skandha.jpg` — the backdrop for Dagon's **Horizon of the
Captivating Skandha**, drawn to the same spec as the seven domain backgrounds
requested in round 9C.

```
assets/intake/backgrounds/captivating_skandha.jpg
```

Landscape, full-bleed, no characters, no text. A bright tropical shore: palms
along one side, an ocean stretching to a horizon that is too far away and too
flat, white sand, a beach umbrella and two lounge chairs sitting incongruously
in the middle distance (they are canon — Mahito and Kenjaku used them). The
whole point of the domain is that it is **pleasant**: a holiday postcard that
happens to be the inside of a curse. Keep the mid-tones open — the game dims and
colour-grades the plate behind the fight, and the renderer draws its own water
line and shoal over the bottom of the screen.

---

## When it lands

Per fighter, in this order:

1. `python3 tools/intake.py` over their sprite folder, `idle_a` first, then
   place it in the sprite workbench (`/workbench/`) against the roster's idle
   `bodyH` band before importing the other 35.
2. Card into `assets/cards/`, effects through `tools/prep_effects.py`, summons
   through `assets/intake/summons/`.
3. Move their key out of `STAGED_CHARACTER_KEYS` in `src/characters.js` and
   into a `CHARACTER_GROUPS` bucket in `src/config_menus.js` — Mechamaru and
   Yuki are sorcerers, Dagon and Kurourushi are curses.
4. `node tools/check_kits.mjs`, `node tools/audit_hitboxes.mjs` (their reach is
   now derived from the art that just landed), then `node tools/smoke_combat.mjs`.

No other code change is needed at any point. The loader already knows their
effect, summon and domain-background paths and starts fetching them the moment
the key moves (`STAGED_EFFECT_KEYS` / `STAGED_SUMMON_KEYS` in `src/assets.js`).

---

# Round 16 — open

**Summons became creatures.** Two engine changes opened this round, and both
of them are asking for art that did not exist as a concept before:

1. **Summons animate.** A summon used to be *one still image* held for its
   entire lifetime — which is why the renderer swayed and leaned them, because
   a single drawing pinned to the stage reads as a decal. They now play a small
   pose set (`src/config_summons.js`), the same way a fighter plays theirs.
2. **Summon specials roll a creature.** Megumi's side special was the Divine
   Dogs, every cast, forever; Mahito's was one transfigured human. Each summon
   special now names a **pool** and draws one entry per cast, never the same
   one twice running. Twelve creatures were written into those pools and none
   of them have been drawn.

- **16A** — the six-pose animation set for the five summons already delivered
  (30 sprites)
- **16B** — twelve new creatures, six poses each (72 sprites)

**102 sprites in total, and none of it is blocking.** Every pose falls back to
that creature's still, every creature without a still falls back to a borrowed
`effect:*` stand-in named in its kit config, and failing that to a procedural
glow. So the game plays today with placeholders, one delivered pose improves
one state, and nothing has to arrive as a complete set to be worth arriving.

**Deliver per creature, not per pose row.** Six poses of one creature is a
finished creature; sixty scattered poses is nothing playable.

---

## The pose set — the same six for every creature

| Pose key | What it is |
|---|---|
| `idle_a` | Standing, weight settled. The creature's portrait pose — this is also what everything else falls back to. |
| `idle_b` | The same stance a breath later: head/body raised or lowered, one limb shifted. Alternates with `idle_a` at 2.4 fps, so the difference should be small and organic, not a second pose. |
| `move_a` | Mid-stride / mid-wingbeat, one extreme of the cycle. |
| `move_b` | The other extreme. `move_a`/`move_b` alternate at 8 fps and are what plays whenever the creature is travelling. |
| `attack` | The strike itself, at full extension — the bite, the lash, the spit, the detonation lunge. Held for ~0.25 s, so it must read at a glance. |
| `hurt` | Flinch: recoiling **away from the viewer's right**, body compressed, head turned in. Played when the creature is hit — see "why `hurt` matters" below. |

**Every pose of a creature must be the same subject at the same scale, drawn
on the same canvas with the feet (or the hover centre) at the same height.**
The engine anchors these by the bottom of the image, exactly as it does the
single still, so a creature that changes size or floats up between `idle_a` and
`move_a` will visibly jitter. Draw the six as one sheet-in-spirit even though
they are delivered as six files.

**Facing:** as with everything else, draw **facing RIGHT**. Three of the
delivered summons are flagged `faceRight` in `config_summons.js` and the rest
are mirrored on draw; keep each creature's six poses consistent with each
other and the flag sorts out the rest.

### Why `hurt` matters now

Summons take damage and can be destroyed, and as of this round a hit also
**staggers** one: it is shoved along the line of the blow, thrown off its own
behaviour for a beat, and popped off the floor if the hit was heavy enough.
Until `hurt` is drawn the engine sells that with a lean and a white flash on
whatever pose was showing, which works but reads as the same creature sliding.
A drawn flinch is the difference between "that summon was hit" and "that summon
is being beaten".

---

## 16A. Animation frames for the five delivered summons — 30 sprites

These five already have their single still in `assets/sprites/summons/`, and
that still stays exactly where it is — it is the fallback and the portrait.
**Open it before drawing and match it**: same creature, same colours, same
proportions, same canvas size. This request is the other five poses, plus an
`idle_a` that supersedes the still as the resting pose.

| Creature | Existing still | Character | Notes for the set |
|---|---|---|---|
| Divine Dog (White) | `divine_dog_white.png` | Megumi | Pale wolf-shikigami. `move_*` is a four-legged run; `attack` is the lunging bite the kit is named for. |
| Divine Dog (Black) | `divine_dog_black.png` | Megumi | Its twin in dark fur — draw the pair as one animal in two colourways, same poses, so they read as a matched set on screen (they are summoned together). |
| Rainbow Dragon | `rainbow_dragon.png` | Geto | Serpentine, iridescent. `move_*` is undulation, not legs; `attack` is the head-strike. |
| Transfigured Human | `transfigured_human.png` | Mahito | Shambling patchwork body. `move_*` is a lurch; `attack` is the moment before it bursts — arms out, body swelling. |
| Inventory Curse | `inventory_curse.png` | Toji | Hovering pact-bound curse. `move_*` is a hover cycle (it never touches the ground); `attack` is the gullet open, cursed tool emerging. |

Deliver to `assets/intake/summons/<file>_<pose>.png`, e.g.

```
assets/intake/summons/divine_dog_white_idle_a.png
assets/intake/summons/divine_dog_white_move_b.png
```

---

## 16B. Twelve new creatures — 72 sprites

Each of these is **live in the game right now**, rolling out of its character's
summon pool and fighting with real stats — wearing a borrowed effect sprite or
a coloured glow. The stats in `config_summons.js` are the brief: a creature
described as slow and enormous is slow and enormous in play, so draw the thing
the numbers describe.

The single still is optional for these: `idle_a` **is** the still, and the
loader falls back to it. Draw the six poses and nothing else.

### Megumi — the other shikigami (`SHIKIGAMI_POOL`)

Shadow-summoned beasts. All four share Megumi's palette: near-black bodies with
cool blue-violet `#7c8cff` cursed-energy edge light, as if cut out of shadow.

| Creature | File stem | What to draw |
|---|---|---|
| Great Serpent | `great_serpent` | An enormous shadow snake, body low and very long (it is drawn wide, not tall — 158 px of reach against 78 px of height). Head raised, jaw open. `attack` is the full-length strike. |
| Toad | `toad` | A squat toad-shikigami the size of a car, sitting rather than walking — it holds ground behind Megumi and lashes with its tongue. `move_*` is a settle/shuffle, not a hop. `attack` is the tongue out at full stretch. |
| Max Elephant | `max_elephant` | Vast four-legged shadow elephant, tallest thing in the pool (190 px) and unbothered by being hit. `attack` is the trunk sweep with a burst of water. `hurt` should barely rock — it is drawn heavy on purpose. |
| Rabbit Escape | `rabbit_escape` | ONE small shadow rabbit, drawn alone — the engine spawns three of them. Fast, light, comic, and completely expendable; `attack` is the flying leap that ends it. |

### Mahito — the other transfigurations (`TRANSFIGURED_POOL`)

Reshaped souls: stitched seams, mismatched limbs, patchwork blue-grey flesh
with violet `#b56cff` at the seams. They should look *made*, and made
carelessly.

| Creature | File stem | What to draw |
|---|---|---|
| Bloated Hulk | `transfigured_hulk` | A transfigured human reshaped for mass — huge torso, small head, arms that reach the floor. It walks over and keeps hitting; `attack` is a two-handed downward slam. |
| Crawler | `transfigured_crawler` | Reshaped for speed and drawn LOW to the ground: a body running on too many limbs, face turned up. Draw one; the engine spawns two. |
| Spitter | `transfigured_spitter` | Reshaped for range — a hovering torso with a distended mouth, trailing loose flesh. It never closes distance. `attack` is the mouth open mid-spit. |

### Geto — the rest of the collection (`CURSE_POOL`)

Stored cursed spirits. Unlike Mahito's, these are *whole* creatures with their
own designs — the variety across the four is the point. Violet `#7d58d8` energy.

| Creature | File stem | What to draw |
|---|---|---|
| Smallpox Deity | `smallpox_deity` | The canon curse: a squat pale figure covered in pox marks, arms folded, floating upright. Sickly green-white `#9fd07a` in the plague it coughs. Hovers; never lands. |
| Curse Hound | `curse_hound` | A cheap disposable curse in the shape of a lean four-legged hound, all mouth. Draw one; the engine spawns two. |
| Cursed Womb | `cursed_womb` | A bloated sack-bodied curse that lurches across the stage and detonates. Heavy, wet, unstable — `attack` is the moment it splits open. |

### Toji — the rest of the inventory (`INVENTORY_POOL`)

Curses he *keeps* rather than makes. Muted, tool-like, no cursed-energy glow of
his own — pale grey-green `#9fb8a8`.

| Creature | File stem | What to draw |
|---|---|---|
| Coil Curse | `coil_curse` | The one he lets off the leash: a coiled, chain-wrapped curse that uncoils to run. `attack` is the lunge, chain snapping taut. |
| Husk Curse | `husk_curse` | A hollow humanoid husk with a cursed blade still buried in its chest. It carries the weapon over and lets go — `attack` is the husk splitting and the blade coming free. |

---

## Integrating a round-16 delivery

Two flags in `src/config_summons.js`, and nothing else:

```js
divineDogWhite: { file: "divine_dog_white", delivered: true, poses: true, faceRight: true },
greatSerpent:   { file: "great_serpent", poses: true },
```

- `delivered` — the single still exists and should be fetched.
- `poses` — the six pose files exist and should be fetched.

Both default **off**, and both are off for everything undelivered, so the
loader never asks for a file nobody has drawn. Turn `poses` on for a creature
once *any* of its poses land: the fetch of each individual pose is optional, so
a half-delivered set is fine — a missing pose falls back to the still.

The files go through the normal intake (`assets/intake/summons/` →
`assets/sprites/summons/`); summon art is not in `manifest.json`, so there is
nothing else to register.
