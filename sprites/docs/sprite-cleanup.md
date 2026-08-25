# Full sprite cleanup — the runbook

**When the request is "do a full sprite cleanup", this is what it means.** It is
one command's worth of asking and a session's worth of work; the point of writing
it down is that the same four things happen every time, in the same order, and
nothing flagged gets quietly skipped.

Everything here is driven by flags set by hand in the
[sprite workbench](../workbench/). Nobody has to remember what was wrong with a
sprite — the flag on it says so, and this is the procedure that answers them all.

## The flags, and what each one means here

The two flags split by **who does the work**: `needsReplacement` needs an
artist, `wantsImprovement` needs this runbook. `REPLACEMENT_KINDS` and
`IMPROVEMENT_KINDS` in `sprites/src/sprites.js` are the source of truth.

Listed in the order the runbook works through them:

| Step | Flag | Kinds | Set where | What the cleanup does |
|---|---|---|---|---|
| 1 | `needsReplacement` | `delete`, on a pose with more than one drawing | Artwork dropdown | **Deletes that image** and makes sure the pose's canonical file is the drawing that was kept |
| 2 | `wantsImprovement` | `alpha`, `crop`, `bleed` | Improvement dropdown | **Attempts a fix in-place**, then shows you before/after to approve |
| 3 | `needsReplacement` | `quality`, `pose`, `character`, `alternate` | Artwork dropdown | **Cannot be fixed by tooling** — folded into the open asset request round. `alternate` asks for a second drawing beside the current one rather than a replacement for it |

Start by collecting them:

```bash
python3 tools/list_replacements.py            # grouped, for reading
python3 tools/list_replacements.py --json     # for driving the rest of the run
```

That is the complete worklist. A cleanup that does not begin here is guessing.

---

## 1. Deletions — discard the drawings we have replaced

`delete` is tagged on a **variant option**, not on a pose, because it names one
drawing out of several (`manifest.variants[char][pose].options`). It only appears
in the dropdown when a pose has an alternative to fall back to, so a deletion can
never leave a pose with no art.

For each tagged drawing:

1. **Check it is not the selected one.** `list_replacements.py` marks these
   loudly (`<- CURRENTLY SELECTED`). If the pose is still pointing at the drawing
   being deleted, stop and ask which drawing should be kept — do not guess.
2. **Promote the keeper into the canonical location.** The pose's canonical file
   is `sprites/assets/<char>/<pose>.png`. If the selected drawing lives somewhere
   else — typically `sprites/assets/<char>/alt/<pose>.png`, where
   `intake_variants.py` puts imported alternates — move it to the canonical path
   and update its `file` in both the pose's meta and its variant option.
3. **Delete the tagged image from disk** and remove its option from the variants
   list.
4. **Drop the variants entry entirely** if only one option is left. A pose with
   one drawing is a pose with no choice, and it should stop showing a chevron.

The end state is what you would have got by delivering the winning drawing in the
first place: the right art at the canonical path, no leftovers, no chevron.

---

## 2. Alpha, crop and bleed — fix in place, then show the work

These three say the drawing is right and its *pixels* are wrong, so they are
fixable without new art. `tools/intake.py` already contains the keying,
trimming and fringe-removal that would have caught them at import; the fix is to
run the affected frames back through it.

| Kind | What is wrong | What survives the fix |
|---|---|---|
| `alpha` | transparency is wrong or has hard edges | **keep** — same drawing, same bounds, so every measurement and anchor is still valid |
| `crop` | the framing or bounds are wrong | **reframe** — same drawing, different bounds; re-measure and shift anchors by how far the framing moved |
| `bleed` | colour bleeds past the silhouette | **reframe**, as above |

That mapping is `KIND_PLACEMENT` in `sprites/src/sprites.js` and it is not
optional: applying the wrong one silently resizes or displaces the sprite.

**The `alpha` fault that keeps coming back is the flood LEAKING IN, not a hard
edge.** `intake.py` decides what is background by flooding inward from the
canvas border through everything close to the key colour — and on a GREY screen
"close to the key colour" also describes the shading on a white robe. Wherever a
pale costume's shadow reaches the silhouette edge, the fill has a continuous
path into the middle of the drawing and takes it, so the sprite ships with holes
punched through the parts of it that were nearest the key.

It is the hardest keying fault to see, for two reasons that reinforce each
other: the holes are *inside* the figure rather than around it, so a silhouette
still reads correctly; and the fighters it happens to are the pale ones, whose
plates are keyed on grey precisely because they are pale. Hanami and Kashimo
lost 17% and 8% of themselves and both look fine at thumbnail size.

`FLOOD_NECK` in `tools/intake.py` is the guard — the fill runs on an eroded
candidate mask so a two-pixel bridge cannot carry it, then dilates back. If a
delivery predates that guard, re-key it through this step; the whole round-25
delivery was re-scanned for it and 34 of 250 plates needed it.

**And there is a SECOND way in, which the flood guard does not close.** After
the flood, `flat_key_mask` removes anything still sitting on the key colour and
locally uniform, on the reasoning that background sealed inside a silhouette —
the gap under a wing, between an arm and a hip — can never be reached by a fill
that starts at the border. That reasoning is sound and the test earns its keep:
it is what cuts Toji's 22,064px, Dagon's 20,990 and Mei Mei's 15,067.

It is also how the key colour gets *drawn*. Round 25's screen is a neutral grey,
and so is the shadow an artist lays on a white robe — not approximately, but
128,128,128 exactly, flat, thousands of pixels wide. Nothing about the region
says which it is. `flat_key_mask` cut 5.7% out of Kashimo, 6.7% out of Gakuganji
and 10% out of Hanami this way, always in the middle of a pale costume, and
every one of those poses came back from the workbench flagged for alpha.

What separates them is the company the region keeps: sealed background is fenced
by the drawing, never by the bright white of a garment it would be sitting in the
middle of, while a shading stroke lies ON the thing it shades. `shading_on_pale`
reads the ring of art 3 to 9 pixels out and declines the removal when a quarter
of it is that white. Over the whole delivery it saves 250,901px across 35 plates
and leaves every removal that was doing real work alone.

**On a garment that is not pale, nothing measurable separates them** — the body
of Gakuganji's guitar is drawn in the screen grey too, and a flat dark field
fenced by flat dark art is exactly what a real pocket looks like. That plate is
named in `KEY_IS_A_DRAWN_TONE` and the test is declined for the whole of it, the
way `GREY_TINT_FIX` is named.

**Judge those at full size, and only ever for one region.** `yuji/throw_back` was
put on that list from a downscaled overlay, where the region read as the lit
panel of his jacket; at full size it is the gap between his arm and his body, and
declining the test filled it with screen grey. The workbench sent it back the same
day. Naming a whole plate is the wrong shape of answer whenever the plate has
both kinds on it, which most of them do.

`SEALED_VERDICTS` is the right shape: a point in the DELIVERED image's own
pixels, labelled `background` or `figure`, which overrides the rules for the one
region containing it. The delivery is archived and never changes, so a verdict
survives every re-key. Nothing else about the region is assumed — the answer is
somebody's, not a measurement's.

**Do not reach for a sixth heuristic before reading this list.** Colour, local
variance, depth inside the silhouette, the ink in the fence, elongation, how much
survives erosion, and whether an unguarded flood would have reached it have all
been measured against regions labelled by eye on both sides. None of them
separates a shadow from a gap on this delivery, because the difference is not in
the image.

Round 26's ten flagged plates were settled that way — all 76 regions judged at
full size, one at a time. **Eight are the stage showing through; sixty-eight are
drawn on the fighter.** That ratio is worth knowing before touching this code
again: the sealed-pocket test is looking for something that is barely present in
this delivery, and it was wrong about roughly nine regions in ten. It is still
right often enough elsewhere — Toji, Dagon and Mei Mei — that turning it off is
not the answer either.

**The fix at the source is the screen colour.** A magenta or green key cannot
collide with a shadow, and `intake.py` already keys both. Every heuristic here
exists because a neutral grey screen was used for art that is itself neutral
grey; a delivery keyed on magenta needs none of it.

**Deliverable: a before/after contact sheet, plus a deep link per frame.** A
pixel fix cannot be reported as "done" in prose — it has to be looked at. So the
cleanup produces:

- one contact sheet with each fixed frame **before on the left, after on the
  right**, at the same scale, on a background that makes fringing visible
  (`tools/intake_sheets.py` renders these boards);
- a workbench deep link per frame so any one of them can be opened and judged
  against the live renderer rather than a still:

  ```
  http://localhost:5174/workbench/?char=<char>&frame=<pose>
  ```

Nothing is cleared until you have approved the sheet. If a fix did not work, the
flag stays on, and that frame moves to step 3 — re-flagged as a
`needsReplacement`, since the file could not be edited into the right picture
after all.

---

## 3. Redraws — fold into the open round

`quality`, `pose` and `character` all mean the same thing for this runbook:
nothing in the file can be edited into the right picture, so it needs an artist.
These become **asset requests**.

1. `python3 tools/list_replacements.py --markdown` produces the tables in the
   shape `docs/asset-requests.md` uses. Any description written beside a flag
   comes with it, as a "What is wrong" column — that text is the part an artist
   could not have worked out from the pose name, so keep it in the request.
2. Add them to the **current open round**, not a new one — the whole point is
   that a delivery arrives as one batch. At the time of writing that is round 12.
3. Lead with the kind, because it decides how much detail the request needs.
   A `character` fault is answered by pointing at the canon reference and
   nothing else; a `pose` fault needs the brief to say what the body should be
   doing, since the drawing will otherwise come back good and still wrong.
4. Every request line carries its pose line and the fighter's canonical reference
   (`assets/reference/canon/<char>_idle.png`), because a redraw that does not
   match the rest of the set just becomes the next cleanup's problem.

---

## 4. Report back

A cleanup ends with a short written summary, not a silent commit:

- what was **deleted**, and which drawing now occupies each canonical path;
- what was **fixed**, with the contact sheet and the deep links;
- what was **filed** as a request, and into which round;
- what was **left alone**, and why — a tagged drawing that turned out to be the
  selected one, a fix that did not take, anything ambiguous enough to need a
  decision.

That last section is the important one. The flags are a to-do list maintained by
hand over months, and the failure mode of a cleanup is not doing the wrong thing
— it is doing most of it and leaving no record of the rest.

---

## The flags also steer the next import

A flag is not only a to-do item for a cleanup — it is standing instruction for
what should happen when new art arrives for that pose. `intake_variants.py
--plan` reads it and routes each incoming plate:

| Flag | Incoming art |
|---|---|
| any `needsReplacement`, or the selected drawing tagged `delete` | replaces it outright; nothing kept |
| any `wantsImprovement` | added as a variant **and selected**, old kept |
| unflagged | added as a variant, selection unchanged |

So flagging a sprite is worth doing even when no cleanup is imminent: it decides,
in advance and correctly, what the next delivery does with it.

## Clearing flags

Flags clear themselves at the far end of the pipeline: `intake_import.py`
rebuilds a frame's manifest entry when new art lands, which drops
`needsReplacement` and `wantsImprovement` with the rest of the old settings.
Flagging and importing are the two ends of one loop, so
`list_replacements.py` is always "still outstanding" and never a historical
record.

The one thing that does **not** clear itself is a `delete` tag, because nothing
gets imported to trigger it — step 1 removes the option and the tag together.
