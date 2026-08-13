# 3D Asset Requests — open requests (the D-rounds)

**This file asks for MODELS and CLIPS. Every 2D image any render mode needs —
including the reference boards these rounds are generated from — is in
[docs/image-requests.md](../../docs/image-requests.md), the single
image-request document.**

Everything the `?render=3d` backend needs generated: **rigged, toon-ready 3D
models and animation clips**. This file is the render3d sibling of
[billboards/docs/asset-requests.md](../../billboards/docs/asset-requests.md)
and follows the same rules: everything here is **outstanding**, delivered
rounds move to a history file when the first one lands, and round numbers
(D1, D2…) are permanent so commits citing them keep resolving.

**Current status: nothing delivered — the pipeline is built and waiting**
(phase D0: live playback, on-twos sampling, toon ramp, ink outlines, foot IK,
turnaround, stage lighting, intake, workbench review and inheritance all run
today against the mannequin, which `?render=3d` stands in for every
fighter without a delivered rig; see
[plan.md](plan.md)). **D1 is the round to draw against.**

The 2D image inputs this track needs (Tripo seeding boards, face sheets,
shade-palette swatches, eye/mouth textures) are requested separately in
[image-requests.md](image-requests.md) — deliver those to the 2D intake, not
here.

---

## One asset truth, two backends

**The billboard delivery spec applies VERBATIM.** Read
[billboards/docs/asset-requests.md](../../billboards/docs/asset-requests.md)
first — units (metres, real height from its roster table), orientation (Y-up,
facing +Z, origin between the feet), T-pose bind, the standard Mixamo-named
skeleton, `Prop_*` prop bones, `Chain_<name>_<i>` physics chains, mesh budget
(≤30k tris standard / ≤60k bulk, ≤4 influences), baseColor-only ≤2048px, the
26 named clips with their durations and contact beats, aim-neutral strikes,
no baked engine motion, and the three sharing tiers (library / archetype /
identity). One commissioned rig serves both backends; **any rig already
approved for billboards is a valid intake candidate here** — drop it in
`render3d/intake/` and run the flow below.

### The D-spec additions (this backend only)

A delivery that also wants to look its best under the anime pass adds, in
the same `.glb`:

1. **Shade-bias (ILM) map** — grayscale, one value per baseColor texel,
   **packed as the baseColor texture's alpha channel** (glTF material extras:
   `"shadeBias": "baseColorAlpha"`). 0.5 is neutral; darker forces the texel
   into shade early (underside of the jaw, hair clumps, cloth folds); lighter
   holds the lit side late (the face plane). A rig without one renders with
   the neutral bias — legal, but the face will read "shader", not "drawn".
2. **Outline width channel** — vertex color, channel **R**, 0–1, default 0.5.
   0.5 = nominal line, 1.0 = double (jaw, silhouette), near 0 = hairline or
   none. A mesh (or material) can opt out entirely with extras
   `"outline": false` (eye whites, effect cards).
3. **Edited normals, baked in.** Face normals transferred from a smoothed
   proxy so the terminator sweeps the face as ONE clean arc; hair normals
   combed along clump direction. **This is a review gate**: the workbench's
   sweeping-light check fails a face whose terminator breaks into triangles,
   no matter how good the body is.
4. **Shadow palette** — per-material shade tint in glTF extras:
   `"toon": { "shadeTint": [r, g, b] }` (0–1 floats). Cool-shifted per the
   sprite art's own shading. Omitted = the global cool shift in
   `render3d/src/toon.js`. Any other TOON knob (`shadeThreshold`,
   `rimStrength`, `rimColor`, …) may be pinned the same way.
5. **Mouth/eye variants** *(optional — fighters ship without them)* — texture
   swap regions listed in extras, keyed to states (idle, hurt, ult, win).
   Spec'd fully when the first fighter needs them; do not block on this.

What separates a good model, in order of importance — silhouette equals
sprite silhouette (the ghost overlay is the gate), big flat shapes (toon
shading punishes surface noise), color from the canon reference with **no
baked lighting or gradients** (the ramp supplies all shading), **face
first** — is argued in [plan.md §5](plan.md).

### Clip authoring for LIVE playback

Everything in the billboard clip contract, plus (see [plan.md §6](plan.md)):
author **pose-to-pose** like limited animation (strong keys held, fast
breakdowns — on-twos sampling flattens inbetweens, so spend keys on poses);
put the **anticipation inside the startup** and snap to extension exactly at
the beat; **follow through after the beat** into a hold; do NOT bake foot
planting fixes (the engine runs foot IK) or breathing (the engine adds a
shoulder-only breath layer on holds). Optional per clip: **smear frames** —
stretched duplicate geometry at the 1–2 samples before the beat on heavies
and specials, standard anime practice, flagged in the clip's extras.

---

## Where to deliver

**Upload to `render3d/intake/`, never to `render3d/assets/`.** The flow is
[../intake/README.md](../intake/README.md):

```
render3d/intake/<char>/<char>.glb          the fighter: rig, mesh, materials,
                                           and their bespoke clips, embedded
render3d/intake/_shared/library.glb        the shared locomotion/defense clips
render3d/intake/_shared/<archetype>.glb    one normals set per archetype
```

Validate / import / approve with the shared model-intake tool (one validator
for both backends, extended, not forked):

```
node tools/billboard_intake.mjs validate <char> --backend 3d
node tools/billboard_intake.mjs import <char>   --backend 3d
# review in /render3d/workbench/?char=<char>, export the payload, then:
node tools/billboard_intake.mjs apply payload.json --backend 3d
```

Approval is **all-or-nothing per fighter**, decided in the render3d workbench
(sweeping-light face check first, then every clip against its sprite ghost,
at the beat, under the aim crosshair, facing both ways).

### Two models of one fighter

A regeneration does not always win. When a fighter is rebuilt, the model it
replaces is kept beside it as `<char>_alt.glb` and registered under an `alt`
block in the manifest, so the two can be judged against each other on screen
rather than from memory — the workbench's **Compare: Alt GLB** dial stands the
alternate where the drawing usually goes, in the same pose, and the Idle
Review carries the same dial.

```jsonc
"momo": {
  "model": "momo/momo.glb", "heightM": 1.5,
  "renderScale": 1.12, "stanceDeg": 6, "yawOffsetDeg": 60,
  "alt": {
    "model": "momo/momo_alt.glb", "label": "pre-D6 — single-view seed",
    "heightM": 1.5, "renderScale": 1.16, "stanceDeg": 3, "yawOffsetDeg": 60
  }
}
```

**The alternate carries its own numbers, and that is the point.** Size, turn,
stance and head carriage describe one specific .glb — how tall it measures,
how far round it was built, how its legs are planted. Dress an older model in
the current one's corrections and it looks wrong for a reason that has nothing
to do with the model, which is precisely the question the comparison exists to
answer. The review dials follow whichever body is on screen.

### Fixing a foot instead of regenerating a fighter

`tools/blender_fix_foot.py` replaces a malformed foot with a good one. It
works because a generated body is a **patchwork of disconnected shells** —
198 on Mei Mei, 272 on Momo — that overlap rather than share edges, so there
is no continuous surface to cut and nothing to tear: swapping a shell for one
that fills the same space at the ankle is a local edit.

```
<blender> -b -P tools/blender_fix_foot.py -- \
    --in render3d/intake/momo/momo.glb --out render3d/intake/momo/momo.glb \
    --from Right --to Left
```

**Mirroring the fighter's own good foot works. Grafting one from another
generation does not** — both were tried on the same models. The mirror is
clean because everything matches by construction: same density, same texture,
same leg, and the two ankle bones are already mirror images, so reflecting the
geometry and renaming its weight groups puts the foot in the right place *and*
deforms correctly. A cross-model graft has none of that. A foot shell is only
40–50% foot — the rest is shin — so it drags one generation's calf into
another's leg, and since the donor's sole hangs lower it sinks (Maki's feet
landed 8.6 cm and 1.7 cm under the floor, 6.9 cm out of level with each
other). Narrowing the graft to the foot bones' own vertices only trades the
knot for a torn ankle. `--donor` is still there, and it still measures
better; it just does not *look* better, which is the only test that counts.

The mirror plane is the perpendicular bisector of the two ankle bones, never
`x = 0` — these rigs carry a yaw offset and half of them sit off-centre.

**The audit measures feet now**, so this cannot pass unnoticed again: a foot is
longer than it is wide, and the ratio is taken along the foot's own principal
axis (never off the toe bone, which is a 2 cm stub whose direction is noise and
which scores known-good feet as badly as broken ones). Delivered feet run about
2.0; a lump reads about 1.0. Momo's left was **1.05** against her right's 1.98,
and the sweep turned up Sukuna's left at **1.29** against 1.97 — both now 1.98
from their own right foot mirrored over. Maki's are **1.03 / 1.15**: both lumps,
so there is no good foot to copy and nothing a mirror can do. She needs the
generator, not surgery.

### `heightM` is measured, never reviewed

It is read off the .glb at import — **the fighter, not their weapon**. A
separately generated prop hangs off a bone as its own un-skinned mesh, and
counting it recorded Momo at 1.91 m against a canon 1.50 m. On-screen size is
`renderScale / heightM` (blit.js), so all four prop carriers were drawn ~20%
small and the size dial got raised to hide it — a correction sitting on top of
a measurement error. `apply` now drops `heightM` from a payload for the same
reason: a stale export must not be able to reinstate an old height. Re-import
is what changes a height.

---

## The rounds

The roster table (who, at what height, which archetype, which props/chains)
is the billboard file's — one table, not two.

### Round D1 — the pilot: Yuji, complete *(open — draw against this)*

One toon-ready rig and all 26 clips, end to end, before anything else is
commissioned. **If billboard round B1 has delivered Yuji, D1 is that rig plus
the D-spec additions** (shade-bias alpha, outline vertex colors, edited
normals, shade tints); if not, D1 commissions him once and both backends are
served. His 14 locomotion/defense clips seed the shared library, his six
normals seed the unarmed archetype, six identity clips are his alone.

The style call — "does an anime-shaded, live-animated Yuji sit beside 26
sprite fighters without clashing?" — is answered here, on one rig, before the
roster spends anything.

**Deliverable: 1 rig (+ D-spec), 26 clips, to `render3d/intake/yuji/yuji.glb`.**

### Round D2 — the shared library and the archetype sets

Opens when D1's library seeds survive live retargeting review (the workbench
validates onto the extreme proportions: Momo at 150 cm, Hanami at 220).
The 14 shared clips finalized + the five remaining archetype normal sets
(blade, heavy, polearm, caster, bulk — six clips each), authored pose-to-pose
per the live-playback rules above.

**Deliverable: 14 library clips finalized + 30 archetype clips.**

### Round D3 — the standard humanoid rigs

Twenty-two toon-ready rigs (every standard-skeleton fighter except Yuji), in
review-sized batches of four to six, each shipping individually the moment
their set clears approval — per-character fallthrough carries the rest of the
roster on sprites throughout.

**Deliverable: 22 rigs (+ D-spec each) + 132 identity clips.**

### Round D4 — the bespoke bodies

Panda, Hanami (his tree design is retired — no `hanami_alt` variant), Dagon, Kurourushi,
Mahoraga — same order and same override allowance as billboard round B4.

**Deliverable: 5 rigs, 1 material variant, 30 identity clips, ~20 bulk-normal
overrides.**

### Round D5 — spectacle *(opens after D3's first batch)*

The plan's §7/§8-D4 extras that need authored content: smear frames on the
archetype heavies, foreshortened identity moments (ult wind-ups toward the
lens, win-pose orbits — flagged per clip in extras so spectacle never blurs a
hitbox), and state-keyed material variants (Yuji's Sukuna markings during
ult, Yuta's full-meter glow).

### Round D6 — regeneration: the workbench catches *(delivered)*

Every art round has produced a catch round; D6 is this track's, held open so
findings from D1–D5 have a number that is not a new fighter's round. It is
now open, and what it holds is five models that cannot be repaired.

**These are not rigging faults.** A pose can be re-authored, a facing turned, a
skin re-weighted — but a leg that was never reconstructed is not in the file,
and a horn that was invented cannot be un-invented without leaving a hole where
a skull should be. Mei Mei's horns are still there with her hair chain removed
and her chain bones reset to identity; Momo's missing leg is missing mesh, and
the broom standing in its place carries 4201 of skin weight. The only fix is a
new model from a better seed.

**The seed is [DI5](image-requests.md#round-di5--regeneration-seeds-delivered--read-the-verdict-before-generating)**,
which reopens the turnaround board for exactly these fighters and states the
four rules their old boards broke. Do not regenerate from the boards on file:
they are the cause.

| Fighter | Regenerate because | Priority |
|---|---|---|
| `momo` | one leg not reconstructed (51% of a normal leg against the other's 181%); the broom is fused into the body and fragments across it | **first** — visible in every frame she is on screen |
| `meimei` | 5.8% of her stature is invented geometry above her head, read in game as horns; her braid is welded to the skull, so the chain extraction cannot find it | **first** |
| `maki` | one arm at 167% of normal — the polearm is fused into the forearm rather than parented to `Prop_Main`, so the two-handed grip solves onto skin | second |
| `gakuganji` | one arm at 158% — the guitar, same fault as Maki's polearm | second |
| `uro` | legs at 55% of normal and 29% of stature above the head: the proportions the Idle Review kept fighting (she needed 1.26× where the roster needed 1.02×) | second |

`nanami`, `nobara` and `yuji` measure uneven-armed (0.55–0.71) with no fused
prop. Look at them in the workbench's **Mannequin(s)** view before spending
credits — an uneven arm can be a pose, and none of the three reads wrong on
screen today.

#### Delivered — and the seed was never the art

All five rebuilt, all five through the gate. Against the roster's medians
(leg 21.5%, arm 11.3% of a model's own mass):

| Fighter | legs | arms | was |
|---|---|---|---|
| `momo` | **0.98** | 0.75 | 0.29 — "LEG NOT RECONSTRUCTED" |
| `maki` | **0.97** | **0.96** | 0.91 / 0.48 — "ARM NOT RECONSTRUCTED" |
| `gakuganji` | **0.97** | 0.86 | 0.41 / 0.73 — leg *and* arm |
| `uro` | 0.90 | 0.77 | legs at 19% of normal |
| `meimei` | 0.84 | 0.43 | fused arm at 287% of normal; now 151% |

Momo has two legs, Mei Mei has no horns, and Uro's hair finally extracts onto
its chain (3240 verts; the old model had **none** past the threshold). Mei
Mei's arm is the one number still outside the gate — it is her cape weighted
to one side, not a missing limb, and it is down from 287% to 151%.

**The boards were fine. We were feeding them in wrong.** A DI5 board is four
drawings in ONE png, and it was going to the single-image endpoint whole — so
the generator modelled the *picture*: four Momo statues in a row, one skeleton
fitted to one of them and the other three skinned onto her hands. That is the
entire "fused into one arm" signal, on all five, and it is why the first
rebuild measured *identical* to the models it was replacing. The weapon plates
are boards too: four brooms, four axes — which is what "her broom is divided
into many pieces" always was.

`tools/slice_turnaround.py` now cuts a board into its panels and
`tripo_generate.mjs` sends them to the **multiview** endpoint as separate
views (front, left, back; the ¾ panel is dropped, having no slot). Same art,
same round, same credits — one body out instead of four.

**The gate, before approval:** `blender -b -P tools/audit_model_health.py`.
A delivery is refused if any limb is under 70% or over 150% of the roster's
median for that limb, or if geometry sits more than 6% of stature above the
head without a hat to explain it. That check is why this round exists as a
list of measurements rather than a list of opinions — every one of these five
shipped through a facing review, a size review and a stance pass with nobody
noticing.

**THE ATTACH KNOWS WHICH END IS HEAVY, NOT WHICH END IS THE TOP.** `grip` in
`render3d/src/props.js` is measured from the heavy end, and the comment beside
it says why: which end is heavy is measurable and which end is the top is not.
That is true, and it is also a hole in the contract — nothing says which end
points AWAY from the hand, so the attach can seat a weapon perfectly and hand
it over upside down. Maki shipped with her blade at her feet and the butt of
the shaft past her head.

`python3 tools/flip_prop.py --char <key> --apply` turns one end for end by
rewriting a single node's rotation — no geometry, no skin, no texture, no
Blender. It is the STOPGAP. The fix is a tip direction in the prop spec and a
re-attach, and until that lands every newly attached weapon has to be looked
at.

**A REGENERATION IS NOT UNIFORMLY BETTER, AND ONE PART CAN BE MOVED ACROSS.**
Maki's D6 rebuild fixed her limb balance and her fused weapon and broke her
face: a flat plate of hair lands through the middle of it, hiding one eye
behind a hard vertical edge. Her boots came back bulkier than the pair they
replaced. Regenerating again re-rolls the whole body, including the parts that
came out right, so the fix is to move the good parts across —
`python3 tools/graft_model_part.py --donor old.glb --onto new.glb --part head
--part shins --out merged.glb`. She now wears the new body with the old head
and the old lower legs.

A part is defined by the BONES that own it rather than by a box, and it lands
by the two rigs' bind matrices — `bind_recipient(root) @
inverseBind_donor(root)` — so nothing is fitted or guessed. **The seam is the
whole risk**, which is why these two parts and not others: a neck seam sits
inside a collar and a knee seam sits inside a leg. Grafting the foot at the
ANKLE was tried first and tore, because the donor's slimmer boot met the
recipient's bulkier cuff at a change of silhouette; taking the shin with it
moves the join somewhere nothing changes shape.

The donor part keeps its own texture, as its own primitive with its own
material and the donor's image copied in beside it — two models do not share a
UV atlas, and repainting the part into the recipient's is a much larger job.

**The tears are already closed, and they were not a regeneration problem.**
Every delivered model but three arrived with holes in its surface — rims where
the generator ended the mesh instead of guessing at what it could not see from
the boards, most often where a forearm rests against the ribs or one thigh
hides behind the other. They read in game as slits that show the inside of the
body, and the toon pass makes them worse rather than better because the
interior faces light from the wrong side. `python3 tools/fill_model_holes.py`
reports them and `--apply` closes them: 120 tears across 23 rigs. A cap adds
one vertex per rim position and **invents only its texture coordinate** —
position, normal, JOINTS_0 and WEIGHTS_0 are all copied from the rim vertex it
sits on, because a skin weight this tool guessed at would be a vertex that
swims off the body the moment a clip plays, a worse fault than the hole and one
that only shows in motion. The UV is one coordinate for the whole cap, read off
the surviving surface around the hole, so the patch comes out the colour of
what it patches. Closing a rim over its OWN vertices instead — which is what
shipped first — paints the patch out of the wrong part of the sheet, because a
rim is exactly where the atlas is cut: Yuji's hip came out wearing the skin of
his hand. The tool now reports each model's worst cap as a multiple of a normal
triangle's atlas footprint, and refuses to be quiet about anything over 2×; the
version that shipped scored 46×. Rims wider than 26% of the
figure's height are left alone as hems: Momo's skirt and her broom bristles are
open surfaces on purpose, and a cap there is a lid. Re-run it after any
regeneration — a new delivery arrives torn.

**THE WEAPON IS A SEPARATE GENERATION.** Four of the five carry one, and a
weapon drawn in a hand is a weapon the generator fuses into the hand. So each
of them is two generations — the fighter empty-handed, the weapon alone — and
`tools/blender_attach_prop.py` joins them onto `Prop_Main` after conform,
scaling the weapon to its declared `lengthM` and putting its declared `grip`
point in the fist. That step is wired into `tools/build_model.sh`: drop the
weapon at `billboards/intake/<char>/_prop.glb` and the run picks it up.

It costs a second generation per armed fighter and buys three things beyond
the fusion going away: hands that are hands rather than fists moulded round a
shaft, a weapon that can be re-scaled or replaced without re-generating the
fighter, and `Prop_Main` finally carrying real geometry for Maki and
Gakuganji — whose two-handed grip has never engaged because their weapons are
body skin.

**While regenerating, two pipeline fixes ride along:**

- **Strip the stray.** Every one of the 27 delivered files carries an
  unweighted 42-vertex icosphere, 2 m across, from the generator. It is hidden
  so it never drew, but it is in every file and every download.
  `tools/blender_conform.py` now deletes unweighted meshes at conform.
- **A prop must be a prop.** Maki's and Gakuganji's weapons are body skin, not
  `Prop_Main` geometry, which is why the two-handed grip has never engaged for
  either of them. A regenerated model whose weapon is a separate object in the
  seed board can be bound properly at conform.

**Deliverable: 5 rigs, regenerated from DI5 boards, same intake as D3.**

---

## The budget, in one place

| | Rigs | Clips |
|---|---|---|
| D1 — pilot | 1 (or B1's + D-spec) | 26 (shared with B1) |
| D2 — library + archetypes | — | 44 (shared with B2) |
| D3 — standard roster | 22 | 132 (shared with B3) |
| D4 — bespoke bodies | 5 (+1 variant) | ~50 (shared with B4) |
| D5 — spectacle | — | ~20 smears/variants |
| **Total NEW cost if B-rounds deliver** | **D-spec passes only** | **~20** |

The headline: because the two backends read the same rigs and the same clips,
the D-rounds' marginal cost over the B-rounds is the D-spec additions (a
texture-channel pass and a normals pass per rig) plus D5 — not a second
roster. If the B-rounds never run, the D-rounds ARE the commissioning rounds
and the B-numbers retire.
