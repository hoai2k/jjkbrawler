# Asset Requests — open requests

Everything in this file is **outstanding**. Delivered rounds are recorded in
[asset-requests-history.md](asset-requests-history.md) — including the round
numbers, so a commit or code comment citing "round 5 art" still resolves.

(This file is 2D art — sprites, cards, effects, backdrops. Requests for the
2.5D path's rigged 3D models live in
[billboards/docs/asset-requests.md](../billboards/docs/asset-requests.md),
numbered B1, B2…; the live-3D anime path's model requests live in
[render3d/docs/asset-requests.md](../render3d/docs/asset-requests.md),
numbered D1, D2…, and its 2D image inputs — turnaround boards for
image-to-3D, face sheets, shade palettes — in
[render3d/docs/image-requests.md](../render3d/docs/image-requests.md),
numbered DI1, DI2… — so the tracks never collide.)

**Current status: rounds 1–17 delivered. Round 18 is open.**

**Round 18 is the one to add to** — nothing else is outstanding, so anything
found from here goes into 18.

**The approval queue is empty.** Rounds 14, 16 and 17 all landed through the
[approval step](../assets/intake/README.md#the-confirm-step) — a delivery is in
the repo before it is in the game, and each pose is a decision waiting in the
sprite workbench — and every one of those decisions has now been made. What a
player sees is what was approved, Hanami's canon set included.

**Kurourushi is shipped.** His 36-pose set, his hero card, his simplified tile
and both his summons landed with round 15; the set was placed and approved pose
by pose, and his key now sits in the Curses group in `src/config_menus.js`, so
`STAGED_CHARACTER_KEYS` in `src/characters.js` is empty for the first time since
round 15. The roster is 27 fighters. What his placement pass found is **18B**
below.

The roster is complete and **every fighter now has one sprite per action** —
round 11 finished the conversion that round 5 started, so the 4×5 sprite sheet
is retired and no action anywhere plays a grid cell. Nothing outstanding blocks
play.

Read **[pose-brief.md](pose-brief.md)** before drawing a fighter. It is the
standing brief — what every pose has to be, the four criteria the engine
measures, and the faults that have each cost the roster a re-request — and it is
cumulative, so it is the reason a new set should arrive better than the last one.
This file asks for particular art; that file says what the art has to be.

Read **[the canonical reference image](#the-canonical-reference-image--one-per-fighter)**
below before drawing anything: it names the one image each fighter is matched
against, and it applies to every request in this file. (Summons have no
canonical reference: 16A matches the existing still, and 16B is new design.)

---

## Where to deliver

**Upload art to `assets/intake/`, never to `sprites/assets/`.**

```
assets/intake/<character>/<pose_key>.png    sprites
assets/intake/effects/<name>.png            technique effects
assets/intake/summons/<name>.png            summon minions
assets/intake/cards/<key>_card.jpg          hero cards
assets/intake/backgrounds/<name>.jpg        stage / domain backgrounds
assets/intake/garnish/<name>.png            near-field cards for ?camera=3d (18F)
```

`sprites/assets/` holds **finished runtime art only** — keyed, trimmed, alpha,
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
  fallback, it is the format, and the transparency in `sprites/assets/` is
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
| uro | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a fierce confident grin, pale violet-pink hair sweeping upward and outward in wild flame-like curling points, sharp violet eyes with heavy dark eyeliner, large gold cylindrical drop earrings, a black choker and a black band on each wrist, her only covering **two separate bands of pale-cyan cloud vapour with soft drifting edges — one wrapped across the chest, one at the hips — with the midriff BARE between them and never a single garment joining the two**, bare arms and legs, barefoot with violet-painted nails" *(grey key)* |
| reggie | "Reggie Star from Jujutsu Kaisen, tall lean man with straight shoulder-length blond hair parted at the side, heavy-lidded tired eyes and a narrow pointed chin beard, wearing a shaggy knee-length tunic and matching shoulder cape built from layered rows of torn white paper receipts with small pale mint-green printed tabs, bare arms and bare lower legs, barefoot" |
| mechamaru | "Ultimate Mechamaru from Jujutsu Kaisen, a tall humanoid cursed-corpse puppet with a smooth clay-brown carved head, two round glowing green lens eyes and a small third lens on the forehead, a fixed grin of bared square teeth, a thick white puffy scarf around the neck, wearing a dark navy high-collared jujutsu uniform tunic with a white sash and very wide baggy navy trousers, bare carved wooden hands and bare wooden feet" |
| yuki | "Yuki Tsukumo from Jujutsu Kaisen, tall athletic young woman with very long straight blonde hair falling past her waist with two tufts framing her face and brown eyes, wearing a sleeveless dark indigo mandarin-collar top with gold frog clasps at the shoulder, a grey buttoned corset belt at the waist, high-waisted light blue jeans and brown ankle boots" |
| dagon | "Dagon from Jujutsu Kaisen, a tall broad hunched humanoid cursed spirit with deep red outer limbs and a tan inner chest and belly, a black midsection, a smooth red octopus-like head with blank pale eyes and a beard of thick red tentacles hanging from the jaw, black bat-like wings folded at the lower back, four heavy clawed fingers per hand and broad two-toed feet" *(grey key)* |
| kurourushi | "Kurourushi from Jujutsu Kaisen, a tall cockroach cursed spirit draped head to floor in a smooth glossy black shroud, a maroon insect face with eight red-and-orange eyes in uneven pairs and a wide grin of human teeth behind layered jaws, six very long thin purple antennae sweeping out from the head, dark chitinous insect legs splayed out at the base of the shroud, wielding a long dark cursed sword with six firing barrels along its spine" *(grey key)* |
| mahoraga | "Mahoraga from Jujutsu Kaisen, the Divine General shikigami — a towering pale-white humanoid with grey sculpted musculature, a long segmented tail, and a fanned crest of white blade-like spines sweeping back from his head. **A brass eight-spoked karma wheel is mounted on the headdress behind his skull, with a ball at the end of each spoke** — it is part of his head and turns with it. Bandaged wrap and beads at the throat, a torn dark charcoal skirt over a pale sash, purple-grey wraps at wrists and ankles, barefoot, carrying a long pale bone-textured sword" |
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

**⚠ Hanami is the fourth case, found while round 17 was being written** —
his canon is `assets/reference/canon/hanami_anime.png`, not his `idle_a`. Every
sprite he has draws a **bark-and-foliage tree body**: grey-brown wood grain,
branch spurs off the shoulders, leaves, a flower growing out of a cracked wooden
face. Canon Hanami is a **lean pale humanoid curse** — bone-cream skin under
heavy black stripe markings, a rigid grinning mask-face crowned with tan antler
horns, one arm and shoulder bound in white cloth, black hakama, bare clawed
feet. They are not the same character, so `hanami_idle.png` is exactly what must
*not* be matched, the way the other three were before 9E. His block above was
rewritten from the render at the same time; the old wording is dead.
[17A](asset-requests-history.md#17a-a-full-hanami-set--36-sprites) is the redraw. When its new idle is
picked, re-run `tools/build_canon_reference.py` and `hanami_idle.png` becomes
the authority again like everyone else's.

**Mahoraga's canon is the shikigami render, not his `idle_a`** —
`assets/reference/canon/mahoraga_canon.png`, the full-body art the game already
ships. Round 11A redrew him from it, so his delivered set now agrees with it;
the render stays the authority for his design because it is what the set was
drawn against.

He also has a character block now, which he did not until round 13 came back
with **the karma wheel missing from three poses**. He was the only sprite set in
the game without one, so his prompts carried no design text at all and the
design lived entirely in a reference image — which works when somebody opens it
and fails silently when they do not. A reference image is not a substitute for
the block; it is what the block is checked against.

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

# Round 17 — delivered

**All of it has landed**, including the simplified card set. 17D's 27 tiles are
in `assets/cards/simple/`, one per roster fighter, and the round is closed.

| Part | Scope | State |
|---|---|---|
| 17A | A full Hanami set — 36 sprites | **Delivered.** Redrawn to canon; awaiting approval pose by pose |
| 17B | Mahoraga's three light/crouch poses — 3 sprites | **Delivered**, awaiting approval — the karma wheel is present this time |
| 17C | Two caught while placing round 13 — 2 sprites | **Delivered**, awaiting approval |
| 17D | A simplified card for every fighter — 27 images | **Delivered.** All 27 in `assets/cards/simple/`. The game draws them only when `USE_SIMPLE_CARDS` is `true` in `src/config_menus.js`, and it is currently `false` — a display decision, not a missing asset |
| 17E | Hanami's hero card, redrawn to canon — 1 image | **Delivered and in the game.** A card has no approval step |

The three keys outside 17A's 36 — `attack_air`, `run_a` and `run_b` — were not
drawn. They are standby fallbacks nothing reaches, so Hanami's set is answered;
they are noted in
[the history entry](asset-requests-history.md#round-17--hanami-to-canon-mahoraga-and-the-last-two-round-13-catches)
in case the set is ever redrawn whole again.

**17D is drawn against the new Hanami.** His block was rewritten for 17A and his
tile is the pale humanoid curse, not the tree — the hero card the tile has to
agree with is already in the game.

## 17D. A simplified card for every fighter — 27 images

> **Delivered.** All 27 tiles are in `assets/cards/simple/`, one per roster
> fighter. They are **not on screen**: `USE_SIMPLE_CARDS` in
> `src/config_menus.js` is `false`, so the roster grid still draws the hero
> cards. Flipping it to `true` is the whole of switching them on. The brief
> below is kept because it is what a re-draw of any single tile is measured
> against.

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

Round 15 takes the roster from 23 to 27, which is the point of asking now rather
than later. This request is the art that is drawn for that job from the start.

### What this is not

- **Not a replacement.** Every existing `assets/cards/<key>_card.jpg` stays
  exactly where it is and keeps being the hero card. Nothing is flagged, nothing
  is deleted, and `assets/reference/cards_previous/` is untouched.
- **Not wired up.** The game does not read the new directory and this section
  does not ask for the code that would. It is art banked ahead of a roster big
  enough to need it — the switch is a one-line change in `buildCharacterCard()`
  when that day comes, and it can be made per-surface (tiles simplified, hero
  card and in-match portrait still the painting).
- **Not a redesign.** Same character, same costume, same palette family as their
  hero card, so the two read as the same fighter seen at two distances.

### The brief

**A portrait icon, not a scene.** One fighter, chest-up, filling the frame, on a
plain background. Think a roster icon in a fighting game's character select, or
an app icon of a person: legible at a glance, legible at a glance *small*, and
distinguishable from twenty-six others at the same size.

| | |
|---|---|
| **Crop** | Head and shoulders to mid-chest. The head is large in the frame — roughly the top half of the image — and centred horizontally |
| **Background** | Flat or a single soft vertical gradient in the fighter's theme colour (the `theme` field in `src/characters.js`). No scenery, no buildings, no sky, no props behind the figure, no logo, no text |
| **Lighting** | Even and front-lit. Bright enough to need **no** `--card-lift` correction: the whole point is that all 27 come back at the same key and the brightness table can be deleted |
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
[17A](asset-requests-history.md#17a-a-full-hanami-set--36-sprites)**. His tile is the pale humanoid curse,
not the tree.

`[THEME COLOUR]` is the fighter's `theme` in `src/characters.js` — the colour the
game already uses for their HUD accent and hit flashes, so a tile painted on it
matches what happens when they land a hit.

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
| **Staged (round 15)** | Mechamaru | `mechamaru` | `#63c7b0` |
| | Yuki Tsukumo | `yuki` | `#ffb703` |
| | Dagon | `dagon` | `#2f8fd8` |
| | Kurourushi | `kurourushi` | `#8f3b4e` |

**The last four depend on round 15.** They have no delivered art at all, so
their tile is drawn from the same wiki render as their hero card in
[15D](asset-requests-history.md#15d-kurourushis-hero-card--1-image) — and it is worth drawing the two together,
since the questions are the same and the answer to one settles the other. If
15A's sprite sets have landed by then, prefer the delivered `idle_a` as every
other fighter's tile does.

Four themes are close enough to a neighbour's to be worth checking side by side
before delivering — Todo `#b66cff` against Mahito `#b56cff` are all but
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

# Round 18 — open

**Round 18 is the round to add to.** Everything before it has been delivered, so
anything caught from here lands here.

- **18A** — thirteen caught while placing the round-15 sets (13 sprites)
- **18B** — four caught while placing Kurourushi (4 sprites)
- **18C** — three that fell through the round renumbering (3 sprites)
- **18D** — two Uro alternates: the right pose in the wrong costume (2 sprites)
- **18E** — twenty backgrounds repainted for the 3D camera (20 images)
- **18F** — near-field cards for the 3D camera's garnish layer (14 images,
  optional)

**22 sprites and 34 images, none of it blocking** — every pose named here is in
the game today and playable, and every background named here already exists and
works. The sprites are redraws of art that does not do its job; 18E and 18F are
art the `?camera=3d` mode can use and the flat game cannot, so both are pure
upside and a partial delivery of either is useful on its own.

## 18A. Caught while placing the round-15 sets — 13 sprites

The three new fighters arrived with complete 36-pose sets drawn against
[pose-brief.md](pose-brief.md). These are what the placement passes found — a
pose reads differently at real size against a real stage than it does on a
review board — plus the brief's headline criterion, which all three missed.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Yuki Tsukumo | `yuki` | `attack_heavy_b` | Pose | The hook extends **9%** of standing height past her idle where the brief asks for a third — the shortest heavy on the roster. She is a boxer with no weapon, so the whole body has to be behind it: hips through, shoulder past the lead foot. **Her `ult_b` is standing in** meanwhile, so she has a heavy that reaches while this is redrawn. |
| Dagon | `dagon` | `attack_heavy_b` | Pose | Extends **16%**. The claws should finish out past the wings. |
| Mechamaru | `mechamaru` | `attack_heavy_b` | Pose | Extends **20%**. The forearm blade should be the furthest thing forward in the frame. |
| Mechamaru | `mechamaru` | `run_reach_a` | Quality | **Delivered as a contact sheet** — four small figures of the run cycle on one canvas rather than one pose. Nothing in it is separable at full resolution and none of the four clears the 600 px body minimum alone, so it was never imported: he runs on the other three cycle frames until this lands. |
| Dagon | `dagon` | `run_reach_a` | Pose | **Reaches with the arm instead of the leg.** The reach frame is the full stride — the leading heel is the thing out in front, arms only counterbalance it. |
| Dagon | `dagon` | `run_reach_b` | Pose | The same, on the other lead. |
| Yuki Tsukumo | `yuki` | `run_reach_a` | Pose | The same fault again — reaching with the arm. |
| Yuki Tsukumo | `yuki` | `run_reach_b` | Pose | The same, on the other lead. |
| Dagon | `dagon` | `crouch_b` | Pose | Drops **21%** of standing height where the brief asks for a quarter, and reads *taller* than `crouch_a` beside it. The pair is one held crouch a breath apart, not a descent. |
| Dagon | `dagon` | `attack_light_a` | Pose | Not a wind-up. `_a` is the coil before the strike — weight on the back foot, striking hand drawn back — and this reads as a second strike. |
| Mechamaru | `mechamaru` | `crouch_attack_b` | Pose | The forearm blade never reaches full extension. `_b` is the strike; the blade should be the furthest thing forward, out past the knee. |
| Dagon | `dagon` | `crouch_attack_b` | Pose | Flagged during the placement pass. |
| Yuki Tsukumo | `yuki` | `crouch_attack_b` | Pose | Flagged during the placement pass. |

The reach numbers are measured the way the engine measures reach: the forward
edge of the art past the centre of the body's core columns (`bodyRight` against
`coreLeft`/`coreRight`), as a fraction of the idle's own height. They are
comparable within a fighter regardless of placement, because every pose of a set
is drawn at one zoom.

**Three faults repeated across fighters, which is what a missing rule looks
like** rather than three bad drawings: the heavy that does not extend (all
three), the reach frame that reaches with the arm (two), and the `ledge_hang`
with the ledge drawn into it (two). All three are now stated in the pose brief,
so Kurourushi's set will not be asked for without them.

### Fixed in the repo instead of requested

Three of the faults found in this pass were **file** faults rather than drawing
faults, and were fixed here rather than sent back:

- **Dagon's `ult_a` had four arms.** The extra one lay over background for most
  of its length and its own ink line gave the cut a natural boundary at the
  shoulder, so it came out with nothing repainted.
- **`dagon/ledge_hang` and `mechamaru/ledge_hang` had the ledge drawn in.** The
  bar was a flat grey slab across the top of the plate with the hands gripping
  over it, so removing it leaves the hands closed on nothing — which is the
  pose as asked for. The stage supplies the edge.

Each frame was re-measured afterwards (`bodyTop`, the body and core spans, the
centre of mass) so reach and width read off the art that is actually there. The
untouched originals are in `assets/reference/round15/`. That is the whole
difference between an `improvement` flag and a `replacement` flag: these were
recoverable in the file, and Yuta's cut-off sword in 17C was not.


---

## 18B. Caught while placing Kurourushi — 4 sprites

Kurourushi's set was the last of the round-15 four to be placed, and it went
through with all 36 poses approved. Four of the delivered drawings were flagged
`quality` in the same pass, and this is the part that makes them non-blocking:
**each of the four poses is drawn today by another frame of his own set**,
chosen in the workbench rather than left broken. He plays complete. What is
missing is that four poses share art with four others, so a fight shows the same
silhouette in two places.

| Key | Pose | Kind | What is wrong | Standing in |
|---|---|---|---|---|
| `attack_heavy_b` | `sideHeavy` | Quality | **The blade is drawn back over the shoulder** — this is the wind-up, not the strike. `_b` is the contact frame, and nothing in it extends forward past the robe. | `attack_light_b` — the only frame in the set with the blade fully out |
| `attack_light_b` | `light` | Quality | Rejected in the same pass, and then promoted into the heavy slot above because it was the better of the two. The light now needs its own drawing. | the archived round-15 `attack_air_b` |
| `crouch_attack_b` | `crouchAttack` | Quality | A low sprawl with the blade along the ground, which is very close to what `dash` shows. `_b` is the strike out of the crouch — the blade forward and clear of the body. | the archived round-15 `dash` |
| `dash` | `dash` | Quality | Flagged during the placement pass. | the archived round-15 `dodge_roll` |

**The heavy fault is the fourth one this round.** Yuki, Dagon and Mechamaru all
delivered an `attack_heavy_b` that does not extend (18A), and Kurourushi's does
not extend either — his for a different reason, being a wind-up rather than a
short strike, but the frame on screen is the same problem: the heavy does not
read as the biggest thing the fighter does. The rule is in
[pose-brief.md](pose-brief.md); this is the evidence it needs to stay there.

### Repo work, not a request: `kurourushi/ledge_hang` — done

The ledge is drawn into the plate — a slab under the hands, the same fault
`dagon/ledge_hang` and `mechamaru/ledge_hang` had in round 15 and the reason the
rule went into the brief. It is flagged `wantsImprovement: "alpha"` with the
note "Remove the ledge", so the workbench shows it and
`tools/list_replacements.py` tracks it. As with the other two, the hands are
closed on the bar and cutting it leaves them closed on nothing, which is the
pose as asked for — **the stage supplies the edge.** No redelivery needed.

**This has now been done**, along with `hanami/ledge_hang`, which had been
flagged as a redraw rather than repo work and did not need to be: his was the
same flat slab with the hands over it. Four of the roster's ledge grips have now
been cut this way (Dagon, Mechamaru, Kurourushi, Hanami) and the rule is in the
pose brief, so a future set should not need it.

---

## 18C. Three that fell through the round renumbering — 3 sprites

Flagged in the workbench, but named in no request section — they were written
into rounds that were later split, renumbered or moved to history, and the flags
outlived the sections. An audit of the manifest against this file found them:
the workbench knew about all three the whole time, and nobody drawing from this
file could have.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Suguru Geto | `geto` | `attack_down` | Pose | "Should be straight down instead of down and right." `downHeavy` is a committed smash at the floor in front — the arc ends under him, not off to the side. Asked for once as 14C and again after the round-13 redraw was approved-and-reflagged. |
| Mei Mei | `meimei` | `special_down` | Pose | Flagged during a placement pass with no note. Her down special is the crow swarm gathering low; the drawing does not read as a technique starting. |
| Takako Uro | `uro` | `prone` | Character | **The costume is a full pale-blue bodysuit** — covered arms, covered legs — where every other pose in her set draws the canon cloud wrap over bare limbs. See the note below: this is the generator's doing rather than the brief's, and it may not be fixable by asking again. |

### `uro/prone` is worth understanding before re-requesting it

Her other **seven** poses are on-model: `idle_a`, `run_reach_a`, `crouch_a`,
`dodge_roll`, `hurt`, `attack_light_b` and `victory` all draw the pale-cyan
cloud vapour across chest and hips with bare arms and legs, exactly as her
character block asks. Only `prone` comes back dressed, and it comes back dressed
in something that is not in the block at all — a full-length bodysuit.

So this is **not** a prompt fault we can see: the block is explicit ("her only
covering a wrap of pale-cyan cloud vapour clinging across her chest and hips,
bare arms and legs"), the canonical reference shows it, and the pose line for
`prone` says nothing about clothing. What is different about `prone` is that it
is the one pose where the figure is **lying down, horizontal, full-length** —
and a generator handed a reclining, minimally-dressed figure tends to add
clothing on its own. `dodge_roll` is on the ground too and comes back correct,
which suggests it is the reclining read rather than the ground.

That makes it worth **one** re-request with the costume restated inside the pose
line rather than left to the block — and worth knowing it may come back dressed
again. If it does, the honest options are to keep the drawing (a knockdown is on
screen for well under a second) or to draw the pose from a different angle that
is less likely to trip it, e.g. seen more from the feet. It is a limitation of
the generator, not of the request.

---

## 18D. Uro, the right pose in the wrong costume — 2 sprites

**Asked for as alternates, not replacements.** Both poses are good and are
staying in the game; what is wrong is the costume, so the delivery lands *beside*
the current drawing and the better of the two is picked by eye in the workbench.
Nothing changes on screen until somebody chooses.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Takako Uro | `uro` | `attack_heavy_b` | **Alternate** | The cloud reads as one strapless dress — the chest band and the hip band have merged. Keep the pose exactly: braced wide, the cursed-energy cloud thrown forward off the lead hand. |
| Takako Uro | `uro` | `crouch_b` | **Alternate** | The cloud has become a one-piece dress from chest to thigh. Keep the pose exactly: down on one knee, weight on the trailing hand, head low. |

### The block was ambiguous, and that is the actual fault

Her block used to read *"a wrap of pale-cyan cloud vapour clinging across her
chest and hips"* — which describes **one** garment reaching from chest to hips
at least as naturally as it describes two bands. The canon is two: a band across
the chest, a band at the hips, and a **bare midriff between them**
(`assets/reference/canon/uro_idle.png`).

Read that way, the deliveries were not wrong so much as obedient. Both of these
drew the sentence, and `uro/prone` in [18C](#18c-three-that-fell-through-the-round-renumbering--3-sprites)
went further and put her in a full bodysuit. Her block now says two separate
bands, with the midriff bare, and that a single joined garment is wrong — so
these two are the first test of whether the wording was the whole problem. If
they come back right and `prone` still comes back dressed, the reclining pose is
its own separate limitation.

**Four of her poses were already correct under the old wording** — `idle_a`,
`run_reach_a`, `hurt`, `victory` — which is why this took a workbench pass to
notice rather than showing up on the review board.

---

## 18E. Twenty backgrounds, repainted for the 3D camera — 20 images

The `?camera=3d` mode (see [2.5d-camera-plan.md](2.5d-camera-plan.md)) puts the
stage painting on a plane in a real 3D scene. It works today with the existing
art, and this is not a bug report — the plates are fine. But the mode changes
what a backdrop has to *be*, in one measurable way and three compositional ones,
and repainting to that spec is the single largest visible win available to the
camera. §10 of the plan has the full measurement; the short version:

**The 3D camera only ever shows the middle of the picture.** The backdrop plane
deliberately over-fills the frustum (×1.5 height, ×1.35 width) so that no dolly,
yaw or roll can swing past its edge. The cost is that **only 49.4% of the
image's linear extent is on screen** — a 1600×900 plate puts about **790 source
pixels across 1280 CSS pixels, a 1.62× upscale (3.24× at DPR 2)**, where flat
mode shows the whole plate at a slight *down*scale. That softness is currently
the most visible art deficit in 3d mode.

### The one rule that is new

> **Paint at 3200×1800. The 3D camera crops to the centre 1600×900 — the size
> the current backgrounds already are — so that centre box has to be a finished
> picture on its own, and the outer ring is what flat mode adds around it.**

Both crops ship. Flat mode (the default) shows the whole 3200×1800 frame; 3d
mode shows the centre half. Neither is a "safe area" to be padded with filler —
they are two framings of one painting, and both are seen by players. The crop is
centred to within 2.4% of image height, so treating it as exactly centred is
correct.

### Three things the 3D scene changes about composition

- **Paint mid-ground and far ground only. No foreground.** Anything painted at
  the very front of frame lands on the same flat plane as the horizon, 14 world
  units back, and then contradicts the real near-field cards the camera draws
  *between* the lens and the fight (traffic, lanterns, leaves — §7c of the
  plan). Foreground is the garnish layer's job now; a plate that paints its own
  fights it. Overhanging branches, near pillars, near railings: leave them out.
- **Keep a calm value band across the middle.** The fight happens there, and in
  3d the platforms are extruded boxes with lit top faces sitting in front of it.
  The band from roughly 45% to 85% down the *centre box* should be the quietest
  part of the painting — low contrast, no hard edges, no bright speculars. Put
  the detail and the drama above and to the sides of it.
- **Avoid a strong one-point perspective aimed at the centre of frame.** A
  painted vanishing point is rigid; a real camera is not. In normal play this
  camera moves so little (±0.88° of yaw — the sim clamps it) that a baked VP is
  harmless, but the drama shots swing to ±4° and a dead-centre VP is where that
  reads worst. An off-centre or open composition is safer and crops better.

### What has not changed

Same filenames, same folder, same JPEG format, so **nineteen of the twenty need
no code change at all** — the loader reads `stage.bgFile` and picks them up
as-is. The exception is Shibuya Night, which is registered as `.webp`: deliver
it as `shibuya_night.jpg` and one string in `src/stages.js` changes with it, or
keep the `.webp` extension and nothing does.

Landscape, full-bleed, no characters, no text, no border, no UI. Keep the
mid-tones open: the renderer lays a 30% black wash and the stage's own colour
tint over the plate before anything else draws, so a plate that arrives already
dark and already saturated has nowhere to go.

```
assets/intake/backgrounds/<name>.jpg      3200×1800, JPEG, full-bleed
```

### Prompt formula

`[BOARD LINE]`, `[COMPOSITION SUFFIX]`, `[STYLE SUFFIX]`

**Composition suffix** — append to every board line:

> wide establishing shot, mid-ground and distance only with no foreground
> elements, empty stage floor across the lower middle of the frame, quiet
> low-contrast band through the middle third, detail and interest in the upper
> half and toward the edges, open mid-tones, no characters, no text

**Style suffix** — the same one the rest of the game uses:

> clean Japanese anime key-art style matching the Jujutsu Kaisen TV anime,
> painted background art, crisp rendering, cel shading with soft gradient
> accents, atmospheric depth, high detail, no text

### The twenty boards

Each line is the setting to paint. The **tint** column is the colour the engine
already washes over the plate — paint *toward* it rather than against it, or the
grade fights the art. The **gimmick** column is what the board does during a
match ([stage_fx.js](../src/stage_fx.js)); the painting should look like a place
where that could happen, and must leave room for it.

| # | File | Board | Tint | The setting to paint | Gimmick it has to host |
|---|---|---|---|---|---|
| 1 | `training_bridge.jpg` | Training Bridge | green | A long arched wooden bridge over a green ravine at a temple school, late afternoon, heavy summer canopy on both banks, tiled roofs beyond. The calmest board in the game and the one the camera is tuned on — it should read as *ordinary*. | Leaves fall constantly; the camera adds more near the lens |
| 2 | `quiet_hall.jpg` | Quiet Hall | warm amber | A long empty tatami hall, shoji screens down one side throwing hard warm rectangles across the floor, a heavy bronze bell hanging in the far dark. Stillness is the subject. | Every ~25 s the bell seals techniques for 4 s; camera pushes in |
| 3 | `flooded_gate.jpg` | Flooded Gate | cool blue | A great stone torii gate standing in knee-deep floodwater, submerged steps, rain-heavy sky, the waterline the dominant horizontal. **Currently 800×437 — the lowest-resolution plate in the game and the most urgent of the twenty.** | A surge wave sweeps the length of the floor |
| 4 | `shibuya_night.webp` | Shibuya Night | indigo | The Shibuya scramble at night from street level, neon towers stacked deep, wet asphalt throwing colour back up. The busiest board — but the busy has to sit *above* the fight band. **Deliver as JPEG at 3200×1800; currently 1200×675 webp.** | An 8 s "curtain" seals the arena and floods everyone's meter |
| 5 | `curse_maw.jpg` | Curse Maw | cyan | The inside of an enormous curse: a ribbed organic cavern, wet cyan bioluminescence in the recesses, a throat receding into dark. **Currently 1920×1640 at a 1.17 aspect — it is cropped hard before 3d crops it again; reframe to true 16:9.** | Fangs snap up at both outer thirds of the floor |
| 6 | `garden_steps.jpg` | Garden Steps | bright green | A terraced temple garden climbing left to right, moss, stone risers, a still pond below, blossom. The one board whose *layout* the 3D camera flatters most — the terracing should read in the painting too. | A flower blooms on a random platform and heals whoever reaches it |
| 7 | `lantern_corridor.jpg` | Lantern Corridor | warm orange | A covered wooden veranda running into the distance, paper lanterns strung the length of it, warm pools of light on dark boards, night garden past the posts. Keep the lanterns *mid-distance and beyond* — the camera hangs its own into the top of frame. | A lantern shakes loose, falls and burns a patch of floor |
| 8 | `sunken_crossing.jpg` | Sunken Crossing | pale blue | A flooded city crossing at dusk, a few centimetres of standing water turning the whole street into a mirror, drowned kerbs, signage doubled in the reflection. The slickness is a mechanic here, so sell the wet. | The floor is genuinely slippery; the camera glides and overshoots |
| 9 | `neon_split.jpg` | Neon Split | magenta | A narrow back alley between two neon-clad blocks, signage crowding in from both sides, a dark gap straight up the centre. Leave the centre line clear — something stands in it. | An energy wall strikes down the centre line and holds |
| 10 | `bone_sanctum.jpg` | Bone Sanctum | pale teal | A cathedral built from bone: ribbed vaults, vertebral columns, cold teal light from high openings, ossuary dark below. | Drop-through platforms rattle, phase out for 3 s, re-knit |
| 11 | `bridge_duel.jpg` | Bridge Duel | sea green | A high suspension span in sea mist, cables climbing out of frame, water far below, distant headland. Emptiness on all sides — the floor here moves, and the surroundings are what make that legible. | The whole main platform drifts side to side under the fight |
| 12 | `academy_hall.jpg` | Academy Hall | brown | A grand school hall — dark timber, a gallery, tall windows down one side, dust in the light. Institutional and a little too big. | On a bell, the platforms glide into a whole new arrangement |
| 13 | `mist_pier.jpg` | Mist Pier | pale ice | A wooden pier running out into flat water under heavy fog, pilings fading by depth, a sun disc barely through. Depth by *fade*, not by detail — this is the board where atmospheric perspective does all the work. | Fog rolls in for 6 s; the camera pushes in rather than out |
| 14 | `crosswalk_rush.jpg` | Crosswalk Rush | blue | A wide city intersection at blue hour, zebra bars running away, signals and streetlights, towers behind. Traffic is drawn by the game, not painted — leave the near lane **empty**. | Cars run the floor; the 3D camera adds more between lens and fight |
| 15 | `cursed_teeth.jpg` | Cursed Teeth | cyan-teal | A gullet: concentric rings of teeth receding into a throat, wet violet-cyan glow deep inside, something breathing. | Fangs drop from above; every 25 s the stage inhales |
| 16 | `river_gate.jpg` | River Gate | jade | A river shrine gate at dawn, mist off the water, reeds bending consistently one way, petals in the air. The wind is a mechanic — paint the world already leaning. | A crosswind alternates direction; the camera rolls with it |
| 17 | `school_wing.jpg` | School Wing | tan | A school corridor after hours — lockers, a run of windows, late sun down the length of it, nothing where there should be somebody. Quiet and slightly wrong. | A weak curse wanders out; pop it for meter |
| 18 | `empty_city.jpg` | Empty City | grey-blue | A derelict city block under an overcast sky, empty windows, weeds through the tarmac, no people and no traffic. Flat grey light. | Two rooftops crumble under weight and re-form |
| 19 | `billboard_roof.jpg` | Billboard Roof | hot pink | A rooftop above a neon city in a storm — plant housings, aerials, hoardings stepping back into rain haze, cloud lit from within. The camera adds its own hoardings behind the stage, so keep the skyline readable and not too crowded. | Lightning takes the top platform; the strongest shake in the game |
| 20 | `domain_core.jpg` | Domain Core | aqua | The inside of a Domain Expansion: a non-place. Geometry that does not resolve, aqua light with no source, fragments hanging at rest. Gravity is low here — nothing should look like it is sitting on anything. | Side platforms orbit slowly; everyone floats |

### Deliver in this order

Not one batch — the first three change what a player sees most.

1. **`flooded_gate`, `shibuya_night`, `curse_maw`** — the three that are below
   the current norm *before* the 3D crop is applied. Flooded Gate at 800×437 is
   soft even in flat mode.
2. **`crosswalk_rush`, `lantern_corridor`, `training_bridge`** — the three
   boards that already have near-field garnish, so they are where the depth
   the repaint supports is most visible.
3. The remaining fourteen, any order.

Flat mode is the default and is unaffected either way, so nothing here is
blocking and a partial delivery is genuinely useful.

---

## 18F. Near-field cards for the garnish layer — 14 images, optional

**Lower priority than 18E, and genuinely optional** — every one of these has a
procedural stand-in drawing in the game right now, so nothing is missing. But
this is where depth actually comes from, and it is worth saying why, because it
is the opposite of the intuitive answer.

Measured (§10 of [2.5d-camera-plan.md](2.5d-camera-plan.md)): splitting a
*backdrop* into parallax layers buys **2.3 px** of differential shift in normal
play, because this camera barely translates — the sim clamps it to ±0.88° of
yaw. A card at `z = +2`, between the lens and the fight, separates from the
backdrop by **14 px** at that same yaw and **64 px** in a drama shot. Proximity
to the lens is the whole term. So the depth budget is better spent here than on
layering the paintings, and 18E asks for *bigger* backgrounds rather than
*split* ones for exactly this reason.

These are the elements the camera already flies past the lens
([garnish.js](../src/camera3d/garnish.js)), currently drawn with canvas
primitives. Real art would replace the procedural texture and nothing else —
the motion, depth, spawning and per-board wiring already exist.

### Delivery — keyed plates, like sprites, not full-bleed like backgrounds

```
assets/intake/garnish/<name>.png
```

PNG, one subject per file, on a **flat magenta `#FF00FF` key screen** (grey
`#808080` for the warm ones — marked below), same rules as the sprite spec
above: perfectly flat unlit screen, no colour bounce onto edges, margin on all
four sides, nothing touching the canvas edge. **At least 1000 px on the long
edge.** These are seen close to the lens and get magnified.

Anything travelling sideways should be drawn **facing/pointing LEFT**, same as
the projectile rule — the renderer mirrors for the other direction.

| File | Board | What it is | Screen |
|---|---|---|---|
| `leaf_green.png` | Training Bridge | One broad summer leaf, seen flat-on, slight curl. Simple silhouette — it is 30 px on screen half the time. | magenta |
| `leaf_gold.png` | Training Bridge | The same leaf turning: yellow-gold, edge curling, one side catching light. | grey |
| `lantern_paper.png` | Lantern Corridor | A paper lantern hanging on its cord, lit from within but seen against brighter light — mostly silhouette with a warm rim. Cord running off the top of the frame. | grey |
| `lantern_iron.png` | Lantern Corridor | An iron temple lantern on a bracket, heavier, colder, unlit. Variety against the paper one. | magenta |
| `car_sedan.png` | Crosswalk Rush | A car in near-total silhouette, side-on, pointing **left**, headlights blown out, faint lit windows. It passes in front of the whole fight for well under a second — read at a glance, no detail. | magenta |
| `car_van.png` | Crosswalk Rush | A tall delivery van, same treatment, taller and blockier so two passes never look identical. | magenta |
| `car_bike.png` | Crosswalk Rush | A motorcycle and rider, low and fast, single headlight, hard lean. | magenta |
| `rubble_a.png` … `rubble_c.png` | Empty City | Three chunks of broken concrete and rebar, angular, unlit, no two alike. Small and dark — these tumble toward the lens. (3 files) | magenta |
| `hoarding_a.png` … `hoarding_c.png` | Billboard Roof | Three lit advertising hoardings on steel gantries, seen from below and slightly to one side, legs and bracing visible. Abstract light and colour, **no legible text or logos**. These sit *behind* the stage, so they are the one entry here that is far rather than near. (3 files) | magenta |
| `signal_gantry.png` | Crosswalk Rush | A traffic signal on its arm, dark against the sky, lamps lit. Hangs into the top of frame. | magenta |

Fourteen files. Any subset is useful — each one replaces its procedural
stand-in independently, and a board with no delivery keeps the drawing it has.
