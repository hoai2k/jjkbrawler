# `hanami_alt` — the retired tree design

Hanami's original look: a bark-and-foliage tree body, cherry blossoms in the
shoulders, a wooden mask. It was his delivered design for most of the project's
life, and this directory is everything that is left of it.

**It is retired, not deleted.** Nothing in the game loads any of it, and no
request asks for more of it. It is kept because a design that shipped for that
long is worth being able to look at again.

## Why it went

Canon Hanami is a lean pale humanoid curse — black brushstroke stripes, antler
horns, one shoulder wrapped in white cloth — and the tree body was never that.
Round 17A redrew his whole 36-pose set from
[`assets/reference/canon/hanami_anime.png`](../canon/hanami_anime.png), the set
was approved pose by pose, and the canon design became the one the game draws.

For a while the tree design survived alongside it as an **alternate art set**: a
Settings toggle (`Sprites: Default / Alternate`) swapped a character's whole
look, and Hanami was the only character who ever had one. That machinery is
gone now — one toggle, one character, one retired design is not a feature — so
what remains is these files.

## What is here

| | |
|---|---|
| `*.png` | The eight frames that differed from the default set. An alternate only ever carried the frames that changed; everything else fell through to the main set, which is why there are eight rather than thirty-six. |
| `manifest-alternates.json` | The `alternates` block exactly as it was in `sprites/assets/manifest.json` — the placement, sizing and anchors each of those frames was tuned to. |
| `hanami_card.jpg` | His hero card in the tree design, the same file kept at [`cards_previous/tree_hanami/`](../cards_previous/tree_hanami/). |

`r4c0`–`r4c3` are sheet-era keys, from before the conversion to one sprite per
action. They are what the frames were called; they are not poses any current
code knows about.

## It is not coming back

Retired for good, said here so nobody has to work it out from the silence. The
last references to it — six dead variant options on four sheet-era poses,
pointing at files that left the sprite tree with the feature — came out of
`sprites/assets/manifest.json` when the design was written off; they were also
the one thing `tools/canonicalise_sprites.py` refused on, so the whole roster's
drawings could not be given their canonical names while they were there.

What is kept is what is above: eight pictures and the numbers they were tuned
to, because a design that shipped for most of the project's life is worth being
able to look at. Nothing loads them, nothing asks for them, and no code path
reads `manifest-alternates.json` — it is a record of how those frames were
placed, not a file the game or the tools will ever open. Reviving the design
would mean redrawing it, not restoring it, and the commit that removed the
alternate-set machinery is the reference for what that machinery was.
