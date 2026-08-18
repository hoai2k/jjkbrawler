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

**Current status: rounds 1–21 delivered. Round 22 is open** — one pose key for
every fighter, 27 sprites, below. Nothing is blocked by it.
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

Read **[pose-brief.md](../sprites/docs/pose-brief.md)** before drawing a fighter. It is the
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

*(The 17 above are the launch roster; the six below shipped in round 7. The
`uro`, `reggie` and `gakuganji` rows were rewritten from the anime reference in
round 9 — see **9E**; art made against their old wording is being replaced. The
four `mechamaru` / `yuki` / `dagon` / `kurourushi` rows are round 15 and were
written from the wiki's **(Anime)** renders, archived in
[`assets/reference/canon/`](../assets/reference/canon/). They were the only
blocks with no delivered art behind them; all four have shipped since, so they
now have a `<char>_idle.png` and are matched against it like everyone else.
The three `kashimo` / `yaga` / `naoya` rows are round 23's staged fighters,
written the same way from the renders — they are today's only blocks with no
delivered art behind them; see round 22B–22H below.)*


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

**Round 23's staged three (Kashimo, Yaga, Naoya) are the same case today** — no
`idle_a` exists yet, so their canon is the wiki's **(Anime)** render, checked
in beside everyone else's. Because their art will mostly be generated outside
this repo, the table below carries **absolute URLs** as well as the repo paths
— use either; they are the same image:

| Fighter | Key | Canonical image | Absolute URL |
|---|---|---|---|
| Hajime Kashimo | `kashimo` | `assets/reference/canon/kashimo_anime.png` | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/kashimo_anime.png> |
| Masamichi Yaga | `yaga` | `assets/reference/canon/yaga_anime.png` (plus `yaga_powers_anime.jpg` for his cursed corpses) | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yaga_anime.png> |
| Naoya Zen'in | `naoya` | `assets/reference/canon/naoya_anime.png` (plus `naoya_design_anime.jpg` and `naoya_fullbody.jpg` for poses) | <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/naoya_anime.png> |

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

## 22A. Balanced on the lip: the teeter — 27 sprites

**One new pose key, `teeter`, for every fighter.** Nothing is blocked by it:
until it lands the state draws the fighter's own IDLE frames with a procedural
lean supplied by `src/motion.js`, so the read exists today and the drawing
upgrades it.

**What it is for.** The ledge brake (`brakeAtLedge` in `src/fighter.js`) stops
a fighter dead on the last pixel of a platform whenever momentum would have
carried them off — that is its entire job, and it happens constantly. Nothing
drew it, so the most common thing that happens at an edge looked exactly like
standing in the middle of the stage. It is also the answer to when a fighter
should NOT be hanging: someone who stopped at the edge has not left it, and a
ledge hang would be telling the player they fell when they did not.

**The brief.** A standing pose, weight shifted BACK from the drop, arms out for
balance, front foot at or just over the lip, head turned down toward the fall.
Not alarmed — this roster does not panic — but caught: the moment after
realising the ground ran out. It reads at a glance against the idle beside it,
which is the test: a player should be able to tell from the silhouette that
they are on the edge.

**Facing.** Drawn facing RIGHT like every other pose, with the drop on the
right. The engine mirrors it for the left-hand lip and leans it the correct way
either side (`teeterLean` in `src/config_tuning.js`), so one drawing serves
both edges.

| pose key | count |
|---|---|
| `teeter` | 27 (one per fighter) |

**Not requested, deliberately: a ledge-climb pose.** Getting on and off a ledge
is now an animated transition rather than a teleport (`beginLedgeMove` in
`src/fighter.js`), and it is built from poses the roster already has — the fall
carries onto the ledge, the climb rises on `jump_rise` and arrives on `land`,
the roll uses `dodge_roll`. A bespoke `ledge_climb` would be an upgrade to
that, not a dependency, and 27 more sprites is not worth spending before the
reused ones have been seen in motion.

---

**22B–22H are round 23's three staged fighters** — Hajime Kashimo, Masamichi
Yaga and Naoya Zen'in. Their kits are complete and live in `src/characters.js`
(`STAGED_CHARACTER_KEYS` holds them off the select screen), so nothing blocks on
this art: it lands, gets placed in the sprite workbench — which already lists
all three as *(not on the roster yet)* — and the keys move into
`CHARACTER_GROUPS`. Design rationale is the round-23 section of
[characters.md](characters.md).

Because this batch is expected to be generated **outside this repo**, every
reference below is given as an **absolute URL**. The character blocks to use
verbatim are the `kashimo`, `yaga` and `naoya` rows of the table above.

**Work idle-first — the `idle_a` is its own delivery.** The standing rule
("draw each one's `idle_a` first and place it before drawing anything else")
becomes the delivery order for this batch:

1. **Generate `idle_a` alone** for each fighter, from the character block plus
   the anime render — a clean interpretation in the game's style, and a
   *plain, square-on standing stance* per
   [pose-brief.md](../sprites/docs/pose-brief.md) (hurtbox width is measured
   off it).
2. **Intake and approve it** (`tools/intake.py` → the sprite workbench, which
   already lists all three as *(not on the roster yet)*), then run
   `tools/build_canon_reference.py` so it lands as
   `assets/reference/canon/<key>_idle.png`.
3. **Generate the other 35 poses against that approved idle** — it becomes the
   reference image for the rest of the set, so costume, proportions, palette,
   line weight and shading stay locked across all 36 instead of drifting
   render-to-render. Once step 2 has landed on `main`, the idles resolve at:
   - <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/kashimo_idle.png>
   - <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yaga_idle.png>
   - <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/naoya_idle.png>

Round 7's hardest lesson was that a new character has no frame to inherit
placement from; this order gives the other 35 poses a frame to inherit
*design* from as well.

## 22B. Kashimo's sprite set — 36 sprites

The standard 36-pose semantic set (`SEMANTIC_ANIMS`, `src/characters.js` — the
pose list and every rule is [pose-brief.md](../sprites/docs/pose-brief.md); read
it first, especially the reach rules for `attack_light_b` / `attack_heavy_b`).

**Canonical reference (absolute):**
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/kashimo_anime.png>
(the wiki render: [Hajime Kashimo (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/0/02/Hajime_Kashimo_%28Anime%29.png/revision/latest?cb=20260205162107)).

**What he is holding:** the **Nyoi staff** — long, red-shafted, gold caps and a
gold ball finial — in every attack pose. He is a four-hundred-year-old master
enjoying himself: relaxed shoulders, easy smile, never strained.
`attack_light_*` and `attack_heavy_*` are staff strikes with visible reach;
`special_neutral` levels the staff like a lightning rod, arcs crawling off the
tip; `special_side` is the release of a full-body throw, empty hand still
extended; `special_down` is a braced two-handed stance inside a woven
basket-weave sphere of thin lines (Hollow Wicker Basket); `ult_a`/`ult_b` are
Mythical Beast Amber — hair lifting, eyes alight, forked electricity wrapping
both arms and the staff abandoned mid-air beside him.

Deliver to `assets/intake/kashimo/<pose_key>.png`. Key: `kashimo`, exactly —
not `hajime`. **Key screen: mid-grey `#808080`** — the staff is red, which a
magenta screen eats.

## 22C. Yaga's sprite set — 36 sprites

The standard 36-pose set, same brief and rules as 22B.

**Canonical reference (absolute):**
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yaga_anime.png>
(the wiki render: [Masamichi Yaga (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/5/51/Masamichi_Yaga_%28Anime%29.png/revision/latest?cb=20201025153339)).
For his cursed energy (green) and the dolls around him:
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yaga_powers_anime.jpg>.

**What he is holding:** nothing — the principal fights **bare-fisted**, with
cursed-energy-reinforced hands (green when energy shows). Sunglasses on in
every pose, `hurt` and `dizzy` included; the face barely changes, the body does
the talking. `attack_light_*` a straight jab, `attack_heavy_*` a full
shoulders-through cross; `special_neutral` a beckoning gesture with a small
plush bear mid-leap beside him (Tsukamoto); `special_side` setting a squat
wind-up doll on the ground; `special_down` one hand raised, three small motes
of green light orbiting it (the three souls); `ult_a`/`ult_b` arms spread wide
with small doll silhouettes rising around him.

Deliver to `assets/intake/yaga/<pose_key>.png`. Key: `yaga`, exactly.

## 22D. Naoya's sprite set — 36 sprites

The standard 36-pose set, same brief and rules as 22B.

**Canonical reference (absolute):**
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/naoya_anime.png>
(the wiki render: [Naoya Zenin (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/2/27/Naoya_Zenin_%28Anime%29.png/revision/latest?cb=20251230174702)).
Supplementary pose/turnaround references:
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/naoya_design_anime.jpg>
(from <https://x.com/Go_Jover/status/1981293295029633294>, image
<https://pbs.twimg.com/media/G373wAUWwAAMcEN.jpg>) and
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/naoya_fullbody.jpg>.

**What he is holding:** nothing — Hei-unit taijutsu, all low stances and open
palms, and the **smirk in every single pose** including `hurt`; smugness is the
costume. His speed is drawn by the engine as crisp stepped afterimages of these
very sprites, so clean silhouettes matter more than for anyone else on the
roster. `attack_light_*` a knife-hand, `attack_heavy_*` a driving heel;
`special_neutral` a low sprinter's break, body already past vertical (the frame
rush); `special_side` a single extended palm, almost gentle (the 24 FPS Rule);
`special_down` arms folded, head tilted, utterly unimpressed (Pre-Read —
the counter is the disrespect); `ult_a`/`ult_b` are his **cursed-spirit form
breaking out of him**: a pale segmented worm-like mass erupting around his
silhouette, star-shaped six-holed mask where the face should be.

Deliver to `assets/intake/naoya/<pose_key>.png`. Key: `naoya`, exactly.

## 22E. Round 23 technique effects — 6 sprites

Effect plates for the staged kits, spec per
[Delivery spec](#delivery-spec) and pointing **LEFT** where directional
(see [Directional effects point LEFT](#directional-effects-point-left)). The
loader already knows every path (`STAGED_EFFECT_KEYS`, `src/assets.js`) and the
moves draw procedural stand-ins until these land.

| File | Fighter | What to draw |
|---|---|---|
| `lightning_bolt.png` | Kashimo | A horizontal cursed-lightning bolt: a hard white core, mint-cyan `#6ef7d0` forks, drawn as one jagged discharge |
| `nyoi_staff.png` | Kashimo | His red-and-gold staff horizontal in flight, spinning slightly, arcs of `#6ef7d0` trailing off both ends |
| `amber_aura.png` | Kashimo | An install aura plate: a body-height envelope of forked amber-and-cyan electricity, densest at the shoulders |
| `windup_doll.png` | Yaga | A squat cursed-corpse doll, stitched fabric over a carved body, one key turning in its back, green cursed energy leaking at the seams |
| `doll_needle.png` | Yaga | A long sewing needle trailing green thread-light, drawn horizontal |
| `naoya_spirit.png` | Naoya | His vengeful cursed-spirit form: a pale segmented worm/centipede body compressed into a horizontal ram, star-shaped six-holed mask at the head, air intakes flared |

Deliver to `assets/intake/effects/<name>.png`.

## 22F. Yaga's doll family summons — 4 sprites

Persistent creatures that walk the stage on their own, format per round 8: one
creature per file, full body, facing **RIGHT**. Design authority for all four:
<https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/yaga_powers_anime.jpg>
— and remember the fanbook note: he likes cute things and will not admit it.
The dolls should be **genuinely adorable and visibly cursed**, both at once.

| File | Fighter | What to draw |
|---|---|---|
| `tsukamoto.png` | Yaga | The boxing bear: a round plush brown bear, waist-high, oversized red boxing gloves stitched onto both paws, one button eye loose, green cursed energy at the seams |
| `takeru.png` | Yaga | The dog puppet: a small patchwork dog, visibly hand-sewn, mid-run with ears back, stitched grin of felt teeth |
| `cathy.png` | Yaga | The training doll: a limbless torso-and-head practice dummy hovering upright, painted target rings on the chest, needles orbiting it |
| `comfort_doll.png` | Yaga | A comfort doll: small, soft, arms permanently open for a hug, slightly too many stitches across the chest — the hug is the detonation |

Deliver to `assets/intake/summons/<name>.png` — **never** straight into
`assets/sprites/summons/` (they must pass `tools/intake.py`).

## 22G. Hero cards for the staged three — 3 images

Same spec as round 9A: **JPEG, portrait, full-bleed background** — a card, not
a keyed sprite. Character three-quarter or facing, dramatic lighting, a
background that reads at tile size, no text of any kind. Match the delivered
set in `assets/cards/` for crop and energy.

| File | Suggested backdrop |
|---|---|
| `assets/intake/cards/kashimo_card.jpg` | Night storm over the Sakurajima colony, the staff planted, forked lightning frozen mid-strike behind him |
| `assets/intake/cards/yaga_card.jpg` | His workshop at Jujutsu High: shelves of dolls in half-light behind him, green cursed energy in his raised fist |
| `assets/intake/cards/naoya_card.jpg` | A Zen'in estate corridor at dusk, his frame-strip afterimages hanging in the air behind the smirk |

## 22H. Naoya's domain background — 1 image

`time_cell_moon_palace.jpg` — the backdrop for **Time Cell Moon Palace**, same
spec as the round 9C domain backgrounds.

```
assets/intake/backgrounds/time_cell_moon_palace.jpg
```

Landscape, full-bleed, no characters, no text. A vast pale lunar palace
interior: moonlit stone, tall cell-like chambers repeating into the distance
with the regularity of film frames, a huge full moon dominating the sky through
the open roof, everything faintly banded in vertical divisions — the renderer
draws its own filmstrip sprockets and frame lines over the plate, so keep the
mid-tones open and the banding subtle.

# Round 20 — delivered

**All four requests are in.** The last of them was Yuji's own four poses, which
landed as [20E](#20e-yujis-four-round-20-poses--4-sprites) and are in the game:
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
- **~~Yuji's four~~** — [20E](#20e-yujis-four-round-20-poses--4-sprites),
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

## 20E. Yuji's four Round 20 poses — 4 sprites

**Delivered.** All four landed, keyed and measured through `tools/intake.py`,
imported with `tools/intake_import.py`, anchored, and given a seeded pose read
apiece — those four are marked `seed`, not `source`, so the joint-reads bench
knows they are a starting point rather than a read of the art.

**The remainder of 20C and 20D, and the whole of it is one fighter.** Both
rounds asked for one file per fighter, both arrived as twenty-seven files, and
both of those twenty-seven were Mahoraga rather than Yuji. Mahoraga is animated
out of a character sprite set and has an intake directory like everyone else,
but he is a summon and is not on `CHARACTER_KEYS`; his four are landed and
welcome, and they are not a fighter's. So the count was right twice and the
roster was wrong twice, which is now a row in
[pose-brief.md § 5](../sprites/docs/pose-brief.md#5-the-faults-that-keep-coming-back)
and a `ROSTER COVERAGE` line that `tools/intake.py` prints on every delivery.

**Nothing is blocked.** Yuji draws exactly what the whole roster drew before
round 20: `grabReach` falls back to his first light-attack frame, `grabHold` to
`charge`, `grabbed` to `hurt`, and both dash attacks to his standing strike
(`src/characters.js`). He is the one fighter whose grab still reads as a frozen
jab, which is precisely the thing 20C was written to end.

| File | Pose line |
|---|---|
| `assets/intake/yuji/grab_reach.png` | "a committed forward lunge with one open, grasping hand leading — reaching to seize, not to strike — the other arm up as a guard" |
| `assets/intake/yuji/grab_hold.png` | "gripping an unseen opponent at arm's length by the collar: front hand closed in a fist at chest height, weight planted, body coiled to heave" |
| `assets/intake/yuji/grabbed.png` | "seized and struggling: body arched back from the collar, feet scrabbling, both hands prying at an unseen grip at their own chest" |
| `assets/intake/yuji/attack_dash.png` | "sprinting forward and striking at the same moment, body low and driving, weight thrown ahead of the leading foot, back leg extended behind, striking arm fully extended forward along the direction of the run, trailing arm swept back, at the instant of impact" |

The two grab poses have to answer the same grip-point rule the other twenty-six
already do — **fist and prying hands both at chest height on the leading edge of
the body** — because the game draws Yuji's `grab_hold` against somebody else's
`grabbed` at a fixed gap, so his is not judged on its own. Open any delivered
pair (`sprites/assets/gojo/grab_hold.png` beside
`sprites/assets/nobara/grabbed.png`) and match the height.

Otherwise the standard spec: grey key screen (Yuji is on the warm-palette list),
facing right, one zoom matched to his own `idle_a`, at least 600 px of body, one
subject per file. His character block and canonical reference are above, and
[pose-brief.md](../sprites/docs/pose-brief.md) has all four pose lines in the
set they now belong to.

---
