# The import defaults, re-measured

[sprite-auto-adjust.md](sprite-auto-adjust.md) asked whether the numbers an
intake round lands at are wrong in a *predictable* way, answered yes for three
of them, and built `tools/auto_tune.py` out of the answer. That measurement ran
against 1,605 corrections over 23 fighters. The manifest now holds **3,170
corrections over 1,543 poses and 35 fighters** — roughly twice the evidence —
and asking the same question again gives some different answers.

Everything below re-runs:

    python3 tools/audit_import_defaults.py            # all three reports
    python3 tools/audit_import_defaults.py --foot     # or one of them

It reads the manifest, the art and `src/characters.js`, and writes nothing.

---

## What changed since the first measurement

| Finding | Status |
|---|---|
| The foot line is one fraction of body height for the whole roster | **Wrong.** It is one fraction *per animation state*, and the spread between states is five times the spread within one |
| Ten animation states are sized by one ratio, and the tool detects them | **Off.** The detector now passes exactly one state — `idle` — and the cause is six fighters' idle frames, not the states |
| Size cannot be defaulted, only corrected | **Wrong for the same reason `ox` was.** There is no do-nothing option for size either, and the rule that is already computed beats the default in place by half |
| `ox` from the alpha-weighted centroid | **Right, and beatable.** On the poses where the centroid fails, the answer is already in the manifest next to it |
| `rotationDeg` and `faceLeft` are not automatable | **Still true**, and the rotation case is now weaker than "no signal" |

Two defects fell out of the audit on the way: `walk` and `teeter` are invisible
to every state-based tool, and `centroidX` goes stale the moment anybody moves
a sprite sideways.

---

## 1. The foot line is one number per state, not one number

The 0.946 fraction is real — a foot drawn in perspective hides its sole, so the
figure stands above the lowest drawn pixel — but it describes a body **standing
still**. Split the 1,010 hand-set ground contacts by the state their pose
serves and the single number comes apart:

| State | n | median | sd | |
|---|---:|---:|---:|---|
| `prone` | 35 | **0.626** | 0.114 | lies flat; the whole side touches |
| `downHeavy` | 30 | 0.908 | 0.053 | |
| `crouch` | 47 | 0.918 | 0.040 | |
| `charge`, `land`, `grabReach` | 79 | 0.923–0.929 | 0.031–0.036 | |
| `idle`, `light`, `ult`, `shield`, `win`, `hurt`, … | ~450 | **0.935–0.952** | 0.017–0.043 | the standing family the 0.946 came from |
| `dash`, `dashAttack` | 48 | 0.980–0.985 | 0.017 | |
| `run` | 128 | **0.990** | **0.014** | |
| `dodge_roll` | 5 | 1.365 | 0.156 | contact *below* the drawing |

The standing family is tight around the constant. Everything that is moving is
not: a running or dashing contact is the ball of an extended foot, and there is
no hidden sole to allow for. `run` is the clearest case in the whole dataset —
128 corrections, sd 0.014, and **all 128 were auto-tuned to 0.946 first and
then moved back up by a person**, a median +45 thousandths of body height.

That correction is not history. It repeats every round, because the tuner keeps
producing the same starting point:

```
  87 poses  Apply the round-12 placement pass ...   median +51px, 86 of 87 upward
   8 poses  Land round 23's effect and summon plates       +54px, 8 of 8 upward
   8 poses  Round 22A and 22E–22H intake                   +54px
   4 poses  Place Dagon and Mechamaru                      +54px
   4 poses  Place Yuki, cut the ledges out of two sprites  +57px
   ... and eight more rounds like it
```

Round 12's commit message says it plainly — *"the run cycle and prone poses
placed by hand"*. Four run frames per fighter, on all 34, is the busiest
drawing in the game, and every delivery of it lands 4.5% of body height into the
floor and is then lifted out by hand.

### What it is worth

Scored against the hand values, leaving each character out of the data that
taught the rule, in the pixels a player sees (image error × `renderScale`, on
~230px fighters):

| Rule | median | 90th pct | within 2% of body height |
|---|---:|---:|---:|
| foot = lowest pixel (what `generated_frame_meta` derives) | 14.3px | 33.7px | 24% |
| flat 0.946 | 8.5px | 20.1px | 36% |
| per character, airborne declined — **today** | 6.9px | 21.1px | 43% |
| **per state × that character's level** | **4.8px** | 16.7px | **54%** |

Where the gain comes from is more interesting than the median. The per-state
rule is not uniformly better by a little; it is dramatically better on the
states the single number cannot describe, and a wash on the ones it can:

| State | today | per state |
|---|---:|---:|
| `fall` | 43.0px | 11.7px |
| `jump` | 38.7px | 15.0px |
| `prone` | 34.6px | 6.8px |
| `dodge_air` | 28.4px | 16.8px |
| `run` | 11.8px | 3.0px |
| `dash`, `dashAttack` | 8.0–9.8px | 3.7–5.2px |
| `idle`, `win`, `sideHeavy`, `hurt` | 1.8–4.4px | 2.1–6.6px |

### Declining is not free

`NO_STANDING_FOOT` makes the tuner refuse `prone`, `jump`, `fall`, `ledge`,
`dodge_air` and `airLight`, on the reasoning that a body in the air has no foot
line to solve and a rule that guesses one is worse than no rule. The refusal is
sound and its *consequence* is not: what refusing leaves behind is the
pipeline's own derivation, which pins the lowest drawn pixel to the floor. That
is not neutral, it is the one answer the rule was written because it knew to be
wrong — 43px of on-screen error on a `fall`, against 11.7px for that state's
own measured fraction.

The same argument the first measurement used to justify applying `ox` applies
here: **every imported frame is given some foot line, so there is no
do-nothing option.** The choice is between two estimators, and one of them is
four times worse.

`prone` is the sharpest version. Its hand fraction is 0.626 with 35 samples —
a rule as strong as any in the file — and the tuner declines it into a default
that is 37% of body height out. `prone` does not need to be excluded from a
per-state rule; it needs to be *in* one.

### What does not work

The obvious anatomical predictor — the hidden sole is a foot's depth, so scale
the offset by the drawn foot rather than by body height — loses, the same way
every measurement-based idea in the first audit lost to a constant:

| Predictor, standing states only | median |
|---|---:|
| per-state fraction | **4.3px** |
| offset = 0.281 × the widest run in the bottom 8% of the body | 8.1px |

---

## 2. The size rule switched itself off, and it is six idles

`tools/auto_tune.py --report` today:

```
size: 1 uniform state(s), 31 judged per character
  RULE   idle             ratio 1.000  spread   0.1%  n=34
  judged ledge            ratio 1.150  spread   1.3%  n=17
  judged win              ratio 1.000  spread   1.3%  n=17
  judged hurt             ratio 0.805  spread   1.3%  n=17
  ... six more at exactly 1.3% ...
```

`idle` is the frame every ratio is measured *against*, so its 1.000 is an
identity and the size rule effectively does nothing. Nine states sit just over
the 1% gate, all at the same 1.3%, which is the shape of one cause rather than
nine.

The docstring already suspected as much and named three fighters. It is six,
and they are findable exactly:

| | level | idle_a `bodyH` | the legacy `r0c0` cell |
|---|---:|---:|---:|
| jogo | 0.970 | 268.1 | 260.0 |
| nobara | 0.971 | 299.7 | 291.0 |
| inumaki | 0.973 | 258.1 | 251.0 |
| yuta | 0.974 | 289.6 | 282.0 |
| sukuna | 0.974 | 294.6 | 287.0 |
| megumi | 0.978 | 301.8 | 295.0 |
| everyone else | 1.000 | *equal to* `r0c0` | |

Those six had their idle re-placed at a `bodyH` 2.3–3.0% larger than the sheet
cell it replaced, and nothing re-sized the rest of their set against it.
`learn_sizes` reads `idle_a` first and falls back to `r0c0`, so for six
fighters the denominator moved and every ratio of theirs moved with it.

Measure the same nine states against `r0c0` instead and the error is not small,
it is **zero**: all six land at 1.000. Remove a per-character level factor
(median polish) and the spreads collapse:

| State | spread | spread, level removed |
|---|---:|---:|
| `hurt`, `fall`, `win`, `upHeavy` | 1.3% | **0.0%** |
| `shield`, `ledge`, `charge`, `dizzy`, `jump` | 1.3% | **0.1%** |
| `land` | 10.8% | 10.4% |
| `run`, `light`, `crouch`, `crouchAttack`, … | 10–25% | unchanged |

So the nine states are still exactly rules. Nothing about the art changed;
a measurement got contaminated by its own reference frame, the gate did what it
was built to do, and the size rule has been dark for every import since.

Two things follow.

**In the game**, those six fighters render every non-idle pose about 2.7%
smaller than the roster convention — a fighter's on-screen size is solved from
the idle's span (`src/heights.js`), so an idle sized 2.7% large makes everything
else 2.7% small. It is a step, not a drift: it happens the instant they leave
idle. Six of 34 fighters carry it.

**In the tool**, learning the ratio with a per-character level removed makes the
detector immune to this class of contamination, without loosening the gate that
`tools/test_auto_tune.py` guards. A fighter whose reference frame moves stops
poisoning nine states for everybody.

One correction to the docstring while it is being edited: `land` is listed
among the ten uniform states and has never been one. It is 10.8% before the
level is removed and 10.4% after.

---

## 3. Size has no do-nothing option either

The size rule is written as a correction — act only where the answer is certain
— and that is the right shape for a *re-tune*. It is the wrong shape for an
import, because an imported pose is given a size whether anybody has an opinion
or not. What is it given? `intake_import.place()` keeps the predecessor's
rendered height, or the idle's `renderScale` for a pose with no predecessor.

Scored against the 1,413 hand-set `renderScale` values, as relative error in
rendered height:

| What sets the size | median error | 90th pct |
|---|---:|---:|
| the value the human corrected (the import default in place) | **14.9%** | 40.9% |
| the idle's `renderScale`, for a pose with no predecessor | 12.2% | 39.0% |
| the character's own median `renderScale` | 8.9% | 24.2% |
| **the state's height ratio × the character's idle** | **7.3%** | 23.4% |

The last row is the rule `learn_sizes` already computes and then declines to
apply, because its spread across the roster is 10–25% rather than ~0%. Both
things are true: it is far too imprecise to *correct* a pose a human sized, and
it is twice as good as what an imported pose gets today. Applying it as a
**derivation** — only ever replacing a number the pipeline produced, never one
a person chose, exactly the standing the `centre` rule already has — halves the
size error on arrival.

That leaves the judged states judged. A pose landing 7% out is still a pose
somebody has to size; it is just no longer 15% out.

---

## 4. `walk` and `teeter` are invisible to every state-based tool

`audit_frame_sizes.named_anims` resolves module-scope animations written as

```js
const RUN_ANIM = { frames: RUN_CYCLE_FRAMES, fallback: [...], fps: 13 };
```

with the regex `const (\w+) = \{ frames: `, which requires `frames:` on the
same line as the brace. `WALK_ANIM` and `TEETER_ANIM` are written across
several lines, so neither resolves, and `walk` and `teeter` are missing from
every character's state map in `auto_tune.py`, `audit_frame_sizes.py` and
`build_variants.py`.

That is 102 poses — both walk contacts and the teeter, on all 34 fighters —
which no size rule can see and which the foot rule treats as state-less. Their
measured hand fraction is 0.986: they belong with `run` and the dash, not with
the standing family.

The parser's own docstring records this bug being fixed once already, for
`RUN_ANIM`, when it made "the busiest sprites in the game" look undrawn. Same
regex, same shape, two more animations.

**This fix must land with the per-state foot rule, not before it.** Today
`walk` and `teeter` are state-less, so the tuner leaves them near the
pipeline's 1.0, which is 0.014 from the hand answer. Make them visible while
the foot rule is still one flat number and they would be tuned to 0.946
instead — 0.040 away, three times worse.

---

## 5. Where the centroid fails, the answer is already next to it

`ox` is derived from the alpha-weighted centroid, and against the 396 hand-set
values it is worth what the first audit said. But the manifest carries a second
horizontal opinion about every frame: `anchors.com`, the pivot rotations turn
about. Where nobody has touched it, it *is* the centroid. Where somebody has
dragged it in the workbench, it is a person's judgement of where the body is.

| Population | n | centroid | com anchor |
|---|---:|---:|---:|
| all | 396 | 8.7px | 4.8px |
| com is the bake (== centroid) | 157 | 4.4px | 4.4px |
| **com was placed by hand** | 239 | **12.0px** | **5.2px** |

The split is the finding. The centroid is not mediocre everywhere — it is good
(4.4px) on frames whose mass really is where it looks, and it is 12px out on
exactly the frames where a person has already recorded that it is not: a
naginata, a guitar neck, an effect blooming off one shoulder. On those, the
correction has already been made, in a field written for another purpose, and
the placement rule is not reading it.

**A pose carrying a hand-placed `com` should take its `ox` from the com, not
from the centroid.** It costs nothing, it never overrides a hand-set `ox`, and
the "is this the bake or a judgement?" test is one comparison against the art.

For a genuinely new import there is no hand-placed com yet, so the centroid
stays the derivation — this is about the second and third pass over a fighter,
which is most of the pipeline's traffic.

### `centroidX` goes stale the moment a sprite is moved

`centroidX` is stored in **cell** space, so `centroidX - ox` is the centroid in
the image's own pixels and should never move. `intake_import.reframe_placement`
keeps that true across a re-crop. Nothing else does: the workbench's horizontal
control and `auto_tune`'s own `ox` write both move the drawing and leave
`centroidX` where it was.

    stored `centroidX - ox` more than 2px from the art's own centroid: 1110 of 1771
      of the 1122 frames whose `ox` was moved after import: 1075
      of the 649 frames whose `ox` was never moved: 35

Nothing is visibly broken today: `auto_tune` re-measures the art rather than
trusting the field, and `defaultCom` in `sprites/src/sprites.js` — which reads
`centroidX - ox` as its pivot fallback — only fires for a frame with no baked
`anchors.com`, and every frame has one. It is a loaded gun rather than a wound:
the field says something false about 63% of the manifest, and the next reader
who trusts it gets a pivot displaced by every sideways nudge the sprite has
ever had. Either update it where `ox` is written, or drop it and measure.

---

## 6. What a redraw throws away

A replacement rolls the tuning back — `intake_import.pristine()`, on the
reasoning that the tuning existed to compensate for art that is now gone. The
cost of that, across the manifest's whole history:

| | `bodyBottom` | `ox` | `renderScale` |
|---|---:|---:|---:|
| hand placements made | 1,338 | 516 | 1,801 |
| hand placements discarded by a later delivery | 317 | 117 | 382 |
| poses placed by hand more than once | 180 | 60 | 230 |

816 hand placements thrown away, 470 poses placed at least twice. The reasoning
is right about the *absolute* numbers — a new drawing has new bounds, and the
old foot line in cell pixels means nothing against it. It is wrong about the
*fraction*. Where a discarded foot line was later re-placed by hand, the two
human answers agree to a median **0.002 of body height**, and 57% land within
0.01 of each other.

The character stands the same way in the redraw as in the drawing it replaces,
because it is the same character in the same pose. Carrying the foot **fraction**
across a redraw — and the `ox` as an offset from the centroid rather than as a
cell coordinate — keeps the part of the tuning that is still true and costs
nothing when it is not, because the magnitude guard catches a fraction that no
longer fits the art.

---

## 7. Rotation and facing, re-checked

**`rotationDeg`** — 157 poses now carry one, up from 118. "No signal" was
generous: there is a weak one. The sign is consistent within a state (`shield`
100% positive over 12 poses, `light` 75%, `ult` 83%) and the median tilt is
+3°. But the field is unset on 92% of the manifest and the applied values are
3–4° with a 5° spread, so the default of *nothing* is already within a few
degrees of every pose that has an opinion. Automating it would move sprites by
less than the noise in the thing being predicted. The exception is
`dodge_roll`, where the median is 40° — a roll is not a lean, and a state
default there would be a different rule from this one.

**`faceLeft`** — 86 frames across 25 fighters, still all off→on, still
scattered one to sixteen per character rather than clustering by delivery.
Nothing about a round predicts it, `detect_facing` still scores near zero
confidence, and mirroring a character by accident still looks deliberate. No
change: this stays a human's call.

---

## What to do about it, in order

1. **Learn the foot fraction per state** rather than once, keeping every guard
   that is already there (per-character level, the 20% magnitude refusal, never
   overwriting `edited`). Retire `NO_STANDING_FOOT` in favour of those states'
   own measured fractions, since declining hands the pose back to the estimator
   the whole rule exists to replace. 6.9px → 4.8px overall; 43px → 12px on a
   `fall`, 35px → 7px on a `prone`, 12px → 3px on every run frame of every
   fighter.
2. **Re-measure the six idles** (jogo, nobara, inumaki, yuta, sukuna, megumi),
   and learn size ratios with a per-character level removed so the next
   reference frame that moves does not switch nine rules off silently. Restores
   auto-sizing for `hurt`, `fall`, `jump`, `shield`, `ledge`, `win`, `upHeavy`,
   `charge` and `dizzy`, and removes a 2.7% size step six fighters carry in
   game.
3. **Apply the state size ratio as a derivation** on import, with the standing
   the `centre` rule already has: only over a number the pipeline produced.
   14.9% → 7.3%.
4. **Fix `named_anims`** so `walk` and `teeter` resolve — *with* step 1, never
   before it.
5. **Seed `ox` from a hand-placed `com`** where there is one; keep the centroid
   where there is not. 12.0px → 5.2px on 60% of the poses that get a hand `ox`.
6. **Carry the foot fraction across a redraw** instead of resetting it, and
   either maintain or remove `centroidX`.

None of this removes the placement pass, and the first audit's warning against
claiming otherwise holds. What each one moves is the starting point: an import
that lands 15% out on size and a foot line inside the floor is a pass that
corrects, and an import that lands within a few pixels is a pass that checks.
