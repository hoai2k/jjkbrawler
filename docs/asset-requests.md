# Asset Requests — open requests

**To DRAW from, use [image-requests.md](image-requests.md), not this file.**
That is the single image-request document for every render mode — this round is
reproduced in it whole, alongside the 3D track's, resolved against what is
actually on disk. This file stays where the sprite rounds are AUTHORED: edit a
round here and re-run `node tools/build_image_requests.mjs`.

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
numbered DI1, DI2… — so the tracks never collide. All of them are gathered into
[image-requests.md](image-requests.md), which is what to read to draw any of
them; these files are where each is written.)

**Current status: rounds 1–21 delivered. Rounds 22 and 23 are open.**
**Round 22 is nearly closed**: 22B–22D (the three 36-pose sets, 108 sprites),
then 22A and 22E–22H (the roster teeter, six technique effects, four dolls,
three hero cards, one domain backdrop — 41 assets) have all landed and are
[in the history](asset-requests-history.md#round-22a-and-22e22h--the-teeter-the-effects-the-summons-the-cards-and-the-backdrop-delivered).
What is left of it is **22I**, the ten frames its own review boards rejected —
six of them the same wind-up fault across Yaga's and Naoya's attack pairs.
Round 23 — round 24's four staged fighters — is untouched. Nothing in either
round is blocking: all seven fighters are staged, and Kashimo, Yaga and Naoya
now have their full set, effects, cards and (for Naoya) a domain backdrop, so
they are ready to be promoted whenever their owner says so.
Round 21's walk cycle landed complete — 54 sprites, two frames for each of the
twenty-seven — and is
[in the history](asset-requests-history.md#round-21--the-walk-cycle).

**Round 22 is the round to add to** — 19 was used for the intake of round 18 and
is not a request number. Anything found from here goes into 22.

**How the sprite count is derived.** A pose is outstanding if it carries a
workbench flag *or* is drawing a file that is not its own. The second half is
the one that goes missing: a pose rejected at approval is pointed at another
frame of the same set so the game keeps drawing something, and that raises no
flag for `tools/list_replacements.py` to report. Both halves are checked against
the manifest, not against this file — [18C](asset-requests-history.md#18c-three-that-fell-through-the-round-renumbering--3-sprites)
is what the first found and [18G](asset-requests-history.md#18g-seven-a-pose-is-drawing-somebody-elses-art--7-sprites)
is what the second did.

**The approval queue holds round 18's 25 sprites.** Rounds 14, 16 and 17 all
landed through the [approval step](../assets/intake/README.md#the-confirm-step) — a delivery is in
the repo before it is in the game, and each pose is a decision waiting in the
sprite workbench — and every one of those decisions has been made. What a
player sees is what was approved, Hanami's canon set included — round 18's own
decisions are the queue that is open now.

**Kurourushi is shipped.** His 36-pose set, his hero card, his simplified tile
and both his summons landed with round 15; the set was placed and approved pose
by pose, and his key now sits in the Curses group in `src/config_menus.js`, so
`STAGED_CHARACTER_KEYS` in `src/characters.js` is empty for the first time since
round 15. The roster is 27 fighters. What his placement pass found became
**18B**, now delivered.

The roster is complete and **every fighter now has one sprite per action** —
round 11 finished the conversion that round 5 started, so the 4×5 sprite sheet
is retired and no action anywhere plays a grid cell. Nothing outstanding blocks
play.

Read **[pose-brief.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/docs/pose-brief.md)** before drawing a fighter. It is the
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
| kashimo | "Hajime Kashimo from Jujutsu Kaisen, tall lean young man with shaggy mint-green hair sticking out in tufts and two horn-like coiled locks rising from the top of his head, sharp green eyes with a short zig-zag lightning marking under each eye, wearing a loose all-white high-collared padded robe with puffed sleeves gathered at the elbow, white bandage wraps on both forearms, loose white trousers wrapped in white bandages from knee to ankle, pale grey ankle boots, carrying a long red staff with gold caps and a gold ball finial" *(grey key)* |
| yaga | "Masamichi Yaga from Jujutsu Kaisen, tall broad heavily built middle-aged man with tan skin, dark brown hair in a short spiked crop with shaved sides, a chinstrap beard and moustache, small dark oval sunglasses always covering his eyes, wearing a plain black zip-up high-collared jacket, black trousers and black dress shoes" |
| naoya | "Naoya Zen'in from Jujutsu Kaisen, tall slim young man with short olive-blond hair with darker roots swept to one side, narrow brown eyes and a permanent smug smirk, small earrings on his left ear, wearing a white band-collar shirt under a dark teal kimono jacket, a pale grey pleated hakama tied at the waist, dark tabi socks and zōri sandals" |
| kirara | "Kirara Hoshi from Jujutsu Kaisen, a slender young person with long black hair past the shoulders, blunt-cut bangs with the right section dyed cyan and two flat face-framing strands, large purple eyes with yellow star-shaped pupils, two beauty marks by the mouth, a black studded choker, an off-shoulder cream ribbed crop top over magenta camisole straps with a bare midriff, a doubled red-brown belt with a gold star buckle, black flared trousers cropped above the ankle, magenta socks and black lace-up ankle boots, black painted nails" *(grey key)* |
| haruta | "Haruta Shigemo from Jujutsu Kaisen, a short lean young man with slicked blond hair pulled into a long side ponytail tied on the left, thin eyebrows, drooping purple eyes with a lilac teardrop marking under each eye, a faint smug pout, bare-chested under a black one-shoulder jumpsuit with loose trousers gathered at the calves, a pale lilac glove on his sword hand, brown loafers worn barefoot, carrying a single-edged sword whose hilt is a sculpted human hand" *(grey key)* |
| tengen | "Master Tengen from Jujutsu Kaisen, an inhuman robed figure with a tall smooth cylindrical hairless head, four narrow eyes stacked in two pairs down the face, a small stern mouth, pale grey-white skin, draped floor-length grey-white layered robes with a cowled folded neck and wide sleeves, long-fingered pale hands held open at the sides, bare feet with long toes" |
| miwa | "Kasumi Miwa from Jujutsu Kaisen, a young woman with long light-blue hair falling past her shoulders with blunt bangs, dark blue eyes and an earnest expression, wearing the dark navy Kyoto Jujutsu High uniform — a fitted suit-style jacket over a white collared shirt and navy tie, matching navy trousers, brown loafers — with a katana in a brown scabbard at her hip" |

*(The 17 above are the launch roster; the six below shipped in round 7. The
`uro`, `reggie` and `gakuganji` rows were rewritten from the anime reference in
round 9 — see **9E**; art made against their old wording is being replaced. The
four `mechamaru` / `yuki` / `dagon` / `kurourushi` rows are round 15 and were
written from the wiki's **(Anime)** renders, archived in
[`assets/reference/canon/`](../assets/reference/canon/). They were the only
blocks with no delivered art behind them; all four have shipped since, so they
now have a `<char>_idle.png` and are matched against it like everyone else.
The three `kashimo` / `yaga` / `naoya` rows are round 23's staged fighters and
the four `kirara` / `haruta` / `tengen` / `miwa` rows are round 24's, all
written the same way from the renders — the seven are today's only blocks with
no delivered art behind them; see rounds 22B–22H and 23A–23G below.)*


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
| Hajime Kashimo | `kashimo` | `assets/reference/canon/kashimo_idle.png` |
| Masamichi Yaga | `yaga` | `assets/reference/canon/yaga_idle.png` |
| Naoya Zen'in | `naoya` | `assets/reference/canon/naoya_idle.png` |

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

**Round 24's four staged fighters are the one case this rule cannot cover
today**: no `idle_a` exists for them yet, so their canon is the wiki's
**(Anime)** render, checked in beside everyone else's. Because their art will
mostly be generated outside this repo, the table below carries **absolute
URLs** as well as the repo paths — use either; they are the same image.

(**Round 23's three are out of this table**: Kashimo's, Yaga's and Naoya's
36-pose sets landed with 22B–22D, so `<char>_idle.png` exists for all three and
they are matched against their own idle like the rest of the roster — they are
in the table above. Their `<char>_anime.png` renders stay in the directory for
design questions.)

| Fighter | Key | Canonical image | Absolute URL |
|---|---|---|---|
| Kirara Hoshi | `kirara` | `assets/reference/canon/kirara_anime.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/kirara_anime.png> |
| Haruta Shigemo | `haruta` | `assets/reference/canon/haruta_anime.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/haruta_anime.png> |
| Master Tengen | `tengen` | `assets/reference/canon/tengen_anime.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/tengen_anime.png> |
| Kasumi Miwa | `miwa` | `assets/reference/canon/miwa_anime.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/miwa_anime.png> |

*(All four are round 24's staged fighters.)*

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

---

# Round 22 — open

## 22I. Ten frames the round-22 boards rejected — 10 sprites

The faults found reviewing round 22 — nine from the 22B–22D sprite sets and
one from the teeter. Everything else in those deliveries is in the game; these
ten are in it too, drawing what was delivered, and flagged in the workbench so
they are visible while they wait. Same character blocks, same key screens, same
delivery paths as the sets they belong to.

**Six of them are one fault**, and it is the reason the brief now measures the
wind-up: every `attack_*_a` in the round was drawn already mid-strike. The `_a`
rule restated at the head of round 23 applies to these redraws too, and both
halves of the pair have to pass the ruler.

| File | Fighter | What is wrong, and what to draw |
|---|---|---|
| `kashimo/special_side.png` | Kashimo | **Costume, not pose.** The action is right — the staff has already left his hand and the throwing arm is extended, which is exactly Nyoi Recall. But the costume drifts from his own `idle_a`: he is wearing **black boots and a navy waist sash**, and the **white knee-to-ankle bandage wraps are missing**. Redraw the same pose with the pale grey ankle boots, the leg wraps, and no sash — match `kashimo/idle_a.png`, which is now his canonical reference |
| `yaga/crouch_a.png` | Yaga | **A fighting stance, not a crouch.** Knees barely bent, head dropping about a tenth of standing height where the brief asks for a quarter. Draw an actual crouch: hips down, head low, weight settled — `naoya/crouch_a.png` from the same delivery is what it should read like |
| `yaga/crouch_b.png` | Yaga | Same fault, same fix. It is currently the wider half of one guard stance rather than the second beat of a crouch; it must also read as *lower than standing*, which it does not |
| `naoya/attack_light_a.png` | Naoya | **The wind-up is already the strike.** Drawn mid-blow, so the light attack has no coil and no tell. Redraw as the coil: striking hand drawn back beside the body, shoulders turned away from the target, weight on the back foot, lead arm up as a guard. It must reach **no further forward than `naoya/idle_a.png`** |
| `naoya/attack_heavy_a.png` | Naoya | Same fault. Redraw as the wind-up of one committed blow: fist drawn as far back as the body allows, hips loaded, front foot light — and inside the idle's reach |
| `naoya/attack_air_a.png` | Naoya | Same fault, airborne. Body coiled mid-jump, striking limb cocked, legs gathered — the extension belongs to `attack_air_b` |
| `yaga/attack_light_a.png` | Yaga | Same fault as Naoya's, same fix, against `yaga/idle_a.png` |
| `yaga/attack_heavy_a.png` | Yaga | Same fault. It is standing in on his `guard` frame in the workbench meanwhile, which is a stopgap and not a wind-up — the delivered plate needs redrawing as the coil |
| `yaga/attack_air_a.png` | Yaga | Same fault, airborne |
| `nanami/teeter.png` | Nanami | **Framing.** The pose is right — weight back, arms out, head down toward the drop — but his blunt blade runs off the LEFT edge of the plate and is cut flat by the canvas. The delivery spec's "nothing may touch the canvas edge" rule, and the "reach falls off the canvas" fault the brief has named since round 13. Redraw the same pose with margin on all four sides so the blade finishes inside the frame |

**A promoted fighter owes a teeter.** 22A drew the pose for the roster of 27;
the seven staged fighters were not in it, and until each is promoted their
teeter falls back to their idle frames with the procedural lean `src/motion.js`
supplies — which is what the whole roster did before 22A landed, so nothing is
broken. But promoting one without drawing it leaves that fighter the only one
on the select screen with no teeter drawing, so it belongs in the round that
promotes them: **`teeter` for `kashimo`, `yaga`, `naoya`, `kirara`, `haruta`,
`tengen` and `miwa`**, one sprite each, on the 22A brief.

**Kashimo's canonical reference is now his own idle**, not the wiki render —
36 poses landed, so the rule that governs every other fighter applies to him:

- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/kashimo/idle_a.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/naoya/idle_a.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/assets/yaga/idle_a.png>

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

**The `_a` of an attack pair is the WIND-UP, and it must not extend.** Restated
here rather than left to the link, because the link is what has not been
reaching: `attack_light_a`, `attack_heavy_a`, `attack_air_a` and
`crouch_attack_a` are the coil — striking hand or weapon drawn BACK, shoulders
turned away from the target, weight on the back foot. The `_b` is the blow. Both
halves are checkable with a ruler and both have to pass: `_a` reaches no further
forward than that fighter's own `idle_a`, and `_b` reaches further than `_a`.
Round 22B–22D came back with all nine wind-ups already mid-strike, on three
fighters at once, which is what this paragraph exists to stop.

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

## 23A. Kirara's sprite set — 36 sprites

The standard 36-pose semantic set ([pose-brief.md](https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/sprites/docs/pose-brief.md)
first, especially the reach rules).

**Canonical reference (absolute):**
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/kirara_anime.png>
(the wiki render: [Kirara Hoshi (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/2/21/Kirara_Hoshi_%28Anime%29.png/revision/latest?cb=20251230190130)).

**What they are holding:** nothing — Love Rendezvous is touch and posture, so
the attack poses are open-handed: raking scratches, a driven heel, a palm laid
flat where a star lands. The star-shaped pupils survive every expression,
`hurt` and `dizzy` included. `special_neutral` casts a small glowing star
sigil off an extended palm; `special_side` is an underhand lob, debris
wrapped in star-light; `special_down` is both arms flung up, five points of
light in a cross around them; `ult_a`/`ult_b` hold the completed constellation
— five stars orbiting, hair lifting, entirely smug.

Deliver to `assets/intake/kirara/<pose_key>.png`. Key: `kirara`, exactly —
the canon spelling, **not `kiara`**. **Key screen: mid-grey `#808080`** — the
camisole straps and socks are magenta, which a magenta screen eats.

## 23B. Haruta's sprite set — 36 sprites

The standard 36-pose set, same brief and rules as 23A.

**Canonical reference (absolute):**
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/haruta_anime.png>
(the wiki render: [Haruta Shigemo (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/f/fb/Haruta_Shigemo_%28Anime%29.png/revision/latest?cb=20230903193020)).

**What he is holding:** the **Hand Sword** — a single-edged blade whose hilt
is a sculpted human hand — in every attack pose, gripped wrong, swung without
a stance. The lilac teardrop marks under his eyes appear in every pose; his
posture is never brave: attacks lean back even as they land. `attack_light_*`
sloppy slashes, `attack_heavy_*` an overcommitted two-handed hack;
`special_neutral` is the release of an underarm throw, the sword crawling
mid-air on its hilt-fingers; `special_side` is a flinch turning into a lunge;
`special_down` is him flat on the ground, hands over his head (this is also
roughly his `prone`, drawn distinctly — the special is deliberate);
`ult_a`/`ult_b` are him wreathed in small lilac glints, eyes wide, luckier
than anyone deserves.

Deliver to `assets/intake/haruta/<pose_key>.png`. Key: `haruta`, exactly.
**Key screen: mid-grey `#808080`** — the eye markings and glove are lilac,
which sits too close to a magenta screen.

## 23C. Tengen's sprite set — 36 sprites

The standard 36-pose set, same brief and rules as 23A.

**Canonical reference (absolute):**
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/tengen_anime.png>
(the wiki render: [Tengen (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/1/16/Tengen_%28Anime%29.png/revision/latest?cb=20251119121513)).

**What they are holding:** nothing, ever — Tengen fights space, not people.
The robe reaches the floor, so like Kurourushi the legs show only in motion
poses (`run_*`, `dash`, `dodge_roll`: bare long-toed feet beneath a lifted
hem). All four eyes track in every pose; the face barely moves — serenity is
the costume. Attacks are open palms trailing flat translucent planes of
barrier; `special_neutral` is both palms shoved forward behind a wall of
force; `special_side` sets a standing pane of light with one hand;
`special_down` is the figure mid-vanish, sliced vertically by a corridor
edge; `ult_a`/`ult_b` raise both arms as barrier walls climb around them.

Deliver to `assets/intake/tengen/<pose_key>.png`. Key: `tengen`, exactly.

## 23D. Miwa's sprite set — 36 sprites

The standard 36-pose set, same brief and rules as 23A.

**Canonical reference (absolute):**
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/miwa_anime.png>
(the wiki render: [Kasumi Miwa (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/6/64/Kasumi_Miwa_%28Anime%29.png/revision/latest?cb=20240621021537)).
Draw her **long-haired, pre-Shibuya era**, matching the render.

**What she is holding:** a standard katana in a brown scabbard — and the
scabbard matters more than for anyone else on the roster: her whole kit is
the draw, so **sheathed poses outnumber drawn ones**. `idle_a`/`idle_b`,
`guard` and `special_side` keep the sword sheathed, hand resting on the hilt;
`attack_light_*` and `attack_heavy_*` are draw-cuts, the scabbard still
moving; `special_neutral` is the batto lunge at full extension, blade a
horizontal line; `special_down` is the Simple Domain stance — feet planted,
knees bent, a thin circle inscribed at her feet; `ult_a`/`ult_b` are the vow:
a long low crouch with the hilt gripped white, then the single enormous cut.

Deliver to `assets/intake/miwa/<pose_key>.png`. Key: `miwa`, exactly.

## 23E. Round 24 technique effects — 7 sprites

Effect plates for the staged kits, spec per [Delivery spec](#delivery-spec),
pointing **LEFT** where directional. The loader already knows every path
(`STAGED_EFFECT_KEYS`, `src/assets.js`); the moves draw procedural stand-ins
until these land.

| File | Fighter | What to draw |
|---|---|---|
| `star_bolt.png` | Kirara | A small five-pointed star sigil in violet `#d9a8ff` with a gold core, trailing thin chart-lines like a constellation diagram |
| `star_debris.png` | Kirara | A chunk of urban debris (pipe, brick, signage) wrapped in violet star-light, a small gold star burning on its face |
| `aura_star.png` | Kirara | An install aura plate: five stars in the Southern Cross arrangement orbiting a body-height envelope, faint chart-lines linking them |
| `aura_lilac.png` | Haruta | An install aura plate: a loose swirl of small lilac glints and clock-hands, dense at 11 and 1 o'clock |
| `hand_sword.png` | Haruta | The Hand Sword in flight, horizontal: a single-edged blade, the sculpted-hand hilt gripping air with splayed fingers |
| `star_tomb.png` | Tengen | A rising barrier hall: translucent parchment-grey wall panes with star motifs, stacked and overlapping like a shrine interior |
| `batto_flash.png` | Miwa | One iai cut as light: a single long horizontal crescent of pale blue-white, hilt-end dense, tip feathering out |

Deliver to `assets/intake/effects/<name>.png`.

## 23F. Tengen's pure barrier — 1 sprite

A summon plate, format per round 8: one body per file, full height, facing
**RIGHT** (trivially — it is a pane).

| File | Fighter | What to draw |
|---|---|---|
| `pure_barrier.png` | Tengen | A standing rectangular pane of pure barrier: translucent parchment-white, faint star-chart etching, edges hard as cut glass — a wall with no interior conditions, wanting nothing |

Deliver to `assets/intake/summons/pure_barrier.png` — **never** straight into
`assets/sprites/summons/`.

## 23G. Hero cards for the staged four — 4 images

Same spec as round 9A: **JPEG, portrait, full-bleed background**, no text.
Match the delivered set in `assets/cards/` for crop and energy.

| File | Suggested backdrop |
|---|---|
| `assets/intake/cards/kirara_card.jpg` | The fight-club door at night, neon spill, five stars burning in the dark around them, arms folded — nobody gets in |
| `assets/intake/cards/haruta_card.jpg` | A Shibuya alley mid-ambush: him grinning over one shoulder, the Hand Sword crawling along a wall behind him |
| `assets/intake/cards/tengen_card.jpg` | The Tomb of the Star Corridor: floating shrine architecture receding forever, Tengen small and central, all four eyes lit |
| `assets/intake/cards/miwa_card.jpg` | A Kyoto training yard at dawn, mid-draw, the blade a line of light — earnest, not epic |

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

## Also outstanding, but work here rather than art

Four things, and none of them is a drawing anybody owes us:

- **25 poses are waiting in the approval queue.** Round 18's sprites are in the
  repo but not in the game: each is a decision in the sprite workbench, and
  until it is made the pose keeps drawing what it drew before. This is the
  [approval step](../assets/intake/README.md#the-confirm-step) working as
  intended, not a backlog. `mechamaru/run_reach_a` is the one exception — it
  filled an empty pose rather than replacing a drawn one, so it went straight
  in and completed his run cycle.
- **The two alpha fixes** above — `hakari/dodge_air` and `toji/dodge_air` — are
  repo work on delivered files, not art anybody owes us.
- **Six variant options point at art that was retired.** `hanami_alt/` was
  folded away when the alternate-art-set machinery went ([8843a0f]) and its
  drawings moved to `assets/reference/hanami_alt/`, but six options in
  `manifest["variants"]["hanami"]` still name the old path — a chevron offering
  a file that is not there. It is also what `tools/canonicalise_sprites.py`
  refuses on, so the step that puts canonical names back on approved art cannot
  run until those six entries are dropped or repointed. Round 20's own sprites
  did not need it — a new pose key lands at its canonical name — but round 18's
  approvals do.
- **Rejections from the approval pass** will become round 20. A pose rejected
  at approval is pointed at another frame so the game keeps drawing something,
  which raises no flag; [18G](asset-requests-history.md#18g-seven-a-pose-is-drawing-somebody-elses-art--7-sprites)
  is what that costs when nobody checks, and the manifest audit that found it is
  how the count at the top of this file is now derived.

---

---
