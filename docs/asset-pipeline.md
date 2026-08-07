# Asset Pipeline — Sprite Extraction

## The problem with the v1 sheets

The original game shipped seventeen 1254×1568 character sheets on a 4×5 grid
(cell ≈ 313.5×313.6 px; rows: idle / run / air / techniques / crouch). The art
inside those cells is imprecise in ways that hurt a fighting game:

1. **Cell bleed** — weapons and effect trails cross cell borders (Maki's
   naginata, Gojo's energy trails). A naive grid crop cuts sprites apart *and*
   pastes fragments of neighbors into the wrong frames. v1 worked around this
   at runtime by scrubbing one pixel of border and binarizing alpha, which
   trimmed legitimate art along with the bleed.
2. **Inconsistent foot lines** — characters stand at slightly different
   heights per frame, so a fixed pivot makes idle/run animations bob. v1
   re-detected feet at runtime by scanning alpha rows per frame.
3. **Soft alpha halos** — leftover semi-transparent fringing from the original
   background removal.

## The v2 approach: transfer sprites individually

`tools/extract_sprites.py` rebuilds the assets offline instead of patching
them at runtime:

1. **Connected-component labeling** (scipy, 8-connectivity) over each sheet's
   alpha channel — every blob of art becomes an addressable component.
2. **Majority-cell assignment** — each component belongs to the grid cell
   containing most of its pixels. A weapon tip that pokes into the next cell
   stays with the body it's connected to; a detached energy burst stays with
   the frame it overlaps most.
3. **Fragment rules** — detached fragments hanging almost entirely below their
   cell's bottom edge are reassigned to the frame beneath (the sheets' rows
   overlap slightly); per-frame overrides handle known one-offs (e.g. a stray
   mandala arc under Inumaki's landing frame).
4. **Per-frame trimmed PNGs** — every frame is composited from exactly its own
   components (foreign pixels inside the bounding box are excluded), trimmed
   tight, and written to `assets/sprites/<char>/r<row>c<col>.png`.
5. **Manifest** — `assets/sprites/manifest.json` records each frame's size,
   its offset relative to the logical cell (so frames can legitimately
   overhang their cell), and two derived anchors:
   - `bodyBottom`: the bottom of the frame's *largest* component — the foot
     line, unpolluted by detached effects. The renderer pins this to the
     fighter's ground Y, which kills animation bobbing without runtime pixel
     scans.
   - `centroidX`: alpha-weighted center of mass, kept for debugging.

Individually generated replacement cells are listed in
`GENERATED_FRAME_TARGETS`. The extractor preserves those high-resolution alpha
PNGs at their final paths and rebuilds sheet-compatible anchors and render
scales from their alpha bounds, so a historical sheet re-extraction cannot
restore the broken art.

The engine (`src/sprites.js`) draws a frame by translating to the fighter's
feet, flipping by facing, and blitting the trimmed PNG at
`(ox − cellW/2, oy − bodyBottom) × scale`. No per-frame canvas processing
happens at runtime, which also means the game no longer cares about
canvas-tainting — though it should still be served over HTTP like any module
app.

## Regenerating

The extractor reads the v1 sheets, so it only matters if you want to re-run
history — the extracted PNGs in `assets/sprites/` are committed and
self-sufficient:

```sh
cd tools
python3 extract_sprites.py --src /path/to/v1/assets
```

Debug contact sheets (grid, tight bounds, detected foot lines) are written to
`tools/debug/<char>_contact.jpg`.

## Facing, sizing, and cleanup passes

Three more correction layers ship in the manifest, all curated frame-by-frame
against comparison boards (see `tools/debug/`):

- **`faceLeft`** — the sheets are drawn facing **RIGHT** by default; this was
  verified against every character's run row (all 17 run rightward, see
  `tools/debug/run_facing.png`). A minority of cells — mostly aiming/casting
  poses whose weapon or blast points the other way — are drawn facing left and
  carry `faceLeft: true`. The engine mirrors those so a fighter always looks in
  their logical direction.

  > **Polarity warning.** An earlier version of this table was inverted: it
  > listed the same frames as *right*-facing exceptions against a *left*-facing
  > default, which made **every character face backwards** in game (running
  > right while looking left). If characters ever look reversed again, check
  > this table's polarity before touching the renderer. The quick test: force
  > `f.facing = 1` on both fighters and confirm they look rightward.
- **`renderScale`** — dramatic technique cells and some imagegen crouch cells
  are drawn at a different zoom (Hakari's jackpot cell is ~30% oversized,
  Momo's crouch-attack ~35% undersized). 23 frames carry corrections so a
  fighter keeps one body size across animations.
- **Pixel repairs** — flat-white matte wedges (Sukuna r0c0/r1c2/r1c3), baked-in
  transparency checkerboards (Toji r2c1, Inumaki r3c1), and sub-60px pinholes
  in every frame (moth-eaten hair) are removed/inpainted at extraction time.

## Repaired source-sheet quirks

- **Momo's crouch row** now uses auburn-haired Kyoto-uniform replacement art.
- **Hanami's crouch row** now consistently uses the bark-bodied cursed-spirit
  design.
- **Toji's hurt frame** (`r2c3`) was replaced to remove doubled linework.
- **Sukuna's crouch row** now matches the Yuji-vessel uniform used elsewhere.
  `r4c2` needed one re-delivery: the first attempt came back semi-transparent
  (49% opaque) because the chroma key ate his pink hair and skin.
- **Mahito's left arm** unravels into hanging threads in several frames — it's
  drawn that way in every generation of the source art (and is, honestly, very
  Mahito).

Remaining quirks are content issues in the painted sheets, not extraction
bugs — fixing them means repainting those cells.

## Preparing delivered effect art

`tools/prep_effects.py` runs over `assets/sprites/effects/` and
`assets/sprites/summons/` after every delivery. Generated art arrives with
25-46% transparent padding, which matters because the renderer sizes a sprite
by its image height — padding makes an effect draw undersized and shifts it off
the projectile's collision center or off the ground line. The tool trims to the
alpha bounding box, drops keying specks, and downscales. It is idempotent.

## Delivered-art hygiene

Generated replacement art is checked on arrival for two failure modes that a
magenta chroma key introduces: **semi-transparent subjects** (body pixels below
full alpha, so the stage bleeds through) and **warm-tone loss** (pink hair and
skin sit near magenta and get keyed away). Sukuna's `r4c2` hit both. Prefer
true alpha output, or a neutral grey key, for characters with pink or red
palettes.

## Sizing: why `bodyH` is not a size control

Every delivered pose is generated to fill its canvas, so the raw art bbox is
near-identical across poses (measured 986-991 px for all 14 of Gojo's new
frames). `renderScale` is derived as `bodyH / artBBoxHeight`, which means the
**rendered size is driven entirely by the hand-set `bodyH` target** — and
because bbox height is not pose-invariant, matching bbox heights across poses
does *not* make the character look the same size.

This bit us: `ledge_hang` shipped with `bodyH` at ~53% of idle and rendered as a
tiny figure in all 17 characters. A hanging pose extends the silhouette
vertically, so its target must *exceed* the standing idle, not fall below it.
Corrected to `idle_a x 1.15`.

Automated correction is not available here. Head-size measurement — the obvious
pose-invariant proxy — is unreliable on this art: on Toji's run frames the
detector measures a "head" 478-606 px wide because it captures arms and torso.
Two separate attempts at automatic size normalisation produced worse results
than hand values.

**So sizing is a human-in-the-loop judgement.** `tools/size_review.py` renders
every pose at true in-game scale on a shared ground line with the idle head
height marked, and `workbench/` (see below) allows live adjustment.

### How big a character is overall

Per-*pose* size is `bodyH`, above. How big the *character* is comes from their
canon height — see [character-heights.md](character-heights.md). Briefly:
`heightCm` in characters.js becomes a head-height target, and `heights.js`
solves each character's draw scale from it. The sprite workbench's **Character
height** control edits that one number and rescales the whole sprite set.

### Replacing a sprite whose art is wrong

Placement problems are fixed in the workbench. Art problems are not — the file
itself has to change. The **Sprite needs replacement** checkbox marks that, and
its dropdown says *what* is wrong, because a wholesale redraw and a crop fix are
very different asks and a request that does not distinguish them is one someone
has to come back and clarify:

| Kind | Means |
|---|---|
| `replace` | redraw the sprite from scratch |
| `crop` | the framing or bounds are wrong |
| `alpha` | transparency is wrong or has hard edges |
| `bleed` | colour bleeds past the silhouette |

The kind is the flag's *value*, so there is one field rather than a boolean and a
reason that could disagree. `REPLACEMENT_KINDS` in `src/sprites.js` is the single
source of truth — `list_replacements.py` parses it from there — so adding a kind
is one line. A legacy `true` reads as `replace`.

The flag rides through the same export and apply path as everything else:

```
workbench  ->  Export  ->  apply_sprite_adjustments.py  ->  needsReplacement: true
python3 tools/list_replacements.py --markdown     # grouped by kind, for a request
```

The flag clears itself. `intake_import.py` rebuilds a frame's entry when new art
lands, which drops `needsReplacement` along with the anchors and measurements —
and it rolls back hand tuning first, because a nudge made to compensate for bad
art must not be inherited by the art that fixes it. `apply_sprite_adjustments.py`
records each hand-edited field's pre-edit value in `edited` so that rollback has
something to restore.

Flagging and importing are the two ends of one pipeline, so the list is always
what is still outstanding rather than a historical record.

### Catching poses that are sized wrong

`tools/audit_frame_sizes.py` compares every pose against the height its
animation state occupies across the size-reviewed roster — a crouch is short, a
ledge hang is tall — and reports the ones that fall outside it. It never
measures the art, which is what made the two earlier normalisation attempts
worse than hand values; it only compares one hand-set number against others.

```
python3 tools/audit_frame_sizes.py          # report
python3 tools/audit_frame_sizes.py --fix    # correct the outliers
```

Run it after importing a new character. Rounds 7-9 shipped without a size pass
and it found 41 broken poses across those six fighters and none across the
original 17 — including the same `ledge_hang` bug documented above, and `run`
frames rendering at 0.65-0.72x instead of the 0.82x every reviewed character
uses.

## Intake pipeline (round 6 onward)

Delivered art lands in `assets/intake/<char>/<frame>.png` and is **not** loaded
by the game. Three steps, each separable so a bad delivery stops at the door:

1. `tools/intake.py` — keys the background, straightens facing, measures body
   height / clipping / green fringe / holes, writes `assets/intake/_processed/`.
2. `tools/intake_sheets.py` — before/after boards labelled with the animation
   state each frame drives, for human approval.
3. `tools/intake_import.py --approve FILE` — copies approved frames into
   `assets/sprites/` and registers them.
4. `tools/bake_anchors.py` — measures the rotation pivot (and the ledge grip on
   a hang pose) for anything newly registered. Skips frames whose anchors were
   placed by hand, so it is safe to re-run over the whole roster.

Placement is delegated to `extract_sprites.generated_frame_meta`. A replacement
inherits the old frame's rendered height and foot line, so a swap changes art
and never size; a brand-new frame borrows the character's idle scale factor.

Step 4 exists because the sprites rotate now — see `docs/sprite-motion.md`. A
frame with no `anchors.com` still draws, falling back to a heuristic; it just
pivots less convincingly than a measured one.

### Keying, and why it is layered

Three passes, each narrower than the last, because a single rule cannot tell
background from art:

- **border flood fill** — key colour reachable from the canvas edge
- **strict pass** — unmistakable key colour anywhere, for background sealed
  inside the silhouette
- **flat-fill pass** — key colour that is also locally uniform; art over the
  same colour carries lineart and shading, background does not

Translucent motion trails drawn over the key come back tinted and defeat all
three. Those are cleared per-frame via `TINT_FIX` / `GREY_TINT_FIX`, named by a
reviewer, never swept.

**Facing is not automated.** `detect_facing` returned near-zero confidence on
two thirds of round 6. Only confident calls are acted on; the rest are marked on
the board and corrected via `FACING_OVERRIDE`.

## Alternate sprite sets

`manifest.alternates.<char>.<frame>` holds a second art set, opted into with
**Settings → Sprites: Default / Alternate**. Unlisted frames fall through to the
default set, so an alternate only ships the frames that differ. Hanami's
round-6 redesign is the first (8 frames).

## Summoned-curse sprites

`tools/extract_curses.py` lifts Geto's four cursed spirits and his rainbow
dragon out of the art they were drawn into, writing them to
`assets/sprites/effects/`. Baking a creature into a fighter frame means it
cannot move, be timed or be reused, and it inflates the fighter's bounding box.
As projectiles they do all three. His volley uses `spritePool`, drawing a random
curse per shot.

## Staging changes for upload

There is no VCS here, so `tools/collect_updates.py` tracks what still needs
uploading in `tools/.updates-ledger.json` — a map of every file ever staged to
the mtime it had when staged. The ledger lives beside the tool, NOT inside
`updates/`, because `updates/` is emptied after each upload.

    python3 tools/collect_updates.py --new     # what changed since last staged
    python3 tools/collect_updates.py --new --list

`--hours N` and `--since` still exist for one-off queries, but `--new` is the
one to use. A time window cannot tell "changed recently" from "changed a while
ago and never uploaded", and the second case is the one that loses work.
