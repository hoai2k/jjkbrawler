# Asset Requests — open requests

Everything in this file is **outstanding**. Delivered rounds are recorded in
[asset-requests-history.md](asset-requests-history.md) — including the round
numbers, so a commit or code comment citing "round 5 art" still resolves.

**Current status: rounds 1–12 delivered. Rounds 13, 14 and 15 are open.**

The roster is complete and **every fighter now has one sprite per action** —
round 11 finished the conversion that round 5 started, so the 4×5 sprite sheet
is retired and no action anywhere plays a grid cell. Nothing outstanding blocks
play.

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

Round 14 is the **reach-and-stance** round. The art is now the balance data — a
move's hitbox is measured off the distance its own drawing reaches — so a strike
drawn short *is* short, and a fighter drawn broad is a broader target.

Round 15 is the first round that is **not about anything being wrong**. Both
parts make a good thing better and neither changes what a player sees until
somebody chooses it: **15A** redraws Hanami to canon as *alternates* — his
thirty-six sprites all draw a walking tree, and canon Hanami is a pale humanoid
curse — and **15B** asks for a simplified card per fighter, drawn to read at
roster-tile size, banked against a roster big enough to need them.

Read **[the canonical reference image](#the-canonical-reference-image--one-per-fighter)**
below before drawing anything: it names the one image each fighter is matched
against, and it applies to every request in this file. **Hanami is the one
exception right now** and it is marked ⚠ there.

---

## Where to deliver

**Upload art to `assets/intake/`, never to `assets/sprites/`.**

```
assets/intake/<character>/<pose_key>.png    sprites
assets/intake/effects/<name>.png            technique effects
assets/intake/summons/<name>.png            summon minions
assets/intake/cards/<key>_card.jpg          hero cards
assets/intake/cards/simple/<key>_tile.jpg   simplified roster tiles (15B)
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

**Cards are the exception** — both kinds are JPEG with a background baked in,
because nothing is ever keyed out of them. Hero cards are a full-bleed painted
scene (round 9A in the [asset-requests-history.md](asset-requests-history.md));
simplified tiles are a portrait on a flat field
([15B](#15b-a-simplified-card-for-every-fighter--23-images)). Everything below
in this section is about **sprites** and does not apply to either.

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
| hanami | "Hanami from Jujutsu Kaisen, tall powerfully built cursed spirit with a lean muscular pale bone-cream body marked by thick black brushstroke stripes down the face, arms, chest and abdomen, a rigid mask-like face with hollow black eye sockets, pale slit pupils and a wide fixed grin of large square teeth, a crown of thick tan antler horns curving up and back over the scalp, the entire right shoulder and arm wrapped in heavy white cloth bound close to the body with stitched seams where it meets the chest, a white cloth sash knotted at the waist with the ends hanging, wide baggy black hakama trousers gathered at the ankles, barefoot with broad clawed feet and long dark claws on both hands" *(grey key)* |
| yuji | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" *(grey key)* |
| choso | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" *(grey key)* |
| meimei | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| uro | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a fierce confident grin, pale violet-pink hair sweeping upward and outward in wild flame-like curling points, sharp violet eyes with heavy dark eyeliner, large gold cylindrical drop earrings, a black choker and a black band on each wrist, her only covering a wrap of pale-cyan cloud vapour clinging across her chest and hips with soft drifting edges, bare arms and legs, barefoot with violet-painted nails" *(grey key)* |
| reggie | "Reggie Star from Jujutsu Kaisen, tall lean man with straight shoulder-length blond hair parted at the side, heavy-lidded tired eyes and a narrow pointed chin beard, wearing a shaggy knee-length tunic and matching shoulder cape built from layered rows of torn white paper receipts with small pale mint-green printed tabs, bare arms and bare lower legs, barefoot" |
| gakuganji | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern hunched elderly man, bald on top with long straight white hair falling past his shoulders at the sides, a long thin white beard and drooping moustache, deeply wrinkled face with hooded eyes and gold hoop earrings, wearing a cream-white kimono top under a black band T-shirt with the kimono sleeves hanging loose, wide dark-purple hakama trousers, white tabi socks and wooden geta sandals, a crimson-red Flying-V electric guitar slung across his chest on a strap" *(grey key)* |

*(The 17 above are the launch roster; the six below shipped in round 7. The
`uro`, `reggie` and `gakuganji` rows were rewritten from the anime reference in
round 9 — see **9E**; art made against their old wording is being replaced.
`hanami` was rewritten the same way for **15A**: the old row described a walking
tree, which is not the character. Every Hanami sprite in the game was drawn from
it.)*


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
| Hanami ⚠ | `hanami` | `assets/reference/canon/hanami_anime.png` — **not** his `idle_a`, see below |
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

**Mahoraga's canon is the shikigami render, not his `idle_a`** —
`assets/reference/canon/mahoraga_canon.png`, the full-body art the game already
ships. Round 11A redrew him from it, so his delivered set now agrees with it;
the render stays the authority for his design because it is what the set was
drawn against.

**⚠ Hanami's canon is now the anime render, not his `idle_a`** —
`assets/reference/canon/hanami_anime.png`. His whole delivered set draws him as
a **bark-and-foliage tree body**; canon Hanami is a **lean pale humanoid curse**.
They are not the same character, so `hanami_idle.png` is exactly what must *not*
be matched, the way Gakuganji's, Reggie's and Uro's idles were before 9E. Round
15A is the whole-set redraw. When its new idle is picked, re-run
`tools/build_canon_reference.py` and `hanami_idle.png` becomes the authority
again like everyone else's.

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
[The crouch keeps coming back standing](asset-requests-history.md#the-crouch-keeps-coming-back-standing)
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
[The second frame has to finish the first](asset-requests-history.md#the-second-frame-has-to-finish-the-first)
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

Everything in this round is a **fault** — a pose that does not do what the
animation says it does. Hanami's whole-set redraw started here as 14D and has
moved to [round 15](#round-15--open), which is where the improvements live: his
set is not wrong, it is drawn from the wrong design brief, and mixing that in
with sixteen short smashes made this round's total misreport how much of the
game is actually broken.

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

**Neither part of this round is a fault.** Rounds 13 and 14 exist because
something is wrong — a crouch that stands up, a smash that does not reach.
Round 15 is the first round that is entirely about making good things better,
and both parts are built so that nothing changes until somebody decides it
should.

- **15A** — Hanami, redrawn to canon (36 sprites, all **alternates**)
- **15B** — a simplified card for every fighter (23 images, **new art, nothing replaced**)

**59 images in total, and none of it is blocking.** 15A lands beside the art it
improves and is adopted one pose at a time; 15B lands in a directory the game
does not read yet. Both can sit undelivered indefinitely without anything
looking wrong.

They are together because they are the same kind of ask — *this works, here is a
better version, take it when you want it* — and because keeping them out of 13
and 14 keeps the answer to "what is broken" honest.

---

## 15A. Hanami, redrawn to canon — 36 sprites

### Why

**The game's Hanami is not Hanami.** Every one of his sprites draws a
**bark-and-foliage tree body** — grey-brown wood grain, branch spurs off the
shoulders, leaves, a flower growing out of a cracked wooden face. Canon Hanami
is a **lean pale humanoid curse**: bone-cream skin under heavy black stripe
markings, a rigid grinning mask-face crowned with tan antler horns, one arm and
shoulder bound in white cloth, black hakama, bare clawed feet.

It is the same fault 9E fixed for Gakuganji, Reggie and Uro — a character block
written from imagination rather than from the show, then thirty-six sprites
drawn faithfully from it. The whole set is on-model *for the wrong design*, so
there is nothing here to fix pose by pose. The reference is
[`assets/reference/canon/hanami_anime.png`](../assets/reference/canon/hanami_anime.png)
and the rewritten block is in [Character blocks](#character-blocks) above.

**His `hanami_idle.png` is not canon and must not be matched** — see the ⚠ note
under [The canonical reference image](#the-canonical-reference-image--one-per-fighter).
It stays checked in only so the two designs can be put side by side.

### This is an improvement request, not a repair

**Every pose is flagged `alternate`, not `character`**, and that is deliberate.
The set on screen today is good work and it animates well; nothing about it is
broken in play. So the delivery lands **beside** each pose as a second drawing —
the chevron in the sprite workbench gets a dot, the selection does not move, and
nothing a player sees changes until somebody opens the pose and picks the new
one. See [asset-pipeline.md](asset-pipeline.md#request-alternate).

Which means this round can be **delivered and adopted one sprite at a time**.
There is no batch to wait for and no half-swapped state to avoid: an idle drawn
to canon can be picked the day it lands while the run cycle is still the tree.
The mixed look during the changeover is the accepted cost of not gambling a
finished character on a redraw arriving better.

`python3 tools/list_replacements.py` lists all 36 with the flag on them, so the
worklist survives without this document.

### Two things that are not changing

- **His kit.** Cursed Buds, Root Eruption, Flower Field and Domain of the
  Flowering Forest all stay exactly as they are, and so do their effect
  sprites. Canon Hanami is still a plant curse — the roots and blossoms come out
  of the ground and off his hands. What changes is that his *body* stops being
  made of the same material.
- **His size.** 220 cm, `scale: 0.58`, and the head-height solve behind it are
  measured numbers and are not in question. He is the second-tallest fighter on
  the roster and the new art has to fill the same space — check against
  `roster_idle.png`, not against the old Hanami alone.

### What to deliver

All 36 drawn poses. The **pose lines already in this document apply verbatim** —
these are the same thirty-six actions every other fighter has, and the only
thing being restated is the body doing them:

| Row | Poses | Pose lines |
|---|---|---|
| Idle | `idle_a` `idle_b` | [14B](#14b-a-consistent-idle-stance--20-sprites) |
| Run cycle | `run_reach_a` `run_pass_a` `run_reach_b` `run_pass_b` | round 12B, in [asset-requests-history.md](asset-requests-history.md) |
| Crouch | `crouch_a` `crouch_b` | [13A](#13a-crouches-that-are-standing--22-sprites) — **the head must drop by at least a quarter of the standing height**; today's `crouch_b` is one of the frames that does not |
| Crouch attack | `crouch_attack_a` `crouch_attack_b` | [13B](#13b-crouch_attack-frames-that-never-get-low--10-sprites) |
| Light pair | `attack_light_a` `attack_light_b` | [13C](#13c-light-attack-pairs-that-do-not-reach--7-sprites) |
| Heavy pair | `attack_heavy_a` `attack_heavy_b` | [14A](#14a-heavy-strike-frames-that-do-not-extend--16-sprites) |
| Air pair | `attack_air_a` `attack_air_b` | 13C's wind-up/strike reading, thrown in the air |
| Directional | `attack_up` `attack_down` | round 13D's `attack_down` line; both are correct on him today and only need redrawing for the body |
| Movement | `dash` `jump_rise` `fall` `land` `ledge_hang` | round 5, in [asset-requests-history.md](asset-requests-history.md) |
| Defence | `guard` `dodge_roll` `dodge_air` | round 5 |
| Reaction | `hurt` `prone` `dizzy` | `prone` is round 12C's drawn knockdown — flat on his back, not a swept `hurt` |
| Other | `charge` `victory` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` | round 5 and round 11B |

**Grey key, not magenta.** His existing set is keyed off magenta, which was
right for a brown tree. The new design is bone-cream and pale tan against
black, and magenta leaves a fringe on warm pale edges — so this delivery joins
the grey-`#808080` list with Sukuna, Nobara, Momo, Hakari, Yuji, Choso, Uro and
Gakuganji.

Two details the reference makes obvious and a prompt tends to drop, both worth
checking on every frame before delivering:

- **The white wrap is on one side only.** It covers the right shoulder and the
  whole right arm and it is bulky — it changes his silhouette, and a frame that
  wraps both arms or neither is not the same character.
- **The stripes are markings, not shading.** They are hard-edged black
  brushstrokes that run in fixed places — down the centre of the face, along the
  outsides of the arms, down the ribs and the abdomen. They must land in the
  same places from pose to pose or the set will read as flickering.

Deliver to:

```
assets/intake/hanami/<pose>.png
```

The intake routes them as alternates on its own — `intake_variants.py --plan`
reads the flag, so nothing has to be said at import time.

---
## 15B. A simplified card for every fighter — 23 images

### Why

**The hero cards do not survive being made small.** Each one is a full-bleed
640×820 illustration with a painted scene behind the fighter — Gojo on a neon
skyline, Panda outside a shrine at dusk, Nanami against tower blocks at golden
hour. At hero size, on the right of the select screen, that is exactly right and
it should stay.

The same file is also the **roster tile**, and there it is doing a different
job: the player is scanning two dozen thumbnails for the one they want, and the
scene is noise. It is already costing something. `styles.css` carries a
per-card brightness table — `--card-lift`, defaulting to 1.18, with a heavier
tier for Nanami, Toji, Geto, Reggie, Mei Mei and Gakuganji and a saturation-only
case for Panda — that exists solely because the art was not all painted at the
same key and the tiles read murky next to each other. That table is a patch on
using scene illustrations as icons.

**And it gets worse with every fighter added.** `layoutCharacterGrid()` fits the
roster by walking depths and then *cropping*: `ROSTER_ASPECTS` runs
`3/4 → 1/1 → 5/4 → 3/2 → 2/1`, and the tile is `object-fit: cover` anchored to
the **top**. A bigger roster reaches the wide end of that list sooner, so the
tile becomes a **letterbox strip off the top of a portrait** — and `object-position: top`
means it keeps the head and throws the body away. `MIN_CARD_WIDTH` is 96 px, so
at the far end each fighter is a 96 px-wide band of a painting.

This request is the art that is drawn for that job from the start.

### What this is not

- **Not a replacement.** Every existing `assets/cards/<key>_card.jpg` stays
  exactly where it is and keeps being the hero card. Nothing is flagged, nothing
  is deleted, and `assets/reference/cards_previous/` is untouched.
- **Not wired up.** The game does not read the new directory and this round does
  not ask for the code that would. It is art banked ahead of a roster big enough
  to need it — the switch is a one-line change in `buildCharacterCard()` when
  that day comes, and it can be made per-surface (tiles simplified, hero card
  and in-match portrait still the painting).
- **Not a redesign.** Same character, same costume, same palette family as their
  hero card, so the two read as the same fighter seen at two distances.

### The brief

**A portrait icon, not a scene.** One fighter, chest-up, filling the frame, on a
plain background. Think a roster icon in a fighting game's character select, or
an app icon of a person: legible at a glance, legible at a glance *small*, and
distinguishable from twenty-two others at the same size.

| | |
|---|---|
| **Crop** | Head and shoulders to mid-chest. The head is large in the frame — roughly the top half of the image — and centred horizontally |
| **Background** | Flat or a single soft vertical gradient in the fighter's theme colour (the `theme` field in `src/characters.js`). No scenery, no buildings, no sky, no props behind the figure, no logo, no text |
| **Lighting** | Even and front-lit. Bright enough to need **no** `--card-lift` correction: the whole point is that all 23 come back at the same key and the brightness table can be deleted |
| **Detail** | Fewer, larger shapes than the hero card. Simplify folds, hair strands and pattern; keep the two or three things that identify the fighter and drop the rest |
| **Silhouette** | Readable as a shape. Squint at it: Gojo's blindfold, Nanami's glasses, Maki's ponytail and glasses, Todo's topknot, Momo's hat, Jogo's volcano head should still be the thing you see |
| **Format** | JPEG, **640 × 820** (3:4), same as the hero cards, so the two are interchangeable in every slot |

**Two crops must both work, because the fitter chooses between them at runtime.**
Before delivering, check each image twice:

1. **Full 3:4** — the shallow-roster case.
2. **The top half only, at 2:1** — the crowded-roster case, which is what
   `object-fit: cover` with `object-position: top` produces at the wide end of
   `ROSTER_ASPECTS`. The fighter must still be recognisable, which in practice
   means **the whole head sits inside the top 45% of the image** and nothing that
   identifies them lives below the shoulders.

**Keep the bottom sixth quiet.** The name plate is drawn over it — white caps on
a dark gradient — so anything with detail down there is covered up.

### Prompt formula

`[CHARACTER BLOCK]`, head-and-shoulders portrait icon facing the viewer, chest-up
crop, head filling the upper half of the frame, flat `[THEME COLOUR]` background
with no scenery or props, even front lighting, simplified shapes and reduced
detail, `[STYLE SUFFIX]`.

Character blocks are in [Character blocks](#character-blocks) above and are used
verbatim, exactly as for sprites — **including Hanami's, which was rewritten for
15A**. His simplified card should be the pale humanoid curse, not the tree; it is
the one card in this set that will not match its hero card, and that is
intentional. His hero card gets redrawn when 15A is adopted.

`[THEME COLOUR]` is the fighter's `theme` in `src/characters.js` — the colour the
game already uses for their HUD accent and hit flashes, so a tile painted on it
matches what happens when they land a hit. The full list, in select-screen
order, and the full ask: **23 images, one per fighter.**

| Group | Fighter | Key | Theme |
|---|---|---|---|
| Students | Yuji | `yuji` | `#ff8264` |
| | Nobara | `nobara` | `#d86a4a` |
| | Megumi | `megumi` | `#7c8cff` |
| | Yuta | `yuta` | `#9fc7ff` |
| | Maki | `maki` | `#69d0a8` |
| | Inumaki | `inumaki` | `#d7d9e7` |
| | Panda | `panda` | `#8ea0b8` |
| | Todo | `todo` | `#b66cff` |
| | Momo | `momo` | `#b7b8ff` |
| Faculty | Gojo | `gojo` | `#62dcff` |
| | Nanami | `nanami` | `#ffd35a` |
| | Mei Mei | `meimei` | `#d8b95c` |
| | Gakuganji | `gakuganji` | `#d89b3f` |
| Other Sorcerers | Hakari | `hakari` | `#ff62cf` |
| | Toji | `toji` | `#a8aeb8` |
| | Uro | `uro` | `#8fd7e8` |
| | Reggie Star | `reggie` | `#86d67c` |
| Curses and Curse Users | Mahito | `mahito` | `#b56cff` |
| | Jogo | `jogo` | `#ff7a2f` |
| | Hanami ⚠ | `hanami` | `#9bb36b` |
| | Geto | `geto` | `#7d58d8` |
| | Choso | `choso` | `#c22e4a` |
| | Sukuna | `sukuna` | `#ff4c55` |

Four of these themes are close enough to a neighbour's to be worth checking side
by side before delivering — Todo `#b66cff` against Mahito `#b56cff` are all but
identical, and Mei Mei `#d8b95c` against Gakuganji `#d89b3f` are near. The
background is a supporting cue, not the identifier; if two tiles come back
reading as the same card, it is the *figure* that has to carry the difference.

**Mahoraga is deliberately not in it** — he is a `SPRITE_ACTOR`, nobody selects
him, and he has no hero card either.

### Where it goes

Deliver to:

```
assets/intake/cards/simple/<key>_tile.jpg
```

and it lands at:

```
assets/cards/simple/<key>_tile.jpg
```

**`_tile`, not `_card`, and the reason is not cosmetic.** The per-card
brightness rules in `styles.css` are written as filename suffix matches
(`img[src$="nanami_card.jpg"]`), which would match `simple/nanami_card.jpg` just
as happily as the hero card. A simplified card that silently inherited a 1.34×
lift meant for a murky painting would arrive blown out, and it would take a
while to work out why. A distinct suffix makes that impossible.

Cards take the short path through the pipeline — no keying, no measuring, no
manifest entry — so landing these is a move and nothing else.

---
