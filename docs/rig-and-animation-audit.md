# Rig, skin, pose and animation — a roster audit

What the 28 delivered bodies are actually like, and what the engine does with
them. Everything here is measured rather than remembered; the tool that
produced each table is named next to it, and every one of them runs without
Blender.

Read it as a triage list, not a verdict. Several findings are cheap to fix and
one or two are load-bearing enough that fixing them will move poses somebody
has already reviewed — those are called out as such rather than acted on.

**Contents**

- [Part 1 — the rigs](#part-1--the-rigs)
- [Part 2 — the skins](#part-2--the-skins)
- [Part 3 — the poses](#part-3--the-poses)
- [Part 4 — the animation](#part-4--the-animation)
- [What to do, in order](#what-to-do-in-order)

---

## Part 1 — the rigs

`python3 tools/audit_rig_quality.py`

The skeletons are in good shape and boringly consistent, which is the right
answer: 23–29 joints, every one of the twenty core bones present on every
fighter, no bone anywhere carrying a rest scale other than 1, and weights that
sum to 1.0000 on all 28. There is nothing to chase in the numbers a rigger
would normally check first.

Two things are worth knowing anyway.

### 1.1 Every rig carries a second pelvis, and the engine grabs the wrong one

The hierarchy on all 28 deliveries is

```
Armature > Hips > mixamorig:Hips > Spine > …
```

`Hips` is a wrapper left by the retarget and it sits **on the floor**. The real
pelvis is `mixamorig:Hips`, about 0.82–0.92 m up:

| fighter | `Hips` y | `mixamorig:Hips` y |
|---|---|---|
| jogo | 0.000 | 0.829 |
| maki | 0.000 | 0.919 |
| sukuna | 0.000 | 0.864 |
| momo | 0.000 | 0.820 |

`mannequin.js` already knows — it disambiguates structurally, picking "whichever
candidate has the leg bones as children", and its comment records that the
naive lookup "is where the old proxy's post up the middle came from". But that
fix lives only in the mannequin. Every pose layer still does the naive thing:

- `ik.js:886` — *level the pelvis* in the idle stand
- `pose.js levelFeet` — the crouch's foot-levelling solve
- `pose_library.js:148` — the root of the chain a library pose is applied down

All three therefore rotate a node **at the fighter's feet** when they mean to
rotate the pelvis. Rotating about the floor tips the whole body; rotating about
the pelvis rolls the hips under a spine that stays put. The idle-stand comment
says as much about its intent — "costs nothing above the waist (the spine keeps
its own rotation, so a lean stays a lean)" — and that is not what the code can
be doing.

**This is the highest-value finding in the document and it is also the most
disruptive to fix.** `crouch_orient.js` exists precisely to correct where the
foot-levelling solve leaves the body, and its angles were dialled by eye against
a solve pivoting at the floor. Correcting the pivot invalidates them. The fix is
two lines plus a re-review of one bench queue, and it should be done together,
not separately.

The cheap half can land on its own: give the engine the same structural
`bone()` resolver the mannequin already has, in one shared place, so a future
delivery with a different wrapper does not reintroduce this quietly.

### 1.2 Arm spans are symmetric, with one exception

Left arm chain length over right, from bone positions:

- 26 of 28 rigs: **1.000**
- `hanami`: **1.383** — his left arm chain is 38% longer than his right
- `hanami_tree`: 0.973, `uro`: 0.991 — within authoring noise

Nobody has flagged Hanami, and an asymmetric character is a legitimate thing to
draw. Worth one look to confirm it is intentional rather than a retarget slip;
it is the only skeletal asymmetry on the roster.

---

## Part 2 — the skins

The skins are where the roster's real problems are, and the useful lesson of
this audit is that **none of them are visible in the weights**. Three separate
passes measured weights and none separated the six fighters the guard review
flagged. What separates them is measuring the posed surface.

### 2.1 Tearing — the far-arm deformation, solved

`python3 tools/cut_weld_triangles.py`

Skin the mesh in the idle and again in the guard and compare every triangle's
area. A skin barely changes area; a triangle that comes back three times bigger
is being torn. Triangles over 3× (worst-of five arm-lifting states):

| | | | |
|---|---|---|---|
| jogo **512** ⚑ | mahito 191 | choso 122 | dagon 39 |
| yuki **371** ⚑ | nanami 189 | yuji 117 | toji 28 |
| panda **287** ⚑ | geto 188 | sukuna 80 ⚑ | megumi 23 |
| gakuganji **233** ⚑ | reggie 138 | inumaki 79 | momo 19 |
| yuta 197 | hakari 133 | hanami 73 | nobara 4 |
| | todo 122 ⚑ | mechamaru / gojo 52 | |

⚑ = flagged by the guard-hands review. **The four worst rigs on the roster are
all flagged, and the bottom of the table is fighters nobody complained about.**
No weight statistic came within sight of that separation.

Narrow it to triangles that are also *enormous* — 50× the median triangle — and
the visible artefact falls out. Measured before any repair:

| fighter | sheet triangles | posed area | share of body surface | |
|---|---|---|---|---|
| gakuganji | 41 | 7743 cm² | **11.3%** | ⚑ |
| nanami | 26 | 3518 cm² | **9.5%** | |
| panda | 22 | 4708 cm² | **7.9%** | ⚑ |
| hakari | 18 | 1565 cm² | **4.3%** | |
| yuta | 8 | 492 cm² | 1.9% | |
| jogo | 7 | 987 cm² | 1.5% | ⚑ |
| gojo | 3 | 298 cm² | 1.1% | |
| todo | 2 | 135 cm² | 0.3% | ⚑ |
| yuji / mahito / geto | 1 each | <100 cm² | ≤0.3% | |
| the other 18 | 0 | — | — | |

That is a **weld**, exactly as `cut_fused_limb.py` describes it: the generator
built one surface across the gap between an arm and the ribs, invisible in the
bind as a fold and stretched into a sheet the moment the arm lifts. Gakuganji's
"black geometry that should be white" was one eighth of his skin.

Note that two of the six worst were never flagged. Nanami at 9.5% is worse than
Panda, and Hakari at 4.3% worse than Jogo; neither is in the guard-hands queue,
because the queue is the ten fighters somebody happened to be shown. The
measurement found them anyway, which is the argument for having it.

**Fixed on the six that carry a real sheet** — gakuganji, nanami, panda,
hakari, jogo, todo. The triangles are dropped from the index buffer, nothing
else is touched, and all six now measure 0. Verified in the bench: Gakuganji's
chest slab, Panda's shoulder wing and Nanami's sleeve webbing are gone and the
far arm reads as an arm. The hole is deliberate — `cut_fused_limb.py` is
emphatic that capping the rim rebuilds the membrane.

The one-to-three-triangle cases (yuta, gojo, yuji, mahito, geto) are left
alone: at that size a single large triangle can be legitimate geometry, and
they are not worth touching a binary for.

**Not fixed, and worth saying plainly.** Yuki and Sukuna have *no* sheet by this
test, so "her hand is big and flat with fingers bending upwards" and "his far
arm is long and bendy" are a different fault — shape rather than surface — and
Todo's two triangles do not account for "really long and bent strangely" either.
Those three are still open, and they are the ones that may genuinely want
Blender.

### 2.2 Two theories that were tested and are wrong

Recorded because both are the obvious next guess and both cost time.

**A bad symmetrize.** Ruled out in `docs/blender-requests.md` and confirmed
here: `tools/audit_arm_drag.py` finds true cross-arm influence — one arm's skin
driven by the other arm's bones — on exactly four rigs (jogo 313 vertices,
mahito 503, todo 49, reggie 35) and on nobody else. `tools/prune_arm_weights.py`
removes it. Applied to jogo it does what it says, and his guard is
pixel-identical. Real, worth cleaning, not the fault. Still unapplied.

**Weight smoothing.** A discontinuity in the weight field is a plausible reading
of a tearing surface, and Laplacian smoothing over the torn region made it
**worse** — jogo went from 834 torn triangles to 1110 and his worst ratio from
53× to 92×. That is the right result for the wrong theory: blending distant
bones together is what tears a skin, so smoothing adds tearing. Do not reach for
it here.

### 2.3 Binds are hard-edged, and it correlates

Average bones per vertex, and the share of vertices driven by exactly one bone:

| fighter | infl | rigid % | | fighter | infl | rigid % |
|---|---|---|---|---|---|---|
| kurourushi | 2.77 | 9.5 | | maki | 1.77 | **60.4** |
| panda | 2.62 | 16.2 | | momo | 1.66 | **54.2** |
| mahito | 2.60 | 25.3 | | gojo | 1.87 | 53.2 |
| yuki | 2.57 | 33.4 | | nobara | 1.89 | 47.7 |
| jogo | 2.55 | 17.5 | | yuta | 1.97 | 47.3 |

The spread is wide and it is not a style choice — it is where each generator's
binder happened to land. The two ends fail differently: over half of Maki's
mesh is driven rigidly by one bone, which creases at every joint, while the
most-blended rigs (jogo, panda, yuki, mahito) are four of the five worst
tearers. There is no roster-wide target to enforce, but a delivery arriving at
1.7 or at 2.8 influences is worth a look before intake rather than after.

### 2.4 Mesh fragmentation

Connected components of at least 8 vertices, roster median ≈ 170:

- `reggie` **883** — five times the median, an outlier by a lot
- `uro` 297, `gakuganji` 291, `yuki` 265, `hanami_tree` 263
- `panda` 72, `nanami` 98, `jogo` 101 — the tidiest

Fragmentation is normal for these generators — they are patchworks, not
manifolds — and it mostly costs nothing. It matters in one place: it decides
whether a hole can be filled, which is why `fill_model_holes.py` has to be used
by hand. Reggie is worth a glance in case the count means something visible.

---

## Part 3 — the poses

`node tools/check_pose_reads.mjs`, `node tools/check_battle_poses.mjs`

### 3.1 The whole roster wears one fighter's poses

This is the structural fact everything else in Parts 3 and 4 follows from.

- **1443 poses across 28 characters**, none hand-placed per fighter.
- Two libraries: 44 **matched** frames authored against Yuji's sprite sheet
  (`battle_poses.js`), and 33 **baseline intents** keyed off the pose brief
  (`baseline_poses.js`).
- Matched poses are keyed by FRAME NAME, not by character, so every fighter
  whose frame names match gets Yuji's body. In practice that is all of them:
  every state resolves to matched poses, and the baseline only catches 20
  grid-named frames (`r0c0`, `r0c1`, …).

So there is exactly one set of acting choices on the roster, and it was made for
a 1.73 m teenage boy. It is worn by a bear (2.00 m), a barrel (2.15 m), a
machine with pauldrons (2.05 m), a 1.50 m witch and a 2.20 m flower.

That is a defensible starting point and the codebase argues for it well. But it
is also the single biggest ceiling on how good this can look, and it is why the
per-fighter dials in §3.2 exist at all.

### 3.2 What per-fighter tuning exists

Everything the roster can say about its own body, from the manifest:

| dial | fighters carrying it | range |
|---|---|---|
| `yawOffsetDeg` | 24 of 27 | delivery framing correction |
| `armDeg` (idle arm hang) | 27 of 27 | 8° – 23° |
| `stanceDeg` (idle foot width) | 25 of 27 | 0 – 22.25° |
| `renderScale` | 21 of 27 | — |
| `guardOpenDeg` | **10 of 27** | 8, 8, 8, 8, 8, 8, 8, 12, 14, 16 |
| `idleArms: false` | 1 of 27 | — |

Four dials, all of them about *standing*: which way the body faces, how wide the
feet are, how far the arms hang, how big it draws. Only one dial —
`guardOpenDeg` — reaches a pose the fighter actually fights in, and seven of its
ten values are the same 8°, which reads as a default that got approved rather
than ten judgements.

**Nothing on the roster can say anything per-fighter about a strike, a crouch,
a hurt or a landing.** That is the gap.

### 3.3 Coverage and known departures

The pose checks pass and the numbers are healthy:

- 44 matched frames cover all 44 of Yuji's sheet; 2 are left to the gait cycle.
- 33 baseline intents cover all 1443 frames, and all 33 are reached — no dead
  intents, no uncovered frames.
- 8 declared contact frames; 23 intents planted on the ground.
- 6 of 44 matched poses depart from their brief by more than 26°, and all six
  carry an argument (the crouch is a sprinter's three-point set rather than the
  brief's squat; the aerial's striking limb is a leg).

### 3.4 The guard shell is authored for one body and shows it

`battle_poses.js` says so itself: the tables "describe a 1.75m human, and on a
bear, a barrel and a machine with pauldrons the same two angles bury the fists
in the chin". The shell was opened 16° at the elbow for the whole roster and
`guardOpenDeg` is the per-fighter remainder.

Measured in the guard across the roster, the *legs* are the part nobody has
tuned and they are identical by construction — knee angles 30°/34° on all 28,
foot split 0.24–0.34 of height. Momo (1.50 m) sits at 0.286, mid-range, and
is not an outlier on any of them, which is worth recording because it means her flagged
"awkward legs" is **not** a short-body scaling bug with a mechanical fix. It is
a pose that wants authoring for a short body.

Two things *are* roster-wide and look wrong, and both are one pose affecting all
28 fighters.

**The rear foot hangs in the air.** In the guard the lead toe sits on the floor
(0.000 of height, all 28) and the rear toe sits 2–6% of height above it — 10 cm
on Hakari, 9 cm on Gakuganji, 8 cm on Momo. That is not a raised heel, which
would be correct for a boxing stance; the *toe* is clear of the ground, so the
whole rear foot is off the floor. Nothing catches it because the foot IK only
pushes feet that have sunk BELOW the line back up.

**Three fighters stand in the floor.** The same measurement, the other
direction, lead foot:

| fighter | lead toe | |
|---|---|---|
| jogo | −0.044 | 8 cm below the ground |
| sukuna | −0.017 | 3 cm below |
| hanami | −0.008 | 2 cm below |
| everyone else | 0.000 | on it |

Jogo is standing shin-deep. `standOnGround` drops the body until its lowest foot
is on the line, so a foot this far under means the sole is being measured
somewhere the geometry is not — most likely the same wrapper-vs-pelvis confusion
as §1.1, since the drop is computed against the armature node.

---

## Part 4 — the animation

### 4.1 There are no delivered animations at all

Not one character in the manifest carries a `clips` entry. Every frame of
motion in the game is built at load time by interpolating pose-library keys
(`pose_clips.js`). The engine contract is honest about this and enforces it —
the contact beat is an exact sample, a looping clip's last key equals its
first, and no engine motion is baked in.

The consequence is worth stating in one line: **the animation quality of this
game is exactly the quality of 44 poses plus two gait cycles.**

### 4.2 Every state is two poses

All 38 states schedule exactly **two** frames each. `light` is 0.30 s of
interpolation between two poses. `sideHeavy` is 0.55 s between two poses. `win`
is 1.2 s between two poses.

Two keys can carry a strike — the sheet's `_a`/`_b` convention is a wind-up and
a contact, and the presentation layer turns the body through the swing to sell
it. Two keys cannot carry an *arc*: there is no anticipation-overshoot-settle in
a two-key clip, no follow-through that is a different shape from the contact,
and no secondary offset between hip, shoulder and hand. Everything eases
linearly from pose A to pose B.

The two exceptions prove it. `walk_cycle.js` and `run_cycle.js` are hand-authored
from **eight poses each** (nine keys, closing the loop), and they are the only states that read as motion rather than
as a cross-fade — and they are also the only states with a passing gait check:
worst planted-foot rise 2.8% of height, least support 50% of the cycle.

**The single highest-value animation change available is a third and fourth key
on the attacks.** A wind-up, a contact, a follow-through that overshoots, and a
recovery is four poses; the machinery to schedule them already exists and is
already used by the gait cycles.

### 4.3 Where the strikes land

`node tools/audit_strike_reach.mjs` — 150 poses across 25 rigs.

- Worst extension **68%**, worst off-target **3°** (thresholds: ≥85% extended,
  ≤12° off).
- Exactly one pose is not trying: `maki sideHeavy`, 83% extended, 21 px short.
- 105 poses aim beyond the limb's reach, which is expected and fine — the arc is
  drawn at the true distance.

This layer is in good shape and is doing the heavy lifting that the two-key
clips cannot: the reach solver puts the hand where the aim solver sent it,
regardless of what the two poses said.

### 4.4 Timing

The state table is coherent and the beats are placed sensibly — contact at
roughly the first third of a strike (light 0.083 of 0.30, heavies 0.167 of
0.55), which is a fast, readable game. Nothing to change.

What is missing is *variation*: every light attack on the roster is 0.30 s with
contact at 0.083, every heavy 0.55 s with contact at 0.167. A grappler and a
speedster have identical timing. That is a design choice as much as a technical
one, and it is a lever nobody has pulled.

### 4.5 Presentation

The per-state presentation angles (`PRESENT_STATE_DEG`) are a genuine strength
and recently fixed to reach the flat path: a stand keeps its three-quarter
portrait, travel and strikes turn out toward profile, and an attack turns
*through* the swing from 46° at the wind-up to 88° at contact. Combined with
`FACE_KEEP_DEG`, which lets a fighter's head decline part of the body's turn,
this is doing more for how the animation reads than the poses themselves are.

---

## What to do, in order

1. **Share the mannequin's structural bone resolver with the pose layers**
   (§1.1). Three call sites are rotating a node on the floor when they mean the
   pelvis. Land the resolver and the `crouch_orient.js` re-review together,
   because the fix moves every fighter's crouch.
2. **Give the attacks four keys instead of two** (§4.2). The biggest visible
   return in the document, and the scheduling machinery already exists.
3. **Fix the guard's floating rear foot, and the three fighters standing in the
   floor** (§3.4). One pose and one ground solve, all 28 fighters.
4. **Author a short-body guard** (§3.4) — Momo's item from the guard-hands
   queue, which is a pose decision and not a dial.
5. **Look at Yuki, Sukuna and Todo's far arms** (§2.1). No sheet, so a
   different fault; theirs is the shape of the limb rather than the surface,
   and it is the one thing left in this area that may genuinely want Blender.
6. **Run `prune_arm_weights.py` on jogo, mahito, todo and reggie** (§2.2) when
   somebody is next in those files. Correct, invisible, not urgent.
7. **Confirm Hanami's 1.383 arm asymmetry is intended** (§1.2).
8. **Give a few fighters their own timing** (§4.4), if the design wants it.

## Running everything here

```
node server.mjs &
python3 tools/audit_rig_quality.py        # skeletons, binds, fragmentation
python3 tools/cut_weld_triangles.py       # tearing and sheets (needs the server)
python3 tools/audit_arm_drag.py           # what an arm drags with it
python3 tools/prune_arm_weights.py        # cross-arm influence
node tools/check_pose_reads.mjs           # pose coverage
node tools/check_battle_poses.mjs         # libraries, contacts, guard, crouch
node tools/audit_strike_reach.mjs         # where the strikes land
node tools/smoke_render3d.mjs             # gait cycles
```
