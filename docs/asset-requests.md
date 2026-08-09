# Asset Requests — open requests

Everything in this file is **outstanding**. Delivered rounds are recorded in
[asset-requests-history.md](asset-requests-history.md) — including the round
numbers, so a commit or code comment citing "round 5 art" still resolves.

**Current status: rounds 1–11 delivered. Round 12 is the only open round.**

The roster is complete and **every fighter now has one sprite per action** —
round 11 finished the conversion that round 5 started, so the 4×5 sprite sheet
is retired and no action anywhere plays a grid cell. Nothing outstanding blocks
play.

Round 12 has three parts: nineteen fix-up poses caught while placing the
delivered sets in the sprite workbench, the **four-frame run cycle** for the
whole roster — the redesign that retires the two-frame run — and the
knocked-flat **`prone` pose** the new knockdown mechanic simulates until it is
drawn.

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

**Mahoraga's canon is the shikigami render, not his `idle_a`** —
`assets/reference/canon/mahoraga_canon.png`, the full-body art the game already
ships. Round 11A redrew him from it, so his delivered set now agrees with it;
the render stays the authority for his design because it is what the set was
drawn against.

---

# Round 12 — open

Three parts; any can be delivered on its own.

- **12A** — nineteen workbench catches: poses that are wrong on the art or wrong as the action (19 sprites)
- **12B** — the four-frame run cycle, roster-wide (96 sprites)
- **12C** — a `prone` pose, knocked flat on their back, roster-wide (24 sprites)

**139 sprites in total.** 12A is small and blocking-ish; 12B is the big one and
is what makes the roster finally *run* instead of vibrating between two nearly
identical poses. 12C is the one the engine is already simulating without art.

---

## 12A. Workbench catches — 19 sprites

Everything here came out of placing the delivered semantic sets in the sprite
workbench: seen at their real size and standing on the real ground line,
nineteen poses turned out to be wrong — some as drawings, some as the action they stand
for. Round 11 is closed, so nothing here is covered by another round — every
fighter listed has a finished set, and these are faults in it.

Two kinds of fault, and they want different things from a redraw:

- **The drawing is broken.** A hand that does not close on the weapon it is
  holding, a shaft that bends where it crosses the body. These are `quality`.
- **The drawing is fine, the pose is not the action.** A crouch that is not
  crouched, a strike that does not travel the way the move travels. These are
  `pose` — keep the character, the costume and the finish, change the body.

A third fault runs through several of them and is worth naming on its own,
because it is not obvious from the drawing: **the art paints in something the
game spawns for itself.** See "Do not draw the technique" below.

**Six of the ten are a crouch that is not crouched**, across five different
fighters and two separate delivery rounds. Whatever the pose line says today, it
is not reading as "get low": see the note under the table.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Nobara Kugisaki | `nobara` | `dodge_air` | **Replace** | A second, grey Nobara is drawn into the plate |
| Nobara Kugisaki | `nobara` | `special_neutral` | **Replace** | The nails are painted in, and the game draws its own |
| Satoru Gojo | `gojo` | `special_down` | **Replace** | Reads as a palm strike, not as Infinity |
| Kinji Hakari | `hakari` | `dodge_air` | **Alpha** | Unkeyed grey shadow left behind him |
| Satoru Gojo | `gojo` | `crouch_b` | Pose | Not crouched |
| Satoru Gojo | `gojo` | `crouch_attack_b` | Pose | Not crouched, and the strike goes upward |
| Mahito | `mahito` | `crouch_b` | Pose | Not crouched |
| Mahoraga | `mahoraga` | `crouch_a` | Pose | Not crouched — a standing stride |
| Mahoraga | `mahoraga` | `crouch_attack_b` | Pose | Not crouched; the follow-through happens standing |
| Nobara Kugisaki | `nobara` | `special_down` | Pose | Hammers the ground; Resonance strikes a doll |
| Maki Zen'in | `maki` | `attack_air_a` | **Replace** | Hands and weapon are malformed |
| Maki Zen'in | `maki` | `attack_heavy_a` | **Replace** | The lead hand does not close on the shaft, which kinks where it crosses her body |
| Maki Zen'in | `maki` | `ult_b` | **Replace** | Hands and weapon are malformed |
| Maki Zen'in | `maki` | `crouch_b` | Pose | Not low enough — barely below `crouch_a` |
| Maki Zen'in | `maki` | `crouch_attack_b` | Pose | The follow-through does not travel toward the attack |
| Megumi Fushiguro | `megumi` | `special_neutral` | Pose | Nue is painted in; the engine already flies its own |
| Megumi Fushiguro | `megumi` | `special_down` | Pose | The shadow pool is painted in; the engine draws that too |
| Momo Nishimiya | `momo` | `attack_light_b` | Pose | The follow-up pulls the broom away from the target |
| Momo Nishimiya | `momo` | `crouch_attack_b` | Pose | The follow-through stands up out of the crouch |

### Do not draw the technique

A fighter's sprite is the **body performing the move**. Everything the technique
puts on screen — the projectile, the summon, the pool, the shockwave — is
spawned by the engine from that fighter's kit, composited at its own size and
animated on its own clock. When the art paints it in as well, the player sees it
twice, at two sizes, moving two different ways.

It has now come up three times:

| Pose | Painted in | What the engine already spawns |
|---|---|---|
| `nobara/special_neutral` | cursed nails in flight | `effect:nail`, two per cast |
| `megumi/special_neutral` | Nue, the shadow bird | `summon:nue` — steerable, 132 px tall, flown by the player |
| `megumi/special_down` | the shadow pool he sinks into | a burst in his shadow colour, both ends of the teleport |

Megumi's are the clearest case, because **Nue is a creature the player flies.**
The neutral special launches him and the right stick steers him across the
arena; a second Nue fixed to Megumi's hip goes nowhere and reads as a glitch the
moment the real one leaves.

So for any technique pose: draw the **cast** — the stance, the hands, the gather
of cursed energy at the point it leaves the body — and stop there. Energy
forming at the palm is the body; a bird in flight is not. Where a fighter's
technique is *inseparable* from the pose (Maki's naginata, Momo's broom — the
thing they are holding), that stays; the test is whether the game spawns its own
copy.

**`megumi/special_side` is very likely a third instance** and is not flagged
yet. Two black hounds are painted at his feet, and Divine Dogs spawns two real
ones (`summon:divine_dog_black`, `summon:divine_dog_white`, `maxActive: 2`) that
chase the opponent for six seconds — so a cast puts four dogs on screen, two of
which never move. Worth a look in the workbench before this round is drawn.

### The second frame has to finish the first

`attack_light_a`/`_b` and `crouch_attack_a`/`_b` are **one motion drawn twice**,
and the `_b` frame keeps going the way `_a` was heading. Four of this round's
entries miss the same way — the second frame retreats, rises, or resets to a
neutral stance, so the combo plays as a strike followed by an un-strike.

| Pose | `_a` does | `_b` should | `_b` does |
|---|---|---|---|
| `momo/attack_light_b` | thrusts the broom forward | carry through past the target, hips rotated in | lifts the broom up and back, away from what she just hit |
| `momo/crouch_attack_b` | sweeps low out of a lunge | stay down, the sweep finishing across the floor | rises toward standing |
| `maki/crouch_attack_b` | strikes low | follow the arc through | does not travel toward the attack |
| `gojo/crouch_attack_b` | strikes low | follow through, still crouched | rises and strikes upward |

The check: flip between `_a` and `_b`. Every part of the body that was moving
should have moved **further in the same direction**. If the weapon or fist is
closer to where it started, the second frame is a wind-up, not a follow-through.

### Hands on a weapon

Maki's three `quality` frames are all the same failure, and it is the one to
watch for on every armed fighter: **the hand does not grip.** The fingers pass
through the shaft, or close on empty air beside it, or the shaft bends through
the fist as though it were rope. `attack_heavy_a` has both — the lead hand never
closes, and the naginata kinks where it crosses her chest.

Her `attack_heavy_b` is the reference: two hands, both closed, the shaft dead
straight through them. Draw the grip first and the pose around it.

### The crouch keeps coming back standing

`gojo/crouch_b`, `gojo/crouch_attack_b`, `mahito/crouch_b`,
`mahoraga/crouch_a`, `mahoraga/crouch_attack_b` and `reggie/crouch_attack_b`
(11D) are all the same miss, from three different rounds: a figure standing
upright with the knees slightly bent, which reads as `idle` rather than as a
crouch. It survives review every time because in isolation it is a good drawing
— it only fails beside the fighter's own `idle_a`, where nothing has moved.

So the pose lines are not enough on their own. For any crouch pose in this round
or later, the test is comparative and it is the one to draw against:

> Put the crouch beside that fighter's `idle_a`. **The head must drop by at
> least a quarter of the figure's standing height.** Hips down toward heel
> height, thighs closer to horizontal than vertical, back angled forward, and
> the silhouette measurably shorter and wider than the idle. If the two images
> have the same outline at the shoulders, it is not a crouch.

`crouch_attack_a` / `_b` are that same low stance with the strike coming out of
it — the body stays down through the follow-through. A rising strike from
standing is a different move and belongs to `attack_up`.

## Hakari's air dodge — an alpha fix, not a redraw — 1 sprite

`hakari/dodge_air` carries a large grey smudge behind the figure — a drawn
shadow in almost exactly the mid-grey `#808080` of his key screen. Intake cuts
the key by flooding in from the border, and a *shaded* grey is not the flat key
colour, so it survived the cut and now hangs in the air behind him every time he
air-dodges.

This is the cheapest fix in the round: the drawing is good and the placement is
correct, so it needs the same art with the shadow gone. Either re-export the
plate without the ground shadow, or it can be cut in-repo against the existing
file — the shadow is a connected region that touches nothing on the body.

Redelivery, if that is the easier route: `assets/intake/hakari/dodge_air.png`,
same pose, same framing, flat mid-grey `#808080` and **no drawn shadow of any
kind** — the game casts its own.

Three are blocking and four are wishes, so they can ship separately — but they
are all the same size of job, and three of them are the same mistake, so there is
no reason to split them.

### The three crouches — 3 sprites

`crouch_a` and `crouch_b` are the two frames of the crouch cycle, and `crouch_b`
is meant to be **the same crouch a fraction lower, weight settled**. What was
delivered for all three is a figure standing upright with the knees slightly
bent — closer to `idle` than to `crouch_a`. On screen the character barely moves
when the player holds down, and `crouch_attack_b` swings upward from standing
rather than following through on a low attack.

The `_a` frames are right; draw the `_b` frames against them.

| Pose | What to draw |
|---|---|
| `gojo/crouch_b` | The same crouch as `gojo/crouch_a`, settled lower — hips down near heel height, thighs closer to horizontal, back angled forward, guard still up. This is a fighting crouch, not a rest. |
| `mahito/crouch_b` | The same, against `mahito/crouch_a`. |
| `gojo/crouch_attack_b` | The **follow-through of a low attack** — the arm or leg extended out at ankle-to-knee height, body still down in the crouch, weight carried through the sweep. Not a rising uppercut. |

Match each fighter's own `crouch_a` for camera distance, figure scale, costume
and line weight: these two frames play back to back at a few frames a second, so
anything that differs between them reads as a flicker rather than a settle.

### Gojo's Infinity — 1 sprite

`gojo/special_down` is his **down special**, which is `Infinity` — a *counter*,
not a strike (`src/characters.js`). What is drawn is Gojo standing square with a
palm thrust forward, which is a good drawing of his heavy (`Lapse Palm`) and is
close enough to it on screen that the two moves look like the same move.

Draw the counter instead: **stopped**, not striking. Weight low and settled, both
hands raised into a hold rather than one arm punched out, the body braced to
receive something. The nullification field is the point — pale blue-white
distortion gathering just off his palms, air bending around him — and the pose
should read as *the attack does not arrive* rather than *he is hitting you*.

### Nobara's air dodge — 1 sprite

`nobara/dodge_air` has **two figures on it.** Behind the drawn Nobara there is a
full grey ghost of her — a second body, a second head of hair, a second arm —
and the hammer belongs to the ghost, not to her: her own hands are closed on
nothing.

Whatever it was meant to be as an illustration, the game composites its own
motion trails behind a dodging fighter (`trailStrength`, `src/motion.js`), so a
painted-in afterimage is a grey duplicate Nobara that trails the real one and
never fades, with a hammer floating loose beside it.

Redraw as **one** figure: Nobara tucked mid-air through an evasive roll, hammer
held in her own hand, nothing behind her. No afterimage, no speed lines, no
second body — the engine adds all of that.

### Nobara's two techniques — 2 sprites

Her kit (`src/characters.js`) is specific about what these are, and neither
drawing matches:

| Pose | Technique | What is drawn | What it should be |
|---|---|---|---|
| `special_neutral` | **Straw Doll: Nail Shot** — cursed nails fired downrange | Hammer raised, arm out, and a row of grey nails already flying off her hand | The moment of the shot, **without the nails.** The game spawns them itself (`effect:nail`, two per cast), so the painted ones fly alongside a second set at a different size and colour. Draw the cast: hammer driving forward, nails just leaving, energy at the hand — no projectiles in flight. |
| `special_down` | **Resonance** — drives a nail into the **straw doll**, so marked souls take the hit wherever they stand | Crouched, hammering nails into the ground | The doll is the whole point of the move and is not in the picture. Draw her low with the straw doll held or braced in one hand, hammer driving a nail into *it*, cursed energy running out of the doll rather than into the floor. Hammering the ground is already what her down-heavy looks like. |

`special_down` is the wish and `special_neutral` the blocking one, because the
doubled nails are visible in every match.

```
assets/intake/gojo/special_down.png
assets/intake/gojo/crouch_b.png
assets/intake/gojo/crouch_attack_b.png
assets/intake/mahito/crouch_b.png
assets/intake/nobara/dodge_air.png
assets/intake/nobara/special_neutral.png
assets/intake/nobara/special_down.png
```

Standard delivery spec at the top of this file. Gojo and Mahito key on magenta
`#FF00FF`; Nobara is a warm palette, so hers key on mid-grey `#808080`. Canon
references: `assets/reference/canon/gojo_idle.png`,
`assets/reference/canon/mahito_idle.png` and
`assets/reference/canon/nobara_idle.png`.

---

## 12B. The four-frame run cycle — 96 sprites across 24 characters

### Why the two-frame run is being retired

Every fighter's run is two sprites, `run_a` and `run_b`, alternated at 10 fps.
Set them side by side for any fighter and the problem is visible before the
game even starts: **they are two drawings of the same half of a stride.** Both
frames tend to show the same leg leading, differing only in arm angle or how
far the legs are apart — so on screen the character does not stride, they
vibrate between two near-identical poses while sliding along the ground. And
because the two were generated independently, they rarely agree on lean or
figure scale either, so the vibration comes with a lurch.

The fix is not better versions of the same two frames. A run cycle has a
structure, and two frames cannot hold it:

- A stride has **two halves** — right leg leading, then left leg leading — and
  a side-view character is asymmetric (Maki's naginata, Yuta's katana, Nanami's
  cleaver, every jacket and hairstyle), so the second half cannot be faked by
  mirroring the first. Both leg-leads must be drawn.
- Between the two reaches the legs **cross under the body**. Without a crossing
  frame the legs teleport from one split to the other, which is exactly the
  "two poses swapping" read the current run has.

Four key poses is the classic minimum that holds all of it — the **reach**
(full stride) and the **pass** (legs crossing) for each leg-lead — and it is
also about the ceiling of what our generator can keep consistent across
independently drawn frames, so that is the shape of this round:

| Order | Pose key | What it is |
|---|---|---|
| 1 | `run_reach_a` | full stride, one leg reaching forward |
| 2 | `run_pass_a` | legs crossing under the body, rear leg swinging through |
| 3 | `run_reach_b` | full stride, the **other** leg reaching forward |
| 4 | `run_pass_b` | legs crossing again, the other leg swinging through |

The loop plays 1→2→3→4 at 13 fps — a full cycle every ~0.31 s, about three
strides a second, which reads as a sprint. The engine adds sway once per cycle
and a bob on each footfall on top (`src/motion.js`).

### Pose lines

Combine each fighter's character block with these, one image per line. The four
are **one continuous motion sampled four times** — same camera, same distance,
same figure scale, same costume and weapon; only the body moves.

| Pose | Pose line |
|---|---|
| `run_reach_a` | sprinting at full stride, torso leaning forward, RIGHT leg extended forward with the heel about to strike, left leg trailing fully behind, LEFT arm swung forward and right arm driven back, body at the lowest point of the stride |
| `run_pass_a` | mid-stride, upright moment of the sprint, legs crossing directly beneath the hips with the left knee driving through to the front, arms passing at the sides, body at the highest point of the stride |
| `run_reach_b` | sprinting at full stride, torso leaning forward, LEFT leg extended forward with the heel about to strike, right leg trailing fully behind, RIGHT arm swung forward and left arm driven back, body at the lowest point of the stride |
| `run_pass_b` | mid-stride, upright moment of the sprint, legs crossing directly beneath the hips with the right knee driving through to the front, arms passing at the sides, body at the highest point of the stride |

Things that make or break this specific set:

- **The lean is constant.** A sprinter's torso holds a steady forward lean
  through the whole cycle. If one frame stands tall and the next dives, the
  loop rocks like a see-saw. Pick the lean from the fighter's `dash` pose,
  dialled back a little, and keep it in all four.
- **Reach low, pass high.** The body genuinely rises on the crossing frames and
  sinks on the contact frames — that is where the bounce of a run comes from,
  and the engine only *adds half* of its usual procedural bob when the cycle
  art is present, expecting the art to carry the rest.
- **Weapons ride, they do not flail.** A carried weapon (naginata, axe, broom,
  sword, guitar) stays in the same hand at the same size in all four frames,
  moving only as much as the arm swing moves it. The most common generator
  failure on this pose is the prop teleporting between hands.
- **Nothing airborne-looking.** Frames where both feet float with the body
  rising read as a jump when looped. On the pass frames the toes of the
  planted foot can leave the ground, but the pose must read as *between*
  steps, not above them.
- **No motion effects.** No speed lines, no dust, no afterimages — the engine
  draws all of that (`trailStrength`, dash dust). Painted-in effects loop as a
  flicker.

### Who and what to deliver

All 23 roster fighters plus **Mahoraga**, four poses each. He was held out of
this list while round 11A was open, on the assumption his cycle would come with
that redraw; 11A has since been delivered as the 33-pose set, which carries
`run_a`/`run_b` and not the cycle. So he needs these four like everyone else —
`assets/intake/mahoraga/run_reach_a.png` and the rest.

```
assets/intake/<character>/run_reach_a.png
assets/intake/<character>/run_pass_a.png
assets/intake/<character>/run_reach_b.png
assets/intake/<character>/run_pass_b.png
```

Standard delivery spec at the top of this file: facing right, flat key screen —
warm-palette fighters (Sukuna, Nobara, Momo, Hakari, Yuji, Choso, Uro,
Gakuganji) on mid-grey `#808080`, everyone else on magenta `#FF00FF`. Each
fighter's canonical reference is their `assets/reference/canon/<char>_idle.png`
— every fighter has one now — and their `dash` sprite is the secondary
reference for how *this* character carries themselves at speed.

Deliver **all four frames of a fighter together.** A half-delivered cycle
plays whatever subset exists, and two frames of the new art loop worse than
the old pair they replace. Fighter by fighter is fine; frame by frame is not.

### The old pair stays, as the fallback

`run_a` and `run_b` are not deleted and not redrawn. The run animation names
the four cycle frames with the old pair as its `fallback`
(`src/characters.js`), so a fighter whose cycle has not landed keeps running
exactly as today, at the old 10 fps — and picks the cycle up the moment their
four frames are imported and registered. No code change per fighter; the round
can land one fighter at a time.

### Integrating

1. Import with `tools/intake.py` as usual — the semantic pose keys register
   like any other.
2. Run `python3 tools/bake_anchors.py` so the new frames get their centre of
   mass measured; the run lean rotates about it.
3. Check the loop in the sprite workbench: the four frames play in order under
   the Run state, and a scale mismatch between them shows up as pulsing there
   before it ships.

---

## 12C. A prone pose — knocked flat on their back, 24 sprites

### Why

The game now has a KNOCKDOWN: Reggie's runaway sedan (and anything else that
sets `knockdown` on a hit) leaves its victim lying flat on the ground for about
a second before they get up. Every fighter can be on the receiving end, so every
fighter needs the pose.

**Nothing is blocked.** Until a fighter's `prone` art lands, the game simulates
it — their `hurt` pose swept 90 degrees onto its back (`fighter.js`,
`prone` in the shared animation tables). That reads fine at speed; a drawn pose
reads better. Deliveries can land one fighter at a time and each takes effect on
import with no code change, the same fallback machinery as the wind-up/strike
pairs.

### What to deliver

One pose per fighter:

| Pose | Pose line |
|---|---|
| `prone` | flat on their back on the ground, arms out, legs dropped, head tilted — dazed but conscious, the beat after being run over. Drawn HORIZONTAL: the body lies along the ground plane, feet toward the right edge of the frame |

Facing note: the standard spec says faces right — for this pose that means
**feet to the right**, since the body is horizontal. The renderer mirrors it
for a fighter facing left like any other frame.

Match each fighter's canonical reference image for costume, proportions and line
weight. Same delivery spec as everything else; body length on the plate around
the usual ~290 px figure scale, lying down.

Deliver to:

```
assets/intake/<character>/prone.png
```

All 23 fighters plus **Mahoraga** — the transform can be knocked down like
anyone else (his armour eats the hit today, but a future knockdown that pierces
armour would want the pose). Round 11A is closed, so his does not arrive with
anything else.
