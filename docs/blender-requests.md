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

**It does not look like a bad symmetrize, which was the leading theory.**
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

## What to actually do

Start by looking, on one fighter, rather than by running a pass.

1. **Open `render3d/assets/jogo/jogo.glb` in Blender** — he is the most
   extreme report ("deformed and huge") and one of the cleaner rigs by both
   measures above, so whatever is wrong should be visible rather than
   statistical.
2. **Rotate `LeftArm` alone, 60° or so, and watch what moves.** This is the
   test `tools/blender_clean_weights.py` was written for on an earlier round:
   *"Round B1's fighter lifts his arm and part of his trousers comes with it —
   rotating `RightArm` alone moves 230 vertices whose own dominant bone is
   `RightUpLeg`."* If torso or costume vertices travel with the arm, it is the
   same class of fault and that tool is the fix.
3. **If the geometry stays put but the limb still distorts**, the fault is in
   the weights' distribution rather than their assignment — vertices bound to
   the right bones in the wrong proportions, which reads as stretching without
   dragging. That is a re-bind of the arm chain, not a prune.
4. **Gakuganji is the useful cross-check.** "Black geometry that should be
   white" names the failure precisely: vertices belonging to one material are
   being moved by a bone that owns a different part of him. Whatever explains
   his case should explain the other five.
5. **Yuki is possibly a different bug** and worth confirming separately: "big
   and flat with fingers bending upwards" is a hand, not an arm, and she is the
   only one of the six whose left arm claims FEWER vertices than her right
   (0.73). If her hand bones are fine and the mesh is flat, suspect the hand's
   own bind rather than the arm chain.

## Running the audit

```
python3 tools/audit_arm_weights.py            # whole roster
python3 tools/audit_arm_weights.py jogo panda # named rigs
```

No dependencies and no Blender — it parses the `.glb` directly. It measures
per arm chain: how many vertices it influences, how far the furthest influenced
vertex sits from the chain's own bones, and the bounding box of the influenced
set, all as fractions of model height.

It is a diagnostic, not a gate. It found no signature for this fault, which is
itself worth knowing — but it will catch a future rig whose arm claims wildly
more geometry than its mirror, which is the obvious version of this problem.

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
