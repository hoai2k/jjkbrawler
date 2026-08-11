# Open Image Requests — everything still to draw

**This file is generated** by `node tools/build_image_requests.mjs`. Re-run it
after every delivery; it reads the sprite manifest's flags, the sprite
manifest's stand-ins, the render3d rig manifest and the files actually on
disk, so it cannot drift from them the way a hand-kept list does. Do not edit
it — fix the source and re-run.

**101 images outstanding**, all of them 2D inputs to the 3D track. The 2D
sprite rounds are closed (see below), so nothing here changes what the sprite
game looks like — these are what the `?render=3d` and `?render=billboard`
paths are built from.

Sibling documents, each of which owns its own rounds: the sprite rounds in
[asset-requests.md](asset-requests.md), the model rounds in
[render3d](../render3d/docs/asset-requests.md) and
[billboards](../billboards/docs/asset-requests.md), the full DI round text in
[render3d/docs/image-requests.md](../render3d/docs/image-requests.md), and the
one-screen index of all of it in [all-requests.md](all-requests.md).

---

## Rules that hold for every image here

- **The canon reference is the subject.** Each row names the fighter's own
  reference under `assets/reference/canon/`; the drawing is that character,
  not an interpretation of them.
- **The character block goes in the prompt verbatim.** They are reproduced at
  the bottom of this file.
- **These are not sprites.** No magenta or grey key screen, no trimming — a
  turnaround wants clean white or transparency, a swatch sheet wants labels.
  The keyed-plate rules in the 2D delivery spec do not apply to anything here.
- **Any subset is useful.** Every round below lands per fighter, and a fighter
  with nothing delivered keeps whatever the engine does today.

---

## DI1 — Turnaround boards — the model-generation inputs

**20 images.** A sprite set only ever shows one ¾ view and mirrors the rest, which is precisely what a 3D model cannot be built from.

What each one is:

- One PNG per fighter, **2048×1024 or larger, clean white or transparent background**.
- The fighter in a neutral standing pose seen **front, ¾-front, side and back**, at one consistent scale and eye-line.
- Flat colours from the canon palette. **No dramatic lighting, no perspective, no overlapping limbs** — arms held slightly away from the body (near-A-pose reconstructs best).
- The face on-model in the front view. The back view has to answer everything the sprites never showed: hair from behind, the back of the uniform, where any prop is stowed.

Deliver to:

```
assets/intake/render3d/<char>_turnaround.png
```

Full round text: [DI1](../render3d/docs/image-requests.md#round-di1--model-generation-turnaround-boards-the-tripo-inputs).

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Aoi Todo | `todo` | 190 cm | unarmed | `assets/reference/canon/todo_idle.png` | Grappler bulk in the shoulders |
| Yuki Tsukumo | `yuki` | 180 cm | unarmed | `assets/reference/canon/yuki_idle.png` | — |
| Ryomen Sukuna | `sukuna` | 173 cm | unarmed | `assets/reference/canon/sukuna_idle.png` | Facial/body markings; no shawl (round 2 ruling) |
| Choso | `choso` | 181 cm | unarmed | `assets/reference/canon/choso_idle.png` | Blood effects are engine-side |
| Kinji Hakari | `hakari` | 185 cm | unarmed | `assets/reference/canon/hakari_idle.png` | Shutters are engine-side |
| Yuta Okkotsu | `yuta` | 175 cm | blade | `assets/reference/canon/yuta_idle.png` | Katana, sheathed at idle |
| Kento Nanami | `nanami` | 184 cm | blade | `assets/reference/canon/nanami_idle.png` | Wrapped blunt blade |
| Toji Fushiguro | `toji` | 187 cm | blade | `assets/reference/canon/toji_idle.png` | Spear + chain; inventory worm not modeled |
| Reggie Star | `reggie` | 190 cm* | blade | `assets/reference/canon/reggie_idle.png` | Katana-umbrella |
| Nobara Kugisaki | `nobara` | 160 cm | heavy | `assets/reference/canon/nobara_idle.png` | Hammer + nails in hand |
| Mei Mei | `meimei` | 190 cm* | heavy | `assets/reference/canon/meimei_idle.png` | Braided axe; braid needs bones |
| Momo Nishimiya | `momo` | 150 cm | polearm | `assets/reference/canon/momo_idle.png` | Broom — also ridden; see her kit |
| Satoru Gojo | `gojo` | 190 cm | caster | `assets/reference/canon/gojo_idle.png` | Blindfold, not glasses (canon ref) |
| Toge Inumaki | `inumaki` | 164 cm | caster | `assets/reference/canon/inumaki_idle.png` | High collar; seal marks on tongue unseen |
| Kokichi Muta | `mechamaru` | 205 cm | caster | `assets/reference/canon/mechamaru_idle.png` | Puppet body; arm cannon |
| Yoshinobu Gakuganji | `gakuganji` | 190 cm* | caster | `assets/reference/canon/gakuganji_idle.png` | Guitar, slung and played |
| Panda | `panda` | 200 cm | bulk | `assets/reference/canon/panda_idle.png` | Core marking per round 2 ruling |
| Dagon | `dagon` | 215 cm | bulk | `assets/reference/canon/dagon_idle.png` | Extra bones for the tendrils |
| Kurourushi | `kurourushi` | 190 cm* | bulk | `assets/reference/canon/kurourushi_idle.png` | The one nonstandard skeleton; bulk clips as reference only |
| Mahoraga | `mahoraga` | match in-game | bulk | `assets/reference/canon/mahoraga_canon.png` | Megumi's install actor (config_transform.js) |

## DI2 — Face sheets — what the face-first review gate reads against

**27 images.** AI-generated meshes fail at faces first, and the workbench's sweeping-light check needs something to judge AGAINST. Needed for a fighter whose rig has already arrived just as much as for one whose has not.

What each one is:

- One sheet per fighter: **front, ¾ and profile of the head only**, at least 512 px per view.
- Canon palette, neutral expression.
- The drawn truth of the jawline, the eye shapes, and — this one matters to the modeller — **the hair clumping and which side it parts**, because the normals are combed along it.

Deliver to:

```
assets/intake/render3d/<char>_face.png
```

Full round text: [DI2](../render3d/docs/image-requests.md#round-di2--face-sheets-the-face-first-gates-reference).

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Aoi Todo | `todo` | 190 cm | unarmed | `assets/reference/canon/todo_idle.png` | Grappler bulk in the shoulders |
| Yuki Tsukumo | `yuki` | 180 cm | unarmed | `assets/reference/canon/yuki_idle.png` | — |
| Takako Uro | `uro` | 190 cm* | unarmed | `assets/reference/canon/uro_idle.png` | Sky-palm effects are engine-side |
| Mahito | `mahito` | 179 cm | unarmed | `assets/reference/canon/mahito_idle.png` | Patchwork skin in the texture |
| Ryomen Sukuna | `sukuna` | 173 cm | unarmed | `assets/reference/canon/sukuna_idle.png` | Facial/body markings; no shawl (round 2 ruling) |
| Choso | `choso` | 181 cm | unarmed | `assets/reference/canon/choso_idle.png` | Blood effects are engine-side |
| Kinji Hakari | `hakari` | 185 cm | unarmed | `assets/reference/canon/hakari_idle.png` | Shutters are engine-side |
| Yuta Okkotsu | `yuta` | 175 cm | blade | `assets/reference/canon/yuta_idle.png` | Katana, sheathed at idle |
| Kento Nanami | `nanami` | 184 cm | blade | `assets/reference/canon/nanami_idle.png` | Wrapped blunt blade |
| Toji Fushiguro | `toji` | 187 cm | blade | `assets/reference/canon/toji_idle.png` | Spear + chain; inventory worm not modeled |
| Reggie Star | `reggie` | 190 cm* | blade | `assets/reference/canon/reggie_idle.png` | Katana-umbrella |
| Nobara Kugisaki | `nobara` | 160 cm | heavy | `assets/reference/canon/nobara_idle.png` | Hammer + nails in hand |
| Mei Mei | `meimei` | 190 cm* | heavy | `assets/reference/canon/meimei_idle.png` | Braided axe; braid needs bones |
| Maki Zen'in | `maki` | 170 cm | polearm | `assets/reference/canon/maki_idle.png` | Playful Cloud |
| Momo Nishimiya | `momo` | 150 cm | polearm | `assets/reference/canon/momo_idle.png` | Broom — also ridden; see her kit |
| Satoru Gojo | `gojo` | 190 cm | caster | `assets/reference/canon/gojo_idle.png` | Blindfold, not glasses (canon ref) |
| Megumi Fushiguro | `megumi` | 175 cm | caster | `assets/reference/canon/megumi_idle.png` | Shadow/shikigami are engine + summons |
| Toge Inumaki | `inumaki` | 164 cm | caster | `assets/reference/canon/inumaki_idle.png` | High collar; seal marks on tongue unseen |
| Kokichi Muta | `mechamaru` | 205 cm | caster | `assets/reference/canon/mechamaru_idle.png` | Puppet body; arm cannon |
| Yoshinobu Gakuganji | `gakuganji` | 190 cm* | caster | `assets/reference/canon/gakuganji_idle.png` | Guitar, slung and played |
| Suguru Geto | `geto` | 191 cm | caster | `assets/reference/canon/geto_idle.png` | Curse summons are engine-side |
| Jogo | `jogo` | 180 cm | caster | `assets/reference/canon/jogo_idle.png` | Volcano head is mesh, not particle |
| Panda | `panda` | 200 cm | bulk | `assets/reference/canon/panda_idle.png` | Core marking per round 2 ruling |
| Hanami | `hanami` | 220 cm | bulk | `assets/reference/canon/hanami_idle.png` | Canon Hanami: lean pale body, black brushstroke stripes, antler horns (round 17A). **+ `hanami_alt` material variant** — the earlier bark-and-foliage design |
| Dagon | `dagon` | 215 cm | bulk | `assets/reference/canon/dagon_idle.png` | Extra bones for the tendrils |
| Kurourushi | `kurourushi` | 190 cm* | bulk | `assets/reference/canon/kurourushi_idle.png` | The one nonstandard skeleton; bulk clips as reference only |
| Mahoraga | `mahoraga` | match in-game | bulk | `assets/reference/canon/mahoraga_canon.png` | Megumi's install actor (config_transform.js) |

## DI3 — Shade palette swatches — the two-band ramp's colours

**27 images.** The toon pass paints shadows from a palette rather than from darkness, and those numbers land in the rig's material extras (or the manifest's `toon` block) at intake. Not one delivered rig carries a `toon` block today, so every one of them is running on the engine defaults.

What each one is:

- One labelled swatch sheet per fighter. Format is free; a PNG grid is fine.
- Each major material region — skin, hair, uniform top, uniform bottom, props — paired with **its lit fill and its painted shadow colour**.
- Taken from, or consistent with, that fighter's own sprite shading.

Deliver to:

```
assets/intake/render3d/<char>_shade.png
```

Full round text: [DI3](../render3d/docs/image-requests.md#round-di3--shade-palette-swatches).

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Aoi Todo | `todo` | 190 cm | unarmed | `assets/reference/canon/todo_idle.png` | Grappler bulk in the shoulders |
| Yuki Tsukumo | `yuki` | 180 cm | unarmed | `assets/reference/canon/yuki_idle.png` | — |
| Takako Uro | `uro` | 190 cm* | unarmed | `assets/reference/canon/uro_idle.png` | Sky-palm effects are engine-side |
| Mahito | `mahito` | 179 cm | unarmed | `assets/reference/canon/mahito_idle.png` | Patchwork skin in the texture |
| Ryomen Sukuna | `sukuna` | 173 cm | unarmed | `assets/reference/canon/sukuna_idle.png` | Facial/body markings; no shawl (round 2 ruling) |
| Choso | `choso` | 181 cm | unarmed | `assets/reference/canon/choso_idle.png` | Blood effects are engine-side |
| Kinji Hakari | `hakari` | 185 cm | unarmed | `assets/reference/canon/hakari_idle.png` | Shutters are engine-side |
| Yuta Okkotsu | `yuta` | 175 cm | blade | `assets/reference/canon/yuta_idle.png` | Katana, sheathed at idle |
| Kento Nanami | `nanami` | 184 cm | blade | `assets/reference/canon/nanami_idle.png` | Wrapped blunt blade |
| Toji Fushiguro | `toji` | 187 cm | blade | `assets/reference/canon/toji_idle.png` | Spear + chain; inventory worm not modeled |
| Reggie Star | `reggie` | 190 cm* | blade | `assets/reference/canon/reggie_idle.png` | Katana-umbrella |
| Nobara Kugisaki | `nobara` | 160 cm | heavy | `assets/reference/canon/nobara_idle.png` | Hammer + nails in hand |
| Mei Mei | `meimei` | 190 cm* | heavy | `assets/reference/canon/meimei_idle.png` | Braided axe; braid needs bones |
| Maki Zen'in | `maki` | 170 cm | polearm | `assets/reference/canon/maki_idle.png` | Playful Cloud |
| Momo Nishimiya | `momo` | 150 cm | polearm | `assets/reference/canon/momo_idle.png` | Broom — also ridden; see her kit |
| Satoru Gojo | `gojo` | 190 cm | caster | `assets/reference/canon/gojo_idle.png` | Blindfold, not glasses (canon ref) |
| Megumi Fushiguro | `megumi` | 175 cm | caster | `assets/reference/canon/megumi_idle.png` | Shadow/shikigami are engine + summons |
| Toge Inumaki | `inumaki` | 164 cm | caster | `assets/reference/canon/inumaki_idle.png` | High collar; seal marks on tongue unseen |
| Kokichi Muta | `mechamaru` | 205 cm | caster | `assets/reference/canon/mechamaru_idle.png` | Puppet body; arm cannon |
| Yoshinobu Gakuganji | `gakuganji` | 190 cm* | caster | `assets/reference/canon/gakuganji_idle.png` | Guitar, slung and played |
| Suguru Geto | `geto` | 191 cm | caster | `assets/reference/canon/geto_idle.png` | Curse summons are engine-side |
| Jogo | `jogo` | 180 cm | caster | `assets/reference/canon/jogo_idle.png` | Volcano head is mesh, not particle |
| Panda | `panda` | 200 cm | bulk | `assets/reference/canon/panda_idle.png` | Core marking per round 2 ruling |
| Hanami | `hanami` | 220 cm | bulk | `assets/reference/canon/hanami_idle.png` | Canon Hanami: lean pale body, black brushstroke stripes, antler horns (round 17A). **+ `hanami_alt` material variant** — the earlier bark-and-foliage design |
| Dagon | `dagon` | 215 cm | bulk | `assets/reference/canon/dagon_idle.png` | Extra bones for the tendrils |
| Kurourushi | `kurourushi` | 190 cm* | bulk | `assets/reference/canon/kurourushi_idle.png` | The one nonstandard skeleton; bulk clips as reference only |
| Mahoraga | `mahoraga` | match in-game | bulk | `assets/reference/canon/mahoraga_canon.png` | Megumi's install actor (config_transform.js) |

## DI4 — Mouth sheets — optional, per fighter

**27 images, optional.** Nothing ships blocked on this: the neutral modelled mouth is the default, and a fighter with no sheet simply keeps it. The shared eye-highlight half of DI4 is delivered.

What each one is:

- A **4-cell strip — idle / hurt / ult-shout / win-grin** — matching that fighter's face-sheet style, 256×256 per cell.
- For the mouth texture-swap regions the D-spec lists in a rig's extras.

Deliver to:

```
assets/intake/render3d/<char>_mouth_sheet.png
```

Full round text: [DI4](../render3d/docs/image-requests.md#round-di4--shared-face-textures-one-time-roster-wide).

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Aoi Todo | `todo` | 190 cm | unarmed | `assets/reference/canon/todo_idle.png` | Grappler bulk in the shoulders |
| Yuki Tsukumo | `yuki` | 180 cm | unarmed | `assets/reference/canon/yuki_idle.png` | — |
| Takako Uro | `uro` | 190 cm* | unarmed | `assets/reference/canon/uro_idle.png` | Sky-palm effects are engine-side |
| Mahito | `mahito` | 179 cm | unarmed | `assets/reference/canon/mahito_idle.png` | Patchwork skin in the texture |
| Ryomen Sukuna | `sukuna` | 173 cm | unarmed | `assets/reference/canon/sukuna_idle.png` | Facial/body markings; no shawl (round 2 ruling) |
| Choso | `choso` | 181 cm | unarmed | `assets/reference/canon/choso_idle.png` | Blood effects are engine-side |
| Kinji Hakari | `hakari` | 185 cm | unarmed | `assets/reference/canon/hakari_idle.png` | Shutters are engine-side |
| Yuta Okkotsu | `yuta` | 175 cm | blade | `assets/reference/canon/yuta_idle.png` | Katana, sheathed at idle |
| Kento Nanami | `nanami` | 184 cm | blade | `assets/reference/canon/nanami_idle.png` | Wrapped blunt blade |
| Toji Fushiguro | `toji` | 187 cm | blade | `assets/reference/canon/toji_idle.png` | Spear + chain; inventory worm not modeled |
| Reggie Star | `reggie` | 190 cm* | blade | `assets/reference/canon/reggie_idle.png` | Katana-umbrella |
| Nobara Kugisaki | `nobara` | 160 cm | heavy | `assets/reference/canon/nobara_idle.png` | Hammer + nails in hand |
| Mei Mei | `meimei` | 190 cm* | heavy | `assets/reference/canon/meimei_idle.png` | Braided axe; braid needs bones |
| Maki Zen'in | `maki` | 170 cm | polearm | `assets/reference/canon/maki_idle.png` | Playful Cloud |
| Momo Nishimiya | `momo` | 150 cm | polearm | `assets/reference/canon/momo_idle.png` | Broom — also ridden; see her kit |
| Satoru Gojo | `gojo` | 190 cm | caster | `assets/reference/canon/gojo_idle.png` | Blindfold, not glasses (canon ref) |
| Megumi Fushiguro | `megumi` | 175 cm | caster | `assets/reference/canon/megumi_idle.png` | Shadow/shikigami are engine + summons |
| Toge Inumaki | `inumaki` | 164 cm | caster | `assets/reference/canon/inumaki_idle.png` | High collar; seal marks on tongue unseen |
| Kokichi Muta | `mechamaru` | 205 cm | caster | `assets/reference/canon/mechamaru_idle.png` | Puppet body; arm cannon |
| Yoshinobu Gakuganji | `gakuganji` | 190 cm* | caster | `assets/reference/canon/gakuganji_idle.png` | Guitar, slung and played |
| Suguru Geto | `geto` | 191 cm | caster | `assets/reference/canon/geto_idle.png` | Curse summons are engine-side |
| Jogo | `jogo` | 180 cm | caster | `assets/reference/canon/jogo_idle.png` | Volcano head is mesh, not particle |
| Panda | `panda` | 200 cm | bulk | `assets/reference/canon/panda_idle.png` | Core marking per round 2 ruling |
| Hanami | `hanami` | 220 cm | bulk | `assets/reference/canon/hanami_idle.png` | Canon Hanami: lean pale body, black brushstroke stripes, antler horns (round 17A). **+ `hanami_alt` material variant** — the earlier bark-and-foliage design |
| Dagon | `dagon` | 215 cm | bulk | `assets/reference/canon/dagon_idle.png` | Extra bones for the tendrils |
| Kurourushi | `kurourushi` | 190 cm* | bulk | `assets/reference/canon/kurourushi_idle.png` | The one nonstandard skeleton; bulk clips as reference only |
| Mahoraga | `mahoraga` | match in-game | bulk | `assets/reference/canon/mahoraga_canon.png` | Megumi's install actor (config_transform.js) |

---

## The character blocks

Used **verbatim** as `[CHARACTER BLOCK]` in the prompts above, exactly as the
2D rounds use them — this is how a fighter stays the same character across
their sprites, their card and their turnaround. Reproduced here from
[docs/asset-requests.md](asset-requests.md#character-blocks), which owns them.

**Where the block and the canon reference disagree, the reference wins.**
Every fighter now has a `<char>_idle.png` — regenerated from their approved
idle — and it carries the figure scale, palette and shading the delivered set
actually has, which the block text cannot. The wiki's (Anime) render answers
design questions the reference leaves open (what does Gakuganji's guitar look
like), and is where the blocks came from: three were rewritten in round 9E
because they described characters who looked nothing like their anime designs,
and Uro's again in round 18 after an ambiguous sentence was drawn the wrong
way twice. See [`assets/reference/canon/`](../assets/reference/canon/).

| Key | Block |
|---|---|
| `todo` | "Aoi Todo from Jujutsu Kaisen, very large muscular man with black hair in a short topknot and thick eyebrows, wearing a dark navy jacket over a maroon shirt with dark trousers" |
| `yuki` | "Yuki Tsukumo from Jujutsu Kaisen, tall athletic young woman with very long straight blonde hair falling past her waist with two tufts framing her face and brown eyes, wearing a sleeveless dark indigo mandarin-collar top with gold frog clasps at the shoulder, a grey buttoned corset belt at the waist, high-waisted light blue jeans and brown ankle boots" |
| `uro` | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a fierce confident grin, pale violet-pink hair sweeping upward and outward in wild flame-like curling points, sharp violet eyes with heavy dark eyeliner, large gold cylindrical drop earrings, a black choker and a black band on each wrist, her only covering **two separate bands of pale-cyan cloud vapour with soft drifting edges — one wrapped across the chest, one at the hips — with the midriff BARE between them and never a single garment joining the two**, bare arms and legs, barefoot with violet-painted nails" |
| `mahito` | "Mahito from Jujutsu Kaisen, slim young man with pale blue-grey patchwork skin covered in stitched seams, long grey-blue hair in a loose bun, dark sleeveless vest and dark trousers" |
| `sukuna` | "Ryomen Sukuna the King of Curses from Jujutsu Kaisen, bare-chested muscular man with spiky salmon-pink hair, four eyes, black tattoo band markings across his face, chest and arms, dark loose trousers with a black sash" |
| `choso` | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" |
| `hakari` | "Kinji Hakari from Jujutsu Kaisen, tall young man with slicked-back blond hair and an undercut, wearing a black school jacket hanging open over his bare chest, dark trousers" |
| `yuta` | "Yuta Okkotsu from Jujutsu Kaisen, slim young man with messy black hair, wearing an all-white long-sleeve school uniform with white trousers, a katana at his hip" |
| `nanami` | "Kento Nanami from Jujutsu Kaisen, tall blond man with a straight bob and tinted rectangular glasses, wearing a tan-beige suit with a patterned tie, carrying a blunt-tipped cleaver sword" |
| `toji` | "Toji Fushiguro from Jujutsu Kaisen, tall muscular man with short black hair and a vertical scar at the corner of his mouth, fitted black short-sleeve T-shirt and loose dark charcoal trousers with a dark sash" |
| `reggie` | "Reggie Star from Jujutsu Kaisen, tall lean man with straight shoulder-length blond hair parted at the side, heavy-lidded tired eyes and a narrow pointed chin beard, wearing a shaggy knee-length tunic and matching shoulder cape built from layered rows of torn white paper receipts with small pale mint-green printed tabs, bare arms and bare lower legs, barefoot" |
| `nobara` | "Nobara Kugisaki from Jujutsu Kaisen, young woman with short auburn-orange bob hair, navy school uniform dress with a belt, dark tights and brown boots, small hammer in hand" |
| `meimei` | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| `maki` | "Maki Zen'in from Jujutsu Kaisen, athletic young woman with dark green hair in a high ponytail and rectangular glasses, navy school uniform tunic over dark leggings, carrying a long naginata polearm" |
| `momo` | "Momo Nishimiya from Jujutsu Kaisen, petite young woman with shoulder-length auburn hair and a large dark witch hat, dark navy Kyoto uniform dress, riding or holding a wooden broom" |
| `gojo` | "Satoru Gojo from Jujutsu Kaisen, tall slim young man with spiky white hair and a black blindfold over his eyes, wearing a black high-collared jujutsu uniform with dark trousers and black boots" |
| `megumi` | "Megumi Fushiguro from Jujutsu Kaisen, young man with spiky black hair, wearing a dark navy high-collared jujutsu uniform with dark trousers and brown boots" |
| `inumaki` | "Toge Inumaki from Jujutsu Kaisen, slim young man with light grey-blond hair, wearing a dark navy high-collared school uniform zipped up over his mouth, white sneakers" |
| `mechamaru` | "Ultimate Mechamaru from Jujutsu Kaisen, a tall humanoid cursed-corpse puppet with a smooth clay-brown carved head, two round glowing green lens eyes and a small third lens on the forehead, a fixed grin of bared square teeth, a thick white puffy scarf around the neck, wearing a dark navy high-collared jujutsu uniform tunic with a white sash and very wide baggy navy trousers, bare carved wooden hands and bare wooden feet" |
| `gakuganji` | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern hunched elderly man, bald on top with long straight white hair falling past his shoulders at the sides, a long thin white beard and drooping moustache, deeply wrinkled face with hooded eyes and gold hoop earrings, wearing a cream-white kimono top under a black band T-shirt with the kimono sleeves hanging loose, wide dark-purple hakama trousers, white tabi socks and wooden geta sandals, a crimson-red Flying-V electric guitar slung across his chest on a strap" |
| `geto` | "Suguru Geto from Jujutsu Kaisen, tall man with long black hair in a topknot, wearing a black traditional robe with gold trim over dark clothing" |
| `jogo` | "Jogo from Jujutsu Kaisen, a volcano-headed cursed spirit with a single large eye, cracked earthen skin, wearing a yellow-and-black spotted fur mantle over dark trousers" |
| `panda` | "Panda from Jujutsu Kaisen, a large anthropomorphic panda with black and white fur, muscular build, a small teal cursed-energy core visible on his shoulder" |
| `hanami` | "Hanami from Jujutsu Kaisen, tall powerfully built cursed spirit with a lean muscular pale bone-cream body marked by thick black brushstroke stripes down the face, arms, chest and abdomen, a rigid mask-like face with hollow black eye sockets, pale slit pupils and a wide fixed grin of large square teeth, a crown of thick tan antler horns curving up and back over the scalp, the entire right shoulder and arm wrapped in heavy white cloth bound close to the body with stitched seams where it meets the chest, a white cloth sash knotted at the waist with the ends hanging, wide baggy black hakama trousers gathered at the ankles, barefoot with broad clawed feet and long dark claws on both hands" |
| `dagon` | "Dagon from Jujutsu Kaisen, a tall broad hunched humanoid cursed spirit with deep red outer limbs and a tan inner chest and belly, a black midsection, a smooth red octopus-like head with blank pale eyes and a beard of thick red tentacles hanging from the jaw, black bat-like wings folded at the lower back, four heavy clawed fingers per hand and broad two-toed feet" |
| `kurourushi` | "Kurourushi from Jujutsu Kaisen, a tall cockroach cursed spirit draped head to floor in a smooth glossy black shroud, a maroon insect face with eight red-and-orange eyes in uneven pairs and a wide grin of human teeth behind layered jaws, six very long thin purple antennae sweeping out from the head, dark chitinous insect legs splayed out at the base of the shroud, wielding a long dark cursed sword with six firing barrels along its spine" |
| `mahoraga` | "Mahoraga from Jujutsu Kaisen, the Divine General shikigami — a towering pale-white humanoid with grey sculpted musculature, a long segmented tail, and a fanned crest of white blade-like spines sweeping back from his head. **A brass eight-spoked karma wheel is mounted on the headdress behind his skull, with a ball at the end of each spoke** — it is part of his head and turns with it. Bandaged wrap and beads at the throat, a torn dark charcoal skirt over a pale sash, purple-grey wraps at wrists and ankles, barefoot, carrying a long pale bone-textured sword" |

---

## 2D sprites — the other half of the question

**Nothing outstanding.** No pose carries a replacement flag, and no pose is
drawing a file that is not its own — the two halves that between them
define an outstanding sprite. Improvement requests are listed below and are
repo work rather than art anybody owes us.

Separately, **2 improvement requests** — the art works and is
just not as good as it should be. Nothing is blocked by one, and the two
standing ones (`hakari/dodge_air`, `toji/dodge_air`) are alpha fixes to
delivered files, which is repo work and not a request.
