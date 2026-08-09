# Full sprite cleanup — the runbook

**When the request is "do a full sprite cleanup", this is what it means.** It is
one command's worth of asking and a session's worth of work; the point of writing
it down is that the same four things happen every time, in the same order, and
nothing flagged gets quietly skipped.

Everything here is driven by flags set by hand in the
[sprite workbench](../workbench/). Nobody has to remember what was wrong with a
sprite — the flag on it says so, and this is the procedure that answers them all.

## The flags, and what each one means here

| Flag | Set where | What the cleanup does |
|---|---|---|
| `delete` | Artwork dropdown, on a pose with more than one drawing | **Deletes that image** and makes sure the pose's canonical file is the drawing that was kept |
| `wantsImprovement` (`alpha`, `crop`, `bleed`) | Improvement dropdown | **Attempts a fix in-place**, then shows you before/after to approve |
| `needsReplacement` (`quality`, `pose`, `character`) | Artwork dropdown | **Cannot be fixed by tooling** — folded into the open asset request round |

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
   is `assets/sprites/<char>/<pose>.png`. If the selected drawing lives somewhere
   else — typically `assets/sprites/<char>/alt/<pose>.png`, where
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

These three — the improvement kinds — say the drawing is right and its *pixels*
are wrong, so they are fixable without new art. `tools/intake.py` already
contains the keying, trimming and fringe-removal that would have caught them at
import; the fix is to run the affected frames back through it.

| Kind | What is wrong | What survives the fix |
|---|---|---|
| `alpha` | transparency is wrong or has hard edges | **keep** — same drawing, same bounds, so every measurement and anchor is still valid |
| `crop` | the framing or bounds are wrong | **reframe** — same drawing, different bounds; re-measure and shift anchors by how far the framing moved |
| `bleed` | colour bleeds past the silhouette | **reframe**, as above |

That mapping is `REQUEST_PLACEMENT` in `src/sprites.js` and it is not
optional: applying the wrong one silently resizes or displaces the sprite.

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
flag stays on, and that frame moves to step 3 as a replacement request.

---

## 3. Replacements and unfixable improvements — fold into the open round

`needsReplacement` means a different drawing is needed, and an improvement the
in-place fix could not deliver still needs an artist. Neither is fixable by
tooling from here, so both become **asset requests**.

1. `python3 tools/list_replacements.py --markdown` produces the tables in the
   shape `docs/asset-requests.md` uses.
2. Add them to the **current open round**, not a new one — the whole point is
   that a delivery arrives as one batch. At the time of writing that is round 9
   (accuracy and polish) and round 10 (one sprite per action).
3. Keep the two priorities separate in the request. A `needsReplacement` is
   blocking: something on screen is wrong. A `wantsImprovement` is not, and
   burying them together means the blocking ones wait behind the wish list.
4. Every request line carries its pose line and the fighter's canonical reference
   (`idle_a` — see 10B in the requests doc), because a redraw that does not match
   the rest of the set just becomes the next cleanup's problem.

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
| `needsReplacement` (any kind), or the drawing tagged `delete` | replaces it outright; nothing kept |
| `wantsImprovement` (any kind) | added as a variant **and selected**, old kept |
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
