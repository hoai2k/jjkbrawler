# Asset Requests — outfit consistency & pose correctness

Everything here comes from two audits: **outfit consistency** (does a character
wear the same clothes in every frame?) and **pose appropriateness** (does the
sprite read as the action it plays for?). Both were done by eye, frame by
frame, across all 17 characters.

These are separate from [asset-requests.md](asset-requests.md), which covers
clipped and low-resolution frames.

---

## Delivery — read this first

**Deliver into `assets/intake/`, NOT into `assets/sprites/`.**

```
v2/assets/intake/<character>/<frameKey>.png
```

Nothing in `intake/` is loaded by the game. Each file gets compared against the
frame it replaces and against that character's `idle_a` before anything is
imported, because several past rounds introduced new problems while fixing old
ones — a corrected costume arriving at half the resolution, or a fixed pose
facing the wrong way. Reviewing at the door is cheaper than finding it later.

The frame key in the filename must match the table entries below exactly
(`todo/r4c0.png`), so the comparison can be automated.

Follow the **Delivery spec** in [asset-requests.md](asset-requests.md) — same
background, framing, resolution and style rules. Two additions learned since:

- **Key against magenta `#FF00FF`, never green.** Round 5 came back keyed off
  green and left a green halo on every soft edge — hair worst of all — across
  205 frames. Magenta appears nowhere on this roster. (Sukuna, Nobara, Momo and
  Hakari have pink/red palettes: use mid-grey `#808080` for those four.)
- **Give the head and limbs real headroom.** A recurring failure is art drawn
  with the top of the hair sliced flat. Nothing downstream can recover it.

---

## Part 1 — Outfit consistency

The rule: **every frame of a character must match that character's `idle_a`.**
Where a whole row disagrees, the row is wrong and idle is right, unless noted.

### 1.1 Highest priority — whole crouch rows in the wrong costume

These are four-frame sets (`r4c0`–`r4c3`) that read as a different character.

**`todo/r4c0`, `r4c1`, `r4c2`, `r4c3`**

> Aoi Todo in a crouching / low-stance fighting pose, wearing a **cropped open
> bomber jacket over a maroon tank top**, a **wide white sash at the waist**,
> and **dog tags**. Tall, heavily muscled, dark hair in a short topknot.

The white sash is the brightest thing on the character and it vanishes in every
current crouch frame; the existing art has him in a closed full-length navy
gakuran with a brown belt. Four poses: neutral crouch, low guard, low attack
windup, low attack strike.

**`momo/r4c0`, `r4c1`, `r4c2`, `r4c3`**

> Momo Nishimiya crouching, wearing a **single-breasted buttoned navy
> coat-dress with a brown belt**, **black lace-up boots**, **short auburn
> hair**, and a **witch hat with a plain brown band and gold buckle**. Her
> broom is with her.

Current art has her in a sailor uniform with a red neckerchief, pleated skirt,
brown loafers, longer hair and a red-banded hat — a different design entirely.
Four poses as above; `r4c0` doubles as her landing frame, so it must read as
*ducking*, not as sitting on the broom.

**`hanami/r4c0`, `r4c1`, `r4c2`, `r4c3`**

> Hanami, the plant cursed spirit, in a low crouching stance. **Mossy leaf
> clusters over the shoulders and torso**, an **antler-like branch crown**,
> bark-textured skin with wood-grain seams, **pink blossoms** (never white).

Current crouch art is a different design: solid dark bark, twiggy claw hands,
one large single blossom, no moss and no antler crown.

### 1.2 Character-wide split — needs a decision, not just art

**`sukuna` — 16 sheet frames vs 18 everywhere else.** Rows 0–3 (`r0c0`–`r3c3`)
wear a **draped black shoulder shawl and straw sandals with foot wraps**;
`idle_a`, the whole crouch row, and all 14 round-5 poses are **bare-shouldered
and barefoot with ankle wraps**. The shawl pops in and out as he moves.

Bare-shouldered is the larger group and matches his canon appearance, so the
recommendation is to **regenerate rows 0–3 without the shawl and sandals**:

> Ryomen Sukuna, **bare-shouldered**, black hakama-style trousers, **barefoot
> with ankle wraps**, four arms visible where the pose calls for it, dark
> markings across the face and torso, pink spiked hair.

That is 16 frames. If you would rather keep the shawl, the cheaper path is
regenerating `idle_a` plus the 14 round-5 poses *with* it — but that is 15
frames and fights his canon design, so I would not.

**`panda` — three-way accessory split.** `idle_a` and the 14 round-5 frames
have a **small teal shoulder badge**; the crouch row has **large teal wrist
cuffs with a panda emblem**; sheet rows 0–3 have **no accessory at all**.
Pick one and regenerate the other two groups. Recommendation: the **small teal
shoulder badge**, since it matches idle and the newest art — 20 frames
(`r0c0`–`r3c3` plus `r4c0`–`r4c3`).

### 1.3 Footwear and legwear nits — low priority

Cheap to batch, invisible at a glance, list them last.

| Frames | Currently | Should be |
|---|---|---|
| `hakari/r4c1`, `r4c2`, `r4c3` | white/cream low sneakers | **tan hiking boots** |
| `geto/r4c1`, `r4c2` | zōri sandals with white tabi | **dark boots** |
| `yuta/r4c1` | white low-top sneakers | **white lace-up boots** |
| `inumaki/r4c0` | tan/beige ankle boots | **white lace-up boots** |
| `gojo/run_a`, `run_b`, `jump_rise`, `fall`, `hurt`, `attack_up` | slim trousers with pointed dress shoes | **slim trousers with round-toe ankle boots**, matching `idle_a` |

---

## Part 2 — Pose correctness

### 2.1 The one systemic gap — `dodge`, all 17 characters

**Every character's dodge plays the sprint frame `r1c2`**, including the *air*
dodge. A grounded forward-sprint pose during a mid-air dodge is the most-seen
wrong pose in the game, and no existing frame reads as a roll or an air drift.

Two new frames per character, `dodge_roll` and `dodge_air` (34 total). If only
one is affordable, do `dodge_roll` — the grounded roll is far more frequent.

> **`dodge_roll`** — <character> mid **evasive forward roll**, body tucked,
> shoulder leading, knees drawn to the chest, low to the ground, motion blur
> behind. Reads instantly as *rolling*, not running.

> **`dodge_air`** — <character> **airborne mid-dodge**, body curled and turned
> away from the viewer, arms tucked, drifting sideways, a faint afterimage
> trail. Reads as *evading in mid-air*, not as jumping or falling.

Keep each character's own outfit and silhouette per Part 1.

### 2.2 New art for specific specials that show the wrong technique

Each of these plays a frame with no trace of the move it is named for. Ordered
by how badly the mismatch reads.

| Frame to replace | Move | Prompt |
|---|---|---|
| `maki/specialNeutral` (`r1c2`) | Cursed Tool Toss | Maki Zenin **hurling a cursed spear forward**, arm fully extended after the release, the weapon leaving her hand. Currently plays her dash frame, which she already uses for 4 different states. **No cursed-energy aura** — she has none. |
| `nobara/specialNeutral` (`r0c2`) | Hairpin / nail volley | Nobara Kugisaki **driving nails forward with her hammer**, several nails in flight, straw doll visible. She is currently just standing holding the hammer. |
| `geto/specialNeutral` (`r3c0`) | Rainbow Dragon | Suguru Geto releasing a **large serpentine dragon curse** coiling out of his hands. No dragon exists in the current frame. |
| `geto/specialSide` (`r3c2`) | Cursed Spirit Volley | Geto **flinging several distinct small cursed spirits** forward in a spread. |
| `geto/downHeavy` (`r2c2`) | Kuchisake-Onna's Scissors | Geto's curse **swinging giant scissors** downward. Currently duplicates his downHeavy. |
| `hakari/specialDown` (`r4c3`) | Reserve Balance | Kinji Hakari **spinning a pachinko reel of cursed energy**, jackpot imagery, arms wide in a showman's flourish. Currently a low sliding split. |
| `megumi/specialNeutral` (`r3c2`) | Nue | Megumi Fushiguro summoning **Nue, a great winged shadow bird** with crackling electricity. Currently a shadow maw — wrong shikigami. |
| `hanami/specialNeutral` (`r3c2`) | Cursed Buds | Hanami **scattering seed pods that sprout into wooden spikes**. Currently a generic purple magic circle. |
| `jogo/specialSide` (`r2c2`) | — | Jogo **launching a horizontal jet of flame** forward. Currently reuses his own downHeavy frame. |
| `hanami/specialSide` (`r2c2`) | — | Hanami **sweeping a horizontal lash of thorned vines**. Currently reuses his own downHeavy frame. |

### 2.3 Canon break — Maki and Toji

Both are documented in [characters.md](characters.md) as having **zero cursed
energy** — it is the defining trait of Heavenly Restriction — yet their heavies,
specials and ultimates all render purple cursed-energy auras.

Affected: `maki/r3c0`–`r3c3`, `toji/r3c0`–`r3c3`, plus the sideHeavy frames.

> Regenerate with **no cursed energy of any colour**. Impact should read as raw
> physical force: motion blur, air distortion, shockwave lines, dust and debris,
> sparks off steel. Weapons may gleam; nothing may glow.

This is the only request here that is a lore error rather than a visual one,
and it is worth doing — it is the single most character-defining thing about
both fighters.

---

## Part 3 — Free fixes, no art needed

Recorded here for completeness; these are `src/characters.js` edits and I can
apply them on request. They are listed so nobody generates art for them.

| Change | Effect |
|---|---|
| `nanami/downHeavy` → `r2c3` | currently reads as *being hit*; `r2c3` is an unused frame of him smashing his blade into the ground |
| `gojo/ult` → `["r2c0", "r2c3"]` | current frames are **red** (Reversal Red); these are purple, matching Hollow Purple |
| `gojo/specialNeutral` → `r0c3` | the blue palm burst, matching "Blue" |
| `sukuna/ult` → `["r3c1", "r2c3"]` | current first frame has **zero effect** — the flattest ultimate on the roster |
| `gojo/crouchAttack` → `["r4c3"]` | drops a frame that shows no attack at all |
| `sukuna/crouchAttack` → `["r4c3", "r4c2"]` | current first frame is a neutral crouch |
| `megumi/specialDown` → `r2c3` | currently identical to his dash *and* his dodge |
| `toji/specialDown` → `r2c3` | unused frame of him arched backward mid-air |
| `geto/sideHeavy` → `r1c3` | current frame shows a chain — Geto doesn't use chains |
| `geto/ult` → `["r2c1", "r3c3"]` | second frame currently duplicates his specialNeutral |
| `toji/ult` → `["r3c3", "r2c1"]` | currently reuses his own specialNeutral and sideHeavy |
| `hakari` specialNeutral → `r2c3`, specialSide → `["r1c3", "r3c1"]` | `r3c0` currently serves three "different" moves |
| `inumaki` ult frame 2 → `r3c3`, specialSide → `charge` | the charge frame shows him pulling his collar down to speak — his most in-character pose |
| `light` frame 1 reorder for gojo, hakari, megumi, todo, sukuna, nanami, mahito, nobara | frame 1 is a stance, not a strike; leading with frame 2 makes the jab read |

---

## Volume summary

| Group | Frames | Priority |
|---|---|---|
| Crouch rows in wrong costume (todo, momo, hanami) | 12 | **1** |
| `dodge_roll`, all characters | 17 | **1** |
| Maki + Toji cursed-energy removal | ~10 | **2** |
| Sukuna shawl removal (rows 0–3) | 16 | **2** |
| Wrong-technique specials | 10 | **2** |
| Panda accessory unification | 20 | 3 |
| `dodge_air`, all characters | 17 | 3 |
| Footwear/legwear nits | 11 | 4 |

Priority 1 is 29 frames and fixes the two things a player notices first: a
character changing clothes when they crouch, and everyone sprinting while they
dodge.
