# The pre-18E paintings moved — they are runtime art now

The twenty stage paintings the game wore before round 18E used to be archived
here. They are not an archive any more: the flat camera draws them, so they live
at **`assets/backgrounds/flat/`** under the same filenames.

Why: 18E repainted every board at 3200×1800 because the 3D camera shows only the
centre ~49% of a plate, and the outer ring it added is framing the flat camera
never needed. Flat mode showing the whole 3200×1800 frame is what made the
boards read as sparse — so flat mode was pointed back at the paintings it was
composed for, and `src/stages.js` / `src/assets.js` now pick the plate by camera
mode. Round 20B replaces the wide plates with extensions of these same scenes.

Three of them were never 1600×900 (`curse_maw` 1920×1640, `flooded_gate`
800×437, `shibuya_night` 1200×675 and still `.webp`), which is why the flat
lookup carries a filename override rather than assuming an extension.

Nothing else was in this directory. The pre-18E plates are still recoverable
from git history at this path if a bare archive copy is ever wanted.
