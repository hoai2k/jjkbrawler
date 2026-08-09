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
| 12A | Workbench catches: poses that failed once placed at real size (33 sprites) | Delivered — all 33, in three batches |
| 12B/12C | The four-frame run cycle and the `prone` pose, roster-wide (120 sprites) | Delivered — all 24 fighters |
| 12D | Three install auras | Never delivered; moved to round 13 as 13E |
| 13 | Roster-wide sweep of the attack and crouch rows, plus the three install auras (44 sprites) | Delivered — the first round to land through the approval step |

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

---

## Round 12A, third batch — 4 sprites, and 12A closed

Megumi's two specials and Momo's two follow-throughs, the last of the
thirty-three workbench catches.

| Fighter | Poses | Kind | What was wrong |
|---|---|---|---|
| Megumi Fushiguro | `special_neutral` `special_down` | Pose | Nue and the shadow pool were painted in; the engine spawns both |
| Momo Nishimiya | `attack_light_b` | Pose | The follow-up pulled the broom away from what she had just hit |
| Momo Nishimiya | `crouch_attack_b` | Pose | The follow-through stood up out of the crouch |

**12A is closed: 33 of 33.** It ran over three deliveries and settled three
things worth keeping:

- **"Do not draw the technique" is answered everywhere it was raised.** Five
  poses painted in something the engine already spawns — Nobara's nails, Toji's
  chain and Inventory Curse, Megumi's Nue and shadow pool. All five now draw the
  body performing the move and leave the rest to the kit.
- **The crouches that kept coming back standing are done.** Eight of them across
  six fighters and three rounds. The comparative test the briefs were rewritten
  around — head down by at least a quarter of the standing height, judged beside
  that fighter's own `idle_a` — is what finally landed them.
- **The three that kept coming back wrong are on-model.** Uro, Gakuganji and
  Reggie, twelve sprites, drawn from `assets/reference/canon/<char>_idle.png`
  and nothing else.

The briefs, kept verbatim because they are the record of what was asked for:

### The catches, as they were written

Everything here came out of placing the delivered semantic sets in the sprite
workbench: seen at their real size and standing on the real ground line,
thirty-three poses turned out to be wrong. Round 11 is closed, so nothing here is
covered by another round — every fighter listed has a finished set, and these
are faults in it.

**Twenty-nine of the thirty-three are delivered**, in two batches: Gojo's three,
Mahito's crouch, Mahoraga's two, Maki's five, Nobara's three and Uro's four,
then Gakuganji's four, Reggie's four and Toji's three. Megumi's two and Momo's
two are what is left. The delivered briefs are in
[asset-requests-history.md](asset-requests-history.md#round-12a--the-first-workbench-catches--18-sprites-across-6-fighters).

**Everything in this section has to be drawn again.** That is what the section
is: a fault that could be fixed by editing the file — a bad key, a bad crop,
colour past the silhouette — is not a request at all, because it is repo work
(`tools/dekey_fringe.py` and friends) and never waits on a round. Only the
faults no edit can reach are here.

Two reasons a drawing cannot be edited into the right picture, and they want
different things from the redraw:

- **`quality` — the drawing is broken.** A hand that does not close on the
  weapon it is holding, a shaft that bends where it crosses the body, a second
  figure ghosted into the plate.
- **`pose` — the drawing is fine, but it is not the action.** A crouch that is
  not crouched, a strike that does not travel the way the move travels. Keep
  the character, the costume and the finish; change the body.
- **`character` — it is not the right person.** Twelve sprites came back as
  somebody else across two rounds — Uro's, Gakuganji's and Reggie's. All twelve
  are now delivered on-model, and none of the four below is a `character`
  fault; the account is in
  [asset-requests-history.md](asset-requests-history.md#the-three-that-kept-coming-back-wrong).

A third fault runs through several of them and is worth naming on its own,
because it is not obvious from the drawing: **the art paints in something the
game spawns for itself.** See "Do not draw the technique" below.

**The crouches that were not crouched are all delivered** — seven of them, the
bulk of the first 12A batch. One is left, `momo/crouch_attack_b`, plus
`reggie/crouch_attack_b` carried over from 11D: see the note under the table,
which is still the test to draw against.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
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

It has now come up three times. Three of the five are answered —
`nobara/special_neutral` draws the cast with the nails left to `effect:nail`,
and Toji's two came back with the chain and the purple wash gone. They are the
reference for Megumi's two, which are what is left:

| Pose | Painted in | What the engine already spawns |
|---|---|---|
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

Toji's down special is the sharpest version of the fault yet: **Inventory Curse
is a creature** — it uncoils at his shoulder, hovers behind him and spits cursed
tools for six seconds — and what is drawn in its place is a flat ragged purple
smear across his chest and thigh with a hard edge and no form. It is flagged
`quality` as well as belonging here, because even as an aura it is not finished
art.

**`megumi/special_side` is very likely a third instance** and is not flagged
yet. Two black hounds are painted at his feet, and Divine Dogs spawns two real
ones (`summon:divine_dog_black`, `summon:divine_dog_white`, `maxActive: 2`) that
chase the opponent for six seconds — so a cast puts four dogs on screen, two of
which never move. Worth a look in the workbench before this round is drawn.

### The second frame has to finish the first

`attack_light_a`/`_b` and `crouch_attack_a`/`_b` are **one motion drawn twice**,
and the `_b` frame keeps going the way `_a` was heading. Four of this round's
entries missed the same way — the second frame retreats, rises, or resets to a
neutral stance, so the combo plays as a strike followed by an un-strike.
`maki/crouch_attack_b` and `gojo/crouch_attack_b` are delivered; Momo's two are
what is left.

| Pose | `_a` does | `_b` should | `_b` does |
|---|---|---|---|
| `momo/attack_light_b` | thrusts the broom forward | carry through past the target, hips rotated in | lifts the broom up and back, away from what she just hit |
| `momo/crouch_attack_b` | sweeps low out of a lunge | stay down, the sweep finishing across the floor | rises toward standing |

The check: flip between `_a` and `_b`. Every part of the body that was moving
should have moved **further in the same direction**. If the weapon or fist is
closer to where it started, the second frame is a wind-up, not a follow-through.

### Hands on a weapon

Maki's three quality frames were all the same failure, and it is the one to
watch for on every armed fighter: **the hand does not grip.** The fingers pass
through the shaft, or close on empty air beside it, or the shaft bends through
the fist as though it were rope. `attack_heavy_a` had both — the lead hand never
closed, and the naginata kinked where it crossed her chest.

Her three are delivered, and so is `toji/attack_air_b`, the round's other
instance. `attack_heavy_b` remains the reference: two hands, both closed, the
shaft dead straight through them. Draw the grip first and the pose around it.

### The crouch keeps coming back standing

`gojo/crouch_b`, `gojo/crouch_attack_b`, `mahito/crouch_b`,
`mahoraga/crouch_a`, `mahoraga/crouch_attack_b`, `maki/crouch_b`,
`maki/crouch_attack_b`, `momo/crouch_attack_b` and `reggie/crouch_attack_b`
(11D) were all the same miss, from three different rounds: a figure standing
upright with the knees slightly bent, which reads as `idle` rather than as a
crouch. It survives review every time because in isolation it is a good drawing
— it only fails beside the fighter's own `idle_a`, where nothing has moved.

All but Momo's and Reggie's are delivered, and the delivered ones are the
worked example: put one beside its `idle_a` and the head has visibly dropped.

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

---

## Round 12B and 12C, first delivery — 75 sprites across 15 fighters

The four-frame run cycle (`run_pass_a/b`, `run_reach_a/b`) and the knocked-flat
`prone` pose, for Choso, Geto, Hakari, Hanami, Inumaki, Jogo, Megumi, Mei Mei,
Momo, Nanami, Panda, Sukuna, Todo, Yuji and Yuta. **Nine fighters are still
without both** — Gakuganji, Gojo, Mahito, Mahoraga, Maki, Nobara, Reggie, Toji,
Uro — and stay open in [asset-requests.md](asset-requests.md).

Seventy-five poses that did not exist before, so nothing was overwritten and no
tuning was rolled back. They land on the workbench's updated list as new work to
be placed rather than re-tuned.

### What the round taught the tools

**The resolution check was measuring the wrong axis.** `prone` arrives about
939×208 — a perfectly sharp figure, lying down — and all fifteen were flagged
`LOW-RES` because the check read body *height*. Resolution is a property of how
big the drawing is, not which way up it is, so `tools/intake.py` now measures
the longest axis. For anything standing that is still the height, so the case it
was written for is unchanged, and fifteen false positives went away.

**The auto-tuner's foot rule assumed the character is standing.** It is not a
question of how sprawling a pose is: the 0.946 fraction holds at the same median
whether the art is drawn taller than wide (n=470) or wider than tall (n=39), so
a running stride is fine. What breaks it is nobody being on their feet — `prone`
lies flat and touches the floor along its whole side, so its contact really *is*
the lowest pixel, and lifting it 5% hovers the body. The magnitude guard caught
`momo/prone` on its own at 37% of body height, which is what a guard is for, but
the other fourteen would have gone through quietly wrong. `prone` is now named
in `NO_STANDING_FOOT` — a list rather than a measurement, because it is a fact
about what the pose means and nothing in the alpha channel knows it.

This was the first round where `tools/auto_tune.py` ran as an ordinary step. It
placed the 78 poses it had rules for and left prone's ground contact to the eye.

### Known and left alone

`momo/run_reach_a` has a few pixels of broom bristle clipped at the canvas edge.
The figure is intact and the rest of the delivery is clean, so it was imported;
whether that is worth a redraw is a workbench decision, not one to make on the
way in.

---

## Round 12B and 12C, completed — 45 sprites across the last 9 fighters

The four-frame run cycle and the `prone` pose for Gakuganji, Gojo, Mahito,
Mahoraga, Maki, Nobara, Reggie, Toji and Uro, finishing both parts.

**All 24 fighters now run on four frames and have a drawn knockdown.** The
two-frame run is retired everywhere, and the engine no longer simulates prone by
sweeping a `hurt` frame 90 degrees.

The delivery arrived as 74 plates, 29 of which were byte-for-byte re-uploads of
12A art already delivered and archived. Those were dropped rather than
reimported — comparing the incoming plate against `assets/reference/round<N>/`
by hash is the cheap way to tell a redelivery from a repeat, and worth doing
whenever a round arrives in more than one upload.

### What round 12 finished

| Part | Scope | Sprites |
|---|---|---|
| 12A | Workbench catches, in three batches | 33 |
| 12B | The four-frame run cycle, roster-wide | 96 |
| 12C | A `prone` pose, roster-wide | 24 |

**12D — three install auras — was never delivered and has moved to round 13 as
13E.** It is effect art rather than a pose, the three installs run on procedural
placeholders in code, and keeping a round open for it would have misreported
what is outstanding.

### One thing left for the eye

**Five of the twenty-four prone poses lie the other way round.** Geto, Mei Mei
and Todo came that way in the first batch; Mahoraga and Nobara in the second.
The other nineteen lie with the head trailing, which is the direction a
knocked-back fighter falls, and the engine mirrors `prone` by facing like every
other frame — so two fighters knocked down beside each other lie head to head.

No redraw is needed: it is one tick of **Mirror this pose** in the workbench per
pose. It is recorded here rather than fixed on the way in because which way a
body falls is a decision about the game, not a fault in the file.

### The briefs, kept verbatim

The pose lines are the reference for anything that has to match this art
later — a redraw of one run frame has to agree with the other three.

### 12B, as it was written

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

### 12C, as it was written

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


---

## Round 13 — the attack and crouch sweep, and the install auras

**Delivered in full: 44 sprites.** Forty-one crouch, crouch-attack and
light-attack redraws from the roster-wide sweep, plus 13E's three install auras.
The auras went straight into the game; every one of the forty-one poses came in
through the **approval step** instead — the first round to do so — so the art is
in the repo and each pose is a decision waiting in the sprite workbench rather
than a change players saw on import.

Ten were approved in the first pass. Two of those carried a redraw request out
with them: Choso's `attack_light_b` and Geto's `attack_down` are better than what
they replaced and are in the game, and both are also in **14C**. Approving and
requesting are separate answers, and a drawing can be worth shipping and worth
improving at the same time.

The round also settled how an approval interacts with the comparison view. The
displaced drawing is banked as a `Superseded` option on the pose rather than
dropped, so **Alternate sprite** goes on showing "the drawing this replaced"
after a yes instead of silently switching to something else.

### The sweep, as it was written

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
[The crouch keeps coming back standing](#the-crouch-keeps-coming-back-standing)
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
[The second frame has to finish the first](#the-second-frame-has-to-finish-the-first)
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
