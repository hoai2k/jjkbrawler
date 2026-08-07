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
cell rather than art of the actual technique — is **still open** and now lives
in [asset-requests.md](asset-requests.md) as round 10.

**Summoning system worklog.** The persistent-minion system (`src/summons.js`)
for Megumi, Geto, Mahito and Toji. Feature complete and merged; its art was
round 8.
