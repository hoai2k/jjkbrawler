# assets/intake — where delivered art is dropped

**Upload new art here, not into `assets/sprites/`.**

```
assets/intake/<character>/<pose_key>.png     e.g. assets/intake/yuji/idle_a.png
assets/intake/effects/<name>.png             e.g. assets/intake/effects/sedan.png
assets/intake/summons/<name>.png
assets/intake/cards/<key>_card.jpg
```

Nothing in this directory is loaded by the game, which is the whole point:
generated art arrives as an untrimmed plate on a magenta or grey field with no
alpha channel, and dropping that straight into `assets/sprites/` makes the game
try to draw a 1024×1536 background as a sprite. Every round so far has arrived
that way, so this is the normal case, not a mistake.

## What happens to it

1. `tools/intake.py` keys the background, straightens facing, and measures body
   height / clipping / fringe / holes → `assets/intake/_processed/` (gitignored).
2. `tools/intake_sheets.py` renders before/after boards for approval.
3. `tools/intake_import.py --approve` copies approved frames into
   `assets/sprites/<char>/` and registers them in `manifest.json`.
4. `tools/bake_anchors.py` measures each new frame's centre of mass.
5. `tools/auto_tune.py` applies the placement corrections that are mechanical —
   the ground contact, the centring, and the size of the states the whole roster
   sizes alike. It never touches a field you have edited, and it does **not**
   count as an edit: the poses stay on the workbench's to-do lists, because a
   rule cannot say whether this drawing looks right. See
   [docs/sprite-auto-adjust.md](../../docs/sprite-auto-adjust.md).
6. The untouched originals are moved to `assets/reference/round<N>/<char>/` so a
   frame can be reprocessed later without regenerating it.

After that this directory is empty again, apart from this README.

Step 3 also records which poses it landed on top of previous work, since a redraw
rolls the hand tuning back and that work has to be done again. Those poses are
the sprite workbench's **All Recently Updated Poses** list — a round's worth of
re-tuning, gathered across every character it touched, instead of a hunt through
the roster for the ones you remember having tuned. See
[docs/asset-pipeline.md](../../docs/asset-pipeline.md#finding-what-the-round-overwrote).

## What happens to a plate is decided by the flag already on the pose

The workbench flags say what is wrong with the art the game currently draws, so
they are also the instruction for what incoming art should do about it. Nobody
has to decide twice.

The two flags split by **who does the work**, and that is what decides the
disposition. `needsReplacement` means the drawing is wrong and only a redraw
answers it, so art delivered against one is the verdict. `wantsImprovement`
means the drawing is fine and the *file* is wrong — a bad key, a bad crop,
colour past the silhouette — which is repo work; art delivered against one is a
second opinion, and the original stays to switch back to. `REPLACEMENT_KINDS`
and `IMPROVEMENT_KINDS` in `src/sprites.js` are the source of truth for which
kind is which.

| Flag on the existing pose | What the new art does |
|---|---|
| nothing registered under this name | **imported as the pose itself** |
| `needs replacement: quality / pose / character`, or the selected drawing is tagged `delete` | **replaces the old art outright.** It was condemned; keeping it would leave the chevron offering a drawing we already decided to throw away |
| `needs replacement: alternate` | **imported beside the old art, selection unchanged, and marked new.** The request asked for a second opinion, so selecting it here would answer the question it was raised to ask. The pose goes on the workbench's updated list with a dot on its chevron, because nothing else about this delivery is visible |
| `wants improvement: alpha / crop / bleed` | **imported as a variant AND selected.** The complaint was about the file, not the drawing, so the old one stays available in case the new one is worse |
| no flag at all | **imported as a variant, selection unchanged.** Nobody asked for this pose to change, so the choice is made by eye later |

The kinds were the other way round until [19efd99]: `replace` sat beside `fix
alpha` under `needsReplacement`, and pose and quality complaints — the ones only
a redraw can answer — were filed as the softer wish. Anything written before
that split, in a commit message or an older doc, uses the old names.

```bash
python3 tools/intake.py                       # key everything
python3 tools/intake_variants.py --plan       # what each plate will do, and why
python3 tools/intake_variants.py --auto --label "Round 9 upload"
```

`--auto` handles the variant cases itself and writes an approvals file for the
replacements and new poses, which `intake_import.py` applies — that tool owns the
placement rules and the flag clearing, and there is no reason to have a second
implementation of either.

## Art that is different rather than better

Steps 3–6 above answer "this art replaces what shipped". Art that is a genuine
alternative — a redraw that may not beat the incumbent, a second costume, a
wind-up that reads as a strike — takes the other path:

```
python3 tools/intake_variants.py --survey       # what is here and what it would become
python3 tools/intake.py                         # key it, as always
python3 tools/intake_variants.py --import-all --label "Round 7 unused"
```

That lands the drawing at `assets/sprites/<char>/alt/<pose>.png` and adds it to
`manifest["variants"]` as another option for that pose, **without changing what
the game draws**. Its placement is measured from scratch, because it is a
different drawing — placement belongs to the image, not the pose. Choosing which
drawing a pose actually uses is then done by eye in the sprite workbench, via the
chevron on any pose that has more than one.

`--survey` is the thing to run on a folder whose contents you are unsure of: it
reports, per plate, whether it has been keyed yet and whether the pose it names
is already registered, already carries that exact drawing, or is new.

## Why it is tracked by git

`_processed/` is gitignored, but `assets/intake/<char>/` is not. Art is
delivered by uploading it to the repository, so an ignored directory would
silently swallow the upload. Raw plates live here only until they are
processed, then move to `assets/reference/`.
