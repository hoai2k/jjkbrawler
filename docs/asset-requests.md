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

**Current status: rounds 1–18 delivered. Round 20 is open — 44 summon plates
([20A](#20a-summon-plates-that-are-contact-sheets--44-sprites)), 20 stage
backgrounds ([20B](#20b-twenty-backgrounds-re-extended-from-the-paintings-they-replaced--20-images))
and the 81 grab poses for `?throw=true`
([20C](#20c-the-grab-poses--81-sprites)).**

**Round 20 is the next one to open** — 19 was used for the intake of round 18
and is not a request number. Anything found from here goes into 20.

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

# Round 20 — open

**Three requests. The first two are not drawings that were never made.**

- **44 of the 114 summon plates hold six creatures instead of one** — a delivery
  fault rather than art anybody owes us. See
  [20A](#20a-summon-plates-that-are-contact-sheets--44-sprites) below.
- **Twenty backgrounds, re-extended from the paintings 18E replaced** —
  [20B](#20b-twenty-backgrounds-re-extended-from-the-paintings-they-replaced--20-images).
- **The grab poses — three new poses across the whole roster** for the
  experimental grab/throw mechanic (`?throw=true`) —
  [20C](#20c-the-grab-poses--81-sprites). The mechanic plays today on reused
  poses; this is the art that makes it read.
  18E's resolution win is real and is kept; what it also did, unasked, was
  re-invent twenty scenes, and against the 3D camera's centre crop the new
  boards read sparser and darker than the ones players knew. The fix is to
  extend the old paintings outward by 30% a side rather than to repaint them.
  The flat camera already has its half of this: it draws the previous paintings
  again, from `assets/backgrounds/flat/`.

Round 18 is closed and everything in it landed.

**Round 18 was delivered complete** — 28 sprites and 14 near-field cards, every
section of it, plus the five render3d image inputs (DI1–DI4). Its record, and
the reasoning behind each request in it, is now in
[the history](asset-requests-history.md#round-18--delivered).

**Round 20 is the open round.** (19 is skipped as a request number: it was used
for the *intake* of round 18, so `assets/reference/round19/` holds the delivered
plates and no request ever carried that number. Reusing it would make "round 19"
mean two different things.) Anything found from here — a placement pass, an
approval rejection, a manifest audit — lands in 20 beside 20A.

## Also outstanding, but work here rather than art

Three things, and none of them is a drawing anybody owes us:

- **25 poses are waiting in the approval queue.** Round 18's sprites are in the
  repo but not in the game: each is a decision in the sprite workbench, and
  until it is made the pose keeps drawing what it drew before. This is the
  [approval step](../assets/intake/README.md#the-confirm-step) working as
  intended, not a backlog. `mechamaru/run_reach_a` is the one exception — it
  filled an empty pose rather than replacing a drawn one, so it went straight
  in and completed his run cycle.
- **The two alpha fixes** above — `hakari/dodge_air` and `toji/dodge_air` — are
  repo work on delivered files, not art anybody owes us.
- **Rejections from the approval pass** will become round 20. A pose rejected
  at approval is pointed at another frame so the game keeps drawing something,
  which raises no flag; [18G](asset-requests-history.md#18g-seven-a-pose-is-drawing-somebody-elses-art--7-sprites)
  is what that costs when nobody checks, and the manifest audit that found it is
  how the count at the top of this file is now derived.

---

---

## 20A. Summon plates that are contact sheets — 44 sprites

**Forty-four of the hundred and fourteen summon plates hold six creatures
instead of one**, and the game draws the whole file as one summon. A six-across
strip of dogs is painted at the dog's height, so what walks the stage is six
dogs in a row at a sixth of the size each — and it changes mid-animation,
because one pose of a creature is a sheet and the next is not.

It shipped because a sheet is invisible at review size: a strip of six dogs in a
thumbnail looks like a dog. It is the same fault as `mechamaru/run_reach_a` in
round 15, which was caught only because the importer refused it, and summon art
has no importer to refuse it — it is a file drop.

So it is a tool now rather than an eye. **`python3 tools/check_summon_plates.py`**
counts the separate figures in each plate's alpha and fails on three or more of
comparable size; detached art (a floating wheel, a thrown chain) reads as one
big blob and some small ones and passes. Run it on any summon delivery before
importing. This table is its output.

| Creature | Sheets | Poses |
|---|---|---|
| `divine_dog_white` | 2 | `move_a`, `hurt` |
| `great_serpent` | 4 | `idle_a`, `idle_b`, `move_a`, `move_b` |
| `inventory_curse` | 4 | `idle_b`, `move_a`, `attack`, `hurt` |
| `max_elephant` | 4 | `idle_a`, `move_a`, `move_b`, `hurt` |
| `rabbit_escape` | 5 | `idle_a`, `idle_b`, `move_a`, `move_b`, `hurt` |
| `rainbow_dragon` | 3 | `move_b`, `attack`, `hurt` |
| `toad` | 4 | `idle_a`, `move_a`, `move_b`, `hurt` |
| `transfigured_crawler` | 6 | all six |
| `transfigured_hulk` | 6 | all six |
| `transfigured_human` | 6 | all six |

**What to deliver: the same pose, as one figure.** Not a redesign, not a new
pose — every one of these sheets contains the right drawing several times over,
so the brief is the pose line it was drawn against
([round 16 in the history](asset-requests-history.md#round-16--the-summons-animate-delivered)),
with **one creature on the canvas**. Where a sheet has an obviously best figure
in it, that figure at full resolution is a complete answer.

Same rules as the round-16 summon art: one subject per file, flat key screen, at
least 600 px of creature, one zoom across all six poses of a creature, delivered
to `assets/intake/summons/<file>_<pose>.png`.

### It is also what is holding up seven hit boxes

A creature's hit box is **measured off its own `idle_a`** now — 85% of the drawn
rectangle — rather than authored in `src/config_summons.js`, which is the rule a
fighter's hurtbox has followed since it started coming off their art. Ten
creatures measure theirs today.

The seven whose `idle_a` is on this list cannot: measuring a sheet would give a
box six creatures wide. They keep an authored pair with a comment naming this
round, and **each pair comes out when the plate lands** — at which point the
creature starts being hit on the shape it is drawn as, with no further code
change.

---

## 20B. Twenty backgrounds, re-extended from the paintings they replaced — 20 images

**This is a re-request of 18E against a different input: the old painting
itself.** 18E asked for twenty boards repainted at 3200×1800 and got exactly
that — the resolution problem it was written to fix is fixed, and nothing here
is a complaint about sharpness. What it did not ask for, and so did not get, is
*the same picture*. Each plate was drawn fresh from the board's brief, so twenty
scenes were re-invented at the same time as they were enlarged, and the result
against the 3D camera's crop reads **sparser and darker than the paintings it
replaced** — more empty middle distance, less of the lit, busy, close detail the
old boards put right behind the fighters.

So: keep the resolution win, take the composition back. **Extend each previous
painting outward instead of replacing it.**

### The previous paintings are the input

They are in the repo, at **`assets/backgrounds/flat/`** — moved there from
`assets/reference/backgrounds_previous/` when this request was written, because
they are runtime art again: the flat camera now draws them (`backgroundFile()`
in `src/stages.js`), which is the half of this that needed no art at all. Flat
mode shows a whole plate, so pointing it back at the paintings composed for a
whole plate fixed flat mode the same afternoon. 3d mode is what this request is
for.

**The input image is the brief.** There is no scene description below and there
should not be one — the board being asked for is the board that is already
there, and any wording paraphrasing it is a chance to drift. Open the file.

### The one rule

> **Keep the source painting as the picture. Extend the scene outward by 30% on
> each of the four sides — same place, same moment, more of it — and deliver the
> whole thing at 3200×1800 or larger, exactly 16:9.**

30% on each side is **1.6× linear**, so the source painting ends up as the
**centre 62.5%** of the delivered plate, in both dimensions:

| delivered plate | the source painting occupies | new ring |
|---|---|---|
| 3200×1800 (minimum) | centre **2000×1125** | 600 px left/right, 337 px top/bottom |
| 4096×2304 (preferred) | centre **2560×1440** | 768 px left/right, 432 px top/bottom |

**Why 30% and not more.** The 3D camera over-fills its frustum on purpose
(×1.5 height, ×1.35 width — `src/camera3d/stage_geo.js`), so only the centre
**49.4%** of a plate's width is ever on screen. Against a 1.6× extension that
visible crop is **79% of the source painting**, centred — so what a player sees
in 3d becomes the old board, very slightly cropped, instead of a different
painting. The ring is not scenery anybody is meant to look at: it exists so no
dolly, yaw or roll can swing past the edge. Extending further would push the old
composition back out of frame, which is the fault being fixed.

The 3D crop of a 3200×1800 delivery is 1581 source pixels across 1280 CSS
pixels — still a downscale, so 18E's sharpness holds. 4096×2304 gives 2023 and
is comfortable at DPR 2, which is why it is preferred.

### What the ring may contain

- **More of the same scene, continued.** Same architecture, materials, weather,
  time of day, light direction and colour temperature; the same painterly style
  and line weight. A wall keeps going, a street keeps receding, a canopy of
  branches keeps spreading.
- **Nothing that reads as a second picture.** No new focal subject, no character,
  no creature, no large new light source, no text, watermark, border or vignette.
  If the ring is interesting enough to look at on its own, it is wrong.
- **Nothing painted at foreground depth in the centre 49.4%.** That is 18E's
  standing rule and it still holds: the near field belongs to the garnish layer
  (`src/camera3d/garnish.js`), which draws cards in front of the backdrop and
  will overlap anything painted there. Where a source painting already has a
  foreground element in its centre, **leave it** — it is the board players know,
  and the garnish placement is checked per board after delivery.

### Do not re-light the middle

The other half of what feels wrong is exposure. Match the source plate's
**brightness, contrast and palette exactly** where the ring meets it, and do not
take the opportunity to grade the centre — no darkening, no desaturating, no
"cinematic" cool cast. Note that the renderer already lays a 30% black wash and
the stage's tint over the plate before a player sees it
(`drawBackdrop()` in `src/render.js`), so a plate that looks a little bright and
a little saturated on its own is the one that lands correctly in the game.

Resampling the centre is unavoidable — a 1600×900 source becomes 2000×1125 at
the minimum delivery size — so upscale it cleanly and keep its detail. **Do not
repaint it.**

### The twenty, and what to open

Filenames are the ones `src/stages.js` registers, so nineteen boards need no
code change and Shibuya Night needs none either as long as it is delivered as
`.jpg` (the source is the older `.webp`; the live plate is already `.jpg`).

| Board | Stage key | Source file (under `assets/backgrounds/flat/`) | Source size | Region to extend |
|---|---|---|---|---|
| Training Bridge | `trainingBridge` | `training_bridge.jpg` | 1920×1080 | whole image |
| Quiet Hall | `quietHall` | `quiet_hall.jpg` | 1920×1080 | whole image |
| Flooded Gate | `floodedGate` | `flooded_gate.jpg` | 800×437 | centre **777×437** ⚠ |
| Shibuya Night | `shibuyaNight` | `shibuya_night.webp` | 1200×675 | whole image |
| Curse Maw | `curseMaw` | `curse_maw.jpg` | 1920×1640 | centre **1920×1080** ⚠ |
| Garden Steps | `gardenSteps` | `garden_steps.jpg` | 1600×900 | whole image |
| Lantern Corridor | `lanternCorridor` | `lantern_corridor.jpg` | 1600×900 | whole image |
| Sunken Crossing | `sunkenCrossing` | `sunken_crossing.jpg` | 1600×900 | whole image |
| Neon Split | `neonSplit` | `neon_split.jpg` | 1600×900 | whole image |
| Bone Sanctum | `boneSanctum` | `bone_sanctum.jpg` | 1600×900 | whole image |
| Bridge Duel | `bridgeDuel` | `bridge_duel.jpg` | 1600×900 | whole image |
| Academy Hall | `academyHall` | `academy_hall.jpg` | 1600×900 | whole image |
| Mist Pier | `mistPier` | `mist_pier.jpg` | 1600×900 | whole image |
| Crosswalk Rush | `crosswalkRush` | `crosswalk_rush.jpg` | 1600×900 | whole image |
| Cursed Teeth | `cursedTeeth` | `cursed_teeth.jpg` | 1600×900 | whole image |
| River Gate | `riverGate` | `river_gate.jpg` | 1600×900 | whole image |
| School Wing | `schoolWing` | `school_wing.jpg` | 1600×900 | whole image |
| Empty City | `emptyCity` | `empty_city.jpg` | 1600×900 | whole image |
| Billboard Roof | `billboardRoof` | `billboard_roof.jpg` | 1600×900 | whole image |
| Domain Core | `domainCore` | `domain_core.jpg` | 1600×900 | whole image |

**The two ⚠ rows are the boards whose source is not 16:9.** Take the centred
16:9 region first — that is what the game has always shown of them, since
`drawBackdrop()` cover-fits — and extend *that*, so the delivery is 16:9
throughout and nothing the player knows is cropped by the change.

**Flooded Gate is the hard one.** Its source is 800×437, so the centre of a
3200×1800 delivery is a 2.6× upscale of a small, soft image and clean
resampling will not carry it. This is the one board where **re-detailing inside
the kept composition is expected**: same gate, same water, same framing, same
palette and light, painted at the delivered resolution. It is also the board
where a 4096×2304 delivery buys the least, so 3200×1800 is fine for it.

### Delivery

`assets/intake/backgrounds/<file>.jpg` — JPEG, high quality, the filenames in
the table above (Shibuya Night as `shibuya_night.jpg`). No alpha, no key screen:
a background is a finished picture, not a subject on a field, and it takes the
short path through intake — no keying, no measuring, no manifest entry (see
[assets/intake/README.md](../assets/intake/README.md)).

**On landing, archive the plate being replaced** into
`assets/reference/backgrounds_18e/`, the same way 18E archived what it replaced.
`assets/backgrounds/flat/` is **not** an archive and must not be touched: the
flat camera draws those twenty files every match.

Checked on delivery, per plate:

1. exactly 16:9, at least 3200×1800;
2. the centre 62.5% is the source painting — not a redraw of it — at matching
   brightness and palette;
3. the centre 49.4% stands as a finished picture, which follows from (2);
4. no text, border, watermark or signature anywhere, ring included.

---

## 20C. The grab poses — 81 sprites

**Three new poses per fighter, all 27 fighters**, for the Smash-style grab and
throw mechanic that shipped behind `?throw=true` (`src/grab.js`,
[game-mechanics.md §8](game-mechanics.md#grabs--throws--experimental-behind-throwtrue)).
The mechanic is fully playable now on **reused art** — the table below is what
each state draws in the meantime — so nothing is blocked; this request is what
makes a grab look like a grab instead of a frozen light attack.

| Pose key | What it must read as | Drawing in the meantime |
|---|---|---|
| `grab_reach` | A committed forward lunge with one open, grasping hand leading — reaching to seize, not to strike. The other arm guards. | first light-attack frame |
| `grab_hold` | Gripping an (unseen) opponent at arm's length by the collar — front hand closed in a fist at chest height, weight planted, coiled to heave. The opponent is NOT in the drawing: the game places the victim's own body in the grip. | `charge` |
| `grabbed` | Seized and struggling: body arched back from the collar, feet scrabbling, both hands prying at an (unseen) grip at their own chest. Also unlocks: this doubles as the pose for any future "held/dragged" effects. | `hurt` |

The four throw states (`throw_fwd`, `throw_back`, `throw_up`, `throw_down`)
are **registered but not requested**: each currently plays the heavy attack
swung that way, which reads correctly because a throw IS a heave in that
direction. If a fighter's grab set ever gets a bespoke throw pose, deliver it
under those keys and it is picked up with no code change — but 20C is complete
without them.

**The critical constraint is the grip point.** `grab_hold`'s closed fist and
`grabbed`'s prying hands must both sit at **chest height on the leading edge of
the body**, because the game overlaps the two drawings at a fixed gap
(`holdGap` in `src/grab.js`) — a fist drawn high on one fighter and low on
another makes every pairing look like they are holding different arguments.
Chest height, front edge, both poses, whole roster.

Same spec as every sprite round: one subject per file, flat key screen (grey
for the warm-palette fighters — see the list at the top), facing right, one
zoom per character matched to their own `idle_a`, at least 600 px of body,
delivered to `assets/intake/<character>/<pose_key>.png`. Read
[pose-brief.md](../sprites/docs/pose-brief.md) first, and the
[canonical reference](#the-canonical-reference-image--one-per-fighter) rule
applies as always.

**The 2.5D/3D side of the same mechanic is aliased, not owed:** the rig states
`grabReach`, `grabHold`, `grabbed` and the four throws currently play the
`light` / `charge` / `hurt` / heavy clips (`STATE_ALIASES` in
`billboards/src/states.js`). Bespoke grab clips would be a B-/D-round request
if the mechanic graduates from its flag; nothing is asked of the model tracks
yet.
