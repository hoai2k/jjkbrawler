# Asset Requests — history

Record of every art round that has been **delivered and integrated**. Open
requests live in [asset-requests.md](asset-requests.md); nothing in this file
is outstanding.

Round numbers are kept as written at the time so older commits, code comments
and review boards that cite "round 5 art" or "round-6 redesign" still resolve.
Rounds 7 and 8 were requested in parallel and delivered out of order, which is
why the numbering is not strictly chronological.

| Round | Scope | Outcome |
|---|---|---|
| 1–3 | Original 17 sprite sheets, extraction and first corrections | Delivered |
| 2 | Character-wide design splits: Sukuna's shawl, Panda's accessory | Delivered |
| 4 | Outfit consistency + pose correctness (crouch rows especially) | Delivered |
| 5 | Quality pass: 14 semantic poses × 17 fighters (238 sprites) | Delivered |
| 6 | Replacements for clipped/truncated sheet cells; Hanami redesign | Delivered |
| 7 | Six new fighters: Choso, Mei Mei, Uro, Yuji, Reggie, Gakuganji | Delivered |
| 8 | Summon minion art (Geto, Mahito, Toji) | Delivered |
| 9 | Cards, technique frames, domains, stage props, three redrawn fighters, Mahito's re-key, Mahoraga (166 assets) | Delivered |
| 10 | One sprite per action for the sheet-era fighters — Gojo, Mahito, Nobara, Yuta (72 sprites) | Delivered in part; the rest is round 11 |
| 11 | Mahoraga redrawn from canon, the semantic sets finished for the last 13 fighters, wind-up/strike pairs for the round-7 six (280 sprites) | Delivered — **every fighter now has one sprite per action** |
| 12A | Workbench catches: poses that failed once placed at real size (33 sprites) | Delivered in part — 29 in across two batches, 4 still open in [asset-requests.md](asset-requests.md) |

---

## Rounds 1–3 — the original sheets

Seventeen 1254×1568 character sheets on a 4×5 grid (cell ≈ 313.5×313.6 px;
rows: idle / run / air / techniques / crouch). `tools/extract_sprites.py`
rebuilt these into per-frame trimmed PNGs with connected-component labelling,
majority-cell assignment and per-frame anchors. The full rationale is in
[asset-pipeline.md](asset-pipeline.md) and is still the authority on how the
sheet era works.

## Round 2 — character-wide design splits

Two cases where a character's art disagreed with *itself* across enough frames
that the fix was a design decision rather than a correction:

- **Sukuna's shoulder shawl** — present in some rows, absent in others. Resolved
  by removing it across rows 0–3 so the bare-chested design is uniform.
- **Panda's accessory** — the teal cursed-energy core moved or vanished between
  frames. Unified across all 20 frames.

## Round 4 — outfit consistency and pose correctness

The audit that produced this round found characters changing costume when they
crouched. All seven affected crouch rows were regenerated so the costume
matches standing (verified at the time in `tools/debug/round4_check.png`).

It also carried a **"free fixes, no art needed"** section: roughly fourteen
`src/characters.js` frame-mapping corrections where the right art already
existed but the wrong cell was wired up (Gojo's ultimate showing red instead of
purple, Geto's side-heavy showing a chain he does not use, jab chains leading
with a stance frame instead of a strike). Those were applied in code.

## Round 5 — the quality pass

The measured problem: sheet frames gave a character body of **256–296 px**
while generated art gave **674–700 px**, and the game draws a fighter ~230 px
tall — so sheet frames ran at roughly 1:1 with no headroom and looked soft.
221 of 340 frames were under 260 px. Separately, seven animation states had no
art at all and borrowed an unrelated frame (`shield` drew idle, `upHeavy` drew
the jump frame, `dizzy` drew hurt).

**Delivered: 238/238 sprites** — 14 semantic poses (Tier 1 + Tier 2) for all 17
fighters. This is the round that replaced `r{row}c{col}` grid names with
semantic pose keys (`idle_a`, `guard`, `attack_up`, …) for the states it
covered. Tier 3 was never generated; those states still resolve to grid cells.

Two things this round established that still hold:

- **Green keying leaves a halo.** The art arrived keyed off green, which left a
  green fringe on every soft edge — hair worst — on 205 frames. Repaired
  in-place with `clean_frames.py --defringe`. Magenta `#FF00FF` has been the
  standard key ever since, with mid-grey `#808080` for warm-palette characters
  (Sukuna, Nobara, Momo, Hakari, and later Yuji and Choso).
- **`bodyH` is not a size control.** Every pose is generated to fill its canvas,
  so raw bbox height is near-identical across poses and rendered size is driven
  entirely by the hand-set `bodyH` target. `ledge_hang` shipped at ~53% of idle
  and rendered as a tiny figure on all 17 characters before this was understood.

## Round 6 — clipped cells and the intake pipeline

Frames where the source art was physically cut off — either running off the
cell edge or drawn already cropped (Gojo's hair sliced flat across the skull,
Yuta's entire technique row cut at the top). Review found that detecting a
clipped pose from geometry alone does not work: of 83 candidates flagged by
tooling, only 8 were genuinely cut off.

This round also introduced:

- the **intake pipeline** (`tools/intake.py` → `intake_sheets.py` →
  `intake_import.py`), so a delivery is checked before it reaches the game;
- **alternate sprite sets** (`manifest.alternates`), first used for Hanami's
  redesign — 8 frames, opted into via Settings → Sprites;
- `dodge_roll` / `dodge_air` art, initially for 8 of 17 characters and later
  completed for all 17.

## Round 7 — six new fighters

Choso, Mei Mei, Uro, Yuji, Reggie Star and Gakuganji. Per fighter: 1 hero card,
31 poses, and 1–6 technique effect sprites — **210 images**, all delivered.

Their kits, mechanics, AI profiles and audio were built and verified in code
*before* any art existed, behind a `STAGED_CHARACTER_KEYS` list that kept them
out of character select and out of `randomCharacterKey()`. Shipping each one
was then a matter of importing sprites, dropping the card, and moving the key
into a `CHARACTER_GROUPS` bucket in `src/config.js`.

These six have **no sprite sheet at all** — every animation state maps to a
semantic pose key via `SEMANTIC_ANIMS` in `src/characters.js`.

### Lessons this round produced

- **Art arrives raw.** Every delivery came as untrimmed RGB plates on a grey or
  magenta field with no alpha channel. That is expected; it just has to go
  through `tools/intake.py` before reaching `assets/sprites/`. Uploading raw
  plates directly into `assets/sprites/<char>/` makes the game try to draw a
  1024×1536 background as a sprite. This is why deliveries now go to
  `assets/intake/` — see that directory's README.
- **A brand-new character has no frame to inherit placement from.**
  `intake_import.py` falls back to a blind `renderScale` of 0.25 in that case,
  which rendered Choso ~17% oversized. Anchor `idle_a` to the roster's idle
  `bodyH` band (282–299) first, then import the rest so they inherit it.
- **Draw every pose at the same zoom.** Uro's `idle_b` came back ~15% larger
  than `idle_a` — same standing pose, just bigger. Idle alternates between
  those two frames at 2.2 fps, so she visibly pulsed while standing still.
  Corrected with a per-frame `renderScale`. Only catchable by eye.
- **Directional effect art must point LEFT.** The projectile renderer mirrors a
  sprite when it travels right (`src/render.js`), so art drawn pointing right
  flies backwards, blunt end leading. `piercing_blood` and `crow_flock` both
  arrived pointing right and were flipped on import. `chain` and `crow` are the
  correct references. **Exception:** Reggie's `cardrop` ultimate uses the
  opposite convention (`scale(dir > 0 ? 1 : -1)`), so `sedan.png` correctly
  points right.
- **Effects need keying too**, with the same routine as character art, then
  `tools/prep_effects.py` to trim and downscale.
- **Watch the spelling of directory names.** Gakuganji's art arrived in
  `assets/sprites/gakuganjii/` (double "i"); the character key, his card and
  the wiki are all `gakuganji`. Renamed on import.

## Round 8 — summon minions

Dedicated art for the three persistent minions that were running on placeholder
effect sprites: Geto's **Rainbow Dragon**, Mahito's **transfigured human**, and
Toji's **inventory curse**. Delivered, plus higher-resolution regenerations of
both Divine Dogs.

> **Summons bypass the intake pipeline.** The five files arrived with the
> magenta background baked in and no alpha, so each drew as a solid magenta
> rectangle on stage. Files dropped straight into `assets/sprites/summons/` skip
> `tools/intake.py`, so they need the key run over them explicitly:
>
> ```sh
> cd tools && python3 -c "
> from pathlib import Path
> from process_round5_sprites import key_image
> for n in ['rainbow_dragon','transfigured_human','inventory_curse',
>           'divine_dog_white','divine_dog_black']:
>     p = Path('../assets/sprites/summons')/f'{n}.png'; key_image(p, p)"
> ```
>
> Delivering summons into `assets/intake/summons/` instead avoids this.

## Round 9 — accuracy, polish, and three wrong characters

Seven independent parts, all delivered.

**9A — the 17 original hero cards.** The select screen was two styles side by
side; regenerated so it is one. A later variation pass took it to 20 of the 23,
with the uniform originals archived. Previous card art is kept at
`assets/reference/cards_previous/` so any of them can be put back.

**9B — ten technique frames that showed the wrong move.** Maki's neutral special
played her *dash* frame; Geto's played a generic cell. All ten landed, and each
one is pointed at in `src/characters.js` — art alone would have changed nothing,
since the animation table decides which sprite a technique draws.

**9C — seven Domain Expansion backgrounds.** Loaded through `optional()`, so
until they arrived the domain simply dimmed the stage. Their absence was also
what had been failing `tools/smoke_stages.mjs`: 20 boards passed while the run
exited 1 on eleven 404s.

**9D — four stage-hazard props.** The other half of those 404s. Keyed, trimmed
to 700 px and de-fringed on import.

**9E — Gakuganji, Reggie and Uro redrawn from the anime.** Round 7 built these
three from written character blocks nobody checked against the show, so all
three shipped as *a different person*: Gakuganji in a plain black robe with no
guitar, Reggie in a bomber jacket instead of a tunic of torn receipts, Uro with
a black bob instead of violet flame-like hair. 93 poses and 3 cards. The blocks
in the open request were rewritten from the references at the same time, so the
error cannot be regenerated from the doc.

**9F — Mahito's 16 poses re-keyed.** His art was never the problem; the key
screen was, and his set carried residue from two different screens at once.
Magenta fringe across the redelivered poses went 9,159 → 8 and green 5,597 → 5.

**9G — Mahoraga's 31 poses.** Delivered and integrated as an actor rather than a
fighter — nobody selects him, and Megumi's ultimate wears him. The set is
superseded by round 11A, which redraws him from the shikigami's canon design;
what survives from 9G is the pipeline work around it, including the karma wheel
being cut out into `effect:mahoraga_wheel` so it hangs level while he tumbles.

---

## Round 10 — one sprite per action, four fighters in

The seventeen original fighters ran on 4×5 sprite sheets where **one cell serves
several actions at once**: `r4c0` is both crouch and land for everybody, and
`r3c0` covers twelve different combinations across the roster. No amount of
re-pointing fixes that, because there is no fourth sprite to point at.

**Delivered: Gojo, Mahito, Nobara and Yuta**, 18 poses each — 72 newly generated
sprites, plus Nobara reusing the neutral special 9B had already produced. Each of
the four now has one drawing per action.

Two spec sections written for this round outlived it and moved into the open
request rather than here, because they govern every round that follows: **the
canonical reference image** (one `idle_a` per fighter, with a matched-scale
roster sheet), and the **wind-up/strike pair** that replaced the single-frame
heavy and aerial.

**The thirteen fighters this round did not reach became round 11B**, and its
seven-cell clipping list (10D) went with them — every one of those cells belongs
to a pose 11B redraws.

---

## Closed audits

**Missing-sprites audit.** Checked every image the game asks for against what
is in the repo: all 707 asset paths the loader builds, plus a headless browser
pass recording console output and any HTTP response ≥ 400. Result at the time:
nothing 404'd, but 18 sprites were missing as *art* — `dodge_roll` and
`dodge_air` for 9 of 17 characters, which silently fell back to the sprint
frame, so those fighters looked like they were running on the spot mid-roll.
**Closed:** all 23 fighters now have both frames.

The same audit's secondary finding — specials that resolve to a generic grid
cell rather than art of the actual technique — was round 9B for the ten worst
cases and is otherwise round 11B.

**Summoning system worklog.** The persistent-minion system (`src/summons.js`)
for Megumi, Geto, Mahito and Toji. Feature complete and merged; its art was
round 8.

---

# Round 11 — delivered

Three parts; any can be delivered on its own.

- ~~**11A** — redraw Mahoraga from the shikigami's canon design~~ **delivered** (33 sprites)
- **11B** — finish the semantic sets for Toji, the last fighter on sheet cells (18 sprites)
- **11C** — wind-up/strike pairs for the 6 round-7 fighters (24 sprites)
- **11D** — one improvement request: Reggie's crouch attack does not read as the action (1 sprite)

**43 sprites left.** 11B is nearly done — **Toji is the last fighter still
playing a sprint frame for a punch.** 11C is the
smallest and finishes a transition already made everywhere else.

**11A is done** — Mahoraga arrived as the canon shikigami, all 33 poses, and is
integrated. **Twelve of the thirteen are done in 11B**; only Toji is left. Their sections below are struck through rather
than deleted, so a delivery citing "11A" still resolves; the full record moves to
the history file when the round closes.

Deliver **one complete fighter at a time** rather than one pose across everybody.
A fighter whose set is finished can be re-pointed and played immediately; a pose
spread across the roster leaves everyone half-converted.

---

## ~~11A. Redraw Mahoraga from the shikigami's canon design~~ — DELIVERED

**Delivered and integrated.** All 33 poses arrived as the canon shikigami —
covered face with white plates, brass eight-spoke wheel, chain necklace, tattered
skirt with the violet sash, bone sword. The `needsReplacement` flags are cleared
and the poses are in the workbench's "All Recently Updated" list waiting to be
placed.

**One change came out of the delivery: the karma wheel is no longer a separate
prop.** The round-9 art drew it as a large black halo floating detached above his
head, which is why it had to be cut out and composited — a wheel that hangs in
the air must not tumble when he rolls. The canon design mounts it ON the
headdress, small and brass, and a wheel that is part of the head *should* turn
with the head. So it is drawn into all 33 poses, `SPRITE_ACTORS.mahoraga` no
longer declares a `prop`, and `effect:mahoraga_wheel` is kept but unloaded.

The original request follows, for the record.

### The original request — 31 sprites

### Why

Megumi's ultimate now TRANSFORMS him into Mahoraga — he wears the shikigami and
the player drives it, rather than watching one walk around beside him
(`src/config_transform.js`). That puts all 31 poses on screen as a playable
body, which is a much harder test than a summon walking past, and the round-9
set does not survive it: **it is not the shikigami's design.**

Set the delivered `idle_a` beside the canon image and the disagreements are not
details:

| | Canon | Round-9 delivery |
|---|---|---|
| Head | Face fully covered, white blade-like plates sweeping back from it | Open face with three visible eyes |
| Hair | None — plates and a long white tail | Heavy black mane over the shoulders |
| Wheel | **Brass/gold**, eight spokes with ball finials, sitting close behind the head | **Black**, floating detached well above the head |
| Body | Chalk white, chain-and-tassel necklace at the collar | Chalk white, no necklace |
| Dress | Dark tattered skirt, violet sash, violet wrist and ankle wraps | Dark hakama, beige wraps |
| Weapon | Huge bone/stone sword | None |

All 31 poses are flagged `needsReplacement: "replace"` in the manifest, so
`python3 tools/list_replacements.py --markdown` lists them and intake clears the
flags when the new art lands.

### The canon reference

```
assets/reference/canon/mahoraga_canon.png
```

That is the full-body shikigami render the game already ships as
`summons/mahoraga.png`. **It is the authority for the design** — head, wheel,
necklace, skirt, wraps, tail, sword. It is a standing three-quarter pose, so it
answers *what he looks like*, not what each action looks like; the poses come
from the list below.

This is the same relationship 10B sets up for the roster, with one difference:
Mahoraga's canon is this render rather than an `idle_a`, because his existing
`idle_a` is the thing being replaced.

### What to deliver

The full transform set — the poses every round-7 fighter has, since a
transform draws from all of them and a missing one leaves a hole mid-fight:

| | Poses |
|---|---|
| **Stance** | `idle_a`, `idle_b`, `crouch_a`, `crouch_b`, `guard`, `dizzy`, `victory` |
| **Movement** | `run_reach_a`, `run_pass_a`, `run_reach_b`, `run_pass_b`, `dash`, `jump_rise`, `fall`, `land`, `ledge_hang`, `dodge_roll`, `dodge_air` |
| **Attacks** | `attack_light_a`, `attack_light_b`, `attack_heavy_a` + `attack_heavy_b`, `attack_up`, `attack_down`, `attack_air_a` + `attack_air_b`, `crouch_attack_a`, `crouch_attack_b`, `charge` |
| **Techniques** | `special_neutral`, `special_side`, `special_down`, `ult_a`, `ult_b` |
| **Reaction** | `hurt` |

Pose lines are in **10A**; the wind-up/strike pairs are **10C**; the four run
poses are the round-12 cycle, with pose lines in **12B**. Note the attack list
uses the `_a`/`_b` pairs rather than the single `attack_heavy` the round-9 set
delivered, and the run list is the four-frame cycle rather than the old
`run_a`/`run_b` pair — Mahoraga is being redrawn from scratch, so there is no
reason to deliver a superseded shape. (The readiness check in
`src/ultimates.js` accepts the cycle in place of the pair.)

### Two things specific to him

**Draw the wheel INTO the pose, at the right size and place, but expect it to be
cut out.** The karma wheel is composited separately at runtime
(`effect:mahoraga_wheel`) precisely so it hangs level while he tumbles — a wheel
painted into every pose rolled with his body on a dodge, which is the opposite
of what it is for. Drawing it in keeps the poses readable and gives the intake
something to measure against; it gets lifted the same way Geto's curses were
(`tools/recut_curses.py` is the model).

**He is enormous, and that is the point.** `heightCm: 260` against a roster
averaging ~175, and `scale: 0.95` on top. Draw him at the same *figure scale* as
everyone else — body ~290 px on the plate, per the delivery spec — and let the
engine do the enlarging. Compensating by drawing him bigger on the plate would
stack with the height solve and put his head off the top of the screen.

### Delivery

```
assets/intake/mahoraga/<pose_key>.png
```

Standard spec at the top of this file. He is chalk-white against a dark
skirt, so **key on magenta `#FF00FF`** — a grey screen would fight the body.

---

## 11B. Finish the semantic sets — 18 sprites, Toji only

This is round 10A, carried forward with every fighter it has finished removed
from it. Gojo, Mahito, Nobara and Yuta got there in round 10, and **Geto (15
poses), Hakari (17), Hanami (16), Inumaki (18), Jogo (17), Maki (17), Megumi
(17), Momo (18), Nanami (18), Panda (18), Sukuna (18) and Todo (18) have since
been delivered and integrated** — all twelve are re-pointed and off this list.
**Toji alone** still runs on **4×5 sprite sheet cells** named `r{row}c{col}`, where one
cell has to serve several actions at once.

The problem was never the naming. It is that a sprint pose is what plays when
Maki throws a punch, and a crouch is what plays when anyone lands — and no amount
of re-pointing fixes it, because there is no fourth sprite to point at.

### What is missing, per fighter

Counts differ because round 9B already delivered some of the technique frames.
**On-disk filenames are the resume authority** — anything already in
`assets/sprites/<char>/` is done, whatever a total elsewhere says.

| Fighter | Key | Missing | Poses |
|---|---|---|---|
| ~~Suguru Geto~~ | `geto` | ~~15~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Kinji Hakari~~ | `hakari` | ~~17~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Hanami~~ | `hanami` | ~~16~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Toge Inumaki~~ | `inumaki` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Jogo~~ | `jogo` | ~~17~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Maki Zen'in~~ | `maki` | ~~17~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Megumi Fushiguro~~ | `megumi` | ~~17~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Momo Nishimiya~~ | `momo` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Kento Nanami~~ | `nanami` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Panda~~ | `panda` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Ryomen Sukuna~~ | `sukuna` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Aoi Todo~~ | `todo` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| Toji Fushiguro | `toji` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |

Deliver to:

```
assets/intake/<character>/<pose_key>.png
```

Already delivered, do not redraw: `idle_a`, `idle_b`, `run_a`, `run_b`,
`jump_rise`, `fall`, `hurt`, `guard`, `ledge_hang`, `dizzy`, `victory`,
`charge`, `attack_up`, `dodge_roll`, `dodge_air`.

### Consistency is the point of this round

These 225 sprites are going to sit beside the poses each fighter already has, so
**matching the delivered set matters more than any individual frame looking
good.** For each fighter, put their `idle_a` beside what you are drawing and
check:

- **Same costume, same proportions, same age.** The sheets and the round-3/4/5
  additions already disagree in places; this round should agree with the
  *semantic* files, which are the newer and better art.
- **Same figure scale.** Body height ~290 px on a ~1024×1536 plate, matching
  their existing `idle_a`. The engine solves the final scale per fighter from
  `heightCm`, so do not compensate.
- **Same line weight and shading.** One character's set should look like it was
  drawn in one sitting.
- **Facing right**, one subject per file, flat key screen — the standard
  delivery spec at the top of this file. Warm-palette fighters (Sukuna, Nobara,
  Momo, Hakari) key on mid-grey `#808080`, everyone else on magenta `#FF00FF`.

### Pose lines

Combine each fighter's character block with the line below. Where a pose is a
technique, the fighter's own kit decides what it looks like — the special names
are in `src/characters.js` and on the move list in game.

| Pose | Pose line |
|---|---|
| `attack_light_a` | fast opening jab or short slash, lead hand, body square, minimal wind-up |
| `attack_light_b` | the follow-up strike with the other hand, hips rotated through it — reads as the second half of a two-hit combo |
| `attack_heavy_a` / `_b` | the wind-up and the strike of one committed heavy blow — see **10C**, which supersedes the single `attack_heavy` this row used to ask for |
| `attack_down` | striking downward at the ground in front, weight dropping onto it |
| `special_neutral` | performing their **neutral special** — the named technique, mid-execution, with its cursed energy forming but not yet released |
| `special_side` | their **side special**, moving forward into it |
| `special_down` | their **down special**, weight low, technique breaking out of the ground or the body |
| `ult_a` | the wind-up of their **ultimate**: gathering, energy at maximum, before release |
| `ult_b` | the release of that ultimate, arms and body fully committed |
| `crouch_a` | crouched low, guard up, alert — not resting |
| `crouch_b` | the same crouch a fraction lower, weight settled |
| `crouch_attack_a` | attacking from the crouch, low sweep or upward strike from the knees |
| `crouch_attack_b` | the follow-through of that low attack |
| `dash` | sprinting flat out, body angled forward past the leading foot — a running pose, distinct from `run_a`/`run_b` which are the mid-stride cycle |
| `land` | absorbing a landing, knees bent, one hand near the floor, dust at the feet — distinct from a crouch, which holds |

### The unused cells stay

Each fighter has 5–8 grid cells nothing draws (115 across the roster). **Do not
delete them.** They are alternate poses the sheets happened to contain, and the
sprite workbench can now point any action at any sprite — so an unused cell is a
candidate for a secondary action rather than dead weight. They stay in the
manifest and stay visible in the workbench under "All sprites".

### Integrating

1. Import with `tools/intake.py`, which registers the new poses.
2. Point each fighter's kit at them: the animation tables in `src/characters.js`
   currently name grid cells, and this is what replaces those names. The
   round-7 fighters' tables are the model — they inherit `SEMANTIC_ANIMS`
   wholesale and override almost nothing.
3. Anything not re-pointed keeps working: an action still naming a grid cell
   draws the grid cell exactly as it does today, so this can land fighter by
   fighter rather than all at once.

The result is 23 fighters with one sprite per action and no shared cells, which
is what makes the roster read consistently — and it retires the `r{row}c{col}`
vocabulary from everything except the leftovers.

---

## 11C. Wind-up and strike — 24 sprites across 6 fighters

This is round 10C, carried forward with the fighters it finished removed. The
four sheet-era fighters round 10 completed have their pairs; so does everyone
`11B` covers, since the pairs are in that pose list. What is left is the six
round-7 fighters, who were built with a single-frame heavy and aerial.

| Fighter | Key | Poses |
|---|---|---|
| Choso | `choso` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Yoshinobu Gakuganji | `gakuganji` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Mei Mei | `meimei` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Reggie Star | `reggie` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Takako Uro | `uro` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Yuji Itadori | `yuji` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |

Mahoraga needs these too and is not listed: his whole set is redrawn in 11A, and
the pairs are in that pose list.

### The problem

A heavy attack and an aerial each draw **one frame** for the whole move. The
engine already splits that move into startup, active and recovery
(`delay` / `dur` / `recover` in `src/moves.js`), but the art cannot follow it,
so whatever was drawn is held through all three.

Which half was drawn varies by fighter, and that is the actual bug. Mei Mei's
`attack_heavy` is a clean **wind-up** — axe raised, weight loaded, nothing struck
yet — held for the entire swing, so her heavy never connects on screen. Others
drew the **strike**, so the move has no anticipation and appears to teleport into
its follow-through. Both are good drawings of half a move.

### What to deliver

Two poses per fighter, for both the heavy and the aerial:

| Pose | What it is |
|---|---|
| `attack_heavy_a` | **wind-up.** Weapon or fist drawn back, weight loaded onto the rear foot, body coiled. Nothing has landed. The moment before commitment. |
| `attack_heavy_b` | **strike.** The same swing at full extension, weight transferred through to the front foot, the arc finished. The moment of contact. |
| `attack_air_a` | **wind-up, airborne.** Body coiled mid-jump, striking limb cocked, legs gathered. |
| `attack_air_b` | **strike, airborne.** Fully extended through the aerial arc, legs trailing, committed. |

**These two frames are one motion, drawn twice.** Same camera distance, same
figure scale, same costume, same weapon at the same size — the only thing that
changes is the body. If you can flip between them and see anything move that is
not the character's own action, they will read as a glitch rather than a swing.

Deliver to `assets/intake/<character>/attack_heavy_a.png` and so on, against
that fighter's canonical `idle_a` (10B above).

### The existing art is kept, not replaced

Whatever a fighter has as `attack_heavy` or `attack_air` today stays in the
repository and stays selectable. It becomes a **variant**: when the new pair
lands, both `_a` and `_b` are seeded with the new art, and the old drawing is
offered alongside each of them as a second option in the sprite workbench's
chevron menu (`manifest.variants`, `tools/build_variants.py`).

That matters because some of the existing art is good — Mei Mei's raised axe is a
better wind-up than a fresh one might be. Nothing is thrown away, and the choice
of which drawing serves which half is made per fighter, by eye, in the workbench.

### It is already wired

`src/characters.js` declares both attacks as two-frame animations:

```js
sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"],
             fallback: ["attack_heavy"], fps: 6, loop: false }
```

`resolvedAnim` filters an animation down to the art that exists, so **a fighter
without the pair draws exactly what they draw today**, and picks the pair up the
moment it is imported. No code change per fighter, and the round can land one
fighter at a time.

The frame rate is set so the drawing changes when the **hitbox** does: a heavy's
startup is `0.15 / speed` seconds and 6 fps holds the first frame for 0.167 s; an
aerial's is `0.13 / speed` against 8 fps and 0.125 s. The strike frame appears as
the move goes live, within about 10 ms.

### Relationship to 10A

**10A's `attack_heavy` row is superseded by this section.** The 17 fighters in
that round should be drawn as `attack_heavy_a` + `attack_heavy_b` directly rather
than as a single `attack_heavy` that would immediately need splitting. Everything
else in 10A is unchanged.

---

---

## 11D. Reggie's crouch attack — 1 sprite

The only **improvement** request outstanding, and the only thing in this round
that is not blocking: `reggie/crouch_attack_b` is drawn well, it just does not
read as the action. It is the follow-through of a low attack and looks like
something else.

| Fighter | Key | Pose | Ask |
|---|---|---|---|
| Reggie Star | `reggie` | `crouch_attack_b` | Pose — reads poorly, or is not the action it stands for |

Pose line, from 11B's table: *the follow-through of that low attack.* His canon
reference is `assets/reference/canon/reggie_idle.png` — the receipt tunic, bare
arms and legs, barefoot.

Keep this separate from the rest of the round when scheduling it. A `replace` is
blocking, because something on screen is wrong; this is a wish, and burying the
two together makes the blocking ones wait behind the wish list.

### What round 11 settled

**The 4×5 sprite sheet is retired.** Every fighter and the one sprite actor now
draws one sprite per action, and `src/characters.js` names no `r{row}c{col}`
cell anywhere outside the shared `DEFAULT_ANIMS` table — which `SEMANTIC_ANIMS`
now shadows entirely, state for state. The cells themselves stay in the manifest
and in the workbench's "All sprites" view, as alternate drawings a pose can be
pointed at; nothing draws them by default.

Delivered in this round, in the order it arrived:

| Part | Scope | Sprites |
|---|---|---|
| 11A | Mahoraga, redrawn from the shikigami's canon design | 33 |
| 11B | Semantic sets for Geto, Hakari, Hanami, Inumaki, Jogo, Maki, Megumi, Momo, Nanami, Panda, Sukuna, Todo, Toji | 225 |
| 11C | Wind-up/strike pairs for Choso, Gakuganji, Mei Mei, Reggie, Uro, Yuji | 24 |
| 11D | Reggie's crouch attack, kept alongside the original as a variant | 1 |

The round also produced the checks that make the next one land safely:
`tools/check_pointing.mjs` (art registered but not drawn), the "recently
updated" list covering brand-new poses as well as overwritten ones, and
`tools/swap_poses.py` for a pair delivered under reversed names.

---

## Round 12A — the first workbench catches — 18 sprites across 6 fighters

12A was thirty-three poses that only failed once they were placed in the sprite
workbench, at their real size and standing on the real ground line. Eighteen
came back in the first delivery; the remaining fifteen — Gakuganji, Reggie,
Toji, Megumi and Momo — are still open in
[asset-requests.md](asset-requests.md).

| Fighter | Poses | Kind | What was wrong |
|---|---|---|---|
| Satoru Gojo | `crouch_b` `crouch_attack_b` `special_down` | Pose | Not crouched; the low strike rose; Infinity read as a palm strike |
| Mahito | `crouch_b` | Pose | Not crouched |
| Mahoraga | `crouch_a` `crouch_attack_b` | Pose | A standing stride; the follow-through happened standing |
| Maki Zen'in | `attack_air_a` `attack_heavy_a` `ult_b` | Quality | Hands did not close on the naginata, which kinked where it crossed her body |
| Maki Zen'in | `crouch_b` `crouch_attack_b` | Pose | Barely below `crouch_a`; the follow-through did not travel toward the attack |
| Nobara Kugisaki | `dodge_air` | Quality | A second, grey Nobara ghosted into the plate, holding the hammer |
| Nobara Kugisaki | `special_neutral` `special_down` | Pose | The nails were painted in; Resonance hammered the ground instead of the doll |
| Takako Uro | `attack_air_a` `attack_air_b` `attack_heavy_a` `attack_heavy_b` | Character | A dark bob and a white bodysuit — not her |

All eighteen were flagged `needsReplacement`, so each replaced its drawing
outright and rolled back the hand tuning that had been compensating for it —
`intake_import.py`'s `discard` path. They land on the workbench's **All Recently
Updated Poses** list for re-placement.

### What this delivery settled

**Uro is on-model.** Her four were the last of the three characters round 9E
existed to fix, and they came back with the lavender upswept hair, the
pale-cyan cloud garment and the bare feet — drawn against
`assets/reference/canon/uro_idle.png` and nothing else, which is what the
instruction had been asking for across two rounds. Gakuganji and Reggie are
still outstanding on the same fault.

**Seven of the eight crouches that kept coming back standing are answered.**
The comparative test — head down by at least a quarter of the standing height,
beside that fighter's own `idle_a` — is what the briefs were rewritten around,
and it worked. `momo/crouch_attack_b` and `reggie/crouch_attack_b` are what
remain.

**`nobara/special_neutral` is the worked example for "do not draw the
technique".** The delivered art draws the cast — hammer driving forward, energy
at the hand — and leaves the nails to `effect:nail`. The four still open
(Megumi's two, Toji's two) are the same ask.

### The briefs, as written

Kept verbatim, because they are the record of what was asked for and the
reference for the poses still outstanding.

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

Delivered against the standard spec in
[asset-requests.md](asset-requests.md#delivery-spec). Gojo and Mahito keyed on
magenta `#FF00FF`; Nobara is a warm palette, so hers keyed on mid-grey
`#808080`. Canon references: `assets/reference/canon/gojo_idle.png`,
`assets/reference/canon/mahito_idle.png` and
`assets/reference/canon/nobara_idle.png`. The raw plates for all eighteen are
archived at `assets/reference/round12/`.

---

## Round 12A, second batch — 11 sprites across 3 fighters

The eleven that followed the first eighteen: Gakuganji's four, Reggie's four and
Toji's three. That leaves four of 12A open — Megumi's two and Momo's two — in
[asset-requests.md](asset-requests.md).

| Fighter | Poses | Kind | What was wrong |
|---|---|---|---|
| Yoshinobu Gakuganji | `attack_air_a` `attack_air_b` `attack_heavy_a` `attack_heavy_b` | Character | A plain black robe — the white haori and purple hakama were gone, the flying-V black instead of red |
| Reggie Star | `attack_air_a` `attack_air_b` `attack_heavy_a` `attack_heavy_b` | Character | A dark-haired man in a black coat and gold brocade waistcoat |
| Toji Fushiguro | `attack_air_b` | Quality | The grip on the blade did not read |
| Toji Fushiguro | `special_down` | Quality | The Inventory Curse was a flat ragged purple wash |
| Toji Fushiguro | `special_neutral` | Pose | The chain was painted in, and the engine fires its own |

All eleven replaced their drawing outright and rolled back the hand tuning that
had compensated for it, the same `discard` path the first batch took.

### The three that kept coming back wrong

Rounds **9E** and **11C** both existed partly to fix the same three characters,
and 11C came back with all three wrong again — Uro, Gakuganji and Reggie, all
four wind-up/strike pairs each, twelve sprites. **12A closed it.** Uro landed in
the first batch, Gakuganji and Reggie in the second, all twelve on-model:

| Fighter | Canon says | What 11C had drawn |
|---|---|---|
| Takako Uro | Lavender hair swept upward, pale-blue cloud garment, barefoot | A dark-green bob and a white-and-purple bodysuit with trainers |
| Yoshinobu Gakuganji | White haori over black, purple hakama, red flying-V guitar | A plain black robe, no haori, no hakama, black guitar |
| Reggie Star | Blond, white receipt tunic, bare arms and legs, barefoot | A dark-haired man in a black coat and gold brocade waistcoat |

What finally worked is worth keeping, because it is the instruction that had
been failing: **draw them from `assets/reference/canon/<char>_idle.png` and from
nothing else** — not the character block, not an earlier sprite, not a wiki
search. Those files are the delivered 9E art and carry the design, the figure
scale, the line weight and the palette the rest of each set already has. If the
drawing does not match that image, it is the wrong character no matter how good
it looks.

The raw plates are archived at `assets/reference/round12/`.
