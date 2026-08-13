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

## If it ever needs to come back

The frames and their measurements are complete, so this is recoverable — but
the code that read them is not here. Restoring it means: putting the PNGs back
under `sprites/assets/hanami_alt/`, merging `manifest-alternates.json` back into
the sprite manifest as `alternates`, and reinstating the loader and Settings
paths (`spriteSet` / `setSpriteSet` / `hasAlternate` in `src/assets.js`, the
`settingsSpritesButton` handler in `src/ui.js`). The commit that removed them is
the reference for what that was.

Worth knowing before doing any of that: the alternate-set path had a real bug in
it, fixed once and documented at `nativeLeftApplies()` in `src/assets.js` — a
`nativeLeft` guess measured against the DELIVERED drawing was allowed to speak
for a different drawing offered later, which brought sprites up mirrored while
the workbench's Mirror box showed them unmirrored. The scoping that fixed it
stayed, because per-pose variants have the same shape. Anything reviving this
should read that comment first.
