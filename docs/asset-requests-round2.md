# Asset Requests — Round 2 (character-wide design splits)

Held separately from [asset-requests-outfit-pose.md](asset-requests-outfit-pose.md),
which is already in flight. Nothing here blocks that batch.

These are the two cases where a character's art disagrees with *itself* across
enough frames that the fix is a design decision rather than a correction. Both
were surfaced by the outfit audit; both need a choice made before generation.

Same delivery rules as the outfit/pose batch:

- **Deliver into `assets/intake/<character>/<frameKey>.png`** — not into
  `assets/sprites/`. Nothing in `intake/` is read by the game, so each file can
  be checked against the frame it replaces before import.
- Key against **magenta `#FF00FF`**, never green. Sukuna's palette is pink/red,
  so use mid-grey `#808080` for him.
- Body at least **600px tall**; generous headroom around hair and limbs.
- Facing **right**.
- Style suffix from [asset-requests.md](asset-requests.md).

---

## 1. Sukuna — the shoulder shawl

**The split.** 16 frames wear a **draped black shoulder shawl** and **straw
sandals with foot wraps**: the whole of sheet rows 0–3 (`r0c0`–`r3c3`). The
other 18 — `idle_a`, the crouch row `r4c0`–`r4c3`, and all 14 round-5 poses —
are **bare-shouldered and barefoot with ankle wraps**. The shawl appears and
disappears as he moves between idle, running and techniques.

**Recommendation: drop the shawl.** Bare-shouldered is the larger group, it
matches `idle_a`, it matches the newest art, and it matches his canon
appearance. Regenerate the 16 sheet frames.

Character block for all 16:

> Ryomen Sukuna the King of Curses from Jujutsu Kaisen, **bare-chested and
> bare-shouldered**, muscular, spiky salmon-pink hair, four eyes, black tattoo
> band markings across his face, chest and arms, dark loose hakama-style
> trousers with a black sash, **barefoot with ankle wraps** — no shawl, no
> scarf, no sandals

Frames: `r0c0`–`r0c3`, `r1c0`–`r1c3`, `r2c0`–`r2c3`, `r3c0`–`r3c3`. Pose lines
per the **B. Poses** table in [asset-requests.md](asset-requests.md); row 0 is
attacks, row 1 movement, row 2 air, row 3 techniques.

*If you would rather keep the shawl*, the cheaper route is regenerating
`idle_a` plus the 14 round-5 poses with it — 15 frames instead of 16. I would
not: it fights his canon design and the newest art is the art you will keep
longest.

## 2. Panda — the accessory

**The split.** Three groups, no two agreeing:

| Frames | Accessory |
|---|---|
| `idle_a` + all 14 round-5 poses | small **teal shoulder badge** |
| `r4c0`–`r4c3` (crouch row) | large **teal wrist cuffs** with a panda emblem |
| `r0c0`–`r3c3` (sheet rows 0–3) | **nothing** |

**Recommendation: standardise on the small teal shoulder badge.** It matches
idle and the round-5 art, and it is the least visually intrusive of the three.
That means regenerating **20 frames** — rows 0–3 plus the crouch row.

> Panda from Jujutsu Kaisen, a large anthropomorphic panda with black and white
> fur, muscular build, **a small teal cursed-energy badge on his left
> shoulder** — no wrist cuffs, no other accessories

Frames: `r0c0`–`r3c3` and `r4c0`–`r4c3`.

*Cheaper alternative*: standardise on **no accessory**, which is the largest
single group (16 frames) and would mean regenerating only `idle_a` plus the 14
round-5 poses — 15 frames. It loses the one bit of colour on an otherwise
black-and-white character, which is why it is second choice rather than first.

---

## Volume

| Item | Frames |
|---|---|
| Sukuna — shawl removal | 16 |
| Panda — badge standardisation | 20 |

Both are lower priority than anything in the outfit/pose batch: they read as
inconsistency during motion rather than as an outright wrong costume, and
neither affects how a move plays.
