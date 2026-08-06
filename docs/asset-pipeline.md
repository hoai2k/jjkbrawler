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
