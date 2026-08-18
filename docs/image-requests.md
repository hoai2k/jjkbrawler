# Image Requests — every image still to draw

**This is the one image-request document.** Every render mode's requests are
here, in their own section, whatever pipeline they feed. If you are drawing
or generating anything 2D for this project, this file is the list, and the
per-mode documents point here rather than keeping their own.

**It is generated** by `node tools/build_image_requests.mjs` from the
documents that author each round, plus the manifests and the files on disk.
Do not edit it; edit the source round and re-run. `--check` fails when it is
stale, and also when a source has an open round the tool did not recognise —
that second one is the guard, because a round written in an unexpected shape
is exactly how 172 images once went missing from this list.

**232 images outstanding.**

- **The sprite game** — 204 images, round 22
- **The live-3D anime path** — 28 images

## Rules that hold everywhere here

- **The canon reference is the subject.** A fighter's own `<char>_idle.png`
  under `assets/reference/canon/` carries their costume, proportions, palette,
  line weight and shading. The drawing is that character, not an
  interpretation of them.
- **The character block goes in the prompt verbatim.** All of them are at the
  bottom of this file.
- **Any subset is useful.** Everything here lands per fighter or per file, and
  anything undelivered keeps whatever the engine does today. Nothing in this
  file blocks play.

**The modes want opposite deliveries, and it is the one thing worth not
getting wrong.** Sprite rounds are keyed plates — flat magenta `#FF00FF` or
grey `#808080` screen, one subject, margin on all four sides, trimmed at
intake. The 3D inputs are the reverse: a turnaround wants clean white or
transparency, a swatch sheet wants labels, and nothing about them is keyed or
trimmed. Applying either mode's rules to the other produces a file its
pipeline cannot use. Each section states its own.

---

# The sprite game

Art for the game as a player sees it: `?render=sprite`, the default, and
the path all 27 fighters actually ship on. Keyed plates, delivered to
`assets/intake/`, trimmed and measured on import.

**204 images, round 22.** Authored in
[docs/asset-requests.md](asset-requests.md) and reproduced whole below.

- **22A** — Balanced on the lip: the teeter (27 sprites)
- **22E** — Round 23 technique effects (6 sprites)
- **22F** — Yaga's doll family summons (4 sprites)
- **22G** — Hero cards for the staged three (3 images)
- **22H** — Naoya's domain background (1 image)
- **22I** — Three frames the round-22 boards rejected (3 sprites)
- **23A** — Kirara's sprite set (36 sprites)
- **23B** — Haruta's sprite set (36 sprites)
- **23C** — Tengen's sprite set (36 sprites)
- **23D** — Miwa's sprite set (36 sprites)
- **23E** — Round 24 technique effects (7 sprites)
- **23F** — Tengen's pure barrier (1 sprite)
- **23G** — Hero cards for the staged four (4 images)
- **20E** — Yuji's four Round 20 poses (4 sprites)

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

## 22E. Round 23 technique effects — 6 sprites

Effect plates for the staged kits, spec per
[Delivery spec](asset-requests.md#delivery-spec) and pointing **LEFT** where directional
(see [Directional effects point LEFT](asset-requests.md#directional-effects-point-left)). The
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

## 22I. Three frames the round-22 boards rejected — 3 sprites

The three faults found reviewing 22B–22D. Everything else in that delivery is
in the game; these three are in it too, drawing what was delivered, and flagged
in the workbench so they are visible while they wait. Same character blocks,
same key screens, same delivery paths as the sets they belong to.

| File | Fighter | What is wrong, and what to draw |
|---|---|---|
| `kashimo/special_side.png` | Kashimo | **Costume, not pose.** The action is right — the staff has already left his hand and the throwing arm is extended, which is exactly Nyoi Recall. But the costume drifts from his own `idle_a`: he is wearing **black boots and a navy waist sash**, and the **white knee-to-ankle bandage wraps are missing**. Redraw the same pose with the pale grey ankle boots, the leg wraps, and no sash — match `kashimo/idle_a.png`, which is now his canonical reference |
| `yaga/crouch_a.png` | Yaga | **A fighting stance, not a crouch.** Knees barely bent, head dropping about a tenth of standing height where the brief asks for a quarter. Draw an actual crouch: hips down, head low, weight settled — `naoya/crouch_a.png` from the same delivery is what it should read like |
| `yaga/crouch_b.png` | Yaga | Same fault, same fix. It is currently the wider half of one guard stance rather than the second beat of a crouch; it must also read as *lower than standing*, which it does not |

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

**Work idle-first — the `idle_a` is its own delivery.** Generate each
fighter's `idle_a` alone first (plain, square-on stance per
[pose-brief.md](../sprites/docs/pose-brief.md)); intake and approve it in the
sprite workbench; run `tools/build_canon_reference.py`; then generate the
other 35 poses **against that approved idle**, so costume, proportions,
palette, line weight and shading stay locked across the set. Once the idles
land on `main` they resolve at:

- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/kirara_idle.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/haruta_idle.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/tengen_idle.png>
- <https://raw.githubusercontent.com/hoai2k/jjkbrawler/main/assets/reference/canon/miwa_idle.png>

## 23A. Kirara's sprite set — 36 sprites

The standard 36-pose semantic set ([pose-brief.md](../sprites/docs/pose-brief.md)
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

Effect plates for the staged kits, spec per [Delivery spec](asset-requests.md#delivery-spec),
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
landed as [20E](asset-requests.md#20e-yujis-four-round-20-poses--4-sprites) and are in the game:
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
- **~~Yuji's four~~** — [20E](asset-requests.md#20e-yujis-four-round-20-poses--4-sprites),
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

---

# The live-3D anime path

2D images the `?render=3d` pipeline consumes: inputs that models are
GENERATED from, and textures the anime pass reads at runtime. They serve
`?render=billboard` too, which reads the same rigs. These are NOT keyed
plates — each round states its own delivery.

**28 images.** Authored in
[render3d/docs/image-requests.md](../render3d/docs/image-requests.md) and reproduced whole below.

- **DI1** — model-generation turnaround boards (the Tripo inputs) (7 images)
- **DI2** — face sheets (the face-first gate's reference) (7 images)
- **DI3** — shade palette swatches (7 images)
- **DI4** — shared face textures (7 images)
- **DI5** — regeneration seeds (0 images)

## Round DI1 — model-generation turnaround boards (the Tripo inputs)

One board per fighter being modelled in the current D-round, sized for
image-to-3D seeding: **a single 2048×1024+ PNG, clean white or transparent
background**, containing the fighter in a neutral standing pose from
**front, 3/4-front, side, and back** at consistent scale and eye-line, flat
colors from the canon palette, **no dramatic lighting, no perspective, no
overlapping limbs** (arms slightly away from the body — near-A-pose reads
best for reconstruction). Face visible and on-model in the front view; the
back view must answer every question the sprites never had to (hair back,
uniform back, prop stowage).

A first-draft board can be composited from existing art:
`python tools/build_model_reference.py <char>` assembles the canon reference
plus the fighter's key sprites into a labelled board at
`render3d/docs/reference/<char>_board.png`. That composite is a brief for a
human or a seed for generation — **the request here is for the drawn
turnaround**, because sprites only ever show the one ¾ view and mirror the
rest, which is exactly what a 3D model cannot be built from.

**THE WHOLE FIGURE MUST FIT, WITH MARGIN.** Every view complete inside the
canvas — the crown of the head, any horns, hair or headgear, and the feet — with
clear white on all four sides. Twelve of the first twenty boards were refused
for exactly this: the figures were scaled to fill the frame and the tops of
their heads went off it, which on a model-generation seed is the one thing that
cannot be worked around. A smaller figure with air around it beats a large one
that is cut. `tools/import_render3d_images.py` measures this at import and
refuses a board whose head runs off the edge.

**Deliverable: 1 board per fighter.** Twelve are outstanding — the list is in
the refusal note above, and in
[docs/image-requests.md](../docs/image-requests.md), which resolves it
against what is on disk.

### DI1: who is still owed one — 7 of 35

A fighter whose rig has already been delivered is NOT listed: a turnaround board's only job is to be the thing a model is generated from, and theirs exists.

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Hajime Kashimo | `kashimo` | 185 cm | polearm | `assets/reference/canon/kashimo_idle.png` | Nyoi staff (red shaft, gold caps); lightning is engine-side |
| Masamichi Yaga | `yaga` | 188 cm | unarmed | `assets/reference/canon/yaga_idle.png` | Sunglasses never come off; dolls are summons, engine-side |
| Naoya Zen'in | `naoya` | 181 cm | unarmed | `assets/reference/canon/naoya_idle.png` | Kimono-over-hakama needs cloth bones; spirit form is an effect plate, not a rig |
| Kirara Hoshi | `kirara` | 172 cm | unarmed | `assets/reference/canon/kirara_anime.png` | Star-pupil eyes in the face texture; marks/repulsion are engine-side |
| Haruta Shigemo | `haruta` | 168 cm | blade | `assets/reference/canon/haruta_anime.png` | The Hand Sword's sculpted-hand hilt is part of the prop |
| Master Tengen | `tengen` | 175 cm | caster | `assets/reference/canon/tengen_anime.png` | Cylindrical four-eyed head is bespoke geometry on a standard body; floor-length robe wants cloth bones |
| Kasumi Miwa | `miwa` | 162 cm | blade | `assets/reference/canon/miwa_anime.png` | Katana + scabbard; sheathed at idle, and the draw is the kit |

## Round DI2 — face sheets (the face-first gate's reference)

AI-generated meshes fail at faces first (plan §9), and the workbench's
sweeping-light check needs something to judge AGAINST. Per fighter: one
sheet, front + ¾ + profile of the **head only**, at least 512px per view,
canon palette, neutral expression — the drawn truth of the jawline, the eye
shapes, the hair clumping and parting side. Hair clump direction matters:
the modeller combs the normals along it (D-spec addition 3).

**Deliverable: 1 sheet per fighter, same gating as DI1.**

### DI2: who is still owed one — 7 of 35

Listed for delivered rigs too — this is what the face-first review gate reads AGAINST, so it is wanted whether or not the model exists.

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Hajime Kashimo | `kashimo` | 185 cm | polearm | `assets/reference/canon/kashimo_idle.png` | Nyoi staff (red shaft, gold caps); lightning is engine-side |
| Masamichi Yaga | `yaga` | 188 cm | unarmed | `assets/reference/canon/yaga_idle.png` | Sunglasses never come off; dolls are summons, engine-side |
| Naoya Zen'in | `naoya` | 181 cm | unarmed | `assets/reference/canon/naoya_idle.png` | Kimono-over-hakama needs cloth bones; spirit form is an effect plate, not a rig |
| Kirara Hoshi | `kirara` | 172 cm | unarmed | `assets/reference/canon/kirara_anime.png` | Star-pupil eyes in the face texture; marks/repulsion are engine-side |
| Haruta Shigemo | `haruta` | 168 cm | blade | `assets/reference/canon/haruta_anime.png` | The Hand Sword's sculpted-hand hilt is part of the prop |
| Master Tengen | `tengen` | 175 cm | caster | `assets/reference/canon/tengen_anime.png` | Cylindrical four-eyed head is bespoke geometry on a standard body; floor-length robe wants cloth bones |
| Kasumi Miwa | `miwa` | 162 cm | blade | `assets/reference/canon/miwa_anime.png` | Katana + scabbard; sheathed at idle, and the draw is the kit |

## Round DI3 — shade palette swatches

The two-band ramp paints shadows from a palette, not from darkness
(render3d/src/toon.js `shadeTint`, overridable per material). Per fighter:
one small swatch sheet pairing each major material region (skin, hair,
uniform top, uniform bottom, props) with its **lit fill and its painted
shadow color**, taken from or consistent with the fighter's own sprite
shading. This is a color decision, not a texture: the numbers land in the
.glb's material extras (or the manifest's `toon` block) at intake, and the
sheet is what review holds them against.

**Deliverable: 1 swatch sheet per fighter, same gating as DI1. Format free —
a labelled PNG grid is fine.**

### DI3: who is still owed one — 7 of 35

Listed for delivered rigs too: these numbers land in the rig's material extras at intake, and not one delivered rig carries a `toon` block today — all of them are running on engine defaults.

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Hajime Kashimo | `kashimo` | 185 cm | polearm | `assets/reference/canon/kashimo_idle.png` | Nyoi staff (red shaft, gold caps); lightning is engine-side |
| Masamichi Yaga | `yaga` | 188 cm | unarmed | `assets/reference/canon/yaga_idle.png` | Sunglasses never come off; dolls are summons, engine-side |
| Naoya Zen'in | `naoya` | 181 cm | unarmed | `assets/reference/canon/naoya_idle.png` | Kimono-over-hakama needs cloth bones; spirit form is an effect plate, not a rig |
| Kirara Hoshi | `kirara` | 172 cm | unarmed | `assets/reference/canon/kirara_anime.png` | Star-pupil eyes in the face texture; marks/repulsion are engine-side |
| Haruta Shigemo | `haruta` | 168 cm | blade | `assets/reference/canon/haruta_anime.png` | The Hand Sword's sculpted-hand hilt is part of the prop |
| Master Tengen | `tengen` | 175 cm | caster | `assets/reference/canon/tengen_anime.png` | Cylindrical four-eyed head is bespoke geometry on a standard body; floor-length robe wants cloth bones |
| Kasumi Miwa | `miwa` | 162 cm | blade | `assets/reference/canon/miwa_anime.png` | Katana + scabbard; sheathed at idle, and the draw is the kit |

## Round DI4 — shared face textures *(one-time, roster-wide)*

The eyes-and-face rules (plan §4) run on small shared textures rather than
per-fighter art:

- `eye_highlight.png` — the camera-facing catchlight sprite: soft-edged
  white/near-white shapes on transparency, 128×128, one primary highlight +
  one small secondary. One texture serves the roster; per-fighter tinting is
  engine-side.
- `<char>_mouth_sheet.png` *(optional, per fighter, unblocking)* — a 4-cell
  strip (idle / hurt / ult-shout / win-grin) matching the fighter's face
  sheet style, 256×256 per cell, for the mouth texture-swap regions the
  D-spec lists in extras. No fighter ships blocked on this; the neutral
  modelled mouth is the default.

**Deliverable: 1 shared highlight texture now; mouth sheets ride whichever
D-round their fighter ships in.**

### DI4: who is still owed one — 7 of 35

The shared eye-highlight texture is delivered; these are the optional per-fighter mouth sheets. Nothing ships blocked on one.

| Fighter | Key | Model at | Archetype | Canon reference | Notes |
|---|---|---|---|---|---|
| Hajime Kashimo | `kashimo` | 185 cm | polearm | `assets/reference/canon/kashimo_idle.png` | Nyoi staff (red shaft, gold caps); lightning is engine-side |
| Masamichi Yaga | `yaga` | 188 cm | unarmed | `assets/reference/canon/yaga_idle.png` | Sunglasses never come off; dolls are summons, engine-side |
| Naoya Zen'in | `naoya` | 181 cm | unarmed | `assets/reference/canon/naoya_idle.png` | Kimono-over-hakama needs cloth bones; spirit form is an effect plate, not a rig |
| Kirara Hoshi | `kirara` | 172 cm | unarmed | `assets/reference/canon/kirara_anime.png` | Star-pupil eyes in the face texture; marks/repulsion are engine-side |
| Haruta Shigemo | `haruta` | 168 cm | blade | `assets/reference/canon/haruta_anime.png` | The Hand Sword's sculpted-hand hilt is part of the prop |
| Master Tengen | `tengen` | 175 cm | caster | `assets/reference/canon/tengen_anime.png` | Cylindrical four-eyed head is bespoke geometry on a standard body; floor-length robe wants cloth bones |
| Kasumi Miwa | `miwa` | 162 cm | blade | `assets/reference/canon/miwa_anime.png` | Katana + scabbard; sheathed at idle, and the draw is the kit |

## Round DI5 — regeneration seeds *(delivered — read the verdict before generating)*

**All nine landed and all nine pass**: five turnaround boards (`gakuganji`,
`maki`, `meimei`, `momo`, `uro`) and four weapon plates (everyone but Uro, who
carries none). The edge check refused nothing and warned about nothing — the
crowns, the hat tips and the feet are all inside the canvas with margin, which
is the fault that produced Mei Mei's horns.

Checked by eye against every rule below:

| | Verdict |
|---|---|
| Crown and feet in frame | **yes**, all five, with margin — Momo's hat tips included |
| Weapons out of the boards | **yes** — all four are drawn empty-handed |
| Weapon plates | **yes** — broom, polearm, axe, guitar, four views each, alone on white |
| Daylight between the legs | **yes** on Maki and Uro; Momo and Mei Mei stand closer but keep a gap; Gakuganji's legs are inside hakama at any pose |
| Hanging hair drawn along its length | **yes** — Mei Mei's braid reads as its own shape in the side and back views, which is what the chain extraction needs |

**Two notes to weigh before spending credits, neither a blocker:**

1. **Arms hang at the sides rather than in an A-pose.** DI1 asks for them
   slightly away from the body and these are closer than that — wrists near
   the hips on Maki, Momo and Mei Mei. The roster's existing models were
   generated from boards drawn the same way and their arms measure fine
   (0.80–0.99 balance for twenty of them), so this is a known-survivable
   deviation rather than a repeat of the fusion fault. It is also the most
   likely explanation for the three fighters that measure 0.55–0.71.

2. **Hands are relaxed-open, not curled.** The hand is a single bone and
   cannot close later, so a weapon joined to a flat palm reads as passing
   through it. Mei Mei's axe and Maki's polearm are the ones this shows on.
   Worth a redraw of the hands ONLY if the joined result looks wrong — which
   is now a thing that can be checked in an afternoon rather than guessed at,
   because the join is arithmetic.

**Uro's crown flag was partly the metric's fault.** Her board makes it plain
that the hair standing 29% of her stature above her head is her design, not
generated damage. Her legs at 55% of a normal leg still stand, and so does the
scale the Idle Review kept fighting.

### DI5: who is still owed one — 0 of 35

Named by MEASUREMENT, not by eye: tools/audit_model_health.py weighs the mesh bound to each limb against the roster's median and reports what cannot be true of a body. A fighter leaves this list when a replacement board lands — not when their model is regenerated, since regenerating from the same board is what produced the fault.

**Nothing outstanding.** Every fighter has one.

---

# The character blocks

Used **verbatim** as `[CHARACTER BLOCK]` in every prompt above — this is how
a fighter stays the same character across their sprites, their card and
their turnaround. Reproduced from
[asset-requests.md](asset-requests.md#character-blocks), which owns them.

**Where the block and the canon reference disagree, the reference wins.**
Every fighter now has a `<char>_idle.png`, regenerated from their approved
idle, and it carries the figure scale, palette and shading the delivered set
actually has — which block text cannot. The wiki's (Anime) render answers
design questions the reference leaves open, and is where the blocks came
from: three were rewritten in round 9E because they described characters who
looked nothing like their anime designs, and Uro's again in round 18 after an
ambiguous sentence was drawn the wrong way twice.

| Key | Block |
|---|---|
| `yuji` | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" |
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
| `kashimo` | "Hajime Kashimo from Jujutsu Kaisen, tall lean young man with shaggy mint-green hair sticking out in tufts and two horn-like coiled locks rising from the top of his head, sharp green eyes with a short zig-zag lightning marking under each eye, wearing a loose all-white high-collared padded robe with puffed sleeves gathered at the elbow, white bandage wraps on both forearms, loose white trousers wrapped in white bandages from knee to ankle, pale grey ankle boots, carrying a long red staff with gold caps and a gold ball finial" |
| `yaga` | "Masamichi Yaga from Jujutsu Kaisen, tall broad heavily built middle-aged man with tan skin, dark brown hair in a short spiked crop with shaved sides, a chinstrap beard and moustache, small dark oval sunglasses always covering his eyes, wearing a plain black zip-up high-collared jacket, black trousers and black dress shoes" |
| `naoya` | "Naoya Zen'in from Jujutsu Kaisen, tall slim young man with short olive-blond hair with darker roots swept to one side, narrow brown eyes and a permanent smug smirk, small earrings on his left ear, wearing a white band-collar shirt under a dark teal kimono jacket, a pale grey pleated hakama tied at the waist, dark tabi socks and zōri sandals" |
| `kirara` | "Kirara Hoshi from Jujutsu Kaisen, a slender young person with long black hair past the shoulders, blunt-cut bangs with the right section dyed cyan and two flat face-framing strands, large purple eyes with yellow star-shaped pupils, two beauty marks by the mouth, a black studded choker, an off-shoulder cream ribbed crop top over magenta camisole straps with a bare midriff, a doubled red-brown belt with a gold star buckle, black flared trousers cropped above the ankle, magenta socks and black lace-up ankle boots, black painted nails" |
| `haruta` | "Haruta Shigemo from Jujutsu Kaisen, a short lean young man with slicked blond hair pulled into a long side ponytail tied on the left, thin eyebrows, drooping purple eyes with a lilac teardrop marking under each eye, a faint smug pout, bare-chested under a black one-shoulder jumpsuit with loose trousers gathered at the calves, a pale lilac glove on his sword hand, brown loafers worn barefoot, carrying a single-edged sword whose hilt is a sculpted human hand" |
| `tengen` | "Master Tengen from Jujutsu Kaisen, an inhuman robed figure with a tall smooth cylindrical hairless head, four narrow eyes stacked in two pairs down the face, a small stern mouth, pale grey-white skin, draped floor-length grey-white layered robes with a cowled folded neck and wide sleeves, long-fingered pale hands held open at the sides, bare feet with long toes" |
| `miwa` | "Kasumi Miwa from Jujutsu Kaisen, a young woman with long light-blue hair falling past her shoulders with blunt bangs, dark blue eyes and an earnest expression, wearing the dark navy Kyoto Jujutsu High uniform — a fitted suit-style jacket over a white collared shirt and navy tie, matching navy trousers, brown loafers — with a katana in a brown scabbard at her hip" |

---

# Outstanding by manifest, not by request

The other half of the question, and a narrower one: poses whose art EXISTS
and is wrong. A workbench flag says so directly; a pose drawing a file that
is not its own says so silently, which is how seven of them stayed invisible
until round 18G. Neither can see a pose that was never drawn — that is what
the rounds above are for.

**10 flagged, 20 drawing somebody else's art.**

| Fighter | Pose | Why |
|---|---|---|
| mahito | `attack_light_a` | quality |
| uro | `attack_light_b` | quality |
| dagon | `attack_light_a` | pose |
| dagon | `crouch_attack_b` | pose |
| dagon | `crouch_b` | pose |
| dagon | `run_reach_a` | pose |
| dagon | `run_reach_b` | pose |
| yaga | `crouch_a` | pose |
| yaga | `crouch_b` | pose |
| kashimo | `special_side` | character |
| hanami | `attack_light_b` | drawing `special_neutral` |
| sukuna | `attack_light_b` | drawing `r3c0` |
| megumi | `attack_light_a` | drawing `crouch_a_2` |
| yuta | `attack_heavy_b` | drawing `attack_dash` |
| yuta | `attack_light_a` | drawing `attack_air_a` |
| yuta | `attack_light_b` | drawing `attack_air_b` |
| nobara | `attack_heavy_b` | drawing `crouch_attack_b` |
| nobara | `attack_light_a` | drawing `crouch_b_2` |
| nobara | `attack_light_b` | drawing `specialNeutral` |
| nobara | `crouch_attack_b` | drawing `attack_dash` |
| inumaki | `attack_light_a` | drawing `crouch_a_2` |
| uro | `attack_light_a` | drawing `attack_heavy_a_3` |
| uro | `attack_light_b` | drawing `attack_light_a` |
| yuji | `attack_light_a` | drawing `guard` |
| reggie | `attack_light_a` | drawing `attack_heavy_a_2` |
| yuki | `attack_heavy_b` | drawing `ult_b` |
| kurourushi | `attack_heavy_b` | drawing `attack_light_b` |
| kurourushi | `attack_light_b` | drawing `attack_air_b_2` |
| kurourushi | `crouch_attack_b` | drawing `dash_2` |
| kurourushi | `dash` | drawing `dodge_roll_2` |

Separately, **2 improvement requests** — the art works and is just
not as good as it should be. Nothing is blocked by one, and the standing
ones are alpha fixes to delivered files, which is repo work rather than a
request.
