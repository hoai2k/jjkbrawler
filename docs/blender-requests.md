# Blender requests — the far-arm deformation

Work that needs Blender and a person looking at the model. Nothing here can be
fixed from JS: the skeleton is provably doing the right thing and the mesh is
not following it.

## The report

Six fighters came back from the guard-hands review with the same shape of
complaint, all about the **far (left) arm**:

| fighter | what the reviewer saw |
|---|---|
| panda | "his left (far) arm is pulling body geometry along with it" |
| todo | "his left (far) arm is really long and bent strangely" |
| jogo | "his far arm (left) is deformed and huge" |
| sukuna | "his far arm is long and bendy" |
| gakuganji | "his arm is pulling along black geometry that should be white" |
| yuki | "her hand is big and flat with fingers bending upwards" |

It is most visible in the guard, because that is the pose that raises the far
arm across the body, but it is a property of the body rather than of the guard —
expect it in any pose that lifts that arm.

## What has been ruled out

**It is not the skeleton.** Posed in the guard, every one of these rigs has arm
bones that are exactly symmetric and unscaled — the left span equals the right
to three decimal places and every bone scale is 1.0:

```
panda      L 0.724  R 0.724   L/R 1.000   scale 1.0
todo       L 0.580  R 0.580   L/R 1.000   scale 1.0
jogo       L 0.624  R 0.624   L/R 1.000   scale 1.0
sukuna     L 0.416  R 0.416   L/R 1.000   scale 1.0
gakuganji  L 0.542  R 0.542   L/R 1.000   scale 1.0
```

The only asymmetric rig on the roster is Hanami (1.383), and nobody flagged
him. So the bones move correctly and the deformation is in the binding.

**It is not the arm being driven by bones that do not own it.** This is the
test the section below used to send somebody to Blender for — *rotate `LeftArm`
alone and watch what moves* — and it turns out not to need Blender at all.
Linear blend skinning is arithmetic, so posing one joint and measuring the
displacement of every vertex is a page of matrix code against the same buffers
the weight audit already reads. `tools/audit_arm_drag.py` does exactly that on
all 28 rigs in a few seconds:

```
python3 tools/audit_arm_drag.py                # worst first
python3 tools/audit_arm_drag.py --verbose jogo # which bones own the drag
```

It turns each arm 60° on its own and counts the vertices that move more than
2% of the model's height **and whose own dominant bone is outside the arm**.
Two things came out of it.

*The drag does not follow the flags.* Yuki is an order of magnitude worse than
anybody (28% of arm-influenced vertices on both sides, all of it Spine and
Spine1 — her arms are half welded to her torso), but after her the ranking runs
reggie 11%, hakari 8–12%, todo 6.5%, nanami 6.5%, gojo 6%, jogo 5.3%, and the
two remaining flagged fighters sit at the *bottom*: gakuganji 1.5%, sukuna
1.3%, below maki and uro who nobody complained about.

*There is one real mis-assignment, and it is not the fault.* Four rigs — jogo
(313 vertices), mahito (503), todo (49), reggie (35) — have arm skin driven by
the OPPOSITE arm's bones at 5% or more, which no body does; nobody else on the
roster has a single one. `tools/prune_arm_weights.py` removes exactly those and
renormalises (dry run by default). Applied to jogo it does what it says — his
drag falls from 5.3%/4.0% to 3.7%/2.4% — **and his guard looks identical**. So
the cross-arm weights are worth cleaning up on their own account, and they are
not what the reviewer saw. The prune has deliberately NOT been applied to any
rig on disk.

Note when reading that tool: the clavicles are excluded from the arm chain.
`LeftShoulder` and `RightShoulder` meet at the sternum and legitimately share
weight there — including them turns a finding about four rigs into a false
positive on all twenty-eight.

**It does not look like a bad symmetrize either, which was the leading theory.**
The suspicion was that the symmetrize pass copied bones without re-binding, so
one side's weights describe the other side's geometry. That has a signature,
and `tools/audit_arm_weights.py` (no Blender needed — it reads the glTF buffers
directly) went looking for it two ways. **Neither separates the flagged
fighters from the rest.**

By vertex count per arm chain, the flagged six are scattered through the middle
of the roster, and the three biggest asymmetries belong to fighters nobody
complained about:

```
uro         L 5994  R 3987   L/R 1.50          <- not flagged
hanami      L 4390  R 3522   L/R 1.25          <- not flagged
dagon       L 3262  R 2720   L/R 1.20          <- not flagged
sukuna      L 3172  R 2734   L/R 1.16   flagged
gakuganji   L 6956  R 6158   L/R 1.13   flagged
jogo        L 6850  R 6445   L/R 1.06   flagged
panda       L 5260  R 5146   L/R 1.02   flagged
todo        L 4772  R 4931   L/R 0.97   flagged
yuki        L 4531  R 6230   L/R 0.73   flagged
```

By inverse-bind-matrix mirror gap — which is what a copied bone with a stale
bind matrix would show — the ranking again does not follow the flags. Geto
(1.24), Hanami (1.02) and Nanami (0.75) are worse than Panda (0.20) and Jogo
(0.30), and only Yuki (1.13) is both high and flagged.

So: **do not start by re-running a symmetrize fix.** The evidence does not
support it, and a blanket re-bind would churn 28 rigs to chase something that
may not be there.

Caveat on the second test, stated so nobody over-trusts it: it assumes the rig
is authored symmetric about x=0 at bind, which an A-pose delivery with an
asymmetric costume need not be. The absolute numbers are therefore soft. What
is meaningful is that the ORDER does not correlate with the reports.

**And a caveat on that audit's `reach` column, which should be ignored.** It
locates bones by summing node TRANSLATIONS down the hierarchy and dropping
their rotations. On a rig whose bind is an A-pose that puts the arm bones
nowhere near the arms, so "how far the furthest influenced vertex sits from
the chain's own bones" is measured against the wrong points — which is why it
reads 0.44–0.88 of a body height for every fighter and both arms, a number no
real bind could produce. It is not that the column found no signature; it
could not have shown one. `audit_arm_drag.py` composes full TRS matrices and
is the one to trust on where a bone is.

## What to actually do

The branch this used to open with has been taken, and it came out the second
way. Steps 1 and 2 were "open jogo in Blender, rotate `LeftArm`, and see
whether geometry that belongs elsewhere travels with it" — `audit_arm_drag.py`
now answers that from the buffers, and the answer is **no, not enough to
matter**: the drag that exists is Spine and Spine1 (a shoulder blending into
the ribs, which is its job), it does not rank with the reports, and cleaning
up the one indefensible part of it changes nothing you can see.

So the live branch is step 3:

1. **The fault is in the weights' DISTRIBUTION, not their assignment** —
   vertices bound to the right bones in the wrong proportions, which reads as
   stretching without dragging. That is a re-bind of the arm chain, and it is
   the part that genuinely wants Blender: recomputing weights from geometry
   (heat or voxel bind) is a solver, not a buffer edit, and writing one here
   to avoid opening Blender would be the wrong trade.
2. **Gakuganji and Sukuna are the ones to open**, not jogo. They are the two
   flagged fighters with essentially no drag (1.5% and 1.3%, the bottom of the
   roster), so on them the distribution fault is the *only* thing left and
   whatever you see is it. Jogo's reading is muddied by a real but separate
   cross-arm mis-assignment; fix the clean case first.
3. **Gakuganji is still the useful cross-check.** "Black geometry that should
   be white" names the failure precisely: vertices belonging to one material
   are being moved by a bone that owns a different part of him. Whatever
   explains his case should explain the other five.
4. **Yuki is a different bug and is now measured.** Her arms drag 28% of their
   influenced vertices on BOTH sides — 1282 left, 1795 right, essentially all
   of it `Spine` and `Spine1`, an order of magnitude past anybody else. That is
   not the far-arm complaint (hers was "big and flat with fingers bending
   upwards", a hand) and it is not subtle; she wants her own look.
5. **The cross-arm prune is available and unapplied.**
   `tools/prune_arm_weights.py --apply <char>` cleans jogo, mahito, todo and
   reggie. It is correct and it is invisible, so it is left as a decision for
   whoever is next in these files rather than pushed into four binaries on its
   own.

## Running the audits

```
python3 tools/audit_arm_drag.py                 # what comes along when an arm lifts
python3 tools/audit_arm_drag.py --verbose jogo  # ...and which bones own it
python3 tools/prune_arm_weights.py              # the cross-arm influences, dry run
python3 tools/audit_arm_weights.py              # vertex counts per chain (see caveat)
```

None of them need Blender or any dependency — they parse the `.glb` directly.
`audit_arm_drag.py` is the one that answers a question about POSING, and is
therefore the one worth reaching for first; `audit_arm_weights.py` counts
vertices per chain, which is still a useful sanity check, but read its `reach`
column with the caveat above.

They are diagnostics, not gates. Neither found a signature that separates the
six, which is itself the finding — but they will catch a future rig whose arm
claims wildly more geometry than its mirror, or tows the other arm, which are
the obvious versions of this problem.

## When it is fixed

Re-bake and re-check:

```
node server.mjs &
node tools/derive_attack_envelopes.mjs    # twice — it is a fixed-point iteration
node tools/audit_strike_reach.mjs
```

Then reopen `/workbench/?edit=verification&set=guard-hands`. The six rejections
are deliberately not written into the manifest, so the queue is still asking
for all of them and will keep asking until somebody approves the new bodies.
Drag the stage to turn the model while judging — that is what the orbit is for.
