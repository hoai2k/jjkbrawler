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

**273 images outstanding.**

- **The sprite game** — 172 images, round 20
- **The live-3D anime path** — 101 images

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

**172 images, round 20.** Authored in
[docs/asset-requests.md](asset-requests.md) and reproduced whole below.

- **20A** — Summon plates that are contact sheets (44 sprites)
- **20B** — Twenty backgrounds, re-extended from the paintings they replaced (20 images)
- **20C** — The grab poses (81 sprites)
- **20D** — The dash attack pose (27 sprites)

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
[canonical reference](asset-requests.md#the-canonical-reference-image--one-per-fighter) rule
applies as always.

**The 2.5D/3D side of the same mechanic is aliased, not owed:** the rig states
`grabReach`, `grabHold`, `grabbed` and the four throws currently play the
`light` / `charge` / `hurt` / heavy clips (`STATE_ALIASES` in
`billboards/src/states.js`). Bespoke grab clips would be a B-/D-round request
if the mechanic graduates from its flag; nothing is asked of the model tracks
yet.

---

## 20D. The dash attack pose — 27 sprites

**A pose the roster has never had, for two attacks it did not have until now.**
Attacking out of a dash or a sprint throws a **dash attack** — light for the
lunge, heavy for the running shoulder-charge (see §4 of
[game-mechanics.md](game-mechanics.md)). Both are in the game and both are
correct in every way except what they look like: they draw the fighter's
standing strike, because that is the only attack art there is. A committed
forward lunge drawn as a jab thrown on the spot reads as a fighter sliding
along the floor while punching the air in front of them.

**Nothing is waiting on this.** `dashAttack` and `dashAttackHeavy` already name
`attack_dash` in `src/characters.js`, with the strike each move draws today as
their `fallback`. So a fighter with no dash pose keeps exactly the drawing they
have now, a fighter who gets one starts using it the moment the manifest knows
about it, and **the delivery can land one fighter at a time** with no code
change at any point.

### The two attacks, so the pose can be drawn to fit both

One drawing serves both dash attacks. That is deliberate — it is the same
motion at two weights, and asking for two poses would double a round to buy a
distinction a player reads from the hit, not the frame.

| | Light, running | Heavy, running |
|---|---|---|
| Reads as | a lunging strike carried by the run | the same lunge, thrown with everything |
| Active | 0.13 s | 0.15 s |
| Recovery | ~1.7× the side tilt's | ~1.4× the side smash's |

So the drawing wants to be the **committed** end of that range: it stands in
for a smash-weight blow as well as a quick one, and a pose that reads as a
light poke will look weak on the heavy version. When in doubt, draw the heavy.

### What the pose has to show

Read [pose-brief.md](../sprites/docs/pose-brief.md) first — it is the standing
brief for every sprite, and this pose is measured by the same four criteria.
On top of it, this one specifically:

- **Weight ahead of the lead foot.** The whole point is momentum: the body is
  travelling and the strike is going with it. A dash attack drawn balanced over
  the hips is a tilt.
- **No wind-up.** The run WAS the wind-up. This is a single held pose, not the
  `_a`/`_b` wind-up-then-strike pair the light and heavy attacks use — draw the
  moment of the blow, arm or weapon already extended along the line of travel.
- **Low and driving**, not upright: shoulder or hip leading, back leg extended
  behind, the trailing arm counterweighting. A shoulder-charge silhouette reads
  at game size where a punch does not.
- **The character's own weapon.** Whoever fights with something leads with it
  — Maki's naginata levelled along the run, Nanami's cleaver driving forward,
  Mei Mei's axe carried low, Gakuganji's guitar swung through. A weapon
  character drawn throwing a shoulder is a different fighter.
- **Facing RIGHT**, one zoom per character (this pose at the same figure scale
  as the rest of their set — it is the criterion that costs the most to fix
  later), flat key screen per the [delivery spec](asset-requests.md#delivery-spec) above, at
  least 600 px of body.

Prompt formula, as always: `[CHARACTER BLOCK]` (the table above — use it
verbatim), the pose line, facing right, `[STYLE SUFFIX]`.

> **Pose line:** "sprinting forward and striking at the same moment, body low
> and driving, weight thrown ahead of the leading foot, back leg extended
> behind, striking arm or weapon fully extended forward along the direction of
> the run, trailing arm swept back, at the instant of impact"

### The canonical reference is their own `idle_a`

Same rule as every other request in this file (see
[above](asset-requests.md#the-canonical-reference-image--one-per-fighter)): open the fighter's
`idle_a` and match its costume, proportions, palette, line weight and shading.
Hanami and Mahoraga are the two exceptions the table there records, and they
are exceptions here too.

### Delivery, and how the old drawing is kept

`assets/intake/<character>/attack_dash.png` — one file per fighter, 27 in all
(`CHARACTER_KEYS`). Standard intake: `tools/intake.py` keys and measures it,
`tools/intake_sheets.py` boards it for approval, `tools/intake_import.py
--approve` registers it in `manifest.json`, then it is placed in the sprite
workbench like any other pose.

**The current art stays, in both of the ways this repo keeps art:**

1. **In code, as the fallback.** `attack_dash` is a NEW pose key, so nothing is
   replaced and nothing is overwritten. The light and heavy strikes stay
   exactly where they are, still drawn by their own attacks, and still standing
   in for the dash attacks of every fighter whose pose has not landed or has
   been rejected. Delete a delivered `attack_dash` and the game is back to
   today's look with no other edit.
2. **In the manifest, as a banked variant.** A second drawing of the pose banks
   beside the first rather than replacing it — the workbench's **`alternate`**
   kind (`ALTERNATE_KIND` in `sprites/src/sprites.js`, routed by
   `tools/intake_variants.py`), the same mechanism that lets a pose keep an
   older drawing selectable after a redraw. So if a delivered dash pose turns
   out worse than the strike it replaced for some fighter, that is a click in
   the workbench, not a re-request.

### Checked on delivery

Per sprite: it is the same character at the same figure scale as their
`idle_a`; the body is travelling rather than planted; nothing is clipped at
the canvas edge; the key screen is flat and has not bounced colour into hair or
cloth. `python3 tools/check_summon_plates.py` does not apply here — that is
creature art — but the same fault is worth a glance: one figure per file.

### Not part of this round: the 3D clips

The 2.5D billboard path and the live-3D path both know these two states now,
and both **alias** them to the strike clips they already have (`STATE_ALIASES`
in `billboards/src/states.js`, beside the grab states 20C describes) exactly as
the sprites fall back. A bespoke pair of
dash-attack clips is a billboard round (B-numbers) if anyone wants one; it is
not a hole in the roster today, and no rig is missing anything because of it.

---

# The live-3D anime path

2D images the `?render=3d` pipeline consumes: inputs that models are
GENERATED from, and textures the anime pass reads at runtime. They serve
`?render=billboard` too, which reads the same rigs. These are NOT keyed
plates — each round states its own delivery.

**101 images.** Authored in
[render3d/docs/image-requests.md](../render3d/docs/image-requests.md) and reproduced whole below.

- **DI1** — model-generation turnaround boards (the Tripo inputs) (20 images)
- **DI2** — face sheets (the face-first gate's reference) (27 images)
- **DI3** — shade palette swatches (27 images)
- **DI4** — shared face textures (27 images)

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

**Deliverable: 1 board per fighter, gated to the fighters the open D-round
names** (D1: `yuji_turnaround.png` only).

### DI1: who is still owed one — 20 of 28

A fighter whose rig has already been delivered is NOT listed: a turnaround board's only job is to be the thing a model is generated from, and theirs exists.

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

## Round DI2 — face sheets (the face-first gate's reference)

AI-generated meshes fail at faces first (plan §9), and the workbench's
sweeping-light check needs something to judge AGAINST. Per fighter: one
sheet, front + ¾ + profile of the **head only**, at least 512px per view,
canon palette, neutral expression — the drawn truth of the jawline, the eye
shapes, the hair clumping and parting side. Hair clump direction matters:
the modeller combs the normals along it (D-spec addition 3).

**Deliverable: 1 sheet per fighter, same gating as DI1.**

### DI2: who is still owed one — 27 of 28

Listed for delivered rigs too — this is what the face-first review gate reads AGAINST, so it is wanted whether or not the model exists.

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
| Hanami | `hanami` | 220 cm | bulk | `assets/reference/canon/hanami_idle.png` | Canon Hanami: lean pale body, black brushstroke stripes, antler horns, one shoulder wrapped in white cloth (round 17A). The tree design is retired — no `hanami_alt` variant |
| Dagon | `dagon` | 215 cm | bulk | `assets/reference/canon/dagon_idle.png` | Extra bones for the tendrils |
| Kurourushi | `kurourushi` | 190 cm* | bulk | `assets/reference/canon/kurourushi_idle.png` | The one nonstandard skeleton; bulk clips as reference only |
| Mahoraga | `mahoraga` | match in-game | bulk | `assets/reference/canon/mahoraga_canon.png` | Megumi's install actor (config_transform.js) |

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

### DI3: who is still owed one — 27 of 28

Listed for delivered rigs too: these numbers land in the rig's material extras at intake, and not one delivered rig carries a `toon` block today — all of them are running on engine defaults.

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
| Hanami | `hanami` | 220 cm | bulk | `assets/reference/canon/hanami_idle.png` | Canon Hanami: lean pale body, black brushstroke stripes, antler horns, one shoulder wrapped in white cloth (round 17A). The tree design is retired — no `hanami_alt` variant |
| Dagon | `dagon` | 215 cm | bulk | `assets/reference/canon/dagon_idle.png` | Extra bones for the tendrils |
| Kurourushi | `kurourushi` | 190 cm* | bulk | `assets/reference/canon/kurourushi_idle.png` | The one nonstandard skeleton; bulk clips as reference only |
| Mahoraga | `mahoraga` | match in-game | bulk | `assets/reference/canon/mahoraga_canon.png` | Megumi's install actor (config_transform.js) |

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

---

### DI4: who is still owed one — 27 of 28

The shared eye-highlight texture is delivered; these are the optional per-fighter mouth sheets. Nothing ships blocked on one.

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
| Hanami | `hanami` | 220 cm | bulk | `assets/reference/canon/hanami_idle.png` | Canon Hanami: lean pale body, black brushstroke stripes, antler horns, one shoulder wrapped in white cloth (round 17A). The tree design is retired — no `hanami_alt` variant |
| Dagon | `dagon` | 215 cm | bulk | `assets/reference/canon/dagon_idle.png` | Extra bones for the tendrils |
| Kurourushi | `kurourushi` | 190 cm* | bulk | `assets/reference/canon/kurourushi_idle.png` | The one nonstandard skeleton; bulk clips as reference only |
| Mahoraga | `mahoraga` | match in-game | bulk | `assets/reference/canon/mahoraga_canon.png` | Megumi's install actor (config_transform.js) |

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

---

# Outstanding by manifest, not by request

The other half of the question, and a narrower one: poses whose art EXISTS
and is wrong. A workbench flag says so directly; a pose drawing a file that
is not its own says so silently, which is how seven of them stayed invisible
until round 18G. Neither can see a pose that was never drawn — that is what
the rounds above are for.

**Nothing outstanding.** No pose carries a replacement flag, and no pose is
drawing a file that is not its own.

Separately, **2 improvement requests** — the art works and is just
not as good as it should be. Nothing is blocked by one, and the standing
ones are alpha fixes to delivered files, which is repo work rather than a
request.
